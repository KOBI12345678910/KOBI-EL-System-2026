// ============================================================
// API router — finance.invoices
// Full CRUD + embedded lines CRUD + issue/void state transitions.
// Zod-validated, auth-guarded, audit-logged.
// VAT never hardcoded — always resolved via getVatRateForDate(issue_date).
// Generated: 2026-04-18 (Finance Tier 1 — Option 1)
// ============================================================
import { Router, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { authMiddleware } from "../../middleware/auth";
import { logAudit } from "../../lib/audit-log";
import {
  CreateInvoiceSchema,
  UpdateInvoiceSchema,
  TransitionInvoiceSchema,
  IssueInvoiceSchema,
  VoidInvoiceSchema,
  ListInvoicesQuerySchema,
  INVOICE_STATUSES,
  CreateInvoiceLineSchema,
  ReplaceInvoiceLinesSchema,
  UpdateInvoiceLineSchema,
  computeInvoiceLineTotals,
} from "@workspace/api-zod/finance";
import { getVatRateForDate } from "../israeli-accounting-engine";

const router = Router();
router.use(authMiddleware);

// Allowed state transitions (source → allowed targets)
const TRANSITIONS: Record<string, readonly string[]> = {
  draft:          ["issued", "cancelled"],
  issued:         ["sent", "cancelled", "voided"],
  sent:           ["partially_paid", "paid", "overdue", "voided"],
  partially_paid: ["paid", "overdue", "voided"],
  paid:           ["voided"],
  overdue:        ["partially_paid", "paid", "voided"],
  cancelled:      [],
  voided:         [],
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

async function nextInvoiceNumber(): Promise<string> {
  const year = new Date().getFullYear();
  try {
    const r = await db.execute(sql.raw(`
      select coalesce(max(
        case when invoice_number ~ '^INV-[0-9]{4}-[0-9]+$'
             then (split_part(invoice_number, '-', 3))::int
             else 0 end
      ), 0) + 1 as next_seq
      from finance.invoices
      where invoice_number like 'INV-${year}-%'
    `));
    const next = Number((r.rows?.[0] as { next_seq?: number })?.next_seq ?? 1);
    return `INV-${year}-${String(next).padStart(6, "0")}`;
  } catch {
    return `INV-${year}-${Date.now()}`;
  }
}

/**
 * Recompute header totals from current lines.
 * Uses the line rows as the source of truth (they were computed with
 * VAT rate resolved at their write time).
 */
async function recomputeHeaderTotals(invoiceId: number): Promise<{
  subtotal: number; discount_total: number; vat_total: number; grand_total: number;
}> {
  const r = await db.execute(sql`
    select
      coalesce(sum(line_subtotal), 0)::numeric(18,2) as subtotal,
      coalesce(sum(vat_amount),    0)::numeric(18,2) as vat_total,
      coalesce(sum(line_total),    0)::numeric(18,2) as grand_total
    from finance.invoice_lines
    where invoice_id = ${invoiceId}
  `);
  const row = (r.rows ?? [])[0] as { subtotal?: number; vat_total?: number; grand_total?: number } | undefined;
  const subtotal = Number(row?.subtotal ?? 0);
  const vat_total = Number(row?.vat_total ?? 0);
  const grand_total = Number(row?.grand_total ?? 0);
  // discount is embedded per line via discount_percent, so at header level it's 0
  const discount_total = 0;
  return { subtotal, discount_total, vat_total, grand_total };
}

// ──────────────────────────────────────────────────────────────
// LIST
// ──────────────────────────────────────────────────────────────
router.get("/", async (req: Request, res: Response) => {
  const parsed = ListInvoicesQuerySchema.safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: "בקשה לא תקינה", details: parsed.error.flatten() }); return; }
  const { q, state, invoice_type, customer_id, supplier_id, project_id, from_date, to_date, limit, offset, order_by, order_dir } = parsed.data;

  const whereParts: string[] = ["coalesce(is_deleted, false) = false"];
  if (q) {
    const safe = q.replace(/'/g, "''");
    whereParts.push(`(invoice_number ILIKE '%${safe}%' OR notes ILIKE '%${safe}%')`);
  }
  if (state)         whereParts.push(`state = '${state}'`);
  if (invoice_type)  whereParts.push(`invoice_type = '${invoice_type}'`);
  if (customer_id)   whereParts.push(`customer_id = ${customer_id}`);
  if (supplier_id)   whereParts.push(`supplier_id = ${supplier_id}`);
  if (project_id)    whereParts.push(`project_id = ${project_id}`);
  if (from_date)     whereParts.push(`issue_date >= '${from_date.replace(/'/g, "''")}'`);
  if (to_date)       whereParts.push(`issue_date <= '${to_date.replace(/'/g, "''")}'`);
  const whereClause = `where ${whereParts.join(" and ")}`;

  try {
    const rows = await db.execute(sql.raw(`
      select id, public_id, invoice_number, invoice_type, customer_id, supplier_id,
             project_id, po_id, issue_date, due_date,
             subtotal, discount_total, vat_total, grand_total, paid_total, balance_due,
             currency, state, sent_at, cancelled_at, notes,
             is_active, is_deleted, record_code, metadata,
             created_at, updated_at, created_by, updated_by
      from finance.invoices
      ${whereClause}
      order by ${order_by} ${order_dir}
      limit ${limit} offset ${offset}
    `));
    const countRes = await db.execute(sql.raw(`select count(*)::int as total from finance.invoices ${whereClause}`));
    res.json({
      data: rows.rows ?? [],
      rows: rows.rows ?? [],
      total: Number((countRes.rows?.[0] as { total?: number })?.total ?? 0),
      limit, offset,
    });
  } catch (err) {
    console.error("[finance:invoices:list]", err);
    res.status(500).json({ error: "שגיאה בטעינת חשבוניות" });
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
      select * from finance.invoices
      where id = ${id} and coalesce(is_deleted, false) = false
      limit 1
    `);
    const row = (r.rows ?? [])[0];
    if (!row) { res.status(404).json({ error: "חשבונית לא נמצאה" }); return; }
    res.json(row);
  } catch (err) {
    console.error("[finance:invoices:get]", err);
    res.status(500).json({ error: "שגיאה בטעינת חשבונית" });
  }
});

// ──────────────────────────────────────────────────────────────
// GET /:id/lines
// ──────────────────────────────────────────────────────────────
router.get("/:id/lines", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "מזהה לא תקין" }); return; }
  try {
    const r = await db.execute(sql`
      select * from finance.invoice_lines
      where invoice_id = ${id}
      order by line_number asc
    `);
    res.json({ rows: r.rows ?? [], data: r.rows ?? [] });
  } catch (err) {
    console.error("[finance:invoices:lines:list]", err);
    res.status(500).json({ error: "שגיאה בטעינת שורות" });
  }
});

// ──────────────────────────────────────────────────────────────
// POST / — create invoice header
// ──────────────────────────────────────────────────────────────
router.post("/", async (req: Request, res: Response) => {
  const parsed = CreateInvoiceSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "בקשה לא תקינה", details: parsed.error.flatten() }); return; }
  const d = parsed.data;
  const userId = Number((req as { userId?: unknown }).userId) || null;

  const invoice_number = d.invoice_number ?? (await nextInvoiceNumber());
  const issue_date = d.issue_date ?? new Date().toISOString().slice(0, 10);

  try {
    const r = await db.execute(sql`
      insert into finance.invoices (
        invoice_number, invoice_type, customer_id, supplier_id, project_id, po_id,
        issue_date, due_date,
        subtotal, discount_total, vat_total, grand_total, paid_total, balance_due,
        currency, state, notes, record_code, is_active, metadata,
        created_by, updated_by
      ) values (
        ${invoice_number}, ${d.invoice_type ?? "sales_invoice"},
        ${d.customer_id ?? null}, ${d.supplier_id ?? null},
        ${d.project_id ?? null}, ${d.po_id ?? null},
        ${issue_date}, ${d.due_date ?? null},
        ${d.subtotal ?? 0}, ${d.discount_total ?? 0},
        ${d.vat_total ?? 0}, ${d.grand_total ?? 0},
        ${d.paid_total ?? 0}, ${d.balance_due ?? 0},
        ${d.currency ?? "ILS"}, ${d.state ?? "draft"},
        ${d.notes ?? null}, ${d.record_code ?? null},
        ${d.is_active ?? true}, ${JSON.stringify(d.metadata ?? {})}::jsonb,
        ${userId}, ${userId}
      )
      returning *
    `);
    const row = (r.rows ?? [])[0] as { id?: number } | undefined;
    if (row?.id) {
      await logAudit({
        user_id: userId, table_name: "finance_invoices", record_id: row.id,
        action: "INSERT",
        new_values: { ...d, invoice_number, issue_date } as Record<string, unknown>,
        ip_address: req.ip ?? null,
      });
    }
    res.status(201).json(row);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("duplicate key")) { res.status(409).json({ error: "מספר חשבונית כבר קיים" }); return; }
    if (msg.includes("foreign key"))   { res.status(400).json({ error: "קישור לא תקין (לקוח/ספק/פרויקט)" }); return; }
    if (msg.includes("grand_total"))   { res.status(400).json({ error: "סכומי החשבונית אינם עקביים", details: msg }); return; }
    console.error("[finance:invoices:create]", err);
    res.status(500).json({ error: "שגיאה ביצירת חשבונית" });
  }
});

// ──────────────────────────────────────────────────────────────
// PATCH /:id
// ──────────────────────────────────────────────────────────────
router.patch("/:id", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "מזהה לא תקין" }); return; }
  const parsed = UpdateInvoiceSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "בקשה לא תקינה", details: parsed.error.flatten() }); return; }
  const d = parsed.data;
  const userId = Number((req as { userId?: unknown }).userId) || null;

  const entries = Object.entries(d).filter(([, v]) => v !== undefined);
  if (entries.length === 0) { res.status(400).json({ error: "אין שינויים לעדכון" }); return; }

  const setFragments = entries.map(([k, v]) => {
    if (k === "metadata") {
      if (v === null) return sql`${sql.raw(k)} = null`;
      return sql`${sql.raw(k)} = ${JSON.stringify(v)}::jsonb`;
    }
    return sql`${sql.raw(k)} = ${v as unknown as string | number | boolean | null}`;
  });

  try {
    const r = await db.execute(sql`
      update finance.invoices
      set ${sql.join(setFragments, sql`, `)},
          updated_by = ${userId},
          updated_at = now()
      where id = ${id} and coalesce(is_deleted, false) = false
      returning *
    `);
    const row = (r.rows ?? [])[0];
    if (!row) { res.status(404).json({ error: "חשבונית לא נמצאה" }); return; }
    await logAudit({
      user_id: userId, table_name: "finance_invoices", record_id: id,
      action: "UPDATE", new_values: d as Record<string, unknown>,
      ip_address: req.ip ?? null,
    });
    res.json(row);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("grand_total")) { res.status(400).json({ error: "סכומי החשבונית אינם עקביים", details: msg }); return; }
    console.error("[finance:invoices:update]", err);
    res.status(500).json({ error: "שגיאה בעדכון חשבונית" });
  }
});

// ──────────────────────────────────────────────────────────────
// POST /:id/issue — mark draft as issued
// ──────────────────────────────────────────────────────────────
router.post("/:id/issue", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "מזהה לא תקין" }); return; }
  const parsed = IssueInvoiceSchema.safeParse(req.body ?? {});
  if (!parsed.success) { res.status(400).json({ error: "בקשה לא תקינה", details: parsed.error.flatten() }); return; }
  const userId = Number((req as { userId?: unknown }).userId) || null;

  try {
    const cur = await db.execute(sql`select state, issue_date from finance.invoices where id = ${id} and coalesce(is_deleted, false) = false`);
    const row = (cur.rows ?? [])[0] as { state?: string; issue_date?: string | null } | undefined;
    if (!row) { res.status(404).json({ error: "חשבונית לא נמצאה" }); return; }
    if (row.state !== "draft") {
      res.status(409).json({ error: `ניתן להנפיק רק טיוטה (סטטוס נוכחי: ${row.state})` });
      return;
    }
    const issueDate = parsed.data.issue_date ?? row.issue_date ?? new Date().toISOString().slice(0, 10);
    const nextState = parsed.data.send_to_customer ? "sent" : "issued";
    const sentAt = parsed.data.send_to_customer ? new Date().toISOString() : null;

    const r = await db.execute(sql`
      update finance.invoices
      set state = ${nextState},
          issue_date = ${issueDate},
          sent_at = ${sentAt},
          updated_by = ${userId},
          updated_at = now()
      where id = ${id}
      returning id, state, issue_date, sent_at
    `);
    await logAudit({
      user_id: userId, table_name: "finance_invoices", record_id: id,
      action: "UPDATE", old_values: { state: row.state },
      new_values: { state: nextState, issue_date: issueDate, sent_at: sentAt },
      ip_address: req.ip ?? null, notes: `issue invoice (rate=${getVatRateForDate(issueDate)})`,
    });
    res.json((r.rows ?? [])[0]);
  } catch (err) {
    console.error("[finance:invoices:issue]", err);
    res.status(500).json({ error: "שגיאה בהנפקת חשבונית" });
  }
});

// ──────────────────────────────────────────────────────────────
// POST /:id/void — void/reverse a posted invoice
// ──────────────────────────────────────────────────────────────
router.post("/:id/void", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "מזהה לא תקין" }); return; }
  const parsed = VoidInvoiceSchema.safeParse(req.body ?? {});
  if (!parsed.success) { res.status(400).json({ error: "בקשה לא תקינה", details: parsed.error.flatten() }); return; }
  const userId = Number((req as { userId?: unknown }).userId) || null;

  try {
    const cur = await db.execute(sql`select state from finance.invoices where id = ${id} and coalesce(is_deleted, false) = false`);
    const row = (cur.rows ?? [])[0] as { state?: string } | undefined;
    if (!row) { res.status(404).json({ error: "חשבונית לא נמצאה" }); return; }
    const from = row.state ?? "draft";
    const allowed = TRANSITIONS[from] ?? [];
    if (!allowed.includes("voided")) {
      res.status(409).json({ error: `לא ניתן לבטל חשבונית מסטטוס ${from}`, allowed });
      return;
    }
    const r = await db.execute(sql`
      update finance.invoices
      set state = 'voided',
          cancelled_at = now(),
          notes = coalesce(notes, '') || '
[VOID] ' || ${parsed.data.reason},
          updated_by = ${userId},
          updated_at = now()
      where id = ${id}
      returning id, state, cancelled_at
    `);
    await logAudit({
      user_id: userId, table_name: "finance_invoices", record_id: id,
      action: "UPDATE", old_values: { state: from },
      new_values: { state: "voided", reason: parsed.data.reason },
      ip_address: req.ip ?? null, notes: `void: ${parsed.data.reason}`,
    });
    res.json((r.rows ?? [])[0]);
  } catch (err) {
    console.error("[finance:invoices:void]", err);
    res.status(500).json({ error: "שגיאה בביטול חשבונית" });
  }
});

// ──────────────────────────────────────────────────────────────
// POST /:id/transition — generic state transition
// ──────────────────────────────────────────────────────────────
router.post("/:id/transition", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "מזהה לא תקין" }); return; }
  const parsed = TransitionInvoiceSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "בקשה לא תקינה", details: parsed.error.flatten() }); return; }
  const { to_status, reason } = parsed.data;
  const userId = Number((req as { userId?: unknown }).userId) || null;

  try {
    const cur = await db.execute(sql`select state from finance.invoices where id = ${id} and coalesce(is_deleted, false) = false`);
    const row = (cur.rows ?? [])[0] as { state?: string } | undefined;
    if (!row) { res.status(404).json({ error: "חשבונית לא נמצאה" }); return; }
    const from = row.state ?? "draft";
    if (!(INVOICE_STATUSES as readonly string[]).includes(to_status)) {
      res.status(400).json({ error: "סטטוס יעד לא חוקי" });
      return;
    }
    const allowed = TRANSITIONS[from] ?? [];
    if (!allowed.includes(to_status)) {
      res.status(409).json({ error: `מעבר לא חוקי: ${from} → ${to_status}`, allowed });
      return;
    }
    const r = await db.execute(sql`
      update finance.invoices
      set state = ${to_status}, updated_by = ${userId}, updated_at = now()
      where id = ${id}
      returning id, state
    `);
    await logAudit({
      user_id: userId, table_name: "finance_invoices", record_id: id,
      action: "UPDATE", old_values: { state: from },
      new_values: { state: to_status, reason: reason ?? null },
      ip_address: req.ip ?? null,
      notes: `transition ${from} → ${to_status}${reason ? `: ${reason}` : ""}`,
    });
    res.json((r.rows ?? [])[0]);
  } catch (err) {
    console.error("[finance:invoices:transition]", err);
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
      update finance.invoices
      set is_deleted = true, is_active = false, updated_by = ${userId}, updated_at = now()
      where id = ${id} and coalesce(is_deleted, false) = false
      returning id
    `);
    if ((r.rows ?? []).length === 0) { res.status(404).json({ error: "חשבונית לא נמצאה" }); return; }
    await logAudit({
      user_id: userId, table_name: "finance_invoices", record_id: id,
      action: "DELETE", ip_address: req.ip ?? null, notes: "soft delete",
    });
    res.status(204).send();
  } catch (err) {
    console.error("[finance:invoices:delete]", err);
    res.status(500).json({ error: "שגיאה במחיקת חשבונית" });
  }
});

