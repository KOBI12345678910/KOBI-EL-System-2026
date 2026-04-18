import { Router } from "express";
import {
  CreateLeaveRequestSchema, UpdateLeaveRequestSchema, ListLeaveRequestsQuerySchema,
  ApproveLeaveRequestSchema, RejectLeaveRequestSchema,
} from "@workspace/api-zod/workforce";
import {
  db, sql, authMiddleware, hrOrAdminMiddleware, hrManagerMiddleware,
  parseBody, parseQuery, idFromParams, currentUserId, sendDbError,
  runSafeList, safeLimit, safeOffset,
} from "./_helpers";
import { logAudit } from "../../lib/audit-log";

const router = Router();
router.use(authMiddleware);
router.use(hrOrAdminMiddleware);

const ALLOWED = new Set(["id","employee_id","start_date","end_date","status","created_at","updated_at"]);

router.get("/", async (req, res) => {
  const q = parseQuery(ListLeaveRequestsQuerySchema, req, res); if (!q) return;
  try {
    const c = [sql`coalesce(is_deleted, false) = false`];
    if (q.employee_id) c.push(sql`employee_id = ${q.employee_id}`);
    if (q.status) c.push(sql`status = ${q.status}`);
    if (q.leave_type_id) c.push(sql`leave_type_id = ${q.leave_type_id}`);
    if (q.start_date_from) c.push(sql`start_date >= ${q.start_date_from}`);
    if (q.start_date_to) c.push(sql`start_date <= ${q.start_date_to}`);
    const r = await runSafeList({
      table: "workforce.leave_requests", conditions: c,
      allowedOrderColumns: ALLOWED, fallbackColumn: "start_date",
      orderBy: q.order_by, orderDir: q.order_dir,
      limit: safeLimit(q.limit), offset: safeOffset(q.offset),
    });
    res.json(r);
  } catch (err) { sendDbError(res, err, "leave-requests:list"); }
});

router.get("/:id", async (req, res) => {
  const id = idFromParams(req, res); if (!id) return;
  try {
    const r = await db.execute(sql`
      select lr.*, lt.leave_name, lt.leave_code
      from workforce.leave_requests lr
      left join workforce.leave_types lt on lt.id = lr.leave_type_id
      where lr.id = ${id} and coalesce(lr.is_deleted, false) = false limit 1
    `);
    const row = (r.rows ?? [])[0];
    if (!row) return res.status(404).json({ error: "בקשת חופשה לא נמצאה" });
    res.json(row);
  } catch (err) { sendDbError(res, err, "leave-requests:get"); }
});

router.post("/", async (req, res) => {
  const d = parseBody(CreateLeaveRequestSchema, req, res); if (!d) return;
  const uid = currentUserId(req);
  try {
    const r = await db.execute(sql`
      insert into workforce.leave_requests (
        request_number, employee_id, leave_type_id, start_date, end_date,
        total_days, status, approval_status, notes, metadata, created_by, updated_by, created_at, updated_at
      ) values (
        ${d.request_number ?? "LV-" + Date.now()}, ${d.employee_id}, ${d.leave_type_id},
        ${d.start_date}, ${d.end_date}, ${d.total_days},
        ${d.status ?? "submitted"}, ${"Pending"},
        ${d.notes ?? null}, ${JSON.stringify(d.metadata ?? {})}::jsonb,
        ${uid}, ${uid}, now(), now()
      ) returning *
    `);
    const row = (r.rows ?? [])[0] as { id?: number } | undefined;
    if (row?.id) await logAudit({ user_id: uid, table_name: "workforce_leave_requests", record_id: row.id, action: "INSERT", new_values: { employee_id: d.employee_id, leave_type_id: d.leave_type_id }, ip_address: req.ip ?? null });
    res.status(201).json(row);
  } catch (err) { sendDbError(res, err, "leave-requests:create"); }
});

