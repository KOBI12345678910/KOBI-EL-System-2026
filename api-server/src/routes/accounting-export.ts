/**
 * ייצוא חשבונאי לחשבשבת/פריורטי
 * מייצא נתוני חשבונות חודשיים בפורמט CSV תואם תוכנות הנהלת חשבונות ישראליות
 * כולל חשבוניות, תשלומים שהתקבלו, והוצאות ספקים
 *
 * @remarks
 * נגיש בסביבת פיתוח בלבד דרך Swagger UI (/api/docs)
 * בייצור: נגיש למנהלים ורואי חשבון בלבד
 */

import { Router, Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { validateSession } from "../lib/auth";

const router = Router();

interface AuthRequest extends Request {
  user?: { id: number; username: string; role?: string };
}

async function requireAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.substring(7) : null;
  if (!token) { res.status(401).json({ error: "נדרשת התחברות" }); return; }
  const result = await validateSession(token);
  if (result.error || !result.user) { res.status(401).json({ error: "הסשן פג תוקף" }); return; }
  req.user = result.user;
  const allowedRoles = new Set(["admin", "manager", "accountant", "finance", "management", "super_admin", "cfo", "controller"]);
  const role = result.user.role || "";
  if (!allowedRoles.has(role)) {
    res.status(403).json({ error: "נדרשת הרשאת מנהל או רואה חשבון" });
    return;
  }
  next();
}

router.use("/accounting-export", requireAdmin as (req: Request, res: Response, next: NextFunction) => void);

async function safeQuery(query: string): Promise<Record<string, unknown>[]> {
  try {
    const result = await db.execute(sql.raw(query));
    return (result.rows || []) as Record<string, unknown>[];
  } catch (err: unknown) {
    console.error("Accounting export query error:", err instanceof Error ? err.message : String(err));
    return [];
  }
}

function parseAndValidatePeriod(month: unknown, year: unknown): { m: number; y: number } | null {
  const m = Number(month);
  const y = Number(year);
  if (!Number.isInteger(m) || m < 1 || m > 12) return null;
  if (!Number.isInteger(y) || y < 2000 || y > 2100) return null;
  return { m, y };
}

function buildDateRange(m: number, y: number): { startDate: string; endDate: string } {
  const startDate = `${y}-${String(m).padStart(2, "0")}-01`;
  const endDate = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  return { startDate, endDate };
}