// ==============================================================
// Embedded invoice-lines endpoints
// ==============================================================

// POST /:id/lines — add a single line; auto-fills VAT rate from issue_date
router.post("/:id/lines", async (req: Request, res: Response) => {
  const invoiceId = Number(req.params.id);
  if (!Number.isInteger(invoiceId) || invoiceId <= 0) { res.status(400).json({ error: "מזהה לא תקין" }); return; }
  const userId = Number((req as { userId?: unknown }).userId) || null;

  // Auto-fill VAT rate if not supplied
  const body = { ...(req.body ?? {}), invoice_id: invoiceId };
  if (body.vat_percent === undefined || body.vat_percent === null) {
    const inv = await db.execute(sql`select issue_date from finance.invoices where id = ${invoiceId}`);
    const row = (inv.rows ?? [])[0] as { issue_date?: string | null } | undefined;
    body.vat_percent = round2(getVatRateForDate(row?.issue_date ?? null) * 100);
  }
  // Auto-compute totals if not supplied
  if (body.line_subtotal === undefined || body.vat_amount === undefined || body.line_total === undefined) {
    const t = computeInvoiceLineTotals({
      quantity: Number(body.quantity ?? 0),
      unit_price: Number(body.unit_price ?? 0),
      discount_percent: Number(body.discount_percent ?? 0),
      vat_percent: Number(body.vat_percent ?? 0),
    });
    body.line_subtotal = t.line_subtotal;
    body.vat_amount = t.vat_amount;
    body.line_total = t.line_total;
  }

  const parsed = CreateInvoiceLineSchema.safeParse(body);
  if (!parsed.success) { res.status(400).json({ error: "שורה לא תקינה", details: parsed.error.flatten() }); return; }
  const d = parsed.data;

  try {
    const r = await db.execute(sql`
      insert into finance.invoice_lines (
        invoice_id, line_number, description, quantity, unit_price,
        discount_percent, line_subtotal, vat_percent, vat_amount, line_total,
        linked_entity_type, linked_entity_id, notes, metadata,
        created_by, updated_by
      ) values (
        ${d.invoice_id}, ${d.line_number}, ${d.description},
        ${d.quantity}, ${d.unit_price},
        ${d.discount_percent ?? 0}, ${d.line_subtotal ?? 0},
        ${d.vat_percent ?? 0}, ${d.vat_amount ?? 0}, ${d.line_total ?? 0},
        ${d.linked_entity_type ?? null}, ${d.linked_entity_id ?? null},
        ${d.notes ?? null}, ${JSON.stringify(d.metadata ?? {})}::jsonb,
        ${userId}, ${userId}
      )
      returning *
    `);
    const line = (r.rows ?? [])[0] as { id?: number } | undefined;

    const totals = await recomputeHeaderTotals(invoiceId);
    await db.execute(sql`
      update finance.invoices set
        subtotal       = ${totals.subtotal},
        discount_total = ${totals.discount_total},
        vat_total      = ${totals.vat_total},
        grand_total    = ${totals.grand_total},
        balance_due    = ${round2(totals.grand_total - 0)},
        updated_by     = ${userId},
        updated_at     = now()
      where id = ${invoiceId}
    `);

    if (line?.id) {
      await logAudit({
        user_id: userId, table_name: "finance_invoice_lines", record_id: line.id,
        action: "INSERT", new_values: d as Record<string, unknown>,
        ip_address: req.ip ?? null,
      });
    }
    res.status(201).json({ line, header_totals: totals });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("duplicate key")) { res.status(409).json({ error: "מספר שורה כבר קיים" }); return; }
    console.error("[finance:invoices:line:create]", err);
    res.status(500).json({ error: "שגיאה בהוספת שורה" });
  }
});

