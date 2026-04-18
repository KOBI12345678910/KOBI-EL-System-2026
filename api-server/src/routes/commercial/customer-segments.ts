// ============================================================
// API router — commercial.customer_segments
// Full CRUD + recount endpoint, Zod-validated, auth-guarded, audit-logged.
// Generated: 2026-04-18
// ============================================================
import { Router, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { authMiddleware } from "../../middleware/auth";
import { logAudit } from "../../lib/audit-log";
import {
  CreateCustomerSegmentSchema,
  UpdateCustomerSegmentSchema,
  ListCustomerSegmentsQuerySchema,
} from "@workspace/api-zod/commercial";

const router = Router();
router.use(authMiddleware);

// ──────────────────────────────────────────────────────────────
// LIST
// ──────────────────────────────────────────────────────────────
router.get("/", async (req: Request, res: Response) => {
  const parsed = ListCustomerSegmentsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "בקשה לא תקינה", details: parsed.error.flatten() });
    return;
  }
  const { q, segment_type, is_active, limit, offset, order_by, order_dir } = parsed.data;
  const whereParts: string[] = [];
  if (q) {
    const safe = q.replace(/'/g, "''");
    whereParts.push(`(name_he ILIKE '%${safe}%' OR code ILIKE '%${safe}%')`);
  }
  if (segment_type) whereParts.push(`segment_type = '${segment_type}'`);
  if (typeof is_active === "boolean") whereParts.push(`is_active = ${is_active}`);
  const whereClause = whereParts.length ? `where ${whereParts.join(" and ")}` : "";

  try {
    const rows = await db.execute(sql.raw(`
      select id, public_id, code, name_he, name_en, description,
             segment_type, criteria, member_count, is_active, metadata,
             created_at, updated_at, created_by, updated_by
      from commercial.customer_segments
      ${whereClause}
      order by ${order_by} ${order_dir}
      limit ${limit} offset ${offset}
    `));
    const countRes = await db.execute(sql.raw(
      `select count(*)::int as total from commercial.customer_segments ${whereClause}`,
    ));
    res.json({
      data: rows.rows ?? [],
      total: Number((countRes.rows?.[0] as { total?: number })?.total ?? 0),
      limit,
      offset,
    });
  } catch (err) {
    console.error("[customer-segments:list]", err);
    res.status(500).json({ error: "שגיאה בטעינת פילוחים" });
  }
});

// ──────────────────────────────────────────────────────────────
// GET /:id
// ──────────────────────────────────────────────────────────────
router.get("/:id", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "מזהה לא תקין" });
    return;
  }
  try {
    const r = await db.execute(sql`
      select id, public_id, code, name_he, name_en, description,
             segment_type, criteria, member_count, is_active, metadata,
             created_at, updated_at, created_by, updated_by
      from commercial.customer_segments
      where id = ${id}
      limit 1
    `);
    const row = (r.rows ?? [])[0];
    if (!row) { res.status(404).json({ error: "פילוח לא נמצא" }); return; }
    res.json(row);
  } catch (err) {
    console.error("[customer-segments:get]", err);
    res.status(500).json({ error: "שגיאה בטעינת פילוח" });
  }
});

// ──────────────────────────────────────────────────────────────
// POST /
// ──────────────────────────────────────────────────────────────
router.post("/", async (req: Request, res: Response) => {
  const parsed = CreateCustomerSegmentSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "בקשה לא תקינה", details: parsed.error.flatten() });
    return;
  }
  const d = parsed.data;
  const userId = Number(req.userId) || null;
  try {
    const r = await db.execute(sql`
      insert into commercial.customer_segments
        (code, name_he, name_en, description, segment_type, criteria, is_active, metadata, created_by, updated_by)
      values
        (${d.code}, ${d.name_he}, ${d.name_en ?? null}, ${d.description ?? null},
         ${d.segment_type}, ${JSON.stringify(d.criteria ?? {})}::jsonb,
         ${d.is_active}, ${JSON.stringify(d.metadata ?? {})}::jsonb,
         ${userId}, ${userId})
      returning id, public_id, code, name_he, name_en, description,
                segment_type, criteria, member_count, is_active, metadata,
                created_at, updated_at
    `);
    const row = (r.rows ?? [])[0] as { id: number } | undefined;
    if (row) {
      await logAudit({
        user_id: userId,
        table_name: "commercial_customer_segments",
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
      res.status(409).json({ error: "קוד פילוח קיים כבר" });
      return;
    }
    console.error("[customer-segments:create]", err);
    res.status(500).json({ error: "שגיאה ביצירת פילוח" });
  }
});

