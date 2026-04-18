// ============================================================
// API router — commercial.lead_sources
// Full CRUD, Zod-validated, auth-guarded, audit-logged.
// Generated: 2026-04-18
// ============================================================
import { Router, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { authMiddleware } from "../../middleware/auth";
import { logAudit } from "../../lib/audit-log";
import {
  CreateLeadSourceSchema,
  UpdateLeadSourceSchema,
  ListLeadSourcesQuerySchema,
} from "@workspace/api-zod/commercial";

const router = Router();
router.use(authMiddleware);

const TABLE = "commercial.lead_sources";

// ──────────────────────────────────────────────────────────────
// LIST  GET /api/commercial/lead-sources
// ──────────────────────────────────────────────────────────────
router.get("/", async (req: Request, res: Response) => {
  const parsed = ListLeadSourcesQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "בקשה לא תקינה", details: parsed.error.flatten() });
    return;
  }
  const { q, channel, is_active, limit, offset, order_by, order_dir } = parsed.data;

  const whereParts: string[] = [];
  if (q) whereParts.push(`(name_he ILIKE '%${q.replace(/'/g, "''")}%' OR code ILIKE '%${q.replace(/'/g, "''")}%')`);
  if (channel) whereParts.push(`channel = '${channel}'`);
  if (typeof is_active === "boolean") whereParts.push(`is_active = ${is_active}`);
  const whereClause = whereParts.length ? `where ${whereParts.join(" and ")}` : "";
  const orderClause = `order by ${order_by} ${order_dir}`;

  try {
    const rows = await db.execute(sql.raw(`
      select id, public_id, code, name_he, name_en, channel, description,
             is_active, sort_order, metadata,
             created_at, updated_at, created_by, updated_by
      from ${TABLE}
      ${whereClause}
      ${orderClause}
      limit ${limit} offset ${offset}
    `));
    const countRes = await db.execute(sql.raw(`select count(*)::int as total from ${TABLE} ${whereClause}`));
    res.json({
      data: rows.rows ?? [],
      total: Number((countRes.rows?.[0] as { total?: number })?.total ?? 0),
      limit,
      offset,
    });
  } catch (err: unknown) {
    console.error("[lead-sources:list]", err);
    res.status(500).json({ error: "שגיאה בטעינת מקורות לידים" });
  }
});

// ──────────────────────────────────────────────────────────────
// GET  /:id
// ──────────────────────────────────────────────────────────────
router.get("/:id", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "מזהה לא תקין" });
    return;
  }
  try {
    const r = await db.execute(sql`
      select id, public_id, code, name_he, name_en, channel, description,
             is_active, sort_order, metadata,
             created_at, updated_at, created_by, updated_by
      from commercial.lead_sources
      where id = ${id}
      limit 1
    `);
    const row = (r.rows ?? [])[0];
    if (!row) {
      res.status(404).json({ error: "מקור ליד לא נמצא" });
      return;
    }
    res.json(row);
  } catch (err) {
    console.error("[lead-sources:get]", err);
    res.status(500).json({ error: "שגיאה בטעינת מקור ליד" });
  }
});

// ──────────────────────────────────────────────────────────────
// POST /
// ──────────────────────────────────────────────────────────────
router.post("/", async (req: Request, res: Response) => {
  const parsed = CreateLeadSourceSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "בקשה לא תקינה", details: parsed.error.flatten() });
    return;
  }
  const d = parsed.data;
  const userId = Number(req.userId) || null;

  try {
    const r = await db.execute(sql`
      insert into commercial.lead_sources
        (code, name_he, name_en, channel, description, is_active, sort_order, metadata, created_by, updated_by)
      values
        (${d.code}, ${d.name_he}, ${d.name_en ?? null}, ${d.channel}, ${d.description ?? null},
         ${d.is_active}, ${d.sort_order}, ${JSON.stringify(d.metadata ?? {})}::jsonb,
         ${userId}, ${userId})
      returning id, public_id, code, name_he, name_en, channel, description,
                is_active, sort_order, metadata, created_at, updated_at
    `);
    const row = (r.rows ?? [])[0] as { id: number } | undefined;
    if (row) {
      await logAudit({
        user_id: userId,
        table_name: "commercial_lead_sources",
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
      res.status(409).json({ error: "קוד מקור קיים כבר" });
      return;
    }
    console.error("[lead-sources:create]", err);
    res.status(500).json({ error: "שגיאה ביצירת מקור ליד" });
  }
});

// ──────────────────────────────────────────────────────────────
// PATCH /:id
// ──────────────────────────────────────────────────────────────
router.patch("/:id", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "מזהה לא תקין" });
    return;
  }
  const parsed = UpdateLeadSourceSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "בקשה לא תקינה", details: parsed.error.flatten() });
    return;
  }
  const d = parsed.data;
  const userId = Number(req.userId) || null;

  const entries = Object.entries(d).filter(([, v]) => v !== undefined);
  if (entries.length === 0) {
    res.status(400).json({ error: "אין שינויים לעדכון" });
    return;
  }

  // Build SET clause safely
  const setFragments = entries.map(([k, v]) => {
    if (k === "metadata") return sql`${sql.raw(k)} = ${JSON.stringify(v ?? {})}::jsonb`;
    return sql`${sql.raw(k)} = ${v as unknown as string | number | boolean | null}`;
  });

  try {
    const r = await db.execute(sql`
      update commercial.lead_sources
      set ${sql.join(setFragments, sql`, `)},
          updated_by = ${userId},
          updated_at = now()
      where id = ${id}
      returning id, public_id, code, name_he, name_en, channel, description,
                is_active, sort_order, metadata, created_at, updated_at
    `);
    const row = (r.rows ?? [])[0];
    if (!row) {
      res.status(404).json({ error: "מקור ליד לא נמצא" });
      return;
    }
    await logAudit({
      user_id: userId,
      table_name: "commercial_lead_sources",
      record_id: id,
      action: "UPDATE",
      new_values: d as Record<string, unknown>,
      ip_address: req.ip ?? null,
    });
    res.json(row);
  } catch (err) {
    console.error("[lead-sources:update]", err);
    res.status(500).json({ error: "שגיאה בעדכון מקור ליד" });
  }
});

// ──────────────────────────────────────────────────────────────
// DELETE /:id   (soft delete = is_active=false)
// ──────────────────────────────────────────────────────────────
router.delete("/:id", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "מזהה לא תקין" });
    return;
  }
  const userId = Number(req.userId) || null;
  try {
    const r = await db.execute(sql`
      update commercial.lead_sources
      set is_active = false, updated_by = ${userId}, updated_at = now()
      where id = ${id}
      returning id
    `);
    if ((r.rows ?? []).length === 0) {
      res.status(404).json({ error: "מקור ליד לא נמצא" });
      return;
    }
    await logAudit({
      user_id: userId,
      table_name: "commercial_lead_sources",
      record_id: id,
      action: "DELETE",
      ip_address: req.ip ?? null,
      notes: "soft delete (is_active=false)",
    });
    res.status(204).send();
  } catch (err) {
    console.error("[lead-sources:delete]", err);
    res.status(500).json({ error: "שגיאה בהשבתת מקור ליד" });
  }
});

export default router;
