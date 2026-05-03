-- ============================================================
-- AGENT-223 Patch 3 + 5 — Vendor Scoring close-the-loop
-- ============================================================
-- Per AGENT-223 spec, this single migration combines two
-- additions that were originally drafted as 00084/00085 in the
-- spec but renumbered to 00092 to fit the live migration ledger
-- (last existing migration: 00090_employee_balances.sql).
--
-- 1. New table: procurement.vendor_score_history
--      append-only snapshots written by score-persistence.js.
--      Drives the Supplier360 scoring tab + DECLINING_TREND risk
--      via vendor-scoring-listener.js loadSupplierHistory().
--
-- 2. Suppliers status alignment: align procurement.suppliers
--    status check with procurement.subcontractors (00047:370)
--    so 'blacklisted' is a recognized state. Add blacklist_reason
--    + blacklisted_at audit columns.
--
-- 3. DB guards: refuse RFQ invitation / PO insert against any
--    supplier whose status = 'blacklisted'. Layer-of-defense
--    behind the supplier.blacklist orchestrator action.
--
-- Append-only: this migration only ADDS objects. No DROP TABLE.
-- The single CHECK constraint replacement happens via
--   ALTER TABLE ... DROP CONSTRAINT IF EXISTS ... ;
--   ALTER TABLE ... ADD CONSTRAINT ... CHECK (...) ;
-- which is the canonical pattern used elsewhere in this repo.
-- ============================================================

-- ---------- 1. vendor_score_history ----------
create table if not exists procurement.vendor_score_history (
  id            bigserial primary key,
  supplier_id   bigint      not null references procurement.suppliers(id) on delete cascade,
  composite     numeric(5,2) not null,
  badge         text        not null,
  badge_en      text,
  risk_level    text        not null check (risk_level in ('low','medium','high','critical')),
  dimensions    jsonb       not null,
  risks         jsonb       not null default '[]'::jsonb,
  recommendations jsonb     not null default '[]'::jsonb,
  samples       integer     not null default 0,
  as_of         timestamptz not null,
  created_at    timestamptz not null default now()
);

create index if not exists idx_vsh_supplier_created
  on procurement.vendor_score_history(supplier_id, created_at desc);

-- Idempotency guard — same supplier + same as_of cannot be inserted
-- twice. score-persistence.js swallows error code 23505 to keep the
-- nightly cron and event listener idempotent.
create unique index if not exists uniq_vsh_supplier_asof
  on procurement.vendor_score_history(supplier_id, as_of);

alter table procurement.vendor_score_history enable row level security;

-- ---------- 2. Align suppliers.status with subcontractors ----------
alter table procurement.suppliers drop constraint if exists suppliers_status_check;
alter table procurement.suppliers
  add constraint suppliers_status_check
  check (status in (
    'active','preferred','monitor','on_hold','blacklisted','inactive','pending_review'
  ));

alter table procurement.suppliers
  add column if not exists blacklist_reason text;
alter table procurement.suppliers
  add column if not exists blacklisted_at  timestamptz;

-- ---------- 3. DB guards: RFQ invite + PO insert ----------
create or replace function procurement.guard_supplier_active()
returns trigger language plpgsql as $$
declare
  s text;
begin
  select status into s from procurement.suppliers where id = new.supplier_id;
  if s = 'blacklisted' then
    raise exception 'supplier % is blacklisted; cannot send RFQ/PO', new.supplier_id
      using errcode = 'P0001';
  end if;
  return new;
end
$$;

drop trigger if exists trg_guard_rfq_supplier on procurement.rfq_invitations;
create trigger trg_guard_rfq_supplier
  before insert on procurement.rfq_invitations
  for each row execute function procurement.guard_supplier_active();

drop trigger if exists trg_guard_po_supplier on procurement.purchase_orders;
create trigger trg_guard_po_supplier
  before insert on procurement.purchase_orders
  for each row execute function procurement.guard_supplier_active();
