/**
 * Customer Loyalty Points — Unit Tests
 * Techno-Kol Uzi mega-ERP / Agent Y-095
 *
 * Run with:  node --test test/customer/loyalty-points.test.js
 *
 * Zero external deps — Node built-in test runner only.
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const {
  LoyaltyPoints,
  EARN_TYPES,
  REDEEM_TYPES,
  LEDGER_TYPES,
  LABELS,
  DEFAULT_REDEMPTION_PROBABILITY,
  _internal,
} = require(path.resolve(__dirname, '..', '..', 'src', 'customer', 'loyalty-points.js'));

// ─────────────────────────────────────────────────────────────
// Helpers — build a standard program + a deterministic clock
// ─────────────────────────────────────────────────────────────

function makeClock(startISO) {
  let t = new Date(startISO).getTime();
  return {
    now: () => new Date(t).toISOString(),
    advance: (ms) => {
      t += ms;
    },
    set: (iso) => {
      t = new Date(iso).getTime();
    },
  };
}

function setupProgram(clock) {
  const lp = new LoyaltyPoints({ now: clock.now });
  lp.defineProgram({
    id: 'techno-kol-rewards',
    name_he: 'כוכבי טכנו-קול',
    name_en: 'Techno-Kol Stars',
    earnRules: [
      { type: 'purchase', pointsPerUnit: 1, multiplier: 1 },
      { type: 'review', pointsPerUnit: 50, multiplier: 1 },
      { type: 'signup', pointsPerUnit: 100, multiplier: 1 },
      { type: 'referral', pointsPerUnit: 200, multiplier: 1 },
      { type: 'birthday', pointsPerUnit: 100, multiplier: 1 },
    ],
    redeemRules: [
      { type: 'discount', pointCost: 100, value: 10 }, // ₪0.10 / pt
      { type: 'shipping', pointCost: 200, value: 25 }, // ₪0.125 / pt
      { type: 'free-item', pointCost: 500, value: 60 },
      { type: 'gift-card', pointCost: 1000, value: 100 },
    ],
    tiers: [
      { name: 'bronze', threshold: 0, multiplier: 1.0, benefits: [] },
      { name: 'silver', threshold: 1000, multiplier: 1.25, benefits: ['free-shipping'] },
      { name: 'gold', threshold: 5000, multiplier: 1.5, benefits: ['free-shipping', 'priority-support'] },
      { name: 'platinum', threshold: 20000, multiplier: 2.0, benefits: ['free-shipping', 'priority-support', 'free-returns'] },
    ],
    expiryDays: 365,
  });
  return lp;
}

// ─────────────────────────────────────────────────────────────
// 1. DEFINE PROGRAM
// ─────────────────────────────────────────────────────────────

test('defineProgram: stores and freezes program, sorts tiers', () => {
  const clock = makeClock('2026-04-11T10:00:00Z');
  const lp = setupProgram(clock);
  assert.equal(lp.program.id, 'techno-kol-rewards');
  assert.equal(lp.program.earnRules.length, 5);
  assert.equal(lp.program.tiers[0].name, 'bronze');
  assert.equal(lp.program.tiers[3].name, 'platinum');
  assert.throws(() => {
    lp.program.expiryDays = 9999;
  }, /.*/); // frozen
});

test('defineProgram: throws on missing id / earnRules / tiers', () => {
  const lp = new LoyaltyPoints();
  assert.throws(() => lp.defineProgram({ earnRules: [{ type: 'purchase', pointsPerUnit: 1 }], tiers: [{ name: 'a', threshold: 0 }] }), /id/);
  assert.throws(
    () =>
      lp.defineProgram({
        id: 'x',
        earnRules: [],
        tiers: [{ name: 'a', threshold: 0 }],
      }),
    /earnRules/
  );
  assert.throws(
    () =>
      lp.defineProgram({
        id: 'x',
        earnRules: [{ type: 'purchase', pointsPerUnit: 1 }],
        tiers: [],
      }),
    /tiers/
  );
});

test('defineProgram: rejects unknown earn/redeem types', () => {
  const lp = new LoyaltyPoints();
  assert.throws(
    () =>
      lp.defineProgram({
        id: 'x',
        earnRules: [{ type: 'magic', pointsPerUnit: 1 }],
        tiers: [{ name: 'a', threshold: 0 }],
      }),
    /magic/
  );
  assert.throws(
    () =>
      lp.defineProgram({
        id: 'x',
        earnRules: [{ type: 'purchase', pointsPerUnit: 1 }],
        redeemRules: [{ type: 'hologram', pointCost: 10, value: 1 }],
        tiers: [{ name: 'a', threshold: 0 }],
      }),
    /hologram/
  );
});

