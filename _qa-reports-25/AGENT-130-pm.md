# AGENT-130 - Project Management Domain Audit

**Agent:** 130
**Date:** 2026-04-29
**Worktree:** `objective-merkle-40ff93`
**Scope:** Project Management domain - tables `pm_projects`, `pm_tasks`, `pm_milestones`, `pm_time_entries`; Gantt; dependencies; time-tracking integration with payroll.

---

## 1. Executive Summary

**VERDICT: NAMING DRIFT + PARTIAL IMPLEMENTATION.** The brief requests `pm_*` tables, but the codebase implements PM under the `execution.*` schema (no `pm_projects` / `pm_tasks` / `pm_milestones` / `pm_time_entries` exist anywhere in the migrations). The domain is otherwise well-modelled: a CPM/Gantt JS engine exists, dependency graph is wired, and time tracking lives in **two parallel tables** that are not yet integrated with payroll. RTL Hebrew Gantt is implemented as pure SVG.

| Check | Status | Notes |
|---|---|---|
| `pm_projects` table | MISSING | Implemented as `execution.projects` |
| `pm_tasks` table | MISSING | Implemented as `execution.tasks` + `execution.work_order_tasks` |
| `pm_milestones` table | MISSING | Implemented as `execution.project_milestones` |
| `pm_time_entries` table | MISSING | Two implementations: `execution.labor_logs` + `workforce.attendance` |
| Gantt UI | PRESENT | `payroll-autonomous/src/components/Gantt.jsx` (837 lines, pure SVG, RTL) |
| Dependency model | PRESENT | `execution.task_dependencies` + `execution.dependencies` (cross-entity) |
| CPM engine | PRESENT | `onyx-procurement/src/projects/pm-engine.js` (971 lines) |
| Time -> Payroll bridge | ABSENT | No SQL/RPC wiring labor_logs into payroll_runs |

---

## 2. Schema Findings (Actual Tables)

### 2.1 Core PM tables (under `execution` schema)

| Requested | Actual Table | File | Notes |
|---|---|---|---|
| `pm_projects` | `execution.projects` | `supabase/migrations/00000_master_schema.sql:802` | Full lifecycle (Planning -> SignedOff), budget/actual/billed/collected, customer/quote/contract FKs, planned vs actual dates, owner. Hardened in `00045_execution_domain_complete.sql` with `is_deleted`, `is_active`, `metadata`. |
| `pm_tasks` | `execution.tasks` | `00000_master_schema.sql:905` | Top-level task entity (`task_number` unique, generic `linked_entity_type`/`id`). `work_order_id` and `project_id` added in migration 00045. **Plus** sub-table `execution.work_order_tasks` at line 891 - duplicate semantics, both still active. |
| `pm_milestones` | `execution.project_milestones` | `00000_master_schema.sql:853` | Has `phase_id` link to `execution.project_phases`, `due_date`, `achieved_at`, `state`. |
| `pm_time_entries` | `execution.labor_logs` (primary) AND `workforce.attendance` (secondary) | `00045:333` and `00000:1283` | See section 5. |

### 2.2 Supporting tables (already present)

- `execution.project_phases` - WBS layer (00000:836)
- `execution.task_dependencies` - simple FS edge (predecessor_task_id / successor_task_id, dependency_type) (00000:924)
- `execution.dependencies` - cross-entity dependency graph with FS/SS/FF/SF + `lag_days` + `is_critical` (00045:233)
- `execution.project_resources` - resource allocation w/ allocated_hours, actual_hours, utilization_pct (00045:198)
- `execution.project_cost_plans` - 1:1 budget plan (00011:253)
- `execution.project_risks`, `execution.project_blockers` (00010:85, 122)
- `execution.work_centers`, `execution.production_orders`, `execution.installation_teams` (00045)

**Issue 1:** Two task tables (`tasks` and `work_order_tasks`) is data-model debt. Migration 00045 added `project_id`/`work_order_id` to `execution.tasks` but did not deprecate `work_order_tasks`. UI / RPCs may write to either.

**Issue 2:** Two dependency tables (`task_dependencies` and `dependencies`). The latter is richer (lag, critical flag, multi-entity). No SQL migration consolidates them.

