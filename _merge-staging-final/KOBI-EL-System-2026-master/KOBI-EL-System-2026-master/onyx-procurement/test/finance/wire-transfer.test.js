/**
 * Unit tests for src/finance/wire-transfer.js
 * Agent AG-Y083 — Wave 4B — 2026-04-11
 *
 * Run from the onyx-procurement folder:
 *   node --test test/finance/wire-transfer.test.js
 *
 * Covers: beneficiary validation, IBAN / BIC / ת.ז check, sanctions+PEP+shell
 * screening, cooldown, rate-limit (count + amount windows), dual-approval
 * threshold, 2FA rejection, SWIFT MT103 structure, anomaly detection,
 * reversal workflow, daily reconciliation.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  WireTransferManager,
  REQUEST_STATUS,
  BENEFICIARY_STATUS,
  MT103_FIELDS,
  DEFAULT_DUAL_APPROVAL_ILS,
  validateIbanLocal,
  validateBic,
  validateIsraeliId,
  swiftAmount,
  swiftDateYYMMDD,
} = require('../../src/finance/wire-transfer');

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

/**
 * Build a manager with a mock clock starting at a fixed epoch. The clock
 * is a plain object so tests can advance it with `clock.tick(ms)`.
 */
function makeClock(start = Date.UTC(2026, 3, 11, 10, 0, 0)) {
  let t = start;
  return {
    now: () => t,
    tick: (ms) => { t += ms; },
    set: (v) => { t = v; },
  };
}

/**
 * Default factory — 2FA accepts token === '123456', everything else falls
 * back to secure defaults.
 */
function newManager(overrides = {}) {
  const clock = overrides.clock || makeClock();
  return {
    clock,
    m: new WireTransferManager({
      clock: clock.now,
      verify2fa: (requestId, approver, token) => token === '123456',
      orderingBic: 'POALILIT',
      ...overrides.opts,
    }),
  };
}

// A well-formed Israeli IBAN (Bank Hapoalim, account 99999999) — passes MOD-97
const VALID_IL_IBAN = 'IL620108000000099999999';
// A well-formed DE IBAN (Deutsche Bank sample) — passes MOD-97
const VALID_DE_IBAN = 'DE89370400440532013000';
// Valid Israeli ת.ז (public Knesset test vector)
const VALID_TZ = '000000018';

// ==========================================================================
// 1. Pure helpers
// ==========================================================================

test('validateIbanLocal accepts a well-formed Israeli IBAN', () => {
  const r = validateIbanLocal(VALID_IL_IBAN);
  assert.equal(r.valid, true);
  assert.equal(r.country, 'IL');
});

test('validateIbanLocal rejects a mutated IBAN', () => {
  const r = validateIbanLocal('IL620108000000099999998'); // last digit changed
  assert.equal(r.valid, false);
  assert.equal(r.reason, 'bad_check_digit');
});

test('validateIbanLocal rejects garbage', () => {
  for (const bad of [null, '', 'nope', '!@#$', 'IL62 0108 0000 0009 9999 99']) {
    assert.equal(validateIbanLocal(bad).valid, false);
  }
});

test('validateBic accepts 8-char and 11-char BIC', () => {
  assert.equal(validateBic('POALILIT').valid, true);
  assert.equal(validateBic('POALILITXXX').valid, true);
  assert.equal(validateBic('POALILITTLV').valid, true);
});

test('validateBic rejects malformed codes', () => {
  for (const bad of [null, '', 'POAL', 'POAL2LIT', 'POAL-ILIT', 'POALILITXX']) {
    assert.equal(validateBic(bad).valid, false);
  }
});

test('validateIsraeliId accepts the canonical test vector', () => {
  assert.equal(validateIsraeliId(VALID_TZ), true);
  assert.equal(validateIsraeliId('123456782'), true); // another known-good vector
});

test('validateIsraeliId rejects checksum-failed IDs', () => {
  assert.equal(validateIsraeliId('123456789'), false);
  assert.equal(validateIsraeliId('000000000'), true); // edge: sum=0
});