// ─────────────────────────────────────────────────────────────
// 2. EARN / LEDGER
// ─────────────────────────────────────────────────────────────

test('earnPoints: posts to ledger with FIFO remaining counter', () => {
  const clock = makeClock('2026-04-11T10:00:00Z');
  const lp = setupProgram(clock);
  const entry = lp.earnPoints({
    customerId: 'c-1',
    event: { type: 'purchase' },
    units: 250,
  });
  assert.equal(entry.type, LEDGER_TYPES.EARN);
  assert.equal(entry.subtype, 'purchase');
  assert.equal(entry.points, 250);
  assert.equal(entry.remaining, 250);
  assert.equal(entry.earnedAt, '2026-04-11');
  assert.equal(entry.expiresAt, '2027-04-11');
  assert.equal(entry.tierAtTime, 'bronze');
  assert.ok(entry.fairValue > 0);
  assert.equal(lp.ledger.length, 1);
});

test('earnPoints: ledger is append-only — earn rows are frozen', () => {
  const clock = makeClock('2026-04-11T10:00:00Z');
  const lp = setupProgram(clock);
  const e = lp.earnPoints({ customerId: 'c-1', event: { type: 'purchase' }, units: 100 });
  assert.throws(() => {
    e.points = 999999;
  }, /.*/);
});

test('earnPoints: tier multiplier applies based on lifetime at time of earn', () => {
  const clock = makeClock('2026-04-11T10:00:00Z');
  const lp = setupProgram(clock);
  // Push past the silver threshold (1000 lifetime)
  lp.earnPoints({ customerId: 'c-1', event: { type: 'purchase' }, units: 1000 }); // +1000 (bronze)
  assert.equal(lp.balance('c-1').lifetime, 1000); // tier just reached silver
  // Next earn should get silver 1.25x multiplier
  const e2 = lp.earnPoints({ customerId: 'c-1', event: { type: 'purchase' }, units: 100 });
  assert.equal(e2.points, 125, '100 * 1.25 silver multiplier = 125');
});

test('earnPoints: throws on missing customerId / event / unknown type', () => {
  const clock = makeClock('2026-04-11T10:00:00Z');
  const lp = setupProgram(clock);
  assert.throws(() => lp.earnPoints({ event: { type: 'purchase' }, units: 1 }), /customerId/);
  assert.throws(() => lp.earnPoints({ customerId: 'c-1', units: 1 }), /event\.type/);
  assert.throws(
    () => lp.earnPoints({ customerId: 'c-1', event: { type: 'unknown' }, units: 1 }),
    /no earn rule/
  );
});

// ─────────────────────────────────────────────────────────────
// 3. REDEEM / BURN
// ─────────────────────────────────────────────────────────────

test('redeemPoints: burns FIFO across earn rows', () => {
  const clock = makeClock('2026-04-11T10:00:00Z');
  const lp = setupProgram(clock);
  lp.earnPoints({ customerId: 'c-1', event: { type: 'purchase' }, units: 60 }); // earn-1: 60
  clock.advance(86400 * 1000);
  lp.earnPoints({ customerId: 'c-1', event: { type: 'purchase' }, units: 60 }); // earn-2: 60
  // Redeem discount: 100 pt
  const burn = lp.redeemPoints({ customerId: 'c-1', redemption: { type: 'discount' } });
  assert.equal(burn.points, -100);
  // earn-1 fully consumed (60), earn-2 partially consumed (40 left)
  const earn1 = lp.ledger.find((r) => r.type === LEDGER_TYPES.EARN && r.id === 'led-00000001');
  const earn2 = lp.ledger.find((r) => r.type === LEDGER_TYPES.EARN && r.id === 'led-00000002');
  assert.equal(earn1.remaining, 0);
  assert.equal(earn2.remaining, 20);
});

test('redeemPoints: insufficient balance throws', () => {
  const clock = makeClock('2026-04-11T10:00:00Z');
  const lp = setupProgram(clock);
  lp.earnPoints({ customerId: 'c-1', event: { type: 'purchase' }, units: 50 });
  assert.throws(
    () => lp.redeemPoints({ customerId: 'c-1', redemption: { type: 'discount' } }),
    /insufficient/
  );
});

