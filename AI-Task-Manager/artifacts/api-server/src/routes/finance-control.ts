import { Router, Request, Response, NextFunction } from "express";
import { pool } from "@workspace/db";
import { validateSession } from "../lib/auth";

const router = Router();

async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.substring(7) : (req.query.token as string) || null;
  if (!token) { res.status(401).json({ error: "נדרשת התחברות" }); return; }
  const result = await validateSession(token);
  if (result.error || !result.user) { res.status(401).json({ error: "הסשן פג תוקף" }); return; }
  (req as any).user = result.user;
  next();
}

router.use(requireAuth as any);

const q = async (text: string, params?: any[]) => {
  const r = await pool.query(text, params);
  return r.rows;
};

const q1 = async (text: string, params?: any[]) => {
  const r = await pool.query(text, params);
  return r.rows[0] || {};
};

router.get("/finance-control/dashboard", async (_req: Request, res: Response) => {
  try {
    const [revenue, expenses, receivable, payable, cashflow, budgetSummary, recentJournals, bankBalances] = await Promise.all([
      q1(`SELECT COALESCE(SUM(total_amount),0) as total_revenue, COUNT(*) as invoice_count,
          COALESCE(SUM(CASE WHEN created_at >= NOW() - INTERVAL '30 days' THEN total_amount ELSE 0 END),0) as monthly_revenue
          FROM sales_orders WHERE status NOT IN ('cancelled','מבוטל')`),
      q1(`SELECT COALESCE(SUM(amount),0) as total_expenses, COUNT(*) as expense_count,
          COALESCE(SUM(CASE WHEN created_at >= NOW() - INTERVAL '30 days' THEN amount ELSE 0 END),0) as monthly_expenses
          FROM expenses WHERE status NOT IN ('cancelled','מבוטל')`),
      q1(`SELECT COALESCE(SUM(amount),0) as total_ar, COUNT(*) as ar_count,
          COALESCE(SUM(CASE WHEN due_date < NOW() THEN amount ELSE 0 END),0) as overdue_ar
          FROM accounts_receivable WHERE status NOT IN ('paid','שולם','cancelled','מבוטל')`),
      q1(`SELECT COALESCE(SUM(amount),0) as total_ap, COUNT(*) as ap_count,
          COALESCE(SUM(CASE WHEN due_date < NOW() THEN amount ELSE 0 END),0) as overdue_ap
          FROM accounts_payable WHERE status NOT IN ('paid','שולם','cancelled','מבוטל')`),
      q1(`SELECT COALESCE(SUM(CASE WHEN type IN ('inflow','הכנסה') THEN amount ELSE 0 END),0) as total_inflow,
          COALESCE(SUM(CASE WHEN type IN ('outflow','הוצאה') THEN amount ELSE 0 END),0) as total_outflow
          FROM cash_flow_records`),
      q1(`SELECT COALESCE(SUM(total_amount),0) as total_budget,
          COALESCE(SUM(spent_amount),0) as total_spent
          FROM budgets WHERE status IN ('active','פעיל','approved','מאושר')`),
      q(`SELECT id, entry_number, description, total_debit, total_credit, entry_date, status
         FROM journal_entries ORDER BY created_at DESC LIMIT 10`),
      q(`SELECT id, account_name, bank_name, account_number, balance, currency
         FROM bank_accounts WHERE status IN ('active','פעיל') ORDER BY balance DESC LIMIT 10`)
    ]);
    res.json({
      revenue, expenses, receivable, payable, cashflow, budgetSummary,
      recentJournals, bankBalances,
      netIncome: Number(revenue.total_revenue || 0) - Number(expenses.total_expenses || 0),
      currentRatio: Number(payable.total_ap) > 0 ? (Number(receivable.total_ar) / Number(payable.total_ap)).toFixed(2) : "N/A"
    });
  } catch (e: any) { res.json({ revenue: {}, expenses: {}, receivable: {}, payable: {}, cashflow: {}, budgetSummary: {}, recentJournals: [], bankBalances: [], netIncome: 0, currentRatio: "N/A" }); }
});

