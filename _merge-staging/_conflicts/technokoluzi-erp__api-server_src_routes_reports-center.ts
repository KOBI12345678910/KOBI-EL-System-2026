import { Router, Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { validateSession } from "../lib/auth";
import { getSystemSyncSummary } from "../lib/data-sync";

const router = Router();

async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.substring(7) : null;
  if (!token) { res.status(401).json({ error: "נדרשת התחברות" }); return; }
  const result = await validateSession(token);
  if (result.error || !result.user) { res.status(401).json({ error: "הסשן פג תוקף" }); return; }
  (req as any).user = result.user;
  next();
}

router.use("/reports-center", requireAuth as any);

async function safeQuery(query: string) {
  try {
    const result = await Promise.race([
      db.execute(sql.raw(query)),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("DB query timeout (3s)")), 3000)),
    ]);
    return result.rows || [];
  } catch (err: any) {
    console.error("Reports query error:", err.message);
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
        alerts: [{ type: "warning", message: "מסד הנתונים לא זמין כרגע — מוצגים נתונים ריקים" }],
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
      `),
      safeQuery(`
        SELECT
          COALESCE(SUM(amount) FILTER (WHERE expense_date >= '${startDate}' AND expense_date <= '${endDate}'), 0) as current_expenses,
          COALESCE(SUM(amount) FILTER (WHERE expense_date >= '${prevStartDate}' AND expense_date <= '${prevEndDate}'), 0) as prev_expenses
        FROM expenses WHERE status NOT IN ('cancelled','rejected')${combinedExpenseFilter}
      `),
      safeQuery(`
        SELECT
          COALESCE(SUM(balance_due), 0) as total_outstanding,
          COUNT(*) FILTER (WHERE status = 'overdue' OR (status IN ('open','partial') AND due_date < CURRENT_DATE)) as overdue_count,
          COALESCE(SUM(balance_due) FILTER (WHERE status = 'overdue' OR (status IN ('open','partial') AND due_date < CURRENT_DATE)), 0) as overdue_amount,
          COALESCE(ROUND(AVG((CURRENT_DATE - due_date)::numeric) FILTER (WHERE status IN ('open','partial','overdue') AND due_date < CURRENT_DATE), 0), 0) as avg_days_overdue
        FROM accounts_receivable WHERE status != 'cancelled' AND status != 'written_off'
      `),
      safeQuery(`
        SELECT
          COALESCE(SUM(balance_due), 0) as total_outstanding,
          COUNT(*) FILTER (WHERE status = 'overdue' OR (status IN ('open','partial') AND due_date < CURRENT_DATE)) as overdue_count,
          COALESCE(SUM(balance_due) FILTER (WHERE status = 'overdue' OR (status IN ('open','partial') AND due_date < CURRENT_DATE)), 0) as overdue_amount,
          COALESCE(SUM(balance_due) FILTER (WHERE due_date <= CURRENT_DATE + INTERVAL '7 days' AND status IN ('open','partial')), 0) as due_this_week
        FROM accounts_payable WHERE status != 'cancelled'
      `),
      safeQuery(`
        SELECT COALESCE(SUM(current_balance), 0) as total_cash,
          COUNT(*) as account_count
        FROM bank_accounts WHERE is_active = true
      `),
      safeQuery(`
        SELECT
          COUNT(*) FILTER (WHERE status = 'active') as headcount,
          COALESCE(SUM(base_salary) FILTER (WHERE status = 'active'), 0) as total_salary
        FROM employees
      `),
      safeQuery(`
        SELECT
          COUNT(*) as open_orders,
          COALESCE(SUM(balance_due), 0) as open_orders_value
        FROM accounts_payable WHERE status IN ('open','partial')
          AND invoice_date >= '${startDate}' AND invoice_date <= '${endDate}'
      `),
      safeQuery(`
        SELECT
          COALESCE(SUM(amount), 0) as total_budget,
          COALESCE(SUM(spent), 0) as total_spent
        FROM budgets WHERE status != 'cancelled'
          AND period_start <= '${endDate}' AND period_end >= '${startDate}'
          ${department ? `AND department = '${department.replace(/'/g, "''")}'` : ""}
      `),
      safeQuery(`
        SELECT
          EXTRACT(MONTH FROM invoice_date)::int as month,
          COALESCE(SUM(amount), 0) as amount
        FROM income_documents
        WHERE status != 'cancelled' AND invoice_date >= '${startDate}' AND invoice_date <= '${endDate}'
        GROUP BY month ORDER BY month
      `),
      safeQuery(`
        SELECT
          EXTRACT(MONTH FROM expense_date)::int as month,
          COALESCE(SUM(amount), 0) as amount
        FROM expenses
        WHERE status NOT IN ('cancelled','rejected')
          AND expense_date >= '${startDate}' AND expense_date <= '${endDate}'
          ${combinedExpenseFilter}
        GROUP BY month ORDER BY month
      `),
      safeQuery(`
        SELECT category, COALESCE(SUM(amount), 0) as total
        FROM expenses
        WHERE status NOT IN ('cancelled','rejected')
          AND expense_date >= '${startDate}' AND expense_date <= '${endDate}'
          ${combinedExpenseFilter}
        GROUP BY category ORDER BY total DESC LIMIT 8
      `),
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
      `),
      safeQuery(`
        SELECT
          COALESCE(e.department, 'כללי') as department,
          COUNT(*) as employee_count,
          COALESCE(SUM(e.base_salary), 0) as salary_cost,
          (SELECT COALESCE(SUM(ex.amount), 0) FROM expenses ex WHERE ex.category = e.department AND ex.status NOT IN ('cancelled','rejected') AND ex.expense_date >= '${startDate}' AND ex.expense_date <= '${endDate}') as dept_expenses
        FROM employees e WHERE e.status = 'active'
        GROUP BY e.department ORDER BY salary_cost DESC LIMIT 10
      `),
      safeQuery(`
        SELECT COUNT(*) as count FROM approval_requests WHERE status = 'pending'
      `),
      safeQuery(`
        SELECT
          COUNT(*) FILTER (WHERE status = 'active') as active_customers,
          COUNT(*) as total_customers,
          COUNT(*) FILTER (WHERE created_at >= '${startDate}' AND created_at <= '${endDate}') as new_customers
        FROM sales_customers
      `),
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
        departmentPerformance: (departmentPerformance as DeptPerformanceRow[]).map((d) => ({
          name: d.department || "כללי",
          employees: Number(d.employee_count || 0),
          salaryCost: Number(d.salary_cost || 0),
          expenses: Number(d.dept_expenses || 0),
        })),
      },
      departments: (departmentPerformance as DeptPerformanceRow[]).map((d) => d.department || "כללי"),
      modules: await (async () => {
        try {
          const mods = await safeQuery(`SELECT id, name, slug FROM platform_modules WHERE is_active = true ORDER BY name`);
          return (mods as ModuleRow[]).map((m) => ({ id: Number(m.id), name: m.name, slug: m.slug }));
        } catch { return []; }
      })(),
      crossModuleSummary: await (async () => {
        try {
          return await getSystemSyncSummary();
        } catch { return {}; }
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
        } catch { return null; }
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
        } catch { return []; }
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
        } catch { return null; }
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
          if (Number(arOd.cnt) > 0) alerts.push({ type: "ar_overdue", severity: "high", message: `${arOd.cnt} חשבוניות חייבים באיחור (₪${Number(arOd.total).toLocaleString()})`, count: Number(arOd.cnt) });
          if (Number(apOd.cnt) > 0) alerts.push({ type: "ap_overdue", severity: "medium", message: `${apOd.cnt} חשבוניות ספקים באיחור (₪${Number(apOd.total).toLocaleString()})`, count: Number(apOd.cnt) });
          if (Number((lowBudget[0] || {}).cnt) > 0) alerts.push({ type: "budget_warning", severity: "high", message: `${(lowBudget[0] as any).cnt} תקציבים חרגו מ-90%`, count: Number((lowBudget[0] as any).cnt) });
          if (Number((pendingApprovalsList[0] || {}).cnt) > 0) alerts.push({ type: "stale_approvals", severity: "medium", message: `${(pendingApprovalsList[0] as any).cnt} אישורים ממתינים מעל 3 ימים`, count: Number((pendingApprovalsList[0] as any).cnt) });
          return alerts;
        } catch { return []; }
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
        } catch { return null; }
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
        } catch { return null; }
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
        } catch { return null; }
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
        } catch { return null; }
      })(),
      automations: await (async () => {
        try {
          const [flowCount, recentRuns] = await Promise.all([
            safeQuery(`SELECT COUNT(*) as cnt FROM automation_log WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'`).catch(() => [{ cnt: 0 }]),
            safeQuery(`SELECT flow_id, flow_name, affected, status, created_at FROM automation_log ORDER BY created_at DESC LIMIT 5`).catch(() => []),
          ]);
          return { totalRuns7d: Number((flowCount[0] as any)?.cnt || 0), recentRuns };
        } catch { return { totalRuns7d: 0, recentRuns: [] }; }
      })(),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

