# AGENT-228 - PM Engine DB Persistence + Labor Bridge

**Agent:** 228
**Date:** 2026-04-29
**Worktree:** `objective-merkle-40ff93`
**Predecessor:** AGENT-130 (PM domain audit - flagged engine as in-memory only)
**Scope:** Persist `pm-engine.js` state to DB; bridge `labor_logs` to `workforce.attendance`; unify `tasks` vs `work_order_tasks`; extend `get_project_360` with labor + milestones + critical path.

---

## 1. Executive Summary

AGENT-130 found the CPM/Gantt engine (`onyx-procurement/src/projects/pm-engine.js`, 971 lines) is logic-only - state lives in JS objects, no SQL writes. AGENT-228 closes that gap with one consolidated migration `00075_pm_engine_persistence.sql`.

**Four deliverables, one migration:**
1. **DB persistence** for engine state (CPM ES/EF/LS/LF/slack, EV PV/EV/AC, baselines).
2. **Labor -> attendance bridge** (deterministic daily rollup view + sync RPC + trigger).
3. **Task unification** (compat view over `execution.tasks`; deprecate `work_order_tasks`).
4. **Extended `get_project_360`** payload (labor hours, milestones, critical path, EV).

---

## 2. Migration Layout - `00075_pm_engine_persistence.sql`

| Sec | Purpose |
|---|---|
| A | Add CPM scheduling columns to `execution.tasks` |
| B | Constraint hardening on `execution.dependencies` (no self-loop) |
| C | NEW `execution.project_baselines` (snapshots for variance) |
| D | NEW `execution.task_progress_log` (append-only progress feed) |
| E | RPC `rpc_pm_save_state` - engine -> DB writer |
| F | RPC `rpc_pm_load_state` - DB -> engine reader |
| G | RPC `rpc_pm_recompute` - in-DB CPM forward pass (recursive CTE) |
| H | View `v_labor_daily_rollup` - aggregates labor_logs by (employee, day) |
| I | RPC `rpc_sync_labor_to_attendance` - upserts into `workforce.attendance` |
| J | Trigger `trg_labor_logs_to_attendance` - real-time sync on approval |
| K | View `v_work_order_tasks_compat` - back-compat for old code |
| L | One-time data migration `work_order_tasks` -> `tasks` |
| M | Replace `execution.get_project_360` with extended payload |

---

## 3. Section Sketches

### A. CPM columns on `execution.tasks`
```sql
alter table execution.tasks
  add column if not exists project_id bigint references execution.projects(id),
  add column if not exists work_order_id bigint references execution.work_orders(id),
  add column if not exists phase_id bigint references execution.project_phases(id),
  add column if not exists planned_start_date date,
  add column if not exists planned_end_date date,
  add column if not exists actual_start_date date,
  add column if not exists actual_end_date date,
  add column if not exists duration_days integer,
  add column if not exists progress_percent numeric(5,2) not null default 0,
  add column if not exists effort_hours numeric(10,2),
  add column if not exists actual_hours numeric(10,2),
  add column if not exists earliest_start date,
  add column if not exists earliest_finish date,
  add column if not exists latest_start date,
  add column if not exists latest_finish date,
  add column if not exists slack_days integer,
  add column if not exists is_critical boolean not null default false,
  add column if not exists baseline_start date,
  add column if not exists baseline_finish date,
  add column if not exists planned_value numeric(14,2),
  add column if not exists earned_value numeric(14,2),
  add column if not exists actual_cost numeric(14,2);
create index if not exists idx_tasks_project_id    on execution.tasks(project_id);
create index if not exists idx_tasks_work_order_id on execution.tasks(work_order_id);
create index if not exists idx_tasks_is_critical   on execution.tasks(is_critical) where is_critical;
```
Note: `project_id`/`work_order_id` already added in 00045 (idempotent).

### B. Dependencies guard
```sql
alter table execution.dependencies
  add constraint if not exists chk_deps_no_self_loop
  check (not (source_entity_type = target_entity_type and source_entity_id = target_entity_id));
```
Cycle detection across multiple edges left to recompute RPC.

### C. `execution.project_baselines` (NEW)
```sql
create table if not exists execution.project_baselines (
  id bigserial primary key,
  public_id uuid not null default governance.generate_public_id(),
  project_id bigint not null references execution.projects(id) on delete cascade,
  baseline_name text not null,
  baseline_type text not null check (baseline_type in ('initial','rebaseline','interim')),
  snapshot_date date not null default current_date,
  total_planned_value numeric(14,2),
  total_budget numeric(14,2),
  task_count integer,
  payload jsonb not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by bigint references governance.users_profile(id),
  unique(project_id, baseline_name)
);
```

