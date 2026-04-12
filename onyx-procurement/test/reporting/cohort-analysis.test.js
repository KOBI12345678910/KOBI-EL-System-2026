/**
 * Cohort Analysis — Unit Tests
 * Agent Y-190 — Techno-Kol Uzi ERP / onyx-procurement
 *
 * Run with:   node --test test/reporting/cohort-analysis.test.js
 *
 * Requires Node >= 18 for the built-in `node:test` runner.
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const {
  CohortAnalysis,
  COHORT_METRICS,
  HEBREW_MONTHS,
  ENGLISH_MONTHS,
  HEADERS,
  GLOSSARY,
  monthKey,
  monthsBetween,
  labelForMonthKey,
  monthRange,
} = require(
  path.resolve(__dirname, '..', '..', 'src', 'reporting', 'cohort-analysis.js'),
);

// ─── fixtures ──────────────────────────────────────────────────────────────

const REF = new Date('2026-04-11T09:00:00Z');

function build() {
  return new CohortAnalysis({ now: REF, maxMonths: 6 });
}

/**
 * Synthetic customer factory. `ordersPerMonth` is an array where
 * index 0 = month of acquisition, index 1 = month+1, etc. Each entry is
 * the revenue for that month (0 means no order). For month 0 the order
 * date equals the acquisition date so we never accidentally place orders
 * BEFORE acquisition; for later months we use the first of the month.
 */
function makeCustomer(id, acquiredAt, ordersPerMonth) {
  const acq = new Date(acquiredAt);
  const orders = [];
  ordersPerMonth.forEach((rev, i) => {
    if (rev > 0) {
      const d =
        i === 0
          ? new Date(acq.getTime())
          : new Date(
              Date.UTC(acq.getUTCFullYear(), acq.getUTCMonth() + i, 1),
            );
      orders.push({ id: `${id}-m${i}`, date: d.toISOString(), revenue: rev });
    }
  });
  return { id, acquiredAt: acq.toISOString(), orders };
}

/** A small but realistic fixture: 2 cohorts, 4 customers. */
function smallFixture() {
  return [
    // Cohort 2026-01 — 2 customers
    makeCustomer('c1', '2026-01-05', [1000, 500, 0, 300]), // acq + m1 + m3
    makeCustomer('c2', '2026-01-20', [2000, 0, 800, 0]),   // acq + m2
    // Cohort 2026-02 — 2 customers
    makeCustomer('c3', '2026-02-10', [1500, 600, 0]),      // acq + m1
    makeCustomer('c4', '2026-02-28', [500, 0, 0]),         // acq only
  ];
}

// ─── tests: constants & helpers ────────────────────────────────────────────

test('COHORT_METRICS is the frozen metric whitelist', () => {
  assert.deepEqual(COHORT_METRICS, ['retention', 'revenue', 'orders']);
  assert.ok(Object.isFrozen(COHORT_METRICS));
});

test('HEBREW_MONTHS and ENGLISH_MONTHS are 12-long and frozen', () => {
  assert.equal(HEBREW_MONTHS.length, 12);
  assert.equal(ENGLISH_MONTHS.length, 12);
  assert.equal(HEBREW_MONTHS[0], 'ינואר');
  assert.equal(HEBREW_MONTHS[11], 'דצמבר');
  assert.equal(ENGLISH_MONTHS[0], 'January');
  assert.ok(Object.isFrozen(HEBREW_MONTHS));
  assert.ok(Object.isFrozen(ENGLISH_MONTHS));
});

test('HEADERS carry bilingual he/en strings for every axis', () => {
  for (const key of [
    'retention',
    'revenue',
    'orders',
    'cohort',
    'monthsSince',
    'size',
    'avgRevenue',
    'cumulative',
    'period',
  ]) {
    assert.ok(HEADERS[key], `HEADERS.${key} missing`);
    assert.equal(typeof HEADERS[key].he, 'string', `HEADERS.${key}.he must be string`);
    assert.equal(typeof HEADERS[key].en, 'string', `HEADERS.${key}.en must be string`);
    assert.ok(HEADERS[key].he.length > 0);
    assert.ok(HEADERS[key].en.length > 0);
  }
  assert.ok(Object.isFrozen(HEADERS));
});

test('GLOSSARY is frozen and bilingual for every entry', () => {
  for (const key of Object.keys(GLOSSARY)) {
    assert.equal(typeof GLOSSARY[key].he, 'string');
    assert.equal(typeof GLOSSARY[key].en, 'string');
  }
  assert.ok(Object.isFrozen(GLOSSARY));
});

