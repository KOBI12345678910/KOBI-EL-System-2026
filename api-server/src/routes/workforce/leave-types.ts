import { Router } from "express";
import {
  CreateLeaveTypeSchema, UpdateLeaveTypeSchema, ListLeaveTypesQuerySchema,
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

const ALLOWED = new Set(["id","leave_code","leave_name","created_at","updated_at"]);

router.get("/", async (req, res) => {
  const q = parseQuery(ListLeaveTypesQuerySchema, req, res); if (!q) return;
  try {
    const c = [sql`coalesce(is_deleted, false) = false`];
    if (q.active !== undefined) c.push(sql`active = ${q.active}`);
    if (q.paid !== undefined) c.push(sql`paid = ${q.paid}`);
    if (q.q) c.push(sql`(leave_name ILIKE ${"%" + q.q + "%"} OR leave_code ILIKE ${"%" + q.q + "%"})`);
    const r = await runSafeList({
      table: "workforce.leave_types", conditions: c,
      allowedOrderColumns: ALLOWED, fallbackColumn: "id",
      orderBy: q.order_by, orderDir: q.order_dir,
      limit: safeLimit(q.limit), offset: safeOffset(q.offset),
    });
    res.json(r);
  } catch (err) { sendDbError(res, err, "leave-types:list"); }
});

router.get("/:id", async (req, res) => {
  const id = idFromParams(req, res); if (!id) return;
  try {
    const r = await db.execute(sql`
      select * from workforce.leave_types where id = ${id} and coalesce(is_deleted,false)=false limit 1
    `);
    const row = (r.rows ?? [])[0];
    if (!row) return res.status(404).json({ error: "סוג חופשה לא נמצא" });
    res.json(row);
  } catch (err) { sendDbError(res, err, "leave-types:get"); }
});

router.post("/", async (req, res) => {
  const d = parseBody(CreateLeaveTypeSchema, req, res); if (!d) return;
  const uid = currentUserId(req);
  try {
    const r = await db.execute(sql`
      insert into workforce.leave_types (leave_code, leave_name, paid, active, metadata, created_at, updated_at)
      values (${d.leave_code}, ${d.leave_name}, ${d.paid ?? true}, ${d.active ?? true},
              ${JSON.stringify(d.metadata ?? {})}::jsonb, now(), now())
      returning *
    `);
    const row = (r.rows ?? [])[0] as { id?: number } | undefined;
    if (row?.id) await logAudit({ user_id: uid, table_name: "workforce_leave_types", record_id: row.id, action: "INSERT", new_values: { leave_code: d.leave_code }, ip_address: req.ip ?? null });
    res.status(201).json(row);
  } catch (err) { sendDbError(res, err, "leave-types:create"); }
});

router.patch("/:id", async (req, res) => {
  const id = idFromParams(req, res); if (!id) return;
  const d = parseBody(UpdateLeaveTypeSchema, req, res); if (!d) return;
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
      update workforce.leave_types set ${setClause}, updated_at = now()
      where id = ${id} and coalesce(is_deleted,false)=false returning *
    `);
    const row = (r.rows ?? [])[0];
    if (!row) return res.status(404).json({ error: "סוג חופשה לא נמצא" });
    await logAudit({ user_id: uid, table_name: "workforce_leave_types", record_id: id, action: "UPDATE", new_values: Object.fromEntries(entries), ip_address: req.ip ?? null });
    res.json(row);
  } catch (err) { sendDbError(res, err, "leave-types:update"); }
});

router.delete("/:id", async (req, res) => {
  const id = idFromParams(req, res); if (!id) return;
  const uid = currentUserId(req);
  try {
    const r = await db.execute(sql`
      update workforce.leave_types set is_deleted = true, active = false, updated_at = now()
      where id = ${id} and coalesce(is_deleted,false)=false returning id
    `);
    if ((r.rows ?? []).length === 0) return res.status(404).json({ error: "סוג חופשה לא נמצא" });
    await logAudit({ user_id: uid, table_name: "workforce_leave_types", record_id: id, action: "DELETE", ip_address: req.ip ?? null });
    res.status(204).send();
  } catch (err) { sendDbError(res, err, "leave-types:delete"); }
});

export default router;
