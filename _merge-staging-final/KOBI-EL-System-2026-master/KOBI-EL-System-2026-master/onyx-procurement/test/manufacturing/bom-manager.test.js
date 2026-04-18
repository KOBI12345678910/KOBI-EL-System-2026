/**
 * BOM Manager — Unit Tests
 * Agent Y-031 / Techno-Kol Uzi Mega-ERP (Kobi 2026)
 *
 * Coverage: createBOM validation, explode correctness (flat + nested +
 * scrap), circular-reference detection, negative qty, where-used
 * (direct + transitive), cost roll-up (material + labor + overhead),
 * revision diff (added/removed/changed), obsolete-preserving-history
 * rule, substituteComponent engineering change, metal-fab scrap defaults,
 * material-cert traceability hook.
 *
 * Run: node --test test/manufacturing/bom-manager.test.js
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const {
  BOMManager,
  DEFAULT_SCRAP_RATES,
  UOMS,
  BOM_STATUS,
  LABELS,
  ECO_STATUS,
  REQUIRED_ECO_ROLES,
  ECO_ROLE_LABELS,
  PHANTOM_FLAG,
  _internals,
} = require('../../src/manufacturing/bom-manager.js');

// ─────────────────────────────────────────────────────────────────────
// Shared fixtures — Israeli metal-fab gate assembly
// ─────────────────────────────────────────────────────────────────────

function seedMetalFab(mgr) {
  // Raw materials — item master
  mgr.upsertItem('STEEL-SHEET-2MM', {
    name_he: 'פח פלדה 2 מ"מ',
    name_en: 'Steel sheet 2mm',
    uom: UOMS.KG,
    standardCost: 48,   // ₪/kg
    certRequired: true,
  });
  mgr.upsertItem('ROD-12MM', {
    name_he: 'מוט פלדה 12 מ"מ',
    name_en: 'Steel rod 12mm',
    uom: UOMS.METER,
    standardCost: 22,
  });
  mgr.upsertItem('TUBE-SQ-40', {
    name_he: 'צינור מרובע 40',
    name_en: 'Square tube 40',
    uom: UOMS.METER,
    standardCost: 65,
  });
  mgr.upsertItem('HINGE-HD', {
    name_he: 'ציר כבד',
    name_en: 'Heavy-duty hinge',
    uom: UOMS.PIECE,
    standardCost: 35,
  });
  mgr.upsertItem('BOLT-M8', {
    name_he: 'בורג M8',
    name_en: 'M8 bolt',
    uom: UOMS.PIECE,
    standardCost: 0.5,
  });
  mgr.upsertItem('PAINT-BLACK', {
    name_he: 'צבע שחור',
    name_en: 'Black paint',
    uom: UOMS.LITER,
    standardCost: 85,
  });

  // Routing for a gate
  mgr.upsertRouting('RTG-GATE', {
    operations: [
      { name: 'חיתוך', type: 'cutting', setupMin: 15, runMinPerUnit: 8, laborRate: 120, overheadRate: 60 },
      { name: 'ריתוך', type: 'welding', setupMin: 10, runMinPerUnit: 25, laborRate: 140, overheadRate: 70 },
      { name: 'צביעה', type: 'painting', setupMin: 5, runMinPerUnit: 10, laborRate: 90, overheadRate: 45 },
    ],
  });

  // Routing for a frame sub-assembly
  mgr.upsertRouting('RTG-FRAME', {
    operations: [
      { name: 'חיתוך', type: 'cutting', setupMin: 10, runMinPerUnit: 4, laborRate: 120, overheadRate: 60 },
      { name: 'ריתוך', type: 'welding', setupMin: 5, runMinPerUnit: 12, laborRate: 140, overheadRate: 70 },
    ],
  });
}

function buildGateBom(mgr, { includeFrame = false } = {}) {
  // Optional frame sub-assembly
  if (includeFrame) {
    mgr.createBOM({
      sku: 'FRAME-01',
      name_he: 'מסגרת שער',
      name_en: 'Gate frame',
      revision: 'A',
      status: BOM_STATUS.ACTIVE,
      routingId: 'RTG-FRAME',
      components: [
        { sku: 'TUBE-SQ-40', qty: 4, uom: UOMS.METER, operation: 'cutting' },
        { sku: 'BOLT-M8', qty: 8, uom: UOMS.PIECE, operation: 'assembly' },
      ],
    });
  }

  return mgr.createBOM({
    sku: 'GATE-01',
    name_he: 'שער פלדה',
    name_en: 'Steel gate',
    revision: 'A',
    status: BOM_STATUS.ACTIVE,
    routingId: 'RTG-GATE',
    components: [
      includeFrame
        ? { sku: 'FRAME-01', qty: 1, uom: UOMS.PIECE, operation: 'assembly' }
        : { sku: 'TUBE-SQ-40', qty: 4, uom: UOMS.METER, operation: 'cutting' },
      { sku: 'STEEL-SHEET-2MM', qty: 18, uom: UOMS.KG, operation: 'cutting', certRequired: true },
      { sku: 'HINGE-HD', qty: 2, uom: UOMS.PIECE, operation: 'assembly' },
      { sku: 'BOLT-M8', qty: 12, uom: UOMS.PIECE, operation: 'assembly' },
      { sku: 'PAINT-BLACK', qty: 0.6, uom: UOMS.LITER, operation: 'painting' },
    ],
  });
}

const near = (a, b, eps = 0.01) => Math.abs(a - b) <= eps;

// ─────────────────────────────────────────────────────────────────────
// 1. createBOM — sanity & validation
// ─────────────────────────────────────────────────────────────────────

describe('createBOM — creation & basic validation', () => {
  test('creates a simple BOM and assigns an id', () => {
    const mgr = new BOMManager();
    seedMetalFab(mgr);
    const bom = buildGateBom(mgr);
    assert.ok(bom.id);
    assert.equal(bom.sku, 'GATE-01');
    assert.equal(bom.revision, 'A');
    assert.equal(bom.components.length, 5);
    assert.equal(mgr.size(), 1);
  });

  test('throws when sku is missing', () => {
    const mgr = new BOMManager();
    assert.throws(() => mgr.createBOM({ components: [] }), /sku is required/);
  });

  test('throws when components is not an array', () => {
    const mgr = new BOMManager();
    assert.throws(
      () => mgr.createBOM({ sku: 'X', components: 'not-an-array' }),
      /components must be an array/,
    );
  });

  test('throws on component missing sku', () => {
    const mgr = new BOMManager();
    assert.throws(
      () => mgr.createBOM({ sku: 'X', components: [{ qty: 1 }] }),
      /missing sku/,
    );
  });

  test('throws on non-finite qty', () => {
    const mgr = new BOMManager();
    assert.throws(
      () => mgr.createBOM({ sku: 'X', components: [{ sku: 'A', qty: 'abc' }] }),
      /qty must be a number/,
    );
  });

  test('rejects self-reference (sku listed as its own component)', () => {
    const mgr = new BOMManager();
    assert.throws(
      () =>
        mgr.createBOM({
          sku: 'X',
          components: [{ sku: 'X', qty: 1, uom: UOMS.PIECE }],
        }),
      /self-reference/,
    );
  });

  test('rejects negative qty', () => {
    const mgr = new BOMManager();
    assert.throws(
      () =>
        mgr.createBOM({
          sku: 'X',
          components: [{ sku: 'A', qty: -5, uom: UOMS.KG }],
        }),
      /non-negative/,
    );
  });

  test('rejects scrap outside [0,1]', () => {
    const mgr = new BOMManager();
    assert.throws(
      () =>
        mgr.createBOM({
          sku: 'X',
          components: [{ sku: 'A', qty: 1, uom: UOMS.KG, scrap: 1.5 }],
        }),
      /scrap must be in/,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────
// 2. validateBOM — circular reference detection
// ─────────────────────────────────────────────────────────────────────

describe('validateBOM — circular reference detection', () => {
  test('detects direct A -> B -> A cycle', () => {
    const mgr = new BOMManager();
    mgr.upsertItem('A', { uom: UOMS.PIECE, standardCost: 10 });
    mgr.upsertItem('B', { uom: UOMS.PIECE, standardCost: 5 });
    // First create B that contains A — fine, no cycle yet.
    mgr.createBOM({
      sku: 'B',
      status: BOM_STATUS.ACTIVE,
      components: [{ sku: 'A', qty: 1, uom: UOMS.PIECE }],
    });
    // Now try to create A that contains B — forms A -> B -> A
    assert.throws(
      () =>
        mgr.createBOM({
          sku: 'A',
          status: BOM_STATUS.ACTIVE,
          components: [{ sku: 'B', qty: 1, uom: UOMS.PIECE }],
        }),
      /circular reference/,
    );
  });

  test('detects transitive A -> B -> C -> A cycle', () => {
    const mgr = new BOMManager();
    mgr.upsertItem('A', { uom: UOMS.PIECE, standardCost: 10 });
    mgr.upsertItem('B', { uom: UOMS.PIECE, standardCost: 5 });
    mgr.upsertItem('C', { uom: UOMS.PIECE, standardCost: 3 });
    mgr.createBOM({
      sku: 'B',
      status: BOM_STATUS.ACTIVE,
      components: [{ sku: 'C', qty: 1, uom: UOMS.PIECE }],
    });
    mgr.createBOM({
      sku: 'C',
      status: BOM_STATUS.ACTIVE,
      components: [{ sku: 'A', qty: 1, uom: UOMS.PIECE }],
    });
    assert.throws(
      () =>
        mgr.createBOM({
          sku: 'A',
          status: BOM_STATUS.ACTIVE,
          components: [{ sku: 'B', qty: 1, uom: UOMS.PIECE }],
        }),
      /circular reference/,
    );
  });

  test('validateBOM returns structured errors/warnings without throwing', () => {
    const mgr = new BOMManager();
    const result = mgr.validateBOM({
      sku: 'X',
      components: [
        { sku: 'A', qty: 1, uom: 'widgets' /* unknown uom */ },
        { sku: 'A', qty: 2, uom: UOMS.KG /* duplicate */ },
        { sku: 'B', qty: 0 /* warn: zero non-optional */ },
      ],
    });
    assert.ok(result.ok, `unexpected errors: ${JSON.stringify(result.errors)}`);
    assert.ok(result.warnings.length >= 2);
  });
});

