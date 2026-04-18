import { Router } from "express";
import {
  CreateJobSchema, ListJobsQuerySchema, RetryJobSchema, CancelJobSchema,
} from "@workspace/api-zod/orchestration";
import {
  db, sql, authMiddleware, adminMiddleware,
  parseBody, parseQuery, idFromParams, currentUserId, sendDbError,
  runSafeList, safeLimit, safeOffset, safeDateParam,
} from "./_helpers";
import { logAudit } from "../../lib/audit-log";

const router = Router();
router.use(authMiddleware);

const ALLOWED = new Set([
  "id", "queue_name", "job_type", "status", "priority",
  "scheduled_at", "started_at", "finished_at", "created_at",
]);

router.get("/", async (req, res) => {
  const q = parseQuery(ListJobsQuerySchema, req, res); if (!q) return;
  try {
    const c: ReturnType<typeof sql>[] = [];
    if (q.queue_name) c.push(sql`queue_name = ${q.queue_name}`);
    if (q.job_type) c.push(sql`job_type = ${q.job_type}`);
    if (q.status) c.push(sql`status = ${q.status}`);
    if (q.workflow_run_id) c.push(sql`workflow_run_id = ${q.workflow_run_id}`);
    const from = safeDateParam(q.from_date);
    const to = safeDateParam(q.to_date);
    if (from) c.push(sql`created_at >= ${from}`);
    if (to) c.push(sql`created_at <= ${to}`);
    if (q.q) c.push(sql`(queue_name ILIKE ${"%" + q.q + "%"} OR job_type ILIKE ${"%" + q.q + "%"})`);
    if (c.length === 0) c.push(sql`1=1`);
    const r = await runSafeList({
      table: "orchestration.job_queue", conditions: c,
      allowedOrderColumns: ALLOWED, fallbackColumn: "id",
      orderBy: q.order_by, orderDir: q.order_dir,
      limit: safeLimit(q.limit), offset: safeOffset(q.offset),
    });
    res.json(r);
  } catch (err) { sendDbError(res, err, "job-queue:list"); }
});

router.get("/:id", async (req, res) => {
  const id = idFromParams(req, res); if (!id) return;
  try {
    const r = await db.execute(sql`
      select * from orchestration.job_queue where id = ${id}
    `);
    const row = (r.rows ?? [])[0];
    if (!row) return res.status(404).json({ error: "משימה לא נמצאה" });
    res.json(row);
  } catch (err) { sendDbError(res, err, "job-queue:get"); }
});

router.post("/", adminMiddleware, async (req, res) => {
  const d = parseBody(CreateJobSchema, req, res); if (!d) return;
  const uid = currentUserId(req);
  try {
    const r = await db.execute(sql`
      insert into orchestration.job_queue
        (queue_name, job_type, payload, parent_entity_type, parent_entity_id,
         workflow_run_id, attempts_count, max_attempts, available_at, scheduled_at,
         status, state, priority, metadata, created_at, updated_at)
      values
        (${d.queue_name}, ${d.job_type}, ${JSON.stringify(d.payload ?? {})}::jsonb,
         ${d.parent_entity_type ?? null}, ${d.parent_entity_id ?? null},
         ${d.workflow_run_id ?? null}, 0, ${d.max_attempts ?? 5},
         ${d.scheduled_at ?? null}, ${d.scheduled_at ?? null},
         'pending', 'queued', ${d.priority ?? 5},
         ${JSON.stringify(d.metadata ?? {})}::jsonb,
         now(), now())
      returning *
    `);
    const row = (r.rows ?? [])[0] as { id?: number } | undefined;
    if (row?.id) await logAudit({ user_id: uid, table_name: "orchestration_job_queue", record_id: row.id, action: "INSERT", new_values: d as Record<string, unknown>, ip_address: req.ip ?? null });
    res.status(201).json(row);
  } catch (err) { sendDbError(res, err, "job-queue:create"); }
});

// Business: retry
router.post("/:id/retry", async (req, res) => {
  const id = idFromParams(req, res); if (!id) return;
  const d = parseBody(RetryJobSchema, req, res); if (!d) return;
  const uid = currentUserId(req);
  try {
    const cur = await db.execute(sql`select id, status from orchestration.job_queue where id = ${id}`);
    const row = (cur.rows ?? [])[0] as { status?: string } | undefined;
    if (!row) return res.status(404).json({ error: "משימה לא נמצאה" });
    if (row.status === "running") return res.status(409).json({ error: "המשימה רצה כעת" });

    const attemptsFrag = d.reset_attempts ? sql`0` : sql`attempts_count`;
    const r = await db.execute(sql`
      update orchestration.job_queue
      set status = 'pending', state = 'queued',
          attempts_count = ${attemptsFrag},
          scheduled_at = now(), available_at = now(),
          last_error = null, error_message = null,
          finished_at = null,
          updated_at = now()
      where id = ${id}
      returning id, status, attempts_count, scheduled_at
    `);
    await logAudit({ user_id: uid, table_name: "orchestration_job_queue", record_id: id, action: "UPDATE", new_values: { retry: true, reset_attempts: d.reset_attempts } as Record<string, unknown>, ip_address: req.ip ?? null, notes: "manual retry" });
    res.json((r.rows ?? [])[0]);
  } catch (err) { sendDbError(res, err, "job-queue:retry"); }
});

// Business: cancel
router.post("/:id/cancel", async (req, res) => {
  const id = idFromParams(req, res); if (!id) return;
  const d = parseBody(CancelJobSchema, req, res); if (!d) return;
  const uid = currentUserId(req);
  try {
    const r = await db.execute(sql`
      update orchestration.job_queue
      set status = 'cancelled', state = 'cancelled',
          finished_at = now(), error_message = ${d.reason ?? "cancelled"},
          updated_at = now()
      where id = ${id} and status in ('pending','running')
      returning id, status
    `);
    if ((r.rows ?? []).length === 0) {
      return res.status(409).json({ error: "המשימה אינה ניתנת לביטול" });
    }
    await logAudit({ user_id: uid, table_name: "orchestration_job_queue", record_id: id, action: "UPDATE", new_values: { cancelled: true, reason: d.reason ?? null } as Record<string, unknown>, ip_address: req.ip ?? null });
    res.json((r.rows ?? [])[0]);
  } catch (err) { sendDbError(res, err, "job-queue:cancel"); }
});

export default router;
