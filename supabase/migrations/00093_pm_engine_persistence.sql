-- ============================================================
-- FILE: supabase/migrations/00093_pm_engine_persistence.sql
-- TECHNO-KOL UZI ERP 2026 — PM Engine DB Persistence + Labor Bridge
--
-- Owner:        AGENT-228
-- Predecessor:  AGENT-130 (PM domain audit — flagged engine as in-memory only)
-- Date:         2026-04-29
-- Worktree:     objective-merkle-40ff93
--
-- Purpose:
--   Persist `pm-engine.js` state to the database so CPM scheduling,
--   earned-value snapshots and project baselines survive process
--   restarts and become queryable from `get_project_360`. Bridges
--   `execution.labor_logs` into `workforce.attendance` so project
--   time tracking finally reaches payroll. Unifies the
--   `execution.tasks` vs `execution.work_order_tasks` data-model
--   debt via a one-shot data migration + a back-compat view.
--
-- Sections:
--   A. CPM scheduling columns on `execution.tasks` (ES/EF/LS/LF/slack,
--      planned/actual dates, EV PV/EV/AC, baseline_start/baseline_finish,
--      duration/effort, progress_percent).
--   B. `execution.dependencies` constraint hardening (no self-loop).
--   C. NEW table `execution.project_baselines` — variance snapshots.
--   D. NEW table `execution.task_progress_log` — append-only progress feed.
--   E. RPC `execution.rpc_pm_save_state(project_id, payload)` — engine writer.
--   F. RPC `execution.rpc_pm_load_state(project_id)` — engine reader.
--   G. RPC `execution.rpc_pm_recompute(project_id)` — in-DB CPM forward pass.
--   H. View `execution.v_labor_daily_rollup` — labor_logs aggregated by
--      (employee, day) with overtime split at 8h.
--   I. RPC `execution.rpc_sync_labor_to_attendance(from, to)` —
--      idempotent upsert into `workforce.attendance`.
--   J. Trigger `trg_labor_logs_to_attendance` — real-time sync on approval.
--   K. View `execution.v_work_order_tasks_compat` — back-compat for old code.
--   L. One-time data migration `work_order_tasks` → `tasks`.
--   M. Replace `execution.get_project_360` with extended payload (adds
--      labor_summary, milestones, tasks_summary, critical_path, earned_value).
--
-- IDEMPOTENT: every CREATE uses IF NOT EXISTS, every ALTER uses ADD
-- COLUMN IF NOT EXISTS, every constraint guard checks pg_constraint
-- first. Safe to re-run.
-- ============================================================

BEGIN;

-- ──────────────────────────────────────────────────────────────
-- PART A. CPM scheduling columns on execution.tasks
-- ──────────────────────────────────────────────────────────────
-- project_id and work_order_id were already added in 00045 — listing
-- them again is harmless because IF NOT EXISTS makes ALTER a no-op.

ALTER TABLE execution.tasks
  ADD COLUMN IF NOT EXISTS project_id          bigint REFERENCES execution.projects(id),
  ADD COLUMN IF NOT EXISTS work_order_id       bigint REFERENCES execution.work_orders(id),
  ADD COLUMN IF NOT EXISTS phase_id            bigint REFERENCES execution.project_phases(id),
  ADD COLUMN IF NOT EXISTS planned_start_date  date,
  ADD COLUMN IF NOT EXISTS planned_end_date    date,
  ADD COLUMN IF NOT EXISTS actual_start_date   date,
  ADD COLUMN IF NOT EXISTS actual_end_date     date,
  ADD COLUMN IF NOT EXISTS duration_days       integer,
  ADD COLUMN IF NOT EXISTS progress_percent    numeric(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS effort_hours        numeric(10,2),
  ADD COLUMN IF NOT EXISTS actual_hours        numeric(10,2),
  ADD COLUMN IF NOT EXISTS earliest_start      date,
  ADD COLUMN IF NOT EXISTS earliest_finish     date,
  ADD COLUMN IF NOT EXISTS latest_start        date,
  ADD COLUMN IF NOT EXISTS latest_finish       date,
  ADD COLUMN IF NOT EXISTS slack_days          integer,
  ADD COLUMN IF NOT EXISTS is_critical         boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS baseline_start      date,
  ADD COLUMN IF NOT EXISTS baseline_finish     date,
  ADD COLUMN IF NOT EXISTS planned_value       numeric(14,2),
  ADD COLUMN IF NOT EXISTS earned_value        numeric(14,2),
  ADD COLUMN IF NOT EXISTS actual_cost         numeric(14,2);

-- Bound progress_percent to [0,100] (skip if a competing constraint
-- already exists from a prior migration).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'execution.tasks'::regclass
       AND conname = 'tasks_progress_percent_chk'
  ) THEN
    ALTER TABLE execution.tasks
      ADD CONSTRAINT tasks_progress_percent_chk
      CHECK (progress_percent >= 0 AND progress_percent <= 100);
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_tasks_project_id        ON execution.tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_work_order_id     ON execution.tasks(work_order_id);
CREATE INDEX IF NOT EXISTS idx_tasks_phase_id          ON execution.tasks(phase_id);
CREATE INDEX IF NOT EXISTS idx_tasks_planned_start     ON execution.tasks(planned_start_date);
CREATE INDEX IF NOT EXISTS idx_tasks_planned_end       ON execution.tasks(planned_end_date);
CREATE INDEX IF NOT EXISTS idx_tasks_earliest_start    ON execution.tasks(earliest_start);
CREATE INDEX IF NOT EXISTS idx_tasks_is_critical       ON execution.tasks(is_critical) WHERE is_critical;

