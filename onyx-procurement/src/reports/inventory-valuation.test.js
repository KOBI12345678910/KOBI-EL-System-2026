/**
 * Unit tests for inventory-valuation.js
 *
 * Runs on node's built-in test runner — no mocha/jest needed:
 *   node --test src/reports/inventory-valuation.test.js
 *
 * The FIFO/LIFO/WAC expected numbers were computed by hand off the
 * fixture below (see docs/INVENTORY_VALUATION.md § worked example).
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  valueInventory,
  valueInventoryPdf,
  runFifo,
  runLifo,
  runWac,
  normaliseMovements,
  detectCommodity,
  normaliseCommodityIndex,
} = require('./inventory-valuation.js');

// ─── fixture: one item, two receipts, one issue ───
// Receipt 1: 10 @ 100 = 1000
// Receipt 2: 10 @ 120 = 1200
// Issue:     15 @ 200 (sale price)
//
// FIFO: 10 @100 (oldest) + 5 @120  => COGS = 1600
//       On hand: 5 @120 => value = 600, unitCost = 120
// LIFO: 10 @120 (newest) + 5 @100  => COGS = 1700
//       On hand: 5 @100 => value = 500, unitCost = 100
// WAC : avg after receipts = 2200/20 = 110
//       COGS = 15 * 110 = 1650
//       On hand: 5 @110 => value = 550, unitCost = 110
// Revenue (all methods): 15 * 200 = 3000

const singleItemMovements = [
  {
    itemId: 'IRON-PLATE-10MM',
    type: 'IN',
    qty: 10,
    unitCost: 100,
    date: new Date('2026-01-05'),
  },
  {
    itemId: 'IRON-PLATE-10MM',
    type: 'IN',
    qty: 10,
    unitCost: 120,
    date: new Date('2026-02-10'),
  },
  {
    itemId: 'IRON-PLATE-10MM',
    type: 'OUT',
    qty: 15,
    unitCost: 0,
    salePrice: 200,
    date: new Date('2026-03-15'),
  },
];

// ───────────────── core method tests ─────────────────

test('FIFO basic flow', () => {
  const r = runFifo(singleItemMovements.map((m) => ({ ...m })));
  assert.equal(r.qtyOnHand, 5);
  assert.equal(r.unitCost, 120);
  assert.equal(r.valueAgorot, 60000); // 600.00
  assert.equal(r.cogsAgorot, 160000); // 1600.00
  assert.equal(r.revenueAgorot, 300000); // 3000.00
});

test('LIFO basic flow', () => {
  const r = runLifo(singleItemMovements.map((m) => ({ ...m })));
  assert.equal(r.qtyOnHand, 5);
  assert.equal(r.unitCost, 100);
  assert.equal(r.valueAgorot, 50000); // 500.00
  assert.equal(r.cogsAgorot, 170000); // 1700.00
  assert.equal(r.revenueAgorot, 300000);
});

test('WAC basic flow', () => {
  const r = runWac(singleItemMovements.map((m) => ({ ...m })));
  assert.equal(r.qtyOnHand, 5);
  assert.equal(r.unitCost, 110);
  assert.equal(r.valueAgorot, 55000); // 550.00
  assert.equal(r.cogsAgorot, 165000); // 1650.00
  assert.equal(r.revenueAgorot, 300000);
});

test('FIFO handles exact depletion', () => {
  const r = runFifo([
    { type: 'IN', qty: 5, unitCost: 50, date: new Date('2026-01-01') },
    { type: 'OUT', qty: 5, unitCost: 0, salePrice: 80, date: new Date('2026-01-15') },
  ]);
  assert.equal(r.qtyOnHand, 0);
  assert.equal(r.valueAgorot, 0);
  assert.equal(r.cogsAgorot, 25000);
});

test('LIFO handles multi-layer consumption', () => {
  const r = runLifo([
    { type: 'IN', qty: 10, unitCost: 10, date: new Date('2026-01-01') },
    { type: 'IN', qty: 10, unitCost: 20, date: new Date('2026-02-01') },
    { type: 'IN', qty: 10, unitCost: 30, date: new Date('2026-03-01') },
    { type: 'OUT', qty: 25, unitCost: 0, salePrice: 50, date: new Date('2026-04-01') },
  ]);
  // LIFO consumes: 10@30 + 10@20 + 5@10 = 300+200+50 = 550
  // On hand: 5 @ 10 = 50
  assert.equal(r.qtyOnHand, 5);
  assert.equal(r.valueAgorot, 5000);
  assert.equal(r.cogsAgorot, 55000);
});

test('WAC recomputes average after every receipt', () => {
  // 10 @ 10 -> avg 10
  // 10 @ 30 -> value 100 + 300 = 400, qty 20, avg 20
  // issue 5 -> COGS 5*20=100, remaining 15 @ 20 = 300
  // 5 @ 60 -> value 300 + 300 = 600, qty 20, avg 30
  const r = runWac([
    { type: 'IN', qty: 10, unitCost: 10, date: new Date('2026-01-01') },
    { type: 'IN', qty: 10, unitCost: 30, date: new Date('2026-02-01') },
    { type: 'OUT', qty: 5, salePrice: 50, date: new Date('2026-02-15') },
    { type: 'IN', qty: 5, unitCost: 60, date: new Date('2026-03-01') },
  ]);
  assert.equal(r.qtyOnHand, 20);
  assert.equal(r.unitCost, 30);
  assert.equal(r.valueAgorot, 60000);
  assert.equal(r.cogsAgorot, 10000);
});

// ───────────────── full report wrapper ─────────────────

test('valueInventory FIFO end-to-end with categories + slow/dead', async () => {
  const asOf = new Date('2026-04-01');

  const data = {
    opening: [],
    receipts: [
      {
        item_id: 'IRON-PLATE-10MM',
        sku: 'IRON-PLATE-10MM',
        name: 'Iron plate 10mm',
        category: 'raw_materials',
        commodity: 'iron',
        quantity: 10,
        unit_cost: 100,
        received_at: '2026-01-05',
      },
      {
        item_id: 'IRON-PLATE-10MM',
        sku: 'IRON-PLATE-10MM',
        category: 'raw_materials',
        commodity: 'iron',
        quantity: 10,
        unit_cost: 120,
        received_at: '2026-02-10',
      },
      {
        item_id: 'WIDGET-A',
        sku: 'WIDGET-A',
        name: 'Finished widget A',
        category: 'finished_goods',
        quantity: 100,
        unit_cost: 5,
        received_at: '2024-01-01', // more than a year ago -> dead
      },
      {
        item_id: 'COPPER-WIRE-3MM',
        sku: 'COPPER-WIRE-3MM',
        name: 'Copper wire 3mm',
        category: 'raw_materials',
        commodity: 'copper',
        quantity: 50,
        unit_cost: 40,
        received_at: '2025-12-15', // ~3-4 months ago -> slow
      },
    ],
    issues: [
      {
        item_id: 'IRON-PLATE-10MM',
        sku: 'IRON-PLATE-10MM',
        category: 'raw_materials',
        quantity: 15,
        sale_price: 200,
        issued_at: '2026-03-15',
      },
    ],
  };

  const report = await valueInventory({
    asOf,
    method: 'FIFO',
    data,
    commodityIndex: { iron: 5, copper: 45 }, // ILS/kg
  });

  assert.equal(report.meta.method, 'FIFO');
  assert.equal(report.meta.itemCount, 3);
  assert.equal(report.meta.source, 'in-memory');

  // iron: 5 units left, value 600 (FIFO)
  const iron = report.items.find((i) => i.sku === 'IRON-PLATE-10MM');
  assert.ok(iron, 'iron item present');
  assert.equal(iron.quantityOnHand, 5);
  assert.equal(iron.totalValue, 600);
  assert.equal(iron.unitCost, 120);
  assert.equal(iron.cogs, 1600);
  assert.equal(iron.revenue, 3000);
  assert.equal(iron.grossProfit, 1400);
  // commodity overlay: 5 units * 5 ILS/kg
  assert.equal(iron.commodityUnitPrice, 5);
  assert.equal(iron.commodityValue, 25);

  // widget: dead stock
  const widget = report.items.find((i) => i.sku === 'WIDGET-A');
  assert.ok(widget);
  assert.equal(widget.isDeadStock, true);
  assert.equal(widget.isSlowMoving, false);

  // copper: slow moving (120ish days after 2025-12-15 vs 2026-04-01)
  const copper = report.items.find((i) => i.sku === 'COPPER-WIRE-3MM');
  assert.ok(copper);
  assert.equal(copper.isSlowMoving, true);
  assert.equal(copper.isDeadStock, false);

  // category breakdown
  const catMap = Object.fromEntries(report.byCategory.map((c) => [c.category, c]));
  assert.ok(catMap.raw_materials);
  assert.ok(catMap.finished_goods);

  // summary total value = 600 (iron) + 500 (widget: 100*5) + 2000 (copper: 50*40) = 3100
  assert.equal(report.summary.totalInventoryValue, 3100);
  assert.equal(report.summary.totalCogs, 1600);
  assert.equal(report.summary.totalRevenue, 3000);
  assert.equal(report.summary.totalGrossProfit, 1400);
  assert.equal(report.summary.deadStockCount, 1);
  assert.equal(report.summary.slowMovingCount, 1);
});

test('valueInventory works with ONLY purchase/sales lines (no inventory tables)', async () => {
  const report = await valueInventory({
    asOf: new Date('2026-04-01'),
    method: 'WAC',
    data: {
      purchaseLines: [
        { sku: 'ALU-BAR', quantity: 20, unit_price: 50, date: '2026-01-01' },
        { sku: 'ALU-BAR', quantity: 20, unit_price: 70, date: '2026-02-01' },
      ],
      salesLines: [
        { sku: 'ALU-BAR', quantity: 10, unit_price: 150, date: '2026-03-01' },
      ],
    },
  });
  // avg 60, qty on hand 30, value 1800, COGS 600
  const alu = report.items.find((i) => i.sku === 'ALU-BAR');
  assert.ok(alu);
  assert.equal(alu.quantityOnHand, 30);
  assert.equal(alu.unitCost, 60);
  assert.equal(alu.totalValue, 1800);
  assert.equal(alu.cogs, 600);
  assert.equal(alu.revenue, 1500);
});

test('valueInventory clamps movements after asOf', async () => {
  const report = await valueInventory({
    asOf: new Date('2026-02-01'),
    method: 'FIFO',
    data: {
      receipts: [
        { sku: 'X', quantity: 5, unit_cost: 10, received_at: '2026-01-15' },
        { sku: 'X', quantity: 5, unit_cost: 99, received_at: '2026-03-15' }, // after asOf
      ],
    },
  });
  const x = report.items.find((i) => i.sku === 'X');
  assert.equal(x.quantityOnHand, 5);
  assert.equal(x.totalValue, 50);
});

test('valueInventory handles invalid method', async () => {
  await assert.rejects(
    () => valueInventory({ asOf: new Date(), method: 'XYZ', data: {} }),
    /Unsupported valuation method/
  );
});

test('valueInventory tolerates missing supabase tables via loader', async () => {
  // Stub a supabase-like client where every table fails.
  const fakeSb = {
    from() {
      return {
        select() { return this; },
        eq() { return this; },
        lte() { return this; },
        // node's `await` on a thenable — resolve with an error shape
        then(resolve) {
          resolve({ data: null, error: { message: 'relation does not exist' } });
          return { catch: () => {} };
        },
      };
    },
  };
  const report = await valueInventory({
    asOf: new Date('2026-04-01'),
    method: 'FIFO',
    supabase: fakeSb,
  });
  assert.equal(report.meta.source, 'supabase');
  assert.ok(report.meta.warnings.length > 0, 'warnings captured');
  assert.equal(report.summary.totalInventoryValue, 0);
  assert.equal(report.items.length, 0);
});

// ───────────────── commodity helpers ─────────────────

test('detectCommodity: direct + alias + haystack', () => {
  assert.equal(detectCommodity({ commodity: 'Copper' }), 'copper');
  assert.equal(detectCommodity({ metal: 'ברזל' }), 'iron');
  assert.equal(detectCommodity({ sku: 'ALU-BAR-6M' }), null); // no haystack hit
  assert.equal(detectCommodity({ name: 'aluminium sheet 2mm' }), 'aluminium');
  assert.equal(detectCommodity({}), null);
});

test('normaliseCommodityIndex accepts flat + nested', () => {
  const idx = normaliseCommodityIndex({
    Iron: 5,
    aluminium: { price_per_kg: 12 },
    'נחושת': { price: 45 },
  });
  assert.equal(idx.iron, 5);
  assert.equal(idx.aluminium, 12);
  assert.equal(idx.copper, 45);
});

// ───────────────── normaliseMovements ─────────────────

test('normaliseMovements merges all input streams', () => {
  const out = normaliseMovements({
    opening: [{ sku: 'A', quantity: 5, unit_cost: 10, as_of: '2025-12-31' }],
    receipts: [{ sku: 'A', quantity: 3, unit_cost: 12, received_at: '2026-01-10' }],
    issues: [{ sku: 'A', quantity: 2, sale_price: 30, issued_at: '2026-02-01' }],
    salesLines: [],
    purchaseLines: [],
  });
  assert.equal(out.length, 3);
  assert.equal(out.filter((m) => m.type === 'IN').length, 2);
  assert.equal(out.filter((m) => m.type === 'OUT').length, 1);
});

// ───────────────── PDF smoke test ─────────────────

test('valueInventoryPdf writes a file', async () => {
  const fs = require('fs');
  const path = require('path');
  const os = require('os');

  const report = await valueInventory({
    asOf: new Date('2026-04-01'),
    method: 'FIFO',
    data: {
      receipts: [
        { sku: 'IRON-1', name: 'Iron bar', category: 'raw_materials', quantity: 10, unit_cost: 100, received_at: '2026-01-05' },
        { sku: 'IRON-1', name: 'Iron bar', category: 'raw_materials', quantity: 10, unit_cost: 120, received_at: '2026-02-10' },
      ],
      issues: [
        { sku: 'IRON-1', category: 'raw_materials', quantity: 15, sale_price: 200, issued_at: '2026-03-15' },
      ],
    },
  });

  const outPath = path.join(os.tmpdir(), `inv-valuation-${Date.now()}.pdf`);
  const result = await valueInventoryPdf(report, outPath);
  assert.ok(result.path);
  assert.ok(result.size > 0, 'PDF should be non-empty');
  assert.ok(fs.existsSync(outPath), 'PDF file should exist');
  // cleanup — but never remove source code, just the temp artifact.
  try { fs.unlinkSync(outPath); } catch (_) { /* noop */ }
});
