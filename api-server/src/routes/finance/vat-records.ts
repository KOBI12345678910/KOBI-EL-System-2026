// ============================================================
// API router — finance.vat_records
// CRUD + POST /export — generates PCN836/PCN874 payload.
// Generated: 2026-04-18 (Finance Tier 1 — Option 1)
// ============================================================
import { Router, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { authMiddleware } from "../../middleware/auth";
import { logAudit } from "../../lib/audit-log";
import {
  CreateVatRecordSchema,
  UpdateVatRecordSchema,
  ListVatRecordsQuerySchema,
  VatExportSchema,
} from "@workspace/api-zod/finance";
import { getVatRateForDate } from "../israeli-accounting-engine";

const router = Router();
router.use(authMiddleware);

// ──────────────────────────────────────────────────────────────
// LIST
// ──────────────────────────────────────────────────────────────
router.get("/", async (req: Request, res: Response) => {
  const parsed = ListVatRecordsQuerySchema.safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: "בקשה לא תקינה", details: parsed.error.flatten() }); return; }
  const { tax_period, vat_type, filed, invoice_id, limit, offset, order_by, order_dir } = parsed.data;

  const whereParts: string[] = ["coalesce(is_deleted, false) = false"];
  if (tax_period)          whereParts.push(`tax_period = '${tax_period.replace(/'/g, "''")}'`);
  if (vat_type)            whereParts.push(`vat_type = '${vat_type}'`);
  if (filed !== undefined) whereParts.push(`filed = ${filed ? "true" : "false"}`);
  if (invoice_id)          whereParts.push(`invoice_id = ${invoice_id}`);
  const whereClause = `where ${whereParts.join(" and ")}`;

  try {
    const rows = await db.execute(sql.raw(`
      select * from finance.vat_records
      ${whereClause}
      order by ${order_by} ${order_dir}
      limit ${limit} offset ${offset}
    `));
    const countRes = await db.execute(sql.raw(`select count(*)::int as total from finance.vat_records ${whereClause}`));
    res.json({
      data: rows.rows ?? [], rows: rows.rows ?? [],
      total: Number((countRes.rows?.[0] as { total?: number })?.total ?? 0),
      limit, offset,
    });
  } catch (err) {
    console.error("[finance:vat:list]", err);
    res.status(500).json({ error: "שגיאה בטעינת רישומי מע״מ" });
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
      select * from finance.vat_records
      where id = ${id} and coalesce(is_deleted, false) = false
      limit 1
    `);
    const row = (r.rows ?? [])[0];
    if (!row) { res.status(404).json({ error: "רישום לא נמצא" }); return; }
    res.json(row);
  } catch (err) {
    console.error("[finance:vat:get]", err);
    res.status(500).json({ error: "שגיאה בטעינת רישום" });
  }
});

// ──────────────────────────────────────────────────────────────
// POST / — create
// ──────────────────────────────────────────────────────────────
router.post("/", async (req: Request, res: Response) => {
  const parsed = CreateVatRecordSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "בקשה לא תקינה", details: parsed.error.flatten() }); return; }
  const d = parsed.data;
  const userId = Number((req as { userId?: unknown }).userId) || null;

  // Sanity: expected VAT based on period → rate
  const periodDate = `${d.tax_period.slice(0, 7)}-01`;
  const expectedRate = getVatRateForDate(periodDate);
  const expectedVat = Math.round(d.taxable_amount * expectedRate * 100) / 100;
  if (Math.abs(d.vat_amount - expectedVat) > Math.max(0.5, expectedVat * 0.01)) {
    // More than 1% or ₪0.50 off from expected — still allow, but flag in notes
    d.notes = `${d.notes ?? ""}\n[warn] vat_amount deviates from expected (${expectedVat}) at rate ${expectedRate}`.trim();
  }

  try {
    const r = await db.execute(sql`
      insert into finance.vat_records (
        invoice_id, tax_period, vat_type, taxable_amount, vat_amount,
        filed, filed_at, notes, record_code, is_active, metadata,
        created_by, updated_by
      ) values (
        ${d.invoice_id ?? null}, ${d.tax_period}, ${d.vat_type},
        ${d.taxable_amount}, ${d.vat_amount},
        ${d.filed ?? false}, ${d.filed_at ?? null},
        ${d.notes ?? null}, ${d.record_code ?? null},
        ${d.is_active ?? true}, ${JSON.stringify(d.metadata ?? {})}::jsonb,
        ${userId}, ${userId}
      )
      returning *
    `);
    const row = (r.rows ?? [])[0] as { id?: number } | undefined;
    if (row?.id) {
      await logAudit({
        user_id: userId, table_name: "finance_vat_records", record_id: row.id,
        action: "INSERT", new_values: d as Record<string, unknown>,
        ip_address: req.ip ?? null,
      });
    }
    res.status(201).json(row);
  } catch (err) {
    console.error("[finance:vat:create]", err);
    res.status(500).json({ error: "שגיאה ביצירת רישום" });
  }
});

// ──────────────────────────────────────────────────────────────
// PATCH /:id
// ──────────────────────────────────────────────────────────────
router.patch("/:id", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "מזהה לא תקין" }); return; }
  const parsed = UpdateVatRecordSchema.safeParse(req.body);
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
      update finance.vat_records
      set ${sql.join(setFragments, sql`, `)},
          updated_by = ${userId}, updated_at = now()
      where id = ${id} and coalesce(is_deleted, false) = false
      returning *
    `);
    const row = (r.rows ?? [])[0];
    if (!row) { res.status(404).json({ error: "רישום לא נמצא" }); return; }
    await logAudit({
      user_id: userId, table_name: "finance_vat_records", record_id: id,
      action: "UPDATE", new_values: d as Record<string, unknown>,
      ip_address: req.ip ?? null,
    });
    res.json(row);
  } catch (err) {
    console.error("[finance:vat:update]", err);
    res.status(500).json({ error: "שגיאה בעדכון רישום" });
  }
});

