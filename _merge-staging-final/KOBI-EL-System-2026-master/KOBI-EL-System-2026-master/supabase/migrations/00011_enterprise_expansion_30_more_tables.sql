-- ============================================================
-- FILE: supabase/migrations/00011_enterprise_expansion_30_more_tables.sql
-- TECHNOKOL UZI ERP 2026
-- 30 MORE ENTERPRISE-GRADE TABLES
-- ============================================================

-- ============================================================
-- 01) COMMERCIAL LEAD TAGS
-- ============================================================

create table if not exists commercial.lead_tags (
  id bigserial primary key,
  public_id uuid not null default governance.generate_public_id(),
  tag_code text not null unique,
  tag_name text not null,
  color text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_lead_tags_updated_at
before update on commercial.lead_tags
for each row execute function governance.set_updated_at();

-- ============================================================
-- 02) COMMERCIAL LEAD TAG ASSIGNMENTS
-- ============================================================

create table if not exists commercial.lead_tag_assignments (
  id bigserial primary key,
  lead_id bigint not null references commercial.leads(id) on delete cascade,
  tag_id bigint not null references commercial.lead_tags(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  assigned_by bigint references governance.users_profile(id),
  unique(lead_id, tag_id)
);

create index if not exists idx_lead_tag_assignments_lead_id
  on commercial.lead_tag_assignments(lead_id);

-- ============================================================
-- 03) COMMERCIAL QUOTE REVISIONS
-- ============================================================

create table if not exists commercial.quote_revisions (
  id bigserial primary key,
  public_id uuid not null default governance.generate_public_id(),
  quote_id bigint not null references commercial.quotes(id) on delete cascade,
  revision_number integer not null,
  revision_reason text,
  revision_snapshot jsonb not null,
  created_by bigint references governance.users_profile(id),
  created_at timestamptz not null default now(),
  unique(quote_id, revision_number)
);

create index if not exists idx_quote_revisions_quote_id
  on commercial.quote_revisions(quote_id);

-- ============================================================
-- 04) COMMERCIAL QUOTE APPROVAL MATRIX
-- ============================================================

create table if not exists commercial.quote_approval_rules (
  id bigserial primary key,
  public_id uuid not null default governance.generate_public_id(),
  rule_code text not null unique,
  rule_name text not null,
  min_total_amount numeric(18,2),
  max_total_amount numeric(18,2),
  currency text,
  required_role_code text,
  required_approval_count integer not null default 1,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_quote_approval_rules_updated_at
before update on commercial.quote_approval_rules
for each row execute function governance.set_updated_at();

-- ============================================================
-- 05) PROCUREMENT APPROVAL STEPS
-- ============================================================

create table if not exists procurement.approval_steps (
  id bigserial primary key,
  approval_id bigint not null references procurement.approvals(id) on delete cascade,
  step_number integer not null,
  required_role_code text,
  assigned_approver_user_id bigint references governance.users_profile(id),
  decision text,
  decided_at timestamptz,
  comments text,
  state text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(approval_id, step_number)
);

create index if not exists idx_approval_steps_approval_id
  on procurement.approval_steps(approval_id);

create trigger trg_approval_steps_updated_at
before update on procurement.approval_steps
for each row execute function governance.set_updated_at();

-- ============================================================
-- 06) PROCUREMENT SUPPLIER SCORECARDS
-- ============================================================

create table if not exists procurement.supplier_scorecards (
  id bigserial primary key,
  public_id uuid not null default governance.generate_public_id(),
  supplier_id bigint not null references procurement.suppliers(id) on delete cascade,
  score_period text not null,
  quality_score numeric(9,4) not null default 0,
  delivery_score numeric(9,4) not null default 0,
  price_score numeric(9,4) not null default 0,
  responsiveness_score numeric(9,4) not null default 0,
  overall_score numeric(9,4) not null default 0,
  notes text,
  calculated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique(supplier_id, score_period)
);

create index if not exists idx_supplier_scorecards_supplier_id
  on procurement.supplier_scorecards(supplier_id);

-- ============================================================
-- 07) PROCUREMENT CONTRACT MILESTONES
-- ============================================================

