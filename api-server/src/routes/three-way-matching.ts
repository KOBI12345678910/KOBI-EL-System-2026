import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  purchaseOrdersTable, purchaseOrderItemsTable,
  goodsReceiptsTable, goodsReceiptItemsTable,
} from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod/v4";
import { sql } from "drizzle-orm";

const router: IRouter = Router();

async function safeExec(query: string): Promise<any[]> {
  try {
    const result = await db.execute(sql.raw(query));
    return result.rows || [];
  } catch (err: any) {
    console.error(`[three-way-matching] query error: ${err.message}`);
    return [];
  }
}

function esc(val: string | null | undefined): string {
  if (val === null || val === undefined) return "NULL";
  return `'${String(val).replace(/'/g, "''").replace(/\\/g, "\\\\")}'`;
}
function escInt(val: number | null | undefined): string {
  if (val === null || val === undefined) return "NULL";
  const n = Math.floor(Number(val));
  if (isNaN(n)) return "NULL";
  return String(n);
}
function escNum(val: number | string | null | undefined): string {
  const n = Number(val);
  if (isNaN(n) || !isFinite(n)) return "0";
  return String(n);
}

async function ensureTables() {
  await safeExec(`CREATE TABLE IF NOT EXISTS three_way_match_config (id SERIAL PRIMARY KEY, quantity_tolerance_pct NUMERIC(5,2) DEFAULT 5, price_tolerance_pct NUMERIC(5,2) DEFAULT 2, amount_tolerance_pct NUMERIC(5,2) DEFAULT 3, auto_approve_within_tolerance BOOLEAN DEFAULT TRUE, updated_at TIMESTAMP DEFAULT NOW())`);
  await safeExec(`INSERT INTO three_way_match_config (quantity_tolerance_pct, price_tolerance_pct, amount_tolerance_pct) SELECT 5, 2, 3 WHERE NOT EXISTS (SELECT 1 FROM three_way_match_config)`);
  await safeExec(`CREATE TABLE IF NOT EXISTS three_way_match_results (id SERIAL PRIMARY KEY, po_id INTEGER NOT NULL, grn_id INTEGER, invoice_number VARCHAR(100), invoice_date DATE, invoice_amount NUMERIC(15,2), match_status VARCHAR(50) DEFAULT 'pending', po_amount NUMERIC(15,2), grn_amount NUMERIC(15,2), quantity_variance_pct NUMERIC(8,3), price_variance_pct NUMERIC(8,3), amount_variance_pct NUMERIC(8,3), exception_reason TEXT, resolved_by VARCHAR(255), resolved_at TIMESTAMP, resolution_action VARCHAR(100), resolution_notes TEXT, auto_approved BOOLEAN DEFAULT FALSE, line_items JSONB, created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW())`);
}

ensureTables().catch(console.error);

interface InvoiceLine {
  poItemId?: number;
  description?: string;
  quantity?: number;
  unitPrice?: number;
  totalPrice?: number;
}

export async function performMatchAndSave(poId: number, invoiceAmount: number, invoiceNumber: string, invoiceDate?: string, invoiceLines?: InvoiceLine[]): Promise<void> {
  try {
    await ensureTables();
    const matchResult = await performMatch(poId, invoiceAmount, invoiceNumber, invoiceDate, invoiceLines);
    if (matchResult.error) return;
    const exceptionText = esc(matchResult.exceptionReason);
    const invoiceDateVal = invoiceDate ? esc(invoiceDate) : "NOW()::DATE";
    const [existing] = await safeExec(`SELECT id FROM three_way_match_results WHERE po_id = ${poId} AND invoice_number = ${esc(invoiceNumber)}`);
    if (existing) {
      await safeExec(`UPDATE three_way_match_results SET match_status = ${esc(matchResult.matchStatus)}, invoice_amount = ${escNum(invoiceAmount)}, exception_reason = ${exceptionText}, line_items = ${esc(JSON.stringify(matchResult.lineItems))}, auto_approved = ${matchResult.autoApproved}, updated_at = NOW() WHERE id = ${existing.id}`);
    } else {
      await safeExec(`INSERT INTO three_way_match_results (po_id, invoice_number, invoice_date, po_amount, grn_amount, invoice_amount, match_status, exception_reason, auto_approved, line_items) VALUES (${poId}, ${esc(invoiceNumber)}, ${invoiceDateVal}, ${escNum(matchResult.poAmount)}, ${escNum(matchResult.grnAmount)}, ${escNum(invoiceAmount)}, ${esc(matchResult.matchStatus)}, ${exceptionText}, ${matchResult.autoApproved}, ${esc(JSON.stringify(matchResult.lineItems))})`);
    }
    await db.update(purchaseOrdersTable).set({
      invoiceReceived: true, invoiceNumber, invoiceDate: invoiceDate || new Date().toISOString().slice(0, 10),
      invoiceAmount: String(invoiceAmount), threeWayMatch: matchResult.autoApproved, updatedAt: new Date(),
    }).where(eq(purchaseOrdersTable.id, poId));
  } catch (err: any) {
    console.error("[three-way-matching] performMatchAndSave error:", err.message);
  }
}

