// ============================================================
// governance.audit_logs — read-only (immutable)
// ============================================================
import { Router } from "express";
import {
  ListAuditLogsQuerySchema, ListStateHistoryQuerySchema, ListDomainEventsQuerySchema,
} from "@workspace/api-zod/governance";
import {
  db, sql, authMiddleware, adminMiddleware,
  parseQuery, sendDbError,
  runSafeList, safeLimit, safeOffset, safeDateParam,
} from "./_helpers";

const router = Router();
router.use(authMiddleware, adminMiddleware);

const AUDIT_ORDER = new Set(["id", "created_at", "table_name", "action", "user_id"]);

router.get("/", async (req, res) => {
  const q = parseQuery(ListAuditLogsQuerySchema, req, res); if (!q) return;
  try {
    const c = [sql`1=1`];
    if (q.table_name) c.push(sql`table_name = ${q.table_name}`);
    if (q.user_id) c.push(sql`user_id = ${q.user_id}`);
    if (q.action) c.push(sql`action = ${q.action}`);
    if (q.record_id) c.push(sql`record_id = ${q.record_id}`);
    const from = safeDateParam(q.from_date);
    if (from) c.push(sql`created_at >= ${from}`);
    const to = safeDateParam(q.to_date);
    if (to) c.push(sql`created_at <= ${to}`);
    const r = await runSafeList({
      table: "governance.audit_logs", conditions: c,
      allowedOrderColumns: AUDIT_ORDER, fallbackColumn: "id",
      orderBy: q.order_by, orderDir: q.order_dir,
      limit: safeLimit(q.limit), offset: safeOffset(q.offset),
    });
    res.json(r);
  } catch (err) { sendDbError(res, err, "audit-logs:list"); }
});

router.get("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "מזהה לא תקין" });
  try {
    const r = await db.execute(sql`select * from governance.audit_logs where id = ${id}`);
    const row = (r.rows ?? [])[0];
    if (!row) return res.status(404).json({ error: "רשומה לא נמצאה" });
    res.json(row);
  } catch (err) { sendDbError(res, err, "audit-logs:get"); }
});

export default router;