create table if not exists procurement.contract_milestones (
  id bigserial primary key,
  contract_id bigint not null references procurement.contracts(id) on delete cascade,
  milestone_name text not null,
  due_date date,
  achieved_at timestamptz,
  state text not null default 'pending',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_contract_milestones_contract_id
  on procurement.contract_milestones(contract_id);

create trigger trg_contract_milestones_updated_at
before update on procurement.contract_milestones
for each row execute function governance.set_updated_at();

-- ============================================================
-- 08) INVENTORY MATERIAL LOTS
-- ============================================================

create table if not exists inventory.material_lots (
  id bigserial primary key,
  public_id uuid not null default governance.generate_public_id(),
  material_id bigint not null references inventory.materials(id),
  warehouse_id bigint not null references inventory.warehouses(id),
  lot_number text not null,
  batch_reference text,
  received_date date,
  expiry_date date,
  quantity_on_hand numeric(18,4) not null default 0,
  unit_cost numeric(18,4),
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(material_id, warehouse_id, lot_number)
);

create index if not exists idx_material_lots_material_warehouse
  on inventory.material_lots(material_id, warehouse_id);

create trigger trg_material_lots_updated_at
before update on inventory.material_lots
for each row execute function governance.set_updated_at();

-- ============================================================
-- 09) INVENTORY MOVEMENT LEDGER
-- ============================================================

create table if not exists inventory.inventory_movements (
  id bigserial primary key,
  public_id uuid not null default governance.generate_public_id(),
  material_id bigint not null references inventory.materials(id),
  warehouse_id bigint not null references inventory.warehouses(id),
  lot_id bigint references inventory.material_lots(id),
  movement_type text not null,
  source_entity_type text,
  source_entity_id bigint,
  quantity_delta numeric(18,4) not null,
  unit_cost numeric(18,4),
  movement_at timestamptz not null default now(),
  moved_by_user_id bigint references governance.users_profile(id),
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists idx_inventory_movements_material_warehouse
  on inventory.inventory_movements(material_id, warehouse_id, movement_at desc);

-- ============================================================
-- 10) INVENTORY REORDER RULES
-- ============================================================

create table if not exists inventory.reorder_rules (
  id bigserial primary key,
  public_id uuid not null default governance.generate_public_id(),
  material_id bigint not null unique references inventory.materials(id) on delete cascade,
  reorder_point numeric(18,4) not null default 0,
  reorder_qty numeric(18,4) not null default 0,
  max_stock_level numeric(18,4),
  preferred_supplier_id bigint references procurement.suppliers(id),
  lead_time_days integer,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_reorder_rules_updated_at
before update on inventory.reorder_rules
for each row execute function governance.set_updated_at();

-- ============================================================
-- 11) INVENTORY SHORTAGE SNAPSHOTS
-- ============================================================

create table if not exists inventory.shortage_snapshots (
  id bigserial primary key,
  snapshot_at timestamptz not null default now(),
  material_id bigint not null references inventory.materials(id),
  warehouse_id bigint references inventory.warehouses(id),
  shortage_qty numeric(18,4) not null,
  parent_entity_type text,
  parent_entity_id bigint,
  severity text not null default 'medium',
  created_at timestamptz not null default now()
);

create index if not exists idx_shortage_snapshots_material_id
  on inventory.shortage_snapshots(material_id, snapshot_at desc);

-- ============================================================
-- 12) EXECUTION PROJECT COST PLANS
-- ============================================================

create table if not exists execution.project_cost_plans (
  id bigserial primary key,
  public_id uuid not null default governance.generate_public_id(),
  project_id bigint not null unique references execution.projects(id) on delete cascade,
  materials_budget numeric(18,2) not null default 0,
  labor_budget numeric(18,2) not null default 0,
  subcontractor_budget numeric(18,2) not null default 0,
  logistics_budget numeric(18,2) not null default 0,
  contingency_budget numeric(18,2) not null default 0,
  total_budget numeric(18,2) not null default 0,
  notes text,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_project_cost_plans_updated_at
before update on execution.project_cost_plans
for each row execute function governance.set_updated_at();

-- ============================================================
-- 13) EXECUTION WORK ORDER QA CHECKLISTS
-- ============================================================

create table if not exists execution.work_order_qa_checklists (
  id bigserial primary key,
  public_id uuid not null default governance.generate_public_id(),
  work_order_id bigint not null references execution.work_orders(id) on delete cascade,
  checklist_code text not null,
  checklist_name text not null,
  state text not null default 'Open',
  completed_at timestamptz,
  completed_by_user_id bigint references governance.users_profile(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(work_order_id, checklist_code)
);

create trigger trg_work_order_qa_checklists_updated_at
before update on execution.work_order_qa_checklists
for each row execute function governance.set_updated_at();

-- ============================================================
-- 14) EXECUTION WORK ORDER QA ITEMS
-- ============================================================

