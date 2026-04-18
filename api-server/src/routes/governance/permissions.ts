// ============================================================
// governance.permissions (+ role_permissions) — superadmin-only
// ============================================================
import { Router } from "express";
import {
  CreatePermissionSchema, UpdatePermissionSchema, ListPermissionsQuerySchema,
  GrantPermissionSchema,
} from "@workspace/api-zod/governance";
import {
  db, sql, authMiddleware, adminMiddleware,
  parseBody, parseQuery, idFromParams, currentUserId, sendDbError,
  runSafeList, safeLimit, safeOffset,
} from "./_helpers";
import { logAudit } from "../../lib/audit-log";

const router = Router();
router.use(authMiddleware, adminMiddleware);

const ALLOWED = new Set(["id", "permission_code", "permission_name", "module_name", "created_at"]);

router.get("/", async (req, res) => {
  const q = parseQuery(ListPermissionsQuerySchema, req, res); if (!q) return;
  try {
    const c = [sql`coalesce(is_deleted, false) = false`];
    if (q.module_name) c.push(sql`module_name = ${q.module_name}`);
    if (q.q) c.push(sql`(permission_code ILIKE ${"%" + q.q + "%"} OR permission_name ILIKE ${"%" + q.q + "%"})`);
    const r = await runSafeList({
      table: "governance.permissions", conditions: c,
      allowedOrderColumns: ALLOWED, fallbackColumn: "id",
      orderBy: q.order_by, orderDir: q.order_dir,
      limit: safeLimit(q.limit), offset: safeOffset(q.offset),
    });
    res.json(r);
  } catch (err) { sendDbError(res, err, "permissions:list"); }
});

router.post("/", async (req, res) => {
  const d = parseBody(CreatePermissionSchema, req, res); if (!d) return;
  const uid = currentUserId(req);
  try {
    const r = await db.execute(sql`
      insert into governance.permissions (permission_code, permission_name, module_name, description, is_active, metadata, created_at, updated_at)
      values (${d.permission_code}, ${d.permission_name}, ${d.module_name ?? null}, ${d.description ?? null},
              ${d.is_active ?? true}, ${JSON.stringify(d.metadata ?? {})}::jsonb, now(), now())
      returning *
    `);
    const row = (r.rows ?? [])[0] as { id?: number } | undefined;
    if (row?.id) await logAudit({ user_id: uid, table_name: "governance_permissions", record_id: row.id, action: "INSERT", new_values: d as Record<string, unknown>, ip_address: req.ip ?? null });
    res.status(201).json(row);
  } catch (err) { sendDbError(res, err, "permissions:create"); }
});

router.patch("/:id", async (req, res) => {
  const id = idFromParams(req, res); if (!id) return;
  const d = parseBody(UpdatePermissionSchema, req, res); if (!d) return;
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
      update governance.permissions set ${sql.join(fragments, sql`, `)}, updated_at = now()
      where id = ${id} returning *
    `);
    const row = (r.rows ?? [])[0];
    if (!row) return res.status(404).json({ error: "הרשאה לא נמצאה" });
    await logAudit({ user_id: uid, table_name: "governance_permissions", record_id: id, action: "UPDATE", new_values: d as Record<string, unknown>, ip_address: req.ip ?? null });
    res.json(row);
  } catch (err) { sendDbError(res, err, "permissions:update"); }
});

// role_permissions: grant/revoke
router.post("/grant", async (req, res) => {
  const d = parseBody(GrantPermissionSchema, req, res); if (!d) return;
  const uid = currentUserId(req);
  try {
    const r = await db.execute(sql`
      insert into governance.role_permissions (role_id, permission_id, granted_at, granted_by)
      values (${d.role_id}, ${d.permission_id}, now(), ${uid})
      on conflict (role_id, permission_id) do nothing
      returning role_id, permission_id
    `);
    await logAudit({ user_id: uid, table_name: "governance_role_permissions", record_id: d.role_id, action: "INSERT", new_values: d as Record<string, unknown>, ip_address: req.ip ?? null });
    res.status(201).json({ ok: true, granted: (r.rows ?? [])[0] ?? null });
  } catch (err) { sendDbError(res, err, "permissions:grant"); }
});

router.post("/revoke", async (req, res) => {
  const d = parseBody(GrantPermissionSchema, req, res); if (!d) return;
  const uid = currentUserId(req);
  try {
    const r = await db.execute(sql`
      delete from governance.role_permissions where role_id = ${d.role_id} and permission_id = ${d.permission_id} returning role_id
    `);
    if ((r.rows ?? []).length === 0) return res.status(404).json({ error: "הקצאה לא נמצאה" });
    await logAudit({ user_id: uid, table_name: "governance_role_permissions", record_id: d.role_id, action: "DELETE", new_values: d as Record<string, unknown>, ip_address: req.ip ?? null });
    res.json({ ok: true });
  } catch (err) { sendDbError(res, err, "permissions:revoke"); }
});

export default router;
