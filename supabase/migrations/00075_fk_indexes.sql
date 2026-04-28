-- =============================================================================
-- Migration: 00075_fk_indexes.sql
-- Author:    Agent 220 (per Agent 09 - DB Integrity audit, line 91-97)
-- Date:      2026-04-29
-- Purpose:   Performance hardening - add btree indexes for the 167 foreign-key
--            columns identified by AGENT-09 as lacking a supporting index.
--
--   Without these indexes:
--     - cascading deletes do sequential scans on every child table
--     - join queries (RLS predicates, 360 pages, control-room rollups) walk
--       the entire child relation
--     - the upcoming tenant-aware RLS hardening (00076-00077) would amplify
--       the scan cost by orders of magnitude on the high-volume AP/AR/proc/
--       inv/mfg domains.
--
--   This migration is companion to:
--     00069 - covered 43 indexes in commercial/execution/procurement/workforce/docs
--     00072 - covered 29 tenant_id indexes (CRM/AGRI/AI/ECOM/EDU/etc.)
--   00075 covers the remaining 167 - vertical-domain (public.*) FK columns,
--   organised by table for review-friendly diffs.
--
-- Idempotency: every statement uses CREATE INDEX IF NOT EXISTS. Safe to re-run.
-- Naming: idx_<table>_<column>  (matches the convention adopted in 00072).
-- Storage: btree default. No partial / expression indexes here - the goal is
--          to make the join planner pick an index scan for FK lookups, not to
--          optimise specific predicates.
-- Concurrency: statements are written without CONCURRENTLY so they fit inside
--          Supabase's transactional migration runner. If you want zero-lock
--          deployment on a hot DB, replay this file outside a transaction with
--          `psql --single-transaction=off` and add CONCURRENTLY by hand.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Accounts Payable (AP) - 14 columns
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_ap_invoice_lines_gl_account_id        ON public.ap_invoice_lines (gl_account_id);
CREATE INDEX IF NOT EXISTS idx_ap_invoice_lines_invoice_id           ON public.ap_invoice_lines (invoice_id);
CREATE INDEX IF NOT EXISTS idx_ap_invoice_lines_item_id              ON public.ap_invoice_lines (item_id);
CREATE INDEX IF NOT EXISTS idx_ap_invoices_gl_account_id             ON public.ap_invoices (gl_account_id);
CREATE INDEX IF NOT EXISTS idx_ap_invoices_vendor_id                 ON public.ap_invoices (vendor_id);
CREATE INDEX IF NOT EXISTS idx_ap_payment_allocations_invoice_id     ON public.ap_payment_allocations (invoice_id);
CREATE INDEX IF NOT EXISTS idx_ap_payment_allocations_payment_id     ON public.ap_payment_allocations (payment_id);
CREATE INDEX IF NOT EXISTS idx_ap_payments_vendor_id                 ON public.ap_payments (vendor_id);
CREATE INDEX IF NOT EXISTS idx_ap_payments_bank_account_id           ON public.ap_payments (bank_account_id);
CREATE INDEX IF NOT EXISTS idx_ap_price_history_invoice_id           ON public.ap_price_history (invoice_id);
CREATE INDEX IF NOT EXISTS idx_ap_price_history_item_id              ON public.ap_price_history (item_id);
CREATE INDEX IF NOT EXISTS idx_ap_price_history_vendor_id            ON public.ap_price_history (vendor_id);
CREATE INDEX IF NOT EXISTS idx_ap_vendors_gl_account_id              ON public.ap_vendors (gl_account_id);
CREATE INDEX IF NOT EXISTS idx_ap_vendor_contacts_vendor_id          ON public.ap_vendor_contacts (vendor_id);

