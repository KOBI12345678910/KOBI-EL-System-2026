-- ============================================================
-- FILE: supabase/migrations/00080_insurance_domain.sql
-- TECHNO-KOL UZI ERP 2026 — Insurance Domain Complete
-- Created: 2026-04-29
-- Author:  AGENT-240
-- Predecessors:
--   AGENT-117 (insurance domain audit) — reported FAIL: no schema,
--   no backend, no premium logic, no PMI/IISA coverage. Three UI
--   pages (equipment-insurance.tsx, contractor-insurance.tsx,
--   import-insurance.tsx) shipped with FALLBACK_* arrays only.
--   AGENT-219 (hotel-ddl) — established the *_domain.sql pattern
--   this file follows.
--
-- Purpose:
--   Author the three target tables AGENT-117 §1 flagged as missing
--   from every namespace: ins_policies, ins_claims, ins_quotes.
--   Field shape is taken from the existing UI components which
--   AGENT-117 §2 enumerated in detail:
--     - erp-app/src/pages/assets/equipment-insurance.tsx (FALLBACK_*)
--     - erp-app/src/pages/hr/contractor-insurance.tsx (CRUD modal)
--   Plus regulatory columns the audit's §3 demands:
--     - PMI (רשות שוק ההון, ביטוח וחיסכון) circular flags + agent license
--     - IISA standard claim form fields (date_of_loss, place_of_loss,
--       police_case_no, third_party, immediate_notice_at)
--     - premium calculation primitives (base_premium, risk_factor,
--       loadings, deductible_amount/percent, co_insurance_percent)
--     - claim lifecycle status enum closing AGENT-117 §3 gap
--
--   Every table includes: tenant_id (NOT NULL + FK index), the
--   canonical audit columns (is_active, is_deleted, metadata,
--   record_code, public_id, created_by, updated_by, created_at,
--   updated_at), tightened lifecycles via CHECK constraints, FK
--   indexes for the multi-tenant access pattern, and 3 baseline
--   RLS policies.
--
--   Idempotent: every CREATE uses IF NOT EXISTS, RLS policies
--   wrapped in DO-block exception guards.
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- PART A: ins_policies — the policy master
--   Field shape mirrors equipment-insurance.tsx FALLBACK_POLICIES:
--     id, name, type, insurer, premium, coverage, start, end,
--     status, assets
--   Plus contractor-insurance.tsx form: contractor, insuranceType,
--     insurer, policyNumber, coverage, premium, startDate,
--     expiryDate, status
--   Plus PMI regulator slots and premium calc primitives.
-- ──────────────────────────────────────────────────────────────

