/**
 * Asset Manager — Unit Tests
 * Fixed Asset & Depreciation Engine (Techno-Kol Uzi ERP, Agent X-34)
 *
 * Run with:   node --test test/payroll/asset-manager.test.js
 *
 * Requires Node >= 18 (built-in node:test runner, zero external deps).
 *
 * Test plan (20+ cases):
 *   1. Category catalog completeness (Israeli תקנות פחת rates)
 *   2. Straight-line depreciation math
 *   3. Double-declining balance math
 *   4. Sum-of-years-digits math
 *   5. Units of production math
 *   6. Add asset — happy path
 *   7. Add asset — rejects unknown category
 *   8. Add asset — rejects invalid date / negative cost / salvage > cost
 *   9. Default useful life from category
 *  10. Mid-month convention (first period)
 *  11. Monthly depreciation full year (computer @ 33%)
 *  12. Heavy equipment 20% straight-line
 *  13. Mobile phone 50% — 2-year full write-off
 *  14. Industrial building 8% accelerated
 *  15. Disposal with GAIN
 *  16. Disposal with LOSS
 *  17. Transfer between locations
 *  18. Revaluation (IAS 16)
 *  19. Impairment test — triggers adjustment
 *  20. Impairment test — no impairment
 *  21. Forecast — 5-year NBV projection (straight line)
 *  22. Forecast — declining balance never crosses salvage
 *  23. Audit report — missing, mismatch, ghost
 *  24. Category summary aggregates
 *  25. Barcode deterministic generator
 *  26. Never-delete rule — disposed assets remain in store
 *  27. Accumulated depreciation never exceeds depreciable base
 *  28. Isolated stores — createAssetStore() does not leak state
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const MOD = require(path.resolve(
  __dirname,
  '..',
  '..',
  'onyx-procurement',
  'src',
  'assets',
  'asset-manager.js'
));

const {
  createAssetStore,
  CATEGORY_RATES,
  METHODS,
  depStraightLine,
  depDecliningBalance,
  depSumOfYears,
  depUnitsOfProduction,
  round2,
  monthsBetweenMidMonth,
  generateBarcode,
} = MOD;

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
function near(a, b, eps = 0.02) {
  return Math.abs(a - b) <= eps;
}
function assertNear(actual, expected, eps = 0.02, msg) {
  assert.ok(
    near(actual, expected, eps),
    msg || `expected ${expected} ± ${eps}, got ${actual} (delta ${(actual - expected).toFixed(4)})`
  );
}

// ─────────────────────────────────────────────────────────────
// 1. Category catalog completeness — Israeli תקנות מס הכנסה פחת
// ─────────────────────────────────────────────────────────────
test('catalog: all required Israeli categories present', () => {
  const required = [
    'BUILDING_OFFICE',
    'BUILDING_INDUSTRIAL',
    'MACHINERY_GENERAL',
    'HEAVY_EQUIPMENT',
    'COMPUTERS',
    'MOBILE_PHONES',
    'VEHICLE_PRIVATE',
    'VEHICLE_TRUCK',
    'FURNITURE_STANDARD',
    'FURNITURE_ACCELERATED',
    'TOOLS',
    'SOFTWARE',
  ];
  for (const key of required) {
    assert.ok(CATEGORY_RATES[key], `missing category ${key}`);
    assert.ok(typeof CATEGORY_RATES[key].rate === 'number');
    assert.ok(CATEGORY_RATES[key].rate > 0);
    assert.ok(typeof CATEGORY_RATES[key].he === 'string');
    assert.ok(typeof CATEGORY_RATES[key].en === 'string');
  }
});

test('catalog: rates match Israeli tax authority (תקנות פחת)', () => {
  // Buildings
  assert.equal(CATEGORY_RATES.BUILDING_OFFICE.rate, 0.04);
  assert.equal(CATEGORY_RATES.BUILDING_INDUSTRIAL.rate, 0.08);
  // Machinery
  assert.equal(CATEGORY_RATES.MACHINERY_GENERAL.rate, 0.15);
  assert.equal(CATEGORY_RATES.HEAVY_EQUIPMENT.rate, 0.20);
  // IT
  assert.equal(CATEGORY_RATES.COMPUTERS.rate, 0.33);
  assert.equal(CATEGORY_RATES.MOBILE_PHONES.rate, 0.50);
  assert.equal(CATEGORY_RATES.SOFTWARE.rate, 0.33);
  // Vehicles
  assert.equal(CATEGORY_RATES.VEHICLE_PRIVATE.rate, 0.15);
  assert.equal(CATEGORY_RATES.VEHICLE_TRUCK.rate, 0.20);
  // Furniture
  assert.equal(CATEGORY_RATES.FURNITURE_STANDARD.rate, 0.06);
  assert.equal(CATEGORY_RATES.FURNITURE_ACCELERATED.rate, 0.15);
  // Tools
  assert.equal(CATEGORY_RATES.TOOLS.rate, 0.25);
});

// ─────────────────────────────────────────────────────────────
// 2-5. Pure math helpers
// ─────────────────────────────────────────────────────────────
test('math: straight-line depreciation', () => {
  // Cost 10,000, salvage 1,000, life 5 → 1,800/yr
  assertNear(depStraightLine(10000, 1000, 5), 1800);
  // Cost 100,000, salvage 0, life 10 → 10,000/yr
  assertNear(depStraightLine(100000, 0, 10), 10000);
  // Zero life → 0
  assert.equal(depStraightLine(100, 0, 0), 0);
});

test('math: double-declining balance respects salvage floor', () => {
  // Cost 10,000, salvage 1,000, life 5, year 1 → 4,000 (10000 * 2/5)
  assertNear(depDecliningBalance(10000, 1000, 5, 1), 4000);
  // Year 2 → 6000 * 0.4 = 2400
  assertNear(depDecliningBalance(10000, 1000, 5, 2), 2400);
  // Eventually clamps at salvage
  const last = depDecliningBalance(10000, 1000, 5, 10);
  assert.ok(last >= 0);
});

test('math: sum-of-years-digits formula', () => {
  // Life 5 → SYD = 15; year 1 factor = 5/15 = 1/3
  // Cost 10,000, salvage 1,000 → depreciable 9,000 → 3,000 year-1
  assertNear(depSumOfYears(10000, 1000, 5, 1), 3000);
  assertNear(depSumOfYears(10000, 1000, 5, 2), 2400); // 4/15 * 9000
  assertNear(depSumOfYears(10000, 1000, 5, 5), 600);  // 1/15 * 9000
});

test('math: units of production', () => {
  // Cost 100,000, salvage 10,000, 1000 units total, 100 this period → 9,000
  assertNear(depUnitsOfProduction(100000, 10000, 100, 1000), 9000);
  assert.equal(depUnitsOfProduction(100, 0, 10, 0), 0);
});

// ─────────────────────────────────────────────────────────────
// 6-9. addAsset validation
// ─────────────────────────────────────────────────────────────
test('addAsset: happy path returns id and stores asset', () => {
  const s = createAssetStore();
  const id = s.addAsset({
    name: 'Dell Precision 5680',
    name_he: 'מחשב דל',
    category: 'COMPUTERS',
    cost: 12000,
    acquisition_date: '2026-01-15',
    custodian: 'Kobi Elimelech',
    location: 'HQ-FLOOR-2',
  });
  assert.ok(id);
  const a = s.getAsset(id);
  assert.equal(a.cost, 12000);
  assert.equal(a.category_he, 'מחשבים וציוד היקפי');
  assert.equal(a.current_nbv, 12000);
  assert.equal(a.accumulated_depreciation, 0);
  assert.equal(a.status, 'ACTIVE');
  assert.ok(a.barcode);
});

test('addAsset: rejects unknown category', () => {
  const s = createAssetStore();
  assert.throws(
    () => s.addAsset({ category: 'UNKNOWN_CAT', cost: 1000, acquisition_date: '2026-01-01' }),
    /unknown category/
  );
});

test('addAsset: rejects invalid fields', () => {
  const s = createAssetStore();
  assert.throws(
    () => s.addAsset({ category: 'COMPUTERS', cost: -5, acquisition_date: '2026-01-01' }),
    /cost must be a non-negative/
  );
  assert.throws(
    () => s.addAsset({ category: 'COMPUTERS', cost: 100, acquisition_date: 'not-a-date' }),
    /acquisition_date/
  );
  assert.throws(
    () => s.addAsset({
      category: 'COMPUTERS',
      cost: 100,
      salvage_value: 200,
      acquisition_date: '2026-01-01',
    }),
    /salvage_value cannot exceed cost/
  );
});

test('addAsset: inherits useful life from category', () => {
  const s = createAssetStore();
  const id = s.addAsset({
    name: 'Office desk',
    category: 'FURNITURE_STANDARD',
    cost: 2000,
    acquisition_date: '2026-01-01',
  });
  const a = s.getAsset(id);
  assert.ok(Math.abs(a.useful_life_years - 16.67) < 0.1);
});

// ─────────────────────────────────────────────────────────────
// 10. Mid-month convention
// ─────────────────────────────────────────────────────────────
test('mid-month convention: acquired before 15th → full month', () => {
  const from = new Date('2026-01-10');
  const to = new Date('2026-02-20');
  const m = monthsBetweenMidMonth(from, to);
  // jan → feb = 1 month, from day 10 (≤15 → 0 adj), to day 20 (≥15 → +0.5)
  assert.ok(m > 1);
  assert.ok(m <= 2);
});

test('mid-month convention: acquired after 15th → half month less', () => {
  const from = new Date('2026-01-20');
  const to = new Date('2026-07-20');
  const m = monthsBetweenMidMonth(from, to);
  // base 6 - 0.5 + 0.5 = 6
  assertNear(m, 6, 0.01);
});

// ─────────────────────────────────────────────────────────────
// 11-14. runDepreciation per category
// ─────────────────────────────────────────────────────────────
test('runDepreciation: computer at 33% straight-line, full year', () => {
  const s = createAssetStore();
  const id = s.addAsset({
    name: 'PC',
    category: 'COMPUTERS',
    cost: 9000,
    salvage_value: 0,
    acquisition_date: '2026-01-01',
  });
  const entries = s.runDepreciation('2027-01-01');
  assert.ok(entries.length >= 1);
  const a = s.getAsset(id);
  // 9000 / 3 yrs = 3000/yr. NBV should be ~6000 after first year
  assertNear(a.current_nbv, 6000, 5);
  assertNear(a.accumulated_depreciation, 3000, 5);
});

test('runDepreciation: heavy equipment 20% rate (life 5)', () => {
  const s = createAssetStore();
  const id = s.addAsset({
    name: 'Bulldozer',
    category: 'HEAVY_EQUIPMENT',
    cost: 500000,
    salvage_value: 50000,
    acquisition_date: '2026-01-01',
  });
  s.runDepreciation('2027-01-01');
  const a = s.getAsset(id);
  // (500k - 50k) / 5 = 90k
  assertNear(a.accumulated_depreciation, 90000, 100);
  assertNear(a.current_nbv, 410000, 100);
});

test('runDepreciation: mobile phone 50% — two-year full write-off', () => {
  const s = createAssetStore();
  const id = s.addAsset({
    name: 'iPhone 16 Pro',
    category: 'MOBILE_PHONES',
    cost: 4500,
    salvage_value: 0,
    acquisition_date: '2026-01-01',
  });
  // After 2 years, NBV must equal salvage (0)
  s.runDepreciation('2027-01-01');
  s.runDepreciation('2028-01-01');
  const a = s.getAsset(id);
  assertNear(a.current_nbv, 0, 1);
  assertNear(a.accumulated_depreciation, 4500, 1);
});

test('runDepreciation: industrial building 8% accelerated', () => {
  const s = createAssetStore();
  const id = s.addAsset({
    name: 'Factory hall',
    category: 'BUILDING_INDUSTRIAL',
    cost: 4000000,
    salvage_value: 0,
    acquisition_date: '2026-01-01',
  });
  s.runDepreciation('2027-01-01');
  const a = s.getAsset(id);
  // 4,000,000 / 12.5 = 320,000/yr
  assertNear(a.accumulated_depreciation, 320000, 500);
});

// ─────────────────────────────────────────────────────────────
// 15-16. Disposal gain/loss
// ─────────────────────────────────────────────────────────────
test('dispose: GAIN when sale > NBV', () => {
  const s = createAssetStore();
  const id = s.addAsset({
    name: 'Server',
    category: 'COMPUTERS',
    cost: 10000,
    salvage_value: 0,
    acquisition_date: '2026-01-01',
  });
  // Two years later, NBV ~= 10000 - 2*(10000/3) ≈ 3333.33
  const result = s.dispose(id, 6000, '2028-01-01');
  assert.ok(result.gain_loss > 0, 'expected gain');
  assert.ok(result.journal);
  const a = s.getAsset(id);
  assert.equal(a.status, 'DISPOSED');
  assert.equal(a.disposal_proceeds, 6000);
});

test('dispose: LOSS when sale < NBV', () => {
  const s = createAssetStore();
  const id = s.addAsset({
    name: 'Truck',
    category: 'VEHICLE_TRUCK',
    cost: 300000,
    salvage_value: 30000,
    acquisition_date: '2026-01-01',
  });
  // After 1 year NBV ≈ 300k - 54k = 246k
  const result = s.dispose(id, 100000, '2027-01-01');
  assert.ok(result.gain_loss < 0, 'expected loss');
  const a = s.getAsset(id);
  assert.equal(a.status, 'DISPOSED');
});

// ─────────────────────────────────────────────────────────────
// 17. Transfer
// ─────────────────────────────────────────────────────────────
test('transfer: updates location and custodian + logs tx', () => {
  const s = createAssetStore();
  const id = s.addAsset({
    name: 'Lathe',
    category: 'MACHINERY_GENERAL',
    cost: 50000,
    acquisition_date: '2026-01-01',
    location: 'WAREHOUSE-A',
    custodian: 'Alice',
  });
  s.transfer(id, 'WAREHOUSE-B', 'Bob');
  const a = s.getAsset(id);
  assert.equal(a.location, 'WAREHOUSE-B');
  assert.equal(a.custodian, 'Bob');
  const txs = s.getTransactions(id);
  assert.ok(txs.some((t) => t.type === 'TRANSFER'));
});

// ─────────────────────────────────────────────────────────────
// 18. Revaluation
// ─────────────────────────────────────────────────────────────
test('revalue: IAS 16 — surplus above NBV', () => {
  const s = createAssetStore();
  const id = s.addAsset({
    name: 'Land / Building',
    category: 'BUILDING_OFFICE',
    cost: 1000000,
    acquisition_date: '2026-01-01',
  });
  const r = s.revalue(id, 1200000, '2026-12-31');
  assert.equal(r.surplus, 200000);
  const a = s.getAsset(id);
  assert.equal(a.current_nbv, 1200000);
  assert.equal(a.revaluation_surplus, 200000);
});

// ─────────────────────────────────────────────────────────────
// 19-20. Impairment
// ─────────────────────────────────────────────────────────────
test('impairmentTest: writes down when recoverable < carrying', () => {
  const s = createAssetStore();
  const id = s.addAsset({
    name: 'Obsolete machine',
    category: 'MACHINERY_GENERAL',
    cost: 100000,
    acquisition_date: '2026-01-01',
  });
  const r = s.impairmentTest(id, 40000);
  assert.equal(r.impaired, true);
  assert.equal(r.adjustment, 60000);
  assert.equal(s.getAsset(id).current_nbv, 40000);
  assert.equal(s.getAsset(id).impairment_loss, 60000);
});

test('impairmentTest: no change when recoverable >= carrying', () => {
  const s = createAssetStore();
  const id = s.addAsset({
    name: 'Healthy asset',
    category: 'MACHINERY_GENERAL',
    cost: 100000,
    acquisition_date: '2026-01-01',
  });
  const r = s.impairmentTest(id, 120000);
  assert.equal(r.impaired, false);
  assert.equal(r.adjustment, 0);
  assert.equal(s.getAsset(id).current_nbv, 100000);
});

// ─────────────────────────────────────────────────────────────
// 21-22. Forecast
// ─────────────────────────────────────────────────────────────
test('forecast: 5-year straight-line schedule', () => {
  const s = createAssetStore();
  const id = s.addAsset({
    name: 'Machine',
    category: 'HEAVY_EQUIPMENT',   // life 5, rate 20%
    cost: 500000,
    salvage_value: 0,
    acquisition_date: '2026-01-01',
  });
  const schedule = s.forecast(id, 5);
  assert.equal(schedule.length, 5);
  // Year 1 dep = 500k/5 = 100k
  assertNear(schedule[0].depreciation, 100000, 100);
  // Final NBV should be at or near 0
  assertNear(schedule[4].nbv, 0, 100);
});

test('forecast: declining balance never crosses salvage', () => {
  const s = createAssetStore();
  const id = s.addAsset({
    name: 'DDB machine',
    category: 'MACHINERY_GENERAL',
    cost: 100000,
    salvage_value: 5000,
    acquisition_date: '2026-01-01',
    depreciation_method: METHODS.DECLINING_BALANCE,
    useful_life_years: 5,
  });
  const sched = s.forecast(id, 10);
  for (const row of sched) {
    assert.ok(row.nbv >= 5000 - 0.01, `NBV ${row.nbv} went below salvage 5000`);
  }
});

// ─────────────────────────────────────────────────────────────
// 23. Audit report
// ─────────────────────────────────────────────────────────────
test('auditReport: detects missing, mismatched and ghost items', () => {
  const s = createAssetStore();
  const id1 = s.addAsset({
    name: 'Laptop A',
    category: 'COMPUTERS',
    cost: 5000,
    acquisition_date: '2026-01-01',
    location: 'HQ',
  });
  const id2 = s.addAsset({
    name: 'Laptop B',
    category: 'COMPUTERS',
    cost: 6000,
    acquisition_date: '2026-01-01',
    location: 'BRANCH-1',
  });

  const count = {
    [id1]: 'HQ',            // match
    [id2]: 'HQ',            // mismatch
    // id2's real loc BRANCH-1 → mismatch
    // "ghost-1" not registered
    'ghost-1': 'WAREHOUSE',
  };
  // id2 missing from count entirely? No — it's there but mismatched.
  // Let's also add a truly missing one:
  const id3 = s.addAsset({
    name: 'Missing tablet',
    category: 'COMPUTERS',
    cost: 3000,
    acquisition_date: '2026-01-01',
    location: 'REMOTE',
  });

  const issues = s.auditReport(count);
  const byId = Object.fromEntries(issues.map((i) => [i.asset_id, i]));
  assert.equal(byId[id2].issue, 'LOCATION_MISMATCH');
  assert.equal(byId[id3].issue, 'MISSING');
  assert.equal(byId['ghost-1'].issue, 'GHOST');
});

// ─────────────────────────────────────────────────────────────
// 24. Category summary
// ─────────────────────────────────────────────────────────────
test('categorySummary: aggregates by category', () => {
  const s = createAssetStore();
  s.addAsset({ name: 'PC1', category: 'COMPUTERS', cost: 5000, acquisition_date: '2026-01-01' });
  s.addAsset({ name: 'PC2', category: 'COMPUTERS', cost: 7000, acquisition_date: '2026-01-01' });
  s.addAsset({ name: 'Truck', category: 'VEHICLE_TRUCK', cost: 300000, acquisition_date: '2026-01-01' });
  const sum = s.categorySummary();
  const comp = sum.find((r) => r.category === 'COMPUTERS');
  assert.equal(comp.count, 2);
  assert.equal(comp.cost, 12000);
  const truck = sum.find((r) => r.category === 'VEHICLE_TRUCK');
  assert.equal(truck.count, 1);
  assert.equal(truck.cost, 300000);
});

// ─────────────────────────────────────────────────────────────
// 25. Barcode
// ─────────────────────────────────────────────────────────────
test('barcode: deterministic for same seed', () => {
  const a = generateBarcode('FA-000001');
  const b = generateBarcode('FA-000001');
  assert.equal(a, b);
  assert.match(a, /^\*.+\*$/);
});

// ─────────────────────────────────────────────────────────────
// 26. Never-delete rule — disposed assets remain
// ─────────────────────────────────────────────────────────────
test('never-delete: disposed asset stays in the store', () => {
  const s = createAssetStore();
  const id = s.addAsset({
    name: 'Old phone',
    category: 'MOBILE_PHONES',
    cost: 3000,
    acquisition_date: '2026-01-01',
  });
  s.dispose(id, 500, '2027-01-01');
  const a = s.getAsset(id);
  assert.ok(a);
  assert.equal(a.status, 'DISPOSED');
  const all = s.listAssets();
  assert.ok(all.some((x) => x.id === id));
});

// ─────────────────────────────────────────────────────────────
// 27. Accumulated dep never exceeds depreciable base
// ─────────────────────────────────────────────────────────────
test('depreciation: accumulated never exceeds (cost - salvage)', () => {
  const s = createAssetStore();
  const id = s.addAsset({
    name: 'Tool set',
    category: 'TOOLS',
    cost: 8000,
    salvage_value: 800,
    acquisition_date: '2026-01-01',
  });
  // Run far beyond useful life
  for (let y = 1; y <= 10; y++) {
    s.runDepreciation(`${2026 + y}-01-01`);
  }
  const a = s.getAsset(id);
  const depreciable = a.cost - a.salvage_value;
  assert.ok(a.accumulated_depreciation <= depreciable + 0.02);
  assert.ok(a.current_nbv >= a.salvage_value - 0.02);
});

// ─────────────────────────────────────────────────────────────
// 28. Isolated stores
// ─────────────────────────────────────────────────────────────
test('createAssetStore: stores are isolated', () => {
  const s1 = createAssetStore();
  const s2 = createAssetStore();
  const id1 = s1.addAsset({
    name: 'A',
    category: 'COMPUTERS',
    cost: 1000,
    acquisition_date: '2026-01-01',
  });
  assert.ok(s1.getAsset(id1));
  assert.equal(s2.getAsset(id1), null);
});

// ─────────────────────────────────────────────────────────────
// 29. GL journal entries are posted on depreciation
// ─────────────────────────────────────────────────────────────
test('depreciation: auto-posts GL journal entries (debit exp / credit accum)', () => {
  const s = createAssetStore();
  const id = s.addAsset({
    name: 'PC',
    category: 'COMPUTERS',
    cost: 6000,
    salvage_value: 0,
    acquisition_date: '2026-01-01',
  });
  s.runDepreciation('2027-01-01');
  const journal = s.getJournal(id);
  assert.ok(journal.length >= 1);
  const entry = journal[0];
  assert.equal(entry.debit.account, '7200-DEP-EXP');
  assert.equal(entry.credit.account, '1590-ACC-DEP');
  assert.equal(entry.debit.amount, entry.credit.amount);
});

// ─────────────────────────────────────────────────────────────
// 30. Hebrew labels present
// ─────────────────────────────────────────────────────────────
test('bilingual: category_he and transaction type_he present', () => {
  const s = createAssetStore();
  const id = s.addAsset({
    name: 'Desk',
    category: 'FURNITURE_STANDARD',
    cost: 1500,
    acquisition_date: '2026-01-01',
  });
  const a = s.getAsset(id);
  assert.equal(a.category_he, 'ריהוט משרדי');
  const txs = s.getTransactions(id);
  assert.equal(txs[0].type_he, 'רכישה');
});
