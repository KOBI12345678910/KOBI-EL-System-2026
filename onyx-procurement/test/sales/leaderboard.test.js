/**
 * Tests for src/sales/leaderboard.js
 * Agent Y-022 / Techno-Kol Uzi mega-ERP 2026
 *
 * Run:
 *   cd onyx-procurement
 *   node --test test/sales/leaderboard.test.js
 *
 * Zero third-party deps. Pure node:test + node:assert.
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  rank,
  movement,
  generateBadges,
  metricValue,
  formatMetric,
  findRank,
  METRICS,
  METRIC_REVENUE,
  METRIC_MARGIN,
  METRIC_DEALS_CLOSED,
  METRIC_CONVERSION_RATE,
  METRIC_AVG_DEAL_SIZE,
  METRIC_NEW_CUSTOMERS,
  METRIC_ATTAINMENT,
  PERIOD_MONTH,
  PERIOD_QUARTER,
  PERIOD_YEAR,
  BADGE_CATALOG,
  BADGE_FIRST_SALE,
  BADGE_TEN_DEALS,
  BADGE_HUNDRED_K,
  BADGE_QUARTER_M,
  BADGE_MILLION,
  BADGE_BEAT_QUOTA,
  BADGE_WIN_STREAK,
  BADGE_HOT_STREAK,
  BADGE_CENTURY,
} = require('../../src/sales/leaderboard.js');

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

function sp(overrides = {}) {
  return {
    id:             'sp-' + Math.random().toString(36).slice(2, 8),
    name:           'Anonymous',
    revenue:        0,
    cogs:           0,
    dealsClosed:    0,
    dealsLost:      0,
    newCustomers:   0,
    quota:          0,
    winStreak:      0,
    ...overrides,
  };
}

const ALICE = sp({ id: 'a', name: 'Alice',    revenue: 500_000, cogs: 200_000, dealsClosed: 15, dealsLost: 5,  newCustomers: 6, quota: 400_000, winStreak: 3 });
const BOB   = sp({ id: 'b', name: 'Bob',      revenue: 300_000, cogs: 100_000, dealsClosed: 20, dealsLost: 10, newCustomers: 2, quota: 500_000, winStreak: 6 });
const CAROL = sp({ id: 'c', name: 'Carol',    revenue: 1_200_000, cogs: 400_000, dealsClosed: 8, dealsLost: 2, newCustomers: 4, quota: 800_000, winStreak: 11 });
const DAN   = sp({ id: 'd', name: 'Dan',      revenue: 0,       cogs: 0,       dealsClosed: 0,  dealsLost: 0,  newCustomers: 0, quota: 100_000 });
const EVE   = sp({ id: 'e', name: 'Eve',      revenue: 150_000, cogs: 60_000,  dealsClosed: 10, dealsLost: 0,  newCustomers: 5, quota: 150_000, winStreak: 5 });

const TEAM = [ALICE, BOB, CAROL, DAN, EVE];

/* ------------------------------------------------------------------ */
/* metricValue                                                         */
/* ------------------------------------------------------------------ */

test('metricValue — revenue', () => {
  assert.equal(metricValue(ALICE, METRIC_REVENUE), 500_000);
});

test('metricValue — margin = revenue - cogs', () => {
  assert.equal(metricValue(ALICE, METRIC_MARGIN), 300_000);
});

test('metricValue — deals-closed', () => {
  assert.equal(metricValue(BOB, METRIC_DEALS_CLOSED), 20);
});

test('metricValue — conversion-rate = closed / (closed + lost)', () => {
  // Alice: 15/(15+5) = 0.75
  assert.equal(metricValue(ALICE, METRIC_CONVERSION_RATE), 0.75);
});

test('metricValue — conversion-rate with zero denominator is 0', () => {
  assert.equal(metricValue(DAN, METRIC_CONVERSION_RATE), 0);
});

test('metricValue — avg-deal-size = revenue / dealsClosed', () => {
  // Carol: 1,200,000 / 8 = 150,000
  assert.equal(metricValue(CAROL, METRIC_AVG_DEAL_SIZE), 150_000);
});

test('metricValue — avg-deal-size with zero deals is 0 (no division by zero)', () => {
  assert.equal(metricValue(DAN, METRIC_AVG_DEAL_SIZE), 0);
});

test('metricValue — new-customers', () => {
  assert.equal(metricValue(ALICE, METRIC_NEW_CUSTOMERS), 6);
});

