import { Router } from "express";
import { ListHealthChecksQuerySchema } from "@workspace/api-zod/governance";
import {
  sql, authMiddleware, adminMiddleware, parseQuery, sendDbError,
  runSafeList, safeLimit, safeOffset,
} from "./_helpers";

const router = Router();
router.use(authMiddleware, adminMiddleware);

const ALLOWED = new Set(["id", "check_type", "check_name", "last_run_at", "status"]);

router.get("/", async (req, res) => {
  const q = parseQuery(ListHealthChecksQuerySchema, req, res); if (!q) return;
  try {
    const c: ReturnType<typeof sql>[] = [];
    if (q.check_type) c.push(sql`check_type = ${q.check_type}`);
    if (q.is_active !== undefined) c.push(sql`is_active = ${q.is_active}`);
    if (q.q) c.push(sql`check_name ILIKE ${"%" + q.q + "%"}`);
    if (c.length === 0) c.push(sql`1=1`);
    const r = await runSafeList({
      table: "governance.health_checks", conditions: c,
      allowedOrderColumns: ALLOWED, fallbackColumn: "id",
      orderBy: q.order_by, orderDir: q.order_dir,
      limit: safeLimit(q.limit), offset: safeOffset(q.offset),
    });
    res.json(r);
  } catch (err) { sendDbError(res, err, "health-checks:list"); }
});

export default router;
