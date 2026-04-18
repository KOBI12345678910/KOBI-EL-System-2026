import { Router } from "express";
import {
  ListQueueJobsQuerySchema, RetryQueueJobSchema,
} from "@workspace/api-zod/governance";
import {
  db, sql, authMiddleware, adminMiddleware,
  parseBody, parseQuery, idFromParams, currentUserId, sendDbError,
  runSafeList, safeLimit, safeOffset,
} from "./_helpers";
import { logAudit } from "../../lib/audit-log";

const router = Router();
router.use(authMiddleware, adminMiddleware);

const ALLOWED = new Set(["id", "queue_name", "status", "priority", "scheduled_at", "created_at"]);

router.get("/", async (req, res) => {
  const q = parseQuery(ListQueueJobsQuerySchema, req, res); if (!q) return;
  try {
    const c: ReturnType<typeof sql>[] = [];
    if (q.queue_name) c.push(sql`queue_name = ${q.queue_name}`);
    if (q.job_type) c.push(sql`job_type = ${q.job_type}`);
    if (q.status) c.push(sql`status = ${q.status}`);
    if (q.q) c.push(sql`(queue_name ILIKE ${"%" + q.q + "%"} OR job_type ILIKE ${"%" + q.q + "%"})`);
    if (c.length === 0) c.push(sql`1=1`);
    const r = await runSafeList({
      table: "governance.queue_jobs", conditions: c,
      allowedOrderColumns: ALLOWED, fallbackColumn: "id",
      orderBy: q.order_by, orderDir: q.order_dir,
      limit: safeLimit(q.limit), offset: safeOffset(q.offset),
    });
    res.json(r);
  } catch (err) { sendDbError(res, err, "queue-jobs:list"); }
});

router.post("/:id/retry", async (req, res) => {
  const id = idFromParams(req, res); if (!id) return;
  const d = parseBody(RetryQueueJobSchema, req, res); if (!d) return;
  const uid = currentUserId(req);
  try {
    const cur = await db.execute(sql`select id, status from governance.queue_jobs where id = ${id}`);
    const row = (cur.rows ?? [])[0] as { status?: string } | undefined;
    if (!row) return res.status(404).json({ error: "משימה לא נמצאה" });
    if (row.status === "running") return res.status(409).json({ error: "המשימה רצה כעת" });

    const r = await db.execute(sql`
      update governance.queue_jobs
      set status = 'pending',
          attempts = ${d.reset_attempts ? sql`0` : sql`attempts`},
          scheduled_at = now(),
          last_error = null
      where id = ${id}
      returning id, status, attempts, scheduled_at
    `);
    await logAudit({ user_id: uid, table_name: "governance_queue_jobs", record_id: id, action: "UPDATE", new_values: { retry: true, reset_attempts: d.reset_attempts } as Record<string, unknown>, ip_address: req.ip ?? null, notes: "manual retry" });
    res.json((r.rows ?? [])[0]);
  } catch (err) { sendDbError(res, err, "queue-jobs:retry"); }
});

router.post("/:id/cancel", async (req, res) => {
  const id = idFromParams(req, res); if (!id) return;
  const uid = currentUserId(req);
  try {
    const r = await db.execute(sql`
      update governance.queue_jobs set status = 'cancelled', finished_at = now()
      where id = ${id} and status in ('pending','running') returning id, status
    `);
    if ((r.rows ?? []).length === 0) return res.status(409).json({ error: "המשימה אינה ניתנת לביטול" });
    await logAudit({ user_id: uid, table_name: "governance_queue_jobs", record_id: id, action: "UPDATE", new_values: { cancelled: true } as Record<string, unknown>, ip_address: req.ip ?? null });
    res.json((r.rows ?? [])[0]);
  } catch (err) { sendDbError(res, err, "queue-jobs:cancel"); }
});

export default router;