// ─────────────────────────────────────────────────────────────────────
// 3. explodeBOM — flat correctness + scrap inclusion
// ─────────────────────────────────────────────────────────────────────

describe('explodeBOM — flat BOM scrap-inclusion', () => {
  test('single-level explode yields every leaf once with scrap applied', () => {
    const mgr = new BOMManager();
    seedMetalFab(mgr);
    buildGateBom(mgr); // flat, no frame sub-assembly

    const ex = mgr.explodeBOM('GATE-01', 1);
    assert.equal(ex.parentSku, 'GATE-01');
    assert.equal(ex.parentQty, 1);
    assert.equal(ex.lines.length, 5);

    // Steel sheet: 18 kg × (1 + 0.05 cutting scrap) = 18.9 kg
    const sheet = ex.lines.find(l => l.sku === 'STEEL-SHEET-2MM');
    assert.ok(sheet);
    assert.ok(near(sheet.nominalQty, 18));
    assert.ok(near(sheet.effectiveQty, 18.9));
    assert.equal(sheet.scrap, DEFAULT_SCRAP_RATES.cutting);
    assert.equal(sheet.certRequired, true);

    // Paint: 0.6 × (1 + 0.05 painting scrap) = 0.63
    const paint = ex.lines.find(l => l.sku === 'PAINT-BLACK');
    assert.ok(near(paint.effectiveQty, 0.63));
  });

  test('explode with qty=5 scales nominal and effective linearly', () => {
    const mgr = new BOMManager();
    seedMetalFab(mgr);
    buildGateBom(mgr);

    const ex = mgr.explodeBOM('GATE-01', 5);
    const sheet = ex.lines.find(l => l.sku === 'STEEL-SHEET-2MM');
    assert.equal(sheet.nominalQty, 90);              // 18 × 5
    assert.ok(near(sheet.effectiveQty, 94.5));       // × 1.05

    const totals = ex.totalsByLeaf;
    assert.ok(near(totals['STEEL-SHEET-2MM'].qty, 94.5));
    assert.equal(totals['STEEL-SHEET-2MM'].uom, UOMS.KG);
    assert.equal(totals['BOLT-M8'].qty, 60);         // assembly op → scrap 0
  });

  test('component-row scrap override wins over operation default', () => {
    const mgr = new BOMManager();
    mgr.upsertItem('A', { uom: UOMS.KG, standardCost: 10 });
    mgr.createBOM({
      sku: 'P',
      status: BOM_STATUS.ACTIVE,
      components: [
        { sku: 'A', qty: 10, uom: UOMS.KG, operation: 'cutting', scrap: 0.2 },
      ],
    });
    const ex = mgr.explodeBOM('P', 1);
    // 10 × (1 + 0.2) = 12  — NOT 10 × 1.05
    assert.ok(near(ex.lines[0].effectiveQty, 12));
    assert.equal(ex.lines[0].scrap, 0.2);
  });
});

// ─────────────────────────────────────────────────────────────────────
// 4. explodeBOM — nested sub-assemblies
// ─────────────────────────────────────────────────────────────────────

describe('explodeBOM — nested sub-assemblies', () => {
  test('recurses into FRAME-01 and produces raw-material totals', () => {
    const mgr = new BOMManager();
    seedMetalFab(mgr);
    buildGateBom(mgr, { includeFrame: true });

    const ex = mgr.explodeBOM('GATE-01', 1);
    // Expect depth to reach level 2 (gate -> frame -> tube)
    assert.ok(ex.depth >= 2);

    // TUBE-SQ-40 only appears inside FRAME-01. Raw total:
    //   4 meters × (1 + 0.05 cutting scrap) = 4.2
    const totals = ex.totalsByLeaf;
    assert.ok(near(totals['TUBE-SQ-40'].qty, 4.2));
    assert.equal(totals['TUBE-SQ-40'].uom, UOMS.METER);

    // BOLT-M8 appears both in GATE (12) and FRAME (8) — should aggregate
    //   12 (assembly scrap 0) + 8 (assembly scrap 0) = 20
    assert.equal(totals['BOLT-M8'].qty, 20);

    // FRAME-01 itself must NOT appear in the raw-leaf totals because it
    // has its own BOM — explode must push past it.
    assert.equal(totals['FRAME-01'], undefined);
  });

  test('circular reference in store is caught at explode time even if validateBOM skipped', () => {
    const mgr = new BOMManager();
    mgr.upsertItem('A', { uom: UOMS.PIECE, standardCost: 1 });
    mgr.upsertItem('B', { uom: UOMS.PIECE, standardCost: 1 });
    // Force a cycle by monkey-patching the store past validation.
    const bomA = mgr.createBOM({
      sku: 'A',
      status: BOM_STATUS.ACTIVE,
      components: [{ sku: 'B', qty: 1, uom: UOMS.PIECE }],
    });
    // Circumvent validateBOM by directly mutating store. This simulates
    // bad data loaded from a legacy system.
    bomA.components.push({
      sku: 'A',        // self-cycle
      qty: 1,
      uom: UOMS.PIECE,
      scrap: null,
      operation: null,
      isOptional: false,
      alternatives: [],
      certRequired: false,
      notes: '',
      materialCert: null,
    });
    assert.throws(() => mgr.explodeBOM('A', 1), /circular reference/);
  });
});

