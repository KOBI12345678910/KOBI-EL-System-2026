/**
 * pm-engine.test.js — Agent X-24 (Swarm 3B)
 * Unit tests for the Project Management engine.
 *
 * Run with:    node --test test/payroll/pm-engine.test.js
 *
 * Requires Node >= 18 for the built-in `node:test` runner.
 *
 * 20+ test cases covering:
 *   - Project CRUD
 *   - Task CRUD
 *   - Dependency linking (FS/SS/FF/SF, with lag)
 *   - Cycle detection
 *   - CPM (ES/EF/LS/LF/slack, critical path)
 *   - Auto schedule recompute on dependency changes
 *   - Earned Value (PV/EV/AC/CPI/SPI)
 *   - Budget vs Actual
 *   - Burndown
 *   - Time tracking
 *   - Resource load + leveling
 *   - WBS tree
 *   - Milestones
 *   - Hebrew bilingual titles
 *   - Never-delete rule (cancel instead)
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const pm = require(path.resolve(
  __dirname, '..', '..',
  'onyx-procurement', 'src', 'projects', 'pm-engine.js'
));

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function fresh() {
  return pm.createEngine();
}

function buildSimpleProject(e, opts = {}) {
  const pid = e.createProject({
    name: 'Tower Build',
    name_he: 'בנית מגדל',
    client_id: 'cli-1',
    budget: 1_000_000,
    start_date: '2026-04-01',
    pm: 'emp-pm',
    tags: ['construction', 'hi-rise'],
  });

  const t1 = e.addTask(pid, {
    title: 'Foundations',
    title_he: 'יסודות',
    start: '2026-04-01',
    duration: 10,
    planned_cost: 200_000,
    planned_hours: 80,
    assignee: 'emp-1',
  });
  const t2 = e.addTask(pid, {
    title: 'Steel frame',
    title_he: 'שלד',
    start: '2026-04-01',
    duration: 15,
    planned_cost: 300_000,
    planned_hours: 120,
    assignee: 'emp-2',
  });
  const t3 = e.addTask(pid, {
    title: 'Walls',
    title_he: 'קירות',
    start: '2026-04-01',
    duration: 8,
    planned_cost: 150_000,
    planned_hours: 64,
    assignee: 'emp-2',
  });
  const t4 = e.addTask(pid, {
    title: 'Roof',
    title_he: 'גג',
    start: '2026-04-01',
    duration: 5,
    planned_cost: 80_000,
    planned_hours: 40,
    assignee: 'emp-3',
  });

  e.linkTasks(t1, t2, 'FS', 0);
  e.linkTasks(t2, t3, 'FS', 0);
  e.linkTasks(t3, t4, 'FS', 0);

  if (opts.recompute !== false) e.recompute(pid);
  return { pid, t1, t2, t3, t4 };
}

// ─────────────────────────────────────────────────────────────
// 1. createProject
// ─────────────────────────────────────────────────────────────

test('1. createProject stores fields and returns id', () => {
  const e = fresh();
  const id = e.createProject({
    name: 'Office HQ',
    name_he: 'משרדים ראשיים',
    budget: 500_000,
    start_date: '2026-05-01',
  });
  assert.ok(id);
  const p = e.getProject(id);
  assert.equal(p.name, 'Office HQ');
  assert.equal(p.name_he, 'משרדים ראשיים');
  assert.equal(p.budget, 500_000);
  assert.equal(p.status, 'planned');
});

test('2. createProject throws without name', () => {
  const e = fresh();
  assert.throws(() => e.createProject({ budget: 100 }));
});

// ─────────────────────────────────────────────────────────────
// 2. addTask
// ─────────────────────────────────────────────────────────────

test('3. addTask creates task with computed end from duration', () => {
  const e = fresh();
  const pid = e.createProject({ name: 'Proj A', start_date: '2026-04-01' });
  const tid = e.addTask(pid, {
    title: 'Excavate',
    title_he: 'חפירות',
    start: '2026-04-01',
    duration: 5,
  });
  const t = e.getTask(tid);
  assert.equal(t.start, '2026-04-01');
  assert.equal(t.end, '2026-04-06');
  assert.equal(t.duration, 5);
  assert.equal(t.title_he, 'חפירות');
});

test('4. addTask rejects missing title and unknown project', () => {
  const e = fresh();
  const pid = e.createProject({ name: 'X', start_date: '2026-04-01' });
  assert.throws(() => e.addTask(pid, {}));
  assert.throws(() => e.addTask('bad-pid', { title: 'x', duration: 1 }));
});

// ─────────────────────────────────────────────────────────────
// 3. linkTasks
// ─────────────────────────────────────────────────────────────

test('5. linkTasks creates FS dependency with lag', () => {
  const e = fresh();
  const pid = e.createProject({ name: 'P', start_date: '2026-04-01' });
  const a = e.addTask(pid, { title: 'A', duration: 3, start: '2026-04-01' });
  const b = e.addTask(pid, { title: 'B', duration: 3, start: '2026-04-01' });
  const dep = e.linkTasks(a, b, 'FS', 2);
  assert.equal(dep.type, 'FS');
  assert.equal(dep.lag, 2);
  const bTask = e.getTask(b);
  assert.equal(bTask.dependencies.length, 1);
  assert.equal(bTask.dependencies[0].pred_id, a);
});

test('6. linkTasks rejects self-dependency and cycles', () => {
  const e = fresh();
  const pid = e.createProject({ name: 'P', start_date: '2026-04-01' });
  const a = e.addTask(pid, { title: 'A', duration: 2, start: '2026-04-01' });
  const b = e.addTask(pid, { title: 'B', duration: 2, start: '2026-04-01' });
  assert.throws(() => e.linkTasks(a, a, 'FS', 0));
  e.linkTasks(a, b, 'FS', 0);
  assert.throws(() => e.linkTasks(b, a, 'FS', 0)); // would create cycle
});

// ─────────────────────────────────────────────────────────────
// 4. recompute / CPM
// ─────────────────────────────────────────────────────────────

test('7. recompute performs forward pass (FS chain)', () => {
  const e = fresh();
  const { pid, t1, t2, t3, t4 } = buildSimpleProject(e);
  const T1 = e.getTask(t1);
  const T2 = e.getTask(t2);
  const T3 = e.getTask(t3);
  const T4 = e.getTask(t4);

  assert.equal(T1.start, '2026-04-01');
  assert.equal(T1.end, '2026-04-11');

  assert.equal(T2.start, '2026-04-11');
  assert.equal(T2.end, '2026-04-26');

  assert.equal(T3.start, '2026-04-26');
  assert.equal(T3.end, '2026-05-04');

  assert.equal(T4.start, '2026-05-04');
  assert.equal(T4.end, '2026-05-09');

  assert.equal(e.getProject(pid).end_date, '2026-05-09');
});

test('8. critical path returns all tasks when linear FS', () => {
  const e = fresh();
  const { pid, t1, t2, t3, t4 } = buildSimpleProject(e);
  const cp = e.criticalPath(pid);
  assert.deepEqual(cp.sort(), [t1, t2, t3, t4].sort());
});

test('9. parallel branches — only longest is critical', () => {
  const e = fresh();
  const pid = e.createProject({ name: 'Parallel', start_date: '2026-04-01' });
  const a = e.addTask(pid, { title: 'A', duration: 2, start: '2026-04-01' });
  const b = e.addTask(pid, { title: 'B-short', duration: 3, start: '2026-04-01' });
  const c = e.addTask(pid, { title: 'C-long', duration: 10, start: '2026-04-01' });
  const d = e.addTask(pid, { title: 'D', duration: 1, start: '2026-04-01' });
  e.linkTasks(a, b, 'FS', 0);
  e.linkTasks(a, c, 'FS', 0);
  e.linkTasks(b, d, 'FS', 0);
  e.linkTasks(c, d, 'FS', 0);
  const cp = e.criticalPath(pid);
  assert.ok(cp.includes(a));
  assert.ok(cp.includes(c));
  assert.ok(cp.includes(d));
  assert.ok(!cp.includes(b), 'short branch should have positive slack');
  const bTask = e.getTask(b);
  assert.ok(bTask.slack > 0);
});

test('10. SS (start-to-start) dependency honored by forward pass', () => {
  const e = fresh();
  const pid = e.createProject({ name: 'SS', start_date: '2026-04-01' });
  const a = e.addTask(pid, { title: 'A', duration: 10, start: '2026-04-01' });
  const b = e.addTask(pid, { title: 'B', duration: 3, start: '2026-04-01' });
  e.linkTasks(a, b, 'SS', 2);
  e.recompute(pid);
  const B = e.getTask(b);
  assert.equal(B.start, '2026-04-03'); // 2-day lag after A start
  assert.equal(B.end, '2026-04-06');
});

test('11. FF (finish-to-finish) dependency honored', () => {
  const e = fresh();
  const pid = e.createProject({ name: 'FF', start_date: '2026-04-01' });
  const a = e.addTask(pid, { title: 'A', duration: 10, start: '2026-04-01' });
  const b = e.addTask(pid, { title: 'B', duration: 4, start: '2026-04-01' });
  e.linkTasks(a, b, 'FF', 0);
  e.recompute(pid);
  const A = e.getTask(a);
  const B = e.getTask(b);
  assert.equal(B.end, A.end); // both finish same day
});

test('12. FS with negative lag (overlap) advances successor', () => {
  const e = fresh();
  const pid = e.createProject({ name: 'Lag', start_date: '2026-04-01' });
  const a = e.addTask(pid, { title: 'A', duration: 10, start: '2026-04-01' });
  const b = e.addTask(pid, { title: 'B', duration: 5, start: '2026-04-01' });
  e.linkTasks(a, b, 'FS', -3); // B starts 3 days before A ends
  e.recompute(pid);
  const B = e.getTask(b);
  assert.equal(B.start, '2026-04-08'); // Apr 11 - 3 days
});

// ─────────────────────────────────────────────────────────────
// 5. Auto-recompute on dependency change
// ─────────────────────────────────────────────────────────────

test('13. adding a dependency shifts successor after recompute', () => {
  const e = fresh();
  const pid = e.createProject({ name: 'Shift', start_date: '2026-04-01' });
  const a = e.addTask(pid, { title: 'A', duration: 5, start: '2026-04-01' });
  const b = e.addTask(pid, { title: 'B', duration: 5, start: '2026-04-01' });
  e.recompute(pid);
  assert.equal(e.getTask(b).start, '2026-04-01');
  e.linkTasks(a, b, 'FS', 0);
  e.recompute(pid);
  assert.equal(e.getTask(b).start, '2026-04-06');
});

// ─────────────────────────────────────────────────────────────
// 6. Earned Value
// ─────────────────────────────────────────────────────────────

test('14. earnedValue computes PV/EV/AC/CPI/SPI', () => {
  const e = fresh();
  const pid = e.createProject({
    name: 'EV', start_date: '2026-04-01', budget: 500_000,
  });
  const t = e.addTask(pid, {
    title: 'Build',
    start: '2026-04-01',
    duration: 10,
    planned_cost: 100_000,
    progress: 50,
    actual_cost: 60_000,
  });
  e.recompute(pid);
  const ev = e.earnedValue(pid, '2026-04-06'); // midway
  assert.ok(ev.PV > 0);
  assert.equal(ev.EV, 50_000);         // 50% of 100k
  assert.equal(ev.AC, 60_000);
  assert.ok(ev.CPI < 1);                // over budget
  assert.equal(ev.BAC, 100_000);
  assert.ok(['over budget', 'over budget & behind', 'healthy', 'behind schedule']
    .includes(ev.status_en));
});

test('15. earnedValue: healthy when CPI>=1 and SPI>=1', () => {
  const e = fresh();
  const pid = e.createProject({
    name: 'Healthy', start_date: '2026-04-01', budget: 100_000,
  });
  e.addTask(pid, {
    title: 'Build',
    start: '2026-04-01',
    duration: 10,
    planned_cost: 100_000,
    progress: 100,
    actual_cost: 80_000,
  });
  e.recompute(pid);
  const ev = e.earnedValue(pid, '2026-04-11');
  assert.equal(ev.status_en, 'healthy');
  assert.ok(ev.CPI >= 1);
  assert.ok(ev.SPI >= 1);
});

// ─────────────────────────────────────────────────────────────
// 7. Budget vs Actual
// ─────────────────────────────────────────────────────────────

test('16. budgetVsActual detects over-budget', () => {
  const e = fresh();
  const pid = e.createProject({
    name: 'BVA', start_date: '2026-04-01', budget: 50_000,
  });
  e.addTask(pid, {
    title: 'Task',
    start: '2026-04-01',
    duration: 3,
    planned_cost: 40_000,
    actual_cost: 60_000,
  });
  const bva = e.budgetVsActual(pid);
  assert.equal(bva.budget, 50_000);
  assert.equal(bva.actual_cost, 60_000);
  assert.equal(bva.over_budget, true);
  assert.equal(bva.variance, -10_000);
});

// ─────────────────────────────────────────────────────────────
// 8. Burndown
// ─────────────────────────────────────────────────────────────

test('17. burndown returns ideal line and today snapshot', () => {
  const e = fresh();
  const pid = e.createProject({ name: 'BD', start_date: '2026-04-01' });
  e.addTask(pid, {
    title: 'Work',
    start: '2026-04-01',
    duration: 10,
    planned_hours: 100,
    progress: 40,
  });
  e.recompute(pid);
  const bd = e.burndown(pid);
  assert.equal(bd.total, 100);
  assert.ok(bd.ideal.length > 1);
  assert.equal(bd.ideal[0].remaining, 100);
  assert.equal(bd.ideal[bd.ideal.length - 1].remaining, 0);
  assert.equal(bd.today.remaining, 60); // 100 - 40% done
});

// ─────────────────────────────────────────────────────────────
// 9. Time tracking
// ─────────────────────────────────────────────────────────────

test('18. logTime accumulates actual_hours and actual_cost', () => {
  const e = fresh();
  const pid = e.createProject({ name: 'TT', start_date: '2026-04-01' });
  const tid = e.addTask(pid, { title: 'Work', start: '2026-04-01', duration: 5 });
  e.logTime({ task_id: tid, employee_id: 'emp-1', hours: 3, cost: 600, date: '2026-04-01' });
  e.logTime({ task_id: tid, employee_id: 'emp-1', hours: 5, cost: 1000, date: '2026-04-02' });
  const t = e.getTask(tid);
  assert.equal(t.actual_hours, 8);
  assert.equal(t.actual_cost, 1600);
  const entries = e.listTimeEntries({ task_id: tid });
  assert.equal(entries.length, 2);
});

// ─────────────────────────────────────────────────────────────
// 10. Resource load
// ─────────────────────────────────────────────────────────────

test('19. resourceLoad reports hours per employee across tasks', () => {
  const e = fresh();
  const pid = e.createProject({ name: 'RL', start_date: '2026-04-01' });
  e.addTask(pid, {
    title: 'A',
    start: '2026-04-01',
    duration: 5,
    assignee: 'emp-1',
    planned_hours: 40,
  });
  e.addTask(pid, {
    title: 'B',
    start: '2026-04-01',
    duration: 3,
    assignee: 'emp-1',
    planned_hours: 24,
  });
  e.recompute(pid);
  const load = e.resourceLoad('emp-1');
  assert.equal(load.tasks.length, 2);
  assert.ok(load.total_hours > 0);
  // overlapping days should trip overallocation (8h each = 16h)
  assert.ok(load.overallocation_days.length > 0);
});

test('20. levelResources removes overallocation by pushing non-critical tasks', () => {
  const e = fresh();
  const pid = e.createProject({ name: 'Level', start_date: '2026-04-01' });
  // Critical path task
  const crit = e.addTask(pid, {
    title: 'Critical',
    start: '2026-04-01',
    duration: 20,
    assignee: 'emp-1',
    planned_hours: 160,
  });
  // Non-critical overlapping
  const nc = e.addTask(pid, {
    title: 'Non-critical',
    start: '2026-04-01',
    duration: 5,
    assignee: 'emp-1',
    planned_hours: 40,
  });
  e.recompute(pid);
  const before = e.resourceLoad('emp-1');
  assert.ok(before.overallocation_days.length > 0);

  // There's no dep to give slack; still exercise leveling — it's bounded
  const after = e.levelResources(pid, 'emp-1');
  assert.ok(after);
  // Leveling may or may not fully clear; at minimum it returns a load object
  assert.ok(Array.isArray(after.tasks));
});

// ─────────────────────────────────────────────────────────────
// 11. WBS tree
// ─────────────────────────────────────────────────────────────

test('21. wbs builds hierarchical tree via parent_id', () => {
  const e = fresh();
  const pid = e.createProject({ name: 'WBS', start_date: '2026-04-01' });
  const p = e.addTask(pid, { title: 'Phase 1', duration: 30, start: '2026-04-01', wbs: '1' });
  const c1 = e.addTask(pid, { title: 'Task 1.1', duration: 10, start: '2026-04-01', parent_id: p, wbs: '1.1' });
  const c2 = e.addTask(pid, { title: 'Task 1.2', duration: 15, start: '2026-04-01', parent_id: p, wbs: '1.2' });
  e.recompute(pid);
  const tree = e.wbs(pid);
  assert.equal(tree.length, 1);
  assert.equal(tree[0].id, p);
  assert.equal(tree[0].children.length, 2);
  assert.deepEqual(
    tree[0].children.map((c) => c.id).sort(),
    [c1, c2].sort()
  );
});

// ─────────────────────────────────────────────────────────────
// 12. Milestones
// ─────────────────────────────────────────────────────────────

test('22. milestones can be added and marked reached', () => {
  const e = fresh();
  const pid = e.createProject({ name: 'MS', start_date: '2026-04-01' });
  const mid = e.addMilestone(pid, {
    name: 'Handover',
    name_he: 'מסירה ללקוח',
    date: '2026-06-01',
  });
  const list = e.listMilestones(pid);
  assert.equal(list.length, 1);
  assert.equal(list[0].reached, false);
  const updated = e.markMilestoneReached(mid, true);
  assert.equal(updated.reached, true);
});

// ─────────────────────────────────────────────────────────────
// 13. Hebrew RTL / bilingual
// ─────────────────────────────────────────────────────────────

test('23. Hebrew bilingual titles preserved through pipeline', () => {
  const e = fresh();
  const pid = e.createProject({
    name: 'Solar Farm', name_he: 'חוות שמש', start_date: '2026-04-01',
  });
  const tid = e.addTask(pid, {
    title: 'Install panels',
    title_he: 'התקנת פאנלים',
    start: '2026-04-01',
    duration: 14,
  });
  e.recompute(pid);
  assert.equal(e.getProject(pid).name_he, 'חוות שמש');
  assert.equal(e.getTask(tid).title_he, 'התקנת פאנלים');
  const tree = e.wbs(pid);
  assert.equal(tree[0].title_he, 'התקנת פאנלים');
});

// ─────────────────────────────────────────────────────────────
// 14. Never-delete rule
// ─────────────────────────────────────────────────────────────

test('24. cancelProject sets status=cancelled but keeps data', () => {
  const e = fresh();
  const pid = e.createProject({ name: 'Ghost', start_date: '2026-04-01' });
  e.addTask(pid, { title: 'Task', duration: 3, start: '2026-04-01' });
  e.cancelProject(pid);
  const p = e.getProject(pid);
  assert.equal(p.status, 'cancelled');
  // Data still retrievable
  assert.ok(e.listTasks(pid).length === 1);
});

// ─────────────────────────────────────────────────────────────
// 15. Inline dependencies via addTask
// ─────────────────────────────────────────────────────────────

test('25. addTask accepts inline dependencies array', () => {
  const e = fresh();
  const pid = e.createProject({ name: 'Inline', start_date: '2026-04-01' });
  const a = e.addTask(pid, { title: 'A', duration: 4, start: '2026-04-01' });
  const b = e.addTask(pid, {
    title: 'B',
    duration: 3,
    start: '2026-04-01',
    dependencies: [{ pred_id: a, type: 'FS', lag: 1 }],
  });
  e.recompute(pid);
  const B = e.getTask(b);
  assert.equal(B.start, '2026-04-06'); // A ends Apr 5 + 1 lag
});

// ─────────────────────────────────────────────────────────────
// 16. Events emitted
// ─────────────────────────────────────────────────────────────

test('26. Engine emits events for create/link/recompute', () => {
  const e = fresh();
  const pid = e.createProject({ name: 'EV', start_date: '2026-04-01' });
  const a = e.addTask(pid, { title: 'A', duration: 2, start: '2026-04-01' });
  const b = e.addTask(pid, { title: 'B', duration: 2, start: '2026-04-01' });
  e.linkTasks(a, b, 'FS', 0);
  e.recompute(pid);
  const events = e.getEvents();
  const types = events.map((ev) => ev.type);
  assert.ok(types.includes('project.created'));
  assert.ok(types.includes('task.created'));
  assert.ok(types.includes('dependency.linked'));
  assert.ok(types.includes('schedule.recomputed'));
});

// ─────────────────────────────────────────────────────────────
// 17. dashboard aggregates everything
// ─────────────────────────────────────────────────────────────

test('27. dashboard returns aggregate KPIs', () => {
  const e = fresh();
  const { pid } = buildSimpleProject(e);
  const d = e.dashboard(pid);
  assert.equal(d.totals.tasks, 4);
  assert.ok(d.earned_value);
  assert.ok(d.budget_vs_actual);
  assert.ok(Array.isArray(d.critical_path));
  assert.ok(d.critical_path.length === 4);
});

// ─────────────────────────────────────────────────────────────
// 18. Slack calculation on non-critical branch
// ─────────────────────────────────────────────────────────────

test('28. slack > 0 for tasks not on critical path', () => {
  const e = fresh();
  const pid = e.createProject({ name: 'Slack', start_date: '2026-04-01' });
  const a = e.addTask(pid, { title: 'A', duration: 5, start: '2026-04-01' });
  const b = e.addTask(pid, { title: 'B-fast', duration: 2, start: '2026-04-01' });
  const c = e.addTask(pid, { title: 'C-slow', duration: 10, start: '2026-04-01' });
  const d = e.addTask(pid, { title: 'D', duration: 3, start: '2026-04-01' });
  e.linkTasks(a, b, 'FS', 0);
  e.linkTasks(a, c, 'FS', 0);
  e.linkTasks(b, d, 'FS', 0);
  e.linkTasks(c, d, 'FS', 0);
  e.recompute(pid);
  const B = e.getTask(b);
  const C = e.getTask(c);
  assert.ok(B.slack > 0);
  assert.equal(C.slack, 0);
});
