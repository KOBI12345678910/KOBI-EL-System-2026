import { Router } from "express";
import {
  CreateWorkflowDefinitionSchema, UpdateWorkflowDefinitionSchema,
  ListWorkflowDefinitionsQuerySchema, TriggerWorkflowSchema,
  CreateWorkflowStepSchema, UpdateWorkflowStepSchema,
  ListWorkflowStepsQuerySchema,
} from "@workspace/api-zod/orchestration";
import {
  db, sql, authMiddleware, adminMiddleware,
  parseBody, parseQuery, idFromParams, currentUserId, sendDbError,
  runSafeList, safeLimit, safeOffset,
} from "./_helpers";
import { logAudit } from "../../lib/audit-log";

const router = Router();
router.use(authMiddleware);

// Admin-only guard: creating / editing workflow definitions is admin
const adminGuard = [adminMiddleware];

const ALLOWED_DEF = new Set([
  "id", "workflow_code", "workflow_name", "category", "version",
  "active", "is_active", "created_at", "updated_at",
]);

router.get("/", async (req, res) => {
  const q = parseQuery(ListWorkflowDefinitionsQuerySchema, req, res); if (!q) return;
  try {
    const c: ReturnType<typeof sql>[] = [];
    if (q.category) c.push(sql`category = ${q.category}`);
    if (q.active !== undefined) c.push(sql`active = ${q.active}`);
    if (q.workflow_code) c.push(sql`workflow_code = ${q.workflow_code}`);
    if (q.q) c.push(sql`(workflow_code ILIKE ${"%" + q.q + "%"} OR workflow_name ILIKE ${"%" + q.q + "%"})`);
    if (c.length === 0) c.push(sql`1=1`);
    const r = await runSafeList({
      table: "orchestration.workflow_definitions", conditions: c,
      allowedOrderColumns: ALLOWED_DEF, fallbackColumn: "id",
      orderBy: q.order_by, orderDir: q.order_dir,
      limit: safeLimit(q.limit), offset: safeOffset(q.offset),
    });
    res.json(r);
  } catch (err) { sendDbError(res, err, "workflow-definitions:list"); }
});

router.get("/:id", async (req, res) => {
  const id = idFromParams(req, res); if (!id) return;
  try {
    const def = await db.execute(sql`
      select * from orchestration.workflow_definitions where id = ${id}
    `);
    const row = (def.rows ?? [])[0];
    if (!row) return res.status(404).json({ error: "הגדרת Workflow לא נמצאה" });
    const steps = await db.execute(sql`
      select * from orchestration.workflow_steps
      where workflow_definition_id = ${id}
      order by sequence_order asc, id asc
    `);
    const triggers = await db.execute(sql`
      select * from orchestration.workflow_triggers
      where workflow_def_id = ${id}
      order by id asc
    `);
    res.json({
      definition: row,
      steps: steps.rows ?? [],
      triggers: triggers.rows ?? [],
    });
  } catch (err) { sendDbError(res, err, "workflow-definitions:get"); }
});

router.post("/", ...adminGuard, async (req, res) => {
  const d = parseBody(CreateWorkflowDefinitionSchema, req, res); if (!d) return;
  const uid = currentUserId(req);
  try {
    const r = await db.execute(sql`
      insert into orchestration.workflow_definitions
        (workflow_code, workflow_name, category, version, active, description,
         definition_payload, metadata, created_by, updated_by, created_at, updated_at)
      values
        (${d.workflow_code}, ${d.workflow_name}, ${d.category ?? null},
         ${d.version ?? 1}, ${d.active ?? true}, ${d.description ?? null},
         ${JSON.stringify(d.definition_payload ?? {})}::jsonb,
         ${JSON.stringify(d.metadata ?? {})}::jsonb,
         ${uid}, ${uid}, now(), now())
      returning *
    `);
    const row = (r.rows ?? [])[0] as { id?: number } | undefined;
    if (row?.id) await logAudit({ user_id: uid, table_name: "orchestration_workflow_definitions", record_id: row.id, action: "INSERT", new_values: d as Record<string, unknown>, ip_address: req.ip ?? null });
    res.status(201).json(row);
  } catch (err) { sendDbError(res, err, "workflow-definitions:create"); }
});

