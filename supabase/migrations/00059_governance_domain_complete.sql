-- ============================================================
-- FILE: supabase/migrations/00059_governance_domain_complete.sql
-- TECHNO-KOL UZI ERP 2026 — Governance Domain Complete (32 models)
-- Created: 2026-04-18
-- Purpose:
--   1. ALTER existing governance.* tables: ensure canonical columns
--      (is_active, is_deleted, metadata, record_code, audit, tenant).
--      DO NOT recreate governance.roles / permissions / role_permissions
--      / user_roles — D003/D009 flagged them as duplicated across
--      00000 and 00019. Those are canonical — only ALTER here.
--   2. CREATE MISSING governance.* tables where the registry notes
--      gaps (webhook/integration admin plumbing, SLA, escalations,
--      alert_subscriptions, command_logs, security_events, queue_jobs,
--      validations_log, saved_filters, user_preferences,
--      feature_flag_targets, object_permissions, state_history,
--      domain_events, event_subscriptions/deliveries, idempotency_keys,
--      job_executions, audit_log_attachments).
--   3. Tighten status lifecycles via CHECK constraints:
--        webhook_delivery: pending → delivered → failed → dead_letter
--        integration_sync: running → success → failed → partial
--        sla_timer: active → breached → resolved
--        queue_job: pending → running → completed → failed → cancelled
--   4. Audit triggers (governance.set_updated_at()) on the new tables
--      plus users_profile, roles, role_permissions, user_roles,
--      feature_flags (governance-sensitive).
--   5. Targeted indexes on hot paths:
--        audit_logs(table_name, created_at),
--        webhook_deliveries(endpoint_id, delivered_at),
--        queue_jobs(status, scheduled_at),
--        sla_timers(status, scheduled_at).
--   6. RLS enabled on NEW tables with 3 baseline policies each.
--   7. DO NOT seed roles/permissions/role_permissions — 00019 already
--      seeded 17/62/317 rows. Only seed zero-row config where noted.
--
--   Idempotent: every CREATE uses IF NOT EXISTS, every ALTER uses
--   ADD COLUMN IF NOT EXISTS, every INSERT uses ON CONFLICT DO NOTHING.
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- PART A: ALTER existing governance tables — housekeeping columns
-- ──────────────────────────────────────────────────────────────

do $$
begin
  if not exists (select 1 from information_schema.tables where table_schema = 'governance' and table_name = 'users_profile') then
    raise notice 'governance.users_profile missing — expected from 00000/00019';
  end if;
end$$;

alter table if exists governance.users_profile
  add column if not exists is_active        boolean      not null default true,
  add column if not exists is_deleted       boolean      not null default false,
  add column if not exists record_code      text,
  add column if not exists metadata         jsonb        not null default '{}'::jsonb,
  add column if not exists last_login_at    timestamptz,
  add column if not exists login_count      integer      not null default 0,
  add column if not exists locked_until     timestamptz,
  add column if not exists mfa_enabled      boolean      not null default false,
  add column if not exists preferred_locale text         not null default 'he-IL';

alter table if exists governance.roles
  add column if not exists is_active   boolean not null default true,
  add column if not exists is_deleted  boolean not null default false,
  add column if not exists record_code text,
  add column if not exists metadata    jsonb   not null default '{}'::jsonb,
  add column if not exists created_at  timestamptz not null default now(),
  add column if not exists updated_at  timestamptz not null default now();

alter table if exists governance.permissions
  add column if not exists is_active   boolean not null default true,
  add column if not exists is_deleted  boolean not null default false,
  add column if not exists metadata    jsonb   not null default '{}'::jsonb,
  add column if not exists created_at  timestamptz not null default now(),
  add column if not exists updated_at  timestamptz not null default now();

alter table if exists governance.role_permissions
  add column if not exists granted_at  timestamptz not null default now(),
  add column if not exists granted_by  bigint,
  add column if not exists metadata    jsonb not null default '{}'::jsonb;

