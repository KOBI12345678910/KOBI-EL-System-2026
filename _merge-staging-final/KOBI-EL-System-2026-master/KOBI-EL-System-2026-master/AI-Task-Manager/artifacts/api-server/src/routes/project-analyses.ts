import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  projectAnalysesTable,
  projectAnalysisMaterialsTable,
  projectAnalysisCostsTable,
  projectAnalysisSimulationsTable,
  rawMaterialsTable,
  supplierMaterialsTable,
} from "@workspace/db/schema";
import { eq, ilike, or, and, desc } from "drizzle-orm";
import { z } from "zod/v4";
import { VAT_RATE, DISCOUNT_RATE_NPV } from "../constants";

const router: IRouter = Router();

async function appendAuditEntry(projectId: number, action: string, details: Record<string, unknown>) {
  const [existing] = await db.select({ auditTrail: projectAnalysesTable.auditTrail }).from(projectAnalysesTable).where(eq(projectAnalysesTable.id, projectId));
  if (!existing) return;
  const trail = Array.isArray(existing.auditTrail) ? [...(existing.auditTrail as Record<string, unknown>[])] : [];
  trail.push({ timestamp: new Date().toISOString(), action, ...details });
  await db.update(projectAnalysesTable).set({ auditTrail: trail, updatedAt: new Date() }).where(eq(projectAnalysesTable.id, projectId));
}

const AnalysisBody = z.object({
  projectCode: z.string().min(1),
  projectName: z.string().min(1),
  customerName: z.string().optional(),
  managerName: z.string().optional(),
  status: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  description: z.string().optional(),
  laborCost: z.string().optional(),
  installationCost: z.string().optional(),
  transportCost: z.string().optional(),
  insuranceCost: z.string().optional(),
  storageCost: z.string().optional(),
  customsCost: z.string().optional(),
  packagingCost: z.string().optional(),
  overheadCost: z.string().optional(),
  paymentTerms: z.string().optional(),
  numberOfPayments: z.coerce.number().int().optional(),
  creditFeePercent: z.string().optional(),
  contingencyPercent: z.string().optional(),
  operationalOverheadPercent: z.string().optional(),
  targetMarginPercent: z.string().optional(),
  proposedSalePrice: z.string().optional(),
  actualSalePrice: z.string().optional(),
  riskScore: z.string().optional(),
  supplierRisk: z.string().optional(),
  currencyRisk: z.string().optional(),
  marketRisk: z.string().optional(),
  operationalRisk: z.string().optional(),
  notes: z.string().optional(),
});