router.patch("/:id", ...adminGuard, async (req, res) => {
  const id = idFromParams(req, res); if (!id) return;
  const d = parseBody(UpdateWorkflowDefinitionSchema, req, res); if (!d) return;
  const uid = currentUserId(req);
  const entries = Object.entries(d).filter(([, v]) => v !== undefined);
  if (entries.length === 0) return res.status(400).json({ error: "אין שינויים" });
  try {
    const fragments = entries.map(([k, v]) => {
      if (k === "metadata" || k === "definition_payload")
        return sql`${sql.raw(k)} = ${JSON.stringify(v ?? {})}::jsonb`;
      return sql`${sql.raw(k)} = ${v as string | number | boolean | null}`;
    });
    const r = await db.execute(sql`
      update orchestration.workflow_definitions
      set ${sql.join(fragments, sql`, `)}, updated_by = ${uid}, updated_at = now()
      where id = ${id} returning *
    `);
    const row = (r.rows ?? [])[0];
    if (!row) return res.status(404).json({ error: "הגדרת Workflow לא נמצאה" });
    await logAudit({ user_id: uid, table_name: "orchestration_workflow_definitions", record_id: id, action: "UPDATE", new_values: d as Record<string, unknown>, ip_address: req.ip ?? null });
    res.json(row);
  } catch (err) { sendDbError(res, err, "workflow-definitions:update"); }
});

// Business: trigger a workflow manually
router.post("/:id/trigger", async (req, res) => {
  const id = idFromParams(req, res); if (!id) return;
  const d = parseBody(TriggerWorkflowSchema, req, res); if (!d) return;
  const uid = currentUserId(req);
  try {
    const def = await db.execute(sql`
      select id, workflow_code, workflow_name, active
      from orchestration.workflow_definitions where id = ${id}
    `);
    const wd = (def.rows ?? [])[0] as {
      id?: number; workflow_code?: string; workflow_name?: string; active?: boolean;
    } | undefined;
    if (!wd?.id) return res.status(404).json({ error: "הגדרת Workflow לא נמצאה" });
    if (!wd.active) return res.status(409).json({ error: "Workflow מושבת" });

    const run = await db.execute(sql`
      insert into orchestration.workflow_runs
        (workflow_definition_id, workflow_code, workflow_name,
         parent_entity_type, parent_entity_id, correlation_id,
         triggered_by_user_id, status, state, priority, scheduled_at,
         context, metadata, created_by, updated_by, created_at, updated_at)
      values
        (${wd.id}, ${wd.workflow_code ?? ""}, ${wd.workflow_name ?? ""},
         ${d.parent_entity_type ?? null}, ${d.parent_entity_id ?? null},
         ${d.correlation_id ?? null}, ${uid},
         'pending', 'queued', ${d.priority ?? 5},
         ${d.scheduled_at ?? null},
         ${JSON.stringify(d.context ?? {})}::jsonb,
         ${JSON.stringify({})}::jsonb,
         ${uid}, ${uid}, now(), now())
      returning *
    `);
    const row = (run.rows ?? [])[0] as { id?: number } | undefined;

    // Seed step runs from definition steps
    if (row?.id) {
      await db.execute(sql`
        insert into orchestration.workflow_step_runs
          (workflow_run_id, workflow_step_id, step_code, step_name,
           step_type, sequence_order, status, state, attempt, metadata, created_at, updated_at)
        select ${row.id}, s.id, s.step_code, s.step_name, s.step_type,
               s.sequence_order, 'pending', 'queued', 1, '{}'::jsonb, now(), now()
        from orchestration.workflow_steps s
        where s.workflow_definition_id = ${wd.id} and s.active = true
        order by s.sequence_order asc
      `);
      await logAudit({
        user_id: uid, table_name: "orchestration_workflow_runs",
        record_id: row.id, action: "INSERT",
        new_values: { workflow_definition_id: wd.id, trigger: "manual" } as Record<string, unknown>,
        ip_address: req.ip ?? null, notes: "manual trigger",
      });
    }
    res.status(202).json(row);
  } catch (err) { sendDbError(res, err, "workflow-definitions:trigger"); }
});

