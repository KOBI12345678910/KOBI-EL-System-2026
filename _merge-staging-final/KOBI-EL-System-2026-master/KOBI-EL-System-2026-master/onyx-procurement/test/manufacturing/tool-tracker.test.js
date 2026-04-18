/**
 * Tool Tracker — Unit Tests
 * Techno-Kol Uzi mega-ERP / Agent Y-040 (Swarm Manufacturing)
 *
 * Run with:  node --test test/manufacturing/tool-tracker.test.js
 *
 * Covers: catalog definition, usage accumulation, wear thresholds,
 * cycles-remaining, maintenance scheduling, overdue detection,
 * checkout/return flow, quarantine on poor condition, retire()
 * preservation, alertNearEnd, bilingual metadata, idempotent re-define.
 *
 * Uses only the Node built-in test runner — zero external deps.
 */

'use strict';

const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const M = require(path.resolve(
  __dirname, '..', '..', 'src', 'manufacturing', 'tool-tracker.js',
));

const {
  ToolTracker,
  TOOL_TYPES,
  MAINTENANCE_TYPES,
  STATUS,
  CONDITION,
  WEAR_LEVELS,
} = M;

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

const MS_DAY = 24 * 60 * 60 * 1000;

function iso(dateOrOffsetDays) {
  if (typeof dateOrOffsetDays === 'number') {
    return new Date(Date.now() + dateOrOffsetDays * MS_DAY).toISOString().slice(0, 10);
  }
  return new Date(dateOrOffsetDays).toISOString().slice(0, 10);
}

function makeDieSpec(overrides) {
  return Object.assign({
    id:           'DIE-001',
    name_he:      'תבנית עימוץ פרוגרסיבית',
    name_en:      'Progressive punch die',
    type:         'die',
    location:     'Cage-A shelf 3',
    ownerDept:    'Press Shop',
    purchaseDate: '2025-01-10',
    cost:         45000,
    serial:       'SN-D-9001',
    supplier:     'SUP-DIES-MFG',
    drawingRef:   'DRW-D-9001-Rev-B',
    sku:          'SKU-BRACKET-22',
    rated_cycles: 100000,
    calibrationFreqDays: 365,
  }, overrides || {});
}

function makeGaugeSpec(overrides) {
  return Object.assign({
    id:           'GA-001',
    name_he:      'קליפר דיגיטלי 150 מ"מ',
    name_en:      'Digital caliper 150 mm',
    type:         'gauge',
    location:     'QC lab',
    ownerDept:    'Quality',
    purchaseDate: '2024-09-15',
    cost:         2500,
    serial:       'SN-G-401',
    supplier:     'SUP-MITUTOYO',
    drawingRef:   null,
    sku:          '*',
    rated_cycles: 0,            // gauges aren't cycle-counted
    calibrationFreqDays: 180,
  }, overrides || {});
}

// ─────────────────────────────────────────────────────────────
// 1. defineTool
// ─────────────────────────────────────────────────────────────

test('defineTool catalogs a die with bilingual metadata', () => {
  const tt = new ToolTracker();
  const tool = tt.defineTool(makeDieSpec());
  assert.equal(tool.id, 'DIE-001');
  assert.equal(tool.type, 'die');
  assert.equal(tool.type_he, 'תבנית');
  assert.equal(tool.type_en, 'Die');
  assert.equal(tool.status, STATUS.ACTIVE);
  assert.equal(tool.totalCycles, 0);
  assert.deepEqual(tool.usageLog, []);
  assert.deepEqual(tool.maintenanceLog, []);
  assert.deepEqual(tool.checkoutLog, []);
});

test('defineTool rejects unknown tool type', () => {
  const tt = new ToolTracker();
  assert.throws(
    () => tt.defineTool(makeDieSpec({ type: 'laser-cannon' })),
    /invalid tool type/,
  );
});

