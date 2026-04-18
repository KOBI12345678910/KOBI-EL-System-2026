import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { withRetry } from "@workspace/db";
import { logger } from "./logger";

async function execWithRetry(rawSql: string, label: string): Promise<void> {
  await withRetry(() => db.execute(sql.raw(rawSql)), {
    maxAttempts: 3,
    baseDelayMs: 500,
    label: `startup_migration:${label}`,
  });
}

async function ensureTable(tableName: string, createSql: string): Promise<void> {
  try {
    await withRetry(
      () => db.execute(sql.raw(`SELECT 1 FROM ${tableName} LIMIT 1`)),
      { maxAttempts: 3, baseDelayMs: 500, label: `check_table:${tableName}` }
    );
  } catch {
    await withRetry(
      () => db.execute(sql.raw(createSql)),
      { maxAttempts: 3, baseDelayMs: 500, label: `create_table:${tableName}` }
    );
    logger.info("startup_migration_table_created", { table: tableName });
  }
}

async function execCatch(rawSql: string): Promise<void> {
  try {
    await withRetry(() => db.execute(sql.raw(rawSql)), {
      maxAttempts: 3,
      baseDelayMs: 500,
      label: "startup_migration_alter",
    });
  } catch (e: any) {
    logger.warn("startup_migration_alter_skipped", { error: e.message });
  }
}

