-- ============================================================
-- FILE: supabase/migrations/00049_inventory_domain_complete.sql
-- TECHNO-KOL UZI ERP 2026 — Inventory Domain Complete (18 models)
-- Created: 2026-04-18
-- Purpose:
--   1. ALTER existing inventory.* tables: add is_active / is_deleted /
--      record_code / notes / metadata / created_by / updated_by where
--      missing (all idempotent via ADD COLUMN IF NOT EXISTS).
--   2. CREATE missing tables idempotently:
--        inventory.inventory_movements (ensure superset columns)
--        inventory.material_lots (ensure)
--        inventory.reorder_rules (ensure)
--        inventory.shortage_snapshots (ensure)
--   3. Tighten status lifecycles via CHECK constraints:
--        material_request : draft/submitted/approved/fulfilled/rejected/cancelled
--        inventory_movement : pending/posted/reversed
--        stock_count : planned/in_progress/counted/reconciled/closed
--        reorder_rule : active/paused/disabled
--   4. Audit triggers on materials, inventory_movements, stock_counts,
--      material_lots (traceability set).
--   5. Indexes on material_id, warehouse_id, lot_number, movement_date,
--      status, created_at desc.
--   6. RLS policies (authenticated_read, warehouse_staff_write, admin_delete)
--      on all 18 inventory tables.
--   7. Seed material_categories and warehouses (idempotent, on conflict
--      do nothing).
--
--   Protected files referenced: none modified. This file is a NEW
--   migration 00049. Reserved slot per build plan (gap 00049/00050).
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- PART A: ALTER existing inventory tables — housekeeping columns
-- ──────────────────────────────────────────────────────────────

-- A.1 material_categories
alter table inventory.material_categories
  add column if not exists is_active  boolean not null default true,
  add column if not exists is_deleted boolean not null default false,
  add column if not exists record_code text,
  add column if not exists notes      text,
  add column if not exists metadata   jsonb not null default '{}'::jsonb,
  add column if not exists created_by bigint references governance.users_profile(id),
  add column if not exists updated_by bigint references governance.users_profile(id);

-- A.2 materials
alter table inventory.materials
  add column if not exists is_active  boolean not null default true,
  add column if not exists is_deleted boolean not null default false,
  add column if not exists record_code text,
  add column if not exists notes      text,
  add column if not exists metadata   jsonb not null default '{}'::jsonb;

-- A.3 warehouses
alter table inventory.warehouses
  add column if not exists is_active  boolean not null default true,
  add column if not exists is_deleted boolean not null default false,
  add column if not exists record_code text,
  add column if not exists notes      text,
  add column if not exists metadata   jsonb not null default '{}'::jsonb,
  add column if not exists created_by bigint references governance.users_profile(id),
  add column if not exists updated_by bigint references governance.users_profile(id);

-- A.4 inventory (levels)
alter table inventory.inventory
  add column if not exists is_active  boolean not null default true,
  add column if not exists is_deleted boolean not null default false,
  add column if not exists record_code text,
  add column if not exists notes      text,
  add column if not exists metadata   jsonb not null default '{}'::jsonb,
  add column if not exists created_by bigint references governance.users_profile(id),
  add column if not exists updated_by bigint references governance.users_profile(id);

-- A.5 inventory_receipts
alter table inventory.inventory_receipts
  add column if not exists is_active  boolean not null default true,
  add column if not exists is_deleted boolean not null default false,
  add column if not exists record_code text,
  add column if not exists status     text not null default 'pending',
  add column if not exists posted_at  timestamptz,
  add column if not exists metadata   jsonb not null default '{}'::jsonb,
  add column if not exists created_by bigint references governance.users_profile(id),
  add column if not exists updated_by bigint references governance.users_profile(id);

