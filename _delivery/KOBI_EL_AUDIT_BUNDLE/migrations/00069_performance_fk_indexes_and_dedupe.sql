-- ============================================================
-- B-PERF: Database performance hardening
-- ------------------------------------------------------------
-- 1) Drop 4 duplicate indexes (wasted writes + storage)
-- 2) Add 43 missing FK indexes (big read perf win on joins/deletes)
-- Supabase advisor lints: unindexed_foreign_keys, duplicate_index
-- ============================================================

-- === 1) Drop duplicate indexes ===
DROP INDEX IF EXISTS docs.idx_docsigreq_document_id;
DROP INDEX IF EXISTS inventory.ix_fk_inventory_movements_material_id;
DROP INDEX IF EXISTS inventory.ix_fk_material_lots_material_id;
DROP INDEX IF EXISTS inventory.ix_fk_shortage_snapshots_material_id;

-- === 2) Add missing FK indexes ===
-- commercial
CREATE INDEX IF NOT EXISTS ix_customers_segment_id            ON commercial.customers (segment_id);
CREATE INDEX IF NOT EXISTS ix_leads_lead_source_id            ON commercial.leads (lead_source_id);
CREATE INDEX IF NOT EXISTS ix_sales_orders_customer_id        ON commercial.sales_orders (customer_id);
CREATE INDEX IF NOT EXISTS ix_sales_orders_quote_id           ON commercial.sales_orders (quote_id);

-- execution
CREATE INDEX IF NOT EXISTS ix_production_orders_project_id    ON execution.production_orders (project_id);
CREATE INDEX IF NOT EXISTS ix_production_orders_work_center   ON execution.production_orders (work_center_id);
CREATE INDEX IF NOT EXISTS ix_production_orders_work_order    ON execution.production_orders (work_order_id);
CREATE INDEX IF NOT EXISTS ix_labor_logs_employee_user_id     ON execution.labor_logs (employee_user_id);
CREATE INDEX IF NOT EXISTS ix_labor_logs_production_order_id  ON execution.labor_logs (production_order_id);
CREATE INDEX IF NOT EXISTS ix_labor_logs_project_id           ON execution.labor_logs (project_id);
CREATE INDEX IF NOT EXISTS ix_labor_logs_task_id              ON execution.labor_logs (task_id);
CREATE INDEX IF NOT EXISTS ix_labor_logs_work_center_id       ON execution.labor_logs (work_center_id);
CREATE INDEX IF NOT EXISTS ix_labor_logs_work_order_id        ON execution.labor_logs (work_order_id);
CREATE INDEX IF NOT EXISTS ix_installation_teams_team_lead    ON execution.installation_teams (team_lead_user_id);
CREATE INDEX IF NOT EXISTS ix_site_visits_installation_team   ON execution.site_visits (installation_team_id);
CREATE INDEX IF NOT EXISTS ix_site_visits_project_id          ON execution.site_visits (project_id);
CREATE INDEX IF NOT EXISTS ix_site_visits_work_order_id       ON execution.site_visits (work_order_id);
CREATE INDEX IF NOT EXISTS ix_punch_lists_project_id          ON execution.punch_lists (project_id);
CREATE INDEX IF NOT EXISTS ix_punch_lists_work_order_id       ON execution.punch_lists (work_order_id);
CREATE INDEX IF NOT EXISTS ix_drawings_project_id             ON execution.drawings (project_id);
CREATE INDEX IF NOT EXISTS ix_drawings_work_order_id          ON execution.drawings (work_order_id);
CREATE INDEX IF NOT EXISTS ix_bom_headers_drawing_id          ON execution.bom_headers (drawing_id);
CREATE INDEX IF NOT EXISTS ix_bom_headers_project_id          ON execution.bom_headers (project_id);
CREATE INDEX IF NOT EXISTS ix_bom_headers_work_order_id       ON execution.bom_headers (work_order_id);

-- procurement
CREATE INDEX IF NOT EXISTS ix_goods_receipts_created_by       ON procurement.goods_receipts (created_by);
CREATE INDEX IF NOT EXISTS ix_goods_receipts_received_by      ON procurement.goods_receipts (received_by_user_id);
CREATE INDEX IF NOT EXISTS ix_goods_receipts_supplier_id      ON procurement.goods_receipts (supplier_id);
CREATE INDEX IF NOT EXISTS ix_goods_receipts_updated_by       ON procurement.goods_receipts (updated_by);
CREATE INDEX IF NOT EXISTS ix_goods_receipt_lines_po_line     ON procurement.goods_receipt_lines (po_line_id);
CREATE INDEX IF NOT EXISTS ix_three_way_matches_approved_by   ON procurement.three_way_matches (approved_by_user_id);
CREATE INDEX IF NOT EXISTS ix_three_way_matches_created_by    ON procurement.three_way_matches (created_by);
CREATE INDEX IF NOT EXISTS ix_three_way_matches_goods_rcpt    ON procurement.three_way_matches (goods_receipt_id);
CREATE INDEX IF NOT EXISTS ix_three_way_matches_resolved_by   ON procurement.three_way_matches (resolved_by_user_id);
CREATE INDEX IF NOT EXISTS ix_three_way_matches_supplier_inv  ON procurement.three_way_matches (supplier_invoice_id);
CREATE INDEX IF NOT EXISTS ix_three_way_matches_updated_by    ON procurement.three_way_matches (updated_by);
CREATE INDEX IF NOT EXISTS ix_supplier_evaluations_created_by ON procurement.supplier_evaluations (created_by);
CREATE INDEX IF NOT EXISTS ix_supplier_evaluations_evaluated  ON procurement.supplier_evaluations (evaluated_by_user_id);
CREATE INDEX IF NOT EXISTS ix_supplier_evaluations_updated_by ON procurement.supplier_evaluations (updated_by);
CREATE INDEX IF NOT EXISTS ix_subcontractors_created_by       ON procurement.subcontractors (created_by);
CREATE INDEX IF NOT EXISTS ix_subcontractors_linked_supplier  ON procurement.subcontractors (linked_supplier_id);
CREATE INDEX IF NOT EXISTS ix_subcontractors_updated_by       ON procurement.subcontractors (updated_by);

-- workforce
CREATE INDEX IF NOT EXISTS ix_attendance_exceptions_att_id    ON workforce.attendance_exceptions (attendance_id);

-- docs
CREATE INDEX IF NOT EXISTS ix_document_relations_to_doc       ON docs.document_relations (to_document_id);
CREATE INDEX IF NOT EXISTS ix_knowledge_cards_source_doc      ON docs.knowledge_cards (source_document_id);
