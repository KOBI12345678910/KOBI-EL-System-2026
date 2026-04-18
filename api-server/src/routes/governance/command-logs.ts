import { Router } from "express";
import { ListCommandLogsQuerySchema } from "@workspace/api-zod/governance";
import {
  sql, authMiddleware, adminMiddleware, parseQuery, sendDbError,
  runSafeList, safeLimit, safeOffset, safeDateParam,
} from "./_helpers";

const router = Router();
router.use(authMiddleware, adminMiddleware);

const ALLOWED = new Set(["id", "executed_at", "command_name", "status"]);

router.get("/", async (req, res) => {
  const q = parseQuery(ListCommandLogsQuerySchema, req, res); if (!q) return;
  try {
    const c: ReturnType<typeof sql>[] = [];
    if (q.command_name) c.push(sql`command_name = ${q.command_name}`);
    if (q.user_id) c.push(sql`user_id = ${q.user_id}`);
    if (q.status) c.push(sql`status = ${q.status}`);
    const from = safeDateParam(q.from_date); if (from) c.push(sql`executed_at >= ${from}`);
    const to = safeDateParam(q.to_date); if (to) c.push(sql`executed_at <= ${to}`);
    if (q.q) c.push(sql`command_name ILIKE ${"%" + q.q + "%"}`);
    if (c.length === 0) c.push(sql`1=1`);
    const r = await runSafeList({
      table: "governance.command_logs", conditions: c,
      allowedOrderColumns: ALLOWED, fallbackColumn: "id",
      orderBy: q.order_by, orderDir: q.order_dir,
      limit: safeLimit(q.limit), offset: safeOffset(q.offset),
    });
    res.json(r);
  } catch (err) { sendDbError(res, err, "command-logs:list"); }
});

export default router;