### D. `execution.task_progress_log` (NEW)
```sql
create table if not exists execution.task_progress_log (
  id bigserial primary key,
  task_id bigint not null references execution.tasks(id) on delete cascade,
  project_id bigint not null references execution.projects(id) on delete cascade,
  reported_at timestamptz not null default now(),
  progress_percent numeric(5,2) not null check (progress_percent between 0 and 100),
  hours_worked numeric(10,2),
  reported_by_user_id bigint references governance.users_profile(id),
  notes text,
  source text not null default 'manual'
    check (source in ('manual','labor_log','timesheet','site_visit','engine'))
);
```

### E. `rpc_pm_save_state(project_id, payload)` - engine writer
```sql
create or replace function execution.rpc_pm_save_state(p_project_id bigint, p_payload jsonb)
returns jsonb language plpgsql security definer
set search_path = execution, governance, public as $$
declare v_task jsonb; v_count integer := 0;
begin
  if not governance.can_read_project(p_project_id) then
    raise exception 'PERMISSION_DENIED';
  end if;
  for v_task in select * from jsonb_array_elements(p_payload->'tasks') loop
    update execution.tasks set
      earliest_start  = (v_task->>'earliest_start')::date,
      earliest_finish = (v_task->>'earliest_finish')::date,
      latest_start    = (v_task->>'latest_start')::date,
      latest_finish   = (v_task->>'latest_finish')::date,
      slack_days      = nullif(v_task->>'slack_days','')::integer,
      is_critical     = coalesce((v_task->>'is_critical')::boolean, false),
      planned_value   = nullif(v_task->>'planned_value','')::numeric,
      earned_value    = nullif(v_task->>'earned_value','')::numeric,
      actual_cost     = nullif(v_task->>'actual_cost','')::numeric,
      updated_at      = now()
    where id = (v_task->>'id')::bigint and project_id = p_project_id;
    v_count := v_count + 1;
  end loop;
  return jsonb_build_object('tasks_updated', v_count, 'persisted_at', now());
end; $$;
```

### F. `rpc_pm_load_state(project_id)` - engine reader
Returns `{ project, tasks, dependencies, milestones, baseline }` shape matching `pm-engine.js` createProject + addTask + linkTasks inputs.

### G. `rpc_pm_recompute(project_id)` - in-DB forward pass
Recursive CTE walks `execution.dependencies` (source/target type='task'), computes ES/EF per topological order, marks slack=0 as critical. Backward pass deferred (engine remains authoritative for now).