test('metricValue — attainment = revenue / quota', () => {
  // Alice: 500,000 / 400,000 = 1.25
  assert.equal(metricValue(ALICE, METRIC_ATTAINMENT), 1.25);
});

test('metricValue — attainment with zero quota is 0', () => {
  const noQuota = sp({ id: 'nq', name: 'NQ', revenue: 10_000, quota: 0 });
  assert.equal(metricValue(noQuota, METRIC_ATTAINMENT), 0);
});

test('metricValue — unknown metric falls back to revenue (forgiving)', () => {
  assert.equal(metricValue(ALICE, 'made-up-metric'), 500_000);
});

test('metricValue — null / non-object input returns 0', () => {
  assert.equal(metricValue(null, METRIC_REVENUE), 0);
  assert.equal(metricValue(undefined, METRIC_REVENUE), 0);
  assert.equal(metricValue(42, METRIC_REVENUE), 0);
});

/* ------------------------------------------------------------------ */
/* rank()                                                              */
/* ------------------------------------------------------------------ */

test('rank — empty / non-array input returns []', () => {
  assert.deepEqual(rank(null, METRIC_REVENUE, PERIOD_MONTH), []);
  assert.deepEqual(rank([], METRIC_REVENUE, PERIOD_MONTH), []);
});

test('rank — sorts by revenue desc', () => {
  const result = rank(TEAM, METRIC_REVENUE, PERIOD_MONTH);
  assert.equal(result.length, 5);
  assert.deepEqual(result.map((r) => r.id), ['c', 'a', 'b', 'e', 'd']);
  assert.deepEqual(result.map((r) => r.rank), [1, 2, 3, 4, 5]);
});

test('rank — sorts by deals-closed desc (different ordering than revenue)', () => {
  const result = rank(TEAM, METRIC_DEALS_CLOSED, PERIOD_MONTH);
  // Bob 20, Alice 15, Eve 10, Carol 8, Dan 0
  assert.deepEqual(result.map((r) => r.id), ['b', 'a', 'e', 'c', 'd']);
});

test('rank — sorts by conversion-rate desc', () => {
  const result = rank(TEAM, METRIC_CONVERSION_RATE, PERIOD_MONTH);
  // Eve 1.0 > Carol 0.8 > Alice 0.75 > Bob ~0.667 > Dan 0
  assert.equal(result[0].id, 'e');
  assert.equal(result[1].id, 'c');
  assert.equal(result[2].id, 'a');
  assert.equal(result[3].id, 'b');
  assert.equal(result[4].id, 'd');
});

test('rank — sorts by attainment desc', () => {
  const result = rank(TEAM, METRIC_ATTAINMENT, PERIOD_MONTH);
  // Carol 1.5, Alice 1.25, Eve 1.0, Bob 0.6, Dan 0
  assert.deepEqual(result.map((r) => r.id), ['c', 'a', 'e', 'b', 'd']);
});

test('rank — sorts by margin desc', () => {
  const result = rank(TEAM, METRIC_MARGIN, PERIOD_MONTH);
  // Carol 800k, Alice 300k, Bob 200k, Eve 90k, Dan 0
  assert.deepEqual(result.map((r) => r.id), ['c', 'a', 'b', 'e', 'd']);
});

test('rank — sorts by new-customers desc', () => {
  const result = rank(TEAM, METRIC_NEW_CUSTOMERS, PERIOD_MONTH);
  assert.equal(result[0].id, 'a'); // 6
});

test('rank — sorts by avg-deal-size desc', () => {
  const result = rank(TEAM, METRIC_AVG_DEAL_SIZE, PERIOD_MONTH);
  // Carol 150k, Alice 33.3k, Eve 15k, Bob 15k, Dan 0 — but eve vs bob tiebreak
  assert.equal(result[0].id, 'c');
  assert.equal(result[1].id, 'a');
});

test('rank — unknown metric falls back to revenue', () => {
  const byBogus = rank(TEAM, 'not-a-metric', PERIOD_MONTH);
  const byRev   = rank(TEAM, METRIC_REVENUE, PERIOD_MONTH);
  assert.deepEqual(byBogus.map((r) => r.id), byRev.map((r) => r.id));
});

test('rank — unknown period falls back to month', () => {
  const result = rank(TEAM, METRIC_REVENUE, 'century');
  assert.equal(result[0].period, PERIOD_MONTH);
});

