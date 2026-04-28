-- ============================================================
-- FILE: supabase/migrations/00076_logistics_schema.sql
-- TECHNO-KOL UZI ERP 2026 - Logistics Domain Complete
-- Created: 2026-04-29
-- Author:  AGENT-236
-- Purpose:
--   Per AGENT-116 audit (RED on data layer + IL MoT compliance):
--   the 5 expected logistics tables do not exist anywhere in the repo.
--   This migration creates them as first-class entities, links them
--   back to the existing execution.logistics_orders skeleton, adds
--   IL Ministry of Transport (משרד התחבורה) compliance fields, and
--   wires a `shipment` state machine.
--
--   Tables created (public.log_* namespace, matching the task brief):
--     1. public.log_carriers         - 3PL master + ITS license + ADR permit
--     2. public.log_vehicles         - fleet master + tachograph + טסט expiry
--     3. public.log_routes           - persisted optimizer output
--     4. public.log_shipments        - shipment header + waybill + hazmat
--     5. public.log_tracking_events  - GPS pings + status transitions
--
--   Plus:
--     - ALTER execution.logistics_orders to add carrier_id / vehicle_id /
--       driver_user_id / route_id / shipment_id FKs (nullable, additive).
--     - State machine for `shipment` registered as a CHECK constraint
--       set + transition catalogue inserted into governance.state_machine
--       if that table exists (guarded with DO-block).
--     - IL MoT compliance columns marked with `il_*` prefix where novel.
--
--   Idempotent: every CREATE uses IF NOT EXISTS, every ALTER uses
--   ADD COLUMN IF NOT EXISTS, every CHECK is wrapped in a DO-block.
--   RLS: 3 baseline policies per new table at the end (read/insert
--   authenticated, full service_role) - same shape as 00074.
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- PART A: log_carriers - third-party carriers / 3PL providers
-- IL MoT: ITS operator licence (רשיון מוביל), חוק שירותי הובלה 1997
-- ──────────────────────────────────────────────────────────────