test('redeemPoints: unknown redemption type throws', () => {
  const clock = makeClock('2026-04-11T10:00:00Z');
  const lp = setupProgram(clock);
  lp.earnPoints({ customerId: 'c-1', event: { type: 'purchase' }, units: 500 });
  assert.throws(
    () => lp.redeemPoints({ customerId: 'c-1', redemption: { type: 'bogus' } }),
    /bogus/
  );
});

// ─────────────────────────────────────────────────────────────
// 4. BALANCE
// ─────────────────────────────────────────────────────────────

test('balance: current + expiring-soon + lifetime + tier', () => {
  const clock = makeClock('2026-04-11T10:00:00Z');
  const lp = setupProgram(clock);
  lp.earnPoints({ customerId: 'c-1', event: { type: 'purchase' }, units: 500 });
  // Push clock 340 days forward → 25 days to expiry
  clock.set('2027-03-17T10:00:00Z');
  const bal = lp.balance('c-1', { soonDays: 30 });
  assert.equal(bal.current, 500);
  assert.equal(bal.expiringSoon, 500);
  assert.equal(bal.lifetime, 500);
  assert.equal(bal.tier, 'bronze');
});

test('balance: empty customer returns zero across the board', () => {
  const clock = makeClock('2026-04-11T10:00:00Z');
  const lp = setupProgram(clock);
  const bal = lp.balance('does-not-exist');
  assert.equal(bal.current, 0);
  assert.equal(bal.expiringSoon, 0);
  assert.equal(bal.lifetime, 0);
});

// ─────────────────────────────────────────────────────────────
// 5. TIER PROGRESS + UPGRADE
// ─────────────────────────────────────────────────────────────

test('tierProgress: progress ratio, points-to-next, upgrade', () => {
  const clock = makeClock('2026-04-11T10:00:00Z');
  const lp = setupProgram(clock);
  lp.earnPoints({ customerId: 'c-1', event: { type: 'purchase' }, units: 500 });
  let tp = lp.tierProgress('c-1');
  assert.equal(tp.currentTier, 'bronze');
  assert.equal(tp.nextTier, 'silver');
  assert.equal(tp.pointsToNext, 500);
  assert.equal(tp.progressRatio, 0.5);

  // earn enough to upgrade to silver
  lp.earnPoints({ customerId: 'c-1', event: { type: 'purchase' }, units: 500 });
  tp = lp.tierProgress('c-1');
  assert.equal(tp.currentTier, 'silver');
  assert.equal(tp.nextTier, 'gold');
  assert.ok(tp.currentBenefits.includes('free-shipping'));
});

test('tierProgress: top-tier customer has null nextTier', () => {
  const clock = makeClock('2026-04-11T10:00:00Z');
  const lp = setupProgram(clock);
  // Big lump
  lp.earnPoints({ customerId: 'c-1', event: { type: 'purchase' }, units: 30000 });
  const tp = lp.tierProgress('c-1');
  assert.equal(tp.currentTier, 'platinum');
  assert.equal(tp.nextTier, null);
  assert.equal(tp.pointsToNext, 0);
});

// ─────────────────────────────────────────────────────────────
// 6. STATEMENT (BILINGUAL)
// ─────────────────────────────────────────────────────────────

test('statement: produces Hebrew and English text with all totals', () => {
  const clock = makeClock('2026-04-11T10:00:00Z');
  const lp = setupProgram(clock);
  lp.earnPoints({ customerId: 'c-1', event: { type: 'purchase' }, units: 200 });
  lp.redeemPoints({ customerId: 'c-1', redemption: { type: 'discount' } });
  const s = lp.statement('c-1', { from: '2026-01-01', to: '2026-12-31' });
  assert.ok(s.he.includes('כוכבי נאמנות'));
  assert.ok(s.he.includes('צבירה'));
  assert.ok(s.he.includes('שימוש'));
  assert.ok(s.en.includes('Loyalty points'));
  assert.ok(s.en.includes('Earned'));
  assert.ok(s.en.includes('Redeemed'));
  assert.equal(s.totals.earned, 200);
  assert.equal(s.totals.redeemed, 100);
  assert.equal(s.rows.length, 2);
});

test('statement: empty period returns noActivity line in both languages', () => {
  const clock = makeClock('2026-04-11T10:00:00Z');
  const lp = setupProgram(clock);
  lp.earnPoints({ customerId: 'c-1', event: { type: 'purchase' }, units: 200 });
  const s = lp.statement('c-1', { from: '2025-01-01', to: '2025-12-31' });
  assert.ok(s.he.includes(LABELS.noActivity.he));
  assert.ok(s.en.includes(LABELS.noActivity.en));
  assert.equal(s.rows.length, 0);
});