create table if not exists execution.work_order_qa_items (
  id bigserial primary key,
  checklist_id bigint not null references execution.work_order_qa_checklists(id) on delete cascade,
  item_code text not null,
  item_label text not null,
  is_required boolean not null default true,
  status text not null default 'Pending',
  checked_at timestamptz,
  checked_by_user_id bigint references governance.users_profile(id),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(checklist_id, item_code)
);

create trigger trg_work_order_qa_items_updated_at
before update on execution.work_order_qa_items
for each row execute function governance.set_updated_at();

-- ============================================================
-- 15) FINANCE DUNNING CAMPAIGNS
-- ============================================================

create table if not exists finance.dunning_campaigns (
  id bigserial primary key,
  public_id uuid not null default governance.generate_public_id(),
  campaign_code text not null unique,
  campaign_name text not null,
  active boolean not null default true,
  config_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_dunning_campaigns_updated_at
before update on finance.dunning_campaigns
for each row execute function governance.set_updated_at();

-- ============================================================
-- 16) FINANCE DUNNING STEPS
-- ============================================================

create table if not exists finance.dunning_steps (
  id bigserial primary key,
  dunning_campaign_id bigint not null references finance.dunning_campaigns(id) on delete cascade,
  step_number integer not null,
  days_overdue_from integer not null default 0,
  channel text not null,
  template_code text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(dunning_campaign_id, step_number)
);

create trigger trg_dunning_steps_updated_at
before update on finance.dunning_steps
for each row execute function governance.set_updated_at();

-- ============================================================
-- 17) FINANCE COLLECTION ACTIONS
-- ============================================================

create table if not exists finance.collection_actions (
  id bigserial primary key,
  public_id uuid not null default governance.generate_public_id(),
  collection_case_id bigint not null references finance.collection_cases(id) on delete cascade,
  action_type text not null,
  action_at timestamptz not null default now(),
  performed_by_user_id bigint references governance.users_profile(id),
  notes text,
  next_followup_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_collection_actions_case_id
  on finance.collection_actions(collection_case_id, action_at desc);

-- ============================================================
-- 18) FINANCE REMINDER SCHEDULES
-- ============================================================

create table if not exists finance.reminder_schedules (
  id bigserial primary key,
  public_id uuid not null default governance.generate_public_id(),
  customer_id bigint references commercial.customers(id),
  invoice_id bigint references finance.invoices(id),
  reminder_type text not null,
  scheduled_for timestamptz not null,
  sent_at timestamptz,
  status text not null default 'Scheduled',
  channel text not null,
  payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_reminder_schedules_status_scheduled
  on finance.reminder_schedules(status, scheduled_for);

create trigger trg_reminder_schedules_updated_at
before update on finance.reminder_schedules
for each row execute function governance.set_updated_at();

-- ============================================================
-- 19) WORKFORCE PAY COMPONENTS
-- ============================================================

create table if not exists workforce.pay_components (
  id bigserial primary key,
  public_id uuid not null default governance.generate_public_id(),
  component_code text not null unique,
  component_name text not null,
  component_type text not null,
  taxable boolean not null default true,
  pensionable boolean not null default true,
  active boolean not null default true,
  config_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_pay_components_updated_at
before update on workforce.pay_components
for each row execute function governance.set_updated_at();

-- ============================================================
-- 20) WORKFORCE EMPLOYEE PAY COMPONENTS
-- ============================================================

create table if not exists workforce.employee_pay_components (
  id bigserial primary key,
  employee_id bigint not null references workforce.employees(id) on delete cascade,
  pay_component_id bigint not null references workforce.pay_components(id) on delete cascade,
  value_type text not null,
  value_amount numeric(18,4) not null,
  effective_from date not null,
  effective_to date,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(employee_id, pay_component_id, effective_from)
);

create index if not exists idx_employee_pay_components_employee_id
  on workforce.employee_pay_components(employee_id);

create trigger trg_employee_pay_components_updated_at
before update on workforce.employee_pay_components
for each row execute function governance.set_updated_at();

-- ============================================================
-- 21) WORKFORCE LEAVE TYPES
-- ============================================================