test('defineTool rejects missing required fields', () => {
  const tt = new ToolTracker();
  assert.throws(() => tt.defineTool(makeDieSpec({ id: '' })));
  assert.throws(() => tt.defineTool(makeDieSpec({ name_he: '' })));
  assert.throws(() => tt.defineTool(makeDieSpec({ cost: -5 })));
});

test('defineTool is idempotent on id — re-define preserves history', () => {
  const tt = new ToolTracker();
  tt.defineTool(makeDieSpec());
  tt.recordUsage('DIE-001', {
    wo: 'WO-100', operation: 'punch', cycles: 500, operator: 'OP-1',
  });
  // Re-define the same tool with a new location — history must survive.
  const updated = tt.defineTool(makeDieSpec({ location: 'Cage-B shelf 1' }));
  assert.equal(updated.location, 'Cage-B shelf 1');
  assert.equal(updated.totalCycles, 500);
  assert.equal(updated.usageLog.length, 1);
  assert.equal(updated.catalogHistory.length, 1);
});

test('defineTool auto-fills calibrationFreqDays from tool type defaults', () => {
  const tt = new ToolTracker();
  const g = tt.defineTool(makeGaugeSpec({ calibrationFreqDays: undefined }));
  assert.equal(g.calibrationFreqDays, 180);
  const c = tt.defineTool({
    id: 'CT-1', name_he: 'מקדח', name_en: 'Drill bit',
    type: 'cutting-tool', location: 'Rack', ownerDept: 'Machining',
    purchaseDate: '2025-05-01', cost: 120, serial: 'X', supplier: 'Y',
    rated_cycles: 5000,
  });
  // Cutting tools have null calibration (sharpening, not calibration).
  assert.equal(c.calibrationFreqDays, null);
});

// ─────────────────────────────────────────────────────────────
// 2. recordUsage & totalCycles
// ─────────────────────────────────────────────────────────────

test('recordUsage appends an entry and accumulates totalCycles', () => {
  const tt = new ToolTracker();
  tt.defineTool(makeDieSpec());
  tt.recordUsage('DIE-001', {
    wo: 'WO-101', operation: 'punch', cycles: 1500, operator: 'OP-A',
  });
  tt.recordUsage('DIE-001', {
    wo: 'WO-102', operation: 'punch', cycles: 2500, operator: 'OP-B',
  });
  const t = tt.findById('DIE-001');
  assert.equal(t.totalCycles, 4000);
  assert.equal(t.usageLog.length, 2);
  assert.equal(t.usageLog[0].wo, 'WO-101');
});

test('recordUsage rejects on unknown tool', () => {
  const tt = new ToolTracker();
  assert.throws(
    () => tt.recordUsage('NONE', { wo: 'W', operation: 'op', cycles: 1, operator: 'O' }),
    /unknown tool id/,
  );
});

test('recordUsage rejects negative cycles', () => {
  const tt = new ToolTracker();
  tt.defineTool(makeDieSpec());
  assert.throws(
    () => tt.recordUsage('DIE-001', { wo: 'W', operation: 'op', cycles: -5, operator: 'O' }),
  );
});

// ─────────────────────────────────────────────────────────────
// 3. cyclesRemaining & wearLevel thresholds
// ─────────────────────────────────────────────────────────────

test('cyclesRemaining = rated - consumed, floors at 0', () => {
  const tt = new ToolTracker();
  tt.defineTool(makeDieSpec({ rated_cycles: 10000 }));
  tt.recordUsage('DIE-001', {
    wo: 'WO', operation: 'punch', cycles: 3000, operator: 'O',
  });
  assert.equal(tt.cyclesRemaining('DIE-001'), 7000);
  tt.recordUsage('DIE-001', {
    wo: 'WO', operation: 'punch', cycles: 20000, operator: 'O',
  });
  assert.equal(tt.cyclesRemaining('DIE-001'), 0);
});

