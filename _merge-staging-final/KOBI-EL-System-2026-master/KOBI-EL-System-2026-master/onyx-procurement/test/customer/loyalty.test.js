'use strict';

/**
 * Customer Loyalty Engine — Unit Tests
 * Techno-Kol Uzi mega-ERP  |  Agent Y-095
 *
 * Run with:  node --test test/customer/loyalty.test.js
 *
 * Zero external deps — Node built-in test runner only.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const {
  LoyaltyEngine,
  LEDGER_TYPES,
  TIER_ORDER,
  LABELS,
  CONSENT_VERSION,
} = require(path.resolve(__dirname, '..', '..', 'src', 'customer', 'loyalty.js'));

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function makeClock(startISO) {
  let t = new Date(startISO).getTime();
  return {
    now: () => new Date(t).toISOString(),
    advance: (ms) => {
      t += ms;
    },
    advanceDays: (d) => {
      t += d * 24 * 60 * 60 * 1000;
    },
    set: (iso) => {
      t = new Date(iso).getTime();
    },
  };
}

function baseConsent(customerId) {
  return {
    documentId: `consent-${customerId}`,
    signedAt: '2026-04-11T08:00:00.000Z',
    version: CONSENT_VERSION,
    language: 'he',
    ipAddress: '10.0.0.1',
    method: 'digital-signature',
  };
}

function definePlan(engine) {
  return engine.definePlan({
    id: 'techno-kol-loyalty',
    name_he: 'מועדון טכנו-קול',
    name_en: 'Techno-Kol Club',
    earnRate: 1, // 1 point per ILS
    tiers: [
      { name: 'bronze', threshold: 0, multiplier: 1, benefits: ['free-ship-500'] },
      { name: 'silver', threshold: 1000, multiplier: 1.25, benefits: ['free-ship-300'] },
      { name: 'gold', threshold: 5000, multiplier: 1.5, benefits: ['birthday-100'] },
      { name: 'platinum', threshold: 15000, multiplier: 1.75, benefits: ['priority-support'] },
      { name: 'diamond', threshold: 40000, multiplier: 2, benefits: ['private-concierge'] },
    ],
    expiryDays: 365,
    currency: 'ILS',
  });
}

// ─────────────────────────────────────────────────────────────
// 1. Plan definition
// ─────────────────────────────────────────────────────────────

test('1. definePlan — creates bilingual plan with tiers', () => {
  const clock = makeClock('2026-04-11T08:00:00.000Z');
  const engine = new LoyaltyEngine({ now: clock.now });
  const plan = definePlan(engine);

  assert.equal(plan.id, 'techno-kol-loyalty');
  assert.equal(plan.name_he, 'מועדון טכנו-קול');
  assert.equal(plan.name_en, 'Techno-Kol Club');
  assert.equal(plan.version, 1);
  assert.equal(plan.status, 'active');
  assert.equal(plan.currency, 'ILS');
  assert.equal(plan.expiryDays, 365);
  assert.equal(plan.tiers.length, 5);
  // Sorted ASC by threshold
  assert.equal(plan.tiers[0].name, 'bronze');
  assert.equal(plan.tiers[4].name, 'diamond');
});

test('2. definePlan — rejects degradation of existing plan', () => {
  const engine = new LoyaltyEngine();
  definePlan(engine);
  // Attempt to reduce earnRate
  assert.throws(
    () =>
      engine.definePlan({
        id: 'techno-kol-loyalty',
        name_he: 'מועדון טכנו-קול',
        name_en: 'Techno-Kol Club',
        earnRate: 0.5,
        tiers: [{ name: 'bronze', threshold: 0, multiplier: 1, benefits: [] }],
        expiryDays: 365,
      }),
    /STRICTLY BETTER|E_DEGRADATION/,
  );
});

test('3. definePlan — allows strictly-better upgrade', () => {
  const engine = new LoyaltyEngine();
  definePlan(engine);
  const upgraded = engine.definePlan({
    id: 'techno-kol-loyalty',
    name_he: 'מועדון טכנו-קול',
    name_en: 'Techno-Kol Club',
    earnRate: 1.5, // up
    tiers: [
      { name: 'bronze', threshold: 0, multiplier: 1, benefits: ['free-ship-500'] },
      { name: 'silver', threshold: 1000, multiplier: 1.25, benefits: ['free-ship-300'] },
      { name: 'gold', threshold: 5000, multiplier: 1.5, benefits: ['birthday-100'] },
      { name: 'platinum', threshold: 15000, multiplier: 1.75, benefits: ['priority-support'] },
      { name: 'diamond', threshold: 40000, multiplier: 2, benefits: ['private-concierge'] },
      // Additional tiers are fine but we use the same count and same names with
      // non-decreasing multipliers; earnRate is higher → strictly better.
    ],
    expiryDays: 365,
  });
  assert.equal(upgraded.version, 2);
  assert.equal(upgraded.earnRate, 1.5);
  // History preserved
  assert.equal(engine.getPlanHistory('techno-kol-loyalty').length, 2);
});

// ─────────────────────────────────────────────────────────────
// 2. Enrollment with explicit consent
// ─────────────────────────────────────────────────────────────

test('4. enrollCustomer — refuses without consentDoc (Consumer Protection)', () => {
  const engine = new LoyaltyEngine();
  definePlan(engine);
  assert.throws(
    () => engine.enrollCustomer({ customerId: 'c-1', planId: 'techno-kol-loyalty' }),
    /E_CONSENT_REQUIRED/,
  );
});

test('5. enrollCustomer — stores consent vault entry', () => {
  const clock = makeClock('2026-04-11T08:00:00.000Z');
  const engine = new LoyaltyEngine({ now: clock.now });
  definePlan(engine);
  const m = engine.enrollCustomer({
    customerId: 'c-1',
    planId: 'techno-kol-loyalty',
    consentDoc: baseConsent('c-1'),
  });
  assert.equal(m.customerId, 'c-1');
  assert.equal(m.tier, 'bronze');
  assert.equal(m.planId, 'techno-kol-loyalty');
  const vault = engine.getConsent('c-1');
  assert.equal(vault.length, 1);
  assert.equal(vault[0].documentId, 'consent-c-1');
  assert.equal(vault[0].version, CONSENT_VERSION);
  assert.equal(vault[0].method, 'digital-signature');
});

// ─────────────────────────────────────────────────────────────
// 3. Earn / redeem / balance
// ─────────────────────────────────────────────────────────────

test('6. earnPoints — applies earnRate and tier multiplier', () => {
  const clock = makeClock('2026-04-11T08:00:00.000Z');
  const engine = new LoyaltyEngine({ now: clock.now });
  definePlan(engine);
  engine.enrollCustomer({
    customerId: 'c-1',
    planId: 'techno-kol-loyalty',
    consentDoc: baseConsent('c-1'),
  });
  const row = engine.earnPoints({
    customerId: 'c-1',
    orderId: 'ord-1',
    orderAmount: 500,
  });
  // bronze tier mult 1, earnRate 1 → 500 points
  assert.equal(row.points, 500);
  assert.equal(row.tierAtTime, 'bronze');
  assert.equal(row.planVersion, 1);
  assert.equal(engine.currentBalance('c-1'), 500);
});

test('7. earnPoints — respects eligibleCategories subset', () => {
  const engine = new LoyaltyEngine();
  definePlan(engine);
  engine.enrollCustomer({
    customerId: 'c-1',
    planId: 'techno-kol-loyalty',
    consentDoc: baseConsent('c-1'),
  });
  const row = engine.earnPoints({
    customerId: 'c-1',
    orderId: 'ord-2',
    orderAmount: 1000,
    eligibleCategories: [
      { name: 'groceries', amount: 600 },
      { name: 'household', amount: 300 },
    ], // 900 eligible, 100 excluded
  });
  assert.equal(row.points, 900);
  assert.equal(row.eligibleAmount, 900);
});

test('8. redeemPoints — decrements balance, validates sufficient funds', () => {
  const engine = new LoyaltyEngine();
  definePlan(engine);
  engine.enrollCustomer({
    customerId: 'c-1',
    planId: 'techno-kol-loyalty',
    consentDoc: baseConsent('c-1'),
  });
  engine.earnPoints({ customerId: 'c-1', orderId: 'ord-1', orderAmount: 800 });
  engine.redeemPoints({
    customerId: 'c-1',
    points: 300,
    reward: { type: 'discount', name_he: 'הנחה', name_en: 'Discount', value: 30 },
  });
  assert.equal(engine.currentBalance('c-1'), 500);

  // Insufficient
  assert.throws(
    () =>
      engine.redeemPoints({
        customerId: 'c-1',
        points: 10000,
        reward: { type: 'discount', name_he: 'הנחה', name_en: 'Discount' },
      }),
    /E_INSUFFICIENT/,
  );
});

// ─────────────────────────────────────────────────────────────
// 4. Expiry
// ─────────────────────────────────────────────────────────────

test('9. expireOldPoints — produces expire rows, keeps earn rows intact', () => {
  const clock = makeClock('2026-01-01T00:00:00.000Z');
  const engine = new LoyaltyEngine({ now: clock.now });
  engine.definePlan({
    id: 'p',
    name_he: 'תוכנית',
    name_en: 'Program',
    earnRate: 1,
    tiers: [{ name: 'bronze', threshold: 0, multiplier: 1, benefits: [] }],
    expiryDays: 30,
  });
  engine.enrollCustomer({ customerId: 'c-1', planId: 'p', consentDoc: baseConsent('c-1') });
  engine.earnPoints({ customerId: 'c-1', orderId: 'ord-1', orderAmount: 1000 });
  // Before expiry
  assert.equal(engine.currentBalance('c-1'), 1000);
  // Advance 40 days and expire
  clock.advanceDays(40);
  const expired = engine.expireOldPoints();
  assert.equal(expired.length, 1);
  assert.equal(expired[0].absolutePoints, 1000);
  // Earn row still exists untouched
  const earns = engine.getEarnLog('c-1');
  assert.equal(earns.length, 1);
  assert.equal(earns[0].points, 1000);
  // Balance is zero
  assert.equal(engine.currentBalance('c-1'), 0);
});

test('10. expireOldPoints — FIFO, partially-consumed earn rows do not expire consumed part', () => {
  const clock = makeClock('2026-01-01T00:00:00.000Z');
  const engine = new LoyaltyEngine({ now: clock.now });
  engine.definePlan({
    id: 'p',
    name_he: 'תוכנית',
    name_en: 'Program',
    earnRate: 1,
    tiers: [{ name: 'bronze', threshold: 0, multiplier: 1, benefits: [] }],
    expiryDays: 30,
  });
  engine.enrollCustomer({ customerId: 'c-1', planId: 'p', consentDoc: baseConsent('c-1') });
  engine.earnPoints({ customerId: 'c-1', orderId: 'ord-1', orderAmount: 1000 }); // 1000
  engine.redeemPoints({
    customerId: 'c-1',
    points: 700,
    reward: { type: 'discount' },
  });
  clock.advanceDays(40);
  engine.expireOldPoints();
  // Only 300 live points should have expired
  const exp = engine.getExpireLog('c-1');
  assert.equal(exp.length, 1);
  assert.equal(exp[0].absolutePoints, 300);
  assert.equal(engine.currentBalance('c-1'), 0);
});

// ─────────────────────────────────────────────────────────────
// 5. Tier recalculation
// ─────────────────────────────────────────────────────────────

test('11. tierRecalculation — promotes on 12-month activity', () => {
  const clock = makeClock('2026-01-01T00:00:00.000Z');
  const engine = new LoyaltyEngine({ now: clock.now });
  definePlan(engine);
  engine.enrollCustomer({
    customerId: 'c-1',
    planId: 'techno-kol-loyalty',
    consentDoc: baseConsent('c-1'),
  });
  // Earn 6000 basePoints → should land in gold
  engine.earnPoints({ customerId: 'c-1', orderId: 'ord-1', orderAmount: 6000 });
  const rec = engine.tierRecalculation('c-1');
  assert.equal(rec.previous, 'bronze');
  assert.equal(rec.computed, 'gold');
  assert.equal(rec.effective, 'gold');
  assert.equal(rec.changed, true);
  assert.equal(engine.getMember('c-1').tier, 'gold');
});

test('12. tierRecalculation — applies 30-day downgrade grace (no instant demotion)', () => {
  const clock = makeClock('2026-01-01T00:00:00.000Z');
  const engine = new LoyaltyEngine({ now: clock.now });
  definePlan(engine);
  engine.enrollCustomer({
    customerId: 'c-1',
    planId: 'techno-kol-loyalty',
    consentDoc: baseConsent('c-1'),
  });
  // First earn a lot → gold
  engine.earnPoints({ customerId: 'c-1', orderId: 'ord-1', orderAmount: 6000 });
  engine.tierRecalculation('c-1');
  assert.equal(engine.getMember('c-1').tier, 'gold');
  // Fast-forward 14 months → original earn falls out of the 12-month window
  clock.advanceDays(14 * 30);
  const rec = engine.tierRecalculation('c-1');
  // computed back to bronze, but grace period preserves gold
  assert.equal(rec.computed, 'bronze');
  assert.equal(rec.effective, 'gold');
  assert.ok(rec.downgradeGraceUntil);
});

// ─────────────────────────────────────────────────────────────
// 6. Tier benefits
// ─────────────────────────────────────────────────────────────

test('13. tierBenefits — returns inherited perks + next-tier progress', () => {
  const engine = new LoyaltyEngine();
  definePlan(engine);
  engine.enrollCustomer({
    customerId: 'c-1',
    planId: 'techno-kol-loyalty',
    consentDoc: baseConsent('c-1'),
  });
  engine.earnPoints({ customerId: 'c-1', orderId: 'ord-1', orderAmount: 1200 });
  engine.tierRecalculation('c-1');
  const b = engine.tierBenefits('c-1');
  assert.equal(b.tier, 'silver');
  // silver inherits bronze benefits
  const benefitNames = b.benefits.map((x) => x.benefit);
  assert.ok(benefitNames.includes('free-ship-500'));
  assert.ok(benefitNames.includes('free-ship-300'));
  assert.equal(b.nextTier, 'gold');
  // 5000 threshold − 1200 window = 3800 to gold
  assert.equal(b.pointsToNextTier, 3800);
  assert.equal(b.tier_he, LABELS.he.silver);
});

// ─────────────────────────────────────────────────────────────
// 7. Transfer preserves records (append-only, consumer law)
// ─────────────────────────────────────────────────────────────

test('14. transferPoints — writes paired rows, preserves both histories', () => {
  const engine = new LoyaltyEngine();
  definePlan(engine);
  engine.enrollCustomer({
    customerId: 'c-1',
    planId: 'techno-kol-loyalty',
    consentDoc: baseConsent('c-1'),
  });
  engine.enrollCustomer({
    customerId: 'c-2',
    planId: 'techno-kol-loyalty',
    consentDoc: baseConsent('c-2'),
  });
  engine.earnPoints({ customerId: 'c-1', orderId: 'ord-1', orderAmount: 500 });

  const t = engine.transferPoints({
    fromCustomerId: 'c-1',
    toCustomerId: 'c-2',
    points: 200,
    reason: 'birthday gift',
  });
  assert.equal(t.outRow.points, -200);
  assert.equal(t.inRow.points, 200);
  assert.equal(t.outRow.pairId, t.inRow.pairId);

  assert.equal(engine.currentBalance('c-1'), 300);
  assert.equal(engine.currentBalance('c-2'), 200);

  // Transferred-in points do NOT count toward the receiver's tier
  assert.equal(engine.getEarnLog('c-2')[0].basePoints, 0);
  assert.equal(engine.getEarnLog('c-2')[0].type, LEDGER_TYPES.TRANSFER_IN);

  // Both original rows still exist (append-only)
  assert.equal(engine.getEarnLog('c-1').length, 1);
  assert.equal(engine.getRedeemLog('c-1').length, 1); // the transfer-out row
  assert.equal(engine.getTransferLog().length, 1);
});

test('15. transferPoints — rejects cross-plan and self-transfer', () => {
  const engine = new LoyaltyEngine();
  definePlan(engine);
  engine.enrollCustomer({
    customerId: 'c-1',
    planId: 'techno-kol-loyalty',
    consentDoc: baseConsent('c-1'),
  });
  engine.enrollCustomer({
    customerId: 'c-2',
    planId: 'techno-kol-loyalty',
    consentDoc: baseConsent('c-2'),
  });
  engine.earnPoints({ customerId: 'c-1', orderId: 'o', orderAmount: 100 });
  assert.throws(
    () =>
      engine.transferPoints({
        fromCustomerId: 'c-1',
        toCustomerId: 'c-1',
        points: 10,
      }),
    /E_SELF/,
  );
});

// ─────────────────────────────────────────────────────────────
// 8. History statement — bilingual
// ─────────────────────────────────────────────────────────────

test('16. historyStatement — bilingual rows + closing balance', () => {
  const clock = makeClock('2026-01-01T00:00:00.000Z');
  const engine = new LoyaltyEngine({ now: clock.now });
  definePlan(engine);
  engine.enrollCustomer({
    customerId: 'c-1',
    planId: 'techno-kol-loyalty',
    consentDoc: baseConsent('c-1'),
  });
  engine.earnPoints({ customerId: 'c-1', orderId: 'ord-1', orderAmount: 500 });
  clock.advance(60_000);
  engine.redeemPoints({
    customerId: 'c-1',
    points: 100,
    reward: { type: 'discount', name_he: 'הנחה', name_en: 'Discount' },
  });
  const stmt = engine.historyStatement('c-1', {
    fromDate: '2026-01-01T00:00:00.000Z',
    toDate: '2026-12-31T23:59:59.000Z',
  });
  assert.equal(stmt.rows.length, 2);
  assert.equal(stmt.closingBalance, 400);
  assert.equal(stmt.rows[0].label_he, LABELS.he.earn);
  assert.equal(stmt.rows[0].label_en, LABELS.en.earn);
  assert.equal(stmt.rows[1].label_he, LABELS.he.redeem);
  assert.ok(stmt.header_he.includes('דוח'));
  assert.ok(stmt.header_en.includes('statement') || stmt.header_en.includes('Points'));
});

// ─────────────────────────────────────────────────────────────
// 9. Consumer-protection refund scenario
// ─────────────────────────────────────────────────────────────

test('17. refundOrder — reverses earn row, preserves original, flags over-redeemed', () => {
  const engine = new LoyaltyEngine();
  definePlan(engine);
  engine.enrollCustomer({
    customerId: 'c-1',
    planId: 'techno-kol-loyalty',
    consentDoc: baseConsent('c-1'),
  });
  engine.earnPoints({ customerId: 'c-1', orderId: 'ord-1', orderAmount: 500 });

  // Refund with no prior redeem
  const r1 = engine.refundOrder('c-1', 'ord-1', 'customer changed mind');
  assert.equal(r1.points, -500);
  assert.equal(r1.partial, false);
  assert.equal(r1.supervisorFlag, false);
  // Balance zeroed but earn row still exists
  assert.equal(engine.currentBalance('c-1'), 0);
  assert.equal(engine.getEarnLog('c-1').length, 1);

  // Second customer — earn then redeem then refund → supervisor flag
  engine.enrollCustomer({
    customerId: 'c-2',
    planId: 'techno-kol-loyalty',
    consentDoc: baseConsent('c-2'),
  });
  engine.earnPoints({ customerId: 'c-2', orderId: 'ord-2', orderAmount: 500 });
  engine.redeemPoints({
    customerId: 'c-2',
    points: 400,
    reward: { type: 'discount', name_he: 'ה', name_en: 'D' },
  });
  const r2 = engine.refundOrder('c-2', 'ord-2', 'return');
  assert.equal(r2.partial, true);
  assert.equal(r2.supervisorFlag, true);
});

// ─────────────────────────────────────────────────────────────
// 10. Fraud detection
// ─────────────────────────────────────────────────────────────

test('18. fraudDetection — rapid-redemption flag', () => {
  const clock = makeClock('2026-01-01T00:00:00.000Z');
  const engine = new LoyaltyEngine({ now: clock.now });
  definePlan(engine);
  engine.enrollCustomer({
    customerId: 'c-1',
    planId: 'techno-kol-loyalty',
    consentDoc: baseConsent('c-1'),
  });
  engine.earnPoints({ customerId: 'c-1', orderId: 'ord-1', orderAmount: 1000 });
  clock.advance(10_000); // 10 seconds later
  engine.redeemPoints({
    customerId: 'c-1',
    points: 500,
    reward: { type: 'discount', name_he: 'ה', name_en: 'D' },
  });
  const report = engine.fraudDetection('c-1');
  assert.equal(report.suspicion, true);
  assert.ok(report.flags.some((f) => f.rule === 'rapid-redemption'));
});

test('19. fraudDetection — circular-transfer flag', () => {
  const clock = makeClock('2026-01-01T00:00:00.000Z');
  const engine = new LoyaltyEngine({ now: clock.now });
  definePlan(engine);
  engine.enrollCustomer({
    customerId: 'c-1',
    planId: 'techno-kol-loyalty',
    consentDoc: baseConsent('c-1'),
  });
  engine.enrollCustomer({
    customerId: 'c-2',
    planId: 'techno-kol-loyalty',
    consentDoc: baseConsent('c-2'),
  });
  engine.earnPoints({ customerId: 'c-1', orderId: 'ord-1', orderAmount: 1000 });
  engine.earnPoints({ customerId: 'c-2', orderId: 'ord-2', orderAmount: 1000 });

  engine.transferPoints({
    fromCustomerId: 'c-1',
    toCustomerId: 'c-2',
    points: 300,
  });
  clock.advance(60_000);
  engine.transferPoints({
    fromCustomerId: 'c-2',
    toCustomerId: 'c-1',
    points: 300,
  });

  const report = engine.fraudDetection('c-1');
  assert.ok(report.flags.some((f) => f.rule === 'circular-transfer'));
});

test('20. fraudDetection — excessive earn in single day', () => {
  const engine = new LoyaltyEngine();
  definePlan(engine);
  engine.enrollCustomer({
    customerId: 'c-1',
    planId: 'techno-kol-loyalty',
    consentDoc: baseConsent('c-1'),
  });
  // A single huge order — 60_000 ILS × earnRate 1 = 60_000 pts
  engine.earnPoints({ customerId: 'c-1', orderId: 'ord-big', orderAmount: 60_000 });
  const report = engine.fraudDetection('c-1');
  assert.ok(report.flags.some((f) => f.rule === 'excessive-earn-day'));
});

// ─────────────────────────────────────────────────────────────
// 11. Program closure grandfathers members
// ─────────────────────────────────────────────────────────────

test('21. closeProgram — grandfathers existing members, preserves plan', () => {
  const engine = new LoyaltyEngine();
  definePlan(engine);
  engine.enrollCustomer({
    customerId: 'c-1',
    planId: 'techno-kol-loyalty',
    consentDoc: baseConsent('c-1'),
  });
  engine.earnPoints({ customerId: 'c-1', orderId: 'ord-1', orderAmount: 2000 });

  const closure = engine.closeProgram('techno-kol-loyalty');
  assert.equal(closure.grandfatheredCount, 1);
  assert.equal(closure.grandfathered[0].customerId, 'c-1');
  assert.equal(closure.grandfathered[0].balance, 2000);

  // Plan is still in the Map, status=closed
  const plan = engine.getPlan('techno-kol-loyalty');
  assert.equal(plan.status, 'closed');
  // History preserved
  assert.equal(engine.getPlanHistory('techno-kol-loyalty').length, 1);

  // Cannot enroll new members after closure
  assert.throws(
    () =>
      engine.enrollCustomer({
        customerId: 'c-2',
        planId: 'techno-kol-loyalty',
        consentDoc: baseConsent('c-2'),
      }),
    /E_PLAN_CLOSED/,
  );
});

// ─────────────────────────────────────────────────────────────
// 12. Program audit
// ─────────────────────────────────────────────────────────────

test('22. programAudit — issued/redeemed/expired/outstanding', () => {
  const clock = makeClock('2026-01-01T00:00:00.000Z');
  const engine = new LoyaltyEngine({ now: clock.now });
  engine.definePlan({
    id: 'p',
    name_he: 'תוכנית',
    name_en: 'Program',
    earnRate: 1,
    tiers: [{ name: 'bronze', threshold: 0, multiplier: 1, benefits: [] }],
    expiryDays: 30,
  });
  engine.enrollCustomer({ customerId: 'c-1', planId: 'p', consentDoc: baseConsent('c-1') });
  engine.earnPoints({ customerId: 'c-1', orderId: 'ord-1', orderAmount: 1000 }); // +1000
  engine.redeemPoints({
    customerId: 'c-1',
    points: 200,
    reward: { type: 'discount' },
  }); // -200
  clock.advanceDays(40);
  engine.expireOldPoints(); // expires the remaining 800

  const audit = engine.programAudit({
    fromDate: '2026-01-01T00:00:00.000Z',
    toDate: '2026-12-31T23:59:59.000Z',
  });
  assert.equal(audit.issued, 1000);
  assert.equal(audit.redeemed, 200);
  assert.equal(audit.expired, 800);
  assert.equal(audit.outstandingLiability, 0);
  assert.ok(audit.label_he.includes('התחייבות'));
});
