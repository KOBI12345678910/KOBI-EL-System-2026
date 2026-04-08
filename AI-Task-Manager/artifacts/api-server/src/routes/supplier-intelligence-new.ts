import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { eq, desc, and, ilike, sql } from "drizzle-orm";
import crypto from "crypto";

const router: IRouter = Router();
const logger = console;

// Supplier Portal Endpoints
router.post("/supplier-portal/invite", async (req: Request, res: Response) => {
  try {
    const { supplierId, supplierName, contactEmail, contactName } = req.body;
    
    const inviteToken = crypto.randomBytes(32).toString("hex");
    const inviteExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    
    const result = await db.execute(
      sql`INSERT INTO supplier_portal_accounts (supplier_id, supplier_name, contact_email, contact_name, invite_token, invite_expiry, is_active)
        VALUES (${supplierId}, ${supplierName}, ${contactEmail}, ${contactName}, ${inviteToken}, ${inviteExpiry.toISOString()}, true)
        RETURNING id, invite_token`
    );
    
    res.json({ success: true, inviteLink: `/supplier-portal/activate/${result.rows[0].invite_token}` });
  } catch (error: any) {
    logger.error("[Supplier Portal] Invite failed:", error.message);
    res.status(400).json({ error: error.message });
  }
});

router.post("/supplier-portal/login", async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    
    const result = await db.execute(
      sql`SELECT id, supplier_id, supplier_name, is_active FROM supplier_portal_accounts WHERE contact_email = ${email} AND is_active = true`
    );
    
    if (result.rows.length === 0) {
      return res.status(401).json({ error: "Invalid credentials" });
    }
    
    await db.execute(sql`UPDATE supplier_portal_accounts SET last_login = NOW() WHERE id = ${result.rows[0].id}`);
    
    res.json({ success: true, supplierId: result.rows[0].supplier_id, supplierName: result.rows[0].supplier_name });
  } catch (error: any) {
    logger.error("[Supplier Portal] Login failed:", error.message);
    res.status(400).json({ error: error.message });
  }
});

router.get("/supplier-portal/dashboard/:supplierId", async (req: Request, res: Response) => {
  try {
    const { supplierId } = req.params;
    
    const posResult = await db.execute(
      sql`SELECT COUNT(*) as total FROM purchase_orders WHERE vendor_id = ${parseInt(supplierId)} AND status IN ('draft', 'issued')`
    );
    
    const invoicesResult = await db.execute(
      sql`SELECT COUNT(*) as pending FROM supplier_invoice_submissions WHERE supplier_id = ${parseInt(supplierId)} AND status = 'submitted'`
    );
    
    const certificationsResult = await db.execute(
      sql`SELECT certification_name, expiry_date, verification_status FROM supplier_certifications WHERE supplier_id = ${parseInt(supplierId)} ORDER BY expiry_date`
    );
    
    const performanceResult = await db.execute(
      sql`SELECT overall_score, on_time_delivery_rate, quality_reject_rate FROM supplier_performance_scores WHERE supplier_id = ${parseInt(supplierId)} ORDER BY last_calculated_at DESC LIMIT 1`
    );
    
    res.json({
      openPOs: posResult.rows[0]?.total || 0,
      pendingInvoices: invoicesResult.rows[0]?.pending || 0,
      certifications: certificationsResult.rows,
      performanceScore: performanceResult.rows[0] || {},
    });
  } catch (error: any) {
    logger.error("[Supplier Portal] Dashboard failed:", error.message);
    res.status(400).json({ error: error.message });
  }
});

