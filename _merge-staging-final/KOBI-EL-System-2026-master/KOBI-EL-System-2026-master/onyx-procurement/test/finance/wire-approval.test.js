/**
 * AG-Y083 — Unit tests for the Wire Transfer Approval Workflow Engine
 *                מבחני יחידה — מנוע אישורים להעברות בנקאיות
 *
 * Covers:
 *   - validateBeneficiary: IBAN checksum (Y-92), SWIFT format,
 *     sanctions hook (Y-148), whitelist lookup
 *   - routeForApproval: tier routing at all 4 levels (<10k, 10-100k,
 *     100k-1M, >1M)
 *   - addSignature: SHA-256 signature chain, SoD, duplicate guard,
 *     mustInclude roles
 *   - fraudCheck: all 6 signals (velocity, amount anomaly, new
 *     beneficiary, after-hours, round-numbers, duplicate-24h)
 *   - callbackVerification: mandatory for > 100k ILS
 *   - executeMarker: PLAN-ONLY enforcement, requires ready_to_execute
 *   - voidWire: preserves the record (no delete)
 *   - generateBankInstructions: SWIFT MT103 / MASAV / CSV output
 *   - auditTrail: append-only integrity verification
 *   - dailyReport: bilingual aggregation
 *
 * Run with:  node --test test/finance/wire-approval.test.js
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const {
  WireApproval,
  WIRE_STATUS,
  APPROVAL_TIERS,
  FRAUD_SIGNALS,
  DISCLAIMER_EN,
  DISCLAIMER_HE,
  validateIBANChecksum,
  validateSWIFTFormat,
} = require('../../src/finance/wire-approval');

/* ─────────────────────────── test helpers ─────────────────────────── */

// Fix a deterministic clock during a business-hours moment in Israel.
// 2026-04-13 08:30 UTC  = 10:30 Israel (UTC+2) — within 09:00-17:00.
const BUSINESS_START = Date.UTC(2026, 3, 13, 8, 30, 0);

function freshEngine(overrides) {
  let tick = BUSINESS_START;
  const engine = new WireApproval(Object.assign({
    clock: () => tick,
    velocityLimit: 3,
    anomalySigma: 3,
    beneficiaryMinAgeDays: 30,
    historicalAmounts: [10_000, 12_000, 9_000, 11_000, 10_500, 9_500, 10_100],
    whitelist: [
      { iban: 'IL620108000000099999999', name: 'Trusted Vendor Ltd' },
    ],
  }, overrides || {}));
  return {
    engine,
    advance: (ms) => { tick += ms; },
    now: () => tick,
  };
}

const INIT = { id: 'U-INIT', name: 'Inbar Initiator', role: 'clerk' };
const FM   = { id: 'U-FM',   name: 'Finance Manager', role: 'finance_manager' };
const CTL  = { id: 'U-CTL',  name: 'Carla Controller', role: 'controller' };
const CFO  = { id: 'U-CFO',  name: 'Chen CFO',         role: 'cfo' };
const CEO  = { id: 'U-CEO',  name: 'Eva CEO',          role: 'ceo' };
const BRD  = { id: 'U-BRD',  name: 'Board Rep',        role: 'board_member' };

// Two valid IBANs used across tests (mod-97 verified above).
const IBAN_IL = 'IL620108000000099999999';      // Israeli (whitelisted)
const IBAN_DE = 'DE89370400440532013000';       // German  (not whitelisted)
const IBAN_GB = 'GB82WEST12345698765432';       // British

function baseReq(overrides) {
  return Object.assign({
    amount: 5_000,
    currency: 'ILS',
    beneficiary: {
      name:    'Trusted Vendor Ltd',
      iban:    IBAN_IL,
      swift:   'POALILIT',
      bank:    'Bank Hapoalim',
      country: 'IL',
    },
    purpose:   'May invoice settlement',
    valueDate: '2026-04-20',
    initiator: INIT,
  }, overrides || {});
}

/* ══════════════════════════ 1. validateBeneficiary ═════════════════════ */

