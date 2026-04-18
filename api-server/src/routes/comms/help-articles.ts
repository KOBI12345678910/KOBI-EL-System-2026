// ============================================================
// comms.help_articles — knowledge base
// ============================================================
import { Router, type Request, type Response } from "express";
import {
  CreateHelpArticleSchema,
  UpdateHelpArticleSchema,
  ListHelpArticlesQuerySchema,
} from "@workspace/api-zod/comms";
import {
  db, sql, authMiddleware,
  parseBody, parseQuery, idFromParams, currentUserId, sendDbError,
  runSafeList, safeLimit, safeOffset,
} from "./_helpers";

const router = Router();
router.use(authMiddleware);

const ALLOWED_ORDER = new Set([
  "id", "created_at", "updated_at", "published_at", "title", "category", "status", "view_count",
]);

router.get("/", async (req: Request, res: Response) => {
  const q = parseQuery(ListHelpArticlesQuerySchema, req, res);
  if (!q) return;
  try {
    const conditions = [sql`coalesce(is_deleted, false) = false`];
    if (q.category) conditions.push(sql`category = ${q.category}`);
    if (q.status) conditions.push(sql`status = ${q.status}`);
    if (q.q) conditions.push(sql`(title ILIKE ${"%" + q.q + "%"} OR body ILIKE ${"%" + q.q + "%"} OR article_code ILIKE ${"%" + q.q + "%"})`);

    const result = await runSafeList({
      table: "comms.help_articles",
      conditions,
      allowedOrderColumns: ALLOWED_ORDER,
      fallbackColumn: "id",
      orderBy: q.order_by,
      orderDir: q.order_dir,
      limit: safeLimit(q.limit),
      offset: safeOffset(q.offset),
    });
    res.json(result);
  } catch (err) { sendDbError(res, err, "help:list"); }
});

router.get("/:id", async (req, res) => {
  const id = idFromParams(req, res); if (!id) return;
  try {
    const r = await db.execute(sql`
      select * from comms.help_articles
      where id = ${id} and coalesce(is_deleted, false) = false
    `);
    const row = (r.rows ?? [])[0];
    if (!row) return res.status(404).json({ error: "מאמר לא נמצא" });
    res.json(row);
  } catch (err) { sendDbError(res, err, "help:get"); }
});

router.post("/", async (req, res) => {
  const d = parseBody(CreateHelpArticleSchema, req, res); if (!d) return;
  const uid = currentUserId(req);
  try {
    const r = await db.execute(sql`
      insert into comms.help_articles (
        article_code, title, body, category, slug, status, published_at,
        metadata, created_by, updated_by, created_at, updated_at
      ) values (
        ${d.article_code}, ${d.title}, ${d.body}, ${d.category ?? null},
        ${d.slug ?? null}, ${d.status ?? "draft"}, ${d.published_at ?? null},
        ${JSON.stringify(d.metadata ?? {})}::jsonb,
        ${uid}, ${uid}, now(), now()
      ) returning *
    `);
    res.status(201).json((r.rows ?? [])[0]);
  } catch (err) { sendDbError(res, err, "help:create"); }
});

router.patch("/:id", async (req, res) => {
  const id = idFromParams(req, res); if (!id) return;
  const d = parseBody(UpdateHelpArticleSchema, req, res); if (!d) return;
  try {
    const r = await db.execute(sql`
      update comms.help_articles set
        title = coalesce(${d.title ?? null}, title),
        body = coalesce(${d.body ?? null}, body),
        category = coalesce(${d.category ?? null}, category),
        slug = coalesce(${d.slug ?? null}, slug),
        status = coalesce(${d.status ?? null}, status),
        published_at = coalesce(${d.published_at ?? null}, published_at),
        metadata = coalesce(${d.metadata ? JSON.stringify(d.metadata) : null}::jsonb, metadata),
        updated_at = now()
      where id = ${id} and coalesce(is_deleted, false) = false
      returning *
    `);
    const row = (r.rows ?? [])[0];
    if (!row) return res.status(404).json({ error: "מאמר לא נמצא" });
    res.json(row);
  } catch (err) { sendDbError(res, err, "help:update"); }
});

router.delete("/:id", async (req, res) => {
  const id = idFromParams(req, res); if (!id) return;
  try {
    const r = await db.execute(sql`
      update comms.help_articles set is_deleted = true, updated_at = now()
      where id = ${id} and coalesce(is_deleted, false) = false
      returning id
    `);
    if ((r.rows ?? []).length === 0) return res.status(404).json({ error: "מאמר לא נמצא" });
    res.status(204).send();
  } catch (err) { sendDbError(res, err, "help:delete"); }
});

export default router;
