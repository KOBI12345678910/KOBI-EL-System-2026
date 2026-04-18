-- ============================================================
-- FILE: supabase/migrations/00010_enterprise_expansion_30_tables.sql
-- TECHNOKOL UZI ERP 2026
-- 30 ADDITIONAL ENTERPRISE-GRADE TABLES
-- ============================================================

-- ============================================================
-- 01) COMMERCIAL CUSTOMER CONTACTS
-- ============================================================

create table if not exists commercial.customer_contacts (
  id bigserial primary key,
  public_id uuid not null default governance.generate_public_id(),
  customer_id bigint not null references commercial.customers(id) on delete cascade,
  contact_number text not null unique,
  full_name text not null,
  role_title text,
  department text,
  phone text,
  mobile text,
  email text,
  is_primary boolean not null default false,
  receives_quotes boolean not null default false,
  receives_invoices boolean not null default false,
  receives_support_updates boolean not null default false,
  status text not null default 'active',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by bigint references governance.users_profile(id),
  updated_by bigint references governance.users_profile(id)
);

create index if not exists idx_customer_contacts_customer_id
  on commercial.customer_contacts(customer_id);

create index if not exists idx_customer_contacts_email
  on commercial.customer_contacts(email);

create trigger trg_customer_contacts_updated_at
before update on commercial.customer_contacts
for each row execute function governance.set_updated_at();

-- ============================================================
-- 02) PROCUREMENT SUPPLIER CONTACTS
-- ============================================================

create table if not exists procurement.supplier_contacts (
  id bigserial primary key,
  public_id uuid not null default governance.generate_public_id(),
  supplier_id bigint not null references procurement.suppliers(id) on delete cascade,
  contact_number text not null unique,
  full_name text not null,
  role_title text,
  department text,
  phone text,
  mobile text,
  email text,
  is_primary boolean not null default false,
  receives_rfq boolean not null default true,
  receives_po boolean not null default true,
  receives_returns boolean not null default false,
  status text not null default 'active',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by bigint references governance.users_profile(id),
  updated_by bigint references governance.users_profile(id)
);

create index if not exists idx_supplier_contacts_supplier_id
  on procurement.supplier_contacts(supplier_id);

create index if not exists idx_supplier_contacts_email
  on procurement.supplier_contacts(email);

create trigger trg_supplier_contacts_updated_at
before update on procurement.supplier_contacts
for each row execute function governance.set_updated_at();

-- ============================================================
-- 03) EXECUTION PROJECT RISKS
-- ============================================================

create table if not exists execution.project_risks (
  id bigserial primary key,
  public_id uuid not null default governance.generate_public_id(),
  project_id bigint not null references execution.projects(id) on delete cascade,
  risk_number text not null unique,
  risk_category text not null,
  title text not null,
  description text,
  probability_score numeric(9,4) not null default 0,
  impact_score numeric(9,4) not null default 0,
  overall_score numeric(9,4) not null default 0,
  mitigation_plan text,
  owner_user_id bigint references governance.users_profile(id),
  identified_at timestamptz not null default now(),
  due_date date,
  state text not null default 'Open',
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by bigint references governance.users_profile(id),
  updated_by bigint references governance.users_profile(id)
);

create index if not exists idx_project_risks_project_id
  on execution.project_risks(project_id);

create index if not exists idx_project_risks_state
  on execution.project_risks(state);

create trigger trg_project_risks_updated_at
before update on execution.project_risks
for each row execute function governance.set_updated_at();

-- ============================================================
-- 04) EXECUTION PROJECT BLOCKERS
-- ============================================================

