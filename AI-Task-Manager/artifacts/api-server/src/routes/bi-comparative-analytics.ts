import { Router, Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { validateSession } from "../lib/auth";

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

router.use("/bi/comparative", requireAuth as any);

async function safeQuery(query: string): Promise<any[]> {
  try {
    const result = await Promise.race([
      db.execute(sql.raw(query)),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Timeout")), 5000)),
    ]);
    return (result as any).rows || [];
  } catch {
    return [];
  }
}

function calcVariance(current: number, previous: number) {
  const absoluteVariance = current - previous;
  const percentVariance = previous !== 0 ? Math.round((absoluteVariance / Math.abs(previous)) * 1000) / 10 : null;
  const direction = absoluteVariance > 0 ? "up" : absoluteVariance < 0 ? "down" : "flat";
  return { absoluteVariance, percentVariance, direction };
}

function parsePeriod(period: string, year: number, month?: number, quarter?: number): { startDate: string; endDate: string; label: string } {
  switch (period) {
    case "month": {
      const m = month || new Date().getMonth() + 1;
      const lastDay = new Date(year, m, 0).getDate();
      const monthNames = ["ינואר","פברואר","מרץ","אפריל","מאי","יוני","יולי","אוגוסט","ספטמבר","אוקטובר","נובמבר","דצמבר"];
      return {
        startDate: `${year}-${String(m).padStart(2, "0")}-01`,
        endDate: `${year}-${String(m).padStart(2, "0")}-${lastDay}`,
        label: `${monthNames[m - 1]} ${year}`,
      };
    }
    case "quarter": {
      const q = quarter || Math.ceil((new Date().getMonth() + 1) / 3);
      const qStart = (q - 1) * 3 + 1;
      const qEnd = q * 3;
      const qLastDay = new Date(year, qEnd, 0).getDate();
      return {
        startDate: `${year}-${String(qStart).padStart(2, "0")}-01`,
        endDate: `${year}-${String(qEnd).padStart(2, "0")}-${qLastDay}`,
        label: `רבעון ${q} ${year}`,
      };
    }
    case "year":
    default:
      return { startDate: `${year}-01-01`, endDate: `${year}-12-31`, label: `שנת ${year}` };
  }
}

router.get("/bi/comparative/periods", async (req: Request, res: Response) => {
  try {
    const domain = (req.query.domain as string) || "finance";
    const period = (req.query.period as string) || "year";
    const year1 = parseInt(req.query.year1 as string) || new Date().getFullYear();
    const year2 = parseInt(req.query.year2 as string) || (year1 - 1);
    const month1 = req.query.month1 ? parseInt(req.query.month1 as string) : undefined;
    const month2 = req.query.month2 ? parseInt(req.query.month2 as string) : undefined;
    const quarter1 = req.query.quarter1 ? parseInt(req.query.quarter1 as string) : undefined;
    const quarter2 = req.query.quarter2 ? parseInt(req.query.quarter2 as string) : undefined;

    const p1 = parsePeriod(period, year1, month1, quarter1);
    const p2 = parsePeriod(period, year2, month2, quarter2);

    let metrics: any[] = [];

    if (domain === "finance") {
      const [r1, r2] = await Promise.all([
        safeQuery(`
          SELECT
            COALESCE(SUM(CASE WHEN doc_type != 'expense' THEN amount ELSE 0 END), 0) as income,
            COALESCE((SELECT SUM(amount) FROM expenses WHERE status NOT IN ('cancelled','rejected') AND expense_date >= '${p1.startDate}' AND expense_date <= '${p1.endDate}'), 0) as expenses,
            COUNT(*) FILTER (WHERE status != 'cancelled') as invoice_count
          FROM income_documents
          WHERE status != 'cancelled' AND invoice_date >= '${p1.startDate}' AND invoice_date <= '${p1.endDate}'
        `),
        safeQuery(`
          SELECT
            COALESCE(SUM(CASE WHEN doc_type != 'expense' THEN amount ELSE 0 END), 0) as income,
            COALESCE((SELECT SUM(amount) FROM expenses WHERE status NOT IN ('cancelled','rejected') AND expense_date >= '${p2.startDate}' AND expense_date <= '${p2.endDate}'), 0) as expenses,
            COUNT(*) FILTER (WHERE status != 'cancelled') as invoice_count
          FROM income_documents
          WHERE status != 'cancelled' AND invoice_date >= '${p2.startDate}' AND invoice_date <= '${p2.endDate}'
        `),
      ]);
      const d1 = r1[0] || {};
      const d2 = r2[0] || {};
      const inc1 = Number(d1.income || 0), inc2 = Number(d2.income || 0);
      const exp1 = Number(d1.expenses || 0), exp2 = Number(d2.expenses || 0);
      const profit1 = inc1 - exp1, profit2 = inc2 - exp2;
      const margin1 = inc1 > 0 ? Math.round((profit1 / inc1) * 1000) / 10 : 0;
      const margin2 = inc2 > 0 ? Math.round((profit2 / inc2) * 1000) / 10 : 0;
      metrics = [
        { key: "income", label: "הכנסות", format: "currency", period1: inc1, period2: inc2, ...calcVariance(inc1, inc2), favorable: "up" },
        { key: "expenses", label: "הוצאות", format: "currency", period1: exp1, period2: exp2, ...calcVariance(exp1, exp2), favorable: "down" },
        { key: "profit", label: "רווח גולמי", format: "currency", period1: profit1, period2: profit2, ...calcVariance(profit1, profit2), favorable: "up" },
        { key: "margin", label: "שולי רווח", format: "percent", period1: margin1, period2: margin2, ...calcVariance(margin1, margin2), favorable: "up" },
        { key: "invoice_count", label: "מספר חשבוניות", format: "number", period1: Number(d1.invoice_count || 0), period2: Number(d2.invoice_count || 0), ...calcVariance(Number(d1.invoice_count || 0), Number(d2.invoice_count || 0)), favorable: "up" },
      ];
    } else if (domain === "sales") {
      const [r1, r2] = await Promise.all([
        safeQuery(`
          SELECT
            COALESCE(SUM(amount), 0) as revenue,
            COUNT(*) as deal_count,
            CASE WHEN COUNT(*) > 0 THEN ROUND(AVG(amount)::numeric, 0) ELSE 0 END as avg_deal
          FROM income_documents WHERE status != 'cancelled' AND invoice_date >= '${p1.startDate}' AND invoice_date <= '${p1.endDate}'
        `),
        safeQuery(`
          SELECT
            COALESCE(SUM(amount), 0) as revenue,
            COUNT(*) as deal_count,
            CASE WHEN COUNT(*) > 0 THEN ROUND(AVG(amount)::numeric, 0) ELSE 0 END as avg_deal
          FROM income_documents WHERE status != 'cancelled' AND invoice_date >= '${p2.startDate}' AND invoice_date <= '${p2.endDate}'
        `),
      ]);
      const d1 = r1[0] || {}, d2 = r2[0] || {};
      metrics = [
        { key: "revenue", label: "הכנסות ממכירות", format: "currency", period1: Number(d1.revenue || 0), period2: Number(d2.revenue || 0), ...calcVariance(Number(d1.revenue || 0), Number(d2.revenue || 0)), favorable: "up" },
        { key: "deal_count", label: "מספר עסקאות", format: "number", period1: Number(d1.deal_count || 0), period2: Number(d2.deal_count || 0), ...calcVariance(Number(d1.deal_count || 0), Number(d2.deal_count || 0)), favorable: "up" },
        { key: "avg_deal", label: "ממוצע עסקה", format: "currency", period1: Number(d1.avg_deal || 0), period2: Number(d2.avg_deal || 0), ...calcVariance(Number(d1.avg_deal || 0), Number(d2.avg_deal || 0)), favorable: "up" },
      ];
    } else if (domain === "production") {
      const [r1, r2] = await Promise.all([
        safeQuery(`
          SELECT
            COUNT(*) as total_wo,
            COUNT(*) FILTER (WHERE status = 'completed') as completed_wo,
            CASE WHEN COUNT(*) > 0 THEN ROUND((COUNT(*) FILTER (WHERE status = 'completed'))::numeric / COUNT(*) * 100, 1) ELSE 0 END as utilization
          FROM work_orders WHERE created_at >= '${p1.startDate}' AND created_at <= '${p1.endDate}'
        `),
        safeQuery(`
          SELECT
            COUNT(*) as total_wo,
            COUNT(*) FILTER (WHERE status = 'completed') as completed_wo,
            CASE WHEN COUNT(*) > 0 THEN ROUND((COUNT(*) FILTER (WHERE status = 'completed'))::numeric / COUNT(*) * 100, 1) ELSE 0 END as utilization
          FROM work_orders WHERE created_at >= '${p2.startDate}' AND created_at <= '${p2.endDate}'
        `),
      ]);
      const d1 = r1[0] || {}, d2 = r2[0] || {};
      metrics = [
        { key: "total_wo", label: "הזמנות עבודה", format: "number", period1: Number(d1.total_wo || 0), period2: Number(d2.total_wo || 0), ...calcVariance(Number(d1.total_wo || 0), Number(d2.total_wo || 0)), favorable: "up" },
        { key: "completed_wo", label: "הזמנות שהושלמו", format: "number", period1: Number(d1.completed_wo || 0), period2: Number(d2.completed_wo || 0), ...calcVariance(Number(d1.completed_wo || 0), Number(d2.completed_wo || 0)), favorable: "up" },
        { key: "utilization", label: "ניצולת ייצור", format: "percent", period1: Number(d1.utilization || 0), period2: Number(d2.utilization || 0), ...calcVariance(Number(d1.utilization || 0), Number(d2.utilization || 0)), favorable: "up" },
      ];
    }

    res.json({
      domain,
      period,
      period1: p1,
      period2: p2,
      metrics,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/bi/comparative/budget-vs-actual", async (req: Request, res: Response) => {
  try {
    const year = parseInt(req.query.year as string) || new Date().getFullYear();
    const month = req.query.month ? parseInt(req.query.month as string) : null;

    let dateFilter = "";
    if (month) {
      const lastDay = new Date(year, month, 0).getDate();
      const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
      const endDate = `${year}-${String(month).padStart(2, "0")}-${lastDay}`;
      dateFilter = `AND expense_date >= '${startDate}' AND expense_date <= '${endDate}'`;
    }

    const [budgetRows, actuals] = await Promise.all([
      safeQuery(`
        SELECT 
          category,
          department,
          COALESCE(SUM(budgeted_amount), 0) as budgeted,
          COALESCE(SUM(actual_amount), 0) as actual,
          COALESCE(SUM(forecast_amount), 0) as forecast,
          COALESCE(SUM(committed_amount), 0) as committed
        FROM budgets
        WHERE fiscal_year = ${year} ${month ? `AND (fiscal_month = ${month} OR fiscal_month IS NULL)` : ""}
        GROUP BY category, department
        ORDER BY category, department
      `),
      safeQuery(`
        SELECT 
          category,
          COALESCE(SUM(amount), 0) as actual_from_expenses
        FROM expenses
        WHERE status NOT IN ('cancelled','rejected') AND EXTRACT(YEAR FROM expense_date) = ${year} ${month ? `AND EXTRACT(MONTH FROM expense_date) = ${month}` : ""}
        GROUP BY category
      `),
    ]);

    const actualsMap: Record<string, number> = {};
    for (const a of actuals) {
      actualsMap[a.category as string] = Number(a.actual_from_expenses || 0);
    }

    const rows = budgetRows.map((b: any) => {
      const budgeted = Number(b.budgeted || 0);
      const actual = Number(b.actual || 0) || actualsMap[b.category] || 0;
      const forecast = Number(b.forecast || 0);
      const variance = actual - budgeted;
      const variancePct = budgeted !== 0 ? Math.round((variance / budgeted) * 1000) / 10 : null;
      const utilization = budgeted !== 0 ? Math.round((actual / budgeted) * 1000) / 10 : 0;
      const status = utilization >= 100 ? "over" : utilization >= 90 ? "warning" : utilization >= 80 ? "alert" : "ok";
      return {
        category: b.category,
        department: b.department,
        budgeted,
        actual,
        forecast,
        committed: Number(b.committed || 0),
        variance,
        variancePct,
        utilization,
        status,
        favorable: variance <= 0,
      };
    });

    const totalBudgeted = rows.reduce((s, r) => s + r.budgeted, 0);
    const totalActual = rows.reduce((s, r) => s + r.actual, 0);
    const totalForecast = rows.reduce((s, r) => s + r.forecast, 0);

    res.json({
      year,
      month,
      rows,
      summary: {
        totalBudgeted,
        totalActual,
        totalForecast,
        totalVariance: totalActual - totalBudgeted,
        totalVariancePct: totalBudgeted !== 0 ? Math.round(((totalActual - totalBudgeted) / totalBudgeted) * 1000) / 10 : null,
        overBudgetCount: rows.filter(r => r.status === "over").length,
        warningCount: rows.filter(r => r.status === "warning" || r.status === "alert").length,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/bi/comparative/forecast-vs-actual", async (req: Request, res: Response) => {
  try {
    const year = parseInt(req.query.year as string) || new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;

    const monthlyData = await Promise.all(
      Array.from({ length: 12 }, (_, i) => i + 1).map(async month => {
        const lastDay = new Date(year, month, 0).getDate();
        const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
        const endDate = `${year}-${String(month).padStart(2, "0")}-${lastDay}`;

        const [incomeRow, expenseRow, budgetRow] = await Promise.all([
          safeQuery(`SELECT COALESCE(SUM(amount), 0) as total FROM income_documents WHERE status != 'cancelled' AND invoice_date >= '${startDate}' AND invoice_date <= '${endDate}'`),
          safeQuery(`SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE status NOT IN ('cancelled','rejected') AND expense_date >= '${startDate}' AND expense_date <= '${endDate}'`),
          safeQuery(`SELECT COALESCE(SUM(budgeted_amount), 0) as budgeted, COALESCE(SUM(forecast_amount), 0) as forecast FROM budgets WHERE fiscal_year = ${year} AND (fiscal_month = ${month} OR fiscal_month IS NULL)`),
        ]);

        const actualIncome = Number(incomeRow[0]?.total || 0);
        const actualExpenses = Number(expenseRow[0]?.total || 0);
        const budgeted = Number(budgetRow[0]?.budgeted || 0);
        const forecast = Number(budgetRow[0]?.forecast || 0) || budgeted;
        const isActual = month <= currentMonth && year <= new Date().getFullYear();
        const monthNames = ["ינואר","פברואר","מרץ","אפריל","מאי","יוני","יולי","אוגוסט","ספטמבר","אוקטובר","נובמבר","דצמבר"];

        return {
          month,
          monthLabel: monthNames[month - 1],
          actualIncome,
          actualExpenses,
          budgeted,
          forecast,
          incomeVariance: isActual ? actualIncome - forecast : null,
          expenseVariance: isActual ? actualExpenses - budgeted : null,
          isActual,
        };
      })
    );

    res.json({ year, months: monthlyData });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
