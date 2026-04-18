import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { pool } from "@workspace/db";

const router: IRouter = Router();

const CRITICAL_TABLES = [
  "role_assignments",
  "module_entities",
  "platform_workflows",
];

/**
 * @openapi
 * /api/healthz:
 *   get:
 *     tags: [System & Settings]
 *     summary: בדיקת תקינות — Health check
 *     description: |
 *       מחזיר את מצב המערכת: חיבור בסיס נתונים, קיום טבלאות קריטיות, זיכרון זמן הפעלה.
 *       לא נדרשת התחברות. ניתן לשימוש בניטור ו-uptime checks.
 *     responses:
 *       200:
 *         description: המערכת תקינה
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, enum: [ok, degraded], example: ok }
 *                 checks:
 *                   type: object
 *                   properties:
 *                     database: { type: string, example: "ok (12ms)" }
 *                     memory: { type: string, example: "256MB" }
 *                     uptime: { type: string, example: "3600s" }
 *       503: { description: "שירות לא זמין — בסיס נתונים לא מגיב" }
 */
router.get("/healthz", async (_req, res) => {
  res.set("Cache-Control", "no-store");

  const checks: Record<string, string> = {};

  try {
    const start = Date.now();
    await pool.query("SELECT 1");
    checks.database = `ok (${Date.now() - start}ms)`;
  } catch {
    checks.database = "error";
  }

  if (checks.database.startsWith("ok")) {
    for (const table of CRITICAL_TABLES) {
      try {
        const result = await pool.query(
          `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = $1) AS exists`,
          [table]
        );
        const exists = result.rows[0]?.exists === true;
        checks[`table_${table}`] = exists ? "exists" : "missing";
      } catch (e) {
        checks[`table_${table}`] = `error: ${e instanceof Error ? e.message : String(e)}`;
      }
    }
  }

  checks.memory = `${Math.round(process.memoryUsage().rss / 1024 / 1024)}MB`;
  checks.uptime = `${Math.round(process.uptime())}s`;

  const healthy =
    checks.database.startsWith("ok") &&
    CRITICAL_TABLES.every((t) => checks[`table_${t}`] === "exists");

  const data = HealthCheckResponse.parse({ status: healthy ? "ok" : "degraded" });

  res.status(healthy ? 200 : 503).json({ ...data, checks });
});

export default router;
