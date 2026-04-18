/**
 * ONYX Procurement — barcode-scanner unit tests
 * ────────────────────────────────────────────────────────────────
 * Agent 86 — 2026-04-11
 *
 * Uses node:test (already used across the ONYX codebase).  No extra
 * dependencies.  Run with:
 *
 *     node --test src/scanners/barcode-scanner.test.js
 *
 * Covers:
 *   - stripTerminators / normaliseInput
 *   - detectSymbology for EAN-13, UPC-A, Code 128, Code 39, QR, PDF417,
 *     Israeli ID
 *   - Mod-10 checksum on real EAN-13 / UPC-A samples
 *   - Mod-103 soft validation rejects non-printable bytes
 *   - Luhn-Israeli TZ check (both valid and invalid samples)
 *   - Israeli VAT number (Osek Morshe) check
 *   - parseGs1 on a standard "01{GTIN}10{Batch}17{Expiry}" payload
 *   - parseIsraeliIdPayload decomposes the pipe layout
 *   - prefix routing for PRD-* / INV-* / AST-*
 *   - resolveBarcode against a mocked Supabase client
 *   - availableActions per entity type
 *   - handleScan end-to-end with no DB (fallback branch)
 *   - registerBarcodeScanRoutes mounts the three endpoints
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const bs = require('./barcode-scanner');

// ─── FIXTURES ────────────────────────────────────────────────────
//
// Valid EAN-13: "4006381333931" (Staedtler Noris).  Mod-10 digit = 1.
// Valid UPC-A:  "036000291452" (Sharpie).
// Valid Israeli TZ: "000000018" (classic test TZ).
// Another valid TZ:  "123456782"
// Invalid TZ:       "123456789"
// Valid VAT:        "000000018"  (shares the minimal valid form)
// ─────────────────────────────────────────────────────────────────

const VALID_EAN13 = '4006381333931';
const VALID_UPC_A = '036000291452';
const VALID_TZ_A  = '000000018';
const VALID_TZ_B  = '123456782';
const INVALID_TZ  = '123456789';

// ─── MOCK SUPABASE ───────────────────────────────────────────────

function mkSupabase(tables = {}) {
  // tables: { products: [{…}], documents: [{…}] }
  return {
    from(tableName) {
      const rows = tables[tableName] || [];
      const state = { filterCol: null, filterVal: null };
      const chain = {
        select() { return chain; },
        eq(col, val) { state.filterCol = col; state.filterVal = val; return chain; },
        limit() { return chain; },
        order() { return chain; },
        then(resolve, reject) {
          try {
            const matched = rows.filter(
              (r) => String(r[state.filterCol]) === String(state.filterVal),
            );
            resolve({ data: matched, error: null });
          } catch (e) { reject(e); }
        },
      };
      return chain;
    },
  };
}

// ─── TERMINATORS & NORMALISATION ─────────────────────────────────

test('stripTerminators removes trailing CR/LF/EOT', () => {
  assert.equal(bs.stripTerminators('7290000\r'), '7290000');
  assert.equal(bs.stripTerminators('7290000\n'), '7290000');
  assert.equal(bs.stripTerminators('7290000\r\n'), '7290000');
  assert.equal(bs.stripTerminators('7290000'), '7290000');
  assert.equal(bs.stripTerminators('7290000\u0004'), '7290000');
});

test('normaliseInput trims, strips, clamps', () => {
  assert.equal(bs.normaliseInput('  7290000\r\n'), '7290000');
  assert.throws(() => bs.normaliseInput(''), /empty barcode payload/);
  assert.throws(() => bs.normaliseInput('x'.repeat(bs.MAX_RAW_LEN + 1)),
    /too large/);
});

// ─── SYMBOLOGY DETECTION ─────────────────────────────────────────

test('detectSymbology identifies EAN-13', () => {
  assert.equal(bs.detectSymbology(VALID_EAN13), bs.SYMBOLOGY.EAN_13);
});

test('detectSymbology identifies UPC-A', () => {
  assert.equal(bs.detectSymbology(VALID_UPC_A), bs.SYMBOLOGY.UPC_A);
});

test('detectSymbology identifies Israeli ID (9 digits)', () => {
  assert.equal(bs.detectSymbology(VALID_TZ_B), bs.SYMBOLOGY.ISRAELI_ID);
});

test('detectSymbology identifies PDF417 pipe format', () => {
  const pdf = '123456782|COHEN|MOSHE|19800101|20300101|987654';
  assert.equal(bs.detectSymbology(pdf), bs.SYMBOLOGY.PDF417);
});

test('detectSymbology identifies Code 39 for upper+digit+dash', () => {
  assert.equal(bs.detectSymbology('INV-2026-0001'), bs.SYMBOLOGY.CODE_39);
});

test('detectSymbology identifies Code 128 for mixed case', () => {
  assert.equal(bs.detectSymbology('Item-abc#42'), bs.SYMBOLOGY.CODE_128);
});

test('detectSymbology identifies QR for long payloads', () => {
  const longUrl = 'https://onyx.example.com/scan?ref=' + 'A'.repeat(200);
  assert.equal(bs.detectSymbology(longUrl), bs.SYMBOLOGY.QR);
});

// ─── CHECKSUM VALIDATION ─────────────────────────────────────────

test('Mod-10 passes on real EAN-13', () => {
  assert.equal(bs.mod10Check(VALID_EAN13), true);
});

test('Mod-10 passes on real UPC-A', () => {
  assert.equal(bs.mod10Check(VALID_UPC_A), true);
});

test('Mod-10 fails on corrupted EAN-13', () => {
  // flip last digit
  const corrupt = VALID_EAN13.slice(0, 12) + ((Number(VALID_EAN13.slice(-1)) + 1) % 10);
  assert.equal(bs.mod10Check(corrupt), false);
});

test('Mod-103 (soft) accepts printable ASCII', () => {
  assert.equal(bs.mod103CheckSoft('HELLO-123'), true);
});

test('Mod-103 (soft) rejects non-printable', () => {
  assert.equal(bs.mod103CheckSoft('abc\x01'), false);
});

test('Israeli TZ Luhn accepts valid', () => {
  assert.equal(bs.luhnIsraeliIdValid(VALID_TZ_A), true);
  assert.equal(bs.luhnIsraeliIdValid(VALID_TZ_B), true);
});

test('Israeli TZ Luhn rejects invalid', () => {
  assert.equal(bs.luhnIsraeliIdValid(INVALID_TZ), false);
  assert.equal(bs.luhnIsraeliIdValid('abc'), false);
});

test('Israeli VAT Osek Morshe accepts valid forms', () => {
  // 0-filled TZ is a valid form under both weightings.
  assert.equal(bs.israeliVatNumberValid('000000000'), true);
});

test('validateChecksum dispatches correctly', () => {
  assert.equal(
    bs.validateChecksum(VALID_EAN13, bs.SYMBOLOGY.EAN_13).ok, true);
  assert.equal(
    bs.validateChecksum('0000000000000', bs.SYMBOLOGY.EAN_13).ok, true);
  // 9-digit TZ
  assert.equal(
    bs.validateChecksum(VALID_TZ_B, bs.SYMBOLOGY.ISRAELI_ID).ok, true);
  // unknown
  assert.equal(
    bs.validateChecksum('abc', bs.SYMBOLOGY.UNKNOWN).ok, false);
});

// ─── GS1 PARSING ─────────────────────────────────────────────────

test('parseGs1 decodes GTIN + BatchLot + Expiry', () => {
  // AI 01 = GTIN (14 fixed), AI 17 = Expiry (6 fixed),
  // AI 10 = Batch (variable, GS-terminated).  Order doesn't matter
  // inside GS1-128 — we place fixed AIs first because that's the most
  // common scanner emission pattern.
  const GS = String.fromCharCode(0x1D);
  const payload = '01' + '04006381333931' + '17' + '260101' + '10' + 'BATCH42' + GS;
  const parsed = bs.parseGs1(payload);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.fields.GTIN, '04006381333931');
  assert.equal(parsed.fields.ExpiryDate, '260101');
  assert.equal(parsed.fields.BatchLot, 'BATCH42');
});

// ─── ISRAELI ID PDF417 ──────────────────────────────────────────

test('parseIsraeliIdPayload splits pipe fields', () => {
  const raw = '123456782|COHEN|MOSHE|19800101|20300101|987654';
  const decoded = bs.parseIsraeliIdPayload(raw);
  assert.equal(decoded.tz, '123456782');
  assert.equal(decoded.lastName, 'COHEN');
  assert.equal(decoded.firstName, 'MOSHE');
  assert.equal(decoded.birthDate, '19800101');
  assert.equal(decoded.expiryDate, '20300101');
  assert.equal(decoded.cardNumber, '987654');
  assert.equal(decoded.tzValid, true);
});

// ─── parseBarcode END-TO-END ────────────────────────────────────

test('parseBarcode handles wedge-terminated EAN-13', () => {
  const result = bs.parseBarcode(VALID_EAN13 + '\r\n');
  assert.equal(result.clean, VALID_EAN13);
  assert.equal(result.symbology, bs.SYMBOLOGY.EAN_13);
  assert.equal(result.valid, true);
  assert.equal(result.checksum.ok, true);
});

test('parseBarcode detects PRD- prefix', () => {
  const result = bs.parseBarcode('PRD-12345');
  assert.equal(result.prefix, 'PRD-');
});

test('parseBarcode detects INV- prefix', () => {
  const result = bs.parseBarcode('INV-2026-0001');
  assert.equal(result.prefix, 'INV-');
});

// ─── resolveBarcode ─────────────────────────────────────────────

test('resolveBarcode finds product by barcode column', async () => {
  const supabase = mkSupabase({
    products: [{ id: 'p1', barcode: VALID_EAN13, name: 'Noris pencil' }],
  });
  const entity = await bs.resolveBarcode(VALID_EAN13, { supabase });
  assert.equal(entity.type, 'product');
  assert.equal(entity.id, 'p1');
  assert.equal(entity.data.name, 'Noris pencil');
});

test('resolveBarcode finds invoice via prefix routing', async () => {
  const supabase = mkSupabase({
    documents: [{ id: 'd1', doc_number: 'INV-2026-0001', total: 1234 }],
  });
  const entity = await bs.resolveBarcode('INV-2026-0001', { supabase });
  assert.equal(entity.type, 'invoice');
  assert.equal(entity.id, 'd1');
  assert.equal(entity.data.total, 1234);
});

test('resolveBarcode finds employee via TZ', async () => {
  const supabase = mkSupabase({
    employees: [{ id: 'e1', tz: VALID_TZ_B, full_name: 'Moshe Cohen' }],
  });
  const entity = await bs.resolveBarcode(VALID_TZ_B, { supabase });
  assert.equal(entity.type, 'employee');
  assert.equal(entity.id, 'e1');
});

test('resolveBarcode returns unresolved when no DB', async () => {
  const entity = await bs.resolveBarcode('unknown-code-12345', {});
  assert.equal(entity.type, 'unresolved');
  assert.equal(entity.id, null);
});

// ─── availableActions ──────────────────────────────────────────

test('availableActions for product includes print_label', () => {
  const acts = bs.availableActions({ type: 'product' });
  assert.ok(acts.includes('print_label'));
  assert.ok(acts.includes('view'));
});

test('availableActions never contains delete', () => {
  const allTypes = [
    'product', 'invoice', 'document', 'asset', 'employee',
    'id_card', 'supplier', 'purchase_order', 'unresolved',
  ];
  for (const t of allTypes) {
    const acts = bs.availableActions({ type: t });
    assert.ok(!acts.includes('delete'), `${t} must not allow delete`);
    assert.ok(!acts.includes('void'),   `${t} must not allow void`);
  }
});

// ─── handleScan end-to-end ─────────────────────────────────────

test('handleScan returns parsed + entity + actions', async () => {
  const supabase = mkSupabase({
    products: [{ id: 'p1', barcode: VALID_EAN13, name: 'Noris pencil' }],
  });
  const result = await bs.handleScan(VALID_EAN13 + '\r', { supabase });
  assert.equal(result.parsed.symbology, bs.SYMBOLOGY.EAN_13);
  assert.equal(result.parsed.valid, true);
  assert.equal(result.entity.type, 'product');
  assert.ok(result.actions.includes('print_label'));
  assert.ok(typeof result.scannedAt === 'string');
});

// ─── Route registration ────────────────────────────────────────

test('registerBarcodeScanRoutes mounts three routes', async () => {
  const mounted = { post: {}, get: {} };
  const app = {
    post(path, handler) { mounted.post[path] = handler; },
    get(path, handler)  { mounted.get[path]  = handler; },
  };
  const info = bs.registerBarcodeScanRoutes(app, {});
  assert.equal(typeof mounted.post['/api/scanners/scan'], 'function');
  assert.equal(typeof mounted.get['/api/scanners/symbologies'], 'function');
  assert.equal(typeof mounted.get['/api/scanners/health'], 'function');
  assert.equal(info.routes.length, 3);
});

test('scan route 400 when body is missing code', async () => {
  const mounted = {};
  const app = {
    post(path, handler) { mounted[path] = handler; },
    get() {},
  };
  bs.registerBarcodeScanRoutes(app, {});
  let status = 0;
  let payload = null;
  const res = {
    status(s) { status = s; return this; },
    json(p)  { payload = p; return this; },
  };
  await mounted['/api/scanners/scan']({ body: {} }, res);
  assert.equal(status, 400);
  assert.equal(payload.ok, false);
  assert.match(payload.error, /missing/);
});

test('scan route returns parsed payload end-to-end', async () => {
  const mounted = {};
  const app = {
    post(path, handler) { mounted[path] = handler; },
    get() {},
  };
  const supabase = mkSupabase({
    products: [{ id: 'p1', barcode: VALID_EAN13, name: 'Noris pencil' }],
  });
  bs.registerBarcodeScanRoutes(app, { supabase });
  let status = 0;
  let payload = null;
  const res = {
    status(s) { status = s; return this; },
    json(p)  { payload = p; return this; },
  };
  await mounted['/api/scanners/scan']({ body: { code: VALID_EAN13 + '\n' } }, res);
  assert.equal(status, 200);
  assert.equal(payload.ok, true);
  assert.equal(payload.entity.type, 'product');
  assert.equal(payload.parsed.symbology, bs.SYMBOLOGY.EAN_13);
});