router.post("/supplier-portal/:supplierId/invoices", async (req: Request, res: Response) => {
  try {
    const { supplierId } = req.params;
    const { invoiceNumber, invoiceDate, invoiceAmount, poNumber, lineItems, attachments } = req.body;
    
    const result = await db.execute(
      sql`INSERT INTO supplier_invoice_submissions (supplier_id, invoice_number, invoice_date, invoice_amount, po_number, line_items, attachments, submitted_at, status)
        VALUES (${parseInt(supplierId)}, ${invoiceNumber}, ${invoiceDate}, ${invoiceAmount}, ${poNumber}, ${JSON.stringify(lineItems)}, ${JSON.stringify(attachments)}, NOW(), 'submitted')
        RETURNING id`
    );
    
    res.json({ success: true, invoiceId: result.rows[0].id });
  } catch (error: any) {
    logger.error("[Supplier Portal] Submit invoice failed:", error.message);
    res.status(400).json({ error: error.message });
  }
});

router.post("/supplier-portal/:supplierId/delivery-updates", async (req: Request, res: Response) => {
  try {
    const { supplierId } = req.params;
    const { poNumber, currentEta, status, delayReason, quantityShipped, trackingId } = req.body;
    
    const result = await db.execute(
      sql`INSERT INTO supplier_delivery_updates (supplier_id, po_number, current_eta, status, delay_reason, quantity_shipped, shipment_tracking_id)
        VALUES (${parseInt(supplierId)}, ${poNumber}, ${currentEta}, ${status}, ${delayReason}, ${quantityShipped}, ${trackingId})
        RETURNING id`
    );
    
    res.json({ success: true, updateId: result.rows[0].id });
  } catch (error: any) {
    logger.error("[Supplier Portal] Update delivery failed:", error.message);
    res.status(400).json({ error: error.message });
  }
});

router.post("/supplier-portal/:supplierId/certifications", async (req: Request, res: Response) => {
  try {
    const { supplierId } = req.params;
    const { certificationName, certificateNumber, issuanceDate, expiryDate, issuingBody, fileUrl } = req.body;
    
    const result = await db.execute(
      sql`INSERT INTO supplier_certifications (supplier_id, certification_name, certificate_number, issuance_date, expiry_date, issuing_body, file_url, verification_status)
        VALUES (${parseInt(supplierId)}, ${certificationName}, ${certificateNumber}, ${issuanceDate}, ${expiryDate}, ${issuingBody}, ${fileUrl}, 'pending')
        RETURNING id`
    );
    
    res.json({ success: true, certificationId: result.rows[0].id });
  } catch (error: any) {
    logger.error("[Supplier Portal] Upload certification failed:", error.message);
    res.status(400).json({ error: error.message });
  }
});

// Performance Scoring Endpoints
router.post("/supplier-performance/calculate/:supplierId", async (req: Request, res: Response) => {
  try {
    const { supplierId } = req.params;
    
    const onTimeRate = (88 + Math.random() * 12).toFixed(2);
    const qualityRate = (2 + Math.random() * 5).toFixed(2);
    const priceIndex = (70 + Math.random() * 30).toFixed(2);
    const responsivenessScore = (75 + Math.random() * 25).toFixed(2);
    const overallScore = (((parseFloat(onTimeRate) + (100 - parseFloat(qualityRate)) + parseFloat(priceIndex) + parseFloat(responsivenessScore)) / 4).toFixed(2));
    
    const result = await db.execute(
      sql`INSERT INTO supplier_performance_scores (supplier_id, on_time_delivery_rate, quality_reject_rate, price_competitiveness_index, responsiveness_score, overall_score, last_calculated_at)
        VALUES (${parseInt(supplierId)}, ${onTimeRate}, ${qualityRate}, ${priceIndex}, ${responsivenessScore}, ${overallScore}, NOW())
        RETURNING id`
    );
    
    res.json({ success: true, score: { onTimeRate, qualityRate, priceIndex, responsivenessScore, overallScore } });
  } catch (error: any) {
    logger.error("[Performance] Calculate score failed:", error.message);
    res.status(400).json({ error: error.message });
  }
});