// ─────────────────────────────────────────────────────────────────────
// 5. costRollup
// ─────────────────────────────────────────────────────────────────────

describe('costRollup — material + labor + overhead', () => {
  test('flat BOM material cost uses effective qty', () => {
    const mgr = new BOMManager();
    seedMetalFab(mgr);
    buildGateBom(mgr);

    const cost = mgr.costRollup('GATE-01', 1);
    assert.equal(cost.sku, 'GATE-01');
    assert.ok(cost.material > 0);
    assert.ok(cost.labor > 0);
    assert.ok(cost.overhead > 0);
    assert.equal(
      cost.total,
      _internals.round2(cost.material + cost.labor + cost.overhead),
    );

    // Expected material ≈
    //   TUBE 4m × 65 × (1 + 0.05) = 273
    //   SHEET 18kg × 48 × 1.05    = 907.2
    //   HINGE 2 × 35              = 70  (assembly scrap 0)
    //   BOLT  12 × 0.5            = 6
    //   PAINT 0.6 × 85 × 1.05     = 53.55
    //   → 1309.75
    assert.ok(near(cost.material, 1309.75, 0.5));

    // Labor for gate routing — (15+8) + (10+25) + (5+10) = 73 min = 1.2167h
    //   across three ops with different rates; we just check it's > 0.
    assert.ok(cost.labor > 50);
  });

  test('reports missing standard costs without throwing', () => {
    const mgr = new BOMManager();
    mgr.upsertItem('A', { uom: UOMS.KG }); // no standardCost
    mgr.createBOM({
      sku: 'P',
      status: BOM_STATUS.ACTIVE,
      components: [{ sku: 'A', qty: 5, uom: UOMS.KG }],
    });
    const cost = mgr.costRollup('P', 1);
    assert.equal(cost.material, 0);
    assert.deepEqual(cost.missingCosts, ['A']);
  });

  test('sub-assembly routing is rolled into the parent cost', () => {
    const mgr = new BOMManager();
    seedMetalFab(mgr);
    buildGateBom(mgr, { includeFrame: true });

    const cost = mgr.costRollup('GATE-01', 1);
    // At least two routings were visited (gate + frame)
    assert.ok(cost.routingsUsed.length >= 2);
  });
});

// ─────────────────────────────────────────────────────────────────────
// 6. whereUsed — reverse lookup
// ─────────────────────────────────────────────────────────────────────

describe('whereUsed — reverse lookup', () => {
  test('direct lookup finds all BOMs using BOLT-M8', () => {
    const mgr = new BOMManager();
    seedMetalFab(mgr);
    buildGateBom(mgr, { includeFrame: true });

    const direct = mgr.whereUsed('BOLT-M8');
    assert.equal(direct.length, 2);
    const parents = direct.map(d => d.parentSku).sort();
    assert.deepEqual(parents, ['FRAME-01', 'GATE-01']);
    for (const row of direct) {
      assert.ok(row.bomId);
      assert.ok(row.revision);
    }
  });

  test('transitive lookup surfaces grand-parents', () => {
    const mgr = new BOMManager();
    mgr.upsertItem('RAW', { uom: UOMS.KG, standardCost: 10 });
    mgr.upsertItem('SUB', { uom: UOMS.PIECE, standardCost: 50 });
    mgr.upsertItem('TOP', { uom: UOMS.PIECE, standardCost: 200 });
    mgr.createBOM({
      sku: 'SUB',
      status: BOM_STATUS.ACTIVE,
      components: [{ sku: 'RAW', qty: 1, uom: UOMS.KG }],
    });
    mgr.createBOM({
      sku: 'TOP',
      status: BOM_STATUS.ACTIVE,
      components: [{ sku: 'SUB', qty: 1, uom: UOMS.PIECE }],
    });

    const result = mgr.whereUsed('RAW', { transitive: true });
    assert.equal(result.direct.length, 1);
    assert.equal(result.direct[0].parentSku, 'SUB');
    // transitive should include TOP via SUB
    assert.ok(result.transitive.find(r => r.parentSku === 'TOP'));
  });

  test('filter out obsolete revisions when requested', () => {
    const mgr = new BOMManager();
    mgr.upsertItem('RAW', { uom: UOMS.KG, standardCost: 10 });
    const first = mgr.createBOM({
      sku: 'P',
      status: BOM_STATUS.ACTIVE,
      components: [{ sku: 'RAW', qty: 1, uom: UOMS.KG }],
    });
    const second = mgr.createBOM({
      sku: 'P',
      revision: 'B',
      status: BOM_STATUS.ACTIVE,
      components: [{ sku: 'RAW', qty: 2, uom: UOMS.KG }],
    });
    mgr.obsoleteRevision(first.id, second.id);

    // includeObsolete default: shows both
    const all = mgr.whereUsed('RAW');
    assert.equal(all.length, 2);

    // filtered: only active
    const onlyActive = mgr.whereUsed('RAW', { includeObsolete: false });
    assert.equal(onlyActive.length, 1);
    assert.equal(onlyActive[0].revision, 'B');
  });
});

// ─────────────────────────────────────────────────────────────────────
// 7. compareBOMs — revision diff
// ─────────────────────────────────────────────────────────────────────

describe('compareBOMs — revision diff', () => {
  test('added / removed / changed partition is correct', () => {
    const mgr = new BOMManager();
    mgr.upsertItem('A', { uom: UOMS.KG, standardCost: 10 });
    mgr.upsertItem('B', { uom: UOMS.KG, standardCost: 20 });
    mgr.upsertItem('C', { uom: UOMS.KG, standardCost: 30 });
    mgr.upsertItem('D', { uom: UOMS.KG, standardCost: 40 });

    mgr.createBOM({
      sku: 'P',
      revision: 'A',
      status: BOM_STATUS.ACTIVE,
      components: [
        { sku: 'A', qty: 1, uom: UOMS.KG },
        { sku: 'B', qty: 2, uom: UOMS.KG },
        { sku: 'C', qty: 3, uom: UOMS.KG },
      ],
    });
    mgr.createBOM({
      sku: 'P',
      revision: 'B',
      status: BOM_STATUS.ACTIVE,
      components: [
        { sku: 'A', qty: 1, uom: UOMS.KG },      // unchanged
        { sku: 'B', qty: 5, uom: UOMS.KG },      // changed qty
        // C removed
        { sku: 'D', qty: 2, uom: UOMS.KG },      // added
      ],
    });

    const diff = mgr.compareBOMs('P', 'A', 'B');
    assert.equal(diff.summary.addedCount, 1);
    assert.equal(diff.summary.removedCount, 1);
    assert.equal(diff.summary.changedCount, 1);
    assert.equal(diff.summary.unchangedCount, 1);

    assert.equal(diff.added[0].sku, 'D');
    assert.equal(diff.removed[0].sku, 'C');
    const changedB = diff.changed.find(c => c.sku === 'B');
    assert.ok(changedB);
    assert.deepEqual(changedB.diff.qty, { from: 2, to: 5 });
  });

  test('throws on unknown revision', () => {
    const mgr = new BOMManager();
    mgr.upsertItem('A', { uom: UOMS.KG, standardCost: 10 });
    mgr.createBOM({ sku: 'P', revision: 'A', components: [{ sku: 'A', qty: 1, uom: UOMS.KG }] });
    assert.throws(() => mgr.compareBOMs('P', 'A', 'Z'), /cannot find revision/);
  });
});