test('monthKey / monthsBetween / monthRange primitives agree', () => {
  assert.equal(monthKey(new Date('2026-01-05T00:00:00Z')), '2026-01');
  assert.equal(monthKey(new Date('2026-12-31T23:59:59Z')), '2026-12');
  assert.equal(
    monthsBetween(new Date('2026-01-15T00:00:00Z'), new Date('2026-04-15T00:00:00Z')),
    3,
  );
  assert.equal(
    monthsBetween(new Date('2025-11-15T00:00:00Z'), new Date('2026-02-15T00:00:00Z')),
    3,
  );
  // negative direction
  assert.equal(
    monthsBetween(new Date('2026-04-15T00:00:00Z'), new Date('2026-01-15T00:00:00Z')),
    -3,
  );
  // Range spans the year boundary correctly
  assert.deepEqual(monthRange('2025-11', 4), ['2025-11', '2025-12', '2026-01', '2026-02']);
  // labelForMonthKey is bilingual
  const lbl = labelForMonthKey('2026-03');
  assert.equal(lbl.he, 'מרץ 2026');
  assert.equal(lbl.en, 'March 2026');
});

// ─── tests: monthlyBuckets ────────────────────────────────────────────────

test('monthlyBuckets groups customers by acquisition month', () => {
  const sys = build();
  const buckets = sys.monthlyBuckets(smallFixture());
  assert.deepEqual(buckets.keys, ['2026-01', '2026-02']);
  assert.equal(buckets.byKey['2026-01'].length, 2);
  assert.equal(buckets.byKey['2026-02'].length, 2);
});

test('monthlyBuckets — acquiredAt inferred from earliest order when omitted', () => {
  const sys = build();
  const customers = [
    {
      id: 'inferred-1',
      orders: [
        { date: '2026-03-15', revenue: 100 },
        { date: '2026-02-10', revenue: 200 },
      ],
    },
  ];
  const buckets = sys.monthlyBuckets(customers);
  assert.deepEqual(buckets.keys, ['2026-02']);
});

test('monthlyBuckets rejects customer without id', () => {
  const sys = build();
  assert.throws(
    () => sys.monthlyBuckets([{ acquiredAt: '2026-01-01', orders: [] }]),
    /missing id/,
  );
});

test('monthlyBuckets rejects customer without acquiredAt and no orders', () => {
  const sys = build();
  assert.throws(
    () => sys.monthlyBuckets([{ id: 'x', orders: [] }]),
    /either acquiredAt or at least one order is required/,
  );
});

test('monthlyBuckets rejects non-array customers', () => {
  const sys = build();
  assert.throws(() => sys.monthlyBuckets('not array'), /must be an array/);
});

// ─── tests: buildCohort — retention ───────────────────────────────────────

test('buildCohort retention — period retention hand-checked on fixture', () => {
  const sys = build();
  const built = sys.buildCohort(smallFixture(), { metric: 'retention' });
  // 2 cohorts, 6 cols (maxMonths)
  assert.equal(built.metric, 'retention');
  assert.equal(built.cohorts.length, 2);
  assert.equal(built.summary.cohorts_count, 2);
  assert.equal(built.summary.total_customers, 4);

  // Cohort 2026-01: c1 placed orders at m0, m1, m3; c2 at m0, m2.
  //   m0: both active → 100%
  //   m1: c1 only    → 50%
  //   m2: c2 only    → 50%
  //   m3: c1 only    → 50%
  //   m4: none       → 0%
  //   m5: none       → 0%
  const jan = built.cohorts.find((c) => c.cohort === '2026-01');
  assert.deepEqual(jan.period_retention_pct, [100, 50, 50, 50, 0, 0]);
  // Cumulative: once a customer has ordered at least once, they count forever.
  // m0: both (100); m1: still both (100); m2: still both (100); ...
  assert.deepEqual(jan.cumulative_retention_pct, [100, 100, 100, 100, 100, 100]);
});

test('buildCohort retention — cumulative >= period at every step', () => {
  const sys = build();
  const built = sys.buildCohort(smallFixture(), { metric: 'retention' });
  for (const row of built.cohorts) {
    for (let i = 0; i < row.period_retention_pct.length; i += 1) {
      assert.ok(
        row.cumulative_retention_pct[i] >= row.period_retention_pct[i],
        `cohort ${row.cohort} col ${i}: cumulative < period`,
      );
    }
  }
});

// ─── tests: buildCohort — revenue ─────────────────────────────────────────

test('buildCohort revenue — totals match input and avg_per_customer is correct', () => {
  const sys = build();
  const built = sys.buildCohort(smallFixture(), { metric: 'revenue' });
  const jan = built.cohorts.find((c) => c.cohort === '2026-01');
  // c1 = 1000 + 500 + 300 = 1800; c2 = 2000 + 800 = 2800 → total 4600
  assert.equal(jan.total_revenue_ils, 4600);
  assert.equal(jan.avg_revenue_per_customer_ils, 2300);
  // Per-month revenue: m0 = 3000, m1 = 500, m2 = 800, m3 = 300, m4 = 0, m5 = 0
  assert.deepEqual(jan.revenue_by_month_ils, [3000, 500, 800, 300, 0, 0]);
});

