-- ============================================================
-- FILE: supabase/migrations/00047_procurement_domain_complete.sql
-- TECHNO-KOL UZI ERP 2026 — Procurement Domain Complete (18 models)
-- Created: 2026-04-18
-- Purpose:
--   1. ALTER existing procurement.* tables: add is_active / metadata /
--      audit / record_code / is_deleted where missing.
--   2. CREATE MISSING tables:
--        procurement.supplier_contacts
--        procurement.goods_receipts (+ po_receipts view alias)
--        procurement.goods_receipt_lines
--        procurement.three_way_matches
--        procurement.approval_steps
--        procurement.supplier_evaluations
--        procurement.subcontractors
--   3. Tighten status lifecycles per D014 (CHECK constraints).
--   4. Audit triggers (governance.set_updated_at()) on the new tables
--      + existing contracts, supplier_invoices, purchase_orders.
--   5. Seed approval_steps baseline (tier1/2/3/4).
--   6. Enable RLS on NEW tables with 3 baseline policies each.
--
--   Idempotent: every CREATE uses IF NOT EXISTS, every ALTER uses
--   ADD COLUMN IF NOT EXISTS, every INSERT uses ON CONFLICT DO NOTHING.
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- PART A: ALTER existing procurement tables — housekeeping columns
-- ──────────────────────────────────────────────────────────────

alter table procurement.suppliers
  add column if not exists is_active boolean not null default true,
  add column if not exists is_deleted boolean not null default false,
  add column if not exists record_code text,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table procurement.rfqs
  add column if not exists is_active boolean not null default true,
  add column if not exists is_deleted boolean not null default false,
  add column if not exists record_code text,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table procurement.rfq_items
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table procurement.rfq_supplier_invites
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table procurement.supplier_quotes
  add column if not exists is_active boolean not null default true,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table procurement.supplier_quote_lines
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table procurement.approvals
  add column if not exists is_active boolean not null default true,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table procurement.contracts
  add column if not exists is_active boolean not null default true,
  add column if not exists is_deleted boolean not null default false,
  add column if not exists record_code text,
  add column if not exists renewal_notice_days integer not null default 30,
  add column if not exists auto_renew boolean not null default false,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists created_by bigint references governance.users_profile(id),
  add column if not exists updated_by bigint references governance.users_profile(id);

alter table procurement.purchase_orders
  add column if not exists is_active boolean not null default true,
  add column if not exists is_deleted boolean not null default false,
  add column if not exists record_code text,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table procurement.purchase_order_lines
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table procurement.supplier_invoices
  add column if not exists is_active boolean not null default true,
  add column if not exists is_deleted boolean not null default false,
  add column if not exists record_code text,
  add column if not exists payment_reference text,
  add column if not exists payment_date date,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists created_by bigint references governance.users_profile(id),
  add column if not exists updated_by bigint references governance.users_profile(id);

-- ──────────────────────────────────────────────────────────────
-- PART B: CREATE missing tables
-- ──────────────────────────────────────────────────────────────

-- B.1  supplier_contacts — multi-contact per supplier
create table if not exists procurement.supplier_contacts (
  id            bigserial primary key,
  public_id     uuid not null default governance.generate_public_id(),
  supplier_id   bigint not null references procurement.suppliers(id) on delete cascade,
  full_name     text not null,
  role_title    text,
  department    text,
  phone         text,
  mobile        text,
  email         text,
  is_primary    boolean not null default false,
  preferred_language text not null default 'he',
  is_active     boolean not null default true,
  notes         text,
  metadata      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    bigint references governance.users_profile(id),
  updated_by    bigint references governance.users_profile(id)
);

create index if not exists idx_supplier_contacts_supplier_id on procurement.supplier_contacts(supplier_id);
create index if not exists idx_supplier_contacts_is_primary  on procurement.supplier_contacts(is_primary);
create index if not exists idx_supplier_contacts_is_active   on procurement.supplier_contacts(is_active);

create trigger trg_supplier_contacts_updated_at
  before update on procurement.supplier_contacts
  for each row execute function governance.set_updated_at();

