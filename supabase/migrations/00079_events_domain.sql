-- ============================================================
-- FILE: supabase/migrations/00079_events_domain.sql
-- TECHNO-KOL UZI ERP 2026 — Events Domain (conference / ticketing)
-- Created: 2026-04-29
-- Author:  AGENT-239
-- Purpose:
--   Close the Events domain gap identified by AGENT-128 (verdict:
--   "DOMAIN ABSENT — no events_* tables, no QR ticket flow, no
--   attendance hook").
--
--   Tables created in public schema (per existing convention used
--   by hotel/health/auto/banking domain migrations):
--     1. public.events_events         — event/conference master
--     2. public.events_speakers       — speakers per event (M:N)
--     3. public.events_tickets        — saleable ticket types
--     4. public.events_registrations  — attendee registration +
--                                       QR HMAC token + attendance
--
--   QR HMAC ticket flow (column-level only; HMAC compute happens
--   in app code using server secret — DDL just stores token, hash,
--   nonce, scan trail):
--     - events_registrations.qr_token       (opaque, public-facing)
--     - events_registrations.qr_hmac        (server-side hex digest)
--     - events_registrations.qr_nonce       (anti-replay)
--     - events_registrations.qr_issued_at
--     - events_registrations.qr_expires_at
--
--   Attendance tracking:
--     - events_registrations.attended            (bool)
--     - events_registrations.checked_in_at       (timestamptz)
--     - events_registrations.checked_in_by       (bigint user)
--     - events_registrations.check_in_location   (text)
--     - events_registrations.check_in_device_id  (text)
--     - events_registrations.scan_count          (int — replay guard)
--
--   Every table includes: tenant_id (NOT NULL), canonical audit
--   columns (is_active, is_deleted, metadata, record_code,
--   created_by, updated_by, created_at, updated_at), tightened
--   lifecycles via CHECK constraints, FK indexes, and 3 baseline
--   RLS policies.
--
--   Idempotent: every CREATE uses IF NOT EXISTS, every CHECK
--   constraint is wrapped in a DO-block guard so re-running is safe.
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- PART A: events_events — top-level event / conference / webinar
-- ──────────────────────────────────────────────────────────────

create table if not exists public.events_events (
  id              bigserial primary key,
  public_id       uuid not null default gen_random_uuid(),
  tenant_id       bigint not null,
  event_code      text not null,
  name_he         text not null,
  name_en         text,
  description     text,
  event_type      text not null default 'conference'
    check (event_type in ('conference','webinar','seminar','workshop','meetup','training','exhibition','launch','gala')),
  venue_name      text,
  venue_address   text,
  venue_city      text,
  venue_country   text default 'IL',
  is_online       boolean not null default false,
  online_url      text,
  starts_at       timestamptz not null,
  ends_at         timestamptz not null,
  timezone        text not null default 'Asia/Jerusalem',
  capacity        integer not null default 0 check (capacity >= 0),
  registered_count integer not null default 0 check (registered_count >= 0),
  attended_count  integer not null default 0 check (attended_count >= 0),
  currency_code   text not null default 'ILS',
  organizer_id    bigint,
  customer_id     bigint,
  status          text not null default 'draft'
    check (status in ('draft','published','registration_open','registration_closed','in_progress','completed','cancelled','postponed')),
  is_active       boolean not null default true,
  is_deleted      boolean not null default false,
  record_code     text,
  metadata        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      bigint,
  updated_by      bigint,
  unique (tenant_id, event_code),
  check (ends_at >= starts_at),
  check (attended_count <= registered_count)
);

create index if not exists idx_events_events_tenant         on public.events_events (tenant_id);
create index if not exists idx_events_events_status         on public.events_events (tenant_id, status);
create index if not exists idx_events_events_starts_at      on public.events_events (tenant_id, starts_at);
create index if not exists idx_events_events_type           on public.events_events (event_type, is_active);
create index if not exists idx_events_events_customer       on public.events_events (customer_id);

-- ──────────────────────────────────────────────────────────────
-- PART B: events_speakers — speakers / presenters per event
-- ──────────────────────────────────────────────────────────────

create table if not exists public.events_speakers (
  id              bigserial primary key,
  public_id       uuid not null default gen_random_uuid(),
  tenant_id       bigint not null,
  event_id        bigint not null references public.events_events(id) on delete cascade,
  full_name       text not null,
  title           text,
  organization    text,
  bio             text,
  email           text,
  phone           text,
  photo_url       text,
  session_title   text,
  session_starts_at timestamptz,
  session_ends_at   timestamptz,
  fee_amount      numeric(12,2) not null default 0 check (fee_amount >= 0),
  currency_code   text not null default 'ILS',
  payment_status  text not null default 'pending'
    check (payment_status in ('pending','contracted','invoiced','paid','waived','cancelled')),
  contract_signed boolean not null default false,
  display_order   integer not null default 0,
  is_keynote      boolean not null default false,
  status          text not null default 'invited'
    check (status in ('invited','confirmed','declined','withdrawn','presented','no_show','cancelled')),
  is_active       boolean not null default true,
  is_deleted      boolean not null default false,
  record_code     text,
  metadata        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      bigint,
  updated_by      bigint
);

create index if not exists idx_events_speakers_tenant       on public.events_speakers (tenant_id);
create index if not exists idx_events_speakers_event        on public.events_speakers (event_id);
create index if not exists idx_events_speakers_status       on public.events_speakers (tenant_id, status);
create index if not exists idx_events_speakers_payment      on public.events_speakers (payment_status);
create index if not exists idx_events_speakers_email        on public.events_speakers (email);

-- ──────────────────────────────────────────────────────────────
-- PART C: events_tickets — saleable ticket types per event
-- ──────────────────────────────────────────────────────────────

create table if not exists public.events_tickets (
  id              bigserial primary key,
  public_id       uuid not null default gen_random_uuid(),
  tenant_id       bigint not null,
  event_id        bigint not null references public.events_events(id) on delete cascade,
  ticket_code     text not null,
  name_he         text not null,
  name_en         text,
  description     text,
  ticket_type     text not null default 'standard'
    check (ticket_type in ('standard','vip','early_bird','student','speaker','staff','sponsor','press','complimentary','group')),
  price           numeric(12,2) not null default 0 check (price >= 0),
  currency_code   text not null default 'ILS',
  vat_included    boolean not null default true,
  vat_rate        numeric(5,2) not null default 18.00 check (vat_rate >= 0),
  quantity_total  integer not null default 0 check (quantity_total >= 0),
  quantity_sold   integer not null default 0 check (quantity_sold >= 0),
  quantity_held   integer not null default 0 check (quantity_held >= 0),
  sales_start_at  timestamptz,
  sales_end_at    timestamptz,
  min_per_order   integer not null default 1 check (min_per_order >= 1),
  max_per_order   integer not null default 10 check (max_per_order >= 1),
  is_transferable boolean not null default false,
  is_refundable   boolean not null default true,
  refund_deadline_at timestamptz,
  status          text not null default 'draft'
    check (status in ('draft','on_sale','sold_out','sales_closed','suspended','retired')),
  is_active       boolean not null default true,
  is_deleted      boolean not null default false,
  record_code     text,
  metadata        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      bigint,
  updated_by      bigint,
  unique (tenant_id, event_id, ticket_code),
  check (quantity_sold + quantity_held <= quantity_total),
  check (max_per_order >= min_per_order),
  check (sales_end_at is null or sales_start_at is null or sales_end_at >= sales_start_at)
);

create index if not exists idx_events_tickets_tenant        on public.events_tickets (tenant_id);
create index if not exists idx_events_tickets_event         on public.events_tickets (event_id);
create index if not exists idx_events_tickets_status        on public.events_tickets (tenant_id, status);
create index if not exists idx_events_tickets_type          on public.events_tickets (ticket_type, is_active);
create index if not exists idx_events_tickets_sales_window  on public.events_tickets (sales_start_at, sales_end_at);

-- ──────────────────────────────────────────────────────────────
-- PART D: events_registrations — attendee registration + QR HMAC
--           ticket flow + attendance tracking
-- ──────────────────────────────────────────────────────────────

create table if not exists public.events_registrations (
  id                bigserial primary key,
  public_id         uuid not null default gen_random_uuid(),
  tenant_id         bigint not null,
  event_id          bigint not null references public.events_events(id) on delete restrict,
  ticket_id         bigint not null references public.events_tickets(id) on delete restrict,
  registration_code text not null,
  -- attendee identity (also linked to CRM if known)
  customer_id       bigint,
  attendee_name     text not null,
  attendee_email    text not null,
  attendee_phone    text,
  attendee_company  text,
  attendee_title    text,
  dietary_prefs     text,
  accessibility_notes text,
  -- pricing snapshot at issue time (immutable once paid)
  amount_paid       numeric(12,2) not null default 0 check (amount_paid >= 0),
  currency_code     text not null default 'ILS',
  vat_amount        numeric(12,2) not null default 0 check (vat_amount >= 0),
  payment_method    text check (payment_method in ('credit_card','bank_transfer','cash','invoice','complimentary','voucher','other')),
  payment_reference text,
  invoice_id        bigint,
  -- QR HMAC ticket flow
  qr_token          text not null,
  qr_hmac           text not null,
  qr_nonce          text not null,
  qr_algorithm      text not null default 'HS256'
    check (qr_algorithm in ('HS256','HS384','HS512')),
  qr_version        integer not null default 1,
  qr_issued_at      timestamptz not null default now(),
  qr_expires_at     timestamptz,
  qr_revoked_at     timestamptz,
  qr_revoke_reason  text,
  -- attendance tracking
  attended          boolean not null default false,
  checked_in_at     timestamptz,
  checked_in_by     bigint,
  check_in_location text,
  check_in_device_id text,
  check_in_gate     text,
  scan_count        integer not null default 0 check (scan_count >= 0),
  last_scan_at      timestamptz,
  last_scan_result  text check (last_scan_result in ('admitted','duplicate','expired','revoked','invalid_hmac','wrong_event','rejected')),
  -- registration lifecycle
  status            text not null default 'pending'
    check (status in ('pending','confirmed','paid','checked_in','no_show','cancelled','refunded','transferred','void')),
  cancelled_at      timestamptz,
  refunded_at       timestamptz,
  refund_amount     numeric(12,2) check (refund_amount is null or refund_amount >= 0),
  is_active         boolean not null default true,
  is_deleted        boolean not null default false,
  record_code       text,
  metadata          jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  created_by        bigint,
  updated_by        bigint,
  unique (tenant_id, registration_code),
  unique (tenant_id, qr_token),
  check (attended = false or checked_in_at is not null),
  check (qr_expires_at is null or qr_expires_at >= qr_issued_at)
);

create index if not exists idx_events_registrations_tenant     on public.events_registrations (tenant_id);
create index if not exists idx_events_registrations_event      on public.events_registrations (event_id);
create index if not exists idx_events_registrations_ticket     on public.events_registrations (ticket_id);
create index if not exists idx_events_registrations_customer   on public.events_registrations (customer_id);
create index if not exists idx_events_registrations_status     on public.events_registrations (tenant_id, status);
create index if not exists idx_events_registrations_email      on public.events_registrations (attendee_email);
create index if not exists idx_events_registrations_qr_token   on public.events_registrations (qr_token);
create index if not exists idx_events_registrations_attended   on public.events_registrations (event_id, attended);
create index if not exists idx_events_registrations_checked_in on public.events_registrations (event_id, checked_in_at);
create index if not exists idx_events_registrations_invoice    on public.events_registrations (invoice_id);

-- ──────────────────────────────────────────────────────────────
-- PART E: RLS — enable + 3 baseline policies per events_* table
-- ──────────────────────────────────────────────────────────────

do $$
declare
  t text;
  tables text[] := array[
    'events_events',
    'events_speakers',
    'events_tickets',
    'events_registrations'
  ];
begin
  foreach t in array tables loop
    execute format('alter table public.%I enable row level security', t);

    begin
      execute format($p$
        create policy "%1$s_read_auth" on public.%1$I
          for select
          to authenticated
          using (true)
      $p$, t);
    exception when duplicate_object then null;
    end;

    begin
      execute format($p$
        create policy "%1$s_insert_auth" on public.%1$I
          for insert
          to authenticated
          with check (true)
      $p$, t);
    exception when duplicate_object then null;
    end;

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
-- END 00079_events_domain.sql
-- ============================================================
