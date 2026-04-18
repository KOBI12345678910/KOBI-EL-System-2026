/**
 * Unit tests for src/payments/qr-payment.js
 * Agent-87 — Wave 2 — 2026-04-11
 *
 * Run:
 *   node --test src/payments/qr-payment.test.js
 *
 * Strategy:
 *   - QR encoder: verify structure, dimensions, version selection, mode
 *     detection, and bit-level correctness with the well-known CRC16/CCITT
 *     test vector for EMV.
 *   - SVG / PNG renderers: verify format headers and that the module count
 *     matches the matrix.
 *   - EMV / EPC / Bit builders: verify expected tags, CRC presence, and
 *     round-trip parsing.
 *   - Payment-link store: create/view/pay/expire lifecycle on the in-mem
 *     store so tests run hermetically.
 *   - Express routes: fake express app collects handlers; tests invoke
 *     them with in-memory req/res stubs.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const mod = require('./qr-payment');

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

function fakeApp() {
  const routes = {};
  const reg = (method) => (path, handler) => {
    routes[`${method.toUpperCase()} ${path}`] = handler;
  };
  return {
    routes,
    get: reg('get'),
    post: reg('post'),
    put: reg('put'),
    delete: reg('delete'),
    async call(method, path, { params = {}, query = {}, body = {} } = {}) {
      const key = `${method.toUpperCase()} ${path}`;
      const handler = routes[key];
      if (!handler) throw new Error(`No route ${key}`);
      const req = { params, query, body };
      const res = {
        statusCode: 200,
        headers: {},
        body: undefined,
        status(code) { this.statusCode = code; return this; },
        json(obj) { this.body = obj; return this; },
        send(txt) { this.body = txt; return this; },
        setHeader(k, v) { this.headers[k] = v; return this; },
      };
      await handler(req, res);
      return res;
    },
  };
}

// Parse an EMV QR string into {tagId: value} pairs (flat, not nested).
function parseEmv(s) {
  const out = {};
  let i = 0;
  while (i < s.length) {
    const id = s.slice(i, i + 2);
    const len = parseInt(s.slice(i + 2, i + 4), 10);
    const val = s.slice(i + 4, i + 4 + len);
    out[id] = val;
    i += 4 + len;
  }
  return out;
}

// --------------------------------------------------------------------------
// QR encoder
// --------------------------------------------------------------------------

test('generateQrMatrix: numeric mode at v1 for short digits', () => {
  const q = mod.generateQrMatrix('12345', { ecl: 'M' });
  assert.equal(q.size, 21);
  assert.equal(q.version, 1);
  assert.equal(q.mode, mod.MODE_NUMERIC);
  assert.equal(q.matrix.length, 21);
  assert.equal(q.matrix[0].length, 21);
});

test('generateQrMatrix: alphanumeric for upper + digits + $%*', () => {
  const q = mod.generateQrMatrix('HELLO WORLD', { ecl: 'M' });
  assert.equal(q.mode, mod.MODE_ALPHA);
  assert.ok(q.version >= 1 && q.version <= 40);
});

test('generateQrMatrix: byte mode for lowercase / URL', () => {
  const q = mod.generateQrMatrix('https://example.com/pay/abc');
  assert.equal(q.mode, mod.MODE_BYTE);
});

test('generateQrMatrix: version grows with payload length', () => {
  const short = mod.generateQrMatrix('X');
  const med = mod.generateQrMatrix('X'.repeat(200));
  const big = mod.generateQrMatrix('X'.repeat(800));
  assert.ok(short.version < med.version);
  assert.ok(med.version < big.version);
  assert.ok(big.version <= 40);
});

test('generateQrMatrix: throws for empty input', () => {
  assert.throws(() => mod.generateQrMatrix(''), /empty/);
});

test('generateQrMatrix: rejects unknown ECL', () => {
  assert.throws(() => mod.generateQrMatrix('x', { ecl: 'Z' }), /ECL/);
});

test('generateQrMatrix: each ECL produces a valid matrix', () => {
  for (const ecl of ['L', 'M', 'Q', 'H']) {
    const q = mod.generateQrMatrix('onyx.pay', { ecl });
    assert.equal(q.ecl, ecl);
    assert.equal(q.matrix.length, q.size);
    // confirm all cells are 0 or 1
    for (const row of q.matrix) {
      for (const cell of row) assert.ok(cell === 0 || cell === 1);
    }
  }
});

test('generateQrMatrix: finder patterns present in three corners', () => {
  const q = mod.generateQrMatrix('abc');
  const m = q.matrix;
  // top-left finder core (2..4 inclusive)
  for (let r = 2; r <= 4; r++) for (let c = 2; c <= 4; c++) assert.equal(m[r][c], 1);
  // top-right
  for (let r = 2; r <= 4; r++) for (let c = q.size - 5; c <= q.size - 3; c++) assert.equal(m[r][c], 1);
  // bottom-left
  for (let r = q.size - 5; r <= q.size - 3; r++) for (let c = 2; c <= 4; c++) assert.equal(m[r][c], 1);
});

// --------------------------------------------------------------------------
// Renderers
// --------------------------------------------------------------------------

test('renderSvg: produces well-formed SVG with correct viewBox', () => {
  const q = mod.generateQrMatrix('svg test');
  const svg = mod.renderSvg(q, { scale: 4, margin: 4 });
  assert.match(svg, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
  assert.match(svg, /<svg /);
  assert.match(svg, /<\/svg>$/);
  const expectedSize = (q.size + 8) * 4;
  assert.match(svg, new RegExp(`viewBox="0 0 ${expectedSize} ${expectedSize}"`));
});

test('renderSvg: rect count equals number of dark modules', () => {
  const q = mod.generateQrMatrix('abc');
  const svg = mod.renderSvg(q);
  const rectCount = (svg.match(/<rect /g) || []).length;
  // background rect + dark modules
  let dark = 0;
  for (const row of q.matrix) for (const c of row) if (c) dark += 1;
  assert.equal(rectCount, dark + 1);
});

test('renderSvg: custom colours appear in output', () => {
  const q = mod.generateQrMatrix('xyz');
  const svg = mod.renderSvg(q, { dark: '#112233', light: '#ffffee' });
  assert.match(svg, /#112233/);
  assert.match(svg, /#ffffee/);
});

test('renderSvg: title when supplied', () => {
  const q = mod.generateQrMatrix('xyz');
  const svg = mod.renderSvg(q, { title: 'Invoice 42' });
  assert.match(svg, /<title>Invoice 42<\/title>/);
});

test('renderPngBuffer: emits valid PNG signature + IEND', () => {
  const q = mod.generateQrMatrix('png test');
  const buf = mod.renderPngBuffer(q, { scale: 3, margin: 2 });
  assert.ok(Buffer.isBuffer(buf));
  // PNG magic bytes
  assert.equal(buf.slice(0, 8).toString('hex'), '89504e470d0a1a0a');
  // IEND at the end: 49 45 4e 44
  const last = buf.slice(-8, -4).toString('ascii');
  assert.equal(last, 'IEND');
});

// --------------------------------------------------------------------------
// EMV / EPC / Bit builders
// --------------------------------------------------------------------------

test('crc16Ccitt: known ISO test vector 123456789 → 0x29B1', () => {
  const v = mod.crc16Ccitt(Buffer.from('123456789', 'ascii'));
  assert.equal(v, 0x29b1);
});

test('buildEmvQrText: minimal static QR has correct tags and CRC', () => {
  const s = mod.buildEmvQrText({ merchantName: 'ONYX Cafe', merchantCity: 'Tel Aviv' });
  // starts with 0001 (payload format indicator) and ends with 6304<crc>
  assert.match(s, /^000201/);
  assert.match(s, /6304[0-9A-F]{4}$/);
  // parse top-level
  const tlv = parseEmv(s);
  assert.equal(tlv['53'], '376'); // currency ILS
  assert.equal(tlv['58'], 'IL');
  assert.equal(tlv['59'], 'ONYX Cafe');
  assert.equal(tlv['60'], 'Tel Aviv');
});

test('buildEmvQrText: dynamic QR (with amount) switches indicator', () => {
  const s = mod.buildEmvQrText({ merchantName: 'X', merchantCity: 'Y', amount: 99.9 });
  const tlv = parseEmv(s);
  assert.equal(tlv['01'], '12'); // dynamic
  assert.equal(tlv['54'], '99.90');
});

test('buildEmvQrText: reference is embedded under tag 62 subtag 05', () => {
  const s = mod.buildEmvQrText({ merchantName: 'X', merchantCity: 'Y', reference: 'INV-555' });
  const tlv = parseEmv(s);
  assert.ok(tlv['62'].includes('05' + String('INV-555'.length).padStart(2, '0') + 'INV-555'));
});

test('buildEmvQrText: CRC validates self-consistently', () => {
  const s = mod.buildEmvQrText({ merchantName: 'X', merchantCity: 'Y' });
  const body = s.slice(0, -4);
  const supplied = s.slice(-4);
  const recomputed = mod.crc16Ccitt(Buffer.from(body, 'ascii')).toString(16).toUpperCase().padStart(4, '0');
  assert.equal(supplied, recomputed);
});

test('buildEmvQrText: requires merchantName', () => {
  assert.throws(() => mod.buildEmvQrText({}), /merchantName/);
});

test('buildEpcQrText: EPC layout matches SEPA spec', () => {
  const text = mod.buildEpcQrText({
    iban: 'DE89370400440532013000',
    amount: 100,
    reference: 'RF18539007547034',
    beneficiaryName: 'Franz Mustermann',
  });
  const lines = text.split('\n');
  assert.equal(lines[0], 'BCD');
  assert.equal(lines[1], '002');
  assert.equal(lines[2], '1');
  assert.equal(lines[3], 'SCT');
  assert.equal(lines[5], 'Franz Mustermann');
  assert.equal(lines[6], 'DE89370400440532013000');
  assert.equal(lines[7], 'EUR100.00');
});

test('buildEpcQrText: requires iban + beneficiary', () => {
  assert.throws(() => mod.buildEpcQrText({ iban: 'DE123' }), /beneficiary/i);
  assert.throws(() => mod.buildEpcQrText({ beneficiaryName: 'A' }), /iban/i);
});

test('buildBitPayload: emits deeplink + JSON', () => {
  const p = mod.buildBitPayload('050-123-4567', 45.50, 'Pizza');
  assert.match(p.deeplink, /^bit:\/\/pay\?phone=0501234567/);
  const parsed = JSON.parse(p.json);
  assert.equal(parsed.phone, '0501234567');
  assert.equal(parsed.amount, '45.50');
  assert.equal(parsed.currency, 'ILS');
});

test('buildBitPayload: rejects empty phone', () => {
  assert.throws(() => mod.buildBitPayload('', 10, 'x'), /phoneNumber/);
});

// --------------------------------------------------------------------------
// High-level helpers
// --------------------------------------------------------------------------

test('generatePaymentQR: returns text + svg + matrix', () => {
  const r = mod.generatePaymentQR(150, 'Invoice 777', {
    merchantName: 'Techno Kol Uzi', reference: 'INV777',
  });
  assert.ok(r.text.startsWith('0002'));
  assert.match(r.svg, /<svg /);
  assert.ok(Array.isArray(r.matrix));
});

test('generateBitQR: returns deeplink and svg', () => {
  const r = mod.generateBitQR('0501234567', 20, 'Coffee');
  assert.ok(r.deeplink.startsWith('bit://'));
  assert.match(r.svg, /<svg /);
});

test('generateIbanQR: returns text and svg', () => {
  const r = mod.generateIbanQR('DE89370400440532013000', 100, 'RF1', 'Max');
  assert.match(r.text, /^BCD\n002\n1\nSCT/);
  assert.match(r.svg, /<svg /);
});

test('generateEmvQR: pass-through builder', () => {
  const r = mod.generateEmvQR(
    { name: 'Kiosk', id: 'K1', city: 'Haifa' },
    12.5, '376', 'REF1',
  );
  const tlv = parseEmv(r.text);
  assert.equal(tlv['54'], '12.50');
});

// --------------------------------------------------------------------------
// Payment-link store lifecycle
// --------------------------------------------------------------------------

test('generatePaymentLink: creates stored record with defaults', async () => {
  const store = mod.createPaymentLinkStore();
  const link = await mod.generatePaymentLink(200, 'Consult', { store });
  assert.ok(link.id);
  assert.ok(link.shortCode);
  assert.match(link.url, /\/pay\//);
  assert.equal(link.status, 'created');
  const rec = await store.getById(link.id);
  assert.equal(rec.amount, 200);
  assert.equal(rec.currency, 'ILS');
  // default 48h expiry
  const diff = new Date(rec.expires_at).getTime() - new Date(rec.created_at).getTime();
  assert.ok(Math.abs(diff - 48 * 60 * 60 * 1000) < 2000);
});

test('generatePaymentLink: rejects missing amount', async () => {
  await assert.rejects(() => mod.generatePaymentLink(undefined, 'x'));
});

test('generatePaymentLink: custom expiry honoured', async () => {
  const store = mod.createPaymentLinkStore();
  const link = await mod.generatePaymentLink(50, 'Quick', {
    store,
    expiryMs: 60_000,
  });
  const rec = await store.getById(link.id);
  const diff = new Date(rec.expires_at).getTime() - new Date(rec.created_at).getTime();
  assert.ok(Math.abs(diff - 60_000) < 2000);
});

test('generatePaymentLink: emv qrPayload mode embeds merchant info', async () => {
  const store = mod.createPaymentLinkStore();
  const link = await mod.generatePaymentLink(42, 'test', {
    store,
    qrPayload: 'emv',
    merchantId: 'TEST01',
    merchantCity: 'Haifa',
    recipient: 'ACME',
    reference: 'R1',
  });
  // EMV text starts with 000201
  assert.ok(link.qr.text.startsWith('0002'));
});

test('markSent → markViewed → markPaid: correct state transitions', async () => {
  const store = mod.createPaymentLinkStore();
  const link = await mod.generatePaymentLink(99, 't', { store });
  let rec = await mod.markSent(store, link.id);
  assert.equal(rec.status, 'sent');
  rec = await mod.markViewed(store, link.id);
  assert.equal(rec.status, 'viewed');
  rec = await mod.markPaid(store, link.id, { paidAmount: 99, paidTxnRef: 'TXN-1' });
  assert.equal(rec.status, 'paid');
  assert.equal(rec.paid_amount, 99);
  assert.equal(rec.paid_txn_ref, 'TXN-1');
});

test('markViewed: idempotent on paid links', async () => {
  const store = mod.createPaymentLinkStore();
  const link = await mod.generatePaymentLink(99, 't', { store });
  await mod.markPaid(store, link.id);
  const rec = await mod.markViewed(store, link.id);
  assert.equal(rec.status, 'paid');
});

test('markViewed: marks expired when past expiry', async () => {
  const store = mod.createPaymentLinkStore();
  const link = await mod.generatePaymentLink(10, 't', {
    store,
    expiryMs: 1,
  });
  await new Promise((r) => setTimeout(r, 5));
  const rec = await mod.markViewed(store, link.id);
  assert.equal(rec.status, 'expired');
});

test('sweepExpired: flips stale non-paid links to expired', async () => {
  const store = mod.createPaymentLinkStore();
  const a = await mod.generatePaymentLink(10, 'a', { store, expiryMs: 1 });
  const b = await mod.generatePaymentLink(20, 'b', { store, expiryMs: 9e9 });
  const c = await mod.generatePaymentLink(30, 'c', { store, expiryMs: 1 });
  await mod.markPaid(store, c.id);
  await new Promise((r) => setTimeout(r, 10));
  const n = await mod.sweepExpired(store);
  assert.equal(n, 1);
  assert.equal((await store.getById(a.id)).status, 'expired');
  assert.equal((await store.getById(b.id)).status, 'created');
  assert.equal((await store.getById(c.id)).status, 'paid');
});

// --------------------------------------------------------------------------
// Express routes (with fake app)
// --------------------------------------------------------------------------

test('mountRoutes: POST /api/payments/links creates record', async () => {
  const app = fakeApp();
  const store = mod.createPaymentLinkStore();
  mod.mountRoutes(app, { store });
  const res = await app.call('POST', '/api/payments/links', {
    body: { amount: 123, description: 'Test', recipient: 'Acme' },
  });
  assert.equal(res.statusCode, 201);
  assert.ok(res.body.id);
  assert.ok(res.body.qr.svg.includes('<svg '));
});

test('mountRoutes: POST /api/payments/links validates amount', async () => {
  const app = fakeApp();
  mod.mountRoutes(app, { store: mod.createPaymentLinkStore() });
  const res = await app.call('POST', '/api/payments/links', { body: {} });
  assert.equal(res.statusCode, 400);
});

test('mountRoutes: GET /api/payments/links/:shortCode marks viewed', async () => {
  const app = fakeApp();
  const store = mod.createPaymentLinkStore();
  mod.mountRoutes(app, { store });
  const created = await app.call('POST', '/api/payments/links', { body: { amount: 15 } });
  const { shortCode } = created.body;
  const get = await app.call('GET', '/api/payments/links/:shortCode', { params: { shortCode } });
  assert.equal(get.statusCode, 200);
  assert.equal(get.body.shortCode, shortCode);
  // status should have advanced to viewed
  const rec = await store.getByShort(shortCode);
  assert.equal(rec.status, 'viewed');
});

test('mountRoutes: GET /api/payments/links/:id/qr.svg returns SVG', async () => {
  const app = fakeApp();
  const store = mod.createPaymentLinkStore();
  mod.mountRoutes(app, { store });
  const created = await app.call('POST', '/api/payments/links', { body: { amount: 15 } });
  const res = await app.call('GET', '/api/payments/links/:id/qr.svg', { params: { id: created.body.id } });
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['Content-Type'], 'image/svg+xml');
  assert.match(res.body, /<svg /);
});

test('mountRoutes: POST /api/payments/links/:id/mark-paid advances status', async () => {
  const app = fakeApp();
  const store = mod.createPaymentLinkStore();
  mod.mountRoutes(app, { store });
  const created = await app.call('POST', '/api/payments/links', { body: { amount: 77 } });
  const res = await app.call('POST', '/api/payments/links/:id/mark-paid', {
    params: { id: created.body.id },
    body: { paidAmount: 77, paidTxnRef: 'X1' },
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.status, 'paid');
  assert.equal(res.body.paid_amount, 77);
});

test('mountRoutes: GET /pay/:code renders HTML when valid', async () => {
  const app = fakeApp();
  const store = mod.createPaymentLinkStore();
  mod.mountRoutes(app, { store });
  const created = await app.call('POST', '/api/payments/links', { body: { amount: 42, description: 'Thing' } });
  const res = await app.call('GET', '/pay/:code', { params: { code: created.body.shortCode } });
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['Content-Type'], 'text/html; charset=utf-8');
  assert.match(res.body, /<svg /);
  assert.match(res.body, /ONYX Pay/);
});

test('mountRoutes: GET /pay/:code 404 when unknown', async () => {
  const app = fakeApp();
  mod.mountRoutes(app, { store: mod.createPaymentLinkStore() });
  const res = await app.call('GET', '/pay/:code', { params: { code: 'NOPE' } });
  assert.equal(res.statusCode, 404);
});

test('mountRoutes: GET /pay/:code 410 when expired', async () => {
  const app = fakeApp();
  const store = mod.createPaymentLinkStore();
  mod.mountRoutes(app, { store });
  const link = await mod.generatePaymentLink(10, 't', { store, expiryMs: 1 });
  await new Promise((r) => setTimeout(r, 5));
  const res = await app.call('GET', '/pay/:code', { params: { code: link.shortCode } });
  assert.equal(res.statusCode, 410);
});

// --------------------------------------------------------------------------
// Constants / exports
// --------------------------------------------------------------------------

test('exports: STATUS constants are frozen', () => {
  assert.equal(mod.STATUS.CREATED, 'created');
  assert.equal(mod.STATUS.PAID, 'paid');
  assert.throws(() => { mod.STATUS.CREATED = 'x'; });
});

test('exports: PAYMENT_LINKS_SQL contains table definition', () => {
  assert.match(mod.PAYMENT_LINKS_SQL, /CREATE TABLE IF NOT EXISTS payment_links/);
  assert.match(mod.PAYMENT_LINKS_SQL, /short_code/);
});

test('exports: DEFAULT_EXPIRY_MS is 48 hours', () => {
  assert.equal(mod.DEFAULT_EXPIRY_MS, 48 * 60 * 60 * 1000);
});
