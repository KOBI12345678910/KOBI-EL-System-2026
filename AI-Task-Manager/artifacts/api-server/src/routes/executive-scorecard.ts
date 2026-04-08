import { Router } from "express";
import { pool } from "@workspace/db";

const router = Router();

let scorecardCache: { data: any; ts: number } | null = null;
const CACHE_TTL = 60_000;

async function safeQuery(query: string, params: any[] = []): Promise<any[]> {
  try {
    const result = await Promise.race([
      pool.query(query, params),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 5000)),
    ]);
    return (result as any).rows || [];
  } catch {
    return [];
  }
}

function computeStatus(value: number, greenThreshold: number, yellowThreshold: number, higherIsBetter = true): "green" | "yellow" | "red" {
  if (higherIsBetter) {
    if (value >= greenThreshold) return "green";
    if (value >= yellowThreshold) return "yellow";
    return "red";
  }
  if (value <= greenThreshold) return "green";
  if (value <= yellowThreshold) return "yellow";
  return "red";
}

function computeTrend(current: number, previous: number): { direction: "up" | "down" | "flat"; changePct: number } {
  if (previous === 0 || previous === null || previous === undefined) {
    return { direction: current > 0 ? "up" : "flat", changePct: current > 0 ? 100 : 0 };
  }
  const pct = Math.round(((current - previous) / Math.abs(previous)) * 100 * 10) / 10;
  const direction = pct > 2 ? "up" : pct < -2 ? "down" : "flat";
  return { direction, changePct: pct };
}

