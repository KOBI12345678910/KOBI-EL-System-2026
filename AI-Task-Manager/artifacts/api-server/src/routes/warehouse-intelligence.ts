import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { CARRYING_COST_RATE } from "../constants";
import {
  rawMaterialsTable,
  goodsReceiptsTable,
  goodsReceiptItemsTable,
  demandForecastsTable,
  reorderSuggestionsTable,
  vmiSuppliersTable,
  vmiItemsTable,
  vmiReplenishmentOrdersTable,
  suppliersTable,
} from "@workspace/db/schema";
import { eq, desc, and, sql } from "drizzle-orm";
import { z } from "zod/v4";
import { onGoodsReceiptCompleted } from "../lib/data-sync";

const router: IRouter = Router();

interface TxRow {
  transaction_type: string;
  quantity: string;
  created_at: string;
}

interface ProdSignalRow {
  total_planned_qty: string;
  order_count: number;
}

interface SalesSignalRow {
  total_sales_qty: string;
  order_count: number;
}

interface PastSuggestionRow {
  status: string;
  user_action: string | null;
  suggested_reorder_point: string;
  user_override_value: string | null;
  confidence_score: number;
}

interface ForecastResult {
  avgDailyDemand: number;
  demandVariability: number;
  seasonalFactors: Record<number, number>;
  confidenceScore: number;
  peakMonths: number[];
}

interface LearningAdjustment {
  confidenceBoost: number;
  demandAdjustmentFactor: number;
  note: string | null;
}

function sqlRows<T>(result: unknown): T[] {
  return ((result as { rows?: T[] }).rows ?? []) as T[];
}

function toErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function computeDemandForecast(transactions: TxRow[], _leadTimeDays: number): ForecastResult {
  if (!transactions || transactions.length === 0) {
    return {
      avgDailyDemand: 0,
      demandVariability: 0,
      seasonalFactors: {} as Record<number, number>,
      confidenceScore: 0,
      peakMonths: [] as number[],
    };
  }

  const consumptions = transactions.filter(
    (t) => t.transaction_type === "issue" || t.transaction_type === "consumption" || t.transaction_type === "production_issue"
  );

  if (consumptions.length === 0) {
    const allQty = transactions.map((t) => Math.abs(parseFloat(t.quantity || "0")));
    const avg = allQty.reduce((s, v) => s + v, 0) / allQty.length;
    return {
      avgDailyDemand: avg / 30,
      demandVariability: 0.3,
      seasonalFactors: {},
      confidenceScore: 20,
      peakMonths: [],
    };
  }

  const monthlyConsumption: Record<string, number> = {};
  for (const tx of consumptions) {
    const d = new Date(tx.created_at);
    const key = `${d.getFullYear()}-${d.getMonth() + 1}`;
    monthlyConsumption[key] = (monthlyConsumption[key] || 0) + Math.abs(parseFloat(tx.quantity || "0"));
  }

  const monthValues = Object.values(monthlyConsumption);
  const avgMonthly = monthValues.reduce((s, v) => s + v, 0) / monthValues.length;
  const avgDailyDemand = avgMonthly / 30;

  const variance = monthValues.reduce((s, v) => s + Math.pow(v - avgMonthly, 2), 0) / monthValues.length;
  const stdDev = Math.sqrt(variance);
  const demandVariability = avgMonthly > 0 ? stdDev / avgMonthly : 0;

  const monthTotals: Record<number, number[]> = {};
  for (const [key, val] of Object.entries(monthlyConsumption)) {
    const month = parseInt(key.split("-")[1]);
    if (!monthTotals[month]) monthTotals[month] = [];
    monthTotals[month].push(val);
  }

  const seasonalFactors: Record<number, number> = {};
  for (const [month, vals] of Object.entries(monthTotals)) {
    const monthAvg = vals.reduce((s, v) => s + v, 0) / vals.length;
    seasonalFactors[parseInt(month)] = avgMonthly > 0 ? monthAvg / avgMonthly : 1.0;
  }

  const peakMonths = Object.entries(seasonalFactors)
    .filter(([, f]) => f >= 1.2)
    .map(([m]) => parseInt(m));

  const confidenceScore = Math.min(100, Math.max(0, (consumptions.length / 20) * 70 + (Object.keys(monthlyConsumption).length / 12) * 30));

  return { avgDailyDemand, demandVariability, seasonalFactors, confidenceScore, peakMonths };
}

function computeReorderPoint(avgDailyDemand: number, leadTimeDays: number, demandVariability: number, serviceLevel = 0.95): {
  reorderPoint: number; safetyStock: number; eoq: number;
} {
  const zScore = serviceLevel >= 0.99 ? 2.33 : serviceLevel >= 0.95 ? 1.65 : serviceLevel >= 0.9 ? 1.28 : 1.0;
  const safetyStock = zScore * demandVariability * avgDailyDemand * Math.sqrt(leadTimeDays);
  const reorderPoint = avgDailyDemand * leadTimeDays + safetyStock;
  const annualDemand = avgDailyDemand * 365;
  const holdingCost = 0.2;
  const orderCost = 500;
  const eoq = annualDemand > 0 && holdingCost > 0 ? Math.sqrt((2 * annualDemand * orderCost) / holdingCost) : 0;
  return {
    reorderPoint: Math.round(reorderPoint * 100) / 100,
    safetyStock: Math.round(safetyStock * 100) / 100,
    eoq: Math.round(eoq * 100) / 100,
  };
}

router.get("/warehouse-intelligence/demand-forecasts", async (req, res) => {
  try {
    const materialId = req.query.materialId ? z.coerce.number().int().positive().parse(req.query.materialId) : undefined;
    let query = db.select().from(demandForecastsTable).orderBy(desc(demandForecastsTable.forecastDate)).$dynamic();
    if (materialId) query = query.where(eq(demandForecastsTable.materialId, materialId));
    const forecasts = await query;
    res.json(forecasts);
  } catch (err: unknown) {
    res.status(500).json({ message: toErrorMessage(err) });
  }
});