create table if not exists public.ins_policies (
  id                       bigserial primary key,
  public_id                uuid not null default gen_random_uuid(),
  tenant_id                bigint not null,
  policy_code              text not null,                     -- internal: POL-001
  policy_number            text,                              -- carrier-issued
  name_he                  text not null,
  name_en                  text,
  -- classification
  policy_type              text not null
    check (policy_type in (
      'property',      -- רכוש
      'equipment',     -- ציוד
      'liability',     -- אחריות (third-party / product / employer)
      'vehicle',       -- רכב / צי
      'professional',  -- מקצועי
      'employer_liability', -- חבות מעבידים
      'works',         -- עבודות / קבלנות
      'group_life',    -- חיים קולקטיבי
      'health',        -- בריאות
      'cargo_marine',  -- ימי / יבוא
      'cyber',
      'other'
    )),
  product_line             text,                              -- carrier sub-product
  -- counterparties
  insurer_name_he          text not null,                     -- הראל / מגדל / כלל / הפניקס / מנורה
  insurer_supplier_id      bigint,                            -- optional FK to suppliers when seeded
  agent_name               text,
  agent_license_no         text,                              -- PMI: מספר רישיון סוכן
  agent_license_tier       text                               -- PMI: סוג רישיון
    check (agent_license_tier in ('elementary','life','pension','health','reinsurance','none') or agent_license_tier is null),
  insured_party_type       text not null default 'self'
    check (insured_party_type in ('self','contractor','employee','equipment','vehicle','project','third_party')),
  insured_party_id         bigint,                            -- soft FK by type
  insured_party_name       text,                              -- denormalized snapshot
  -- coverage / scope
  coverage_amount          numeric(14,2) not null default 0
    check (coverage_amount >= 0),
  currency_code            text not null default 'ILS',
  covered_assets           text,                              -- free-text assets list
  coverage_details         jsonb not null default '[]'::jsonb, -- structured coverages
  -- dates
  start_date               date not null,
  end_date                 date not null,
  cancellation_date        date,
  renewal_due_date         date,                              -- end_date - 60 (computed by trigger / app)
  -- premium calc (PMI: רכיבי פרמיה)
  base_premium             numeric(14,2) not null default 0
    check (base_premium >= 0),
  risk_factor              numeric(8,4) not null default 1.0  -- multiplicative rating factor
    check (risk_factor > 0),
  loadings_amount          numeric(14,2) not null default 0,  -- העמסות
  discounts_amount         numeric(14,2) not null default 0   -- הנחות
    check (discounts_amount >= 0),
  premium_amount           numeric(14,2) not null default 0   -- annual gross premium
    check (premium_amount >= 0),
  premium_frequency        text not null default 'annual'
    check (premium_frequency in ('annual','semi_annual','quarterly','monthly','single')),
  -- deductibles (PMI: השתתפות עצמית)
  deductible_amount        numeric(14,2) default 0
    check (deductible_amount is null or deductible_amount >= 0),
  deductible_percent       numeric(5,2) default 0
    check (deductible_percent is null or (deductible_percent >= 0 and deductible_percent <= 100)),
  co_insurance_percent     numeric(5,2) default 0             -- ביטוח משנה / co-pay percent
    check (co_insurance_percent is null or (co_insurance_percent >= 0 and co_insurance_percent <= 100)),
  -- commission / regulatory
  commission_rate          numeric(5,2)
    check (commission_rate is null or (commission_rate >= 0 and commission_rate <= 100)),
  pmi_circular_acks        jsonb not null default '[]'::jsonb, -- list of acknowledged חוזרי ביטוח
  iisa_form_template       text,                              -- IISA template id used
  reinsurer_name           text,                              -- ביטוח משנה carrier
  retention_amount         numeric(14,2),                     -- self-retention layer
  -- status (closed enum closes AGENT-117 §3 free-text gap)
  status                   text not null default 'active'
    check (status in (
      'draft',
      'pending_underwriting',
      'active',          -- בתוקף
      'expiring_soon',   -- לחידוש קרוב
      'expired',         -- פג תוקף
      'in_renewal',      -- בחידוש
      'cancelled',
      'suspended'
    )),
  -- audit
  is_active                boolean not null default true,
  is_deleted               boolean not null default false,
  record_code              text,
  metadata                 jsonb not null default '{}'::jsonb,
  notes                    text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  created_by               bigint,
  updated_by               bigint,
  unique (tenant_id, policy_code),
  check (end_date >= start_date)
);

create index if not exists idx_ins_policies_tenant
  on public.ins_policies (tenant_id);
create index if not exists idx_ins_policies_status
  on public.ins_policies (tenant_id, status);
create index if not exists idx_ins_policies_type
  on public.ins_policies (tenant_id, policy_type, status);
create index if not exists idx_ins_policies_insurer
  on public.ins_policies (tenant_id, insurer_name_he);
create index if not exists idx_ins_policies_insured_party
  on public.ins_policies (insured_party_type, insured_party_id);
create index if not exists idx_ins_policies_dates
  on public.ins_policies (tenant_id, end_date);
create index if not exists idx_ins_policies_renewal
  on public.ins_policies (tenant_id, renewal_due_date)
  where status in ('active','expiring_soon');
create index if not exists idx_ins_policies_policy_number
  on public.ins_policies (tenant_id, policy_number);

-- ──────────────────────────────────────────────────────────────
-- PART B: ins_claims — claim register
--   Shape mirrors equipment-insurance.tsx FALLBACK_CLAIMS:
--     id, policy, description, date, amount, approved, status
--   Plus IISA טופס תביעה אחיד fields AGENT-117 §3 demands:
--     date_of_loss, place_of_loss, police_case_no, third_party_*,
--     immediate_notice_at, adjuster_*
--   Plus full lifecycle state machine (8 states) closing AGENT-117 §3.
-- ──────────────────────────────────────────────────────────────

