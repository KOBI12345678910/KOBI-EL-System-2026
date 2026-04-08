import { Router, Request, Response } from "express";
import { pool } from "@workspace/db";

const router = Router();
const q = (sql: string, params?: any[]) => pool.query(sql, params).catch(() => ({ rows: [] }));
const n = (v: any) => Number(v || 0);

let ceoDashboardCache: { data: any; ts: number } | null = null;
const CEO_CACHE_TTL = 30_000;

router.get("/executive/ceo-dashboard", async (_req: Request, res: Response) => {
  try {
    if (ceoDashboardCache && Date.now() - ceoDashboardCache.ts < CEO_CACHE_TTL) {
      return res.json(ceoDashboardCache.data);
    }
    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthStr = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, "0")}`;

    const [rev, exp, inv, po, cust, emp, leads, proj, wo, qc, bank, quot,
           revThisMonth, revLastMonth, expThisMonth, expLastMonth,
           monthlyRevenue, expensesByCategory, woByStatus, invOverdue,
           custThisMonth, custLastMonth, woThisMonth, woLastMonth,
           monthlyExpenses, monthlyOrders
    ] = await Promise.all([
      q("SELECT COALESCE(SUM(total_amount),0) as total, COUNT(*) as cnt FROM sales_orders WHERE status NOT IN ('cancelled','draft','מבוטל')"),
      q("SELECT COALESCE(SUM(total_amount),0) as total, COUNT(*) as cnt FROM purchase_orders WHERE status NOT IN ('cancelled','draft','מבוטל')"),
      q("SELECT COUNT(*) as total, COUNT(*) FILTER(WHERE status IN ('שולם','paid')) as paid, COALESCE(SUM(total_amount),0) as amount, COALESCE(SUM(CASE WHEN status IN ('שולם','paid') THEN total_amount ELSE 0 END),0) as paid_amount FROM customer_invoices"),
      q("SELECT COUNT(*) as total, COALESCE(SUM(total_amount),0) as amount FROM purchase_orders WHERE status NOT IN ('cancelled','draft','מבוטל')"),
      q("SELECT COUNT(*) as total, COUNT(*) FILTER(WHERE status IN ('active','פעיל')) as active FROM sales_customers"),
      q("SELECT COUNT(*) as total, COUNT(*) FILTER(WHERE status IN ('active','פעיל')) as active FROM employees"),
      q("SELECT COUNT(*) as total, COUNT(*) FILTER(WHERE status IN ('הומר','converted','won')) as converted FROM crm_leads"),
      q("SELECT COUNT(*) as total, COUNT(*) FILTER(WHERE status IN ('active','in_progress')) as active, COALESCE(SUM(budget),0) as budget FROM project_analyses"),
      q("SELECT COUNT(*) as total, COUNT(*) FILTER(WHERE status IN ('הושלם','completed')) as completed, COUNT(*) FILTER(WHERE status IN ('בביצוע','in_progress','active')) as in_progress, COUNT(*) FILTER(WHERE status IN ('מתוכנן','planned','חדש')) as planned FROM work_orders WHERE deleted_at IS NULL"),
      q("SELECT COUNT(*) as total, COUNT(*) FILTER(WHERE result IN ('עבר','passed','pass')) as passed FROM quality_inspections"),
      q("SELECT COALESCE(SUM(balance),0) as balance FROM bank_accounts WHERE status='active'"),
      q("SELECT COUNT(*) as total, COALESCE(SUM(total_amount),0) as amount, COUNT(*) FILTER(WHERE status IN ('approved','accepted')) as won FROM quotations"),
      q("SELECT COALESCE(SUM(total_amount),0) as total FROM sales_orders WHERE TO_CHAR(created_at,'YYYY-MM')=$1 AND status NOT IN ('cancelled','draft','מבוטל')", [thisMonth]),
      q("SELECT COALESCE(SUM(total_amount),0) as total FROM sales_orders WHERE TO_CHAR(created_at,'YYYY-MM')=$1 AND status NOT IN ('cancelled','draft','מבוטל')", [lastMonthStr]),
      q("SELECT COALESCE(SUM(total_amount),0) as total FROM purchase_orders WHERE TO_CHAR(created_at,'YYYY-MM')=$1 AND status NOT IN ('cancelled','draft','מבוטל')", [thisMonth]),
      q("SELECT COALESCE(SUM(total_amount),0) as total FROM purchase_orders WHERE TO_CHAR(created_at,'YYYY-MM')=$1 AND status NOT IN ('cancelled','draft','מבוטל')", [lastMonthStr]),
      q(`SELECT TO_CHAR(created_at,'YYYY-MM') as month, COALESCE(SUM(total_amount),0) as total
         FROM sales_orders WHERE status NOT IN ('cancelled','draft','מבוטל') AND created_at > NOW()-INTERVAL '12 months'
         GROUP BY month ORDER BY month`),
      q("SELECT COALESCE(category,'אחר') as name, COALESCE(SUM(total_amount),0) as value FROM purchase_orders WHERE status NOT IN ('cancelled','draft','מבוטל') GROUP BY category ORDER BY value DESC LIMIT 8"),
      q("SELECT status, COUNT(*) as cnt FROM work_orders WHERE deleted_at IS NULL GROUP BY status"),
      q("SELECT COUNT(*) as cnt, COALESCE(SUM(total_amount),0) as total FROM customer_invoices WHERE status NOT IN ('שולם','paid','cancelled','מבוטל') AND due_date < NOW()"),
      q("SELECT COUNT(*) as cnt FROM sales_customers WHERE TO_CHAR(created_at,'YYYY-MM')=$1", [thisMonth]),
      q("SELECT COUNT(*) as cnt FROM sales_customers WHERE TO_CHAR(created_at,'YYYY-MM')=$1", [lastMonthStr]),
      q("SELECT COUNT(*) as cnt FROM work_orders WHERE TO_CHAR(created_at,'YYYY-MM')=$1 AND status IN ('הושלם','completed') AND deleted_at IS NULL", [thisMonth]),
      q("SELECT COUNT(*) as cnt FROM work_orders WHERE TO_CHAR(created_at,'YYYY-MM')=$1 AND status IN ('הושלם','completed') AND deleted_at IS NULL", [lastMonthStr]),
      q(`SELECT TO_CHAR(created_at,'YYYY-MM') as month, COALESCE(SUM(total_amount),0) as total
         FROM purchase_orders WHERE status NOT IN ('cancelled','draft','מבוטל') AND created_at > NOW()-INTERVAL '12 months'
         GROUP BY month ORDER BY month`),
      q(`SELECT TO_CHAR(created_at,'YYYY-MM') as month, COUNT(*) as cnt
         FROM sales_orders WHERE status NOT IN ('cancelled','draft','מבוטל') AND created_at > NOW()-INTERVAL '12 months'
         GROUP BY month ORDER BY month`),
    ]);

    const totalRevenue = n(rev.rows[0]?.total);
    const totalExpenses = n(exp.rows[0]?.total);
    const curMonthRev = n(revThisMonth.rows[0]?.total);
    const prevMonthRev = n(revLastMonth.rows[0]?.total);
    const curMonthExp = n(expThisMonth.rows[0]?.total);
    const prevMonthExp = n(expLastMonth.rows[0]?.total);
    const totalWo = n(wo.rows[0]?.total);
    const completedWo = n(wo.rows[0]?.completed);
    const inProgressWo = n(wo.rows[0]?.in_progress);
    const plannedWo = n(wo.rows[0]?.planned);
    const productionRate = totalWo > 0 ? Math.round((completedWo / totalWo) * 100) : 0;

    const revMonthlyMap: Record<string, number> = {};
    monthlyRevenue.rows.forEach((r: any) => { revMonthlyMap[r.month] = n(r.total); });
    const expMonthlyMap: Record<string, number> = {};
    monthlyExpenses.rows.forEach((r: any) => { expMonthlyMap[r.month] = n(r.total); });
    const ordMonthlyMap: Record<string, number> = {};
    monthlyOrders.rows.forEach((r: any) => { ordMonthlyMap[r.month] = n(r.cnt); });
    const months: string[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    }
    const monthlyTrend = months.map(m => ({
      month: m,
      revenue: revMonthlyMap[m] || 0,
      expenses: expMonthlyMap[m] || 0,
      profit: (revMonthlyMap[m] || 0) - (expMonthlyMap[m] || 0),
      orders: ordMonthlyMap[m] || 0,
    }));

    const pctChange = (cur: number, prev: number) => prev > 0 ? Math.round(((cur - prev) / prev) * 100) : (cur > 0 ? 100 : 0);

    const woStatusMap: Record<string, number> = {};
    woByStatus.rows.forEach((r: any) => { woStatusMap[r.status] = n(r.cnt); });
    const productionBreakdown = [
      { name: "הושלם", value: completedWo, color: "#10b981" },
      { name: "בביצוע", value: inProgressWo, color: "#f59e0b" },
      { name: "מתוכנן", value: plannedWo, color: "#3b82f6" },
      { name: "אחר", value: Math.max(0, totalWo - completedWo - inProgressWo - plannedWo), color: "#6b7280" },
    ].filter(d => d.value > 0);

    const expCategories = expensesByCategory.rows.map((r: any) => ({ name: r.name, value: n(r.value) }));

    const overdueInvoices = n(invOverdue.rows[0]?.cnt);
    const overdueAmount = n(invOverdue.rows[0]?.total);

    const newCustCur = n(custThisMonth.rows[0]?.cnt);
    const newCustPrev = n(custLastMonth.rows[0]?.cnt);
    const woCompCur = n(woThisMonth.rows[0]?.cnt);
    const woCompPrev = n(woLastMonth.rows[0]?.cnt);

    const alerts: string[] = [];
    if (overdueInvoices > 0) alerts.push(`${overdueInvoices} חשבוניות באיחור בסך ₪${overdueAmount.toLocaleString()}`);
    if (curMonthRev < prevMonthRev * 0.8) alerts.push("ירידה של מעל 20% בהכנסות לעומת חודש קודם");
    if (curMonthExp > prevMonthExp * 1.2) alerts.push("עלייה של מעל 20% בהוצאות לעומת חודש קודם");
    if (productionRate < 50 && totalWo > 0) alerts.push(`ניצולת ייצור נמוכה: ${productionRate}%`);
    const netIncome = totalRevenue - totalExpenses;
    if (netIncome > 0 && curMonthRev > prevMonthRev) alerts.push("מגמת צמיחה חיובית בהכנסות — המשיכו כך!");
    if (productionRate > 80) alerts.push("ייצור ביעילות גבוהה — עבודה מצוינת!");

    const result = {
      timestamp: now.toISOString(),
      kpis: {
        revenue: { value: curMonthRev, prevValue: prevMonthRev, change: pctChange(curMonthRev, prevMonthRev), total: totalRevenue, label: "הכנסות חודשיות" },
        expenses: { value: curMonthExp, prevValue: prevMonthExp, change: pctChange(curMonthExp, prevMonthExp), total: totalExpenses, label: "הוצאות חודשיות" },
        profit: { value: curMonthRev - curMonthExp, prevValue: prevMonthRev - prevMonthExp, change: pctChange(curMonthRev - curMonthExp, prevMonthRev - prevMonthExp), total: netIncome, label: "רווח גולמי" },
        orders: { value: n(rev.rows[0]?.cnt), label: "הזמנות פעילות" },
        production: { value: productionRate, completed: completedWo, inProgress: inProgressWo, total: totalWo, label: "ניצולת ייצור" },
        customers: { value: n(cust.rows[0]?.active), total: n(cust.rows[0]?.total), newThisMonth: newCustCur, newPrevMonth: newCustPrev, change: pctChange(newCustCur, newCustPrev), label: "לקוחות פעילים" },
        employees: { value: n(emp.rows[0]?.active), total: n(emp.rows[0]?.total), label: "עובדים פעילים" },
        quality: { value: n(qc.rows[0]?.total) > 0 ? Math.round((n(qc.rows[0]?.passed) / n(qc.rows[0]?.total)) * 100) : 100, total: n(qc.rows[0]?.total), passed: n(qc.rows[0]?.passed), label: "מעבר QC" },
      },
      charts: {
        monthlyTrend,
        expensesByCategory: expCategories,
        productionBreakdown,
      },
      details: {
        invoices: { total: n(inv.rows[0]?.total), paid: n(inv.rows[0]?.paid), amount: n(inv.rows[0]?.amount), paidAmount: n(inv.rows[0]?.paid_amount), overdue: overdueInvoices, overdueAmount },
        purchasing: { orders: n(po.rows[0]?.total), amount: n(po.rows[0]?.amount) },
        leads: { total: n(leads.rows[0]?.total), converted: n(leads.rows[0]?.converted), conversionRate: n(leads.rows[0]?.total) > 0 ? +(n(leads.rows[0]?.converted) / n(leads.rows[0]?.total) * 100).toFixed(1) : 0 },
        projects: { total: n(proj.rows[0]?.total), active: n(proj.rows[0]?.active), budget: n(proj.rows[0]?.budget) },
        bankBalance: n(bank.rows[0]?.balance),
        quotations: { total: n(quot.rows[0]?.total), amount: n(quot.rows[0]?.amount), won: n(quot.rows[0]?.won), winRate: n(quot.rows[0]?.total) > 0 ? +(n(quot.rows[0]?.won) / n(quot.rows[0]?.total) * 100).toFixed(1) : 0 },
        productionWo: { completed: woCompCur, prevCompleted: woCompPrev, change: pctChange(woCompCur, woCompPrev) },
      },
      profitMargin: totalRevenue > 0 ? +((totalRevenue - totalExpenses) / totalRevenue * 100).toFixed(1) : 0,
      aiInsights: alerts,
    };
    ceoDashboardCache = { data: result, ts: Date.now() };
    res.json(result);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get("/executive/company-health", async (_req: Request, res: Response) => {
  try {
    const [fin, ops, sales, hr, quality] = await Promise.all([
      q(`SELECT COALESCE(SUM(CASE WHEN t='r' THEN amt ELSE 0 END),0) as revenue, COALESCE(SUM(CASE WHEN t='e' THEN amt ELSE 0 END),0) as expenses,
         COALESCE((SELECT SUM(balance) FROM bank_accounts WHERE status='active'),0) as cash,
         COALESCE((SELECT SUM(total_amount) FROM customer_invoices WHERE status NOT IN ('שולם','paid','cancelled','מבוטל') AND due_date < NOW()),0) as overdue_ar,
         COALESCE((SELECT SUM(total_amount) FROM supplier_invoices WHERE status NOT IN ('שולם','paid','cancelled','מבוטל') AND due_date < NOW()),0) as overdue_ap
         FROM (SELECT 'r' as t, total_amount as amt FROM sales_orders WHERE status NOT IN ('cancelled','draft','מבוטל')
               UNION ALL SELECT 'e', total_amount as amt FROM purchase_orders WHERE status NOT IN ('cancelled','draft','מבוטל')) x`),
      q(`SELECT COUNT(*) as total_wo, COUNT(*) FILTER(WHERE status IN ('הושלם','completed')) as done_wo,
         COUNT(*) FILTER(WHERE due_date < NOW() AND status NOT IN ('הושלם','completed','cancelled','מבוטל')) as delayed_wo,
         COUNT(*) FILTER(WHERE status IN ('בביצוע','in_progress','active')) as active_wo
         FROM work_orders WHERE deleted_at IS NULL`),
      q(`SELECT COUNT(*) as total_orders, COALESCE(SUM(total_amount),0) as pipeline,
         COUNT(*) FILTER(WHERE created_at > NOW()-INTERVAL '30 days') as new_orders,
         (SELECT COUNT(*) FROM crm_leads WHERE status IN ('חדש','new')) as new_leads,
         (SELECT COUNT(*) FROM quotations WHERE status='pending') as pending_quotes
         FROM sales_orders WHERE status NOT IN ('cancelled','draft','מבוטל')`),
      q(`SELECT COUNT(*) as total, COUNT(*) FILTER(WHERE status IN ('active','פעיל')) as active,
         COUNT(*) FILTER(WHERE start_date > NOW()-INTERVAL '90 days') as new_hires
         FROM employees`),
      q(`SELECT COUNT(*) as total, COUNT(*) FILTER(WHERE result IN ('עבר','passed','pass')) as passed, COUNT(*) FILTER(WHERE result IN ('נכשל','failed','fail')) as failed FROM quality_inspections`),
    ]);
    const revenue = n(fin.rows[0]?.revenue); const expenses = n(fin.rows[0]?.expenses);
    const finScore = Math.min(100, Math.max(0, revenue > 0 ? Math.round((1 - expenses / revenue) * 50 + 50 - n(fin.rows[0]?.overdue_ar) / Math.max(revenue, 1) * 20) : 40));
    const totalWo = n(ops.rows[0]?.total_wo); const doneWo = n(ops.rows[0]?.done_wo); const delayedWo = n(ops.rows[0]?.delayed_wo);
    const opsScore = Math.min(100, Math.max(0, totalWo > 0 ? Math.round((doneWo / totalWo) * 70 + 30 - delayedWo * 2) : 60));
    const totalInsp = n(quality.rows[0]?.total); const passedInsp = n(quality.rows[0]?.passed);
    const qualScore = totalInsp > 0 ? Math.round((passedInsp / totalInsp) * 100) : 80;
    const salesScore = Math.min(100, Math.max(0, 60 + n(sales.rows[0]?.new_orders) + n(sales.rows[0]?.new_leads) * 0.5));
    const hrScore = Math.min(100, Math.max(0, n(hr.rows[0]?.total) > 0 ? Math.round(n(hr.rows[0]?.active) / n(hr.rows[0]?.total) * 80 + 20) : 70));
    const overallHealth = Math.round(finScore * 0.35 + opsScore * 0.25 + salesScore * 0.20 + hrScore * 0.10 + qualScore * 0.10);

    res.json({
      overallHealth,
      scores: { financial: finScore, operations: opsScore, sales: salesScore, hr: hrScore, quality: qualScore },
      weights: { financial: 35, operations: 25, sales: 20, hr: 10, quality: 10 },
      financial: { revenue, expenses, netIncome: revenue - expenses, cash: n(fin.rows[0]?.cash), overdueAR: n(fin.rows[0]?.overdue_ar), overdueAP: n(fin.rows[0]?.overdue_ap) },
      operations: { totalWorkOrders: totalWo, completed: doneWo, delayed: delayedWo, active: n(ops.rows[0]?.active_wo) },
      sales: { totalOrders: n(sales.rows[0]?.total_orders), pipeline: n(sales.rows[0]?.pipeline), newOrders30d: n(sales.rows[0]?.new_orders), newLeads: n(sales.rows[0]?.new_leads), pendingQuotes: n(sales.rows[0]?.pending_quotes) },
      hr: { total: n(hr.rows[0]?.total), active: n(hr.rows[0]?.active), newHires90d: n(hr.rows[0]?.new_hires) },
      quality: { totalInspections: totalInsp, passed: passedInsp, failed: n(quality.rows[0]?.failed), passRate: totalInsp > 0 ? (passedInsp / totalInsp * 100).toFixed(1) : 0 },
    });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get("/executive/kpi-board", async (_req: Request, res: Response) => {
  try {
    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const [revMonth, expMonth, ordMonth, woMonth, custMonth, arAging, invEff, leadConv] = await Promise.all([
      q("SELECT COALESCE(SUM(total_amount),0) as total FROM sales_orders WHERE TO_CHAR(created_at,'YYYY-MM')=$1 AND status NOT IN ('cancelled','draft','מבוטל')", [thisMonth]),
      q("SELECT COALESCE(SUM(total_amount),0) as total FROM purchase_orders WHERE TO_CHAR(created_at,'YYYY-MM')=$1 AND status NOT IN ('cancelled','draft','מבוטל')", [thisMonth]),
      q("SELECT COUNT(*) as cnt FROM sales_orders WHERE TO_CHAR(created_at,'YYYY-MM')=$1 AND status NOT IN ('cancelled','draft','מבוטל')", [thisMonth]),
      q("SELECT COUNT(*) as total, COUNT(*) FILTER(WHERE status IN ('הושלם','completed')) as done FROM work_orders WHERE TO_CHAR(created_at,'YYYY-MM')=$1 AND deleted_at IS NULL", [thisMonth]),
      q("SELECT COUNT(*) as new_cust FROM sales_customers WHERE TO_CHAR(created_at,'YYYY-MM')=$1", [thisMonth]),
      q(`SELECT COUNT(*) FILTER(WHERE due_date < NOW()-INTERVAL '90 days' AND status NOT IN ('שולם','paid','cancelled','מבוטל')) as over90,
         COUNT(*) FILTER(WHERE due_date < NOW()-INTERVAL '60 days' AND due_date >= NOW()-INTERVAL '90 days' AND status NOT IN ('שולם','paid','cancelled','מבוטל')) as d60_90,
         COUNT(*) FILTER(WHERE due_date < NOW()-INTERVAL '30 days' AND due_date >= NOW()-INTERVAL '60 days' AND status NOT IN ('שולם','paid','cancelled','מבוטל')) as d30_60,
         COUNT(*) FILTER(WHERE due_date < NOW() AND due_date >= NOW()-INTERVAL '30 days' AND status NOT IN ('שולם','paid','cancelled','מבוטל')) as d0_30
         FROM customer_invoices`),
      q("SELECT COUNT(*) as total, COUNT(*) FILTER(WHERE status IN ('שולם','paid')) as paid FROM customer_invoices WHERE TO_CHAR(created_at,'YYYY-MM')=$1", [thisMonth]),
      q("SELECT COUNT(*) as total, COUNT(*) FILTER(WHERE status IN ('הומר','converted','won')) as converted FROM crm_leads WHERE TO_CHAR(created_at,'YYYY-MM')=$1", [thisMonth]),
    ]);
    const monthRevenue = n(revMonth.rows[0]?.total); const monthExpenses = n(expMonth.rows[0]?.total);
    res.json({
      monthly: {
        revenue: monthRevenue, expenses: monthExpenses, netIncome: monthRevenue - monthExpenses,
        orders: n(ordMonth.rows[0]?.cnt), newCustomers: n(custMonth.rows[0]?.new_cust),
        woTotal: n(woMonth.rows[0]?.total), woCompleted: n(woMonth.rows[0]?.done),
        invoiceTotal: n(invEff.rows[0]?.total), invoicePaid: n(invEff.rows[0]?.paid),
        leadsTotal: n(leadConv.rows[0]?.total), leadsConverted: n(leadConv.rows[0]?.converted),
      },
      arAging: { over90: n(arAging.rows[0]?.over90), d60_90: n(arAging.rows[0]?.d60_90), d30_60: n(arAging.rows[0]?.d30_60), d0_30: n(arAging.rows[0]?.d0_30) },
      period: thisMonth,
    });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get("/executive/kpi-board/list", async (req: Request, res: Response) => {
  try {
    const { search, status, category, limit = "100", offset = "0" } = req.query as any;
    let sql = "SELECT * FROM executive_kpis WHERE 1=1";
    const params: any[] = [];
    let pi = 1;
    if (search) { sql += ` AND (name ILIKE $${pi} OR category ILIKE $${pi} OR owner ILIKE $${pi})`; params.push(`%${search}%`); pi++; }
    if (status) { sql += ` AND status=$${pi}`; params.push(status); pi++; }
    if (category) { sql += ` AND category=$${pi}`; params.push(category); pi++; }
    sql += ` ORDER BY created_at DESC LIMIT $${pi} OFFSET $${pi+1}`;
    params.push(Number(limit), Number(offset));
    const result = await q(sql, params);
    res.json(result.rows);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post("/executive/kpi-board", async (req: Request, res: Response) => {
  try {
    const { name, category, value, target, achievement, weight, frequency, owner, status, notes } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: "שם ה-KPI הוא שדה חובה" });
    const result = await pool.query(
      `INSERT INTO executive_kpis (name, category, value, target, achievement, weight, frequency, owner, status, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [name, category || null, value || null, target || null,
       achievement != null && achievement !== "" ? Number(achievement) : null,
       weight != null && weight !== "" ? Number(weight) : null,
       frequency || null, owner || null, status || null, notes || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.put("/executive/kpi-board/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, category, value, target, achievement, weight, frequency, owner, status, notes } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: "שם ה-KPI הוא שדה חובה" });
    const result = await pool.query(
      `UPDATE executive_kpis
       SET name=$1, category=$2, value=$3, target=$4,
           achievement=CASE WHEN $5::text IS NOT NULL THEN $5::numeric ELSE achievement END,
           weight=CASE WHEN $6::text IS NOT NULL THEN $6::numeric ELSE weight END,
           frequency=$7, owner=$8, status=$9, notes=$10, updated_at=now()
       WHERE id=$11 RETURNING *`,
      [name, category || null, value || null, target || null,
       achievement != null && achievement !== "" ? String(Number(achievement)) : null,
       weight != null && weight !== "" ? String(Number(weight)) : null,
       frequency || null, owner || null, status || null, notes || null, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "לא נמצא" });
    res.json(result.rows[0]);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.delete("/executive/kpi-board/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await pool.query("DELETE FROM executive_kpis WHERE id=$1", [id]);
    res.json({ ok: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get("/executive/kpi-board/:id/history", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `SELECT al.id, al.action, al.created_at, al.user_id,
              COALESCE(u.full_name, al.user_id::text, 'מערכת') as user_name
       FROM audit_log al
       LEFT JOIN users u ON u.id = al.user_id::text
       WHERE al.entity_type = 'executive_kpis' AND al.entity_id = $1
       ORDER BY al.created_at DESC LIMIT 50`,
      [id]
    );
    res.json(result.rows.map((r: any) => ({
      id: r.id,
      action: r.action,
      timestamp: r.created_at,
      userName: r.user_name,
    })));
  } catch (err: any) {
    console.error("[executive-kpi-board] history fetch failed:", err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get("/executive/live-alerts", async (_req: Request, res: Response) => {
  try {
    const alerts: any[] = [];
    const [overdueInv, lowStock, delayedWo, overdueAp, stalLeads, pendQuot, failedQc] = await Promise.all([
      q("SELECT id, customer_name, total_amount, due_date FROM customer_invoices WHERE status NOT IN ('שולם','paid','cancelled','מבוטל') AND due_date < NOW() ORDER BY due_date LIMIT 10"),
      q("SELECT id, material_name as name, current_stock as quantity, reorder_point as minimum_quantity FROM raw_materials WHERE current_stock IS NOT NULL AND reorder_point IS NOT NULL AND current_stock::numeric <= reorder_point::numeric ORDER BY (current_stock::float/GREATEST(reorder_point::float,1)) LIMIT 10"),
      q("SELECT id, order_number, due_date as estimated_completion FROM work_orders WHERE status NOT IN ('הושלם','completed','cancelled','מבוטל') AND due_date < NOW() AND deleted_at IS NULL ORDER BY due_date LIMIT 10"),
      q("SELECT id, supplier_name, total_amount, due_date FROM supplier_invoices WHERE status NOT IN ('שולם','paid','cancelled','מבוטל') AND due_date < NOW() ORDER BY due_date LIMIT 10"),
      q("SELECT id, CONCAT(first_name, ' ', last_name) as name, company as company_name, created_at FROM crm_leads WHERE status IN ('חדש','new') AND created_at < NOW()-INTERVAL '14 days' ORDER BY created_at LIMIT 10"),
      q("SELECT id, customer_name, total_amount, valid_until FROM quotations WHERE status='pending' AND valid_until < NOW()+INTERVAL '7 days' ORDER BY valid_until LIMIT 10"),
      q("SELECT id, item_name as product_name, inspection_date, result FROM quality_inspections WHERE result IN ('נכשל','failed','fail') AND inspection_date > NOW()-INTERVAL '7 days' ORDER BY inspection_date DESC LIMIT 5"),
    ]);
    overdueInv.rows.forEach((r: any) => alerts.push({ type: "overdue_invoice", severity: "high", title: `חשבונית באיחור — ${r.customer_name}`, detail: `₪${n(r.total_amount).toLocaleString()} • מועד: ${r.due_date?.toISOString?.()?.slice(0, 10) || ""}`, entity: "customer_invoices", entityId: r.id }));
    lowStock.rows.forEach((r: any) => alerts.push({ type: "low_stock", severity: "high", title: `מלאי נמוך — ${r.name}`, detail: `נוכחי: ${r.quantity} • מינימום: ${r.minimum_quantity}`, entity: "raw_materials", entityId: r.id }));
    delayedWo.rows.forEach((r: any) => alerts.push({ type: "delayed_production", severity: "medium", title: `ייצור באיחור — ${r.order_number || r.product_name}`, detail: `צפי: ${r.estimated_completion?.toISOString?.()?.slice(0, 10) || ""}`, entity: "production_work_orders", entityId: r.id }));
    overdueAp.rows.forEach((r: any) => alerts.push({ type: "overdue_payment", severity: "medium", title: `תשלום לספק באיחור — ${r.supplier_name}`, detail: `₪${n(r.total_amount).toLocaleString()} • מועד: ${r.due_date?.toISOString?.()?.slice(0, 10) || ""}`, entity: "supplier_invoices", entityId: r.id }));
    stalLeads.rows.forEach((r: any) => alerts.push({ type: "stale_lead", severity: "low", title: `ליד לא טופל — ${r.name || r.company_name}`, detail: `נוצר: ${r.created_at?.toISOString?.()?.slice(0, 10) || ""}`, entity: "leads", entityId: r.id }));
    pendQuot.rows.forEach((r: any) => alerts.push({ type: "expiring_quote", severity: "medium", title: `הצעת מחיר עומדת לפוג — ${r.customer_name}`, detail: `₪${n(r.total_amount).toLocaleString()} • תוקף: ${r.valid_until?.toISOString?.()?.slice(0, 10) || ""}`, entity: "quotations", entityId: r.id }));
    failedQc.rows.forEach((r: any) => alerts.push({ type: "qc_failure", severity: "high", title: `כשל ב-QC — ${r.product_name}`, detail: `תאריך: ${r.inspection_date?.toISOString?.()?.slice(0, 10) || ""}`, entity: "qc_inspections", entityId: r.id }));
    alerts.sort((a, b) => ({ high: 0, medium: 1, low: 2 }[a.severity] || 9) - ({ high: 0, medium: 1, low: 2 }[b.severity] || 9));
    res.json({ alerts, summary: { high: alerts.filter(a => a.severity === "high").length, medium: alerts.filter(a => a.severity === "medium").length, low: alerts.filter(a => a.severity === "low").length, total: alerts.length } });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get("/executive/financial-risk", async (_req: Request, res: Response) => {
  try {
    const [ar, ap, cashflow, concentration, budgets] = await Promise.all([
      q(`SELECT COALESCE(SUM(total_amount),0) as total_ar,
         COALESCE(SUM(CASE WHEN due_date < NOW() THEN total_amount ELSE 0 END),0) as overdue_ar,
         COALESCE(SUM(CASE WHEN due_date < NOW()-INTERVAL '90 days' THEN total_amount ELSE 0 END),0) as critical_ar,
         COUNT(*) FILTER(WHERE due_date < NOW()) as overdue_count
         FROM customer_invoices WHERE status NOT IN ('שולם','paid','cancelled','מבוטל')`),
      q(`SELECT COALESCE(SUM(total_amount),0) as total_ap,
         COALESCE(SUM(CASE WHEN due_date < NOW() THEN total_amount ELSE 0 END),0) as overdue_ap
         FROM supplier_invoices WHERE status NOT IN ('שולם','paid','cancelled','מבוטל')`),
      q(`SELECT COALESCE(SUM(balance),0) as cash FROM bank_accounts WHERE status='active'`),
      q(`SELECT customer_name, COALESCE(SUM(total_amount),0) as total FROM customer_invoices WHERE status NOT IN ('שולם','paid','cancelled','מבוטל') GROUP BY customer_name ORDER BY total DESC LIMIT 5`),
      q(`SELECT department, COALESCE(SUM(allocated_amount),0) as allocated, COALESCE(SUM(used_amount),0) as used FROM budgets WHERE fiscal_year=$1 GROUP BY department`, [new Date().getFullYear().toString()]),
    ]);
    const totalAR = n(ar.rows[0]?.total_ar); const overdueAR = n(ar.rows[0]?.overdue_ar);
    const cash = n(cashflow.rows[0]?.cash); const totalAP = n(ap.rows[0]?.total_ap);
    const overBudget = budgets.rows.filter((r: any) => n(r.used) > n(r.allocated));
    res.json({
      receivables: { total: totalAR, overdue: overdueAR, critical: n(ar.rows[0]?.critical_ar), overdueRate: totalAR > 0 ? (overdueAR / totalAR * 100).toFixed(1) : 0, overdueCount: n(ar.rows[0]?.overdue_count) },
      payables: { total: totalAP, overdue: n(ap.rows[0]?.overdue_ap) },
      cashPosition: cash,
      liquidityRatio: totalAP > 0 ? ((cash + totalAR) / totalAP).toFixed(2) : 0,
      concentration: concentration.rows.map((r: any) => ({ customer: r.customer_name, amount: n(r.total) })),
      budgetOverruns: overBudget.map((r: any) => ({ department: r.department, allocated: n(r.allocated), used: n(r.used), overrun: n(r.used) - n(r.allocated) })),
      riskScore: Math.min(100, Math.max(0, 50 + (overdueAR > cash ? 30 : 0) + overBudget.length * 5 + (totalAP > cash + totalAR ? 20 : 0))),
    });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get("/executive/operational-bottlenecks", async (_req: Request, res: Response) => {
  try {
    const [woStatus, woDelayed, longRunning, pendingPO, pendingApproval] = await Promise.all([
      q("SELECT status, COUNT(*) as cnt FROM work_orders WHERE deleted_at IS NULL GROUP BY status"),
      q("SELECT id, order_number, due_date as estimated_completion, status, created_at FROM work_orders WHERE status NOT IN ('הושלם','completed','cancelled','מבוטל') AND due_date < NOW() AND deleted_at IS NULL ORDER BY due_date LIMIT 15"),
      q("SELECT id, order_number, status, created_at FROM work_orders WHERE status IN ('בביצוע','in_progress','active') AND created_at < NOW()-INTERVAL '30 days' AND deleted_at IS NULL ORDER BY created_at LIMIT 10"),
      q("SELECT id, order_number, supplier_name, status, total_amount, created_at FROM purchase_orders WHERE status IN ('pending','draft') AND created_at < NOW()-INTERVAL '7 days' ORDER BY created_at LIMIT 10"),
      q("SELECT id, customer_name, total_amount, status FROM quotations WHERE status='pending' AND created_at < NOW()-INTERVAL '14 days' ORDER BY created_at LIMIT 10"),
    ]);
    const statusMap: Record<string, number> = {};
    woStatus.rows.forEach((r: any) => { statusMap[r.status] = n(r.cnt); });
    res.json({
      workOrdersByStatus: statusMap,
      delayedWorkOrders: woDelayed.rows,
      longRunningOrders: longRunning.rows,
      pendingPurchaseOrders: pendingPO.rows,
      pendingApprovals: pendingApproval.rows,
      bottleneckScore: Math.min(100, woDelayed.rows.length * 5 + longRunning.rows.length * 3 + pendingPO.rows.length * 2),
    });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get("/executive/delayed-projects", async (_req: Request, res: Response) => {
  try {
    const [projects, delayedSO, delayedWO] = await Promise.all([
      q(`SELECT id, name, status, budget, COALESCE(actual_cost,0) as actual_cost, start_date, end_date, estimated_completion
         FROM project_analyses WHERE status NOT IN ('completed','cancelled') ORDER BY end_date LIMIT 20`),
      q(`SELECT id, order_number, customer_name, status, total_amount, delivery_date, created_at
         FROM sales_orders WHERE status NOT IN ('completed','cancelled','delivered','draft') AND delivery_date < NOW() ORDER BY delivery_date LIMIT 15`),
      q(`SELECT id, order_number, status, due_date as estimated_completion
         FROM work_orders WHERE status NOT IN ('הושלם','completed','cancelled','מבוטל') AND due_date < NOW() AND deleted_at IS NULL ORDER BY due_date LIMIT 15`),
    ]);
    res.json({
      projects: projects.rows.map((r: any) => ({ ...r, budget: n(r.budget), actual_cost: n(r.actual_cost), overBudget: n(r.actual_cost) > n(r.budget) })),
      delayedSalesOrders: delayedSO.rows,
      delayedWorkOrders: delayedWO.rows,
      summary: { delayedProjects: projects.rows.filter((r: any) => r.end_date && new Date(r.end_date) < new Date()).length, delayedOrders: delayedSO.rows.length, delayedProduction: delayedWO.rows.length },
    });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get("/executive/procurement-risk", async (_req: Request, res: Response) => {
  try {
    const [suppliers, lowStock, poCost, singleSource, overdueDelivery] = await Promise.all([
      q(`SELECT s.id, s.name, s.status, s.rating,
         COALESCE((SELECT SUM(total_amount) FROM purchase_orders WHERE supplier_id=s.id),0) as total_spend,
         COALESCE((SELECT COUNT(*) FROM purchase_orders WHERE supplier_id=s.id AND status='delayed'),0) as delayed_count
         FROM suppliers s WHERE s.status IN ('active','פעיל') ORDER BY total_spend DESC LIMIT 10`),
      q(`SELECT id, name, quantity, minimum_quantity, unit_cost FROM raw_materials WHERE quantity <= minimum_quantity ORDER BY (quantity::float/GREATEST(minimum_quantity,1)) LIMIT 15`),
      q(`SELECT COALESCE(SUM(total_amount),0) as total, COUNT(*) as cnt, TO_CHAR(created_at,'YYYY-MM') as month
         FROM purchase_orders WHERE created_at > NOW()-INTERVAL '6 months' GROUP BY month ORDER BY month`),
      q(`SELECT rm.name, COUNT(DISTINCT po.supplier_id) as supplier_count
         FROM raw_materials rm LEFT JOIN purchase_order_items poi ON poi.product_name=rm.name
         LEFT JOIN purchase_orders po ON po.id=poi.order_id
         GROUP BY rm.name HAVING COUNT(DISTINCT po.supplier_id) <= 1 LIMIT 10`),
      q(`SELECT id, order_number, supplier_name, expected_delivery FROM purchase_orders
         WHERE status NOT IN ('completed','cancelled','received') AND expected_delivery < NOW() ORDER BY expected_delivery LIMIT 10`),
    ]);
    res.json({
      topSuppliers: suppliers.rows.map((r: any) => ({ ...r, total_spend: n(r.total_spend), delayed_count: n(r.delayed_count) })),
      lowStockItems: lowStock.rows.map((r: any) => ({ ...r, quantity: n(r.quantity), minimum_quantity: n(r.minimum_quantity), criticalLevel: n(r.quantity) === 0 ? "out" : n(r.quantity) / n(r.minimum_quantity) < 0.5 ? "critical" : "warning" })),
      monthlyCosts: poCost.rows,
      singleSourceRisks: singleSource.rows,
      overdueDeliveries: overdueDelivery.rows,
      riskScore: Math.min(100, lowStock.rows.filter((r: any) => n(r.quantity) === 0).length * 15 + singleSource.rows.length * 5 + overdueDelivery.rows.length * 3),
    });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get("/executive/production-efficiency", async (_req: Request, res: Response) => {
  try {
    const [woStats, monthly, qcStats, machines] = await Promise.all([
      q(`SELECT status, COUNT(*) as cnt, 0 as qty, 0 as produced
         FROM work_orders WHERE deleted_at IS NULL GROUP BY status`),
      q(`SELECT TO_CHAR(created_at,'YYYY-MM') as month, COUNT(*) as total, COUNT(*) FILTER(WHERE status IN ('הושלם','completed')) as completed,
         0 as ordered, 0 as produced
         FROM work_orders WHERE created_at > NOW()-INTERVAL '6 months' AND deleted_at IS NULL GROUP BY month ORDER BY month`),
      q(`SELECT TO_CHAR(inspection_date,'YYYY-MM') as month, COUNT(*) as total, COUNT(*) FILTER(WHERE result IN ('עבר','passed','pass')) as passed
         FROM quality_inspections WHERE inspection_date > NOW()-INTERVAL '6 months' GROUP BY month ORDER BY month`),
      q("SELECT id, name, status, type FROM machines WHERE status IN ('active','פעיל') LIMIT 20"),
    ]);
    const statusMap: Record<string, any> = {};
    let totalOrdered = 0, totalProduced = 0;
    woStats.rows.forEach((r: any) => { statusMap[r.status] = { count: n(r.cnt), qty: n(r.qty), produced: n(r.produced) }; totalOrdered += n(r.qty); totalProduced += n(r.produced); });
    res.json({
      workOrdersByStatus: statusMap,
      overallEfficiency: totalOrdered > 0 ? (totalProduced / totalOrdered * 100).toFixed(1) : 0,
      monthlyTrend: monthly.rows,
      qualityTrend: qcStats.rows,
      activeMachines: machines.rows.length,
      totalOrdered, totalProduced,
    });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get("/executive/profitability", async (_req: Request, res: Response) => {
  try {
    const [rev, exp, byCustomer, byCategory, monthly] = await Promise.all([
      q("SELECT COALESCE(SUM(total_amount),0) as total FROM sales_orders WHERE status NOT IN ('cancelled','draft','מבוטל')"),
      q("SELECT COALESCE(SUM(total_amount),0) as total FROM purchase_orders WHERE status NOT IN ('cancelled','draft','מבוטל')"),
      q(`SELECT sc.name, COALESCE(SUM(so.total_amount),0) as revenue FROM sales_customers sc
         JOIN sales_orders so ON so.customer_id=sc.id WHERE so.status NOT IN ('cancelled','draft','מבוטל')
         GROUP BY sc.name ORDER BY revenue DESC LIMIT 10`),
      q("SELECT COALESCE(category,'אחר') as category, COALESCE(SUM(total_amount),0) as total FROM purchase_orders WHERE status NOT IN ('cancelled','draft','מבוטל') GROUP BY category ORDER BY total DESC LIMIT 10"),
      q(`SELECT TO_CHAR(created_at,'YYYY-MM') as month,
         COALESCE(SUM(total_amount),0) as revenue
         FROM sales_orders WHERE status NOT IN ('cancelled','draft','מבוטל') AND created_at > NOW()-INTERVAL '12 months'
         GROUP BY month ORDER BY month`),
    ]);
    const totalRev = n(rev.rows[0]?.total); const totalExp = n(exp.rows[0]?.total);
    res.json({
      revenue: totalRev, expenses: totalExp, netProfit: totalRev - totalExp,
      profitMargin: totalRev > 0 ? ((totalRev - totalExp) / totalRev * 100).toFixed(1) : 0,
      grossMargin: totalRev > 0 ? ((totalRev - totalExp * 0.7) / totalRev * 100).toFixed(1) : 0,
      topCustomers: byCustomer.rows.map((r: any) => ({ name: r.name, revenue: n(r.revenue) })),
      expensesByCategory: byCategory.rows.map((r: any) => ({ category: r.category, total: n(r.total) })),
      monthlyRevenue: monthly.rows,
    });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get("/executive/workforce-status", async (_req: Request, res: Response) => {
  try {
    const [empStats, byDept, byStatus, recentHires, attendance] = await Promise.all([
      q(`SELECT COUNT(*) as total, COUNT(*) FILTER(WHERE status IN ('active','פעיל')) as active,
         COUNT(*) FILTER(WHERE hire_date > NOW()-INTERVAL '90 days') as new_hires,
         COUNT(*) FILTER(WHERE termination_date IS NOT NULL AND termination_date > NOW()-INTERVAL '90 days') as terminated
         FROM employees`),
      q("SELECT COALESCE(department,'לא משויך') as department, COUNT(*) as cnt FROM employees WHERE status IN ('active','פעיל') GROUP BY department ORDER BY cnt DESC"),
      q("SELECT status, COUNT(*) as cnt FROM employees GROUP BY status"),
      q("SELECT id, first_name, last_name, department, position, hire_date FROM employees WHERE hire_date > NOW()-INTERVAL '90 days' ORDER BY hire_date DESC LIMIT 10"),
      q(`SELECT COUNT(*) as total,
         COUNT(*) FILTER(WHERE type='vacation' OR type='חופש') as vacation,
         COUNT(*) FILTER(WHERE type='sick' OR type='מחלה') as sick
         FROM attendance_records WHERE date > NOW()-INTERVAL '30 days'`),
    ]);
    res.json({
      total: n(empStats.rows[0]?.total), active: n(empStats.rows[0]?.active),
      newHires90d: n(empStats.rows[0]?.new_hires), terminated90d: n(empStats.rows[0]?.terminated),
      turnoverRate: n(empStats.rows[0]?.total) > 0 ? (n(empStats.rows[0]?.terminated) / n(empStats.rows[0]?.total) * 100).toFixed(1) : 0,
      byDepartment: byDept.rows.map((r: any) => ({ department: r.department, count: n(r.cnt) })),
      byStatus: byStatus.rows.map((r: any) => ({ status: r.status, count: n(r.cnt) })),
      recentHires: recentHires.rows,
      attendance: { total: n(attendance.rows[0]?.total), vacation: n(attendance.rows[0]?.vacation), sick: n(attendance.rows[0]?.sick) },
    });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