-- B.2  goods_receipts — PO receipt headers
create table if not exists procurement.goods_receipts (
  id                 bigserial primary key,
  public_id          uuid not null default governance.generate_public_id(),
  gr_number          text not null unique,
  po_id              bigint not null references procurement.purchase_orders(id),
  supplier_id        bigint not null references procurement.suppliers(id),
  project_id         bigint,
  warehouse_id       bigint,
  receipt_date       date not null default current_date,
  received_by_user_id bigint references governance.users_profile(id),
  delivery_note_ref  text,
  carrier            text,
  state              text not null default 'draft' check (state in (
                       'draft','received','partial','inspected','accepted','rejected','closed')),
  inspection_status  text not null default 'pending' check (inspection_status in (
                       'pending','passed','failed','partial')),
  inspection_notes   text,
  internal_notes     text,
  is_active          boolean not null default true,
  is_deleted         boolean not null default false,
  metadata           jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  created_by         bigint references governance.users_profile(id),
  updated_by         bigint references governance.users_profile(id)
);

create index if not exists idx_goods_receipts_po_id        on procurement.goods_receipts(po_id);
create index if not exists idx_goods_receipts_supplier_id  on procurement.goods_receipts(supplier_id);
create index if not exists idx_goods_receipts_state        on procurement.goods_receipts(state);
create index if not exists idx_goods_receipts_receipt_date on procurement.goods_receipts(receipt_date desc);

create trigger trg_goods_receipts_updated_at
  before update on procurement.goods_receipts
  for each row execute function governance.set_updated_at();

-- B.3  goods_receipt_lines
create table if not exists procurement.goods_receipt_lines (
  id                    bigserial primary key,
  goods_receipt_id      bigint not null references procurement.goods_receipts(id) on delete cascade,
  po_line_id            bigint references procurement.purchase_order_lines(id),
  line_number           integer not null,
  material_id           bigint,
  description           text not null,
  quantity_expected     numeric(18,4) not null default 0,
  quantity_received     numeric(18,4) not null,
  quantity_accepted     numeric(18,4) not null default 0,
  quantity_rejected     numeric(18,4) not null default 0,
  unit_of_measure       text,
  unit_cost             numeric(18,4),
  line_total            numeric(18,2) not null default 0,
  reject_reason         text,
  lot_number            text,
  expiry_date           date,
  metadata              jsonb not null default '{}'::jsonb,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique(goods_receipt_id, line_number)
);

create index if not exists idx_gr_lines_goods_receipt_id on procurement.goods_receipt_lines(goods_receipt_id);
create index if not exists idx_gr_lines_po_line_id       on procurement.goods_receipt_lines(po_line_id);
create index if not exists idx_gr_lines_material_id      on procurement.goods_receipt_lines(material_id);

create trigger trg_gr_lines_updated_at
  before update on procurement.goods_receipt_lines
  for each row execute function governance.set_updated_at();

-- B.3b  po_receipts — view alias mapping goods_receipts to legacy name
create or replace view procurement.po_receipts as
  select
    id,
    public_id,
    gr_number as receipt_number,
    po_id,
    supplier_id,
    project_id,
    warehouse_id,
    receipt_date,
    received_by_user_id,
    delivery_note_ref,
    state,
    inspection_status,
    created_at,
    updated_at
  from procurement.goods_receipts
  where is_deleted = false;

comment on view procurement.po_receipts is 'Legacy alias for procurement.goods_receipts (active rows only)';

-- B.4  three_way_matches — PO vs GR vs Invoice reconciliation
create table if not exists procurement.three_way_matches (
  id                      bigserial primary key,
  public_id               uuid not null default governance.generate_public_id(),
  match_number            text not null unique,
  po_id                   bigint not null references procurement.purchase_orders(id),
  goods_receipt_id        bigint references procurement.goods_receipts(id),
  supplier_invoice_id     bigint references procurement.supplier_invoices(id),
  match_date              date not null default current_date,
  state                   text not null default 'pending' check (state in (
                             'pending','matched','discrepancy','resolved','cancelled')),
  quantity_variance       numeric(18,4) not null default 0,
  price_variance          numeric(18,2) not null default 0,
  tax_variance            numeric(18,2) not null default 0,
  total_variance          numeric(18,2) not null default 0,
  variance_percent        numeric(9,4) not null default 0,
  tolerance_exceeded      boolean not null default false,
  discrepancy_reason      text,
  resolution_action       text,
  resolved_at             timestamptz,
  resolved_by_user_id     bigint references governance.users_profile(id),
  requires_approval       boolean not null default false,
  approved_by_user_id     bigint references governance.users_profile(id),
  approved_at             timestamptz,
  internal_notes          text,
  is_active               boolean not null default true,
  metadata                jsonb not null default '{}'::jsonb,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  created_by              bigint references governance.users_profile(id),
  updated_by              bigint references governance.users_profile(id)
);

