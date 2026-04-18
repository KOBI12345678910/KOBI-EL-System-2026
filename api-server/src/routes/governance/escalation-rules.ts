import { Router } from "express";
import {
  CreateEscalationRuleSchema, UpdateEscalationRuleSchema,
  ListEscalationRulesQuerySchema, TriggerEscalationSchema,
} from "@workspace/api-zod/governance";
import {
  db, sql, authMiddleware, adminMiddleware,
  parseBody, parseQuery, idFromParams, currentUserId, sendDbError,
  runSafeList, safeLimit, safeOffset,
} from "./_helpers";
import { logAudit } from "../../lib/audit-log";

const router = Router();
router.use(authMiddleware, adminMiddleware);

const ALLOWED = new Set(["id", "rule_name", "entity_type", "escalation_level", "created_at"]);

router.get("/", async (req, res) => {
  const q = parseQuery(ListEscalationRulesQuerySchema, req, res); if (!q) return;
  try {
    const c: ReturnType<typeof sql>[] = [];
    if (q.entity_type) c.push(sql`entity_type = ${q.entity_type}`);
    if (q.is_active !== undefined) c.push(sql`is_active = ${q.is_active}`);
    if (q.q) c.push(sql`rule_name ILIKE ${"%" + q.q + "%"}`);
    if (c.length === 0) c.push(sql`1=1`);
    const r = await runSafeList({
      table: "governance.escalation_rules", conditions: c,
      allowedOrderColumns: ALLOWED, fallbackColumn: "id",
      orderBy: q.order_by, orderDir: q.order_dir,
      limit: safeLimit(q.limit), offset: safeOffset(q.offset),
    });
    res.json(r);
  } catch (err) { sendDbError(res, err, "escalation-rules:list"); }
});

router.post("/", async (req, res) => {
  const d = parseBody(CreateEscalationRuleSchema, req, res); if (!d) return;
  const uid = currentUserId(req);
  try {
    const r = await db.execute(sql`
      insert into governance.escalation_rules
        (rule_name, entity_type, trigger_condition, escalation_level, target_role, target_user_id, notification_channels, is_active, metadata, created_at, updated_at)
      values
        (${d.rule_name}, ${d.entity_type}, ${JSON.stringify(d.trigger_condition ?? {})}::jsonb,
         ${d.escalation_level ?? 1}, ${d.target_role ?? null}, ${d.target_user_id ?? null},
         ${d.notification_channels ?? ["email"]}::text[], ${d.is_active ?? true},
         ${JSON.stringify(d.metadata ?? {})}::jsonb, now(), now())
      returning *
    `);
    const row = (r.rows ?? [])[0] as { id?: number } | undefined;
    if (row?.id) await logAudit({ user_id: uid, table_name: "governance_escalation_rules", record_id: row.id, action: "INSERT", new_values: d as Record<string, unknown>, ip_address: req.ip ?? null });
    res.status(201).json(row);
  } catch (err) { sendDbError(res, err, "escalation-rules:create"); }
});

router.patch("/:id", async (req, res) => {
  const id = idFromParams(req, res); if (!id) return;
  const d = parseBody(UpdateEscalationRuleSchema, req, res); if (!d) return;
  const uid = currentUserId(req);
  const entries = Object.entries(d).filter(([, v]) => v !== undefined);
  if (entries.length === 0) return res.status(400).json({ error: "אין שינויים" });
  try {
    const fragments = entries.map(([k, v]) => {
      if (k === "metadata" || k === "trigger_condition")
        return sql`${sql.raw(k)} = ${JSON.stringify(v ?? {})}::jsonb`;
      if (k === "notification_channels")
        return sql`${sql.raw(k)} = ${(v ?? []) as string[]}::text[]`;
      return sql`${sql.raw(k)} = ${v as string | number | boolean | null}`;
    });
    const r = await db.execute(sql`
      update governance.escalation_rules set ${sql.join(fragments, sql`, `)}, updated_at = now()
      where id = ${id} returning *
    `);
    const row = (r.rows ?? [])[0];
    if (!row) return res.status(404).json({ error: "כלל הסלמה לא נמצא" });
    await logAudit({ user_id: uid, table_name: "governance_escalation_rules", record_id: id, action: "UPDATE", new_values: d as Record<string, unknown>, ip_address: req.ip ?? null });
    res.json(row);
  } catch (err) { sendDbError(res, err, "escalation-rules:update"); }
});

router.post("/trigger", async (req, res) => {
  const d = parseBody(TriggerEscalationSchema, req, res); if (!d) return;
  const uid = currentUserId(req);
  try {
    const rule = await db.execute(sql`select id, entity_type, target_role, target_user_id, notification_channels, is_active from governance.escalation_rules where rule_name = ${d.rule_name}`);
    const r = (rule.rows ?? [])[0] as { id?: number; is_active?: boolean } | undefined;
    if (!r?.id) return res.status(404).json({ error: "כלל הסלמה לא נמצא" });
    if (!r.is_active) return res.status(409).json({ error: "הכלל מושבת" });
    // Record the trigger in domain_events for downstream processing
    await db.execute(sql`
      insert into governance.domain_events (event_type, aggregate_type, aggregate_id, payload, user_id)
      values ('escalation.triggered', 'escalation_rule', ${r.id},
              ${JSON.stringify({ rule_name: d.rule_name, entity_id: d.entity_id, payload: d.payload ?? {} })}::jsonb,
              ${uid})
    `);
    await logAudit({ user_id: uid, table_name: "governance_escalation_rules", record_id: r.id, action: "INSERT", new_values: { triggered: true, entity_id: d.entity_id }, ip_address: req.ip ?? null, notes: "manual trigger" });
    res.status(202).json({ triggered: true, rule_id: r.id });
  } catch (err) { sendDbError(res, err, "escalation-rules:trigger"); }
});

export default router;
