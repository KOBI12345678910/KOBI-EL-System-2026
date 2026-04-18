/**
 * Consolidation Engine — Unit Tests
 * Agent X-42 • Techno-Kol Uzi • Swarm 3C
 *
 * Run with:   node --test test/payroll/consolidator.test.js
 * or:         node test/run.js
 *
 * Requires Node >= 18 for node:test.
 *
 * 16+ scenarios covering:
 *   - Group definition + ownership → method resolution
 *   - CoA mapping (shorthand + verbose)
 *   - Currency translation (IAS 21) & CTA calculation
 *   - Full consolidation with goodwill + NCI
 *   - IC AR/AP elimination
 *   - IC Sales/COGS elimination with unrealized profit
 *   - IC interest elimination
 *   - IC management fees elimination
 *   - Investment ↔ equity elimination + goodwill
 *   - Equity method (20%–50%)
 *   - Cost method (<20%)
 *   - FV uplifts at acquisition
 *   - Prior-year comparative
 *   - Audit package working papers
 *   - Verify equality (happy + error delta)
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const cons = require(path.resolve(
  __dirname, '..', '..', 'src', 'consolidation', 'consolidator.js'
));

const {
  defineGroup,
  mapAccounts,
  loadTrialBalance,
  addIntercompany,
  translate,
  consolidate,
  verifyEquality,
  prioryearComparative,
  auditPackage,
  CONSOLIDATION_METHOD,
  ACCOUNT_CLASS,
  ELIMINATION_TYPE,
  LABELS,
  _internals,
} = cons;

// ─────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────

function parentP(overrides) {
  return { id: 'parent', name: 'Techno-Kol', currency: 'ILS', ...overrides };
}

function subA(overrides) {
  return {
    id: 'subA',
    name: 'Sub Alpha',
    currency: 'ILS',
    ownership: 1.0,
    acquisitionDate: '2024-01-01',
    costOfInvestment: 1000,
    netAssetsAtAcquisition: 800,
    ...overrides,
  };
}

function subB(overrides) {
  return {
    id: 'subB',
    name: 'Sub Beta',
    currency: 'USD',
    ownership: 0.80,
    acquisitionDate: '2023-06-01',
    costOfInvestment: 3200, // ILS
    netAssetsAtAcquisition: 3500, // ILS (1000 USD × 3.5 historical)
    ...overrides,
  };
}

function balancedParentTB() {
  return [
    { code: '1000', class: 'A', debit: 5000, credit: 0, balance: 5000, label_he: 'מזומן', label_en: 'Cash' },
    { code: '1800', class: 'A', debit: 1000, credit: 0, balance: 1000, label_he: 'השקעה בבת', label_en: 'Investment in sub' },
    { code: '2000', class: 'L', debit: 0, credit: 2000, balance: 2000, label_he: 'זכאים', label_en: 'Payables' },
    { code: '3000', class: 'E', debit: 0, credit: 3000, balance: 3000, label_he: 'הון מניות', label_en: 'Share capital' },
    { code: '4000', class: 'R', debit: 0, credit: 3000, balance: 3000, label_he: 'הכנסות', label_en: 'Revenue' },
    { code: '5000', class: 'X', debit: 2000, credit: 0, balance: 2000, label_he: 'הוצאות', label_en: 'Expenses' },
  ];
}

function balancedSubTB() {
  return [
    { code: '1000', class: 'A', debit: 2000, credit: 0, balance: 2000 },
    { code: '2000', class: 'L', debit: 0, credit: 500, balance: 500 },
    { code: '3000', class: 'E', debit: 0, credit: 800, balance: 800 },
    { code: '4000', class: 'R', debit: 0, credit: 2000, balance: 2000 },
    { code: '5000', class: 'X', debit: 1300, credit: 0, balance: 1300 },
  ];
}

// ═════════════════════════════════════════════════════════════════════
// 1. Group definition + ownership-based method resolution
// ═════════════════════════════════════════════════════════════════════

test('defineGroup — parent + 2 subs, resolves methods by ownership', () => {
  const g = defineGroup(parentP(), [
    subA({ ownership: 1.00 }),     // full
    subB({ ownership: 0.30 }),     // equity
    { id: 'subC', currency: 'ILS', ownership: 0.05, costOfInvestment: 50 }, // cost
  ]);
  assert.equal(g.parent.id, 'parent');
  assert.equal(g.parent.currency, 'ILS');
  assert.equal(g.subs.length, 3);
  assert.equal(g.subs[0].method, CONSOLIDATION_METHOD.FULL);
  assert.equal(g.subs[1].method, CONSOLIDATION_METHOD.EQUITY);
  assert.equal(g.subs[2].method, CONSOLIDATION_METHOD.COST);
  // goodwill captured at acquisition
  assert.ok(g.acquisition['subA']);
  assert.equal(
    g.acquisition['subA'].goodwillAtAcquisition,
    _internals.round2(1000 - 1.0 * 800),
  );
});

test('defineGroup — rejects parent without id', () => {
  assert.throws(() => defineGroup(null, []), /parent with id is required/);
  assert.throws(() => defineGroup({}, []), /parent with id is required/);
});

// ═════════════════════════════════════════════════════════════════════
// 2. CoA mapping
// ═════════════════════════════════════════════════════════════════════

test('mapAccounts — shorthand string and verbose object both work', () => {
  const g = defineGroup(parentP(), [subA()]);
  mapAccounts(g, 'subA', {
    '1000-A': '1000',
    '2000-A': { code: '2000', label_he: 'זכאים', label_en: 'Payables', class: 'L' },
  });
  assert.equal(g.mappings.subA['1000-A'].code, '1000');
  assert.equal(g.mappings.subA['2000-A'].label_he, 'זכאים');
  assert.equal(g.mappings.subA['2000-A'].class, 'L');
});

test('mapAccounts — rejects unknown entity', () => {
  const g = defineGroup(parentP(), [subA()]);
  assert.throws(() => mapAccounts(g, 'ghost', { a: 'b' }), /unknown entity/);
});

test('loadTrialBalance — applies mapping to rename local code to group code', () => {
  const g = defineGroup(parentP(), [subA()]);
  mapAccounts(g, 'subA', { '1000-A': '1000' });
  const rows = loadTrialBalance(g, 'subA', [
    { code: '1000-A', class: 'A', balance: 1500 },
  ]);
  assert.equal(rows[0].localCode, '1000-A');
  assert.equal(rows[0].groupCode, '1000');
  assert.equal(rows[0].balance, 1500);
});

// ═════════════════════════════════════════════════════════════════════
// 3. Currency translation (IAS 21)
// ═════════════════════════════════════════════════════════════════════

test('translate — same currency is a pass-through', () => {
  const tb = [{ code: '1000', class: 'A', debit: 100, credit: 0, balance: 100 }];
  const out = translate(tb, 'ILS', 'ILS', { closing: 3.7, average: 3.6 });
  assert.equal(out.ctaDifference, 0);
  assert.equal(out.rows[0].balance, 100);
});

test('translate — BS at closing, IS at average, equity at historical', () => {
  const tb = [
    { code: '1000', class: 'A', debit: 1000, credit: 0, balance: 1000 },
    { code: '2000', class: 'L', debit: 0, credit: 400, balance: 400 },
    { code: '3000', class: 'E', debit: 0, credit: 500, balance: 500, historicalRate: 3.5 },
    { code: '4000', class: 'R', debit: 0, credit: 300, balance: 300 },
    { code: '5000', class: 'X', debit: 200, credit: 0, balance: 200 },
  ];
  const out = translate(tb, 'USD', 'ILS', {
    closing: 3.7, average: 3.6, historical: 3.5,
  });
  const byCode = {};
  out.rows.forEach((r) => (byCode[r.groupCode || r.code] = r));
  assert.equal(byCode['1000'].balance, 3700); // 1000 × 3.7
  assert.equal(byCode['2000'].balance, 1480); // 400 × 3.7
  assert.equal(byCode['3000'].balance, 1750); // 500 × 3.5
  assert.equal(byCode['4000'].balance, 1080); // 300 × 3.6
  assert.equal(byCode['5000'].balance, 720);  // 200 × 3.6
  // CTA = BS debits − BS credits − NI
  //     = 3700 − (1480 + 1750) − (1080 − 720) = 110
  assert.equal(out.ctaDifference, 110);
});

test('translate — rejects non-positive rates', () => {
  const tb = [{ code: '1000', class: 'A', balance: 1 }];
  assert.throws(() => translate(tb, 'USD', 'ILS', { closing: 0, average: 3.6 }),
    /closing and average rates must be positive/);
});

// ═════════════════════════════════════════════════════════════════════
// 4. Full consolidation happy path (2-entity, same currency)
// ═════════════════════════════════════════════════════════════════════

test('consolidate — 2-entity group, same currency, no IC, balances', () => {
  const g = defineGroup(parentP(), [subA()]);
  loadTrialBalance(g, 'parent', balancedParentTB(), 'ILS');
  loadTrialBalance(g, 'subA', balancedSubTB(), 'ILS');
  const pack = consolidate(g, { period: '2026-Q1' });

  // goodwill = 1000 − 1.0 × 800 = 200
  assert.equal(pack.goodwill.total, 200);
  assert.equal(pack.NCI.total, 0);

  const v = verifyEquality(pack.consolidatedTB);
  assert.equal(v.balanced, true);

  // parent cash 5000 + sub cash 2000 + goodwill 200 = 7200
  // investment 1000 eliminated
  const assets = pack.consolidatedTB
    .filter((r) => r.class === ACCOUNT_CLASS.ASSET)
    .reduce((s, r) => s + r.balance, 0);
  assert.equal(_internals.round2(assets), 7200);
});

// ═════════════════════════════════════════════════════════════════════
// 5. IC AR/AP elimination
// ═════════════════════════════════════════════════════════════════════

test('consolidate — IC AR/AP fully offsets', () => {
  const g = defineGroup(parentP(), [subA()]);
  const ptb = balancedParentTB().concat([
    { code: '1150', class: 'A', debit: 600, credit: 0, balance: 600, label_he: LABELS.ar_ic.he },
  ]);
  // keep parent balanced: reduce cash 5000→4400 to fund the IC AR line
  ptb.find((r) => r.code === '1000').balance = 4400;
  ptb.find((r) => r.code === '1000').debit = 4400;

  const stb = balancedSubTB().concat([
    { code: '2150', class: 'L', debit: 0, credit: 600, balance: 600, label_he: LABELS.ap_ic.he },
  ]);
  stb.find((r) => r.code === '3000').balance = 200;
  stb.find((r) => r.code === '3000').credit = 200;

  loadTrialBalance(g, 'parent', ptb, 'ILS');
  loadTrialBalance(g, 'subA', stb, 'ILS');
  addIntercompany(g, [
    { type: 'AR_AP', from: 'parent', to: 'subA', amount: 600,
      arAccount: '1150', apAccount: '2150' },
  ]);
  const pack = consolidate(g, { period: '2026-Q1' });

  const arRow = pack.consolidatedTB.find((r) => r.groupCode === '1150');
  const apRow = pack.consolidatedTB.find((r) => r.groupCode === '2150');
  assert.equal(arRow.balance, 0);
  assert.equal(apRow.balance, 0);

  assert.equal(verifyEquality(pack.consolidatedTB).balanced, true);
  assert.ok(
    pack.eliminations.some((e) => e.type === ELIMINATION_TYPE.IC_AR_AP),
    'IC_AR_AP elimination must be present',
  );
});

// ═════════════════════════════════════════════════════════════════════
// 6. IC Sales/COGS with unrealized profit in ending inventory
// ═════════════════════════════════════════════════════════════════════

test('consolidate — IC Sales/COGS offsets + unrealized profit reduces inventory', () => {
  const g = defineGroup(parentP(), [
    subA({ costOfInvestment: 500, netAssetsAtAcquisition: 500 }),
  ]);
  loadTrialBalance(g, 'parent', [
    { code: '1000', class: 'A', balance: 5000 },
    { code: '1300', class: 'A', balance: 2000 },
    { code: '1800', class: 'A', balance: 500 },
    { code: '2000', class: 'L', balance: 3000 },
    { code: '3000', class: 'E', balance: 2500 },
    { code: '4100', class: 'R', balance: 5000 },
    { code: '5100', class: 'X', balance: 3000 },
  ], 'ILS');
  loadTrialBalance(g, 'subA', [
    { code: '1000', class: 'A', balance: 1500 },
    { code: '1300', class: 'A', balance: 1200 },
    { code: '2000', class: 'L', balance: 1000 },
    { code: '3000', class: 'E', balance: 500 },
    { code: '4000', class: 'R', balance: 2500 },
    { code: '5000', class: 'X', balance: 1300 },
  ], 'ILS');
  addIntercompany(g, [
    {
      type: 'SALES_COGS', from: 'parent', to: 'subA',
      amount: 800, margin: 0.25, stillInEndingInventory: 400,
      salesAccount: '4100', cogsAccount: '5100', inventoryAccount: '1300',
    },
  ]);
  const pack = consolidate(g, { period: '2026-Q1' });

  // revenue IC elim = 800
  const rev = pack.consolidatedTB.find((r) => r.groupCode === '4100');
  assert.equal(rev.balance, 5000 - 800);
  // unrealized profit = 400 × 0.25 = 100 → inventory 3200 − 100 = 3100
  const inv = pack.consolidatedTB.find((r) => r.groupCode === '1300');
  assert.equal(inv.balance, 3100);
  assert.equal(verifyEquality(pack.consolidatedTB).balanced, true);
});

// ═════════════════════════════════════════════════════════════════════
// 7. IC interest elimination
// ═════════════════════════════════════════════════════════════════════

test('consolidate — IC interest income/expense offsets', () => {
  const g = defineGroup(parentP(), [subA({ costOfInvestment: 500, netAssetsAtAcquisition: 500 })]);
  loadTrialBalance(g, 'parent', [
    { code: '1000', class: 'A', balance: 5000 },
    { code: '1800', class: 'A', balance: 500 },
    { code: '3000', class: 'E', balance: 5500 },
    { code: '4500', class: 'R', balance: 120 },
    { code: '4000', class: 'R', balance: 1000 },
    { code: '5000', class: 'X', balance: 1120 },
  ], 'ILS');
  loadTrialBalance(g, 'subA', [
    { code: '1000', class: 'A', balance: 1500 },
    { code: '3000', class: 'E', balance: 500 },
    { code: '5500', class: 'X', balance: 120 },
    { code: '4000', class: 'R', balance: 1120 },
  ], 'ILS');
  addIntercompany(g, [
    { type: 'INTEREST', from: 'parent', to: 'subA', amount: 120 },
  ]);
  const pack = consolidate(g, { period: '2026-Q1' });
  const ii = pack.consolidatedTB.find((r) => r.groupCode === '4500');
  const ie = pack.consolidatedTB.find((r) => r.groupCode === '5500');
  assert.equal(ii.balance, 0);
  assert.equal(ie.balance, 0);
  assert.equal(verifyEquality(pack.consolidatedTB).balanced, true);
});

// ═════════════════════════════════════════════════════════════════════
// 8. IC management fees elimination
// ═════════════════════════════════════════════════════════════════════

test('consolidate — IC management fees offset', () => {
  const g = defineGroup(parentP(), [subA({ costOfInvestment: 500, netAssetsAtAcquisition: 500 })]);
  loadTrialBalance(g, 'parent', [
    { code: '1000', class: 'A', balance: 5000 },
    { code: '1800', class: 'A', balance: 500 },
    { code: '3000', class: 'E', balance: 5500 },
    { code: '4600', class: 'R', balance: 200 },
    { code: '4000', class: 'R', balance: 1000 },
    { code: '5000', class: 'X', balance: 1200 },
  ], 'ILS');
  loadTrialBalance(g, 'subA', [
    { code: '1000', class: 'A', balance: 1500 },
    { code: '3000', class: 'E', balance: 500 },
    { code: '5600', class: 'X', balance: 200 },
    { code: '4000', class: 'R', balance: 1200 },
  ], 'ILS');
  addIntercompany(g, [
    { type: 'MGMT_FEE', from: 'parent', to: 'subA', amount: 200 },
  ]);
  const pack = consolidate(g, { period: '2026-Q1' });
  assert.equal(pack.consolidatedTB.find((r) => r.groupCode === '4600').balance, 0);
  assert.equal(pack.consolidatedTB.find((r) => r.groupCode === '5600').balance, 0);
  assert.equal(verifyEquality(pack.consolidatedTB).balanced, true);
});

// ═════════════════════════════════════════════════════════════════════
// 9. Investment ↔ equity elimination + goodwill recognition
// ═════════════════════════════════════════════════════════════════════

test('consolidate — investment eliminated against sub equity, goodwill recognized', () => {
  const g = defineGroup(parentP(), [
    subA({ costOfInvestment: 1200, netAssetsAtAcquisition: 900 }),
  ]);
  loadTrialBalance(g, 'parent', [
    { code: '1000', class: 'A', balance: 3000 },
    { code: '1800', class: 'A', balance: 1200 },
    { code: '3000', class: 'E', balance: 4200 },
  ], 'ILS');
  loadTrialBalance(g, 'subA', [
    { code: '1000', class: 'A', balance: 1500 },
    { code: '3000', class: 'E', balance: 1500 },
  ], 'ILS');
  const pack = consolidate(g, { period: '2026-Q1' });
  // goodwill = 1200 − 1.0 × 900 = 300
  assert.equal(pack.goodwill.total, 300);
  const gw = pack.consolidatedTB.find((r) => r.groupCode === '1950');
  assert.equal(gw.balance, 300);
  assert.equal(verifyEquality(pack.consolidatedTB).balanced, true);
});

// ═════════════════════════════════════════════════════════════════════
// 10. NCI — 80% ownership produces 20% NCI
// ═════════════════════════════════════════════════════════════════════

test('consolidate — NCI recognized at non-controlling share', () => {
  const g = defineGroup(parentP(), [
    subA({ ownership: 0.80, costOfInvestment: 800, netAssetsAtAcquisition: 1000 }),
  ]);
  // parent balanced book
  loadTrialBalance(g, 'parent', [
    { code: '1000', class: 'A', balance: 4000 },
    { code: '1800', class: 'A', balance: 800 },
    { code: '3000', class: 'E', balance: 4800 },
  ], 'ILS');
  // sub: current equity 1200 (200 post-acq profit)
  loadTrialBalance(g, 'subA', [
    { code: '1000', class: 'A', balance: 2000 },
    { code: '2000', class: 'L', balance: 800 },
    { code: '3000', class: 'E', balance: 1200 },
  ], 'ILS');
  const pack = consolidate(g, { period: '2026-Q1' });
  // NCI = 20% × 1200 = 240
  assert.equal(pack.NCI.total, 240);
  // goodwill = 800 − 0.8 × 1000 = 0
  assert.equal(pack.goodwill.total, 0);
  assert.equal(verifyEquality(pack.consolidatedTB).balanced, true);
});

// ═════════════════════════════════════════════════════════════════════
// 11. Fair value uplifts at acquisition
// ═════════════════════════════════════════════════════════════════════

test('consolidate — fair value uplifts reduce goodwill, add FV adjustment lines', () => {
  const g = defineGroup(parentP(), [
    subA({
      costOfInvestment: 1500,
      netAssetsAtAcquisition: 1000,
      fairValueUplifts: [
        { account: '1910', amount: 200, label: 'Buildings FV' },
        { account: '1920', amount: 100, label: 'Equipment FV' },
      ],
    }),
  ]);
  loadTrialBalance(g, 'parent', [
    { code: '1000', class: 'A', balance: 5000 },
    { code: '1800', class: 'A', balance: 1500 },
    { code: '3000', class: 'E', balance: 6500 },
  ], 'ILS');
  loadTrialBalance(g, 'subA', [
    { code: '1000', class: 'A', balance: 1500 },
    { code: '3000', class: 'E', balance: 1500 },
  ], 'ILS');
  const pack = consolidate(g, { period: '2026-Q1' });
  // goodwill = 1500 − 1.0 × (1000 + 300) = 200
  assert.equal(pack.goodwill.total, 200);
  // FV lines created
  const fv1 = pack.consolidatedTB.find((r) => r.groupCode === '1910');
  const fv2 = pack.consolidatedTB.find((r) => r.groupCode === '1920');
  assert.equal(fv1.balance, 200);
  assert.equal(fv2.balance, 100);
  assert.equal(verifyEquality(pack.consolidatedTB).balanced, true);
});

// ═════════════════════════════════════════════════════════════════════
// 12. Foreign subsidiary consolidation (USD → ILS)
// ═════════════════════════════════════════════════════════════════════

test('consolidate — USD sub with FX translation produces CTA, balanced', () => {
  const g = defineGroup(parentP(), [subB()]);
  loadTrialBalance(g, 'parent', [
    { code: '1000', class: 'A', balance: 10000 },
    { code: '1800', class: 'A', balance: 3200 },
    { code: '2000', class: 'L', balance: 5000 },
    { code: '3000', class: 'E', balance: 8200 },
  ], 'ILS');
  loadTrialBalance(g, 'subB', [
    { code: '1000', class: 'A', balance: 1500 },
    { code: '2000', class: 'L', balance: 500 },
    { code: '3000', class: 'E', balance: 1000, historical_rate: 3.5 },
  ], 'USD');
  const pack = consolidate(g, {
    period: '2026-Q1',
    rates: { subB: { closing: 3.7, average: 3.6, historical: 3.5 } },
  });
  // USD sub: A 1500*3.7=5550, L 500*3.7=1850, E 1000*3.5=3500
  // CTA: 5550 − (1850+3500) − 0 = 200
  assert.equal(pack.cta, 200);
  // goodwill = 3200 − 0.8×3500 = 400
  assert.equal(pack.goodwill.total, 400);
  // NCI = 0.2 × 3500 = 700
  assert.equal(pack.NCI.total, 700);
  assert.equal(verifyEquality(pack.consolidatedTB).balanced, true);
});

// ═════════════════════════════════════════════════════════════════════
// 13. Equity method (20%–50%)
// ═════════════════════════════════════════════════════════════════════

test('consolidate — equity method 30% adjusts investment + posts equity-method income', () => {
  const g = defineGroup(parentP(), [
    subA({ ownership: 0.30, costOfInvestment: 300, netAssetsAtAcquisition: 800 }),
  ]);
  loadTrialBalance(g, 'parent', [
    { code: '1000', class: 'A', balance: 2000 },
    { code: '1820', class: 'A', balance: 300 },
    { code: '3000', class: 'E', balance: 2300 },
  ], 'ILS');
  loadTrialBalance(g, 'subA', [
    { code: '1000', class: 'A', balance: 1000 },
    { code: '3000', class: 'E', balance: 1000 },
  ], 'ILS');
  const pack = consolidate(g, { period: '2026-Q1' });
  // share of post-acq = 0.30 × (1000 − 800) = 60
  const inv = pack.consolidatedTB.find((r) => r.groupCode === '1820');
  assert.equal(inv.balance, 360);
  const income = pack.consolidatedTB.find((r) => r.groupCode === '4820');
  assert.equal(income.balance, 60);
  assert.equal(verifyEquality(pack.consolidatedTB).balanced, true);
});

// ═════════════════════════════════════════════════════════════════════
// 14. Cost method (<20%)
// ═════════════════════════════════════════════════════════════════════

test('consolidate — cost method 10% leaves investment at cost, ignores sub lines', () => {
  const g = defineGroup(parentP(), [
    subA({ ownership: 0.10, costOfInvestment: 100, netAssetsAtAcquisition: 800 }),
  ]);
  loadTrialBalance(g, 'parent', [
    { code: '1000', class: 'A', balance: 2000 },
    { code: '1850', class: 'A', balance: 100 },
    { code: '3000', class: 'E', balance: 2100 },
  ], 'ILS');
  loadTrialBalance(g, 'subA', [
    { code: '1000', class: 'A', balance: 2000 },
    { code: '3000', class: 'E', balance: 2000 },
  ], 'ILS');
  const pack = consolidate(g, { period: '2026-Q1' });
  // sub lines NOT aggregated: consolidated cash stays at parent's 2000
  const cash = pack.consolidatedTB.find((r) => r.groupCode === '1000');
  assert.equal(cash.balance, 2000);
  const inv = pack.consolidatedTB.find((r) => r.groupCode === '1850');
  assert.equal(inv.balance, 100);
  assert.equal(verifyEquality(pack.consolidatedTB).balanced, true);
});

// ═════════════════════════════════════════════════════════════════════
// 15. Prior-year comparative
// ═════════════════════════════════════════════════════════════════════

test('prioryearComparative — surfaces deltas between two consolidated periods', () => {
  const g = defineGroup(parentP(), [subA()]);
  loadTrialBalance(g, 'parent', balancedParentTB(), 'ILS');
  loadTrialBalance(g, 'subA', balancedSubTB(), 'ILS');
  consolidate(g, { period: '2025-Q4' });

  // bump cash in a new consolidation for 2026-Q1
  const ptb2 = balancedParentTB();
  ptb2.find((r) => r.code === '1000').balance = 6000;
  ptb2.find((r) => r.code === '1000').debit = 6000;
  ptb2.find((r) => r.code === '3000').balance = 4000;
  ptb2.find((r) => r.code === '3000').credit = 4000;
  loadTrialBalance(g, 'parent', ptb2, 'ILS');
  loadTrialBalance(g, 'subA', balancedSubTB(), 'ILS');
  consolidate(g, { period: '2026-Q1' });

  const comp = prioryearComparative(g, '2026-Q1', '2025-Q4');
  assert.equal(comp.period, '2026-Q1');
  assert.equal(comp.priorPeriod, '2025-Q4');
  const cashRow = comp.rows.find((r) => r.groupCode === '1000');
  assert.equal(cashRow.delta, 1000);
  assert.equal(cashRow.current, 8000); // 6000 parent + 2000 sub
});

// ═════════════════════════════════════════════════════════════════════
// 16. Audit package working papers
// ═════════════════════════════════════════════════════════════════════

test('auditPackage — contains raw TB, translated TB, eliminations, tie-outs, labels', () => {
  const g = defineGroup(parentP(), [subA()]);
  loadTrialBalance(g, 'parent', balancedParentTB(), 'ILS');
  loadTrialBalance(g, 'subA', balancedSubTB(), 'ILS');
  addIntercompany(g, [
    { type: 'AR_AP', from: 'parent', to: 'subA', amount: 50 },
  ]);
  consolidate(g, { period: '2026-Q1' });

  const pkg = auditPackage(g, '2026-Q1');
  assert.ok(pkg.generatedAt);
  assert.equal(pkg.period, '2026-Q1');
  assert.ok(pkg.trialBalancesRaw.parent.length > 0);
  assert.ok(pkg.trialBalancesTranslated.parent.length > 0);
  assert.ok(pkg.snapshot);
  assert.ok(pkg.verification);
  assert.equal(pkg.verification.balanced, true);
  assert.ok(pkg.tieOuts);
  assert.ok(pkg.auditTrail.length > 0);
  assert.equal(pkg.labels.goodwill.he, LABELS.goodwill.he);
  assert.ok(pkg.intercompany.length === 1);
});

// ═════════════════════════════════════════════════════════════════════
// 17. verifyEquality error path — unbalanced TB surfaces clear deltas
// ═════════════════════════════════════════════════════════════════════

test('verifyEquality — detects unbalanced trial balance and reports deltas', () => {
  const tb = [
    { groupCode: '1000', class: 'A', debit: 100, credit: 0, balance: 100 },
    { groupCode: '2000', class: 'L', debit: 0, credit: 60, balance: 60 },
    { groupCode: '3000', class: 'E', debit: 0, credit: 30, balance: 30 },
    // plug missing by 10 on purpose
  ];
  const v = verifyEquality(tb);
  assert.equal(v.balanced, false);
  assert.ok(Math.abs(v.deltas.balanceSheetDelta - 10) < 0.01);
});

test('verifyEquality — recognizes a correctly balanced hand-crafted TB', () => {
  const tb = [
    { groupCode: '1000', class: 'A', debit: 100, credit: 0, balance: 100 },
    { groupCode: '2000', class: 'L', debit: 0, credit: 40, balance: 40 },
    { groupCode: '3000', class: 'E', debit: 0, credit: 50, balance: 50 },
    { groupCode: '4000', class: 'R', debit: 0, credit: 30, balance: 30 },
    { groupCode: '5000', class: 'X', debit: 20, credit: 0, balance: 20 },
  ];
  const v = verifyEquality(tb);
  assert.equal(v.balanced, true);
});

// ═════════════════════════════════════════════════════════════════════
// 18. Full-stack regression: 2-entity group with all IC types + FX + NCI
// ═════════════════════════════════════════════════════════════════════

test('consolidate — full-stack regression: FX + IC AR/AP + IC Sales + NCI + goodwill', () => {
  const g = defineGroup(parentP(), [
    subB({ ownership: 0.75, costOfInvestment: 4000, netAssetsAtAcquisition: 5250 }),
  ]);
  mapAccounts(g, 'subB', {
    'US-1000': '1000',
    'US-1150': '1150',
    'US-1300': '1300',
    'US-2000': '2000',
    'US-2150': '2150',
    'US-3000': '3000',
    'US-4000': '4000',
    'US-5000': '5000',
  });
  loadTrialBalance(g, 'parent', [
    { code: '1000', class: 'A', balance: 20000 },
    { code: '1150', class: 'A', balance: 3700 },  // IC AR to sub
    { code: '1300', class: 'A', balance: 5000 },
    { code: '1800', class: 'A', balance: 4000 },
    { code: '3000', class: 'E', balance: 15000 },
    { code: '4100', class: 'R', balance: 20000 }, // includes IC sales
    { code: '5100', class: 'X', balance: 2300 },
  ], 'ILS');
  loadTrialBalance(g, 'subB', [
    { code: 'US-1000', class: 'A', balance: 3000 },
    { code: 'US-1300', class: 'A', balance: 1000 }, // $400 IC still on hand
    { code: 'US-2150', class: 'L', balance: 1000 }, // IC AP to parent (USD)
    { code: 'US-3000', class: 'E', balance: 1500, historical_rate: 3.5 },
    { code: 'US-4000', class: 'R', balance: 2000 },
    { code: 'US-5000', class: 'X', balance: 500 },
  ], 'USD');

  addIntercompany(g, [
    {
      type: 'AR_AP', from: 'parent', to: 'subB', amount: 3700,
      arAccount: '1150', apAccount: '2150',
    },
    {
      type: 'SALES_COGS', from: 'parent', to: 'subB',
      amount: 3600, margin: 0.25, stillInEndingInventory: 1480,
      salesAccount: '4100', cogsAccount: '5100', inventoryAccount: '1300',
    },
  ]);

  const pack = consolidate(g, {
    period: '2026-Q1',
    rates: { subB: { closing: 3.7, average: 3.6, historical: 3.5 } },
  });
  const v = verifyEquality(pack.consolidatedTB);
  assert.equal(v.balanced, true, JSON.stringify(v.deltas));

  // goodwill = 4000 − 0.75 × 5250 = 62.5
  assert.equal(pack.goodwill.total, 62.5);
  // IC AR + IC AP must have zeroed out (sub $1000 × 3.7 = 3700 matches IC)
  assert.equal(pack.consolidatedTB.find((r) => r.groupCode === '1150').balance, 0);
  assert.equal(pack.consolidatedTB.find((r) => r.groupCode === '2150').balance, 0);
});
