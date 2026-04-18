import { Router, Request, Response } from "express";
import { pool, backgroundPool } from "@workspace/db";
import multer from "multer";
import path from "path";
import fs from "fs";

const router = Router();

// ═══ FILE UPLOAD SETUP ═══════════════════════════════════
const msdsDir = path.join(process.cwd(), "uploads", "hse-msds");
fs.mkdirSync(msdsDir, { recursive: true });

const msdsUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, msdsDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname);
      cb(null, `msds-${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
    },
  }),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const allowed = [".pdf", ".doc", ".docx", ".jpg", ".jpeg", ".png", ".webp"];
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error("סוג קובץ לא נתמך. ניתן להעלות: PDF, Word, תמונות"));
  },
});

// ═══ PERMIT TYPES API ═══════════════════════════════════

router.get("/hse/permit-types", async (_req: Request, res: Response) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM hse_work_permit_types WHERE is_active = true ORDER BY type_code`
    );
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/hse/permit-types", async (req: Request, res: Response) => {
  try {
    const { type_code, type_name, description, required_approvers, checklist_items, icon, color } = req.body;
    if (!type_code || !type_name) {
      res.status(400).json({ error: "type_code ו-type_name נדרשים" });
      return;
    }
    const { rows } = await pool.query(
      `INSERT INTO hse_work_permit_types (type_code, type_name, description, required_approvers, checklist_items, icon, color)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [type_code, type_name, description || null, required_approvers || 2,
       JSON.stringify(checklist_items || []), icon || null, color || null]
    );
    res.status(201).json(rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.put("/hse/permit-types/:id", async (req: Request, res: Response) => {
  try {
    const { type_name, description, required_approvers, checklist_items, icon, color, is_active } = req.body;
    const { rows } = await pool.query(
      `UPDATE hse_work_permit_types SET type_name=$2, description=$3, required_approvers=$4,
       checklist_items=$5, icon=$6, color=$7, is_active=$8, updated_at=NOW()
       WHERE id=$1 RETURNING *`,
      [req.params.id, type_name, description, required_approvers,
       JSON.stringify(checklist_items || []), icon, color, is_active !== undefined ? is_active : true]
    );
    if (!rows[0]) { res.status(404).json({ error: "סוג היתר לא נמצא" }); return; }
    res.json(rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ═══ MSDS DOCUMENT UPLOAD ═══════════════════════════════

// Authenticated MSDS file download endpoint (keeps files behind auth middleware)
router.get("/hse/msds/file/:filename", (req: Request, res: Response) => {
  const filename = path.basename(req.params.filename); // prevent path traversal
  const filePath = path.join(msdsDir, filename);
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: "קובץ לא נמצא" });
    return;
  }
  res.sendFile(filePath);
});

router.post("/hse/msds/upload", msdsUpload.single("file"), async (req: Request, res: Response) => {
  try {
    const file = req.file;
    if (!file) { res.status(400).json({ error: "לא הועלה קובץ" }); return; }

    const { chemical_id, document_number, revision, language, issue_date, expiry_date, supplier, notes } = req.body;

    if (!chemical_id) { res.status(400).json({ error: "chemical_id נדרש" }); return; }

    // Store as public path — MSDS safety sheets do not require auth to view
    const fileUrl = `/hse-files/${file.filename}`;

    if (expiry_date) {
      await pool.query(
        `UPDATE hse_msds_documents SET is_current = false WHERE chemical_id = $1 AND is_current = true`,
        [chemical_id]
      );
    }

    const { rows } = await pool.query(
      `INSERT INTO hse_msds_documents (
        chemical_id, document_number, revision, language,
        file_name, file_path, file_size,
        issue_date, expiry_date, supplier, notes, is_current, status
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,true,'active') RETURNING *`,
      [
        chemical_id, document_number || null, revision || "1.0", language || "he",
        file.originalname, fileUrl, file.size,
        issue_date || null, expiry_date || null, supplier || null, notes || null,
      ]
    );

    res.status(201).json(rows[0]);
  } catch (err: any) {
    console.error("[HSE] MSDS upload error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// Must be before /:chemical_id to avoid param conflict
router.get("/hse/msds/expiring", async (req: Request, res: Response) => {
  try {
    const days = Math.max(1, Math.min(365, parseInt(req.query.days as string || "30")));
    const { rows } = await pool.query(`
      SELECT d.*, c.chemical_name, c.status as chemical_status
      FROM hse_msds_documents d
      JOIN hse_chemicals c ON c.id = d.chemical_id
      WHERE d.expiry_date IS NOT NULL
        AND d.expiry_date <= NOW() + ($1 || ' days')::interval
        AND d.is_current = true
      ORDER BY d.expiry_date ASC
    `, [days]);
    res.json({ expiring: rows, count: rows.length, withinDays: days });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/hse/msds/:chemical_id", async (req: Request, res: Response) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM hse_msds_documents WHERE chemical_id = $1 ORDER BY created_at DESC`,
      [req.params.chemical_id]
    );
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/hse/msds/doc/:id", async (req: Request, res: Response) => {
  try {
    const { rows } = await pool.query(
      `SELECT file_path FROM hse_msds_documents WHERE id = $1`, [req.params.id]
    );
    if (rows[0]?.file_path) {
      // file_path is stored as /hse-files/<generated-filename>
      const filename = path.basename(rows[0].file_path);
      const absPath = path.join(msdsDir, filename);
      if (fs.existsSync(absPath)) fs.unlinkSync(absPath);
    }
    await pool.query(`DELETE FROM hse_msds_documents WHERE id = $1`, [req.params.id]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ═══ GENERIC CRUD GUARDRAILS — hse_work_permits ══════════
// These fields are controlled exclusively by the workflow endpoints.
// Direct CRUD write access is stripped to prevent workflow bypass.

const PERMIT_WORKFLOW_READONLY_FIELDS = [
  "status", "approval_level", "required_approval_levels", "approval_status",
  "checklist_verified", "checklist_data", "approved_by_safety", "approved_by_manager",
  "approved_at", "closed_by", "closed_at", "actual_start", "actual_end",
];

// Intercept PUT (update) on work permits — strip workflow fields from body
router.put("/hse-work-permits/:id", (req: Request, res: Response, next) => {
  for (const field of PERMIT_WORKFLOW_READONLY_FIELDS) {
    delete req.body[field];
  }
  next();
});

// Intercept POST (create) on work permits — enforce initial draft state
router.post("/hse-work-permits", (req: Request, res: Response, next) => {
  req.body.status = "draft";
  req.body.approval_level = 0;
  req.body.approval_status = "not_started";
  for (const field of ["approved_by_safety", "approved_by_manager", "approved_at",
    "closed_by", "closed_at", "actual_start", "actual_end", "checklist_verified"]) {
    delete req.body[field];
  }
  next();
});

// ═══ PERMIT WORKFLOW ENGINE — MULTI-LEVEL APPROVAL ════════

// Approval role hierarchy:
// Level 1: ממונה בטיחות (Safety Officer)   — required
// Level 2: מנהל אזור   (Area Manager)      — required
// Only after BOTH levels approve → permit becomes active

const APPROVAL_LEVELS: Record<string, number> = {
  safety_officer: 1,
  area_manager: 2,
  site_manager: 2,
};

const APPROVAL_LEVEL_NAMES: Record<number, string> = {
  1: "ממונה בטיחות",
  2: "מנהל אזור",
};

const CHECKLIST_BY_TYPE: Record<string, string[]> = {
  hot_work: ["אזור נקי מחומרים דליקים", "מטף כיבוי זמין", "מגן שריפה מוצב", "בדיקת גז עברה", "עובד כיבוי אש נוכח", "אישור מנהל אתר התקבל"],
  confined_space: ["בדיקת אוורור בוצעה", "בדיקת גזים מסוכנים", "ציוד חילוץ מוכן", "תקשורת עם שומר בחוץ", "נהלי חירום ידועים", "ציוד מגן נשימה זמין"],
  electrical_isolation: ["זיהוי כל נקודות הניתוק", "LOTO הוחל (נעל ותייג)", "בדיקת אפס מתח", "נוהל עבודה מאושר", "עובד חשמל מורשה", "ציוד הגנה חשמלית זמין"],
  excavation: ["גילוי תשתיות קיימות", "ביצוע גידור ואיתות", "בדיקת יציבות קרקע", "ציוד פינוי מוכן", "תיאום עם רשויות", "נוהל בטיחות חפירה"],
  working_at_heights: ["בדיקת ציוד עבודה בגובה", "בדיקת חגורת בטיחות", "אבטחת אזור למטה", "תנאי מזג אוויר מתאימים", "עובד מוסמך לעבודה בגובה", "ציוד חילוץ זמין"],
};

// POST /hse/permits/:id/submit — Draft → Pending Approval (Level 1)
router.post("/hse/permits/:id/submit", async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const { rows } = await pool.query(`SELECT * FROM hse_work_permits WHERE id = $1`, [id]);
    const permit = rows[0];
    if (!permit) { res.status(404).json({ error: "היתר לא נמצא" }); return; }
    if (permit.status !== "draft") {
      res.status(400).json({ error: `לא ניתן להגיש היתר בסטטוס ${permit.status}` }); return;
    }
    if (!permit.title || !permit.permit_type || !permit.planned_start || !permit.planned_end) {
      res.status(400).json({ error: "כותרת, סוג, תאריך תחילה וסיום נדרשים לפני הגשה" }); return;
    }

    const { rows: updated } = await pool.query(
      `UPDATE hse_work_permits SET status='pending_approval', approval_level=0, updated_at=NOW() WHERE id=$1 RETURNING *`,
      [id]
    );
    await createPermitNotification(updated[0], "submitted");
    res.json(updated[0]);
  } catch (err: any) {
    console.error("[HSE] submit permit:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /hse/permits/:id/approve — Multi-level: level 1 (safety) → level 2 (manager) → active
router.post("/hse/permits/:id/approve", async (req: Request, res: Response) => {
  const { id } = req.params;
  const { approver_name, approver_role, comments, checklist } = req.body;

  if (!approver_name) { res.status(400).json({ error: "שם המאשר נדרש" }); return; }
  if (!approver_role) { res.status(400).json({ error: "תפקיד המאשר נדרש" }); return; }

  // Validate approver_role is a recognized role key
  if (!(approver_role in APPROVAL_LEVELS)) {
    res.status(400).json({ error: `תפקיד לא מוכר: ${approver_role}` }); return;
  }

  const approverLevel = APPROVAL_LEVELS[approver_role];
  const approverRoleName = approver_role === "safety_officer"
    ? "ממונה בטיחות" : approver_role === "area_manager"
    ? "מנהל אזור" : approver_role === "site_manager" ? "מנהל אתר" : approver_role;

  try {
    const { rows } = await pool.query(`SELECT * FROM hse_work_permits WHERE id = $1`, [id]);
    const permit = rows[0];
    if (!permit) { res.status(404).json({ error: "היתר לא נמצא" }); return; }
    if (permit.status !== "pending_approval") {
      res.status(400).json({ error: `לא ניתן לאשר היתר בסטטוס ${permit.status}` }); return;
    }

    // Validate level ordering: submitted role must match the next required level
    const currentLevel = permit.approval_level || 0;
    const requiredNextLevel = currentLevel + 1;
    if (approverLevel !== requiredNextLevel) {
      const expectedRole = requiredNextLevel === 1 ? "ממונה בטיחות (safety_officer)" : "מנהל אזור (area_manager)";
      res.status(400).json({
        error: `שלב הנוכחי דורש ${expectedRole} (רמה ${requiredNextLevel}), התקבל תפקיד רמה ${approverLevel}`,
        currentLevel,
        requiredLevel: requiredNextLevel,
      });
      return;
    }

    // Validate checklist only on level 1 approval (safety officer)
    if (approverLevel === 1) {
      const requiredChecklist = CHECKLIST_BY_TYPE[permit.permit_type] || [];
      const checklistData: Record<string, boolean> = checklist || {};
      const unchecked = requiredChecklist.filter(item => !checklistData[item]);
      if (unchecked.length > 0) {
        res.status(400).json({ error: "יש לאשר את כל הפריטים ברשימת התיוג", unchecked });
        return;
      }
      // Persist checklist data on L1 approval
      await pool.query(
        `UPDATE hse_work_permits SET checklist_verified=true, checklist_data=$2 WHERE id=$1`,
        [id, JSON.stringify(checklistData)]
      );
    }

    // Record this approval
    await pool.query(
      `INSERT INTO hse_permit_approvals (permit_id, approver_name, approver_role, approver_level, decision, comments, approved_at)
       VALUES ($1,$2,$3,$4,'approved',$5,NOW())`,
      [id, approver_name, approverRoleName, approverLevel, comments || null]
    );

    const requiredLevels = permit.required_approval_levels || 2;
    const newLevel = approverLevel;
    const isFullyApproved = newLevel >= requiredLevels;

    let updateQuery: string;
    let updateParams: any[];

    if (isFullyApproved) {
      // All levels satisfied → activate permit
      updateQuery = `UPDATE hse_work_permits
        SET status='active', approval_level=$2, approved_by_safety=$3,
            approved_at=NOW(), actual_start=COALESCE(actual_start,NOW()), updated_at=NOW()
        WHERE id=$1 RETURNING *`;
      updateParams = [id, newLevel, approver_name];
    } else {
      // Still need more approvals
      updateQuery = `UPDATE hse_work_permits
        SET approval_level=$2, updated_at=NOW()
        WHERE id=$1 RETURNING *`;
      updateParams = [id, newLevel];
    }

    const { rows: updated } = await pool.query(updateQuery, updateParams);
    await createPermitNotification(updated[0], isFullyApproved ? "approved" : "partially_approved", approver_name);

    res.json({
      ...updated[0],
      approvalProgress: {
        currentLevel: newLevel,
        requiredLevels,
        isFullyApproved,
        nextRequired: isFullyApproved ? null : APPROVAL_LEVEL_NAMES[newLevel + 1],
      },
    });
  } catch (err: any) {
    console.error("[HSE] approve permit:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /hse/permits/:id/reject — Pending Approval → Draft (any approver level can reject)
router.post("/hse/permits/:id/reject", async (req: Request, res: Response) => {
  const { id } = req.params;
  const { approver_name, approver_role, comments } = req.body;

  if (!approver_name) { res.status(400).json({ error: "שם הדוחה נדרש" }); return; }
  if (!comments) { res.status(400).json({ error: "הסבר לדחייה נדרש" }); return; }

  const approverLevel = APPROVAL_LEVELS[approver_role || "safety_officer"] ?? 1;
  const approverRoleName = approver_role === "safety_officer"
    ? "ממונה בטיחות" : approver_role === "area_manager"
    ? "מנהל אזור" : "מנהל אתר";

  try {
    const { rows } = await pool.query(`SELECT * FROM hse_work_permits WHERE id = $1`, [id]);
    const permit = rows[0];
    if (!permit) { res.status(404).json({ error: "היתר לא נמצא" }); return; }
    if (permit.status !== "pending_approval") {
      res.status(400).json({ error: `לא ניתן לדחות היתר בסטטוס ${permit.status}` }); return;
    }

    await pool.query(
      `INSERT INTO hse_permit_approvals (permit_id, approver_name, approver_role, approver_level, decision, comments, approved_at)
       VALUES ($1,$2,$3,$4,'rejected',$5,NOW())`,
      [id, approver_name, approverRoleName, approverLevel, comments]
    );

    const { rows: updated } = await pool.query(
      `UPDATE hse_work_permits SET status='draft', approval_level=0, updated_at=NOW() WHERE id=$1 RETURNING *`,
      [id]
    );

    await createPermitNotification(updated[0], "rejected", approver_name, comments);
    res.json(updated[0]);
  } catch (err: any) {
    console.error("[HSE] reject permit:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /hse/permits/:id/extend — Active → Extended
router.post("/hse/permits/:id/extend", async (req: Request, res: Response) => {
  const { id } = req.params;
  const { new_end_date, extended_by, reason } = req.body;

  if (!new_end_date) { res.status(400).json({ error: "תאריך סיום חדש נדרש" }); return; }

  try {
    const { rows } = await pool.query(`SELECT * FROM hse_work_permits WHERE id = $1`, [id]);
    const permit = rows[0];
    if (!permit) { res.status(404).json({ error: "היתר לא נמצא" }); return; }
    if (permit.status !== "active") {
      res.status(400).json({ error: "ניתן להאריך רק היתר פעיל" }); return;
    }

    const extensionNote = reason
      ? `\n[הארכה ע"י ${extended_by || "מנהל"}: ${reason}]`
      : "";

    const { rows: updated } = await pool.query(
      `UPDATE hse_work_permits
       SET status='extended', planned_end=$2, notes=COALESCE(notes,'') || $3, updated_at=NOW()
       WHERE id=$1 RETURNING *`,
      [id, new_end_date, extensionNote]
    );

    await createPermitNotification(updated[0], "extended");
    res.json(updated[0]);
  } catch (err: any) {
    console.error("[HSE] extend permit:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /hse/permits/:id/close — Active/Extended → Closed
router.post("/hse/permits/:id/close", async (req: Request, res: Response) => {
  const { id } = req.params;
  const { closed_by, closure_notes } = req.body;

  try {
    const { rows } = await pool.query(`SELECT * FROM hse_work_permits WHERE id = $1`, [id]);
    const permit = rows[0];
    if (!permit) { res.status(404).json({ error: "היתר לא נמצא" }); return; }
    if (!["active", "extended"].includes(permit.status)) {
      res.status(400).json({ error: "ניתן לסגור רק היתר פעיל או מורחב" }); return;
    }

    const { rows: updated } = await pool.query(
      `UPDATE hse_work_permits
       SET status='closed', closed_by=$2, closed_at=NOW(), closure_notes=$3,
           actual_end=NOW(), updated_at=NOW()
       WHERE id=$1 RETURNING *`,
      [id, closed_by || "system", closure_notes || null]
    );

    await createPermitNotification(updated[0], "closed");
    res.json(updated[0]);
  } catch (err: any) {
    console.error("[HSE] close permit:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /hse/permits/active-board — Active permits grouped by area for kanban view
router.get("/hse/permits/active-board", async (_req: Request, res: Response) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        p.*,
        COALESCE(
          json_agg(a ORDER BY a.created_at DESC) FILTER (WHERE a.id IS NOT NULL),
          '[]'
        ) AS approvals
      FROM hse_work_permits p
      LEFT JOIN hse_permit_approvals a ON a.permit_id = p.id
      WHERE p.status IN ('active','extended','pending_approval')
        AND p.is_active = true
      GROUP BY p.id
      ORDER BY p.status DESC, p.planned_end ASC NULLS LAST
    `);

    const grouped: Record<string, any[]> = {};
    for (const permit of rows) {
      const area = permit.area || permit.location || "ללא אזור";
      if (!grouped[area]) grouped[area] = [];
      grouped[area].push(permit);
    }

    res.json({ board: grouped, total: rows.length, permits: rows });
  } catch (err: any) {
    console.error("[HSE] active board:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /hse/permits/:id/checklist — Get checklist for a permit
router.get("/hse/permits/:id/checklist", async (req: Request, res: Response) => {
  try {
    const { rows } = await pool.query(
      `SELECT permit_type, checklist_data, checklist_verified FROM hse_work_permits WHERE id = $1`,
      [req.params.id]
    );
    if (!rows[0]) { res.status(404).json({ error: "היתר לא נמצא" }); return; }
    const { permit_type, checklist_data, checklist_verified } = rows[0];
    const items = CHECKLIST_BY_TYPE[permit_type] || [];
    res.json({ items, checklist_data: checklist_data || {}, checklist_verified });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /hse/permits/:id/checklist — Save checklist progress
router.post("/hse/permits/:id/checklist", async (req: Request, res: Response) => {
  const { id } = req.params;
  const { checklist } = req.body;
  if (!checklist || typeof checklist !== "object") {
    res.status(400).json({ error: "checklist object נדרש" }); return;
  }
  try {
    const { rows } = await pool.query(`SELECT permit_type FROM hse_work_permits WHERE id = $1`, [id]);
    if (!rows[0]) { res.status(404).json({ error: "היתר לא נמצא" }); return; }

    const requiredItems = CHECKLIST_BY_TYPE[rows[0].permit_type] || [];
    const allChecked = requiredItems.every(item => !!checklist[item]);

    await pool.query(
      `UPDATE hse_work_permits SET checklist_data=$2, checklist_verified=$3, updated_at=NOW() WHERE id=$1`,
      [id, JSON.stringify(checklist), allChecked]
    );
    res.json({
      success: true,
      checklist_verified: allChecked,
      total: requiredItems.length,
      checked: Object.values(checklist).filter(Boolean).length,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ═══ PERMIT EXPIRATION CRON ═══════════════════════════════

async function runPermitExpirationCheck(): Promise<void> {
  let client: import("pg").PoolClient | undefined;
  try {
    client = await backgroundPool.connect();
    const { rows } = await client.query(`
      UPDATE hse_work_permits
      SET status='expired', updated_at=NOW()
      WHERE status IN ('active','extended')
        AND planned_end IS NOT NULL
        AND planned_end < NOW()
        AND is_active = true
      RETURNING id, title, permit_type, requester_name, planned_end
    `);
    if (rows.length > 0) {
      console.log(`[HSE] Expired ${rows.length} permits automatically`);
      for (const permit of rows) {
        await createPermitNotification(permit, "expired");
      }
    }
  } catch (err: any) {
    console.error("[HSE] Permit expiration check error:", err.message);
  } finally {
    client?.release();
  }
}

async function createPermitNotification(permit: any, event: string, actor?: string, detail?: string): Promise<void> {
  try {
    const eventMessages: Record<string, string> = {
      submitted: `היתר "${permit.title}" הוגש לאישור — ממתין לאישור ממונה בטיחות`,
      partially_approved: `היתר "${permit.title}" אושר ע"י ממונה בטיחות — ממתין לאישור מנהל אזור`,
      approved: `היתר "${permit.title}" אושר במלואו ע"י ${actor || "מנהל"} והופעל`,
      rejected: `היתר "${permit.title}" נדחה: ${detail || ""}`,
      extended: `היתר "${permit.title}" הוארך`,
      closed: `היתר "${permit.title}" נסגר`,
      expired: `היתר "${permit.title}" פג תוקף`,
    };
    const message = eventMessages[event] || `עדכון היתר: ${permit.title}`;
    const severity = ["rejected", "expired"].includes(event) ? "warning" : "info";
    const title = {
      submitted: "היתר ממתין לאישור",
      partially_approved: "אושר ע\"י ממונה — ממתין מנהל",
      approved: "היתר הופעל",
      rejected: "היתר נדחה",
      extended: "היתר הוארך",
      closed: "היתר נסגר",
      expired: "היתר פג תוקף",
    }[event] || "עדכון היתר";

    let c: import("pg").PoolClient | undefined;
    try {
      c = await backgroundPool.connect();
      await c.query(
        `INSERT INTO notifications (title, message, type, severity, entity_type, record_id, created_at)
         VALUES ($1,$2,'hse_permit',$3,'hse_work_permit',$4,NOW())`,
        [title, message, severity, permit.id]
      );
    } finally {
      c?.release();
    }
  } catch (_: any) {
    // Silently skip if notifications table has different schema
  }
}

let expirationInterval: ReturnType<typeof setInterval> | null = null;

export function startPermitExpirationScheduler(): void {
  if (expirationInterval) return;
  runPermitExpirationCheck().catch(() => {});
  expirationInterval = setInterval(() => {
    runPermitExpirationCheck().catch(() => {});
  }, 60 * 60 * 1000);
  console.log("[HSE] Permit expiration scheduler started (every 60 min)");
}

export default router;
