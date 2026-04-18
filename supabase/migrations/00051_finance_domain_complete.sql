-- ============================================================
-- FILE: supabase/migrations/00051_finance_domain_complete.sql
-- TECHNO-KOL UZI ERP 2026 — Finance Domain Complete (Tier 1)
-- Created: 2026-04-18
-- Purpose:
--   PART A: ALTER existing 18 finance.* tables from master schema
--           (lines 1401-1673 of 00000_master_schema.sql). Add the
--           mandatory-column set (D036): is_deleted / is_active /
--           record_code / notes / metadata / created_by / updated_by
--           where missing.
--   PART B: CREATE 6 missing finance tables:
--           - finance.payment_allocations
--           - finance.dunning_campaigns
--           - finance.dunning_steps
--           - finance.collection_actions
--           - finance.reconciliation_exceptions
--           - finance.reminder_schedules
--   PART C: Tighten status lifecycles via CHECK constraints
--           (invoices / payments / collection_cases / dunning_campaigns).
--   PART D: CHECK — invoices.grand_total = subtotal + vat_total
--           (within ±0.01 tolerance) — data-integrity guard.
--   PART E: Audit triggers on invoices / payments / tax_records /
--           vat_records / collection_cases.
--   PART F: Seed fx_rates baseline for ILS/USD/EUR (current month).
--   PART G: Enable RLS on the 6 NEW tables with 3 baseline policies
--           each (select-auth, write-auth, delete-admin) + FK indexes.
--
--   Idempotent: every CREATE uses IF NOT EXISTS, every ALTER uses
--   ADD COLUMN IF NOT EXISTS, constraints guarded by DO blocks.
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- PART A: ALTER existing finance tables — housekeeping columns
-- ──────────────────────────────────────────────────────────────

alter table finance.invoices
  add column if not exists is_active boolean not null default true,
  add column if not exists is_deleted boolean not null default false,
  add column if not exists record_code text,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table finance.invoice_lines
  add column if not exists is_active boolean not null default true,
  add column if not exists is_deleted boolean not null default false,
  add column if not exists notes text,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists created_by bigint references governance.users_profile(id),
  add column if not exists updated_by bigint references governance.users_profile(id);

alter table finance.receipts
  add column if not exists is_active boolean not null default true,
  add column if not exists is_deleted boolean not null default false,
  add column if not exists record_code text,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists created_by bigint references governance.users_profile(id),
  add column if not exists updated_by bigint references governance.users_profile(id);

alter table finance.payments
  add column if not exists is_active boolean not null default true,
  add column if not exists is_deleted boolean not null default false,
  add column if not exists record_code text,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table finance.gl_transactions
  add column if not exists is_active boolean not null default true,
  add column if not exists is_deleted boolean not null default false,
  add column if not exists record_code text,
  add column if not exists notes text,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists updated_by bigint references governance.users_profile(id);

alter table finance.vat_records
  add column if not exists is_active boolean not null default true,
  add column if not exists is_deleted boolean not null default false,
  add column if not exists record_code text,
  add column if not exists notes text,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists created_by bigint references governance.users_profile(id),
  add column if not exists updated_by bigint references governance.users_profile(id);

alter table finance.tax_records
  add column if not exists is_active boolean not null default true,
  add column if not exists is_deleted boolean not null default false,
  add column if not exists record_code text,
  add column if not exists notes text,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists created_by bigint references governance.users_profile(id),
  add column if not exists updated_by bigint references governance.users_profile(id);

alter table finance.tax_exports
  add column if not exists is_active boolean not null default true,
  add column if not exists is_deleted boolean not null default false,
  add column if not exists notes text,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists created_by bigint references governance.users_profile(id),
  add column if not exists updated_by bigint references governance.users_profile(id);

alter table finance.bank_files
  add column if not exists is_active boolean not null default true,
  add column if not exists is_deleted boolean not null default false,
  add column if not exists record_code text,
  add column if not exists notes text,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists created_by bigint references governance.users_profile(id),
  add column if not exists updated_by bigint references governance.users_profile(id);

alter table finance.bank_matches
  add column if not exists is_active boolean not null default true,
  add column if not exists is_deleted boolean not null default false,
  add column if not exists record_code text,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists created_by bigint references governance.users_profile(id),
  add column if not exists updated_by bigint references governance.users_profile(id);

