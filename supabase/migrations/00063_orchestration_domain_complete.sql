-- ============================================================
-- FILE: supabase/migrations/00063_orchestration_domain_complete.sql
-- TECHNO-KOL UZI ERP 2026 — Orchestration Domain Complete
-- Created: 2026-04-18
-- Purpose:
--   1. ALTER existing orchestration.* tables (from 00024):
--        workflow_definitions, workflow_steps, workflow_runs,
--        workflow_step_runs, job_queue, universal_inbox,
--        notifications — add canonical columns (status, priority,
--        metadata, audit: created_by, updated_by, public_id,
--        is_active, record_code).
--   2. CREATE MISSING orchestration.* tables:
--        workflow_triggers, inbox_assignments, step_comments.
--   3. Tighten status lifecycles via CHECK constraints:
--        workflow_runs.status       in (pending,running,completed,failed,paused,canceled)
--        workflow_step_runs.status  in (pending,running,complete,failed,skipped)
--        job_queue.status           in (pending,running,completed,failed,cancelled)
--        universal_inbox.status     in (open,claimed,resolved,dismissed)
--        notifications.status       in (pending,sent,read,dismissed,failed)
--   4. Audit triggers (governance.set_updated_at) on
--        workflow_definitions, workflow_runs (plus legacy triggers
--        already installed in 00024 remain).
--   5. RLS on ALL orchestration.* tables with 3 baseline policies.
--   6. Indexes on FK + status + scheduled_at hot paths.
--   7. Seed 3 additional example workflow_definitions:
--        customer_onboarding, invoice_approval, procurement_approval.
--   8. Idempotent everywhere: IF NOT EXISTS, ADD COLUMN IF NOT EXISTS,
--      ON CONFLICT DO NOTHING.
-- ============================================================

create schema if not exists orchestration;

-- ──────────────────────────────────────────────────────────────
-- PART A: bridge legacy `state` column to canonical `status`
-- ──────────────────────────────────────────────────────────────
--
-- The 00024 migration used `state` (not `status`). Canonical domain
-- uses `status`. We ADD the `status` column mirroring `state`, keep
-- `state` for backward compatibility, and wire new CHECK constraints
-- on `status`. Existing rows are backfilled.

-- workflow_definitions
alter table if exists orchestration.workflow_definitions
  add column if not exists public_id     uuid        not null default gen_random_uuid(),
  add column if not exists is_active     boolean     not null default true,
  add column if not exists is_deleted    boolean     not null default false,
  add column if not exists record_code   text,
  add column if not exists metadata      jsonb       not null default '{}'::jsonb,
  add column if not exists created_by    bigint,
  add column if not exists updated_by    bigint,
  add column if not exists description   text;

-- workflow_steps
alter table if exists orchestration.workflow_steps
  add column if not exists public_id     uuid        not null default gen_random_uuid(),
  add column if not exists is_active     boolean     not null default true,
  add column if not exists metadata      jsonb       not null default '{}'::jsonb,
  add column if not exists description   text,
  add column if not exists timeout_seconds integer,
  add column if not exists retry_policy  jsonb       not null default '{"max_retries":3,"backoff":"exponential"}'::jsonb;

-- workflow_runs — add status (mirror of state)
alter table if exists orchestration.workflow_runs
  add column if not exists public_id     uuid        not null default gen_random_uuid(),
  add column if not exists status        text        not null default 'pending',
  add column if not exists priority      integer     not null default 5,
  add column if not exists scheduled_at  timestamptz,
  add column if not exists paused_at     timestamptz,
  add column if not exists error_message text,
  add column if not exists context       jsonb       not null default '{}'::jsonb,
  add column if not exists metadata      jsonb       not null default '{}'::jsonb,
  add column if not exists created_by    bigint,
  add column if not exists updated_by    bigint;

-- backfill status from legacy state
update orchestration.workflow_runs
   set status = case lower(coalesce(state,'pending'))
                  when 'queued'    then 'pending'
                  when 'running'   then 'running'
                  when 'completed' then 'completed'
                  when 'complete'  then 'completed'
                  when 'failed'    then 'failed'
                  when 'error'     then 'failed'
                  when 'paused'    then 'paused'
                  when 'canceled'  then 'canceled'
                  when 'cancelled' then 'canceled'
                  else 'pending'
                end
 where status is null or status = '' or status = 'pending' and state is not null;

