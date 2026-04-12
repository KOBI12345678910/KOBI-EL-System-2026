/* ============================================================================
 * Unit tests — Metal Scrap Tracker (Agent Y-041)
 *
 * Run:  node --test test/manufacturing/scrap-tracker.test.js
 *
 * Covers the required scenarios:
 *   1. scrap rate calculation (per SKU)
 *   2. inventory reconciliation (consumed vs finished vs scrapped)
 *   3. grade segregation (for scrapyard pricing)
 *   4. Pareto of scrap reasons
 *   5. sales ticket to a scrapyard + revenue
 * Plus basic validation of recordScrap, cost valuation, and
 * the recycled-content report.
 * ========================================================================== */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const {
  ScrapTracker,
  MATERIALS,
  GRADE_CATALOG,
  REASON_CODES,
  DEFAULT_SCRAPYARDS,
  round2,
  round3
} = require('../../src/manufacturing/scrap-tracker');

/* ----------------------------------------------------------------------------
 * helpers
 * -------------------------------------------------------------------------- */

function isoDate(y, m, d) {
  // Stable UTC midnight so the period key is deterministic across TZs.
  return new Date(Date.UTC(y, m - 1, d)).toISOString();
}

function freshTracker() {
  return new ScrapTracker();
}

/* ----------------------------------------------------------------------------
 * 0. Sanity: catalogs exported
 * -------------------------------------------------------------------------- */

describe('ScrapTracker — catalogs', () => {
  test('MATERIALS has the 6 required alloys', () => {
    assert.deepEqual(
      Object.keys(MATERIALS).sort(),
      ['aluminum', 'brass', 'copper', 'mixed', 'stainless', 'steel']
    );
  });

  test('GRADE_CATALOG covers every material', () => {
    for (const m of Object.keys(MATERIALS)) {
      assert.ok(Array.isArray(GRADE_CATALOG[m]), `missing grades for ${m}`);
      assert.ok(GRADE_CATALOG[m].length >= 1, `no grades for ${m}`);
    }
  });

  test('REASON_CODES contains the five canonical reasons', () => {
    for (const r of ['setup_error', 'tool_wear', 'programming_error',
                     'material_defect', 'operator_error']) {
      assert.ok(REASON_CODES[r], `missing reason code: ${r}`);
      assert.ok(REASON_CODES[r].he, `missing Hebrew for: ${r}`);
    }
  });

  test('DEFAULT_SCRAPYARDS has at least 3 Israeli yards with yardId', () => {
    assert.ok(DEFAULT_SCRAPYARDS.length >= 3);
    for (const y of DEFAULT_SCRAPYARDS) {
      assert.ok(y.yardId);
      assert.ok(y.he);
    }
  });
});

/* ----------------------------------------------------------------------------
 * 1. recordScrap — validation + immutability
 * -------------------------------------------------------------------------- */

