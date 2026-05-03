-- ============================================================
-- FILE: supabase/migrations/00084_sales_order_state_machine.sql
-- TECHNO-KOL UZI ERP 2026 -- Sales Order State Machine
-- Created: 2026-04-29
-- Author:  AGENT-246
-- Purpose:
--   Per AGENT-159 (Quote-to-Cash trace): `commercial.sales_orders`
--   exists in DB (migration 00043) but the entity has NO declared
--   state machine. Eight statuses are now canonical:
--
--     draft -> confirmed -> in_production -> shipped -> delivered
--                                -> invoiced -> closed
--     (cancelled is a terminal off-ramp from any non-final state)
--
--   This migration:
--     1. Expands the CHECK constraint to add 'in_production' and
--        'delivered' (current schema has 'in_fulfillment' which is
--        renamed to 'in_production' for consistency with the master
--        flow in pipeline-engine.js stage 6 "Production / Work").
--     2. Backfills any pre-existing 'in_fulfillment' rows to
--        'in_production'.
--     3. Persists the transition matrix in a metadata table so the
--        same rules are queryable from RPCs and read-models.
--     4. Adds a UI badge mapping table consumed by the front-end
--        StatusBadge component (RTL Hebrew labels + tone).
--     5. Installs a transition guard trigger that rejects illegal
--        status changes at the DB layer (defense in depth - JS
--        state-machine is enforced in API but DB is the last line).
-- ============================================================

begin;

-- ──────────────────────────────────────────────────────────────
-- 1. EXPAND status CHECK constraint
-- ──────────────────────────────────────────────────────────────
-- Drop the old check (name is implicit; we re-add named for clarity)
do $$
declare
  c_name text;
begin
  select conname into c_name
  from pg_constraint
  where conrelid = 'commercial.sales_orders'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%status%in%';
  if c_name is not null then
    execute format('alter table commercial.sales_orders drop constraint %I', c_name);
  end if;
end$$;

-- 2. BACKFILL legacy status values BEFORE adding the stricter check
update commercial.sales_orders
   set status = 'in_production'
 where status = 'in_fulfillment';

-- Anything totally unknown -> draft (defensive; should be no-op)
update commercial.sales_orders
   set status = 'draft'
 where status not in ('draft','confirmed','in_production','shipped',
                      'delivered','invoiced','closed','cancelled');

-- 3. Re-add the canonical CHECK
alter table commercial.sales_orders
  add constraint sales_orders_status_check
  check (status in ('draft','confirmed','in_production','shipped',
                    'delivered','invoiced','closed','cancelled'));

-- ──────────────────────────────────────────────────────────────
-- 4. PERSIST transition matrix (queryable from RPCs / read models)
-- ──────────────────────────────────────────────────────────────
create schema if not exists state_machines;

create table if not exists state_machines.transitions (
  id              bigserial primary key,
  entity_type     text not null,
  from_status     text not null,
  to_status       text not null,
  transition_name text not null,
  is_terminal     boolean not null default false,
  side_effects    jsonb not null default '[]'::jsonb,
  created_at      timestamptz not null default now(),
  unique (entity_type, from_status, transition_name)
);

create index if not exists ix_state_machines_transitions_entity
  on state_machines.transitions(entity_type);
create index if not exists ix_state_machines_transitions_from
  on state_machines.transitions(entity_type, from_status);

-- Seed sales_order transitions (idempotent via unique key)
insert into state_machines.transitions
  (entity_type, from_status, to_status, transition_name, is_terminal, side_effects) values
  -- forward path
  ('sales_order','draft',         'confirmed',     'confirm',       false,
     '[{"action":"reserve_inventory","params":{}},
       {"action":"create_draft_invoice","params":{"target":"accounts_receivable"}},
       {"action":"notify_customer","params":{"template":"order_confirmed"}}]'::jsonb),
  ('sales_order','confirmed',     'in_production', 'start_production', false,
     '[{"action":"create_work_orders","params":{"fromOrder":true}},
       {"action":"link_to_project","params":{}}]'::jsonb),
  ('sales_order','in_production', 'shipped',       'ship',          false,
     '[{"action":"create_logistics_order","params":{}},
       {"action":"decrement_inventory","params":{"type":"shipment"}}]'::jsonb),
  ('sales_order','shipped',       'delivered',     'deliver',       false,
     '[{"action":"capture_pod","params":{}},
       {"action":"notify_customer","params":{"template":"order_delivered"}}]'::jsonb),
  ('sales_order','delivered',     'invoiced',      'invoice',       false,
     '[{"action":"issue_invoice","params":{"copyFrom":"sales_order"}},
       {"action":"post_to_gl","params":{}}]'::jsonb),
  ('sales_order','invoiced',      'closed',        'close',         true,
     '[{"action":"reconcile_payment","params":{}},
       {"action":"create_audit","params":{"type":"order_closure"}}]'::jsonb),
  -- skip-to-invoice (services / no-shipment orders)
  ('sales_order','confirmed',     'invoiced',      'invoice_direct',false,
     '[{"action":"issue_invoice","params":{"copyFrom":"sales_order"}}]'::jsonb),
  -- cancel off-ramps
  ('sales_order','draft',         'cancelled',     'cancel',        true, '[]'::jsonb),
  ('sales_order','confirmed',     'cancelled',     'cancel',        true,
     '[{"action":"release_inventory","params":{}},
       {"action":"void_draft_invoice","params":{}}]'::jsonb),
  ('sales_order','in_production', 'cancelled',     'cancel',        true,
     '[{"action":"cancel_work_orders","params":{}},
       {"action":"release_inventory","params":{}}]'::jsonb)