### H. View `v_labor_daily_rollup`
```sql
create or replace view execution.v_labor_daily_rollup as
select
  ll.employee_user_id,
  up.employee_id as workforce_employee_id,
  ll.project_id,
  ll.work_order_id,
  date(ll.started_at) as work_date,
  sum(ll.duration_minutes) / 60.0 as total_hours,
  least(sum(ll.duration_minutes), 480) / 60.0 as regular_hours,
  greatest(0, sum(ll.duration_minutes) - 480) / 60.0 as overtime_hours,
  count(*) as log_count,
  bool_and(ll.state = 'approved') as all_approved
from execution.labor_logs ll
join governance.users_profile up on up.id = ll.employee_user_id
where ll.is_active and ll.is_deleted = false
group by ll.employee_user_id, up.employee_id, ll.project_id, ll.work_order_id, date(ll.started_at);
```
Requires `governance.users_profile.employee_id` -> `workforce.employees(id)` (AGENT-130 Issue #6). If absent, prepend:
```sql
alter table governance.users_profile add column if not exists employee_id bigint references workforce.employees(id);
```

### I. `rpc_sync_labor_to_attendance(from, to)`
```sql
create or replace function execution.rpc_sync_labor_to_attendance(
  p_from date default current_date - interval '7 days',
  p_to   date default current_date
) returns jsonb
language plpgsql security definer
set search_path = execution, workforce, governance, public as $$
declare v_count integer;
begin
  if not governance.current_user_has_permission('attendance.write') then
    raise exception 'PERMISSION_DENIED';
  end if;
  insert into workforce.attendance
    (attendance_number, employee_id, project_id, work_order_id, work_date,
     regular_hours, overtime_hours, source, approval_status, state)
  select
    'ATT-LL-' || to_char(r.work_date,'YYYYMMDD') || '-' || r.workforce_employee_id,
    r.workforce_employee_id, r.project_id, r.work_order_id, r.work_date,
    r.regular_hours, r.overtime_hours, 'labor_logs',
    case when r.all_approved then 'approved' else 'pending' end,
    case when r.all_approved then 'Approved' else 'Submitted' end
  from execution.v_labor_daily_rollup r
  where r.work_date between p_from and p_to and r.workforce_employee_id is not null
  on conflict (attendance_number) do update set
    regular_hours = excluded.regular_hours,
    overtime_hours = excluded.overtime_hours,
    source = 'labor_logs',
    approval_status = excluded.approval_status,
    updated_at = now();
  get diagnostics v_count = row_count;
  return jsonb_build_object('synced_rows', v_count, 'from', p_from, 'to', p_to);
end; $$;
```
`attendance_number` already unique (00000:1286).

### J. Real-time trigger
```sql
create or replace function execution.fn_labor_log_attendance_sync()
returns trigger language plpgsql as $$
begin
  if new.state = 'approved' and (old.state is distinct from 'approved') then
    perform execution.rpc_sync_labor_to_attendance(
      date(new.started_at), date(coalesce(new.ended_at, new.started_at)));
  end if;
  return new;
end; $$;
create trigger trg_labor_logs_to_attendance after update of state on execution.labor_logs
  for each row execute function execution.fn_labor_log_attendance_sync();
```

### K-L. Unify tasks
```sql
-- L. one-time copy
insert into execution.tasks (
  task_number, title, description, work_order_id, project_id,
  assignee_user_id, due_date, state, created_at, updated_at)
select
  'WOT-' || lpad(wot.id::text, 8, '0'), wot.task_name, wot.description, wot.work_order_id,
  (select wo.project_id from execution.work_orders wo where wo.id = wot.work_order_id),
  wot.assignee_user_id, wot.due_date,
  case wot.state when 'Done' then 'Closed' else wot.state end,
  wot.created_at, wot.updated_at
from execution.work_order_tasks wot
where not exists (select 1 from execution.tasks t where t.task_number = 'WOT-' || lpad(wot.id::text,8,'0'));

-- K. compat view
create or replace view execution.v_work_order_tasks_compat as
select t.id, t.work_order_id, t.title as task_name, t.description,
  null::integer as sequence_order, t.assignee_user_id, t.due_date,
  t.actual_end_date as completed_at, t.state, t.created_at, t.updated_at
from execution.tasks t where t.work_order_id is not null;

comment on table execution.work_order_tasks is
  'DEPRECATED 2026-04-29 (AGENT-228). Use execution.tasks. Drop in 00100+';
```

### M. Extended `get_project_360`
Replaces 00006:152. Existing keys (`project, work_orders, purchase_orders, invoices, team, alerts`) preserved. New keys:

```sql
'milestones', (
  select coalesce(jsonb_agg(x order by x.due_date nulls last), '[]'::jsonb) from (
    select m.id, m.milestone_name, m.due_date, m.achieved_at, m.state, m.phase_id
    from execution.project_milestones m where m.project_id = p_project_id) x),
'labor_summary', (
  select jsonb_build_object(
    'total_hours',    coalesce(sum(ll.duration_minutes)/60.0, 0),
    'billable_hours', coalesce(sum(case when ll.billable then ll.duration_minutes end)/60.0, 0),
    'approved_hours', coalesce(sum(case when ll.state='approved' then ll.duration_minutes end)/60.0, 0),
    'total_cost',     coalesce(sum(ll.duration_minutes/60.0 * ll.billable_rate), 0),
    'log_count',      count(*),
    'unique_workers', count(distinct ll.employee_user_id))
  from execution.labor_logs ll
  where ll.project_id = p_project_id and ll.is_active and ll.is_deleted = false),
'tasks_summary', (
  select jsonb_build_object(
    'total',          count(*),
    'open',           count(*) filter (where state in ('Open','InProgress')),
    'closed',         count(*) filter (where state in ('Closed','Done')),
    'critical_count', count(*) filter (where is_critical),
    'avg_progress',   coalesce(avg(progress_percent), 0))
  from execution.tasks where project_id = p_project_id),
'critical_path', (
  select coalesce(jsonb_agg(x order by x.earliest_start nulls last), '[]'::jsonb) from (
    select t.id, t.task_number, t.title, t.earliest_start, t.earliest_finish,
           t.slack_days, t.duration_days, t.progress_percent, t.state
    from execution.tasks t where t.project_id = p_project_id and t.is_critical) x),
'earned_value', (
  select jsonb_build_object(
    'PV', coalesce(sum(planned_value), 0),
    'EV', coalesce(sum(earned_value), 0),
    'AC', coalesce(sum(actual_cost), 0),
    'CPI', case when coalesce(sum(actual_cost),0)>0 then sum(earned_value)/sum(actual_cost) else null end,
    'SPI', case when coalesce(sum(planned_value),0)>0 then sum(earned_value)/sum(planned_value) else null end)
  from execution.tasks where project_id = p_project_id)
```

---

## 4. JS Adapter - `pm-persistence.js` (NEW)

```js
export async function loadProject(supabase, projectId) {
  const { data } = await supabase.rpc('rpc_pm_load_state', { p_project_id: projectId });
  return data;
}
export async function saveProject(supabase, projectId, engine) {
  const tasks = engine.listTasks(projectId).map(t => ({
    id: t.dbId,
    earliest_start: t.ES, earliest_finish: t.EF,
    latest_start: t.LS, latest_finish: t.LF,
    slack_days: t.slack, is_critical: t.isCritical,
    planned_value: t.PV, earned_value: t.EV, actual_cost: t.AC
  }));
  return supabase.rpc('rpc_pm_save_state', {
    p_project_id: projectId,
    p_payload: { tasks, computed_at: new Date().toISOString() }
  });
}
```
`createEngine()` accepts `{ supabase, projectId }`; calls `loadProject` in init, `saveProject` after each `recompute()`.

---

## 5. Tests

| Test | Method |
|---|---|
| `rpc_pm_save_state` round-trips ES/EF/slack/critical | pgTAP |
| `rpc_pm_load_state` returns project+tasks+deps+milestones | SQL |
| `v_labor_daily_rollup` correct (overtime split at 8h) | SQL |
| `rpc_sync_labor_to_attendance` idempotent (re-run = same row count) | SQL |
| Trigger fires only on draft->approved | SQL |
| `get_project_360` returns 11 keys incl. labor/milestones/critical_path | SQL |
| `v_work_order_tasks_compat` count == post-migration tasks(work_order_id not null) | SQL |
| Engine + DB happy path | Vitest `test/payroll/pm-engine-db.test.js` |

---

## 6. Rollout

1. Apply `00075` to staging.
2. One-shot `select execution.rpc_sync_labor_to_attendance('2025-01-01', current_date)` for backfill.
3. Verify `get_project_360` payload via Postman.
4. Wire `pm-persistence.js`; existing pm-engine callers unchanged.
5. UI Gantt already supports `is_critical` colour - no UI change needed for MVP.
6. Schedule `00100+` to drop `execution.work_order_tasks` after 2 sprints of compat-view usage.

---

## 7. Open Issues / Out-of-Scope

- **Backward CPM in PG:** RPC G implements forward pass only. JS engine remains authoritative until backward CTE finalized.
- **Identity bridge:** rollup view assumes `governance.users_profile.employee_id` link. AGENT-130 Issue #6 - separate migration to backfill from seed.
- **RLS:** new tables `project_baselines` + `task_progress_log` need policies in next RLS pass (mirror `execution.tasks`).
- **Tenancy:** if AGENT-124 multi-tenant pass merges first, add `tenant_id` columns to both new tables.
- **Cross-project deps:** RPC G assumes deps within one project; cross-project critical chains deferred.

---

## 8. Files Touched / Created

**New:**
- `supabase/migrations/00075_pm_engine_persistence.sql` (~600 lines, sections A-M)
- `onyx-procurement/src/projects/pm-persistence.js` (~80 lines)
- `test/sql/pm_persistence.sql`
- `test/sql/labor_rollup.sql`
- `test/sql/labor_to_attendance.sql`
- `test/sql/project_360.sql`
- `test/payroll/pm-engine-db.test.js`

**Modified:**
- `onyx-procurement/src/projects/pm-engine.js` - add `dbId` field on tasks; accept `{ supabase, projectId }` opts; auto-save after `recompute()`.

---

## 9. Acceptance Criteria

- [ ] `select execution.rpc_pm_load_state(<id>)` returns full engine input shape.
- [ ] After engine recompute + save, `execution.tasks.is_critical` and `slack_days` populated.
- [ ] `select * from execution.v_labor_daily_rollup where work_date=current_date` aggregates correctly (overtime split at 8h).
- [ ] `rpc_sync_labor_to_attendance` runs idempotently.
- [ ] `get_project_360(<id>)` returns 11 keys including `labor_summary`, `milestones`, `critical_path`, `earned_value`, `tasks_summary`.
- [ ] `count(work_order_tasks)` == `count(v_work_order_tasks_compat)` post-migration.
- [ ] Trigger fires on `labor_logs` state -> `'approved'` (verify in pg_log).

---

## 10. Conclusion

Single migration `00075` plus thin `pm-persistence.js` adapter closes all four gaps from the brief. Engine remains authoritative for full CPM; DB owns persistence + EV snapshot + labor rollup + payroll feed. Project 360 becomes useful for PMs (labor + milestones + critical path + EV all in one call).

**End of report.**
