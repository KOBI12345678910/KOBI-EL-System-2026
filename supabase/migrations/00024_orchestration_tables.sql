-- ============================================================
-- FILE: supabase/migrations/00024_orchestration_tables.sql
-- Workflow engine, job queue, universal inbox, notifications
-- ============================================================

create schema if not exists orchestration;

-- ── Workflow Definitions ──

create table if not exists orchestration.workflow_definitions (
  id bigserial primary key,
  workflow_code text not null unique,
  workflow_name text not null,
  category text,
  version integer not null default 1,
  active boolean not null default true,
  definition_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists orchestration.workflow_steps (
  id bigserial primary key,
  workflow_definition_id bigint not null references orchestration.workflow_definitions(id) on delete cascade,
  step_code text not null,
  step_name text not null,
  step_type text not null,
  sequence_order integer not null,
  config_payload jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(workflow_definition_id, step_code)
);

-- ── Workflow Runs ──

create table if not exists orchestration.workflow_runs (
  id bigserial primary key,
  workflow_definition_id bigint not null references orchestration.workflow_definitions(id) on delete restrict,
  workflow_code text not null,
  workflow_name text not null,
  parent_entity_type text,
  parent_entity_id bigint,
  correlation_id text,
  triggered_by_user_id bigint references governance.users_profile(id),
  state text not null default 'queued',
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists orchestration.workflow_step_runs (
  id bigserial primary key,
  workflow_run_id bigint not null references orchestration.workflow_runs(id) on delete cascade,
  workflow_step_id bigint not null references orchestration.workflow_steps(id) on delete restrict,
  step_code text not null,
  step_name text not null,
  step_type text not null,
  sequence_order integer not null,
  state text not null default 'queued',
  started_at timestamptz,
  finished_at timestamptz,
  error_message text,
  output_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── Job Queue ──

create table if not exists orchestration.job_queue (
  id bigserial primary key,
  queue_name text not null,
  job_type text not null,
  parent_entity_type text,
  parent_entity_id bigint,
  workflow_run_id bigint references orchestration.workflow_runs(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  attempts_count integer not null default 0,
  max_attempts integer not null default 5,
  available_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  error_message text,
  state text not null default 'queued',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── Universal Inbox ──

create table if not exists orchestration.universal_inbox (
  id bigserial primary key,
  inbox_number text not null unique,
  item_type text not null,
  parent_entity_type text,
  parent_entity_id bigint,
  title text not null,
  description text,
  assigned_to_user_id bigint references governance.users_profile(id),
  priority text,
  state text not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── Notifications ──

create table if not exists orchestration.notifications (
  id bigserial primary key,
  notification_number text not null unique,
  recipient_type text not null,
  recipient_id bigint,
  title text not null,
  message_text text,
  severity text,
  channel text default 'in_app',
  state text not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── Triggers ──

create trigger trg_workflow_definitions_updated_at
before update on orchestration.workflow_definitions
for each row execute function governance.set_updated_at();

create trigger trg_workflow_steps_updated_at
before update on orchestration.workflow_steps
for each row execute function governance.set_updated_at();

create trigger trg_workflow_runs_updated_at
before update on orchestration.workflow_runs
for each row execute function governance.set_updated_at();

create trigger trg_workflow_step_runs_updated_at
before update on orchestration.workflow_step_runs
for each row execute function governance.set_updated_at();

create trigger trg_job_queue_updated_at
before update on orchestration.job_queue
for each row execute function governance.set_updated_at();

create trigger trg_universal_inbox_updated_at
before update on orchestration.universal_inbox
for each row execute function governance.set_updated_at();

create trigger trg_notifications_updated_at
before update on orchestration.notifications
for each row execute function governance.set_updated_at();

-- ── Indexes ──

create index if not exists idx_job_queue_state_available_at
  on orchestration.job_queue(state, available_at);

create index if not exists idx_workflow_runs_state
  on orchestration.workflow_runs(state);

create index if not exists idx_universal_inbox_state_assigned
  on orchestration.universal_inbox(state, assigned_to_user_id);

create index if not exists idx_notifications_state_recipient
  on orchestration.notifications(state, recipient_type, recipient_id);

-- ── Seed: workflow definitions ──

insert into orchestration.workflow_definitions (
  workflow_code, workflow_name, category, version, active, definition_payload
)
values
(
  'quote_to_project', 'Quote To Project', 'commercial', 1, true,
  jsonb_build_object('description', 'Convert approved quote to project and seed execution', 'entrypoint', 'convert_quote_to_project')
),
(
  'rfq_to_po', 'RFQ To PO', 'procurement', 1, true,
  jsonb_build_object('description', 'Approve RFQ and convert to purchase order', 'entrypoint', 'convert_rfq_to_po')
),
(
  'workorder_completion', 'Work Order Completion', 'operations', 1, true,
  jsonb_build_object('description', 'Complete QA, signoff and close work order', 'entrypoint', 'complete_work_order')
)
on conflict (workflow_code) do nothing;

-- ── Seed: workflow steps ──

insert into orchestration.workflow_steps (
  workflow_definition_id, step_code, step_name, step_type, sequence_order, config_payload, active
)
select wd.id, s.step_code, s.step_name, s.step_type, s.sequence_order, s.config_payload, true
from orchestration.workflow_definitions wd
join (
  values
    ('quote_to_project', 'validate_quote',   'Validate Quote',           'validation',   1, '{"required_state":"Approved"}'::jsonb),
    ('quote_to_project', 'create_project',   'Create Project',           'action',       2, '{"action_code":"create_project"}'::jsonb),
    ('quote_to_project', 'seed_work_order',  'Seed Work Order',          'action',       3, '{"action_code":"create_work_order"}'::jsonb),
    ('quote_to_project', 'notify_sales_ops', 'Notify Sales/Ops',         'notification', 4, '{"channel":"in_app"}'::jsonb),

    ('rfq_to_po', 'validate_rfq',        'Validate RFQ',                'validation',   1, '{"required_state":"Approved"}'::jsonb),
    ('rfq_to_po', 'create_po',           'Create Purchase Order',       'action',       2, '{"action_code":"convert_to_po"}'::jsonb),
    ('rfq_to_po', 'request_po_approval', 'Request PO Approval',         'action',       3, '{"action_code":"request_po_approval"}'::jsonb),
    ('rfq_to_po', 'notify_procurement',  'Notify Procurement',          'notification', 4, '{"channel":"in_app"}'::jsonb),

    ('workorder_completion', 'validate_qa',          'Validate QA',               'validation',   1, '{"required_checklist":"true"}'::jsonb),
    ('workorder_completion', 'complete_workorder',   'Complete Work Order',        'action',       2, '{"action_code":"complete_work_order"}'::jsonb),
    ('workorder_completion', 'send_signoff_request', 'Send Signoff Request',       'notification', 3, '{"channel":"in_app"}'::jsonb),
    ('workorder_completion', 'close_alerts',         'Close Operational Alerts',   'action',       4, '{"action_code":"resolve_alerts"}'::jsonb)
) as s(workflow_code, step_code, step_name, step_type, sequence_order, config_payload)
  on wd.workflow_code = s.workflow_code
on conflict do nothing;
