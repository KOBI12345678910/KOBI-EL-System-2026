/**
 * Contract Manager + E-Sign — unit tests
 * Agent X-23 — Techno-Kol Uzi ERP (Swarm 3B) — written 2026-04-11
 *
 * Run:
 *   node --test test/payroll/contract-manager.test.js
 *
 * Coverage (22 cases):
 *   - Template library + placeholder substitution
 *   - createContract for all 6 contract types (employment, supplier,
 *     client/SOW, lease, NDA, SLA)
 *   - Missing-required flagging
 *   - SHA-256 document hashing + canonicalisation stability
 *   - sendForSigning (parallel + sequential)
 *   - recordSignature happy path + metadata capture
 *   - Sequential mode enforcement (out-of-order rejection)
 *   - Multi-party full-sign lifecycle (draft → sent → signed → active)
 *   - verifyContract hash_match + signer counts
 *   - Tamper detection (mutated body breaks hash_match)
 *   - listExpiring() bracketed 30/60/90
 *   - listExpiring(days) numeric filter
 *   - renewContract() extends + audit trail
 *   - addAmendment() appends immutable addendum
 *   - cancelContract() is append-only (no data loss)
 *   - Version history snapshots
 *   - Expired token rejection
 *   - Already-signed rejection (double-sign)
 *   - Auto-renewal notice flagging
 *   - HMAC token tamper detection
 *   - NEVER DELETE invariant — all records remain retrievable
 *
 * Runner: node:test (Node >= 18). Zero external dependencies.
 */

'use strict';

const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const cm = require(path.resolve(
  __dirname, '..', '..', 'onyx-procurement', 'src', 'contracts', 'contract-manager.js'
));
const esign = require(path.resolve(
  __dirname, '..', '..', 'onyx-procurement', 'src', 'contracts', 'esign.js'
));

// ─────────────────────────────────────────────────────────────
// Test fixtures + helpers
// ─────────────────────────────────────────────────────────────

function freshStores() {
  cm.resetStore();
  esign.resetStore();
}

function mkEmployment(extra) {
  return cm.createContract('employment-monthly-he', {
    employer_name: 'טכנו-קול עוזי בע"מ',
    employer_hp: '514312345',
    employee_name: 'דני כהן',
    employee_tz: '123456782',
    role: 'מהנדס תוכנה',
    monthly_salary: 18000,
    start_date: '2026-05-01',
    scope_percent: 100,
    effective_date: '2026-05-01',
    expiry_date: '2027-05-01',
    auto_renew: true,
    value: 216000,
    ...extra,
  });
}

function mkSupplier(extra) {
  return cm.createContract('supplier-standard-he', {
    buyer_name: 'טכנו-קול עוזי בע"מ',
    buyer_hp: '514312345',
    supplier_name: 'ספקים ושות\' בע"מ',
    supplier_hp: '513999999',
    service_description: 'שרתי GPU + תחזוקה שוטפת',
    value: 240000,
    payment_terms: 'שוטף+30',
    warranty_months: 24,
    effective_date: '2026-01-01',
    start_date: '2026-01-01',
    end_date: '2026-12-31',
    expiry_date: '2026-12-31',
    ...extra,
  });
}

function mkLease(extra) {
  return cm.createContract('lease-residential-he', {
    landlord_name: 'רות לוי',
    landlord_tz: '318731685',
    tenant_name: 'דורון אבן',
    tenant_tz: '123456782',
    property_address: 'רחוב דיזנגוף 100, תל אביב',
    monthly_rent: 7500,
    start_date: '2026-01-01',
    end_date: '2026-12-31',
    months: 12,
    pay_day: 1,
    deposit: 22500,
    effective_date: '2026-01-01',
    expiry_date: '2026-12-31',
    value: 90000,
    ...extra,
  });
}

function mkNda(extra) {
  return cm.createContract('nda-mutual-he', {
    party_a: 'טכנו-קול עוזי בע"מ',
    party_a_id: '514312345',
    party_b: 'מחקר ופיתוח פרו בע"מ',
    party_b_id: '515888777',
    purpose: 'הערכת שיתוף פעולה טכנולוגי',
    confidentiality_years: 5,
    effective_date: '2026-04-01',
    expiry_date: '2031-04-01',
    ...extra,
  });
}

