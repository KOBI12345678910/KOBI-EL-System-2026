import { pool } from "@workspace/db";
import { logger } from "./logger";

const INDEXES = [
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_entity_records_entity_id ON entity_records(entity_id)`,
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_entity_records_status ON entity_records(status) WHERE status IS NOT NULL`,
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_entity_records_created_at ON entity_records(created_at DESC)`,
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_entity_records_entity_status ON entity_records(entity_id, status)`,

  `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_sessions_token ON user_sessions(token) WHERE is_active = true`,
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_sessions_user_active ON user_sessions(user_id, is_active) WHERE is_active = true`,
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_sessions_expires ON user_sessions(expires_at) WHERE is_active = true`,

  `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_record_audit_log_entity ON record_audit_log(entity_id, record_id)`,
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_record_audit_log_created ON record_audit_log(created_at DESC)`,

  `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, is_read) WHERE user_id IS NOT NULL`,
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notifications_created ON notifications(created_at DESC)`,

  `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_purchase_orders_supplier ON purchase_orders(supplier_id)`,
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_purchase_orders_status ON purchase_orders(status)`,
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_purchase_orders_created ON purchase_orders(created_at DESC)`,
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_purchase_order_items_order ON purchase_order_items(order_id)`,

  `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_goods_receipts_supplier ON goods_receipts(supplier_id)`,
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_goods_receipts_order ON goods_receipts(order_id) WHERE order_id IS NOT NULL`,
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_goods_receipt_items_receipt ON goods_receipt_items(receipt_id)`,

  `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_suppliers_status ON suppliers(status)`,
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_suppliers_category ON suppliers(category)`,

  `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_entity_fields_entity ON entity_fields(entity_id)`,

  `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_entity_records_data_gin ON entity_records USING GIN (data)`,
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_entity_records_entity_created ON entity_records(entity_id, created_at DESC)`,
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_entity_records_assigned ON entity_records(assigned_to) WHERE assigned_to IS NOT NULL`,
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_entity_records_created_by ON entity_records(created_by) WHERE created_by IS NOT NULL`,
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_entity_fields_entity_sort ON entity_fields(entity_id, sort_order ASC)`,
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_module_entities_module ON module_entities(module_id)`,
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_module_entities_slug ON module_entities(slug)`,

  `DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='role_permissions') THEN EXECUTE 'CREATE INDEX IF NOT EXISTS idx_role_permissions_role ON role_permissions(role_id)'; END IF; END $$`,

  `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_inventory_tx_material ON inventory_transactions(material_id)`,
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_inventory_tx_created ON inventory_transactions(created_at DESC)`,

  `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sales_orders_status ON sales_orders(status)`,
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sales_orders_created ON sales_orders(created_at DESC)`,
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sales_orders_customer ON sales_orders(customer_id)`,
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_work_orders_status ON work_orders(status)`,
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_work_orders_created ON work_orders(created_at DESC)`,
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_work_orders_priority ON work_orders(priority) WHERE priority IS NOT NULL`,
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_employees_status ON employees(status)`,
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_employees_department ON employees(department) WHERE department IS NOT NULL`,
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sales_customers_status ON sales_customers(status)`,
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_active ON products(is_active) WHERE is_active = true`,
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_customer_invoices_status ON customer_invoices(status)`,
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_customer_invoices_created ON customer_invoices(created_at DESC)`,
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_projects_status ON projects(status)`,
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_crm_leads_status ON crm_leads(status)`,
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_crm_leads_created ON crm_leads(created_at DESC)`,
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_raw_materials_stock ON raw_materials(current_stock, reorder_point) WHERE current_stock IS NOT NULL`,
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_log_created ON audit_log(created_at DESC)`,
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_log_action ON audit_log(action)`,
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_quality_inspections_result ON quality_inspections(result)`,
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_support_tickets_status ON support_tickets(status)`,
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_maintenance_orders_status ON maintenance_orders(status)`,

  `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_income_documents_status ON income_documents(status) WHERE status IS NOT NULL`,
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_income_documents_created ON income_documents(created_at DESC)`,
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_income_documents_customer ON income_documents(customer_name) WHERE customer_name IS NOT NULL`,

  `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_expenses_status ON expenses(status) WHERE status IS NOT NULL`,
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_expenses_created ON expenses(created_at DESC)`,
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_expenses_category ON expenses(category) WHERE category IS NOT NULL`,

  `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sales_customers_created ON sales_customers(created_at DESC)`,
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sales_customers_name ON sales_customers(name)`,

  `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_approval_requests_status ON approval_requests(status) WHERE status IS NOT NULL`,
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_approval_requests_created ON approval_requests(created_at DESC)`,

  `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_accounts_payable_status ON accounts_payable(status) WHERE status IS NOT NULL`,
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_accounts_payable_due_date ON accounts_payable(due_date) WHERE due_date IS NOT NULL`,
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_accounts_payable_created ON accounts_payable(created_at DESC)`,

  `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_accounts_receivable_status ON accounts_receivable(status) WHERE status IS NOT NULL`,
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_accounts_receivable_due_date ON accounts_receivable(due_date) WHERE due_date IS NOT NULL`,
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_accounts_receivable_created ON accounts_receivable(created_at DESC)`,

  `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_platform_modules_sort_order ON platform_modules(sort_order)`,
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_platform_modules_status ON platform_modules(status)`,
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_platform_modules_module_key ON platform_modules(module_key) WHERE module_key IS NOT NULL`,
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_module_entities_sort_order ON module_entities(module_id, sort_order)`,
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_module_entities_entity_key ON module_entities(entity_key) WHERE entity_key IS NOT NULL`,
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_platform_workflows_module_active ON platform_workflows(module_id, is_active, trigger_type)`,
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_platform_automations_module_active ON platform_automations(module_id, is_active, trigger_type)`,
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_business_rules_active ON business_rules(is_active, priority) WHERE is_active = true`,
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_workflow_instances_record_status ON workflow_instances(record_id, status)`,
];

let _indexesCreated = false;

export async function ensureProductionIndexes(): Promise<void> {
  if (_indexesCreated) return;

  try {
    const testResult = await Promise.race([
      pool.query("SELECT 1"),
      new Promise((_, reject) => setTimeout(() => reject(new Error("DB not ready")), 3000))
    ]);
    if (!testResult) return;
  } catch {
    logger.warn("Skipping index creation — DB not ready yet");
    return;
  }

  for (const ddl of INDEXES) {
    try {
      await pool.query(ddl);
    } catch (err) {
      logger.error("Index creation failed", {
        ddl,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  _indexesCreated = true;
}
