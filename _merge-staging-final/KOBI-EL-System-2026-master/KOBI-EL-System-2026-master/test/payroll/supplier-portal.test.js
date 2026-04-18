/**
 * supplier-portal.test.js — Agent X-29 / Swarm 3B
 * ═══════════════════════════════════════════════════════════════════
 * Self-contained unit tests for onyx-procurement/src/supplier-portal/
 * portal-engine.js. Zero external test framework — pure node:test.
 *
 * Run:
 *   node --test test/payroll/supplier-portal.test.js
 *
 * Coverage goal: 20+ assertions across every engine capability.
 * Covers: magic link happy/sad paths, JWT sign/verify, rate limiting,
 *         PO isolation, acknowledge, ASN, invoice, invoice 3-way match,
 *         certification upload + AV, payment history, contact update,
 *         tax clarifications, audit log, CSRF, never-delete semantics,
 *         file upload validation (mime, size, path-traversal).
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const enginePath = path.resolve(
  __dirname,
  '..',
  '..',
  'onyx-procurement',
  'src',
  'supplier-portal',
  'portal-engine.js',
);

const {
  createPortalEngine,
  createInMemoryRepo,
  validateUpload,
  jwtSign,
  jwtVerify,
  hmacSign,
  isValidEmail,
  safeEqual,
  constants,
} = require(enginePath);

// ─────────────────────────────────────────────────────────────────
// helpers
// ─────────────────────────────────────────────────────────────────

function seedEngine(opts = {}) {
  const sent = [];
  const repo = createInMemoryRepo();
  repo.addSupplier({
    id: 'sup_001',
    name: 'Acme Metals Ltd',
    nameHe: 'אקמי מתכות בע״מ',
    email: 'vendor@acme.test',
    contactName: 'Alice',
    phone: '03-0000000',
  });
  repo.addSupplier({
    id: 'sup_002',
    name: 'Beta Parts',
    nameHe: 'בטא חלפים',
    email: 'orders@beta.test',
  });
  repo.addPO({
    id: 'po_100',
    poNumber: 'PO-2026-100',
    supplierId: 'sup_001',
    orderDate: '2026-03-01',
    total: 10000,
    currency: 'ILS',
    status: 'open',
  });
  repo.addPO({
    id: 'po_101',
    poNumber: 'PO-2026-101',
    supplierId: 'sup_001',
    orderDate: '2026-03-02',
    total: 5000,
    currency: 'ILS',
    status: 'open',
  });
  repo.addPO({
    id: 'po_200',
    poNumber: 'PO-2026-200',
    supplierId: 'sup_002',
    orderDate: '2026-03-10',
    total: 2500,
    currency: 'ILS',
    status: 'open',
  });
  repo.addPayment({
    id: 'pay_1',
    supplierId: 'sup_001',
    poId: 'po_099',
    amount: 4200,
    currency: 'ILS',
    paidAt: '2026-02-15',
    reference: 'BANK-123',
  });
  const engine = createPortalEngine({
    secret: 'unit-test-secret-32-bytes-random-xyz',
    repo,
    sendEmail: async (to, subject, body) => {
      sent.push({ to, subject, body });
    },
    ...opts,
  });
  return { engine, repo, sent };
}

// ═══════════════════════════════════════════════════════════════════════
//  TESTS
// ═══════════════════════════════════════════════════════════════════════

test('01 — isValidEmail sanity', () => {
  assert.equal(isValidEmail('a@b.co'), true);
  assert.equal(isValidEmail('not-an-email'), false);
  assert.equal(isValidEmail(''), false);
  assert.equal(isValidEmail(null), false);
});

test('02 — safeEqual constant-time', () => {
  assert.equal(safeEqual('abc', 'abc'), true);
  assert.equal(safeEqual('abc', 'abd'), false);
  assert.equal(safeEqual('abc', 'abcd'), false);
  assert.equal(safeEqual(null, 'abc'), false);
});

test('03 — jwtSign/jwtVerify roundtrip', () => {
  const secret = 'test-secret';
  const token = jwtSign({ supplierId: 'sup_001', role: 'supplier' }, secret, 60_000);
  const payload = jwtVerify(token, secret);
  assert.ok(payload, 'payload returned');
  assert.equal(payload.supplierId, 'sup_001');
  assert.equal(payload.role, 'supplier');
  assert.equal(typeof payload.iat, 'number');
  assert.equal(typeof payload.exp, 'number');
});

test('04 — jwtVerify rejects tampered signature', () => {
  const token = jwtSign({ a: 1 }, 'secret');
  const parts = token.split('.');
  parts[2] = parts[2].slice(0, -1) + (parts[2].slice(-1) === 'A' ? 'B' : 'A');
  const tampered = parts.join('.');
  assert.equal(jwtVerify(tampered, 'secret'), null);
});

test('05 — jwtVerify rejects wrong secret', () => {
  const token = jwtSign({ a: 1 }, 'one');
  assert.equal(jwtVerify(token, 'two'), null);
});

test('06 — jwtVerify rejects expired token', () => {
  const token = jwtSign({ a: 1 }, 's', -1000); // already expired
  assert.equal(jwtVerify(token, 's'), null);
});

test('07 — requestMagicLink for unknown email is silent', async () => {
  const { engine, sent } = seedEngine();
  const r = await engine.requestMagicLink('nobody@nowhere.test');
  assert.equal(r, undefined);
  assert.equal(sent.length, 0);
  const audit = engine.getAuditLog(null, { action: 'magic_link_unknown_email' });
  assert.equal(audit.length, 1);
});

test('08 — requestMagicLink happy path sends email & issues token', async () => {
  const { engine, sent } = seedEngine();
  const r = await engine.requestMagicLink('vendor@acme.test');
  assert.ok(r && r._testToken, 'token returned for tests');
  assert.equal(sent.length, 1);
  assert.match(sent[0].body, /vendor@acme\.test|Techno-Kol|פורטל/);
});

test('09 — requestMagicLink rejects invalid email', async () => {
  const { engine } = seedEngine();
  await assert.rejects(() => engine.requestMagicLink('not-an-email'), /Invalid email/);
});

test('10 — requestMagicLink rate-limits', async () => {
  const { engine } = seedEngine();
  for (let i = 0; i < constants.RATE_LIMIT_MAX; i++) {
    await engine.requestMagicLink('vendor@acme.test', { ip: '1.2.3.4' });
  }
  await assert.rejects(
    () => engine.requestMagicLink('vendor@acme.test', { ip: '1.2.3.4' }),
    /Rate limit/,
  );
});

test('11 — verifyMagicLink returns a session and is single-use', async () => {
  const { engine } = seedEngine();
  const r = await engine.requestMagicLink('vendor@acme.test');
  const session = await engine.verifyMagicLink(r._testToken);
  assert.equal(session.supplierId, 'sup_001');
  assert.ok(session.token, 'jwt token');
  assert.ok(session.csrf, 'csrf token');
  // Replay must fail
  await assert.rejects(
    () => engine.verifyMagicLink(r._testToken),
    /already used|expired/,
  );
});

test('12 — verifyMagicLink rejects expired token', async () => {
  let fakeNow = 1_700_000_000_000;
  const { engine } = seedEngine({ now: () => fakeNow });
  const r = await engine.requestMagicLink('vendor@acme.test');
  fakeNow += constants.MAGIC_LINK_TTL_MS + 1;
  await assert.rejects(() => engine.verifyMagicLink(r._testToken), /expired|Invalid/);
});

test('13 — verifySession + verifyCsrf', async () => {
  const { engine } = seedEngine();
  const session = engine.createSession('sup_001');
  const decoded = engine.verifySession(session.token);
  assert.ok(decoded);
  assert.equal(decoded.supplierId, 'sup_001');
  assert.equal(engine.verifyCsrf(decoded, session.csrf), true);
  assert.equal(engine.verifyCsrf(decoded, 'wrong'), false);
});

test('14 — listOpenPOs scoped to supplier', () => {
  const { engine } = seedEngine();
  const open1 = engine.listOpenPOs('sup_001');
  const open2 = engine.listOpenPOs('sup_002');
  assert.equal(open1.length, 2);
  assert.equal(open2.length, 1);
  for (const po of open1) assert.equal(po.supplierId, 'sup_001');
  for (const po of open2) assert.equal(po.supplierId, 'sup_002');
});

test('15 — listOpenPOs rejects unknown supplier', () => {
  const { engine } = seedEngine();
  assert.throws(() => engine.listOpenPOs('sup_ghost'), /Supplier not found/);
});

test('16 — acknowledgePO happy path', () => {
  const { engine, repo } = seedEngine();
  engine.acknowledgePO('sup_001', 'po_100', '2026-05-01');
  const po = repo.getPO('po_100');
  assert.equal(po.acknowledged, true);
  assert.equal(po.status, 'acknowledged');
  assert.match(po.promiseDate, /^2026-05-01/);
});

test('17 — acknowledgePO forbidden cross-supplier', () => {
  const { engine } = seedEngine();
  // sup_002 tries to ack sup_001's PO
  assert.throws(
    () => engine.acknowledgePO('sup_002', 'po_100', '2026-05-01'),
    /PO not found/,
  );
});

test('18 — acknowledgePO validates promise date', () => {
  const { engine } = seedEngine();
  assert.throws(
    () => engine.acknowledgePO('sup_001', 'po_100', 'not-a-date'),
    /Invalid promiseDate/,
  );
});

test('19 — submitASN creates record and audit entry', () => {
  const { engine } = seedEngine();
  const asnId = engine.submitASN('sup_001', {
    poId: 'po_100',
    shippedAt: '2026-04-20',
    carrier: 'DHL',
    trackingNumber: 'TRK-999',
  });
  assert.match(asnId, /^asn_/);
  const audit = engine.getAuditLog('sup_001', { action: 'asn_submitted' });
  assert.equal(audit.length, 1);
});

test('20 — submitASN rejects foreign PO', () => {
  const { engine } = seedEngine();
  assert.throws(
    () => engine.submitASN('sup_002', {
      poId: 'po_100',
      shippedAt: '2026-04-20',
    }),
    /PO not found/,
  );
});

test('21 — submitInvoice happy path', () => {
  const { engine } = seedEngine();
  const id = engine.submitInvoice('sup_001', {
    poId: 'po_100',
    invoiceNumber: 'INV-001',
    amount: 9500,
    currency: 'ILS',
    issuedAt: '2026-04-10',
  });
  assert.match(id, /^inv_/);
  const audit = engine.getAuditLog('sup_001', { action: 'invoice_submitted' });
  assert.equal(audit.length, 1);
});

test('22 — submitInvoice rejects 3-way-match exceedance', () => {
  const { engine } = seedEngine();
  assert.throws(
    () => engine.submitInvoice('sup_001', {
      poId: 'po_100',
      invoiceNumber: 'INV-002',
      amount: 20000, // 2x PO total
      currency: 'ILS',
      issuedAt: '2026-04-10',
    }),
    /exceeds PO tolerance/,
  );
});

test('23 — submitInvoice rejects non-positive amount', () => {
  const { engine } = seedEngine();
  assert.throws(
    () => engine.submitInvoice('sup_001', {
      poId: 'po_100',
      invoiceNumber: 'INV-003',
      amount: 0,
      currency: 'ILS',
      issuedAt: '2026-04-10',
    }),
    /amount must be > 0/,
  );
});

test('24 — submitInvoice validates attached file', () => {
  const { engine } = seedEngine();
  assert.throws(
    () => engine.submitInvoice('sup_001', {
      poId: 'po_100',
      invoiceNumber: 'INV-004',
      amount: 100,
      currency: 'ILS',
      issuedAt: '2026-04-10',
      file: { filename: 'bad.exe', mimeType: 'application/octet-stream', size: 10 },
    }),
    /mime type not allowed/,
  );
});

test('25 — uploadCertification validates all fields + file', () => {
  const { engine } = seedEngine();
  const id = engine.uploadCertification('sup_001', {
    certType: 'ISO 9001',
    issuer: 'SII',
    validUntil: '2028-01-01',
    file: {
      filename: 'iso.pdf',
      mimeType: 'application/pdf',
      size: 1024,
      content: 'pdf body',
    },
  });
  assert.match(id, /^cert_/);
  assert.throws(
    () => engine.uploadCertification('sup_001', {
      certType: 'ISO 9001',
      issuer: 'SII',
      validUntil: '2028-01-01',
    }),
    /file required/,
  );
});

test('26 — uploadCertification blocks EICAR virus stub', () => {
  const { engine } = seedEngine();
  assert.throws(
    () => engine.uploadCertification('sup_001', {
      certType: 'ISO 9001',
      issuer: 'SII',
      validUntil: '2028-01-01',
      file: {
        filename: 'test.pdf',
        mimeType: 'application/pdf',
        size: 68,
        content: 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE',
      },
    }),
    /virus detected/,
  );
});

test('27 — validateUpload rejects path-traversal filename', () => {
  assert.throws(
    () => validateUpload({
      filename: '../../etc/passwd',
      mimeType: 'text/plain',
      size: 100,
    }),
    /path separators/,
  );
});

test('28 — validateUpload enforces size cap', () => {
  assert.throws(
    () => validateUpload({
      filename: 'big.pdf',
      mimeType: 'application/pdf',
      size: constants.MAX_UPLOAD_BYTES + 1,
    }),
    /too large/,
  );
});

test('29 — getPaymentHistory scoped and audited', () => {
  const { engine } = seedEngine();
  const hist = engine.getPaymentHistory('sup_001');
  assert.equal(hist.length, 1);
  assert.equal(hist[0].reference, 'BANK-123');
  // sup_002 sees nothing
  const hist2 = engine.getPaymentHistory('sup_002');
  assert.equal(hist2.length, 0);
  const audits = engine.getAuditLog('sup_001', { action: 'payment_history_viewed' });
  assert.equal(audits.length, 1);
});

test('30 — updateContact whitelists fields', () => {
  const { engine, repo } = seedEngine();
  engine.updateContact('sup_001', {
    contactName: 'Bob',
    phone: '050-0000000',
    // attempt to clobber protected field:
    id: 'hacked',
    email: 'attacker@evil',
  });
  const s = repo.getSupplier('sup_001');
  assert.equal(s.contactName, 'Bob');
  assert.equal(s.phone, '050-0000000');
  assert.equal(s.id, 'sup_001');               // unchanged
  assert.equal(s.email, 'vendor@acme.test');  // unchanged
});

test('31 — updateContact rejects empty payload', () => {
  const { engine } = seedEngine();
  assert.throws(() => engine.updateContact('sup_001', {}), /No updatable/);
});

test('32 — submitTaxClarification creates record', () => {
  const { engine } = seedEngine();
  const id = engine.submitTaxClarification('sup_001', {
    subject: 'בקשה לעדכון שיעור ניכוי',
    message: 'יש בידינו אישור ניכוי במקור מעודכן ל-0%',
    requestedRate: 0,
  });
  assert.match(id, /^tax_/);
});

test('33 — audit log scoped by supplier', () => {
  const { engine } = seedEngine();
  engine.listOpenPOs('sup_001');
  engine.listOpenPOs('sup_002');
  const a1 = engine.getAuditLog('sup_001');
  const a2 = engine.getAuditLog('sup_002');
  assert.ok(a1.length >= 1);
  assert.ok(a2.length >= 1);
  for (const e of a1) assert.equal(e.supplierId, 'sup_001');
  for (const e of a2) assert.equal(e.supplierId, 'sup_002');
});

test('34 — never-delete: acknowledgePO keeps PO row', () => {
  const { engine, repo } = seedEngine();
  engine.acknowledgePO('sup_001', 'po_100', '2026-05-01');
  const po = repo.getPO('po_100');
  assert.ok(po, 'po still exists after ack');
  assert.equal(po.deletedAt, undefined);
});

test('35 — verifyMagicLink rejects malformed input', async () => {
  const { engine } = seedEngine();
  await assert.rejects(() => engine.verifyMagicLink(''), /Invalid/);
  await assert.rejects(() => engine.verifyMagicLink('short'), /Invalid/);
});

test('36 — hmacSign is deterministic & differs with wrong secret', () => {
  const a = hmacSign('data', 'k1');
  const b = hmacSign('data', 'k1');
  const c = hmacSign('data', 'k2');
  assert.equal(a, b);
  assert.notEqual(a, c);
});

test('37 — submitInvoice within 10% tolerance is accepted', () => {
  const { engine } = seedEngine();
  const id = engine.submitInvoice('sup_001', {
    poId: 'po_100',
    invoiceNumber: 'INV-TOL',
    amount: 10500, // 5% above
    currency: 'ILS',
    issuedAt: '2026-04-10',
  });
  assert.ok(id);
});
