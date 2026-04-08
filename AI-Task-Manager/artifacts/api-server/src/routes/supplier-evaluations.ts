import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { supplierEvaluationsTable } from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";
import { z } from "zod/v4";

const router: IRouter = Router();

const EvalBody = z.object({
  supplierId: z.coerce.number().int().positive(),
  evaluationDate: z.string().optional(),
  evaluator: z.string().optional(),
  periodStart: z.string().optional(),
  periodEnd: z.string().optional(),
  deliveryScore: z.string().optional(),
  qualityScore: z.string().optional(),
  pricingScore: z.string().optional(),
  serviceScore: z.string().optional(),
  reliabilityScore: z.string().optional(),
  overallScore: z.string().optional(),
  deliveryNotes: z.string().optional(),
  qualityNotes: z.string().optional(),
  pricingNotes: z.string().optional(),
  serviceNotes: z.string().optional(),
  reliabilityNotes: z.string().optional(),
  generalNotes: z.string().optional(),
  totalOrders: z.coerce.number().int().nonnegative().optional().nullable(),
  onTimeDeliveries: z.coerce.number().int().nonnegative().optional().nullable(),
  qualityRejections: z.coerce.number().int().nonnegative().optional().nullable(),
  priceCompliancePct: z.string().optional(),
  responseTimeAvg: z.string().optional(),
  recommendation: z.string().optional(),
  status: z.string().optional(),
});

function cleanEvalData(body: any) {
  const cleaned = { ...body };
  for (const key of ["evaluationDate", "periodStart", "periodEnd"]) {
    if (cleaned[key] === "") cleaned[key] = null;
  }
  for (const key of ["deliveryScore", "qualityScore", "pricingScore", "serviceScore", "reliabilityScore", "overallScore", "priceCompliancePct", "responseTimeAvg"]) {
    if (cleaned[key] === "") cleaned[key] = undefined;
  }
  if (cleaned.totalOrders === "") cleaned.totalOrders = undefined;
  if (cleaned.onTimeDeliveries === "") cleaned.onTimeDeliveries = undefined;
  if (cleaned.qualityRejections === "") cleaned.qualityRejections = undefined;
  return cleaned;
}

router.get("/supplier-evaluations", async (req, res) => {
  try {
    const evals = await db.select().from(supplierEvaluationsTable).orderBy(desc(supplierEvaluationsTable.evaluationDate));
    res.json(evals);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

router.get("/supplier-evaluations/stats", async (_req, res) => {
  try {
    const evals = await db.select().from(supplierEvaluationsTable);
    const stats = {
      total: evals.length,
      avgScore: evals.length > 0 ? Math.round(evals.reduce((sum: number, e: any) => sum + parseFloat(e.overallScore || e.totalScore || "0"), 0) / evals.length * 10) / 10 : 0,
      excellent: evals.filter((e: any) => parseFloat(e.overallScore || e.totalScore || "0") >= 80).length,
      good: evals.filter((e: any) => { const s = parseFloat(e.overallScore || e.totalScore || "0"); return s >= 60 && s < 80; }).length,
      needsImprovement: evals.filter((e: any) => parseFloat(e.overallScore || e.totalScore || "0") < 60).length,
    };
    res.json(stats);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

router.get("/supplier-evaluations/:id", async (req, res): Promise<void> => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const [ev] = await db.select().from(supplierEvaluationsTable).where(eq(supplierEvaluationsTable.id, id));
    if (!ev) { res.status(404).json({ message: "Evaluation not found" }); return; }
    res.json(ev);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

router.get("/supplier-evaluations/by-supplier/:supplierId", async (req, res) => {
  try {
    const supplierId = z.coerce.number().int().positive().parse(req.params.supplierId);
    const evals = await db.select().from(supplierEvaluationsTable)
      .where(eq(supplierEvaluationsTable.supplierId, supplierId))
      .orderBy(desc(supplierEvaluationsTable.evaluationDate));
    res.json(evals);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

router.post("/supplier-evaluations", async (req, res) => {
  try {
    const body = EvalBody.parse(req.body);
    const cleaned = cleanEvalData(body);
    const scores = [
      parseFloat(cleaned.deliveryScore || "0"),
      parseFloat(cleaned.qualityScore || "0"),
      parseFloat(cleaned.pricingScore || "0"),
      parseFloat(cleaned.serviceScore || "0"),
      parseFloat(cleaned.reliabilityScore || "0"),
    ];
    const avg = scores.reduce((s, v) => s + v, 0) / scores.filter(v => v > 0).length || 0;
    cleaned.overallScore = avg.toFixed(1);
    const [ev] = await db.insert(supplierEvaluationsTable).values(cleaned).returning();
    res.status(201).json(ev);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

router.put("/supplier-evaluations/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const body = EvalBody.partial().parse(req.body);
    const cleaned = cleanEvalData(body);
    if (cleaned.deliveryScore || cleaned.qualityScore || cleaned.pricingScore || cleaned.serviceScore || cleaned.reliabilityScore) {
      const [existing] = await db.select().from(supplierEvaluationsTable).where(eq(supplierEvaluationsTable.id, id));
      if (existing) {
        const scores = [
          parseFloat(cleaned.deliveryScore || existing.deliveryScore || "0"),
          parseFloat(cleaned.qualityScore || existing.qualityScore || "0"),
          parseFloat(cleaned.pricingScore || existing.pricingScore || "0"),
          parseFloat(cleaned.serviceScore || existing.serviceScore || "0"),
          parseFloat(cleaned.reliabilityScore || existing.reliabilityScore || "0"),
        ];
        const avg = scores.reduce((s, v) => s + v, 0) / scores.filter(v => v > 0).length || 0;
        cleaned.overallScore = avg.toFixed(1);
      }
    }
    const [ev] = await db.update(supplierEvaluationsTable)
      .set({ ...cleaned, updatedAt: new Date() })
      .where(eq(supplierEvaluationsTable.id, id)).returning();
    if (!ev) { res.status(404).json({ message: "Evaluation not found" }); return; }
    res.json(ev);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

router.delete("/supplier-evaluations/:id", async (req, res): Promise<void> => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const [deleted] = await db.delete(supplierEvaluationsTable).where(eq(supplierEvaluationsTable.id, id)).returning();
    if (!deleted) { res.status(404).json({ message: "Evaluation not found" }); return; }
    res.json({ message: "Deleted" });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

export default router;
