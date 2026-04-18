// workforce.shifts
import { Router } from "express";
import {
  CreateShiftSchema, UpdateShiftSchema, ListShiftsQuerySchema,
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

const ALLOWED = new Set(["id","employee_id","shift_start","shift_end","state","created_at","updated_at"]);

router.get("/", async (req, res) => {
  const q = parseQuery(ListShiftsQuerySchema, req, res); if (!q) return;
  try {
    const c = [sql`coalesce(is_deleted, false) = false`];
    if (q.employee_id) c.push(sql`employee_id = ${q.employee_id}`);
    if (q.project_id) c.push(sql`project_id = ${q.project_id}`);
    if (q.state) c.push(sql`state = ${q.state}`);
    if (q.shift_date_from) c.push(sql`shift_start >= ${q.shift_date_from}`);
    if (q.shift_date_to) c.push(sql`shift_start <= ${q.shift_date_to}`);
    const r = await runSafeList({
      table: "workforce.shifts", conditions: c,
      allowedOrderColumns: ALLOWED, fallbackColumn: "shift_start",
      orderBy: q.order_by, orderDir: q.order_dir,
      limit: safeLimit(q.limit), offset: safeOffset(q.offset),
    });
    res.json(r);
  } catch (err) { sendDbError(res, err, "shifts:list"); }
});

router.get("/:id", async (req, res) => {
  const id = idFromParams(req, res); if (!id) return;
  try {
    const r = await db.execute(sql`
      select * from workforce.shifts where id = ${id} and coalesce(is_deleted,false)=false limit 1
    `);
    const row = (r.rows ?? [])[0];
    if (!row) return res.status(404).json({ error: "משמרת לא נמצאה" });
    res.json(row);
  } catch (err) { sendDbError(res, err, "shifts:get"); }
});

router.post("/", async (req, res) => {
  const d = parseBody(CreateShiftSchema, req, res); if (!d) return;
  const uid = currentUserId(req);
  try {
    const r = await db.execute(sql`
      insert into workforce.shifts (
        employee_id, project_id, work_order_id, shift_start, shift_end,
        shift_type, state, notes, metadata, created_by, updated_by, created_at, updated_at
      ) values (
        ${d.employee_id}, ${d.project_id ?? null}, ${d.work_order_id ?? null},
        ${d.shift_start}, ${d.shift_end ?? null},
        ${d.shift_type ?? null}, ${d.state ?? "Scheduled"},
        ${d.notes ?? null}, ${JSON.stringify(d.metadata ?? {})}::jsonb,
        ${uid}, ${uid}, now(), now()
      ) returning *
    `);
    const row = (r.rows ?? [])[0] as { id?: number } | undefined;
    if (row?.id) await logAudit({ user_id: uid, table_name: "workforce_shifts", record_id: row.id, action: "INSERT", new_values: { employee_id: d.employee_id }, ip_address: req.ip ?? null });
    res.status(201).json(row);
  } catch (err) { sendDbError(res, err, "shifts:create"); }
});

router.patch("/:id", async (req, res) => {
  const id = idFromParams(req, res); if (!id) return;
  const d = parseBody(UpdateShiftSchema, req, res); if (!d) return;
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
      update workforce.shifts set ${setClause}, updated_by = ${uid}, updated_at = now()
      where id = ${id} and coalesce(is_deleted,false)=false returning *
    `);
    const row = (r.rows ?? [])[0];
    if (!row) return res.status(404).json({ error: "משמרת לא נמצאה" });
    await logAudit({ user_id: uid, table_name: "workforce_shifts", record_id: id, action: "UPDATE", new_values: Object.fromEntries(entries), ip_address: req.ip ?? null });
    res.json(row);
  } catch (err) { sendDbError(res, err, "shifts:update"); }
});

router.delete("/:id", async (req, res) => {
  const id = idFromParams(req, res); if (!id) return;
  const uid = currentUserId(req);
  try {
    const r = await db.execute(sql`
      update workforce.shifts set is_deleted = true, updated_by = ${uid}, updated_at = now()
      where id = ${id} and coalesce(is_deleted,false)=false returning id
    `);
    if ((r.rows ?? []).length === 0) return res.status(404).json({ error: "משמרת לא נמצאה" });
    await logAudit({ user_id: uid, table_name: "workforce_shifts", record_id: id, action: "DELETE", ip_address: req.ip ?? null });
    res.status(204).send();
  } catch (err) { sendDbError(res, err, "shifts:delete"); }
});

export default router;