router.post("/warehouse-intelligence/generate-forecasts", async (_req, res) => {
  try {
    const materials = await db
      .select()
      .from(rawMaterialsTable)
      .where(eq(rawMaterialsTable.status, "active"));

    const results: Array<{ materialId: number; materialName: string | null; forecast: unknown }> = [];

    for (const material of materials.slice(0, 100)) {
      const [txResult, prodResult, salesResult, pastSuggestionsResult] = await Promise.all([
        db.execute(
          sql`SELECT transaction_type, quantity, created_at FROM inventory_transactions WHERE material_id = ${material.id} ORDER BY created_at DESC LIMIT 365`
        ),
        db.execute(
          sql`SELECT COALESCE(SUM(pbom.quantity_required::numeric), 0) as total_planned_qty, COUNT(wo.id) as order_count
              FROM work_orders wo
              JOIN production_bom pbom ON pbom.work_order_id = wo.id
              WHERE pbom.material_id = ${material.id}
                AND wo.scheduled_start >= NOW() - INTERVAL '90 days'
                AND wo.status NOT IN ('cancelled', 'completed')`
        ),
        db.execute(
          sql`SELECT COALESCE(SUM(soi.quantity::numeric), 0) as total_sales_qty, COUNT(so.id) as order_count
              FROM sales_orders so
              JOIN sales_order_items soi ON soi.sales_order_id = so.id
              WHERE soi.material_id = ${material.id}
                AND so.created_at >= NOW() - INTERVAL '90 days'
                AND so.status NOT IN ('cancelled')`
        ),
        db.execute(
          sql`SELECT status, user_action, suggested_reorder_point, user_override_value, confidence_score::numeric
              FROM reorder_suggestions
              WHERE material_id = ${material.id} AND status IN ('accepted', 'overridden', 'dismissed')
              ORDER BY created_at DESC LIMIT 10`
        ),
      ]);

      const transactions = sqlRows<TxRow>(txResult);
      const prodRow = sqlRows<ProdSignalRow>(prodResult)[0] ?? { total_planned_qty: "0", order_count: 0 };
      const salesRow = sqlRows<SalesSignalRow>(salesResult)[0] ?? { total_sales_qty: "0", order_count: 0 };
      const pastSuggestions = sqlRows<PastSuggestionRow>(pastSuggestionsResult);

      const leadTimeDays = material.leadTimeDays || 14;
      const { avgDailyDemand: baseDailyDemand, demandVariability, seasonalFactors, confidenceScore: baseConfidence, peakMonths } =
        computeDemandForecast(transactions, leadTimeDays);

      const plannedQty = parseFloat(prodRow.total_planned_qty || "0");
      const salesQty = parseFloat(salesRow.total_sales_qty || "0");
      const upcomingDailySignal = (plannedQty + salesQty) / 90;
      const avgDailyDemand = baseDailyDemand > 0
        ? baseDailyDemand * 0.6 + upcomingDailySignal * 0.4
        : upcomingDailySignal || baseDailyDemand;

      const learningAdjustment = computeLearningAdjustment(pastSuggestions);
      const confidenceScore = Math.min(100, Math.max(0, baseConfidence + learningAdjustment.confidenceBoost));
      const demandAdjustmentFactor = learningAdjustment.demandAdjustmentFactor;
      const adjustedDailyDemand = avgDailyDemand * demandAdjustmentFactor;

      const { reorderPoint, safetyStock, eoq } = computeReorderPoint(
        adjustedDailyDemand,
        leadTimeDays,
        demandVariability
      );

      const today = new Date().toISOString().slice(0, 10);

      const [forecast] = await db
        .insert(demandForecastsTable)
        .values({
          materialId: material.id,
          forecastPeriod: "monthly",
          forecastDate: today,
          forecastQty: String(Math.round(adjustedDailyDemand * 30 * 100) / 100),
          confidenceScore: String(Math.round(confidenceScore)),
          seasonalFactor: String(1.0),
          method: transactions.length >= 10 ? "time_series_blended" : "blended_signal",
          dataPointsUsed: transactions.length + (prodRow.order_count || 0) + (salesRow.order_count || 0),
          notes: [
            `מ-${transactions.length} רשומות עסקאות`,
            plannedQty > 0 ? `${plannedQty.toFixed(0)} יח' מהזמנות ייצור פתוחות` : null,
            salesQty > 0 ? `${salesQty.toFixed(0)} יח' מהזמנות מכירה` : null,
            learningAdjustment.note || null,
          ].filter(Boolean).join("; "),
        })
        .returning();

      const existing = await db.select().from(reorderSuggestionsTable)
        .where(and(eq(reorderSuggestionsTable.materialId, material.id), eq(reorderSuggestionsTable.status, "pending")));

      if (existing.length === 0 && (reorderPoint > 0 || safetyStock > 0)) {
        const hasSeasonalPattern = peakMonths.length > 0;
        const reasoning = buildReasoning(material, adjustedDailyDemand, leadTimeDays, demandVariability, reorderPoint, safetyStock, peakMonths, transactions.length, learningAdjustment.note);

        await db.insert(reorderSuggestionsTable).values({
          materialId: material.id,
          currentReorderPoint: material.reorderPoint || "0",
          suggestedReorderPoint: String(reorderPoint),
          currentSafetyStock: material.safetyStock || "0",
          suggestedSafetyStock: String(safetyStock),
          currentEoq: material.economicOrderQty || "0",
          suggestedEoq: String(eoq),
          confidenceScore: String(Math.round(confidenceScore)),
          reasoning,
          seasonalPatternDetected: hasSeasonalPattern,
          peakMonths: peakMonths.join(","),
          avgDailyDemand: String(adjustedDailyDemand),
          demandVariability: String(demandVariability),
          leadTimeDays: leadTimeDays,
          status: "pending",
        });
      }

      results.push({ materialId: material.id, materialName: material.materialName, forecast });
    }

    res.json({ message: "Forecasts generated", count: results.length, results });
  } catch (err: unknown) {
    console.error("[warehouse-intelligence] generate-forecasts error:", err);
    res.status(500).json({ message: toErrorMessage(err) });
  }
});

function computeLearningAdjustment(pastSuggestions: PastSuggestionRow[]): LearningAdjustment {
  if (!pastSuggestions || pastSuggestions.length === 0) {
    return { confidenceBoost: 0, demandAdjustmentFactor: 1.0, note: null };
  }

  const accepted = pastSuggestions.filter(s => s.status === "accepted");
  const overridden = pastSuggestions.filter(s => s.status === "overridden");
  const dismissed = pastSuggestions.filter(s => s.status === "dismissed");

  let confidenceBoost = 0;
  let demandAdjustmentFactor = 1.0;
  const notes: string[] = [];

  if (accepted.length > 0) {
    confidenceBoost += Math.min(15, accepted.length * 5);
    notes.push(`${accepted.length} הצעות קודמות אושרו`);
  }
  if (dismissed.length > 0) {
    confidenceBoost -= Math.min(10, dismissed.length * 3);
  }
  if (overridden.length > 0) {
    const ratios: number[] = [];
    for (const s of overridden) {
      const suggested = parseFloat(s.suggested_reorder_point || "0");
      const override = parseFloat(s.user_override_value || "0");
      if (suggested > 0 && override > 0) {
        ratios.push(override / suggested);
      }
    }
    if (ratios.length > 0) {
      const avgRatio = ratios.reduce((a, b) => a + b, 0) / ratios.length;
      demandAdjustmentFactor = Math.max(0.5, Math.min(2.0, avgRatio));
      confidenceBoost += 5;
      notes.push(`${overridden.length} עקיפות קודמות — גורם כוונון: ${avgRatio.toFixed(2)}`);
    }
  }

  return {
    confidenceBoost: Math.round(confidenceBoost),
    demandAdjustmentFactor,
    note: notes.length > 0 ? notes.join("; ") : null,
  };
}

interface MaterialSummary { materialName?: string | null; leadTimeDays?: number | null; }

function buildReasoning(
  material: MaterialSummary,
  avgDailyDemand: number,
  leadTimeDays: number,
  demandVariability: number,
  reorderPoint: number,
  safetyStock: number,
  peakMonths: number[],
  dataPoints: number,
  learningNote?: string | null
): string {
  const monthNames: Record<number, string> = {
    1: "ינואר", 2: "פברואר", 3: "מרץ", 4: "אפריל", 5: "מאי", 6: "יוני",
    7: "יולי", 8: "אוגוסט", 9: "ספטמבר", 10: "אוקטובר", 11: "נובמבר", 12: "דצמבר",
  };
  const parts: string[] = [];
  parts.push(`ממוצע צריכה יומית: ${avgDailyDemand.toFixed(2)} יחידות.`);
  parts.push(`זמן אספקה: ${leadTimeDays} ימים.`);
  if (demandVariability > 0.3) parts.push("שונות גבוהה בביקוש — בטחון מלאי גדול נדרש.");
  else if (demandVariability > 0.1) parts.push("שונות בינונית בביקוש.");
  else parts.push("ביקוש יציב יחסית.");
  if (peakMonths.length > 0) {
    const names = peakMonths.map((m) => monthNames[m] || m).join(", ");
    parts.push(`עונתיות נגלית: חודשי שיא — ${names}.`);
  }
  parts.push(`נקודת הזמנה מחושבת: ${reorderPoint.toFixed(1)} יחידות.`);
  parts.push(`מלאי בטחון מוצע: ${safetyStock.toFixed(1)} יחידות.`);
  parts.push(`מבוסס על ${dataPoints} רשומות היסטוריות.`);
  if (learningNote) parts.push(`למידה מהיסטוריה: ${learningNote}.`);
  return parts.join(" ");
}

router.get("/warehouse-intelligence/reorder-suggestions", async (_req, res) => {
  try {
    const suggestions = await db.execute(sql`
      SELECT rs.*, rm.material_name, rm.material_number, rm.current_stock, rm.unit,
             rm.warehouse_location, rm.category, rm.lead_time_days
      FROM reorder_suggestions rs
      JOIN raw_materials rm ON rs.material_id = rm.id
      ORDER BY rs.confidence_score DESC, rs.created_at DESC
    `);
    res.json(sqlRows<Record<string, unknown>>(suggestions));
  } catch (err: unknown) {
    res.status(500).json({ message: toErrorMessage(err) });
  }
});