test('buildCohort revenue — summary aggregates match cohort sums', () => {
  const sys = build();
  const built = sys.buildCohort(smallFixture(), { metric: 'revenue' });
  const feb = built.cohorts.find((c) => c.cohort === '2026-02');
  // c3 = 1500 + 600 = 2100; c4 = 500 → total 2600
  assert.equal(feb.total_revenue_ils, 2100 + 500);
  const expectedTotal = 4600 + 2600;
  assert.equal(built.summary.total_revenue_ils, expectedTotal);
  assert.equal(built.summary.avg_revenue_per_cohort_ils, expectedTotal / 2);
  assert.equal(built.summary.avg_revenue_per_customer_ils, expectedTotal / 4);
});

// ─── tests: buildCohort — orders ─────────────────────────────────────────

test('buildCohort orders — order counts per month match fixture', () => {
  const sys = build();
  const built = sys.buildCohort(smallFixture(), { metric: 'orders' });
  const jan = built.cohorts.find((c) => c.cohort === '2026-01');
  // m0: c1 + c2 = 2; m1: c1 = 1; m2: c2 = 1; m3: c1 = 1; m4-5: 0
  assert.deepEqual(jan.orders_by_month, [2, 1, 1, 1, 0, 0]);
  // `cells` for orders metric should equal orders_by_month
  const janHeatRow = built.heatmap.rows.find((r) => r.cohort === '2026-01');
  assert.deepEqual(janHeatRow.cells, [2, 1, 1, 1, 0, 0]);
});

// ─── tests: heatmap shape ────────────────────────────────────────────────

test('heatmap payload — rows × cols match cohorts × months shape', () => {
  const sys = build();
  const built = sys.buildCohort(smallFixture(), { metric: 'retention' });
  assert.equal(built.heatmap.rows_total, 2);
  assert.equal(built.heatmap.cols_total, 6);
  for (const row of built.heatmap.rows) {
    assert.equal(row.cells.length, 6);
  }
  // cells_flat = rows * cols
  assert.equal(built.heatmap.cells_flat.length, 2 * 6);
  // each flat cell carries row / col / value / cohort / month_index
  for (const cell of built.heatmap.cells_flat) {
    assert.ok('row' in cell && 'col' in cell && 'value' in cell);
    assert.equal(typeof cell.cohort, 'string');
    assert.equal(typeof cell.month_index, 'number');
  }
});

test('heatmap headers are bilingual on all axes', () => {
  const sys = build();
  const built = sys.buildCohort(smallFixture(), { metric: 'revenue' });
  assert.equal(built.heatmap.header_metric.he, 'הכנסות (₪)');
  assert.equal(built.heatmap.header_metric.en, 'Revenue (ILS)');
  assert.equal(built.heatmap.header_rows.he, 'קוהורט רכישה');
  assert.equal(built.heatmap.header_cols.en, 'Months Since Acquisition');
});

test('columns payload — bilingual Gregorian + optional Hebrew month labels', () => {
  const sys = build();
  const built = sys.buildCohort(smallFixture(), { metric: 'retention' });
  assert.equal(built.columns.length, 6);
  assert.equal(built.columns[0].key, '2026-01');
  assert.equal(built.columns[0].label_gregorian.he, 'ינואר 2026');
  assert.equal(built.columns[0].label_gregorian.en, 'January 2026');
  assert.equal(built.columns[0].label_hebrew_month.he, 'ינואר');

  // hebrewLabels=false suppresses the Hebrew-only label
  const alt = sys.buildCohort(smallFixture(), {
    metric: 'retention',
    hebrewLabels: false,
  });
  assert.equal(alt.columns[0].label_hebrew_month, null);
  // but Gregorian label stays bilingual
  assert.equal(alt.columns[0].label_gregorian.he, 'ינואר 2026');
});

// ─── tests: curves & averages ─────────────────────────────────────────────

test('retentionCurve returns period + cumulative curves for a single cohort', () => {
  const sys = build();
  const curve = sys.retentionCurve(smallFixture(), '2026-01');
  assert.equal(curve.cohort, '2026-01');
  assert.equal(curve.size, 2);
  assert.deepEqual(curve.period_pct, [100, 50, 50, 50, 0, 0]);
  assert.deepEqual(curve.cumulative_pct, [100, 100, 100, 100, 100, 100]);
});

test('retentionCurve throws on unknown cohort', () => {
  const sys = build();
  assert.throws(
    () => sys.retentionCurve(smallFixture(), '1999-12'),
    /not found/,
  );
});