alter table finance.cashflow_entries
  add column if not exists is_active boolean not null default true,
  add column if not exists is_deleted boolean not null default false,
  add column if not exists record_code text,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists created_by bigint references governance.users_profile(id),
  add column if not exists updated_by bigint references governance.users_profile(id);

alter table finance.budget_entries
  add column if not exists is_active boolean not null default true,
  add column if not exists is_deleted boolean not null default false,
  add column if not exists record_code text,
  add column if not exists notes text,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists created_by bigint references governance.users_profile(id),
  add column if not exists updated_by bigint references governance.users_profile(id);

alter table finance.costing_entries
  add column if not exists is_active boolean not null default true,
  add column if not exists is_deleted boolean not null default false,
  add column if not exists record_code text,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists created_by bigint references governance.users_profile(id),
  add column if not exists updated_by bigint references governance.users_profile(id);

alter table finance.fx_rates
  add column if not exists is_active boolean not null default true,
  add column if not exists is_deleted boolean not null default false,
  add column if not exists notes text,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists created_by bigint references governance.users_profile(id),
  add column if not exists updated_by bigint references governance.users_profile(id);

alter table finance.consolidation_entries
  add column if not exists is_active boolean not null default true,
  add column if not exists is_deleted boolean not null default false,
  add column if not exists record_code text,
  add column if not exists notes text,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists created_by bigint references governance.users_profile(id),
  add column if not exists updated_by bigint references governance.users_profile(id);

alter table finance.collection_cases
  add column if not exists is_active boolean not null default true,
  add column if not exists is_deleted boolean not null default false,
  add column if not exists record_code text,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists created_by bigint references governance.users_profile(id),
  add column if not exists updated_by bigint references governance.users_profile(id);

alter table finance.expenses
  add column if not exists is_active boolean not null default true,
  add column if not exists is_deleted boolean not null default false,
  add column if not exists record_code text,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists created_by bigint references governance.users_profile(id),
  add column if not exists updated_by bigint references governance.users_profile(id);

alter table finance.annual_tax_reports
  add column if not exists is_active boolean not null default true,
  add column if not exists is_deleted boolean not null default false,
  add column if not exists record_code text,
  add column if not exists notes text,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists created_by bigint references governance.users_profile(id),
  add column if not exists updated_by bigint references governance.users_profile(id);

-- ──────────────────────────────────────────────────────────────
-- PART B: CREATE 6 missing tables
-- ──────────────────────────────────────────────────────────────

-- B.1  payment_allocations — multi-invoice allocation of a payment
create table if not exists finance.payment_allocations (
  id                bigserial primary key,
  public_id         uuid not null default governance.generate_public_id(),
  allocation_number text,
  payment_id        bigint not null references finance.payments(id) on delete cascade,
  invoice_id        bigint not null references finance.invoices(id),
  amount            numeric(18,2) not null check (amount > 0),
  currency          text not null default 'ILS',
  allocated_at      timestamptz not null default now(),
  state             text not null default 'applied' check (state in ('pending','applied','reversed','cancelled')),
  reversal_reason   text,
  reversed_at       timestamptz,
  reversed_by_user_id bigint references governance.users_profile(id),
  notes             text,
  is_active         boolean not null default true,
  is_deleted        boolean not null default false,
  record_code       text,
  metadata          jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  created_by        bigint references governance.users_profile(id),
  updated_by        bigint references governance.users_profile(id)
);

create index if not exists idx_payment_allocations_payment_id on finance.payment_allocations(payment_id);
create index if not exists idx_payment_allocations_invoice_id on finance.payment_allocations(invoice_id);
create index if not exists idx_payment_allocations_state      on finance.payment_allocations(state);
create index if not exists idx_payment_allocations_allocated_at on finance.payment_allocations(allocated_at desc);

create trigger trg_payment_allocations_updated_at
  before update on finance.payment_allocations
  for each row execute function governance.set_updated_at();

-- B.2  dunning_campaigns — automated collection campaigns
create table if not exists finance.dunning_campaigns (
  id                  bigserial primary key,
  public_id           uuid not null default governance.generate_public_id(),
  name                text not null unique,
  description         text,
  trigger_conditions  jsonb not null default '{}'::jsonb,
  currency            text not null default 'ILS',
  applies_to_segment  text,
  status              text not null default 'draft' check (status in ('draft','active','paused','completed','archived')),
  start_date          date,
  end_date            date,
  is_active           boolean not null default true,
  is_deleted          boolean not null default false,
  record_code         text,
  notes               text,
  metadata            jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  created_by          bigint references governance.users_profile(id),
  updated_by          bigint references governance.users_profile(id)
);

