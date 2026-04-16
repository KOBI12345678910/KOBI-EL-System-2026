-- =========================================================
-- TECHNOKOL UZI ERP 2026
-- PALANTIR-STYLE FEDERATED ENTERPRISE OPERATING SYSTEM
-- POSTGRES / SUPABASE SQL FOUNDATION
-- =========================================================

-- =========================================================
-- SECTION 1: SCHEMAS
-- =========================================================

create schema if not exists governance;
create schema if not exists commercial;
create schema if not exists procurement;
create schema if not exists execution;
create schema if not exists inventory;
create schema if not exists workforce;
create schema if not exists finance;
create schema if not exists docs;
create schema if not exists comms;
create schema if not exists intelligence;
create schema if not exists analytics;

-- =========================================================
-- SECTION 2: EXTENSIONS
-- =========================================================

create extension if not exists pgcrypto;
create extension if not exists "uuid-ossp";

-- =========================================================
-- SECTION 3: COMMON HELPERS
-- =========================================================

create or replace function governance.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function governance.generate_public_id()
returns uuid
language sql
as $$
  select gen_random_uuid();
$$;

-- =========================================================
-- SECTION 4: GOVERNANCE TABLES
-- =========================================================

create table if not exists governance.users_profile (
  id bigserial primary key,
  public_id uuid not null default governance.generate_public_id(),
  auth_user_id uuid unique,
  email text not null unique,
  full_name text not null,
  phone text,
  status text not null default 'active',
  locale text not null default 'he-IL',
  timezone text not null default 'Asia/Jerusalem',
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists governance.roles (
  id bigserial primary key,
  public_id uuid not null default governance.generate_public_id(),
  role_code text not null unique,
  role_name text not null,
  description text,
  is_system_role boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists governance.permissions (
  id bigserial primary key,
  public_id uuid not null default governance.generate_public_id(),
  permission_code text not null unique,
  permission_name text not null,
  domain text not null,
  action text not null,
  entity_type text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists governance.role_permissions (
  id bigserial primary key,
  role_id bigint not null references governance.roles(id) on delete cascade,
  permission_id bigint not null references governance.permissions(id) on delete cascade,
  granted_at timestamptz not null default now(),
  granted_by bigint references governance.users_profile(id),
  unique(role_id, permission_id)
);

create table if not exists governance.user_roles (
  id bigserial primary key,
  user_id bigint not null references governance.users_profile(id) on delete cascade,
  role_id bigint not null references governance.roles(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  assigned_by bigint references governance.users_profile(id),
  expires_at timestamptz,
  unique(user_id, role_id)
);

create table if not exists governance.object_permissions (
  id bigserial primary key,
  entity_type text not null,
  entity_id bigint not null,
  subject_type text not null,
  subject_id bigint not null,
  permission_code text not null,
  granted boolean not null default true,
  granted_at timestamptz not null default now(),
  granted_by bigint references governance.users_profile(id),
  expires_at timestamptz
);

create index if not exists idx_object_permissions_entity
  on governance.object_permissions(entity_type, entity_id);

create index if not exists idx_object_permissions_subject
  on governance.object_permissions(subject_type, subject_id);

create table if not exists governance.audit_logs (
  id bigserial primary key,
  public_id uuid not null default governance.generate_public_id(),
  entity_type text not null,
  entity_id bigint not null,
  action_name text not null,
  old_values jsonb,
  new_values jsonb,
  performed_by_user_id bigint references governance.users_profile(id),
  source_service text not null,
  source_module text not null,
  source_page text,
  correlation_id text,
  performed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_logs_entity
  on governance.audit_logs(entity_type, entity_id);

create index if not exists idx_audit_logs_performed_at
  on governance.audit_logs(performed_at desc);

create table if not exists governance.state_history (
  id bigserial primary key,
  entity_type text not null,
  entity_id bigint not null,
  from_state text,
  to_state text not null,
  changed_at timestamptz not null default now(),
  changed_by_user_id bigint references governance.users_profile(id),
  reason text,
  correlation_id text,
  created_at timestamptz not null default now()
);

create index if not exists idx_state_history_entity
  on governance.state_history(entity_type, entity_id);

create table if not exists governance.domain_events (
  id bigserial primary key,
  public_id uuid not null default governance.generate_public_id(),
  event_name text not null,
  event_version integer not null default 1,
  topic_name text not null,
  source_service text not null,
  source_module text not null,
  entity_type text,
  entity_id bigint,
  partition_key text,
  correlation_id text,
  causation_id text,
  actor_type text,
  actor_id bigint,
  payload jsonb not null,
  metadata jsonb,
  emitted_at timestamptz not null default now(),
  processed_state text not null default 'pending',
  created_at timestamptz not null default now()
);

create index if not exists idx_domain_events_topic
  on governance.domain_events(topic_name, emitted_at desc);

create index if not exists idx_domain_events_processed_state
  on governance.domain_events(processed_state);

create table if not exists governance.event_subscriptions (
  id bigserial primary key,
  event_name text not null,
  subscriber_service text not null,
  subscriber_module text not null,
  active boolean not null default true,
  config_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(event_name, subscriber_service, subscriber_module)
);

create table if not exists governance.event_deliveries (
  id bigserial primary key,
  domain_event_id bigint not null references governance.domain_events(id) on delete cascade,
  subscription_id bigint not null references governance.event_subscriptions(id) on delete cascade,
  consumer_group_name text not null,
  delivery_attempt integer not null default 1,
  delivered_at timestamptz,
  success boolean not null default false,
  duplicate_processed boolean not null default false,
  response_payload jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(domain_event_id, consumer_group_name)
);

create table if not exists governance.workflows (
  id bigserial primary key,
  workflow_code text not null unique,
  workflow_name text not null,
  entity_type text,
  active boolean not null default true,
  definition_payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists governance.workflow_instances (
  id bigserial primary key,
  public_id uuid not null default governance.generate_public_id(),
  workflow_id bigint not null references governance.workflows(id) on delete cascade,
  entity_type text not null,
  entity_id bigint not null,
  current_step_code text,
  state text not null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_workflow_instances_entity
  on governance.workflow_instances(entity_type, entity_id);

create table if not exists governance.workflow_steps (
  id bigserial primary key,
  workflow_id bigint not null references governance.workflows(id) on delete cascade,
  step_code text not null,
  step_name text not null,
  step_order integer not null,
  step_type text,
  config_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(workflow_id, step_code)
);

create table if not exists governance.workflow_step_executions (
  id bigserial primary key,
  workflow_instance_id bigint not null references governance.workflow_instances(id) on delete cascade,
  workflow_step_id bigint not null references governance.workflow_steps(id) on delete cascade,
  executed_at timestamptz not null default now(),
  executed_by_user_id bigint references governance.users_profile(id),
  outcome text,
  payload jsonb,
  created_at timestamptz not null default now()
);

create table if not exists governance.validations_log (
  id bigserial primary key,
  entity_type text,
  entity_id bigint,
  action_name text,
  validator_code text not null,
  result text not null,
  message text,
  payload jsonb,
  validated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists governance.feature_flags (
  id bigserial primary key,
  flag_code text not null unique,
  flag_name text not null,
  active boolean not null default false,
  rollout_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists governance.config_entries (
  id bigserial primary key,
  config_key text not null unique,
  config_value jsonb,
  environment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists governance.queue_jobs (
  id bigserial primary key,
  job_type text not null,
  payload jsonb not null,
  state text not null default 'pending',
  scheduled_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_queue_jobs_state
  on governance.queue_jobs(state, scheduled_at);

create table if not exists governance.health_checks (
  id bigserial primary key,
  service_name text not null,
  endpoint_name text,
  status text not null,
  checked_at timestamptz not null default now(),
  response_time_ms integer,
  payload jsonb,
  created_at timestamptz not null default now()
);

-- =========================================================
-- SECTION 5: COMMERCIAL TABLES
-- =========================================================

create table if not exists commercial.pipeline_stages (
  id bigserial primary key,
  public_id uuid not null default governance.generate_public_id(),
  stage_code text not null unique,
  stage_name text not null,
  stage_order integer not null,
  probability_percent numeric(5,2),
  is_closed_won boolean not null default false,
  is_closed_lost boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists commercial.customers (
  id bigserial primary key,
  public_id uuid not null default governance.generate_public_id(),
  customer_number text not null unique,
  legal_name text not null,
  display_name text not null,
  customer_type text,
  tax_id text,
  phone text,
  email text,
  website text,
  address_line_1 text,
  address_line_2 text,
  city text,
  region text,
  postal_code text,
  country text,
  billing_contact_name text,
  billing_contact_phone text,
  billing_contact_email text,
  account_manager_user_id bigint references governance.users_profile(id),
  status text not null default 'active',
  credit_limit numeric(18,2),
  current_balance numeric(18,2) not null default 0,
  preferred_currency text,
  risk_level text,
  internal_notes text,
  external_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by bigint references governance.users_profile(id),
  updated_by bigint references governance.users_profile(id),
  deleted_at timestamptz
);

create index if not exists idx_customers_status on commercial.customers(status);
create index if not exists idx_customers_account_manager on commercial.customers(account_manager_user_id);

create table if not exists commercial.leads (
  id bigserial primary key,
  public_id uuid not null default governance.generate_public_id(),
  lead_number text not null unique,
  source text not null,
  full_name text,
  company_name text,
  phone text,
  email text,
  address_line_1 text,
  city text,
  region text,
  postal_code text,
  country text,
  interest_type text,
  estimated_value numeric(18,2),
  currency text,
  priority text,
  state text not null default 'New',
  pipeline_stage_id bigint references commercial.pipeline_stages(id),
  assigned_user_id bigint references governance.users_profile(id),
  customer_id bigint references commercial.customers(id),
  won_at timestamptz,
  lost_at timestamptz,
  lost_reason text,
  internal_notes text,
  external_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by bigint references governance.users_profile(id),
  updated_by bigint references governance.users_profile(id)
);

create index if not exists idx_leads_state on commercial.leads(state);
create index if not exists idx_leads_assigned_user on commercial.leads(assigned_user_id);

create table if not exists commercial.crm_activities (
  id bigserial primary key,
  public_id uuid not null default governance.generate_public_id(),
  related_entity_type text not null,
  related_entity_id bigint not null,
  activity_type text not null,
  subject text,
  activity_at timestamptz not null default now(),
  performed_by_user_id bigint references governance.users_profile(id),
  outcome text,
  notes text,
  next_action_at timestamptz,
  next_action_type text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists commercial.opportunities (
  id bigserial primary key,
  public_id uuid not null default governance.generate_public_id(),
  opportunity_number text not null unique,
  lead_id bigint references commercial.leads(id),
  customer_id bigint references commercial.customers(id),
  title text not null,
  description text,
  estimated_value numeric(18,2),
  currency text,
  probability_percent numeric(5,2),
  expected_close_date date,
  state text not null default 'Open',
  owner_user_id bigint references governance.users_profile(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists commercial.quotes (
  id bigserial primary key,
  public_id uuid not null default governance.generate_public_id(),
  quote_number text not null unique,
  customer_id bigint not null references commercial.customers(id),
  lead_id bigint references commercial.leads(id),
  opportunity_id bigint references commercial.opportunities(id),
  valid_until date,
  quote_date date not null default current_date,
  subtotal numeric(18,2) not null default 0,
  discount_total numeric(18,2) not null default 0,
  vat_total numeric(18,2) not null default 0,
  grand_total numeric(18,2) not null default 0,
  margin_estimate numeric(18,2),
  currency text not null default 'ILS',
  pricing_snapshot_id bigint,
  approval_status text not null default 'draft',
  state text not null default 'Draft',
  converted_project_id bigint,
  internal_notes text,
  customer_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by bigint references governance.users_profile(id),
  updated_by bigint references governance.users_profile(id)
);

create table if not exists commercial.quote_lines (
  id bigserial primary key,
  quote_id bigint not null references commercial.quotes(id) on delete cascade,
  line_number integer not null,
  item_type text,
  item_code text,
  description text not null,
  quantity numeric(18,4) not null,
  unit_of_measure text,
  unit_price numeric(18,4) not null,
  discount_percent numeric(9,4) not null default 0,
  discount_amount numeric(18,2) not null default 0,
  line_subtotal numeric(18,2) not null,
  vat_percent numeric(9,4) not null default 0,
  vat_amount numeric(18,2) not null default 0,
  line_total numeric(18,2) not null,
  cost_estimate numeric(18,2),
  margin_amount numeric(18,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(quote_id, line_number)
);

create table if not exists commercial.pricing_snapshots (
  id bigserial primary key,
  quote_id bigint references commercial.quotes(id) on delete cascade,
  pricing_engine_version text,
  snapshot_payload jsonb not null,
  margin_estimate numeric(18,2),
  pricing_notes text,
  created_at timestamptz not null default now(),
  created_by bigint references governance.users_profile(id)
);

alter table commercial.quotes
  add constraint fk_quotes_pricing_snapshot
  foreign key (pricing_snapshot_id)
  references commercial.pricing_snapshots(id);

-- =========================================================
-- SECTION 6: PROCUREMENT TABLES
-- =========================================================

create table if not exists procurement.suppliers (
  id bigserial primary key,
  public_id uuid not null default governance.generate_public_id(),
  supplier_number text not null unique,
  legal_name text not null,
  display_name text,
  supplier_category text,
  tax_id text,
  phone text,
  email text,
  website text,
  address_line_1 text,
  address_line_2 text,
  city text,
  region text,
  postal_code text,
  country text,
  primary_contact_name text,
  primary_contact_phone text,
  primary_contact_email text,
  payment_terms text,
  delivery_terms text,
  preferred_currency text,
  status text not null default 'Active',
  risk_level text,
  performance_score numeric(9,4),
  preferred_supplier boolean not null default false,
  internal_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by bigint references governance.users_profile(id),
  updated_by bigint references governance.users_profile(id),
  deleted_at timestamptz
);

create table if not exists procurement.rfqs (
  id bigserial primary key,
  public_id uuid not null default governance.generate_public_id(),
  rfq_number text not null unique,
  project_id bigint,
  material_request_id bigint,
  requested_date date not null,
  response_deadline date,
  comparison_status text,
  approval_status text not null default 'draft',
  state text not null default 'Draft',
  winning_supplier_id bigint references procurement.suppliers(id),
  internal_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by bigint references governance.users_profile(id),
  updated_by bigint references governance.users_profile(id)
);

create table if not exists procurement.rfq_items (
  id bigserial primary key,
  rfq_id bigint not null references procurement.rfqs(id) on delete cascade,
  line_number integer not null,
  material_id bigint,
  requested_code text,
  description text not null,
  quantity numeric(18,4) not null,
  unit_of_measure text,
  target_delivery_date date,
  technical_spec text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(rfq_id, line_number)
);

create table if not exists procurement.rfq_supplier_invites (
  id bigserial primary key,
  rfq_id bigint not null references procurement.rfqs(id) on delete cascade,
  supplier_id bigint not null references procurement.suppliers(id),
  invited_at timestamptz not null default now(),
  response_status text not null default 'pending',
  responded_at timestamptz,
  notes text,
  unique(rfq_id, supplier_id)
);

create table if not exists procurement.supplier_quotes (
  id bigserial primary key,
  public_id uuid not null default governance.generate_public_id(),
  rfq_id bigint not null references procurement.rfqs(id) on delete cascade,
  supplier_id bigint not null references procurement.suppliers(id),
  quote_reference text,
  quote_date date,
  valid_until date,
  subtotal numeric(18,2) not null default 0,
  vat_total numeric(18,2) not null default 0,
  grand_total numeric(18,2) not null default 0,
  currency text,
  delivery_days_estimate integer,
  payment_terms text,
  quality_score numeric(9,4),
  selected boolean not null default false,
  state text not null default 'submitted',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists procurement.supplier_quote_lines (
  id bigserial primary key,
  supplier_quote_id bigint not null references procurement.supplier_quotes(id) on delete cascade,
  rfq_item_id bigint references procurement.rfq_items(id),
  line_number integer not null,
  material_id bigint,
  description text not null,
  quantity numeric(18,4) not null,
  unit_price numeric(18,4) not null,
  line_subtotal numeric(18,2) not null,
  vat_percent numeric(9,4) not null default 0,
  vat_amount numeric(18,2) not null default 0,
  line_total numeric(18,2) not null,
  delivery_days integer,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists procurement.approvals (
  id bigserial primary key,
  public_id uuid not null default governance.generate_public_id(),
  entity_type text not null,
  entity_id bigint not null,
  approval_type text not null,
  requested_by_user_id bigint references governance.users_profile(id),
  assigned_approver_user_id bigint references governance.users_profile(id),
  state text not null default 'pending',
  requested_at timestamptz not null default now(),
  acted_at timestamptz,
  decision text,
  comments text,
  approval_policy_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists procurement.contracts (
  id bigserial primary key,
  public_id uuid not null default governance.generate_public_id(),
  contract_number text not null unique,
  contract_type text not null,
  customer_id bigint references commercial.customers(id),
  supplier_id bigint references procurement.suppliers(id),
  quote_id bigint references commercial.quotes(id),
  po_id bigint,
  project_id bigint,
  effective_date date,
  expiry_date date,
  contract_value numeric(18,2),
  currency text,
  state text not null default 'draft',
  signed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists procurement.purchase_orders (
  id bigserial primary key,
  public_id uuid not null default governance.generate_public_id(),
  po_number text not null unique,
  supplier_id bigint not null references procurement.suppliers(id),
  project_id bigint,
  rfq_id bigint references procurement.rfqs(id),
  contract_id bigint references procurement.contracts(id),
  order_date date not null default current_date,
  expected_delivery_date date,
  currency text not null default 'ILS',
  subtotal numeric(18,2) not null default 0,
  discount_total numeric(18,2) not null default 0,
  vat_total numeric(18,2) not null default 0,
  grand_total numeric(18,2) not null default 0,
  approval_status text not null default 'draft',
  receiving_status text not null default 'not_received',
  payment_status text not null default 'unpaid',
  state text not null default 'Draft',
  delivery_address text,
  internal_notes text,
  supplier_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by bigint references governance.users_profile(id),
  updated_by bigint references governance.users_profile(id)
);

create table if not exists procurement.purchase_order_lines (
  id bigserial primary key,
  po_id bigint not null references procurement.purchase_orders(id) on delete cascade,
  line_number integer not null,
  material_id bigint,
  supplier_quote_line_id bigint references procurement.supplier_quote_lines(id),
  description text not null,
  quantity_ordered numeric(18,4) not null,
  quantity_received numeric(18,4) not null default 0,
  quantity_open numeric(18,4) not null default 0,
  unit_of_measure text,
  unit_price numeric(18,4) not null,
  discount_percent numeric(9,4) not null default 0,
  line_subtotal numeric(18,2) not null,
  vat_percent numeric(9,4) not null default 0,
  vat_amount numeric(18,2) not null default 0,
  line_total numeric(18,2) not null,
  delivery_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(po_id, line_number)
);

create table if not exists procurement.supplier_invoices (
  id bigserial primary key,
  public_id uuid not null default governance.generate_public_id(),
  supplier_invoice_number text not null,
  supplier_id bigint not null references procurement.suppliers(id),
  po_id bigint references procurement.purchase_orders(id),
  invoice_date date,
  due_date date,
  subtotal numeric(18,2) not null default 0,
  vat_total numeric(18,2) not null default 0,
  grand_total numeric(18,2) not null default 0,
  currency text,
  state text not null default 'draft',
  matched_po boolean not null default false,
  approved_for_payment boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists procurement.returns (
  id bigserial primary key,
  public_id uuid not null default governance.generate_public_id(),
  return_number text not null unique,
  supplier_id bigint not null references procurement.suppliers(id),
  po_id bigint references procurement.purchase_orders(id),
  reason_code text,
  return_date date,
  state text not null default 'Open',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists procurement.warranty_cases (
  id bigserial primary key,
  public_id uuid not null default governance.generate_public_id(),
  warranty_number text not null unique,
  supplier_id bigint references procurement.suppliers(id),
  customer_id bigint references commercial.customers(id),
  po_id bigint references procurement.purchase_orders(id),
  project_id bigint,
  issue_date date,
  description text not null,
  state text not null default 'Open',
  resolution_notes text,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =========================================================
-- SECTION 7: EXECUTION TABLES
-- =========================================================

create table if not exists execution.projects (
  id bigserial primary key,
  public_id uuid not null default governance.generate_public_id(),
  project_number text not null unique,
  project_name text not null,
  customer_id bigint not null references commercial.customers(id),
  quote_id bigint references commercial.quotes(id),
  contract_id bigint references procurement.contracts(id),
  project_type text,
  location_name text,
  address_line_1 text,
  city text,
  region text,
  owner_user_id bigint references governance.users_profile(id),
  budget_amount numeric(18,2) not null default 0,
  actual_cost numeric(18,2) not null default 0,
  billed_amount numeric(18,2) not null default 0,
  collected_amount numeric(18,2) not null default 0,
  progress_percent numeric(9,4) not null default 0,
  priority text,
  planned_start_date date,
  planned_end_date date,
  actual_start_date date,
  actual_end_date date,
  billable boolean not null default true,
  state text not null default 'Planning',
  internal_notes text,
  external_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by bigint references governance.users_profile(id),
  updated_by bigint references governance.users_profile(id)
);

create table if not exists execution.project_phases (
  id bigserial primary key,
  project_id bigint not null references execution.projects(id) on delete cascade,
  phase_code text,
  phase_name text not null,
  phase_order integer not null,
  planned_start_date date,
  planned_end_date date,
  actual_start_date date,
  actual_end_date date,
  progress_percent numeric(9,4) not null default 0,
  state text not null default 'planned',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id, phase_order)
);

create table if not exists execution.project_milestones (
  id bigserial primary key,
  project_id bigint not null references execution.projects(id) on delete cascade,
  phase_id bigint references execution.project_phases(id),
  milestone_name text not null,
  due_date date,
  achieved_at timestamptz,
  state text not null default 'pending',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists execution.work_orders (
  id bigserial primary key,
  public_id uuid not null default governance.generate_public_id(),
  work_order_number text not null unique,
  project_id bigint not null references execution.projects(id) on delete cascade,
  title text not null,
  description text,
  location_name text,
  required_start_date date,
  required_end_date date,
  actual_start_at timestamptz,
  actual_end_at timestamptz,
  progress_percent numeric(9,4) not null default 0,
  quality_status text,
  signature_status text,
  state text not null default 'Open',
  owner_user_id bigint references governance.users_profile(id),
  assigned_team_name text,
  internal_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by bigint references governance.users_profile(id),
  updated_by bigint references governance.users_profile(id)
);

create table if not exists execution.work_order_tasks (
  id bigserial primary key,
  work_order_id bigint not null references execution.work_orders(id) on delete cascade,
  task_name text not null,
  description text,
  sequence_order integer,
  assignee_user_id bigint references governance.users_profile(id),
  due_date date,
  completed_at timestamptz,
  state text not null default 'Open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists execution.tasks (
  id bigserial primary key,
  public_id uuid not null default governance.generate_public_id(),
  task_number text not null unique,
  title text not null,
  description text,
  priority text,
  due_date date,
  assignee_user_id bigint references governance.users_profile(id),
  assignee_employee_id bigint,
  linked_entity_type text,
  linked_entity_id bigint,
  state text not null default 'Open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by bigint references governance.users_profile(id),
  updated_by bigint references governance.users_profile(id)
);

create table if not exists execution.task_dependencies (
  id bigserial primary key,
  predecessor_task_id bigint not null references execution.tasks(id) on delete cascade,
  successor_task_id bigint not null references execution.tasks(id) on delete cascade,
  dependency_type text,
  created_at timestamptz not null default now(),
  unique(predecessor_task_id, successor_task_id)
);

create table if not exists execution.logistics_orders (
  id bigserial primary key,
  public_id uuid not null default governance.generate_public_id(),
  logistics_number text not null unique,
  project_id bigint references execution.projects(id),
  work_order_id bigint references execution.work_orders(id),
  warehouse_id bigint,
  destination_name text,
  destination_address text,
  scheduled_at timestamptz,
  delivered_at timestamptz,
  state text not null default 'planned',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists execution.delivery_events (
  id bigserial primary key,
  project_id bigint references execution.projects(id),
  work_order_id bigint references execution.work_orders(id),
  logistics_order_id bigint references execution.logistics_orders(id),
  delivered_at timestamptz not null,
  delivered_by_user_id bigint references governance.users_profile(id),
  received_by_name text,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists execution.installation_events (
  id bigserial primary key,
  project_id bigint references execution.projects(id),
  work_order_id bigint references execution.work_orders(id),
  installed_at timestamptz not null,
  installed_by_user_id bigint references governance.users_profile(id),
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists execution.signatures (
  id bigserial primary key,
  public_id uuid not null default governance.generate_public_id(),
  entity_type text not null,
  entity_id bigint not null,
  signer_name text not null,
  signer_role text,
  signed_at timestamptz not null,
  signature_payload jsonb,
  document_id bigint,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists execution.alerts (
  id bigserial primary key,
  public_id uuid not null default governance.generate_public_id(),
  alert_number text not null unique,
  category text not null,
  severity text not null,
  parent_entity_type text,
  parent_entity_id bigint,
  title text not null,
  description text,
  assigned_to_user_id bigint references governance.users_profile(id),
  source_ai_insight_id bigint,
  source_anomaly_case_id bigint,
  state text not null default 'Open',
  acknowledged_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =========================================================
-- SECTION 8: INVENTORY TABLES
-- =========================================================

create table if not exists inventory.material_categories (
  id bigserial primary key,
  category_code text not null unique,
  category_name text not null,
  parent_category_id bigint references inventory.material_categories(id),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists inventory.materials (
  id bigserial primary key,
  public_id uuid not null default governance.generate_public_id(),
  material_code text not null unique,
  name text not null,
  description text,
  category_id bigint references inventory.material_categories(id),
  unit_of_measure text,
  preferred_supplier_id bigint references procurement.suppliers(id),
  standard_cost numeric(18,4) not null default 0,
  reorder_point numeric(18,4),
  safety_stock numeric(18,4),
  barcode text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by bigint references governance.users_profile(id),
  updated_by bigint references governance.users_profile(id)
);

create table if not exists inventory.warehouses (
  id bigserial primary key,
  public_id uuid not null default governance.generate_public_id(),
  warehouse_code text not null unique,
  name text not null,
  location_name text,
  address_line_1 text,
  city text,
  manager_user_id bigint references governance.users_profile(id),
  warehouse_type text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists inventory.inventory (
  id bigserial primary key,
  material_id bigint not null references inventory.materials(id),
  warehouse_id bigint not null references inventory.warehouses(id),
  on_hand_qty numeric(18,4) not null default 0,
  reserved_qty numeric(18,4) not null default 0,
  available_qty numeric(18,4) not null default 0,
  average_cost numeric(18,4) not null default 0,
  last_counted_at timestamptz,
  last_movement_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(material_id, warehouse_id)
);

create table if not exists inventory.inventory_receipts (
  id bigserial primary key,
  public_id uuid not null default governance.generate_public_id(),
  receipt_number text not null unique,
  po_id bigint references procurement.purchase_orders(id),
  po_line_id bigint references procurement.purchase_order_lines(id),
  material_id bigint not null references inventory.materials(id),
  warehouse_id bigint not null references inventory.warehouses(id),
  quantity_received numeric(18,4) not null,
  unit_cost numeric(18,4),
  receipt_date date not null,
  batch_reference text,
  received_by_user_id bigint references governance.users_profile(id),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists inventory.inventory_issues (
  id bigserial primary key,
  public_id uuid not null default governance.generate_public_id(),
  issue_number text not null unique,
  project_id bigint references execution.projects(id),
  work_order_id bigint references execution.work_orders(id),
  material_id bigint not null references inventory.materials(id),
  warehouse_id bigint not null references inventory.warehouses(id),
  quantity_issued numeric(18,4) not null,
  issue_date date not null,
  issued_by_user_id bigint references governance.users_profile(id),
  cost_per_unit numeric(18,4),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists inventory.inventory_transfers (
  id bigserial primary key,
  public_id uuid not null default governance.generate_public_id(),
  transfer_number text not null unique,
  material_id bigint not null references inventory.materials(id),
  from_warehouse_id bigint not null references inventory.warehouses(id),
  to_warehouse_id bigint not null references inventory.warehouses(id),
  quantity_transferred numeric(18,4) not null,
  transfer_date date not null,
  transferred_by_user_id bigint references governance.users_profile(id),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists inventory.inventory_reservations (
  id bigserial primary key,
  material_id bigint not null references inventory.materials(id),
  warehouse_id bigint not null references inventory.warehouses(id),
  project_id bigint references execution.projects(id),
  work_order_id bigint references execution.work_orders(id),
  reserved_qty numeric(18,4) not null,
  reserved_at timestamptz not null default now(),
  reserved_by_user_id bigint references governance.users_profile(id),
  released_at timestamptz,
  state text not null default 'Reserved',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists inventory.stock_counts (
  id bigserial primary key,
  public_id uuid not null default governance.generate_public_id(),
  count_number text not null unique,
  warehouse_id bigint not null references inventory.warehouses(id),
  counted_at timestamptz not null,
  counted_by_user_id bigint references governance.users_profile(id),
  state text not null default 'Open',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists inventory.stock_count_lines (
  id bigserial primary key,
  stock_count_id bigint not null references inventory.stock_counts(id) on delete cascade,
  material_id bigint not null references inventory.materials(id),
  system_qty numeric(18,4) not null,
  counted_qty numeric(18,4) not null,
  variance_qty numeric(18,4) not null,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists inventory.material_requests (
  id bigserial primary key,
  public_id uuid not null default governance.generate_public_id(),
  request_number text not null unique,
  project_id bigint references execution.projects(id),
  work_order_id bigint references execution.work_orders(id),
  requested_by_user_id bigint references governance.users_profile(id),
  requested_date date not null,
  needed_by_date date,
  state text not null default 'Open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists inventory.material_request_lines (
  id bigserial primary key,
  material_request_id bigint not null references inventory.material_requests(id) on delete cascade,
  material_id bigint not null references inventory.materials(id),
  requested_qty numeric(18,4) not null,
  reserved_qty numeric(18,4) not null default 0,
  procured_qty numeric(18,4) not null default 0,
  needed_by_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists inventory.barcode_scans (
  id bigserial primary key,
  barcode_value text not null,
  material_id bigint references inventory.materials(id),
  warehouse_id bigint references inventory.warehouses(id),
  scan_type text,
  scanned_at timestamptz not null default now(),
  scanned_by_user_id bigint references governance.users_profile(id),
  payload jsonb,
  created_at timestamptz not null default now()
);

create table if not exists inventory.manufacturing_batches (
  id bigserial primary key,
  public_id uuid not null default governance.generate_public_id(),
  batch_number text not null unique,
  project_id bigint references execution.projects(id),
  work_order_id bigint references execution.work_orders(id),
  started_at timestamptz,
  completed_at timestamptz,
  state text not null default 'Open',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =========================================================
-- SECTION 9: WORKFORCE TABLES
-- =========================================================

create table if not exists workforce.employers (
  id bigserial primary key,
  public_id uuid not null default governance.generate_public_id(),
  employer_number text not null unique,
  legal_name text not null,
  tax_id text,
  phone text,
  email text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists workforce.employees (
  id bigserial primary key,
  public_id uuid not null default governance.generate_public_id(),
  employee_number text not null unique,
  full_name text not null,
  phone text,
  email text,
  employer_id bigint not null references workforce.employers(id),
  role_title text,
  department text,
  employment_type text,
  hourly_rate numeric(18,4),
  salary_base numeric(18,2),
  status text not null default 'Active',
  start_date date,
  end_date date,
  national_id text,
  bank_account_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by bigint references governance.users_profile(id),
  updated_by bigint references governance.users_profile(id),
  deleted_at timestamptz
);

create table if not exists workforce.hr_profiles (
  id bigserial primary key,
  employee_id bigint not null unique references workforce.employees(id) on delete cascade,
  emergency_contact_name text,
  emergency_contact_phone text,
  address_line_1 text,
  city text,
  region text,
  postal_code text,
  country text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists workforce.workforce_assignments (
  id bigserial primary key,
  employee_id bigint not null references workforce.employees(id),
  project_id bigint references execution.projects(id),
  work_order_id bigint references execution.work_orders(id),
  assigned_at timestamptz not null default now(),
  released_at timestamptz,
  assignment_role text,
  state text not null default 'Active',
  assigned_by_user_id bigint references governance.users_profile(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists workforce.attendance (
  id bigserial primary key,
  public_id uuid not null default governance.generate_public_id(),
  attendance_number text not null unique,
  employee_id bigint not null references workforce.employees(id),
  project_id bigint references execution.projects(id),
  work_order_id bigint references execution.work_orders(id),
  work_date date not null,
  start_time timestamptz,
  end_time timestamptz,
  regular_hours numeric(9,4) not null default 0,
  overtime_hours numeric(9,4) not null default 0,
  source text,
  approval_status text not null default 'pending',
  state text not null default 'Submitted',
  approved_by_user_id bigint references governance.users_profile(id),
  approved_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists workforce.payroll_runs (
  id bigserial primary key,
  public_id uuid not null default governance.generate_public_id(),
  payroll_run_number text not null unique,
  payroll_period_start date not null,
  payroll_period_end date not null,
  employer_id bigint references workforce.employers(id),
  state text not null default 'Draft',
  calculated_at timestamptz,
  approved_at timestamptz,
  exported_at timestamptz,
  paid_at timestamptz,
  created_by bigint references governance.users_profile(id),
  approved_by bigint references governance.users_profile(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists workforce.payroll_entries (
  id bigserial primary key,
  payroll_run_id bigint not null references workforce.payroll_runs(id) on delete cascade,
  employee_id bigint not null references workforce.employees(id),
  gross_pay numeric(18,2) not null default 0,
  deductions numeric(18,2) not null default 0,
  net_pay numeric(18,2) not null default 0,
  pension_total numeric(18,2) not null default 0,
  overtime_pay numeric(18,2) not null default 0,
  attendance_hours numeric(18,4) not null default 0,
  expense_reimbursements numeric(18,2) not null default 0,
  state text not null default 'Calculated',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(payroll_run_id, employee_id)
);

create table if not exists workforce.wage_slips (
  id bigserial primary key,
  public_id uuid not null default governance.generate_public_id(),
  payroll_entry_id bigint not null references workforce.payroll_entries(id) on delete cascade,
  employee_id bigint not null references workforce.employees(id),
  slip_number text not null unique,
  slip_date date not null,
  gross_pay numeric(18,2) not null,
  net_pay numeric(18,2) not null,
  document_id bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists workforce.pension_records (
  id bigserial primary key,
  payroll_entry_id bigint references workforce.payroll_entries(id) on delete cascade,
  employee_id bigint not null references workforce.employees(id),
  contribution_date date not null,
  employee_contribution numeric(18,2) not null default 0,
  employer_contribution numeric(18,2) not null default 0,
  fund_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists workforce.employee_expenses (
  id bigserial primary key,
  public_id uuid not null default governance.generate_public_id(),
  expense_number text not null unique,
  employee_id bigint not null references workforce.employees(id),
  project_id bigint references execution.projects(id),
  category text,
  amount numeric(18,2) not null,
  currency text,
  expense_date date not null,
  approval_status text not null default 'pending',
  reimbursement_status text not null default 'pending',
  document_id bigint,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists workforce.shifts (
  id bigserial primary key,
  employee_id bigint not null references workforce.employees(id),
  project_id bigint references execution.projects(id),
  work_order_id bigint references execution.work_orders(id),
  shift_start timestamptz not null,
  shift_end timestamptz,
  shift_type text,
  state text not null default 'Scheduled',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =========================================================
-- SECTION 10: FINANCE TABLES
-- =========================================================

create table if not exists finance.invoices (
  id bigserial primary key,
  public_id uuid not null default governance.generate_public_id(),
  invoice_number text not null unique,
  invoice_type text not null,
  customer_id bigint references commercial.customers(id),
  supplier_id bigint references procurement.suppliers(id),
  project_id bigint references execution.projects(id),
  po_id bigint references procurement.purchase_orders(id),
  issue_date date,
  due_date date,
  subtotal numeric(18,2) not null default 0,
  discount_total numeric(18,2) not null default 0,
  vat_total numeric(18,2) not null default 0,
  grand_total numeric(18,2) not null default 0,
  paid_total numeric(18,2) not null default 0,
  balance_due numeric(18,2) not null default 0,
  currency text,
  state text not null default 'Draft',
  sent_at timestamptz,
  cancelled_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by bigint references governance.users_profile(id),
  updated_by bigint references governance.users_profile(id)
);

create table if not exists finance.invoice_lines (
  id bigserial primary key,
  invoice_id bigint not null references finance.invoices(id) on delete cascade,
  line_number integer not null,
  description text not null,
  quantity numeric(18,4) not null,
  unit_price numeric(18,4) not null,
  discount_percent numeric(9,4) not null default 0,
  line_subtotal numeric(18,2) not null,
  vat_percent numeric(9,4) not null default 0,
  vat_amount numeric(18,2) not null default 0,
  line_total numeric(18,2) not null,
  linked_entity_type text,
  linked_entity_id bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(invoice_id, line_number)
);

create table if not exists finance.receipts (
  id bigserial primary key,
  public_id uuid not null default governance.generate_public_id(),
  receipt_number text not null unique,
  customer_id bigint references commercial.customers(id),
  receipt_date date not null,
  amount numeric(18,2) not null,
  currency text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists finance.payments (
  id bigserial primary key,
  public_id uuid not null default governance.generate_public_id(),
  payment_number text not null unique,
  invoice_id bigint not null references finance.invoices(id),
  customer_id bigint references commercial.customers(id),
  supplier_id bigint references procurement.suppliers(id),
  payment_date date not null,
  payment_method text,
  amount numeric(18,2) not null,
  currency text,
  bank_match_status text,
  gl_status text,
  state text not null default 'Posted',
  reference_number text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by bigint references governance.users_profile(id),
  updated_by bigint references governance.users_profile(id)
);

create table if not exists finance.gl_transactions (
  id bigserial primary key,
  public_id uuid not null default governance.generate_public_id(),
  transaction_number text not null unique,
  entry_date date not null,
  account_code text not null,
  debit_amount numeric(18,2) not null default 0,
  credit_amount numeric(18,2) not null default 0,
  currency text,
  linked_entity_type text,
  linked_entity_id bigint,
  description text,
  created_at timestamptz not null default now(),
  created_by bigint references governance.users_profile(id)
);

create table if not exists finance.vat_records (
  id bigserial primary key,
  invoice_id bigint references finance.invoices(id),
  tax_period text not null,
  vat_type text,
  taxable_amount numeric(18,2) not null,
  vat_amount numeric(18,2) not null,
  filed boolean not null default false,
  filed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists finance.tax_records (
  id bigserial primary key,
  invoice_id bigint references finance.invoices(id),
  tax_type text not null,
  tax_period text not null,
  taxable_amount numeric(18,2) not null,
  tax_amount numeric(18,2) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists finance.tax_exports (
  id bigserial primary key,
  public_id uuid not null default governance.generate_public_id(),
  export_number text not null unique,
  export_type text not null,
  tax_period text not null,
  file_reference text,
  exported_at timestamptz,
  exported_by_user_id bigint references governance.users_profile(id),
  state text not null default 'Generated',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists finance.bank_files (
  id bigserial primary key,
  public_id uuid not null default governance.generate_public_id(),
  file_name text not null,
  bank_account_reference text,
  imported_at timestamptz,
  imported_by_user_id bigint references governance.users_profile(id),
  state text not null default 'Imported',
  document_id bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists finance.bank_matches (
  id bigserial primary key,
  payment_id bigint references finance.payments(id),
  bank_file_id bigint references finance.bank_files(id),
  external_reference text,
  matched_amount numeric(18,2) not null,
  matched_at timestamptz,
  matched_by_user_id bigint references governance.users_profile(id),
  state text not null default 'Matched',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists finance.cashflow_entries (
  id bigserial primary key,
  public_id uuid not null default governance.generate_public_id(),
  entry_date date not null,
  entry_type text not null,
  amount numeric(18,2) not null,
  currency text,
  linked_entity_type text,
  linked_entity_id bigint,
  forecasted boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists finance.budget_entries (
  id bigserial primary key,
  project_id bigint references execution.projects(id),
  budget_category text not null,
  budget_period text,
  budget_amount numeric(18,2) not null,
  actual_amount numeric(18,2) not null default 0,
  variance_amount numeric(18,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists finance.costing_entries (
  id bigserial primary key,
  project_id bigint references execution.projects(id),
  work_order_id bigint references execution.work_orders(id),
  material_id bigint references inventory.materials(id),
  employee_id bigint references workforce.employees(id),
  cost_type text not null,
  source_entity_type text,
  source_entity_id bigint,
  cost_amount numeric(18,2) not null,
  cost_date date not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists finance.fx_rates (
  id bigserial primary key,
  currency_code text not null,
  rate_date date not null,
  exchange_rate numeric(18,8) not null,
  source_name text,
  created_at timestamptz not null default now(),
  unique(currency_code, rate_date)
);

create table if not exists finance.consolidation_entries (
  id bigserial primary key,
  consolidation_period text not null,
  entity_name text not null,
  metric_code text not null,
  metric_value numeric(18,2) not null,
  created_at timestamptz not null default now()
);

create table if not exists finance.collection_cases (
  id bigserial primary key,
  public_id uuid not null default governance.generate_public_id(),
  case_number text not null unique,
  invoice_id bigint not null references finance.invoices(id),
  customer_id bigint not null references commercial.customers(id),
  opened_at timestamptz not null default now(),
  assigned_to_user_id bigint references governance.users_profile(id),
  next_followup_at timestamptz,
  risk_score numeric(9,4),
  state text not null default 'Open',
  notes text,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists finance.expenses (
  id bigserial primary key,
  public_id uuid not null default governance.generate_public_id(),
  expense_number text not null unique,
  category text,
  supplier_id bigint references procurement.suppliers(id),
  employee_id bigint references workforce.employees(id),
  project_id bigint references execution.projects(id),
  amount numeric(18,2) not null,
  currency text,
  expense_date date not null,
  approval_status text not null default 'pending',
  reimbursement_status text,
  notes text,
  document_id bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists finance.annual_tax_reports (
  id bigserial primary key,
  public_id uuid not null default governance.generate_public_id(),
  report_year integer not null unique,
  status text not null default 'draft',
  generated_at timestamptz,
  approved_at timestamptz,
  exported_at timestamptz,
  document_id bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =========================================================
-- SECTION 11: DOCS TABLES
-- =========================================================

create table if not exists docs.documents (
  id bigserial primary key,
  public_id uuid not null default governance.generate_public_id(),
  document_number text not null unique,
  filename text not null,
  original_filename text,
  file_type text,
  mime_type text,
  file_size_bytes bigint,
  storage_path text,
  document_type text,
  parent_entity_type text,
  parent_entity_id bigint,
  classification_status text,
  ocr_status text,
  signature_status text,
  checksum text,
  uploaded_by_user_id bigint references governance.users_profile(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists docs.document_classifications (
  id bigserial primary key,
  document_id bigint not null references docs.documents(id) on delete cascade,
  classification_label text not null,
  confidence_score numeric(9,4),
  classified_by text,
  classified_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists docs.ocr_results (
  id bigserial primary key,
  document_id bigint not null references docs.documents(id) on delete cascade,
  extracted_text text,
  structured_payload jsonb,
  confidence_score numeric(9,4),
  processed_at timestamptz not null default now(),
  processed_by_engine text,
  created_at timestamptz not null default now()
);

create table if not exists docs.attachments (
  id bigserial primary key,
  document_id bigint not null references docs.documents(id) on delete cascade,
  entity_type text not null,
  entity_id bigint not null,
  attached_at timestamptz not null default now(),
  attached_by_user_id bigint references governance.users_profile(id)
);

create table if not exists docs.print_jobs (
  id bigserial primary key,
  public_id uuid not null default governance.generate_public_id(),
  document_id bigint references docs.documents(id),
  entity_type text,
  entity_id bigint,
  printer_name text,
  status text not null default 'queued',
  requested_by_user_id bigint references governance.users_profile(id),
  requested_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists docs.scan_sessions (
  id bigserial primary key,
  public_id uuid not null default governance.generate_public_id(),
  session_number text not null unique,
  scanner_name text,
  initiated_by_user_id bigint references governance.users_profile(id),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  state text not null default 'Open',
  created_at timestamptz not null default now()
);

-- =========================================================
-- SECTION 12: COMMS TABLES
-- =========================================================

create table if not exists comms.portal_users (
  id bigserial primary key,
  public_id uuid not null default governance.generate_public_id(),
  auth_user_id uuid,
  portal_type text not null,
  email text,
  phone text,
  password_hash text,
  customer_id bigint references commercial.customers(id),
  supplier_id bigint references procurement.suppliers(id),
  tenant_reference text,
  display_name text not null,
  status text not null default 'active',
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists commercial.customer_portal_accounts (
  id bigserial primary key,
  customer_id bigint not null references commercial.customers(id) on delete cascade,
  portal_user_id bigint not null references comms.portal_users(id) on delete cascade,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(customer_id, portal_user_id)
);

create table if not exists procurement.supplier_portal_accounts (
  id bigserial primary key,
  supplier_id bigint not null references procurement.suppliers(id) on delete cascade,
  portal_user_id bigint not null references comms.portal_users(id) on delete cascade,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(supplier_id, portal_user_id)
);

create table if not exists comms.notifications (
  id bigserial primary key,
  public_id uuid not null default governance.generate_public_id(),
  user_id bigint references governance.users_profile(id),
  portal_user_id bigint references comms.portal_users(id),
  notification_type text not null,
  title text not null,
  body text,
  severity text,
  linked_entity_type text,
  linked_entity_id bigint,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists comms.comms_threads (
  id bigserial primary key,
  public_id uuid not null default governance.generate_public_id(),
  thread_type text,
  subject text,
  linked_entity_type text,
  linked_entity_id bigint,
  status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists comms.email_messages (
  id bigserial primary key,
  public_id uuid not null default governance.generate_public_id(),
  thread_id bigint references comms.comms_threads(id),
  from_address text,
  to_addresses text,
  cc_addresses text,
  bcc_addresses text,
  subject text,
  body_text text,
  body_html text,
  direction text,
  sent_at timestamptz,
  delivery_status text,
  linked_entity_type text,
  linked_entity_id bigint,
  created_at timestamptz not null default now()
);

create table if not exists comms.sms_messages (
  id bigserial primary key,
  thread_id bigint references comms.comms_threads(id),
  phone_number text not null,
  message_body text not null,
  direction text,
  sent_at timestamptz,
  delivery_status text,
  linked_entity_type text,
  linked_entity_id bigint,
  created_at timestamptz not null default now()
);

create table if not exists comms.whatsapp_messages (
  id bigserial primary key,
  thread_id bigint references comms.comms_threads(id),
  phone_number text not null,
  message_body text not null,
  direction text,
  sent_at timestamptz,
  delivery_status text,
  linked_entity_type text,
  linked_entity_id bigint,
  created_at timestamptz not null default now()
);

create table if not exists comms.chatbot_sessions (
  id bigserial primary key,
  public_id uuid not null default governance.generate_public_id(),
  user_id bigint references governance.users_profile(id),
  portal_user_id bigint references comms.portal_users(id),
  linked_entity_type text,
  linked_entity_id bigint,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  state text not null default 'Open',
  transcript text,
  created_at timestamptz not null default now()
);

create table if not exists comms.support_tickets (
  id bigserial primary key,
  public_id uuid not null default governance.generate_public_id(),
  ticket_number text not null unique,
  customer_id bigint references commercial.customers(id),
  supplier_id bigint references procurement.suppliers(id),
  portal_user_id bigint references comms.portal_users(id),
  title text not null,
  description text,
  priority text,
  assigned_to_user_id bigint references governance.users_profile(id),
  state text not null default 'Open',
  opened_at timestamptz not null default now(),
  resolved_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists comms.help_articles (
  id bigserial primary key,
  public_id uuid not null default governance.generate_public_id(),
  article_code text not null unique,
  title text not null,
  body text not null,
  category text,
  status text not null default 'draft',
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =========================================================
-- SECTION 13: INTELLIGENCE TABLES
-- =========================================================

create table if not exists intelligence.ai_insights (
  id bigserial primary key,
  public_id uuid not null default governance.generate_public_id(),
  insight_number text not null unique,
  parent_entity_type text not null,
  parent_entity_id bigint not null,
  category text,
  confidence_score numeric(9,4),
  severity text,
  recommendation_text text,
  recommended_action text,
  consumed_status text not null default 'new',
  state text not null default 'New',
  generated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists intelligence.anomaly_cases (
  id bigserial primary key,
  public_id uuid not null default governance.generate_public_id(),
  anomaly_number text not null unique,
  parent_entity_type text not null,
  parent_entity_id bigint not null,
  anomaly_type text not null,
  anomaly_score numeric(9,4),
  severity text,
  explanation text,
  state text not null default 'Open',
  generated_at timestamptz not null default now(),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists intelligence.forecast_models (
  id bigserial primary key,
  public_id uuid not null default governance.generate_public_id(),
  model_number text not null unique,
  forecast_domain text not null,
  parent_entity_type text,
  parent_entity_id bigint,
  period_start date,
  period_end date,
  forecast_payload jsonb not null,
  model_version text,
  state text not null default 'Generated',
  generated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists intelligence.quality_scores (
  id bigserial primary key,
  parent_entity_type text not null,
  parent_entity_id bigint not null,
  score_type text not null,
  score_value numeric(9,4) not null,
  scored_at timestamptz not null default now(),
  explanation text,
  created_at timestamptz not null default now()
);

create table if not exists intelligence.trend_signals (
  id bigserial primary key,
  signal_type text not null,
  parent_entity_type text,
  parent_entity_id bigint,
  signal_value numeric(18,4),
  payload jsonb,
  generated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists intelligence.seasonality_patterns (
  id bigserial primary key,
  pattern_type text not null,
  parent_entity_type text,
  parent_entity_id bigint,
  pattern_payload jsonb not null,
  generated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists intelligence.decision_recommendations (
  id bigserial primary key,
  public_id uuid not null default governance.generate_public_id(),
  recommendation_number text not null unique,
  parent_entity_type text not null,
  parent_entity_id bigint not null,
  recommendation_type text not null,
  recommendation_text text not null,
  priority text,
  confidence_score numeric(9,4),
  action_code text,
  state text not null default 'New',
  generated_at timestamptz not null default now(),
  actioned_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =========================================================
-- SECTION 14: ANALYTICS READ MODELS
-- =========================================================

create table if not exists analytics.rm_executive_summary (
  id bigserial primary key,
  snapshot_date date not null,
  total_revenue numeric(18,2) not null default 0,
  open_projects_count integer not null default 0,
  overdue_collections_amount numeric(18,2) not null default 0,
  procurement_bottlenecks_count integer not null default 0,
  payroll_risk_count integer not null default 0,
  inventory_shortage_count integer not null default 0,
  open_alerts_count integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists analytics.rm_operations_summary (
  id bigserial primary key,
  snapshot_date date not null,
  active_work_orders integer not null default 0,
  delayed_work_orders integer not null default 0,
  avg_project_progress numeric(9,4) not null default 0,
  open_tasks integer not null default 0,
  material_shortages integer not null default 0,
  active_logistics_orders integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists analytics.rm_procurement_summary (
  id bigserial primary key,
  snapshot_date date not null,
  open_rfqs integer not null default 0,
  pending_approvals integer not null default 0,
  overdue_purchase_orders integer not null default 0,
  received_today_count integer not null default 0,
  supplier_risk_count integer not null default 0,
  estimated_savings numeric(18,2) not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists analytics.rm_finance_summary (
  id bigserial primary key,
  snapshot_date date not null,
  ar_total numeric(18,2) not null default 0,
  ap_total numeric(18,2) not null default 0,
  overdue_amount numeric(18,2) not null default 0,
  unreconciled_payments_count integer not null default 0,
  vat_liability numeric(18,2) not null default 0,
  cashflow_position numeric(18,2) not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists analytics.rm_workforce_summary (
  id bigserial primary key,
  snapshot_date date not null,
  active_employees integer not null default 0,
  missing_attendance_count integer not null default 0,
  payroll_pending_count integer not null default 0,
  overtime_alerts_count integer not null default 0,
  pending_reimbursements_amount numeric(18,2) not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists analytics.rm_ai_summary (
  id bigserial primary key,
  snapshot_date date not null,
  open_anomalies_count integer not null default 0,
  new_insights_count integer not null default 0,
  high_risk_recommendations_count integer not null default 0,
  forecast_models_published_count integer not null default 0,
  quality_scores_below_threshold_count integer not null default 0,
  created_at timestamptz not null default now()
);

-- =========================================================
-- SECTION 15: TRIGGERS FOR updated_at
-- =========================================================

create trigger trg_users_profile_updated_at
before update on governance.users_profile
for each row execute function governance.set_updated_at();

create trigger trg_roles_updated_at
before update on governance.roles
for each row execute function governance.set_updated_at();

create trigger trg_permissions_updated_at
before update on governance.permissions
for each row execute function governance.set_updated_at();

create trigger trg_customers_updated_at
before update on commercial.customers
for each row execute function governance.set_updated_at();

create trigger trg_leads_updated_at
before update on commercial.leads
for each row execute function governance.set_updated_at();

create trigger trg_quotes_updated_at
before update on commercial.quotes
for each row execute function governance.set_updated_at();

create trigger trg_quote_lines_updated_at
before update on commercial.quote_lines
for each row execute function governance.set_updated_at();

create trigger trg_suppliers_updated_at
before update on procurement.suppliers
for each row execute function governance.set_updated_at();

create trigger trg_rfqs_updated_at
before update on procurement.rfqs
for each row execute function governance.set_updated_at();

create trigger trg_purchase_orders_updated_at
before update on procurement.purchase_orders
for each row execute function governance.set_updated_at();

create trigger trg_projects_updated_at
before update on execution.projects
for each row execute function governance.set_updated_at();

create trigger trg_work_orders_updated_at
before update on execution.work_orders
for each row execute function governance.set_updated_at();

create trigger trg_tasks_updated_at
before update on execution.tasks
for each row execute function governance.set_updated_at();

create trigger trg_materials_updated_at
before update on inventory.materials
for each row execute function governance.set_updated_at();

create trigger trg_warehouses_updated_at
before update on inventory.warehouses
for each row execute function governance.set_updated_at();

create trigger trg_inventory_updated_at
before update on inventory.inventory
for each row execute function governance.set_updated_at();

create trigger trg_employees_updated_at
before update on workforce.employees
for each row execute function governance.set_updated_at();

create trigger trg_attendance_updated_at
before update on workforce.attendance
for each row execute function governance.set_updated_at();

create trigger trg_payroll_runs_updated_at
before update on workforce.payroll_runs
for each row execute function governance.set_updated_at();

create trigger trg_invoices_updated_at
before update on finance.invoices
for each row execute function governance.set_updated_at();

create trigger trg_payments_updated_at
before update on finance.payments
for each row execute function governance.set_updated_at();

create trigger trg_documents_updated_at
before update on docs.documents
for each row execute function governance.set_updated_at();

create trigger trg_ai_insights_updated_at
before update on intelligence.ai_insights
for each row execute function governance.set_updated_at();

create trigger trg_anomaly_cases_updated_at
before update on intelligence.anomaly_cases
for each row execute function governance.set_updated_at();

create trigger trg_forecast_models_updated_at
before update on intelligence.forecast_models
for each row execute function governance.set_updated_at();

-- =========================================================
-- SECTION 16: FINAL HARD RULE COMMENTS
-- =========================================================

comment on schema governance is 'Governance, audit, workflow, events, config, health';
comment on schema commercial is 'Customers, leads, quotes, commercial truth';
comment on schema procurement is 'Suppliers, RFQ, PO, approval, procurement truth';
comment on schema execution is 'Projects, work orders, tasks, logistics, alerts';
comment on schema inventory is 'Materials, warehouses, stock, receipts, reservations';
comment on schema workforce is 'Employees, attendance, payroll, HR';
comment on schema finance is 'Invoices, payments, reconciliation, tax, costing';
comment on schema docs is 'Documents, OCR, attachments, print, scan';
comment on schema comms is 'Portal users, notifications, messaging, support';
comment on schema intelligence is 'AI insights, anomalies, forecasts, recommendations';
comment on schema analytics is 'Read models and control room projections';
