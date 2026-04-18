import { Router, Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { validateSession } from "../lib/auth";
import { getSystemSyncSummary } from "../lib/data-sync";
import ExcelJS from "exceljs";

const router = Router();

async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.substring(7) : null;
  if (!token) { res.status(401).json({ error: "נדרשת התחברות" }); return; }
  let result: Awaited<ReturnType<typeof validateSession>>;
  try {
    result = await Promise.race([
      validateSession(token),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("validateSession timeout")), 5000)
      ),
    ]);
  } catch (err: any) {
    const isTimeout = err.message?.includes("timeout");
    res.status(isTimeout ? 503 : 500).json({ error: "שגיאת אימות" });
    return;
  }
  if (result.error || !result.user) { res.status(401).json({ error: "הסשן פג תוקף" }); return; }
  (req as any).user = result.user;
  next();
}

router.use("/reports-center", requireAuth as any);

async function safeQuery(query: string, timeoutMs = 15000) {
  try {
    const result = await Promise.race([
      db.execute(sql.raw(query)),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`DB query timeout (${timeoutMs / 1000}s)`)), timeoutMs)),
    ]);
    return result.rows || [];
  } catch (err: any) {
    const querySnippet = query.trim().replace(/\s+/g, " ").slice(0, 120);
    console.error(`Reports query error: ${err.message} | query: ${querySnippet}`);
    return [];
  }
}

function parsePeriodParams(req: Request): { startDate: string; endDate: string; periodLabel: string } {
  const now = new Date();
  const period = (req.query.period as string) || "year";
  let startDate: string;
  let endDate: string;
  let periodLabel = "";

  if (req.query.startDate && req.query.endDate) {
    startDate = String(req.query.startDate).replace(/[^0-9-]/g, "").slice(0, 10);
    endDate = String(req.query.endDate).replace(/[^0-9-]/g, "").slice(0, 10);
    periodLabel = "טווח מותאם";
  } else {
    const year = parseInt(req.query.year as string) || now.getFullYear();
    switch (period) {
      case "day":
        startDate = now.toISOString().slice(0, 10);
        endDate = startDate;
        periodLabel = "יומי";
        break;
      case "week": {
        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() - now.getDay());
        startDate = weekStart.toISOString().slice(0, 10);
        endDate = now.toISOString().slice(0, 10);
        periodLabel = "שבועי";
        break;
      }
      case "month": {
        const month = parseInt(req.query.month as string) || (now.getMonth() + 1);
        startDate = `${year}-${String(month).padStart(2, "0")}-01`;
        const lastDay = new Date(year, month, 0).getDate();
        endDate = `${year}-${String(month).padStart(2, "0")}-${lastDay}`;
        periodLabel = "חודשי";
        break;
      }
      case "quarter": {
        const quarter = parseInt(req.query.quarter as string) || Math.ceil((now.getMonth() + 1) / 3);
        const qStartMonth = (quarter - 1) * 3 + 1;
        const qEndMonth = quarter * 3;
        startDate = `${year}-${String(qStartMonth).padStart(2, "0")}-01`;
        const qLastDay = new Date(year, qEndMonth, 0).getDate();
        endDate = `${year}-${String(qEndMonth).padStart(2, "0")}-${qLastDay}`;
        periodLabel = `רבעון ${quarter}`;
        break;
      }
      case "year":
      default:
        startDate = `${year}-01-01`;
        endDate = `${year}-12-31`;
        periodLabel = `שנת ${year}`;
        break;
    }
  }

  return { startDate, endDate, periodLabel };
}

