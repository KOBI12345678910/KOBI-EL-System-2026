// ============================================================
// comms.email_messages — list / get / send (enqueue) / update / delete
// ============================================================
import { Router, type Request, type Response } from "express";
import {
  SendEmailSchema,
  UpdateEmailSchema,
  ListEmailsQuerySchema,
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
  const q = parseQuery(ListEmailsQuerySchema, req, res);
  if (!q) return;
  try {
    const conditions = [sql`coalesce(is_deleted, false) = false`];
    if (q.status) conditions.push(sql`status = ${q.status}`);
    if (q.recipient_id) conditions.push(sql`recipient_id = ${q.recipient_id}`);
    if (q.thread_id) conditions.push(sql`thread_id = ${q.thread_id}`);
    const from = safeDateParam(q.from_date);
    if (from) conditions.push(sql`sent_at >= ${from}`);
    const to = safeDateParam(q.to_date);
    if (to) conditions.push(sql`sent_at <= ${to}`);
    if (q.q) conditions.push(sql`(subject ILIKE ${"%" + q.q + "%"} OR to_addresses ILIKE ${"%" + q.q + "%"})`);

    const result = await runSafeList({
      table: "comms.email_messages",
      conditions,
      allowedOrderColumns: ALLOWED_ORDER,
      fallbackColumn: "id",
      orderBy: q.order_by,
      orderDir: q.order_dir,
      limit: safeLimit(q.limit),
      offset: safeOffset(q.offset),
    });
    res.json(result);
  } catch (err) { sendDbError(res, err, "email:list"); }
});

router.get("/:id", async (req, res) => {
  const id = idFromParams(req, res); if (!id) return;
  try {
    const r = await db.execute(sql`
      select * from comms.email_messages
      where id = ${id} and coalesce(is_deleted, false) = false
    `);
    const row = (r.rows ?? [])[0];
    if (!row) return res.status(404).json({ error: "הודעת אימייל לא נמצאה" });
    res.json(row);
  } catch (err) { sendDbError(res, err, "email:get"); }
});

// POST /send — enqueue an email (template-aware)
router.post("/send", async (req, res) => {
  const d = parseBody(SendEmailSchema, req, res); if (!d) return;
  const uid = currentUserId(req);
  try {
    let subject = d.subject;
    let bodyText = d.body_text ?? null;
    let bodyHtml = d.body_html ?? null;

    if (d.template_id) {
      const tpl = await db.execute(sql`
        select subject, body, channel from comms.message_templates
        where id = ${d.template_id} and coalesce(is_deleted, false) = false
      `);
      const t = (tpl.rows ?? [])[0] as { subject?: string; body?: string } | undefined;
      if (t) {
        const vars = (d.template_variables ?? {}) as Record<string, unknown>;
        if (t.subject) subject = renderTemplate(t.subject, vars);
        if (t.body) bodyText = renderTemplate(t.body, vars);
      }
    }

    const r = await db.execute(sql`
      insert into comms.email_messages (
        thread_id, recipient_id, from_address, to_addresses, cc_addresses, bcc_addresses,
        subject, body_text, body_html, direction, status, linked_entity_type, linked_entity_id,
        metadata, created_by, updated_by, created_at, updated_at
      ) values (
        ${d.thread_id ?? null}, ${d.recipient_id ?? null}, null,
        ${d.to_addresses}, ${d.cc_addresses ?? null}, ${d.bcc_addresses ?? null},
        ${subject}, ${bodyText}, ${bodyHtml},
        'outbound', 'queued',
        ${d.linked_entity_type ?? null}, ${d.linked_entity_id ?? null},
        ${JSON.stringify(d.metadata ?? {})}::jsonb,
        ${uid}, ${uid}, now(), now()
      ) returning *
    `);
    res.status(201).json((r.rows ?? [])[0]);
  } catch (err) { sendDbError(res, err, "email:send"); }
});

router.patch("/:id", async (req, res) => {
  const id = idFromParams(req, res); if (!id) return;
  const d = parseBody(UpdateEmailSchema, req, res); if (!d) return;
  try {
    const r = await db.execute(sql`
      update comms.email_messages set
        status = coalesce(${d.status ?? null}, status),
        delivery_status = coalesce(${d.delivery_status ?? null}, delivery_status),
        metadata = coalesce(${d.metadata ? JSON.stringify(d.metadata) : null}::jsonb, metadata),
        updated_at = now()
      where id = ${id} and coalesce(is_deleted, false) = false
      returning *
    `);
    const row = (r.rows ?? [])[0];
    if (!row) return res.status(404).json({ error: "הודעת אימייל לא נמצאה" });
    res.json(row);
  } catch (err) { sendDbError(res, err, "email:update"); }
});

router.delete("/:id", async (req, res) => {
  const id = idFromParams(req, res); if (!id) return;
  try {
    const r = await db.execute(sql`
      update comms.email_messages set is_deleted = true, updated_at = now()
      where id = ${id} and coalesce(is_deleted, false) = false
      returning id
    `);
    if ((r.rows ?? []).length === 0) return res.status(404).json({ error: "הודעת אימייל לא נמצאה" });
    res.status(204).send();
  } catch (err) { sendDbError(res, err, "email:delete"); }
});

export default router;
