// ============================================================
// governance.roles — superadmin-only CRUD
// ============================================================
import { Router } from "express";
import {
  CreateRoleSchema, UpdateRoleSchema, ListRolesQuerySchema,
} from "@workspace/api-zod/governance";
import {
  db, sql, authMiddleware, adminMiddleware,
  parseBody, parseQuery, idFromParams, currentUserId, sendDbError,
  runSafeList, safeLimit, safeOffset,
} from "./_helpers";
import { logAudit } from "../../lib/audit-log";

const router = Router();
router.use(authMiddleware, adminMiddleware);

const ALLOWED = new Set(["id", "role_code", "role_name", "created_at", "updated_at"]);

router.get("/", async (req, res) => {
  const q = parseQuery(ListRolesQuerySchema, req, res); if (!q) return;
  try {
    const c = [sql`coalesce(is_deleted, false) = false`];
    if (q.is_system !== undefined) c.push(sql`is_system = ${q.is_system}`);
    if (q.is_active !== undefined) c.push(sql`is_active = ${q.is_active}`);
    if (q.q) c.push(sql`(role_code ILIKE ${"%" + q.q + "%"} OR role_name ILIKE ${"%" + q.q + "%"})`);
    const r = await runSafeList({
      table: "governance.roles", conditions: c,
      allowedOrderColumns: ALLOWED, fallbackColumn: "id",
      orderBy: q.order_by, orderDir: q.order_dir,
      limit: safeLimit(q.limit), offset: safeOffset(q.offset),
    });
    res.json(r);
  } catch (err) { sendDbError(res, err, "roles:list"); }
});

router.get("/:id", async (req, res) => {
  const id = idFromParams(req, res); if (!id) return;
  try {
    const r = await db.execute(sql`
      select r.*, coalesce(json_agg(json_build_object(
        'permission_id', p.id, 'permission_code', p.permission_code, 'permission_name', p.permission_name
      )) filter (where p.id is not null), '[]'::json) as permissions
      from governance.roles r
      left join governance.role_permissions rp on rp.role_id = r.id
      left join governance.permissions p on p.id = rp.permission_id
      where r.id = ${id} and coalesce(r.is_deleted, false) = false
      group by r.id
    `);
    const row = (r.rows ?? [])[0];
    if (!row) return res.status(404).json({ error: "תפקיד לא נמצא" });
    res.json(row);
  } catch (err) { sendDbError(res, err, "roles:get"); }
});

router.post("/", async (req, res) => {
  const d = parseBody(CreateRoleSchema, req, res); if (!d) return;
  const uid = currentUserId(req);
  try {
    const r = await db.execute(sql`
      insert into governance.roles (role_code, role_name, description, is_system, is_active, metadata, created_at, updated_at)
      values (${d.role_code}, ${d.role_name}, ${d.description ?? null}, ${d.is_system ?? false}, ${d.is_active ?? true},
              ${JSON.stringify(d.metadata ?? {})}::jsonb, now(), now())
      returning *
    `);
    const row = (r.rows ?? [])[0] as { id?: number } | undefined;
    if (row?.id) await logAudit({ user_id: uid, table_name: "governance_roles", record_id: row.id, action: "INSERT", new_values: d as Record<string, unknown>, ip_address: req.ip ?? null });
    res.status(201).json(row);
  } catch (err) { sendDbError(res, err, "roles:create"); }
});

router.patch("/:id", async (req, res) => {
  const id = idFromParams(req, res); if (!id) return;
  const d = parseBody(UpdateRoleSchema, req, res); if (!d) return;
  const uid = currentUserId(req);
  const entries = Object.entries(d).filter(([, v]) => v !== undefined);
  if (entries.length === 0) return res.status(400).json({ error: "אין שינויים" });
  try {
    const fragments = entries.map(([k, v]) =>
      k === "metadata"
        ? sql`${sql.raw(k)} = ${JSON.stringify(v ?? {})}::jsonb`
        : sql`${sql.raw(k)} = ${v as string | number | boolean | null}`,
    );
    const r = await db.execute(sql`
      update governance.roles set ${sql.join(fragments, sql`, `)}, updated_at = now()
      where id = ${id} and is_system = false returning *
    `);
    const row = (r.rows ?? [])[0];
    if (!row) return res.status(404).json({ error: "תפקיד לא נמצא או תפקיד מערכת" });
    await logAudit({ user_id: uid, table_name: "governance_roles", record_id: id, action: "UPDATE", new_values: d as Record<string, unknown>, ip_address: req.ip ?? null });
    res.json(row);
  } catch (err) { sendDbError(res, err, "roles:update"); }
});

router.delete("/:id", async (req, res) => {
  const id = idFromParams(req, res); if (!id) return;
  const uid = currentUserId(req);
  try {
    const r = await db.execute(sql`
      update governance.roles set is_deleted = true, is_active = false, updated_at = now()
      where id = ${id} and is_system = false returning id
    `);
    if ((r.rows ?? []).length === 0) return res.status(404).json({ error: "תפקיד לא נמצא או תפקיד מערכת" });
    await logAudit({ user_id: uid, table_name: "governance_roles", record_id: id, action: "DELETE", ip_address: req.ip ?? null, notes: "soft delete" });
    res.status(204).send();
  } catch (err) { sendDbError(res, err, "roles:delete"); }
});

export default router;
