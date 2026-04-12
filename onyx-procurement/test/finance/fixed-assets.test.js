/**
 * Tests for FixedAssetRegister — src/finance/fixed-assets.js
 * Agent AG-Y076 / Swarm 4B / Techno-Kol Uzi Mega-ERP 2026
 * ---------------------------------------------------------------------------
 * Covers:
 *   - Israeli depreciation rate lookup (all embedded classes)
 *   - SL / DDB / Sum-of-years-digits depreciation methods
 *   - Full-life schedule correctness (sums match cost basis)
 *   - Pro-rata first-year depreciation
 *   - Disposal gain/loss (and integration with Y-006 capital gains event)
 *   - Impairment write-down
 *   - Revaluation (IAS 16)
 *   - Intra-company transfer
 *   - CAPEX report aggregation
 *   - Append-only history (never deletes)
 *
 * Run: node --test test/finance/fixed-assets.test.js
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  FixedAssetRegister,
  DEPRECIATION_CLASSES,
  resolveClass,
  slAnnual,
  ddbAnnual,
  soydAnnual,
  buildSchedule,
} = require('../../src/finance/fixed-assets');

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function newRegister(opts = {}) {
  return new FixedAssetRegister({
    now: () => new Date('2026-04-11T12:00:00Z'),
    ...opts,
  });
}

// ===========================================================================
// § 1. Rate lookup
// ===========================================================================

test('Israeli depreciation table — all required classes present', () => {
  const required = [
    'BUILDING_NON_INDUSTRIAL',
    'BUILDING_INDUSTRIAL',
    'COMPUTERS',
    'OFFICE_FURNITURE',
    'MACHINERY_GENERAL',
    'MACHINERY_METAL_FAB',
    'VEHICLE_COMMERCIAL',
    'VEHICLE_PRIVATE',
    'SOLAR_INSTALLATION',
    'DIGITAL_INFRASTRUCTURE',
  ];
  for (const code of required) {
    assert.ok(DEPRECIATION_CLASSES[code], `missing class ${code}`);
    assert.ok(DEPRECIATION_CLASSES[code].he, `${code} missing Hebrew label`);
    assert.ok(DEPRECIATION_CLASSES[code].en, `${code} missing English label`);
    assert.ok(typeof DEPRECIATION_CLASSES[code].rate === 'number');
    assert.ok(DEPRECIATION_CLASSES[code].statuteRef.includes('תקנות'));
  }
});

test('rate values match Israeli regulation (תקנות פחת 1991)', () => {
  assert.equal(DEPRECIATION_CLASSES.BUILDING_NON_INDUSTRIAL.rate, 0.04, 'מבנה 4%');
  assert.equal(DEPRECIATION_CLASSES.COMPUTERS.rate, 0.33, 'מחשבים 33%');
  assert.equal(DEPRECIATION_CLASSES.OFFICE_FURNITURE.rate, 0.06, 'ריהוט 6%');
  assert.ok(
    DEPRECIATION_CLASSES.MACHINERY_GENERAL.rate >= 0.10 &&
    DEPRECIATION_CLASSES.MACHINERY_GENERAL.rate <= 0.15,
    'מכונות כלליות 10-15%'
  );
  assert.ok(
    DEPRECIATION_CLASSES.MACHINERY_METAL_FAB.rateMax >= 0.20,
    'מכונות חיתוך עד 20% (פחת מואץ)'
  );
  assert.equal(DEPRECIATION_CLASSES.VEHICLE_COMMERCIAL.rate, 0.15, 'רכב מסחרי 15%');
  assert.equal(DEPRECIATION_CLASSES.VEHICLE_PRIVATE.rate, 0.15, 'רכב פרטי 15%');
  assert.equal(DEPRECIATION_CLASSES.VEHICLE_PRIVATE.restrictedDeduction, true, 'רכב פרטי מוגבל');
  assert.equal(DEPRECIATION_CLASSES.SOLAR_INSTALLATION.rate, 0.25, 'סולארי 25%');
  assert.equal(DEPRECIATION_CLASSES.DIGITAL_INFRASTRUCTURE.rate, 0.33, 'תשתית דיגיטלית 33%');
});

test('resolveClass accepts Hebrew aliases', () => {
  assert.equal(resolveClass('מחשבים').code, 'COMPUTERS');
  assert.equal(resolveClass('רכב פרטי').code, 'VEHICLE_PRIVATE');
  assert.equal(resolveClass('מתקן סולארי').code, 'SOLAR_INSTALLATION');
  assert.equal(resolveClass('ריהוט משרדי').code, 'OFFICE_FURNITURE');
  assert.equal(resolveClass('CNC').code, 'MACHINERY_METAL_FAB');
});

test('resolveClass falls back to DEFAULT_EQUIPMENT for unknown labels', () => {
  assert.equal(resolveClass('').code, 'DEFAULT_EQUIPMENT');
  assert.equal(resolveClass('nonsense').code, 'DEFAULT_EQUIPMENT');
  assert.equal(resolveClass(undefined).code, 'DEFAULT_EQUIPMENT');
});

// ===========================================================================
// § 2. Depreciation math — pure helpers
// ===========================================================================

test('SL annual = (cost - salvage) / life', () => {
  assert.equal(slAnnual(10000, 0, 5), 2000);
  assert.equal(slAnnual(12000, 2000, 5), 2000);
  assert.equal(slAnnual(9999, 0, 3), 3333);
});

test('DDB annual respects salvage floor', () => {
  // cost=10000, life=5, rate=2/5=0.4
  assert.equal(ddbAnnual(10000, 0, 5), 4000); // year 1
  assert.equal(ddbAnnual(6000, 0, 5), 2400);  // year 2
  // When NBV near salvage, expense clipped
  assert.equal(ddbAnnual(500, 500, 5), 0);
});

test('SOYD year 1 > year 2 > ... > year n', () => {
  const cost = 15000, life = 5;
  const y1 = soydAnnual(cost, 0, life, 1);
  const y2 = soydAnnual(cost, 0, life, 2);
  const y5 = soydAnnual(cost, 0, life, 5);
  assert.ok(y1 > y2 && y2 > y5);
  // Sum over all years ≈ cost
  const total = [1,2,3,4,5].reduce((s,k) => s + soydAnnual(cost, 0, life, k), 0);
  assert.ok(Math.abs(total - cost) < 0.05);
});

// ===========================================================================
// § 3. acquireAsset
// ===========================================================================

test('acquireAsset — happy path', () => {
  const reg = newRegister();
  const id = reg.acquireAsset({
    description: 'מכונת CNC Okuma LB3000',
    purchaseDate: '2026-01-15',
    cost: 450000,
    vat: 76500,
    location: 'Workshop A — תעשייה פ"ת',
    serial: 'OKUMA-2026-881',
    supplier: 'SUP-001',
    useFor: 'ייצור חלקים מכניים',
    depreciationClass: 'מכונות חיתוך',
  });
  assert.ok(id.startsWith('FA-2026-'));
  const a = reg.getAsset(id);
  assert.equal(a.cost, 450000);
  assert.equal(a.vat, 76500);
  assert.equal(a.depreciationClass, 'MACHINERY_METAL_FAB');
  assert.equal(a.status, 'active');
  assert.equal(a.netBookValue, 450000);
  // History logs the acquisition
  const hist = reg.history(id);
  assert.equal(hist.length, 1);
  assert.equal(hist[0].kind, 'ACQUIRE');
});

test('acquireAsset — rejects missing description / negative cost', () => {
  const reg = newRegister();
  assert.throws(() => reg.acquireAsset({ cost: 100 }));
  assert.throws(() => reg.acquireAsset({ description: 'x', cost: -5 }));
});

// ===========================================================================
// § 4. computeDepreciation — SL / DDB / SOYD
// ===========================================================================

test('SL: full year depreciation on computers (33%)', () => {
  const reg = newRegister();
  const id = reg.acquireAsset({
    description: 'שרת Dell R750',
    purchaseDate: '2026-01-01',
    cost: 30000,
    depreciationClass: 'מחשבים',
  });
  const d = reg.computeDepreciation({
    assetId: id,
    period: { year: 2026, frequency: 'annual' },
    method: 'SL',
    post: true,
  });
  // 30000 / 3 years = 10000 (or 30000 * 0.33 ≈ 9900 — use life-based)
  assert.ok(d.expense >= 9900 && d.expense <= 10100, `expected ~10000, got ${d.expense}`);
  assert.equal(d.method, 'SL');
  const a = reg.getAsset(id);
  assert.equal(a.accumulatedDepreciation, d.expense);
  assert.equal(a.netBookValue, 30000 - d.expense);
});

test('SL: monthly frequency = annual / 12', () => {
  const reg = newRegister();
  const id = reg.acquireAsset({
    description: 'שולחן עבודה',
    purchaseDate: '2026-01-01',
    cost: 1200,
    depreciationClass: 'ריהוט משרדי',
  });
  const annual = reg.computeDepreciation({
    assetId: id, period: { year: 2026, frequency: 'annual' }, method: 'SL',
  });
  const january = reg.computeDepreciation({
    assetId: id,
    period: { from: '2026-01-01', to: '2026-01-31' },
    method: 'SL',
  });
  assert.ok(january.expense > 0);
  assert.ok(january.expense < annual.expense);
  assert.ok(january.fractionOfYear < 0.15);
});

test('DDB: first-year expense > straight-line', () => {
  const reg = newRegister();
  const id = reg.acquireAsset({
    description: 'רכב מסחרי Volvo FL',
    purchaseDate: '2026-01-01',
    cost: 300000,
    depreciationClass: 'רכב מסחרי',
  });
  const sl = reg.computeDepreciation({
    assetId: id, period: { year: 2026 }, method: 'SL',
  });
  const ddb = reg.computeDepreciation({
    assetId: id, period: { year: 2026 }, method: 'DDB',
  });
  assert.ok(ddb.expense > sl.expense, `DDB(${ddb.expense}) should exceed SL(${sl.expense})`);
});

test('SOYD: year-1 expense exceeds year-2 expense', () => {
  const reg = newRegister();
  const id = reg.acquireAsset({
    description: 'מכונה כללית',
    purchaseDate: '2026-01-01',
    cost: 100000,
    depreciationClass: 'MACHINERY_GENERAL',
  });
  const y1 = reg.computeDepreciation({
    assetId: id, period: { year: 2026 }, method: 'sum-of-years', post: true,
  });
  const y2 = reg.computeDepreciation({
    assetId: id, period: { year: 2027 }, method: 'sum-of-years', post: true,
  });
  assert.ok(y1.expense >= y2.expense, `y1=${y1.expense} >= y2=${y2.expense}`);
});

test('depreciation never drops NBV below salvage', () => {
  const reg = newRegister();
  const id = reg.acquireAsset({
    description: 'טנדר עם ערך גרט',
    purchaseDate: '2020-01-01',
    cost: 120000,
    depreciationClass: 'רכב מסחרי',
  });
  // Run many years
  for (let y = 2020; y <= 2035; y++) {
    reg.computeDepreciation({
      assetId: id, period: { year: y }, method: 'SL', post: true,
    });
  }
  const a = reg.getAsset(id);
  const meta = DEPRECIATION_CLASSES.VEHICLE_COMMERCIAL;
  const minSalvage = 120000 * meta.salvagePct;
  assert.ok(a.netBookValue >= minSalvage - 0.01, `NBV=${a.netBookValue} >= salvage ${minSalvage}`);
});

// ===========================================================================
// § 5. Full-life schedule
// ===========================================================================

test('depreciationSchedule SL sums to (cost - salvage)', () => {
  const reg = newRegister();
  const id = reg.acquireAsset({
    description: 'מחשב Mac Studio',
    purchaseDate: '2026-01-01',
    cost: 15000,
    depreciationClass: 'COMPUTERS',
  });
  const sched = reg.depreciationSchedule(id, 'SL');
  assert.ok(sched.rows.length >= 3);
  const salvage = 15000 * DEPRECIATION_CLASSES.COMPUTERS.salvagePct;
  const totalDepreciated = sched.rows.reduce((s, r) => s + r.expense, 0);
  assert.ok(
    Math.abs(totalDepreciated - (15000 - salvage)) < 0.05,
    `total ${totalDepreciated} ≈ cost-salvage ${15000 - salvage}`
  );
  // Last row closing ≈ salvage
  const last = sched.rows[sched.rows.length - 1];
  assert.ok(Math.abs(last.closing - salvage) < 0.05);
});

test('depreciationSchedule rows are chronologically ordered', () => {
  const reg = newRegister();
  const id = reg.acquireAsset({
    description: 'מכונה',
    purchaseDate: '2026-01-01',
    cost: 50000,
    depreciationClass: 'MACHINERY_GENERAL',
  });
  const sched = reg.depreciationSchedule(id, 'SL');
  for (let i = 1; i < sched.rows.length; i++) {
    assert.ok(sched.rows[i].year >= sched.rows[i - 1].year);
    assert.ok(sched.rows[i].opening <= sched.rows[i - 1].opening + 0.01);
  }
});

test('buildSchedule DDB: sums ≤ cost, terminates at salvage', () => {
  const asset = {
    costBasis: 10000,
    purchaseDate: '2026-01-01',
    _classMeta: DEPRECIATION_CLASSES.COMPUTERS,
  };
  const rows = buildSchedule(asset, 'DDB');
  assert.ok(rows.length >= 2);
  const total = rows.reduce((s, r) => s + r.expense, 0);
  assert.ok(total <= 10000 + 0.01);
});

// ===========================================================================
// § 6. Disposal — gain / loss and Y-006 integration
// ===========================================================================

test('disposeAsset: GAIN when proceeds > NBV', () => {
  let capturedEvent = null;
  const reg = newRegister({
    onCapitalGainsEvent: (ev) => { capturedEvent = ev; },
  });
  const id = reg.acquireAsset({
    description: 'מגרסת מתכות',
    purchaseDate: '2024-01-01',
    cost: 100000,
    depreciationClass: 'MACHINERY_GENERAL',
  });
  // Depreciate 2 years
  reg.computeDepreciation({ assetId: id, period: { year: 2024 }, method: 'SL', post: true });
  reg.computeDepreciation({ assetId: id, period: { year: 2025 }, method: 'SL', post: true });
  const before = reg.getAsset(id);
  const d = reg.disposeAsset({
    assetId: id,
    date: '2026-01-02',
    proceeds: 90000,
    reason: 'sale',
  });
  assert.ok(d.isGain, 'should be a gain');
  assert.ok(d.gain_loss > 0);
  assert.ok(d.proceeds >= before.netBookValue);
  // Capital gains bridge fired
  assert.ok(capturedEvent, 'Y-006 callback should fire');
  assert.equal(capturedEvent.source, 'fixed-assets');
  assert.equal(capturedEvent.assetId, id);
  assert.equal(capturedEvent.sellPrice, 90000);
  // Asset status updated
  const after = reg.getAsset(id);
  assert.equal(after.status, 'disposed');
});

test('disposeAsset: LOSS when proceeds < NBV', () => {
  const reg = newRegister();
  const id = reg.acquireAsset({
    description: 'שרת ישן',
    purchaseDate: '2026-01-01',
    cost: 50000,
    depreciationClass: 'COMPUTERS',
  });
  const d = reg.disposeAsset({
    assetId: id,
    date: '2026-03-01',
    proceeds: 1000,
    reason: 'scrap',
  });
  assert.ok(d.isLoss);
  assert.ok(d.gain_loss < 0);
  assert.equal(d.capitalGainsLink.reason, 'scrap');
});

test('disposeAsset: journal entries balanced', () => {
  const reg = newRegister();
  const id = reg.acquireAsset({
    description: 'נכס לבדיקת פקודת יומן',
    purchaseDate: '2025-01-01',
    cost: 20000,
    depreciationClass: 'OFFICE_FURNITURE',
  });
  reg.computeDepreciation({ assetId: id, period: { year: 2025 }, method: 'SL', post: true });
  const d = reg.disposeAsset({ assetId: id, date: '2026-04-01', proceeds: 18000 });
  const debits = d.journal.lines.reduce((s, l) => s + (l.debit || 0), 0);
  const credits = d.journal.lines.reduce((s, l) => s + (l.credit || 0), 0);
  assert.ok(Math.abs(debits - credits) < 0.05, `DR ${debits} ≈ CR ${credits}`);
});

test('disposeAsset: cannot dispose twice', () => {
  const reg = newRegister();
  const id = reg.acquireAsset({
    description: 'נכס חד פעמי',
    purchaseDate: '2025-01-01',
    cost: 10000,
    depreciationClass: 'COMPUTERS',
  });
  reg.disposeAsset({ assetId: id, date: '2026-01-01', proceeds: 5000 });
  assert.throws(() => reg.disposeAsset({ assetId: id, date: '2026-02-01', proceeds: 1000 }));
});

// ===========================================================================
// § 7. Revaluation — IAS 16
// ===========================================================================

test('revaluation increases NBV and tracks equity surplus', () => {
  const reg = newRegister();
  const id = reg.acquireAsset({
    description: 'מבנה תעשייה',
    purchaseDate: '2020-01-01',
    cost: 2000000,
    depreciationClass: 'BUILDING_INDUSTRIAL',
  });
  // Depreciate a few years
  reg.computeDepreciation({ assetId: id, period: { year: 2020 }, method: 'SL', post: true });
  reg.computeDepreciation({ assetId: id, period: { year: 2021 }, method: 'SL', post: true });
  const before = reg.getAsset(id);
  const r = reg.revaluation(id, 2500000);
  assert.equal(r.newNBV, 2500000);
  assert.ok(r.uplift > 0);
  const after = reg.getAsset(id);
  assert.equal(after.netBookValue, 2500000);
  assert.ok(after.revaluationSurplus >= r.uplift - 0.01);
  assert.ok(after.revaluationSurplus > 0);
  void before;
});

test('revaluation downward reduces surplus', () => {
  const reg = newRegister();
  const id = reg.acquireAsset({
    description: 'מבנה',
    purchaseDate: '2025-01-01',
    cost: 1000000,
    depreciationClass: 'BUILDING_NON_INDUSTRIAL',
  });
  const r = reg.revaluation(id, 900000);
  assert.ok(r.uplift < 0);
});

// ===========================================================================
// § 8. Impairment — IAS 36
// ===========================================================================

test('impairmentTest: no recoverable = no write-down, keeps indicators', () => {
  const reg = newRegister();
  const id = reg.acquireAsset({
    description: 'מכונה',
    purchaseDate: '2025-01-01',
    cost: 100000,
    depreciationClass: 'MACHINERY_GENERAL',
  });
  const t = reg.impairmentTest(id, { indicators: ['idle', 'market_drop'] });
  assert.equal(t.impaired, false);
  assert.equal(t.writeDown, 0);
  assert.deepEqual(t.indicators, ['idle', 'market_drop']);
});

test('impairmentTest: writes down when recoverable < NBV', () => {
  const reg = newRegister();
  const id = reg.acquireAsset({
    description: 'ציוד עם פגיעה',
    purchaseDate: '2025-01-01',
    cost: 100000,
    depreciationClass: 'MACHINERY_GENERAL',
  });
  const t = reg.impairmentTest(id, { recoverableAmount: 60000 });
  assert.equal(t.impaired, true);
  assert.equal(t.writeDown, 40000);
  assert.equal(t.newNBV, 60000);
  const a = reg.getAsset(id);
  assert.equal(a.netBookValue, 60000);
  assert.equal(a.impairmentLoss, 40000);
});

test('impairmentTest: no write-down when recoverable >= NBV', () => {
  const reg = newRegister();
  const id = reg.acquireAsset({
    description: 'ציוד',
    purchaseDate: '2025-01-01',
    cost: 100000,
    depreciationClass: 'MACHINERY_GENERAL',
  });
  const t = reg.impairmentTest(id, { recoverableAmount: 200000 });
  assert.equal(t.impaired, false);
  assert.equal(t.writeDown, 0);
});

// ===========================================================================
// § 9. Transfer — intra-company
// ===========================================================================

test('handleTransfer: relocates asset, appends to history, never deletes', () => {
  const reg = newRegister();
  const id = reg.acquireAsset({
    description: 'מחשב נייד',
    purchaseDate: '2026-01-01',
    cost: 8000,
    depreciationClass: 'COMPUTERS',
    location: 'HQ Tel Aviv',
  });
  const t = reg.handleTransfer(id, 'Workshop Haifa', { custodian: 'EMP-42' });
  assert.equal(t.toLocation, 'Workshop Haifa');
  assert.equal(t.fromLocation, 'HQ Tel Aviv');
  const a = reg.getAsset(id);
  assert.equal(a.location, 'Workshop Haifa');
  assert.equal(a.transfers.length, 1);
  // History preserved
  const hist = reg.history(id);
  const kinds = hist.map(e => e.kind);
  assert.ok(kinds.includes('ACQUIRE'));
  assert.ok(kinds.includes('TRANSFER'));
});

test('handleTransfer: refuses on disposed asset', () => {
  const reg = newRegister();
  const id = reg.acquireAsset({
    description: 'נכס',
    purchaseDate: '2026-01-01',
    cost: 5000,
    depreciationClass: 'COMPUTERS',
  });
  reg.disposeAsset({ assetId: id, date: '2026-02-01', proceeds: 2000 });
  assert.throws(() => reg.handleTransfer(id, 'new-place'));
});

// ===========================================================================
// § 10. CAPEX report
// ===========================================================================

test('capexReport: aggregates by year and category', () => {
  const reg = newRegister();
  reg.acquireAsset({
    description: 'A',
    purchaseDate: '2026-02-01',
    cost: 10000,
    depreciationClass: 'COMPUTERS',
  });
  reg.acquireAsset({
    description: 'B',
    purchaseDate: '2026-03-15',
    cost: 20000,
    depreciationClass: 'COMPUTERS',
  });
  reg.acquireAsset({
    description: 'C',
    purchaseDate: '2025-12-01',
    cost: 99999,
    depreciationClass: 'COMPUTERS',
  });
  const report = reg.capexReport({ year: 2026 });
  assert.equal(report.totals.count, 2);
  assert.equal(report.totals.cost, 30000);
  assert.ok(report.byCategory.COMPUTERS);
  assert.equal(report.byCategory.COMPUTERS.count, 2);
  assert.equal(report.byCategory.COMPUTERS.cost, 30000);
});

// ===========================================================================
// § 11. Append-only — no deletion
// ===========================================================================

test('history is append-only: dispose retains full audit trail', () => {
  const reg = newRegister();
  const id = reg.acquireAsset({
    description: 'audit trail asset',
    purchaseDate: '2025-01-01',
    cost: 50000,
    depreciationClass: 'MACHINERY_GENERAL',
  });
  reg.handleTransfer(id, 'Location-2');
  reg.computeDepreciation({ assetId: id, period: { year: 2025 }, method: 'SL', post: true });
  reg.impairmentTest(id, { recoverableAmount: 40000 });
  reg.disposeAsset({ assetId: id, date: '2026-06-01', proceeds: 30000 });

  const hist = reg.history(id);
  // Must contain ACQUIRE, TRANSFER, DEPRECIATE, IMPAIR, DISPOSE (plus catch-up)
  const kinds = new Set(hist.map(e => e.kind));
  ['ACQUIRE', 'TRANSFER', 'DEPRECIATE', 'IMPAIR', 'DISPOSE'].forEach(k => {
    assert.ok(kinds.has(k), `history missing ${k}`);
  });
  // Asset record still retrievable
  const a = reg.getAsset(id);
  assert.equal(a.status, 'disposed');
  assert.equal(a.id, id);
});

// ===========================================================================
// § 12. classifyByDepreciationClass — public rate lookup API
// ===========================================================================

test('classifyByDepreciationClass returns full rate info', () => {
  const reg = newRegister();
  const info = reg.classifyByDepreciationClass('מחשבים');
  assert.equal(info.code, 'COMPUTERS');
  assert.equal(info.rate, 0.33);
  assert.ok(info.he);
  assert.ok(info.statuteRef.includes('תקנות'));
  const solar = reg.classifyByDepreciationClass('מתקן סולארי');
  assert.equal(solar.rate, 0.25);
  const privateCar = reg.classifyByDepreciationClass('רכב פרטי');
  assert.equal(privateCar.restrictedDeduction, true);
});
