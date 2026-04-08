import { Router, Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { validateSession } from "../lib/auth";
import { checkEntityAccess, type ResolvedPermissions } from "../lib/permission-engine";

const router = Router();

const EMPLOYEE_ENTITY_ID = 34;

interface AuthenticatedUser {
  id: number;
  username: string;
  fullName?: string;
  role?: string;
}

interface AuthRequest extends Request {
  currentUser: AuthenticatedUser;
}

function checkHrAccess(permissions: ResolvedPermissions | undefined, action: "read" | "create" | "update" | "delete"): boolean {
  if (!permissions) return false;
  if (permissions.isSuperAdmin) return true;
  return checkEntityAccess(permissions, String(EMPLOYEE_ENTITY_ID), action);
}

async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.substring(7) : (req.query.token as string) || null;
  if (!token) { res.status(401).json({ error: "נדרשת התחברות" }); return; }
  const result = await validateSession(token);
  if (result.error || !result.user) { res.status(401).json({ error: "הסשן פג תוקף" }); return; }
  (req as AuthRequest).currentUser = result.user as AuthenticatedUser;
  next();
}

router.use(requireAuth);

async function ensureTables(): Promise<void> {
  try {
    await db.execute(sql.raw(`
      CREATE TABLE IF NOT EXISTS skills_matrix (
        id SERIAL PRIMARY KEY,
        employee_id INTEGER NOT NULL,
        employee_name VARCHAR(255),
        department VARCHAR(100),
        skill_name VARCHAR(255) NOT NULL,
        skill_category VARCHAR(100),
        proficiency_level INTEGER DEFAULT 1 CHECK (proficiency_level BETWEEN 1 AND 5),
        certified_date DATE,
        expiry_date DATE,
        assessed_by VARCHAR(255),
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS employment_history (
        id SERIAL PRIMARY KEY,
        employee_id INTEGER NOT NULL,
        employee_name VARCHAR(255),
        event_type VARCHAR(50) NOT NULL,
        from_value TEXT,
        to_value TEXT,
        effective_date DATE NOT NULL,
        approved_by VARCHAR(255),
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS compliance_alerts (
        id SERIAL PRIMARY KEY,
        employee_id INTEGER NOT NULL,
        employee_name VARCHAR(255),
        department VARCHAR(100),
        alert_type VARCHAR(50) NOT NULL,
        item_name VARCHAR(255) NOT NULL,
        expiry_date DATE NOT NULL,
        days_until_expiry INTEGER,
        status VARCHAR(30) DEFAULT 'active',
        notified_at TIMESTAMP,
        resolved_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS certifications (
        id SERIAL PRIMARY KEY,
        employee_id INTEGER NOT NULL,
        employee_name VARCHAR(255),
        department VARCHAR(100),
        cert_name VARCHAR(255) NOT NULL,
        cert_type VARCHAR(100),
        issuing_body VARCHAR(255),
        cert_number VARCHAR(100),
        issued_date DATE,
        expiry_date DATE,
        status VARCHAR(30) DEFAULT 'active',
        file_url TEXT,
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS skill_gap_profiles (
        id SERIAL PRIMARY KEY,
        role_title VARCHAR(255) NOT NULL,
        department VARCHAR(100),
        skill_name VARCHAR(255) NOT NULL,
        skill_category VARCHAR(100),
        required_level INTEGER DEFAULT 3 CHECK (required_level BETWEEN 1 AND 5),
        created_at TIMESTAMP DEFAULT NOW()
      );
    `));
  } catch (e: unknown) {
    console.error("[hr-workforce] table init error:", e instanceof Error ? e.message : String(e));
  }
}
ensureTables();

function safeInt(v: unknown): number {
  const n = parseInt(String(v), 10);
  if (isNaN(n) || !isFinite(n)) throw new Error(`Invalid integer: ${v}`);
  return n;
}

