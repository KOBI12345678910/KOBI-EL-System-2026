/**
 * מנוע הנהלת חשבונות ישראלית
 * ניהול דוחות מס, לוח שנה מס, אישורי ניכוי מס במקור
 * תואם לדרישות רשות המיסים בישראל
 * כולל חישוב מע"מ, מקדמות מס הכנסה, ביטוח לאומי ומס בריאות
 */

import { Router, Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { validateSession } from "../lib/auth";
import { VAT_RATE } from "../constants";

// ===================== טיפוסים =====================

interface AuthRequest extends Request {
  user?: { id: number; username: string; role?: string };
}

interface QueryRow {
  [key: string]: unknown;
}

// ===================== קבועי מס ישראליים =====================

const WITHHOLDING_TAX_DEFAULT = 0.30; // ניכוי מס במקור ברירת מחדל 30%
const NATIONAL_INSURANCE_RATE_EMPLOYEE = 0.12; // ביטוח לאומי עובד
const HEALTH_TAX_RATE = 0.05; // מס בריאות

// סוגי דוחות מס
const TAX_REPORT_TYPES = [
  { type: "vat_monthly", name: "דוח מע\"מ חודשי", frequency: "monthly" },
  { type: "vat_bimonthly", name: "דוח מע\"מ דו-חודשי", frequency: "bimonthly" },
  { type: "income_tax_advance", name: "מקדמות מס הכנסה", frequency: "monthly" },
  { type: "national_insurance", name: "ביטוח לאומי", frequency: "monthly" },
  { type: "withholding_856", name: "דוח 856 - ניכוי במקור", frequency: "monthly" },
  { type: "annual_report", name: "דוח שנתי", frequency: "annual" },
  { type: "annual_withholding", name: "דוח ניכויים שנתי", frequency: "annual" },
];

// לוח זמנים מיסוי - תאריכי דיווח קבועים
const TAX_DEADLINES_TEMPLATE = [
  { tax_type: "vat", description: "VAT Report", description_he: "דוח מע\"מ", day_of_month: 15 },
  { tax_type: "income_tax_advance", description: "Income Tax Advance", description_he: "מקדמות מס הכנסה", day_of_month: 15 },
  { tax_type: "national_insurance", description: "National Insurance", description_he: "ביטוח לאומי ומס בריאות", day_of_month: 15 },
  { tax_type: "withholding_856", description: "Withholding Tax Report", description_he: "דוח 856 ניכוי במקור", day_of_month: 15 },
  { tax_type: "annual_return", description: "Annual Tax Return", description_he: "דוח שנתי למס הכנסה", day_of_month: 30, month: 5 },
  { tax_type: "annual_withholding_cert", description: "Annual Withholding Certificates", description_he: "אישורי ניכוי שנתיים", day_of_month: 31, month: 3 },
];

// ===================== ראוטר =====================

const router = Router();

// ===================== אימות =====================

async function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.substring(7) : (req.query.token as string) || null;
  if (!token) { res.status(401).json({ error: "נדרשת התחברות" }); return; }
  const result = await validateSession(token);
  if (result.error || !result.user) { res.status(401).json({ error: "הסשן פג תוקף" }); return; }
  req.user = result.user;
  next();
}

router.use("/israeli-accounting", requireAuth as (req: Request, res: Response, next: NextFunction) => void);

// ===================== שאילתה בטוחה =====================

async function safeQuery(query: string): Promise<QueryRow[]> {
  try {
    const result = await db.execute(sql.raw(query));
    return (result.rows || []) as QueryRow[];
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("שגיאת שאילתת חשבונאות:", message);
    return [];
  }
}

// ===================== אתחול טבלאות =====================

