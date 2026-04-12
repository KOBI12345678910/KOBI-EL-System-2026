# AG-X24 — Project Management Module (PM Engine + Gantt)

**Agent:** X-24 (Swarm 3B)
**Program:** Techno-Kol Uzi mega-ERP
**Date:** 2026-04-11
**Status:** DELIVERED — all tests green
**Rules respected:** never-delete · Hebrew RTL bilingual · zero dependencies

---

## 1. Summary / תקציר

אגנט X-24 אחראי על מודול ניהול הפרויקטים המלא עבור המערכת של טכנו-קול עוזי — מנוע PM מלא (CPM, EV, שיקוף משאבים) + רכיב SVG טהור של תרשים גאנט עם תמיכה מלאה ב-RTL עברית.

Agent X-24 delivers the full project management module for the Techno-Kol Uzi mega-ERP: a fully self-contained PM engine (WBS, CPM, Earned Value, Resource Leveling) plus a pure-SVG Gantt chart component that honors Hebrew RTL where time flows right-to-left.

All files are zero-dependency — no Moment, no Day.js, no d3, no Gantt libraries, no chart libraries. Everything runs on built-in `node:test` and on plain React + SVG.

---

## 2. Deliverables / תוצרים

| # | File | Purpose | LoC |
|---|------|---------|-----|
| 1 | `onyx-procurement/src/projects/pm-engine.js` | PM engine (projects, tasks, CPM, EV, resources) | ~690 |
| 2 | `payroll-autonomous/src/components/Gantt.jsx`  | Pure-SVG Gantt chart (Palantir dark, RTL) | ~620 |
| 3 | `test/payroll/pm-engine.test.js`               | 28 unit tests | ~440 |
| 4 | `_qa-reports/AG-X24-project-management.md`     | This QA report | — |

---

## 3. Data Model / מודל הנתונים

### Project
```
{
  id, name, name_he, client_id, budget,
  start_date, end_date, status, pm, tags[],
  created_at, updated_at
}
```

### Task
```
{
  id, project_id, wbs, parent_id,
  title, title_he, desc,
  assignee, start, end, duration, progress,
  dependencies: [ {pred_id, succ_id, type, lag} ],
  priority, status,
  planned_cost, actual_cost,
  planned_hours, actual_hours,
  resources: [ {employee_id, hours_per_day} ],
  milestone,
  // CPM (populated by recompute)
  es, ef, ls, lf, slack, critical
}
```

### Dependency
Types supported: **FS** (default), **SS**, **FF**, **SF** — with positive or negative **lag** (days).

### Milestone
```
{ id, project_id, name, name_he, date, reached, task_id }
```

### Time Entry
```
{ id, task_id, employee_id, date, hours, cost, note }
```

---

## 4. PM Engine — exported API

All the required exports are present, plus extra helpers:

### Required (per spec)
| Export | Signature |
|---|---|
| `createProject(fields) → id` | creates project, returns id |
| `addTask(projectId, task) → id` | creates task, accepts inline `dependencies[]` |
| `linkTasks(predId, succId, type, lag) → dependency` | FS/SS/FF/SF + lag |
| `recompute(projectId) → new schedule` | CPM forward + backward pass |
| `criticalPath(projectId) → task IDs on CP` | sorted by early-start |
| `earnedValue(projectId, asOf) → metrics` | PV/EV/AC/CPI/SPI/BAC/CV/SV/EAC/ETC/VAC |
| `resourceLoad(employeeId, period) → allocation` | per-day hours + overallocation |

### Extra helpers
- `createEngine()` — factory for isolated instances (testable)
- `wbs(projectId)` — hierarchical WBS tree
- `burndown(projectId)` — ideal vs. current remaining work
- `budgetVsActual(projectId)` — variance + over_budget flag
- `logTime(entry)` — time tracking → auto-updates `actual_hours`/`actual_cost`
- `levelResources(projectId, employeeId)` — non-critical task shifting heuristic
- `addMilestone / listMilestones / markMilestoneReached`
- `dashboard(projectId)` — aggregated KPI view
- `cancelProject(id)` — **never-delete rule** → sets status to `cancelled`
- `getEvents()` — ring buffer of engine events for the audit trail

---

## 5. CPM Algorithm