async function performMatch(poId: number, invoiceAmount: number, invoiceNumber: string, invoiceDate?: string, invoiceLines?: InvoiceLine[]): Promise<any> {
  const [config] = await safeExec(`SELECT * FROM three_way_match_config LIMIT 1`);
  const qtyTol = Number(config?.quantity_tolerance_pct || 5);
  const priceTol = Number(config?.price_tolerance_pct || 2);
  const amtTol = Number(config?.amount_tolerance_pct || 3);

  const [po] = await db.select().from(purchaseOrdersTable).where(eq(purchaseOrdersTable.id, poId));
  if (!po) return { error: "PO not found" };

  const poItems = await db.select().from(purchaseOrderItemsTable).where(eq(purchaseOrderItemsTable.orderId, poId));
  const grns = await db.select().from(goodsReceiptsTable).where(eq(goodsReceiptsTable.orderId, poId));

  const poAmount = parseFloat(po.totalAmount || "0");
  let grnAmount = 0;
  const lineItems: any[] = [];

  for (const poItem of poItems) {
    const orderedQty = parseFloat(poItem.quantity || "0");
    const orderedPrice = parseFloat(poItem.unitPrice || "0");

    let receivedQty = 0;
    for (const grn of grns) {
      const grnitems = await db.select().from(goodsReceiptItemsTable).where(eq(goodsReceiptItemsTable.receiptId, grn.id));
      for (const gi of grnitems) {
        if (gi.orderItemId === poItem.id) {
          receivedQty += parseFloat(gi.receivedQuantity || "0");
        }
      }
    }

    grnAmount += receivedQty * orderedPrice;

    const invLine = invoiceLines?.find(l =>
      l.poItemId === poItem.id ||
      (l.description && poItem.itemDescription &&
        l.description.trim().toLowerCase() === String(poItem.itemDescription).trim().toLowerCase())
    );
    const invQty = invLine?.quantity ?? null;
    const invPrice = invLine?.unitPrice ?? null;
    const invLineTotal = invLine?.totalPrice ?? (invQty != null && invPrice != null ? invQty * invPrice : null);

    const qtyVariance = orderedQty > 0 ? Math.abs((receivedQty - orderedQty) / orderedQty * 100) : 0;
    const invQtyVariance = (invQty != null && orderedQty > 0)
      ? Math.abs((invQty - orderedQty) / orderedQty * 100)
      : null;
    const invPriceVariance = (invPrice != null && orderedPrice > 0)
      ? Math.abs((invPrice - orderedPrice) / orderedPrice * 100)
      : null;

    const lineExceptions: string[] = [];
    if (qtyVariance > qtyTol) lineExceptions.push(`קמות שהתקבלה חורגת ב-${qtyVariance.toFixed(1)}%`);
    if (invQtyVariance != null && invQtyVariance > qtyTol) lineExceptions.push(`כמות בחשבונית חורגת ב-${invQtyVariance.toFixed(1)}%`);
    if (invPriceVariance != null && invPriceVariance > priceTol) lineExceptions.push(`מחיר בחשבונית חורג ב-${invPriceVariance.toFixed(1)}%`);

    const lineStatus = lineExceptions.length > 0
      ? "variance"
      : (receivedQty === 0 ? "not_received" : "matched");

    lineItems.push({
      poItemId: poItem.id,
      description: poItem.itemDescription,
      orderedQty,
      receivedQty,
      orderedPrice,
      invoiceQty: invQty,
      invoicePrice: invPrice,
      invoiceLineTotal: invLineTotal,
      qtyVariance: Math.round(qtyVariance * 100) / 100,
      invQtyVariance: invQtyVariance != null ? Math.round(invQtyVariance * 100) / 100 : null,
      invPriceVariance: invPriceVariance != null ? Math.round(invPriceVariance * 100) / 100 : null,
      lineStatus,
      lineExceptions,
    });
  }

  const amountVariance = poAmount > 0 ? Math.abs((invoiceAmount - poAmount) / poAmount * 100) : 0;
  const priceVariance = grnAmount > 0 ? Math.abs((invoiceAmount - grnAmount) / grnAmount * 100) : (poAmount > 0 ? Math.abs((invoiceAmount - poAmount) / poAmount * 100) : 0);
  const qtyVarianceOverall = grns.length === 0 ? 100 : lineItems.reduce((m: number, l) => Math.max(m, l.qtyVariance), 0);

  let matchStatus = "matched";
  const exceptions: string[] = [];

  if (grns.length === 0) {
    matchStatus = "no_grn";
    exceptions.push("לא נמצאה קבלת סחורה");
  } else {
    if (qtyVarianceOverall > qtyTol) {
      matchStatus = "partial_match";
      exceptions.push(`חריגת כמות: ${qtyVarianceOverall.toFixed(1)}% (מעל ${qtyTol}%)`);
    }
    if (priceVariance > priceTol) {
      matchStatus = "exception";
      exceptions.push(`חריגת מחיר: ${priceVariance.toFixed(1)}% (מעל ${priceTol}%)`);
    }
    if (amountVariance > amtTol) {
      matchStatus = "exception";
      exceptions.push(`חריגת סכום חשבונית: ${amountVariance.toFixed(1)}% (מעל ${amtTol}%)`);
    }
    if (lineItems.some(l => l.lineExceptions?.length > 0)) {
      if (matchStatus === "matched") matchStatus = "partial_match";
    }
  }

  const autoApproved = matchStatus === "matched" && config?.auto_approve_within_tolerance;

  return {
    poId, poAmount, grnAmount, invoiceAmount, invoiceNumber,
    matchStatus: autoApproved ? "auto_approved" : matchStatus,
    quantityVariancePct: Math.round(qtyVarianceOverall * 100) / 100,
    priceVariancePct: Math.round(priceVariance * 100) / 100,
    amountVariancePct: Math.round(amountVariance * 100) / 100,
    exceptionReason: exceptions.join("; "),
    autoApproved,
    lineItems,
    hasInvoiceLines: (invoiceLines?.length ?? 0) > 0,
  };
}

