-- ============================================================
-- FILE: supabase/migrations/00090_employee_balances.sql
-- TECHNO-KOL UZI ERP 2026 — Employee Balances (HR)
-- Per AGENT-328 §2.7 #5 + §5 item 3 (HR deep audit, 2026-04-29):
--   workforce.employee_balances is referenced by
--   onyx-procurement/src/payroll/payroll-routes.js:498-523 but
--   no migration creates it. Production INSERTs fail.
--
-- This migration creates the canonical tall-format table:
--   one row per (tenant, employee, balance_type) with both unit
--   (days/months) and money (NIS) measures, plus a snapshot_date
--   for time-series queries.
--
-- The shape requested in the fix prompt:
--   id, tenant_id, employee_id FK -> workforce.employees,
--   balance_type IN (vacation/sick/seniority/study_fund/severance),
--   balance_units, balance_amount, last_updated_at, RLS, indexes.
--
-- A backward-compat VIEW `public.employee_balances_wide` exposes
-- the legacy wide column names used by payroll-routes.js so the
-- existing route keeps working until callers are migrated. The
-- route INSERT path also continues to work because the wide-format
-- snapshot is reshaped via a helper function (see Part E).
--
-- IDEMPOTENT: every CREATE uses IF NOT EXISTS, every ALTER uses
-- ADD COLUMN IF NOT EXISTS, every INSERT uses ON CONFLICT DO NOTHING.
-- Safe to re-run.
-- ============================================================

BEGIN;

-- ──────────────────────────────────────────────────────────────
-- PART A: schema bootstrap (no-op if workforce schema already exists)
-- ──────────────────────────────────────────────────────────────

CREATE SCHEMA IF NOT EXISTS workforce;

-- ──────────────────────────────────────────────────────────────
-- PART B: table — workforce.employee_balances (tall canonical form)
-- ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS workforce.employee_balances (
  id              bigserial    PRIMARY KEY,
  tenant_id       uuid,
  employee_id     bigint       NOT NULL,
  balance_type    text         NOT NULL,
  balance_units   numeric(12,4) DEFAULT 0,   -- days for vacation/sick, months for seniority, units for study_fund/severance
  balance_amount  numeric(14,2) DEFAULT 0,   -- monetary equivalent in NIS
  snapshot_date   date         NOT NULL DEFAULT CURRENT_DATE,
  last_updated_at timestamptz  NOT NULL DEFAULT now(),
  created_at      timestamptz  NOT NULL DEFAULT now(),
  created_by      bigint,
  updated_by      bigint,
  is_active       boolean      NOT NULL DEFAULT true,
  is_deleted      boolean      NOT NULL DEFAULT false,
  notes           text,
  metadata        jsonb        NOT NULL DEFAULT '{}'::jsonb,

  CONSTRAINT employee_balances_balance_type_chk
    CHECK (balance_type IN ('vacation','sick','seniority','study_fund','severance')),

  CONSTRAINT employee_balances_units_nonneg_chk
    CHECK (balance_units IS NULL OR balance_units >= 0),

  CONSTRAINT employee_balances_amount_nonneg_chk
    CHECK (balance_amount IS NULL OR balance_amount >= 0)
);

-- FK to workforce.employees(id) — wrapped in DO block so the migration
-- is idempotent and survives even if employees table is renamed/missing
-- in some downstream environment.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'workforce' AND table_name = 'employees'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
     WHERE table_schema = 'workforce'
       AND table_name   = 'employee_balances'
       AND constraint_name = 'employee_balances_employee_id_fkey'
  ) THEN
    ALTER TABLE workforce.employee_balances
      ADD CONSTRAINT employee_balances_employee_id_fkey
      FOREIGN KEY (employee_id)
      REFERENCES workforce.employees(id)
      ON DELETE CASCADE;
  END IF;
END$$;

-- FK to public.tenants(id) when present
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'tenants'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
     WHERE table_schema = 'workforce'
       AND table_name   = 'employee_balances'
       AND constraint_name = 'employee_balances_tenant_id_fkey'
  ) THEN
    ALTER TABLE workforce.employee_balances
      ADD CONSTRAINT employee_balances_tenant_id_fkey
      FOREIGN KEY (tenant_id)
      REFERENCES public.tenants(id)
      ON DELETE CASCADE;
  END IF;
END$$;