create table if not exists execution.project_blockers (
  id bigserial primary key,
  public_id uuid not null default governance.generate_public_id(),
  project_id bigint not null references execution.projects(id) on delete cascade,
  blocker_number text not null unique,
  blocker_type text not null,
  title text not null,
  description text,
  severity text not null default 'medium',
  owner_user_id bigint references governance.users_profile(id),
  opened_at timestamptz not null default now(),
  due_at timestamptz,
  resolved_at timestamptz,
  state text not null default 'Open',
  linked_alert_id bigint references execution.alerts(id),
  linked_risk_id bigint references execution.project_risks(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_project_blockers_project_id
  on execution.project_blockers(project_id);

create index if not exists idx_project_blockers_state
  on execution.project_blockers(state);

create trigger trg_project_blockers_updated_at
before update on execution.project_blockers
for each row execute function governance.set_updated_at();

-- ============================================================
-- 05) EXECUTION TASK COMMENTS
-- ============================================================

create table if not exists execution.task_comments (
  id bigserial primary key,
  public_id uuid not null default governance.generate_public_id(),
  task_id bigint not null references execution.tasks(id) on delete cascade,
  comment_body text not null,
  comment_type text not null default 'note',
  visibility_scope text not null default 'internal',
  author_user_id bigint references governance.users_profile(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_task_comments_task_id
  on execution.task_comments(task_id);

create trigger trg_task_comments_updated_at
before update on execution.task_comments
for each row execute function governance.set_updated_at();

-- ============================================================
-- 06) EXECUTION TASK ATTACHMENTS LINK
-- ============================================================

create table if not exists execution.task_attachments (
  id bigserial primary key,
  task_id bigint not null references execution.tasks(id) on delete cascade,
  document_id bigint not null references docs.documents(id) on delete cascade,
  attached_at timestamptz not null default now(),
  attached_by_user_id bigint references governance.users_profile(id),
  unique(task_id, document_id)
);

create index if not exists idx_task_attachments_task_id
  on execution.task_attachments(task_id);

create index if not exists idx_task_attachments_document_id
  on execution.task_attachments(document_id);

-- ============================================================
-- 07) GOVERNANCE WEBHOOK ENDPOINTS
-- ============================================================

create table if not exists governance.webhook_endpoints (
  id bigserial primary key,
  public_id uuid not null default governance.generate_public_id(),
  endpoint_code text not null unique,
  endpoint_name text not null,
  target_url text not null,
  secret_reference text,
  subscribed_topics jsonb not null default '[]'::jsonb,
  active boolean not null default true,
  retry_policy jsonb,
  timeout_ms integer not null default 10000,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by bigint references governance.users_profile(id),
  updated_by bigint references governance.users_profile(id)
);

create trigger trg_webhook_endpoints_updated_at
before update on governance.webhook_endpoints
for each row execute function governance.set_updated_at();

-- ============================================================
-- 08) GOVERNANCE WEBHOOK DELIVERIES
-- ============================================================

create table if not exists governance.webhook_deliveries (
  id bigserial primary key,
  webhook_endpoint_id bigint not null references governance.webhook_endpoints(id) on delete cascade,
  domain_event_id bigint references governance.domain_events(id) on delete set null,
  payload jsonb not null,
  http_status integer,
  response_body text,
  delivery_attempt integer not null default 1,
  delivered_at timestamptz,
  success boolean not null default false,
  error_message text,
  next_retry_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_webhook_deliveries_endpoint_id
  on governance.webhook_deliveries(webhook_endpoint_id);

create index if not exists idx_webhook_deliveries_success
  on governance.webhook_deliveries(success, next_retry_at);

create trigger trg_webhook_deliveries_updated_at
before update on governance.webhook_deliveries
for each row execute function governance.set_updated_at();

-- ============================================================
-- 09) GOVERNANCE INTEGRATION CONNECTION CREDENTIAL MAP
-- ============================================================

create table if not exists governance.integration_connections (
  id bigserial primary key,
  public_id uuid not null default governance.generate_public_id(),
  connection_code text not null unique,
  provider_name text not null,
  connection_type text not null,
  auth_mode text not null,
  config_payload jsonb not null default '{}'::jsonb,
  secret_reference text,
  status text not null default 'active',
  last_verified_at timestamptz,
  verification_status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by bigint references governance.users_profile(id),
  updated_by bigint references governance.users_profile(id)
);

create trigger trg_integration_connections_updated_at
before update on governance.integration_connections
for each row execute function governance.set_updated_at();

-- ============================================================
-- 10) GOVERNANCE INTEGRATION SYNC LOGS
-- ============================================================