function safeDate(v: unknown): string | null {
  if (!v) return null;
  const d = new Date(String(v));
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function clampProficiency(raw: unknown): number {
  const n = parseInt(String(raw || 3), 10);
  return Math.max(1, Math.min(5, isNaN(n) ? 3 : n));
}

// ========== SKILLS MATRIX ==========

router.get("/skills-matrix", async (req: Request, res: Response): Promise<void> => {
  if (!checkHrAccess(req.permissions, "read")) { res.status(403).json({ error: "אין הרשאה לצפייה בנתוני עובדים" }); return; }
  try {
    const conditions: ReturnType<typeof sql>[] = [];
    if (req.query.employee_id) conditions.push(sql`employee_id = ${safeInt(req.query.employee_id)}`);
    if (req.query.category) conditions.push(sql`skill_category ILIKE ${String(req.query.category)}`);
    if (req.query.department) conditions.push(sql`department ILIKE ${String(req.query.department)}`);

    const rows = await db.execute(
      conditions.length > 0
        ? sql`SELECT * FROM skills_matrix WHERE ${sql.join(conditions, sql` AND `)} ORDER BY skill_category, skill_name`
        : sql`SELECT * FROM skills_matrix ORDER BY skill_category, skill_name`
    );
    res.json(rows.rows);
  } catch (e: unknown) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Server error" });
  }
});

router.get("/skills-matrix/categories", async (req: Request, res: Response): Promise<void> => {
  if (!checkHrAccess(req.permissions, "read")) { res.status(403).json({ error: "אין הרשאה לצפייה בנתוני עובדים" }); return; }
  try {
    const rows = await db.execute(sql`SELECT DISTINCT skill_category FROM skills_matrix WHERE skill_category IS NOT NULL ORDER BY skill_category`);
    res.json(rows.rows.map((r: Record<string, unknown>) => r.skill_category));
  } catch (e: unknown) { res.status(500).json({ error: e instanceof Error ? e.message : "Server error" }); }
});

router.get("/skills-matrix/summary", async (req: Request, res: Response): Promise<void> => {
  if (!checkHrAccess(req.permissions, "read")) { res.status(403).json({ error: "אין הרשאה לצפייה בנתוני עובדים" }); return; }
  try {
    const dept = req.query.department ? String(req.query.department) : null;
    const rows = dept
      ? await db.execute(sql`
          SELECT sm.skill_name, sm.skill_category,
            COUNT(*) as employee_count,
            ROUND(AVG(sm.proficiency_level), 1) as avg_proficiency,
            COUNT(*) FILTER (WHERE sm.proficiency_level >= 4) as expert_count,
            COUNT(*) FILTER (WHERE sm.proficiency_level <= 2) as beginner_count
          FROM skills_matrix sm
          WHERE sm.department ILIKE ${dept}
          GROUP BY sm.skill_name, sm.skill_category
          ORDER BY sm.skill_category, sm.skill_name
        `)
      : await db.execute(sql`
          SELECT sm.skill_name, sm.skill_category,
            COUNT(*) as employee_count,
            ROUND(AVG(sm.proficiency_level), 1) as avg_proficiency,
            COUNT(*) FILTER (WHERE sm.proficiency_level >= 4) as expert_count,
            COUNT(*) FILTER (WHERE sm.proficiency_level <= 2) as beginner_count
          FROM skills_matrix sm
          GROUP BY sm.skill_name, sm.skill_category
          ORDER BY sm.skill_category, sm.skill_name
        `);
    res.json(rows.rows);
  } catch (e: unknown) { res.status(500).json({ error: e instanceof Error ? e.message : "Server error" }); }
});

router.get("/skills-matrix/gap-analysis", async (req: Request, res: Response): Promise<void> => {
  if (!checkHrAccess(req.permissions, "read")) { res.status(403).json({ error: "אין הרשאה לצפייה בנתוני עובדים" }); return; }
  try {
    const empId = req.query.employee_id ? safeInt(req.query.employee_id) : null;
    const role = req.query.role ? String(req.query.role) : null;
    const dept = req.query.department ? String(req.query.department) : null;

    const profileQuery = role
      ? await db.execute(sql`SELECT * FROM skill_gap_profiles WHERE role_title = ${role} ORDER BY skill_category, skill_name`)
      : dept
      ? await db.execute(sql`SELECT * FROM skill_gap_profiles WHERE department = ${dept} ORDER BY skill_category, skill_name`)
      : await db.execute(sql`SELECT * FROM skill_gap_profiles ORDER BY skill_category, skill_name`);

    const profiles = profileQuery.rows as Record<string, unknown>[];

    let actualSkills: Record<string, unknown>[] = [];
    if (empId) {
      const r = await db.execute(sql`SELECT * FROM skills_matrix WHERE employee_id = ${empId}`);
      actualSkills = r.rows as Record<string, unknown>[];
    } else if (dept) {
      const r = await db.execute(sql`SELECT * FROM skills_matrix WHERE department ILIKE ${dept}`);
      actualSkills = r.rows as Record<string, unknown>[];
    }

    const gaps = profiles.map((p) => {
      const actual = actualSkills.find((a) => a.skill_name === p.skill_name);
      const currentLevel = actual ? Number(actual.proficiency_level) : 0;
      const requiredLevel = Number(p.required_level);
      return {
        skill_name: p.skill_name,
        skill_category: p.skill_category,
        required_level: requiredLevel,
        current_level: currentLevel,
        gap: requiredLevel - currentLevel,
        has_skill: !!actual,
      };
    });

    res.json(gaps);
  } catch (e: unknown) { res.status(500).json({ error: e instanceof Error ? e.message : "Server error" }); }
});

