import { Router, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

const __filename_cjs = typeof __filename !== "undefined" ? __filename : fileURLToPath(import.meta.url);
const __dirname_cjs = typeof __dirname !== "undefined" ? __dirname : path.dirname(__filename_cjs);
const SCRIPTS_DIR = path.resolve(__dirname_cjs, "..", "..", "scripts");
const BACKUP_DIR = path.resolve(__dirname_cjs, "..", "..", "backups");

const router = Router();

async function q(query: string): Promise<Record<string, unknown>[]> {
  try {
    const r = await db.execute(sql.raw(query));
    return (r?.rows || []) as Record<string, unknown>[];
  } catch (e) { console.error("[settings-q]", String(e).slice(0, 200), "QUERY:", query.slice(0, 100)); return []; }
}

function s(v: unknown): string {
  if (v === null || v === undefined || v === "") return "NULL";
  return `'${String(v).replace(/'/g, "''")}'`;
}

let _init = false;
async function init() {
  if (_init) return;
  _init = true;
  await q(`CREATE TABLE IF NOT EXISTS system_settings (
    key TEXT PRIMARY KEY,
    value TEXT,
    category TEXT DEFAULT 'general',
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);
  await q(`ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'general'`);
  await q(`ALTER TABLE system_settings ALTER COLUMN value DROP NOT NULL`);
  await q(`CREATE TABLE IF NOT EXISTS system_backups (
    id SERIAL PRIMARY KEY,
    backup_type TEXT NOT NULL DEFAULT 'full',
    status TEXT NOT NULL DEFAULT 'pending',
    size_bytes BIGINT DEFAULT 0,
    location TEXT DEFAULT 'local',
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    duration_seconds INT DEFAULT 0,
    notes TEXT,
    triggered_by TEXT DEFAULT 'system',
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);
  await q(`CREATE TABLE IF NOT EXISTS departments (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    code TEXT,
    manager TEXT,
    parent_department TEXT,
    location TEXT,
    phone TEXT,
    email TEXT,
    budget NUMERIC DEFAULT 0,
    employee_count INT DEFAULT 0,
    description TEXT,
    status TEXT DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);
  await q(`INSERT INTO departments (name, code, manager, parent_department, location, phone, email, budget, employee_count, description, status, created_at, updated_at)
    SELECT name, code, manager, parent_department, location, phone, email, budget, employee_count, description, status, created_at, updated_at
    FROM org_departments WHERE NOT EXISTS (SELECT 1 FROM departments LIMIT 1)`);
  await q(`ALTER TABLE departments ADD COLUMN IF NOT EXISTS code TEXT`);
  await q(`ALTER TABLE departments ADD COLUMN IF NOT EXISTS manager TEXT`);
  await q(`ALTER TABLE departments ADD COLUMN IF NOT EXISTS parent_department TEXT`);
  await q(`ALTER TABLE departments ADD COLUMN IF NOT EXISTS location TEXT`);
  await q(`ALTER TABLE departments ADD COLUMN IF NOT EXISTS phone TEXT`);
  await q(`ALTER TABLE departments ADD COLUMN IF NOT EXISTS email TEXT`);
  await q(`ALTER TABLE departments ADD COLUMN IF NOT EXISTS budget NUMERIC DEFAULT 0`);
  await q(`ALTER TABLE departments ADD COLUMN IF NOT EXISTS employee_count INT DEFAULT 0`);
  await q(`ALTER TABLE departments ADD COLUMN IF NOT EXISTS description TEXT`);
  await q(`ALTER TABLE departments ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active'`);
  await q(`ALTER TABLE departments ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`);
  await autoSeed();
}

async function autoSeed() {
  const existing = await q(`SELECT COUNT(*)::int as c FROM departments`);
  if (Number((existing[0] as Record<string, unknown>)?.c || 0) > 0) return;
  console.log("[settings] Auto-seeding initial data...");

  const companyFields: Record<string, string> = {
    company_name: "טכנו-כל עוזי בע\"מ",
    company_name_en: "Techno-Kol Uzi Ltd",
    tax_id: "514567890",
    address: "רחוב התעשייה 15",
    city: "חולון",
    zip_code: "5885100",
    phone: "03-5551234",
    fax: "03-5551235",
    email: "info@techno-kol.co.il",
    website: "www.techno-kol.co.il",
    logo_url: "",
    industry: "מתכת/אלומיניום/זכוכית",
    founded_year: "1998",
    employee_count: "200",
  };
  for (const [key, value] of Object.entries(companyFields)) {
    await q(`INSERT INTO system_settings (key, value, category) VALUES (${s(key)}, ${s(value)}, 'company') ON CONFLICT (key) DO UPDATE SET value=${s(value)}, category='company'`);
  }

  const generalFields: Record<string, string> = {
    currency: "ILS", timezone: "Asia/Jerusalem", date_format: "DD/MM/YYYY",
    language: "he", vat_rate: "17", fiscal_year_start: "01",
    work_week_start: "sunday", decimal_places: "2",
  };
  for (const [key, value] of Object.entries(generalFields)) {
    await q(`INSERT INTO system_settings (key, value, category) VALUES (${s(key)}, ${s(value)}, 'general') ON CONFLICT (key) DO UPDATE SET value=${s(value)}, category='general'`);
  }

  const securityFields: Record<string, string> = {
    min_password_length: "8", require_uppercase: "true", require_numbers: "true",
    require_special_chars: "true", session_timeout_minutes: "30", max_login_attempts: "5",
    lockout_duration_minutes: "15", two_factor_enabled: "false", ip_whitelist: "",
    password_expiry_days: "90", enforce_password_history: "3",
  };
  for (const [key, value] of Object.entries(securityFields)) {
    await q(`INSERT INTO system_settings (key, value, category) VALUES (${s(key)}, ${s(value)}, 'security') ON CONFLICT (key) DO UPDATE SET value=${s(value)}, category='security'`);
  }

  const departments = [
    { name: "הנהלה", code: "MGMT", manager: "עוזי כהן", location: "בניין ראשי, קומה 3", phone: "03-5551200", email: "management@techno-kol.co.il", budget: 2000000, employees: 8, parent: "" },
    { name: "ייצור", code: "PROD", manager: "אבי לוי", location: "אולם ייצור A", phone: "03-5551210", email: "production@techno-kol.co.il", budget: 5000000, employees: 80, parent: "" },
    { name: "חיתוך CNC", code: "CNC", manager: "משה דוד", location: "אולם A - אגף CNC", phone: "03-5551211", email: "cnc@techno-kol.co.il", budget: 1500000, employees: 25, parent: "ייצור" },
    { name: "ריתוך והרכבה", code: "WELD", manager: "רונן שמעוני", location: "אולם B", phone: "03-5551212", email: "welding@techno-kol.co.il", budget: 1200000, employees: 20, parent: "ייצור" },
    { name: "זיגוג וזכוכית", code: "GLASS", manager: "דני ברק", location: "אולם C", phone: "03-5551213", email: "glass@techno-kol.co.il", budget: 800000, employees: 15, parent: "ייצור" },
    { name: "צביעה וגימור", code: "PAINT", manager: "יוסי חדד", location: "אולם D", phone: "03-5551214", email: "paint@techno-kol.co.il", budget: 600000, employees: 12, parent: "ייצור" },
    { name: "בקרת איכות", code: "QC", manager: "שרה גולדשטיין", location: "מעבדה ראשית", phone: "03-5551220", email: "quality@techno-kol.co.il", budget: 400000, employees: 8, parent: "" },
    { name: "מחסן ולוגיסטיקה", code: "LOG", manager: "אלי פרידמן", location: "מחסן מרכזי", phone: "03-5551230", email: "logistics@techno-kol.co.il", budget: 800000, employees: 12, parent: "" },
    { name: "כספים וחשבונאות", code: "FIN", manager: "רחל אברהם", location: "בניין ראשי, קומה 2", phone: "03-5551240", email: "finance@techno-kol.co.il", budget: 500000, employees: 6, parent: "" },
    { name: "משאבי אנוש", code: "HR", manager: "מיכל ברק", location: "בניין ראשי, קומה 2", phone: "03-5551250", email: "hr@techno-kol.co.il", budget: 350000, employees: 4, parent: "" },
    { name: "מכירות ושיווק", code: "SALES", manager: "איתן רוזנברג", location: "בניין ראשי, קומה 1", phone: "03-5551260", email: "sales@techno-kol.co.il", budget: 1200000, employees: 10, parent: "" },
    { name: "רכש", code: "PROC", manager: "נועה פרידמן", location: "בניין ראשי, קומה 1", phone: "03-5551270", email: "procurement@techno-kol.co.il", budget: 300000, employees: 5, parent: "" },
    { name: "תחזוקה", code: "MAINT", manager: "עומר חדד", location: "מבנה תחזוקה", phone: "03-5551280", email: "maintenance@techno-kol.co.il", budget: 700000, employees: 8, parent: "" },
    { name: "IT ומערכות מידע", code: "IT", manager: "גל שלום", location: "בניין ראשי, קומה 3", phone: "03-5551290", email: "it@techno-kol.co.il", budget: 600000, employees: 4, parent: "" },
    { name: "הנדסה ותכנון", code: "ENG", manager: "דוד מזרחי", location: "בניין ראשי, קומה 2", phone: "03-5551300", email: "engineering@techno-kol.co.il", budget: 900000, employees: 8, parent: "" },
  ];
  for (const dept of departments) {
    await q(`INSERT INTO departments (name, code, manager, parent_department, location, phone, email, budget, employee_count, status) VALUES (${s(dept.name)}, ${s(dept.code)}, ${s(dept.manager)}, ${s(dept.parent)}, ${s(dept.location)}, ${s(dept.phone)}, ${s(dept.email)}, ${dept.budget}, ${dept.employees}, 'active')`);
  }
  console.log("[settings] Auto-seed complete: 15 departments, company profile, general & security settings");
}

router.get("/settings/company-profile", async (_req: Request, res: Response) => {
  await init();
  const rows = await q(`SELECT key, value FROM system_settings WHERE category='company'`);
  const profile: Record<string, string> = {};
  for (const r of rows) profile[String(r.key)] = String(r.value || "");
  res.json({
    companyName: profile.company_name || "",
    companyNameEn: profile.company_name_en || "",
    taxId: profile.tax_id || "",
    address: profile.address || "",
    city: profile.city || "",
    zipCode: profile.zip_code || "",
    phone: profile.phone || "",
    fax: profile.fax || "",
    email: profile.email || "",
    website: profile.website || "",
    logoUrl: profile.logo_url || "",
    industry: profile.industry || "",
    foundedYear: profile.founded_year || "",
    employeeCount: profile.employee_count || "",
  });
});

router.put("/settings/company-profile", async (req: Request, res: Response) => {
  await init();
  const d = req.body;
  const fields: Record<string, string> = {
    company_name: d.companyName || "",
    company_name_en: d.companyNameEn || "",
    tax_id: d.taxId || "",
    address: d.address || "",
    city: d.city || "",
    zip_code: d.zipCode || "",
    phone: d.phone || "",
    fax: d.fax || "",
    email: d.email || "",
    website: d.website || "",
    logo_url: d.logoUrl || "",
    industry: d.industry || "",
    founded_year: d.foundedYear || "",
    employee_count: d.employeeCount || "",
  };
  for (const [key, value] of Object.entries(fields)) {
    await q(`INSERT INTO system_settings (key, value, category, updated_at) VALUES (${s(key)}, ${s(value)}, 'company', NOW()) ON CONFLICT (key) DO UPDATE SET value=${s(value)}, category='company', updated_at=NOW()`);
  }
  res.json({ success: true });
});

router.get("/settings/general", async (_req: Request, res: Response) => {
  await init();
  const rows = await q(`SELECT key, value FROM system_settings WHERE category='general'`);
  const settings: Record<string, string> = {};
  for (const r of rows) settings[String(r.key)] = String(r.value || "");
  res.json({
    currency: settings.currency || "ILS",
    timezone: settings.timezone || "Asia/Jerusalem",
    dateFormat: settings.date_format || "DD/MM/YYYY",
    language: settings.language || "he",
    vatRate: settings.vat_rate || "17",
    fiscalYearStart: settings.fiscal_year_start || "01",
    workWeekStart: settings.work_week_start || "sunday",
    decimalPlaces: settings.decimal_places || "2",
  });
});

router.put("/settings/general", async (req: Request, res: Response) => {
  await init();
  const d = req.body;
  const fields: Record<string, string> = {
    currency: d.currency || "ILS",
    timezone: d.timezone || "Asia/Jerusalem",
    date_format: d.dateFormat || "DD/MM/YYYY",
    language: d.language || "he",
    vat_rate: d.vatRate || "17",
    fiscal_year_start: d.fiscalYearStart || "01",
    work_week_start: d.workWeekStart || "sunday",
    decimal_places: d.decimalPlaces || "2",
  };
  for (const [key, value] of Object.entries(fields)) {
    await q(`INSERT INTO system_settings (key, value, category, updated_at) VALUES (${s(key)}, ${s(value)}, 'general', NOW()) ON CONFLICT (key) DO UPDATE SET value=${s(value)}, category='general', updated_at=NOW()`);
  }
  res.json({ success: true });
});

router.get("/settings/security", async (_req: Request, res: Response) => {
  await init();
  const rows = await q(`SELECT key, value FROM system_settings WHERE category='security'`);
  const settings: Record<string, string> = {};
  for (const r of rows) settings[String(r.key)] = String(r.value || "");
  res.json({
    minPasswordLength: settings.min_password_length || "8",
    requireUppercase: settings.require_uppercase || "true",
    requireNumbers: settings.require_numbers || "true",
    requireSpecialChars: settings.require_special_chars || "true",
    sessionTimeoutMinutes: settings.session_timeout_minutes || "30",
    maxLoginAttempts: settings.max_login_attempts || "5",
    lockoutDurationMinutes: settings.lockout_duration_minutes || "15",
    twoFactorEnabled: settings.two_factor_enabled || "false",
    ipWhitelist: settings.ip_whitelist || "",
    passwordExpiryDays: settings.password_expiry_days || "90",
    enforcePasswordHistory: settings.enforce_password_history || "3",
  });
});

router.put("/settings/security", async (req: Request, res: Response) => {
  await init();
  const d = req.body;
  const fields: Record<string, string> = {
    min_password_length: String(d.minPasswordLength || "8"),
    require_uppercase: String(d.requireUppercase || "true"),
    require_numbers: String(d.requireNumbers || "true"),
    require_special_chars: String(d.requireSpecialChars || "true"),
    session_timeout_minutes: String(d.sessionTimeoutMinutes || "30"),
    max_login_attempts: String(d.maxLoginAttempts || "5"),
    lockout_duration_minutes: String(d.lockoutDurationMinutes || "15"),
    two_factor_enabled: String(d.twoFactorEnabled || "false"),
    ip_whitelist: String(d.ipWhitelist || ""),
    password_expiry_days: String(d.passwordExpiryDays || "90"),
    enforce_password_history: String(d.enforcePasswordHistory || "3"),
  };
  for (const [key, value] of Object.entries(fields)) {
    await q(`INSERT INTO system_settings (key, value, category, updated_at) VALUES (${s(key)}, ${s(value)}, 'security', NOW()) ON CONFLICT (key) DO UPDATE SET value=${s(value)}, category='security', updated_at=NOW()`);
  }
  res.json({ success: true });
});

router.get("/settings/departments", async (_req: Request, res: Response) => {
  await init();
  const rows = await q(`SELECT * FROM departments ORDER BY name ASC`);
  res.json(rows);
});

router.post("/settings/departments", async (req: Request, res: Response) => {
  await init();
  const d = req.body;
  if (!d.name) { res.status(400).json({ error: "name is required" }); return; }
  const row = await q(`INSERT INTO departments (name, code, manager, parent_department, location, phone, email, budget, employee_count, description, status)
    VALUES (${s(d.name)}, ${s(d.code)}, ${s(d.manager)}, ${s(d.parentDepartment)}, ${s(d.location)}, ${s(d.phone)}, ${s(d.email)}, ${Number(d.budget) || 0}, ${parseInt(String(d.employeeCount)) || 0}, ${s(d.description)}, ${s(d.status || "active")})
    RETURNING *`);
  if (!row[0]) { res.status(500).json({ error: "Failed to create department" }); return; }
  res.json(row[0]);
});

router.put("/settings/departments/:id", async (req: Request, res: Response) => {
  await init();
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const d = req.body;
  const sets: string[] = [];
  if (d.name !== undefined) sets.push(`name=${s(d.name)}`);
  if (d.code !== undefined) sets.push(`code=${s(d.code)}`);
  if (d.manager !== undefined) sets.push(`manager=${s(d.manager)}`);
  if (d.parentDepartment !== undefined) sets.push(`parent_department=${s(d.parentDepartment)}`);
  if (d.location !== undefined) sets.push(`location=${s(d.location)}`);
  if (d.phone !== undefined) sets.push(`phone=${s(d.phone)}`);
  if (d.email !== undefined) sets.push(`email=${s(d.email)}`);
  if (d.budget !== undefined) sets.push(`budget=${Number(d.budget) || 0}`);
  if (d.employeeCount !== undefined) sets.push(`employee_count=${parseInt(String(d.employeeCount)) || 0}`);
  if (d.description !== undefined) sets.push(`description=${s(d.description)}`);
  if (d.status !== undefined) sets.push(`status=${s(d.status)}`);
  sets.push(`updated_at=NOW()`);
  await q(`UPDATE departments SET ${sets.join(",")} WHERE id=${id}`);
  const row = await q(`SELECT * FROM departments WHERE id=${id}`);
  if (!row[0]) { res.status(404).json({ error: "Department not found" }); return; }
  res.json(row[0]);
});

router.delete("/settings/departments/:id", async (req: Request, res: Response) => {
  await init();
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await q(`DELETE FROM departments WHERE id=${id}`);
  res.json({ success: true });
});

router.get("/settings/backups", async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const permissions = (req as any).permissions;
  if (!userId || !permissions?.isSuperAdmin) {
    return res.status(403).json({ error: "גישה לגיבויים מותרת למנהל מערכת ראשי בלבד" });
  }
  await init();
  const rows = await q(`SELECT * FROM system_backups ORDER BY created_at DESC LIMIT 50`);
  res.json(rows);
});

router.post("/settings/backups/trigger", async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const permissions = (req as any).permissions;
  if (!userId || !permissions?.isSuperAdmin) {
    return res.status(403).json({ error: "הפעלת גיבוי ידני מותרת למנהל מערכת ראשי בלבד" });
  }
  await init();
  const d = req.body;
  const backupType = d.backupType || "database";
  const triggeredBy = d.triggeredBy || "admin";

  const row = await q(`INSERT INTO system_backups (backup_type, status, location, triggered_by, started_at)
    VALUES (${s(backupType)}, 'in_progress', ${s(BACKUP_DIR)}, ${s(triggeredBy)}, NOW())
    RETURNING *`);
  const backupId = row[0]?.id;

  const startTime = Date.now();
  const script = path.join(SCRIPTS_DIR, "backup-db.sh");

  execFile("bash", [script], { env: process.env }, async (err, stdout) => {
    const durationSec = Math.round((Date.now() - startTime) / 1000);
    if (err) {
      await q(`UPDATE system_backups SET status='failed', duration_seconds=${durationSec}, completed_at=NOW(), notes=${s(err.message.slice(0, 500))} WHERE id=${backupId}`);
    } else {
      let sizeBytes = 0;
      try {
        const files = fs.readdirSync(BACKUP_DIR)
          .filter(f => f.endsWith(".sql.gz"))
          .sort()
          .reverse();
        if (files[0]) {
          const stat = fs.statSync(path.join(BACKUP_DIR, files[0]));
          sizeBytes = stat.size;
        }
      } catch { /* ignore */ }
      await q(`UPDATE system_backups SET status='completed', size_bytes=${sizeBytes}, duration_seconds=${durationSec}, completed_at=NOW(), notes=${s(stdout.trim().slice(0, 500))} WHERE id=${backupId}`);
    }
  });

  res.json(row[0]);
});

router.get("/settings/backups/status", async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const permissions = (req as any).permissions;
  if (!userId || !permissions?.isSuperAdmin) {
    return res.status(403).json({ error: "גישה לסטטוס גיבויים מותרת למנהל מערכת ראשי בלבד" });
  }
  await init();
  let lastBackup: Record<string, unknown> | null = null;
  let backupFileCount = 0;
  let totalSize = 0;

  try {
    const rows = await q(`SELECT * FROM system_backups ORDER BY created_at DESC LIMIT 1`);
    lastBackup = rows[0] || null;
  } catch { /* ignore */ }

  try {
    if (fs.existsSync(BACKUP_DIR)) {
      const files = fs.readdirSync(BACKUP_DIR).filter(f => f.endsWith(".sql.gz"));
      backupFileCount = files.length;
      totalSize = files.reduce((sum, f) => {
        try { return sum + fs.statSync(path.join(BACKUP_DIR, f)).size; } catch { return sum; }
      }, 0);
    }
  } catch { /* ignore */ }

  res.json({
    lastBackup,
    backupFileCount,
    totalSizeBytes: totalSize,
    backupDir: BACKUP_DIR,
    nextScheduled: "02:00 Asia/Jerusalem",
  });
});

