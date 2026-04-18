// workforce.pension_records — highly sensitive
import { Router } from "express";
import {
  CreatePensionRecordSchema, UpdatePensionRecordSchema, ListPensionRecordsQuerySchema,
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

const ALLOWED = new Set(["id","employee_id","contribution_date","created_at","updated_at"]);

router.get("/", async (req, res) => {
  const q = parseQuery(ListPensionRecordsQuerySchema, req, res); if (!q) return;
  try {
    const c = [sql`coalesce(is_deleted, false) = false`];
    if (q.employee_id) c.push(sql`employee_id = ${q.employee_id}`);
    if (q.fund_reference) c.push(sql`fund_reference = ${q.fund_reference}`);
    if (q.contribution_date_from) c.push(sql`contribution_date >= ${q.contribution_date_from}`);
    if (q.contribution_date_to) c.push(sql`contribution_date <= ${q.contribution_date_to}`);
    const r = await runSafeList({
      table: "workforce.pension_records", conditions: c,
      allowedOrderColumns: ALLOWED, fallbackColumn: "contribution_date",
      orderBy: q.order_by, orderDir: q.order_dir,
      limit: safeLimit(q.limit), offset: safeOffset(q.offset),
    });
    res.json(r);
  } catch (err) { sendDbError(res, err, "pension-records:list"); }
});

router.get("/:id", async (req, res) => {
  const id = idFromParams(req, res); if (!id) return;
  try {
    const r = await db.execute(sql`
      select * from workforce.pension_records where id = ${id} and coalesce(is_deleted,false)=false limit 1
    `);
    const row = (r.rows ?? [])[0];
    if (!row) return res.status(404).json({ error: "רשומת פנסיה לא נמצאה" });
    res.json(row);
  } catch (err) { sendDbError(res, err, "pension-records:get"); }
});

router.post("/", async (req, res) => {
  const d = parseBody(CreatePensionRecordSchema, req, res); if (!d) return;
  const uid = currentUserId(req);
  try {
    const r = await db.execute(sql`
      insert into workforce.pension_records (
        payroll_entry_id, employee_id, contribution_date,
        employee_contribution, employer_contribution, fund_reference,
        notes, metadata, created_by, updated_by, created_at, updated_at
      ) values (
        ${d.payroll_entry_id ?? null}, ${d.employee_id}, ${d.contribution_date},
        ${d.employee_contribution ?? 0}, ${d.employer_contribution ?? 0},
        ${d.fund_reference ?? null},
        ${d.notes ?? null}, ${JSON.stringify(d.metadata ?? {})}::jsonb,
        ${uid}, ${uid}, now(), now()
      ) returning *
    `);
    const row = (r.rows ?? [])[0] as { id?: number } | undefined;
    if (row?.id) await logAudit({ user_id: uid, table_name: "workforce_pension_records", record_id: row.id, action: "INSERT", new_values: { employee_id: d.employee_id, contribution_date: d.contribution_date }, ip_address: req.ip ?? null });
    res.status(201).json(row);
  } catch (err) { sendDbError(res, err, "pension-records:create"); }
});

router.patch("/:id", async (req, res) => {
  const id = idFromParams(req, res); if (!id) return;
  const d = parseBody(UpdatePensionRecordSchema, req, res); if (!d) return;
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
      update workforce.pension_records set ${setClause}, updated_by = ${uid}, updated_at = now()
      where id = ${id} and coalesce(is_deleted,false)=false returning *
    `);
    const row = (r.rows ?? [])[0];
    if (!row) return res.status(404).json({ error: "רשומה לא נמצאה" });
    await logAudit({ user_id: uid, table_name: "workforce_pension_records", record_id: id, action: "UPDATE", new_values: Object.fromEntries(entries), ip_address: req.ip ?? null });
    res.json(row);
  } catch (err) { sendDbError(res, err, "pension-records:update"); }
});

router.delete("/:id", async (req, res) => {
  const id = idFromParams(req, res); if (!id) return;
  const uid = currentUserId(req);
  try {
    const r = await db.execute(sql`
      update workforce.pension_records set is_deleted = true,
        updated_by = ${uid}, updated_at = now()
      where id = ${id} and coalesce(is_deleted,false)=false returning id
    `);
    if ((r.rows ?? []).length === 0) return res.status(404).json({ error: "רשומה לא נמצאה" });
    await logAudit({ user_id: uid, table_name: "workforce_pension_records", record_id: id, action: "DELETE", ip_address: req.ip ?? null });
    res.status(204).send();
  } catch (err) { sendDbError(res, err, "pension-records:delete"); }
});

export default router;