describe('ScrapTracker — recordScrap validation', () => {
  test('accepts a valid event and returns an immutable record', () => {
    const t = freshTracker();
    const ev = t.recordScrap({
      wo: 'WO-1001',
      operation: 'LASER-CUT',
      material: 'steel',
      grade: 'S235JR',
      weightKg: 12.345,
      reason: 'setup_error',
      operator: 'uzi',
      date: isoDate(2026, 4, 3)
    });
    assert.equal(ev.id, 'SCR-000001');
    assert.equal(ev.material, 'steel');
    assert.equal(ev.grade, 'S235JR');
    assert.equal(ev.weightKg, 12.345);
    assert.equal(ev.reason.he, 'טעות הרכבה / סטאפ');
    assert.equal(ev.period, '2026-04');
    // immutable
    assert.throws(() => { ev.weightKg = 0; }, TypeError);
  });

  test('rejects unknown material', () => {
    const t = freshTracker();
    assert.throws(() => t.recordScrap({
      wo: 'X', operation: 'X', material: 'titanium',
      weightKg: 1, reason: 'tool_wear', operator: 'u'
    }), /unknown material/);
  });

  test('rejects non-positive weight', () => {
    const t = freshTracker();
    assert.throws(() => t.recordScrap({
      wo: 'X', operation: 'X', material: 'steel',
      weightKg: 0, reason: 'tool_wear', operator: 'u'
    }), /weightKg/);
    assert.throws(() => t.recordScrap({
      wo: 'X', operation: 'X', material: 'steel',
      weightKg: -5, reason: 'tool_wear', operator: 'u'
    }), /weightKg/);
  });

  test('rejects missing wo / reason / operator', () => {
    const t = freshTracker();
    const base = { operation: 'CUT', material: 'steel', weightKg: 1 };
    assert.throws(() => t.recordScrap({ ...base, reason: 'x', operator: 'u' }),
      /wo.*required/);
    assert.throws(() => t.recordScrap({ ...base, wo: 'W', operator: 'u' }),
      /reason.*required/);
    assert.throws(() => t.recordScrap({ ...base, wo: 'W', reason: 'x' }),
      /operator.*required/);
  });

  test('accepts free-text reason codes', () => {
    const t = freshTracker();
    const ev = t.recordScrap({
      wo: 'W', operation: 'O', material: 'steel',
      weightKg: 1, reason: 'cosmic_rays', operator: 'u'
    });
    assert.equal(ev.reason.custom, true);
    assert.equal(ev.reason.code, 'cosmic_rays');
  });
});

/* ----------------------------------------------------------------------------
 * 2. segregateByGrade — grouping for scrapyard pricing
 * -------------------------------------------------------------------------- */

describe('ScrapTracker — segregateByGrade', () => {
  test('buckets merge by material+grade and sum weight', () => {
    const t = freshTracker();
    const base = { wo: 'W', operation: 'O', operator: 'u', date: isoDate(2026, 3, 1) };
    t.recordScrap({ ...base, material: 'steel', grade: 'S235JR', weightKg: 10, reason: 'setup_error' });
    t.recordScrap({ ...base, material: 'steel', grade: 'S235JR', weightKg: 15, reason: 'tool_wear'   });
    t.recordScrap({ ...base, material: 'steel', grade: 'S355J2', weightKg: 20, reason: 'tool_wear'   });
    t.recordScrap({ ...base, material: 'aluminum', grade: '6061', weightKg: 8, reason: 'programming_error' });
    t.recordScrap({ ...base, material: 'copper',   grade: 'C101', weightKg: 2, reason: 'operator_error' });

    const buckets = t.segregateByGrade('2026-03');
    // 4 buckets (S235JR, S355J2, Al-6061, Cu-C101) — heaviest first.
    assert.equal(buckets.length, 4);
    assert.equal(buckets[0].weightKg, 25);           // steel S235JR
    assert.equal(buckets[0].grade, 'S235JR');
    assert.equal(buckets[1].weightKg, 20);           // steel S355J2
    assert.equal(buckets[2].weightKg, 8);            // aluminum 6061
    assert.equal(buckets[3].weightKg, 2);            // copper C101

    // Suggested price/kg is populated from GRADE_CATALOG
    for (const b of buckets) {
      assert.ok(typeof b.suggestedPricePerKg === 'number');
      assert.ok(b.suggestedPricePerKg > 0);
      assert.ok(typeof b.suggestedRevenue === 'number');
      assert.equal(round2(b.weightKg * b.suggestedPricePerKg), b.suggestedRevenue);
    }
  });

  test('period filter excludes other months', () => {
    const t = freshTracker();
    t.recordScrap({ wo: 'W', operation: 'O', operator: 'u',
      material: 'steel', grade: 'S235JR', weightKg: 100,
      reason: 'setup_error', date: isoDate(2026, 1, 5) });
    t.recordScrap({ wo: 'W', operation: 'O', operator: 'u',
      material: 'steel', grade: 'S235JR', weightKg: 50,
      reason: 'setup_error', date: isoDate(2026, 4, 5) });

    const april = t.segregateByGrade('2026-04');
    assert.equal(april.length, 1);
    assert.equal(april[0].weightKg, 50);

    const all = t.segregateByGrade('*');
    assert.equal(all[0].weightKg, 150);
  });
});