-- workflow_step_runs — add status
alter table if exists orchestration.workflow_step_runs
  add column if not exists public_id     uuid        not null default gen_random_uuid(),
  add column if not exists status        text        not null default 'pending',
  add column if not exists attempt       integer     not null default 1,
  add column if not exists metadata      jsonb       not null default '{}'::jsonb;

update orchestration.workflow_step_runs
   set status = case lower(coalesce(state,'pending'))
                  when 'queued'    then 'pending'
                  when 'running'   then 'running'
                  when 'completed' then 'complete'
                  when 'complete'  then 'complete'
                  when 'failed'    then 'failed'
                  when 'skipped'   then 'skipped'
                  else 'pending'
                end
 where status is null or status = '' or status = 'pending' and state is not null;

-- job_queue — add status
alter table if exists orchestration.job_queue
  add column if not exists public_id     uuid        not null default gen_random_uuid(),
  add column if not exists status        text        not null default 'pending',
  add column if not exists scheduled_at  timestamptz not null default now(),
  add column if not exists priority      integer     not null default 5,
  add column if not exists metadata      jsonb       not null default '{}'::jsonb,
  add column if not exists last_error    text;

-- align naming: job_queue uses available_at historically; map into scheduled_at
update orchestration.job_queue
   set scheduled_at = coalesce(scheduled_at, available_at, now())
 where scheduled_at is null;

update orchestration.job_queue
   set status = case lower(coalesce(state,'pending'))
                  when 'queued'    then 'pending'
                  when 'running'   then 'running'
                  when 'completed' then 'completed'
                  when 'complete'  then 'completed'
                  when 'failed'    then 'failed'
                  when 'cancelled' then 'cancelled'
                  when 'canceled'  then 'cancelled'
                  else 'pending'
                end
 where status is null or status = '' or status = 'pending' and state is not null;

-- universal_inbox — add status
alter table if exists orchestration.universal_inbox
  add column if not exists public_id     uuid        not null default gen_random_uuid(),
  add column if not exists status        text        not null default 'open',
  add column if not exists claimed_at    timestamptz,
  add column if not exists claimed_by    bigint,
  add column if not exists resolved_at   timestamptz,
  add column if not exists resolved_by   bigint,
  add column if not exists dismissed_at  timestamptz,
  add column if not exists due_at        timestamptz,
  add column if not exists metadata      jsonb       not null default '{}'::jsonb;

update orchestration.universal_inbox
   set status = case lower(coalesce(state,'open'))
                  when 'open'      then 'open'
                  when 'claimed'   then 'claimed'
                  when 'resolved'  then 'resolved'
                  when 'dismissed' then 'dismissed'
                  when 'closed'    then 'resolved'
                  else 'open'
                end
 where status is null or status = '' or status = 'open' and state is not null;

-- notifications — add status, read_at
alter table if exists orchestration.notifications
  add column if not exists public_id     uuid        not null default gen_random_uuid(),
  add column if not exists status        text        not null default 'pending',
  add column if not exists read_at       timestamptz,
  add column if not exists dismissed_at  timestamptz,
  add column if not exists scheduled_at  timestamptz not null default now(),
  add column if not exists sent_at       timestamptz,
  add column if not exists related_entity_type text,
  add column if not exists related_entity_id   bigint,
  add column if not exists metadata      jsonb       not null default '{}'::jsonb;

update orchestration.notifications
   set status = case lower(coalesce(state,'pending'))
                  when 'open'       then 'sent'
                  when 'pending'    then 'pending'
                  when 'sent'       then 'sent'
                  when 'read'       then 'read'
                  when 'dismissed'  then 'dismissed'
                  when 'failed'     then 'failed'
                  else 'pending'
                end
 where status is null or status = '' or status = 'pending' and state is not null;

-- ──────────────────────────────────────────────────────────────
-- PART B: CHECK constraints for status lifecycles
-- ──────────────────────────────────────────────────────────────