test('cyclesRemaining returns Infinity for uncounted tools', () => {
  const tt = new ToolTracker();
  tt.defineTool(makeGaugeSpec());
  assert.equal(tt.cyclesRemaining('GA-001'), Infinity);
});

test('wearLevel GREEN below 70%', () => {
  const tt = new ToolTracker();
  tt.defineTool(makeDieSpec({ rated_cycles: 1000 }));
  tt.recordUsage('DIE-001', {
    wo: 'W', operation: 'punch', cycles: 300, operator: 'O',
  });
  const w = tt.wearLevel('DIE-001');
  assert.equal(w.level, WEAR_LEVELS.GREEN);
  assert.equal(w.percent, 30);
});

test('wearLevel YELLOW between 70% and 90%', () => {
  const tt = new ToolTracker();
  tt.defineTool(makeDieSpec({ rated_cycles: 1000 }));
  tt.recordUsage('DIE-001', {
    wo: 'W', operation: 'punch', cycles: 750, operator: 'O',
  });
  assert.equal(tt.wearLevel('DIE-001').level, WEAR_LEVELS.YELLOW);
});

test('wearLevel RED at 90% or above', () => {
  const tt = new ToolTracker();
  tt.defineTool(makeDieSpec({ rated_cycles: 1000 }));
  tt.recordUsage('DIE-001', {
    wo: 'W', operation: 'punch', cycles: 900, operator: 'O',
  });
  assert.equal(tt.wearLevel('DIE-001').level, WEAR_LEVELS.RED);
});

test('wearLevel GREEN for uncounted tools (rated_cycles=0)', () => {
  const tt = new ToolTracker();
  tt.defineTool(makeGaugeSpec());
  const w = tt.wearLevel('GA-001');
  assert.equal(w.level, WEAR_LEVELS.GREEN);
  assert.equal(w.uncounted, true);
});

test('custom wear thresholds can be injected at construction', () => {
  const tt = new ToolTracker({ wearThresholds: { yellow: 0.5, red: 0.8 } });
  tt.defineTool(makeDieSpec({ rated_cycles: 1000 }));
  tt.recordUsage('DIE-001', {
    wo: 'W', operation: 'punch', cycles: 600, operator: 'O',
  });
  assert.equal(tt.wearLevel('DIE-001').level, WEAR_LEVELS.YELLOW);
  tt.recordUsage('DIE-001', {
    wo: 'W', operation: 'punch', cycles: 250, operator: 'O',
  });
  assert.equal(tt.wearLevel('DIE-001').level, WEAR_LEVELS.RED);
});

// ─────────────────────────────────────────────────────────────
// 4. scheduleMaintenance / overdueTools
// ─────────────────────────────────────────────────────────────

test('scheduleMaintenance registers a calibration entry', () => {
  const tt = new ToolTracker();
  tt.defineTool(makeGaugeSpec());
  const m = tt.scheduleMaintenance('GA-001', 'calibration', iso(30));
  assert.equal(m.type, 'calibration');
  assert.equal(m.type_he, 'כיול');
  assert.equal(m.status, 'OPEN');
  const t = tt.findById('GA-001');
  assert.equal(t.maintenanceLog.length, 1);
});

test('scheduleMaintenance rejects unknown maintenance type', () => {
  const tt = new ToolTracker();
  tt.defineTool(makeGaugeSpec());
  assert.throws(
    () => tt.scheduleMaintenance('GA-001', 'blessing', iso(10)),
    /invalid maintenance type/,
  );
});

test('overdueTools detects past-due calibration', () => {
  const tt = new ToolTracker();
  tt.defineTool(makeGaugeSpec());
  tt.scheduleMaintenance('GA-001', 'calibration', iso(-5));
  const overdue = tt.overdueTools();
  assert.equal(overdue.length, 1);
  assert.equal(overdue[0].id, 'GA-001');
  assert.equal(overdue[0].overdue[0].daysLate, 5);
});