create table if not exists governance.integration_sync_logs (
  id bigserial primary key,
  integration_connection_id bigint not null references governance.integration_connections(id) on delete cascade,
  sync_type text not null,
  direction text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  success boolean not null default false,
  records_processed integer not null default 0,
  records_failed integer not null default 0,
  payload_summary jsonb,
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists idx_integration_sync_logs_connection_id
  on governance.integration_sync_logs(integration_connection_id);

create index if not exists idx_integration_sync_logs_started_at
  on governance.integration_sync_logs(started_at desc);

-- ============================================================
-- 11) GOVERNANCE FEATURE FLAG TARGETING RULES
-- ============================================================

create table if not exists governance.feature_flag_targets (
  id bigserial primary key,
  feature_flag_id bigint not null references governance.feature_flags(id) on delete cascade,
  target_type text not null,
  target_value text not null,
  rollout_percent numeric(5,2),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(feature_flag_id, target_type, target_value)
);

create trigger trg_feature_flag_targets_updated_at
before update on governance.feature_flag_targets
for each row execute function governance.set_updated_at();

-- ============================================================
-- 12) GOVERNANCE USER PREFERENCES
-- ============================================================

create table if not exists governance.user_preferences (
  id bigserial primary key,
  user_id bigint not null unique references governance.users_profile(id) on delete cascade,
  theme text,
  language text,
  timezone text,
  density_mode text,
  homepage_route text,
  dashboard_layout jsonb,
  notification_preferences jsonb,
  ai_preferences jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_user_preferences_updated_at
before update on governance.user_preferences
for each row execute function governance.set_updated_at();

-- ============================================================
-- 13) GOVERNANCE SAVED FILTERS
-- ============================================================

create table if not exists governance.saved_filters (
  id bigserial primary key,
  public_id uuid not null default governance.generate_public_id(),
  user_id bigint not null references governance.users_profile(id) on delete cascade,
  filter_name text not null,
  route_key text not null,
  filter_payload jsonb not null,
  is_default boolean not null default false,
  is_shared boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_saved_filters_user_route
  on governance.saved_filters(user_id, route_key);

create trigger trg_saved_filters_updated_at
before update on governance.saved_filters
for each row execute function governance.set_updated_at();

-- ============================================================
-- 14) ANALYTICS DASHBOARD DEFINITIONS
-- ============================================================

create table if not exists analytics.dashboard_definitions (
  id bigserial primary key,
  public_id uuid not null default governance.generate_public_id(),
  dashboard_code text not null unique,
  dashboard_name text not null,
  dashboard_scope text not null,
  layout_payload jsonb not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_dashboard_definitions_updated_at
before update on analytics.dashboard_definitions
for each row execute function governance.set_updated_at();

-- ============================================================
-- 15) ANALYTICS DASHBOARD WIDGET DEFINITIONS
-- ============================================================

create table if not exists analytics.dashboard_widgets (
  id bigserial primary key,
  dashboard_definition_id bigint not null references analytics.dashboard_definitions(id) on delete cascade,
  widget_code text not null,
  widget_title text not null,
  widget_type text not null,
  data_source_type text not null,
  data_source_reference text not null,
  position_x integer not null default 0,
  position_y integer not null default 0,
  width_units integer not null default 1,
  height_units integer not null default 1,
  config_payload jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(dashboard_definition_id, widget_code)
);

create trigger trg_dashboard_widgets_updated_at
before update on analytics.dashboard_widgets
for each row execute function governance.set_updated_at();

-- ============================================================
-- 16) ANALYTICS KPI SNAPSHOTS
-- ============================================================

create table if not exists analytics.kpi_snapshots (
  id bigserial primary key,
  snapshot_date date not null,
  kpi_code text not null,
  kpi_scope text not null,
  scope_entity_type text,
  scope_entity_id bigint,
  numeric_value numeric(18,4),
  text_value text,
  payload jsonb,
  created_at timestamptz not null default now(),
  unique(snapshot_date, kpi_code, kpi_scope, scope_entity_type, scope_entity_id)
);

create index if not exists idx_kpi_snapshots_kpi_code_date
  on analytics.kpi_snapshots(kpi_code, snapshot_date desc);

