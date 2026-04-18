-- ============================================================
-- FILE: supabase/migrations/00043_commercial_domain_complete.sql
-- TECHNO-KOL UZI ERP 2026 — Commercial Domain Complete
-- Created: 2026-04-18
-- Purpose:
--   Add the 4 MISSING commercial tables identified in
--   `_master-registry/domains/commercial.md` §3 (build_now):
--     • commercial.lead_sources
--     • commercial.customer_segments
--     • commercial.sales_orders
--     • commercial.pricing_rules
--
--   Also add gentle ALTER-ADD-IF-NOT-EXISTS enhancements to existing
--   commercial tables so all commercial entities expose a uniform
--   set of housekeeping columns (is_active, metadata).
--
--   Idempotent: every CREATE uses IF NOT EXISTS, every ALTER uses
--   ADD COLUMN IF NOT EXISTS, every INSERT uses ON CONFLICT DO NOTHING.
--
--   Audit triggers: created on the 4 new tables using the existing
--   `governance.set_updated_at()` trigger function (seen in 00011).
--
--   RLS: deliberately NOT enabled here — commercial tables follow the
--   project convention where RLS is added by dedicated migrations
--   (00001 / 00005 / 00014 / 00019). See commercial_evidence_log.md §11.
--
--   Types: matches existing convention — bigserial PK, bigint FKs,
--   governance.users_profile(id) for audit columns.
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- PART A: ALTER existing commercial tables (soft enhancements)
-- Only adds columns that are missing; safe to run multiple times.
-- We deliberately do NOT touch columns that already exist (deleted_at,
-- status, etc.) — only adds `is_active` and `metadata` uniformly.
-- ──────────────────────────────────────────────────────────────

alter table commercial.customers
  add column if not exists is_active boolean not null default true,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table commercial.leads
  add column if not exists is_active boolean not null default true,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table commercial.opportunities
  add column if not exists is_active boolean not null default true,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table commercial.quotes
  add column if not exists is_active boolean not null default true,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table commercial.quote_lines
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table commercial.quote_revisions
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table commercial.quote_approval_rules
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table commercial.pricing_snapshots
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table commercial.pipeline_stages
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table commercial.crm_activities
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table commercial.lead_tags
  add column if not exists metadata jsonb not null default '{}'::jsonb;

-- ──────────────────────────────────────────────────────────────
-- PART B: CREATE 4 new commercial tables
-- ──────────────────────────────────────────────────────────────

-- B.1  commercial.lead_sources — canonical list of lead origination channels
create table if not exists commercial.lead_sources (
  id            bigserial primary key,
  public_id     uuid not null default governance.generate_public_id(),
  code          text not null unique,
  name_he       text not null,
  name_en       text,
  channel       text not null check (channel in (
                  'website','referral','linkedin','cold_outreach','event',
                  'existing_customer','partner','advertisement','tender','other')),
  description   text,
  is_active     boolean not null default true,
  sort_order    integer not null default 0,
  metadata      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    bigint references governance.users_profile(id),
  updated_by    bigint references governance.users_profile(id)
);

create index if not exists idx_lead_sources_channel    on commercial.lead_sources(channel);
create index if not exists idx_lead_sources_is_active  on commercial.lead_sources(is_active);
create index if not exists idx_lead_sources_sort_order on commercial.lead_sources(sort_order);

create trigger trg_lead_sources_updated_at
  before update on commercial.lead_sources
  for each row execute function governance.set_updated_at();

-- B.2  commercial.customer_segments — segmentation / bucketing of customers
create table if not exists commercial.customer_segments (
  id            bigserial primary key,
  public_id     uuid not null default governance.generate_public_id(),
  code          text not null unique,
  name_he       text not null,
  name_en       text,
  description   text,
  segment_type  text not null check (segment_type in (
                  'enterprise','smb','government','retail','wholesale','strategic','custom')),
  criteria      jsonb not null default '{}'::jsonb,
  member_count  integer not null default 0,
  is_active     boolean not null default true,
  metadata      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    bigint references governance.users_profile(id),
  updated_by    bigint references governance.users_profile(id)
);