-- One canonical row per (tenant, employee, type, snapshot_date).
-- Without snapshot_date in the key, multiple snapshots over time
-- would collide; with it, the wide-format upsert in
-- payroll-routes.js:518 still resolves to a single current row.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname = 'workforce'
       AND tablename  = 'employee_balances'
       AND indexname  = 'employee_balances_unique_per_snapshot'
  ) THEN
    CREATE UNIQUE INDEX employee_balances_unique_per_snapshot
      ON workforce.employee_balances (
        coalesce(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid),
        employee_id,
        balance_type,
        snapshot_date
      )
      WHERE is_deleted = false;
  END IF;
END$$;

COMMENT ON TABLE  workforce.employee_balances IS
  'IL HR balance snapshots per employee per type per date. Tall canonical form. Backed by AGENT-328 §2.7 #5 fix.';
COMMENT ON COLUMN workforce.employee_balances.balance_type IS
  'vacation (חופשה שנתית) | sick (דמי מחלה) | seniority (ותק) | study_fund (קרן השתלמות) | severance (פיצויי פיטורים)';
COMMENT ON COLUMN workforce.employee_balances.balance_units IS
  'units in domain-natural denomination: days for vacation/sick, months for seniority, NIS-units for study_fund/severance balances';
COMMENT ON COLUMN workforce.employee_balances.balance_amount IS
  'monetary equivalent in NIS (₪) — required for severance/study_fund, optional otherwise';

-- ──────────────────────────────────────────────────────────────
-- PART C: indexes for hot paths (hr-360, payroll lookup, admin reports)
-- ──────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_employee_balances_employee
  ON workforce.employee_balances (employee_id, snapshot_date DESC);

CREATE INDEX IF NOT EXISTS idx_employee_balances_tenant
  ON workforce.employee_balances (tenant_id);

CREATE INDEX IF NOT EXISTS idx_employee_balances_type
  ON workforce.employee_balances (balance_type, snapshot_date DESC);

