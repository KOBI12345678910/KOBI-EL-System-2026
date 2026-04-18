/**
 * AG-Y032 — Unit tests for the Manufacturing Routing & Work Center Manager
 *
 * Covers:
 *   - defineWorkCenter / setWorkCenterAvailability
 *   - createRouting (and re-create → versioning)
 *   - computeLeadTime
 *   - computeCost (labour + machine rollup, per-unit)
 *   - utilizationReport (actual vs capacity)
 *   - reorderOperations (history preservation)
 *   - alternativeRouting + selectRouting (breakdown fallback)
 *   - operationList flattener for work-order traveler
 *
 * Run with:  node --test test/manufacturing/routing-manager.test.js
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const {
  RoutingManager,
  WORK_CENTER_TYPES,
  OPERATION_CATALOG,
} = require('../../src/manufacturing/routing-manager');

/* --------------------------------------------------------------------------
 * helper: seed a manager with three work centers + one primary routing
 * ------------------------------------------------------------------------ */
function seedManager() {
  const rm = new RoutingManager();

  rm.defineWorkCenter({
    id: 'WC-LASER-01',
    name_he: 'לייזר פייבר 6kW',
    name_en: 'Fiber Laser 6kW',
    type: 'cutting',
    hourlyRate: 350,
    capacityHoursPerDay: 16, // 2 shifts
    setupBuffer: 0.5,
  });

  rm.defineWorkCenter({
    id: 'WC-BEND-01',
    name_he: 'מכונת כיפוף CNC',
    name_en: 'CNC Press-Brake',
    type: 'bending',
    hourlyRate: 220,
    capacityHoursPerDay: 8,
    setupBuffer: 0.25,
  });

  rm.defineWorkCenter({
    id: 'WC-WELD-01',
    name_he: 'תא ריתוך MIG',
    name_en: 'MIG Welding Cell',
    type: 'welding',
    hourlyRate: 180,
    capacityHoursPerDay: 8,
    setupBuffer: 0.1,
  });

  rm.createRouting({
    id: 'RT-BRACKET-A',
    sku: 'BRACKET-STD',
    operations: [
      {
        seq: 10,
        workCenterId: 'WC-LASER-01',
        operationName_he: 'חיתוך לייזר',
        operationName_en: 'Laser cutting',
        setupTime: 0.2,
        runTimePerUnit: 0.05,
        description: 'Nest cut from 3mm mild steel',
      },
      {
        seq: 20,
        workCenterId: 'WC-BEND-01',
        operationName_he: 'כיפוף',
        operationName_en: 'Press-brake bend',
        setupTime: 0.3,
        runTimePerUnit: 0.08,
        description: '2 bends per piece',
      },
      {
        seq: 30,
        workCenterId: 'WC-WELD-01',
        operationName_he: 'ריתוך MIG',
        operationName_en: 'MIG welding',
        setupTime: 0.15,
        runTimePerUnit: 0.12,
        description: '4 spot welds',
      },
    ],
  });

  return rm;
}

/* ==========================================================================
 * defineWorkCenter
 * ========================================================================= */
describe('defineWorkCenter', () => {
  test('registers a work center with bilingual fields', () => {
    const rm = new RoutingManager();
    const wc = rm.defineWorkCenter({
      id: 'WC-LASER-01',
      name_he: 'לייזר',
      name_en: 'Laser',
      type: 'cutting',
      hourlyRate: 350,
      capacityHoursPerDay: 16,
      setupBuffer: 0.5,
    });
    assert.equal(wc.id, 'WC-LASER-01');
    assert.equal(wc.typeLabel_he, 'חיתוך');
    assert.equal(wc.typeLabel_en, 'Cutting');
    assert.equal(wc.available, true);
  });

  test('rejects unknown types', () => {
    const rm = new RoutingManager();
    assert.throws(() => rm.defineWorkCenter({
      id: 'x', name_he: 'x', name_en: 'x',
      type: 'nuclear', hourlyRate: 1, capacityHoursPerDay: 1, setupBuffer: 0,
    }), /invalid work center type/);
  });

  test('rejects negative rates', () => {
    const rm = new RoutingManager();
    assert.throws(() => rm.defineWorkCenter({
      id: 'x', name_he: 'x', name_en: 'x',
      type: 'cutting', hourlyRate: -10, capacityHoursPerDay: 1, setupBuffer: 0,
    }), /invalid hourlyRate/);
  });

  test('re-defining preserves history (never-delete rule)', () => {
    const rm = new RoutingManager();
    rm.defineWorkCenter({
      id: 'WC-A', name_he: 'א', name_en: 'A', type: 'cutting',
      hourlyRate: 300, capacityHoursPerDay: 8, setupBuffer: 0.5,
    });
    const v2 = rm.defineWorkCenter({
      id: 'WC-A', name_he: 'א', name_en: 'A', type: 'cutting',
      hourlyRate: 400, capacityHoursPerDay: 8, setupBuffer: 0.5,
    });
    assert.equal(v2.hourlyRate, 400);
    assert.equal(v2.history.length, 1);
    assert.equal(v2.history[0].hourlyRate, 300);
  });
});

