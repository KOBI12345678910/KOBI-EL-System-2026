// workforce.payroll_runs — CRUD + business endpoints:
//   POST /:id/calculate   (compute from attendance + pay components)
//   POST /:id/approve     (hr_manager)
//   POST /:id/pay         (finance_manager)
//   POST /:id/close
import { Router } from "express";
import {
  CreatePayrollRunSchema, UpdatePayrollRunSchema, ListPayrollRunsQuerySchema,
  CalculatePayrollRunSchema, ApprovePayrollRunSchema, PayPayrollRunSchema, ClosePayrollRunSchema,
} from "@workspace/api-zod/workforce";
import {
  db, sql, authMiddleware, hrOrAdminMiddleware, hrManagerMiddleware, financeManagerMiddleware,
  parseBody, parseQuery, idFromParams, currentUserId, sendDbError,
  runSafeList, safeLimit, safeOffset,
} from "./_helpers";
import { logAudit } from "../../lib/audit-log";

const router = Router();
router.use(authMiddleware);
router.use(hrOrAdminMiddleware);

const ALLOWED = new Set([
  "id","payroll_run_number","payroll_period_start","payroll_period_end",
  "status","state","created_at","updated_at",
]);

router.get("/", async (req, res) => {
  const q = parseQuery(ListPayrollRunsQuerySchema, req, res); if (!q) return;
  try {
    const c = [sql`coalesce(is_deleted, false) = false`];
    if (q.employer_id) c.push(sql`employer_id = ${q.employer_id}`);
    if (q.status) c.push(sql`status = ${q.status}`);
    if (q.period_from) c.push(sql`payroll_period_start >= ${q.period_from}`);
    if (q.period_to) c.push(sql`payroll_period_end <= ${q.period_to}`);
    if (q.q) c.push(sql`payroll_run_number ILIKE ${"%" + q.q + "%"}`);
    const r = await runSafeList({
      table: "workforce.payroll_runs", conditions: c,
      allowedOrderColumns: ALLOWED, fallbackColumn: "payroll_period_start",
      orderBy: q.order_by, orderDir: q.order_dir,
      limit: safeLimit(q.limit), offset: safeOffset(q.offset),
    });
    res.json(r);
  } catch (err) { sendDbError(res, err, "payroll-runs:list"); }
});

router.get("/:id", async (req, res) => {
  const id = idFromParams(req, res); if (!id) return;
  try {
    const r = await db.execute(sql`
      select pr.*,
        (select count(*) from workforce.payroll_entries pe where pe.payroll_run_id = pr.id) as line_count,
        (select coalesce(sum(pe.gross_pay),0) from workforce.payroll_entries pe where pe.payroll_run_id = pr.id) as total_gross,
        (select coalesce(sum(pe.net_pay),0) from workforce.payroll_entries pe where pe.payroll_run_id = pr.id) as total_net,
        (select count(*) from workforce.payroll_exceptions px
         where px.payroll_run_id = pr.id and px.state = 'Open') as open_exceptions
      from workforce.payroll_runs pr
      where pr.id = ${id} and coalesce(pr.is_deleted,false) = false
      limit 1
    `);
    const row = (r.rows ?? [])[0];
    if (!row) return res.status(404).json({ error: "ריצת שכר לא נמצאה" });
    res.json(row);
  } catch (err) { sendDbError(res, err, "payroll-runs:get"); }
});

router.post("/", async (req, res) => {
  const d = parseBody(CreatePayrollRunSchema, req, res); if (!d) return;
  const uid = currentUserId(req);
  try {
    const r = await db.execute(sql`
      insert into workforce.payroll_runs (
        payroll_run_number, payroll_period_start, payroll_period_end, employer_id,
        status, state, notes, metadata, created_by, updated_by, created_at, updated_at
      ) values (
        ${d.payroll_run_number ?? "PR-" + Date.now()},
        ${d.payroll_period_start}, ${d.payroll_period_end},
        ${d.employer_id ?? null}, ${d.status ?? "draft"}, ${"Draft"},
        ${d.notes ?? null}, ${JSON.stringify(d.metadata ?? {})}::jsonb,
        ${uid}, ${uid}, now(), now()
      ) returning *
    `);
    const row = (r.rows ?? [])[0] as { id?: number } | undefined;
    if (row?.id) await logAudit({ user_id: uid, table_name: "workforce_payroll_runs", record_id: row.id, action: "INSERT", new_values: { period: `${d.payroll_period_start}..${d.payroll_period_end}` }, ip_address: req.ip ?? null });
    res.status(201).json(row);
  } catch (err) { sendDbError(res, err, "payroll-runs:create"); }
});