**Forward pass** (computes ES/EF):
1. Topological sort (Kahn) — throws on cycles
2. For each task in order, ES = max(constraint from every predecessor):
   - FS: `predEF + lag`
   - SS: `predES + lag`
   - FF: `predEF + lag - duration`
   - SF: `predES + lag - duration`
3. EF = ES + duration

**Backward pass** (computes LS/LF/slack):
1. Walk reverse topo order
2. For each task, LF = min over successors of the corresponding anti-constraint
3. LS = LF − duration
4. slack = LF − EF; `critical = (slack === 0)`

**Cycle detection**: `linkTasks` runs a colored DFS after linking and reverts the edge if a cycle is introduced.

---

## 6. Earned Value Management

Computed per task then aggregated:

| Metric | Formula |
|---|---|
| PV | Σ planned_cost × (elapsed / planned_duration) |
| EV | Σ planned_cost × (progress / 100) |
| AC | Σ actual_cost |
| CV | EV − AC |
| SV | EV − PV |
| CPI | EV / AC |
| SPI | EV / PV |
| BAC | Σ planned_cost |
| EAC | BAC / CPI |
| ETC | EAC − AC |
| VAC | BAC − EAC |

Health status returned both in Hebrew and English:
- תקין / healthy
- חריגה בתקציב / over budget
- איחור בלוח זמנים / behind schedule
- חריגה בתקציב ולוח זמנים / over budget & behind

---

## 7. Resource Leveling

Heuristic (bounded ≤ 500 iterations to guarantee termination):
1. `resourceLoad(employeeId)` — rolls up hours/day
2. For every overallocated day (> 8h), find non-critical tasks on that employee overlapping the day, sorted by slack desc
3. Push the highest-slack task by 1 day, recompute, repeat
4. Never touches critical-path tasks

---

## 8. Gantt.jsx — Pure-SVG Component

**Zero external chart libs.** Uses only React + inline SVG + inline styles.

### Features implemented
| Feature | Status |
|---|---|
| Horizontal time axis | ✅ SVG `<line>` ticks + `<text>` labels |
| Day / Week / Month zoom | ✅ toolbar buttons, `pxPerDay` per level |
| Vertical task list (WBS + title + %) | ✅ sticky label column |
| Task bars colored by status | ✅ planned/active/blocked/done/cancelled + critical override |
| Progress overlay | ✅ diagonal-stripe `<pattern>` |
| Dependency arrows | ✅ orthogonal Manhattan path with `<marker>` arrowhead |
| FS/SS/FF/SF connection points | ✅ per type, RTL-aware |
| Today line | ✅ dashed vertical line + label |
| Milestone diamonds | ✅ both inline (task.milestone) and external (`milestones[]`) |
| Drag-and-drop reschedule stub | ✅ mousedown/move/up → `onTaskMove({id,start,end})` |
| Hebrew RTL layout | ✅ `direction: rtl`, time flows right → left, label col on right |
| Palantir dark theme | ✅ `PALANTIR_DARK` palette, override-able via `theme` prop |
| Tooltips | ✅ native `<title>` elements — zero libs |
| Legend | ✅ colored chips + diamond + dashed-line indicators |
| Bilingual labels | ✅ `language` prop, picks `title_he` vs `title` |

### Props contract
```js
<Gantt
  tasks={tasks}
  milestones={milestones}
  language="he"
  zoom="day"
  onTaskMove={({id,start,end}) => pm.updateTask(id,{start,end})}
  onTaskClick={(task) => openPanel(task)}
  onZoomChange={(z) => setZoom(z)}
  theme={{...}}        // optional overrides
  height={600}
  rowHeight={34}
  labelColWidth={260}
  startDate="2026-04-01"
  endDate="2026-12-31"
/>
```

Coordinate helpers (`dayToX`, `xToDay`) are RTL-aware: in Hebrew mode, day 0 sits at the **right edge** of the chart.

---

## 9. Test Coverage

**`test/payroll/pm-engine.test.js`** — 28 cases, all green.

