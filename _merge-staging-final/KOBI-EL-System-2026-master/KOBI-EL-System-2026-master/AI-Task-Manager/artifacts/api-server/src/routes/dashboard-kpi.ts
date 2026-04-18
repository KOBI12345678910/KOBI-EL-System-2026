import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const router: IRouter = Router();

let kpiCache: { data: any; ts: number } | null = null;
const KPI_CACHE_TTL = 60_000;

const chartCache = new Map<string, { data: any; ts: number }>();
const CHART_CACHE_TTL = 120_000;

export function clearKpiCache() {
  kpiCache = null;
  chartCache.clear();
}
function getCachedChart(key: string) {
  const c = chartCache.get(key);
  return c && Date.now() - c.ts < CHART_CACHE_TTL ? c.data : null;
}
function setCachedChart(key: string, data: any) {
  chartCache.set(key, { data, ts: Date.now() });
  if (chartCache.size > 50) {
    const oldest = chartCache.keys().next().value;
    if (oldest) chartCache.delete(oldest);
  }
}

router.get("/dashboard/kpis", async (_req, res) => {
  try {
    if (kpiCache && Date.now() - kpiCache.ts < KPI_CACHE_TTL) {
      res.setHeader("X-Cache", "HIT");
      return res.json(kpiCache.data);
    }
    const [
      salesR, purchaseR, workR, employeeR, customerR, supplierR, productR,
      invoiceR, projectR, leadR, materialR, inventoryR, maintenanceR,
      qualityR, supportR, auditR
    ] = await Promise.all([
      db.execute(sql`
        SELECT COUNT(*)::int as total,
          COUNT(*) FILTER (WHERE status NOT IN ('cancelled', 'draft', 'מבוטל'))::int as active,
          COUNT(*) FILTER (WHERE status = 'הושלם' OR status = 'completed')::int as completed,
          COALESCE(SUM(CASE WHEN status NOT IN ('cancelled', 'draft', 'מבוטל') THEN COALESCE(total, 0) ELSE 0 END), 0)::numeric as total_value,
          COALESCE(SUM(CASE WHEN created_at >= NOW() - INTERVAL '30 days' AND status NOT IN ('cancelled', 'draft', 'מבוטל') THEN COALESCE(total, 0) ELSE 0 END), 0)::numeric as monthly_value,
          COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days' AND status NOT IN ('cancelled', 'draft', 'מבוטל'))::int as monthly_count,
          COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days' AND status NOT IN ('cancelled', 'draft', 'מבוטל'))::int as weekly_count
        FROM sales_orders
        WHERE deleted_at IS NULL
      `),
      db.execute(sql`
        SELECT COUNT(*)::int as total,
          COUNT(*) FILTER (WHERE status IN ('חדש', 'בתהליך', 'active', 'pending'))::int as active,
          COUNT(*) FILTER (WHERE status IN ('הושלם', 'completed', 'received'))::int as completed,
          COALESCE(SUM(total_amount), 0)::numeric as total_value,
          COALESCE(SUM(CASE WHEN created_at >= NOW() - INTERVAL '30 days' THEN total_amount ELSE 0 END), 0)::numeric as monthly_value,
          COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days')::int as monthly_count
        FROM purchase_orders
        WHERE deleted_at IS NULL
      `),
      db.execute(sql`
        SELECT COUNT(*)::int as total,
          COUNT(*) FILTER (WHERE status IN ('בביצוע', 'in_progress', 'active'))::int as in_progress,
          COUNT(*) FILTER (WHERE status IN ('מתוכנן', 'planned', 'חדש'))::int as planned,
          COUNT(*) FILTER (WHERE status IN ('הושלם', 'completed'))::int as completed,
          COUNT(*) FILTER (WHERE status IN ('מושהה', 'on_hold'))::int as on_hold,
          COUNT(*) FILTER (WHERE priority IN ('דחוף', 'קריטי', 'urgent', 'critical'))::int as critical,
          COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days')::int as monthly_count
        FROM work_orders
        WHERE deleted_at IS NULL
      `),
      db.execute(sql`
        SELECT COUNT(*)::int as total,
          COUNT(*) FILTER (WHERE status = 'פעיל' OR status = 'active')::int as active,
          COUNT(*) FILTER (WHERE start_date >= NOW() - INTERVAL '90 days')::int as new_hires
        FROM employees
        WHERE deleted_at IS NULL
      `),
      db.execute(sql`
        SELECT COUNT(*)::int as total,
          COUNT(*) FILTER (WHERE status = 'פעיל' OR status = 'active')::int as active,
          COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days')::int as new_monthly
        FROM sales_customers
        WHERE deleted_at IS NULL
      `),
      db.execute(sql`
        SELECT COUNT(*)::int as total,
          COUNT(*) FILTER (WHERE status = 'פעיל' OR status = 'active')::int as active
        FROM suppliers
        WHERE deleted_at IS NULL
      `),
      db.execute(sql`
        SELECT COUNT(*)::int as total,
          COUNT(*) FILTER (WHERE is_active = true OR status IN ('פעיל', 'active'))::int as active
        FROM products
        WHERE deleted_at IS NULL
      `),
      db.execute(sql`
        SELECT
          COUNT(*)::int as total,
          COUNT(*) FILTER (WHERE status IN ('באיחור', 'overdue'))::int as overdue_count,
          COALESCE(SUM(total_amount), 0)::numeric as total_value,
          COALESCE(SUM(CASE WHEN status IN ('שולם', 'paid', 'הושלם', 'completed') THEN total_amount ELSE 0 END), 0)::numeric as paid_value,
          COUNT(*) FILTER (WHERE status IN ('שולם', 'paid', 'הושלם', 'completed'))::int as paid_count,
          COALESCE(SUM(CASE WHEN created_at >= NOW() - INTERVAL '30 days' THEN total_amount ELSE 0 END), 0)::numeric as monthly_value
        FROM customer_invoices
        WHERE deleted_at IS NULL
      `),
      db.execute(sql`
        SELECT COUNT(*)::int as total,
          COUNT(*) FILTER (WHERE status IN ('פעיל', 'active', 'בביצוע'))::int as active,
          COUNT(*) FILTER (WHERE status IN ('הושלם', 'completed'))::int as completed,
          COALESCE(SUM(estimated_cost), 0)::numeric as total_budget
        FROM projects
        WHERE deleted_at IS NULL
      `),
      db.execute(sql`
        SELECT COUNT(*)::int as total,
          COUNT(*) FILTER (WHERE status IN ('חדש', 'new', 'open'))::int as new_leads,
          COUNT(*) FILTER (WHERE status IN ('בטיפול', 'contacted', 'in_progress'))::int as in_progress,
          COUNT(*) FILTER (WHERE status IN ('הומר', 'converted', 'won'))::int as converted,
          COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days')::int as monthly_count
        FROM crm_leads
      `),
      db.execute(sql`
        SELECT COUNT(*)::int as total,
          COUNT(*) FILTER (WHERE current_stock IS NOT NULL AND reorder_point IS NOT NULL AND current_stock::numeric <= reorder_point::numeric)::int as low_stock
        FROM raw_materials
        WHERE deleted_at IS NULL
      `),
      db.execute(sql`
        SELECT COUNT(*)::int as total,
          COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days')::int as monthly_count
        FROM inventory_transactions
        WHERE deleted_at IS NULL
      `),
      db.execute(sql`
        SELECT COUNT(*)::int as total,
          COUNT(*) FILTER (WHERE status IN ('פתוח', 'open', 'בביצוע', 'in_progress'))::int as open_orders,
          COUNT(*) FILTER (WHERE status IN ('הושלם', 'completed'))::int as completed
        FROM maintenance_orders
      `),
      db.execute(sql`
        SELECT COUNT(*)::int as total,
          COUNT(*) FILTER (WHERE result IN ('עבר', 'passed'))::int as passed,
          COUNT(*) FILTER (WHERE result IN ('נכשל', 'failed'))::int as failed
        FROM quality_inspections
      `),
      db.execute(sql`
        SELECT COUNT(*)::int as total,
          COUNT(*) FILTER (WHERE status IN ('פתוח', 'open'))::int as open_tickets,
          COUNT(*) FILTER (WHERE status IN ('סגור', 'closed', 'הושלם'))::int as resolved
        FROM support_tickets
      `),
      db.execute(sql`
        SELECT COUNT(*)::int as total,
          COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours')::int as last_24h,
          COUNT(*) FILTER (WHERE action = 'INSERT')::int as inserts,
          COUNT(*) FILTER (WHERE action = 'UPDATE')::int as updates,
          COUNT(*) FILTER (WHERE action = 'DELETE')::int as deletes
        FROM audit_log
      `),
    ]);

    const payload = {
      sales: salesR.rows[0],
      purchases: purchaseR.rows[0],
      workOrders: workR.rows[0],
      employees: employeeR.rows[0],
      customers: customerR.rows[0],
      suppliers: supplierR.rows[0],
      products: productR.rows[0],
      invoices: invoiceR.rows[0],
      projects: projectR.rows[0],
      leads: leadR.rows[0],
      materials: materialR.rows[0],
      inventory: inventoryR.rows[0],
      maintenance: maintenanceR.rows[0],
      quality: qualityR.rows[0],
      support: supportR.rows[0],
      audit: auditR.rows[0],
    };
    kpiCache = { data: payload, ts: Date.now() };
    res.setHeader("X-Cache", "MISS");
    res.json(payload);
  } catch (err: any) {
    console.error("Dashboard KPI error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get("/dashboard/charts/sales-monthly", async (_req, res) => {
  try {
    const cached = getCachedChart("sales-monthly");
    if (cached) return res.json(cached);
    const result = await db.execute(sql`
      SELECT TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') as month,
        COUNT(*)::int as count,
        COALESCE(SUM(total), 0)::numeric as value
      FROM sales_orders
      WHERE created_at >= NOW() - INTERVAL '12 months'
      GROUP BY DATE_TRUNC('month', created_at)
      ORDER BY month
    `);
    setCachedChart("sales-monthly", result.rows);
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/dashboard/charts/revenue-expenses", async (_req, res) => {
  try {
    const cached = getCachedChart("revenue-expenses");
    if (cached) return res.json(cached);
    const [revenueR, expenseR] = await Promise.all([
      db.execute(sql`
        SELECT TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') as month,
          COALESCE(SUM(total), 0)::numeric as value
        FROM sales_orders
        WHERE created_at >= NOW() - INTERVAL '12 months'
          AND status NOT IN ('cancelled', 'draft', 'מבוטל')
        GROUP BY DATE_TRUNC('month', created_at)
        ORDER BY month
      `),
      db.execute(sql`
        SELECT TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') as month,
          COALESCE(SUM(total_amount), 0)::numeric as value
        FROM purchase_orders
        WHERE created_at >= NOW() - INTERVAL '12 months'
        GROUP BY DATE_TRUNC('month', created_at)
        ORDER BY month
      `),
    ]);

    const months = new Set<string>();
    revenueR.rows.forEach((r: any) => months.add(r.month));
    expenseR.rows.forEach((r: any) => months.add(r.month));

    const revenueMap: Record<string, number> = {};
    const expenseMap: Record<string, number> = {};
    revenueR.rows.forEach((r: any) => { revenueMap[r.month] = Number(r.value); });
    expenseR.rows.forEach((r: any) => { expenseMap[r.month] = Number(r.value); });

    const data = Array.from(months).sort().map(m => ({
      month: m,
      revenue: revenueMap[m] || 0,
      expenses: expenseMap[m] || 0,
      profit: (revenueMap[m] || 0) - (expenseMap[m] || 0),
    }));

    setCachedChart("revenue-expenses", data);
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/dashboard/charts/work-orders-status", async (_req, res) => {
  try {
    const cached = getCachedChart("wo-status");
    if (cached) return res.json(cached);
    const result = await db.execute(sql`
      SELECT 
        COALESCE(status, 'לא ידוע') as name,
        COUNT(*)::int as value
      FROM work_orders
      WHERE deleted_at IS NULL
      GROUP BY status
      ORDER BY value DESC
    `);
    setCachedChart("wo-status", result.rows);
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/dashboard/charts/departments", async (_req, res) => {
  try {
    const cached = getCachedChart("departments");
    if (cached) return res.json(cached);
    const result = await db.execute(sql`
      SELECT COALESCE(department, 'לא משויך') as name,
        COUNT(*)::int as value
      FROM employees
      WHERE status IN ('פעיל', 'active')
      GROUP BY department
      ORDER BY value DESC
      LIMIT 10
    `);
    setCachedChart("departments", result.rows);
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/dashboard/charts/recent-activity", async (_req, res) => {
  try {
    const cached = getCachedChart("recent-activity");
    if (cached) return res.json(cached);
    const result = await db.execute(sql`
      SELECT DATE(created_at) as date,
        COUNT(*)::int as total,
        COUNT(*) FILTER (WHERE action = 'INSERT')::int as inserts,
        COUNT(*) FILTER (WHERE action = 'UPDATE')::int as updates,
        COUNT(*) FILTER (WHERE action = 'DELETE')::int as deletes
      FROM audit_log
      WHERE created_at >= NOW() - INTERVAL '14 days'
      GROUP BY DATE(created_at)
      ORDER BY date
    `);
    setCachedChart("recent-activity", result.rows);
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/dashboard/charts/top-customers", async (_req, res) => {
  try {
    const cached = getCachedChart("top-customers");
    if (cached) return res.json(cached);
    const result = await db.execute(sql`
      SELECT COALESCE(sc.name, so.customer_name, 'לקוח לא ידוע') as name,
        COUNT(so.id)::int as order_count,
        COALESCE(SUM(so.total), 0)::numeric as total_value
      FROM sales_orders so
      LEFT JOIN sales_customers sc ON sc.id = so.customer_id
      GROUP BY COALESCE(sc.name, so.customer_name, 'לקוח לא ידוע')
      ORDER BY total_value DESC
      LIMIT 8
    `);
    setCachedChart("top-customers", result.rows);
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/dashboard/charts/leads-funnel", async (_req, res) => {
  try {
    const cached = getCachedChart("leads-funnel");
    if (cached) return res.json(cached);
    const result = await db.execute(sql`
      SELECT 
        COUNT(*)::int as total_leads,
        COUNT(*) FILTER (WHERE status IN ('בטיפול', 'contacted', 'in_progress'))::int as contacted,
        COUNT(*) FILTER (WHERE status IN ('מוסמך', 'qualified'))::int as qualified,
        COUNT(*) FILTER (WHERE status IN ('הצעה', 'proposal'))::int as proposal,
        COUNT(*) FILTER (WHERE status IN ('הומר', 'converted', 'won'))::int as won
      FROM crm_leads
    `);
    setCachedChart("leads-funnel", result.rows[0]);
    res.json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Main dashboard endpoint - aggregates KPIs
router.get("/dashboard", async (_req, res) => {
  try {
    const kpis = kpiCache?.data;
    if (kpis) {
      res.json({ status: "ok", kpis });
    } else {
      res.json({ status: "ok", message: "Dashboard loaded" });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/dashboard/charts/inventory", async (_req, res) => {
  try {
    const cached = getCachedChart("inventory");
    if (cached) return res.json(cached);
    const result = await db.execute(sql`
      SELECT COALESCE(category, 'uncategorized') as category,
        COUNT(*)::int as count,
        COALESCE(SUM(CAST(COALESCE(NULLIF(current_stock::text,''), '0') AS numeric)), 0)::int as total_stock
      FROM raw_materials
      GROUP BY category
      ORDER BY total_stock DESC
      LIMIT 10
    `);
    setCachedChart("inventory", result.rows);
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/dashboard/charts/production", async (_req, res) => {
  try {
    const cached = getCachedChart("production");
    if (cached) return res.json(cached);
    const result = await db.execute(sql`
      SELECT status, COUNT(*)::int as count,
        COALESCE(SUM(quantity_produced), 0)::int as total_produced
      FROM production_work_orders
      GROUP BY status
      ORDER BY count DESC
    `);
    setCachedChart("production", result.rows);
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

interface HealthScoreRow {
  total: number;
  completed?: number;
  paid?: number;
  in_stock?: number;
}

router.get("/dashboard/health-score", async (_req, res) => {
  try {
    const cached = getCachedChart("health-score");
    if (cached) { res.json(cached); return; }

    const woResult = await db.execute(sql`
      SELECT 
        COUNT(*)::int as total,
        COUNT(*) FILTER (WHERE status = 'completed')::int as completed
      FROM production_work_orders
    `);
    const invoicesResult = await db.execute(sql`
      SELECT 
        COUNT(*)::int as total,
        COUNT(*) FILTER (WHERE status = 'paid' OR status = 'שולם')::int as paid
      FROM customer_invoices
    `);
    const inventoryResult = await db.execute(sql`
      SELECT 
        COUNT(*)::int as total,
        COUNT(*) FILTER (WHERE CAST(COALESCE(NULLIF(current_stock::text,''), '0') AS numeric) > 0)::int as in_stock
      FROM raw_materials
    `);

    const wo = woResult.rows[0] as HealthScoreRow | undefined;
    const invoices = invoicesResult.rows[0] as HealthScoreRow | undefined;
    const inventory = inventoryResult.rows[0] as HealthScoreRow | undefined;
    
    const hasData = (wo?.total ?? 0) > 0 || (invoices?.total ?? 0) > 0 || (inventory?.total ?? 0) > 0;

    const woScore = (wo?.total ?? 0) > 0 ? ((wo?.completed ?? 0) / wo!.total) * 100 : 50;
    const invScore = (invoices?.total ?? 0) > 0 ? ((invoices?.paid ?? 0) / invoices!.total) * 100 : 50;
    const invHealthScore = (inventory?.total ?? 0) > 0 ? ((inventory?.in_stock ?? 0) / inventory!.total) * 100 : 50;
    
    const healthScore = Math.round((woScore * 0.2 + invScore * 0.4 + invHealthScore * 0.4));
    
    const result = { 
      health_score: Math.max(50, Math.min(100, healthScore)),
      work_order_completion: Math.round(woScore),
      invoice_payment_rate: Math.round(invScore),
      inventory_availability: Math.round(invHealthScore),
      has_data: hasData,
      status: !hasData ? 'insufficient_data' : healthScore >= 70 ? 'healthy' : 'needs_attention'
    };
    setCachedChart("health-score", result);
    res.json(result);
  } catch (err: any) {
    res.json({ health_score: 50, has_data: false, status: 'insufficient_data' });
  }
});

export default router;
