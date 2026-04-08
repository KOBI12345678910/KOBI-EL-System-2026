import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { VAT_RATE } from "../constants";

const router: IRouter = Router();
const logger = console;

interface PaymentDecision {
  invoiceAmount: number;
  squareMeters: number;
  ratePerSqm: number;
  contractorPercentage: number;
  paymentByPercentage: number;
  paymentBySqm: number;
  difference: number;
  recommendation: "percentage" | "sqm";
  savings: number;
}

function calculatePaymentDecision(
  invoiceAmount: number,
  squareMeters: number,
  ratePerSqm: number,
  contractorPercentage: number
): PaymentDecision {
  // Remove VAT
  const amountWithoutVAT = invoiceAmount / (1 + VAT_RATE);

  // Calculate payment by percentage
  const paymentByPercentage = (amountWithoutVAT * contractorPercentage) / 100;

  // Calculate payment by square meter
  const paymentBySqm = squareMeters * ratePerSqm;

  // Determine recommendation
  const difference = Math.abs(paymentByPercentage - paymentBySqm);
  const recommendation = paymentByPercentage < paymentBySqm ? "percentage" : "sqm";
  const savings = Math.abs(paymentByPercentage - paymentBySqm);

  return {
    invoiceAmount,
    squareMeters,
    ratePerSqm,
    contractorPercentage,
    paymentByPercentage: Math.round(paymentByPercentage * 100) / 100,
    paymentBySqm: Math.round(paymentBySqm * 100) / 100,
    difference: Math.round(difference * 100) / 100,
    recommendation,
    savings: Math.round(savings * 100) / 100,
  };
}

// Calculate payment decision
router.post("/contractor-payment/calculate", async (req: Request, res: Response) => {
  try {
    const { invoiceAmount, squareMeters, ratePerSqm, contractorPercentage } = req.body;

    if (!invoiceAmount || !squareMeters || !ratePerSqm || contractorPercentage === undefined) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const decision = calculatePaymentDecision(
      invoiceAmount,
      squareMeters,
      ratePerSqm,
      contractorPercentage
    );

    res.json(decision);
  } catch (error: any) {
    logger.error("[Contractor Payment] Calculate failed:", error.message);
    res.status(400).json({ error: error.message });
  }
});

// Get decision history for quotes/deals
router.get("/contractor-payment/history", async (req: Request, res: Response) => {
  try {
    const { limit = 50 } = req.query;

    const result = await db.execute(
      sql`SELECT id, entity_type, entity_id, entity_name, invoice_amount, square_meters, 
            rate_per_sqm, contractor_percentage, payment_by_percentage, payment_by_sqm, 
            recommendation, savings, created_at FROM contractor_payment_decisions 
          ORDER BY created_at DESC LIMIT ${parseInt(limit as string)}`
    );

    res.json({ decisions: result.rows || [] });
  } catch (error: any) {
    logger.error("[Contractor Payment] History failed:", error.message);
    res.status(400).json({ error: error.message });
  }
});

// Save decision
router.post("/contractor-payment/save-decision", async (req: Request, res: Response) => {
  try {
    const {
      entityType,
      entityId,
      entityName,
      invoiceAmount,
      squareMeters,
      ratePerSqm,
      contractorPercentage,
      chosenMethod,
    } = req.body;

    const decision = calculatePaymentDecision(
      invoiceAmount,
      squareMeters,
      ratePerSqm,
      contractorPercentage
    );

    const result = await db.execute(
      sql`INSERT INTO contractor_payment_decisions 
        (entity_type, entity_id, entity_name, invoice_amount, square_meters, rate_per_sqm, contractor_percentage, 
         payment_by_percentage, payment_by_sqm, recommendation, savings, chosen_method, created_at)
      VALUES (${entityType}, ${entityId}, ${entityName}, ${invoiceAmount}, ${squareMeters}, ${ratePerSqm}, 
              ${contractorPercentage}, ${decision.paymentByPercentage}, ${decision.paymentBySqm}, 
              ${decision.recommendation}, ${decision.savings}, ${chosenMethod}, NOW())
      RETURNING id`
    );

    res.json({
      success: true,
      decision: { ...decision, chosenMethod, decisionId: result.rows[0].id },
    });
  } catch (error: any) {
    logger.error("[Contractor Payment] Save decision failed:", error.message);
    res.status(400).json({ error: error.message });
  }
});

// Get summary stats
router.get("/contractor-payment/summary", async (req: Request, res: Response) => {
  try {
    const countResult = await db.execute(
      sql`SELECT COUNT(*) as count FROM contractor_payment_decisions`
    );

    const savingsResult = await db.execute(
      sql`SELECT SUM(savings) as total_savings FROM contractor_payment_decisions`
    );

    const methodsResult = await db.execute(
      sql`SELECT recommendation, COUNT(*) as count FROM contractor_payment_decisions 
          GROUP BY recommendation`
    );

    res.json({
      totalDecisions: countResult.rows[0].count || 0,
      totalSavings: savingsResult.rows[0].total_savings || 0,
      methodBreakdown: methodsResult.rows || [],
    });
  } catch (error: any) {
    logger.error("[Contractor Payment] Summary failed:", error.message);
    res.status(400).json({ error: error.message });
  }
});

export default router;
