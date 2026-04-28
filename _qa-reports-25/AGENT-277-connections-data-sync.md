# AGENT-277 - CONNECTIONS #2: Duplicate / Parallel Tables, Canonical + Sync

**Project:** kobi-el-system-2026 (`ponypxhushxeskxgrmha`)
**Scope:** Identify parallel `legacy public.*` (vertical-prefixed) vs `canonical <domain>.*` tables surfaced by Agent 09; per pair, name the source of truth and propose either a sync trigger (parallel run) or a one-shot migration (legacy retire).
**Date:** 2026-04-29
**Auditor:** Agent 277 - Connections #2 (Data Sync)
**Inputs:** `_qa-reports-25/AGENT-09-db-integrity.md`, `supabase/migrations/00000-00087`, `_master-registry/domains/commercial.md`, `onyx-procurement/src/pipeline/wiring-spec.js`

---

## Status

**FAIL - 7 confirmed parallel-table families on the customer-data surface, plus 2 noise-pair dead tables.**

| Family | Legacy (`public.*`) | Canonical | State | Recommended action |
|---|---|---|---|---|
| F1 - CRM | `crm_companies`, `crm_contacts`, `crm_deals`, `crm_pipelines`, `crm_activities`, `crm_tasks` | `commercial.customers`, `commercial.customer_contacts`, `commercial.opportunities`, `commercial.pipeline_stages`, `commercial.crm_activities`, `commercial.leads` | Both populated; legacy is what the front-end currently calls | **Phase 1 sync trigger -> Phase 2 cutover -> Phase 3 drop** |
| F2 - AR Invoicing | `ar_invoices`, `ar_invoice_lines`, `ar_customers`, `ar_credit_notes`, `ar_receipts`, `ar_receipt_allocations` | `finance.invoices`, `finance.invoice_lines`, `commercial.customers` (re-use), `finance.collection_actions`, `finance.payment_allocations` | Legacy is books-of-record today; canonical `finance.*` is partial | **One-shot backfill of `finance.invoices` from `ar_invoices` + DB view alias** |
| F3 - AP / Vendor | `ap_invoices`, `ap_invoice_lines`, `ap_vendors`, `ap_vendor_contacts`, `ap_payments`, `ap_payment_allocations`, `ap_price_history` | `procurement.suppliers`, `procurement.supplier_contacts`, `procurement.supplier_invoices`, `finance.payment_allocations` | Legacy active; canonical `procurement.suppliers` exists with overlapping fields | **Sync trigger (suppliers) + one-shot rename (`ap_invoices` -> `procurement.supplier_invoices`)** |
| F4 - Procurement | `proc_purchase_orders`, `proc_po_lines`, `proc_requisitions`, `proc_requisition_lines`, `proc_rfqs`, `proc_rfq_items`, `proc_rfq_vendors`, `proc_goods_receipts`, `proc_grn_lines` | `procurement.purchase_orders`, `procurement.purchase_order_lines`, `procurement.rfqs`, `procurement.rfq_items`, `procurement.rfq_supplier_invites`, `procurement.goods_receipts`, `procurement.goods_receipt_lines`, `procurement.contracts` | Two complete schemas, near 1:1 column mapping | **One-shot migration to canonical (data move + rename)** |
| F5 - Inventory | `inv_stock`, `inv_warehouses`, `inv_locations`, `inv_items`, `inv_transactions`, `inv_count_sheets`, `inv_count_lines`, `inventory` (singular orphan) | `inventory.inventory`, `inventory.warehouses`, `inventory.materials`, `inventory.material_categories`, `inventory.inventory_movements`, `inventory.stock_counts`, `inventory.stock_count_lines`, `inventory.material_lots` | Legacy is API-facing; canonical has lots/movements that legacy lacks | **Sync trigger both ways for stock balance until lots are wired; then one-shot** |
| F6 - HR / Workforce | `hr_employees`, `hr_payslips`, `hr_leave_requests`, `hr_performance_reviews` | `workforce.employees`, `workforce.wage_slips` (= payslips), `workforce.leave_requests`, `workforce.hr_profiles` | Both populated; payroll runtime hits `workforce.*` while UI hits `hr_*` | **One-shot migration `hr_employees` -> `workforce.employees`; foreign-key swing** |
| F7 - PM / Execution | `pm_projects`, `pm_tasks`, `pm_milestones`, `pm_time_entries` | `execution.projects`, `execution.tasks`, `execution.project_milestones`, `workforce.attendance` (time entries) | Legacy is light; canonical `execution.*` is the system-of-record per `wiring-spec.js` | **One-shot migration to canonical** |
| N1 - Singular orphans | `inventory` (singular), `invoices` (singular) | `inventory.inventory`, `finance.invoices` / `ar_invoices` | Pre-redesign tables, both empty per Agent 09 §Orphaned | **DROP in M82 (already proposed by Agent 09)** |
| N2 - GL ledger | `gl_accounts`, `gl_journal_entries`, `gl_journal_lines`, `gl_periods`, `gl_exchange_rates`, `gl_audit_trail`, `gl_recurring_entries` | none yet (no `finance.gl_*`) | Single home in `public.gl_*` - **NOT a duplicate** | No action (note in registry that public.gl_* is canonical until a `gl.*` schema is built) |