describe('validateBeneficiary — IBAN, SWIFT, sanctions, whitelist', () => {
  test('1.1 accepts a valid Israeli IBAN and POALILIT SWIFT', () => {
    const { engine } = freshEngine();
    const result = engine.validateBeneficiary({
      name: 'Trusted Vendor Ltd',
      iban: IBAN_IL,
      swift: 'POALILIT',
      bank: 'Bank Hapoalim',
      country: 'IL',
    });
    assert.equal(result.valid, true);
    assert.equal(result.checks.iban.valid, true);
    assert.equal(result.checks.swift.valid, true);
    assert.equal(result.checks.whitelist.whitelisted, true);
    // No hard failures.
    assert.equal(result.findings.filter((f) => f.code === 'iban_invalid').length, 0);
  });

  test('1.2 rejects an IBAN with a bad checksum', () => {
    const { engine } = freshEngine();
    const result = engine.validateBeneficiary({
      name: 'Bad IBAN Vendor',
      iban: 'IL620108000000099999998', // flipped last digit
      swift: 'POALILIT',
      bank: 'Bank Hapoalim',
      country: 'IL',
    });
    assert.equal(result.valid, false);
    assert.ok(result.findings.some((f) => f.code === 'iban_invalid'));
  });

  test('1.3 rejects a malformed SWIFT/BIC', () => {
    const { engine } = freshEngine();
    const result = engine.validateBeneficiary({
      name: 'Bad SWIFT Vendor',
      iban: IBAN_DE,
      swift: 'BADSWIFT',  // 8 chars but includes digit in wrong spot / "BADSWIFT" → position 5-6 must be A-Z
      bank: 'Random Bank',
      country: 'DE',
    });
    // "BADSWIFT" has "IF" in pos 5-6 which is letters → might pass.
    // Use an explicitly wrong one:
    const bad = engine.validateBeneficiary({
      name: 'Bad SWIFT Vendor',
      iban: IBAN_DE,
      swift: '12345678',
      bank: 'Random Bank',
      country: 'DE',
    });
    assert.equal(bad.valid, false);
    assert.ok(bad.findings.some((f) => f.code === 'swift_invalid'));
    // And accept that a technically-valid BIC shape is not flagged:
    assert.ok(!result.findings.some((f) => f.code === 'swift_invalid'));
  });

  test('1.4 sanctions hook integration point (Y-148) fires on hit', () => {
    const { engine } = freshEngine({
      sanctionsHook: (ben) => {
        if (/blocked/i.test(ben.name)) return { clean: false, reason: 'OFAC-SDN' };
        return { clean: true };
      },
    });
    const bad = engine.validateBeneficiary({
      name: 'BLOCKED Entity',
      iban: IBAN_DE,
      swift: 'BOFAUS3N',
      bank: 'Bank Of Fraud',
      country: 'US',
    });
    assert.equal(bad.valid, false);
    assert.ok(bad.findings.some((f) => f.code === 'sanctions_hit'));
    assert.equal(bad.checks.sanctions.clean, false);
  });

  test('1.5 whitelist miss surfaces as a warning (not a hard fail)', () => {
    const { engine } = freshEngine();
    const result = engine.validateBeneficiary({
      name: 'Unknown Fresh Vendor',
      iban: IBAN_DE,
      swift: 'BOFAUS3N',
      bank: 'Some Bank',
      country: 'DE',
    });
    // Warning only — IBAN + SWIFT valid, no sanctions hook, whitelist miss.
    assert.equal(result.valid, true);
    assert.ok(result.findings.some((f) => f.code === 'not_in_whitelist'));
  });
});

/* ══════════════════════════ 2. routeForApproval (4 tiers) ═════════════ */