CREATE INDEX IF NOT EXISTS idx_employee_balances_last_updated
  ON workforce.employee_balances (last_updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_employee_balances_active
  ON workforce.employee_balances (is_active)
  WHERE is_deleted = false;

-- ──────────────────────────────────────────────────────────────
-- PART D: trigger to maintain last_updated_at on UPDATE
-- ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION workforce.fn_employee_balances_touch()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  NEW.last_updated_at := now();
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_employee_balances_touch
  ON workforce.employee_balances;

CREATE TRIGGER trg_employee_balances_touch
  BEFORE UPDATE ON workforce.employee_balances
  FOR EACH ROW
  EXECUTE FUNCTION workforce.fn_employee_balances_touch();

-- ──────────────────────────────────────────────────────────────
-- PART E: backward-compat — wide-format view + alias in `public`
-- ──────────────────────────────────────────────────────────────
-- payroll-routes.js:494-523 reads from `employee_balances` (no schema
-- prefix → resolved against `public` by Supabase) and upserts the wide
-- columns: vacation_days_balance, sick_days_balance, study_fund_balance,
-- severance_balance, snapshot_date, employee_id.
--
-- Until that route is rewritten to write tall rows, expose a writable
-- view that fans the wide upsert into per-type tall rows. We expose
-- READ as a pivot, and WRITE via INSTEAD OF triggers so the existing
-- INSERT/UPSERT in payroll-routes.js keeps working.

CREATE OR REPLACE VIEW public.employee_balances AS
SELECT
  -- A synthetic id for SELECTs that need a single row per (employee, snapshot_date).
  -- Use the latest tall row's id as the representative.
  (array_agg(eb.id ORDER BY eb.last_updated_at DESC))[1] AS id,
  eb.tenant_id,
  eb.employee_id,
  eb.snapshot_date,
  max(case when eb.balance_type = 'vacation'   then eb.balance_units end) AS vacation_days_balance,
  max(case when eb.balance_type = 'sick'       then eb.balance_units end) AS sick_days_balance,
  max(case when eb.balance_type = 'study_fund' then eb.balance_amount end) AS study_fund_balance,
  max(case when eb.balance_type = 'severance'  then eb.balance_amount end) AS severance_balance,
  max(eb.last_updated_at) AS last_updated_at,
  max(eb.created_at)      AS created_at
FROM workforce.employee_balances eb
WHERE eb.is_deleted = false
GROUP BY eb.tenant_id, eb.employee_id, eb.snapshot_date;

COMMENT ON VIEW public.employee_balances IS
  'Backward-compat wide-format pivot of workforce.employee_balances. Used by onyx-procurement/src/payroll/payroll-routes.js:498-523. Writable via INSTEAD OF triggers below.';

-- INSTEAD OF INSERT — fan the wide row into 4 tall rows.
CREATE OR REPLACE FUNCTION public.fn_employee_balances_wide_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_snapshot date := coalesce(NEW.snapshot_date, CURRENT_DATE);
BEGIN
  IF NEW.employee_id IS NULL THEN
    RAISE EXCEPTION 'employee_balances insert requires employee_id';
  END IF;

  INSERT INTO workforce.employee_balances
    (tenant_id, employee_id, balance_type, balance_units, balance_amount, snapshot_date)
  VALUES
    (NEW.tenant_id, NEW.employee_id, 'vacation',   NEW.vacation_days_balance, NULL,                    v_snapshot),
    (NEW.tenant_id, NEW.employee_id, 'sick',       NEW.sick_days_balance,     NULL,                    v_snapshot),
    (NEW.tenant_id, NEW.employee_id, 'study_fund', NULL,                      NEW.study_fund_balance,  v_snapshot),
    (NEW.tenant_id, NEW.employee_id, 'severance',  NULL,                      NEW.severance_balance,   v_snapshot)
  ON CONFLICT (
    coalesce(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid),
    employee_id, balance_type, snapshot_date
  )
  WHERE is_deleted = false
  DO UPDATE SET
    balance_units   = COALESCE(EXCLUDED.balance_units,   workforce.employee_balances.balance_units),
    balance_amount  = COALESCE(EXCLUDED.balance_amount,  workforce.employee_balances.balance_amount),
    last_updated_at = now();

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_employee_balances_wide_insert
  ON public.employee_balances;

CREATE TRIGGER trg_employee_balances_wide_insert
  INSTEAD OF INSERT ON public.employee_balances
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_employee_balances_wide_insert();

-- INSTEAD OF UPDATE — same fan-out, key on (employee_id, snapshot_date).
CREATE OR REPLACE FUNCTION public.fn_employee_balances_wide_update()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_snapshot date := coalesce(NEW.snapshot_date, OLD.snapshot_date, CURRENT_DATE);
BEGIN
  UPDATE workforce.employee_balances
     SET balance_units   = NEW.vacation_days_balance,
         last_updated_at = now()
   WHERE employee_id   = NEW.employee_id
     AND balance_type  = 'vacation'
     AND snapshot_date = v_snapshot
     AND is_deleted    = false;

  UPDATE workforce.employee_balances
     SET balance_units   = NEW.sick_days_balance,
         last_updated_at = now()
   WHERE employee_id   = NEW.employee_id
     AND balance_type  = 'sick'
     AND snapshot_date = v_snapshot
     AND is_deleted    = false;

  UPDATE workforce.employee_balances
     SET balance_amount  = NEW.study_fund_balance,
         last_updated_at = now()
   WHERE employee_id   = NEW.employee_id
     AND balance_type  = 'study_fund'
     AND snapshot_date = v_snapshot
     AND is_deleted    = false;

  UPDATE workforce.employee_balances
     SET balance_amount  = NEW.severance_balance,
         last_updated_at = now()
   WHERE employee_id   = NEW.employee_id
     AND balance_type  = 'severance'
     AND snapshot_date = v_snapshot
     AND is_deleted    = false;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_employee_balances_wide_update
  ON public.employee_balances;

CREATE TRIGGER trg_employee_balances_wide_update
  INSTEAD OF UPDATE ON public.employee_balances
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_employee_balances_wide_update();

-- ──────────────────────────────────────────────────────────────
-- PART F: RLS — enable + policies
-- ──────────────────────────────────────────────────────────────
-- The workforce.* convention (per 00053:392-429) is:
--   1) RLS enabled
--   2) authenticated SELECT/INSERT/UPDATE permissive at DB level
--   3) app-layer enforces hr_manager / payroll_operator / self_only
-- We follow the same convention for symmetry; tenant scoping uses the
-- `governance.current_tenant_id()` helper from 00073 when present.

ALTER TABLE workforce.employee_balances ENABLE ROW LEVEL SECURITY;

