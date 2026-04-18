import { Router } from "express";
import {
  ListWorkflowRunsQuerySchema, PauseWorkflowRunSchema,
  ResumeWorkflowRunSchema, CancelWorkflowRunSchema,
  ListWorkflowStepRunsQuerySchema, CreateStepCommentSchema,
  ListStepCommentsQuerySchema,
} from "@workspace/api-zod/orchestration";
import {
  db, sql, authMiddleware,
  parseBody, parseQuery, idFromParams, currentUserId, sendDbError,
  runSafeList, safeLimit, safeOffset, safeDateParam,
} from "./_helpers";
import { logAudit } from "../../lib/audit-log";

const router = Router();
router.use(authMiddleware);

const ALLOWED = new Set([
  "id", "workflow_definition_id", "workflow_code", "status",
  "priority", "scheduled_at", "started_at", "finished_at", "created_at",
]);

router.get("/", async (req, res) => {
  const q = parseQuery(ListWorkflowRunsQuerySchema, req, res); if (!q) return;
  try {
    const c: ReturnType<typeof sql>[] = [];
    if (q.workflow_definition_id) c.push(sql`workflow_definition_id = ${q.workflow_definition_id}`);
    if (q.workflow_code) c.push(sql`workflow_code = ${q.workflow_code}`);
    if (q.status) c.push(sql`status = ${q.status}`);
    if (q.parent_entity_type) c.push(sql`parent_entity_type = ${q.parent_entity_type}`);
    if (q.parent_entity_id) c.push(sql`parent_entity_id = ${q.parent_entity_id}`);
    if (q.triggered_by_user_id) c.push(sql`triggered_by_user_id = ${q.triggered_by_user_id}`);
    const from = safeDateParam(q.from_date);
    const to = safeDateParam(q.to_date);
    if (from) c.push(sql`created_at >= ${from}`);
    if (to) c.push(sql`created_at <= ${to}`);
    if (q.q) c.push(sql`(workflow_code ILIKE ${"%" + q.q + "%"} OR workflow_name ILIKE ${"%" + q.q + "%"})`);
    if (c.length === 0) c.push(sql`1=1`);
    const r = await runSafeList({
      table: "orchestration.workflow_runs", conditions: c,
      allowedOrderColumns: ALLOWED, fallbackColumn: "id",
      orderBy: q.order_by, orderDir: q.order_dir,
      limit: safeLimit(q.limit), offset: safeOffset(q.offset),
    });
    res.json(r);
  } catch (err) { sendDbError(res, err, "workflow-runs:list"); }
});

router.get("/:id", async (req, res) => {
  const id = idFromParams(req, res); if (!id) return;
  try {
    const run = await db.execute(sql`
      select * from orchestration.workflow_runs where id = ${id}
    `);
    const row = (run.rows ?? [])[0];
    if (!row) return res.status(404).json({ error: "ריצה לא נמצאה" });
    const steps = await db.execute(sql`
      select * from orchestration.workflow_step_runs
      where workflow_run_id = ${id}
      order by sequence_order asc, id asc
    `);
    const jobs = await db.execute(sql`
      select id, queue_name, job_type, status, attempts_count, max_attempts,
             scheduled_at, started_at, finished_at, last_error
      from orchestration.job_queue
      where workflow_run_id = ${id}
      order by id desc limit 100
    `);
    res.json({ run: row, steps: steps.rows ?? [], jobs: jobs.rows ?? [] });
  } catch (err) { sendDbError(res, err, "workflow-runs:get"); }
});

// Business: pause a running workflow
router.post("/:id/pause", async (req, res) => {
  const id = idFromParams(req, res); if (!id) return;
  const d = parseBody(PauseWorkflowRunSchema, req, res); if (!d) return;
  const uid = currentUserId(req);
  try {
    const r = await db.execute(sql`
      update orchestration.workflow_runs
      set status = 'paused', state = 'paused', paused_at = now(),
          updated_by = ${uid}, updated_at = now()
      where id = ${id} and status in ('pending','running')
      returning id, status
    `);
    if ((r.rows ?? []).length === 0) {
      return res.status(409).json({ error: "לא ניתן להשהות בסטטוס הנוכחי" });
    }
    await logAudit({ user_id: uid, table_name: "orchestration_workflow_runs", record_id: id, action: "UPDATE", new_values: { paused: true, reason: d.reason ?? null } as Record<string, unknown>, ip_address: req.ip ?? null, notes: "pause" });
    res.json((r.rows ?? [])[0]);
  } catch (err) { sendDbError(res, err, "workflow-runs:pause"); }
});

// Business: resume a paused workflow
router.post("/:id/resume", async (req, res) => {
  const id = idFromParams(req, res); if (!id) return;
  const d = parseBody(ResumeWorkflowRunSchema, req, res); if (!d) return;
  const uid = currentUserId(req);
  try {
    const r = await db.execute(sql`
      update orchestration.workflow_runs
      set status = 'running', state = 'running', paused_at = null,
          updated_by = ${uid}, updated_at = now()
      where id = ${id} and status = 'paused'
      returning id, status
    `);
    if ((r.rows ?? []).length === 0) {
      return res.status(409).json({ error: "ניתן להפעיל רק ריצה מושהית" });
    }
    await logAudit({ user_id: uid, table_name: "orchestration_workflow_runs", record_id: id, action: "UPDATE", new_values: { resumed: true, note: d.note ?? null } as Record<string, unknown>, ip_address: req.ip ?? null, notes: "resume" });
    res.json((r.rows ?? [])[0]);
  } catch (err) { sendDbError(res, err, "workflow-runs:resume"); }
});

