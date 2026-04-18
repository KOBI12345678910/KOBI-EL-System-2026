// workforce.payroll_entries (aliased as payroll_line_items)
import { Router } from "express";
import {
  CreatePayrollLineItemSchema, UpdatePayrollLineItemSchema, ListPayrollLineItemsQuerySchema,
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

const ALLOWED = new Set(["id","payroll_run_id","employee_id","gross_pay","net_pay","state","created_at","updated_at"]);

router.get("/", async (req, res) => {
  const q = parseQuery(ListPayrollLineItemsQuerySchema, req, res); if (!q) return;
  try {
    const c = [sql`coalesce(is_deleted, false) = false`];
    if (q.payroll_run_id) c.push(sql`payroll_run_id = ${q.payroll_run_id}`);
    if (q.employee_id) c.push(sql`employee_id = ${q.employee_id}`);
    const r = await runSafeList({
      table: "workforce.payroll_entries", conditions: c,
      allowedOrderColumns: ALLOWED, fallbackColumn: "id",
      orderBy: q.order_by, orderDir: q.order_dir,
      limit: safeLimit(q.limit), offset: safeOffset(q.offset),
    });
    res.json(r);
  } catch (err) { sendDbError(res, err, "payroll-line-items:list"); }
});

router.get("/:id", async (req, res) => {
  const id = idFromParams(req, res); if (!id) return;
  try {
    const r = await db.execute(sql`
      select pe.*, e.employee_number, e.full_name
      from workforce.payroll_entries pe
      left join workforce.employees e on e.id = pe.employee_id
      where pe.id = ${id} and coalesce(pe.is_deleted,false) = false limit 1
    `);
    const row = (r.rows ?? [])[0];
    if (!row) return res.status(404).json({ error: "שורת שכר לא נמצאה" });
    res.json(row);
  } catch (err) { sendDbError(res, err, "payroll-line-items:get"); }
});

router.post("/", async (req, res) => {
  const d = parseBody(CreatePayrollLineItemSchema, req, res); if (!d) return;
  const uid = currentUserId(req);
  try {
    const r = await db.execute(sql`
      insert into workforce.payroll_entries (
        payroll_run_id, employee_id, gross_pay, deductions, net_pay, pension_total,
        overtime_pay, attendance_hours, expense_reimbursements, state, notes, metadata,
        created_by, updated_by, created_at, updated_at
      ) values (
        ${d.payroll_run_id}, ${d.employee_id},
        ${d.gross_pay ?? 0}, ${d.deductions ?? 0}, ${d.net_pay ?? 0}, ${d.pension_total ?? 0},
        ${d.overtime_pay ?? 0}, ${d.attendance_hours ?? 0}, ${d.expense_reimbursements ?? 0},
        ${d.state ?? "Calculated"}, ${d.notes ?? null}, ${JSON.stringify(d.metadata ?? {})}::jsonb,
        ${uid}, ${uid}, now(), now()
      ) returning *
    `);
    const row = (r.rows ?? [])[0] as { id?: number } | undefined;
    if (row?.id) await logAudit({ user_id: uid, table_name: "workforce_payroll_entries", record_id: row.id, action: "INSERT", new_values: { payroll_run_id: d.payroll_run_id, employee_id: d.employee_id }, ip_address: req.ip ?? null });
    res.status(201).json(row);
  } catch (err) { sendDbError(res, err, "payroll-line-items:create"); }
});

router.patch("/:id", async (req, res) => {
  const id = idFromParams(req, res); if (!id) return;
  const d = parseBody(UpdatePayrollLineItemSchema, req, res); if (!d) return;
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
      update workforce.payroll_entries set ${setClause}, updated_by = ${uid}, updated_at = now()
      where id = ${id} and coalesce(is_deleted,false)=false returning *
    `);
    const row = (r.rows ?? [])[0];
    if (!row) return res.status(404).json({ error: "שורת שכר לא נמצאה" });
    await logAudit({ user_id: uid, table_name: "workforce_payroll_entries", record_id: id, action: "UPDATE", new_values: Object.fromEntries(entries), ip_address: req.ip ?? null });
    res.json(row);
  } catch (err) { sendDbError(res, err, "payroll-line-items:update"); }
});

router.delete("/:id", async (req, res) => {
  const id = idFromParams(req, res); if (!id) return;
  const uid = currentUserId(req);
  try {
    const r = await db.execute(sql`
      update workforce.payroll_entries set is_deleted = true, updated_by = ${uid}, updated_at = now()
      where id = ${id} and coalesce(is_deleted,false)=false returning id
    `);
    if ((r.rows ?? []).length === 0) return res.status(404).json({ error: "שורה לא נמצאה" });
    await logAudit({ user_id: uid, table_name: "workforce_payroll_entries", record_id: id, action: "DELETE", ip_address: req.ip ?? null });
    res.status(204).send();
  } catch (err) { sendDbError(res, err, "payroll-line-items:delete"); }
});

export default router;