router.post("/:id/approve", hrManagerMiddleware, async (req, res) => {
  const id = idFromParams(req, res); if (!id) return;
  const d = parseBody(ApproveLeaveRequestSchema, req, res); if (!d) return;
  const uid = currentUserId(req);
  try {
    const r = await db.execute(sql`
      update workforce.leave_requests
      set status = 'approved', approval_status = 'Approved',
          approved_by_user_id = ${uid}, approved_at = now(),
          notes = coalesce(${d.notes ?? null}, notes),
          updated_by = ${uid}, updated_at = now()
      where id = ${id} and status = 'submitted' and coalesce(is_deleted,false) = false
      returning *
    `);
    const row = (r.rows ?? [])[0];
    if (!row) return res.status(404).json({ error: "בקשה לא נמצאה או כבר טופלה" });
    await logAudit({ user_id: uid, table_name: "workforce_leave_requests", record_id: id, action: "UPDATE", new_values: { status: "approved" }, ip_address: req.ip ?? null });
    res.json(row);
  } catch (err) { sendDbError(res, err, "leave-requests:approve"); }
});

router.post("/:id/reject", hrManagerMiddleware, async (req, res) => {
  const id = idFromParams(req, res); if (!id) return;
  const d = parseBody(RejectLeaveRequestSchema, req, res); if (!d) return;
  const uid = currentUserId(req);
  try {
    const r = await db.execute(sql`
      update workforce.leave_requests
      set status = 'rejected', approval_status = 'Rejected',
          approved_by_user_id = ${uid}, approved_at = now(),
          notes = ${d.reason}, updated_by = ${uid}, updated_at = now()
      where id = ${id} and status = 'submitted' and coalesce(is_deleted,false) = false
      returning *
    `);
    const row = (r.rows ?? [])[0];
    if (!row) return res.status(404).json({ error: "בקשה לא נמצאה או כבר טופלה" });
    await logAudit({ user_id: uid, table_name: "workforce_leave_requests", record_id: id, action: "UPDATE", new_values: { status: "rejected", reason: d.reason }, ip_address: req.ip ?? null });
    res.json(row);
  } catch (err) { sendDbError(res, err, "leave-requests:reject"); }
});

router.patch("/:id", async (req, res) => {
  const id = idFromParams(req, res); if (!id) return;
  const d = parseBody(UpdateLeaveRequestSchema, req, res); if (!d) return;
  const uid = currentUserId(req);
  const entries = Object.entries(d).filter(([, v]) => v !== undefined);
  if (entries.length === 0) return res.status(400).json({ error: "אין שינויים" });
  try {
    const fragments = entries.map(([k, v]) =>
      k === "metadata"
        ? sql`${sql.raw(k)} = ${JSON.stringify(v ?? {})}::jsonb`
        : sql`${sql.raw(k)} = ${v as string | number | boolean | null}`
    );
    let setClause = fragments[0];
    for (let i = 1; i < fragments.length; i++) setClause = sql`${setClause}, ${fragments[i]}`;
    const r = await db.execute(sql`
      update workforce.leave_requests set ${setClause}, updated_by = ${uid}, updated_at = now()
      where id = ${id} and coalesce(is_deleted,false) = false returning *
    `);
    const row = (r.rows ?? [])[0];
    if (!row) return res.status(404).json({ error: "בקשה לא נמצאה" });
    await logAudit({ user_id: uid, table_name: "workforce_leave_requests", record_id: id, action: "UPDATE", new_values: Object.fromEntries(entries), ip_address: req.ip ?? null });
    res.json(row);
  } catch (err) { sendDbError(res, err, "leave-requests:update"); }
});

router.delete("/:id", async (req, res) => {
  const id = idFromParams(req, res); if (!id) return;
  const uid = currentUserId(req);
  try {
    const r = await db.execute(sql`
      update workforce.leave_requests set is_deleted = true, status = 'cancelled',
        updated_by = ${uid}, updated_at = now()
      where id = ${id} and coalesce(is_deleted,false) = false returning id
    `);
    if ((r.rows ?? []).length === 0) return res.status(404).json({ error: "בקשה לא נמצאה" });
    await logAudit({ user_id: uid, table_name: "workforce_leave_requests", record_id: id, action: "DELETE", ip_address: req.ip ?? null });
    res.status(204).send();
  } catch (err) { sendDbError(res, err, "leave-requests:delete"); }
});

export default router;
