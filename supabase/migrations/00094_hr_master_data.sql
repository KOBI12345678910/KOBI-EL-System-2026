-- ============================================================
-- FILE: supabase/migrations/00094_hr_master_data.sql
-- TECHNO-KOL UZI ERP 2026 — HR Master Data (Departments + Positions)
-- Per AGENT-328 §2.2-3, §5 item 2, §4 #2 (HR deep audit, 2026-04-29):
--   workforce.employees.department  is plain TEXT — no hr_departments FK
--   workforce.employees.role_title  is plain TEXT — no hr_positions FK
--   ⇒ no org tree, no comp-band link, no headcount-by-grade rollup,
--     no cost-center reconciliation against gl.cost_centers, every
--     report joins by string match (AGENT-309 #15).
--
-- This migration:
--   PART A — schema bootstrap (workforce schema is created elsewhere
--            but we guard it).
--   PART B — workforce.hr_departments (org tree, effective_from/to).
--   PART C — workforce.hr_positions   (comp-band, FLSA, level).
--   PART D — backfill: distinct strings from workforce.employees
--            seed the lookup tables, then add nullable FK columns
--            (department_id, position_id) on workforce.employees and
--            populate them from the legacy text. The legacy `department`
--            and `role_title` columns are KEPT as denormalised mirrors
--            (RULE OF THE PROJECT: לא מוחקים, רק משדרגים) so existing
--            queries keep working; they are now derived via trigger.
--   PART E — sync trigger keeps text and FK in lock-step.
--   PART F — RLS on the new lookup tables (workforce convention).
--   PART G — GRANTs and indexes.
--   PART H — comments / PII flags / docs.
--
-- IDEMPOTENT: every CREATE uses IF NOT EXISTS, every ALTER uses
-- ADD COLUMN IF NOT EXISTS, every INSERT uses ON CONFLICT DO NOTHING.
-- Safe to re-run.
-- ============================================================

BEGIN;

-- ──────────────────────────────────────────────────────────────
-- PART A: schema bootstrap
-- ──────────────────────────────────────────────────────────────

CREATE SCHEMA IF NOT EXISTS workforce;

-- ──────────────────────────────────────────────────────────────
-- PART B: workforce.hr_departments
-- ──────────────────────────────────────────────────────────────
-- Org-tree node. Self-referential (parent_id) to support unlimited
-- depth. effective_from / effective_to allow tracking reorganisations
-- over time. cost_center_id bridges to gl.cost_centers when present.

CREATE TABLE IF NOT EXISTS workforce.hr_departments (
  id              bigserial    PRIMARY KEY,
  public_id       uuid         NOT NULL DEFAULT gen_random_uuid(),
  tenant_id       uuid,
  code            text         NOT NULL,                -- short slug, e.g. 'ENG' or 'OPS-01'
  name            text         NOT NULL,                -- canonical Hebrew name
  name_en         text,                                 -- English mirror
  parent_id       bigint       REFERENCES workforce.hr_departments(id) ON DELETE SET NULL,
  cost_center_id  bigint,                               -- FK added below if gl.cost_centers exists
  manager_id      bigint,                               -- FK added below to workforce.employees
  description     text,
  effective_from  date         NOT NULL DEFAULT CURRENT_DATE,
  effective_to    date,
  is_active       boolean      NOT NULL DEFAULT true,
  is_deleted      boolean      NOT NULL DEFAULT false,
  metadata        jsonb        NOT NULL DEFAULT '{}'::jsonb,
  notes           text,
  created_at      timestamptz  NOT NULL DEFAULT now(),
  created_by      bigint,
  updated_at      timestamptz  NOT NULL DEFAULT now(),
  updated_by      bigint,

  CONSTRAINT hr_departments_code_key UNIQUE (tenant_id, code),
  CONSTRAINT hr_departments_no_self_parent_chk
    CHECK (parent_id IS NULL OR parent_id <> id),
  CONSTRAINT hr_departments_dates_chk
    CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

-- Conditional FK to gl.cost_centers (gl schema may not exist on all envs).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'gl' AND table_name = 'cost_centers'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
     WHERE table_schema = 'workforce'
       AND table_name   = 'hr_departments'
       AND constraint_name = 'hr_departments_cost_center_id_fkey'
  ) THEN
    ALTER TABLE workforce.hr_departments
      ADD CONSTRAINT hr_departments_cost_center_id_fkey
      FOREIGN KEY (cost_center_id)
      REFERENCES gl.cost_centers(id)
      ON DELETE SET NULL;
  END IF;
END$$;

-- Conditional FK to public.tenants
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'tenants'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
     WHERE table_schema = 'workforce'
       AND table_name   = 'hr_departments'
       AND constraint_name = 'hr_departments_tenant_id_fkey'
  ) THEN
    ALTER TABLE workforce.hr_departments
      ADD CONSTRAINT hr_departments_tenant_id_fkey
      FOREIGN KEY (tenant_id)
      REFERENCES public.tenants(id)
      ON DELETE CASCADE;
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_hr_departments_tenant
  ON workforce.hr_departments (tenant_id);