router.patch("/warehouse-intelligence/reorder-suggestions/:id/accept", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const { actionBy } = req.body;
    const [suggestion] = await db.select().from(reorderSuggestionsTable).where(eq(reorderSuggestionsTable.id, id));
    if (!suggestion) return res.status(404).json({ message: "Not found" });

    await db.update(rawMaterialsTable).set({
      reorderPoint: suggestion.suggestedReorderPoint,
      safetyStock: suggestion.suggestedSafetyStock,
      economicOrderQty: suggestion.suggestedEoq,
      updatedAt: new Date(),
    }).where(eq(rawMaterialsTable.id, suggestion.materialId));

    const [updated] = await db.update(reorderSuggestionsTable).set({
      status: "accepted",
      userAction: "accepted",
      actionBy: actionBy || "user",
      actionAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(reorderSuggestionsTable.id, id)).returning();

    res.json(updated);
  } catch (err: unknown) {
    res.status(400).json({ message: toErrorMessage(err) });
  }
});

router.patch("/warehouse-intelligence/reorder-suggestions/:id/override", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const body = z.object({
      overrideReorderPoint: z.string().optional(),
      overrideSafetyStock: z.string().optional(),
      feedback: z.string().optional(),
      actionBy: z.string().optional(),
    }).parse(req.body);

    const [suggestion] = await db.select().from(reorderSuggestionsTable).where(eq(reorderSuggestionsTable.id, id));
    if (!suggestion) return res.status(404).json({ message: "Not found" });

    const newReorderPoint = body.overrideReorderPoint || suggestion.suggestedReorderPoint;
    const newSafetyStock = body.overrideSafetyStock || suggestion.suggestedSafetyStock;

    await db.update(rawMaterialsTable).set({
      reorderPoint: newReorderPoint,
      safetyStock: newSafetyStock,
      updatedAt: new Date(),
    }).where(eq(rawMaterialsTable.id, suggestion.materialId));

    const [updated] = await db.update(reorderSuggestionsTable).set({
      status: "overridden",
      userAction: "overridden",
      userOverrideValue: body.overrideReorderPoint || null,
      userFeedback: body.feedback || null,
      actionBy: body.actionBy || "user",
      actionAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(reorderSuggestionsTable.id, id)).returning();

    res.json(updated);
  } catch (err: unknown) {
    res.status(400).json({ message: toErrorMessage(err) });
  }
});

router.patch("/warehouse-intelligence/reorder-suggestions/:id/dismiss", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const [updated] = await db.update(reorderSuggestionsTable).set({
      status: "dismissed",
      userAction: "dismissed",
      actionAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(reorderSuggestionsTable.id, id)).returning();
    if (!updated) return res.status(404).json({ message: "Not found" });
    res.json(updated);
  } catch (err: unknown) {
    res.status(400).json({ message: toErrorMessage(err) });
  }
});

router.get("/warehouse-intelligence/consumption-history/:materialId", async (req, res) => {
  try {
    const materialId = z.coerce.number().int().positive().parse(req.params.materialId);
    const result = await db.execute(sql`
      SELECT 
        DATE_TRUNC('month', created_at) as month,
        SUM(ABS(quantity::numeric)) FILTER (WHERE transaction_type IN ('issue','consumption','production_issue')) as consumed,
        SUM(quantity::numeric) FILTER (WHERE transaction_type IN ('receipt','import_receipt')) as received,
        COUNT(*) as transactions
      FROM inventory_transactions
      WHERE material_id = ${materialId}
      GROUP BY DATE_TRUNC('month', created_at)
      ORDER BY month DESC
      LIMIT 24
    `);
    res.json(sqlRows<Record<string, unknown>>(result));
  } catch (err: unknown) {
    res.status(500).json({ message: toErrorMessage(err) });
  }
});

router.get("/vmi/suppliers", async (_req, res) => {
  try {
    const result = await db.execute(sql`
      SELECT vs.*, s.supplier_name, s.supplier_number, s.phone, s.email,
             COUNT(vi.id) as managed_items_count
      FROM vmi_suppliers vs
      JOIN suppliers s ON vs.supplier_id = s.id
      LEFT JOIN vmi_items vi ON vi.vmi_supplier_id = vs.id AND vi.status = 'active'
      GROUP BY vs.id, s.supplier_name, s.supplier_number, s.phone, s.email
      ORDER BY vs.created_at DESC
    `);
    res.json(sqlRows<Record<string, unknown>>(result));
  } catch (err: unknown) {
    res.status(500).json({ message: toErrorMessage(err) });
  }
});

router.post("/vmi/suppliers", async (req, res) => {
  try {
    const body = z.object({
      supplierId: z.coerce.number().int().positive(),
      vmiContractNumber: z.string().optional(),
      replenishmentLeadDays: z.coerce.number().int().optional(),
      reviewFrequencyDays: z.coerce.number().int().optional(),
      notes: z.string().optional(),
    }).parse(req.body);

    const [supplier] = await db.select({ id: suppliersTable.id })
      .from(suppliersTable).where(eq(suppliersTable.id, body.supplierId));
    if (!supplier) return res.status(404).json({ message: "ספק לא נמצא" });

    const [existing] = await db.select({ id: vmiSuppliersTable.id })
      .from(vmiSuppliersTable).where(eq(vmiSuppliersTable.supplierId, body.supplierId));
    if (existing) return res.status(409).json({ message: "ספק VMI זה כבר קיים" });

    const [vmiSupplier] = await db.insert(vmiSuppliersTable).values(body).returning();
    res.status(201).json(vmiSupplier);
  } catch (err: unknown) {
    const msg = toErrorMessage(err);
    if (msg.includes("duplicate") || msg.includes("unique")) {
      return res.status(409).json({ message: "ספק VMI זה כבר קיים" });
    }
    res.status(400).json({ message: msg });
  }
});

router.put("/vmi/suppliers/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const body = z.object({
      replenishmentLeadDays: z.coerce.number().int().optional(),
      reviewFrequencyDays: z.coerce.number().int().optional(),
      notes: z.string().optional(),
      isVmi: z.boolean().optional(),
    }).parse(req.body);

    const [updated] = await db.update(vmiSuppliersTable).set({ ...body, updatedAt: new Date() })
      .where(eq(vmiSuppliersTable.id, id)).returning();
    if (!updated) return res.status(404).json({ message: "Not found" });
    res.json(updated);
  } catch (err: unknown) {
    res.status(400).json({ message: toErrorMessage(err) });
  }
});

router.delete("/vmi/suppliers/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    await db.delete(vmiItemsTable).where(eq(vmiItemsTable.vmiSupplierId, id));
    await db.delete(vmiSuppliersTable).where(eq(vmiSuppliersTable.id, id));
    res.json({ message: "Deleted" });
  } catch (err: unknown) {
    res.status(400).json({ message: toErrorMessage(err) });
  }
});

router.get("/vmi/items", async (req, res) => {
  try {
    const supplierId = req.query.vmiSupplierId ? z.coerce.number().int().positive().parse(req.query.vmiSupplierId) : undefined;
    const result = await db.execute(sql`
      SELECT vi.*, rm.material_name, rm.material_number, rm.current_stock, rm.unit,
             rm.warehouse_location, rm.category, rm.lead_time_days,
             s.supplier_name,
             CASE
               WHEN COALESCE(rm.current_stock::numeric, 0) = 0 THEN 'out_of_stock'
               WHEN COALESCE(rm.current_stock::numeric, 0) <= vi.min_threshold::numeric THEN 'below_min'
               WHEN COALESCE(rm.current_stock::numeric, 0) <= (vi.min_threshold::numeric + (vi.max_threshold::numeric - vi.min_threshold::numeric) * 0.3) THEN 'low'
               WHEN COALESCE(rm.current_stock::numeric, 0) >= vi.max_threshold::numeric THEN 'above_max'
               ELSE 'ok'
             END as stock_status,
             ROUND(COALESCE(rm.current_stock::numeric, 0) / NULLIF(vi.max_threshold::numeric, 0) * 100, 1) as fill_percent
      FROM vmi_items vi
      JOIN raw_materials rm ON vi.material_id = rm.id
      JOIN vmi_suppliers vs ON vi.vmi_supplier_id = vs.id
      JOIN suppliers s ON vs.supplier_id = s.id
      ${supplierId ? sql`WHERE vi.vmi_supplier_id = ${supplierId}` : sql``}
      ORDER BY vi.created_at DESC
    `);
    res.json(sqlRows<Record<string, unknown>>(result));
  } catch (err: unknown) {
    res.status(500).json({ message: toErrorMessage(err) });
  }
});