describe('routeForApproval — 4-tier amount routing', () => {
  test('2.1 Tier 1 — single signer for < 10k ILS', () => {
    const { engine } = freshEngine();
    const wire = engine.createWireRequest(baseReq({ amount: 5_000 }));
    assert.equal(wire.routing.tier, 'T1_SINGLE');
    assert.equal(wire.routing.signersRequired, 1);
    assert.equal(wire.routing.callbackRequired, false);
  });

  test('2.2 Tier 2 — dual signer for 10k-100k ILS', () => {
    const { engine } = freshEngine();
    const wire = engine.createWireRequest(baseReq({ amount: 50_000 }));
    assert.equal(wire.routing.tier, 'T2_DUAL');
    assert.equal(wire.routing.signersRequired, 2);
    assert.deepEqual(wire.routing.mustInclude, ['finance_manager']);
  });

  test('2.3 Tier 3 — CFO for 100k-1M ILS', () => {
    const { engine } = freshEngine();
    const wire = engine.createWireRequest(baseReq({ amount: 500_000 }));
    assert.equal(wire.routing.tier, 'T3_CFO');
    assert.equal(wire.routing.callbackRequired, true);
    assert.deepEqual(wire.routing.mustInclude, ['cfo']);
  });

  test('2.4 Tier 4 — CFO + CEO + Board for > 1M ILS', () => {
    const { engine } = freshEngine();
    const wire = engine.createWireRequest(baseReq({ amount: 2_000_000 }));
    assert.equal(wire.routing.tier, 'T4_BOARD');
    assert.equal(wire.routing.signersRequired, 3);
    // Clone before sorting — frozen arrays cannot mutate in place.
    assert.deepEqual([...wire.routing.mustInclude].sort(), ['board_member', 'ceo', 'cfo'].sort());
    assert.equal(wire.routing.callbackRequired, true);
  });
});

/* ══════════════════════════ 3. addSignature — chained SHA-256 ═════════ */

describe('addSignature — SHA-256 chained ledger, SoD, mustInclude', () => {
  test('3.1 chained hashes: each sig includes prevHash', () => {
    const { engine } = freshEngine();
    const wire = engine.createWireRequest(baseReq({ amount: 50_000 }));
    const s1 = engine.addSignature({ wireId: wire.wireId, signerId: FM.id, signerName: FM.name, role: FM.role, method: 'digital' });
    const s2 = engine.addSignature({ wireId: wire.wireId, signerId: CTL.id, signerName: CTL.name, role: CTL.role, method: '2fa' });
    assert.equal(s1.signatures.length, 1);
    assert.equal(s2.signatures.length, 2);
    // Second signature must reference first's chainHash.
    assert.equal(s2.signatures[1].prevHash, s2.signatures[0].chainHash);
    // chainHead equals the last sig's chainHash.
    assert.equal(s2.chainHead, s2.signatures[1].chainHash);
    // Hashes are non-empty SHA-256 hex (64 chars).
    assert.match(s2.signatures[0].chainHash, /^[0-9a-f]{64}$/);
    assert.match(s2.signatures[1].chainHash, /^[0-9a-f]{64}$/);
  });

  test('3.2 segregation of duties — initiator cannot sign', () => {
    const { engine } = freshEngine();
    const wire = engine.createWireRequest(baseReq({ amount: 5_000 }));
    assert.throws(
      () => engine.addSignature({ wireId: wire.wireId, signerId: INIT.id, role: INIT.role, method: 'digital' }),
      /segregation-of-duties/
    );
  });

  test('3.3 duplicate signer rejected', () => {
    const { engine } = freshEngine();
    const wire = engine.createWireRequest(baseReq({ amount: 50_000 }));
    engine.addSignature({ wireId: wire.wireId, signerId: FM.id, role: FM.role, method: 'digital' });
    assert.throws(
      () => engine.addSignature({ wireId: wire.wireId, signerId: FM.id, role: FM.role, method: 'digital' }),
      /already signed/
    );
  });

  test('3.4 tier-2 fully_signed requires mustInclude finance_manager', () => {
    const { engine } = freshEngine();
    const wire = engine.createWireRequest(baseReq({ amount: 50_000 }));
    // Two controllers — not mustInclude; should stay partially_signed.
    const CTL2 = { id: 'U-CTL2', name: 'Carl II', role: 'controller' };
    engine.addSignature({ wireId: wire.wireId, signerId: CTL.id,  role: CTL.role, method: 'digital' });
    const after = engine.addSignature({ wireId: wire.wireId, signerId: CTL2.id, role: CTL2.role, method: 'digital' });
    assert.equal(after.status, WIRE_STATUS.partially_signed);
    // Now add the finance_manager → fully signed.
    const after2 = engine.addSignature({ wireId: wire.wireId, signerId: FM.id, role: FM.role, method: '2fa' });
    // Tier-2 callback not required → ready_to_execute.
    assert.equal(after2.status, WIRE_STATUS.ready_to_execute);
  });
});