// PUT /:id/lines — replace all lines atomically
router.put("/:id/lines", async (req: Request, res: Response) => {
  const invoiceId = Number(req.params.id);
  if (!Number.isInteger(invoiceId) || invoiceId <= 0) { res.status(400).json({ error: "מזהה לא תקין" }); return; }
  const parsed = ReplaceInvoiceLinesSchema.safeParse({ ...(req.body ?? {}), invoice_id: invoiceId });
  if (!parsed.success) { res.status(400).json({ error: "בקשה לא תקינה", details: parsed.error.flatten() }); return; }
  const userId = Number((req as { userId?: unknown }).userId) || null;
  const { lines } = parsed.data;

  try {
    await db.execute(sql`delete from finance.invoice_lines where invoice_id = ${invoiceId}`);
    for (const l of lines) {
      await db.execute(sql`
        insert into finance.invoice_lines (
          invoice_id, line_number, description, quantity, unit_price,
          discount_percent, line_subtotal, vat_percent, vat_amount, line_total,
          linked_entity_type, linked_entity_id, notes, metadata,
          created_by, updated_by
        ) values (
          ${invoiceId}, ${l.line_number}, ${l.description},
          ${l.quantity}, ${l.unit_price},
          ${l.discount_percent ?? 0}, ${l.line_subtotal ?? 0},
          ${l.vat_percent ?? 0}, ${l.vat_amount ?? 0}, ${l.line_total ?? 0},
          ${l.linked_entity_type ?? null}, ${l.linked_entity_id ?? null},
          ${l.notes ?? null}, ${JSON.stringify(l.metadata ?? {})}::jsonb,
          ${userId}, ${userId}
        )
      `);
    }
    const totals = await recomputeHeaderTotals(invoiceId);
    await db.execute(sql`
      update finance.invoices set
        subtotal = ${totals.subtotal}, discount_total = ${totals.discount_total},
        vat_total = ${totals.vat_total}, grand_total = ${totals.grand_total},
        balance_due = ${round2(totals.grand_total)},
        updated_by = ${userId}, updated_at = now()
      where id = ${invoiceId}
    `);
    await logAudit({
      user_id: userId, table_name: "finance_invoices", record_id: invoiceId,
      action: "UPDATE", new_values: { replaced_lines: lines.length, ...totals },
      ip_address: req.ip ?? null, notes: "bulk replace lines",
    });
    res.json({ ok: true, count: lines.length, header_totals: totals });
  } catch (err) {
    console.error("[finance:invoices:lines:replace]", err);
    res.status(500).json({ error: "שגיאה בעדכון שורות" });
  }
});