test('swiftAmount formats amounts with comma decimals', () => {
  assert.equal(swiftAmount(1234.56), '1234,56');
  assert.equal(swiftAmount(100), '100,00');
  assert.equal(swiftAmount(0), '0,00');
});

test('swiftDateYYMMDD renders a date in YYMMDD form', () => {
  const epoch = Date.UTC(2026, 3, 11); // 2026-04-11
  assert.equal(swiftDateYYMMDD(epoch), '260411');
});

// ==========================================================================
// 2. Beneficiary add + validation
// ==========================================================================

test('addBeneficiary rejects missing required fields', () => {
  const { m } = newManager();
  assert.throws(() => m.addBeneficiary({}), /id required/);
  assert.throws(() => m.addBeneficiary({ id: 'b1' }), /name required/);
  assert.throws(() => m.addBeneficiary({ id: 'b1', name: 'Acme' }), /bank required/);
  assert.throws(
    () => m.addBeneficiary({ id: 'b1', name: 'Acme', bank: 'DB' }),
    /country required/,
  );
});

test('addBeneficiary requires at least one routing identifier', () => {
  const { m } = newManager();
  assert.throws(() =>
    m.addBeneficiary({ id: 'b1', name: 'Acme', bank: 'DB', country: 'DE' }),
    /need swift, iban or account/,
  );
});

test('addBeneficiary validates IBAN via MOD-97', () => {
  const { m } = newManager();
  assert.throws(() => m.addBeneficiary({
    id: 'b1', name: 'Acme', bank: 'DB', country: 'DE', iban: 'DE89370400440532013001',
  }), /invalid IBAN/);

  // valid IBAN works
  const rec = m.addBeneficiary({
    id: 'b1', name: 'Acme Gmbh', bank: 'Deutsche Bank', country: 'DE', iban: VALID_DE_IBAN,
  });
  assert.equal(rec.iban, VALID_DE_IBAN);
  assert.equal(rec.status, BENEFICIARY_STATUS.UNVERIFIED);
});

test('addBeneficiary validates BIC', () => {
  const { m } = newManager();
  assert.throws(() => m.addBeneficiary({
    id: 'b1', name: 'Acme', bank: 'DB', country: 'DE', swift: 'NOT-A-BIC',
  }), /invalid SWIFT\/BIC/);
});

test('addBeneficiary flags IBAN/BIC country mismatch', () => {
  const { m } = newManager();
  assert.throws(() => m.addBeneficiary({
    id: 'b1', name: 'Acme', bank: 'Foo', country: 'DE',
    iban: VALID_DE_IBAN, swift: 'POALILIT', // IL bic vs DE iban
  }), /mismatches/);
});

test('addBeneficiary validates Israeli ת.ז', () => {
  const { m } = newManager();
  assert.throws(() => m.addBeneficiary({
    id: 'b1', name: 'Cohen', bank: 'Leumi', country: 'IL',
    iban: VALID_IL_IBAN, 'ת.ז': '123456789', // bad checksum
  }), /checksum/);

  const rec = m.addBeneficiary({
    id: 'b1', name: 'Cohen', bank: 'Leumi', country: 'IL',
    iban: VALID_IL_IBAN, 'ת.ז': VALID_TZ,
  });
  assert.equal(rec.taxId, VALID_TZ);
});

test('addBeneficiary refuses to overwrite an existing id — never delete', () => {
  const { m } = newManager();
  m.addBeneficiary({ id: 'b1', name: 'A', bank: 'DB', country: 'DE', iban: VALID_DE_IBAN });
  assert.throws(() =>
    m.addBeneficiary({ id: 'b1', name: 'B', bank: 'DB', country: 'DE', iban: VALID_DE_IBAN }),
    /already exists/,
  );
});

// ==========================================================================
// 3. Sanctions / PEP / shell verification
// ==========================================================================

test('verifyBeneficiary blocks a sanctioned entity', () => {
  const { m } = newManager();
  m.setSanctionsList(['Bad Actor LLC', 'Evil Corp']);
  m.addBeneficiary({
    id: 'b1', name: 'Bad Actor LLC', bank: 'DB', country: 'DE', iban: VALID_DE_IBAN,
  });
  const res = m.verifyBeneficiary('b1');
  assert.equal(res.verified, false);
  assert.equal(res.status, BENEFICIARY_STATUS.BLOCKED);
  assert.ok(res.findings.some((f) => f.startsWith('sanctions_hit:')));
});

