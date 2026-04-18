// ============================================================
// API router — commercial.pricing_rules
// Full CRUD + /active filter, Zod-validated, auth-guarded, audit-logged.
// Generated: 2026-04-18
// ============================================================
import { Router, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { authMiddleware } from "../../middleware/auth";
import { logAudit } from "../../lib/audit-log";
import {
  CreatePricingRuleSchema,
  UpdatePricingRuleSchema,
  ListPricingRulesQuerySchema,
} from "@workspace/api-zod/commercial";

const router = Router();
router.use(authMiddleware);

// ──────────────────────────────────────────────────────────────
// LIST
// ──────────────────────────────────────────────────────────────
router.get("/", async (req: Request, res: Response) => {
  const parsed = ListPricingRulesQuerySchema.safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: "בקשה לא תקינה", details: parsed.error.flatten() }); return; }
  const { q, scope, rule_type, is_active, only_current, limit, offset, order_by, order_dir } = parsed.data;

  const whereParts: string[] = [];
  if (q) {
    const safe = q.replace(/'/g, "''");
    whereParts.push(`(name_he ILIKE '%${safe}%' OR code ILIKE '%${safe}%')`);
  }
  if (scope) whereParts.push(`scope = '${scope}'`);
  if (rule_type) whereParts.push(`rule_type = '${rule_type}'`);
  if (typeof is_active === "boolean") whereParts.push(`is_active = ${is_active}`);
  if (only_current) {
    whereParts.push(`(valid_from is null or valid_from <= current_date)`);
    whereParts.push(`(valid_to is null or valid_to >= current_date)`);
  }
  const whereClause = whereParts.length ? `where ${whereParts.join(" and ")}` : "";

  try {
    const rows = await db.execute(sql.raw(`
      select id, public_id, code, name_he, name_en, description,
             scope, scope_ref_id, rule_type, rule_value,
             valid_from, valid_to, priority, is_active, metadata,
             created_at, updated_at, created_by, updated_by
      from commercial.pricing_rules
      ${whereClause}
      order by ${order_by} ${order_dir}
      limit ${limit} offset ${offset}
    `));
    const countRes = await db.execute(sql.raw(`select count(*)::int as total from commercial.pricing_rules ${whereClause}`));
    res.json({
      data: rows.rows ?? [],
      total: Number((countRes.rows?.[0] as { total?: number })?.total ?? 0),
      limit, offset,
    });
  } catch (err) {
    console.error("[pricing-rules:list]", err);
    res.status(500).json({ error: "שגיאה בטעינת כללי תמחור" });
  }
});

// ──────────────────────────────────────────────────────────────
// GET /:id
// ──────────────────────────────────────────────────────────────
router.get("/:id", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "מזהה לא תקין" }); return; }
  try {
    const r = await db.execute(sql`
      select * from commercial.pricing_rules where id = ${id} limit 1
    `);
    const row = (r.rows ?? [])[0];
    if (!row) { res.status(404).json({ error: "כלל תמחור לא נמצא" }); return; }
    res.json(row);
  } catch (err) {
    console.error("[pricing-rules:get]", err);
    res.status(500).json({ error: "שגיאה בטעינת כלל תמחור" });
  }
});

// ──────────────────────────────────────────────────────────────
// POST /
// ──────────────────────────────────────────────────────────────
router.post("/", async (req: Request, res: Response) => {
  const parsed = CreatePricingRuleSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "בקשה לא תקינה", details: parsed.error.flatten() }); return; }
  const d = parsed.data;
  const userId = Number(req.userId) || null;
  try {
    const r = await db.execute(sql`
      insert into commercial.pricing_rules (
        code, name_he, name_en, description,
        scope, scope_ref_id, rule_type, rule_value,
        valid_from, valid_to, priority, is_active, metadata,
        created_by, updated_by
      ) values (
        ${d.code}, ${d.name_he}, ${d.name_en ?? null}, ${d.description ?? null},
        ${d.scope}, ${d.scope_ref_id ?? null}, ${d.rule_type},
        ${JSON.stringify(d.rule_value)}::jsonb,
        ${d.valid_from ?? null}, ${d.valid_to ?? null},
        ${d.priority ?? 100}, ${d.is_active ?? true},
        ${JSON.stringify(d.metadata ?? {})}::jsonb,
        ${userId}, ${userId}
      )
      returning *
    `);
    const row = (r.rows ?? [])[0] as { id: number } | undefined;
    if (row) {
      await logAudit({
        user_id: userId,
        table_name: "commercial_pricing_rules",
        record_id: row.id,
        action: "INSERT",
        new_values: d as Record<string, unknown>,
        ip_address: req.ip ?? null,
      });
    }
    res.status(201).json(row);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("duplicate key")) {
      res.status(409).json({ error: "קוד כלל כבר קיים" });
      return;
    }
    console.error("[pricing-rules:create]", err);
    res.status(500).json({ error: "שגיאה ביצירת כלל תמחור" });
  }
});

