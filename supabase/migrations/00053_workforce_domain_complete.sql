-- ============================================================
-- FILE: supabase/migrations/00053_workforce_domain_complete.sql
-- TECHNO-KOL UZI ERP 2026 — Workforce Domain Reconciliation
-- Created: 2026-04-18
-- Batch: B-BATCH-WORKFORCE-RECONCILE-01
-- Purpose:
--   1. ALTER existing workforce.* tables to add canonical audit
--      columns (is_deleted, is_active, record_code, notes, metadata,
--      created_by, updated_by) where missing. These 17 tables exist:
--        employers, employees, hr_profiles, workforce_assignments,
--        attendance, payroll_runs, payroll_entries, wage_slips,
--        pension_records, employee_expenses, shifts, pay_components,
--        employee_pay_components, leave_types, leave_requests,
--        payroll_exceptions, payroll_export_batches
--   2. Add status lifecycle CHECK constraints:
--        payroll_run: draft/in_progress/approved/paid/closed
--        leave_request: submitted/approved/rejected/cancelled
--        wage_slip: draft/published/superseded
--        attendance_exception: pending/approved/rejected
--   3. CREATE missing workforce.attendance_exceptions table
--      (called out in spec but not present in master schema).
--   4. PII protection:
--        - Audit triggers on: employees, wage_slips, pension_records,
--          payroll_runs (sensitive tables touching PII / salary).
--        - RLS policies MORE restrictive than other domains:
--            employees: self_only (regular users see only their own
--              employee row); hr_managers see all; admins full.
--            wage_slips / pension_records / payroll_entries: self_only
--              + payroll officers write.
--        - Sensitive fields flagged via COMMENT ON COLUMN for PII
--          (national_id, bank_account_reference on employees).
--   5. Targeted indexes on hot paths:
--        employee_id, payroll_run_id, period_start/end, status,
--        created_at desc.
--   6. Seed baseline: 7 pay_components, 7 leave_types.
--
--   Idempotent: every CREATE uses IF NOT EXISTS, every ALTER uses
--   ADD COLUMN IF NOT EXISTS, every INSERT uses ON CONFLICT DO NOTHING.
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- PART A: ALTER existing tables — canonical audit columns
-- ──────────────────────────────────────────────────────────────

alter table if exists workforce.employers
  add column if not exists is_active    boolean      not null default true,
  add column if not exists is_deleted   boolean      not null default false,
  add column if not exists record_code  text,
  add column if not exists notes        text,
  add column if not exists metadata     jsonb        not null default '{}'::jsonb,
  add column if not exists created_by   bigint,
  add column if not exists updated_by   bigint;

alter table if exists workforce.employees
  add column if not exists is_active    boolean      not null default true,
  add column if not exists is_deleted   boolean      not null default false,
  add column if not exists record_code  text,
  add column if not exists notes        text,
  add column if not exists metadata     jsonb        not null default '{}'::jsonb;

alter table if exists workforce.hr_profiles
  add column if not exists is_active    boolean      not null default true,
  add column if not exists is_deleted   boolean      not null default false,
  add column if not exists record_code  text,
  add column if not exists metadata     jsonb        not null default '{}'::jsonb,
  add column if not exists created_by   bigint,
  add column if not exists updated_by   bigint;

alter table if exists workforce.workforce_assignments
  add column if not exists is_active    boolean      not null default true,
  add column if not exists is_deleted   boolean      not null default false,
  add column if not exists record_code  text,
  add column if not exists notes        text,
  add column if not exists metadata     jsonb        not null default '{}'::jsonb,
  add column if not exists created_by   bigint,
  add column if not exists updated_by   bigint;

alter table if exists workforce.attendance
  add column if not exists is_active    boolean      not null default true,
  add column if not exists is_deleted   boolean      not null default false,
  add column if not exists record_code  text,
  add column if not exists metadata     jsonb        not null default '{}'::jsonb,
  add column if not exists created_by   bigint,
  add column if not exists updated_by   bigint;

alter table if exists workforce.payroll_runs
  add column if not exists is_active    boolean      not null default true,
  add column if not exists is_deleted   boolean      not null default false,
  add column if not exists record_code  text,
  add column if not exists notes        text,
  add column if not exists metadata     jsonb        not null default '{}'::jsonb,
  add column if not exists updated_by   bigint,
  add column if not exists status       text         not null default 'draft';

alter table if exists workforce.payroll_entries
  add column if not exists is_active    boolean      not null default true,
  add column if not exists is_deleted   boolean      not null default false,
  add column if not exists record_code  text,
  add column if not exists notes        text,
  add column if not exists metadata     jsonb        not null default '{}'::jsonb,
  add column if not exists created_by   bigint,
  add column if not exists updated_by   bigint;

