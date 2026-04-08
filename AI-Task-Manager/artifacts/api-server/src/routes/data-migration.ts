import { Router, type Request, type Response } from "express";
import multer from "multer";
import ExcelJS from "exceljs";
import { db } from "@workspace/db";
import { validateSession } from "../lib/auth";
import { sql } from "drizzle-orm";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

interface AuthenticatedRequest extends Request {
  user?: { id: number; username: string; fullName: string; role: string; isSuperAdmin: boolean };
}

async function requireAdmin(req: AuthenticatedRequest, res: Response): Promise<boolean> {
  const token = req.headers.authorization?.replace("Bearer ", "") || (req.cookies as Record<string, string>)?.erp_token;
  if (!token) { res.status(401).json({ error: "לא מורשה" }); return false; }
  const result = await validateSession(token);
  if (!result || !result.user) { res.status(401).json({ error: "הפעלה פגה תוקף" }); return false; }
  req.user = result.user as AuthenticatedRequest["user"];
  if (!result.user.isSuperAdmin) { res.status(403).json({ error: "גישה מורשית למנהלי מערכת בלבד" }); return false; }
  return true;
}

function validateIsraeliId(id: string): boolean {
  const clean = String(id).replace(/[^0-9]/g, "").padStart(9, "0");
  if (clean.length !== 9) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    let digit = parseInt(clean[i]) * ((i % 2) + 1);
    if (digit > 9) digit -= 9;
    sum += digit;
  }
  return sum % 10 === 0;
}