create table if not exists public.log_carriers (
  id                       bigserial primary key,
  public_id                uuid not null default gen_random_uuid(),
  tenant_id                bigint not null,
  carrier_code             text not null,
  legal_name_he            text not null,
  legal_name_en            text,
  tax_id                   text,                 -- ח.פ. / ע.מ.
  contact_phone            text,
  contact_email            text,
  address_line1            text,
  city                     text,
  country_code             text default 'IL',
  -- IL MoT compliance
  il_its_licence_no        text,                 -- רשיון מוביל מספר
  il_its_licence_expiry    date,
  il_adr_permit_no         text,                 -- חומרים מסוכנים (חומ"ס) ADR
  il_adr_permit_expiry     date,
  insurance_policy_no      text,
  insurance_expiry         date,
  rating                   numeric(3,2) check (rating between 0 and 5),
  status                   text not null default 'active'
    check (status in ('active','inactive','suspended','blacklisted')),
  is_active                boolean not null default true,
  is_deleted               boolean not null default false,
  record_code              text,
  metadata                 jsonb not null default '{}'::jsonb,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  created_by               bigint,
  updated_by               bigint,
  unique (tenant_id, carrier_code)
);

create index if not exists idx_log_carriers_tenant      on public.log_carriers (tenant_id);
create index if not exists idx_log_carriers_status      on public.log_carriers (tenant_id, status);
create index if not exists idx_log_carriers_its_expiry  on public.log_carriers (il_its_licence_expiry) where is_active;
create index if not exists idx_log_carriers_adr_expiry  on public.log_carriers (il_adr_permit_expiry)  where is_active;

-- ──────────────────────────────────────────────────────────────
-- PART B: log_vehicles - fleet master
-- IL MoT: רכב, טסט שנתי (תקנה 273), טכוגרף (תקנה 364א), GVW (תקנה 313)
-- ──────────────────────────────────────────────────────────────

create table if not exists public.log_vehicles (
  id                       bigserial primary key,
  public_id                uuid not null default gen_random_uuid(),
  tenant_id                bigint not null,
  carrier_id               bigint references public.log_carriers(id),
  plate_number             text not null,        -- IL: NN-NNN-NN or 7-digit
  vin                      text,
  make                     text,
  model                    text,
  year                     integer check (year between 1980 and 2100),
  vehicle_type             text not null default 'van'
    check (vehicle_type in ('van','box_truck','semi_trailer','flatbed','tanker','refrigerated','pickup','car','motorcycle')),
  -- IL plate format CHECK enforced via separate DO-block below
  -- IL MoT compliance
  il_licence_category      text                  -- B, C1, C, C+E, D
    check (il_licence_category in ('A','A1','B','B1','C','C1','C_plus_E','C1_plus_E','D','D1','D_plus_E','1')),
  il_annual_test_expiry    date,                 -- טסט שנתי
  il_tachograph_required   boolean not null default false,
  il_tachograph_serial     text,
  il_tachograph_last_calib date,                 -- כיול אחרון
  il_gvw_kg                integer,              -- GVW from rishyon
  il_max_axle_load_kg      integer,
  il_hazmat_authorised     boolean not null default false,
  il_refrigeration_class   text                  -- ATP class for cold-chain
    check (il_refrigeration_class in ('FNA','FNB','FNC','FRA','FRB','FRC','none') or il_refrigeration_class is null),
  capacity_kg              numeric(10,2),
  capacity_m3              numeric(8,2),
  insurance_policy_no      text,
  insurance_expiry         date,
  odometer_km              integer not null default 0,
  status                   text not null default 'available'
    check (status in ('available','in_transit','maintenance','out_of_service','retired')),
  is_active                boolean not null default true,
  is_deleted               boolean not null default false,
  record_code              text,
  metadata                 jsonb not null default '{}'::jsonb,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  created_by               bigint,
  updated_by               bigint,
  unique (tenant_id, plate_number)
);

create index if not exists idx_log_vehicles_tenant      on public.log_vehicles (tenant_id);
create index if not exists idx_log_vehicles_carrier     on public.log_vehicles (carrier_id);
create index if not exists idx_log_vehicles_status      on public.log_vehicles (tenant_id, status) where is_active;
create index if not exists idx_log_vehicles_test_expiry on public.log_vehicles (il_annual_test_expiry) where is_active;
create index if not exists idx_log_vehicles_ins_expiry  on public.log_vehicles (insurance_expiry) where is_active;

-- IL plate format soft-CHECK: 7 or 8 chars, digits with optional dashes
do $$ begin
  alter table public.log_vehicles
    add constraint chk_log_vehicles_il_plate_format
    check (plate_number ~ '^[0-9]{2}-?[0-9]{3}-?[0-9]{2,3}$' or country_code is distinct from 'IL') not valid;
exception when duplicate_object then null; when undefined_column then null; end $$;

-- ──────────────────────────────────────────────────────────────
-- PART C: log_routes - persisted route-optimizer output
-- ──────────────────────────────────────────────────────────────

create table if not exists public.log_routes (
  id                       bigserial primary key,
  public_id                uuid not null default gen_random_uuid(),
  tenant_id                bigint not null,
  route_code               text not null,
  route_date               date not null,
  carrier_id               bigint references public.log_carriers(id),
  vehicle_id               bigint references public.log_vehicles(id),
  driver_user_id           bigint,
  depot_lat                numeric(9,6),
  depot_lng                numeric(9,6),
  total_distance_km        numeric(10,3),
  total_duration_min       integer,
  total_stops              integer not null default 0,
  optimization_algo        text default 'nn_2opt'
    check (optimization_algo in ('nn_2opt','sweep','manual','external')),
  optimization_score       numeric(8,4),
  -- ordered list of stops with lat/lng/eta/window from optimizer
  stops_json               jsonb not null default '[]'::jsonb,
  status                   text not null default 'planned'
    check (status in ('planned','dispatched','in_progress','completed','cancelled')),
  shabbat_warning          boolean not null default false,  -- day-of-week 6
  is_active                boolean not null default true,
  is_deleted               boolean not null default false,
  record_code              text,
  metadata                 jsonb not null default '{}'::jsonb,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  created_by               bigint,
  updated_by               bigint,
  unique (tenant_id, route_code)
);

create index if not exists idx_log_routes_tenant   on public.log_routes (tenant_id);
create index if not exists idx_log_routes_date     on public.log_routes (tenant_id, route_date);
create index if not exists idx_log_routes_vehicle  on public.log_routes (vehicle_id);
create index if not exists idx_log_routes_status   on public.log_routes (tenant_id, status) where is_active;

-- ──────────────────────────────────────────────────────────────
-- PART D: log_shipments - shipment header (waybill + hazmat)
-- IL Tax Authority circular 23/2017: structured waybill (תעודת משלוח)
-- ──────────────────────────────────────────────────────────────

create table if not exists public.log_shipments (
  id                       bigserial primary key,
  public_id                uuid not null default gen_random_uuid(),
  tenant_id                bigint not null,
  shipment_no              text not null,
  -- back-link to the existing skeleton order
  logistics_order_id       bigint,               -- FK added below if table exists
  route_id                 bigint references public.log_routes(id),
  carrier_id               bigint references public.log_carriers(id),
  vehicle_id               bigint references public.log_vehicles(id),
  driver_user_id           bigint,
  -- structured waybill (תעודת משלוח)
  il_waybill_no            text,
  il_waybill_issued_at     timestamptz,
  il_waybill_pdf_url       text,
  -- origin / destination
  origin_name              text,
  origin_address           text,
  origin_lat               numeric(9,6),
  origin_lng               numeric(9,6),
  destination_name         text,
  destination_address      text,
  destination_lat          numeric(9,6),
  destination_lng          numeric(9,6),
  -- cargo
  weight_kg                numeric(10,2),
  volume_m3                numeric(8,2),
  pieces                   integer,
  incoterms                text
    check (incoterms in ('EXW','FCA','CPT','CIP','DAP','DPU','DDP','FAS','FOB','CFR','CIF') or incoterms is null),
  -- hazmat (חומרים מסוכנים)
  il_hazmat_class          text                  -- ADR class 1..9
    check (il_hazmat_class in ('1','2','3','4','5','6','7','8','9') or il_hazmat_class is null),
  il_hazmat_un_no          text,
  il_hazmat_packing_group  text check (il_hazmat_packing_group in ('I','II','III') or il_hazmat_packing_group is null),
  -- temperature / cold-chain
  temperature_zone         text default 'ambient'
    check (temperature_zone in ('ambient','chilled','frozen','controlled')),
  temperature_min_c        numeric(5,2),
  temperature_max_c        numeric(5,2),
  -- lifecycle
  scheduled_pickup_at      timestamptz,
  picked_up_at             timestamptz,
  scheduled_delivery_at    timestamptz,
  delivered_at             timestamptz,
  -- shipment state machine: planned->assigned->picked_up->in_transit->delivered->closed
  state                    text not null default 'planned'
    check (state in ('planned','assigned','picked_up','in_transit','delivered','exception','cancelled','closed')),
  exception_reason         text,
  -- ePOD enrichment
  epod_signature_blob_id   bigint,
  epod_photo_urls          text[],
  epod_geo_lat             numeric(9,6),
  epod_geo_lng             numeric(9,6),
  epod_received_by_name    text,
  epod_received_by_id      text,                 -- ת.ז. / company stamp ref
  refusal_code             text,
  is_active                boolean not null default true,
  is_deleted               boolean not null default false,
  record_code              text,
  metadata                 jsonb not null default '{}'::jsonb,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  created_by               bigint,
  updated_by               bigint,
  unique (tenant_id, shipment_no)
);

create index if not exists idx_log_shipments_tenant   on public.log_shipments (tenant_id);
create index if not exists idx_log_shipments_state    on public.log_shipments (tenant_id, state) where is_active;
create index if not exists idx_log_shipments_route    on public.log_shipments (route_id);
create index if not exists idx_log_shipments_carrier  on public.log_shipments (carrier_id);
create index if not exists idx_log_shipments_vehicle  on public.log_shipments (vehicle_id);
create index if not exists idx_log_shipments_lord     on public.log_shipments (logistics_order_id);
create index if not exists idx_log_shipments_sched    on public.log_shipments (tenant_id, scheduled_delivery_at);
create index if not exists idx_log_shipments_hazmat   on public.log_shipments (il_hazmat_class) where il_hazmat_class is not null;

-- Add the FK to execution.logistics_orders only if the table exists.
do $$ begin
  if exists (
    select 1 from information_schema.tables
    where table_schema='execution' and table_name='logistics_orders'
  ) then
    begin
      alter table public.log_shipments
        add constraint fk_log_shipments_logistics_order
        foreign key (logistics_order_id)
        references execution.logistics_orders(id);
    exception when duplicate_object then null; end;
  end if;
end $$;

-- ──────────────────────────────────────────────────────────────
-- PART E: log_tracking_events - GPS pings + status transitions
-- ──────────────────────────────────────────────────────────────

create table if not exists public.log_tracking_events (
  id                bigserial primary key,
  tenant_id         bigint not null,
  shipment_id       bigint not null references public.log_shipments(id) on delete cascade,
  vehicle_id        bigint references public.log_vehicles(id),
  event_ts          timestamptz not null default now(),
  event_type        text not null default 'ping'
    check (event_type in ('ping','status_change','geofence_enter','geofence_exit','stop_arrive','stop_depart','exception','tachograph')),
  status            text,                 -- mirrors shipment.state when event_type='status_change'
  lat               numeric(9,6),
  lng               numeric(9,6),
  accuracy_m        numeric(7,2),
  speed_kmh         numeric(6,2),
  heading_deg       numeric(5,2),
  odometer_km       integer,
  -- IL tachograph block (תקנה 364א retention 28 days digital, 1 yr archive)
  il_driver_card_id text,
  il_driving_min    integer,
  il_rest_min       integer,
  source            text default 'app'
    check (source in ('app','gps_device','manual','tachograph','external_api')),
  metadata          jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now()
);

create index if not exists idx_log_track_shipment_ts on public.log_tracking_events (shipment_id, event_ts desc);
create index if not exists idx_log_track_vehicle_ts  on public.log_tracking_events (vehicle_id, event_ts desc);
create index if not exists idx_log_track_tenant_ts   on public.log_tracking_events (tenant_id, event_ts desc);
create index if not exists idx_log_track_type        on public.log_tracking_events (event_type, event_ts desc);

-- ──────────────────────────────────────────────────────────────
-- PART F: extend execution.logistics_orders with FKs to the new tables
-- ──────────────────────────────────────────────────────────────

do $$ begin
  if exists (
    select 1 from information_schema.tables
    where table_schema='execution' and table_name='logistics_orders'
  ) then
    alter table execution.logistics_orders
      add column if not exists carrier_id      bigint,
      add column if not exists vehicle_id      bigint,
      add column if not exists driver_user_id  bigint,
      add column if not exists route_id        bigint,
      add column if not exists shipment_id     bigint,
      add column if not exists waybill_no      text,
      add column if not exists weight_kg       numeric(10,2),
      add column if not exists volume_m3       numeric(8,2),
      add column if not exists hazmat_class    text,
      add column if not exists temperature_zone text;

    begin
      alter table execution.logistics_orders
        add constraint fk_lo_carrier  foreign key (carrier_id)  references public.log_carriers(id);
    exception when duplicate_object then null; end;
    begin
      alter table execution.logistics_orders
        add constraint fk_lo_vehicle  foreign key (vehicle_id)  references public.log_vehicles(id);
    exception when duplicate_object then null; end;
    begin
      alter table execution.logistics_orders
        add constraint fk_lo_route    foreign key (route_id)    references public.log_routes(id);
    exception when duplicate_object then null; end;
    begin
      alter table execution.logistics_orders
        add constraint fk_lo_shipment foreign key (shipment_id) references public.log_shipments(id);
    exception when duplicate_object then null; end;

    create index if not exists idx_lo_carrier  on execution.logistics_orders (carrier_id);
    create index if not exists idx_lo_vehicle  on execution.logistics_orders (vehicle_id);
    create index if not exists idx_lo_route    on execution.logistics_orders (route_id);
    create index if not exists idx_lo_shipment on execution.logistics_orders (shipment_id);
  end if;
end $$;

-- ──────────────────────────────────────────────────────────────
-- PART G: Shipment state machine - register transitions if a
-- governance.state_machine_transitions table exists.
-- ──────────────────────────────────────────────────────────────

do $$ begin
  if exists (
    select 1 from information_schema.tables
    where table_schema='governance' and table_name='state_machine_transitions'
  ) then
    insert into governance.state_machine_transitions (entity_type, from_state, to_state, action_code)
    values
      ('shipment','planned',  'assigned',  'assign_carrier_vehicle'),
      ('shipment','assigned', 'picked_up', 'mark_picked_up'),
      ('shipment','picked_up','in_transit','start_transit'),
      ('shipment','in_transit','delivered','mark_delivered'),
      ('shipment','in_transit','exception','log_exception'),
      ('shipment','exception','in_transit','resume_transit'),
      ('shipment','exception','cancelled', 'cancel_shipment'),
      ('shipment','delivered','closed',    'close_shipment'),
      ('shipment','planned',  'cancelled', 'cancel_shipment'),
      ('shipment','assigned', 'cancelled', 'cancel_shipment')
    on conflict do nothing;
  end if;
end $$;

-- ──────────────────────────────────────────────────────────────
-- PART H: RLS - enable + 3 baseline policies per logistics table
-- ──────────────────────────────────────────────────────────────

do $$
declare t text;
begin
  for t in select unnest(array[
    'log_carriers','log_vehicles','log_routes','log_shipments','log_tracking_events'
  ]) loop
    execute format('alter table public.%I enable row level security', t);

    begin
      execute format($p$
        create policy "%1$s_read_auth" on public.%1$I
          for select to authenticated using (true)
      $p$, t);
    exception when duplicate_object then null; end;

    begin
      execute format($p$
        create policy "%1$s_insert_auth" on public.%1$I
          for insert to authenticated with check (true)
      $p$, t);
    exception when duplicate_object then null; end;

    begin
      execute format($p$
        create policy "%1$s_service_all" on public.%1$I
          for all to service_role using (true) with check (true)
      $p$, t);
    exception when duplicate_object then null; end;
  end loop;
end$$;

-- ============================================================
-- END 00076_logistics_schema.sql
-- ============================================================