do $$
begin
  -- workflow_runs.status
  if not exists (
    select 1 from pg_constraint
     where conname = 'orchestration_workflow_runs_status_chk'
  ) then
    execute $ddl$
      alter table orchestration.workflow_runs
        add constraint orchestration_workflow_runs_status_chk
        check (status in ('pending','running','completed','failed','paused','canceled'))
    $ddl$;
  end if;

  -- workflow_step_runs.status
  if not exists (
    select 1 from pg_constraint
     where conname = 'orchestration_workflow_step_runs_status_chk'
  ) then
    execute $ddl$
      alter table orchestration.workflow_step_runs
        add constraint orchestration_workflow_step_runs_status_chk
        check (status in ('pending','running','complete','failed','skipped'))
    $ddl$;
  end if;

  -- job_queue.status
  if not exists (
    select 1 from pg_constraint
     where conname = 'orchestration_job_queue_status_chk'
  ) then
    execute $ddl$
      alter table orchestration.job_queue
        add constraint orchestration_job_queue_status_chk
        check (status in ('pending','running','completed','failed','cancelled'))
    $ddl$;
  end if;

  -- universal_inbox.status
  if not exists (
    select 1 from pg_constraint
     where conname = 'orchestration_universal_inbox_status_chk'
  ) then
    execute $ddl$
      alter table orchestration.universal_inbox
        add constraint orchestration_universal_inbox_status_chk
        check (status in ('open','claimed','resolved','dismissed'))
    $ddl$;
  end if;

  -- notifications.status
  if not exists (
    select 1 from pg_constraint
     where conname = 'orchestration_notifications_status_chk'
  ) then
    execute $ddl$
      alter table orchestration.notifications
        add constraint orchestration_notifications_status_chk
        check (status in ('pending','sent','read','dismissed','failed'))
    $ddl$;
  end if;
end$$;

-- ──────────────────────────────────────────────────────────────
-- PART C: CREATE MISSING orchestration.* tables
-- ──────────────────────────────────────────────────────────────

-- workflow_triggers — schedule / event / webhook / manual triggers
create table if not exists orchestration.workflow_triggers (
  id               bigserial primary key,
  public_id        uuid        not null default gen_random_uuid(),
  workflow_def_id  bigint      not null references orchestration.workflow_definitions(id) on delete cascade,
  trigger_name     text        not null,
  trigger_type     text        not null
    check (trigger_type in ('schedule','event','webhook','manual')),
  trigger_config   jsonb       not null default '{}'::jsonb,
  is_enabled       boolean     not null default true,
  last_fired_at    timestamptz,
  next_fire_at     timestamptz,
  fire_count       integer     not null default 0,
  created_by       bigint,
  updated_by       bigint,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  metadata         jsonb       not null default '{}'::jsonb,
  unique (workflow_def_id, trigger_name)
);

create index if not exists idx_orchestration_triggers_def
  on orchestration.workflow_triggers (workflow_def_id);
create index if not exists idx_orchestration_triggers_enabled
  on orchestration.workflow_triggers (is_enabled, next_fire_at)
  where is_enabled = true;

-- inbox_assignments — history of assignment changes per inbox item
create table if not exists orchestration.inbox_assignments (
  id              bigserial primary key,
  public_id       uuid        not null default gen_random_uuid(),
  inbox_item_id   bigint      not null references orchestration.universal_inbox(id) on delete cascade,
  assigned_to_user_id bigint,
  assigned_to_role    text,
  assigned_by     bigint,
  assigned_at     timestamptz not null default now(),
  unassigned_at   timestamptz,
  reason          text,
  metadata        jsonb       not null default '{}'::jsonb
);

create index if not exists idx_orchestration_inbox_assignments_item
  on orchestration.inbox_assignments (inbox_item_id, assigned_at desc);
create index if not exists idx_orchestration_inbox_assignments_user
  on orchestration.inbox_assignments (assigned_to_user_id, assigned_at desc)
  where unassigned_at is null;

-- step_comments — operator comments on workflow step runs
create table if not exists orchestration.step_comments (
  id               bigserial primary key,
  public_id        uuid        not null default gen_random_uuid(),
  step_run_id      bigint      not null references orchestration.workflow_step_runs(id) on delete cascade,
  user_id          bigint,
  comment_text     text        not null,
  is_internal      boolean     not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  metadata         jsonb       not null default '{}'::jsonb
);

create index if not exists idx_orchestration_step_comments_step
  on orchestration.step_comments (step_run_id, created_at desc);

-- ──────────────────────────────────────────────────────────────
-- PART D: Indexes on FK + status + scheduled_at hot paths
-- ──────────────────────────────────────────────────────────────

create index if not exists idx_orchestration_workflow_defs_active
  on orchestration.workflow_definitions (is_active, category)
  where is_active = true;

create index if not exists idx_orchestration_workflow_steps_def
  on orchestration.workflow_steps (workflow_definition_id, sequence_order);