/* ══════════════════════════ 4. fraudCheck — 6 signals ═════════════════ */

describe('fraudCheck — 6 signals', () => {
  test('4.1 velocity: > N wires to same beneficiary in 24h', () => {
    const { engine, advance } = freshEngine({ velocityLimit: 2 });
    // Create 3 wires to the same beneficiary within an hour.
    const a = engine.createWireRequest(baseReq({ amount: 1_000 }));
    advance(10 * 60 * 1000);
    const b = engine.createWireRequest(baseReq({ amount: 1_100 }));
    advance(10 * 60 * 1000);
    const c = engine.createWireRequest(baseReq({ amount: 1_200 }));
    const fc = engine.fraudCheck(c.wireId);
    assert.equal(fc.flagged, true);
    assert.ok(fc.signals.some((s) => s.id === FRAUD_SIGNALS.velocity.id));
    // void-check — signals are visible
    assert.ok(a.wireId && b.wireId);
  });

  test('4.2 amount anomaly: > 3σ from historical mean', () => {
    // historical mean ≈ 10000, stdev small → 1M ILS is waaay over.
    const { engine } = freshEngine();
    const wire = engine.createWireRequest(baseReq({ amount: 1_000_000 }));
    const fc = engine.fraudCheck(wire.wireId);
    assert.ok(fc.signals.some((s) => s.id === FRAUD_SIGNALS.amount_anomaly.id));
  });

  test('4.3 new beneficiary: < 30 days old', () => {
    const { engine } = freshEngine();
    // Use a brand-new beneficiary name so firstSeen = now.
    const wire = engine.createWireRequest(baseReq({
      amount: 2_000,
      beneficiary: {
        name: 'Brand New Vendor',
        iban: IBAN_DE,
        swift: 'DEUTDEFF',
        bank: 'Deutsche Bank',
        country: 'DE',
      },
    }));
    const fc = engine.fraudCheck(wire.wireId);
    assert.ok(fc.signals.some((s) => s.id === FRAUD_SIGNALS.new_beneficiary.id));
  });

  test('4.4 after-hours: outside 09:00-17:00 Israel time', () => {
    // Fix the clock at 23:00 UTC → 01:00 Israel local (off-hours).
    const offHours = Date.UTC(2026, 3, 13, 23, 0, 0);
    let tick = offHours;
    const engine = new WireApproval({
      clock: () => tick,
      historicalAmounts: [10_000, 11_000],
      whitelist: [{ iban: IBAN_IL }],
    });
    const wire = engine.createWireRequest(baseReq({ amount: 5_000 }));
    const fc = engine.fraudCheck(wire.wireId);
    assert.ok(fc.signals.some((s) => s.id === FRAUD_SIGNALS.after_hours.id));
  });

  test('4.5 round-number: exact multiple of 10k/100k/1M', () => {
    const { engine } = freshEngine();
    // 10k exact — but must avoid amount_anomaly by keeping historicalAmounts wide.
    const wire = engine.createWireRequest(baseReq({ amount: 10_000 }));
    const fc = engine.fraudCheck(wire.wireId);
    assert.ok(fc.signals.some((s) => s.id === FRAUD_SIGNALS.round_number.id));
  });

  test('4.6 duplicate within 24h — same amount + beneficiary', () => {
    const { engine, advance } = freshEngine();
    const a = engine.createWireRequest(baseReq({ amount: 7_531 })); // odd, no round-signal
    advance(60 * 60 * 1000); // +1h
    const b = engine.createWireRequest(baseReq({ amount: 7_531 }));
    const fc = engine.fraudCheck(b.wireId);
    assert.ok(fc.signals.some((s) => s.id === FRAUD_SIGNALS.duplicate_24h.id));
    // And the referenced prior wire is in the detail.
    const dup = fc.signals.find((s) => s.id === FRAUD_SIGNALS.duplicate_24h.id);
    assert.ok(dup.detail.duplicates.includes(a.wireId));
  });

  test('4.7 fraudFlagged flips status to fraud_hold', () => {
    const { engine } = freshEngine();
    const wire = engine.createWireRequest(baseReq({ amount: 10_000 })); // round_number
    const fc = engine.fraudCheck(wire.wireId);
    assert.equal(fc.flagged, true);
    const fresh = engine.getWire(wire.wireId);
    assert.equal(fresh.status, WIRE_STATUS.fraud_hold);
  });
});

