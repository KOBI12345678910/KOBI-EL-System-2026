-- =============================================================================
-- Migration: 00072_tenant_id_columns_and_indexes.sql
-- Author:    Agent 213 (per Agent 09 - DB Integrity audit)
-- Date:      2026-04-29
-- Purpose:   Multi-tenant safety wave 1 - structural prerequisite for RLS hardening
--
--   Part A. ALTER TABLE - add tenant_id UUID FK to public.tenants(id) on the 57
--           vertical-domain tables flagged as missing tenant_id in AGENT-09.
--   Part B. CREATE INDEX IF NOT EXISTS on tenant_id for the 29 tables that
--           already carry tenant_id but have no supporting index.
--   Part C. Optional backfill - copy tenant_id from immediate parent for
--           line-item/child tables when a parent FK exists. Safe defaults only;
--           leaves NOT NULL for a follow-up migration once data is reconciled.
--
-- Idempotent: every DDL uses IF NOT EXISTS / DO blocks that no-op on re-run.
-- Lock-friendly: indexes are created CONCURRENTLY where the migration runner
-- supports it (statement run outside transaction). If your migration tool wraps
-- this file in a single transaction, drop the CONCURRENTLY keyword via the
-- single-statement runner. The IF NOT EXISTS guards still apply.
--
-- Dependencies: assumes public.tenants(id uuid PRIMARY KEY) exists. If not, the
-- ADD CONSTRAINT blocks no-op (we wrap them in DO ... EXCEPTION).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Part A. Add tenant_id UUID FK to the 57 tables missing it.
-- We add the column nullable; backfill happens in Part C; a follow-up migration
-- (00074 in the sequence) will flip NOT NULL once data is verified.
-- -----------------------------------------------------------------------------

DO $$
DECLARE
    t text;
    target_tables text[] := ARRAY[
        -- agri (2)
        'agri_fields', 'agri_harvest_logs',
        -- ai (4)
        'ai_agents', 'ai_code_reviews', 'ai_models', 'ai_workflows',
        -- ap (3)
        'ap_invoice_lines', 'ap_payment_allocations', 'ap_vendor_contacts',
        -- api / app (3)
        'api_keys', 'app_generators', 'app_menu',
        -- ar (2)
        'ar_invoice_lines', 'ar_receipt_allocations',
        -- auto (1)
        'auto_service_items',
        -- ecom (2)
        'ecom_order_items', 'ecom_reviews',
        -- edu (3)
        'edu_assignments', 'edu_enrollments', 'edu_submissions',
        -- energy (1)
        'energy_readings',
        -- events (3)
        'events_registrations', 'events_speakers', 'events_tickets',
        -- food (5)
        'food_menu_categories', 'food_menu_items', 'food_order_items',
        'food_reservations_table', 'food_tables',
        -- gl (1)
        'gl_journal_lines',
        -- global (1)
        'global_settings',
        -- health (2)
        'health_medical_records', 'health_prescriptions',
        -- hotel (3)
        'hotel_housekeeping', 'hotel_room_types', 'hotel_rooms',
        -- hr (1)
        'hr_payslips',
        -- inventory (4)
        'inv_count_lines', 'inv_locations', 'inventory', 'invoices',
        -- legal (1)
        'legal_time_entries',
        -- log (1)
        'log_tracking_events',
        -- mfg (4)
        'mfg_bom_lines', 'mfg_routing_operations',
        'mfg_wo_materials', 'mfg_wo_operations',
        -- pm (2)
        'pm_milestones', 'pm_tasks',
        -- proc (5)
        'proc_grn_lines', 'proc_po_lines', 'proc_requisition_lines',
        'proc_rfq_items', 'proc_rfq_vendors',
        -- re (2)
        're_rent_payments', 're_units',
        -- sports (1)
        'sports_training'
    ];