router.post("/vmi/items", async (req, res) => {
  try {
    const body = z.object({
      vmiSupplierId: z.coerce.number().int().positive(),
      materialId: z.coerce.number().int().positive(),
      minThreshold: z.string().min(1),
      maxThreshold: z.string().min(1),
      targetLevel: z.string().optional(),
      replenishmentQty: z.string().optional(),
      notes: z.string().optional(),
    }).parse(req.body);

    const [vmiSupplier] = await db.select({ id: vmiSuppliersTable.id })
      .from(vmiSuppliersTable).where(eq(vmiSuppliersTable.id, body.vmiSupplierId));
    if (!vmiSupplier) return res.status(404).json({ message: "ספק VMI לא נמצא" });

    const [material] = await db.select({ id: rawMaterialsTable.id })
      .from(rawMaterialsTable).where(eq(rawMaterialsTable.id, body.materialId));
    if (!material) return res.status(404).json({ message: "חומר לא נמצא" });

    const [item] = await db.insert(vmiItemsTable).values(body).returning();
    res.status(201).json(item);
  } catch (err: unknown) {
    res.status(400).json({ message: toErrorMessage(err) });
  }
});

router.put("/vmi/items/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const body = z.object({
      minThreshold: z.string().optional(),
      maxThreshold: z.string().optional(),
      targetLevel: z.string().optional(),
      replenishmentQty: z.string().optional(),
      status: z.string().optional(),
      notes: z.string().optional(),
    }).parse(req.body);

    const [updated] = await db.update(vmiItemsTable).set({ ...body, updatedAt: new Date() })
      .where(eq(vmiItemsTable.id, id)).returning();
    if (!updated) return res.status(404).json({ message: "Not found" });
    res.json(updated);
  } catch (err: unknown) {
    res.status(400).json({ message: toErrorMessage(err) });
  }
});

router.delete("/vmi/items/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    await db.delete(vmiItemsTable).where(eq(vmiItemsTable.id, id));
    res.json({ message: "Deleted" });
  } catch (err: unknown) {
    res.status(400).json({ message: toErrorMessage(err) });
  }
});

router.get("/vmi/replenishment-orders", async (req, res) => {
  try {
    const supplierId = req.query.supplierId ? z.coerce.number().int().positive().parse(req.query.supplierId) : undefined;
    const result = await db.execute(sql`
      SELECT ro.*, rm.material_name, rm.material_number, rm.unit, s.supplier_name
      FROM vmi_replenishment_orders ro
      JOIN raw_materials rm ON ro.material_id = rm.id
      JOIN suppliers s ON ro.supplier_id = s.id
      ${supplierId ? sql`WHERE ro.supplier_id = ${supplierId}` : sql``}
      ORDER BY ro.created_at DESC
      LIMIT 200
    `);
    res.json(sqlRows<Record<string, unknown>>(result));
  } catch (err: unknown) {
    res.status(500).json({ message: toErrorMessage(err) });
  }
});

router.post("/vmi/replenishment-orders", async (req, res) => {
  try {
    const body = z.object({
      vmiItemId: z.coerce.number().int().positive(),
      materialId: z.coerce.number().int().positive(),
      supplierId: z.coerce.number().int().positive(),
      quantity: z.string().min(1),
      unit: z.string().optional(),
      expectedDeliveryDate: z.string().optional(),
      notes: z.string().optional(),
      createdBy: z.string().optional(),
    }).parse(req.body);

    const [item] = await db.select().from(vmiItemsTable).where(eq(vmiItemsTable.id, body.vmiItemId));
    const stockLevel = await db.select({ stock: rawMaterialsTable.currentStock })
      .from(rawMaterialsTable).where(eq(rawMaterialsTable.id, body.materialId));

    const orderNumber = `VMI-${Date.now()}`;
    const [order] = await db.insert(vmiReplenishmentOrdersTable).values({
      ...body,
      orderNumber,
      stockLevelAtOrder: stockLevel[0]?.stock || "0",
    }).returning();

    if (item) {
      await db.update(vmiItemsTable).set({
        lastReplenishmentDate: new Date().toISOString().slice(0, 10),
        lastReplenishmentQty: body.quantity,
        replenishmentDueDate: body.expectedDeliveryDate || null,
        alertSent: false,
        updatedAt: new Date(),
      }).where(eq(vmiItemsTable.id, body.vmiItemId));
    }

    res.status(201).json(order);
  } catch (err: unknown) {
    res.status(400).json({ message: toErrorMessage(err) });
  }
});

router.patch("/vmi/replenishment-orders/:id/status", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const body = z.object({
      status: z.string(),
      deliveredQuantity: z.string().optional(),
      actualDeliveryDate: z.string().optional(),
    }).parse(req.body);

    const [order] = await db.select().from(vmiReplenishmentOrdersTable).where(eq(vmiReplenishmentOrdersTable.id, id));
    if (!order) return res.status(404).json({ message: "Not found" });

    const wasAlreadyDelivered = order.status === "delivered";

    const [updated] = await db.update(vmiReplenishmentOrdersTable).set({
      ...body,
      updatedAt: new Date(),
    }).where(eq(vmiReplenishmentOrdersTable.id, id)).returning();

    if (!wasAlreadyDelivered && body.status === "delivered" && body.deliveredQuantity) {
      const qty = parseFloat(body.deliveredQuantity);
      if (qty > 0) {
        await db.execute(sql`
          UPDATE raw_materials SET
            current_stock = COALESCE(current_stock::numeric, 0) + ${qty},
            last_receipt_date = CURRENT_DATE,
            updated_at = NOW()
          WHERE id = ${order.materialId}
        `);
        await db.execute(sql`
          INSERT INTO inventory_transactions (material_id, transaction_type, quantity, reference_type, reference_id, notes)
          VALUES (${order.materialId}, 'receipt', ${qty}, 'vmi_replenishment', ${order.id}, ${`VMI קבלה ${order.orderNumber}`})
        `);
      }
    }

    res.json(updated);
  } catch (err: unknown) {
    res.status(400).json({ message: toErrorMessage(err) });
  }
});

router.get("/vmi/alerts", async (_req, res) => {
  try {
    const result = await db.execute(sql`
      SELECT vi.*, rm.material_name, rm.material_number, rm.current_stock, rm.unit,
             s.supplier_name, vs.replenishment_lead_days,
             CASE
               WHEN COALESCE(rm.current_stock::numeric, 0) = 0 THEN 'out_of_stock'
               WHEN COALESCE(rm.current_stock::numeric, 0) <= vi.min_threshold::numeric THEN 'below_min'
               ELSE 'ok'
             END as alert_type,
             vi.replenishment_due_date,
             CASE WHEN vi.replenishment_due_date IS NOT NULL AND vi.replenishment_due_date < CURRENT_DATE THEN true ELSE false END as overdue
      FROM vmi_items vi
      JOIN raw_materials rm ON vi.material_id = rm.id
      JOIN vmi_suppliers vs ON vi.vmi_supplier_id = vs.id
      JOIN suppliers s ON vs.supplier_id = s.id
      WHERE vi.status = 'active'
        AND (
          COALESCE(rm.current_stock::numeric, 0) <= vi.min_threshold::numeric
          OR (vi.replenishment_due_date IS NOT NULL AND vi.replenishment_due_date < CURRENT_DATE)
        )
      ORDER BY rm.current_stock ASC
    `);
    res.json(sqlRows<Record<string, unknown>>(result));
  } catch (err: unknown) {
    res.status(500).json({ message: toErrorMessage(err) });
  }
});

