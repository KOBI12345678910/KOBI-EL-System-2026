-- ============================================================
-- FILE: supabase/migrations/00065_comms_domain_complete.sql
-- TECHNO-KOL UZI ERP 2026 — Comms Domain Complete
-- Created: 2026-04-18
-- Purpose:
--   1. ALTER existing comms.* tables (00000 master) to ensure
--      canonical audit columns (is_active, is_deleted, metadata,
--      record_code, created_by, updated_by, tenant_id).
--      Existing tables: portal_users, notifications, comms_threads,
--      email_messages, sms_messages, whatsapp_messages,
--      chatbot_sessions, support_tickets, help_articles.
--   2. CREATE MISSING comms.* tables:
--        portal_sessions, notification_deliveries,
--        support_sla_tracking, message_templates,
--        broadcast_campaigns, email_tracking, sms_tracking,
--        whatsapp_tracking, chatbot_feedback,
--        broadcast_recipients, message_attachments.
--   3. Tighten status lifecycles via CHECK constraints.
--   4. RLS enabled on new tables with 3 baseline policies each.
--   5. Indexes on recipient_id, status, sent_at desc for message tables.
--   6. Seed 5 Hebrew message_templates.
--   Idempotent — every CREATE uses IF NOT EXISTS, every ALTER uses
--   ADD COLUMN IF NOT EXISTS, every INSERT uses ON CONFLICT DO NOTHING.
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- PART A: ALTER existing comms tables — canonical columns
-- ──────────────────────────────────────────────────────────────

alter table if exists comms.portal_users
  add column if not exists is_active   boolean     not null default true,
  add column if not exists is_deleted  boolean     not null default false,
  add column if not exists record_code text,
  add column if not exists metadata    jsonb       not null default '{}'::jsonb,
  add column if not exists created_by  bigint,
  add column if not exists updated_by  bigint,
  add column if not exists tenant_id   bigint;

alter table if exists comms.notifications
  add column if not exists is_active   boolean     not null default true,
  add column if not exists is_deleted  boolean     not null default false,
  add column if not exists record_code text,
  add column if not exists metadata    jsonb       not null default '{}'::jsonb,
  add column if not exists created_by  bigint,
  add column if not exists updated_by  bigint,
  add column if not exists tenant_id   bigint,
  add column if not exists status      text        not null default 'unread',
  add column if not exists archived_at timestamptz,
  add column if not exists updated_at  timestamptz not null default now();

do $$
begin
  if not exists (
    select 1 from information_schema.constraint_column_usage
    where constraint_name = 'notifications_status_check'
      and table_schema = 'comms'
  ) then
    begin
      alter table comms.notifications
        add constraint notifications_status_check
        check (status in ('unread','read','archived'));
    exception when duplicate_object then null;
    end;
  end if;
end$$;

alter table if exists comms.comms_threads
  add column if not exists is_active   boolean     not null default true,
  add column if not exists is_deleted  boolean     not null default false,
  add column if not exists record_code text,
  add column if not exists metadata    jsonb       not null default '{}'::jsonb,
  add column if not exists created_by  bigint,
  add column if not exists updated_by  bigint,
  add column if not exists tenant_id   bigint,
  add column if not exists last_message_at timestamptz;

alter table if exists comms.email_messages
  add column if not exists is_active   boolean     not null default true,
  add column if not exists is_deleted  boolean     not null default false,
  add column if not exists record_code text,
  add column if not exists metadata    jsonb       not null default '{}'::jsonb,
  add column if not exists created_by  bigint,
  add column if not exists updated_by  bigint,
  add column if not exists tenant_id   bigint,
  add column if not exists recipient_id bigint,
  add column if not exists status      text        not null default 'queued',
  add column if not exists opened_at   timestamptz,
  add column if not exists clicked_at  timestamptz,
  add column if not exists bounced_at  timestamptz,
  add column if not exists updated_at  timestamptz not null default now();

do $$
begin
  if not exists (
    select 1 from information_schema.constraint_column_usage
    where constraint_name = 'email_messages_status_check'
      and table_schema = 'comms'
  ) then
    begin
      alter table comms.email_messages
        add constraint email_messages_status_check
        check (status in ('queued','sent','delivered','bounced','failed','opened','clicked'));
    exception when duplicate_object then null;
    end;
  end if;
end$$;

