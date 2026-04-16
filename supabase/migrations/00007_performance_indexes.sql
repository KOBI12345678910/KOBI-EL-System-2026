-- =========================================================
-- Migration 007: Performance Indexes
-- TechnoKol Uzi ERP 2026
--
-- Indexes for hot query paths: control rooms, 360 pages,
-- audit trails, event dispatch, and payroll calculations.
-- =========================================================

-- ── Governance (audit + events — highest write volume) ──
create index concurrently if not exists idx_audit_logs_entity
  on governance.audit_logs (entity_type, entity_id, performed_at desc);
create index concurrently if not exists idx_audit_logs_correlation
  on governance.audit_logs (correlation_id) where correlation_id is not null;
create index concurrently if not exists idx_domain_events_topic_state
  on governance.domain_events (topic_name, processed_state, emitted_at);
create index concurrently if not exists idx_domain_events_entity
  on governance.domain_events (entity_type, entity_id);
create index concurrently if not exists idx_event_deliveries_state
  on governance.event_deliveries (delivery_state, next_retry_at)
  where delivery_state in ('pending','failed_retryable');
create index concurrently if not exists idx_state_history_entity
  on governance.state_history (entity_type, entity_id, changed_at desc);

-- ── Commercial ──
create index concurrently if not exists idx_customers_state
  on commercial.customers (state);
create index concurrently if not exists idx_quotes_customer_state
  on commercial.quotes (customer_id, state);
create index concurrently if not exists idx_quotes_state_date
  on commercial.quotes (state, quote_date desc);
create index concurrently if not exists idx_leads_state
  on commercial.leads (state, created_at desc);

-- ── Procurement ──
create index concurrently if not exists idx_po_supplier_state
  on procurement.purchase_orders (supplier_id, state);
create index concurrently if not exists idx_po_project
  on procurement.purchase_orders (project_id) where project_id is not null;
create index concurrently if not exists idx_po_delivery_date
  on procurement.purchase_orders (expected_delivery_date)
  where state = 'SentToSupplier';
create index concurrently if not exists idx_rfq_state
  on procurement.rfqs (state, created_at desc);
create index concurrently if not exists idx_approvals_state
  on procurement.approvals (approval_status, entity_type);

-- ── Execution ──
create index concurrently if not exists idx_projects_state
  on execution.projects (state);
create index concurrently if not exists idx_projects_customer
  on execution.projects (customer_id);
create index concurrently if not exists idx_work_orders_project_state
  on execution.work_orders (project_id, state);
create index concurrently if not exists idx_work_orders_deadline
  on execution.work_orders (required_end_date)
  where state not in ('Completed','SignedOff','Cancelled');
create index concurrently if not exists idx_tasks_state
  on execution.tasks (state, assigned_user_id);
create index concurrently if not exists idx_alerts_state
  on execution.alerts (state, category);
create index concurrently if not exists idx_alerts_parent
  on execution.alerts (parent_entity_type, parent_entity_id);

-- ── Inventory ──
create index concurrently if not exists idx_inventory_material_warehouse
  on inventory.inventory (material_id, warehouse_id);
create index concurrently if not exists idx_reservations_active
  on inventory.reservations (material_id, warehouse_id)
  where state = 'Active';

-- ── Workforce ──
create index concurrently if not exists idx_attendance_employee_date
  on workforce.attendance (employee_id, work_date desc);
create index concurrently if not exists idx_attendance_state
  on workforce.attendance (state) where state in ('Submitted','Draft');
create index concurrently if not exists idx_assignments_project
  on workforce.workforce_assignments (project_id)
  where state = 'Active';
create index concurrently if not exists idx_assignments_work_order
  on workforce.workforce_assignments (work_order_id)
  where state = 'Active';
create index concurrently if not exists idx_payroll_runs_state
  on workforce.payroll_runs (state);
create index concurrently if not exists idx_expenses_employee
  on workforce.employee_expenses (employee_id, state);

-- ── Finance ──
create index concurrently if not exists idx_invoices_state_due
  on finance.invoices (state, due_date);
create index concurrently if not exists idx_invoices_customer
  on finance.invoices (customer_id);
create index concurrently if not exists idx_invoices_project
  on finance.invoices (project_id) where project_id is not null;
create index concurrently if not exists idx_payments_invoice
  on finance.payments (invoice_id, payment_date);
create index concurrently if not exists idx_payments_match_status
  on finance.payments (bank_match_status)
  where bank_match_status != 'matched';
create index concurrently if not exists idx_gl_entity
  on finance.gl_transactions (entity_type, entity_id);
create index concurrently if not exists idx_collection_cases_state
  on finance.collection_cases (state);

-- ── Docs ──
create index concurrently if not exists idx_documents_parent
  on docs.documents (parent_entity_type, parent_entity_id);
create index concurrently if not exists idx_attachments_document
  on docs.attachments (document_id);
create index concurrently if not exists idx_attachments_entity
  on docs.attachments (entity_type, entity_id);

-- ── Intelligence ──
create index concurrently if not exists idx_insights_parent
  on intelligence.ai_insights (parent_entity_type, parent_entity_id);
create index concurrently if not exists idx_insights_state
  on intelligence.ai_insights (state, generated_at desc);
create index concurrently if not exists idx_anomalies_parent
  on intelligence.anomaly_cases (parent_entity_type, parent_entity_id);
create index concurrently if not exists idx_recommendations_state
  on intelligence.decision_recommendations (state, generated_at desc);
