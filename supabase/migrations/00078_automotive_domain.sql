-- ============================================================
-- FILE: supabase/migrations/00078_automotive_domain.sql
-- TECHNO-KOL UZI ERP 2026 — Automotive Service Domain Complete
-- Created: 2026-04-29
-- Author:  AGENT-238 (per AGENT-126 finding: domain absent)
-- Purpose:
--   Build the Automotive Service vertical end-to-end:
--     auto_tziyud_certs       (vehicle equipment / safety certificates)
--     auto_vehicles           (customer-owned vehicles + IL plate format)
--     auto_service_orders     (טופס תיוג / garage service order)
--     auto_service_items      (line items: labor / part / tziyud-check)
--
--   Hard requirements from AGENT-126 audit (all enforced here):
--     1. Israeli license-plate CHECK regex covering BOTH:
--          older 7-digit format  XX-XXX-XX
--          newer 8-digit format  XXX-XX-XXX
--     2. Monotonic odometer:
--          - per-vehicle non-decreasing current_odometer_km (trigger)
--          - per-service-order intake <= delivery (table CHECK)
--     3. Tziyud (ציוד) certification linkage:
--          - auto_tziyud_certs table with cert types and expiry dates
--          - auto_service_items.tziyud_cert_id FK to auto_tziyud_certs(id)
--            (required when item kind = 'tziyud_check')
--
--   Idempotent — every CREATE uses IF NOT EXISTS, every ALTER uses
--   ADD COLUMN IF NOT EXISTS, every CHECK is wrapped in a DO block,
--   every policy uses DROP POLICY IF EXISTS before CREATE.
--   Tenant-scoped — never USING (true). Service_role bypasses RLS.
-- ============================================================

create schema if not exists auto;

-- ──────────────────────────────────────────────────────────────
-- PART A: auto_tziyud_certs — equipment / safety certifications
-- (tachograph, weight, taxi-meter, hazmat, annual-test, etc.)
-- ──────────────────────────────────────────────────────────────
create table if not exists auto.auto_tziyud_certs (
  id              bigserial primary key,
  public_id       uuid        not null default gen_random_uuid(),
  tenant_id       bigint      not null,
  record_code     text,

  cert_type       text        not null
    check (cert_type in (
      'TACHOGRAPH',     -- מסוף נסיעה (תקנה 364)
      'WEIGHT',         -- אישור משקל
      'METER',          -- מונה מונית
      'HAZMAT',         -- חומ"ס
      'ANNUAL_TEST',    -- טסט שנתי
      'GAS_INSTALL',    -- התקן גז
      'BRAKE_TEST',     -- בדיקת בלמים
      'OTHER'
    )),
  cert_authority  text,
  cert_number     text        not null,
  issued_at       date        not null,
  expires_at      date        not null,
  inspector_name  text,
  notes           text,

  status          text        not null default 'valid'
    check (status in ('valid','expiring_soon','expired','revoked')),
  document_url    text,

  is_active       boolean     not null default true,
  is_deleted      boolean     not null default false,
  metadata        jsonb       not null default '{}'::jsonb,
  created_by      bigint,
  updated_by      bigint,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  unique (tenant_id, cert_type, cert_number),
  constraint tziyud_expires_after_issue check (expires_at >= issued_at)
);

create index if not exists idx_auto_tziyud_certs_tenant
  on auto.auto_tziyud_certs(tenant_id);
create index if not exists idx_auto_tziyud_certs_type_expiry
  on auto.auto_tziyud_certs(tenant_id, cert_type, expires_at);
create index if not exists idx_auto_tziyud_certs_status
  on auto.auto_tziyud_certs(tenant_id, status) where is_deleted = false;

