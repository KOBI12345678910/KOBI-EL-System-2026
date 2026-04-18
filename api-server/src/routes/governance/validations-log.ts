import { Router } from "express";
import {
  ListValidationsLogQuerySchema, ResolveValidationSchema,
} from "@workspace/api-zod/governance";
import {
  db, sql, authMiddleware, adminMiddleware,
  parseBody, parseQuery, idFromParams, currentUserId, sendDbError,
  runSafeList, safeLimit, safeOffset,
} from "./_helpers";
import { logAudit } from "../../lib/audit-log";

const router = Router();
router.use(authMiddleware, adminMiddleware);

const ALLOWED = new Set(["id", "detected_at", "severity", "rule_key", "entity_type"]);

router.get("/", async (req, res) => {
  const q = parseQuery(ListValidationsLogQuerySchema, req, res); if (!q) return;
  try {
    const c: ReturnType<typeof sql>[] = [];
    if (q.rule_key) c.push(sql`rule_key = ${q.rule_key}`);
    if (q.entity_type) c.push(sql`entity_type = ${q.entity_type}`);
    if (q.entity_id) c.push(sql`entity_id = ${q.entity_id}`);
    if (q.severity) c.push(sql`severity = ${q.severity}`);
    if (q.is_resolved !== undefined) c.push(sql`is_resolved = ${q.is_resolved}`);
    if (q.q) c.push(sql`message ILIKE ${"%" + q.q + "%"}`);
    if (c.length === 0) c.push(sql`1=1`);
    const r = await runSafeList({
      table: "governance.validations_log", conditions: c,
      allowedOrderColumns: ALLOWED, fallbackColumn: "id",
      orderBy: q.order_by, orderDir: q.order_dir,
      limit: safeLimit(q.limit), offset: safeOffset(q.offset),
    });
    res.json(r);
  } catch (err) { sendDbError(res, err, "validations-log:list"); }
});

router.post("/:id/resolve", async (req, res) => {
  const id = idFromParams(req, res); if (!id) return;
  const d = parseBody(ResolveValidationSchema, req, res); if (!d) return;
  const uid = currentUserId(req);
  try {
    const r = await db.execute(sql`
      update governance.validations_log
      set is_resolved = true, resolved_at = now(), resolved_by = ${uid},
          details = coalesce(details, '{}'::jsonb) || ${JSON.stringify({ resolution_note: d.resolution_note ?? null })}::jsonb
      where id = ${id} and is_resolved = false
      returning id
    `);
    if ((r.rows ?? []).length === 0) return res.status(409).json({ error: "הולידציה כבר סגורה" });
    await logAudit({ user_id: uid, table_name: "governance_validations_log", record_id: id, action: "UPDATE", new_values: { resolved: true, note: d.resolution_note }, ip_address: req.ip ?? null });
    res.json({ ok: true });
  } catch (err) { sendDbError(res, err, "validations-log:resolve"); }
});

export default router;