// ─────────────────────────────────────────────────────────────────────
// 8. obsoleteRevision — NEVER delete
// ─────────────────────────────────────────────────────────────────────

describe('obsoleteRevision — preserve history', () => {
  test('obsolete revision stays in store with status flipped', () => {
    const mgr = new BOMManager();
    mgr.upsertItem('A', { uom: UOMS.KG, standardCost: 10 });
    const first = mgr.createBOM({
      sku: 'P',
      revision: 'A',
      status: BOM_STATUS.ACTIVE,
      components: [{ sku: 'A', qty: 1, uom: UOMS.KG }],
    });
    const second = mgr.createBOM({
      sku: 'P',
      revision: 'B',
      status: BOM_STATUS.ACTIVE,
      components: [{ sku: 'A', qty: 2, uom: UOMS.KG }],
    });
    const before = mgr.size();
    mgr.obsoleteRevision(first.id, second.id);
    // Count unchanged (no delete!)
    assert.equal(mgr.size(), before);

    const oldRec = mgr.getBOM(first.id);
    assert.ok(oldRec, 'old revision must still be retrievable');
    assert.equal(oldRec.status, BOM_STATUS.OBSOLETE);
    assert.equal(oldRec.supersededBy, second.id);
    assert.ok(oldRec.endDate);
    // History entry logged
    assert.ok(oldRec.history.find(h => h.action === 'obsolete'));

    const newRec = mgr.getBOM(second.id);
    assert.equal(newRec.supersedes, first.id);
  });

  test('refuses to obsolete with replacement for a different sku', () => {
    const mgr = new BOMManager();
    mgr.upsertItem('A', { uom: UOMS.KG, standardCost: 10 });
    const p1 = mgr.createBOM({ sku: 'P1', components: [{ sku: 'A', qty: 1, uom: UOMS.KG }] });
    const p2 = mgr.createBOM({ sku: 'P2', components: [{ sku: 'A', qty: 1, uom: UOMS.KG }] });
    assert.throws(() => mgr.obsoleteRevision(p1.id, p2.id), /is for sku P2, not P1/);
  });
});

// ─────────────────────────────────────────────────────────────────────
// 9. substituteComponent — engineering change
// ─────────────────────────────────────────────────────────────────────

describe('substituteComponent — engineering change', () => {
  test('creates a new revision and obsoletes the old one', () => {
    const mgr = new BOMManager();
    mgr.upsertItem('OLD-BOLT', { uom: UOMS.PIECE, standardCost: 0.4 });
    mgr.upsertItem('NEW-BOLT', { uom: UOMS.PIECE, standardCost: 0.5 });
    const first = mgr.createBOM({
      sku: 'P',
      revision: 'A',
      status: BOM_STATUS.ACTIVE,
      components: [{ sku: 'OLD-BOLT', qty: 10, uom: UOMS.PIECE }],
    });

    const { oldBom, newBom } = mgr.substituteComponent(first.id, 'OLD-BOLT', 'NEW-BOLT');
    assert.equal(oldBom.id, first.id);
    assert.equal(oldBom.status, BOM_STATUS.OBSOLETE);
    assert.equal(oldBom.supersededBy, newBom.id);

    assert.equal(newBom.revision, 'B');
    assert.equal(newBom.status, BOM_STATUS.ACTIVE);
    const newComp = newBom.components.find(c => c.sku === 'NEW-BOLT');
    assert.ok(newComp);
    assert.equal(newComp.qty, 10); // preserved
    assert.ok(newComp.alternatives.includes('OLD-BOLT'), 'old sku should become an alternate');
  });

  test('substitution honors qty / uom overrides', () => {
    const mgr = new BOMManager();
    mgr.upsertItem('OLD', { uom: UOMS.KG, standardCost: 10 });
    mgr.upsertItem('NEW', { uom: UOMS.KG, standardCost: 12 });
    const first = mgr.createBOM({
      sku: 'P',
      components: [{ sku: 'OLD', qty: 5, uom: UOMS.KG }],
    });
    const { newBom } = mgr.substituteComponent(first.id, 'OLD', 'NEW', null, { qty: 8 });
    assert.equal(newBom.components[0].qty, 8);
  });

  test('throws when oldSku not present', () => {
    const mgr = new BOMManager();
    mgr.upsertItem('A', { uom: UOMS.PIECE, standardCost: 1 });
    const b = mgr.createBOM({ sku: 'P', components: [{ sku: 'A', qty: 1, uom: UOMS.PIECE }] });
    assert.throws(() => mgr.substituteComponent(b.id, 'ZZZ', 'A'), /not in BOM/);
  });
});

// ─────────────────────────────────────────────────────────────────────
// 10. Metal-fab specifics — defaults, cert traceability
// ─────────────────────────────────────────────────────────────────────

describe('metal-fab specifics', () => {
  test('DEFAULT_SCRAP_RATES has all required ops', () => {
    const required = ['cutting', 'welding', 'bending'];
    for (const op of required) {
      assert.ok(op in DEFAULT_SCRAP_RATES, `missing scrap for ${op}`);
    }
    assert.equal(DEFAULT_SCRAP_RATES.cutting, 0.05);
    assert.equal(DEFAULT_SCRAP_RATES.welding, 0.02);
    assert.equal(DEFAULT_SCRAP_RATES.bending, 0.03);
  });

  test('attachMaterialCert appends to history', () => {
    const mgr = new BOMManager();
    seedMetalFab(mgr);
    const bom = buildGateBom(mgr);
    const entry = mgr.attachMaterialCert(bom.id, 'STEEL-SHEET-2MM', {
      lotId: 'LOT-2026-0412-001',
      heatNumber: 'HT-884511',
      millCert: 'https://mill.example/cert/884511.pdf',
    });
    assert.equal(entry.sku, 'STEEL-SHEET-2MM');
    const stored = mgr.getBOM(bom.id);
    assert.ok(stored.history.find(h => h.action === 'cert-attach'));
  });

  test('attachMaterialCert throws when cert is empty', () => {
    const mgr = new BOMManager();
    seedMetalFab(mgr);
    const bom = buildGateBom(mgr);
    assert.throws(
      () => mgr.attachMaterialCert(bom.id, 'STEEL-SHEET-2MM', {}),
      /cert must include/,
    );
  });

  test('bilingual labels contain Hebrew for core terms', () => {
    assert.equal(LABELS.he.bom, 'עץ מוצר');
    assert.equal(LABELS.he.whereUsed, 'היכן משמש');
    assert.equal(LABELS.he.costRollup, 'גלגול עלות');
  });

  test('UOMs include kg/meter/piece required for metal-fab', () => {
    assert.equal(UOMS.KG, 'kg');
    assert.equal(UOMS.METER, 'meter');
    assert.equal(UOMS.PIECE, 'piece');
  });
});

// ─────────────────────────────────────────────────────────────────────
// 11. Edge cases & depth guard
// ─────────────────────────────────────────────────────────────────────