/* ══════════════════════════ 5. callbackVerification ═══════════════════ */

describe('callbackVerification — mandatory for > 100k ILS', () => {
  test('5.1 high-value (Tier 3) wire stays awaiting_callback until verified', () => {
    const { engine } = freshEngine();
    const wire = engine.createWireRequest(baseReq({ amount: 500_000 }));
    engine.addSignature({ wireId: wire.wireId, signerId: FM.id,  role: FM.role,  method: 'digital' });
    const after = engine.addSignature({ wireId: wire.wireId, signerId: CFO.id, role: CFO.role, method: '2fa' });
    assert.equal(after.status, WIRE_STATUS.awaiting_callback);
    assert.equal(after.routing.callbackRequired, true);

    const verified = engine.callbackVerification({
      wireId: wire.wireId,
      verifiedBy: 'U-CFO',
      method: 'phone',
      notes: 'Called beneficiary back at +972-3-555-0000',
    });
    assert.equal(verified.status, WIRE_STATUS.ready_to_execute);
    assert.equal(verified.callback.method, 'phone');
    assert.equal(verified.callback.mandatory, true);
  });

  test('5.2 low-value wire does not require callback, method still valid', () => {
    const { engine } = freshEngine();
    const wire = engine.createWireRequest(baseReq({ amount: 5_000 }));
    engine.addSignature({ wireId: wire.wireId, signerId: FM.id, role: FM.role, method: 'digital' });
    // Callback is optional — verify that it does not throw and flags non-mandatory.
    const after = engine.callbackVerification({
      wireId: wire.wireId,
      verifiedBy: 'U-FM',
      method: 'in-person',
      notes: 'extra caution',
    });
    assert.equal(after.callback.mandatory, false);
    assert.equal(after.callback.method, 'in-person');
  });

  test('5.3 invalid callback method rejected', () => {
    const { engine } = freshEngine();
    const wire = engine.createWireRequest(baseReq({ amount: 5_000 }));
    assert.throws(
      () => engine.callbackVerification({ wireId: wire.wireId, verifiedBy: 'X', method: 'smoke-signal' }),
      /phone.*in-person/
    );
  });
});

/* ══════════════════════════ 6. executeMarker — PLAN-ONLY ═════════════ */