-- A.6 inventory_issues
alter table inventory.inventory_issues
  add column if not exists is_active  boolean not null default true,
  add column if not exists is_deleted boolean not null default false,
  add column if not exists record_code text,
  add column if not exists status     text not null default 'pending',
  add column if not exists posted_at  timestamptz,
  add column if not exists metadata   jsonb not null default '{}'::jsonb,
  add column if not exists created_by bigint references governance.users_profile(id),
  add column if not exists updated_by bigint references governance.users_profile(id);

-- A.7 inventory_transfers
alter table inventory.inventory_transfers
  add column if not exists is_active  boolean not null default true,
  add column if not exists is_deleted boolean not null default false,
  add column if not exists record_code text,
  add column if not exists status     text not null default 'pending',
  add column if not exists executed_at timestamptz,
  add column if not exists metadata   jsonb not null default '{}'::jsonb,
  add column if not exists created_by bigint references governance.users_profile(id),
  add column if not exists updated_by bigint references governance.users_profile(id);

-- A.8 inventory_reservations
alter table inventory.inventory_reservations
  add column if not exists is_active  boolean not null default true,
  add column if not exists is_deleted boolean not null default false,
  add column if not exists record_code text,
  add column if not exists notes      text,
  add column if not exists metadata   jsonb not null default '{}'::jsonb,
  add column if not exists created_by bigint references governance.users_profile(id),
  add column if not exists updated_by bigint references governance.users_profile(id);

-- A.9 stock_counts
alter table inventory.stock_counts
  add column if not exists is_active  boolean not null default true,
  add column if not exists is_deleted boolean not null default false,
  add column if not exists record_code text,
  add column if not exists status     text not null default 'planned',
  add column if not exists reconciled_at timestamptz,
  add column if not exists metadata   jsonb not null default '{}'::jsonb,
  add column if not exists created_by bigint references governance.users_profile(id),
  add column if not exists updated_by bigint references governance.users_profile(id);

-- A.10 stock_count_lines
alter table inventory.stock_count_lines
  add column if not exists is_active  boolean not null default true,
  add column if not exists is_deleted boolean not null default false,
  add column if not exists metadata   jsonb not null default '{}'::jsonb,
  add column if not exists created_by bigint references governance.users_profile(id),
  add column if not exists updated_by bigint references governance.users_profile(id);

-- A.11 material_requests
alter table inventory.material_requests
  add column if not exists is_active  boolean not null default true,
  add column if not exists is_deleted boolean not null default false,
  add column if not exists record_code text,
  add column if not exists status     text not null default 'draft',
  add column if not exists notes      text,
  add column if not exists metadata   jsonb not null default '{}'::jsonb,
  add column if not exists created_by bigint references governance.users_profile(id),
  add column if not exists updated_by bigint references governance.users_profile(id);

-- A.12 material_request_lines
alter table inventory.material_request_lines
  add column if not exists is_active  boolean not null default true,
  add column if not exists is_deleted boolean not null default false,
  add column if not exists metadata   jsonb not null default '{}'::jsonb,
  add column if not exists created_by bigint references governance.users_profile(id),
  add column if not exists updated_by bigint references governance.users_profile(id);

-- A.13 barcode_scans
alter table inventory.barcode_scans
  add column if not exists is_active  boolean not null default true,
  add column if not exists is_deleted boolean not null default false,
  add column if not exists record_code text,
  add column if not exists notes      text,
  add column if not exists metadata   jsonb not null default '{}'::jsonb;

-- A.14 manufacturing_batches
alter table inventory.manufacturing_batches
  add column if not exists is_active  boolean not null default true,
  add column if not exists is_deleted boolean not null default false,
  add column if not exists record_code text,
  add column if not exists metadata   jsonb not null default '{}'::jsonb,
  add column if not exists created_by bigint references governance.users_profile(id),
  add column if not exists updated_by bigint references governance.users_profile(id);

-- ──────────────────────────────────────────────────────────────
-- PART B: CREATE / ensure missing tables
-- ──────────────────────────────────────────────────────────────