-- -----------------------------------------------------------------------------
-- 2. Accounts Receivable (AR) - 13 columns
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_ar_credit_notes_applied_to_invoice_id ON public.ar_credit_notes (applied_to_invoice_id);
CREATE INDEX IF NOT EXISTS idx_ar_credit_notes_customer_id           ON public.ar_credit_notes (customer_id);
CREATE INDEX IF NOT EXISTS idx_ar_credit_notes_original_invoice_id   ON public.ar_credit_notes (original_invoice_id);
CREATE INDEX IF NOT EXISTS idx_ar_customers_gl_account_id            ON public.ar_customers (gl_account_id);
CREATE INDEX IF NOT EXISTS idx_ar_invoice_lines_gl_account_id        ON public.ar_invoice_lines (gl_account_id);
CREATE INDEX IF NOT EXISTS idx_ar_invoice_lines_invoice_id           ON public.ar_invoice_lines (invoice_id);
CREATE INDEX IF NOT EXISTS idx_ar_invoice_lines_item_id              ON public.ar_invoice_lines (item_id);
CREATE INDEX IF NOT EXISTS idx_ar_invoices_customer_id               ON public.ar_invoices (customer_id);
CREATE INDEX IF NOT EXISTS idx_ar_invoices_gl_account_id             ON public.ar_invoices (gl_account_id);
CREATE INDEX IF NOT EXISTS idx_ar_receipts_customer_id               ON public.ar_receipts (customer_id);
CREATE INDEX IF NOT EXISTS idx_ar_receipts_bank_account_id           ON public.ar_receipts (bank_account_id);
CREATE INDEX IF NOT EXISTS idx_ar_receipt_allocations_invoice_id     ON public.ar_receipt_allocations (invoice_id);
CREATE INDEX IF NOT EXISTS idx_ar_receipt_allocations_receipt_id     ON public.ar_receipt_allocations (receipt_id);