router.post("/skills-matrix", async (req: AuthRequest, res: Response): Promise<void> => {
  if (!checkHrAccess(req.permissions, "create")) { res.status(403).json({ error: "אין הרשאה ליצירת רשומות עובדים" }); return; }
  try {
    const b = req.body as Record<string, unknown>;
    const user = req.currentUser;
    if (!b.employeeId || !b.skillName) { res.status(400).json({ error: "employeeId and skillName required" }); return; }
    const empId = safeInt(b.employeeId);
    const profLevel = clampProficiency(b.proficiencyLevel);
    const certDate = safeDate(b.certifiedDate);
    const expiryDate = safeDate(b.expiryDate);
    const assessedBy = String(b.assessedBy || user?.fullName || "");

    await db.execute(sql`
      INSERT INTO skills_matrix (employee_id, employee_name, department, skill_name, skill_category, proficiency_level, certified_date, expiry_date, assessed_by, notes)
      VALUES (${empId}, ${b.employeeName as string || null}, ${b.department as string || null}, ${b.skillName as string},
        ${b.skillCategory as string || null}, ${profLevel},
        ${certDate ? sql`${certDate}::date` : sql`NULL`},
        ${expiryDate ? sql`${expiryDate}::date` : sql`NULL`},
        ${assessedBy || null}, ${b.notes as string || null})
    `);
    const rows = await db.execute(sql`SELECT * FROM skills_matrix WHERE employee_id = ${empId} ORDER BY id DESC LIMIT 1`);
    res.json(rows.rows[0]);
  } catch (e: unknown) { res.status(500).json({ error: e instanceof Error ? e.message : "Server error" }); }
});

router.put("/skills-matrix/:id", async (req: Request, res: Response): Promise<void> => {
  if (!checkHrAccess(req.permissions, "update")) { res.status(403).json({ error: "אין הרשאה לעריכת רשומות עובדים" }); return; }
  try {
    const id = safeInt(req.params.id);
    const b = req.body as Record<string, unknown>;
    const profLevel = b.proficiencyLevel !== undefined ? clampProficiency(b.proficiencyLevel) : null;
    const certDate = b.certifiedDate !== undefined ? safeDate(b.certifiedDate) : undefined;
    const expiryDate = b.expiryDate !== undefined ? safeDate(b.expiryDate) : undefined;

    const setParts: ReturnType<typeof sql>[] = [sql`updated_at = NOW()`];
    if (b.skillName !== undefined) setParts.push(sql`skill_name = ${b.skillName as string}`);
    if (b.skillCategory !== undefined) setParts.push(sql`skill_category = ${b.skillCategory as string || null}`);
    if (profLevel !== null) setParts.push(sql`proficiency_level = ${profLevel}`);
    if (certDate !== undefined) setParts.push(certDate ? sql`certified_date = ${certDate}::date` : sql`certified_date = NULL`);
    if (expiryDate !== undefined) setParts.push(expiryDate ? sql`expiry_date = ${expiryDate}::date` : sql`expiry_date = NULL`);
    if (b.assessedBy !== undefined) setParts.push(sql`assessed_by = ${b.assessedBy as string || null}`);
    if (b.notes !== undefined) setParts.push(sql`notes = ${b.notes as string || null}`);

    await db.execute(sql`UPDATE skills_matrix SET ${sql.join(setParts, sql`, `)} WHERE id = ${id}`);
    const rows = await db.execute(sql`SELECT * FROM skills_matrix WHERE id = ${id}`);
    res.json(rows.rows[0]);
  } catch (e: unknown) { res.status(500).json({ error: e instanceof Error ? e.message : "Server error" }); }
});