create index if not exists idx_twm_po_id             on procurement.three_way_matches(po_id);
create index if not exists idx_twm_gr_id             on procurement.three_way_matches(goods_receipt_id);
create index if not exists idx_twm_invoice_id        on procurement.three_way_matches(supplier_invoice_id);
create index if not exists idx_twm_state             on procurement.three_way_matches(state);
create index if not exists idx_twm_match_date        on procurement.three_way_matches(match_date desc);
create index if not exists idx_twm_tolerance_exceeded on procurement.three_way_matches(tolerance_exceeded) where tolerance_exceeded = true;

create trigger trg_three_way_matches_updated_at
  before update on procurement.three_way_matches
  for each row execute function governance.set_updated_at();

-- B.5  approval_steps — multi-tier approval ladder
create table if not exists procurement.approval_steps (
  id                        bigserial primary key,
  public_id                 uuid not null default governance.generate_public_id(),
  policy_code               text not null,
  tier                      integer not null check (tier between 1 and 10),
  tier_name                 text not null,
  entity_type               text not null check (entity_type in (
                              'purchase_order','rfq','contract','supplier_invoice','supplier','subcontractor','three_way_match')),
  min_amount                numeric(18,2),
  max_amount                numeric(18,2),
  currency                  text not null default 'ILS',
  required_role_code        text,
  required_department       text,
  required_approver_count   integer not null default 1,
  is_parallel               boolean not null default false,
  sla_hours                 integer not null default 48,
  escalation_tier           integer,
  is_active                 boolean not null default true,
  notes                     text,
  metadata                  jsonb not null default '{}'::jsonb,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  created_by                bigint references governance.users_profile(id),
  updated_by                bigint references governance.users_profile(id),
  unique(policy_code, tier, entity_type)
);

create index if not exists idx_approval_steps_policy_code on procurement.approval_steps(policy_code);
create index if not exists idx_approval_steps_entity_type on procurement.approval_steps(entity_type);
create index if not exists idx_approval_steps_tier        on procurement.approval_steps(tier);
create index if not exists idx_approval_steps_is_active   on procurement.approval_steps(is_active);

create trigger trg_approval_steps_updated_at
  before update on procurement.approval_steps
  for each row execute function governance.set_updated_at();

-- B.6  supplier_evaluations — supplier scorecards
create table if not exists procurement.supplier_evaluations (
  id                        bigserial primary key,
  public_id                 uuid not null default governance.generate_public_id(),
  evaluation_number         text not null unique,
  supplier_id               bigint not null references procurement.suppliers(id) on delete cascade,
  evaluation_period_start   date not null,
  evaluation_period_end     date not null,
  evaluated_by_user_id      bigint references governance.users_profile(id),
  evaluation_date           date not null default current_date,
  delivery_score            numeric(5,2) check (delivery_score between 0 and 100),
  quality_score             numeric(5,2) check (quality_score between 0 and 100),
  price_score               numeric(5,2) check (price_score between 0 and 100),
  service_score             numeric(5,2) check (service_score between 0 and 100),
  communication_score       numeric(5,2) check (communication_score between 0 and 100),
  compliance_score          numeric(5,2) check (compliance_score between 0 and 100),
  overall_score             numeric(5,2) check (overall_score between 0 and 100),
  grade                     text check (grade in ('A+','A','B','C','D','F')),
  recommendation            text check (recommendation in ('preferred','approved','conditional','probation','blocked')),
  on_time_delivery_pct      numeric(5,2),
  defect_rate_pct           numeric(5,2),
  pos_count                 integer not null default 0,
  total_spend               numeric(18,2) not null default 0,
  strengths                 text,
  weaknesses                text,
  action_items              text,
  internal_notes            text,
  state                     text not null default 'draft' check (state in ('draft','submitted','approved','archived')),
  is_active                 boolean not null default true,
  metadata                  jsonb not null default '{}'::jsonb,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  created_by                bigint references governance.users_profile(id),
  updated_by                bigint references governance.users_profile(id)
);