function escapeCSV(val: unknown): string {
  if (val === null || val === undefined) return "";
  const str = String(val);
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function toCSVRow(values: unknown[]): string {
  return values.map(escapeCSV).join(",");
}

/**
 * @openapi
 * /api/accounting-export/summary:
 *   get:
 *     tags: [Finance & Accounting]
 *     summary: סיכום נתונים לחודש — ספירה ואזהרות לחשבשבת
 *     description: |
 *       מחזיר ספירת רשומות וחסרים לחודש נבחר לפני ייצוא לחשבשבת.
 *       כולל: חשבוניות לקוחות, תשלומים שהתקבלו, חשבוניות ספקים.
 *       אזהרות: רשומות ללא מספר עוסק, ללא מספר חשבונית.
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - name: month
 *         in: query
 *         required: true
 *         schema: { type: integer, minimum: 1, maximum: 12, example: 3 }
 *       - name: year
 *         in: query
 *         required: true
 *         schema: { type: integer, example: 2025 }
 *     responses:
 *       200:
 *         description: סיכום נתונים ואזהרות
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 period:
 *                   type: object
 *                   properties:
 *                     month: { type: integer }
 *                     year: { type: integer }
 *                     startDate: { type: string, format: date }
 *                     endDate: { type: string, format: date }
 *                 counts:
 *                   type: object
 *                   properties:
 *                     customer_invoices: { type: integer }
 *                     customer_payments: { type: integer }
 *                     supplier_invoices: { type: integer }
 *                 warnings: { type: array, items: { type: string } }
 *                 ready: { type: boolean, description: "true אם אין אזהרות" }
 *       400: { description: "פרמטרים חסרים או לא תקינים" }
 *       401: { description: "נדרשת התחברות" }
 *       403: { description: "נדרשת הרשאת מנהל/רואה חשבון" }
 */
router.get("/accounting-export/summary", async (req: Request, res: Response) => {
  const period = parseAndValidatePeriod(req.query.month, req.query.year);
  if (!period) {
    res.status(400).json({ error: "נדרשים פרמטרים תקינים: month (1-12), year (2000-2100)" });
    return;
  }
  const { m, y } = period;
  const { startDate, endDate } = buildDateRange(m, y);

  const warnings: string[] = [];

  const invoiceCount = await safeQuery(`
    SELECT COUNT(*) as total FROM entity_records er
    JOIN module_entities me ON me.id = er.entity_id
    WHERE me.slug = 'customer-invoices'
      AND (er.data->>'invoice_date' >= '${startDate}' AND er.data->>'invoice_date' < '${endDate}')
      AND er.data->>'status' != 'cancelled'
  `);

  const paymentCount = await safeQuery(`
    SELECT COUNT(*) as total FROM customer_payments
    WHERE payment_date >= '${startDate}' AND payment_date < '${endDate}'
      AND status = 'completed'
  `);

  const supplierInvoiceCount = await safeQuery(`
    SELECT COUNT(*) as total FROM supplier_invoices
    WHERE invoice_date >= '${startDate}' AND invoice_date < '${endDate}'
      AND status != 'cancelled'
  `);

  const missingVat = await safeQuery(`
    SELECT COUNT(*) as total FROM entity_records er
    JOIN module_entities me ON me.id = er.entity_id
    WHERE me.slug = 'customer-invoices'
      AND (er.data->>'invoice_date' >= '${startDate}' AND er.data->>'invoice_date' < '${endDate}')
      AND er.data->>'status' != 'cancelled'
      AND (er.data->>'customer_tax_id' IS NULL OR er.data->>'customer_tax_id' = '' OR er.data->>'customer_tax_id' = 'null')
  `);

  const missingVatPayment = await safeQuery(`
    SELECT COUNT(*) as total FROM customer_payments
    WHERE payment_date >= '${startDate}' AND payment_date < '${endDate}'
      AND status = 'completed'
      AND (customer_tax_id IS NULL OR customer_tax_id = '')
  `);

  const missingVatCount = Number(missingVat[0]?.total || 0) + Number(missingVatPayment[0]?.total || 0);
  if (missingVatCount > 0) {
    warnings.push(`${missingVatCount} רשומות ללא מספר עוסק מורשה — יש להשלים לפני הייצוא`);
  }

  const missingInvoiceNum = await safeQuery(`
    SELECT COUNT(*) as total FROM entity_records er
    JOIN module_entities me ON me.id = er.entity_id
    WHERE me.slug = 'customer-invoices'
      AND (er.data->>'invoice_date' >= '${startDate}' AND er.data->>'invoice_date' < '${endDate}')
      AND er.data->>'status' != 'cancelled'
      AND (er.data->>'invoice_number' IS NULL OR er.data->>'invoice_number' = '')
  `);

  if (Number(missingInvoiceNum[0]?.total || 0) > 0) {
    warnings.push(`${missingInvoiceNum[0]?.total} חשבוניות ללא מספר חשבונית`);
  }

  res.json({
    period: { month: m, year: y, startDate, endDate },
    counts: {
      customer_invoices: Number(invoiceCount[0]?.total || 0),
      customer_payments: Number(paymentCount[0]?.total || 0),
      supplier_invoices: Number(supplierInvoiceCount[0]?.total || 0),
    },
    warnings,
    ready: warnings.length === 0,
  });
});

/**
 * @openapi
 * /api/accounting-export/invoices.csv:
 *   get:
 *     tags: [Finance & Accounting]
 *     summary: ייצוא חשבוניות לקוחות — CSV לחשבשבת/Priority
 *     description: |
 *       מייצא חשבוניות לקוחות לחודש נבחר בפורמט CSV עם BOM (UTF-8).
 *       תואם לייבוא ישיר לחשבשבת ו-Priority.
 *       כוֹלל: מספר חשבונית, תאריך, שם לקוח, ח.פ, סכומים (לפני מע"מ, מע"מ, כולל).
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - name: month
 *         in: query
 *         required: true
 *         schema: { type: integer, minimum: 1, maximum: 12, example: 3 }
 *       - name: year
 *         in: query
 *         required: true
 *         schema: { type: integer, example: 2025 }
 *     responses:
 *       200:
 *         description: קובץ CSV עם BOM לתמיכה בעברית
 *         content:
 *           text/csv:
 *             schema: { type: string, format: binary }
 *       400: { description: "פרמטרים חסרים או לא תקינים" }
 *       401: { description: "נדרשת התחברות" }
 */
router.get("/accounting-export/invoices.csv", async (req: Request, res: Response) => {
  const period = parseAndValidatePeriod(req.query.month, req.query.year);
  if (!period) { res.status(400).json({ error: "נדרשים פרמטרים תקינים: month (1-12), year (2000-2100)" }); return; }
  const { m, y } = period;
  const { startDate, endDate } = buildDateRange(m, y);

  const rows = await safeQuery(`
    SELECT
      er.data->>'invoice_number' AS invoice_number,
      er.data->>'invoice_date' AS invoice_date,
      er.data->>'customer_name' AS customer_name,
      er.data->>'customer_tax_id' AS customer_tax_id,
      er.data->>'subtotal' AS amount_before_vat,
      er.data->>'vat_amount' AS vat_amount,
      er.data->>'total_amount' AS total_amount,
      er.data->>'status' AS status,
      er.data->>'currency' AS currency,
      er.data->>'payment_method' AS payment_method,
      er.data->>'notes' AS notes
    FROM entity_records er
    JOIN module_entities me ON me.id = er.entity_id
    WHERE me.slug = 'customer-invoices'
      AND (er.data->>'invoice_date' >= '${startDate}' AND er.data->>'invoice_date' < '${endDate}')
      AND er.data->>'status' != 'cancelled'
    ORDER BY er.data->>'invoice_date', er.data->>'invoice_number'
  `);

  const filename = `חשבוניות_${y}_${String(m).padStart(2, "0")}.csv`;
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);

  const headers = [
    "מספר חשבונית",
    "תאריך חשבונית",
    "שם לקוח",
    "מספר עוסק/ח.פ לקוח",
    "סכום לפני מע\"מ",
    "סכום מע\"מ",
    "סכום כולל מע\"מ",
    "סטטוס",
    "מטבע",
    "אמצעי תשלום",
    "הערות",
  ];

  let csv = "\uFEFF";
  csv += toCSVRow(headers) + "\n";

  for (const row of rows) {
    csv += toCSVRow([
      row.invoice_number,
      row.invoice_date,
      row.customer_name,
      row.customer_tax_id,
      row.amount_before_vat,
      row.vat_amount,
      row.total_amount,
      row.status,
      row.currency || "ILS",
      row.payment_method,
      row.notes,
    ]) + "\n";
  }

  if (rows.length === 0) {
    csv += toCSVRow(["אין נתונים לתקופה הנבחרת", "", "", "", "", "", "", "", "", "", ""]) + "\n";
  }

  res.send(csv);
});