router.get("/vmi/performance-report", async (_req, res) => {
  try {
    const vmiStats = await db.execute(sql`
      SELECT 
        s.supplier_name,
        COUNT(DISTINCT vi.material_id) as managed_items,
        COUNT(ro.id) as total_orders,
        COUNT(ro.id) FILTER (WHERE ro.status = 'delivered') as delivered_orders,
        AVG(
          CASE WHEN ro.actual_delivery_date IS NOT NULL AND ro.expected_delivery_date IS NOT NULL
          THEN (ro.actual_delivery_date::date - ro.expected_delivery_date::date)
          ELSE NULL END
        ) as avg_delivery_variance_days,
        SUM(ro.delivered_quantity::numeric) FILTER (WHERE ro.status = 'delivered') as total_delivered_qty,
        COUNT(vi.id) FILTER (WHERE rm.current_stock::numeric < vi.min_threshold::numeric) as items_below_min
      FROM vmi_suppliers vs
      JOIN suppliers s ON vs.supplier_id = s.id
      LEFT JOIN vmi_items vi ON vi.vmi_supplier_id = vs.id
      LEFT JOIN raw_materials rm ON vi.material_id = rm.id
      LEFT JOIN vmi_replenishment_orders ro ON ro.supplier_id = vs.supplier_id
      GROUP BY vs.id, s.supplier_name
    `);

    const trad = await db.execute(sql`
      SELECT 
        AVG(
          CASE WHEN gr.receipt_date IS NOT NULL AND po.expected_delivery IS NOT NULL
          THEN (gr.receipt_date::date - po.expected_delivery::date)
          ELSE NULL END
        ) as avg_delivery_variance_days,
        COUNT(po.id) as total_orders,
        COUNT(gr.id) as received_orders
      FROM purchase_orders po
      LEFT JOIN goods_receipts gr ON gr.order_id = po.id
      WHERE po.created_at > NOW() - INTERVAL '6 months'
    `);

    res.json({
      vmiPerformance: sqlRows<Record<string, unknown>>(vmiStats),
      traditionalPerformance: sqlRows<Record<string, unknown>>(trad)[0] ?? {},
    });
  } catch (err: unknown) {
    res.status(500).json({ message: toErrorMessage(err) });
  }
});

router.get("/vmi/supplier-portal/:supplierId", async (req, res) => {
  try {
    if (!req.userId) return res.status(401).json({ message: "נדרשת הזדהות" });
    if (!req.permissions?.isSuperAdmin && !req.permissions?.modules) return res.status(403).json({ message: "אין הרשאה לצפות בפורטל ספקים" });
    const supplierId = z.coerce.number().int().positive().parse(req.params.supplierId);

    const vmiSupplier = await db.execute(sql`
      SELECT vs.id, vs.replenishment_lead_days, vs.review_frequency_days, vs.vmi_contract_number,
             vs.performance_score, vs.last_review_date,
             s.supplier_name, s.supplier_number, s.email, s.phone
      FROM vmi_suppliers vs
      JOIN suppliers s ON vs.supplier_id = s.id
      WHERE vs.supplier_id = ${supplierId} AND vs.is_vmi = true
      LIMIT 1
    `);

    const supplierRows = sqlRows<Record<string, unknown>>(vmiSupplier);
    if (supplierRows.length === 0) return res.status(404).json({ message: "ספק VMI לא נמצא" });

    const managedItems = await db.execute(sql`
      SELECT vi.id, vi.material_id, vi.min_threshold, vi.max_threshold, vi.target_level,
             vi.replenishment_qty, vi.status, vi.last_replenishment_date, vi.last_replenishment_qty,
             vi.replenishment_due_date, vi.notes,
             rm.material_name, rm.material_number, rm.barcode, rm.unit,
             rm.current_stock, rm.warehouse_location,
             CASE
               WHEN COALESCE(rm.current_stock::numeric, 0) = 0 THEN 'out_of_stock'
               WHEN COALESCE(rm.current_stock::numeric, 0) <= vi.min_threshold::numeric THEN 'below_min'
               WHEN COALESCE(rm.current_stock::numeric, 0) <= vi.min_threshold::numeric * 1.2 THEN 'low'
               WHEN COALESCE(rm.current_stock::numeric, 0) >= vi.max_threshold::numeric THEN 'at_max'
               ELSE 'ok'
             END as stock_status
      FROM vmi_items vi
      JOIN raw_materials rm ON vi.material_id = rm.id
      JOIN vmi_suppliers vs ON vi.vmi_supplier_id = vs.id
      WHERE vs.supplier_id = ${supplierId} AND vi.status = 'active'
      ORDER BY rm.current_stock::numeric ASC
    `);

    const recentOrders = await db.execute(sql`
      SELECT ro.id, ro.order_number, ro.quantity, ro.unit, ro.status,
             ro.expected_delivery_date, ro.actual_delivery_date, ro.delivered_quantity,
             ro.created_at, rm.material_name
      FROM vmi_replenishment_orders ro
      JOIN raw_materials rm ON ro.material_id = rm.id
      WHERE ro.supplier_id = ${supplierId}
      ORDER BY ro.created_at DESC
      LIMIT 20
    `);

    interface ManagedItemRow {
      id: number;
      material_id: number;
      material_name: string;
      current_stock: string;
      min_threshold: string;
      max_threshold: string;
      stock_status: string;
    }

    const managedItemRows = sqlRows<ManagedItemRow>(managedItems);
    const recentOrderRows = sqlRows<Record<string, unknown>>(recentOrders);
    const criticalStatuses = new Set(["out_of_stock", "below_min", "low"]);
    const itemsNeedingReplenishment = managedItemRows.filter(item => criticalStatuses.has(item.stock_status));

    res.json({
      supplier: supplierRows[0],
      managedItems: managedItemRows,
      recentOrders: recentOrderRows,
      alerts: {
        itemsNeedingReplenishment: itemsNeedingReplenishment.length,
        criticalItems: itemsNeedingReplenishment.filter(i => i.stock_status === "out_of_stock" || i.stock_status === "below_min"),
      },
    });
  } catch (err: unknown) {
    res.status(500).json({ message: toErrorMessage(err) });
  }
});

router.post("/vmi/supplier-portal/:supplierId/replenish", async (req, res) => {
  try {
    if (!req.userId) return res.status(401).json({ message: "נדרשת הזדהות" });
    if (!req.permissions?.isSuperAdmin && !req.permissions?.modules) return res.status(403).json({ message: "אין הרשאה לבצע פעולה זו" });
    const supplierId = z.coerce.number().int().positive().parse(req.params.supplierId);
    const body = z.object({
      vmiItemId: z.coerce.number().int().positive(),
      quantity: z.string().min(1),
      unit: z.string().optional(),
      expectedDeliveryDate: z.string().optional(),
      notes: z.string().optional(),
    }).parse(req.body);

    const vmiItem = await db.execute(sql`
      SELECT vi.id, vi.material_id, vi.vmi_supplier_id, vs.supplier_id
      FROM vmi_items vi
      JOIN vmi_suppliers vs ON vi.vmi_supplier_id = vs.id
      WHERE vi.id = ${body.vmiItemId} AND vs.supplier_id = ${supplierId} AND vi.status = 'active'
      LIMIT 1
    `);

    interface VmiOwnershipRow { id: number; material_id: number; vmi_supplier_id: number; supplier_id: number; }
    const itemRows = sqlRows<VmiOwnershipRow>(vmiItem);
    if (itemRows.length === 0) {
      return res.status(403).json({ message: "פריט לא נמצא או אינו שייך לספק זה" });
    }

    const item = itemRows[0];
    const stockLevel = await db.select({ stock: rawMaterialsTable.currentStock })
      .from(rawMaterialsTable).where(eq(rawMaterialsTable.id, item.material_id));

    const orderNumber = `VMI-SUP-${supplierId}-${Date.now()}`;
    const [order] = await db.insert(vmiReplenishmentOrdersTable).values({
      vmiItemId: body.vmiItemId,
      materialId: item.material_id,
      supplierId,
      orderNumber,
      quantity: body.quantity,
      unit: body.unit || "יחידה",
      stockLevelAtOrder: stockLevel[0]?.stock || "0",
      expectedDeliveryDate: body.expectedDeliveryDate || null,
      notes: body.notes || "הזמנת חידוש על-ידי ספק",
      createdBy: `supplier:${supplierId}`,
      status: "pending",
    }).returning();

    await db.update(vmiItemsTable).set({
      lastReplenishmentDate: new Date().toISOString().slice(0, 10),
      lastReplenishmentQty: body.quantity,
      replenishmentDueDate: body.expectedDeliveryDate || null,
      alertSent: false,
      updatedAt: new Date(),
    }).where(eq(vmiItemsTable.id, body.vmiItemId));

    res.status(201).json(order);
  } catch (err: unknown) {
    res.status(400).json({ message: toErrorMessage(err) });
  }
});

