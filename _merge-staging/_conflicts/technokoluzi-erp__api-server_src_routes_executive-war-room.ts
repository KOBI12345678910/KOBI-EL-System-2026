import { Router } from "express";
import { pool } from "@workspace/db";

const router = Router();

router.get("/executive/war-room", async (_req, res) => {
  try {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
    const fmt = (d: Date) => d.toISOString().slice(0, 10);

    const [
      salesOrdersRes,
      customersRes,
      workOrdersRes,
      purchaseOrdersRes,
      employeesRes,
      qcRes,
      invoicesRes,
      expensesRes,
      leadsRes,
      quotationsRes,
      budgetsRes,
      bankRes,
      automationsRes,
      projectsRes,
    ] = await Promise.all([
      pool.query(`SELECT status, COALESCE(SUM(total_amount), 0) as total, COUNT(*) as cnt FROM sales_orders GROUP BY status`).catch(() => ({ rows: [] })),
      pool.query(`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status = 'active') as active FROM customers`).catch(() => ({ rows: [{ total: 0, active: 0 }] })),
      pool.query(`SELECT status, COUNT(*) as cnt, COALESCE(SUM(quantity_ordered), 0) as qty FROM production_work_orders GROUP BY status`).catch(() => ({ rows: [] })),
      pool.query(`SELECT status, COUNT(*) as cnt, COALESCE(SUM(total_amount), 0) as total FROM purchase_orders GROUP BY status`).catch(() => ({ rows: [] })),
      pool.query(`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status = 'active') as active FROM employees`).catch(() => ({ rows: [{ total: 0, active: 0 }] })),
      pool.query(`SELECT result, COUNT(*) as cnt FROM qc_inspections GROUP BY result`).catch(() => ({ rows: [] })),
      pool.query(`SELECT status, COUNT(*) as cnt, COALESCE(SUM(total_amount), 0) as total FROM customer_invoices GROUP BY status`).catch(() => ({ rows: [] })),
      pool.query(`SELECT category, COALESCE(SUM(amount), 0) as total, COUNT(*) as cnt FROM expenses GROUP BY category`).catch(() => ({ rows: [] })),
      pool.query(`SELECT status, COUNT(*) as cnt FROM leads GROUP BY status`).catch(() => ({ rows: [] })),
      pool.query(`SELECT status, COUNT(*) as cnt, COALESCE(SUM(total_amount), 0) as total FROM quotations GROUP BY status`).catch(() => ({ rows: [] })),
      pool.query(`SELECT department, COALESCE(SUM(allocated_amount), 0) as allocated, COALESCE(SUM(used_amount), 0) as used FROM budgets WHERE fiscal_year = $1 GROUP BY department`, [now.getFullYear().toString()]).catch(() => ({ rows: [] })),
      pool.query(`SELECT COALESCE(SUM(balance), 0) as total_balance FROM bank_accounts WHERE status = 'active'`).catch(() => ({ rows: [{ total_balance: 0 }] })),
      pool.query(`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE active = true) as active FROM crm_automations`).catch(() => ({ rows: [{ total: 0, active: 0 }] })),
      pool.query(`SELECT status, COUNT(*) as cnt, COALESCE(SUM(budget), 0) as budget FROM project_analyses GROUP BY status`).catch(() => ({ rows: [] })),
    ]);

    const soByStatus: Record<string, { count: number; total: number }> = {};
    salesOrdersRes.rows.forEach((r: any) => { soByStatus[r.status] = { count: +r.cnt, total: +r.total }; });
    const totalRevenue = Object.values(soByStatus).reduce((s, v) => s + v.total, 0);
    const activeOrders = (soByStatus["confirmed"]?.count || 0) + (soByStatus["in_production"]?.count || 0) + (soByStatus["pending"]?.count || 0);

    const woByStatus: Record<string, { count: number; qty: number }> = {};
    workOrdersRes.rows.forEach((r: any) => { woByStatus[r.status] = { count: +r.cnt, qty: +r.qty }; });
    const totalWO = Object.values(woByStatus).reduce((s, v) => s + v.count, 0);
    const completedWO = woByStatus["completed"]?.count || 0;
    const inProgressWO = woByStatus["in_progress"]?.count || 0;
    const plannedWO = woByStatus["planned"]?.count || 0;

    const poByStatus: Record<string, { count: number; total: number }> = {};
    purchaseOrdersRes.rows.forEach((r: any) => { poByStatus[r.status] = { count: +r.cnt, total: +r.total }; });
    const totalProcurement = Object.values(poByStatus).reduce((s, v) => s + v.total, 0);

    const qcPass = qcRes.rows.find((r: any) => r.result === "pass")?.cnt || 0;
    const qcTotal = qcRes.rows.reduce((s: number, r: any) => s + (+r.cnt), 0);
    const qcPassRate = qcTotal > 0 ? Math.round((+qcPass / qcTotal) * 100) : 100;

    const invByStatus: Record<string, { count: number; total: number }> = {};
    invoicesRes.rows.forEach((r: any) => { invByStatus[r.status] = { count: +r.cnt, total: +r.total }; });
    const totalAR = (invByStatus["sent"]?.total || 0) + (invByStatus["overdue"]?.total || 0);
    const overdueAR = invByStatus["overdue"]?.total || 0;

    const totalExpenses = expensesRes.rows.reduce((s: number, r: any) => s + (+r.total), 0);

    const leadsByStatus: Record<string, number> = {};
    leadsRes.rows.forEach((r: any) => { leadsByStatus[r.status] = +r.cnt; });
    const totalLeads = Object.values(leadsByStatus).reduce((s, v) => s + v, 0);
    const hotLeads = (leadsByStatus["hot"] || 0) + (leadsByStatus["qualified"] || 0);

    const quotesByStatus: Record<string, { count: number; total: number }> = {};
    quotationsRes.rows.forEach((r: any) => { quotesByStatus[r.status] = { count: +r.cnt, total: +r.total }; });
    const pipelineValue = Object.values(quotesByStatus).reduce((s, v) => s + v.total, 0);

    const totalBudgetAllocated = budgetsRes.rows.reduce((s: number, r: any) => s + (+r.allocated), 0);
    const totalBudgetUsed = budgetsRes.rows.reduce((s: number, r: any) => s + (+r.used), 0);
    const budgetUtilization = totalBudgetAllocated > 0 ? Math.round((totalBudgetUsed / totalBudgetAllocated) * 100) : 0;

    const cashBalance = +(bankRes.rows[0]?.total_balance || 0);
    const employeeCount = +(employeesRes.rows[0]?.total || 0);
    const activeEmployees = +(employeesRes.rows[0]?.active || 0);
    const customerCount = +(customersRes.rows[0]?.total || 0);
    const activeCustomers = +(customersRes.rows[0]?.active || 0);

    const projByStatus: Record<string, { count: number; budget: number }> = {};
    projectsRes.rows.forEach((r: any) => { projByStatus[r.status] = { count: +r.cnt, budget: +r.budget }; });
    const activeProjects = (projByStatus["active"]?.count || 0) + (projByStatus["in_progress"]?.count || 0);

    const grossProfit = totalRevenue - totalExpenses;
    const profitMargin = totalRevenue > 0 ? Math.round((grossProfit / totalRevenue) * 100) : 0;
    const productionEfficiency = totalWO > 0 ? Math.round((completedWO / totalWO) * 100) : 0;
    const conversionRate = totalLeads > 0 ? Math.round(((soByStatus["confirmed"]?.count || 0) / totalLeads) * 100) : 0;

    const financialScore = Math.min(100, Math.max(0,
      (profitMargin > 20 ? 35 : profitMargin > 10 ? 25 : profitMargin > 0 ? 15 : 5) +
      (overdueAR < totalAR * 0.1 ? 15 : overdueAR < totalAR * 0.3 ? 10 : 5) +
      (cashBalance > 500000 ? 15 : cashBalance > 100000 ? 10 : 5) +
      (budgetUtilization < 90 ? 10 : budgetUtilization < 100 ? 7 : 3)
    ));

    const productionScore = Math.min(100, Math.max(0,
      (productionEfficiency > 80 ? 25 : productionEfficiency > 50 ? 18 : 10) +
      (qcPassRate > 95 ? 25 : qcPassRate > 85 ? 18 : 10) +
      (inProgressWO > 0 ? 15 : 5) +
      (plannedWO < totalWO * 0.5 ? 10 : 5)
    ));

    const salesScore = Math.min(100, Math.max(0,
      (conversionRate > 30 ? 20 : conversionRate > 15 ? 15 : 8) +
      (hotLeads > 5 ? 15 : hotLeads > 0 ? 10 : 5) +
      (pipelineValue > 1000000 ? 20 : pipelineValue > 100000 ? 15 : 8) +
      (activeCustomers > 50 ? 15 : activeCustomers > 10 ? 10 : 5)
    ));

    const hrScore = Math.min(100, Math.max(0,
      (activeEmployees > employeeCount * 0.9 ? 30 : 20) +
      (employeeCount > 0 ? 25 : 10) + 20
    ));

    const qualityScore = Math.min(100, Math.max(0,
      (qcPassRate > 95 ? 40 : qcPassRate > 85 ? 30 : 20) +
      (qcTotal > 10 ? 20 : qcTotal > 0 ? 15 : 5) + 15
    ));

    const healthScore = Math.round(
      financialScore * 0.35 +
      productionScore * 0.25 +
      salesScore * 0.20 +
      hrScore * 0.10 +
      qualityScore * 0.10
    );

    const alerts: Array<{ id: string; severity: string; module: string; title: string; description: string; timestamp: string }> = [];
    let alertId = 1;

    if (overdueAR > 0) {
      alerts.push({ id: `ALT-${alertId++}`, severity: "critical", module: "finance", title: "חובות לקוחות באיחור", description: `₪${overdueAR.toLocaleString()} בחשבוניות באיחור תשלום`, timestamp: now.toISOString() });
    }
    if (profitMargin < 10) {
      alerts.push({ id: `ALT-${alertId++}`, severity: "warning", module: "finance", title: "שחיקת מרווח רווח", description: `מרווח רווח נמוך: ${profitMargin}%`, timestamp: now.toISOString() });
    }
    if (cashBalance < 100000) {
      alerts.push({ id: `ALT-${alertId++}`, severity: "critical", module: "finance", title: "התראת מזומנים", description: `יתרת מזומנים נמוכה: ₪${cashBalance.toLocaleString()}`, timestamp: now.toISOString() });
    }
    if (budgetUtilization > 90) {
      alerts.push({ id: `ALT-${alertId++}`, severity: "warning", module: "finance", title: "חריגת תקציב", description: `ניצול תקציב: ${budgetUtilization}%`, timestamp: now.toISOString() });
    }
    if (qcPassRate < 90) {
      alerts.push({ id: `ALT-${alertId++}`, severity: "critical", module: "quality", title: "ירידה באיכות ייצור", description: `שיעור מעבר QC: ${qcPassRate}%`, timestamp: now.toISOString() });
    }
    if (inProgressWO > 10) {
      alerts.push({ id: `ALT-${alertId++}`, severity: "warning", module: "production", title: "עומס ייצור", description: `${inProgressWO} הזמנות עבודה בביצוע`, timestamp: now.toISOString() });
    }
    if (poByStatus["overdue"]?.count > 0) {
      alerts.push({ id: `ALT-${alertId++}`, severity: "critical", module: "procurement", title: "הזמנות רכש באיחור", description: `${poByStatus["overdue"].count} הזמנות רכש באיחור`, timestamp: now.toISOString() });
    }
    if (hotLeads > 10) {
      alerts.push({ id: `ALT-${alertId++}`, severity: "info", module: "sales", title: "לידים חמים ממתינים", description: `${hotLeads} לידים חמים לטיפול`, timestamp: now.toISOString() });
    }

    const response = {
      timestamp: now.toISOString(),
      healthScore: {
        overall: healthScore,
        financial: financialScore,
        production: productionScore,
        sales: salesScore,
        hr: hrScore,
        quality: qualityScore,
        status: healthScore >= 80 ? "excellent" : healthScore >= 60 ? "good" : healthScore >= 40 ? "warning" : "critical",
      },
      financial: {
        totalRevenue,
        totalExpenses,
        grossProfit,
        profitMargin,
        cashBalance,
        totalAR,
        overdueAR,
        totalProcurement,
        budgetAllocated: totalBudgetAllocated,
        budgetUsed: totalBudgetUsed,
        budgetUtilization,
      },
      production: {
        totalWorkOrders: totalWO,
        completed: completedWO,
        inProgress: inProgressWO,
        planned: plannedWO,
        efficiency: productionEfficiency,
        qcPassRate,
        qcTotal,
        byStatus: woByStatus,
      },
      sales: {
        totalOrders: Object.values(soByStatus).reduce((s, v) => s + v.count, 0),
        activeOrders,
        totalCustomers: customerCount,
        activeCustomers,
        totalLeads,
        hotLeads,
        pipelineValue,
        conversionRate,
        byStatus: soByStatus,
        quotesByStatus,
      },
      procurement: {
        totalPOs: Object.values(poByStatus).reduce((s, v) => s + v.count, 0),
        totalValue: totalProcurement,
        byStatus: poByStatus,
      },
      hr: {
        totalEmployees: employeeCount,
        activeEmployees,
        attendanceRate: employeeCount > 0 ? Math.round((activeEmployees / employeeCount) * 100) : 0,
      },
      projects: {
        active: activeProjects,
        total: Object.values(projByStatus).reduce((s, v) => s + v.count, 0),
        totalBudget: Object.values(projByStatus).reduce((s, v) => s + v.budget, 0),
        byStatus: projByStatus,
      },
      alerts,
      kpiGrid: [
        { key: "revenue", label: "הכנסות", value: totalRevenue, format: "currency", trend: "up" },
        { key: "expenses", label: "הוצאות", value: totalExpenses, format: "currency", trend: "neutral" },
        { key: "profit", label: "רווח גולמי", value: grossProfit, format: "currency", trend: grossProfit > 0 ? "up" : "down" },
        { key: "margin", label: "מרווח רווח", value: profitMargin, format: "percent", trend: profitMargin > 15 ? "up" : "down" },
        { key: "cash", label: "מזומנים", value: cashBalance, format: "currency", trend: "neutral" },
        { key: "ar", label: "חייבים", value: totalAR, format: "currency", trend: overdueAR > 0 ? "down" : "up" },
        { key: "overdue_ar", label: "חייבים באיחור", value: overdueAR, format: "currency", trend: overdueAR > 0 ? "down" : "up" },
        { key: "orders", label: "הזמנות פעילות", value: activeOrders, format: "number", trend: "up" },
        { key: "production", label: "בייצור", value: inProgressWO, format: "number", trend: "neutral" },
        { key: "efficiency", label: "יעילות ייצור", value: productionEfficiency, format: "percent", trend: productionEfficiency > 70 ? "up" : "down" },
        { key: "qc_rate", label: "שיעור QC", value: qcPassRate, format: "percent", trend: qcPassRate > 90 ? "up" : "down" },
        { key: "customers", label: "לקוחות", value: activeCustomers, format: "number", trend: "up" },
        { key: "leads", label: "לידים", value: totalLeads, format: "number", trend: "neutral" },
        { key: "hot_leads", label: "לידים חמים", value: hotLeads, format: "number", trend: hotLeads > 0 ? "up" : "neutral" },
        { key: "pipeline", label: "צינור מכירות", value: pipelineValue, format: "currency", trend: "up" },
        { key: "conversion", label: "המרה", value: conversionRate, format: "percent", trend: conversionRate > 20 ? "up" : "down" },
        { key: "procurement", label: "רכש", value: totalProcurement, format: "currency", trend: "neutral" },
        { key: "employees", label: "עובדים", value: activeEmployees, format: "number", trend: "neutral" },
        { key: "projects", label: "פרויקטים פעילים", value: activeProjects, format: "number", trend: "up" },
        { key: "budget_util", label: "ניצול תקציב", value: budgetUtilization, format: "percent", trend: budgetUtilization < 90 ? "up" : "down" },
      ],
    };

    res.json(response);
  } catch (err: any) {
    console.error("War room error:", err);
    res.status(500).json({ error: err.message });
  }
});

