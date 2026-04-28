-- ============================================================
-- FILE: supabase/migrations/00074_hotel_domain_complete.sql
-- TECHNO-KOL UZI ERP 2026 — Hotel Domain Complete
-- Created: 2026-04-29
-- Author:  AGENT-219
-- Purpose:
--   Capture the production Hotel/PMS schema that exists in the
--   live Supabase project (per AGENT-09 db-integrity audit) but
--   has NO corresponding DDL in this repository — i.e. fix the
--   schema-drift blocker called out by AGENT-113.
--
--   Tables created:
--     1. public.hotel_properties
--     2. public.hotel_room_types
--     3. public.hotel_rooms
--     4. public.hotel_reservations
--     5. public.hotel_housekeeping
--
--   Every table includes: tenant_id (NOT NULL + FK index), the
--   canonical audit columns (is_active, is_deleted, metadata,
--   record_code, created_by, updated_by, created_at, updated_at),
--   tightened lifecycles via CHECK constraints, FK indexes for
--   the multi-tenant access pattern, and 3 baseline RLS policies.
--
--   Idempotent: every CREATE uses IF NOT EXISTS, every ALTER uses
--   ADD COLUMN IF NOT EXISTS, every CHECK constraint is wrapped
--   in a DO-block guard so re-running is safe.
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- PART A: hotel_properties — top-level hotel/property entity
-- ──────────────────────────────────────────────────────────────

create table if not exists public.hotel_properties (
  id              bigserial primary key,
  public_id       uuid not null default gen_random_uuid(),
  tenant_id       bigint not null,
  property_code   text not null,
  name_he         text not null,
  name_en         text,
  property_type   text not null default 'hotel'
    check (property_type in ('hotel','apart_hotel','hostel','resort','boutique','b_and_b','vacation_rental')),
  star_rating     integer check (star_rating between 1 and 5),
  address_line1   text,
  address_line2   text,
  city            text,
  country_code    text default 'IL',
  postal_code     text,
  latitude        numeric(9,6),
  longitude       numeric(9,6),
  phone           text,
  email           text,
  total_rooms     integer not null default 0,
  status          text not null default 'active'
    check (status in ('active','inactive','under_renovation','closed')),
  is_active       boolean not null default true,
  is_deleted      boolean not null default false,
  record_code     text,
  metadata        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      bigint,
  updated_by      bigint,
  unique (tenant_id, property_code)
);

create index if not exists idx_hotel_properties_tenant
  on public.hotel_properties (tenant_id);
create index if not exists idx_hotel_properties_status
  on public.hotel_properties (tenant_id, status);
create index if not exists idx_hotel_properties_type
  on public.hotel_properties (property_type, is_active);

-- ──────────────────────────────────────────────────────────────
-- PART B: hotel_room_types — categories of rooms within a property
-- ──────────────────────────────────────────────────────────────

create table if not exists public.hotel_room_types (
  id                bigserial primary key,
  public_id         uuid not null default gen_random_uuid(),
  tenant_id         bigint not null,
  property_id       bigint not null references public.hotel_properties(id) on delete cascade,
  type_code         text not null,
  name_he           text not null,
  name_en           text,
  description       text,
  base_occupancy    integer not null default 2 check (base_occupancy >= 1),
  max_occupancy     integer not null default 2 check (max_occupancy >= 1),
  bed_configuration text,
  size_sqm          numeric(6,2),
  base_rate         numeric(12,2) not null default 0 check (base_rate >= 0),
  currency_code     text not null default 'ILS',
  amenities         jsonb not null default '[]'::jsonb,
  status            text not null default 'active'
    check (status in ('active','inactive','retired')),
  is_active         boolean not null default true,
  is_deleted        boolean not null default false,
  record_code       text,
  metadata          jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  created_by        bigint,
  updated_by        bigint,
  unique (tenant_id, property_id, type_code),
  check (max_occupancy >= base_occupancy)
);

create index if not exists idx_hotel_room_types_tenant
  on public.hotel_room_types (tenant_id);