---

## 3. Gantt / Critical Path

### 3.1 Frontend
- **`payroll-autonomous/src/components/Gantt.jsx`** (837 lines) - pure-SVG Gantt, zero deps. Day/week/month zoom, FS/SS/FF/SF arrows, Hebrew RTL (`time flows right-to-left, labels on the right`), milestone diamonds, drag-to-reschedule stub hooks (`onTaskMove`), Palantir dark theme. Status colors map to `planned/active/blocked/done/cancelled`.
- **`techno-kol-ops/client/src/components/ProjectTimeline.tsx`** - lighter timeline (CSS divs, no SVG arrows, no dependency rendering). Likely older/redundant.

### 3.2 Engine
- **`onyx-procurement/src/projects/pm-engine.js`** (971 lines) - in-memory CPM engine. Implements:
  - WBS, FS/SS/FF/SF dependencies with lag
  - Forward pass / backward pass / slack / critical path
  - Cycle detection (rejects self-dep + cycles)
  - Earned Value: PV/EV/AC/CPI/SPI
  - Budget vs Actual, burndown, time tracking, resource leveling
  - Hebrew bilingual titles
- 15+ unit tests at `test/payroll/pm-engine.test.js` cover CPM, EV, dep types, cycle rejection.

**Issue 3:** Engine is **in-memory only** - no DB persistence layer. Engine state lives in JS objects; nothing writes back to `execution.tasks` / `execution.dependencies`. No RPC bridges the two.

**Issue 4:** Dead menu route `/gantt` deactivated in `00067_deactivate_dead_menu_items.sql:57` and `/projects/gantt-chart-page` referenced in `00036:174` - menu wiring is incomplete.

---

## 4. Dependencies

- `execution.task_dependencies` (simple) - **only FS implied**, no `lag_days`, no critical flag.
- `execution.dependencies` (rich) - supports `finish_to_start | start_to_start | finish_to_finish | start_to_finish | blocks | requires`, `lag_days integer`, `is_critical boolean`, source/target entity types include `project | work_order | task | milestone | phase`. Indexed on (source, target, state, is_critical).
- Engine supports all 4 standard types + lag (`pm-engine.js` linkTasks).
- **Gap:** Gantt UI reads from a `tasks[].dependencies[]` prop but no SQL view assembles this from either dep table.

---

## 5. Time Tracking Integration with Payroll

**This is the largest gap.** Three storage locations exist with no reconciliation:

| Table | Schema | Purpose | Granularity |
|---|---|---|---|
| `execution.labor_logs` | execution | Worker time per project/WO/production_order/task. Has `billable_rate`, `currency`, `state` (draft/submitted/approved/rejected/billed). | Per work session (started_at / ended_at / duration_minutes) |
| `workforce.attendance` | workforce | Daily attendance with project/WO link. `regular_hours`, `overtime_hours`, `approval_status`. | Per work_date |
| `workforce.workforce_assignments` | workforce | Active employee->project link, no hours. | Per assignment |

**Findings:**
1. `workforce.attendance` already has `project_id` and `work_order_id` columns (00000:1288-1289), so daily attendance is project-aware.
2. `execution.labor_logs.employee_user_id` references `governance.users_profile`, NOT `workforce.employees(id)` - direct mismatch with attendance which uses `employee_id` -> `workforce.employees`. Two different identities.
3. **No RPC, view, or trigger reconciles `labor_logs` into `attendance` or into `payroll_runs`.** Searches for `labor_logs.*payroll`, `attendance.*labor_logs`, `sync.*payroll` in migrations return zero matches in the SQL layer.
4. `workforce.payroll_runs` (00000:1305) has period_start/period_end but no FK or rollup from either time source.
5. The Project 360 RPC (`execution.get_project_360`, 00006:152) returns work_orders / POs / invoices / team / alerts but **does not surface labor_logs or attendance hours**, so PMs cannot see consumed labor in 360.