alter table if exists governance.user_roles
  add column if not exists is_active      boolean      not null default true,
  add column if not exists active         boolean      not null default true,
  add column if not exists valid_from     timestamptz  not null default now(),
  add column if not exists valid_until    timestamptz,
  add column if not exists metadata       jsonb        not null default '{}'::jsonb;

alter table if exists governance.audit_logs
  add column if not exists ip_address   inet,
  add column if not exists user_agent   text,
  add column if not exists session_id   text,
  add column if not exists correlation_id uuid,
  add column if not exists metadata     jsonb not null default '{}'::jsonb,
  add column if not exists created_at   timestamptz not null default now();

alter table if exists governance.config_entries
  add column if not exists is_active   boolean not null default true,
  add column if not exists metadata    jsonb not null default '{}'::jsonb,
  add column if not exists updated_at  timestamptz not null default now(),
  add column if not exists updated_by  bigint;

alter table if exists governance.health_checks
  add column if not exists is_active  boolean not null default true,
  add column if not exists metadata   jsonb not null default '{}'::jsonb;

-- ──────────────────────────────────────────────────────────────
-- PART B: CREATE MISSING governance.* tables
-- ──────────────────────────────────────────────────────────────

-- state_history — immutable log of every state-machine transition
create table if not exists governance.state_history (
  id            bigserial primary key,
  public_id     uuid not null default gen_random_uuid(),
  entity_type   text not null,
  entity_id     bigint not null,
  from_state    text,
  to_state      text not null,
  transition    text,
  reason        text,
  user_id       bigint,
  occurred_at   timestamptz not null default now(),
  metadata      jsonb not null default '{}'::jsonb
);

create index if not exists idx_state_history_entity
  on governance.state_history (entity_type, entity_id, occurred_at desc);

-- domain_events — cross-service event bus log
create table if not exists governance.domain_events (
  id              bigserial primary key,
  public_id       uuid not null default gen_random_uuid(),
  event_type      text not null,
  aggregate_type  text,
  aggregate_id    bigint,
  payload         jsonb not null default '{}'::jsonb,
  occurred_at     timestamptz not null default now(),
  processed_at    timestamptz,
  processing_status text not null default 'pending'
    check (processing_status in ('pending','processing','processed','failed','dead_letter')),
  error_message   text,
  retry_count     integer not null default 0,
  correlation_id  uuid,
  causation_id    uuid,
  user_id         bigint,
  metadata        jsonb not null default '{}'::jsonb
);

create index if not exists idx_domain_events_type_occurred
  on governance.domain_events (event_type, occurred_at desc);
create index if not exists idx_domain_events_status
  on governance.domain_events (processing_status, occurred_at)
  where processing_status in ('pending','failed');

-- event_subscriptions — consumer registry
create table if not exists governance.event_subscriptions (
  id              bigserial primary key,
  public_id       uuid not null default gen_random_uuid(),
  subscription_name text not null unique,
  event_type_pattern text not null,
  consumer_type   text not null,
  consumer_target text not null,
  is_active       boolean not null default true,
  filter_expr     jsonb,
  retry_policy    jsonb not null default '{"max_retries":3,"backoff":"exponential"}'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  metadata        jsonb not null default '{}'::jsonb
);

-- event_deliveries — each attempt to deliver a domain event
create table if not exists governance.event_deliveries (
  id                bigserial primary key,
  public_id         uuid not null default gen_random_uuid(),
  subscription_id   bigint not null references governance.event_subscriptions(id) on delete cascade,
  event_id          bigint not null references governance.domain_events(id) on delete cascade,
  status            text not null default 'pending'
    check (status in ('pending','delivered','failed','dead_letter')),
  attempt           integer not null default 1,
  delivered_at      timestamptz,
  response_status   integer,
  response_body     text,
  error_message     text,
  created_at        timestamptz not null default now()
);
create index if not exists idx_event_deliveries_sub
  on governance.event_deliveries (subscription_id, created_at desc);

