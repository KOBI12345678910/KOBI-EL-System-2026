import { pool } from "@workspace/db";
import { withRetry } from "@workspace/db";
import { logger } from "./logger";

const MIGRATION_TIMEOUT_MS = 10_000;

async function execWithStatementTimeout(rawSql: string, label: string): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(`SET statement_timeout = ${MIGRATION_TIMEOUT_MS}`);
    try {
      await client.query(rawSql);
    } finally {
      await client.query(`RESET statement_timeout`).catch(() => {});
    }
  } catch (e: any) {
    const msg: string = e?.message ?? String(e);
    if (msg.includes("canceling statement") || msg.includes("statement timeout")) {
      logger.warn("startup_migration_statement_timeout", { label, error: msg });
    } else {
      throw e;
    }
  } finally {
    client.release();
  }
}

let _migrationStep = 0;
const MIGRATION_TOTAL = 585;

async function ensureTable(tableName: string, createSql: string): Promise<void> {
  _migrationStep++;
  if (_migrationStep % 20 === 0 || _migrationStep <= 5) {
    logger.info("startup_migration_progress", { step: _migrationStep, total: MIGRATION_TOTAL, label: `ensureTable:${tableName}` });
  }
  try {
    await withRetry(
      () => execWithStatementTimeout(`SELECT 1 FROM ${tableName} LIMIT 1`, `check_table:${tableName}`),
      { maxAttempts: 2, baseDelayMs: 500, label: `check_table:${tableName}` }
    );
  } catch (e: any) {
    try {
      await withRetry(
        () => execWithStatementTimeout(createSql, `create_table:${tableName}`),
        { maxAttempts: 2, baseDelayMs: 500, label: `create_table:${tableName}` }
      );
      logger.info("startup_migration_table_created", { table: tableName });
    } catch (createErr: any) {
      logger.warn("startup_migration_table_create_failed", { table: tableName, error: createErr?.message });
    }
  }
}

async function execCatch(rawSql: string): Promise<void> {
  _migrationStep++;
  try {
    await execWithStatementTimeout(rawSql, rawSql.slice(0, 80));
  } catch (e: any) {
    logger.warn("startup_migration_alter_skipped", { error: e?.message });
  }
}

async function execDirect(rawSql: string): Promise<void> {
  _migrationStep++;
  try {
    await execWithStatementTimeout(rawSql, rawSql.slice(0, 80));
  } catch (e: any) {
    logger.warn("startup_migration_direct_skipped", { error: e?.message });
  }
}