alter table if exists comms.sms_messages
  add column if not exists is_active   boolean     not null default true,
  add column if not exists is_deleted  boolean     not null default false,
  add column if not exists record_code text,
  add column if not exists metadata    jsonb       not null default '{}'::jsonb,
  add column if not exists created_by  bigint,
  add column if not exists updated_by  bigint,
  add column if not exists tenant_id   bigint,
  add column if not exists recipient_id bigint,
  add column if not exists status      text        not null default 'queued',
  add column if not exists delivered_at timestamptz,
  add column if not exists failed_at   timestamptz,
  add column if not exists updated_at  timestamptz not null default now();

do $$
begin
  if not exists (
    select 1 from information_schema.constraint_column_usage
    where constraint_name = 'sms_messages_status_check'
      and table_schema = 'comms'
  ) then
    begin
      alter table comms.sms_messages
        add constraint sms_messages_status_check
        check (status in ('queued','sent','delivered','failed'));
    exception when duplicate_object then null;
    end;
  end if;
end$$;

alter table if exists comms.whatsapp_messages
  add column if not exists is_active   boolean     not null default true,
  add column if not exists is_deleted  boolean     not null default false,
  add column if not exists record_code text,
  add column if not exists metadata    jsonb       not null default '{}'::jsonb,
  add column if not exists created_by  bigint,
  add column if not exists updated_by  bigint,
  add column if not exists tenant_id   bigint,
  add column if not exists recipient_id bigint,
  add column if not exists status      text        not null default 'sent',
  add column if not exists delivered_at timestamptz,
  add column if not exists read_at     timestamptz,
  add column if not exists updated_at  timestamptz not null default now();

do $$
begin
  if not exists (
    select 1 from information_schema.constraint_column_usage
    where constraint_name = 'whatsapp_messages_status_check'
      and table_schema = 'comms'
  ) then
    begin
      alter table comms.whatsapp_messages
        add constraint whatsapp_messages_status_check
        check (status in ('sent','delivered','read','failed'));
    exception when duplicate_object then null;
    end;
  end if;
end$$;

alter table if exists comms.support_tickets
  add column if not exists is_active   boolean     not null default true,
  add column if not exists is_deleted  boolean     not null default false,
  add column if not exists record_code text,
  add column if not exists metadata    jsonb       not null default '{}'::jsonb,
  add column if not exists created_by  bigint,
  add column if not exists updated_by  bigint,
  add column if not exists tenant_id   bigint,
  add column if not exists status      text        not null default 'open',
  add column if not exists category    text,
  add column if not exists channel     text,
  add column if not exists first_response_at timestamptz,
  add column if not exists sla_due_at  timestamptz;

do $$
begin
  if not exists (
    select 1 from information_schema.constraint_column_usage
    where constraint_name = 'support_tickets_status_check'
      and table_schema = 'comms'
  ) then
    begin
      alter table comms.support_tickets
        add constraint support_tickets_status_check
        check (status in ('open','in_progress','waiting_customer','resolved','closed'));
    exception when duplicate_object then null;
    end;
  end if;
end$$;

alter table if exists comms.help_articles
  add column if not exists is_active   boolean     not null default true,
  add column if not exists is_deleted  boolean     not null default false,
  add column if not exists record_code text,
  add column if not exists metadata    jsonb       not null default '{}'::jsonb,
  add column if not exists created_by  bigint,
  add column if not exists updated_by  bigint,
  add column if not exists tenant_id   bigint,
  add column if not exists slug        text,
  add column if not exists view_count  integer     not null default 0,
  add column if not exists helpful_count integer   not null default 0;

alter table if exists comms.chatbot_sessions
  add column if not exists is_active   boolean     not null default true,
  add column if not exists is_deleted  boolean     not null default false,
  add column if not exists record_code text,
  add column if not exists metadata    jsonb       not null default '{}'::jsonb,
  add column if not exists created_by  bigint,
  add column if not exists updated_by  bigint,
  add column if not exists tenant_id   bigint,
  add column if not exists channel     text,
  add column if not exists updated_at  timestamptz not null default now();

-- ──────────────────────────────────────────────────────────────
-- PART B: CREATE MISSING comms.* tables
-- ──────────────────────────────────────────────────────────────