router.delete("/skills-matrix/:id", async (req: Request, res: Response): Promise<void> => {
  if (!checkHrAccess(req.permissions, "delete")) { res.status(403).json({ error: "אין הרשאה למחיקת רשומות עובדים" }); return; }
  try {
    await db.execute(sql`DELETE FROM skills_matrix WHERE id = ${safeInt(req.params.id)}`);
    res.json({ success: true });
  } catch (e: unknown) { res.status(500).json({ error: e instanceof Error ? e.message : "Server error" }); }
});

router.post("/skills-matrix/bulk", async (req: AuthRequest, res: Response): Promise<void> => {
  if (!checkHrAccess(req.permissions, "create")) { res.status(403).json({ error: "אין הרשאה ליצירת רשומות עובדים" }); return; }
  try {
    const { employeeId, employeeName, department, skills } = req.body as {
      employeeId: unknown;
      employeeName?: string;
      department?: string;
      skills: unknown[];
    };
    const user = req.currentUser;
    if (!employeeId) { res.status(400).json({ error: "employeeId required" }); return; }
    if (!Array.isArray(skills) || skills.length === 0) { res.status(400).json({ error: "skills array required" }); return; }
    const empId = safeInt(employeeId);

    for (const item of skills) {
      const skill = item as Record<string, unknown>;
      if (!skill.skillName || typeof skill.skillName !== "string") continue;
      const profLevel = clampProficiency(skill.proficiencyLevel);
      await db.execute(sql`
        INSERT INTO skills_matrix (employee_id, employee_name, department, skill_name, skill_category, proficiency_level, assessed_by)
        VALUES (${empId}, ${employeeName || null}, ${department || null}, ${skill.skillName},
          ${skill.skillCategory as string || null}, ${profLevel}, ${user?.fullName || null})
        ON CONFLICT DO NOTHING
      `);
    }

    const rows = await db.execute(sql`SELECT * FROM skills_matrix WHERE employee_id = ${empId} ORDER BY skill_category, skill_name`);
    res.json(rows.rows);
  } catch (e: unknown) { res.status(500).json({ error: e instanceof Error ? e.message : "Server error" }); }
});

// ========== EMPLOYMENT HISTORY ==========

router.get("/employment-history", async (req: Request, res: Response): Promise<void> => {
  if (!checkHrAccess(req.permissions, "read")) { res.status(403).json({ error: "אין הרשאה לצפייה בנתוני עובדים" }); return; }
  try {
    const empId = req.query.employee_id ? safeInt(req.query.employee_id) : null;
    const rows = empId
      ? await db.execute(sql`SELECT * FROM employment_history WHERE employee_id = ${empId} ORDER BY effective_date DESC, id DESC`)
      : await db.execute(sql`SELECT * FROM employment_history ORDER BY effective_date DESC, id DESC`);
    res.json(rows.rows);
  } catch (e: unknown) { res.status(500).json({ error: e instanceof Error ? e.message : "Server error" }); }
});

router.post("/employment-history", async (req: AuthRequest, res: Response): Promise<void> => {
  if (!checkHrAccess(req.permissions, "create")) { res.status(403).json({ error: "אין הרשאה ליצירת רשומות עובדים" }); return; }
  try {
    const b = req.body as Record<string, unknown>;
    const user = req.currentUser;
    if (!b.employeeId || !b.eventType || !b.effectiveDate) { res.status(400).json({ error: "employeeId, eventType, effectiveDate required" }); return; }
    const empId = safeInt(b.employeeId);
    const effectiveDate = safeDate(b.effectiveDate);
    if (!effectiveDate) { res.status(400).json({ error: "Invalid effectiveDate" }); return; }

    await db.execute(sql`
      INSERT INTO employment_history (employee_id, employee_name, event_type, from_value, to_value, effective_date, approved_by, notes)
      VALUES (${empId}, ${b.employeeName as string || null}, ${String(b.eventType)},
        ${b.fromValue as string || null}, ${b.toValue as string || null},
        ${effectiveDate}::date, ${b.approvedBy as string || user?.fullName || null}, ${b.notes as string || null})
    `);
    const rows = await db.execute(sql`SELECT * FROM employment_history WHERE employee_id = ${empId} ORDER BY id DESC LIMIT 1`);
    res.json(rows.rows[0]);
  } catch (e: unknown) { res.status(500).json({ error: e instanceof Error ? e.message : "Server error" }); }
});

