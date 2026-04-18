import { Router, Request, Response } from "express";
import { pool } from "@workspace/db";

const router = Router();

let cachedStats: any = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 60_000;

router.get("/dashboard-stats", async (req: Request, res: Response) => {
  try {
    const now = Date.now();
    if (cachedStats && (now - cacheTimestamp) < CACHE_TTL_MS) {
      res.set("X-Cache", "HIT");
      return res.json(cachedStats);
    }

    const result = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM customers) AS total_customers,
        (SELECT COUNT(*) FROM products) AS total_products,
        (SELECT COUNT(*) FROM suppliers) AS total_suppliers,
        (SELECT COUNT(*) FROM sales_orders) AS total_orders,
        (SELECT COUNT(*) FROM work_orders) AS total_work_orders,
        (SELECT COUNT(*) FROM work_orders WHERE status IN ('in_progress','active','started')) AS active_work_orders,
        (SELECT COUNT(*) FROM purchase_orders) AS total_purchase_orders,
        (SELECT COUNT(*) FROM crm_leads) AS total_leads,
        (SELECT COUNT(*) FROM crm_leads WHERE status = 'new') AS new_leads,
        (SELECT COUNT(*) FROM employees) AS total_employees,
        (SELECT COUNT(*) FROM customer_invoices) AS total_invoices,
        (SELECT COUNT(*) FROM raw_materials) AS total_materials,
        (SELECT COUNT(*) FROM installations) AS total_installations,
        (SELECT COUNT(*) FROM non_conformance_reports) AS total_ncr,
        (SELECT COUNT(*) FROM equipment) AS total_equipment,
        (SELECT COUNT(*) FROM platform_modules) AS total_modules,
        (SELECT COUNT(*) FROM module_entities) AS total_entities
    `);

    const row = result.rows[0] || {};
    cachedStats = {
      totalCustomers: Number(row.total_customers || 0),
      totalProducts: Number(row.total_products || 0),
      totalSuppliers: Number(row.total_suppliers || 0),
      totalOrders: Number(row.total_orders || 0),
      totalWorkOrders: Number(row.total_work_orders || 0),
      activeWorkOrders: Number(row.active_work_orders || 0),
      totalPurchaseOrders: Number(row.total_purchase_orders || 0),
      totalLeads: Number(row.total_leads || 0),
      newLeads: Number(row.new_leads || 0),
      totalEmployees: Number(row.total_employees || 0),
      totalInvoices: Number(row.total_invoices || 0),
      totalMaterials: Number(row.total_materials || 0),
      totalInstallations: Number(row.total_installations || 0),
      totalNCR: Number(row.total_ncr || 0),
      totalEquipment: Number(row.total_equipment || 0),
      totalModules: Number(row.total_modules || 0),
      totalEntities: Number(row.total_entities || 0),
    };
    cacheTimestamp = now;
    res.set("X-Cache", "MISS");
    res.json(cachedStats);
  } catch (err: any) {
    console.error("[dashboard-stats]", err.message);
    res.status(500).json({ error: "Failed to fetch dashboard stats" });
  }
});

export default router;