test('rank — does not mutate input array', () => {
  const snapshot = TEAM.slice();
  rank(TEAM, METRIC_REVENUE, PERIOD_MONTH);
  assert.deepEqual(TEAM, snapshot);
  // and make sure id order matches — ALICE is still in same slot
  assert.equal(TEAM[0].id, 'a');
});

test('rank — filters out rows with no id', () => {
  const dirty = [ALICE, { name: 'ghost' }, null, undefined, BOB];
  const result = rank(dirty, METRIC_REVENUE, PERIOD_MONTH);
  assert.equal(result.length, 2);
  assert.deepEqual(result.map((r) => r.id).sort(), ['a', 'b']);
});

test('rank — attaches metricValue / metric / period to each row', () => {
  const result = rank(TEAM, METRIC_REVENUE, PERIOD_QUARTER);
  for (const row of result) {
    assert.ok(typeof row.metricValue === 'number');
    assert.equal(row.metric, METRIC_REVENUE);
    assert.equal(row.period, PERIOD_QUARTER);
    assert.ok(Number.isFinite(row.rank));
  }
});

/* ------------------------------------------------------------------ */
/* Tiebreaking                                                         */
/* ------------------------------------------------------------------ */

test('tiebreak — equal primary metric → revenue desc', () => {
  const x = sp({ id: 'x', name: 'X', revenue: 100, dealsClosed: 5 });
  const y = sp({ id: 'y', name: 'Y', revenue: 200, dealsClosed: 5 });
  const result = rank([x, y], METRIC_DEALS_CLOSED, PERIOD_MONTH);
  assert.equal(result[0].id, 'y'); // same deals-closed, higher revenue first
});

test('tiebreak — equal primary metric AND revenue → dealsClosed desc', () => {
  const x = sp({ id: 'x', name: 'X', revenue: 100, dealsClosed: 5, newCustomers: 3 });
  const y = sp({ id: 'y', name: 'Y', revenue: 100, dealsClosed: 9, newCustomers: 3 });
  const result = rank([x, y], METRIC_NEW_CUSTOMERS, PERIOD_MONTH);
  assert.equal(result[0].id, 'y');
});

test('tiebreak — all numeric keys equal → name asc (he-IL)', () => {
  const zack  = sp({ id: 'z', name: 'Zack', revenue: 100, dealsClosed: 1 });
  const amber = sp({ id: 'am', name: 'Amber', revenue: 100, dealsClosed: 1 });
  const result = rank([zack, amber], METRIC_REVENUE, PERIOD_MONTH);
  assert.equal(result[0].id, 'am');
});

test('tiebreak — everything equal (including name) → id asc (fully deterministic)', () => {
  const a = sp({ id: 'id-z', name: 'Same', revenue: 100, dealsClosed: 1 });
  const b = sp({ id: 'id-a', name: 'Same', revenue: 100, dealsClosed: 1 });
  const result = rank([a, b], METRIC_REVENUE, PERIOD_MONTH);
  assert.equal(result[0].id, 'id-a');
});

test('tiebreak — Hebrew names collate correctly', () => {
  const dani = sp({ id: 'dani', name: 'דני',    revenue: 100, dealsClosed: 1 });
  const avi  = sp({ id: 'avi',  name: 'אבי',   revenue: 100, dealsClosed: 1 });
  const result = rank([dani, avi], METRIC_REVENUE, PERIOD_MONTH);
  // Alef (א) < Dalet (ד) in Hebrew alphabet
  assert.equal(result[0].id, 'avi');
});

test('tiebreak — when ALL rows tie on primary metric they receive the SAME rank, but order is stable', () => {
  // All four tie on dealsClosed=1 → same metricValue → all rank=1.
  // Secondary tiebreakers (revenue, name) still determine the PRINTED ORDER,
  // but dense-rank assigns #1 to every tied row per competition ranking rules.
  const a = sp({ id: 'a', name: 'A', revenue: 100, dealsClosed: 1 });
  const b = sp({ id: 'b', name: 'B', revenue: 50,  dealsClosed: 1 });
  const c = sp({ id: 'c', name: 'C', revenue: 50,  dealsClosed: 1 });
  const d = sp({ id: 'd', name: 'D', revenue: 20,  dealsClosed: 1 });
  const result = rank([a, b, c, d], METRIC_DEALS_CLOSED, PERIOD_MONTH);
  assert.deepEqual(result.map((r) => r.rank), [1, 1, 1, 1]);
  // Order is still deterministic: highest revenue first
  assert.deepEqual(result.map((r) => r.id), ['a', 'b', 'c', 'd']);
});