// ─────────────────────────────────────────────────────────────
// 7. EXPIRY (FIFO)
// ─────────────────────────────────────────────────────────────

test('expirePoints: FIFO — old earn rows expire first, recent survive', () => {
  const clock = makeClock('2026-01-01T00:00:00Z');
  const lp = setupProgram(clock);
  // earn #1 on Jan 1 2026 — expires 2027-01-01
  lp.earnPoints({ customerId: 'c-1', event: { type: 'purchase' }, units: 100 });
  // earn #2 on Aug 1 2026 — expires 2027-08-01
  clock.set('2026-08-01T00:00:00Z');
  lp.earnPoints({ customerId: 'c-1', event: { type: 'purchase' }, units: 200 });
  // Run expiry on 2027-03-01: earn #1 is expired (passed 2027-01-01), earn #2 still alive
  const res = lp.expirePoints({ asOfDate: '2027-03-01' });
  assert.equal(res.totalPointsExpired, 100);
  assert.equal(res.expired.length, 1);
  assert.equal(res.expired[0].sourceEarnId, 'led-00000001');
  // Balance check
  const bal = lp.balance('c-1');
  assert.equal(bal.current, 200, 'only earn #2 remains');
});

test('expirePoints: partial FIFO — already redeemed, then expired', () => {
  const clock = makeClock('2026-01-01T00:00:00Z');
  const lp = setupProgram(clock);
  lp.earnPoints({ customerId: 'c-1', event: { type: 'purchase' }, units: 500 }); // earn #1
  lp.redeemPoints({ customerId: 'c-1', redemption: { type: 'discount' } }); // burn 100
  // earn #1 now has remaining=400
  const res = lp.expirePoints({ asOfDate: '2030-01-01' });
  // Full remaining balance expires
  assert.equal(res.totalPointsExpired, 400);
});

test('expirePoints: nothing expires before cutoff', () => {
  const clock = makeClock('2026-01-01T00:00:00Z');
  const lp = setupProgram(clock);
  lp.earnPoints({ customerId: 'c-1', event: { type: 'purchase' }, units: 500 });
  const res = lp.expirePoints({ asOfDate: '2026-06-01' });
  assert.equal(res.totalPointsExpired, 0);
  assert.equal(res.expired.length, 0);
});

// ─────────────────────────────────────────────────────────────
// 8. BREAKAGE CALC
// ─────────────────────────────────────────────────────────────

test('breakageCalc: calculates expired/redeemed/outstanding rates', () => {
  const clock = makeClock('2026-01-01T00:00:00Z');
  const lp = setupProgram(clock);
  lp.earnPoints({ customerId: 'c-1', event: { type: 'purchase' }, units: 1000 }); // earn 1000
  lp.redeemPoints({ customerId: 'c-1', redemption: { type: 'discount' } }); // burn 100
  lp.expirePoints({ asOfDate: '2030-01-01' }); // expire remaining 900

  const br = lp.breakageCalc();
  assert.equal(br.totalEarnedGross, 1000);
  assert.equal(br.totalRedeemed, 100);
  assert.equal(br.totalExpired, 900);
  assert.equal(br.outstanding, 0);
  assert.equal(br.breakageRate, 0.9);
  assert.equal(br.redemptionRate, 0.1);
  assert.ok(br.reversalValueILS > 0, 'accrual reversal value must be positive');
});

// ─────────────────────────────────────────────────────────────
// 9. IFRS 15 LIABILITY
// ─────────────────────────────────────────────────────────────

test('liabilityProvision: IFRS 15 — deferred revenue equals outstanding × fair value × redemption probability', () => {
  const clock = makeClock('2026-01-01T00:00:00Z');
  const lp = setupProgram(clock);
  lp.earnPoints({ customerId: 'c-1', event: { type: 'purchase' }, units: 1000 });

  const prov = lp.liabilityProvision({ from: '2026-01-01', to: '2026-12-31' });
  assert.equal(prov.outstandingPoints, 1000);
  // fair value / point = max(10/100, 25/200, 60/500, 100/1000) = 0.125 (shipping rule)
  assert.equal(prov.fairValuePerPoint, 0.13, 'best fair value 0.125 ≈ 0.13 after round2');
  assert.equal(prov.redemptionProbability, DEFAULT_REDEMPTION_PROBABILITY);
  // 1000 × 0.13 × 0.7 = 91.00
  assert.equal(prov.closingLiabilityILS, 91);
  assert.equal(prov.journal.cr.account, 'contract-liability-loyalty-points');
  assert.equal(prov.journal.cr.amount, 91);
  assert.ok(prov.heMemo.includes('₪91'));
  assert.ok(prov.enMemo.includes('ILS 91'));
});