/**
 * @openapi
 * /api/accounting-export/payments.csv:
 *   get:
 *     tags: [Finance & Accounting]
 *     summary: ייצוא תשלומים שהתקבלו — CSV לחשבשבת/Priority
 *     description: |
 *       מייצא תשלומי לקוחות שהושלמו לחודש נבחר.
 *       כולל: מספר תשלום, תאריך, לקוח, ח.פ, חשבונית, סכום, אמצעי תשלום, שיק/העברה.
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - name: month
 *         in: query
 *         required: true
 *         schema: { type: integer, minimum: 1, maximum: 12, example: 3 }
 *       - name: year
 *         in: query
 *         required: true
 *         schema: { type: integer, example: 2025 }
 *     responses:
 *       200:
 *         description: קובץ CSV עם BOM לתמיכה בעברית
 *         content:
 *           text/csv:
 *             schema: { type: string, format: binary }
 *       400: { description: "פרמטרים חסרים או לא תקינים" }
 *       401: { description: "נדרשת התחברות" }
 */
router.get("/accounting-export/payments.csv", async (req: Request, res: Response) => {
  const period = parseAndValidatePeriod(req.query.month, req.query.year);
  if (!period) { res.status(400).json({ error: "נדרשים פרמטרים תקינים: month (1-12), year (2000-2100)" }); return; }
  const { m, y } = period;
  const { startDate, endDate } = buildDateRange(m, y);

  const rows = await safeQuery(`
    SELECT
      payment_number,
      payment_date,
      customer_name,
      customer_tax_id,
      invoice_number,
      amount,
      payment_method,
      reference_number,
      bank_name,
      check_number,
      status,
      notes
    FROM customer_payments
    WHERE payment_date >= '${startDate}' AND payment_date < '${endDate}'
      AND status = 'completed'
    ORDER BY payment_date, payment_number
  `);

  const filename = `תשלומים_${y}_${String(m).padStart(2, "0")}.csv`;
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);

  const headers = [
    "מספר תשלום",
    "תאריך תשלום",
    "שם לקוח",
    "מספר עוסק לקוח",
    "מספר חשבונית",
    "סכום",
    "אמצעי תשלום",
    "מספר אסמכתא",
    "שם בנק",
    "מספר שיק",
    "סטטוס",
    "הערות",
  ];

  let csv = "\uFEFF";
  csv += toCSVRow(headers) + "\n";

  for (const row of rows) {
    csv += toCSVRow([
      row.payment_number,
      row.payment_date,
      row.customer_name,
      row.customer_tax_id,
      row.invoice_number,
      row.amount,
      row.payment_method,
      row.reference_number,
      row.bank_name,
      row.check_number,
      row.status,
      row.notes,
    ]) + "\n";
  }

  if (rows.length === 0) {
    csv += toCSVRow(["אין נתונים לתקופה הנבחרת", "", "", "", "", "", "", "", "", "", "", ""]) + "\n";
  }

  res.send(csv);
});