test('verifyBeneficiary flags a PEP (not blocked)', () => {
  const { m } = newManager();
  m.setPepList(['Benjamin Netanyahu']);
  m.addBeneficiary({
    id: 'b2', name: 'Benjamin Netanyahu', bank: 'Leumi', country: 'IL', iban: VALID_IL_IBAN,
  });
  const res = m.verifyBeneficiary('b2');
  assert.equal(res.verified, true); // PEP is not a hard block
  assert.equal(res.status, BENEFICIARY_STATUS.FLAGGED);
  assert.ok(res.findings.some((f) => f.startsWith('pep_hit:')));
});

test('verifyBeneficiary flags shell companies', () => {
  const { m } = newManager();
  m.setShellCompanyList(['Offshore Holdings Anonymous']);
  m.addBeneficiary({
    id: 'b3', name: 'Offshore Holdings Anonymous', bank: 'BVI Bank', country: 'VG', account: '123',
  });
  const res = m.verifyBeneficiary('b3');
  assert.ok(res.findings.some((f) => f.startsWith('shell_hit:')));
  assert.equal(res.status, BENEFICIARY_STATUS.FLAGGED);
});

test('verifyBeneficiary reports high-risk country', () => {
  const { m } = newManager();
  m.addBeneficiary({
    id: 'b4', name: 'Tehran Electronics', bank: 'Melli', country: 'IR', account: '999',
  });
  const res = m.verifyBeneficiary('b4');
  assert.ok(res.findings.some((f) => f.startsWith('high_risk_country:IR')));
});

// ==========================================================================
// 4. Cooldown
// ==========================================================================

test('cooldownPeriod starts active for a brand-new beneficiary', () => {
  const { m } = newManager();
  m.addBeneficiary({ id: 'b1', name: 'Acme', bank: 'DB', country: 'DE', iban: VALID_DE_IBAN });
  const cd = m.cooldownPeriod('b1');
  assert.equal(cd.active, true);
  assert.ok(cd.hoursLeft > 23); // ~24h by default
});

test('cooldownPeriod clears after 24h for low-risk country', () => {
  const { m, clock } = newManager();
  m.addBeneficiary({ id: 'b1', name: 'Acme', bank: 'DB', country: 'DE', iban: VALID_DE_IBAN });
  clock.tick(25 * 3600 * 1000);
  const cd = m.cooldownPeriod('b1');
  assert.equal(cd.active, false);
  assert.equal(cd.hoursLeft, 0);
});

test('cooldownPeriod uses 48h for high-risk country', () => {
  const { m, clock } = newManager();
  m.addBeneficiary({ id: 'b1', name: 'Foo', bank: 'Melli', country: 'IR', account: '1' });
  // 25h is not enough
  clock.tick(25 * 3600 * 1000);
  assert.equal(m.cooldownPeriod('b1').active, true);
  // 24 more hours → total 49h, now cleared
  clock.tick(24 * 3600 * 1000);
  assert.equal(m.cooldownPeriod('b1').active, false);
});

test('createWireRequest during cooldown marks status COOLDOWN', () => {
  const { m } = newManager();
  m.addBeneficiary({ id: 'b1', name: 'Acme', bank: 'DB', country: 'DE', iban: VALID_DE_IBAN });
  m.verifyBeneficiary('b1');
  const req = m.createWireRequest({
    beneficiaryId: 'b1', amount: 1000, currency: 'EUR', purpose: 'Invoice 123',
  });
  assert.equal(req.status, REQUEST_STATUS.COOLDOWN);
  assert.ok(req.blockReasons.includes('cooldown_active'));
});

// ==========================================================================
// 5. Rate limiting
// ==========================================================================

test('rateLimit allows the first wire', () => {
  const { m } = newManager();
  m.addBeneficiary({ id: 'b1', name: 'Acme', bank: 'DB', country: 'DE', iban: VALID_DE_IBAN });
  const rl = m.rateLimit({ beneficiaryId: 'b1', amount: 100 });
  assert.equal(rl.allowed, true);
});

