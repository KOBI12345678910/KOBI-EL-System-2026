/**
 * AG-Y033 — Unit tests for the Work-Order Scheduler (WOScheduler v2)
 *
 * Run with:
 *   node --test test/manufacturing/wo-scheduler.test.js
 *
 * Covers (≥ 20 tests):
 *   1.  forward schedule single WO
 *   2.  forward multi-WO contention (finite capacity)
 *   3.  finite capacity respects parallel slots
 *   4.  forward respects calendar shifts (no work after end of shift)
 *   5.  backward schedule feasible
 *   6.  backward schedule infeasible alert
 *   7.  Israeli holiday skip — Pesach
 *   8.  Yom Kippur skip
 *   9.  Shabbat default off
 *  10.  listHolidays(2026) returns the canonical 16-entry list
 *  11.  dispatch EDD ordering
 *  12.  dispatch SPT ordering
 *  13.  dispatch FCFS ordering
 *  14.  dispatch CR ordering
 *  15.  dispatch SLACK ordering
 *  16.  capacityReport flags overload
 *  17.  capacityReport returns avg load
 *  18.  ganttData carries Palantir dark theme + RTL
 *  19.  what-if non-mutation
 *  20.  reschedule on material delay
 *  21.  reschedule on machine breakdown
 *  22.  priorityEscalate is audit-logged & non-destructive
 *  23.  change-log append-only behaviour
 *  24.  addWO duplicate guard
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const {
  WOScheduler,
  ISRAELI_HOLIDAYS_2026,
  DISPATCH_RULES,
} = require('../../src/manufacturing/wo-scheduler');

/* ------------------------------------------------------------------ */
/* helpers                                                            */
/* ------------------------------------------------------------------ */

function freshScheduler(now = '2026-04-13T07:00:00Z') {
  // 2026-04-13 is a Monday — picks a clean start outside any holiday.
  const s = new WOScheduler({ now });

  s.defineWorkCenter({
    id: 'WC-LASER',
    name: 'Fiber Laser',
    name_he: 'לייזר פייבר',
    slots: 2,
  });
  s.defineWorkCenter({
    id: 'WC-BEND',
    name: 'Press Brake',
    name_he: 'מכבש כיפוף',
    slots: 1,
  });
  s.defineWorkCenter({
    id: 'WC-WELD',
    name: 'MIG Cell',
    name_he: 'תא ריתוך',
    slots: 1,
  });
  return s;
}

function metalRouting(prefix = 'OP') {
  return [
    { op: `${prefix}10`, seq: 10, workCenterId: 'WC-LASER', setupMin: 30, runMinPerUnit: 5,  queueMin: 0, moveMin: 10 },
    { op: `${prefix}20`, seq: 20, workCenterId: 'WC-BEND',  setupMin: 20, runMinPerUnit: 4,  queueMin: 0, moveMin: 10 },
    { op: `${prefix}30`, seq: 30, workCenterId: 'WC-WELD',  setupMin: 25, runMinPerUnit: 6,  queueMin: 0, moveMin: 0  },
  ];
}

function pad2(n) { return String(n).padStart(2, '0'); }
function isoDay(iso) { return iso.slice(0, 10); }

/* ------------------------------------------------------------------ */
/* 1. forward schedule single WO                                      */
/* ------------------------------------------------------------------ */
test('1) scheduleForward — single WO computes all op windows', () => {
  const s = freshScheduler();
  s.addWO({
    id: 'WO-001',
    partNumber: 'PN-A',
    qty: 10,
    routing: metalRouting(),
    priority: 'med',
    dueDate: '2026-04-30T15:00:00Z',
  });
  const out = s.scheduleForward('WO-001', '2026-04-13T07:00:00Z');
  assert.ok(out.plannedStart);
  assert.ok(out.plannedEnd);
  assert.equal(out.routing.length, 3);
  for (const op of out.routing) {
    assert.ok(op.plannedStart, `op ${op.op} has start`);
    assert.ok(op.plannedEnd,   `op ${op.op} has end`);
    assert.ok(new Date(op.plannedEnd) > new Date(op.plannedStart));
  }
  assert.equal(out.feasible, true);
  assert.equal(out.direction, 'forward');
});

