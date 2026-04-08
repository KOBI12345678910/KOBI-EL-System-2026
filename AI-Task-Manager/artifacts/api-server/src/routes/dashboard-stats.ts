import { Router, Request, Response } from "express";
import { pool } from "@workspace/db";

const router = Router();

let cachedStats: any = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 60_000;

/**
 * @openapi
 * /api/dashboard-stats:
 *   get:
 *     tags: [Dashboard & Reports]
 *     summary: סטטיסטיקות דשבורד ראשי — Main dashboard KPIs
 *     description: |
 *       מחזיר מדדים עיקריים לדשבורד: עובדים, הזמנות עבודה, חשבוניות, מלאי, נוכחות.
 *       תוצאות מאוחסנות במטמון ל-60 שניות לשיפור ביצועים.
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: נתוני דשבורד מרכזי
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 employees: { type: object }
 *                 workOrders: { type: object }
 *                 finance: { type: object }
 *                 inventory: { type: object }
 *                 attendance: { type: object }
 *       401: { description: "נדרשת התחברות" }
 */

router.get("/dashboard-stats", async (req: Request, res: Response) => {
  try {
    const now = Date.now();
    if (cachedStats && (now - cacheTimestamp) < CACHE_TTL_MS) {
      res.set("X-Cache", "HIT");
      return res.json(cachedStats);
    }

    const failedTables: string[] = [];

    const countTable = async (table: string, where = "1=1"): Promise<number> => {
      const r = await pool.query(`SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`);
      return Number(r.rows[0]?.n || 0);
    };

    const safeCount = async (table: string, where = "1=1"): Promise<number> => {
      try {
        return await countTable(table, where);
      } catch (err: any) {
        failedTables.push(`${table}: ${err.message}`);
        return 0;
      }
    };

    const [
      totalCustomers, totalProducts, totalSuppliers, totalOrders,
      totalWorkOrders, activeWorkOrders, totalPurchaseOrders,
      totalLeads, newLeads, totalEmployees, totalInvoices, totalMaterials,
      totalInstallations, totalNCR, totalEquipment, totalModules, totalEntities,
    ] = await Promise.all([
      safeCount("sales_customers"),
      safeCount("products"),
      safeCount("suppliers"),
      safeCount("sales_orders"),
      safeCount("work_orders"),
      safeCount("work_orders", "status IN ('in_production','quality_check','in_progress','בביצוע') AND deleted_at IS NULL"),
      safeCount("purchase_orders"),
      safeCount("crm_leads"),
      safeCount("crm_leads", "status = 'new' OR status = 'חדש'"),
      safeCount("employees"),
      safeCount("customer_invoices"),
      safeCount("raw_materials"),
      safeCount("installation_orders"),
      safeCount("non_conformance_reports"),
      safeCount("equipment"),
      safeCount("platform_modules"),
      safeCount("module_entities"),
    ]);

    if (failedTables.length > 0) {
      console.error("[dashboard-stats] Query failures (check DB schema):", failedTables);
      return res.status(502).json({
        error: "One or more dashboard queries failed",
        failedTables,
      });
    }

    cachedStats = {
      totalCustomers, totalProducts, totalSuppliers, totalOrders,
      totalWorkOrders, activeWorkOrders, totalPurchaseOrders,
      totalLeads, newLeads, totalEmployees, totalInvoices, totalMaterials,
      totalInstallations, totalNCR, totalEquipment, totalModules, totalEntities,
    };

    cacheTimestamp = now;
    res.set("X-Cache", "MISS");
    res.json(cachedStats);
  } catch (err: any) {
    console.error("[dashboard-stats] Unexpected error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