create table if not exists public.ins_claims (
  id                       bigserial primary key,
  public_id                uuid not null default gen_random_uuid(),
  tenant_id                bigint not null,
  claim_code               text not null,                     -- internal: CLM-101
  claim_number             text,                              -- carrier-issued
  policy_id                bigint not null
    references public.ins_policies(id) on delete restrict,
  -- IISA standard claim form fields
  date_of_loss             date not null,
  time_of_loss             time,
  place_of_loss            text,
  loss_description         text not null,
  cause_of_loss            text                               -- נסיבות האירוע
    check (cause_of_loss in (
      'fire','theft','burglary','vandalism','accident','collision','natural_disaster',
      'water_damage','electrical','mechanical_breakdown','third_party_injury',
      'employee_injury','professional_error','cyber_incident','other'
    ) or cause_of_loss is null),
  immediate_notice_at      timestamptz,                       -- when carrier was first notified
  reported_at              timestamptz not null default now(),
  -- third-party
  third_party_name         text,
  third_party_id           text,                              -- ת.ז / ח.פ
  third_party_phone        text,
  -- police / authorities
  police_case_no           text,                              -- מספר תיק משטרה
  fire_report_no           text,
  authority_report_url     text,
  -- monetary
  claim_amount             numeric(14,2) not null default 0   -- סכום הנדרש
    check (claim_amount >= 0),
  approved_amount          numeric(14,2) default 0
    check (approved_amount is null or approved_amount >= 0),
  paid_amount              numeric(14,2) default 0
    check (paid_amount is null or paid_amount >= 0),
  deductible_applied       numeric(14,2) default 0
    check (deductible_applied is null or deductible_applied >= 0),
  co_insurance_applied     numeric(14,2) default 0,
  currency_code            text not null default 'ILS',
  -- adjuster (שמאי)
  adjuster_name            text,
  adjuster_license_no      text,
  adjuster_assigned_at     timestamptz,
  adjuster_report_url      text,
  assessed_at              timestamptz,
  -- decision
  decided_at               timestamptz,
  decided_by               bigint,
  decision_reason          text,
  paid_at                  timestamptz,
  closed_at                timestamptz,
  reopened_at              timestamptz,
  subrogation_open         boolean not null default false,    -- שיבוב
  -- claim state machine (closes AGENT-117 §3 gap — 8 states + reopen)
  status                   text not null default 'reported'
    check (status in (
      'reported',          -- הוגשה
      'registered',        -- נרשמה
      'assigned',          -- הוקצה שמאי
      'assessed',          -- בבדיקה / נשומה
      'approved',          -- אושר
      'denied',            -- נדחה
      'paid',              -- שולם
      'closed',            -- סגור
      're_opened'          -- נפתח מחדש
    )),
  -- audit
  is_active                boolean not null default true,
  is_deleted               boolean not null default false,
  record_code              text,
  metadata                 jsonb not null default '{}'::jsonb,
  notes                    text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  created_by               bigint,
  updated_by               bigint,
  unique (tenant_id, claim_code)
);

create index if not exists idx_ins_claims_tenant
  on public.ins_claims (tenant_id);
create index if not exists idx_ins_claims_policy
  on public.ins_claims (policy_id);
create index if not exists idx_ins_claims_status
  on public.ins_claims (tenant_id, status);
create index if not exists idx_ins_claims_date_of_loss
  on public.ins_claims (tenant_id, date_of_loss);
create index if not exists idx_ins_claims_open
  on public.ins_claims (tenant_id, status)
  where status in ('reported','registered','assigned','assessed','re_opened');

-- ──────────────────────────────────────────────────────────────
-- PART C: ins_quotes — pre-binding quotation register
--   Tracks RFQ/quote shopping the audit said was completely absent.
--   FK to ins_policies (id) is null until quote is bound (became
--   policy). Until then quote is independent.
-- ──────────────────────────────────────────────────────────────