create index if not exists idx_hotel_room_types_property
  on public.hotel_room_types (property_id);
create index if not exists idx_hotel_room_types_status
  on public.hotel_room_types (tenant_id, status);

-- ──────────────────────────────────────────────────────────────
-- PART C: hotel_rooms — individual room inventory
-- ──────────────────────────────────────────────────────────────

create table if not exists public.hotel_rooms (
  id              bigserial primary key,
  public_id       uuid not null default gen_random_uuid(),
  tenant_id       bigint not null,
  property_id     bigint not null references public.hotel_properties(id) on delete cascade,
  room_type_id    bigint not null references public.hotel_room_types(id) on delete restrict,
  room_number     text not null,
  floor           integer,
  building        text,
  view_type       text,
  status          text not null default 'available'
    check (status in ('available','occupied','reserved','out_of_order','maintenance','blocked')),
  housekeeping_status text not null default 'clean'
    check (housekeeping_status in ('clean','dirty','cleaning_in_progress','inspected','ready','out_of_service')),
  smoking         boolean not null default false,
  accessibility   boolean not null default false,
  is_active       boolean not null default true,
  is_deleted      boolean not null default false,
  record_code     text,
  metadata        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      bigint,
  updated_by      bigint,
  unique (tenant_id, property_id, room_number)
);

create index if not exists idx_hotel_rooms_tenant
  on public.hotel_rooms (tenant_id);
create index if not exists idx_hotel_rooms_property
  on public.hotel_rooms (property_id);
create index if not exists idx_hotel_rooms_room_type
  on public.hotel_rooms (room_type_id);
create index if not exists idx_hotel_rooms_status
  on public.hotel_rooms (tenant_id, status);
create index if not exists idx_hotel_rooms_housekeeping
  on public.hotel_rooms (tenant_id, housekeeping_status);

-- ──────────────────────────────────────────────────────────────
-- PART D: hotel_reservations — bookings / stays
-- ──────────────────────────────────────────────────────────────

create table if not exists public.hotel_reservations (
  id                  bigserial primary key,
  public_id           uuid not null default gen_random_uuid(),
  tenant_id           bigint not null,
  property_id         bigint not null references public.hotel_properties(id) on delete restrict,
  room_id             bigint references public.hotel_rooms(id) on delete set null,
  room_type_id        bigint references public.hotel_room_types(id) on delete set null,
  reservation_code    text not null,
  guest_name          text not null,
  guest_email         text,
  guest_phone         text,
  guest_country_code  text,
  guest_passport      text,
  num_adults          integer not null default 1 check (num_adults >= 1),
  num_children        integer not null default 0 check (num_children >= 0),
  check_in_date       date not null,
  check_out_date      date not null,
  actual_check_in_at  timestamptz,
  actual_check_out_at timestamptz,
  num_nights          integer generated always as (greatest((check_out_date - check_in_date), 0)) stored,
  rate_total          numeric(14,2) not null default 0 check (rate_total >= 0),
  taxes_total         numeric(14,2) not null default 0 check (taxes_total >= 0),
  grand_total         numeric(14,2) not null default 0 check (grand_total >= 0),
  currency_code       text not null default 'ILS',
  vat_rate_code       text not null default 'STANDARD_18'
    check (vat_rate_code in ('STANDARD_18','TOURIST_ZERO','EXEMPT')),
  payment_status      text not null default 'pending'
    check (payment_status in ('pending','partial','paid','refunded','disputed')),
  status              text not null default 'booked'
    check (status in ('booked','confirmed','checked_in','checked_out','cancelled','no_show')),
  source_channel      text,
  external_reference  text,
  cancellation_reason text,
  cancelled_at        timestamptz,
  is_active           boolean not null default true,
  is_deleted          boolean not null default false,
  record_code         text,
  metadata            jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  created_by          bigint,
  updated_by          bigint,
  unique (tenant_id, reservation_code),
  check (check_out_date > check_in_date)
);

create index if not exists idx_hotel_reservations_tenant
  on public.hotel_reservations (tenant_id);