create index if not exists idx_customer_segments_segment_type on commercial.customer_segments(segment_type);
create index if not exists idx_customer_segments_is_active    on commercial.customer_segments(is_active);

create trigger trg_customer_segments_updated_at
  before update on commercial.customer_segments
  for each row execute function governance.set_updated_at();

-- B.3  commercial.sales_orders — confirmed customer orders (post-quote)
create table if not exists commercial.sales_orders (
  id                   bigserial primary key,
  public_id            uuid not null default governance.generate_public_id(),
  order_number         text not null unique,
  customer_id          bigint not null references commercial.customers(id),
  quote_id             bigint references commercial.quotes(id),
  opportunity_id       bigint references commercial.opportunities(id),
  status               text not null default 'draft' check (status in (
                         'draft','confirmed','in_fulfillment','shipped','invoiced','closed','cancelled')),
  order_date           date not null default current_date,
  expected_delivery    date,
  actual_delivery      date,
  subtotal             numeric(18,2) not null default 0,
  discount_total       numeric(18,2) not null default 0,
  vat_rate             numeric(6,4)  not null default 0.18,
  vat_total            numeric(18,2) not null default 0,
  total_amount         numeric(18,2) not null default 0,
  total_with_vat       numeric(18,2) not null default 0,
  currency             text not null default 'ILS',
  payment_terms        text,
  shipping_address     jsonb,
  billing_address      jsonb,
  notes                text,
  customer_notes       text,
  is_active            boolean not null default true,
  metadata             jsonb not null default '{}'::jsonb,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  created_by           bigint references governance.users_profile(id),
  updated_by           bigint references governance.users_profile(id),
  deleted_at           timestamptz
);

create index if not exists idx_sales_orders_customer_id      on commercial.sales_orders(customer_id);
create index if not exists idx_sales_orders_quote_id         on commercial.sales_orders(quote_id);
create index if not exists idx_sales_orders_opportunity_id   on commercial.sales_orders(opportunity_id);
create index if not exists idx_sales_orders_status           on commercial.sales_orders(status);
create index if not exists idx_sales_orders_order_date_desc  on commercial.sales_orders(order_date desc);
create index if not exists idx_sales_orders_expected_delivery on commercial.sales_orders(expected_delivery);

create trigger trg_sales_orders_updated_at
  before update on commercial.sales_orders
  for each row execute function governance.set_updated_at();

-- B.4  commercial.pricing_rules — customer/segment/product pricing overrides
create table if not exists commercial.pricing_rules (
  id            bigserial primary key,
  public_id     uuid not null default governance.generate_public_id(),
  code          text not null unique,
  name_he       text not null,
  name_en       text,
  description   text,
  scope         text not null check (scope in ('customer','segment','product','category','all')),
  scope_ref_id  bigint,
  rule_type     text not null check (rule_type in (
                  'percent_discount','fixed_discount','special_price','tiered','markup_over_cost')),
  rule_value    jsonb not null,
  valid_from    date,
  valid_to      date,
  priority      integer not null default 100,
  is_active     boolean not null default true,
  metadata      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    bigint references governance.users_profile(id),
  updated_by    bigint references governance.users_profile(id)
);

create index if not exists idx_pricing_rules_scope       on commercial.pricing_rules(scope);
create index if not exists idx_pricing_rules_scope_ref   on commercial.pricing_rules(scope, scope_ref_id);
create index if not exists idx_pricing_rules_rule_type   on commercial.pricing_rules(rule_type);
create index if not exists idx_pricing_rules_is_active   on commercial.pricing_rules(is_active);
create index if not exists idx_pricing_rules_valid_from  on commercial.pricing_rules(valid_from);
create index if not exists idx_pricing_rules_valid_to    on commercial.pricing_rules(valid_to);
create index if not exists idx_pricing_rules_priority    on commercial.pricing_rules(priority);

