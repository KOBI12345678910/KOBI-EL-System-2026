import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { eq, desc, and, ilike, sql } from "drizzle-orm";

const router: IRouter = Router();
const logger = console;

router.post("/rfq", async (req: Request, res: Response) => {
  try {
    const { title, description, department, dueDate, budget, location } = req.body;
    
    const rfqNumber = `RFQ-${Date.now()}`;
    
    const result = await db.execute(
      sql`INSERT INTO rfq (rfq_number, title, description, department, created_by, due_date, budget, location, status)
        VALUES (${rfqNumber}, ${title}, ${description}, ${department}, ${req.user?.email || 'system'}, ${dueDate}, ${budget}, ${location}, 'draft')
        RETURNING id, rfq_number`
    );
    
    res.json({ success: true, rfq: result.rows[0] });
  } catch (error: any) {
    logger.error("[RFQ] Create failed:", error.message);
    res.status(400).json({ error: error.message });
  }
});

router.get("/rfq", async (req: Request, res: Response) => {
  try {
    const { status, search, limit = 50, offset = 0 } = req.query;
    
    let query = "SELECT id, rfq_number, title, status, due_date, budget, created_at FROM rfq WHERE 1=1";
    const params: any[] = [];
    
    if (status) {
      query += ` AND status = $${params.length + 1}`;
      params.push(status);
    }
    
    if (search) {
      query += ` AND (title ILIKE $${params.length + 1} OR rfq_number ILIKE $${params.length + 1})`;
      params.push(`%${search}%`);
      params.push(`%${search}%`);
    }
    
    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit);
    params.push(offset);
    
    const result = await db.execute(sql.raw(query, params));
    res.json({ rfqs: result.rows });
  } catch (error: any) {
    logger.error("[RFQ] List failed:", error.message);
    res.status(400).json({ error: error.message });
  }
});

router.get("/rfq/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const rfqResult = await db.execute(sql`SELECT * FROM rfq WHERE id = ${parseInt(id)}`);
    if (rfqResult.rows.length === 0) {
      return res.status(404).json({ error: "RFQ not found" });
    }
    
    const itemsResult = await db.execute(sql`SELECT * FROM rfq_items WHERE rfq_id = ${parseInt(id)} ORDER BY item_number`);
    
    res.json({ rfq: rfqResult.rows[0], items: itemsResult.rows });
  } catch (error: any) {
    logger.error("[RFQ] Get failed:", error.message);
    res.status(400).json({ error: error.message });
  }
});

router.post("/rfq/:id/items", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { description, quantity, unit, estimatedPrice, specifications, deliveryDate } = req.body;
    
    const result = await db.execute(
      sql`INSERT INTO rfq_items (rfq_id, description, quantity, unit, estimated_price, specifications, delivery_date)
        VALUES (${parseInt(id)}, ${description}, ${quantity}, ${unit}, ${estimatedPrice}, ${JSON.stringify(specifications)}, ${deliveryDate})
        RETURNING id`
    );
    
    res.json({ success: true, itemId: result.rows[0].id });
  } catch (error: any) {
    logger.error("[RFQ] Add item failed:", error.message);
    res.status(400).json({ error: error.message });
  }
});

router.post("/rfq/:id/send", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { supplierEmails } = req.body;
    
    await db.execute(sql`UPDATE rfq SET status = 'sent', issue_date = NOW() WHERE id = ${parseInt(id)}`);
    
    res.json({ success: true, message: "RFQ sent to suppliers", suppliersCount: supplierEmails?.length || 0 });
  } catch (error: any) {
    logger.error("[RFQ] Send failed:", error.message);
    res.status(400).json({ error: error.message });
  }
});