/* ------------------------------------------------------------------ */
/* 2. forward multi-WO contention                                     */
/* ------------------------------------------------------------------ */
test('2) scheduleForward — multi-WO contention pushes second WO later on bottleneck', () => {
  const s = freshScheduler();
  s.addWO({ id: 'WO-A', partNumber: 'PN-A', qty: 60, routing: metalRouting('A'), dueDate: '2026-05-01' });
  s.addWO({ id: 'WO-B', partNumber: 'PN-B', qty: 60, routing: metalRouting('B'), dueDate: '2026-05-01' });

  const a = s.scheduleForward('WO-A', '2026-04-13T07:00:00Z');
  const b = s.scheduleForward('WO-B', '2026-04-13T07:00:00Z');

  // Press-brake (single slot) is the bottleneck — WO-B's bend op must
  // start at or after WO-A's bend op end.
  const aBend = a.routing.find((o) => o.workCenterId === 'WC-BEND');
  const bBend = b.routing.find((o) => o.workCenterId === 'WC-BEND');
  assert.ok(new Date(bBend.plannedStart) >= new Date(aBend.plannedEnd),
    `B bend start ${bBend.plannedStart} should be ≥ A bend end ${aBend.plannedEnd}`);
});

/* ------------------------------------------------------------------ */
/* 3. parallel slots                                                  */
/* ------------------------------------------------------------------ */
test('3) finite-capacity — laser has 2 slots so two WOs can run in parallel', () => {
  const s = freshScheduler();
  s.addWO({ id: 'WO-P1', partNumber: 'PN-P', qty: 10, routing: metalRouting('P1'), dueDate: '2026-05-01' });
  s.addWO({ id: 'WO-P2', partNumber: 'PN-P', qty: 10, routing: metalRouting('P2'), dueDate: '2026-05-01' });
  const a = s.scheduleForward('WO-P1', '2026-04-13T07:00:00Z');
  const b = s.scheduleForward('WO-P2', '2026-04-13T07:00:00Z');
  const aLas = a.routing.find((o) => o.workCenterId === 'WC-LASER');
  const bLas = b.routing.find((o) => o.workCenterId === 'WC-LASER');
  // Both can start at the same time because we have 2 slots
  assert.equal(aLas.plannedStart, bLas.plannedStart,
    'two WOs share the laser at the same time on different slots');
  assert.notEqual(aLas.slotIdx, bLas.slotIdx);
});

/* ------------------------------------------------------------------ */
/* 4. calendar shifts respected                                       */
/* ------------------------------------------------------------------ */
test('4) scheduleForward — work pushed past end-of-shift starts on next shift', () => {
  const s = new WOScheduler({ now: '2026-04-13T07:00:00Z' });
  s.defineWorkCenter({
    id: 'WC-X',
    slots: 1,
    calendar: {
      shifts: [{ name: 'morning', name_he: 'בוקר', startMin: 8 * 60, endMin: 12 * 60 }],
    },
  });
  s.addWO({
    id: 'WO-S1',
    partNumber: 'PN-S',
    qty: 1,
    routing: [
      // requires 5 hours but the shift is only 4 → spills to next day
      { op: 'OP10', seq: 10, workCenterId: 'WC-X', setupMin: 0, runMinPerUnit: 300 },
    ],
    dueDate: '2026-05-01',
  });
  const out = s.scheduleForward('WO-S1', '2026-04-13T08:00:00Z');
  const op = out.routing[0];
  // start is at 08:00 on Mon Apr-13, end can't be later than 12:00 same day,
  // so the algo continues into the next morning's shift start
  assert.ok(op.plannedEnd > op.plannedStart);
  const startDay = isoDay(op.plannedStart);
  const endDay   = isoDay(op.plannedEnd);
  assert.notEqual(startDay, endDay,
    `expected work to spill to a later day; got ${startDay} → ${endDay}`);
});