/* ==========================================================================
 * createRouting
 * ========================================================================= */
describe('createRouting', () => {
  test('creates a routing with sorted operations', () => {
    const rm = seedManager();
    const r = rm.routings.get('RT-BRACKET-A');
    assert.equal(r.operations.length, 3);
    assert.deepEqual(r.operations.map((o) => o.seq), [10, 20, 30]);
    assert.equal(r.version, 1);
  });

  test('rejects operations pointing to unknown WCs', () => {
    const rm = new RoutingManager();
    rm.defineWorkCenter({
      id: 'WC-A', name_he: 'א', name_en: 'A', type: 'cutting',
      hourlyRate: 1, capacityHoursPerDay: 1, setupBuffer: 0,
    });
    assert.throws(() => rm.createRouting({
      id: 'RT-X', sku: 'SKU-X',
      operations: [{ seq: 10, workCenterId: 'WC-Missing', operationName_he: 'x',
        operationName_en: 'x', setupTime: 0, runTimePerUnit: 0 }],
    }), /workCenterId unknown/);
  });

  test('recreating same id bumps version and snapshots previous', () => {
    const rm = seedManager();
    rm.createRouting({
      id: 'RT-BRACKET-A',
      sku: 'BRACKET-STD',
      operations: [
        { seq: 10, workCenterId: 'WC-LASER-01',
          operationName_he: 'חיתוך לייזר', operationName_en: 'Laser cut',
          setupTime: 0.3, runTimePerUnit: 0.06 },
      ],
    });
    const r = rm.routings.get('RT-BRACKET-A');
    assert.equal(r.version, 2);
    assert.equal(r.history.length, 1);
    assert.equal(r.history[0].operations.length, 3);
  });
});

/* ==========================================================================
 * computeLeadTime
 * ========================================================================= */
describe('computeLeadTime', () => {
  test('rolls up setupBuffer + setupTime + runTime*qty across ops', () => {
    const rm = seedManager();
    const qty = 100;
    const r = rm.computeLeadTime({ routingId: 'RT-BRACKET-A', qty: qty });

    // Laser : 0.5 + 0.2 + 100*0.05 = 5.7
    // Bend  : 0.25 + 0.3 + 100*0.08 = 8.55
    // Weld  : 0.1 + 0.15 + 100*0.12 = 12.25
    // Total = 26.5
    assert.equal(r.qty, 100);
    assert.equal(r.totalHours, 26.5);
    assert.equal(r.perOperation.length, 3);
    assert.equal(r.perOperation[0].opHours, 5.7);
    assert.equal(r.perOperation[1].opHours, 8.55);
    assert.equal(r.perOperation[2].opHours, 12.25);
  });

  test('qty=1 still includes full setup overhead', () => {
    const rm = seedManager();
    const r = rm.computeLeadTime({ routingId: 'RT-BRACKET-A', qty: 1 });
    // Laser : 0.5 + 0.2 + 0.05 = 0.75
    // Bend  : 0.25 + 0.3 + 0.08 = 0.63
    // Weld  : 0.1 + 0.15 + 0.12 = 0.37
    // Total = 1.75
    assert.equal(r.totalHours, 1.75);
  });

  test('rejects bad qty', () => {
    const rm = seedManager();
    assert.throws(() => rm.computeLeadTime({ routingId: 'RT-BRACKET-A', qty: 0 }), /qty must be > 0/);
    assert.throws(() => rm.computeLeadTime({ routingId: 'RT-BRACKET-A', qty: -5 }), /invalid qty/);
  });
});

/* ==========================================================================
 * computeCost
 * ========================================================================= */
