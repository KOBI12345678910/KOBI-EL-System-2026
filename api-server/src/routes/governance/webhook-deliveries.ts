import { Router } from "express";
import { ListWebhookDeliveriesQuerySchema } from "@workspace/api-zod/governance";
import {
  sql, authMiddleware, adminMiddleware, parseQuery, sendDbError,
  runSafeList, safeLimit, safeOffset, safeDateParam,
} from "./_helpers";

const router = Router();
router.use(authMiddleware, adminMiddleware);

const ALLOWED = new Set(["id", "created_at", "delivered_at", "status", "endpoint_id"]);

router.get("/", async (req, res) => {
  const q = parseQuery(ListWebhookDeliveriesQuerySchema, req, res); if (!q) return;
  try {
    const c = [sql`1=1`];
    if (q.endpoint_id) c.push(sql`endpoint_id = ${q.endpoint_id}`);
    if (q.status) c.push(sql`status = ${q.status}`);
    if (q.event_type) c.push(sql`event_type = ${q.event_type}`);
    const from = safeDateParam(q.from_date); if (from) c.push(sql`created_at >= ${from}`);
    const to = safeDateParam(q.to_date); if (to) c.push(sql`created_at <= ${to}`);
    const r = await runSafeList({
      table: "governance.webhook_deliveries", conditions: c,
      allowedOrderColumns: ALLOWED, fallbackColumn: "id",
      orderBy: q.order_by, orderDir: q.order_dir,
      limit: safeLimit(q.limit), offset: safeOffset(q.offset),
    });
    res.json(r);
  } catch (err) { sendDbError(res, err, "webhook-deliveries:list"); }
});

export default router;