-- ──────────────────────────────────────────────────────────────
-- PART B. Dependencies guard — reject self-loops
-- ──────────────────────────────────────────────────────────────
-- Multi-edge cycle detection is left to rpc_pm_recompute (G).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'execution.dependencies'::regclass
       AND conname = 'chk_deps_no_self_loop'
  ) THEN
    ALTER TABLE execution.dependencies
      ADD CONSTRAINT chk_deps_no_self_loop
      CHECK (
        NOT (source_entity_type = target_entity_type
             AND source_entity_id = target_entity_id)
      );
  END IF;
END$$;

-- ──────────────────────────────────────────────────────────────
-- PART C. execution.project_baselines — variance snapshots
-- ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS execution.project_baselines (
  id                  bigserial   PRIMARY KEY,
  public_id           uuid        NOT NULL DEFAULT governance.generate_public_id(),
  project_id          bigint      NOT NULL REFERENCES execution.projects(id) ON DELETE CASCADE,
  baseline_name       text        NOT NULL,
  baseline_type       text        NOT NULL
    CHECK (baseline_type IN ('initial','rebaseline','interim')),
  snapshot_date       date        NOT NULL DEFAULT CURRENT_DATE,
  total_planned_value numeric(14,2),
  total_budget        numeric(14,2),
  task_count          integer,
  payload             jsonb       NOT NULL DEFAULT '{}'::jsonb,
  is_active           boolean     NOT NULL DEFAULT true,
  is_deleted          boolean     NOT NULL DEFAULT false,
  notes               text,
  metadata            jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  created_by          bigint      REFERENCES governance.users_profile(id),
  updated_by          bigint      REFERENCES governance.users_profile(id),
  UNIQUE (project_id, baseline_name)
);

CREATE INDEX IF NOT EXISTS idx_project_baselines_project_id   ON execution.project_baselines(project_id);
CREATE INDEX IF NOT EXISTS idx_project_baselines_is_active    ON execution.project_baselines(is_active);
CREATE INDEX IF NOT EXISTS idx_project_baselines_snapshot_date ON execution.project_baselines(snapshot_date desc);
CREATE INDEX IF NOT EXISTS idx_project_baselines_baseline_type ON execution.project_baselines(baseline_type);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgrelid = 'execution.project_baselines'::regclass
       AND tgname = 'trg_project_baselines_updated_at'
  ) THEN
    CREATE TRIGGER trg_project_baselines_updated_at
      BEFORE UPDATE ON execution.project_baselines
      FOR EACH ROW EXECUTE FUNCTION governance.set_updated_at();
  END IF;
END$$;

ALTER TABLE execution.project_baselines ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'execution'
       AND tablename  = 'project_baselines'
       AND policyname = 'project_baselines_read'
  ) THEN
    CREATE POLICY project_baselines_read ON execution.project_baselines
      FOR SELECT USING (governance.can_read_project(project_id));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'execution'
       AND tablename  = 'project_baselines'
       AND policyname = 'project_baselines_write'
  ) THEN
    CREATE POLICY project_baselines_write ON execution.project_baselines
      FOR ALL USING (governance.can_write_project(project_id))
              WITH CHECK (governance.can_write_project(project_id));
  END IF;
END$$;

COMMENT ON TABLE execution.project_baselines IS
  'AGENT-228 (00093): Project baselines — snapshot of PV/budget/dates for variance analysis. payload jsonb holds the full task-level snapshot used to rehydrate the engine.';

-- ──────────────────────────────────────────────────────────────
-- PART D. execution.task_progress_log — append-only progress feed
-- ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS execution.task_progress_log (
  id                  bigserial   PRIMARY KEY,
  public_id           uuid        NOT NULL DEFAULT governance.generate_public_id(),
  task_id             bigint      NOT NULL REFERENCES execution.tasks(id) ON DELETE CASCADE,
  project_id          bigint      NOT NULL REFERENCES execution.projects(id) ON DELETE CASCADE,
  reported_at         timestamptz NOT NULL DEFAULT now(),
  progress_percent    numeric(5,2) NOT NULL
    CHECK (progress_percent >= 0 AND progress_percent <= 100),
  hours_worked        numeric(10,2),
  earned_value        numeric(14,2),
  actual_cost         numeric(14,2),
  reported_by_user_id bigint      REFERENCES governance.users_profile(id),
  notes               text,
  source              text        NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual','labor_log','timesheet','site_visit','engine')),
  is_active           boolean     NOT NULL DEFAULT true,
  metadata            jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_task_progress_log_task_id     ON execution.task_progress_log(task_id);
CREATE INDEX IF NOT EXISTS idx_task_progress_log_project_id  ON execution.task_progress_log(project_id);
CREATE INDEX IF NOT EXISTS idx_task_progress_log_reported_at ON execution.task_progress_log(reported_at desc);
CREATE INDEX IF NOT EXISTS idx_task_progress_log_source      ON execution.task_progress_log(source);

ALTER TABLE execution.task_progress_log ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'execution'
       AND tablename  = 'task_progress_log'
       AND policyname = 'task_progress_log_read'
  ) THEN
    CREATE POLICY task_progress_log_read ON execution.task_progress_log
      FOR SELECT USING (governance.can_read_project(project_id));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'execution'
       AND tablename  = 'task_progress_log'
       AND policyname = 'task_progress_log_insert'
  ) THEN
    CREATE POLICY task_progress_log_insert ON execution.task_progress_log
      FOR INSERT WITH CHECK (governance.can_write_project(project_id));
  END IF;
