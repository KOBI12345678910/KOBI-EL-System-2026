/**
 * Gift & Hospitality Register — Unit Tests
 * Agent Y-145 / Swarm Compliance / Techno-Kol Uzi Mega-ERP 2026
 *
 * Run with:
 *   node --test onyx-procurement/test/compliance/gift-register.test.js
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const {
  GiftRegister,
  GIFT_TYPES,
  TIERS,
  DECISIONS,
  GIFT_STATUS,
  EVENT_TYPES,
  DEFAULT_POLICY,
} = require('../../src/compliance/gift-register.js');

// ─── helpers ───────────────────────────────────────────────────────────
const FIXED_NOW = '2026-04-11T09:00:00.000Z';

function clockAt(iso) {
  const state = { iso };
  const fn = () => new Date(state.iso);
  fn.advance = (days) => {
    const d = new Date(state.iso);
    d.setUTCDate(d.getUTCDate() + days);
    state.iso = d.toISOString();
  };
  return fn;
}

function makeRegister(nowIso = FIXED_NOW) {
  return new GiftRegister({ now: clockAt(nowIso) });
}

// Seed helper with sensible defaults per type.
function declareOne(reg, overrides = {}) {
  const base = {
    employeeId: 'emp-101',
    giftType: GIFT_TYPES.PHYSICAL_GIFT,
    givenBy: 'vendor-acme',
    givenByHe: 'אקמי בע"מ',
    estimatedValue: 150,
    currency: 'ILS',
    context: 'Purim basket',
    contextHe: 'משלוח מנות פורים',
    date: '2026-04-01T08:00:00.000Z',
    declaredWithinDays: 1,
  };
  return reg.declareGift(Object.assign({}, base, overrides));
}

// ───────────────────────────────────────────────────────────────────────

describe('GiftRegister — declaration for every gift type', () => {
  test('1) declareGift accepts physical-gift, meal, travel, event-ticket, discount, loan, service, cash-equivalent', () => {
    const reg = makeRegister();
    const types = [
      GIFT_TYPES.PHYSICAL_GIFT,
      GIFT_TYPES.MEAL,
      GIFT_TYPES.TRAVEL,
      GIFT_TYPES.EVENT_TICKET,
      GIFT_TYPES.DISCOUNT,
      GIFT_TYPES.LOAN,
      GIFT_TYPES.SERVICE,
      GIFT_TYPES.CASH_EQUIVALENT,
    ];
    const declared = types.map((t, i) =>
      declareOne(reg, {
        giftType: t,
        estimatedValue: 250,
        employeeId: 'emp-' + (100 + i),
      })
    );
    assert.equal(declared.length, 8);
    for (const rec of declared) {
      assert.match(rec.giftId, /^GIFT-\d{6}$/);
      assert.ok(rec.giftTypeLabelHe);
      assert.equal(rec.currency, 'ILS');
      assert.equal(rec.valueIls, 250);
    }
    // all eight distinct types represented
    assert.equal(new Set(declared.map((r) => r.giftType)).size, 8);
  });

  test('2) declareGift rejects unknown gift type', () => {
    const reg = makeRegister();
    assert.throws(() => declareOne(reg, { giftType: 'bribe-cash' }), /UNKNOWN_GIFT_TYPE/);
  });
});

describe('GiftRegister — threshold tiers', () => {
  test('3) ₪150 physical gift is below threshold (NONE tier)', () => {
    const reg = makeRegister();
    const rec = declareOne(reg, { estimatedValue: 150 });
    assert.equal(rec.tier, TIERS.NONE);
    assert.equal(rec.requiresApproval, false);
    assert.equal(rec.status, GIFT_STATUS.APPROVED);
  });

  test('4) ₪350 gift requires declaration only', () => {
    const reg = makeRegister();
    const rec = declareOne(reg, { estimatedValue: 350 });
    assert.equal(rec.tier, TIERS.DECLARE);
    assert.equal(rec.requiresApproval, false);
    assert.equal(rec.mustRefuse, false);
  });

  test('5) ₪1,500 gift requires declaration + approval', () => {
    const reg = makeRegister();
    const rec = declareOne(reg, { estimatedValue: 1500 });
    assert.equal(rec.tier, TIERS.DECLARE_APPROVE);
    assert.equal(rec.requiresApproval, true);
    assert.equal(rec.status, GIFT_STATUS.PENDING);
  });

  test('6) ₪3,000 gift must be refused', () => {
    const reg = makeRegister();
    const rec = declareOne(reg, { estimatedValue: 3000 });
    assert.equal(rec.tier, TIERS.REFUSE);
    assert.equal(rec.mustRefuse, true);
    assert.equal(rec.status, GIFT_STATUS.REFUSED);
    assert.equal(rec.policyBreach, true);
  });

  test('7) threshold() returns bilingual schema with 4 tiers and annual ceiling', () => {
    const reg = makeRegister();
    const schema = reg.threshold('private');
    assert.equal(schema.tiers.length, 4);
    assert.equal(schema.currency, 'ILS');
    assert.equal(schema.annualCumulative, DEFAULT_POLICY.private.annualCumulative);
    assert.ok(schema.policyHe.includes('פרטי'));
    assert.deepEqual(
      schema.tiers.map((t) => t.tier),
      [TIERS.NONE, TIERS.DECLARE, TIERS.DECLARE_APPROVE, TIERS.REFUSE]
    );
    for (const t of schema.tiers) assert.ok(t.labelHe);
  });

  test('8) always-declare types (travel, event-ticket, cash) escalate NONE→DECLARE', () => {
    const reg = makeRegister();
    const travel = declareOne(reg, { giftType: GIFT_TYPES.TRAVEL, estimatedValue: 50 });
    const ticket = declareOne(reg, { giftType: GIFT_TYPES.EVENT_TICKET, estimatedValue: 80 });
    const cash = declareOne(reg, { giftType: GIFT_TYPES.CASH_EQUIVALENT, estimatedValue: 50 });
    assert.equal(travel.tier, TIERS.DECLARE);
    assert.equal(ticket.tier, TIERS.DECLARE);
    // cash-equivalent escalates to DECLARE_APPROVE even at ₪50
    assert.equal(cash.tier, TIERS.DECLARE_APPROVE);
    assert.equal(cash.requiresApproval, true);
  });
});

describe('GiftRegister — approval flow (append-only)', () => {
  test('9) approveGift appends accept decision and flips status to approved', () => {
    const reg = makeRegister();
    const gift = declareOne(reg, { estimatedValue: 1500 });
    const updated = reg.approveGift({
      giftId: gift.giftId,
      approverId: 'mgr-001',
      decision: DECISIONS.ACCEPT,
      notes: 'Low value, long relationship, transparent.',
      notesHe: 'ערך נמוך, קשר ארוך, שקוף.',
    });
    assert.equal(updated.status, GIFT_STATUS.APPROVED);
    assert.equal(updated.decisions.length, 1);
    assert.equal(updated.decisions[0].approverId, 'mgr-001');
    assert.ok(updated.decisions[0].notesHe);
  });

  test('10) approveGift supports all four decisions and append-only chain', () => {
    const reg = makeRegister();
    const gift = declareOne(reg, { estimatedValue: 1200 });
    reg.approveGift({ giftId: gift.giftId, approverId: 'mgr-1', decision: DECISIONS.ACCEPT, notes: 'ok' });
    reg.approveGift({ giftId: gift.giftId, approverId: 'mgr-2', decision: DECISIONS.DONATE_TO_CHARITY, notes: 'donate' });
    reg.approveGift({ giftId: gift.giftId, approverId: 'mgr-3', decision: DECISIONS.FORFEIT, notes: 'forfeit' });
    const final = reg.approveGift({ giftId: gift.giftId, approverId: 'mgr-4', decision: DECISIONS.RETURN, notes: 'return' });
    assert.equal(final.decisions.length, 4);
    // append-only — the first decision still exists
    assert.equal(final.decisions[0].decision, DECISIONS.ACCEPT);
    assert.equal(final.decisions[3].decision, DECISIONS.RETURN);
    assert.equal(final.status, GIFT_STATUS.RETURNED);
  });

  test('11) approveGift rejects unknown decisions and missing gifts', () => {
    const reg = makeRegister();
    const gift = declareOne(reg, { estimatedValue: 1500 });
    assert.throws(
      () => reg.approveGift({ giftId: gift.giftId, approverId: 'm', decision: 'eat-it' }),
      /UNKNOWN_DECISION/
    );
    assert.throws(
      () => reg.approveGift({ giftId: 'GIFT-999999', approverId: 'm', decision: DECISIONS.ACCEPT }),
      /GIFT_NOT_FOUND/
    );
  });
});

describe('GiftRegister — history & conflict of interest', () => {
  test('12) giftHistory filters by employeeId and giverId', () => {
    const reg = makeRegister();
    declareOne(reg, { employeeId: 'emp-A', givenBy: 'v-1', estimatedValue: 150 });
    declareOne(reg, { employeeId: 'emp-A', givenBy: 'v-2', estimatedValue: 300 });
    declareOne(reg, { employeeId: 'emp-B', givenBy: 'v-1', estimatedValue: 600 });
    const empA = reg.giftHistory({ employeeId: 'emp-A' });
    assert.equal(empA.length, 2);
    const givenByV1 = reg.giftHistory({ giverId: 'v-1' });
    assert.equal(givenByV1.length, 2);
    const bothFilters = reg.giftHistory({ employeeId: 'emp-A', giverId: 'v-1' });
    assert.equal(bothFilters.length, 1);
  });

  test('13) conflictOfInterestCheck flags current vendor with pending deal as HIGH severity', () => {
    const reg = makeRegister();
    reg.registerVendor('vendor-acme', {
      active: true,
      pendingDeals: ['RFQ-2026-044'],
      involvedEmployees: ['emp-101'],
    });
    const chk = reg.conflictOfInterestCheck({
      employeeId: 'emp-101',
      giver: { id: 'vendor-acme', nameHe: 'אקמי בע"מ' },
    });
    assert.equal(chk.conflict, true);
    assert.equal(chk.severity, 'high');
    assert.ok(chk.reasons.includes('current-vendor'));
    assert.ok(chk.reasons.includes('pending-deal'));
    assert.ok(chk.reasons.includes('employee-directly-involved'));
    assert.ok(chk.reasonsHe.some((r) => r.includes('ספק')));
  });

  test('14) conflict flags propagate into the declared gift record', () => {
    const reg = makeRegister();
    reg.registerVendor('vendor-acme', { active: true, pendingDeals: ['RFQ-01'] });
    const rec = declareOne(reg, { estimatedValue: 250 });
    assert.equal(rec.conflictSeverity, 'high');
    assert.ok(rec.conflictFlags.length > 0);
  });
});

describe('GiftRegister — public-sector stricter rules (§290-291)', () => {
  test('15) public-sector ₪400 gift must be refused', () => {
    const reg = makeRegister();
    const assessment = reg.publicSectorGift(
      { id: 'mayor-ramla', role: 'ראש עיר', giftType: GIFT_TYPES.PHYSICAL_GIFT },
      400
    );
    assert.equal(assessment.allowed, false);
    assert.equal(assessment.tier, TIERS.REFUSE);
    assert.match(assessment.statuteReference, /§290/);
    assert.ok(assessment.reasonHe.includes('חריגה'));
  });

  test('16) public-sector ₪90 coffee is within allowance', () => {
    const reg = makeRegister();
    const assessment = reg.publicSectorGift(
      { id: 'inspector', role: 'מפקח', giftType: GIFT_TYPES.MEAL },
      90
    );
    assert.equal(assessment.allowed, true);
    assert.equal(assessment.tier, TIERS.NONE);
  });

  test('17) declaring a public-sector gift uses the stricter policy', () => {
    const reg = makeRegister();
    const rec = declareOne(reg, {
      employeeId: 'emp-101',
      givenBy: 'gov-official',
      estimatedValue: 250,
      isPublicSector: true,
    });
    assert.equal(rec.policyKind, 'public');
    // 250 > public refuseAbove (300)? no — 250 is in declare-approve band
    // public: noDeclareBelow=100, declareOnlyMax=150, approvalMax=300
    assert.equal(rec.tier, TIERS.DECLARE_APPROVE);
  });
});

describe('GiftRegister — annual cumulative', () => {
  test('18) aggregateAnnual sums per-employee totals and flags ceiling breaches', () => {
    const reg = makeRegister();
    declareOne(reg, { employeeId: 'emp-A', estimatedValue: 400, date: '2026-01-15T08:00:00Z' });
    declareOne(reg, { employeeId: 'emp-A', estimatedValue: 900, date: '2026-02-20T08:00:00Z' });
    declareOne(reg, { employeeId: 'emp-A', estimatedValue: 1800, date: '2026-03-05T08:00:00Z' });
    // 2025 entry should be excluded
    declareOne(reg, { employeeId: 'emp-A', estimatedValue: 1000, date: '2025-12-31T08:00:00Z' });
    const agg = reg.aggregateAnnual('emp-A', 2026);
    assert.equal(agg.count, 3);
    assert.equal(agg.total, 3100);
    assert.equal(agg.exceededCeiling, true);
    assert.match(agg.messageHe, /תקרה/);
    // byGiver populated
    assert.ok(agg.byGiver.length > 0);
  });

  test('19) aggregateAnnual is within ceiling when cumulative ≤ 3,000', () => {
    const reg = makeRegister();
    declareOne(reg, { employeeId: 'emp-B', estimatedValue: 500, date: '2026-01-10T08:00:00Z' });
    declareOne(reg, { employeeId: 'emp-B', estimatedValue: 900, date: '2026-06-01T08:00:00Z' });
    const agg = reg.aggregateAnnual('emp-B', 2026);
    assert.equal(agg.exceededCeiling, false);
    assert.equal(agg.total, 1400);
  });
});

describe('GiftRegister — exceptions, training & reminders', () => {
  test('20) exceptionRequest attaches to gift and marks it under-exception', () => {
    const reg = makeRegister();
    const gift = declareOne(reg, { estimatedValue: 2500 });
    const exc = reg.exceptionRequest({
      giftId: gift.giftId,
      reason: 'Diplomatic delegation, protocol dictates acceptance',
      reasonHe: 'משלחת דיפלומטית, הפרוטוקול מחייב קבלה',
      approver: 'ceo-001',
    });
    assert.match(exc.exceptionId, /^EXC-/);
    const view = reg.giftHistory({ employeeId: gift.employeeId })[0];
    assert.equal(view.status, GIFT_STATUS.UNDER_EXCEPTION);
    assert.equal(view.exceptions.length, 1);
  });

  test('21) training() stores expiry and trainingStatus reports expiry window', () => {
    const clk = clockAt('2026-01-15T08:00:00.000Z');
    const reg = new GiftRegister({ now: clk });
    reg.training({ employeeId: 'emp-C', completed: '2026-01-15T08:00:00Z', expiryDays: 365 });
    const cur = reg.trainingStatus('emp-C');
    assert.equal(cur.valid, true);
    assert.equal(cur.daysLeft, 365);
    // fast-forward 400 days
    clk.advance(400);
    const expired = reg.trainingStatus('emp-C');
    assert.equal(expired.valid, false);
    assert.equal(expired.reason, 'expired');
    assert.match(expired.reasonHe, /פג/);
  });

  test('22) trainingStatus returns no-training-on-file for unknown employees', () => {
    const reg = makeRegister();
    const res = reg.trainingStatus('ghost-employee');
    assert.equal(res.valid, false);
    assert.equal(res.reason, 'no-training-on-file');
    assert.match(res.reasonHe, /אין/);
  });

  test('23) register90DayReminder issues bilingual reminders to all employees with history', () => {
    const reg = makeRegister();
    declareOne(reg, { employeeId: 'emp-X', estimatedValue: 200 });
    declareOne(reg, { employeeId: 'emp-Y', estimatedValue: 600 });
    const reminders = reg.register90DayReminder();
    assert.equal(reminders.length, 2);
    for (const r of reminders) {
      assert.match(r.reminderId, /^REM-/);
      assert.match(r.messageHe, /תזכורת/);
      assert.ok(r.messageEn.includes('ninety'));
      assert.equal(r.windowDays, 90);
    }
  });
});

describe('GiftRegister — audit, reporting & immutability', () => {
  test('24) auditReport produces bilingual statistics with refusals, conflicts, top givers', () => {
    const reg = makeRegister();
    reg.registerVendor('vendor-omega', { active: true });
    declareOne(reg, { employeeId: 'emp-A', givenBy: 'vendor-omega', estimatedValue: 150 });
    declareOne(reg, { employeeId: 'emp-A', givenBy: 'vendor-omega', estimatedValue: 3500 }); // refuse
    declareOne(reg, { employeeId: 'emp-B', givenBy: 'vendor-acme', estimatedValue: 400, declaredWithinDays: 30 }); // late
    const rep = reg.auditReport({ from: '2026-01-01', to: '2026-12-31' });
    assert.equal(rep.count, 3);
    assert.ok(rep.total >= 4050);
    assert.equal(rep.refusals, 1);
    assert.equal(rep.lateDeclarations, 1);
    assert.ok(rep.conflicts >= 1);
    assert.equal(rep.topGivers[0].giver, 'vendor-omega');
    assert.ok(rep.headerHe.includes('טכנו-קול'));
    assert.match(rep.disclaimerEn, /§290/);
    assert.ok(rep.byType[GIFT_TYPES.PHYSICAL_GIFT] >= 1);
  });

  test('25) auditLog is append-only and hash-chain verifies', () => {
    const reg = makeRegister();
    declareOne(reg, { estimatedValue: 150 });
    declareOne(reg, { estimatedValue: 1500 });
    reg.approveGift({
      giftId: reg.giftHistory()[1].giftId,
      approverId: 'mgr-1',
      decision: DECISIONS.ACCEPT,
      notes: 'ok',
    });
    const log = reg.auditLog();
    assert.ok(log.length >= 5);
    const verdict = reg.verifyChain();
    assert.equal(verdict.valid, true);
    // declared event exists
    assert.ok(log.some((e) => e.type === EVENT_TYPES.GIFT_DECLARED));
    assert.ok(log.some((e) => e.type === EVENT_TYPES.GIFT_APPROVED));
  });

  test('26) FX conversion — USD/EUR/GBP normalise to ILS', () => {
    const reg = makeRegister();
    const usd = declareOne(reg, { estimatedValue: 100, currency: 'USD' });
    const eur = declareOne(reg, { estimatedValue: 100, currency: 'EUR' });
    const gbp = declareOne(reg, { estimatedValue: 100, currency: 'GBP' });
    assert.equal(usd.valueIls, 375);
    assert.equal(eur.valueIls, 405);
    assert.equal(gbp.valueIls, 470);
    // unsupported currency rejected
    assert.throws(() => declareOne(reg, { currency: 'XYZ' }), /UNSUPPORTED_CURRENCY/);
  });
});
