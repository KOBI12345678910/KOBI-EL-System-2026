/**
 * pm-engine.js — Agent X-24 (Swarm 3B)
 * Project Management Engine for Techno-Kol Uzi mega-ERP
 *
 * ניהול פרויקטים / Project Management Engine
 * ---------------------------------------------------
 *  - WBS (Work Breakdown Structure)
 *  - CPM (Critical Path Method)
 *  - Dependencies: FS / SS / FF / SF with lag
 *  - Resource leveling
 *  - Earned Value: PV / EV / AC / CPI / SPI
 *  - Burndown chart data
 *  - Budget vs Actual
 *  - Time tracking per task
 *  - Auto schedule recompute on dependency changes
 *
 *  Zero external dependencies. Pure JS. Hebrew RTL bilingual.
 *
 *  Data model (in-memory store, JSON-serializable):
 *
 *  Project:
 *    { id, name, name_he, client_id, budget, start_date, end_date,
 *      status, pm, tags:[], created_at, updated_at }
 *
 *  Task:
 *    { id, project_id, wbs, parent_id, title, title_he, desc,
 *      assignee, start, end, duration, progress, dependencies:[],
 *      priority, status, planned_cost, actual_cost, actual_hours,
 *      planned_hours, resources:[], milestone }
 *
 *  Dependency:
 *    { pred_id, succ_id, type: "FS"|"SS"|"FF"|"SF", lag }  // lag in days
 *
 *  Milestone:
 *    { id, project_id, name, name_he, date, reached, task_id }
 *
 *  Time entry:
 *    { id, task_id, employee_id, date, hours, cost, note }
 *
 *  Resource allocation (derived from task.resources[]):
 *    { employee_id, task_id, hours_per_day, from, to }
 *
 *  All dates are ISO strings "YYYY-MM-DD" (no timezones — project time).
 */

'use strict';

// ─────────────────────────────────────────────────────────────
//  Constants / enums
// ─────────────────────────────────────────────────────────────

const STATUS = Object.freeze({
  PLANNED: 'planned',
  ACTIVE: 'active',
  BLOCKED: 'blocked',
  DONE: 'done',
  CANCELLED: 'cancelled',
});

const STATUS_HE = Object.freeze({
  planned: 'מתוכנן',
  active: 'פעיל',
  blocked: 'חסום',
  done: 'הושלם',
  cancelled: 'בוטל',
});

const DEP_TYPES = Object.freeze({
  FS: 'FS', // Finish-to-Start  (default)
  SS: 'SS', // Start-to-Start
  FF: 'FF', // Finish-to-Finish
  SF: 'SF', // Start-to-Finish
});

const PRIORITY = Object.freeze({
  LOW: 'low',
  MED: 'med',
  HIGH: 'high',
  CRITICAL: 'critical',
});

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const WORK_HOURS_PER_DAY = 8;

// ─────────────────────────────────────────────────────────────
//  Date helpers (ISO YYYY-MM-DD)
// ─────────────────────────────────────────────────────────────

function toDate(s) {
  if (s instanceof Date) return new Date(s.getTime());
  if (typeof s !== 'string') return new Date(NaN);
  // Accept "YYYY-MM-DD" or full ISO
  const d = new Date(s.length === 10 ? s + 'T00:00:00Z' : s);
  return d;
}