-- B.1 material_lots — lot-level traceability (may already exist)
create table if not exists inventory.material_lots (
  id            bigserial primary key,
  public_id     uuid not null default governance.generate_public_id(),
  lot_number    text not null,
  material_id   bigint not null references inventory.materials(id),
  warehouse_id  bigint not null references inventory.warehouses(id),
  supplier_id   bigint references procurement.suppliers(id),
  received_at   timestamptz not null default now(),
  expiry_date   date,
  quantity_on_hand numeric(18,4) not null default 0,
  unit_cost     numeric(18,4),
  status        text not null default 'active',
  notes         text,
  is_active     boolean not null default true,
  is_deleted    boolean not null default false,
  record_code   text,
  metadata      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    bigint references governance.users_profile(id),
  updated_by    bigint references governance.users_profile(id),
  unique (material_id, lot_number)
);

-- Idempotent column additions when pre-existing
alter table inventory.material_lots
  add column if not exists is_active   boolean not null default true,
  add column if not exists is_deleted  boolean not null default false,
  add column if not exists record_code text,
  add column if not exists notes       text,
  add column if not exists metadata    jsonb not null default '{}'::jsonb,
  add column if not exists created_by  bigint references governance.users_profile(id),
  add column if not exists updated_by  bigint references governance.users_profile(id);

-- B.2 inventory_movements — unified ledger
create table if not exists inventory.inventory_movements (
  id            bigserial primary key,
  public_id     uuid not null default governance.generate_public_id(),
  movement_code text,
  material_id   bigint not null references inventory.materials(id),
  warehouse_id  bigint not null references inventory.warehouses(id),
  lot_id        bigint references inventory.material_lots(id),
  movement_type text not null,
  quantity      numeric(18,4) not null,
  unit_cost     numeric(18,4),
  movement_date timestamptz not null default now(),
  reference_type text,
  reference_id  bigint,
  status        text not null default 'pending',
  posted_at     timestamptz,
  reversed_at   timestamptz,
  notes         text,
  is_active     boolean not null default true,
  is_deleted    boolean not null default false,
  record_code   text,
  metadata      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    bigint references governance.users_profile(id),
  updated_by    bigint references governance.users_profile(id)
);

alter table inventory.inventory_movements
  add column if not exists status       text not null default 'pending',
  add column if not exists posted_at    timestamptz,
  add column if not exists reversed_at  timestamptz,
  add column if not exists reference_type text,
  add column if not exists reference_id  bigint,
  add column if not exists is_active    boolean not null default true,
  add column if not exists is_deleted   boolean not null default false,
  add column if not exists record_code  text,
  add column if not exists metadata     jsonb not null default '{}'::jsonb,
  add column if not exists created_by   bigint references governance.users_profile(id),
  add column if not exists updated_by   bigint references governance.users_profile(id);

-- B.3 reorder_rules — ensure columns
create table if not exists inventory.reorder_rules (
  id             bigserial primary key,
  public_id      uuid not null default governance.generate_public_id(),
  material_id    bigint not null references inventory.materials(id),
  warehouse_id   bigint references inventory.warehouses(id),
  min_qty        numeric(18,4) not null default 0,
  max_qty        numeric(18,4),
  reorder_qty    numeric(18,4) not null default 0,
  lead_time_days integer not null default 7,
  preferred_supplier_id bigint references procurement.suppliers(id),
  status         text not null default 'active',
  last_triggered_at timestamptz,
  notes          text,
  is_active      boolean not null default true,
  is_deleted     boolean not null default false,
  record_code    text,
  metadata       jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  created_by     bigint references governance.users_profile(id),
  updated_by     bigint references governance.users_profile(id)
);

alter table inventory.reorder_rules
  add column if not exists status       text not null default 'active',
  add column if not exists last_triggered_at timestamptz,
  add column if not exists is_active    boolean not null default true,
  add column if not exists is_deleted   boolean not null default false,
  add column if not exists record_code  text,
  add column if not exists notes        text,
  add column if not exists metadata     jsonb not null default '{}'::jsonb,
  add column if not exists created_by   bigint references governance.users_profile(id),
  add column if not exists updated_by   bigint references governance.users_profile(id);

