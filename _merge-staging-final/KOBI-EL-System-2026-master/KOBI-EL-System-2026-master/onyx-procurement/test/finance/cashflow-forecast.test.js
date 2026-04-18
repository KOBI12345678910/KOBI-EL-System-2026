/**
 * Unit tests for CashFlowForecast (direct + indirect methods, rolling,
 * stress test, minimum-cash alerts, Israeli payment schedule).
 *
 * Agent: AG-Y079 — Cash Flow Forecast / תזרים מזומנים
 * Run:   cd onyx-procurement && node --test test/finance/cashflow-forecast.test.js
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  CashFlowForecast,
  FORECAST_METHODS,
  FORECAST_STATUS,
  ISRAELI_PAYMENT_DAYS,
} = require('../../src/finance/cashflow-forecast');

// ────────────────── Fixture builders ──────────────────

function makeForecast(overrides = {}) {
  return new CashFlowForecast(
    Object.assign(
      {
        openingCash: 100_000,
        minCash: 50_000,
        now: () => new Date('2026-04-11T08:00:00Z'),
      },
      overrides
    )
  );
}

function baseDirectSpec() {
  return {
    period: '2026-Q2',
    openingCash: 100_000,
    receipts: [
      { label: 'Customer A', amount: 50_000 },
      { label: 'Customer B', amount: 30_000 },
      { label: 'Grant', amount: 20_000 },
    ],
    disbursements: [
      { label: 'Payroll', amount: 40_000 },
      { label: 'VAT', amount: 10_000 },
      { label: 'Rent', amount: 8_000 },
    ],
  };
}

function baseIndirectSpec() {
  return {
    period: '2026-Q2',
    openingCash: 100_000,
    netIncome: 50_000,
    dep: 8_000,
    wcChanges: { ar: 5_000, inventory: 2_000, ap: 3_000, other: 0 },
    investing: { capex: 12_000, assetSales: 0, acquisitions: 0 },
    financing: {
      debtIssued: 0,
      debtRepaid: 5_000,
      dividends: 0,
      equityIssued: 0,
      equityRepurchased: 0,
    },
  };
}

// ═════════════════════════════════════════════════════════════
// 1. Direct method
// ═════════════════════════════════════════════════════════════

test('buildDirectMethod totals and closing cash are correct', () => {
  const f = makeForecast();
  const out = f.buildDirectMethod(baseDirectSpec());
  assert.equal(out.method, FORECAST_METHODS.DIRECT);
  assert.equal(out.totalReceipts, 100_000);
  assert.equal(out.totalDisbursements, 58_000);
  assert.equal(out.netCashFlow, 42_000);
  assert.equal(out.closingCash, 142_000);
  assert.equal(out.status, FORECAST_STATUS.PUBLISHED);
  assert.ok(out.forecastId.startsWith('DCF_'));
});

test('buildDirectMethod rejects missing period or non-array inputs', () => {
  const f = makeForecast();
  assert.throws(() => f.buildDirectMethod(null), /spec/);
  assert.throws(() => f.buildDirectMethod({ receipts: [], disbursements: [] }), /period/);
  assert.throws(
    () => f.buildDirectMethod({ period: 'x', receipts: 'nope', disbursements: [] }),
    /array/
  );
});

test('buildDirectMethod rejects negative amounts', () => {
  const f = makeForecast();
  assert.throws(
    () =>
      f.buildDirectMethod({
        period: '2026-Q2',
        receipts: [{ label: 'bad', amount: -1 }],
        disbursements: [],
      }),
    /non-negative/
  );
});

// ═════════════════════════════════════════════════════════════
// 2. Indirect method
// ═════════════════════════════════════════════════════════════

test('buildIndirectMethod reconciles to closing cash', () => {
  const f = makeForecast();
  const out = f.buildIndirectMethod(baseIndirectSpec());
  // CFO = 50k + 8k + (-5k - 2k + 3k + 0) = 54k
  assert.equal(out.cfo, 54_000);
  // CFI = 0 - 12k - 0 = -12k
  assert.equal(out.cfi, -12_000);
  // CFF = 0 - 5k - 0 + 0 - 0 = -5k
  assert.equal(out.cff, -5_000);
  // Net change = 37k, closing = 137k
  assert.equal(out.netChange, 37_000);
  assert.equal(out.closingCash, 137_000);
  assert.equal(out.wcChanges.adjustment, -4_000);
});

test('direct and indirect methods reconcile on a matched scenario', () => {
  // Construct a scenario where direct and indirect should produce the same net change.
  // CFO from indirect = 54k, CFI = -12k, CFF = -5k, net = 37k
  // Direct: receipts - disbursements = 37k
  const f = makeForecast();
  const direct = f.buildDirectMethod({
    period: '2026-Q2',
    openingCash: 100_000,
    receipts: [{ label: 'Collections', amount: 200_000 }],
    disbursements: [{ label: 'Ops + capex + debt', amount: 163_000 }],
  });
  const indirect = f.buildIndirectMethod(baseIndirectSpec());
  assert.equal(direct.netCashFlow, indirect.netChange);
  assert.equal(direct.closingCash, indirect.closingCash);
});

test('buildIndirectMethod rejects non-numeric netIncome', () => {
  const f = makeForecast();
  assert.throws(
    () => f.buildIndirectMethod({ period: '2026-Q2', netIncome: 'nope' }),
    /numeric/
  );
});

// ═════════════════════════════════════════════════════════════
// 3. Weekly rolling (13-week)
// ═════════════════════════════════════════════════════════════

test('weeklyRolling produces 13 buckets with rolled cash', () => {
  const f = makeForecast();
  const out = f.weeklyRolling({
    startDate: '2026-04-12T00:00:00Z', // Sunday
    openingCash: 100_000,
    receipts: [
      { label: 'Customer A', amount: 30_000, date: '2026-04-12' },
      { label: 'Customer B', amount: 40_000, date: '2026-04-26' },
      { label: 'Customer C', amount: 20_000, date: '2026-05-10' },
    ],
    disbursements: [
      { label: 'Payroll', amount: 50_000, date: '2026-05-07' },
      { label: 'VAT', amount: 12_000, date: '2026-05-15' },
    ],
  });
  assert.equal(out.weeks, 13);
  assert.equal(out.buckets.length, 13);
  assert.equal(out.startDate, '2026-04-12');
  // Week 1 opens at 100k, gets 30k, closes 130k
  assert.equal(out.buckets[0].openingCash, 100_000);
  assert.equal(out.buckets[0].receiptsTotal, 30_000);
  assert.equal(out.buckets[0].closingCash, 130_000);
  // Totals
  assert.equal(out.totals.receipts, 90_000);
  assert.equal(out.totals.disbursements, 62_000);
  assert.equal(out.totals.netFlow, 28_000);
  assert.equal(out.totals.closingCash, 128_000);
});

test('weeklyRolling roll-forward: each week openingCash == prior closingCash', () => {
  const f = makeForecast();
  const out = f.weeklyRolling({
    startDate: '2026-04-12',
    openingCash: 200_000,
    receipts: [{ label: 'r1', amount: 10_000, date: '2026-04-12' }],
    disbursements: [{ label: 'd1', amount: 5_000, date: '2026-04-19' }],
  });
  for (let i = 1; i < out.buckets.length; i++) {
    assert.equal(out.buckets[i].openingCash, out.buckets[i - 1].closingCash);
  }
  // Final closing = 200k + 10k - 5k = 205k
  assert.equal(out.totals.closingCash, 205_000);
});

test('weeklyRolling rejects invalid horizon', () => {
  const f = makeForecast();
  assert.throws(() => f.weeklyRolling({ startDate: '2026-04-12', weeks: 0 }), /between/);
  assert.throws(() => f.weeklyRolling({ startDate: '2026-04-12', weeks: 100 }), /between/);
});

// ═════════════════════════════════════════════════════════════
// 4. Sources — AR aging + pipeline + recurring + events
// ═════════════════════════════════════════════════════════════

test('sources weights AR by aging probability', () => {
  const f = makeForecast();
  const out = f.sources({
    ar: [
      { customerId: 'c1', amount: 10_000, daysOutstanding: 0 },   // current (0.98)
      { customerId: 'c2', amount: 10_000, daysOutstanding: 45 },  // 31-60  (0.85)
      { customerId: 'c3', amount: 10_000, daysOutstanding: 100 }, // 90+    (0.25)
    ],
    pipeline: [
      { oppId: 'o1', amount: 20_000, closeProbability: 0.5 }, // expected 10k
    ],
    recurring: [{ label: 'SaaS', amount: 8_000 }],
    events: [{ label: 'Dividend received', amount: 5_000 }],
  });
  assert.equal(out.ar[0].expected, 9_800);
  assert.equal(out.ar[1].expected, 8_500);
  assert.equal(out.ar[2].expected, 2_500);
  assert.equal(out.totals.arExpected, 20_800);
  assert.equal(out.totals.pipelineExpected, 10_000);
  assert.equal(out.totals.recurring, 8_000);
  assert.equal(out.totals.events, 5_000);
  assert.equal(out.totals.grandTotal, 43_800);
});

test('sources rejects invalid probability', () => {
  const f = makeForecast();
  assert.throws(
    () =>
      f.sources({
        pipeline: [{ amount: 1000, closeProbability: 2 }],
      }),
    /closeProbability/
  );
});

// ═════════════════════════════════════════════════════════════
// 5. Uses — Israeli payment schedule
// ═════════════════════════════════════════════════════════════

test('uses computes Israeli payroll and tax due dates (monthly cadence)', () => {
  const f = makeForecast();
  const out = f.uses({
    payroll: { gross: 100_000, employerCostRatio: 1.25, month: '2026-04' },
    tax: {
      vat: 20_000,
      incomeTax: 15_000,
      bituachLeumi: 12_000,
      pension: 8_000,
      month: '2026-04',
    },
  });
  const payroll = out.items.find((x) => x.type === 'payroll');
  assert.ok(payroll);
  assert.equal(payroll.amount, 125_000);
  // Payroll due ~7th of month following — here 2026-05-07
  assert.equal(payroll.dueDate, '2026-05-07');

  const vat = out.items.find((x) => x.category === 'vat');
  assert.ok(vat);
  assert.equal(vat.amount, 20_000);
  assert.equal(vat.dueDate, '2026-05-15');

  const it = out.items.find((x) => x.category === 'income-tax');
  assert.equal(it.dueDate, '2026-05-15');
  const bl = out.items.find((x) => x.category === 'bituach-leumi');
  assert.equal(bl.dueDate, '2026-05-15');
  const pn = out.items.find((x) => x.category === 'pension');
  assert.equal(pn.dueDate, '2026-05-15');

  assert.equal(out.total, 125_000 + 20_000 + 15_000 + 12_000 + 8_000);
});

test('uses computes bi-monthly payroll split for construction cadence', () => {
  const f = makeForecast();
  const out = f.uses({
    payroll: {
      gross: 100_000,
      employerCostRatio: 1.25,
      bimonthly: true,
      month: '2026-04',
    },
  });
  const advance = out.items.find(
    (x) => x.type === 'payroll' && x.label.toLowerCase().includes('advance')
  );
  const settle = out.items.find(
    (x) => x.type === 'payroll' && x.label.toLowerCase().includes('settlement')
  );
  assert.ok(advance, 'advance payment record exists');
  assert.ok(settle, 'settlement payment record exists');
  assert.equal(advance.amount, 62_500);
  assert.equal(settle.amount, 62_500);
  // Advance ~22nd of same month, settlement ~7th of next month
  assert.equal(advance.dueDate, '2026-04-22');
  assert.equal(settle.dueDate, '2026-05-07');
});

test('uses aggregates loans, rent and other items', () => {
  const f = makeForecast();
  const out = f.uses({
    loans: [{ label: 'Term loan', amount: 6_000, dueDate: '2026-04-20' }],
    rent: 12_000,
    other: [{ label: 'Utilities', amount: 2_500 }],
  });
  assert.equal(out.items.find((x) => x.type === 'loan').amount, 6_000);
  assert.equal(out.items.find((x) => x.type === 'rent').amount, 12_000);
  assert.equal(out.items.find((x) => x.type === 'other').amount, 2_500);
  assert.equal(out.total, 20_500);
});

test('ISRAELI_PAYMENT_DAYS exposes correct calendar', () => {
  assert.equal(ISRAELI_PAYMENT_DAYS.PAYROLL_MAIN, 7);
  assert.equal(ISRAELI_PAYMENT_DAYS.PAYROLL_ADVANCE, 22);
  assert.equal(ISRAELI_PAYMENT_DAYS.VAT, 15);
  assert.equal(ISRAELI_PAYMENT_DAYS.INCOME_TAX, 15);
  assert.equal(ISRAELI_PAYMENT_DAYS.BITUACH_LEUMI, 15);
  assert.equal(ISRAELI_PAYMENT_DAYS.PENSION, 15);
});

// ═════════════════════════════════════════════════════════════
// 6. Stress test
// ═════════════════════════════════════════════════════════════

test('stressTest reduces receipts by shock percentage without mutating base', () => {
  const f = makeForecast();
  const base = f.buildDirectMethod(baseDirectSpec());
  const stressed = f.stressTest({
    forecastId: base.forecastId,
    shocks: [{ item: 'receipts', pct: -30 }],
  });
  assert.equal(stressed.baseForecastId, base.forecastId);
  assert.equal(stressed.scenario, 'stress');
  // 100k -30% => 70k receipts
  assert.equal(stressed.totalReceipts, 70_000);
  // disbursements unchanged at 58k
  assert.equal(stressed.totalDisbursements, 58_000);
  assert.equal(stressed.netCashFlow, 12_000);
  assert.equal(stressed.closingCash, 112_000);
  // Base unchanged
  const stored = f.getForecast(base.forecastId);
  assert.equal(stored.totalReceipts, 100_000);
  assert.equal(stored.closingCash, 142_000);
});

test('stressTest supports label-matched shocks', () => {
  const f = makeForecast();
  const base = f.buildDirectMethod(baseDirectSpec());
  const stressed = f.stressTest({
    forecastId: base.forecastId,
    shocks: [{ item: 'Customer A', pct: -100 }], // customer lost entirely
  });
  // Customer A was 50k; now 0. Totals: 50k receipts instead of 100k
  assert.equal(stressed.totalReceipts, 50_000);
  assert.equal(stressed.closingCash, 100_000 + 50_000 - 58_000);
});

test('stressTest applies to rolling forecasts', () => {
  const f = makeForecast();
  const base = f.weeklyRolling({
    startDate: '2026-04-12',
    openingCash: 100_000,
    receipts: [
      { label: 'A', amount: 30_000, date: '2026-04-12' },
      { label: 'B', amount: 40_000, date: '2026-04-26' },
    ],
    disbursements: [{ label: 'Payroll', amount: 20_000, date: '2026-05-07' }],
  });
  const stressed = f.stressTest({
    forecastId: base.forecastId,
    shocks: [{ item: 'receipts', pct: -50 }],
  });
  assert.equal(stressed.totals.receipts, 35_000);
  assert.equal(stressed.totals.disbursements, 20_000);
  assert.equal(stressed.totals.closingCash, 100_000 + 35_000 - 20_000);
  // Base still intact
  assert.equal(f.getForecast(base.forecastId).totals.receipts, 70_000);
});

test('stressTest rejects unknown forecast or malformed shocks', () => {
  const f = makeForecast();
  assert.throws(() => f.stressTest({ forecastId: 'missing', shocks: [] }), /not found/);
  const base = f.buildDirectMethod(baseDirectSpec());
  assert.throws(
    () => f.stressTest({ forecastId: base.forecastId, shocks: [{ item: 'x' }] }),
    /item, pct/
  );
});

// ═════════════════════════════════════════════════════════════
// 7. Minimum-cash alert
// ═════════════════════════════════════════════════════════════

test('minimumCashAlert flags weeks below threshold', () => {
  const f = makeForecast({ minCash: 50_000 });
  const base = f.weeklyRolling({
    startDate: '2026-04-12',
    openingCash: 60_000,
    receipts: [],
    disbursements: [
      { label: 'Rent', amount: 15_000, date: '2026-04-12' },
      { label: 'Payroll', amount: 20_000, date: '2026-04-19' },
    ],
  });
  const alert = f.minimumCashAlert(50_000, base.forecastId);
  assert.ok(alert.criticalPeriods > 0);
  assert.equal(alert.healthy, false);
  // Closing cash after week 1 = 45k → shortfall 5k
  const first = alert.alerts[0];
  assert.equal(first.closingCash, 45_000);
  assert.equal(first.shortfall, 5_000);
});

test('minimumCashAlert returns healthy when all buckets >= threshold', () => {
  const f = makeForecast();
  const base = f.weeklyRolling({
    startDate: '2026-04-12',
    openingCash: 500_000,
    receipts: [{ label: 'A', amount: 100_000, date: '2026-04-12' }],
    disbursements: [{ label: 'X', amount: 10_000, date: '2026-04-19' }],
  });
  const alert = f.minimumCashAlert(50_000, base.forecastId);
  assert.equal(alert.healthy, true);
  assert.equal(alert.criticalPeriods, 0);
});

// ═════════════════════════════════════════════════════════════
// 8. Coverage ratio
// ═════════════════════════════════════════════════════════════

test('coverageRatio computes inflows / obligations from forecast + uses()', () => {
  const f = makeForecast();
  const base = f.buildDirectMethod(baseDirectSpec());
  const uses = f.uses({ rent: 30_000, other: [{ label: 'Utilities', amount: 10_000 }] });
  const cov = f.coverageRatio({ forecast: base, obligations: uses });
  // Inflows = 100k, Outflows = 40k => ratio 2.5, surplus 60k
  assert.equal(cov.ratio, 2.5);
  assert.equal(cov.covered, true);
  assert.equal(cov.surplus, 60_000);
});

test('coverageRatio reports gap when inflows < obligations', () => {
  const f = makeForecast();
  const cov = f.coverageRatio({ forecast: 30_000, obligations: 50_000 });
  assert.equal(cov.ratio, 0.6);
  assert.equal(cov.covered, false);
  assert.equal(cov.gap, 20_000);
});

// ═════════════════════════════════════════════════════════════
// 9. Actuals vs forecast
// ═════════════════════════════════════════════════════════════

test('actualsVsForecast computes variance and accuracy', () => {
  const f = makeForecast();
  f.buildDirectMethod(baseDirectSpec());
  const out = f.actualsVsForecast('2026-Q2', {
    receipts: 90_000,
    disbursements: 60_000,
  });
  assert.equal(out.period, '2026-Q2');
  assert.equal(out.variance.receipts, -10_000);
  assert.equal(out.variance.disbursements, 2_000);
  // Accuracy = 1 - 10k/100k = 0.9
  assert.equal(out.accuracy, 0.9);
  assert.equal(out.mapePercent, 10);
});

test('actualsVsForecast returns note when no forecast exists', () => {
  const f = makeForecast();
  const out = f.actualsVsForecast('2099-Q1', { receipts: 1, disbursements: 0 });
  assert.equal(out.forecast, null);
  assert.match(out.note, /no forecast/);
});

// ═════════════════════════════════════════════════════════════
// 10. PDF generator (bilingual + SVG chart)
// ═════════════════════════════════════════════════════════════

test('generatePDF emits a valid PDF 1.4 buffer with SVG chart', () => {
  const f = makeForecast();
  const base = f.buildDirectMethod(baseDirectSpec());
  const pdf = f.generatePDF(base);
  assert.ok(Buffer.isBuffer(pdf.buffer));
  const head = pdf.buffer.slice(0, 8).toString('latin1');
  assert.match(head, /^%PDF-1\.4/);
  assert.ok(pdf.buffer.includes(Buffer.from('%%EOF', 'latin1')));
  // Bilingual text: contains English + Hebrew transliteration
  assert.match(pdf.text, /Cash Flow Forecast/);
  assert.match(pdf.text, /tazrim mezumanim/);
  // SVG chart present
  assert.ok(typeof pdf.svg === 'string');
  assert.match(pdf.svg, /^<svg /);
  assert.match(pdf.svg, /<\/svg>$/);
  assert.match(pdf.svg, /<rect /);
  // Metadata
  assert.equal(pdf.metadata.direction, 'rtl');
  assert.equal(pdf.metadata.language, 'he+en');
  assert.equal(pdf.metadata.forecastId, base.forecastId);
});

test('generatePDF works for weekly rolling forecasts (chart per bucket)', () => {
  const f = makeForecast();
  const rolling = f.weeklyRolling({
    startDate: '2026-04-12',
    openingCash: 100_000,
    receipts: [{ label: 'A', amount: 10_000, date: '2026-04-12' }],
    disbursements: [{ label: 'B', amount: 5_000, date: '2026-04-19' }],
  });
  const pdf = f.generatePDF(rolling);
  assert.ok(Buffer.isBuffer(pdf.buffer));
  // 13 bars of weekly net flow in SVG
  const bars = (pdf.svg.match(/<rect /g) || []).length;
  // Background rect + 13 bars = 14
  assert.ok(bars >= 14);
});

// ═════════════════════════════════════════════════════════════
// 11. Append-only history
// ═════════════════════════════════════════════════════════════

test('history is append-only and records every mutation', () => {
  const f = makeForecast();
  const base = f.buildDirectMethod(baseDirectSpec());
  f.stressTest({
    forecastId: base.forecastId,
    shocks: [{ item: 'receipts', pct: -20 }],
  });
  f.minimumCashAlert(50_000, base.forecastId);
  const hist = f.getHistory();
  const events = hist.map((h) => h.event);
  assert.ok(events.includes('buildDirectMethod'));
  assert.ok(events.includes('stressTest'));
  assert.ok(events.includes('minimumCashAlert'));
  // All forecasts remain retrievable — never deleted
  assert.ok(f.listForecasts().length >= 2);
});