create trigger trg_pricing_rules_updated_at
  before update on commercial.pricing_rules
  for each row execute function governance.set_updated_at();

-- ──────────────────────────────────────────────────────────────
-- PART C: Link enhancements — soft FK from leads → lead_sources
-- The existing `commercial.leads.source` column is free-text; we add
-- a normalized `lead_source_id` FK column without dropping the legacy
-- column (ZERO-LOSS rule).
-- ──────────────────────────────────────────────────────────────

alter table commercial.leads
  add column if not exists lead_source_id bigint references commercial.lead_sources(id);

create index if not exists idx_leads_lead_source_id on commercial.leads(lead_source_id);

-- Soft FK from customers → customer_segments
alter table commercial.customers
  add column if not exists segment_id bigint references commercial.customer_segments(id);

create index if not exists idx_customers_segment_id on commercial.customers(segment_id);

-- ──────────────────────────────────────────────────────────────
-- PART D: Seed data — canonical lead_sources and customer_segments
-- Safe via ON CONFLICT DO NOTHING on the unique `code` column.
-- ──────────────────────────────────────────────────────────────

insert into commercial.lead_sources (code, name_he, name_en, channel, sort_order) values
  ('website',           'אתר אינטרנט',      'Website',            'website',            10),
  ('referral',          'הפניה',            'Referral',           'referral',           20),
  ('linkedin',          'LinkedIn',         'LinkedIn',           'linkedin',           30),
  ('cold_outreach',     'פניה יזומה',       'Cold Outreach',      'cold_outreach',      40),
  ('event',             'כנס / אירוע',      'Event',              'event',              50),
  ('existing_customer', 'לקוח קיים',        'Existing Customer',  'existing_customer',  60),
  ('partner',           'שותף עסקי',        'Partner',            'partner',            70),
  ('advertisement',     'פרסום',            'Advertisement',      'advertisement',      80),
  ('tender',            'מכרז',             'Tender',             'tender',             90),
  ('other',             'אחר',              'Other',              'other',             100)
on conflict (code) do nothing;

insert into commercial.customer_segments (code, name_he, name_en, segment_type, description) values
  ('enterprise', 'לקוחות אסטרטגיים',    'Enterprise',     'enterprise', 'חברות גדולות עם מחזור שנתי מעל 50M'),
  ('smb',        'עסקים קטנים ובינוניים', 'SMB',            'smb',        'עסקים קטנים ובינוניים'),
  ('government', 'מגזר ציבורי',         'Government',     'government', 'משרדי ממשלה ורשויות מקומיות'),
  ('retail',     'קמעונאות',            'Retail',         'retail',     'לקוחות קמעונאיים'),
  ('wholesale',  'סיטונאות',            'Wholesale',      'wholesale',  'לקוחות סיטונאיים'),
  ('strategic',  'שותפים אסטרטגיים',    'Strategic',      'strategic',  'שותפים עם הסכם מסגרת רב-שנתי')
on conflict (code) do nothing;

-- Seed a conservative baseline pricing rule: default VAT 18% markup (documented,
-- not active by default — serves as a template).
insert into commercial.pricing_rules (
  code, name_he, name_en, description, scope, rule_type, rule_value,
  valid_from, priority, is_active
) values (
  'default_vat_baseline',
  'מע״מ ברירת מחדל',
  'Default VAT baseline',
  'Template rule — VAT 18% applied at quote level (not an override)',
  'all',
  'markup_over_cost',
  jsonb_build_object('vat_rate', 0.18, 'note', 'baseline, not an active override'),
  current_date,
  999,
  false
)
on conflict (code) do nothing;

-- ──────────────────────────────────────────────────────────────
-- PART E: Final status
-- ──────────────────────────────────────────────────────────────
select 'Migration 00043 applied successfully — 4 new commercial tables + enhancements + seed' as status;