/* ----------------------------------------------------------------------------
 * 3. scrapRate — % scrapped per SKU
 * -------------------------------------------------------------------------- */

describe('ScrapTracker — scrapRate', () => {
  test('computes scrap % from registered SKU BOM', () => {
    const t = freshTracker();
    t.registerSKU({
      sku: 'BRK-PLT-01',
      name: 'Bracket plate',
      material: 'steel',
      rawWeightKg: 100
    });

    // 3 WOs × 100 kg raw = 300 kg raw consumed (inferred from BOM × WO count)
    const base = { operation: 'LASER', operator: 'u', material: 'steel',
                   grade: 'S235JR', reason: 'tool_wear', date: isoDate(2026, 4, 1),
                   sku: 'BRK-PLT-01' };
    t.recordScrap({ ...base, wo: 'WO-1', weightKg: 4 });
    t.recordScrap({ ...base, wo: 'WO-2', weightKg: 6 });
    t.recordScrap({ ...base, wo: 'WO-3', weightKg: 5 });

    const r = t.scrapRate('BRK-PLT-01', '2026-04');
    assert.equal(r.scrapKg, 15);
    assert.equal(r.rawKg, 300);           // 3 WOs × 100 kg
    assert.equal(r.ratePct, 5);           // 15/300 = 5%
  });

  test('uses explicit consumption when provided and larger', () => {
    const t = freshTracker();
    t.registerSKU({
      sku: 'ROD-01', material: 'stainless', rawWeightKg: 10
    });
    t.recordScrap({
      wo: 'WO-9', operation: 'LATHE', operator: 'u',
      material: 'stainless', grade: '304', weightKg: 2,
      reason: 'dimensional', sku: 'ROD-01', date: isoDate(2026, 4, 10)
    });
    // Actual consumption was 40 kg (bigger than 1 WO × 10 kg BOM)
    t.recordConsumption('2026-04', 'stainless', '304', 40);

    const r = t.scrapRate('ROD-01', '2026-04');
    assert.equal(r.scrapKg, 2);
    assert.equal(r.rawKg, 40);
    assert.equal(r.ratePct, 5);
  });

  test('returns rate 0 when no raw basis at all', () => {
    const t = freshTracker();
    const r = t.scrapRate('UNKNOWN-SKU', '2026-04');
    assert.equal(r.rate, 0);
    assert.equal(r.scrapKg, 0);
  });

  test('throws when sku is missing', () => {
    const t = freshTracker();
    assert.throws(() => t.scrapRate(undefined, '2026-04'), /sku is required/);
  });
});

/* ----------------------------------------------------------------------------
 * 4. scrapCost — NIS valuation
 * -------------------------------------------------------------------------- */

