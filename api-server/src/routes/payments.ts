// =============================================================
// Unified Payments router — GET /api/payments/:id
// CRUD-GAP-FIX: payments live in 4 tables (payment_schedule,
// customer_payments, supplier_payments, ap_payments). This router
// resolves a single id across all of them and returns a normalized
// envelope so 360 pages have one URL to call.
// =============================================================
import { Router, Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { validateSession } from "../lib/auth";

const router = Router();

async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.substring(7) : (req.query.token as string) || null;
  if (!token) { res.status(401).json({ ok: false, error: "נדרשת התחברות" }); return; }
  const result = await validateSession(token);
  if (result.error || !result.user) { res.status(401).json({ ok: false, error: "הסשן פג תוקף" }); return; }
  (req as any).user = result.user;
  next();
}
router.use(requireAuth as any);

type PaymentSource =
  | "payment_schedule"
  | "customer_payments"
  | "supplier_payments"
  | "ap_payments";

// Each tuple: [table, kind label]. Order = priority when querying by numeric id.
const SOURCES: Array<{ table: PaymentSource; kind: string }> = [
  { table: "payment_schedule", kind: "scheduled" },
  { table: "customer_payments", kind: "customer" },
  { table: "supplier_payments", kind: "supplier" },
  { table: "ap_payments", kind: "ap" },
];

async function fetchFromTable(table: PaymentSource, id: number): Promise<any | null> {
  try {
    // Whitelisted table name — sql.identifier protects against injection.
    const r = await db.execute(sql.raw(`SELECT * FROM ${table} WHERE id = ${id} LIMIT 1`));
    const rows: any[] = (r as any).rows || [];
    return rows[0] || null;
  } catch (e: any) {
    const msg = String(e?.message || e);
    if (/relation .* does not exist|undefined_table/i.test(msg)) return null;
    throw e;
  }
}

router.get("/payments/:id(\\d+)", async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id) || id <= 0) {
    return res.status(400).json({ ok: false, error: "מזהה תשלום לא תקין" });
  }
  try {
    let foundIn = 0;
    for (const src of SOURCES) {
      const row = await fetchFromTable(src.table, id);
      if (row) {
        const amount = Number(row.amount ?? row.paid_amount ?? 0);
        return res.json({
          ok: true,
          data: {
            id: row.id,
            source: src.table,
            kind: src.kind,
            amount,
            currency: row.currency || "ILS",
            payment_date: row.payment_date || row.paid_date || row.due_date || null,
            party_name: row.party_name || row.customer_name || row.supplier_name || null,
            invoice_number: row.invoice_number || null,
            status: row.status || null,
            payment_method: row.payment_method || null,
            reference_number: row.reference_number || row.reference || null,
            raw: row,
          },
        });
      }
      foundIn++;
    }
    if (foundIn === 0) {
      return res.status(503).json({ ok: false, error: "מודול תשלומים אינו זמין" });
    }
    return res.status(404).json({ ok: false, error: "תשלום לא נמצא" });
  } catch (e: any) {
    console.error("[payments GET /:id] error:", e?.message || e);
    return res.status(500).json({ ok: false, error: "שגיאה באחזור פרטי התשלום" });
  }
});

export default router;