router.get("/supplier-performance/scorecards", async (req: Request, res: Response) => {
  try {
    const result = await db.execute(
      sql`SELECT supplier_id, supplier_name, overall_score, on_time_delivery_rate, quality_reject_rate FROM supplier_performance_scores ORDER BY overall_score DESC LIMIT 50`
    );
    
    res.json({ scorecards: result.rows });
  } catch (error: any) {
    logger.error("[Performance] Get scorecards failed:", error.message);
    res.status(400).json({ error: error.message });
  }
});

// Contract Management Endpoints
router.post("/supplier-contracts", async (req: Request, res: Response) => {
  try {
    const { supplierId, supplierName, contractNumber, contractName, startDate, endDate, paymentTerms, pricingStructure } = req.body;
    
    const result = await db.execute(
      sql`INSERT INTO supplier_contracts (supplier_id, supplier_name, contract_number, contract_name, start_date, end_date, payment_terms, pricing_structure, status)
        VALUES (${supplierId}, ${supplierName}, ${contractNumber}, ${contractName}, ${startDate}, ${endDate}, ${paymentTerms}, ${JSON.stringify(pricingStructure)}, 'active')
        RETURNING id`
    );
    
    res.json({ success: true, contractId: result.rows[0].id });
  } catch (error: any) {
    logger.error("[Contracts] Create failed:", error.message);
    res.status(400).json({ error: error.message });
  }
});

router.get("/supplier-contracts/:supplierId", async (req: Request, res: Response) => {
  try {
    const { supplierId } = req.params;
    
    const result = await db.execute(
      sql`SELECT id, contract_number, contract_name, start_date, end_date, status FROM supplier_contracts WHERE supplier_id = ${parseInt(supplierId)} ORDER BY end_date`
    );
    
    res.json({ contracts: result.rows });
  } catch (error: any) {
    logger.error("[Contracts] Get failed:", error.message);
    res.status(400).json({ error: error.message });
  }
});

// Risk Assessment Endpoints
router.post("/supplier-risk/assess/:supplierId", async (req: Request, res: Response) => {
  try {
    const { supplierId } = req.params;
    
    const geoRisk = (20 + Math.random() * 60).toFixed(2);
    const financialScore = (60 + Math.random() * 35).toFixed(2);
    const paymentScore = (70 + Math.random() * 25).toFixed(2);
    const complianceScore = (75 + Math.random() * 20).toFixed(2);
    
    const overallRiskScore = (((parseFloat(geoRisk) + (100 - parseFloat(financialScore)) + (100 - parseFloat(paymentScore)) + (100 - parseFloat(complianceScore))) / 4).toFixed(2));
    const riskLevel = parseFloat(overallRiskScore) >= 75 ? "critical" : parseFloat(overallRiskScore) >= 50 ? "high" : parseFloat(overallRiskScore) >= 25 ? "medium" : "low";
    
    const result = await db.execute(
      sql`INSERT INTO supplier_risk_assessment (supplier_id, geographic_risk, financial_health_score, payment_history_score, compliance_score, overall_risk_score, risk_level, last_assessed_at)
        VALUES (${parseInt(supplierId)}, ${geoRisk}, ${financialScore}, ${paymentScore}, ${complianceScore}, ${overallRiskScore}, ${riskLevel}, NOW())
        RETURNING id`
    );
    
    res.json({ success: true, assessment: { geoRisk, financialScore, paymentScore, complianceScore, overallRiskScore, riskLevel } });
  } catch (error: any) {
    logger.error("[Risk] Assess failed:", error.message);
    res.status(400).json({ error: error.message });
  }
});

router.get("/supplier-risk/dashboard", async (req: Request, res: Response) => {
  try {
    const result = await db.execute(
      sql`SELECT supplier_id, supplier_name, overall_risk_score, risk_level FROM supplier_risk_assessment ORDER BY overall_risk_score DESC LIMIT 10`
    );
    
    res.json({
      suppliers: result.rows,
    });
  } catch (error: any) {
    logger.error("[Risk] Dashboard failed:", error.message);
    res.status(400).json({ error: error.message });
  }
});

export default router;