test('rateLimit refuses when count window is saturated', () => {
  const { m, clock } = newManager();
  m.addBeneficiary({ id: 'b1', name: 'Acme', bank: 'DB', country: 'DE', iban: VALID_DE_IBAN });
  // Tighten the daily window to 2 wires max for testing.
  m.rateLimit({ beneficiaryId: 'b1', period: 'daily', maxCount: 2, maxAmount: 1_000_000 });
  m.verifyBeneficiary('b1');
  clock.tick(25 * 3600 * 1000); // clear cooldown

  // Seed 2 executed requests directly through the real lifecycle.
  const r1 = m.createWireRequest({ beneficiaryId: 'b1', amount: 100, currency: 'EUR', purpose: 'p1', fxRate: 4 });
  m.approveRequest(r1.id, 'user1', '123456');
  m.executeRequest(r1.id);
  const r2 = m.createWireRequest({ beneficiaryId: 'b1', amount: 100, currency: 'EUR', purpose: 'p2', fxRate: 4 });
  m.approveRequest(r2.id, 'user1', '123456');
  m.executeRequest(r2.id);

  // Third attempt must be blocked by rate limit at execute time.
  const r3 = m.createWireRequest({ beneficiaryId: 'b1', amount: 100, currency: 'EUR', purpose: 'p3', fxRate: 4 });
  m.approveRequest(r3.id, 'user1', '123456');
  assert.throws(() => m.executeRequest(r3.id), /rate limit/);
});

test('rateLimit refuses when amount window is saturated', () => {
  const { m, clock } = newManager();
  m.addBeneficiary({ id: 'b1', name: 'Acme', bank: 'DB', country: 'DE', iban: VALID_DE_IBAN });
  m.rateLimit({ beneficiaryId: 'b1', period: 'daily', maxCount: 100, maxAmount: 5000 });
  m.verifyBeneficiary('b1');
  clock.tick(25 * 3600 * 1000);

  const r1 = m.createWireRequest({
    beneficiaryId: 'b1', amount: 3000, currency: 'EUR', purpose: 'p1', fxRate: 1,
  });
  m.approveRequest(r1.id, 'user1', '123456');
  m.executeRequest(r1.id);

  const rl = m.rateLimit({ beneficiaryId: 'b1', amount: 2500 });
  assert.equal(rl.allowed, false);
  assert.match(rl.reason, /rate_limit_amount/);
});

// ==========================================================================
// 6. Dual approval & 2FA
// ==========================================================================

test('dualApproval required when amount > threshold', () => {
  const { m } = newManager();
  assert.equal(m.dualApproval({ amountIls: 10_000 }).required, false);
  assert.equal(m.dualApproval({ amountIls: 60_000 }).required, true);
});

test('approveRequest rejects bad 2FA token', () => {
  const { m, clock } = newManager();
  m.addBeneficiary({ id: 'b1', name: 'Acme', bank: 'DB', country: 'DE', iban: VALID_DE_IBAN });
  m.verifyBeneficiary('b1');
  clock.tick(25 * 3600 * 1000);
  const req = m.createWireRequest({
    beneficiaryId: 'b1', amount: 500, currency: 'EUR', purpose: 'test',
  });
  assert.throws(() => m.approveRequest(req.id, 'user1', 'wrong-token'), /2FA/);
});

test('approveRequest moves to PENDING_SECOND_APPROVAL for dual-approval wires', () => {
  const { m, clock } = newManager();
  m.addBeneficiary({ id: 'b1', name: 'Acme', bank: 'DB', country: 'DE', iban: VALID_DE_IBAN });
  m.verifyBeneficiary('b1');
  clock.tick(25 * 3600 * 1000);

  // Big wire — 70,000 EUR with fxRate 4 = 280,000 ILS (> threshold)
  const req = m.createWireRequest({
    beneficiaryId: 'b1', amount: 70_000, currency: 'EUR', purpose: 'Invoice 99', fxRate: 4,
  });

  const after1 = m.approveRequest(req.id, 'user1', '123456');
  assert.equal(after1.status, REQUEST_STATUS.PENDING_SECOND_APPROVAL);
  assert.equal(after1.approvals.length, 1);

  // Same approver must be rejected.
  assert.throws(() => m.approveRequest(req.id, 'user1', '123456'), /already approved/);

  const after2 = m.approveRequest(req.id, 'user2', '123456');
  assert.equal(after2.status, REQUEST_STATUS.APPROVED);
  assert.equal(after2.approvals.length, 2);
});