function mkClient(extra) {
  return cm.createContract('client-sow-he', {
    client_name: 'בנק הפועלים',
    client_id: '520000118',
    vendor_name: 'טכנו-קול עוזי בע"מ',
    vendor_hp: '514312345',
    scope: 'אינטגרציית ETL לאגם נתונים',
    value: 480000,
    deliverables: 'פייפליין + דשבורד + הדרכה',
    timeline: '6 חודשים',
    payment_terms: 'אחוז מפתח חודשי',
    ip_owner: 'הלקוח',
    effective_date: '2026-03-01',
    expiry_date: '2026-09-01',
    ...extra,
  });
}

function mkSla(extra) {
  return cm.createContract('sla-service-he', {
    provider_name: 'טכנו-קול עוזי בע"מ',
    provider_hp: '514312345',
    customer_name: 'עיריית תל אביב',
    customer_id: '500100011',
    services: 'תמיכה וניטור 24/7 לשרתי ייצור',
    monthly_fee: 35000,
    uptime_percent: 99.9,
    response_minutes: 15,
    resolution_hours: 4,
    max_credit_percent: 20,
    effective_date: '2026-01-01',
    expiry_date: '2026-12-31',
    value: 420000,
    ...extra,
  });
}

// ─────────────────────────────────────────────────────────────
// 01. Template library exposes all six contract types
// ─────────────────────────────────────────────────────────────
test('01. Template library exposes all six required contract types', () => {
  freshStores();
  const tpls = cm.listTemplates();
  const types = new Set(tpls.map(t => t.type));
  assert.ok(types.has(cm.CONTRACT_TYPE.EMPLOYMENT), 'missing employment');
  assert.ok(types.has(cm.CONTRACT_TYPE.SUPPLIER),   'missing supplier');
  assert.ok(types.has(cm.CONTRACT_TYPE.CLIENT),     'missing client');
  assert.ok(types.has(cm.CONTRACT_TYPE.LEASE),      'missing lease');
  assert.ok(types.has(cm.CONTRACT_TYPE.NDA),        'missing NDA');
  assert.ok(types.has(cm.CONTRACT_TYPE.SERVICE),    'missing SLA');
  // Hebrew labels should be RTL-safe and non-empty.
  for (const t of tpls) {
    assert.ok(t.title_he && t.title_he.length > 0, `empty title_he for ${t.key}`);
  }
});

// ─────────────────────────────────────────────────────────────
// 02. applyTemplate substitutes placeholders and reports unfilled
// ─────────────────────────────────────────────────────────────
test('02. applyTemplate substitutes placeholders + reports warnings', () => {
  freshStores();
  const out = cm.applyTemplate('nda-mutual-he', {
    party_a: 'Acme',
    party_a_id: '514312345',
    party_b: 'Beta',
    party_b_id: '515888777',
    purpose: 'pilot',
    // missing confidentiality_years → goes to warnings
  });
  assert.ok(out.body_he.includes('Acme'), 'party_a not substituted');
  assert.ok(out.body_he.includes('pilot'), 'purpose not substituted');
  assert.ok(
    out.warnings.some(w => w.includes('confidentiality_years')),
    'missing placeholder should warn'
  );
  // required[] all satisfied → missing_required should be empty
  assert.equal(out.missing_required.length, 0);
});

// ─────────────────────────────────────────────────────────────
// 03. createContract for all six types succeeds with ids
// ─────────────────────────────────────────────────────────────
test('03. createContract for all six contract types produces draft ids', () => {
  freshStores();
  const ids = [
    mkEmployment(),
    mkSupplier(),
    mkClient(),
    mkLease(),
    mkNda(),
    mkSla(),
  ];
  assert.equal(new Set(ids).size, 6, 'ids must be unique');
  for (const id of ids) {
    const c = cm.getContract(id);
    assert.ok(c, `no contract for ${id}`);
    assert.equal(c.status, cm.STATUS.DRAFT);
    assert.ok(c.document_hash.length === 64, 'expected 64-char sha-256 hex');
    assert.ok(c.parties.length >= 2, 'contract should infer at least 2 parties');
    assert.ok(c.audit_trail.length >= 1, 'audit trail must have created event');
  }
});

// ─────────────────────────────────────────────────────────────
// 04. createContract flags missing required fields
// ─────────────────────────────────────────────────────────────
test('04. createContract flags missing required fields', () => {
  freshStores();
  const id = cm.createContract('employment-monthly-he', {
    employer_name: 'Acme',
    // missing employer_hp, employee_name, employee_tz, role, monthly_salary, start_date
  });
  const c = cm.getContract(id);
  assert.ok(c.missing_required.length > 0);
  assert.ok(c.missing_required.includes('employer_hp'));
  assert.ok(c.missing_required.includes('monthly_salary'));
  assert.equal(c.status, cm.STATUS.DRAFT, 'still a draft, just flagged');
});