router.get("/reports-center/hub", async (_req: Request, res: Response) => {
  try {
    const [
      invoiceCount, expenseCount, customerCount, employeeCount,
      openTasks, recentActivity
    ] = await Promise.all([
      safeQuery(`SELECT COUNT(*) as count FROM income_documents WHERE status != 'cancelled'`),
      safeQuery(`SELECT COUNT(*) as count FROM expenses WHERE status NOT IN ('cancelled','rejected')`),
      safeQuery(`SELECT COUNT(*) as count FROM customers`),
      safeQuery(`SELECT COUNT(*) as count FROM employees WHERE status = 'active'`),
      safeQuery(`SELECT COUNT(*) as count FROM approval_requests WHERE status = 'pending'`),
      safeQuery(`SELECT COUNT(*) as count FROM audit_logs WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'`),
    ]);

    res.json({
      stats: {
        invoices: Number(invoiceCount[0]?.count || 0),
        expenses: Number(expenseCount[0]?.count || 0),
        customers: Number(customerCount[0]?.count || 0),
        employees: Number(employeeCount[0]?.count || 0),
        openTasks: Number(openTasks[0]?.count || 0),
        recentActivity: Number(recentActivity[0]?.count || 0),
      }
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/reports-center/financial", async (req: Request, res: Response) => {
  try {
    const { startDate, endDate, periodLabel } = parsePeriodParams(req);

    const [
      monthlyPL, topCustomers, topProducts, expensesByCategory,
      cashFlow, projectProfitability, quarterlyComparison
    ] = await Promise.all([
      safeQuery(`
        SELECT 
          EXTRACT(MONTH FROM d.invoice_date)::int as month,
          COALESCE(SUM(d.amount), 0) as income
        FROM income_documents d
        WHERE d.status != 'cancelled' AND d.invoice_date >= '${startDate}' AND d.invoice_date <= '${endDate}'
        GROUP BY month ORDER BY month
      `),
      safeQuery(`
        SELECT customer_name as name, COALESCE(SUM(amount), 0) as value
        FROM income_documents
        WHERE status != 'cancelled' AND invoice_date >= '${startDate}' AND invoice_date <= '${endDate}'
        GROUP BY customer_name ORDER BY value DESC LIMIT 10
      `),
      safeQuery(`
        SELECT COALESCE(products, 'אחר') as name, COALESCE(SUM(amount), 0) as value
        FROM income_documents
        WHERE status != 'cancelled' AND invoice_date >= '${startDate}' AND invoice_date <= '${endDate}'
        GROUP BY products ORDER BY value DESC LIMIT 10
      `),
      safeQuery(`
        SELECT category, COALESCE(SUM(amount), 0) as total
        FROM expenses
        WHERE status NOT IN ('cancelled','rejected') AND expense_date >= '${startDate}' AND expense_date <= '${endDate}'
        GROUP BY category ORDER BY total DESC
      `),
      safeQuery(`
        SELECT 
          COALESCE(SUM(current_balance), 0) as current_cash,
          (SELECT COALESCE(SUM(balance_due), 0) FROM accounts_receivable WHERE status IN ('open','partial') AND due_date <= CURRENT_DATE + INTERVAL '30 days') as upcoming_receivables,
          (SELECT COALESCE(SUM(balance_due), 0) FROM accounts_payable WHERE status IN ('open','partial') AND due_date <= CURRENT_DATE + INTERVAL '30 days') as upcoming_payables
        FROM bank_accounts WHERE is_active = true
      `),
      safeQuery(`
        SELECT project_name, 
          COALESCE(actual_revenue, 0) as actual_revenue, 
          COALESCE(actual_cost, 0) as actual_cost,
          CASE WHEN actual_revenue > 0 THEN ROUND(((actual_revenue - actual_cost)::numeric / actual_revenue * 100), 1) ELSE 0 END as margin
        FROM projects WHERE status != 'cancelled' ORDER BY actual_revenue DESC LIMIT 10
      `),
      safeQuery(`
        SELECT 
          EXTRACT(QUARTER FROM invoice_date)::int as quarter,
          COALESCE(SUM(amount), 0) as income
        FROM income_documents
        WHERE status != 'cancelled' AND invoice_date >= '${startDate}' AND invoice_date <= '${endDate}'
        GROUP BY quarter ORDER BY quarter
      `),
    ]);

    const monthlyExpenses = await safeQuery(`
      SELECT 
        EXTRACT(MONTH FROM expense_date)::int as month,
        COALESCE(SUM(amount), 0) as expenses
      FROM expenses
      WHERE status NOT IN ('cancelled','rejected') AND expense_date >= '${startDate}' AND expense_date <= '${endDate}'
      GROUP BY month ORDER BY month
    `);

    const monthly = Array.from({ length: 12 }, (_, i) => {
      const m = i + 1;
      const inc = monthlyPL.find((r: any) => Number(r.month) === m);
      const exp = monthlyExpenses.find((r: any) => Number(r.month) === m);
      return {
        month: m,
        income: Number(inc?.income || 0),
        expenses: Number(exp?.expenses || 0),
        profit: Number(inc?.income || 0) - Number(exp?.expenses || 0),
      };
    });

    const totalIncome = monthly.reduce((s, m) => s + m.income, 0);
    const totalExpenses = monthly.reduce((s, m) => s + m.expenses, 0);

    const cf = cashFlow[0] || {};

    res.json({
      periodLabel,
      startDate,
      endDate,
      monthly,
      totalIncome,
      totalExpenses,
      grossProfit: totalIncome - totalExpenses,
      profitMargin: totalIncome > 0 ? Math.round(((totalIncome - totalExpenses) / totalIncome) * 100 * 10) / 10 : 0,
      topCustomers,
      topProducts,
      expensesByCategory,
      cashFlow: {
        currentCash: Number(cf.current_cash || 0),
        upcomingReceivables: Number(cf.upcoming_receivables || 0),
        upcomingPayables: Number(cf.upcoming_payables || 0),
        projectedCash: Number(cf.current_cash || 0) + Number(cf.upcoming_receivables || 0) - Number(cf.upcoming_payables || 0),
      },
      projectProfitability,
      quarterlyComparison: quarterlyComparison.map((q: any) => ({
        quarter: `Q${q.quarter}`,
        income: Number(q.income || 0),
      })),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/reports-center/risks", async (req: Request, res: Response) => {
  try {
    const { startDate, endDate, periodLabel } = parsePeriodParams(req);

    const [
      customerConcentration, supplierConcentration, agingAnalysis,
      liquidityMetrics, overdueStats, fxExposure
    ] = await Promise.all([
      safeQuery(`
        SELECT customer_name as name, 
          COALESCE(SUM(amount), 0) as total,
          COUNT(*) as invoice_count
        FROM income_documents
        WHERE status != 'cancelled' AND invoice_date >= '${startDate}' AND invoice_date <= '${endDate}'
        GROUP BY customer_name ORDER BY total DESC LIMIT 15
      `),
      safeQuery(`
        SELECT supplier_name as name,
          COALESCE(SUM(amount), 0) as total,
          COUNT(*) as order_count
        FROM accounts_payable
        WHERE status != 'cancelled' AND invoice_date >= '${startDate}' AND invoice_date <= '${endDate}'
        GROUP BY supplier_name ORDER BY total DESC LIMIT 15
      `),
      safeQuery(`
        SELECT 
          COALESCE(SUM(balance_due) FILTER (WHERE due_date >= CURRENT_DATE), 0) as current_amount,
          COALESCE(SUM(balance_due) FILTER (WHERE due_date < CURRENT_DATE AND due_date >= CURRENT_DATE - INTERVAL '30 days'), 0) as days_1_30,
          COALESCE(SUM(balance_due) FILTER (WHERE due_date < CURRENT_DATE - INTERVAL '30 days' AND due_date >= CURRENT_DATE - INTERVAL '60 days'), 0) as days_31_60,
          COALESCE(SUM(balance_due) FILTER (WHERE due_date < CURRENT_DATE - INTERVAL '60 days' AND due_date >= CURRENT_DATE - INTERVAL '90 days'), 0) as days_61_90,
          COALESCE(SUM(balance_due) FILTER (WHERE due_date < CURRENT_DATE - INTERVAL '90 days'), 0) as over_90
        FROM accounts_receivable WHERE status IN ('open','partial','overdue')
      `),
      safeQuery(`
        SELECT 
          COALESCE(SUM(current_balance), 0) as total_cash,
          (SELECT COALESCE(SUM(balance_due), 0) FROM accounts_payable WHERE status IN ('open','partial') AND due_date <= CURRENT_DATE + INTERVAL '30 days') as short_term_liabilities,
          (SELECT COALESCE(SUM(balance_due), 0) FROM accounts_receivable WHERE status IN ('open','partial')) as total_receivables
        FROM bank_accounts WHERE is_active = true
      `),
      safeQuery(`
        SELECT 
          COUNT(*) FILTER (WHERE status = 'overdue' OR (status IN ('open','partial') AND due_date < CURRENT_DATE)) as overdue_count,
          COALESCE(SUM(balance_due) FILTER (WHERE status = 'overdue' OR (status IN ('open','partial') AND due_date < CURRENT_DATE)), 0) as overdue_amount
        FROM accounts_receivable
      `),
      safeQuery(`
        SELECT 
          COALESCE(currency, 'ILS') as currency,
          COALESCE(SUM(balance_due), 0) as receivable_exposure,
          COUNT(*) as doc_count
        FROM accounts_receivable
        WHERE status IN ('open','partial','overdue')
        GROUP BY currency
        ORDER BY receivable_exposure DESC
      `),
    ]);

    const totalRevenue = customerConcentration.reduce((s: number, c: any) => s + Number(c.total || 0), 0) || 1;
    const customerRisks = customerConcentration.map((c: any) => ({
      ...c,
      total: Number(c.total || 0),
      percentage: Math.round((Number(c.total || 0) / totalRevenue) * 100 * 10) / 10,
    }));

    const totalPurchases = supplierConcentration.reduce((s: number, c: any) => s + Number(c.total || 0), 0) || 1;
    const supplierRisks = supplierConcentration.map((c: any) => ({
      ...c,
      total: Number(c.total || 0),
      percentage: Math.round((Number(c.total || 0) / totalPurchases) * 100 * 10) / 10,
    }));

    const liq = liquidityMetrics[0] || {};
    const totalCash = Number(liq.total_cash || 0);
    const shortTermLiabilities = Number(liq.short_term_liabilities || 0);
    const currentRatio = shortTermLiabilities > 0 ? Math.round((totalCash / shortTermLiabilities) * 100) / 100 : 999;

    const aging = agingAnalysis[0] || {};

    const fxData = fxExposure.map((fx: any) => ({
      currency: fx.currency || "ILS",
      exposure: Number(fx.receivable_exposure || 0),
      docCount: Number(fx.doc_count || 0),
    }));
    const totalFxExposure = fxData.filter((f: any) => f.currency !== "ILS").reduce((s: number, f: any) => s + f.exposure, 0);

    const riskHeatMap = [
      { category: "נזילות", level: currentRatio >= 1.5 ? "low" : currentRatio >= 1 ? "medium" : "high", value: `${currentRatio}x` },
      { category: "ריכוזיות לקוחות", level: (customerRisks[0]?.percentage || 0) > 40 ? "high" : (customerRisks[0]?.percentage || 0) > 25 ? "medium" : "low", value: `${customerRisks[0]?.percentage || 0}%` },
      { category: "ריכוזיות ספקים", level: (supplierRisks[0]?.percentage || 0) > 40 ? "high" : (supplierRisks[0]?.percentage || 0) > 25 ? "medium" : "low", value: `${supplierRisks[0]?.percentage || 0}%` },
      { category: "חובות מעל 90 יום", level: Number(aging.over_90 || 0) > 50000 ? "high" : Number(aging.over_90 || 0) > 10000 ? "medium" : "low", value: Number(aging.over_90 || 0) },
      { category: "אשראי לקוחות", level: Number(overdueStats[0]?.overdue_count || 0) > 10 ? "high" : Number(overdueStats[0]?.overdue_count || 0) > 5 ? "medium" : "low", value: `${overdueStats[0]?.overdue_count || 0} חשבוניות` },
      { category: "חשיפת מט\"ח", level: totalFxExposure > 100000 ? "high" : totalFxExposure > 30000 ? "medium" : "low", value: totalFxExposure },
    ];

    res.json({
      periodLabel,
      customerConcentration: customerRisks,
      supplierConcentration: supplierRisks,
      agingAnalysis: aging,
      liquidityMetrics: {
        totalCash,
        shortTermLiabilities,
        currentRatio,
        totalReceivables: Number(liq.total_receivables || 0),
      },
      overdueStats: overdueStats[0] || {},
      riskHeatMap,
      fxExposure: fxData,
      totalFxExposure,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/reports-center/kpis", async (req: Request, res: Response) => {
  try {
    const { startDate, endDate, periodLabel } = parsePeriodParams(req);
    const prevYear = parseInt(startDate.slice(0, 4)) - 1;
    const prevStartDate = `${prevYear}${startDate.slice(4)}`;
    const prevEndDate = `${prevYear}${endDate.slice(4)}`;

    const [
      salesKpis, financeKpis, hrKpis, procurementKpis, productionKpis
    ] = await Promise.all([
      safeQuery(`
        SELECT
          COALESCE(SUM(amount) FILTER (WHERE invoice_date >= '${startDate}' AND invoice_date <= '${endDate}'), 0) as current_revenue,
          COALESCE(SUM(amount) FILTER (WHERE invoice_date >= '${prevStartDate}' AND invoice_date <= '${prevEndDate}'), 0) as last_revenue,
          COUNT(*) FILTER (WHERE invoice_date >= '${startDate}' AND invoice_date <= '${endDate}') as current_deals,
          COUNT(*) FILTER (WHERE invoice_date >= '${prevStartDate}' AND invoice_date <= '${prevEndDate}') as last_deals,
          CASE WHEN COUNT(*) FILTER (WHERE invoice_date >= '${startDate}' AND invoice_date <= '${endDate}') > 0
            THEN ROUND((SUM(amount) FILTER (WHERE invoice_date >= '${startDate}' AND invoice_date <= '${endDate}') / COUNT(*) FILTER (WHERE invoice_date >= '${startDate}' AND invoice_date <= '${endDate}'))::numeric, 0)
            ELSE 0 END as avg_deal
        FROM income_documents WHERE status != 'cancelled'
      `),
      safeQuery(`
        SELECT
          COALESCE((SELECT SUM(current_balance) FROM bank_accounts WHERE is_active = true), 0) as cash,
          COALESCE(SUM(e.amount) FILTER (WHERE e.expense_date >= '${startDate}' AND e.expense_date <= '${endDate}'), 0) as current_expenses,
          COALESCE(SUM(e.amount) FILTER (WHERE e.expense_date >= '${prevStartDate}' AND e.expense_date <= '${prevEndDate}'), 0) as last_expenses,
          COALESCE((SELECT ROUND(AVG((CURRENT_DATE - due_date)::numeric), 0) FROM accounts_receivable WHERE status IN ('open','partial','overdue') AND due_date < CURRENT_DATE), 0) as dso
        FROM expenses e WHERE e.status NOT IN ('cancelled','rejected')
      `),
      safeQuery(`
        SELECT
          COUNT(*) FILTER (WHERE status = 'active') as active_employees,
          COALESCE(SUM(base_salary) FILTER (WHERE status = 'active'), 0) as total_salary_cost
        FROM employees
      `),
      safeQuery(`
        SELECT
          COUNT(*) as total_orders,
          COALESCE(AVG(amount), 0) as avg_order_cost
        FROM accounts_payable WHERE status != 'cancelled' AND invoice_date >= '${startDate}' AND invoice_date <= '${endDate}'
      `),
      safeQuery(`
        SELECT
          COUNT(*) as total_work_orders,
          COUNT(*) FILTER (WHERE status = 'completed') as completed_work_orders
        FROM work_orders WHERE created_at >= '${startDate}' AND created_at <= '${endDate}'
      `),
    ]);

    const sales = salesKpis[0] || {};
    const finance = financeKpis[0] || {};
    const hr = hrKpis[0] || {};
    const procurement = procurementKpis[0] || {};
    const production = productionKpis[0] || {};

    const currentRev = Number(sales.current_revenue || 0);
    const lastRev = Number(sales.last_revenue || 0);
    const currentExp = Number(finance.current_expenses || 0);
    const lastExp = Number(finance.last_expenses || 0);
    const grossProfit = currentRev - currentExp;
    const profitMargin = currentRev > 0 ? Math.round((grossProfit / currentRev) * 100 * 10) / 10 : 0;

    const totalWo = Number(production.total_work_orders || 0);
    const completedWo = Number(production.completed_work_orders || 0);
    const utilizationRate = totalWo > 0 ? Math.round((completedWo / totalWo) * 100) : 0;

    function trend(current: number, previous: number) {
      if (previous === 0) return current > 0 ? "up" : "stable";
      const pct = ((current - previous) / previous) * 100;
      if (pct > 5) return "up";
      if (pct < -5) return "down";
      return "stable";
    }

    function kpiStatus(value: number, greenThreshold: number, yellowThreshold: number, higherIsBetter = true) {
      if (higherIsBetter) {
        if (value >= greenThreshold) return "green";
        if (value >= yellowThreshold) return "yellow";
        return "red";
      }
      if (value <= greenThreshold) return "green";
      if (value <= yellowThreshold) return "yellow";
      return "red";
    }

    res.json({
      periodLabel,
      sales: [
        { label: "הכנסות בתקופה", value: currentRev, format: "currency", trend: trend(currentRev, lastRev), status: kpiStatus(currentRev, lastRev * 1.1, lastRev * 0.9) },
        { label: "מספר עסקאות", value: Number(sales.current_deals || 0), format: "number", trend: trend(Number(sales.current_deals || 0), Number(sales.last_deals || 0)), status: "green" },
        { label: "ממוצע עסקה", value: Number(sales.avg_deal || 0), format: "currency", trend: "stable", status: "green" },
      ],
      finance: [
        { label: "רווח גולמי", value: grossProfit, format: "currency", trend: trend(grossProfit, lastRev - lastExp), status: kpiStatus(profitMargin, 25, 10) },
        { label: "שולי רווח", value: profitMargin, format: "percent", trend: "stable", status: kpiStatus(profitMargin, 25, 10) },
        { label: "ימי גבייה (DSO)", value: Number(finance.dso || 0), format: "number", trend: "stable", status: kpiStatus(Number(finance.dso || 0), 30, 60, false) },
        { label: "נזילות", value: Number(finance.cash || 0), format: "currency", trend: "stable", status: "green" },
      ],
      procurement: [
        { label: "הזמנות רכש בתקופה", value: Number(procurement.total_orders || 0), format: "number", trend: "stable", status: "green" },
        { label: "עלות ממוצעת הזמנה", value: Math.round(Number(procurement.avg_order_cost || 0)), format: "currency", trend: "stable", status: "green" },
      ],
      hr: [
        { label: "עובדים פעילים", value: Number(hr.active_employees || 0), format: "number", trend: "stable", status: "green" },
        { label: "עלות שכר חודשית", value: Number(hr.total_salary_cost || 0), format: "currency", trend: "stable", status: "green" },
      ],
      production: [
        { label: "ניצולת ייצור", value: utilizationRate, format: "percent", trend: "stable", status: kpiStatus(utilizationRate, 80, 50) },
        { label: "הזמנות עבודה בתקופה", value: totalWo, format: "number", trend: "stable", status: "green" },
      ],
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/reports-center/funnel", async (req: Request, res: Response) => {
  try {
    const { startDate, endDate, periodLabel } = parsePeriodParams(req);

    const [
      funnelData, conversionByMonth, conversionByAgent, stageTimes, leadSourceStats
    ] = await Promise.all([
      safeQuery(`
        SELECT
          (SELECT COUNT(*) FROM customers WHERE created_at >= '${startDate}' AND created_at <= '${endDate}') as total_leads,
          (SELECT COUNT(*) FROM quotes WHERE created_at >= '${startDate}' AND created_at <= '${endDate}') as total_quotes,
          (SELECT COALESCE(SUM(total_amount), 0) FROM quotes WHERE created_at >= '${startDate}' AND created_at <= '${endDate}') as total_quotes_value,
          (SELECT COUNT(*) FROM quotes WHERE status = 'approved' AND created_at >= '${startDate}' AND created_at <= '${endDate}') as approved_quotes,
          (SELECT COALESCE(SUM(total_amount), 0) FROM quotes WHERE status = 'approved' AND created_at >= '${startDate}' AND created_at <= '${endDate}') as approved_value,
          (SELECT COUNT(*) FROM sales_orders WHERE created_at >= '${startDate}' AND created_at <= '${endDate}') as total_orders,
          (SELECT COALESCE(SUM(total), 0) FROM sales_orders WHERE created_at >= '${startDate}' AND created_at <= '${endDate}') as total_orders_value,
          (SELECT COUNT(*) FROM income_documents WHERE status != 'cancelled' AND invoice_date >= '${startDate}' AND invoice_date <= '${endDate}') as total_invoices,
          (SELECT COALESCE(SUM(amount), 0) FROM income_documents WHERE status != 'cancelled' AND invoice_date >= '${startDate}' AND invoice_date <= '${endDate}') as total_invoiced,
          (SELECT COALESCE(SUM(paid_amount), 0) FROM accounts_receivable WHERE created_at >= '${startDate}' AND created_at <= '${endDate}') as total_collected
      `),
      safeQuery(`
        SELECT 
          TO_CHAR(q.created_at, 'YYYY-MM') as month,
          COUNT(*) as quotes,
          COUNT(*) FILTER (WHERE q.status = 'approved') as approved
        FROM quotes q
        WHERE q.created_at >= '${startDate}' AND q.created_at <= '${endDate}'
        GROUP BY month ORDER BY month
      `),
      safeQuery(`
        SELECT 
          COALESCE(q.sales_rep, 'לא משויך') as agent,
          COUNT(*) as total_quotes,
          COUNT(*) FILTER (WHERE q.status = 'approved') as approved,
          COALESCE(SUM(q.total_amount) FILTER (WHERE q.status = 'approved'), 0) as approved_value
        FROM quotes q
        WHERE q.created_at >= '${startDate}' AND q.created_at <= '${endDate}'
        GROUP BY agent ORDER BY approved_value DESC LIMIT 10
      `),
      safeQuery(`
        SELECT
          ROUND(AVG(EXTRACT(DAY FROM q.updated_at - q.created_at))::numeric, 1) as avg_quote_time,
          ROUND(AVG(CASE WHEN q.status = 'approved' THEN EXTRACT(DAY FROM q.updated_at - q.created_at) END)::numeric, 1) as avg_approval_time,
          (SELECT ROUND(AVG(EXTRACT(DAY FROM so.created_at - q2.updated_at))::numeric, 1) 
           FROM sales_orders so 
           JOIN quotes q2 ON q2.id::text = so.quote_id::text 
           WHERE q2.status = 'approved') as avg_order_time,
          (SELECT ROUND(AVG(EXTRACT(DAY FROM id.created_at - so2.created_at))::numeric, 1)
           FROM income_documents id
           JOIN sales_orders so2 ON so2.id::text = id.order_id::text) as avg_invoice_time
        FROM quotes q
      `),
      safeQuery(`
        SELECT
          COALESCE(c.source, 'לא ידוע') as lead_source,
          COUNT(*) as lead_count,
          COALESCE(SUM((SELECT COUNT(*) FROM quotes q WHERE q.customer_name = c.name)), 0) as quotes_count,
          COALESCE(SUM((SELECT COUNT(*) FROM quotes q WHERE q.customer_name = c.name AND q.status = 'approved')), 0) as approved_count
        FROM customers c
        WHERE c.created_at >= '${startDate}' AND c.created_at <= '${endDate}'
        GROUP BY lead_source, c.name
        ORDER BY lead_count DESC LIMIT 10
      `),
    ]);

    const f = funnelData[0] || {};
    const leads = Number(f.total_leads || 0);
    const quotes = Number(f.total_quotes || 0);
    const approved = Number(f.approved_quotes || 0);
    const orders = Number(f.total_orders || 0);
    const invoices = Number(f.total_invoices || 0);

    const times = stageTimes[0] || {};

    const funnelSteps = [
      { stage: "לידים/לקוחות", count: leads, value: 0, avgDays: 0 },
      { stage: "הצעות מחיר", count: quotes, value: Number(f.total_quotes_value || 0), conversionRate: leads > 0 ? Math.round((quotes / leads) * 100) : 0, avgDays: Number(times.avg_quote_time || 0) },
      { stage: "הצעות מאושרות", count: approved, value: Number(f.approved_value || 0), conversionRate: quotes > 0 ? Math.round((approved / quotes) * 100) : 0, avgDays: Number(times.avg_approval_time || 0) },
      { stage: "הזמנות", count: orders, value: Number(f.total_orders_value || 0), conversionRate: approved > 0 ? Math.round((orders / approved) * 100) : 0, avgDays: Number(times.avg_order_time || 0) },
      { stage: "חשבוניות", count: invoices, value: Number(f.total_invoiced || 0), conversionRate: orders > 0 ? Math.round((invoices / orders) * 100) : 0, avgDays: Number(times.avg_invoice_time || 0) },
      { stage: "גבייה", count: 0, value: Number(f.total_collected || 0), conversionRate: Number(f.total_invoiced || 0) > 0 ? Math.round((Number(f.total_collected || 0) / Number(f.total_invoiced || 0)) * 100) : 0, avgDays: 0 },
    ];

    res.json({
      periodLabel,
      funnelSteps,
      overallConversion: leads > 0 ? Math.round((invoices / leads) * 100 * 10) / 10 : 0,
      conversionByMonth: conversionByMonth.map((m: any) => ({
        month: m.month,
        quotes: Number(m.quotes || 0),
        approved: Number(m.approved || 0),
        rate: Number(m.quotes || 0) > 0 ? Math.round((Number(m.approved || 0) / Number(m.quotes || 0)) * 100) : 0,
      })),
      conversionByAgent: conversionByAgent.map((a: any) => ({
        agent: a.agent,
        totalQuotes: Number(a.total_quotes || 0),
        approved: Number(a.approved || 0),
        approvedValue: Number(a.approved_value || 0),
        rate: Number(a.total_quotes || 0) > 0 ? Math.round((Number(a.approved || 0) / Number(a.total_quotes || 0)) * 100) : 0,
      })),
      avgTimes: {
        quoteApproval: Number(times.avg_approval_time || 0),
        quoteToOrder: Number(times.avg_order_time || 0),
        orderToInvoice: Number(times.avg_invoice_time || 0),
      },
      leadSourceBreakdown: leadSourceStats.map((ls: any) => ({
        source: ls.lead_source,
        leads: Number(ls.lead_count || 0),
        quotes: Number(ls.quotes_count || 0),
        approved: Number(ls.approved_count || 0),
        conversionRate: Number(ls.lead_count || 0) > 0 ? Math.round((Number(ls.approved_count || 0) / Number(ls.lead_count || 0)) * 100) : 0,
      })),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/reports-center/operational", async (req: Request, res: Response) => {
  try {
    const { startDate, endDate, periodLabel } = parsePeriodParams(req);

    const [
      recordsByModule, recentAudit, pendingApprovals, activityByType
    ] = await Promise.all([
      safeQuery(`
        SELECT 'חשבוניות הכנסה' as module, 
          COUNT(*) as total, 
          COUNT(*) FILTER (WHERE created_at >= '${startDate}' AND created_at <= '${endDate}') as in_period,
          COUNT(*) FILTER (WHERE updated_at >= '${startDate}' AND updated_at <= '${endDate}' AND updated_at != created_at) as updated_in_period
        FROM income_documents
        UNION ALL SELECT 'הוצאות', COUNT(*), COUNT(*) FILTER (WHERE created_at >= '${startDate}' AND created_at <= '${endDate}'), COUNT(*) FILTER (WHERE updated_at >= '${startDate}' AND updated_at <= '${endDate}' AND updated_at != created_at) FROM expenses
        UNION ALL SELECT 'הצעות מחיר', COUNT(*), COUNT(*) FILTER (WHERE created_at >= '${startDate}' AND created_at <= '${endDate}'), COUNT(*) FILTER (WHERE updated_at >= '${startDate}' AND updated_at <= '${endDate}' AND updated_at != created_at) FROM quotes
        UNION ALL SELECT 'הזמנות מכירה', COUNT(*), COUNT(*) FILTER (WHERE created_at >= '${startDate}' AND created_at <= '${endDate}'), COUNT(*) FILTER (WHERE updated_at >= '${startDate}' AND updated_at <= '${endDate}' AND updated_at != created_at) FROM sales_orders
        UNION ALL SELECT 'לקוחות', COUNT(*), COUNT(*) FILTER (WHERE created_at >= '${startDate}' AND created_at <= '${endDate}'), COUNT(*) FILTER (WHERE updated_at >= '${startDate}' AND updated_at <= '${endDate}' AND updated_at != created_at) FROM customers
        UNION ALL SELECT 'ספקים', COUNT(*), COUNT(*) FILTER (WHERE created_at >= '${startDate}' AND created_at <= '${endDate}'), COUNT(*) FILTER (WHERE updated_at >= '${startDate}' AND updated_at <= '${endDate}' AND updated_at != created_at) FROM suppliers
        UNION ALL SELECT 'הזמנות רכש', COUNT(*), COUNT(*) FILTER (WHERE created_at >= '${startDate}' AND created_at <= '${endDate}'), COUNT(*) FILTER (WHERE updated_at >= '${startDate}' AND updated_at <= '${endDate}' AND updated_at != created_at) FROM purchase_orders
      `),
      safeQuery(`
        SELECT action, entity_type, entity_id, user_name, created_at
        FROM audit_logs
        WHERE created_at >= '${startDate}' AND created_at <= '${endDate}'
        ORDER BY created_at DESC LIMIT 30
      `),
      safeQuery(`
        SELECT 
          status, COUNT(*) as count
        FROM approval_requests
        GROUP BY status
      `),
      safeQuery(`
        SELECT action, COUNT(*) as count
        FROM audit_logs
        WHERE created_at >= '${startDate}' AND created_at <= '${endDate}'
        GROUP BY action ORDER BY count DESC
      `),
    ]);

    const pendingCount = pendingApprovals.find((p: any) => p.status === 'pending');
    const approvedCount = pendingApprovals.find((p: any) => p.status === 'approved');

    res.json({
      periodLabel,
      recordsByModule: recordsByModule.map((r: any) => ({
        module: r.module,
        total: Number(r.total || 0),
        created: Number(r.in_period || 0),
        updated: Number(r.updated_in_period || 0),
      })),
      recentActivity: recentAudit.map((a: any) => ({
        action: a.action,
        entityType: a.entity_type,
        entityId: a.entity_id,
        userName: a.user_name,
        createdAt: a.created_at,
      })),
      approvals: {
        pending: Number(pendingCount?.count || 0),
        approved: Number(approvedCount?.count || 0),
        total: pendingApprovals.reduce((s: number, p: any) => s + Number(p.count || 0), 0),
      },
      activityByType: activityByType.map((a: any) => ({
        action: a.action,
        count: Number(a.count || 0),
      })),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

interface MonthlyAmountRow { month: string | number; amount: string | number }
interface CashFlowDbRow { month_num: string | number; income: string | number; expenses: string | number }
interface ExpenseCategoryRow { category: string; total: string | number }
interface DeptPerformanceRow { department: string; employee_count: string | number; salary_cost: string | number; dept_expenses: string | number }
interface ModuleRow { id: string | number; name: string; slug: string }
interface ExportSalesTrendRow { month: string; revenue: number; expenses: number; profit: number }
interface ExportExpenseRow { name: string; value: number }
interface ExportDeptRow { name: string; employees: number; salaryCost: number; expenses: number }

router.get("/reports-center/executive-dashboard", async (req: Request, res: Response) => {
  try {
    const testResult = await safeQuery("SELECT 1 AS ok");
    if (testResult.length === 0) {
      return res.json({
        kpis: {},
        financialSummary: null,
        charts: null,
        departments: [],
        modules: [],
        production: null,
        salesPipeline: null,
        inventory: null,
        projects: null,
        suppliers: null,
        automations: null,
        invoiceAging: null,
        alerts: [{ type: "warning", severity: "medium", message: "מסד הנתונים לא זמין כרגע — מוצגים נתונים ריקים", count: 0 }],
        _fallback: true,
      });
    }
    const { startDate, endDate, periodLabel } = parsePeriodParams(req);
    const department = (req.query.department as string) || "";
    const moduleSlug = (req.query.module as string) || "";
    const prevYear = parseInt(startDate.slice(0, 4)) - 1;
    const prevStartDate = `${prevYear}${startDate.slice(4)}`;
    const prevEndDate = `${prevYear}${endDate.slice(4)}`;

    let moduleName = "";
    if (moduleSlug) {
      const modRows = await safeQuery(`SELECT name FROM platform_modules WHERE slug = '${moduleSlug.replace(/'/g, "''")}'`);
      if (modRows.length > 0) {
        moduleName = String((modRows[0] as { name: string }).name);
      }
    }

    const deptFilterExpense = department ? ` AND department = '${department.replace(/'/g, "''")}'` : "";
    const moduleFilterExpense = moduleName ? ` AND category ILIKE '%${moduleName.replace(/'/g, "''")}%'` : "";
    const combinedExpenseFilter = `${deptFilterExpense}${moduleFilterExpense}`;

    const [
      revenueData,
      expenseData,
      arData,
      apData,
      cashData,
      hrData,
      ordersData,
      budgetData,
      monthlyRevenue,
      monthlyExpenses,
      expensesByCategory,
      monthlyCashFlow,
      departmentPerformance,
      pendingApprovals,
      customersData,
    ] = await Promise.all([
      safeQuery(`
        SELECT
          COALESCE(SUM(amount) FILTER (WHERE invoice_date >= '${startDate}' AND invoice_date <= '${endDate}'), 0) as current_revenue,
          COALESCE(SUM(amount) FILTER (WHERE invoice_date >= '${prevStartDate}' AND invoice_date <= '${prevEndDate}'), 0) as prev_revenue,
          COUNT(*) FILTER (WHERE invoice_date >= '${startDate}' AND invoice_date <= '${endDate}') as current_count,
          COUNT(*) FILTER (WHERE invoice_date >= '${prevStartDate}' AND invoice_date <= '${prevEndDate}') as prev_count
        FROM income_documents WHERE status != 'cancelled'
      `).catch((err: unknown) => { console.error("[executive-dashboard] revenueData query failed:", err); return [{}]; }),
      safeQuery(`
        SELECT
          COALESCE(SUM(amount) FILTER (WHERE expense_date >= '${startDate}' AND expense_date <= '${endDate}'), 0) as current_expenses,
          COALESCE(SUM(amount) FILTER (WHERE expense_date >= '${prevStartDate}' AND expense_date <= '${prevEndDate}'), 0) as prev_expenses
        FROM expenses WHERE status NOT IN ('cancelled','rejected')${combinedExpenseFilter}
      `).catch((err: unknown) => { console.error("[executive-dashboard] expenseData query failed:", err); return [{}]; }),
      safeQuery(`
        SELECT
          COALESCE(SUM(balance_due), 0) as total_outstanding,
          COUNT(*) FILTER (WHERE status = 'overdue' OR (status IN ('open','partial') AND due_date < CURRENT_DATE)) as overdue_count,
          COALESCE(SUM(balance_due) FILTER (WHERE status = 'overdue' OR (status IN ('open','partial') AND due_date < CURRENT_DATE)), 0) as overdue_amount,
          COALESCE(ROUND(AVG((CURRENT_DATE - due_date)::numeric) FILTER (WHERE status IN ('open','partial','overdue') AND due_date < CURRENT_DATE), 0), 0) as avg_days_overdue
        FROM accounts_receivable WHERE status != 'cancelled' AND status != 'written_off'
      `).catch((err: unknown) => { console.error("[executive-dashboard] arData query failed:", err); return [{}]; }),
      safeQuery(`
        SELECT
          COALESCE(SUM(balance_due), 0) as total_outstanding,
          COUNT(*) FILTER (WHERE status = 'overdue' OR (status IN ('open','partial') AND due_date < CURRENT_DATE)) as overdue_count,
          COALESCE(SUM(balance_due) FILTER (WHERE status = 'overdue' OR (status IN ('open','partial') AND due_date < CURRENT_DATE)), 0) as overdue_amount,
          COALESCE(SUM(balance_due) FILTER (WHERE due_date <= CURRENT_DATE + INTERVAL '7 days' AND status IN ('open','partial')), 0) as due_this_week
        FROM accounts_payable WHERE status != 'cancelled'
      `).catch((err: unknown) => { console.error("[executive-dashboard] apData query failed:", err); return [{}]; }),
      safeQuery(`
        SELECT COALESCE(SUM(current_balance), 0) as total_cash,
          COUNT(*) as account_count
        FROM bank_accounts WHERE is_active = true
      `).catch((err: unknown) => { console.error("[executive-dashboard] cashData query failed:", err); return [{}]; }),
      safeQuery(`
        SELECT
          COUNT(*) FILTER (WHERE status = 'active') as headcount,
          COALESCE(SUM(base_salary) FILTER (WHERE status = 'active'), 0) as total_salary
        FROM employees
      `).catch((err: unknown) => { console.error("[executive-dashboard] hrData query failed:", err); return [{}]; }),
      safeQuery(`
        SELECT
          COUNT(*) as open_orders,
          COALESCE(SUM(balance_due), 0) as open_orders_value
        FROM accounts_payable WHERE status IN ('open','partial')
          AND invoice_date >= '${startDate}' AND invoice_date <= '${endDate}'
      `).catch((err: unknown) => { console.error("[executive-dashboard] ordersData query failed:", err); return [{}]; }),
      safeQuery(`
        SELECT
          COALESCE(SUM(amount), 0) as total_budget,
          COALESCE(SUM(spent), 0) as total_spent
        FROM budgets WHERE status != 'cancelled'
          AND period_start <= '${endDate}' AND period_end >= '${startDate}'
          ${department ? `AND department = '${department.replace(/'/g, "''")}'` : ""}
      `).catch((err: unknown) => { console.error("[executive-dashboard] budgetData query failed:", err); return [{}]; }),
      safeQuery(`
        SELECT
          EXTRACT(MONTH FROM invoice_date)::int as month,
          COALESCE(SUM(amount), 0) as amount
        FROM income_documents
        WHERE status != 'cancelled' AND invoice_date >= '${startDate}' AND invoice_date <= '${endDate}'
        GROUP BY month ORDER BY month
      `).catch((err: unknown) => { console.error("[executive-dashboard] monthlyRevenue query failed:", err); return []; }),
      safeQuery(`
        SELECT
          EXTRACT(MONTH FROM expense_date)::int as month,
          COALESCE(SUM(amount), 0) as amount
        FROM expenses
        WHERE status NOT IN ('cancelled','rejected')
          AND expense_date >= '${startDate}' AND expense_date <= '${endDate}'
          ${combinedExpenseFilter}
        GROUP BY month ORDER BY month
      `).catch((err: unknown) => { console.error("[executive-dashboard] monthlyExpenses query failed:", err); return []; }),
      safeQuery(`
        SELECT category, COALESCE(SUM(amount), 0) as total
        FROM expenses
        WHERE status NOT IN ('cancelled','rejected')
          AND expense_date >= '${startDate}' AND expense_date <= '${endDate}'
          ${combinedExpenseFilter}
        GROUP BY category ORDER BY total DESC LIMIT 8
      `).catch((err: unknown) => { console.error("[executive-dashboard] expensesByCategory query failed:", err); return []; }),
      safeQuery(`
        SELECT
          m.month_num,
          COALESCE(inc.income, 0) as income,
          COALESCE(exp.expenses, 0) as expenses
        FROM generate_series(1, 12) as m(month_num)
        LEFT JOIN (
          SELECT EXTRACT(MONTH FROM invoice_date)::int as mn, SUM(amount) as income
          FROM income_documents WHERE status != 'cancelled' AND invoice_date >= '${startDate}' AND invoice_date <= '${endDate}'
          GROUP BY mn
        ) inc ON inc.mn = m.month_num
        LEFT JOIN (
          SELECT EXTRACT(MONTH FROM expense_date)::int as mn, SUM(amount) as expenses
          FROM expenses WHERE status NOT IN ('cancelled','rejected') AND expense_date >= '${startDate}' AND expense_date <= '${endDate}'${combinedExpenseFilter}
          GROUP BY mn
        ) exp ON exp.mn = m.month_num
        ORDER BY m.month_num
      `).catch((err: unknown) => { console.error("[executive-dashboard] monthlyCashFlow query failed:", err); return []; }),
      safeQuery(`
        SELECT
          COALESCE(e.department, 'כללי') as department,
          COUNT(*) as employee_count,
          COALESCE(SUM(e.base_salary), 0) as salary_cost,
          (SELECT COALESCE(SUM(ex.amount), 0) FROM expenses ex WHERE ex.category = e.department AND ex.status NOT IN ('cancelled','rejected') AND ex.expense_date >= '${startDate}' AND ex.expense_date <= '${endDate}') as dept_expenses
        FROM employees e WHERE e.status = 'active'
        GROUP BY e.department ORDER BY salary_cost DESC LIMIT 10
      `).catch((err: unknown) => { console.error("[executive-dashboard] departmentPerformance query failed:", err); return []; }),
      safeQuery(`
        SELECT COUNT(*) as count FROM approval_requests WHERE status = 'pending'
      `).catch((err: unknown) => { console.error("[executive-dashboard] pendingApprovals query failed:", err); return [{}]; }),
      safeQuery(`
        SELECT
          COUNT(*) FILTER (WHERE status = 'active') as active_customers,
          COUNT(*) as total_customers,
          COUNT(*) FILTER (WHERE created_at >= '${startDate}' AND created_at <= '${endDate}') as new_customers
        FROM sales_customers
      `).catch((err: unknown) => { console.error("[executive-dashboard] customersData query failed:", err); return [{}]; }),
    ]);

    const rev = revenueData[0] || {};
    const exp = expenseData[0] || {};
    const ar = arData[0] || {};
    const ap = apData[0] || {};
    const cash = cashData[0] || {};
    const hr = hrData[0] || {};
    const orders = ordersData[0] || {};
    const budget = budgetData[0] || {};
    const approvals = pendingApprovals[0] || {};
    const customers = customersData[0] || {};

    const currentRevenue = Number(rev.current_revenue || 0);
    const prevRevenue = Number(rev.prev_revenue || 0);
    const currentExpenses = Number(exp.current_expenses || 0);
    const prevExpenses = Number(exp.prev_expenses || 0);
    const grossProfit = currentRevenue - currentExpenses;
    const prevGrossProfit = prevRevenue - prevExpenses;
    const profitMargin = currentRevenue > 0 ? Math.round((grossProfit / currentRevenue) * 1000) / 10 : 0;

    function calcChange(current: number, previous: number): number {
      if (previous === 0) return current > 0 ? 100 : 0;
      return Math.round(((current - previous) / previous) * 1000) / 10;
    }

    const MONTH_NAMES_HE = ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"];

    const salesTrend = Array.from({ length: 12 }, (_, i) => {
      const m = i + 1;
      const revRow = (monthlyRevenue as MonthlyAmountRow[]).find((r) => Number(r.month) === m);
      const expRow = (monthlyExpenses as MonthlyAmountRow[]).find((r) => Number(r.month) === m);
      return {
        month: MONTH_NAMES_HE[i],
        revenue: Number(revRow?.amount || 0),
        expenses: Number(expRow?.amount || 0),
        profit: Number(revRow?.amount || 0) - Number(expRow?.amount || 0),
      };
    });

    const cashFlowData = (monthlyCashFlow as CashFlowDbRow[]).map((r) => ({
      month: MONTH_NAMES_HE[Number(r.month_num) - 1] || `חודש ${r.month_num}`,
      income: Number(r.income || 0),
      expenses: Number(r.expenses || 0),
      net: Number(r.income || 0) - Number(r.expenses || 0),
    }));

    const totalBudget = Number(budget.total_budget || 0);
    const totalSpent = Number(budget.total_spent || 0);
    const budgetUtilization = totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 1000) / 10 : 0;

    res.json({
      periodLabel,
      startDate,
      endDate,
      kpis: {
        revenue: { value: currentRevenue, change: calcChange(currentRevenue, prevRevenue), drillDown: "/finance" },
        expenses: { value: currentExpenses, change: calcChange(currentExpenses, prevExpenses), drillDown: "/finance" },
        grossProfit: { value: grossProfit, change: calcChange(grossProfit, prevGrossProfit), drillDown: "/reports/financial" },
        profitMargin: { value: profitMargin, drillDown: "/reports/financial" },
        openOrders: { value: Number(orders.open_orders || 0), amount: Number(orders.open_orders_value || 0), drillDown: "/purchase-orders" },
        pendingApprovals: { value: Number(approvals.count || 0), drillDown: "/purchase-approvals" },
        headcount: { value: Number(hr.headcount || 0), salaryCost: Number(hr.total_salary || 0), drillDown: "/hr" },
        cashBalance: { value: Number(cash.total_cash || 0), drillDown: "/finance" },
        activeCustomers: { value: Number(customers.active_customers || 0), amount: Number(customers.new_customers || 0), drillDown: "/sales/customers" },
      },
      financialSummary: {
        accountsReceivable: {
          outstanding: Number(ar.total_outstanding || 0),
          overdueCount: Number(ar.overdue_count || 0),
          overdueAmount: Number(ar.overdue_amount || 0),
          avgDaysOverdue: Number(ar.avg_days_overdue || 0),
        },
        accountsPayable: {
          outstanding: Number(ap.total_outstanding || 0),
          overdueCount: Number(ap.overdue_count || 0),
          overdueAmount: Number(ap.overdue_amount || 0),
          dueThisWeek: Number(ap.due_this_week || 0),
        },
        balance: {
          cash: Number(cash.total_cash || 0),
          receivables: Number(ar.total_outstanding || 0),
          payables: Number(ap.total_outstanding || 0),
          netPosition: Number(cash.total_cash || 0) + Number(ar.total_outstanding || 0) - Number(ap.total_outstanding || 0),
        },
        budgetVsActual: {
          budget: totalBudget,
          actual: totalSpent,
          utilization: budgetUtilization,
          remaining: totalBudget - totalSpent,
        },
      },
      charts: {
        salesTrend,
        expenseBreakdown: (expensesByCategory as ExpenseCategoryRow[]).map((e) => ({
          name: e.category || "אחר",
          value: Number(e.total || 0),
        })),
        cashFlow: cashFlowData,
        departmentPerformance: (() => {
          const mapped = (departmentPerformance as DeptPerformanceRow[]).map((d) => ({
            name: d.department || "כללי",
            employees: Number(d.employee_count || 0),
            salaryCost: Number(d.salary_cost || 0),
            expenses: Number(d.dept_expenses || 0),
          }));
          if (mapped.length > 0) return mapped;
          return [
            { name: "ייצור", employees: 0, salaryCost: 0, expenses: 0 },
            { name: "מכירות", employees: 0, salaryCost: 0, expenses: 0 },
            { name: "כספים", employees: 0, salaryCost: 0, expenses: 0 },
            { name: "משאבי אנוש", employees: 0, salaryCost: 0, expenses: 0 },
          ];
        })(),
      },
      departments: (departmentPerformance as DeptPerformanceRow[]).map((d) => d.department || "כללי"),
      modules: await (async () => {
        try {
          const mods = await safeQuery(`SELECT id, name, slug FROM platform_modules WHERE is_active = true ORDER BY name`);
          return (mods as ModuleRow[]).map((m) => ({ id: Number(m.id), name: m.name, slug: m.slug }));
        } catch (err) { console.error("[executive-dashboard] modules query failed:", err); return []; }
      })(),
      crossModuleSummary: await (async () => {
        try {
          return await getSystemSyncSummary();
        } catch (err) { console.error("[executive-dashboard] crossModuleSummary failed:", err); return {}; }
      })(),
      production: await (async () => {
        try {
          const [woStats, recentWO] = await Promise.all([
            safeQuery(`
              SELECT
                COUNT(*) FILTER (WHERE status = 'completed') as completed,
                COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress,
                COUNT(*) FILTER (WHERE status = 'planned') as planned,
                COUNT(*) FILTER (WHERE status = 'draft') as draft,
                COALESCE(SUM(quantity_produced), 0) as total_produced,
                COALESCE(SUM(quantity_planned), 0) as total_planned
              FROM production_work_orders
            `),
            safeQuery(`
              SELECT order_number as wo_number, product_name, status, priority,
                COALESCE(quantity_produced, 0) as produced, COALESCE(quantity_planned, 0) as planned,
                planned_start as start_date, planned_end as due_date
              FROM production_work_orders
              WHERE status IN ('in_progress','planned')
              ORDER BY CASE WHEN status='in_progress' THEN 0 ELSE 1 END, planned_end ASC LIMIT 5
            `),
          ]);
          const s = woStats[0] || {};
          return {
            completed: Number(s.completed || 0),
            inProgress: Number(s.in_progress || 0),
            planned: Number(s.planned || 0),
            draft: Number(s.draft || 0),
            totalProduced: Number(s.total_produced || 0),
            totalPlanned: Number(s.total_planned || 0),
            efficiency: Number(s.total_planned) > 0 ? Math.round(Number(s.total_produced) / Number(s.total_planned) * 100) : 0,
            recentWorkOrders: recentWO,
          };
        } catch (err) { console.error("[executive-dashboard] production query failed:", err); return null; }
      })(),
      recentActivity: await (async () => {
        try {
          const rows = await safeQuery(`
            SELECT action, entity_type, entity_id, details, created_at, user_id
            FROM audit_logs
            WHERE created_at >= CURRENT_DATE - INTERVAL '3 days'
            ORDER BY created_at DESC LIMIT 10
          `);
          return rows;
        } catch (err) { console.error("[executive-dashboard] recentActivity query failed:", err); return []; }
      })(),
      salesPipeline: await (async () => {
        try {
          const [quoteStats, orderStats, topCustomers] = await Promise.all([
            safeQuery(`
              SELECT
                COUNT(*) as total,
                COUNT(*) FILTER (WHERE status IN ('התקבל','התקבלה','אושרה','approved')) as approved,
                COUNT(*) FILTER (WHERE status IN ('בבדיקה','pending','ממתין')) as pending,
                COUNT(*) FILTER (WHERE status IN ('טיוטה','draft')) as draft,
                COALESCE(SUM(total_amount), 0) as total_value,
                COALESCE(SUM(total_amount) FILTER (WHERE status IN ('התקבל','התקבלה','אושרה','approved')), 0) as approved_value
              FROM price_quotes
              WHERE created_at >= '${startDate}' AND created_at <= '${endDate}'
            `),
            safeQuery(`
              SELECT
                COUNT(*) as total,
                COALESCE(SUM(total), 0) as total_value,
                COUNT(*) FILTER (WHERE status IN ('pending','in_production')) as active
              FROM sales_orders
              WHERE order_date >= '${startDate}' AND order_date <= '${endDate}'
            `),
            safeQuery(`
              SELECT c.name, COUNT(so.id) as order_count, COALESCE(SUM(so.total), 0) as total_value
              FROM sales_orders so
              LEFT JOIN sales_customers c ON c.id = so.customer_id
              WHERE so.order_date >= '${startDate}' AND so.order_date <= '${endDate}'
              GROUP BY c.name ORDER BY total_value DESC LIMIT 5
            `),
          ]);
          const q = quoteStats[0] || {};
          const o = orderStats[0] || {};
          return {
            quotes: { total: Number(q.total || 0), approved: Number(q.approved || 0), pending: Number(q.pending || 0), draft: Number(q.draft || 0), totalValue: Number(q.total_value || 0), approvedValue: Number(q.approved_value || 0) },
            orders: { total: Number(o.total || 0), totalValue: Number(o.total_value || 0), active: Number(o.active || 0) },
            topCustomers,
          };
        } catch (err) { console.error("[executive-dashboard] salesPipeline query failed:", err); return null; }
      })(),
      alerts: await (async () => {
        try {
          const alerts: Array<{ type: string; severity: string; message: string; count: number }> = [];
          const [overdueAR, overdueAP, lowBudget, pendingApprovalsList] = await Promise.all([
            safeQuery(`SELECT COUNT(*) as cnt, COALESCE(SUM(balance_due), 0) as total FROM accounts_receivable WHERE (status = 'overdue' OR (status IN ('open','partial') AND due_date < CURRENT_DATE)) AND status != 'cancelled'`),
            safeQuery(`SELECT COUNT(*) as cnt, COALESCE(SUM(balance_due), 0) as total FROM accounts_payable WHERE (status = 'overdue' OR (status IN ('open','partial') AND due_date < CURRENT_DATE)) AND status != 'cancelled'`),
            safeQuery(`SELECT COUNT(*) as cnt FROM budgets WHERE status != 'cancelled' AND spent > amount * 0.9`),
            safeQuery(`SELECT COUNT(*) as cnt FROM approval_requests WHERE status = 'pending' AND created_at < CURRENT_DATE - INTERVAL '3 days'`),
          ]);
          const arOd = overdueAR[0] || {};
          const apOd = overdueAP[0] || {};
          if (Number(arOd.cnt) > 0) alerts.push({ type: "ar_overdue", severity: "medium", message: `${arOd.cnt} חשבוניות חייבים באיחור (₪${Number(arOd.total).toLocaleString()})`, count: Number(arOd.cnt) });
          if (Number(apOd.cnt) > 0) alerts.push({ type: "ap_overdue", severity: "medium", message: `${apOd.cnt} חשבוניות ספקים באיחור (₪${Number(apOd.total).toLocaleString()})`, count: Number(apOd.cnt) });
          if (Number((lowBudget[0] || {}).cnt) >= 2) alerts.push({ type: "budget_warning", severity: "high", message: `${(lowBudget[0] as any).cnt} תקציבים חרגו מ-90%`, count: Number((lowBudget[0] as any).cnt) });
          if (Number((pendingApprovalsList[0] || {}).cnt) > 0) alerts.push({ type: "stale_approvals", severity: "medium", message: `${(pendingApprovalsList[0] as any).cnt} אישורים ממתינים מעל 3 ימים`, count: Number((pendingApprovalsList[0] as any).cnt) });
          return alerts;
        } catch (err) { console.error("[executive-dashboard] alerts query failed:", err); return []; }
      })(),
      inventory: await (async () => {
        try {
          const [stats, lowStockItems, categoryBreakdown] = await Promise.all([
            safeQuery(`
              SELECT
                COUNT(*) as total_items,
                COUNT(*) FILTER (WHERE current_stock <= minimum_stock AND minimum_stock > 0) as low_stock,
                COUNT(*) FILTER (WHERE current_stock <= reorder_point AND reorder_point > 0) as below_reorder,
                COUNT(*) FILTER (WHERE current_stock = 0) as out_of_stock,
                COALESCE(SUM(current_stock * COALESCE(standard_price, 0)), 0) as total_value,
                COUNT(DISTINCT supplier_id) as supplier_count
              FROM raw_materials WHERE status IN ('פעיל', 'active')
            `),
            safeQuery(`
              SELECT material_number, material_name, current_stock, minimum_stock, reorder_point, unit
              FROM raw_materials
              WHERE status IN ('פעיל', 'active') AND current_stock <= COALESCE(reorder_point, minimum_stock, 0) AND COALESCE(reorder_point, minimum_stock, 0) > 0
              ORDER BY current_stock ASC LIMIT 8
            `),
            safeQuery(`
              SELECT COALESCE(category, 'אחר') as name, COUNT(*) as count,
                COALESCE(SUM(current_stock * COALESCE(standard_price, 0)), 0) as value
              FROM raw_materials WHERE status IN ('פעיל', 'active')
              GROUP BY category ORDER BY value DESC LIMIT 6
            `),
          ]);
          const s = stats[0] || {};
          return {
            totalItems: Number(s.total_items || 0),
            lowStock: Number(s.low_stock || 0),
            belowReorder: Number(s.below_reorder || 0),
            outOfStock: Number(s.out_of_stock || 0),
            totalValue: Number(s.total_value || 0),
            supplierCount: Number(s.supplier_count || 0),
            lowStockItems,
            categoryBreakdown,
          };
        } catch (err) { console.error("[executive-dashboard] inventory query failed:", err); return null; }
      })(),
      projects: await (async () => {
        try {
          const [stats, recentProjects] = await Promise.all([
            safeQuery(`
              SELECT
                COUNT(*) as total,
                COUNT(*) FILTER (WHERE status = 'active') as active,
                COUNT(*) FILTER (WHERE status = 'completed') as completed,
                COUNT(*) FILTER (WHERE status IN ('on_hold','paused')) as on_hold,
                COALESCE(SUM(estimated_revenue), 0) as total_estimated_revenue,
                COALESCE(SUM(actual_revenue), 0) as total_actual_revenue,
                COALESCE(SUM(estimated_cost), 0) as total_estimated_cost,
                COALESCE(SUM(actual_cost), 0) as total_actual_cost,
                COALESCE(AVG(completion_pct) FILTER (WHERE status = 'active'), 0) as avg_completion
              FROM projects
            `),
            safeQuery(`
              SELECT project_number, project_name, customer_name, status, completion_pct, start_date, end_date, profit_margin
              FROM projects
              WHERE status IN ('active','in_progress')
              ORDER BY end_date ASC NULLS LAST LIMIT 6
            `),
          ]);
          const s = stats[0] || {};
          return {
            total: Number(s.total || 0),
            active: Number(s.active || 0),
            completed: Number(s.completed || 0),
            onHold: Number(s.on_hold || 0),
            estimatedRevenue: Number(s.total_estimated_revenue || 0),
            actualRevenue: Number(s.total_actual_revenue || 0),
            estimatedCost: Number(s.total_estimated_cost || 0),
            actualCost: Number(s.total_actual_cost || 0),
            avgCompletion: Math.round(Number(s.avg_completion || 0)),
            recentProjects,
          };
        } catch (err) { console.error("[executive-dashboard] projects query failed:", err); return null; }
      })(),
      suppliers: await (async () => {
        try {
          const [stats] = await Promise.all([
            safeQuery(`
              SELECT
                COUNT(*) as total,
                COUNT(*) FILTER (WHERE status = 'active') as active,
                COUNT(*) FILTER (WHERE rating IS NOT NULL) as rated,
                COALESCE(AVG(rating) FILTER (WHERE rating IS NOT NULL), 0) as avg_rating
              FROM suppliers
            `),
          ]);
          const s = stats[0] || {};
          return { total: Number(s.total || 0), active: Number(s.active || 0), rated: Number(s.rated || 0), avgRating: Math.round(Number(s.avg_rating || 0) * 10) / 10 };
        } catch (err) { console.error("[executive-dashboard] suppliers query failed:", err); return null; }
      })(),
      invoiceAging: await (async () => {
        try {
          const [arAging, apAging] = await Promise.all([
            safeQuery(`
              SELECT
                COUNT(*) FILTER (WHERE CURRENT_DATE - due_date BETWEEN 0 AND 30) as d0_30_count,
                COALESCE(SUM(balance_due) FILTER (WHERE CURRENT_DATE - due_date BETWEEN 0 AND 30), 0) as d0_30_amount,
                COUNT(*) FILTER (WHERE CURRENT_DATE - due_date BETWEEN 31 AND 60) as d31_60_count,
                COALESCE(SUM(balance_due) FILTER (WHERE CURRENT_DATE - due_date BETWEEN 31 AND 60), 0) as d31_60_amount,
                COUNT(*) FILTER (WHERE CURRENT_DATE - due_date BETWEEN 61 AND 90) as d61_90_count,
                COALESCE(SUM(balance_due) FILTER (WHERE CURRENT_DATE - due_date BETWEEN 61 AND 90), 0) as d61_90_amount,
                COUNT(*) FILTER (WHERE CURRENT_DATE - due_date > 90) as d90_plus_count,
                COALESCE(SUM(balance_due) FILTER (WHERE CURRENT_DATE - due_date > 90), 0) as d90_plus_amount,
                COUNT(*) FILTER (WHERE due_date > CURRENT_DATE) as current_count,
                COALESCE(SUM(balance_due) FILTER (WHERE due_date > CURRENT_DATE), 0) as current_amount
              FROM accounts_receivable WHERE status IN ('open','partial','overdue') AND balance_due > 0
            `),
            safeQuery(`
              SELECT
                COUNT(*) FILTER (WHERE CURRENT_DATE - due_date BETWEEN 0 AND 30) as d0_30_count,
                COALESCE(SUM(balance_due) FILTER (WHERE CURRENT_DATE - due_date BETWEEN 0 AND 30), 0) as d0_30_amount,
                COUNT(*) FILTER (WHERE CURRENT_DATE - due_date BETWEEN 31 AND 60) as d31_60_count,
                COALESCE(SUM(balance_due) FILTER (WHERE CURRENT_DATE - due_date BETWEEN 31 AND 60), 0) as d31_60_amount,
                COUNT(*) FILTER (WHERE CURRENT_DATE - due_date BETWEEN 61 AND 90) as d61_90_count,
                COALESCE(SUM(balance_due) FILTER (WHERE CURRENT_DATE - due_date BETWEEN 61 AND 90), 0) as d61_90_amount,
                COUNT(*) FILTER (WHERE CURRENT_DATE - due_date > 90) as d90_plus_count,
                COALESCE(SUM(balance_due) FILTER (WHERE CURRENT_DATE - due_date > 90), 0) as d90_plus_amount,
                COUNT(*) FILTER (WHERE due_date > CURRENT_DATE) as current_count,
                COALESCE(SUM(balance_due) FILTER (WHERE due_date > CURRENT_DATE), 0) as current_amount
              FROM accounts_payable WHERE status IN ('open','partial','overdue') AND balance_due > 0
            `),
          ]);
          const a = arAging[0] || {};
          const p = apAging[0] || {};
          return {
            receivable: {
              current: { count: Number(a.current_count || 0), amount: Number(a.current_amount || 0) },
              d0_30: { count: Number(a.d0_30_count || 0), amount: Number(a.d0_30_amount || 0) },
              d31_60: { count: Number(a.d31_60_count || 0), amount: Number(a.d31_60_amount || 0) },
              d61_90: { count: Number(a.d61_90_count || 0), amount: Number(a.d61_90_amount || 0) },
              d90_plus: { count: Number(a.d90_plus_count || 0), amount: Number(a.d90_plus_amount || 0) },
            },
            payable: {
              current: { count: Number(p.current_count || 0), amount: Number(p.current_amount || 0) },
              d0_30: { count: Number(p.d0_30_count || 0), amount: Number(p.d0_30_amount || 0) },
              d31_60: { count: Number(p.d31_60_count || 0), amount: Number(p.d31_60_amount || 0) },
              d61_90: { count: Number(p.d61_90_count || 0), amount: Number(p.d61_90_amount || 0) },
              d90_plus: { count: Number(p.d90_plus_count || 0), amount: Number(p.d90_plus_amount || 0) },
            },
          };
        } catch (err) { console.error("[executive-dashboard] invoiceAging query failed:", err); return null; }
      })(),
      automations: await (async () => {
        try {
          const [flowCount, recentRuns] = await Promise.all([
            safeQuery(`SELECT COUNT(*) as cnt FROM automation_log WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'`).catch((err) => { console.error("[executive-dashboard] automations count query failed:", err); return [{ cnt: 0 }]; }),
            safeQuery(`SELECT flow_id, flow_name, affected, status, created_at FROM automation_log ORDER BY created_at DESC LIMIT 5`).catch((err) => { console.error("[executive-dashboard] automations recent runs query failed:", err); return []; }),
          ]);
          return { totalRuns7d: Number((flowCount[0] as any)?.cnt || 0), recentRuns };
        } catch (err) { console.error("[executive-dashboard] automations query failed:", err); return { totalRuns7d: 0, recentRuns: [] }; }
      })(),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[executive-dashboard] outer catch:", err);
    res.json({
      kpis: {},
      financialSummary: null,
      charts: null,
      departments: [],
      modules: [],
      production: null,
      salesPipeline: null,
      inventory: null,
      projects: null,
      suppliers: null,
      automations: null,
      invoiceAging: null,
      alerts: [{ type: "error", severity: "high", message: `שגיאה בטעינת נתונים: ${message}`, count: 0 }],
      recentActivity: [],
      _error: true,
    });
  }
});

router.post("/reports-center/executive-dashboard/export-excel", async (req: Request, res: Response) => {
  try {
    const data = req.body;
    const workbook = new ExcelJS.Workbook();

    function addAoaSheet(wb: ExcelJS.Workbook, rows: any[][], sheetName: string, colWidths: number[]) {
      const ws = wb.addWorksheet(sheetName);
      ws.columns = colWidths.map(w => ({ width: w }));
      rows.forEach(row => ws.addRow(row));
    }

    const kpiRows = [
      ["מדד", "ערך", "שינוי (%)"],
      ["הכנסות", data.kpis?.revenue?.value || 0, data.kpis?.revenue?.change || 0],
      ["הוצאות", data.kpis?.expenses?.value || 0, data.kpis?.expenses?.change || 0],
      ["רווח גולמי", data.kpis?.grossProfit?.value || 0, data.kpis?.grossProfit?.change || 0],
      ["שולי רווח (%)", data.kpis?.profitMargin?.value || 0, ""],
      ["הזמנות פתוחות", data.kpis?.openOrders?.value || 0, ""],
      ["ממתינים לאישור", data.kpis?.pendingApprovals?.value || 0, ""],
      ["עובדים", data.kpis?.headcount?.value || 0, ""],
      ["יתרת מזומן", data.kpis?.cashBalance?.value || 0, ""],
    ];
    addAoaSheet(workbook, kpiRows, "KPIs", [20, 15, 12]);

    const fsData = data.financialSummary || {};
    const finRows = [
      ["קטגוריה", "מדד", "ערך"],
      ["חייבים", "יתרה פתוחה", fsData.accountsReceivable?.outstanding || 0],
      ["חייבים", "באיחור", fsData.accountsReceivable?.overdueAmount || 0],
      ["חייבים", "חשבוניות באיחור", fsData.accountsReceivable?.overdueCount || 0],
      ["חייבים", "ממוצע ימי איחור", fsData.accountsReceivable?.avgDaysOverdue || 0],
      ["זכאים", "יתרה פתוחה", fsData.accountsPayable?.outstanding || 0],
      ["זכאים", "באיחור", fsData.accountsPayable?.overdueAmount || 0],
      ["זכאים", "לתשלום השבוע", fsData.accountsPayable?.dueThisWeek || 0],
      ["מאזן", "מזומן", fsData.balance?.cash || 0],
      ["מאזן", "חייבים", fsData.balance?.receivables || 0],
      ["מאזן", "זכאים", fsData.balance?.payables || 0],
      ["מאזן", "מצב נטו", fsData.balance?.netPosition || 0],
      ["תקציב", "מתוכנן", fsData.budgetVsActual?.budget || 0],
      ["תקציב", "בפועל", fsData.budgetVsActual?.actual || 0],
      ["תקציב", "ניצול (%)", fsData.budgetVsActual?.utilization || 0],
      ["תקציב", "יתרה", fsData.budgetVsActual?.remaining || 0],
    ];
    addAoaSheet(workbook, finRows, "סיכום פיננסי", [15, 20, 15]);

    if (data.charts?.salesTrend) {
      const trendRows = [
        ["חודש", "הכנסות", "הוצאות", "רווח"],
        ...data.charts.salesTrend.map((r: ExportSalesTrendRow) => [r.month, r.revenue, r.expenses, r.profit]),
      ];
      addAoaSheet(workbook, trendRows, "מגמת מכירות", [12, 12, 12, 12]);
    }

    if (data.charts?.expenseBreakdown) {
      const expRows = [
        ["קטגוריה", "סכום"],
        ...data.charts.expenseBreakdown.map((r: ExportExpenseRow) => [r.name, r.value]),
      ];
      addAoaSheet(workbook, expRows, "פילוח הוצאות", [20, 15]);
    }

    if (data.charts?.departmentPerformance) {
      const deptRows = [
        ["מחלקה", "עובדים", "עלות שכר", "הוצאות"],
        ...data.charts.departmentPerformance.map((r: ExportDeptRow) => [r.name, r.employees, r.salaryCost, r.expenses]),
      ];
      addAoaSheet(workbook, deptRows, "מחלקות", [15, 10, 15, 15]);
    }

    const buf = await workbook.xlsx.writeBuffer();
    const fileName = `executive-dashboard-${new Date().toISOString().slice(0, 10)}.xlsx`;
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    res.send(Buffer.from(buf));
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

router.get("/reports-center/cross-module-summary", async (_req: Request, res: Response) => {
  try {
    const summary = await getSystemSyncSummary();
    res.json(summary);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

// ========== BI FINANCIAL STATEMENTS ==========

router.get("/reports-center/bi/profit-loss", async (req: Request, res: Response) => {
  try {
    const { startDate, endDate, periodLabel } = parsePeriodParams(req);
    const prevYear = parseInt(startDate.slice(0, 4)) - 1;
    const prevStart = `${prevYear}${startDate.slice(4)}`;
    const prevEnd = `${prevYear}${endDate.slice(4)}`;

    const [incomeRows, expenseRows, prevIncomeByCategory, prevExpenseByCategory, prevIncomeRows, prevExpenseRows] = await Promise.all([
      safeQuery(`SELECT COALESCE(products, 'הכנסות כלליות') as category, COALESCE(SUM(amount), 0) as amount FROM income_documents WHERE status != 'cancelled' AND invoice_date >= '${startDate}' AND invoice_date <= '${endDate}' GROUP BY category ORDER BY amount DESC`),
      safeQuery(`SELECT COALESCE(category, 'הוצאות כלליות') as category, COALESCE(SUM(amount), 0) as amount FROM expenses WHERE status NOT IN ('cancelled','rejected') AND expense_date >= '${startDate}' AND expense_date <= '${endDate}' GROUP BY category ORDER BY amount DESC`),
      safeQuery(`SELECT COALESCE(products, 'הכנסות כלליות') as category, COALESCE(SUM(amount), 0) as amount FROM income_documents WHERE status != 'cancelled' AND invoice_date >= '${prevStart}' AND invoice_date <= '${prevEnd}' GROUP BY category`),
      safeQuery(`SELECT COALESCE(category, 'הוצאות כלליות') as category, COALESCE(SUM(amount), 0) as amount FROM expenses WHERE status NOT IN ('cancelled','rejected') AND expense_date >= '${prevStart}' AND expense_date <= '${prevEnd}' GROUP BY category`),
      safeQuery(`SELECT COALESCE(SUM(amount), 0) as total FROM income_documents WHERE status != 'cancelled' AND invoice_date >= '${prevStart}' AND invoice_date <= '${prevEnd}'`),
      safeQuery(`SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE status NOT IN ('cancelled','rejected') AND expense_date >= '${prevStart}' AND expense_date <= '${prevEnd}'`),
    ]);

    const totalIncome = incomeRows.reduce((s: number, r: any) => s + Number(r.amount || 0), 0);
    const totalExpenses = expenseRows.reduce((s: number, r: any) => s + Number(r.amount || 0), 0);
    const grossProfit = totalIncome - totalExpenses;
    const prevIncome = Number((prevIncomeRows[0] as any)?.total || 0);
    const prevExpenses = Number((prevExpenseRows[0] as any)?.total || 0);
    const prevGrossProfit = prevIncome - prevExpenses;

    const prevIncomeMap: Record<string, number> = {};
    (prevIncomeByCategory as any[]).forEach((r: any) => { prevIncomeMap[r.category] = Number(r.amount || 0); });
    const prevExpenseMap: Record<string, number> = {};
    (prevExpenseByCategory as any[]).forEach((r: any) => { prevExpenseMap[r.category] = Number(r.amount || 0); });

    const incomeLines = incomeRows.map((r: any) => ({
      label: r.category,
      current: Number(r.amount || 0),
      prior: prevIncomeMap[r.category] || 0,
      drillDown: `/reports-center/bi/drill-down/income?category=${encodeURIComponent(r.category)}&startDate=${startDate}&endDate=${endDate}`,
    }));

    const expenseLines = expenseRows.map((r: any) => ({
      label: r.category,
      current: Number(r.amount || 0),
      prior: prevExpenseMap[r.category] || 0,
      drillDown: `/reports-center/bi/drill-down/expenses?category=${encodeURIComponent(r.category)}&startDate=${startDate}&endDate=${endDate}`,
    }));

    res.json({
      periodLabel, startDate, endDate,
      sections: [
        { title: "הכנסות", lines: incomeLines, total: totalIncome, priorTotal: prevIncome },
        { title: "הוצאות", lines: expenseLines, total: totalExpenses, priorTotal: prevExpenses },
      ],
      summary: {
        totalIncome, prevIncome,
        totalExpenses, prevExpenses,
        grossProfit, prevGrossProfit,
        profitMargin: totalIncome > 0 ? Math.round((grossProfit / totalIncome) * 1000) / 10 : 0,
        incomeChange: prevIncome > 0 ? Math.round(((totalIncome - prevIncome) / prevIncome) * 1000) / 10 : 0,
        expenseChange: prevExpenses > 0 ? Math.round(((totalExpenses - prevExpenses) / prevExpenses) * 1000) / 10 : 0,
        profitChange: prevGrossProfit !== 0 ? Math.round(((grossProfit - prevGrossProfit) / Math.abs(prevGrossProfit)) * 1000) / 10 : 0,
      },
    });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get("/reports-center/bi/balance-sheet", async (req: Request, res: Response) => {
  try {
    const { startDate, endDate, periodLabel } = parsePeriodParams(req);
    const prevYear = parseInt(startDate.slice(0, 4)) - 1;

    const [cashAccounts, arRows, apRows, fixedAssets, faAccounts, liabilityAccounts, prevIncomeRow, prevExpenseRow, prevArRows, prevApRows] = await Promise.all([
      safeQuery(`SELECT COALESCE(SUM(current_balance), 0) as cash FROM bank_accounts WHERE is_active = true`),
      safeQuery(`SELECT COALESCE(SUM(balance_due), 0) as ar FROM accounts_receivable WHERE status IN ('open','partial','overdue')`),
      safeQuery(`SELECT COALESCE(SUM(balance_due), 0) as ap FROM accounts_payable WHERE status IN ('open','partial','overdue')`),
      safeQuery(`SELECT COALESCE(SUM(current_value), 0) as fixed_assets FROM fixed_assets WHERE status = 'active'`),
      safeQuery(`SELECT account_name, COALESCE(SUM(balance), 0) as balance, account_type FROM financial_accounts WHERE is_active = true GROUP BY account_name, account_type ORDER BY account_type, balance DESC`),
      safeQuery(`SELECT COALESCE(SUM(balance_due), 0) as total FROM accounts_payable WHERE status IN ('open','partial','overdue') AND due_date > CURRENT_DATE + INTERVAL '1 year'`),
      safeQuery(`SELECT COALESCE(SUM(amount), 0) as total FROM income_documents WHERE status != 'cancelled' AND EXTRACT(YEAR FROM invoice_date) = ${prevYear}`),
      safeQuery(`SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE status NOT IN ('cancelled','rejected') AND EXTRACT(YEAR FROM expense_date) = ${prevYear}`),
      safeQuery(`SELECT COALESCE(SUM(original_amount), 0) as ar FROM accounts_receivable WHERE EXTRACT(YEAR FROM invoice_date) = ${prevYear}`),
      safeQuery(`SELECT COALESCE(SUM(original_amount), 0) as ap FROM accounts_payable WHERE EXTRACT(YEAR FROM invoice_date) = ${prevYear}`),
    ]);

    const cash = Number((cashAccounts[0] as any)?.cash || 0);
    const ar = Number((arRows[0] as any)?.ar || 0);
    const ap = Number((apRows[0] as any)?.ap || 0);
    const fa = Number((fixedAssets[0] as any)?.fixed_assets || 0);
    const longTermLiab = Number((liabilityAccounts[0] as any)?.total || 0);
    const prevAr = Number((prevArRows[0] as any)?.ar || 0);
    const prevAp = Number((prevApRows[0] as any)?.ap || 0);

    const assetAccounts = faAccounts.filter((r: any) => r.account_type === 'asset');
    const liabAccounts = faAccounts.filter((r: any) => r.account_type === 'liability');
    const equityAccounts = faAccounts.filter((r: any) => r.account_type === 'equity');

    const totalCurrentAssets = cash + ar;
    const totalNonCurrentAssets = fa + assetAccounts.reduce((s: number, r: any) => s + Number(r.balance || 0), 0);
    const totalAssets = totalCurrentAssets + totalNonCurrentAssets;
    const totalCurrentLiab = ap + liabAccounts.reduce((s: number, r: any) => s + Number(r.balance || 0), 0);
    const totalLongTermLiab = longTermLiab;
    const totalLiabilities = totalCurrentLiab + totalLongTermLiab;
    // Equity = Assets - Liabilities (accounting identity)
    // Paid-in capital comes from equity accounts in GL; retained earnings is the residual
    const equityFromGL = equityAccounts.reduce((s: number, r: any) => s + Number(r.balance || 0), 0);
    const retainedEarnings = totalAssets - totalLiabilities - equityFromGL;
    const totalEquity = totalAssets - totalLiabilities; // Assets = Liabilities + Equity

    // Prior year comparative: use income/expense totals from prior year as proxy for prior balance sheet position
    const prevIncomePY = Number((prevIncomeRow[0] as any)?.total || 0);
    const prevExpensePY = Number((prevExpenseRow[0] as any)?.total || 0);
    const prevRetainedEarnings = prevIncomePY - prevExpensePY;

    const prevTotalCurrentAssets = prevAr;
    const prevTotalLiab = prevAp;

    res.json({
      periodLabel, startDate, endDate, prevYear,
      assets: {
        current: [
          { label: "מזומן ושווי מזומן", amount: cash, prior: 0 },
          { label: "חייבים (AR)", amount: ar, prior: prevAr },
          ...assetAccounts.slice(0, 5).map((r: any) => ({ label: r.account_name, amount: Number(r.balance || 0), prior: 0 })),
        ],
        nonCurrent: [
          { label: "רכוש קבוע נטו", amount: fa, prior: 0 },
        ],
        totalCurrent: totalCurrentAssets,
        totalNonCurrent: totalNonCurrentAssets,
        total: totalAssets,
        prevTotalCurrent: prevTotalCurrentAssets,
      },
      liabilities: {
        current: [
          { label: "ספקים (AP)", amount: ap, prior: prevAp },
          ...liabAccounts.slice(0, 5).map((r: any) => ({ label: r.account_name, amount: Number(r.balance || 0), prior: 0 })),
        ],
        longTerm: [
          { label: "התחייבויות לטווח ארוך", amount: totalLongTermLiab, prior: 0 },
        ],
        totalCurrent: totalCurrentLiab,
        totalLongTerm: totalLongTermLiab,
        total: totalLiabilities,
        prevTotalCurrent: prevTotalLiab,
      },
      equity: {
        lines: equityAccounts.slice(0, 5).map((r: any) => ({ label: r.account_name, amount: Number(r.balance || 0), prior: 0 })),
        retainedEarnings,
        total: totalEquity,
        prevRetainedEarnings,
      },
      totalLiabilitiesAndEquity: totalLiabilities + totalEquity,
      balanced: Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 1,
      comparative: { year: String(prevYear) },
    });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get("/reports-center/bi/cash-flow", async (req: Request, res: Response) => {
  try {
    const { startDate, endDate, periodLabel } = parsePeriodParams(req);
    const year = parseInt(startDate.slice(0, 4));
    const prevStartDate = `${year - 1}-01-01`;
    const prevEndDate = `${year - 1}-12-31`;

    const [operatingIn, operatingOut, monthlyFlow, arActivity, apActivity, cashBalance, prevOperatingIn, prevOperatingOut] = await Promise.all([
      safeQuery(`SELECT COALESCE(SUM(paid_amount), 0) as collected FROM accounts_receivable WHERE updated_at >= '${startDate}' AND updated_at <= '${endDate}' AND paid_amount > 0`),
      safeQuery(`SELECT COALESCE(SUM(amount), 0) as paid FROM expenses WHERE status = 'paid' AND expense_date >= '${startDate}' AND expense_date <= '${endDate}'`),
      safeQuery(`SELECT EXTRACT(MONTH FROM invoice_date)::int as month, COALESCE(SUM(amount), 0) as income FROM income_documents WHERE status != 'cancelled' AND invoice_date >= '${startDate}' AND invoice_date <= '${endDate}' GROUP BY month ORDER BY month`),
      safeQuery(`SELECT COALESCE(SUM(balance_due), 0) as total_ar, COUNT(*) as count FROM accounts_receivable WHERE status IN ('open','partial','overdue')`),
      safeQuery(`SELECT COALESCE(SUM(balance_due), 0) as total_ap, COUNT(*) as count FROM accounts_payable WHERE status IN ('open','partial','overdue')`),
      safeQuery(`SELECT COALESCE(SUM(current_balance), 0) as balance FROM bank_accounts WHERE is_active = true`),
      safeQuery(`SELECT COALESCE(SUM(paid_amount), 0) as collected FROM accounts_receivable WHERE updated_at >= '${prevStartDate}' AND updated_at <= '${prevEndDate}' AND paid_amount > 0`),
      safeQuery(`SELECT COALESCE(SUM(amount), 0) as paid FROM expenses WHERE status = 'paid' AND expense_date >= '${prevStartDate}' AND expense_date <= '${prevEndDate}'`),
    ]);

    const cashIn = Number((operatingIn[0] as any)?.collected || 0);
    const cashOut = Number((operatingOut[0] as any)?.paid || 0);
    const netCash = cashIn - cashOut;
    const arTotal = Number((arActivity[0] as any)?.total_ar || 0);
    const apTotal = Number((apActivity[0] as any)?.total_ap || 0);
    const currentBalance = Number((cashBalance[0] as any)?.balance || 0);
    const prevCashIn = Number((prevOperatingIn[0] as any)?.collected || 0);
    const prevCashOut = Number((prevOperatingOut[0] as any)?.paid || 0);
    const prevNetCash = prevCashIn - prevCashOut;

    const [monthlyExpQuery, prevMonthlyIncQuery, prevMonthlyExpQuery] = await Promise.all([
      safeQuery(`SELECT EXTRACT(MONTH FROM expense_date)::int as month, COALESCE(SUM(amount), 0) as expenses FROM expenses WHERE status NOT IN ('cancelled','rejected') AND expense_date >= '${startDate}' AND expense_date <= '${endDate}' GROUP BY month ORDER BY month`),
      safeQuery(`SELECT EXTRACT(MONTH FROM invoice_date)::int as month, COALESCE(SUM(amount), 0) as income FROM income_documents WHERE status != 'cancelled' AND invoice_date >= '${prevStartDate}' AND invoice_date <= '${prevEndDate}' GROUP BY month ORDER BY month`),
      safeQuery(`SELECT EXTRACT(MONTH FROM expense_date)::int as month, COALESCE(SUM(amount), 0) as expenses FROM expenses WHERE status NOT IN ('cancelled','rejected') AND expense_date >= '${prevStartDate}' AND expense_date <= '${prevEndDate}' GROUP BY month ORDER BY month`),
    ]);

    const monthlyData = Array.from({ length: 12 }, (_, i) => {
      const m = i + 1;
      const inc = (monthlyFlow as any[]).find((r: any) => Number(r.month) === m);
      const exp = (monthlyExpQuery as any[]).find((r: any) => Number(r.month) === m);
      const prevInc = (prevMonthlyIncQuery as any[]).find((r: any) => Number(r.month) === m);
      const prevExp = (prevMonthlyExpQuery as any[]).find((r: any) => Number(r.month) === m);
      const inflow = Number(inc?.income || 0);
      const outflow = Number(exp?.expenses || 0);
      const prevInflow = Number(prevInc?.income || 0);
      const prevOutflow = Number(prevExp?.expenses || 0);
      return { month: m, inflow, outflow, net: inflow - outflow, prevInflow, prevOutflow, prevNet: prevInflow - prevOutflow };
    });

    res.json({
      periodLabel, startDate, endDate, prevYear: year - 1,
      operating: { cashIn, cashOut, net: netCash, prevCashIn, prevCashOut, prevNet: prevNetCash },
      investing: { assetPurchases: 0, assetDisposals: 0, net: 0 },
      financing: { loanProceeds: 0, loanRepayments: 0, net: 0 },
      netChange: netCash, prevNetChange: prevNetCash,
      openingBalance: currentBalance - netCash,
      closingBalance: currentBalance,
      monthlyFlow: monthlyData,
      workingCapital: { ar: arTotal, ap: apTotal, net: arTotal - apTotal },
    });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get("/reports-center/bi/trial-balance", async (req: Request, res: Response) => {
  try {
    const { startDate, endDate, periodLabel } = parsePeriodParams(req);
    const year = parseInt(startDate.slice(0, 4));
    const prevStartDate = `${year - 1}-01-01`;
    const prevEndDate = `${year - 1}-12-31`;

    const [glRows, faRows, prevGlRows, prevFaRows] = await Promise.all([
      safeQuery(`SELECT account_number, account_name, account_type, COALESCE(SUM(debit_amount), 0) as debit, COALESCE(SUM(credit_amount), 0) as credit FROM general_ledger WHERE entry_date >= '${startDate}' AND entry_date <= '${endDate}' GROUP BY account_number, account_name, account_type ORDER BY account_number`),
      safeQuery(`SELECT gl_account as account_number, 'רכוש קבוע' as account_name, 'asset' as account_type, COALESCE(SUM(purchase_price), 0) as debit, COALESCE(SUM(accumulated_depreciation), 0) as credit FROM fixed_assets WHERE status != 'disposed' AND gl_account IS NOT NULL GROUP BY gl_account`),
      safeQuery(`SELECT account_number, COALESCE(SUM(debit_amount), 0) as debit, COALESCE(SUM(credit_amount), 0) as credit FROM general_ledger WHERE entry_date >= '${prevStartDate}' AND entry_date <= '${prevEndDate}' GROUP BY account_number`),
      safeQuery(`SELECT gl_account as account_number, COALESCE(SUM(purchase_price), 0) as debit, COALESCE(SUM(accumulated_depreciation), 0) as credit FROM fixed_assets WHERE status != 'disposed' AND gl_account IS NOT NULL GROUP BY gl_account`),
    ]);

    const accounts = [...glRows, ...faRows];
    const prevAccountsMap = new Map<string, { debit: number; credit: number }>();
    [...prevGlRows, ...prevFaRows].forEach((r: any) => {
      const key = String(r.account_number);
      const existing = prevAccountsMap.get(key) || { debit: 0, credit: 0 };
      prevAccountsMap.set(key, { debit: existing.debit + Number(r.debit || 0), credit: existing.credit + Number(r.credit || 0) });
    });

    const totalDebit = accounts.reduce((s: number, r: any) => s + Number(r.debit || 0), 0);
    const totalCredit = accounts.reduce((s: number, r: any) => s + Number(r.credit || 0), 0);

    res.json({
      periodLabel, startDate, endDate, prevYear: year - 1,
      accounts: accounts.map((r: any) => {
        const prev = prevAccountsMap.get(String(r.account_number)) || { debit: 0, credit: 0 };
        return {
          accountNumber: r.account_number,
          accountName: r.account_name,
          accountType: r.account_type,
          debit: Number(r.debit || 0),
          credit: Number(r.credit || 0),
          balance: Number(r.debit || 0) - Number(r.credit || 0),
          prevDebit: prev.debit,
          prevCredit: prev.credit,
          prevBalance: prev.debit - prev.credit,
        };
      }),
      totals: { debit: totalDebit, credit: totalCredit, difference: totalDebit - totalCredit },
      balanced: Math.abs(totalDebit - totalCredit) < 1,
    });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get("/reports-center/bi/drill-down/income", async (req: Request, res: Response) => {
  try {
    const { startDate, endDate } = parsePeriodParams(req);
    const category = (req.query.category as string) || "";
    const safeCategory = category.replace(/'/g, "''");
    const rows = await safeQuery(`SELECT id, invoice_number, invoice_date, customer_name, products, amount, status FROM income_documents WHERE status != 'cancelled' AND invoice_date >= '${startDate}' AND invoice_date <= '${endDate}'${safeCategory ? ` AND products ILIKE '%${safeCategory}%'` : ""} ORDER BY invoice_date DESC LIMIT 200`);
    res.json({ category, rows, count: rows.length });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get("/reports-center/bi/drill-down/expenses", async (req: Request, res: Response) => {
  try {
    const { startDate, endDate } = parsePeriodParams(req);
    const category = (req.query.category as string) || "";
    const safeCategory = category.replace(/'/g, "''");
    const rows = await safeQuery(`SELECT id, expense_number, expense_date, supplier_name, category, amount, status FROM expenses WHERE status NOT IN ('cancelled','rejected') AND expense_date >= '${startDate}' AND expense_date <= '${endDate}'${safeCategory ? ` AND category = '${safeCategory}'` : ""} ORDER BY expense_date DESC LIMIT 200`);
    res.json({ category, rows, count: rows.length });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get("/reports-center/bi/drill-down/balance-sheet", async (req: Request, res: Response) => {
  try {
    const section = (req.query.section as string) || "ar";
    let rows: any[] = [];
    if (section === "ar") {
      rows = await safeQuery(`SELECT id, invoice_number, invoice_date, customer_name, original_amount, balance_due, status, due_date FROM accounts_receivable WHERE status IN ('open','partial','overdue') ORDER BY balance_due DESC LIMIT 200`);
    } else if (section === "ap") {
      rows = await safeQuery(`SELECT id, ap_number, invoice_number, invoice_date, supplier_name, original_amount, balance_due, status, due_date FROM accounts_payable WHERE status IN ('open','partial','overdue') ORDER BY balance_due DESC LIMIT 200`);
    } else if (section === "cash") {
      rows = await safeQuery(`SELECT id, account_name, account_number, bank_name, current_balance, currency FROM bank_accounts WHERE is_active = true ORDER BY current_balance DESC`);
    } else if (section === "fixed_assets") {
      rows = await safeQuery(`SELECT id, asset_name, asset_type, purchase_price, current_value, accumulated_depreciation, status FROM fixed_assets WHERE status = 'active' ORDER BY current_value DESC LIMIT 100`);
    }
    res.json({ section, rows, count: rows.length });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get("/reports-center/bi/drill-down/trial-balance", async (req: Request, res: Response) => {
  try {
    const { startDate, endDate } = parsePeriodParams(req);
    const accountNumber = (req.query.accountNumber as string) || "";
    const safeAcct = accountNumber.replace(/'/g, "''");
    let rows: any[] = [];
    if (safeAcct) {
      rows = await safeQuery(`SELECT id, entry_number, entry_date, description, debit_amount, credit_amount, account_number, account_name FROM general_ledger WHERE account_number = '${safeAcct}' AND entry_date >= '${startDate}' AND entry_date <= '${endDate}' ORDER BY entry_date DESC LIMIT 200`);
    } else {
      rows = await safeQuery(`SELECT id, entry_number, entry_date, description, debit_amount, credit_amount, account_number, account_name FROM general_ledger WHERE entry_date >= '${startDate}' AND entry_date <= '${endDate}' ORDER BY entry_date DESC LIMIT 200`);
    }
    res.json({ accountNumber, rows, count: rows.length });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ========== BI SALES ANALYTICS ==========

router.get("/reports-center/bi/sales", async (req: Request, res: Response) => {
  try {
    const { startDate, endDate, periodLabel } = parsePeriodParams(req);
    const prevYear = parseInt(startDate.slice(0, 4)) - 1;
    const prevStart = `${prevYear}${startDate.slice(4)}`;
    const prevEnd = `${prevYear}${endDate.slice(4)}`;

    const [byCustomer, byProduct, bySalesperson, monthlyTrend, prevRevRow, currentRevRow, orderStats, byTerritory, bottomCustomers, bottomProducts, bottomSalesperson] = await Promise.all([
      safeQuery(`SELECT customer_name as name, COALESCE(SUM(amount), 0) as revenue, COUNT(*) as invoices FROM income_documents WHERE status != 'cancelled' AND invoice_date >= '${startDate}' AND invoice_date <= '${endDate}' GROUP BY customer_name ORDER BY revenue DESC LIMIT 20`),
      safeQuery(`SELECT COALESCE(products, 'אחר') as name, COALESCE(SUM(amount), 0) as revenue, COUNT(*) as invoices FROM income_documents WHERE status != 'cancelled' AND invoice_date >= '${startDate}' AND invoice_date <= '${endDate}' GROUP BY products ORDER BY revenue DESC LIMIT 20`),
      safeQuery(`SELECT COALESCE(c.sales_rep, c.assigned_to, id.assigned_to, 'לא שויך') as name, COALESCE(SUM(id.amount), 0) as revenue, COUNT(*) as invoices FROM income_documents id LEFT JOIN customers c ON c.name = id.customer_name WHERE id.status != 'cancelled' AND id.invoice_date >= '${startDate}' AND id.invoice_date <= '${endDate}' GROUP BY COALESCE(c.sales_rep, c.assigned_to, id.assigned_to, 'לא שויך') ORDER BY revenue DESC LIMIT 20`),
      safeQuery(`SELECT EXTRACT(MONTH FROM invoice_date)::int as month, COALESCE(SUM(amount), 0) as revenue, COUNT(*) as invoices FROM income_documents WHERE status != 'cancelled' AND invoice_date >= '${startDate}' AND invoice_date <= '${endDate}' GROUP BY month ORDER BY month`),
      safeQuery(`SELECT COALESCE(SUM(amount), 0) as total FROM income_documents WHERE status != 'cancelled' AND invoice_date >= '${prevStart}' AND invoice_date <= '${prevEnd}'`),
      safeQuery(`SELECT COALESCE(SUM(amount), 0) as total, COUNT(*) as count, COALESCE(AVG(amount), 0) as avg_deal FROM income_documents WHERE status != 'cancelled' AND invoice_date >= '${startDate}' AND invoice_date <= '${endDate}'`),
      safeQuery(`SELECT COUNT(*) as total_orders, COALESCE(SUM(total), 0) as orders_value, COALESCE(AVG(total), 0) as avg_order FROM sales_orders WHERE created_at >= '${startDate}' AND created_at <= '${endDate}'`),
      safeQuery(`SELECT COALESCE(c.city, 'לא ידוע') as territory, COUNT(DISTINCT id.customer_name) as customers, COALESCE(SUM(id.amount), 0) as revenue, COUNT(*) as invoices FROM income_documents id LEFT JOIN customers c ON c.name = id.customer_name WHERE id.status != 'cancelled' AND id.invoice_date >= '${startDate}' AND id.invoice_date <= '${endDate}' GROUP BY territory ORDER BY revenue DESC LIMIT 15`),
      safeQuery(`SELECT customer_name as name, COALESCE(SUM(amount), 0) as revenue, COUNT(*) as invoices FROM income_documents WHERE status != 'cancelled' AND invoice_date >= '${startDate}' AND invoice_date <= '${endDate}' GROUP BY customer_name ORDER BY revenue ASC LIMIT 10`),
      safeQuery(`SELECT COALESCE(products, 'אחר') as name, COALESCE(SUM(amount), 0) as revenue, COUNT(*) as invoices FROM income_documents WHERE status != 'cancelled' AND invoice_date >= '${startDate}' AND invoice_date <= '${endDate}' GROUP BY products ORDER BY revenue ASC LIMIT 10`),
      safeQuery(`SELECT COALESCE(c.sales_rep, c.assigned_to, id.assigned_to, 'לא שויך') as name, COALESCE(SUM(id.amount), 0) as revenue, COUNT(*) as invoices FROM income_documents id LEFT JOIN customers c ON c.name = id.customer_name WHERE id.status != 'cancelled' AND id.invoice_date >= '${startDate}' AND id.invoice_date <= '${endDate}' GROUP BY COALESCE(c.sales_rep, c.assigned_to, id.assigned_to, 'לא שויך') ORDER BY revenue ASC LIMIT 10`),
    ]);

    const currentRev = Number((currentRevRow[0] as any)?.total || 0);
    const prevRev = Number((prevRevRow[0] as any)?.total || 0);
    const yoyGrowth = prevRev > 0 ? Math.round(((currentRev - prevRev) / prevRev) * 1000) / 10 : 0;

    const monthly = Array.from({ length: 12 }, (_, i) => {
      const m = i + 1;
      const row = (monthlyTrend as any[]).find((r: any) => Number(r.month) === m);
      return { month: m, revenue: Number(row?.revenue || 0), invoices: Number(row?.invoices || 0) };
    });

    const totalCustomerRevenue = (byCustomer as any[]).reduce((s: number, r: any) => s + Number(r.revenue || 0), 0) || 1;

    res.json({
      periodLabel, startDate, endDate,
      summary: {
        totalRevenue: currentRev,
        prevRevenue: prevRev,
        yoyGrowth,
        invoiceCount: Number((currentRevRow[0] as any)?.count || 0),
        avgDealSize: Number((currentRevRow[0] as any)?.avg_deal || 0),
        totalOrders: Number((orderStats[0] as any)?.total_orders || 0),
        ordersValue: Number((orderStats[0] as any)?.orders_value || 0),
      },
      byCustomer: (byCustomer as any[]).map((r: any) => ({
        name: r.name,
        revenue: Number(r.revenue || 0),
        invoices: Number(r.invoices || 0),
        share: Math.round((Number(r.revenue || 0) / totalCustomerRevenue) * 1000) / 10,
      })),
      byProduct: (byProduct as any[]).map((r: any) => ({
        name: r.name,
        revenue: Number(r.revenue || 0),
        invoices: Number(r.invoices || 0),
      })),
      bySalesperson: (bySalesperson as any[]).map((r: any) => ({
        name: r.name,
        revenue: Number(r.revenue || 0),
        invoices: Number(r.invoices || 0),
      })),
      byTerritory: (byTerritory as any[]).map((r: any) => ({
        territory: r.territory,
        customers: Number(r.customers || 0),
        revenue: Number(r.revenue || 0),
        invoices: Number(r.invoices || 0),
        share: Math.round((Number(r.revenue || 0) / (currentRev || 1)) * 1000) / 10,
      })),
      bottomCustomers: (bottomCustomers as any[]).map((r: any) => ({
        name: r.name,
        revenue: Number(r.revenue || 0),
        invoices: Number(r.invoices || 0),
      })),
      bottomProducts: (bottomProducts as any[]).map((r: any) => ({
        name: r.name,
        revenue: Number(r.revenue || 0),
        invoices: Number(r.invoices || 0),
      })),
      bottomSalesperson: (bottomSalesperson as any[]).map((r: any) => ({
        name: r.name,
        revenue: Number(r.revenue || 0),
        invoices: Number(r.invoices || 0),
      })),
      monthlyTrend: monthly,
    });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ========== BI PRODUCTION ANALYTICS ==========

router.get("/reports-center/bi/production", async (req: Request, res: Response) => {
  try {
    const { startDate, endDate, periodLabel } = parsePeriodParams(req);

    const [workOrderStats, byMachine, byOperator, wasteStats, costBreakdown, monthlyOutput, wasteByMachine] = await Promise.all([
      safeQuery(`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status='completed') as completed, COUNT(*) FILTER (WHERE status='in_progress') as in_progress, COUNT(*) FILTER (WHERE status='planned') as planned, COALESCE(SUM(quantity_ordered), 0) as total_ordered, COALESCE(SUM(quantity_completed), 0) as total_completed, COALESCE(SUM(quantity_rejected), 0) as total_rejected, COALESCE(SUM(total_cost), 0) as total_cost, COALESCE(SUM(estimated_hours), 0) as estimated_hours, COALESCE(SUM(actual_hours), 0) as actual_hours FROM work_orders WHERE created_at >= '${startDate}' AND created_at <= '${endDate}'`),
      safeQuery(`SELECT COALESCE(machine_name, 'לא צוין') as machine, COUNT(*) as orders, COALESCE(SUM(quantity_completed), 0) as output, COALESCE(SUM(quantity_rejected), 0) as rejected, COALESCE(SUM(total_cost), 0) as cost FROM work_orders WHERE created_at >= '${startDate}' AND created_at <= '${endDate}' AND machine_name IS NOT NULL GROUP BY machine_name ORDER BY output DESC LIMIT 15`),
      safeQuery(`SELECT COALESCE(assigned_to, 'לא שויך') as operator, COUNT(*) as orders, COALESCE(SUM(quantity_completed), 0) as output, COALESCE(SUM(actual_hours), 0) as hours, COALESCE(SUM(total_cost), 0) as cost FROM work_orders WHERE created_at >= '${startDate}' AND created_at <= '${endDate}' GROUP BY assigned_to ORDER BY output DESC LIMIT 15`),
      safeQuery(`SELECT COALESCE(SUM(quantity_rejected), 0) as total_waste, COALESCE(SUM(quantity_completed), 0) as total_output, COALESCE(SUM(quantity_ordered), 0) as total_planned FROM work_orders WHERE created_at >= '${startDate}' AND created_at <= '${endDate}'`),
      safeQuery(`SELECT COALESCE(SUM(material_cost), 0) as material_cost, COALESCE(SUM(labor_cost), 0) as labor_cost, COALESCE(SUM(overhead_cost), 0) as overhead_cost, COALESCE(SUM(total_cost), 0) as total_cost FROM work_orders WHERE created_at >= '${startDate}' AND created_at <= '${endDate}'`),
      safeQuery(`SELECT EXTRACT(MONTH FROM created_at)::int as month, COUNT(*) as orders, COALESCE(SUM(quantity_completed), 0) as output FROM work_orders WHERE created_at >= '${startDate}' AND created_at <= '${endDate}' GROUP BY month ORDER BY month`),
      safeQuery(`SELECT COALESCE(machine_name, 'לא צוין') as machine, COALESCE(SUM(quantity_rejected), 0) as rejected, COALESCE(SUM(quantity_completed), 0) as output, COALESCE(SUM(quantity_rejected) * 100.0 / NULLIF(SUM(quantity_completed) + SUM(quantity_rejected), 0), 0) as waste_pct FROM work_orders WHERE created_at >= '${startDate}' AND created_at <= '${endDate}' AND machine_name IS NOT NULL GROUP BY machine_name HAVING SUM(quantity_rejected) > 0 ORDER BY rejected DESC LIMIT 10`),
    ]);

    const ws = (workOrderStats[0] as any) || {};
    const waste = (wasteStats[0] as any) || {};
    const costs = (costBreakdown[0] as any) || {};

    const totalOrdered = Number(ws.total_ordered || 0);
    const totalCompleted = Number(ws.total_completed || 0);
    const totalRejected = Number(ws.total_rejected || 0);
    const completionRate = totalOrdered > 0 ? Math.round((totalCompleted / totalOrdered) * 1000) / 10 : 0;
    const wasteRate = (totalCompleted + totalRejected) > 0 ? Math.round((totalRejected / (totalCompleted + totalRejected)) * 1000) / 10 : 0;
    const estimatedHours = Number(ws.estimated_hours || 0);
    const actualHours = Number(ws.actual_hours || 0);
    const efficiency = estimatedHours > 0 && actualHours > 0 ? Math.round((estimatedHours / actualHours) * 1000) / 10 : 0;

    const monthly = Array.from({ length: 12 }, (_, i) => {
      const m = i + 1;
      const row = (monthlyOutput as any[]).find((r: any) => Number(r.month) === m);
      return { month: m, orders: Number(row?.orders || 0), output: Number(row?.output || 0) };
    });

    res.json({
      periodLabel, startDate, endDate,
      summary: {
        totalOrders: Number(ws.total || 0),
        completed: Number(ws.completed || 0),
        inProgress: Number(ws.in_progress || 0),
        planned: Number(ws.planned || 0),
        totalOutput: totalCompleted,
        completionRate,
        wasteRate,
        efficiency,
        estimatedHours,
        actualHours,
        totalCost: Number(ws.total_cost || 0),
      },
      byMachine: (byMachine as any[]).map((r: any) => ({
        machine: r.machine,
        orders: Number(r.orders || 0),
        output: Number(r.output || 0),
        rejected: Number(r.rejected || 0),
        cost: Number(r.cost || 0),
        wasteRate: (Number(r.output || 0) + Number(r.rejected || 0)) > 0 ? Math.round((Number(r.rejected || 0) / (Number(r.output || 0) + Number(r.rejected || 0))) * 1000) / 10 : 0,
      })),
      byOperator: (byOperator as any[]).map((r: any) => ({
        operator: r.operator,
        orders: Number(r.orders || 0),
        output: Number(r.output || 0),
        hours: Number(r.hours || 0),
        cost: Number(r.cost || 0),
        outputPerHour: Number(r.hours || 0) > 0 ? Math.round((Number(r.output || 0) / Number(r.hours || 0)) * 10) / 10 : 0,
      })),
      wasteSummary: {
        totalRejected,
        totalOutput: totalCompleted,
        wasteRate,
      },
      wastePareto: (() => {
        const rows = (wasteByMachine as any[]).map((r: any) => ({
          machine: r.machine,
          rejected: Number(r.rejected || 0),
          wastePct: Math.round(Number(r.waste_pct || 0) * 10) / 10,
        }));
        const totalWaste = rows.reduce((s, r) => s + r.rejected, 0) || 1;
        let cumulative = 0;
        return rows.map((r) => {
          cumulative += r.rejected;
          return { ...r, cumulative: Math.round((cumulative / totalWaste) * 1000) / 10 };
        });
      })(),
      costBreakdown: {
        material: Number(costs.material_cost || 0),
        labor: Number(costs.labor_cost || 0),
        overhead: Number(costs.overhead_cost || 0),
        total: Number(costs.total_cost || 0),
      },
      monthlyOutput: monthly,
    });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ========== BI INVENTORY ANALYTICS ==========

router.get("/reports-center/bi/inventory", async (req: Request, res: Response) => {
  try {
    const { startDate, endDate, periodLabel } = parsePeriodParams(req);
    const slowMovingDays = parseInt((req.query.slowMovingDays as string) || "90");
    const deadStockDays = parseInt((req.query.deadStockDays as string) || "180");
    // Valuation method: 'weighted_avg' (default) or 'fifo'
    const valuationMethod = ((req.query.valuationMethod as string) || "weighted_avg") === "fifo" ? "fifo" : "weighted_avg";

    const [stockValuation, agingBuckets, slowMoving, deadStock, reorderAlerts, categoryBreakdown, receivedInPeriod] = await Promise.all([
      safeQuery(`SELECT COALESCE(SUM(total_value), 0) as total_value, COALESCE(SUM(quantity), 0) as total_qty, COALESCE(AVG(unit_cost), 0) as avg_unit_cost, COALESCE(SUM(quantity * unit_cost), 0) as weighted_avg_value, COUNT(*) as sku_count FROM raw_material_stock`),
      safeQuery(`SELECT 
        COALESCE(SUM(total_value) FILTER (WHERE received_date >= CURRENT_DATE - INTERVAL '30 days'), 0) as bucket_0_30,
        COALESCE(SUM(total_value) FILTER (WHERE received_date >= CURRENT_DATE - INTERVAL '60 days' AND received_date < CURRENT_DATE - INTERVAL '30 days'), 0) as bucket_31_60,
        COALESCE(SUM(total_value) FILTER (WHERE received_date >= CURRENT_DATE - INTERVAL '90 days' AND received_date < CURRENT_DATE - INTERVAL '60 days'), 0) as bucket_61_90,
        COALESCE(SUM(total_value) FILTER (WHERE received_date >= CURRENT_DATE - INTERVAL '120 days' AND received_date < CURRENT_DATE - INTERVAL '90 days'), 0) as bucket_91_120,
        COALESCE(SUM(total_value) FILTER (WHERE received_date < CURRENT_DATE - INTERVAL '120 days'), 0) as bucket_120_plus,
        COALESCE(SUM(total_value) FILTER (WHERE received_date IS NULL), 0) as bucket_unknown
        FROM raw_material_stock`),
      safeQuery(`SELECT rms.id, rms.material_id, rms.quantity, rms.unit_cost, rms.total_value, rms.received_date, EXTRACT(DAY FROM CURRENT_DATE - rms.received_date)::int as days_old FROM raw_material_stock rms WHERE rms.received_date < CURRENT_DATE - INTERVAL '${slowMovingDays} days' AND rms.received_date >= CURRENT_DATE - INTERVAL '${deadStockDays} days' AND rms.quantity > 0 ORDER BY days_old DESC LIMIT 50`),
      safeQuery(`SELECT rms.id, rms.material_id, rms.quantity, rms.unit_cost, rms.total_value, rms.received_date, EXTRACT(DAY FROM CURRENT_DATE - rms.received_date)::int as days_old FROM raw_material_stock rms WHERE rms.received_date < CURRENT_DATE - INTERVAL '${deadStockDays} days' AND rms.quantity > 0 ORDER BY days_old DESC LIMIT 50`),
      safeQuery(`SELECT rms.material_id, rms.quantity, rms.unit_cost, m.reorder_point, m.minimum_stock, m.material_name FROM raw_material_stock rms LEFT JOIN materials m ON m.material_number = rms.material_id WHERE rms.quantity > 0 AND rms.quantity <= COALESCE(m.reorder_point, m.minimum_stock, 5) LIMIT 50`),
      safeQuery(`SELECT COALESCE(quality_status, 'לא ידוע') as category, COUNT(*) as count, COALESCE(SUM(total_value), 0) as value FROM raw_material_stock GROUP BY quality_status ORDER BY value DESC`),
      safeQuery(`SELECT COUNT(*) as received_count, COALESCE(SUM(total_value), 0) as received_value FROM raw_material_stock WHERE received_date >= '${startDate}' AND received_date <= '${endDate}'`),
    ]);

    const val = (stockValuation[0] as any) || {};
    const aging = (agingBuckets[0] as any) || {};
    const received = (receivedInPeriod[0] as any) || {};

    // Apply valuation method:
    // Weighted average: SUM(quantity * unit_cost) / SUM(quantity) per unit, total = SUM(total_value)
    // FIFO: value older stock at older cost — approximated as total_value (already FIFO-like since each row is a received batch)
    const weightedAvgValue = Number(val.weighted_avg_value || val.total_value || 0);
    const fifoValue = Number(val.total_value || 0); // FIFO = sum of batch costs (already stored per-receipt)
    const computedTotalValue = valuationMethod === "fifo" ? fifoValue : weightedAvgValue;

    res.json({
      periodLabel, startDate, endDate, valuationMethod,
      valuation: {
        totalValue: computedTotalValue,
        totalValueFIFO: fifoValue,
        totalValueWeightedAvg: weightedAvgValue,
        totalQty: Number(val.total_qty || 0),
        avgUnitCost: Number(val.avg_unit_cost || 0),
        skuCount: Number(val.sku_count || 0),
        receivedInPeriod: Number(received.received_count || 0),
        receivedValue: Number(received.received_value || 0),
      },
      aging: {
        bucket0_30: Number(aging.bucket_0_30 || 0),
        bucket31_60: Number(aging.bucket_31_60 || 0),
        bucket61_90: Number(aging.bucket_61_90 || 0),
        bucket91_120: Number(aging.bucket_91_120 || 0),
        bucket120Plus: Number(aging.bucket_120_plus || 0),
        bucketUnknown: Number(aging.bucket_unknown || 0),
      },
      slowMoving: (slowMoving as any[]).map((r: any) => ({
        materialId: r.material_id,
        quantity: Number(r.quantity || 0),
        unitCost: Number(r.unit_cost || 0),
        totalValue: Number(r.total_value || 0),
        daysOld: Number(r.days_old || 0),
        receivedDate: r.received_date,
        isDeadStock: false,
      })),
      deadStock: (deadStock as any[]).map((r: any) => ({
        materialId: r.material_id,
        quantity: Number(r.quantity || 0),
        unitCost: Number(r.unit_cost || 0),
        totalValue: Number(r.total_value || 0),
        daysOld: Number(r.days_old || 0),
        receivedDate: r.received_date,
        isDeadStock: true,
      })),
      reorderAlerts: (reorderAlerts as any[]).map((r: any) => ({
        materialId: r.material_id,
        currentQty: Number(r.quantity || 0),
        unitCost: Number(r.unit_cost || 0),
      })),
      categoryBreakdown: (categoryBreakdown as any[]).map((r: any) => ({
        category: r.category,
        count: Number(r.count || 0),
        value: Number(r.value || 0),
      })),
    });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ========== BI HR ANALYTICS ==========

router.get("/reports-center/bi/hr", async (req: Request, res: Response) => {
  try {
    const { startDate, endDate, periodLabel } = parsePeriodParams(req);

    const [headcountByDept, turnoverData, attendanceStats, overtimeStats, laborCost, hiresAndSeps, leaveStats, absenceMonthly] = await Promise.all([
      safeQuery(`SELECT COALESCE(department, 'לא מוגדר') as department, COUNT(*) as headcount, COALESCE(SUM(base_salary), 0) as salary_cost FROM employees WHERE status = 'active' GROUP BY department ORDER BY headcount DESC`),
      safeQuery(`SELECT COUNT(*) FILTER (WHERE status = 'active') as active, COUNT(*) FILTER (WHERE status = 'inactive' OR status = 'terminated') as terminated, COUNT(*) as total FROM employees`),
      safeQuery(`SELECT COUNT(*) as total_records, COALESCE(AVG(work_hours), 0) as avg_hours, COALESCE(SUM(overtime_hours), 0) as total_overtime, COUNT(*) FILTER (WHERE work_hours < 4) as absent_records FROM attendance_records WHERE date >= '${startDate}' AND date <= '${endDate}'`),
      safeQuery(`SELECT COALESCE(department, 'לא מוגדר') as department, COALESCE(SUM(overtime_hours), 0) as overtime_hours, COUNT(DISTINCT employee_name) as employees FROM attendance_records WHERE date >= '${startDate}' AND date <= '${endDate}' AND overtime_hours > 0 GROUP BY department ORDER BY overtime_hours DESC LIMIT 10`),
      safeQuery(`SELECT COALESCE(department, 'לא מוגדר') as department, COUNT(*) as headcount, COALESCE(SUM(base_salary), 0) as salary_cost, COALESCE(SUM(base_salary * 0.25), 0) as benefits_cost FROM employees WHERE status = 'active' GROUP BY department ORDER BY salary_cost DESC`),
      safeQuery(`SELECT COUNT(*) FILTER (WHERE created_at >= '${startDate}' AND created_at <= '${endDate}') as new_hires, COUNT(*) FILTER (WHERE updated_at >= '${startDate}' AND updated_at <= '${endDate}' AND (status = 'inactive' OR status = 'terminated')) as separations FROM employees`),
      safeQuery(`SELECT leave_type, COUNT(*) as count, COALESCE(SUM(total_days), 0) as total_days FROM leave_requests WHERE status IN ('approved','completed') AND start_date >= '${startDate}' AND start_date <= '${endDate}' GROUP BY leave_type ORDER BY count DESC`),
      safeQuery(`SELECT EXTRACT(MONTH FROM date)::int as month, COUNT(*) as total_records, COUNT(*) FILTER (WHERE work_hours < 4) as absent_records, COALESCE(SUM(overtime_hours), 0) as overtime_hours FROM attendance_records WHERE date >= '${startDate}' AND date <= '${endDate}' GROUP BY month ORDER BY month`),
    ]);

    const turnover = (turnoverData[0] as any) || {};
    const attendance = (attendanceStats[0] as any) || {};
    const hiresRows = (hiresAndSeps[0] as any) || {};

    const activeEmployees = Number(turnover.active || 0);
    const terminated = Number(turnover.terminated || 0);
    const total = Number(turnover.total || 1);
    const newHires = Number(hiresRows.new_hires || 0);
    const separations = Number(hiresRows.separations || 0);
    const avgHeadcount = (activeEmployees + (activeEmployees + separations - newHires)) / 2 || 1;
    const turnoverRate = Math.round((separations / avgHeadcount) * 1000) / 10;
    const totalAttendance = Number(attendance.total_records || 0);
    const absentRecords = Number(attendance.absent_records || 0);
    const absenceRate = totalAttendance > 0 ? Math.round((absentRecords / totalAttendance) * 1000) / 10 : 0;

    const MONTH_HE = ["ינו","פבר","מרץ","אפר","מאי","יונ","יול","אוג","ספט","אוק","נוב","דצמ"];
    const absenceTrend = Array.from({ length: 12 }, (_, i) => {
      const m = i + 1;
      const row = (absenceMonthly as any[]).find((r: any) => Number(r.month) === m);
      const total_r = Number(row?.total_records || 0);
      const absent_r = Number(row?.absent_records || 0);
      return { month: m, name: MONTH_HE[i], total: total_r, absent: absent_r, rate: total_r > 0 ? Math.round((absent_r / total_r) * 1000) / 10 : 0, overtime: Number(row?.overtime_hours || 0) };
    });

    res.json({
      periodLabel, startDate, endDate,
      summary: {
        totalHeadcount: activeEmployees,
        newHires,
        separations,
        turnoverRate,
        totalOvertimeHours: Number(attendance.total_overtime || 0),
        avgWorkHours: Number(attendance.avg_hours || 0),
        absenceRate,
      },
      headcountByDept: (headcountByDept as any[]).map((r: any) => ({
        department: r.department,
        headcount: Number(r.headcount || 0),
        salaryCost: Number(r.salary_cost || 0),
      })),
      laborCostByDept: (laborCost as any[]).map((r: any) => ({
        department: r.department,
        headcount: Number(r.headcount || 0),
        salaryCost: Number(r.salary_cost || 0),
        benefitsCost: Number(r.benefits_cost || 0),
        totalCost: Number(r.salary_cost || 0) + Number(r.benefits_cost || 0),
      })),
      overtimeByDept: (overtimeStats as any[]).map((r: any) => ({
        department: r.department,
        overtimeHours: Number(r.overtime_hours || 0),
        employees: Number(r.employees || 0),
      })),
      leaveBreakdown: (leaveStats as any[]).map((r: any) => ({
        leaveType: r.leave_type,
        count: Number(r.count || 0),
        totalDays: Number(r.total_days || 0),
      })),
      turnoverData: {
        active: activeEmployees,
        terminated,
        newHires,
        separations,
        turnoverRate,
      },
      absenceTrend,
    });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
