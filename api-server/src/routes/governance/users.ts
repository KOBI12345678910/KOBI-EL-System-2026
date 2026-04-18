// ============================================================
// governance.users_profile — admin-only CRUD + role assignment
// ============================================================
import { Router, type Request, type Response } from "express";
import {
  CreateUserSchema,
  UpdateUserSchema,
  ListUsersQuerySchema,
  AssignRoleSchema,
  RevokeRoleSchema,
} from "@workspace/api-zod/governance";
import {
  db, sql, authMiddleware, adminMiddleware,
  parseBody, parseQuery, idFromParams, currentUserId, sendDbError,
  runSafeList, safeLimit, safeOffset, safeDateParam,
} from "./_helpers";
import { logAudit } from "../../lib/audit-log";

const router = Router();
router.use(authMiddleware, adminMiddleware);

const ALLOWED_ORDER = new Set(["id", "username", "email", "created_at", "updated_at", "last_login_at"]);

router.get("/", async (req: Request, res: Response) => {
  const q = parseQuery(ListUsersQuerySchema, req, res);
  if (!q) return;
  try {
    const conditions = [sql`coalesce(is_deleted, false) = false`];
    if (q.is_active !== undefined) conditions.push(sql`is_active = ${q.is_active}`);
    if (q.q) conditions.push(sql`(username ILIKE ${"%" + q.q + "%"} OR email ILIKE ${"%" + q.q + "%"} OR full_name ILIKE ${"%" + q.q + "%"})`);
    if (q.role_code) conditions.push(sql`id IN (
      select ur.user_id from governance.user_roles ur
      join governance.roles r on r.id = ur.role_id
      where r.role_code = ${q.role_code} and coalesce(ur.active, true) = true
    )`);

    const result = await runSafeList({
      table: "governance.users_profile",
      conditions,
      allowedOrderColumns: ALLOWED_ORDER,
      fallbackColumn: "id",
      orderBy: q.order_by,
      orderDir: q.order_dir,
      limit: safeLimit(q.limit),
      offset: safeOffset(q.offset),
    });
    res.json(result);
  } catch (err) { sendDbError(res, err, "users:list"); }
});

router.get("/:id", async (req, res) => {
  const id = idFromParams(req, res); if (!id) return;
  try {
    const r = await db.execute(sql`
      select up.*, coalesce(json_agg(json_build_object(
        'role_id', r.id, 'role_code', r.role_code, 'role_name', r.role_name,
        'assigned_at', ur.valid_from
      )) filter (where r.id is not null), '[]'::json) as roles
      from governance.users_profile up
      left join governance.user_roles ur on ur.user_id = up.id and coalesce(ur.active, true) = true
      left join governance.roles r on r.id = ur.role_id
      where up.id = ${id} and coalesce(up.is_deleted, false) = false
      group by up.id
    `);
    const row = (r.rows ?? [])[0];
    if (!row) return res.status(404).json({ error: "משתמש לא נמצא" });
    res.json(row);
  } catch (err) { sendDbError(res, err, "users:get"); }
});

router.post("/", async (req, res) => {
  const d = parseBody(CreateUserSchema, req, res); if (!d) return;
  const uid = currentUserId(req);
  try {
    const r = await db.execute(sql`
      insert into governance.users_profile (
        username, email, full_name, phone, is_active, preferred_locale, metadata, created_at, updated_at
      ) values (
        ${d.username}, ${d.email ?? null}, ${d.full_name ?? null}, ${d.phone ?? null},
        ${d.is_active ?? true}, ${d.preferred_locale ?? "he-IL"},
        ${JSON.stringify(d.metadata ?? {})}::jsonb, now(), now()
      ) returning *
    `);
    const row = (r.rows ?? [])[0] as { id?: number } | undefined;
    if (row?.id) {
      await logAudit({ user_id: uid, table_name: "governance_users_profile", record_id: row.id, action: "INSERT", new_values: d as Record<string, unknown>, ip_address: req.ip ?? null });
    }
    res.status(201).json(row);
  } catch (err) { sendDbError(res, err, "users:create"); }
});

