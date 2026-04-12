/**
 * wo-scheduler.test.js — Agent Y-033
 * Unit tests for the Work Order Scheduler (metal fabrication).
 *
 * Run with:
 *   node --test test/manufacturing/wo-scheduler.test.js
 *
 * Requires Node >= 18 (uses node:test).
 *
 * Coverage:
 *   - createWO / routing expansion
 *   - scheduleForward / scheduleBackward
 *   - Forward/backward equivalence (same makespan on an empty shop)
 *   - Finite capacity conflict detection
 *   - Critical-ratio priority ordering in dispatchList
 *   - Reschedule with cascade
 *   - updateProgress -> WO roll-up
 *   - computeOTD (on-time, late, in-progress-late)
 *   - Gantt data shape
 *   - Never-delete (cancelWO keeps record)
 *   - Hebrew glossary present
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const mod = require(path.resolve(
  __dirname, '..', '..',
  'onyx-procurement', 'src', 'manufacturing', 'wo-scheduler.js'
));

const {
  WorkOrderScheduler,
  WO_STATUS,
  OP_STATUS,
  PRIORITY,
  GLOSSARY_HE,
  _helpers,
} = mod;

// ─────────────────────────────────────────────────────────────
//  Shared fixtures
// ─────────────────────────────────────────────────────────────

function buildShop(extra = {}) {
  const s = new WorkOrderScheduler({
    now: '2026-04-11T06:00:00Z',
    workCenters: [
      { id: 'WC-LASER',  name: 'Laser cutter',   name_he: 'חיתוך לייזר',
        capacityMinPerDay: 480, efficiency: 1 },
      { id: 'WC-BEND',   name: 'Press brake',    name_he: 'כיפוף',
        capacityMinPerDay: 480, efficiency: 1 },
      { id: 'WC-WELD',   name: 'Welding booth',  name_he: 'ריתוך',
        capacityMinPerDay: 480, efficiency: 1 },
      { id: 'WC-PAINT',  name: 'Paint line',     name_he: 'צביעה',
        capacityMinPerDay: 480, efficiency: 1 },
    ],
    routings: [{
      id: 'RT-CABINET',
      sku: 'CAB-100',
      name: 'Steel cabinet',
      name_he: 'ארון פלדה',
      operations: [
        { op: 'OP10', seq: 10, workCenterId: 'WC-LASER',
          setupMin: 15, runMinPerUnit: 5, queueMin: 10, moveMin: 5,
          description: 'Laser cut sheets', description_he: 'חיתוך לייזר של לוחות' },
        { op: 'OP20', seq: 20, workCenterId: 'WC-BEND',
          setupMin: 20, runMinPerUnit: 7, queueMin: 15, moveMin: 5,
          description: 'Bend panels', description_he: 'כיפוף פנלים' },
        { op: 'OP30', seq: 30, workCenterId: 'WC-WELD',
          setupMin: 30, runMinPerUnit: 12, queueMin: 20, moveMin: 10,
          description: 'Weld assemblies', description_he: 'ריתוך מכלולים' },
        { op: 'OP40', seq: 40, workCenterId: 'WC-PAINT',
          setupMin: 10, runMinPerUnit: 3, queueMin: 30, moveMin: 0,
          description: 'Prime and paint', description_he: 'צבע ופריימר' },
      ],
    }],
    ...extra,
  });
  return s;
}

// ─────────────────────────────────────────────────────────────
//  Master data
// ─────────────────────────────────────────────────────────────

test('1. work centers and routings are registered', () => {
  const s = buildShop();
  assert.equal(s.listWorkCenters().length, 4);
  assert.ok(s.getWorkCenter('WC-LASER'));
  assert.equal(s.getRouting('RT-CABINET').operations.length, 4);
});

test('2. createWO validates required fields', () => {
  const s = buildShop();
  assert.throws(() => s.createWO(), /fields object required/);
  assert.throws(() => s.createWO({}), /sku required/);
  assert.throws(() => s.createWO({ sku: 'X' }), /qty > 0 required/);
  assert.throws(() => s.createWO({ sku: 'X', qty: 2 }), /routingId required/);
  assert.throws(
    () => s.createWO({ sku: 'X', qty: 2, routingId: 'nope' }),
    /routing not found/
  );
});

test('3. createWO expands routing into a schedule with runMin=qty*rate', () => {
  const s = buildShop();
  const wo = s.createWO({
    id: 'WO-1',
    sku: 'CAB-100',
    qty: 10,
    dueDate: '2026-04-15T14:00:00Z',
    priority: PRIORITY.HIGH,
    routingId: 'RT-CABINET',
    materialsAvailable: true,
  });
  assert.equal(wo.id, 'WO-1');
  assert.equal(wo.schedule.length, 4);
  assert.equal(wo.schedule[0].runMin, 50);   // 5 min/unit × 10
  assert.equal(wo.schedule[1].runMin, 70);   // 7 × 10
  assert.equal(wo.schedule[2].runMin, 120);  // 12 × 10
  assert.equal(wo.schedule[3].runMin, 30);   // 3 × 10
  assert.equal(wo.status, WO_STATUS.DRAFT);
});

// ─────────────────────────────────────────────────────────────
//  Forward / backward scheduling
// ─────────────────────────────────────────────────────────────

test('4. scheduleForward sequences operations respecting setup + queue + move', () => {
  const s = buildShop();
  s.createWO({
    id: 'WO-F', sku: 'CAB-100', qty: 5, routingId: 'RT-CABINET',
    dueDate: '2026-05-01T00:00:00Z', priority: PRIORITY.MED,
    materialsAvailable: true,
  });
  const res = s.scheduleForward('WO-F', '2026-04-11T06:00:00Z');
  // Every op has plannedStart < plannedEnd
  for (const step of res.schedule) {
    assert.ok(step.plannedStart);
    assert.ok(step.plannedEnd);
    assert.ok(
      _helpers.toDate(step.plannedStart).getTime() < _helpers.toDate(step.plannedEnd).getTime(),
      `${step.op} start must precede end`
    );
  }
  // op2 start >= op1 end + moveMin(op1)
  const op1 = res.schedule[0];
  const op2 = res.schedule[1];
  const gap = _helpers.diffMinutes(op1.plannedEnd, op2.plannedStart);
  // gap = move(op1) + queue(op2)  ... = 5 + 15 = 20 min
  assert.ok(gap >= 20, `expected gap >= 20, got ${gap}`);
  assert.equal(res.direction, 'forward');
});

test('5. scheduleBackward finishes just-in-time for dueDate', () => {
  const s = buildShop();
  s.createWO({
    id: 'WO-B', sku: 'CAB-100', qty: 5, routingId: 'RT-CABINET',
    dueDate: '2026-04-20T14:00:00Z', priority: PRIORITY.MED,
    materialsAvailable: true,
  });
  const res = s.scheduleBackward('WO-B', '2026-04-20T14:00:00Z');
  const lastStep = res.schedule[res.schedule.length - 1];
  // last op's end + its moveMin should equal the due date
  const endPlusMove = _helpers.addMinutes(lastStep.plannedEnd, lastStep.moveMin);
  assert.equal(endPlusMove, '2026-04-20T14:00:00.000Z');
  assert.equal(res.direction, 'backward');
});

test('6. forward/backward produce the same total work duration on an empty shop', () => {
  const s1 = buildShop();
  s1.createWO({
    id: 'WO-X', sku: 'CAB-100', qty: 3, routingId: 'RT-CABINET',
    dueDate: '2026-05-01T00:00:00Z', priority: PRIORITY.HIGH,
    materialsAvailable: true,
  });
  const fwd = s1.scheduleForward('WO-X', '2026-04-11T06:00:00Z');
  const fwdSpan = _helpers.diffMinutes(fwd.plannedStart, fwd.plannedEnd);

  const s2 = buildShop();
  s2.createWO({
    id: 'WO-X', sku: 'CAB-100', qty: 3, routingId: 'RT-CABINET',
    dueDate: '2026-05-01T00:00:00Z', priority: PRIORITY.HIGH,
    materialsAvailable: true,
  });
  const bwd = s2.scheduleBackward('WO-X', '2026-05-01T00:00:00Z');
  const bwdSpan = _helpers.diffMinutes(bwd.plannedStart, bwd.plannedEnd);

  assert.equal(fwdSpan, bwdSpan,
    `forward span (${fwdSpan}) must equal backward span (${bwdSpan}) on an empty shop`);
});

// ─────────────────────────────────────────────────────────────
//  Finite capacity conflict detection
// ─────────────────────────────────────────────────────────────

test('7. finiteCapacityCheck detects overlap on a single work center', () => {
  const s = buildShop();
  // Two WOs scheduled forward at the same instant — will collide on OP10
  s.createWO({
    id: 'WO-A', sku: 'CAB-100', qty: 10, routingId: 'RT-CABINET',
    dueDate: '2026-04-30T00:00:00Z', priority: PRIORITY.HIGH,
    materialsAvailable: true,
  });
  s.createWO({
    id: 'WO-B', sku: 'CAB-100', qty: 10, routingId: 'RT-CABINET',
    dueDate: '2026-04-30T00:00:00Z', priority: PRIORITY.HIGH,
    materialsAvailable: true,
  });
  s.scheduleForward('WO-A', '2026-04-11T06:00:00Z');
  // Force a conflict by giving WO-B a simulated overlapping slot
  const simSchedule = s.getWO('WO-A').schedule.map((x) => ({
    workCenterId: x.workCenterId,
    woId: 'WO-SIM',
    op: x.op,
    start: x.plannedStart,
    end: x.plannedEnd,
  }));
  const check = s.finiteCapacityCheck(simSchedule);
  assert.ok(check.conflicts.length >= 1, 'at least one conflict expected');
  const first = check.conflicts[0];
  assert.ok(first.workCenterId);
  assert.ok(first.overlapMin > 0);
});

test('8. scheduleForward of back-to-back WOs respects finite capacity (no overlap)', () => {
  const s = buildShop();
  s.createWO({
    id: 'WO-1', sku: 'CAB-100', qty: 5, routingId: 'RT-CABINET',
    dueDate: '2026-04-30T00:00:00Z', priority: PRIORITY.HIGH,
    materialsAvailable: true,
  });
  s.createWO({
    id: 'WO-2', sku: 'CAB-100', qty: 5, routingId: 'RT-CABINET',
    dueDate: '2026-04-30T00:00:00Z', priority: PRIORITY.HIGH,
    materialsAvailable: true,
  });
  s.scheduleForward('WO-1', '2026-04-11T06:00:00Z');
  s.scheduleForward('WO-2', '2026-04-11T06:00:00Z');
  const check = s.finiteCapacityCheck();
  assert.equal(check.conflicts.length, 0, 'overlapping bookings must be auto-resolved');
});

test('9. per-day capacity overload is reported in utilizationWarn', () => {
  const s = new WorkOrderScheduler({
    now: '2026-04-11T06:00:00Z',
    workCenters: [
      { id: 'WC-SMALL', name: 'Tiny', name_he: 'זעיר',
        capacityMinPerDay: 60 },  // 60 min/day
    ],
    routings: [{
      id: 'RT-SMALL',
      sku: 'SM-1',
      operations: [{
        op: 'OP10', seq: 10, workCenterId: 'WC-SMALL',
        setupMin: 10, runMinPerUnit: 5, queueMin: 0, moveMin: 0,
      }],
    }],
  });
  s.createWO({
    id: 'WO-Z', sku: 'SM-1', qty: 20, routingId: 'RT-SMALL',
    dueDate: '2026-04-12T00:00:00Z', priority: PRIORITY.HIGH,
    materialsAvailable: true,
  });
  s.scheduleForward('WO-Z', '2026-04-11T06:00:00Z');
  const check = s.finiteCapacityCheck();
  assert.ok(check.utilizationWarn.length >= 1,
    'daily capacity must be exceeded');
  assert.ok(check.utilizationWarn[0].bookedMin > check.utilizationWarn[0].capacityMin);
});

// ─────────────────────────────────────────────────────────────
//  Critical ratio & dispatch list
// ─────────────────────────────────────────────────────────────

test('10. criticalRatio is < 1 for urgent WOs, > 1 for relaxed ones', () => {
  const s = buildShop();
  s.createWO({
    id: 'WO-URG', sku: 'CAB-100', qty: 20, routingId: 'RT-CABINET',
    dueDate: '2026-04-11T12:00:00Z', // due in 6 hours
    priority: PRIORITY.CRITICAL,
    materialsAvailable: true,
  });
  s.createWO({
    id: 'WO-RELAX', sku: 'CAB-100', qty: 2, routingId: 'RT-CABINET',
    dueDate: '2026-06-30T12:00:00Z', // months away
    priority: PRIORITY.LOW,
    materialsAvailable: true,
  });
  const crUrgent = s.criticalRatio('WO-URG');
  const crRelax  = s.criticalRatio('WO-RELAX');
  assert.ok(crUrgent < 1, `urgent CR should be < 1, got ${crUrgent}`);
  assert.ok(crRelax > 1, `relaxed CR should be > 1, got ${crRelax}`);
});

test('11. dispatchList orders urgent WOs first by critical-ratio score', () => {
  const s = buildShop();
  s.createWO({
    id: 'WO-LATE', sku: 'CAB-100', qty: 5, routingId: 'RT-CABINET',
    dueDate: '2026-04-11T18:00:00Z',
    priority: PRIORITY.HIGH,
    materialsAvailable: true,
  });
  s.createWO({
    id: 'WO-EASY', sku: 'CAB-100', qty: 5, routingId: 'RT-CABINET',
    dueDate: '2026-05-30T12:00:00Z',
    priority: PRIORITY.LOW,
    materialsAvailable: true,
  });
  s.scheduleForward('WO-LATE', '2026-04-11T06:00:00Z');
  s.scheduleForward('WO-EASY', '2026-04-11T06:00:00Z');
  const list = s.dispatchList('WC-LASER', '2026-04-11');
  assert.ok(list.length >= 2);
  assert.equal(list[0].woId, 'WO-LATE', 'urgent WO should lead the dispatch list');
});

// ─────────────────────────────────────────────────────────────
//  Reschedule cascade
// ─────────────────────────────────────────────────────────────

test('12. reschedule with shift.days moves the WO forward and cascades', () => {
  const s = buildShop();
  s.createWO({
    id: 'WO-P1', sku: 'CAB-100', qty: 5, routingId: 'RT-CABINET',
    dueDate: '2026-04-30T00:00:00Z', priority: PRIORITY.HIGH,
    materialsAvailable: true,
  });
  s.createWO({
    id: 'WO-P2', sku: 'CAB-100', qty: 5, routingId: 'RT-CABINET',
    dueDate: '2026-05-30T00:00:00Z', priority: PRIORITY.LOW,
    materialsAvailable: true,
  });
  s.scheduleForward('WO-P1', '2026-04-11T06:00:00Z');
  s.scheduleForward('WO-P2', '2026-04-11T10:00:00Z');

  const origStart = s.getWO('WO-P1').plannedStart;
  const origOrigMs = _helpers.toDate(origStart).getTime();

  const res = s.reschedule({
    woId: 'WO-P1',
    reason: 'machine down',
    shift: { days: 1 },
  });
  const newStartMs = _helpers.toDate(s.getWO('WO-P1').plannedStart).getTime();
  assert.ok(newStartMs >= origOrigMs + 23 * 60 * 60 * 1000,
    'WO-P1 should be pushed forward by ~1 day');
  assert.ok(Array.isArray(res.cascade), 'cascade array returned');
  // After cascade: final capacity check should be clean
  const check = s.finiteCapacityCheck();
  assert.equal(check.conflicts.length, 0,
    'cascade should leave no residual conflicts');
});

test('13. reschedule requires shift argument', () => {
  const s = buildShop();
  s.createWO({
    id: 'WO-N', sku: 'CAB-100', qty: 2, routingId: 'RT-CABINET',
    dueDate: '2026-04-30T00:00:00Z', priority: PRIORITY.MED,
    materialsAvailable: true,
  });
  s.scheduleForward('WO-N', '2026-04-11T06:00:00Z');
  assert.throws(() => s.reschedule({ woId: 'WO-N' }), /shift required/);
});

// ─────────────────────────────────────────────────────────────
//  Shop-floor feedback
// ─────────────────────────────────────────────────────────────

test('14. updateProgress rolls progress into WO status', () => {
  const s = buildShop();
  s.createWO({
    id: 'WO-R', sku: 'CAB-100', qty: 4, routingId: 'RT-CABINET',
    dueDate: '2026-04-30T00:00:00Z', priority: PRIORITY.HIGH,
    materialsAvailable: true,
  });
  s.scheduleForward('WO-R', '2026-04-11T06:00:00Z');
  s.updateProgress('WO-R', 'OP10', {
    actualStart: '2026-04-11T06:15:00Z',
    actualEnd: '2026-04-11T07:30:00Z',
    quantityCompleted: 4,
  });
  let w = s.getWO('WO-R');
  assert.equal(w.schedule[0].status, OP_STATUS.DONE);
  assert.equal(w.status, WO_STATUS.IN_PROGRESS);

  s.updateProgress('WO-R', 'OP20', {
    actualStart: '2026-04-11T07:50:00Z',
    quantityCompleted: 2,
  });
  w = s.getWO('WO-R');
  assert.equal(w.schedule[1].status, OP_STATUS.RUNNING);

  s.updateProgress('WO-R', 'OP20', {
    actualEnd: '2026-04-11T09:30:00Z',
    quantityCompleted: 4,
  });
  s.updateProgress('WO-R', 'OP30', {
    actualStart: '2026-04-11T10:10:00Z',
    actualEnd: '2026-04-11T12:30:00Z',
    quantityCompleted: 4,
  });
  s.updateProgress('WO-R', 'OP40', {
    actualStart: '2026-04-11T13:10:00Z',
    actualEnd: '2026-04-11T13:40:00Z',
    quantityCompleted: 4,
  });
  w = s.getWO('WO-R');
  assert.equal(w.status, WO_STATUS.DONE);
  assert.ok(w.actualStart);
  assert.ok(w.actualEnd);
});

test('15. updateProgress rejects unknown op codes', () => {
  const s = buildShop();
  s.createWO({
    id: 'WO-U', sku: 'CAB-100', qty: 1, routingId: 'RT-CABINET',
    dueDate: '2026-04-30T00:00:00Z', priority: PRIORITY.MED,
    materialsAvailable: true,
  });
  s.scheduleForward('WO-U', '2026-04-11T06:00:00Z');
  assert.throws(() => s.updateProgress('WO-U', 'NO-SUCH-OP', { quantityCompleted: 1 }),
    /op not found/);
});

// ─────────────────────────────────────────────────────────────
//  OTD
// ─────────────────────────────────────────────────────────────

test('16. computeOTD counts on-time vs late', () => {
  const s = buildShop();

  // WO-ONTIME: done before due
  s.createWO({
    id: 'WO-ONTIME', sku: 'CAB-100', qty: 2, routingId: 'RT-CABINET',
    dueDate: '2026-04-30T00:00:00Z', priority: PRIORITY.MED,
    materialsAvailable: true,
  });
  s.scheduleForward('WO-ONTIME', '2026-04-11T06:00:00Z');
  for (const step of s.getWO('WO-ONTIME').schedule) {
    s.updateProgress('WO-ONTIME', step.op, {
      actualStart: step.plannedStart,
      actualEnd:   step.plannedEnd,
      quantityCompleted: 2,
    });
  }

  // WO-LATEDONE: done AFTER due
  s.createWO({
    id: 'WO-LATEDONE', sku: 'CAB-100', qty: 2, routingId: 'RT-CABINET',
    dueDate: '2026-04-12T06:00:00Z', priority: PRIORITY.MED,
    materialsAvailable: true,
  });
  s.scheduleForward('WO-LATEDONE', '2026-04-11T06:00:00Z');
  for (const step of s.getWO('WO-LATEDONE').schedule) {
    s.updateProgress('WO-LATEDONE', step.op, {
      actualStart: step.plannedStart,
      actualEnd:   '2026-04-15T09:00:00Z',
      quantityCompleted: 2,
    });
  }

  // WO-STILLOPEN: due was yesterday, still running → "inProgressLate"
  s.createWO({
    id: 'WO-OPENLATE', sku: 'CAB-100', qty: 2, routingId: 'RT-CABINET',
    dueDate: '2026-04-10T00:00:00Z', priority: PRIORITY.HIGH,
    materialsAvailable: true,
  });
  s.scheduleForward('WO-OPENLATE', '2026-04-11T06:00:00Z');

  const otd = s.computeOTD();
  assert.equal(otd.total, 3);
  assert.equal(otd.onTime, 1);
  assert.equal(otd.late, 2);
  assert.equal(otd.inProgressLate, 1);
  assert.ok(otd.rate > 0 && otd.rate < 1,
    `rate should be between 0 and 1, got ${otd.rate}`);
  // 1/3 ≈ 33.3%
  assert.ok(Math.abs(otd.ratePct - 33.3) < 0.5);
});

// ─────────────────────────────────────────────────────────────
//  Gantt data
// ─────────────────────────────────────────────────────────────

test('17. ganttData returns tasks & milestones in X-24 shape', () => {
  const s = buildShop();
  s.createWO({
    id: 'WO-G', sku: 'CAB-100', qty: 3, routingId: 'RT-CABINET',
    dueDate: '2026-04-20T12:00:00Z', priority: PRIORITY.HIGH,
    materialsAvailable: true,
  });
  s.scheduleForward('WO-G', '2026-04-11T06:00:00Z');
  const g = s.ganttData();
  assert.ok(Array.isArray(g.tasks));
  assert.ok(Array.isArray(g.milestones));
  assert.ok(g.tasks.length >= 5, 'at least 4 op rows + 1 header');
  const header = g.tasks.find((t) => t.header && t.id === 'WO-G');
  assert.ok(header, 'wo-level header row');
  assert.ok(header.title_he.includes('פקודת עבודה'));
  const milestone = g.milestones.find((m) => m.wo_id === 'WO-G');
  assert.ok(milestone);
  assert.ok(milestone.name_he.includes('יעד אספקה'));
});

// ─────────────────────────────────────────────────────────────
//  Never-delete + glossary
// ─────────────────────────────────────────────────────────────

test('18. cancelWO keeps the record (never-delete)', () => {
  const s = buildShop();
  s.createWO({
    id: 'WO-C', sku: 'CAB-100', qty: 1, routingId: 'RT-CABINET',
    dueDate: '2026-04-30T00:00:00Z', priority: PRIORITY.MED,
    materialsAvailable: true,
  });
  s.scheduleForward('WO-C', '2026-04-11T06:00:00Z');
  const beforeCount = s.listWOs().length;
  s.cancelWO('WO-C', 'client request');
  const afterCount = s.listWOs().length;
  assert.equal(beforeCount, afterCount, 'WO is still listed');
  const w = s.getWO('WO-C');
  assert.equal(w.status, WO_STATUS.CANCELLED);
  assert.equal(w.cancelReason, 'client request');
});

test('19. GLOSSARY_HE exposes the Hebrew terminology', () => {
  assert.equal(GLOSSARY_HE.work_order, 'פקודת עבודה');
  assert.equal(GLOSSARY_HE.critical_ratio, 'יחס קריטי');
  assert.equal(GLOSSARY_HE.otd, 'אחוז עמידה ביעד אספקה');
});

test('20. events are emitted for create / schedule / progress', () => {
  const s = buildShop();
  s.createWO({
    id: 'WO-E', sku: 'CAB-100', qty: 1, routingId: 'RT-CABINET',
    dueDate: '2026-04-30T00:00:00Z', priority: PRIORITY.MED,
    materialsAvailable: true,
  });
  s.scheduleForward('WO-E', '2026-04-11T06:00:00Z');
  s.updateProgress('WO-E', 'OP10', {
    actualStart: '2026-04-11T06:20:00Z',
    quantityCompleted: 1,
  });
  const types = s.getEvents().map((e) => e.type);
  assert.ok(types.includes('wo.created'));
  assert.ok(types.includes('wo.scheduled.forward'));
  assert.ok(types.includes('wo.progress'));
});