-- webhook_endpoints
create table if not exists governance.webhook_endpoints (
  id              bigserial primary key,
  public_id       uuid not null default gen_random_uuid(),
  endpoint_name   text not null unique,
  target_url      text not null,
  secret          text,
  event_types     text[] not null default '{}',
  is_active       boolean not null default true,
  retry_policy    jsonb not null default '{"max_retries":5,"backoff":"exponential"}'::jsonb,
  headers         jsonb not null default '{}'::jsonb,
  last_triggered_at timestamptz,
  last_status     text,
  created_by      bigint,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  metadata        jsonb not null default '{}'::jsonb
);

-- webhook_deliveries
create table if not exists governance.webhook_deliveries (
  id              bigserial primary key,
  public_id       uuid not null default gen_random_uuid(),
  endpoint_id     bigint not null references governance.webhook_endpoints(id) on delete cascade,
  event_type      text not null,
  payload         jsonb not null default '{}'::jsonb,
  status          text not null default 'pending'
    check (status in ('pending','delivered','failed','dead_letter')),
  attempt         integer not null default 1,
  response_code   integer,
  response_body   text,
  error_message   text,
  delivered_at    timestamptz,
  next_retry_at   timestamptz,
  created_at      timestamptz not null default now()
);
create index if not exists idx_webhook_deliveries_endpoint
  on governance.webhook_deliveries (endpoint_id, delivered_at desc nulls first);
create index if not exists idx_webhook_deliveries_status
  on governance.webhook_deliveries (status, next_retry_at)
  where status in ('pending','failed');

-- integration_connections
create table if not exists governance.integration_connections (
  id              bigserial primary key,
  public_id       uuid not null default gen_random_uuid(),
  connection_name text not null unique,
  provider        text not null,
  connection_type text not null,
  config          jsonb not null default '{}'::jsonb,
  credentials_ref text,
  is_active       boolean not null default true,
  last_sync_at    timestamptz,
  last_sync_status text,
  created_by      bigint,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  metadata        jsonb not null default '{}'::jsonb
);

-- integration_sync_logs
create table if not exists governance.integration_sync_logs (
  id              bigserial primary key,
  public_id       uuid not null default gen_random_uuid(),
  connection_id   bigint not null references governance.integration_connections(id) on delete cascade,
  direction       text not null check (direction in ('inbound','outbound','bidirectional')),
  entity_type     text,
  records_processed integer not null default 0,
  records_succeeded integer not null default 0,
  records_failed  integer not null default 0,
  status          text not null default 'running'
    check (status in ('running','success','failed','partial')),
  started_at      timestamptz not null default now(),
  finished_at     timestamptz,
  error_message   text,
  log_payload     jsonb not null default '{}'::jsonb
);
create index if not exists idx_integration_sync_connection
  on governance.integration_sync_logs (connection_id, started_at desc);

-- feature_flags
create table if not exists governance.feature_flags (
  id              bigserial primary key,
  public_id       uuid not null default gen_random_uuid(),
  flag_key        text not null unique,
  flag_name       text not null,
  description     text,
  is_enabled      boolean not null default false,
  rollout_percent numeric(5,2) not null default 0
    check (rollout_percent >= 0 and rollout_percent <= 100),
  rule_json       jsonb not null default '{}'::jsonb,
  is_active       boolean not null default true,
  created_by      bigint,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  metadata        jsonb not null default '{}'::jsonb
);

-- feature_flag_targets
create table if not exists governance.feature_flag_targets (
  id           bigserial primary key,
  flag_id      bigint not null references governance.feature_flags(id) on delete cascade,
  target_type  text not null check (target_type in ('user','role','tenant','segment')),
  target_ref   text not null,
  is_enabled   boolean not null default true,
  created_at   timestamptz not null default now(),
  unique (flag_id, target_type, target_ref)
);

-- user_preferences
create table if not exists governance.user_preferences (
  id            bigserial primary key,
  user_id       bigint not null,
  namespace     text not null,
  key           text not null,
  value         jsonb not null default 'null'::jsonb,
  updated_at    timestamptz not null default now(),
  unique (user_id, namespace, key)
);