create table if not exists public.ins_quotes (
  id                       bigserial primary key,
  public_id                uuid not null default gen_random_uuid(),
  tenant_id                bigint not null,
  quote_code               text not null,                     -- internal: INS-Q-001
  quote_number             text,                              -- carrier-issued
  -- request snapshot
  request_date             date not null default current_date,
  desired_start_date       date,
  desired_end_date         date,
  policy_type              text not null
    check (policy_type in (
      'property','equipment','liability','vehicle','professional',
      'employer_liability','works','group_life','health','cargo_marine',
      'cyber','other'
    )),
  -- insured side
  insured_party_type       text not null default 'self'
    check (insured_party_type in ('self','contractor','employee','equipment','vehicle','project','third_party')),
  insured_party_id         bigint,
  insured_party_name       text,
  requested_coverage       numeric(14,2) not null default 0
    check (requested_coverage >= 0),
  currency_code            text not null default 'ILS',
  scope_description        text,
  risk_questionnaire       jsonb not null default '{}'::jsonb, -- שאלון מקדים IISA
  -- carrier side
  insurer_name_he          text,
  insurer_supplier_id      bigint,
  agent_name               text,
  agent_license_no         text,
  -- premium calc inputs (mirror policy structure for binding)
  base_premium             numeric(14,2) default 0
    check (base_premium is null or base_premium >= 0),
  risk_factor              numeric(8,4) default 1.0
    check (risk_factor is null or risk_factor > 0),
  loadings_amount          numeric(14,2) default 0,
  discounts_amount         numeric(14,2) default 0
    check (discounts_amount is null or discounts_amount >= 0),
  quoted_premium           numeric(14,2)                      -- final offer
    check (quoted_premium is null or quoted_premium >= 0),
  premium_frequency        text default 'annual'
    check (premium_frequency in ('annual','semi_annual','quarterly','monthly','single') or premium_frequency is null),
  deductible_amount        numeric(14,2)
    check (deductible_amount is null or deductible_amount >= 0),
  deductible_percent       numeric(5,2)
    check (deductible_percent is null or (deductible_percent >= 0 and deductible_percent <= 100)),
  co_insurance_percent     numeric(5,2)
    check (co_insurance_percent is null or (co_insurance_percent >= 0 and co_insurance_percent <= 100)),
  -- validity
  valid_from               date,
  valid_until              date,
  -- conversion
  converted_policy_id      bigint
    references public.ins_policies(id) on delete set null,
  converted_at             timestamptz,
  decline_reason           text,
  -- quote lifecycle
  status                   text not null default 'requested'
    check (status in (
      'requested',         -- בוקש
      'in_review',         -- בבדיקה
      'quoted',            -- הצעה
      'accepted',          -- התקבלה
      'bound',             -- בוצעה (קושר לפוליסה)
      'declined',          -- נדחתה ע"י לקוח
      'expired',           -- פג תוקף
      'withdrawn'          -- בוטל
    )),
  -- audit
  is_active                boolean not null default true,
  is_deleted               boolean not null default false,
  record_code              text,
  metadata                 jsonb not null default '{}'::jsonb,
  notes                    text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  created_by               bigint,
  updated_by               bigint,
  unique (tenant_id, quote_code),
  check (
    valid_until is null or valid_from is null or valid_until >= valid_from
  )
);

create index if not exists idx_ins_quotes_tenant
  on public.ins_quotes (tenant_id);
create index if not exists idx_ins_quotes_status
  on public.ins_quotes (tenant_id, status);
create index if not exists idx_ins_quotes_type
  on public.ins_quotes (tenant_id, policy_type, status);
create index if not exists idx_ins_quotes_insurer
  on public.ins_quotes (tenant_id, insurer_name_he);
create index if not exists idx_ins_quotes_converted
  on public.ins_quotes (converted_policy_id)
  where converted_policy_id is not null;
create index if not exists idx_ins_quotes_open
  on public.ins_quotes (tenant_id, valid_until)
  where status in ('requested','in_review','quoted');

-- ──────────────────────────────────────────────────────────────
-- PART D: RLS — enable + 3 baseline policies per insurance table
-- ──────────────────────────────────────────────────────────────

do $$
declare
  t text;
  tables text[] := array[
    'ins_policies',
    'ins_claims',
    'ins_quotes'
  ];
begin
  foreach t in array tables loop
    execute format('alter table public.%I enable row level security', t);

    -- policy: authenticated read
    begin
      execute format($p$
        create policy "%1$s_read_auth" on public.%1$I
          for select
          to authenticated
          using (true)
      $p$, t);
    exception when duplicate_object then null;
    end;

    -- policy: authenticated insert
    begin
      execute format($p$
        create policy "%1$s_insert_auth" on public.%1$I
          for insert
          to authenticated
          with check (true)
      $p$, t);
    exception when duplicate_object then null;
    end;

    -- policy: service_role full access
    begin
      execute format($p$
        create policy "%1$s_service_all" on public.%1$I
          for all
          to service_role
          using (true)
          with check (true)
      $p$, t);
    exception when duplicate_object then null;
    end;
  end loop;
end$$;

-- ============================================================
-- END 00080_insurance_domain.sql
-- ============================================================