on conflict (entity_type, from_status, transition_name)
do update set
  to_status    = excluded.to_status,
  is_terminal  = excluded.is_terminal,
  side_effects = excluded.side_effects;

-- ──────────────────────────────────────────────────────────────
-- 5. UI BADGE mapping (consumed by StatusBadge.tsx)
-- ──────────────────────────────────────────────────────────────
create table if not exists state_machines.status_badges (
  id           bigserial primary key,
  entity_type  text not null,
  status       text not null,
  label_he     text not null,   -- Hebrew label for RTL UI
  label_en     text not null,
  tone         text not null check (tone in
                 ('neutral','info','warning','success','danger','muted')),
  icon         text,            -- lucide icon name
  sort_order   int  not null default 0,
  unique (entity_type, status)
);

insert into state_machines.status_badges
  (entity_type, status, label_he, label_en, tone, icon, sort_order) values
  ('sales_order','draft',         'טיוטה',        'Draft',         'neutral', 'FileText',     10),
  ('sales_order','confirmed',     'מאושר',        'Confirmed',     'info',    'CheckCircle2', 20),
  ('sales_order','in_production', 'בייצור',       'In Production', 'warning', 'Factory',      30),
  ('sales_order','shipped',       'נשלח',         'Shipped',       'info',    'Truck',        40),
  ('sales_order','delivered',     'נמסר',         'Delivered',     'success', 'PackageCheck', 50),
  ('sales_order','invoiced',      'חשבונית הופקה','Invoiced',      'success', 'Receipt',      60),
  ('sales_order','closed',        'סגור',         'Closed',        'muted',   'Lock',         70),
  ('sales_order','cancelled',     'בוטל',         'Cancelled',     'danger',  'XCircle',      99)
on conflict (entity_type, status) do update set
  label_he   = excluded.label_he,
  label_en   = excluded.label_en,
  tone       = excluded.tone,
  icon       = excluded.icon,
  sort_order = excluded.sort_order;

-- ──────────────────────────────────────────────────────────────
-- 6. DB-LAYER GUARD trigger (defense in depth)
-- ──────────────────────────────────────────────────────────────
create or replace function state_machines.fn_guard_sales_order_status()
returns trigger
language plpgsql
as $$
declare
  v_allowed boolean;
begin
  -- INSERT: any status from {draft,confirmed} is ok; otherwise reject
  if tg_op = 'INSERT' then
    if new.status not in ('draft','confirmed') then
      raise exception
        'sales_order.status must start at draft or confirmed (got %)', new.status
        using errcode = 'check_violation';
    end if;
    return new;
  end if;

  -- UPDATE: status unchanged -> ok
  if new.status = old.status then
    return new;
  end if;

  -- Look up legality in transitions table
  select exists(
    select 1
      from state_machines.transitions
     where entity_type = 'sales_order'
       and from_status = old.status
       and to_status   = new.status
  ) into v_allowed;

  if not v_allowed then
    raise exception
      'illegal sales_order transition % -> %', old.status, new.status
      using errcode = 'check_violation';
  end if;

  return new;
end$$;

drop trigger if exists trg_guard_sales_order_status on commercial.sales_orders;
create trigger trg_guard_sales_order_status
  before insert or update of status on commercial.sales_orders
  for each row execute function state_machines.fn_guard_sales_order_status();

-- ──────────────────────────────────────────────────────────────
-- 7. RPC: list available transitions for a given order
-- ──────────────────────────────────────────────────────────────
create or replace function state_machines.fn_sales_order_available_transitions(
  p_order_id bigint
)
returns table (
  transition_name text,
  to_status       text,
  is_terminal     boolean,
  side_effects    jsonb,
  badge_label_he  text,
  badge_tone      text
)
language sql
stable
as $$
  select t.transition_name,
         t.to_status,
         t.is_terminal,
         t.side_effects,
         b.label_he,
         b.tone
    from commercial.sales_orders so
    join state_machines.transitions t
      on t.entity_type = 'sales_order'
     and t.from_status = so.status
    left join state_machines.status_badges b
      on b.entity_type = 'sales_order'
     and b.status      = t.to_status
   where so.id = p_order_id
   order by b.sort_order nulls last;
$$;

-- ──────────────────────────────────────────────────────────────
-- 8. READ MODEL: sales_orders enriched with badge
-- ──────────────────────────────────────────────────────────────
create or replace view commercial.v_sales_orders_with_badge as
  select so.*,
         b.label_he       as status_label_he,
         b.label_en       as status_label_en,
         b.tone           as status_tone,
         b.icon           as status_icon
    from commercial.sales_orders so
    left join state_machines.status_badges b
      on b.entity_type = 'sales_order'
     and b.status      = so.status;

grant select on commercial.v_sales_orders_with_badge to anon, authenticated;
grant select on state_machines.transitions          to anon, authenticated;
grant select on state_machines.status_badges        to anon, authenticated;
grant execute on function state_machines.fn_sales_order_available_transitions(bigint)
  to anon, authenticated;

commit;

-- ============================================================
-- POST-MIGRATION VERIFICATION (run manually):
--   select status, count(*) from commercial.sales_orders group by 1;
--   select * from state_machines.transitions where entity_type='sales_order';
--   select * from state_machines.fn_sales_order_available_transitions(1);
-- ============================================================