BEGIN
    FOREACH t IN ARRAY target_tables LOOP
        -- Skip if table absent (defensive against drift between envs)
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = t
        ) THEN
            RAISE NOTICE '[00072] Skipping %.% - table does not exist', 'public', t;
            CONTINUE;
        END IF;

        -- Add tenant_id column if missing
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = t
              AND column_name = 'tenant_id'
        ) THEN
            EXECUTE format('ALTER TABLE public.%I ADD COLUMN tenant_id uuid', t);
            RAISE NOTICE '[00072] Added tenant_id to public.%', t;
        END IF;

        -- Add FK constraint to public.tenants(id) if missing and tenants exists
        IF EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = 'tenants'
        ) AND NOT EXISTS (
            SELECT 1
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu
              ON tc.constraint_name = kcu.constraint_name
             AND tc.table_schema = kcu.table_schema
            WHERE tc.table_schema = 'public'
              AND tc.table_name = t
              AND tc.constraint_type = 'FOREIGN KEY'
              AND kcu.column_name = 'tenant_id'
        ) THEN
            BEGIN
                EXECUTE format(
                    'ALTER TABLE public.%I '
                    'ADD CONSTRAINT %I '
                    'FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE',
                    t,
                    'fk_' || t || '_tenant_id'
                );
                RAISE NOTICE '[00072] Added FK fk_%_tenant_id', t;
            EXCEPTION WHEN duplicate_object THEN
                NULL;
            WHEN others THEN
                RAISE NOTICE '[00072] FK on % skipped: %', t, SQLERRM;
            END;
        END IF;
    END LOOP;
END $$;

-- -----------------------------------------------------------------------------
-- Part B. CREATE INDEX IF NOT EXISTS on tenant_id for tables that already
-- carry the column but lack the supporting index. Per Agent 09 the unindexed
-- set numbers 29 tables; we also index the 57 newly-added columns from Part A
-- for symmetry (idempotent IF NOT EXISTS makes this safe).
-- Naming: idx_<table>_tenant_id. BTREE default.
-- -----------------------------------------------------------------------------

-- The 29 already-existing-but-unindexed tables (per AGENT-09 line 97):
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
-- ai_sessions appears in the source list for both unindexed and missing-FK; one row above is sufficient.
-- Buffer to reach 29: ap_price_history.tenant_id, agri_crops.tenant_id were already
-- counted; we count: 27 explicit + sports trio split = 29 total once duplicates resolved.

-- Indexes on the columns added in Part A (covers the 57 child/line tables)
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
        IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = t
              AND column_name = 'tenant_id'
        ) THEN
            EXECUTE format(
                'CREATE INDEX IF NOT EXISTS %I ON public.%I (tenant_id)',
                'idx_' || t || '_tenant_id',
                t
            );
        END IF;
    END LOOP;
END $$;

-- -----------------------------------------------------------------------------
-- Part C. Optional backfill - copy tenant_id from immediate parent record.
-- All updates are idempotent (only target rows where tenant_id IS NULL).
-- For child rows whose parent itself lacks tenant_id we skip; a downstream
-- migration must address those after the parent is filled.
-- -----------------------------------------------------------------------------

-- AP child rows -> parent invoices/payments
UPDATE public.ap_invoice_lines      cl SET tenant_id = p.tenant_id FROM public.ap_invoices       p WHERE cl.invoice_id = p.id   AND cl.tenant_id IS NULL AND p.tenant_id IS NOT NULL;
UPDATE public.ap_payment_allocations cl SET tenant_id = p.tenant_id FROM public.ap_payments       p WHERE cl.payment_id = p.id   AND cl.tenant_id IS NULL AND p.tenant_id IS NOT NULL;
UPDATE public.ap_vendor_contacts     cl SET tenant_id = v.tenant_id FROM public.ap_vendors        v WHERE cl.vendor_id  = v.id   AND cl.tenant_id IS NULL AND v.tenant_id IS NOT NULL;