router.delete("/employment-history/:id", async (req: Request, res: Response): Promise<void> => {
  if (!checkHrAccess(req.permissions, "delete")) { res.status(403).json({ error: "אין הרשאה למחיקת רשומות עובדים" }); return; }
  try {
    await db.execute(sql`DELETE FROM employment_history WHERE id = ${safeInt(req.params.id)}`);
    res.json({ success: true });
  } catch (e: unknown) { res.status(500).json({ error: e instanceof Error ? e.message : "Server error" }); }
});

// ========== CERTIFICATIONS ==========

router.get("/certifications", async (req: Request, res: Response): Promise<void> => {
  if (!checkHrAccess(req.permissions, "read")) { res.status(403).json({ error: "אין הרשאה לצפייה בנתוני עובדים" }); return; }
  try {
    const empId = req.query.employee_id ? safeInt(req.query.employee_id) : null;
    const dept = req.query.department ? String(req.query.department) : null;

    const rows = await db.execute(
      empId
        ? sql`SELECT *, (expiry_date - CURRENT_DATE) as days_until_expiry FROM certifications WHERE employee_id = ${empId} ORDER BY expiry_date ASC NULLS LAST`
        : dept
        ? sql`SELECT *, (expiry_date - CURRENT_DATE) as days_until_expiry FROM certifications WHERE department ILIKE ${dept} ORDER BY expiry_date ASC NULLS LAST`
        : sql`SELECT *, (expiry_date - CURRENT_DATE) as days_until_expiry FROM certifications ORDER BY expiry_date ASC NULLS LAST`
    );
    res.json(rows.rows);
  } catch (e: unknown) { res.status(500).json({ error: e instanceof Error ? e.message : "Server error" }); }
});

router.post("/certifications", async (req: AuthRequest, res: Response): Promise<void> => {
  if (!checkHrAccess(req.permissions, "create")) { res.status(403).json({ error: "אין הרשאה ליצירת רשומות עובדים" }); return; }
  try {
    const b = req.body as Record<string, unknown>;
    if (!b.employeeId || !b.certName) { res.status(400).json({ error: "employeeId and certName required" }); return; }
    const empId = safeInt(b.employeeId);
    const issuedDate = safeDate(b.issuedDate);
    const expiryDate = safeDate(b.expiryDate);

    await db.execute(sql`
      INSERT INTO certifications (employee_id, employee_name, department, cert_name, cert_type, issuing_body, cert_number, issued_date, expiry_date, status, notes)
      VALUES (${empId}, ${b.employeeName as string || null}, ${b.department as string || null},
        ${b.certName as string},
        ${b.certType as string || null}, ${b.issuingBody as string || null}, ${b.certNumber as string || null},
        ${issuedDate ? sql`${issuedDate}::date` : sql`NULL`},
        ${expiryDate ? sql`${expiryDate}::date` : sql`NULL`},
        ${b.status as string || 'active'}, ${b.notes as string || null})
    `);
    const rows = await db.execute(sql`SELECT * FROM certifications WHERE employee_id = ${empId} ORDER BY id DESC LIMIT 1`);
    res.json(rows.rows[0]);
  } catch (e: unknown) { res.status(500).json({ error: e instanceof Error ? e.message : "Server error" }); }
});

router.put("/certifications/:id", async (req: Request, res: Response): Promise<void> => {
  if (!checkHrAccess(req.permissions, "update")) { res.status(403).json({ error: "אין הרשאה לעריכת רשומות עובדים" }); return; }
  try {
    const id = safeInt(req.params.id);
    const b = req.body as Record<string, unknown>;
    const issuedDate = b.issuedDate !== undefined ? safeDate(b.issuedDate) : undefined;
    const expiryDate = b.expiryDate !== undefined ? safeDate(b.expiryDate) : undefined;

    const setParts: ReturnType<typeof sql>[] = [sql`updated_at = NOW()`];
    if (b.certName !== undefined) setParts.push(sql`cert_name = ${b.certName as string}`);
    if (b.certType !== undefined) setParts.push(sql`cert_type = ${b.certType as string || null}`);
    if (b.issuingBody !== undefined) setParts.push(sql`issuing_body = ${b.issuingBody as string || null}`);
    if (b.certNumber !== undefined) setParts.push(sql`cert_number = ${b.certNumber as string || null}`);
    if (issuedDate !== undefined) setParts.push(issuedDate ? sql`issued_date = ${issuedDate}::date` : sql`issued_date = NULL`);
    if (expiryDate !== undefined) setParts.push(expiryDate ? sql`expiry_date = ${expiryDate}::date` : sql`expiry_date = NULL`);
    if (b.status !== undefined) setParts.push(sql`status = ${b.status as string || 'active'}`);
    if (b.notes !== undefined) setParts.push(sql`notes = ${b.notes as string || null}`);

    await db.execute(sql`UPDATE certifications SET ${sql.join(setParts, sql`, `)} WHERE id = ${id}`);
    const rows = await db.execute(sql`SELECT * FROM certifications WHERE id = ${id}`);
    res.json(rows.rows[0]);
  } catch (e: unknown) { res.status(500).json({ error: e instanceof Error ? e.message : "Server error" }); }
});