router.patch("/:id", async (req, res) => {
  const id = idFromParams(req, res); if (!id) return;
  const d = parseBody(UpdateUserSchema, req, res); if (!d) return;
  const uid = currentUserId(req);
  const entries = Object.entries(d).filter(([, v]) => v !== undefined);
  if (entries.length === 0) return res.status(400).json({ error: "אין שינויים לעדכון" });
  try {
    const fragments = entries.map(([k, v]) => {
      if (k === "metadata") return sql`${sql.raw(k)} = ${JSON.stringify(v ?? {})}::jsonb`;
      return sql`${sql.raw(k)} = ${v as string | number | boolean | null}`;
    });
    const r = await db.execute(sql`
      update governance.users_profile
      set ${sql.join(fragments, sql`, `)}, updated_at = now()
      where id = ${id} and coalesce(is_deleted, false) = false
      returning *
    `);
    const row = (r.rows ?? [])[0];
    if (!row) return res.status(404).json({ error: "משתמש לא נמצא" });
    await logAudit({ user_id: uid, table_name: "governance_users_profile", record_id: id, action: "UPDATE", new_values: d as Record<string, unknown>, ip_address: req.ip ?? null });
    res.json(row);
  } catch (err) { sendDbError(res, err, "users:update"); }
});

router.delete("/:id", async (req, res) => {
  const id = idFromParams(req, res); if (!id) return;
  const uid = currentUserId(req);
  try {
    const r = await db.execute(sql`
      update governance.users_profile
      set is_deleted = true, is_active = false, updated_at = now()
      where id = ${id} and coalesce(is_deleted, false) = false
      returning id
    `);
    if ((r.rows ?? []).length === 0) return res.status(404).json({ error: "משתמש לא נמצא" });
    await logAudit({ user_id: uid, table_name: "governance_users_profile", record_id: id, action: "DELETE", ip_address: req.ip ?? null, notes: "soft delete" });
    res.status(204).send();
  } catch (err) { sendDbError(res, err, "users:delete"); }
});

// POST /:id/assign-role
router.post("/:id/assign-role", async (req, res) => {
  const id = idFromParams(req, res); if (!id) return;
  const d = parseBody(AssignRoleSchema, req, res); if (!d) return;
  const uid = currentUserId(req);
  try {
    const r = await db.execute(sql`
      insert into governance.user_roles (user_id, role_id, assigned_by_user_id, active, valid_from, valid_until)
      values (${id}, ${d.role_id}, ${uid}, true, now(), ${d.valid_until ?? null})
      on conflict (user_id, role_id)
      do update set active = true, valid_until = ${d.valid_until ?? null}, assigned_by_user_id = ${uid}
      returning id, user_id, role_id, valid_from, valid_until
    `);
    await logAudit({ user_id: uid, table_name: "governance_user_roles", record_id: id, action: "INSERT", new_values: { role_id: d.role_id, notes: d.notes }, ip_address: req.ip ?? null });
    res.status(201).json((r.rows ?? [])[0]);
  } catch (err) { sendDbError(res, err, "users:assign-role"); }
});

// POST /:id/revoke-role
router.post("/:id/revoke-role", async (req, res) => {
  const id = idFromParams(req, res); if (!id) return;
  const d = parseBody(RevokeRoleSchema, req, res); if (!d) return;
  const uid = currentUserId(req);
  try {
    const r = await db.execute(sql`
      update governance.user_roles
      set active = false, valid_until = coalesce(valid_until, now())
      where user_id = ${id} and role_id = ${d.role_id}
      returning id
    `);
    if ((r.rows ?? []).length === 0) return res.status(404).json({ error: "הקצאת תפקיד לא נמצאה" });
    await logAudit({ user_id: uid, table_name: "governance_user_roles", record_id: id, action: "UPDATE", new_values: { role_id: d.role_id, revoked: true, reason: d.reason }, ip_address: req.ip ?? null });
    res.json({ ok: true });
  } catch (err) { sendDbError(res, err, "users:revoke-role"); }
});

export default router;