router.post("/israeli-accounting/init", async (_req: Request, res: Response) => {
  try {
    // טבלת דוחות מס
    await db.execute(sql.raw(`
      CREATE TABLE IF NOT EXISTS tax_reports (
        id SERIAL PRIMARY KEY,
        report_type VARCHAR(100),
        period VARCHAR(20),
        fiscal_year INTEGER,
        vat_on_sales NUMERIC(15,2) DEFAULT 0,
        vat_on_purchases NUMERIC(15,2) DEFAULT 0,
        vat_payable NUMERIC(15,2) DEFAULT 0,
        income_tax_advance NUMERIC(15,2) DEFAULT 0,
        national_insurance NUMERIC(15,2) DEFAULT 0,
        health_tax NUMERIC(15,2) DEFAULT 0,
        withholding_tax_collected NUMERIC(15,2) DEFAULT 0,
        total_tax_liability NUMERIC(15,2) DEFAULT 0,
        filing_deadline DATE,
        filed_at TIMESTAMPTZ,
        filed_by VARCHAR(255),
        confirmation_number VARCHAR(100),
        status VARCHAR(50) DEFAULT 'draft',
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `));

    // טבלת לוח שנה מס
    await db.execute(sql.raw(`
      CREATE TABLE IF NOT EXISTS tax_calendar (
        id SERIAL PRIMARY KEY,
        tax_type VARCHAR(100),
        description VARCHAR(500),
        description_he VARCHAR(500),
        due_date DATE,
        amount_due NUMERIC(15,2),
        amount_paid NUMERIC(15,2) DEFAULT 0,
        responsible VARCHAR(255),
        filing_url VARCHAR(500),
        status VARCHAR(50) DEFAULT 'upcoming',
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `));

    // טבלת אישורי ניכוי מס במקור
    await db.execute(sql.raw(`
      CREATE TABLE IF NOT EXISTS withholding_tax_certificates (
        id SERIAL PRIMARY KEY,
        certificate_number VARCHAR(100),
        vendor_id INTEGER,
        vendor_name VARCHAR(255),
        vendor_tax_id VARCHAR(20),
        period VARCHAR(20),
        fiscal_year INTEGER,
        total_payments NUMERIC(15,2),
        withholding_rate NUMERIC(5,2),
        withholding_amount NUMERIC(15,2),
        issued_date DATE,
        sent_to_vendor BOOLEAN DEFAULT false,
        status VARCHAR(50) DEFAULT 'draft',
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `));

    // אינדקסים
    await db.execute(sql.raw(`CREATE INDEX IF NOT EXISTS idx_tax_reports_type_period ON tax_reports(report_type, period)`));
    await db.execute(sql.raw(`CREATE INDEX IF NOT EXISTS idx_tax_reports_year ON tax_reports(fiscal_year)`));
    await db.execute(sql.raw(`CREATE INDEX IF NOT EXISTS idx_tax_calendar_due ON tax_calendar(due_date)`));
    await db.execute(sql.raw(`CREATE INDEX IF NOT EXISTS idx_tax_calendar_status ON tax_calendar(status)`));
    await db.execute(sql.raw(`CREATE INDEX IF NOT EXISTS idx_withholding_vendor ON withholding_tax_certificates(vendor_id)`));
    await db.execute(sql.raw(`CREATE INDEX IF NOT EXISTS idx_withholding_year ON withholding_tax_certificates(fiscal_year)`));

    res.json({
      success: true,
      message: "טבלאות הנהלת חשבונות אותחלו בהצלחה",
      tables: ["tax_reports", "tax_calendar", "withholding_tax_certificates"],
      tax_report_types: TAX_REPORT_TYPES,
      constants: { vat_rate: VAT_RATE, withholding_default: WITHHOLDING_TAX_DEFAULT },
    });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : "שגיאה באתחול טבלאות חשבונאות" });
  }
});

// ===================== CRUD דוחות מס =====================

// רשימת דוחות מס
router.get("/israeli-accounting/tax-reports", async (req: Request, res: Response) => {
  try {
    const { report_type, fiscal_year, status, page = "1", limit = "50" } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let where = "WHERE 1=1";
    if (report_type) where += ` AND report_type = '${report_type}'`;
    if (fiscal_year) where += ` AND fiscal_year = ${Number(fiscal_year)}`;
    if (status) where += ` AND status = '${status}'`;

    const countRows = await safeQuery(`SELECT COUNT(*) as total FROM tax_reports ${where}`);
    const total = Number(countRows[0]?.total || 0);

    const rows = await safeQuery(`
      SELECT * FROM tax_reports ${where}
      ORDER BY fiscal_year DESC, period DESC
      LIMIT ${Number(limit)} OFFSET ${offset}
    `);

    res.json({
      reports: rows,
      pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) },
    });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : "שגיאה בשליפת דוחות מס" });
  }
});