describe('executeMarker — PLAN-ONLY enforcement', () => {
  test('6.1 throws unless wire is ready_to_execute', () => {
    const { engine } = freshEngine();
    const wire = engine.createWireRequest(baseReq({ amount: 5_000 }));
    assert.throws(
      () => engine.executeMarker(wire.wireId, 'BANK-REF-1', '2026-04-20'),
      /ready_to_execute/
    );
  });

  test('6.2 marks executed_by_human and records the bank reference', () => {
    const { engine } = freshEngine();
    const wire = engine.createWireRequest(baseReq({ amount: 5_000 }));
    engine.addSignature({ wireId: wire.wireId, signerId: FM.id, role: FM.role, method: 'digital' });
    const after = engine.executeMarker(wire.wireId, 'HAPOALIM-12345', '2026-04-21', { id: 'U-FM', name: 'Finance Manager' });
    assert.equal(after.status, WIRE_STATUS.executed_by_human);
    assert.equal(after.execution.ref, 'HAPOALIM-12345');
    assert.equal(after.execution.bankDate, '2026-04-21');
    // Disclaimer is preserved.
    assert.equal(after.execution.note, DISCLAIMER_EN);
    assert.equal(after.execution.noteHe, DISCLAIMER_HE);
  });

  test('6.3 cannot sign after execution', () => {
    const { engine } = freshEngine();
    const wire = engine.createWireRequest(baseReq({ amount: 5_000 }));
    engine.addSignature({ wireId: wire.wireId, signerId: FM.id, role: FM.role, method: 'digital' });
    engine.executeMarker(wire.wireId, 'REF', '2026-04-21');
    assert.throws(
      () => engine.addSignature({ wireId: wire.wireId, signerId: CTL.id, role: CTL.role, method: 'digital' }),
      /executed_by_human/
    );
  });
});

/* ══════════════════════════ 7. voidWire — preserves ═════════════════ */

describe('voidWire — preserves the record', () => {
  test('7.1 voids and preserves signatures & audit trail', () => {
    const { engine } = freshEngine();
    const wire = engine.createWireRequest(baseReq({ amount: 50_000 }));
    engine.addSignature({ wireId: wire.wireId, signerId: FM.id, role: FM.role, method: 'digital' });
    const voided = engine.voidWire(wire.wireId, 'duplicate of WIRE-00002');
    assert.equal(voided.status, WIRE_STATUS.voided);
    assert.equal(voided.void.reason, 'duplicate of WIRE-00002');
    // Signatures preserved.
    assert.equal(voided.signatures.length, 1);
    // Audit trail still intact and verified.
    const audit = engine.auditTrail(wire.wireId);
    assert.equal(audit.verified, true);
    assert.ok(audit.entries.length >= 3); // create + route + signature + void
    assert.ok(audit.entries.some((e) => e.action === 'void'));
    assert.ok(audit.entries.some((e) => e.action === 'signature'));
  });

  test('7.2 wire still retrievable by id after void', () => {
    const { engine } = freshEngine();
    const wire = engine.createWireRequest(baseReq({ amount: 5_000 }));
    engine.voidWire(wire.wireId, 'user cancelled');
    const fresh = engine.getWire(wire.wireId);
    assert.ok(fresh);
    assert.equal(fresh.status, WIRE_STATUS.voided);
  });
});

/* ══════════════════════════ 8. generateBankInstructions ═════════════ */

describe('generateBankInstructions — SWIFT / MASAV / CSV', () => {
  test('8.1 SWIFT MT103 output contains :20: :23B: :32A: :59: :70: fields', () => {
    const { engine } = freshEngine();
    const wire = engine.createWireRequest(baseReq({ amount: 5_000, valueDate: '2026-04-25' }));
    const out = engine.generateBankInstructions(wire.wireId, { format: 'SWIFT-MT103' });
    assert.equal(out.format, 'SWIFT-MT103');
    assert.match(out.text, /:20:/);
    assert.match(out.text, /:23B:CRED/);
    assert.match(out.text, /:32A:260425ILS5000,00/);
    assert.match(out.text, /:59:/);
    assert.match(out.text, /:70:/);
    // PLAN-ONLY disclaimer.
    assert.ok(out.text.includes(DISCLAIMER_EN));
    assert.ok(out.text.includes(DISCLAIMER_HE));
  });

  test('8.2 MASAV output fixed-layout with currency & agorot', () => {
    const { engine } = freshEngine();
    const wire = engine.createWireRequest(baseReq({ amount: 1_234.56 }));
    const out = engine.generateBankInstructions(wire.wireId, { format: 'MASAV' });
    assert.equal(out.format, 'MASAV');
    assert.equal(out.fields.recordType, 'K');
    assert.equal(out.fields.amountAgorot, 123456);
    assert.ok(out.text.includes(DISCLAIMER_HE));
  });

  test('8.3 CSV output has header + single row + disclaimer column', () => {
    const { engine } = freshEngine();
    const wire = engine.createWireRequest(baseReq({ amount: 5_000 }));
    const out = engine.generateBankInstructions(wire.wireId, { format: 'CSV' });
    assert.equal(out.format, 'CSV');
    const [header, row] = out.text.split('\n');
    assert.ok(header.split(',').includes('wireId'));
    assert.ok(row.includes('5000'));
    assert.ok(row.includes('ILS'));
  });

  test('8.4 unknown format throws', () => {
    const { engine } = freshEngine();
    const wire = engine.createWireRequest(baseReq({ amount: 5_000 }));
    assert.throws(
      () => engine.generateBankInstructions(wire.wireId, { format: 'HCIFT' }),
      /unsupported format/
    );
  });
});