-- ============================================================
-- 17) PROCUREMENT RFQ COMPARISON SNAPSHOTS
-- ============================================================

create table if not exists procurement.rfq_comparison_snapshots (
  id bigserial primary key,
  public_id uuid not null default governance.generate_public_id(),
  rfq_id bigint not null references procurement.rfqs(id) on delete cascade,
  snapshot_version integer not null,
  comparison_payload jsonb not null,
  selected_supplier_id bigint references procurement.suppliers(id),
  notes text,
  created_at timestamptz not null default now(),
  created_by bigint references governance.users_profile(id),
  unique(rfq_id, snapshot_version)
);

create index if not exists idx_rfq_comparison_snapshots_rfq_id
  on procurement.rfq_comparison_snapshots(rfq_id);

-- ============================================================
-- 18) FINANCE BANK RECONCILIATION EXCEPTIONS
-- ============================================================

create table if not exists finance.reconciliation_exceptions (
  id bigserial primary key,
  public_id uuid not null default governance.generate_public_id(),
  exception_number text not null unique,
  bank_file_id bigint references finance.bank_files(id),
  payment_id bigint references finance.payments(id),
  exception_type text not null,
  severity text not null default 'medium',
  description text not null,
  detected_at timestamptz not null default now(),
  resolved_at timestamptz,
  state text not null default 'Open',
  owner_user_id bigint references governance.users_profile(id),
  resolution_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_reconciliation_exceptions_state
  on finance.reconciliation_exceptions(state);

create trigger trg_reconciliation_exceptions_updated_at
before update on finance.reconciliation_exceptions
for each row execute function governance.set_updated_at();

-- ============================================================
-- 19) FINANCE PAYMENT ALLOCATIONS
-- ============================================================

create table if not exists finance.payment_allocations (
  id bigserial primary key,
  payment_id bigint not null references finance.payments(id) on delete cascade,
  invoice_id bigint not null references finance.invoices(id) on delete cascade,
  allocated_amount numeric(18,2) not null,
  allocated_at timestamptz not null default now(),
  allocated_by_user_id bigint references governance.users_profile(id),
  notes text,
  unique(payment_id, invoice_id)
);

create index if not exists idx_payment_allocations_invoice_id
  on finance.payment_allocations(invoice_id);

-- ============================================================
-- 20) WORKFORCE PAYROLL EXPORT BATCHES
-- ============================================================