router.get("/project-analyses", async (req, res) => {
  try {
    const { search, status } = req.query;
    let query = db.select().from(projectAnalysesTable).orderBy(desc(projectAnalysesTable.createdAt)).$dynamic();
    if (search && typeof search === "string" && search.trim()) {
      query = query.where(
        or(
          ilike(projectAnalysesTable.projectName, `%${search}%`),
          ilike(projectAnalysesTable.projectCode, `%${search}%`),
          ilike(projectAnalysesTable.customerName, `%${search}%`)
        )
      );
    }
    const analyses = await query;
    let filtered = analyses;
    if (status && typeof status === "string" && status !== "all") {
      filtered = filtered.filter((a) => a.status === status);
    }

    const result = await Promise.all(
      filtered.map(async (analysis) => {
        const materials = await db
          .select()
          .from(projectAnalysisMaterialsTable)
          .where(eq(projectAnalysisMaterialsTable.projectAnalysisId, analysis.id));

        const costs = await db
          .select()
          .from(projectAnalysisCostsTable)
          .where(eq(projectAnalysisCostsTable.projectAnalysisId, analysis.id));

        const totalMaterials = materials.reduce((sum, m) => sum + parseFloat(m.totalPrice || "0"), 0);
        const totalAdditionalCosts = costs.reduce((sum, c) => sum + parseFloat(c.amount || "0"), 0);
        const productionCosts =
          parseFloat(analysis.laborCost || "0") +
          parseFloat(analysis.installationCost || "0") +
          parseFloat(analysis.transportCost || "0") +
          parseFloat(analysis.insuranceCost || "0") +
          parseFloat(analysis.storageCost || "0") +
          parseFloat(analysis.customsCost || "0") +
          parseFloat(analysis.packagingCost || "0") +
          parseFloat(analysis.overheadCost || "0");

        const subtotal = totalMaterials + productionCosts + totalAdditionalCosts;
        const contingency = subtotal * (parseFloat(analysis.contingencyPercent || "0") / 100);
        const operationalOverhead = subtotal * (parseFloat(analysis.operationalOverheadPercent || "0") / 100);
        const creditFee = subtotal * (parseFloat(analysis.creditFeePercent || "0") / 100);
        const totalCost = subtotal + contingency + operationalOverhead + creditFee;
        const vat = totalCost * VAT_RATE;
        const totalWithVat = totalCost + vat;

        const salePrice = parseFloat(analysis.actualSalePrice || "0") || parseFloat(analysis.proposedSalePrice || "0");
        const grossProfit = salePrice - totalCost;
        const grossMargin = salePrice > 0 ? (grossProfit / salePrice) * 100 : 0;

        const riskScore = (
          (parseFloat(analysis.supplierRisk || "5") +
            parseFloat(analysis.currencyRisk || "5") +
            parseFloat(analysis.marketRisk || "5") +
            parseFloat(analysis.operationalRisk || "5")) / 4
        );

        return {
          ...analysis,
          totalMaterials,
          productionCosts,
          totalCost,
          totalWithVat,
          grossMargin: Math.round(grossMargin * 10) / 10,
          grossProfit,
          computedRiskScore: Math.round(riskScore * 10) / 10,
          materialsCount: materials.length,
        };
      })
    );

    res.json(result);
  } catch (error: unknown) {
    res.status(500).json({ message: error instanceof Error ? error.message : String(error) });
  }
});

router.get("/project-analyses/raw-materials/lookup", async (req, res) => {
  try {
    const materials = await db.select().from(rawMaterialsTable).orderBy(desc(rawMaterialsTable.materialName));
    const allSupplierMaterials = materials.length > 0
      ? await db.select().from(supplierMaterialsTable)
      : [];

    const result = materials.map((m) => ({
      ...m,
      supplierPrices: allSupplierMaterials.filter((sm) => String(sm.materialId) === String(m.id)),
    }));

    res.json(result);
  } catch (error: unknown) {
    res.status(500).json({ message: error instanceof Error ? error.message : String(error) });
  }
});

router.get("/project-analyses/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const [analysis] = await db.select().from(projectAnalysesTable).where(eq(projectAnalysesTable.id, id));
    if (!analysis) return res.status(404).json({ message: "Not found" });

    const materials = await db
      .select()
      .from(projectAnalysisMaterialsTable)
      .where(eq(projectAnalysisMaterialsTable.projectAnalysisId, id));

    const costs = await db
      .select()
      .from(projectAnalysisCostsTable)
      .where(eq(projectAnalysisCostsTable.projectAnalysisId, id));

    const simulations = await db
      .select()
      .from(projectAnalysisSimulationsTable)
      .where(eq(projectAnalysisSimulationsTable.projectAnalysisId, id));

    res.json({ ...analysis, materials, costs, simulations });
  } catch (error: unknown) {
    res.status(400).json({ message: error instanceof Error ? error.message : String(error) });
  }
});