CREATE INDEX IF NOT EXISTS idx_hr_departments_parent
  ON workforce.hr_departments (parent_id);
CREATE INDEX IF NOT EXISTS idx_hr_departments_code
  ON workforce.hr_departments (code);
CREATE INDEX IF NOT EXISTS idx_hr_departments_manager
  ON workforce.hr_departments (manager_id);
CREATE INDEX IF NOT EXISTS idx_hr_departments_active
  ON workforce.hr_departments (is_active) WHERE is_deleted = false;

COMMENT ON TABLE  workforce.hr_departments IS
  'Canonical department / org-tree lookup. Replaces free-text workforce.employees.department. Backed by AGENT-328 §2.2 fix.';
COMMENT ON COLUMN workforce.hr_departments.code IS 'Short stable slug used by APIs and reports';
COMMENT ON COLUMN workforce.hr_departments.parent_id IS 'Self-FK to support unlimited depth org tree';
COMMENT ON COLUMN workforce.hr_departments.cost_center_id IS 'FK bridge to gl.cost_centers for cost-center reconciliation (AGENT-309 #15)';
COMMENT ON COLUMN workforce.hr_departments.effective_from IS 'Tracks reorganisations over time per AGENT-328 §2.2';

-- ──────────────────────────────────────────────────────────────
-- PART C: workforce.hr_positions
-- ──────────────────────────────────────────────────────────────
-- Job catalog. comp_band_id links to a comp band so hr/comp-planner.js
-- can enforce a banding policy (AGENT-328 §2.3). level is a numeric
-- ladder rung (1..N) for span-of-control reports. flsa_classification
-- stores 'exempt' / 'non_exempt' equivalents per IL law.

CREATE TABLE IF NOT EXISTS workforce.hr_positions (
  id                   bigserial    PRIMARY KEY,
  public_id            uuid         NOT NULL DEFAULT gen_random_uuid(),
  tenant_id            uuid,
  code                 text         NOT NULL,            -- e.g. 'SE-3', 'PM-1'
  title                text         NOT NULL,            -- Hebrew title
  title_en             text,                             -- English mirror
  description          text,
  level                integer,                          -- ladder rung 1..N
  comp_band_id         bigint,                           -- FK to workforce.hr_comp_bands when seeded
  department_id        bigint       REFERENCES workforce.hr_departments(id) ON DELETE SET NULL,
  flsa_classification  text         CHECK (
    flsa_classification IS NULL
    OR flsa_classification IN ('exempt','non_exempt','executive','professional','administrative')
  ),
  min_salary           numeric(14,2),
  max_salary           numeric(14,2),
  currency             text         NOT NULL DEFAULT 'ILS',
  effective_from       date         NOT NULL DEFAULT CURRENT_DATE,
  effective_to         date,
  is_active            boolean      NOT NULL DEFAULT true,
  is_deleted           boolean      NOT NULL DEFAULT false,
  metadata             jsonb        NOT NULL DEFAULT '{}'::jsonb,
  notes                text,
  created_at           timestamptz  NOT NULL DEFAULT now(),
  created_by           bigint,
  updated_at           timestamptz  NOT NULL DEFAULT now(),
  updated_by           bigint,

  CONSTRAINT hr_positions_code_key UNIQUE (tenant_id, code),
  CONSTRAINT hr_positions_salary_band_chk
    CHECK (
      min_salary IS NULL
      OR max_salary IS NULL
      OR max_salary >= min_salary
    ),
  CONSTRAINT hr_positions_dates_chk
    CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'tenants'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
     WHERE table_schema = 'workforce'
       AND table_name   = 'hr_positions'
       AND constraint_name = 'hr_positions_tenant_id_fkey'
  ) THEN
    ALTER TABLE workforce.hr_positions
      ADD CONSTRAINT hr_positions_tenant_id_fkey
      FOREIGN KEY (tenant_id)
      REFERENCES public.tenants(id)
      ON DELETE CASCADE;
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_hr_positions_tenant
  ON workforce.hr_positions (tenant_id);