// דוח מס בודד
router.get("/israeli-accounting/tax-reports/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const rows = await safeQuery(`SELECT * FROM tax_reports WHERE id = ${Number(id)}`);
    if (!rows.length) { res.status(404).json({ error: "דוח לא נמצא" }); return; }
    res.json({ report: rows[0] });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : "שגיאה בשליפת דוח" });
  }
});

// יצירת דוח מס
router.post("/israeli-accounting/tax-reports", async (req: AuthRequest, res: Response) => {
  try {
    const {
      report_type, period, fiscal_year, vat_on_sales, vat_on_purchases,
      income_tax_advance, national_insurance, health_tax,
      withholding_tax_collected, filing_deadline, status, notes,
    } = req.body;

    // חישוב מע"מ לתשלום
    const vatSales = Number(vat_on_sales) || 0;
    const vatPurchases = Number(vat_on_purchases) || 0;
    const vat_payable = vatSales - vatPurchases;

    // חישוב סה"כ חבות מס
    const total_tax_liability =
      vat_payable +
      (Number(income_tax_advance) || 0) +
      (Number(national_insurance) || 0) +
      (Number(health_tax) || 0);

    const rows = await safeQuery(`
      INSERT INTO tax_reports (
        report_type, period, fiscal_year, vat_on_sales, vat_on_purchases,
        vat_payable, income_tax_advance, national_insurance, health_tax,
        withholding_tax_collected, total_tax_liability, filing_deadline, status, notes
      ) VALUES (
        '${report_type}', '${period}', ${Number(fiscal_year)}, ${vatSales}, ${vatPurchases},
        ${vat_payable}, ${Number(income_tax_advance) || 0}, ${Number(national_insurance) || 0}, ${Number(health_tax) || 0},
        ${Number(withholding_tax_collected) || 0}, ${total_tax_liability},
        ${filing_deadline ? `'${filing_deadline}'` : 'NULL'}, '${status || 'draft'}', '${notes || ''}'
      ) RETURNING *
    `);

    res.json({ success: true, message: "דוח מס נוצר בהצלחה", report: rows[0] });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : "שגיאה ביצירת דוח מס" });
  }
});

// עדכון דוח מס
router.put("/israeli-accounting/tax-reports/:id", async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const fields = req.body;

    const setClauses: string[] = [];
    for (const [key, value] of Object.entries(fields)) {
      if (key === "id") continue;
      if (value === null || value === undefined) {
        setClauses.push(`${key} = NULL`);
      } else if (typeof value === "string") {
        setClauses.push(`${key} = '${value}'`);
      } else {
        setClauses.push(`${key} = ${value}`);
      }
    }
    setClauses.push("updated_at = NOW()");

    // חישוב מחדש של סכומים אם נשלחו ערכים
    if (fields.vat_on_sales !== undefined || fields.vat_on_purchases !== undefined) {
      const current = await safeQuery(`SELECT * FROM tax_reports WHERE id = ${Number(id)}`);
      if (current.length) {
        const vatSales = Number(fields.vat_on_sales ?? current[0].vat_on_sales) || 0;
        const vatPurchases = Number(fields.vat_on_purchases ?? current[0].vat_on_purchases) || 0;
        const vatPayable = vatSales - vatPurchases;
        setClauses.push(`vat_payable = ${vatPayable}`);

        const totalLiability =
          vatPayable +
          Number(fields.income_tax_advance ?? current[0].income_tax_advance ?? 0) +
          Number(fields.national_insurance ?? current[0].national_insurance ?? 0) +
          Number(fields.health_tax ?? current[0].health_tax ?? 0);
        setClauses.push(`total_tax_liability = ${totalLiability}`);
      }
    }

    const rows = await safeQuery(`UPDATE tax_reports SET ${setClauses.join(", ")} WHERE id = ${Number(id)} RETURNING *`);
    if (!rows.length) { res.status(404).json({ error: "דוח מס לא נמצא" }); return; }

    res.json({ success: true, message: "דוח מס עודכן בהצלחה", report: rows[0] });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : "שגיאה בעדכון דוח מס" });
  }
});