/**
 * @openapi
 * /api/accounting-export/expenses.csv:
 *   get:
 *     tags: [Finance & Accounting]
 *     summary: ייצוא הוצאות ספקים — CSV לחשבשבת/Priority
 *     description: |
 *       מייצא חשבוניות ספקים להוצאות לחודש נבחר.
 *       כולל: ספק, ח.פ ספק, סכומים, מע"מ, יתרה לתשלום, הזמנת רכש.
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - name: month
 *         in: query
 *         required: true
 *         schema: { type: integer, minimum: 1, maximum: 12, example: 3 }
 *       - name: year
 *         in: query
 *         required: true
 *         schema: { type: integer, example: 2025 }
 *     responses:
 *       200:
 *         description: קובץ CSV עם BOM לתמיכה בעברית
 *         content:
 *           text/csv:
 *             schema: { type: string, format: binary }
 *       400: { description: "פרמטרים חסרים או לא תקינים" }
 *       401: { description: "נדרשת התחברות" }
 */
router.get("/accounting-export/expenses.csv", async (req: Request, res: Response) => {
  const period = parseAndValidatePeriod(req.query.month, req.query.year);
  if (!period) { res.status(400).json({ error: "נדרשים פרמטרים תקינים: month (1-12), year (2000-2100)" }); return; }
  const { m, y } = period;
  const { startDate, endDate } = buildDateRange(m, y);

  const rows = await safeQuery(`
    SELECT
      invoice_number,
      invoice_date,
      supplier_name,
      supplier_tax_id,
      invoice_type,
      subtotal,
      vat_rate,
      vat_amount,
      total_amount,
      amount_paid,
      (total_amount - COALESCE(amount_paid, 0)) AS balance_due,
      status,
      payment_method,
      po_number,
      item_description,
      notes
    FROM supplier_invoices
    WHERE invoice_date >= '${startDate}' AND invoice_date < '${endDate}'
      AND status != 'cancelled'
    ORDER BY invoice_date, invoice_number
  `);

  const filename = `הוצאות_ספקים_${y}_${String(m).padStart(2, "0")}.csv`;
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);

  const headers = [
    "מספר חשבונית",
    "תאריך חשבונית",
    "שם ספק",
    "מספר עוסק ספק",
    "סוג מסמך",
    "סכום לפני מע\"מ",
    "שיעור מע\"מ %",
    "סכום מע\"מ",
    "סכום כולל מע\"מ",
    "שולם",
    "יתרה לתשלום",
    "סטטוס",
    "אמצעי תשלום",
    "מספר הזמנת רכש",
    "תיאור",
    "הערות",
  ];

  let csv = "\uFEFF";
  csv += toCSVRow(headers) + "\n";

  for (const row of rows) {
    csv += toCSVRow([
      row.invoice_number,
      row.invoice_date,
      row.supplier_name,
      row.supplier_tax_id,
      row.invoice_type,
      row.subtotal,
      row.vat_rate,
      row.vat_amount,
      row.total_amount,
      row.amount_paid,
      row.balance_due,
      row.status,
      row.payment_method,
      row.po_number,
      row.item_description,
      row.notes,
    ]) + "\n";
  }

  if (rows.length === 0) {
    csv += toCSVRow(["אין נתונים לתקופה הנבחרת", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""]) + "\n";
  }

  res.send(csv);
});

/**
 * @openapi
 * /api/accounting-export/all.csv:
 *   get:
 *     tags: [Finance & Accounting]
 *     summary: ייצוא מאוחד לחשבשבת — כל הרשומות הפיננסיות בקובץ אחד
 *     description: |
 *       מייצא בקובץ CSV אחד: חשבוניות לקוחות, תשלומים שהתקבלו וחשבוניות ספקים.
 *       ממוין לפי תאריך. כולל כותרת עם שם החברה ותקופת הדיווח.
 *       מתאים לייבוא ישיר לחשבשבת ו-Priority.
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - name: month
 *         in: query
 *         required: true
 *         schema: { type: integer, minimum: 1, maximum: 12, example: 3 }
 *       - name: year
 *         in: query
 *         required: true
 *         schema: { type: integer, example: 2025 }
 *     responses:
 *       200:
 *         description: קובץ CSV מאוחד עם BOM לתמיכה בעברית
 *         content:
 *           text/csv:
 *             schema: { type: string, format: binary }
 *       400: { description: "פרמטרים חסרים או לא תקינים" }
 *       401: { description: "נדרשת התחברות" }
 */