describe('ScrapTracker — scrapCost', () => {
  test('values scrap by seeded raw-material cost', () => {
    const t = freshTracker();
    const base = { wo: 'W', operation: 'O', operator: 'u', date: isoDate(2026, 4, 2) };
    t.recordScrap({ ...base, material: 'steel',     grade: 'S235JR', weightKg: 10, reason: 'setup_error' });
    t.recordScrap({ ...base, material: 'stainless', grade: '316',    weightKg: 1,  reason: 'tool_wear'   });

    const cost = t.scrapCost('2026-04');
    // 10 kg × 4.20 = 42.00
    // 1  kg × 42.00 = 42.00
    // total = 84.00
    assert.equal(cost.totalNis, 84);
    assert.equal(cost.byMaterial.length, 2);
    assert.ok(cost.byMaterial[0].costNis >= cost.byMaterial[1].costNis); // sorted
  });

  test('uses per-material average when grade missing from price table', () => {
    const t = freshTracker();
    t.setMaterialCost('steel', 'S235JR', 4);
    t.setMaterialCost('steel', 'S355J2', 6);
    t.recordScrap({
      wo: 'W', operation: 'O', operator: 'u',
      material: 'steel', grade: 'UNKNOWN-GRADE',
      weightKg: 10, reason: 'tool_wear', date: isoDate(2026, 4, 3)
    });
    const cost = t.scrapCost('2026-04');
    // Falls back to average of known S235JR+S355J2 prices if they exist.
    assert.ok(cost.totalNis > 0);
    assert.equal(cost.unpricedEventIds.length, 0);
  });

  test('flags events with no price whatsoever', () => {
    const t = new ScrapTracker({ seedCosts: false });
    t.recordScrap({
      wo: 'W', operation: 'O', operator: 'u',
      material: 'mixed', grade: null, weightKg: 5,
      reason: 'tool_wear', date: isoDate(2026, 4, 3)
    });
    const cost = t.scrapCost('2026-04');
    assert.equal(cost.totalNis, 0);
    assert.equal(cost.unpricedEventIds.length, 1);
  });
});

/* ----------------------------------------------------------------------------
 * 5. sellToScrapyard — sales ticket + revenue
 * -------------------------------------------------------------------------- */

describe('ScrapTracker — sellToScrapyard', () => {
  test('creates an immutable sales ticket with correct totals', () => {
    const t = freshTracker();
    const ticket = t.sellToScrapyard({
      yardId: 'PRZ-HADERA',
      date: isoDate(2026, 4, 11),
      materials: [
        { material: 'steel',     grade: 'S235JR', weightKg: 250, pricePerKg: 0.90 },
        { material: 'stainless', grade: '304',    weightKg: 30,  pricePerKg: 5.20 },
        { material: 'copper',    grade: 'C101',   weightKg: 5,   pricePerKg: 32.00 }
      ]
    });
    assert.equal(ticket.ticketId, 'SCR-TKT-000001');
    assert.equal(ticket.yardId, 'PRZ-HADERA');
    assert.equal(ticket.totalWeightKg, 285);
    // 250*0.90 + 30*5.20 + 5*32 = 225 + 156 + 160 = 541
    assert.equal(ticket.totalRevenue, 541);
    assert.equal(ticket.lines.length, 3);
    assert.throws(() => { ticket.totalRevenue = 0; }, TypeError);
  });

  test('rejects unknown yardId', () => {
    const t = freshTracker();
    assert.throws(() => t.sellToScrapyard({
      yardId: 'NOBODY', materials: [{ weightKg: 1, pricePerKg: 1 }]
    }), /unknown yardId/);
  });

  test('rejects yard that does not accept a material', () => {
    const t = freshTracker();
    // NHB-BE7 accepts only copper + brass
    assert.throws(() => t.sellToScrapyard({
      yardId: 'NHB-BE7',
      materials: [{ material: 'steel', weightKg: 10, pricePerKg: 1 }]
    }), /does not accept steel/);
  });

  test('rejects bad weight or price', () => {
    const t = freshTracker();
    assert.throws(() => t.sellToScrapyard({
      yardId: 'PRZ-HADERA',
      materials: [{ weightKg: 0, pricePerKg: 1 }]
    }), /weightKg/);
    assert.throws(() => t.sellToScrapyard({
      yardId: 'PRZ-HADERA',
      materials: [{ weightKg: 1, pricePerKg: -1 }]
    }), /pricePerKg/);
  });

  test('registerScrapyard can add a custom yard', () => {
    const t = freshTracker();
    t.registerScrapyard({
      yardId: 'LOCAL-1',
      he: 'גרוטאות השכונה',
      en: 'Neighborhood Scrap',
      accepts: ['steel', 'aluminum']
    });
    const ticket = t.sellToScrapyard({
      yardId: 'LOCAL-1',
      materials: [{ material: 'steel', weightKg: 100, pricePerKg: 1 }]
    });
    assert.equal(ticket.totalRevenue, 100);
  });
});