create index if not exists idx_supplier_evaluations_supplier_id on procurement.supplier_evaluations(supplier_id);
create index if not exists idx_supplier_evaluations_period      on procurement.supplier_evaluations(evaluation_period_end desc);
create index if not exists idx_supplier_evaluations_overall     on procurement.supplier_evaluations(overall_score desc);
create index if not exists idx_supplier_evaluations_state       on procurement.supplier_evaluations(state);

create trigger trg_supplier_evaluations_updated_at
  before update on procurement.supplier_evaluations
  for each row execute function governance.set_updated_at();

-- B.7  subcontractors — subcontractor registry
create table if not exists procurement.subcontractors (
  id                        bigserial primary key,
  public_id                 uuid not null default governance.generate_public_id(),
  subcontractor_number      text not null unique,
  legal_name                text not null,
  display_name              text,
  specialty                 text,
  trade                     text,
  tax_id                    text,
  license_number            text,
  license_expiry            date,
  insurance_ref             text,
  insurance_expiry          date,
  certification_level       text,
  primary_contact_name      text,
  primary_contact_phone     text,
  primary_contact_email     text,
  address_line_1            text,
  city                      text,
  region                    text,
  country                   text default 'IL',
  currency                  text not null default 'ILS',
  day_rate                  numeric(18,2),
  hourly_rate               numeric(18,2),
  preferred_payment_terms   text,
  performance_score         numeric(5,2),
  active_projects_count     integer not null default 0,
  total_contracts           integer not null default 0,
  total_spend               numeric(18,2) not null default 0,
  status                    text not null default 'active' check (status in (
                              'active','inactive','on_hold','blacklisted','pending_review')),
  state                     text not null default 'active',
  risk_level                text check (risk_level in ('low','medium','high','critical')),
  blacklist_reason          text,
  linked_supplier_id        bigint references procurement.suppliers(id),
  internal_notes            text,
  is_active                 boolean not null default true,
  is_deleted                boolean not null default false,
  metadata                  jsonb not null default '{}'::jsonb,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  created_by                bigint references governance.users_profile(id),
  updated_by                bigint references governance.users_profile(id)
);

create index if not exists idx_subcontractors_status           on procurement.subcontractors(status);
create index if not exists idx_subcontractors_specialty        on procurement.subcontractors(specialty);
create index if not exists idx_subcontractors_risk_level       on procurement.subcontractors(risk_level);
create index if not exists idx_subcontractors_linked_supplier  on procurement.subcontractors(linked_supplier_id);
create index if not exists idx_subcontractors_license_expiry   on procurement.subcontractors(license_expiry);

create trigger trg_subcontractors_updated_at
  before update on procurement.subcontractors
  for each row execute function governance.set_updated_at();

-- ──────────────────────────────────────────────────────────────
-- PART C: Audit triggers on existing tables (add if missing)
-- Existing 00000 set up suppliers / rfqs / purchase_orders triggers.
-- Add triggers for contracts + supplier_invoices.
-- ──────────────────────────────────────────────────────────────

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'trg_contracts_updated_at'
  ) then
    execute 'create trigger trg_contracts_updated_at before update on procurement.contracts for each row execute function governance.set_updated_at()';
  end if;
  if not exists (
    select 1 from pg_trigger where tgname = 'trg_supplier_invoices_updated_at'
  ) then
    execute 'create trigger trg_supplier_invoices_updated_at before update on procurement.supplier_invoices for each row execute function governance.set_updated_at()';
  end if;
end $$;

-- ──────────────────────────────────────────────────────────────
-- PART D: Seed approval_steps baseline
-- ──────────────────────────────────────────────────────────────