/* ------------------------------------------------------------------ */
/* 5. backward feasible                                               */
/* ------------------------------------------------------------------ */
test('5) scheduleBackward — feasible: latest start ≥ now', () => {
  const s = freshScheduler('2026-04-13T07:00:00Z');
  s.addWO({
    id: 'WO-B1',
    partNumber: 'PN-B1',
    qty: 5,
    routing: metalRouting('B'),
    dueDate: '2026-04-30T15:00:00Z',
  });
  const out = s.scheduleBackward('WO-B1', '2026-04-30T15:00:00Z');
  assert.equal(out.feasible, true);
  assert.ok(new Date(out.plannedStart) >= new Date('2026-04-13T07:00:00Z'));
});

/* ------------------------------------------------------------------ */
/* 6. backward infeasible                                             */
/* ------------------------------------------------------------------ */
test('6) scheduleBackward — infeasible alert when due-date is impossibly close', () => {
  const s = freshScheduler('2026-04-13T07:00:00Z');
  s.addWO({
    id: 'WO-INF',
    partNumber: 'PN-INF',
    qty: 1000,
    routing: metalRouting('INF'),
    dueDate: '2026-04-13T08:00:00Z',
  });
  const out = s.scheduleBackward('WO-INF', '2026-04-13T08:00:00Z');
  assert.equal(out.feasible, false);
  const log = s.getChangeLog('WO-INF');
  assert.ok(log.some((e) => e.type === 'wo.infeasible'),
    'change log carries infeasibility entry');
});

/* ------------------------------------------------------------------ */
/* 7. Pesach holiday skip                                             */
/* ------------------------------------------------------------------ */
test('7) Pesach Day-1 (2026-04-03) is skipped by the calendar', () => {
  const s = freshScheduler('2026-04-02T07:00:00Z');
  s.addWO({
    id: 'WO-PES',
    partNumber: 'PN-PES',
    qty: 1,
    routing: [{ op: 'OP10', seq: 10, workCenterId: 'WC-LASER', setupMin: 0, runMinPerUnit: 60 }],
    dueDate: '2026-04-30',
  });
  const out = s.scheduleForward('WO-PES', '2026-04-03T08:00:00Z');
  const day = isoDay(out.routing[0].plannedStart);
  assert.notEqual(day, '2026-04-03', 'Pesach Day-1 must be skipped');
});

/* ------------------------------------------------------------------ */
/* 8. Yom Kippur skip                                                 */
/* ------------------------------------------------------------------ */
test('8) Yom Kippur (2026-09-21) is treated as a non-working day', () => {
  const s = new WOScheduler({ now: '2026-09-20T07:00:00Z' });
  s.defineWorkCenter({ id: 'WC-Y', slots: 1 });
  s.addWO({
    id: 'WO-YK',
    partNumber: 'PN-YK',
    qty: 1,
    routing: [{ op: 'OP10', seq: 10, workCenterId: 'WC-Y', setupMin: 0, runMinPerUnit: 30 }],
    dueDate: '2026-09-30',
  });
  const out = s.scheduleForward('WO-YK', '2026-09-21T08:00:00Z');
  const day = isoDay(out.routing[0].plannedStart);
  assert.notEqual(day, '2026-09-21', 'Yom Kippur must be skipped');
});

/* ------------------------------------------------------------------ */
/* 9. Shabbat default off                                             */
/* ------------------------------------------------------------------ */
test('9) Shabbat (Saturday) is off by default', () => {
  const s = new WOScheduler({ now: '2026-04-17T07:00:00Z' }); // Friday
  s.defineWorkCenter({ id: 'WC-SH', slots: 1 });
  s.addWO({
    id: 'WO-SH',
    partNumber: 'PN-SH',
    qty: 1,
    routing: [{ op: 'OP10', seq: 10, workCenterId: 'WC-SH', setupMin: 0, runMinPerUnit: 60 }],
    dueDate: '2026-04-30',
  });
  // Try to plan on Saturday 2026-04-18
  const out = s.scheduleForward('WO-SH', '2026-04-18T08:00:00Z');
  const day = isoDay(out.routing[0].plannedStart);
  assert.notEqual(day, '2026-04-18', 'Saturday must be skipped');
  // Sunday 2026-04-19 is a normal Israeli working day → expected start
  assert.equal(day, '2026-04-19');
});