describe('edge cases', () => {
  test('explode with qty=0 returns zero leaves', () => {
    const mgr = new BOMManager();
    seedMetalFab(mgr);
    buildGateBom(mgr);
    const ex = mgr.explodeBOM('GATE-01', 0);
    for (const info of Object.values(ex.totalsByLeaf)) {
      assert.equal(info.qty, 0);
    }
  });

  test('explode of unknown sku yields itself as leaf', () => {
    const mgr = new BOMManager();
    const ex = mgr.explodeBOM('UNKNOWN', 10);
    assert.equal(ex.lines.length, 0);
    assert.equal(ex.totalsByLeaf['UNKNOWN'].qty, 10);
  });

  test('explode negative qty throws', () => {
    const mgr = new BOMManager();
    seedMetalFab(mgr);
    buildGateBom(mgr);
    assert.throws(() => mgr.explodeBOM('GATE-01', -1), /non-negative/);
  });

  test('listBOMs filters by status', () => {
    const mgr = new BOMManager();
    mgr.upsertItem('A', { uom: UOMS.KG, standardCost: 1 });
    const b1 = mgr.createBOM({
      sku: 'P',
      revision: 'A',
      status: BOM_STATUS.ACTIVE,
      components: [{ sku: 'A', qty: 1, uom: UOMS.KG }],
    });
    const b2 = mgr.createBOM({
      sku: 'P',
      revision: 'B',
      status: BOM_STATUS.ACTIVE,
      components: [{ sku: 'A', qty: 2, uom: UOMS.KG }],
    });
    mgr.obsoleteRevision(b1.id, b2.id);
    const active = mgr.listBOMs({ status: BOM_STATUS.ACTIVE });
    const obsolete = mgr.listBOMs({ status: BOM_STATUS.OBSOLETE });
    assert.equal(active.length, 1);
    assert.equal(obsolete.length, 1);
  });

  test('audit trail accumulates every mutation', () => {
    const mgr = new BOMManager();
    mgr.upsertItem('A', { uom: UOMS.KG, standardCost: 1 });
    const b1 = mgr.createBOM({ sku: 'P', components: [{ sku: 'A', qty: 1, uom: UOMS.KG }] });
    const b2 = mgr.createBOM({ sku: 'P', revision: 'B', components: [{ sku: 'A', qty: 2, uom: UOMS.KG }] });
    mgr.obsoleteRevision(b1.id, b2.id);
    const audit = mgr.getAuditTrail();
    assert.ok(audit.length >= 3);
    assert.equal(audit[0].action, 'create');
  });
});

// ═════════════════════════════════════════════════════════════════════
// 2026-04 GROW — Y-031 spec extension tests (24 tests, ≥22 required)
// ═════════════════════════════════════════════════════════════════════
//
// Coverage matrix:
//   1. defineBOM happy path                       ✓
//   2. defineBOM scrap% normalization (>1 → /100) ✓
//   3. defineBOM rejects duplicate (part,rev)     ✓
//   4. defineBOM stores effectivity envelope      ✓
//   5. explode with rev pin                       ✓
//   6. explode multi-level nested                 ✓
//   7. explode scrap factor across levels         ✓
//   8. implode where-used direct                  ✓
//   9. implode where-used transitive              ✓
//  10. compareBOMs diff (added/removed/changed)   ✓
//  11. costRollup material+labor+overhead         ✓
//  12. costedBOM line-by-line ext cost            ✓
//  13. costedBOM falls back to standardCost       ✓
//  14. availabilityCheck shortages                ✓
//  15. availabilityCheck OK when stocked          ✓
//  16. ecoRequest happy path                      ✓
//  17. ecoRequest validates inputs                ✓
//  18. approveEco dual-approval flow              ✓
//  19. approveEco rejects on any reject decision  ✓
//  20. approveEco unknown role throws             ✓
//  21. ECO append-only — cancel preserves record  ✓
//  22. circular reference detection (Y-031)       ✓
//  23. phantomBOM transparent pass-through        ✓
//  24. effectivity-date filtering                 ✓
//  25. alternateGroup lookup                      ✓
//  26. validateBOM scrap% in [0,100]              ✓

// ─────────────────────────────────────────────────────────────────────
// Y-031 fixture — multi-level metal-fab gate with frame sub-assembly
// ─────────────────────────────────────────────────────────────────────

function buildY031Gate(mgr) {
  // Item master
  mgr.upsertItem('STEEL-SHEET-2MM', { name_he: 'פח 2 מ"מ', uom: UOMS.KG, standardCost: 48 });
  mgr.upsertItem('TUBE-SQ-40',      { name_he: 'צינור 40', uom: UOMS.METER, standardCost: 65 });
  mgr.upsertItem('HINGE-HD',        { name_he: 'ציר כבד',  uom: UOMS.PIECE, standardCost: 35 });
  mgr.upsertItem('BOLT-M8',         { name_he: 'בורג M8', uom: UOMS.PIECE, standardCost: 0.5 });
  mgr.upsertItem('PAINT-BLACK',     { name_he: 'צבע שחור', uom: UOMS.LITER, standardCost: 85 });

  // Frame sub-assembly (Y-031 spec items[]).
  // Explicit scrap=0 on assembly rows so behavior is deterministic across
  // operations regardless of DEFAULT_SCRAP_RATES.default fallback.
  mgr.defineBOM({
    partNumber: 'FRAME-Y031',
    rev: 'A',
    name_he: 'מסגרת שער',
    name_en: 'Gate frame',
    status: BOM_STATUS.ACTIVE,
    items: [
      { childPart: 'TUBE-SQ-40', qty: 4, uom: UOMS.METER, scrap: 5,  level: 2, alternateGroup: 'TUBES',
        effectivityFrom: '2026-01-01', effectivityTo: '2026-12-31' },
      { childPart: 'BOLT-M8', qty: 8, uom: UOMS.PIECE, scrap: 0, level: 2 },
    ],
  });

  // Top gate. Phantom assemblies & non-fab items use scrap=0 so the tests
  // can express deterministic raw-leaf totals.
  return mgr.defineBOM({
    partNumber: 'GATE-Y031',
    rev: 'A',
    name_he: 'שער פלדה',
    name_en: 'Steel gate',
    status: BOM_STATUS.ACTIVE,
    items: [
      { childPart: 'FRAME-Y031',      qty: 1,  uom: UOMS.PIECE, scrap: 0, level: 1 },
      { childPart: 'STEEL-SHEET-2MM', qty: 18, uom: UOMS.KG,    scrap: 5, level: 1, alternateGroup: 'SHEETS' },
      { childPart: 'HINGE-HD',        qty: 2,  uom: UOMS.PIECE, scrap: 0, level: 1 },
      { childPart: 'BOLT-M8',         qty: 12, uom: UOMS.PIECE, scrap: 0, level: 1 },
      { childPart: 'PAINT-BLACK',     qty: 0.6, uom: UOMS.LITER, scrap: 5, level: 1 },
    ],
  });
}

// ─────────────────────────────────────────────────────────────────────
// Y-031 / 1. defineBOM — happy path & spec compliance
// ─────────────────────────────────────────────────────────────────────

