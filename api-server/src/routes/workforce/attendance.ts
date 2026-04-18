// workforce.attendance + workforce.attendance_exceptions
import { Router } from "express";
import {
  CreateAttendanceLogSchema, UpdateAttendanceLogSchema, ListAttendanceLogsQuerySchema,
  CreateAttendanceExceptionSchema, UpdateAttendanceExceptionSchema,
  ListAttendanceExceptionsQuerySchema, ApproveAttendanceExceptionSchema, RejectAttendanceExceptionSchema,
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

const ATT_ALLOWED = new Set(["id","employee_id","work_date","approval_status","state","created_at","updated_at"]);
const EXC_ALLOWED = new Set(["id","employee_id","exception_date","status","created_at","updated_at"]);

// ───────────────── attendance logs ─────────────────
router.get("/", async (req, res) => {
  const q = parseQuery(ListAttendanceLogsQuerySchema, req, res); if (!q) return;
  try {
    const c = [sql`coalesce(is_deleted, false) = false`];
    if (q.employee_id) c.push(sql`employee_id = ${q.employee_id}`);
    if (q.project_id) c.push(sql`project_id = ${q.project_id}`);
    if (q.approval_status) c.push(sql`approval_status = ${q.approval_status}`);
    if (q.work_date_from) c.push(sql`work_date >= ${q.work_date_from}`);
    if (q.work_date_to) c.push(sql`work_date <= ${q.work_date_to}`);
    const r = await runSafeList({
      table: "workforce.attendance", conditions: c,
      allowedOrderColumns: ATT_ALLOWED, fallbackColumn: "work_date",
      orderBy: q.order_by, orderDir: q.order_dir,
      limit: safeLimit(q.limit), offset: safeOffset(q.offset),
    });
    res.json(r);
  } catch (err) { sendDbError(res, err, "attendance:list"); }
});

router.get("/:id", async (req, res) => {
  const id = idFromParams(req, res); if (!id) return;
  try {
    const r = await db.execute(sql`
      select * from workforce.attendance where id = ${id} and coalesce(is_deleted,false)=false limit 1
    `);
    const row = (r.rows ?? [])[0];
    if (!row) return res.status(404).json({ error: "רישום נוכחות לא נמצא" });
    res.json(row);
  } catch (err) { sendDbError(res, err, "attendance:get"); }
});

router.post("/", async (req, res) => {
  const d = parseBody(CreateAttendanceLogSchema, req, res); if (!d) return;
  const uid = currentUserId(req);
  try {
    const r = await db.execute(sql`
      insert into workforce.attendance (
        attendance_number, employee_id, project_id, work_order_id, work_date,
        start_time, end_time, regular_hours, overtime_hours, source,
        approval_status, state, notes, metadata, created_by, updated_by, created_at, updated_at
      ) values (
        ${d.attendance_number ?? "AT-" + Date.now()}, ${d.employee_id},
        ${d.project_id ?? null}, ${d.work_order_id ?? null}, ${d.work_date},
        ${d.start_time ?? null}, ${d.end_time ?? null},
        ${d.regular_hours ?? 0}, ${d.overtime_hours ?? 0}, ${d.source ?? null},
        ${d.approval_status ?? "pending"}, ${d.state ?? "Submitted"},
        ${d.notes ?? null}, ${JSON.stringify(d.metadata ?? {})}::jsonb,
        ${uid}, ${uid}, now(), now()
      ) returning *
    `);
    const row = (r.rows ?? [])[0] as { id?: number } | undefined;
    if (row?.id) await logAudit({ user_id: uid, table_name: "workforce_attendance", record_id: row.id, action: "INSERT", new_values: { employee_id: d.employee_id, work_date: d.work_date }, ip_address: req.ip ?? null });
    res.status(201).json(row);
  } catch (err) { sendDbError(res, err, "attendance:create"); }
});

router.patch("/:id", async (req, res) => {
  const id = idFromParams(req, res); if (!id) return;
  const d = parseBody(UpdateAttendanceLogSchema, req, res); if (!d) return;
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
      update workforce.attendance set ${setClause}, updated_by = ${uid}, updated_at = now()
      where id = ${id} and coalesce(is_deleted,false) = false returning *
    `);
    const row = (r.rows ?? [])[0];
    if (!row) return res.status(404).json({ error: "רישום לא נמצא" });
    await logAudit({ user_id: uid, table_name: "workforce_attendance", record_id: id, action: "UPDATE", new_values: Object.fromEntries(entries), ip_address: req.ip ?? null });
    res.json(row);
  } catch (err) { sendDbError(res, err, "attendance:update"); }
});

router.delete("/:id", async (req, res) => {
  const id = idFromParams(req, res); if (!id) return;
  const uid = currentUserId(req);
  try {
    const r = await db.execute(sql`
      update workforce.attendance set is_deleted = true, updated_by = ${uid}, updated_at = now()
      where id = ${id} and coalesce(is_deleted,false) = false returning id
    `);
    if ((r.rows ?? []).length === 0) return res.status(404).json({ error: "רישום לא נמצא" });
    await logAudit({ user_id: uid, table_name: "workforce_attendance", record_id: id, action: "DELETE", ip_address: req.ip ?? null });
    res.status(204).send();
  } catch (err) { sendDbError(res, err, "attendance:delete"); }
});

// ───────────────── attendance_exceptions ─────────────────
router.get("/exceptions", async (req, res) => {
  const q = parseQuery(ListAttendanceExceptionsQuerySchema, req, res); if (!q) return;
  try {
    const c = [sql`coalesce(is_deleted, false) = false`];
    if (q.employee_id) c.push(sql`employee_id = ${q.employee_id}`);
    if (q.status) c.push(sql`status = ${q.status}`);
    if (q.exception_type) c.push(sql`exception_type = ${q.exception_type}`);
    const r = await runSafeList({
      table: "workforce.attendance_exceptions", conditions: c,
      allowedOrderColumns: EXC_ALLOWED, fallbackColumn: "exception_date",
      orderBy: q.order_by, orderDir: q.order_dir,
      limit: safeLimit(q.limit), offset: safeOffset(q.offset),
    });
    res.json(r);
  } catch (err) { sendDbError(res, err, "attendance-exceptions:list"); }
});

router.post("/exceptions", async (req, res) => {
  const d = parseBody(CreateAttendanceExceptionSchema, req, res); if (!d) return;
  const uid = currentUserId(req);
  try {
    const r = await db.execute(sql`
      insert into workforce.attendance_exceptions (
        exception_code, employee_id, attendance_id, exception_type, exception_date,
        description, status, notes, metadata, created_by, updated_by, created_at, updated_at
      ) values (
        ${d.exception_code ?? "AEX-" + Date.now()}, ${d.employee_id},
        ${d.attendance_id ?? null}, ${d.exception_type}, ${d.exception_date},
        ${d.description ?? null}, ${d.status ?? "pending"},
        ${d.notes ?? null}, ${JSON.stringify(d.metadata ?? {})}::jsonb,
        ${uid}, ${uid}, now(), now()
      ) returning *
    `);
    const row = (r.rows ?? [])[0] as { id?: number } | undefined;
    if (row?.id) await logAudit({ user_id: uid, table_name: "workforce_attendance_exceptions", record_id: row.id, action: "INSERT", new_values: { exception_type: d.exception_type, employee_id: d.employee_id }, ip_address: req.ip ?? null });
    res.status(201).json(row);
  } catch (err) { sendDbError(res, err, "attendance-exceptions:create"); }
});

router.post("/exceptions/:id/approve", hrManagerMiddleware, async (req, res) => {
  const id = idFromParams(req, res); if (!id) return;
  const d = parseBody(ApproveAttendanceExceptionSchema, req, res); if (!d) return;
  const uid = currentUserId(req);
  try {
    const r = await db.execute(sql`
      update workforce.attendance_exceptions
      set status = 'approved', reviewed_by = ${uid}, reviewed_at = now(),
          resolution = ${d.resolution ?? null}, updated_by = ${uid}, updated_at = now()
      where id = ${id} and status = 'pending' and coalesce(is_deleted,false) = false
      returning *
    `);
    const row = (r.rows ?? [])[0];
    if (!row) return res.status(404).json({ error: "חריג לא נמצא או שאינו ממתין" });
    await logAudit({ user_id: uid, table_name: "workforce_attendance_exceptions", record_id: id, action: "UPDATE", new_values: { status: "approved" }, ip_address: req.ip ?? null });
    res.json(row);
  } catch (err) { sendDbError(res, err, "attendance-exceptions:approve"); }
});

router.post("/exceptions/:id/reject", hrManagerMiddleware, async (req, res) => {
  const id = idFromParams(req, res); if (!id) return;
  const d = parseBody(RejectAttendanceExceptionSchema, req, res); if (!d) return;
  const uid = currentUserId(req);
  try {
    const r = await db.execute(sql`
      update workforce.attendance_exceptions
      set status = 'rejected', reviewed_by = ${uid}, reviewed_at = now(),
          resolution = ${d.resolution}, updated_by = ${uid}, updated_at = now()
      where id = ${id} and status = 'pending' and coalesce(is_deleted,false) = false
      returning *
    `);
    const row = (r.rows ?? [])[0];
    if (!row) return res.status(404).json({ error: "חריג לא נמצא או שאינו ממתין" });
    await logAudit({ user_id: uid, table_name: "workforce_attendance_exceptions", record_id: id, action: "UPDATE", new_values: { status: "rejected", reason: d.resolution }, ip_address: req.ip ?? null });
    res.json(row);
  } catch (err) { sendDbError(res, err, "attendance-exceptions:reject"); }
});

router.patch("/exceptions/:id", async (req, res) => {
  const id = idFromParams(req, res); if (!id) return;
  const d = parseBody(UpdateAttendanceExceptionSchema, req, res); if (!d) return;
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
      update workforce.attendance_exceptions set ${setClause}, updated_by = ${uid}, updated_at = now()
      where id = ${id} and coalesce(is_deleted,false) = false returning *
    `);
    const row = (r.rows ?? [])[0];
    if (!row) return res.status(404).json({ error: "חריג לא נמצא" });
    await logAudit({ user_id: uid, table_name: "workforce_attendance_exceptions", record_id: id, action: "UPDATE", new_values: Object.fromEntries(entries), ip_address: req.ip ?? null });
    res.json(row);
  } catch (err) { sendDbError(res, err, "attendance-exceptions:update"); }
});

export default router;