router.get("/executive/order-lifecycle", async (_req, res) => {
  try {
    const [leadsRes, quotesRes, ordersRes, bomsRes, purchasesRes, workOrdersRes, qcRes, invoicesRes, paymentsRes] = await Promise.all([
      pool.query(`SELECT status, COUNT(*) as cnt FROM leads GROUP BY status`).catch(() => ({ rows: [] })),
      pool.query(`SELECT status, COUNT(*) as cnt, COALESCE(SUM(total_amount), 0) as total FROM quotations GROUP BY status`).catch(() => ({ rows: [] })),
      pool.query(`SELECT status, COUNT(*) as cnt, COALESCE(SUM(total_amount), 0) as total FROM sales_orders GROUP BY status`).catch(() => ({ rows: [] })),
      pool.query(`SELECT status, COUNT(*) as cnt FROM bom_headers GROUP BY status`).catch(() => ({ rows: [] })),
      pool.query(`SELECT status, COUNT(*) as cnt, COALESCE(SUM(total_amount), 0) as total FROM purchase_orders GROUP BY status`).catch(() => ({ rows: [] })),
      pool.query(`SELECT status, COUNT(*) as cnt FROM production_work_orders GROUP BY status`).catch(() => ({ rows: [] })),
      pool.query(`SELECT result, COUNT(*) as cnt FROM qc_inspections GROUP BY result`).catch(() => ({ rows: [] })),
      pool.query(`SELECT status, COUNT(*) as cnt, COALESCE(SUM(total_amount), 0) as total FROM customer_invoices GROUP BY status`).catch(() => ({ rows: [] })),
      pool.query(`SELECT status, COUNT(*) as cnt, COALESCE(SUM(amount), 0) as total FROM customer_payments GROUP BY status`).catch(() => ({ rows: [] })),
    ]);

    const aggregate = (rows: any[]) => {
      const byStatus: Record<string, { count: number; total?: number }> = {};
      rows.forEach((r: any) => { byStatus[r.status || r.result || "unknown"] = { count: +r.cnt, total: r.total ? +r.total : undefined }; });
      return { total: rows.reduce((s: number, r: any) => s + (+r.cnt), 0), byStatus };
    };

    const stages = [
      { id: "leads", name: "לידים", icon: "Users", color: "blue", ...aggregate(leadsRes.rows) },
      { id: "quotes", name: "הצעות מחיר", icon: "FileText", color: "purple", ...aggregate(quotesRes.rows) },
      { id: "orders", name: "הזמנות", icon: "ShoppingCart", color: "indigo", ...aggregate(ordersRes.rows) },
      { id: "bom", name: "BOM", icon: "Layers", color: "cyan", ...aggregate(bomsRes.rows) },
      { id: "procurement", name: "רכש", icon: "Truck", color: "orange", ...aggregate(purchasesRes.rows) },
      { id: "production", name: "ייצור", icon: "Factory", color: "amber", ...aggregate(workOrdersRes.rows) },
      { id: "quality", name: "בקרת איכות", icon: "CheckCircle", color: "green", ...aggregate(qcRes.rows) },
      { id: "invoicing", name: "חשבוניות", icon: "Receipt", color: "emerald", ...aggregate(invoicesRes.rows) },
      { id: "payments", name: "תשלומים", icon: "CreditCard", color: "teal", ...aggregate(paymentsRes.rows) },
    ];

    res.json({ stages, timestamp: new Date().toISOString() });
  } catch (err: any) {
    console.error("Order lifecycle error:", err);
    res.status(500).json({ error: err.message });
  }
});

router.get("/executive/model-catalog", async (_req, res) => {
  try {
    const [tablesRes, entitiesRes, modulesRes] = await Promise.all([
      pool.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`),
      pool.query(`SELECT e.id, e.name, e.slug, e.description, m.name as module_name, m.id as module_id FROM module_entities e LEFT JOIN platform_modules m ON e.module_id = m.id ORDER BY m.name, e.name`).catch(() => ({ rows: [] })),
      pool.query(`SELECT id, name, slug, description, icon, color, sort_order FROM platform_modules ORDER BY sort_order, name`).catch(() => ({ rows: [] })),
    ]);

    res.json({
      databaseTables: tablesRes.rows.map((r: any) => r.table_name),
      tableCount: tablesRes.rows.length,
      entities: entitiesRes.rows,
      entityCount: entitiesRes.rows.length,
      modules: modulesRes.rows,
      moduleCount: modulesRes.rows.length,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error("Model catalog error:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
