-- ============================================================
-- FILE: supabase/migrations/033_enterprise_30_tables.sql
-- 30 ENTERPRISE TABLES
-- ============================================================

-- ============================================================
-- SCHEMA PREP
-- ============================================================

create schema if not exists crm;
create schema if not exists service;
create schema if not exists quality;
create schema if not exists compliance;
create schema if not exists treasury;
create schema if not exists planning;
create schema if not exists maintenance;
create schema if not exists pricing;
create schema if not exists routing;
create schema if not exists documents;

-- ============================================================
-- 1
-- CRM LEADS
-- ============================================================

create table if not exists crm.leads (
  id bigserial primary key,
  public_id uuid not null default gen_random_uuid(),
  lead_number text not null unique,
  source_channel text,
  full_name text,
  company_name text,
  phone text,
  email text,
  city text,
  lead_status text not null default 'New',
  score numeric(18,4) not null default 0,
  owner_user_id bigint references governance.users_profile(id),
  estimated_value numeric(18,2) not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- 2
-- CRM LEAD ACTIVITIES
-- ============================================================

create table if not exists crm.lead_activities (
  id bigserial primary key,
  lead_id bigint not null references crm.leads(id) on delete cascade,
  activity_type text not null,
  subject text,
  activity_notes text,
  performed_by_user_id bigint references governance.users_profile(id),
  due_at timestamptz,
  completed_at timestamptz,
  state text not null default 'Open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- 3
-- CRM OPPORTUNITIES
-- ============================================================

create table if not exists crm.opportunities (
  id bigserial primary key,
  public_id uuid not null default gen_random_uuid(),
  opportunity_number text not null unique,
  lead_id bigint references crm.leads(id) on delete set null,
  customer_id bigint references commercial.customers(id) on delete set null,
  stage text not null default 'Qualification',
  probability_percent numeric(9,2) not null default 0,
  expected_close_date date,
  opportunity_value numeric(18,2) not null default 0,
  owner_user_id bigint references governance.users_profile(id),
  state text not null default 'Open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- 4
-- SERVICE TICKETS
-- ============================================================

create table if not exists service.tickets (
  id bigserial primary key,
  public_id uuid not null default gen_random_uuid(),
  ticket_number text not null unique,
  customer_id bigint references commercial.customers(id) on delete set null,
  project_id bigint references execution.projects(id) on delete set null,
  work_order_id bigint references execution.work_orders(id) on delete set null,
  title text not null,
  description text,
  severity text not null default 'medium',
  priority text not null default 'normal',
  state text not null default 'Open',
  assigned_to_user_id bigint references governance.users_profile(id),
  opened_at timestamptz not null default now(),
  resolved_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- 5
-- SERVICE TICKET COMMENTS
-- ============================================================

create table if not exists service.ticket_comments (
  id bigserial primary key,
  ticket_id bigint not null references service.tickets(id) on delete cascade,
  comment_text text not null,
  visibility text not null default 'internal',
  author_user_id bigint references governance.users_profile(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- 6
-- QUALITY INSPECTION PLANS
-- ============================================================

create table if not exists quality.inspection_plans (
  id bigserial primary key,
  public_id uuid not null default gen_random_uuid(),
  plan_code text not null unique,
  plan_name text not null,
  scope_type text not null,
  checklist_payload jsonb not null default '[]'::jsonb,
  active boolean not null default true,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- 7
-- QUALITY INSPECTION RUNS
-- ============================================================

create table if not exists quality.inspection_runs (
  id bigserial primary key,
  plan_id bigint not null references quality.inspection_plans(id) on delete restrict,
  project_id bigint references execution.projects(id) on delete set null,
  work_order_id bigint references execution.work_orders(id) on delete set null,
  run_number text not null unique,
  inspector_user_id bigint references governance.users_profile(id),
  state text not null default 'Draft',
  score numeric(18,4),
  defects_count integer not null default 0,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- 8
-- QUALITY DEFECTS
-- ============================================================

create table if not exists quality.defects (
  id bigserial primary key,
  defect_number text not null unique,
  inspection_run_id bigint references quality.inspection_runs(id) on delete cascade,
  project_id bigint references execution.projects(id) on delete set null,
  work_order_id bigint references execution.work_orders(id) on delete set null,
  title text not null,
  description text,
  severity text not null default 'medium',
  state text not null default 'Open',
  owner_user_id bigint references governance.users_profile(id),
  target_resolution_date date,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- 9
-- COMPLIANCE POLICIES
-- ============================================================

create table if not exists compliance.policies (
  id bigserial primary key,
  policy_code text not null unique,
  policy_name text not null,
  category text,
  policy_text text,
  active boolean not null default true,
  effective_from date,
  effective_to date,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- 10
-- COMPLIANCE ACKNOWLEDGEMENTS
-- ============================================================

create table if not exists compliance.policy_acknowledgements (
  id bigserial primary key,
  policy_id bigint not null references compliance.policies(id) on delete cascade,
  user_id bigint not null references governance.users_profile(id) on delete cascade,
  acknowledged_at timestamptz not null default now(),
  version integer not null default 1,
  unique(policy_id, user_id, version)
);

-- ============================================================
-- 11
-- TREASURY BANK ACCOUNTS
-- ============================================================

create table if not exists treasury.bank_accounts (
  id bigserial primary key,
  account_number_masked text not null,
  bank_name text not null,
  branch_name text,
  currency text not null default 'ILS',
  account_type text not null default 'checking',
  current_balance numeric(18,2) not null default 0,
  active boolean not null default true,
  owner_company_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- 12
-- TREASURY CASH POSITIONS
-- ============================================================

create table if not exists treasury.cash_positions (
  id bigserial primary key,
  bank_account_id bigint not null references treasury.bank_accounts(id) on delete cascade,
  snapshot_date date not null,
  opening_balance numeric(18,2) not null default 0,
  inflow_amount numeric(18,2) not null default 0,
  outflow_amount numeric(18,2) not null default 0,
  closing_balance numeric(18,2) not null default 0,
  unique(bank_account_id, snapshot_date)
);

-- ============================================================
-- 13
-- TREASURY CASH FORECASTS
-- ============================================================

create table if not exists treasury.cash_forecasts (
  id bigserial primary key,
  forecast_date date not null,
  bank_account_id bigint references treasury.bank_accounts(id) on delete set null,
  scenario_name text not null default 'base',
  expected_inflow numeric(18,2) not null default 0,
  expected_outflow numeric(18,2) not null default 0,
  projected_closing_balance numeric(18,2) not null default 0,
  confidence_score numeric(9,4),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- 14
-- PLANNING CAPACITY CALENDARS
-- ============================================================

create table if not exists planning.capacity_calendars (
  id bigserial primary key,
  calendar_code text not null unique,
  calendar_name text not null,
  work_center_code text,
  capacity_unit text not null default 'hours',
  active boolean not null default true,
  timezone_name text not null default 'Asia/Jerusalem',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- 15
-- PLANNING CAPACITY SLOTS
-- ============================================================

create table if not exists planning.capacity_slots (
  id bigserial primary key,
  capacity_calendar_id bigint not null references planning.capacity_calendars(id) on delete cascade,
  slot_date date not null,
  available_capacity numeric(18,4) not null default 0,
  reserved_capacity numeric(18,4) not null default 0,
  consumed_capacity numeric(18,4) not null default 0,
  unique(capacity_calendar_id, slot_date)
);

-- ============================================================
-- 16
-- PLANNING DEMAND FORECASTS
-- ============================================================

create table if not exists planning.demand_forecasts (
  id bigserial primary key,
  forecast_number text not null unique,
  forecast_date date not null,
  category text,
  project_type text,
  expected_count integer not null default 0,
  expected_revenue numeric(18,2) not null default 0,
  expected_material_cost numeric(18,2) not null default 0,
  scenario_name text not null default 'base',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- 17
-- MAINTENANCE ASSETS
-- ============================================================

create table if not exists maintenance.assets (
  id bigserial primary key,
  asset_number text not null unique,
  asset_name text not null,
  asset_type text,
  serial_number text,
  location_name text,
  purchase_date date,
  warranty_until date,
  operational_status text not null default 'Active',
  criticality text not null default 'medium',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- 18
-- MAINTENANCE WORK ORDERS
-- ============================================================

create table if not exists maintenance.work_orders (
  id bigserial primary key,
  maintenance_work_order_number text not null unique,
  asset_id bigint not null references maintenance.assets(id) on delete cascade,
  request_type text not null,
  title text not null,
  description text,
  priority text not null default 'normal',
  state text not null default 'Open',
  assigned_to_user_id bigint references governance.users_profile(id),
  planned_date date,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- 19
-- PRICING RULESETS
-- ============================================================

create table if not exists pricing.rule_sets (
  id bigserial primary key,
  ruleset_code text not null unique,
  ruleset_name text not null,
  category text,
  active boolean not null default true,
  version integer not null default 1,
  rules_payload jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- 20
-- PRICING CALCULATIONS
-- ============================================================

create table if not exists pricing.calculations (
  id bigserial primary key,
  calculation_number text not null unique,
  source_entity_type text,
  source_entity_id bigint,
  ruleset_id bigint references pricing.rule_sets(id) on delete set null,
  subtotal numeric(18,2) not null default 0,
  markup_amount numeric(18,2) not null default 0,
  discount_amount numeric(18,2) not null default 0,
  final_price numeric(18,2) not null default 0,
  margin_percent numeric(9,4),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- 21
-- ROUTING MENUS
-- ============================================================

create table if not exists routing.route_registry (
  id bigserial primary key,
  route_key text not null unique,
  route_path text not null unique,
  route_title text not null,
  component_name text not null,
  required_permission text,
  icon_name text,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- 22
-- ROUTING MENU NODES
-- ============================================================

create table if not exists routing.menu_nodes (
  id bigserial primary key,
  menu_code text not null,
  label text not null,
  route_registry_id bigint references routing.route_registry(id) on delete set null,
  parent_node_id bigint references routing.menu_nodes(id) on delete cascade,
  required_permission text,
  icon_name text,
  sort_order integer not null default 0,
  active boolean not null default true,
  unique(menu_code, label, parent_node_id)
);

-- ============================================================
-- 23
-- ROUTING PERMISSION MAP
-- ============================================================

create table if not exists routing.route_permission_map (
  id bigserial primary key,
  route_registry_id bigint not null references routing.route_registry(id) on delete cascade,
  permission_code text not null,
  unique(route_registry_id, permission_code)
);

-- ============================================================
-- 24
-- DOCUMENTS OCR RUNS
-- ============================================================

create table if not exists documents.ocr_runs (
  id bigserial primary key,
  run_number text not null unique,
  document_id bigint not null references docs.documents(id) on delete cascade,
  engine_name text not null,
  engine_version text,
  state text not null default 'queued',
  language_code text default 'he',
  started_at timestamptz,
  finished_at timestamptz,
  raw_output jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- 25
-- DOCUMENTS CLASSIFICATION RUNS
-- ============================================================

create table if not exists documents.classification_runs (
  id bigserial primary key,
  run_number text not null unique,
  document_id bigint not null references docs.documents(id) on delete cascade,
  model_name text not null,
  model_version text,
  state text not null default 'queued',
  predicted_class text,
  confidence_score numeric(9,4),
  started_at timestamptz,
  finished_at timestamptz,
  output_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- 26
-- DOCUMENTS EXTRACTION RUNS
-- ============================================================

create table if not exists documents.extraction_runs (
  id bigserial primary key,
  run_number text not null unique,
  document_id bigint not null references docs.documents(id) on delete cascade,
  extractor_name text not null,
  extractor_version text,
  state text not null default 'queued',
  fields_payload jsonb,
  confidence_payload jsonb,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- 27
-- DOCUMENTS CHUNKS
-- ============================================================

create table if not exists documents.document_chunks (
  id bigserial primary key,
  document_id bigint not null references docs.documents(id) on delete cascade,
  page_number integer,
  chunk_index integer not null,
  chunk_text text not null,
  embedding_status text not null default 'pending',
  metadata_payload jsonb,
  created_at timestamptz not null default now(),
  unique(document_id, chunk_index)
);

-- ============================================================
-- 28
-- DOCUMENTS ENTITY EXTRACTIONS
-- ============================================================

create table if not exists documents.entity_extractions (
  id bigserial primary key,
  document_id bigint not null references docs.documents(id) on delete cascade,
  extraction_run_id bigint references documents.extraction_runs(id) on delete set null,
  entity_type text not null,
  entity_value text not null,
  normalized_value text,
  confidence_score numeric(9,4),
  page_number integer,
  bbox_payload jsonb,
  created_at timestamptz not null default now()
);

-- ============================================================
-- 29
-- DOCUMENTS RELATION MAP
-- ============================================================

create table if not exists documents.document_relations (
  id bigserial primary key,
  source_document_id bigint not null references docs.documents(id) on delete cascade,
  target_document_id bigint not null references docs.documents(id) on delete cascade,
  relation_type text not null,
  confidence_score numeric(9,4),
  created_at timestamptz not null default now(),
  unique(source_document_id, target_document_id, relation_type)
);

-- ============================================================
-- 30
-- DOCUMENTS KNOWLEDGE CARDS
-- ============================================================

create table if not exists documents.knowledge_cards (
  id bigserial primary key,
  card_number text not null unique,
  document_id bigint references docs.documents(id) on delete set null,
  title text not null,
  summary_text text,
  tags text[],
  classification text,
  confidence_score numeric(9,4),
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- UPDATED_AT TRIGGERS
-- ============================================================

create trigger trg_crm_leads_updated_at before update on crm.leads for each row execute function governance.set_updated_at();
create trigger trg_lead_activities_updated_at before update on crm.lead_activities for each row execute function governance.set_updated_at();
create trigger trg_opportunities_updated_at before update on crm.opportunities for each row execute function governance.set_updated_at();
create trigger trg_service_tickets_updated_at before update on service.tickets for each row execute function governance.set_updated_at();
create trigger trg_service_ticket_comments_updated_at before update on service.ticket_comments for each row execute function governance.set_updated_at();
create trigger trg_inspection_plans_updated_at before update on quality.inspection_plans for each row execute function governance.set_updated_at();
create trigger trg_inspection_runs_updated_at before update on quality.inspection_runs for each row execute function governance.set_updated_at();
create trigger trg_quality_defects_updated_at before update on quality.defects for each row execute function governance.set_updated_at();
create trigger trg_compliance_policies_updated_at before update on compliance.policies for each row execute function governance.set_updated_at();
create trigger trg_bank_accounts_updated_at before update on treasury.bank_accounts for each row execute function governance.set_updated_at();
create trigger trg_cash_forecasts_updated_at before update on treasury.cash_forecasts for each row execute function governance.set_updated_at();
create trigger trg_capacity_calendars_updated_at before update on planning.capacity_calendars for each row execute function governance.set_updated_at();
create trigger trg_demand_forecasts_updated_at before update on planning.demand_forecasts for each row execute function governance.set_updated_at();
create trigger trg_maintenance_assets_updated_at before update on maintenance.assets for each row execute function governance.set_updated_at();
create trigger trg_maintenance_work_orders_updated_at before update on maintenance.work_orders for each row execute function governance.set_updated_at();
create trigger trg_pricing_rule_sets_updated_at before update on pricing.rule_sets for each row execute function governance.set_updated_at();
create trigger trg_pricing_calculations_updated_at before update on pricing.calculations for each row execute function governance.set_updated_at();
create trigger trg_route_registry_updated_at before update on routing.route_registry for each row execute function governance.set_updated_at();
create trigger trg_ocr_runs_updated_at before update on documents.ocr_runs for each row execute function governance.set_updated_at();
create trigger trg_classification_runs_updated_at before update on documents.classification_runs for each row execute function governance.set_updated_at();
create trigger trg_extraction_runs_updated_at before update on documents.extraction_runs for each row execute function governance.set_updated_at();
create trigger trg_knowledge_cards_updated_at before update on documents.knowledge_cards for each row execute function governance.set_updated_at();

-- ============================================================
-- INDEXES
-- ============================================================

create index if not exists idx_crm_leads_status_owner on crm.leads(lead_status, owner_user_id);
create index if not exists idx_crm_opportunities_stage_owner on crm.opportunities(stage, owner_user_id);
create index if not exists idx_service_tickets_state_assigned on service.tickets(state, assigned_to_user_id);
create index if not exists idx_quality_defects_state_owner on quality.defects(state, owner_user_id);
create index if not exists idx_cash_positions_bank_date on treasury.cash_positions(bank_account_id, snapshot_date desc);
create index if not exists idx_capacity_slots_calendar_date on planning.capacity_slots(capacity_calendar_id, slot_date);
create index if not exists idx_maintenance_work_orders_state_asset on maintenance.work_orders(state, asset_id);
create index if not exists idx_route_registry_active_sort on routing.route_registry(active, sort_order);
create index if not exists idx_document_chunks_document_chunk on documents.document_chunks(document_id, chunk_index);
create index if not exists idx_entity_extractions_document_entity on documents.entity_extractions(document_id, entity_type);
create index if not exists idx_knowledge_cards_published on documents.knowledge_cards(published);