router.put("/vmi/supplier-portal/:supplierId/items/:itemId/thresholds", async (req, res) => {
  try {
    if (!req.userId) return res.status(401).json({ message: "נדרשת הזדהות" });
    if (!req.permissions?.isSuperAdmin && !req.permissions?.modules) return res.status(403).json({ message: "אין הרשאה לבצע פעולה זו" });
    const supplierId = z.coerce.number().int().positive().parse(req.params.supplierId);
    const itemId = z.coerce.number().int().positive().parse(req.params.itemId);
    const body = z.object({
      minThreshold: z.string().min(1),
      maxThreshold: z.string().min(1),
      targetLevel: z.string().optional(),
      replenishmentQty: z.string().optional(),
      notes: z.string().optional(),
    }).parse(req.body);

    const ownership = await db.execute(sql`
      SELECT vi.id FROM vmi_items vi
      JOIN vmi_suppliers vs ON vi.vmi_supplier_id = vs.id
      WHERE vi.id = ${itemId} AND vs.supplier_id = ${supplierId} AND vi.status = 'active'
      LIMIT 1
    `);

    if (!sqlRows<{ id: number }>(ownership).length) {
      return res.status(403).json({ message: "פריט לא נמצא או אינו שייך לספק זה" });
    }

    const min = parseFloat(body.minThreshold);
    const max = parseFloat(body.maxThreshold);
    if (min >= max) {
      return res.status(400).json({ message: "מינימום חייב להיות קטן ממקסימום" });
    }

    const [updated] = await db.update(vmiItemsTable).set({
      minThreshold: body.minThreshold,
      maxThreshold: body.maxThreshold,
      targetLevel: body.targetLevel || null,
      replenishmentQty: body.replenishmentQty || null,
      notes: body.notes || null,
      updatedAt: new Date(),
    }).where(eq(vmiItemsTable.id, itemId)).returning();

    res.json(updated);
  } catch (err: unknown) {
    res.status(400).json({ message: toErrorMessage(err) });
  }
});

router.get("/warehouse-intelligence/scan-po/:poNumber", async (req, res) => {
  try {
    const { poNumber } = req.params;
    const poResult = await db.execute(sql`
      SELECT po.id, po.order_number, po.supplier_id, po.status, po.expected_delivery,
             s.supplier_name,
             COALESCE(json_agg(json_build_object(
               'id', poi.id,
               'materialId', poi.material_id,
               'materialName', rm.material_name,
               'materialNumber', rm.material_number,
               'barcode', rm.barcode,
               'itemCode', poi.item_code,
               'itemDescription', poi.item_description,
               'quantity', poi.quantity,
               'receivedQuantity', poi.received_quantity,
               'unit', poi.unit
             )) FILTER (WHERE poi.id IS NOT NULL), '[]') as items
      FROM purchase_orders po
      JOIN suppliers s ON po.supplier_id = s.id
      LEFT JOIN purchase_order_items poi ON poi.order_id = po.id
      LEFT JOIN raw_materials rm ON poi.material_id = rm.id
      WHERE po.order_number ILIKE ${`%${poNumber}%`} OR po.order_number = ${poNumber}
      GROUP BY po.id, po.order_number, po.supplier_id, po.status, po.expected_delivery, s.supplier_name
      LIMIT 1
    `);

    const rows = sqlRows<Record<string, unknown>>(poResult);
    if (rows.length === 0) return res.status(404).json({ message: "הזמנת רכש לא נמצאה" });
    res.json(rows[0]);
  } catch (err: unknown) {
    res.status(500).json({ message: toErrorMessage(err) });
  }
});

router.get("/warehouse-intelligence/scan-material/:barcode", async (req, res) => {
  try {
    const { barcode } = req.params;
    const result = await db.execute(sql`
      SELECT id, material_name, material_number, barcode, unit, current_stock, warehouse_location, category
      FROM raw_materials
      WHERE barcode = ${barcode} OR material_number = ${barcode} OR sku = ${barcode}
      LIMIT 1
    `);
    const rows = sqlRows<Record<string, unknown>>(result);
    if (rows.length === 0) return res.status(404).json({ message: "חומר לא נמצא" });
    res.json(rows[0]);
  } catch (err: unknown) {
    res.status(500).json({ message: toErrorMessage(err) });
  }
});

router.post("/warehouse-intelligence/mobile-receipt", async (req, res) => {
  try {
    const body = z.object({
      orderId: z.coerce.number().int().positive(),
      supplierId: z.coerce.number().int().positive(),
      orderNumber: z.string().min(1),
      receivedBy: z.string().optional(),
      notes: z.string().optional(),
      items: z.array(z.object({
        poItemId: z.number().nullable().optional(),
        materialId: z.number().nullable(),
        itemCode: z.string().optional(),
        itemDescription: z.string(),
        expectedQuantity: z.number(),
        scannedQuantity: z.number(),
        unit: z.string(),
        barcode: z.string().optional(),
      })),
    }).parse(req.body);

    const activeItems = body.items.filter(i => i.scannedQuantity > 0);
    if (activeItems.length === 0) {
      return res.status(400).json({ message: "לא נסרקו פריטים עם כמות חיובית" });
    }

    const receiptNumber = `GR-SCAN-${Date.now()}`;
    const today = new Date().toISOString().slice(0, 10);

    const discrepancies = activeItems.filter(item => {
      if (item.expectedQuantity <= 0) return false;
      const diff = Math.abs(item.scannedQuantity - item.expectedQuantity);
      const pct = diff / item.expectedQuantity;
      return pct > 0.05;
    });

    const hasDiscrepancy = discrepancies.length > 0;
    const receiptStatus = hasDiscrepancy ? "חלקי" : "הושלם";
    const discrepancyNotes = hasDiscrepancy
      ? discrepancies.map(d => `${d.itemDescription}: צפוי ${d.expectedQuantity} התקבל ${d.scannedQuantity}`).join("; ")
      : null;

    let receipt!: typeof goodsReceiptsTable.$inferSelect;
    let itemResults!: Array<typeof goodsReceiptItemsTable.$inferSelect>;

    await db.transaction(async (tx) => {
      const [createdReceipt] = await tx.insert(goodsReceiptsTable).values({
        receiptNumber,
        orderId: body.orderId,
        supplierId: body.supplierId,
        receiptDate: today,
        status: receiptStatus,
        receivedBy: body.receivedBy || "סריקה מובייל",
        notes: [
          body.notes || `קבלה מסריקת ברקוד — ${body.orderNumber}`,
          discrepancyNotes ? `אי-התאמות: ${discrepancyNotes}` : null,
        ].filter(Boolean).join(" | "),
      }).returning();

      if (!createdReceipt) throw new Error("שגיאה ביצירת קבלה");
      receipt = createdReceipt;

      itemResults = await Promise.all(
        activeItems.map(item => {
          const diff = item.expectedQuantity > 0 ? item.scannedQuantity - item.expectedQuantity : 0;
          const diffPct = item.expectedQuantity > 0 ? Math.abs(diff) / item.expectedQuantity : 0;
          const isDiscrepant = diffPct > 0.05;
          const qualityStatus = isDiscrepant
            ? diff < 0 ? "חוסר" : "עודף"
            : "תקין";
          const itemNotes = [
            item.barcode ? `נסרק: ${item.barcode}` : null,
            isDiscrepant ? `אי-התאמה: צפוי ${item.expectedQuantity} התקבל ${item.scannedQuantity} (${diff > 0 ? "+" : ""}${diff.toFixed(1)})` : null,
          ].filter(Boolean).join(" | ") || null;

          return tx.insert(goodsReceiptItemsTable).values({
            receiptId: receipt.id,
            materialId: item.materialId,
            orderItemId: item.poItemId || null,
            itemCode: item.itemCode || null,
            itemDescription: item.itemDescription,
            expectedQuantity: String(item.expectedQuantity),
            receivedQuantity: String(item.scannedQuantity),
            unit: item.unit,
            qualityStatus,
            notes: itemNotes,
          }).returning().then(rows => rows[0]);
        })
      );
    });

    onGoodsReceiptCompleted(receipt.id).catch(err =>
      console.error("[warehouse-intelligence] mobile-receipt completion cascade error:", err)
    );

    res.status(201).json({
      receipt,
      items: itemResults!,
      receiptNumber,
      discrepancies: hasDiscrepancy ? discrepancies.map(d => ({
        itemDescription: d.itemDescription,
        expectedQuantity: d.expectedQuantity,
        scannedQuantity: d.scannedQuantity,
        difference: d.scannedQuantity - d.expectedQuantity,
      })) : [],
      hasDiscrepancy,
    });
  } catch (err: unknown) {
    console.error("[warehouse-intelligence] mobile-receipt error:", err);
    res.status(400).json({ message: toErrorMessage(err) });
  }
});