// ===================== CRUD לוח שנה מס =====================

// רשימת אירועי מס
router.get("/israeli-accounting/tax-calendar", async (req: Request, res: Response) => {
  try {
    const { status, tax_type, from_date, to_date } = req.query;

    let where = "WHERE 1=1";
    if (status) where += ` AND status = '${status}'`;
    if (tax_type) where += ` AND tax_type = '${tax_type}'`;
    if (from_date) where += ` AND due_date >= '${from_date}'`;
    if (to_date) where += ` AND due_date <= '${to_date}'`;

    const rows = await safeQuery(`
      SELECT * FROM tax_calendar ${where}
      ORDER BY due_date ASC
    `);

    // סיכום חובות קרובים - 30 יום הבאים
    const upcoming = await safeQuery(`
      SELECT tax_type, description_he, due_date, amount_due, amount_paid, status
      FROM tax_calendar
      WHERE due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'
        AND status NOT IN ('filed', 'paid')
      ORDER BY due_date ASC
    `);

    // חובות שעבר זמנם
    const overdue = await safeQuery(`
      SELECT * FROM tax_calendar
      WHERE due_date < CURRENT_DATE AND status NOT IN ('filed', 'paid')
      ORDER BY due_date ASC
    `);

    res.json({
      calendar: rows,
      upcoming,
      overdue,
      deadlines_template: TAX_DEADLINES_TEMPLATE,
    });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : "שגיאה בשליפת לוח שנה מס" });
  }
});

// יצירת אירוע מס
router.post("/israeli-accounting/tax-calendar", async (req: Request, res: Response) => {
  try {
    const { tax_type, description, description_he, due_date, amount_due, responsible, filing_url, status, notes } = req.body;

    const rows = await safeQuery(`
      INSERT INTO tax_calendar (tax_type, description, description_he, due_date, amount_due, responsible, filing_url, status, notes)
      VALUES ('${tax_type}', '${description || ''}', '${description_he || ''}', '${due_date}', ${Number(amount_due) || 0}, '${responsible || ''}', '${filing_url || ''}', '${status || 'upcoming'}', '${notes || ''}')
      RETURNING *
    `);

    res.json({ success: true, message: "אירוע מס נוסף ללוח השנה", event: rows[0] });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : "שגיאה ביצירת אירוע מס" });
  }
});

// עדכון אירוע מס
router.put("/israeli-accounting/tax-calendar/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const fields = req.body;

    const setClauses: string[] = [];
    for (const [key, value] of Object.entries(fields)) {
      if (key === "id") continue;
      if (value === null || value === undefined) {
        setClauses.push(`${key} = NULL`);
      } else if (typeof value === "string") {
        setClauses.push(`${key} = '${value}'`);
      } else {
        setClauses.push(`${key} = ${value}`);
      }
    }

    const rows = await safeQuery(`UPDATE tax_calendar SET ${setClauses.join(", ")} WHERE id = ${Number(id)} RETURNING *`);
    if (!rows.length) { res.status(404).json({ error: "אירוע מס לא נמצא" }); return; }

    res.json({ success: true, message: "אירוע מס עודכן", event: rows[0] });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : "שגיאה בעדכון אירוע מס" });
  }
});

// ===================== CRUD אישורי ניכוי מס במקור =====================

// רשימת אישורי ניכוי
router.get("/israeli-accounting/withholding-certificates", async (req: Request, res: Response) => {
  try {
    const { fiscal_year, vendor_id, status, page = "1", limit = "50" } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let where = "WHERE 1=1";
    if (fiscal_year) where += ` AND fiscal_year = ${Number(fiscal_year)}`;
    if (vendor_id) where += ` AND vendor_id = ${Number(vendor_id)}`;
    if (status) where += ` AND status = '${status}'`;

    const countRows = await safeQuery(`SELECT COUNT(*) as total FROM withholding_tax_certificates ${where}`);
    const total = Number(countRows[0]?.total || 0);

    const rows = await safeQuery(`
      SELECT * FROM withholding_tax_certificates ${where}
      ORDER BY fiscal_year DESC, vendor_name ASC
      LIMIT ${Number(limit)} OFFSET ${offset}
    `);

    res.json({
      certificates: rows,
      pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) },
    });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : "שגיאה בשליפת אישורי ניכוי" });
  }
});