-- portal_sessions — session audit log for portal_users
create table if not exists comms.portal_sessions (
  id             bigserial primary key,
  public_id      uuid not null default gen_random_uuid(),
  portal_user_id bigint not null references comms.portal_users(id) on delete cascade,
  session_token  text not null,
  ip_address     inet,
  user_agent     text,
  started_at     timestamptz not null default now(),
  last_seen_at   timestamptz,
  ended_at       timestamptz,
  is_active      boolean not null default true,
  metadata       jsonb not null default '{}'::jsonb
);
create index if not exists idx_portal_sessions_user
  on comms.portal_sessions (portal_user_id, started_at desc);

-- notification_deliveries — fan-out delivery log per notification+channel
create table if not exists comms.notification_deliveries (
  id               bigserial primary key,
  public_id        uuid not null default gen_random_uuid(),
  notification_id  bigint not null references comms.notifications(id) on delete cascade,
  channel          text not null,
  target           text not null,
  status           text not null default 'pending'
    check (status in ('pending','sent','delivered','failed','bounced')),
  attempts         integer not null default 0,
  last_attempt_at  timestamptz,
  delivered_at     timestamptz,
  error_message    text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  metadata         jsonb not null default '{}'::jsonb
);
create index if not exists idx_notification_deliveries_notif
  on comms.notification_deliveries (notification_id, created_at desc);
create index if not exists idx_notification_deliveries_status
  on comms.notification_deliveries (status, created_at desc);

-- support_sla_tracking — per-ticket SLA snapshots
create table if not exists comms.support_sla_tracking (
  id               bigserial primary key,
  public_id        uuid not null default gen_random_uuid(),
  ticket_id        bigint not null references comms.support_tickets(id) on delete cascade,
  sla_type         text not null,
  target_at        timestamptz not null,
  actual_at        timestamptz,
  status           text not null default 'active'
    check (status in ('active','met','breached','paused','cancelled')),
  breach_duration_minutes integer,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  metadata         jsonb not null default '{}'::jsonb
);
create index if not exists idx_support_sla_tracking_ticket
  on comms.support_sla_tracking (ticket_id, created_at desc);
create index if not exists idx_support_sla_tracking_status
  on comms.support_sla_tracking (status, target_at);

-- message_templates — reusable template repo (email/sms/whatsapp)
create table if not exists comms.message_templates (
  id            bigserial primary key,
  public_id     uuid not null default gen_random_uuid(),
  template_code text not null unique,
  name          text not null,
  channel       text not null check (channel in ('email','sms','whatsapp','push','inapp')),
  subject       text,
  body          text not null,
  locale        text not null default 'he-IL',
  variables     jsonb not null default '[]'::jsonb,
  is_active     boolean not null default true,
  is_deleted    boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    bigint,
  updated_by    bigint,
  metadata      jsonb not null default '{}'::jsonb
);
create index if not exists idx_message_templates_channel
  on comms.message_templates (channel, is_active);

-- broadcast_campaigns — scheduled multi-recipient sends
create table if not exists comms.broadcast_campaigns (
  id              bigserial primary key,
  public_id       uuid not null default gen_random_uuid(),
  campaign_code   text not null unique,
  name            text not null,
  channel         text not null check (channel in ('email','sms','whatsapp','push')),
  template_id     bigint references comms.message_templates(id),
  audience_filter jsonb not null default '{}'::jsonb,
  status          text not null default 'draft'
    check (status in ('draft','scheduled','sending','completed','cancelled')),
  scheduled_at    timestamptz,
  started_at      timestamptz,
  completed_at    timestamptz,
  recipient_count integer not null default 0,
  sent_count      integer not null default 0,
  failed_count    integer not null default 0,
  is_active       boolean not null default true,
  is_deleted      boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      bigint,
  updated_by      bigint,
  metadata        jsonb not null default '{}'::jsonb
);
create index if not exists idx_broadcast_campaigns_status
  on comms.broadcast_campaigns (status, scheduled_at);

