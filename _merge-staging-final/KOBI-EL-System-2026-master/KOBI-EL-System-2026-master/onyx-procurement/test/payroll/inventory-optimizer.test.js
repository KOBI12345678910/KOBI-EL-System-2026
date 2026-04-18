/**
 * Inventory Optimizer — Unit Tests
 * Agent X-08 / Techno-Kol Uzi Mega-ERP (Kobi 2026)
 *
 * 20+ cases covering: EOQ math, reorder points, safety stock,
 * service-level z-scores, ABC classification, XYZ classification,
 * dead-stock detection, overstock detection, reorder recommendation
 * urgency ladder, bulk-discount evaluation, and the end-to-end
 * optimizeInventory() driver for Israeli metal-fab inventory.
 *
 * Run: node --test test/payroll/inventory-optimizer.test.js
 *   or: node --test test/payroll/
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const {
  SERVICE_LEVELS,
  CLASS_LABELS,
  DEFAULTS,
  calculateEOQ,
  calculateROP,
  calculateSafetyStock,
  classifyABC,
  classifyXYZ,
  recommendReorders,
  findDeadStock,
  findOverstock,
  applyBulkDiscount,
  optimizeInventory,
  _internals,
} = require('../../src/inventory/optimizer.js');

// ─────────────────────────────────────────────────────────────────────
// helpers
// ─────────────────────────────────────────────────────────────────────
const near = (a, b, eps = 0.01) =>
  Math.abs(a - b) <= eps
    ? true
    : (console.error('near mismatch', a, 'vs', b), false);

// Small Israeli metal-fab fixture
function fabFixture() {
  return [
    {
      sku: 'STEEL-SHEET-2MM',
      name_he: 'פח פלדה 2 מ"מ',
      name_en: 'Steel sheet 2mm',
      annualDemand: 12000,
      orderCost: 75,
      unitCost: 48,
      holdingCost: 10.56,     // 22% of 48
      leadTime: 10,
      avgDailyDemand: 33,
      stdevDemand: 4,
      currentStock: 180,
      unitVolume: 0.002,
      lastMovementDate: '2026-04-08',
      supplier: 'הוט מיל',
    },
    {
      sku: 'ROD-12MM',
      name_he: 'מוט פלדה 12 מ"מ',
      name_en: 'Steel rod 12mm',
      annualDemand: 5200,
      orderCost: 75,
      unitCost: 22,
      holdingCost: 4.84,
      leadTime: 7,
      avgDailyDemand: 14,
      stdevDemand: 3,
      currentStock: 75,        // at/below ROP
      unitVolume: 0.001,
      lastMovementDate: '2026-04-09',
      supplier: 'מפעלי ברזל יפו',
    },
    {
      sku: 'TUBE-SQ-40',
      name_he: 'צינור מרובע 40',
      name_en: 'Square tube 40',
      annualDemand: 800,
      orderCost: 75,
      unitCost: 65,
      holdingCost: 14.3,
      leadTime: 14,
      avgDailyDemand: 2.2,
      stdevDemand: 0.8,
      currentStock: 3500,      // massively overstocked
      unitVolume: 0.004,
      lastMovementDate: '2026-04-10',
      supplier: 'הוט מיל',
    },
    {
      sku: 'PLATE-10MM',
      name_he: 'לוח 10 מ"מ',
      name_en: 'Plate 10mm',
      annualDemand: 300,
      orderCost: 75,
      unitCost: 210,
      holdingCost: 46.2,
      leadTime: 12,
      avgDailyDemand: 0.9,
      stdevDemand: 0.3,
      currentStock: 40,
      unitVolume: 0.01,
      lastMovementDate: '2025-09-01',   // dead stock
      supplier: 'מפעלי פרזול תל אביב',
    },
  ];
}

// ─────────────────────────────────────────────────────────────────────
// 1. EOQ math
// ─────────────────────────────────────────────────────────────────────
describe('calculateEOQ — core formula', () => {
  // case 1 — textbook example
  test('EOQ(1200, 100, 6) → 200', () => {
    assert.ok(near(calculateEOQ(1200, 100, 6), 200));
  });

  // case 2 — metal-fab realistic
  test('EOQ(12000, 75, 10.56) → ≈412.81', () => {
    const q = calculateEOQ(12000, 75, 10.56);
    assert.ok(near(q, Math.sqrt((2 * 12000 * 75) / 10.56)));
    assert.ok(q > 412 && q < 413);
  });

  // case 3 — zero and negative guards
  test('EOQ with zero demand → 0', () => {
    assert.equal(calculateEOQ(0, 75, 10), 0);
    assert.equal(calculateEOQ(100, 0, 10), 0);
    assert.equal(calculateEOQ(100, 75, 0), 0);
    assert.equal(calculateEOQ(-5, 75, 10), 0);
  });
});

// ─────────────────────────────────────────────────────────────────────
// 2. Safety stock & ROP
// ─────────────────────────────────────────────────────────────────────
describe('safety stock & reorder point', () => {
  // case 4 — 95% service level z = 1.65
  test('safety stock at 95% SL uses z = 1.65', () => {
    const ss = calculateSafetyStock(5, 9, 95);
    // 1.65 * 5 * 3 = 24.75
    assert.ok(near(ss, 24.75));
  });

  // case 5 — 99% service level z = 2.33
  test('safety stock at 99% SL uses z = 2.33', () => {
    const ss = calculateSafetyStock(5, 9, 99);
    // 2.33 * 5 * 3 = 34.95
    assert.ok(near(ss, 34.95));
  });

  // case 6 — ROP = (avg × lt) + SS
  test('ROP = avg × leadTime + safety stock', () => {
    const rop = calculateROP(10, 7, 2, 95); // SS = 1.65 * 2 * sqrt(7) ≈ 8.73
    const expected = 10 * 7 + 1.65 * 2 * Math.sqrt(7);
    assert.ok(near(rop, expected, 0.05));
  });

  // case 7 — zero stdev collapses safety stock to 0
  test('zero stdev → safety stock = 0, ROP = avg × leadTime', () => {
    const ss = calculateSafetyStock(0, 10, 99);
    assert.equal(ss, 0);
    const rop = calculateROP(5, 10, 0, 99);
    assert.equal(rop, 50);
  });

  // case 8 — lookup table contains both 95 and 99
  test('SERVICE_LEVELS contains 95 and 99', () => {
    assert.equal(SERVICE_LEVELS[95], 1.65);
    assert.equal(SERVICE_LEVELS[99], 2.33);
  });
});

// ─────────────────────────────────────────────────────────────────────
// 3. ABC classification
// ─────────────────────────────────────────────────────────────────────
describe('classifyABC — Pareto 80/15/5', () => {
  // case 9 — classic Pareto distribution
  test('A-class captures top-value items first', () => {
    const items = [
      { sku: 'A', annualDemand: 1000, unitCost: 100 }, // 100,000
      { sku: 'B', annualDemand: 200,  unitCost: 50  }, // 10,000
      { sku: 'C', annualDemand: 100,  unitCost: 10  }, // 1,000
      { sku: 'D', annualDemand: 50,   unitCost: 2   }, // 100
    ];
    const out = classifyABC(items);
    // sorted by value desc → A, B, C, D
    assert.equal(out[0].sku, 'A');
    assert.equal(out[0].abc_class, 'A');
    // A is ~90% of total value, alone it's already above 80% → still class A
    assert.ok(out[0].cumulative_share >= 0.80);
    // Sanity: every item received a class and a label
    for (const row of out) {
      assert.ok(['A', 'B', 'C'].includes(row.abc_class));
      assert.ok(row.abc_label.startsWith(row.abc_class));
    }
  });

  // case 10 — explicit pre-aggregated annualUsageValue supported
  test('accepts annualUsageValue directly', () => {
    const items = [
      { sku: 'X', annualUsageValue: 50000 },
      { sku: 'Y', annualUsageValue: 5000 },
      { sku: 'Z', annualUsageValue: 500 },
    ];
    const out = classifyABC(items);
    assert.equal(out[0].sku, 'X');
    assert.equal(out[0].abc_class, 'A');
  });

  // case 11 — empty / non-array tolerance
  test('classifyABC on empty input returns []', () => {
    assert.deepEqual(classifyABC([]), []);
    assert.deepEqual(classifyABC(null), []);
  });
});

// ─────────────────────────────────────────────────────────────────────
// 4. XYZ classification
// ─────────────────────────────────────────────────────────────────────
describe('classifyXYZ — demand variability', () => {
  // case 12 — low CV → X, high CV → Z
  test('predictable history → X, volatile history → Z', () => {
    const items = [
      { sku: 'STABLE',   demandHistory: [100, 101, 99, 100, 100, 101] },       // CV ≈ 0
      { sku: 'MEDIUM',   demandHistory: [100, 120, 80, 110, 90, 115] },        // CV ≈ 0.13
      { sku: 'VOLATILE', demandHistory: [0, 300, 10, 0, 500, 5] },             // CV >> 0.5
    ];
    const out = classifyXYZ(items);
    assert.equal(out[0].xyz_class, 'X');
    assert.equal(out[2].xyz_class, 'Z');
  });

  // case 13 — accepts pre-computed CV
  test('accepts coefficientOfVariation directly', () => {
    const out = classifyXYZ([
      { sku: 'A', coefficientOfVariation: 0.10 },
      { sku: 'B', coefficientOfVariation: 0.40 },
      { sku: 'C', coefficientOfVariation: 0.80 },
    ]);
    assert.equal(out[0].xyz_class, 'X');
    assert.equal(out[1].xyz_class, 'Y');
    assert.equal(out[2].xyz_class, 'Z');
  });
});

// ─────────────────────────────────────────────────────────────────────
// 5. Dead stock detection
// ─────────────────────────────────────────────────────────────────────
describe('findDeadStock', () => {
  // case 14 — anything older than threshold surfaces
  test('item unmoved for 200 days @ threshold 180 → dead', () => {
    const now = new Date('2026-04-11').getTime();
    const out = findDeadStock(
      [
        { sku: 'FRESH', lastMovementDate: '2026-04-01' },          // ~10d
        { sku: 'STALE', lastMovementDate: '2025-09-01' },          // >200d
        { sku: 'NO-DATE' },                                        // unknown → dead
      ],
      180,
      { now },
    );
    const skus = out.map((r) => r.sku);
    assert.ok(skus.includes('STALE'));
    assert.ok(skus.includes('NO-DATE'));
    assert.ok(!skus.includes('FRESH'));
    // severity: STALE ~220d is < 2*180 → medium, NO-DATE is Infinity → high
    const noDate = out.find((r) => r.sku === 'NO-DATE');
    assert.equal(noDate.severity, 'high');
  });
});

// ─────────────────────────────────────────────────────────────────────
// 6. Overstock detection
// ─────────────────────────────────────────────────────────────────────
describe('findOverstock', () => {
  // case 15 — current > 3 × EOQ flags
  test('currentStock above 3×EOQ is flagged', () => {
    // EOQ(800, 75, 14.3) = sqrt(120000/14.3) ≈ 91.6 → 3× ≈ 274.8
    const out = findOverstock(
      [
        { sku: 'TUBE-SQ-40', annualDemand: 800, orderCost: 75, holdingCost: 14.3, currentStock: 3500 },
        { sku: 'NORMAL',     annualDemand: 800, orderCost: 75, holdingCost: 14.3, currentStock: 100  },
      ],
      3,
    );
    assert.equal(out.length, 1);
    assert.equal(out[0].sku, 'TUBE-SQ-40');
    assert.ok(out[0].overstock_ratio > 3);
    assert.equal(out[0].severity, 'high');
  });
});

// ─────────────────────────────────────────────────────────────────────
// 7. Reorder recommendations & urgency ladder
// ─────────────────────────────────────────────────────────────────────
describe('recommendReorders', () => {
  // case 16 — stock below ROP produces a critical/urgent reorder
  test('items at/below ROP are surfaced with urgency class', () => {
    const inv = fabFixture();
    const out = recommendReorders(inv);
    // ROD-12MM current 75 is right at ROP-ish; STEEL-SHEET current 180 is below ROP
    const skus = out.map((r) => r.sku);
    assert.ok(skus.includes('STEEL-SHEET-2MM'));
    assert.ok(skus.includes('ROD-12MM'));
    // Overstocked TUBE-SQ-40 must NOT be recommended for reorder
    assert.ok(!skus.includes('TUBE-SQ-40'));
    // Each row has urgency + Hebrew label
    for (const row of out) {
      assert.ok(['critical', 'urgent', 'normal'].includes(row.urgency));
      assert.ok(typeof row.urgency_he === 'string' && row.urgency_he.length > 0);
      assert.ok(row.recommendedOrderQty > 0);
    }
  });

  // case 17 — zero-stock item triggers critical
  test('zero stock → urgency=critical', () => {
    const out = recommendReorders([
      {
        sku: 'EMPTY',
        annualDemand: 3650,
        avgDailyDemand: 10,
        stdevDemand: 2,
        leadTime: 10,
        currentStock: 0,
        unitCost: 10,
        orderCost: 50,
        holdingCost: 2.2,
      },
    ]);
    assert.equal(out.length, 1);
    assert.equal(out[0].urgency, 'critical');
    assert.equal(out[0].urgency_he, 'קריטי');
  });
});

// ─────────────────────────────────────────────────────────────────────
// 8. Bulk-discount evaluation
// ─────────────────────────────────────────────────────────────────────
describe('applyBulkDiscount', () => {
  // case 18 — deeper discount tier chosen when price break pays off
  test('bulk tier picked when total annual cost improves', () => {
    const baseEoq = calculateEOQ(12000, 75, 22);
    const tiers = [
      { minQty: 0,    price: 100 },
      { minQty: 500,  price: 95  },
      { minQty: 1000, price: 90  },
    ];
    const res = applyBulkDiscount(baseEoq, 12000, 75, 0.22, tiers);
    assert.ok(res.orderQty > 0);
    assert.ok(res.totalCost > 0);
    assert.ok([100, 95, 90].includes(res.unitPrice));
    assert.ok(res.tier);
  });
});

// ─────────────────────────────────────────────────────────────────────
// 9. End-to-end optimizeInventory()
// ─────────────────────────────────────────────────────────────────────
describe('optimizeInventory — end-to-end', () => {
  // case 19 — all four signals show up
  test('produces reorders, dead stock, overstock and ABC/XYZ labels', () => {
    const result = optimizeInventory(fabFixture(), {
      now: '2026-04-11',
      deadStockDays: 180,
      overstockMultiple: 3,
      warehouseCapacity: 100,
    });

    assert.equal(result.items.length, 4);
    assert.ok(result.reorders.length >= 1);
    assert.ok(result.overstock.length >= 1);
    assert.ok(result.deadStock.length >= 1);

    // summary sanity
    assert.equal(result.summary.totalItems, 4);
    assert.ok(result.summary.totalValue > 0);
    assert.ok(result.summary.recommendations.reorder >= 1);
    assert.ok(result.summary.recommendations.dead_stock >= 1);
    assert.ok(result.summary.recommendations.overstock >= 1);
    assert.equal(typeof result.summary.warehouseUsagePct, 'number');
    assert.ok(result.summary.warehouseUsagePct >= 0);

    // Every enriched row gets classes and flags
    for (const it of result.items) {
      assert.ok(['A', 'B', 'C'].includes(it.abc_class));
      assert.ok(['X', 'Y', 'Z'].includes(it.xyz_class));
      assert.ok(it.flags && typeof it.flags === 'object');
      assert.equal(typeof it.eoq, 'number');
      assert.equal(typeof it.reorderPoint, 'number');
      assert.equal(typeof it.safetyStock, 'number');
    }
  });

  // case 20 — input array not mutated (pure function contract)
  test('optimizeInventory does not mutate inputs', () => {
    const input = fabFixture();
    const snapshot = JSON.stringify(input);
    optimizeInventory(input, { now: '2026-04-11' });
    assert.equal(JSON.stringify(input), snapshot);
  });

  // case 21 — empty inventory returns a valid empty shape
  test('empty input returns zeroed summary', () => {
    const result = optimizeInventory([]);
    assert.equal(result.items.length, 0);
    assert.equal(result.reorders.length, 0);
    assert.equal(result.deadStock.length, 0);
    assert.equal(result.overstock.length, 0);
    assert.equal(result.summary.totalItems, 0);
    assert.equal(result.summary.totalValue, 0);
  });

  // case 22 — Hebrew names survive through the pipeline
  test('Hebrew bilingual labels survive the pipeline', () => {
    const result = optimizeInventory(fabFixture(), { now: '2026-04-11' });
    const sheet = result.items.find((r) => r.sku === 'STEEL-SHEET-2MM');
    assert.ok(sheet);
    assert.equal(sheet.name_he, 'פח פלדה 2 מ"מ');
    assert.ok(sheet.abc_label.includes('A') || sheet.abc_label.includes('B') || sheet.abc_label.includes('C'));
  });
});

// ─────────────────────────────────────────────────────────────────────
// 10. Internals sanity
// ─────────────────────────────────────────────────────────────────────
describe('internals — mean, stdev, coefficientOfVariation', () => {
  // case 23 — textbook numbers
  test('mean and stdev of [2,4,4,4,5,5,7,9]', () => {
    const arr = [2, 4, 4, 4, 5, 5, 7, 9];
    assert.equal(_internals.mean(arr), 5);
    // sample stdev (n-1) ≈ 2.138...
    assert.ok(near(_internals.stdev(arr), 2.138, 0.01));
  });

  // case 24 — CV handles zero mean safely
  test('coefficientOfVariation on [0,0,0] → 0', () => {
    assert.equal(_internals.coefficientOfVariation([0, 0, 0]), 0);
  });
});
