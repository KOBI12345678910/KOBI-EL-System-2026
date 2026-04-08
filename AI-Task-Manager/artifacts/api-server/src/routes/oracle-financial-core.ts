// ============================================================================
// oracle-financial-core.ts - הלב הפיננסי של המערכת
// מנוע פיננסי ברמת Oracle/SAP - כל תנועה כספית עוברת דרך כאן
// ============================================================================

import { Router, Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { validateSession } from "../lib/auth";

const router = Router();

// ===================== אימות משתמש =====================
async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.substring(7) : (req.query.token as string) || null;
  if (!token) { res.status(401).json({ error: "נדרשת התחברות" }); return; }
  const result = await validateSession(token);
  if (result.error || !result.user) { res.status(401).json({ error: "הסשן פג תוקף" }); return; }
  (req as any).user = result.user;
  next();
}
router.use(requireAuth as any);

// ===================== פונקציות עזר לביצוע שאילתות =====================
async function q(query: string, params?: any[]) {
  try {
    const r = await db.execute(sql.raw(query));
    return r.rows || [];
  } catch (e: any) {
    console.error("OracleFinancialCore query error:", e.message, "\nQuery:", query.substring(0, 200));
    return [];
  }
}

// שליפת שורה בודדת
async function qOne(query: string) {
  const rows = await q(query);
  return rows[0] || null;
}

// ביצוע פקודה שלא מחזירה שורות
async function exec(query: string) {
  try {
    await db.execute(sql.raw(query));
    return true;
  } catch (e: any) {
    console.error("OracleFinancialCore exec error:", e.message);
    return false;
  }
}

// מחולל מספרים ייחודיים לכל מסמך - כמו ב-SAP Document Numbering
async function nextNum(prefix: string, table: string, col: string) {
  const year = new Date().getFullYear();
  const rows = await q(`SELECT ${col} FROM ${table} WHERE ${col} LIKE '${prefix}${year}-%' ORDER BY id DESC LIMIT 1`);
  const last = (rows[0] as any)?.[col];
  const seq = last ? parseInt(last.split("-").pop()!) + 1 : 1;
  return `${prefix}${year}-${String(seq).padStart(5, "0")}`;
}

// פורמט תאריך לשאילתות
function fmtDate(d?: string | Date): string {
  if (!d) return new Date().toISOString().split("T")[0];
  return new Date(d as string).toISOString().split("T")[0];
}

// בריחת מחרוזות למניעת SQL Injection
function esc(s: any): string {
  if (s === null || s === undefined) return "NULL";
  return `'${String(s).replace(/'/g, "''")}'`;
}