// יצירת אישור ניכוי
router.post("/israeli-accounting/withholding-certificates", async (req: Request, res: Response) => {
  try {
    const {
      certificate_number, vendor_id, vendor_name, vendor_tax_id,
      period, fiscal_year, total_payments, withholding_rate, issued_date, status,
    } = req.body;

    const rate = Number(withholding_rate) || WITHHOLDING_TAX_DEFAULT * 100;
    const payments = Number(total_payments) || 0;
    const withholding_amount = payments * (rate / 100);

    const rows = await safeQuery(`
      INSERT INTO withholding_tax_certificates (
        certificate_number, vendor_id, vendor_name, vendor_tax_id,
        period, fiscal_year, total_payments, withholding_rate, withholding_amount,
        issued_date, status
      ) VALUES (
        '${certificate_number || ''}', ${vendor_id || 'NULL'}, '${vendor_name || ''}', '${vendor_tax_id || ''}',
        '${period || ''}', ${Number(fiscal_year)}, ${payments}, ${rate}, ${withholding_amount},
        ${issued_date ? `'${issued_date}'` : 'CURRENT_DATE'}, '${status || 'draft'}'
      ) RETURNING *
    `);

    res.json({ success: true, message: "אישור ניכוי מס במקור נוצר", certificate: rows[0] });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : "שגיאה ביצירת אישור ניכוי" });
  }
});

// עדכון אישור ניכוי
router.put("/israeli-accounting/withholding-certificates/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const fields = req.body;

    const setClauses: string[] = [];
    for (const [key, value] of Object.entries(fields)) {
      if (key === "id") continue;
      if (value === null || value === undefined) {
        setClauses.push(`${key} = NULL`);
      } else if (typeof value === "boolean") {
        setClauses.push(`${key} = ${value}`);
      } else if (typeof value === "string") {
        setClauses.push(`${key} = '${value}'`);
      } else {
        setClauses.push(`${key} = ${value}`);
      }
    }

    const rows = await safeQuery(`UPDATE withholding_tax_certificates SET ${setClauses.join(", ")} WHERE id = ${Number(id)} RETURNING *`);
    if (!rows.length) { res.status(404).json({ error: "אישור ניכוי לא נמצא" }); return; }

    res.json({ success: true, message: "אישור ניכוי עודכן", certificate: rows[0] });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : "שגיאה בעדכון אישור ניכוי" });
  }
});

// ===================== דוח מע"מ לתקופה =====================