test('overdueTools does NOT include future-due calibration', () => {
  const tt = new ToolTracker();
  tt.defineTool(makeGaugeSpec());
  tt.scheduleMaintenance('GA-001', 'calibration', iso(10));
  assert.equal(tt.overdueTools().length, 0);
});

test('overdueTools sorts by most-late first', () => {
  const tt = new ToolTracker();
  tt.defineTool(makeGaugeSpec({ id: 'G-1', serial: 's1' }));
  tt.defineTool(makeGaugeSpec({ id: 'G-2', serial: 's2' }));
  tt.scheduleMaintenance('G-1', 'calibration', iso(-2));
  tt.scheduleMaintenance('G-2', 'calibration', iso(-10));
  const overdue = tt.overdueTools();
  assert.equal(overdue.length, 2);
  assert.equal(overdue[0].id, 'G-2');   // 10 days late first
  assert.equal(overdue[1].id, 'G-1');
});

test('overdueTools excludes retired tools', () => {
  const tt = new ToolTracker();
  tt.defineTool(makeGaugeSpec());
  tt.scheduleMaintenance('GA-001', 'calibration', iso(-5));
  tt.retire('GA-001', 'End of life');
  assert.equal(tt.overdueTools().length, 0);
});

test('completeMaintenance closes an open entry and rolls a follow-up calibration', () => {
  const tt = new ToolTracker();
  tt.defineTool(makeGaugeSpec());
  const m = tt.scheduleMaintenance('GA-001', 'calibration', iso(5));
  const res = tt.completeMaintenance('GA-001', m.id, {
    completedBy: 'CAL-TECH-1', result: 'PASS',
  });
  assert.equal(res.closed.status, 'COMPLETED');
  assert.equal(res.closed.completedBy, 'CAL-TECH-1');
  assert.ok(res.followUp, 'a new calibration should be auto-scheduled');
  const t = tt.findById('GA-001');
  assert.equal(t.maintenanceLog.length, 2);
});

// ─────────────────────────────────────────────────────────────
// 5. checkout / returnTool
// ─────────────────────────────────────────────────────────────

test('checkout marks tool IN_USE and logs the entry', () => {
  const tt = new ToolTracker();
  tt.defineTool(makeDieSpec());
  const co = tt.checkout({
    toolId: 'DIE-001', borrower: 'OP-JONES', expectedReturn: iso(2),
  });
  assert.equal(co.status, 'OPEN');
  assert.equal(co.borrower, 'OP-JONES');
  const t = tt.findById('DIE-001');
  assert.equal(t.status, STATUS.IN_USE);
  assert.equal(t.currentCheckout, co.id);
});

test('checkout fails when tool already checked out', () => {
  const tt = new ToolTracker();
  tt.defineTool(makeDieSpec());
  tt.checkout({ toolId: 'DIE-001', borrower: 'OP-A', expectedReturn: iso(1) });
  assert.throws(
    () => tt.checkout({ toolId: 'DIE-001', borrower: 'OP-B', expectedReturn: iso(1) }),
    /already checked out/,
  );
});

test('returnTool closes checkout and returns to ACTIVE', () => {
  const tt = new ToolTracker();
  tt.defineTool(makeDieSpec());
  tt.checkout({ toolId: 'DIE-001', borrower: 'OP-A', expectedReturn: iso(1) });
  tt.returnTool({ toolId: 'DIE-001', returner: 'OP-A', condition: 'GOOD' });
  const t = tt.findById('DIE-001');
  assert.equal(t.status, STATUS.ACTIVE);
  assert.equal(t.currentCheckout, null);
  assert.equal(t.checkoutLog[0].status, 'RETURNED');
  assert.equal(t.checkoutLog[0].conditionOnReturn, 'GOOD');
});