create index if not exists idx_orchestration_workflow_runs_def
  on orchestration.workflow_runs (workflow_definition_id, created_at desc);

create index if not exists idx_orchestration_workflow_runs_status
  on orchestration.workflow_runs (status, scheduled_at)
  where status in ('pending','running','paused');

create index if not exists idx_orchestration_workflow_runs_entity
  on orchestration.workflow_runs (parent_entity_type, parent_entity_id);

create index if not exists idx_orchestration_step_runs_run
  on orchestration.workflow_step_runs (workflow_run_id, sequence_order);

create index if not exists idx_orchestration_step_runs_status
  on orchestration.workflow_step_runs (status, started_at desc)
  where status in ('pending','running');

create index if not exists idx_orchestration_job_queue_status_scheduled
  on orchestration.job_queue (status, scheduled_at)
  where status in ('pending','running');

create index if not exists idx_orchestration_job_queue_queue
  on orchestration.job_queue (queue_name, status);

create index if not exists idx_orchestration_inbox_status_user
  on orchestration.universal_inbox (status, assigned_to_user_id)
  where status in ('open','claimed');

create index if not exists idx_orchestration_inbox_due
  on orchestration.universal_inbox (due_at)
  where status = 'open' and due_at is not null;

create index if not exists idx_orchestration_notifications_recipient_status
  on orchestration.notifications (recipient_type, recipient_id, status);

create index if not exists idx_orchestration_notifications_pending
  on orchestration.notifications (status, scheduled_at)
  where status = 'pending';

-- ──────────────────────────────────────────────────────────────
-- PART E: Audit triggers — set_updated_at on new + core tables
-- ──────────────────────────────────────────────────────────────
--
-- 00024 already created set_updated_at triggers on the seven legacy
-- tables. We only install triggers on NEW tables and additionally
-- assert on workflow_definitions / workflow_runs in case the core
-- function signature drifted.

do $$
declare
  t text;
begin
  for t in select unnest(array[
    'workflow_definitions','workflow_runs',
    'workflow_triggers','inbox_assignments','step_comments'
  ])
  loop
    if exists (select 1 from information_schema.tables where table_schema='orchestration' and table_name=t)
    and exists (select 1 from pg_proc where proname='set_updated_at' and pronamespace=(select oid from pg_namespace where nspname='governance'))
    and not exists (
      select 1 from pg_trigger tg
      join pg_class c on tg.tgrelid = c.oid
      join pg_namespace n on c.relnamespace = n.oid
      where n.nspname='orchestration' and c.relname=t and tg.tgname='set_updated_at_trg'
    ) then
      execute format(
        'create trigger set_updated_at_trg before update on orchestration.%I
         for each row execute function governance.set_updated_at()',
        t
      );
    end if;
  end loop;
end$$;

-- ──────────────────────────────────────────────────────────────
-- PART F: RLS — enable + 3 baseline policies per table
-- ──────────────────────────────────────────────────────────────

do $$
declare
  t text;
begin
  for t in select unnest(array[
    'workflow_definitions','workflow_steps','workflow_runs',
    'workflow_step_runs','job_queue','universal_inbox','notifications',
    'workflow_triggers','inbox_assignments','step_comments'
  ])
  loop
    if exists (select 1 from information_schema.tables where table_schema='orchestration' and table_name=t) then
      execute format('alter table orchestration.%I enable row level security', t);
      execute format('drop policy if exists %I_select_all on orchestration.%I', t, t);
      execute format('drop policy if exists %I_insert_auth on orchestration.%I', t, t);
      execute format('drop policy if exists %I_update_auth on orchestration.%I', t, t);

      execute format(
        'create policy %I_select_all on orchestration.%I for select using (true)',
        t, t
      );
      execute format(
        'create policy %I_insert_auth on orchestration.%I for insert with check (true)',
        t, t
      );
      execute format(
        'create policy %I_update_auth on orchestration.%I for update using (true) with check (true)',
        t, t
      );
    end if;
  end loop;
end$$;

-- ──────────────────────────────────────────────────────────────
-- PART G: Seed additional workflow_definitions (examples)
-- ──────────────────────────────────────────────────────────────

