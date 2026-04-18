import { Router } from "express";
import {
  CreateWorkflowTriggerSchema, UpdateWorkflowTriggerSchema,
  ListWorkflowTriggersQuerySchema, EnableWorkflowTriggerSchema,
} from "@workspace/api-zod/orchestration";
import {
  db, sql, authMiddleware, adminMiddleware,
  parseBody, parseQuery, idFromParams, currentUserId, sendDbError,
  runSafeList, safeLimit, safeOffset,
} from "./_helpers";
import { logAudit } from "../../lib/audit-log";

const router = Router();
router.use(authMiddleware, adminMiddleware);

const ALLOWED = new Set([
  "id", "workflow_def_id", "trigger_name", "trigger_type",
  "is_enabled", "next_fire_at", "last_fired_at", "fire_count", "created_at",
]);

router.get("/", async (req, res) => {
  const q = parseQuery(ListWorkflowTriggersQuerySchema, req, res); if (!q) return;
  try {
    const c: ReturnType<typeof sql>[] = [];
    if (q.workflow_def_id) c.push(sql`workflow_def_id = ${q.workflow_def_id}`);
    if (q.trigger_type) c.push(sql`trigger_type = ${q.trigger_type}`);
    if (q.is_enabled !== undefined) c.push(sql`is_enabled = ${q.is_enabled}`);
    if (q.q) c.push(sql`trigger_name ILIKE ${"%" + q.q + "%"}`);
    if (c.length === 0) c.push(sql`1=1`);
    const r = await runSafeList({
      table: "orchestration.workflow_triggers", conditions: c,
      allowedOrderColumns: ALLOWED, fallbackColumn: "id",
      orderBy: q.order_by, orderDir: q.order_dir,
      limit: safeLimit(q.limit), offset: safeOffset(q.offset),
    });
    res.json(r);
  } catch (err) { sendDbError(res, err, "workflow-triggers:list"); }
});

router.post("/", async (req, res) => {
  const d = parseBody(CreateWorkflowTriggerSchema, req, res); if (!d) return;
  const uid = currentUserId(req);
  try {
    const r = await db.execute(sql`
      insert into orchestration.workflow_triggers
        (workflow_def_id, trigger_name, trigger_type, trigger_config,
         is_enabled, metadata, created_by, updated_by, created_at, updated_at)
      values
        (${d.workflow_def_id}, ${d.trigger_name}, ${d.trigger_type},
         ${JSON.stringify(d.trigger_config ?? {})}::jsonb,
         ${d.is_enabled ?? true},
         ${JSON.stringify(d.metadata ?? {})}::jsonb,
         ${uid}, ${uid}, now(), now())
      returning *
    `);
    const row = (r.rows ?? [])[0] as { id?: number } | undefined;
    if (row?.id) await logAudit({ user_id: uid, table_name: "orchestration_workflow_triggers", record_id: row.id, action: "INSERT", new_values: d as Record<string, unknown>, ip_address: req.ip ?? null });
    res.status(201).json(row);
  } catch (err) { sendDbError(res, err, "workflow-triggers:create"); }
});

router.patch("/:id", async (req, res) => {
  const id = idFromParams(req, res); if (!id) return;
  const d = parseBody(UpdateWorkflowTriggerSchema, req, res); if (!d) return;
  const uid = currentUserId(req);
  const entries = Object.entries(d).filter(([, v]) => v !== undefined);
  if (entries.length === 0) return res.status(400).json({ error: "אין שינויים" });
  try {
    const fragments = entries.map(([k, v]) => {
      if (k === "metadata" || k === "trigger_config")
        return sql`${sql.raw(k)} = ${JSON.stringify(v ?? {})}::jsonb`;
      return sql`${sql.raw(k)} = ${v as string | number | boolean | null}`;
    });
    const r = await db.execute(sql`
      update orchestration.workflow_triggers
      set ${sql.join(fragments, sql`, `)}, updated_by = ${uid}, updated_at = now()
      where id = ${id} returning *
    `);
    const row = (r.rows ?? [])[0];
    if (!row) return res.status(404).json({ error: "טריגר לא נמצא" });
    await logAudit({ user_id: uid, table_name: "orchestration_workflow_triggers", record_id: id, action: "UPDATE", new_values: d as Record<string, unknown>, ip_address: req.ip ?? null });
    res.json(row);
  } catch (err) { sendDbError(res, err, "workflow-triggers:update"); }
});

router.post("/:id/enable", async (req, res) => {
  const id = idFromParams(req, res); if (!id) return;
  const d = parseBody(EnableWorkflowTriggerSchema, req, res); if (!d) return;
  const uid = currentUserId(req);
  try {
    const r = await db.execute(sql`
      update orchestration.workflow_triggers
      set is_enabled = ${d.is_enabled}, updated_by = ${uid}, updated_at = now()
      where id = ${id} returning id, is_enabled
    `);
    const row = (r.rows ?? [])[0];
    if (!row) return res.status(404).json({ error: "טריגר לא נמצא" });
    await logAudit({ user_id: uid, table_name: "orchestration_workflow_triggers", record_id: id, action: "UPDATE", new_values: { is_enabled: d.is_enabled } as Record<string, unknown>, ip_address: req.ip ?? null });
    res.json(row);
  } catch (err) { sendDbError(res, err, "workflow-triggers:enable"); }
});

export default router;