// ──────────────────────────────────────────────────────────────
// PATCH /:id
// ──────────────────────────────────────────────────────────────
router.patch("/:id", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "מזהה לא תקין" }); return; }
  const parsed = UpdateCustomerSegmentSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "בקשה לא תקינה", details: parsed.error.flatten() }); return; }
  const d = parsed.data;
  const userId = Number(req.userId) || null;

  const entries = Object.entries(d).filter(([, v]) => v !== undefined);
  if (entries.length === 0) { res.status(400).json({ error: "אין שינויים לעדכון" }); return; }

  const setFragments = entries.map(([k, v]) => {
    if (k === "metadata" || k === "criteria") {
      return sql`${sql.raw(k)} = ${JSON.stringify(v ?? {})}::jsonb`;
    }
    return sql`${sql.raw(k)} = ${v as unknown as string | number | boolean | null}`;
  });

  try {
    const r = await db.execute(sql`
      update commercial.customer_segments
      set ${sql.join(setFragments, sql`, `)},
          updated_by = ${userId},
          updated_at = now()
      where id = ${id}
      returning id, public_id, code, name_he, name_en, description,
                segment_type, criteria, member_count, is_active, metadata,
                created_at, updated_at
    `);
    const row = (r.rows ?? [])[0];
    if (!row) { res.status(404).json({ error: "פילוח לא נמצא" }); return; }
    await logAudit({
      user_id: userId,
      table_name: "commercial_customer_segments",
      record_id: id,
      action: "UPDATE",
      new_values: d as Record<string, unknown>,
      ip_address: req.ip ?? null,
    });
    res.json(row);
  } catch (err) {
    console.error("[customer-segments:update]", err);
    res.status(500).json({ error: "שגיאה בעדכון פילוח" });
  }
});

// ──────────────────────────────────────────────────────────────
// POST /:id/recount — recompute member_count from commercial.customers.segment_id
// ──────────────────────────────────────────────────────────────
router.post("/:id/recount", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "מזהה לא תקין" }); return; }
  try {
    const r = await db.execute(sql`
      update commercial.customer_segments
      set member_count = (
        select count(*)::int from commercial.customers
        where segment_id = ${id} and coalesce(deleted_at, null) is null
      ),
      updated_at = now()
      where id = ${id}
      returning id, member_count
    `);
    const row = (r.rows ?? [])[0];
    if (!row) { res.status(404).json({ error: "פילוח לא נמצא" }); return; }
    res.json(row);
  } catch (err) {
    console.error("[customer-segments:recount]", err);
    res.status(500).json({ error: "שגיאה בספירת חברי פילוח" });
  }
});

// ──────────────────────────────────────────────────────────────
// DELETE /:id (soft)
// ──────────────────────────────────────────────────────────────
router.delete("/:id", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "מזהה לא תקין" }); return; }
  const userId = Number(req.userId) || null;
  try {
    const r = await db.execute(sql`
      update commercial.customer_segments
      set is_active = false, updated_by = ${userId}, updated_at = now()
      where id = ${id}
      returning id
    `);
    if ((r.rows ?? []).length === 0) { res.status(404).json({ error: "פילוח לא נמצא" }); return; }
    await logAudit({
      user_id: userId,
      table_name: "commercial_customer_segments",
      record_id: id,
      action: "DELETE",
      ip_address: req.ip ?? null,
      notes: "soft delete",
    });
    res.status(204).send();
  } catch (err) {
    console.error("[customer-segments:delete]", err);
    res.status(500).json({ error: "שגיאה בהשבתת פילוח" });
  }
});

export default router;