router.post("/rfq/:rfqId/responses", async (req: Request, res: Response) => {
  try {
    const { rfqId } = req.params;
    const { supplierId, supplierName, supplierEmail, quotedPrice, leadTime, paymentTerms, qualityRating, lineItemPrices } = req.body;
    
    const priceScore = calculatePriceScore(quotedPrice);
    const qualityScore = qualityRating ? qualityRating * 20 : 75;
    const deliveryScore = calculateDeliveryScore(leadTime);
    const termsScore = calculateTermsScore(paymentTerms);
    const overallScore = (priceScore + qualityScore + deliveryScore + termsScore) / 4;
    
    const result = await db.execute(
      sql`INSERT INTO rfq_responses (rfq_id, supplier_id, supplier_name, supplier_email, quoted_price, lead_time, payment_terms, quality_rating, price_score, quality_score, delivery_score, terms_score, overall_score, line_item_prices, response_date)
        VALUES (${parseInt(rfqId)}, ${supplierId}, ${supplierName}, ${supplierEmail}, ${quotedPrice}, ${leadTime}, ${paymentTerms}, ${qualityRating}, ${priceScore}, ${qualityScore}, ${deliveryScore}, ${termsScore}, ${overallScore}, ${JSON.stringify(lineItemPrices)}, NOW())
        RETURNING id, overall_score`
    );
    
    res.json({ success: true, response: result.rows[0] });
  } catch (error: any) {
    logger.error("[RFQ] Submit response failed:", error.message);
    res.status(400).json({ error: error.message });
  }
});

router.get("/rfq/:rfqId/responses", async (req: Request, res: Response) => {
  try {
    const { rfqId } = req.params;
    
    const result = await db.execute(
      sql`SELECT id, supplier_name, supplier_email, quoted_price, overall_score, lead_time, payment_terms, response_date FROM rfq_responses WHERE rfq_id = ${parseInt(rfqId)} ORDER BY overall_score DESC`
    );
    
    res.json({ responses: result.rows });
  } catch (error: any) {
    logger.error("[RFQ] Get responses failed:", error.message);
    res.status(400).json({ error: error.message });
  }
});

router.get("/po-approval-thresholds", async (req: Request, res: Response) => {
  try {
    const result = await db.execute(
      sql`SELECT * FROM po_approval_thresholds WHERE is_active = true ORDER BY min_amount`
    );
    
    res.json({ thresholds: result.rows });
  } catch (error: any) {
    logger.error("[Approvals] Get thresholds failed:", error.message);
    res.status(400).json({ error: error.message });
  }
});

router.post("/po-approval-thresholds", async (req: Request, res: Response) => {
  try {
    const { minAmount, maxAmount, requiredRoles, approvalSequence, escalationHours, description } = req.body;
    
    const result = await db.execute(
      sql`INSERT INTO po_approval_thresholds (min_amount, max_amount, required_roles, approval_sequence, escalation_hours, description)
        VALUES (${minAmount}, ${maxAmount}, ${JSON.stringify(requiredRoles)}, ${JSON.stringify(approvalSequence)}, ${escalationHours}, ${description})
        RETURNING id`
    );
    
    res.json({ success: true, thresholdId: result.rows[0].id });
  } catch (error: any) {
    logger.error("[Approvals] Create threshold failed:", error.message);
    res.status(400).json({ error: error.message });
  }
});

router.post("/po/:poId/submit-for-approval", async (req: Request, res: Response) => {
  try {
    const { poId } = req.params;
    const { poNumber, poAmount } = req.body;
    
    const thresholdResult = await db.execute(
      sql`SELECT required_approvers FROM po_approval_thresholds WHERE min_amount <= ${poAmount} AND (max_amount IS NULL OR max_amount >= ${poAmount}) AND is_active = true ORDER BY min_amount DESC LIMIT 1`
    );
    
    const requiredApprovers = thresholdResult.rows[0]?.required_approvers || [];
    
    const approvalResult = await db.execute(
      sql`INSERT INTO po_approvals (po_id, po_number, po_amount, required_approvers, approval_status)
        VALUES (${parseInt(poId)}, ${poNumber}, ${poAmount}, ${JSON.stringify(requiredApprovers)}, 'pending')
        RETURNING id`
    );
    
    const approvalId = approvalResult.rows[0].id;
    
    for (let i = 0; i < requiredApprovers.length; i++) {
      await db.execute(
        sql`INSERT INTO po_approval_steps (approval_id, step_number, approver_email, approver_role, status)
          VALUES (${approvalId}, ${i + 1}, ${requiredApprovers[i]}, 'approver', 'pending')`
      );
    }
    
    res.json({ success: true, approvalId, approversCount: requiredApprovers.length });
  } catch (error: any) {
    logger.error("[Approvals] Submit for approval failed:", error.message);
    res.status(400).json({ error: error.message });
  }
});