create table if not exists workforce.leave_types (
  id bigserial primary key,
  public_id uuid not null default governance.generate_public_id(),
  leave_code text not null unique,
  leave_name text not null,
  paid boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_leave_types_updated_at
before update on workforce.leave_types
for each row execute function governance.set_updated_at();

-- ============================================================
-- 22) WORKFORCE LEAVE REQUESTS
-- ============================================================

create table if not exists workforce.leave_requests (
  id bigserial primary key,
  public_id uuid not null default governance.generate_public_id(),
  request_number text not null unique,
  employee_id bigint not null references workforce.employees(id),
  leave_type_id bigint not null references workforce.leave_types(id),
  start_date date not null,
  end_date date not null,
  total_days numeric(9,2) not null,
  approval_status text not null default 'Pending',
  approved_by_user_id bigint references governance.users_profile(id),
  approved_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_leave_requests_employee_id
  on workforce.leave_requests(employee_id);

create trigger trg_leave_requests_updated_at
before update on workforce.leave_requests
for each row execute function governance.set_updated_at();

-- ============================================================
-- 23) INTELLIGENCE MODEL REGISTRY
-- ============================================================

create table if not exists intelligence.model_registry (
  id bigserial primary key,
  public_id uuid not null default governance.generate_public_id(),
  model_code text not null unique,
  model_name text not null,
  model_type text not null,
  version text not null,
  status text not null default 'active',
  config_payload jsonb not null default '{}'::jsonb,
  deployed_at timestamptz,
  retired_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_model_registry_updated_at
before update on intelligence.model_registry
for each row execute function governance.set_updated_at();

-- ============================================================
-- 24) INTELLIGENCE MODEL EXECUTIONS
-- ============================================================

create table if not exists intelligence.model_executions (
  id bigserial primary key,
  model_registry_id bigint not null references intelligence.model_registry(id) on delete cascade,
  execution_type text not null,
  parent_entity_type text,
  parent_entity_id bigint,
  input_payload jsonb,
  output_payload jsonb,
  success boolean not null default false,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists idx_model_executions_model_registry_id
  on intelligence.model_executions(model_registry_id, started_at desc);

-- ============================================================
-- 25) INTELLIGENCE RECOMMENDATION FEEDBACK
-- ============================================================

create table if not exists intelligence.recommendation_feedback (
  id bigserial primary key,
  recommendation_id bigint not null references intelligence.decision_recommendations(id) on delete cascade,
  feedback_type text not null,
  feedback_notes text,
  provided_by_user_id bigint references governance.users_profile(id),
  provided_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_recommendation_feedback_recommendation_id
  on intelligence.recommendation_feedback(recommendation_id);

-- ============================================================
-- 26) ANALYTICS READ MODEL INVALIDATIONS
-- ============================================================

create table if not exists analytics.read_model_invalidations (
  id bigserial primary key,
  public_id uuid not null default governance.generate_public_id(),
  read_model_code text not null,
  entity_type text,
  entity_id bigint,
  invalidated_at timestamptz not null default now(),
  reason text,
  processed boolean not null default false,
  processed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_read_model_invalidations_processed
  on analytics.read_model_invalidations(processed, invalidated_at);

-- ============================================================
-- 27) GOVERNANCE COMMAND LOGS
-- ============================================================

create table if not exists governance.command_logs (
  id bigserial primary key,
  public_id uuid not null default governance.generate_public_id(),
  command_name text not null,
  entity_type text,
  entity_id bigint,
  actor_user_id bigint references governance.users_profile(id),
  input_payload jsonb,
  result_payload jsonb,
  success boolean not null default false,
  correlation_id text,
  executed_at timestamptz not null default now(),
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists idx_command_logs_correlation_id
  on governance.command_logs(correlation_id);

create index if not exists idx_command_logs_executed_at
  on governance.command_logs(executed_at desc);

-- ============================================================
-- 28) GOVERNANCE SECURITY EVENTS
-- ============================================================

create table if not exists governance.security_events (
  id bigserial primary key,
  public_id uuid not null default governance.generate_public_id(),
  event_type text not null,
  severity text not null default 'medium',
  auth_user_id uuid,
  user_profile_id bigint references governance.users_profile(id),
  portal_user_id bigint references comms.portal_users(id),
  ip_address text,
  user_agent text,
  event_payload jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_security_events_occurred_at
  on governance.security_events(occurred_at desc);

create index if not exists idx_security_events_event_type
  on governance.security_events(event_type, severity);

-- ============================================================
-- 29) COMMS NOTIFICATION DELIVERIES
-- ============================================================