The 5 platform-level tables flagged by Agent 09 (`platform_api_keys`, `platform_invoices`, `platform_metrics_global`, `platform_organizations`, `platform_webhooks`) are not parallel duplicates - they are the SaaS-platform layer above tenants and live in their own logical slice. Excluded from scope.

---

## Detailed pair analysis

### F1 - CRM (HIGH RISK - dual populated)

**Legacy (`public.*`)** introduced via `00010_enterprise_expansion_30_tables.sql` and the vertical-domain bulk-create migrations 00027 onwards. Multi-tenant: `tenant_id` added by `00072_tenant_id_columns_and_indexes.sql`.

**Canonical (`commercial.*`)** introduced via `00000_master_schema.sql` lines 344-516 + `00043_commercial_domain_complete.sql`. Per `_master-registry/domains/commercial.md`: *"Canonical pointer: `commercial.quotes` not `sales.quotes` (D009)"*.

**Mapping:**

| Legacy column | Canonical column | Notes |
|---|---|---|
| `crm_companies.id (uuid)` | `commercial.customers.id (bigserial)` + `public_id (uuid)` | id-type mismatch: legacy is uuid-PK, canonical is bigserial+uuid alias |
| `crm_companies.name` | `commercial.customers.name_he` + `name_en` | bilingual split needed |
| `crm_contacts.*` | `commercial.customer_contacts.*` (00010:11) | clean 1:1 after id remap |
| `crm_deals.*` | `commercial.opportunities.*` (00000:449) | stage_id maps to `pipeline_stages` |
| `crm_pipelines.*` | `commercial.pipeline_stages.*` (00000:344) | denormalised differently - see issues |
| `crm_activities.*` | `commercial.crm_activities.*` (00000:432) | only schema differs |
| `crm_tasks.*` | none yet (build_now per registry) | create `commercial.tasks` or move to `execution.tasks` |

**Issues blocking pure 1:1 sync:**
1. PK type mismatch (`uuid` vs `bigserial`) - need a `legacy_id_map` shadow table.
2. `crm_pipelines` is one-row-per-pipeline; `commercial.pipeline_stages` is one-row-per-stage. Sync requires a flatten.
3. Legacy is multi-tenant (`tenant_id` post-00072); canonical is **not** tenant-scoped (no `tenant_id` on `commercial.*`). This is itself a finding for Agent 09 follow-up.

**Recommendation: Phased sync**

```sql
-- M-CRM-1: shadow-id map + dual-write trigger (canonical -> legacy until UI migrates)
create table if not exists migrations.crm_id_map (
  legacy_id uuid primary key,
  canonical_id bigint not null unique
);

-- Trigger fires on commercial.customers; populates legacy crm_companies in same tx.
create or replace function migrations.fn_sync_customers_to_crm() returns trigger
language plpgsql security definer as $$
begin
  if (tg_op in ('INSERT','UPDATE')) then
    insert into public.crm_companies (id, name, email, phone, tenant_id, created_at, updated_at)
    values (
      coalesce((select legacy_id from migrations.crm_id_map where canonical_id = new.id),
               gen_random_uuid()),
      coalesce(new.name_he, new.name_en), new.email, new.phone, new.tenant_id,
      new.created_at, new.updated_at)
    on conflict (id) do update set
      name = excluded.name, email = excluded.email, phone = excluded.phone,
      updated_at = excluded.updated_at;
  elsif (tg_op = 'DELETE') then
    delete from public.crm_companies where id = (
      select legacy_id from migrations.crm_id_map where canonical_id = old.id);
  end if;
  return null;
end$$;

create trigger trg_sync_customers_to_crm
  after insert or update or delete on commercial.customers
  for each row execute function migrations.fn_sync_customers_to_crm();
```