END$$;

COMMENT ON TABLE execution.task_progress_log IS
  'AGENT-228 (00093): Append-only audit feed of task progress reports. Sources: manual entry, labor_log rollup, timesheet, site_visit, engine recompute.';

-- ──────────────────────────────────────────────────────────────
-- PART E. RPC execution.rpc_pm_save_state — engine writer
-- ──────────────────────────────────────────────────────────────
-- Persists CPM ES/EF/LS/LF/slack/is_critical and EV PV/EV/AC from the
-- in-memory pm-engine.js back into execution.tasks. Returns the count
-- of rows updated. Only the project's own tasks are touched.

CREATE OR REPLACE FUNCTION execution.rpc_pm_save_state(
  p_project_id bigint,
  p_payload    jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = execution, governance, public
AS $$
DECLARE
  v_task    jsonb;
  v_count   integer := 0;
  v_total   integer := 0;
BEGIN
  IF NOT governance.can_write_project(p_project_id) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: cannot write project %', p_project_id;
  END IF;

  IF p_payload IS NULL OR p_payload->'tasks' IS NULL THEN
    RETURN jsonb_build_object(
      'tasks_updated', 0,
      'persisted_at', now(),
      'note', 'no tasks in payload'
    );
  END IF;

  FOR v_task IN SELECT * FROM jsonb_array_elements(p_payload->'tasks') LOOP
    v_total := v_total + 1;
    UPDATE execution.tasks SET
      planned_start_date = COALESCE(NULLIF(v_task->>'planned_start_date','')::date, planned_start_date),
      planned_end_date   = COALESCE(NULLIF(v_task->>'planned_end_date','')::date,   planned_end_date),
      duration_days      = COALESCE(NULLIF(v_task->>'duration_days','')::integer,   duration_days),
      progress_percent   = COALESCE(NULLIF(v_task->>'progress_percent','')::numeric, progress_percent),
      effort_hours       = COALESCE(NULLIF(v_task->>'effort_hours','')::numeric,    effort_hours),
      actual_hours       = COALESCE(NULLIF(v_task->>'actual_hours','')::numeric,    actual_hours),
      earliest_start     = NULLIF(v_task->>'earliest_start','')::date,
      earliest_finish    = NULLIF(v_task->>'earliest_finish','')::date,
      latest_start       = NULLIF(v_task->>'latest_start','')::date,
      latest_finish      = NULLIF(v_task->>'latest_finish','')::date,
      slack_days         = NULLIF(v_task->>'slack_days','')::integer,
      is_critical        = COALESCE((v_task->>'is_critical')::boolean, false),
      planned_value      = NULLIF(v_task->>'planned_value','')::numeric,
      earned_value       = NULLIF(v_task->>'earned_value','')::numeric,
      actual_cost        = NULLIF(v_task->>'actual_cost','')::numeric,
      updated_at         = now()
     WHERE id = (v_task->>'id')::bigint
       AND project_id = p_project_id;

    IF FOUND THEN
      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'tasks_in_payload', v_total,
    'tasks_updated',    v_count,
    'project_id',       p_project_id,
    'persisted_at',     now()
  );
END;
$$;

COMMENT ON FUNCTION execution.rpc_pm_save_state(bigint, jsonb) IS
  'AGENT-228 (00093): Persist pm-engine.js state. Payload shape: {"tasks":[{"id":..,"earliest_start":..,"earliest_finish":..,"latest_start":..,"latest_finish":..,"slack_days":..,"is_critical":..,"planned_value":..,"earned_value":..,"actual_cost":..,"progress_percent":..}]}';

-- ──────────────────────────────────────────────────────────────
-- PART F. RPC execution.rpc_pm_load_state — engine reader
-- ──────────────────────────────────────────────────────────────
-- Returns the full input shape pm-engine.js needs to rehydrate a
-- project: the project record, all tasks, the dependency edges
-- (task→task scoped within the project), milestones and the
-- currently-active baseline (if any).