// ──────────────────────────────────────────────────────────────
// PATCH /:id
// ──────────────────────────────────────────────────────────────
router.patch("/:id", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "מזהה לא תקין" }); return; }
  const parsed = UpdatePricingRuleSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "בקשה לא תקינה", details: parsed.error.flatten() }); return; }
  const d = parsed.data;
  const userId = Number(req.userId) || null;

  const entries = Object.entries(d).filter(([, v]) => v !== undefined);
  if (entries.length === 0) { res.status(400).json({ error: "אין שינויים לעדכון" }); return; }

  const setFragments = entries.map(([k, v]) => {
    if (k === "metadata" || k === "rule_value") {
      if (v === null) return sql`${sql.raw(k)} = null`;
      return sql`${sql.raw(k)} = ${JSON.stringify(v ?? {})}::jsonb`;
    }
    return sql`${sql.raw(k)} = ${v as unknown as string | number | boolean | null}`;
  });

  try {
    const r = await db.execute(sql`
      update commercial.pricing_rules
      set ${sql.join(setFragments, sql`, `)},
          updated_by = ${userId},
          updated_at = now()
      where id = ${id}
      returning *
    `);
    const row = (r.rows ?? [])[0];
    if (!row) { res.status(404).json({ error: "כלל תמחור לא נמצא" }); return; }
    await logAudit({
      user_id: userId,
      table_name: "commercial_pricing_rules",
      record_id: id,
      action: "UPDATE",
      new_values: d as Record<string, unknown>,
      ip_address: req.ip ?? null,
    });
    res.json(row);
  } catch (err) {
    console.error("[pricing-rules:update]", err);
    res.status(500).json({ error: "שגיאה בעדכון כלל תמחור" });
  }
});

// ──────────────────────────────────────────────────────────────
// POST /:id/activate and /:id/deactivate
// ──────────────────────────────────────────────────────────────
router.post("/:id/activate", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "מזהה לא תקין" }); return; }
  const userId = Number(req.userId) || null;
  try {
    const r = await db.execute(sql`
      update commercial.pricing_rules
      set is_active = true, updated_by = ${userId}, updated_at = now()
      where id = ${id}
      returning id, is_active
    `);
    if ((r.rows ?? []).length === 0) { res.status(404).json({ error: "כלל תמחור לא נמצא" }); return; }
    await logAudit({
      user_id: userId, table_name: "commercial_pricing_rules", record_id: id,
      action: "UPDATE", new_values: { is_active: true }, ip_address: req.ip ?? null, notes: "activate",
    });
    res.json((r.rows ?? [])[0]);
  } catch (err) {
    console.error("[pricing-rules:activate]", err);
    res.status(500).json({ error: "שגיאה בהפעלת כלל" });
  }
});

router.post("/:id/deactivate", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "מזהה לא תקין" }); return; }
  const userId = Number(req.userId) || null;
  try {
    const r = await db.execute(sql`
      update commercial.pricing_rules
      set is_active = false, updated_by = ${userId}, updated_at = now()
      where id = ${id}
      returning id, is_active
    `);
    if ((r.rows ?? []).length === 0) { res.status(404).json({ error: "כלל תמחור לא נמצא" }); return; }
    await logAudit({
      user_id: userId, table_name: "commercial_pricing_rules", record_id: id,
      action: "UPDATE", new_values: { is_active: false }, ip_address: req.ip ?? null, notes: "deactivate",
    });
    res.json((r.rows ?? [])[0]);
  } catch (err) {
    console.error("[pricing-rules:deactivate]", err);
    res.status(500).json({ error: "שגיאה בהשבתת כלל" });
  }
});

// ──────────────────────────────────────────────────────────────
// DELETE /:id — hard delete (pricing rules are small admin rows)
// ──────────────────────────────────────────────────────────────
router.delete("/:id", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "מזהה לא תקין" }); return; }
  const userId = Number(req.userId) || null;
  try {
    const r = await db.execute(sql`delete from commercial.pricing_rules where id = ${id} returning id`);
    if ((r.rows ?? []).length === 0) { res.status(404).json({ error: "כלל תמחור לא נמצא" }); return; }
    await logAudit({
      user_id: userId, table_name: "commercial_pricing_rules", record_id: id,
      action: "DELETE", ip_address: req.ip ?? null, notes: "hard delete",
    });
    res.status(204).send();
  } catch (err) {
    console.error("[pricing-rules:delete]", err);
    res.status(500).json({ error: "שגיאה במחיקת כלל" });
  }
});

export default router;
