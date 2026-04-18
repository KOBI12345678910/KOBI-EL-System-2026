// ============================================================
// comms.whatsapp_messages — list / get / send / update / delete
// ============================================================
import { Router, type Request, type Response } from "express";
import {
  SendWhatsAppSchema,
  UpdateWhatsAppSchema,
  ListWhatsAppQuerySchema,
} from "@workspace/api-zod/comms";
import {
  db, sql, authMiddleware,
  parseBody, parseQuery, idFromParams, currentUserId, sendDbError,
  runSafeList, safeLimit, safeOffset, safeDateParam, renderTemplate,
} from "./_helpers";

const router = Router();
router.use(authMiddleware);

const ALLOWED_ORDER = new Set([
  "id", "sent_at", "created_at", "updated_at", "status", "recipient_id", "thread_id",
]);

router.get("/", async (req: Request, res: Response) => {
  const q = parseQuery(ListWhatsAppQuerySchema, req, res);
  if (!q) return;
  try {
    const conditions = [sql`coalesce(is_deleted, false) = false`];
    if (q.status) conditions.push(sql`status = ${q.status}`);
    if (q.recipient_id) conditions.push(sql`recipient_id = ${q.recipient_id}`);
    if (q.phone_number) conditions.push(sql`phone_number = ${q.phone_number}`);
    const from = safeDateParam(q.from_date);
    if (from) conditions.push(sql`sent_at >= ${from}`);
    const to = safeDateParam(q.to_date);
    if (to) conditions.push(sql`sent_at <= ${to}`);
    if (q.q) conditions.push(sql`(message_body ILIKE ${"%" + q.q + "%"} OR phone_number ILIKE ${"%" + q.q + "%"})`);

    const result = await runSafeList({
      table: "comms.whatsapp_messages",
      conditions,
      allowedOrderColumns: ALLOWED_ORDER,
      fallbackColumn: "id",
      orderBy: q.order_by,
      orderDir: q.order_dir,
      limit: safeLimit(q.limit),
      offset: safeOffset(q.offset),
    });
    res.json(result);
  } catch (err) { sendDbError(res, err, "whatsapp:list"); }
});

router.get("/:id", async (req, res) => {
  const id = idFromParams(req, res); if (!id) return;
  try {
    const r = await db.execute(sql`
      select * from comms.whatsapp_messages
      where id = ${id} and coalesce(is_deleted, false) = false
    `);
    const row = (r.rows ?? [])[0];
    if (!row) return res.status(404).json({ error: "הודעת WhatsApp לא נמצאה" });
    res.json(row);
  } catch (err) { sendDbError(res, err, "whatsapp:get"); }
});

router.post("/send", async (req, res) => {
  const d = parseBody(SendWhatsAppSchema, req, res); if (!d) return;
  const uid = currentUserId(req);
  try {
    let body = d.message_body;
    if (d.template_id) {
      const tpl = await db.execute(sql`
        select body from comms.message_templates
        where id = ${d.template_id} and coalesce(is_deleted, false) = false
      `);
      const t = (tpl.rows ?? [])[0] as { body?: string } | undefined;
      if (t?.body) {
        body = renderTemplate(t.body, (d.template_variables ?? {}) as Record<string, unknown>);
      }
    }

    const r = await db.execute(sql`
      insert into comms.whatsapp_messages (
        thread_id, recipient_id, phone_number, message_body,
        direction, status, linked_entity_type, linked_entity_id,
        metadata, created_by, updated_by, created_at, updated_at
      ) values (
        ${d.thread_id ?? null}, ${d.recipient_id ?? null},
        ${d.phone_number}, ${body}, 'outbound', 'sent',
        ${d.linked_entity_type ?? null}, ${d.linked_entity_id ?? null},
        ${JSON.stringify(d.metadata ?? {})}::jsonb,
        ${uid}, ${uid}, now(), now()
      ) returning *
    `);
    res.status(201).json((r.rows ?? [])[0]);
  } catch (err) { sendDbError(res, err, "whatsapp:send"); }
});

router.patch("/:id", async (req, res) => {
  const id = idFromParams(req, res); if (!id) return;
  const d = parseBody(UpdateWhatsAppSchema, req, res); if (!d) return;
  try {
    const r = await db.execute(sql`
      update comms.whatsapp_messages set
        status = coalesce(${d.status ?? null}, status),
        delivery_status = coalesce(${d.delivery_status ?? null}, delivery_status),
        metadata = coalesce(${d.metadata ? JSON.stringify(d.metadata) : null}::jsonb, metadata),
        updated_at = now()
      where id = ${id} and coalesce(is_deleted, false) = false
      returning *
    `);
    const row = (r.rows ?? [])[0];
    if (!row) return res.status(404).json({ error: "הודעת WhatsApp לא נמצאה" });
    res.json(row);
  } catch (err) { sendDbError(res, err, "whatsapp:update"); }
});

router.delete("/:id", async (req, res) => {
  const id = idFromParams(req, res); if (!id) return;
  try {
    const r = await db.execute(sql`
      update comms.whatsapp_messages set is_deleted = true, updated_at = now()
      where id = ${id} and coalesce(is_deleted, false) = false
      returning id
    `);
    if ((r.rows ?? []).length === 0) return res.status(404).json({ error: "הודעת WhatsApp לא נמצאה" });
    res.status(204).send();
  } catch (err) { sendDbError(res, err, "whatsapp:delete"); }
});

export default router;