router.delete("/certifications/:id", async (req: Request, res: Response): Promise<void> => {
  if (!checkHrAccess(req.permissions, "delete")) { res.status(403).json({ error: "אין הרשאה למחיקת רשומות עובדים" }); return; }
  try {
    await db.execute(sql`DELETE FROM certifications WHERE id = ${safeInt(req.params.id)}`);
    res.json({ success: true });
  } catch (e: unknown) { res.status(500).json({ error: e instanceof Error ? e.message : "Server error" }); }
});

// ========== COMPLIANCE ALERTS ==========

router.get("/compliance-alerts", async (req: Request, res: Response): Promise<void> => {
  if (!checkHrAccess(req.permissions, "read")) { res.status(403).json({ error: "אין הרשאה לצפייה בנתוני עובדים" }); return; }
  try {
    const empId = req.query.employee_id ? safeInt(req.query.employee_id) : null;
    const alertType = req.query.alert_type ? String(req.query.alert_type) : null;
    const status = req.query.status ? String(req.query.status) : null;

    const conditions: ReturnType<typeof sql>[] = [];
    if (empId) conditions.push(sql`employee_id = ${empId}`);
    if (alertType) conditions.push(sql`alert_type = ${alertType}`);
    if (status) conditions.push(sql`status = ${status}`);

    const rows = await db.execute(
      conditions.length > 0
        ? sql`SELECT *, (expiry_date - CURRENT_DATE) as days_until_expiry FROM compliance_alerts WHERE ${sql.join(conditions, sql` AND `)} ORDER BY expiry_date ASC`
        : sql`SELECT *, (expiry_date - CURRENT_DATE) as days_until_expiry FROM compliance_alerts ORDER BY expiry_date ASC`
    );
    res.json(rows.rows);
  } catch (e: unknown) { res.status(500).json({ error: e instanceof Error ? e.message : "Server error" }); }
});

router.get("/compliance-alerts/dashboard", async (req: Request, res: Response): Promise<void> => {
  if (!checkHrAccess(req.permissions, "read")) { res.status(403).json({ error: "אין הרשאה לצפייה בנתוני עובדים" }); return; }
  try {
    const rows = await db.execute(sql`
      SELECT *, (expiry_date - CURRENT_DATE) as days_until_expiry
      FROM compliance_alerts
      WHERE status = 'active' AND expiry_date IS NOT NULL
      ORDER BY expiry_date ASC
    `);

    const alerts = rows.rows as Record<string, unknown>[];
    const summary = {
      total: alerts.length,
      expired: alerts.filter((r) => Number(r.days_until_expiry) < 0).length,
      within30: alerts.filter((r) => Number(r.days_until_expiry) >= 0 && Number(r.days_until_expiry) <= 30).length,
      within60: alerts.filter((r) => Number(r.days_until_expiry) > 30 && Number(r.days_until_expiry) <= 60).length,
      within90: alerts.filter((r) => Number(r.days_until_expiry) > 60 && Number(r.days_until_expiry) <= 90).length,
    };

    const byType = alerts.reduce((acc: Record<string, unknown[]>, r) => {
      const key = String(r.alert_type);
      if (!acc[key]) acc[key] = [];
      acc[key].push(r);
      return acc;
    }, {});

    res.json({ summary, byType, alerts });
  } catch (e: unknown) { res.status(500).json({ error: e instanceof Error ? e.message : "Server error" }); }
});

router.post("/compliance-alerts/resolve/:id", async (req: Request, res: Response): Promise<void> => {
  if (!checkHrAccess(req.permissions, "update")) { res.status(403).json({ error: "אין הרשאה לעריכת רשומות עובדים" }); return; }
  try {
    await db.execute(sql`UPDATE compliance_alerts SET status = 'resolved', resolved_at = NOW(), updated_at = NOW() WHERE id = ${safeInt(req.params.id)}`);
    res.json({ success: true });
  } catch (e: unknown) { res.status(500).json({ error: e instanceof Error ? e.message : "Server error" }); }
});