describe('computeCost', () => {
  test('labour + machine cost rollup, cost-per-unit, currency ILS', () => {
    const rm = seedManager();
    const qty = 100;
    const c = rm.computeCost({ routingId: 'RT-BRACKET-A', qty: qty });

    // Laser : 5.7h * 350  = 1995
    // Bend  : 8.55h * 220 = 1881
    // Weld  : 12.25h * 180 = 2205
    // Total = 6081 ILS, per unit = 60.81
    assert.equal(c.currency, 'ILS');
    assert.equal(c.totalHours, 26.5);
    assert.equal(c.totalCost, 6081);
    assert.equal(c.costPerUnit, 60.81);
    assert.equal(c.perOperation[0].cost, 1995);
    assert.equal(c.perOperation[1].cost, 1881);
    assert.equal(c.perOperation[2].cost, 2205);
  });
});

/* ==========================================================================
 * utilizationReport
 * ========================================================================= */
describe('utilizationReport', () => {
  test('computes actual vs capacity across a period', () => {
    const rm = seedManager();
    // Laser has 16h/day capacity * 5 working days = 80h
    rm.logProductionHours({ workCenterId: 'WC-LASER-01', date: '2026-04-06', hours: 14 });
    rm.logProductionHours({ workCenterId: 'WC-LASER-01', date: '2026-04-07', hours: 15 });
    rm.logProductionHours({ workCenterId: 'WC-LASER-01', date: '2026-04-08', hours: 12 });
    rm.logProductionHours({ workCenterId: 'WC-LASER-01', date: '2026-04-09', hours: 16 });
    rm.logProductionHours({ workCenterId: 'WC-LASER-01', date: '2026-04-10', hours: 10 });
    // unrelated WC entry — must be ignored
    rm.logProductionHours({ workCenterId: 'WC-BEND-01', date: '2026-04-07', hours: 7 });

    const rep = rm.utilizationReport('WC-LASER-01', {
      from: '2026-04-06', to: '2026-04-10', workingDays: 5,
    });
    assert.equal(rep.capacityHours, 80);
    assert.equal(rep.actualHours, 67);
    assert.equal(rep.idleHours, 13);
    assert.equal(rep.overloadHours, 0);
    assert.equal(rep.utilizationPct, 83.75);
    assert.equal(rep.status_en, 'normal');
  });

  test('flags overload when actual > capacity', () => {
    const rm = seedManager();
    // Weld capacity 8h/day * 1 day = 8h ; log 10h
    rm.logProductionHours({ workCenterId: 'WC-WELD-01', date: '2026-04-11', hours: 10 });
    const rep = rm.utilizationReport('WC-WELD-01', {
      from: '2026-04-11', to: '2026-04-11', workingDays: 1,
    });
    assert.equal(rep.overloadHours, 2);
    assert.equal(rep.utilizationPct, 125);
    assert.equal(rep.status_en, 'overloaded');
    assert.equal(rep.status_he, 'עומס יתר');
  });
});

/* ==========================================================================
 * reorderOperations
 * ========================================================================= */
describe('reorderOperations', () => {
  test('reorders while preserving old version in history', () => {
    const rm = seedManager();
    const before = rm.routings.get('RT-BRACKET-A');
    assert.equal(before.version, 1);

    // New order: weld(30) → bend(20) → laser(10)
    const result = rm.reorderOperations('RT-BRACKET-A', [
      { seq: 30 }, { seq: 20 }, { seq: 10 },
    ]);

    assert.equal(result.version, 2);
    assert.equal(result.operations.length, 3);
    // After reorder seq becomes 1,2,3 (idx+1)
    assert.deepEqual(result.operations.map((o) => o.seq), [1, 2, 3]);
    // First op should be the original weld
    assert.equal(result.operations[0].workCenterId, 'WC-WELD-01');
    assert.equal(result.operations[1].workCenterId, 'WC-BEND-01');
    assert.equal(result.operations[2].workCenterId, 'WC-LASER-01');
    // History has previous shape
    assert.equal(result.history.length, 1);
    assert.equal(result.history[0].operations.length, 3);
    assert.equal(result.history[0].version, 1);
  });

  test('rejects mismatched length', () => {
    const rm = seedManager();
    assert.throws(() => rm.reorderOperations('RT-BRACKET-A', [{ seq: 10 }]),
      /must match length/);
  });

  test('rejects unknown old seq reference', () => {
    const rm = seedManager();
    assert.throws(() => rm.reorderOperations('RT-BRACKET-A', [
      { seq: 10 }, { seq: 20 }, { seq: 999 },
    ]), /unknown old seq/);
  });
});

