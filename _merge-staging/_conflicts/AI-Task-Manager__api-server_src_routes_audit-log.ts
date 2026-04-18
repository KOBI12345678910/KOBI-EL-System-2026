import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const router: IRouter = Router();

/**
 * @openapi
 * /api/audit-log:
 *   get:
 *     tags: [System & Settings]
 *     summary: יומן ביקורת — Audit log
 *     description: |
 *       מחזיר יומן פעולות מלא של כל שינויים במערכת. מוגן לגישת מנהלים בלבד.
 *       כולל: יצירה, עדכון, מחיקה — לפי משתמש, מודול, תאריך.
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     parameters:
 *       - name: table_name
 *         in: query
 *         schema: { type: string, example: "invoices" }
 *       - name: action
 *         in: query
 *         schema: { type: string, enum: [INSERT, UPDATE, DELETE] }
 *       - name: user_id
 *         in: query
 *         schema: { type: integer }
 *       - name: module
 *         in: query
 *         schema: { type: string, example: "finance" }
 *       - name: from_date
 *         in: query
 *         schema: { type: string, format: date, example: "2025-01-01" }
 *       - name: to_date
 *         in: query
 *         schema: { type: string, format: date, example: "2025-12-31" }
 *       - name: search
 *         in: query
 *         schema: { type: string }
 *       - name: page
 *         in: query
 *         schema: { type: integer, default: 1 }
 *       - name: limit
 *         in: query
 *         schema: { type: integer, default: 50, maximum: 200 }
 *     responses:
 *       200:
 *         description: רשימת רשומות יומן הביקורת
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data: { type: array, items: { type: object } }
 *                 total: { type: integer }
 *                 page: { type: integer }
 *                 totalPages: { type: integer }
 *       401: { description: "נדרשת התחברות" }
 *       403: { description: "אין הרשאה לצפות ביומן ביקורת" }
 */
router.get("/audit-log", async (req, res) => {
  try {
    const {
      table_name, record_id, action, user_id, user_name,
      search, from_date, to_date, module,
      page = "1", limit = "50", sort_by = "created_at", sort_dir = "DESC"
    } = req.query as any;

    const conditions: string[] = [];
    const params: any[] = [];

    if (table_name) { conditions.push(`table_name = '${table_name.replace(/'/g, "''")}'`); }
    if (record_id) { conditions.push(`record_id = ${Number(record_id)}`); }
    if (action) { conditions.push(`action = '${action.replace(/'/g, "''")}'`); }
    if (user_id) { conditions.push(`user_id = ${Number(user_id)}`); }
    if (user_name) { conditions.push(`user_name ILIKE '%${user_name.replace(/'/g, "''")}%'`); }
    if (module) { conditions.push(`module = '${module.replace(/'/g, "''")}'`); }
    if (from_date) { conditions.push(`created_at >= '${from_date.replace(/'/g, "''")}'`); }
    if (to_date) { conditions.push(`created_at <= '${to_date.replace(/'/g, "''")} 23:59:59'`); }
    if (search) {
      const s = search.replace(/'/g, "''");
      conditions.push(`(description ILIKE '%${s}%' OR user_name ILIKE '%${s}%' OR table_name ILIKE '%${s}%')`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const allowedSort = ["created_at", "table_name", "action", "user_name"];
    const sortCol = allowedSort.includes(sort_by) ? sort_by : "created_at";
    const dir = sort_dir === "ASC" ? "ASC" : "DESC";
    const pageNum = Math.max(1, Number(page));
    const lim = Math.min(200, Math.max(1, Number(limit)));
    const offset = (pageNum - 1) * lim;

    const countResult = await db.execute(sql.raw(`SELECT COUNT(*) as total FROM audit_log ${where}`));
    const total = Number(countResult.rows[0]?.total || 0);

    const dataResult = await db.execute(sql.raw(
      `SELECT * FROM audit_log ${where} ORDER BY ${sortCol} ${dir} LIMIT ${lim} OFFSET ${offset}`
    ));

    res.json({
      data: dataResult.rows,
      pagination: { page: pageNum, limit: lim, total, pages: Math.ceil(total / lim) },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/audit-log/stats", async (_req, res) => {
  try {
    const result = await db.execute(sql`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE action = 'INSERT') as inserts,
        COUNT(*) FILTER (WHERE action = 'UPDATE') as updates,
        COUNT(*) FILTER (WHERE action = 'DELETE') as deletes,
        COUNT(DISTINCT table_name) as tables_affected,
        COUNT(DISTINCT user_id) as unique_users,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours') as last_24h,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days') as last_7d,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '1 hour') as last_hour
      FROM audit_log
    `);
    res.json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/audit-log/tables", async (_req, res) => {
  try {
    const result = await db.execute(sql`
      SELECT table_name, COUNT(*)::int as count,
        MAX(created_at) as last_activity
      FROM audit_log
      GROUP BY table_name ORDER BY count DESC
    `);
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/audit-log/users", async (_req, res) => {
  try {
    const result = await db.execute(sql`
      SELECT user_id, user_name, COUNT(*)::int as count,
        MAX(created_at) as last_activity
      FROM audit_log
      WHERE user_id IS NOT NULL
      GROUP BY user_id, user_name ORDER BY count DESC
    `);
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/audit-log/record/:tableName/:recordId", async (req, res) => {
  try {
    const { tableName, recordId } = req.params;
    const result = await db.execute(sql`
      SELECT * FROM audit_log WHERE table_name = ${tableName} AND record_id = ${Number(recordId)} ORDER BY created_at DESC
    `);
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/audit-log/timeline", async (req, res) => {
  try {
    const { days = "7" } = req.query as any;
    const d = Math.min(90, Math.max(1, Number(days)));
    const result = await db.execute(sql.raw(`
      SELECT DATE(created_at) as date,
        COUNT(*)::int as total,
        COUNT(*) FILTER (WHERE action = 'INSERT')::int as inserts,
        COUNT(*) FILTER (WHERE action = 'UPDATE')::int as updates,
        COUNT(*) FILTER (WHERE action = 'DELETE')::int as deletes
      FROM audit_log
      WHERE created_at >= NOW() - INTERVAL '${d} days'
      GROUP BY DATE(created_at)
      ORDER BY date DESC
    `));
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