function parseDate(val: unknown): string | null {
  if (!val) return null;
  if (val instanceof Date) return val.toISOString().split("T")[0];
  const str = String(val).trim();
  if (!str) return null;
  let parts: string[];
  if (str.includes("/")) parts = str.split("/");
  else if (str.includes(".")) parts = str.split(".");
  else return str;
  const [d, m, y] = parts;
  if (d && m && y) {
    const year = y.length === 2 ? `20${y}` : y;
    return `${year}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return str;
}

function parseNum(val: string | undefined, strip = "[,₪\\s]"): number | null {
  if (!val?.trim()) return null;
  const n = parseFloat(val.replace(new RegExp(strip, "g"), ""));
  return isNaN(n) ? null : n;
}

// ──────────────────────────────────────────────────────────────────────────────
// HEADER MAPS
// ──────────────────────────────────────────────────────────────────────────────

const EMPLOYEE_HEADERS: Record<string, string> = {
  "שם פרטי": "firstName",
  "שם משפחה": "lastName",
  "שם מלא": "fullName",
  "תעודת זהות": "idNumber",
  "אימייל": "email",
  "טלפון": "phone",
  "מחלקה": "department",
  "תפקיד": "jobTitle",
  "סוג העסקה": "employmentType",
  "תאריך תחילת עבודה": "startDate",
  "שכר בסיס": "baseSalary",
  "סטטוס": "status",
};

const CUSTOMER_HEADERS: Record<string, string> = {
  "שם לקוח": "customerName",
  "מספר לקוח": "customerNumber",
  "איש קשר": "contactPerson",
  "טלפון": "phone",
  "נייד": "mobile",
  "אימייל": "email",
  "עיר": "city",
  "כתובת": "address",
  "ח.פ. / ת.ז.": "taxId",
  "מספר עוסק מורשה": "vatNumber",
  "מסגרת אשראי": "creditLimit",
  "ימי אשראי": "creditTermsDays",
  "קטגוריה": "customerCategory",
  "הערות": "notes",
};

const INVENTORY_HEADERS: Record<string, string> = {
  "קוד פריט": "itemCode",
  "שם פריט": "name",
  "שם בעברית": "nameHe",
  "קטגוריה": "category",
  "יחידת מידה": "unit",
  "כמות במלאי": "quantityOnHand",
  "כמות להזמנה מחדש": "reorderLevel",
  "מחיר עלות": "costPrice",
  "מחיר מכירה": "sellingPrice",
  "מיקום מחסן": "warehouseLocation",
  "ברקוד": "barcode",
  "הערות": "notes",
};

// ──────────────────────────────────────────────────────────────────────────────
// VALIDATORS
// ──────────────────────────────────────────────────────────────────────────────

function validateEmployeeRow(row: Record<string, string>, idx: number): string[] {
  const errors: string[] = [];
  const fn = row.firstName?.trim() || "";
  const ln = row.lastName?.trim() || "";
  const full = row.fullName?.trim() || "";
  if (!fn && !full) errors.push(`שורה ${idx}: שם פרטי הוא שדה חובה`);
  if (!ln && !full) errors.push(`שורה ${idx}: שם משפחה הוא שדה חובה`);
  if (row.idNumber?.trim() && !validateIsraeliId(row.idNumber)) {
    errors.push(`שורה ${idx}: מספר תעודת זהות לא תקין (${row.idNumber})`);
  }
  if (row.email?.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email.trim())) {
    errors.push(`שורה ${idx}: כתובת אימייל לא תקינה (${row.email})`);
  }
  if (row.baseSalary?.trim() && parseNum(row.baseSalary) === null) {
    errors.push(`שורה ${idx}: שכר בסיס אינו מספר תקין`);
  }
  return errors;
}

function validateCustomerRow(row: Record<string, string>, idx: number): string[] {
  const errors: string[] = [];
  if (!row.customerName?.trim()) errors.push(`שורה ${idx}: שם לקוח הוא שדה חובה`);
  if (row.email?.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email.trim())) {
    errors.push(`שורה ${idx}: כתובת אימייל לא תקינה (${row.email})`);
  }
  if (row.creditLimit?.trim() && parseNum(row.creditLimit) === null) {
    errors.push(`שורה ${idx}: מסגרת אשראי אינה מספר תקין`);
  }
  if (row.creditTermsDays?.trim()) {
    const n = parseInt(row.creditTermsDays);
    if (isNaN(n) || n < 0) errors.push(`שורה ${idx}: ימי אשראי אינם מספר תקין`);
  }
  return errors;
}

function validateInventoryRow(row: Record<string, string>, idx: number): string[] {
  const errors: string[] = [];
  if (!row.itemCode?.trim()) errors.push(`שורה ${idx}: קוד פריט הוא שדה חובה`);
  if (!row.name?.trim()) errors.push(`שורה ${idx}: שם פריט הוא שדה חובה`);
  if (row.quantityOnHand?.trim() && parseNum(row.quantityOnHand, "[,\\s]") === null) {
    errors.push(`שורה ${idx}: כמות במלאי אינה מספר תקין`);
  }
  if (row.costPrice?.trim() && parseNum(row.costPrice) === null) {
    errors.push(`שורה ${idx}: מחיר עלות אינו מספר תקין`);
  }
  if (row.sellingPrice?.trim() && parseNum(row.sellingPrice) === null) {
    errors.push(`שורה ${idx}: מחיר מכירה אינו מספר תקין`);
  }
  return errors;
}

// ──────────────────────────────────────────────────────────────────────────────
// EXCEL PARSER
// ──────────────────────────────────────────────────────────────────────────────

async function parseExcel(
  buffer: Buffer,
  headerMap: Record<string, string>
): Promise<{ rows: Record<string, string>[]; unknownHeaders: string[] }> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  const ws = workbook.worksheets[0];
  if (!ws) throw new Error("הקובץ ריק – לא נמצא גיליון");

  const headerRow = ws.getRow(1);
  const colToField: Record<number, string> = {};
  const unknownHeaders: string[] = [];

  headerRow.eachCell((cell, colNumber) => {
    const raw = String(cell.value ?? "").trim();
    if (raw) {
      const mapped = headerMap[raw];
      if (mapped) colToField[colNumber] = mapped;
      else unknownHeaders.push(raw);
    }
  });

  const rows: Record<string, string>[] = [];
  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const record: Record<string, string> = {};
    row.eachCell((cell, colNumber) => {
      const field = colToField[colNumber];
      if (field) {
        let val: unknown = cell.value;
        if (val instanceof Date) val = val.toISOString().split("T")[0];
        else if (val && typeof val === "object" && "result" in (val as Record<string, unknown>)) {
          val = String((val as Record<string, unknown>).result);
        }
        record[field] = String(val ?? "").trim();
      }
    });
    if (Object.values(record).some((v) => v !== "")) rows.push(record);
  });

  return { rows, unknownHeaders };
}

// ──────────────────────────────────────────────────────────────────────────────
// TEMPLATE BUILDER
// ──────────────────────────────────────────────────────────────────────────────

async function buildTemplate(
  headers: string[],
  examples: Record<string, string>[],
  hints: Record<string, string>,
  sheetName: string
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheetName, { views: [{ rightToLeft: true }] });

  ws.addRow(headers);
  const hr = ws.getRow(1);
  hr.font = { bold: true, color: { argb: "FFFFFFFF" } };
  hr.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A5F" } };
  hr.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  hr.height = 30;

  for (const ex of examples) {
    ws.addRow(headers.map((h) => ex[h] ?? ""));
  }

  const hintRow = ws.addRow(headers.map((h) => hints[h] ?? ""));
  hintRow.font = { italic: true, color: { argb: "FF888888" } };
  hintRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF5F5F5" } };

  ws.columns = headers.map(() => ({ width: 22 }));

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

// ──────────────────────────────────────────────────────────────────────────────
// TEMPLATE ENDPOINTS
// ──────────────────────────────────────────────────────────────────────────────

router.get("/data-migration/template/employees", async (req: AuthenticatedRequest, res: Response) => {
  if (!(await requireAdmin(req, res))) return;
  const headers = Object.keys(EMPLOYEE_HEADERS);
  const examples: Record<string, string>[] = [{
    "שם פרטי": "ישראל", "שם משפחה": "ישראלי", "שם מלא": "ישראל ישראלי",
    "תעודת זהות": "012345678", "אימייל": "israel@example.com", "טלפון": "0501234567",
    "מחלקה": "ייצור", "תפקיד": "מנהל משמרת", "סוג העסקה": "full_time",
    "תאריך תחילת עבודה": "01/01/2023", "שכר בסיס": "12000", "סטטוס": "active",
  }];
  const hints: Record<string, string> = {
    "תעודת זהות": "9 ספרות – ת.ז. ישראלית",
    "סוג העסקה": "full_time / part_time / contractor",
    "תאריך תחילת עבודה": "פורמט DD/MM/YYYY",
    "שכר בסיס": "מספר בשקלים",
    "סטטוס": "active / inactive",
  };
  const buf = await buildTemplate(headers, examples, hints, "עובדים");
  res.setHeader("Content-Disposition", 'attachment; filename="employees_template.xlsx"');
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.send(buf);
});

router.get("/data-migration/template/customers", async (req: AuthenticatedRequest, res: Response) => {
  if (!(await requireAdmin(req, res))) return;
  const headers = Object.keys(CUSTOMER_HEADERS);
  const examples: Record<string, string>[] = [{
    "שם לקוח": 'חברה לדוגמה בע"מ', "מספר לקוח": "C001", "איש קשר": "יוסי כהן",
    "טלפון": "03-1234567", "נייד": "0521234567", "אימייל": "yossi@example.com",
    "עיר": "תל אביב", "כתובת": "רחוב הרצל 1", "ח.פ. / ת.ז.": "514789456",
    "מספר עוסק מורשה": "514789456", "מסגרת אשראי": "50000", "ימי אשראי": "30",
    "קטגוריה": "A", "הערות": "",
  }];
  const hints: Record<string, string> = {
    "קטגוריה": "A / B / C",
    "ימי אשראי": "מספר שלם (ברירת מחדל: 30)",
    "מסגרת אשראי": "בשקלים",
  };
  const buf = await buildTemplate(headers, examples, hints, "לקוחות");
  res.setHeader("Content-Disposition", 'attachment; filename="customers_template.xlsx"');
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.send(buf);
});

router.get("/data-migration/template/inventory", async (req: AuthenticatedRequest, res: Response) => {
  if (!(await requireAdmin(req, res))) return;
  const headers = Object.keys(INVENTORY_HEADERS);
  const examples: Record<string, string>[] = [{
    "קוד פריט": "RM-001", "שם פריט": "ברזל 6mm", "שם בעברית": 'ברזל 6מ"מ',
    "קטגוריה": "חומרי גלם", "יחידת מידה": 'ק"ג', "כמות במלאי": "500",
    "כמות להזמנה מחדש": "100", "מחיר עלות": "12.50", "מחיר מכירה": "18.00",
    "מיקום מחסן": "A-1-03", "ברקוד": "1234567890", "הערות": "",
  }];
  const hints: Record<string, string> = {
    "יחידת מידה": "יח' / ק\"ג / מ' / ליטר",
    "כמות במלאי": "מספר (ניתן לעשרוני)",
    "מחיר עלות": "בשקלים",
  };
  const buf = await buildTemplate(headers, examples, hints, "מלאי");
  res.setHeader("Content-Disposition", 'attachment; filename="inventory_template.xlsx"');
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.send(buf);
});

// ──────────────────────────────────────────────────────────────────────────────
// PREVIEW
// ──────────────────────────────────────────────────────────────────────────────

router.post("/data-migration/preview/:entity", upload.single("file"), async (req: AuthenticatedRequest, res: Response) => {
  if (!(await requireAdmin(req, res))) return;
  const { entity } = req.params;
  if (!req.file) { res.status(400).json({ error: "לא נבחר קובץ" }); return; }

  try {
    const headerMap =
      entity === "employees" ? EMPLOYEE_HEADERS :
      entity === "customers" ? CUSTOMER_HEADERS :
      entity === "inventory" ? INVENTORY_HEADERS : null;
    if (!headerMap) { res.status(400).json({ error: "סוג ישות לא מוכר" }); return; }

    const { rows, unknownHeaders } = await parseExcel(req.file.buffer, headerMap);
    const allErrors: string[] = [];

    for (let i = 0; i < rows.length; i++) {
      let errs: string[] = [];
      if (entity === "employees") errs = validateEmployeeRow(rows[i], i + 2);
      else if (entity === "customers") errs = validateCustomerRow(rows[i], i + 2);
      else if (entity === "inventory") errs = validateInventoryRow(rows[i], i + 2);
      allErrors.push(...errs);
    }

    res.json({
      total: rows.length,
      errors: allErrors,
      sample: rows.slice(0, 10),
      unknownHeaders,
      canImport: allErrors.length === 0 && rows.length > 0,
    });
  } catch (e) {
    res.status(400).json({ error: String((e as Error).message) });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// IMPORT
// ──────────────────────────────────────────────────────────────────────────────

router.post("/data-migration/import/:entity", upload.single("file"), async (req: AuthenticatedRequest, res: Response) => {
  if (!(await requireAdmin(req, res))) return;
  const { entity } = req.params;
  if (!req.file) { res.status(400).json({ error: "לא נבחר קובץ" }); return; }

  try {
    const headerMap =
      entity === "employees" ? EMPLOYEE_HEADERS :
      entity === "customers" ? CUSTOMER_HEADERS :
      entity === "inventory" ? INVENTORY_HEADERS : null;
    if (!headerMap) { res.status(400).json({ error: "סוג ישות לא מוכר" }); return; }

    const { rows } = await parseExcel(req.file.buffer, headerMap);
    let imported = 0;
    let skipped = 0;

    if (entity === "employees") {
      for (const row of rows) {
        const errs = validateEmployeeRow(row, 0);
        if (errs.length > 0) { skipped++; continue; }
        const fullName = row.fullName?.trim() || `${row.firstName ?? ""} ${row.lastName ?? ""}`.trim();
        const baseSalary = parseNum(row.baseSalary) ?? 0;
        const startDate = parseDate(row.startDate);
        const empResult = await db.execute(sql`
          INSERT INTO employees (first_name, last_name, full_name, id_number, email, phone, department, job_title, employment_type, start_date, base_salary, status, created_at, updated_at)
          VALUES (
            ${row.firstName?.trim() || null},
            ${row.lastName?.trim() || null},
            ${fullName || null},
            ${row.idNumber?.trim() || null},
            ${row.email?.trim() || null},
            ${row.phone?.trim() || null},
            ${row.department?.trim() || "כללי"},
            ${row.jobTitle?.trim() || null},
            ${row.employmentType?.trim() || "full_time"},
            ${startDate}::date,
            ${String(baseSalary)},
            ${row.status?.trim() || "active"},
            NOW(), NOW()
          )
          ON CONFLICT DO NOTHING
          RETURNING id
        `);
        if ((empResult.rows?.length ?? 0) > 0) imported++;
        else skipped++;
      }
    } else if (entity === "customers") {
      let counter = 1;
      try {
        const r = await db.execute(sql`SELECT COALESCE(MAX(id),0)+1 AS nxt FROM customers`);
        const nxt = (r.rows[0] as Record<string, unknown>)?.nxt;
        if (nxt) counter = Number(nxt);
      } catch { /* ignore */ }
      for (const row of rows) {
        const errs = validateCustomerRow(row, 0);
        if (errs.length > 0) { skipped++; continue; }
        const custNum = row.customerNumber?.trim() || `C${String(counter).padStart(4, "0")}`;
        const creditLimit = parseNum(row.creditLimit) ?? 0;
        const creditDays = parseInt(row.creditTermsDays ?? "30") || 30;
        const custResult = await db.execute(sql`
          INSERT INTO customers (customer_number, customer_name, contact_person, phone, mobile, email, city, address, tax_id, vat_number, credit_limit, credit_terms_days, customer_category, notes, status, created_at, updated_at)
          VALUES (
            ${custNum},
            ${row.customerName.trim()},
            ${row.contactPerson?.trim() || null},
            ${row.phone?.trim() || null},
            ${row.mobile?.trim() || null},
            ${row.email?.trim() || null},
            ${row.city?.trim() || null},
            ${row.address?.trim() || null},
            ${row.taxId?.trim() || null},
            ${row.vatNumber?.trim() || null},
            ${String(creditLimit)},
            ${creditDays},
            ${row.customerCategory?.trim() || "B"},
            ${row.notes?.trim() || null},
            'active', NOW(), NOW()
          )
          ON CONFLICT (customer_number) DO NOTHING
          RETURNING id
        `);
        counter++;
        if ((custResult.rows?.length ?? 0) > 0) imported++;
        else skipped++;
      }
    } else if (entity === "inventory") {
      for (const row of rows) {
        const errs = validateInventoryRow(row, 0);
        if (errs.length > 0) { skipped++; continue; }
        const qty = parseNum(row.quantityOnHand, "[,\\s]") ?? 0;
        const reorder = parseNum(row.reorderLevel, "[,\\s]") ?? 0;
        const costPrice = parseNum(row.costPrice) ?? 0;
        const sellingPrice = parseNum(row.sellingPrice) ?? 0;
        const invResult = await db.execute(sql`
          INSERT INTO inventory (item_code, name, name_he, category, unit, quantity_on_hand, quantity_available, reorder_level, cost_price, selling_price, warehouse_location, barcode, notes, created_at, updated_at)
          VALUES (
            ${row.itemCode.trim()},
            ${row.name.trim()},
            ${row.nameHe?.trim() || null},
            ${row.category?.trim() || "כללי"},
            ${row.unit?.trim() || "יח'"},
            ${String(qty)},
            ${String(qty)},
            ${String(reorder)},
            ${String(costPrice)},
            ${String(sellingPrice)},
            ${row.warehouseLocation?.trim() || null},
            ${row.barcode?.trim() || null},
            ${row.notes?.trim() || null},
            NOW(), NOW()
          )
          ON CONFLICT (item_code) DO NOTHING
          RETURNING id
        `);
        if ((invResult.rows?.length ?? 0) > 0) imported++;
        else skipped++;
      }
    }

    await db.execute(sql`
      INSERT INTO data_migration_history (entity_type, imported_count, skipped_count, imported_by, created_at)
      VALUES (${entity}, ${imported}, ${skipped}, ${req.user?.fullName ?? "admin"}, NOW())
    `).catch(() => { /* ignore */ });

    res.json({ success: true, imported, skipped, total: rows.length });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// HISTORY
// ──────────────────────────────────────────────────────────────────────────────

router.get("/data-migration/history", async (req: AuthenticatedRequest, res: Response) => {
  if (!(await requireAdmin(req, res))) return;
  try {
    const rows = await db.execute(sql`
      SELECT id, entity_type, imported_count, skipped_count, imported_by, created_at
      FROM data_migration_history
      ORDER BY created_at DESC
      LIMIT 50
    `);
    res.json(rows.rows ?? []);
  } catch {
    res.json([]);
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// STARTUP TABLE CREATION
// ──────────────────────────────────────────────────────────────────────────────

export async function ensureDataMigrationTable(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS data_migration_history (
      id SERIAL PRIMARY KEY,
      entity_type TEXT NOT NULL,
      imported_count INTEGER NOT NULL DEFAULT 0,
      skipped_count INTEGER NOT NULL DEFAULT 0,
      imported_by TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

export default router;
