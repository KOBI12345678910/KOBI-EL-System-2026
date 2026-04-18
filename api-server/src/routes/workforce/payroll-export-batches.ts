// workforce.payroll_export_batches — generate file for bank / authorities
import { Router } from "express";
import {
  CreatePayrollExportBatchSchema, UpdatePayrollExportBatchSchema,
  ListPayrollExportBatchesQuerySchema,
} from "@workspace/api-zod/workforce";
import {
  db, sql, authMiddleware, hrOrAdminMiddleware, financeManagerMiddleware,
  parseBody, parseQuery, idFromParams, currentUserId, sendDbError,
  runSafeList, safeLimit, safeOffset,
} from "./_helpers";
import { logAudit } from "../../lib/audit-log";

const router = Router();
router.use(authMiddleware);
router.use(hrOrAdminMiddleware);

const ALLOWED = new Set(["id","batch_number","payroll_run_id","generated_at","status","created_at","updated_at"]);

router.get("/", async (req, res) => {
  const q = parseQuery(ListPayrollExportBatchesQuerySchema, req, res); if (!q) return;
  try {
    const c = [sql`coalesce(is_deleted, false) = false`];
    if (q.payroll_run_id) c.push(sql`payroll_run_id = ${q.payroll_run_id}`);
    if (q.status) c.push(sql`status = ${q.status}`);
    if (q.export_type) c.push(sql`export_type = ${q.export_type}`);
    if (q.q) c.push(sql`batch_number ILIKE ${"%" + q.q + "%"}`);
    const r = await runSafeList({
      table: "workforce.payroll_export_batches", conditions: c,
      allowedOrderColumns: ALLOWED, fallbackColumn: "generated_at",
      orderBy: q.order_by, orderDir: q.order_dir,
      limit: safeLimit(q.limit), offset: safeOffset(q.offset),
    });
    res.json(r);
  } catch (err) { sendDbError(res, err, "payroll-export-batches:list"); }
});

router.get("/:id", async (req, res) => {
  const id = idFromParams(req, res); if (!id) return;
  try {
    const r = await db.execute(sql`
      select peb.*, pr.payroll_run_number
      from workforce.payroll_export_batches peb
      left join workforce.payroll_runs pr on pr.id = peb.payroll_run_id
      where peb.id = ${id} and coalesce(peb.is_deleted,false)=false limit 1
    `);
    const row = (r.rows ?? [])[0];
    if (!row) return res.status(404).json({ error: "אצווה לא נמצאה" });
    res.json(row);
  } catch (err) { sendDbError(res, err, "payroll-export-batches:get"); }
});

// Generate export file — requires finance manager role.
router.post("/", financeManagerMiddleware, async (req, res) => {
  const d = parseBody(CreatePayrollExportBatchSchema, req, res); if (!d) return;
  const uid = currentUserId(req);
  try {
    // Count lines in the referenced payroll run for row_count.
    const cnt = await db.execute(sql`
      select count(*)::bigint as n from workforce.payroll_entries
      where payroll_run_id = ${d.payroll_run_id}
        and coalesce(is_deleted,false) = false
    `);
    const rowCount = Number((cnt.rows?.[0] as { n?: number | string } | undefined)?.n ?? d.row_count ?? 0);

    const r = await db.execute(sql`
      insert into workforce.payroll_export_batches (
        batch_number, payroll_run_id, export_type, file_reference, row_count,
        status, exported_by_user_id, notes, metadata, created_by, updated_by, created_at, updated_at, generated_at
      ) values (
        ${d.batch_number ?? "PEB-" + Date.now()}, ${d.payroll_run_id}, ${d.export_type},
        ${d.file_reference ?? null}, ${rowCount},
        ${d.status ?? "Generated"}, ${uid},
        ${d.notes ?? null}, ${JSON.stringify(d.metadata ?? {})}::jsonb,
        ${uid}, ${uid}, now(), now(), now()
      ) returning *
    `);
    const row = (r.rows ?? [])[0] as { id?: number } | undefined;
    if (row?.id) await logAudit({ user_id: uid, table_name: "workforce_payroll_export_batches", record_id: row.id, action: "INSERT", new_values: { payroll_run_id: d.payroll_run_id, export_type: d.export_type, row_count: rowCount }, ip_address: req.ip ?? null });
    res.status(201).json(row);
  } catch (err) { sendDbError(res, err, "payroll-export-batches:create"); }
});

router.patch("/:id", async (req, res) => {
  const id = idFromParams(req, res); if (!id) return;
  const d = parseBody(UpdatePayrollExportBatchSchema, req, res); if (!d) return;
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
      update workforce.payroll_export_batches set ${setClause}, updated_by = ${uid}, updated_at = now()
      where id = ${id} and coalesce(is_deleted,false)=false returning *
    `);
    const row = (r.rows ?? [])[0];
    if (!row) return res.status(404).json({ error: "אצווה לא נמצאה" });
    await logAudit({ user_id: uid, table_name: "workforce_payroll_export_batches", record_id: id, action: "UPDATE", new_values: Object.fromEntries(entries), ip_address: req.ip ?? null });
    res.json(row);
  } catch (err) { sendDbError(res, err, "payroll-export-batches:update"); }
});

export default router;
