import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { suppliersTable, purchaseOrdersTable, purchaseOrderItemsTable } from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";
import { z } from "zod/v4";
import { sql } from "drizzle-orm";
import { createNotificationForRole } from "../lib/notification-service";

const router: IRouter = Router();

async function safeExec(query: string): Promise<any[]> {
  try {
    const result = await db.execute(sql.raw(query));
    return result.rows || [];
  } catch (err: any) {
    console.error(`[rfq] query error: ${err.message}`);
    return [];
  }
}

function esc(val: string | null | undefined): string {
  if (val === null || val === undefined) return "NULL";
  return `'${String(val).replace(/'/g, "''").replace(/\\/g, "\\\\")}'`;
}
function escNum(val: number | string | null | undefined): string {
  const n = Number(val);
  if (isNaN(n) || !isFinite(n)) return "0";
  return String(n);
}
function escDate(val: string | null | undefined): string {
  if (!val) return "NULL";
  const d = String(val).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return "NULL";
  return `'${d}'`;
}
function escInt(val: number | null | undefined): string {
  if (val === null || val === undefined) return "NULL";
  const n = Math.floor(Number(val));
  if (isNaN(n)) return "NULL";
  return String(n);
}

async function ensureRfqTables() {
  await safeExec(`CREATE TABLE IF NOT EXISTS rfqs (id SERIAL PRIMARY KEY, rfq_number VARCHAR(50) UNIQUE NOT NULL, title TEXT NOT NULL, category VARCHAR(100), requester VARCHAR(200), status VARCHAR(50) DEFAULT 'draft', deadline DATE, estimated_value NUMERIC(15,2) DEFAULT 0, currency VARCHAR(10) DEFAULT 'ILS', technical_spec TEXT, delivery_terms TEXT, scoring_weights JSONB DEFAULT '{"price":40,"quality":25,"delivery":20,"terms":15}', notes TEXT, created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW())`);
  await safeExec(`CREATE TABLE IF NOT EXISTS rfq_items (id SERIAL PRIMARY KEY, rfq_id INTEGER NOT NULL, item_description TEXT NOT NULL, quantity NUMERIC(15,3) DEFAULT 1, unit VARCHAR(30) DEFAULT 'unit', estimated_price NUMERIC(15,2), notes TEXT, created_at TIMESTAMP DEFAULT NOW())`);
  await safeExec(`CREATE TABLE IF NOT EXISTS rfq_suppliers (id SERIAL PRIMARY KEY, rfq_id INTEGER NOT NULL, supplier_id INTEGER, supplier_name VARCHAR(255) NOT NULL, supplier_email VARCHAR(255), invited_at TIMESTAMP DEFAULT NOW(), notification_sent BOOLEAN DEFAULT FALSE)`);
  await safeExec(`CREATE UNIQUE INDEX IF NOT EXISTS uq_rfq_suppliers_rfq_supplier ON rfq_suppliers (rfq_id, supplier_id) WHERE supplier_id IS NOT NULL`);
  await safeExec(`CREATE TABLE IF NOT EXISTS rfq_responses (id SERIAL PRIMARY KEY, rfq_id INTEGER NOT NULL, supplier_id INTEGER, supplier_name VARCHAR(255) NOT NULL, status VARCHAR(50) DEFAULT 'submitted', total_price NUMERIC(15,2), currency VARCHAR(10) DEFAULT 'ILS', delivery_days INTEGER, payment_terms VARCHAR(200), validity_days INTEGER, notes TEXT, quality_score NUMERIC(5,2) DEFAULT NULL, score_total NUMERIC(5,2), score_price NUMERIC(5,2), score_quality NUMERIC(5,2), score_delivery NUMERIC(5,2), score_terms NUMERIC(5,2), is_winner BOOLEAN DEFAULT FALSE, submitted_at TIMESTAMP DEFAULT NOW(), created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW())`);
  await safeExec(`ALTER TABLE rfq_responses ADD COLUMN IF NOT EXISTS quality_score NUMERIC(5,2) DEFAULT NULL`);
  await safeExec(`ALTER TABLE rfq_responses ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW()`);
  await safeExec(`CREATE TABLE IF NOT EXISTS rfq_response_items (id SERIAL PRIMARY KEY, response_id INTEGER NOT NULL, rfq_item_id INTEGER, item_description TEXT NOT NULL, quantity NUMERIC(15,3) DEFAULT 1, unit VARCHAR(30), unit_price NUMERIC(15,2) NOT NULL, total_price NUMERIC(15,2), notes TEXT)`);
}