```
✔ 1. createProject stores fields and returns id
✔ 2. createProject throws without name
✔ 3. addTask creates task with computed end from duration
✔ 4. addTask rejects missing title and unknown project
✔ 5. linkTasks creates FS dependency with lag
✔ 6. linkTasks rejects self-dependency and cycles
✔ 7. recompute performs forward pass (FS chain)
✔ 8. critical path returns all tasks when linear FS
✔ 9. parallel branches — only longest is critical
✔ 10. SS (start-to-start) dependency honored
✔ 11. FF (finish-to-finish) dependency honored
✔ 12. FS with negative lag (overlap)
✔ 13. adding a dependency shifts successor after recompute
✔ 14. earnedValue computes PV/EV/AC/CPI/SPI
✔ 15. earnedValue: healthy when CPI≥1 and SPI≥1
✔ 16. budgetVsActual detects over-budget
✔ 17. burndown returns ideal line and today snapshot
✔ 18. logTime accumulates actual_hours and actual_cost
✔ 19. resourceLoad reports hours across tasks
✔ 20. levelResources does not throw on infeasible cases
✔ 21. wbs builds hierarchical tree via parent_id
✔ 22. milestones can be added and marked reached
✔ 23. Hebrew bilingual titles preserved through pipeline
✔ 24. cancelProject (never-delete) keeps data
✔ 25. addTask accepts inline dependencies array
✔ 26. Engine emits events for create/link/recompute
✔ 27. dashboard returns aggregate KPIs
✔ 28. slack > 0 for tasks not on critical path

tests 28 · pass 28 · fail 0 · duration_ms ~186
```

Run locally with:
```
node --test test/payroll/pm-engine.test.js
```

---

## 10. Rules Compliance / תאימות לכללים

| Rule | How it's enforced |
|---|---|
| **Never delete** | No `delete*` method. `cancelProject` sets status to `cancelled` but retains all task data. Dependencies use `unlinkTasks` (removes link, keeps tasks). |
| **Hebrew RTL bilingual** | Every user-facing string has `*_he` counterpart (project.name_he, task.title_he, STATUS_HE, milestone.name_he). Gantt renders `direction: rtl`, time flows right-to-left, label column sits on the right, Hebrew month names used in ticks. |
| **Zero dependencies** | `require`/`import` in all three files reference only `node:test`, `node:assert/strict`, `path`, and `react`. No Moment/Day.js/Luxon. No d3/Recharts/Nivo. No lodash. |
| **Real code** | Full CPM with forward + backward pass, all four dependency types, RTL coordinate transform, bounded resource leveling, EV with CPI/SPI/EAC/ETC/VAC. No placeholders. |

---

## 11. Integration Hooks / נקודות חיבור

- **HR module** — `task.assignee` and `task.resources[].employee_id` are opaque strings; pass `emp-XXX` IDs from `onyx-procurement/src/hr/*`.
- **Accounting / payroll** — `logTime` feeds `actual_cost`; `earnedValue` and `budgetVsActual` ready for dashboard consumption.
- **Audit trail** — `getEvents()` returns a ring-buffered log consumable by Agent 98's `AuditTrail.jsx`.
- **Realtime** — every write emits an event, easy to bridge to the existing event bus.

---

## 12. Known Limitations

1. Resource leveling is a greedy heuristic, not an ILP solver. For hard-overlap cases without slack, it may not fully clear overallocation; test #20 exercises this and asserts it returns a valid (non-throwing) load object.
2. Calendar = continuous days. Weekends/holidays are not subtracted. The Israeli work calendar integration can be bolted onto `addDays` in a follow-up.
3. Gantt drag-and-drop is a single-task reschedule; does not yet re-drive dependency constraints live during drag (only after commit).
4. No persistence layer — the engine keeps state in `Map`s. Wiring to PostgreSQL is the job of a subsequent agent.

---

## 13. Acceptance / קבלה

- [x] Both source files created at the requested absolute paths
- [x] Exports match the spec: createProject, addTask, linkTasks, recompute, criticalPath, earnedValue, resourceLoad
- [x] All 9 features implemented (WBS, CPM, FS/SS/FF/SF + lag, resource leveling, EV, burndown, budget vs actual, time tracking, auto recompute)
- [x] Gantt: horizontal axis with zoom, vertical list, colored bars, dep arrows, today line, milestone diamonds, drag hooks, Hebrew RTL, Palantir dark
- [x] 28 unit tests passing (spec requested 20+)
- [x] Zero dependencies
- [x] Hebrew RTL bilingual
- [x] Never-delete rule honored

**— Agent X-24, Swarm 3B, signing off.**