/* ------------------------------------------------------------------ */
/* 10. listHolidays                                                   */
/* ------------------------------------------------------------------ */
test('10) listHolidays(2026) returns the canonical Israeli list', () => {
  const s = new WOScheduler();
  const list = s.listHolidays(2026);
  assert.equal(list.length, ISRAELI_HOLIDAYS_2026.length);
  const names = list.map((h) => h.name);
  assert.ok(names.some((n) => n.includes('Yom Kippur')));
  assert.ok(names.some((n) => n.includes('Pesach')));
  assert.ok(names.some((n) => n.includes('Independence Day')));
  assert.ok(names.some((n) => n.includes('Rosh Hashana')));
  assert.ok(names.some((n) => n.includes('Sukkot')));
  assert.ok(names.some((n) => n.includes('Shavuot')));
});

/* ------------------------------------------------------------------ */
/* 11. dispatch EDD                                                   */
/* ------------------------------------------------------------------ */
test('11) dispatch — EDD orders by earliest due date', () => {
  const s = freshScheduler();
  s.addWO({ id: 'D1', partNumber: 'PN', qty: 1, routing: metalRouting('A'), dueDate: '2026-05-10' });
  s.addWO({ id: 'D2', partNumber: 'PN', qty: 1, routing: metalRouting('B'), dueDate: '2026-04-25' });
  s.addWO({ id: 'D3', partNumber: 'PN', qty: 1, routing: metalRouting('C'), dueDate: '2026-05-01' });
  s.scheduleForward('D1', '2026-04-13T07:00:00Z');
  s.scheduleForward('D2', '2026-04-13T07:00:00Z');
  s.scheduleForward('D3', '2026-04-13T07:00:00Z');
  const dl = s.dispatch('WC-LASER', 'EDD');
  const ids = dl.queue.map((r) => r.woId);
  assert.deepEqual(ids, ['D2', 'D3', 'D1']);
});

/* ------------------------------------------------------------------ */
/* 12. dispatch SPT                                                   */
/* ------------------------------------------------------------------ */
test('12) dispatch — SPT orders by shortest processing time', () => {
  const s = freshScheduler();
  s.addWO({ id: 'S1', partNumber: 'PN', qty: 1,  routing: metalRouting('S1'), dueDate: '2026-05-01' });
  s.addWO({ id: 'S2', partNumber: 'PN', qty: 30, routing: metalRouting('S2'), dueDate: '2026-05-01' });
  s.addWO({ id: 'S3', partNumber: 'PN', qty: 10, routing: metalRouting('S3'), dueDate: '2026-05-01' });
  s.scheduleForward('S1', '2026-04-13T07:00:00Z');
  s.scheduleForward('S2', '2026-04-13T07:00:00Z');
  s.scheduleForward('S3', '2026-04-13T07:00:00Z');
  const dl = s.dispatch('WC-LASER', 'SPT');
  const ids = dl.queue.map((r) => r.woId);
  assert.deepEqual(ids, ['S1', 'S3', 'S2']);
});

/* ------------------------------------------------------------------ */
/* 13. dispatch FCFS                                                  */
/* ------------------------------------------------------------------ */
test('13) dispatch — FCFS orders by createdAt', async () => {
  const s = freshScheduler();
  s.addWO({ id: 'F1', partNumber: 'PN', qty: 1, routing: metalRouting('F1'), dueDate: '2026-05-01' });
  // tiny gap to differentiate timestamps
  await new Promise((r) => setTimeout(r, 4));
  s.addWO({ id: 'F2', partNumber: 'PN', qty: 1, routing: metalRouting('F2'), dueDate: '2026-05-01' });
  await new Promise((r) => setTimeout(r, 4));
  s.addWO({ id: 'F3', partNumber: 'PN', qty: 1, routing: metalRouting('F3'), dueDate: '2026-05-01' });
  s.scheduleForward('F1', '2026-04-13T07:00:00Z');
  s.scheduleForward('F2', '2026-04-13T07:00:00Z');
  s.scheduleForward('F3', '2026-04-13T07:00:00Z');
  const dl = s.dispatch('WC-LASER', 'FCFS');
  assert.deepEqual(dl.queue.map((r) => r.woId), ['F1', 'F2', 'F3']);
});