test('approveRequest accepts single approver for small wires', () => {
  const { m, clock } = newManager();
  m.addBeneficiary({ id: 'b1', name: 'Acme', bank: 'DB', country: 'DE', iban: VALID_DE_IBAN });
  m.verifyBeneficiary('b1');
  clock.tick(25 * 3600 * 1000);
  const req = m.createWireRequest({
    beneficiaryId: 'b1', amount: 1000, currency: 'EUR', purpose: 'small', fxRate: 4,
  });
  const out = m.approveRequest(req.id, 'user1', '123456');
  assert.equal(out.status, REQUEST_STATUS.APPROVED);
});

test('approveRequest refuses when beneficiary is still in cooldown', () => {
  const { m } = newManager();
  m.addBeneficiary({ id: 'b1', name: 'Acme', bank: 'DB', country: 'DE', iban: VALID_DE_IBAN });
  m.verifyBeneficiary('b1');
  // createWireRequest returns status COOLDOWN
  const req = m.createWireRequest({
    beneficiaryId: 'b1', amount: 500, currency: 'EUR', purpose: 'p',
  });
  assert.equal(req.status, REQUEST_STATUS.COOLDOWN);
  assert.throws(() => m.approveRequest(req.id, 'user1', '123456'), /cooldown/);
});

// ==========================================================================
// 7. SWIFT MT103 structure
// ==========================================================================

test('swiftMT103Format emits a well-structured message', () => {
  const { m, clock } = newManager();
  m.addBeneficiary({
    id: 'b1', name: 'Acme Gmbh', bank: 'Deutsche Bank', country: 'DE',
    iban: VALID_DE_IBAN, swift: 'DEUTDEFF',
  });
  m.verifyBeneficiary('b1');
  clock.tick(25 * 3600 * 1000);

  const req = m.createWireRequest({
    beneficiaryId: 'b1', amount: 1234.56, currency: 'EUR',
    purpose: 'Invoice ACME-2026-001', invoice: 'ACME-001', fxRate: 4,
  });
  m.approveRequest(req.id, 'user1', '123456');
  const out = m.executeRequest(req.id);

  assert.ok(out.file.endsWith('.txt'));
  assert.ok(out.message.includes(`:${MT103_FIELDS.SENDER_REF}:`));
  assert.ok(out.message.includes(`:${MT103_FIELDS.BANK_OP_CODE}:CRED`));
  assert.ok(out.message.includes(`:${MT103_FIELDS.VALUE_DATE_CCY_AMT}:`));
  assert.match(out.message, /:32A:\d{6}EUR1234,56/);
  assert.ok(out.message.includes(`:${MT103_FIELDS.BENEFICIARY}:/${VALID_DE_IBAN}`));
  assert.ok(out.message.includes(`:${MT103_FIELDS.CHARGES}:SHA`));
  // Regulatory reporting for non-ILS wires
  assert.ok(out.message.includes(`:${MT103_FIELDS.REG_REPORTING}:/BENEFRES/DE`));

  // Block-wrapped form
  const wrapped = m.swiftMT103Format(req.id);
  assert.ok(wrapped.text.startsWith('{1:F01'));
  assert.ok(wrapped.text.includes('{2:I103'));
  assert.ok(wrapped.text.includes('{3:{108:'));
  assert.ok(wrapped.text.includes('{4:\n:20:'));
  assert.ok(wrapped.text.endsWith('{5:{CHK:000000000000}}'));
});