describe('Y-031 defineBOM — spec shape', () => {
  test('defineBOM accepts partNumber/rev/items shape and stores correctly', () => {
    const mgr = new BOMManager();
    buildY031Gate(mgr);
    const gate = mgr.findBOM('GATE-Y031', 'A');
    assert.ok(gate);
    assert.equal(gate.sku, 'GATE-Y031');
    assert.equal(gate.revision, 'A');
    assert.equal(gate.components.length, 5);
    // Y-031 fields preserved on rows
    const sheet = gate.components.find(c => c.sku === 'STEEL-SHEET-2MM');
    assert.equal(sheet.alternateGroup, 'SHEETS');
    assert.equal(sheet.level, 1);
  });

  test('defineBOM normalizes scrap% in [0,100] to fraction', () => {
    const mgr = new BOMManager();
    mgr.upsertItem('A', { uom: UOMS.KG, standardCost: 10 });
    const bom = mgr.defineBOM({
      partNumber: 'P',
      rev: 'A',
      items: [{ childPart: 'A', qty: 10, uom: UOMS.KG, scrap: 20 /* 20% */ }],
    });
    assert.equal(bom.components[0].scrap, 0.2);
  });

  test('defineBOM rejects scrap% out of [0,100]', () => {
    const mgr = new BOMManager();
    mgr.upsertItem('A', { uom: UOMS.KG, standardCost: 10 });
    assert.throws(
      () => mgr.defineBOM({ partNumber: 'P', items: [{ childPart: 'A', qty: 1, uom: UOMS.KG, scrap: 150 }] }),
      /scrap% must be in/,
    );
  });

  test('defineBOM rejects duplicate (partNumber, rev) — bump rev to upgrade', () => {
    const mgr = new BOMManager();
    mgr.upsertItem('A', { uom: UOMS.KG, standardCost: 10 });
    mgr.defineBOM({ partNumber: 'P', rev: 'A', items: [{ childPart: 'A', qty: 1, uom: UOMS.KG }] });
    assert.throws(
      () => mgr.defineBOM({ partNumber: 'P', rev: 'A', items: [{ childPart: 'A', qty: 2, uom: UOMS.KG }] }),
      /already exists/,
    );
  });

  test('defineBOM bubbles row-level effectivity to BOM envelope', () => {
    const mgr = new BOMManager();
    mgr.upsertItem('A', { uom: UOMS.KG, standardCost: 10 });
    const bom = mgr.defineBOM({
      partNumber: 'P',
      rev: 'A',
      items: [
        { childPart: 'A', qty: 1, uom: UOMS.KG, effectivityFrom: '2026-03-01', effectivityTo: '2026-08-31' },
      ],
    });
    assert.equal(bom.effectiveDate, '2026-03-01');
    assert.equal(bom.endDate, '2026-08-31');
  });
});

// ─────────────────────────────────────────────────────────────────────
// Y-031 / 2. explode (rev-pinned, multi-level, scrap)
// ─────────────────────────────────────────────────────────────────────

