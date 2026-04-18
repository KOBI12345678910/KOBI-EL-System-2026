// ============================================================
// comms.comms_threads — unified thread listing
// ============================================================
import { Router, type Request, type Response } from "express";
import {
  CreateThreadSchema,
  UpdateThreadSchema,
  ListThreadsQuerySchema,
} from "@workspace/api-zod/comms";
import {
  db, sql, authMiddleware,
  parseBody, parseQuery, idFromParams, currentUserId, sendDbError,
  runSafeList, safeLimit, safeOffset,
} from "./_helpers";

const router = Router();
router.use(authMiddleware);

const ALLOWED_ORDER = new Set([
  "id", "created_at", "updated_at", "last_message_at", "status", "thread_type",
]);

router.get("/", async (req: Request, res: Response) => {
  const q = parseQuery(ListThreadsQuerySchema, req, res);
  if (!q) return;
  try {
    const conditions = [sql`coalesce(is_deleted, false) = false`];
    if (q.thread_type) conditions.push(sql`thread_type = ${q.thread_type}`);
    if (q.status) conditions.push(sql`status = ${q.status}`);
    if (q.linked_entity_type) conditions.push(sql`linked_entity_type = ${q.linked_entity_type}`);
    if (q.linked_entity_id) conditions.push(sql`linked_entity_id = ${q.linked_entity_id}`);
    if (q.q) conditions.push(sql`subject ILIKE ${"%" + q.q + "%"}`);

    const result = await runSafeList({
      table: "comms.comms_threads",
      conditions,
      allowedOrderColumns: ALLOWED_ORDER,
      fallbackColumn: "id",
      orderBy: q.order_by,
      orderDir: q.order_dir,
      limit: safeLimit(q.limit),
      offset: safeOffset(q.offset),
    });
    res.json(result);
  } catch (err) { sendDbError(res, err, "threads:list"); }
});

router.get("/:id", async (req, res) => {
  const id = idFromParams(req, res); if (!id) return;
  try {
    const r = await db.execute(sql`
      select t.*,
        (select count(*) from comms.email_messages where thread_id = t.id) as email_count,
        (select count(*) from comms.sms_messages where thread_id = t.id) as sms_count,
        (select count(*) from comms.whatsapp_messages where thread_id = t.id) as whatsapp_count
      from comms.comms_threads t
      where t.id = ${id} and coalesce(t.is_deleted, false) = false
    `);
    const row = (r.rows ?? [])[0];
    if (!row) return res.status(404).json({ error: "שיחה לא נמצאה" });
    res.json(row);
  } catch (err) { sendDbError(res, err, "threads:get"); }
});

router.post("/", async (req, res) => {
  const d = parseBody(CreateThreadSchema, req, res); if (!d) return;
  const uid = currentUserId(req);
  try {
    const r = await db.execute(sql`
      insert into comms.comms_threads (
        thread_type, subject, linked_entity_type, linked_entity_id, status,
        metadata, created_by, updated_by, created_at, updated_at
      ) values (
        ${d.thread_type ?? null}, ${d.subject ?? null},
        ${d.linked_entity_type ?? null}, ${d.linked_entity_id ?? null},
        ${d.status ?? "open"},
        ${JSON.stringify(d.metadata ?? {})}::jsonb,
        ${uid}, ${uid}, now(), now()
      ) returning *
    `);
    res.status(201).json((r.rows ?? [])[0]);
  } catch (err) { sendDbError(res, err, "threads:create"); }
});

router.patch("/:id", async (req, res) => {
  const id = idFromParams(req, res); if (!id) return;
  const d = parseBody(UpdateThreadSchema, req, res); if (!d) return;
  try {
    const r = await db.execute(sql`
      update comms.comms_threads set
        thread_type = coalesce(${d.thread_type ?? null}, thread_type),
        subject = coalesce(${d.subject ?? null}, subject),
        status = coalesce(${d.status ?? null}, status),
        linked_entity_type = coalesce(${d.linked_entity_type ?? null}, linked_entity_type),
        linked_entity_id = coalesce(${d.linked_entity_id ?? null}, linked_entity_id),
        metadata = coalesce(${d.metadata ? JSON.stringify(d.metadata) : null}::jsonb, metadata),
        updated_at = now()
      where id = ${id} and coalesce(is_deleted, false) = false
      returning *
    `);
    const row = (r.rows ?? [])[0];
    if (!row) return res.status(404).json({ error: "שיחה לא נמצאה" });
    res.json(row);
  } catch (err) { sendDbError(res, err, "threads:update"); }
});

router.delete("/:id", async (req, res) => {
  const id = idFromParams(req, res); if (!id) return;
  try {
    const r = await db.execute(sql`
      update comms.comms_threads set is_deleted = true, updated_at = now()
      where id = ${id} and coalesce(is_deleted, false) = false
      returning id
    `);
    if ((r.rows ?? []).length === 0) return res.status(404).json({ error: "שיחה לא נמצאה" });
    res.status(204).send();
  } catch (err) { sendDbError(res, err, "threads:delete"); }
});

// GET /inbox — unified inbox: cross-channel feed aggregated by thread_id
router.get("/inbox/feed", async (req, res) => {
  const limit = safeLimit((req.query.limit as string) ?? "100", 500, 100);
  try {
    const r = await db.execute(sql`
      with feed as (
        select 'email' as channel, id as msg_id, thread_id, subject as title,
               coalesce(body_text, body_html) as body, status, sent_at, created_at
        from comms.email_messages
        where coalesce(is_deleted, false) = false
        union all
        select 'sms' as channel, id as msg_id, thread_id, null as title,
               message_body as body, status, sent_at, created_at
        from comms.sms_messages
        where coalesce(is_deleted, false) = false
        union all
        select 'whatsapp' as channel, id as msg_id, thread_id, null as title,
               message_body as body, status, sent_at, created_at
        from comms.whatsapp_messages
        where coalesce(is_deleted, false) = false
      )
      select * from feed
      order by coalesce(sent_at, created_at) desc
      limit ${limit}
    `);
    res.json({ data: r.rows ?? [] });
  } catch (err) { sendDbError(res, err, "threads:inbox"); }
});

export default router;
