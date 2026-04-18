// workforce.payroll_exceptions
import { Router } from "express";
import {
  CreatePayrollExceptionSchema, UpdatePayrollExceptionSchema, ListPayrollExceptionsQuerySchema,
} from "@workspace/api-zod/workforce";
import {
  db, sql, authMiddleware, hrOrAdminMiddleware,
  parseBody, parseQuery, idFromParams, currentUserId, sendDbError,
  runSafeList, safeLimit, safeOffset,
} from "./_helpers";
import { logAudit } from "../../lib/audit-log";

const router = Router();
router.use(authMiddleware);
router.use(hrOrAdminMiddleware);

const ALLOWED = new Set(["id","payroll_run_id","employee_id","state","severity","detected_at","created_at","updated_at"]);

router.get("/", async (req, res) => {
  const q = parseQuery(ListPayrollExceptionsQuerySchema, req, res); if (!q) return;
  try {
    const c = [sql`coalesce(is_deleted, false) = false`];
    if (q.payroll_run_id) c.push(sql`payroll_run_id = ${q.payroll_run_id}`);
    if (q.employee_id) c.push(sql`employee_id = ${q.employee_id}`);
    if (q.state) c.push(sql`state = ${q.state}`);
    if (q.severity) c.push(sql`severity = ${q.severity}`);
    const r = await runSafeList({
      table: "workforce.payroll_exceptions", conditions: c,
      allowedOrderColumns: ALLOWED, fallbackColumn: "detected_at",
      orderBy: q.order_by, orderDir: q.order_dir,
      limit: safeLimit(q.limit), offset: safeOffset(q.offset),
    });
    res.json(r);
  } catch (err) { sendDbError(res, err, "payroll-exceptions:list"); }
});

router.get("/:id", async (req, res) => {
  const id = idFromParams(req, res); if (!id) return;
  try {
    const r = await db.execute(sql`
      select * from workforce.payroll_exceptions where id = ${id} and coalesce(is_deleted,false)=false limit 1
    `);
    const row = (r.rows ?? [])[0];
    if (!row) return res.status(404).json({ error: "חריג לא נמצא" });
    res.json(row);
  } catch (err) { sendDbError(res, err, "payroll-exceptions:get"); }
});

router.post("/", async (req, res) => {
  const d = parseBody(CreatePayrollExceptionSchema, req, res); if (!d) return;
  const uid = currentUserId(req);
  try {
    const r = await db.execute(sql`
      insert into workforce.payroll_exceptions (
        payroll_run_id, employee_id, exception_type, severity, description, state,
        notes, metadata, created_by, updated_by, created_at, updated_at
      ) values (
        ${d.payroll_run_id}, ${d.employee_id ?? null}, ${d.exception_type},
        ${d.severity ?? "medium"}, ${d.description}, ${d.state ?? "Open"},
        ${d.notes ?? null}, ${JSON.stringify(d.metadata ?? {})}::jsonb,
        ${uid}, ${uid}, now(), now()
      ) returning *
    `);
    const row = (r.rows ?? [])[0] as { id?: number } | undefined;
    if (row?.id) await logAudit({ user_id: uid, table_name: "workforce_payroll_exceptions", record_id: row.id, action: "INSERT", new_values: { exception_type: d.exception_type }, ip_address: req.ip ?? null });
    res.status(201).json(row);
  } catch (err) { sendDbError(res, err, "payroll-exceptions:create"); }
});

router.post("/:id/resolve", async (req, res) => {
  const id = idFromParams(req, res); if (!id) return;
  const uid = currentUserId(req);
  try {
    const r = await db.execute(sql`
      update workforce.payroll_exceptions set state = 'Resolved', resolved_at = now(),
        owner_user_id = ${uid}, updated_by = ${uid}, updated_at = now()
      where id = ${id} and state = 'Open' and coalesce(is_deleted,false)=false
      returning *
    `);
    const row = (r.rows ?? [])[0];
    if (!row) return res.status(404).json({ error: "חריג לא נמצא או שאינו פתוח" });
    await logAudit({ user_id: uid, table_name: "workforce_payroll_exceptions", record_id: id, action: "UPDATE", new_values: { state: "Resolved" }, ip_address: req.ip ?? null });
    res.json(row);
  } catch (err) { sendDbError(res, err, "payroll-exceptions:resolve"); }
});

router.patch("/:id", async (req, res) => {
  const id = idFromParams(req, res); if (!id) return;
  const d = parseBody(UpdatePayrollExceptionSchema, req, res); if (!d) return;
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
      update workforce.payroll_exceptions set ${setClause}, updated_by = ${uid}, updated_at = now()
      where id = ${id} and coalesce(is_deleted,false)=false returning *
    `);
    const row = (r.rows ?? [])[0];
    if (!row) return res.status(404).json({ error: "חריג לא נמצא" });
    await logAudit({ user_id: uid, table_name: "workforce_payroll_exceptions", record_id: id, action: "UPDATE", new_values: Object.fromEntries(entries), ip_address: req.ip ?? null });
    res.json(row);
  } catch (err) { sendDbError(res, err, "payroll-exceptions:update"); }
});

export default router;