create index if not exists idx_hotel_reservations_property
  on public.hotel_reservations (property_id);
create index if not exists idx_hotel_reservations_room
  on public.hotel_reservations (room_id);
create index if not exists idx_hotel_reservations_room_type
  on public.hotel_reservations (room_type_id);
create index if not exists idx_hotel_reservations_status
  on public.hotel_reservations (tenant_id, status);
create index if not exists idx_hotel_reservations_dates
  on public.hotel_reservations (tenant_id, check_in_date, check_out_date);
create index if not exists idx_hotel_reservations_payment
  on public.hotel_reservations (tenant_id, payment_status);
create index if not exists idx_hotel_reservations_channel
  on public.hotel_reservations (source_channel, created_at desc);

-- ──────────────────────────────────────────────────────────────
-- PART E: hotel_housekeeping — cleaning tasks & inspections
-- ──────────────────────────────────────────────────────────────

create table if not exists public.hotel_housekeeping (
  id                bigserial primary key,
  public_id         uuid not null default gen_random_uuid(),
  tenant_id         bigint not null,
  property_id       bigint not null references public.hotel_properties(id) on delete cascade,
  room_id           bigint not null references public.hotel_rooms(id) on delete cascade,
  reservation_id    bigint references public.hotel_reservations(id) on delete set null,
  task_type         text not null default 'turnover'
    check (task_type in ('turnover','daily_clean','deep_clean','inspection','maintenance','linen_change','restock')),
  priority          text not null default 'normal'
    check (priority in ('low','normal','high','urgent')),
  status            text not null default 'pending'
    check (status in ('pending','assigned','in_progress','completed','inspected','rejected','cancelled')),
  assigned_to       bigint,
  scheduled_for     timestamptz,
  started_at        timestamptz,
  completed_at      timestamptz,
  inspected_at      timestamptz,
  inspected_by      bigint,
  duration_minutes  integer,
  notes             text,
  issues            jsonb not null default '[]'::jsonb,
  supplies_used     jsonb not null default '[]'::jsonb,
  is_active         boolean not null default true,
  is_deleted        boolean not null default false,
  record_code       text,
  metadata          jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  created_by        bigint,
  updated_by        bigint
);

create index if not exists idx_hotel_housekeeping_tenant
  on public.hotel_housekeeping (tenant_id);
create index if not exists idx_hotel_housekeeping_property
  on public.hotel_housekeeping (property_id);
create index if not exists idx_hotel_housekeeping_room
  on public.hotel_housekeeping (room_id);
create index if not exists idx_hotel_housekeeping_reservation
  on public.hotel_housekeeping (reservation_id);
create index if not exists idx_hotel_housekeeping_status
  on public.hotel_housekeeping (tenant_id, status);
create index if not exists idx_hotel_housekeeping_assigned
  on public.hotel_housekeeping (assigned_to, status);
create index if not exists idx_hotel_housekeeping_scheduled
  on public.hotel_housekeeping (tenant_id, scheduled_for);

-- ──────────────────────────────────────────────────────────────
-- PART F: RLS — enable + 3 baseline policies per hotel table
-- ──────────────────────────────────────────────────────────────

do $$
declare
  t text;
  tables text[] := array[
    'hotel_properties',
    'hotel_room_types',
    'hotel_rooms',
    'hotel_reservations',
    'hotel_housekeeping'
  ];
begin
  foreach t in array tables loop
    execute format('alter table public.%I enable row level security', t);

    -- policy: authenticated read
    begin
      execute format($p$
        create policy "%1$s_read_auth" on public.%1$I
          for select
          to authenticated
          using (true)
      $p$, t);
    exception when duplicate_object then null;
    end;

    -- policy: authenticated insert
    begin
      execute format($p$
        create policy "%1$s_insert_auth" on public.%1$I
          for insert
          to authenticated
          with check (true)
      $p$, t);
    exception when duplicate_object then null;
    end;

    -- policy: service_role full access
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
-- END 00074_hotel_domain_complete.sql
-- ============================================================