router.get("/israeli-accounting/vat-report/:period", async (req: Request, res: Response) => {
  try {
    const { period } = req.params;

    // שליפת דוח מע"מ קיים לתקופה
    const existingReport = await safeQuery(`
      SELECT * FROM tax_reports
      WHERE report_type IN ('vat_monthly', 'vat_bimonthly') AND period = '${period}'
      ORDER BY created_at DESC LIMIT 1
    `);

    // ניסיון לשלוף נתוני מכירות ורכישות מטבלאות AR/AP קיימות
    const salesVat = await safeQuery(`
      SELECT
        COUNT(*) as invoice_count,
        COALESCE(SUM(CAST(data->>'total_amount' AS NUMERIC)), 0) as total_sales,
        COALESCE(SUM(CAST(data->>'vat_amount' AS NUMERIC)), 0) as vat_collected
      FROM entity_records
      WHERE entity_id = (SELECT id FROM module_entities WHERE slug = 'invoices' LIMIT 1)
        AND data->>'period' = '${period}'
        AND data->>'status' != 'cancelled'
    `);

    const purchaseVat = await safeQuery(`
      SELECT
        COUNT(*) as bill_count,
        COALESCE(SUM(CAST(data->>'total_amount' AS NUMERIC)), 0) as total_purchases,
        COALESCE(SUM(CAST(data->>'vat_amount' AS NUMERIC)), 0) as vat_deducted
      FROM entity_records
      WHERE entity_id = (SELECT id FROM module_entities WHERE slug = 'vendor-invoices' LIMIT 1)
        AND data->>'period' = '${period}'
        AND data->>'status' != 'cancelled'
    `);

    // מע"מ מיבוא
    const importVat = await safeQuery(`
      SELECT
        COUNT(*) as shipment_count,
        COALESCE(SUM(vat_amount), 0) as import_vat
      FROM import_shipments
      WHERE TO_CHAR(clearance_date, 'YYYY-MM') = '${period}'
        AND status != 'cancelled'
    `);

    const vatOnSales = Number(salesVat[0]?.vat_collected || 0);
    const vatOnPurchases = Number(purchaseVat[0]?.vat_deducted || 0) + Number(importVat[0]?.import_vat || 0);
    const vatPayable = vatOnSales - vatOnPurchases;

    res.json({
      period,
      existing_report: existingReport[0] || null,
      sales: {
        invoice_count: Number(salesVat[0]?.invoice_count || 0),
        total_sales: Number(salesVat[0]?.total_sales || 0),
        vat_collected: vatOnSales,
      },
      purchases: {
        bill_count: Number(purchaseVat[0]?.bill_count || 0),
        total_purchases: Number(purchaseVat[0]?.total_purchases || 0),
        vat_deducted: Number(purchaseVat[0]?.vat_deducted || 0),
      },
      imports: {
        shipment_count: Number(importVat[0]?.shipment_count || 0),
        import_vat: Number(importVat[0]?.import_vat || 0),
      },
      summary: {
        vat_on_sales: vatOnSales,
        vat_on_purchases: vatOnPurchases,
        vat_payable: vatPayable,
        is_refund: vatPayable < 0,
        description_he: vatPayable >= 0 ? `מע"מ לתשלום: ₪${vatPayable.toFixed(2)}` : `מע"מ להחזר: ₪${Math.abs(vatPayable).toFixed(2)}`,
      },
      vat_rate: VAT_RATE,
    });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : "שגיאה בהפקת דוח מע\"מ" });
  }
});

// ===================== חישוב מע"מ לתקופה =====================

router.post("/israeli-accounting/calculate-vat/:period", async (req: AuthRequest, res: Response) => {
  try {
    const { period } = req.params;
    const { fiscal_year, filing_deadline } = req.body;
    const year = Number(fiscal_year) || new Date().getFullYear();

    // שליפת מע"מ מכירות מחשבוניות
    const salesRows = await safeQuery(`
      SELECT
        COALESCE(SUM(CAST(data->>'vat_amount' AS NUMERIC)), 0) as vat_on_sales
      FROM entity_records
      WHERE entity_id = (SELECT id FROM module_entities WHERE slug = 'invoices' LIMIT 1)
        AND data->>'period' = '${period}'
        AND data->>'status' != 'cancelled'
    `);

    // שליפת מע"מ תשומות מחשבוניות ספקים
    const purchaseRows = await safeQuery(`
      SELECT
        COALESCE(SUM(CAST(data->>'vat_amount' AS NUMERIC)), 0) as vat_on_purchases
      FROM entity_records
      WHERE entity_id = (SELECT id FROM module_entities WHERE slug = 'vendor-invoices' LIMIT 1)
        AND data->>'period' = '${period}'
        AND data->>'status' != 'cancelled'
    `);

    // מע"מ יבוא
    const importRows = await safeQuery(`
      SELECT COALESCE(SUM(vat_amount), 0) as import_vat
      FROM import_shipments
      WHERE TO_CHAR(clearance_date, 'YYYY-MM') = '${period}' AND status != 'cancelled'
    `);

    const vatOnSales = Number(salesRows[0]?.vat_on_sales || 0);
    const vatOnPurchases = Number(purchaseRows[0]?.vat_on_purchases || 0) + Number(importRows[0]?.import_vat || 0);
    const vatPayable = vatOnSales - vatOnPurchases;

    // בדיקה אם כבר קיים דוח לתקופה
    const existing = await safeQuery(`SELECT id FROM tax_reports WHERE report_type = 'vat_monthly' AND period = '${period}' LIMIT 1`);

    let report;
    if (existing.length) {
      // עדכון דוח קיים
      const rows = await safeQuery(`
        UPDATE tax_reports SET
          vat_on_sales = ${vatOnSales},
          vat_on_purchases = ${vatOnPurchases},
          vat_payable = ${vatPayable},
          total_tax_liability = ${vatPayable},
          updated_at = NOW()
        WHERE id = ${existing[0].id}
        RETURNING *
      `);
      report = rows[0];
    } else {
      // יצירת דוח חדש
      const rows = await safeQuery(`
        INSERT INTO tax_reports (report_type, period, fiscal_year, vat_on_sales, vat_on_purchases, vat_payable, total_tax_liability, filing_deadline, status)
        VALUES ('vat_monthly', '${period}', ${year}, ${vatOnSales}, ${vatOnPurchases}, ${vatPayable}, ${vatPayable}, ${filing_deadline ? `'${filing_deadline}'` : 'NULL'}, 'draft')
        RETURNING *
      `);
      report = rows[0];
    }

    res.json({
      success: true,
      message: `חישוב מע"מ לתקופה ${period} הושלם`,
      report,
    });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : "שגיאה בחישוב מע\"מ" });
  }
});