// ──────────────────────────────────────────────────────────────
// POST /export — PCN836 / PCN874 / CSV summary payload
// ──────────────────────────────────────────────────────────────
router.post("/export", async (req: Request, res: Response) => {
  const parsed = VatExportSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "בקשה לא תקינה", details: parsed.error.flatten() }); return; }
  const d = parsed.data;
  const userId = Number((req as { userId?: unknown }).userId) || null;

  try {
    const filter = d.include_filed ? sql`1=1` : sql`filed = false`;
    const rowsR = await db.execute(sql`
      select r.id, r.invoice_id, r.tax_period, r.vat_type, r.taxable_amount, r.vat_amount,
             r.filed, i.invoice_number, i.customer_id, i.issue_date, i.currency
      from finance.vat_records r
      left join finance.invoices i on i.id = r.invoice_id
      where r.tax_period = ${d.tax_period}
        and ${filter}
        and coalesce(r.is_deleted, false) = false
      order by i.issue_date asc, r.id asc
    `);
    const rows = (rowsR.rows ?? []) as Array<{
      id: number; invoice_id: number | null; tax_period: string; vat_type: string;
      taxable_amount: string | number; vat_amount: string | number;
      invoice_number?: string; customer_id?: number; issue_date?: string; currency?: string;
    }>;

    const totalTaxable = rows.reduce((s, r) => s + Number(r.taxable_amount), 0);
    const totalVat     = rows.reduce((s, r) => s + Number(r.vat_amount), 0);
    const salesRows    = rows.filter((r) => r.vat_type === "sales_output");
    const purchaseRows = rows.filter((r) => r.vat_type === "purchase_input");

    // Build file payload per format
    let payload: string;
    if (d.file_format === "csv_summary") {
      payload = [
        "invoice_number,issue_date,vat_type,taxable_amount,vat_amount,currency",
        ...rows.map((r) =>
          [
            r.invoice_number ?? "",
            r.issue_date ?? "",
            r.vat_type,
            Number(r.taxable_amount).toFixed(2),
            Number(r.vat_amount).toFixed(2),
            r.currency ?? "ILS",
          ].join(","),
        ),
      ].join("\n");
    } else {
      // PCN836 / PCN874 — fixed-width header + detail record format (simplified).
      // Header: "O" + 9-digit business_id + 6-char period + total taxable + total vat
      const period6 = d.tax_period.replace("-", "").slice(0, 6);
      const header = [
        "O",
        d.business_id.padStart(9, "0"),
        period6.padStart(6, "0"),
        Math.round(totalTaxable).toString().padStart(11, "0"),
        Math.round(totalVat).toString().padStart(9, "0"),
      ].join("");
      const details = rows.map((r) => {
        const amt = Math.round(Number(r.taxable_amount)).toString().padStart(11, "0");
        const vat = Math.round(Number(r.vat_amount)).toString().padStart(9, "0");
        const kind = r.vat_type === "sales_output" ? "S" : r.vat_type === "purchase_input" ? "I" : "X";
        return `${kind}${(r.invoice_number ?? String(r.id)).padEnd(20, " ")}${amt}${vat}`;
      });
      payload = [header, ...details].join("\n");
    }

    // Record a tax_exports row
    const exportNumber = `EXP-VAT-${d.tax_period}-${Date.now()}`;
    await db.execute(sql`
      insert into finance.tax_exports
        (export_number, export_type, tax_period, file_reference, exported_at, exported_by_user_id, state, notes)
      values
        (${exportNumber}, ${d.file_format}, ${d.tax_period}, ${exportNumber + ".txt"}, now(), ${userId}, 'Generated', ${d.export_notes ?? null})
    `);

    await logAudit({
      user_id: userId, table_name: "finance_tax_exports", record_id: 0,
      action: "INSERT",
      new_values: { export_number: exportNumber, tax_period: d.tax_period, format: d.file_format, rows: rows.length },
      ip_address: req.ip ?? null, notes: `VAT export ${d.file_format}`,
    });

    res.json({
      ok: true,
      export_number: exportNumber,
      tax_period: d.tax_period,
      format: d.file_format,
      totals: {
        rows: rows.length,
        sales_count: salesRows.length,
        purchase_count: purchaseRows.length,
        total_taxable: Math.round(totalTaxable * 100) / 100,
        total_vat: Math.round(totalVat * 100) / 100,
      },
      payload,
    });
  } catch (err) {
    console.error("[finance:vat:export]", err);
    res.status(500).json({ error: "שגיאה בייצוא מע״מ" });
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
      update finance.vat_records
      set is_deleted = true, is_active = false, updated_by = ${userId}, updated_at = now()
      where id = ${id} and coalesce(is_deleted, false) = false
      returning id
    `);
    if ((r.rows ?? []).length === 0) { res.status(404).json({ error: "רישום לא נמצא" }); return; }
    await logAudit({
      user_id: userId, table_name: "finance_vat_records", record_id: id,
      action: "DELETE", ip_address: req.ip ?? null, notes: "soft delete",
    });
    res.status(204).send();
  } catch (err) {
    console.error("[finance:vat:delete]", err);
    res.status(500).json({ error: "שגיאה במחיקת רישום" });
  }
});

export default router;