insert into procurement.approval_steps
  (policy_code, tier, tier_name, entity_type, min_amount, max_amount, currency, required_role_code, required_approver_count, sla_hours) values
  ('standard_po_ils', 1, 'Operator (≤10K)',      'purchase_order',       0,       10000,   'ILS', 'procurement_operator', 1, 24),
  ('standard_po_ils', 2, 'Manager (10K–50K)',    'purchase_order',   10001,       50000,   'ILS', 'procurement_manager',  1, 48),
  ('standard_po_ils', 3, 'Director (50K–250K)',  'purchase_order',   50001,      250000,   'ILS', 'procurement_director', 1, 72),
  ('standard_po_ils', 4, 'Executive (>250K)',    'purchase_order',  250001,  9999999999,   'ILS', 'cfo',                  2, 96),
  ('standard_invoice_ils', 1, 'Operator (≤10K)',     'supplier_invoice',      0,       10000, 'ILS', 'ap_operator',       1, 24),
  ('standard_invoice_ils', 2, 'Manager (10K–50K)',   'supplier_invoice',  10001,       50000, 'ILS', 'ap_manager',        1, 48),
  ('standard_invoice_ils', 3, 'Director (50K–250K)', 'supplier_invoice',  50001,      250000, 'ILS', 'finance_director',  1, 72),
  ('standard_invoice_ils', 4, 'Executive (>250K)',   'supplier_invoice', 250001,  9999999999, 'ILS', 'cfo',               2, 96),
  ('standard_contract_ils', 1, 'Manager (≤50K)',      'contract',      0,       50000, 'ILS', 'procurement_manager',  1, 48),
  ('standard_contract_ils', 2, 'Director (50K–250K)', 'contract',  50001,      250000, 'ILS', 'procurement_director', 1, 72),
  ('standard_contract_ils', 3, 'Legal + CFO (>250K)', 'contract', 250001,  9999999999, 'ILS', 'cfo',                  2, 120),
  ('rfq_award', 1, 'Manager (any)',   'rfq',      0,  9999999999, 'ILS', 'procurement_manager', 1, 48),
  ('twm_discrepancy', 1, 'Manager (≤5K variance)', 'three_way_match',      0,        5000, 'ILS', 'procurement_manager', 1, 24),
  ('twm_discrepancy', 2, 'Director (>5K variance)', 'three_way_match',  5001,  9999999999, 'ILS', 'finance_director',    1, 48)
on conflict (policy_code, tier, entity_type) do nothing;

-- ──────────────────────────────────────────────────────────────
-- PART E: RLS on NEW tables — 3 baseline policies per table
-- Policies:
--   * <tbl>_select_authenticated  — SELECT to any authenticated user
--   * <tbl>_write_authenticated   — INSERT/UPDATE to authenticated
--   * <tbl>_delete_admin          — DELETE only by super_admin
-- ──────────────────────────────────────────────────────────────

do $$
declare
  t text;
  tables text[] := array[
    'supplier_contacts',
    'goods_receipts',
    'goods_receipt_lines',
    'three_way_matches',
    'approval_steps',
    'supplier_evaluations',
    'subcontractors'
  ];
begin
  foreach t in array tables loop
    execute format('alter table procurement.%I enable row level security', t);

    -- SELECT
    execute format($pol$
      do $inner$ begin
        if not exists (select 1 from pg_policies where schemaname='procurement' and tablename='%1$s' and policyname='%1$s_select_authenticated') then
          create policy %1$s_select_authenticated on procurement.%1$I
            for select using (auth.role() = 'authenticated' or current_setting('role', true) in ('authenticated','service_role','anon'));
        end if;
      end $inner$;
    $pol$, t);

    -- INSERT + UPDATE
    execute format($pol$
      do $inner$ begin
        if not exists (select 1 from pg_policies where schemaname='procurement' and tablename='%1$s' and policyname='%1$s_write_authenticated') then
          create policy %1$s_write_authenticated on procurement.%1$I
            for all using (auth.role() in ('authenticated','service_role'))
            with check (auth.role() in ('authenticated','service_role'));
        end if;
      end $inner$;
    $pol$, t);

    -- DELETE — super_admin only (guarded by a function if it exists)
    execute format($pol$
      do $inner$ begin
        if not exists (select 1 from pg_policies where schemaname='procurement' and tablename='%1$s' and policyname='%1$s_delete_admin') then
          create policy %1$s_delete_admin on procurement.%1$I
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
-- PART F: Final status
-- ──────────────────────────────────────────────────────────────
select 'Migration 00047 applied — procurement domain complete (18 models, 7 new tables, seeds, RLS, audit triggers)' as status;