router.post("/settings/seed", async (_req: Request, res: Response) => {
  await init();
  const existing = await q(`SELECT COUNT(*)::int as c FROM departments`);
  if (Number((existing[0] as Record<string, unknown>)?.c || 0) > 0) {
    return res.json({ message: "Data already exists" });
  }

  const companyFields: Record<string, string> = {
    company_name: "טכנו-כל עוזי בע\"מ",
    company_name_en: "Techno-Kol Uzi Ltd",
    tax_id: "514567890",
    address: "רחוב התעשייה 15",
    city: "חולון",
    zip_code: "5885100",
    phone: "03-5551234",
    fax: "03-5551235",
    email: "info@techno-kol.co.il",
    website: "www.techno-kol.co.il",
    logo_url: "",
    industry: "מתכת/אלומיניום/זכוכית",
    founded_year: "1998",
    employee_count: "200",
  };
  for (const [key, value] of Object.entries(companyFields)) {
    await q(`INSERT INTO system_settings (key, value, category) VALUES (${s(key)}, ${s(value)}, 'company') ON CONFLICT (key) DO UPDATE SET value=${s(value)}`);
  }

  const generalFields: Record<string, string> = {
    currency: "ILS",
    timezone: "Asia/Jerusalem",
    date_format: "DD/MM/YYYY",
    language: "he",
    vat_rate: "17",
    fiscal_year_start: "01",
    work_week_start: "sunday",
    decimal_places: "2",
  };
  for (const [key, value] of Object.entries(generalFields)) {
    await q(`INSERT INTO system_settings (key, value, category) VALUES (${s(key)}, ${s(value)}, 'general') ON CONFLICT (key) DO UPDATE SET value=${s(value)}`);
  }

  const securityFields: Record<string, string> = {
    min_password_length: "8",
    require_uppercase: "true",
    require_numbers: "true",
    require_special_chars: "true",
    session_timeout_minutes: "30",
    max_login_attempts: "5",
    lockout_duration_minutes: "15",
    two_factor_enabled: "false",
    ip_whitelist: "",
    password_expiry_days: "90",
    enforce_password_history: "3",
  };
  for (const [key, value] of Object.entries(securityFields)) {
    await q(`INSERT INTO system_settings (key, value, category) VALUES (${s(key)}, ${s(value)}, 'security') ON CONFLICT (key) DO UPDATE SET value=${s(value)}`);
  }

  const departments = [
    { name: "הנהלה", code: "MGMT", manager: "עוזי כהן", location: "בניין ראשי, קומה 3", phone: "03-5551200", email: "management@techno-kol.co.il", budget: 2000000, employees: 8, parent: "" },
    { name: "ייצור", code: "PROD", manager: "אבי לוי", location: "אולם ייצור A", phone: "03-5551210", email: "production@techno-kol.co.il", budget: 5000000, employees: 80, parent: "" },
    { name: "חיתוך CNC", code: "CNC", manager: "משה דוד", location: "אולם A - אגף CNC", phone: "03-5551211", email: "cnc@techno-kol.co.il", budget: 1500000, employees: 25, parent: "ייצור" },
    { name: "ריתוך והרכבה", code: "WELD", manager: "רונן שמעוני", location: "אולם B", phone: "03-5551212", email: "welding@techno-kol.co.il", budget: 1200000, employees: 20, parent: "ייצור" },
    { name: "זיגוג וזכוכית", code: "GLASS", manager: "דני ברק", location: "אולם C", phone: "03-5551213", email: "glass@techno-kol.co.il", budget: 800000, employees: 15, parent: "ייצור" },
    { name: "צביעה וגימור", code: "PAINT", manager: "יוסי חדד", location: "אולם D", phone: "03-5551214", email: "paint@techno-kol.co.il", budget: 600000, employees: 12, parent: "ייצור" },
    { name: "בקרת איכות", code: "QC", manager: "שרה גולדשטיין", location: "מעבדה ראשית", phone: "03-5551220", email: "quality@techno-kol.co.il", budget: 400000, employees: 8, parent: "" },
    { name: "מחסן ולוגיסטיקה", code: "LOG", manager: "אלי פרידמן", location: "מחסן מרכזי", phone: "03-5551230", email: "logistics@techno-kol.co.il", budget: 800000, employees: 12, parent: "" },
    { name: "כספים וחשבונאות", code: "FIN", manager: "רחל אברהם", location: "בניין ראשי, קומה 2", phone: "03-5551240", email: "finance@techno-kol.co.il", budget: 500000, employees: 6, parent: "" },
    { name: "משאבי אנוש", code: "HR", manager: "מיכל ברק", location: "בניין ראשי, קומה 2", phone: "03-5551250", email: "hr@techno-kol.co.il", budget: 350000, employees: 4, parent: "" },
    { name: "מכירות ושיווק", code: "SALES", manager: "איתן רוזנברג", location: "בניין ראשי, קומה 1", phone: "03-5551260", email: "sales@techno-kol.co.il", budget: 1200000, employees: 10, parent: "" },
    { name: "רכש", code: "PROC", manager: "נועה פרידמן", location: "בניין ראשי, קומה 1", phone: "03-5551270", email: "procurement@techno-kol.co.il", budget: 300000, employees: 5, parent: "" },
    { name: "תחזוקה", code: "MAINT", manager: "עומר חדד", location: "מבנה תחזוקה", phone: "03-5551280", email: "maintenance@techno-kol.co.il", budget: 700000, employees: 8, parent: "" },
    { name: "IT ומערכות מידע", code: "IT", manager: "גל שלום", location: "בניין ראשי, קומה 3", phone: "03-5551290", email: "it@techno-kol.co.il", budget: 600000, employees: 4, parent: "" },
    { name: "הנדסה ותכנון", code: "ENG", manager: "דוד מזרחי", location: "בניין ראשי, קומה 2", phone: "03-5551300", email: "engineering@techno-kol.co.il", budget: 900000, employees: 8, parent: "" },
  ];

  for (const dept of departments) {
    await q(`INSERT INTO departments (name, code, manager, parent_department, location, phone, email, budget, employee_count, status) VALUES (${s(dept.name)}, ${s(dept.code)}, ${s(dept.manager)}, ${s(dept.parent)}, ${s(dept.location)}, ${s(dept.phone)}, ${s(dept.email)}, ${dept.budget}, ${dept.employees}, 'active')`);
  }

  const backups = [
    { type: "full", status: "completed", size: 1200 * 1024 * 1024, duration: 245, location: "local", by: "system", hoursAgo: 6 },
    { type: "database", status: "completed", size: 350 * 1024 * 1024, duration: 45, location: "local", by: "system", hoursAgo: 18 },
    { type: "full", status: "completed", size: 1180 * 1024 * 1024, duration: 238, location: "local", by: "admin", hoursAgo: 30 },
    { type: "configuration", status: "completed", size: 5 * 1024 * 1024, duration: 3, location: "local", by: "system", hoursAgo: 48 },
    { type: "database", status: "failed", size: 0, duration: 12, location: "local", by: "system", hoursAgo: 54 },
    { type: "full", status: "completed", size: 1150 * 1024 * 1024, duration: 230, location: "local", by: "system", hoursAgo: 78 },
  ];
  for (const b of backups) {
    await q(`INSERT INTO system_backups (backup_type, status, size_bytes, duration_seconds, location, triggered_by, started_at, completed_at, created_at)
      VALUES (${s(b.type)}, ${s(b.status)}, ${b.size}, ${b.duration}, ${s(b.location)}, ${s(b.by)}, NOW() - INTERVAL '${b.hoursAgo} hours', ${b.status === "completed" ? `NOW() - INTERVAL '${b.hoursAgo} hours' + INTERVAL '${b.duration} seconds'` : "NULL"}, NOW() - INTERVAL '${b.hoursAgo} hours')`);
  }

  res.json({ success: true, departments: departments.length, backups: backups.length });
});

export default router;
