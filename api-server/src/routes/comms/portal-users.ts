// ============================================================
// comms.portal_users — admin CRUD
// ============================================================
import { Router, type Request, type Response } from "express";
import {
  CreatePortalUserSchema,
  UpdatePortalUserSchema,
  ListPortalUsersQuerySchema,
} from "@workspace/api-zod/comms";
import {
  db, sql, authMiddleware,
  parseBody, parseQuery, idFromParams, currentUserId, sendDbError,
  runSafeList, safeLimit, safeOffset,
} from "./_helpers";

const router = Router();
router.use(authMiddleware);

const ALLOWED_ORDER = new Set([
  "id", "created_at", "updated_at", "last_login_at", "status", "portal_type", "display_name",
]);

router.get("/", async (req: Request, res: Response) => {
  const q = parseQuery(ListPortalUsersQuerySchema, req, res);
  if (!q) return;
  try {
    const conditions = [sql`coalesce(is_deleted, false) = false`];
    if (q.portal_type) conditions.push(sql`portal_type = ${q.portal_type}`);
    if (q.status) conditions.push(sql`status = ${q.status}`);
    if (q.customer_id) conditions.push(sql`customer_id = ${q.customer_id}`);
    if (q.supplier_id) conditions.push(sql`supplier_id = ${q.supplier_id}`);
    if (q.q) conditions.push(sql`(display_name ILIKE ${"%" + q.q + "%"} OR email ILIKE ${"%" + q.q + "%"} OR phone ILIKE ${"%" + q.q + "%"})`);

    const result = await runSafeList({
      table: "comms.portal_users",
      conditions,
      allowedOrderColumns: ALLOWED_ORDER,
      fallbackColumn: "id",
      orderBy: q.order_by,
      orderDir: q.order_dir,
      limit: safeLimit(q.limit),
      offset: safeOffset(q.offset),
    });
    res.json(result);
  } catch (err) { sendDbError(res, err, "portal-users:list"); }
});

router.get("/:id", async (req, res) => {
  const id = idFromParams(req, res); if (!id) return;
  try {
    const r = await db.execute(sql`
      select * from comms.portal_users
      where id = ${id} and coalesce(is_deleted, false) = false
    `);
    const row = (r.rows ?? [])[0];
    if (!row) return res.status(404).json({ error: "משתמש פורטל לא נמצא" });
    res.json(row);
  } catch (err) { sendDbError(res, err, "portal-users:get"); }
});

router.post("/", async (req, res) => {
  const d = parseBody(CreatePortalUserSchema, req, res); if (!d) return;
  const uid = currentUserId(req);
  try {
    const r = await db.execute(sql`
      insert into comms.portal_users (
        portal_type, display_name, email, phone, customer_id, supplier_id,
        tenant_reference, status, metadata, created_by, updated_by,
        created_at, updated_at
      ) values (
        ${d.portal_type}, ${d.display_name}, ${d.email ?? null}, ${d.phone ?? null},
        ${d.customer_id ?? null}, ${d.supplier_id ?? null},
        ${d.tenant_reference ?? null}, ${d.status ?? "active"},
        ${JSON.stringify(d.metadata ?? {})}::jsonb,
        ${uid}, ${uid}, now(), now()
      ) returning *
    `);
    res.status(201).json((r.rows ?? [])[0]);
  } catch (err) { sendDbError(res, err, "portal-users:create"); }
});

router.patch("/:id", async (req, res) => {
  const id = idFromParams(req, res); if (!id) return;
  const d = parseBody(UpdatePortalUserSchema, req, res); if (!d) return;
  try {
    const r = await db.execute(sql`
      update comms.portal_users set
        display_name = coalesce(${d.display_name ?? null}, display_name),
        email = coalesce(${d.email ?? null}, email),
        phone = coalesce(${d.phone ?? null}, phone),
        status = coalesce(${d.status ?? null}, status),
        customer_id = coalesce(${d.customer_id ?? null}, customer_id),
        supplier_id = coalesce(${d.supplier_id ?? null}, supplier_id),
        portal_type = coalesce(${d.portal_type ?? null}, portal_type),
        tenant_reference = coalesce(${d.tenant_reference ?? null}, tenant_reference),
        metadata = coalesce(${d.metadata ? JSON.stringify(d.metadata) : null}::jsonb, metadata),
        updated_at = now()
      where id = ${id} and coalesce(is_deleted, false) = false
      returning *
    `);
    const row = (r.rows ?? [])[0];
    if (!row) return res.status(404).json({ error: "משתמש פורטל לא נמצא" });
    res.json(row);
  } catch (err) { sendDbError(res, err, "portal-users:update"); }
});

router.delete("/:id", async (req, res) => {
  const id = idFromParams(req, res); if (!id) return;
  try {
    const r = await db.execute(sql`
      update comms.portal_users set is_deleted = true, status = 'inactive', updated_at = now()
      where id = ${id} and coalesce(is_deleted, false) = false
      returning id
    `);
    if ((r.rows ?? []).length === 0) return res.status(404).json({ error: "משתמש פורטל לא נמצא" });
    res.status(204).send();
  } catch (err) { sendDbError(res, err, "portal-users:delete"); }
});

export default router;