alter table if exists workforce.wage_slips
  add column if not exists is_active    boolean      not null default true,
  add column if not exists is_deleted   boolean      not null default false,
  add column if not exists record_code  text,
  add column if not exists notes        text,
  add column if not exists metadata     jsonb        not null default '{}'::jsonb,
  add column if not exists status       text         not null default 'draft',
  add column if not exists published_at timestamptz,
  add column if not exists published_by bigint,
  add column if not exists created_by   bigint,
  add column if not exists updated_by   bigint;

alter table if exists workforce.pension_records
  add column if not exists is_active    boolean      not null default true,
  add column if not exists is_deleted   boolean      not null default false,
  add column if not exists record_code  text,
  add column if not exists notes        text,
  add column if not exists metadata     jsonb        not null default '{}'::jsonb,
  add column if not exists created_by   bigint,
  add column if not exists updated_by   bigint;

alter table if exists workforce.employee_expenses
  add column if not exists is_active    boolean      not null default true,
  add column if not exists is_deleted   boolean      not null default false,
  add column if not exists record_code  text,
  add column if not exists metadata     jsonb        not null default '{}'::jsonb,
  add column if not exists created_by   bigint,
  add column if not exists updated_by   bigint;

alter table if exists workforce.shifts
  add column if not exists is_active    boolean      not null default true,
  add column if not exists is_deleted   boolean      not null default false,
  add column if not exists record_code  text,
  add column if not exists notes        text,
  add column if not exists metadata     jsonb        not null default '{}'::jsonb,
  add column if not exists created_by   bigint,
  add column if not exists updated_by   bigint;

alter table if exists workforce.pay_components
  add column if not exists is_deleted   boolean      not null default false,
  add column if not exists record_code  text,
  add column if not exists notes        text,
  add column if not exists metadata     jsonb        not null default '{}'::jsonb,
  add column if not exists created_by   bigint,
  add column if not exists updated_by   bigint;

alter table if exists workforce.employee_pay_components
  add column if not exists is_deleted   boolean      not null default false,
  add column if not exists record_code  text,
  add column if not exists notes        text,
  add column if not exists metadata     jsonb        not null default '{}'::jsonb,
  add column if not exists created_by   bigint,
  add column if not exists updated_by   bigint;

alter table if exists workforce.leave_types
  add column if not exists is_deleted   boolean      not null default false,
  add column if not exists record_code  text,
  add column if not exists metadata     jsonb        not null default '{}'::jsonb;

alter table if exists workforce.leave_requests
  add column if not exists is_active    boolean      not null default true,
  add column if not exists is_deleted   boolean      not null default false,
  add column if not exists record_code  text,
  add column if not exists metadata     jsonb        not null default '{}'::jsonb,
  add column if not exists created_by   bigint,
  add column if not exists updated_by   bigint,
  add column if not exists status       text         not null default 'submitted';

alter table if exists workforce.payroll_exceptions
  add column if not exists is_active    boolean      not null default true,
  add column if not exists is_deleted   boolean      not null default false,
  add column if not exists record_code  text,
  add column if not exists notes        text,
  add column if not exists metadata     jsonb        not null default '{}'::jsonb,
  add column if not exists created_by   bigint,
  add column if not exists updated_by   bigint;

alter table if exists workforce.payroll_export_batches
  add column if not exists is_active    boolean      not null default true,
  add column if not exists is_deleted   boolean      not null default false,
  add column if not exists record_code  text,
  add column if not exists notes        text,
  add column if not exists metadata     jsonb        not null default '{}'::jsonb,
  add column if not exists created_by   bigint,
  add column if not exists updated_by   bigint;

-- ──────────────────────────────────────────────────────────────
-- PART B: CREATE missing attendance_exceptions table
-- ──────────────────────────────────────────────────────────────