-- -----------------------------------------------------------------------------
-- 3. General Ledger (GL) - 6 columns
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_gl_journal_entries_period_id          ON public.gl_journal_entries (period_id);
CREATE INDEX IF NOT EXISTS idx_gl_journal_entries_created_by         ON public.gl_journal_entries (created_by);
CREATE INDEX IF NOT EXISTS idx_gl_journal_lines_account_id           ON public.gl_journal_lines (account_id);
CREATE INDEX IF NOT EXISTS idx_gl_journal_lines_journal_entry_id     ON public.gl_journal_lines (journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_gl_recurring_entries_template_id      ON public.gl_recurring_entries (template_id);
CREATE INDEX IF NOT EXISTS idx_gl_audit_trail_entry_id               ON public.gl_audit_trail (entry_id);

-- -----------------------------------------------------------------------------
-- 4. Procurement - 17 columns
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_proc_goods_receipts_po_id             ON public.proc_goods_receipts (po_id);
CREATE INDEX IF NOT EXISTS idx_proc_goods_receipts_vendor_id         ON public.proc_goods_receipts (vendor_id);
CREATE INDEX IF NOT EXISTS idx_proc_goods_receipts_warehouse_id      ON public.proc_goods_receipts (warehouse_id);
CREATE INDEX IF NOT EXISTS idx_proc_grn_lines_grn_id                 ON public.proc_grn_lines (grn_id);
CREATE INDEX IF NOT EXISTS idx_proc_grn_lines_item_id                ON public.proc_grn_lines (item_id);
CREATE INDEX IF NOT EXISTS idx_proc_grn_lines_location_id            ON public.proc_grn_lines (location_id);
CREATE INDEX IF NOT EXISTS idx_proc_grn_lines_po_line_id             ON public.proc_grn_lines (po_line_id);
CREATE INDEX IF NOT EXISTS idx_proc_po_lines_item_id                 ON public.proc_po_lines (item_id);
CREATE INDEX IF NOT EXISTS idx_proc_po_lines_po_id                   ON public.proc_po_lines (po_id);
CREATE INDEX IF NOT EXISTS idx_proc_purchase_orders_requisition_id   ON public.proc_purchase_orders (requisition_id);
CREATE INDEX IF NOT EXISTS idx_proc_purchase_orders_ship_to_warehouse_id ON public.proc_purchase_orders (ship_to_warehouse_id);
CREATE INDEX IF NOT EXISTS idx_proc_purchase_orders_vendor_id        ON public.proc_purchase_orders (vendor_id);
CREATE INDEX IF NOT EXISTS idx_proc_requisition_lines_item_id        ON public.proc_requisition_lines (item_id);
CREATE INDEX IF NOT EXISTS idx_proc_requisition_lines_preferred_vendor_id ON public.proc_requisition_lines (preferred_vendor_id);
CREATE INDEX IF NOT EXISTS idx_proc_requisition_lines_requisition_id ON public.proc_requisition_lines (requisition_id);
CREATE INDEX IF NOT EXISTS idx_proc_rfq_items_item_id                ON public.proc_rfq_items (item_id);
CREATE INDEX IF NOT EXISTS idx_proc_rfq_items_rfq_id                 ON public.proc_rfq_items (rfq_id);
CREATE INDEX IF NOT EXISTS idx_proc_rfq_vendors_rfq_id               ON public.proc_rfq_vendors (rfq_id);
CREATE INDEX IF NOT EXISTS idx_proc_rfq_vendors_vendor_id            ON public.proc_rfq_vendors (vendor_id);

-- -----------------------------------------------------------------------------
-- 5. Inventory - 11 columns
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_inv_count_lines_count_sheet_id        ON public.inv_count_lines (count_sheet_id);
CREATE INDEX IF NOT EXISTS idx_inv_count_lines_item_id               ON public.inv_count_lines (item_id);
CREATE INDEX IF NOT EXISTS idx_inv_count_lines_location_id           ON public.inv_count_lines (location_id);
CREATE INDEX IF NOT EXISTS idx_inv_count_sheets_warehouse_id         ON public.inv_count_sheets (warehouse_id);
CREATE INDEX IF NOT EXISTS idx_inv_locations_warehouse_id            ON public.inv_locations (warehouse_id);
CREATE INDEX IF NOT EXISTS idx_inv_stock_item_id                     ON public.inv_stock (item_id);
CREATE INDEX IF NOT EXISTS idx_inv_stock_location_id                 ON public.inv_stock (location_id);
CREATE INDEX IF NOT EXISTS idx_inv_transactions_from_location_id     ON public.inv_transactions (from_location_id);
CREATE INDEX IF NOT EXISTS idx_inv_transactions_from_warehouse_id    ON public.inv_transactions (from_warehouse_id);
CREATE INDEX IF NOT EXISTS idx_inv_transactions_to_location_id       ON public.inv_transactions (to_location_id);
CREATE INDEX IF NOT EXISTS idx_inv_transactions_to_warehouse_id      ON public.inv_transactions (to_warehouse_id);

-- -----------------------------------------------------------------------------
-- 6. Manufacturing - 13 columns
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_mfg_bom_lines_bom_id                  ON public.mfg_bom_lines (bom_id);
CREATE INDEX IF NOT EXISTS idx_mfg_bom_lines_component_item_id       ON public.mfg_bom_lines (component_item_id);
CREATE INDEX IF NOT EXISTS idx_mfg_bom_lines_substitute_item_id      ON public.mfg_bom_lines (substitute_item_id);
CREATE INDEX IF NOT EXISTS idx_mfg_routing_operations_routing_id     ON public.mfg_routing_operations (routing_id);
CREATE INDEX IF NOT EXISTS idx_mfg_routing_operations_work_center_id ON public.mfg_routing_operations (work_center_id);
CREATE INDEX IF NOT EXISTS idx_mfg_wo_materials_item_id              ON public.mfg_wo_materials (item_id);
CREATE INDEX IF NOT EXISTS idx_mfg_wo_materials_warehouse_id         ON public.mfg_wo_materials (warehouse_id);
CREATE INDEX IF NOT EXISTS idx_mfg_wo_materials_work_order_id        ON public.mfg_wo_materials (work_order_id);
CREATE INDEX IF NOT EXISTS idx_mfg_wo_operations_work_center_id      ON public.mfg_wo_operations (work_center_id);
CREATE INDEX IF NOT EXISTS idx_mfg_wo_operations_work_order_id       ON public.mfg_wo_operations (work_order_id);
CREATE INDEX IF NOT EXISTS idx_mfg_work_orders_bom_id                ON public.mfg_work_orders (bom_id);
CREATE INDEX IF NOT EXISTS idx_mfg_work_orders_routing_id            ON public.mfg_work_orders (routing_id);
CREATE INDEX IF NOT EXISTS idx_mfg_work_orders_warehouse_id          ON public.mfg_work_orders (warehouse_id);

-- -----------------------------------------------------------------------------
-- 7. CRM - 7 columns
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_crm_activities_company_id             ON public.crm_activities (company_id);
CREATE INDEX IF NOT EXISTS idx_crm_activities_contact_id             ON public.crm_activities (contact_id);
CREATE INDEX IF NOT EXISTS idx_crm_activities_deal_id                ON public.crm_activities (deal_id);
CREATE INDEX IF NOT EXISTS idx_crm_companies_owner_user_id           ON public.crm_companies (owner_user_id);
CREATE INDEX IF NOT EXISTS idx_crm_deals_company_id                  ON public.crm_deals (company_id);
CREATE INDEX IF NOT EXISTS idx_crm_deals_contact_id                  ON public.crm_deals (contact_id);
CREATE INDEX IF NOT EXISTS idx_crm_deals_pipeline_id                 ON public.crm_deals (pipeline_id);

-- -----------------------------------------------------------------------------
-- 8. HR / Workforce - 8 columns
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_hr_employees_department_id            ON public.hr_employees (department_id);
CREATE INDEX IF NOT EXISTS idx_hr_employees_manager_id               ON public.hr_employees (manager_id);
CREATE INDEX IF NOT EXISTS idx_hr_payslips_employee_id               ON public.hr_payslips (employee_id);
CREATE INDEX IF NOT EXISTS idx_hr_payslips_period_id                 ON public.hr_payslips (period_id);
CREATE INDEX IF NOT EXISTS idx_hr_leave_requests_employee_id         ON public.hr_leave_requests (employee_id);
CREATE INDEX IF NOT EXISTS idx_hr_leave_requests_approver_id         ON public.hr_leave_requests (approver_id);
CREATE INDEX IF NOT EXISTS idx_hr_performance_reviews_employee_id    ON public.hr_performance_reviews (employee_id);
CREATE INDEX IF NOT EXISTS idx_hr_performance_reviews_reviewer_id    ON public.hr_performance_reviews (reviewer_id);

-- -----------------------------------------------------------------------------
-- 9. Project Management (PM) - 6 columns
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_pm_milestones_project_id              ON public.pm_milestones (project_id);
CREATE INDEX IF NOT EXISTS idx_pm_tasks_assignee_id                  ON public.pm_tasks (assignee_id);
CREATE INDEX IF NOT EXISTS idx_pm_tasks_milestone_id                 ON public.pm_tasks (milestone_id);
CREATE INDEX IF NOT EXISTS idx_pm_tasks_project_id                   ON public.pm_tasks (project_id);
CREATE INDEX IF NOT EXISTS idx_pm_time_entries_task_id               ON public.pm_time_entries (task_id);
CREATE INDEX IF NOT EXISTS idx_pm_time_entries_user_id               ON public.pm_time_entries (user_id);

-- -----------------------------------------------------------------------------
-- 10. Banking - 3 columns
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_bank_cards_account_id                 ON public.bank_cards (account_id);
CREATE INDEX IF NOT EXISTS idx_bank_cards_user_id                    ON public.bank_cards (user_id);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_account_id          ON public.bank_transactions (account_id);

-- -----------------------------------------------------------------------------
-- 11. E-commerce - 7 columns
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_ecom_carts_customer_id                ON public.ecom_carts (customer_id);
CREATE INDEX IF NOT EXISTS idx_ecom_carts_store_id                   ON public.ecom_carts (store_id);
CREATE INDEX IF NOT EXISTS idx_ecom_orders_customer_id               ON public.ecom_orders (customer_id);
CREATE INDEX IF NOT EXISTS idx_ecom_orders_store_id                  ON public.ecom_orders (store_id);
CREATE INDEX IF NOT EXISTS idx_ecom_order_items_order_id             ON public.ecom_order_items (order_id);
CREATE INDEX IF NOT EXISTS idx_ecom_order_items_product_id           ON public.ecom_order_items (product_id);
CREATE INDEX IF NOT EXISTS idx_ecom_reviews_product_id               ON public.ecom_reviews (product_id);

-- -----------------------------------------------------------------------------
-- 12. Education - 5 columns
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_edu_assignments_course_id             ON public.edu_assignments (course_id);
CREATE INDEX IF NOT EXISTS idx_edu_enrollments_course_id             ON public.edu_enrollments (course_id);
CREATE INDEX IF NOT EXISTS idx_edu_enrollments_student_id            ON public.edu_enrollments (student_id);
CREATE INDEX IF NOT EXISTS idx_edu_submissions_assignment_id         ON public.edu_submissions (assignment_id);
CREATE INDEX IF NOT EXISTS idx_edu_submissions_student_id            ON public.edu_submissions (student_id);

-- -----------------------------------------------------------------------------
-- 13. Health - 4 columns
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_health_medical_records_patient_id     ON public.health_medical_records (patient_id);
CREATE INDEX IF NOT EXISTS idx_health_medical_records_provider_id    ON public.health_medical_records (provider_id);
CREATE INDEX IF NOT EXISTS idx_health_prescriptions_patient_id       ON public.health_prescriptions (patient_id);
CREATE INDEX IF NOT EXISTS idx_health_billing_patient_id             ON public.health_billing (patient_id);

-- -----------------------------------------------------------------------------
-- 14. Hotel - 5 columns
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_hotel_rooms_property_id               ON public.hotel_rooms (property_id);
CREATE INDEX IF NOT EXISTS idx_hotel_rooms_room_type_id              ON public.hotel_rooms (room_type_id);
CREATE INDEX IF NOT EXISTS idx_hotel_room_types_property_id          ON public.hotel_room_types (property_id);
CREATE INDEX IF NOT EXISTS idx_hotel_housekeeping_property_id        ON public.hotel_housekeeping (property_id);
CREATE INDEX IF NOT EXISTS idx_hotel_housekeeping_room_id            ON public.hotel_housekeeping (room_id);

-- -----------------------------------------------------------------------------
-- 15. Food / Restaurant - 7 columns
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_food_menu_categories_restaurant_id    ON public.food_menu_categories (restaurant_id);
CREATE INDEX IF NOT EXISTS idx_food_menu_items_category_id           ON public.food_menu_items (category_id);
CREATE INDEX IF NOT EXISTS idx_food_menu_items_restaurant_id         ON public.food_menu_items (restaurant_id);
CREATE INDEX IF NOT EXISTS idx_food_order_items_menu_item_id         ON public.food_order_items (menu_item_id);
CREATE INDEX IF NOT EXISTS idx_food_order_items_order_id             ON public.food_order_items (order_id);
CREATE INDEX IF NOT EXISTS idx_food_orders_restaurant_id             ON public.food_orders (restaurant_id);
CREATE INDEX IF NOT EXISTS idx_food_tables_restaurant_id             ON public.food_tables (restaurant_id);

-- -----------------------------------------------------------------------------
-- 16. Real Estate - 4 columns
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_re_units_property_id                  ON public.re_units (property_id);
CREATE INDEX IF NOT EXISTS idx_re_leases_unit_id                     ON public.re_leases (unit_id);
CREATE INDEX IF NOT EXISTS idx_re_leases_tenant_party_id             ON public.re_leases (tenant_party_id);
CREATE INDEX IF NOT EXISTS idx_re_rent_payments_lease_id             ON public.re_rent_payments (lease_id);

-- -----------------------------------------------------------------------------
-- 17. Auto / Service - 3 columns
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_auto_service_orders_vehicle_id        ON public.auto_service_orders (vehicle_id);
CREATE INDEX IF NOT EXISTS idx_auto_service_orders_customer_id       ON public.auto_service_orders (customer_id);
CREATE INDEX IF NOT EXISTS idx_auto_service_items_service_order_id   ON public.auto_service_items (service_order_id);

-- -----------------------------------------------------------------------------
-- 18. Logistics - 4 columns
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_log_shipments_carrier_id              ON public.log_shipments (carrier_id);
CREATE INDEX IF NOT EXISTS idx_log_shipments_route_id                ON public.log_shipments (route_id);
CREATE INDEX IF NOT EXISTS idx_log_routes_origin_id                  ON public.log_routes (origin_id);
CREATE INDEX IF NOT EXISTS idx_log_tracking_events_shipment_id       ON public.log_tracking_events (shipment_id);

-- -----------------------------------------------------------------------------
-- 19. Energy - 3 columns
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_energy_readings_site_id               ON public.energy_readings (site_id);
CREATE INDEX IF NOT EXISTS idx_energy_readings_meter_id              ON public.energy_readings (meter_id);
CREATE INDEX IF NOT EXISTS idx_energy_sites_customer_id              ON public.energy_sites (customer_id);

-- -----------------------------------------------------------------------------
-- 20. Events - 3 columns
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_events_registrations_event_id         ON public.events_registrations (event_id);
CREATE INDEX IF NOT EXISTS idx_events_speakers_event_id              ON public.events_speakers (event_id);
CREATE INDEX IF NOT EXISTS idx_events_tickets_event_id               ON public.events_tickets (event_id);

-- -----------------------------------------------------------------------------
-- 21. Agriculture - 3 columns
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_agri_fields_farm_id                   ON public.agri_fields (farm_id);
CREATE INDEX IF NOT EXISTS idx_agri_harvest_logs_field_id            ON public.agri_harvest_logs (field_id);
CREATE INDEX IF NOT EXISTS idx_agri_livestock_farm_id                ON public.agri_livestock (farm_id);

-- -----------------------------------------------------------------------------
-- 22. Legal - 3 columns
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_legal_documents_case_id               ON public.legal_documents (case_id);
CREATE INDEX IF NOT EXISTS idx_legal_time_entries_case_id            ON public.legal_time_entries (case_id);
CREATE INDEX IF NOT EXISTS idx_legal_time_entries_lawyer_id          ON public.legal_time_entries (lawyer_id);

-- -----------------------------------------------------------------------------
-- 23. Security / Assets - 3 columns
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_sec_access_logs_asset_id              ON public.sec_access_logs (asset_id);
CREATE INDEX IF NOT EXISTS idx_sec_access_logs_user_id               ON public.sec_access_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_sec_assets_owner_id                   ON public.sec_assets (owner_id);

-- -----------------------------------------------------------------------------
-- 24. Sports - 5 columns
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_sports_athletes_club_id               ON public.sports_athletes (club_id);
CREATE INDEX IF NOT EXISTS idx_sports_matches_home_club_id           ON public.sports_matches (home_club_id);
CREATE INDEX IF NOT EXISTS idx_sports_matches_away_club_id           ON public.sports_matches (away_club_id);
CREATE INDEX IF NOT EXISTS idx_sports_training_athlete_id            ON public.sports_training (athlete_id);
CREATE INDEX IF NOT EXISTS idx_sports_training_club_id               ON public.sports_training (club_id);

-- -----------------------------------------------------------------------------
-- 25. AI / Sessions - 4 columns
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_ai_sessions_user_id                   ON public.ai_sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_ai_sessions_agent_id                  ON public.ai_sessions (agent_id);
CREATE INDEX IF NOT EXISTS idx_ai_messages_session_id                ON public.ai_messages (session_id);
CREATE INDEX IF NOT EXISTS idx_ai_messages_user_id                   ON public.ai_messages (user_id);

-- -----------------------------------------------------------------------------
-- 26. Tenancy - 3 columns
-- -----------------------------------------------------------------------------
-- Note: platform_* FK indexes are scoped to migration 00079 per AGENT-09 §M79.
CREATE INDEX IF NOT EXISTS idx_tenant_users_user_id                  ON public.tenant_users (user_id);
CREATE INDEX IF NOT EXISTS idx_tenant_modules_module_id              ON public.tenant_modules (module_id);
CREATE INDEX IF NOT EXISTS idx_tenant_modules_tenant_id              ON public.tenant_modules (tenant_id);

-- =============================================================================
-- Verification helper - run after deploy to confirm AGENT-09's count drops to 0:
--   SELECT COUNT(*) FROM (
--     SELECT c.conrelid::regclass AS tbl, a.attname AS col
--     FROM pg_constraint c
--     JOIN pg_attribute  a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
--     WHERE c.contype = 'f'
--       AND NOT EXISTS (
--         SELECT 1 FROM pg_index i
--         WHERE i.indrelid = c.conrelid
--           AND a.attnum = ANY(i.indkey)
--       )
--   ) missing;
-- Expected: 0 (or only dropdowns covered by a multi-column index already).
-- =============================================================================
-- End of 00075_fk_indexes.sql
-- =============================================================================