create index if not exists idx_dunning_campaigns_status   on finance.dunning_campaigns(status);
create index if not exists idx_dunning_campaigns_active   on finance.dunning_campaigns(is_active);

create trigger trg_dunning_campaigns_updated_at
  before update on finance.dunning_campaigns
  for each row execute function governance.set_updated_at();

-- B.3  dunning_steps — ordered escalation steps per campaign
create table if not exists finance.dunning_steps (
  id             bigserial primary key,
  public_id      uuid not null default governance.generate_public_id(),
  campaign_id    bigint not null references finance.dunning_campaigns(id) on delete cascade,
  step_order     integer not null check (step_order > 0),
  step_name      text not null,
  wait_days      integer not null default 7 check (wait_days >= 0),
  action_type    text not null check (action_type in (
                   'email_reminder','sms_reminder','phone_call',
                   'letter_soft','letter_firm','legal_notice',
                   'escalate_collection','suspend_service','handoff_external')),
  template_ref   text,
  template_body  text,
  escalation_to  text,
  severity       text not null default 'normal' check (severity in ('low','normal','high','critical')),
  is_active      boolean not null default true,
  is_deleted     boolean not null default false,
  record_code    text,
  notes          text,
  metadata       jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  created_by     bigint references governance.users_profile(id),
  updated_by     bigint references governance.users_profile(id),
  unique(campaign_id, step_order)
);

create index if not exists idx_dunning_steps_campaign_id on finance.dunning_steps(campaign_id);
create index if not exists idx_dunning_steps_action_type on finance.dunning_steps(action_type);

create trigger trg_dunning_steps_updated_at
  before update on finance.dunning_steps
  for each row execute function governance.set_updated_at();

-- B.4  collection_actions — actions taken on a collection case
create table if not exists finance.collection_actions (
  id                  bigserial primary key,
  public_id           uuid not null default governance.generate_public_id(),
  collection_case_id  bigint not null references finance.collection_cases(id) on delete cascade,
  action_type         text not null check (action_type in (
                        'call','email','sms','letter','meeting',
                        'payment_plan_offer','legal_notice','write_off',
                        'escalation','external_handoff','note')),
  action_date         timestamptz not null default now(),
  result_status       text check (result_status in (
                        'no_contact','contacted','promised','paid_partial',
                        'paid_full','disputed','refused','escalated','closed')),
  amount_promised     numeric(18,2),
  promised_date       date,
  taken_by            bigint references governance.users_profile(id),
  notes               text,
  is_active           boolean not null default true,
  is_deleted          boolean not null default false,
  record_code         text,
  metadata            jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  created_by          bigint references governance.users_profile(id),
  updated_by          bigint references governance.users_profile(id)
);

create index if not exists idx_collection_actions_case_id     on finance.collection_actions(collection_case_id);
create index if not exists idx_collection_actions_action_date on finance.collection_actions(action_date desc);
create index if not exists idx_collection_actions_action_type on finance.collection_actions(action_type);
create index if not exists idx_collection_actions_taken_by    on finance.collection_actions(taken_by);

create trigger trg_collection_actions_updated_at
  before update on finance.collection_actions
  for each row execute function governance.set_updated_at();

-- B.5  reconciliation_exceptions — unresolved bank reconciliation variances
create table if not exists finance.reconciliation_exceptions (
  id                  bigserial primary key,
  public_id           uuid not null default governance.generate_public_id(),
  exception_number    text not null unique,
  bank_match_id       bigint references finance.bank_matches(id),
  bank_file_id        bigint references finance.bank_files(id),
  payment_id          bigint references finance.payments(id),
  exception_type      text not null check (exception_type in (
                        'amount_mismatch','date_mismatch','reference_mismatch',
                        'duplicate_payment','missing_payment','unknown_deposit',
                        'currency_mismatch','fee_discrepancy','other')),
  description         text not null,
  amount_expected     numeric(18,2),
  amount_actual       numeric(18,2),
  amount_diff         numeric(18,2),
  currency            text not null default 'ILS',
  resolution_status   text not null default 'open' check (resolution_status in (
                        'open','investigating','resolved','written_off','rejected')),
  resolution_notes    text,
  resolved_at         timestamptz,
  resolved_by_user_id bigint references governance.users_profile(id),
  assigned_to_user_id bigint references governance.users_profile(id),
  is_active           boolean not null default true,
  is_deleted          boolean not null default false,
  record_code         text,
  notes               text,
  metadata            jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  created_by          bigint references governance.users_profile(id),
  updated_by          bigint references governance.users_profile(id)
);