export async function runStartupMigrations(): Promise<void> {
  logger.info("startup_migrations_begin", { total: MIGRATION_TOTAL });
  _migrationStep = 0;

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
    vat_rate NUMERIC(5,2) DEFAULT 17,
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
    vat_rate NUMERIC(5,2) DEFAULT 17,
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
    vat_rate NUMERIC(5,2) DEFAULT 17,
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
    vat_percent NUMERIC(5,2) DEFAULT 17,
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

  await ensureTable("quote_discount_approvals", `CREATE TABLE IF NOT EXISTS quote_discount_approvals (
    id SERIAL PRIMARY KEY,
    quote_id INTEGER NOT NULL,
    quote_number TEXT,
    customer_name TEXT,
    discount_percent NUMERIC(5,2) DEFAULT 0,
    threshold_percent NUMERIC(5,2) DEFAULT 15,
    status TEXT DEFAULT 'pending',
    requested_by TEXT,
    approved_by TEXT,
    rejected_by TEXT,
    approval_notes TEXT,
    rejection_reason TEXT,
    requested_at TIMESTAMP DEFAULT NOW(),
    decided_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  )`);

  await ensureTable("customer_specific_prices", `CREATE TABLE IF NOT EXISTS customer_specific_prices (
    id SERIAL PRIMARY KEY,
    customer_id INTEGER,
    customer_name TEXT,
    product_name TEXT NOT NULL,
    product_code TEXT,
    price NUMERIC(15,2) NOT NULL,
    currency TEXT DEFAULT 'ILS',
    valid_from DATE,
    valid_until DATE,
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  )`);

  await ensureTable("volume_discount_tiers", `CREATE TABLE IF NOT EXISTS volume_discount_tiers (
    id SERIAL PRIMARY KEY,
    price_list_id INTEGER,
    product_name TEXT,
    product_code TEXT,
    min_quantity NUMERIC(10,2) NOT NULL,
    max_quantity NUMERIC(10,2),
    discount_percent NUMERIC(5,2) NOT NULL,
    fixed_price NUMERIC(15,2),
    currency TEXT DEFAULT 'ILS',
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  )`);

  await ensureTable("promotional_pricing", `CREATE TABLE IF NOT EXISTS promotional_pricing (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    product_name TEXT,
    product_code TEXT,
    customer_category TEXT,
    discount_percent NUMERIC(5,2) DEFAULT 0,
    fixed_price NUMERIC(15,2),
    currency TEXT DEFAULT 'ILS',
    valid_from DATE NOT NULL,
    valid_until DATE NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    priority INTEGER DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  )`);

  await ensureTable("inventory_reservations", `CREATE TABLE IF NOT EXISTS inventory_reservations (
    id SERIAL PRIMARY KEY,
    order_id INTEGER,
    quote_id INTEGER,
    product_name TEXT NOT NULL,
    quantity_reserved NUMERIC(10,2) NOT NULL,
    status TEXT DEFAULT 'reserved',
    reserved_at TIMESTAMP DEFAULT NOW(),
    released_at TIMESTAMP,
    notes TEXT
  )`);

  await execCatch(`CREATE TABLE IF NOT EXISTS platform_settings (
    id SERIAL PRIMARY KEY,
    key TEXT NOT NULL UNIQUE,
    value TEXT,
    value_json JSONB,
    category TEXT NOT NULL DEFAULT 'general',
    description TEXT,
    is_system BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);
  await execCatch(`ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS value_json JSONB`);

  // Seed default platform settings for Quote Builder (idempotent)
  await execCatch(`INSERT INTO platform_settings (key, value, category, description, is_system)
    VALUES ('quote.discount_approval_threshold', '15', 'sales', 'Minimum discount percentage requiring manager approval on sales quotations', true)
    ON CONFLICT (key) DO NOTHING`);
  await execCatch(`INSERT INTO platform_settings (key, value, category, description, is_system)
    VALUES ('company.name', 'Our Company', 'branding', 'Company display name used in PDFs and reports', true)
    ON CONFLICT (key) DO NOTHING`);
  await execCatch(`INSERT INTO platform_settings (key, value, category, description, is_system)
    VALUES ('company.address', 'Tel Aviv, Israel', 'branding', 'Company address used in PDFs and reports', true)
    ON CONFLICT (key) DO NOTHING`);
  await execCatch(`INSERT INTO platform_settings (key, value, category, description, is_system)
    VALUES ('company.phone', '03-1234567', 'branding', 'Company phone number used in PDFs', true)
    ON CONFLICT (key) DO NOTHING`);
  await execCatch(`INSERT INTO platform_settings (key, value, category, description, is_system)
    VALUES ('company.email', 'info@company.co.il', 'branding', 'Company email used in PDFs', true)
    ON CONFLICT (key) DO NOTHING`);
  await execCatch(`INSERT INTO platform_settings (key, value, category, description, is_system)
    VALUES ('company.logo_url', '', 'branding', 'URL or base64 data URI of the company logo used in PDFs', false)
    ON CONFLICT (key) DO NOTHING`);

  await ensureTable("customer_rfm_scores", `CREATE TABLE IF NOT EXISTS customer_rfm_scores (
    id SERIAL PRIMARY KEY,
    customer_id INTEGER NOT NULL UNIQUE,
    customer_name TEXT,
    recency_days INTEGER DEFAULT 999,
    frequency_count INTEGER DEFAULT 0,
    monetary_total NUMERIC(15,2) DEFAULT 0,
    r_score INTEGER DEFAULT 1,
    f_score INTEGER DEFAULT 1,
    m_score INTEGER DEFAULT 1,
    rfm_total INTEGER DEFAULT 3,
    tier TEXT DEFAULT 'Bronze',
    previous_tier TEXT,
    tier_changed_at TIMESTAMPTZ,
    calculated_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await ensureTable("customer_rfm_score_history", `CREATE TABLE IF NOT EXISTS customer_rfm_score_history (
    id SERIAL PRIMARY KEY,
    customer_id INTEGER NOT NULL,
    customer_name TEXT,
    recency_days INTEGER DEFAULT 999,
    frequency_count INTEGER DEFAULT 0,
    monetary_total NUMERIC(15,2) DEFAULT 0,
    r_score INTEGER DEFAULT 1,
    f_score INTEGER DEFAULT 1,
    m_score INTEGER DEFAULT 1,
    rfm_total INTEGER DEFAULT 3,
    tier TEXT DEFAULT 'Bronze',
    snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
    calculated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(customer_id, snapshot_date)
  )`);
  await execCatch(`CREATE INDEX IF NOT EXISTS idx_rfm_history_customer_date ON customer_rfm_score_history (customer_id, snapshot_date)`);

  await ensureTable("customer_complaints", `CREATE TABLE IF NOT EXISTS customer_complaints (
    id SERIAL PRIMARY KEY,
    complaint_number TEXT UNIQUE,
    customer_id INTEGER,
    customer_name TEXT,
    subject TEXT NOT NULL,
    description TEXT,
    category TEXT DEFAULT 'general',
    priority TEXT DEFAULT 'medium',
    status TEXT DEFAULT 'open',
    assigned_to TEXT,
    resolution TEXT,
    resolved_at TIMESTAMPTZ,
    satisfaction_rating INTEGER,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await ensureTable("customer_interaction_timeline", `CREATE TABLE IF NOT EXISTS customer_interaction_timeline (
    id SERIAL PRIMARY KEY,
    customer_id INTEGER NOT NULL,
    event_type TEXT NOT NULL,
    event_date TIMESTAMPTZ DEFAULT NOW(),
    title TEXT NOT NULL,
    description TEXT,
    reference_id TEXT,
    reference_type TEXT,
    amount NUMERIC(15,2),
    status TEXT,
    created_by TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await ensureTable("customer_portal_users", `CREATE TABLE IF NOT EXISTS customer_portal_users (
    id SERIAL PRIMARY KEY,
    customer_id INTEGER,
    customer_name TEXT,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    full_name TEXT,
    phone TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    last_login TIMESTAMPTZ,
    invite_token TEXT,
    invite_expires TIMESTAMPTZ,
    invite_used BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await ensureTable("customer_portal_tickets", `CREATE TABLE IF NOT EXISTS customer_portal_tickets (
    id SERIAL PRIMARY KEY,
    ticket_number TEXT UNIQUE,
    portal_user_id INTEGER,
    customer_id INTEGER,
    customer_name TEXT,
    subject TEXT NOT NULL,
    description TEXT,
    category TEXT DEFAULT 'general',
    priority TEXT DEFAULT 'medium',
    status TEXT DEFAULT 'open',
    assigned_to TEXT,
    resolution TEXT,
    resolved_at TIMESTAMPTZ,
    satisfaction_rating INTEGER,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await execCatch(`ALTER TABLE sales_customers ADD COLUMN IF NOT EXISTS rfm_r_score INTEGER DEFAULT 1`);
  await execCatch(`ALTER TABLE sales_customers ADD COLUMN IF NOT EXISTS rfm_f_score INTEGER DEFAULT 1`);
  await execCatch(`ALTER TABLE sales_customers ADD COLUMN IF NOT EXISTS rfm_m_score INTEGER DEFAULT 1`);
  await execCatch(`ALTER TABLE sales_customers ADD COLUMN IF NOT EXISTS rfm_tier TEXT DEFAULT 'Bronze'`);
  await execCatch(`ALTER TABLE sales_customers ADD COLUMN IF NOT EXISTS rfm_total INTEGER DEFAULT 3`);
  await execCatch(`ALTER TABLE sales_customers ADD COLUMN IF NOT EXISTS lifetime_cogs NUMERIC(15,2) DEFAULT 0`);
  await execCatch(`ALTER TABLE sales_customers ADD COLUMN IF NOT EXISTS lifetime_margin NUMERIC(15,2) DEFAULT 0`);
  await execCatch(`ALTER TABLE sales_customers ADD COLUMN IF NOT EXISTS lifetime_margin_pct NUMERIC(5,2) DEFAULT 0`);
  await execCatch(`ALTER TABLE sales_customers ADD COLUMN IF NOT EXISTS last_interaction_date TIMESTAMPTZ`);
  await execCatch(`ALTER TABLE sales_customers ADD COLUMN IF NOT EXISTS portal_email TEXT`);
  await execCatch(`ALTER TABLE sales_customers ADD COLUMN IF NOT EXISTS portal_enabled BOOLEAN DEFAULT FALSE`);
  // Task 464: add missing columns for all form tabs
  await execCatch(`ALTER TABLE sales_customers ADD COLUMN IF NOT EXISTS mobile VARCHAR(50)`);
  await execCatch(`ALTER TABLE sales_customers ADD COLUMN IF NOT EXISTS fax VARCHAR(50)`);
  await execCatch(`ALTER TABLE sales_customers ADD COLUMN IF NOT EXISTS website TEXT`);
  await execCatch(`ALTER TABLE sales_customers ADD COLUMN IF NOT EXISTS city VARCHAR(100)`);
  await execCatch(`ALTER TABLE sales_customers ADD COLUMN IF NOT EXISTS country VARCHAR(100) DEFAULT 'ישראל'`);
  await execCatch(`ALTER TABLE sales_customers ADD COLUMN IF NOT EXISTS postal_code VARCHAR(20)`);
  await execCatch(`ALTER TABLE sales_customers ADD COLUMN IF NOT EXISTS shipping_address TEXT`);
  await execCatch(`ALTER TABLE sales_customers ADD COLUMN IF NOT EXISTS credit_terms_days INTEGER DEFAULT 30`);
  await execCatch(`ALTER TABLE sales_customers ADD COLUMN IF NOT EXISTS currency VARCHAR(10) DEFAULT 'ILS'`);
  await execCatch(`ALTER TABLE sales_customers ADD COLUMN IF NOT EXISTS discount_percent NUMERIC(5,2) DEFAULT 0`);
  await execCatch(`ALTER TABLE sales_customers ADD COLUMN IF NOT EXISTS salesperson_id INTEGER`);
  await execCatch(`ALTER TABLE sales_customers ADD COLUMN IF NOT EXISTS industry VARCHAR(100)`);
  await execCatch(`ALTER TABLE sales_customers ADD COLUMN IF NOT EXISTS category VARCHAR(50) DEFAULT 'רגיל'`);
  await execCatch(`ALTER TABLE sales_customers ADD COLUMN IF NOT EXISTS source TEXT`);
  await execCatch(`ALTER TABLE sales_customers ADD COLUMN IF NOT EXISTS region TEXT`);
  await execCatch(`ALTER TABLE sales_customers ADD COLUMN IF NOT EXISTS vat_exempt BOOLEAN DEFAULT FALSE`);
  await execCatch(`ALTER TABLE sales_customers ADD COLUMN IF NOT EXISTS withholding_tax_rate NUMERIC(5,2) DEFAULT 0`);
  await execCatch(`ALTER TABLE sales_customers ADD COLUMN IF NOT EXISTS bank_name TEXT`);
  await execCatch(`ALTER TABLE sales_customers ADD COLUMN IF NOT EXISTS bank_branch TEXT`);
  await execCatch(`ALTER TABLE sales_customers ADD COLUMN IF NOT EXISTS bank_account TEXT`);
  await execCatch(`ALTER TABLE sales_customers ADD COLUMN IF NOT EXISTS secondary_contact TEXT`);
  await execCatch(`ALTER TABLE sales_customers ADD COLUMN IF NOT EXISTS secondary_phone TEXT`);
  await execCatch(`ALTER TABLE sales_customers ADD COLUMN IF NOT EXISTS secondary_email TEXT`);
  await execCatch(`ALTER TABLE sales_customers ADD COLUMN IF NOT EXISTS payment_method TEXT`);
  await execCatch(`ALTER TABLE sales_customers ADD COLUMN IF NOT EXISTS price_list_id INTEGER`);
  await execCatch(`ALTER TABLE sales_customers ADD COLUMN IF NOT EXISTS language_pref VARCHAR(10) DEFAULT 'he'`);
  await execCatch(`ALTER TABLE sales_customers ADD COLUMN IF NOT EXISTS communication_pref VARCHAR(30) DEFAULT 'phone'`);
  await execCatch(`ALTER TABLE sales_customers ADD COLUMN IF NOT EXISTS internal_notes TEXT`);
  await execCatch(`ALTER TABLE sales_customers ADD COLUMN IF NOT EXISTS preferred_delivery TEXT`);
  await execCatch(`ALTER TABLE sales_customers ADD COLUMN IF NOT EXISTS company_size VARCHAR(20)`);
  await execCatch(`ALTER TABLE sales_customers ADD COLUMN IF NOT EXISTS acquisition_source TEXT`);
  await execCatch(`ALTER TABLE sales_customers ADD COLUMN IF NOT EXISTS customer_since DATE`);
  await execCatch(`ALTER TABLE sales_customers ADD COLUMN IF NOT EXISTS outstanding_balance NUMERIC(15,2) DEFAULT 0`);

  await ensureTable("portal_customer_sessions", `CREATE TABLE IF NOT EXISTS portal_customer_sessions (
    id SERIAL PRIMARY KEY,
    token TEXT NOT NULL UNIQUE,
    user_id INTEGER NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await ensureTable("demand_forecasts", `CREATE TABLE IF NOT EXISTS demand_forecasts (
    id SERIAL PRIMARY KEY,
    material_id INTEGER NOT NULL REFERENCES raw_materials(id),
    forecast_period TEXT NOT NULL,
    forecast_date DATE NOT NULL,
    forecast_qty NUMERIC(15,3) NOT NULL,
    actual_qty NUMERIC(15,3),
    confidence_score NUMERIC(5,2) DEFAULT 0,
    seasonal_factor NUMERIC(8,4) DEFAULT 1.0,
    trend_factor NUMERIC(8,4) DEFAULT 1.0,
    method TEXT DEFAULT 'moving_average',
    data_points_used INTEGER DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
  )`);

  await ensureTable("reorder_suggestions", `CREATE TABLE IF NOT EXISTS reorder_suggestions (
    id SERIAL PRIMARY KEY,
    material_id INTEGER NOT NULL REFERENCES raw_materials(id),
    current_reorder_point NUMERIC(15,3),
    suggested_reorder_point NUMERIC(15,3) NOT NULL,
    current_safety_stock NUMERIC(15,3),
    suggested_safety_stock NUMERIC(15,3) NOT NULL,
    current_eoq NUMERIC(15,3),
    suggested_eoq NUMERIC(15,3) NOT NULL,
    confidence_score NUMERIC(5,2) DEFAULT 0,
    reasoning TEXT,
    seasonal_pattern_detected BOOLEAN DEFAULT false,
    peak_months TEXT,
    avg_daily_demand NUMERIC(15,4),
    demand_variability NUMERIC(8,4),
    lead_time_days INTEGER,
    status TEXT NOT NULL DEFAULT 'pending',
    user_action TEXT,
    user_override_value NUMERIC(15,3),
    user_feedback TEXT,
    action_by TEXT,
    action_at TIMESTAMP,
    generated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
  )`);

  await ensureTable("vmi_suppliers", `CREATE TABLE IF NOT EXISTS vmi_suppliers (
    id SERIAL PRIMARY KEY,
    supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
    is_vmi BOOLEAN NOT NULL DEFAULT true,
    vmi_contract_number TEXT,
    replenishment_lead_days INTEGER DEFAULT 3,
    review_frequency_days INTEGER DEFAULT 7,
    performance_score NUMERIC(5,2),
    last_review_date DATE,
    notes TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
  )`);

  await ensureTable("vmi_items", `CREATE TABLE IF NOT EXISTS vmi_items (
    id SERIAL PRIMARY KEY,
    vmi_supplier_id INTEGER NOT NULL REFERENCES vmi_suppliers(id),
    material_id INTEGER NOT NULL REFERENCES raw_materials(id),
    min_threshold NUMERIC(15,3) NOT NULL,
    max_threshold NUMERIC(15,3) NOT NULL,
    target_level NUMERIC(15,3),
    replenishment_qty NUMERIC(15,3),
    status TEXT NOT NULL DEFAULT 'active',
    last_replenishment_date DATE,
    last_replenishment_qty NUMERIC(15,3),
    replenishment_due_date DATE,
    alert_sent BOOLEAN DEFAULT false,
    alert_sent_at TIMESTAMP,
    notes TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
  )`);

  await ensureTable("vmi_replenishment_orders", `CREATE TABLE IF NOT EXISTS vmi_replenishment_orders (
    id SERIAL PRIMARY KEY,
    vmi_item_id INTEGER NOT NULL REFERENCES vmi_items(id),
    material_id INTEGER NOT NULL REFERENCES raw_materials(id),
    supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
    order_number TEXT NOT NULL UNIQUE,
    quantity NUMERIC(15,3) NOT NULL,
    unit TEXT DEFAULT 'יחידה',
    stock_level_at_order NUMERIC(15,3),
    status TEXT NOT NULL DEFAULT 'pending',
    expected_delivery_date DATE,
    actual_delivery_date DATE,
    delivered_quantity NUMERIC(15,3),
    notes TEXT,
    created_by TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
  )`);

  logger.info("[Migrations] warehouse intelligence tables ensured");

  await ensureTable("edi_trading_partners", `CREATE TABLE IF NOT EXISTS edi_trading_partners (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    supplier_id INTEGER,
    edi_id TEXT,
    edi_qualifier TEXT DEFAULT '01',
    protocol TEXT NOT NULL DEFAULT 'webhook',
    webhook_url TEXT,
    webhook_secret TEXT,
    sftp_host TEXT,
    sftp_port INTEGER DEFAULT 22,
    sftp_username TEXT,
    sftp_password TEXT,
    sftp_inbound_path TEXT DEFAULT '/inbound',
    sftp_outbound_path TEXT DEFAULT '/outbound',
    edi_format TEXT NOT NULL DEFAULT 'X12',
    supported_doc_types JSONB DEFAULT '[]',
    is_active BOOLEAN NOT NULL DEFAULT true,
    test_mode BOOLEAN NOT NULL DEFAULT false,
    last_contact_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);

  await ensureTable("edi_document_mappings", `CREATE TABLE IF NOT EXISTS edi_document_mappings (
    id SERIAL PRIMARY KEY,
    trading_partner_id INTEGER REFERENCES edi_trading_partners(id) ON DELETE CASCADE,
    doc_type TEXT NOT NULL,
    doc_type_name TEXT,
    edi_format TEXT NOT NULL DEFAULT 'X12',
    direction TEXT NOT NULL DEFAULT 'outbound',
    mapping_config JSONB DEFAULT '{}',
    transformation_rules JSONB DEFAULT '[]',
    validation_rules JSONB DEFAULT '[]',
    is_active BOOLEAN NOT NULL DEFAULT true,
    is_default BOOLEAN NOT NULL DEFAULT false,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);

  await ensureTable("edi_transaction_logs", `CREATE TABLE IF NOT EXISTS edi_transaction_logs (
    id SERIAL PRIMARY KEY,
    trading_partner_id INTEGER REFERENCES edi_trading_partners(id) ON DELETE SET NULL,
    doc_type TEXT NOT NULL,
    doc_type_name TEXT,
    direction TEXT NOT NULL DEFAULT 'outbound',
    status TEXT NOT NULL DEFAULT 'pending',
    control_number TEXT,
    reference_type TEXT,
    reference_id INTEGER,
    reference_number TEXT,
    raw_content TEXT,
    parsed_data JSONB,
    file_size_bytes INTEGER DEFAULT 0,
    retry_count INTEGER NOT NULL DEFAULT 0,
    max_retries INTEGER NOT NULL DEFAULT 3,
    error_message TEXT,
    sent_at TIMESTAMPTZ,
    received_at TIMESTAMPTZ,
    acknowledged_at TIMESTAMPTZ,
    processed_at TIMESTAMPTZ,
    created_record_type TEXT,
    created_record_id INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);

  await ensureTable("edi_acknowledgments", `CREATE TABLE IF NOT EXISTS edi_acknowledgments (
    id SERIAL PRIMARY KEY,
    transaction_log_id INTEGER REFERENCES edi_transaction_logs(id) ON DELETE CASCADE,
    trading_partner_id INTEGER REFERENCES edi_trading_partners(id) ON DELETE SET NULL,
    ack_type TEXT NOT NULL DEFAULT '997',
    status TEXT NOT NULL DEFAULT 'pending',
    control_number TEXT,
    accepted_sets INTEGER DEFAULT 0,
    rejected_sets INTEGER DEFAULT 0,
    error_segments JSONB DEFAULT '[]',
    raw_content TEXT,
    received_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);

  logger.info("[Migrations] EDI tables ensured");

  const defaultMappingTemplates: Array<{ docType: string; docTypeName: string; ediFormat: string; direction: string; notes: string; mappingConfig: string }> = [
    { docType: "850",    docTypeName: "Purchase Order",           ediFormat: "X12",     direction: "outbound", notes: "Default X12 850 outbound template",          mappingConfig: '{"BEG_03":"orderNumber","BEG_05":"orderDate","N1_BY":"buyerName","N1_SE":"supplierName","CUR_02":"currency"}' },
    { docType: "ORDERS", docTypeName: "Purchase Order",           ediFormat: "EDIFACT", direction: "outbound", notes: "Default EDIFACT ORDERS outbound template",    mappingConfig: '{"BGM_02":"orderNumber","DTM_02":"orderDate","NAD_BY":"buyerName","NAD_SE":"supplierName","CUX_02":"currency"}' },
    { docType: "810",    docTypeName: "Invoice",                  ediFormat: "X12",     direction: "inbound",  notes: "Default X12 810 inbound template",            mappingConfig: '{"BIG_02":"invoiceNumber","BIG_01":"invoiceDate","TDS_01":"totalAmount","N1_SE":"supplierName","N1_BY":"buyerName"}' },
    { docType: "INVOIC", docTypeName: "Invoice",                  ediFormat: "EDIFACT", direction: "inbound",  notes: "Default EDIFACT INVOIC inbound template",     mappingConfig: '{"BGM_02":"invoiceNumber","DTM_02":"invoiceDate","MOA_02":"totalAmount","NAD_SE":"supplierName","NAD_BY":"buyerName"}' },
    { docType: "856",    docTypeName: "Advance Ship Notice",      ediFormat: "X12",     direction: "inbound",  notes: "Default X12 856 inbound template",            mappingConfig: '{"BSN_02":"shipmentNumber","BSN_03":"shipDate","N1_SE":"supplierName","N1_ST":"shipToName","TD5_04":"carrierName"}' },
    { docType: "DESADV", docTypeName: "Despatch Advice",          ediFormat: "EDIFACT", direction: "inbound",  notes: "Default EDIFACT DESADV inbound template",     mappingConfig: '{"BGM_02":"shipmentNumber","DTM_02":"shipDate","NAD_SE":"supplierName","NAD_ST":"shipToName","TDT_08":"carrierName"}' },
    { docType: "997",    docTypeName: "Functional Acknowledgment",ediFormat: "X12",     direction: "inbound",  notes: "Default X12 997 acknowledgment template",     mappingConfig: '{"AK1_01":"docTypeAcknowledged","AK1_02":"groupControlNumber","AK9_01":"ackStatus"}' },
    { docType: "CONTRL", docTypeName: "Control Message",          ediFormat: "EDIFACT", direction: "inbound",  notes: "Default EDIFACT CONTRL acknowledgment template",mappingConfig: '{"UCI_01":"interchangeControlRef","UCI_04":"ackStatus","UCM_01":"messageControlRef"}' },
  ];
  for (const tmpl of defaultMappingTemplates) {
    await execCatch(`
      INSERT INTO edi_document_mappings (trading_partner_id, doc_type, doc_type_name, edi_format, direction, mapping_config, is_active, is_default, notes)
      SELECT NULL, '${tmpl.docType}', '${tmpl.docTypeName}', '${tmpl.ediFormat}', '${tmpl.direction}', '${tmpl.mappingConfig}'::jsonb, true, true, '${tmpl.notes}'
      WHERE NOT EXISTS (
        SELECT 1 FROM edi_document_mappings
        WHERE trading_partner_id IS NULL
          AND doc_type = '${tmpl.docType}'
          AND edi_format = '${tmpl.ediFormat}'
          AND direction = '${tmpl.direction}'
          AND is_default = true
      )
    `);
  }

  logger.info("[Migrations] EDI default mapping templates ensured");

  await execCatch(`ALTER TABLE edi_trading_partners ADD COLUMN IF NOT EXISTS api_key TEXT`);
  await execCatch(`ALTER TABLE edi_trading_partners ADD COLUMN IF NOT EXISTS as2_url TEXT`);
  await execCatch(`ALTER TABLE edi_trading_partners ADD COLUMN IF NOT EXISTS as2_from_id TEXT`);
  await execCatch(`ALTER TABLE edi_trading_partners ADD COLUMN IF NOT EXISTS as2_to_id TEXT`);

  logger.info("[Migrations] EDI AS2 and API key columns ensured");

  // ─── QMS: Calibration Management ───────────────────────────────────────
  await ensureTable("calibration_instruments", `CREATE TABLE IF NOT EXISTS calibration_instruments (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    serial_number TEXT,
    type TEXT,
    location TEXT,
    department TEXT,
    manufacturer TEXT,
    model TEXT,
    calibration_interval INTEGER DEFAULT 12,
    last_calibration_date DATE,
    next_calibration_date DATE,
    calibration_status TEXT DEFAULT 'active',
    out_of_calibration BOOLEAN DEFAULT FALSE,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await ensureTable("calibration_records", `CREATE TABLE IF NOT EXISTS calibration_records (
    id SERIAL PRIMARY KEY,
    instrument_id INTEGER NOT NULL REFERENCES calibration_instruments(id) ON DELETE CASCADE,
    calibration_date DATE NOT NULL DEFAULT CURRENT_DATE,
    result TEXT NOT NULL DEFAULT 'pass',
    next_due_date DATE,
    certificate_number TEXT,
    performed_by TEXT,
    lab_name TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  // ─── QMS: Internal Audit Management ─────────────────────────────────────
  await ensureTable("internal_audits", `CREATE TABLE IF NOT EXISTS internal_audits (
    id SERIAL PRIMARY KEY,
    audit_number TEXT UNIQUE NOT NULL,
    scope TEXT NOT NULL,
    auditor TEXT,
    auditee TEXT,
    scheduled_date DATE,
    execution_date DATE,
    status TEXT DEFAULT 'planned',
    audit_type TEXT DEFAULT 'internal',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await ensureTable("audit_findings", `CREATE TABLE IF NOT EXISTS audit_findings (
    id SERIAL PRIMARY KEY,
    audit_id INTEGER NOT NULL REFERENCES internal_audits(id) ON DELETE CASCADE,
    finding_number TEXT,
    description TEXT NOT NULL,
    severity TEXT DEFAULT 'minor',
    clause TEXT,
    evidence TEXT,
    status TEXT DEFAULT 'open',
    responsible_person TEXT,
    due_date DATE,
    closed_date DATE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await ensureTable("audit_corrective_actions", `CREATE TABLE IF NOT EXISTS audit_corrective_actions (
    id SERIAL PRIMARY KEY,
    finding_id INTEGER NOT NULL REFERENCES audit_findings(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    assigned_to TEXT,
    due_date DATE,
    status TEXT DEFAULT 'open',
    completed_date DATE,
    verified_by TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  // ─── QMS: Material Certifications ───────────────────────────────────────
  await ensureTable("material_certificates", `CREATE TABLE IF NOT EXISTS material_certificates (
    id SERIAL PRIMARY KEY,
    certificate_number TEXT NOT NULL,
    cert_type TEXT DEFAULT 'MTC',
    material_id INTEGER,
    material_name TEXT NOT NULL,
    batch_reference TEXT,
    supplier_id INTEGER,
    supplier_name TEXT,
    issue_date DATE,
    expiry_date DATE,
    grade TEXT,
    standard TEXT,
    heat_number TEXT,
    mill_name TEXT,
    chemical_composition JSONB,
    mechanical_properties JSONB,
    status TEXT DEFAULT 'valid',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  // ─── QMS: Quality Cost Entries ───────────────────────────────────────────
  await ensureTable("quality_cost_entries", `CREATE TABLE IF NOT EXISTS quality_cost_entries (
    id SERIAL PRIMARY KEY,
    entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
    cost_category TEXT NOT NULL,
    subcategory TEXT,
    amount NUMERIC(15,2) NOT NULL DEFAULT 0,
    currency TEXT DEFAULT 'ILS',
    description TEXT,
    department TEXT,
    product TEXT,
    supplier TEXT,
    reference TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  // TASK 242: PM Module — Resources, Time Tracking & Budget/EVM
  await execCatch(`ALTER TABLE project_resources ADD COLUMN IF NOT EXISTS task_id INTEGER`);
  await execCatch(`ALTER TABLE project_resources ADD COLUMN IF NOT EXISTS employee_id INTEGER`);
  await execCatch(`ALTER TABLE project_resources ADD COLUMN IF NOT EXISTS machine_id INTEGER`);
  await execCatch(`ALTER TABLE project_resources ADD COLUMN IF NOT EXISTS capacity_hours NUMERIC(8,2)`);
  await execCatch(`ALTER TABLE project_resources ADD COLUMN IF NOT EXISTS hourly_rate NUMERIC(12,2)`);
  await execCatch(`ALTER TABLE project_resources ADD COLUMN IF NOT EXISTS has_conflict BOOLEAN DEFAULT false`);
  await execCatch(`ALTER TABLE project_resources ADD COLUMN IF NOT EXISTS conflict_details TEXT`);
  await execCatch(`ALTER TABLE project_resources ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'assigned'`);
  await execCatch(`ALTER TABLE project_resources ADD COLUMN IF NOT EXISTS notes TEXT`);

  await execCatch(`ALTER TABLE timesheet_entries ADD COLUMN IF NOT EXISTS employee_id INTEGER`);
  await execCatch(`ALTER TABLE timesheet_entries ADD COLUMN IF NOT EXISTS week_ending_date DATE`);
  await execCatch(`ALTER TABLE timesheet_entries ADD COLUMN IF NOT EXISTS billable BOOLEAN DEFAULT true`);
  await execCatch(`ALTER TABLE timesheet_entries ADD COLUMN IF NOT EXISTS hourly_rate NUMERIC(10,2)`);
  await execCatch(`ALTER TABLE timesheet_entries ADD COLUMN IF NOT EXISTS billable_amount NUMERIC(12,2)`);
  await execCatch(`ALTER TABLE timesheet_entries ADD COLUMN IF NOT EXISTS approval_status TEXT DEFAULT 'draft'`);
  await execCatch(`ALTER TABLE timesheet_entries ADD COLUMN IF NOT EXISTS approved_by_id INTEGER`);
  await execCatch(`ALTER TABLE timesheet_entries ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ`);
  await execCatch(`ALTER TABLE timesheet_entries ADD COLUMN IF NOT EXISTS rejection_comment TEXT`);

  await execCatch(`ALTER TABLE project_budget_lines ADD COLUMN IF NOT EXISTS earned_value NUMERIC(15,2) DEFAULT 0`);
  await execCatch(`ALTER TABLE project_budget_lines ADD COLUMN IF NOT EXISTS planned_value NUMERIC(15,2) DEFAULT 0`);

  await ensureTable("project_evm_snapshots", `CREATE TABLE IF NOT EXISTS project_evm_snapshots (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL,
    snapshot_date TEXT NOT NULL,
    pv NUMERIC(15,2) DEFAULT 0,
    ev NUMERIC(15,2) DEFAULT 0,
    ac NUMERIC(15,2) DEFAULT 0,
    cpi NUMERIC(8,4),
    spi NUMERIC(8,4),
    eac NUMERIC(15,2),
    etc NUMERIC(15,2),
    vac NUMERIC(15,2),
    cv NUMERIC(15,2),
    sv NUMERIC(15,2),
    completion_pct NUMERIC(5,2) DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  logger.info("[Migrations] Task 242 PM EVM columns and tables ensured");

  // MFA / SSO infrastructure (from main)
  await execCatch(`ALTER TABLE platform_roles ADD COLUMN IF NOT EXISTS parent_role_id INTEGER REFERENCES platform_roles(id) ON DELETE SET NULL`);
  await execCatch(`ALTER TABLE platform_roles ADD COLUMN IF NOT EXISTS priority INTEGER NOT NULL DEFAULT 0`);

  await execCatch(`ALTER TABLE user_sessions ADD COLUMN IF NOT EXISTS fingerprint TEXT`);
  await execCatch(`ALTER TABLE user_sessions ADD COLUMN IF NOT EXISTS device_name TEXT`);
  await execCatch(`ALTER TABLE user_sessions ADD COLUMN IF NOT EXISTS is_mfa_verified BOOLEAN NOT NULL DEFAULT FALSE`);
  await execCatch(`ALTER TABLE user_sessions ADD COLUMN IF NOT EXISTS absolute_expires_at TIMESTAMPTZ`);

  await execCatch(`CREATE TABLE IF NOT EXISTS user_mfa (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    totp_secret TEXT,
    totp_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    backup_codes JSONB,
    email_mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await execCatch(`CREATE TABLE IF NOT EXISTS mfa_challenges (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    code TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await execCatch(`CREATE TABLE IF NOT EXISTS sso_providers (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    type TEXT NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    client_id TEXT,
    client_secret TEXT,
    authorization_url TEXT,
    token_url TEXT,
    userinfo_url TEXT,
    scopes TEXT,
    idp_entity_id TEXT,
    idp_sso_url TEXT,
    idp_slo_url TEXT,
    idp_certificate TEXT,
    attribute_mapping JSONB,
    role_mapping JSONB,
    auto_provision BOOLEAN NOT NULL DEFAULT TRUE,
    default_role_id INTEGER REFERENCES platform_roles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await execCatch(`CREATE TABLE IF NOT EXISTS sso_sessions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider_id INTEGER NOT NULL REFERENCES sso_providers(id) ON DELETE CASCADE,
    session_index TEXT,
    name_id TEXT,
    access_token TEXT,
    refresh_token TEXT,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await execCatch(`CREATE TABLE IF NOT EXISTS role_mfa_requirements (
    id SERIAL PRIMARY KEY,
    role_id INTEGER NOT NULL UNIQUE REFERENCES platform_roles(id) ON DELETE CASCADE,
    require_mfa BOOLEAN NOT NULL DEFAULT FALSE,
    allowed_methods JSONB,
    grace_period_hours INTEGER NOT NULL DEFAULT 24,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await execCatch(`CREATE TABLE IF NOT EXISTS role_hierarchy (
    id SERIAL PRIMARY KEY,
    parent_role_id INTEGER NOT NULL REFERENCES platform_roles(id) ON DELETE CASCADE,
    child_role_id INTEGER NOT NULL REFERENCES platform_roles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(parent_role_id, child_role_id)
  )`);

  // Task 260: Approval Chains & SLA Management
  await ensureTable("approval_chains", `CREATE TABLE IF NOT EXISTS approval_chains (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    is_template BOOLEAN NOT NULL DEFAULT false,
    is_active BOOLEAN NOT NULL DEFAULT true,
    parallel_mode TEXT NOT NULL DEFAULT 'sequential',
    created_by INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await execCatch(`CREATE TABLE IF NOT EXISTS outgoing_webhooks (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    events JSONB NOT NULL DEFAULT '[]',
    headers JSONB NOT NULL DEFAULT '{}',
    auth_type TEXT NOT NULL DEFAULT 'none',
    auth_value TEXT,
    description TEXT,
    retry_policy JSONB NOT NULL DEFAULT '{"maxRetries":3,"backoffSeconds":30}',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await execCatch(`CREATE TABLE IF NOT EXISTS email_templates (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'system',
    subject TEXT NOT NULL,
    body_html TEXT NOT NULL,
    body_text TEXT,
    is_rtl BOOLEAN NOT NULL DEFAULT TRUE,
    variables JSONB NOT NULL DEFAULT '[]',
    attachment_config JSONB,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await execCatch(`CREATE TABLE IF NOT EXISTS webhook_delivery_logs (
    id SERIAL PRIMARY KEY,
    webhook_id INTEGER REFERENCES outgoing_webhooks(id) ON DELETE CASCADE,
    event TEXT NOT NULL,
    payload JSONB,
    success BOOLEAN NOT NULL DEFAULT FALSE,
    response_status INTEGER,
    response_body TEXT,
    error_message TEXT,
    duration INTEGER,
    retry_count INTEGER NOT NULL DEFAULT 0,
    sent_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await execCatch(`CREATE TABLE IF NOT EXISTS incoming_webhook_endpoints (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    secret TEXT,
    description TEXT,
    mapped_action TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    total_calls INTEGER NOT NULL DEFAULT 0,
    last_called_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await execCatch(`CREATE TABLE IF NOT EXISTS scheduled_tasks (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    task_type TEXT NOT NULL,
    schedule_frequency TEXT NOT NULL DEFAULT 'daily',
    schedule_time TEXT NOT NULL DEFAULT '08:00',
    cron_expression TEXT,
    parameters JSONB NOT NULL DEFAULT '{}',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    last_run_at TIMESTAMPTZ,
    next_run_at TIMESTAMPTZ,
    run_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await ensureTable("document_versions", `CREATE TABLE IF NOT EXISTS document_versions (
    id SERIAL PRIMARY KEY,
    file_id INTEGER NOT NULL REFERENCES document_files(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL DEFAULT 1,
    file_path TEXT NOT NULL,
    original_name TEXT NOT NULL,
    size BIGINT NOT NULL DEFAULT 0,
    mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
    change_note TEXT,
    created_by TEXT NOT NULL DEFAULT 'system',
    diff_summary TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await ensureTable("document_approval_workflows", `CREATE TABLE IF NOT EXISTS document_approval_workflows (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    steps JSONB NOT NULL DEFAULT '[]',
    routing_rules JSONB NOT NULL DEFAULT '[]',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by TEXT NOT NULL DEFAULT 'system',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);
  await ensureTable("approval_chain_levels", `CREATE TABLE IF NOT EXISTS approval_chain_levels (
    id SERIAL PRIMARY KEY,
    chain_id INTEGER NOT NULL REFERENCES approval_chains(id) ON DELETE CASCADE,
    level_order INTEGER NOT NULL DEFAULT 0,
    name TEXT NOT NULL,
    approver_type TEXT NOT NULL DEFAULT 'role',
    approver_role TEXT,
    approver_emails JSONB NOT NULL DEFAULT '[]',
    approver_user_ids JSONB NOT NULL DEFAULT '[]',
    parallel_mode TEXT NOT NULL DEFAULT 'all',
    min_approvals INTEGER NOT NULL DEFAULT 1,
    timeout_hours INTEGER,
    escalation_user_id INTEGER,
    escalation_role TEXT,
    conditions JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await ensureTable("approval_routing_rules", `CREATE TABLE IF NOT EXISTS approval_routing_rules (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    entity_type TEXT,
    department TEXT,
    conditions JSONB NOT NULL DEFAULT '[]',
    chain_id INTEGER REFERENCES approval_chains(id) ON DELETE SET NULL,
    priority INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await execCatch(`CREATE TABLE IF NOT EXISTS push_subscriptions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    type TEXT NOT NULL DEFAULT 'browser',
    endpoint TEXT NOT NULL,
    keys_auth TEXT,
    keys_p256dh TEXT,
    expo_token TEXT,
    device_info JSONB,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await ensureTable("approval_delegations", `CREATE TABLE IF NOT EXISTS approval_delegations (
    id SERIAL PRIMARY KEY,
    delegator_user_id INTEGER NOT NULL,
    delegator_email TEXT NOT NULL,
    delegate_user_id INTEGER NOT NULL,
    delegate_email TEXT NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    reason TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await ensureTable("approval_chain_instances", `CREATE TABLE IF NOT EXISTS approval_chain_instances (
    id SERIAL PRIMARY KEY,
    chain_id INTEGER REFERENCES approval_chains(id),
    approval_request_id INTEGER REFERENCES approval_requests(id) ON DELETE CASCADE,
    current_level INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending',
    context JSONB NOT NULL DEFAULT '{}',
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await ensureTable("approval_level_votes", `CREATE TABLE IF NOT EXISTS approval_level_votes (
    id SERIAL PRIMARY KEY,
    instance_id INTEGER NOT NULL REFERENCES approval_chain_instances(id) ON DELETE CASCADE,
    level_id INTEGER NOT NULL REFERENCES approval_chain_levels(id),
    approver_email TEXT NOT NULL,
    approver_user_id INTEGER,
    decision TEXT NOT NULL,
    comments TEXT,
    voted_at TIMESTAMPTZ DEFAULT NOW(),
    is_delegated BOOLEAN NOT NULL DEFAULT false,
    original_approver_email TEXT
  )`);

  await ensureTable("sla_definitions", `CREATE TABLE IF NOT EXISTS sla_definitions (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    sla_type TEXT NOT NULL DEFAULT 'response',
    entity_type TEXT,
    department TEXT,
    metric_unit TEXT NOT NULL DEFAULT 'hours',
    target_value NUMERIC(10,2) NOT NULL DEFAULT 24,
    warning_threshold_pct NUMERIC(5,2) NOT NULL DEFAULT 80,
    breach_threshold_pct NUMERIC(5,2) NOT NULL DEFAULT 100,
    business_hours_only BOOLEAN NOT NULL DEFAULT false,
    business_hours_start INTEGER NOT NULL DEFAULT 8,
    business_hours_end INTEGER NOT NULL DEFAULT 17,
    escalation_chain_id INTEGER REFERENCES approval_chains(id) ON DELETE SET NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_by INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await ensureTable("sla_tracking", `CREATE TABLE IF NOT EXISTS sla_tracking (
    id SERIAL PRIMARY KEY,
    sla_id INTEGER NOT NULL REFERENCES sla_definitions(id) ON DELETE CASCADE,
    entity_type TEXT NOT NULL,
    record_id INTEGER,
    record_label TEXT,
    department TEXT,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    deadline_at TIMESTAMPTZ NOT NULL,
    resolved_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'active',
    compliance_pct NUMERIC(5,2),
    elapsed_hours NUMERIC(10,2),
    breach_count INTEGER NOT NULL DEFAULT 0,
    last_escalated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await ensureTable("dms_document_approvals", `CREATE TABLE IF NOT EXISTS dms_document_approvals (
    id SERIAL PRIMARY KEY,
    file_id INTEGER NOT NULL REFERENCES document_files(id) ON DELETE CASCADE,
    workflow_id INTEGER,
    step_number INTEGER NOT NULL DEFAULT 1,
    step_name TEXT NOT NULL DEFAULT '',
    assigned_to TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    comments TEXT,
    action_at TIMESTAMPTZ,
    action_by TEXT,
    due_date TIMESTAMPTZ,
    requested_by TEXT NOT NULL DEFAULT 'system',
    requested_at TIMESTAMPTZ DEFAULT NOW(),
    metadata JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await ensureTable("sla_breach_events", `CREATE TABLE IF NOT EXISTS sla_breach_events (
    id SERIAL PRIMARY KEY,
    tracking_id INTEGER NOT NULL REFERENCES sla_tracking(id) ON DELETE CASCADE,
    breach_type TEXT NOT NULL DEFAULT 'warning',
    breach_pct NUMERIC(5,2),
    escalation_sent BOOLEAN NOT NULL DEFAULT false,
    notifications_sent INTEGER NOT NULL DEFAULT 0,
    occurred_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await execCatch(`ALTER TABLE approval_requests ADD COLUMN IF NOT EXISTS chain_instance_id INTEGER`);
  await execCatch(`ALTER TABLE approval_requests ADD COLUMN IF NOT EXISTS chain_level_id INTEGER`);
  await execCatch(`ALTER TABLE approval_requests ADD COLUMN IF NOT EXISTS escalated_at TIMESTAMPTZ`);
  await execCatch(`ALTER TABLE approval_requests ADD COLUMN IF NOT EXISTS escalation_level INTEGER DEFAULT 0`);

  logger.info("[Migrations] Task 260 Approval Chains & SLA tables ensured");

  // Task 263: BI — Report Builder & Dashboard Designer
  await ensureTable("bi_dashboards", `CREATE TABLE IF NOT EXISTS bi_dashboards (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    description TEXT,
    layout_config JSONB NOT NULL DEFAULT '{}',
    role_assignments JSONB NOT NULL DEFAULT '[]',
    is_default BOOLEAN NOT NULL DEFAULT false,
    is_public BOOLEAN NOT NULL DEFAULT false,
    created_by INTEGER,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await ensureTable("document_share_links", `CREATE TABLE IF NOT EXISTS document_share_links (
    id SERIAL PRIMARY KEY,
    file_id INTEGER NOT NULL REFERENCES document_files(id) ON DELETE CASCADE,
    token TEXT NOT NULL UNIQUE,
    created_by TEXT NOT NULL DEFAULT 'system',
    expires_at TIMESTAMPTZ,
    allow_download BOOLEAN NOT NULL DEFAULT TRUE,
    require_watermark BOOLEAN NOT NULL DEFAULT FALSE,
    max_views INTEGER,
    view_count INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    access_log JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await ensureTable("document_legal_holds", `CREATE TABLE IF NOT EXISTS document_legal_holds (
    id SERIAL PRIMARY KEY,
    case_name TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    created_by TEXT NOT NULL DEFAULT 'system',
    released_by TEXT,
    released_at TIMESTAMPTZ,
    release_note TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await ensureTable("bi_widgets", `CREATE TABLE IF NOT EXISTS bi_widgets (
    id SERIAL PRIMARY KEY,
    dashboard_id INTEGER NOT NULL REFERENCES bi_dashboards(id) ON DELETE CASCADE,
    widget_type TEXT NOT NULL DEFAULT 'kpi',
    title TEXT NOT NULL,
    report_id INTEGER,
    data_source_config JSONB NOT NULL DEFAULT '{}',
    display_config JSONB NOT NULL DEFAULT '{}',
    position_x INTEGER NOT NULL DEFAULT 0,
    position_y INTEGER NOT NULL DEFAULT 0,
    size_w INTEGER NOT NULL DEFAULT 4,
    size_h INTEGER NOT NULL DEFAULT 3,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await execCatch(`ALTER TABLE report_definitions ADD COLUMN IF NOT EXISTS conditional_formatting JSONB DEFAULT '[]'`);
  await execCatch(`ALTER TABLE report_definitions ADD COLUMN IF NOT EXISTS filter_logic TEXT DEFAULT 'AND'`);

  logger.info("[Migrations] Task 263 BI Dashboard & Report Builder tables ensured");
  // ======================== TASK 267: HSE Incident Reporting & Investigation ========================
  // Ensure safety_incidents has all columns needed for full incident management
  await execCatch(`ALTER TABLE safety_incidents ADD COLUMN IF NOT EXISTS incident_number TEXT`);
  await execCatch(`ALTER TABLE safety_incidents ADD COLUMN IF NOT EXISTS incident_type TEXT DEFAULT 'near_miss'`);
  await execCatch(`ALTER TABLE safety_incidents ADD COLUMN IF NOT EXISTS incident_date DATE`);
  await execCatch(`ALTER TABLE safety_incidents ADD COLUMN IF NOT EXISTS incident_time TIME`);
  await execCatch(`ALTER TABLE safety_incidents ADD COLUMN IF NOT EXISTS title TEXT`);
  await execCatch(`ALTER TABLE safety_incidents ADD COLUMN IF NOT EXISTS description TEXT`);
  await execCatch(`ALTER TABLE safety_incidents ADD COLUMN IF NOT EXISTS severity TEXT DEFAULT 'minor'`);
  await execCatch(`ALTER TABLE safety_incidents ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'reported'`);
  await execCatch(`ALTER TABLE safety_incidents ADD COLUMN IF NOT EXISTS location TEXT`);
  await execCatch(`ALTER TABLE safety_incidents ADD COLUMN IF NOT EXISTS department TEXT`);
  await execCatch(`ALTER TABLE safety_incidents ADD COLUMN IF NOT EXISTS reported_by TEXT`);
  await execCatch(`ALTER TABLE safety_incidents ADD COLUMN IF NOT EXISTS involved_persons TEXT`);
  await execCatch(`ALTER TABLE safety_incidents ADD COLUMN IF NOT EXISTS witnesses TEXT`);
  await execCatch(`ALTER TABLE safety_incidents ADD COLUMN IF NOT EXISTS injury_type TEXT`);
  await execCatch(`ALTER TABLE safety_incidents ADD COLUMN IF NOT EXISTS injury_description TEXT`);
  await execCatch(`ALTER TABLE safety_incidents ADD COLUMN IF NOT EXISTS body_part TEXT`);
  await execCatch(`ALTER TABLE safety_incidents ADD COLUMN IF NOT EXISTS treatment_given TEXT`);
  await execCatch(`ALTER TABLE safety_incidents ADD COLUMN IF NOT EXISTS hospitalized BOOLEAN DEFAULT false`);
  await execCatch(`ALTER TABLE safety_incidents ADD COLUMN IF NOT EXISTS lost_work_days INTEGER DEFAULT 0`);
  await execCatch(`ALTER TABLE safety_incidents ADD COLUMN IF NOT EXISTS equipment_involved TEXT`);
  await execCatch(`ALTER TABLE safety_incidents ADD COLUMN IF NOT EXISTS material_involved TEXT`);
  await execCatch(`ALTER TABLE safety_incidents ADD COLUMN IF NOT EXISTS root_cause TEXT`);
  await execCatch(`ALTER TABLE safety_incidents ADD COLUMN IF NOT EXISTS immediate_cause TEXT`);
  await execCatch(`ALTER TABLE safety_incidents ADD COLUMN IF NOT EXISTS corrective_action TEXT`);
  await execCatch(`ALTER TABLE safety_incidents ADD COLUMN IF NOT EXISTS corrective_action_due DATE`);
  await execCatch(`ALTER TABLE safety_incidents ADD COLUMN IF NOT EXISTS corrective_action_status TEXT`);
  await execCatch(`ALTER TABLE safety_incidents ADD COLUMN IF NOT EXISTS preventive_action TEXT`);
  await execCatch(`ALTER TABLE safety_incidents ADD COLUMN IF NOT EXISTS investigation_by TEXT`);
  await execCatch(`ALTER TABLE safety_incidents ADD COLUMN IF NOT EXISTS investigation_date DATE`);
  await execCatch(`ALTER TABLE safety_incidents ADD COLUMN IF NOT EXISTS investigation_findings TEXT`);
  await execCatch(`ALTER TABLE safety_incidents ADD COLUMN IF NOT EXISTS estimated_cost NUMERIC DEFAULT 0`);
  await execCatch(`ALTER TABLE safety_incidents ADD COLUMN IF NOT EXISTS notes TEXT`);
  await execCatch(`ALTER TABLE safety_incidents ADD COLUMN IF NOT EXISTS closed_by TEXT`);
  await execCatch(`ALTER TABLE safety_incidents ADD COLUMN IF NOT EXISTS closed_at TIMESTAMP`);
  await execCatch(`ALTER TABLE safety_incidents ADD COLUMN IF NOT EXISTS employee_name TEXT`);
  await execCatch(`ALTER TABLE safety_incidents ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW()`);
  await execCatch(`ALTER TABLE safety_incidents ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW()`);

  await ensureTable("hse_incident_investigations", `CREATE TABLE IF NOT EXISTS hse_incident_investigations (
    id SERIAL PRIMARY KEY,
    incident_id INTEGER NOT NULL,
    investigation_method TEXT DEFAULT 'five_whys',
    investigator TEXT,
    investigation_date DATE,
    why_1 TEXT,
    why_2 TEXT,
    why_3 TEXT,
    why_4 TEXT,
    why_5 TEXT,
    root_cause_category TEXT,
    root_cause_description TEXT,
    fishbone_people TEXT,
    fishbone_process TEXT,
    fishbone_equipment TEXT,
    fishbone_environment TEXT,
    fishbone_materials TEXT,
    fishbone_management TEXT,
    contributing_factors TEXT,
    findings TEXT,
    recommendations TEXT,
    status TEXT DEFAULT 'in_progress',
    completed_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
  )`);

  await ensureTable("hse_corrective_actions", `CREATE TABLE IF NOT EXISTS hse_corrective_actions (
    id SERIAL PRIMARY KEY,
    incident_id INTEGER NOT NULL,
    investigation_id INTEGER,
    action_number TEXT,
    title TEXT NOT NULL,
    description TEXT,
    action_type TEXT DEFAULT 'corrective',
    priority TEXT DEFAULT 'medium',
    assigned_to TEXT,
    department TEXT,
    due_date DATE,
    completed_date DATE,
    status TEXT DEFAULT 'open',
    verification_method TEXT,
    verified_by TEXT,
    verified_date DATE,
    effectiveness_rating INTEGER,
    notes TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
  )`);

  await ensureTable("hse_witness_statements", `CREATE TABLE IF NOT EXISTS hse_witness_statements (
    id SERIAL PRIMARY KEY,
    incident_id INTEGER NOT NULL,
    witness_name TEXT NOT NULL,
    witness_role TEXT,
    witness_department TEXT,
    statement_date DATE,
    statement_text TEXT,
    was_present BOOLEAN DEFAULT true,
    contact_info TEXT,
    signature_obtained BOOLEAN DEFAULT false,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
  )`);

  await ensureTable("hse_lessons_learned", `CREATE TABLE IF NOT EXISTS hse_lessons_learned (
    id SERIAL PRIMARY KEY,
    incident_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    category TEXT,
    applicable_departments TEXT,
    shared_with TEXT,
    shared_date DATE,
    is_shared BOOLEAN DEFAULT false,
    created_by TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
  )`);

  await ensureTable("hse_incident_attachments", `CREATE TABLE IF NOT EXISTS hse_incident_attachments (
    id SERIAL PRIMARY KEY,
    incident_id INTEGER NOT NULL,
    file_name TEXT NOT NULL,
    file_type TEXT,
    file_size INTEGER,
    file_url TEXT,
    attachment_type TEXT DEFAULT 'photo',
    description TEXT,
    uploaded_by TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
  )`);

  await ensureTable("hse_audit_log", `CREATE TABLE IF NOT EXISTS hse_audit_log (
    id SERIAL PRIMARY KEY,
    incident_id INTEGER NOT NULL,
    action TEXT NOT NULL,
    field_changed TEXT,
    old_value TEXT,
    new_value TEXT,
    performed_by TEXT,
    performed_at TIMESTAMP NOT NULL DEFAULT NOW(),
    notes TEXT
  )`);

  logger.info("[Migrations] Task 267 HSE Incident Reporting & Investigation tables ensured");

  await ensureTable("field_gps_clock_records", `CREATE TABLE IF NOT EXISTS field_gps_clock_records (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    action TEXT NOT NULL,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    accuracy DOUBLE PRECISION,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await ensureTable("field_location_pings", `CREATE TABLE IF NOT EXISTS field_location_pings (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    accuracy DOUBLE PRECISION,
    battery_level DOUBLE PRECISION,
    speed DOUBLE PRECISION,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);
  await execCatch("ALTER TABLE field_location_pings ADD COLUMN IF NOT EXISTS battery_level DOUBLE PRECISION");
  await execCatch("ALTER TABLE field_location_pings ADD COLUMN IF NOT EXISTS speed DOUBLE PRECISION");

  await ensureTable("field_visit_logs", `CREATE TABLE IF NOT EXISTS field_visit_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    customer_id INTEGER,
    customer_name TEXT,
    notes TEXT,
    photos JSONB DEFAULT '[]',
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    order_data JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await ensureTable("field_production_reports", `CREATE TABLE IF NOT EXISTS field_production_reports (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    work_order_id INTEGER,
    report_type TEXT NOT NULL DEFAULT 'production',
    quantity_produced INTEGER DEFAULT 0,
    reason_code TEXT,
    reason_text TEXT,
    severity TEXT,
    description TEXT,
    photos JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await ensureTable("field_maintenance_orders", `CREATE TABLE IF NOT EXISTS field_maintenance_orders (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    asset_name TEXT,
    location TEXT,
    priority_level INTEGER NOT NULL DEFAULT 3,
    status TEXT NOT NULL DEFAULT 'open',
    assigned_to INTEGER,
    time_spent_minutes INTEGER DEFAULT 0,
    parts_used JSONB DEFAULT '[]',
    notes TEXT,
    photo_before TEXT,
    photo_after TEXT,
    completed_by INTEGER,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await ensureTable("field_gps_clock_records", `CREATE TABLE IF NOT EXISTS field_gps_clock_records (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    action TEXT NOT NULL,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    accuracy DOUBLE PRECISION,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await ensureTable("field_visit_logs", `CREATE TABLE IF NOT EXISTS field_visit_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    customer_id INTEGER,
    customer_name TEXT,
    notes TEXT,
    photos JSONB DEFAULT '[]',
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    order_data JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await ensureTable("field_agent_scanner_logs", `CREATE TABLE IF NOT EXISTS field_agent_scanner_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    barcode TEXT NOT NULL,
    item_name TEXT,
    item_code TEXT,
    action TEXT DEFAULT 'lookup',
    scan_result TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await ensureTable("field_orders", `CREATE TABLE IF NOT EXISTS field_orders (
    id SERIAL PRIMARY KEY,
    customer_id INTEGER,
    order_number TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    total_amount INTEGER DEFAULT 0,
    notes TEXT,
    created_by INTEGER NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await ensureTable("field_order_items", `CREATE TABLE IF NOT EXISTS field_order_items (
    id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES field_orders(id) ON DELETE CASCADE,
    product_id INTEGER,
    item_name TEXT NOT NULL,
    item_number TEXT,
    quantity INTEGER DEFAULT 1,
    unit_price_agorot INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  logger.info("[Migrations] Task 273 Field Operations tables ensured");


  await execCatch(`CREATE TABLE IF NOT EXISTS quote_location_verifications (
    id SERIAL PRIMARY KEY,
    quote_id INTEGER,
    agent_user_id INTEGER NOT NULL,
    agent_latitude NUMERIC(10,7) NOT NULL,
    agent_longitude NUMERIC(10,7) NOT NULL,
    customer_latitude NUMERIC(10,7),
    customer_longitude NUMERIC(10,7),
    customer_name VARCHAR,
    customer_address TEXT,
    is_verified BOOLEAN,
    distance_meters NUMERIC(10,2),
    verification_threshold_meters INTEGER DEFAULT 500,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);
  await execCatch(`CREATE INDEX IF NOT EXISTS idx_qlv_quote_id ON quote_location_verifications (quote_id)`);
  await execCatch(`CREATE INDEX IF NOT EXISTS idx_qlv_agent_user_id ON quote_location_verifications (agent_user_id)`);
  // Add coordinates to existing customers table for GPS verification
  await execCatch(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS latitude NUMERIC(10,7)`);
  await execCatch(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS longitude NUMERIC(10,7)`);
  // Allow NULL is_verified in existing installs (upgrade from DEFAULT false)
  await execCatch(`ALTER TABLE quote_location_verifications ALTER COLUMN is_verified DROP DEFAULT`);
  logger.info("[Migrations] Task 338 quote_location_verifications table ensured");

  await execCatch(`CREATE TABLE IF NOT EXISTS scheduled_task_execution_logs (
    id SERIAL PRIMARY KEY,
    task_id INTEGER REFERENCES scheduled_tasks(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'running',
    output TEXT,
    error_message TEXT,
    duration INTEGER,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
  )`);

  await execCatch(`CREATE TABLE IF NOT EXISTS notification_digest_settings (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    enabled BOOLEAN NOT NULL DEFAULT FALSE,
    frequency TEXT NOT NULL DEFAULT 'daily',
    schedule_time TEXT NOT NULL DEFAULT '08:00',
    channels JSONB NOT NULL DEFAULT '["email"]',
    min_priority TEXT NOT NULL DEFAULT 'normal',
    include_categories JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id)
  )`);

  logger.info("[Migrations] notification engine tables ensured");

  await execCatch(`ALTER TABLE notification_routing_rules ADD COLUMN IF NOT EXISTS channel_browser_push BOOLEAN NOT NULL DEFAULT FALSE`);
  await execCatch(`ALTER TABLE notification_routing_rules ADD COLUMN IF NOT EXISTS channel_mobile_push BOOLEAN NOT NULL DEFAULT FALSE`);
  await execCatch(`ALTER TABLE notification_routing_rules ADD COLUMN IF NOT EXISTS min_priority_browser_push TEXT NOT NULL DEFAULT 'normal'`);
  await execCatch(`ALTER TABLE notification_routing_rules ADD COLUMN IF NOT EXISTS min_priority_mobile_push TEXT NOT NULL DEFAULT 'high'`);
  await execCatch(`ALTER TABLE notification_routing_rules ADD COLUMN IF NOT EXISTS email_template_id INTEGER`);

  await execCatch(`ALTER TABLE notification_delivery_log ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ`);
  await execCatch(`ALTER TABLE notification_delivery_log ADD COLUMN IF NOT EXISTS opened_at TIMESTAMPTZ`);

  await ensureTable("hse_risk_assessments", `CREATE TABLE IF NOT EXISTS hse_risk_assessments (
    id SERIAL PRIMARY KEY,
    assessment_number TEXT UNIQUE,
    title TEXT NOT NULL,
    area TEXT,
    process TEXT,
    task TEXT,
    department TEXT,
    assessor TEXT,
    assessment_date DATE DEFAULT CURRENT_DATE,
    review_date DATE,
    status TEXT DEFAULT 'active',
    overall_risk_level TEXT DEFAULT 'medium',
    notes TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await ensureTable("hse_risk_items", `CREATE TABLE IF NOT EXISTS hse_risk_items (
    id SERIAL PRIMARY KEY,
    assessment_id INTEGER REFERENCES hse_risk_assessments(id) ON DELETE CASCADE,
    hazard_description TEXT NOT NULL,
    hazard_type TEXT,
    who_affected TEXT,
    existing_controls TEXT,
    probability INTEGER DEFAULT 1,
    severity INTEGER DEFAULT 1,
    risk_score INTEGER GENERATED ALWAYS AS (probability * severity) STORED,
    risk_level TEXT,
    additional_controls TEXT,
    residual_probability INTEGER DEFAULT 1,
    residual_severity INTEGER DEFAULT 1,
    residual_risk_score INTEGER GENERATED ALWAYS AS (residual_probability * residual_severity) STORED,
    residual_risk_level TEXT,
    responsible_person TEXT,
    target_date DATE,
    completion_date DATE,
    status TEXT DEFAULT 'open',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await ensureTable("hse_safety_certifications", `CREATE TABLE IF NOT EXISTS hse_safety_certifications (
    id SERIAL PRIMARY KEY,
    certification_name TEXT NOT NULL,
    certification_type TEXT,
    required_for_roles TEXT,
    required_for_departments TEXT,
    validity_months INTEGER DEFAULT 12,
    provider TEXT,
    is_mandatory BOOLEAN DEFAULT true,
    is_active BOOLEAN DEFAULT true,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await ensureTable("hse_waste_disposal", `CREATE TABLE IF NOT EXISTS hse_waste_disposal (
    id SERIAL PRIMARY KEY,
    waste_type TEXT NOT NULL DEFAULT 'לא מסוכן',
    quantity_kg NUMERIC(12,2) DEFAULT 0,
    disposal_method TEXT DEFAULT 'פינוי מורשה',
    transporter_name TEXT,
    transporter_license TEXT,
    disposal_date DATE DEFAULT CURRENT_DATE,
    location TEXT,
    container_id TEXT,
    status TEXT DEFAULT 'פעיל',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await ensureTable("hse_emissions_log", `CREATE TABLE IF NOT EXISTS hse_emissions_log (
    id SERIAL PRIMARY KEY,
    emission_type TEXT NOT NULL DEFAULT 'CO2',
    source TEXT DEFAULT 'ייצור',
    measurement_value NUMERIC(14,4) DEFAULT 0,
    threshold_value NUMERIC(14,4),
    unit TEXT DEFAULT 'ק"ג/יום',
    measurement_date DATE DEFAULT CURRENT_DATE,
    measured_by TEXT,
    report_number TEXT,
    status TEXT DEFAULT 'תקין',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await ensureTable("hse_environmental_permits", `CREATE TABLE IF NOT EXISTS hse_environmental_permits (
    id SERIAL PRIMARY KEY,
    permit_number TEXT,
    permit_type TEXT NOT NULL DEFAULT 'רישיון עסק',
    issuing_authority TEXT DEFAULT 'משרד הסביבה',
    issue_date DATE,
    expiry_date DATE,
    renewal_lead_days INTEGER DEFAULT 90,
    responsible_person TEXT,
    conditions TEXT,
    status TEXT DEFAULT 'תקף',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await ensureTable("hse_safety_committee_meetings", `CREATE TABLE IF NOT EXISTS hse_safety_committee_meetings (
    id SERIAL PRIMARY KEY,
    meeting_date DATE NOT NULL DEFAULT CURRENT_DATE,
    meeting_type TEXT DEFAULT 'ישיבה רגילה',
    attendees TEXT,
    chairperson TEXT,
    agenda TEXT,
    minutes_summary TEXT,
    action_items TEXT,
    next_meeting_date DATE,
    status TEXT DEFAULT 'מתוכנן',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await ensureTable("hse_safety_officers", `CREATE TABLE IF NOT EXISTS hse_safety_officers (
    id SERIAL PRIMARY KEY,
    officer_name TEXT NOT NULL,
    appointment_date DATE DEFAULT CURRENT_DATE,
    certification_number TEXT,
    certification_expiry DATE,
    phone TEXT,
    email TEXT,
    department TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await ensureTable("hse_israeli_checklist", `CREATE TABLE IF NOT EXISTS hse_israeli_checklist (
    id SERIAL PRIMARY KEY,
    requirement TEXT NOT NULL,
    law_reference TEXT,
    frequency TEXT DEFAULT 'שנתי',
    last_done DATE,
    next_due DATE,
    status TEXT DEFAULT 'עמידה',
    responsible TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await ensureTable("hse_annual_reports", `CREATE TABLE IF NOT EXISTS hse_annual_reports (
    id SERIAL PRIMARY KEY,
    report_year INTEGER NOT NULL,
    report_type TEXT DEFAULT 'דוח שנתי למשרד העבודה',
    submission_date DATE,
    prepared_by TEXT,
    approved_by TEXT,
    total_incidents INTEGER DEFAULT 0,
    lost_time_incidents INTEGER DEFAULT 0,
    near_misses INTEGER DEFAULT 0,
    total_lost_days INTEGER DEFAULT 0,
    training_hours INTEGER DEFAULT 0,
    status TEXT DEFAULT 'טיוטה',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await ensureTable("hse_training_records", `CREATE TABLE IF NOT EXISTS hse_training_records (
    id SERIAL PRIMARY KEY,
    record_number TEXT UNIQUE,
    employee_id INTEGER,
    employee_name TEXT NOT NULL,
    department TEXT,
    job_title TEXT,
    certification_id INTEGER REFERENCES hse_safety_certifications(id) ON DELETE SET NULL,
    certification_name TEXT,
    training_type TEXT DEFAULT 'הדרכת בטיחות כללית',
    training_date DATE NOT NULL DEFAULT CURRENT_DATE,
    expiry_date DATE,
    trainer TEXT,
    training_provider TEXT,
    certificate_number TEXT,
    score NUMERIC(5,2),
    pass_fail TEXT DEFAULT 'pass',
    status TEXT DEFAULT 'current',
    alert_30_sent BOOLEAN DEFAULT false,
    alert_60_sent BOOLEAN DEFAULT false,
    alert_90_sent BOOLEAN DEFAULT false,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await ensureTable("hse_inspection_templates", `CREATE TABLE IF NOT EXISTS hse_inspection_templates (
    id SERIAL PRIMARY KEY,
    template_name TEXT NOT NULL,
    inspection_type TEXT,
    area TEXT,
    department TEXT,
    frequency TEXT DEFAULT 'monthly',
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_by TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await ensureTable("hse_inspection_checklist_items", `CREATE TABLE IF NOT EXISTS hse_inspection_checklist_items (
    id SERIAL PRIMARY KEY,
    template_id INTEGER REFERENCES hse_inspection_templates(id) ON DELETE CASCADE,
    item_number INTEGER,
    category TEXT,
    description TEXT NOT NULL,
    guidance TEXT,
    is_required BOOLEAN DEFAULT true,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await ensureTable("hse_inspection_results", `CREATE TABLE IF NOT EXISTS hse_inspection_results (
    id SERIAL PRIMARY KEY,
    inspection_number TEXT UNIQUE,
    template_id INTEGER REFERENCES hse_inspection_templates(id) ON DELETE SET NULL,
    template_name TEXT,
    inspection_date DATE NOT NULL DEFAULT CURRENT_DATE,
    inspector TEXT NOT NULL,
    area TEXT,
    department TEXT,
    status TEXT DEFAULT 'in_progress',
    overall_result TEXT,
    pass_count INTEGER DEFAULT 0,
    fail_count INTEGER DEFAULT 0,
    na_count INTEGER DEFAULT 0,
    findings_count INTEGER DEFAULT 0,
    corrective_actions_count INTEGER DEFAULT 0,
    notes TEXT,
    completed_at TIMESTAMPTZ,
    next_inspection_date DATE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await ensureTable("hse_inspection_item_results", `CREATE TABLE IF NOT EXISTS hse_inspection_item_results (
    id SERIAL PRIMARY KEY,
    inspection_id INTEGER REFERENCES hse_inspection_results(id) ON DELETE CASCADE,
    checklist_item_id INTEGER REFERENCES hse_inspection_checklist_items(id) ON DELETE SET NULL,
    item_description TEXT,
    category TEXT,
    result TEXT DEFAULT 'pass',
    notes TEXT,
    finding_description TEXT,
    corrective_action TEXT,
    corrective_action_due DATE,
    corrective_action_status TEXT DEFAULT 'open',
    responsible_person TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await ensureTable("hse_ppe_inventory", `CREATE TABLE IF NOT EXISTS hse_ppe_inventory (
    id SERIAL PRIMARY KEY,
    ppe_code TEXT UNIQUE,
    ppe_name TEXT NOT NULL,
    ppe_type TEXT,
    category TEXT,
    manufacturer TEXT,
    model TEXT,
    standard TEXT,
    quantity_in_stock INTEGER DEFAULT 0,
    minimum_stock INTEGER DEFAULT 5,
    unit_cost NUMERIC(10,2) DEFAULT 0,
    supplier TEXT,
    lifecycle_months INTEGER DEFAULT 12,
    storage_location TEXT,
    is_active BOOLEAN DEFAULT true,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await ensureTable("hse_ppe_assignments", `CREATE TABLE IF NOT EXISTS hse_ppe_assignments (
    id SERIAL PRIMARY KEY,
    assignment_number TEXT UNIQUE,
    employee_id INTEGER,
    employee_name TEXT NOT NULL,
    department TEXT,
    ppe_item_id INTEGER REFERENCES hse_ppe_inventory(id) ON DELETE SET NULL,
    ppe_name TEXT,
    ppe_type TEXT,
    quantity INTEGER DEFAULT 1,
    issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
    expected_replacement_date DATE,
    actual_replacement_date DATE,
    condition TEXT DEFAULT 'good',
    status TEXT DEFAULT 'issued',
    serial_number TEXT,
    issued_by TEXT,
    returned_date DATE,
    return_reason TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  logger.info("[Migrations] Task 268 HSE Module tables ensured");
  logger.info("[Migrations] Task 270 HSE Environmental/KPI/Israeli tables ensured");

  await ensureTable("scorecard_thresholds", `CREATE TABLE IF NOT EXISTS scorecard_thresholds (
    id SERIAL PRIMARY KEY,
    metric_key TEXT NOT NULL UNIQUE,
    metric_label TEXT NOT NULL,
    green_threshold NUMERIC(15,4) NOT NULL DEFAULT 80,
    yellow_threshold NUMERIC(15,4) NOT NULL DEFAULT 50,
    higher_is_better BOOLEAN NOT NULL DEFAULT true,
    unit TEXT DEFAULT 'percent',
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  logger.info("[Migrations] Task 266 Executive Scorecard tables ensured");

  await execDirect(`ALTER TABLE document_files ADD COLUMN IF NOT EXISTS current_version INTEGER NOT NULL DEFAULT 1`);
  await execDirect(`ALTER TABLE document_files ADD COLUMN IF NOT EXISTS classification TEXT DEFAULT 'internal'`);
  await execDirect(`ALTER TABLE document_files ADD COLUMN IF NOT EXISTS module TEXT`);
  await execDirect(`ALTER TABLE document_files ADD COLUMN IF NOT EXISTS entity_type TEXT`);
  await execDirect(`ALTER TABLE document_files ADD COLUMN IF NOT EXISTS entity_id INTEGER`);
  await execDirect(`ALTER TABLE document_files ADD COLUMN IF NOT EXISTS ocr_text TEXT`);
  await execDirect(`ALTER TABLE document_files ADD COLUMN IF NOT EXISTS ocr_status TEXT DEFAULT 'none'`);
  await execDirect(`ALTER TABLE document_files ADD COLUMN IF NOT EXISTS is_legal_hold BOOLEAN NOT NULL DEFAULT FALSE`);
  await execDirect(`ALTER TABLE document_files ADD COLUMN IF NOT EXISTS legal_hold_case TEXT`);
  await execDirect(`ALTER TABLE document_files ADD COLUMN IF NOT EXISTS legal_hold_at TIMESTAMPTZ`);
  await execDirect(`ALTER TABLE document_files ADD COLUMN IF NOT EXISTS legal_hold_by TEXT`);
  await execDirect(`ALTER TABLE document_files ADD COLUMN IF NOT EXISTS approval_status TEXT DEFAULT 'none'`);
  await execDirect(`ALTER TABLE document_files ADD COLUMN IF NOT EXISTS approval_workflow_id INTEGER`);
  await execDirect(`CREATE INDEX IF NOT EXISTS idx_document_files_legal_hold ON document_files(is_legal_hold) WHERE is_legal_hold = TRUE`);
  await execDirect(`CREATE INDEX IF NOT EXISTS idx_document_files_approval ON document_files(approval_status) WHERE approval_status != 'none'`);
  await execDirect(`CREATE INDEX IF NOT EXISTS idx_document_versions_file_id ON document_versions(file_id)`);
  await execDirect(`CREATE INDEX IF NOT EXISTS idx_dms_document_approvals_file_id ON dms_document_approvals(file_id)`);
  await execDirect(`CREATE INDEX IF NOT EXISTS idx_dms_document_approvals_status ON dms_document_approvals(status) WHERE status = 'pending'`);
  await execDirect(`CREATE INDEX IF NOT EXISTS idx_document_share_links_token ON document_share_links(token)`);

  // Task 256: Contract Lifecycle Management
  await ensureTable("contracts", `CREATE TABLE IF NOT EXISTS contracts (
    id SERIAL PRIMARY KEY,
    contract_number TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    description TEXT,
    contract_type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft',
    vendor TEXT,
    vendor_id INTEGER,
    customer TEXT,
    customer_id INTEGER,
    amount NUMERIC(15,2),
    currency TEXT DEFAULT 'ILS',
    start_date DATE,
    end_date DATE,
    renewal_date DATE,
    auto_renewal BOOLEAN DEFAULT false,
    renewal_term_months INTEGER DEFAULT 12,
    metadata JSONB DEFAULT '{}',
    attachments JSONB DEFAULT '[]',
    key_terms JSONB DEFAULT '{}',
    module TEXT,
    entity_type TEXT,
    entity_id INTEGER,
    created_by TEXT DEFAULT 'system',
    updated_by TEXT DEFAULT 'system',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await ensureTable("contract_status_history", `CREATE TABLE IF NOT EXISTS contract_status_history (
    id SERIAL PRIMARY KEY,
    contract_id INTEGER NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
    from_status TEXT,
    to_status TEXT NOT NULL,
    reason TEXT,
    changed_by TEXT NOT NULL,
    changed_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await ensureTable("contract_approvers", `CREATE TABLE IF NOT EXISTS contract_approvers (
    id SERIAL PRIMARY KEY,
    contract_id INTEGER NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
    approver_name TEXT NOT NULL,
    approver_email TEXT,
    approver_role TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    comments TEXT,
    approved_at TIMESTAMPTZ,
    sequence_number INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await ensureTable("contract_renewal_alerts", `CREATE TABLE IF NOT EXISTS contract_renewal_alerts (
    id SERIAL PRIMARY KEY,
    contract_id INTEGER NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
    alert_date DATE NOT NULL,
    days_before_expiry INTEGER NOT NULL,
    alert_type TEXT NOT NULL DEFAULT 'renewal',
    status TEXT NOT NULL DEFAULT 'pending',
    notified_at TIMESTAMPTZ,
    action_taken TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await ensureTable("contract_parties", `CREATE TABLE IF NOT EXISTS contract_parties (
    id SERIAL PRIMARY KEY,
    contract_id INTEGER NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
    party_type TEXT NOT NULL,
    party_name TEXT NOT NULL,
    party_email TEXT,
    party_phone TEXT,
    party_address TEXT,
    signed_at TIMESTAMPTZ,
    signature_path TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await execCatch(`ALTER TABLE contracts ADD COLUMN IF NOT EXISTS vendor TEXT`);
  await execCatch(`ALTER TABLE contracts ADD COLUMN IF NOT EXISTS vendor_id INTEGER`);
  await execCatch(`ALTER TABLE contracts ADD COLUMN IF NOT EXISTS customer TEXT`);
  await execCatch(`ALTER TABLE contracts ADD COLUMN IF NOT EXISTS customer_id INTEGER`);
  await execDirect(`CREATE INDEX IF NOT EXISTS idx_contracts_status ON contracts(status)`);
  await execDirect(`CREATE INDEX IF NOT EXISTS idx_contracts_renewal_date ON contracts(renewal_date)`);
  await execCatch(`CREATE INDEX IF NOT EXISTS idx_contracts_vendor ON contracts(vendor)`);
  await execDirect(`CREATE INDEX IF NOT EXISTS idx_contract_status_history_contract_id ON contract_status_history(contract_id)`);
  await execDirect(`CREATE INDEX IF NOT EXISTS idx_contract_approvers_contract_id ON contract_approvers(contract_id)`);
  await execDirect(`CREATE INDEX IF NOT EXISTS idx_contract_renewal_alerts_contract_id ON contract_renewal_alerts(contract_id)`);

  logger.info("[Migrations] Task 256 Contract Lifecycle Management tables ensured");

  // Task 257: Contract Templates & E-Signature
  await ensureTable("contract_templates", `CREATE TABLE IF NOT EXISTS contract_templates (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    category TEXT,
    template_content TEXT NOT NULL,
    template_variables JSONB DEFAULT '[]',
    required_fields JSONB DEFAULT '[]',
    current_version INTEGER NOT NULL DEFAULT 1,
    is_active BOOLEAN NOT NULL DEFAULT true,
    signature_fields JSONB DEFAULT '[]',
    created_by TEXT DEFAULT 'system',
    updated_by TEXT DEFAULT 'system',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await ensureTable("template_versions", `CREATE TABLE IF NOT EXISTS template_versions (
    id SERIAL PRIMARY KEY,
    template_id INTEGER NOT NULL REFERENCES contract_templates(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL DEFAULT 1,
    template_content TEXT NOT NULL,
    change_notes TEXT,
    created_by TEXT DEFAULT 'system',
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await ensureTable("contract_signatures", `CREATE TABLE IF NOT EXISTS contract_signatures (
    id SERIAL PRIMARY KEY,
    contract_id INTEGER REFERENCES contracts(id) ON DELETE CASCADE,
    signee_email TEXT NOT NULL,
    signee_name TEXT NOT NULL,
    signature_field TEXT NOT NULL,
    signature_data TEXT,
    signature_type TEXT NOT NULL DEFAULT 'electronic',
    status TEXT NOT NULL DEFAULT 'pending',
    ip_address TEXT,
    user_agent TEXT,
    signed_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await ensureTable("signature_audit_log", `CREATE TABLE IF NOT EXISTS signature_audit_log (
    id SERIAL PRIMARY KEY,
    signature_id INTEGER NOT NULL REFERENCES contract_signatures(id) ON DELETE CASCADE,
    action TEXT NOT NULL,
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    performed_by TEXT,
    details JSONB DEFAULT '{}'
  )`);

  await ensureTable("e_signature_workflow", `CREATE TABLE IF NOT EXISTS e_signature_workflow (
    id SERIAL PRIMARY KEY,
    contract_id INTEGER REFERENCES contracts(id) ON DELETE CASCADE,
    workflow_name TEXT NOT NULL,
    signature_order JSONB DEFAULT '[]',
    current_step INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending',
    send_reminders BOOLEAN DEFAULT true,
    reminder_days INTEGER DEFAULT 3,
    expiration_days INTEGER DEFAULT 30,
    created_by TEXT DEFAULT 'system',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
  )`);

  await execDirect(`CREATE INDEX IF NOT EXISTS idx_contract_templates_category ON contract_templates(category)`);
  await execDirect(`CREATE INDEX IF NOT EXISTS idx_contract_templates_is_active ON contract_templates(is_active)`);
  await execDirect(`CREATE INDEX IF NOT EXISTS idx_template_versions_template_id ON template_versions(template_id)`);
  await execDirect(`CREATE INDEX IF NOT EXISTS idx_contract_signatures_contract_id ON contract_signatures(contract_id)`);
  await execDirect(`CREATE INDEX IF NOT EXISTS idx_contract_signatures_status ON contract_signatures(status)`);
  await execDirect(`CREATE INDEX IF NOT EXISTS idx_e_signature_workflow_contract_id ON e_signature_workflow(contract_id)`);

  logger.info("[Migrations] Task 257 Contract Templates & E-Signature tables ensured");

  // Task 258: Contract AI Analytics & Risk Scoring
  await ensureTable("contract_risk_assessments", `CREATE TABLE IF NOT EXISTS contract_risk_assessments (
    id SERIAL PRIMARY KEY,
    contract_id INTEGER NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
    overall_risk_score NUMERIC(5,2) NOT NULL,
    vendor_risk_score NUMERIC(5,2),
    financial_risk_score NUMERIC(5,2),
    compliance_risk_score NUMERIC(5,2),
    performance_history_score NUMERIC(5,2),
    risk_factors JSONB DEFAULT '[]',
    risk_level TEXT NOT NULL,
    recommendations JSONB DEFAULT '[]',
    analysis_date TIMESTAMPTZ NOT NULL,
    next_review_date TIMESTAMPTZ,
    analyzed_by TEXT DEFAULT 'system',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await ensureTable("contract_risk_alerts", `CREATE TABLE IF NOT EXISTS contract_risk_alerts (
    id SERIAL PRIMARY KEY,
    contract_id INTEGER NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
    risk_assessment_id INTEGER NOT NULL REFERENCES contract_risk_assessments(id) ON DELETE CASCADE,
    alert_type TEXT NOT NULL,
    severity TEXT NOT NULL,
    message TEXT NOT NULL,
    details JSONB DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'active',
    acknowledged_by TEXT,
    acknowledged_at TIMESTAMPTZ,
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await ensureTable("contract_insights", `CREATE TABLE IF NOT EXISTS contract_insights (
    id SERIAL PRIMARY KEY,
    contract_id INTEGER NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
    insight_type TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    data_points JSONB DEFAULT '[]',
    confidence NUMERIC(5,2),
    actionable BOOLEAN DEFAULT false,
    suggested_action TEXT,
    category TEXT,
    priority TEXT DEFAULT 'normal',
    generated_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await ensureTable("predictive_analytics_data", `CREATE TABLE IF NOT EXISTS predictive_analytics_data (
    id SERIAL PRIMARY KEY,
    contract_id INTEGER NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
    prediction_type TEXT NOT NULL,
    prediction_value NUMERIC(10,2),
    confidence NUMERIC(5,2) NOT NULL,
    time_horizon TEXT,
    factors JSONB DEFAULT '[]',
    historical_data JSONB DEFAULT '[]',
    trend TEXT,
    forecasted_outcome TEXT,
    generated_at TIMESTAMPTZ NOT NULL,
    valid_until TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await ensureTable("contract_analytics_dashboard", `CREATE TABLE IF NOT EXISTS contract_analytics_dashboard (
    id SERIAL PRIMARY KEY,
    user_id TEXT,
    dashboard_name TEXT NOT NULL,
    description TEXT,
    widgets JSONB DEFAULT '[]',
    filters JSONB DEFAULT '{}',
    date_range JSONB DEFAULT '{"start":null,"end":null}',
    is_shared BOOLEAN DEFAULT false,
    shared_with JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await ensureTable("contract_analysis_history", `CREATE TABLE IF NOT EXISTS contract_analysis_history (
    id SERIAL PRIMARY KEY,
    contract_id INTEGER NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
    analysis_type TEXT NOT NULL,
    analysis_data JSONB DEFAULT '{}',
    results JSONB DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'completed',
    execution_time INTEGER,
    analyzed_by TEXT DEFAULT 'system',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await execDirect(`CREATE INDEX IF NOT EXISTS idx_contract_risk_assessments_contract_id ON contract_risk_assessments(contract_id)`);
  await execDirect(`CREATE INDEX IF NOT EXISTS idx_contract_risk_assessments_risk_level ON contract_risk_assessments(risk_level)`);
  await execDirect(`CREATE INDEX IF NOT EXISTS idx_contract_risk_alerts_contract_id ON contract_risk_alerts(contract_id)`);
  await execDirect(`CREATE INDEX IF NOT EXISTS idx_contract_risk_alerts_status ON contract_risk_alerts(status)`);
  await execDirect(`CREATE INDEX IF NOT EXISTS idx_contract_insights_contract_id ON contract_insights(contract_id)`);
  await execDirect(`CREATE INDEX IF NOT EXISTS idx_predictive_analytics_data_contract_id ON predictive_analytics_data(contract_id)`);
  await execDirect(`CREATE INDEX IF NOT EXISTS idx_contract_analysis_history_contract_id ON contract_analysis_history(contract_id)`);

  logger.info("[Migrations] Task 258 Contract AI Analytics & Risk Scoring tables ensured");

  // Task 259: Procurement Workflow & Matching
  await ensureTable("rfq", `CREATE TABLE IF NOT EXISTS rfq (
    id SERIAL PRIMARY KEY,
    rfq_number TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    description TEXT,
    department TEXT,
    created_by TEXT,
    status TEXT NOT NULL DEFAULT 'draft',
    issue_date TIMESTAMPTZ,
    due_date TIMESTAMPTZ NOT NULL,
    budget NUMERIC(15,2),
    location TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await ensureTable("rfq_items", `CREATE TABLE IF NOT EXISTS rfq_items (
    id SERIAL PRIMARY KEY,
    rfq_id INTEGER NOT NULL REFERENCES rfq(id) ON DELETE CASCADE,
    item_number INTEGER,
    description TEXT NOT NULL,
    quantity NUMERIC(15,2) NOT NULL,
    unit TEXT,
    estimated_price NUMERIC(15,2),
    specifications JSONB DEFAULT '{}',
    delivery_date TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await ensureTable("rfq_responses", `CREATE TABLE IF NOT EXISTS rfq_responses (
    id SERIAL PRIMARY KEY,
    rfq_id INTEGER NOT NULL REFERENCES rfq(id) ON DELETE CASCADE,
    supplier_id INTEGER,
    supplier_name TEXT,
    supplier_email TEXT,
    quoted_price NUMERIC(15,2),
    lead_time INTEGER,
    payment_terms TEXT,
    quality_rating NUMERIC(3,1),
    price_score NUMERIC(5,2),
    quality_score NUMERIC(5,2),
    delivery_score NUMERIC(5,2),
    terms_score NUMERIC(5,2),
    overall_score NUMERIC(5,2),
    line_item_prices JSONB DEFAULT '[]',
    response_date TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'submitted',
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await ensureTable("po_approval_thresholds", `CREATE TABLE IF NOT EXISTS po_approval_thresholds (
    id SERIAL PRIMARY KEY,
    min_amount NUMERIC(15,2) NOT NULL,
    max_amount NUMERIC(15,2),
    required_roles JSONB DEFAULT '[]',
    approval_sequence JSONB DEFAULT '[]',
    escalation_hours INTEGER DEFAULT 24,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await ensureTable("po_approvals", `CREATE TABLE IF NOT EXISTS po_approvals (
    id SERIAL PRIMARY KEY,
    po_id INTEGER,
    po_number TEXT,
    po_amount NUMERIC(15,2) NOT NULL,
    current_approval_level INTEGER DEFAULT 0,
    required_approvers JSONB DEFAULT '[]',
    approval_status TEXT NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
  )`);

  await execCatch(`CREATE TABLE IF NOT EXISTS po_approval_steps (
    id SERIAL PRIMARY KEY,
    approval_id INTEGER NOT NULL REFERENCES po_approvals(id) ON DELETE CASCADE,
    step_number INTEGER NOT NULL,
    approver_email TEXT NOT NULL,
    approver_name TEXT,
    approver_role TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    approved_at TIMESTAMPTZ,
    rejected_at TIMESTAMPTZ,
    comments TEXT,
    escalated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await ensureTable("three_way_matching", `CREATE TABLE IF NOT EXISTS three_way_matching (
    id SERIAL PRIMARY KEY,
    po_id INTEGER,
    po_number TEXT,
    grn_id INTEGER,
    grn_number TEXT,
    invoice_id INTEGER,
    invoice_number TEXT,
    match_status TEXT NOT NULL DEFAULT 'pending',
    quantity_variance NUMERIC(5,2),
    price_variance NUMERIC(5,2),
    quantity_tolerance NUMERIC(5,2) DEFAULT 5,
    price_tolerance NUMERIC(5,2) DEFAULT 2,
    line_item_matches JSONB DEFAULT '[]',
    exceptions JSONB DEFAULT '[]',
    approved_at TIMESTAMPTZ,
    approved_by TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await ensureTable("landed_cost_components", `CREATE TABLE IF NOT EXISTS landed_cost_components (
    id SERIAL PRIMARY KEY,
    po_id INTEGER,
    po_number TEXT,
    component_type TEXT NOT NULL,
    amount NUMERIC(15,2) NOT NULL,
    currency TEXT DEFAULT 'USD',
    allocation_method TEXT NOT NULL DEFAULT 'value',
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await ensureTable("landed_cost_calculation", `CREATE TABLE IF NOT EXISTS landed_cost_calculation (
    id SERIAL PRIMARY KEY,
    po_id INTEGER,
    po_number TEXT,
    total_freight NUMERIC(15,2),
    total_customs_duties NUMERIC(15,2),
    total_insurance NUMERIC(15,2),
    total_handling NUMERIC(15,2),
    total_landed_cost NUMERIC(15,2),
    line_item_costs JSONB DEFAULT '[]',
    calculated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await execDirect(`CREATE INDEX IF NOT EXISTS idx_rfq_status ON rfq(status)`);
  await execDirect(`CREATE INDEX IF NOT EXISTS idx_rfq_items_rfq_id ON rfq_items(rfq_id)`);
  await execDirect(`CREATE INDEX IF NOT EXISTS idx_rfq_responses_rfq_id ON rfq_responses(rfq_id)`);
  await execDirect(`CREATE INDEX IF NOT EXISTS idx_po_approvals_status ON po_approvals(approval_status)`);
  await execCatch(`ALTER TABLE po_approval_steps ADD COLUMN IF NOT EXISTS approval_id INTEGER`);
  await execCatch(`CREATE INDEX IF NOT EXISTS idx_po_approval_steps_approval_id ON po_approval_steps(approval_id)`);
  await execDirect(`CREATE INDEX IF NOT EXISTS idx_three_way_matching_po_id ON three_way_matching(po_id)`);
  await execDirect(`CREATE INDEX IF NOT EXISTS idx_landed_cost_po_id ON landed_cost_calculation(po_id)`);

  logger.info("[Migrations] Task 259 Procurement Workflow & Matching tables ensured");

  // Task 260: Supplier Intelligence & Portal
  await ensureTable("supplier_portal_accounts", `CREATE TABLE IF NOT EXISTS supplier_portal_accounts (
    id SERIAL PRIMARY KEY,
    supplier_id INTEGER,
    supplier_name TEXT NOT NULL,
    contact_email TEXT NOT NULL UNIQUE,
    contact_name TEXT,
    password_hash TEXT,
    invite_token TEXT UNIQUE,
    invite_expiry TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT true,
    last_login TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await ensureTable("supplier_performance_scores", `CREATE TABLE IF NOT EXISTS supplier_performance_scores (
    id SERIAL PRIMARY KEY,
    supplier_id INTEGER NOT NULL,
    supplier_name TEXT,
    on_time_delivery_rate NUMERIC(5,2),
    quality_reject_rate NUMERIC(5,2),
    price_competitiveness_index NUMERIC(5,2),
    responsiveness_score NUMERIC(5,2),
    overall_score NUMERIC(5,2),
    score_trend TEXT,
    last_calculated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await ensureTable("supplier_contracts", `CREATE TABLE IF NOT EXISTS supplier_contracts (
    id SERIAL PRIMARY KEY,
    supplier_id INTEGER NOT NULL,
    supplier_name TEXT,
    contract_number TEXT NOT NULL UNIQUE,
    contract_name TEXT,
    description TEXT,
    start_date TIMESTAMPTZ NOT NULL,
    end_date TIMESTAMPTZ NOT NULL,
    auto_renew BOOLEAN DEFAULT false,
    renewal_term_days INTEGER,
    payment_terms TEXT,
    pricing_structure JSONB DEFAULT '{}',
    volume_discount_tiers JSONB DEFAULT '[]',
    delivery_terms TEXT,
    quality_requirements JSONB DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'active',
    attachments JSONB DEFAULT '[]',
    created_by TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await ensureTable("supplier_contract_alerts", `CREATE TABLE IF NOT EXISTS supplier_contract_alerts (
    id SERIAL PRIMARY KEY,
    contract_id INTEGER NOT NULL REFERENCES supplier_contracts(id) ON DELETE CASCADE,
    supplier_id INTEGER NOT NULL,
    alert_type TEXT NOT NULL,
    days_until_expiry INTEGER,
    message TEXT,
    severity TEXT NOT NULL DEFAULT 'warning',
    status TEXT NOT NULL DEFAULT 'active',
    acknowledged_at TIMESTAMPTZ,
    acknowledged_by TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await ensureTable("supplier_invoice_submissions", `CREATE TABLE IF NOT EXISTS supplier_invoice_submissions (
    id SERIAL PRIMARY KEY,
    supplier_id INTEGER NOT NULL,
    supplier_email TEXT,
    po_number TEXT,
    invoice_number TEXT NOT NULL,
    invoice_date TIMESTAMPTZ,
    invoice_amount NUMERIC(15,2),
    currency TEXT DEFAULT 'USD',
    line_items JSONB DEFAULT '[]',
    attachments JSONB DEFAULT '[]',
    submitted_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'submitted',
    matching_status TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await ensureTable("supplier_delivery_updates", `CREATE TABLE IF NOT EXISTS supplier_delivery_updates (
    id SERIAL PRIMARY KEY,
    supplier_id INTEGER NOT NULL,
    po_number TEXT NOT NULL,
    current_eta TIMESTAMPTZ,
    original_eta TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'on_track',
    delay_reason TEXT,
    quantity_shipped NUMERIC(15,2),
    shipment_tracking_id TEXT,
    estimated_delivery_date TIMESTAMPTZ,
    updated_by TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await ensureTable("supplier_certifications", `CREATE TABLE IF NOT EXISTS supplier_certifications (
    id SERIAL PRIMARY KEY,
    supplier_id INTEGER NOT NULL,
    certification_name TEXT NOT NULL,
    certificate_number TEXT,
    issuance_date TIMESTAMPTZ,
    expiry_date TIMESTAMPTZ,
    issuing_body TEXT,
    file_url TEXT,
    verification_status TEXT DEFAULT 'pending',
    verified_by TEXT,
    verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await ensureTable("supplier_risk_assessment", `CREATE TABLE IF NOT EXISTS supplier_risk_assessment (
    id SERIAL PRIMARY KEY,
    supplier_id INTEGER NOT NULL,
    supplier_name TEXT,
    single_source_dependency BOOLEAN DEFAULT false,
    geographic_risk NUMERIC(5,2),
    financial_health_score NUMERIC(5,2),
    credit_rating TEXT,
    payment_history_score NUMERIC(5,2),
    compliance_score NUMERIC(5,2),
    overall_risk_score NUMERIC(5,2),
    risk_level TEXT NOT NULL,
    risk_factors JSONB DEFAULT '[]',
    recommendations JSONB DEFAULT '[]',
    last_assessed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await ensureTable("supplier_risk_alerts", `CREATE TABLE IF NOT EXISTS supplier_risk_alerts (
    id SERIAL PRIMARY KEY,
    supplier_id INTEGER NOT NULL,
    risk_assessment_id INTEGER REFERENCES supplier_risk_assessment(id) ON DELETE CASCADE,
    alert_type TEXT NOT NULL,
    severity TEXT NOT NULL,
    message TEXT,
    details JSONB DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'active',
    acknowledged_at TIMESTAMPTZ,
    acknowledged_by TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await execDirect(`CREATE INDEX IF NOT EXISTS idx_supplier_portal_email ON supplier_portal_accounts(contact_email)`);
  await execDirect(`CREATE INDEX IF NOT EXISTS idx_supplier_performance_id ON supplier_performance_scores(supplier_id)`);
  await execDirect(`CREATE INDEX IF NOT EXISTS idx_supplier_contracts_supplier ON supplier_contracts(supplier_id)`);
  await execDirect(`CREATE INDEX IF NOT EXISTS idx_supplier_invoices_supplier ON supplier_invoice_submissions(supplier_id)`);
  await execDirect(`CREATE INDEX IF NOT EXISTS idx_supplier_deliveries_po ON supplier_delivery_updates(po_number)`);
  await execDirect(`CREATE INDEX IF NOT EXISTS idx_supplier_certs_supplier ON supplier_certifications(supplier_id)`);
  await execDirect(`CREATE INDEX IF NOT EXISTS idx_supplier_risk_id ON supplier_risk_assessment(supplier_id)`);

  logger.info("[Migrations] Task 260 Supplier Intelligence & Portal tables ensured");

  // Task 275 - API Gateway & API Key Management
  await ensureTable("api_keys", `CREATE TABLE IF NOT EXISTS api_keys (
    id SERIAL PRIMARY KEY,
    key_hash VARCHAR(255) NOT NULL UNIQUE,
    key_name VARCHAR(255) NOT NULL,
    user_id TEXT NOT NULL,
    scopes JSONB DEFAULT '[]',
    permissions JSONB DEFAULT '[]',
    is_active BOOLEAN DEFAULT true,
    last_used_at TIMESTAMP,
    expires_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
  )`);

  await ensureTable("api_key_usage", `CREATE TABLE IF NOT EXISTS api_key_usage (
    id SERIAL PRIMARY KEY,
    key_id INTEGER REFERENCES api_keys(id) ON DELETE CASCADE,
    endpoint VARCHAR(255),
    method VARCHAR(10),
    status_code INTEGER,
    response_time INTEGER,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
  )`);

  await ensureTable("api_rate_limits", `CREATE TABLE IF NOT EXISTS api_rate_limits (
    id SERIAL PRIMARY KEY,
    user_id TEXT,
    api_key_id INTEGER,
    endpoint VARCHAR(255),
    requests_per_minute INTEGER DEFAULT 200,
    requests_per_hour INTEGER DEFAULT 10000,
    is_heavy_endpoint BOOLEAN DEFAULT false,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
  )`);

  await execDirect(`CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash)`);
  await execDirect(`CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id)`);
  await execDirect(`CREATE INDEX IF NOT EXISTS idx_api_key_usage_id ON api_key_usage(key_id)`);
  await execDirect(`CREATE INDEX IF NOT EXISTS idx_api_rate_limits_endpoint ON api_rate_limits(endpoint)`);

  logger.info("[Migrations] Task 275 API Gateway tables ensured");

  // Task 276 - Israeli Business Integrations
  await ensureTable("israeli_accounting_software", `CREATE TABLE IF NOT EXISTS israeli_accounting_software (
    id SERIAL PRIMARY KEY,
    provider_name VARCHAR(100) NOT NULL,
    api_key TEXT,
    api_secret TEXT,
    company_id VARCHAR(100),
    is_active BOOLEAN DEFAULT true,
    last_sync_at TIMESTAMP,
    sync_frequency VARCHAR(50) DEFAULT 'daily',
    field_mappings JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  )`);

  await ensureTable("israeli_bank_integration", `CREATE TABLE IF NOT EXISTS israeli_bank_integration (
    id SERIAL PRIMARY KEY,
    bank_name VARCHAR(100) NOT NULL,
    bank_code VARCHAR(10),
    access_key TEXT,
    encrypted_password TEXT,
    company_number VARCHAR(20),
    is_active BOOLEAN DEFAULT true,
    last_import_at TIMESTAMP,
    import_format VARCHAR(50) DEFAULT 'ofx',
    bank_account_mappings JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  )`);

  await ensureTable("israeli_bank_transaction_import", `CREATE TABLE IF NOT EXISTS israeli_bank_transaction_import (
    id SERIAL PRIMARY KEY,
    bank_integration_id INTEGER,
    import_date TIMESTAMP DEFAULT NOW(),
    file_format VARCHAR(50),
    file_name VARCHAR(255),
    total_transactions INTEGER,
    processed_transactions INTEGER,
    matched_to_invoices INTEGER,
    status VARCHAR(50) DEFAULT 'pending',
    error_message TEXT,
    created_at TIMESTAMP DEFAULT NOW()
  )`);

  await ensureTable("malav_payment_file", `CREATE TABLE IF NOT EXISTS malav_payment_file (
    id SERIAL PRIMARY KEY,
    file_name VARCHAR(255) NOT NULL,
    total_amount NUMERIC(15, 2),
    payment_count INTEGER,
    status VARCHAR(50) DEFAULT 'draft',
    submitted_at TIMESTAMP,
    response_code VARCHAR(20),
    response_message TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  )`);

  await ensureTable("malav_payment_line", `CREATE TABLE IF NOT EXISTS malav_payment_line (
    id SERIAL PRIMARY KEY,
    payment_file_id INTEGER,
    supplier_id INTEGER,
    supplier_name VARCHAR(255),
    supplier_bank_code VARCHAR(10),
    supplier_bank_account VARCHAR(20),
    supplier_identity VARCHAR(20),
    amount NUMERIC(15, 2),
    invoice_number VARCHAR(50),
    payment_description TEXT,
    status VARCHAR(50) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT NOW()
  )`);

  await ensureTable("israeli_payment_gateway", `CREATE TABLE IF NOT EXISTS israeli_payment_gateway (
    id SERIAL PRIMARY KEY,
    provider_name VARCHAR(100) NOT NULL,
    api_key TEXT,
    api_secret TEXT,
    merchant_id VARCHAR(100),
    merchant_password TEXT,
    is_active BOOLEAN DEFAULT true,
    supported_methods JSONB DEFAULT '["credit_card"]',
    last_test_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  )`);

  await ensureTable("israeli_payment_transaction", `CREATE TABLE IF NOT EXISTS israeli_payment_transaction (
    id SERIAL PRIMARY KEY,
    payment_gateway_id INTEGER,
    transaction_id VARCHAR(100) NOT NULL,
    invoice_id INTEGER,
    amount NUMERIC(15, 2),
    currency VARCHAR(10) DEFAULT 'ILS',
    payment_method VARCHAR(50),
    tokenization VARCHAR(255),
    status VARCHAR(50) DEFAULT 'pending',
    error_code VARCHAR(20),
    error_message TEXT,
    processed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
  )`);

  await ensureTable("israeli_tax_report", `CREATE TABLE IF NOT EXISTS israeli_tax_report (
    id SERIAL PRIMARY KEY,
    report_type VARCHAR(50) NOT NULL,
    report_period VARCHAR(20),
    status VARCHAR(50) DEFAULT 'draft',
    total_amount NUMERIC(15, 2),
    tax_amount NUMERIC(15, 2),
    file_content TEXT,
    submission_id VARCHAR(100),
    response_message TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  )`);

  await ensureTable("integration_sync_log", `CREATE TABLE IF NOT EXISTS integration_sync_log (
    id SERIAL PRIMARY KEY,
    integration_type VARCHAR(50) NOT NULL,
    provider_name VARCHAR(100),
    action VARCHAR(50),
    status VARCHAR(50) NOT NULL,
    records_processed INTEGER,
    records_failed INTEGER,
    error_message TEXT,
    sync_details JSONB DEFAULT '{}',
    started_at TIMESTAMP NOT NULL,
    completed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
  )`);

  await execDirect(`CREATE INDEX IF NOT EXISTS idx_israeli_accounting_provider ON israeli_accounting_software(provider_name)`);
  await execDirect(`CREATE INDEX IF NOT EXISTS idx_israeli_bank_name ON israeli_bank_integration(bank_name)`);
  await execDirect(`CREATE INDEX IF NOT EXISTS idx_malav_file_status ON malav_payment_file(status)`);
  await execDirect(`CREATE INDEX IF NOT EXISTS idx_malav_line_file ON malav_payment_line(payment_file_id)`);
  await execDirect(`CREATE INDEX IF NOT EXISTS idx_payment_txn_id ON israeli_payment_transaction(transaction_id)`);
  await execDirect(`CREATE INDEX IF NOT EXISTS idx_tax_report_period ON israeli_tax_report(report_period)`);
  await execDirect(`CREATE INDEX IF NOT EXISTS idx_sync_log_type ON integration_sync_log(integration_type)`);

  logger.info("[Migrations] Task 276 Israeli Business Integrations tables ensured");

  // Task 277 - Supplier Notifications
  await execCatch(`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS record_name VARCHAR(255)`);
  await execCatch(`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS read_at TIMESTAMP`);
  await execDirect(`CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, is_read)`);
  await execDirect(`CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(type)`);
  await execDirect(`CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at DESC)`);

  logger.info("[Migrations] Task 277 Supplier Notifications indices ensured");

  // Task 278 - Contractor Payment Decision Model
  await ensureTable("contractor_payment_decisions", `CREATE TABLE IF NOT EXISTS contractor_payment_decisions (
    id SERIAL PRIMARY KEY,
    entity_type VARCHAR(50) NOT NULL,
    entity_id INTEGER,
    entity_name VARCHAR(255),
    invoice_amount NUMERIC(15, 2) NOT NULL,
    square_meters NUMERIC(12, 2) NOT NULL,
    rate_per_sqm NUMERIC(12, 2) NOT NULL,
    contractor_percentage NUMERIC(5, 2) NOT NULL,
    payment_by_percentage NUMERIC(15, 2),
    payment_by_sqm NUMERIC(15, 2),
    recommendation VARCHAR(20),
    savings NUMERIC(15, 2),
    chosen_method VARCHAR(20),
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
  )`);

  await execDirect(`CREATE INDEX IF NOT EXISTS idx_contractor_entity ON contractor_payment_decisions(entity_type, entity_id)`);
  await execDirect(`CREATE INDEX IF NOT EXISTS idx_contractor_created ON contractor_payment_decisions(created_at DESC)`);

  logger.info("[Migrations] Task 278 Contractor Payment Decision Model tables ensured");

  // Task 279 - Procurement Competitive Profitability Hub
  await ensureTable("competitors", `CREATE TABLE IF NOT EXISTS competitors (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    category VARCHAR(100),
    market_share NUMERIC(5, 2),
    status VARCHAR(50) DEFAULT 'active',
    swot JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  )`);

  await ensureTable("competitor_prices", `CREATE TABLE IF NOT EXISTS competitor_prices (
    id SERIAL PRIMARY KEY,
    competitor_id INTEGER,
    product_category VARCHAR(255) NOT NULL,
    competitor_price NUMERIC(12, 2),
    our_price NUMERIC(12, 2),
    price_variance NUMERIC(5, 2),
    last_updated TIMESTAMP DEFAULT NOW(),
    created_at TIMESTAMP DEFAULT NOW()
  )`);

  await ensureTable("currency_exposures", `CREATE TABLE IF NOT EXISTS currency_exposures (
    id SERIAL PRIMARY KEY,
    currency_pair VARCHAR(20) NOT NULL,
    exposure_amount NUMERIC(15, 2) NOT NULL,
    exposure_date TIMESTAMP,
    hedging_strategy VARCHAR(50) DEFAULT 'none',
    hedging_cost NUMERIC(15, 2),
    estimated_pnl JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  )`);

  await ensureTable("commodity_risks", `CREATE TABLE IF NOT EXISTS commodity_risks (
    id SERIAL PRIMARY KEY,
    commodity_name VARCHAR(255) NOT NULL,
    quantity NUMERIC(12, 2) NOT NULL,
    current_price NUMERIC(12, 2),
    floor_price NUMERIC(12, 2),
    ceiling_price NUMERIC(12, 2),
    hedging_recommendation TEXT,
    risk_score INTEGER,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  )`);

  await ensureTable("project_analyses_extended", `CREATE TABLE IF NOT EXISTS project_analyses_extended (
    id SERIAL PRIMARY KEY,
    project_analysis_id INTEGER,
    source_type VARCHAR(50),
    source_id INTEGER,
    profitability_status VARCHAR(50) DEFAULT 'go',
    margin_percentage NUMERIC(5, 2),
    net_margin_percentage NUMERIC(5, 2),
    roi NUMERIC(5, 2),
    competitor_comparison JSONB DEFAULT '{}',
    risk_assessment JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  )`);

  await execCatch(`ALTER TABLE competitors ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'active'`);
  await execCatch(`CREATE INDEX IF NOT EXISTS idx_competitors_status ON competitors(status)`);
  await execCatch(`CREATE INDEX IF NOT EXISTS idx_competitor_prices_id ON competitor_prices(competitor_id)`);
  await execCatch(`ALTER TABLE currency_exposures ADD COLUMN IF NOT EXISTS currency_pair VARCHAR(20)`);
  await execCatch(`CREATE INDEX IF NOT EXISTS idx_currency_pair ON currency_exposures(currency_pair)`);
  await execDirect(`CREATE INDEX IF NOT EXISTS idx_commodity_name ON commodity_risks(commodity_name)`);
  await execDirect(`CREATE INDEX IF NOT EXISTS idx_project_analysis_ext ON project_analyses_extended(project_analysis_id)`);

  logger.info("[Migrations] Task 279 Procurement Competitive Profitability Hub tables ensured");

  await execCatch(`CREATE TABLE IF NOT EXISTS dms_approval_audit_log (
    id SERIAL PRIMARY KEY,
    approval_id INTEGER NOT NULL,
    action TEXT NOT NULL,
    action_by TEXT NOT NULL,
    step_index INTEGER NOT NULL DEFAULT 0,
    step_name TEXT,
    comments TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);
  await execCatch(`ALTER TABLE dms_document_approvals ADD COLUMN IF NOT EXISTS current_step INTEGER NOT NULL DEFAULT 0`);
  await execCatch(`ALTER TABLE dms_document_approvals ADD COLUMN IF NOT EXISTS total_steps INTEGER NOT NULL DEFAULT 1`);
  await execCatch(`ALTER TABLE dms_document_approvals ADD COLUMN IF NOT EXISTS escalation_deadline TIMESTAMPTZ`);
  await execDirect(`CREATE INDEX IF NOT EXISTS idx_dms_audit_log_approval ON dms_approval_audit_log(approval_id)`);
  await execDirect(`CREATE INDEX IF NOT EXISTS idx_document_files_fts ON document_files USING gin(to_tsvector('simple', coalesce(name,'') || ' ' || coalesce(description,'') || ' ' || coalesce(ocr_text,'')))`);

  logger.info("[Migrations] Task 255 DMS multi-step approval & FTS index ensured");

  await execCatch(`CREATE TABLE IF NOT EXISTS hr_meetings (
    id SERIAL PRIMARY KEY,
    meeting_number VARCHAR(50) UNIQUE,
    title VARCHAR(255) NOT NULL,
    meeting_date DATE,
    meeting_time VARCHAR(10),
    duration_minutes INTEGER DEFAULT 60,
    meeting_type VARCHAR(50) DEFAULT 'internal',
    participants TEXT,
    location VARCHAR(255),
    notes TEXT,
    ai_summary TEXT,
    status VARCHAR(30) DEFAULT 'scheduled',
    created_by INTEGER,
    created_by_name VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  )`);

  await execCatch(`CREATE TABLE IF NOT EXISTS candidates_pipeline (
    id SERIAL PRIMARY KEY,
    candidate_number VARCHAR(50) UNIQUE,
    full_name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(50),
    position_applied VARCHAR(255),
    recruitment_id INTEGER,
    department VARCHAR(255),
    source VARCHAR(100) DEFAULT 'linkedin',
    stage VARCHAR(50) DEFAULT 'applied',
    experience_years NUMERIC(5,1) DEFAULT 0,
    education_level VARCHAR(100),
    cv_url TEXT,
    linkedin_url TEXT,
    rating INTEGER DEFAULT 0,
    salary_expectation NUMERIC(12,2),
    availability_date DATE,
    notes TEXT,
    rejection_reason TEXT,
    interviewer_name VARCHAR(255),
    interview_date DATE,
    interview_notes TEXT,
    offer_amount NUMERIC(12,2),
    offer_date DATE,
    hire_date DATE,
    created_by INTEGER,
    created_by_name VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  )`);

  await execCatch(`CREATE TABLE IF NOT EXISTS three_way_match_config (
    id SERIAL PRIMARY KEY,
    quantity_tolerance_pct NUMERIC(5,2) DEFAULT 5,
    price_tolerance_pct NUMERIC(5,2) DEFAULT 2,
    amount_tolerance_pct NUMERIC(5,2) DEFAULT 3,
    auto_approve_within_tolerance BOOLEAN DEFAULT TRUE,
    updated_at TIMESTAMP DEFAULT NOW()
  )`);
  await execCatch(`INSERT INTO three_way_match_config (quantity_tolerance_pct, price_tolerance_pct, amount_tolerance_pct) SELECT 5, 2, 3 WHERE NOT EXISTS (SELECT 1 FROM three_way_match_config)`);

  await execCatch(`CREATE TABLE IF NOT EXISTS three_way_match_results (
    id SERIAL PRIMARY KEY,
    po_id INTEGER NOT NULL,
    grn_id INTEGER,
    invoice_number VARCHAR(100),
    invoice_date DATE,
    invoice_amount NUMERIC(15,2),
    match_status VARCHAR(50) DEFAULT 'pending',
    po_amount NUMERIC(15,2),
    grn_amount NUMERIC(15,2),
    quantity_variance_pct NUMERIC(8,3),
    price_variance_pct NUMERIC(8,3),
    amount_variance_pct NUMERIC(8,3),
    exception_reason TEXT,
    resolved_by VARCHAR(255),
    resolved_at TIMESTAMP,
    resolution_action VARCHAR(100),
    resolution_notes TEXT,
    auto_approved BOOLEAN DEFAULT FALSE,
    line_items JSONB,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  )`);

  await execCatch(`CREATE TABLE IF NOT EXISTS quality_policies (
    id SERIAL PRIMARY KEY,
    policy_number VARCHAR(32) UNIQUE,
    title VARCHAR(300) NOT NULL,
    content TEXT,
    scope TEXT,
    version INTEGER NOT NULL DEFAULT 1,
    version_label VARCHAR(20) DEFAULT '1.0',
    status VARCHAR(30) DEFAULT 'draft',
    is_current BOOLEAN DEFAULT false,
    parent_id INTEGER,
    author VARCHAR(200),
    approved_by VARCHAR(200),
    approved_at TIMESTAMP,
    effective_date DATE,
    review_date DATE,
    change_summary TEXT,
    tags TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
  )`);

  await execCatch(`CREATE TABLE IF NOT EXISTS quality_objectives (
    id SERIAL PRIMARY KEY,
    objective_number VARCHAR(32) UNIQUE,
    title VARCHAR(300) NOT NULL,
    description TEXT,
    policy_id INTEGER REFERENCES quality_policies(id) ON DELETE SET NULL,
    target_value VARCHAR(100),
    current_value VARCHAR(100),
    unit VARCHAR(50),
    due_date DATE,
    owner VARCHAR(200),
    department VARCHAR(200),
    priority VARCHAR(20) DEFAULT 'medium',
    status VARCHAR(30) DEFAULT 'active',
    progress INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
  )`);

  await execCatch(`CREATE TABLE IF NOT EXISTS quality_documents (
    id SERIAL PRIMARY KEY,
    document_number VARCHAR(50) UNIQUE,
    title VARCHAR(300) NOT NULL,
    document_type VARCHAR(50) NOT NULL DEFAULT 'procedure',
    category VARCHAR(100),
    description TEXT,
    content TEXT,
    version INTEGER NOT NULL DEFAULT 1,
    revision_label VARCHAR(20) DEFAULT 'A',
    status VARCHAR(30) DEFAULT 'draft',
    iso_standard VARCHAR(100),
    department VARCHAR(200),
    owner VARCHAR(200),
    author VARCHAR(200),
    effective_date DATE,
    review_date DATE,
    expiry_date DATE,
    change_summary TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
  )`);

  await execCatch(`CREATE TABLE IF NOT EXISTS crm_followup_rules (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    trigger_type TEXT NOT NULL,
    trigger_event TEXT,
    trigger_entity TEXT NOT NULL DEFAULT 'lead',
    inaction_days INTEGER,
    delay_hours INTEGER NOT NULL DEFAULT 0,
    action_type TEXT NOT NULL,
    template_id INTEGER,
    custom_message TEXT,
    priority INTEGER NOT NULL DEFAULT 0,
    conditions JSONB NOT NULL DEFAULT '{}',
    tags TEXT[],
    run_count INTEGER NOT NULL DEFAULT 0,
    last_run_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
  )`);

  await execCatch(`CREATE TABLE IF NOT EXISTS crm_comm_templates (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT UNIQUE,
    channel TEXT NOT NULL,
    category TEXT,
    subject TEXT,
    body_he TEXT NOT NULL,
    body_en TEXT,
    variables JSONB NOT NULL DEFAULT '[]',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    wa_template_name TEXT,
    wa_language TEXT DEFAULT 'he',
    meta_approved BOOLEAN NOT NULL DEFAULT FALSE,
    usage_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
  )`);

  await execCatch(`CREATE TABLE IF NOT EXISTS crm_followup_executions (
    id SERIAL PRIMARY KEY,
    rule_id INTEGER REFERENCES crm_followup_rules(id) ON DELETE SET NULL,
    entity_type TEXT NOT NULL,
    entity_id INTEGER NOT NULL,
    entity_name TEXT,
    channel TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    scheduled_at TIMESTAMP NOT NULL,
    executed_at TIMESTAMP,
    message_id INTEGER,
    error TEXT,
    metadata JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
  )`);

  await execCatch(`CREATE TABLE IF NOT EXISTS crm_comm_analytics (
    id SERIAL PRIMARY KEY,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    channel TEXT NOT NULL,
    entity_type TEXT,
    rule_id INTEGER,
    sent INTEGER NOT NULL DEFAULT 0,
    delivered INTEGER NOT NULL DEFAULT 0,
    opened INTEGER NOT NULL DEFAULT 0,
    replied INTEGER NOT NULL DEFAULT 0,
    converted INTEGER NOT NULL DEFAULT 0,
    failed INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
  )`);

  await execCatch(`CREATE INDEX IF NOT EXISTS idx_crm_followup_executions_entity ON crm_followup_executions(entity_type, entity_id)`);
  await execCatch(`CREATE INDEX IF NOT EXISTS idx_crm_followup_executions_pending ON crm_followup_executions(status, scheduled_at) WHERE status = 'pending'`);

  logger.info("[Migrations] Centralized lazy-init tables: hr_meetings, candidates_pipeline, three_way_match, quality_policies, crm_followup_rules");

  // Ensure qc_inspections exists before app.ts ALTER TABLE runs against it
  await execCatch(`CREATE TABLE IF NOT EXISTS qc_inspections (
    id SERIAL PRIMARY KEY,
    inspection_number VARCHAR(50) UNIQUE,
    work_order_id INTEGER,
    batch_reference TEXT,
    inspection_date DATE DEFAULT CURRENT_DATE,
    inspector TEXT,
    inspection_type VARCHAR(50) DEFAULT 'in-process',
    result VARCHAR(20) DEFAULT 'pending',
    defects_found INTEGER DEFAULT 0,
    defect_description TEXT,
    corrective_action TEXT,
    status VARCHAR(30) DEFAULT 'pending',
    notes TEXT,
    plan_id INTEGER,
    material_id INTEGER,
    material_name TEXT,
    supplier_id INTEGER,
    supplier_name TEXT,
    sample_size INTEGER DEFAULT 1,
    disposition TEXT DEFAULT 'pending',
    certificate_id INTEGER,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  )`);

  // Ensure extended columns exist on qc_inspections (idempotent)
  await execCatch(`ALTER TABLE qc_inspections ADD COLUMN IF NOT EXISTS plan_id INTEGER`);
  await execCatch(`ALTER TABLE qc_inspections ADD COLUMN IF NOT EXISTS material_id INTEGER`);
  await execCatch(`ALTER TABLE qc_inspections ADD COLUMN IF NOT EXISTS material_name TEXT`);
  await execCatch(`ALTER TABLE qc_inspections ADD COLUMN IF NOT EXISTS supplier_id INTEGER`);
  await execCatch(`ALTER TABLE qc_inspections ADD COLUMN IF NOT EXISTS supplier_name TEXT`);
  await execCatch(`ALTER TABLE qc_inspections ADD COLUMN IF NOT EXISTS sample_size INTEGER DEFAULT 1`);
  await execCatch(`ALTER TABLE qc_inspections ADD COLUMN IF NOT EXISTS disposition TEXT DEFAULT 'pending'`);
  await execCatch(`ALTER TABLE qc_inspections ADD COLUMN IF NOT EXISTS certificate_id INTEGER`);

  logger.info("[Migrations] qc_inspections table and extended columns ensured");

  // Serialized route-level table initialization (prevents connection pool exhaustion from parallel calls)
  logger.info("[Migrations] Running serialized route table initializations...");
  const { ensureInventoryWarehouseTables } = await import("../routes/inventory-warehouse");
  await ensureInventoryWarehouseTables().catch((e: Error) => logger.warn("[Migrations] inventory-warehouse tables:", { error: e.message }));

  const { ensureWmsTables } = await import("../routes/wms-core");
  await ensureWmsTables().catch((e: Error) => logger.warn("[Migrations] wms-core tables:", { error: e.message }));

  const { ensureProductionGapsTables } = await import("../routes/production-gaps");
  await ensureProductionGapsTables().catch((e: Error) => logger.warn("[Migrations] production-gaps tables:", { error: e.message }));

  const { ensureDeliveryReturnsTables } = await import("../routes/delivery-returns");
  await ensureDeliveryReturnsTables().catch((e: Error) => logger.warn("[Migrations] delivery-returns tables:", { error: e.message }));

  const { ensureAiGapsTables } = await import("../routes/ai-gaps");
  await ensureAiGapsTables().catch((e: Error) => logger.warn("[Migrations] ai-gaps tables:", { error: e.message }));

  const { ensureInstallationsModuleTables } = await import("../routes/installations-module");
  await ensureInstallationsModuleTables().catch((e: Error) => logger.warn("[Migrations] installations-module tables:", { error: e.message }));

  const { ensureFleetLogisticsTables } = await import("../routes/fleet-logistics");
  await ensureFleetLogisticsTables().catch((e: Error) => logger.warn("[Migrations] fleet-logistics tables:", { error: e.message }));

  const { ensureLogisticsTrackingTables } = await import("../routes/logistics-tracking-pod-rma");
  await ensureLogisticsTrackingTables().catch((e: Error) => logger.warn("[Migrations] logistics-tracking tables:", { error: e.message }));

  const { ensureIsraeliBizTables } = await import("../routes/israeli-business-integrations");
  await ensureIsraeliBizTables().catch((e: Error) => logger.warn("[Migrations] israeli-biz tables:", { error: e.message }));

  logger.info("[Migrations] Serialized route table initializations complete");

  // H-03 Soft Delete Implementation:
  // - All listed tables have a deleted_at TIMESTAMPTZ column (nullable)
  // - DELETE operations set deleted_at = NOW() instead of physically deleting
  // - All SELECT queries must include: WHERE deleted_at IS NULL
  // - Use ?includeDeleted=true query param to see soft-deleted records
  // - Restore endpoint: POST /{entity}/:id/restore to un-soft-delete records
  // - Indexed: CREATE INDEX idx_[table]_deleted_at ON [table] (deleted_at) WHERE deleted_at IS NULL
  const softDeleteTables = [
    "employees",
    "customers",
    "work_orders",
    "production_work_orders",
    "raw_materials",
    "price_quotes",
    "customer_invoices",
    "supplier_invoices",
    "suppliers",
    "purchase_orders",
    "sales_orders",
    "quotes",
    "projects",
    "inventory_transactions",
    "notifications",
    "departments",
    "products",
    "sales_customers",
  ];
  for (const t of softDeleteTables) {
    await execCatch(`ALTER TABLE ${t} ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ`);
    await execCatch(`CREATE INDEX IF NOT EXISTS idx_${t}_deleted_at ON ${t} (deleted_at) WHERE deleted_at IS NULL`);
  }
  await execCatch(`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ`);
  await execCatch(`CREATE INDEX IF NOT EXISTS idx_notifications_archived_at ON notifications (archived_at) WHERE archived_at IS NULL`);
  await execCatch(`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`);
  logger.info("[Migrations] soft-delete columns ensured on main entity tables");

  await ensureTable("server_health_logs", `CREATE TABLE IF NOT EXISTS server_health_logs (
    id SERIAL PRIMARY KEY,
    check_type TEXT NOT NULL,
    status TEXT NOT NULL,
    value NUMERIC,
    threshold NUMERIC,
    details JSONB,
    response_time_ms INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await execCatch(`CREATE INDEX IF NOT EXISTS idx_server_health_logs_check_type ON server_health_logs (check_type)`);
  await execCatch(`CREATE INDEX IF NOT EXISTS idx_server_health_logs_created_at ON server_health_logs (created_at DESC)`);
  logger.info("[Migrations] server_health_logs table ensured");

  // H-04: Audit Log — logs all INSERT/UPDATE/DELETE operations
  await execCatch(`CREATE TABLE IF NOT EXISTS audit_log (
    id SERIAL PRIMARY KEY,
    user_id INTEGER,
    user_name VARCHAR(255),
    table_name VARCHAR(100) NOT NULL,
    record_id INTEGER NOT NULL,
    action VARCHAR(20) NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
    old_values JSONB,
    new_values JSONB,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ip_address VARCHAR(45),
    notes TEXT
  )`);
  await execCatch(`CREATE INDEX IF NOT EXISTS idx_audit_log_table_record ON audit_log (table_name, record_id)`);
  await execCatch(`CREATE INDEX IF NOT EXISTS idx_audit_log_user ON audit_log (user_id)`);
  await execCatch(`CREATE INDEX IF NOT EXISTS idx_audit_log_timestamp ON audit_log (timestamp DESC)`);
  await execCatch(`CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log (action)`);
  logger.info("[Migrations] audit_log table ensured — logs all data changes (INSERT/UPDATE/DELETE)");

  // Ensure inventory table exists (schema: lib/db/src/schema/inventory.ts)
  await execCatch(`CREATE TABLE IF NOT EXISTS inventory (
    id SERIAL PRIMARY KEY,
    item_code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    name_he TEXT,
    description TEXT,
    category VARCHAR(100) DEFAULT 'כללי',
    sub_category VARCHAR(100),
    unit VARCHAR(30) DEFAULT 'unit',
    quantity_on_hand NUMERIC(12,3) DEFAULT 0,
    quantity_reserved NUMERIC(12,3) DEFAULT 0,
    quantity_available NUMERIC(12,3) DEFAULT 0,
    reorder_level NUMERIC(12,3) DEFAULT 0,
    reorder_quantity NUMERIC(12,3) DEFAULT 0,
    max_stock_level NUMERIC(12,3),
    cost_price NUMERIC(15,2) DEFAULT 0,
    selling_price NUMERIC(15,2) DEFAULT 0,
    last_purchase_price NUMERIC(15,2),
    currency VARCHAR(10) DEFAULT 'ILS',
    supplier_id INTEGER,
    warehouse_location TEXT,
    shelf_number VARCHAR(50),
    barcode VARCHAR(100),
    weight NUMERIC(10,3),
    dimensions TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    is_critical BOOLEAN NOT NULL DEFAULT FALSE,
    last_count_date DATE,
    last_purchase_date DATE,
    expiry_date DATE,
    notes TEXT,
    image_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
  )`);
  logger.info("[Migrations] inventory table ensured");

  await execCatch(`CREATE SEQUENCE IF NOT EXISTS invoice_number_seq START WITH 1 INCREMENT BY 1`);
  logger.info("[Migrations] invoice_number_seq sequence ensured");

  await execCatch(`DROP VIEW IF EXISTS customer_balance_view`);
  await execCatch(`CREATE VIEW customer_balance_view AS
    SELECT 
      sc.id,
      sc.customer_number,
      sc.name as customer_name,
      COALESCE(inv.total_invoiced, 0) as total_invoiced,
      COALESCE(pmt.total_paid, 0) as total_paid,
      COALESCE(inv.total_invoiced, 0) - COALESCE(pmt.total_paid, 0) as balance,
      sc.credit_limit,
      CASE 
        WHEN COALESCE(inv.total_invoiced, 0) - COALESCE(pmt.total_paid, 0) > sc.credit_limit THEN 'exceeded'
        WHEN COALESCE(inv.total_invoiced, 0) - COALESCE(pmt.total_paid, 0) > sc.credit_limit * 0.8 THEN 'warning'
        ELSE 'ok'
      END as credit_status
    FROM sales_customers sc
    LEFT JOIN (
      SELECT customer_id, SUM(total) as total_invoiced 
      FROM sales_invoices 
      WHERE status != 'cancelled'
      GROUP BY customer_id
    ) inv ON sc.id = inv.customer_id
    LEFT JOIN (
      SELECT customer_name, SUM(amount) as total_paid 
      FROM customer_payments 
      WHERE status = 'completed'
      GROUP BY customer_name
    ) pmt ON sc.name = pmt.customer_name
  `);
  logger.info("[Migrations] customer_balance_view created (computed balance = SUM(invoices) - SUM(payments))");

  // FTS indexes removed — PostgreSQL GIN/to_tsvector syntax not compatible across all database backends
  // Search functionality is available via WHERE LIKE clauses and application-level filtering

  // Repair sales_orders rows where total is NULL or 0 but subtotal is set — ensures KPI revenue queries return non-zero values
  await execCatch(`UPDATE sales_orders SET total = subtotal + COALESCE(tax_amount, 0) - COALESCE(discount_amount, 0) WHERE (total IS NULL OR total = 0) AND subtotal IS NOT NULL AND subtotal > 0`);

  // AI Orchestration: ai_provider_settings table
  await execCatch(`CREATE TABLE IF NOT EXISTS ai_provider_settings (
    id SERIAL PRIMARY KEY,
    provider VARCHAR(50) NOT NULL UNIQUE,
    is_enabled BOOLEAN DEFAULT true,
    priority INTEGER DEFAULT 1,
    monthly_budget NUMERIC(12,2),
    monthly_spent NUMERIC(12,2) DEFAULT 0,
    requests_this_month INTEGER DEFAULT 0,
    health_status VARCHAR(30) DEFAULT 'unknown',
    preferred_model_for_code VARCHAR(100),
    preferred_model_for_reasoning VARCHAR(100),
    preferred_model_for_fast VARCHAR(100),
    preferred_model_for_hebrew VARCHAR(100),
    last_health_check TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  )`);
  await execCatch(`INSERT INTO ai_provider_settings (provider, is_enabled, priority, preferred_model_for_code, preferred_model_for_reasoning, preferred_model_for_fast, preferred_model_for_hebrew)
    VALUES 
      ('claude', true, 1, 'claude-sonnet-4-6', 'claude-sonnet-4-6', 'claude-haiku-4-5', 'claude-haiku-4-5'),
      ('openai', true, 2, 'gpt-5.2', 'gpt-5.2', 'gpt-5-mini', 'gpt-5-mini'),
      ('gemini', true, 3, 'gemini-3-flash-preview', 'gemini-3.1-pro-preview', 'gemini-2.5-flash', 'gemini-2.5-flash'),
      ('kimi', true, 4, 'moonshot-v1-32k', 'kimi-k2.5', 'moonshot-v1-8k', 'kimi-k2.5')
    ON CONFLICT (provider) DO NOTHING`);
  logger.info("[Migrations] ai_provider_settings table ensured");

  // ML Training Pipeline tables
  await execCatch(`CREATE TABLE IF NOT EXISTS ml_training_jobs (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    job_type VARCHAR(100) NOT NULL,
    status VARCHAR(30) DEFAULT 'pending',
    dataset_config JSONB DEFAULT '{}',
    model_config JSONB DEFAULT '{}',
    metrics JSONB DEFAULT '{}',
    progress_pct NUMERIC(5,2) DEFAULT 0,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    error_message TEXT,
    artifact_path TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  )`);
  await execCatch(`CREATE TABLE IF NOT EXISTS ml_deployed_models (
    id SERIAL PRIMARY KEY,
    job_id INTEGER REFERENCES ml_training_jobs(id) ON DELETE SET NULL,
    name VARCHAR(255) NOT NULL,
    model_type VARCHAR(100),
    version VARCHAR(50),
    artifact_path TEXT,
    metrics JSONB DEFAULT '{}',
    prediction_count INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    deployed_at TIMESTAMP DEFAULT NOW(),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  )`);
  logger.info("[Migrations] ML training pipeline tables ensured");

  // Task-398: Normalize platform_modules statuses.
  // 1. Publish known in-use ERP draft modules by slug — these are ready for use
  //    and should be visible to system users. Slugs listed are the core ERP modules.
  await execCatch(`
    UPDATE platform_modules
    SET status = 'published', updated_at = NOW()
    WHERE status = 'draft'
      AND slug IN (
        'customers', 'inventory', 'procurement', 'finance', 'hr', 'sales',
        'production', 'installers', 'documents', 'imports', 'projects',
        'approvals', 'field-measurements', 'meetings', 'crm', 'crm-advanced',
        'logistics', 'quality', 'safety', 'bi', 'ai-builder', 'communication'
      )
  `);
  logger.info("[Migrations] Task-398: published in-use ERP draft platform_modules");
  // 2. Publish legacy 'active' ERP modules — 'active' is not a valid status
  //    (valid statuses: draft | published | archived). These are already in use.
  await execCatch(`
    UPDATE platform_modules
    SET status = 'published', updated_at = NOW()
    WHERE status = 'active'
  `);
  logger.info("[Migrations] Task-398: published legacy 'active' platform_modules");
  // 3. Archive empty draft modules (no entities) — these are unused and should not
  //    appear in the draft count or be published.
  await execCatch(`
    UPDATE platform_modules
    SET status = 'archived', updated_at = NOW()
    WHERE status = 'draft'
      AND id NOT IN (
        SELECT DISTINCT module_id FROM module_entities WHERE module_id IS NOT NULL
      )
  `);
  logger.info("[Migrations] Task-398: archived empty draft platform_modules");

  // Task-419: Fix CUS-2026-0001 corrupted record + enforce NOT NULL on customers.name
  // Step 1: Fix any existing rows with empty/null name before adding constraint
  await execCatch(`
    UPDATE customers
    SET name = 'לקוח ללא שם (' || COALESCE(customer_number, id::text) || ')'
    WHERE name IS NULL OR TRIM(name) = ''
  `);
  logger.info("[Migrations] Task-419: patched empty customer name rows");

  // Step 2: Enforce NOT NULL on name at DB level (safe — all nulls already patched)
  await execCatch(`ALTER TABLE customers ALTER COLUMN name SET NOT NULL`);
  logger.info("[Migrations] Task-419: customers.name NOT NULL constraint applied");

  // Step 3: Delete CUS-2026-0001 if it has no linked records (corrupted empty-name record)
  // Use a DO block so we can check table existence before querying linked records
  await execCatch(`
    DO $$
    DECLARE
      v_cust_id INTEGER;
      v_linked  BIGINT := 0;
    BEGIN
      SELECT id INTO v_cust_id
        FROM customers
       WHERE customer_number = 'CUS-2026-0001'
         AND (name LIKE 'לקוח ללא שם%' OR TRIM(name) = '')
       LIMIT 1;
      IF v_cust_id IS NULL THEN RETURN; END IF;

      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'orders' AND table_schema = 'public') THEN
        SELECT COUNT(*) INTO v_linked FROM orders WHERE customer_id = v_cust_id LIMIT 1;
      END IF;
      IF v_linked = 0 AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'invoices' AND table_schema = 'public') THEN
        SELECT COUNT(*) INTO v_linked FROM invoices WHERE customer_id = v_cust_id LIMIT 1;
      END IF;

      IF v_linked = 0 THEN
        DELETE FROM customers WHERE id = v_cust_id;
      END IF;
    END $$
  `);
  logger.info("[Migrations] Task-419: CUS-2026-0001 cleanup complete");

  // Task-467: Restore username kobie4kayam
  await execCatch(`
    UPDATE users SET username = 'kobie4kayam'
    WHERE username = 'kobiellkayam'
  `);
  logger.info("[Migrations] Task-467: username kobie4kayam restored if needed");

  // Task-473: Create packing_lists_v2 for shipping-freight module
  await execCatch(`CREATE TABLE IF NOT EXISTS packing_lists_v2 (
    id SERIAL PRIMARY KEY,
    packing_number TEXT NOT NULL,
    delivery_id INTEGER,
    order_id INTEGER,
    customer_name TEXT,
    delivery_address TEXT,
    container_type TEXT DEFAULT '20GP',
    container_dimensions_l NUMERIC DEFAULT 590,
    container_dimensions_w NUMERIC DEFAULT 235,
    container_dimensions_h NUMERIC DEFAULT 239,
    items JSONB DEFAULT '[]',
    total_weight NUMERIC DEFAULT 0,
    total_volume NUMERIC DEFAULT 0,
    utilization_pct NUMERIC DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'draft',
    notes TEXT,
    created_by TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  )`);
  logger.info("[Migrations] Task-473: packing_lists_v2 ensured");

  await execCatch(`CREATE TABLE IF NOT EXISTS freight_calculations (
    id SERIAL PRIMARY KEY,
    shipment_ref TEXT,
    carrier_id INTEGER,
    carrier_name TEXT,
    weight_kg NUMERIC DEFAULT 0,
    volume_cbm NUMERIC DEFAULT 0,
    distance_km NUMERIC DEFAULT 0,
    base_rate NUMERIC DEFAULT 0,
    fuel_surcharge NUMERIC DEFAULT 0,
    handling_fee NUMERIC DEFAULT 0,
    calculated_cost NUMERIC DEFAULT 0,
    currency TEXT DEFAULT 'ILS',
    comparison_group_id TEXT,
    is_selected BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW()
  )`);
  await execCatch(`CREATE TABLE IF NOT EXISTS customs_documents (
    id SERIAL PRIMARY KEY,
    doc_number TEXT NOT NULL,
    shipment_id INTEGER, shipment_ref TEXT,
    doc_type TEXT DEFAULT 'commercial_invoice',
    exporter_name TEXT, exporter_address TEXT, exporter_tax_id TEXT,
    importer_name TEXT, importer_address TEXT,
    country_of_origin TEXT, country_of_destination TEXT, incoterms TEXT,
    port_of_loading TEXT, port_of_discharge TEXT,
    commercial_invoice_data JSONB DEFAULT '{}',
    packing_list_data JSONB DEFAULT '{}',
    certificate_of_origin_data JSONB DEFAULT '{}',
    hs_codes JSONB DEFAULT '[]',
    customs_value NUMERIC DEFAULT 0, currency TEXT DEFAULT 'ILS',
    total_weight NUMERIC DEFAULT 0, total_packages INTEGER DEFAULT 0,
    declaration_text TEXT,
    status TEXT DEFAULT 'draft', issued_date DATE, notes TEXT, created_by TEXT,
    created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW()
  )`);
  await execCatch(`CREATE TABLE IF NOT EXISTS freight_audit (
    id SERIAL PRIMARY KEY,
    audit_number TEXT NOT NULL,
    carrier_invoice_id TEXT, carrier_id INTEGER, carrier_name TEXT,
    shipment_ref TEXT, shipment_id INTEGER, invoice_date DATE,
    invoice_amount NUMERIC DEFAULT 0, expected_amount NUMERIC DEFAULT 0,
    discrepancy_amount NUMERIC DEFAULT 0, discrepancy_pct NUMERIC DEFAULT 0,
    currency TEXT DEFAULT 'ILS', discrepancy_threshold NUMERIC DEFAULT 5,
    is_flagged BOOLEAN DEFAULT false, dispute_status TEXT DEFAULT 'none',
    resolution_notes TEXT, savings_realized NUMERIC DEFAULT 0,
    rate_details JSONB DEFAULT '{}', invoice_details JSONB DEFAULT '{}',
    created_by TEXT, status TEXT DEFAULT 'pending', notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW()
  )`);
  logger.info("[Migrations] Task-473: shipping-freight tables ensured");

  // Task-473: Model sync & data integrity fixes
  // 1. Add soft-delete support to sales_customers (the canonical sales customer table)
  await execCatch(`ALTER TABLE sales_customers ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ`);
  logger.info("[Migrations] Task-473: sales_customers.deleted_at added for soft-delete support");

  // 2. Add indexes to improve FK lookup performance on sales_orders.customer_id
  await execCatch(`CREATE INDEX IF NOT EXISTS idx_sales_orders_customer_id ON sales_orders(customer_id)`);
  await execCatch(`CREATE INDEX IF NOT EXISTS idx_sales_customers_status ON sales_customers(status) WHERE deleted_at IS NULL`);
  await execCatch(`CREATE INDEX IF NOT EXISTS idx_sales_customers_customer_number ON sales_customers(customer_number)`);
  await execCatch(`CREATE INDEX IF NOT EXISTS idx_sales_order_lines_order_id ON sales_order_lines(order_id)`);
  await execCatch(`CREATE INDEX IF NOT EXISTS idx_sales_invoices_customer_id ON sales_invoices(customer_id)`);
  await execCatch(`CREATE INDEX IF NOT EXISTS idx_sales_invoices_sales_order_id ON sales_invoices(sales_order_id)`);
  logger.info("[Migrations] Task-473: FK indexes created on sales_orders/sales_invoices/sales_order_lines");

  // 3. Orphan detection and cleanup: nullify sales_orders.customer_id where referenced sales_customers no longer exists
  await execCatch(`
    UPDATE sales_orders
    SET customer_id = NULL
    WHERE customer_id IS NOT NULL
      AND customer_id NOT IN (SELECT id FROM sales_customers WHERE deleted_at IS NULL)
  `);
  logger.info("[Migrations] Task-473: Orphan sales_orders.customer_id references cleaned up");

  // 4. Orphan detection: nullify sales_order_lines.order_id where referenced sales_orders no longer exists
  await execCatch(`
    UPDATE sales_order_lines
    SET order_id = NULL
    WHERE order_id IS NOT NULL
      AND order_id NOT IN (SELECT id FROM sales_orders)
  `);
  logger.info("[Migrations] Task-473: Orphan sales_order_lines.order_id references cleaned up");

  // 5. Orphan detection: nullify sales_invoices referencing missing sales_orders
  await execCatch(`
    UPDATE sales_invoices
    SET sales_order_id = NULL
    WHERE sales_order_id IS NOT NULL
      AND sales_order_id NOT IN (SELECT id FROM sales_orders)
  `);
  logger.info("[Migrations] Task-473: Orphan sales_invoices.sales_order_id references cleaned up");

  // 6. Sync rule fix: update existing lead_converted_to_customer rule to target sales_customers
  await execCatch(`
    UPDATE data_flow_rules
    SET target_table = 'sales_customers',
        notes = 'כשליד הומר, נוצרת רשומת לקוח חדשה ב-sales_customers (טבלת הלקוחות המרכזית)',
        updated_at = NOW()
    WHERE rule_name = 'lead_converted_to_customer'
      AND target_table = 'customers'
  `);
  logger.info("[Migrations] Task-473: data_flow_rules lead_converted_to_customer updated to target sales_customers");

  // 7. Patch NULL/empty status values in sales_customers
  await execCatch(`
    UPDATE sales_customers SET status = 'active' WHERE status IS NULL OR status = ''
  `);
  logger.info("[Migrations] Task-473: sales_customers null status values patched to active");

  // 8. Add a view for unified customer lookup across both tables (backward compat)
  //    sales_customers uses 'name'; customers table also uses 'name' (per Task-419 NOT NULL on name)
  await execCatch(`
    CREATE OR REPLACE VIEW v_all_customers AS
    SELECT
      id,
      customer_number,
      name AS customer_name,
      email,
      phone,
      address,
      city,
      status,
      'sales_customers' AS source_table,
      created_at,
      updated_at
    FROM sales_customers
    WHERE deleted_at IS NULL
    UNION ALL
    SELECT
      id,
      customer_number,
      name AS customer_name,
      email,
      phone,
      address,
      city,
      status,
      'customers' AS source_table,
      created_at,
      updated_at
    FROM customers
    WHERE deleted_at IS NULL
  `);
  logger.info("[Migrations] Task-473: v_all_customers unified view created");

  // 9. Ensure sales_orders.total_amount column exists (many routes use total_amount, schema has total)
  await execCatch(`ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS total_amount NUMERIC(15,2) DEFAULT 0`);
  await execCatch(`
    UPDATE sales_orders
    SET total_amount = total
    WHERE (total_amount IS NULL OR total_amount = 0) AND total IS NOT NULL AND total > 0
  `);
  await execCatch(`
    UPDATE sales_orders
    SET total = total_amount
    WHERE (total IS NULL OR total = 0) AND total_amount IS NOT NULL AND total_amount > 0
  `);
  logger.info("[Migrations] Task-473: sales_orders.total_amount column ensured and backfilled from total");

  // 10. Ensure sales_orders has deleted_at for soft-delete (used in sales-pricing-enterprise.ts)
  await execCatch(`ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ`);
  logger.info("[Migrations] Task-473: sales_orders.deleted_at added for soft-delete support");

  // 11. Ensure sales_customers has source_lead_id for lead→customer conversion tracking
  await execCatch(`ALTER TABLE sales_customers ADD COLUMN IF NOT EXISTS source_lead_id INTEGER`);
  logger.info("[Migrations] Task-473: sales_customers.source_lead_id added for lead conversion tracking");

  // 12. FK constraints: add real FK constraint from sales_orders.customer_id → sales_customers.id
  //     Use DO NOTHING on constraint-already-exists (idempotent)
  await execCatch(`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'fk_sales_orders_customer'
          AND conrelid = 'sales_orders'::regclass
      ) THEN
        ALTER TABLE sales_orders
          ADD CONSTRAINT fk_sales_orders_customer
          FOREIGN KEY (customer_id) REFERENCES sales_customers(id)
          ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;
      END IF;
    END $$
  `);
  logger.info("[Migrations] Task-473: FK constraint fk_sales_orders_customer ensured");

  // 13. FK constraints: sales_order_lines.order_id → sales_orders.id
  await execCatch(`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'fk_sales_order_lines_order'
          AND conrelid = 'sales_order_lines'::regclass
      ) THEN
        ALTER TABLE sales_order_lines
          ADD CONSTRAINT fk_sales_order_lines_order
          FOREIGN KEY (order_id) REFERENCES sales_orders(id)
          ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED;
      END IF;
    END $$
  `);
  logger.info("[Migrations] Task-473: FK constraint fk_sales_order_lines_order ensured");

  // 14. FK constraints: sales_invoices.sales_order_id → sales_orders.id
  await execCatch(`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'fk_sales_invoices_sales_order'
          AND conrelid = 'sales_invoices'::regclass
      ) THEN
        ALTER TABLE sales_invoices
          ADD CONSTRAINT fk_sales_invoices_sales_order
          FOREIGN KEY (sales_order_id) REFERENCES sales_orders(id)
          ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;
      END IF;
    END $$
  `);
  logger.info("[Migrations] Task-473: FK constraint fk_sales_invoices_sales_order ensured");

  // 15. FK constraints: sales_invoices.customer_id → sales_customers.id
  await execCatch(`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'fk_sales_invoices_customer'
          AND conrelid = 'sales_invoices'::regclass
      ) THEN
        ALTER TABLE sales_invoices
          ADD CONSTRAINT fk_sales_invoices_customer
          FOREIGN KEY (customer_id) REFERENCES sales_customers(id)
          ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;
      END IF;
    END $$
  `);
  logger.info("[Migrations] Task-473: FK constraint fk_sales_invoices_customer ensured");

  // 16. Compatibility alias: ensure sales_order_items table has same data as sales_order_lines
  //     (if sales_order_items exists as a table, we add columns to match; if not, create view)
  //     First check if it's a table and create as view only if it doesn't exist as a table
  await execCatch(`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relname = 'sales_order_items'
          AND n.nspname = 'public'
          AND c.relkind IN ('r', 'v', 'm')
      ) THEN
        EXECUTE 'CREATE VIEW sales_order_items AS
          SELECT id, order_id, product_name, description, quantity, unit_price,
                 discount_percent, line_total, sort_order
          FROM sales_order_lines';
      END IF;
    END $$
  `);
  logger.info("[Migrations] Task-473: sales_order_items compat view created over sales_order_lines");

  // 17. Sync rule table name updates: fix customer_invoices → sales_invoices, cash_flow → cash_flow_records
  await execCatch(`
    UPDATE data_flow_rules
    SET target_table = 'sales_invoices', updated_at = NOW()
    WHERE target_table = 'customer_invoices'
  `);
  await execCatch(`
    UPDATE data_flow_rules
    SET source_table = 'sales_invoices', updated_at = NOW()
    WHERE source_table = 'customer_invoices'
  `);
  await execCatch(`
    UPDATE data_flow_rules
    SET target_table = 'cash_flow_records', updated_at = NOW()
    WHERE target_table = 'cash_flow'
  `);
  await execCatch(`
    UPDATE data_flow_rules
    SET target_table = 'customer_payments', updated_at = NOW()
    WHERE target_table = 'customer_balances'
  `);
  logger.info("[Migrations] Task-473: data_flow_rules table name corrections applied");

  await ensureTable("api_connections", `CREATE TABLE IF NOT EXISTS api_connections (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    base_url TEXT NOT NULL,
    auth_type VARCHAR(50) DEFAULT 'none',
    auth_config JSONB,
    headers JSONB,
    category VARCHAR(100) DEFAULT 'general',
    method VARCHAR(10) DEFAULT 'GET',
    health_endpoint VARCHAR(500),
    is_active BOOLEAN DEFAULT true,
    timeout_ms INTEGER DEFAULT 30000,
    retry_count INTEGER DEFAULT 3,
    rate_limit_rpm INTEGER DEFAULT 60,
    last_test_at TIMESTAMP,
    last_test_status VARCHAR(50),
    last_test_latency_ms INTEGER,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  )`);
  logger.info("[Migrations] api_connections table ensured");

  await ensureTable("api_connection_logs", `CREATE TABLE IF NOT EXISTS api_connection_logs (
    id SERIAL PRIMARY KEY,
    connection_id INTEGER REFERENCES api_connections(id) ON DELETE CASCADE,
    action VARCHAR(50) NOT NULL,
    status VARCHAR(50),
    latency_ms INTEGER,
    response_code INTEGER,
    details TEXT,
    created_at TIMESTAMP DEFAULT NOW()
  )`);
  await execDirect(`CREATE INDEX IF NOT EXISTS idx_api_conn_logs_conn ON api_connection_logs(connection_id, created_at DESC)`);
  logger.info("[Migrations] api_connection_logs table ensured");

  await ensureTable("integration_services", `CREATE TABLE IF NOT EXISTS integration_services (
    id SERIAL PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    type VARCHAR(50) NOT NULL DEFAULT 'api',
    category VARCHAR(100),
    base_url VARCHAR(1000),
    auth_type VARCHAR(50) DEFAULT 'none',
    auth_config JSONB DEFAULT '{}',
    health_endpoint VARCHAR(500),
    webhook_url VARCHAR(1000),
    status VARCHAR(30) DEFAULT 'disconnected',
    last_check_at TIMESTAMP,
    last_check_latency_ms INTEGER,
    last_error TEXT,
    auto_fix_enabled BOOLEAN DEFAULT true,
    fix_attempts INTEGER DEFAULT 0,
    metadata JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  )`);
  logger.info("[Migrations] integration_services table ensured");

  await ensureTable("integration_webhooks", `CREATE TABLE IF NOT EXISTS integration_webhooks (
    id SERIAL PRIMARY KEY,
    service_id INTEGER REFERENCES integration_services(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    url VARCHAR(1000) NOT NULL,
    method VARCHAR(10) DEFAULT 'POST',
    headers JSONB DEFAULT '{}',
    payload_template JSONB DEFAULT '{}',
    event_type VARCHAR(100),
    is_active BOOLEAN DEFAULT true,
    last_triggered_at TIMESTAMP,
    last_status VARCHAR(30),
    last_response_code INTEGER,
    trigger_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  )`);
  logger.info("[Migrations] integration_webhooks table ensured");

  await ensureTable("integration_events", `CREATE TABLE IF NOT EXISTS integration_events (
    id SERIAL PRIMARY KEY,
    service_id INTEGER REFERENCES integration_services(id) ON DELETE SET NULL,
    webhook_id INTEGER REFERENCES integration_webhooks(id) ON DELETE SET NULL,
    event_type VARCHAR(100) NOT NULL,
    direction VARCHAR(10) DEFAULT 'outgoing',
    status VARCHAR(30) DEFAULT 'pending',
    payload JSONB DEFAULT '{}',
    response JSONB DEFAULT '{}',
    response_code INTEGER,
    latency_ms INTEGER,
    error TEXT,
    retry_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
  )`);
  await execDirect(`CREATE INDEX IF NOT EXISTS idx_integration_events_svc ON integration_events(service_id, created_at DESC)`);
  await execDirect(`CREATE INDEX IF NOT EXISTS idx_integration_events_type ON integration_events(event_type, created_at DESC)`);
  logger.info("[Migrations] integration_events table ensured");

  await ensureTable("integration_autofix_log", `CREATE TABLE IF NOT EXISTS integration_autofix_log (
    id SERIAL PRIMARY KEY,
    service_id INTEGER REFERENCES integration_services(id) ON DELETE CASCADE,
    issue VARCHAR(500) NOT NULL,
    fix_action VARCHAR(500) NOT NULL,
    fix_result VARCHAR(30) DEFAULT 'pending',
    details JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW()
  )`);
  logger.info("[Migrations] integration_autofix_log table ensured");

  await execDirect(`ALTER TABLE integration_webhooks ADD COLUMN IF NOT EXISTS unique_id VARCHAR(100)`);
  await execDirect(`ALTER TABLE integration_webhooks ADD COLUMN IF NOT EXISTS secret VARCHAR(500)`);
  await execDirect(`ALTER TABLE integration_webhooks ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 3`);
  await execDirect(`CREATE UNIQUE INDEX IF NOT EXISTS idx_integration_webhooks_uid ON integration_webhooks(unique_id) WHERE unique_id IS NOT NULL`);
  await execDirect(`ALTER TABLE integration_webhooks ALTER COLUMN connection_id DROP NOT NULL`);
  await execDirect(`DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='integration_webhooks' AND column_name='slug') THEN EXECUTE 'ALTER TABLE integration_webhooks ALTER COLUMN slug DROP NOT NULL'; END IF; END $$`);
  await execDirect(`DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='integration_webhooks' AND column_name='service_id') THEN EXECUTE 'ALTER TABLE integration_webhooks ALTER COLUMN service_id DROP NOT NULL'; END IF; END $$`);
  await execDirect(`DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='integration_webhooks' AND column_name='url') THEN EXECUTE 'ALTER TABLE integration_webhooks ALTER COLUMN url DROP NOT NULL'; END IF; END $$`);
  await execDirect(`ALTER TABLE integration_webhooks ADD COLUMN IF NOT EXISTS webhook_url VARCHAR(1000)`);
  logger.info("[Migrations] integration_webhooks columns extended (unique_id, secret, retry_count, nullable connection_id, webhook_url)");

  await execDirect(`CREATE TABLE IF NOT EXISTS webhook_logs (id SERIAL PRIMARY KEY, webhook_id INTEGER, webhook_name VARCHAR(255), payload JSONB, response_status INTEGER, response_body TEXT, latency_ms INTEGER, error TEXT, created_at TIMESTAMP DEFAULT NOW())`);
  await execDirect(`CREATE TABLE IF NOT EXISTS mcp_calls (id SERIAL PRIMARY KEY, tool VARCHAR(255) NOT NULL, params JSONB, result JSONB, status VARCHAR(50) DEFAULT 'success', duration_ms INTEGER, user_id INTEGER, created_at TIMESTAMP DEFAULT NOW())`);
  await execDirect(`CREATE INDEX IF NOT EXISTS idx_webhook_logs_webhook_id ON webhook_logs(webhook_id)`);
  await execDirect(`CREATE INDEX IF NOT EXISTS idx_webhook_logs_created_at ON webhook_logs(created_at DESC)`);
  await execDirect(`CREATE INDEX IF NOT EXISTS idx_mcp_calls_tool ON mcp_calls(tool)`);
  await execDirect(`CREATE INDEX IF NOT EXISTS idx_mcp_calls_created_at ON mcp_calls(created_at DESC)`);
  logger.info("[Migrations] webhook_logs and mcp_calls tables created");

  await execDirect(`ALTER TABLE project_tasks ADD COLUMN IF NOT EXISTS parent_task_id integer REFERENCES project_tasks(id)`);
  await execDirect(`ALTER TABLE project_tasks ADD COLUMN IF NOT EXISTS wbs_code varchar(50)`);
  await execDirect(`ALTER TABLE project_tasks ADD COLUMN IF NOT EXISTS sort_order integer DEFAULT 0`);
  await execDirect(`ALTER TABLE project_tasks ADD COLUMN IF NOT EXISTS estimated_hours numeric DEFAULT 0`);
  await execDirect(`ALTER TABLE project_tasks ADD COLUMN IF NOT EXISTS actual_hours numeric DEFAULT 0`);
  await execDirect(`ALTER TABLE project_tasks ADD COLUMN IF NOT EXISTS tags text`);
  await execDirect(`ALTER TABLE project_tasks ADD COLUMN IF NOT EXISTS duration integer`);
  await execDirect(`ALTER TABLE project_tasks ADD COLUMN IF NOT EXISTS planned_start timestamp`);
  await execDirect(`ALTER TABLE project_tasks ADD COLUMN IF NOT EXISTS planned_end timestamp`);
  await execDirect(`ALTER TABLE project_tasks ADD COLUMN IF NOT EXISTS actual_start timestamp`);
  await execDirect(`ALTER TABLE project_tasks ADD COLUMN IF NOT EXISTS actual_end timestamp`);
  await execDirect(`ALTER TABLE project_tasks ADD COLUMN IF NOT EXISTS is_milestone boolean DEFAULT false`);
  logger.info("[Migrations] project_tasks columns extended for MCP create_task support");

  logger.info("[Migrations] GPS saved locations and location shares tables");
  await execDirect(`CREATE TABLE IF NOT EXISTS gps_saved_locations (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'other',
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    address TEXT,
    notes TEXT,
    icon TEXT,
    color TEXT,
    is_favorite BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);
  await execDirect(`CREATE INDEX IF NOT EXISTS idx_gps_saved_locations_user ON gps_saved_locations(user_id)`);

  await execDirect(`CREATE TABLE IF NOT EXISTS gps_location_shares (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    share_code VARCHAR(12) NOT NULL UNIQUE,
    name TEXT,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    address TEXT,
    expires_at TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT TRUE,
    view_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);
  await execDirect(`CREATE INDEX IF NOT EXISTS idx_gps_location_shares_code ON gps_location_shares(share_code)`);

  await execCatch(`ALTER TABLE users ADD COLUMN IF NOT EXISTS gps_enabled BOOLEAN NOT NULL DEFAULT TRUE`);
  await execCatch(`ALTER TABLE users ADD COLUMN IF NOT EXISTS gps_device_id TEXT`);
  logger.info("[Migrations] users.gps_enabled and users.gps_device_id columns ensured");

  await ensureTable("user_gps_status", `CREATE TABLE IF NOT EXISTS user_gps_status (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    last_latitude DOUBLE PRECISION,
    last_longitude DOUBLE PRECISION,
    last_accuracy DOUBLE PRECISION,
    last_speed DOUBLE PRECISION,
    last_battery_level DOUBLE PRECISION,
    last_heading DOUBLE PRECISION,
    last_altitude DOUBLE PRECISION,
    last_address TEXT,
    last_ping_at TIMESTAMPTZ,
    total_pings INTEGER DEFAULT 0,
    total_distance_km DOUBLE PRECISION DEFAULT 0,
    is_moving BOOLEAN DEFAULT FALSE,
    status TEXT DEFAULT 'idle',
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);
  await execDirect(`CREATE INDEX IF NOT EXISTS idx_user_gps_status_user ON user_gps_status(user_id)`);
  logger.info("[Migrations] user_gps_status table ensured");

  logger.info("startup_migrations_complete", { steps_completed: _migrationStep, total: MIGRATION_TOTAL });
}
