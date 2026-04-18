import { Router } from "express";
import { ListStateHistoryQuerySchema } from "@workspace/api-zod/governance";
import {
  sql, authMiddleware, adminMiddleware, parseQuery, sendDbError,
  runSafeList, safeLimit, safeOffset, safeDateParam,
} from "./_helpers";

const router = Router();
router.use(authMiddleware, adminMiddleware);

const ALLOWED = new Set(["id", "occurred_at", "entity_type", "entity_id"]);

router.get("/", async (req, res) => {
  const q = parseQuery(ListStateHistoryQuerySchema, req, res); if (!q) return;
  try {
    const c = [sql`1=1`];
    if (q.entity_type) c.push(sql`entity_type = ${q.entity_type}`);
    if (q.entity_id) c.push(sql`entity_id = ${q.entity_id}`);
    const from = safeDateParam(q.from_date); if (from) c.push(sql`occurred_at >= ${from}`);
    const to = safeDateParam(q.to_date); if (to) c.push(sql`occurred_at <= ${to}`);
    const r = await runSafeList({
      table: "governance.state_history", conditions: c,
      allowedOrderColumns: ALLOWED, fallbackColumn: "id",
      orderBy: q.order_by, orderDir: q.order_dir,
      limit: safeLimit(q.limit), offset: safeOffset(q.offset),
    });
    res.json(r);
  } catch (err) { sendDbError(res, err, "state-history:list"); }
});

export default router;
