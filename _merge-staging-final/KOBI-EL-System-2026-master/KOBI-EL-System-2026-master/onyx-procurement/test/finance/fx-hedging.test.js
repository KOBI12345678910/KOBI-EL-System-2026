/**
 * FX Hedging Tracker — Unit Tests
 * Agent AG-Y084 | Techno-Kol Uzi mega-ERP | 2026-04-11
 *
 * Covers:
 *   1.  recordHedge — happy path (forward)
 *   2.  recordHedge — validation errors
 *   3.  recordHedge — duplicates rejected
 *   4.  exposureReport — netting + hedge offset
 *   5.  exposureReport — filter by currency + period
 *   6.  markToMarket — forward linear
 *   7.  markToMarket — option intrinsic only
 *   8.  markToMarket — collar corridor bounded
 *   9.  hedgeEffectiveness — IFRS 9 in-band
 *  10.  hedgeEffectiveness — IFRS 9 out-of-band
 *  11.  hedgeEffectiveness — zero movement trivial
 *  12.  maturityLadder — bucketing
 *  13.  counterpartyExposure — concentration by bank
 *  14.  rolloverSchedule — rule-compliant (no delete, archive)
 *  15.  rolloverSchedule — rejects older maturity
 *  16.  gainLoss — realized / unrealized split
 *  17.  hedgeRatio — numeric + object inputs + classification
 *  18.  policyCompliance — instruments / currencies / tenor / ratio / concentration
 *  19.  generateHedgeReport — PDF + SVG + summary
 *  20.  READ-ONLY ENFORCEMENT — trade / executeTrade / placeOrder all throw
 *  21.  audit log accumulates
 *  22.  bilingual labels present on public outputs
 *
 * Run with:
 *   node --test test/finance/fx-hedging.test.js
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const mod = require(
  path.resolve(__dirname, '..', '..', 'src', 'finance', 'fx-hedging.js')
);
const { FXHedgingTracker, FXHedgingError, ERROR_CODES, HEDGE_TYPES, STATUSES } =
  mod;

// Floating-point tolerant equality helper
function approx(actual, expected, eps = 1e-6) {
  assert.ok(
    Math.abs(actual - expected) < eps,
    `expected ≈ ${expected}, got ${actual}`
  );
}

// Deterministic clock helper for period-sensitive tests
function fixedClock(iso) {
  return () => iso;
}

function makeTracker(clockISO = '2026-04-11') {
  return new FXHedgingTracker({
    baseCurrency: 'ILS',
    clock: fixedClock(clockISO),
  });
}

function baseHedge(overrides = {}) {
  return {
    id: 'FWD-001',
    type: 'forward',
    notional: 100_000,
    base: 'ILS',
    quote: 'USD',
    rate: 3.7,
    maturityDate: '2026-07-11',
    counterparty: 'LEUMI',
    purpose: 'transactional',
    hedgedItem: { initialRate: 3.7, currentRate: 3.85, notional: 100_000 },
    ...overrides,
  };
}

// ────────────────────────────────────────────────────────────────────
test('01 recordHedge stores a forward and returns a frozen record', () => {
  const t = makeTracker();
  const rec = t.recordHedge(baseHedge());
  assert.equal(rec.id, 'FWD-001');
  assert.equal(rec.type, 'forward');
  assert.equal(rec.status, STATUSES.ACTIVE);
  assert.equal(rec.label.he, 'פורוורד');
  assert.equal(rec.purposeLabel.he, 'חשיפת עסקה');
  assert.throws(() => {
    rec.notional = 999;
  });
});

test('02 recordHedge validates required/typed fields', () => {
  const t = makeTracker();
  assert.throws(
    () => t.recordHedge({ ...baseHedge(), id: '' }),
    (e) => e.code === ERROR_CODES.INVALID_HEDGE
  );
  assert.throws(
    () => t.recordHedge({ ...baseHedge(), type: 'swaption' }),
    (e) => e.code === ERROR_CODES.INVALID_HEDGE
  );
  assert.throws(
    () => t.recordHedge({ ...baseHedge(), notional: -1 }),
    (e) => e.code === ERROR_CODES.INVALID_HEDGE
  );
  assert.throws(
    () => t.recordHedge({ ...baseHedge(), base: 'US' }),
    (e) => e.code === ERROR_CODES.INVALID_HEDGE
  );
  assert.throws(
    () => t.recordHedge({ ...baseHedge(), base: 'USD', quote: 'USD' }),
    (e) => e.code === ERROR_CODES.INVALID_HEDGE
  );
  assert.throws(
    () => t.recordHedge({ ...baseHedge(), rate: 0 }),
    (e) => e.code === ERROR_CODES.INVALID_RATE
  );
  assert.throws(
    () => t.recordHedge({ ...baseHedge(), purpose: 'speculation' }),
    (e) => e.code === ERROR_CODES.INVALID_HEDGE
  );
});

test('03 recordHedge rejects duplicates — never delete, never overwrite', () => {
  const t = makeTracker();
  t.recordHedge(baseHedge());
  assert.throws(
    () => t.recordHedge(baseHedge()),
    (e) => e.code === ERROR_CODES.DUPLICATE_HEDGE
  );
});

test('04 exposureReport nets receivables/payables/commitments and subtracts hedged', () => {
  const t = makeTracker();
  t.addExposure({ kind: 'receivable', amount: 500_000, currency: 'USD', dueDate: '2026-06-01' });
  t.addExposure({ kind: 'payable', amount: 120_000, currency: 'USD', dueDate: '2026-06-15' });
  t.addExposure({ kind: 'commitment', amount: 80_000, currency: 'USD', dueDate: '2026-07-01' });

  t.recordHedge({
    ...baseHedge({ notional: 200_000, maturityDate: '2026-07-01' }),
  });

  const rep = t.exposureReport({ currency: 'USD' });
  const usd = rep.byCurrency.USD;
  assert.equal(usd.receivables, 500_000);
  assert.equal(usd.payables, 120_000);
  assert.equal(usd.commitments, 80_000);
  assert.equal(usd.hedged, 200_000);
  // gross = 500 − 120 − 80 = 300
  assert.equal(usd.grossExposure, 300_000);
  // net = |300| − min(|300|,200) = 100
  assert.equal(usd.netExposure, 100_000);
  // bilingual label present
  assert.ok(usd.label.he.includes('USD'));
});

test('05 exposureReport filters by currency and period', () => {
  const t = makeTracker();
  t.addExposure({ kind: 'receivable', amount: 100_000, currency: 'EUR', dueDate: '2026-05-01' });
  t.addExposure({ kind: 'receivable', amount: 200_000, currency: 'EUR', dueDate: '2026-09-01' });

  const inWindow = t.exposureReport({
    currency: 'EUR',
    period: { from: '2026-04-01', to: '2026-06-30' },
  });
  assert.equal(inWindow.byCurrency.EUR.receivables, 100_000);

  const outOfWindow = t.exposureReport({
    currency: 'USD',
    period: { from: '2026-01-01', to: '2026-12-31' },
  });
  assert.deepEqual(outOfWindow.currencies, []);
});

test('06 markToMarket — forward linear payoff', () => {
  const t = makeTracker();
  t.recordHedge(baseHedge({ rate: 3.7, notional: 100_000 }));
  const m = t.markToMarket({ hedgeId: 'FWD-001', currentRate: 3.8 });
  // mtm = 100_000 * (3.8 − 3.7) = 10_000
  assert.equal(m.mtm, 10_000);
  assert.equal(m.method, 'linear-forward');
  assert.equal(m.label.he, 'שווי הוגן עדכני');
});

test('07 markToMarket — option intrinsic-only, never negative', () => {
  const t = makeTracker();
  t.recordHedge({
    ...baseHedge({
      id: 'OPT-01',
      type: 'option',
      rate: 3.7,
      notional: 50_000,
      hedgedItem: { initialRate: 3.7, currentRate: 3.65, optionKind: 'call' },
    }),
  });
  // Call below strike → intrinsic = 0
  let m = t.markToMarket({ hedgeId: 'OPT-01', currentRate: 3.6 });
  assert.equal(m.mtm, 0);
  assert.equal(m.method, 'intrinsic-only');
  // Call above strike — allow for binary rounding
  m = t.markToMarket({ hedgeId: 'OPT-01', currentRate: 3.9 });
  approx(m.mtm, 50_000 * 0.2, 1e-3);
});

test('08 markToMarket — collar is bounded by cap/floor', () => {
  const t = makeTracker();
  t.recordHedge({
    ...baseHedge({
      id: 'COL-01',
      type: 'collar',
      rate: 3.7,
      notional: 100_000,
      hedgedItem: { initialRate: 3.7, currentRate: 3.7, cap: 3.85, floor: 3.55 },
    }),
  });
  // Above cap — capped
  let m = t.markToMarket({ hedgeId: 'COL-01', currentRate: 4.2 });
  approx(m.mtm, 100_000 * (3.85 - 3.7), 1e-3);
  // Below floor — floored
  m = t.markToMarket({ hedgeId: 'COL-01', currentRate: 3.1 });
  approx(m.mtm, 100_000 * (3.55 - 3.7), 1e-3);
});

test('09 hedgeEffectiveness — IFRS 9 in-band ratio qualifies', () => {
  const t = makeTracker();
  // Forward matches item 1:1 → ratio should be very close to 1
  t.recordHedge(baseHedge({ hedgedItem: { initialRate: 3.7, currentRate: 3.85, notional: 100_000 } }));
  const eff = t.hedgeEffectiveness('FWD-001');
  assert.equal(eff.standard, 'IFRS 9');
  assert.ok(eff.effective, `expected effective, got ratio ${eff.ratio}`);
  assert.ok(eff.ratio >= 0.8 && eff.ratio <= 1.25);
  assert.equal(eff.label.he, 'יעילות גידור תקפה לפי IFRS 9');
});

test('10 hedgeEffectiveness — out-of-band fails', () => {
  const t = makeTracker();
  // Mismatch: hedged 1:1 but the underlying notional is 4× the hedge
  t.recordHedge(
    baseHedge({
      notional: 25_000,
      hedgedItem: { initialRate: 3.7, currentRate: 3.85, notional: 100_000 },
    })
  );
  const eff = t.hedgeEffectiveness('FWD-001');
  assert.equal(eff.effective, false);
  assert.ok(eff.ratio < 0.8 || eff.ratio > 1.25);
});

test('11 hedgeEffectiveness — zero movement is trivially effective', () => {
  const t = makeTracker();
  t.recordHedge(
    baseHedge({ hedgedItem: { initialRate: 3.7, currentRate: 3.7, notional: 100_000 } })
  );
  const eff = t.hedgeEffectiveness('FWD-001');
  assert.equal(eff.effective, true);
  assert.equal(eff.ratio, 1);
});

test('12 maturityLadder buckets by days-to-maturity', () => {
  const t = makeTracker('2026-04-11');
  t.recordHedge({ ...baseHedge({ id: 'H-1', maturityDate: '2026-04-15' }) }); // 4d
  t.recordHedge({ ...baseHedge({ id: 'H-2', maturityDate: '2026-05-01' }) }); // 20d
  t.recordHedge({ ...baseHedge({ id: 'H-3', maturityDate: '2026-06-15' }) }); // 65d
  t.recordHedge({ ...baseHedge({ id: 'H-4', maturityDate: '2026-10-15' }) }); // 187d
  t.recordHedge({ ...baseHedge({ id: 'H-OVD', maturityDate: '2026-03-01' }) }); // overdue

  const lad = t.maturityLadder();
  assert.equal(lad.buckets.d0_7.items.length, 1);
  assert.equal(lad.buckets.d8_30.items.length, 1);
  assert.equal(lad.buckets.d31_90.items.length, 1);
  assert.equal(lad.buckets.d181_plus.items.length, 1);
  assert.equal(lad.buckets.overdue.items.length, 1);
  assert.equal(lad.buckets.d0_7.total, 100_000);
  assert.equal(lad.buckets.d0_7.label.he, 'עד שבוע');
});

test('13 counterpartyExposure aggregates outstanding notional per bank', () => {
  const t = makeTracker();
  t.recordHedge({ ...baseHedge({ id: 'H1', counterparty: 'LEUMI', notional: 100_000 }) });
  t.recordHedge({ ...baseHedge({ id: 'H2', counterparty: 'LEUMI', notional: 250_000 }) });
  t.recordHedge({ ...baseHedge({ id: 'H3', counterparty: 'POALIM', notional: 80_000 }) });

  const leumi = t.counterpartyExposure('LEUMI');
  assert.equal(leumi.hedgeCount, 2);
  assert.equal(leumi.totalNotional, 350_000);
  assert.equal(leumi.byCurrency['ILS/USD'], 350_000);
  assert.ok(leumi.label.he.includes('LEUMI'));
});

test('14 rolloverSchedule archives original + creates new hedge (rule: no delete)', () => {
  const t = makeTracker();
  t.recordHedge(baseHedge());
  const plan = t.rolloverSchedule({
    hedgeId: 'FWD-001',
    newMaturity: '2026-10-11',
    newRate: 3.78,
  });
  assert.ok(plan.rollover.id.startsWith('FWD-001_R'));
  assert.equal(plan.rollover.rolloverOf, 'FWD-001');
  // Original is NOT deleted — it is ROLLED_OVER
  const orig = t.get('FWD-001');
  assert.equal(orig.status, STATUSES.ROLLED_OVER);
  assert.equal(orig.rolledInto, plan.rollover.id);
  assert.equal(plan.daysExtended > 0, true);
  // History grew rather than being overwritten
  assert.ok(orig.history.length >= 2);
});

test('15 rolloverSchedule rejects a maturity that is not after the original', () => {
  const t = makeTracker();
  t.recordHedge(baseHedge({ maturityDate: '2026-07-11' }));
  assert.throws(
    () =>
      t.rolloverSchedule({
        hedgeId: 'FWD-001',
        newMaturity: '2026-06-01',
        newRate: 3.75,
      }),
    (e) => e.code === ERROR_CODES.INVALID_HEDGE
  );
});

test('16 gainLoss splits realized vs unrealized by closingDate', () => {
  const t = makeTracker('2026-04-11');
  t.recordHedge(
    baseHedge({
      rate: 3.7,
      notional: 100_000,
      maturityDate: '2026-07-11',
      hedgedItem: { initialRate: 3.7, currentRate: 3.8, notional: 100_000 },
    })
  );
  // Before maturity → unrealized
  const early = t.gainLoss({ hedgeId: 'FWD-001', closingDate: '2026-05-01' });
  assert.equal(early.unrealized, 10_000);
  assert.equal(early.realized, 0);

  // After maturity → realized
  const late = t.gainLoss({ hedgeId: 'FWD-001', closingDate: '2026-08-01' });
  assert.equal(late.realized, 10_000);
  assert.equal(late.unrealized, 0);
});

test('17 hedgeRatio — numeric and object inputs, classification bands', () => {
  const t = makeTracker();
  const low = t.hedgeRatio(1_000_000, 100_000);
  assert.equal(low.pct, 10);
  assert.equal(low.classification.en, 'Low');

  const partial = t.hedgeRatio(1_000_000, 500_000);
  assert.equal(partial.classification.en, 'Partial');

  const full = t.hedgeRatio({ amount: 1_000_000 }, { notional: 900_000 });
  assert.equal(full.classification.en, 'Full');

  const over = t.hedgeRatio(1_000_000, 1_200_000);
  assert.equal(over.classification.en, 'Over-hedged');

  const none = t.hedgeRatio(0, 100);
  assert.equal(none.pct, 0);
});

test('18 policyCompliance runs all rule families', () => {
  const t = makeTracker('2026-04-11');
  t.recordHedge(baseHedge({ id: 'H1', type: 'forward', counterparty: 'LEUMI', notional: 900_000, quote: 'USD' }));
  t.recordHedge(baseHedge({ id: 'H2', type: 'option', counterparty: 'POALIM', notional: 100_000, quote: 'USD', maturityDate: '2027-12-31' }));

  t.addExposure({ kind: 'receivable', amount: 2_000_000, currency: 'USD' });

  const res = t.policyCompliance({
    policy: {
      allowedInstruments: ['forward'],
      allowedCurrencies: ['USD'],
      maxTenorDays: 365,
      minHedgeRatio: 0.5,
      maxCounterpartyConcentration: 50, // percent
    },
  });
  assert.equal(res.compliant, false);
  // Option is not in whitelist → violation
  const instrViol = res.violations.find((v) => v.rule === 'allowedInstruments');
  assert.ok(instrViol);
  // Tenor > 365d on H2 → violation
  const tenorViol = res.violations.find((v) => v.rule === 'maxTenorDays');
  assert.ok(tenorViol);
  // Leumi dominates 900/1000 = 90% > 50 → violation
  const concViol = res.violations.find((v) => v.rule === 'maxCounterpartyConcentration');
  assert.ok(concViol);
  // Hedge ratio 1,000,000 / 2,000,000 = 50% — exactly on boundary, should pass
  const ratioViol = res.violations.find((v) => v.rule === 'minHedgeRatio');
  assert.equal(ratioViol, undefined);

  // A permissive policy for the same positions should be compliant for currency/ratio
  const res2 = t.policyCompliance({
    policy: {
      allowedInstruments: ['forward', 'option'],
      allowedCurrencies: ['USD'],
      maxTenorDays: 3650,
      minHedgeRatio: 0.1,
      maxCounterpartyConcentration: 95,
    },
  });
  assert.equal(res2.compliant, true);
  assert.equal(res2.label.en, 'Policy compliant');
});

test('19 generateHedgeReport produces PDF + SVG + summary', () => {
  const t = makeTracker('2026-04-11');
  t.recordHedge(baseHedge({ id: 'H1', maturityDate: '2026-05-01', notional: 100_000 }));
  t.recordHedge(baseHedge({ id: 'H2', maturityDate: '2026-08-01', notional: 200_000 }));

  const out = t.generateHedgeReport({ from: '2026-01-01', to: '2026-12-31' });
  assert.ok(Buffer.isBuffer(out.pdf));
  const head = out.pdf.slice(0, 8).toString('latin1');
  assert.ok(head.startsWith('%PDF-1.4'));
  assert.ok(out.pdf.slice(-6).toString('latin1').includes('%%EOF'));

  assert.ok(typeof out.svg === 'string' && out.svg.includes('<svg'));
  assert.ok(out.svg.includes('חשיפה מצטברת'));
  assert.equal(out.summary.totalActiveHedges, 2);
  assert.equal(out.summary.totalNotional, 300_000);
});

test('20 READ-ONLY ENFORCEMENT — all trade-like methods throw E_READ_ONLY_NO_TRADING', () => {
  const t = makeTracker();
  const forbidden = [
    'trade',
    'executeTrade',
    'placeOrder',
    'buy',
    'sell',
    'transferFunds',
    'settleNow',
  ];
  for (const name of forbidden) {
    assert.throws(
      () => t[name](),
      (e) => e.code === ERROR_CODES.READ_ONLY_NO_TRADING,
      `method ${name} must be read-only`
    );
  }
  // Module-level sentinel
  assert.throws(
    () => mod.trade(),
    (e) => e.code === ERROR_CODES.READ_ONLY_NO_TRADING
  );
  assert.throws(
    () => mod.executeTrade(),
    (e) => e.code === ERROR_CODES.READ_ONLY_NO_TRADING
  );
});

test('21 audit log accumulates on every significant action', () => {
  const t = makeTracker();
  assert.equal(t.auditLog().length, 0);
  t.recordHedge(baseHedge());
  assert.equal(t.auditLog()[0].event, 'RECORDED');
  t.rolloverSchedule({
    hedgeId: 'FWD-001',
    newMaturity: '2026-10-11',
    newRate: 3.78,
  });
  const events = t.auditLog().map((e) => e.event);
  assert.ok(events.includes('ROLLOVER_PLANNED'));
});

test('22 bilingual labels are present on public outputs', () => {
  const t = makeTracker();
  t.recordHedge(baseHedge());
  t.addExposure({ kind: 'receivable', amount: 100, currency: 'USD' });

  const rec = t.get('FWD-001');
  assert.ok(rec.label.he && rec.label.en);

  const rep = t.exposureReport({ currency: 'USD' });
  assert.ok(rep.byCurrency.USD.label.he);

  const mtm = t.markToMarket({ hedgeId: 'FWD-001', currentRate: 3.75 });
  assert.ok(mtm.label.he && mtm.label.en);

  const lad = t.maturityLadder();
  assert.ok(lad.buckets.d0_7.label.he);

  const gl = t.gainLoss({ hedgeId: 'FWD-001' });
  assert.ok(gl.label.he && gl.label.en);
});