test('revenueCurve returns the monthly revenue curve', () => {
  const sys = build();
  const curve = sys.revenueCurve(smallFixture(), '2026-02');
  assert.equal(curve.cohort, '2026-02');
  assert.equal(curve.size, 2);
  // c3=1500+600=2100; c4=500; total 2600
  assert.equal(curve.total_revenue_ils, 2600);
  assert.equal(curve.revenue_by_month_ils[0], 2000); // c3 1500 + c4 500
  assert.equal(curve.revenue_by_month_ils[1], 600);
});

test('avgRevenuePerCohort returns one entry per cohort', () => {
  const sys = build();
  const list = sys.avgRevenuePerCohort(smallFixture());
  assert.equal(list.length, 2);
  const jan = list.find((c) => c.cohort === '2026-01');
  // 4600 / 2
  assert.equal(jan.avg_revenue_per_customer_ils, 2300);
});

// ─── tests: validation & guardrails ───────────────────────────────────────

test('buildCohort rejects unknown metric', () => {
  const sys = build();
  assert.throws(
    () => sys.buildCohort(smallFixture(), { metric: 'conversion' }),
    /unknown metric/,
  );
});

test('buildCohort on empty input returns a well-formed zeroed payload', () => {
  const sys = build();
  const built = sys.buildCohort([], { metric: 'retention' });
  assert.equal(built.cohorts.length, 0);
  assert.equal(built.heatmap.rows_total, 0);
  assert.equal(built.heatmap.cols_total, 0);
  assert.equal(built.heatmap.cells_flat.length, 0);
  assert.equal(built.summary.total_customers, 0);
  assert.equal(built.summary.avg_revenue_per_customer_ils, 0);
  assert.equal(built.summary.avg_revenue_per_cohort_ils, 0);
});

test('buildCohort output is deep-frozen — mutation attempts throw', () => {
  const sys = build();
  const built = sys.buildCohort(smallFixture(), { metric: 'revenue' });
  assert.ok(Object.isFrozen(built));
  assert.ok(Object.isFrozen(built.heatmap));
  assert.ok(Object.isFrozen(built.cohorts));
  assert.throws(() => {
    built.cohorts[0].cells.push(999);
  }, TypeError);
  assert.throws(() => {
    built.summary.total_customers = -1;
  }, TypeError);
});

test('buildCohort does not mutate the input customers array', () => {
  const sys = build();
  const input = smallFixture();
  const snapshot = JSON.stringify(input);
  sys.buildCohort(input, { metric: 'retention' });
  assert.equal(JSON.stringify(input), snapshot);
});

test('maxMonths option caps the column count', () => {
  const sys = new CohortAnalysis({ now: REF, maxMonths: 24 });
  const built = sys.buildCohort(smallFixture(), { metric: 'retention', maxMonths: 3 });
  assert.equal(built.heatmap.cols_total, 3);
  for (const row of built.cohorts) {
    assert.equal(row.period_retention_pct.length, 3);
    assert.equal(row.cumulative_retention_pct.length, 3);
  }
});

test('orders placed BEFORE acquiredAt are ignored', () => {
  const sys = build();
  const customers = [
    {
      id: 'pre',
      acquiredAt: '2026-02-01',
      orders: [
        { date: '2026-01-15', revenue: 999 }, // pre-acq, must be ignored
        { date: '2026-02-10', revenue: 100 }, // m0
        { date: '2026-03-10', revenue: 200 }, // m1
      ],
    },
  ];
  const built = sys.buildCohort(customers, { metric: 'revenue' });
  const row = built.cohorts[0];
  assert.equal(row.total_revenue_ils, 300);
  assert.equal(row.revenue_by_month_ils[0], 100);
  assert.equal(row.revenue_by_month_ils[1], 200);
});

test('constructor rejects invalid `now`', () => {
  assert.throws(() => new CohortAnalysis({ now: 'not-a-date' }), /cannot parse/);
});

// ─── tests: never-delete compliance ──────────────────────────────────────

test('never-delete — no mutator method exists on the class', () => {
  const sys = build();
  // Nothing on the prototype should look like a deletion entry point.
  const methods = Object.getOwnPropertyNames(CohortAnalysis.prototype);
  for (const m of methods) {
    assert.ok(
      !/^delete|^remove|^drop|^clear/.test(m),
      `unexpected mutator on CohortAnalysis: ${m}`,
    );
  }
  // Instance itself is frozen — no hidden state can be swapped.
  assert.ok(Object.isFrozen(sys));
});

test('multiple buildCohort calls are independent — no state leak', () => {
  const sys = build();
  const first = sys.buildCohort(smallFixture(), { metric: 'retention' });
  const second = sys.buildCohort(smallFixture(), { metric: 'revenue' });
  // First payload stays intact after second build
  assert.equal(first.metric, 'retention');
  assert.equal(second.metric, 'revenue');
  assert.equal(first.cohorts.length, 2);
  assert.equal(second.cohorts.length, 2);
});