router.get("/warehouse-intelligence/kpis", async (req, res) => {
  try {
    const warehouseFilter = req.query.warehouse ? String(req.query.warehouse) : null;
    const category = req.query.category ? String(req.query.category) : null;
    const days = req.query.days ? Math.max(7, Math.min(365, parseInt(String(req.query.days)) || 30)) : 30;

    const warehouseCond = warehouseFilter ? sql`AND rm.warehouse_location ILIKE ${'%' + warehouseFilter + '%'}` : sql``;
    const categoryCond = category ? sql`AND rm.category = ${category}` : sql``;

    const [stockResult, movementResult, receiptResult, orderAccuracyResult, zoneResult, deadStockResult] = await Promise.all([
      db.execute(sql`
        SELECT
          COUNT(*) as total_sku,
          COALESCE(SUM(rm.current_stock::numeric), 0) as total_qty,
          COALESCE(SUM(rm.current_stock::numeric * COALESCE(rm.average_cost::numeric, rm.standard_price::numeric, 0)), 0) as total_value,
          COUNT(*) FILTER (WHERE rm.current_stock::numeric <= COALESCE(rm.reorder_point::numeric, 0) AND rm.reorder_point::numeric > 0) as below_reorder,
          COUNT(*) FILTER (WHERE rm.current_stock::numeric = 0) as zero_stock,
          COUNT(*) FILTER (WHERE rm.maximum_stock IS NOT NULL AND rm.current_stock::numeric > rm.maximum_stock::numeric) as overstock
        FROM raw_materials rm
        WHERE rm.status = 'active'
        ${warehouseCond}
        ${categoryCond}
      `),
      db.execute(sql`
        SELECT
          COALESCE(SUM(ABS(it.quantity::numeric)) FILTER (WHERE it.transaction_type IN ('issue','consumption','production_issue')), 0) as consumed_qty,
          COALESCE(SUM(it.quantity::numeric) FILTER (WHERE it.transaction_type IN ('receipt','import_receipt')), 0) as received_qty,
          COUNT(DISTINCT it.material_id) as active_materials,
          COUNT(*) as total_transactions
        FROM inventory_transactions it
        JOIN raw_materials rm ON it.material_id = rm.id
        WHERE it.created_at >= NOW() - (${days} || ' days')::interval
        ${warehouseCond}
        ${categoryCond}
      `),
      db.execute(sql`
        SELECT
          AVG(EXTRACT(EPOCH FROM (gr.receipt_date::timestamp - po.order_date::timestamp)) / 86400) as avg_dock_to_stock_days,
          COUNT(gr.id) as receipt_count
        FROM goods_receipts gr
        JOIN purchase_orders po ON gr.order_id = po.id
        WHERE gr.created_at >= NOW() - (${days} || ' days')::interval
      `),
      db.execute(sql`
        SELECT
          COUNT(*) as total_orders,
          COUNT(*) FILTER (WHERE so.status = 'delivered' OR so.status = 'completed') as accurate_orders
        FROM sales_orders so
        WHERE so.created_at >= NOW() - (${days} || ' days')::interval
          AND so.status NOT IN ('cancelled', 'draft')
      `),
      db.execute(sql`
        SELECT
          COALESCE(rm.warehouse_location, 'לא מוגדר') as zone,
          COUNT(*) as sku_count,
          COALESCE(SUM(rm.current_stock::numeric), 0) as total_qty,
          COALESCE(SUM(rm.current_stock::numeric * COALESCE(rm.average_cost::numeric, rm.standard_price::numeric, 0)), 0) as total_value,
          COALESCE(AVG(
            CASE WHEN rm.maximum_stock IS NOT NULL AND rm.maximum_stock::numeric > 0
            THEN LEAST(100, rm.current_stock::numeric / rm.maximum_stock::numeric * 100)
            ELSE NULL END
          ), 0) as avg_fill_pct
        FROM raw_materials rm
        WHERE rm.status = 'active'
        ${warehouseCond}
        ${categoryCond}
        GROUP BY COALESCE(rm.warehouse_location, 'לא מוגדר')
        ORDER BY total_value DESC
        LIMIT 20
      `),
      db.execute(sql`
        SELECT COUNT(DISTINCT rm.id) as dead_sku_count,
          COALESCE(SUM(rm.current_stock::numeric * COALESCE(rm.average_cost::numeric, rm.standard_price::numeric, 0)), 0) as dead_stock_value,
          COALESCE(SUM(rm.current_stock::numeric), 0) as dead_stock_qty
        FROM raw_materials rm
        WHERE rm.current_stock::numeric > 0
          AND rm.status = 'active'
          AND NOT EXISTS (
            SELECT 1 FROM inventory_transactions it2
            WHERE it2.material_id = rm.id
              AND it2.transaction_type IN ('issue','consumption','production_issue')
              AND it2.created_at >= NOW() - INTERVAL '180 days'
          )
        ${warehouseCond}
        ${categoryCond}
      `),
    ]);

    interface StockRow { total_sku: string; total_qty: string; total_value: string; below_reorder: string; zero_stock: string; overstock: string; }
    interface MovRow { consumed_qty: string; received_qty: string; active_materials: string; total_transactions: string; }
    interface ReceiptRow { avg_dock_to_stock_days: string | null; receipt_count: string; }
    interface OrderRow { total_orders: string; accurate_orders: string; }
    interface ZoneRow { zone: string; sku_count: string; total_qty: string; total_value: string; avg_fill_pct: string; }
    interface DeadRow { dead_sku_count: string; dead_stock_value: string; dead_stock_qty: string; }

    const stock = sqlRows<StockRow>(stockResult)[0] ?? { total_sku: "0", total_qty: "0", total_value: "0", below_reorder: "0", zero_stock: "0", overstock: "0" };
    const mov = sqlRows<MovRow>(movementResult)[0] ?? { consumed_qty: "0", received_qty: "0", active_materials: "0", total_transactions: "0" };
    const receipt = sqlRows<ReceiptRow>(receiptResult)[0] ?? { avg_dock_to_stock_days: null, receipt_count: "0" };
    const orders = sqlRows<OrderRow>(orderAccuracyResult)[0] ?? { total_orders: "0", accurate_orders: "0" };
    const zones = sqlRows<ZoneRow>(zoneResult);
    const dead = sqlRows<DeadRow>(deadStockResult)[0] ?? { dead_sku_count: "0", dead_stock_value: "0", dead_stock_qty: "0" };

    const totalSku = parseInt(stock.total_sku) || 0;
    const totalValue = parseFloat(stock.total_value) || 0;
    const consumedQty = parseFloat(mov.consumed_qty) || 0;
    const receivedQty = parseFloat(mov.received_qty) || 0;
    const totalOrders = parseInt(orders.total_orders) || 0;
    const accurateOrders = parseInt(orders.accurate_orders) || 0;
    const deadSkuCount = parseInt(dead.dead_sku_count) || 0;
    const deadStockValue = parseFloat(dead.dead_stock_value) || 0;

    const carryingCost = totalValue * CARRYING_COST_RATE * (days / 365);
    const avgInventoryValue = totalValue;
    const cogsValue = consumedQty > 0 ? consumedQty * (avgInventoryValue / Math.max(parseFloat(stock.total_qty) || 1, 1)) : 0;
    const inventoryTurnover = avgInventoryValue > 0 ? (cogsValue / avgInventoryValue) * (365 / days) : 0;
    const fillRate = totalSku > 0 ? Math.max(0, (totalSku - parseInt(stock.zero_stock)) / totalSku * 100) : 100;
    const orderAccuracyRate = totalOrders > 0 ? (accurateOrders / totalOrders * 100) : 100;
    const deadStockPct = totalValue > 0 ? (deadStockValue / totalValue * 100) : 0;
    const carryingCostPct = totalValue > 0 ? (carryingCost / totalValue * 100) : 0;
    const dockToStockDays = receipt.avg_dock_to_stock_days ? parseFloat(receipt.avg_dock_to_stock_days) : null;

    res.json({
      fillRate: Math.round(fillRate * 10) / 10,
      inventoryTurnover: Math.round(inventoryTurnover * 100) / 100,
      carryingCostPct: Math.round(carryingCostPct * 10) / 10,
      carryingCostValue: Math.round(carryingCost),
      deadStockPct: Math.round(deadStockPct * 10) / 10,
      deadStockValue: Math.round(deadStockValue),
      deadSkuCount,
      orderAccuracyRate: Math.round(orderAccuracyRate * 10) / 10,
      dockToStockDays: dockToStockDays !== null ? Math.round(dockToStockDays * 10) / 10 : null,
      totalSku,
      totalValue: Math.round(totalValue),
      belowReorder: parseInt(stock.below_reorder) || 0,
      zeroStock: parseInt(stock.zero_stock) || 0,
      overstock: parseInt(stock.overstock) || 0,
      consumedQty: Math.round(consumedQty),
      receivedQty: Math.round(receivedQty),
      totalTransactions: parseInt(mov.total_transactions) || 0,
      zoneUtilization: zones.map(z => ({
        zone: z.zone,
        skuCount: parseInt(z.sku_count) || 0,
        totalQty: parseFloat(z.total_qty) || 0,
        totalValue: Math.round(parseFloat(z.total_value) || 0),
        avgFillPct: Math.round(parseFloat(z.avg_fill_pct) || 0),
      })),
      periodDays: days,
    });
  } catch (err: unknown) {
    console.error("[warehouse-intelligence] kpis error:", err);
    res.status(500).json({ message: toErrorMessage(err) });
  }
});