test('liabilityProvision: declines as points are redeemed', () => {
  const clock = makeClock('2026-01-01T00:00:00Z');
  const lp = setupProgram(clock);
  lp.earnPoints({ customerId: 'c-1', event: { type: 'purchase' }, units: 1000 });
  const prov1 = lp.liabilityProvision({ to: '2026-06-01' });
  lp.redeemPoints({ customerId: 'c-1', redemption: { type: 'discount' } });
  const prov2 = lp.liabilityProvision({ to: '2026-12-31' });
  assert.ok(prov2.closingLiabilityILS < prov1.closingLiabilityILS);
  assert.equal(prov2.outstandingPoints, 900);
});

// ─────────────────────────────────────────────────────────────
// 10. FRAUD RULES
// ─────────────────────────────────────────────────────────────

test('fraudRules: velocity detects > 10 earns per hour', () => {
  const clock = makeClock('2026-04-11T10:00:00Z');
  const lp = setupProgram(clock);
  for (let i = 0; i < 12; i++) {
    lp.earnPoints({
      customerId: 'c-1',
      event: { type: 'purchase', at: new Date(1744365600000 + i * 60000).toISOString() },
      units: 1,
    });
  }
  const fr = lp.fraudRules();
  assert.ok(fr.alerts.some((a) => a.rule === 'velocity-earns-per-hour'));
});

test('fraudRules: detects duplicate earn inside 30s window', () => {
  const clock = makeClock('2026-04-11T10:00:00Z');
  const lp = setupProgram(clock);
  lp.earnPoints({
    customerId: 'c-1',
    event: { type: 'purchase', at: '2026-04-11T10:00:00Z' },
    units: 10,
  });
  lp.earnPoints({
    customerId: 'c-1',
    event: { type: 'purchase', at: '2026-04-11T10:00:15Z' },
    units: 10,
  });
  const fr = lp.fraudRules();
  assert.ok(fr.alerts.some((a) => a.rule === 'duplicate-earn'));
});

test('fraudRules: geo mismatch flag — TLV→JFK in <1h', () => {
  const clock = makeClock('2026-04-11T10:00:00Z');
  const lp = setupProgram(clock);
  lp.earnPoints({
    customerId: 'c-1',
    event: { type: 'purchase', at: '2026-04-11T10:00:00Z', geo: { lat: 32.0853, lng: 34.7818 } }, // TLV
    units: 10,
  });
  lp.earnPoints({
    customerId: 'c-1',
    event: { type: 'purchase', at: '2026-04-11T10:30:00Z', geo: { lat: 40.6413, lng: -73.7781 } }, // JFK
    units: 10,
  });
  const fr = lp.fraudRules();
  assert.ok(fr.alerts.some((a) => a.rule === 'geo-mismatch'));
});

// ─────────────────────────────────────────────────────────────
// 11. CAMPAIGN POINTS
// ─────────────────────────────────────────────────────────────

test('campaignPoints: time-boxed multiplier applies to earns in window', () => {
  const clock = makeClock('2026-04-11T10:00:00Z');
  const lp = setupProgram(clock);
  lp.campaignPoints({
    customerSegment: 'all',
    multiplier: 2,
    duration: { from: '2026-04-01', to: '2026-04-30' },
  });
  const e = lp.earnPoints({ customerId: 'c-1', event: { type: 'purchase' }, units: 100 });
  assert.equal(e.points, 200, 'double-points campaign → 100 × 2 = 200');
});

test('campaignPoints: out-of-window earns are not boosted', () => {
  const clock = makeClock('2026-04-11T10:00:00Z');
  const lp = setupProgram(clock);
  lp.campaignPoints({
    customerSegment: 'all',
    multiplier: 3,
    duration: { from: '2026-01-01', to: '2026-01-31' },
  });
  const e = lp.earnPoints({ customerId: 'c-1', event: { type: 'purchase' }, units: 100 });
  assert.equal(e.points, 100, 'campaign expired → base 1x only');
});