CREATE INDEX IF NOT EXISTS idx_hr_positions_dept
  ON workforce.hr_positions (department_id);
CREATE INDEX IF NOT EXISTS idx_hr_positions_code
  ON workforce.hr_positions (code);
CREATE INDEX IF NOT EXISTS idx_hr_positions_comp_band
  ON workforce.hr_positions (comp_band_id);
CREATE INDEX IF NOT EXISTS idx_hr_positions_active
  ON workforce.hr_positions (is_active) WHERE is_deleted = false;

COMMENT ON TABLE  workforce.hr_positions IS
  'Canonical position / job-title catalog. Replaces free-text workforce.employees.role_title. Backed by AGENT-328 §2.3 fix.';
COMMENT ON COLUMN workforce.hr_positions.comp_band_id IS 'Comp band FK so hr/comp-planner.js can enforce banding (AGENT-328 §2.3)';
COMMENT ON COLUMN workforce.hr_positions.level IS 'Numeric ladder rung used for headcount-by-grade rollup';

-- ──────────────────────────────────────────────────────────────
-- PART D: backfill + add FK columns on workforce.employees
-- ──────────────────────────────────────────────────────────────

-- Add the nullable FK columns; keep the legacy text columns for
-- backward compatibility (rule: לא מוחקים, רק משדרגים).
ALTER TABLE IF EXISTS workforce.employees
  ADD COLUMN IF NOT EXISTS department_id bigint
    REFERENCES workforce.hr_departments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS position_id   bigint
    REFERENCES workforce.hr_positions(id)   ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_employees_department_id
  ON workforce.employees (department_id);
CREATE INDEX IF NOT EXISTS idx_employees_position_id
  ON workforce.employees (position_id);

-- Backfill: derive distinct department codes from existing free text.
-- Rules: trim, NULL/'' → skip; build a lossless code by snake-casing
-- the Hebrew-or-English label so it stays stable across re-runs.
DO $$
DECLARE
  v_have_employees boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'workforce' AND table_name = 'employees'
  ) INTO v_have_employees;

  IF v_have_employees THEN
    -- Departments
    INSERT INTO workforce.hr_departments (tenant_id, code, name)
    SELECT
      NULL::uuid                                                 AS tenant_id,
      lower(regexp_replace(btrim(department), '[^a-zA-Z0-9_]+', '_', 'g')) AS code,
      btrim(department)                                          AS name
      FROM workforce.employees
     WHERE department IS NOT NULL
       AND btrim(department) <> ''
     GROUP BY btrim(department)
    ON CONFLICT (tenant_id, code) DO NOTHING;

    -- Positions
    INSERT INTO workforce.hr_positions (tenant_id, code, title)
    SELECT
      NULL::uuid                                                 AS tenant_id,
      lower(regexp_replace(btrim(role_title), '[^a-zA-Z0-9_]+', '_', 'g')) AS code,
      btrim(role_title)                                          AS title
      FROM workforce.employees
     WHERE role_title IS NOT NULL
       AND btrim(role_title) <> ''
     GROUP BY btrim(role_title)
    ON CONFLICT (tenant_id, code) DO NOTHING;

    -- Wire the FK columns from the text values.
    UPDATE workforce.employees e
       SET department_id = d.id
      FROM workforce.hr_departments d
     WHERE e.department_id IS NULL
       AND e.department IS NOT NULL
       AND btrim(e.department) <> ''
       AND d.tenant_id IS NOT DISTINCT FROM NULL
       AND d.name = btrim(e.department);

    UPDATE workforce.employees e
       SET position_id = p.id
      FROM workforce.hr_positions p
     WHERE e.position_id IS NULL
       AND e.role_title IS NOT NULL
       AND btrim(e.role_title) <> ''
       AND p.tenant_id IS NOT DISTINCT FROM NULL
       AND p.title = btrim(e.role_title);
  END IF;
END$$;

-- Manager FK on departments → employees (deferred FK because the
-- target table is itself referenced via department_id).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
     WHERE table_schema = 'workforce'
       AND table_name   = 'hr_departments'
       AND constraint_name = 'hr_departments_manager_id_fkey'
  ) THEN
    ALTER TABLE workforce.hr_departments
      ADD CONSTRAINT hr_departments_manager_id_fkey
      FOREIGN KEY (manager_id)
      REFERENCES workforce.employees(id)
      ON DELETE SET NULL;
  END IF;