router.post("/reports-center/executive-dashboard/export-excel", async (req: Request, res: Response) => {
  try {
    const XLSX = await import("xlsx");
    const data = req.body;
    const wb = XLSX.utils.book_new();

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
    const wsKpi = XLSX.utils.aoa_to_sheet(kpiRows);
    wsKpi["!cols"] = [{ wch: 20 }, { wch: 15 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, wsKpi, "KPIs");

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
    const wsFin = XLSX.utils.aoa_to_sheet(finRows);
    wsFin["!cols"] = [{ wch: 15 }, { wch: 20 }, { wch: 15 }];
    XLSX.utils.book_append_sheet(wb, wsFin, "סיכום פיננסי");

    if (data.charts?.salesTrend) {
      const trendRows = [
        ["חודש", "הכנסות", "הוצאות", "רווח"],
        ...data.charts.salesTrend.map((r: ExportSalesTrendRow) => [r.month, r.revenue, r.expenses, r.profit]),
      ];
      const wsTrend = XLSX.utils.aoa_to_sheet(trendRows);
      wsTrend["!cols"] = [{ wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }];
      XLSX.utils.book_append_sheet(wb, wsTrend, "מגמת מכירות");
    }

    if (data.charts?.expenseBreakdown) {
      const expRows = [
        ["קטגוריה", "סכום"],
        ...data.charts.expenseBreakdown.map((r: ExportExpenseRow) => [r.name, r.value]),
      ];
      const wsExp = XLSX.utils.aoa_to_sheet(expRows);
      wsExp["!cols"] = [{ wch: 20 }, { wch: 15 }];
      XLSX.utils.book_append_sheet(wb, wsExp, "פילוח הוצאות");
    }

    if (data.charts?.departmentPerformance) {
      const deptRows = [
        ["מחלקה", "עובדים", "עלות שכר", "הוצאות"],
        ...data.charts.departmentPerformance.map((r: ExportDeptRow) => [r.name, r.employees, r.salaryCost, r.expenses]),
      ];
      const wsDept = XLSX.utils.aoa_to_sheet(deptRows);
      wsDept["!cols"] = [{ wch: 15 }, { wch: 10 }, { wch: 15 }, { wch: 15 }];
      XLSX.utils.book_append_sheet(wb, wsDept, "מחלקות");
    }

    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
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

export default router;