test('tiebreak — true ties on primary metric get SAME rank', () => {
  // Same conversion-rate (1.0) for all three, then fall back to revenue
  const a = sp({ id: 'a', name: 'A', revenue: 300, dealsClosed: 3, dealsLost: 0 });
  const b = sp({ id: 'b', name: 'B', revenue: 200, dealsClosed: 2, dealsLost: 0 });
  const c = sp({ id: 'c', name: 'C', revenue: 100, dealsClosed: 1, dealsLost: 0 });
  // All have conversion-rate exactly 1.0 — BUT our dense-rank logic uses
  // metricValue equality, which here is 1.0 for all → same rank
  const result = rank([a, b, c], METRIC_CONVERSION_RATE, PERIOD_MONTH);
  assert.equal(result[0].metricValue, 1);
  assert.equal(result[1].metricValue, 1);
  assert.equal(result[2].metricValue, 1);
  assert.deepEqual(result.map((r) => r.rank), [1, 1, 1]);
});

test('tiebreak — mixed ranks (1,2,2,4) when only some rows tie on metricValue', () => {
  // revenue 100, 80, 80, 50 → ranks 1,2,2,4
  const a = sp({ id: 'a', name: 'A', revenue: 100, dealsClosed: 1 });
  const b = sp({ id: 'b', name: 'B', revenue: 80,  dealsClosed: 1 });
  const c = sp({ id: 'c', name: 'C', revenue: 80,  dealsClosed: 1 });
  const d = sp({ id: 'd', name: 'D', revenue: 50,  dealsClosed: 1 });
  const result = rank([a, b, c, d], METRIC_REVENUE, PERIOD_MONTH);
  assert.deepEqual(result.map((r) => r.rank), [1, 2, 2, 4]);
});

/* ------------------------------------------------------------------ */
/* movement()                                                          */
/* ------------------------------------------------------------------ */

test('movement — empty inputs return empty map', () => {
  assert.deepEqual(movement([], []), Object.create(null));
  assert.deepEqual(Object.keys(movement(null, null)).length, 0);
});

test('movement — up arrow when rank improved', () => {
  const prev = [{ id: 'a', rank: 5 }];
  const cur  = [{ id: 'a', rank: 2 }];
  const m = movement(cur, prev);
  assert.equal(m.a.direction, 'up');
  assert.equal(m.a.delta, 3);
  assert.equal(m.a.previousRank, 5);
  assert.equal(m.a.currentRank, 2);
});

test('movement — down arrow when rank worsened', () => {
  const prev = [{ id: 'a', rank: 2 }];
  const cur  = [{ id: 'a', rank: 7 }];
  const m = movement(cur, prev);
  assert.equal(m.a.direction, 'down');
  assert.equal(m.a.delta, -5);
});

test('movement — same when rank unchanged', () => {
  const m = movement([{ id: 'a', rank: 3 }], [{ id: 'a', rank: 3 }]);
  assert.equal(m.a.direction, 'same');
  assert.equal(m.a.delta, 0);
});

test('movement — new when id only in current', () => {
  const m = movement([{ id: 'a', rank: 1 }], [{ id: 'other', rank: 1 }]);
  assert.equal(m.a.direction, 'new');
  assert.equal(m.a.previousRank, null);
  assert.equal(m.a.delta, null);
});

test('movement — ids only in previous are ignored (no ghost entries)', () => {
  const m = movement([{ id: 'a', rank: 1 }], [{ id: 'b', rank: 1 }, { id: 'a', rank: 2 }]);
  assert.equal(Object.keys(m).length, 1);
  assert.ok(m.a);
  assert.equal(m.b, undefined);
});

test('movement — integrates with rank() across two periods', () => {
  const thisMonth = rank(TEAM, METRIC_REVENUE, PERIOD_MONTH);
  // Swap Alice and Bob's revenue for previous period
  const prevTeam = TEAM.map((r) => {
    if (r.id === 'a') return { ...r, revenue: 300_000 };
    if (r.id === 'b') return { ...r, revenue: 500_000 };
    return r;
  });
  const lastMonth = rank(prevTeam, METRIC_REVENUE, PERIOD_MONTH);
  const m = movement(thisMonth, lastMonth);
  // Alice moved up (was below Bob previously, now above)
  assert.equal(m.a.direction, 'up');
  assert.equal(m.b.direction, 'down');
});