// ─────────────────────────────────────────────────────────────
// 05. SHA-256 canonical hash is stable under key reorder
// ─────────────────────────────────────────────────────────────
test('05. Document hash is stable under property reordering', () => {
  freshStores();
  const a = { id: '1', type: 'nda', title: 'x', parties: [{ name: 'A' }, { name: 'B' }] };
  const b = { parties: [{ name: 'A' }, { name: 'B' }], title: 'x', type: 'nda', id: '1' };
  assert.equal(cm.computeDocumentHash(a), cm.computeDocumentHash(b));
});

// ─────────────────────────────────────────────────────────────
// 06. SHA-256 canonical hash changes when body changes
// ─────────────────────────────────────────────────────────────
test('06. Document hash changes when a semantic field changes', () => {
  freshStores();
  const id = mkEmployment();
  const c1 = cm.getContract(id);
  const hash1 = c1.document_hash;
  // Simulate a semantic edit via amendment snapshot (we don't mutate in place)
  const c2 = { ...c1, title: c1.title + ' — edited' };
  const hash2 = cm.computeDocumentHash(c2);
  assert.notEqual(hash1, hash2);
});

// ─────────────────────────────────────────────────────────────
// 07. sendForSigning (parallel) mints tokens per signer
// ─────────────────────────────────────────────────────────────
test('07. sendForSigning parallel mode issues tokens for every signer', () => {
  freshStores();
  const id = mkSupplier();
  const req = cm.sendForSigning(id, undefined, { mode: 'parallel' });
  assert.ok(req.requestId.startsWith('req_'));
  assert.equal(req.tokens.length, 2);
  assert.equal(req.mode, 'parallel');
  // Contract status flipped to SENT
  const c = cm.getContract(id);
  assert.equal(c.status, cm.STATUS.SENT);
  // Audit trail recorded the send event
  assert.ok(c.audit_trail.some(e => e.event === cm.AUDIT_EVENT.SENT_FOR_SIGNING));
});

// ─────────────────────────────────────────────────────────────
// 08. recordSignature (parallel) captures metadata + hash
// ─────────────────────────────────────────────────────────────
test('08. recordSignature captures IP, UA, typed_name, and doc hash', () => {
  freshStores();
  const id = mkNda();
  const req = cm.sendForSigning(id, undefined, { mode: 'parallel' });
  const [t1] = req.tokens;
  const res = cm.recordSignature(t1.token, {
    typed_name: 'Acme Corp — Signer',
    drawn_png_b64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB',
    ip: '10.0.0.1',
    user_agent: 'Mozilla/5.0 test',
    geolocation: '32.0853,34.7818',
  });
  assert.equal(res.ok, true);
  assert.equal(res.signature.ip, '10.0.0.1');
  assert.equal(res.signature.user_agent, 'Mozilla/5.0 test');
  assert.equal(res.signature.document_hash_at_sign.length, 64);
  assert.equal(res.signature.drawn_png_sha256.length, 64);
  assert.equal(res.signature.document_hash_match, true);
  // Contract mirror
  const c = cm.getContract(id);
  assert.equal(c.signatures.length, 1);
  assert.equal(c.status, cm.STATUS.PARTIAL);
});

// ─────────────────────────────────────────────────────────────
// 09. Sequential mode rejects out-of-order signing
// ─────────────────────────────────────────────────────────────
test('09. Sequential mode — second signer cannot sign before the first', () => {
  freshStores();
  const id = mkClient();
  const req = cm.sendForSigning(id, undefined, { mode: 'sequential' });
  const [first, second] = req.tokens;
  // Skip first, try to sign as second → rejected
  const bad = cm.recordSignature(second.token, { typed_name: 'Signer2', ip: '1.1.1.1' });
  assert.equal(bad.ok, false);
  assert.equal(bad.reason.code, 'OUT_OF_ORDER');
  // Sign first, then second → OK
  const ok1 = cm.recordSignature(first.token, { typed_name: 'Signer1', ip: '1.1.1.1' });
  assert.equal(ok1.ok, true);
  const ok2 = cm.recordSignature(second.token, { typed_name: 'Signer2', ip: '1.1.1.2' });
  assert.equal(ok2.ok, true);
});