router.get("/three-way-matching", async (req, res) => {
  try {
    const results = await safeExec(`
      SELECT
        twm.*,
        po.order_number,
        po.total_amount AS po_total,
        po.currency,
        s.supplier_name
      FROM three_way_match_results twm
      JOIN purchase_orders po ON po.id = twm.po_id
      LEFT JOIN suppliers s ON s.id = po.supplier_id
      ORDER BY twm.created_at DESC
    `);
    res.json(results);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

router.get("/three-way-matching/stats", async (_req, res) => {
  try {
    const stats = await safeExec(`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE match_status IN ('matched','auto_approved')) AS matched,
        COUNT(*) FILTER (WHERE match_status = 'partial_match') AS partial,
        COUNT(*) FILTER (WHERE match_status = 'exception') AS exceptions,
        COUNT(*) FILTER (WHERE match_status = 'pending') AS pending
      FROM three_way_match_results
    `);
    res.json(stats[0] || { total: 0, matched: 0, partial: 0, exceptions: 0, pending: 0 });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

router.get("/three-way-matching/config", async (_req, res) => {
  try {
    const [config] = await safeExec(`SELECT * FROM three_way_match_config LIMIT 1`);
    res.json(config || { quantity_tolerance_pct: 5, price_tolerance_pct: 2, amount_tolerance_pct: 3 });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

router.put("/three-way-matching/config", async (req, res) => {
  try {
    const body = z.object({
      quantityTolerancePct: z.number().min(0).max(100).optional(),
      priceTolerancePct: z.number().min(0).max(100).optional(),
      amountTolerancePct: z.number().min(0).max(100).optional(),
      autoApproveWithinTolerance: z.boolean().optional(),
    }).parse(req.body);

    const sets: string[] = ["updated_at = NOW()"];
    if (body.quantityTolerancePct !== undefined) sets.push(`quantity_tolerance_pct = ${escNum(body.quantityTolerancePct)}`);
    if (body.priceTolerancePct !== undefined) sets.push(`price_tolerance_pct = ${escNum(body.priceTolerancePct)}`);
    if (body.amountTolerancePct !== undefined) sets.push(`amount_tolerance_pct = ${escNum(body.amountTolerancePct)}`);
    if (body.autoApproveWithinTolerance !== undefined) sets.push(`auto_approve_within_tolerance = ${body.autoApproveWithinTolerance}`);

    const [config] = await safeExec(`
      UPDATE three_way_match_config SET ${sets.join(", ")} RETURNING *
    `);
    res.json(config);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

router.post("/three-way-matching/run", async (req, res) => {
  try {
    const body = z.object({
      poId: z.number().int().positive(),
      invoiceAmount: z.number().positive(),
      invoiceNumber: z.string().min(1),
      invoiceDate: z.string().optional(),
      invoiceLines: z.array(z.object({
        poItemId: z.number().optional(),
        description: z.string().optional(),
        quantity: z.number().optional(),
        unitPrice: z.number().optional(),
        totalPrice: z.number().optional(),
      })).optional(),
    }).parse(req.body);

    const matchResult = await performMatch(body.poId, body.invoiceAmount, body.invoiceNumber, body.invoiceDate, body.invoiceLines);
    if (matchResult.error) return res.status(404).json({ message: matchResult.error });

    const [existing] = await safeExec(`SELECT id FROM three_way_match_results WHERE po_id = ${body.poId} AND invoice_number = ${esc(body.invoiceNumber)}`);

    let result;
    if (existing) {
      [result] = await safeExec(`
        UPDATE three_way_match_results SET
          grn_amount = ${escNum(matchResult.grnAmount)},
          invoice_amount = ${escNum(body.invoiceAmount)},
          po_amount = ${escNum(matchResult.poAmount)},
          match_status = ${esc(matchResult.matchStatus)},
          quantity_variance_pct = ${escNum(matchResult.quantityVariancePct)},
          price_variance_pct = ${escNum(matchResult.priceVariancePct)},
          amount_variance_pct = ${escNum(matchResult.amountVariancePct)},
          exception_reason = ${esc(matchResult.exceptionReason)},
          auto_approved = ${matchResult.autoApproved},
          line_items = ${esc(JSON.stringify(matchResult.lineItems))}::jsonb,
          updated_at = NOW()
        WHERE id = ${existing.id} RETURNING *
      `);
    } else {
      [result] = await safeExec(`
        INSERT INTO three_way_match_results
          (po_id, invoice_number, invoice_date, invoice_amount, po_amount, grn_amount,
           match_status, quantity_variance_pct, price_variance_pct, amount_variance_pct,
           exception_reason, auto_approved, line_items)
        VALUES
          (${body.poId}, ${esc(body.invoiceNumber)}, ${body.invoiceDate ? esc(body.invoiceDate) : "CURRENT_DATE"},
           ${escNum(body.invoiceAmount)}, ${escNum(matchResult.poAmount)}, ${escNum(matchResult.grnAmount)},
           ${esc(matchResult.matchStatus)}, ${escNum(matchResult.quantityVariancePct)},
           ${escNum(matchResult.priceVariancePct)}, ${escNum(matchResult.amountVariancePct)},
           ${esc(matchResult.exceptionReason)}, ${matchResult.autoApproved},
           ${esc(JSON.stringify(matchResult.lineItems))}::jsonb)
        RETURNING *
      `);
    }

    if (matchResult.autoApproved) {
      await db.update(purchaseOrdersTable).set({
        invoiceReceived: true,
        invoiceNumber: body.invoiceNumber,
        invoiceDate: body.invoiceDate || new Date().toISOString().slice(0, 10),
        invoiceAmount: String(body.invoiceAmount),
        threeWayMatch: true,
        updatedAt: new Date(),
      }).where(eq(purchaseOrdersTable.id, body.poId));
    } else {
      await db.update(purchaseOrdersTable).set({
        invoiceReceived: true,
        invoiceNumber: body.invoiceNumber,
        invoiceDate: body.invoiceDate || new Date().toISOString().slice(0, 10),
        invoiceAmount: String(body.invoiceAmount),
        threeWayMatch: false,
        updatedAt: new Date(),
      }).where(eq(purchaseOrdersTable.id, body.poId));
    }

    res.json({ ...result, lineItems: matchResult.lineItems });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

router.post("/three-way-matching/invoice-received", async (req, res) => {
  try {
    const body = z.object({
      poId: z.number().int().positive(),
      invoiceNumber: z.string().min(1),
      invoiceAmount: z.number().positive(),
      invoiceDate: z.string().optional(),
      invoiceLines: z.array(z.object({
        poItemId: z.number().optional(),
        description: z.string().optional(),
        quantity: z.number().optional(),
        unitPrice: z.number().optional(),
        totalPrice: z.number().optional(),
      })).optional(),
    }).parse(req.body);

    const matchResult = await performMatch(body.poId, body.invoiceAmount, body.invoiceNumber, body.invoiceDate, body.invoiceLines);
    if (matchResult.error) return res.status(404).json({ message: matchResult.error });

    const [existing] = await safeExec(`SELECT id FROM three_way_match_results WHERE po_id = ${body.poId} AND invoice_number = ${esc(body.invoiceNumber)}`);
    const exceptionText = esc(matchResult.exceptionReason);
    const invoiceDateVal = body.invoiceDate ? esc(body.invoiceDate) : "NOW()::DATE";
    let result;
    if (existing) {
      [result] = await safeExec(`UPDATE three_way_match_results SET match_status = ${esc(matchResult.matchStatus)}, invoice_amount = ${escNum(body.invoiceAmount)}, exception_reason = ${exceptionText}, line_items = ${esc(JSON.stringify(matchResult.lineItems))}, auto_approved = ${matchResult.autoApproved}, updated_at = NOW() WHERE id = ${existing.id} RETURNING *`);
    } else {
      [result] = await safeExec(`INSERT INTO three_way_match_results (po_id, invoice_number, invoice_date, po_amount, grn_amount, invoice_amount, match_status, exception_reason, auto_approved, line_items) VALUES (${body.poId}, ${esc(body.invoiceNumber)}, ${invoiceDateVal}, ${escNum(matchResult.poAmount)}, ${escNum(matchResult.grnAmount)}, ${escNum(body.invoiceAmount)}, ${esc(matchResult.matchStatus)}, ${exceptionText}, ${matchResult.autoApproved}, ${esc(JSON.stringify(matchResult.lineItems))}) RETURNING *`);
    }

    await db.update(purchaseOrdersTable).set({
      invoiceReceived: true,
      invoiceNumber: body.invoiceNumber,
      invoiceDate: body.invoiceDate || new Date().toISOString().slice(0, 10),
      invoiceAmount: String(body.invoiceAmount),
      threeWayMatch: matchResult.autoApproved,
      updatedAt: new Date(),
    }).where(eq(purchaseOrdersTable.id, body.poId));

    res.json({
      triggered_automatically: true,
      match_status: matchResult.matchStatus,
      auto_approved: matchResult.autoApproved,
      exception_reason: matchResult.exceptionReason,
      line_items: matchResult.lineItems,
      result,
    });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

router.get("/three-way-matching/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const [result] = await safeExec(`
      SELECT twm.*, po.order_number, po.currency, s.supplier_name
      FROM three_way_match_results twm
      JOIN purchase_orders po ON po.id = twm.po_id
      LEFT JOIN suppliers s ON s.id = po.supplier_id
      WHERE twm.id = ${id}
    `);
    if (!result) return res.status(404).json({ message: "Not found" });
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

router.post("/three-way-matching/:id/resolve", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const body = z.object({
      resolutionAction: z.enum(["approve", "adjust", "reject"]),
      resolutionNotes: z.string().optional(),
    }).parse(req.body);

    const principalId = (req as any).userId || "";
    const [actorUser] = principalId ? await safeExec(`SELECT full_name_he, username FROM users WHERE id = ${escInt(Number(principalId))} LIMIT 1`) : [];
    const resolvedBy = actorUser?.full_name_he || actorUser?.username || principalId || "מערכת";

    const newStatus = body.resolutionAction === "approve" ? "resolved_approved"
      : body.resolutionAction === "adjust" ? "resolved_adjusted"
      : "resolved_rejected";

    const [result] = await safeExec(`
      UPDATE three_way_match_results SET
        match_status = ${esc(newStatus)},
        resolved_by = ${esc(resolvedBy)},
        resolved_at = NOW(),
        resolution_action = ${esc(body.resolutionAction)},
        resolution_notes = ${esc(body.resolutionNotes)},
        updated_at = NOW()
      WHERE id = ${id} RETURNING *
    `);
    if (!result) return res.status(404).json({ message: "Not found" });

    if (body.resolutionAction === "approve" || body.resolutionAction === "adjust") {
      await db.update(purchaseOrdersTable).set({
        threeWayMatch: true,
        updatedAt: new Date(),
      }).where(eq(purchaseOrdersTable.id, result.po_id));
    }

    res.json(result);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

export default router;
