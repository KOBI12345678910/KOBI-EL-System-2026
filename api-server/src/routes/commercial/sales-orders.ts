// ============================================================
// API router — commercial.sales_orders
// Full CRUD + status transition, Zod-validated, auth-guarded, audit-logged.
// Generated: 2026-04-18
// ============================================================
import { Router, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { authMiddleware } from "../../middleware/auth";
import { logAudit } from "../../lib/audit-log";
import {
  CreateSalesOrderSchema,
  UpdateSalesOrderSchema,
  TransitionSalesOrderSchema,
  ListSalesOrdersQuerySchema,
  SALES_ORDER_STATUSES,
} from "@workspace/api-zod/commercial";

const router = Router();
router.use(authMiddleware);

// Allowed status transitions (source → allowed targets)
const TRANSITIONS: Record<string, readonly string[]> = {
  draft:          ["confirmed", "cancelled"],
  confirmed:      ["in_fulfillment", "cancelled"],
  in_fulfillment: ["shipped", "cancelled"],
  shipped:        ["invoiced", "cancelled"],
  invoiced:       ["closed"],
  closed:         [],
  cancelled:      [],
};

function computeTotals(d: {
  subtotal?: number; discount_total?: number; vat_rate?: number;
}): { subtotal: number; discount_total: number; vat_rate: number; vat_total: number; total_amount: number; total_with_vat: number; } {
  const subtotal = Number(d.subtotal ?? 0);
  const discount_total = Number(d.discount_total ?? 0);
  const vat_rate = Number(d.vat_rate ?? 0.18);
  const base = Math.max(0, subtotal - discount_total);
  const vat_total = Number((base * vat_rate).toFixed(2));
  const total_amount = Number(base.toFixed(2));
  const total_with_vat = Number((base + vat_total).toFixed(2));
  return { subtotal, discount_total, vat_rate, vat_total, total_amount, total_with_vat };
}

async function nextOrderNumber(): Promise<string> {
  const year = new Date().getFullYear();
  try {
    const r = await db.execute(sql.raw(`
      select coalesce(max(
        case when order_number ~ '^SO-[0-9]{4}-[0-9]+$'
             then (split_part(order_number, '-', 3))::int
             else 0 end
      ), 0) + 1 as next_seq
      from commercial.sales_orders
      where order_number like 'SO-${year}-%'
    `));
    const next = Number((r.rows?.[0] as { next_seq?: number })?.next_seq ?? 1);
    return `SO-${year}-${String(next).padStart(5, "0")}`;
  } catch {
    return `SO-${year}-${Date.now()}`;
  }
}

// ──────────────────────────────────────────────────────────────
// LIST
// ──────────────────────────────────────────────────────────────
// Whitelists for identifier positions (order_by / order_dir). Zod already
// constrains these to the same enums, but we re-validate here as defence in
// depth before any value is embedded into raw SQL identifier slots.
const LIST_ORDER_BY = new Set([
  "order_date", "total_with_vat", "created_at", "updated_at", "status",
]);
const LIST_ORDER_DIR = new Set(["asc", "desc"]);

router.get("/", async (req: Request, res: Response) => {
  const parsed = ListSalesOrdersQuerySchema.safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: "בקשה לא תקינה", details: parsed.error.flatten() }); return; }
  const { q, status, customer_id, quote_id, from_date, to_date, limit, offset, order_by, order_dir } = parsed.data;

  // Build WHERE as parameterized sql`` fragments. All user-supplied values go
  // through ${} bindings; nothing is string-concatenated into the SQL text.
  const conditions = [sql`deleted_at is null`];
  if (q) {
    const like = `%${q}%`;
    conditions.push(sql`(order_number ILIKE ${like} OR notes ILIKE ${like})`);
  }
  if (status) conditions.push(sql`status = ${status}`);
  if (customer_id) conditions.push(sql`customer_id = ${customer_id}`);
  if (quote_id) conditions.push(sql`quote_id = ${quote_id}`);
  if (from_date) conditions.push(sql`order_date >= ${from_date}`);
  if (to_date) conditions.push(sql`order_date <= ${to_date}`);
  const whereClause = sql`where ${sql.join(conditions, sql` and `)}`;

  // Identifier slots (column name + direction) cannot be parameter-bound by
  // the driver, so we enforce an explicit whitelist and only then splice them
  // in via sql.raw. Zod has already narrowed the types to the same enums.
  const safeOrderBy = LIST_ORDER_BY.has(order_by) ? order_by : "order_date";
  const safeOrderDir = LIST_ORDER_DIR.has(order_dir) ? order_dir : "desc";
  const orderClause = sql`order by ${sql.raw(safeOrderBy)} ${sql.raw(safeOrderDir)}`;

  try {
    const rows = await db.execute(sql`
      select id, public_id, order_number, customer_id, quote_id, opportunity_id, status,
             order_date, expected_delivery, actual_delivery,
             subtotal, discount_total, vat_rate, vat_total, total_amount, total_with_vat,
             currency, payment_terms, shipping_address, billing_address,
             notes, customer_notes, is_active, metadata,
             created_at, updated_at, created_by, updated_by, deleted_at
      from commercial.sales_orders
      ${whereClause}
      ${orderClause}
      limit ${limit} offset ${offset}
    `);
    const countRes = await db.execute(sql`
      select count(*)::int as total from commercial.sales_orders ${whereClause}
    `);
    res.json({
      data: rows.rows ?? [],
      total: Number((countRes.rows?.[0] as { total?: number })?.total ?? 0),
      limit, offset,
    });
  } catch (err) {
    console.error("[sales-orders:list]", err);
    res.status(500).json({ error: "שגיאה בטעינת הזמנות מכירה" });
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
      select * from commercial.sales_orders where id = ${id} and deleted_at is null limit 1
    `);
    const row = (r.rows ?? [])[0];
    if (!row) { res.status(404).json({ error: "הזמנה לא נמצאה" }); return; }
    res.json(row);
  } catch (err) {
    console.error("[sales-orders:get]", err);
    res.status(500).json({ error: "שגיאה בטעינת הזמנה" });
  }
});

// ──────────────────────────────────────────────────────────────
// POST /
// ──────────────────────────────────────────────────────────────
router.post("/", async (req: Request, res: Response) => {
  const parsed = CreateSalesOrderSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "בקשה לא תקינה", details: parsed.error.flatten() }); return; }
  const d = parsed.data;
  const userId = Number(req.userId) || null;

  const order_number = d.order_number ?? (await nextOrderNumber());
  const totals = computeTotals(d);

  try {
    const r = await db.execute(sql`
      insert into commercial.sales_orders (
        order_number, customer_id, quote_id, opportunity_id, status,
        order_date, expected_delivery, actual_delivery,
        subtotal, discount_total, vat_rate, vat_total, total_amount, total_with_vat,
        currency, payment_terms, shipping_address, billing_address,
        notes, customer_notes, is_active, metadata, created_by, updated_by
      ) values (
        ${order_number}, ${d.customer_id}, ${d.quote_id ?? null}, ${d.opportunity_id ?? null},
        ${d.status ?? "draft"},
        ${d.order_date ?? new Date().toISOString().slice(0, 10)},
        ${d.expected_delivery ?? null}, ${d.actual_delivery ?? null},
        ${totals.subtotal}, ${totals.discount_total}, ${totals.vat_rate},
        ${totals.vat_total}, ${totals.total_amount}, ${totals.total_with_vat},
        ${d.currency ?? "ILS"}, ${d.payment_terms ?? null},
        ${d.shipping_address ? JSON.stringify(d.shipping_address) : null}::jsonb,
        ${d.billing_address ? JSON.stringify(d.billing_address) : null}::jsonb,
        ${d.notes ?? null}, ${d.customer_notes ?? null},
        ${d.is_active ?? true}, ${JSON.stringify(d.metadata ?? {})}::jsonb,
        ${userId}, ${userId}
      )
      returning *
    `);
    const row = (r.rows ?? [])[0] as { id: number } | undefined;
    if (row) {
      await logAudit({
        user_id: userId,
        table_name: "commercial_sales_orders",
        record_id: row.id,
        action: "INSERT",
        new_values: { ...d, order_number, ...totals } as Record<string, unknown>,
        ip_address: req.ip ?? null,
      });
    }
    res.status(201).json(row);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("duplicate key")) {
      res.status(409).json({ error: "מספר הזמנה כבר קיים" });
      return;
    }
    if (msg.includes("foreign key")) {
      res.status(400).json({ error: "לקוח / הצעה / הזדמנות לא קיימים" });
      return;
    }
    console.error("[sales-orders:create]", err);
    res.status(500).json({ error: "שגיאה ביצירת הזמנה" });
  }
});

// ──────────────────────────────────────────────────────────────
// PATCH /:id
// ──────────────────────────────────────────────────────────────
router.patch("/:id", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "מזהה לא תקין" }); return; }
  const parsed = UpdateSalesOrderSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "בקשה לא תקינה", details: parsed.error.flatten() }); return; }
  const d = parsed.data;
  const userId = Number(req.userId) || null;

  // If any of subtotal/discount/vat_rate changed, recompute totals.
  let toApply: Record<string, unknown> = { ...d };
  if (d.subtotal !== undefined || d.discount_total !== undefined || d.vat_rate !== undefined) {
    // Need current values to compute — fetch row first
    const cur = await db.execute(sql`select subtotal, discount_total, vat_rate from commercial.sales_orders where id = ${id}`);
    const base = (cur.rows ?? [])[0] as { subtotal?: number; discount_total?: number; vat_rate?: number } | undefined;
    if (!base) { res.status(404).json({ error: "הזמנה לא נמצאה" }); return; }
    const totals = computeTotals({
      subtotal: Number(d.subtotal ?? base.subtotal ?? 0),
      discount_total: Number(d.discount_total ?? base.discount_total ?? 0),
      vat_rate: Number(d.vat_rate ?? base.vat_rate ?? 0.18),
    });
    toApply = { ...toApply, ...totals };
  }

  const entries = Object.entries(toApply).filter(([, v]) => v !== undefined);
  if (entries.length === 0) { res.status(400).json({ error: "אין שינויים לעדכון" }); return; }

  const setFragments = entries.map(([k, v]) => {
    if (k === "metadata" || k === "shipping_address" || k === "billing_address") {
      if (v === null) return sql`${sql.raw(k)} = null`;
      return sql`${sql.raw(k)} = ${JSON.stringify(v)}::jsonb`;
    }
    return sql`${sql.raw(k)} = ${v as unknown as string | number | boolean | null}`;
  });

  try {
    const r = await db.execute(sql`
      update commercial.sales_orders
      set ${sql.join(setFragments, sql`, `)},
          updated_by = ${userId},
          updated_at = now()
      where id = ${id} and deleted_at is null
      returning *
    `);
    const row = (r.rows ?? [])[0];
    if (!row) { res.status(404).json({ error: "הזמנה לא נמצאה" }); return; }
    await logAudit({
      user_id: userId,
      table_name: "commercial_sales_orders",
      record_id: id,
      action: "UPDATE",
      new_values: toApply,
      ip_address: req.ip ?? null,
    });
    res.json(row);
  } catch (err) {
    console.error("[sales-orders:update]", err);
    res.status(500).json({ error: "שגיאה בעדכון הזמנה" });
  }
});

// ──────────────────────────────────────────────────────────────
// POST /:id/transition
// ──────────────────────────────────────────────────────────────
router.post("/:id/transition", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "מזהה לא תקין" }); return; }
  const parsed = TransitionSalesOrderSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "בקשה לא תקינה", details: parsed.error.flatten() }); return; }
  const { to_status, reason } = parsed.data;
  const userId = Number(req.userId) || null;

  try {
    const cur = await db.execute(sql`select status from commercial.sales_orders where id = ${id} and deleted_at is null`);
    const row = (cur.rows ?? [])[0] as { status?: string } | undefined;
    if (!row) { res.status(404).json({ error: "הזמנה לא נמצאה" }); return; }
    const from = row.status ?? "draft";
    if (!SALES_ORDER_STATUSES.includes(to_status)) {
      res.status(400).json({ error: "סטטוס יעד לא חוקי" });
      return;
    }
    const allowed = TRANSITIONS[from] ?? [];
    if (!allowed.includes(to_status)) {
      res.status(409).json({ error: `מעבר לא חוקי: ${from} → ${to_status}`, allowed });
      return;
    }
    const r = await db.execute(sql`
      update commercial.sales_orders
      set status = ${to_status}, updated_by = ${userId}, updated_at = now()
      where id = ${id}
      returning id, status
    `);
    await logAudit({
      user_id: userId,
      table_name: "commercial_sales_orders",
      record_id: id,
      action: "UPDATE",
      old_values: { status: from } as Record<string, unknown>,
      new_values: { status: to_status, reason: reason ?? null } as Record<string, unknown>,
      ip_address: req.ip ?? null,
      notes: `transition ${from} → ${to_status}${reason ? `: ${reason}` : ""}`,
    });
    res.json((r.rows ?? [])[0]);
  } catch (err) {
    console.error("[sales-orders:transition]", err);
    res.status(500).json({ error: "שגיאה במעבר סטטוס" });
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
      update commercial.sales_orders
      set deleted_at = now(), is_active = false, updated_by = ${userId}, updated_at = now()
      where id = ${id} and deleted_at is null
      returning id
    `);
    if ((r.rows ?? []).length === 0) { res.status(404).json({ error: "הזמנה לא נמצאה" }); return; }
    await logAudit({
      user_id: userId,
      table_name: "commercial_sales_orders",
      record_id: id,
      action: "DELETE",
      ip_address: req.ip ?? null,
      notes: "soft delete",
    });
    res.status(204).send();
  } catch (err) {
    console.error("[sales-orders:delete]", err);
    res.status(500).json({ error: "שגיאה במחיקת הזמנה" });
  }
});

export default router;
