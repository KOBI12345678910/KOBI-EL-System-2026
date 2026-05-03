-- ============================================================
-- FILE: supabase/migrations/00082_food_domain.sql
-- TECHNO-KOL UZI ERP 2026 — Food / Restaurant Domain Complete
-- Created: 2026-04-29
-- Author:  AGENT-242 (per AGENT-114 finding: domain absent)
-- Purpose:
--   Build the Food / Restaurant vertical end-to-end:
--     food_restaurants
--     food_menu_categories
--     food_menu_items
--     food_orders
--     food_order_items
--     food_tables
--     food_reservations_table
--   Plus kashrut, allergens, and Wolt / 10bis / Cibus delivery
--   integration fields per AGENT-114 remediation list.
--
--   Idempotent — every CREATE uses IF NOT EXISTS, every ALTER uses
--   ADD COLUMN IF NOT EXISTS, every INSERT uses ON CONFLICT DO NOTHING.
--   Tenant-scoped, never USING (true).
-- ============================================================

create schema if not exists food;

-- ──────────────────────────────────────────────────────────────
-- PART A: food_restaurants — top-level establishment
-- ──────────────────────────────────────────────────────────────
create table if not exists food.food_restaurants (
  id              bigserial primary key,
  tenant_id       bigint      not null,
  record_code     text        unique,
  name            text        not null,
  legal_name      text,
  tax_id          text,
  branch_code     text,
  address         text,
  city            text,
  phone           text,
  email           text,
  manager_user_id bigint,

  -- Kashrut metadata (per AGENT-114 sec.3)
  kashrut_status        text not null default 'NOT_KOSHER'
    check (kashrut_status in (
      'NOT_KOSHER','KOSHER','KOSHER_LEHADRIN','MEHADRIN',
      'BADATZ','PASSOVER','MILK','MEAT','PARVE'
    )),
  kashrut_authority     text,
  kashrut_certificate_id text,
  kashrut_expires_at    date,
  is_shabbat_mode       boolean not null default false,

  -- Channel toggles
  accepts_dine_in      boolean not null default true,
  accepts_takeaway     boolean not null default true,
  accepts_delivery_own boolean not null default false,
  wolt_venue_id        text,
  tenbis_restaurant_id text,
  cibus_restaurant_id  text,

  status      text not null default 'active'
    check (status in ('active','closed','suspended','draft')),
  is_active   boolean     not null default true,
  is_deleted  boolean     not null default false,
  metadata    jsonb       not null default '{}'::jsonb,
  created_by  bigint,
  updated_by  bigint,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_food_restaurants_tenant   on food.food_restaurants(tenant_id);
create index if not exists idx_food_restaurants_status   on food.food_restaurants(status);
create index if not exists idx_food_restaurants_kashrut  on food.food_restaurants(kashrut_status);

-- ──────────────────────────────────────────────────────────────
-- PART B: food_menu_categories — menu sections
-- ──────────────────────────────────────────────────────────────
create table if not exists food.food_menu_categories (
  id            bigserial primary key,
  tenant_id     bigint not null,
  restaurant_id bigint not null references food.food_restaurants(id),
  record_code   text   unique,
  name          text   not null,
  name_he       text,
  display_order int    not null default 0,
  parent_id     bigint references food.food_menu_categories(id),

  available_dine_in    boolean not null default true,
  available_takeaway   boolean not null default true,
  available_delivery   boolean not null default true,

  is_active   boolean     not null default true,
  is_deleted  boolean     not null default false,
  metadata    jsonb       not null default '{}'::jsonb,
  created_by  bigint,
  updated_by  bigint,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_food_menu_categories_tenant     on food.food_menu_categories(tenant_id);
create index if not exists idx_food_menu_categories_restaurant on food.food_menu_categories(restaurant_id);

-- ──────────────────────────────────────────────────────────────
-- PART C: food_menu_items — sellable items
-- ──────────────────────────────────────────────────────────────
create table if not exists food.food_menu_items (
  id            bigserial primary key,
  tenant_id     bigint not null,
  restaurant_id bigint not null references food.food_restaurants(id),
  category_id   bigint references food.food_menu_categories(id),
  record_code   text   unique,
  sku           text,
  name          text   not null,
  name_he       text,
  description   text,

  price         numeric(12,2) not null default 0
    check (price >= 0),
  cost          numeric(12,2) check (cost is null or cost >= 0),
  vat_rate      numeric(5,2)  not null default 17.00,

  -- Kashrut / dietary (per AGENT-114 sec.3)
  kashrut_status text not null default 'NOT_KOSHER'
    check (kashrut_status in (
      'NOT_KOSHER','KOSHER','KOSHER_LEHADRIN','MEHADRIN',
      'BADATZ','PASSOVER','MILK','MEAT','PARVE'
    )),
  is_chametz     boolean not null default false,
  is_milk        boolean not null default false,
  is_meat        boolean not null default false,
  is_parve       boolean not null default false,
  is_vegetarian  boolean not null default false,
  is_vegan       boolean not null default false,
  is_gluten_free boolean not null default false,

  -- 14 EU 1169 / Israeli MoH allergens (per AGENT-114 sec.4)
  allergens     jsonb not null default '[]'::jsonb,
  spice_level   int   not null default 0 check (spice_level between 0 and 5),
  calories_kcal int   check (calories_kcal is null or calories_kcal >= 0),

  -- Channel availability
  available_dine_in    boolean not null default true,
  available_takeaway   boolean not null default true,
  available_delivery   boolean not null default true,
  wolt_item_id         text,
  tenbis_item_id       text,
  cibus_item_id        text,

  prep_time_minutes int,
  station           text check (station is null or station in (
    'cold','grill','fryer','pasta','pizza','bar','bakery','dessert'
  )),

  status      text not null default 'available'
    check (status in ('available','86ed','seasonal','draft','retired')),
  is_active   boolean     not null default true,
  is_deleted  boolean     not null default false,
  metadata    jsonb       not null default '{}'::jsonb,
  created_by  bigint,
  updated_by  bigint,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_food_menu_items_tenant     on food.food_menu_items(tenant_id);
create index if not exists idx_food_menu_items_restaurant on food.food_menu_items(restaurant_id);
create index if not exists idx_food_menu_items_category   on food.food_menu_items(category_id);
create index if not exists idx_food_menu_items_status     on food.food_menu_items(status);
create index if not exists idx_food_menu_items_kashrut    on food.food_menu_items(kashrut_status);
create index if not exists idx_food_menu_items_allergens  on food.food_menu_items using gin(allergens);

-- ──────────────────────────────────────────────────────────────
-- PART D: food_tables — front-of-house table register
-- ──────────────────────────────────────────────────────────────
create table if not exists food.food_tables (
  id            bigserial primary key,
  tenant_id     bigint not null,
  restaurant_id bigint not null references food.food_restaurants(id),
  record_code   text   unique,
  table_number  text   not null,
  section       text,
  seat_count    int    not null default 2 check (seat_count > 0),

  -- Table state machine (per AGENT-114 sec.6)
  status text not null default 'available'
    check (status in (
      'available','seated','ordered','served',
      'bill_pending','paid','cleared','out_of_service'
    )),
  current_server_id bigint,
  current_party_size int check (current_party_size is null or current_party_size > 0),
  seated_at        timestamptz,

  is_active   boolean     not null default true,
  is_deleted  boolean     not null default false,
  metadata    jsonb       not null default '{}'::jsonb,
  created_by  bigint,
  updated_by  bigint,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  unique (restaurant_id, table_number)
);

create index if not exists idx_food_tables_tenant     on food.food_tables(tenant_id);
create index if not exists idx_food_tables_restaurant on food.food_tables(restaurant_id);
create index if not exists idx_food_tables_status     on food.food_tables(status);

-- ──────────────────────────────────────────────────────────────
-- PART E: food_orders — order header
-- ──────────────────────────────────────────────────────────────
create table if not exists food.food_orders (
  id              bigserial primary key,
  tenant_id       bigint not null,
  restaurant_id   bigint not null references food.food_restaurants(id),
  record_code     text   unique,
  order_number    text   not null,

  -- Channel split (per AGENT-114 sec.5)
  order_channel text not null default 'DINE_IN'
    check (order_channel in (
      'DINE_IN','TAKEAWAY','DELIVERY_OWN',
      'DELIVERY_WOLT','DELIVERY_10BIS','DELIVERY_CIBUS'
    )),

  -- Dine-in linkage
  table_id    bigint references food.food_tables(id),
  party_size  int    check (party_size is null or party_size > 0),
  server_id   bigint,
  customer_id bigint,
  guest_name  text,
  guest_phone text,

  -- Delivery fields
  delivery_address    text,
  delivery_city       text,
  delivery_lat        numeric(10,7),
  delivery_lng        numeric(10,7),
  delivery_eta        timestamptz,
  delivery_courier_id text,
  delivery_status     text check (delivery_status is null or delivery_status in (
    'pending','assigned','picked_up','en_route','delivered','failed','returned'
  )),
  external_order_id   text,
  external_provider   text check (external_provider is null or external_provider in (
    'wolt','tenbis','cibus','own'
  )),
  delivery_fee        numeric(12,2) check (delivery_fee is null or delivery_fee >= 0),
  commission_amount   numeric(12,2) check (commission_amount is null or commission_amount >= 0),

  -- Money
  subtotal       numeric(12,2) not null default 0 check (subtotal >= 0),
  discount_total numeric(12,2) not null default 0 check (discount_total >= 0),
  service_charge numeric(12,2) not null default 0 check (service_charge >= 0),
  tip_amount     numeric(12,2) not null default 0 check (tip_amount >= 0),
  vat_total      numeric(12,2) not null default 0 check (vat_total >= 0),
  total          numeric(12,2) not null default 0 check (total >= 0),
  currency       text          not null default 'ILS',

  status text not null default 'open'
    check (status in (
      'draft','open','fired','served','bill_pending',
      'paid','closed','cancelled','refunded'
    )),
  fired_at   timestamptz,
  served_at  timestamptz,
  paid_at    timestamptz,
  closed_at  timestamptz,

  is_active   boolean     not null default true,
  is_deleted  boolean     not null default false,
  metadata    jsonb       not null default '{}'::jsonb,
  created_by  bigint,
  updated_by  bigint,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  unique (restaurant_id, order_number)
);

create index if not exists idx_food_orders_tenant     on food.food_orders(tenant_id);
create index if not exists idx_food_orders_restaurant on food.food_orders(restaurant_id);
create index if not exists idx_food_orders_channel    on food.food_orders(order_channel);
create index if not exists idx_food_orders_status     on food.food_orders(status);
create index if not exists idx_food_orders_table      on food.food_orders(table_id);
create index if not exists idx_food_orders_external   on food.food_orders(external_provider, external_order_id);

-- ──────────────────────────────────────────────────────────────
-- PART F: food_order_items — order lines
-- ──────────────────────────────────────────────────────────────
create table if not exists food.food_order_items (
  id          bigserial primary key,
  tenant_id   bigint not null,
  order_id    bigint not null references food.food_orders(id) on delete cascade,
  item_id     bigint not null references food.food_menu_items(id),
  record_code text   unique,

  quantity      numeric(10,3) not null default 1 check (quantity > 0),
  unit_price    numeric(12,2) not null default 0 check (unit_price >= 0),
  discount      numeric(12,2) not null default 0 check (discount >= 0),
  line_subtotal numeric(12,2) not null default 0 check (line_subtotal >= 0),
  line_vat      numeric(12,2) not null default 0 check (line_vat >= 0),
  line_total    numeric(12,2) not null default 0 check (line_total >= 0),

  -- Snapshotted kashrut + allergen data at order time
  kashrut_status_snapshot text,
  allergens_snapshot      jsonb not null default '[]'::jsonb,

  -- Modifiers / kitchen instructions
  modifiers       jsonb not null default '[]'::jsonb,
  special_request text,
  station         text,

  status text not null default 'pending'
    check (status in (
      'pending','fired','prepping','ready','served','voided','comped'
    )),
  fired_at  timestamptz,
  ready_at  timestamptz,
  served_at timestamptz,

  is_active   boolean     not null default true,
  is_deleted  boolean     not null default false,
  metadata    jsonb       not null default '{}'::jsonb,
  created_by  bigint,
  updated_by  bigint,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_food_order_items_tenant on food.food_order_items(tenant_id);
create index if not exists idx_food_order_items_order  on food.food_order_items(order_id);
create index if not exists idx_food_order_items_item   on food.food_order_items(item_id);
create index if not exists idx_food_order_items_status on food.food_order_items(status);

-- ──────────────────────────────────────────────────────────────
-- PART G: food_reservations_table — reservation slots
-- ──────────────────────────────────────────────────────────────
create table if not exists food.food_reservations_table (
  id            bigserial primary key,
  tenant_id     bigint not null,
  restaurant_id bigint not null references food.food_restaurants(id),
  table_id      bigint references food.food_tables(id),
  record_code   text   unique,

  guest_name      text not null,
  guest_phone     text,
  guest_email     text,
  party_size      int  not null check (party_size > 0),

  reservation_at  timestamptz not null,
  duration_minutes int not null default 90 check (duration_minutes > 0),

  source text not null default 'phone'
    check (source in ('phone','walkin','website','wolt','tenbis','cibus','partner')),

  -- Special requests
  special_request   text,
  allergen_notes    jsonb not null default '[]'::jsonb,
  kashrut_pref      text,

  status text not null default 'booked'
    check (status in (
      'booked','confirmed','seated','no_show','cancelled','completed'
    )),
  no_show_after timestamptz,
  seated_at     timestamptz,
  cancelled_at  timestamptz,
  cancel_reason text,

  is_active   boolean     not null default true,
  is_deleted  boolean     not null default false,
  metadata    jsonb       not null default '{}'::jsonb,
  created_by  bigint,
  updated_by  bigint,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_food_reservations_tenant     on food.food_reservations_table(tenant_id);
create index if not exists idx_food_reservations_restaurant on food.food_reservations_table(restaurant_id);
create index if not exists idx_food_reservations_table_id   on food.food_reservations_table(table_id);
create index if not exists idx_food_reservations_status     on food.food_reservations_table(status);
create index if not exists idx_food_reservations_at         on food.food_reservations_table(reservation_at);

-- ──────────────────────────────────────────────────────────────
-- PART H: RLS — tenant-scoped, never USING (true)
-- ──────────────────────────────────────────────────────────────
alter table food.food_restaurants        enable row level security;
alter table food.food_menu_categories    enable row level security;
alter table food.food_menu_items         enable row level security;
alter table food.food_tables             enable row level security;
alter table food.food_orders             enable row level security;
alter table food.food_order_items        enable row level security;
alter table food.food_reservations_table enable row level security;

do $$
declare
  t text;
  tables text[] := array[
    'food_restaurants','food_menu_categories','food_menu_items',
    'food_tables','food_orders','food_order_items','food_reservations_table'
  ];
begin
  foreach t in array tables loop
    execute format($f$
      drop policy if exists %I_tenant_select on food.%I;
      create policy %I_tenant_select on food.%I
        for select using (
          tenant_id = nullif(current_setting('app.current_tenant_id', true),'')::bigint
        );
      drop policy if exists %I_tenant_modify on food.%I;
      create policy %I_tenant_modify on food.%I
        for all using (
          tenant_id = nullif(current_setting('app.current_tenant_id', true),'')::bigint
        ) with check (
          tenant_id = nullif(current_setting('app.current_tenant_id', true),'')::bigint
        );
    $f$, t, t, t, t, t, t, t, t);
  end loop;
end$$;

-- ──────────────────────────────────────────────────────────────
-- PART I: Cross-table integrity — meat/milk separation guard
-- (per AGENT-114 sec.3 — KOSHER_LEHADRIN/MEHADRIN orders cannot mix
--  is_meat and is_milk items)
-- ──────────────────────────────────────────────────────────────
create or replace function food.fn_check_kashrut_separation()
returns trigger language plpgsql as $$
declare
  r_kashrut text;
  has_meat  boolean;
  has_milk  boolean;
  item_meat boolean;
  item_milk boolean;
begin
  select fr.kashrut_status into r_kashrut
    from food.food_restaurants fr
    join food.food_orders fo on fo.restaurant_id = fr.id
   where fo.id = new.order_id;

  if r_kashrut not in ('KOSHER_LEHADRIN','MEHADRIN','BADATZ') then
    return new;
  end if;

  select is_meat, is_milk into item_meat, item_milk
    from food.food_menu_items where id = new.item_id;

  select bool_or(mi.is_meat), bool_or(mi.is_milk)
    into has_meat, has_milk
    from food.food_order_items oi
    join food.food_menu_items mi on mi.id = oi.item_id
   where oi.order_id = new.order_id and oi.id <> coalesce(new.id, -1);

  if (item_meat and has_milk) or (item_milk and has_meat) then
    raise exception 'kashrut violation: order % cannot mix meat and milk items', new.order_id
      using errcode = 'check_violation';
  end if;
  return new;
end$$;

drop trigger if exists trg_food_kashrut_separation on food.food_order_items;
create trigger trg_food_kashrut_separation
  before insert or update on food.food_order_items
  for each row execute function food.fn_check_kashrut_separation();

-- ──────────────────────────────────────────────────────────────
-- PART J: Seed allergen vocabulary reference (idempotent)
-- ──────────────────────────────────────────────────────────────
create table if not exists food.food_allergen_vocab (
  code        text primary key,
  name_en     text not null,
  name_he     text,
  is_eu_1169  boolean not null default true
);

insert into food.food_allergen_vocab(code, name_en, name_he, is_eu_1169) values
  ('gluten',     'Gluten',          'גלוטן',     true),
  ('crustaceans','Crustaceans',     'סרטנים',    true),
  ('eggs',       'Eggs',            'ביצים',     true),
  ('fish',       'Fish',            'דגים',      true),
  ('peanuts',    'Peanuts',         'בוטנים',    true),
  ('soybeans',   'Soybeans',        'סויה',      true),
  ('milk',       'Milk',            'חלב',       true),
  ('tree_nuts',  'Tree nuts',       'אגוזים',    true),
  ('celery',     'Celery',          'סלרי',      true),
  ('mustard',    'Mustard',         'חרדל',      true),
  ('sesame',     'Sesame',          'שומשום',    true),
  ('sulphites',  'Sulphur dioxide', 'סולפיטים',  true),
  ('lupin',      'Lupin',           'לופין',     true),
  ('molluscs',   'Molluscs',        'רכיכות',    true)
on conflict (code) do nothing;

-- ──────────────────────────────────────────────────────────────
-- END — 00082_food_domain.sql
-- ──────────────────────────────────────────────────────────────