create table if not exists comms.notification_deliveries (
  id bigserial primary key,
  notification_id bigint not null references comms.notifications(id) on delete cascade,
  channel text not null,
  target_address text,
  delivery_status text not null default 'pending',
  provider_reference text,
  attempted_at timestamptz,
  delivered_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_notification_deliveries_notification_id
  on comms.notification_deliveries(notification_id);

create trigger trg_notification_deliveries_updated_at
before update on comms.notification_deliveries
for each row execute function governance.set_updated_at();

-- ============================================================
-- 30) COMMS SUPPORT SLA TRACKING
-- ============================================================

create table if not exists comms.support_sla_tracking (
  id bigserial primary key,
  support_ticket_id bigint not null unique references comms.support_tickets(id) on delete cascade,
  first_response_due_at timestamptz,
  first_response_at timestamptz,
  resolution_due_at timestamptz,
  resolved_at timestamptz,
  first_response_breached boolean not null default false,
  resolution_breached boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_support_sla_tracking_updated_at
before update on comms.support_sla_tracking
for each row execute function governance.set_updated_at();

-- ============================================================
-- CONSTRAINTS
-- ============================================================

alter table workforce.leave_requests
  add constraint chk_leave_requests_date_order
  check (end_date >= start_date);

alter table workforce.leave_requests
  add constraint chk_leave_requests_total_days_nonnegative
  check (total_days >= 0);

alter table inventory.material_lots
  add constraint chk_material_lots_quantity_nonnegative
  check (quantity_on_hand >= 0);

alter table inventory.reorder_rules
  add constraint chk_reorder_rules_nonnegative
  check (reorder_point >= 0 and reorder_qty >= 0);

alter table execution.project_cost_plans
  add constraint chk_project_cost_plans_nonnegative
  check (
    materials_budget >= 0 and
    labor_budget >= 0 and
    subcontractor_budget >= 0 and
    logistics_budget >= 0 and
    contingency_budget >= 0 and
    total_budget >= 0
  );

-- ============================================================
-- COMMENTS
-- ============================================================

comment on table commercial.lead_tags is 'Lead categorization tags';
comment on table commercial.lead_tag_assignments is 'Lead to tag mappings';
comment on table commercial.quote_revisions is 'Historical quote snapshots';
comment on table commercial.quote_approval_rules is 'Rules to determine quote approval requirements';
comment on table procurement.approval_steps is 'Multi-step approval trail';
comment on table procurement.supplier_scorecards is 'Periodic supplier scoring';
comment on table procurement.contract_milestones is 'Contract obligation milestones';
comment on table inventory.material_lots is 'Lot-level inventory tracking';
comment on table inventory.inventory_movements is 'Inventory movement ledger';
comment on table inventory.reorder_rules is 'Automated reorder policy by material';
comment on table inventory.shortage_snapshots is 'Detected shortages over time';
comment on table execution.project_cost_plans is 'Planned cost structure for projects';
comment on table execution.work_order_qa_checklists is 'QA checklist container for work orders';
comment on table execution.work_order_qa_items is 'Checklist items for work order QA';
comment on table finance.dunning_campaigns is 'Collections reminder campaign setup';
comment on table finance.dunning_steps is 'Reminder sequencing rules';
comment on table finance.collection_actions is 'Manual and automated collection actions';
comment on table finance.reminder_schedules is 'Scheduled reminders for invoices/customers';
comment on table workforce.pay_components is 'Payroll component catalog';
comment on table workforce.employee_pay_components is 'Assigned pay components per employee';
comment on table workforce.leave_types is 'Allowed leave types';
comment on table workforce.leave_requests is 'Employee leave requests';
comment on table intelligence.model_registry is 'AI model catalog';
comment on table intelligence.model_executions is 'Execution history for AI models';
comment on table intelligence.recommendation_feedback is 'Human feedback on recommendations';
comment on table analytics.read_model_invalidations is 'Projection refresh invalidation queue';
comment on table governance.command_logs is 'Command execution log';
comment on table governance.security_events is 'Security-relevant events';
comment on table comms.notification_deliveries is 'Notification delivery tracking';
comment on table comms.support_sla_tracking is 'Support SLA tracking';