// ===================== סיכום ניכויים שנתי =====================

router.get("/israeli-accounting/withholding-summary/:year", async (req: Request, res: Response) => {
  try {
    const { year } = req.params;

    // סיכום לפי ספק
    const byVendor = await safeQuery(`
      SELECT vendor_id, vendor_name, vendor_tax_id,
        SUM(total_payments) as total_payments,
        SUM(withholding_amount) as total_withheld,
        AVG(withholding_rate) as avg_rate,
        COUNT(*) as certificate_count,
        BOOL_AND(sent_to_vendor) as all_sent
      FROM withholding_tax_certificates
      WHERE fiscal_year = ${Number(year)}
      GROUP BY vendor_id, vendor_name, vendor_tax_id
      ORDER BY total_payments DESC
    `);

    // סיכומים כלליים
    const totals = await safeQuery(`
      SELECT
        COUNT(*) as total_certificates,
        COUNT(DISTINCT vendor_id) as unique_vendors,
        SUM(total_payments) as total_payments,
        SUM(withholding_amount) as total_withheld,
        COUNT(*) FILTER (WHERE sent_to_vendor = true) as sent_count,
        COUNT(*) FILTER (WHERE sent_to_vendor = false) as unsent_count
      FROM withholding_tax_certificates
      WHERE fiscal_year = ${Number(year)}
    `);

    // אישורים שטרם נשלחו
    const unsent = await safeQuery(`
      SELECT * FROM withholding_tax_certificates
      WHERE fiscal_year = ${Number(year)} AND sent_to_vendor = false
      ORDER BY vendor_name
    `);

    res.json({
      year: Number(year),
      totals: totals[0] || {},
      by_vendor: byVendor,
      unsent_certificates: unsent,
    });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : "שגיאה בסיכום ניכויים" });
  }
});

// ===================== דוח שנתי לרואה חשבון =====================