test('campaignPoints: rejects invalid params', () => {
  const clock = makeClock('2026-04-11T10:00:00Z');
  const lp = setupProgram(clock);
  assert.throws(() => lp.campaignPoints({ multiplier: 2 }), /duration/);
  assert.throws(() =>
    lp.campaignPoints({ multiplier: -1, duration: { from: '2026-01-01', to: '2026-12-31' } })
  );
});

// ─────────────────────────────────────────────────────────────
// 12. GIFT TRANSFER
// ─────────────────────────────────────────────────────────────

test('giftTransfer: moves points between customers, both ledger rows', () => {
  const clock = makeClock('2026-04-11T10:00:00Z');
  const lp = setupProgram(clock);
  lp.earnPoints({ customerId: 'c-1', event: { type: 'purchase' }, units: 500 });
  const { outRow, inRow } = lp.giftTransfer({
    fromCustomer: 'c-1',
    toCustomer: 'c-2',
    points: 200,
    reason: 'birthday',
  });
  assert.equal(outRow.type, LEDGER_TYPES.TRANSFER_OUT);
  assert.equal(inRow.type, LEDGER_TYPES.TRANSFER_IN);
  assert.equal(outRow.points, -200);
  assert.equal(inRow.points, 200);
  assert.equal(lp.balance('c-1').current, 300);
  assert.equal(lp.balance('c-2').current, 200);
});

test('giftTransfer: self-transfer and overdraft rejected', () => {
  const clock = makeClock('2026-04-11T10:00:00Z');
  const lp = setupProgram(clock);
  lp.earnPoints({ customerId: 'c-1', event: { type: 'purchase' }, units: 100 });
  assert.throws(
    () => lp.giftTransfer({ fromCustomer: 'c-1', toCustomer: 'c-1', points: 50 }),
    /===/
  );
  assert.throws(
    () => lp.giftTransfer({ fromCustomer: 'c-1', toCustomer: 'c-2', points: 500 }),
    /insufficient/
  );
});

// ─────────────────────────────────────────────────────────────
// 13. INTEGRATION — full ledger walkthrough
// ─────────────────────────────────────────────────────────────

test('integration: earn → upgrade → redeem → expire → liability drops → breakage rises', () => {
  const clock = makeClock('2026-01-01T00:00:00Z');
  const lp = setupProgram(clock);

  // Phase 1: earn enough for silver
  lp.earnPoints({ customerId: 'c-1', event: { type: 'signup' }, units: 1 }); // 100
  lp.earnPoints({ customerId: 'c-1', event: { type: 'purchase' }, units: 900 }); // +900 → 1000 (silver reached)
  assert.equal(lp.tierProgress('c-1').currentTier, 'silver');

  // Phase 2: redeem a discount
  lp.redeemPoints({ customerId: 'c-1', redemption: { type: 'discount' } }); // -100
  assert.equal(lp.balance('c-1').current, 900);

  // Phase 3: forward 2 years → everything expires
  lp.expirePoints({ asOfDate: '2028-01-02' });
  assert.equal(lp.balance('c-1').current, 0);

  // Phase 4: breakage now dominant
  const br = lp.breakageCalc();
  assert.ok(br.breakageRate > 0.5);

  // Phase 5: liability after everything expires = 0
  const prov = lp.liabilityProvision({ to: '2028-12-31' });
  assert.equal(prov.closingLiabilityILS, 0);
  assert.equal(prov.outstandingPoints, 0);
});

// ─────────────────────────────────────────────────────────────
// 14. INTERNAL HELPERS
// ─────────────────────────────────────────────────────────────

test('internal: addDays handles year rollover', () => {
  assert.equal(_internal.addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(_internal.addDays('2026-01-01', 365), '2027-01-01');
});

test('internal: haversineKm — TLV to JFK ~9100 km', () => {
  const km = _internal.haversineKm(
    { lat: 32.0853, lng: 34.7818 },
    { lat: 40.6413, lng: -73.7781 }
  );
  assert.ok(km > 9000 && km < 9300);
});

test('internal: round2 — ILS-safe rounding', () => {
  // Note: 1.005 × 100 = 100.49999… under IEEE-754, so Math.round → 100
  // (classic JS "banker's" edge case). We document this instead of pretending.
  assert.equal(_internal.round2(1.006), 1.01);
  assert.equal(_internal.round2(1.004), 1);
  assert.equal(_internal.round2(0), 0);
  assert.equal(_internal.round2(2.345), 2.35);
  assert.equal(_internal.round2(null), 0);
});