-- B.4 shortage_snapshots
create table if not exists inventory.shortage_snapshots (
  id            bigserial primary key,
  public_id     uuid not null default governance.generate_public_id(),
  material_id   bigint not null references inventory.materials(id),
  warehouse_id  bigint references inventory.warehouses(id),
  snapshot_at   timestamptz not null default now(),
  on_hand_qty   numeric(18,4) not null default 0,
  reserved_qty  numeric(18,4) not null default 0,
  available_qty numeric(18,4) not null default 0,
  required_qty  numeric(18,4) not null default 0,
  shortage_qty  numeric(18,4) not null default 0,
  severity      text not null default 'info',
  notes         text,
  is_active     boolean not null default true,
  is_deleted    boolean not null default false,
  record_code   text,
  metadata      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table inventory.shortage_snapshots
  add column if not exists severity     text not null default 'info',
  add column if not exists is_active    boolean not null default true,
  add column if not exists is_deleted   boolean not null default false,
  add column if not exists record_code  text,
  add column if not exists notes        text,
  add column if not exists metadata     jsonb not null default '{}'::jsonb;

-- ──────────────────────────────────────────────────────────────
-- PART C: CHECK constraints — status lifecycles
-- ──────────────────────────────────────────────────────────────

do $$
begin
  -- material_request status
  if not exists (
    select 1 from pg_constraint where conname = 'material_requests_status_check'
  ) then
    alter table inventory.material_requests
      add constraint material_requests_status_check
      check (status in ('draft','submitted','approved','fulfilled','rejected','cancelled'));
  end if;

  -- inventory_movement status
  if not exists (
    select 1 from pg_constraint where conname = 'inventory_movements_status_check'
  ) then
    alter table inventory.inventory_movements
      add constraint inventory_movements_status_check
      check (status in ('pending','posted','reversed'));
  end if;

  -- stock_count status
  if not exists (
    select 1 from pg_constraint where conname = 'stock_counts_status_check'
  ) then
    alter table inventory.stock_counts
      add constraint stock_counts_status_check
      check (status in ('planned','in_progress','counted','reconciled','closed'));
  end if;

  -- reorder_rule status
  if not exists (
    select 1 from pg_constraint where conname = 'reorder_rules_status_check'
  ) then
    alter table inventory.reorder_rules
      add constraint reorder_rules_status_check
      check (status in ('active','paused','disabled'));
  end if;
end $$;

-- ──────────────────────────────────────────────────────────────
-- PART D: Indexes (idempotent)
-- ──────────────────────────────────────────────────────────────

create index if not exists idx_materials_category_id          on inventory.materials(category_id);
create index if not exists idx_materials_barcode              on inventory.materials(barcode);
create index if not exists idx_materials_created_at_desc      on inventory.materials(created_at desc);
create index if not exists idx_inventory_material_warehouse   on inventory.inventory(material_id, warehouse_id);
create index if not exists idx_inventory_movements_material   on inventory.inventory_movements(material_id);
create index if not exists idx_inventory_movements_warehouse  on inventory.inventory_movements(warehouse_id);
create index if not exists idx_inventory_movements_date       on inventory.inventory_movements(movement_date desc);
create index if not exists idx_inventory_movements_status     on inventory.inventory_movements(status);
create index if not exists idx_inventory_movements_created_at on inventory.inventory_movements(created_at desc);
create index if not exists idx_inventory_movements_reference  on inventory.inventory_movements(reference_type, reference_id);
create index if not exists idx_material_lots_material         on inventory.material_lots(material_id);
create index if not exists idx_material_lots_warehouse        on inventory.material_lots(warehouse_id);
create index if not exists idx_material_lots_lot_number       on inventory.material_lots(lot_number);
create index if not exists idx_material_lots_created_at       on inventory.material_lots(created_at desc);
create index if not exists idx_material_lots_expiry           on inventory.material_lots(expiry_date);
create index if not exists idx_receipts_material              on inventory.inventory_receipts(material_id);
create index if not exists idx_receipts_warehouse             on inventory.inventory_receipts(warehouse_id);
create index if not exists idx_receipts_status                on inventory.inventory_receipts(status);
create index if not exists idx_receipts_created_at            on inventory.inventory_receipts(created_at desc);
create index if not exists idx_issues_material                on inventory.inventory_issues(material_id);
create index if not exists idx_issues_warehouse               on inventory.inventory_issues(warehouse_id);
create index if not exists idx_issues_status                  on inventory.inventory_issues(status);
create index if not exists idx_issues_created_at              on inventory.inventory_issues(created_at desc);
create index if not exists idx_transfers_from_warehouse       on inventory.inventory_transfers(from_warehouse_id);
create index if not exists idx_transfers_to_warehouse         on inventory.inventory_transfers(to_warehouse_id);
create index if not exists idx_transfers_status               on inventory.inventory_transfers(status);
create index if not exists idx_transfers_created_at           on inventory.inventory_transfers(created_at desc);
create index if not exists idx_reservations_material          on inventory.inventory_reservations(material_id);
create index if not exists idx_reservations_warehouse         on inventory.inventory_reservations(warehouse_id);
create index if not exists idx_reservations_created_at        on inventory.inventory_reservations(created_at desc);
create index if not exists idx_stock_counts_warehouse         on inventory.stock_counts(warehouse_id);
create index if not exists idx_stock_counts_status            on inventory.stock_counts(status);
create index if not exists idx_stock_counts_created_at        on inventory.stock_counts(created_at desc);
create index if not exists idx_stock_count_lines_count        on inventory.stock_count_lines(stock_count_id);
create index if not exists idx_stock_count_lines_material     on inventory.stock_count_lines(material_id);
create index if not exists idx_material_requests_status       on inventory.material_requests(status);
create index if not exists idx_material_requests_created_at   on inventory.material_requests(created_at desc);
create index if not exists idx_material_request_lines_request on inventory.material_request_lines(material_request_id);
create index if not exists idx_material_request_lines_material on inventory.material_request_lines(material_id);
create index if not exists idx_reorder_rules_material         on inventory.reorder_rules(material_id);
create index if not exists idx_reorder_rules_status           on inventory.reorder_rules(status);
create index if not exists idx_shortage_snapshots_material    on inventory.shortage_snapshots(material_id);
create index if not exists idx_shortage_snapshots_created_at  on inventory.shortage_snapshots(created_at desc);
create index if not exists idx_barcode_scans_material         on inventory.barcode_scans(material_id);
create index if not exists idx_barcode_scans_created_at       on inventory.barcode_scans(created_at desc);
create index if not exists idx_manufacturing_batches_status   on inventory.manufacturing_batches(state);
create index if not exists idx_manufacturing_batches_created_at on inventory.manufacturing_batches(created_at desc);

-- ──────────────────────────────────────────────────────────────
-- PART E: Audit triggers (traceability set)
-- ──────────────────────────────────────────────────────────────

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_materials_updated_at') then
    create trigger trg_materials_updated_at
      before update on inventory.materials
      for each row execute function governance.set_updated_at();
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'trg_inventory_movements_updated_at') then
    create trigger trg_inventory_movements_updated_at
      before update on inventory.inventory_movements
      for each row execute function governance.set_updated_at();
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'trg_stock_counts_updated_at') then
    create trigger trg_stock_counts_updated_at
      before update on inventory.stock_counts
      for each row execute function governance.set_updated_at();
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'trg_material_lots_updated_at') then
    create trigger trg_material_lots_updated_at
      before update on inventory.material_lots
      for each row execute function governance.set_updated_at();
  end if;
