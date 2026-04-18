import { Router } from "express";
import {
  CreateSlaTimerSchema, ListSlaTimersQuerySchema, ExtendSlaTimerSchema,
} from "@workspace/api-zod/governance";
import {
  db, sql, authMiddleware, adminMiddleware,
  parseBody, parseQuery, idFromParams, currentUserId, sendDbError,
  runSafeList, safeLimit, safeOffset,
} from "./_helpers";
import { logAudit } from "../../lib/audit-log";

const router = Router();
router.use(authMiddleware, adminMiddleware);

const ALLOWED = new Set(["id", "scheduled_at", "deadline_at", "status", "escalation_level"]);

router.get("/", async (req, res) => {
  const q = parseQuery(ListSlaTimersQuerySchema, req, res); if (!q) return;
  try {
    const c: ReturnType<typeof sql>[] = [];
    if (q.status) c.push(sql`status = ${q.status}`);
    if (q.entity_type) c.push(sql`entity_type = ${q.entity_type}`);
    if (q.entity_id) c.push(sql`entity_id = ${q.entity_id}`);
    if (q.q) c.push(sql`sla_name ILIKE ${"%" + q.q + "%"}`);
    if (c.length === 0) c.push(sql`1=1`);
    const r = await runSafeList({
      table: "governance.sla_timers", conditions: c,
      allowedOrderColumns: ALLOWED, fallbackColumn: "id",
      orderBy: q.order_by, orderDir: q.order_dir,
      limit: safeLimit(q.limit), offset: safeOffset(q.offset),
    });
    res.json(r);
  } catch (err) { sendDbError(res, err, "sla-timers:list"); }
});

router.post("/", async (req, res) => {
  const d = parseBody(CreateSlaTimerSchema, req, res); if (!d) return;
  const uid = currentUserId(req);
  try {
    const r = await db.execute(sql`
      insert into governance.sla_timers (entity_type, entity_id, sla_name, scheduled_at, deadline_at, status, metadata, created_at, updated_at)
      values (${d.entity_type}, ${d.entity_id}, ${d.sla_name}, ${d.scheduled_at}, ${d.deadline_at},
              'active', ${JSON.stringify(d.metadata ?? {})}::jsonb, now(), now())
      returning *
    `);
    const row = (r.rows ?? [])[0] as { id?: number } | undefined;
    if (row?.id) await logAudit({ user_id: uid, table_name: "governance_sla_timers", record_id: row.id, action: "INSERT", new_values: d as Record<string, unknown>, ip_address: req.ip ?? null });
    res.status(201).json(row);
  } catch (err) { sendDbError(res, err, "sla-timers:create"); }
});

router.post("/:id/extend", async (req, res) => {
  const id = idFromParams(req, res); if (!id) return;
  const d = parseBody(ExtendSlaTimerSchema, req, res); if (!d) return;
  const uid = currentUserId(req);
  try {
    const r = await db.execute(sql`
      update governance.sla_timers
      set deadline_at = ${d.new_deadline_at},
          notes = coalesce(notes, '') || ${"\n[EXTEND] " + d.reason},
          updated_at = now()
      where id = ${id} and status = 'active'
      returning id, deadline_at
    `);
    if ((r.rows ?? []).length === 0) return res.status(409).json({ error: "ניתן להאריך רק SLA פעיל" });
    await logAudit({ user_id: uid, table_name: "governance_sla_timers", record_id: id, action: "UPDATE", new_values: d as Record<string, unknown>, ip_address: req.ip ?? null, notes: "sla extend" });
    res.json((r.rows ?? [])[0]);
  } catch (err) { sendDbError(res, err, "sla-timers:extend"); }
});

router.post("/:id/resolve", async (req, res) => {
  const id = idFromParams(req, res); if (!id) return;
  const uid = currentUserId(req);
  try {
    const r = await db.execute(sql`
      update governance.sla_timers set status = 'resolved', resolved_at = now(), updated_at = now()
      where id = ${id} and status in ('active','breached') returning id, status
    `);
    if ((r.rows ?? []).length === 0) return res.status(409).json({ error: "לא ניתן לסגור את הטיימר" });
    await logAudit({ user_id: uid, table_name: "governance_sla_timers", record_id: id, action: "UPDATE", new_values: { resolved: true }, ip_address: req.ip ?? null });
    res.json((r.rows ?? [])[0]);
  } catch (err) { sendDbError(res, err, "sla-timers:resolve"); }
});

export default router;