/* ==========================================================================
 * alternativeRouting + selectRouting
 * ========================================================================= */
describe('alternativeRouting + selectRouting', () => {
  test('falls back to alt1 when primary WC is broken down', () => {
    const rm = seedManager();

    // Add a 2nd laser WC (duplicate) for fallback
    rm.defineWorkCenter({
      id: 'WC-LASER-02',
      name_he: 'לייזר פלזמה',
      name_en: 'Plasma Cutter',
      type: 'cutting',
      hourlyRate: 250,
      capacityHoursPerDay: 8,
      setupBuffer: 0.6,
    });

    // alt routing uses WC-LASER-02 instead of WC-LASER-01
    rm.createRouting({
      id: 'RT-BRACKET-A-ALT1',
      sku: 'BRACKET-STD',
      operations: [
        { seq: 10, workCenterId: 'WC-LASER-02',
          operationName_he: 'חיתוך פלזמה', operationName_en: 'Plasma cut',
          setupTime: 0.3, runTimePerUnit: 0.07 },
        { seq: 20, workCenterId: 'WC-BEND-01',
          operationName_he: 'כיפוף', operationName_en: 'Bend',
          setupTime: 0.3, runTimePerUnit: 0.08 },
        { seq: 30, workCenterId: 'WC-WELD-01',
          operationName_he: 'ריתוך MIG', operationName_en: 'MIG weld',
          setupTime: 0.15, runTimePerUnit: 0.12 },
      ],
    });

    rm.alternativeRouting({
      sku: 'BRACKET-STD',
      alt1: 'RT-BRACKET-A-ALT1',
    });

    // all WCs available → primary selected
    const pick1 = rm.selectRouting('BRACKET-STD');
    assert.equal(pick1.routingId, 'RT-BRACKET-A');
    assert.equal(pick1.tier, 'primary');

    // laser-01 breaks down → alt1 should be selected
    rm.setWorkCenterAvailability('WC-LASER-01', false);
    const pick2 = rm.selectRouting('BRACKET-STD');
    assert.equal(pick2.routingId, 'RT-BRACKET-A-ALT1');
    assert.equal(pick2.tier, 'alt1');
  });

  test('returns null when no routing has all WCs available', () => {
    const rm = seedManager();
    rm.setWorkCenterAvailability('WC-WELD-01', false); // primary needs welding
    const pick = rm.selectRouting('BRACKET-STD');
    assert.equal(pick.routingId, null);
    assert.match(pick.reason, /no routing/);
  });

  test('rejects registering alt routing before primary exists', () => {
    const rm = seedManager();
    assert.throws(() => rm.alternativeRouting({ sku: 'UNKNOWN', alt1: 'RT-BRACKET-A' }),
      /no primary routing yet/);
  });
});

/* ==========================================================================
 * operationList
 * ========================================================================= */
describe('operationList', () => {
  test('returns a flat bilingual list for a SKU', () => {
    const rm = seedManager();
    const list = rm.operationList('BRACKET-STD');
    assert.equal(list.length, 3);
    assert.equal(list[0].operationName_he, 'חיתוך לייזר');
    assert.equal(list[0].operationName_en, 'Laser cutting');
    assert.equal(list[0].workCenter_he, 'לייזר פייבר 6kW');
    assert.equal(list[1].workCenter_en, 'CNC Press-Brake');
  });

  test('returns empty array for unknown sku', () => {
    const rm = seedManager();
    assert.deepEqual(rm.operationList('NONE'), []);
  });
});

/* ==========================================================================
 * catalogs
 * ========================================================================= */
describe('catalogs', () => {
  test('WORK_CENTER_TYPES contains 8 canonical types', () => {
    assert.equal(Object.keys(WORK_CENTER_TYPES).length, 8);
    assert.ok(WORK_CENTER_TYPES.cutting);
    assert.ok(WORK_CENTER_TYPES.painting);
    assert.equal(WORK_CENTER_TYPES.qc.he, 'בקרת איכות');
  });

  test('OPERATION_CATALOG contains Israeli metal-fab canonical ops', () => {
    assert.ok(OPERATION_CATALOG.laser_cut);
    assert.equal(OPERATION_CATALOG.laser_cut.he, 'חיתוך לייזר');
    assert.equal(OPERATION_CATALOG.powder_coat.he, 'צביעה באבקה');
    assert.equal(OPERATION_CATALOG.hot_galvanize.he, 'גלוון חם');
  });
});