test('returnTool with POOR condition quarantines and auto-schedules inspection', () => {
  const tt = new ToolTracker();
  tt.defineTool(makeDieSpec());
  tt.checkout({ toolId: 'DIE-001', borrower: 'OP-A', expectedReturn: iso(1) });
  tt.returnTool({ toolId: 'DIE-001', returner: 'OP-A', condition: 'POOR' });
  const t = tt.findById('DIE-001');
  assert.equal(t.status, STATUS.QUARANTINE);
  const openInspections = t.maintenanceLog.filter(
    (m) => m.type === 'inspection' && m.status === 'OPEN',
  );
  assert.equal(openInspections.length, 1);
});

test('returnTool DAMAGED also quarantines', () => {
  const tt = new ToolTracker();
  tt.defineTool(makeDieSpec());
  tt.checkout({ toolId: 'DIE-001', borrower: 'OP-A', expectedReturn: iso(1) });
  tt.returnTool({ toolId: 'DIE-001', returner: 'OP-A', condition: 'DAMAGED' });
  const t = tt.findById('DIE-001');
  assert.equal(t.status, STATUS.QUARANTINE);
});

test('returnTool fails when tool is not checked out', () => {
  const tt = new ToolTracker();
  tt.defineTool(makeDieSpec());
  assert.throws(
    () => tt.returnTool({ toolId: 'DIE-001', returner: 'X', condition: 'GOOD' }),
    /not currently checked out/,
  );
});

test('returnTool rejects invalid condition', () => {
  const tt = new ToolTracker();
  tt.defineTool(makeDieSpec());
  tt.checkout({ toolId: 'DIE-001', borrower: 'OP-A', expectedReturn: iso(1) });
  assert.throws(
    () => tt.returnTool({ toolId: 'DIE-001', returner: 'OP-A', condition: 'SPARKLING' }),
    /invalid condition/,
  );
});

// ─────────────────────────────────────────────────────────────
// 6. retire — NEVER deletes
// ─────────────────────────────────────────────────────────────

test('retire marks RETIRED and preserves usage history', () => {
  const tt = new ToolTracker();
  tt.defineTool(makeDieSpec());
  tt.recordUsage('DIE-001', {
    wo: 'WO-1', operation: 'punch', cycles: 5000, operator: 'OP-A',
  });
  tt.recordUsage('DIE-001', {
    wo: 'WO-2', operation: 'punch', cycles: 3000, operator: 'OP-B',
  });
  tt.retire('DIE-001', 'Worn past rated life');
  const t = tt.findById('DIE-001');
  assert.equal(t.status, STATUS.RETIRED);
  assert.equal(t.retireRecord.reason, 'Worn past rated life');
  assert.equal(t.retireRecord.finalTotalCycles, 8000);
  // History must remain intact.
  assert.equal(t.usageLog.length, 2);
  assert.equal(t.totalCycles, 8000);
});

test('retired tool still returns via findById and listAll', () => {
  const tt = new ToolTracker();
  tt.defineTool(makeDieSpec());
  tt.retire('DIE-001', 'EOL');
  assert.ok(tt.findById('DIE-001'));
  assert.equal(tt.listAll().length, 1);
  assert.equal(tt.listAll({ includeRetired: false }).length, 0);
});

test('retired tool blocks further mutations (recordUsage, checkout, schedule)', () => {
  const tt = new ToolTracker();
  tt.defineTool(makeDieSpec());
  tt.retire('DIE-001', 'EOL');
  assert.throws(() => tt.recordUsage('DIE-001', {
    wo: 'W', operation: 'op', cycles: 1, operator: 'O',
  }), /RETIRED/);
  assert.throws(() => tt.checkout({
    toolId: 'DIE-001', borrower: 'X', expectedReturn: iso(1),
  }), /RETIRED/);
  assert.throws(
    () => tt.scheduleMaintenance('DIE-001', 'inspection', iso(5)),
    /RETIRED/,
  );
});