-- broadcast_recipients — per-recipient status for a campaign
create table if not exists comms.broadcast_recipients (
  id              bigserial primary key,
  public_id       uuid not null default gen_random_uuid(),
  campaign_id     bigint not null references comms.broadcast_campaigns(id) on delete cascade,
  recipient_id    bigint,
  recipient_type  text,
  target          text not null,
  status          text not null default 'pending'
    check (status in ('pending','sent','delivered','failed','bounced','skipped')),
  sent_at         timestamptz,
  error_message   text,
  metadata        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_broadcast_recipients_campaign
  on comms.broadcast_recipients (campaign_id, status);
create index if not exists idx_broadcast_recipients_status
  on comms.broadcast_recipients (status, sent_at desc);

-- email_tracking — opens/clicks events for email
create table if not exists comms.email_tracking (
  id             bigserial primary key,
  public_id      uuid not null default gen_random_uuid(),
  email_id       bigint not null references comms.email_messages(id) on delete cascade,
  event_type     text not null check (event_type in ('delivered','opened','clicked','bounced','complained','unsubscribed')),
  event_at       timestamptz not null default now(),
  user_agent     text,
  ip_address     inet,
  link_url       text,
  metadata       jsonb not null default '{}'::jsonb
);
create index if not exists idx_email_tracking_email
  on comms.email_tracking (email_id, event_at desc);
create index if not exists idx_email_tracking_event
  on comms.email_tracking (event_type, event_at desc);

-- sms_tracking — delivery events for SMS
create table if not exists comms.sms_tracking (
  id             bigserial primary key,
  public_id      uuid not null default gen_random_uuid(),
  sms_id         bigint not null references comms.sms_messages(id) on delete cascade,
  event_type     text not null check (event_type in ('queued','sent','delivered','failed')),
  event_at       timestamptz not null default now(),
  provider_code  text,
  provider_message text,
  metadata       jsonb not null default '{}'::jsonb
);
create index if not exists idx_sms_tracking_sms
  on comms.sms_tracking (sms_id, event_at desc);

-- whatsapp_tracking — delivery events for WhatsApp
create table if not exists comms.whatsapp_tracking (
  id             bigserial primary key,
  public_id      uuid not null default gen_random_uuid(),
  whatsapp_id    bigint not null references comms.whatsapp_messages(id) on delete cascade,
  event_type     text not null check (event_type in ('sent','delivered','read','failed')),
  event_at       timestamptz not null default now(),
  provider_code  text,
  provider_message text,
  metadata       jsonb not null default '{}'::jsonb
);
create index if not exists idx_whatsapp_tracking_msg
  on comms.whatsapp_tracking (whatsapp_id, event_at desc);

-- chatbot_feedback — thumbs up/down or free-text rating
create table if not exists comms.chatbot_feedback (
  id            bigserial primary key,
  public_id     uuid not null default gen_random_uuid(),
  session_id    bigint not null references comms.chatbot_sessions(id) on delete cascade,
  user_id       bigint,
  rating        integer check (rating between 1 and 5),
  feedback_text text,
  created_at    timestamptz not null default now(),
  metadata      jsonb not null default '{}'::jsonb
);
create index if not exists idx_chatbot_feedback_session
  on comms.chatbot_feedback (session_id, created_at desc);

-- message_attachments — attachments for any message type
create table if not exists comms.message_attachments (
  id              bigserial primary key,
  public_id       uuid not null default gen_random_uuid(),
  message_type    text not null check (message_type in ('email','sms','whatsapp','ticket','thread')),
  message_id      bigint not null,
  file_name       text not null,
  file_size_bytes bigint,
  mime_type       text,
  storage_path    text not null,
  download_url    text,
  created_at      timestamptz not null default now(),
  metadata        jsonb not null default '{}'::jsonb
);
create index if not exists idx_message_attachments_msg
  on comms.message_attachments (message_type, message_id);

-- ──────────────────────────────────────────────────────────────
-- PART C: indexes on existing tables (recipient_id, status, sent_at)
-- ──────────────────────────────────────────────────────────────

create index if not exists idx_email_messages_recipient_status
  on comms.email_messages (recipient_id, status, sent_at desc);
create index if not exists idx_email_messages_status_sent
  on comms.email_messages (status, sent_at desc);

create index if not exists idx_sms_messages_recipient_status
  on comms.sms_messages (recipient_id, status, sent_at desc);
create index if not exists idx_sms_messages_status_sent
  on comms.sms_messages (status, sent_at desc);

create index if not exists idx_whatsapp_messages_recipient_status
  on comms.whatsapp_messages (recipient_id, status, sent_at desc);
create index if not exists idx_whatsapp_messages_status_sent
  on comms.whatsapp_messages (status, sent_at desc);

create index if not exists idx_notifications_user_status
  on comms.notifications (user_id, status, created_at desc);
create index if not exists idx_notifications_status
  on comms.notifications (status, created_at desc);

create index if not exists idx_support_tickets_status
  on comms.support_tickets (status, opened_at desc);
create index if not exists idx_support_tickets_assigned
  on comms.support_tickets (assigned_to_user_id, status);

-- ──────────────────────────────────────────────────────────────
-- PART D: RLS — enable + 3 baseline policies per new table
-- ──────────────────────────────────────────────────────────────

do $$
declare
  t text;
  tables text[] := array[
    'portal_sessions',
    'notification_deliveries',
    'support_sla_tracking',
    'message_templates',
    'broadcast_campaigns',
    'broadcast_recipients',
    'email_tracking',
    'sms_tracking',
    'whatsapp_tracking',
    'chatbot_feedback',
    'message_attachments'
  ];
begin
  foreach t in array tables loop
    execute format('alter table comms.%I enable row level security', t);

    -- policy: authenticated read
    begin
      execute format($p$
        create policy "%1$s_read_auth" on comms.%1$I
          for select
          to authenticated
          using (true)
      $p$, t);
    exception when duplicate_object then null;
    end;

    -- policy: authenticated insert
    begin
      execute format($p$
        create policy "%1$s_insert_auth" on comms.%1$I
          for insert
          to authenticated
          with check (true)
      $p$, t);
    exception when duplicate_object then null;
    end;

    -- policy: service_role full access
    begin
      execute format($p$
        create policy "%1$s_service_all" on comms.%1$I
          for all
          to service_role
          using (true)
          with check (true)
      $p$, t);
    exception when duplicate_object then null;
    end;
  end loop;
end$$;

-- ──────────────────────────────────────────────────────────────
-- PART E: Seed 5 Hebrew message templates
-- ──────────────────────────────────────────────────────────────

insert into comms.message_templates (template_code, name, channel, subject, body, locale, variables)
values
  ('welcome', 'ברוכים הבאים', 'email',
   'ברוכים הבאים ל-{{company_name}}',
   'שלום {{customer_name}},\n\nברוכים הבאים! אנו שמחים שהצטרפת אלינו. כאן תוכל/י לראות את כל ההזמנות, החשבוניות והמסמכים שלך.\n\nלשירותך בכל עת,\nצוות {{company_name}}',
   'he-IL',
   '["customer_name","company_name"]'::jsonb),
  ('invoice_sent', 'חשבונית נשלחה', 'email',
   'חשבונית חדשה #{{invoice_number}}',
   'שלום {{customer_name}},\n\nמצורפת חשבונית #{{invoice_number}} על סך {{invoice_total}} ₪.\nמועד פירעון: {{due_date}}.\n\nניתן לצפות ולהוריד את החשבונית בקישור: {{invoice_url}}\n\nתודה,\n{{company_name}}',
   'he-IL',
   '["customer_name","invoice_number","invoice_total","due_date","invoice_url","company_name"]'::jsonb),
  ('payment_received', 'קבלת תשלום', 'email',
   'אישור קבלת תשלום #{{payment_number}}',
   'שלום {{customer_name}},\n\nקיבלנו את התשלום שלך על סך {{payment_amount}} ₪ בתאריך {{payment_date}}.\nמספר קבלה: {{payment_number}}.\n\nתודה על התשלום,\n{{company_name}}',
   'he-IL',
   '["customer_name","payment_number","payment_amount","payment_date","company_name"]'::jsonb),
  ('overdue_reminder', 'תזכורת לחשבונית בפיגור', 'whatsapp',
   null,
   'שלום {{customer_name}}, חשבונית #{{invoice_number}} על סך {{invoice_total}} ₪ בפיגור של {{days_overdue}} ימים. נשמח לסייע בהסדרת התשלום. {{company_name}}',
   'he-IL',
   '["customer_name","invoice_number","invoice_total","days_overdue","company_name"]'::jsonb),
  ('quote_followup', 'מעקב אחר הצעת מחיר', 'email',
   'הצעת מחיר #{{quote_number}} - רוצים לשמוע מכם',
   'שלום {{customer_name}},\n\nשלחנו לך הצעת מחיר #{{quote_number}} בסכום של {{quote_total}} ₪ בתאריך {{quote_date}}.\nנשמח לענות על שאלות ולסייע בהחלטה.\n\nלצפייה בהצעה: {{quote_url}}\n\nבברכה,\n{{company_name}}',
   'he-IL',
   '["customer_name","quote_number","quote_total","quote_date","quote_url","company_name"]'::jsonb)
on conflict (template_code) do nothing;

-- ============================================================
-- END 00065_comms_domain_complete.sql
-- ============================================================