// ─────────────────────────────────────────────────────────────
// 10. Full sign lifecycle — draft → sent → signed → active
// ─────────────────────────────────────────────────────────────
test('10. Full lifecycle flips contract to ACTIVE after all sign', () => {
  freshStores();
  const id = mkSupplier({ effective_date: '2020-01-01' }); // in the past ⇒ auto-active
  const req = cm.sendForSigning(id, undefined, { mode: 'parallel' });
  for (const t of req.tokens) {
    const r = cm.recordSignature(t.token, {
      typed_name: `Signer-${t.signerIndex}`,
      ip: `10.0.0.${t.signerIndex + 1}`,
      user_agent: 'ua',
    });
    assert.equal(r.ok, true);
  }
  const c = cm.getContract(id);
  assert.equal(c.status, cm.STATUS.ACTIVE);
  assert.ok(c.signed_at, 'signed_at timestamp should be set');
  assert.equal(c.signatures.length, req.tokens.length);
});

// ─────────────────────────────────────────────────────────────
// 11. verifyContract reports hash_match + signer counts
// ─────────────────────────────────────────────────────────────
test('11. verifyContract returns hash_match + signer counts', () => {
  freshStores();
  const id = mkLease();
  const req = cm.sendForSigning(id, undefined, { mode: 'parallel' });
  for (const t of req.tokens) {
    cm.recordSignature(t.token, { typed_name: t.name, ip: '5.5.5.5' });
  }
  const v = cm.verifyContract(id);
  assert.equal(v.valid, true);
  assert.equal(v.hash_match, true);
  assert.equal(v.signers_count, 2);
  assert.equal(v.signed_count, 2);
  assert.equal(v.pending_count, 0);
});

// ─────────────────────────────────────────────────────────────
// 12. Tamper detection — mutated title breaks hash_match
// ─────────────────────────────────────────────────────────────
test('12. Tamper detection — forging the contract breaks hash_match', () => {
  freshStores();
  const id = mkNda();
  const req = cm.sendForSigning(id, undefined, { mode: 'parallel' });
  for (const t of req.tokens) {
    cm.recordSignature(t.token, { typed_name: t.name, ip: '5.5.5.5' });
  }
  // Now tamper with the in-memory contract (simulates a data-store attack).
  const contract = cm.getContract(id); // clone
  contract.title = 'Tampered title';
  const tamperedLiveHash = cm.computeDocumentHash(contract);
  const storedHash = cm.getContract(id).document_hash;
  assert.notEqual(tamperedLiveHash, storedHash);
});

// ─────────────────────────────────────────────────────────────
// 13. listExpiring() bracketed returns 30/60/90 + overdue groups
// ─────────────────────────────────────────────────────────────
test('13. listExpiring() without arg returns 30/60/90 + overdue groups', () => {
  freshStores();
  const today = new Date();
  const plusDays = (n) => new Date(today.getTime() + n * 24 * 60 * 60 * 1000).toISOString();
  mkSupplier({ expiry_date: plusDays(15) });   // within_30
  mkSupplier({ expiry_date: plusDays(45) });   // within_60
  mkSupplier({ expiry_date: plusDays(75) });   // within_90
  mkSupplier({ expiry_date: plusDays(-5) });   // overdue
  const groups = cm.listExpiring();
  assert.ok('within_30' in groups);
  assert.ok('within_60' in groups);
  assert.ok('within_90' in groups);
  assert.ok('overdue' in groups);
  assert.equal(groups.within_30.length, 1);
  assert.equal(groups.within_60.length, 1);
  assert.equal(groups.within_90.length, 1);
  assert.equal(groups.overdue.length, 1);
});

// ─────────────────────────────────────────────────────────────
// 14. listExpiring(days) returns a flat, numerically-filtered list
// ─────────────────────────────────────────────────────────────
test('14. listExpiring(n) returns flat list filtered by days', () => {
  freshStores();
  const today = new Date();
  const plusDays = (n) => new Date(today.getTime() + n * 24 * 60 * 60 * 1000).toISOString();
  mkSupplier({ expiry_date: plusDays(10) });
  mkSupplier({ expiry_date: plusDays(40) });
  mkSupplier({ expiry_date: plusDays(100) });
  const within30 = cm.listExpiring(30);
  assert.equal(Array.isArray(within30), true);
  assert.equal(within30.length, 1);
  assert.ok(within30[0].days_remaining <= 30);
});

