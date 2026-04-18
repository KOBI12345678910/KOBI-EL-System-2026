/**
 * Bundle pricing engine — unit tests
 * Agent Y-018 — Mega-ERP Techno-Kol Uzi
 *
 * Run:  node --test test/pricing/bundle.test.js
 *
 * Covers:
 *   - defineBundle validation + append-only revisions
 *   - priceBundle totals per pricingMode
 *   - allocation sum equals total (agorot-level) for all three methods
 *   - relative allocation matches standalone proportions
 *   - explode() for nested bundle-of-bundles
 *   - availability() = min across leaf components
 *   - circular reference detection
 *   - orphan component detection
 *   - Israeli VAT on total + per-component net allocation
 *   - IFRS 15 revenue recognition shape
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { BundlePricing, CONSTANTS } = require('../../src/pricing/bundle.js');

// ---------------------------------------------------------------
//  helpers
// ---------------------------------------------------------------
function newEngine() {
  const bp = new BundlePricing({ maxDepth: 6 });
  // Three leaf components (all prices are NET-of-VAT, in shekel)
  bp.upsertComponent('BOLT-10', {
    price: 100,
    name_he: 'בורג פלדה M10',
    name_en: 'Steel bolt M10',
    inventory: 50,
  });
  bp.upsertComponent('NUT-10', {
    price: 30,
    name_he: 'אום M10',
    name_en: 'Nut M10',
    inventory: 60,
  });
  bp.upsertComponent('WASHER-10', {
    price: 20,
    name_he: 'דסקית M10',
    name_en: 'Washer M10',
    inventory: 40,
  });
  return bp;
}

function round2(x) {
  return Math.round(x * 100) / 100;
}

// ---------------------------------------------------------------
//  defineBundle — validation and append-only revisions
// ---------------------------------------------------------------
test('defineBundle requires valid pricingMode + allocationMethod', () => {
  const bp = newEngine();
  assert.throws(
    () =>
      bp.defineBundle({
        sku: 'KIT-1',
        name_he: 'ערכה',
        name_en: 'Kit',
        components: [{ sku: 'BOLT-10', qty: 1 }],
        pricingMode: 'bogus',
      }),
    /pricingMode/
  );
  assert.throws(
    () =>
      bp.defineBundle({
        sku: 'KIT-1',
        name_he: 'ערכה',
        name_en: 'Kit',
        components: [{ sku: 'BOLT-10', qty: 1 }],
        pricingMode: 'sum',
        allocationMethod: 'wat',
      }),
    /allocationMethod/
  );
});

test('defineBundle is append-only (never delete — only upgrade and grow)', () => {
  const bp = newEngine();
  const v1 = bp.defineBundle({
    sku: 'KIT-A',
    name_he: 'ערכה א',
    name_en: 'Kit A',
    components: [{ sku: 'BOLT-10', qty: 2 }],
    pricingMode: 'sum',
  });
  const v2 = bp.defineBundle({
    sku: 'KIT-A',
    name_he: 'ערכה א (חדש)',
    name_en: 'Kit A (new)',
    components: [
      { sku: 'BOLT-10', qty: 2 },
      { sku: 'NUT-10', qty: 2 },
    ],
    pricingMode: 'discount',
    discountPct: 10,
  });
  assert.equal(v1.revision, 1);
  assert.equal(v2.revision, 2);
  const history = bp.getBundleHistory('KIT-A');
  assert.equal(history.length, 2);
  assert.equal(bp.getBundle('KIT-A').revision, 2);
  assert.equal(history[0].components.length, 1);
});

// ---------------------------------------------------------------
//  priceBundle — pricing modes
// ---------------------------------------------------------------
test('pricingMode=sum yields priceNet == Σ standalone', () => {
  const bp = newEngine();
  bp.defineBundle({
    sku: 'KIT-SUM',
    name_he: 'ערכה בסכום',
    name_en: 'Sum kit',
    components: [
      { sku: 'BOLT-10', qty: 2 }, // 2 * 100 = 200
      { sku: 'NUT-10', qty: 2 }, //  2 * 30  =  60
      { sku: 'WASHER-10', qty: 2 }, // 2 * 20 =  40
    ],
    pricingMode: 'sum',
  });
  const r = bp.priceBundle('KIT-SUM', { includeVat: false });
  assert.equal(r.priceNet, 300);
  assert.equal(r.sumOfStandalone, 300);
  assert.equal(r.priceVat, 0);
  assert.equal(r.priceGross, 300);
});

test('pricingMode=fixed yields priceNet == price * qty', () => {
  const bp = newEngine();
  bp.defineBundle({
    sku: 'KIT-FIX',
    name_he: 'ערכה במחיר קבוע',
    name_en: 'Fixed kit',
    components: [
      { sku: 'BOLT-10', qty: 1 },
      { sku: 'NUT-10', qty: 1 },
      { sku: 'WASHER-10', qty: 1 },
    ],
    pricingMode: 'fixed',
    price: 120,
  });
  const r = bp.priceBundle('KIT-FIX', { qty: 3, includeVat: false });
  assert.equal(r.priceNet, 360);
});

test('pricingMode=discount applies discountPct to sum', () => {
  const bp = newEngine();
  bp.defineBundle({
    sku: 'KIT-DISC',
    name_he: 'ערכה בהנחה',
    name_en: 'Discount kit',
    components: [
      { sku: 'BOLT-10', qty: 1 },
      { sku: 'NUT-10', qty: 1 },
      { sku: 'WASHER-10', qty: 1 },
    ],
    pricingMode: 'discount',
    discountPct: 25,
  });
  const r = bp.priceBundle('KIT-DISC', { includeVat: false });
  // sum = 150, 25% off = 112.50
  assert.equal(r.priceNet, 112.5);
});

// ---------------------------------------------------------------
//  allocation sum equals total (core IFRS 15 invariant)
// ---------------------------------------------------------------
test('allocation sum == priceNet for relative / even / weight', () => {
  const methods = ['relative', 'even', 'weight'];
  for (const method of methods) {
    const bp = newEngine();
    bp.defineBundle({
      sku: 'KIT-ALLOC',
      name_he: 'ערכה',
      name_en: 'Kit',
      components: [
        { sku: 'BOLT-10', qty: 3, weight: 5 },
        { sku: 'NUT-10', qty: 3, weight: 3 },
        { sku: 'WASHER-10', qty: 3, weight: 2 },
      ],
      pricingMode: 'discount',
      discountPct: 17, // creates a non-trivial rounding situation
      allocationMethod: method,
    });
    const r = bp.priceBundle('KIT-ALLOC', { qty: 2, includeVat: true });
    const sumAlloc = round2(r.allocations.reduce((s, a) => s + a.revenueNet, 0));
    assert.equal(
      sumAlloc,
      r.priceNet,
      `[${method}] allocation sum ${sumAlloc} != priceNet ${r.priceNet}`
    );
    assert.equal(r.checksum.deltaNet, 0, `[${method}] checksum delta != 0`);
  }
});

test('relative allocation follows standalone proportions', () => {
  const bp = newEngine();
  // sums: 200 + 60 + 40 = 300  → ratios 66.67 : 20 : 13.33
  bp.defineBundle({
    sku: 'KIT-REL',
    name_he: 'ערכה יחסית',
    name_en: 'Relative kit',
    components: [
      { sku: 'BOLT-10', qty: 2 },
      { sku: 'NUT-10', qty: 2 },
      { sku: 'WASHER-10', qty: 2 },
    ],
    pricingMode: 'discount',
    discountPct: 10, // → priceNet = 270
    allocationMethod: 'relative',
  });
  const r = bp.priceBundle('KIT-REL', { includeVat: false });
  // Expected: 270 * (200/300) = 180 ; 270 * (60/300) = 54 ; 270 * (40/300) = 36
  const byS = Object.fromEntries(r.allocations.map(a => [a.sku, a.revenueNet]));
  assert.equal(byS['BOLT-10'], 180);
  assert.equal(byS['NUT-10'], 54);
  assert.equal(byS['WASHER-10'], 36);
});

test('even allocation gives approximately equal split', () => {
  const bp = newEngine();
  bp.defineBundle({
    sku: 'KIT-EVEN',
    name_he: 'ערכה שווה',
    name_en: 'Even kit',
    components: [
      { sku: 'BOLT-10', qty: 1 },
      { sku: 'NUT-10', qty: 1 },
      { sku: 'WASHER-10', qty: 1 },
    ],
    pricingMode: 'fixed',
    price: 100,
    allocationMethod: 'even',
  });
  const r = bp.priceBundle('KIT-EVEN', { includeVat: false });
  // 100 / 3 = 33.33 — each line gets 33.33 or 33.34, sum = 100
  const sum = r.allocations.reduce((s, a) => s + a.revenueNet, 0);
  assert.equal(round2(sum), 100);
  for (const a of r.allocations) {
    assert.ok(
      Math.abs(a.revenueNet - 100 / 3) < 0.02,
      `even line ${a.sku} = ${a.revenueNet}, expected ~33.33`
    );
  }
});

test('weight allocation uses user-supplied weights', () => {
  const bp = newEngine();
  bp.defineBundle({
    sku: 'KIT-W',
    name_he: 'ערכה משקלית',
    name_en: 'Weighted kit',
    components: [
      { sku: 'BOLT-10', qty: 1, weight: 7 },
      { sku: 'NUT-10', qty: 1, weight: 2 },
      { sku: 'WASHER-10', qty: 1, weight: 1 },
    ],
    pricingMode: 'fixed',
    price: 100,
    allocationMethod: 'weight',
  });
  const r = bp.priceBundle('KIT-W', { includeVat: false });
  // 100 * 7/10 = 70, 100 * 2/10 = 20, 100 * 1/10 = 10
  const by = Object.fromEntries(r.allocations.map(a => [a.sku, a.revenueNet]));
  assert.equal(by['BOLT-10'], 70);
  assert.equal(by['NUT-10'], 20);
  assert.equal(by['WASHER-10'], 10);
});

// ---------------------------------------------------------------
//  Israeli VAT + IFRS 15 shape
// ---------------------------------------------------------------
test('Israeli VAT applies to total; per-component allocation is net', () => {
  const bp = newEngine();
  bp.defineBundle({
    sku: 'KIT-VAT',
    name_he: 'ערכה כולל מעמ',
    name_en: 'VAT kit',
    components: [
      { sku: 'BOLT-10', qty: 2 },
      { sku: 'NUT-10', qty: 2 },
      { sku: 'WASHER-10', qty: 2 },
    ],
    pricingMode: 'sum',
  });
  const r = bp.priceBundle('KIT-VAT', { includeVat: true });
  assert.equal(r.priceNet, 300);
  // 18% VAT = 54
  assert.equal(r.priceVat, 54);
  assert.equal(r.priceGross, 354);
  // Component allocations are net-of-VAT and must sum to net price
  const sumNet = round2(r.allocations.reduce((s, a) => s + a.revenueNet, 0));
  assert.equal(sumNet, r.priceNet);
});

test('override vatRate via context', () => {
  const bp = newEngine();
  bp.defineBundle({
    sku: 'KIT-VAT0',
    name_he: 'ערכה פטור',
    name_en: 'Zero VAT kit',
    components: [{ sku: 'BOLT-10', qty: 1 }],
    pricingMode: 'sum',
  });
  const r = bp.priceBundle('KIT-VAT0', { vatRate: 0 });
  assert.equal(r.priceVat, 0);
  assert.equal(r.priceGross, 100);
});

// ---------------------------------------------------------------
//  explode — nested bundle-of-bundles
// ---------------------------------------------------------------
test('explode handles nested bundle-of-bundles and merges duplicates', () => {
  const bp = newEngine();
  bp.defineBundle({
    sku: 'INNER',
    name_he: 'תת-ערכה',
    name_en: 'Inner kit',
    components: [
      { sku: 'BOLT-10', qty: 2 },
      { sku: 'NUT-10', qty: 2 },
    ],
    pricingMode: 'sum',
  });
  bp.defineBundle({
    sku: 'OUTER',
    name_he: 'ערכה מקיפה',
    name_en: 'Outer kit',
    components: [
      { sku: 'INNER', qty: 3 },
      { sku: 'WASHER-10', qty: 4 },
      { sku: 'BOLT-10', qty: 1 }, // duplicate, should merge with INNER's BOLTs
    ],
    pricingMode: 'sum',
  });
  const rows = bp.explode('OUTER', 1);
  const by = Object.fromEntries(rows.map(r => [r.sku, r.qty]));
  // BOLT-10: 3 * 2 + 1 = 7
  // NUT-10:  3 * 2     = 6
  // WASHER-10: 4
  assert.equal(by['BOLT-10'], 7);
  assert.equal(by['NUT-10'], 6);
  assert.equal(by['WASHER-10'], 4);
});

test('priceBundle works for nested bundles (sub-bundle SSP = sum of leaves)', () => {
  const bp = newEngine();
  bp.defineBundle({
    sku: 'INNER',
    name_he: 'פנימי',
    name_en: 'Inner',
    components: [
      { sku: 'BOLT-10', qty: 1 }, // 100
      { sku: 'NUT-10', qty: 1 }, // 30
    ],
    pricingMode: 'sum',
  });
  bp.defineBundle({
    sku: 'OUTER',
    name_he: 'חיצוני',
    name_en: 'Outer',
    components: [
      { sku: 'INNER', qty: 2 }, // 2 × 130 = 260
      { sku: 'WASHER-10', qty: 2 }, // 2 × 20 = 40
    ],
    pricingMode: 'discount',
    discountPct: 10, // → 300 * 0.9 = 270
  });
  const r = bp.priceBundle('OUTER', { includeVat: false });
  assert.equal(r.sumOfStandalone, 300);
  assert.equal(r.priceNet, 270);
  // Allocation sum still == net
  const sum = round2(r.allocations.reduce((s, a) => s + a.revenueNet, 0));
  assert.equal(sum, 270);
});

// ---------------------------------------------------------------
//  availability — min across inventories
// ---------------------------------------------------------------
test('availability = min over components of floor(inventory / per-bundle qty)', () => {
  const bp = newEngine();
  bp.defineBundle({
    sku: 'KIT-AVAIL',
    name_he: 'ערכה',
    name_en: 'Kit',
    components: [
      { sku: 'BOLT-10', qty: 4 }, // inventory 50 → 12
      { sku: 'NUT-10', qty: 4 }, // inventory 60 → 15
      { sku: 'WASHER-10', qty: 10 }, // inventory 40 → 4
    ],
    pricingMode: 'sum',
  });
  assert.equal(bp.availability('KIT-AVAIL'), 4);
});

test('availability with nested bundles multiplies qty along the path', () => {
  const bp = newEngine();
  bp.defineBundle({
    sku: 'INNER',
    name_he: 'פנימי',
    name_en: 'Inner',
    components: [{ sku: 'BOLT-10', qty: 2 }],
    pricingMode: 'sum',
  });
  bp.defineBundle({
    sku: 'OUTER',
    name_he: 'חיצוני',
    name_en: 'Outer',
    components: [
      { sku: 'INNER', qty: 3 }, // needs 6 BOLT-10 per OUTER
      { sku: 'NUT-10', qty: 1 }, // needs 1 NUT-10 per OUTER
    ],
    pricingMode: 'sum',
  });
  // BOLT inv 50 / 6 = 8 ; NUT inv 60 / 1 = 60  → min = 8
  assert.equal(bp.availability('OUTER'), 8);
});

test('availability = 0 when any leaf is out of stock', () => {
  const bp = newEngine();
  bp.setInventory('WASHER-10', 0);
  bp.defineBundle({
    sku: 'KIT-OOS',
    name_he: 'ערכה',
    name_en: 'Kit',
    components: [
      { sku: 'BOLT-10', qty: 1 },
      { sku: 'WASHER-10', qty: 1 },
    ],
    pricingMode: 'sum',
  });
  assert.equal(bp.availability('KIT-OOS'), 0);
});

// ---------------------------------------------------------------
//  validation — circular + orphan
// ---------------------------------------------------------------
test('validateBundle detects circular references', () => {
  const bp = newEngine();
  bp.defineBundle({
    sku: 'A',
    name_he: 'A',
    name_en: 'A',
    components: [{ sku: 'BOLT-10', qty: 1 }],
    pricingMode: 'sum',
  });
  // Before defining the cycle, defineBundle ok. Now define B referencing A,
  // then re-define A to reference B → cycle via append-only revision.
  bp.defineBundle({
    sku: 'B',
    name_he: 'B',
    name_en: 'B',
    components: [{ sku: 'A', qty: 1 }],
    pricingMode: 'sum',
  });
  bp.defineBundle({
    sku: 'A',
    name_he: 'A v2',
    name_en: 'A v2',
    components: [
      { sku: 'BOLT-10', qty: 1 },
      { sku: 'B', qty: 1 }, // cycle: A → B → A
    ],
    pricingMode: 'sum',
  });
  const v = bp.validateBundle('A');
  assert.equal(v.ok, false);
  const hasCycle = v.errors.some(e => e.code === 'CIRCULAR_REFERENCE');
  assert.ok(hasCycle, 'should report CIRCULAR_REFERENCE');
  // pricing refuses broken bundles
  assert.throws(() => bp.priceBundle('A'), /invalid bundle/);
});

test('validateBundle detects orphan components', () => {
  const bp = newEngine();
  bp.defineBundle({
    sku: 'KIT-ORPH',
    name_he: 'ערכה חסרה',
    name_en: 'Orphan kit',
    components: [
      { sku: 'BOLT-10', qty: 1 },
      { sku: 'UNKNOWN-999', qty: 1 }, // orphan
    ],
    pricingMode: 'sum',
  });
  const v = bp.validateBundle('KIT-ORPH');
  assert.equal(v.ok, false);
  const hasOrphan = v.errors.some(e => e.code === 'ORPHAN_COMPONENT' && e.sku === 'UNKNOWN-999');
  assert.ok(hasOrphan, 'should report ORPHAN_COMPONENT for UNKNOWN-999');
});

test('validateBundle is green for a healthy bundle', () => {
  const bp = newEngine();
  bp.defineBundle({
    sku: 'KIT-GOOD',
    name_he: 'ערכה תקינה',
    name_en: 'Good kit',
    components: [
      { sku: 'BOLT-10', qty: 1 },
      { sku: 'NUT-10', qty: 1 },
    ],
    pricingMode: 'sum',
  });
  const v = bp.validateBundle('KIT-GOOD');
  assert.equal(v.ok, true);
  assert.equal(v.errors.length, 0);
});

// ---------------------------------------------------------------
//  maxDepth guard
// ---------------------------------------------------------------
test('maxDepth guard trips on deeply nested bundles', () => {
  const bp = new BundlePricing({ maxDepth: 3 });
  bp.upsertComponent('LEAF', { price: 10 });
  bp.defineBundle({
    sku: 'L1',
    name_he: 'L1',
    name_en: 'L1',
    components: [{ sku: 'LEAF', qty: 1 }],
    pricingMode: 'sum',
  });
  bp.defineBundle({
    sku: 'L2',
    name_he: 'L2',
    name_en: 'L2',
    components: [{ sku: 'L1', qty: 1 }],
    pricingMode: 'sum',
  });
  bp.defineBundle({
    sku: 'L3',
    name_he: 'L3',
    name_en: 'L3',
    components: [{ sku: 'L2', qty: 1 }],
    pricingMode: 'sum',
  });
  bp.defineBundle({
    sku: 'L4',
    name_he: 'L4',
    name_en: 'L4',
    components: [{ sku: 'L3', qty: 1 }],
    pricingMode: 'sum',
  });
  // L4 → L3 → L2 → L1 → LEAF  = depth 4 > maxDepth 3
  assert.throws(() => bp.nestedBundles('L4'), /maxDepth/);
});

// ---------------------------------------------------------------
//  CONSTANTS shape
// ---------------------------------------------------------------
test('CONSTANTS exports required keys', () => {
  assert.equal(CONSTANTS.ISRAELI_VAT_RATE, 0.18);
  assert.deepEqual(Array.from(CONSTANTS.PRICING_MODES), ['sum', 'fixed', 'discount']);
  assert.deepEqual(Array.from(CONSTANTS.ALLOCATION_METHODS), ['relative', 'even', 'weight']);
});