describe('Y-031 explode — rev-pinned multi-level', () => {
  test('explode(part, rev, qty) recurses through frame sub-assembly', () => {
    const mgr = new BOMManager();
    buildY031Gate(mgr);
    const ex = mgr.explode('GATE-Y031', 'A', 1);
    assert.equal(ex.parentSku, 'GATE-Y031');
    assert.equal(ex.parentRev, 'A');
    assert.ok(ex.depth >= 2);
    // TUBE-SQ-40 is only inside FRAME-Y031 — must surface in raw totals.
    assert.ok(ex.totalsByLeaf['TUBE-SQ-40']);
    // 4m × (1 + 0.05) = 4.2
    assert.ok(Math.abs(ex.totalsByLeaf['TUBE-SQ-40'].qty - 4.2) < 0.0001);
  });

  test('explode applies scrap factor across every level', () => {
    const mgr = new BOMManager();
    buildY031Gate(mgr);
    const ex = mgr.explode('GATE-Y031', 'A', 5);
    // Sheet: 18kg × 5 × 1.05 = 94.5
    assert.ok(Math.abs(ex.totalsByLeaf['STEEL-SHEET-2MM'].qty - 94.5) < 0.0001);
    // Tube: 4m × 5 × 1.05 = 21
    assert.ok(Math.abs(ex.totalsByLeaf['TUBE-SQ-40'].qty - 21) < 0.0001);
    // Bolts (no scrap): 12 + 8 = 20 per gate × 5 = 100
    assert.equal(ex.totalsByLeaf['BOLT-M8'].qty, 100);
  });

  test('explode throws when partNumber+rev not found', () => {
    const mgr = new BOMManager();
    buildY031Gate(mgr);
    assert.throws(() => mgr.explode('GATE-Y031', 'Z', 1), /not found/);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Y-031 / 3. implode (where-used reverse lookup)
// ─────────────────────────────────────────────────────────────────────

describe('Y-031 implode — reverse lookup', () => {
  test('implode finds direct parents of a child part', () => {
    const mgr = new BOMManager();
    buildY031Gate(mgr);
    const result = mgr.implode('BOLT-M8');
    assert.equal(result.childPart, 'BOLT-M8');
    const parents = result.direct.map(d => d.parentSku).sort();
    assert.deepEqual(parents, ['FRAME-Y031', 'GATE-Y031']);
  });

  test('implode includes transitive grand-parents by default', () => {
    const mgr = new BOMManager();
    buildY031Gate(mgr);
    const result = mgr.implode('TUBE-SQ-40');
    // direct: FRAME-Y031
    assert.equal(result.direct[0].parentSku, 'FRAME-Y031');
    // transitive: GATE-Y031 via FRAME-Y031
    const transParents = result.transitive.map(t => t.parentSku);
    assert.ok(transParents.includes('GATE-Y031'));
  });
});

// ─────────────────────────────────────────────────────────────────────
// Y-031 / 4. compareBOMs diff for ECO review
// ─────────────────────────────────────────────────────────────────────

describe('Y-031 compareBOMs — diff', () => {
  test('compareBOMs surfaces added/removed/changed for ECO review', () => {
    const mgr = new BOMManager();
    mgr.upsertItem('A', { uom: UOMS.KG, standardCost: 10 });
    mgr.upsertItem('B', { uom: UOMS.KG, standardCost: 20 });
    mgr.upsertItem('C', { uom: UOMS.KG, standardCost: 30 });
    mgr.defineBOM({
      partNumber: 'P', rev: 'A', status: BOM_STATUS.ACTIVE,
      items: [
        { childPart: 'A', qty: 1, uom: UOMS.KG },
        { childPart: 'B', qty: 2, uom: UOMS.KG },
      ],
    });
    mgr.defineBOM({
      partNumber: 'P', rev: 'B', status: BOM_STATUS.ACTIVE,
      items: [
        { childPart: 'A', qty: 1, uom: UOMS.KG },   // unchanged
        { childPart: 'B', qty: 5, uom: UOMS.KG },   // changed qty
        { childPart: 'C', qty: 1, uom: UOMS.KG },   // added
      ],
    });
    const diff = mgr.compareBOMs('P', 'A', 'B');
    assert.equal(diff.summary.addedCount, 1);
    assert.equal(diff.summary.changedCount, 1);
    assert.equal(diff.summary.unchangedCount, 1);
    assert.equal(diff.added[0].sku, 'C');
    assert.equal(diff.changed[0].sku, 'B');
  });
});

// ─────────────────────────────────────────────────────────────────────
// Y-031 / 5. costRollup & costedBOM
// ─────────────────────────────────────────────────────────────────────

describe('Y-031 cost rollup & costedBOM', () => {
  test('costRollup totals material from priceMap-style standard costs', () => {
    const mgr = new BOMManager();
    buildY031Gate(mgr);
    const cost = mgr.costRollup('GATE-Y031', 1);
    assert.ok(cost.material > 0);
    // Material expected ≈
    //   TUBE 4×65×1.05      = 273
    //   SHEET 18×48×1.05    = 907.2
    //   HINGE 2×35          = 70
    //   BOLT (12+8)×0.5     = 10
    //   PAINT 0.6×85×1.05   = 53.55
    //   → 1313.75
    assert.ok(Math.abs(cost.material - 1313.75) < 0.5);
  });

  test('costedBOM emits per-line ext cost from a priceMap', () => {
    const mgr = new BOMManager();
    buildY031Gate(mgr);
    const priceMap = {
      'STEEL-SHEET-2MM': 50,
      'TUBE-SQ-40':       70,
      'HINGE-HD':         40,
      'BOLT-M8':           1,
      'PAINT-BLACK':      90,
    };
    const out = mgr.costedBOM('GATE-Y031', 'A', priceMap);
    assert.equal(out.partNumber, 'GATE-Y031');
    // Sheet line: 18 × 1.05 × 50 = 945
    const sheetLine = out.lines.find(l => l.sku === 'STEEL-SHEET-2MM' && l.isLeaf);
    assert.ok(sheetLine);
    assert.equal(sheetLine.unitPrice, 50);
    assert.ok(Math.abs(sheetLine.extCost - 945) < 0.01);
    assert.ok(out.totalCost > 1300);
    assert.equal(out.missingPrices.length, 0);
  });

  test('costedBOM falls back to item-master standardCost when priceMap missing', () => {
    const mgr = new BOMManager();
    buildY031Gate(mgr);
    // priceMap has only one entry; the rest must fall back to standardCost.
    const out = mgr.costedBOM('GATE-Y031', 'A', { 'STEEL-SHEET-2MM': 60 });
    const sheet = out.lines.find(l => l.sku === 'STEEL-SHEET-2MM' && l.isLeaf);
    assert.equal(sheet.unitPrice, 60);
    const tube = out.lines.find(l => l.sku === 'TUBE-SQ-40' && l.isLeaf);
    assert.equal(tube.unitPrice, 65); // from item master
    assert.equal(out.missingPrices.length, 0);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Y-031 / 6. availabilityCheck — shortages
// ─────────────────────────────────────────────────────────────────────

describe('Y-031 availabilityCheck — shortages list', () => {
  test('shortages reported when inventory < demand', () => {
    const mgr = new BOMManager();
    buildY031Gate(mgr);
    const inv = {
      'STEEL-SHEET-2MM': 5,    // need 18.9 → short
      'TUBE-SQ-40':       4.2, // exact
      'HINGE-HD':         2,   // exact
      'BOLT-M8':         50,   // surplus
      'PAINT-BLACK':      0.1, // short
    };
    const result = mgr.availabilityCheck('GATE-Y031', 'A', 1, inv);
    assert.equal(result.ok, false);
    const shortSkus = result.shortages.map(s => s.sku).sort();
    assert.deepEqual(shortSkus, ['PAINT-BLACK', 'STEEL-SHEET-2MM']);
    const sheet = result.shortages.find(s => s.sku === 'STEEL-SHEET-2MM');
    assert.ok(Math.abs(sheet.short - 13.9) < 0.0001);
  });

  test('availabilityCheck ok=true when fully stocked', () => {
    const mgr = new BOMManager();
    buildY031Gate(mgr);
    const inv = {
      'STEEL-SHEET-2MM': 100,
      'TUBE-SQ-40':      100,
      'HINGE-HD':        100,
      'BOLT-M8':         100,
      'PAINT-BLACK':     100,
    };
    const result = mgr.availabilityCheck('GATE-Y031', 'A', 1, inv);
    assert.equal(result.ok, true);
    assert.equal(result.shortages.length, 0);
    assert.ok(result.surplus.length > 0);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Y-031 / 7. ECO request + dual approval
// ─────────────────────────────────────────────────────────────────────

describe('Y-031 ECO workflow — request + dual approval', () => {
  test('ecoRequest stores a pending ECO with all required fields', () => {
    const mgr = new BOMManager();
    const bom = buildY031Gate(mgr);
    const eco = mgr.ecoRequest({
      bomId: bom.id,
      changes: [{ op: 'sub', from: 'STEEL-SHEET-2MM', to: 'STEEL-SHEET-3MM' }],
      requester: 'eli@technokol.co.il',
      reason: 'Customer required heavier gauge for marine env',
      effectiveDate: '2026-05-01',
    });
    assert.ok(eco.id);
    assert.equal(eco.status, ECO_STATUS.PENDING);
    assert.equal(eco.requester, 'eli@technokol.co.il');
    assert.equal(eco.partNumber, 'GATE-Y031');
    assert.deepEqual(eco.requiredRoles, REQUIRED_ECO_ROLES.slice());
  });

  test('ecoRequest throws on invalid input', () => {
    const mgr = new BOMManager();
    const bom = buildY031Gate(mgr);
    assert.throws(() => mgr.ecoRequest({ bomId: bom.id, changes: [], requester: 'x', reason: 'y' }), /non-empty/);
    assert.throws(() => mgr.ecoRequest({ bomId: 'no-such', changes: [{ op: 'a' }], requester: 'x', reason: 'y' }), /not found/);
    assert.throws(() => mgr.ecoRequest({ bomId: bom.id, changes: [{ op: 'a' }], reason: 'y' }), /requester/);
  });

  test('approveEco flips to APPROVED only after eng + qa + purchasing all sign', () => {
    const mgr = new BOMManager();
    const bom = buildY031Gate(mgr);
    const eco = mgr.ecoRequest({
      bomId: bom.id,
      changes: [{ op: 'sub', from: 'BOLT-M8', to: 'BOLT-M10' }],
      requester: 'eli@technokol.co.il',
      reason: 'Stronger fastener',
    });
    // Engineering only — still pending
    mgr.approveEco(eco.id, [{ role: 'engineering', approver: 'avi@eng.tk' }]);
    assert.equal(mgr.getEco(eco.id).status, ECO_STATUS.PENDING);
    // Add quality — still pending
    mgr.approveEco(eco.id, [{ role: 'quality', approver: 'rina@qa.tk' }]);
    assert.equal(mgr.getEco(eco.id).status, ECO_STATUS.PENDING);
    // Add purchasing — now approved
    mgr.approveEco(eco.id, [{ role: 'purchasing', approver: 'kobi@buy.tk' }]);
    const final = mgr.getEco(eco.id);
    assert.equal(final.status, ECO_STATUS.APPROVED);
    assert.equal(final.approvals.length, 3);
    // History should have a status-change entry
    assert.ok(final.history.find(h => h.action === 'status-change' && h.to === ECO_STATUS.APPROVED));
  });

  test('approveEco rejects ECO if any role decides reject', () => {
    const mgr = new BOMManager();
    const bom = buildY031Gate(mgr);
    const eco = mgr.ecoRequest({
      bomId: bom.id,
      changes: [{ op: 'sub', from: 'PAINT-BLACK', to: 'PAINT-RED' }],
      requester: 'sales@tk.co.il',
      reason: 'Marketing demand',
    });
    mgr.approveEco(eco.id, [{ role: 'engineering', approver: 'avi@eng.tk' }]);
    mgr.approveEco(eco.id, [{ role: 'quality', approver: 'rina@qa.tk', decision: 'reject', comment: 'Color spec mismatch' }]);
    assert.equal(mgr.getEco(eco.id).status, ECO_STATUS.REJECTED);
  });

  test('approveEco throws on unknown role', () => {
    const mgr = new BOMManager();
    const bom = buildY031Gate(mgr);
    const eco = mgr.ecoRequest({
      bomId: bom.id,
      changes: [{ op: 'sub', from: 'BOLT-M8', to: 'BOLT-M10' }],
      requester: 'a@b.c',
      reason: 'r',
    });
    assert.throws(
      () => mgr.approveEco(eco.id, [{ role: 'cto', approver: 'x' }]),
      /unknown role/,
    );
  });

  test('cancelEco preserves the ECO record (append-only)', () => {
    const mgr = new BOMManager();
    const bom = buildY031Gate(mgr);
    const eco = mgr.ecoRequest({
      bomId: bom.id,
      changes: [{ op: 'a' }],
      requester: 'x@y.z',
      reason: 'oops',
    });
    const sizeBefore = mgr.listEcos().length;
    mgr.cancelEco(eco.id, 'Filed in error');
    const after = mgr.getEco(eco.id);
    assert.ok(after, 'cancelled ECO must still be retrievable');
    assert.equal(after.status, ECO_STATUS.CANCELLED);
    assert.equal(mgr.listEcos().length, sizeBefore); // never deleted
  });
});

// ─────────────────────────────────────────────────────────────────────
// Y-031 / 8. circular reference detection
// ─────────────────────────────────────────────────────────────────────

describe('Y-031 circular-reference detection', () => {
  test('defineBOM rejects A→B→A cycle', () => {
    const mgr = new BOMManager();
    mgr.upsertItem('A', { uom: UOMS.PIECE, standardCost: 1 });
    mgr.upsertItem('B', { uom: UOMS.PIECE, standardCost: 1 });
    mgr.defineBOM({ partNumber: 'B', items: [{ childPart: 'A', qty: 1, uom: UOMS.PIECE }] });
    assert.throws(
      () => mgr.defineBOM({ partNumber: 'A', items: [{ childPart: 'B', qty: 1, uom: UOMS.PIECE }] }),
      /circular reference/,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────
// Y-031 / 9. phantom BOM — transparent pass-through
// ─────────────────────────────────────────────────────────────────────

describe('Y-031 phantomBOM — transparent pass-through', () => {
  test('phantom marker is registered and idempotent', () => {
    const mgr = new BOMManager();
    const p1 = mgr.phantomBOM('PHANTOM-FAB', { name_he: 'יחידה פנטום' });
    assert.equal(p1.flag, PHANTOM_FLAG);
    assert.ok(mgr.isPhantom('PHANTOM-FAB'));
    // Idempotent — second call returns same record (never deleted).
    const p2 = mgr.phantomBOM('PHANTOM-FAB');
    assert.equal(mgr.listPhantoms().length, 1);
    assert.equal(p2.partNumber, 'PHANTOM-FAB');
  });

  test('explode passes through a phantom sub-assembly without stocking it', () => {
    const mgr = new BOMManager();
    mgr.upsertItem('RAW1', { uom: UOMS.KG, standardCost: 10 });
    mgr.upsertItem('RAW2', { uom: UOMS.KG, standardCost: 20 });
    // Define a phantom sub-assembly. Explicit scrap=0 to keep arithmetic clean.
    mgr.defineBOM({
      partNumber: 'PHANTOM-SUB',
      rev: 'A',
      status: BOM_STATUS.ACTIVE,
      phantom: true,
      items: [
        { childPart: 'RAW1', qty: 2, uom: UOMS.KG, scrap: 0 },
        { childPart: 'RAW2', qty: 3, uom: UOMS.KG, scrap: 0 },
      ],
    });
    // Top assembly that contains the phantom
    mgr.defineBOM({
      partNumber: 'TOP',
      rev: 'A',
      status: BOM_STATUS.ACTIVE,
      items: [
        { childPart: 'PHANTOM-SUB', qty: 1, uom: UOMS.PIECE, scrap: 0 },
      ],
    });
    const ex = mgr.explode('TOP', 'A', 1);
    // PHANTOM-SUB itself should NOT appear in totals — it is transparent.
    assert.equal(ex.totalsByLeaf['PHANTOM-SUB'], undefined);
    // But its raw children DO appear.
    assert.ok(ex.totalsByLeaf['RAW1']);
    assert.equal(ex.totalsByLeaf['RAW1'].qty, 2);
    assert.equal(ex.totalsByLeaf['RAW2'].qty, 3);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Y-031 / 10. effectivity-date filtering
// ─────────────────────────────────────────────────────────────────────

describe('Y-031 effectivity-date filtering', () => {
  test('rows outside as-of window are skipped during explode', () => {
    const mgr = new BOMManager();
    mgr.upsertItem('OLD-ROD', { uom: UOMS.METER, standardCost: 5 });
    mgr.upsertItem('NEW-ROD', { uom: UOMS.METER, standardCost: 8 });
    mgr.defineBOM({
      partNumber: 'ROD-PART',
      rev: 'A',
      status: BOM_STATUS.ACTIVE,
      items: [
        { childPart: 'OLD-ROD', qty: 5, uom: UOMS.METER, effectivityFrom: '2025-01-01', effectivityTo: '2026-01-31' },
        { childPart: 'NEW-ROD', qty: 5, uom: UOMS.METER, effectivityFrom: '2026-02-01', effectivityTo: '2099-12-31' },
      ],
    });
    // As of Jan 2026 → only OLD-ROD is in scope
    const ex1 = mgr.explode('ROD-PART', 'A', 1, { asOfDate: '2026-01-15' });
    assert.ok(ex1.totalsByLeaf['OLD-ROD']);
    assert.equal(ex1.totalsByLeaf['NEW-ROD'], undefined);
    // As of April 2026 → only NEW-ROD is in scope
    const ex2 = mgr.explode('ROD-PART', 'A', 1, { asOfDate: '2026-04-11' });
    assert.equal(ex2.totalsByLeaf['OLD-ROD'], undefined);
    assert.ok(ex2.totalsByLeaf['NEW-ROD']);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Y-031 / 11. alternateGroup lookup
// ─────────────────────────────────────────────────────────────────────

describe('Y-031 alternateGroup — substitutable components', () => {
  test('alternateGroup returns all members of a substitution group', () => {
    const mgr = new BOMManager();
    mgr.upsertItem('SHEET-2MM', { uom: UOMS.KG, standardCost: 48 });
    mgr.upsertItem('SHEET-3MM', { uom: UOMS.KG, standardCost: 65 });
    mgr.upsertItem('BOLT-M8',   { uom: UOMS.PIECE, standardCost: 0.5 });
    mgr.defineBOM({
      partNumber: 'GATE',
      rev: 'A',
      status: BOM_STATUS.ACTIVE,
      items: [
        { childPart: 'SHEET-2MM', qty: 18, uom: UOMS.KG, alternateGroup: 'SHEETS', alternatives: ['SHEET-3MM'] },
        { childPart: 'BOLT-M8',   qty: 12, uom: UOMS.PIECE },
      ],
    });
    const grp = mgr.alternateGroup('GATE', 'A', 'SHEETS');
    assert.equal(grp.partNumber, 'GATE');
    assert.equal(grp.group, 'SHEETS');
    assert.equal(grp.members.length, 1);
    assert.equal(grp.members[0].sku, 'SHEET-2MM');
    assert.ok(grp.members[0].alternatives.includes('SHEET-3MM'));
  });

  test('alternateGroup throws on unknown part', () => {
    const mgr = new BOMManager();
    assert.throws(() => mgr.alternateGroup('NO-SUCH', 'A', 'X'), /not found/);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Y-031 / 12. validateBOM — scrap% range
// ─────────────────────────────────────────────────────────────────────

describe('Y-031 validateBOM — Y-031 spec ranges', () => {
  test('validateBOM flags scrap% outside [0,1] (post-normalization)', () => {
    const mgr = new BOMManager();
    const result = mgr.validateBOM({
      sku: 'P',
      components: [
        { sku: 'A', qty: 1, uom: UOMS.KG, scrap: 1.5 },   // bad
        { sku: 'B', qty: 1, uom: UOMS.KG, scrap: 0.5 },   // ok
      ],
    });
    assert.equal(result.ok, false);
    assert.ok(result.errors.find(e => /scrap/.test(e)));
  });

  test('REQUIRED_ECO_ROLES exposes engineering+quality+purchasing', () => {
    assert.deepEqual(REQUIRED_ECO_ROLES.slice().sort(), ['engineering', 'purchasing', 'quality']);
    assert.equal(ECO_ROLE_LABELS.engineering.he, 'הנדסה');
    assert.equal(ECO_ROLE_LABELS.quality.he, 'איכות');
    assert.equal(ECO_ROLE_LABELS.purchasing.he, 'רכש');
  });
});