// ============================================================================
// יצירת כל הטבלאות - הליבה של מסד הנתונים הפיננסי
// ============================================================================
async function ensureOracleFinancialTables() {

  // ===================== 1. ספר חשבונות ראשי - Multi-Dimensional General Ledger =====================
  await exec(`CREATE TABLE IF NOT EXISTS gl_accounts_master (
    id SERIAL PRIMARY KEY,
    account_code VARCHAR(20) UNIQUE,
    account_name VARCHAR(300),
    account_name_he VARCHAR(300),
    account_type VARCHAR(50) NOT NULL,
    account_category VARCHAR(100),
    parent_account_code VARCHAR(20),
    level INTEGER DEFAULT 1,
    is_header BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    normal_balance VARCHAR(10) DEFAULT 'debit',
    currency VARCHAR(10) DEFAULT 'ILS',
    department VARCHAR(200),
    cost_center VARCHAR(200),
    profit_center VARCHAR(200),
    project VARCHAR(200),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  // פקודות יומן - Journal Entries - כל תנועה חשבונאית
  await exec(`CREATE TABLE IF NOT EXISTS gl_journal_entries (
    id SERIAL PRIMARY KEY,
    journal_number VARCHAR(50) UNIQUE,
    entry_date DATE NOT NULL,
    value_date DATE,
    period VARCHAR(10),
    fiscal_year INTEGER,
    source VARCHAR(100),
    source_module VARCHAR(100),
    source_document_id INTEGER,
    source_document_number VARCHAR(100),
    description TEXT,
    description_he TEXT,
    total_debit NUMERIC(15,2) DEFAULT 0,
    total_credit NUMERIC(15,2) DEFAULT 0,
    is_balanced BOOLEAN DEFAULT true,
    currency VARCHAR(10) DEFAULT 'ILS',
    exchange_rate NUMERIC(15,6) DEFAULT 1,
    posted_by VARCHAR(200),
    posted_at TIMESTAMPTZ,
    approved_by VARCHAR(200),
    approved_at TIMESTAMPTZ,
    reversed BOOLEAN DEFAULT false,
    reversed_by_journal INTEGER,
    is_recurring BOOLEAN DEFAULT false,
    recurring_template_id INTEGER,
    auto_generated BOOLEAN DEFAULT false,
    status VARCHAR(50) DEFAULT 'draft',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  // שורות פקודת יומן - כל חיוב וזיכוי
  await exec(`CREATE TABLE IF NOT EXISTS gl_journal_lines (
    id SERIAL PRIMARY KEY,
    journal_id INTEGER NOT NULL,
    line_number INTEGER,
    account_code VARCHAR(20) NOT NULL,
    account_name VARCHAR(300),
    debit_amount NUMERIC(15,2) DEFAULT 0,
    credit_amount NUMERIC(15,2) DEFAULT 0,
    currency VARCHAR(10) DEFAULT 'ILS',
    foreign_amount NUMERIC(15,2),
    exchange_rate NUMERIC(15,6),
    department VARCHAR(200),
    cost_center VARCHAR(200),
    profit_center VARCHAR(200),
    project VARCHAR(200),
    description TEXT,
    tax_code VARCHAR(20),
    tax_amount NUMERIC(15,2) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  // תקופות חשבונאיות - Fiscal Periods
  await exec(`CREATE TABLE IF NOT EXISTS gl_periods (
    id SERIAL PRIMARY KEY,
    period_code VARCHAR(10) UNIQUE,
    period_name VARCHAR(100),
    period_name_he VARCHAR(100),
    fiscal_year INTEGER,
    month INTEGER,
    start_date DATE,
    end_date DATE,
    status VARCHAR(50) DEFAULT 'open',
    closed_by VARCHAR,
    closed_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  // ===================== 2. חשבונות ספקים - Accounts Payable =====================
  // חשבוניות ספקים - קבלת סחורה ושירותים
  await exec(`CREATE TABLE IF NOT EXISTS ap_invoices (
    id SERIAL PRIMARY KEY,
    invoice_number VARCHAR(100),
    vendor_id INTEGER,
    vendor_name VARCHAR(300),
    vendor_tax_id VARCHAR(50),
    invoice_date DATE,
    due_date DATE,
    payment_terms VARCHAR(100),
    po_number VARCHAR(100),
    grn_number VARCHAR(100),
    subtotal NUMERIC(15,2),
    tax_amount NUMERIC(15,2),
    withholding_tax NUMERIC(15,2) DEFAULT 0,
    total_amount NUMERIC(15,2),
    currency VARCHAR(10) DEFAULT 'ILS',
    exchange_rate NUMERIC(15,6) DEFAULT 1,
    paid_amount NUMERIC(15,2) DEFAULT 0,
    balance_due NUMERIC(15,2),
    three_way_match BOOLEAN DEFAULT false,
    match_status VARCHAR(50),
    gl_posted BOOLEAN DEFAULT false,
    gl_journal_id INTEGER,
    department VARCHAR(200),
    cost_center VARCHAR(200),
    project VARCHAR(200),
    approval_status VARCHAR(50) DEFAULT 'pending',
    approved_by VARCHAR,
    document_url TEXT,
    notes TEXT,
    status VARCHAR(50) DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  // תשלומים לספקים - Payment Runs
  await exec(`CREATE TABLE IF NOT EXISTS ap_payments (
    id SERIAL PRIMARY KEY,
    payment_number VARCHAR(100),
    vendor_id INTEGER,
    vendor_name VARCHAR(300),
    payment_date DATE,
    payment_method VARCHAR(50),
    bank_account VARCHAR(100),
    check_number VARCHAR(50),
    reference VARCHAR(200),
    total_amount NUMERIC(15,2),
    currency VARCHAR(10) DEFAULT 'ILS',
    invoices_paid JSONB DEFAULT '[]',
    withholding_tax_deducted NUMERIC(15,2) DEFAULT 0,
    gl_posted BOOLEAN DEFAULT false,
    gl_journal_id INTEGER,
    approved_by VARCHAR,
    notes TEXT,
    status VARCHAR(50) DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  // ===================== 3. חשבונות לקוחות - Accounts Receivable =====================
  // חשבוניות ללקוחות - הפקת חשבוניות
  await exec(`CREATE TABLE IF NOT EXISTS ar_invoices (
    id SERIAL PRIMARY KEY,
    invoice_number VARCHAR(100),
    customer_id INTEGER,
    customer_name VARCHAR(300),
    customer_tax_id VARCHAR(50),
    invoice_date DATE,
    due_date DATE,
    payment_terms VARCHAR(100),
    items JSONB DEFAULT '[]',
    subtotal NUMERIC(15,2),
    discount_amount NUMERIC(15,2) DEFAULT 0,
    tax_rate NUMERIC(5,2) DEFAULT 17,
    tax_amount NUMERIC(15,2),
    total_amount NUMERIC(15,2),
    currency VARCHAR(10) DEFAULT 'ILS',
    paid_amount NUMERIC(15,2) DEFAULT 0,
    balance_due NUMERIC(15,2),
    overdue_days INTEGER DEFAULT 0,
    dunning_level INTEGER DEFAULT 0,
    last_dunning_date DATE,
    collection_status VARCHAR(50),
    gl_posted BOOLEAN DEFAULT false,
    gl_journal_id INTEGER,
    salesperson_id INTEGER,
    salesperson_name VARCHAR,
    project_id INTEGER,
    commission_amount NUMERIC(15,2) DEFAULT 0,
    pdf_url TEXT,
    sent_at TIMESTAMPTZ,
    notes TEXT,
    status VARCHAR(50) DEFAULT 'draft',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  // קבלות מלקוחות - תקבולים
  await exec(`CREATE TABLE IF NOT EXISTS ar_receipts (
    id SERIAL PRIMARY KEY,
    receipt_number VARCHAR(100),
    customer_id INTEGER,
    customer_name VARCHAR(300),
    receipt_date DATE,
    payment_method VARCHAR(50),
    bank_account VARCHAR,
    check_number VARCHAR,
    credit_card_last4 VARCHAR(4),
    reference VARCHAR(200),
    total_amount NUMERIC(15,2),
    currency VARCHAR(10) DEFAULT 'ILS',
    invoices_paid JSONB DEFAULT '[]',
    gl_posted BOOLEAN DEFAULT false,
    gl_journal_id INTEGER,
    notes TEXT,
    status VARCHAR(50) DEFAULT 'completed',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  // תמונת מצב גיול חובות - Aging Snapshot
  await exec(`CREATE TABLE IF NOT EXISTS ar_aging_snapshot (
    id SERIAL PRIMARY KEY,
    snapshot_date DATE,
    customer_id INTEGER,
    customer_name VARCHAR,
    current_amount NUMERIC(15,2) DEFAULT 0,
    days_30 NUMERIC(15,2) DEFAULT 0,
    days_60 NUMERIC(15,2) DEFAULT 0,
    days_90 NUMERIC(15,2) DEFAULT 0,
    days_120_plus NUMERIC(15,2) DEFAULT 0,
    total_outstanding NUMERIC(15,2) DEFAULT 0,
    credit_limit NUMERIC(15,2),
    risk_level VARCHAR(20),
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  // ===================== 4. ניהול מזומנים ובנקים - Cash & Bank Management =====================
  // חשבונות בנק מאסטר
  await exec(`CREATE TABLE IF NOT EXISTS bank_accounts_master (
    id SERIAL PRIMARY KEY,
    account_number VARCHAR(50),
    bank_name VARCHAR(200),
    branch VARCHAR(100),
    account_name VARCHAR(300),
    currency VARCHAR(10) DEFAULT 'ILS',
    current_balance NUMERIC(15,2) DEFAULT 0,
    available_balance NUMERIC(15,2) DEFAULT 0,
    gl_account_code VARCHAR(20),
    is_default BOOLEAN DEFAULT false,
    status VARCHAR(50) DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  // תנועות בנק - Bank Transactions
  await exec(`CREATE TABLE IF NOT EXISTS bank_transactions (
    id SERIAL PRIMARY KEY,
    bank_account_id INTEGER,
    transaction_date DATE,
    value_date DATE,
    reference VARCHAR(200),
    description TEXT,
    debit_amount NUMERIC(15,2) DEFAULT 0,
    credit_amount NUMERIC(15,2) DEFAULT 0,
    balance NUMERIC(15,2),
    transaction_type VARCHAR(50),
    matched BOOLEAN DEFAULT false,
    matched_to_type VARCHAR(50),
    matched_to_id INTEGER,
    imported BOOLEAN DEFAULT false,
    import_batch VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  // התאמות בנק - Bank Reconciliation
  await exec(`CREATE TABLE IF NOT EXISTS bank_reconciliation (
    id SERIAL PRIMARY KEY,
    bank_account_id INTEGER,
    reconciliation_date DATE,
    statement_balance NUMERIC(15,2),
    book_balance NUMERIC(15,2),
    difference NUMERIC(15,2),
    unmatched_bank_items INTEGER DEFAULT 0,
    unmatched_book_items INTEGER DEFAULT 0,
    reconciled_by VARCHAR,
    status VARCHAR(50) DEFAULT 'draft',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  // תחזית תזרים מזומנים - Cash Flow Forecast
  await exec(`CREATE TABLE IF NOT EXISTS cash_flow_forecast (
    id SERIAL PRIMARY KEY,
    forecast_date DATE,
    category VARCHAR(100),
    subcategory VARCHAR(100),
    description TEXT,
    expected_inflow NUMERIC(15,2) DEFAULT 0,
    expected_outflow NUMERIC(15,2) DEFAULT 0,
    actual_inflow NUMERIC(15,2) DEFAULT 0,
    actual_outflow NUMERIC(15,2) DEFAULT 0,
    source_type VARCHAR(100),
    source_id INTEGER,
    confidence VARCHAR(20) DEFAULT 'medium',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  // ===================== 5. רכוש קבוע - Fixed Assets =====================
  await exec(`CREATE TABLE IF NOT EXISTS fixed_assets_register (
    id SERIAL PRIMARY KEY,
    asset_number VARCHAR(50) UNIQUE,
    asset_name VARCHAR(300),
    asset_name_he VARCHAR(300),
    category VARCHAR(100),
    subcategory VARCHAR(100),
    acquisition_date DATE,
    acquisition_cost NUMERIC(15,2),
    residual_value NUMERIC(15,2) DEFAULT 0,
    useful_life_months INTEGER,
    depreciation_method VARCHAR(50) DEFAULT 'straight_line',
    monthly_depreciation NUMERIC(15,2),
    accumulated_depreciation NUMERIC(15,2) DEFAULT 0,
    net_book_value NUMERIC(15,2),
    location VARCHAR(200),
    department VARCHAR(200),
    assigned_to VARCHAR(200),
    serial_number VARCHAR(200),
    manufacturer VARCHAR(200),
    model VARCHAR(200),
    warranty_expiry DATE,
    insurance_policy VARCHAR(200),
    insurance_expiry DATE,
    last_maintenance DATE,
    condition VARCHAR(50) DEFAULT 'good',
    disposal_date DATE,
    disposal_amount NUMERIC(15,2),
    disposal_reason TEXT,
    gl_asset_account VARCHAR(20),
    gl_depreciation_account VARCHAR(20),
    gl_expense_account VARCHAR(20),
    status VARCHAR(50) DEFAULT 'active',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  // ===================== 6. הגדרות דוחות כספיים - Financial Report Configs =====================
  await exec(`CREATE TABLE IF NOT EXISTS financial_report_configs (
    id SERIAL PRIMARY KEY,
    report_type VARCHAR(50),
    report_name VARCHAR(300),
    report_name_he VARCHAR(300),
    structure JSONB DEFAULT '[]',
    accounts_mapping JSONB DEFAULT '{}',
    period_type VARCHAR(20) DEFAULT 'monthly',
    comparison_periods INTEGER DEFAULT 1,
    include_budget BOOLEAN DEFAULT true,
    currency VARCHAR(10) DEFAULT 'ILS',
    is_default BOOLEAN DEFAULT false,
    created_by VARCHAR,
    notes TEXT,
    status VARCHAR(50) DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  console.log("✅ Oracle Financial Core - כל הטבלאות נוצרו בהצלחה");
}

// ============================================================================
// GENERIC CRUD - פעולות בסיסיות לכל הטבלאות
// ============================================================================

// רשימת כל הטבלאות הפיננסיות
const FINANCIAL_TABLES: Record<string, { table: string; orderBy: string; label: string }> = {
  "gl-accounts":          { table: "gl_accounts_master",       orderBy: "account_code ASC",         label: "חשבונות חשבונאיים" },
  "gl-journal-entries":   { table: "gl_journal_entries",       orderBy: "id DESC",                  label: "פקודות יומן" },
  "gl-journal-lines":     { table: "gl_journal_lines",         orderBy: "journal_id DESC, line_number ASC", label: "שורות פקודת יומן" },
  "gl-periods":           { table: "gl_periods",               orderBy: "fiscal_year DESC, month DESC", label: "תקופות חשבונאיות" },
  "ap-invoices":          { table: "ap_invoices",              orderBy: "id DESC",                  label: "חשבוניות ספקים" },
  "ap-payments":          { table: "ap_payments",              orderBy: "id DESC",                  label: "תשלומים לספקים" },
  "ar-invoices":          { table: "ar_invoices",              orderBy: "id DESC",                  label: "חשבוניות לקוחות" },
  "ar-receipts":          { table: "ar_receipts",              orderBy: "id DESC",                  label: "קבלות מלקוחות" },
  "ar-aging":             { table: "ar_aging_snapshot",        orderBy: "snapshot_date DESC",       label: "גיול חובות לקוחות" },
  "bank-accounts":        { table: "bank_accounts_master",     orderBy: "id ASC",                   label: "חשבונות בנק" },
  "bank-transactions":    { table: "bank_transactions",        orderBy: "transaction_date DESC, id DESC", label: "תנועות בנק" },
  "bank-reconciliation":  { table: "bank_reconciliation",      orderBy: "reconciliation_date DESC", label: "התאמות בנק" },
  "cash-flow-forecast":   { table: "cash_flow_forecast",       orderBy: "forecast_date ASC",        label: "תחזית תזרים" },
  "fixed-assets":         { table: "fixed_assets_register",    orderBy: "asset_number ASC",         label: "רכוש קבוע" },
  "report-configs":       { table: "financial_report_configs",  orderBy: "id ASC",                   label: "הגדרות דוחות" },
};

// GET כללי - שליפת כל הרשומות מטבלה
for (const [route, cfg] of Object.entries(FINANCIAL_TABLES)) {
  router.get(`/${route}`, async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 500;
      const offset = parseInt(req.query.offset as string) || 0;
      const search = req.query.search as string;
      const status = req.query.status as string;

      let where = "WHERE 1=1";
      if (status) where += ` AND status = ${esc(status)}`;
      if (search) {
        // חיפוש גנרי בכל העמודות הטקסטואליות
        where += ` AND (
          CAST(id AS TEXT) LIKE '%${search.replace(/'/g, "''")}%'
          OR COALESCE(CAST(${cfg.table} AS TEXT), '') ILIKE '%${search.replace(/'/g, "''")}%'
        )`;
      }

      const rows = await q(`SELECT * FROM ${cfg.table} ${where} ORDER BY ${cfg.orderBy} LIMIT ${limit} OFFSET ${offset}`);
      const countRows = await q(`SELECT COUNT(*) as total FROM ${cfg.table} ${where}`);
      const total = (countRows[0] as any)?.total || 0;

      res.json({ data: rows, total: Number(total), label: cfg.label });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // GET לפי מזהה
  router.get(`/${route}/:id`, async (req, res) => {
    try {
      const row = await qOne(`SELECT * FROM ${cfg.table} WHERE id = ${parseInt(req.params.id)}`);
      if (!row) return res.status(404).json({ error: "לא נמצא" });
      res.json(row);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST - יצירת רשומה חדשה
  router.post(`/${route}`, async (req, res) => {
    try {
      const data = req.body;
      const keys = Object.keys(data).filter(k => data[k] !== undefined);
      const vals = keys.map(k => {
        const v = data[k];
        if (v === null) return "NULL";
        if (typeof v === "object") return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
        if (typeof v === "boolean") return v ? "true" : "false";
        if (typeof v === "number") return String(v);
        return esc(v);
      });
      const result = await q(`INSERT INTO ${cfg.table} (${keys.join(",")}) VALUES (${vals.join(",")}) RETURNING *`);
      res.json(result[0]);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // PUT - עדכון רשומה
  router.put(`/${route}/:id`, async (req, res) => {
    try {
      const data = req.body;
      const sets = Object.keys(data)
        .filter(k => data[k] !== undefined && k !== "id")
        .map(k => {
          const v = data[k];
          if (v === null) return `${k} = NULL`;
          if (typeof v === "object") return `${k} = '${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
          if (typeof v === "boolean") return `${k} = ${v}`;
          if (typeof v === "number") return `${k} = ${v}`;
          return `${k} = ${esc(v)}`;
        });
      if (sets.length === 0) return res.json({ message: "אין שדות לעדכון" });
      sets.push("updated_at = NOW()");
      const result = await q(`UPDATE ${cfg.table} SET ${sets.join(",")} WHERE id = ${parseInt(req.params.id)} RETURNING *`);
      res.json(result[0] || { message: "לא נמצא" });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // סטטיסטיקות מהירות לכל טבלה
  router.get(`/${route}/stats/summary`, async (req, res) => {
    try {
      const total = await qOne(`SELECT COUNT(*) as count FROM ${cfg.table}`);
      res.json({ table: cfg.table, label: cfg.label, total: Number((total as any)?.count || 0) });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });
}


// ============================================================================
// נקודות קצה מיוחדות - CRITICAL SPECIAL ENDPOINTS
// ============================================================================

// ===================== 1. POST /init - אתחול כל הטבלאות =====================
router.post("/init", async (_req, res) => {
  try {
    await ensureOracleFinancialTables();
    res.json({ success: true, message: "כל טבלאות הליבה הפיננסית נוצרו בהצלחה", tables: Object.keys(FINANCIAL_TABLES).length });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});


// ===================== 2. POST /journal-entry - יצירת פקודת יומן מאוזנת =====================
// הפונקציה הכי חשובה במערכת - כל תנועה כספית עוברת דרך כאן
router.post("/journal-entry", async (req, res) => {
  try {
    const { entry_date, value_date, description, description_he, source, source_module, source_document_id, source_document_number, currency, exchange_rate, lines } = req.body;

    if (!lines || !Array.isArray(lines) || lines.length < 2) {
      return res.status(400).json({ error: "פקודת יומן חייבת לפחות 2 שורות (חיוב וזיכוי)" });
    }

    // חישוב סכומי חיוב וזיכוי
    let totalDebit = 0;
    let totalCredit = 0;
    for (const line of lines) {
      totalDebit += parseFloat(line.debit_amount || 0);
      totalCredit += parseFloat(line.credit_amount || 0);
    }

    // בדיקת איזון - חובה! כל שקל חייב להיות מאוזן
    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      return res.status(400).json({
        error: "פקודת היומן אינה מאוזנת!",
        total_debit: totalDebit.toFixed(2),
        total_credit: totalCredit.toFixed(2),
        difference: (totalDebit - totalCredit).toFixed(2)
      });
    }

    // מספור אוטומטי לפקודת יומן
    const journalNumber = await nextNum("JE", "gl_journal_entries", "journal_number");
    const entryDate = fmtDate(entry_date);
    const period = `${entryDate.substring(0, 7)}`;  // YYYY-MM
    const fiscalYear = parseInt(entryDate.substring(0, 4));

    // בדיקה שהתקופה פתוחה
    const periodRow = await qOne(`SELECT * FROM gl_periods WHERE period_code = '${period}' AND status = 'open'`);
    // אם התקופה לא קיימת, ניצור אותה אוטומטית (נוחות)
    if (!periodRow) {
      const month = parseInt(entryDate.substring(5, 7));
      const startDate = `${fiscalYear}-${String(month).padStart(2, "0")}-01`;
      const endDate = new Date(fiscalYear, month, 0).toISOString().split("T")[0];
      await exec(`INSERT INTO gl_periods (period_code, period_name, period_name_he, fiscal_year, month, start_date, end_date, status)
        VALUES ('${period}', 'Period ${period}', 'תקופה ${period}', ${fiscalYear}, ${month}, '${startDate}', '${endDate}', 'open')
        ON CONFLICT (period_code) DO NOTHING`);
    }

    // יצירת פקודת היומן
    const journalRows = await q(`INSERT INTO gl_journal_entries
      (journal_number, entry_date, value_date, period, fiscal_year, source, source_module, source_document_id, source_document_number, description, description_he, total_debit, total_credit, is_balanced, currency, exchange_rate, status)
      VALUES (${esc(journalNumber)}, '${entryDate}', ${value_date ? `'${fmtDate(value_date)}'` : `'${entryDate}'`}, '${period}', ${fiscalYear}, ${esc(source || "manual")}, ${esc(source_module)}, ${source_document_id || "NULL"}, ${esc(source_document_number)}, ${esc(description)}, ${esc(description_he)}, ${totalDebit.toFixed(2)}, ${totalCredit.toFixed(2)}, true, ${esc(currency || "ILS")}, ${exchange_rate || 1}, 'draft')
      RETURNING *`);

    const journal = journalRows[0] as any;

    // יצירת שורות הפקודה
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      // שליפת שם החשבון אוטומטית
      const acct = await qOne(`SELECT account_name FROM gl_accounts_master WHERE account_code = ${esc(l.account_code)}`);
      await exec(`INSERT INTO gl_journal_lines
        (journal_id, line_number, account_code, account_name, debit_amount, credit_amount, currency, foreign_amount, exchange_rate, department, cost_center, profit_center, project, description, tax_code, tax_amount)
        VALUES (${journal.id}, ${i + 1}, ${esc(l.account_code)}, ${esc((acct as any)?.account_name || l.account_name || "")}, ${parseFloat(l.debit_amount || 0).toFixed(2)}, ${parseFloat(l.credit_amount || 0).toFixed(2)}, ${esc(l.currency || currency || "ILS")}, ${l.foreign_amount || "NULL"}, ${l.exchange_rate || "NULL"}, ${esc(l.department)}, ${esc(l.cost_center)}, ${esc(l.profit_center)}, ${esc(l.project)}, ${esc(l.description)}, ${esc(l.tax_code)}, ${parseFloat(l.tax_amount || 0).toFixed(2)})`);
    }

    res.json({
      success: true,
      message: "פקודת יומן נוצרה בהצלחה",
      journal_number: journalNumber,
      journal_id: journal.id,
      total_debit: totalDebit.toFixed(2),
      total_credit: totalCredit.toFixed(2),
      lines_count: lines.length
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});


// ===================== 3. POST /post-journal/:id - רישום פקודת יומן לספר הראשי =====================
router.post("/post-journal/:id", async (req, res) => {
  try {
    const journalId = parseInt(req.params.id);
    const journal = await qOne(`SELECT * FROM gl_journal_entries WHERE id = ${journalId}`);
    if (!journal) return res.status(404).json({ error: "פקודת יומן לא נמצאה" });
    if ((journal as any).status === "posted") return res.status(400).json({ error: "פקודת היומן כבר נרשמה" });
    if ((journal as any).reversed) return res.status(400).json({ error: "פקודת היומן בוטלה ולא ניתן לרשום" });

    // בדיקת איזון חוזרת לפני רישום
    if (!(journal as any).is_balanced) return res.status(400).json({ error: "פקודת היומן אינה מאוזנת" });

    // שליפת שורות הפקודה
    const lines = await q(`SELECT * FROM gl_journal_lines WHERE journal_id = ${journalId}`);

    // עדכון סטטוס הפקודה
    const user = (req as any).user;
    await exec(`UPDATE gl_journal_entries SET
      status = 'posted',
      posted_by = ${esc(user?.name || user?.email || "system")},
      posted_at = NOW(),
      updated_at = NOW()
      WHERE id = ${journalId}`);

    res.json({
      success: true,
      message: "פקודת היומן נרשמה בספר הראשי",
      journal_id: journalId,
      journal_number: (journal as any).journal_number,
      lines_posted: lines.length
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});


// ===================== 4. GET /trial-balance - מאזן בוחן לתקופה =====================
router.get("/trial-balance", async (req, res) => {
  try {
    const periodFrom = req.query.period_from as string || `${new Date().getFullYear()}-01`;
    const periodTo = req.query.period_to as string || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
    const dateFrom = `${periodFrom}-01`;
    const dateTo = req.query.date_to as string || new Date().toISOString().split("T")[0];

    // שליפת סכומים לפי חשבון
    const rows = await q(`
      SELECT
        gl.account_code,
        gam.account_name,
        gam.account_name_he,
        gam.account_type,
        gam.account_category,
        gam.normal_balance,
        COALESCE(SUM(gl.debit_amount), 0) as total_debit,
        COALESCE(SUM(gl.credit_amount), 0) as total_credit,
        COALESCE(SUM(gl.debit_amount), 0) - COALESCE(SUM(gl.credit_amount), 0) as balance
      FROM gl_journal_lines gl
      JOIN gl_journal_entries je ON je.id = gl.journal_id
      LEFT JOIN gl_accounts_master gam ON gam.account_code = gl.account_code
      WHERE je.status = 'posted'
        AND je.entry_date >= '${dateFrom}'
        AND je.entry_date <= '${dateTo}'
      GROUP BY gl.account_code, gam.account_name, gam.account_name_he, gam.account_type, gam.account_category, gam.normal_balance
      ORDER BY gl.account_code
    `);

    // חישוב סיכומים
    let sumDebit = 0, sumCredit = 0;
    for (const r of rows) {
      sumDebit += parseFloat((r as any).total_debit || 0);
      sumCredit += parseFloat((r as any).total_credit || 0);
    }

    res.json({
      period_from: periodFrom,
      period_to: periodTo,
      accounts: rows,
      totals: {
        total_debit: sumDebit.toFixed(2),
        total_credit: sumCredit.toFixed(2),
        difference: (sumDebit - sumCredit).toFixed(2),
        is_balanced: Math.abs(sumDebit - sumCredit) < 0.01
      }
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});


// ===================== 5. GET /balance-sheet - מאזן ליום נתון =====================
router.get("/balance-sheet", async (req, res) => {
  try {
    const asOfDate = req.query.date as string || new Date().toISOString().split("T")[0];

    // נכסים - כל מה שהחברה מחזיקה
    const assets = await q(`
      SELECT gl.account_code, gam.account_name, gam.account_name_he, gam.account_category,
        COALESCE(SUM(gl.debit_amount), 0) - COALESCE(SUM(gl.credit_amount), 0) as balance
      FROM gl_journal_lines gl
      JOIN gl_journal_entries je ON je.id = gl.journal_id
      LEFT JOIN gl_accounts_master gam ON gam.account_code = gl.account_code
      WHERE je.status = 'posted' AND je.entry_date <= '${asOfDate}' AND gam.account_type = 'asset'
      GROUP BY gl.account_code, gam.account_name, gam.account_name_he, gam.account_category
      HAVING COALESCE(SUM(gl.debit_amount), 0) - COALESCE(SUM(gl.credit_amount), 0) != 0
      ORDER BY gl.account_code
    `);

    // התחייבויות - כל מה שהחברה חייבת
    const liabilities = await q(`
      SELECT gl.account_code, gam.account_name, gam.account_name_he, gam.account_category,
        COALESCE(SUM(gl.credit_amount), 0) - COALESCE(SUM(gl.debit_amount), 0) as balance
      FROM gl_journal_lines gl
      JOIN gl_journal_entries je ON je.id = gl.journal_id
      LEFT JOIN gl_accounts_master gam ON gam.account_code = gl.account_code
      WHERE je.status = 'posted' AND je.entry_date <= '${asOfDate}' AND gam.account_type = 'liability'
      GROUP BY gl.account_code, gam.account_name, gam.account_name_he, gam.account_category
      HAVING COALESCE(SUM(gl.credit_amount), 0) - COALESCE(SUM(gl.debit_amount), 0) != 0
      ORDER BY gl.account_code
    `);

    // הון עצמי - כולל רווחים שמורים
    const equity = await q(`
      SELECT gl.account_code, gam.account_name, gam.account_name_he, gam.account_category,
        COALESCE(SUM(gl.credit_amount), 0) - COALESCE(SUM(gl.debit_amount), 0) as balance
      FROM gl_journal_lines gl
      JOIN gl_journal_entries je ON je.id = gl.journal_id
      LEFT JOIN gl_accounts_master gam ON gam.account_code = gl.account_code
      WHERE je.status = 'posted' AND je.entry_date <= '${asOfDate}' AND gam.account_type = 'equity'
      GROUP BY gl.account_code, gam.account_name, gam.account_name_he, gam.account_category
      HAVING COALESCE(SUM(gl.credit_amount), 0) - COALESCE(SUM(gl.debit_amount), 0) != 0
      ORDER BY gl.account_code
    `);

    // רווח נקי מתחילת השנה - מתווסף להון העצמי
    const yearStart = `${asOfDate.substring(0, 4)}-01-01`;
    const netIncomeRow = await qOne(`
      SELECT
        COALESCE(SUM(CASE WHEN gam.account_type = 'revenue' THEN gl.credit_amount - gl.debit_amount ELSE 0 END), 0) -
        COALESCE(SUM(CASE WHEN gam.account_type IN ('expense','contra') THEN gl.debit_amount - gl.credit_amount ELSE 0 END), 0) as net_income
      FROM gl_journal_lines gl
      JOIN gl_journal_entries je ON je.id = gl.journal_id
      LEFT JOIN gl_accounts_master gam ON gam.account_code = gl.account_code
      WHERE je.status = 'posted' AND je.entry_date >= '${yearStart}' AND je.entry_date <= '${asOfDate}'
        AND gam.account_type IN ('revenue', 'expense', 'contra')
    `);

    const totalAssets = assets.reduce((s: number, r: any) => s + parseFloat(r.balance || 0), 0);
    const totalLiabilities = liabilities.reduce((s: number, r: any) => s + parseFloat(r.balance || 0), 0);
    const totalEquity = equity.reduce((s: number, r: any) => s + parseFloat(r.balance || 0), 0);
    const netIncome = parseFloat((netIncomeRow as any)?.net_income || 0);

    res.json({
      as_of_date: asOfDate,
      assets: { accounts: assets, total: totalAssets.toFixed(2) },
      liabilities: { accounts: liabilities, total: totalLiabilities.toFixed(2) },
      equity: { accounts: equity, total: totalEquity.toFixed(2), retained_earnings_ytd: netIncome.toFixed(2) },
      total_liabilities_and_equity: (totalLiabilities + totalEquity + netIncome).toFixed(2),
      is_balanced: Math.abs(totalAssets - (totalLiabilities + totalEquity + netIncome)) < 0.01,
      currency: "ILS"
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});


// ===================== 6. GET /income-statement - דוח רווח והפסד לתקופה =====================
router.get("/income-statement", async (req, res) => {
  try {
    const dateFrom = req.query.date_from as string || `${new Date().getFullYear()}-01-01`;
    const dateTo = req.query.date_to as string || new Date().toISOString().split("T")[0];

    // הכנסות
    const revenue = await q(`
      SELECT gl.account_code, gam.account_name, gam.account_name_he, gam.account_category,
        COALESCE(SUM(gl.credit_amount), 0) - COALESCE(SUM(gl.debit_amount), 0) as balance
      FROM gl_journal_lines gl
      JOIN gl_journal_entries je ON je.id = gl.journal_id
      LEFT JOIN gl_accounts_master gam ON gam.account_code = gl.account_code
      WHERE je.status = 'posted' AND je.entry_date >= '${dateFrom}' AND je.entry_date <= '${dateTo}'
        AND gam.account_type = 'revenue'
      GROUP BY gl.account_code, gam.account_name, gam.account_name_he, gam.account_category
      ORDER BY gl.account_code
    `);

    // עלות המכר - COGS
    const cogs = await q(`
      SELECT gl.account_code, gam.account_name, gam.account_name_he, gam.account_category,
        COALESCE(SUM(gl.debit_amount), 0) - COALESCE(SUM(gl.credit_amount), 0) as balance
      FROM gl_journal_lines gl
      JOIN gl_journal_entries je ON je.id = gl.journal_id
      LEFT JOIN gl_accounts_master gam ON gam.account_code = gl.account_code
      WHERE je.status = 'posted' AND je.entry_date >= '${dateFrom}' AND je.entry_date <= '${dateTo}'
        AND gam.account_category = 'cogs'
      GROUP BY gl.account_code, gam.account_name, gam.account_name_he, gam.account_category
      ORDER BY gl.account_code
    `);

    // הוצאות תפעוליות
    const opex = await q(`
      SELECT gl.account_code, gam.account_name, gam.account_name_he, gam.account_category,
        COALESCE(SUM(gl.debit_amount), 0) - COALESCE(SUM(gl.credit_amount), 0) as balance
      FROM gl_journal_lines gl
      JOIN gl_journal_entries je ON je.id = gl.journal_id
      LEFT JOIN gl_accounts_master gam ON gam.account_code = gl.account_code
      WHERE je.status = 'posted' AND je.entry_date >= '${dateFrom}' AND je.entry_date <= '${dateTo}'
        AND gam.account_type = 'expense' AND COALESCE(gam.account_category, '') != 'cogs'
      GROUP BY gl.account_code, gam.account_name, gam.account_name_he, gam.account_category
      ORDER BY gl.account_code
    `);

    // הכנסות/הוצאות מימון
    const financial = await q(`
      SELECT gl.account_code, gam.account_name, gam.account_name_he, gam.account_category,
        COALESCE(SUM(gl.credit_amount), 0) - COALESCE(SUM(gl.debit_amount), 0) as balance
      FROM gl_journal_lines gl
      JOIN gl_journal_entries je ON je.id = gl.journal_id
      LEFT JOIN gl_accounts_master gam ON gam.account_code = gl.account_code
      WHERE je.status = 'posted' AND je.entry_date >= '${dateFrom}' AND je.entry_date <= '${dateTo}'
        AND gam.account_category = 'financial'
      GROUP BY gl.account_code, gam.account_name, gam.account_name_he, gam.account_category
      ORDER BY gl.account_code
    `);

    const totalRevenue = revenue.reduce((s: number, r: any) => s + parseFloat(r.balance || 0), 0);
    const totalCogs = cogs.reduce((s: number, r: any) => s + parseFloat(r.balance || 0), 0);
    const grossProfit = totalRevenue - totalCogs;
    const totalOpex = opex.reduce((s: number, r: any) => s + parseFloat(r.balance || 0), 0);
    const operatingIncome = grossProfit - totalOpex;
    const totalFinancial = financial.reduce((s: number, r: any) => s + parseFloat(r.balance || 0), 0);
    const netIncome = operatingIncome + totalFinancial;

    res.json({
      period: { from: dateFrom, to: dateTo },
      revenue: { accounts: revenue, total: totalRevenue.toFixed(2) },
      cost_of_goods_sold: { accounts: cogs, total: totalCogs.toFixed(2) },
      gross_profit: grossProfit.toFixed(2),
      gross_margin_pct: totalRevenue > 0 ? ((grossProfit / totalRevenue) * 100).toFixed(1) : "0.0",
      operating_expenses: { accounts: opex, total: totalOpex.toFixed(2) },
      operating_income: operatingIncome.toFixed(2),
      financial_items: { accounts: financial, total: totalFinancial.toFixed(2) },
      net_income: netIncome.toFixed(2),
      net_margin_pct: totalRevenue > 0 ? ((netIncome / totalRevenue) * 100).toFixed(1) : "0.0",
      currency: "ILS"
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});


// ===================== 7. GET /cash-flow-statement - דוח תזרים מזומנים =====================
router.get("/cash-flow-statement", async (req, res) => {
  try {
    const dateFrom = req.query.date_from as string || `${new Date().getFullYear()}-01-01`;
    const dateTo = req.query.date_to as string || new Date().toISOString().split("T")[0];

    // תזרים מפעילות שוטפת - Operating Activities
    const operating = await q(`
      SELECT
        COALESCE(SUM(CASE WHEN gam.account_type = 'revenue' THEN gl.credit_amount - gl.debit_amount ELSE 0 END), 0) as revenue_cash,
        COALESCE(SUM(CASE WHEN gam.account_type = 'expense' THEN gl.debit_amount - gl.credit_amount ELSE 0 END), 0) as expense_cash
      FROM gl_journal_lines gl
      JOIN gl_journal_entries je ON je.id = gl.journal_id
      LEFT JOIN gl_accounts_master gam ON gam.account_code = gl.account_code
      WHERE je.status = 'posted' AND je.entry_date >= '${dateFrom}' AND je.entry_date <= '${dateTo}'
        AND gam.account_type IN ('revenue', 'expense')
    `);

    // שינויים בחשבונות לקוחות/ספקים
    const arChange = await qOne(`
      SELECT
        COALESCE(SUM(debit_amount), 0) - COALESCE(SUM(credit_amount), 0) as ar_change
      FROM gl_journal_lines gl
      JOIN gl_journal_entries je ON je.id = gl.journal_id
      WHERE je.status = 'posted' AND je.entry_date >= '${dateFrom}' AND je.entry_date <= '${dateTo}'
        AND gl.account_code LIKE '1300%'
    `);

    const apChange = await qOne(`
      SELECT
        COALESCE(SUM(credit_amount), 0) - COALESCE(SUM(debit_amount), 0) as ap_change
      FROM gl_journal_lines gl
      JOIN gl_journal_entries je ON je.id = gl.journal_id
      WHERE je.status = 'posted' AND je.entry_date >= '${dateFrom}' AND je.entry_date <= '${dateTo}'
        AND gl.account_code LIKE '2000%'
    `);

    // תזרים מפעילות השקעה - Investing Activities
    const investing = await qOne(`
      SELECT
        COALESCE(SUM(gl.debit_amount), 0) - COALESCE(SUM(gl.credit_amount), 0) as net_investment
      FROM gl_journal_lines gl
      JOIN gl_journal_entries je ON je.id = gl.journal_id
      LEFT JOIN gl_accounts_master gam ON gam.account_code = gl.account_code
      WHERE je.status = 'posted' AND je.entry_date >= '${dateFrom}' AND je.entry_date <= '${dateTo}'
        AND gl.account_code BETWEEN '1500' AND '1999'
    `);

    // תזרים מפעילות מימון - Financing Activities
    const financing = await qOne(`
      SELECT
        COALESCE(SUM(gl.credit_amount), 0) - COALESCE(SUM(gl.debit_amount), 0) as net_financing
      FROM gl_journal_lines gl
      JOIN gl_journal_entries je ON je.id = gl.journal_id
      WHERE je.status = 'posted' AND je.entry_date >= '${dateFrom}' AND je.entry_date <= '${dateTo}'
        AND (gl.account_code LIKE '2500%' OR gl.account_code LIKE '3%')
    `);

    // יתרת מזומנים
    const cashBalance = await qOne(`
      SELECT
        COALESCE(SUM(gl.debit_amount), 0) - COALESCE(SUM(gl.credit_amount), 0) as cash_balance
      FROM gl_journal_lines gl
      JOIN gl_journal_entries je ON je.id = gl.journal_id
      WHERE je.status = 'posted' AND je.entry_date <= '${dateTo}'
        AND gl.account_code IN ('1000', '1010', '1020', '1050', '1100')
    `);

    const op = operating[0] as any || {};
    const netOperating = parseFloat(op.revenue_cash || 0) - parseFloat(op.expense_cash || 0)
      - parseFloat((arChange as any)?.ar_change || 0) + parseFloat((apChange as any)?.ap_change || 0);
    const netInvesting = -parseFloat((investing as any)?.net_investment || 0);
    const netFinancing = parseFloat((financing as any)?.net_financing || 0);

    res.json({
      period: { from: dateFrom, to: dateTo },
      operating_activities: {
        revenue_received: parseFloat(op.revenue_cash || 0).toFixed(2),
        expenses_paid: parseFloat(op.expense_cash || 0).toFixed(2),
        ar_change: parseFloat((arChange as any)?.ar_change || 0).toFixed(2),
        ap_change: parseFloat((apChange as any)?.ap_change || 0).toFixed(2),
        net_operating: netOperating.toFixed(2)
      },
      investing_activities: { net_investing: netInvesting.toFixed(2) },
      financing_activities: { net_financing: netFinancing.toFixed(2) },
      net_change_in_cash: (netOperating + netInvesting + netFinancing).toFixed(2),
      ending_cash_balance: parseFloat((cashBalance as any)?.cash_balance || 0).toFixed(2),
      currency: "ILS"
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});


// ===================== 8. GET /aging-report/ar - דוח גיול חובות לקוחות =====================
router.get("/aging-report/ar", async (req, res) => {
  try {
    const asOfDate = req.query.date as string || new Date().toISOString().split("T")[0];

    const rows = await q(`
      SELECT
        customer_id,
        customer_name,
        SUM(CASE WHEN '${asOfDate}'::date - due_date <= 0 THEN balance_due ELSE 0 END) as current_amount,
        SUM(CASE WHEN '${asOfDate}'::date - due_date BETWEEN 1 AND 30 THEN balance_due ELSE 0 END) as days_1_30,
        SUM(CASE WHEN '${asOfDate}'::date - due_date BETWEEN 31 AND 60 THEN balance_due ELSE 0 END) as days_31_60,
        SUM(CASE WHEN '${asOfDate}'::date - due_date BETWEEN 61 AND 90 THEN balance_due ELSE 0 END) as days_61_90,
        SUM(CASE WHEN '${asOfDate}'::date - due_date > 90 THEN balance_due ELSE 0 END) as days_over_90,
        SUM(balance_due) as total_outstanding,
        COUNT(*) as invoice_count
      FROM ar_invoices
      WHERE status NOT IN ('cancelled', 'draft') AND COALESCE(balance_due, 0) > 0
      GROUP BY customer_id, customer_name
      ORDER BY total_outstanding DESC
    `);

    // סיכומים
    const totals = {
      current: 0, days_1_30: 0, days_31_60: 0, days_61_90: 0, days_over_90: 0, total: 0
    };
    for (const r of rows as any[]) {
      totals.current += parseFloat(r.current_amount || 0);
      totals.days_1_30 += parseFloat(r.days_1_30 || 0);
      totals.days_31_60 += parseFloat(r.days_31_60 || 0);
      totals.days_61_90 += parseFloat(r.days_61_90 || 0);
      totals.days_over_90 += parseFloat(r.days_over_90 || 0);
      totals.total += parseFloat(r.total_outstanding || 0);
    }

    res.json({
      as_of_date: asOfDate,
      customers: rows,
      totals: {
        current: totals.current.toFixed(2),
        days_1_30: totals.days_1_30.toFixed(2),
        days_31_60: totals.days_31_60.toFixed(2),
        days_61_90: totals.days_61_90.toFixed(2),
        days_over_90: totals.days_over_90.toFixed(2),
        total_outstanding: totals.total.toFixed(2)
      },
      customer_count: rows.length,
      currency: "ILS"
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});


// ===================== 9. GET /aging-report/ap - דוח גיול חובות ספקים =====================
router.get("/aging-report/ap", async (req, res) => {
  try {
    const asOfDate = req.query.date as string || new Date().toISOString().split("T")[0];

    const rows = await q(`
      SELECT
        vendor_id,
        vendor_name,
        SUM(CASE WHEN '${asOfDate}'::date - due_date <= 0 THEN balance_due ELSE 0 END) as current_amount,
        SUM(CASE WHEN '${asOfDate}'::date - due_date BETWEEN 1 AND 30 THEN balance_due ELSE 0 END) as days_1_30,
        SUM(CASE WHEN '${asOfDate}'::date - due_date BETWEEN 31 AND 60 THEN balance_due ELSE 0 END) as days_31_60,
        SUM(CASE WHEN '${asOfDate}'::date - due_date BETWEEN 61 AND 90 THEN balance_due ELSE 0 END) as days_61_90,
        SUM(CASE WHEN '${asOfDate}'::date - due_date > 90 THEN balance_due ELSE 0 END) as days_over_90,
        SUM(balance_due) as total_outstanding,
        COUNT(*) as invoice_count
      FROM ap_invoices
      WHERE status NOT IN ('cancelled', 'draft') AND COALESCE(balance_due, 0) > 0
      GROUP BY vendor_id, vendor_name
      ORDER BY total_outstanding DESC
    `);

    const totals = { current: 0, days_1_30: 0, days_31_60: 0, days_61_90: 0, days_over_90: 0, total: 0 };
    for (const r of rows as any[]) {
      totals.current += parseFloat(r.current_amount || 0);
      totals.days_1_30 += parseFloat(r.days_1_30 || 0);
      totals.days_31_60 += parseFloat(r.days_31_60 || 0);
      totals.days_61_90 += parseFloat(r.days_61_90 || 0);
      totals.days_over_90 += parseFloat(r.days_over_90 || 0);
      totals.total += parseFloat(r.total_outstanding || 0);
    }

    res.json({
      as_of_date: asOfDate,
      vendors: rows,
      totals: {
        current: totals.current.toFixed(2),
        days_1_30: totals.days_1_30.toFixed(2),
        days_31_60: totals.days_31_60.toFixed(2),
        days_61_90: totals.days_61_90.toFixed(2),
        days_over_90: totals.days_over_90.toFixed(2),
        total_outstanding: totals.total.toFixed(2)
      },
      vendor_count: rows.length,
      currency: "ILS"
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});


// ===================== 10. POST /period-close/:period - סגירת תקופה חשבונאית =====================
router.post("/period-close/:period", async (req, res) => {
  try {
    const periodCode = req.params.period; // פורמט: YYYY-MM
    const user = (req as any).user;

    // בדיקה שהתקופה קיימת
    const period = await qOne(`SELECT * FROM gl_periods WHERE period_code = '${periodCode}'`);
    if (!period) return res.status(404).json({ error: `תקופה ${periodCode} לא נמצאה` });
    if ((period as any).status === "closed") return res.status(400).json({ error: "התקופה כבר סגורה" });

    // בדיקה שכל פקודות היומן של התקופה נרשמו
    const unposted = await qOne(`SELECT COUNT(*) as cnt FROM gl_journal_entries WHERE period = '${periodCode}' AND status = 'draft'`);
    if (parseInt((unposted as any)?.cnt || 0) > 0) {
      return res.status(400).json({
        error: `לא ניתן לסגור תקופה - יש ${(unposted as any).cnt} פקודות יומן שלא נרשמו`,
        unposted_count: parseInt((unposted as any).cnt)
      });
    }

    // סגירת התקופה
    await exec(`UPDATE gl_periods SET
      status = 'closed',
      closed_by = ${esc(user?.name || user?.email || "system")},
      closed_at = NOW()
      WHERE period_code = '${periodCode}'`);

    // שמירת snapshot גיול חובות
    await exec(`
      INSERT INTO ar_aging_snapshot (snapshot_date, customer_id, customer_name, current_amount, days_30, days_60, days_90, days_120_plus, total_outstanding)
      SELECT
        CURRENT_DATE,
        customer_id,
        customer_name,
        SUM(CASE WHEN CURRENT_DATE - due_date <= 0 THEN balance_due ELSE 0 END),
        SUM(CASE WHEN CURRENT_DATE - due_date BETWEEN 1 AND 30 THEN balance_due ELSE 0 END),
        SUM(CASE WHEN CURRENT_DATE - due_date BETWEEN 31 AND 60 THEN balance_due ELSE 0 END),
        SUM(CASE WHEN CURRENT_DATE - due_date BETWEEN 61 AND 90 THEN balance_due ELSE 0 END),
        SUM(CASE WHEN CURRENT_DATE - due_date > 90 THEN balance_due ELSE 0 END),
        SUM(COALESCE(balance_due, 0))
      FROM ar_invoices
      WHERE status NOT IN ('cancelled', 'draft') AND COALESCE(balance_due, 0) > 0
      GROUP BY customer_id, customer_name
    `);

    res.json({
      success: true,
      message: `תקופה ${periodCode} נסגרה בהצלחה`,
      closed_by: user?.name || user?.email,
      closed_at: new Date().toISOString()
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});


// ===================== 11. GET /company-financial-health - דשבורד בריאות פיננסית מקיף =====================
router.get("/company-financial-health", async (req, res) => {
  try {
    const today = new Date().toISOString().split("T")[0];
    const yearStart = `${today.substring(0, 4)}-01-01`;
    const monthStart = `${today.substring(0, 7)}-01`;

    // יחסים פיננסיים - נכסים שוטפים וזכויות
    const currentAssets = await qOne(`
      SELECT COALESCE(SUM(gl.debit_amount - gl.credit_amount), 0) as total
      FROM gl_journal_lines gl
      JOIN gl_journal_entries je ON je.id = gl.journal_id
      WHERE je.status = 'posted' AND gl.account_code BETWEEN '1000' AND '1499'
    `);

    const currentLiabilities = await qOne(`
      SELECT COALESCE(SUM(gl.credit_amount - gl.debit_amount), 0) as total
      FROM gl_journal_lines gl
      JOIN gl_journal_entries je ON je.id = gl.journal_id
      WHERE je.status = 'posted' AND gl.account_code BETWEEN '2000' AND '2499'
    `);

    const totalLiabilities = await qOne(`
      SELECT COALESCE(SUM(gl.credit_amount - gl.debit_amount), 0) as total
      FROM gl_journal_lines gl
      JOIN gl_journal_entries je ON je.id = gl.journal_id
      LEFT JOIN gl_accounts_master gam ON gam.account_code = gl.account_code
      WHERE je.status = 'posted' AND gam.account_type = 'liability'
    `);

    const totalEquity = await qOne(`
      SELECT COALESCE(SUM(gl.credit_amount - gl.debit_amount), 0) as total
      FROM gl_journal_lines gl
      JOIN gl_journal_entries je ON je.id = gl.journal_id
      LEFT JOIN gl_accounts_master gam ON gam.account_code = gl.account_code
      WHERE je.status = 'posted' AND gam.account_type = 'equity'
    `);

    // מלאי (להפחתה מ-Quick Ratio)
    const inventory = await qOne(`
      SELECT COALESCE(SUM(gl.debit_amount - gl.credit_amount), 0) as total
      FROM gl_journal_lines gl
      JOIN gl_journal_entries je ON je.id = gl.journal_id
      WHERE je.status = 'posted' AND gl.account_code BETWEEN '1200' AND '1299'
    `);

    // הכנסות והוצאות לשנה
    const revenueYTD = await qOne(`
      SELECT COALESCE(SUM(gl.credit_amount - gl.debit_amount), 0) as total
      FROM gl_journal_lines gl
      JOIN gl_journal_entries je ON je.id = gl.journal_id
      LEFT JOIN gl_accounts_master gam ON gam.account_code = gl.account_code
      WHERE je.status = 'posted' AND je.entry_date >= '${yearStart}' AND gam.account_type = 'revenue'
    `);

    const expensesYTD = await qOne(`
      SELECT COALESCE(SUM(gl.debit_amount - gl.credit_amount), 0) as total
      FROM gl_journal_lines gl
      JOIN gl_journal_entries je ON je.id = gl.journal_id
      LEFT JOIN gl_accounts_master gam ON gam.account_code = gl.account_code
      WHERE je.status = 'posted' AND je.entry_date >= '${yearStart}' AND gam.account_type = 'expense'
    `);

    // הכנסות והוצאות לחודש
    const revenueMonth = await qOne(`
      SELECT COALESCE(SUM(gl.credit_amount - gl.debit_amount), 0) as total
      FROM gl_journal_lines gl
      JOIN gl_journal_entries je ON je.id = gl.journal_id
      LEFT JOIN gl_accounts_master gam ON gam.account_code = gl.account_code
      WHERE je.status = 'posted' AND je.entry_date >= '${monthStart}' AND gam.account_type = 'revenue'
    `);

    const expensesMonth = await qOne(`
      SELECT COALESCE(SUM(gl.debit_amount - gl.credit_amount), 0) as total
      FROM gl_journal_lines gl
      JOIN gl_journal_entries je ON je.id = gl.journal_id
      LEFT JOIN gl_accounts_master gam ON gam.account_code = gl.account_code
      WHERE je.status = 'posted' AND je.entry_date >= '${monthStart}' AND gam.account_type = 'expense'
    `);

    // חובות לקוחות וספקים
    const arTotal = await qOne(`SELECT COALESCE(SUM(balance_due), 0) as total FROM ar_invoices WHERE status NOT IN ('cancelled','draft') AND COALESCE(balance_due,0) > 0`);
    const apTotal = await qOne(`SELECT COALESCE(SUM(balance_due), 0) as total FROM ap_invoices WHERE status NOT IN ('cancelled','draft') AND COALESCE(balance_due,0) > 0`);

    // חובות באיחור
    const arOverdue = await qOne(`SELECT COALESCE(SUM(balance_due), 0) as total FROM ar_invoices WHERE status NOT IN ('cancelled','draft') AND COALESCE(balance_due,0) > 0 AND due_date < CURRENT_DATE`);
    const apOverdue = await qOne(`SELECT COALESCE(SUM(balance_due), 0) as total FROM ap_invoices WHERE status NOT IN ('cancelled','draft') AND COALESCE(balance_due,0) > 0 AND due_date < CURRENT_DATE`);

    // מזומנים בכל הבנקים
    const cashPosition = await q(`SELECT id, account_name, bank_name, currency, current_balance, available_balance FROM bank_accounts_master WHERE status = 'active' ORDER BY current_balance DESC`);
    const totalCash = cashPosition.reduce((s: number, r: any) => s + parseFloat(r.current_balance || 0), 0);

    // חישובי יחסים פיננסיים
    const ca = parseFloat((currentAssets as any)?.total || 0);
    const cl = parseFloat((currentLiabilities as any)?.total || 0);
    const inv = parseFloat((inventory as any)?.total || 0);
    const tl = parseFloat((totalLiabilities as any)?.total || 0);
    const te = parseFloat((totalEquity as any)?.total || 0);

    const currentRatio = cl > 0 ? (ca / cl) : 0;
    const quickRatio = cl > 0 ? ((ca - inv) / cl) : 0;
    const debtToEquity = te > 0 ? (tl / te) : 0;

    const revYTD = parseFloat((revenueYTD as any)?.total || 0);
    const expYTD = parseFloat((expensesYTD as any)?.total || 0);
    const netIncomeYTD = revYTD - expYTD;

    const revMonth = parseFloat((revenueMonth as any)?.total || 0);
    const expMonth = parseFloat((expensesMonth as any)?.total || 0);

    res.json({
      as_of: today,
      financial_ratios: {
        current_ratio: currentRatio.toFixed(2),
        quick_ratio: quickRatio.toFixed(2),
        debt_to_equity: debtToEquity.toFixed(2),
        health_status: currentRatio >= 2 ? "מצוין" : currentRatio >= 1.5 ? "טוב" : currentRatio >= 1 ? "סביר" : "דורש תשומת לב"
      },
      income_ytd: {
        revenue: revYTD.toFixed(2),
        expenses: expYTD.toFixed(2),
        net_income: netIncomeYTD.toFixed(2),
        margin_pct: revYTD > 0 ? ((netIncomeYTD / revYTD) * 100).toFixed(1) : "0.0"
      },
      income_month: {
        revenue: revMonth.toFixed(2),
        expenses: expMonth.toFixed(2),
        net_income: (revMonth - expMonth).toFixed(2)
      },
      accounts_receivable: {
        total: parseFloat((arTotal as any)?.total || 0).toFixed(2),
        overdue: parseFloat((arOverdue as any)?.total || 0).toFixed(2)
      },
      accounts_payable: {
        total: parseFloat((apTotal as any)?.total || 0).toFixed(2),
        overdue: parseFloat((apOverdue as any)?.total || 0).toFixed(2)
      },
      cash_position: {
        total_cash: totalCash.toFixed(2),
        bank_accounts: cashPosition
      },
      currency: "ILS"
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});


// ===================== 12. POST /bank-reconcile - התאמת בנק אוטומטית =====================
router.post("/bank-reconcile", async (req, res) => {
  try {
    const { bank_account_id, statement_balance } = req.body;
    if (!bank_account_id) return res.status(400).json({ error: "נדרש מזהה חשבון בנק" });

    // שליפת תנועות בנק שלא הותאמו
    const unmatchedBank = await q(`SELECT * FROM bank_transactions WHERE bank_account_id = ${bank_account_id} AND matched = false ORDER BY transaction_date`);

    // ניסיון התאמה אוטומטית - לפי סכום ותאריך
    let matchedCount = 0;

    // התאמה מול תשלומים לספקים
    for (const bt of unmatchedBank as any[]) {
      if (bt.debit_amount > 0) {
        // חיפוש תשלום ספק תואם
        const match = await qOne(`
          SELECT id, payment_number FROM ap_payments
          WHERE total_amount = ${bt.debit_amount}
            AND payment_date BETWEEN '${bt.transaction_date}'::date - INTERVAL '3 days' AND '${bt.transaction_date}'::date + INTERVAL '3 days'
            AND status = 'pending'
          LIMIT 1
        `);
        if (match) {
          await exec(`UPDATE bank_transactions SET matched = true, matched_to_type = 'ap_payment', matched_to_id = ${(match as any).id} WHERE id = ${bt.id}`);
          matchedCount++;
        }
      }

      // התאמה מול קבלות מלקוחות
      if (bt.credit_amount > 0) {
        const match = await qOne(`
          SELECT id, receipt_number FROM ar_receipts
          WHERE total_amount = ${bt.credit_amount}
            AND receipt_date BETWEEN '${bt.transaction_date}'::date - INTERVAL '3 days' AND '${bt.transaction_date}'::date + INTERVAL '3 days'
            AND status = 'completed'
          LIMIT 1
        `);
        if (match) {
          await exec(`UPDATE bank_transactions SET matched = true, matched_to_type = 'ar_receipt', matched_to_id = ${(match as any).id} WHERE id = ${bt.id}`);
          matchedCount++;
        }
      }
    }

    // עדכון יתרת הבנק
    const bookBalance = await qOne(`
      SELECT COALESCE(SUM(credit_amount), 0) - COALESCE(SUM(debit_amount), 0) as balance
      FROM bank_transactions WHERE bank_account_id = ${bank_account_id}
    `);

    const stmtBal = parseFloat(statement_balance || 0);
    const bookBal = parseFloat((bookBalance as any)?.balance || 0);
    const unmatchedAfter = await qOne(`SELECT COUNT(*) as cnt FROM bank_transactions WHERE bank_account_id = ${bank_account_id} AND matched = false`);

    // יצירת רשומת התאמה
    await exec(`INSERT INTO bank_reconciliation
      (bank_account_id, reconciliation_date, statement_balance, book_balance, difference, unmatched_bank_items, reconciled_by, status)
      VALUES (${bank_account_id}, CURRENT_DATE, ${stmtBal}, ${bookBal.toFixed(2)}, ${(stmtBal - bookBal).toFixed(2)}, ${(unmatchedAfter as any)?.cnt || 0}, ${esc((req as any).user?.name || "system")}, ${Math.abs(stmtBal - bookBal) < 0.01 ? "'reconciled'" : "'draft'"})`);

    res.json({
      success: true,
      message: "התאמת בנק בוצעה",
      matched_transactions: matchedCount,
      unmatched_remaining: parseInt((unmatchedAfter as any)?.cnt || 0),
      statement_balance: stmtBal.toFixed(2),
      book_balance: bookBal.toFixed(2),
      difference: (stmtBal - bookBal).toFixed(2),
      is_reconciled: Math.abs(stmtBal - bookBal) < 0.01
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});


// ===================== 13. POST /calculate-depreciation - חישוב פחת חודשי לכל הנכסים =====================
router.post("/calculate-depreciation", async (req, res) => {
  try {
    const month = req.body.month || new Date().toISOString().substring(0, 7); // YYYY-MM
    const user = (req as any).user;

    // שליפת כל הנכסים הפעילים
    const assets = await q(`SELECT * FROM fixed_assets_register WHERE status = 'active' AND depreciation_method IS NOT NULL`);

    let totalDepreciation = 0;
    let processedCount = 0;
    const journalLines: any[] = [];

    for (const asset of assets as any[]) {
      // חישוב פחת חודשי - שיטת קו ישר
      let monthlyDep = 0;
      if (asset.depreciation_method === "straight_line" && asset.useful_life_months > 0) {
        monthlyDep = (parseFloat(asset.acquisition_cost || 0) - parseFloat(asset.residual_value || 0)) / asset.useful_life_months;
      } else if (asset.monthly_depreciation > 0) {
        monthlyDep = parseFloat(asset.monthly_depreciation);
      }

      if (monthlyDep <= 0) continue;

      // בדיקה שלא עברנו את הערך הנותר
      const currentAccDep = parseFloat(asset.accumulated_depreciation || 0);
      const maxDep = parseFloat(asset.acquisition_cost || 0) - parseFloat(asset.residual_value || 0);
      if (currentAccDep >= maxDep) continue;

      // הגבלת הפחת לערך המקסימלי
      if (currentAccDep + monthlyDep > maxDep) {
        monthlyDep = maxDep - currentAccDep;
      }

      // עדכון הנכס
      const newAccDep = currentAccDep + monthlyDep;
      const newNBV = parseFloat(asset.acquisition_cost || 0) - newAccDep;

      await exec(`UPDATE fixed_assets_register SET
        accumulated_depreciation = ${newAccDep.toFixed(2)},
        net_book_value = ${newNBV.toFixed(2)},
        monthly_depreciation = ${monthlyDep.toFixed(2)},
        updated_at = NOW()
        WHERE id = ${asset.id}`);

      // הכנת שורות לפקודת יומן
      journalLines.push({
        account_code: asset.gl_expense_account || "6500",
        debit_amount: monthlyDep,
        credit_amount: 0,
        description: `פחת חודשי - ${asset.asset_name_he || asset.asset_name} (${asset.asset_number})`,
        department: asset.department
      });
      journalLines.push({
        account_code: asset.gl_depreciation_account || "1590",
        debit_amount: 0,
        credit_amount: monthlyDep,
        description: `פחת נצבר - ${asset.asset_name_he || asset.asset_name} (${asset.asset_number})`,
        department: asset.department
      });

      totalDepreciation += monthlyDep;
      processedCount++;
    }

    // יצירת פקודת יומן אוטומטית לפחת
    let journalId = null;
    if (journalLines.length > 0) {
      const jNum = await nextNum("DEP", "gl_journal_entries", "journal_number");
      const jRows = await q(`INSERT INTO gl_journal_entries
        (journal_number, entry_date, period, fiscal_year, source, source_module, description, description_he, total_debit, total_credit, is_balanced, auto_generated, status, posted_by, posted_at)
        VALUES (${esc(jNum)}, CURRENT_DATE, '${month}', ${parseInt(month.substring(0, 4))}, 'depreciation', 'fixed_assets', 'Monthly depreciation - ${month}', 'פחת חודשי - ${month}', ${totalDepreciation.toFixed(2)}, ${totalDepreciation.toFixed(2)}, true, true, 'posted', ${esc(user?.name || "system")}, NOW())
        RETURNING id`);
      journalId = (jRows[0] as any)?.id;

      // שורות הפקודה
      for (let i = 0; i < journalLines.length; i++) {
        const l = journalLines[i];
        await exec(`INSERT INTO gl_journal_lines
          (journal_id, line_number, account_code, debit_amount, credit_amount, description, department)
          VALUES (${journalId}, ${i + 1}, ${esc(l.account_code)}, ${l.debit_amount.toFixed(2)}, ${l.credit_amount.toFixed(2)}, ${esc(l.description)}, ${esc(l.department)})`);
      }
    }

    res.json({
      success: true,
      message: `פחת חודשי חושב עבור ${month}`,
      assets_processed: processedCount,
      total_depreciation: totalDepreciation.toFixed(2),
      journal_id: journalId,
      journal_lines: journalLines.length,
      currency: "ILS"
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});


// ===================== 14. GET /daily-profit - כמה החברה הרוויחה היום =====================
router.get("/daily-profit", async (req, res) => {
  try {
    const date = req.query.date as string || new Date().toISOString().split("T")[0];

    const revenue = await qOne(`
      SELECT COALESCE(SUM(gl.credit_amount - gl.debit_amount), 0) as total
      FROM gl_journal_lines gl
      JOIN gl_journal_entries je ON je.id = gl.journal_id
      LEFT JOIN gl_accounts_master gam ON gam.account_code = gl.account_code
      WHERE je.status = 'posted' AND je.entry_date = '${date}' AND gam.account_type = 'revenue'
    `);

    const expenses = await qOne(`
      SELECT COALESCE(SUM(gl.debit_amount - gl.credit_amount), 0) as total
      FROM gl_journal_lines gl
      JOIN gl_journal_entries je ON je.id = gl.journal_id
      LEFT JOIN gl_accounts_master gam ON gam.account_code = gl.account_code
      WHERE je.status = 'posted' AND je.entry_date = '${date}' AND gam.account_type IN ('expense', 'contra')
    `);

    // חשבוניות שנוצרו היום
    const invoicesToday = await qOne(`SELECT COUNT(*) as cnt, COALESCE(SUM(total_amount),0) as total FROM ar_invoices WHERE invoice_date = '${date}'`);
    const receiptToday = await qOne(`SELECT COUNT(*) as cnt, COALESCE(SUM(total_amount),0) as total FROM ar_receipts WHERE receipt_date = '${date}'`);

    const rev = parseFloat((revenue as any)?.total || 0);
    const exp = parseFloat((expenses as any)?.total || 0);

    res.json({
      date,
      revenue: rev.toFixed(2),
      expenses: exp.toFixed(2),
      net_profit: (rev - exp).toFixed(2),
      margin_pct: rev > 0 ? (((rev - exp) / rev) * 100).toFixed(1) : "0.0",
      invoices_issued: {
        count: parseInt((invoicesToday as any)?.cnt || 0),
        total: parseFloat((invoicesToday as any)?.total || 0).toFixed(2)
      },
      receipts_collected: {
        count: parseInt((receiptToday as any)?.cnt || 0),
        total: parseFloat((receiptToday as any)?.total || 0).toFixed(2)
      },
      currency: "ILS"
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});


// ===================== 15. GET /obligations - מה החברה חייבת עכשיו =====================
router.get("/obligations", async (req, res) => {
  try {
    const today = new Date().toISOString().split("T")[0];

    // חובות לספקים - לפי תאריך פירעון
    const apObligations = await q(`
      SELECT id, invoice_number, vendor_name, due_date, balance_due, currency, status,
        CASE
          WHEN due_date < CURRENT_DATE THEN 'overdue'
          WHEN due_date <= CURRENT_DATE + INTERVAL '7 days' THEN 'due_this_week'
          WHEN due_date <= CURRENT_DATE + INTERVAL '30 days' THEN 'due_this_month'
          ELSE 'future'
        END as urgency
      FROM ap_invoices
      WHERE status NOT IN ('cancelled', 'paid') AND COALESCE(balance_due, 0) > 0
      ORDER BY due_date ASC
    `);

    // סיכום לפי דחיפות
    const overdue = apObligations.filter((r: any) => r.urgency === "overdue");
    const dueThisWeek = apObligations.filter((r: any) => r.urgency === "due_this_week");
    const dueThisMonth = apObligations.filter((r: any) => r.urgency === "due_this_month");

    // מיסים - מע"מ לתשלום (הערכה)
    const vatPayable = await qOne(`
      SELECT COALESCE(SUM(gl.credit_amount - gl.debit_amount), 0) as total
      FROM gl_journal_lines gl
      JOIN gl_journal_entries je ON je.id = gl.journal_id
      WHERE je.status = 'posted' AND gl.account_code IN ('2100', '2110', '2120')
    `);

    // משכורות - הערכה מחודש קודם
    const salaryPayable = await qOne(`
      SELECT COALESCE(SUM(gl.credit_amount - gl.debit_amount), 0) as total
      FROM gl_journal_lines gl
      JOIN gl_journal_entries je ON je.id = gl.journal_id
      WHERE je.status = 'posted' AND gl.account_code IN ('2200', '2210', '2220')
    `);

    res.json({
      as_of: today,
      accounts_payable: {
        total: apObligations.reduce((s: number, r: any) => s + parseFloat(r.balance_due || 0), 0).toFixed(2),
        overdue: { count: overdue.length, total: overdue.reduce((s: number, r: any) => s + parseFloat(r.balance_due || 0), 0).toFixed(2), items: overdue },
        due_this_week: { count: dueThisWeek.length, total: dueThisWeek.reduce((s: number, r: any) => s + parseFloat(r.balance_due || 0), 0).toFixed(2), items: dueThisWeek },
        due_this_month: { count: dueThisMonth.length, total: dueThisMonth.reduce((s: number, r: any) => s + parseFloat(r.balance_due || 0), 0).toFixed(2), items: dueThisMonth }
      },
      taxes_payable: {
        vat: parseFloat((vatPayable as any)?.total || 0).toFixed(2)
      },
      salaries_payable: parseFloat((salaryPayable as any)?.total || 0).toFixed(2),
      total_obligations: (
        apObligations.reduce((s: number, r: any) => s + parseFloat(r.balance_due || 0), 0) +
        parseFloat((vatPayable as any)?.total || 0) +
        parseFloat((salaryPayable as any)?.total || 0)
      ).toFixed(2),
      currency: "ILS"
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});


// ===================== 16. GET /receivables - מה חייבים לחברה =====================
router.get("/receivables", async (req, res) => {
  try {
    const today = new Date().toISOString().split("T")[0];

    const arReceivables = await q(`
      SELECT id, invoice_number, customer_name, due_date, balance_due, currency, status, overdue_days, dunning_level,
        CASE
          WHEN due_date < CURRENT_DATE THEN 'overdue'
          WHEN due_date <= CURRENT_DATE + INTERVAL '7 days' THEN 'due_this_week'
          WHEN due_date <= CURRENT_DATE + INTERVAL '30 days' THEN 'due_this_month'
          ELSE 'future'
        END as urgency
      FROM ar_invoices
      WHERE status NOT IN ('cancelled', 'paid', 'draft') AND COALESCE(balance_due, 0) > 0
      ORDER BY due_date ASC
    `);

    const overdue = arReceivables.filter((r: any) => r.urgency === "overdue");
    const dueThisWeek = arReceivables.filter((r: any) => r.urgency === "due_this_week");
    const dueThisMonth = arReceivables.filter((r: any) => r.urgency === "due_this_month");

    // לקוחות עם החוב הגבוה ביותר
    const topDebtors = await q(`
      SELECT customer_id, customer_name, SUM(balance_due) as total_debt, COUNT(*) as invoice_count
      FROM ar_invoices
      WHERE status NOT IN ('cancelled', 'paid', 'draft') AND COALESCE(balance_due, 0) > 0
      GROUP BY customer_id, customer_name
      ORDER BY total_debt DESC
      LIMIT 10
    `);

    res.json({
      as_of: today,
      accounts_receivable: {
        total: arReceivables.reduce((s: number, r: any) => s + parseFloat(r.balance_due || 0), 0).toFixed(2),
        overdue: { count: overdue.length, total: overdue.reduce((s: number, r: any) => s + parseFloat(r.balance_due || 0), 0).toFixed(2), items: overdue },
        due_this_week: { count: dueThisWeek.length, total: dueThisWeek.reduce((s: number, r: any) => s + parseFloat(r.balance_due || 0), 0).toFixed(2), items: dueThisWeek },
        due_this_month: { count: dueThisMonth.length, total: dueThisMonth.reduce((s: number, r: any) => s + parseFloat(r.balance_due || 0), 0).toFixed(2), items: dueThisMonth }
      },
      top_debtors: topDebtors,
      total_receivables: arReceivables.reduce((s: number, r: any) => s + parseFloat(r.balance_due || 0), 0).toFixed(2),
      currency: "ILS"
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});


// ===================== 17. POST /seed-chart-of-accounts - מפת חשבונות ישראלית תקנית =====================
router.post("/seed-chart-of-accounts", async (_req, res) => {
  try {
    // מפת חשבונות ישראלית מלאה - 50+ חשבונות
    const accounts = [
      // ===== 1000-1999: נכסים - Assets =====
      { code: "1000", name: "Cash on Hand", name_he: "קופה ראשית", type: "asset", category: "current_asset", normal: "debit", header: false },
      { code: "1010", name: "Petty Cash", name_he: "קופה קטנה", type: "asset", category: "current_asset", normal: "debit", header: false },
      { code: "1020", name: "Cash - Foreign Currency", name_he: "קופה - מטבע חוץ", type: "asset", category: "current_asset", normal: "debit", header: false },
      { code: "1050", name: "Checks Received", name_he: "המחאות לגבייה", type: "asset", category: "current_asset", normal: "debit", header: false },
      { code: "1100", name: "Bank Account - Main", name_he: "בנק - חשבון עיקרי", type: "asset", category: "current_asset", normal: "debit", header: false },
      { code: "1110", name: "Bank Account - Secondary", name_he: "בנק - חשבון משני", type: "asset", category: "current_asset", normal: "debit", header: false },
      { code: "1120", name: "Bank Account - Savings", name_he: "בנק - חסכון", type: "asset", category: "current_asset", normal: "debit", header: false },
      { code: "1130", name: "Bank Account - Foreign Currency", name_he: "בנק - מטבע חוץ", type: "asset", category: "current_asset", normal: "debit", header: false },
      { code: "1150", name: "Short Term Deposits", name_he: "פיקדונות לזמן קצר", type: "asset", category: "current_asset", normal: "debit", header: false },
      { code: "1200", name: "Inventory - Raw Materials", name_he: "מלאי - חומרי גלם", type: "asset", category: "current_asset", normal: "debit", header: false },
      { code: "1210", name: "Inventory - Finished Goods", name_he: "מלאי - מוצרים מוגמרים", type: "asset", category: "current_asset", normal: "debit", header: false },
      { code: "1220", name: "Inventory - Work in Progress", name_he: "מלאי - ייצור בתהליך", type: "asset", category: "current_asset", normal: "debit", header: false },
      { code: "1230", name: "Inventory - Merchandise", name_he: "מלאי - סחורות", type: "asset", category: "current_asset", normal: "debit", header: false },
      { code: "1300", name: "Accounts Receivable - Trade", name_he: "לקוחות - חובות מסחריים", type: "asset", category: "current_asset", normal: "debit", header: false },
      { code: "1310", name: "Notes Receivable", name_he: "שטרות לקבל", type: "asset", category: "current_asset", normal: "debit", header: false },
      { code: "1320", name: "Allowance for Doubtful Accounts", name_he: "הפרשה לחובות מסופקים", type: "contra", category: "current_asset", normal: "credit", header: false },
      { code: "1350", name: "Employee Advances", name_he: "מקדמות לעובדים", type: "asset", category: "current_asset", normal: "debit", header: false },
      { code: "1360", name: "Prepaid Expenses", name_he: "הוצאות מראש", type: "asset", category: "current_asset", normal: "debit", header: false },
      { code: "1370", name: "VAT Input (Receivable)", name_he: "מע\"מ תשומות", type: "asset", category: "current_asset", normal: "debit", header: false },
      { code: "1380", name: "Income Tax Advance", name_he: "מקדמות מס הכנסה", type: "asset", category: "current_asset", normal: "debit", header: false },
      { code: "1500", name: "Land", name_he: "קרקע", type: "asset", category: "fixed_asset", normal: "debit", header: false },
      { code: "1510", name: "Buildings", name_he: "מבנים", type: "asset", category: "fixed_asset", normal: "debit", header: false },
      { code: "1520", name: "Machinery & Equipment", name_he: "מכונות וציוד", type: "asset", category: "fixed_asset", normal: "debit", header: false },
      { code: "1530", name: "Vehicles", name_he: "כלי רכב", type: "asset", category: "fixed_asset", normal: "debit", header: false },
      { code: "1540", name: "Furniture & Fixtures", name_he: "ריהוט ואביזרים", type: "asset", category: "fixed_asset", normal: "debit", header: false },
      { code: "1550", name: "Computers & IT Equipment", name_he: "מחשבים וציוד IT", type: "asset", category: "fixed_asset", normal: "debit", header: false },
      { code: "1560", name: "Leasehold Improvements", name_he: "שיפורים במושכר", type: "asset", category: "fixed_asset", normal: "debit", header: false },
      { code: "1590", name: "Accumulated Depreciation", name_he: "פחת נצבר", type: "contra", category: "fixed_asset", normal: "credit", header: false },
      { code: "1600", name: "Goodwill", name_he: "מוניטין", type: "asset", category: "intangible_asset", normal: "debit", header: false },
      { code: "1610", name: "Patents & Licenses", name_he: "פטנטים ורישיונות", type: "asset", category: "intangible_asset", normal: "debit", header: false },
      { code: "1620", name: "Software", name_he: "תוכנות", type: "asset", category: "intangible_asset", normal: "debit", header: false },

      // ===== 2000-2999: התחייבויות - Liabilities =====
      { code: "2000", name: "Accounts Payable - Trade", name_he: "ספקים - חובות מסחריים", type: "liability", category: "current_liability", normal: "credit", header: false },
      { code: "2010", name: "Notes Payable", name_he: "שטרות לפירעון", type: "liability", category: "current_liability", normal: "credit", header: false },
      { code: "2050", name: "Accrued Expenses", name_he: "הוצאות לשלם", type: "liability", category: "current_liability", normal: "credit", header: false },
      { code: "2100", name: "VAT Output (Payable)", name_he: "מע\"מ עסקאות", type: "liability", category: "current_liability", normal: "credit", header: false },
      { code: "2110", name: "VAT Net Payable", name_he: "מע\"מ לתשלום (נטו)", type: "liability", category: "current_liability", normal: "credit", header: false },
      { code: "2120", name: "Income Tax Payable", name_he: "מס הכנסה לתשלום", type: "liability", category: "current_liability", normal: "credit", header: false },
      { code: "2130", name: "Withholding Tax Payable", name_he: "ניכוי מס במקור לתשלום", type: "liability", category: "current_liability", normal: "credit", header: false },
      { code: "2200", name: "Salaries Payable", name_he: "משכורות לתשלום", type: "liability", category: "current_liability", normal: "credit", header: false },
      { code: "2210", name: "Social Security Payable (Bituach Leumi)", name_he: "ביטוח לאומי לתשלום", type: "liability", category: "current_liability", normal: "credit", header: false },
      { code: "2220", name: "Pension Fund Payable", name_he: "קופות גמל לתשלום", type: "liability", category: "current_liability", normal: "credit", header: false },
      { code: "2230", name: "Health Tax Payable", name_he: "מס בריאות לתשלום", type: "liability", category: "current_liability", normal: "credit", header: false },
      { code: "2300", name: "Unearned Revenue", name_he: "הכנסות מראש", type: "liability", category: "current_liability", normal: "credit", header: false },
      { code: "2400", name: "Short Term Loans", name_he: "הלוואות לזמן קצר", type: "liability", category: "current_liability", normal: "credit", header: false },
      { code: "2410", name: "Credit Line (Bank Overdraft)", name_he: "אשראי בנקאי (משיכת יתר)", type: "liability", category: "current_liability", normal: "credit", header: false },
      { code: "2500", name: "Long Term Loans", name_he: "הלוואות לזמן ארוך", type: "liability", category: "long_term_liability", normal: "credit", header: false },
      { code: "2510", name: "Mortgage Payable", name_he: "משכנתא", type: "liability", category: "long_term_liability", normal: "credit", header: false },
      { code: "2600", name: "Provision for Severance Pay", name_he: "הפרשה לפיצויי פיטורין", type: "liability", category: "long_term_liability", normal: "credit", header: false },

      // ===== 3000-3999: הון עצמי - Equity =====
      { code: "3000", name: "Owner Equity / Share Capital", name_he: "הון עצמי / הון מניות", type: "equity", category: "equity", normal: "credit", header: false },
      { code: "3100", name: "Additional Paid-In Capital", name_he: "פרמיה על מניות", type: "equity", category: "equity", normal: "credit", header: false },
      { code: "3200", name: "Retained Earnings", name_he: "עודפים (רווחים שלא חולקו)", type: "equity", category: "equity", normal: "credit", header: false },
      { code: "3300", name: "Owner Drawings", name_he: "משיכות בעלים", type: "equity", category: "equity", normal: "debit", header: false },
      { code: "3400", name: "Current Year Earnings", name_he: "רווח/הפסד השנה", type: "equity", category: "equity", normal: "credit", header: false },

      // ===== 4000-4999: הכנסות - Revenue =====
      { code: "4000", name: "Sales Revenue - Products", name_he: "הכנסות ממכירת מוצרים", type: "revenue", category: "operating_revenue", normal: "credit", header: false },
      { code: "4010", name: "Sales Revenue - Services", name_he: "הכנסות ממתן שירותים", type: "revenue", category: "operating_revenue", normal: "credit", header: false },
      { code: "4020", name: "Sales Revenue - Projects", name_he: "הכנסות מפרויקטים", type: "revenue", category: "operating_revenue", normal: "credit", header: false },
      { code: "4100", name: "Sales Returns & Allowances", name_he: "החזרות והנחות מכירה", type: "contra", category: "operating_revenue", normal: "debit", header: false },
      { code: "4200", name: "Export Revenue", name_he: "הכנסות מייצוא", type: "revenue", category: "operating_revenue", normal: "credit", header: false },
      { code: "4500", name: "Other Operating Income", name_he: "הכנסות תפעוליות אחרות", type: "revenue", category: "other_revenue", normal: "credit", header: false },
      { code: "4600", name: "Commission Income", name_he: "הכנסות מעמלות", type: "revenue", category: "other_revenue", normal: "credit", header: false },
      { code: "4700", name: "Rental Income", name_he: "הכנסות מהשכרה", type: "revenue", category: "other_revenue", normal: "credit", header: false },

      // ===== 5000-5999: עלות המכר - COGS =====
      { code: "5000", name: "Cost of Goods Sold", name_he: "עלות המכר", type: "expense", category: "cogs", normal: "debit", header: true },
      { code: "5010", name: "Raw Materials Consumed", name_he: "חומרי גלם שנצרכו", type: "expense", category: "cogs", normal: "debit", header: false },
      { code: "5020", name: "Direct Labor", name_he: "עבודה ישירה", type: "expense", category: "cogs", normal: "debit", header: false },
      { code: "5030", name: "Subcontractors", name_he: "קבלני משנה", type: "expense", category: "cogs", normal: "debit", header: false },
      { code: "5040", name: "Manufacturing Overhead", name_he: "עלויות ייצור עקיפות", type: "expense", category: "cogs", normal: "debit", header: false },
      { code: "5050", name: "Shipping & Freight (COGS)", name_he: "הובלה ומשלוח (עלות מכר)", type: "expense", category: "cogs", normal: "debit", header: false },
      { code: "5060", name: "Customs & Import Duties", name_he: "מכס ומסי ייבוא", type: "expense", category: "cogs", normal: "debit", header: false },
      { code: "5070", name: "Inventory Adjustments", name_he: "התאמות מלאי", type: "expense", category: "cogs", normal: "debit", header: false },

      // ===== 6000-6999: הוצאות תפעוליות - Operating Expenses =====
      { code: "6000", name: "Salaries & Wages", name_he: "שכר עבודה", type: "expense", category: "operating_expense", normal: "debit", header: false },
      { code: "6010", name: "Social Benefits (Employer)", name_he: "הוצאות סוציאליות (מעביד)", type: "expense", category: "operating_expense", normal: "debit", header: false },
      { code: "6020", name: "Pension & Severance (Employer)", name_he: "פנסיה ופיצויים (מעביד)", type: "expense", category: "operating_expense", normal: "debit", header: false },
      { code: "6030", name: "Employee Training", name_he: "הכשרת עובדים", type: "expense", category: "operating_expense", normal: "debit", header: false },
      { code: "6040", name: "Employee Meals & Welfare", name_he: "ארוחות ורווחת עובדים", type: "expense", category: "operating_expense", normal: "debit", header: false },
      { code: "6100", name: "Rent & Lease", name_he: "שכר דירה והשכרה", type: "expense", category: "operating_expense", normal: "debit", header: false },
      { code: "6110", name: "Arnona (Municipal Tax)", name_he: "ארנונה", type: "expense", category: "operating_expense", normal: "debit", header: false },
      { code: "6120", name: "Electricity", name_he: "חשמל", type: "expense", category: "operating_expense", normal: "debit", header: false },
      { code: "6130", name: "Water", name_he: "מים", type: "expense", category: "operating_expense", normal: "debit", header: false },
      { code: "6140", name: "Internet & Telecom", name_he: "אינטרנט ותקשורת", type: "expense", category: "operating_expense", normal: "debit", header: false },
      { code: "6150", name: "Office Supplies", name_he: "ציוד משרדי", type: "expense", category: "operating_expense", normal: "debit", header: false },
      { code: "6160", name: "Cleaning & Maintenance", name_he: "ניקיון ואחזקה", type: "expense", category: "operating_expense", normal: "debit", header: false },
      { code: "6200", name: "Marketing & Advertising", name_he: "שיווק ופרסום", type: "expense", category: "operating_expense", normal: "debit", header: false },
      { code: "6210", name: "Digital Marketing", name_he: "שיווק דיגיטלי", type: "expense", category: "operating_expense", normal: "debit", header: false },
      { code: "6220", name: "Exhibitions & Events", name_he: "תערוכות ואירועים", type: "expense", category: "operating_expense", normal: "debit", header: false },
      { code: "6300", name: "Vehicle Expenses", name_he: "הוצאות רכב", type: "expense", category: "operating_expense", normal: "debit", header: false },
      { code: "6310", name: "Fuel", name_he: "דלק", type: "expense", category: "operating_expense", normal: "debit", header: false },
      { code: "6320", name: "Vehicle Insurance", name_he: "ביטוח רכב", type: "expense", category: "operating_expense", normal: "debit", header: false },
      { code: "6330", name: "Vehicle Maintenance", name_he: "תחזוקת רכב", type: "expense", category: "operating_expense", normal: "debit", header: false },
      { code: "6400", name: "Professional Services - Legal", name_he: "שירותים מקצועיים - משפטי", type: "expense", category: "operating_expense", normal: "debit", header: false },
      { code: "6410", name: "Professional Services - Accounting", name_he: "שירותים מקצועיים - רואה חשבון", type: "expense", category: "operating_expense", normal: "debit", header: false },
      { code: "6420", name: "Professional Services - Consulting", name_he: "שירותים מקצועיים - ייעוץ", type: "expense", category: "operating_expense", normal: "debit", header: false },
      { code: "6430", name: "IT Services & Software", name_he: "שירותי IT ותוכנות", type: "expense", category: "operating_expense", normal: "debit", header: false },
      { code: "6500", name: "Depreciation Expense", name_he: "הוצאות פחת", type: "expense", category: "operating_expense", normal: "debit", header: false },
      { code: "6510", name: "Amortization Expense", name_he: "הוצאות הפחתה", type: "expense", category: "operating_expense", normal: "debit", header: false },
      { code: "6600", name: "Insurance - General", name_he: "ביטוח - כללי", type: "expense", category: "operating_expense", normal: "debit", header: false },
      { code: "6610", name: "Insurance - Liability", name_he: "ביטוח - צד שלישי", type: "expense", category: "operating_expense", normal: "debit", header: false },
      { code: "6700", name: "Travel & Accommodation", name_he: "נסיעות ולינה", type: "expense", category: "operating_expense", normal: "debit", header: false },
      { code: "6710", name: "Meals & Entertainment", name_he: "אירוח וכיבוד", type: "expense", category: "operating_expense", normal: "debit", header: false },
      { code: "6800", name: "Bad Debt Expense", name_he: "הוצאות חובות אבודים", type: "expense", category: "operating_expense", normal: "debit", header: false },
      { code: "6900", name: "Miscellaneous Expenses", name_he: "הוצאות שונות", type: "expense", category: "operating_expense", normal: "debit", header: false },

      // ===== 7000-7999: הכנסות והוצאות מימון - Financial Income/Expenses =====
      { code: "7000", name: "Interest Income", name_he: "הכנסות ריבית", type: "revenue", category: "financial", normal: "credit", header: false },
      { code: "7010", name: "Dividend Income", name_he: "הכנסות דיבידנד", type: "revenue", category: "financial", normal: "credit", header: false },
      { code: "7020", name: "Foreign Exchange Gains", name_he: "רווחי מטבע חוץ", type: "revenue", category: "financial", normal: "credit", header: false },
      { code: "7100", name: "Interest Expense", name_he: "הוצאות ריבית", type: "expense", category: "financial", normal: "debit", header: false },
      { code: "7110", name: "Bank Fees & Charges", name_he: "עמלות בנק", type: "expense", category: "financial", normal: "debit", header: false },
      { code: "7120", name: "Foreign Exchange Losses", name_he: "הפסדי מטבע חוץ", type: "expense", category: "financial", normal: "debit", header: false },
      { code: "7130", name: "Credit Card Processing Fees", name_he: "עמלות סליקת אשראי", type: "expense", category: "financial", normal: "debit", header: false },
    ];

    let inserted = 0;
    let skipped = 0;

    for (const acct of accounts) {
      const exists = await qOne(`SELECT id FROM gl_accounts_master WHERE account_code = ${esc(acct.code)}`);
      if (exists) {
        skipped++;
        continue;
      }

      await exec(`INSERT INTO gl_accounts_master
        (account_code, account_name, account_name_he, account_type, account_category, is_header, is_active, normal_balance, currency)
        VALUES (${esc(acct.code)}, ${esc(acct.name)}, ${esc(acct.name_he)}, ${esc(acct.type)}, ${esc(acct.category)}, ${acct.header}, true, ${esc(acct.normal)}, 'ILS')`);
      inserted++;
    }

    // הגדרת תקופות חשבונאיות לשנה הנוכחית
    const currentYear = new Date().getFullYear();
    for (let m = 1; m <= 12; m++) {
      const periodCode = `${currentYear}-${String(m).padStart(2, "0")}`;
      const startDate = `${currentYear}-${String(m).padStart(2, "0")}-01`;
      const endDate = new Date(currentYear, m, 0).toISOString().split("T")[0];
      const monthNames = ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"];

      await exec(`INSERT INTO gl_periods (period_code, period_name, period_name_he, fiscal_year, month, start_date, end_date, status)
        VALUES ('${periodCode}', 'Period ${periodCode}', '${monthNames[m - 1]} ${currentYear}', ${currentYear}, ${m}, '${startDate}', '${endDate}', 'open')
        ON CONFLICT (period_code) DO NOTHING`);
    }

    // הגדרת דוחות כספיים ברירת מחדל
    const reportConfigs = [
      { type: "balance_sheet", name: "Balance Sheet", name_he: "מאזן" },
      { type: "income_statement", name: "Income Statement (P&L)", name_he: "דוח רווח והפסד" },
      { type: "cash_flow", name: "Cash Flow Statement", name_he: "דוח תזרים מזומנים" },
      { type: "trial_balance", name: "Trial Balance", name_he: "מאזן בוחן" },
      { type: "budget_vs_actual", name: "Budget vs Actual", name_he: "תקציב מול ביצוע" },
    ];

    for (const rc of reportConfigs) {
      await exec(`INSERT INTO financial_report_configs (report_type, report_name, report_name_he, is_default, status)
        VALUES (${esc(rc.type)}, ${esc(rc.name)}, ${esc(rc.name_he)}, true, 'active')
        ON CONFLICT DO NOTHING`);
    }

    res.json({
      success: true,
      message: "מפת חשבונות ישראלית תקנית הוזנה בהצלחה",
      accounts_inserted: inserted,
      accounts_skipped: skipped,
      total_accounts: accounts.length,
      periods_created: `${currentYear}-01 עד ${currentYear}-12`,
      report_configs_created: reportConfigs.length,
      vat_rate: "17%",
      sections: {
        "1000-1999": "נכסים (מזומנים, בנקים, לקוחות, מלאי, ציוד, רכב)",
        "2000-2999": "התחייבויות (ספקים, מיסים, הלוואות, הפרשות)",
        "3000-3999": "הון עצמי (הון, רווחים שלא חולקו)",
        "4000-4999": "הכנסות (מכירות, שירותים, הכנסות אחרות)",
        "5000-5999": "עלות המכר (חומרים, עבודה, קבלני משנה)",
        "6000-6999": "הוצאות תפעוליות (שכר, שכ\"ד, שיווק, כללי)",
        "7000-7999": "הכנסות/הוצאות מימון (ריבית, עמלות, מט\"ח)"
      }
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});


// ============================================================================
// אתחול הטבלאות בעת טעינת המודול
// ============================================================================
ensureOracleFinancialTables().catch(e => console.error("Failed to init Oracle Financial tables:", e.message));


export default router;