router.delete("/compliance-alerts/:id", async (req: Request, res: Response): Promise<void> => {
  if (!checkHrAccess(req.permissions, "delete")) { res.status(403).json({ error: "אין הרשאה למחיקת רשומות עובדים" }); return; }
  try {
    await db.execute(sql`DELETE FROM compliance_alerts WHERE id = ${safeInt(req.params.id)}`);
    res.json({ success: true });
  } catch (e: unknown) { res.status(500).json({ error: e instanceof Error ? e.message : "Server error" }); }
});

// ========== COMPLIANCE SCAN ==========

async function scanEmployeeCompliance(): Promise<void> {
  try {
    const result = await db.execute(sql`
      SELECT er.id, er.data, er.status
      FROM entity_records er
      WHERE er.entity_id = 34 AND er.status != 'terminated'
    `);

    const rows = result.rows as Record<string, unknown>[];

    const complianceFields: Array<{ field: string; label: string; alertType: string }> = [
      { field: "work_permit_expiry", label: "היתר עבודה", alertType: "work_permit" },
      { field: "visa_expiry", label: "ויזה", alertType: "visa" },
      { field: "residence_permit_expiry", label: "היתר שהייה", alertType: "residence_permit" },
      { field: "safety_training_expiry", label: "הכשרת בטיחות", alertType: "safety_training" },
      { field: "forklift_license_expiry", label: "רישיון מלגזה", alertType: "forklift_license" },
      { field: "crane_license_expiry", label: "רישיון עגורן", alertType: "crane_license" },
      { field: "welding_certificate_expiry", label: "תעודת ריתוך", alertType: "welding_cert" },
      { field: "heights_certificate_expiry", label: "עבודה בגובה", alertType: "heights_cert" },
      { field: "first_aid_expiry", label: "עזרה ראשונה", alertType: "first_aid" },
      { field: "medical_exam_expiry", label: "בדיקה רפואית", alertType: "medical_exam" },
      { field: "professional_license_expiry", label: "רישיון מקצועי", alertType: "professional_license" },
      { field: "passport_expiry", label: "דרכון", alertType: "passport" },
    ];

    for (const emp of rows) {
      const d = (emp.data as Record<string, unknown>) || {};
      const empId = emp.id as number;
      const empName = String(d.full_name || `${d.first_name || ""} ${d.last_name || ""}`.trim() || "");
      const dept = d.department ? String(d.department) : null;

      for (const cf of complianceFields) {
        const expiry = d[cf.field];
        if (!expiry) continue;

        const safeExpiry = safeDate(expiry);
        if (!safeExpiry) continue;

        const expiryTs = new Date(safeExpiry).getTime();
        const todayTs = new Date().setHours(0, 0, 0, 0);
        const daysUntil = Math.floor((expiryTs - todayTs) / (1000 * 60 * 60 * 24));

        if (daysUntil <= 90) {
          const existing = await db.execute(sql`
            SELECT id FROM compliance_alerts
            WHERE employee_id = ${empId} AND alert_type = ${cf.alertType} AND status = 'active'
          `);

          if (existing.rows.length === 0) {
            await db.execute(sql`
              INSERT INTO compliance_alerts (employee_id, employee_name, department, alert_type, item_name, expiry_date, days_until_expiry, status)
              VALUES (${empId}, ${empName || null}, ${dept}, ${cf.alertType}, ${cf.label}, ${safeExpiry}::date, ${daysUntil}, 'active')
            `);
          } else {
            await db.execute(sql`
              UPDATE compliance_alerts
              SET days_until_expiry = ${daysUntil}, expiry_date = ${safeExpiry}::date, updated_at = NOW()
              WHERE employee_id = ${empId} AND alert_type = ${cf.alertType} AND status = 'active'
            `);
          }
        } else {
          await db.execute(sql`
            UPDATE compliance_alerts
            SET status = 'resolved', resolved_at = NOW(), updated_at = NOW()
            WHERE employee_id = ${empId} AND alert_type = ${cf.alertType} AND status = 'active'
              AND expiry_date = ${safeExpiry}::date
          `);
        }
      }
    }
    console.log("[hr-workforce] compliance scan complete, scanned", rows.length, "employees");
  } catch (e: unknown) {
    console.error("[hr-workforce] compliance scan error:", e instanceof Error ? e.message : String(e));
  }
}