function fmtDate(d) {
  if (!(d instanceof Date) || isNaN(d.getTime())) return null;
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDays(s, n) {
  const d = toDate(s);
  d.setUTCDate(d.getUTCDate() + Number(n || 0));
  return fmtDate(d);
}

function diffDays(a, b) {
  const da = toDate(a).getTime();
  const db = toDate(b).getTime();
  return Math.round((db - da) / MS_PER_DAY);
}

function maxDate(a, b) {
  if (!a) return b;
  if (!b) return a;
  return toDate(a).getTime() >= toDate(b).getTime() ? a : b;
}

function minDate(a, b) {
  if (!a) return b;
  if (!b) return a;
  return toDate(a).getTime() <= toDate(b).getTime() ? a : b;
}

function todayIso() {
  return fmtDate(new Date());
}

// ─────────────────────────────────────────────────────────────
//  ID generator (deterministic per engine instance)
// ─────────────────────────────────────────────────────────────

function makeIdGen(prefix) {
  let n = 0;
  return () => `${prefix}-${(++n).toString(36).padStart(4, '0')}`;
}

// ─────────────────────────────────────────────────────────────
//  Engine factory — isolated state for testability
// ─────────────────────────────────────────────────────────────

function createEngine(opts = {}) {
  const projects = new Map();
  const tasks = new Map();             // id -> task
  const tasksByProject = new Map();    // projectId -> Set<taskId>
  const milestones = new Map();
  const timeEntries = new Map();
  const events = [];

  const nextProjectId = opts.projectIdGen || makeIdGen('prj');
  const nextTaskId = opts.taskIdGen || makeIdGen('tsk');
  const nextMsId = opts.msIdGen || makeIdGen('ms');
  const nextEntryId = opts.entryIdGen || makeIdGen('te');

  function emit(type, payload) {
    events.push({ type, at: new Date().toISOString(), payload });
    if (events.length > 5000) events.splice(0, events.length - 5000);
  }

  // ───────── createProject ─────────
  function createProject(fields) {
    if (!fields || typeof fields !== 'object') {
      throw new Error('createProject: fields object required');
    }
    if (!fields.name) throw new Error('createProject: name required');

    const id = fields.id || nextProjectId();
    if (projects.has(id)) {
      throw new Error(`createProject: duplicate id ${id}`);
    }

    const p = {
      id,
      name: String(fields.name),
      name_he: fields.name_he || fields.name,
      client_id: fields.client_id || null,
      budget: Number(fields.budget || 0),
      start_date: fields.start_date || todayIso(),
      end_date: fields.end_date || null,
      status: fields.status || STATUS.PLANNED,
      pm: fields.pm || null,
      tags: Array.isArray(fields.tags) ? fields.tags.slice() : [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    projects.set(id, p);
    tasksByProject.set(id, new Set());
    emit('project.created', { id });
    return id;
  }

  function getProject(id) {
    return projects.get(id) || null;
  }

  function listProjects() {
    return Array.from(projects.values()).map((p) => ({ ...p, tags: p.tags.slice() }));
  }

  function updateProject(id, patch) {
    const p = projects.get(id);
    if (!p) throw new Error(`updateProject: not found ${id}`);
    const fields = ['name', 'name_he', 'client_id', 'budget', 'start_date',
      'end_date', 'status', 'pm', 'tags'];
    for (const f of fields) {
      if (patch && Object.prototype.hasOwnProperty.call(patch, f)) p[f] = patch[f];
    }
    p.updated_at = new Date().toISOString();
    emit('project.updated', { id });
    return { ...p };
  }

  // NOTE: we never truly delete — set status=cancelled (RULE: never delete)
  function cancelProject(id) {
    return updateProject(id, { status: STATUS.CANCELLED });
  }

  // ───────── addTask ─────────
  function addTask(projectId, task) {
    const project = projects.get(projectId);
    if (!project) throw new Error(`addTask: project not found ${projectId}`);
    if (!task || typeof task !== 'object') {
      throw new Error('addTask: task object required');
    }
    if (!task.title) throw new Error('addTask: title required');

    const id = task.id || nextTaskId();
    if (tasks.has(id)) throw new Error(`addTask: duplicate id ${id}`);

    let start = task.start || project.start_date;
    let duration = Number(task.duration);
    let end = task.end;
    if (!Number.isFinite(duration) || duration < 0) {
      if (start && end) duration = Math.max(0, diffDays(start, end));
      else duration = 1;
    }
    if (!end) end = addDays(start, duration);

    const siblings = tasksByProject.get(projectId);
    const wbs = task.wbs || `${siblings.size + 1}`;

    const t = {
      id,
      project_id: projectId,
      wbs,
      parent_id: task.parent_id || null,
      title: String(task.title),
      title_he: task.title_he || task.title,
      desc: task.desc || '',
      assignee: task.assignee || null,
      start,
      end,
      duration,
      progress: clamp(Number(task.progress || 0), 0, 100),
      dependencies: [],
      priority: task.priority || PRIORITY.MED,
      status: task.status || STATUS.PLANNED,
      planned_cost: Number(task.planned_cost || 0),
      actual_cost: Number(task.actual_cost || 0),
      actual_hours: Number(task.actual_hours || 0),
      planned_hours: Number(task.planned_hours || duration * WORK_HOURS_PER_DAY),
      resources: Array.isArray(task.resources) ? task.resources.slice() : [],
      milestone: !!task.milestone,
      // CPM fields — filled by recompute()
      es: null, ef: null, ls: null, lf: null, slack: null, critical: false,
    };
    tasks.set(id, t);
    siblings.add(id);

    // Accept inline dependencies
    if (Array.isArray(task.dependencies)) {
      for (const dep of task.dependencies) {
        if (typeof dep === 'string') {
          _link(dep, id, DEP_TYPES.FS, 0);
        } else if (dep && dep.pred_id) {
          _link(dep.pred_id, id, dep.type || DEP_TYPES.FS, Number(dep.lag || 0));
        }
      }
    }

    emit('task.created', { project_id: projectId, task_id: id });
    return id;
  }

  function getTask(id) {
    return tasks.get(id) || null;
  }

  function listTasks(projectId) {
    const ids = tasksByProject.get(projectId) || new Set();
    return Array.from(ids, (i) => tasks.get(i)).filter(Boolean);
  }

  function updateTask(id, patch) {
    const t = tasks.get(id);
    if (!t) throw new Error(`updateTask: not found ${id}`);
    const fields = ['title', 'title_he', 'desc', 'assignee', 'start', 'end',
      'duration', 'progress', 'priority', 'status', 'planned_cost',
      'actual_cost', 'actual_hours', 'planned_hours', 'resources',
      'milestone', 'wbs', 'parent_id'];
    for (const f of fields) {
      if (patch && Object.prototype.hasOwnProperty.call(patch, f)) {
        t[f] = patch[f];
      }
    }
    if (patch && patch.progress != null) t.progress = clamp(Number(patch.progress), 0, 100);
    if (patch && patch.duration != null && patch.start && !patch.end) {
      t.end = addDays(patch.start, Number(patch.duration));
    }
    emit('task.updated', { id });
    return { ...t };
  }

  // ───────── linkTasks ─────────
  function _link(predId, succId, type, lag) {
    const pred = tasks.get(predId);
    const succ = tasks.get(succId);
    if (!pred) throw new Error(`linkTasks: pred not found ${predId}`);
    if (!succ) throw new Error(`linkTasks: succ not found ${succId}`);
    if (pred.project_id !== succ.project_id) {
      throw new Error('linkTasks: cross-project links not allowed');
    }
    if (predId === succId) throw new Error('linkTasks: self-dependency');
    const depType = DEP_TYPES[type] || DEP_TYPES.FS;

    // Avoid duplicates
    const exists = succ.dependencies.find(
      (d) => d.pred_id === predId && d.type === depType
    );
    if (exists) {
      exists.lag = Number(lag || 0);
      return exists;
    }

    const dep = { pred_id: predId, succ_id: succId, type: depType, lag: Number(lag || 0) };
    succ.dependencies.push(dep);

    // Cycle check
    if (_hasCycle(succ.project_id)) {
      succ.dependencies.pop();
      throw new Error(`linkTasks: cycle detected ${predId} -> ${succId}`);
    }
    emit('dependency.linked', { pred_id: predId, succ_id: succId, type: depType });
    return { ...dep };
  }

  function linkTasks(predId, succId, type, lag) {
    return _link(predId, succId, type, lag);
  }

  function unlinkTasks(predId, succId) {
    const succ = tasks.get(succId);
    if (!succ) return false;
    const before = succ.dependencies.length;
    succ.dependencies = succ.dependencies.filter((d) => d.pred_id !== predId);
    const removed = before !== succ.dependencies.length;
    if (removed) emit('dependency.removed', { pred_id: predId, succ_id: succId });
    return removed;
  }

  function _hasCycle(projectId) {
    const nodes = listTasks(projectId);
    const color = new Map(); // 0=white, 1=grey, 2=black
    nodes.forEach((n) => color.set(n.id, 0));
    const idToNode = new Map(nodes.map((n) => [n.id, n]));

    function dfs(id) {
      const c = color.get(id);
      if (c === 1) return true;
      if (c === 2) return false;
      color.set(id, 1);
      const node = idToNode.get(id);
      if (node) {
        // Successors: any task that lists me as dependency
        for (const other of nodes) {
          if (other.dependencies.some((d) => d.pred_id === id)) {
            if (dfs(other.id)) return true;
          }
        }
      }
      color.set(id, 2);
      return false;
    }

    for (const n of nodes) {
      if (color.get(n.id) === 0 && dfs(n.id)) return true;
    }
    return false;
  }

  // ───────── Topological sort (Kahn) ─────────
  function _topoSort(projectId) {
    const nodes = listTasks(projectId);
    const indeg = new Map(nodes.map((n) => [n.id, 0]));
    const succMap = new Map(nodes.map((n) => [n.id, []]));

    for (const n of nodes) {
      for (const d of n.dependencies) {
        indeg.set(n.id, (indeg.get(n.id) || 0) + 1);
        const list = succMap.get(d.pred_id) || [];
        list.push(n.id);
        succMap.set(d.pred_id, list);
      }
    }

    const queue = [];
    for (const [id, deg] of indeg) if (deg === 0) queue.push(id);
    const order = [];
    while (queue.length) {
      const id = queue.shift();
      order.push(id);
      for (const s of succMap.get(id) || []) {
        indeg.set(s, indeg.get(s) - 1);
        if (indeg.get(s) === 0) queue.push(s);
      }
    }
    if (order.length !== nodes.length) {
      throw new Error('recompute: cycle detected (topo)');
    }
    return order.map((i) => tasks.get(i));
  }

  // ───────── recompute (forward + backward pass, CPM) ─────────
  function recompute(projectId) {
    const project = projects.get(projectId);
    if (!project) throw new Error(`recompute: project not found ${projectId}`);
    const order = _topoSort(projectId);
    if (order.length === 0) return { tasks: [], end_date: project.start_date };

    const baseStart = project.start_date;

    // ── Forward pass: ES / EF ──
    for (const t of order) {
      let es = baseStart;
      for (const d of t.dependencies) {
        const pred = tasks.get(d.pred_id);
        if (!pred) continue;
        const predStart = pred.es || pred.start;
        const predEnd = pred.ef || pred.end;
        let candidate = es;
        switch (d.type) {
          case DEP_TYPES.FS:
            candidate = addDays(predEnd, d.lag);
            break;
          case DEP_TYPES.SS:
            candidate = addDays(predStart, d.lag);
            break;
          case DEP_TYPES.FF:
            candidate = addDays(predEnd, d.lag - t.duration);
            break;
          case DEP_TYPES.SF:
            candidate = addDays(predStart, d.lag - t.duration);
            break;
          default:
            candidate = addDays(predEnd, d.lag);
        }
        es = maxDate(es, candidate);
      }
      t.es = es;
      t.ef = addDays(es, t.duration);
      t.start = t.es;
      t.end = t.ef;
    }

    // Project end = latest EF
    let projectEnd = baseStart;
    for (const t of order) projectEnd = maxDate(projectEnd, t.ef);

    // ── Backward pass: LS / LF ──
    // Walk reverse topo order
    const reversed = order.slice().reverse();
    const succByPred = new Map();
    for (const t of order) {
      for (const d of t.dependencies) {
        const list = succByPred.get(d.pred_id) || [];
        list.push({ ...d, succ_id: t.id });
        succByPred.set(d.pred_id, list);
      }
    }

    for (const t of reversed) {
      const succs = succByPred.get(t.id) || [];
      let lf = projectEnd;
      if (succs.length === 0) {
        lf = projectEnd;
      } else {
        let cand = projectEnd;
        for (const d of succs) {
          const succ = tasks.get(d.succ_id);
          if (!succ) continue;
          let c = succ.lf;
          switch (d.type) {
            case DEP_TYPES.FS:
              c = addDays(succ.ls, -d.lag);
              break;
            case DEP_TYPES.SS:
              c = addDays(addDays(succ.ls, -d.lag), t.duration);
              break;
            case DEP_TYPES.FF:
              c = addDays(succ.lf, -d.lag);
              break;
            case DEP_TYPES.SF:
              c = addDays(addDays(succ.lf, -d.lag), t.duration);
              break;
            default:
              c = addDays(succ.ls, -d.lag);
          }
          cand = minDate(cand, c);
        }
        lf = cand;
      }
      t.lf = lf;
      t.ls = addDays(lf, -t.duration);
      t.slack = diffDays(t.ef, t.lf);
      t.critical = t.slack === 0;
    }

    project.end_date = projectEnd;
    project.updated_at = new Date().toISOString();

    emit('schedule.recomputed', { project_id: projectId, end: projectEnd });
    return {
      project_id: projectId,
      start_date: baseStart,
      end_date: projectEnd,
      tasks: order.map((t) => ({
        id: t.id,
        wbs: t.wbs,
        title: t.title,
        start: t.start,
        end: t.end,
        duration: t.duration,
        es: t.es,
        ef: t.ef,
        ls: t.ls,
        lf: t.lf,
        slack: t.slack,
        critical: t.critical,
      })),
    };
  }

  // ───────── criticalPath ─────────
  function criticalPath(projectId) {
    recompute(projectId);
    const cp = listTasks(projectId).filter((t) => t.critical);
    // Sort by ES
    cp.sort((a, b) => (toDate(a.es).getTime() - toDate(b.es).getTime()));
    return cp.map((t) => t.id);
  }

  // ───────── Earned Value ─────────
  //   PV = planned cost up to "asOf"
  //   EV = planned cost * progress%
  //   AC = actual cost up to "asOf"
  //   CPI = EV / AC   (>1 under budget)
  //   SPI = EV / PV   (>1 ahead of schedule)
  function earnedValue(projectId, asOf) {
    const project = projects.get(projectId);
    if (!project) throw new Error(`earnedValue: project not found ${projectId}`);
    const date = asOf || todayIso();
    const list = listTasks(projectId);

    let PV = 0, EV = 0, AC = 0, BAC = 0;

    for (const t of list) {
      BAC += t.planned_cost;

      // Planned Value: fraction of planned_cost that should be done by "date"
      const tStart = toDate(t.start).getTime();
      const tEnd = toDate(t.end).getTime();
      const now = toDate(date).getTime();
      let plannedPct;
      if (tEnd <= tStart) plannedPct = now >= tEnd ? 1 : 0;
      else if (now <= tStart) plannedPct = 0;
      else if (now >= tEnd) plannedPct = 1;
      else plannedPct = (now - tStart) / (tEnd - tStart);

      PV += t.planned_cost * plannedPct;
      EV += t.planned_cost * (t.progress / 100);
      AC += t.actual_cost;
    }

    const CPI = AC > 0 ? EV / AC : (EV > 0 ? Infinity : 1);
    const SPI = PV > 0 ? EV / PV : (EV > 0 ? Infinity : 1);
    const CV = EV - AC;                   // cost variance
    const SV = EV - PV;                   // schedule variance
    const EAC = CPI > 0 && isFinite(CPI) ? BAC / CPI : BAC; // estimate at completion
    const ETC = Math.max(0, EAC - AC);    // estimate to complete
    const VAC = BAC - EAC;                // variance at completion

    return {
      project_id: projectId,
      as_of: date,
      BAC: round2(BAC),
      PV: round2(PV),
      EV: round2(EV),
      AC: round2(AC),
      CV: round2(CV),
      SV: round2(SV),
      CPI: round3(CPI),
      SPI: round3(SPI),
      EAC: round2(EAC),
      ETC: round2(ETC),
      VAC: round2(VAC),
      status_he:
        CPI >= 1 && SPI >= 1 ? 'תקין'
          : CPI < 1 && SPI < 1 ? 'חריגה בתקציב ולוח זמנים'
            : CPI < 1 ? 'חריגה בתקציב'
              : 'איחור בלוח זמנים',
      status_en:
        CPI >= 1 && SPI >= 1 ? 'healthy'
          : CPI < 1 && SPI < 1 ? 'over budget & behind'
            : CPI < 1 ? 'over budget'
              : 'behind schedule',
    };
  }

  // ───────── Burndown chart data ─────────
  function burndown(projectId) {
    const project = projects.get(projectId);
    if (!project) throw new Error(`burndown: project not found ${projectId}`);
    const list = listTasks(projectId);
    if (!list.length) return { points: [], ideal: [], total: 0 };

    const totalWork = list.reduce((s, t) => s + (t.planned_hours || 0), 0);
    const start = project.start_date;
    const end = list.reduce((acc, t) => maxDate(acc, t.end), start);
    const days = Math.max(1, diffDays(start, end));

    const ideal = [];
    for (let i = 0; i <= days; i++) {
      ideal.push({
        date: addDays(start, i),
        remaining: round2(totalWork * (1 - i / days)),
      });
    }

    // Actual burn = sum of planned_hours * (1 - progress) on that date
    // (progress is snapshot — we return current only for 'today')
    const today = todayIso();
    const remainingToday = list.reduce(
      (s, t) => s + t.planned_hours * (1 - t.progress / 100), 0
    );

    return {
      project_id: projectId,
      start,
      end,
      total: round2(totalWork),
      ideal,
      today: { date: today, remaining: round2(remainingToday) },
    };
  }

  // ───────── Budget vs actual ─────────
  function budgetVsActual(projectId) {
    const project = projects.get(projectId);
    if (!project) throw new Error(`budgetVsActual: project not found ${projectId}`);
    const list = listTasks(projectId);
    const planned = list.reduce((s, t) => s + t.planned_cost, 0);
    const actual = list.reduce((s, t) => s + t.actual_cost, 0);
    const variance = project.budget - actual;
    return {
      project_id: projectId,
      budget: round2(project.budget),
      planned_cost: round2(planned),
      actual_cost: round2(actual),
      variance: round2(variance),
      over_budget: actual > project.budget,
      utilization: project.budget > 0 ? round3(actual / project.budget) : 0,
    };
  }

  // ───────── Time tracking ─────────
  function logTime(entry) {
    if (!entry || !entry.task_id) throw new Error('logTime: task_id required');
    const t = tasks.get(entry.task_id);
    if (!t) throw new Error(`logTime: task not found ${entry.task_id}`);
    const id = entry.id || nextEntryId();
    const te = {
      id,
      task_id: entry.task_id,
      employee_id: entry.employee_id || null,
      date: entry.date || todayIso(),
      hours: Number(entry.hours || 0),
      cost: Number(entry.cost || 0),
      note: entry.note || '',
    };
    timeEntries.set(id, te);
    t.actual_hours = (t.actual_hours || 0) + te.hours;
    t.actual_cost = (t.actual_cost || 0) + te.cost;
    emit('time.logged', { task_id: entry.task_id, hours: te.hours });
    return id;
  }

  function listTimeEntries(filter) {
    const all = Array.from(timeEntries.values());
    if (!filter) return all;
    return all.filter((e) => {
      if (filter.task_id && e.task_id !== filter.task_id) return false;
      if (filter.employee_id && e.employee_id !== filter.employee_id) return false;
      if (filter.from && e.date < filter.from) return false;
      if (filter.to && e.date > filter.to) return false;
      return true;
    });
  }

  // ───────── Resource load (allocation) ─────────
  function resourceLoad(employeeId, period) {
    if (!employeeId) throw new Error('resourceLoad: employeeId required');
    const from = (period && period.from) || null;
    const to = (period && period.to) || null;

    const allTasks = Array.from(tasks.values());
    const result = {
      employee_id: employeeId,
      period: { from, to },
      tasks: [],
      total_hours: 0,
      per_day: {},
      overallocation_days: [],
    };

    for (const t of allTasks) {
      const involved = t.assignee === employeeId
        || (Array.isArray(t.resources) && t.resources.some((r) => r.employee_id === employeeId));
      if (!involved) continue;

      const overlapStart = from ? maxDate(from, t.start) : t.start;
      const overlapEnd = to ? minDate(to, t.end) : t.end;
      if (toDate(overlapStart).getTime() > toDate(overlapEnd).getTime()) continue;

      const days = Math.max(1, diffDays(overlapStart, overlapEnd) + 1);
      const alloc = (Array.isArray(t.resources)
        && t.resources.find((r) => r.employee_id === employeeId)) || null;
      const hpd = alloc ? Number(alloc.hours_per_day || WORK_HOURS_PER_DAY)
        : (t.planned_hours / Math.max(1, t.duration));

      result.tasks.push({
        task_id: t.id,
        project_id: t.project_id,
        from: overlapStart,
        to: overlapEnd,
        hours_per_day: round2(hpd),
        total_hours: round2(hpd * days),
      });
      result.total_hours += hpd * days;

      for (let i = 0; i < days; i++) {
        const d = addDays(overlapStart, i);
        result.per_day[d] = round2((result.per_day[d] || 0) + hpd);
      }
    }

    for (const [d, h] of Object.entries(result.per_day)) {
      if (h > WORK_HOURS_PER_DAY) {
        result.overallocation_days.push({ date: d, hours: h });
      }
    }
    result.total_hours = round2(result.total_hours);
    return result;
  }

  // ───────── Resource leveling ─────────
  //  Very simple heuristic:
  //  for each overallocated day, push non-critical overlapping tasks
  //  later by 1 day until allocation <= WORK_HOURS_PER_DAY.
  function levelResources(projectId, employeeId) {
    if (!projectId) throw new Error('levelResources: projectId required');
    recompute(projectId);

    const MAX_ITERATIONS = 500;
    for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
      const load = resourceLoad(employeeId, null);
      if (load.overallocation_days.length === 0) break;
      const badDay = load.overallocation_days[0].date;

      // Find non-critical tasks for this employee overlapping badDay, sorted by slack desc
      const candidates = listTasks(projectId)
        .filter((t) => {
          const involved = t.assignee === employeeId
            || (Array.isArray(t.resources) && t.resources.some((r) => r.employee_id === employeeId));
          return involved && !t.critical
            && toDate(t.start).getTime() <= toDate(badDay).getTime()
            && toDate(t.end).getTime() >= toDate(badDay).getTime();
        })
        .sort((a, b) => (b.slack || 0) - (a.slack || 0));

      if (candidates.length === 0) break;
      const pick = candidates[0];
      pick.start = addDays(pick.start, 1);
      pick.end = addDays(pick.end, 1);
      recompute(projectId);
    }

    return resourceLoad(employeeId, null);
  }

  // ───────── Milestones ─────────
  function addMilestone(projectId, ms) {
    const project = projects.get(projectId);
    if (!project) throw new Error(`addMilestone: project not found ${projectId}`);
    if (!ms || !ms.name) throw new Error('addMilestone: name required');
    const id = ms.id || nextMsId();
    const m = {
      id,
      project_id: projectId,
      name: ms.name,
      name_he: ms.name_he || ms.name,
      date: ms.date || project.end_date || project.start_date,
      reached: !!ms.reached,
      task_id: ms.task_id || null,
    };
    milestones.set(id, m);
    emit('milestone.added', { id, project_id: projectId });
    return id;
  }

  function listMilestones(projectId) {
    return Array.from(milestones.values()).filter((m) => m.project_id === projectId);
  }

  function markMilestoneReached(id, reached) {
    const m = milestones.get(id);
    if (!m) throw new Error(`markMilestoneReached: not found ${id}`);
    m.reached = reached !== false;
    return { ...m };
  }

  // ───────── WBS helpers ─────────
  function wbs(projectId) {
    const list = listTasks(projectId);
    const byParent = new Map();
    for (const t of list) {
      const p = t.parent_id || '__root__';
      const arr = byParent.get(p) || [];
      arr.push(t);
      byParent.set(p, arr);
    }
    function build(parent) {
      const kids = (byParent.get(parent || '__root__') || []).slice();
      kids.sort((a, b) => (a.wbs || '').localeCompare(b.wbs || '', undefined, { numeric: true }));
      return kids.map((k) => ({
        id: k.id,
        wbs: k.wbs,
        title: k.title,
        title_he: k.title_he,
        start: k.start,
        end: k.end,
        duration: k.duration,
        progress: k.progress,
        status: k.status,
        critical: !!k.critical,
        children: build(k.id),
      }));
    }
    return build(null);
  }

  // ───────── Events / dashboard ─────────
  function dashboard(projectId) {
    const project = projects.get(projectId);
    if (!project) throw new Error(`dashboard: project not found ${projectId}`);
    const list = listTasks(projectId);
    const totals = {
      tasks: list.length,
      done: list.filter((t) => t.status === STATUS.DONE).length,
      active: list.filter((t) => t.status === STATUS.ACTIVE).length,
      blocked: list.filter((t) => t.status === STATUS.BLOCKED).length,
      planned: list.filter((t) => t.status === STATUS.PLANNED).length,
    };
    const ev = earnedValue(projectId);
    const bva = budgetVsActual(projectId);
    return {
      project: { ...project, tags: project.tags.slice() },
      totals,
      earned_value: ev,
      budget_vs_actual: bva,
      critical_path: criticalPath(projectId),
      milestones: listMilestones(projectId),
    };
  }

  function getEvents() { return events.slice(); }

  return {
    // project ops
    createProject, getProject, listProjects, updateProject, cancelProject,
    // task ops
    addTask, getTask, listTasks, updateTask,
    // dependency ops
    linkTasks, unlinkTasks,
    // schedule
    recompute, criticalPath,
    // metrics
    earnedValue, burndown, budgetVsActual,
    // time
    logTime, listTimeEntries,
    // resources
    resourceLoad, levelResources,
    // milestones
    addMilestone, listMilestones, markMilestoneReached,
    // wbs / dash
    wbs, dashboard,
    // events
    getEvents,
    // constants
    STATUS, STATUS_HE, DEP_TYPES, PRIORITY,
  };
}

// ─────────────────────────────────────────────────────────────
//  Utilities
// ─────────────────────────────────────────────────────────────

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}
function round2(n) { return Math.round(n * 100) / 100; }
function round3(n) {
  if (!isFinite(n)) return n;
  return Math.round(n * 1000) / 1000;
}

// ─────────────────────────────────────────────────────────────
//  Default singleton + named API exports
// ─────────────────────────────────────────────────────────────

const defaultEngine = createEngine();

module.exports = {
  // factory
  createEngine,
  // singleton API
  createProject: (f) => defaultEngine.createProject(f),
  addTask: (pid, t) => defaultEngine.addTask(pid, t),
  linkTasks: (p, s, t, l) => defaultEngine.linkTasks(p, s, t, l),
  recompute: (pid) => defaultEngine.recompute(pid),
  criticalPath: (pid) => defaultEngine.criticalPath(pid),
  earnedValue: (pid, asOf) => defaultEngine.earnedValue(pid, asOf),
  resourceLoad: (emp, period) => defaultEngine.resourceLoad(emp, period),
  // extra singleton surface
  getProject: (id) => defaultEngine.getProject(id),
  listProjects: () => defaultEngine.listProjects(),
  updateProject: (id, p) => defaultEngine.updateProject(id, p),
  cancelProject: (id) => defaultEngine.cancelProject(id),
  getTask: (id) => defaultEngine.getTask(id),
  listTasks: (pid) => defaultEngine.listTasks(pid),
  updateTask: (id, p) => defaultEngine.updateTask(id, p),
  unlinkTasks: (p, s) => defaultEngine.unlinkTasks(p, s),
  burndown: (pid) => defaultEngine.burndown(pid),
  budgetVsActual: (pid) => defaultEngine.budgetVsActual(pid),
  logTime: (e) => defaultEngine.logTime(e),
  listTimeEntries: (f) => defaultEngine.listTimeEntries(f),
  levelResources: (pid, emp) => defaultEngine.levelResources(pid, emp),
  addMilestone: (pid, m) => defaultEngine.addMilestone(pid, m),
  listMilestones: (pid) => defaultEngine.listMilestones(pid),
  markMilestoneReached: (id, r) => defaultEngine.markMilestoneReached(id, r),
  wbs: (pid) => defaultEngine.wbs(pid),
  dashboard: (pid) => defaultEngine.dashboard(pid),
  getEvents: () => defaultEngine.getEvents(),
  // constants
  STATUS, STATUS_HE, DEP_TYPES, PRIORITY,
  // date helpers (exported for UI use)
  addDays, diffDays, fmtDate, toDate, todayIso,
};
