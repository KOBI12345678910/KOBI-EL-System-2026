import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { rawMaterialsTable, supplierMaterialsTable, materialCategoriesTable, inventoryAlertsTable } from "@workspace/db/schema";
import { eq, ilike, or, desc, sql, and, lt, gt, isNull } from "drizzle-orm";
import { z } from "zod/v4";

const router: IRouter = Router();

const CreateMaterialBody = z.object({
  materialNumber: z.string().min(1),
  materialName: z.string().min(1),
  category: z.string().optional(),
  subCategory: z.string().optional(),
  unit: z.string().optional(),
  description: z.string().optional(),
  minimumStock: z.string().optional(),
  currentStock: z.string().optional(),
  maximumStock: z.string().optional(),
  reorderPoint: z.string().optional(),
  standardPrice: z.string().optional(),
  currency: z.string().optional(),
  weightPerUnit: z.string().optional(),
  weightPerMeter: z.string().optional(),
  dimensions: z.string().optional(),
  materialGrade: z.string().optional(),
  materialType: z.string().optional(),
  finish: z.string().optional(),
  thickness: z.string().optional(),
  width: z.string().optional(),
  height: z.string().optional(),
  warehouseLocation: z.string().optional(),
  lastCountDate: z.string().optional(),
  lastCountQuantity: z.string().optional(),
  abcClassification: z.string().optional(),
  annualUsageValue: z.string().optional(),
  leadTimeDays: z.coerce.number().int().nonnegative().optional().nullable(),
  lastReceiptDate: z.string().optional(),
  lastIssueDate: z.string().optional(),
  supplierId: z.coerce.number().int().positive().optional().nullable(),
  status: z.string().optional(),
  notes: z.string().optional(),
  rodLength: z.string().optional(),
  pricingMethod: z.string().optional(),
  pricePerMeter: z.string().optional(),
  pricePerKg: z.string().optional(),
  packageQuantity: z.string().optional(),
  totalPriceBeforeVat: z.string().optional(),
  totalPriceAfterVat: z.string().optional(),
  diameter: z.string().optional(),
  innerDiameter: z.string().optional(),
  innerType: z.string().optional(),
  standard: z.string().optional(),
  countryOfOrigin: z.string().optional(),
  color: z.string().optional(),
  minimumOrder: z.string().optional(),
  deliveryDays: z.coerce.number().int().nonnegative().optional().nullable(),
  warrantyMonths: z.coerce.number().int().nonnegative().optional().nullable(),
});

function cleanMaterialData(body: any) {
  const cleaned = { ...body };
  for (const key of ["lastCountDate", "lastReceiptDate", "lastIssueDate"]) {
    if (cleaned[key] === "") cleaned[key] = null;
  }
  for (const key of [
    "minimumStock", "maximumStock", "reorderPoint", "standardPrice", "weightPerUnit",
    "weightPerMeter", "lastCountQuantity", "annualUsageValue", "rodLength", "pricePerMeter",
    "pricePerKg", "packageQuantity", "totalPriceBeforeVat", "totalPriceAfterVat",
    "diameter", "innerDiameter", "minimumOrder", "thickness", "width", "height",
  ]) {
    if (cleaned[key] === "") cleaned[key] = undefined;
  }
  if (cleaned.leadTimeDays === "") cleaned.leadTimeDays = undefined;
  if (cleaned.deliveryDays === "") cleaned.deliveryDays = undefined;
  if (cleaned.warrantyMonths === "") cleaned.warrantyMonths = undefined;
  if (cleaned.supplierId === "") cleaned.supplierId = undefined;
  return cleaned;
}