// ---------- workflow_steps (nested admin CRUD) ----------
const ALLOWED_STEPS = new Set([
  "id", "workflow_definition_id", "sequence_order", "step_code",
  "step_name", "step_type", "active", "created_at",
]);

router.get("/:id/steps", async (req, res) => {
  const id = idFromParams(req, res); if (!id) return;
  const q = parseQuery(ListWorkflowStepsQuerySchema, req, res); if (!q) return;
  try {
    const c: ReturnType<typeof sql>[] = [sql`workflow_definition_id = ${id}`];
    if (q.step_type) c.push(sql`step_type = ${q.step_type}`);
    if (q.active !== undefined) c.push(sql`active = ${q.active}`);
    if (q.q) c.push(sql`(step_code ILIKE ${"%" + q.q + "%"} OR step_name ILIKE ${"%" + q.q + "%"})`);
    const r = await runSafeList({
      table: "orchestration.workflow_steps", conditions: c,
      allowedOrderColumns: ALLOWED_STEPS, fallbackColumn: "sequence_order",
      orderBy: q.order_by ?? "sequence_order",
      orderDir: q.order_dir ?? "asc",
      limit: safeLimit(q.limit), offset: safeOffset(q.offset),
    });
    res.json(r);
  } catch (err) { sendDbError(res, err, "workflow-steps:list"); }
});

router.post("/:id/steps", ...adminGuard, async (req, res) => {
  const defId = idFromParams(req, res); if (!defId) return;
  const d = parseBody(CreateWorkflowStepSchema, req, res); if (!d) return;
  const uid = currentUserId(req);
  try {
    const r = await db.execute(sql`
      insert into orchestration.workflow_steps
        (workflow_definition_id, step_code, step_name, step_type, sequence_order,
         config_payload, active, description, timeout_seconds, retry_policy, metadata,
         created_at, updated_at)
      values
        (${defId}, ${d.step_code}, ${d.step_name}, ${d.step_type}, ${d.sequence_order},
         ${JSON.stringify(d.config_payload ?? {})}::jsonb,
         ${d.active ?? true}, ${d.description ?? null}, ${d.timeout_seconds ?? null},
         ${JSON.stringify(d.retry_policy ?? {})}::jsonb,
         ${JSON.stringify(d.metadata ?? {})}::jsonb,
         now(), now())
      returning *
    `);
    const row = (r.rows ?? [])[0] as { id?: number } | undefined;
    if (row?.id) await logAudit({ user_id: uid, table_name: "orchestration_workflow_steps", record_id: row.id, action: "INSERT", new_values: d as Record<string, unknown>, ip_address: req.ip ?? null });
    res.status(201).json(row);
  } catch (err) { sendDbError(res, err, "workflow-steps:create"); }
});

router.patch("/steps/:id", ...adminGuard, async (req, res) => {
  const id = idFromParams(req, res); if (!id) return;
  const d = parseBody(UpdateWorkflowStepSchema, req, res); if (!d) return;
  const uid = currentUserId(req);
  const entries = Object.entries(d).filter(([, v]) => v !== undefined);
  if (entries.length === 0) return res.status(400).json({ error: "אין שינויים" });
  try {
    const fragments = entries.map(([k, v]) => {
      if (k === "metadata" || k === "config_payload" || k === "retry_policy")
        return sql`${sql.raw(k)} = ${JSON.stringify(v ?? {})}::jsonb`;
      return sql`${sql.raw(k)} = ${v as string | number | boolean | null}`;
    });
    const r = await db.execute(sql`
      update orchestration.workflow_steps
      set ${sql.join(fragments, sql`, `)}, updated_at = now()
      where id = ${id} returning *
    `);
    const row = (r.rows ?? [])[0];
    if (!row) return res.status(404).json({ error: "שלב לא נמצא" });
    await logAudit({ user_id: uid, table_name: "orchestration_workflow_steps", record_id: id, action: "UPDATE", new_values: d as Record<string, unknown>, ip_address: req.ip ?? null });
    res.json(row);
  } catch (err) { sendDbError(res, err, "workflow-steps:update"); }
});

export default router;