**Required fix (recommended):**
- Pick one source of truth (recommend `execution.labor_logs` for project granularity, with daily rollup view into `workforce.attendance`).
- Add `execution.fn_rollup_labor_to_attendance(date_range)` to feed payroll.
- Add labor totals to `execution.get_project_360` payload.
- Reconcile `employee_user_id` (governance) vs `employee_id` (workforce) in labor_logs.

---

## 6. RLS / Security

- `execution.projects`, `work_orders`, `tasks`, `task_dependencies` all have RLS enabled (00001:213-216, 00005:23-25).
- `execution.labor_logs` RLS policies not visible in 00045 (deferred per file's Part F note: "RLS: deferred to a dedicated RLS migration"). **Audit gap** - confirm 00068/00071 cover it.
- Project-360 RPC checks `governance.can_read_project()` correctly.

---

## 7. State Machines / Lifecycle

- Project states observed: `Planning`, `Active`, `OnHold`, `Completed`, `SignedOff`, `Cancelled` (mentioned in 00006 RPC).
- `state-machines.js` from pipeline (per CLAUDE.md) declares 13 state machines / 91 transitions - not re-verified here.
- 00045:Part C adds NOT-VALID CHECK constraints for project/work_order/task lifecycle - good defensive measure.

---

## 8. Key Issues Ranked

| # | Severity | Issue | Recommended Fix |
|---|---|---|---|
| 1 | HIGH | No `pm_*` tables - naming mismatch with brief. If brief is authoritative, rename / create views aliasing `execution.*` -> `pm.*`. | Create `pm` schema with views or accept `execution.*` naming and update brief. |
| 2 | HIGH | No bridge from `execution.labor_logs` -> `workforce.payroll_runs`. Time tracked on projects never reaches payroll. | Add rollup function + payroll_run line items keyed by labor_logs.id. |
| 3 | HIGH | PM engine (`pm-engine.js`) is in-memory only. No DB persistence, no RPC. | Add `execution.rpc_save_pm_state(project_id, payload)` or refactor engine to read/write SQL. |
| 4 | MED | Two task tables (`tasks` + `work_order_tasks`) and two dep tables (`task_dependencies` + `dependencies`). | Deprecate one of each pair, add migration to merge data. |
| 5 | MED | Project 360 RPC missing labor hours, milestones list, dependencies, critical-path summary. | Extend `execution.get_project_360` payload. |
| 6 | MED | `labor_logs.employee_user_id` references governance not workforce - cannot directly join to `workforce.employees`. | Add `employee_id bigint references workforce.employees(id)` and backfill. |
| 7 | LOW | `/gantt` and `/projects/gantt-chart-page` routes deactivated/orphaned. | Wire active route or remove dead refs. |
| 8 | LOW | Gantt component lives in `payroll-autonomous` - cross-service coupling. | Move to `packages/shared-ui` or `techno-kol-ops`. |

---

## 9. Files Referenced

- `supabase/migrations/00000_master_schema.sql` - core PM tables
- `supabase/migrations/00010_enterprise_expansion_30_tables.sql` - project_risks, project_blockers
- `supabase/migrations/00011_enterprise_expansion_30_more_tables.sql` - project_cost_plans
- `supabase/migrations/00045_execution_domain_complete.sql` - dependencies, project_resources, labor_logs, work_centers
- `supabase/migrations/00006_read_models_and_360_rpcs.sql` - get_project_360 RPC
- `onyx-procurement/src/projects/pm-engine.js` - CPM engine
- `test/payroll/pm-engine.test.js` - 15+ unit tests
- `payroll-autonomous/src/components/Gantt.jsx` - SVG Gantt
- `techno-kol-ops/client/src/components/ProjectTimeline.tsx` - simple timeline
- `onyx-procurement/src/pipeline/entity-map.js` - project entity definition

---

## 10. Conclusion

The PM domain has **strong logic (engine + Gantt)** but **weak persistence wiring**. The `pm_*` table names in the brief do not exist - the actual implementation uses `execution.*`. The biggest functional gap is the disconnect between project-level time tracking (`execution.labor_logs`) and the payroll engine (`workforce.payroll_runs` / `workforce.attendance`). Resolving issues #1-3 above would lift the domain to production-grade.

**End of report.**