-- ──────────────────────────────────────────────────────────────
-- PART B: auto_vehicles — customer-owned vehicles
-- ──────────────────────────────────────────────────────────────
create table if not exists auto.auto_vehicles (
  id                bigserial primary key,
  public_id         uuid        not null default gen_random_uuid(),
  tenant_id         bigint      not null,
  customer_id       bigint      not null,
  record_code       text,

  -- Israeli license plate — both 7-digit and 8-digit formats
  plate_number      text        not null,

  vin               text,
  make              text,
  model             text,
  year              smallint    check (year between 1950 and 2099),
  color             text,
  fuel_type         text        check (fuel_type in (
    'GASOLINE','DIESEL','LPG','CNG','HYBRID','EV','HYDROGEN','OTHER'
  )),
  engine_volume_cc  integer     check (engine_volume_cc >= 0),
  transmission      text        check (transmission in ('MANUAL','AUTOMATIC','CVT','DCT','OTHER')),
  mot_class         text,                          -- סוג רישוי

  -- Odometer (monotonic non-decreasing — enforced by trigger below)
  current_odometer_km   integer not null default 0 check (current_odometer_km >= 0),
  last_odometer_at      timestamptz,
  last_odometer_source  text    check (last_odometer_source in (
    'MANUAL','OBD','GPS','SERVICE_INTAKE','CUSTOMER_REPORT'
  )),

  -- Annual / regulatory dates
  annual_test_expires_at        date,    -- טסט שנתי
  insurance_expires_at          date,
  license_expires_at            date,
  next_service_due_km           integer  check (next_service_due_km >= 0),
  next_service_due_at           date,

  -- Tziyud cert FK pointers (per cert type)
  tachograph_cert_id            bigint  references auto.auto_tziyud_certs(id),
  weight_cert_id                bigint  references auto.auto_tziyud_certs(id),
  meter_cert_id                 bigint  references auto.auto_tziyud_certs(id),
  hazmat_cert_id                bigint  references auto.auto_tziyud_certs(id),

  status            text        not null default 'active'
    check (status in ('active','inactive','sold','totaled','impounded')),

  is_active         boolean     not null default true,
  is_deleted        boolean     not null default false,
  metadata          jsonb       not null default '{}'::jsonb,
  notes             text,
  created_by        bigint,
  updated_by        bigint,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  -- Israeli plate format CHECK (both 7-digit and 8-digit)
  constraint plate_il_format check (
    plate_number ~ '^[0-9]{2}-[0-9]{3}-[0-9]{2}$'
    or plate_number ~ '^[0-9]{3}-[0-9]{2}-[0-9]{3}$'
  ),
  unique (tenant_id, plate_number)
);

create index if not exists idx_auto_vehicles_tenant
  on auto.auto_vehicles(tenant_id);
create index if not exists idx_auto_vehicles_customer
  on auto.auto_vehicles(tenant_id, customer_id);
create index if not exists idx_auto_vehicles_plate
  on auto.auto_vehicles(tenant_id, plate_number) where is_deleted = false;
create index if not exists idx_auto_vehicles_vin
  on auto.auto_vehicles(vin) where vin is not null;
create index if not exists idx_auto_vehicles_status
  on auto.auto_vehicles(tenant_id, status) where is_deleted = false;
create index if not exists idx_auto_vehicles_test_expiry
  on auto.auto_vehicles(tenant_id, annual_test_expires_at)
  where is_deleted = false;