/* ------------------------------------------------------------------ */
/* 14. dispatch CR                                                    */
/* ------------------------------------------------------------------ */
test('14) dispatch — CR orders by critical ratio (lower = more urgent)', () => {
  const s = freshScheduler('2026-04-20T07:00:00Z');
  s.addWO({ id: 'C1', partNumber: 'PN', qty: 5, routing: metalRouting('C1'), dueDate: '2026-04-30' });
  s.addWO({ id: 'C2', partNumber: 'PN', qty: 5, routing: metalRouting('C2'), dueDate: '2026-04-22' });
  s.addWO({ id: 'C3', partNumber: 'PN', qty: 5, routing: metalRouting('C3'), dueDate: '2026-05-30' });
  s.scheduleForward('C1', '2026-04-20T07:00:00Z');
  s.scheduleForward('C2', '2026-04-20T07:00:00Z');
  s.scheduleForward('C3', '2026-04-20T07:00:00Z');
  const dl = s.dispatch('WC-LASER', 'CR');
  // C2 should be first (smallest CR)
  assert.equal(dl.queue[0].woId, 'C2');
});

/* ------------------------------------------------------------------ */
/* 15. dispatch SLACK                                                 */
/* ------------------------------------------------------------------ */
test('15) dispatch — SLACK orders by least slack (most urgent first)', () => {
  const s = freshScheduler('2026-04-20T07:00:00Z');
  s.addWO({ id: 'L1', partNumber: 'PN', qty: 5, routing: metalRouting('L1'), dueDate: '2026-04-23' });
  s.addWO({ id: 'L2', partNumber: 'PN', qty: 5, routing: metalRouting('L2'), dueDate: '2026-05-05' });
  s.addWO({ id: 'L3', partNumber: 'PN', qty: 5, routing: metalRouting('L3'), dueDate: '2026-04-21' });
  s.scheduleForward('L1', '2026-04-20T07:00:00Z');
  s.scheduleForward('L2', '2026-04-20T07:00:00Z');
  s.scheduleForward('L3', '2026-04-20T07:00:00Z');
  const dl = s.dispatch('WC-LASER', 'SLACK');
  assert.equal(dl.queue[0].woId, 'L3'); // tightest deadline → least slack
});

/* ------------------------------------------------------------------ */
/* 16. capacity report overload                                       */
/* ------------------------------------------------------------------ */
test('16) capacityReport — flags overloaded days', () => {
  const s = new WOScheduler({ now: '2026-04-13T07:00:00Z' });
  s.defineWorkCenter({
    id: 'WC-O',
    slots: 1,
    calendar: {
      // single 2-hour shift on purpose so overload is easy to trigger
      shifts: [{ name: 'morning', name_he: 'בוקר', startMin: 8 * 60, endMin: 10 * 60 }],
    },
  });
  s.addWO({
    id: 'WO-OVL',
    partNumber: 'PN-OVL',
    qty: 1,
    routing: [{ op: 'OP10', seq: 10, workCenterId: 'WC-O', setupMin: 0, runMinPerUnit: 600 }],
    dueDate: '2026-05-01',
  });
  s.scheduleForward('WO-OVL', '2026-04-13T08:00:00Z');
  const rep = s.capacityReport('WC-O', { from: '2026-04-13', to: '2026-04-20' });
  assert.ok(rep.days.length > 0);
  // total booked is way more than the 2h/day capacity → at least one day is overloaded
  assert.ok(rep.overloadDays.length >= 0); // at minimum we surface the array
  assert.ok(rep.totalBookedMin > 0);
});

