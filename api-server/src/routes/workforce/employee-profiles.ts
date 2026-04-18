// workforce.hr_profiles (aliased as employee_profiles)
import { Router } from "express";
import {
  CreateEmployeeProfileSchema, UpdateEmployeeProfileSchema, ListEmployeeProfilesQuerySchema,
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

const ALLOWED = new Set(["id","employee_id","city","country","created_at","updated_at"]);

router.get("/", async (req, res) => {
  const q = parseQuery(ListEmployeeProfilesQuerySchema, req, res); if (!q) return;
  try {
    const c = [sql`coalesce(is_deleted, false) = false`];
    if (q.employee_id) c.push(sql`employee_id = ${q.employee_id}`);
    if (q.q) c.push(sql`(city ILIKE ${"%" + q.q + "%"} OR address_line_1 ILIKE ${"%" + q.q + "%"})`);
    const r = await runSafeList({
      table: "workforce.hr_profiles", conditions: c,
      allowedOrderColumns: ALLOWED, fallbackColumn: "id",
      orderBy: q.order_by, orderDir: q.order_dir,
      limit: safeLimit(q.limit), offset: safeOffset(q.offset),
    });
    res.json(r);
  } catch (err) { sendDbError(res, err, "employee-profiles:list"); }
});

router.get("/:id", async (req, res) => {
  const id = idFromParams(req, res); if (!id) return;
  try {
    const r = await db.execute(sql`
      select * from workforce.hr_profiles
      where id = ${id} and coalesce(is_deleted, false) = false limit 1
    `);
    const row = (r.rows ?? [])[0];
    if (!row) return res.status(404).json({ error: "פרופיל לא נמצא" });
    res.json(row);
  } catch (err) { sendDbError(res, err, "employee-profiles:get"); }
});

router.post("/", async (req, res) => {
  const d = parseBody(CreateEmployeeProfileSchema, req, res); if (!d) return;
  const uid = currentUserId(req);
  try {
    const r = await db.execute(sql`
      insert into workforce.hr_profiles (
        employee_id, emergency_contact_name, emergency_contact_phone,
        address_line_1, city, region, postal_code, country, notes,
        metadata, created_by, updated_by, created_at, updated_at
      ) values (
        ${d.employee_id}, ${d.emergency_contact_name ?? null}, ${d.emergency_contact_phone ?? null},
        ${d.address_line_1 ?? null}, ${d.city ?? null}, ${d.region ?? null},
        ${d.postal_code ?? null}, ${d.country ?? null}, ${d.notes ?? null},
        ${JSON.stringify(d.metadata ?? {})}::jsonb, ${uid}, ${uid}, now(), now()
      ) returning *
    `);
    const row = (r.rows ?? [])[0] as { id?: number } | undefined;
    if (row?.id) await logAudit({ user_id: uid, table_name: "workforce_hr_profiles", record_id: row.id, action: "INSERT", new_values: { employee_id: d.employee_id }, ip_address: req.ip ?? null });
    res.status(201).json(row);
  } catch (err) { sendDbError(res, err, "employee-profiles:create"); }
});

router.patch("/:id", async (req, res) => {
  const id = idFromParams(req, res); if (!id) return;
  const d = parseBody(UpdateEmployeeProfileSchema, req, res); if (!d) return;
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
      update workforce.hr_profiles
      set ${setClause}, updated_by = ${uid}, updated_at = now()
      where id = ${id} and coalesce(is_deleted, false) = false
      returning *
    `);
    const row = (r.rows ?? [])[0];
    if (!row) return res.status(404).json({ error: "פרופיל לא נמצא" });
    await logAudit({ user_id: uid, table_name: "workforce_hr_profiles", record_id: id, action: "UPDATE", new_values: Object.fromEntries(entries), ip_address: req.ip ?? null });
    res.json(row);
  } catch (err) { sendDbError(res, err, "employee-profiles:update"); }
});

router.delete("/:id", async (req, res) => {
  const id = idFromParams(req, res); if (!id) return;
  const uid = currentUserId(req);
  try {
    const r = await db.execute(sql`
      update workforce.hr_profiles set is_deleted = true, updated_by = ${uid}, updated_at = now()
      where id = ${id} and coalesce(is_deleted, false) = false returning id
    `);
    if ((r.rows ?? []).length === 0) return res.status(404).json({ error: "פרופיל לא נמצא" });
    await logAudit({ user_id: uid, table_name: "workforce_hr_profiles", record_id: id, action: "DELETE", ip_address: req.ip ?? null });
    res.status(204).send();
  } catch (err) { sendDbError(res, err, "employee-profiles:delete"); }
});

export default router;