/* ------------------------------------------------------------------ */
/* generateBadges()                                                    */
/* ------------------------------------------------------------------ */

test('generateBadges — null / non-object is safe', () => {
  assert.deepEqual(generateBadges(null), []);
  assert.deepEqual(generateBadges(undefined), []);
  assert.deepEqual(generateBadges(42), []);
});

test('generateBadges — first-sale awarded for 1+ deal', () => {
  const b = generateBadges(sp({ dealsClosed: 1 }));
  assert.ok(b.some((x) => x.id === BADGE_FIRST_SALE));
});

test('generateBadges — first-sale also awarded when firstSaleAt present even with 0 currentperiod deals', () => {
  const b = generateBadges(sp({ dealsClosed: 0, firstSaleAt: '2025-08-01' }));
  assert.ok(b.some((x) => x.id === BADGE_FIRST_SALE));
});

test('generateBadges — ten-deals requires 10+', () => {
  assert.equal(generateBadges(sp({ dealsClosed: 9  })).some((x) => x.id === BADGE_TEN_DEALS), false);
  assert.equal(generateBadges(sp({ dealsClosed: 10 })).some((x) => x.id === BADGE_TEN_DEALS), true);
});

test('generateBadges — revenue tiers stack (100k/250k/1M)', () => {
  const b1 = generateBadges(sp({ dealsClosed: 1, revenue: 100_000 }));
  assert.ok(b1.some((x) => x.id === BADGE_HUNDRED_K));
  assert.ok(!b1.some((x) => x.id === BADGE_QUARTER_M));

  const b2 = generateBadges(sp({ dealsClosed: 1, revenue: 250_000 }));
  assert.ok(b2.some((x) => x.id === BADGE_HUNDRED_K));
  assert.ok(b2.some((x) => x.id === BADGE_QUARTER_M));
  assert.ok(!b2.some((x) => x.id === BADGE_MILLION));

  const b3 = generateBadges(sp({ dealsClosed: 1, revenue: 1_500_000 }));
  assert.ok(b3.some((x) => x.id === BADGE_HUNDRED_K));
  assert.ok(b3.some((x) => x.id === BADGE_QUARTER_M));
  assert.ok(b3.some((x) => x.id === BADGE_MILLION));
});

test('generateBadges — beat-quota requires attainment >= 100%', () => {
  assert.ok(generateBadges(sp({ dealsClosed: 1, revenue: 100_000, quota: 100_000 })).some((x) => x.id === BADGE_BEAT_QUOTA));
  assert.ok(generateBadges(sp({ dealsClosed: 1, revenue: 200_000, quota: 100_000 })).some((x) => x.id === BADGE_BEAT_QUOTA));
  assert.ok(!generateBadges(sp({ dealsClosed: 1, revenue:  99_000, quota: 100_000 })).some((x) => x.id === BADGE_BEAT_QUOTA));
});

test('generateBadges — beat-quota not awarded when quota is 0', () => {
  // quota=0 would be /0; we explicitly guard this path
  assert.ok(!generateBadges(sp({ dealsClosed: 1, revenue: 100_000, quota: 0 })).some((x) => x.id === BADGE_BEAT_QUOTA));
});

test('generateBadges — win-streak thresholds (5 and 10)', () => {
  assert.ok(!generateBadges(sp({ dealsClosed: 1, winStreak: 4  })).some((x) => x.id === BADGE_WIN_STREAK));
  assert.ok( generateBadges(sp({ dealsClosed: 1, winStreak: 5  })).some((x) => x.id === BADGE_WIN_STREAK));
  assert.ok( generateBadges(sp({ dealsClosed: 1, winStreak: 10 })).some((x) => x.id === BADGE_HOT_STREAK));
  // hot-streak implies win-streak in catalog order
  const b = generateBadges(sp({ dealsClosed: 1, winStreak: 10 }));
  assert.ok(b.some((x) => x.id === BADGE_WIN_STREAK));
  assert.ok(b.some((x) => x.id === BADGE_HOT_STREAK));
});

test('generateBadges — century-club uses lifetime deals (current + history)', () => {
  const rookie = sp({ dealsClosed: 20, history: [] });
  assert.ok(!generateBadges(rookie).some((x) => x.id === BADGE_CENTURY));

  const veteran = sp({
    dealsClosed: 20,
    history: [
      { period: '2025-Q1', dealsClosed: 30 },
      { period: '2025-Q2', dealsClosed: 30 },
      { period: '2025-Q3', dealsClosed: 25 },
    ],
  });
  // 20 + 30 + 30 + 25 = 105
  assert.ok(generateBadges(veteran).some((x) => x.id === BADGE_CENTURY));
});