router.post("/project-analyses", async (req, res) => {
  try {
    const body = AnalysisBody.parse(req.body);
    const insertData: typeof projectAnalysesTable.$inferInsert = {
      projectCode: body.projectCode,
      projectName: body.projectName,
    };
    const optionalFields = [
      "customerName", "managerName", "status", "startDate", "endDate", "description",
      "laborCost", "installationCost", "transportCost", "insuranceCost",
      "storageCost", "customsCost", "packagingCost", "overheadCost",
      "paymentTerms", "numberOfPayments", "creditFeePercent", "contingencyPercent",
      "operationalOverheadPercent", "targetMarginPercent",
      "proposedSalePrice", "actualSalePrice",
      "riskScore", "supplierRisk", "currencyRisk", "marketRisk", "operationalRisk", "notes",
    ] as const;
    for (const field of optionalFields) {
      const val = (body as Record<string, unknown>)[field];
      if (val !== undefined && val !== null && val !== "") {
        (insertData as Record<string, unknown>)[field] = val;
      }
    }
    const [analysis] = await db.insert(projectAnalysesTable).values(insertData).returning();
    res.status(201).json(analysis);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("POST /project-analyses error:", error);
    if (msg.includes("duplicate") || msg.includes("unique")) {
      return res.status(409).json({ message: "קוד פרויקט כבר קיים במערכת" });
    }
    res.status(400).json({ message: msg });
  }
});

router.put("/project-analyses/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const body = AnalysisBody.partial().parse(req.body);

    const [existing] = await db.select().from(projectAnalysesTable).where(eq(projectAnalysesTable.id, id));
    if (!existing) return res.status(404).json({ message: "Not found" });

    const trail = Array.isArray(existing.auditTrail) ? [...(existing.auditTrail as Record<string, unknown>[])] : [];
    const existingRecord = existing as Record<string, unknown>;
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    for (const [key, val] of Object.entries(body)) {
      if (existingRecord[key] !== val) {
        changes[key] = { from: existingRecord[key], to: val };
      }
    }

    if (Object.keys(changes).length > 0) {
      trail.push({ timestamp: new Date().toISOString(), changes });
    }

    const [updated] = await db
      .update(projectAnalysesTable)
      .set({ ...body, auditTrail: trail, updatedAt: new Date() })
      .where(eq(projectAnalysesTable.id, id))
      .returning();
    res.json(updated);
  } catch (error: unknown) {
    res.status(400).json({ message: error instanceof Error ? error.message : String(error) });
  }
});

router.delete("/project-analyses/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    await db.delete(projectAnalysisMaterialsTable).where(eq(projectAnalysisMaterialsTable.projectAnalysisId, id));
    await db.delete(projectAnalysisCostsTable).where(eq(projectAnalysisCostsTable.projectAnalysisId, id));
    await db.delete(projectAnalysisSimulationsTable).where(eq(projectAnalysisSimulationsTable.projectAnalysisId, id));
    const [deleted] = await db.delete(projectAnalysesTable).where(eq(projectAnalysesTable.id, id)).returning();
    if (!deleted) return res.status(404).json({ message: "Not found" });
    res.json({ message: "Deleted" });
  } catch (error: unknown) {
    res.status(400).json({ message: error instanceof Error ? error.message : String(error) });
  }
});

router.post("/project-analyses/:id/materials", async (req, res) => {
  try {
    const projectAnalysisId = z.coerce.number().int().positive().parse(req.params.id);
    const [parent] = await db.select({ id: projectAnalysesTable.id }).from(projectAnalysesTable).where(eq(projectAnalysesTable.id, projectAnalysisId));
    if (!parent) return res.status(404).json({ message: "Project analysis not found" });
    const body = z.object({
      rawMaterialId: z.coerce.number().int().optional(),
      materialName: z.string().min(1),
      materialNumber: z.string().optional(),
      quantity: z.string().optional(),
      unit: z.string().optional(),
      unitPrice: z.string().optional(),
      totalPrice: z.string().optional(),
      vatAmount: z.string().optional(),
      supplierDiscount: z.string().optional(),
      pricePerMeter: z.string().optional(),
      supplierId: z.coerce.number().int().optional(),
      supplierName: z.string().optional(),
      notes: z.string().optional(),
    }).parse(req.body);

    const [material] = await db
      .insert(projectAnalysisMaterialsTable)
      .values({ ...body, projectAnalysisId })
      .returning();
    await appendAuditEntry(projectAnalysisId, "material_added", { materialName: body.materialName, materialId: material.id });
    res.status(201).json(material);
  } catch (error: unknown) {
    res.status(400).json({ message: error instanceof Error ? error.message : String(error) });
  }
});