router.get("/finance-control/revenue-tracking", async (req: Request, res: Response) => {
  try {
    const period = (req.query.period as string) || "all";
    let dateFilter = "";
    if (period === "month") dateFilter = "AND so.created_at >= NOW() - INTERVAL '30 days'";
    else if (period === "quarter") dateFilter = "AND so.created_at >= NOW() - INTERVAL '90 days'";
    else if (period === "year") dateFilter = "AND so.created_at >= NOW() - INTERVAL '365 days'";

    const [orders, byCustomer, byMonth, stats] = await Promise.all([
      q(`SELECT so.id, so.order_number, so.customer_id, so.total_amount, so.status, so.created_at,
            c.name as customer_name
         FROM sales_orders so
         LEFT JOIN customers c ON c.id = so.customer_id
         WHERE so.status NOT IN ('cancelled','מבוטל') ${dateFilter}
         ORDER BY so.created_at DESC LIMIT 100`),
      q(`SELECT c.name as customer_name, COUNT(so.id) as order_count,
            COALESCE(SUM(so.total_amount),0) as total_revenue
         FROM sales_orders so
         LEFT JOIN customers c ON c.id = so.customer_id
         WHERE so.status NOT IN ('cancelled','מבוטל') ${dateFilter}
         GROUP BY c.name ORDER BY total_revenue DESC LIMIT 20`),
      q(`SELECT TO_CHAR(created_at, 'YYYY-MM') as month, COUNT(*) as count,
            COALESCE(SUM(total_amount),0) as revenue
         FROM sales_orders WHERE status NOT IN ('cancelled','מבוטל')
         GROUP BY TO_CHAR(created_at, 'YYYY-MM') ORDER BY month DESC LIMIT 12`),
      q1(`SELECT COUNT(*) as total_orders, COALESCE(SUM(total_amount),0) as total_revenue,
            COALESCE(AVG(total_amount),0) as avg_order_value
         FROM sales_orders WHERE status NOT IN ('cancelled','מבוטל') ${dateFilter}`)
    ]);
    res.json({ orders, byCustomer, byMonth, stats });
  } catch (e: any) { res.json({ orders: [], byCustomer: [], byMonth: [], stats: {} }); }
});

router.get("/finance-control/expense-breakdown", async (req: Request, res: Response) => {
  try {
    const period = (req.query.period as string) || "all";
    let dateFilter = "";
    if (period === "month") dateFilter = "AND created_at >= NOW() - INTERVAL '30 days'";
    else if (period === "quarter") dateFilter = "AND created_at >= NOW() - INTERVAL '90 days'";
    else if (period === "year") dateFilter = "AND created_at >= NOW() - INTERVAL '365 days'";

    const [byCategory, byMonth, bySupplier, topExpenses, stats] = await Promise.all([
      q(`SELECT COALESCE(category, 'אחר') as category, COUNT(*) as count,
            COALESCE(SUM(amount),0) as total
         FROM expenses WHERE status NOT IN ('cancelled','מבוטל') ${dateFilter}
         GROUP BY category ORDER BY total DESC`),
      q(`SELECT TO_CHAR(created_at, 'YYYY-MM') as month, COUNT(*) as count,
            COALESCE(SUM(amount),0) as total
         FROM expenses WHERE status NOT IN ('cancelled','מבוטל')
         GROUP BY TO_CHAR(created_at, 'YYYY-MM') ORDER BY month DESC LIMIT 12`),
      q(`SELECT COALESCE(supplier_name, 'לא צוין') as supplier_name, COUNT(*) as count,
            COALESCE(SUM(amount),0) as total
         FROM expenses WHERE status NOT IN ('cancelled','מבוטל') ${dateFilter}
         GROUP BY supplier_name ORDER BY total DESC LIMIT 20`),
      q(`SELECT id, description, amount, category, supplier_name, created_at, status
         FROM expenses WHERE status NOT IN ('cancelled','מבוטל') ${dateFilter}
         ORDER BY amount DESC LIMIT 20`),
      q1(`SELECT COUNT(*) as total_count, COALESCE(SUM(amount),0) as total_amount,
            COALESCE(AVG(amount),0) as avg_amount,
            COUNT(DISTINCT category) as category_count
         FROM expenses WHERE status NOT IN ('cancelled','מבוטל') ${dateFilter}`)
    ]);
    res.json({ byCategory, byMonth, bySupplier, topExpenses, stats });
  } catch (e: any) { res.json({ byCategory: [], byMonth: [], bySupplier: [], topExpenses: [], stats: {} }); }
});