test('generateBadges — returns badges in catalog order (deterministic)', () => {
  const heavy = sp({
    dealsClosed: 50,
    revenue: 2_000_000,
    quota: 500_000,
    winStreak: 12,
    firstSaleAt: '2024-01-01',
  });
  const b = generateBadges(heavy);
  const ids = b.map((x) => x.id);
  // Expected order = Object.keys(BADGE_CATALOG) intersected with earned
  const catalogOrder = Object.keys(BADGE_CATALOG);
  const filteredCatalog = catalogOrder.filter((k) => ids.includes(k));
  assert.deepEqual(ids, filteredCatalog);
});

test('generateBadges — honors legacy badges[] on the record', () => {
  const legacy = sp({ dealsClosed: 1, badges: [BADGE_HOT_STREAK] });
  const b = generateBadges(legacy);
  assert.ok(b.some((x) => x.id === BADGE_HOT_STREAK));
});

test('generateBadges — returns a copy so caller mutation cannot corrupt catalog', () => {
  const b = generateBadges(sp({ dealsClosed: 1 }));
  b[0].name_he = 'MUTATED';
  assert.notEqual(BADGE_CATALOG[BADGE_FIRST_SALE].name_he, 'MUTATED');
});

/* ------------------------------------------------------------------ */
/* formatMetric                                                        */
/* ------------------------------------------------------------------ */

test('formatMetric — revenue formatted with currency symbol', () => {
  const s = formatMetric(12345, METRIC_REVENUE);
  assert.ok(s.includes('\u20AA'));
});

test('formatMetric — conversion-rate formatted as percent', () => {
  assert.ok(formatMetric(0.75, METRIC_CONVERSION_RATE).includes('%'));
});

test('formatMetric — attainment formatted as percent (no decimals)', () => {
  assert.ok(formatMetric(1.25, METRIC_ATTAINMENT).includes('%'));
});

/* ------------------------------------------------------------------ */
/* findRank                                                            */
/* ------------------------------------------------------------------ */

test('findRank — returns rank for known id', () => {
  const ranked = rank(TEAM, METRIC_REVENUE, PERIOD_MONTH);
  assert.equal(findRank(ranked, 'c'), 1); // Carol has highest revenue
});

test('findRank — returns null for missing id', () => {
  const ranked = rank(TEAM, METRIC_REVENUE, PERIOD_MONTH);
  assert.equal(findRank(ranked, 'nobody'), null);
  assert.equal(findRank(null, 'a'), null);
  assert.equal(findRank(ranked, null), null);
});

/* ------------------------------------------------------------------ */
/* Catalog shape                                                       */
/* ------------------------------------------------------------------ */

test('BADGE_CATALOG — every entry has required fields', () => {
  for (const [id, b] of Object.entries(BADGE_CATALOG)) {
    assert.equal(b.id, id);
    assert.ok(typeof b.name_he === 'string' && b.name_he.length > 0);
    assert.ok(typeof b.name_en === 'string' && b.name_en.length > 0);
    assert.ok(typeof b.symbol === 'string');
    assert.ok(typeof b.color === 'string' && b.color.startsWith('#'));
    assert.ok(Number.isFinite(b.tier));
  }
});

test('BADGE_CATALOG — frozen (prevents accidental mutation)', () => {
  assert.equal(Object.isFrozen(BADGE_CATALOG), true);
});

test('METRICS — contains all seven required metrics', () => {
  assert.equal(METRICS.length, 7);
  assert.ok(METRICS.includes(METRIC_REVENUE));
  assert.ok(METRICS.includes(METRIC_MARGIN));
  assert.ok(METRICS.includes(METRIC_DEALS_CLOSED));
  assert.ok(METRICS.includes(METRIC_CONVERSION_RATE));
  assert.ok(METRICS.includes(METRIC_AVG_DEAL_SIZE));
  assert.ok(METRICS.includes(METRIC_NEW_CUSTOMERS));
  assert.ok(METRICS.includes(METRIC_ATTAINMENT));
});

test('PERIODS — month / quarter / year', () => {
  assert.equal(PERIOD_MONTH, 'month');
  assert.equal(PERIOD_QUARTER, 'quarter');
  assert.equal(PERIOD_YEAR, 'year');
});