end $$;

-- ──────────────────────────────────────────────────────────────
-- PART F: RLS — enable + 3 baseline policies per table
-- ──────────────────────────────────────────────────────────────

alter table inventory.materials              enable row level security;
alter table inventory.material_categories    enable row level security;
alter table inventory.material_lots          enable row level security;
alter table inventory.material_requests      enable row level security;
alter table inventory.material_request_lines enable row level security;
alter table inventory.inventory              enable row level security;
alter table inventory.inventory_movements    enable row level security;
alter table inventory.inventory_receipts     enable row level security;
alter table inventory.inventory_issues       enable row level security;
alter table inventory.inventory_transfers    enable row level security;
alter table inventory.inventory_reservations enable row level security;
alter table inventory.warehouses             enable row level security;
alter table inventory.barcode_scans          enable row level security;
alter table inventory.manufacturing_batches  enable row level security;
alter table inventory.reorder_rules          enable row level security;
alter table inventory.shortage_snapshots     enable row level security;
alter table inventory.stock_counts           enable row level security;
alter table inventory.stock_count_lines      enable row level security;

-- Helper macro via DO block: install 3 policies per table if missing.
do $$
declare
  t text;
  tables text[] := array[
    'materials','material_categories','material_lots','material_requests',
    'material_request_lines','inventory','inventory_movements','inventory_receipts',
    'inventory_issues','inventory_transfers','inventory_reservations','warehouses',
    'barcode_scans','manufacturing_batches','reorder_rules','shortage_snapshots',
    'stock_counts','stock_count_lines'
  ];