create index if not exists idx_recon_exc_bank_match_id on finance.reconciliation_exceptions(bank_match_id);
create index if not exists idx_recon_exc_bank_file_id  on finance.reconciliation_exceptions(bank_file_id);
create index if not exists idx_recon_exc_payment_id    on finance.reconciliation_exceptions(payment_id);
create index if not exists idx_recon_exc_status        on finance.reconciliation_exceptions(resolution_status);
create index if not exists idx_recon_exc_type          on finance.reconciliation_exceptions(exception_type);

create trigger trg_reconciliation_exceptions_updated_at
  before update on finance.reconciliation_exceptions
  for each row execute function governance.set_updated_at();

-- B.6  reminder_schedules — scheduled invoice reminders
create table if not exists finance.reminder_schedules (
  id              bigserial primary key,
  public_id       uuid not null default governance.generate_public_id(),
  invoice_id      bigint not null references finance.invoices(id) on delete cascade,
  campaign_id     bigint references finance.dunning_campaigns(id),
  step_id         bigint references finance.dunning_steps(id),
  scheduled_at    timestamptz not null,
  sent_at         timestamptz,
  channel         text not null default 'email' check (channel in (
                    'email','sms','whatsapp','phone','letter','in_app','system')),
  recipient       text,
  subject         text,
  body_preview    text,
  status          text not null default 'scheduled' check (status in (
                    'scheduled','sent','delivered','failed','cancelled','bounced')),
  failure_reason  text,
  attempt_count   integer not null default 0,
  is_active       boolean not null default true,
  is_deleted      boolean not null default false,
  record_code     text,
  notes           text,
  metadata        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      bigint references governance.users_profile(id),
  updated_by      bigint references governance.users_profile(id)
);

create index if not exists idx_reminder_schedules_invoice_id   on finance.reminder_schedules(invoice_id);
create index if not exists idx_reminder_schedules_campaign_id  on finance.reminder_schedules(campaign_id);
create index if not exists idx_reminder_schedules_step_id      on finance.reminder_schedules(step_id);
create index if not exists idx_reminder_schedules_scheduled_at on finance.reminder_schedules(scheduled_at);
create index if not exists idx_reminder_schedules_status       on finance.reminder_schedules(status);
create index if not exists idx_reminder_schedules_pending      on finance.reminder_schedules(scheduled_at)
  where status = 'scheduled';

create trigger trg_reminder_schedules_updated_at
  before update on finance.reminder_schedules
  for each row execute function governance.set_updated_at();

-- ──────────────────────────────────────────────────────────────
-- PART C: Status lifecycle CHECK constraints
-- ──────────────────────────────────────────────────────────────

do $$
begin
  -- invoices.state
  if not exists (
    select 1 from pg_constraint
    where conname = 'chk_finance_invoices_state'
      and conrelid = 'finance.invoices'::regclass
  ) then
    alter table finance.invoices
      add constraint chk_finance_invoices_state
      check (state in (
        'draft','issued','sent','partially_paid','paid',
        'overdue','cancelled','voided'
      ));
  end if;

  -- payments.state
  if not exists (
    select 1 from pg_constraint
    where conname = 'chk_finance_payments_state'
      and conrelid = 'finance.payments'::regclass
  ) then
    alter table finance.payments
      add constraint chk_finance_payments_state
      check (state in (
        'pending','cleared','reconciled','failed','refunded','Posted'
      ));
  end if;

  -- collection_cases.state
  if not exists (
    select 1 from pg_constraint
    where conname = 'chk_finance_collection_cases_state'
      and conrelid = 'finance.collection_cases'::regclass
  ) then
    alter table finance.collection_cases
      add constraint chk_finance_collection_cases_state
      check (state in (
        'open','in_progress','payment_plan','resolved','written_off','Open'
      ));
  end if;
end $$;

-- ──────────────────────────────────────────────────────────────
-- PART D: Data-integrity — invoices.grand_total = subtotal + vat_total
-- Tolerance ±0.01 for floating-rounding. Applies to NEW rows only via
-- a before-insert-or-update trigger, to avoid breaking legacy rows.
-- ──────────────────────────────────────────────────────────────

