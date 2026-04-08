import { pool } from "@workspace/db";

// === טבלת Audit Log מרכזית ===
export async function initAuditLogMaster() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS audit_log_master (
      id SERIAL PRIMARY KEY,
      user_id INTEGER DEFAULT 0,
      user_name VARCHAR(255) DEFAULT 'system',
      action VARCHAR(20) NOT NULL,
      entity VARCHAR(100) NOT NULL,
      entity_id VARCHAR(50),
      details JSONB DEFAULT '{}',
      ip_address VARCHAR(50),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_audit_master_entity ON audit_log_master(entity);
    CREATE INDEX IF NOT EXISTS idx_audit_master_action ON audit_log_master(action);
    CREATE INDEX IF NOT EXISTS idx_audit_master_user ON audit_log_master(user_id);
    CREATE INDEX IF NOT EXISTS idx_audit_master_created ON audit_log_master(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_audit_master_entity_id ON audit_log_master(entity_id);
  `);
}

// === טבלת Sessions ===
export async function initSessionsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_sessions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      session_token VARCHAR(512) UNIQUE NOT NULL,
      ip_address VARCHAR(50),
      user_agent TEXT,
      expires_at TIMESTAMPTZ NOT NULL,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      last_activity TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_token ON user_sessions(session_token);
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON user_sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_active ON user_sessions(is_active) WHERE is_active = true;
    CREATE INDEX IF NOT EXISTS idx_sessions_expires ON user_sessions(expires_at);
  `);
}

