import { Router } from "express";
import { ListDomainEventsQuerySchema } from "@workspace/api-zod/governance";
import {
  sql, authMiddleware, adminMiddleware, parseQuery, sendDbError,
  runSafeList, safeLimit, safeOffset, safeDateParam,
} from "./_helpers";

const router = Router();
router.use(authMiddleware, adminMiddleware);

const ALLOWED = new Set(["id", "occurred_at", "event_type", "processing_status"]);

router.get("/", async (req, res) => {
  const q = parseQuery(ListDomainEventsQuerySchema, req, res); if (!q) return;
  try {
    const c = [sql`1=1`];
    if (q.event_type) c.push(sql`event_type = ${q.event_type}`);
    if (q.aggregate_type) c.push(sql`aggregate_type = ${q.aggregate_type}`);
    if (q.aggregate_id) c.push(sql`aggregate_id = ${q.aggregate_id}`);
    if (q.processing_status) c.push(sql`processing_status = ${q.processing_status}`);
    const from = safeDateParam(q.from_date); if (from) c.push(sql`occurred_at >= ${from}`);
    const to = safeDateParam(q.to_date); if (to) c.push(sql`occurred_at <= ${to}`);
    const r = await runSafeList({
      table: "governance.domain_events", conditions: c,
      allowedOrderColumns: ALLOWED, fallbackColumn: "id",
      orderBy: q.order_by, orderDir: q.order_dir,
      limit: safeLimit(q.limit), offset: safeOffset(q.offset),
    });
    res.json(r);
  } catch (err) { sendDbError(res, err, "domain-events:list"); }
});

export default router;