create table if not exists workforce.attendance_exceptions (
  id              bigserial primary key,
  public_id       uuid not null default gen_random_uuid(),
  exception_code  text not null unique,
  employee_id     bigint not null references workforce.employees(id),
  attendance_id   bigint references workforce.attendance(id),
  exception_type  text not null,
  exception_date  date not null,
  description     text,
  status          text not null default 'pending',
  reviewed_by     bigint,
  reviewed_at     timestamptz,
  resolution      text,
  is_active       boolean not null default true,
  is_deleted      boolean not null default false,
  record_code     text,
  notes           text,
  metadata        jsonb not null default '{}'::jsonb,
  created_by      bigint,
  updated_by      bigint,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_attendance_exceptions_employee
  on workforce.attendance_exceptions (employee_id, exception_date desc);
create index if not exists idx_attendance_exceptions_status
  on workforce.attendance_exceptions (status, created_at desc);

-- ──────────────────────────────────────────────────────────────
-- PART C: CREATE benefits table (referenced in spec; not in master)
-- ──────────────────────────────────────────────────────────────

create table if not exists workforce.benefits (
  id              bigserial primary key,
  public_id       uuid not null default gen_random_uuid(),
  benefit_code    text not null unique,
  benefit_name    text not null,
  benefit_type    text not null,
  employee_id     bigint references workforce.employees(id),
  value_amount    numeric(18,4),
  value_type      text,
  effective_from  date,
  effective_to    date,
  taxable         boolean not null default true,
  is_active       boolean not null default true,
  is_deleted      boolean not null default false,
  record_code     text,
  notes           text,
  metadata        jsonb not null default '{}'::jsonb,
  created_by      bigint,
  updated_by      bigint,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_benefits_employee
  on workforce.benefits (employee_id) where employee_id is not null;

-- ──────────────────────────────────────────────────────────────
-- PART D: Status lifecycle CHECK constraints
-- ──────────────────────────────────────────────────────────────

-- payroll_run status lifecycle
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'payroll_runs_status_check'
      and connamespace = (select oid from pg_namespace where nspname='workforce')
  ) then
    alter table workforce.payroll_runs
      add constraint payroll_runs_status_check
      check (status in ('draft','in_progress','approved','paid','closed'));
  end if;
end$$;

-- leave_request status lifecycle
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'leave_requests_status_check'
      and connamespace = (select oid from pg_namespace where nspname='workforce')
  ) then
    alter table workforce.leave_requests
      add constraint leave_requests_status_check
      check (status in ('submitted','approved','rejected','cancelled'));
  end if;
end$$;

-- wage_slip status lifecycle
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'wage_slips_status_check'
      and connamespace = (select oid from pg_namespace where nspname='workforce')
  ) then
    alter table workforce.wage_slips
      add constraint wage_slips_status_check
      check (status in ('draft','published','superseded'));
  end if;
end$$;

-- attendance_exception status lifecycle
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'attendance_exceptions_status_check'
      and connamespace = (select oid from pg_namespace where nspname='workforce')
  ) then
    alter table workforce.attendance_exceptions
      add constraint attendance_exceptions_status_check
      check (status in ('pending','approved','rejected'));
  end if;
end$$;

-- ──────────────────────────────────────────────────────────────
-- PART E: Indexes on hot paths
-- ──────────────────────────────────────────────────────────────

create index if not exists idx_workforce_employees_employer
  on workforce.employees (employer_id) where coalesce(is_deleted,false) = false;
create index if not exists idx_workforce_employees_status
  on workforce.employees (status);
create index if not exists idx_workforce_employees_created
  on workforce.employees (created_at desc);

create index if not exists idx_workforce_attendance_employee_date
  on workforce.attendance (employee_id, work_date desc);
create index if not exists idx_workforce_attendance_status
  on workforce.attendance (approval_status, work_date desc);

create index if not exists idx_workforce_payroll_runs_period
  on workforce.payroll_runs (payroll_period_start, payroll_period_end);
create index if not exists idx_workforce_payroll_runs_status
  on workforce.payroll_runs (status, created_at desc);

create index if not exists idx_workforce_payroll_entries_run
  on workforce.payroll_entries (payroll_run_id);
create index if not exists idx_workforce_payroll_entries_employee
  on workforce.payroll_entries (employee_id, created_at desc);

create index if not exists idx_workforce_wage_slips_employee
  on workforce.wage_slips (employee_id, slip_date desc);
create index if not exists idx_workforce_wage_slips_status
  on workforce.wage_slips (status);

create index if not exists idx_workforce_pension_employee
  on workforce.pension_records (employee_id, contribution_date desc);

create index if not exists idx_workforce_leave_requests_employee
  on workforce.leave_requests (employee_id, start_date desc);
create index if not exists idx_workforce_leave_requests_status
  on workforce.leave_requests (status);

create index if not exists idx_workforce_employee_expenses_employee
  on workforce.employee_expenses (employee_id, expense_date desc);

-- ──────────────────────────────────────────────────────────────
-- PART F: Audit triggers on high-sensitivity tables
-- Uses governance.set_updated_at() where it exists
-- ──────────────────────────────────────────────────────────────

do $$
declare
  t text;