// === טבלת Error Log ===
export async function initErrorLogTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS error_log (
      id SERIAL PRIMARY KEY,
      error_code VARCHAR(50),
      error_message TEXT,
      stack_trace TEXT,
      request_path VARCHAR(500),
      request_method VARCHAR(10),
      request_body JSONB,
      user_id INTEGER,
      ip_address VARCHAR(50),
      resolved BOOLEAN DEFAULT false,
      resolved_by VARCHAR(255),
      resolved_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_error_log_code ON error_log(error_code);
    CREATE INDEX IF NOT EXISTS idx_error_log_created ON error_log(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_error_log_resolved ON error_log(resolved) WHERE resolved = false;
  `);
}

// === הוספת אינדקסים חסרים לכל הטבלאות הקיימות ===
export async function addMissingIndexes() {
  const indexCommands = [
    // CRM
    'CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status)',
    'CREATE INDEX IF NOT EXISTS idx_leads_agent ON leads(assigned_to)',
    'CREATE INDEX IF NOT EXISTS idx_leads_source ON leads(source)',
    'CREATE INDEX IF NOT EXISTS idx_leads_created ON leads(created_at DESC)',
    'CREATE INDEX IF NOT EXISTS idx_leads_score ON leads(lead_score DESC)',
    'CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name)',
    'CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone)',
    'CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email)',
    'CREATE INDEX IF NOT EXISTS idx_customers_type ON customers(customer_type)',
    'CREATE INDEX IF NOT EXISTS idx_deals_status ON deals(status)',
    'CREATE INDEX IF NOT EXISTS idx_deals_agent ON deals(owner_id)',
    'CREATE INDEX IF NOT EXISTS idx_deals_amount ON deals(amount DESC)',
    // Finance
    'CREATE INDEX IF NOT EXISTS idx_invoices_customer ON invoices(customer_id)',
    'CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status)',
    'CREATE INDEX IF NOT EXISTS idx_invoices_date ON invoices(invoice_date DESC)',
    'CREATE INDEX IF NOT EXISTS idx_invoices_due_date ON invoices(due_date)',
    'CREATE INDEX IF NOT EXISTS idx_payments_invoice ON payments(invoice_id)',
    'CREATE INDEX IF NOT EXISTS idx_payments_date ON payments(payment_date DESC)',
    'CREATE INDEX IF NOT EXISTS idx_journal_entries_date ON journal_entries(entry_date DESC)',
    'CREATE INDEX IF NOT EXISTS idx_journal_entries_account ON journal_entries(account_id)',
    // Inventory
    'CREATE INDEX IF NOT EXISTS idx_raw_materials_category ON raw_materials(category)',
    'CREATE INDEX IF NOT EXISTS idx_raw_materials_supplier ON raw_materials(supplier_id)',
    'CREATE INDEX IF NOT EXISTS idx_inventory_items_code ON inventory_items(item_code)',
    'CREATE INDEX IF NOT EXISTS idx_inventory_items_category ON inventory_items(category)',
    'CREATE INDEX IF NOT EXISTS idx_stock_movements_item ON stock_movements(item_id)',
    'CREATE INDEX IF NOT EXISTS idx_stock_movements_date ON stock_movements(movement_date DESC)',
    // HR
    'CREATE INDEX IF NOT EXISTS idx_employees_department ON employees(department)',
    'CREATE INDEX IF NOT EXISTS idx_employees_status ON employees(status)',
    'CREATE INDEX IF NOT EXISTS idx_employees_manager ON employees(manager_id)',
    'CREATE INDEX IF NOT EXISTS idx_attendance_employee ON attendance_records(employee_id)',
    'CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance_records(work_date)',
    'CREATE INDEX IF NOT EXISTS idx_payslips_employee ON payslips(employee_id)',
    'CREATE INDEX IF NOT EXISTS idx_payslips_period ON payslips(payroll_run_id)',
    // Production
    'CREATE INDEX IF NOT EXISTS idx_work_orders_status ON work_orders(status)',
    'CREATE INDEX IF NOT EXISTS idx_work_orders_product ON work_orders(product_id)',
    'CREATE INDEX IF NOT EXISTS idx_work_orders_date ON work_orders(planned_start DESC)',
    'CREATE INDEX IF NOT EXISTS idx_bom_components_bom ON bom_components(bom_id)',
    'CREATE INDEX IF NOT EXISTS idx_bom_components_material ON bom_components(raw_material_id)',
    // Projects
    'CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status)',
    'CREATE INDEX IF NOT EXISTS idx_projects_customer ON projects(customer_id)',
    'CREATE INDEX IF NOT EXISTS idx_projects_manager ON projects(project_manager_id)',
    'CREATE INDEX IF NOT EXISTS idx_project_tasks_project ON project_tasks(project_id)',
    'CREATE INDEX IF NOT EXISTS idx_project_tasks_assignee ON project_tasks(assigned_to)',
    // Supply Chain
    'CREATE INDEX IF NOT EXISTS idx_purchase_orders_supplier ON purchase_orders(supplier_id)',
    'CREATE INDEX IF NOT EXISTS idx_purchase_orders_status ON purchase_orders(status)',
    'CREATE INDEX IF NOT EXISTS idx_purchase_orders_date ON purchase_orders(order_date DESC)',
    // Quotes
    'CREATE INDEX IF NOT EXISTS idx_quotes_customer ON quotes(customer_id)',
    'CREATE INDEX IF NOT EXISTS idx_quotes_status ON quotes(status)',
    'CREATE INDEX IF NOT EXISTS idx_quotes_agent ON quotes(agent_id)',
    // Service
    'CREATE INDEX IF NOT EXISTS idx_service_tickets_status ON service_tickets(status)',
    'CREATE INDEX IF NOT EXISTS idx_service_tickets_customer ON service_tickets(customer_id)',
    'CREATE INDEX IF NOT EXISTS idx_service_tickets_priority ON service_tickets(priority)',
    'CREATE INDEX IF NOT EXISTS idx_service_tickets_assigned ON service_tickets(assigned_to_id)',
    // WhatsApp
    'CREATE INDEX IF NOT EXISTS idx_wa_conversations_phone ON whatsapp_conversations(phone_number)',
    'CREATE INDEX IF NOT EXISTS idx_wa_conversations_status ON whatsapp_conversations(status)',
    'CREATE INDEX IF NOT EXISTS idx_wa_messages_conversation ON whatsapp_messages(conversation_id)',
    'CREATE INDEX IF NOT EXISTS idx_wa_messages_date ON whatsapp_messages(created_at DESC)',
    // Notifications
    'CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id)',
    'CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(is_read) WHERE is_read = false',
    'CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(type)',
    // Contracts
    'CREATE INDEX IF NOT EXISTS idx_contracts_customer ON digital_contracts(customer_id)',
    'CREATE INDEX IF NOT EXISTS idx_contracts_status ON digital_contracts(status)',
    // Suppliers
    'CREATE INDEX IF NOT EXISTS idx_suppliers_category ON suppliers(category)',
    'CREATE INDEX IF NOT EXISTS idx_suppliers_status ON suppliers(status)',
  ];

  let success = 0;
  let skipped = 0;
  for (const cmd of indexCommands) {
    try {
      await pool.query(cmd);
      success++;
    } catch (err) {
      skipped++; // Table might not exist yet - that is OK
    }
  }
  return { success, skipped, total: indexCommands.length };
}

// === אתחול כל התשתית ===
export async function initProductionInfrastructure() {
  console.log('[DB HARDENING] Starting production infrastructure init...');

  await initAuditLogMaster();
  console.log('[DB HARDENING] ✅ Audit log master table ready');

  await initSessionsTable();
  console.log('[DB HARDENING] ✅ Sessions table ready');

  await initErrorLogTable();
  console.log('[DB HARDENING] ✅ Error log table ready');

  const indexResult = await addMissingIndexes();
  console.log('[DB HARDENING] ✅ Indexes: ' + indexResult.success + ' created, ' + indexResult.skipped + ' skipped');

  return {
    auditLog: true,
    sessions: true,
    errorLog: true,
    indexes: indexResult
  };
}

export default {
  initAuditLogMaster,
  initSessionsTable,
  initErrorLogTable,
  addMissingIndexes,
  initProductionInfrastructure
};
