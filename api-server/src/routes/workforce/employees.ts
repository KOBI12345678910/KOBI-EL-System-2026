// ============================================================
// workforce.employees — HR-sensitive CRUD.
// RLS: self-only for regular users (enforced at app layer via
// hrOrAdminMiddleware); HR managers and admins see all.
// ============================================================
import { Router } from "express";
import {
  CreateEmployeeSchema, UpdateEmployeeSchema, ListEmployeesQuerySchema,
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

const ALLOWED = new Set([
  "id", "employee_number", "full_name", "department", "role_title",
  "status", "start_date", "end_date", "created_at", "updated_at",
]);

router.get("/", async (req, res) => {
  const q = parseQuery(ListEmployeesQuerySchema, req, res); if (!q) return;
  try {
    const c = [sql`coalesce(is_deleted, false) = false`];
    if (q.is_active !== undefined) c.push(sql`is_active = ${q.is_active}`);
    if (q.employer_id) c.push(sql`employer_id = ${q.employer_id}`);
    if (q.status) c.push(sql`status = ${q.status}`);
    if (q.department) c.push(sql`department = ${q.department}`);
    if (q.q) c.push(sql`(full_name ILIKE ${"%" + q.q + "%"} OR employee_number ILIKE ${"%" + q.q + "%"} OR email ILIKE ${"%" + q.q + "%"})`);

    const r = await runSafeList({
      table: "workforce.employees",
      conditions: c,
      allowedOrderColumns: ALLOWED,
      fallbackColumn: "id",
      orderBy: q.order_by, orderDir: q.order_dir,
      limit: safeLimit(q.limit), offset: safeOffset(q.offset),
    });
    res.json(r);
  } catch (err) { sendDbError(res, err, "employees:list"); }
});

router.get("/:id", async (req, res) => {
  const id = idFromParams(req, res); if (!id) return;
  try {
    const r = await db.execute(sql`
      select e.*, emp.legal_name as employer_name
      from workforce.employees e
      left join workforce.employers emp on emp.id = e.employer_id
      where e.id = ${id} and coalesce(e.is_deleted, false) = false
      limit 1
    `);
    const row = (r.rows ?? [])[0];
    if (!row) return res.status(404).json({ error: "עובד לא נמצא" });
    res.json(row);
  } catch (err) { sendDbError(res, err, "employees:get"); }
});

// Self-service: employee's own wage-slips history
router.get("/:id/wage-slips-history", async (req, res) => {
  const id = idFromParams(req, res); if (!id) return;
  try {
    const r = await db.execute(sql`
      select ws.*
      from workforce.wage_slips ws
      where ws.employee_id = ${id}
        and coalesce(ws.is_deleted, false) = false
      order by ws.slip_date desc
      limit 200
    `);
    res.json({ data: r.rows ?? [] });
  } catch (err) { sendDbError(res, err, "employees:wage-slips-history"); }
});

router.post("/", async (req, res) => {
  const d = parseBody(CreateEmployeeSchema, req, res); if (!d) return;
  const uid = currentUserId(req);
  try {
    const r = await db.execute(sql`
      insert into workforce.employees (
        employee_number, full_name, employer_id, phone, email,
        role_title, department, employment_type, hourly_rate, salary_base,
        status, start_date, end_date, national_id, bank_account_reference,
        notes, metadata, created_by, updated_by, created_at, updated_at
      ) values (
        ${d.employee_number}, ${d.full_name}, ${d.employer_id},
        ${d.phone ?? null}, ${d.email ?? null},
        ${d.role_title ?? null}, ${d.department ?? null}, ${d.employment_type ?? null},
        ${d.hourly_rate ?? null}, ${d.salary_base ?? null},
        ${d.status ?? "Active"}, ${d.start_date ?? null}, ${d.end_date ?? null},
        ${d.national_id ?? null}, ${d.bank_account_reference ?? null},
        ${d.notes ?? null}, ${JSON.stringify(d.metadata ?? {})}::jsonb,
        ${uid}, ${uid}, now(), now()
      ) returning *
    `);
    const row = (r.rows ?? [])[0] as { id?: number } | undefined;
    if (row?.id) {
      await logAudit({
        user_id: uid, table_name: "workforce_employees", record_id: row.id,
        action: "INSERT", new_values: { employee_number: d.employee_number, full_name: d.full_name },
        ip_address: req.ip ?? null,
      });
    }
    res.status(201).json(row);
  } catch (err) { sendDbError(res, err, "employees:create"); }
});

router.patch("/:id", async (req, res) => {
  const id = idFromParams(req, res); if (!id) return;
  const d = parseBody(UpdateEmployeeSchema, req, res); if (!d) return;
  const uid = currentUserId(req);
  const entries = Object.entries(d).filter(([, v]) => v !== undefined);
  if (entries.length === 0) return res.status(400).json({ error: "אין שינויים לעדכון" });
  try {
    const fragments = entries.map(([k, v]) =>
      k === "metadata"
        ? sql`${sql.raw(k)} = ${JSON.stringify(v ?? {})}::jsonb`
        : sql`${sql.raw(k)} = ${v as string | number | boolean | null}`
    );
    let setClause = fragments[0];
    for (let i = 1; i < fragments.length; i++) setClause = sql`${setClause}, ${fragments[i]}`;
    const r = await db.execute(sql`
      update workforce.employees
      set ${setClause}, updated_by = ${uid}, updated_at = now()
      where id = ${id} and coalesce(is_deleted, false) = false
      returning *
    `);
    const row = (r.rows ?? [])[0];
    if (!row) return res.status(404).json({ error: "עובד לא נמצא" });
    await logAudit({
      user_id: uid, table_name: "workforce_employees", record_id: id,
      action: "UPDATE", new_values: Object.fromEntries(entries),
      ip_address: req.ip ?? null,
    });
    res.json(row);
  } catch (err) { sendDbError(res, err, "employees:update"); }
});

router.delete("/:id", async (req, res) => {
  const id = idFromParams(req, res); if (!id) return;
  const uid = currentUserId(req);
  try {
    const r = await db.execute(sql`
      update workforce.employees
      set is_deleted = true, is_active = false, updated_by = ${uid}, updated_at = now()
      where id = ${id} and coalesce(is_deleted, false) = false
      returning id
    `);
    if ((r.rows ?? []).length === 0) return res.status(404).json({ error: "עובד לא נמצא" });
    await logAudit({
      user_id: uid, table_name: "workforce_employees", record_id: id,
      action: "DELETE", ip_address: req.ip ?? null, notes: "soft delete",
    });
    res.status(204).send();
  } catch (err) { sendDbError(res, err, "employees:delete"); }
});

export default router;