/* ----------------------------------------------------------------------------
 * 6. reconcileInventory — mass balance
 * -------------------------------------------------------------------------- */

describe('ScrapTracker — reconcileInventory', () => {
  test('balanced month: consumed = finished + scrapped', () => {
    const t = freshTracker();
    t.recordConsumption('2026-04', 'steel', 'S235JR', 1000);
    t.recordFinishedGoods('2026-04', 'steel', 'S235JR', 950);
    t.recordScrap({
      wo: 'W', operation: 'O', operator: 'u',
      material: 'steel', grade: 'S235JR', weightKg: 50,
      reason: 'edge_trim', date: isoDate(2026, 4, 10)
    });

    const rec = t.reconcileInventory('2026-04');
    assert.equal(rec.ok, true);
    assert.equal(rec.rows.length, 1);
    const row = rec.rows[0];
    assert.equal(row.consumedKg, 1000);
    assert.equal(row.finishedKg, 950);
    assert.equal(row.scrappedKg, 50);
    assert.equal(row.balanceKg, 0);
  });

  test('unbalanced month flags ok=false', () => {
    const t = freshTracker();
    t.recordConsumption('2026-04', 'steel', 'S235JR', 1000);
    t.recordFinishedGoods('2026-04', 'steel', 'S235JR', 950);
    t.recordScrap({
      wo: 'W', operation: 'O', operator: 'u',
      material: 'steel', grade: 'S235JR', weightKg: 20,
      reason: 'edge_trim', date: isoDate(2026, 4, 10)
    });
    // Missing 30 kg — big enough to exceed default 0.5 kg tolerance.
    const rec = t.reconcileInventory('2026-04');
    assert.equal(rec.ok, false);
    assert.equal(rec.rows[0].balanceKg, 30);
  });

  test('dust tolerance allows small discrepancies', () => {
    const t = freshTracker();
    t.recordConsumption('2026-04', 'steel', 'S235JR', 100);
    t.recordFinishedGoods('2026-04', 'steel', 'S235JR', 90);
    t.recordScrap({
      wo: 'W', operation: 'O', operator: 'u',
      material: 'steel', grade: 'S235JR', weightKg: 9.7,
      reason: 'edge_trim', date: isoDate(2026, 4, 10)
    });
    // Missing 0.3 kg — within default 0.5 tolerance.
    const rec = t.reconcileInventory('2026-04');
    assert.equal(rec.ok, true);
    assert.ok(Math.abs(rec.rows[0].balanceKg - 0.3) < 1e-6);
  });

  test('custom tolerance is respected', () => {
    const t = freshTracker();
    t.recordConsumption('2026-04', 'aluminum', '6061', 100);
    t.recordFinishedGoods('2026-04', 'aluminum', '6061', 95);
    t.recordScrap({
      wo: 'W', operation: 'O', operator: 'u',
      material: 'aluminum', grade: '6061', weightKg: 2,
      reason: 'edge_trim', date: isoDate(2026, 4, 10)
    });
    // 3 kg gap. Default 0.5 → fail. Override 5 → pass.
    assert.equal(t.reconcileInventory('2026-04').ok, false);
    assert.equal(t.reconcileInventory('2026-04', { toleranceKg: 5 }).ok, true);
  });
});

/* ----------------------------------------------------------------------------
 * 7. reasonPareto — top-reason analysis
 * -------------------------------------------------------------------------- */