**Phase 2** (after UI migrates to `commercial.*`): drop trigger, freeze `crm_*` reads.
**Phase 3** (90-day cooling): drop `crm_companies/contacts/deals/pipelines/activities/tasks` in a `00099_drop_legacy_crm.sql`.

---

### F2 - AR Invoicing (CRITICAL - books of record duplicated)

**Legacy:** `ar_invoices`, `ar_invoice_lines`, `ar_customers`, `ar_credit_notes`, `ar_receipts`, `ar_receipt_allocations` (vertical-domain bulk).
**Canonical:** `finance.invoices` (00000:1401), `finance.invoice_lines` (00000:1429), `finance.payment_allocations` (00010:488).

**State:** `ar_invoices` is the live books-of-record (every demo seed in 00033 hits it). `finance.invoices` is a near-empty shell with the right schema. Agent 09 §RLS-issues-3 calls out *"Even `gl_journal_entries`, `gl_accounts`, `ap_invoices`, `ap_payments`, `ar_invoices`, `ar_receipts` use `USING (true)`"*.

**Recommendation: One-shot backfill + read-through view**

```sql
-- M-AR-1: backfill canonical from legacy (one-shot, pre-cutover)
insert into finance.invoices (id, public_id, invoice_no, customer_id, status, invoice_date,
                              due_date, currency, subtotal, tax_amount, total, tenant_id, ...)
select bigint(id::text)  -- assuming bigint PK in canonical, change as needed
     , id::uuid
     , invoice_number, customer_id, status, invoice_date,
       due_date, currency, subtotal, tax_amount, total, tenant_id, ...
from public.ar_invoices
on conflict (public_id) do nothing;

-- M-AR-2: install backwards-compat view so legacy code keeps working
drop table public.ar_invoices cascade;  -- ONLY after 100% reads cut over
create view public.ar_invoices as select ... from finance.invoices;
```

**No sync trigger** - the financial-ledger surface MUST be single-source-of-truth or audit signing breaks (Form 856 in `AGENT-133`). One-shot only, in a maintenance window with cash freeze.

---

### F3 - AP / Vendor (HIGH - sync feasible)

**Legacy:** `ap_vendors`, `ap_vendor_contacts`, `ap_invoices`, `ap_invoice_lines`, `ap_payments`, `ap_payment_allocations`, `ap_price_history`.
**Canonical:** `procurement.suppliers` (00000:537), `procurement.supplier_contacts` (00010:48), `procurement.supplier_invoices` (00000:748), `finance.payment_allocations` (00010:488).

**Mapping is clean** (vendor == supplier). Recommendation differs by sub-table:
- `ap_vendors` <-> `procurement.suppliers`: **bi-directional sync trigger** until UI cuts over.
- `ap_invoices` -> `procurement.supplier_invoices`: **one-shot rename** with shadow-id table; leave a view named `ap_invoices` for 90 days.
- `ap_payments` / `ap_payment_allocations` -> `finance.payment_allocations`: bigger surgery; **defer** to a payments-consolidation task; flag as TODO.

```sql
-- M-AP-1: bidirectional sync on suppliers
-- (mirror of F1 trigger - omitted for brevity; key invariant is the id_map)
create table if not exists migrations.supplier_id_map (
  legacy_id uuid primary key, canonical_id bigint not null unique);
```

---

### F4 - Procurement PO/RFQ/GRN (cleanest one-shot)

**Legacy:** 9 `proc_*` tables.
**Canonical:** 8 `procurement.*` tables, near identical column names.

This is the lowest-risk pair to do as a **one-shot migration** because:
- Both schemas were created post-2026-04-18; legacy data is small.
- `wiring-spec.js` already routes the orchestrator to `procurement.*` (verified in 5 of the 18 actions).
- The legacy tables have no FK dependents outside their own family except `inv_stock` (handled in F5).

```sql
-- M-PROC-1: one-shot, single transaction
begin;
  insert into procurement.purchase_orders (...) select ... from public.proc_purchase_orders;
  insert into procurement.purchase_order_lines (...) select ... from public.proc_po_lines;
  -- ... etc for rfqs, requisitions, goods_receipts ...
  alter table public.proc_purchase_orders rename to _legacy_proc_purchase_orders_20260429;
  -- ... etc
commit;
```