router.get("/executive/scorecard", async (_req, res) => {
  try {
    if (scorecardCache && Date.now() - scorecardCache.ts < CACHE_TTL) {
      return res.json(scorecardCache.data);
    }

    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 10);
    const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().slice(0, 10);
    const twoMonthsStart = new Date(now.getFullYear(), now.getMonth() - 2, 1).toISOString().slice(0, 10);
    const twoMonthsEnd = new Date(now.getFullYear(), now.getMonth() - 1, 0).toISOString().slice(0, 10);
    const todayStr = now.toISOString().slice(0, 10);

    const [
      revenueRows,
      prevRevenueRows,
      grossMarginRows,
      prevGrossMarginRows,
      cashRows,
      prevCashRows,
      arAgingRows,
      prevArAgingRows,
      pipelineRows,
      prevPipelineRows,
      productionRows,
      prevProductionRows,
      inventoryRows,
      hrRows,
      prevHrRows,
      deliveryRows,
      prevDeliveryRows,
      thresholdsRows,
      csatRows,
    ] = await Promise.all([
      safeQuery(`
        SELECT COALESCE(SUM(amount), 0) as revenue,
               (SELECT COALESCE(SUM(amount), 0) FROM income_documents WHERE status != 'cancelled' AND EXTRACT(YEAR FROM invoice_date) = $1 AND EXTRACT(MONTH FROM invoice_date) = 1) as annual_target
        FROM income_documents
        WHERE status != 'cancelled' AND invoice_date >= $2 AND invoice_date <= $3
      `, [now.getFullYear(), thisMonthStart, todayStr]),
      safeQuery(`
        SELECT COALESCE(SUM(amount), 0) as revenue
        FROM income_documents
        WHERE status != 'cancelled' AND invoice_date >= $1 AND invoice_date <= $2
      `, [prevMonthStart, prevMonthEnd]),
      safeQuery(`
        SELECT 
          COALESCE(SUM(i.amount), 0) as income,
          COALESCE((SELECT SUM(e.amount) FROM expenses e WHERE e.status NOT IN ('cancelled','rejected') AND e.expense_date >= $1 AND e.expense_date <= $2), 0) as expenses
        FROM income_documents i
        WHERE i.status != 'cancelled' AND i.invoice_date >= $1 AND i.invoice_date <= $2
      `, [thisMonthStart, todayStr]),
      safeQuery(`
        SELECT 
          COALESCE(SUM(i.amount), 0) as income,
          COALESCE((SELECT SUM(e.amount) FROM expenses e WHERE e.status NOT IN ('cancelled','rejected') AND e.expense_date >= $1 AND e.expense_date <= $2), 0) as expenses
        FROM income_documents i
        WHERE i.status != 'cancelled' AND i.invoice_date >= $1 AND i.invoice_date <= $2
      `, [prevMonthStart, prevMonthEnd]),
      safeQuery(`SELECT COALESCE(SUM(current_balance), 0) as cash FROM bank_accounts WHERE is_active = true`),
      safeQuery(`
        SELECT COALESCE(SUM(amount), 0) as cash
        FROM cash_flow_records
        WHERE record_date >= $1 AND record_date <= $2 AND type IN ('income','opening_balance')
      `, [prevMonthStart, prevMonthEnd]),
      safeQuery(`
        SELECT 
          COALESCE(SUM(balance_due) FILTER (WHERE due_date >= CURRENT_DATE), 0) as current_amount,
          COALESCE(SUM(balance_due) FILTER (WHERE due_date < CURRENT_DATE AND due_date >= CURRENT_DATE - INTERVAL '30 days'), 0) as days_1_30,
          COALESCE(SUM(balance_due) FILTER (WHERE due_date < CURRENT_DATE - INTERVAL '30 days' AND due_date >= CURRENT_DATE - INTERVAL '60 days'), 0) as days_31_60,
          COALESCE(SUM(balance_due) FILTER (WHERE due_date < CURRENT_DATE - INTERVAL '60 days'), 0) as over_60,
          COALESCE(SUM(balance_due), 0) as total
        FROM accounts_receivable WHERE status IN ('open','partial','overdue')
      `),
      safeQuery(`
        SELECT 
          COALESCE(SUM(balance_due) FILTER (WHERE due_date < $1 AND due_date >= $1::date - INTERVAL '30 days'), 0) as overdue_prev,
          COALESCE(SUM(balance_due), 0) as total_prev
        FROM accounts_receivable WHERE status IN ('open','partial','overdue') AND created_at <= $1
      `, [prevMonthEnd]),
      safeQuery(`
        SELECT COALESCE(SUM(total_amount), 0) as pipeline_value
        FROM quotes WHERE status NOT IN ('rejected','cancelled')
      `),
      safeQuery(`
        SELECT COALESCE(SUM(total_amount), 0) as pipeline_value
        FROM quotes WHERE status NOT IN ('rejected','cancelled') AND created_at <= $1
      `, [prevMonthEnd]),
      safeQuery(`
        SELECT 
          COUNT(*) as total_wo,
          COUNT(*) FILTER (WHERE status IN ('completed','הושלם')) as completed_wo
        FROM work_orders WHERE created_at >= $1 AND created_at < $2
      `, [thisMonthStart, todayStr]),
      safeQuery(`
        SELECT 
          COUNT(*) as total_wo,
          COUNT(*) FILTER (WHERE status IN ('completed','הושלם')) as completed_wo
        FROM work_orders WHERE created_at >= $1 AND created_at < $2
      `, [prevMonthStart, prevMonthEnd]),
      safeQuery(`
        SELECT 
          COALESCE(AVG(CASE WHEN reorder_point > 0 THEN current_stock::numeric / reorder_point::numeric END), 1) as turnover_ratio
        FROM raw_materials WHERE reorder_point IS NOT NULL AND reorder_point::numeric > 0
      `),
      safeQuery(`
        SELECT 
          COUNT(*) FILTER (WHERE status = 'active') as active,
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE end_date >= $1 AND end_date < $2) as terminated
        FROM employees
      `, [prevMonthStart, prevMonthEnd]),
      safeQuery(`
        SELECT 
          COUNT(*) FILTER (WHERE status = 'active') as active,
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE end_date >= $1 AND end_date < $2) as terminated
        FROM employees
      `, [twoMonthsStart, twoMonthsEnd]),
      safeQuery(`
        SELECT 
          COUNT(*) as total_deliveries,
          COUNT(*) FILTER (WHERE status IN ('delivered','completed')) as on_time
        FROM sales_orders WHERE created_at >= $1 AND created_at < $2
      `, [thisMonthStart, todayStr]),
      safeQuery(`
        SELECT 
          COUNT(*) as total_deliveries,
          COUNT(*) FILTER (WHERE status IN ('delivered','completed')) as on_time
        FROM sales_orders WHERE created_at >= $1 AND created_at < $2
      `, [prevMonthStart, prevMonthEnd]),
      safeQuery(`SELECT * FROM scorecard_thresholds`).catch(() => []),
      safeQuery(`SELECT COALESCE(AVG(COALESCE(satisfaction_rating, satisfaction_score)), 0) as avg_rating, COUNT(*) FILTER (WHERE satisfaction_rating IS NOT NULL OR satisfaction_score IS NOT NULL) as total FROM support_tickets WHERE created_at >= NOW() - INTERVAL '90 days'`),
    ]);

    const thresholdMap: Record<string, { green: number; yellow: number; higher_is_better: boolean }> = {};
    (thresholdsRows || []).forEach((r: any) => {
      thresholdMap[r.metric_key] = {
        green: Number(r.green_threshold),
        yellow: Number(r.yellow_threshold),
        higher_is_better: r.higher_is_better !== false,
      };
    });

    function threshold(key: string, defaultGreen: number, defaultYellow: number, defaultHigherIsBetter = true) {
      return thresholdMap[key] || { green: defaultGreen, yellow: defaultYellow, higher_is_better: defaultHigherIsBetter };
    }

    const currentRevenue = Number(revenueRows[0]?.revenue || 0);
    const prevRevenue = Number(prevRevenueRows[0]?.revenue || 0);
    const annualTarget = Number(revenueRows[0]?.annual_target || currentRevenue * 12 || 1);
    const revVsTargetPct = annualTarget > 0 ? Math.round((currentRevenue / (annualTarget / 12)) * 100) : 100;
    const prevRevVsTargetPct = prevRevenue > 0 ? Math.round((prevRevenue / (annualTarget / 12)) * 100) : revVsTargetPct;
    const revThresh = threshold("revenue_vs_target", 90, 70);

    const income = Number(grossMarginRows[0]?.income || 0);
    const expenses = Number(grossMarginRows[0]?.expenses || 0);
    const grossMargin = income > 0 ? Math.round(((income - expenses) / income) * 100 * 10) / 10 : 0;

    const prevIncome = Number(prevGrossMarginRows[0]?.income || 0);
    const prevExpenses = Number(prevGrossMarginRows[0]?.expenses || 0);
    const prevGrossMargin = prevIncome > 0 ? Math.round(((prevIncome - prevExpenses) / prevIncome) * 100 * 10) / 10 : grossMargin;
    const gmThresh = threshold("gross_margin", 30, 15);

    const cash = Number(cashRows[0]?.cash || 0);
    const prevCash = Number(prevCashRows[0]?.cash || cash);
    const cashThresh = threshold("cash_position", 500000, 100000);

    const ar = arAgingRows[0] || {};
    const arTotal = Number(ar.total || 0);
    const arOverdue = Number(ar.days_1_30 || 0) + Number(ar.days_31_60 || 0) + Number(ar.over_60 || 0);
    const arHealthPct = arTotal > 0 ? Math.round(((arTotal - arOverdue) / arTotal) * 100) : 100;

    const prevAr = prevArAgingRows[0] || {};
    const prevArTotal = Number(prevAr.total_prev || 0);
    const prevArOverdue = Number(prevAr.overdue_prev || 0);
    const prevArHealthPct = prevArTotal > 0 ? Math.round(((prevArTotal - prevArOverdue) / prevArTotal) * 100) : arHealthPct;
    const arThresh = threshold("ar_aging_health", 80, 60);

    const pipelineValue = Number(pipelineRows[0]?.pipeline_value || 0);
    const prevPipelineValue = Number(prevPipelineRows[0]?.pipeline_value || 0);
    const pipelineThresh = threshold("pipeline_value", 1000000, 200000);

    const totalWo = Number(productionRows[0]?.total_wo || 0);
    const completedWo = Number(productionRows[0]?.completed_wo || 0);
    const oee = totalWo > 0 ? Math.round((completedWo / totalWo) * 100) : 0;
    const oeeHasData = totalWo > 0;

    const prevTotalWo = Number(prevProductionRows[0]?.total_wo || 0);
    const prevCompletedWo = Number(prevProductionRows[0]?.completed_wo || 0);
    const prevOee = prevTotalWo > 0 ? Math.round((prevCompletedWo / prevTotalWo) * 100) : oee;
    const oeeThresh = threshold("production_oee", 80, 60);

    const inventoryTurnover = Math.round(Number(inventoryRows[0]?.turnover_ratio || 1) * 10) / 10;
    const invThresh = threshold("inventory_turnover", 2, 1);

    const activeEmp = Number(hrRows[0]?.active || 0);
    const totalEmpNow = Number(hrRows[0]?.total || 1);
    const terminatedNow = Number(hrRows[0]?.terminated || 0);
    const empTurnoverPct = totalEmpNow > 0 ? Math.round((terminatedNow / totalEmpNow) * 100 * 10) / 10 : 0;

    const prevTotalEmp = Number(prevHrRows[0]?.total || totalEmpNow);
    const prevTerminated = Number(prevHrRows[0]?.terminated || terminatedNow);
    const prevEmpTurnoverPct = prevTotalEmp > 0 ? Math.round((prevTerminated / prevTotalEmp) * 100 * 10) / 10 : empTurnoverPct;
    const empThresh = threshold("employee_turnover", 5, 10, false);

    const csatTotal = Number(csatRows[0]?.total || 0);
    const csatAvgRating = Number(csatRows[0]?.avg_rating || 0);
    const csatHasData = csatTotal > 0;
    const csatScore = csatHasData ? Math.round(csatAvgRating * 20) : 0;
    const csatThresh = threshold("customer_satisfaction", 80, 65);

    const totalDeliveries = Number(deliveryRows[0]?.total_deliveries || 0);
    const onTimeDeliveries = Number(deliveryRows[0]?.on_time || 0);
    const onTimeRate = totalDeliveries > 0 ? Math.round((onTimeDeliveries / totalDeliveries) * 100) : 0;
    const onTimeHasData = totalDeliveries > 0;

    const prevTotalDeliveries = Number(prevDeliveryRows[0]?.total_deliveries || 0);
    const prevOnTime = Number(prevDeliveryRows[0]?.on_time || 0);
    const prevOnTimeRate = prevTotalDeliveries > 0 ? Math.round((prevOnTime / prevTotalDeliveries) * 100) : onTimeRate;
    const otdThresh = threshold("on_time_delivery", 90, 75);

    const metrics = [
      {
        key: "revenue_vs_target",
        label: "הכנסות מול יעד",
        domain: "finance",
        value: revVsTargetPct,
        displayValue: `${revVsTargetPct}%`,
        rawValue: currentRevenue,
        format: "percent",
        trend: computeTrend(revVsTargetPct, prevRevVsTargetPct),
        status: computeStatus(revVsTargetPct, revThresh.green, revThresh.yellow, revThresh.higher_is_better),
        description: `₪${(currentRevenue / 1000).toFixed(0)}K החודש`,
      },
      {
        key: "gross_margin",
        label: "מרווח גולמי",
        domain: "finance",
        value: grossMargin,
        displayValue: `${grossMargin}%`,
        rawValue: grossMargin,
        format: "percent",
        trend: computeTrend(grossMargin, prevGrossMargin),
        status: computeStatus(grossMargin, gmThresh.green, gmThresh.yellow, gmThresh.higher_is_better),
        description: `הכנסות: ₪${(income / 1000).toFixed(0)}K`,
      },
      {
        key: "cash_position",
        label: "מצב מזומנים",
        domain: "finance",
        value: cash,
        displayValue: cash >= 1000000 ? `₪${(cash / 1000000).toFixed(1)}M` : `₪${(cash / 1000).toFixed(0)}K`,
        rawValue: cash,
        format: "currency",
        trend: computeTrend(cash, prevCash),
        status: computeStatus(cash, cashThresh.green, cashThresh.yellow, cashThresh.higher_is_better),
        description: "יתרת בנקים פעילים",
      },
      {
        key: "ar_aging_health",
        label: "בריאות חייבים",
        domain: "finance",
        value: arHealthPct,
        displayValue: `${arHealthPct}%`,
        rawValue: arHealthPct,
        format: "percent",
        trend: computeTrend(arHealthPct, prevArHealthPct),
        status: computeStatus(arHealthPct, arThresh.green, arThresh.yellow, arThresh.higher_is_better),
        description: `סה"כ: ₪${(arTotal / 1000).toFixed(0)}K`,
      },
      {
        key: "pipeline_value",
        label: "ערך צינור מכירות",
        domain: "sales",
        value: pipelineValue,
        displayValue: pipelineValue >= 1000000 ? `₪${(pipelineValue / 1000000).toFixed(1)}M` : `₪${(pipelineValue / 1000).toFixed(0)}K`,
        rawValue: pipelineValue,
        format: "currency",
        trend: computeTrend(pipelineValue, prevPipelineValue),
        status: computeStatus(pipelineValue, pipelineThresh.green, pipelineThresh.yellow, pipelineThresh.higher_is_better),
        description: "הצעות פתוחות",
      },
      {
        key: "production_oee",
        label: "יעילות ייצור (OEE)",
        domain: "production",
        value: oee,
        displayValue: oeeHasData ? `${oee}%` : "אין נתונים",
        rawValue: oee,
        format: "percent",
        hasData: oeeHasData,
        trend: oeeHasData ? computeTrend(oee, prevOee) : { direction: "flat" as const, changePct: 0 },
        status: oeeHasData ? computeStatus(oee, oeeThresh.green, oeeThresh.yellow, oeeThresh.higher_is_better) : "yellow" as const,
        description: oeeHasData ? `${completedWo} הזמנות הושלמו מתוך ${totalWo}` : "אין הזמנות עבודה עדיין",
      },
      {
        key: "inventory_turnover",
        label: "מחזור מלאי",
        domain: "inventory",
        value: inventoryTurnover,
        displayValue: `${inventoryTurnover}x`,
        rawValue: inventoryTurnover,
        format: "number",
        trend: { direction: "flat" as const, changePct: 0 },
        status: computeStatus(inventoryTurnover, invThresh.green, invThresh.yellow, invThresh.higher_is_better),
        description: "יחס מלאי / נקודת הזמנה",
      },
      {
        key: "employee_turnover",
        label: "תחלופת עובדים",
        domain: "hr",
        value: empTurnoverPct,
        displayValue: `${empTurnoverPct}%`,
        rawValue: empTurnoverPct,
        format: "percent",
        trend: computeTrend(empTurnoverPct, prevEmpTurnoverPct),
        status: computeStatus(empTurnoverPct, empThresh.green, empThresh.yellow, empThresh.higher_is_better),
        description: `${activeEmp} עובדים פעילים`,
      },
      {
        key: "customer_satisfaction",
        label: "שביעות רצון לקוחות",
        domain: "crm",
        value: csatScore,
        displayValue: csatHasData ? `${csatScore}%` : "אין נתונים",
        rawValue: csatScore,
        format: "percent",
        hasData: csatHasData,
        trend: { direction: "flat" as const, changePct: 0 },
        status: csatHasData ? computeStatus(csatScore, csatThresh.green, csatThresh.yellow, csatThresh.higher_is_better) : "yellow" as const,
        description: csatHasData ? `${csatTotal} משוביות — ממוצע דירוג` : "אין משוביות לקוחות עדיין",
      },
      {
        key: "on_time_delivery",
        label: "אספקה בזמן",
        domain: "operations",
        value: onTimeRate,
        displayValue: onTimeHasData ? `${onTimeRate}%` : "אין נתונים",
        rawValue: onTimeRate,
        format: "percent",
        hasData: onTimeHasData,
        trend: onTimeHasData ? computeTrend(onTimeRate, prevOnTimeRate) : { direction: "flat" as const, changePct: 0 },
        status: onTimeHasData ? computeStatus(onTimeRate, otdThresh.green, otdThresh.yellow, otdThresh.higher_is_better) : "yellow" as const,
        description: onTimeHasData ? `${onTimeDeliveries}/${totalDeliveries} הזמנות` : "אין הזמנות מכירה עדיין",
      },
    ];

    const actionItems: Array<{
      id: string;
      title: string;
      severity: "critical" | "warning" | "info";
      module: string;
      description: string;
    }> = [];

    const [overdueArRows, lowStockRows, criticalWoRows, atRiskDealsRows, openSupportRows] = await Promise.all([
      safeQuery(`
        SELECT customer_name, COALESCE(balance_due, 0) as amount, due_date
        FROM accounts_receivable 
        WHERE status IN ('overdue') OR (status IN ('open','partial') AND due_date < CURRENT_DATE)
        ORDER BY balance_due DESC LIMIT 5
      `),
      safeQuery(`
        SELECT name, current_stock, reorder_point
        FROM raw_materials
        WHERE reorder_point IS NOT NULL AND current_stock IS NOT NULL 
          AND current_stock::numeric <= reorder_point::numeric
        ORDER BY (current_stock::numeric / NULLIF(reorder_point::numeric, 0)) ASC LIMIT 5
      `),
      safeQuery(`
        SELECT wo_number, priority, due_date
        FROM work_orders 
        WHERE priority IN ('דחוף','קריטי','urgent','critical') AND status NOT IN ('completed','הושלם')
        LIMIT 5
      `),
      safeQuery(`
        SELECT customer_name, total_amount, status
        FROM quotes 
        WHERE status IN ('pending','sent') AND created_at < NOW() - INTERVAL '14 days'
        ORDER BY total_amount DESC LIMIT 5
      `),
      safeQuery(`
        SELECT COUNT(*) as cnt FROM support_tickets WHERE status IN ('open','פתוח') AND created_at < NOW() - INTERVAL '7 days'
      `),
    ]);

    overdueArRows.forEach((r: any, i: number) => {
      actionItems.push({
        id: `ar-${i}`,
        title: `חוב באיחור: ${r.customer_name || "לקוח"}`,
        severity: "critical",
        module: "finance",
        description: `₪${Number(r.amount || 0).toLocaleString("he-IL")} — תאריך פירעון: ${r.due_date ? new Date(r.due_date).toLocaleDateString("he-IL") : "לא ידוע"}`,
      });
    });

    lowStockRows.forEach((r: any, i: number) => {
      actionItems.push({
        id: `stock-${i}`,
        title: `מחסור: ${r.name}`,
        severity: "warning",
        module: "inventory",
        description: `מלאי: ${r.current_stock} | נקודת הזמנה: ${r.reorder_point}`,
      });
    });

    criticalWoRows.forEach((r: any, i: number) => {
      actionItems.push({
        id: `wo-${i}`,
        title: `הזמנת עבודה קריטית: ${r.wo_number || "—"}`,
        severity: "critical",
        module: "production",
        description: `עדיפות: ${r.priority} | תאריך: ${r.due_date ? new Date(r.due_date).toLocaleDateString("he-IL") : "לא ידוע"}`,
      });
    });

    atRiskDealsRows.forEach((r: any, i: number) => {
      actionItems.push({
        id: `deal-${i}`,
        title: `עסקה בסיכון: ${r.customer_name || "לקוח"}`,
        severity: "warning",
        module: "sales",
        description: `₪${Number(r.total_amount || 0).toLocaleString("he-IL")} — הצעה ממתינה מעל שבועיים`,
      });
    });

    const openTickets = Number(openSupportRows[0]?.cnt || 0);
    if (openTickets > 5) {
      actionItems.push({
        id: "tickets",
        title: `${openTickets} פניות שירות פתוחות מעל שבוע`,
        severity: "warning",
        module: "support",
        description: "פניות ללא מענה לאורך זמן",
      });
    }

    actionItems.sort((a, b) => {
      const order = { critical: 0, warning: 1, info: 2 };
      return order[a.severity] - order[b.severity];
    });

    const response = {
      timestamp: now.toISOString(),
      metrics,
      actionItems: actionItems.slice(0, 10),
      summary: {
        totalGreen: metrics.filter(m => m.status === "green").length,
        totalYellow: metrics.filter(m => m.status === "yellow").length,
        totalRed: metrics.filter(m => m.status === "red").length,
        overallHealth: metrics.every(m => m.status === "green") ? "excellent"
          : metrics.filter(m => m.status === "red").length > 2 ? "critical"
          : metrics.filter(m => m.status === "yellow").length > 2 ? "warning"
          : "good",
      },
    };

    scorecardCache = { data: response, ts: Date.now() };
    res.json(response);
  } catch (err: any) {
    console.error("Scorecard error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get("/executive/scorecard/thresholds", async (_req, res) => {
  try {
    const rows = await safeQuery(`
      SELECT metric_key, metric_label, green_threshold, yellow_threshold, higher_is_better, unit, updated_at
      FROM scorecard_thresholds ORDER BY metric_key
    `);
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.put("/executive/scorecard/thresholds/:key", async (req: any, res) => {
  try {
    const user = req.user || req.session?.user;
    if (!user || (!user.isSuperAdmin && user.role !== "admin" && user.role !== "manager")) {
      return res.status(403).json({ error: "נדרשות הרשאות מנהל לעדכון ספי הרמזור" });
    }

    const { key } = req.params;
    const { green_threshold, yellow_threshold, higher_is_better } = req.body;

    if (green_threshold === undefined || green_threshold === null || yellow_threshold === undefined || yellow_threshold === null) {
      return res.status(400).json({ error: "green_threshold ו-yellow_threshold הם שדות חובה" });
    }

    const gVal = Number(green_threshold);
    const yVal = Number(yellow_threshold);
    if (isNaN(gVal) || isNaN(yVal)) {
      return res.status(400).json({ error: "ערכי הסף חייבים להיות מספרים" });
    }

    await pool.query(`
      INSERT INTO scorecard_thresholds (metric_key, metric_label, green_threshold, yellow_threshold, higher_is_better, updated_at)
      VALUES ($1, $1, $2, $3, $4, NOW())
      ON CONFLICT (metric_key) DO UPDATE SET
        green_threshold = $2,
        yellow_threshold = $3,
        higher_is_better = $4,
        updated_at = NOW()
    `, [key, gVal, yVal, higher_is_better !== false]);
    scorecardCache = null;
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