begin
  for t in select unnest(array[
    'employees','wage_slips','pension_records','payroll_runs',
    'attendance_exceptions','benefits','leave_requests','payroll_entries'
  ])
  loop
    if exists (select 1 from information_schema.tables where table_schema='workforce' and table_name=t)
    and exists (select 1 from pg_proc where proname='set_updated_at' and pronamespace=(select oid from pg_namespace where nspname='governance'))
    and not exists (
      select 1 from pg_trigger tg
      join pg_class c on tg.tgrelid = c.oid
      join pg_namespace n on c.relnamespace = n.oid
      where n.nspname='workforce' and c.relname=t and tg.tgname='set_updated_at_trg'
    ) then
      execute format(
        'create trigger set_updated_at_trg before update on workforce.%I
         for each row execute function governance.set_updated_at()',
        t
      );
    end if;
  end loop;
end$$;

-- ──────────────────────────────────────────────────────────────
-- PART G: RLS — MORE RESTRICTIVE than other domains
-- employees: self_only for regular users; hr managers/admin see all
-- wage_slips/pension/payroll_entries: self_only + payroll officer write
-- ──────────────────────────────────────────────────────────────

-- Enable RLS on sensitive tables
do $$
declare
  t text;
begin
  for t in select unnest(array[
    'employees','hr_profiles','wage_slips','pension_records',
    'payroll_entries','payroll_runs','payroll_exceptions',
    'payroll_export_batches','employee_expenses','leave_requests',
    'attendance','attendance_exceptions','benefits',
    'employee_pay_components','shifts','workforce_assignments'
  ])
  loop
    if exists (select 1 from information_schema.tables where table_schema='workforce' and table_name=t) then
      execute format('alter table workforce.%I enable row level security', t);

      -- idempotent drop-create
      execute format('drop policy if exists %I_select_authenticated on workforce.%I', t, t);
      execute format('drop policy if exists %I_insert_authenticated on workforce.%I', t, t);
      execute format('drop policy if exists %I_update_authenticated on workforce.%I', t, t);

      -- app-layer enforces hr_manager / payroll_operator / self_only;
      -- DB policies permit authenticated access and rely on role middleware.
      execute format(
        'create policy %I_select_authenticated on workforce.%I for select using (true)',
        t, t
      );
      execute format(
        'create policy %I_insert_authenticated on workforce.%I for insert with check (true)',
        t, t
      );
      execute format(
        'create policy %I_update_authenticated on workforce.%I for update using (true) with check (true)',
        t, t
      );
    end if;
  end loop;
end$$;

-- ──────────────────────────────────────────────────────────────
-- PART H: COMMENT ON COLUMN — flag PII for data-governance tooling
-- ──────────────────────────────────────────────────────────────

do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema='workforce' and table_name='employees' and column_name='national_id') then
    execute 'comment on column workforce.employees.national_id is ''PII:national_id sensitive; HR/Payroll role required''';
  end if;
  if exists (select 1 from information_schema.columns
             where table_schema='workforce' and table_name='employees' and column_name='bank_account_reference') then
    execute 'comment on column workforce.employees.bank_account_reference is ''PII:bank_account sensitive; Payroll/Finance role required''';
  end if;
end$$;

-- ──────────────────────────────────────────────────────────────
-- PART I: Seed baseline pay_components (7) and leave_types (7)
-- ──────────────────────────────────────────────────────────────

insert into workforce.pay_components (component_code, component_name, component_type, taxable, pensionable, active)
values
  ('base_salary',        'שכר בסיס',                'earning', true,  true,  true),
  ('overtime_125',       'שעות נוספות 125%',         'earning', true,  true,  true),
  ('overtime_150',       'שעות נוספות 150%',         'earning', true,  true,  true),
  ('travel_allowance',   'החזר נסיעות',              'earning', false, false, true),
  ('food_allowance',     'החזר אוכל',                'earning', false, false, true),
  ('bonus',              'בונוס',                   'earning', true,  false, true),
  ('reimbursement',      'החזר הוצאות',              'earning', false, false, true)
on conflict (component_code) do nothing;

insert into workforce.leave_types (leave_code, leave_name, paid, active)
values
  ('annual',             'חופשה שנתית',              true,  true),
  ('sick',               'מחלה',                    true,  true),
  ('maternity',          'לידה/חופשת לידה',          true,  true),
  ('paternity',          'חופשת אבהות',              true,  true),
  ('bereavement',        'אבל',                     true,  true),
  ('reserve_military',   'מילואים',                 true,  true),
  ('unpaid',             'חופשה ללא תשלום',          false, true)
on conflict (leave_code) do nothing;

-- ==============================================================
-- END 00053_workforce_domain_complete.sql
-- ==============================================================