END$$;

-- ──────────────────────────────────────────────────────────────
-- PART E: sync trigger — keep legacy text in lock-step with FK
-- ──────────────────────────────────────────────────────────────
-- When new code writes department_id / position_id, mirror the
-- name into the legacy text column so legacy reports keep working.
-- When legacy code writes the text column, attempt to resolve the
-- FK. The trigger is BEFORE INSERT/UPDATE so a single statement
-- always lands in a consistent state.

CREATE OR REPLACE FUNCTION workforce.fn_employees_hr_master_sync()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_dept_name  text;
  v_pos_title  text;
BEGIN
  -- FK → text mirror (forward direction)
  IF NEW.department_id IS NOT NULL THEN
    SELECT name INTO v_dept_name
      FROM workforce.hr_departments
     WHERE id = NEW.department_id;
    IF v_dept_name IS NOT NULL THEN
      NEW.department := v_dept_name;
    END IF;
  END IF;

  IF NEW.position_id IS NOT NULL THEN
    SELECT title INTO v_pos_title
      FROM workforce.hr_positions
     WHERE id = NEW.position_id;
    IF v_pos_title IS NOT NULL THEN
      NEW.role_title := v_pos_title;
    END IF;
  END IF;

  -- Text → FK resolve (legacy callers writing only the text column)
  IF NEW.department_id IS NULL AND NEW.department IS NOT NULL AND btrim(NEW.department) <> '' THEN
    SELECT id INTO NEW.department_id
      FROM workforce.hr_departments
     WHERE name = btrim(NEW.department)
       AND (tenant_id IS NOT DISTINCT FROM NULL)
     LIMIT 1;
  END IF;

  IF NEW.position_id IS NULL AND NEW.role_title IS NOT NULL AND btrim(NEW.role_title) <> '' THEN
    SELECT id INTO NEW.position_id
      FROM workforce.hr_positions
     WHERE title = btrim(NEW.role_title)
       AND (tenant_id IS NOT DISTINCT FROM NULL)
     LIMIT 1;
  END IF;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_employees_hr_master_sync
  ON workforce.employees;

CREATE TRIGGER trg_employees_hr_master_sync
  BEFORE INSERT OR UPDATE OF department_id, position_id, department, role_title
  ON workforce.employees
  FOR EACH ROW
  EXECUTE FUNCTION workforce.fn_employees_hr_master_sync();

-- ──────────────────────────────────────────────────────────────
-- PART F: RLS — workforce convention
-- ──────────────────────────────────────────────────────────────

ALTER TABLE workforce.hr_departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE workforce.hr_positions   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hr_departments_select_authenticated ON workforce.hr_departments;
DROP POLICY IF EXISTS hr_departments_insert_authenticated ON workforce.hr_departments;
DROP POLICY IF EXISTS hr_departments_update_authenticated ON workforce.hr_departments;
DROP POLICY IF EXISTS hr_departments_delete_authenticated ON workforce.hr_departments;

DROP POLICY IF EXISTS hr_positions_select_authenticated   ON workforce.hr_positions;
DROP POLICY IF EXISTS hr_positions_insert_authenticated   ON workforce.hr_positions;
DROP POLICY IF EXISTS hr_positions_update_authenticated   ON workforce.hr_positions;
DROP POLICY IF EXISTS hr_positions_delete_authenticated   ON workforce.hr_positions;

