// Closure Entity — Final stage of Master Flow (Lead → ... → Closure)
// Per CLAUDE.md: project closure = punch list resolved, customer satisfaction survey,
// lessons learned, retention period, project status flipped to 'closed'.
//
// Tables:
//   - public.closure_records      (created lazily here — no live table existed)
//   - execution.projects          (existing — flipped to state='closed' on finalize)
//
// Pattern follows variation-orders.ts / projects-module.ts.
import { Router, type IRouter } from "express";
import { pool } from "@workspace/db";
import { z } from "zod/v4";

const router: IRouter = Router();

// ─── Lazy table migration (idempotent) ─────────────────────────────────────
async function ensureTables(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS closure_records (
      id SERIAL PRIMARY KEY,
      closure_number VARCHAR(40) UNIQUE,
      project_id INTEGER NOT NULL,
      project_name VARCHAR(300),
      customer_id INTEGER,
      status VARCHAR(40) DEFAULT 'draft',
      satisfaction_score NUMERIC(3,1),
      satisfaction_notes TEXT,
      punch_list_resolved BOOLEAN DEFAULT false,
      punch_list_open_count INTEGER DEFAULT 0,
      lessons_learned TEXT,
      retention_until DATE,
      retention_amount NUMERIC(14,2) DEFAULT 0,
      revenue_recognized NUMERIC(14,2) DEFAULT 0,
      final_invoice_id INTEGER,
      checklist JSONB DEFAULT '[]'::jsonb,
      finalized_at TIMESTAMP,
      finalized_by VARCHAR(200),
      archived_at TIMESTAMP,
      created_by VARCHAR(200),
      updated_by VARCHAR(200),
      notes TEXT,
      metadata JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_closure_project ON closure_records(project_id);
    CREATE INDEX IF NOT EXISTS idx_closure_status ON closure_records(status);
  `);
}
ensureTables().catch((err) => console.error("[closure] ensureTables error:", err?.message || err));

// ─── Validation schemas (zod/v4) ───────────────────────────────────────────
const CreateSchema = z.object({
  project_id: z.coerce.number().int().positive(),
  project_name: z.string().optional().nullable(),
  customer_id: z.coerce.number().int().positive().optional().nullable(),
  status: z.string().optional(),
  satisfaction_score: z.coerce.number().min(0).max(10).optional().nullable(),
  satisfaction_notes: z.string().optional().nullable(),
  punch_list_resolved: z.coerce.boolean().optional(),
  punch_list_open_count: z.coerce.number().int().min(0).optional(),
  lessons_learned: z.string().optional().nullable(),
  retention_until: z.string().optional().nullable(),
  retention_amount: z.coerce.number().optional(),
  revenue_recognized: z.coerce.number().optional(),
  final_invoice_id: z.coerce.number().int().positive().optional().nullable(),
  checklist: z.any().optional(),
  notes: z.string().optional().nullable(),
  created_by: z.string().optional().nullable(),
});

const UpdateSchema = CreateSchema.partial();

const ListQuerySchema = z.object({
  project_id: z.coerce.number().int().positive().optional(),
  status: z.string().optional(),
  date_from: z.string().optional(),
  date_to: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

// ─── helpers ───────────────────────────────────────────────────────────────
async function nextClosureNumber(): Promise<string> {
  const year = new Date().getFullYear();
  try {
    const r = await pool.query(
      `SELECT COUNT(*) AS cnt FROM closure_records WHERE EXTRACT(YEAR FROM created_at) = $1`,
      [year]
    );
    const seq = parseInt(r.rows?.[0]?.cnt || "0", 10) + 1;
    return `CLS-${year}-${String(seq).padStart(5, "0")}`;
  } catch {
    return `CLS-${year}-${String(Date.now()).slice(-5)}`;
  }
}

function safeRows<T = any>(q: { rows?: T[] } | undefined | null): T[] {
  return (q?.rows ?? []) as T[];
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/closure  — list with filters
// ═══════════════════════════════════════════════════════════════════════════
router.get("/closure", async (req, res) => {
  try {
    const q = ListQuerySchema.parse(req.query);
    const where: string[] = [];
    const params: any[] = [];
    let i = 1;
    if (q.project_id) { where.push(`project_id = $${i++}`); params.push(q.project_id); }
    if (q.status) { where.push(`status = $${i++}`); params.push(q.status); }
    if (q.date_from) { where.push(`created_at >= $${i++}`); params.push(q.date_from); }
    if (q.date_to) { where.push(`created_at <= $${i++}`); params.push(q.date_to); }
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const limit = q.limit ?? 100;
    const offset = q.offset ?? 0;
    const result = await pool.query(
      `SELECT * FROM closure_records ${whereSql} ORDER BY created_at DESC LIMIT $${i++} OFFSET $${i}`,
      [...params, limit, offset]
    );
    res.json({ data: safeRows(result), limit, offset });
  } catch (e: unknown) {
    res.status(400).json({ error: "שגיאה בטעינת רשימת סגירות", message: errMsg(e) });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/closure/:id  — single closure record
// ═══════════════════════════════════════════════════════════════════════════
router.get("/closure/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const r = await pool.query(`SELECT * FROM closure_records WHERE id = $1`, [id]);
    const row = safeRows(r)[0];
    if (!row) return res.status(404).json({ error: "רשומת סגירה לא נמצאה" });
    res.json({ data: row });
  } catch (e: unknown) {
    res.status(400).json({ error: "שגיאה בטעינת רשומת סגירה", message: errMsg(e) });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/closure/:id/checklist  — closure checklist progress
// ═══════════════════════════════════════════════════════════════════════════
router.get("/closure/:id/checklist", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const r = await pool.query(
      `SELECT id, closure_number, project_id, status, checklist, punch_list_resolved,
              punch_list_open_count, satisfaction_score, lessons_learned, retention_until
         FROM closure_records WHERE id = $1`,
      [id]
    );
    const row = safeRows(r)[0];
    if (!row) return res.status(404).json({ error: "רשומת סגירה לא נמצאה" });

    const items: any[] = Array.isArray(row.checklist) ? row.checklist : [];
    const defaults = [
      { key: "punch_list", label: "רשימת ליקויים נסגרה", done: !!row.punch_list_resolved },
      { key: "satisfaction", label: "שביעות רצון לקוח תועדה", done: row.satisfaction_score !== null && row.satisfaction_score !== undefined },
      { key: "lessons", label: "תיעוד לקחים", done: !!row.lessons_learned },
      { key: "retention", label: "תקופת אחריות הוגדרה", done: !!row.retention_until },
      { key: "finalized", label: "סגירה אושרה ופרויקט נסגר", done: row.status === "finalized" || row.status === "archived" },
    ];

    const merged = defaults.map((d) => {
      const override = items.find((it) => it?.key === d.key);
      return override ? { ...d, ...override } : d;
    });
    const totalCount = merged.length;
    const doneCount = merged.filter((m) => m.done).length;

    res.json({
      data: {
        closure_id: row.id,
        closure_number: row.closure_number,
        project_id: row.project_id,
        status: row.status,
        items: merged,
        progress_pct: totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0,
        done_count: doneCount,
        total_count: totalCount,
      },
    });
  } catch (e: unknown) {
    res.status(400).json({ error: "שגיאה בטעינת רשימת המשימות", message: errMsg(e) });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/closure  — create
// ═══════════════════════════════════════════════════════════════════════════
router.post("/closure", async (req, res) => {
  try {
    const b = CreateSchema.parse(req.body);
    const number = await nextClosureNumber();
    let projectName = b.project_name ?? null;

    // Defensive: try to enrich project_name from execution.projects (may not exist in older DBs)
    if (!projectName) {
      try {
        const p = await pool.query(
          `SELECT project_name FROM execution.projects WHERE id = $1 LIMIT 1`,
          [b.project_id]
        );
        projectName = safeRows(p)[0]?.project_name ?? null;
      } catch {
        projectName = null;
      }
    }

    const r = await pool.query(
      `INSERT INTO closure_records (
         closure_number, project_id, project_name, customer_id, status,
         satisfaction_score, satisfaction_notes, punch_list_resolved, punch_list_open_count,
         lessons_learned, retention_until, retention_amount, revenue_recognized,
         final_invoice_id, checklist, notes, created_by
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb,$16,$17)
       RETURNING *`,
      [
        number, b.project_id, projectName, b.customer_id ?? null, b.status || "draft",
        b.satisfaction_score ?? null, b.satisfaction_notes ?? null,
        b.punch_list_resolved ?? false, b.punch_list_open_count ?? 0,
        b.lessons_learned ?? null, b.retention_until ?? null,
        b.retention_amount ?? 0, b.revenue_recognized ?? 0,
        b.final_invoice_id ?? null, JSON.stringify(b.checklist ?? []),
        b.notes ?? null, b.created_by ?? null,
      ]
    );
    res.status(201).json({ data: safeRows(r)[0] });
  } catch (e: unknown) {
    const msg = errMsg(e);
    if (msg.includes("duplicate") || msg.includes("unique")) {
      return res.status(409).json({ error: "מספר סגירה כבר קיים", message: msg });
    }
    res.status(400).json({ error: "שגיאה ביצירת רשומת סגירה", message: msg });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// PUT /api/closure/:id  — update
// ═══════════════════════════════════════════════════════════════════════════
router.put("/closure/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const b = UpdateSchema.parse(req.body);

    const sets: string[] = [];
    const vals: any[] = [];
    let i = 1;

    const directFields = [
      "project_name", "customer_id", "status", "satisfaction_score", "satisfaction_notes",
      "punch_list_resolved", "punch_list_open_count", "lessons_learned", "retention_until",
      "retention_amount", "revenue_recognized", "final_invoice_id", "notes",
    ] as const;
    const bAny = b as Record<string, unknown>;
    for (const k of directFields) {
      if (bAny[k] !== undefined) {
        sets.push(`${k} = $${i++}`);
        vals.push(bAny[k]);
      }
    }
    if (b.checklist !== undefined) {
      sets.push(`checklist = $${i++}::jsonb`);
      vals.push(JSON.stringify(b.checklist));
    }
    if (sets.length === 0) {
      return res.status(400).json({ error: "אין שדות לעדכון" });
    }
    sets.push(`updated_at = NOW()`);
    vals.push(id);

    const r = await pool.query(
      `UPDATE closure_records SET ${sets.join(", ")} WHERE id = $${i} RETURNING *`,
      vals
    );
    const row = safeRows(r)[0];
    if (!row) return res.status(404).json({ error: "רשומת סגירה לא נמצאה" });
    res.json({ data: row });
  } catch (e: unknown) {
    res.status(400).json({ error: "שגיאה בעדכון רשומת סגירה", message: errMsg(e) });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// DELETE /api/closure/:id  — soft delete (status='cancelled')
// ═══════════════════════════════════════════════════════════════════════════
router.delete("/closure/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const r = await pool.query(
      `UPDATE closure_records SET status = 'cancelled', updated_at = NOW()
        WHERE id = $1 AND status NOT IN ('finalized','archived') RETURNING id, status`,
      [id]
    );
    const row = safeRows(r)[0];
    if (!row) {
      return res.status(409).json({ error: "לא ניתן לבטל סגירה שכבר אושרה או לא קיימת" });
    }
    res.json({ success: true, data: row });
  } catch (e: unknown) {
    res.status(400).json({ error: "שגיאה במחיקת רשומת סגירה", message: errMsg(e) });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/closure/:id/finalize  — orchestrator action
//   1. Mark closure_records.status = 'finalized' (+ finalized_at, finalized_by)
//   2. Flip execution.projects.state = 'closed' + actual_end_date = today
//   3. Emit revenue-recognition journal entry hint (best-effort, defensive)
//   4. Send archive notification (best-effort, defensive)
// ═══════════════════════════════════════════════════════════════════════════
router.post("/closure/:id/finalize", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const finalizedBy = typeof req.body?.finalized_by === "string" ? req.body.finalized_by : "system";

    // Load closure
    const cr = await pool.query(`SELECT * FROM closure_records WHERE id = $1`, [id]);
    const closure = safeRows(cr)[0];
    if (!closure) return res.status(404).json({ error: "רשומת סגירה לא נמצאה" });
    if (closure.status === "finalized" || closure.status === "archived") {
      return res.status(409).json({ error: "סגירה זו כבר אושרה" });
    }
    if (closure.status === "cancelled") {
      return res.status(409).json({ error: "לא ניתן לאשר סגירה שבוטלה" });
    }

    // 1. mark finalized
    const upd = await pool.query(
      `UPDATE closure_records
          SET status = 'finalized', finalized_at = NOW(), finalized_by = $2, updated_at = NOW()
        WHERE id = $1 RETURNING *`,
      [id, finalizedBy]
    );
    const finalized = safeRows(upd)[0];

    // 2. flip project to closed (defensive — table may not be the same in dev)
    const sideEffects: Record<string, unknown> = {};
    try {
      const pr = await pool.query(
        `UPDATE execution.projects
            SET state = 'closed', actual_end_date = COALESCE(actual_end_date, CURRENT_DATE), updated_at = NOW()
          WHERE id = $1 RETURNING id, state, actual_end_date`,
        [closure.project_id]
      );
      sideEffects.project_closed = safeRows(pr)[0] ?? null;
    } catch (err) {
      sideEffects.project_closed_error = errMsg(err);
    }

    // 3. revenue-recognition JE (event hint — recorded in metadata, defensive)
    try {
      const revAmt = Number(closure.revenue_recognized || 0);
      sideEffects.je_hint = {
        event: "revenue.recognition.posted",
        project_id: closure.project_id,
        amount: revAmt,
        memo: `Closure ${closure.closure_number} — revenue recognition`,
      };
    } catch (err) {
      sideEffects.je_error = errMsg(err);
    }

    // 4. archive notification (best-effort — write to alerts if table exists)
    try {
      await pool.query(
        `INSERT INTO alerts (title, message, severity, module, entity_type, entity_id)
           VALUES ($1, $2, 'info', 'closure', 'project', $3)`,
        [
          `סגירת פרויקט ${closure.project_name || closure.project_id}`,
          `סגירה ${closure.closure_number} אושרה. הפרויקט הועבר לארכיון.`,
          closure.project_id,
        ]
      );
      sideEffects.notification_sent = true;
    } catch (err) {
      sideEffects.notification_error = errMsg(err);
    }

    res.json({ success: true, data: finalized, side_effects: sideEffects });
  } catch (e: unknown) {
    res.status(400).json({ error: "שגיאה באישור סגירה", message: errMsg(e) });
  }
});

export default router;