// Calculate: compute payroll entries from attendance + employee_pay_components for the period.
router.post("/:id/calculate", hrManagerMiddleware, async (req, res) => {
  const id = idFromParams(req, res); if (!id) return;
  const d = parseBody(CalculatePayrollRunSchema, req, res); if (!d) return;
  const uid = currentUserId(req);
  try {
    const runRes = await db.execute(sql`
      select id, payroll_period_start, payroll_period_end, employer_id, status
      from workforce.payroll_runs
      where id = ${id} and coalesce(is_deleted,false)=false
      limit 1
    `);
    const run = (runRes.rows ?? [])[0] as
      | { id: number; payroll_period_start: string; payroll_period_end: string; employer_id: number | null; status: string }
      | undefined;
    if (!run) return res.status(404).json({ error: "ריצת שכר לא נמצאה" });
    if (!["draft","in_progress"].includes(run.status)) {
      return res.status(400).json({ error: "לא ניתן לחשב ריצה שאושרה כבר" });
    }

    if (d.recompute) {
      await db.execute(sql`delete from workforce.payroll_entries where payroll_run_id = ${id}`);
    }

    // Aggregate attendance per employee over the period.
    await db.execute(sql`
      insert into workforce.payroll_entries (
        payroll_run_id, employee_id, gross_pay, deductions, net_pay, pension_total,
        overtime_pay, attendance_hours, expense_reimbursements, state, metadata, created_at, updated_at
      )
      select
        ${id} as payroll_run_id,
        e.id as employee_id,
        coalesce(sum(a.regular_hours) * coalesce(e.hourly_rate,0),0)
          + coalesce(sum(a.overtime_hours) * coalesce(e.hourly_rate,0) * 1.25, 0)
          + coalesce(e.salary_base, 0) as gross_pay,
        0 as deductions,
        coalesce(sum(a.regular_hours) * coalesce(e.hourly_rate,0),0)
          + coalesce(sum(a.overtime_hours) * coalesce(e.hourly_rate,0) * 1.25, 0)
          + coalesce(e.salary_base, 0) as net_pay,
        0 as pension_total,
        coalesce(sum(a.overtime_hours) * coalesce(e.hourly_rate,0) * 1.25, 0) as overtime_pay,
        coalesce(sum(a.regular_hours + a.overtime_hours), 0) as attendance_hours,
        0 as expense_reimbursements,
        'Calculated' as state,
        '{}'::jsonb as metadata,
        now(), now()
      from workforce.employees e
      left join workforce.attendance a on a.employee_id = e.id
        and a.work_date between ${run.payroll_period_start} and ${run.payroll_period_end}
        and coalesce(a.is_deleted,false) = false
        and a.approval_status = 'approved'
      where coalesce(e.is_deleted, false) = false
        and coalesce(e.is_active, true) = true
        ${run.employer_id ? sql`and e.employer_id = ${run.employer_id}` : sql``}
      group by e.id, e.hourly_rate, e.salary_base
      on conflict (payroll_run_id, employee_id) do nothing
    `);

    const upd = await db.execute(sql`
      update workforce.payroll_runs
      set status = 'in_progress', state = 'Calculated',
          calculated_at = now(), updated_by = ${uid}, updated_at = now()
      where id = ${id} returning *
    `);
    await logAudit({ user_id: uid, table_name: "workforce_payroll_runs", record_id: id, action: "UPDATE", new_values: { status: "in_progress", calculated: true }, ip_address: req.ip ?? null });
    res.json((upd.rows ?? [])[0]);
  } catch (err) { sendDbError(res, err, "payroll-runs:calculate"); }
});

router.post("/:id/approve", hrManagerMiddleware, async (req, res) => {
  const id = idFromParams(req, res); if (!id) return;
  const d = parseBody(ApprovePayrollRunSchema, req, res); if (!d) return;
  const uid = currentUserId(req);
  try {
    const r = await db.execute(sql`
      update workforce.payroll_runs
      set status = 'approved', state = 'Approved',
          approved_by = ${uid}, approved_at = now(),
          notes = coalesce(${d.approval_notes ?? null}, notes),
          updated_by = ${uid}, updated_at = now()
      where id = ${id} and status = 'in_progress' and coalesce(is_deleted,false)=false
      returning *
    `);
    const row = (r.rows ?? [])[0];
    if (!row) return res.status(400).json({ error: "ניתן לאשר רק ריצה בסטטוס 'בעיבוד'" });
    await logAudit({ user_id: uid, table_name: "workforce_payroll_runs", record_id: id, action: "UPDATE", new_values: { status: "approved" }, ip_address: req.ip ?? null });
    res.json(row);
  } catch (err) { sendDbError(res, err, "payroll-runs:approve"); }
});