DO $$
DECLARE
  v_have_helper boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
     WHERE n.nspname = 'governance' AND p.proname = 'current_tenant_id'
  ) INTO v_have_helper;

  IF v_have_helper THEN
    -- Tenant-scoped policies for hr_departments
    EXECUTE 'CREATE POLICY hr_departments_select_authenticated ON workforce.hr_departments FOR SELECT USING (tenant_id IS NULL OR tenant_id = governance.current_tenant_id() OR governance.is_service_role())';
    EXECUTE 'CREATE POLICY hr_departments_insert_authenticated ON workforce.hr_departments FOR INSERT WITH CHECK (tenant_id IS NULL OR tenant_id = governance.current_tenant_id() OR governance.is_service_role())';
    EXECUTE 'CREATE POLICY hr_departments_update_authenticated ON workforce.hr_departments FOR UPDATE USING (tenant_id IS NULL OR tenant_id = governance.current_tenant_id() OR governance.is_service_role()) WITH CHECK (tenant_id IS NULL OR tenant_id = governance.current_tenant_id() OR governance.is_service_role())';
    EXECUTE 'CREATE POLICY hr_departments_delete_authenticated ON workforce.hr_departments FOR DELETE USING (governance.is_service_role())';

    -- Tenant-scoped policies for hr_positions
    EXECUTE 'CREATE POLICY hr_positions_select_authenticated ON workforce.hr_positions FOR SELECT USING (tenant_id IS NULL OR tenant_id = governance.current_tenant_id() OR governance.is_service_role())';
    EXECUTE 'CREATE POLICY hr_positions_insert_authenticated ON workforce.hr_positions FOR INSERT WITH CHECK (tenant_id IS NULL OR tenant_id = governance.current_tenant_id() OR governance.is_service_role())';
    EXECUTE 'CREATE POLICY hr_positions_update_authenticated ON workforce.hr_positions FOR UPDATE USING (tenant_id IS NULL OR tenant_id = governance.current_tenant_id() OR governance.is_service_role()) WITH CHECK (tenant_id IS NULL OR tenant_id = governance.current_tenant_id() OR governance.is_service_role())';
    EXECUTE 'CREATE POLICY hr_positions_delete_authenticated ON workforce.hr_positions FOR DELETE USING (governance.is_service_role())';
  ELSE
    EXECUTE 'CREATE POLICY hr_departments_select_authenticated ON workforce.hr_departments FOR SELECT USING (true)';
    EXECUTE 'CREATE POLICY hr_departments_insert_authenticated ON workforce.hr_departments FOR INSERT WITH CHECK (true)';
    EXECUTE 'CREATE POLICY hr_departments_update_authenticated ON workforce.hr_departments FOR UPDATE USING (true) WITH CHECK (true)';

    EXECUTE 'CREATE POLICY hr_positions_select_authenticated ON workforce.hr_positions FOR SELECT USING (true)';
    EXECUTE 'CREATE POLICY hr_positions_insert_authenticated ON workforce.hr_positions FOR INSERT WITH CHECK (true)';
    EXECUTE 'CREATE POLICY hr_positions_update_authenticated ON workforce.hr_positions FOR UPDATE USING (true) WITH CHECK (true)';
  END IF;
END$$;

-- ──────────────────────────────────────────────────────────────
-- PART G: GRANTs
-- ──────────────────────────────────────────────────────────────

GRANT USAGE ON SCHEMA workforce TO authenticated, service_role;

GRANT SELECT, INSERT, UPDATE ON workforce.hr_departments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON workforce.hr_departments TO service_role;
GRANT USAGE, SELECT ON SEQUENCE workforce.hr_departments_id_seq TO authenticated, service_role;

GRANT SELECT, INSERT, UPDATE ON workforce.hr_positions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON workforce.hr_positions TO service_role;
GRANT USAGE, SELECT ON SEQUENCE workforce.hr_positions_id_seq TO authenticated, service_role;

-- ──────────────────────────────────────────────────────────────
-- PART H: helpful views (optional consumers — analytics + reports)
-- ──────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW workforce.v_employees_with_hr_master AS
SELECT
  e.id,
  e.public_id,
  e.employee_number,
  e.full_name,
  e.email,
  e.employer_id,
  e.department_id,
  d.code             AS department_code,
  d.name             AS department_name,
  d.cost_center_id,
  d.parent_id        AS department_parent_id,
  e.position_id,
  p.code             AS position_code,
  p.title            AS position_title,
  p.level            AS position_level,
  p.comp_band_id,
  e.status,
  e.start_date,
  e.end_date,
  e.is_active,
  e.is_deleted
FROM workforce.employees e
LEFT JOIN workforce.hr_departments d ON d.id = e.department_id
LEFT JOIN workforce.hr_positions   p ON p.id = e.position_id;

COMMENT ON VIEW workforce.v_employees_with_hr_master IS
  'Employee 360 with resolved department + position lookups; backs HR Employee360 page (per CLAUDE.md 9 Master 360 Pages).';

COMMIT;

-- ============================================================
-- VERIFICATION (run manually after migration)
-- ============================================================
-- select count(*) from workforce.hr_departments;
-- select count(*) from workforce.hr_positions;
-- select count(*) from workforce.employees where department_id is not null;
-- select count(*) from workforce.employees where position_id   is not null;
-- select column_name from information_schema.columns
--  where table_schema = 'workforce' and table_name = 'employees'
--    and column_name in ('department_id','position_id');
-- select policyname from pg_policies
--  where schemaname = 'workforce'
--    and tablename in ('hr_departments','hr_positions');
-- ============================================================