ensureRfqTables().catch(console.error);

const PAYMENT_TERM_SCORE: Record<string, number> = {
  "שוטף": 100,
  "שוטף+30": 90,
  "שוטף+45": 80,
  "שוטף+60": 70,
  "שוטף+90": 55,
  "מזומן": 60,
  "מקדמה": 40,
  "אשראי 30": 85,
  "אשראי 60": 70,
  "אשראי 90": 55,
};

function paymentTermsScore(terms: string | null | undefined): number {
  if (!terms) return 60;
  const key = Object.keys(PAYMENT_TERM_SCORE).find(k => terms.includes(k));
  return key ? PAYMENT_TERM_SCORE[key] : 60;
}

function computeScores(responses: any[], weights: any) {
  if (!responses || responses.length === 0) return responses;
  const w = { price: 40, quality: 25, delivery: 20, terms: 15, ...weights };

  const prices = responses.map(r => Number(r.total_price || 0)).filter(p => p > 0);
  const minPrice = prices.length > 0 ? Math.min(...prices) : 0;
  const maxPrice = prices.length > 0 ? Math.max(...prices) : 0;

  const deliveries = responses.map(r => Number(r.delivery_days || 0)).filter(d => d > 0);
  const minDel = deliveries.length > 0 ? Math.min(...deliveries) : 0;
  const maxDel = deliveries.length > 0 ? Math.max(...deliveries) : 0;

  const rawQualities = responses.map(r => Number(r.quality_score || r.supplier_rating || 0));
  const minQ = Math.min(...rawQualities);
  const maxQ = Math.max(...rawQualities);

  const validities = responses.map(r => Number(r.validity_days || 0)).filter(v => v > 0);
  const maxValidity = validities.length > 0 ? Math.max(...validities) : 0;

  return responses.map(r => {
    const price = Number(r.total_price || 0);
    const delivery = Number(r.delivery_days || 0);
    const rawQuality = Number(r.quality_score || r.supplier_rating || 0);
    const validity = Number(r.validity_days || 0);

    const priceScore = maxPrice > 0 && minPrice !== maxPrice
      ? 100 - ((price - minPrice) / (maxPrice - minPrice)) * 100
      : (price > 0 ? 100 : 50);

    let qualityScore: number;
    if (maxQ > 0 && maxQ !== minQ) {
      qualityScore = 50 + ((rawQuality - minQ) / (maxQ - minQ)) * 50;
    } else if (rawQuality > 0) {
      qualityScore = rawQuality <= 5 ? rawQuality * 20 : Math.min(rawQuality, 100);
    } else {
      qualityScore = 70;
    }

    const deliveryScore = maxDel > 0 && minDel !== maxDel && delivery > 0
      ? 100 - ((delivery - minDel) / (maxDel - minDel)) * 100
      : (delivery > 0 ? 75 : 50);

    const baseTermsScore = paymentTermsScore(r.payment_terms);
    const validityBonus = maxValidity > 0 && validity > 0 ? (validity / maxValidity) * 10 : 0;
    const termsScore = Math.min(100, baseTermsScore + validityBonus);

    const totalScore = (priceScore * w.price + qualityScore * w.quality + deliveryScore * w.delivery + termsScore * w.terms) / 100;

    return {
      ...r,
      score_price: Math.round(priceScore * 10) / 10,
      score_quality: Math.round(qualityScore * 10) / 10,
      score_delivery: Math.round(deliveryScore * 10) / 10,
      score_terms: Math.round(termsScore * 10) / 10,
      score_total: Math.round(totalScore * 10) / 10,
    };
  });
}