router.get("/israeli-accounting/annual-report/:year", async (req: Request, res: Response) => {
  try {
    const { year } = req.params;

    // סיכום דוחות מס לשנה
    const taxReports = await safeQuery(`
      SELECT report_type, period,
        vat_on_sales, vat_on_purchases, vat_payable,
        income_tax_advance, national_insurance, health_tax,
        withholding_tax_collected, total_tax_liability, status
      FROM tax_reports
      WHERE fiscal_year = ${Number(year)}
      ORDER BY period
    `);

    // סיכום שנתי מע"מ
    const vatSummary = await safeQuery(`
      SELECT
        SUM(vat_on_sales) as total_vat_sales,
        SUM(vat_on_purchases) as total_vat_purchases,
        SUM(vat_payable) as total_vat_payable,
        SUM(income_tax_advance) as total_income_advance,
        SUM(national_insurance) as total_national_insurance,
        SUM(health_tax) as total_health_tax,
        SUM(withholding_tax_collected) as total_withholding
      FROM tax_reports
      WHERE fiscal_year = ${Number(year)}
    `);

    // סיכום ניכויים
    const withholdingSummary = await safeQuery(`
      SELECT
        COUNT(DISTINCT vendor_id) as vendors_count,
        SUM(total_payments) as total_vendor_payments,
        SUM(withholding_amount) as total_withheld
      FROM withholding_tax_certificates
      WHERE fiscal_year = ${Number(year)}
    `);

    // סיכום יבוא
    const importSummary = await safeQuery(`
      SELECT
        COUNT(*) as shipment_count,
        SUM(cif_value) as total_cif,
        SUM(customs_duty_amount) as total_customs,
        SUM(vat_amount) as total_import_vat,
        SUM(total_landed_cost) as total_landed
      FROM import_shipments
      WHERE EXTRACT(YEAR FROM created_at) = ${Number(year)}
        AND status != 'cancelled'
    `);

    res.json({
      fiscal_year: Number(year),
      tax_reports: taxReports,
      annual_summary: vatSummary[0] || {},
      withholding_summary: withholdingSummary[0] || {},
      import_summary: importSummary[0] || {},
      report_status: {
        total_periods: taxReports.length,
        filed: taxReports.filter((r) => r.status === "filed").length,
        draft: taxReports.filter((r) => r.status === "draft").length,
        overdue: taxReports.filter((r) => r.status === "overdue").length,
      },
    });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : "שגיאה בהפקת דוח שנתי" });
  }
});

// ===================== שליחה לרואה חשבון =====================

router.post("/israeli-accounting/send-to-accountant", async (req: AuthRequest, res: Response) => {
  try {
    const { fiscal_year, period, include_vat = true, include_withholding = true, include_imports = true, accountant_email, notes } = req.body;
    const year = Number(fiscal_year) || new Date().getFullYear();

    // אריזת כל הנתונים הנדרשים
    const dataPackage: Record<string, unknown> = {
      generated_at: new Date().toISOString(),
      generated_by: (req as AuthRequest).user?.username || "unknown",
      fiscal_year: year,
      period: period || "annual",
      accountant_email: accountant_email || "",
      notes: notes || "",
    };

    if (include_vat) {
      // דוחות מע"מ
      const vatReports = await safeQuery(`
        SELECT * FROM tax_reports WHERE fiscal_year = ${year} ORDER BY period
      `);
      dataPackage.vat_reports = vatReports;

      // סיכום שנתי
      const vatTotals = await safeQuery(`
        SELECT
          SUM(vat_on_sales) as total_vat_sales,
          SUM(vat_on_purchases) as total_vat_purchases,
          SUM(vat_payable) as total_vat_payable
        FROM tax_reports WHERE fiscal_year = ${year}
      `);
      dataPackage.vat_totals = vatTotals[0];
    }

    if (include_withholding) {
      // אישורי ניכוי
      const certificates = await safeQuery(`
        SELECT * FROM withholding_tax_certificates WHERE fiscal_year = ${year} ORDER BY vendor_name
      `);
      dataPackage.withholding_certificates = certificates;

      // סיכום ניכויים
      const withholdingTotals = await safeQuery(`
        SELECT
          COUNT(DISTINCT vendor_id) as vendors,
          SUM(total_payments) as payments,
          SUM(withholding_amount) as withheld
        FROM withholding_tax_certificates WHERE fiscal_year = ${year}
      `);
      dataPackage.withholding_totals = withholdingTotals[0];
    }

    if (include_imports) {
      // נתוני יבוא
      const imports = await safeQuery(`
        SELECT id, shipment_number, supplier_name, country_of_origin,
          cif_value, customs_duty_amount, vat_amount, total_landed_cost, status
        FROM import_shipments
        WHERE EXTRACT(YEAR FROM created_at) = ${year} AND status != 'cancelled'
        ORDER BY created_at
      `);
      dataPackage.import_shipments = imports;
    }

    res.json({
      success: true,
      message: `חבילת נתונים לרואה חשבון לשנת ${year} מוכנה`,
      data_package: dataPackage,
      summary: {
        vat_reports_included: include_vat,
        withholding_included: include_withholding,
        imports_included: include_imports,
      },
    });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : "שגיאה בהכנת חבילת נתונים לרואה חשבון" });
  }
});

export default router;