describe('ScrapTracker — reasonPareto', () => {
  test('ranks reasons by weight with cumulative %', () => {
    const t = freshTracker();
    const base = { wo: 'W', operation: 'O', operator: 'u',
                   material: 'steel', grade: 'S235JR',
                   date: isoDate(2026, 4, 1) };
    // 80-ish kg total — setup_error dominates
    t.recordScrap({ ...base, weightKg: 50, reason: 'setup_error' });
    t.recordScrap({ ...base, weightKg: 20, reason: 'tool_wear' });
    t.recordScrap({ ...base, weightKg: 10, reason: 'programming_error' });
    t.recordScrap({ ...base, weightKg: 5,  reason: 'material_defect' });
    t.recordScrap({ ...base, weightKg: 2,  reason: 'operator_error' });

    const p = t.reasonPareto('2026-04');
    assert.equal(p.totalKg, 87);
    assert.equal(p.rows.length, 5);
    assert.equal(p.rows[0].code, 'setup_error');
    assert.equal(p.rows[0].weightKg, 50);
    assert.equal(p.rows[0].events, 1);
    assert.ok(p.rows[0].pct > 50);
    // Cumulative pct should be monotonic and end at 100.
    let prev = 0;
    for (const r of p.rows) {
      assert.ok(r.cumulativePct >= prev);
      prev = r.cumulativePct;
    }
    assert.equal(prev, 100);
    // Vital few = top reasons up to 80% — setup_error alone is already ~57%
    // so at least the first row must be flagged.
    assert.equal(p.rows[0].isVitalFew, true);
  });

  test('empty period gives empty rows and 0 total', () => {
    const t = freshTracker();
    const p = t.reasonPareto('2026-04');
    assert.equal(p.totalKg, 0);
    assert.equal(p.rows.length, 0);
  });
});

/* ----------------------------------------------------------------------------
 * 8. recycledContentReport — sustainability
 * -------------------------------------------------------------------------- */

describe('ScrapTracker — recycledContentReport', () => {
  test('recovery rate = recycled / scrapped, plus revenue total', () => {
    const t = freshTracker();
    t.recordScrap({
      wo: 'W', operation: 'O', operator: 'u',
      material: 'steel', grade: 'S235JR', weightKg: 1000,
      reason: 'edge_trim', date: isoDate(2026, 4, 10)
    });
    t.sellToScrapyard({
      yardId: 'PRZ-HADERA',
      materials: [{ material: 'steel', grade: 'S235JR', weightKg: 800, pricePerKg: 0.90 }]
    });

    const r = t.recycledContentReport();
    assert.equal(r.totalScrapKg, 1000);
    assert.equal(r.totalRecycledKg, 800);
    assert.equal(r.recoveryPct, 80);
    assert.equal(r.totalRevenueNis, 720);  // 800 × 0.9
    assert.equal(r.materials.length, 1);
    assert.equal(r.materials[0].material, 'steel');
    assert.equal(r.materials[0].recoveryPct, 80);
  });

  test('zero scrap → zero recovery (no divide-by-zero)', () => {
    const t = freshTracker();
    const r = t.recycledContentReport();
    assert.equal(r.totalScrapKg, 0);
    assert.equal(r.recoveryRate, 0);
  });
});

/* ----------------------------------------------------------------------------
 * 9. Introspection + append-only rule
 * -------------------------------------------------------------------------- */

describe('ScrapTracker — append-only history', () => {
  test('getEvents returns a defensive copy', () => {
    const t = freshTracker();
    t.recordScrap({
      wo: 'W', operation: 'O', operator: 'u',
      material: 'steel', grade: 'S235JR', weightKg: 1,
      reason: 'setup_error', date: isoDate(2026, 4, 10)
    });
    const list = t.getEvents('2026-04');
    assert.equal(list.length, 1);
    // mutating the copy should not affect internal state
    list.push({ fake: true });
    assert.equal(t.getEvents('2026-04').length, 1);
  });

  test('no delete method is exposed', () => {
    const t = freshTracker();
    assert.equal(typeof t.delete, 'undefined');
    assert.equal(typeof t.remove, 'undefined');
    assert.equal(typeof t.clear, 'undefined');
  });
});