test('retire fails when tool is currently checked out', () => {
  const tt = new ToolTracker();
  tt.defineTool(makeDieSpec());
  tt.checkout({ toolId: 'DIE-001', borrower: 'OP-A', expectedReturn: iso(1) });
  assert.throws(() => tt.retire('DIE-001', 'EOL'), /checked out/);
});

// ─────────────────────────────────────────────────────────────
// 7. alertNearEnd
// ─────────────────────────────────────────────────────────────

test('alertNearEnd flags tools at or above threshold', () => {
  const tt = new ToolTracker();
  tt.defineTool(makeDieSpec({ id: 'D-LOW',  rated_cycles: 1000 }));
  tt.defineTool(makeDieSpec({ id: 'D-MID',  rated_cycles: 1000, serial: 's2' }));
  tt.defineTool(makeDieSpec({ id: 'D-HIGH', rated_cycles: 1000, serial: 's3' }));
  tt.recordUsage('D-LOW',  { wo: 'W', operation: 'p', cycles: 400, operator: 'O' });
  tt.recordUsage('D-MID',  { wo: 'W', operation: 'p', cycles: 750, operator: 'O' });
  tt.recordUsage('D-HIGH', { wo: 'W', operation: 'p', cycles: 950, operator: 'O' });
  const alerts = tt.alertNearEnd(0.70);
  assert.equal(alerts.length, 2);
  // Most-worn first
  assert.equal(alerts[0].id, 'D-HIGH');
  assert.equal(alerts[0].wearLevel, WEAR_LEVELS.RED);
  assert.equal(alerts[1].id, 'D-MID');
  assert.equal(alerts[1].wearLevel, WEAR_LEVELS.YELLOW);
});

test('alertNearEnd excludes retired and uncounted tools', () => {
  const tt = new ToolTracker();
  tt.defineTool(makeDieSpec({ rated_cycles: 1000 }));
  tt.defineTool(makeGaugeSpec());
  tt.recordUsage('DIE-001', {
    wo: 'W', operation: 'p', cycles: 980, operator: 'O',
  });
  let alerts = tt.alertNearEnd();
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].id, 'DIE-001');
  tt.retire('DIE-001', 'EOL');
  alerts = tt.alertNearEnd();
  assert.equal(alerts.length, 0);
});

test('alertNearEnd default threshold uses yellow', () => {
  const tt = new ToolTracker();
  tt.defineTool(makeDieSpec({ rated_cycles: 1000 }));
  tt.recordUsage('DIE-001', {
    wo: 'W', operation: 'p', cycles: 700, operator: 'O',
  });
  assert.equal(tt.alertNearEnd().length, 1);
});

// ─────────────────────────────────────────────────────────────
// 8. Audit log
// ─────────────────────────────────────────────────────────────

test('audit log captures every mutation', () => {
  const tt = new ToolTracker();
  tt.defineTool(makeDieSpec());
  tt.recordUsage('DIE-001', {
    wo: 'W', operation: 'p', cycles: 10, operator: 'O',
  });
  tt.scheduleMaintenance('DIE-001', 'inspection', iso(5));
  tt.checkout({ toolId: 'DIE-001', borrower: 'OP-A', expectedReturn: iso(1) });
  tt.returnTool({ toolId: 'DIE-001', returner: 'OP-A', condition: 'GOOD' });
  tt.retire('DIE-001', 'EOL');
  const log = tt.getAuditLog();
  const actions = log.map((e) => e.action);
  assert.deepEqual(actions, [
    'defineTool',
    'recordUsage',
    'scheduleMaintenance',
    'checkout',
    'returnTool',
    'retire',
  ]);
});

test('listAll filters by type', () => {
  const tt = new ToolTracker();
  tt.defineTool(makeDieSpec());
  tt.defineTool(makeGaugeSpec());
  assert.equal(tt.listAll({ type: 'die' }).length, 1);
  assert.equal(tt.listAll({ type: 'gauge' }).length, 1);
  assert.equal(tt.listAll({ type: 'mold' }).length, 0);
});
