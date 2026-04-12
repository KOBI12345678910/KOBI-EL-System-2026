/**
 * Unit tests — src/manufacturing/capacity-planning.js
 * Agent AG-Y034 — Capacity Planning (RCCP + CPP)
 *
 * Run:
 *   node --test onyx-procurement/test/manufacturing/capacity-planning.test.js
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  CapacityPlanner,
  HOLIDAYS_IL,
  GLOSSARY,
  getIsraeliHolidays,
  resolveHoliday,
  _helpers,
} = require('../../src/manufacturing/capacity-planning');

// ───────────────────────────────────────────────────────────────
// Fixture helper
// ───────────────────────────────────────────────────────────────
function newPlanner() {
  return new CapacityPlanner();
}

function defaultShifts() {
  // 08:00–16:00 = 480 min, Sunday–Friday (Friday auto-halved by policy)
  return [{ name: 'day', start: '08:00', end: '16:00', days: [0, 1, 2, 3, 4, 5] }];
}

// ───────────────────────────────────────────────────────────────
// 1. Date / time helpers
// ───────────────────────────────────────────────────────────────
test('helpers: dayOfWeek returns 0..6 correctly', () => {
  // 2026-04-12 is a Sunday
  assert.equal(_helpers.dayOfWeek('2026-04-12'), 0);
  // 2026-04-17 is a Friday
  assert.equal(_helpers.dayOfWeek('2026-04-17'), 5);
  // 2026-04-18 is a Saturday (Shabbat)
  assert.equal(_helpers.dayOfWeek('2026-04-18'), 6);
});

test('helpers: eachDay inclusive range', () => {
  const days = _helpers.eachDay('2026-04-12', '2026-04-14');
  assert.deepEqual(days, ['2026-04-12', '2026-04-13', '2026-04-14']);
});

test('helpers: hmToMinutes and shiftMinutes', () => {
  assert.equal(_helpers.hmToMinutes('08:30'), 510);
  assert.equal(
    _helpers.shiftMinutes({ start: '08:00', end: '16:00' }),
    480,
  );
  // Night shift crossing midnight
  assert.equal(
    _helpers.shiftMinutes({ start: '22:00', end: '06:00' }),
    480,
  );
});

// ───────────────────────────────────────────────────────────────
// 2. Holiday calendar
// ───────────────────────────────────────────────────────────────
test('HOLIDAYS_IL: 2026 and 2027 are populated', () => {
  assert.ok(Array.isArray(HOLIDAYS_IL['2026']));
  assert.ok(HOLIDAYS_IL['2026'].length > 10);
  assert.ok(HOLIDAYS_IL['2027'].length > 10);
});

test('resolveHoliday: recognises Yom Kippur 2026', () => {
  const h = resolveHoliday('2026-09-21');
  assert.ok(h);
  assert.equal(h.nameEn, 'Yom Kippur');
  assert.equal(h.halfDay, false);
});

test('resolveHoliday: recognises Memorial Day 2027 as half-day', () => {
  // 4 Iyar 5787 = Tue 2027-05-11
  const h = resolveHoliday('2027-05-11');
  assert.ok(h);
  assert.equal(h.nameEn, 'Memorial Day');
  assert.equal(h.halfDay, true);
});

test('getIsraeliHolidays: returns both years combined', () => {
  const all = getIsraeliHolidays(['2026', '2027']);
  assert.ok(all.some((h) => h.nameEn === 'Independence Day'));
  assert.ok(all.some((h) => h.nameEn === "Tisha B'Av"));
});

test('GLOSSARY: bilingual keys exist', () => {
  assert.equal(GLOSSARY.bottleneck.he, 'צוואר בקבוק');
  assert.equal(GLOSSARY.rccp.en, 'Rough-Cut Capacity Planning');
});

// ───────────────────────────────────────────────────────────────
// 3. Calendar definition
// ───────────────────────────────────────────────────────────────
test('defineCalendar: basic Sunday-Thursday + Friday half', () => {
  const p = newPlanner();
  p.defineCalendar({
    workCenterId: 'LASER',
    shifts: defaultShifts(),
    machines: 1,
  });
  // Full Sunday: 480 min
  const sunday = p.availableCapacity('LASER', { from: '2026-04-12', to: '2026-04-12' });
  assert.equal(sunday.availableMinutes, 480);

  // Friday → 240 min (half)
  const friday = p.availableCapacity('LASER', { from: '2026-04-17', to: '2026-04-17' });
  assert.equal(friday.availableMinutes, 240);

  // Saturday → 0 (Shabbat closed)
  const sat = p.availableCapacity('LASER', { from: '2026-04-18', to: '2026-04-18' });
  assert.equal(sat.availableMinutes, 0);
  assert.equal(sat.breakdown[0].reason, 'closed:Shabbat');
});

test('defineCalendar: unknown work centre throws', () => {
  const p = newPlanner();
  assert.throws(() => p.availableCapacity('X', { from: '2026-04-12', to: '2026-04-12' }));
});

test('defineCalendar: rejects invalid shift days', () => {
  const p = newPlanner();
  assert.throws(() => p.defineCalendar({
    workCenterId: 'X', shifts: [{ name: 'd', start: '08:00', end: '16:00', days: [7] }],
  }));
});

// ───────────────────────────────────────────────────────────────
// 4. Israeli holidays applied to capacity
// ───────────────────────────────────────────────────────────────
test('availableCapacity: Yom Kippur 2026 → zero', () => {
  const p = newPlanner();
  p.defineCalendar({ workCenterId: 'LASER', shifts: defaultShifts() });
  // 2026-09-21 is a Monday AND Yom Kippur
  const r = p.availableCapacity('LASER', { from: '2026-09-21', to: '2026-09-21' });
  assert.equal(r.availableMinutes, 0);
  assert.match(r.breakdown[0].reason, /closed:Yom Kippur/);
});

test('availableCapacity: Erev Pesach 2026 → half day', () => {
  const p = newPlanner();
  p.defineCalendar({ workCenterId: 'LASER', shifts: defaultShifts() });
  // 2026-04-01 is Wednesday (14 Nisan 5786) = Erev Pesach
  const r = p.availableCapacity('LASER', { from: '2026-04-01', to: '2026-04-01' });
  assert.equal(r.availableMinutes, 240); // half of 480
  assert.match(r.breakdown[0].reason, /half:Erev Pesach/);
});

test('availableCapacity: Pesach Day 1 2026 → closed', () => {
  const p = newPlanner();
  p.defineCalendar({ workCenterId: 'LASER', shifts: defaultShifts() });
  // 2026-04-02 Thursday = 15 Nisan = first day of Pesach
  const r = p.availableCapacity('LASER', { from: '2026-04-02', to: '2026-04-02' });
  assert.equal(r.availableMinutes, 0);
  assert.match(r.breakdown[0].reason, /closed:Pesach/);
});

test('availableCapacity: full week Sunday–Thursday = 2400 min', () => {
  const p = newPlanner();
  p.defineCalendar({ workCenterId: 'LASER', shifts: defaultShifts() });
  // Pick a normal week with no holidays: 2026-05-10 (Sun) .. 2026-05-14 (Thu)
  const r = p.availableCapacity('LASER', { from: '2026-05-10', to: '2026-05-14' });
  assert.equal(r.availableMinutes, 5 * 480);
});

test('availableCapacity: parallel machines multiply capacity', () => {
  const p = newPlanner();
  p.defineCalendar({ workCenterId: 'WELD', shifts: defaultShifts(), machines: 3 });
  const r = p.availableCapacity('WELD', { from: '2026-05-10', to: '2026-05-10' });
  assert.equal(r.availableMinutes, 480 * 3);
});

test('availableCapacity: efficiency factor reduces effective minutes', () => {
  const p = newPlanner();
  p.defineCalendar({ workCenterId: 'MILL', shifts: defaultShifts(), efficiency: 0.8 });
  const r = p.availableCapacity('MILL', { from: '2026-05-10', to: '2026-05-10' });
  assert.equal(r.availableMinutes, Math.round(480 * 0.8));
});

// ───────────────────────────────────────────────────────────────
// 5. Demand forecast
// ───────────────────────────────────────────────────────────────
test('demandForecast: collects WOs and forecasts inside the period', () => {
  const p = newPlanner();
  p.addWorkOrder({ id: 'WO1', partId: 'BRACKET-01', quantity: 100, dueDate: '2026-05-12', released: true });
  p.addWorkOrder({ id: 'WO2', partId: 'BRACKET-01', quantity: 50, dueDate: '2026-06-30', released: true });
  p.addForecast({ id: 'F1', partId: 'PLATE-22', quantity: 80, dueDate: '2026-05-14' });

  const demand = p.demandForecast({ from: '2026-05-01', to: '2026-05-31' });
  assert.equal(demand.length, 2);
  assert.ok(demand.some((d) => d.source === 'wo'));
  assert.ok(demand.some((d) => d.source === 'forecast'));
});

// ───────────────────────────────────────────────────────────────
// 6. RCCP — Rough Cut Capacity Planning
// ───────────────────────────────────────────────────────────────
test('rccp: computes load per work centre via bill of resources', () => {
  const p = newPlanner();
  p.defineCalendar({ workCenterId: 'LASER', shifts: defaultShifts() });
  p.defineCalendar({ workCenterId: 'WELD',  shifts: defaultShifts() });

  p.setBillOfResources('BRACKET-01', [
    { workCenterId: 'LASER', loadPerUnit: 2 }, // 2 min per unit
    { workCenterId: 'WELD',  loadPerUnit: 5 },
  ]);

  p.addWorkOrder({ id: 'WO1', partId: 'BRACKET-01', quantity: 100, dueDate: '2026-05-12' });

  const r = p.rccp({ from: '2026-05-10', to: '2026-05-14' });
  assert.equal(r.method, 'RCCP');
  assert.equal(r.byWorkCenter.get('LASER').loadMin, 200);
  assert.equal(r.byWorkCenter.get('WELD').loadMin, 500);
  // 5 weekdays × 480 = 2400 min available
  assert.equal(r.byWorkCenter.get('LASER').availableMin, 2400);
});

// ───────────────────────────────────────────────────────────────
// 7. CPP — detailed Capacity Planning
// ───────────────────────────────────────────────────────────────
test('cpp: uses routings with setup + run + queue + move', () => {
  const p = newPlanner();
  p.defineCalendar({ workCenterId: 'LASER', shifts: defaultShifts() });
  p.defineCalendar({ workCenterId: 'WELD',  shifts: defaultShifts() });

  p.setRouting('BRACKET-01', [
    { workCenterId: 'LASER', setupMin: 30, runMinPerUnit: 2, queueMin: 15, moveMin: 5 },
    { workCenterId: 'WELD',  setupMin: 60, runMinPerUnit: 5, queueMin: 20, moveMin: 5 },
  ]);
  p.addWorkOrder({ id: 'WO1', partId: 'BRACKET-01', quantity: 100, dueDate: '2026-05-12' });

  const r = p.cpp({ from: '2026-05-10', to: '2026-05-14' });
  assert.equal(r.method, 'CPP');
  // LASER: 30 + 100*2 + 15 + 5 = 250
  assert.equal(r.byWorkCenter.get('LASER').loadMin, 250);
  // WELD : 60 + 100*5 + 20 + 5 = 585
  assert.equal(r.byWorkCenter.get('WELD').loadMin, 585);
});

test('cpp: reports parts missing a routing', () => {
  const p = newPlanner();
  p.defineCalendar({ workCenterId: 'LASER', shifts: defaultShifts() });
  p.addWorkOrder({ id: 'WO1', partId: 'UNKNOWN', quantity: 10, dueDate: '2026-05-12' });
  const r = p.cpp({ from: '2026-05-10', to: '2026-05-14' });
  assert.ok(r.missingRoutings.includes('UNKNOWN'));
});

// ───────────────────────────────────────────────────────────────
// 8. Bottleneck analysis
// ───────────────────────────────────────────────────────────────
test('bottleneckAnalysis: identifies overloaded work centre', () => {
  const p = newPlanner();
  p.defineCalendar({ workCenterId: 'LASER', shifts: defaultShifts() });
  p.defineCalendar({ workCenterId: 'WELD',  shifts: defaultShifts() });

  // WELD is intentionally over-loaded
  p.setRouting('BRACKET-01', [
    { workCenterId: 'LASER', setupMin: 10, runMinPerUnit: 1 },
    { workCenterId: 'WELD',  setupMin: 10, runMinPerUnit: 30 }, // very slow
  ]);
  p.addWorkOrder({ id: 'WO1', partId: 'BRACKET-01', quantity: 200, dueDate: '2026-05-12' });

  const r = p.bottleneckAnalysis({ from: '2026-05-10', to: '2026-05-14' });
  assert.equal(r.primaryBottleneck.workCenterId, 'WELD');
  assert.equal(r.primaryBottleneck.status, 'overloaded');
  assert.match(r.recommendation, /WELD/);
});

test('bottleneckAnalysis: returns ok message when all within capacity', () => {
  const p = newPlanner();
  p.defineCalendar({ workCenterId: 'LASER', shifts: defaultShifts() });
  p.setRouting('BRACKET-01', [{ workCenterId: 'LASER', setupMin: 5, runMinPerUnit: 1 }]);
  p.addWorkOrder({ id: 'WO1', partId: 'BRACKET-01', quantity: 10, dueDate: '2026-05-12' });

  const r = p.bottleneckAnalysis({ from: '2026-05-10', to: '2026-05-14' });
  assert.match(r.recommendation, /within capacity/);
});

// ───────────────────────────────────────────────────────────────
// 9. What-if scenarios
// ───────────────────────────────────────────────────────────────
test('whatIf addMachine: capacity grows, bottleneck eases', () => {
  const p = newPlanner();
  p.defineCalendar({ workCenterId: 'WELD', shifts: defaultShifts(), machines: 1 });
  p.setRouting('BRACKET-01', [{ workCenterId: 'WELD', setupMin: 10, runMinPerUnit: 30 }]);
  p.addWorkOrder({ id: 'WO1', partId: 'BRACKET-01', quantity: 200, dueDate: '2026-05-12' });

  const res = p.whatIf({
    period: { from: '2026-05-10', to: '2026-05-14' },
    scenario: { type: 'addMachine', workCenterId: 'WELD', machines: 2 },
  });

  assert.ok(res.after.capacity.WELD > res.before.capacity.WELD);
  assert.ok(res.after.bottleneck.primaryBottleneck.utilization <
            res.before.bottleneck.primaryBottleneck.utilization);
});

test('whatIf addShift: appends a second shift and increases capacity', () => {
  const p = newPlanner();
  p.defineCalendar({ workCenterId: 'LASER', shifts: defaultShifts() });

  const res = p.whatIf({
    period: { from: '2026-05-10', to: '2026-05-10' },
    scenario: {
      type: 'addShift', workCenterId: 'LASER',
      shift: { name: 'evening', start: '16:00', end: '23:00', days: [0, 1, 2, 3, 4] },
    },
  });

  assert.equal(res.before.capacity.LASER, 480);
  // 480 + 420 (16:00→23:00) = 900
  assert.equal(res.after.capacity.LASER, 900);
});

test('whatIf subcontract: reduces load on the target work centre', () => {
  const p = newPlanner();
  p.defineCalendar({ workCenterId: 'WELD', shifts: defaultShifts() });
  p.setRouting('BRACKET-01', [{ workCenterId: 'WELD', setupMin: 10, runMinPerUnit: 30 }]);
  p.addWorkOrder({ id: 'WO1', partId: 'BRACKET-01', quantity: 200, dueDate: '2026-05-12' });

  const res = p.whatIf({
    period: { from: '2026-05-10', to: '2026-05-14' },
    scenario: { type: 'subcontract', workCenterId: 'WELD', minutes: 3000 },
  });

  // Bottleneck load after deduction should be strictly lower.
  const beforeLoad = res.before.bottleneck.primaryBottleneck.loadMin;
  const afterLoad  = res.after.bottleneck.primaryBottleneck.loadMin;
  assert.ok(afterLoad < beforeLoad, `expected ${afterLoad} < ${beforeLoad}`);
});

test('whatIf overtime: extends daily shift window', () => {
  const p = newPlanner();
  p.defineCalendar({ workCenterId: 'LASER', shifts: defaultShifts() });
  const res = p.whatIf({
    period: { from: '2026-05-10', to: '2026-05-10' }, // 1 Sunday
    scenario: { type: 'overtime', workCenterId: 'LASER', extraMinPerDay: 120 },
  });
  assert.equal(res.before.capacity.LASER, 480);
  assert.equal(res.after.capacity.LASER, 480 + 120);
});

test('whatIf: planner state is NOT mutated (immutable simulation)', () => {
  const p = newPlanner();
  p.defineCalendar({ workCenterId: 'LASER', shifts: defaultShifts(), machines: 1 });
  p.whatIf({
    period: { from: '2026-05-10', to: '2026-05-10' },
    scenario: { type: 'addMachine', workCenterId: 'LASER', machines: 10 },
  });
  // Original planner still has 1 machine.
  const r = p.availableCapacity('LASER', { from: '2026-05-10', to: '2026-05-10' });
  assert.equal(r.availableMinutes, 480);
});

// ───────────────────────────────────────────────────────────────
// 10. Load levelling
// ───────────────────────────────────────────────────────────────
test('loadLevel: weekly buckets emitted', () => {
  const p = newPlanner();
  p.defineCalendar({ workCenterId: 'LASER', shifts: defaultShifts() });
  const r = p.loadLevel({ from: '2026-05-03', to: '2026-05-23' }); // 3 weeks
  assert.ok(r.byWeek.length >= 3);
});

test('loadLevel: pulls forward excess load into earlier headroom', () => {
  const p = newPlanner();
  p.defineCalendar({ workCenterId: 'LASER', shifts: defaultShifts() });
  p.setRouting('PART', [{ workCenterId: 'LASER', setupMin: 0, runMinPerUnit: 1 }]);

  // Week 1 (May 3–9) : no load
  // Week 2 (May 10–16): 2400 min capacity, drop 4000 min demand → overloaded
  p.addWorkOrder({ id: 'WO', partId: 'PART', quantity: 4000, dueDate: '2026-05-14' });

  const r = p.loadLevel({ from: '2026-05-03', to: '2026-05-16' });
  const moves = r.suggestions.filter((s) => s.reason === 'pull-forward');
  assert.ok(moves.length > 0, 'expected at least one pull-forward suggestion');
});

// ───────────────────────────────────────────────────────────────
// 11. Rule compliance — "never delete, only upgrade and grow"
// ───────────────────────────────────────────────────────────────
test('rule: loadLevel never produces a "delete" suggestion', () => {
  const p = newPlanner();
  p.defineCalendar({ workCenterId: 'LASER', shifts: defaultShifts() });
  p.setRouting('PART', [{ workCenterId: 'LASER', setupMin: 0, runMinPerUnit: 1 }]);
  p.addWorkOrder({ id: 'WO', partId: 'PART', quantity: 4000, dueDate: '2026-05-14' });
  const r = p.loadLevel({ from: '2026-05-03', to: '2026-05-16' });
  for (const s of r.suggestions) {
    assert.ok(!/delete|remove|discard/i.test(s.reason),
      `suggestion.reason should not contain delete/remove/discard: ${s.reason}`);
  }
});