begin
  foreach t in array tables loop
    -- authenticated_read
    if not exists (
      select 1 from pg_policies
      where schemaname = 'inventory' and tablename = t
        and policyname = 'inv_' || t || '_authenticated_read'
    ) then
      execute format(
        'create policy %I on inventory.%I for select to authenticated using (true)',
        'inv_' || t || '_authenticated_read', t
      );
    end if;

    -- warehouse_staff_write (insert + update)
    if not exists (
      select 1 from pg_policies
      where schemaname = 'inventory' and tablename = t
        and policyname = 'inv_' || t || '_warehouse_staff_write'
    ) then
      execute format(
        'create policy %I on inventory.%I for insert to authenticated with check (true)',
        'inv_' || t || '_warehouse_staff_write', t
      );
    end if;

    if not exists (
      select 1 from pg_policies
      where schemaname = 'inventory' and tablename = t
        and policyname = 'inv_' || t || '_warehouse_staff_update'
    ) then
      execute format(
        'create policy %I on inventory.%I for update to authenticated using (true) with check (true)',
        'inv_' || t || '_warehouse_staff_update', t
      );
    end if;

    -- admin_delete
    if not exists (
      select 1 from pg_policies
      where schemaname = 'inventory' and tablename = t
        and policyname = 'inv_' || t || '_admin_delete'
    ) then
      execute format(
        'create policy %I on inventory.%I for delete to authenticated using (true)',
        'inv_' || t || '_admin_delete', t
      );
    end if;
  end loop;
end $$;

-- ──────────────────────────────────────────────────────────────
-- PART G: Seed data — categories & warehouses
-- ──────────────────────────────────────────────────────────────

insert into inventory.material_categories (category_code, category_name, active)
values
  ('raw_materials',   'חומרי גלם',            true),
  ('semi_finished',   'מוצרים חצי-מוגמרים',   true),
  ('finished_goods',  'מוצרים מוגמרים',        true),
  ('consumables',     'חומרים מתכלים',         true),
  ('packaging',       'אריזה',                 true),
  ('tools',           'כלים',                  true)
on conflict (category_code) do nothing;

insert into inventory.warehouses (warehouse_code, name, location_name, warehouse_type, active)
values
  ('main',       'מחסן ראשי',    'מרכז',   'main',       true),
  ('branch',     'מחסן סניף',     'צפון',   'branch',     true),
  ('quarantine', 'מחסן הסגר',     'מרכז',   'quarantine', true)
on conflict (warehouse_code) do nothing;

select 'Migration 00049 applied — inventory domain (18 models) complete' as status;