test('executeRequest includes the safety notice — does NOT transmit', () => {
  const { m, clock } = newManager();
  m.addBeneficiary({ id: 'b1', name: 'Acme', bank: 'DB', country: 'DE', iban: VALID_DE_IBAN });
  m.verifyBeneficiary('b1');
  clock.tick(25 * 3600 * 1000);
  const req = m.createWireRequest({
    beneficiaryId: 'b1', amount: 1, currency: 'EUR', purpose: 'p', fxRate: 4,
  });
  m.approveRequest(req.id, 'user1', '123456');
  const out = m.executeRequest(req.id);
  assert.match(out.safetyNotice, /NOT transmitted/);
  assert.match(out.safetyNotice, /ידנית/);
});

// ==========================================================================
// 8. Anomaly detection
// ==========================================================================

test('anomalyDetection flags high-risk country + new beneficiary', () => {
  const { m, clock } = newManager();
  m.addBeneficiary({ id: 'b1', name: 'Tehran Parts', bank: 'Melli', country: 'IR', account: '1' });
  const res = m.anomalyDetection({
    beneficiaryId: 'b1', amount: 5000, amountIls: 20_000, purpose: 'parts',
  });
  assert.equal(res.flagged, true);
  assert.ok(res.reasons.includes('high_risk_country:IR'));
  assert.ok(res.reasons.includes('new_beneficiary'));
});

test('anomalyDetection flags BEC-style purpose keywords', () => {
  const { m } = newManager();
  m.addBeneficiary({ id: 'b1', name: 'NewCo', bank: 'DB', country: 'DE', iban: VALID_DE_IBAN });
  const res = m.anomalyDetection({
    beneficiaryId: 'b1', amount: 15_000, amountIls: 60_000, purpose: 'urgent wire per CEO instruction',
    urgent: true,
  });
  assert.equal(res.flagged, true);
  assert.ok(res.reasons.some((r) => r.startsWith('purpose_keyword:')));
  assert.ok(res.reasons.includes('urgent_flag'));
});

test('anomalyDetection scores low for a known, small, normal wire', () => {
  const { m, clock } = newManager();
  m.addBeneficiary({ id: 'b1', name: 'Acme', bank: 'DB', country: 'DE', iban: VALID_DE_IBAN });
  m.addApprovedBic('DEUTDEFF');
  clock.tick(8 * 24 * 3600 * 1000); // age the beneficiary beyond "new"

  const res = m.anomalyDetection({
    beneficiaryId: 'b1', amount: 500, amountIls: 2000, purpose: 'Invoice 001',
  });
  assert.equal(res.flagged, false);
  assert.ok(res.score < 0.5);
});

test('anomalyDetection flags round-number amounts', () => {
  const { m, clock } = newManager();
  m.addBeneficiary({ id: 'b1', name: 'Acme', bank: 'DB', country: 'DE', iban: VALID_DE_IBAN });
  clock.tick(8 * 24 * 3600 * 1000);
  const res = m.anomalyDetection({
    beneficiaryId: 'b1', amount: 50_000, amountIls: 50_000, purpose: 'normal payment',
  });
  assert.ok(res.reasons.includes('round_amount'));
});

// ==========================================================================
// 9. Reversal
// ==========================================================================

test('reverseFailedWire records a reversal without deleting the original', () => {
  const { m, clock } = newManager();
  m.addBeneficiary({ id: 'b1', name: 'Acme', bank: 'DB', country: 'DE', iban: VALID_DE_IBAN });
  m.verifyBeneficiary('b1');
  clock.tick(25 * 3600 * 1000);
  const req = m.createWireRequest({
    beneficiaryId: 'b1', amount: 100, currency: 'EUR', purpose: 'test', fxRate: 4,
  });
  m.approveRequest(req.id, 'user1', '123456');
  m.executeRequest(req.id);

  const rev = m.reverseFailedWire({ wireId: req.id, reason: 'wrong IBAN' });
  assert.ok(rev.id.startsWith('reversal_'));
  assert.equal(rev.reason, 'wrong IBAN');
  assert.ok(Array.isArray(rev.reclaimProcess));
  assert.ok(rev.reclaimProcess.some((line) => /MT192/i.test(line)));

  const after = m.getWireRequest(req.id);
  assert.equal(after.status, REQUEST_STATUS.REVERSED);
  // Original request still exists (not deleted).
  assert.ok(after != null);
  assert.equal(m.listWireRequests().length, 1);
});