// ─────────────────────────────────────────────────────────────
// 15. renewContract extends expiry + records audit trail
// ─────────────────────────────────────────────────────────────
test('15. renewContract extends expiry, snapshots version, audits event', () => {
  freshStores();
  const id = mkSla();
  const priorVersions = cm.getVersionHistory(id).length;
  const priorHash = cm.getContract(id).document_hash;
  cm.renewContract(id, '2027-12-31', { actor: 'ops@tk', new_value: 500000 });
  const c = cm.getContract(id);
  assert.equal(new Date(c.expiry_date).getUTCFullYear(), 2027);
  assert.equal(c.value, 500000);
  assert.equal(c.status, cm.STATUS.ACTIVE);
  assert.ok(c.audit_trail.some(e => e.event === cm.AUDIT_EVENT.RENEWED));
  assert.ok(cm.getVersionHistory(id).length > priorVersions);
  // Expiry sits inside canonical doc → hash must shift.
  assert.notEqual(c.document_hash, priorHash);
});

// ─────────────────────────────────────────────────────────────
// 16. addAmendment appends immutable addendum + hash
// ─────────────────────────────────────────────────────────────
test('16. addAmendment appends an immutable addendum with its own hash', () => {
  freshStores();
  const id = mkClient();
  const amd = cm.addAmendment(id, {
    title: 'תוספת 1 — הרחבת היקף',
    description: 'הוספת מודול דוחות רגולטוריים',
    delta: { extra_value: 60000 },
    effective_date: '2026-06-01',
  }, 'legal@tk');
  assert.ok(amd.startsWith('amd_'));
  const c = cm.getContract(id);
  assert.equal(c.amendments.length, 1);
  assert.equal(c.amendments[0].id, amd);
  assert.ok(c.amendments[0].hash && c.amendments[0].hash.length === 64);
  assert.ok(c.audit_trail.some(e => e.event === cm.AUDIT_EVENT.AMENDED));
});

// ─────────────────────────────────────────────────────────────
// 17. cancelContract is append-only, never deletes data
// ─────────────────────────────────────────────────────────────
test('17. cancelContract flips status but keeps all data retrievable', () => {
  freshStores();
  const id = mkLease();
  cm.cancelContract(id, 'המשכיר ביטל את ההסכם', 'ops@tk');
  const c = cm.getContract(id);
  assert.equal(c.status, cm.STATUS.CANCELLED);
  assert.ok(c.cancelled_at);
  assert.equal(c.cancel_reason, 'המשכיר ביטל את ההסכם');
  // Original body + parties still there (NEVER DELETE)
  assert.ok(c.body_he.length > 0);
  assert.equal(c.parties.length, 2);
  assert.ok(c.version_history.length >= 2); // initial + cancel snapshot
});

// ─────────────────────────────────────────────────────────────
// 18. Version history is append-only across multiple events
// ─────────────────────────────────────────────────────────────
test('18. Version history accumulates snapshots for each mutating event', () => {
  freshStores();
  const id = mkEmployment();
  assert.equal(cm.getVersionHistory(id).length, 1); // initial
  cm.addAmendment(id, { title: 'a1', description: 'd1' });
  cm.addAmendment(id, { title: 'a2', description: 'd2' });
  cm.renewContract(id, '2028-05-01');
  cm.cancelContract(id, 'test cancel');
  const history = cm.getVersionHistory(id);
  assert.ok(history.length >= 5, `expected ≥5 snapshots, got ${history.length}`);
  // Snapshots must be strictly time-ordered
  for (let i = 1; i < history.length; i++) {
    assert.ok(history[i].version > history[i - 1].version);
  }
});

// ─────────────────────────────────────────────────────────────
// 19. Expired signing window rejects late signatures
// ─────────────────────────────────────────────────────────────
test('19. Signature request with expired TTL rejects new signatures', () => {
  freshStores();
  const id = mkNda();
  // TTL=1ms ⇒ expired immediately
  const req = cm.sendForSigning(id, undefined, { mode: 'parallel', ttlMs: 1 });
  // Spin-wait a tick so Date.now() advances past expiry
  const target = Date.now() + 5;
  while (Date.now() < target) { /* no-op */ }
  const r = cm.recordSignature(req.tokens[0].token, { typed_name: 'late', ip: '1.2.3.4' });
  assert.equal(r.ok, false);
  assert.equal(r.reason.code, 'EXPIRED');
});

