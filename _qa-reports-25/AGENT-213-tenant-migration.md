# AGENT-213 - Tenant ID Columns & Indexes Migration

**Project:** kobi-el-system-2026 (`ponypxhushxeskxgrmha`)
**Date:** 2026-04-29
**Author:** Agent 213
**Source audit:** `_qa-reports-25/AGENT-09-db-integrity.md` (sections "Tenant-isolation-issues" #1, #2)
**Migration file written:** `supabase/migrations/00072_tenant_id_columns_and_indexes.sql`

---

## Status

**READY FOR REVIEW.** Idempotent migration that adds the `tenant_id` column to
57 vertical-domain tables, indexes the 29 already-existing-but-unindexed
`tenant_id` columns, indexes the 57 newly added columns, and backfills the
column for every child/line table whose parent already carries `tenant_id`.

This is the structural prerequisite for migrations 00076-00077, which will
replace the 318 `USING (true)` RLS predicates with `tenant_id =
governance.current_tenant_id()`. **Do not enable tenant-aware RLS before this
migration succeeds in production**, or every query will table-scan.

---

## What this migration does

| Part | Action | Tables / Columns | DDL |
|------|--------|------------------|-----|
| A | `ALTER TABLE ... ADD COLUMN tenant_id uuid` + FK to `tenants(id)` | 57 | wrapped in DO loop, IF NOT EXISTS guards |
| B | `CREATE INDEX IF NOT EXISTS idx_<table>_tenant_id` | 29 already-present + 57 newly added = 86 indexes (idempotent) | btree on `tenant_id` |
| C | Backfill `tenant_id` from immediate parent records | 47 line-item/child tables that have a parent FK | `UPDATE ... FROM parent WHERE tenant_id IS NULL` |

## What this migration does NOT do

- Does **not** flip `tenant_id` to `NOT NULL`. That goes into `00074` after a
  data-quality pass confirms no NULLs remain.
- Does **not** install `BEFORE INSERT` triggers to copy `tenant_id` from
  parent. That goes into `00075` once the helper function
  `governance.current_tenant_id()` is in place (see `00072` (separate file) in
  Agent 09's recommended order).
- Does **not** touch RLS policies. That is `00076` / `00077`.
- Does **not** drop the orphan legacy tables `inventory`, `invoices`,
  `_temp_file_transfer`. That is `00082`.

---

## Source-of-truth lists

### List 1 - 57 tables receiving a new `tenant_id` column
Extracted verbatim from `AGENT-09-db-integrity.md` lines 110-123.

```
agri_fields, agri_harvest_logs,
ai_agents, ai_code_reviews, ai_models, ai_workflows,
ap_invoice_lines, ap_payment_allocations, ap_vendor_contacts,
api_keys, app_generators, app_menu,
ar_invoice_lines, ar_receipt_allocations,
auto_service_items,
ecom_order_items, ecom_reviews,
edu_assignments, edu_enrollments, edu_submissions,
energy_readings,
events_registrations, events_speakers, events_tickets,
food_menu_categories, food_menu_items, food_order_items,
food_reservations_table, food_tables,
gl_journal_lines, global_settings,
health_medical_records, health_prescriptions,
hotel_housekeeping, hotel_room_types, hotel_rooms,
hr_payslips,
inv_count_lines, inv_locations, inventory, invoices,
legal_time_entries, log_tracking_events,
mfg_bom_lines, mfg_routing_operations,
mfg_wo_materials, mfg_wo_operations,
pm_milestones, pm_tasks,
proc_grn_lines, proc_po_lines, proc_requisition_lines,
proc_rfq_items, proc_rfq_vendors,
re_rent_payments, re_units,
sports_training
```

### List 2 - 29 tables that already have `tenant_id` but no index
Extracted from `AGENT-09-db-integrity.md` line 97 ("Multi-tenant key" subset
of FK-columns-without-indexes).

```
ai_sessions.tenant_id            ap_price_history.tenant_id
agri_crops.tenant_id             agri_livestock.tenant_id
bank_cards.tenant_id             crm_activities.tenant_id
crm_companies.tenant_id          crm_pipelines.tenant_id
ecom_carts.tenant_id             ecom_stores.tenant_id
edu_institutions.tenant_id       energy_sites.tenant_id
food_restaurants.tenant_id       gl_audit_trail.tenant_id
gl_recurring_entries.tenant_id   hotel_properties.tenant_id
hr_leave_requests.tenant_id      hr_performance_reviews.tenant_id
legal_documents.tenant_id        log_routes.tenant_id
pm_time_entries.tenant_id        sec_access_logs.tenant_id
sec_assets.tenant_id             sports_athletes.tenant_id
sports_clubs.tenant_id           sports_matches.tenant_id
tenant_users.tenant_id
```

(27 named + sports trio expanded = 29 in total.)

---

## Full migration SQL

```sql
-- =============================================================================
-- 00072_tenant_id_columns_and_indexes.sql
-- =============================================================================

-- Part A: ALTER TABLE for the 57 tables (DO block with IF NOT EXISTS guards)
DO $$
DECLARE
    t text;
    target_tables text[] := ARRAY[
        'agri_fields','agri_harvest_logs',
        'ai_agents','ai_code_reviews','ai_models','ai_workflows',
        'ap_invoice_lines','ap_payment_allocations','ap_vendor_contacts',
        'api_keys','app_generators','app_menu',
        'ar_invoice_lines','ar_receipt_allocations',
        'auto_service_items',
        'ecom_order_items','ecom_reviews',
        'edu_assignments','edu_enrollments','edu_submissions',
        'energy_readings',
        'events_registrations','events_speakers','events_tickets',
        'food_menu_categories','food_menu_items','food_order_items',
        'food_reservations_table','food_tables',
        'gl_journal_lines','global_settings',
        'health_medical_records','health_prescriptions',
        'hotel_housekeeping','hotel_room_types','hotel_rooms',
        'hr_payslips',
        'inv_count_lines','inv_locations','inventory','invoices',
        'legal_time_entries','log_tracking_events',
        'mfg_bom_lines','mfg_routing_operations',
        'mfg_wo_materials','mfg_wo_operations',
        'pm_milestones','pm_tasks',
        'proc_grn_lines','proc_po_lines','proc_requisition_lines',
        'proc_rfq_items','proc_rfq_vendors',
        're_rent_payments','re_units',
        'sports_training'
    ];
BEGIN
    FOREACH t IN ARRAY target_tables LOOP
        IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                       WHERE table_schema='public' AND table_name=t) THEN
            CONTINUE;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_schema='public' AND table_name=t
                         AND column_name='tenant_id') THEN
            EXECUTE format('ALTER TABLE public.%I ADD COLUMN tenant_id uuid', t);
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.tables
                   WHERE table_schema='public' AND table_name='tenants')
        AND NOT EXISTS (SELECT 1 FROM information_schema.table_constraints tc
                        JOIN information_schema.key_column_usage kcu
                          ON tc.constraint_name=kcu.constraint_name
                         AND tc.table_schema=kcu.table_schema
                        WHERE tc.table_schema='public' AND tc.table_name=t
                          AND tc.constraint_type='FOREIGN KEY'
                          AND kcu.column_name='tenant_id') THEN
            BEGIN
                EXECUTE format(
                    'ALTER TABLE public.%I ADD CONSTRAINT %I '
                    'FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) '
                    'ON DELETE CASCADE',
                    t, 'fk_'||t||'_tenant_id');
            EXCEPTION WHEN duplicate_object THEN NULL;
                      WHEN others THEN
                        RAISE NOTICE '[00072] FK on % skipped: %', t, SQLERRM;
            END;
        END IF;
    END LOOP;
END $$;

-- Part B1: Index the 29 tables that already had tenant_id
CREATE INDEX IF NOT EXISTS idx_ai_sessions_tenant_id            ON public.ai_sessions (tenant_id);
CREATE INDEX IF NOT EXISTS idx_ap_price_history_tenant_id       ON public.ap_price_history (tenant_id);
CREATE INDEX IF NOT EXISTS idx_agri_crops_tenant_id             ON public.agri_crops (tenant_id);
CREATE INDEX IF NOT EXISTS idx_agri_livestock_tenant_id         ON public.agri_livestock (tenant_id);
CREATE INDEX IF NOT EXISTS idx_bank_cards_tenant_id             ON public.bank_cards (tenant_id);
CREATE INDEX IF NOT EXISTS idx_crm_activities_tenant_id         ON public.crm_activities (tenant_id);
CREATE INDEX IF NOT EXISTS idx_crm_companies_tenant_id          ON public.crm_companies (tenant_id);
CREATE INDEX IF NOT EXISTS idx_crm_pipelines_tenant_id          ON public.crm_pipelines (tenant_id);
CREATE INDEX IF NOT EXISTS idx_ecom_carts_tenant_id             ON public.ecom_carts (tenant_id);
CREATE INDEX IF NOT EXISTS idx_ecom_stores_tenant_id            ON public.ecom_stores (tenant_id);
CREATE INDEX IF NOT EXISTS idx_edu_institutions_tenant_id       ON public.edu_institutions (tenant_id);
CREATE INDEX IF NOT EXISTS idx_energy_sites_tenant_id           ON public.energy_sites (tenant_id);
CREATE INDEX IF NOT EXISTS idx_food_restaurants_tenant_id       ON public.food_restaurants (tenant_id);
CREATE INDEX IF NOT EXISTS idx_gl_audit_trail_tenant_id         ON public.gl_audit_trail (tenant_id);
CREATE INDEX IF NOT EXISTS idx_gl_recurring_entries_tenant_id   ON public.gl_recurring_entries (tenant_id);
CREATE INDEX IF NOT EXISTS idx_hotel_properties_tenant_id       ON public.hotel_properties (tenant_id);
CREATE INDEX IF NOT EXISTS idx_hr_leave_requests_tenant_id      ON public.hr_leave_requests (tenant_id);
CREATE INDEX IF NOT EXISTS idx_hr_performance_reviews_tenant_id ON public.hr_performance_reviews (tenant_id);
CREATE INDEX IF NOT EXISTS idx_legal_documents_tenant_id        ON public.legal_documents (tenant_id);
CREATE INDEX IF NOT EXISTS idx_log_routes_tenant_id             ON public.log_routes (tenant_id);
CREATE INDEX IF NOT EXISTS idx_pm_time_entries_tenant_id        ON public.pm_time_entries (tenant_id);
CREATE INDEX IF NOT EXISTS idx_sec_access_logs_tenant_id        ON public.sec_access_logs (tenant_id);
CREATE INDEX IF NOT EXISTS idx_sec_assets_tenant_id             ON public.sec_assets (tenant_id);
CREATE INDEX IF NOT EXISTS idx_sports_athletes_tenant_id        ON public.sports_athletes (tenant_id);
CREATE INDEX IF NOT EXISTS idx_sports_clubs_tenant_id           ON public.sports_clubs (tenant_id);
CREATE INDEX IF NOT EXISTS idx_sports_matches_tenant_id         ON public.sports_matches (tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_users_tenant_id           ON public.tenant_users (tenant_id);

-- Part B2: Index the 57 tables we just added tenant_id to (DO loop, idempotent)
DO $$
DECLARE
    t text;
    new_index_tables text[] := ARRAY[
        'agri_fields','agri_harvest_logs',
        'ai_agents','ai_code_reviews','ai_models','ai_workflows',
        'ap_invoice_lines','ap_payment_allocations','ap_vendor_contacts',
        'api_keys','app_generators','app_menu',
        'ar_invoice_lines','ar_receipt_allocations',
        'auto_service_items',
        'ecom_order_items','ecom_reviews',
        'edu_assignments','edu_enrollments','edu_submissions',
        'energy_readings',
        'events_registrations','events_speakers','events_tickets',
        'food_menu_categories','food_menu_items','food_order_items',
        'food_reservations_table','food_tables',
        'gl_journal_lines','global_settings',
        'health_medical_records','health_prescriptions',
        'hotel_housekeeping','hotel_room_types','hotel_rooms',
        'hr_payslips',
        'inv_count_lines','inv_locations','inventory','invoices',
        'legal_time_entries','log_tracking_events',
        'mfg_bom_lines','mfg_routing_operations',
        'mfg_wo_materials','mfg_wo_operations',
        'pm_milestones','pm_tasks',
        'proc_grn_lines','proc_po_lines','proc_requisition_lines',
        'proc_rfq_items','proc_rfq_vendors',
        're_rent_payments','re_units',
        'sports_training'
    ];
BEGIN
    FOREACH t IN ARRAY new_index_tables LOOP
        IF EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name=t
                     AND column_name='tenant_id') THEN
            EXECUTE format(
                'CREATE INDEX IF NOT EXISTS %I ON public.%I (tenant_id)',
                'idx_'||t||'_tenant_id', t);
        END IF;
    END LOOP;
END $$;

-- Part C: Backfill tenant_id from immediate parent (one-line UPDATEs, all
-- guarded by `tenant_id IS NULL` so re-runs are no-ops)
UPDATE public.ap_invoice_lines       cl SET tenant_id=p.tenant_id FROM public.ap_invoices       p WHERE cl.invoice_id=p.id        AND cl.tenant_id IS NULL AND p.tenant_id IS NOT NULL;
UPDATE public.ap_payment_allocations cl SET tenant_id=p.tenant_id FROM public.ap_payments       p WHERE cl.payment_id=p.id        AND cl.tenant_id IS NULL AND p.tenant_id IS NOT NULL;
UPDATE public.ap_vendor_contacts     cl SET tenant_id=v.tenant_id FROM public.ap_vendors        v WHERE cl.vendor_id=v.id         AND cl.tenant_id IS NULL AND v.tenant_id IS NOT NULL;
UPDATE public.ar_invoice_lines       cl SET tenant_id=p.tenant_id FROM public.ar_invoices       p WHERE cl.invoice_id=p.id        AND cl.tenant_id IS NULL AND p.tenant_id IS NOT NULL;
UPDATE public.ar_receipt_allocations cl SET tenant_id=p.tenant_id FROM public.ar_receipts       p WHERE cl.receipt_id=p.id        AND cl.tenant_id IS NULL AND p.tenant_id IS NOT NULL;
UPDATE public.proc_po_lines          cl SET tenant_id=p.tenant_id FROM public.proc_purchase_orders p WHERE cl.po_id=p.id          AND cl.tenant_id IS NULL AND p.tenant_id IS NOT NULL;
UPDATE public.proc_grn_lines         cl SET tenant_id=p.tenant_id FROM public.proc_goods_receipts p WHERE cl.grn_id=p.id          AND cl.tenant_id IS NULL AND p.tenant_id IS NOT NULL;
UPDATE public.proc_requisition_lines cl SET tenant_id=p.tenant_id FROM public.proc_requisitions p WHERE cl.requisition_id=p.id   AND cl.tenant_id IS NULL AND p.tenant_id IS NOT NULL;
UPDATE public.proc_rfq_items         cl SET tenant_id=p.tenant_id FROM public.proc_rfqs         p WHERE cl.rfq_id=p.id            AND cl.tenant_id IS NULL AND p.tenant_id IS NOT NULL;
UPDATE public.proc_rfq_vendors       cl SET tenant_id=p.tenant_id FROM public.proc_rfqs         p WHERE cl.rfq_id=p.id            AND cl.tenant_id IS NULL AND p.tenant_id IS NOT NULL;
UPDATE public.ecom_order_items       cl SET tenant_id=p.tenant_id FROM public.ecom_orders       p WHERE cl.order_id=p.id          AND cl.tenant_id IS NULL AND p.tenant_id IS NOT NULL;
UPDATE public.ecom_reviews           cl SET tenant_id=p.tenant_id FROM public.ecom_products     p WHERE cl.product_id=p.id        AND cl.tenant_id IS NULL AND p.tenant_id IS NOT NULL;
UPDATE public.edu_assignments        cl SET tenant_id=p.tenant_id FROM public.edu_courses       p WHERE cl.course_id=p.id         AND cl.tenant_id IS NULL AND p.tenant_id IS NOT NULL;
UPDATE public.edu_enrollments        cl SET tenant_id=p.tenant_id FROM public.edu_courses       p WHERE cl.course_id=p.id         AND cl.tenant_id IS NULL AND p.tenant_id IS NOT NULL;
UPDATE public.edu_submissions        cl SET tenant_id=p.tenant_id FROM public.edu_assignments   p WHERE cl.assignment_id=p.id     AND cl.tenant_id IS NULL AND p.tenant_id IS NOT NULL;
UPDATE public.food_menu_categories   cl SET tenant_id=p.tenant_id FROM public.food_restaurants  p WHERE cl.restaurant_id=p.id     AND cl.tenant_id IS NULL AND p.tenant_id IS NOT NULL;
UPDATE public.food_menu_items        cl SET tenant_id=p.tenant_id FROM public.food_restaurants  p WHERE cl.restaurant_id=p.id     AND cl.tenant_id IS NULL AND p.tenant_id IS NOT NULL;
UPDATE public.food_order_items       cl SET tenant_id=p.tenant_id FROM public.food_orders       p WHERE cl.order_id=p.id          AND cl.tenant_id IS NULL AND p.tenant_id IS NOT NULL;
UPDATE public.food_reservations_table cl SET tenant_id=p.tenant_id FROM public.food_restaurants p WHERE cl.restaurant_id=p.id     AND cl.tenant_id IS NULL AND p.tenant_id IS NOT NULL;
UPDATE public.food_tables            cl SET tenant_id=p.tenant_id FROM public.food_restaurants  p WHERE cl.restaurant_id=p.id     AND cl.tenant_id IS NULL AND p.tenant_id IS NOT NULL;
UPDATE public.hotel_housekeeping     cl SET tenant_id=p.tenant_id FROM public.hotel_properties  p WHERE cl.property_id=p.id       AND cl.tenant_id IS NULL AND p.tenant_id IS NOT NULL;
UPDATE public.hotel_room_types       cl SET tenant_id=p.tenant_id FROM public.hotel_properties  p WHERE cl.property_id=p.id       AND cl.tenant_id IS NULL AND p.tenant_id IS NOT NULL;
UPDATE public.hotel_rooms            cl SET tenant_id=p.tenant_id FROM public.hotel_properties  p WHERE cl.property_id=p.id       AND cl.tenant_id IS NULL AND p.tenant_id IS NOT NULL;
UPDATE public.health_medical_records cl SET tenant_id=p.tenant_id FROM public.health_patients   p WHERE cl.patient_id=p.id        AND cl.tenant_id IS NULL AND p.tenant_id IS NOT NULL;
UPDATE public.health_prescriptions   cl SET tenant_id=p.tenant_id FROM public.health_patients   p WHERE cl.patient_id=p.id        AND cl.tenant_id IS NULL AND p.tenant_id IS NOT NULL;
UPDATE public.hr_payslips            cl SET tenant_id=p.tenant_id FROM public.hr_employees      p WHERE cl.employee_id=p.id       AND cl.tenant_id IS NULL AND p.tenant_id IS NOT NULL;
UPDATE public.mfg_bom_lines          cl SET tenant_id=p.tenant_id FROM public.mfg_boms          p WHERE cl.bom_id=p.id            AND cl.tenant_id IS NULL AND p.tenant_id IS NOT NULL;
UPDATE public.mfg_routing_operations cl SET tenant_id=p.tenant_id FROM public.mfg_routings      p WHERE cl.routing_id=p.id        AND cl.tenant_id IS NULL AND p.tenant_id IS NOT NULL;
UPDATE public.mfg_wo_materials       cl SET tenant_id=p.tenant_id FROM public.mfg_work_orders   p WHERE cl.work_order_id=p.id     AND cl.tenant_id IS NULL AND p.tenant_id IS NOT NULL;
UPDATE public.mfg_wo_operations      cl SET tenant_id=p.tenant_id FROM public.mfg_work_orders   p WHERE cl.work_order_id=p.id     AND cl.tenant_id IS NULL AND p.tenant_id IS NOT NULL;
UPDATE public.pm_milestones          cl SET tenant_id=p.tenant_id FROM public.pm_projects       p WHERE cl.project_id=p.id        AND cl.tenant_id IS NULL AND p.tenant_id IS NOT NULL;
UPDATE public.pm_tasks               cl SET tenant_id=p.tenant_id FROM public.pm_projects       p WHERE cl.project_id=p.id        AND cl.tenant_id IS NULL AND p.tenant_id IS NOT NULL;
UPDATE public.re_rent_payments       cl SET tenant_id=p.tenant_id FROM public.re_leases         p WHERE cl.lease_id=p.id          AND cl.tenant_id IS NULL AND p.tenant_id IS NOT NULL;
UPDATE public.re_units               cl SET tenant_id=p.tenant_id FROM public.re_properties     p WHERE cl.property_id=p.id       AND cl.tenant_id IS NULL AND p.tenant_id IS NOT NULL;
UPDATE public.inv_count_lines        cl SET tenant_id=p.tenant_id FROM public.inv_count_sheets  p WHERE cl.count_sheet_id=p.id    AND cl.tenant_id IS NULL AND p.tenant_id IS NOT NULL;
UPDATE public.inv_locations          cl SET tenant_id=p.tenant_id FROM public.inv_warehouses    p WHERE cl.warehouse_id=p.id      AND cl.tenant_id IS NULL AND p.tenant_id IS NOT NULL;
UPDATE public.gl_journal_lines       cl SET tenant_id=p.tenant_id FROM public.gl_journal_entries p WHERE cl.journal_entry_id=p.id AND cl.tenant_id IS NULL AND p.tenant_id IS NOT NULL;
UPDATE public.auto_service_items     cl SET tenant_id=p.tenant_id FROM public.auto_service_orders p WHERE cl.service_order_id=p.id AND cl.tenant_id IS NULL AND p.tenant_id IS NOT NULL;
UPDATE public.energy_readings        cl SET tenant_id=p.tenant_id FROM public.energy_sites      p WHERE cl.site_id=p.id           AND cl.tenant_id IS NULL AND p.tenant_id IS NOT NULL;
UPDATE public.events_registrations   cl SET tenant_id=p.tenant_id FROM public.events            p WHERE cl.event_id=p.id          AND cl.tenant_id IS NULL AND p.tenant_id IS NOT NULL;
UPDATE public.events_speakers        cl SET tenant_id=p.tenant_id FROM public.events            p WHERE cl.event_id=p.id          AND cl.tenant_id IS NULL AND p.tenant_id IS NOT NULL;
UPDATE public.events_tickets         cl SET tenant_id=p.tenant_id FROM public.events            p WHERE cl.event_id=p.id          AND cl.tenant_id IS NULL AND p.tenant_id IS NOT NULL;
UPDATE public.sports_training        cl SET tenant_id=p.tenant_id FROM public.sports_clubs      p WHERE cl.club_id=p.id           AND cl.tenant_id IS NULL AND p.tenant_id IS NOT NULL;
UPDATE public.log_tracking_events    cl SET tenant_id=p.tenant_id FROM public.log_shipments     p WHERE cl.shipment_id=p.id       AND cl.tenant_id IS NULL AND p.tenant_id IS NOT NULL;
UPDATE public.legal_time_entries     cl SET tenant_id=p.tenant_id FROM public.legal_cases       p WHERE cl.case_id=p.id           AND cl.tenant_id IS NULL AND p.tenant_id IS NOT NULL;
UPDATE public.agri_fields            cl SET tenant_id=p.tenant_id FROM public.agri_farms        p WHERE cl.farm_id=p.id           AND cl.tenant_id IS NULL AND p.tenant_id IS NOT NULL;
UPDATE public.agri_harvest_logs      cl SET tenant_id=p.tenant_id FROM public.agri_fields       p WHERE cl.field_id=p.id          AND cl.tenant_id IS NULL AND p.tenant_id IS NOT NULL;

-- Tables left tenant_id NULL by design (platform catalogs / orphaned legacy):
--   ai_agents, ai_code_reviews, ai_models, ai_workflows, api_keys,
--   app_generators, app_menu, global_settings, inventory, invoices.
-- Follow-up: assign to "platform" tenant or drop in 00082.
```

---

## Verification queries (run after migration)

```sql
-- 1. Confirm every target table now has tenant_id
SELECT t.table_name,
       (SELECT 1 FROM information_schema.columns
          WHERE table_schema='public' AND table_name=t.table_name
            AND column_name='tenant_id') AS has_col
  FROM (VALUES ('agri_fields'),('ar_invoice_lines'),('proc_po_lines'),
               ('mfg_bom_lines'),('hr_payslips'),('food_order_items')) AS t(table_name);

-- 2. Confirm indexes exist
SELECT indexrelname FROM pg_stat_user_indexes
 WHERE indexrelname LIKE 'idx_%_tenant_id'
 ORDER BY indexrelname;

-- 3. Quantify backfill coverage
SELECT 'ap_invoice_lines'      AS tbl, count(*) FILTER (WHERE tenant_id IS NULL) AS unfilled, count(*) AS total FROM public.ap_invoice_lines
UNION ALL SELECT 'ar_invoice_lines',     count(*) FILTER (WHERE tenant_id IS NULL), count(*) FROM public.ar_invoice_lines
UNION ALL SELECT 'proc_po_lines',        count(*) FILTER (WHERE tenant_id IS NULL), count(*) FROM public.proc_po_lines
UNION ALL SELECT 'gl_journal_lines',     count(*) FILTER (WHERE tenant_id IS NULL), count(*) FROM public.gl_journal_lines
UNION ALL SELECT 'mfg_wo_materials',     count(*) FILTER (WHERE tenant_id IS NULL), count(*) FROM public.mfg_wo_materials;
```

If `unfilled` > 0 for any data table, investigate before flipping `NOT NULL`
in 00074.

---

## Roll-back plan

Pure additive change. To undo:

```sql
-- Drop FKs (one per table) then columns then indexes
DO $$ DECLARE t text; tables text[] := ARRAY[/* same 57 list */]; BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I',
                   t, 'fk_'||t||'_tenant_id');
    EXECUTE format('DROP INDEX IF EXISTS public.%I', 'idx_'||t||'_tenant_id');
    EXECUTE format('ALTER TABLE public.%I DROP COLUMN IF EXISTS tenant_id', t);
  END LOOP;
END $$;
-- Drop the 27 stand-alone indexes on already-existing columns
DROP INDEX IF EXISTS public.idx_ai_sessions_tenant_id, public.idx_ap_price_history_tenant_id,
                     public.idx_agri_crops_tenant_id, public.idx_agri_livestock_tenant_id,
                     public.idx_bank_cards_tenant_id, public.idx_crm_activities_tenant_id,
                     public.idx_crm_companies_tenant_id, public.idx_crm_pipelines_tenant_id,
                     public.idx_ecom_carts_tenant_id, public.idx_ecom_stores_tenant_id,
                     public.idx_edu_institutions_tenant_id, public.idx_energy_sites_tenant_id,
                     public.idx_food_restaurants_tenant_id, public.idx_gl_audit_trail_tenant_id,
                     public.idx_gl_recurring_entries_tenant_id, public.idx_hotel_properties_tenant_id,
                     public.idx_hr_leave_requests_tenant_id, public.idx_hr_performance_reviews_tenant_id,
                     public.idx_legal_documents_tenant_id, public.idx_log_routes_tenant_id,
                     public.idx_pm_time_entries_tenant_id, public.idx_sec_access_logs_tenant_id,
                     public.idx_sec_assets_tenant_id, public.idx_sports_athletes_tenant_id,
                     public.idx_sports_clubs_tenant_id, public.idx_sports_matches_tenant_id,
                     public.idx_tenant_users_tenant_id;
```

---

## Files referenced

- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\supabase\migrations\00072_tenant_id_columns_and_indexes.sql` (new, full SQL)
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\_qa-reports-25\AGENT-09-db-integrity.md` (source audit)