router.get("/rfqs", async (req, res) => {
  try {
    const rfqs = await safeExec(`
      SELECT r.*, 
        COUNT(DISTINCT rs.id) AS suppliers_invited,
        COUNT(DISTINCT rr.id) AS quotes_received
      FROM rfqs r
      LEFT JOIN rfq_suppliers rs ON rs.rfq_id = r.id
      LEFT JOIN rfq_responses rr ON rr.rfq_id = r.id
      GROUP BY r.id
      ORDER BY r.created_at DESC
    `);
    res.json(rfqs);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

router.get("/rfqs/stats", async (_req, res) => {
  try {
    const stats = await safeExec(`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE status IN ('טיוטה','נשלח')) AS open,
        COUNT(*) FILTER (WHERE status = 'נבחר') AS selected,
        AVG(CASE WHEN estimated_value > 0 THEN estimated_value ELSE NULL END) AS avg_value
      FROM rfqs
    `);
    res.json(stats[0] || { total: 0, open: 0, selected: 0, avg_value: 0 });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

router.get("/rfqs/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const [rfq] = await safeExec(`SELECT * FROM rfqs WHERE id = ${id}`);
    if (!rfq) return res.status(404).json({ message: "Not found" });
    const items = await safeExec(`SELECT * FROM rfq_items WHERE rfq_id = ${id} ORDER BY id`);
    const suppliersInvited = await safeExec(`SELECT * FROM rfq_suppliers WHERE rfq_id = ${id} ORDER BY id`);
    const responses = await safeExec(`SELECT * FROM rfq_responses WHERE rfq_id = ${id} ORDER BY id`);
    const weights = rfq.scoring_weights || { price: 40, quality: 25, delivery: 20, terms: 15 };
    const scoredResponses = computeScores(responses, weights);
    res.json({ ...rfq, items, suppliersInvited, responses: scoredResponses });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

router.post("/rfqs", async (req, res) => {
  try {
    const body = z.object({
      rfqNumber: z.string().min(1).optional(),
      title: z.string().min(1),
      category: z.string().optional(),
      requester: z.string().optional(),
      status: z.string().optional(),
      deadline: z.string().optional(),
      estimatedValue: z.union([z.string(), z.number()]).optional(),
      currency: z.string().optional(),
      technicalSpec: z.string().optional(),
      deliveryTerms: z.string().optional(),
      scoringWeights: z.record(z.number()).optional(),
      notes: z.string().optional(),
    }).parse(req.body);

    const rfqNumber = body.rfqNumber || `RFQ-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 9000) + 1000)}`;
    const [rfq] = await safeExec(`
      INSERT INTO rfqs (rfq_number, title, category, requester, status, deadline, estimated_value, currency, technical_spec, delivery_terms, scoring_weights, notes)
      VALUES (
        ${esc(rfqNumber)},
        ${esc(body.title)},
        ${esc(body.category)},
        ${esc(body.requester)},
        ${esc(body.status || 'טיוטה')},
        ${escDate(body.deadline)},
        ${escNum(body.estimatedValue)},
        ${esc(body.currency || 'ILS')},
        ${esc(body.technicalSpec)},
        ${esc(body.deliveryTerms)},
        ${esc(JSON.stringify(body.scoringWeights || { price: 40, quality: 25, delivery: 20, terms: 15 }))}::jsonb,
        ${esc(body.notes)}
      ) RETURNING *
    `);
    res.status(201).json(rfq);
  } catch (error: any) {
    if (error.message?.includes("duplicate") || error.message?.includes("unique")) {
      return res.status(409).json({ message: "מספר RFQ כבר קיים" });
    }
    res.status(400).json({ message: error.message });
  }
});

router.put("/rfqs/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const body = z.object({
      title: z.string().optional(),
      category: z.string().optional(),
      requester: z.string().optional(),
      status: z.string().optional(),
      deadline: z.string().optional(),
      estimatedValue: z.union([z.string(), z.number()]).optional(),
      currency: z.string().optional(),
      technicalSpec: z.string().optional(),
      deliveryTerms: z.string().optional(),
      scoringWeights: z.record(z.number()).optional(),
      notes: z.string().optional(),
    }).parse(req.body);

    const sets: string[] = ["updated_at = NOW()"];
    if (body.title !== undefined) sets.push(`title = ${esc(body.title)}`);
    if (body.category !== undefined) sets.push(`category = ${esc(body.category)}`);
    if (body.requester !== undefined) sets.push(`requester = ${esc(body.requester)}`);
    if (body.status !== undefined) sets.push(`status = ${esc(body.status)}`);
    if (body.deadline !== undefined) sets.push(`deadline = ${escDate(body.deadline)}`);
    if (body.estimatedValue !== undefined) sets.push(`estimated_value = ${escNum(body.estimatedValue)}`);
    if (body.currency !== undefined) sets.push(`currency = ${esc(body.currency)}`);
    if (body.technicalSpec !== undefined) sets.push(`technical_spec = ${esc(body.technicalSpec)}`);
    if (body.deliveryTerms !== undefined) sets.push(`delivery_terms = ${esc(body.deliveryTerms)}`);
    if (body.scoringWeights !== undefined) sets.push(`scoring_weights = ${esc(JSON.stringify(body.scoringWeights))}::jsonb`);
    if (body.notes !== undefined) sets.push(`notes = ${esc(body.notes)}`);

    const [rfq] = await safeExec(`UPDATE rfqs SET ${sets.join(", ")} WHERE id = ${id} RETURNING *`);
    if (!rfq) return res.status(404).json({ message: "Not found" });
    res.json(rfq);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

router.delete("/rfqs/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    await safeExec(`DELETE FROM rfqs WHERE id = ${id}`);
    res.json({ message: "Deleted" });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

router.post("/rfqs/:id/items", async (req, res) => {
  try {
    const rfqId = z.coerce.number().int().positive().parse(req.params.id);
    const body = z.object({
      itemDescription: z.string().min(1),
      quantity: z.union([z.string(), z.number()]).optional(),
      unit: z.string().optional(),
      estimatedPrice: z.union([z.string(), z.number()]).optional(),
      notes: z.string().optional(),
    }).parse(req.body);
    const [item] = await safeExec(`INSERT INTO rfq_items (rfq_id, item_description, quantity, unit, estimated_price, notes) VALUES (${rfqId}, ${esc(body.itemDescription)}, ${escNum(body.quantity || 1)}, ${esc(body.unit || 'יחידה')}, ${escNum(body.estimatedPrice)}, ${esc(body.notes)}) RETURNING *`);
    if (!item) return res.status(500).json({ message: "Failed to create item" });
    res.status(201).json(item);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

router.post("/rfqs/:id/send", async (req, res) => {
  try {
    const rfqId = z.coerce.number().int().positive().parse(req.params.id);
    const body = z.object({
      supplierIds: z.array(z.number()).optional(),
      supplierNames: z.array(z.string()).optional(),
    }).parse(req.body);

    const supplierIds = body.supplierIds || [];
    const suppliers = supplierIds.length > 0
      ? await db.select().from(suppliersTable).where(eq(suppliersTable.id, supplierIds[0]))
      : [];

    for (const sid of supplierIds) {
      const sup = await db.select().from(suppliersTable).where(eq(suppliersTable.id, sid));
      if (sup.length > 0) {
        const existing = await safeExec(`SELECT id FROM rfq_suppliers WHERE rfq_id = ${rfqId} AND supplier_id = ${sid} LIMIT 1`);
        if (existing.length > 0) {
          await safeExec(`UPDATE rfq_suppliers SET notification_sent = TRUE WHERE rfq_id = ${rfqId} AND supplier_id = ${sid}`);
        } else {
          const inserted = await safeExec(`INSERT INTO rfq_suppliers (rfq_id, supplier_id, supplier_name, notification_sent) VALUES (${rfqId}, ${sid}, ${esc(sup[0].supplierName)}, TRUE) RETURNING id`);
          if (!inserted.length) throw new Error(`Failed to insert supplier ${sid} for rfq ${rfqId}`);
        }
      }
    }

    for (const name of (body.supplierNames || [])) {
      const existing = await safeExec(`SELECT id FROM rfq_suppliers WHERE rfq_id = ${rfqId} AND supplier_name = ${esc(name)} AND supplier_id IS NULL LIMIT 1`);
      if (!existing.length) {
        const inserted = await safeExec(`INSERT INTO rfq_suppliers (rfq_id, supplier_name, notification_sent) VALUES (${rfqId}, ${esc(name)}, TRUE) RETURNING id`);
        if (!inserted.length) throw new Error(`Failed to insert named supplier '${name}' for rfq ${rfqId}`);
      } else {
        await safeExec(`UPDATE rfq_suppliers SET notification_sent = TRUE WHERE rfq_id = ${rfqId} AND supplier_name = ${esc(name)} AND supplier_id IS NULL`);
      }
    }

    await safeExec(`UPDATE rfqs SET status = 'נשלח', updated_at = NOW() WHERE id = ${rfqId}`);

    const [sentRfq] = await safeExec(`SELECT * FROM rfqs WHERE id = ${rfqId}`);
    createNotificationForRole("procurement", {
      type: "rfq_sent",
      title: "בקשת הצעת מחיר נשלחה לספקים",
      message: `RFQ מספר ${rfqId}${sentRfq?.title ? ` - ${sentRfq.title}` : ""} נשלח ל-${supplierIds.length + (body.supplierNames?.length || 0)} ספקים`,
      priority: "normal",
      category: "workflow",
      actionUrl: `/procurement/rfq-management`,
      recordId: rfqId,
      dedupeKey: `rfq_sent_${rfqId}`,
    }).catch((err: Error) => console.error("[RFQ] send notification error:", err.message));

    res.json({ message: "RFQ sent to suppliers", count: supplierIds.length + (body.supplierNames?.length || 0) });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

router.post("/rfqs/:id/responses", async (req, res) => {
  try {
    const rfqId = z.coerce.number().int().positive().parse(req.params.id);
    const body = z.object({
      supplierId: z.number().optional(),
      supplierName: z.string().min(1),
      totalPrice: z.union([z.string(), z.number()]).optional(),
      currency: z.string().optional(),
      deliveryDays: z.number().optional(),
      paymentTerms: z.string().optional(),
      validityDays: z.number().optional(),
      notes: z.string().optional(),
      items: z.array(z.object({
        rfqItemId: z.number().optional(),
        itemDescription: z.string(),
        quantity: z.union([z.string(), z.number()]).optional(),
        unit: z.string().optional(),
        unitPrice: z.union([z.string(), z.number()]),
        totalPrice: z.union([z.string(), z.number()]).optional(),
        notes: z.string().optional(),
      })).optional(),
    }).parse(req.body);

    const [response] = await safeExec(`
      INSERT INTO rfq_responses (rfq_id, supplier_id, supplier_name, total_price, currency, delivery_days, payment_terms, validity_days, notes)
      VALUES (${rfqId}, ${escInt(body.supplierId)}, ${esc(body.supplierName)}, ${escNum(body.totalPrice)}, ${esc(body.currency || 'ILS')}, ${escInt(body.deliveryDays)}, ${esc(body.paymentTerms)}, ${escInt(body.validityDays)}, ${esc(body.notes)})
      RETURNING *
    `);

    if (body.items && response) {
      for (const item of body.items) {
        await safeExec(`
          INSERT INTO rfq_response_items (response_id, rfq_item_id, item_description, quantity, unit, unit_price, total_price, notes)
          VALUES (${response.id}, ${escInt(item.rfqItemId)}, ${esc(item.itemDescription)}, ${escNum(item.quantity || 1)}, ${esc(item.unit || 'יחידה')}, ${escNum(item.unitPrice)}, ${escNum(item.totalPrice)}, ${esc(item.notes)})
        `);
      }
    }

    await safeExec(`UPDATE rfqs SET status = 'התקבלו הצעות', updated_at = NOW() WHERE id = ${rfqId} AND status IN ('נשלח','טיוטה')`);

    res.status(201).json(response);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

router.put("/rfqs/:rfqId/items/:itemId", async (req, res) => {
  try {
    const rfqId = z.coerce.number().int().positive().parse(req.params.rfqId);
    const itemId = z.coerce.number().int().positive().parse(req.params.itemId);
    const body = z.object({
      itemDescription: z.string().optional(),
      quantity: z.union([z.string(), z.number()]).optional(),
      unit: z.string().optional(),
      estimatedPrice: z.union([z.string(), z.number()]).optional(),
      notes: z.string().optional(),
    }).parse(req.body);
    const [item] = await safeExec(`SELECT id FROM rfq_items WHERE id = ${itemId} AND rfq_id = ${rfqId}`);
    if (!item) return res.status(404).json({ message: "פריט לא נמצא" });
    const sets: string[] = [];
    if (body.itemDescription) sets.push(`item_description = ${esc(body.itemDescription)}`);
    if (body.quantity !== undefined) sets.push(`quantity = ${escNum(body.quantity)}`);
    if (body.unit) sets.push(`unit = ${esc(body.unit)}`);
    if (body.estimatedPrice !== undefined) sets.push(`estimated_price = ${escNum(body.estimatedPrice)}`);
    if (body.notes !== undefined) sets.push(`notes = ${esc(body.notes)}`);
    if (sets.length === 0) return res.status(400).json({ message: "אין שדות לעדכון" });
    const [updated] = await safeExec(`UPDATE rfq_items SET ${sets.join(", ")} WHERE id = ${itemId} RETURNING *`);
    res.json(updated);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

router.delete("/rfqs/:rfqId/items/:itemId", async (req, res) => {
  try {
    const rfqId = z.coerce.number().int().positive().parse(req.params.rfqId);
    const itemId = z.coerce.number().int().positive().parse(req.params.itemId);
    const [item] = await safeExec(`SELECT id FROM rfq_items WHERE id = ${itemId} AND rfq_id = ${rfqId}`);
    if (!item) return res.status(404).json({ message: "פריט לא נמצא" });
    await safeExec(`DELETE FROM rfq_items WHERE id = ${itemId}`);
    res.json({ message: "נמחק בהצלחה" });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

router.put("/rfqs/:rfqId/responses/:responseId", async (req, res) => {
  try {
    const rfqId = z.coerce.number().int().positive().parse(req.params.rfqId);
    const responseId = z.coerce.number().int().positive().parse(req.params.responseId);
    const body = z.object({
      totalPrice: z.union([z.string(), z.number()]).optional(),
      currency: z.string().optional(),
      deliveryDays: z.number().optional(),
      paymentTerms: z.string().optional(),
      validityDays: z.number().optional(),
      notes: z.string().optional(),
      qualityScore: z.number().min(0).max(100).optional(),
    }).parse(req.body);
    const [resp] = await safeExec(`SELECT id FROM rfq_responses WHERE id = ${responseId} AND rfq_id = ${rfqId}`);
    if (!resp) return res.status(404).json({ message: "הצעה לא נמצאה" });
    const sets: string[] = ["updated_at = NOW()"];
    if (body.totalPrice !== undefined) sets.push(`total_price = ${escNum(body.totalPrice)}`);
    if (body.currency) sets.push(`currency = ${esc(body.currency)}`);
    if (body.deliveryDays !== undefined) sets.push(`delivery_days = ${body.deliveryDays}`);
    if (body.paymentTerms !== undefined) sets.push(`payment_terms = ${esc(body.paymentTerms)}`);
    if (body.validityDays !== undefined) sets.push(`validity_days = ${body.validityDays}`);
    if (body.notes !== undefined) sets.push(`notes = ${esc(body.notes)}`);
    if (body.qualityScore !== undefined) sets.push(`quality_score = ${body.qualityScore}`);
    const [updated] = await safeExec(`UPDATE rfq_responses SET ${sets.join(", ")} WHERE id = ${responseId} RETURNING *`);
    res.json(updated);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

router.delete("/rfqs/:rfqId/responses/:responseId", async (req, res) => {
  try {
    const rfqId = z.coerce.number().int().positive().parse(req.params.rfqId);
    const responseId = z.coerce.number().int().positive().parse(req.params.responseId);
    const [resp] = await safeExec(`SELECT id FROM rfq_responses WHERE id = ${responseId} AND rfq_id = ${rfqId}`);
    if (!resp) return res.status(404).json({ message: "הצעה לא נמצאה" });
    await safeExec(`DELETE FROM rfq_response_items WHERE response_id = ${responseId}`);
    await safeExec(`DELETE FROM rfq_responses WHERE id = ${responseId}`);
    res.json({ message: "נמחק בהצלחה" });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

router.get("/rfqs/:id/responses", async (req, res) => {
  try {
    const rfqId = z.coerce.number().int().positive().parse(req.params.id);
    const [rfq] = await safeExec(`SELECT scoring_weights FROM rfqs WHERE id = ${rfqId}`);
    const responses = await safeExec(`SELECT * FROM rfq_responses WHERE rfq_id = ${rfqId} ORDER BY id`);
    const weights = rfq?.scoring_weights || { price: 40, quality: 25, delivery: 20, terms: 15 };
    const scored = computeScores(responses, weights);
    res.json(scored);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

router.post("/rfqs/:id/select-winner", async (req, res) => {
  try {
    const rfqId = z.coerce.number().int().positive().parse(req.params.id);
    const body = z.object({
      responseId: z.number(),
      convertToPO: z.boolean().optional(),
    }).parse(req.body);

    const [validateResp] = await safeExec(`SELECT id FROM rfq_responses WHERE id = ${body.responseId} AND rfq_id = ${rfqId}`);
    if (!validateResp) return res.status(400).json({ message: "הצעת הספק לא שייכת ל-RFQ זה" });

    await safeExec(`UPDATE rfq_responses SET is_winner = FALSE WHERE rfq_id = ${rfqId}`);
    await safeExec(`UPDATE rfq_responses SET is_winner = TRUE WHERE id = ${body.responseId} AND rfq_id = ${rfqId}`);
    await safeExec(`UPDATE rfqs SET status = 'נבחר', updated_at = NOW() WHERE id = ${rfqId}`);

    const [winner] = await safeExec(`SELECT * FROM rfq_responses WHERE id = ${body.responseId}`);
    const [rfq] = await safeExec(`SELECT * FROM rfqs WHERE id = ${rfqId}`);

    let createdPo: any = null;
    if (body.convertToPO && winner) {
      let supplierId = Number(winner.supplier_id || 0);
      if (!supplierId && winner.supplier_name) {
        const existingSup = await db.select({ id: suppliersTable.id })
          .from(suppliersTable)
          .where(eq(suppliersTable.supplierName, winner.supplier_name))
          .limit(1);
        if (existingSup.length > 0) {
          supplierId = existingSup[0].id;
        } else {
          const [newSup] = await db.insert(suppliersTable).values({
            supplierName: winner.supplier_name,
            supplierNumber: `SUP-RFQ-${Date.now()}`,
            status: "active",
          }).returning({ id: suppliersTable.id });
          supplierId = newSup.id;
        }
      }
      const poNumber = `PO-RFQ-${rfqId}-${Date.now().toString(36).toUpperCase()}`;
      const [newPo] = await db.insert(purchaseOrdersTable).values({
        orderNumber: poNumber,
        supplierId,
        status: "draft",
        totalAmount: String(winner.total_price || 0),
        currency: winner.currency || "ILS",
        paymentTerms: winner.payment_terms || "",
        notes: `נוצר מ-RFQ #${rfqId}: ${rfq?.title || ""}`,
        createdBy: "מערכת RFQ",
        referenceNumber: rfq?.rfq_number || "",
        deliveryTerms: rfq?.delivery_terms || "",
      }).returning();

      if (newPo) {
        const winnerItems = await safeExec(`SELECT * FROM rfq_response_items WHERE response_id = ${body.responseId} ORDER BY id`);
        if (winnerItems.length > 0) {
          for (const wItem of winnerItems) {
            const qty = parseFloat(wItem.quantity || "1");
            const unitPrice = parseFloat(wItem.unit_price || "0");
            const total = parseFloat(wItem.total_price || String(qty * unitPrice));
            await db.insert(purchaseOrderItemsTable).values({
              orderId: newPo.id,
              itemDescription: wItem.item_description,
              quantity: String(qty),
              unit: wItem.unit || "יחידה",
              unitPrice: String(unitPrice),
              totalPrice: String(total),
              notes: wItem.notes || "",
            });
          }
        } else {
          const rfqItemsList = await safeExec(`SELECT * FROM rfq_items WHERE rfq_id = ${rfqId} ORDER BY id`);
          for (const rfqItem of rfqItemsList) {
            const qty = parseFloat(rfqItem.quantity || "1");
            const unitPrice = parseFloat(rfqItem.estimated_price || "0");
            await db.insert(purchaseOrderItemsTable).values({
              orderId: newPo.id,
              itemDescription: rfqItem.item_description,
              quantity: String(qty),
              unit: rfqItem.unit || "יחידה",
              unitPrice: String(unitPrice),
              totalPrice: String(qty * unitPrice),
              notes: rfqItem.notes || "",
            });
          }
        }
      }
      createdPo = newPo;
    }

    res.json({ message: "Winner selected", winner, rfq, createdPo });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

router.get("/rfqs/:id/best-combination", async (req, res) => {
  try {
    const rfqId = z.coerce.number().int().positive().parse(req.params.id);
    const weightsQ = req.query;
    const weights = {
      price: Number(weightsQ.price || 40),
      quality: Number(weightsQ.quality || 25),
      delivery: Number(weightsQ.delivery || 20),
      terms: Number(weightsQ.terms || 15),
    };

    const [rfq] = await safeExec(`SELECT * FROM rfqs WHERE id = ${rfqId}`);
    if (!rfq) return res.status(404).json({ message: "RFQ לא נמצא" });

    const items = await safeExec(`SELECT * FROM rfq_items WHERE rfq_id = ${rfqId} ORDER BY id`);
    const responses = await safeExec(`SELECT * FROM rfq_responses WHERE rfq_id = ${rfqId}`);
    const scored = computeScores(responses, weights);

    const combination: any[] = [];

    for (const item of items) {
      const candidateLines: any[] = [];
      for (const resp of responses) {
        const respLines = await safeExec(`SELECT * FROM rfq_response_items WHERE response_id = ${resp.id} AND (rfq_item_id = ${item.id} OR LOWER(item_description) = LOWER(${esc(item.itemDescription || item.item_description || "")}))`);
        if (respLines.length > 0) {
          const line = respLines[0];
          const respScore = scored.find((s: any) => s.id === resp.id);
          const lineUnitPrice = Number(line.unit_price || 0);
          candidateLines.push({
            responseId: resp.id,
            supplierName: resp.supplier_name,
            supplierId: resp.supplier_id,
            rfqItemId: item.id,
            description: item.item_description || item.itemDescription,
            quantity: Number(item.quantity || line.quantity || 0),
            unitPrice: lineUnitPrice,
            totalPrice: Number(line.total_price || 0) || (lineUnitPrice * Number(item.quantity || 1)),
            deliveryDays: Number(resp.delivery_days || 0),
            paymentTerms: resp.payment_terms,
            scorePrice: respScore?.score_price ?? 0,
            scoreQuality: respScore?.score_quality ?? 0,
            scoreDelivery: respScore?.score_delivery ?? 0,
            scoreTerms: respScore?.score_terms ?? 0,
            scoreTotal: respScore?.score_total ?? 0,
          });
        }
      }

      if (candidateLines.length > 0) {
        candidateLines.sort((a, b) => {
          const priceNorm = candidateLines.map(c => c.unitPrice);
          const minP = Math.min(...priceNorm);
          const maxP = Math.max(...priceNorm);
          const priceScoreA = maxP > minP ? 100 - ((a.unitPrice - minP) / (maxP - minP)) * 100 : 100;
          const priceScoreB = maxP > minP ? 100 - ((b.unitPrice - minP) / (maxP - minP)) * 100 : 100;
          const totalA = (priceScoreA * weights.price + a.scoreQuality * weights.quality + a.scoreDelivery * weights.delivery + a.scoreTerms * weights.terms) / 100;
          const totalB = (priceScoreB * weights.price + b.scoreQuality * weights.quality + b.scoreDelivery * weights.delivery + b.scoreTerms * weights.terms) / 100;
          return totalB - totalA;
        });
        combination.push({ item, bestLine: candidateLines[0], allCandidates: candidateLines });
      } else {
        combination.push({ item, bestLine: null, allCandidates: [] });
      }
    }

    const totalCost = combination.reduce((sum, c) => sum + (c.bestLine?.totalPrice || 0), 0);
    const uniqueSuppliers = [...new Set(combination.filter(c => c.bestLine).map(c => c.bestLine.supplierName))];

    res.json({ rfqId, weights, combination, totalCost, uniqueSuppliers, suppliersCount: uniqueSuppliers.length });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

export default router;