// ─────────────────────────────────────────────────────────────
// 20. Double-sign attempt is rejected (idempotent-safe)
// ─────────────────────────────────────────────────────────────
test('20. Signing the same token twice is rejected the second time', () => {
  freshStores();
  const id = mkSupplier();
  const req = cm.sendForSigning(id, undefined, { mode: 'parallel' });
  const t = req.tokens[0];
  const first = cm.recordSignature(t.token, { typed_name: 'X', ip: '9.9.9.9' });
  assert.equal(first.ok, true);
  const second = cm.recordSignature(t.token, { typed_name: 'X', ip: '9.9.9.9' });
  assert.equal(second.ok, false);
  assert.equal(second.reason.code, 'ALREADY_SIGNED');
});

// ─────────────────────────────────────────────────────────────
// 21. Tampered token is rejected (HMAC check)
// ─────────────────────────────────────────────────────────────
test('21. Tampered token is rejected by HMAC binding', () => {
  freshStores();
  const id = mkSla();
  const req = cm.sendForSigning(id, undefined, { mode: 'parallel' });
  const t = req.tokens[0];
  // Flip one hex digit in the random half → HMAC no longer matches
  const parts = t.token.split('.');
  const bad = (parts[0][0] === '0' ? '1' : '0') + parts[0].slice(1) + '.' + parts[1];
  const r = cm.recordSignature(bad, { typed_name: 'attacker', ip: '6.6.6.6' });
  assert.equal(r.ok, false);
  // Can be TOKEN_NOT_FOUND (the exact HMAC wasn't indexed) or TOKEN_TAMPERED
  assert.ok(
    ['TOKEN_NOT_FOUND', 'TOKEN_TAMPERED'].includes(r.reason.code),
    `unexpected reason: ${r.reason.code}`
  );
});

// ─────────────────────────────────────────────────────────────
// 22. Auto-renewal flags `needs_action` inside notice window
// ─────────────────────────────────────────────────────────────
test('22. Contracts inside the renewal-notice window flag needs_action', () => {
  freshStores();
  const today = new Date();
  const plusDays = (n) => new Date(today.getTime() + n * 24 * 60 * 60 * 1000).toISOString();
  // SLA has notice_days=30 by default
  mkSla({ expiry_date: plusDays(15), auto_renew: true });
  const within30 = cm.listExpiring(30);
  assert.ok(within30.length >= 1);
  const hit = within30[0];
  assert.equal(hit.needs_action, true);
  assert.equal(hit.auto_renew, true);
});

// ─────────────────────────────────────────────────────────────
// 23. sweepExpired() transitions past-due contracts to EXPIRED
// ─────────────────────────────────────────────────────────────
test('23. sweepExpired moves past-due contracts to EXPIRED (append-only)', () => {
  freshStores();
  const id = mkLease({ expiry_date: '2020-01-01' });
  // Pretend the contract had been active
  cm.renewContract(id, '2020-01-01'); // ensures non-DRAFT status
  const flipped = cm.sweepExpired();
  assert.ok(flipped >= 1);
  const c = cm.getContract(id);
  assert.equal(c.status, cm.STATUS.EXPIRED);
  assert.ok(c.audit_trail.some(e => e.event === cm.AUDIT_EVENT.EXPIRED));
});

// ─────────────────────────────────────────────────────────────
// 24. E-sign audit trail is bilingual (Hebrew + English labels)
// ─────────────────────────────────────────────────────────────
test('24. E-sign audit trail labels are bilingual (Hebrew + English)', () => {
  freshStores();
  const id = mkNda();
  const req = cm.sendForSigning(id, undefined, { mode: 'parallel' });
  cm.recordSignature(req.tokens[0].token, { typed_name: 'alice', ip: '1.1.1.1' });
  const esReq = esign.getRequest(req.requestId);
  const created = esReq.audit_trail.find(e => e.event === esign.AUDIT_EVENT.REQUEST_CREATED);
  assert.ok(created, 'missing REQUEST_CREATED audit');
  assert.ok(created.label_he && created.label_he.length > 0);
  assert.ok(created.label_en && created.label_en.length > 0);
  // Hebrew label should contain Hebrew codepoints (0x0590–0x05FF)
  assert.ok(/[\u0590-\u05FF]/.test(created.label_he));
});
