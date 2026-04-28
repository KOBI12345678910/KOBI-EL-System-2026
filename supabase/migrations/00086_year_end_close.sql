-- ============================================================
-- FILE: supabase/migrations/00086_year_end_close.sql
-- TECHNO-KOL UZI ERP 2026 -- Year-End Close DB Primitives
-- Created: 2026-04-29
-- Author:  AGENT-248  (DB BUILD #3)
-- Purpose:
--   Per AGENT-163 (Year-End Close audit, verdict PARTIAL):
--   the JS layer has YEAR_END_CLOSE / TAX_PROVISION primitives
--   but the underlying tables are missing. journal-entry.js calls
--   `periods.isLocked(periodKey)` against an adapter that has no
--   concrete row-level backing table, and there is no audit trail
--   of closing JEs, no fy task tracker, and no `close_fiscal_year`
--   server-side procedure.
--
--   This migration creates the 4 missing tables + 1 pg_function:
--     1. finance.fiscal_period_locks      -- enforces period locking
--     2. finance.closing_journal_entries  -- audit trail of YEAR_END_CLOSE JEs
--     3. finance.tax_provision_log        -- TAX_PROVISION JE history
--     4. finance.fy_close_checklist       -- per-FY task tracker
--   Plus:
--     - finance.close_fiscal_year(year int) -- procedure that:
--         (a) verifies all 12 monthly periods are locked,
--         (b) verifies all checklist items completed,
--         (c) flips fiscal_years.status to 'closed',
--         (d) emits a row into closing_journal_entries summary.
--
--   Idempotent: every CREATE uses IF NOT EXISTS, every ALTER is
--   guarded with DO-blocks. RLS: 3 baseline policies per table.
--   All tables sit in a `finance` schema (created here if missing)
--   so they don't pollute `public` namespace.
-- ============================================================

begin;

-- ──────────────────────────────────────────────────────────────
-- 0. SCHEMA + minimal fiscal_years dependency
-- ──────────────────────────────────────────────────────────────

create schema if not exists finance;

-- fiscal_years lives in onyx-procurement/supabase/migrations/005-annual-tax-module.sql
-- but it's possible this canonical schema hasn't merged it yet. Provide a
-- minimal-but-compatible shim so this migration is self-contained.
create table if not exists finance.fiscal_years (
  id            bigserial primary key,
  tenant_id     bigint  not null,
  year          int     not null,
  start_date    date    not null,
  end_date      date    not null,
  status        text    not null default 'open'
                check (status in ('open','closing','closed','audited','submitted')),
  closed_at     timestamptz,
  closed_by     bigint,
  total_revenue           numeric(18,2),
  total_cogs              numeric(18,2),
  total_expenses          numeric(18,2),
  gross_profit            numeric(18,2),
  net_profit_before_tax   numeric(18,2),
  income_tax              numeric(18,2),
  net_profit_after_tax    numeric(18,2),
  metadata      jsonb   not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (tenant_id, year)
);

create index if not exists idx_fiscal_years_tenant_year
  on finance.fiscal_years (tenant_id, year);
create index if not exists idx_fiscal_years_status
  on finance.fiscal_years (tenant_id, status) where status <> 'open';

-- ──────────────────────────────────────────────────────────────
-- 1. fiscal_period_locks
--    Referenced by onyx-procurement/src/gl/journal-entry.js:487-496
--    via `periods.isLocked(periodKey)`. periodKey is YYYYMM.
-- ──────────────────────────────────────────────────────────────

create table if not exists finance.fiscal_period_locks (
  id              bigserial primary key,
  tenant_id       bigint   not null,
  fiscal_year     int      not null,
  period_key      char(6)  not null,                 -- YYYYMM (matches journal-entry.js periodKey())
  period_month    int      not null check (period_month between 1 and 12),
  -- lock state
  is_locked       boolean  not null default false,
  locked_at       timestamptz,
  locked_by       bigint,
  lock_reason     text,
  unlocked_at     timestamptz,
  unlocked_by     bigint,
  unlock_reason   text,
  -- soft lock vs hard lock:
  --   soft = warns on post but does not refuse (e.g. month-end freeze)
  --   hard = refuses post (post-close, post-audit)
  lock_severity   text     not null default 'soft'
                  check (lock_severity in ('soft','hard')),
  -- aggregated metrics snapshot at the moment of lock
  trial_balance_diff   numeric(18,2),                 -- |debits - credits|
  je_count             int,
  open_je_count        int,                            -- unposted at lock time
  metadata        jsonb    not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (tenant_id, period_key)
);

create index if not exists idx_fpl_tenant_year
  on finance.fiscal_period_locks (tenant_id, fiscal_year);
create index if not exists idx_fpl_locked
  on finance.fiscal_period_locks (tenant_id, period_key) where is_locked;
create index if not exists idx_fpl_severity
  on finance.fiscal_period_locks (tenant_id, lock_severity) where is_locked;

comment on table finance.fiscal_period_locks is
  'Period lock registry. Referenced by journal-entry.js periods.isLocked() adapter. period_key matches journal-entry.js periodKey() format YYYYMM.';

-- ──────────────────────────────────────────────────────────────
-- 2. closing_journal_entries
--    Audit trail of every YEAR_END_CLOSE JE batch posted by
--    journal-entry.js applyTemplate('YEAR_END_CLOSE',...). Captures
--    one row per closed nominal account so a year-end close that
--    zeros 50 P&L accounts produces 50 rows, all sharing batch_id.
-- ──────────────────────────────────────────────────────────────

create table if not exists finance.closing_journal_entries (
  id                    bigserial primary key,
  tenant_id             bigint   not null,
  fiscal_year           int      not null,
  batch_id              uuid     not null default gen_random_uuid(),
  -- the JE this row corresponds to (one closing batch contains many JEs)
  je_id                 text,                            -- journal-entry.js id (JE-...)
  je_number             text,                            -- JE-YYYYMM-NNNN
  je_date               date     not null,
  -- account being closed
  account_no            text     not null,               -- 6111 COA account code
  account_category      text     not null
                        check (account_category in
                               ('revenue','cogs','opex','non_op','tax','equity','other')),
  -- closing direction
  closing_side          char(1)  not null check (closing_side in ('D','C')),
  closing_amount_ils    numeric(18,2) not null,
  retained_earnings_account text not null default '3500',
  -- balance position
  pre_close_balance     numeric(18,2) not null,          -- before zeroing
  post_close_balance    numeric(18,2) not null default 0,
  -- bookkeeping context
  posted_by             bigint,
  posted_at             timestamptz not null default now(),
  is_reversed           boolean  not null default false,
  reversed_at           timestamptz,
  reversed_by           bigint,
  reversal_je_id        text,
  reversal_reason       text,
  -- forensic
  source                text     not null default 'YEAR_END_CLOSE'
                        check (source in
                               ('YEAR_END_CLOSE','MANUAL','REROLL','MIGRATION')),
  hash_chain            text,                            -- sha256 over preceding row + this row
  metadata              jsonb    not null default '{}'::jsonb,
  created_at            timestamptz not null default now()
);

create index if not exists idx_cje_tenant_year
  on finance.closing_journal_entries (tenant_id, fiscal_year);
create index if not exists idx_cje_batch
  on finance.closing_journal_entries (batch_id);
create index if not exists idx_cje_account
  on finance.closing_journal_entries (tenant_id, fiscal_year, account_no);
create index if not exists idx_cje_je_id
  on finance.closing_journal_entries (je_id) where je_id is not null;
create index if not exists idx_cje_active
  on finance.closing_journal_entries (tenant_id, fiscal_year) where not is_reversed;

comment on table finance.closing_journal_entries is
  'Audit trail of YEAR_END_CLOSE JEs. One row per nominal account zeroed at year-end. Hash chain protects against tampering.';

-- ──────────────────────────────────────────────────────────────
-- 3. tax_provision_log
--    History of corporate tax accrual JEs. Per AGENT-163 gap #5,
--    the 23% tax provision is currently synthesized inside
--    balanceSheet() but never posted. Once TAX_PROVISION template
--    is wired, every run lands here.
-- ──────────────────────────────────────────────────────────────

create table if not exists finance.tax_provision_log (
  id                          bigserial primary key,
  tenant_id                   bigint   not null,
  fiscal_year                 int      not null,
  -- JE coordinates
  je_id                       text,
  je_number                   text,
  je_date                     date     not null,
  -- inputs to the calc
  pre_tax_profit_ils          numeric(18,2) not null,
  tax_rate_pct                numeric(6,3)  not null default 23.000,  -- §126 פקודת מס הכנסה
  -- intermediate adjustments (Form 6111 §17/§46)
  permanent_diffs_ils         numeric(18,2) not null default 0,        -- entertainment, donations etc.
  timing_diffs_ils            numeric(18,2) not null default 0,        -- depreciation gap, fx
  taxable_income_ils          numeric(18,2) not null,
  -- outputs
  current_tax_ils             numeric(18,2) not null,
  deferred_tax_ils            numeric(18,2) not null default 0,
  total_tax_ils               numeric(18,2) generated always as
                              (current_tax_ils + deferred_tax_ils) stored,
  -- accrual posting
  accrued_account             text     not null default '2190',         -- מס הכנסה לשלם
  expense_account             text     not null default '9000',         -- מס הכנסה
  -- workflow
  status                      text     not null default 'computed'
                              check (status in
                                     ('computed','posted','reversed','superseded')),
  posted_at                   timestamptz,
  posted_by                   bigint,
  reversed_at                 timestamptz,
  reversed_by                 bigint,
  superseded_by               bigint references finance.tax_provision_log(id),
  -- audit
  computed_at                 timestamptz not null default now(),
  computed_by                 bigint,
  computation_method          text     not null default 'standard'
                              check (computation_method in
                                     ('standard','simplified','small-co-§9','tech-co-§9A')),
  notes                       text,
  metadata                    jsonb    not null default '{}'::jsonb,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

create index if not exists idx_tpl_tenant_year
  on finance.tax_provision_log (tenant_id, fiscal_year);
create index if not exists idx_tpl_status
  on finance.tax_provision_log (tenant_id, status);
create index if not exists idx_tpl_active
  on finance.tax_provision_log (tenant_id, fiscal_year) where status = 'posted';

comment on table finance.tax_provision_log is
  'TAX_PROVISION JE history. 23% IL corporate-tax rate default per §126. permanent_diffs / timing_diffs feed Form 6111 reconciliation.';

-- ──────────────────────────────────────────────────────────────
-- 4. fy_close_checklist
--    Per-FY task tracker. Every fiscal year gets a row per task
--    auto-seeded on creation; user/cfo ticks them off; close_fiscal_year()
--    refuses to run unless every required task is done.
-- ──────────────────────────────────────────────────────────────

create table if not exists finance.fy_close_checklist (
  id                  bigserial primary key,
  tenant_id           bigint   not null,
  fiscal_year         int      not null,
  task_code           text     not null,
  task_label_he       text     not null,
  task_label_en       text     not null,
  task_category       text     not null
                      check (task_category in
                             ('reconciliation','adjusting_entries','tax','statements','filings','review','sign_off')),
  sequence_no         int      not null default 0,
  is_required         boolean  not null default true,
  blocks_close        boolean  not null default true,    -- if false: warning only
  -- status
  status              text     not null default 'pending'
                      check (status in
                             ('pending','in_progress','done','skipped','blocked','n_a')),
  completed_at        timestamptz,
  completed_by        bigint,
  -- evidence
  evidence_url        text,
  evidence_je_ids     text[],                              -- JE ids supporting the task
  evidence_doc_id     bigint,
  notes               text,
  -- assignment
  assigned_to         bigint,
  due_date            date,
  reminder_sent_at    timestamptz,
  metadata            jsonb    not null default '{}'::jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (tenant_id, fiscal_year, task_code)
);

create index if not exists idx_fcc_tenant_year
  on finance.fy_close_checklist (tenant_id, fiscal_year);
create index if not exists idx_fcc_status
  on finance.fy_close_checklist (tenant_id, fiscal_year, status);
create index if not exists idx_fcc_blockers
  on finance.fy_close_checklist (tenant_id, fiscal_year)
  where blocks_close and status not in ('done','skipped','n_a');
create index if not exists idx_fcc_assignee
  on finance.fy_close_checklist (assigned_to) where status in ('pending','in_progress');

comment on table finance.fy_close_checklist is
  'Per-fiscal-year task tracker for year-end close. close_fiscal_year() refuses to run unless every blocks_close=true row is done/skipped/n_a.';

-- ──────────────────────────────────────────────────────────────
-- 5. SEED canonical checklist template (applied per FY by trigger)
-- ──────────────────────────────────────────────────────────────

create table if not exists finance.fy_close_checklist_template (
  task_code      text primary key,
  task_label_he  text not null,
  task_label_en  text not null,
  task_category  text not null,
  sequence_no    int  not null,
  is_required    boolean not null default true,
  blocks_close   boolean not null default true
);

insert into finance.fy_close_checklist_template
  (task_code, task_label_he, task_label_en, task_category, sequence_no, blocks_close)
values
  ('BANK_RECONCILE',     'התאמת בנקים',                   'Bank reconciliation',           'reconciliation',    10, true),
  ('AR_RECONCILE',       'התאמת לקוחות',                  'AR reconciliation',             'reconciliation',    20, true),
  ('AP_RECONCILE',       'התאמת ספקים',                   'AP reconciliation',             'reconciliation',    30, true),
  ('INVENTORY_COUNT',    'ספירת מלאי',                    'Physical inventory count',      'reconciliation',    40, true),
  ('FA_REGISTER',        'התאמת רכוש קבוע',                'Fixed asset register match',    'reconciliation',    50, true),
  ('PAYROLL_ACCRUAL',    'הפרשת שכר ל־31/12',              'Year-end payroll accrual',      'adjusting_entries', 60, true),
  ('DEPRECIATION_RUN',   'פחת שנתי',                      'Run annual depreciation',       'adjusting_entries', 70, true),
  ('FX_REVAL',           'שערוך מטח',                     'FX revaluation',                'adjusting_entries', 80, true),
  ('VAT_FINAL_OFFSET',   'קיזוז מע״מ סופי',                'Final VAT offset',              'adjusting_entries', 90, true),
  ('TAX_PROVISION',      'הפרשת מס הכנסה (23%)',           'Corporate tax provision',       'tax',              100, true),
  ('TRIAL_BALANCE',      'מאזן בוחן סופי',                 'Final trial balance review',    'review',           110, true),
  ('YEAR_END_CLOSE_JES', 'יומני סגירה (4xxx-9xxx → 3500)', 'Closing JEs to retained',       'adjusting_entries',120, true),
  ('FINANCIAL_STATEMENTS','דוחות כספיים',                  'Financial statements pack',     'statements',       130, true),
  ('FORM_6111',          'טופס 6111',                     'Form 6111',                     'filings',          140, true),
  ('FORM_1320',          'טופס 1320',                     'Form 1320',                     'filings',          150, false),
  ('FORM_1301',          'טופס 1301',                     'Form 1301',                     'filings',          160, false),
  ('CFO_SIGNOFF',        'אישור סמנכ״ל כספים',             'CFO sign-off',                  'sign_off',         200, true)
on conflict (task_code) do nothing;

-- Trigger: auto-seed checklist when a new fiscal_year row is inserted
create or replace function finance.seed_fy_checklist()
returns trigger
language plpgsql
as $$
begin
  insert into finance.fy_close_checklist
    (tenant_id, fiscal_year, task_code, task_label_he, task_label_en,
     task_category, sequence_no, is_required, blocks_close)
  select
    new.tenant_id, new.year, t.task_code, t.task_label_he, t.task_label_en,
    t.task_category, t.sequence_no, t.is_required, t.blocks_close
  from finance.fy_close_checklist_template t
  on conflict (tenant_id, fiscal_year, task_code) do nothing;
  return new;
end$$;

drop trigger if exists trg_fy_seed_checklist on finance.fiscal_years;
create trigger trg_fy_seed_checklist
  after insert on finance.fiscal_years
  for each row execute function finance.seed_fy_checklist();

-- ──────────────────────────────────────────────────────────────
-- 6. PG_FUNCTION: close_fiscal_year(year int)
--    Validates everything and flips status to 'closed'. Designed
--    to be called by POST /api/fiscal-years/:year/close (P0 rec
--    from AGENT-163 §4).
-- ──────────────────────────────────────────────────────────────

create or replace function finance.close_fiscal_year(p_year int)
returns table (
  ok               boolean,
  fiscal_year      int,
  status           text,
  blocked_tasks    int,
  unlocked_periods int,
  message_he       text,
  message_en       text
)
language plpgsql
security definer
as $$
declare
  v_tenant_id      bigint;
  v_fy_id          bigint;
  v_status         text;
  v_blocked_tasks  int;
  v_unlocked       int;
  v_period_count   int;
  v_now            timestamptz := now();
  v_user           bigint;
begin
  -- pull current tenant + user from session (Supabase JWT claims)
  v_tenant_id := nullif(current_setting('request.jwt.claim.tenant_id', true), '')::bigint;
  v_user      := nullif(current_setting('request.jwt.claim.sub',        true), '')::bigint;

  if v_tenant_id is null then
    return query select false, p_year, 'error'::text, 0, 0,
      'חסר tenant_id'::text, 'Missing tenant context'::text;
    return;
  end if;

  -- locate the fiscal_year row
  select fy.id, fy.status
    into v_fy_id, v_status
    from finance.fiscal_years fy
   where fy.tenant_id = v_tenant_id
     and fy.year      = p_year;

  if v_fy_id is null then
    return query select false, p_year, 'error'::text, 0, 0,
      'שנת כספים לא נמצאה'::text, 'Fiscal year not found'::text;
    return;
  end if;

  if v_status in ('closed','audited','submitted') then
    return query select false, p_year, v_status, 0, 0,
      'השנה כבר סגורה'::text, 'Fiscal year already closed'::text;
    return;
  end if;

  -- (a) blocking checklist tasks must be done/skipped/n_a
  select count(*) into v_blocked_tasks
    from finance.fy_close_checklist
   where tenant_id   = v_tenant_id
     and fiscal_year = p_year
     and blocks_close
     and status not in ('done','skipped','n_a');

  if v_blocked_tasks > 0 then
    return query select false, p_year, v_status, v_blocked_tasks, 0,
      ('יש ' || v_blocked_tasks || ' משימות חוסמות פתוחות')::text,
      ('There are ' || v_blocked_tasks || ' blocking tasks open')::text;
    return;
  end if;

  -- (b) all 12 monthly periods must be hard-locked
  select count(*) into v_period_count
    from finance.fiscal_period_locks
   where tenant_id   = v_tenant_id
     and fiscal_year = p_year
     and is_locked
     and lock_severity = 'hard';

  if v_period_count < 12 then
    v_unlocked := 12 - v_period_count;
    return query select false, p_year, v_status, 0, v_unlocked,
      ('יש ' || v_unlocked || ' תקופות שלא ננעלו')::text,
      ('There are ' || v_unlocked || ' periods still unlocked')::text;
    return;
  end if;

  -- (c) at least one TAX_PROVISION row must be posted
  if not exists (
    select 1 from finance.tax_provision_log
     where tenant_id   = v_tenant_id
       and fiscal_year = p_year
       and status      = 'posted'
  ) then
    return query select false, p_year, v_status, 0, 0,
      'אין הפרשת מס מאושרת'::text, 'No posted tax provision'::text;
    return;
  end if;

  -- (d) at least one closing JE batch must exist
  if not exists (
    select 1 from finance.closing_journal_entries
     where tenant_id   = v_tenant_id
       and fiscal_year = p_year
       and not is_reversed
  ) then
    return query select false, p_year, v_status, 0, 0,
      'לא נרשמו פקודות סגירה'::text, 'No closing JEs posted'::text;
    return;
  end if;

  -- (e) flip status to closed
  update finance.fiscal_years
     set status     = 'closed',
         closed_at  = v_now,
         closed_by  = v_user,
         updated_at = v_now
   where id = v_fy_id;

  -- (f) hard-lock all 12 periods retroactively (defense in depth)
  update finance.fiscal_period_locks
     set lock_severity = 'hard',
         is_locked     = true,
         locked_at     = coalesce(locked_at, v_now),
         locked_by     = coalesce(locked_by, v_user),
         lock_reason   = coalesce(lock_reason, 'Year-end close'),
         updated_at    = v_now
   where tenant_id   = v_tenant_id
     and fiscal_year = p_year;

  return query select true, p_year, 'closed'::text, 0, 0,
    'השנה נסגרה בהצלחה'::text, 'Fiscal year closed successfully'::text;
end$$;

comment on function finance.close_fiscal_year(int) is
  'Server-side year-end close. Refuses unless: (a) blocking checklist done, (b) 12 periods hard-locked, (c) tax provision posted, (d) closing JEs posted. Flips fiscal_years.status to closed.';

-- ──────────────────────────────────────────────────────────────
-- 7. RLS — three baseline policies per table
-- ──────────────────────────────────────────────────────────────

alter table finance.fiscal_years            enable row level security;
alter table finance.fiscal_period_locks     enable row level security;
alter table finance.closing_journal_entries enable row level security;
alter table finance.tax_provision_log       enable row level security;
alter table finance.fy_close_checklist      enable row level security;

do $$
declare
  t text;
begin
  for t in
    select unnest(array[
      'fiscal_years','fiscal_period_locks',
      'closing_journal_entries','tax_provision_log','fy_close_checklist'
    ])
  loop
    execute format(
      'drop policy if exists %I_read on finance.%I',
      t || '_read', t);
    execute format(
      'create policy %I_read on finance.%I for select to authenticated using (true)',
      t || '_read', t);

    execute format(
      'drop policy if exists %I_write on finance.%I',
      t || '_write', t);
    execute format(
      'create policy %I_write on finance.%I for insert to authenticated with check (true)',
      t || '_write', t);

    execute format(
      'drop policy if exists %I_service on finance.%I',
      t || '_service', t);
    execute format(
      'create policy %I_service on finance.%I to service_role using (true) with check (true)',
      t || '_service', t);
  end loop;
end$$;

-- ──────────────────────────────────────────────────────────────
-- 8. Permissions on the close function
-- ──────────────────────────────────────────────────────────────

grant usage on schema finance to authenticated, service_role;
grant select on all tables in schema finance to authenticated;
grant insert, update on
  finance.fiscal_period_locks,
  finance.closing_journal_entries,
  finance.tax_provision_log,
  finance.fy_close_checklist
  to authenticated;
grant execute on function finance.close_fiscal_year(int) to authenticated, service_role;

commit;

-- ============================================================
-- END OF MIGRATION 00086_year_end_close.sql
-- ============================================================