/* ══════════════════════════ 9. auditTrail + dailyReport ══════════════ */

describe('auditTrail + dailyReport', () => {
  test('9.1 audit chain verifies after create + sign + execute', () => {
    const { engine } = freshEngine();
    const wire = engine.createWireRequest(baseReq({ amount: 5_000 }));
    engine.addSignature({ wireId: wire.wireId, signerId: FM.id, role: FM.role, method: 'digital' });
    engine.executeMarker(wire.wireId, 'BANK-REF', '2026-04-22');
    const audit = engine.auditTrail(wire.wireId);
    assert.equal(audit.verified, true);
    // At least: create, route, signature, execute_marker.
    const actions = audit.entries.map((e) => e.action);
    assert.ok(actions.includes('create'));
    assert.ok(actions.includes('route'));
    assert.ok(actions.includes('signature'));
    assert.ok(actions.includes('execute_marker'));
  });

  test('9.2 dailyReport aggregates by tier + status bilingually', () => {
    const { engine } = freshEngine();
    engine.createWireRequest(baseReq({ amount: 5_000 }));
    engine.createWireRequest(baseReq({ amount: 50_000 }));
    engine.createWireRequest(baseReq({ amount: 500_000 }));
    engine.createWireRequest(baseReq({ amount: 2_000_000 }));
    const rep = engine.dailyReport();
    assert.equal(rep.count, 4);
    assert.ok(rep.byTier.T1_SINGLE >= 1);
    assert.ok(rep.byTier.T2_DUAL   >= 1);
    assert.ok(rep.byTier.T3_CFO    >= 1);
    assert.ok(rep.byTier.T4_BOARD  >= 1);
    assert.equal(rep.disclaimer.en, DISCLAIMER_EN);
    assert.equal(rep.disclaimer.he, DISCLAIMER_HE);
    assert.ok(rep.headers.he.title.length > 0);
    assert.ok(rep.headers.en.title.length > 0);
  });
});

/* ══════════════════════════ 10. stand-alone helpers ═════════════════ */

describe('exported helpers', () => {
  test('10.1 validateIBANChecksum catches mod-97 violations', () => {
    assert.equal(validateIBANChecksum('DE00370400440532013000').valid, false);
    assert.equal(validateIBANChecksum('DE89370400440532013000').valid, true);
    assert.equal(validateIBANChecksum('').valid, false);
    assert.equal(validateIBANChecksum('NOT-AN-IBAN').valid, false);
  });

  test('10.2 validateSWIFTFormat accepts 8 and 11 char BICs', () => {
    assert.equal(validateSWIFTFormat('BOFAUS3N').valid, true);
    assert.equal(validateSWIFTFormat('POALILITXXX').valid, true);
    assert.equal(validateSWIFTFormat('TOOSHORT').valid, true); // 8 chars, all-letters, valid shape
    assert.equal(validateSWIFTFormat('12345678').valid, false);
    assert.equal(validateSWIFTFormat('POALILI').valid, false); // 7 chars
  });
});
