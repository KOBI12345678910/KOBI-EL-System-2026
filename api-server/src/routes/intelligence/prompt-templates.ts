// ============================================================
// intelligence.prompt_templates CRUD + test-run
// ============================================================
import { Router, type IRouter } from "express";
import {
  CreatePromptTemplateSchema,
  UpdatePromptTemplateSchema,
  TestRunPromptTemplateSchema,
  ListPromptTemplatesQuerySchema,
} from "@workspace/api-zod/intelligence";
import { authMiddleware } from "../../middleware/auth";
import {
  db, sql, type SQL,
  parseBody, parseQuery, parseUuidId, sendDbError, getUserId, jsonbParam,
  buildSafeWhere, buildSafeOrderByFragment, buildSafeSetClause,
  safeLimit, safeOffset, buildListResponse,
} from "./_helpers";

const router: IRouter = Router();
router.use(authMiddleware);

const ALLOWED_ORDER_BY = new Set(["created_at", "updated_at", "template_name", "usage_count", "category"]);
const ALLOWED_UPDATE_COLS = new Set([
  "template_name","template_text","variables","category","language","is_active","usage_count",
  "notes","metadata","is_deleted","record_code","updated_by",
]);

/** Minimal Mustache-style renderer: replace {{key}} with variables[key] */
function renderTemplate(tpl: string, variables: Record<string, unknown>): string {
  return tpl.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_m, key) => {
    const v = variables[key];
    return v === undefined || v === null ? "" : String(v);
  });
}

router.get("/prompt-templates", async (req, res) => {
  const q = parseQuery(ListPromptTemplatesQuerySchema, req, res); if (!q) return;
  try {
    const conditions: SQL[] = [sql`coalesce(is_deleted, false) = false`];
    if (q.q) conditions.push(sql`(template_name ILIKE ${"%" + q.q + "%"} OR template_text ILIKE ${"%" + q.q + "%"})`);
    if (q.category) conditions.push(sql`category = ${q.category}`);
    if (q.language) conditions.push(sql`language = ${q.language}`);
    if (q.is_active !== undefined) conditions.push(sql`is_active = ${q.is_active}`);

    const where = buildSafeWhere(conditions);
    const orderBy = buildSafeOrderByFragment(q.order_by, q.order_dir, ALLOWED_ORDER_BY, "created_at");
    const limit = safeLimit(q.limit, 500);
    const offset = safeOffset(q.offset);

    const rows = await db.execute(sql`select * from intelligence.prompt_templates ${where} ${orderBy} limit ${limit} offset ${offset}`);
    const countRes = await db.execute(sql`select count(*)::bigint as total from intelligence.prompt_templates ${where}`);
    const total = Number((countRes.rows?.[0] as { total?: number })?.total ?? 0);
    res.json({ ...buildListResponse(rows.rows ?? [], total, limit, offset), rows: rows.rows ?? [], total, limit, offset });
  } catch (err) { sendDbError(res, err, "prompt-templates:list"); }
});

router.get("/prompt-templates/:id", async (req, res) => {
  const id = parseUuidId(req, res); if (!id) return;
  try {
    const r = await db.execute(sql`select * from intelligence.prompt_templates where id = ${id} and coalesce(is_deleted,false)=false limit 1`);
    const row = (r.rows ?? [])[0];
    if (!row) return res.status(404).json({ error: "לא נמצא" });
    res.json(row);
  } catch (err) { sendDbError(res, err, "prompt-templates:get"); }
});

router.post("/prompt-templates", async (req, res) => {
  const d = parseBody(CreatePromptTemplateSchema, req, res); if (!d) return;
  const uid = getUserId(req);
  try {
    const r = await db.execute(sql`
      insert into intelligence.prompt_templates
        (template_name, template_text, variables, category, language, is_active, usage_count, notes, metadata, created_by, updated_by)
      values
        (${d.template_name}, ${d.template_text}, ${jsonbParam(d.variables ?? {})}::jsonb, ${d.category ?? null}, ${d.language ?? "he"},
         ${d.is_active ?? true}, ${d.usage_count ?? 0}, ${d.notes ?? null}, ${jsonbParam(d.metadata ?? {})}::jsonb, ${uid}, ${uid})
      returning *`);
    res.status(201).json((r.rows ?? [])[0]);
  } catch (err) { sendDbError(res, err, "prompt-templates:create"); }
});

router.put("/prompt-templates/:id", async (req, res) => {
  const id = parseUuidId(req, res); if (!id) return;
  const d = parseBody(UpdatePromptTemplateSchema, req, res); if (!d) return;
  const uid = getUserId(req);
  try {
    const updates: Record<string, unknown> = { ...d, updated_by: uid };
    if (d.metadata !== undefined) updates.metadata = jsonbParam(d.metadata);
    if (d.variables !== undefined) updates.variables = jsonbParam(d.variables);
    const { fragment, hasUpdates } = buildSafeSetClause(updates, ALLOWED_UPDATE_COLS);
    if (!hasUpdates) return res.status(400).json({ error: "אין שדות לעדכון" });
    const r = await db.execute(sql`update intelligence.prompt_templates set ${fragment}, updated_at = now() where id = ${id} returning *`);
    const row = (r.rows ?? [])[0];
    if (!row) return res.status(404).json({ error: "לא נמצא" });
    res.json(row);
  } catch (err) { sendDbError(res, err, "prompt-templates:update"); }
});

router.post("/prompt-templates/:id/test-run", async (req, res) => {
  const id = parseUuidId(req, res); if (!id) return;
  const d = parseBody(TestRunPromptTemplateSchema, req, res); if (!d) return;
  try {
    const r = await db.execute(sql`select template_name, template_text from intelligence.prompt_templates where id = ${id} and coalesce(is_deleted,false)=false limit 1`);
    const row = (r.rows ?? [])[0] as { template_name?: string; template_text?: string } | undefined;
    if (!row?.template_text) return res.status(404).json({ error: "לא נמצא" });

    const rendered = renderTemplate(row.template_text, d.variables ?? {});
    // increment usage count
    await db.execute(sql`update intelligence.prompt_templates set usage_count = usage_count + 1, updated_at = now() where id = ${id}`);
    res.json({
      success: true,
      template_id: id,
      template_name: row.template_name,
      variables: d.variables ?? {},
      rendered_prompt: rendered,
    });
  } catch (err) { sendDbError(res, err, "prompt-templates:test-run"); }
});

router.delete("/prompt-templates/:id", async (req, res) => {
  const id = parseUuidId(req, res); if (!id) return;
  const uid = getUserId(req);
  try {
    const r = await db.execute(sql`update intelligence.prompt_templates set is_deleted = true, is_active = false, updated_by = ${uid}, updated_at = now() where id = ${id} returning id`);
    if (!(r.rows ?? []).length) return res.status(404).json({ error: "לא נמצא" });
    res.json({ success: true, id });
  } catch (err) { sendDbError(res, err, "prompt-templates:delete"); }
});

export default router;