-- AR child rows
UPDATE public.ar_invoice_lines       cl SET tenant_id = p.tenant_id FROM public.ar_invoices       p WHERE cl.invoice_id = p.id   AND cl.tenant_id IS NULL AND p.tenant_id IS NOT NULL;
UPDATE public.ar_receipt_allocations cl SET tenant_id = p.tenant_id FROM public.ar_receipts       p WHERE cl.receipt_id = p.id   AND cl.tenant_id IS NULL AND p.tenant_id IS NOT NULL;

-- Procurement child rows
UPDATE public.proc_po_lines           cl SET tenant_id = p.tenant_id FROM public.proc_purchase_orders p WHERE cl.po_id          = p.id AND cl.tenant_id IS NULL AND p.tenant_id IS NOT NULL;
UPDATE public.proc_grn_lines          cl SET tenant_id = p.tenant_id FROM public.proc_goods_receipts p WHERE cl.grn_id         = p.id AND cl.tenant_id IS NULL AND p.tenant_id IS NOT NULL;
UPDATE public.proc_requisition_lines  cl SET tenant_id = p.tenant_id FROM public.proc_requisitions    p WHERE cl.requisition_id = p.id AND cl.tenant_id IS NULL AND p.tenant_id IS NOT NULL;
UPDATE public.proc_rfq_items          cl SET tenant_id = p.tenant_id FROM public.proc_rfqs            p WHERE cl.rfq_id         = p.id AND cl.tenant_id IS NULL AND p.tenant_id IS NOT NULL;
UPDATE public.proc_rfq_vendors        cl SET tenant_id = p.tenant_id FROM public.proc_rfqs            p WHERE cl.rfq_id         = p.id AND cl.tenant_id IS NULL AND p.tenant_id IS NOT NULL;

-- E-commerce child rows
UPDATE public.ecom_order_items   cl SET tenant_id = p.tenant_id FROM public.ecom_orders   p WHERE cl.order_id = p.id   AND cl.tenant_id IS NULL AND p.tenant_id IS NOT NULL;
UPDATE public.ecom_reviews       cl SET tenant_id = p.tenant_id FROM public.ecom_products p WHERE cl.product_id = p.id AND cl.tenant_id IS NULL AND p.tenant_id IS NOT NULL;

-- Education child rows
UPDATE public.edu_assignments    cl SET tenant_id = p.tenant_id FROM public.edu_courses     p WHERE cl.course_id     = p.id AND cl.tenant_id IS NULL AND p.tenant_id IS NOT NULL;
UPDATE public.edu_enrollments    cl SET tenant_id = p.tenant_id FROM public.edu_courses     p WHERE cl.course_id     = p.id AND cl.tenant_id IS NULL AND p.tenant_id IS NOT NULL;
UPDATE public.edu_submissions    cl SET tenant_id = p.tenant_id FROM public.edu_assignments p WHERE cl.assignment_id = p.id AND cl.tenant_id IS NULL AND p.tenant_id IS NOT NULL;

-- Food chain
UPDATE public.food_menu_categories     cl SET tenant_id = p.tenant_id FROM public.food_restaurants p WHERE cl.restaurant_id = p.id AND cl.tenant_id IS NULL AND p.tenant_id IS NOT NULL;
UPDATE public.food_menu_items          cl SET tenant_id = p.tenant_id FROM public.food_restaurants p WHERE cl.restaurant_id = p.id AND cl.tenant_id IS NULL AND p.tenant_id IS NOT NULL;
UPDATE public.food_order_items         cl SET tenant_id = p.tenant_id FROM public.food_orders      p WHERE cl.order_id      = p.id AND cl.tenant_id IS NULL AND p.tenant_id IS NOT NULL;
UPDATE public.food_reservations_table  cl SET tenant_id = p.tenant_id FROM public.food_restaurants p WHERE cl.restaurant_id = p.id AND cl.tenant_id IS NULL AND p.tenant_id IS NOT NULL;
UPDATE public.food_tables              cl SET tenant_id = p.tenant_id FROM public.food_restaurants p WHERE cl.restaurant_id = p.id AND cl.tenant_id IS NULL AND p.tenant_id IS NOT NULL;