router.get("/finance-control/payment-terms", async (_req: Request, res: Response) => {
  try {
    const rows = await q(`SELECT * FROM payment_terms ORDER BY name`);
    res.json(rows);
  } catch { res.json([]); }
});

router.post("/finance-control/payment-terms", async (req: Request, res: Response) => {
  try {
    const { name, description, days_due, discount_percent, discount_days, is_default } = req.body;
    await pool.query(`CREATE TABLE IF NOT EXISTS payment_terms (
      id SERIAL PRIMARY KEY, name VARCHAR(200) NOT NULL, description TEXT,
      days_due INTEGER DEFAULT 30, discount_percent NUMERIC(5,2) DEFAULT 0,
      discount_days INTEGER DEFAULT 0, is_default BOOLEAN DEFAULT false,
      status VARCHAR(50) DEFAULT 'active', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
    )`);
    const r = await pool.query(
      `INSERT INTO payment_terms (name, description, days_due, discount_percent, discount_days, is_default)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [name, description, days_due || 30, discount_percent || 0, discount_days || 0, is_default || false]
    );
    res.json(r.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put("/finance-control/payment-terms/:id", async (req: Request, res: Response) => {
  try {
    const { name, description, days_due, discount_percent, discount_days, is_default, status } = req.body;
    const r = await pool.query(
      `UPDATE payment_terms SET name=COALESCE($1,name), description=COALESCE($2,description),
       days_due=COALESCE($3,days_due), discount_percent=COALESCE($4,discount_percent),
       discount_days=COALESCE($5,discount_days), is_default=COALESCE($6,is_default),
       status=COALESCE($7,status), updated_at=NOW() WHERE id=$8 RETURNING *`,
      [name, description, days_due, discount_percent, discount_days, is_default, status, req.params.id]
    );
    res.json(r.rows[0] || {});
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete("/finance-control/payment-terms/:id", async (req: Request, res: Response) => {
  try {
    await pool.query(`DELETE FROM payment_terms WHERE id=$1`, [req.params.id]);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/finance-control/debit-notes", async (_req: Request, res: Response) => {
  try {
    const rows = await q(`SELECT * FROM debit_notes ORDER BY created_at DESC`);
    res.json(rows);
  } catch { res.json([]); }
});

router.post("/finance-control/debit-notes", async (req: Request, res: Response) => {
  try {
    const { note_number, customer_id, customer_name, supplier_id, supplier_name, amount, reason, reference_invoice, notes } = req.body;
    await pool.query(`CREATE TABLE IF NOT EXISTS debit_notes (
      id SERIAL PRIMARY KEY, note_number VARCHAR(100), customer_id INTEGER, customer_name VARCHAR(200),
      supplier_id INTEGER, supplier_name VARCHAR(200), amount NUMERIC(15,2) DEFAULT 0,
      reason TEXT, reference_invoice VARCHAR(100), notes TEXT,
      status VARCHAR(50) DEFAULT 'draft', type VARCHAR(50) DEFAULT 'customer',
      created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
    )`);
    const year = new Date().getFullYear();
    const cnt = await q1(`SELECT COUNT(*) as c FROM debit_notes WHERE note_number LIKE $1`, [`DN${year}-%`]);
    const num = `DN${year}-${String(Number(cnt.c || 0) + 1).padStart(4, "0")}`;
    const r = await pool.query(
      `INSERT INTO debit_notes (note_number, customer_id, customer_name, supplier_id, supplier_name, amount, reason, reference_invoice, notes, type)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [note_number || num, customer_id, customer_name, supplier_id, supplier_name, amount || 0, reason, reference_invoice, notes, supplier_id ? "supplier" : "customer"]
    );
    res.json(r.rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put("/finance-control/debit-notes/:id", async (req: Request, res: Response) => {
  try {
    const { amount, reason, notes, status } = req.body;
    const r = await pool.query(
      `UPDATE debit_notes SET amount=COALESCE($1,amount), reason=COALESCE($2,reason),
       notes=COALESCE($3,notes), status=COALESCE($4,status), updated_at=NOW() WHERE id=$5 RETURNING *`,
      [amount, reason, notes, status, req.params.id]
    );
    res.json(r.rows[0] || {});
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/finance-control/cashflow-tracking", async (_req: Request, res: Response) => {
  try {
    const [records, byMonth, summary, forecast] = await Promise.all([
      q(`SELECT * FROM cash_flow_records ORDER BY record_date DESC LIMIT 100`),
      q(`SELECT TO_CHAR(record_date, 'YYYY-MM') as month,
            COALESCE(SUM(CASE WHEN type IN ('inflow','הכנסה') THEN amount ELSE 0 END),0) as inflow,
            COALESCE(SUM(CASE WHEN type IN ('outflow','הוצאה') THEN amount ELSE 0 END),0) as outflow
         FROM cash_flow_records GROUP BY TO_CHAR(record_date, 'YYYY-MM') ORDER BY month DESC LIMIT 12`),
      q1(`SELECT COALESCE(SUM(CASE WHEN type IN ('inflow','הכנסה') THEN amount ELSE 0 END),0) as total_inflow,
            COALESCE(SUM(CASE WHEN type IN ('outflow','הוצאה') THEN amount ELSE 0 END),0) as total_outflow
         FROM cash_flow_records`),
      q(`SELECT ba.account_name, ba.balance,
            COALESCE((SELECT SUM(amount) FROM accounts_receivable WHERE status NOT IN ('paid','שולם','cancelled','מבוטל') AND due_date <= NOW() + INTERVAL '30 days'),0) as expected_inflow,
            COALESCE((SELECT SUM(amount) FROM accounts_payable WHERE status NOT IN ('paid','שולם','cancelled','מבוטל') AND due_date <= NOW() + INTERVAL '30 days'),0) as expected_outflow
         FROM bank_accounts ba WHERE ba.status IN ('active','פעיל') LIMIT 5`)
    ]);
    res.json({ records, byMonth, summary, forecast });
  } catch (e: any) { res.json({ records: [], byMonth: [], summary: {}, forecast: [] }); }
});

router.get("/finance-control/project-profitability", async (_req: Request, res: Response) => {
  try {
    const [projects, summary] = await Promise.all([
      q(`SELECT p.id, p.name, p.status, p.budget,
            COALESCE(p.budget,0) as planned_budget,
            COALESCE((SELECT SUM(total_amount) FROM sales_orders WHERE project_id = p.id AND status NOT IN ('cancelled','מבוטל')),0) as revenue,
            COALESCE((SELECT SUM(amount) FROM expenses WHERE project_id = p.id AND status NOT IN ('cancelled','מבוטל')),0) as costs,
            COALESCE((SELECT SUM(total_amount) FROM purchase_orders WHERE project_id = p.id AND status NOT IN ('cancelled','מבוטל')),0) as purchase_costs
         FROM projects p ORDER BY p.name LIMIT 50`),
      q1(`SELECT COUNT(*) as total_projects,
            COALESCE(SUM(budget),0) as total_budget
         FROM projects WHERE status NOT IN ('cancelled','מבוטל','completed','הושלם')`)
    ]);
    const enriched = projects.map((p: any) => ({
      ...p,
      total_costs: Number(p.costs || 0) + Number(p.purchase_costs || 0),
      profit: Number(p.revenue || 0) - Number(p.costs || 0) - Number(p.purchase_costs || 0),
      margin: Number(p.revenue || 0) > 0
        ? (((Number(p.revenue) - Number(p.costs || 0) - Number(p.purchase_costs || 0)) / Number(p.revenue)) * 100).toFixed(1)
        : "0.0"
    }));
    res.json({ projects: enriched, summary });
  } catch (e: any) { res.json({ projects: [], summary: {} }); }
});

router.get("/finance-control/customer-profitability", async (_req: Request, res: Response) => {
  try {
    const customers = await q(`
      SELECT c.id, c.name, c.status,
        COALESCE((SELECT SUM(total_amount) FROM sales_orders WHERE customer_id = c.id AND status NOT IN ('cancelled','מבוטל')),0) as revenue,
        COALESCE((SELECT SUM(amount) FROM accounts_receivable WHERE customer_id = c.id AND status NOT IN ('paid','שולם','cancelled','מבוטל')),0) as outstanding_ar,
        COALESCE((SELECT COUNT(*) FROM sales_orders WHERE customer_id = c.id),0) as order_count,
        COALESCE((SELECT SUM(amount) FROM customer_payments WHERE customer_id = c.id),0) as total_paid,
        COALESCE((SELECT SUM(amount) FROM customer_refunds WHERE customer_id = c.id),0) as total_refunds
      FROM customers c WHERE c.status IN ('active','פעיל')
      ORDER BY revenue DESC LIMIT 50
    `);
    const enriched = customers.map((c: any) => ({
      ...c,
      net_revenue: Number(c.revenue || 0) - Number(c.total_refunds || 0),
      collection_rate: Number(c.revenue || 0) > 0
        ? ((Number(c.total_paid || 0) / Number(c.revenue)) * 100).toFixed(1) : "0.0"
    }));
    const stats = await q1(`SELECT COUNT(*) as total_customers,
      COALESCE(SUM(total_amount),0) as total_revenue
      FROM sales_orders so JOIN customers c ON c.id = so.customer_id
      WHERE so.status NOT IN ('cancelled','מבוטל') AND c.status IN ('active','פעיל')`);
    res.json({ customers: enriched, stats });
  } catch (e: any) { res.json({ customers: [], stats: {} }); }
});

router.get("/finance-control/supplier-cost-analysis", async (_req: Request, res: Response) => {
  try {
    const suppliers = await q(`
      SELECT s.id, s.name, s.status,
        COALESCE((SELECT SUM(total_amount) FROM purchase_orders WHERE supplier_id = s.id AND status NOT IN ('cancelled','מבוטל')),0) as total_purchases,
        COALESCE((SELECT SUM(amount) FROM accounts_payable WHERE supplier_id = s.id AND status NOT IN ('paid','שולם','cancelled','מבוטל')),0) as outstanding_ap,
        COALESCE((SELECT COUNT(*) FROM purchase_orders WHERE supplier_id = s.id),0) as order_count,
        COALESCE((SELECT SUM(amount) FROM supplier_payments WHERE supplier_id = s.id),0) as total_paid,
        COALESCE((SELECT AVG(quality_score) FROM supplier_evaluations WHERE supplier_id = s.id),0) as avg_quality
      FROM suppliers s WHERE s.status IN ('active','פעיל')
      ORDER BY total_purchases DESC LIMIT 50
    `);
    const stats = await q1(`SELECT COUNT(*) as total_suppliers,
      COALESCE(SUM(total_amount),0) as total_purchase_volume
      FROM purchase_orders po JOIN suppliers s ON s.id = po.supplier_id
      WHERE po.status NOT IN ('cancelled','מבוטל') AND s.status IN ('active','פעיל')`);
    res.json({ suppliers, stats });
  } catch (e: any) { res.json({ suppliers: [], stats: {} }); }
});

router.get("/finance-control/budget-vs-actual", async (_req: Request, res: Response) => {
  try {
    const [budgets, summary, byDepartment] = await Promise.all([
      q(`SELECT b.id, b.name, b.department, b.total_amount as planned,
            COALESCE(b.spent_amount,0) as actual, b.status, b.fiscal_year,
            CASE WHEN b.total_amount > 0 THEN ROUND((COALESCE(b.spent_amount,0)/b.total_amount)*100,1) ELSE 0 END as utilization
         FROM budgets b ORDER BY b.fiscal_year DESC, b.name`),
      q1(`SELECT COALESCE(SUM(total_amount),0) as total_planned,
            COALESCE(SUM(spent_amount),0) as total_actual,
            COUNT(*) as budget_count,
            COUNT(CASE WHEN spent_amount > total_amount THEN 1 END) as over_budget_count
         FROM budgets WHERE status IN ('active','פעיל','approved','מאושר')`),
      q(`SELECT COALESCE(department,'לא צוין') as department,
            COALESCE(SUM(total_amount),0) as planned,
            COALESCE(SUM(spent_amount),0) as actual
         FROM budgets WHERE status IN ('active','פעיל','approved','מאושר')
         GROUP BY department ORDER BY planned DESC`)
    ]);
    res.json({ budgets, summary, byDepartment });
  } catch (e: any) { res.json({ budgets: [], summary: {}, byDepartment: [] }); }
});

router.get("/finance-control/management-reporting", async (_req: Request, res: Response) => {
  try {
    const [pnl, arAging, apAging, topCustomers, topSuppliers, kpis] = await Promise.all([
      q(`SELECT TO_CHAR(created_at, 'YYYY-MM') as month,
            COALESCE(SUM(CASE WHEN type IN ('income','הכנסה','credit') THEN amount ELSE 0 END),0) as income,
            COALESCE(SUM(CASE WHEN type IN ('expense','הוצאה','debit') THEN amount ELSE 0 END),0) as expense
         FROM general_ledger GROUP BY TO_CHAR(created_at, 'YYYY-MM') ORDER BY month DESC LIMIT 12`),
      q(`SELECT
            COUNT(CASE WHEN due_date >= NOW() THEN 1 END) as current_count,
            COALESCE(SUM(CASE WHEN due_date >= NOW() THEN amount ELSE 0 END),0) as current_amount,
            COUNT(CASE WHEN due_date < NOW() AND due_date >= NOW() - INTERVAL '30 days' THEN 1 END) as days_30,
            COALESCE(SUM(CASE WHEN due_date < NOW() AND due_date >= NOW() - INTERVAL '30 days' THEN amount ELSE 0 END),0) as amount_30,
            COUNT(CASE WHEN due_date < NOW() - INTERVAL '30 days' AND due_date >= NOW() - INTERVAL '60 days' THEN 1 END) as days_60,
            COALESCE(SUM(CASE WHEN due_date < NOW() - INTERVAL '30 days' AND due_date >= NOW() - INTERVAL '60 days' THEN amount ELSE 0 END),0) as amount_60,
            COUNT(CASE WHEN due_date < NOW() - INTERVAL '60 days' THEN 1 END) as days_90_plus,
            COALESCE(SUM(CASE WHEN due_date < NOW() - INTERVAL '60 days' THEN amount ELSE 0 END),0) as amount_90_plus
         FROM accounts_receivable WHERE status NOT IN ('paid','שולם','cancelled','מבוטל')`),
      q(`SELECT
            COUNT(CASE WHEN due_date >= NOW() THEN 1 END) as current_count,
            COALESCE(SUM(CASE WHEN due_date >= NOW() THEN amount ELSE 0 END),0) as current_amount,
            COUNT(CASE WHEN due_date < NOW() AND due_date >= NOW() - INTERVAL '30 days' THEN 1 END) as days_30,
            COALESCE(SUM(CASE WHEN due_date < NOW() AND due_date >= NOW() - INTERVAL '30 days' THEN amount ELSE 0 END),0) as amount_30,
            COUNT(CASE WHEN due_date < NOW() - INTERVAL '30 days' THEN 1 END) as days_60_plus,
            COALESCE(SUM(CASE WHEN due_date < NOW() - INTERVAL '30 days' THEN amount ELSE 0 END),0) as amount_60_plus
         FROM accounts_payable WHERE status NOT IN ('paid','שולם','cancelled','מבוטל')`),
      q(`SELECT c.name, COALESCE(SUM(so.total_amount),0) as revenue
         FROM sales_orders so JOIN customers c ON c.id = so.customer_id
         WHERE so.status NOT IN ('cancelled','מבוטל')
         GROUP BY c.name ORDER BY revenue DESC LIMIT 10`),
      q(`SELECT s.name, COALESCE(SUM(po.total_amount),0) as total_spend
         FROM purchase_orders po JOIN suppliers s ON s.id = po.supplier_id
         WHERE po.status NOT IN ('cancelled','מבוטל')
         GROUP BY s.name ORDER BY total_spend DESC LIMIT 10`),
      q1(`SELECT
            (SELECT COALESCE(SUM(total_amount),0) FROM sales_orders WHERE status NOT IN ('cancelled','מבוטל') AND created_at >= NOW() - INTERVAL '30 days') as monthly_revenue,
            (SELECT COALESCE(SUM(amount),0) FROM expenses WHERE status NOT IN ('cancelled','מבוטל') AND created_at >= NOW() - INTERVAL '30 days') as monthly_expenses,
            (SELECT COALESCE(SUM(balance),0) FROM bank_accounts WHERE status IN ('active','פעיל')) as total_cash,
            (SELECT COUNT(*) FROM journal_entries WHERE created_at >= NOW() - INTERVAL '30 days') as monthly_journal_entries,
            (SELECT COUNT(*) FROM accounts_receivable WHERE status NOT IN ('paid','שולם','cancelled','מבוטל') AND due_date < NOW()) as overdue_invoices,
            (SELECT COUNT(*) FROM accounts_payable WHERE status NOT IN ('paid','שולם','cancelled','מבוטל') AND due_date < NOW()) as overdue_bills`)
    ]);
    res.json({ pnl, arAging: arAging[0] || {}, apAging: apAging[0] || {}, topCustomers, topSuppliers, kpis });
  } catch (e: any) { res.json({ pnl: [], arAging: {}, apAging: {}, topCustomers: [], topSuppliers: [], kpis: {} }); }
});

router.get("/finance-control/profitability-analysis", async (_req: Request, res: Response) => {
  try {
    const [overall, byProduct, trend] = await Promise.all([
      q1(`SELECT
            COALESCE((SELECT SUM(total_amount) FROM sales_orders WHERE status NOT IN ('cancelled','מבוטל')),0) as gross_revenue,
            COALESCE((SELECT SUM(amount) FROM expenses WHERE status NOT IN ('cancelled','מבוטל')),0) as total_expenses,
            COALESCE((SELECT SUM(total_amount) FROM purchase_orders WHERE status NOT IN ('cancelled','מבוטל')),0) as cost_of_goods`),
      q(`SELECT COALESCE(sol.product_name, 'אחר') as product, COUNT(*) as units,
            COALESCE(SUM(sol.total_price),0) as revenue
         FROM sales_order_lines sol
         GROUP BY sol.product_name ORDER BY revenue DESC LIMIT 15`),
      q(`SELECT TO_CHAR(so.created_at, 'YYYY-MM') as month,
            COALESCE(SUM(so.total_amount),0) as revenue,
            COALESCE((SELECT SUM(e.amount) FROM expenses e WHERE TO_CHAR(e.created_at, 'YYYY-MM') = TO_CHAR(so.created_at, 'YYYY-MM') AND e.status NOT IN ('cancelled','מבוטל')),0) as expenses
         FROM sales_orders so WHERE so.status NOT IN ('cancelled','מבוטל')
         GROUP BY TO_CHAR(so.created_at, 'YYYY-MM') ORDER BY month DESC LIMIT 12`)
    ]);
    const grossProfit = Number(overall.gross_revenue || 0) - Number(overall.cost_of_goods || 0);
    const netProfit = grossProfit - Number(overall.total_expenses || 0);
    res.json({
      overall: {
        ...overall,
        gross_profit: grossProfit,
        net_profit: netProfit,
        gross_margin: Number(overall.gross_revenue) > 0 ? ((grossProfit / Number(overall.gross_revenue)) * 100).toFixed(1) : "0.0",
        net_margin: Number(overall.gross_revenue) > 0 ? ((netProfit / Number(overall.gross_revenue)) * 100).toFixed(1) : "0.0"
      },
      byProduct, trend
    });
  } catch (e: any) { res.json({ overall: {}, byProduct: [], trend: [] }); }
});

export default router;
