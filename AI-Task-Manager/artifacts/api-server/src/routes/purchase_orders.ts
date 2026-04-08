import { Router, type IRouter } from "express";
import { pool, db } from "@workspace/db";
import { supplierContractsTable } from "@workspace/db/schema";
import { eq, and, gte, desc } from "drizzle-orm";
import { performMatchAndSave } from "./three-way-matching";

const router: IRouter = Router();

async function getActiveContractTermsForSupplier(supplierId: number): Promise<{
  paymentTerms: string | null;
  currency: string | null;
  contractId: number | null;
} | null> {
  const today = new Date().toISOString().slice(0, 10);
  const contracts = await db
    .select({
      id: supplierContractsTable.id,
      paymentTerms: supplierContractsTable.paymentTerms,
      currency: supplierContractsTable.currency,
      endDate: supplierContractsTable.endDate,
    })
    .from(supplierContractsTable)
    .where(
      and(
        eq(supplierContractsTable.supplierId, supplierId),
        eq(supplierContractsTable.status, "פעיל"),
        gte(supplierContractsTable.endDate, today)
      )
    )
    .orderBy(desc(supplierContractsTable.endDate))
    .limit(1);

  if (contracts.length === 0) return null;
  const c = contracts[0];
  return {
    paymentTerms: c.paymentTerms,
    currency: c.currency,
    contractId: c.id,
  };
}

router.get("/purchase-orders", async (_req, res) => {
  const result = await pool.query("SELECT * FROM purchase_orders WHERE deleted_at IS NULL ORDER BY id DESC LIMIT 200");
  res.json(result.rows);
});

router.get("/purchase-orders/:id", async (req, res) => {
  const id = String(req.params.id);
  const result = await pool.query("SELECT * FROM purchase_orders WHERE id = $1 AND deleted_at IS NULL", [id]);
  if (result.rows.length === 0) { res.status(404).json({ error: "לא נמצא" }); return; }
  res.json(result.rows[0]);
});

router.post("/purchase-orders", async (req, res) => {
  try {
    const data = { ...req.body };
    const supplierId = data.supplier_id ? parseInt(data.supplier_id, 10) : null;

    if (!data.order_number) {
      const countResult = await pool.query("SELECT COUNT(*) as cnt FROM purchase_orders");
      const nextNum = parseInt(countResult.rows[0]?.cnt || "0", 10) + 1;
      data.order_number = `PO-${String(nextNum).padStart(4, "0")}`;
    }

    if (supplierId && !isNaN(supplierId)) {
      const contractTerms = await getActiveContractTermsForSupplier(supplierId).catch(err => {
        console.error("[purchase-orders] Contract term lookup failed:", err);
        return null;
      });

      if (contractTerms) {
        if (!data.payment_terms && contractTerms.paymentTerms) {
          data.payment_terms = contractTerms.paymentTerms;
        }
        if (!data.currency && contractTerms.currency) {
          data.currency = contractTerms.currency;
        }
        console.log(`[purchase-orders] Auto-populated contract terms from contract #${contractTerms.contractId} for supplier ${supplierId}`);
      }
    }

    const keys = Object.keys(data);
    const vals = Object.values(data);
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(", ");
    const result = await pool.query(
      `INSERT INTO purchase_orders (${keys.join(", ")}) VALUES (${placeholders}) RETURNING *`,
      vals
    );
    res.status(201).json(result.rows[0]);
  } catch (err: any) {
    console.error("[purchase-orders] POST error:", err);
    res.status(400).json({ error: err.message || "שגיאה ביצירת הזמנת רכש" });
  }
});

const PO_ACKNOWLEDGED_STATUSES = ["אושר", "אושרה", "מאושר", "confirmed", "acknowledged"];

router.put("/purchase-orders/:id", async (req, res) => {
  try {
    const id = String(req.params.id);
    const existing = await pool.query("SELECT status, supplier_id FROM purchase_orders WHERE id = $1", [id]);
    const oldStatus: string | null = existing.rows[0]?.status ?? null;
    const supplierId: number | null = existing.rows[0]?.supplier_id ?? null;

    const data = req.body;
    const keys = Object.keys(data);
    const vals = Object.values(data);
    const sets = keys.map((k, i) => `${k} = $${i + 1}`).join(", ");
    vals.push(id);
    const result = await pool.query(`UPDATE purchase_orders SET ${sets} WHERE id = $${vals.length} RETURNING *`, vals);

    if (!result.rows[0]) {
      res.status(404).json({ error: "לא נמצא" });
      return;
    }

    const newStatus: string | undefined = data.status;
    if (
      newStatus &&
      newStatus !== oldStatus &&
      supplierId &&
      PO_ACKNOWLEDGED_STATUSES.includes(newStatus)
    ) {
      import("./supplier-intelligence").then(({ triggerSupplierKpiRecalculation }) => {
        triggerSupplierKpiRecalculation(supplierId).catch(err => {
          console.error(`[purchase-orders] KPI recalculation failed for supplier ${supplierId}:`, err);
        });
      }).catch(err => {
        console.error("[purchase-orders] Failed to import supplier-intelligence for KPI recalculation:", err);
      });
    }

    const invoiceNumber = data.invoice_number || data.invoiceNumber;
    const invoiceAmount = data.invoice_amount || data.invoiceAmount;
    const invoiceDate = data.invoice_date || data.invoiceDate;
    if (invoiceNumber && invoiceAmount) {
      performMatchAndSave(Number(id), parseFloat(String(invoiceAmount)), String(invoiceNumber), invoiceDate)
        .catch((err: Error) => console.error("[purchase_orders] three-way match auto-trigger error:", err.message));
    }

    res.json(result.rows[0]);
  } catch (err: any) {
    console.error("[purchase-orders] PUT error:", err);
    res.status(400).json({ error: err.message || "שגיאה בעדכון הזמנת רכש" });
  }
});

router.delete("/purchase-orders/:id", async (req, res) => {
  const id = String(req.params.id);
  await pool.query("UPDATE purchase_orders SET deleted_at = NOW() WHERE id = $1", [id]);
  res.json({ success: true });
});

export default router;