router.get("/warehouse-intelligence/kpi-trends", async (_req, res) => {
  try {
    const result = await db.execute(sql`
      SELECT
        DATE_TRUNC('week', it.created_at) as week,
        COALESCE(SUM(ABS(it.quantity::numeric)) FILTER (WHERE it.transaction_type IN ('issue','consumption','production_issue')), 0) as consumed,
        COALESCE(SUM(it.quantity::numeric) FILTER (WHERE it.transaction_type IN ('receipt','import_receipt')), 0) as received,
        COUNT(DISTINCT it.material_id) as active_skus,
        COUNT(*) as total_transactions
      FROM inventory_transactions it
      WHERE it.created_at >= NOW() - INTERVAL '90 days'
      GROUP BY DATE_TRUNC('week', it.created_at)
      ORDER BY week ASC
    `);

    interface TrendRow { week: string; consumed: string; received: string; active_skus: string; total_transactions: string; }
    const rows = sqlRows<TrendRow>(result);
    res.json(rows.map(r => ({
      week: r.week ? new Date(r.week).toLocaleDateString("he-IL") : "",
      consumed: Math.round(parseFloat(r.consumed) || 0),
      received: Math.round(parseFloat(r.received) || 0),
      activeSkus: parseInt(r.active_skus) || 0,
      totalTransactions: parseInt(r.total_transactions) || 0,
    })));
  } catch (err: unknown) {
    res.status(500).json({ message: toErrorMessage(err) });
  }
});

router.get("/warehouse-intelligence/dead-stock", async (req, res) => {
  try {
    const minDays = req.query.minDays ? Math.max(30, parseInt(String(req.query.minDays)) || 180) : 180;
    const result = await db.execute(sql`
      SELECT
        rm.id, rm.material_name, rm.material_number, rm.category,
        rm.current_stock, rm.unit,
        COALESCE(rm.average_cost, rm.standard_price, 0) as unit_cost,
        rm.warehouse_location,
        rm.current_stock::numeric * COALESCE(rm.average_cost::numeric, rm.standard_price::numeric, 0) as stock_value,
        MAX(it.created_at) as last_movement_date,
        EXTRACT(DAY FROM NOW() - MAX(it.created_at)) as days_since_movement
      FROM raw_materials rm
      LEFT JOIN inventory_transactions it ON it.material_id = rm.id
        AND it.transaction_type IN ('issue','consumption','production_issue')
      WHERE rm.current_stock::numeric > 0
        AND rm.status = 'active'
      GROUP BY rm.id, rm.material_name, rm.material_number, rm.category,
               rm.current_stock, rm.unit, rm.average_cost, rm.standard_price, rm.warehouse_location
      HAVING MAX(it.created_at) IS NULL
          OR MAX(it.created_at) < NOW() - (${minDays} || ' days')::interval
      ORDER BY stock_value DESC
      LIMIT 200
    `);

    interface DeadRow { id: string; material_name: string; material_number: string; category: string; current_stock: string; unit: string; unit_cost: string; warehouse_location: string; stock_value: string; last_movement_date: string | null; days_since_movement: string | null; }
    const rows = sqlRows<DeadRow>(result);
    res.json(rows.map(r => ({
      id: parseInt(r.id),
      materialName: r.material_name,
      materialNumber: r.material_number,
      category: r.category,
      currentStock: parseFloat(r.current_stock) || 0,
      unit: r.unit,
      unitCost: parseFloat(r.unit_cost) || 0,
      stockValue: Math.round(parseFloat(r.stock_value) || 0),
      warehouseLocation: r.warehouse_location,
      lastMovementDate: r.last_movement_date,
      daysSinceMovement: r.days_since_movement ? Math.round(parseFloat(r.days_since_movement)) : minDays,
      carryingCostAnnual: Math.round((parseFloat(r.stock_value) || 0) * 0.25),
    })));
  } catch (err: unknown) {
    res.status(500).json({ message: toErrorMessage(err) });
  }
});

router.get("/warehouse-intelligence/demand-forecast-view", async (req, res) => {
  try {
    const limit = req.query.limit ? Math.min(50, parseInt(String(req.query.limit)) || 20) : 20;
    const result = await db.execute(sql`
      SELECT
        df.id, df.material_id, df.forecast_period, df.forecast_date,
        df.forecast_qty, df.actual_qty, df.confidence_score,
        df.seasonal_factor, df.trend_factor, df.method, df.data_points_used, df.notes,
        df.created_at,
        rm.material_name, rm.material_number, rm.current_stock, rm.unit, rm.category,
        rm.lead_time_days, rm.reorder_point, rm.safety_stock
      FROM demand_forecasts df
      JOIN raw_materials rm ON df.material_id = rm.id
      WHERE df.forecast_date = (
        SELECT MAX(df2.forecast_date) FROM demand_forecasts df2 WHERE df2.material_id = df.material_id
      )
      ORDER BY df.confidence_score::numeric DESC NULLS LAST, df.created_at DESC
      LIMIT ${limit}
    `);

    interface FcastViewRow {
      id: string; material_id: string; forecast_period: string; forecast_date: string;
      forecast_qty: string; actual_qty: string | null; confidence_score: string;
      seasonal_factor: string; trend_factor: string; method: string; data_points_used: string; notes: string | null;
      created_at: string; material_name: string; material_number: string;
      current_stock: string; unit: string; category: string;
      lead_time_days: string | null; reorder_point: string | null; safety_stock: string | null;
    }

    const rows = sqlRows<FcastViewRow>(result);
    res.json(rows.map(r => ({
      id: parseInt(r.id),
      materialId: parseInt(r.material_id),
      materialName: r.material_name,
      materialNumber: r.material_number,
      category: r.category,
      unit: r.unit,
      currentStock: parseFloat(r.current_stock) || 0,
      forecastQty: parseFloat(r.forecast_qty) || 0,
      actualQty: r.actual_qty ? parseFloat(r.actual_qty) : null,
      confidenceScore: parseFloat(r.confidence_score) || 0,
      seasonalFactor: parseFloat(r.seasonal_factor) || 1,
      trendFactor: parseFloat(r.trend_factor) || 1,
      method: r.method,
      dataPointsUsed: parseInt(r.data_points_used) || 0,
      notes: r.notes,
      forecastDate: r.forecast_date,
      forecastPeriod: r.forecast_period,
      leadTimeDays: r.lead_time_days ? parseInt(r.lead_time_days) : null,
      reorderPoint: r.reorder_point ? parseFloat(r.reorder_point) : null,
      safetyStock: r.safety_stock ? parseFloat(r.safety_stock) : null,
      stockCoverDays: r.forecast_qty && parseFloat(r.forecast_qty) > 0
        ? Math.round((parseFloat(r.current_stock) || 0) / (parseFloat(r.forecast_qty) / 30))
        : null,
    })));
  } catch (err: unknown) {
    res.status(500).json({ message: toErrorMessage(err) });
  }
});

export default router;