router.delete("/project-analyses/:id/materials/:materialId", async (req, res) => {
  try {
    const projectAnalysisId = z.coerce.number().int().positive().parse(req.params.id);
    const materialId = z.coerce.number().int().positive().parse(req.params.materialId);
    const [deleted] = await db
      .delete(projectAnalysisMaterialsTable)
      .where(
        and(
          eq(projectAnalysisMaterialsTable.id, materialId),
          eq(projectAnalysisMaterialsTable.projectAnalysisId, projectAnalysisId)
        )
      )
      .returning();
    if (!deleted) return res.status(404).json({ message: "Material not found in this project" });
    await appendAuditEntry(projectAnalysisId, "material_deleted", { materialName: deleted.materialName, materialId });
    res.json({ message: "Deleted" });
  } catch (error: unknown) {
    res.status(400).json({ message: error instanceof Error ? error.message : String(error) });
  }
});

router.post("/project-analyses/:id/simulations", async (req, res) => {
  try {
    const projectAnalysisId = z.coerce.number().int().positive().parse(req.params.id);
    const [parent] = await db.select({ id: projectAnalysesTable.id }).from(projectAnalysesTable).where(eq(projectAnalysesTable.id, projectAnalysisId));
    if (!parent) return res.status(404).json({ message: "Project analysis not found" });
    const body = z.object({
      simulationType: z.string().min(1),
      scenarioName: z.string().min(1),
      parameters: z.record(z.string(), z.unknown()).optional(),
      results: z.record(z.string(), z.unknown()).optional(),
    }).parse(req.body);

    const [sim] = await db
      .insert(projectAnalysisSimulationsTable)
      .values({ ...body, projectAnalysisId })
      .returning();
    res.status(201).json(sim);
  } catch (error: unknown) {
    res.status(400).json({ message: error instanceof Error ? error.message : String(error) });
  }
});

router.post("/project-analyses/:id/costs", async (req, res) => {
  try {
    const projectAnalysisId = z.coerce.number().int().positive().parse(req.params.id);
    const [parent] = await db.select({ id: projectAnalysesTable.id }).from(projectAnalysesTable).where(eq(projectAnalysesTable.id, projectAnalysisId));
    if (!parent) return res.status(404).json({ message: "Project analysis not found" });
    const body = z.object({
      costType: z.string().min(1),
      description: z.string().optional(),
      amount: z.string().optional(),
      currency: z.string().optional(),
      notes: z.string().optional(),
    }).parse(req.body);

    const [cost] = await db
      .insert(projectAnalysisCostsTable)
      .values({ ...body, projectAnalysisId })
      .returning();
    await appendAuditEntry(projectAnalysisId, "cost_added", { costType: body.costType, costId: cost.id, amount: body.amount });
    res.status(201).json(cost);
  } catch (error: unknown) {
    res.status(400).json({ message: error instanceof Error ? error.message : String(error) });
  }
});

router.delete("/project-analyses/:id/costs/:costId", async (req, res) => {
  try {
    const projectAnalysisId = z.coerce.number().int().positive().parse(req.params.id);
    const costId = z.coerce.number().int().positive().parse(req.params.costId);
    const [deleted] = await db
      .delete(projectAnalysisCostsTable)
      .where(
        and(
          eq(projectAnalysisCostsTable.id, costId),
          eq(projectAnalysisCostsTable.projectAnalysisId, projectAnalysisId)
        )
      )
      .returning();
    if (!deleted) return res.status(404).json({ message: "Cost not found in this project" });
    await appendAuditEntry(projectAnalysisId, "cost_deleted", { costType: deleted.costType, costId, amount: deleted.amount });
    res.json({ message: "Deleted" });
  } catch (error: unknown) {
    res.status(400).json({ message: error instanceof Error ? error.message : String(error) });
  }
});