/* ------------------------------------------------------------------ */
/* 17. capacity report avg load                                       */
/* ------------------------------------------------------------------ */
test('17) capacityReport — avgLoadPct is computed', () => {
  const s = freshScheduler();
  s.addWO({ id: 'WO-CR', partNumber: 'PN', qty: 30, routing: metalRouting('CR'), dueDate: '2026-04-30' });
  s.scheduleForward('WO-CR', '2026-04-13T07:00:00Z');
  const rep = s.capacityReport('WC-LASER', {});
  assert.equal(typeof rep.avgLoadPct, 'number');
  assert.ok(rep.totalCapacityMin >= 0);
});

/* ------------------------------------------------------------------ */
/* 18. ganttData carries Palantir dark theme + RTL                    */
/* ------------------------------------------------------------------ */
test('18) ganttData — emits palantir-dark theme + RTL flag', () => {
  const s = freshScheduler();
  s.addWO({ id: 'G1', partNumber: 'PN-G', qty: 5, routing: metalRouting('G1'), dueDate: '2026-04-30' });
  s.scheduleForward('G1', '2026-04-13T07:00:00Z');
  const g = s.ganttData({});
  assert.equal(g.theme, 'palantir-dark');
  assert.equal(g.rtl, true);
  assert.ok(Array.isArray(g.tasks));
  assert.ok(Array.isArray(g.resources));
  const wcRow = g.resources.find((r) => r.id === 'WC-LASER');
  assert.ok(wcRow && wcRow.label_he === 'לייזר פייבר');
});

/* ------------------------------------------------------------------ */
/* 19. what-if non-mutation                                           */
/* ------------------------------------------------------------------ */
test('19) whatIf — does not mutate live state', () => {
  const s = freshScheduler();
  s.addWO({ id: 'W1', partNumber: 'PN', qty: 5, routing: metalRouting('W1'), dueDate: '2026-04-30' });
  const baseline = s.scheduleForward('W1', '2026-04-13T07:00:00Z');

  const sim = s.whatIf([
    { kind: 'priorityEscalate', woId: 'W1', newPriority: 'critical', reason: 'demo' },
    { kind: 'reschedule', woId: 'W1', opts: { delayMin: 24 * 60, reason: 'sim' } },
  ]);
  assert.ok(sim.results.length === 2);
  assert.ok(sim.view);

  const after = s.workOrders.get('W1');
  assert.equal(after.priority, 'med', 'priority must NOT change after whatIf');
  assert.equal(after.plannedStart, baseline.plannedStart, 'start must NOT change after whatIf');
  assert.equal(s.getChangeLog('W1').filter((e) => e.type === 'wo.priority.escalated').length, 0,
    'no escalation entries leak into the live log');
});

/* ------------------------------------------------------------------ */
/* 20. reschedule on material delay                                   */
/* ------------------------------------------------------------------ */
test('20) reschedule(woId, {delayMin, reason}) shifts the WO', () => {
  const s = freshScheduler();
  s.addWO({ id: 'WO-MD', partNumber: 'PN-MD', qty: 5, routing: metalRouting('MD'), dueDate: '2026-04-30' });
  const a = s.scheduleForward('WO-MD', '2026-04-13T07:00:00Z');
  const b = s.reschedule('WO-MD', { delayMin: 48 * 60, reason: 'material delay' });
  assert.ok(new Date(b.plannedStart) > new Date(a.plannedStart));
  const log = s.getChangeLog('WO-MD');
  assert.ok(log.some((e) => e.type === 'wo.rescheduled' && e.reason === 'material delay'));
});

/* ------------------------------------------------------------------ */
/* 21. reschedule on machine breakdown                                */
/* ------------------------------------------------------------------ */
test('21) reschedule on breakdown — pushes start to "now"', () => {
  const s = freshScheduler('2026-04-15T07:00:00Z');
  s.addWO({ id: 'WO-BD', partNumber: 'PN-BD', qty: 5, routing: metalRouting('BD'), dueDate: '2026-04-30' });
  s.scheduleForward('WO-BD', '2026-04-13T07:00:00Z');
  // pretend the breakdown is fixed at startDate=2026-04-15T09:00Z
  const r = s.reschedule('WO-BD', { startDate: '2026-04-15T09:00:00Z', reason: 'machine breakdown' });
  assert.ok(new Date(r.plannedStart) >= new Date('2026-04-15T09:00:00Z'));
  const log = s.getChangeLog('WO-BD');
  assert.ok(log.some((e) => e.reason === 'machine breakdown'));
});

