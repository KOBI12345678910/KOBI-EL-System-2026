/**
 * tenant-portal.test.js — Agent Y-050 / Real-Estate Swarm
 * ═══════════════════════════════════════════════════════════════════
 * Self-contained unit tests for
 *   onyx-procurement/src/realestate/tenant-portal.js
 *
 * Zero external test framework — pure node:test.
 *
 * Run:
 *   node --test test/realestate/tenant-portal.test.js
 *
 * Coverage:
 *   • magic-link flow (email + SMS, unknown recipient)
 *   • HMAC verify + tampered token
 *   • token expiry + replay protection
 *   • rate limit per contact value + per tenant
 *   • session resolve, logout, tenant isolation
 *   • balance, upcoming rent, payment history
 *   • payRent happy + bridge failure + bad inputs
 *   • lease details + renewal (additive, never deletes)
 *   • maintenance submit + photo upload (mime/size/EICAR)
 *   • documents list + downloads (fallback path)
 *   • dashboard aggregator
 *   • audit log capture for every access
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
  'realestate',
  'tenant-portal.js',
);

const {
  createTenantPortal,
  createInMemoryRepo,
  createMagicLinkToken,
  parseMagicLinkToken,
  hmacSign,
  hmacVerify,
  safeEqual,
  isValidEmail,
  isValidIsraeliPhone,
  normalizeEmail,
  normalizePhone,
  validatePhotoUpload,
  consumeBucket,
  labels,
  LABELS,
  constants,
} = require(enginePath);

// ─────────────────────────────────────────────────────────────────
//  Test helpers
// ─────────────────────────────────────────────────────────────────

function makeClock(startMs) {
  let t = startMs;
  return {
    now() { return t; },
    advance(ms) { t += ms; return t; },
    set(ms) { t = ms; return t; },
  };
}

function seed() {
  const repo = createInMemoryRepo();
  const clock = makeClock(new Date('2026-04-11T08:00:00Z').getTime());
  const emailsSent = [];
  const smsSent = [];
  const chargeLog = [];

  repo.addTenant({
    id: 'ten_001',
    name: 'דני כהן',
    email: 'dani@example.co.il',
    phone: '052-1234567',
    propertyId: 'prop_A',
    unit: '12B',
  });
  repo.addTenant({
    id: 'ten_002',
    name: 'Maya Levi',
    email: 'maya@example.co.il',
    phone: '054-7654321',
    propertyId: 'prop_B',
    unit: '3',
  });

  repo.addLease({
    id: 'lease_001',
    tenantId: 'ten_001',
    startDate: '2025-01-01',
    endDate: '2026-12-31',
    monthlyRent: 6500,
    securityDeposit: 13000,
    pdfRef: 's3://leases/lease_001.pdf',
    renewalRequests: [],
  });
  repo.addLease({
    id: 'lease_002',
    tenantId: 'ten_002',
    startDate: '2025-06-01',
    endDate: '2027-05-31',
    monthlyRent: 5200,
    securityDeposit: 10400,
  });

  // Charges: march already due+paid; april due today; may future.
  repo.addCharge({
    id: 'chg_001', tenantId: 'ten_001', kind: 'rent',
    amount: 6500, dueDate: '2026-03-01', status: 'paid',
  });
  repo.addCharge({
    id: 'chg_002', tenantId: 'ten_001', kind: 'rent',
    amount: 6500, dueDate: '2026-04-01', status: 'open',
  });
  repo.addCharge({
    id: 'chg_003', tenantId: 'ten_001', kind: 'rent',
    amount: 6500, dueDate: '2026-05-01', status: 'open',
  });

  // March rent already paid.
  repo.addPayment({
    id: 'pay_001', tenantId: 'ten_001', amount: 6500, status: 'paid',
    method: 'paybox', reference: 'PBX-123', paidAt: '2026-03-01',
  });

  const engine = createTenantPortal({
    repo,
    clock,
    secret: 'unit-test-secret-32-bytes-random-xyz',
    sendEmail: async (to, subject, body) => {
      emailsSent.push({ to, subject, body });
    },
    sendSms: async (to, body) => {
      smsSent.push({ to, body });
    },
    paymentBridge: {
      charge: async ({ tenantId, amount, method }) => {
        chargeLog.push({ tenantId, amount, method });
        return { ref: `PBX-${tenantId}-${amount}` };
      },
    },
  });

  return { engine, repo, clock, emailsSent, smsSent, chargeLog };
}

// ═══════════════════════════════════════════════════════════════════════
//  PRIMITIVES
// ═══════════════════════════════════════════════════════════════════════

test('01 — isValidEmail + isValidIsraeliPhone sanity', () => {
  assert.equal(isValidEmail('a@b.co'), true);
  assert.equal(isValidEmail('not-email'), false);
  assert.equal(isValidIsraeliPhone('052-1234567'), true);
  assert.equal(isValidIsraeliPhone('+972521234567'), true);
  assert.equal(isValidIsraeliPhone('03-1234567'), true);
  assert.equal(isValidIsraeliPhone('nope'), false);
  assert.equal(isValidIsraeliPhone('12345'), false);
});

test('02 — hmacSign/hmacVerify roundtrip + tamper detection', () => {
  const sig = hmacSign('hello', 'secret');
  assert.ok(typeof sig === 'string' && sig.length > 0);
  assert.equal(hmacVerify('hello', 'secret', sig), true);
  assert.equal(hmacVerify('hello', 'wrong', sig), false);
  assert.equal(hmacVerify('hello2', 'secret', sig), false);
});

test('03 — safeEqual constant-time', () => {
  assert.equal(safeEqual('abc', 'abc'), true);
  assert.equal(safeEqual('abc', 'abd'), false);
  assert.equal(safeEqual('abc', 'abcd'), false);
  assert.equal(safeEqual(null, 'abc'), false);
});

test('04 — normalize helpers', () => {
  assert.equal(normalizeEmail('  A@B.COM '), 'a@b.com');
  assert.equal(normalizePhone('052-123 45 67'), '0521234567');
});

test('05 — createMagicLinkToken / parseMagicLinkToken roundtrip', () => {
  const token = createMagicLinkToken('ten_001', 'email', 'test-secret', 60_000);
  const res = parseMagicLinkToken(token, 'test-secret');
  assert.equal(res.ok, true);
  assert.equal(res.payload.tid, 'ten_001');
  assert.equal(res.payload.ch, 'email');
  assert.ok(typeof res.payload.nonce === 'string');
});

test('06 — parseMagicLinkToken rejects tampered signature', () => {
  const token = createMagicLinkToken('ten_001', 'email', 'test-secret', 60_000);
  const parts = token.split('.');
  const tampered = `${parts[0]}.${parts[1].slice(0, -1)}${parts[1].slice(-1) === 'A' ? 'B' : 'A'}`;
  const res = parseMagicLinkToken(tampered, 'test-secret');
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'bad_token');
});

test('07 — parseMagicLinkToken rejects expired token', () => {
  const token = createMagicLinkToken('ten_001', 'email', 'test-secret', -1); // already expired
  const res = parseMagicLinkToken(token, 'test-secret');
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'expired');
});

test('08 — consumeBucket token-bucket basic', () => {
  const repo = createInMemoryRepo();
  const clock = makeClock(0);
  for (let i = 0; i < 3; i += 1) {
    const r = consumeBucket(repo, 'k', { max: 3, windowMs: 1000, clock });
    assert.equal(r.allowed, true);
  }
  const denied = consumeBucket(repo, 'k', { max: 3, windowMs: 1000, clock });
  assert.equal(denied.allowed, false);
  // advance past window
  clock.advance(1001);
  const allowed = consumeBucket(repo, 'k', { max: 3, windowMs: 1000, clock });
  assert.equal(allowed.allowed, true);
});

test('09 — validatePhotoUpload allows good JPEG', () => {
  const res = validatePhotoUpload({
    name: 'photo.jpg',
    mime: 'image/jpeg',
    bytes: Buffer.from([0xff, 0xd8, 0xff]),
  });
  assert.equal(res.ok, true);
});

test('10 — validatePhotoUpload rejects bad mime / traversal / EICAR / size', () => {
  assert.equal(validatePhotoUpload(null).ok, false);
  assert.equal(validatePhotoUpload({ name: '../../etc/passwd', mime: 'image/jpeg', bytes: Buffer.from('x') }).ok, false);
  assert.equal(validatePhotoUpload({ name: 'exe.exe', mime: 'application/x-msdownload', bytes: Buffer.from('x') }).ok, false);
  const big = Buffer.alloc(constants.MAX_UPLOAD_BYTES + 1, 0);
  assert.equal(validatePhotoUpload({ name: 'big.jpg', mime: 'image/jpeg', bytes: big }).ok, false);
  const eicar = Buffer.from('X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!', 'latin1');
  assert.equal(validatePhotoUpload({ name: 'v.jpg', mime: 'image/jpeg', bytes: eicar }).ok, false);
});

// ═══════════════════════════════════════════════════════════════════════
//  MAGIC-LINK FLOW
// ═══════════════════════════════════════════════════════════════════════

test('11 — requestMagicLink via email: issues token and records delivery', async () => {
  const { engine, emailsSent } = seed();
  const r = await engine.requestMagicLink('email', 'dani@example.co.il');
  assert.equal(r.ok, true);
  assert.equal(r.sent, true);
  assert.ok(typeof r.token === 'string' && r.token.length > 0);
  assert.ok(r.link.includes(encodeURIComponent(r.token)));
  assert.equal(emailsSent.length, 1);
  assert.ok(emailsSent[0].body.includes(r.link));
});

test('12 — requestMagicLink via SMS: issues token via SMS channel', async () => {
  const { engine, smsSent } = seed();
  const r = await engine.requestMagicLink('sms', '052-1234567');
  assert.equal(r.ok, true);
  assert.equal(r.sent, true);
  assert.equal(smsSent.length, 1);
});

test('13 — requestMagicLink returns ok+sent:false for unknown recipient (no enumeration)', async () => {
  const { engine, emailsSent } = seed();
  const r = await engine.requestMagicLink('email', 'ghost@nowhere.co.il');
  assert.equal(r.ok, true);
  assert.equal(r.sent, false);
  assert.equal(emailsSent.length, 0);
});

test('14 — requestMagicLink rejects invalid channel / email / phone', async () => {
  const { engine } = seed();
  assert.equal((await engine.requestMagicLink('postcard', 'a@b.co')).ok, false);
  assert.equal((await engine.requestMagicLink('email', 'not-an-email')).ok, false);
  assert.equal((await engine.requestMagicLink('sms', 'not-a-phone')).ok, false);
});

test('15 — verifyMagicLink returns session on valid token', async () => {
  const { engine } = seed();
  const req = await engine.requestMagicLink('email', 'dani@example.co.il');
  const ver = engine.verifyMagicLink(req.token);
  assert.equal(ver.ok, true);
  assert.equal(ver.tenantId, 'ten_001');
  assert.ok(ver.session && ver.session.id);
});

test('16 — verifyMagicLink enforces single-use (replay blocked)', async () => {
  const { engine } = seed();
  const req = await engine.requestMagicLink('email', 'dani@example.co.il');
  const first = engine.verifyMagicLink(req.token);
  assert.equal(first.ok, true);
  const second = engine.verifyMagicLink(req.token);
  assert.equal(second.ok, false);
  assert.equal(second.error, 'already_used');
});

test('17 — verifyMagicLink rejects token after 24h expiry', async () => {
  const { engine, clock } = seed();
  const req = await engine.requestMagicLink('email', 'dani@example.co.il');
  clock.advance(25 * 60 * 60 * 1000);
  const ver = engine.verifyMagicLink(req.token);
  assert.equal(ver.ok, false);
  assert.equal(ver.error, 'expired');
});

test('18 — verifyMagicLink rejects garbage / HMAC tamper', () => {
  const { engine } = seed();
  assert.equal(engine.verifyMagicLink('not-a-token').ok, false);
  assert.equal(engine.verifyMagicLink('abc.def').ok, false);
});

test('19 — resolveSession returns tenant id while valid, null after expiry', async () => {
  const { engine, clock } = seed();
  const req = await engine.requestMagicLink('email', 'dani@example.co.il');
  const ver = engine.verifyMagicLink(req.token);
  assert.equal(engine.resolveSession(ver.session.id), 'ten_001');
  clock.advance(9 * 60 * 60 * 1000);
  assert.equal(engine.resolveSession(ver.session.id), null);
});

test('20 — logout invalidates session', async () => {
  const { engine } = seed();
  const req = await engine.requestMagicLink('email', 'dani@example.co.il');
  const ver = engine.verifyMagicLink(req.token);
  engine.logout(ver.session.id);
  assert.equal(engine.resolveSession(ver.session.id), null);
});

// ═══════════════════════════════════════════════════════════════════════
//  RATE LIMITING
// ═══════════════════════════════════════════════════════════════════════

test('21 — magic-link rate limit blocks after too many attempts', async () => {
  const { engine } = seed();
  for (let i = 0; i < constants.RATE_LIMIT_MAX; i += 1) {
    const r = await engine.requestMagicLink('email', 'dani@example.co.il');
    assert.equal(r.ok, true);
  }
  const blocked = await engine.requestMagicLink('email', 'dani@example.co.il');
  assert.equal(blocked.ok, false);
  assert.equal(blocked.error, 'rate_limited');
});

test('22 — per-tenant rate limit throws RATE_LIMIT after many calls', () => {
  const { engine } = seed();
  let thrown = null;
  try {
    for (let i = 0; i < constants.TENANT_RATE_LIMIT_MAX + 5; i += 1) {
      engine.getBalance('ten_001');
    }
  } catch (err) {
    thrown = err;
  }
  assert.ok(thrown, 'expected rate limit error');
  assert.equal(thrown.code, 'RATE_LIMIT');
});

// ═══════════════════════════════════════════════════════════════════════
//  BALANCE / RENT / PAYMENTS
// ═══════════════════════════════════════════════════════════════════════

test('23 — getBalance computes owed - paid', () => {
  const { engine } = seed();
  const b = engine.getBalance('ten_001');
  // March (6500) + April (6500) owed; March (6500) paid → balance 6500
  assert.equal(b.owed, 13000);
  assert.equal(b.paid, 6500);
  assert.equal(b.balance, 6500);
  assert.equal(b.currency, 'ILS');
});

test('24 — getUpcomingRent returns the next unpaid charge', () => {
  const { engine } = seed();
  const up = engine.getUpcomingRent('ten_001');
  assert.ok(up);
  assert.equal(up.dueDate, '2026-04-01');
  assert.equal(up.amount, 6500);
});

test('25 — getPaymentHistory returns paid payments newest-first', () => {
  const { engine } = seed();
  const rows = engine.getPaymentHistory('ten_001');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].reference, 'PBX-123');
});

test('26 — payRent happy path records payment, closes charge, adds receipt doc', async () => {
  const { engine, repo, chargeLog } = seed();
  const res = await engine.payRent('ten_001', 6500, 'paybox');
  assert.equal(res.ok, true);
  assert.equal(res.status, 'paid');
  assert.ok(res.paymentRef);
  assert.equal(chargeLog.length, 1);
  // April charge now paid
  const chg = repo.listChargesByTenant('ten_001').find((c) => c.id === 'chg_002');
  assert.equal(chg.status, 'paid');
  // A receipt document was auto-generated
  const docs = repo.listDocumentsByTenant('ten_001').filter((d) => d.kind === 'receipt');
  assert.equal(docs.length, 1);
});

test('27 — payRent propagates failure from payment bridge', async () => {
  const { repo, clock } = seed();
  const engine = createTenantPortal({
    repo,
    clock,
    secret: 'x',
    paymentBridge: { charge: async () => { throw new Error('gateway_down'); } },
  });
  const res = await engine.payRent('ten_001', 6500, 'bit');
  assert.equal(res.ok, false);
  assert.equal(res.status, 'failed');
  // Failed payment is STILL recorded (never delete).
  const rows = repo.listPaymentsByTenant('ten_001');
  assert.ok(rows.find((r) => r.status === 'failed'));
});

test('28 — payRent rejects bad amount / method', async () => {
  const { engine } = seed();
  assert.equal((await engine.payRent('ten_001', -5, 'paybox')).ok, false);
  assert.equal((await engine.payRent('ten_001', 0, 'paybox')).ok, false);
  assert.equal((await engine.payRent('ten_001', 100, 'crypto')).ok, false);
});

// ═══════════════════════════════════════════════════════════════════════
//  LEASE + RENEWAL
// ═══════════════════════════════════════════════════════════════════════

test('29 — getLeaseDetails returns tenant lease with normalized money', () => {
  const { engine } = seed();
  const lease = engine.getLeaseDetails('ten_001');
  assert.ok(lease);
  assert.equal(lease.monthlyRent, 6500);
  assert.equal(lease.endDate, '2026-12-31');
});

test('30 — requestLeaseRenewal is additive (never deletes) and blocks duplicates', () => {
  const { engine, repo } = seed();
  const first = engine.requestLeaseRenewal('ten_001', { termMonths: 12, note: 'לגור עוד שנה' });
  assert.equal(first.ok, true);
  const second = engine.requestLeaseRenewal('ten_001', { termMonths: 12 });
  assert.equal(second.ok, false);
  assert.equal(second.error, 'already_requested');
  // First renewal is preserved.
  const lease = repo.getLeaseByTenant('ten_001');
  assert.equal(lease.renewalRequests.length, 1);
  assert.equal(lease.renewalRequests[0].status, 'pending');
});

// ═══════════════════════════════════════════════════════════════════════
//  MAINTENANCE
// ═══════════════════════════════════════════════════════════════════════

test('31 — submitMaintenanceRequest stores a new request', () => {
  const { engine } = seed();
  const res = engine.submitMaintenanceRequest('ten_001', {
    category: 'plumbing',
    priority: 'high',
    description: 'דליפה מתחת לכיור',
  });
  assert.equal(res.ok, true);
  const list = engine.getMaintenanceRequests('ten_001');
  assert.ok(list.find((r) => r.id === res.id));
});

test('32 — submitMaintenanceRequest rejects bad category/priority/empty desc', () => {
  const { engine } = seed();
  assert.equal(engine.submitMaintenanceRequest('ten_001', { category: 'nonsense', priority: 'high', description: 'ok' }).ok, false);
  assert.equal(engine.submitMaintenanceRequest('ten_001', { category: 'plumbing', priority: 'wrong', description: 'ok' }).ok, false);
  assert.equal(engine.submitMaintenanceRequest('ten_001', { category: 'plumbing', priority: 'high', description: '' }).ok, false);
});

test('33 — uploadMaintenancePhoto attaches photo to existing request', () => {
  const { engine } = seed();
  const { id } = engine.submitMaintenanceRequest('ten_001', {
    category: 'electrical',
    priority: 'medium',
    description: 'התקע לא עובד',
  });
  const res = engine.uploadMaintenancePhoto('ten_001', id, {
    name: 'outlet.jpg',
    mime: 'image/jpeg',
    bytes: Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
  });
  assert.equal(res.ok, true);
  const req = engine._repo.getMaintenance(id);
  assert.equal(req.photos.length, 1);
  assert.equal(req.photos[0].mime, 'image/jpeg');
});

test('34 — uploadMaintenancePhoto rejects wrong tenant (isolation)', () => {
  const { engine } = seed();
  const { id } = engine.submitMaintenanceRequest('ten_001', {
    category: 'electrical',
    priority: 'medium',
    description: 'התקע לא עובד',
  });
  const res = engine.uploadMaintenancePhoto('ten_002', id, {
    name: 'outlet.jpg',
    mime: 'image/jpeg',
    bytes: Buffer.from([0xff, 0xd8]),
  });
  assert.equal(res.ok, false);
});

// ═══════════════════════════════════════════════════════════════════════
//  DOCUMENTS
// ═══════════════════════════════════════════════════════════════════════

test('35 — getDocuments surfaces synthetic lease entry from lease.pdfRef', () => {
  const { engine } = seed();
  const docs = engine.getDocuments('ten_001');
  assert.ok(docs.find((d) => d.kind === 'lease'));
});

test('36 — downloadReceipt returns fallback text when bridge absent', async () => {
  const { engine } = seed();
  const pay = await engine.payRent('ten_001', 6500, 'paybox');
  assert.equal(pay.ok, true);
  const receipts = engine.getDocuments('ten_001').filter((d) => d.kind === 'receipt');
  const r = await engine.downloadReceipt('ten_001', receipts[0].id);
  assert.equal(r.ok, true);
  assert.ok(typeof r.fallbackText === 'string' && r.fallbackText.includes('קבלה'));
});

test('37 — downloadLeasePdf returns fallback with lease data when bridge absent', async () => {
  const { engine } = seed();
  const r = await engine.downloadLeasePdf('ten_001');
  assert.equal(r.ok, true);
  assert.ok(r.fallbackText && r.fallbackText.includes('הסכם שכירות'));
});

// ═══════════════════════════════════════════════════════════════════════
//  DASHBOARD
// ═══════════════════════════════════════════════════════════════════════

test('38 — getDashboard aggregates balance, upcoming, lease end, open maintenance', () => {
  const { engine } = seed();
  engine.submitMaintenanceRequest('ten_001', {
    category: 'hvac', priority: 'low', description: 'מיזוג חלש',
  });
  const snap = engine.getDashboard('ten_001');
  assert.equal(snap.tenant.id, 'ten_001');
  assert.equal(snap.balance.balance, 6500);
  assert.ok(snap.upcomingRent);
  assert.equal(snap.leaseEndDate, '2026-12-31');
  assert.equal(snap.openMaintenance, 1);
  assert.equal(snap.currency, 'ILS');
});

// ═══════════════════════════════════════════════════════════════════════
//  TENANT ISOLATION
// ═══════════════════════════════════════════════════════════════════════

test('39 — unknown tenant surfaces NOT_FOUND error', () => {
  const { engine } = seed();
  assert.throws(() => engine.getBalance('ten_999'), (err) => err.code === 'NOT_FOUND');
});

test('40 — tenant A cannot see tenant B payments', () => {
  const { engine, repo } = seed();
  repo.addPayment({
    id: 'pay_xx', tenantId: 'ten_002', amount: 5200, status: 'paid',
    method: 'paybox', reference: 'PBX-xx', paidAt: '2026-03-01',
  });
  const rows = engine.getPaymentHistory('ten_001');
  assert.ok(!rows.find((r) => r.id === 'pay_xx'));
});

// ═══════════════════════════════════════════════════════════════════════
//  AUDIT LOG
// ═══════════════════════════════════════════════════════════════════════

test('41 — audit log records issued+verified+dashboard access', async () => {
  const { engine } = seed();
  const req = await engine.requestMagicLink('email', 'dani@example.co.il');
  const ver = engine.verifyMagicLink(req.token);
  assert.equal(ver.ok, true);
  engine.getDashboard('ten_001');
  const log = engine.getAuditLog({ tenantId: 'ten_001' });
  const actions = log.map((e) => e.action);
  assert.ok(actions.includes('magic_issued'));
  assert.ok(actions.includes('login_success'));
  assert.ok(actions.includes('dashboard_view'));
});

test('42 — audit log is filterable by action', async () => {
  const { engine } = seed();
  await engine.payRent('ten_001', 6500, 'bit');
  const log = engine.getAuditLog({ action: 'rent_payment' });
  assert.ok(log.length >= 1);
  assert.equal(log[0].action, 'rent_payment');
});

test('43 — labels() exposes Hebrew + English strings', () => {
  assert.equal(labels('tabDashboard').he, 'דשבורד');
  assert.equal(labels('tabMaintenance').en, 'Maintenance');
  assert.ok(LABELS.status.open && LABELS.status.open.he === 'פתוחה');
});

test('44 — requestMagicLink audit captures unknown recipient (no enumeration)', async () => {
  const { engine } = seed();
  await engine.requestMagicLink('email', 'ghost@nowhere.co.il');
  const log = engine.getAuditLog({});
  assert.ok(log.find((e) => e.action === 'magic_unknown'));
});

test('45 — magic link record is marked used after verification', async () => {
  const { engine, repo } = seed();
  const req = await engine.requestMagicLink('email', 'dani@example.co.il');
  engine.verifyMagicLink(req.token);
  const hash = require('node:crypto').createHash('sha256').update(req.token).digest('hex');
  const rec = repo.getMagicLink(hash);
  assert.ok(rec && rec.usedAt);
});
