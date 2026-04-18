import { Router } from "express";
import {
  ListSecurityEventsQuerySchema, AcknowledgeSecurityEventSchema,
} from "@workspace/api-zod/governance";
import {
  db, sql, authMiddleware, adminMiddleware,
  parseBody, parseQuery, idFromParams, currentUserId, sendDbError,
  runSafeList, safeLimit, safeOffset, safeDateParam,
} from "./_helpers";
import { logAudit } from "../../lib/audit-log";

const router = Router();
router.use(authMiddleware, adminMiddleware);

const ALLOWED = new Set(["id", "occurred_at", "severity", "event_type"]);

router.get("/", async (req, res) => {
  const q = parseQuery(ListSecurityEventsQuerySchema, req, res); if (!q) return;
  try {
    const c: ReturnType<typeof sql>[] = [];
    if (q.event_type) c.push(sql`event_type = ${q.event_type}`);
    if (q.severity) c.push(sql`severity = ${q.severity}`);
    if (q.user_id) c.push(sql`user_id = ${q.user_id}`);
    if (q.acknowledged !== undefined) {
      c.push(q.acknowledged ? sql`acknowledged_at is not null` : sql`acknowledged_at is null`);
    }
    const from = safeDateParam(q.from_date); if (from) c.push(sql`occurred_at >= ${from}`);
    const to = safeDateParam(q.to_date); if (to) c.push(sql`occurred_at <= ${to}`);
    if (q.q) c.push(sql`description ILIKE ${"%" + q.q + "%"}`);
    if (c.length === 0) c.push(sql`1=1`);
    const r = await runSafeList({
      table: "governance.security_events", conditions: c,
      allowedOrderColumns: ALLOWED, fallbackColumn: "id",
      orderBy: q.order_by, orderDir: q.order_dir,
      limit: safeLimit(q.limit), offset: safeOffset(q.offset),
    });
    res.json(r);
  } catch (err) { sendDbError(res, err, "security-events:list"); }
});

router.post("/:id/acknowledge", async (req, res) => {
  const id = idFromParams(req, res); if (!id) return;
  const d = parseBody(AcknowledgeSecurityEventSchema, req, res); if (!d) return;
  const uid = currentUserId(req);
  try {
    const r = await db.execute(sql`
      update governance.security_events
      set acknowledged_by = ${uid}, acknowledged_at = now(), resolution = ${d.resolution ?? null}
      where id = ${id} and acknowledged_at is null
      returning id, acknowledged_at
    `);
    if ((r.rows ?? []).length === 0) return res.status(409).json({ error: "האירוע כבר אושר" });
    await logAudit({ user_id: uid, table_name: "governance_security_events", record_id: id, action: "UPDATE", new_values: { acknowledged: true, resolution: d.resolution }, ip_address: req.ip ?? null });
    res.json((r.rows ?? [])[0]);
  } catch (err) { sendDbError(res, err, "security-events:acknowledge"); }
});

export default router;
