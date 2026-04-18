// ============================================================
// comms.message_templates — template CRUD + render preview
// ============================================================
import { Router, type Request, type Response } from "express";
import {
  CreateMessageTemplateSchema,
  UpdateMessageTemplateSchema,
  ListMessageTemplatesQuerySchema,
  RenderTemplateSchema,
} from "@workspace/api-zod/comms";
import {
  db, sql, authMiddleware,
  parseBody, parseQuery, idFromParams, currentUserId, sendDbError,
  runSafeList, safeLimit, safeOffset, renderTemplate,
} from "./_helpers";

const router = Router();
router.use(authMiddleware);

const ALLOWED_ORDER = new Set([
  "id", "created_at", "updated_at", "template_code", "name", "channel", "locale",
]);

router.get("/", async (req: Request, res: Response) => {
  const q = parseQuery(ListMessageTemplatesQuerySchema, req, res);
  if (!q) return;
  try {
    const conditions = [sql`coalesce(is_deleted, false) = false`];
    if (q.channel) conditions.push(sql`channel = ${q.channel}`);
    if (q.is_active !== undefined) conditions.push(sql`is_active = ${q.is_active}`);
    if (q.locale) conditions.push(sql`locale = ${q.locale}`);
    if (q.q) conditions.push(sql`(name ILIKE ${"%" + q.q + "%"} OR template_code ILIKE ${"%" + q.q + "%"} OR body ILIKE ${"%" + q.q + "%"})`);

    const result = await runSafeList({
      table: "comms.message_templates",
      conditions,
      allowedOrderColumns: ALLOWED_ORDER,
      fallbackColumn: "id",
      orderBy: q.order_by,
      orderDir: q.order_dir,
      limit: safeLimit(q.limit),
      offset: safeOffset(q.offset),
    });
    res.json(result);
  } catch (err) { sendDbError(res, err, "templates:list"); }
});

router.get("/:id", async (req, res) => {
  const id = idFromParams(req, res); if (!id) return;
  try {
    const r = await db.execute(sql`
      select * from comms.message_templates
      where id = ${id} and coalesce(is_deleted, false) = false
    `);
    const row = (r.rows ?? [])[0];
    if (!row) return res.status(404).json({ error: "תבנית לא נמצאה" });
    res.json(row);
  } catch (err) { sendDbError(res, err, "templates:get"); }
});

router.post("/", async (req, res) => {
  const d = parseBody(CreateMessageTemplateSchema, req, res); if (!d) return;
  const uid = currentUserId(req);
  try {
    const r = await db.execute(sql`
      insert into comms.message_templates (
        template_code, name, channel, subject, body, locale, variables,
        is_active, metadata, created_by, updated_by, created_at, updated_at
      ) values (
        ${d.template_code}, ${d.name}, ${d.channel},
        ${d.subject ?? null}, ${d.body}, ${d.locale ?? "he-IL"},
        ${JSON.stringify(d.variables ?? [])}::jsonb,
        ${d.is_active ?? true},
        ${JSON.stringify(d.metadata ?? {})}::jsonb,
        ${uid}, ${uid}, now(), now()
      ) returning *
    `);
    res.status(201).json((r.rows ?? [])[0]);
  } catch (err) { sendDbError(res, err, "templates:create"); }
});

router.patch("/:id", async (req, res) => {
  const id = idFromParams(req, res); if (!id) return;
  const d = parseBody(UpdateMessageTemplateSchema, req, res); if (!d) return;
  try {
    const r = await db.execute(sql`
      update comms.message_templates set
        name = coalesce(${d.name ?? null}, name),
        channel = coalesce(${d.channel ?? null}, channel),
        subject = coalesce(${d.subject ?? null}, subject),
        body = coalesce(${d.body ?? null}, body),
        locale = coalesce(${d.locale ?? null}, locale),
        variables = coalesce(${d.variables ? JSON.stringify(d.variables) : null}::jsonb, variables),
        is_active = coalesce(${d.is_active ?? null}, is_active),
        metadata = coalesce(${d.metadata ? JSON.stringify(d.metadata) : null}::jsonb, metadata),
        updated_at = now()
      where id = ${id} and coalesce(is_deleted, false) = false
      returning *
    `);
    const row = (r.rows ?? [])[0];
    if (!row) return res.status(404).json({ error: "תבנית לא נמצאה" });
    res.json(row);
  } catch (err) { sendDbError(res, err, "templates:update"); }
});

// POST /:id/render — preview by rendering the template with supplied variables
router.post("/:id/render", async (req, res) => {
  const id = idFromParams(req, res); if (!id) return;
  const d = parseBody(RenderTemplateSchema, req, res); if (!d) return;
  try {
    const r = await db.execute(sql`
      select template_code, name, channel, subject, body, locale
      from comms.message_templates
      where id = ${id} and coalesce(is_deleted, false) = false
    `);
    const row = (r.rows ?? [])[0] as {
      template_code: string; name: string; channel: string;
      subject: string | null; body: string; locale: string;
    } | undefined;
    if (!row) return res.status(404).json({ error: "תבנית לא נמצאה" });
    res.json({
      template_code: row.template_code,
      channel: row.channel,
      locale: row.locale,
      rendered_subject: row.subject ? renderTemplate(row.subject, d.variables) : null,
      rendered_body: renderTemplate(row.body, d.variables),
    });
  } catch (err) { sendDbError(res, err, "templates:render"); }
});

router.delete("/:id", async (req, res) => {
  const id = idFromParams(req, res); if (!id) return;
  try {
    const r = await db.execute(sql`
      update comms.message_templates set is_deleted = true, is_active = false, updated_at = now()
      where id = ${id} and coalesce(is_deleted, false) = false
      returning id
    `);
    if ((r.rows ?? []).length === 0) return res.status(404).json({ error: "תבנית לא נמצאה" });
    res.status(204).send();
  } catch (err) { sendDbError(res, err, "templates:delete"); }
});

export default router;