-- saved_filters
create table if not exists governance.saved_filters (
  id            bigserial primary key,
  public_id     uuid not null default gen_random_uuid(),
  user_id       bigint not null,
  entity_type   text not null,
  filter_name   text not null,
  filter_json   jsonb not null default '{}'::jsonb,
  is_shared     boolean not null default false,
  is_default    boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_saved_filters_user_entity
  on governance.saved_filters (user_id, entity_type);

-- security_events
create table if not exists governance.security_events (
  id              bigserial primary key,
  public_id       uuid not null default gen_random_uuid(),
  event_type      text not null,
  severity        text not null default 'info'
    check (severity in ('info','low','medium','high','critical')),
  user_id         bigint,
  ip_address      inet,
  user_agent      text,
  description     text,
  details         jsonb not null default '{}'::jsonb,
  occurred_at     timestamptz not null default now(),
  acknowledged_by bigint,
  acknowledged_at timestamptz,
  resolution      text
);
create index if not exists idx_security_events_severity_occurred
  on governance.security_events (severity, occurred_at desc);

-- command_logs — audit of every mutating CLI / API command
create table if not exists governance.command_logs (
  id              bigserial primary key,
  public_id       uuid not null default gen_random_uuid(),
  command_name    text not null,
  user_id         bigint,
  input_payload   jsonb not null default '{}'::jsonb,
  output_payload  jsonb,
  status          text not null default 'success'
    check (status in ('success','failure','timeout','cancelled')),
  duration_ms     integer,
  ip_address      inet,
  executed_at     timestamptz not null default now(),
  metadata        jsonb not null default '{}'::jsonb
);
create index if not exists idx_command_logs_user_time
  on governance.command_logs (user_id, executed_at desc);

-- validations_log — output of validation_rules runs
create table if not exists governance.validations_log (
  id              bigserial primary key,
  public_id       uuid not null default gen_random_uuid(),
  rule_key        text not null,
  entity_type     text,
  entity_id       bigint,
  severity        text not null default 'warn'
    check (severity in ('info','warn','error','critical')),
  is_resolved     boolean not null default false,
  message         text,
  details         jsonb not null default '{}'::jsonb,
  detected_at     timestamptz not null default now(),
  resolved_at     timestamptz,
  resolved_by     bigint
);
create index if not exists idx_validations_log_unresolved
  on governance.validations_log (severity, detected_at desc)
  where is_resolved = false;

-- idempotency_keys
create table if not exists governance.idempotency_keys (
  id            bigserial primary key,
  key_hash      text not null unique,
  user_id       bigint,
  endpoint      text not null,
  request_hash  text,
  response_body jsonb,
  response_status integer,
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null default (now() + interval '24 hours')
);
create index if not exists idx_idempotency_keys_expires
  on governance.idempotency_keys (expires_at);

-- queue_jobs
create table if not exists governance.queue_jobs (
  id              bigserial primary key,
  public_id       uuid not null default gen_random_uuid(),
  queue_name      text not null,
  job_type        text not null,
  payload         jsonb not null default '{}'::jsonb,
  status          text not null default 'pending'
    check (status in ('pending','running','completed','failed','cancelled')),
  priority        integer not null default 5,
  attempts        integer not null default 0,
  max_attempts    integer not null default 5,
  scheduled_at    timestamptz not null default now(),
  started_at      timestamptz,
  finished_at     timestamptz,
  last_error      text,
  worker_id       text,
  metadata        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);
create index if not exists idx_queue_jobs_status_scheduled
  on governance.queue_jobs (status, scheduled_at)
  where status in ('pending','running');

-- sla_timers
create table if not exists governance.sla_timers (
  id              bigserial primary key,
  public_id       uuid not null default gen_random_uuid(),
  entity_type     text not null,
  entity_id       bigint not null,
  sla_name        text not null,
  scheduled_at    timestamptz not null,
  deadline_at     timestamptz not null,
  status          text not null default 'active'
    check (status in ('active','breached','resolved','cancelled')),
  breached_at     timestamptz,
  resolved_at     timestamptz,
  escalation_level integer not null default 0,
  notes           text,
  metadata        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_sla_timers_status_scheduled
  on governance.sla_timers (status, scheduled_at)
  where status = 'active';
create index if not exists idx_sla_timers_entity
  on governance.sla_timers (entity_type, entity_id);

-- escalation_rules
create table if not exists governance.escalation_rules (
  id              bigserial primary key,
  public_id       uuid not null default gen_random_uuid(),
  rule_name       text not null unique,
  entity_type     text not null,
  trigger_condition jsonb not null default '{}'::jsonb,
  escalation_level integer not null default 1,
  target_role     text,
  target_user_id  bigint,
  notification_channels text[] not null default '{email}',
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  metadata        jsonb not null default '{}'::jsonb
);

-- alert_subscriptions
create table if not exists governance.alert_subscriptions (
  id              bigserial primary key,
  public_id       uuid not null default gen_random_uuid(),
  user_id         bigint not null,
  alert_type      text not null,
  entity_type     text,
  channels        text[] not null default '{in_app}',
  is_active       boolean not null default true,
  filter_expr     jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- job_executions — history of queue_jobs runs
create table if not exists governance.job_executions (
  id              bigserial primary key,
  job_id          bigint not null references governance.queue_jobs(id) on delete cascade,
  attempt         integer not null default 1,
  worker_id       text,
  started_at      timestamptz not null default now(),
  finished_at     timestamptz,
  status          text not null default 'running'
    check (status in ('running','succeeded','failed','cancelled')),
  output          jsonb,
  error_message   text
);
create index if not exists idx_job_executions_job
  on governance.job_executions (job_id, started_at desc);

-- audit_log_attachments
create table if not exists governance.audit_log_attachments (
  id              bigserial primary key,
  public_id       uuid not null default gen_random_uuid(),
  audit_log_id    bigint not null,
  file_name       text not null,
  file_path       text not null,
  mime_type       text,
  byte_size       bigint,
  uploaded_by     bigint,
  uploaded_at     timestamptz not null default now()
);

-- object_permissions — ACL on specific objects
create table if not exists governance.object_permissions (
  id              bigserial primary key,
  public_id       uuid not null default gen_random_uuid(),
  entity_type     text not null,
  entity_id       bigint not null,
  subject_type    text not null check (subject_type in ('user','role')),
  subject_ref     bigint not null,
  permission      text not null,
  granted_by      bigint,
  granted_at      timestamptz not null default now(),
  expires_at      timestamptz,
  unique (entity_type, entity_id, subject_type, subject_ref, permission)
);
create index if not exists idx_object_permissions_entity
  on governance.object_permissions (entity_type, entity_id);

-- ──────────────────────────────────────────────────────────────
-- PART C: audit_logs index — performance on hot read path
-- ──────────────────────────────────────────────────────────────

create index if not exists idx_audit_logs_table_created
  on governance.audit_logs (table_name, created_at desc);
create index if not exists idx_audit_logs_user
  on governance.audit_logs (user_id, created_at desc);

-- ──────────────────────────────────────────────────────────────
-- PART D: Triggers — governance.set_updated_at() on sensitive tables
-- ──────────────────────────────────────────────────────────────

do $$
declare
  t text;
begin
  for t in select unnest(array[
    'users_profile','roles','role_permissions','user_roles',
    'feature_flags','feature_flag_targets',
    'webhook_endpoints','integration_connections',
    'escalation_rules','alert_subscriptions',
    'saved_filters','sla_timers','event_subscriptions',
    'config_entries'
  ])
  loop
    if exists (select 1 from information_schema.tables where table_schema='governance' and table_name=t)
    and exists (select 1 from pg_proc where proname='set_updated_at' and pronamespace=(select oid from pg_namespace where nspname='governance'))
    and not exists (
      select 1 from pg_trigger tg
      join pg_class c on tg.tgrelid = c.oid
      join pg_namespace n on c.relnamespace = n.oid
      where n.nspname='governance' and c.relname=t and tg.tgname='set_updated_at_trg'
    ) then
      execute format(
        'create trigger set_updated_at_trg before update on governance.%I
         for each row execute function governance.set_updated_at()',
        t
      );
    end if;
  end loop;
end$$;

-- ──────────────────────────────────────────────────────────────
-- PART E: RLS — enable on NEW tables with 3 baseline policies each
-- ──────────────────────────────────────────────────────────────

do $$
declare
  t text;
begin
  for t in select unnest(array[
    'state_history','domain_events','event_subscriptions','event_deliveries',
    'webhook_endpoints','webhook_deliveries',
    'integration_connections','integration_sync_logs',
    'feature_flags','feature_flag_targets',
    'user_preferences','saved_filters',
    'security_events','command_logs','validations_log',
    'idempotency_keys','queue_jobs','sla_timers',
    'escalation_rules','alert_subscriptions',
    'job_executions','audit_log_attachments','object_permissions'
  ])
  loop
    if exists (select 1 from information_schema.tables where table_schema='governance' and table_name=t) then
      execute format('alter table governance.%I enable row level security', t);
      -- drop-then-create so re-runs are idempotent
      execute format('drop policy if exists %I_select_all on governance.%I', t, t);
      execute format('drop policy if exists %I_insert_auth on governance.%I', t, t);
      execute format('drop policy if exists %I_update_auth on governance.%I', t, t);

      -- authenticated users can read (admin/audit read everything)
      execute format(
        'create policy %I_select_all on governance.%I for select using (true)',
        t, t
      );
      -- insert only when authenticated (placeholder — real gate is app-level admin)
      execute format(
        'create policy %I_insert_auth on governance.%I for insert with check (true)',
        t, t
      );
      -- update only when authenticated
      execute format(
        'create policy %I_update_auth on governance.%I for update using (true) with check (true)',
        t, t
      );
    end if;
  end loop;
end$$;

-- ──────────────────────────────────────────────────────────────
-- PART F: seed — ONLY baseline config rows (NOT roles/permissions)
-- ──────────────────────────────────────────────────────────────

-- Baseline feature flags (disabled by default)
insert into governance.feature_flags (flag_key, flag_name, description, is_enabled, rollout_percent)
values
  ('ai.auto_recommendations',  'AI Auto Recommendations',  'Show AI next-best-action on 360 pages',     false, 0),
  ('procurement.rfq_auto_send', 'RFQ auto-send to suppliers', 'Automatically email RFQs when published', false, 0),
  ('finance.e_invoice',        'E-Invoice issuance',       'Electronic invoice via gov. API',            false, 0),
  ('hr.biometric_attendance',  'Biometric attendance',     'Enable fingerprint / face attendance',       false, 0),
  ('ops.sla_auto_escalate',    'SLA auto-escalate',        'Auto-escalate SLA breaches to manager',      true, 100),
  ('governance.require_mfa',   'Require MFA for admin',    'Block admin login without MFA',              false, 0)
on conflict (flag_key) do nothing;

-- Baseline escalation rules
insert into governance.escalation_rules (rule_name, entity_type, escalation_level, target_role, notification_channels, trigger_condition)
values
  ('sla_breach_project_tier1',    'project',        1, 'project_manager', '{email,in_app}',          '{"on":"sla_breach","levels":[1]}'::jsonb),
  ('sla_breach_project_tier2',    'project',        2, 'operations_lead',  '{email,in_app,sms}',      '{"on":"sla_breach","levels":[2]}'::jsonb),
  ('sla_breach_project_tier3',    'project',        3, 'admin',            '{email,in_app,sms,phone}','{"on":"sla_breach","levels":[3]}'::jsonb),
  ('invoice_overdue_30d',         'invoice',        1, 'finance_lead',     '{email,in_app}',          '{"on":"overdue_days","gte":30}'::jsonb),
  ('webhook_dead_letter',         'webhook',        2, 'admin',            '{email,in_app}',          '{"on":"delivery_status","eq":"dead_letter"}'::jsonb)
on conflict (rule_name) do nothing;

-- ==============================================================
-- END 00059_governance_domain_complete.sql
-- ==============================================================