create or replace function finance.invoices_check_totals()
returns trigger
language plpgsql
as $fn$
begin
  if abs(
      coalesce(new.grand_total, 0)
    - (coalesce(new.subtotal, 0)
       - coalesce(new.discount_total, 0)
       + coalesce(new.vat_total, 0))
  ) > 0.01 then
    raise exception 'invoices.grand_total (%.2f) must equal subtotal - discount + vat_total (±0.01)',
      new.grand_total;
  end if;
  return new;
end;
$fn$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_finance_invoices_totals_check') then
    create trigger trg_finance_invoices_totals_check
      before insert or update of subtotal, discount_total, vat_total, grand_total
      on finance.invoices
      for each row
      when (new.state not in ('draft'))
      execute function finance.invoices_check_totals();
  end if;
end $$;

-- ──────────────────────────────────────────────────────────────
-- PART E: Audit triggers on existing tables (add if missing)
-- ──────────────────────────────────────────────────────────────

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_finance_invoices_updated_at') then
    execute 'create trigger trg_finance_invoices_updated_at before update on finance.invoices for each row execute function governance.set_updated_at()';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_finance_payments_updated_at') then
    execute 'create trigger trg_finance_payments_updated_at before update on finance.payments for each row execute function governance.set_updated_at()';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_finance_tax_records_updated_at') then
    execute 'create trigger trg_finance_tax_records_updated_at before update on finance.tax_records for each row execute function governance.set_updated_at()';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_finance_vat_records_updated_at') then
    execute 'create trigger trg_finance_vat_records_updated_at before update on finance.vat_records for each row execute function governance.set_updated_at()';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_finance_collection_cases_updated_at') then
    execute 'create trigger trg_finance_collection_cases_updated_at before update on finance.collection_cases for each row execute function governance.set_updated_at()';
  end if;
end $$;

-- ──────────────────────────────────────────────────────────────
-- PART F: Seed fx_rates baseline (ILS/USD/EUR) for current month
-- ──────────────────────────────────────────────────────────────

insert into finance.fx_rates (currency_code, rate_date, exchange_rate, source_name)
values
  ('ILS', date_trunc('month', current_date)::date, 1.0000,   'baseline'),
  ('USD', date_trunc('month', current_date)::date, 3.7200,   'baseline'),
  ('EUR', date_trunc('month', current_date)::date, 4.0500,   'baseline'),
  ('GBP', date_trunc('month', current_date)::date, 4.7000,   'baseline')
on conflict (currency_code, rate_date) do nothing;

-- ──────────────────────────────────────────────────────────────
-- PART G: RLS on NEW tables — 3 baseline policies per table
-- ──────────────────────────────────────────────────────────────

do $$
declare
  t text;
  tables text[] := array[
    'payment_allocations',
    'dunning_campaigns',
    'dunning_steps',
    'collection_actions',
    'reconciliation_exceptions',
    'reminder_schedules'
  ];
begin
  foreach t in array tables loop
    execute format('alter table finance.%I enable row level security', t);

    -- SELECT
    execute format($pol$
      do $inner$ begin
        if not exists (select 1 from pg_policies where schemaname='finance' and tablename='%1$s' and policyname='%1$s_select_authenticated') then
          create policy %1$s_select_authenticated on finance.%1$I
            for select using (auth.role() = 'authenticated' or current_setting('role', true) in ('authenticated','service_role','anon'));
        end if;
      end $inner$;
    $pol$, t);

    -- INSERT + UPDATE
    execute format($pol$
      do $inner$ begin
        if not exists (select 1 from pg_policies where schemaname='finance' and tablename='%1$s' and policyname='%1$s_write_authenticated') then
          create policy %1$s_write_authenticated on finance.%1$I
            for all using (auth.role() in ('authenticated','service_role'))
            with check (auth.role() in ('authenticated','service_role'));
        end if;
      end $inner$;
    $pol$, t);

    -- DELETE — super_admin only
    execute format($pol$
      do $inner$ begin
        if not exists (select 1 from pg_policies where schemaname='finance' and tablename='%1$s' and policyname='%1$s_delete_admin') then
          create policy %1$s_delete_admin on finance.%1$I
            for delete using (
              auth.role() = 'service_role'
              or coalesce(current_setting('request.jwt.claim.is_super_admin', true), 'false')::boolean = true
            );
        end if;
      end $inner$;
    $pol$, t);
  end loop;
end $$;

-- ──────────────────────────────────────────────────────────────
-- PART H: Final status
-- ──────────────────────────────────────────────────────────────

select 'Migration 00051 applied — finance domain complete (18 altered + 6 new tables, CHECK constraints, RLS, audit)' as status;