CREATE OR REPLACE FUNCTION execution.rpc_pm_load_state(
  p_project_id bigint
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = execution, governance, public
AS $$
DECLARE v_payload jsonb;
BEGIN
  IF NOT governance.can_read_project(p_project_id) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: cannot read project %', p_project_id;
  END IF;

  SELECT jsonb_build_object(
    'project', (SELECT to_jsonb(p) FROM execution.projects p WHERE p.id = p_project_id),
    'tasks', (
      SELECT COALESCE(jsonb_agg(t ORDER BY t.id), '[]'::jsonb) FROM (
        SELECT
          tk.id, tk.task_number, tk.title, tk.description,
          tk.project_id, tk.work_order_id, tk.phase_id,
          tk.assignee_user_id, tk.priority, tk.state,
          tk.planned_start_date, tk.planned_end_date,
          tk.actual_start_date, tk.actual_end_date,
          tk.duration_days, tk.progress_percent, tk.effort_hours, tk.actual_hours,
          tk.earliest_start, tk.earliest_finish,
          tk.latest_start, tk.latest_finish, tk.slack_days, tk.is_critical,
          tk.baseline_start, tk.baseline_finish,
          tk.planned_value, tk.earned_value, tk.actual_cost
        FROM execution.tasks tk
        WHERE tk.project_id = p_project_id
          AND COALESCE(tk.is_deleted, false) = false
      ) t
    ),
    'dependencies', (
      SELECT COALESCE(jsonb_agg(d ORDER BY d.id), '[]'::jsonb) FROM (
        SELECT
          dep.id,
          dep.source_entity_id   AS source_task_id,
          dep.target_entity_id   AS target_task_id,
          dep.dependency_type,
          dep.lag_days,
          dep.is_critical,
          dep.state
        FROM execution.dependencies dep
        WHERE dep.source_entity_type = 'task'
          AND dep.target_entity_type = 'task'
          AND dep.state = 'active'
          AND EXISTS (
            SELECT 1 FROM execution.tasks t1
            WHERE t1.id = dep.source_entity_id
              AND t1.project_id = p_project_id
          )
          AND EXISTS (
            SELECT 1 FROM execution.tasks t2
            WHERE t2.id = dep.target_entity_id
              AND t2.project_id = p_project_id
          )
      ) d
    ),
    'milestones', (
      SELECT COALESCE(jsonb_agg(m ORDER BY m.due_date NULLS LAST), '[]'::jsonb) FROM (
        SELECT id, milestone_name, due_date, achieved_at, state, phase_id
        FROM execution.project_milestones
        WHERE project_id = p_project_id
      ) m
    ),
    'baseline', (
      SELECT to_jsonb(b)
      FROM execution.project_baselines b
      WHERE b.project_id = p_project_id AND b.is_active
      ORDER BY b.snapshot_date DESC
      LIMIT 1
    ),
    'loaded_at', now()
  ) INTO v_payload;

  RETURN v_payload;
END;
$$;

COMMENT ON FUNCTION execution.rpc_pm_load_state(bigint) IS
  'AGENT-228 (00093): Read full PM state for a project — shape matches pm-engine.js createProject + addTask + linkTasks + addMilestone inputs.';

-- ──────────────────────────────────────────────────────────────
-- PART G. RPC execution.rpc_pm_recompute — in-DB CPM forward pass
-- ──────────────────────────────────────────────────────────────
-- Recursive CTE walks the dependency DAG, computes ES/EF per topological
-- order on a forward pass, marks slack=0 as critical. Backward pass and
-- explicit slack stay deferred to JS engine for now (Issue: cross-project
-- chains, lag handling for non-FS types). Forward pass is sufficient to
-- light up the Gantt critical-path colour persistently.
-- The function returns a summary of what it touched.

CREATE OR REPLACE FUNCTION execution.rpc_pm_recompute(
  p_project_id bigint
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = execution, governance, public
AS $$
DECLARE
  v_proj_start date;
  v_max_finish date;
  v_critical_count integer;
  v_task_count integer;
BEGIN
  IF NOT governance.can_write_project(p_project_id) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: cannot write project %', p_project_id;
  END IF;

  SELECT planned_start_date INTO v_proj_start
  FROM execution.projects WHERE id = p_project_id;

  IF v_proj_start IS NULL THEN
    v_proj_start := CURRENT_DATE;
  END IF;

  -- Forward pass: ES/EF per task. We use a recursive CTE walking
  -- predecessors. A task with no predecessor anchors at v_proj_start
  -- or its own planned_start_date if set. EF = ES + duration_days.
  WITH RECURSIVE preds AS (
    SELECT
      t.id          AS task_id,
      t.duration_days,
      t.planned_start_date
    FROM execution.tasks t
    WHERE t.project_id = p_project_id
      AND COALESCE(t.is_deleted, false) = false
  ),
  edges AS (
    SELECT
      d.source_entity_id AS pred_id,
      d.target_entity_id AS succ_id,
      COALESCE(d.lag_days, 0) AS lag,
      d.dependency_type
    FROM execution.dependencies d
    WHERE d.source_entity_type = 'task'
      AND d.target_entity_type = 'task'
      AND d.state = 'active'
      AND EXISTS (SELECT 1 FROM preds p WHERE p.task_id = d.source_entity_id)
      AND EXISTS (SELECT 1 FROM preds p WHERE p.task_id = d.target_entity_id)
  ),
  -- Anchor tasks have no incoming edges
  anchors AS (
    SELECT p.task_id, p.duration_days, p.planned_start_date
    FROM preds p
    WHERE NOT EXISTS (SELECT 1 FROM edges e WHERE e.succ_id = p.task_id)
  ),
  schedule(task_id, es, ef, depth) AS (
    SELECT
      a.task_id,
      COALESCE(a.planned_start_date, v_proj_start)                                   AS es,
      COALESCE(a.planned_start_date, v_proj_start) + COALESCE(a.duration_days, 0)    AS ef,
      0                                                                              AS depth
    FROM anchors a
    UNION ALL
    SELECT
      e.succ_id,
      s.ef + e.lag,
      s.ef + e.lag + COALESCE(p.duration_days, 0),
      s.depth + 1
    FROM schedule s
    JOIN edges e ON e.pred_id = s.task_id
    JOIN preds p ON p.task_id = e.succ_id
    WHERE s.depth < 1000  -- guard against accidental cycles
  ),
  reduced AS (
    -- For each task pick the LATEST ES (longest predecessor chain)
    SELECT task_id, MAX(es) AS es, MAX(ef) AS ef
    FROM schedule
    GROUP BY task_id
  )
  UPDATE execution.tasks t
     SET earliest_start  = r.es,
         earliest_finish = r.ef,
         updated_at      = now()
    FROM reduced r
   WHERE t.id = r.task_id
     AND t.project_id = p_project_id;

  GET DIAGNOSTICS v_task_count = ROW_COUNT;

  -- Project finish = max(EF) across all tasks
  SELECT MAX(earliest_finish) INTO v_max_finish
  FROM execution.tasks
  WHERE project_id = p_project_id;

  -- Approximate slack = (project_finish - EF), critical when slack=0.
  -- Backward pass (true LS/LF) still owned by pm-engine.js.
  UPDATE execution.tasks
     SET slack_days  = GREATEST(0, (v_max_finish - earliest_finish)),
         is_critical = (earliest_finish IS NOT NULL
                        AND v_max_finish IS NOT NULL
                        AND earliest_finish = v_max_finish),
         updated_at  = now()
   WHERE project_id = p_project_id
     AND earliest_finish IS NOT NULL;

  SELECT count(*) INTO v_critical_count
  FROM execution.tasks
  WHERE project_id = p_project_id AND is_critical;

  RETURN jsonb_build_object(
    'project_id',     p_project_id,
    'tasks_scheduled', v_task_count,
    'project_finish',  v_max_finish,
    'critical_count',  v_critical_count,
    'computed_at',     now()
  );
END;
$$;

COMMENT ON FUNCTION execution.rpc_pm_recompute(bigint) IS
  'AGENT-228 (00093): In-DB CPM forward pass via recursive CTE — populates earliest_start, earliest_finish, slack_days and is_critical. Backward pass (true LS/LF) deferred to pm-engine.js.';

-- ──────────────────────────────────────────────────────────────
-- PART H. View execution.v_labor_daily_rollup
-- ──────────────────────────────────────────────────────────────
-- Aggregates execution.labor_logs by (employee, day) with regular vs
-- overtime split at 8h. Resolves the governance↔workforce identity
-- mismatch via governance.users_profile.employee_id (added below if
-- missing — AGENT-130 Issue #6).

ALTER TABLE governance.users_profile
  ADD COLUMN IF NOT EXISTS employee_id bigint REFERENCES workforce.employees(id);

CREATE INDEX IF NOT EXISTS idx_users_profile_employee_id
  ON governance.users_profile(employee_id);

CREATE OR REPLACE VIEW execution.v_labor_daily_rollup AS
SELECT
  ll.employee_user_id,
  up.employee_id                                                              AS workforce_employee_id,
  ll.project_id,
  ll.work_order_id,
  date(ll.started_at)                                                          AS work_date,
  sum(ll.duration_minutes) / 60.0                                              AS total_hours,
  least(sum(ll.duration_minutes), 480) / 60.0                                  AS regular_hours,
  greatest(0, sum(ll.duration_minutes) - 480) / 60.0                           AS overtime_hours,
  sum(CASE WHEN ll.billable
            THEN ll.duration_minutes / 60.0 * ll.billable_rate
            ELSE 0 END)                                                        AS billable_amount,
  count(*)                                                                     AS log_count,
  bool_and(ll.state = 'approved')                                              AS all_approved,
  max(ll.updated_at)                                                           AS last_updated_at
FROM execution.labor_logs ll
LEFT JOIN governance.users_profile up ON up.id = ll.employee_user_id
WHERE COALESCE(ll.is_active, true)
  AND COALESCE(ll.is_deleted, false) = false
  AND ll.duration_minutes IS NOT NULL
  AND ll.started_at IS NOT NULL
GROUP BY
  ll.employee_user_id,
  up.employee_id,
  ll.project_id,
  ll.work_order_id,
  date(ll.started_at);

COMMENT ON VIEW execution.v_labor_daily_rollup IS
  'AGENT-228 (00093): Daily rollup of labor_logs per (employee, project, work_order, day). Overtime split at 480 minutes. Source for rpc_sync_labor_to_attendance.';

-- ──────────────────────────────────────────────────────────────
-- PART I. RPC execution.rpc_sync_labor_to_attendance
-- ──────────────────────────────────────────────────────────────
-- Idempotent upsert from v_labor_daily_rollup into workforce.attendance.
-- attendance_number is unique (00000:1286) so re-running collapses to
-- the same row. Approval state propagates: if every labor_log in the
-- day's rollup is approved, the attendance row is approved too.

CREATE OR REPLACE FUNCTION execution.rpc_sync_labor_to_attendance(
  p_from date DEFAULT (CURRENT_DATE - INTERVAL '7 days')::date,
  p_to   date DEFAULT CURRENT_DATE
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = execution, workforce, governance, public
AS $$
DECLARE v_count integer;
BEGIN
  IF NOT (
       governance.current_user_is_admin()
    OR governance.current_user_has_permission('attendance.write')
    OR governance.current_user_has_any_role(ARRAY['hr','hr_manager','ops_manager','finance_manager'])
  ) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: attendance.write required';
  END IF;

  INSERT INTO workforce.attendance (
    attendance_number,
    employee_id,
    project_id,
    work_order_id,
    work_date,
    regular_hours,
    overtime_hours,
    source,
    approval_status,
    state
  )
  SELECT
    'ATT-LL-' || to_char(r.work_date,'YYYYMMDD') || '-' || r.workforce_employee_id::text,
    r.workforce_employee_id,
    r.project_id,
    r.work_order_id,
    r.work_date,
    r.regular_hours,
    r.overtime_hours,
    'labor_logs',
    CASE WHEN r.all_approved THEN 'approved' ELSE 'pending' END,
    CASE WHEN r.all_approved THEN 'Approved' ELSE 'Submitted' END
  FROM execution.v_labor_daily_rollup r
  WHERE r.work_date BETWEEN p_from AND p_to
    AND r.workforce_employee_id IS NOT NULL
  ON CONFLICT (attendance_number) DO UPDATE
    SET regular_hours   = EXCLUDED.regular_hours,
        overtime_hours  = EXCLUDED.overtime_hours,
        project_id      = EXCLUDED.project_id,
        work_order_id   = EXCLUDED.work_order_id,
        source          = 'labor_logs',
        approval_status = EXCLUDED.approval_status,
        state           = EXCLUDED.state,
        updated_at      = now();

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'synced_rows', v_count,
    'from',        p_from,
    'to',          p_to,
    'synced_at',   now()
  );
END;
$$;

COMMENT ON FUNCTION execution.rpc_sync_labor_to_attendance(date, date) IS
  'AGENT-228 (00093): Idempotently upsert v_labor_daily_rollup into workforce.attendance. Overtime split at 8h. Approval state propagates from labor_logs.';

-- ──────────────────────────────────────────────────────────────
-- PART J. Real-time trigger on labor_logs → attendance
-- ──────────────────────────────────────────────────────────────
-- Fires when a labor_log transitions into 'approved'. Calls the sync
-- function for the single day touched, so attendance keeps step with
-- approvals without a daily cron job.

CREATE OR REPLACE FUNCTION execution.fn_labor_log_attendance_sync()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = execution, workforce, governance, public
AS $$
DECLARE
  v_from date;
  v_to   date;
BEGIN
  IF NEW.state = 'approved' AND (OLD.state IS DISTINCT FROM 'approved') THEN
    v_from := date(NEW.started_at);
    v_to   := date(COALESCE(NEW.ended_at, NEW.started_at));
    -- Best-effort sync; do not block the labor_logs UPDATE if downstream fails.
    BEGIN
      PERFORM execution.rpc_sync_labor_to_attendance(v_from, v_to);
    EXCEPTION WHEN others THEN
      RAISE WARNING 'rpc_sync_labor_to_attendance failed for labor_log id=%: %', NEW.id, SQLERRM;
    END;
  END IF;
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgrelid = 'execution.labor_logs'::regclass
       AND tgname = 'trg_labor_logs_to_attendance'
  ) THEN
    CREATE TRIGGER trg_labor_logs_to_attendance
      AFTER UPDATE OF state ON execution.labor_logs
      FOR EACH ROW EXECUTE FUNCTION execution.fn_labor_log_attendance_sync();
  END IF;
END$$;

COMMENT ON FUNCTION execution.fn_labor_log_attendance_sync() IS
  'AGENT-228 (00093): AFTER UPDATE OF state trigger on labor_logs — fires on transition into approved, calls rpc_sync_labor_to_attendance for the day touched.';

-- ──────────────────────────────────────────────────────────────
-- PART K. View execution.v_work_order_tasks_compat
-- ──────────────────────────────────────────────────────────────
-- Back-compat shim so legacy callers reading work_order_tasks see the
-- unified execution.tasks rows. Drop the underlying table in 00100+.

CREATE OR REPLACE VIEW execution.v_work_order_tasks_compat AS
SELECT
  t.id,
  t.work_order_id,
  t.title              AS task_name,
  t.description,
  NULL::integer        AS sequence_order,
  t.assignee_user_id,
  t.due_date,
  t.actual_end_date    AS completed_at,
  t.state,
  t.created_at,
  t.updated_at
FROM execution.tasks t
WHERE t.work_order_id IS NOT NULL
  AND COALESCE(t.is_deleted, false) = false;

COMMENT ON VIEW execution.v_work_order_tasks_compat IS
  'AGENT-228 (00093): Back-compat for execution.work_order_tasks. Reads unified execution.tasks rows that have work_order_id set. Drop work_order_tasks in 00100+ once all callers migrate.';

-- ──────────────────────────────────────────────────────────────
-- PART L. One-time data migration: work_order_tasks → tasks
-- ──────────────────────────────────────────────────────────────
-- Copies any legacy rows into execution.tasks. Idempotent via
-- task_number uniqueness ('WOT-' + zero-padded id).

DO $$
BEGIN
  IF to_regclass('execution.work_order_tasks') IS NOT NULL THEN
    INSERT INTO execution.tasks (
      task_number,
      title,
      description,
      work_order_id,
      project_id,
      assignee_user_id,
      due_date,
      state,
      actual_end_date,
      created_at,
      updated_at
    )
    SELECT
      'WOT-' || lpad(wot.id::text, 8, '0')                                AS task_number,
      wot.task_name                                                        AS title,
      wot.description,
      wot.work_order_id,
      (SELECT wo.project_id FROM execution.work_orders wo WHERE wo.id = wot.work_order_id),
      wot.assignee_user_id,
      wot.due_date,
      CASE wot.state WHEN 'Done' THEN 'Closed' ELSE wot.state END,
      CASE WHEN wot.completed_at IS NOT NULL THEN date(wot.completed_at) END,
      wot.created_at,
      wot.updated_at
    FROM execution.work_order_tasks wot
    WHERE NOT EXISTS (
      SELECT 1 FROM execution.tasks t
      WHERE t.task_number = 'WOT-' || lpad(wot.id::text, 8, '0')
    );

    EXECUTE 'COMMENT ON TABLE execution.work_order_tasks IS '
      || quote_literal(
           'DEPRECATED 2026-04-29 (AGENT-228, migration 00093). '
        || 'Use execution.tasks (with work_order_id) or '
        || 'execution.v_work_order_tasks_compat. '
        || 'Drop in 00100+ after two-sprint compat-view soak.'
         );
  END IF;
END$$;

-- ──────────────────────────────────────────────────────────────
-- PART M. Replace execution.get_project_360 with extended payload
-- ──────────────────────────────────────────────────────────────
-- Existing keys preserved: project, work_orders, purchase_orders,
-- invoices, team, alerts. New keys: milestones, labor_summary,
-- tasks_summary, critical_path, earned_value.

CREATE OR REPLACE FUNCTION execution.get_project_360(p_project_id bigint)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = execution, procurement, finance, workforce, docs, intelligence, governance, public
AS $$
DECLARE v_payload jsonb;
BEGIN
  IF NOT governance.can_read_project(p_project_id) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: cannot read project';
  END IF;

  SELECT jsonb_build_object(
    'project', (SELECT to_jsonb(p) FROM execution.projects p WHERE p.id = p_project_id),

    'work_orders', (
      SELECT COALESCE(jsonb_agg(x), '[]'::jsonb) FROM (
        SELECT w.id, w.work_order_number, w.title, w.state, w.progress_percent
        FROM execution.work_orders w WHERE w.project_id = p_project_id
        ORDER BY w.created_at DESC LIMIT 50
      ) x
    ),

    'purchase_orders', (
      SELECT COALESCE(jsonb_agg(x), '[]'::jsonb) FROM (
        SELECT po.id, po.po_number, po.supplier_id, po.grand_total, po.state
        FROM procurement.purchase_orders po WHERE po.project_id = p_project_id
        ORDER BY po.created_at DESC LIMIT 20
      ) x
    ),

    'invoices', (
      SELECT COALESCE(jsonb_agg(x), '[]'::jsonb) FROM (
        SELECT i.id, i.invoice_number, i.grand_total, i.balance_due, i.state
        FROM finance.invoices i WHERE i.project_id = p_project_id
        ORDER BY i.created_at DESC LIMIT 20
      ) x
    ),

    'team', (
      SELECT COALESCE(jsonb_agg(x), '[]'::jsonb) FROM (
        SELECT wa.id, wa.employee_id, e.full_name, wa.assignment_role, wa.state
        FROM workforce.workforce_assignments wa
        JOIN workforce.employees e ON e.id = wa.employee_id
        WHERE wa.project_id = p_project_id AND wa.state = 'Active'
      ) x
    ),

    'alerts', (
      SELECT COALESCE(jsonb_agg(x), '[]'::jsonb) FROM (
        SELECT a.id, a.alert_number, a.category, a.severity, a.title, a.state
        FROM execution.alerts a
        WHERE a.parent_entity_type = 'Project' AND a.parent_entity_id = p_project_id
          AND a.state IN ('Open','Acknowledged')
        ORDER BY a.created_at DESC LIMIT 10
      ) x
    ),

    -- ── New keys (AGENT-228) ────────────────────────────────────────
    'milestones', (
      SELECT COALESCE(jsonb_agg(x ORDER BY x.due_date NULLS LAST), '[]'::jsonb) FROM (
        SELECT m.id, m.milestone_name, m.due_date, m.achieved_at, m.state, m.phase_id
        FROM execution.project_milestones m WHERE m.project_id = p_project_id
      ) x
    ),

    'labor_summary', (
      SELECT jsonb_build_object(
        'total_hours',    COALESCE(SUM(ll.duration_minutes)/60.0, 0),
        'billable_hours', COALESCE(SUM(CASE WHEN ll.billable THEN ll.duration_minutes END)/60.0, 0),
        'approved_hours', COALESCE(SUM(CASE WHEN ll.state='approved' THEN ll.duration_minutes END)/60.0, 0),
        'total_cost',     COALESCE(SUM(ll.duration_minutes/60.0 * ll.billable_rate), 0),
        'log_count',      COUNT(*),
        'unique_workers', COUNT(DISTINCT ll.employee_user_id)
      )
      FROM execution.labor_logs ll
      WHERE ll.project_id = p_project_id
        AND COALESCE(ll.is_active, true)
        AND COALESCE(ll.is_deleted, false) = false
    ),

    'tasks_summary', (
      SELECT jsonb_build_object(
        'total',          COUNT(*),
        'open',           COUNT(*) FILTER (WHERE state IN ('Open','InProgress','In Progress')),
        'closed',         COUNT(*) FILTER (WHERE state IN ('Closed','Done')),
        'critical_count', COUNT(*) FILTER (WHERE is_critical),
        'avg_progress',   COALESCE(AVG(progress_percent), 0)
      )
      FROM execution.tasks
      WHERE project_id = p_project_id
        AND COALESCE(is_deleted, false) = false
    ),

    'critical_path', (
      SELECT COALESCE(jsonb_agg(x ORDER BY x.earliest_start NULLS LAST), '[]'::jsonb) FROM (
        SELECT t.id, t.task_number, t.title, t.earliest_start, t.earliest_finish,
               t.slack_days, t.duration_days, t.progress_percent, t.state
        FROM execution.tasks t
        WHERE t.project_id = p_project_id
          AND t.is_critical
          AND COALESCE(t.is_deleted, false) = false
      ) x
    ),

    'earned_value', (
      SELECT jsonb_build_object(
        'PV',  COALESCE(SUM(planned_value), 0),
        'EV',  COALESCE(SUM(earned_value), 0),
        'AC',  COALESCE(SUM(actual_cost), 0),
        'CPI', CASE WHEN COALESCE(SUM(actual_cost), 0)  > 0
                    THEN SUM(earned_value) / SUM(actual_cost) END,
        'SPI', CASE WHEN COALESCE(SUM(planned_value), 0) > 0
                    THEN SUM(earned_value) / SUM(planned_value) END
      )
      FROM execution.tasks
      WHERE project_id = p_project_id
        AND COALESCE(is_deleted, false) = false
    )
  ) INTO v_payload;

  RETURN v_payload;
END;
$$;

COMMENT ON FUNCTION execution.get_project_360(bigint) IS
  'AGENT-228 (00093): Project 360 payload — original 6 keys (project, work_orders, purchase_orders, invoices, team, alerts) plus 5 new keys (milestones, labor_summary, tasks_summary, critical_path, earned_value).';

-- ──────────────────────────────────────────────────────────────
-- Grants — keep callable by authenticated role (RPC layer)
-- ──────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION execution.rpc_pm_save_state(bigint, jsonb)         TO authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION execution.rpc_pm_load_state(bigint)                TO authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION execution.rpc_pm_recompute(bigint)                 TO authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION execution.rpc_sync_labor_to_attendance(date, date) TO authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION execution.get_project_360(bigint)                  TO authenticated';
    EXECUTE 'GRANT SELECT ON execution.v_labor_daily_rollup        TO authenticated';
    EXECUTE 'GRANT SELECT ON execution.v_work_order_tasks_compat   TO authenticated';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON execution.project_baselines  TO authenticated';
    EXECUTE 'GRANT SELECT, INSERT         ON execution.task_progress_log  TO authenticated';
    EXECUTE 'GRANT USAGE, SELECT ON SEQUENCE execution.project_baselines_id_seq TO authenticated';
    EXECUTE 'GRANT USAGE, SELECT ON SEQUENCE execution.task_progress_log_id_seq TO authenticated';
  END IF;
END$$;

COMMIT;

-- ============================================================
-- END OF MIGRATION 00093_pm_engine_persistence.sql
-- ============================================================
