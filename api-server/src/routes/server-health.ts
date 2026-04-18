import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "../lib/logger";

const router: IRouter = Router();

function requireAdminAuth(req: Request, res: Response, next: NextFunction): void {
  const reqAny = req as unknown as Record<string, unknown>;
  const userId = reqAny["userId"];
  const permissions = reqAny["permissions"] as Record<string, unknown> | undefined;
  if (!userId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  const isSuperAdmin = permissions?.["isSuperAdmin"] === true;
  const roles = permissions?.["roles"];
  const hasAdminRole =
    isSuperAdmin ||
    (Array.isArray(roles) &&
      roles.some((r: string) =>
        ["admin", "superAdmin", "system_admin", "platform_admin", "מנהל מערכת"].includes(r)
      ));
  if (!hasAdminRole) {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  next();
}

/**
 * @openapi
 * /api/server-health/history:
 *   get:
 *     tags: [System & Settings]
 *     summary: Server health check history
 *     description: Returns paginated history of server health checks with optional filters. Requires admin role.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: check_type
 *         schema: { type: string }
 *         description: Filter by check type (http, database, memory, cpu, disk, response_time)
 *       - in: query
 *         name: status
 *         schema: { type: string }
 *         description: Filter by status (healthy, warning, critical)
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 100 }
 *       - in: query
 *         name: offset
 *         schema: { type: integer, default: 0 }
 *     responses:
 *       200:
 *         description: Health log history
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Admin access required
 */
router.get("/server-health/history", requireAdminAuth, async (req, res) => {
  try {
    const limit = Math.min(Number(req.query["limit"] ?? 100), 500);
    const offset = Number(req.query["offset"] ?? 0);
    const checkType = typeof req.query["check_type"] === "string" ? req.query["check_type"] : null;
    const status = typeof req.query["status"] === "string" ? req.query["status"] : null;

    let dataQuery;
    let countQuery;

    if (checkType && status) {
      dataQuery = db.execute(
        sql`SELECT id, check_type, status, value, threshold, details, response_time_ms, created_at
            FROM server_health_logs
            WHERE check_type = ${checkType} AND status = ${status}
            ORDER BY created_at DESC
            LIMIT ${limit} OFFSET ${offset}`
      );
      countQuery = db.execute(
        sql`SELECT COUNT(*)::int AS total FROM server_health_logs
            WHERE check_type = ${checkType} AND status = ${status}`
      );
    } else if (checkType) {
      dataQuery = db.execute(
        sql`SELECT id, check_type, status, value, threshold, details, response_time_ms, created_at
            FROM server_health_logs
            WHERE check_type = ${checkType}
            ORDER BY created_at DESC
            LIMIT ${limit} OFFSET ${offset}`
      );
      countQuery = db.execute(
        sql`SELECT COUNT(*)::int AS total FROM server_health_logs WHERE check_type = ${checkType}`
      );
    } else if (status) {
      dataQuery = db.execute(
        sql`SELECT id, check_type, status, value, threshold, details, response_time_ms, created_at
            FROM server_health_logs
            WHERE status = ${status}
            ORDER BY created_at DESC
            LIMIT ${limit} OFFSET ${offset}`
      );
      countQuery = db.execute(
        sql`SELECT COUNT(*)::int AS total FROM server_health_logs WHERE status = ${status}`
      );
    } else {
      dataQuery = db.execute(
        sql`SELECT id, check_type, status, value, threshold, details, response_time_ms, created_at
            FROM server_health_logs
            ORDER BY created_at DESC
            LIMIT ${limit} OFFSET ${offset}`
      );
      countQuery = db.execute(
        sql`SELECT COUNT(*)::int AS total FROM server_health_logs`
      );
    }

    const [result, countResult] = await Promise.all([dataQuery, countQuery]);
    const rows = (result.rows ?? []) as Array<Record<string, unknown>>;
    const total = Number((countResult.rows?.[0] as { total?: number } | undefined)?.total ?? 0);

    res.json({ data: rows, total, limit, offset });
  } catch (err) {
    logger.error("server_health_history_error", {
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(500).json({ error: "Failed to retrieve health history" });
  }
});

/**
 * @openapi
 * /api/server-health/uptime:
 *   get:
 *     tags: [System & Settings]
 *     summary: Server uptime statistics
 *     description: Returns uptime percentage and summary stats for each check type. Requires admin role.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: hours
 *         schema: { type: integer, default: 24 }
 *         description: Lookback period in hours (max 720)
 *     responses:
 *       200:
 *         description: Uptime statistics per check type
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Admin access required
 */
router.get("/server-health/uptime", requireAdminAuth, async (req, res) => {
  try {
    const hours = Math.min(Number(req.query["hours"] ?? 24), 720);

    const [byTypeResult, overallResult] = await Promise.all([
      db.execute(
        sql`SELECT
              check_type,
              COUNT(*)::int AS total_checks,
              COUNT(*) FILTER (WHERE status = 'healthy')::int AS healthy_count,
              COUNT(*) FILTER (WHERE status = 'warning')::int AS warning_count,
              COUNT(*) FILTER (WHERE status = 'critical')::int AS critical_count,
              ROUND(
                (COUNT(*) FILTER (WHERE status = 'healthy')::numeric / NULLIF(COUNT(*), 0)) * 100,
                2
              ) AS uptime_percent,
              MIN(created_at) AS window_start,
              MAX(created_at) AS window_end,
              ROUND(AVG(response_time_ms) FILTER (WHERE response_time_ms IS NOT NULL)::numeric, 2) AS avg_response_time_ms
            FROM server_health_logs
            WHERE created_at > NOW() - (${hours} || ' hours')::interval
            GROUP BY check_type
            ORDER BY check_type`
      ),
      db.execute(
        sql`SELECT
              COUNT(*)::int AS total_checks,
              COUNT(*) FILTER (WHERE status = 'healthy')::int AS healthy_count,
              ROUND(
                (COUNT(*) FILTER (WHERE status = 'healthy')::numeric / NULLIF(COUNT(*), 0)) * 100,
                2
              ) AS overall_uptime_percent
            FROM server_health_logs
            WHERE created_at > NOW() - (${hours} || ' hours')::interval`
      ),
    ]);

    const byTypeRows = (byTypeResult.rows ?? []) as Array<Record<string, unknown>>;
    const overall = (overallResult.rows?.[0] ?? {}) as Record<string, unknown>;

    res.json({
      periodHours: hours,
      overall: {
        totalChecks: overall["total_checks"] ?? 0,
        healthyCount: overall["healthy_count"] ?? 0,
        uptimePercent: Number(overall["overall_uptime_percent"] ?? 0),
      },
      byCheckType: byTypeRows,
    });
  } catch (err) {
    logger.error("server_health_uptime_error", {
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(500).json({ error: "Failed to retrieve uptime statistics" });
  }
});

export default router;