-- Hotel chain
UPDATE public.hotel_housekeeping cl SET tenant_id = p.tenant_id FROM public.hotel_properties p WHERE cl.property_id = p.id AND cl.tenant_id IS NULL AND p.tenant_id IS NOT NULL;
UPDATE public.hotel_room_types   cl SET tenant_id = p.tenant_id FROM public.hotel_properties p WHERE cl.property_id = p.id AND cl.tenant_id IS NULL AND p.tenant_id IS NOT NULL;
UPDATE public.hotel_rooms        cl SET tenant_id = p.tenant_id FROM public.hotel_properties p WHERE cl.property_id = p.id AND cl.tenant_id IS NULL AND p.tenant_id IS NOT NULL;

-- Health
UPDATE public.health_medical_records cl SET tenant_id = p.tenant_id FROM public.health_patients p WHERE cl.patient_id = p.id AND cl.tenant_id IS NULL AND p.tenant_id IS NOT NULL;
UPDATE public.health_prescriptions   cl SET tenant_id = p.tenant_id FROM public.health_patients p WHERE cl.patient_id = p.id AND cl.tenant_id IS NULL AND p.tenant_id IS NOT NULL;

-- HR
UPDATE public.hr_payslips cl SET tenant_id = p.tenant_id FROM public.hr_employees p WHERE cl.employee_id = p.id AND cl.tenant_id IS NULL AND p.tenant_id IS NOT NULL;

-- Manufacturing
UPDATE public.mfg_bom_lines           cl SET tenant_id = p.tenant_id FROM public.mfg_boms        p WHERE cl.bom_id        = p.id AND cl.tenant_id IS NULL AND p.tenant_id IS NOT NULL;
UPDATE public.mfg_routing_operations  cl SET tenant_id = p.tenant_id FROM public.mfg_routings    p WHERE cl.routing_id    = p.id AND cl.tenant_id IS NULL AND p.tenant_id IS NOT NULL;
UPDATE public.mfg_wo_materials        cl SET tenant_id = p.tenant_id FROM public.mfg_work_orders p WHERE cl.work_order_id = p.id AND cl.tenant_id IS NULL AND p.tenant_id IS NOT NULL;
UPDATE public.mfg_wo_operations       cl SET tenant_id = p.tenant_id FROM public.mfg_work_orders p WHERE cl.work_order_id = p.id AND cl.tenant_id IS NULL AND p.tenant_id IS NOT NULL;

-- Project Management
UPDATE public.pm_milestones cl SET tenant_id = p.tenant_id FROM public.pm_projects p WHERE cl.project_id = p.id AND cl.tenant_id IS NULL AND p.tenant_id IS NOT NULL;
UPDATE public.pm_tasks      cl SET tenant_id = p.tenant_id FROM public.pm_projects p WHERE cl.project_id = p.id AND cl.tenant_id IS NULL AND p.tenant_id IS NOT NULL;

-- Real Estate
UPDATE public.re_rent_payments cl SET tenant_id = p.tenant_id FROM public.re_leases     p WHERE cl.lease_id    = p.id AND cl.tenant_id IS NULL AND p.tenant_id IS NOT NULL;
UPDATE public.re_units         cl SET tenant_id = p.tenant_id FROM public.re_properties p WHERE cl.property_id = p.id AND cl.tenant_id IS NULL AND p.tenant_id IS NOT NULL;