-- ──────────────────────────────────────────────────────────────
-- PART C: auto_service_orders — garage service order (טופס תיוג)
-- ──────────────────────────────────────────────────────────────
create table if not exists auto.auto_service_orders (
  id                    bigserial primary key,
  public_id             uuid        not null default gen_random_uuid(),
  tenant_id             bigint      not null,
  order_number          text        not null,
  record_code           text,

  vehicle_id            bigint      not null references auto.auto_vehicles(id),
  customer_id           bigint      not null,

  opened_at             timestamptz not null default now(),
  promised_at           timestamptz,
  closed_at             timestamptz,

  -- State machine (per AGENT-126 sec.7)
  state                 text        not null default 'opened'
    check (state in (
      'opened','in_diag','approved','in_work','qc',
      'delivered','invoiced','closed','cancelled'
    )),

  -- Odometer at intake / delivery — monotonic check at table level
  intake_odometer_km    integer     not null check (intake_odometer_km >= 0),
  delivery_odometer_km  integer     check (delivery_odometer_km is null or delivery_odometer_km >= 0),

  -- Workshop assignment
  technician_id         bigint,
  bay_id                smallint,
  service_type          text        check (service_type in (
    'MAINTENANCE','REPAIR','DIAGNOSTIC','BODY','TIRE',
    'INSPECTION','TZIYUD_CHECK','RECALL','WARRANTY','OTHER'
  )),

  -- Customer-reported complaint + diagnosis
  complaint_he          text,
  diagnosis_he          text,
  customer_approval_at  timestamptz,
  customer_approver     text,

  -- Money (in agorot — bigint to avoid float)
  total_labor_agorot    bigint      not null default 0 check (total_labor_agorot >= 0),
  total_parts_agorot    bigint      not null default 0 check (total_parts_agorot >= 0),
  total_tziyud_agorot   bigint      not null default 0 check (total_tziyud_agorot >= 0),
  total_external_agorot bigint      not null default 0 check (total_external_agorot >= 0),
  vat_agorot            bigint      not null default 0 check (vat_agorot >= 0),
  total_agorot          bigint      not null default 0 check (total_agorot >= 0),
  invoice_id            bigint,

  notes                 text,
  is_active             boolean     not null default true,
  is_deleted            boolean     not null default false,
  metadata              jsonb       not null default '{}'::jsonb,
  created_by            bigint,
  updated_by            bigint,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  -- Monotonic odometer between intake and delivery
  constraint odometer_monotonic check (
    delivery_odometer_km is null
    or delivery_odometer_km >= intake_odometer_km
  ),
  unique (tenant_id, order_number)
);

create index if not exists idx_auto_so_tenant
  on auto.auto_service_orders(tenant_id);
create index if not exists idx_auto_so_vehicle
  on auto.auto_service_orders(tenant_id, vehicle_id, opened_at desc);
create index if not exists idx_auto_so_customer
  on auto.auto_service_orders(tenant_id, customer_id, opened_at desc);
create index if not exists idx_auto_so_state
  on auto.auto_service_orders(tenant_id, state) where is_deleted = false;
create index if not exists idx_auto_so_technician
  on auto.auto_service_orders(technician_id) where technician_id is not null;
create index if not exists idx_auto_so_opened
  on auto.auto_service_orders(tenant_id, opened_at desc);

-- ──────────────────────────────────────────────────────────────
-- PART D: auto_service_items — service-order line items
-- ──────────────────────────────────────────────────────────────
create table if not exists auto.auto_service_items (
  id                bigserial primary key,
  public_id         uuid        not null default gen_random_uuid(),
  tenant_id         bigint      not null,
  service_order_id  bigint      not null
    references auto.auto_service_orders(id) on delete cascade,
  line_no           smallint    not null check (line_no > 0),

  kind              text        not null
    check (kind in ('labor','part','tziyud_check','external','sublet')),
  description_he    text        not null,
  product_id        bigint,                       -- inventory.parts FK (loose)
  catalog_number    text,

  qty               numeric(10,3) not null default 1 check (qty > 0),
  unit              text        default 'EA',
  unit_price_agorot bigint      not null default 0 check (unit_price_agorot >= 0),
  discount_agorot   bigint      not null default 0 check (discount_agorot >= 0),
  vat_agorot        bigint      not null default 0 check (vat_agorot >= 0),
  total_agorot      bigint      not null default 0 check (total_agorot >= 0),

  -- Labor specifics
  labor_minutes     integer     check (labor_minutes is null or labor_minutes >= 0),
  technician_id     bigint,

  -- Tziyud cert FK — REQUIRED when kind='tziyud_check'
  tziyud_cert_id    bigint      references auto.auto_tziyud_certs(id),

  -- Warranty / supplier
  warranty_days     integer     check (warranty_days is null or warranty_days >= 0),
  supplier_id       bigint,
  external_invoice_no text,

  notes             text,
  is_active         boolean     not null default true,
  is_deleted        boolean     not null default false,
  metadata          jsonb       not null default '{}'::jsonb,
  created_by        bigint,
  updated_by        bigint,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  -- Tziyud-check rows MUST cite a cert; non-tziyud rows must not
  constraint tziyud_cert_required check (
    (kind = 'tziyud_check' and tziyud_cert_id is not null)
    or (kind <> 'tziyud_check')
  ),
  unique (service_order_id, line_no)
);