// Business: cancel a workflow
router.post("/:id/cancel", async (req, res) => {
  const id = idFromParams(req, res); if (!id) return;
  const d = parseBody(CancelWorkflowRunSchema, req, res); if (!d) return;
  const uid = currentUserId(req);
  try {
    const r = await db.execute(sql`
      update orchestration.workflow_runs
      set status = 'canceled', state = 'canceled', finished_at = now(),
          error_message = ${d.reason},
          updated_by = ${uid}, updated_at = now()
      where id = ${id} and status in ('pending','running','paused')
      returning id, status
    `);
    if ((r.rows ?? []).length === 0) {
      return res.status(409).json({ error: "לא ניתן לבטל ריצה שכבר הסתיימה" });
    }
    // Cascade: cancel pending jobs
    await db.execute(sql`
      update orchestration.job_queue
      set status = 'cancelled', state = 'cancelled', finished_at = now()
      where workflow_run_id = ${id} and status in ('pending','running')
    `);
    // Cascade: mark pending step runs as skipped
    await db.execute(sql`
      update orchestration.workflow_step_runs
      set status = 'skipped', state = 'skipped', finished_at = now()
      where workflow_run_id = ${id} and status in ('pending','running')
    `);
    await logAudit({ user_id: uid, table_name: "orchestration_workflow_runs", record_id: id, action: "UPDATE", new_values: { canceled: true, reason: d.reason } as Record<string, unknown>, ip_address: req.ip ?? null, notes: "cancel" });
    res.json((r.rows ?? [])[0]);
  } catch (err) { sendDbError(res, err, "workflow-runs:cancel"); }
});

// ---------- step runs (read-only + comments) ----------
const ALLOWED_STEPS = new Set([
  "id", "workflow_run_id", "workflow_step_id", "sequence_order",
  "status", "started_at", "finished_at", "created_at",
]);

router.get("/steps/list", async (req, res) => {
  const q = parseQuery(ListWorkflowStepRunsQuerySchema, req, res); if (!q) return;
  try {
    const c: ReturnType<typeof sql>[] = [];
    if (q.workflow_run_id) c.push(sql`workflow_run_id = ${q.workflow_run_id}`);
    if (q.workflow_step_id) c.push(sql`workflow_step_id = ${q.workflow_step_id}`);
    if (q.status) c.push(sql`status = ${q.status}`);
    if (c.length === 0) c.push(sql`1=1`);
    const r = await runSafeList({
      table: "orchestration.workflow_step_runs", conditions: c,
      allowedOrderColumns: ALLOWED_STEPS, fallbackColumn: "sequence_order",
      orderBy: q.order_by, orderDir: q.order_dir,
      limit: safeLimit(q.limit), offset: safeOffset(q.offset),
    });
    res.json(r);
  } catch (err) { sendDbError(res, err, "workflow-step-runs:list"); }
});

// ---------- step_comments ----------
const ALLOWED_COMMENTS = new Set([
  "id", "step_run_id", "user_id", "created_at",
]);

router.get("/steps/comments", async (req, res) => {
  const q = parseQuery(ListStepCommentsQuerySchema, req, res); if (!q) return;
  try {
    const c: ReturnType<typeof sql>[] = [];
    if (q.step_run_id) c.push(sql`step_run_id = ${q.step_run_id}`);
    if (c.length === 0) c.push(sql`1=1`);
    const r = await runSafeList({
      table: "orchestration.step_comments", conditions: c,
      allowedOrderColumns: ALLOWED_COMMENTS, fallbackColumn: "created_at",
      orderBy: q.order_by, orderDir: q.order_dir,
      limit: safeLimit(q.limit), offset: safeOffset(q.offset),
    });
    res.json(r);
  } catch (err) { sendDbError(res, err, "step-comments:list"); }
});

router.post("/steps/comments", async (req, res) => {
  const d = parseBody(CreateStepCommentSchema, req, res); if (!d) return;
  const uid = currentUserId(req);
  try {
    const r = await db.execute(sql`
      insert into orchestration.step_comments
        (step_run_id, user_id, comment_text, is_internal, created_at, updated_at)
      values
        (${d.step_run_id}, ${uid}, ${d.comment_text}, ${d.is_internal ?? false}, now(), now())
      returning *
    `);
    const row = (r.rows ?? [])[0] as { id?: number } | undefined;
    if (row?.id) await logAudit({ user_id: uid, table_name: "orchestration_step_comments", record_id: row.id, action: "INSERT", new_values: d as Record<string, unknown>, ip_address: req.ip ?? null });
    res.status(201).json(row);
  } catch (err) { sendDbError(res, err, "step-comments:create"); }
});

export default router;