router.post("/po-approval/:approvalId/step/:stepId/approve", async (req: Request, res: Response) => {
  try {
    const { approvalId, stepId } = req.params;
    const { comments } = req.body;
    
    await db.execute(
      sql`UPDATE po_approval_steps SET status = 'approved', approved_at = NOW(), comments = ${comments} WHERE id = ${parseInt(stepId)}`
    );
    
    const stepsResult = await db.execute(
      sql`SELECT COUNT(*) as total, SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved FROM po_approval_steps WHERE approval_id = ${parseInt(approvalId)}`
    );
    
    const { total, approved } = stepsResult.rows[0];
    if (approved === total) {
      await db.execute(sql`UPDATE po_approvals SET approval_status = 'approved', completed_at = NOW() WHERE id = ${parseInt(approvalId)}`);
    }
    
    res.json({ success: true });
  } catch (error: any) {
    logger.error("[Approvals] Approve step failed:", error.message);
    res.status(400).json({ error: error.message });
  }
});

router.post("/po-approval/:approvalId/step/:stepId/reject", async (req: Request, res: Response) => {
  try {
    const { approvalId, stepId } = req.params;
    const { comments } = req.body;
    
    await db.execute(
      sql`UPDATE po_approval_steps SET status = 'rejected', rejected_at = NOW(), comments = ${comments} WHERE id = ${parseInt(stepId)}`
    );
    
    await db.execute(sql`UPDATE po_approvals SET approval_status = 'rejected' WHERE id = ${parseInt(approvalId)}`);
    
    res.json({ success: true });
  } catch (error: any) {
    logger.error("[Approvals] Reject step failed:", error.message);
    res.status(400).json({ error: error.message });
  }
});

router.post("/three-way-matching/:poId/check", async (req: Request, res: Response) => {
  try {
    const { poId } = req.params;
    const { grnId, invoiceId } = req.body;
    
    const result = await db.execute(
      sql`INSERT INTO three_way_matching (po_id, grn_id, invoice_id, match_status)
        VALUES (${parseInt(poId)}, ${grnId}, ${invoiceId}, 'pending')
        RETURNING id`
    );
    
    res.json({ success: true, matchingId: result.rows[0].id });
  } catch (error: any) {
    logger.error("[3-Way Matching] Check failed:", error.message);
    res.status(400).json({ error: error.message });
  }
});

router.post("/landed-cost/:poId/calculate", async (req: Request, res: Response) => {
  try {
    const { poId } = req.params;
    const { freight, customsDuties, insurance, handling } = req.body;
    
    const totalLandedCost = (parseFloat(freight) || 0) + (parseFloat(customsDuties) || 0) + (parseFloat(insurance) || 0) + (parseFloat(handling) || 0);
    
    const result = await db.execute(
      sql`INSERT INTO landed_cost_calculation (po_id, total_freight, total_customs_duties, total_insurance, total_handling, total_landed_cost, calculated_at)
        VALUES (${parseInt(poId)}, ${freight}, ${customsDuties}, ${insurance}, ${handling}, ${totalLandedCost}, NOW())
        RETURNING id, total_landed_cost`
    );
    
    res.json({ success: true, landedCost: result.rows[0] });
  } catch (error: any) {
    logger.error("[Landed Cost] Calculate failed:", error.message);
    res.status(400).json({ error: error.message });
  }
});

function calculatePriceScore(quotedPrice: number): number {
  const basePrice = 10000;
  const priceRatio = quotedPrice / basePrice;
  return Math.max(0, Math.min(100, 100 * (1 - (priceRatio - 1) / 2)));
}

function calculateDeliveryScore(leadTime: number): number {
  const idealLeadTime = 7;
  if (leadTime <= idealLeadTime) return 100;
  if (leadTime <= 14) return 85;
  if (leadTime <= 21) return 70;
  return 50;
}

function calculateTermsScore(terms: string): number {
  const scoreMap: Record<string, number> = {
    "Net 30": 90,
    "Net 60": 85,
    "COD": 60,
    "Advance": 50,
  };
  return scoreMap[terms] || 75;
}

export default router;