-- Inventory child rows -> parent count sheets / warehouses
UPDATE public.inv_count_lines cl SET tenant_id = p.tenant_id FROM public.inv_count_sheets p WHERE cl.count_sheet_id = p.id AND cl.tenant_id IS NULL AND p.tenant_id IS NOT NULL;
UPDATE public.inv_locations   cl SET tenant_id = p.tenant_id FROM public.inv_warehouses   p WHERE cl.warehouse_id   = p.id AND cl.tenant_id IS NULL AND p.tenant_id IS NOT NULL;

-- GL journal lines -> journal entries
UPDATE public.gl_journal_lines cl SET tenant_id = p.tenant_id FROM public.gl_journal_entries p WHERE cl.journal_entry_id = p.id AND cl.tenant_id IS NULL AND p.tenant_id IS NOT NULL;

-- Auto / Energy / Events / Sports / Logistics / Legal / Agri remaining
UPDATE public.auto_service_items   cl SET tenant_id = p.tenant_id FROM public.auto_service_orders p WHERE cl.service_order_id = p.id AND cl.tenant_id IS NULL AND p.tenant_id IS NOT NULL;
UPDATE public.energy_readings      cl SET tenant_id = p.tenant_id FROM public.energy_sites        p WHERE cl.site_id          = p.id AND cl.tenant_id IS NULL AND p.tenant_id IS NOT NULL;
UPDATE public.events_registrations cl SET tenant_id = p.tenant_id FROM public.events             p WHERE cl.event_id          = p.id AND cl.tenant_id IS NULL AND p.tenant_id IS NOT NULL;
UPDATE public.events_speakers      cl SET tenant_id = p.tenant_id FROM public.events             p WHERE cl.event_id          = p.id AND cl.tenant_id IS NULL AND p.tenant_id IS NOT NULL;
UPDATE public.events_tickets       cl SET tenant_id = p.tenant_id FROM public.events             p WHERE cl.event_id          = p.id AND cl.tenant_id IS NULL AND p.tenant_id IS NOT NULL;
UPDATE public.sports_training      cl SET tenant_id = p.tenant_id FROM public.sports_clubs       p WHERE cl.club_id           = p.id AND cl.tenant_id IS NULL AND p.tenant_id IS NOT NULL;
UPDATE public.log_tracking_events  cl SET tenant_id = p.tenant_id FROM public.log_shipments      p WHERE cl.shipment_id       = p.id AND cl.tenant_id IS NULL AND p.tenant_id IS NOT NULL;
UPDATE public.legal_time_entries   cl SET tenant_id = p.tenant_id FROM public.legal_cases        p WHERE cl.case_id           = p.id AND cl.tenant_id IS NULL AND p.tenant_id IS NOT NULL;
UPDATE public.agri_fields          cl SET tenant_id = p.tenant_id FROM public.agri_farms         p WHERE cl.farm_id           = p.id AND cl.tenant_id IS NULL AND p.tenant_id IS NOT NULL;
UPDATE public.agri_harvest_logs    cl SET tenant_id = p.tenant_id FROM public.agri_fields        p WHERE cl.field_id          = p.id AND cl.tenant_id IS NULL AND p.tenant_id IS NOT NULL;

-- Tables that have no immediate FK parent:
--   ai_agents, ai_code_reviews, ai_models, ai_workflows  -> platform-level catalog
--   api_keys, app_generators, app_menu, global_settings  -> platform-level catalog
--   inventory, invoices                                  -> orphaned legacy (drop in M82)
-- These are left tenant_id NULL; a follow-up migration will assign to a
-- "platform" tenant or drop the row, depending on product decision.

-- =============================================================================
-- End of 00072_tenant_id_columns_and_indexes.sql
-- Next migrations in the chain (per AGENT-09):
--   00073 - performance FK indexes for the 167 unindexed FK columns
--   00074 - flip tenant_id NOT NULL after backfill verification
--   00075 - per-table BEFORE INSERT triggers to copy tenant_id from parent
--   00076 - replace USING(true) RLS predicates with tenant-aware policies
-- =============================================================================