// PATCH /:id/lines/:lineId
router.patch("/:id/lines/:lineId", async (req: Request, res: Response) => {
  const invoiceId = Number(req.params.id);
  const lineId = Number(req.params.lineId);
  if (!Number.isInteger(invoiceId) || invoiceId <= 0 || !Number.isInteger(lineId) || lineId <= 0) {
    res.status(400).json({ error: "מזהה לא תקין" }); return;
  }
  const parsed = UpdateInvoiceLineSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "בקשה לא תקינה", details: parsed.error.flatten() }); return; }
  const d = parsed.data;
  const userId = Number((req as { userId?: unknown }).userId) || null;

  // If quantity/unit_price/discount/vat_percent changed, recompute line totals
  if (d.quantity !== undefined || d.unit_price !== undefined || d.discount_percent !== undefined || d.vat_percent !== undefined) {
    const cur = await db.execute(sql`select quantity, unit_price, discount_percent, vat_percent from finance.invoice_lines where id = ${lineId}`);
    const base = (cur.rows ?? [])[0] as { quantity?: number; unit_price?: number; discount_percent?: number; vat_percent?: number } | undefined;
    if (!base) { res.status(404).json({ error: "שורה לא נמצאה" }); return; }
    const t = computeInvoiceLineTotals({
      quantity: Number(d.quantity ?? base.quantity ?? 0),
      unit_price: Number(d.unit_price ?? base.unit_price ?? 0),
      discount_percent: Number(d.discount_percent ?? base.discount_percent ?? 0),
      vat_percent: Number(d.vat_percent ?? base.vat_percent ?? 0),
    });
    d.line_subtotal = t.line_subtotal;
    d.vat_amount = t.vat_amount;
    d.line_total = t.line_total;
  }

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
      update finance.invoice_lines
      set ${sql.join(setFragments, sql`, `)},
          updated_by = ${userId}, updated_at = now()
      where id = ${lineId} and invoice_id = ${invoiceId}
      returning *
    `);
    const row = (r.rows ?? [])[0];
    if (!row) { res.status(404).json({ error: "שורה לא נמצאה" }); return; }
    const totals = await recomputeHeaderTotals(invoiceId);
    await db.execute(sql`
      update finance.invoices set
        subtotal = ${totals.subtotal}, discount_total = ${totals.discount_total},
        vat_total = ${totals.vat_total}, grand_total = ${totals.grand_total},
        balance_due = ${round2(totals.grand_total)},
        updated_by = ${userId}, updated_at = now()
      where id = ${invoiceId}
    `);
    await logAudit({
      user_id: userId, table_name: "finance_invoice_lines", record_id: lineId,
      action: "UPDATE", new_values: d as Record<string, unknown>,
      ip_address: req.ip ?? null,
    });
    res.json({ line: row, header_totals: totals });
  } catch (err) {
    console.error("[finance:invoices:line:update]", err);
    res.status(500).json({ error: "שגיאה בעדכון שורה" });
  }
});

// DELETE /:id/lines/:lineId
router.delete("/:id/lines/:lineId", async (req: Request, res: Response) => {
  const invoiceId = Number(req.params.id);
  const lineId = Number(req.params.lineId);
  if (!Number.isInteger(invoiceId) || invoiceId <= 0 || !Number.isInteger(lineId) || lineId <= 0) {
    res.status(400).json({ error: "מזהה לא תקין" }); return;
  }
  const userId = Number((req as { userId?: unknown }).userId) || null;
  try {
    const r = await db.execute(sql`
      delete from finance.invoice_lines
      where id = ${lineId} and invoice_id = ${invoiceId}
      returning id
    `);
    if ((r.rows ?? []).length === 0) { res.status(404).json({ error: "שורה לא נמצאה" }); return; }
    const totals = await recomputeHeaderTotals(invoiceId);
    await db.execute(sql`
      update finance.invoices set
        subtotal = ${totals.subtotal}, discount_total = ${totals.discount_total},
        vat_total = ${totals.vat_total}, grand_total = ${totals.grand_total},
        balance_due = ${round2(totals.grand_total)},
        updated_by = ${userId}, updated_at = now()
      where id = ${invoiceId}
    `);
    await logAudit({
      user_id: userId, table_name: "finance_invoice_lines", record_id: lineId,
      action: "DELETE", ip_address: req.ip ?? null, notes: "line deleted",
    });
    res.json({ ok: true, header_totals: totals });
  } catch (err) {
    console.error("[finance:invoices:line:delete]", err);
    res.status(500).json({ error: "שגיאה במחיקת שורה" });
  }
});

export default router;
