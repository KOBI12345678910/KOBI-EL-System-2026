import { Router } from "express";
import { ListIntegrationSyncLogsQuerySchema } from "@workspace/api-zod/governance";
import {
  sql, authMiddleware, adminMiddleware, parseQuery, sendDbError,
  runSafeList, safeLimit, safeOffset, safeDateParam,
} from "./_helpers";

const router = Router();
router.use(authMiddleware, adminMiddleware);

const ALLOWED = new Set(["id", "started_at", "finished_at", "status", "connection_id"]);

router.get("/", async (req, res) => {
  const q = parseQuery(ListIntegrationSyncLogsQuerySchema, req, res); if (!q) return;
  try {
    const c = [sql`1=1`];
    if (q.connection_id) c.push(sql`connection_id = ${q.connection_id}`);
    if (q.status) c.push(sql`status = ${q.status}`);
    if (q.direction) c.push(sql`direction = ${q.direction}`);
    const from = safeDateParam(q.from_date); if (from) c.push(sql`started_at >= ${from}`);
    const to = safeDateParam(q.to_date); if (to) c.push(sql`started_at <= ${to}`);
    const r = await runSafeList({
      table: "governance.integration_sync_logs", conditions: c,
      allowedOrderColumns: ALLOWED, fallbackColumn: "id",
      orderBy: q.order_by, orderDir: q.order_dir,
      limit: safeLimit(q.limit), offset: safeOffset(q.offset),
    });
    res.json(r);
  } catch (err) { sendDbError(res, err, "integration-sync-logs:list"); }
});

export default router;