router.get("/raw-materials/stats", async (_req, res) => {
  try {
    const materials = await db.select().from(rawMaterialsTable).where(isNull(rawMaterialsTable.deletedAt));
    const stats = {
      total: materials.length,
      lowStock: materials.filter(m => m.currentStock && m.reorderPoint && parseFloat(String(m.currentStock)) <= parseFloat(String(m.reorderPoint))).length,
      outOfStock: materials.filter(m => !m.currentStock || parseFloat(String(m.currentStock)) <= 0).length,
      byCategory: {} as Record<string, number>,
      totalValue: materials.reduce((sum, m) => sum + (parseFloat(String(m.currentStock || "0")) * parseFloat(String(m.unitPrice || "0"))), 0),
    };
    materials.forEach(m => {
      if (m.category) stats.byCategory[m.category] = (stats.byCategory[m.category] || 0) + 1;
    });
    res.json(stats);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

router.get("/raw-materials", async (req, res) => {
  try {
    const { search, category, subCategory, materialType, finish: finishFilter, include_deleted } = req.query;
    const includeDeleted = include_deleted === "true";
    let query = db.select().from(rawMaterialsTable).orderBy(desc(rawMaterialsTable.createdAt)).$dynamic();
    const conditions: any[] = [];
    if (!includeDeleted) conditions.push(isNull(rawMaterialsTable.deletedAt));
    if (search && typeof search === "string" && search.trim()) {
      conditions.push(
        or(
          ilike(rawMaterialsTable.materialName, `%${search}%`),
          ilike(rawMaterialsTable.materialNumber, `%${search}%`),
          ilike(rawMaterialsTable.category, `%${search}%`),
          ilike(rawMaterialsTable.subCategory, `%${search}%`)
        )
      );
    }
    if (conditions.length > 0) query = query.where(and(...conditions));
    const materials = await query;
    let filtered = materials;
    if (category && typeof category === "string" && category !== "all") {
      filtered = filtered.filter((m) => m.category === category);
    }
    if (subCategory && typeof subCategory === "string" && subCategory !== "all") {
      filtered = filtered.filter((m) => m.subCategory === subCategory);
    }
    if (materialType && typeof materialType === "string" && materialType !== "all") {
      filtered = filtered.filter((m) => m.materialType === materialType || m.materialGrade === materialType);
    }
    if (finishFilter && typeof finishFilter === "string" && finishFilter !== "all") {
      filtered = filtered.filter((m) => m.finish === finishFilter);
    }
    res.json(filtered);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

router.get("/raw-materials/expiry-alerts", async (_req, res) => {
  try {
    const result = await db.execute(
      sql`SELECT id, material_number, material_name, category, unit,
              COALESCE(sku,'') as sku, current_stock, shelf_life_days,
              last_receipt_date, warehouse_location,
              (last_receipt_date::date + shelf_life_days * INTERVAL '1 day')::date as expiry_date,
              ((last_receipt_date::date + shelf_life_days * INTERVAL '1 day')::date - CURRENT_DATE) as days_until_expiry
          FROM raw_materials
          WHERE deleted_at IS NULL
            AND shelf_life_days IS NOT NULL AND shelf_life_days > 0
            AND last_receipt_date IS NOT NULL
            AND COALESCE(current_stock, 0) > 0
          ORDER BY (last_receipt_date::date + shelf_life_days * INTERVAL '1 day')::date ASC`
    );
    const rows = (result as any).rows || [];
    const expired = rows.filter((r: any) => Number(r.days_until_expiry) <= 0);
    const expiringSoon = rows.filter((r: any) => {
      const d = Number(r.days_until_expiry);
      return d > 0 && d <= 30;
    });
    const ok = rows.filter((r: any) => Number(r.days_until_expiry) > 30);
    res.json({
      expired, expiringSoon, ok,
      summary: { totalTracked: rows.length, expiredCount: expired.length, expiringSoonCount: expiringSoon.length, okCount: ok.length }
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

router.get("/raw-materials/low-stock-alerts", async (_req, res) => {
  try {
    const result = await db.execute(
      sql`SELECT id, material_number, material_name, category, unit,
              COALESCE(sku,'') as sku, current_stock, minimum_stock,
              safety_stock, reorder_point, warehouse_location,
              last_receipt_date, last_issue_date,
              CASE
                WHEN COALESCE(current_stock,0) = 0 THEN 'out_of_stock'
                WHEN COALESCE(current_stock,0) <= COALESCE(safety_stock,0) THEN 'critical'
                WHEN COALESCE(current_stock,0) <= COALESCE(minimum_stock,0) THEN 'low'
                WHEN COALESCE(current_stock,0) <= COALESCE(reorder_point,0) THEN 'reorder'
                ELSE 'ok'
              END as stock_status
          FROM raw_materials
          WHERE deleted_at IS NULL
            AND (COALESCE(minimum_stock,0) > 0 OR COALESCE(reorder_point,0) > 0 OR COALESCE(safety_stock,0) > 0)
            AND COALESCE(current_stock,0) <= GREATEST(COALESCE(minimum_stock,0), COALESCE(reorder_point,0))
          ORDER BY CASE WHEN COALESCE(current_stock,0) = 0 THEN 0 WHEN COALESCE(current_stock,0) <= COALESCE(safety_stock,0) THEN 1 WHEN COALESCE(current_stock,0) <= COALESCE(minimum_stock,0) THEN 2 ELSE 3 END, current_stock ASC`
    );
    const rows = (result as any).rows || [];
    const outOfStock = rows.filter((r: any) => r.stock_status === "out_of_stock");
    const critical = rows.filter((r: any) => r.stock_status === "critical");
    const low = rows.filter((r: any) => r.stock_status === "low");
    const reorder = rows.filter((r: any) => r.stock_status === "reorder");
    res.json({
      items: rows, outOfStock, critical, low, reorder,
      summary: { totalAlerts: rows.length, outOfStockCount: outOfStock.length, criticalCount: critical.length, lowCount: low.length, reorderCount: reorder.length }
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

router.get("/raw-materials/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const [material] = await db.select().from(rawMaterialsTable).where(and(eq(rawMaterialsTable.id, id), isNull(rawMaterialsTable.deletedAt)));
    if (!material) return res.status(404).json({ message: "Material not found" });
    res.json(material);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

router.post("/raw-materials", async (req, res) => {
  try {
    const body = CreateMaterialBody.parse(req.body);
    const [material] = await db.insert(rawMaterialsTable).values(cleanMaterialData(body)).returning();
    res.status(201).json(material);
  } catch (error: any) {
    if (error.message?.includes("duplicate") || error.message?.includes("unique") || error.message?.includes("material_number")) {
      return res.status(409).json({ message: "מספר חומר כבר קיים במערכת" });
    }
    res.status(400).json({ message: error.message });
  }
});

router.put("/raw-materials/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const body = CreateMaterialBody.partial().parse(req.body);
    const [material] = await db.update(rawMaterialsTable).set({ ...cleanMaterialData(body), updatedAt: new Date() }).where(eq(rawMaterialsTable.id, id)).returning();
    if (!material) return res.status(404).json({ message: "Material not found" });
    res.json(material);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

router.delete("/raw-materials/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const [updated] = await db.update(rawMaterialsTable)
      .set({ deletedAt: new Date() })
      .where(and(eq(rawMaterialsTable.id, id), isNull(rawMaterialsTable.deletedAt)))
      .returning();
    if (!updated) return res.status(404).json({ message: "Material not found" });
    res.json({ message: "Deleted" });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

router.post("/raw-materials/bulk", async (req, res) => {
  try {
    const BulkBody = z.object({
      materials: z.array(CreateMaterialBody).min(1),
    });
    const { materials } = BulkBody.parse(req.body);
    const inserted = await db
      .insert(rawMaterialsTable)
      .values(materials.map(m => cleanMaterialData(m)))
      .returning();
    res.status(201).json(inserted);
  } catch (error: any) {
    if (error.message?.includes("duplicate") || error.message?.includes("unique") || error.message?.includes("material_number")) {
      return res.status(409).json({ message: "אחד או יותר ממספרי החומרים כבר קיימים במערכת" });
    }
    res.status(400).json({ message: error.message });
  }
});

router.get("/raw-materials/:materialId/suppliers", async (req, res) => {
  try {
    const materialId = z.coerce.number().int().positive().parse(req.params.materialId);
    const suppliers = await db.select().from(supplierMaterialsTable).where(eq(supplierMaterialsTable.materialId, String(materialId)));
    res.json(suppliers);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

router.post("/raw-materials/:materialId/suppliers", async (req, res) => {
  try {
    const materialId = z.coerce.number().int().positive().parse(req.params.materialId);
    const body = z.object({
      supplierId: z.coerce.number().int().positive(),
      supplierMaterialCode: z.string().optional(),
      supplierPrice: z.string().optional(),
      currency: z.string().optional(),
      leadTimeDays: z.string().optional(),
      minimumOrderQty: z.string().optional(),
      isPreferred: z.string().optional(),
      notes: z.string().optional(),
    }).parse(req.body);
    const [sm] = await db.insert(supplierMaterialsTable).values({ ...body, materialId: String(materialId), supplierId: String(body.supplierId) }).returning();
    res.status(201).json(sm);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

router.delete("/supplier-materials/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    await db.delete(supplierMaterialsTable).where(eq(supplierMaterialsTable.id, id));
    res.json({ message: "Deleted" });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

router.get("/material-categories", async (req, res) => {
  try {
    const categories = await db.select().from(materialCategoriesTable).orderBy(materialCategoriesTable.sortOrder, materialCategoriesTable.name);
    res.json(categories);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

router.post("/material-categories", async (req, res) => {
  try {
    const body = z.object({
      name: z.string().min(1),
      parentCategory: z.string().optional(),
      description: z.string().optional(),
      sortOrder: z.coerce.number().int().optional(),
    }).parse(req.body);
    const [cat] = await db.insert(materialCategoriesTable).values(body).returning();
    res.status(201).json(cat);
  } catch (error: any) {
    if (error.message?.includes("unique")) {
      return res.status(409).json({ message: "קטגוריה זו כבר קיימת" });
    }
    res.status(400).json({ message: error.message });
  }
});

router.delete("/material-categories/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    await db.delete(materialCategoriesTable).where(eq(materialCategoriesTable.id, id));
    res.json({ message: "Deleted" });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

router.get("/inventory-alerts", async (_req, res) => {
  try {
    const alerts = await db
      .select({
        id: inventoryAlertsTable.id,
        materialId: inventoryAlertsTable.materialId,
        materialName: rawMaterialsTable.materialName,
        materialNumber: rawMaterialsTable.materialNumber,
        category: rawMaterialsTable.category,
        warehouseLocation: rawMaterialsTable.warehouseLocation,
        alertType: inventoryAlertsTable.alertType,
        severity: inventoryAlertsTable.severity,
        currentStock: inventoryAlertsTable.currentStock,
        thresholdValue: inventoryAlertsTable.thresholdValue,
        message: inventoryAlertsTable.message,
        status: inventoryAlertsTable.status,
        acknowledgedBy: inventoryAlertsTable.acknowledgedBy,
        acknowledgedAt: inventoryAlertsTable.acknowledgedAt,
        resolvedAt: inventoryAlertsTable.resolvedAt,
        autoPoGenerated: inventoryAlertsTable.autoPoGenerated,
        suggestedOrderQty: inventoryAlertsTable.suggestedOrderQty,
        createdAt: inventoryAlertsTable.createdAt,
      })
      .from(inventoryAlertsTable)
      .leftJoin(rawMaterialsTable, eq(inventoryAlertsTable.materialId, rawMaterialsTable.id))
      .orderBy(
        sql`CASE WHEN ${inventoryAlertsTable.severity} = 'critical' THEN 1 WHEN ${inventoryAlertsTable.severity} = 'warning' THEN 2 ELSE 3 END`,
        desc(inventoryAlertsTable.createdAt)
      );

    const summary = {
      total: alerts.length,
      active: alerts.filter(a => a.status === 'active').length,
      critical: alerts.filter(a => a.severity === 'critical' && a.status === 'active').length,
      warning: alerts.filter(a => a.severity === 'warning' && a.status === 'active').length,
      acknowledged: alerts.filter(a => a.status === 'acknowledged').length,
      resolved: alerts.filter(a => a.status === 'resolved').length,
    };

    res.json({ alerts, summary });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

router.patch("/inventory-alerts/:id/acknowledge", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const { acknowledgedBy } = req.body;
    const [updated] = await db
      .update(inventoryAlertsTable)
      .set({ status: "acknowledged", acknowledgedBy, acknowledgedAt: new Date(), updatedAt: new Date() })
      .where(eq(inventoryAlertsTable.id, id))
      .returning();
    res.json(updated);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

router.patch("/inventory-alerts/:id/resolve", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const [updated] = await db
      .update(inventoryAlertsTable)
      .set({ status: "resolved", resolvedAt: new Date(), updatedAt: new Date() })
      .where(eq(inventoryAlertsTable.id, id))
      .returning();
    res.json(updated);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

router.get("/inventory-alerts/check", async (_req, res) => {
  try {
    const belowMin = await db.execute(sql`
      SELECT id, material_name, current_stock, minimum_stock, reorder_point, warehouse_location
      FROM raw_materials 
      WHERE current_stock::numeric < minimum_stock::numeric AND status IN ('פעיל', 'active')
    `);
    const belowReorder = await db.execute(sql`
      SELECT id, material_name, current_stock, reorder_point, warehouse_location
      FROM raw_materials 
      WHERE current_stock::numeric >= minimum_stock::numeric 
        AND current_stock::numeric < reorder_point::numeric AND status IN ('פעיל', 'active')
    `);
    const aboveMax = await db.execute(sql`
      SELECT id, material_name, current_stock, maximum_stock, warehouse_location
      FROM raw_materials 
      WHERE maximum_stock IS NOT NULL AND maximum_stock::numeric > 0
        AND current_stock::numeric > maximum_stock::numeric AND status IN ('פעיל', 'active')
    `);
    res.json({
      belowMinimum: belowMin.rows,
      belowReorder: belowReorder.rows,
      aboveMaximum: aboveMax.rows,
      summary: {
        criticalCount: belowMin.rows.length,
        warningCount: belowReorder.rows.length,
        infoCount: aboveMax.rows.length,
      }
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