-- Drop any prior versions before re-creating (idempotent).
DROP POLICY IF EXISTS employee_balances_select_authenticated ON workforce.employee_balances;
DROP POLICY IF EXISTS employee_balances_insert_authenticated ON workforce.employee_balances;
DROP POLICY IF EXISTS employee_balances_update_authenticated ON workforce.employee_balances;
DROP POLICY IF EXISTS employee_balances_delete_authenticated ON workforce.employee_balances;

-- Tenant-scoped read when governance.current_tenant_id() is wired.
-- Falls back to permissive (true) when the helper is absent so the
-- migration is safe to apply on environments that have not yet run 00073.
DO $$
DECLARE
  v_have_helper boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
     WHERE n.nspname = 'governance'
       AND p.proname = 'current_tenant_id'
  ) INTO v_have_helper;

  IF v_have_helper THEN
    EXECUTE 'CREATE POLICY employee_balances_select_authenticated ' ||
            'ON workforce.employee_balances FOR SELECT USING (' ||
            '  tenant_id IS NULL ' ||
            '  OR tenant_id = governance.current_tenant_id() ' ||
            '  OR governance.is_service_role()' ||
            ')';
    EXECUTE 'CREATE POLICY employee_balances_insert_authenticated ' ||
            'ON workforce.employee_balances FOR INSERT WITH CHECK (' ||
            '  tenant_id IS NULL ' ||
            '  OR tenant_id = governance.current_tenant_id() ' ||
            '  OR governance.is_service_role()' ||
            ')';
    EXECUTE 'CREATE POLICY employee_balances_update_authenticated ' ||
            'ON workforce.employee_balances FOR UPDATE USING (' ||
            '  tenant_id IS NULL ' ||
            '  OR tenant_id = governance.current_tenant_id() ' ||
            '  OR governance.is_service_role()' ||
            ') WITH CHECK (' ||
            '  tenant_id IS NULL ' ||
            '  OR tenant_id = governance.current_tenant_id() ' ||
            '  OR governance.is_service_role()' ||
            ')';
    EXECUTE 'CREATE POLICY employee_balances_delete_authenticated ' ||
            'ON workforce.employee_balances FOR DELETE USING (' ||
            '  governance.is_service_role()' ||
            ')';
  ELSE
    -- Pre-00073 fallback: match 00053 convention (authenticated permissive).
    EXECUTE 'CREATE POLICY employee_balances_select_authenticated ' ||
            'ON workforce.employee_balances FOR SELECT USING (true)';
    EXECUTE 'CREATE POLICY employee_balances_insert_authenticated ' ||
            'ON workforce.employee_balances FOR INSERT WITH CHECK (true)';
    EXECUTE 'CREATE POLICY employee_balances_update_authenticated ' ||
            'ON workforce.employee_balances FOR UPDATE USING (true) WITH CHECK (true)';
  END IF;
END$$;

-- View inherits the underlying table's RLS via security_invoker (PG15+).
-- Wrapped in a DO block so older PostgreSQL versions are silently skipped.
DO $$
BEGIN
  BEGIN
    EXECUTE 'ALTER VIEW public.employee_balances SET (security_invoker = true)';
  EXCEPTION WHEN feature_not_supported OR syntax_error OR undefined_object THEN
    -- PG <15: leave default. RLS still applies via the trigger functions
    -- which run as the caller (no SECURITY DEFINER on the view fns above).
    NULL;
  END;
END$$;

-- ──────────────────────────────────────────────────────────────
-- PART G: GRANTs — match the workforce.* convention
-- ──────────────────────────────────────────────────────────────

GRANT USAGE ON SCHEMA workforce TO authenticated, service_role;

GRANT SELECT, INSERT, UPDATE ON workforce.employee_balances
  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON workforce.employee_balances
  TO service_role;
GRANT USAGE, SELECT ON SEQUENCE workforce.employee_balances_id_seq
  TO authenticated, service_role;

GRANT SELECT, INSERT, UPDATE ON public.employee_balances
  TO authenticated, service_role;

COMMIT;

-- ============================================================
-- VERIFICATION (run manually after migration; not wrapped in BEGIN/COMMIT)
-- ============================================================
-- select count(*) from workforce.employee_balances;             -- table exists, currently empty
-- select column_name from information_schema.columns
--  where table_schema = 'workforce' and table_name = 'employee_balances';
-- select policyname  from pg_policies
--  where schemaname = 'workforce' and tablename = 'employee_balances';
-- select indexname   from pg_indexes
--  where schemaname = 'workforce' and tablename = 'employee_balances';
-- ============================================================