Drop the `_legacy_*` tables after 30-day verification window.

---

### F5 - Inventory (MEDIUM - sync until lots wired)

**Legacy:** `inv_stock`, `inv_warehouses`, `inv_locations`, `inv_items`, `inv_transactions`, `inv_count_sheets`, `inv_count_lines`.
**Canonical:** `inventory.inventory` (00000:1055), `inventory.warehouses`, `inventory.materials`, `inventory.material_lots` (00011:160), `inventory.inventory_movements` (00011:188), `inventory.stock_counts`, `inventory.stock_count_lines`.

**Asymmetry:** canonical has `material_lots` and `inventory_movements` (lot-traceability) that legacy lacks. Cutover requires materializing lots from `inv_transactions` history - non-trivial.

**Recommendation: Phase-1 sync trigger on stock balance only**

```sql
-- M-INV-1: keep inv_stock.qty_on_hand and inventory.inventory.qty_on_hand in sync
create or replace function migrations.fn_sync_stock() returns trigger ...
-- Fires on inv_transactions; updates BOTH inv_stock and inventory.inventory.
```

**Phase-2 (separate task):** backfill `material_lots` from receipt history. **Phase-3:** retire legacy.

---

### F6 - HR / Workforce (MEDIUM)

**Legacy:** `hr_employees`, `hr_payslips`, `hr_leave_requests`, `hr_performance_reviews`.
**Canonical:** `workforce.employees` (00000:1229), `workforce.wage_slips` (00000:1340), `workforce.leave_requests` (00011:473), `workforce.hr_profiles`.

**Critical fact:** the payroll engine (port 5173) writes to `workforce.*` while the HR-portal UI reads from `hr_*`. So the two are **already out of sync at runtime**.

**Recommendation: One-shot migration + temporary backwards-compat view**

```sql
-- M-HR-1: align ids, copy data, swap reads
insert into workforce.employees (...) select ... from public.hr_employees on conflict (public_id) do nothing;
-- ... etc for payslips, leave, reviews ...
drop table public.hr_employees cascade;
create view public.hr_employees as select id, public_id, first_name, last_name, ... from workforce.employees;
```

Required ahead of any next payroll cycle (Form 102 monthly run, see `AGENT-134`). **PRIORITY: BEFORE 2026-05-15 payroll deadline.**

---

### F7 - PM / Execution

**Legacy:** `pm_projects`, `pm_tasks`, `pm_milestones`, `pm_time_entries`.
**Canonical:** `execution.projects` (00000:802), `execution.tasks` (00000:905), `execution.project_milestones` (00000:853), `workforce.attendance` (00000:1283) for time.

`wiring-spec.js` ownership table: *Project = `execution`*. Legacy `pm_*` tables are pre-redesign artifacts.

**Recommendation: One-shot, low-risk** (small data volume per Agent 09 sample queries).

---

### N1 - Singular orphans

`public.inventory` (singular), `public.invoices` (singular) - both flagged as orphaned by Agent 09 §Orphaned. Agent 09 M82 already proposes drop. **No additional sync needed.**

---

### N2 - GL ledger (NOT a duplicate)

`gl_accounts`, `gl_journal_entries`, `gl_journal_lines`, `gl_periods`, `gl_exchange_rates`, `gl_audit_trail`, `gl_recurring_entries` are **single-home** in `public.gl_*`. There is no `finance.gl_*` or `gl.*` schema yet. **Action: register `public.gl_*` as canonical in `_master-registry`** so it doesn't get migrated into a yet-to-exist `gl.*` schema by mistake. Hardening (M76) still applies - tenant_id RLS predicates are missing.

---

## Cross-cutting blockers

1. **`commercial.*` / `procurement.*` / `finance.*` / `workforce.*` / `execution.*` / `inventory.*` schema-qualified tables are NOT tenant-scoped** (no `tenant_id` column added by 00072). Sync triggers FROM `public.*` (which has `tenant_id`) to canonical will lose the tenant boundary.
   **Action:** before any sync trigger ships, run a precursor migration that adds `tenant_id uuid not null` and an index to all canonical tables in scope.

