// ============================================================
// comms.chatbot_sessions — admin/internal
// ============================================================
import { Router, type Request, type Response } from "express";
import {
  CreateChatbotSessionSchema,
  UpdateChatbotSessionSchema,
  ListChatbotSessionsQuerySchema,
  ChatbotFeedbackSchema,
} from "@workspace/api-zod/comms";
import {
  db, sql, authMiddleware,
  parseBody, parseQuery, idFromParams, currentUserId, sendDbError,
  runSafeList, safeLimit, safeOffset,
} from "./_helpers";

const router = Router();
router.use(authMiddleware);

const ALLOWED_ORDER = new Set([
  "id", "started_at", "ended_at", "created_at", "updated_at", "state",
]);

router.get("/", async (req: Request, res: Response) => {
  const q = parseQuery(ListChatbotSessionsQuerySchema, req, res);
  if (!q) return;
  try {
    const conditions = [sql`coalesce(is_deleted, false) = false`];
    if (q.state) conditions.push(sql`state = ${q.state}`);
    if (q.user_id) conditions.push(sql`user_id = ${q.user_id}`);
    if (q.channel) conditions.push(sql`channel = ${q.channel}`);
    if (q.q) conditions.push(sql`transcript ILIKE ${"%" + q.q + "%"}`);

    const result = await runSafeList({
      table: "comms.chatbot_sessions",
      conditions,
      allowedOrderColumns: ALLOWED_ORDER,
      fallbackColumn: "id",
      orderBy: q.order_by,
      orderDir: q.order_dir,
      limit: safeLimit(q.limit),
      offset: safeOffset(q.offset),
    });
    res.json(result);
  } catch (err) { sendDbError(res, err, "chatbot:list"); }
});

router.get("/:id", async (req, res) => {
  const id = idFromParams(req, res); if (!id) return;
  try {
    const r = await db.execute(sql`
      select * from comms.chatbot_sessions
      where id = ${id} and coalesce(is_deleted, false) = false
    `);
    const row = (r.rows ?? [])[0];
    if (!row) return res.status(404).json({ error: "שיחת צ׳אטבוט לא נמצאה" });
    res.json(row);
  } catch (err) { sendDbError(res, err, "chatbot:get"); }
});

router.post("/", async (req, res) => {
  const d = parseBody(CreateChatbotSessionSchema, req, res); if (!d) return;
  const uid = currentUserId(req);
  try {
    const r = await db.execute(sql`
      insert into comms.chatbot_sessions (
        user_id, portal_user_id, linked_entity_type, linked_entity_id,
        channel, state, transcript, metadata, created_by, updated_by,
        started_at, created_at, updated_at
      ) values (
        ${d.user_id ?? null}, ${d.portal_user_id ?? null},
        ${d.linked_entity_type ?? null}, ${d.linked_entity_id ?? null},
        ${d.channel ?? null}, ${d.state ?? "Open"},
        ${d.transcript ?? null},
        ${JSON.stringify(d.metadata ?? {})}::jsonb,
        ${uid}, ${uid}, now(), now(), now()
      ) returning *
    `);
    res.status(201).json((r.rows ?? [])[0]);
  } catch (err) { sendDbError(res, err, "chatbot:create"); }
});

router.patch("/:id", async (req, res) => {
  const id = idFromParams(req, res); if (!id) return;
  const d = parseBody(UpdateChatbotSessionSchema, req, res); if (!d) return;
  try {
    const r = await db.execute(sql`
      update comms.chatbot_sessions set
        state = coalesce(${d.state ?? null}, state),
        ended_at = coalesce(${d.ended_at ?? null}, ended_at),
        transcript = coalesce(${d.transcript ?? null}, transcript),
        channel = coalesce(${d.channel ?? null}, channel),
        metadata = coalesce(${d.metadata ? JSON.stringify(d.metadata) : null}::jsonb, metadata),
        updated_at = now()
      where id = ${id} and coalesce(is_deleted, false) = false
      returning *
    `);
    const row = (r.rows ?? [])[0];
    if (!row) return res.status(404).json({ error: "שיחת צ׳אטבוט לא נמצאה" });
    res.json(row);
  } catch (err) { sendDbError(res, err, "chatbot:update"); }
});

router.post("/:id/feedback", async (req, res) => {
  const id = idFromParams(req, res); if (!id) return;
  const d = parseBody(ChatbotFeedbackSchema, req, res); if (!d) return;
  const uid = currentUserId(req);
  try {
    const r = await db.execute(sql`
      insert into comms.chatbot_feedback (session_id, user_id, rating, feedback_text, created_at)
      values (${id}, ${uid}, ${d.rating}, ${d.feedback_text ?? null}, now())
      returning *
    `);
    res.status(201).json((r.rows ?? [])[0]);
  } catch (err) { sendDbError(res, err, "chatbot:feedback"); }
});

router.delete("/:id", async (req, res) => {
  const id = idFromParams(req, res); if (!id) return;
  try {
    const r = await db.execute(sql`
      update comms.chatbot_sessions set is_deleted = true, updated_at = now()
      where id = ${id} and coalesce(is_deleted, false) = false
      returning id
    `);
    if ((r.rows ?? []).length === 0) return res.status(404).json({ error: "שיחת צ׳אטבוט לא נמצאה" });
    res.status(204).send();
  } catch (err) { sendDbError(res, err, "chatbot:delete"); }
});

export default router;