router.put("/project-analyses/:id/materials/:materialId", async (req, res) => {
  try {
    const projectAnalysisId = z.coerce.number().int().positive().parse(req.params.id);
    const materialId = z.coerce.number().int().positive().parse(req.params.materialId);
    const body = z.object({
      quantity: z.string().optional(),
      unitPrice: z.string().optional(),
      totalPrice: z.string().optional(),
      supplierDiscount: z.string().optional(),
      vatAmount: z.string().optional(),
      pricePerMeter: z.string().optional(),
      unit: z.string().optional(),
      notes: z.string().optional(),
    }).parse(req.body);

    const [updated] = await db
      .update(projectAnalysisMaterialsTable)
      .set(body)
      .where(
        and(
          eq(projectAnalysisMaterialsTable.id, materialId),
          eq(projectAnalysisMaterialsTable.projectAnalysisId, projectAnalysisId)
        )
      )
      .returning();
    if (!updated) return res.status(404).json({ message: "Material not found" });
    await appendAuditEntry(projectAnalysisId, "material_updated", { materialId, materialName: updated.materialName, changes: body });
    res.json(updated);
  } catch (error: unknown) {
    res.status(400).json({ message: error instanceof Error ? error.message : String(error) });
  }
});

router.get("/project-analyses/:id/calculate", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const [analysis] = await db.select().from(projectAnalysesTable).where(eq(projectAnalysesTable.id, id));
    if (!analysis) return res.status(404).json({ message: "Not found" });

    const materials = await db
      .select()
      .from(projectAnalysisMaterialsTable)
      .where(eq(projectAnalysisMaterialsTable.projectAnalysisId, id));

    const costs = await db
      .select()
      .from(projectAnalysisCostsTable)
      .where(eq(projectAnalysisCostsTable.projectAnalysisId, id));

    const totalMaterials = materials.reduce((s, m) => s + parseFloat(m.totalPrice || "0"), 0);
    const totalAdditionalCosts = costs.reduce((s, c) => s + parseFloat(c.amount || "0"), 0);

    const labor = parseFloat(analysis.laborCost || "0");
    const installation = parseFloat(analysis.installationCost || "0");
    const transport = parseFloat(analysis.transportCost || "0");
    const insurance = parseFloat(analysis.insuranceCost || "0");
    const storage = parseFloat(analysis.storageCost || "0");
    const customs = parseFloat(analysis.customsCost || "0");
    const packaging = parseFloat(analysis.packagingCost || "0");
    const overhead = parseFloat(analysis.overheadCost || "0");
    const productionCosts = labor + installation + transport + insurance + storage + customs + packaging + overhead;
    const transportAndInstall = transport + installation;

    const subtotal = totalMaterials + productionCosts + totalAdditionalCosts;
    const contingencyPct = parseFloat(analysis.contingencyPercent || "0");
    const operationalPct = parseFloat(analysis.operationalOverheadPercent || "0");
    const creditPct = parseFloat(analysis.creditFeePercent || "0");
    const contingency = subtotal * (contingencyPct / 100);
    const operationalOverhead = subtotal * (operationalPct / 100);
    const creditFee = subtotal * (creditPct / 100);
    const totalBeforeVat = subtotal + contingency + operationalOverhead + creditFee;
    const vat = totalBeforeVat * VAT_RATE;
    const totalWithVat = totalBeforeVat + vat;

    const proposedSale = parseFloat(analysis.proposedSalePrice || "0");
    const actualSale = parseFloat(analysis.actualSalePrice || "0");
    const salePrice = actualSale || proposedSale;
    const grossProfit = salePrice - totalBeforeVat;
    const grossMargin = salePrice > 0 ? (grossProfit / salePrice) * 100 : 0;
    const netProfit = grossProfit - creditFee - contingency;
    const netMargin = salePrice > 0 ? (netProfit / salePrice) * 100 : 0;
    const roi = totalBeforeVat > 0 ? (grossProfit / totalBeforeVat) * 100 : 0;
    const breakEven = grossMargin > 0 ? totalBeforeVat / (grossMargin / 100) : 0;

    const supplierRisk = parseFloat(analysis.supplierRisk || "5");
    const currencyRisk = parseFloat(analysis.currencyRisk || "5");
    const marketRisk = parseFloat(analysis.marketRisk || "5");
    const operationalRisk = parseFloat(analysis.operationalRisk || "5");
    const riskScore = (supplierRisk + currencyRisk + marketRisk + operationalRisk) / 4;

    const rate = totalBeforeVat > 0 ? grossProfit / totalBeforeVat : 0;
    const npvYears = [0, 1, 2, 3, 4, 5].map(year => {
      const discountRate = DISCOUNT_RATE_NPV;
      const cashFlow = year === 0 ? -totalBeforeVat : grossProfit / 5;
      const pv = cashFlow / Math.pow(1 + discountRate, year);
      return { year, cashFlow: Math.round(cashFlow), presentValue: Math.round(pv) };
    });
    const npv = npvYears.reduce((s, y) => s + y.presentValue, 0);

    let irr = 0;
    const irrCashFlows = [0, 1, 2, 3, 4, 5].map(y => y === 0 ? -totalBeforeVat : grossProfit / 5);
    let bestIrr = 0;
    let bestAbsNpv = Infinity;
    for (let r = -0.5; r < 2; r += 0.001) {
      const npvTest = irrCashFlows.reduce((s, cf, i) => s + cf / Math.pow(1 + r, i), 0);
      if (Math.abs(npvTest) < bestAbsNpv) {
        bestAbsNpv = Math.abs(npvTest);
        bestIrr = r;
      }
    }
    irr = bestIrr;

    const sensitivity = [-30, -20, -10, 0, 10, 20, 30].map(pctChange => {
      const adjMat = totalMaterials * (1 + pctChange / 100);
      const adjSubtotal = adjMat + productionCosts + totalAdditionalCosts;
      const adjContingency = adjSubtotal * (contingencyPct / 100);
      const adjOperational = adjSubtotal * (operationalPct / 100);
      const adjCredit = adjSubtotal * (creditPct / 100);
      const adjTotal = adjSubtotal + adjContingency + adjOperational + adjCredit;
      const adjProfit = salePrice - adjTotal;
      const adjMargin = salePrice > 0 ? (adjProfit / salePrice) * 100 : 0;
      return { materialChange: pctChange, totalCost: adjTotal, profit: adjProfit, margin: adjMargin };
    });

    res.json({
      totalMaterials, totalAdditionalCosts, productionCosts, transportAndInstall,
      subtotal, contingency, operationalOverhead, creditFee,
      totalBeforeVat, vat, totalWithVat,
      salePrice, grossProfit, grossMargin: Math.round(grossMargin * 10) / 10,
      netProfit, netMargin: Math.round(netMargin * 10) / 10,
      roi: Math.round(roi * 10) / 10, breakEven,
      riskScore: Math.round(riskScore * 10) / 10,
      supplierRisk, currencyRisk, marketRisk, operationalRisk,
      npv, irr: Math.round(irr * 1000) / 10,
      npvYears, sensitivity,
    });
  } catch (error: unknown) {
    res.status(400).json({ message: error instanceof Error ? error.message : String(error) });
  }
});

export default router;