2. **PK type mismatch:** legacy `public.*` uses `uuid` PKs; canonical `commercial.*` / `procurement.*` / etc. use `bigserial` + `public_id uuid`. Every sync trigger needs a `migrations.<entity>_id_map` shadow table. Centralize the helper.

3. **No CDC bus:** Postgres triggers are the only available sync mechanism (no Debezium / Kafka / Supabase Realtime hooks for cross-schema replication today). Acceptable for ERP volume, but **document the trigger ownership** in `_master-registry`.

4. **RLS on canonical schemas is `USING (true)`** (Agent 09 M77). Sync triggers running as `security definer` will work, but anonymous reads on canonical tables are still wide open.

---

## Recommended migrations (additive on top of Agent 09 backlog)

| ID | Purpose | Depends on (Agent 09) | Priority |
|---|---|---|---|
| `00088_canonical_tables_tenant_id.sql` | Add `tenant_id` + idx to commercial/procurement/finance/inventory/workforce/execution canonical tables | M3 | P0 |
| `00089_migrations_id_maps.sql` | Create `migrations.<entity>_id_map` shadow tables | none | P0 |
| `00090_sync_crm_to_commercial.sql` | F1 trigger (writes to legacy from canonical) | 00088, 00089 | P1 |
| `00091_backfill_finance_invoices.sql` | F2 one-shot (no trigger; cash freeze required) | 00088 | P1 |
| `00092_sync_ap_vendors.sql` | F3 trigger on suppliers | 00088, 00089 | P2 |
| `00093_migrate_procurement_canonical.sql` | F4 one-shot rename | 00088 | P2 |
| `00094_sync_inv_stock.sql` | F5 trigger on stock balance | 00088 | P1 (before warehouse cycle) |
| `00095_migrate_hr_to_workforce.sql` | F6 one-shot **BEFORE 2026-05-15 payroll** | 00088 | P0 |
| `00096_migrate_pm_to_execution.sql` | F7 one-shot | 00088 | P2 |
| `00097_drop_orphan_singular_tables.sql` | N1 drops `public.inventory`, `public.invoices` | Agent 09 M82 | P3 |
| `00098_register_gl_canonical.sql` | N2 documentation-only migration; comment + registry update | none | P3 |
| `00099_drop_legacy_crm_after_cutover.sql` | F1 phase-3 retire | 00090 + 90-day verify | P3 |

---

## Files referenced

- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\_qa-reports-25\AGENT-09-db-integrity.md`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\supabase\migrations\00000_master_schema.sql` (canonical commercial/procurement/finance/workforce/execution/inventory tables defined here)
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\supabase\migrations\00010_enterprise_expansion_30_tables.sql` (canonical expansion incl. `commercial.customer_contacts`, `procurement.supplier_contacts`, `finance.payment_allocations`)
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\supabase\migrations\00027_enterprise_30_tables.sql` (introduces `crm.leads/lead_activities/opportunities` - a third schema! see follow-up)
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\supabase\migrations\00042_mark_duplicate_tables.sql` (existing dup notes - 5 tables only, much narrower than the 7 families above)
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\supabase\migrations\00043_commercial_domain_complete.sql` (commercial canonical authority)
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\supabase\migrations\00072_tenant_id_columns_and_indexes.sql` (added `tenant_id` to legacy `crm_companies`, `ap_vendors`, `proc_purchase_orders`, `hr_employees`, `pm_projects` - confirms legacy is multi-tenant)
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\_master-registry\domains\commercial.md` (declares `commercial` as canonical schema; 3 crm_legacy overlap noted)
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\src\pipeline\wiring-spec.js` (service ownership + 55 action->API mappings; routes orchestrator to canonical schemas)

## Follow-ups for next agents

- **Triple-overlap CRM:** `00027_enterprise_30_tables.sql` introduces a THIRD parallel set: `crm.leads`, `crm.lead_activities`, `crm.opportunities`. So we have `public.crm_*` AND `crm.*` AND `commercial.*` for the same logical entities. Agent 277 recommends `commercial.*` wins; `crm.*` should be folded in at F1 phase-1.
- Agent 09's M82 references `inv_stock` AND `inventory` (singular) - confirm with product whether `inv_stock` is the live table or whether `inventory.inventory` already replaced it.
- The 5-pair list in `00042_mark_duplicate_tables.sql` is incomplete; this report supersedes it. Suggest a `00042b_consolidation_notes_v2.sql` that reflects the 7+2 families.
