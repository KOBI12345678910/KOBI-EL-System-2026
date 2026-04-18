// ============================================================
// comms.notifications — user-facing notifications
// ============================================================
import { Router, type Request, type Response } from "express";
import {
  CreateNotificationSchema,
  UpdateNotificationSchema,
  ListNotificationsQuerySchema,
  MarkAllReadSchema,
} from "@workspace/api-zod/comms";
import {
  db, sql, authMiddleware,
  parseBody, parseQuery, idFromParams, currentUserId, sendDbError,
  runSafeList, safeLimit, safeOffset, safeDateParam,
} from "./_helpers";

const router = Router();
router.use(authMiddleware);

const ALLOWED_ORDER = new Set([
  "id", "created_at", "updated_at", "status", "severity", "user_id",
]);

router.get("/", async (req: Request, res: Response) => {
  const q = parseQuery(ListNotificationsQuerySchema, req, res);
  if (!q) return;
  try {
    const conditions = [sql`coalesce(is_deleted, false) = false`];
    if (q.status) conditions.push(sql`status = ${q.status}`);
    if (q.user_id) conditions.push(sql`user_id = ${q.user_id}`);
    if (q.severity) conditions.push(sql`severity = ${q.severity}`);
    const from = safeDateParam(q.from_date);
    if (from) conditions.push(sql`created_at >= ${from}`);
    const to = safeDateParam(q.to_date);
    if (to) conditions.push(sql`created_at <= ${to}`);
    if (q.q) conditions.push(sql`(title ILIKE ${"%" + q.q + "%"} OR body ILIKE ${"%" + q.q + "%"})`);

    const result = await runSafeList({
      table: "comms.notifications",
      conditions,
      allowedOrderColumns: ALLOWED_ORDER,
      fallbackColumn: "id",
      orderBy: q.order_by,
      orderDir: q.order_dir,
      limit: safeLimit(q.limit),
      offset: safeOffset(q.offset),
    });
    res.json(result);
  } catch (err) { sendDbError(res, err, "notifications:list"); }
});

router.get("/:id", async (req, res) => {
  const id = idFromParams(req, res); if (!id) return;
  try {
    const r = await db.execute(sql`
      select * from comms.notifications
      where id = ${id} and coalesce(is_deleted, false) = false
    `);
    const row = (r.rows ?? [])[0];
    if (!row) return res.status(404).json({ error: "התראה לא נמצאה" });
    res.json(row);
  } catch (err) { sendDbError(res, err, "notifications:get"); }
});

router.post("/", async (req, res) => {
  const d = parseBody(CreateNotificationSchema, req, res); if (!d) return;
  const uid = currentUserId(req);
  try {
    const r = await db.execute(sql`
      insert into comms.notifications (
        user_id, portal_user_id, notification_type, title, body, severity,
        linked_entity_type, linked_entity_id, status, metadata,
        created_by, updated_by, created_at, updated_at
      ) values (
        ${d.user_id ?? null}, ${d.portal_user_id ?? null},
        ${d.notification_type}, ${d.title}, ${d.body ?? null},
        ${d.severity ?? null},
        ${d.linked_entity_type ?? null}, ${d.linked_entity_id ?? null},
        'unread', ${JSON.stringify(d.metadata ?? {})}::jsonb,
        ${uid}, ${uid}, now(), now()
      ) returning *
    `);
    res.status(201).json((r.rows ?? [])[0]);
  } catch (err) { sendDbError(res, err, "notifications:create"); }
});

router.patch("/:id", async (req, res) => {
  const id = idFromParams(req, res); if (!id) return;
  const d = parseBody(UpdateNotificationSchema, req, res); if (!d) return;
  try {
    const r = await db.execute(sql`
      update comms.notifications set
        status = coalesce(${d.status ?? null}, status),
        read_at = coalesce(${d.read_at ?? null}, read_at),
        archived_at = coalesce(${d.archived_at ?? null}, archived_at),
        metadata = coalesce(${d.metadata ? JSON.stringify(d.metadata) : null}::jsonb, metadata),
        updated_at = now()
      where id = ${id} and coalesce(is_deleted, false) = false
      returning *
    `);
    const row = (r.rows ?? [])[0];
    if (!row) return res.status(404).json({ error: "התראה לא נמצאה" });
    res.json(row);
  } catch (err) { sendDbError(res, err, "notifications:update"); }
});

// POST /mark-all-read — mark all unread for current user (or supplied user_id)
router.post("/mark-all-read", async (req, res) => {
  const d = parseBody(MarkAllReadSchema, req, res); if (!d) return;
  const uid = d.user_id ?? currentUserId(req);
  if (!uid) return res.status(400).json({ error: "חסר מזהה משתמש" });
  try {
    const r = await db.execute(sql`
      update comms.notifications
      set status = 'read', read_at = now(), updated_at = now()
      where user_id = ${uid} and status = 'unread'
      returning id
    `);
    res.json({ ok: true, updated: (r.rows ?? []).length });
  } catch (err) { sendDbError(res, err, "notifications:mark-all-read"); }
});

router.delete("/:id", async (req, res) => {
  const id = idFromParams(req, res); if (!id) return;
  try {
    const r = await db.execute(sql`
      update comms.notifications set is_deleted = true, updated_at = now()
      where id = ${id} and coalesce(is_deleted, false) = false
      returning id
    `);
    if ((r.rows ?? []).length === 0) return res.status(404).json({ error: "התראה לא נמצאה" });
    res.status(204).send();
  } catch (err) { sendDbError(res, err, "notifications:delete"); }
});

export default router;