router.get("/accounting-export/all.csv", async (req: Request, res: Response) => {
  const period = parseAndValidatePeriod(req.query.month, req.query.year);
  if (!period) { res.status(400).json({ error: "נדרשים פרמטרים תקינים: month (1-12), year (2000-2100)" }); return; }
  const { m, y } = period;
  const { startDate, endDate } = buildDateRange(m, y);

  const [invoices, payments, expenses] = await Promise.all([
    safeQuery(`
      SELECT
        'חשבונית לקוח' AS record_type,
        er.data->>'invoice_number' AS doc_number,
        er.data->>'invoice_date' AS doc_date,
        er.data->>'customer_name' AS entity_name,
        er.data->>'customer_tax_id' AS entity_tax_id,
        er.data->>'subtotal' AS amount_before_vat,
        er.data->>'vat_amount' AS vat_amount,
        er.data->>'total_amount' AS total_amount,
        er.data->>'status' AS status,
        er.data->>'payment_method' AS payment_method,
        '' AS reference_number,
        er.data->>'notes' AS notes
      FROM entity_records er
      JOIN module_entities me ON me.id = er.entity_id
      WHERE me.slug = 'customer-invoices'
        AND (er.data->>'invoice_date' >= '${startDate}' AND er.data->>'invoice_date' < '${endDate}')
        AND er.data->>'status' != 'cancelled'
    `),
    safeQuery(`
      SELECT
        'תשלום מלקוח' AS record_type,
        payment_number AS doc_number,
        payment_date AS doc_date,
        customer_name AS entity_name,
        customer_tax_id AS entity_tax_id,
        amount AS amount_before_vat,
        '0' AS vat_amount,
        amount AS total_amount,
        status,
        payment_method,
        reference_number,
        notes
      FROM customer_payments
      WHERE payment_date >= '${startDate}' AND payment_date < '${endDate}'
        AND status = 'completed'
    `),
    safeQuery(`
      SELECT
        'חשבונית ספק' AS record_type,
        invoice_number AS doc_number,
        invoice_date AS doc_date,
        supplier_name AS entity_name,
        supplier_tax_id AS entity_tax_id,
        subtotal AS amount_before_vat,
        vat_amount,
        total_amount,
        status,
        payment_method,
        po_number AS reference_number,
        notes
      FROM supplier_invoices
      WHERE invoice_date >= '${startDate}' AND invoice_date < '${endDate}'
        AND status != 'cancelled'
    `),
  ]);

  const allRows = [...invoices, ...payments, ...expenses];
  allRows.sort((a, b) => String(a.doc_date || "").localeCompare(String(b.doc_date || "")));

  const filename = `ייצוא_חשבשבת_${y}_${String(m).padStart(2, "0")}.csv`;
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);

  const headers = [
    "סוג רשומה",
    "מספר מסמך",
    "תאריך",
    "שם",
    "מספר עוסק",
    "סכום לפני מע\"מ",
    "מע\"מ",
    "סה\"כ כולל מע\"מ",
    "סטטוס",
    "אמצעי תשלום",
    "אסמכתא",
    "הערות",
  ];

  let csv = "\uFEFF";
  csv += `"ייצוא חשבשבת — טכנו-כל עוזי"\n`;
  csv += `"תקופה: ${String(m).padStart(2, "0")}/${y}"\n`;
  csv += `"תאריך ייצוא: ${new Date().toLocaleDateString("he-IL")}"\n`;
  csv += "\n";
  csv += toCSVRow(headers) + "\n";

  for (const row of allRows) {
    csv += toCSVRow([
      row.record_type,
      row.doc_number,
      row.doc_date,
      row.entity_name,
      row.entity_tax_id,
      row.amount_before_vat,
      row.vat_amount,
      row.total_amount,
      row.status,
      row.payment_method,
      row.reference_number,
      row.notes,
    ]) + "\n";
  }

  if (allRows.length === 0) {
    csv += toCSVRow(["אין נתונים לתקופה הנבחרת"]) + "\n";
  }

  csv += "\n";
  csv += `"סה\"כ רשומות: ${allRows.length}"\n`;

  res.send(csv);
});

export default router;