router.post("/compliance-scan", async (req: Request, res: Response): Promise<void> => {
  if (!checkHrAccess(req.permissions, "read")) { res.status(403).json({ error: "אין הרשאה לסריקת ציות" }); return; }
  scanEmployeeCompliance().catch(console.error);
  res.json({ success: true, message: "Compliance scan started" });
});

const SCAN_INTERVAL = 6 * 60 * 60 * 1000;
setTimeout(() => {
  scanEmployeeCompliance();
  setInterval(scanEmployeeCompliance, SCAN_INTERVAL);
}, 10000);

// ========== ORG CHART REASSIGNMENT (with cycle detection) ==========

async function getAllDescendantIds(empId: number, allEmployees: Record<string, unknown>[]): Promise<Set<number>> {
  const descendants = new Set<number>();
  const queue: number[] = [empId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const emp of allEmployees) {
      const d = (emp.data as Record<string, unknown>) || {};
      if (Number(d.manager_id) === current && Number(emp.id) !== empId) {
        const childId = Number(emp.id);
        if (!descendants.has(childId)) {
          descendants.add(childId);
          queue.push(childId);
        }
      }
    }
  }
  return descendants;
}

router.put("/org-chart/reassign", async (req: AuthRequest, res: Response): Promise<void> => {
  if (!checkHrAccess(req.permissions, "update")) { res.status(403).json({ error: "אין הרשאה לעריכת מבנה ארגוני" }); return; }
  try {
    const { employeeId, newManagerId } = req.body as { employeeId: unknown; newManagerId: unknown };
    if (!employeeId) { res.status(400).json({ error: "employeeId required" }); return; }
    const user = req.currentUser;
    const empId = safeInt(employeeId);

    if (newManagerId && safeInt(newManagerId) === empId) {
      res.status(400).json({ error: "עובד לא יכול להיות המנהל של עצמו" });
      return;
    }

    const empRows = await db.execute(sql`SELECT id, data FROM entity_records WHERE id = ${empId} AND entity_id = 34`);
    if (!empRows.rows.length) { res.status(404).json({ error: "עובד לא נמצא" }); return; }

    if (newManagerId) {
      const newMgrId = safeInt(newManagerId);
      const allEmpsResult = await db.execute(sql`SELECT id, data FROM entity_records WHERE entity_id = 34`);
      const allEmployees = allEmpsResult.rows as Record<string, unknown>[];
      const descendants = await getAllDescendantIds(empId, allEmployees);

      if (descendants.has(newMgrId)) {
        res.status(400).json({ error: "לא ניתן לשבץ עובד כמנהל של מנהלו — מבנה מעגלי" });
        return;
      }
    }

    const emp = empRows.rows[0] as Record<string, unknown>;
    const empData = (emp.data as Record<string, unknown>) || {};
    const oldManagerId = empData.manager_id;
    const oldManagerName = empData.manager_name;

    let newManagerName: string | null = null;
    if (newManagerId) {
      const newMgrId = safeInt(newManagerId);
      const mgr = await db.execute(sql`SELECT id, data FROM entity_records WHERE id = ${newMgrId} AND entity_id = 34`);
      if (mgr.rows.length) {
        const mgrData = ((mgr.rows[0] as Record<string, unknown>).data as Record<string, unknown>) || {};
        newManagerName = String(mgrData.full_name || `${mgrData.first_name || ""} ${mgrData.last_name || ""}`.trim() || "");
      }
    }

    const updatedData = { ...empData, manager_id: newManagerId || null, manager_name: newManagerName || null };
    const updatedDataStr = JSON.stringify(updatedData);

    await db.execute(sql`UPDATE entity_records SET data = ${updatedDataStr}::jsonb, updated_at = NOW() WHERE id = ${empId}`);

    const fromVal = String(oldManagerName || oldManagerId || "—");
    const toVal = String(newManagerName || newManagerId || "—");
    const empName = String(empData.full_name || "");
    const approver = user?.fullName || null;

    await db.execute(sql`
      INSERT INTO employment_history (employee_id, employee_name, event_type, from_value, to_value, effective_date, approved_by, notes)
      VALUES (${empId}, ${empName || null}, 'manager_change', ${fromVal}, ${toVal},
        CURRENT_DATE, ${approver}, 'עדכון מנהל ישיר דרך מבנה ארגוני')
    `);

    res.json({ success: true, employeeId: empId, newManagerId, newManagerName });
  } catch (e: unknown) { res.status(500).json({ error: e instanceof Error ? e.message : "Server error" }); }
});

export default router;