test('reverseFailedWire refuses pre-execute requests', () => {
  const { m, clock } = newManager();
  m.addBeneficiary({ id: 'b1', name: 'Acme', bank: 'DB', country: 'DE', iban: VALID_DE_IBAN });
  m.verifyBeneficiary('b1');
  clock.tick(25 * 3600 * 1000);
  const req = m.createWireRequest({
    beneficiaryId: 'b1', amount: 100, currency: 'EUR', purpose: 'test', fxRate: 4,
  });
  assert.throws(() => m.reverseFailedWire({ wireId: req.id, reason: 'nope' }), /not reversible/);
});

// ==========================================================================
// 10. Daily reconciliation
// ==========================================================================

test('dailyReconcile matches executed wires against bank statement rows', () => {
  const { m, clock } = newManager();
  m.addBeneficiary({ id: 'b1', name: 'Acme', bank: 'DB', country: 'DE', iban: VALID_DE_IBAN });
  m.verifyBeneficiary('b1');
  clock.tick(25 * 3600 * 1000);
  const req = m.createWireRequest({
    beneficiaryId: 'b1', amount: 100, currency: 'EUR', purpose: 'p', fxRate: 4,
  });
  m.approveRequest(req.id, 'user1', '123456');
  m.executeRequest(req.id);

  const result = m.dailyReconcile([
    { ref: req.id.slice(0, 16), amount: 100, currency: 'EUR', date: '2026-04-12' },
  ]);
  assert.equal(result.matched.length, 1);
  assert.equal(result.unmatched.length, 0);
  assert.equal(m.getWireRequest(req.id).status, REQUEST_STATUS.CONFIRMED);
});

test('dailyReconcile reports exceptions for orphan statement rows', () => {
  const { m } = newManager();
  const result = m.dailyReconcile([
    { ref: 'mystery-ref', amount: 999, currency: 'USD', date: '2026-04-12' },
  ]);
  assert.equal(result.exceptions.length, 1);
});

// ==========================================================================
// 11. Audit log is append-only
// ==========================================================================

test('audit log captures every state transition', () => {
  const { m, clock } = newManager();
  m.addBeneficiary({ id: 'b1', name: 'Acme', bank: 'DB', country: 'DE', iban: VALID_DE_IBAN });
  m.setSanctionsList(['Pariah LLC']);
  m.verifyBeneficiary('b1');
  clock.tick(25 * 3600 * 1000);
  const req = m.createWireRequest({
    beneficiaryId: 'b1', amount: 100, currency: 'EUR', purpose: 'x', fxRate: 4,
  });
  m.approveRequest(req.id, 'user1', '123456');
  m.executeRequest(req.id);

  const events = m.getAuditLog().map((e) => e.event);
  assert.ok(events.includes('beneficiary.created'));
  assert.ok(events.includes('sanctions.loaded'));
  assert.ok(events.includes('beneficiary.verified'));
  assert.ok(events.includes('request.created'));
  assert.ok(events.includes('request.approved'));
  assert.ok(events.includes('request.executed'));

  // Attempt to mutate the returned log — original is untouched.
  const log = m.getAuditLog();
  log.push({ event: 'forged', id: 'evil' });
  assert.ok(!m.getAuditLog().some((e) => e.event === 'forged'));
});

test('manager without a 2FA verifier rejects all approvals by default', () => {
  const clock = makeClock();
  // deliberately no verify2fa override
  const m = new WireTransferManager({ clock: clock.now });
  m.addBeneficiary({ id: 'b1', name: 'Acme', bank: 'DB', country: 'DE', iban: VALID_DE_IBAN });
  m.verifyBeneficiary('b1');
  clock.tick(25 * 3600 * 1000);
  const req = m.createWireRequest({
    beneficiaryId: 'b1', amount: 100, currency: 'EUR', purpose: 'p', fxRate: 4,
  });
  assert.throws(() => m.approveRequest(req.id, 'user1', '123456'), /2FA/);
});

test('DEFAULT_DUAL_APPROVAL_ILS exported constant is sane', () => {
  assert.equal(DEFAULT_DUAL_APPROVAL_ILS, 50_000);
});