export async function runStartupMigrations(): Promise<void> {
  logger.info("startup_migrations_begin");

  await ensureTable("general_ledger", `CREATE TABLE IF NOT EXISTS general_ledger (
    id SERIAL PRIMARY KEY,
    entry_number TEXT NOT NULL,
    entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
    account_number TEXT NOT NULL,
    account_name TEXT NOT NULL,
    account_type TEXT,
    description TEXT,
    reference TEXT,
    source_document TEXT,
    source_type TEXT,
    debit_amount NUMERIC(15,2) DEFAULT 0,
    credit_amount NUMERIC(15,2) DEFAULT 0,
    balance NUMERIC(15,2) DEFAULT 0,
    running_balance NUMERIC(15,2) DEFAULT 0,
    currency TEXT DEFAULT 'ILS',
    exchange_rate NUMERIC(12,6) DEFAULT 1,
    amount_ils NUMERIC(15,2) DEFAULT 0,
    fiscal_year INTEGER,
    fiscal_period INTEGER,
    cost_center TEXT,
    department TEXT,
    project_name TEXT,
    journal_entry_id INTEGER,
    status TEXT DEFAULT 'posted',
    posted_by INTEGER,
    posted_by_name TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await ensureTable("journal_transactions", `CREATE TABLE IF NOT EXISTS journal_transactions (
    id SERIAL PRIMARY KEY,
    transaction_number TEXT NOT NULL,
    transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
    account_number TEXT,
    account_name TEXT,
    transaction_type TEXT DEFAULT 'debit',
    debit_amount NUMERIC(15,2) DEFAULT 0,
    credit_amount NUMERIC(15,2) DEFAULT 0,
    description TEXT,
    reference TEXT,
    journal_entry_ref TEXT,
    fiscal_year INTEGER,
    fiscal_period INTEGER,
    status TEXT DEFAULT 'posted',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await ensureTable("customer_refunds", `CREATE TABLE IF NOT EXISTS customer_refunds (
    id SERIAL PRIMARY KEY,
    refund_number VARCHAR(50) UNIQUE,
    refund_date DATE DEFAULT CURRENT_DATE,
    customer_name VARCHAR(255),
    customer_tax_id VARCHAR(50),
    original_invoice_number VARCHAR(50),
    invoice_number VARCHAR(50),
    reason TEXT,
    reason_description TEXT,
    amount NUMERIC(12,2) DEFAULT 0,
    vat_rate NUMERIC(5,2) DEFAULT 18,
    vat_amount NUMERIC(12,2) DEFAULT 0,
    subtotal NUMERIC(12,2) DEFAULT 0,
    total_amount NUMERIC(12,2) DEFAULT 0,
    refund_method VARCHAR(50),
    payment_method VARCHAR(50),
    status VARCHAR(30) DEFAULT 'pending',
    currency TEXT DEFAULT 'ILS',
    notes TEXT,
    created_by INTEGER,
    created_by_name VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  )`);

  await ensureTable("customer_payments", `CREATE TABLE IF NOT EXISTS customer_payments (
    id SERIAL PRIMARY KEY,
    payment_number VARCHAR(50) UNIQUE,
    payment_date DATE DEFAULT CURRENT_DATE,
    customer_name VARCHAR(255),
    customer_tax_id VARCHAR(50),
    invoice_number VARCHAR(50),
    amount NUMERIC(12,2) DEFAULT 0,
    payment_method VARCHAR(50) DEFAULT 'bank_transfer',
    reference_number VARCHAR(100),
    bank_name VARCHAR(100),
    check_number VARCHAR(50),
    currency TEXT DEFAULT 'ILS',
    status VARCHAR(30) DEFAULT 'completed',
    notes TEXT,
    created_by INTEGER,
    created_by_name VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  )`);

  await ensureTable("supplier_invoices", `CREATE TABLE IF NOT EXISTS supplier_invoices (
    id SERIAL PRIMARY KEY,
    invoice_number VARCHAR(50) UNIQUE,
    invoice_type VARCHAR(30) DEFAULT 'tax_invoice',
    invoice_date DATE DEFAULT CURRENT_DATE,
    due_date DATE,
    supplier_name VARCHAR(255),
    supplier_tax_id VARCHAR(50),
    status VARCHAR(30) DEFAULT 'draft',
    currency VARCHAR(10) DEFAULT 'ILS',
    subtotal NUMERIC(12,2) DEFAULT 0,
    discount_amount NUMERIC(12,2) DEFAULT 0,
    before_vat NUMERIC(12,2) DEFAULT 0,
    vat_rate NUMERIC(5,2) DEFAULT 18,
    vat_amount NUMERIC(12,2) DEFAULT 0,
    total_amount NUMERIC(12,2) DEFAULT 0,
    amount_paid NUMERIC(12,2) DEFAULT 0,
    balance_due NUMERIC(12,2) DEFAULT 0,
    payment_terms VARCHAR(30) DEFAULT 'net_30',
    payment_method VARCHAR(50),
    po_number VARCHAR(100),
    item_description TEXT,
    notes TEXT,
    created_by INTEGER,
    created_by_name VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  )`);

  await ensureTable("supplier_credit_notes", `CREATE TABLE IF NOT EXISTS supplier_credit_notes (
    id SERIAL PRIMARY KEY,
    credit_number VARCHAR(50) UNIQUE,
    credit_date DATE DEFAULT CURRENT_DATE,
    supplier_name VARCHAR(255),
    supplier_tax_id VARCHAR(50),
    invoice_number VARCHAR(50),
    original_invoice_number VARCHAR(50),
    reason TEXT,
    reason_description TEXT,
    amount NUMERIC(12,2) DEFAULT 0,
    vat_rate NUMERIC(5,2) DEFAULT 18,
    vat_amount NUMERIC(12,2) DEFAULT 0,
    subtotal NUMERIC(12,2) DEFAULT 0,
    total_amount NUMERIC(12,2) DEFAULT 0,
    status VARCHAR(30) DEFAULT 'draft',
    currency TEXT DEFAULT 'ILS',
    notes TEXT,
    created_by INTEGER,
    created_by_name VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  )`);

  await ensureTable("supplier_payments", `CREATE TABLE IF NOT EXISTS supplier_payments (
    id SERIAL PRIMARY KEY,
    payment_number VARCHAR(50) UNIQUE,
    payment_date DATE DEFAULT CURRENT_DATE,
    supplier_name VARCHAR(255),
    supplier_tax_id VARCHAR(50),
    invoice_number VARCHAR(50),
    amount NUMERIC(12,2) DEFAULT 0,
    payment_method VARCHAR(50) DEFAULT 'bank_transfer',
    reference_number VARCHAR(100),
    bank_name VARCHAR(100),
    check_number VARCHAR(50),
    currency TEXT DEFAULT 'ILS',
    status VARCHAR(30) DEFAULT 'completed',
    notes TEXT,
    created_by INTEGER,
    created_by_name VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  )`);

  await ensureTable("ai_document_history", `CREATE TABLE IF NOT EXISTS ai_document_history (
    id SERIAL PRIMARY KEY,
    file_name TEXT NOT NULL,
    file_url TEXT,
    document_type TEXT,
    status TEXT DEFAULT 'pending',
    extracted_data JSONB,
    distribution_log JSONB,
    error_message TEXT,
    created_by INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await ensureTable("competitors", `CREATE TABLE IF NOT EXISTS competitors (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    domain TEXT,
    market_share NUMERIC DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    swot_strengths TEXT,
    swot_weaknesses TEXT,
    swot_opportunities TEXT,
    swot_threats TEXT,
    notes TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
  )`);

  await ensureTable("competitor_prices", `CREATE TABLE IF NOT EXISTS competitor_prices (
    id SERIAL PRIMARY KEY,
    competitor_id INTEGER NOT NULL,
    product_category TEXT NOT NULL,
    product_name TEXT,
    our_price NUMERIC DEFAULT 0,
    competitor_price NUMERIC DEFAULT 0,
    last_updated TEXT,
    notes TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
  )`);

  await ensureTable("ba_currency_exposures", `CREATE TABLE IF NOT EXISTS ba_currency_exposures (
    id SERIAL PRIMARY KEY,
    currency_pair TEXT NOT NULL,
    exposure_amount NUMERIC DEFAULT 0,
    expiry_date TEXT,
    hedging_type TEXT DEFAULT 'none',
    hedging_cost_percent NUMERIC DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
  )`);

  await ensureTable("commodity_risks", `CREATE TABLE IF NOT EXISTS commodity_risks (
    id SERIAL PRIMARY KEY,
    material_name TEXT NOT NULL,
    quantity NUMERIC DEFAULT 0,
    unit TEXT DEFAULT 'kg',
    current_price NUMERIC DEFAULT 0,
    floor_price NUMERIC,
    ceiling_price NUMERIC,
    hedging_recommendation TEXT,
    notes TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
  )`);

  await execCatch(`ALTER TABLE project_analyses ADD COLUMN IF NOT EXISTS source_type TEXT`);
  await execCatch(`ALTER TABLE project_analyses ADD COLUMN IF NOT EXISTS source_id TEXT`);

  await ensureTable("sla_rules", `CREATE TABLE IF NOT EXISTS sla_rules (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    ticket_type TEXT NOT NULL DEFAULT 'תמיכה טכנית',
    priority TEXT NOT NULL DEFAULT 'medium',
    first_response_hours NUMERIC NOT NULL DEFAULT 4,
    resolution_hours NUMERIC NOT NULL DEFAULT 24,
    escalation_hours NUMERIC NOT NULL DEFAULT 8,
    assigned_team TEXT NOT NULL DEFAULT 'תמיכה רגילה',
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);

  await ensureTable("sla_breaches", `CREATE TABLE IF NOT EXISTS sla_breaches (
    id SERIAL PRIMARY KEY,
    ticket TEXT NOT NULL,
    customer TEXT NOT NULL,
    breach_type TEXT NOT NULL DEFAULT 'resolution',
    priority TEXT NOT NULL DEFAULT 'medium',
    assigned_to TEXT NOT NULL DEFAULT '',
    hours_overdue NUMERIC NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'open',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);

  await ensureTable("sla_alert_rules", `CREATE TABLE IF NOT EXISTS sla_alert_rules (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    condition TEXT NOT NULL,
    channels TEXT[] NOT NULL DEFAULT '{}',
    recipients TEXT[] NOT NULL DEFAULT '{}',
    severity TEXT NOT NULL DEFAULT 'medium',
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);

  await ensureTable("sla_alert_events", `CREATE TABLE IF NOT EXISTS sla_alert_events (
    id SERIAL PRIMARY KEY,
    rule_id INTEGER,
    rule_name TEXT NOT NULL,
    ticket TEXT NOT NULL DEFAULT '',
    customer TEXT NOT NULL DEFAULT '',
    message TEXT NOT NULL,
    channels TEXT[] NOT NULL DEFAULT '{}',
    severity TEXT NOT NULL DEFAULT 'medium',
    acknowledged BOOLEAN NOT NULL DEFAULT FALSE,
    sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);

  await ensureTable("routing_rules", `CREATE TABLE IF NOT EXISTS routing_rules (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    strategy TEXT NOT NULL DEFAULT 'round_robin',
    lead_type TEXT NOT NULL DEFAULT 'ליד רגיל',
    conditions TEXT[] NOT NULL DEFAULT '{}',
    agents TEXT[] NOT NULL DEFAULT '{}',
    active BOOLEAN NOT NULL DEFAULT TRUE,
    routed INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);

  await ensureTable("routing_log", `CREATE TABLE IF NOT EXISTS routing_log (
    id SERIAL PRIMARY KEY,
    lead_name TEXT NOT NULL,
    company TEXT NOT NULL DEFAULT '',
    source TEXT NOT NULL DEFAULT '',
    assigned_to TEXT NOT NULL,
    rule_name TEXT NOT NULL,
    reason TEXT NOT NULL DEFAULT '',
    priority TEXT NOT NULL DEFAULT 'medium',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);

  await ensureTable("crm_automations", `CREATE TABLE IF NOT EXISTS crm_automations (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    trigger_event TEXT NOT NULL,
    actions TEXT[] NOT NULL DEFAULT '{}',
    category TEXT NOT NULL DEFAULT 'לידים',
    active BOOLEAN NOT NULL DEFAULT TRUE,
    run_count INTEGER NOT NULL DEFAULT 0,
    last_run TIMESTAMPTZ,
    is_template BOOLEAN NOT NULL DEFAULT FALSE,
    tags TEXT[] NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);

  await ensureTable("crm_automation_history", `CREATE TABLE IF NOT EXISTS crm_automation_history (
    id SERIAL PRIMARY KEY,
    automation_id INTEGER,
    automation_name TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT '',
    triggered_by TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'success',
    actions_completed INTEGER NOT NULL DEFAULT 0,
    actions_total INTEGER NOT NULL DEFAULT 0,
    duration_seconds NUMERIC NOT NULL DEFAULT 0,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);

  await execCatch(`ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS whatsapp TEXT`);
  await execCatch(`ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS phone2 TEXT`);
  await execCatch(`ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS region TEXT`);
  await execCatch(`ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS zip TEXT`);
  await execCatch(`ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS country TEXT DEFAULT 'ישראל'`);
  await execCatch(`ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS contact_preference TEXT DEFAULT 'email'`);
  await execCatch(`ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS website TEXT`);
  await execCatch(`ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS industry TEXT`);
  await execCatch(`ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS company_size TEXT`);
  await execCatch(`ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS annual_revenue NUMERIC DEFAULT 0`);
  await execCatch(`ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS employees_count INTEGER DEFAULT 0`);
  await execCatch(`ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS competitors TEXT`);
  await execCatch(`ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS pain_points TEXT`);
  await execCatch(`ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS referral_name TEXT`);
  await execCatch(`ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS campaign TEXT`);
  await execCatch(`ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS utm_source TEXT`);
  await execCatch(`ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS utm_medium TEXT`);
  await execCatch(`ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS utm_campaign TEXT`);
  await execCatch(`ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS lead_score INTEGER DEFAULT 50`);
  await execCatch(`ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS lead_temperature TEXT DEFAULT 'warm'`);
  await execCatch(`ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS probability INTEGER DEFAULT 50`);
  await execCatch(`ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS expected_close_date DATE`);
  await execCatch(`ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS budget NUMERIC DEFAULT 0`);
  await execCatch(`ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS timeline TEXT`);
  await execCatch(`ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS linkedin TEXT`);
  await execCatch(`ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS facebook TEXT`);
  await execCatch(`ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS instagram TEXT`);
  await execCatch(`ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS twitter TEXT`);
  await execCatch(`ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS contacts_count INTEGER DEFAULT 0`);
  await execCatch(`ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS preferred_language TEXT DEFAULT 'he'`);
  await execCatch(`ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS meeting_type TEXT DEFAULT 'zoom'`);
  await execCatch(`ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS first_contact_date DATE`);
  await execCatch(`ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS meeting_date DATE`);
  await execCatch(`ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS proposal_date DATE`);
  await execCatch(`ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS decision_date DATE`);
  await execCatch(`ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS interaction_count INTEGER DEFAULT 0`);
  await execCatch(`ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS email_open_rate NUMERIC DEFAULT 0`);
  await execCatch(`ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS custom_field_1 TEXT`);
  await execCatch(`ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS custom_field_2 TEXT`);
  await execCatch(`ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS custom_field_3 TEXT`);
  await execCatch(`ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS custom_field_4 TEXT`);
  await execCatch(`ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS custom_field_5 TEXT`);

  await ensureTable("fixed_assets", `CREATE TABLE IF NOT EXISTS fixed_assets (
    id SERIAL PRIMARY KEY,
    asset_number TEXT NOT NULL,
    asset_name TEXT NOT NULL,
    asset_type TEXT DEFAULT 'equipment',
    category TEXT,
    description TEXT,
    serial_number TEXT,
    manufacturer TEXT,
    model TEXT,
    location TEXT,
    department TEXT,
    assigned_to TEXT,
    purchase_date DATE,
    purchase_price NUMERIC(15,2) DEFAULT 0,
    currency TEXT DEFAULT 'ILS',
    supplier TEXT,
    invoice_number TEXT,
    useful_life_years INTEGER DEFAULT 5,
    depreciation_method TEXT DEFAULT 'straight_line',
    depreciation_rate NUMERIC(5,2),
    accumulated_depreciation NUMERIC(15,2) DEFAULT 0,
    current_value NUMERIC(15,2) DEFAULT 0,
    residual_value NUMERIC(15,2) DEFAULT 0,
    annual_depreciation NUMERIC(15,2) DEFAULT 0,
    last_depreciation_date DATE,
    warranty_expiry DATE,
    insurance_policy TEXT,
    insurance_expiry DATE,
    maintenance_schedule TEXT,
    last_maintenance_date DATE,
    next_maintenance_date DATE,
    status TEXT DEFAULT 'active',
    disposal_date DATE,
    disposal_price NUMERIC(15,2),
    disposal_method TEXT,
    gl_account TEXT,
    cost_center TEXT,
    barcode TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await ensureTable("journal_reports", `CREATE TABLE IF NOT EXISTS journal_reports (
    id SERIAL PRIMARY KEY,
    report_number TEXT NOT NULL,
    report_name TEXT,
    period_start DATE,
    period_end DATE,
    fiscal_year INTEGER,
    fiscal_period INTEGER,
    total_debit NUMERIC(15,2) DEFAULT 0,
    total_credit NUMERIC(15,2) DEFAULT 0,
    net_balance NUMERIC(15,2) DEFAULT 0,
    entry_count INTEGER DEFAULT 0,
    status TEXT DEFAULT 'draft',
    generated_by TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await ensureTable("audit_controls", `CREATE TABLE IF NOT EXISTS audit_controls (
    id SERIAL PRIMARY KEY,
    control_number TEXT NOT NULL,
    control_date DATE NOT NULL DEFAULT CURRENT_DATE,
    control_type TEXT DEFAULT 'balance_check',
    account_number TEXT,
    account_name TEXT,
    expected_balance NUMERIC(15,2) DEFAULT 0,
    actual_balance NUMERIC(15,2) DEFAULT 0,
    variance NUMERIC(15,2) DEFAULT 0,
    status TEXT DEFAULT 'open',
    severity TEXT DEFAULT 'low',
    assigned_to TEXT,
    resolved_date DATE,
    resolution_notes TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await ensureTable("working_files", `CREATE TABLE IF NOT EXISTS working_files (
    id SERIAL PRIMARY KEY,
    file_number TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_type TEXT DEFAULT 'working_paper',
    fiscal_year INTEGER,
    fiscal_period INTEGER,
    accountant TEXT,
    reviewer TEXT,
    status TEXT DEFAULT 'in_progress',
    priority TEXT DEFAULT 'normal',
    due_date DATE,
    completed_date DATE,
    description TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await ensureTable("annual_reports", `CREATE TABLE IF NOT EXISTS annual_reports (
    id SERIAL PRIMARY KEY,
    report_number TEXT NOT NULL,
    fiscal_year INTEGER NOT NULL,
    total_assets NUMERIC(15,2) DEFAULT 0,
    total_liabilities NUMERIC(15,2) DEFAULT 0,
    total_equity NUMERIC(15,2) DEFAULT 0,
    total_revenue NUMERIC(15,2) DEFAULT 0,
    total_expenses NUMERIC(15,2) DEFAULT 0,
    net_income NUMERIC(15,2) DEFAULT 0,
    operating_cash_flow NUMERIC(15,2) DEFAULT 0,
    status TEXT DEFAULT 'draft',
    approved_by TEXT,
    approved_date DATE,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await ensureTable("accounting_inventory", `CREATE TABLE IF NOT EXISTS accounting_inventory (
    id SERIAL PRIMARY KEY,
    item_number TEXT NOT NULL,
    item_name TEXT NOT NULL,
    category TEXT,
    quantity NUMERIC(15,3) DEFAULT 0,
    unit TEXT DEFAULT 'יחידה',
    cost_per_unit NUMERIC(15,2) DEFAULT 0,
    market_value_per_unit NUMERIC(15,2) DEFAULT 0,
    total_cost NUMERIC(15,2) DEFAULT 0,
    total_market_value NUMERIC(15,2) DEFAULT 0,
    provision_amount NUMERIC(15,2) DEFAULT 0,
    valuation_method TEXT DEFAULT 'fifo',
    last_count_date DATE,
    status TEXT DEFAULT 'active',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await ensureTable("depreciation_schedules", `CREATE TABLE IF NOT EXISTS depreciation_schedules (
    id SERIAL PRIMARY KEY,
    schedule_number TEXT NOT NULL,
    asset_name TEXT NOT NULL,
    asset_number TEXT,
    purchase_date DATE,
    purchase_price NUMERIC(15,2) DEFAULT 0,
    residual_value NUMERIC(15,2) DEFAULT 0,
    useful_life_years INTEGER DEFAULT 5,
    depreciation_method TEXT DEFAULT 'straight_line',
    annual_depreciation NUMERIC(15,2) DEFAULT 0,
    accumulated_depreciation NUMERIC(15,2) DEFAULT 0,
    current_book_value NUMERIC(15,2) DEFAULT 0,
    fiscal_year INTEGER,
    period_depreciation NUMERIC(15,2) DEFAULT 0,
    status TEXT DEFAULT 'active',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await ensureTable("loan_analyses", `CREATE TABLE IF NOT EXISTS loan_analyses (
    id SERIAL PRIMARY KEY,
    loan_number TEXT NOT NULL,
    loan_name TEXT,
    lender TEXT,
    borrower TEXT,
    principal_amount NUMERIC(15,2) DEFAULT 0,
    interest_rate NUMERIC(8,4) DEFAULT 0,
    loan_date DATE,
    maturity_date DATE,
    payment_frequency TEXT DEFAULT 'monthly',
    monthly_payment NUMERIC(15,2) DEFAULT 0,
    total_payments NUMERIC(15,2) DEFAULT 0,
    total_interest NUMERIC(15,2) DEFAULT 0,
    outstanding_balance NUMERIC(15,2) DEFAULT 0,
    payments_made INTEGER DEFAULT 0,
    loan_type TEXT DEFAULT 'bank_loan',
    status TEXT DEFAULT 'active',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await ensureTable("adjusting_entries", `CREATE TABLE IF NOT EXISTS adjusting_entries (
    id SERIAL PRIMARY KEY,
    entry_number TEXT NOT NULL,
    entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
    entry_type TEXT DEFAULT 'accrual',
    account_number TEXT,
    account_name TEXT,
    debit_amount NUMERIC(15,2) DEFAULT 0,
    credit_amount NUMERIC(15,2) DEFAULT 0,
    description TEXT,
    period_start DATE,
    period_end DATE,
    fiscal_year INTEGER,
    fiscal_period INTEGER,
    status TEXT DEFAULT 'draft',
    approved_by TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await ensureTable("deferred_revenue", `CREATE TABLE IF NOT EXISTS deferred_revenue (
    id SERIAL PRIMARY KEY,
    record_number TEXT NOT NULL,
    customer_name TEXT,
    description TEXT,
    total_amount NUMERIC(15,2) DEFAULT 0,
    recognized_amount NUMERIC(15,2) DEFAULT 0,
    remaining_amount NUMERIC(15,2) DEFAULT 0,
    recognition_start DATE,
    recognition_end DATE,
    recognition_method TEXT DEFAULT 'straight_line',
    monthly_recognition NUMERIC(15,2) DEFAULT 0,
    status TEXT DEFAULT 'active',
    gl_account TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await ensureTable("deferred_expenses", `CREATE TABLE IF NOT EXISTS deferred_expenses (
    id SERIAL PRIMARY KEY,
    record_number TEXT NOT NULL,
    vendor_name TEXT,
    description TEXT,
    total_amount NUMERIC(15,2) DEFAULT 0,
    recognized_amount NUMERIC(15,2) DEFAULT 0,
    remaining_amount NUMERIC(15,2) DEFAULT 0,
    recognition_start DATE,
    recognition_end DATE,
    recognition_method TEXT DEFAULT 'straight_line',
    monthly_recognition NUMERIC(15,2) DEFAULT 0,
    status TEXT DEFAULT 'active',
    gl_account TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await ensureTable("finance_registrations", `CREATE TABLE IF NOT EXISTS finance_registrations (
    id SERIAL PRIMARY KEY,
    registration_number TEXT NOT NULL,
    registration_date DATE NOT NULL DEFAULT CURRENT_DATE,
    registration_type TEXT DEFAULT 'general',
    entity_type TEXT,
    entity_name TEXT,
    source TEXT,
    amount NUMERIC(15,2) DEFAULT 0,
    description TEXT,
    reference TEXT,
    status TEXT DEFAULT 'active',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await ensureTable("finance_change_tracking", `CREATE TABLE IF NOT EXISTS finance_change_tracking (
    id SERIAL PRIMARY KEY,
    change_date TIMESTAMPTZ DEFAULT NOW(),
    entity_type TEXT,
    entity_id INTEGER,
    entity_name TEXT,
    field_changed TEXT,
    old_value TEXT,
    new_value TEXT,
    changed_by TEXT,
    change_reason TEXT,
    ip_address TEXT,
    action TEXT DEFAULT 'update',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await ensureTable("sales_customers", `CREATE TABLE IF NOT EXISTS sales_customers (
    id SERIAL PRIMARY KEY,
    customer_number VARCHAR(30) UNIQUE,
    name VARCHAR(255) NOT NULL,
    customer_type VARCHAR(20) DEFAULT 'company',
    email VARCHAR(255),
    phone VARCHAR(50),
    address TEXT,
    billing_address TEXT,
    credit_limit NUMERIC(15,2) DEFAULT 0,
    payment_terms VARCHAR(50) DEFAULT 'שוטף 30',
    assigned_rep VARCHAR(255),
    status VARCHAR(20) DEFAULT 'active',
    tags TEXT,
    contact_person VARCHAR(255),
    tax_id VARCHAR(50),
    notes TEXT,
    total_revenue NUMERIC(15,2) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await ensureTable("sales_orders", `CREATE TABLE IF NOT EXISTS sales_orders (
    id SERIAL PRIMARY KEY,
    order_number VARCHAR(30) UNIQUE,
    customer_id INTEGER,
    customer_name VARCHAR(255),
    order_date DATE DEFAULT CURRENT_DATE,
    delivery_date DATE,
    status VARCHAR(20) DEFAULT 'draft',
    notes TEXT,
    subtotal NUMERIC(15,2) DEFAULT 0,
    discount_amount NUMERIC(15,2) DEFAULT 0,
    tax_amount NUMERIC(15,2) DEFAULT 0,
    total NUMERIC(15,2) DEFAULT 0,
    paid_amount NUMERIC(15,2) DEFAULT 0,
    payment_status VARCHAR(20) DEFAULT 'unpaid',
    created_by VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await ensureTable("sales_order_lines", `CREATE TABLE IF NOT EXISTS sales_order_lines (
    id SERIAL PRIMARY KEY,
    order_id INTEGER,
    product_name VARCHAR(255) NOT NULL,
    description TEXT,
    quantity NUMERIC(15,3) DEFAULT 1,
    unit_price NUMERIC(15,2) DEFAULT 0,
    discount_percent NUMERIC(5,2) DEFAULT 0,
    line_total NUMERIC(15,2) DEFAULT 0,
    sort_order INTEGER DEFAULT 0
  )`);

  await ensureTable("sales_quotations", `CREATE TABLE IF NOT EXISTS sales_quotations (
    id SERIAL PRIMARY KEY,
    quote_number VARCHAR(30) UNIQUE,
    customer_id INTEGER,
    customer_name VARCHAR(255),
    quote_date DATE DEFAULT CURRENT_DATE,
    valid_until DATE,
    status VARCHAR(20) DEFAULT 'draft',
    notes TEXT,
    subtotal NUMERIC(15,2) DEFAULT 0,
    tax_amount NUMERIC(15,2) DEFAULT 0,
    total NUMERIC(15,2) DEFAULT 0,
    converted_order_id INTEGER,
    created_by VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await ensureTable("sales_quotation_lines", `CREATE TABLE IF NOT EXISTS sales_quotation_lines (
    id SERIAL PRIMARY KEY,
    quotation_id INTEGER,
    product_name VARCHAR(255) NOT NULL,
    description TEXT,
    quantity NUMERIC(15,3) DEFAULT 1,
    unit_price NUMERIC(15,2) DEFAULT 0,
    discount_percent NUMERIC(5,2) DEFAULT 0,
    line_total NUMERIC(15,2) DEFAULT 0,
    sort_order INTEGER DEFAULT 0
  )`);

  await ensureTable("sales_invoices", `CREATE TABLE IF NOT EXISTS sales_invoices (
    id SERIAL PRIMARY KEY,
    invoice_number VARCHAR(30) UNIQUE,
    customer_id INTEGER,
    customer_name VARCHAR(255),
    sales_order_id INTEGER,
    invoice_date DATE DEFAULT CURRENT_DATE,
    due_date DATE,
    status VARCHAR(20) DEFAULT 'draft',
    subtotal NUMERIC(15,2) DEFAULT 0,
    tax_amount NUMERIC(15,2) DEFAULT 0,
    total NUMERIC(15,2) DEFAULT 0,
    amount_paid NUMERIC(15,2) DEFAULT 0,
    notes TEXT,
    created_by VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await ensureTable("sales_invoice_lines", `CREATE TABLE IF NOT EXISTS sales_invoice_lines (
    id SERIAL PRIMARY KEY,
    invoice_id INTEGER,
    product_name VARCHAR(255) NOT NULL,
    description TEXT,
    quantity NUMERIC(15,3) DEFAULT 1,
    unit_price NUMERIC(15,2) DEFAULT 0,
    discount_percent NUMERIC(5,2) DEFAULT 0,
    line_total NUMERIC(15,2) DEFAULT 0,
    sort_order INTEGER DEFAULT 0
  )`);

  await ensureTable("crm_opportunities", `CREATE TABLE IF NOT EXISTS crm_opportunities (
    id SERIAL PRIMARY KEY,
    opportunity_number VARCHAR(30) UNIQUE,
    name VARCHAR(255) NOT NULL,
    customer_id INTEGER,
    customer_name VARCHAR(255),
    contact_name VARCHAR(255),
    email VARCHAR(255),
    phone VARCHAR(50),
    stage VARCHAR(30) DEFAULT 'lead',
    value NUMERIC(15,2) DEFAULT 0,
    probability INTEGER DEFAULT 0,
    expected_close_date DATE,
    assigned_rep VARCHAR(255),
    source VARCHAR(100),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await ensureTable("support_tickets", `CREATE TABLE IF NOT EXISTS support_tickets (
    id SERIAL PRIMARY KEY,
    ticket_number VARCHAR(30) UNIQUE,
    customer_id INTEGER,
    customer_name VARCHAR(255),
    subject VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(100),
    priority VARCHAR(20) DEFAULT 'medium',
    status VARCHAR(20) DEFAULT 'open',
    assigned_to VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    resolved_at TIMESTAMPTZ,
    resolution_notes TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await ensureTable("sales_price_lists", `CREATE TABLE IF NOT EXISTS sales_price_lists (
    id SERIAL PRIMARY KEY,
    list_number VARCHAR(30) UNIQUE,
    name VARCHAR(255) NOT NULL,
    currency VARCHAR(10) DEFAULT 'ILS',
    valid_from DATE,
    valid_to DATE,
    customer_group VARCHAR(100),
    status VARCHAR(20) DEFAULT 'active',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await ensureTable("sales_price_list_items", `CREATE TABLE IF NOT EXISTS sales_price_list_items (
    id SERIAL PRIMARY KEY,
    price_list_id INTEGER,
    product_name VARCHAR(255) NOT NULL,
    sku VARCHAR(100),
    base_price NUMERIC(15,2) DEFAULT 0,
    discounted_price NUMERIC(15,2) DEFAULT 0,
    min_quantity INTEGER DEFAULT 1,
    sort_order INTEGER DEFAULT 0
  )`);

  await ensureTable("sales_cost_calculations", `CREATE TABLE IF NOT EXISTS sales_cost_calculations (
    id SERIAL PRIMARY KEY,
    calc_number VARCHAR(30) UNIQUE,
    name VARCHAR(255) NOT NULL,
    product_service VARCHAR(255),
    material_cost NUMERIC(15,2) DEFAULT 0,
    labor_cost NUMERIC(15,2) DEFAULT 0,
    overhead_cost NUMERIC(15,2) DEFAULT 0,
    margin_percent NUMERIC(5,2) DEFAULT 0,
    selling_price NUMERIC(15,2) DEFAULT 0,
    notes TEXT,
    created_by VARCHAR(255),
    calc_date DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await ensureTable("sales_collection_cases", `CREATE TABLE IF NOT EXISTS sales_collection_cases (
    id SERIAL PRIMARY KEY,
    case_number VARCHAR(30) UNIQUE,
    customer_id INTEGER,
    customer_name VARCHAR(255),
    invoice_refs TEXT,
    total_overdue NUMERIC(15,2) DEFAULT 0,
    days_overdue INTEGER DEFAULT 0,
    status VARCHAR(20) DEFAULT 'active',
    assigned_collector VARCHAR(255),
    last_contact_date DATE,
    notes TEXT,
    next_action_date DATE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await execCatch(`ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS bank_iban text`);
  await execCatch(`ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS bank_swift text`);
  await execCatch(`ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS quality_score numeric(3,1) DEFAULT 3.0`);
  await execCatch(`ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS delivery_score numeric(3,1) DEFAULT 3.0`);
  await execCatch(`ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS contract_expiry_date date`);
  await execCatch(`ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS certifications_json text`);
  await execCatch(`ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS annual_spend numeric(15,2)`);
  await execCatch(`ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS internal_notes text`);

  await execCatch(`ALTER TABLE notification_routing_rules ADD COLUMN IF NOT EXISTS channel_sms boolean NOT NULL DEFAULT false`);
  await execCatch(`ALTER TABLE notification_routing_rules ADD COLUMN IF NOT EXISTS channel_telegram boolean NOT NULL DEFAULT false`);
  await execCatch(`ALTER TABLE notification_routing_rules ADD COLUMN IF NOT EXISTS min_priority_sms text NOT NULL DEFAULT 'high'`);
  await execCatch(`ALTER TABLE notification_routing_rules ADD COLUMN IF NOT EXISTS min_priority_telegram text NOT NULL DEFAULT 'normal'`);
  logger.info("[Migrations] notification_routing_rules SMS/Telegram columns ensured");

  await execCatch(`ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_chat_id text`);
  logger.info("[Migrations] users.telegram_chat_id column ensured");

  await ensureTable("crm_custom_reports", `CREATE TABLE IF NOT EXISTS crm_custom_reports (
    id SERIAL PRIMARY KEY,
    report_number TEXT UNIQUE,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    data_source TEXT NOT NULL DEFAULT 'leads',
    report_type TEXT NOT NULL DEFAULT 'table',
    fields TEXT[] NOT NULL DEFAULT '{}',
    filters JSONB NOT NULL DEFAULT '{}',
    schedule TEXT NOT NULL DEFAULT 'manual',
    last_run TIMESTAMPTZ,
    row_count INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active',
    created_by TEXT NOT NULL DEFAULT 'admin',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);

  await ensureTable("crm_cohorts", `CREATE TABLE IF NOT EXISTS crm_cohorts (
    id SERIAL PRIMARY KEY,
    cohort_number TEXT UNIQUE,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    segment_criteria TEXT NOT NULL DEFAULT '',
    customer_count INTEGER NOT NULL DEFAULT 0,
    total_revenue NUMERIC(15,2) NOT NULL DEFAULT 0,
    retention_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
    growth_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
    avg_ltv NUMERIC(15,2) NOT NULL DEFAULT 0,
    avg_cac NUMERIC(15,2) NOT NULL DEFAULT 0,
    color TEXT NOT NULL DEFAULT 'blue',
    status TEXT NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);

  await ensureTable("crm_sync_devices", `CREATE TABLE IF NOT EXISTS crm_sync_devices (
    id SERIAL PRIMARY KEY,
    device_name TEXT NOT NULL,
    device_type TEXT NOT NULL DEFAULT 'desktop',
    os TEXT NOT NULL DEFAULT '',
    user_name TEXT NOT NULL DEFAULT '',
    last_sync TIMESTAMPTZ,
    sync_status TEXT NOT NULL DEFAULT 'synced',
    sync_frequency TEXT NOT NULL DEFAULT '30 seconds',
    data_size TEXT NOT NULL DEFAULT '0 MB',
    ip_address TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);

  await ensureTable("role_permissions", `CREATE TABLE IF NOT EXISTS role_permissions (
    id SERIAL PRIMARY KEY,
    role_id INTEGER NOT NULL REFERENCES platform_roles(id) ON DELETE CASCADE,
    entity_id INTEGER,
    module_id INTEGER,
    action TEXT NOT NULL,
    is_allowed BOOLEAN NOT NULL DEFAULT true,
    conditions JSONB DEFAULT '{}',
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
  )`);
  logger.info("[Migrations] role_permissions table ensured");

  await execCatch(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='employees_employee_number_unique') THEN ALTER TABLE employees ADD CONSTRAINT employees_employee_number_unique UNIQUE (employee_number); END IF; END $$`);

  await execCatch(`ALTER TABLE employees ALTER COLUMN created_at SET DEFAULT NOW()`);
  await execCatch(`ALTER TABLE employees ALTER COLUMN updated_at SET DEFAULT NOW()`);

  await execCatch(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='user_sessions_user_id_fk') THEN ALTER TABLE user_sessions ADD CONSTRAINT user_sessions_user_id_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE; END IF; END $$`);
  await execCatch(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='sales_order_items_order_id_fk') THEN ALTER TABLE sales_order_items ADD CONSTRAINT sales_order_items_order_id_fk FOREIGN KEY (order_id) REFERENCES sales_orders(id) ON DELETE CASCADE; END IF; END $$`);
  await execCatch(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='purchase_order_items_order_id_fk') THEN ALTER TABLE purchase_order_items ADD CONSTRAINT purchase_order_items_order_id_fk FOREIGN KEY (order_id) REFERENCES purchase_orders(id) ON DELETE CASCADE; END IF; END $$`);
  await execCatch(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='purchase_orders_supplier_id_fk') THEN ALTER TABLE purchase_orders ADD CONSTRAINT purchase_orders_supplier_id_fk FOREIGN KEY (supplier_id) REFERENCES suppliers(id); END IF; END $$`);
  await execCatch(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='supplier_evaluations_supplier_id_fk') THEN ALTER TABLE supplier_evaluations ADD CONSTRAINT supplier_evaluations_supplier_id_fk FOREIGN KEY (supplier_id) REFERENCES suppliers(id); END IF; END $$`);
  await execCatch(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='product_materials_product_id_fk') THEN ALTER TABLE product_materials ADD CONSTRAINT product_materials_product_id_fk FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE; END IF; END $$`);
  await execCatch(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='products_category_id_fk') THEN ALTER TABLE products ADD CONSTRAINT products_category_id_fk FOREIGN KEY (category_id) REFERENCES product_categories(id); END IF; END $$`);

  // Fabrication domain tables
  await execCatch(`CREATE TABLE IF NOT EXISTS fabrication_profiles (
    id SERIAL PRIMARY KEY, profile_number TEXT NOT NULL UNIQUE, profile_name TEXT NOT NULL,
    series TEXT, system_type TEXT DEFAULT 'aluminum', profile_type TEXT DEFAULT 'frame',
    material TEXT DEFAULT 'aluminum', alloy TEXT, temper TEXT,
    weight_per_meter NUMERIC, length_mm NUMERIC DEFAULT 6000, width_mm NUMERIC, height_mm NUMERIC,
    wall_thickness_mm NUMERIC, moment_of_inertia_x NUMERIC, moment_of_inertia_y NUMERIC,
    cross_section_area NUMERIC, thermal_break BOOLEAN DEFAULT false, thermal_break_width_mm NUMERIC,
    gasket_slots INTEGER DEFAULT 0, glazing_pocket_mm NUMERIC, max_span_mm NUMERIC,
    surface_treatment TEXT, default_finish TEXT DEFAULT 'anodized', default_color TEXT,
    compatible_systems TEXT, drawing_url TEXT, image_url TEXT,
    supplier_id INTEGER, supplier_part_number TEXT, cost_per_meter NUMERIC,
    current_stock_meters NUMERIC DEFAULT 0, minimum_stock_meters NUMERIC, reorder_point_meters NUMERIC,
    warehouse_location TEXT, si_standard TEXT, iso_standard TEXT,
    status TEXT NOT NULL DEFAULT 'active', notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW()
  )`);

  await execCatch(`CREATE TABLE IF NOT EXISTS fabrication_systems (
    id SERIAL PRIMARY KEY, system_number TEXT NOT NULL UNIQUE, system_name TEXT NOT NULL,
    system_type TEXT NOT NULL DEFAULT 'window', manufacturer TEXT, series TEXT,
    material TEXT DEFAULT 'aluminum', description TEXT,
    max_width_mm NUMERIC, max_height_mm NUMERIC, max_weight_kg NUMERIC,
    min_glass_thickness_mm NUMERIC, max_glass_thickness_mm NUMERIC,
    thermal_break BOOLEAN DEFAULT false, u_value_frame NUMERIC, u_value_system NUMERIC,
    acoustic_rating VARCHAR(30), fire_rating VARCHAR(30),
    wind_resistance_class VARCHAR(20), water_tightness_class VARCHAR(20),
    air_permeability_class VARCHAR(20), security_class VARCHAR(20),
    opening_types TEXT, profile_ids TEXT, default_hardware_set TEXT,
    default_seal_type TEXT, default_gasket_type TEXT, installation_method TEXT,
    certifications TEXT, drawing_url TEXT, catalog_url TEXT, image_url TEXT,
    cost_per_sqm NUMERIC, labor_hours_per_sqm NUMERIC,
    status TEXT NOT NULL DEFAULT 'active', notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW()
  )`);

  await execCatch(`CREATE TABLE IF NOT EXISTS glass_catalog (
    id SERIAL PRIMARY KEY, glass_code TEXT NOT NULL UNIQUE, glass_name TEXT NOT NULL,
    glass_type TEXT NOT NULL DEFAULT 'float', composition TEXT, thickness_mm NUMERIC NOT NULL,
    is_laminated BOOLEAN DEFAULT false, laminated_layers TEXT,
    is_insulated BOOLEAN DEFAULT false, insulated_config TEXT,
    spacer_width_mm NUMERIC, gas_fill TEXT,
    is_tempered BOOLEAN DEFAULT false, is_heat_strengthened BOOLEAN DEFAULT false,
    coating TEXT, coating_position TEXT, tint_color TEXT,
    u_value NUMERIC, shgc NUMERIC, light_transmission NUMERIC, sound_reduction NUMERIC,
    max_width_mm NUMERIC, max_height_mm NUMERIC, max_area_sqm NUMERIC,
    weight_per_sqm NUMERIC, breakage_pattern TEXT, safety_class TEXT, fire_rating TEXT,
    si_standard TEXT, iso_standard TEXT,
    supplier_id INTEGER, price_per_sqm NUMERIC, lead_time_days INTEGER,
    current_stock_sqm NUMERIC DEFAULT 0, minimum_stock_sqm NUMERIC, warehouse_location TEXT,
    status TEXT NOT NULL DEFAULT 'active', notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW()
  )`);

  await execCatch(`CREATE TABLE IF NOT EXISTS finishes (
    id SERIAL PRIMARY KEY, finish_code TEXT NOT NULL UNIQUE, finish_name TEXT NOT NULL,
    finish_type TEXT NOT NULL DEFAULT 'powder_coating', applicable_materials TEXT,
    thickness_microns NUMERIC, min_coats INTEGER DEFAULT 1,
    cure_temperature_c NUMERIC, cure_time_minutes INTEGER,
    durability_class TEXT, weather_resistance TEXT, corrosion_resistance TEXT,
    warranty_years INTEGER, qualicoat_class TEXT, qualideco_certified BOOLEAN DEFAULT false,
    supplier_id INTEGER, cost_per_sqm NUMERIC, lead_time_days INTEGER,
    status TEXT NOT NULL DEFAULT 'active', notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW()
  )`);

  await execCatch(`CREATE TABLE IF NOT EXISTS colors (
    id SERIAL PRIMARY KEY, color_code TEXT NOT NULL UNIQUE, color_name TEXT NOT NULL,
    color_name_he TEXT, color_system TEXT NOT NULL DEFAULT 'RAL', ral_number TEXT,
    hex_value TEXT, color_family TEXT,
    is_metallic BOOLEAN DEFAULT false, is_wood_grain BOOLEAN DEFAULT false,
    texture_type TEXT, applicable_finishes TEXT,
    surcharge_percent NUMERIC DEFAULT 0, popularity_rank INTEGER,
    image_url TEXT, status TEXT NOT NULL DEFAULT 'active', notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW()
  )`);

  await execCatch(`CREATE TABLE IF NOT EXISTS accessories_hardware (
    id SERIAL PRIMARY KEY, part_number TEXT NOT NULL UNIQUE, part_name TEXT NOT NULL,
    part_name_he TEXT, category TEXT NOT NULL DEFAULT 'handle', sub_category TEXT,
    material TEXT, finish TEXT, color TEXT, brand TEXT, model TEXT,
    compatible_systems TEXT, compatible_profiles TEXT,
    dimensions_mm TEXT, weight_grams NUMERIC, load_capacity_kg NUMERIC,
    operation_cycles INTEGER, security_level TEXT,
    fire_rated BOOLEAN DEFAULT false, anti_corrosion BOOLEAN DEFAULT false,
    child_safe BOOLEAN DEFAULT false,
    supplier_id INTEGER, cost_per_unit NUMERIC, selling_price NUMERIC,
    current_stock NUMERIC DEFAULT 0, minimum_stock NUMERIC, reorder_point NUMERIC,
    warehouse_location TEXT, image_url TEXT, drawing_url TEXT,
    status TEXT NOT NULL DEFAULT 'active', notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW()
  )`);

  await execCatch(`CREATE TABLE IF NOT EXISTS unit_conversions (
    id SERIAL PRIMARY KEY, from_unit TEXT NOT NULL, to_unit TEXT NOT NULL,
    conversion_factor NUMERIC NOT NULL, material_category TEXT, description TEXT,
    is_active BOOLEAN DEFAULT true, created_at TIMESTAMP DEFAULT NOW()
  )`);

  await execCatch(`CREATE TABLE IF NOT EXISTS cutting_lists (
    id SERIAL PRIMARY KEY, cutting_number TEXT NOT NULL UNIQUE,
    project_id INTEGER, work_order_id INTEGER,
    product_name TEXT, profile_id INTEGER, profile_number TEXT, profile_name TEXT,
    material TEXT DEFAULT 'aluminum', raw_length_mm NUMERIC DEFAULT 6000,
    cut_length_mm NUMERIC NOT NULL, angle_degrees_1 NUMERIC DEFAULT 90, angle_degrees_2 NUMERIC DEFAULT 90,
    quantity INTEGER NOT NULL DEFAULT 1, position TEXT, part_label TEXT,
    machining_operations TEXT, drill_holes JSONB, notches JSONB,
    waste_percent NUMERIC, optimization_group TEXT, bar_assignment TEXT,
    cnc_program_id TEXT, machine_id INTEGER, operator_name TEXT,
    status TEXT NOT NULL DEFAULT 'pending', cut_at TIMESTAMP, notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW()
  )`);

  await execCatch(`CREATE TABLE IF NOT EXISTS assembly_orders (
    id SERIAL PRIMARY KEY, assembly_number TEXT NOT NULL UNIQUE,
    project_id INTEGER, work_order_id INTEGER,
    product_name TEXT, product_type TEXT, system_id INTEGER, system_name TEXT,
    width_mm NUMERIC, height_mm NUMERIC, opening_type TEXT, opening_direction TEXT,
    panels_count INTEGER DEFAULT 1, frame_color TEXT, finish_id INTEGER,
    hardware_set_id INTEGER, glass_id INTEGER, seal_type TEXT, gasket_type TEXT,
    thermal_break BOOLEAN DEFAULT false, components_json JSONB, assembly_steps JSONB,
    assembly_station TEXT, assigned_to TEXT,
    estimated_minutes INTEGER, actual_minutes INTEGER,
    priority TEXT DEFAULT 'normal', status TEXT NOT NULL DEFAULT 'pending',
    started_at TIMESTAMP, completed_at TIMESTAMP,
    qc_result TEXT, qc_notes TEXT, notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW()
  )`);

  await execCatch(`CREATE TABLE IF NOT EXISTS welding_orders (
    id SERIAL PRIMARY KEY, welding_number TEXT NOT NULL UNIQUE,
    project_id INTEGER, work_order_id INTEGER, assembly_order_id INTEGER,
    product_name TEXT, material TEXT DEFAULT 'steel',
    weld_type TEXT DEFAULT 'MIG', joint_type TEXT, weld_position TEXT,
    filler_material TEXT, shielding_gas TEXT,
    pre_heat_temp_c NUMERIC, interpass_temp_c NUMERIC,
    amperage_range TEXT, voltage_range TEXT,
    weld_length_mm NUMERIC, throat_thickness_mm NUMERIC,
    wps_number TEXT, welder_cert_number TEXT,
    assigned_to TEXT, machine_id INTEGER,
    estimated_minutes INTEGER, actual_minutes INTEGER,
    inspection_type TEXT, inspection_result TEXT,
    priority TEXT DEFAULT 'normal', status TEXT NOT NULL DEFAULT 'pending',
    started_at TIMESTAMP, completed_at TIMESTAMP, notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW()
  )`);

  await execCatch(`CREATE TABLE IF NOT EXISTS coating_orders (
    id SERIAL PRIMARY KEY, coating_number TEXT NOT NULL UNIQUE,
    project_id INTEGER, work_order_id INTEGER,
    coating_type TEXT NOT NULL DEFAULT 'powder_coating',
    finish_id INTEGER, color_id INTEGER, color_code TEXT, color_name TEXT,
    surface TEXT DEFAULT 'aluminum', pretreatment TEXT,
    primer_required BOOLEAN DEFAULT false, coats_required INTEGER DEFAULT 1,
    thickness_microns NUMERIC, cure_temperature_c NUMERIC, cure_time_minutes INTEGER,
    total_area_sqm NUMERIC, pieces_count INTEGER DEFAULT 0, pieces_json JSONB,
    batch_number TEXT, oven_id TEXT, assigned_to TEXT,
    estimated_minutes INTEGER, actual_minutes INTEGER,
    quality_check TEXT, adhesion_test TEXT, thickness_test TEXT,
    priority TEXT DEFAULT 'normal', status TEXT NOT NULL DEFAULT 'pending',
    sent_at TIMESTAMP, received_at TIMESTAMP,
    is_external BOOLEAN DEFAULT false, external_supplier TEXT, external_cost NUMERIC,
    notes TEXT, created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW()
  )`);

  await execCatch(`CREATE TABLE IF NOT EXISTS glazing_orders (
    id SERIAL PRIMARY KEY, glazing_number TEXT NOT NULL UNIQUE,
    project_id INTEGER, work_order_id INTEGER, assembly_order_id INTEGER,
    glass_id INTEGER, glass_code TEXT, glass_type TEXT,
    width_mm NUMERIC NOT NULL, height_mm NUMERIC NOT NULL, area_sqm NUMERIC,
    quantity INTEGER NOT NULL DEFAULT 1, edge_work TEXT,
    spacer_type TEXT, sealant_type TEXT,
    glazing_method TEXT DEFAULT 'dry', glazing_beads_required BOOLEAN DEFAULT true,
    setting_blocks_required BOOLEAN DEFAULT true,
    assigned_to TEXT, glazing_station TEXT,
    estimated_minutes INTEGER, actual_minutes INTEGER,
    qc_result TEXT, priority TEXT DEFAULT 'normal',
    status TEXT NOT NULL DEFAULT 'pending',
    started_at TIMESTAMP, completed_at TIMESTAMP, notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW()
  )`);

  await execCatch(`CREATE TABLE IF NOT EXISTS packing_lists (
    id SERIAL PRIMARY KEY, packing_number TEXT NOT NULL UNIQUE,
    project_id INTEGER, work_order_id INTEGER,
    customer_name TEXT, delivery_address TEXT,
    packing_type TEXT DEFAULT 'standard', items_json JSONB,
    total_pieces INTEGER DEFAULT 0, total_weight NUMERIC, total_volume_cbm NUMERIC,
    crates_count INTEGER DEFAULT 0, pallets_count INTEGER DEFAULT 0,
    protection_type TEXT, labeling_complete BOOLEAN DEFAULT false,
    photos_json JSONB, special_instructions TEXT,
    packed_by TEXT, verified_by TEXT, assigned_to TEXT,
    estimated_minutes INTEGER, actual_minutes INTEGER,
    priority TEXT DEFAULT 'normal', status TEXT NOT NULL DEFAULT 'pending',
    packed_at TIMESTAMP, notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW()
  )`);

  await execCatch(`CREATE TABLE IF NOT EXISTS transport_orders (
    id SERIAL PRIMARY KEY, transport_number TEXT NOT NULL UNIQUE,
    project_id INTEGER, packing_list_id INTEGER,
    customer_name TEXT, pickup_address TEXT, delivery_address TEXT NOT NULL,
    delivery_floor INTEGER, has_crane_access BOOLEAN DEFAULT false,
    has_elevator_access BOOLEAN DEFAULT false,
    site_contact_name TEXT, site_contact_phone TEXT,
    vehicle_type TEXT DEFAULT 'truck', vehicle_number TEXT,
    driver_name TEXT, driver_phone TEXT,
    total_weight NUMERIC, total_pieces INTEGER,
    requires_crane BOOLEAN DEFAULT false,
    scheduled_date DATE, scheduled_time TEXT,
    actual_delivery_at TIMESTAMP, delivery_confirmed_by TEXT,
    receiver_signature TEXT, damage_report TEXT, photos_json JSONB,
    transport_cost NUMERIC, assigned_to TEXT,
    priority TEXT DEFAULT 'normal', status TEXT NOT NULL DEFAULT 'scheduled',
    notes TEXT, created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW()
  )`);

  await execCatch(`CREATE TABLE IF NOT EXISTS installation_orders (
    id SERIAL PRIMARY KEY, installation_number TEXT NOT NULL UNIQUE,
    project_id INTEGER, transport_order_id INTEGER,
    customer_name TEXT, site_address TEXT NOT NULL,
    site_contact_name TEXT, site_contact_phone TEXT,
    installation_type TEXT DEFAULT 'new', items_json JSONB,
    total_units INTEGER DEFAULT 0, team_leader TEXT, team_members TEXT,
    team_size INTEGER DEFAULT 2,
    scheduled_start_date DATE, scheduled_end_date DATE,
    actual_start_date DATE, actual_end_date DATE,
    estimated_hours NUMERIC, actual_hours NUMERIC,
    anchor_type TEXT, sealant_type TEXT,
    insulation_required BOOLEAN DEFAULT true, flashing_required BOOLEAN DEFAULT false,
    removal_of_old BOOLEAN DEFAULT false,
    site_conditions TEXT, safety_requirements TEXT,
    scaffolding_required BOOLEAN DEFAULT false, crane_required BOOLEAN DEFAULT false,
    permits_required TEXT, punch_list_json JSONB,
    customer_signoff BOOLEAN DEFAULT false, signoff_date DATE,
    photos_before_json JSONB, photos_after_json JSONB,
    labor_cost NUMERIC, materials_cost NUMERIC, total_cost NUMERIC,
    priority TEXT DEFAULT 'normal', status TEXT NOT NULL DEFAULT 'scheduled',
    notes TEXT, created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW()
  )`);

  await execCatch(`CREATE TABLE IF NOT EXISTS service_tickets (
    id SERIAL PRIMARY KEY, ticket_number TEXT NOT NULL UNIQUE,
    project_id INTEGER, installation_order_id INTEGER,
    customer_name TEXT NOT NULL, customer_phone TEXT, customer_email TEXT,
    site_address TEXT NOT NULL, category TEXT DEFAULT 'repair',
    urgency TEXT DEFAULT 'normal', issue_type TEXT,
    issue_description TEXT NOT NULL, product_type TEXT, product_serial TEXT,
    warranty_status TEXT DEFAULT 'unknown', warranty_expiry DATE,
    diagnosis_notes TEXT, resolution_notes TEXT, parts_used_json JSONB,
    technician_name TEXT, scheduled_date DATE,
    visited_at TIMESTAMP, resolved_at TIMESTAMP,
    estimated_hours NUMERIC, actual_hours NUMERIC,
    parts_cost NUMERIC DEFAULT 0, labor_cost NUMERIC DEFAULT 0, total_cost NUMERIC DEFAULT 0,
    billable BOOLEAN DEFAULT true, customer_satisfaction INTEGER,
    photos_json JSONB, follow_up_required BOOLEAN DEFAULT false, follow_up_date DATE,
    priority TEXT DEFAULT 'normal', status TEXT NOT NULL DEFAULT 'new',
    notes TEXT, created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW()
  )`);

  await execCatch(`CREATE TABLE IF NOT EXISTS project_workflow_stages (
    id SERIAL PRIMARY KEY, project_id INTEGER NOT NULL,
    stage_name TEXT NOT NULL, stage_order INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending', assigned_to TEXT,
    started_at TIMESTAMP, completed_at TIMESTAMP, due_date DATE,
    completion_percent NUMERIC DEFAULT 0, blocked_by TEXT, notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW()
  )`);

  // Seed default unit conversions
  await execCatch(`INSERT INTO unit_conversions (from_unit, to_unit, conversion_factor, material_category, description) VALUES
    ('m', 'mm', 1000, NULL, 'מטר למילימטר'),
    ('mm', 'm', 0.001, NULL, 'מילימטר למטר'),
    ('m', 'cm', 100, NULL, 'מטר לסנטימטר'),
    ('sqm', 'sqft', 10.7639, NULL, 'מ"ר לרגל רבוע'),
    ('kg', 'g', 1000, NULL, 'קילוגרם לגרם'),
    ('ton', 'kg', 1000, NULL, 'טון לקילוגרם'),
    ('inch', 'mm', 25.4, NULL, 'אינץ למילימטר'),
    ('ft', 'm', 0.3048, NULL, 'רגל למטר'),
    ('lm', 'mm', 1000, 'profiles', 'מטר רץ למילימטר')
  ON CONFLICT DO NOTHING`);

  await ensureTable("ai_data_flow_log", `CREATE TABLE IF NOT EXISTS ai_data_flow_log (
    id SERIAL PRIMARY KEY,
    source_entity VARCHAR(100) NOT NULL,
    target_module VARCHAR(100) NOT NULL,
    source_data JSONB DEFAULT '{}',
    propagated_data JSONB DEFAULT '{}',
    status VARCHAR(50) DEFAULT 'completed',
    created_at TIMESTAMP DEFAULT NOW()
  )`);

  await ensureTable("machines", `CREATE TABLE IF NOT EXISTS machines (
    id SERIAL PRIMARY KEY,
    machine_number TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    asset_tag TEXT,
    location TEXT,
    machine_type TEXT,
    manufacturer TEXT,
    model TEXT,
    serial_number TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    purchase_date DATE,
    notes TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
  )`);

  await ensureTable("machine_maintenance_records", `CREATE TABLE IF NOT EXISTS machine_maintenance_records (
    id SERIAL PRIMARY KEY,
    record_number TEXT NOT NULL UNIQUE,
    machine_id INTEGER NOT NULL,
    maintenance_type TEXT NOT NULL DEFAULT 'preventive',
    scheduled_date DATE,
    completed_date DATE,
    performed_by TEXT,
    description TEXT,
    cost NUMERIC DEFAULT 0,
    parts_replaced TEXT,
    next_scheduled_date DATE,
    status TEXT NOT NULL DEFAULT 'scheduled',
    notes TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
  )`);

  await execCatch(`ALTER TABLE machine_maintenance ADD COLUMN IF NOT EXISTS maintenance_number TEXT`);
  await execCatch(`ALTER TABLE machine_maintenance ADD COLUMN IF NOT EXISTS machine_name TEXT`);
  await execCatch(`ALTER TABLE machine_maintenance ADD COLUMN IF NOT EXISTS machine_code TEXT`);
  await execCatch(`ALTER TABLE machine_maintenance ADD COLUMN IF NOT EXISTS title TEXT`);
  await execCatch(`ALTER TABLE machine_maintenance ADD COLUMN IF NOT EXISTS frequency TEXT DEFAULT 'monthly'`);
  await execCatch(`ALTER TABLE machine_maintenance ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'medium'`);
  await execCatch(`ALTER TABLE machine_maintenance ADD COLUMN IF NOT EXISTS assigned_to TEXT`);
  await execCatch(`ALTER TABLE machine_maintenance ADD COLUMN IF NOT EXISTS estimated_hours NUMERIC DEFAULT 0`);
  await execCatch(`ALTER TABLE machine_maintenance ADD COLUMN IF NOT EXISTS actual_hours NUMERIC DEFAULT 0`);
  await execCatch(`ALTER TABLE machine_maintenance ADD COLUMN IF NOT EXISTS parts_cost NUMERIC DEFAULT 0`);
  await execCatch(`ALTER TABLE machine_maintenance ADD COLUMN IF NOT EXISTS labor_cost NUMERIC DEFAULT 0`);
  await execCatch(`ALTER TABLE machine_maintenance ADD COLUMN IF NOT EXISTS total_cost NUMERIC DEFAULT 0`);
  await execCatch(`ALTER TABLE machine_maintenance ADD COLUMN IF NOT EXISTS downtime_hours NUMERIC DEFAULT 0`);
  await execCatch(`ALTER TABLE machine_maintenance ADD COLUMN IF NOT EXISTS parts_used TEXT`);
  await execCatch(`ALTER TABLE machine_maintenance ADD COLUMN IF NOT EXISTS findings TEXT`);
  await execCatch(`ALTER TABLE machine_maintenance ADD COLUMN IF NOT EXISTS location TEXT`);

  await ensureTable("machine_maintenance", `CREATE TABLE IF NOT EXISTS machine_maintenance (
    id SERIAL PRIMARY KEY,
    maintenance_number TEXT NOT NULL,
    machine_name TEXT NOT NULL,
    machine_code TEXT,
    location TEXT,
    maintenance_type TEXT DEFAULT 'preventive',
    title TEXT NOT NULL,
    description TEXT,
    frequency TEXT DEFAULT 'monthly',
    priority TEXT DEFAULT 'medium',
    status TEXT DEFAULT 'scheduled',
    scheduled_date DATE,
    completed_date DATE,
    assigned_to TEXT,
    estimated_hours NUMERIC DEFAULT 0,
    actual_hours NUMERIC DEFAULT 0,
    parts_cost NUMERIC DEFAULT 0,
    labor_cost NUMERIC DEFAULT 0,
    total_cost NUMERIC DEFAULT 0,
    downtime_hours NUMERIC DEFAULT 0,
    parts_used TEXT,
    findings TEXT,
    next_maintenance_date DATE,
    notes TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
  )`);

  await ensureTable("sales_order_items", `CREATE TABLE IF NOT EXISTS sales_order_items (
    id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES sales_orders(id),
    material_id INTEGER,
    product_code TEXT,
    product_name TEXT NOT NULL,
    quantity NUMERIC NOT NULL DEFAULT 1,
    unit TEXT DEFAULT 'יחידה',
    unit_price NUMERIC(15,2) NOT NULL DEFAULT 0,
    discount_percent NUMERIC(5,2) DEFAULT 0,
    vat_percent NUMERIC(5,2) DEFAULT 18,
    total_price NUMERIC(15,2) NOT NULL DEFAULT 0,
    delivered_quantity NUMERIC(10,2) DEFAULT 0,
    reserved_quantity NUMERIC(10,2) DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
  )`);

  await ensureTable("contacts", `CREATE TABLE IF NOT EXISTS contacts (
    id SERIAL PRIMARY KEY,
    customer_id INTEGER REFERENCES customers(id),
    first_name TEXT,
    last_name TEXT,
    title TEXT,
    department TEXT,
    email TEXT,
    phone TEXT,
    mobile TEXT,
    is_primary BOOLEAN DEFAULT false,
    is_billing_contact BOOLEAN DEFAULT false,
    is_shipping_contact BOOLEAN DEFAULT false,
    preferred_contact_method TEXT DEFAULT 'phone',
    birthday DATE,
    notes TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
  )`);

  await ensureTable("leads", `CREATE TABLE IF NOT EXISTS leads (
    id SERIAL PRIMARY KEY,
    lead_number TEXT UNIQUE,
    source TEXT DEFAULT 'other',
    status TEXT DEFAULT 'new',
    first_name TEXT,
    last_name TEXT,
    company_name TEXT,
    email TEXT,
    phone TEXT,
    mobile TEXT,
    address_city TEXT,
    product_interest JSONB DEFAULT '[]',
    estimated_value NUMERIC DEFAULT 0,
    estimated_close_date DATE,
    lead_score NUMERIC(5,2) DEFAULT 0,
    assigned_to TEXT,
    next_follow_up TIMESTAMP,
    follow_up_count INTEGER DEFAULT 0,
    lost_reason TEXT,
    converted_customer_id INTEGER,
    tags JSONB DEFAULT '[]',
    notes TEXT,
    is_active BOOLEAN DEFAULT true,
    created_by TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
  )`);

  await ensureTable("alerts", `CREATE TABLE IF NOT EXISTS alerts (
    id SERIAL PRIMARY KEY,
    user_id INTEGER,
    alert_type TEXT DEFAULT 'info',
    category TEXT,
    title TEXT,
    message TEXT,
    source_entity TEXT,
    source_id INTEGER,
    is_read BOOLEAN DEFAULT false,
    is_dismissed BOOLEAN DEFAULT false,
    action_url TEXT,
    priority INTEGER DEFAULT 3,
    expires_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
  )`);

  await ensureTable("budget_departments", `CREATE TABLE IF NOT EXISTS budget_departments (
    id SERIAL PRIMARY KEY,
    department TEXT NOT NULL,
    year TEXT DEFAULT '2026',
    quarter TEXT,
    allocated BIGINT DEFAULT 0,
    spent BIGINT DEFAULT 0,
    committed BIGINT DEFAULT 0,
    available BIGINT DEFAULT 0,
    utilization NUMERIC(5,1) DEFAULT 0,
    variance NUMERIC(5,1) DEFAULT 0,
    manager TEXT,
    status TEXT DEFAULT 'draft',
    notes TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
  )`);

  await ensureTable("payment_reminders", `CREATE TABLE IF NOT EXISTS payment_reminders (
    id SERIAL PRIMARY KEY,
    customer_name TEXT NOT NULL,
    invoice_number TEXT,
    amount BIGINT DEFAULT 0,
    due_date DATE,
    days_overdue INTEGER DEFAULT 0,
    reminder_count INTEGER DEFAULT 0,
    last_reminder DATE,
    contact_method TEXT DEFAULT 'email',
    contact_info TEXT,
    status TEXT DEFAULT 'pending',
    priority TEXT DEFAULT 'medium',
    notes TEXT,
    assigned_to TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
  )`);

  await ensureTable("safety_procedures", `CREATE TABLE IF NOT EXISTS safety_procedures (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    category TEXT,
    department TEXT,
    version TEXT DEFAULT '1.0',
    effective_date DATE,
    review_date DATE,
    author TEXT,
    approver TEXT,
    description TEXT,
    content TEXT,
    status TEXT DEFAULT 'draft',
    priority TEXT DEFAULT 'medium',
    compliance_standard TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
  )`);

  await ensureTable("production_ncr", `CREATE TABLE IF NOT EXISTS production_ncr (
    id SERIAL PRIMARY KEY,
    ncr_number TEXT,
    title TEXT NOT NULL,
    product TEXT,
    work_order TEXT,
    defect_type TEXT,
    severity TEXT DEFAULT 'medium',
    detected_by TEXT,
    detected_at TIMESTAMP DEFAULT NOW(),
    department TEXT,
    root_cause TEXT,
    corrective_action TEXT,
    preventive_action TEXT,
    cost_impact BIGINT DEFAULT 0,
    status TEXT DEFAULT 'open',
    assigned_to TEXT,
    closed_at TIMESTAMP,
    notes TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
  )`);

  await ensureTable("roles_config", `CREATE TABLE IF NOT EXISTS roles_config (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    display_name TEXT,
    description TEXT,
    permissions JSONB DEFAULT '[]',
    user_count INTEGER DEFAULT 0,
    is_system BOOLEAN DEFAULT false,
    status TEXT DEFAULT 'active',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
  )`);

  logger.info("startup_migrations_complete");
}