insert into orchestration.workflow_definitions (
  workflow_code, workflow_name, category, version, active, description, definition_payload
) values
  ('customer_onboarding',   'Customer Onboarding',    'commercial',  1, true,
   'קליטת לקוח חדש — יצירה, בדיקת KYC, הקצאת מנהל לקוח, משלוח ברוכים הבאים',
   jsonb_build_object('description','Onboard a new customer','entrypoint','start_customer_onboarding')),
  ('invoice_approval',      'Invoice Approval',       'finance',     1, true,
   'אישור חשבונית — ולידציה, אישור מנהל, הנפקת תשלום',
   jsonb_build_object('description','Approve an incoming invoice','entrypoint','start_invoice_approval')),
  ('procurement_approval',  'Procurement Approval',   'procurement', 1, true,
   'אישור רכש — ולידציית בקשה, אישור תקציב, הנפקת הזמנת רכש',
   jsonb_build_object('description','Approve a procurement request','entrypoint','start_procurement_approval'))
on conflict (workflow_code) do nothing;

-- Seed steps for the 3 new workflows
insert into orchestration.workflow_steps (
  workflow_definition_id, step_code, step_name, step_type, sequence_order, config_payload, active, description
)
select wd.id, s.step_code, s.step_name, s.step_type, s.sequence_order, s.config_payload, true, s.description
from orchestration.workflow_definitions wd
join (
  values
    ('customer_onboarding','validate_customer','Validate Customer Data','validation',   1, '{"required_fields":["name","tax_id","email"]}'::jsonb, 'בדיקת שדות חובה'),
    ('customer_onboarding','kyc_check',        'KYC Check',             'action',       2, '{"action_code":"run_kyc"}'::jsonb,                       'הרצת KYC'),
    ('customer_onboarding','assign_manager',   'Assign Account Manager','action',       3, '{"action_code":"assign_account_manager"}'::jsonb,        'הקצאת מנהל לקוח'),
    ('customer_onboarding','send_welcome',     'Send Welcome Notification','notification',4,'{"channel":"email"}'::jsonb,                            'שליחת ברוכים הבאים'),

    ('invoice_approval','validate_invoice',    'Validate Invoice',      'validation',   1, '{"required_state":"received"}'::jsonb,                   'בדיקת חשבונית'),
    ('invoice_approval','three_way_match',     'Three-Way Match',       'action',       2, '{"action_code":"three_way_match"}'::jsonb,               'התאמה תלת-צדדית'),
    ('invoice_approval','manager_approval',    'Manager Approval',      'approval',     3, '{"approver_role":"finance_manager"}'::jsonb,             'אישור מנהל'),
    ('invoice_approval','schedule_payment',    'Schedule Payment',      'action',       4, '{"action_code":"schedule_payment"}'::jsonb,              'תזמון תשלום'),

    ('procurement_approval','validate_request','Validate Purchase Request','validation',1,'{"required_state":"submitted"}'::jsonb,                   'בדיקת בקשה'),
    ('procurement_approval','budget_check',    'Budget Check',          'action',       2, '{"action_code":"check_budget"}'::jsonb,                  'בדיקת תקציב'),
    ('procurement_approval','manager_approval','Manager Approval',      'approval',     3, '{"approver_role":"procurement_manager"}'::jsonb,         'אישור מנהל רכש'),
    ('procurement_approval','issue_po',        'Issue Purchase Order',  'action',       4, '{"action_code":"issue_po"}'::jsonb,                      'הנפקת הזמנת רכש')
) as s(workflow_code, step_code, step_name, step_type, sequence_order, config_payload, description)
  on wd.workflow_code = s.workflow_code
on conflict do nothing;

-- Seed example triggers (manual by default, disabled)
insert into orchestration.workflow_triggers (
  workflow_def_id, trigger_name, trigger_type, trigger_config, is_enabled
)
select wd.id, t.trigger_name, t.trigger_type, t.trigger_config, t.is_enabled
from orchestration.workflow_definitions wd
join (
  values
    ('customer_onboarding',  'manual_trigger',  'manual',   '{}'::jsonb,                                      false),
    ('invoice_approval',     'on_invoice_received', 'event','{"event_type":"invoice.received"}'::jsonb,       false),
    ('procurement_approval', 'on_pr_submitted', 'event',    '{"event_type":"purchase_request.submitted"}'::jsonb, false)
) as t(workflow_code, trigger_name, trigger_type, trigger_config, is_enabled)
  on wd.workflow_code = t.workflow_code
on conflict (workflow_def_id, trigger_name) do nothing;

-- ==============================================================
-- END 00063_orchestration_domain_complete.sql
-- ==============================================================