create table if not exists workforce.payroll_export_batches (
  id bigserial primary key,
  public_id uuid not null default governance.generate_public_id(),
  batch_number text not null unique,
  payroll_run_id bigint not null references workforce.payroll_runs(id) on delete cascade,
  export_type text not null,
  file_reference text,
  row_count integer not null default 0,
  status text not null default 'Generated',
  generated_at timestamptz not null default now(),
  exported_by_user_id bigint references governance.users_profile(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_payroll_export_batches_updated_at
before update on workforce.payroll_export_batches
for each row execute function governance.set_updated_at();

-- ============================================================
-- 21) WORKFORCE PAYROLL EXCEPTIONS
-- ============================================================

create table if not exists workforce.payroll_exceptions (
  id bigserial primary key,
  public_id uuid not null default governance.generate_public_id(),
  payroll_run_id bigint not null references workforce.payroll_runs(id) on delete cascade,
  employee_id bigint references workforce.employees(id),
  exception_type text not null,
  severity text not null default 'medium',
  description text not null,
  detected_at timestamptz not null default now(),
  resolved_at timestamptz,
  state text not null default 'Open',
  owner_user_id bigint references governance.users_profile(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_payroll_exceptions_run_id
  on workforce.payroll_exceptions(payroll_run_id);

create index if not exists idx_payroll_exceptions_state
  on workforce.payroll_exceptions(state);

create trigger trg_payroll_exceptions_updated_at
before update on workforce.payroll_exceptions
for each row execute function governance.set_updated_at();

-- ============================================================
-- 22) DOCS DOCUMENT SIGNATURE REQUESTS
-- ============================================================

create table if not exists docs.document_signature_requests (
  id bigserial primary key,
  public_id uuid not null default governance.generate_public_id(),
  document_id bigint not null references docs.documents(id) on delete cascade,
  request_number text not null unique,
  signer_name text not null,
  signer_email text,
  signer_phone text,
  signer_role text,
  request_status text not null default 'Pending',
  requested_at timestamptz not null default now(),
  signed_at timestamptz,
  expires_at timestamptz,
  signature_payload jsonb,
  created_by_user_id bigint references governance.users_profile(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_document_signature_requests_document_id
  on docs.document_signature_requests(document_id);

create trigger trg_document_signature_requests_updated_at
before update on docs.document_signature_requests
for each row execute function governance.set_updated_at();

-- ============================================================
-- 23) DOCS DOCUMENT VERSIONS
-- ============================================================

create table if not exists docs.document_versions (
  id bigserial primary key,
  document_id bigint not null references docs.documents(id) on delete cascade,
  version_number integer not null,
  storage_path text not null,
  checksum text,
  uploaded_by_user_id bigint references governance.users_profile(id),
  uploaded_at timestamptz not null default now(),
  notes text,
  unique(document_id, version_number)
);

create index if not exists idx_document_versions_document_id
  on docs.document_versions(document_id);

-- ============================================================
-- 24) COMMS PORTAL SESSIONS
-- ============================================================

create table if not exists comms.portal_sessions (
  id bigserial primary key,
  portal_user_id bigint not null references comms.portal_users(id) on delete cascade,
  session_token_hash text not null unique,
  ip_address text,
  user_agent text,
  started_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  ended_at timestamptz,
  status text not null default 'active',
  created_at timestamptz not null default now()
);

create index if not exists idx_portal_sessions_portal_user_id
  on comms.portal_sessions(portal_user_id);

create index if not exists idx_portal_sessions_status
  on comms.portal_sessions(status);

-- ============================================================
-- 25) GOVERNANCE ESCALATION RULES
-- ============================================================

create table if not exists governance.escalation_rules (
  id bigserial primary key,
  public_id uuid not null default governance.generate_public_id(),
  rule_code text not null unique,
  rule_name text not null,
  entity_type text not null,
  trigger_type text not null,
  severity text,
  condition_payload jsonb not null,
  action_payload jsonb not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_escalation_rules_updated_at
before update on governance.escalation_rules
for each row execute function governance.set_updated_at();

-- ============================================================
-- 26) GOVERNANCE ALERT SUBSCRIPTIONS
-- ============================================================

create table if not exists governance.alert_subscriptions (
  id bigserial primary key,
  user_id bigint references governance.users_profile(id) on delete cascade,
  category text not null,
  severity_min text,
  entity_type text,
  entity_id bigint,
  delivery_channels jsonb not null default '["in_app"]'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_alert_subscriptions_user_id
  on governance.alert_subscriptions(user_id);

create trigger trg_alert_subscriptions_updated_at
before update on governance.alert_subscriptions
for each row execute function governance.set_updated_at();

-- ============================================================
-- 27) GOVERNANCE SLA TIMERS
-- ============================================================

create table if not exists governance.sla_timers (
  id bigserial primary key,
  public_id uuid not null default governance.generate_public_id(),
  entity_type text not null,
  entity_id bigint not null,
  timer_type text not null,
  started_at timestamptz not null default now(),
  due_at timestamptz not null,
  breached_at timestamptz,
  state text not null default 'Running',
  owner_user_id bigint references governance.users_profile(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_sla_timers_entity
  on governance.sla_timers(entity_type, entity_id);

create index if not exists idx_sla_timers_due_at
  on governance.sla_timers(state, due_at);

create trigger trg_sla_timers_updated_at
before update on governance.sla_timers
for each row execute function governance.set_updated_at();

-- ============================================================
-- 28) GOVERNANCE JOB EXECUTIONS
-- ============================================================

create table if not exists governance.job_executions (
  id bigserial primary key,
  queue_job_id bigint references governance.queue_jobs(id) on delete set null,
  job_type text not null,
  runner_name text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  success boolean not null default false,
  execution_log jsonb,
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists idx_job_executions_job_type_started
  on governance.job_executions(job_type, started_at desc);

-- ============================================================
-- 29) GOVERNANCE AUDIT LOG ATTACHMENTS
-- ============================================================

create table if not exists governance.audit_log_attachments (
  id bigserial primary key,
  audit_log_id bigint not null references governance.audit_logs(id) on delete cascade,
  document_id bigint not null references docs.documents(id) on delete cascade,
  attached_at timestamptz not null default now(),
  attached_by_user_id bigint references governance.users_profile(id),
  unique(audit_log_id, document_id)
);

create index if not exists idx_audit_log_attachments_audit_log_id
  on governance.audit_log_attachments(audit_log_id);

-- ============================================================
-- 30) INTELLIGENCE ANOMALY FEEDBACK
-- ============================================================

create table if not exists intelligence.anomaly_feedback (
  id bigserial primary key,
  anomaly_case_id bigint not null references intelligence.anomaly_cases(id) on delete cascade,
  feedback_type text not null,
  feedback_label text,
  feedback_notes text,
  provided_by_user_id bigint references governance.users_profile(id),
  provided_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_anomaly_feedback_anomaly_case_id
  on intelligence.anomaly_feedback(anomaly_case_id);

-- ============================================================
-- CHECK CONSTRAINTS FOR NEW TABLES
-- ============================================================

alter table execution.project_risks
  add constraint chk_project_risks_scores_nonnegative
  check (
    probability_score >= 0
    and impact_score >= 0
    and overall_score >= 0
  );

alter table analytics.kpi_snapshots
  add constraint chk_kpi_snapshots_scope_not_empty
  check (kpi_code <> '' and kpi_scope <> '');

alter table finance.payment_allocations
  add constraint chk_payment_allocations_positive
  check (allocated_amount > 0);

alter table workforce.payroll_export_batches
  add constraint chk_payroll_export_batches_row_count_nonnegative
  check (row_count >= 0);

-- ============================================================
-- COMMENTS
-- ============================================================

comment on table commercial.customer_contacts is 'Customer contact persons and communication routing';
comment on table procurement.supplier_contacts is 'Supplier contact persons for RFQ/PO workflows';
comment on table execution.project_risks is 'Project-level risk registry';
comment on table execution.project_blockers is 'Operational blockers preventing project progress';
comment on table execution.task_comments is 'Comments and notes attached to tasks';
comment on table governance.webhook_endpoints is 'External webhook registrations';
comment on table governance.webhook_deliveries is 'Webhook delivery attempts and failures';
comment on table governance.integration_connections is 'Configured external integrations';
comment on table governance.integration_sync_logs is 'Integration sync execution history';
comment on table governance.feature_flag_targets is 'Feature flag targeting by role/user/group';
comment on table governance.user_preferences is 'Per-user product preferences';
comment on table governance.saved_filters is 'Saved list filters and views';
comment on table analytics.dashboard_definitions is 'Dashboard metadata definitions';
comment on table analytics.dashboard_widgets is 'Widget registry per dashboard';
comment on table analytics.kpi_snapshots is 'Historical KPI snapshot storage';
comment on table procurement.rfq_comparison_snapshots is 'RFQ supplier comparison saved versions';
comment on table finance.reconciliation_exceptions is 'Bank/payment reconciliation exceptions';
comment on table finance.payment_allocations is 'Allocations of payments against invoices';
comment on table workforce.payroll_export_batches is 'Exported payroll batch artifacts';
comment on table workforce.payroll_exceptions is 'Payroll run issues and exceptions';
comment on table docs.document_signature_requests is 'Signature requests for documents';
comment on table docs.document_versions is 'Version history for documents';
comment on table comms.portal_sessions is 'Portal user session tracking';
comment on table governance.escalation_rules is 'Escalation rule definitions for workflow and SLA';
comment on table governance.alert_subscriptions is 'User subscriptions for alerts';
comment on table governance.sla_timers is 'SLA timers for entity deadlines';
comment on table governance.job_executions is 'Execution history of async jobs';
comment on table governance.audit_log_attachments is 'Documents attached to audit logs';
comment on table intelligence.anomaly_feedback is 'Human feedback on anomaly cases';
