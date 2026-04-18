// ============================================================
// API router — finance.payments (+ finance.payment_allocations)
// CRUD + reconcile + allocate + refund
// Generated: 2026-04-18 (Finance Tier 1 — Option 1)
// ============================================================
import { Router, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { authMiddleware } from "../../middleware/auth";
import { logAudit } from "../../lib/audit-log";
import {
  CreatePaymentSchema,
  UpdatePaymentSchema,
  ReconcilePaymentSchema,
  RefundPaymentSchema,
  AllocatePaymentSchema,
  ListPaymentsQuerySchema,
  PAYMENT_STATUSES,
} from "@workspace/api-zod/finance";

const router = Router();
router.use(authMiddleware);

// state transitions
const TRANSITIONS: Record<string, readonly string[]> = {
  pending:    ["cleared", "failed", "refunded"],
  cleared:    ["reconciled", "failed", "refunded"],
  reconciled: ["refunded"],
  failed:     ["pending"],
  refunded:   [],
  Posted:     ["cleared", "reconciled", "failed", "refunded"], // legacy compat
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

async function nextPaymentNumber(): Promise<string> {
  const year = new Date().getFullYear();
  try {
    const r = await db.execute(sql.raw(`
      select coalesce(max(
        case when payment_number ~ '^PAY-[0-9]{4}-[0-9]+$'
             then (split_part(payment_number, '-', 3))::int
             else 0 end
      ), 0) + 1 as next_seq
      from finance.payments
      where payment_number like 'PAY-${year}-%'
    `));
    const next = Number((r.rows?.[0] as { next_seq?: number })?.next_seq ?? 1);
    return `PAY-${year}-${String(next).padStart(6, "0")}`;
  } catch {
    return `PAY-${year}-${Date.now()}`;
  }
}

async function nextAllocationNumber(): Promise<string> {
  const year = new Date().getFullYear();
  try {
    const r = await db.execute(sql.raw(`
      select coalesce(max(
        case when allocation_number ~ '^ALLOC-[0-9]{4}-[0-9]+$'
             then (split_part(allocation_number, '-', 3))::int
             else 0 end
      ), 0) + 1 as next_seq
      from finance.payment_allocations
      where allocation_number like 'ALLOC-${year}-%'
    `));
    const next = Number((r.rows?.[0] as { next_seq?: number })?.next_seq ?? 1);
    return `ALLOC-${year}-${String(next).padStart(6, "0")}`;
  } catch {
    return `ALLOC-${year}-${Date.now()}`;
  }
}

// ──────────────────────────────────────────────────────────────
// LIST
// ──────────────────────────────────────────────────────────────
router.get("/", async (req: Request, res: Response) => {
  const parsed = ListPaymentsQuerySchema.safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: "בקשה לא תקינה", details: parsed.error.flatten() }); return; }
  const { q, state, payment_method, invoice_id, customer_id, supplier_id, from_date, to_date, limit, offset, order_by, order_dir } = parsed.data;

  const whereParts: string[] = ["coalesce(is_deleted, false) = false"];
  if (q) {
    const safe = q.replace(/'/g, "''");
    whereParts.push(`(payment_number ILIKE '%${safe}%' OR reference_number ILIKE '%${safe}%' OR notes ILIKE '%${safe}%')`);
  }
  if (state)          whereParts.push(`state = '${state}'`);
  if (payment_method) whereParts.push(`payment_method = '${payment_method}'`);
  if (invoice_id)     whereParts.push(`invoice_id = ${invoice_id}`);
  if (customer_id)    whereParts.push(`customer_id = ${customer_id}`);
  if (supplier_id)    whereParts.push(`supplier_id = ${supplier_id}`);
  if (from_date)      whereParts.push(`payment_date >= '${from_date.replace(/'/g, "''")}'`);
  if (to_date)        whereParts.push(`payment_date <= '${to_date.replace(/'/g, "''")}'`);
  const whereClause = `where ${whereParts.join(" and ")}`;

  try {
    const rows = await db.execute(sql.raw(`
      select * from finance.payments
      ${whereClause}
      order by ${order_by} ${order_dir}
      limit ${limit} offset ${offset}
    `));
    const countRes = await db.execute(sql.raw(`select count(*)::int as total from finance.payments ${whereClause}`));
    res.json({
      data: rows.rows ?? [], rows: rows.rows ?? [],
      total: Number((countRes.rows?.[0] as { total?: number })?.total ?? 0),
      limit, offset,
    });
  } catch (err) {
    console.error("[finance:payments:list]", err);
    res.status(500).json({ error: "שגיאה בטעינת תשלומים" });
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
      select * from finance.payments where id = ${id} and coalesce(is_deleted, false) = false limit 1
    `);
    const row = (r.rows ?? [])[0];
    if (!row) { res.status(404).json({ error: "תשלום לא נמצא" }); return; }
    res.json(row);
  } catch (err) {
    console.error("[finance:payments:get]", err);
    res.status(500).json({ error: "שגיאה בטעינת תשלום" });
  }
});

// ──────────────────────────────────────────────────────────────
// GET /:id/allocations
// ──────────────────────────────────────────────────────────────
router.get("/:id/allocations", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "מזהה לא תקין" }); return; }
  try {
    const r = await db.execute(sql`
      select * from finance.payment_allocations
      where payment_id = ${id} and coalesce(is_deleted, false) = false
      order by allocated_at asc
    `);
    res.json({ rows: r.rows ?? [], data: r.rows ?? [] });
  } catch (err) {
    console.error("[finance:payments:allocations:list]", err);
    res.status(500).json({ error: "שגיאה בטעינת הקצאות" });
  }
});

// ──────────────────────────────────────────────────────────────
// POST / — create
// ──────────────────────────────────────────────────────────────
router.post("/", async (req: Request, res: Response) => {
  const parsed = CreatePaymentSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "בקשה לא תקינה", details: parsed.error.flatten() }); return; }
  const d = parsed.data;
  const userId = Number((req as { userId?: unknown }).userId) || null;

  const payment_number = d.payment_number ?? (await nextPaymentNumber());

  try {
    const r = await db.execute(sql`
      insert into finance.payments (
        payment_number, invoice_id, customer_id, supplier_id,
        payment_date, payment_method, amount, currency,
        reference_number, notes, state, record_code, is_active, metadata,
        created_by, updated_by
      ) values (
        ${payment_number}, ${d.invoice_id}, ${d.customer_id ?? null}, ${d.supplier_id ?? null},
        ${d.payment_date}, ${d.payment_method ?? "bank_transfer"},
        ${d.amount}, ${d.currency ?? "ILS"},
        ${d.reference_number ?? null}, ${d.notes ?? null},
        ${d.state ?? "pending"}, ${d.record_code ?? null},
        ${d.is_active ?? true}, ${JSON.stringify(d.metadata ?? {})}::jsonb,
        ${userId}, ${userId}
      )
      returning *
    `);
    const row = (r.rows ?? [])[0] as { id?: number } | undefined;
    if (row?.id) {
      await logAudit({
        user_id: userId, table_name: "finance_payments", record_id: row.id,
        action: "INSERT", new_values: { ...d, payment_number } as Record<string, unknown>,
        ip_address: req.ip ?? null,
      });
    }
    res.status(201).json(row);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("duplicate key")) { res.status(409).json({ error: "מספר תשלום כבר קיים" }); return; }
    if (msg.includes("foreign key"))   { res.status(400).json({ error: "חשבונית / לקוח לא נמצאו" }); return; }
    console.error("[finance:payments:create]", err);
    res.status(500).json({ error: "שגיאה ביצירת תשלום" });
  }
});

// ──────────────────────────────────────────────────────────────
// PATCH /:id
// ──────────────────────────────────────────────────────────────
router.patch("/:id", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "מזהה לא תקין" }); return; }
  const parsed = UpdatePaymentSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "בקשה לא תקינה", details: parsed.error.flatten() }); return; }
  const d = parsed.data;
  const userId = Number((req as { userId?: unknown }).userId) || null;

  const entries = Object.entries(d).filter(([, v]) => v !== undefined);
  if (entries.length === 0) { res.status(400).json({ error: "אין שינויים" }); return; }

  const setFragments = entries.map(([k, v]) => {
    if (k === "metadata") {
      if (v === null) return sql`${sql.raw(k)} = null`;
      return sql`${sql.raw(k)} = ${JSON.stringify(v)}::jsonb`;
    }
    return sql`${sql.raw(k)} = ${v as unknown as string | number | boolean | null}`;
  });

  try {
    const r = await db.execute(sql`
      update finance.payments
      set ${sql.join(setFragments, sql`, `)},
          updated_by = ${userId}, updated_at = now()
      where id = ${id} and coalesce(is_deleted, false) = false
      returning *
    `);
    const row = (r.rows ?? [])[0];
    if (!row) { res.status(404).json({ error: "תשלום לא נמצא" }); return; }
    await logAudit({
      user_id: userId, table_name: "finance_payments", record_id: id,
      action: "UPDATE", new_values: d as Record<string, unknown>,
      ip_address: req.ip ?? null,
    });
    res.json(row);
  } catch (err) {
    console.error("[finance:payments:update]", err);
    res.status(500).json({ error: "שגיאה בעדכון תשלום" });
  }
});

// ──────────────────────────────────────────────────────────────
// POST /:id/reconcile — move to 'reconciled' + write bank_match
// ──────────────────────────────────────────────────────────────
router.post("/:id/reconcile", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "מזהה לא תקין" }); return; }
  const parsed = ReconcilePaymentSchema.safeParse(req.body ?? {});
  if (!parsed.success) { res.status(400).json({ error: "בקשה לא תקינה", details: parsed.error.flatten() }); return; }
  const d = parsed.data;
  const userId = Number((req as { userId?: unknown }).userId) || null;

  try {
    const cur = await db.execute(sql`select state, amount from finance.payments where id = ${id} and coalesce(is_deleted, false) = false`);
    const row = (cur.rows ?? [])[0] as { state?: string; amount?: number } | undefined;
    if (!row) { res.status(404).json({ error: "תשלום לא נמצא" }); return; }
    const from = row.state ?? "pending";
    const allowed = TRANSITIONS[from] ?? [];
    if (!allowed.includes("reconciled")) {
      res.status(409).json({ error: `לא ניתן להתאים תשלום בסטטוס ${from}`, allowed });
      return;
    }
    const matchedAmt = d.matched_amount ?? Number(row.amount ?? 0);

    await db.execute(sql`
      insert into finance.bank_matches (payment_id, bank_file_id, external_reference, matched_amount, matched_at, matched_by_user_id, state, notes)
      values (${id}, ${d.bank_file_id ?? null}, ${d.external_reference ?? null}, ${matchedAmt}, now(), ${userId}, 'Matched', ${d.notes ?? null})
    `);
    const r = await db.execute(sql`
      update finance.payments
      set state = 'reconciled', bank_match_status = 'Matched',
          updated_by = ${userId}, updated_at = now()
      where id = ${id}
      returning id, state, bank_match_status
    `);
    await logAudit({
      user_id: userId, table_name: "finance_payments", record_id: id,
      action: "UPDATE", old_values: { state: from },
      new_values: { state: "reconciled", matched_amount: matchedAmt },
      ip_address: req.ip ?? null, notes: d.notes ?? "reconciled",
    });
    res.json((r.rows ?? [])[0]);
  } catch (err) {
    console.error("[finance:payments:reconcile]", err);
    res.status(500).json({ error: "שגיאה בהתאמה בנקאית" });
  }
});

// ──────────────────────────────────────────────────────────────
// POST /:id/allocate — allocate payment across invoices
// ──────────────────────────────────────────────────────────────
router.post("/:id/allocate", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "מזהה לא תקין" }); return; }
  const parsed = AllocatePaymentSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "בקשה לא תקינה", details: parsed.error.flatten() }); return; }
  const userId = Number((req as { userId?: unknown }).userId) || null;

  try {
    const cur = await db.execute(sql`select amount, currency from finance.payments where id = ${id} and coalesce(is_deleted, false) = false`);
    const row = (cur.rows ?? [])[0] as { amount?: number; currency?: string } | undefined;
    if (!row) { res.status(404).json({ error: "תשלום לא נמצא" }); return; }
    const paymentAmt = Number(row.amount ?? 0);
    const totalAlloc = parsed.data.allocations.reduce((s, a) => s + Number(a.amount), 0);
    if (round2(totalAlloc) > round2(paymentAmt)) {
      res.status(400).json({ error: `סכום ההקצאות (${totalAlloc}) חורג מסכום התשלום (${paymentAmt})` });
      return;
    }

    const created: unknown[] = [];
    for (const a of parsed.data.allocations) {
      const allocNum = await nextAllocationNumber();
      const r = await db.execute(sql`
        insert into finance.payment_allocations
          (allocation_number, payment_id, invoice_id, amount, currency, notes, created_by, updated_by)
        values
          (${allocNum}, ${id}, ${a.invoice_id}, ${a.amount},
           ${row.currency ?? "ILS"}, ${a.notes ?? null}, ${userId}, ${userId})
        returning *
      `);
      created.push((r.rows ?? [])[0]);
      // Update invoice paid_total / balance_due / state
      await db.execute(sql`
        update finance.invoices
        set paid_total = coalesce(paid_total, 0) + ${a.amount},
            balance_due = greatest(0, coalesce(grand_total, 0) - (coalesce(paid_total, 0) + ${a.amount})),
            state = case
              when coalesce(grand_total, 0) - (coalesce(paid_total, 0) + ${a.amount}) <= 0.01
                then 'paid'
              when coalesce(paid_total, 0) + ${a.amount} > 0
                then 'partially_paid'
              else state
            end,
            updated_by = ${userId},
            updated_at = now()
        where id = ${a.invoice_id}
      `);
    }

    await logAudit({
      user_id: userId, table_name: "finance_payments", record_id: id,
      action: "UPDATE",
      new_values: { allocated: parsed.data.allocations.length, total: totalAlloc },
      ip_address: req.ip ?? null, notes: `allocated ${totalAlloc}`,
    });
    res.status(201).json({ ok: true, allocations: created });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("foreign key")) { res.status(400).json({ error: "חשבונית להקצאה לא נמצאה" }); return; }
    console.error("[finance:payments:allocate]", err);
    res.status(500).json({ error: "שגיאה בהקצאת תשלום" });
  }
});

// ──────────────────────────────────────────────────────────────
// POST /:id/refund
// ──────────────────────────────────────────────────────────────
router.post("/:id/refund", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "מזהה לא תקין" }); return; }
  const parsed = RefundPaymentSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "בקשה לא תקינה", details: parsed.error.flatten() }); return; }
  const userId = Number((req as { userId?: unknown }).userId) || null;

  try {
    const cur = await db.execute(sql`select state, amount from finance.payments where id = ${id} and coalesce(is_deleted, false) = false`);
    const row = (cur.rows ?? [])[0] as { state?: string; amount?: number } | undefined;
    if (!row) { res.status(404).json({ error: "תשלום לא נמצא" }); return; }
    const from = row.state ?? "pending";
    if (!(TRANSITIONS[from] ?? []).includes("refunded")) {
      res.status(409).json({ error: `לא ניתן לזכות מסטטוס ${from}` });
      return;
    }
    if (parsed.data.refund_amount > Number(row.amount ?? 0) + 0.01) {
      res.status(400).json({ error: "סכום הזיכוי חורג מסכום התשלום" });
      return;
    }
    const r = await db.execute(sql`
      update finance.payments
      set state = 'refunded',
          notes = coalesce(notes, '') || '
[REFUND ' || ${parsed.data.refund_amount}::text || '] ' || ${parsed.data.reason},
          updated_by = ${userId}, updated_at = now()
      where id = ${id}
      returning id, state
    `);
    await logAudit({
      user_id: userId, table_name: "finance_payments", record_id: id,
      action: "UPDATE", old_values: { state: from },
      new_values: { state: "refunded", ...parsed.data },
      ip_address: req.ip ?? null, notes: `refund: ${parsed.data.reason}`,
    });
    res.json((r.rows ?? [])[0]);
  } catch (err) {
    console.error("[finance:payments:refund]", err);
    res.status(500).json({ error: "שגיאה בזיכוי תשלום" });
  }
});

// ──────────────────────────────────────────────────────────────
// POST /:id/transition — generic
// ──────────────────────────────────────────────────────────────
router.post("/:id/transition", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "מזהה לא תקין" }); return; }
  const to_status = String(req.body?.to_status ?? "");
  const reason = req.body?.reason as string | undefined;
  if (!(PAYMENT_STATUSES as readonly string[]).includes(to_status)) {
    res.status(400).json({ error: "סטטוס יעד לא חוקי" }); return;
  }
  const userId = Number((req as { userId?: unknown }).userId) || null;
  try {
    const cur = await db.execute(sql`select state from finance.payments where id = ${id} and coalesce(is_deleted, false) = false`);
    const row = (cur.rows ?? [])[0] as { state?: string } | undefined;
    if (!row) { res.status(404).json({ error: "תשלום לא נמצא" }); return; }
    const from = row.state ?? "pending";
    const allowed = TRANSITIONS[from] ?? [];
    if (!allowed.includes(to_status)) {
      res.status(409).json({ error: `מעבר לא חוקי: ${from} → ${to_status}`, allowed });
      return;
    }
    const r = await db.execute(sql`
      update finance.payments
      set state = ${to_status}, updated_by = ${userId}, updated_at = now()
      where id = ${id}
      returning id, state
    `);
    await logAudit({
      user_id: userId, table_name: "finance_payments", record_id: id,
      action: "UPDATE", old_values: { state: from },
      new_values: { state: to_status, reason: reason ?? null },
      ip_address: req.ip ?? null, notes: reason ?? null,
    });
    res.json((r.rows ?? [])[0]);
  } catch (err) {
    console.error("[finance:payments:transition]", err);
    res.status(500).json({ error: "שגיאה במעבר סטטוס" });
  }
});

// ──────────────────────────────────────────────────────────────
// DELETE /:id (soft)
// ──────────────────────────────────────────────────────────────
router.delete("/:id", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "מזהה לא תקין" }); return; }
  const userId = Number((req as { userId?: unknown }).userId) || null;
  try {
    const r = await db.execute(sql`
      update finance.payments
      set is_deleted = true, is_active = false, updated_by = ${userId}, updated_at = now()
      where id = ${id} and coalesce(is_deleted, false) = false
      returning id
    `);
    if ((r.rows ?? []).length === 0) { res.status(404).json({ error: "תשלום לא נמצא" }); return; }
    await logAudit({
      user_id: userId, table_name: "finance_payments", record_id: id,
      action: "DELETE", ip_address: req.ip ?? null, notes: "soft delete",
    });
    res.status(204).send();
  } catch (err) {
    console.error("[finance:payments:delete]", err);
    res.status(500).json({ error: "שגיאה במחיקת תשלום" });
  }
});

export default router;