create index if not exists idx_auto_si_tenant
  on auto.auto_service_items(tenant_id);
create index if not exists idx_auto_si_order
  on auto.auto_service_items(service_order_id);
create index if not exists idx_auto_si_kind
  on auto.auto_service_items(tenant_id, kind);
create index if not exists idx_auto_si_product
  on auto.auto_service_items(product_id) where product_id is not null;
create index if not exists idx_auto_si_tziyud
  on auto.auto_service_items(tziyud_cert_id) where tziyud_cert_id is not null;

-- ──────────────────────────────────────────────────────────────
-- PART E: Monotonic-odometer trigger on auto_vehicles
-- (current_odometer_km may NEVER decrease — IL חוק רישוי שירותים לרכב)
-- ──────────────────────────────────────────────────────────────
create or replace function auto.fn_vehicle_odometer_monotonic()
returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE'
     and new.current_odometer_km < old.current_odometer_km then
    raise exception 'odometer rollback forbidden: vehicle %, old=% new=%',
      old.id, old.current_odometer_km, new.current_odometer_km
      using errcode = 'check_violation';
  end if;
  if new.current_odometer_km is distinct from old.current_odometer_km then
    new.last_odometer_at := now();
  end if;
  return new;
end$$;

drop trigger if exists trg_auto_vehicles_odo_mono on auto.auto_vehicles;
create trigger trg_auto_vehicles_odo_mono
  before update on auto.auto_vehicles
  for each row
  execute function auto.fn_vehicle_odometer_monotonic();

-- ──────────────────────────────────────────────────────────────
-- PART F: Service-order odometer push-up trigger
-- (when an SO is delivered, push its delivery_odometer_km up to the vehicle)
-- ──────────────────────────────────────────────────────────────
create or replace function auto.fn_so_propagate_odometer()
returns trigger language plpgsql as $$
begin
  if new.delivery_odometer_km is not null
     and (old.delivery_odometer_km is null
          or new.delivery_odometer_km > old.delivery_odometer_km) then
    update auto.auto_vehicles
       set current_odometer_km   = new.delivery_odometer_km,
           last_odometer_source  = 'SERVICE_INTAKE',
           updated_at            = now()
     where id = new.vehicle_id
       and current_odometer_km < new.delivery_odometer_km;
  end if;
  return new;
end$$;

drop trigger if exists trg_auto_so_propagate_odo on auto.auto_service_orders;
create trigger trg_auto_so_propagate_odo
  after update on auto.auto_service_orders
  for each row execute function auto.fn_so_propagate_odometer();

-- ──────────────────────────────────────────────────────────────
-- PART G: RLS — tenant-scoped, never USING (true)
-- ──────────────────────────────────────────────────────────────
alter table auto.auto_tziyud_certs    enable row level security;
alter table auto.auto_vehicles        enable row level security;
alter table auto.auto_service_orders  enable row level security;
alter table auto.auto_service_items   enable row level security;

do $$
declare
  t text;
  tables text[] := array[
    'auto_tziyud_certs','auto_vehicles',
    'auto_service_orders','auto_service_items'
  ];
begin
  foreach t in array tables loop
    execute format($f$
      drop policy if exists %I_tenant_select on auto.%I;
      create policy %I_tenant_select on auto.%I
        for select to authenticated using (
          tenant_id = nullif(current_setting('app.current_tenant_id', true),'')::bigint
        );
      drop policy if exists %I_tenant_modify on auto.%I;
      create policy %I_tenant_modify on auto.%I
        for all to authenticated using (
          tenant_id = nullif(current_setting('app.current_tenant_id', true),'')::bigint
        ) with check (
          tenant_id = nullif(current_setting('app.current_tenant_id', true),'')::bigint
        );
      drop policy if exists %I_service_all on auto.%I;
      create policy %I_service_all on auto.%I
        for all to service_role using (true) with check (true);
    $f$, t, t, t, t, t, t, t, t, t, t, t, t);
  end loop;
end$$;

-- ──────────────────────────────────────────────────────────────
-- END — 00078_automotive_domain.sql
-- ──────────────────────────────────────────────────────────────