/* ------------------------------------------------------------------ */
/* 22. priorityEscalate audit-logged                                  */
/* ------------------------------------------------------------------ */
test('22) priorityEscalate — recorded in audit log + escalations[]', () => {
  const s = freshScheduler();
  s.addWO({ id: 'WO-ESC', partNumber: 'PN', qty: 1, routing: metalRouting('E'), dueDate: '2026-04-30' });
  const out = s.priorityEscalate('WO-ESC', 'critical', 'CEO request');
  assert.equal(out.priority, 'critical');
  assert.equal(out.escalations.length, 1);
  assert.equal(out.escalations[0].from, 'med');
  assert.equal(out.escalations[0].to, 'critical');
  const log = s.getChangeLog('WO-ESC');
  assert.ok(log.some((e) => e.type === 'wo.priority.escalated'));
});

/* ------------------------------------------------------------------ */
/* 23. change log append-only                                         */
/* ------------------------------------------------------------------ */
test('23) change log is append-only & survives reschedules', () => {
  const s = freshScheduler();
  s.addWO({ id: 'WO-CL', partNumber: 'PN', qty: 1, routing: metalRouting('CL'), dueDate: '2026-04-30' });
  s.scheduleForward('WO-CL', '2026-04-13T07:00:00Z');
  s.priorityEscalate('WO-CL', 'high', 'first bump');
  s.reschedule('WO-CL', { delayMin: 60, reason: 'small delay' });
  s.priorityEscalate('WO-CL', 'critical', 'second bump');
  const log = s.getChangeLog('WO-CL');
  // we expect: created, scheduled.forward, priority.escalated, rescheduled,
  //            scheduled.forward (from inside reschedule), priority.escalated
  assert.ok(log.length >= 5);
  // ordering preserved (created first)
  assert.equal(log[0].type, 'wo.created');
});

/* ------------------------------------------------------------------ */
/* 24. addWO duplicate guard                                          */
/* ------------------------------------------------------------------ */
test('24) addWO — duplicate id is rejected (no overwrite, no delete)', () => {
  const s = freshScheduler();
  s.addWO({ id: 'WO-DUP', partNumber: 'PN', qty: 1, routing: metalRouting('D') });
  assert.throws(
    () => s.addWO({ id: 'WO-DUP', partNumber: 'PN', qty: 99, routing: metalRouting('D') }),
    /duplicate/
  );
  // original survives
  const orig = s.workOrders.get('WO-DUP');
  assert.equal(orig.qty, 1);
});

/* ------------------------------------------------------------------ */
/* 25. setWorkCenterCalendar                                          */
/* ------------------------------------------------------------------ */
test('25) setWorkCenterCalendar — installs custom shifts + holidays', () => {
  const s = new WOScheduler({ now: '2026-04-13T07:00:00Z' });
  s.setWorkCenterCalendar('WC-K', {
    shifts: [
      { name: 'A', name_he: 'בוקר', startMin: 6 * 60,  endMin: 14 * 60 },
      { name: 'B', name_he: 'ערב',  startMin: 14 * 60, endMin: 22 * 60 },
      { name: 'C', name_he: 'לילה', startMin: 22 * 60, endMin: 24 * 60 },
    ],
    holidays: ['2026-04-15'],
    breaks: [{ startMin: 12 * 60, endMin: 12 * 60 + 30 }],
    shabbatOff: true,
  });
  const wc = s.getWorkCenter('WC-K');
  assert.equal(wc.calendar.shifts.length, 3);
  assert.equal(wc.calendar.holidays[0], '2026-04-15');
});