router.post("/:id/pay", financeManagerMiddleware, async (req, res) => {
  const id = idFromParams(req, res); if (!id) return;
  const d = parseBody(PayPayrollRunSchema, req, res); if (!d) return;
  const uid = currentUserId(req);
  try {
    const r = await db.execute(sql`
      update workforce.payroll_runs
      set status = 'paid', state = 'Paid',
          paid_at = coalesce(${d.paid_at ?? null}::timestamptz, now()),
          metadata = metadata || jsonb_build_object('payment_reference', ${d.payment_reference ?? null}),
          updated_by = ${uid}, updated_at = now()
      where id = ${id} and status = 'approved' and coalesce(is_deleted,false)=false
      returning *
    `);
    const row = (r.rows ?? [])[0];
    if (!row) return res.status(400).json({ error: "ניתן לשלם רק ריצה מאושרת" });
    await logAudit({ user_id: uid, table_name: "workforce_payroll_runs", record_id: id, action: "UPDATE", new_values: { status: "paid", payment_reference: d.payment_reference }, ip_address: req.ip ?? null });
    res.json(row);
  } catch (err) { sendDbError(res, err, "payroll-runs:pay"); }
});

router.post("/:id/close", hrManagerMiddleware, async (req, res) => {
  const id = idFromParams(req, res); if (!id) return;
  const d = parseBody(ClosePayrollRunSchema, req, res); if (!d) return;
  const uid = currentUserId(req);
  try {
    const r = await db.execute(sql`
      update workforce.payroll_runs
      set status = 'closed', state = 'Closed',
          notes = coalesce(${d.closure_notes ?? null}, notes),
          updated_by = ${uid}, updated_at = now()
      where id = ${id} and status in ('paid','approved') and coalesce(is_deleted,false)=false
      returning *
    `);
    const row = (r.rows ?? [])[0];
    if (!row) return res.status(400).json({ error: "ניתן לסגור רק ריצה ששולמה/מאושרת" });
    await logAudit({ user_id: uid, table_name: "workforce_payroll_runs", record_id: id, action: "UPDATE", new_values: { status: "closed" }, ip_address: req.ip ?? null });
    res.json(row);
  } catch (err) { sendDbError(res, err, "payroll-runs:close"); }
});

router.patch("/:id", async (req, res) => {
  const id = idFromParams(req, res); if (!id) return;
  const d = parseBody(UpdatePayrollRunSchema, req, res); if (!d) return;
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
      update workforce.payroll_runs set ${setClause}, updated_by = ${uid}, updated_at = now()
      where id = ${id} and status in ('draft','in_progress') and coalesce(is_deleted,false)=false
      returning *
    `);
    const row = (r.rows ?? [])[0];
    if (!row) return res.status(400).json({ error: "ניתן לעדכן רק ריצה בטיוטה/בעיבוד" });
    await logAudit({ user_id: uid, table_name: "workforce_payroll_runs", record_id: id, action: "UPDATE", new_values: Object.fromEntries(entries), ip_address: req.ip ?? null });
    res.json(row);
  } catch (err) { sendDbError(res, err, "payroll-runs:update"); }
});

router.delete("/:id", async (req, res) => {
  const id = idFromParams(req, res); if (!id) return;
  const uid = currentUserId(req);
  try {
    const r = await db.execute(sql`
      update workforce.payroll_runs set is_deleted = true, updated_by = ${uid}, updated_at = now()
      where id = ${id} and status = 'draft' and coalesce(is_deleted,false)=false returning id
    `);
    if ((r.rows ?? []).length === 0) return res.status(400).json({ error: "ניתן למחוק רק ריצת טיוטה" });
    await logAudit({ user_id: uid, table_name: "workforce_payroll_runs", record_id: id, action: "DELETE", ip_address: req.ip ?? null });
    res.status(204).send();
  } catch (err) { sendDbError(res, err, "payroll-runs:delete"); }
});

export default router;
