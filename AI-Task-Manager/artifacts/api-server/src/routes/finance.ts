import { Router, Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { validateSession } from "../lib/auth";
import { onPaymentCreated, onExpenseCreated, onIncomeDocumentCreated, syncOverdueInvoices } from "../lib/data-sync";
import { fireCrmFollowupEvent } from "../lib/crm-followup-engine";

const router = Router();

async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.substring(7) : (req.query.token as string) || null;
  if (!token) { res.status(401).json({ error: "נדרשת התחברות" }); return; }
  const result = await validateSession(token);
  if (result.error || !result.user) { res.status(401).json({ error: "הסשן פג תוקף, יש להתחבר מחדש" }); return; }
  (req as any).user = result.user;
  next();
}

router.use("/finance", requireAuth as any);

async function safeQuery(query: string, params: any[] = []) {
  try {
    const result = await db.execute(sql.raw(query));
    return result.rows || [];
  } catch (err: any) {
    console.error("Finance query error:", err.message);
    return [];
  }
}

async function getEntityIdBySlugFinance(slug: string): Promise<number | null> {
  const rows = await safeQuery(`SELECT id FROM module_entities WHERE slug = '${slug}' LIMIT 1`);
  return (rows[0] as any)?.id ?? null;
}

async function dynamicEntitySummary(entitySlug: string, amountField: string, extraFilters: string = "") {
  const entityId = await getEntityIdBySlugFinance(entitySlug);
  if (!entityId) return {};
  const base = `FROM entity_records WHERE entity_id = ${entityId} AND status != 'cancelled'${extraFilters}`;
  const rows = await safeQuery(`SELECT
    COUNT(*) as total_invoices,
    COALESCE(SUM((data->>'${amountField}')::numeric), 0) as total_amount,
    COALESCE(SUM((data->>'paid_amount')::numeric), 0) as total_paid,
    COALESCE(SUM((data->>'balance_due')::numeric), 0) as total_outstanding,
    COUNT(*) FILTER (WHERE status='overdue') as overdue_count,
    COALESCE(SUM((data->>'balance_due')::numeric) FILTER (WHERE status='overdue'), 0) as overdue_amount
  ${base}`);
  return rows[0] || {};
}

router.get("/finance/dashboard", async (_req: Request, res: Response) => {
  try {
    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthStr = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, "0")}`;
    const n = (v: any) => Number(v || 0);

    const [
      revThisMonth, revLastMonth, expThisMonth, expLastMonth,
      monthlyRevenue, monthlyExpenses,
      topCustomers, topSuppliers,
      recentSalesOrders, recentPurchaseOrders,
      overdueInvoices,
      bankAccounts,
      expensesByCategory,
    ] = await Promise.all([
      safeQuery(`SELECT COALESCE(SUM(total_amount),0) as total FROM sales_orders WHERE TO_CHAR(created_at,'YYYY-MM')='${thisMonth}' AND status NOT IN ('cancelled','draft','מבוטל')`),
      safeQuery(`SELECT COALESCE(SUM(total_amount),0) as total FROM sales_orders WHERE TO_CHAR(created_at,'YYYY-MM')='${lastMonthStr}' AND status NOT IN ('cancelled','draft','מבוטל')`),
      safeQuery(`SELECT COALESCE(SUM(total_amount),0) as total FROM purchase_orders WHERE TO_CHAR(created_at,'YYYY-MM')='${thisMonth}' AND status NOT IN ('cancelled','draft','מבוטל')`),
      safeQuery(`SELECT COALESCE(SUM(total_amount),0) as total FROM purchase_orders WHERE TO_CHAR(created_at,'YYYY-MM')='${lastMonthStr}' AND status NOT IN ('cancelled','draft','מבוטל')`),
      safeQuery(`SELECT TO_CHAR(created_at,'YYYY-MM') as month, COALESCE(SUM(total_amount),0) as total FROM sales_orders WHERE status NOT IN ('cancelled','draft','מבוטל') AND created_at > NOW()-INTERVAL '6 months' GROUP BY month ORDER BY month`),
      safeQuery(`SELECT TO_CHAR(created_at,'YYYY-MM') as month, COALESCE(SUM(total_amount),0) as total FROM purchase_orders WHERE status NOT IN ('cancelled','draft','מבוטל') AND created_at > NOW()-INTERVAL '6 months' GROUP BY month ORDER BY month`),
      safeQuery(`SELECT customer_name, COALESCE(SUM(total_amount),0) as revenue, COUNT(*) as order_count FROM sales_orders WHERE status NOT IN ('cancelled','draft','מבוטל') GROUP BY customer_name ORDER BY revenue DESC LIMIT 5`),
      safeQuery(`SELECT supplier_name, COALESCE(SUM(total_amount),0) as spend, COUNT(*) as order_count FROM purchase_orders WHERE status NOT IN ('cancelled','draft','מבוטל') GROUP BY supplier_name ORDER BY spend DESC LIMIT 5`),
      safeQuery(`SELECT id, order_number, customer_name, total_amount, status, created_at FROM sales_orders WHERE status NOT IN ('cancelled','draft','מבוטל') ORDER BY created_at DESC LIMIT 6`),
      safeQuery(`SELECT id, order_number, supplier_name, total_amount, status, created_at FROM purchase_orders WHERE status NOT IN ('cancelled','draft','מבוטל') ORDER BY created_at DESC LIMIT 6`),
      safeQuery(`SELECT id, invoice_number, customer_name, total_amount, due_date, EXTRACT(DAY FROM NOW() - due_date)::int as days_overdue FROM customer_invoices WHERE status NOT IN ('שולם','paid','cancelled','מבוטל') AND due_date < NOW() ORDER BY due_date ASC LIMIT 6`),
      safeQuery(`SELECT id, bank_name, branch_number, account_number, balance, currency FROM bank_accounts WHERE status='active' ORDER BY balance DESC`),
      safeQuery(`SELECT COALESCE(category,'אחר') as name, COALESCE(SUM(total_amount),0) as value FROM purchase_orders WHERE status NOT IN ('cancelled','draft','מבוטל') GROUP BY category ORDER BY value DESC LIMIT 5`),
    ]);

    const curMonthRev = n(revThisMonth[0]?.total);
    const prevMonthRev = n(revLastMonth[0]?.total);
    const curMonthExp = n(expThisMonth[0]?.total);
    const prevMonthExp = n(expLastMonth[0]?.total);
    const netProfit = curMonthRev - curMonthExp;
    const prevNetProfit = prevMonthRev - prevMonthExp;

    const pctChange = (cur: number, prev: number) =>
      prev > 0 ? +((cur - prev) / prev * 100).toFixed(1) : (cur > 0 ? 100 : 0);

    const months: string[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    }
    const MONTHS_HE = ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"];
    const MONTHS_HE_SHORT = ["ינו׳", "פבר׳", "מרץ", "אפר׳", "מאי", "יונ׳", "יול׳", "אוג׳", "ספט׳", "אוק׳", "נוב׳", "דצמ׳"];

    const revMap: Record<string, number> = {};
    (monthlyRevenue as any[]).forEach((r: any) => { revMap[r.month] = n(r.total); });
    const expMap: Record<string, number> = {};
    (monthlyExpenses as any[]).forEach((r: any) => { expMap[r.month] = n(r.total); });

    const cashFlowData = months.map(m => {
      const [y, mo] = m.split("-");
      const monthIdx = parseInt(mo) - 1;
      const income = revMap[m] || 0;
      const expense = expMap[m] || 0;
      return {
        month: MONTHS_HE[monthIdx] || m,
        monthShort: MONTHS_HE_SHORT[monthIdx] || m,
        income,
        expense,
        net: income - expense,
      };
    });

    const topCustomersList = (topCustomers as any[]).map((c: any) => ({
      name: c.customer_name || "לא ידוע",
      revenue: n(c.revenue),
      invoices: n(c.order_count),
    }));

    const topSuppliersList = (topSuppliers as any[]).map((s: any) => ({
      name: s.supplier_name || "לא ידוע",
      spend: n(s.spend),
      orders: n(s.order_count),
    }));

    const recentTransactions = [
      ...(recentSalesOrders as any[]).map((o: any) => ({
        id: o.order_number || `SO-${o.id}`,
        type: "income",
        desc: `הזמנת מכירה — ${o.customer_name || "לקוח"}`,
        amount: n(o.total_amount),
        date: new Date(o.created_at).toLocaleDateString("he-IL"),
        sortTs: new Date(o.created_at).getTime(),
        method: "הזמנה",
      })),
      ...(recentPurchaseOrders as any[]).map((o: any) => ({
        id: o.order_number || `PO-${o.id}`,
        type: "expense",
        desc: `הזמנת רכש — ${o.supplier_name || "ספק"}`,
        amount: -n(o.total_amount),
        date: new Date(o.created_at).toLocaleDateString("he-IL"),
        sortTs: new Date(o.created_at).getTime(),
        method: "הזמנה",
      })),
    ]
      .sort((a, b) => (b.sortTs || 0) - (a.sortTs || 0))
      .slice(0, 6)
      .map(({ sortTs: _sortTs, ...rest }) => rest);

    const overdueInvoicesList = (overdueInvoices as any[]).map((inv: any) => {
      const days = n(inv.days_overdue);
      return {
        id: inv.invoice_number || `INV-${inv.id}`,
        customer: inv.customer_name || "לקוח",
        amount: n(inv.total_amount),
        dueDate: inv.due_date ? new Date(inv.due_date).toISOString().split("T")[0] : "",
        daysOverdue: days,
        status: days > 30 ? "critical" : days > 14 ? "warning" : "info",
      };
    });

    const bankAccountsList = (bankAccounts as any[]).map((b: any) => ({
      bank: b.bank_name || "בנק",
      branch: b.branch_number || "",
      account: b.account_number || "",
      balance: n(b.balance),
      currency: b.currency || "ILS",
    }));

    const totalBankBalance = bankAccountsList.reduce((s: number, a: any) => s + a.balance, 0);

    const expBreakdownRaw = (expensesByCategory as any[]).map((e: any) => ({
      name: e.name,
      value: n(e.value),
    }));
    const totalExpBreakdown = expBreakdownRaw.reduce((s: number, e: any) => s + e.value, 0);
    const expBreakdown = expBreakdownRaw.map((e: any) => ({
      ...e,
      percent: totalExpBreakdown > 0 ? +((e.value / totalExpBreakdown) * 100).toFixed(0) : 0,
    }));

    const hasData = curMonthRev > 0 || curMonthExp > 0 || bankAccountsList.length > 0;

    res.json({
      hasData,
      kpis: {
        currentMonthRevenue: curMonthRev,
        prevMonthRevenue: prevMonthRev,
        revenueChange: pctChange(curMonthRev, prevMonthRev),
        currentMonthExpense: curMonthExp,
        prevMonthExpense: prevMonthExp,
        expenseChange: pctChange(curMonthExp, prevMonthExp),
        netProfit,
        prevNetProfit,
        profitChange: pctChange(netProfit, prevNetProfit),
        totalBankBalance,
        bankCount: bankAccountsList.length,
      },
      cashFlowData,
      topCustomers: topCustomersList,
      topSuppliers: topSuppliersList,
      recentTransactions,
      overdueInvoices: overdueInvoicesList,
      bankAccounts: bankAccountsList,
      expenseBreakdown: expBreakdown,
      period: thisMonth,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

const ALLOWED_COLUMNS: Record<string, string[]> = {
  accounts_payable: ["supplier_id", "supplier_name", "invoice_number", "amount", "currency", "paid_amount", "balance_due", "due_date", "invoice_date", "status", "payment_terms", "description", "notes", "category"],
  accounts_receivable: ["customer_id", "customer_name", "invoice_number", "amount", "currency", "paid_amount", "balance_due", "due_date", "invoice_date", "status", "payment_terms", "description", "notes", "category"],
  expenses: ["description", "amount", "currency", "category", "sub_category", "date", "vendor", "receipt_number", "status", "approved_by", "department", "project_id", "notes", "payment_method", "is_recurring", "file_url", "file_name", "expense_date", "vendor_name", "vat_amount", "total_with_vat", "subcategory"],
  financial_transactions: ["type", "amount", "currency", "description", "category", "date", "reference_number", "from_account", "to_account", "status", "notes", "related_entity_type", "related_entity_id"],
  projects: ["name", "description", "client_name", "status", "start_date", "end_date", "budget", "actual_cost", "estimated_revenue", "actual_revenue", "manager", "department", "priority", "notes", "category"],
  bank_accounts: ["bank_name", "account_number", "branch_number", "account_type", "currency", "current_balance", "is_active", "notes"],
  payments: ["type", "amount", "currency", "date", "method", "reference_number", "from_entity", "to_entity", "description", "status", "bank_account_id", "notes"],
  budgets: ["name", "department", "category", "amount", "spent", "period_start", "period_end", "status", "notes"],
  financial_accounts: ["account_number", "account_name", "account_type", "parent_id", "balance", "currency", "description", "is_active"],
};

const ALLOWED_SORT_COLUMNS = ["id", "created_at", "updated_at", "amount", "date", "due_date", "status", "name", "invoice_number", "invoice_date", "category", "balance_due"];

function toSnakeCase(key: string): string {
  return key.replace(/([A-Z])/g, "_$1").toLowerCase();
}

const postCreateHooks: Record<string, (record: any, body: any) => void> = {};

function buildCrudRoutes(tableName: string, labelHe: string) {
  const allowedCols = ALLOWED_COLUMNS[tableName] || [];

  router.get(`/finance/${tableName}`, async (req: Request, res: Response) => {
    try {
      const { status, category, limit = "100", offset = "0", sort = "id", order = "desc" } = req.query;
      const params: any[] = [];
      let paramIdx = 1;
      let where = "WHERE 1=1";
      if (status) { where += ` AND status = $${paramIdx++}`; params.push(String(status)); }
      if (category) { where += ` AND category = $${paramIdx++}`; params.push(String(category)); }
      const sortCol = ALLOWED_SORT_COLUMNS.includes(String(sort)) ? String(sort) : "id";
      const safeOrder = String(order).toLowerCase() === "asc" ? "ASC" : "DESC";
      const safeLimit = Math.min(Math.max(parseInt(String(limit)) || 100, 1), 1000);
      const safeOffset = Math.max(parseInt(String(offset)) || 0, 0);
      const queryText = `SELECT * FROM ${tableName} ${where} ORDER BY ${sortCol} ${safeOrder} LIMIT ${safeLimit} OFFSET ${safeOffset}`;
      const countText = `SELECT COUNT(*) as total FROM ${tableName} ${where}`;
      const [rows, countResult] = await Promise.all([
        params.length > 0 ? db.execute(sql.raw(queryText.replace(/\$(\d+)/g, (_, i) => `'${String(params[i-1]).replace(/'/g, "''")}'`))) : db.execute(sql.raw(queryText)),
        params.length > 0 ? db.execute(sql.raw(countText.replace(/\$(\d+)/g, (_, i) => `'${String(params[i-1]).replace(/'/g, "''")}'`))) : db.execute(sql.raw(countText)),
      ]);
      res.json({ data: rows.rows || [], total: Number((countResult.rows as any)?.[0]?.total || 0) });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get(`/finance/${tableName}/:id`, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) { res.status(400).json({ error: "מזהה לא תקין" }); return; }
      const result = await db.execute(sql.raw(`SELECT * FROM ${tableName} WHERE id = ${id}`));
      const rows = result.rows || [];
      if (rows.length === 0) { res.status(404).json({ error: `${labelHe} לא נמצא` }); return; }
      res.json(rows[0]);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post(`/finance/${tableName}`, async (req: Request, res: Response) => {
    try {
      const body = req.body;
      const keys = Object.keys(body).filter(k => body[k] !== undefined && body[k] !== null);
      const safeCols: string[] = [];
      const safeVals: string[] = [];
      for (const k of keys) {
        const col = toSnakeCase(k);
        if (!allowedCols.includes(col)) continue;
        safeCols.push(col);
        const v = body[k];
        if (typeof v === "number") { safeVals.push(String(v)); }
        else if (typeof v === "boolean") { safeVals.push(v ? "true" : "false"); }
        else { safeVals.push(`'${String(v).replace(/'/g, "''")}'`); }
      }
      if (safeCols.length === 0) { res.status(400).json({ error: "אין שדות תקינים" }); return; }
      const quotedCols = safeCols.map(c => `"${c}"`);
      const result = await db.execute(sql.raw(`INSERT INTO ${tableName} (${quotedCols.join(", ")}) VALUES (${safeVals.join(", ")}) RETURNING *`));
      const created = result.rows?.[0];

      if (postCreateHooks[tableName] && created) {
        try { postCreateHooks[tableName](created, body); } catch (e) { console.error(`[data-sync] ${tableName} hook error:`, e); }
      }

      res.status(201).json(created);
      // Fire CRM follow-up engine for payment events — async, non-blocking
      if (tableName === "payments" && created) {
        const customerId = created.customer_id || body.customerId || body.customer_id;
        if (customerId) {
          fireCrmFollowupEvent("payment_received", "customer", { id: Number(customerId), entity_type: "customer" }).catch(() => {});
        }
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.put(`/finance/${tableName}/:id`, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) { res.status(400).json({ error: "מזהה לא תקין" }); return; }
      const body = req.body;
      const sets: string[] = [];
      for (const k of Object.keys(body).filter(k2 => body[k2] !== undefined)) {
        const col = toSnakeCase(k);
        if (!allowedCols.includes(col)) continue;
        const v = body[k];
        if (v === null) { sets.push(`"${col}" = NULL`); }
        else if (typeof v === "number") { sets.push(`"${col}" = ${v}`); }
        else if (typeof v === "boolean") { sets.push(`"${col}" = ${v}`); }
        else { sets.push(`"${col}" = '${String(v).replace(/'/g, "''")}'`); }
      }
      if (sets.length === 0) { res.status(400).json({ error: "אין שדות לעדכון" }); return; }
      sets.push("updated_at = NOW()");
      const result = await db.execute(sql.raw(`UPDATE ${tableName} SET ${sets.join(", ")} WHERE id = ${id} RETURNING *`));
      if (!result.rows?.length) { res.status(404).json({ error: `${labelHe} לא נמצא` }); return; }
      res.json(result.rows[0]);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.delete(`/finance/${tableName}/:id`, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) { res.status(400).json({ error: "מזהה לא תקין" }); return; }
      await db.execute(sql.raw(`DELETE FROM ${tableName} WHERE id = ${id}`));
      res.json({ message: `${labelHe} נמחק` });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });
}

buildCrudRoutes("accounts_payable", "חשבון ספק");
buildCrudRoutes("accounts_receivable", "חשבון חייב");
buildCrudRoutes("expenses", "הוצאה");
buildCrudRoutes("financial_transactions", "תנועה כספית");
buildCrudRoutes("projects", "פרויקט");
buildCrudRoutes("bank_accounts", "חשבון בנק");
buildCrudRoutes("payments", "תשלום");
buildCrudRoutes("budgets", "תקציב");
buildCrudRoutes("financial_accounts", "חשבון חשבונאי");

postCreateHooks["payments"] = (record: any, body: any) => {
  onPaymentCreated({
    type: body.type || record.type || "outgoing",
    amount: Number(body.amount || record.amount || 0),
    bankAccountId: body.bankAccountId ? Number(body.bankAccountId) : (body.bank_account_id ? Number(body.bank_account_id) : undefined),
    method: body.method || record.method || "",
    fromEntity: body.fromEntity || body.from_entity || "",
    toEntity: body.toEntity || body.to_entity || "",
    description: body.description || record.description || "",
    relatedInvoice: body.referenceNumber || body.reference_number || "",
  }).catch(err => console.error("[data-sync] payment cascade error:", err));
};

postCreateHooks["expenses"] = (record: any, body: any) => {
  onExpenseCreated({
    amount: Number(body.amount || record.amount || 0),
    category: body.category || record.category || "",
    department: body.department || record.department || "",
    description: body.description || record.description || "",
  }).catch(err => console.error("[data-sync] expense cascade error:", err));
};

ALLOWED_COLUMNS["income_documents"] = ["document_number", "document_type", "customer_name", "customer_id", "description", "amount", "vat_amount", "total_with_vat", "payment_method", "invoice_date", "due_date", "products", "status", "linked_document", "notes"];
ALLOWED_COLUMNS["credit_card_transactions"] = ["customer_name", "customer_id", "amount", "card_last4", "card_type", "source", "status", "linked_document", "products", "description", "installments", "transaction_date", "approval_number", "terminal_number"];
ALLOWED_COLUMNS["standing_orders"] = ["customer_name", "customer_id", "amount", "frequency", "start_date", "end_date", "payment_method", "description", "status", "last_charge_date", "next_charge_date", "notes"];

router.get("/finance/income", async (req: Request, res: Response) => {
  try {
    const { status, document_type, limit = "100", offset = "0" } = req.query;
    let where = "WHERE 1=1";
    if (status) where += ` AND status = '${String(status).replace(/'/g, "''")}'`;
    if (document_type) where += ` AND document_type = '${String(document_type).replace(/'/g, "''")}'`;
    const safeLimit = Math.min(Math.max(parseInt(String(limit)) || 100, 1), 1000);
    const safeOffset = Math.max(parseInt(String(offset)) || 0, 0);
    const rows = await safeQuery(`SELECT * FROM income_documents ${where} ORDER BY id DESC LIMIT ${safeLimit} OFFSET ${safeOffset}`);
    const countResult = await safeQuery(`SELECT COUNT(*) as total FROM income_documents ${where}`);
    res.json({ data: rows, total: Number(countResult[0]?.total || 0) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/finance/income", async (req: Request, res: Response) => {
  try {
    const body = req.body;
    const esc = (v: any) => `'${String(v || "").replace(/'/g, "''")}'`;
    const escDate = (v: any) => {
      const d = String(v || "");
      if (!/^\d{4}-\d{2}-\d{2}/.test(d)) return "NULL";
      return `'${d.slice(0, 10)}'`;
    };
    const countResult = await safeQuery(`SELECT COALESCE(MAX(id), 0) + 1 as next_num FROM income_documents`);
    const docNum = `INV-${String(countResult[0]?.next_num || 1).padStart(5, "0")}`;
    const totalWithVat = Number(body.amount || 0) + Number(body.vat_amount || 0);
    const result = await db.execute(sql.raw(`
      INSERT INTO income_documents (document_number, document_type, customer_name, description, amount, vat_amount, total_with_vat, payment_method, invoice_date, due_date, products, status)
      VALUES (${esc(docNum)}, ${esc(body.document_type || "tax_invoice_receipt")}, ${esc(body.customer_name)}, ${esc(body.description)}, ${Number(body.amount) || 0}, ${Number(body.vat_amount) || 0}, ${totalWithVat}, ${esc(body.payment_method || "bank_transfer")}, ${escDate(body.invoice_date || new Date().toISOString().split("T")[0])}, ${escDate(body.due_date)}, ${esc(body.products)}, ${esc(body.status || "final")})
      RETURNING *
    `));

    onIncomeDocumentCreated({
      documentNumber: docNum,
      customerName: body.customer_name || "",
      amount: Number(body.amount) || 0,
      vatAmount: Number(body.vat_amount) || 0,
      totalWithVat: totalWithVat,
      dueDate: body.due_date || undefined,
      paymentMethod: body.payment_method || "bank_transfer",
    }).catch(err => console.error("[data-sync] income doc cascade error:", err));

    res.status(201).json(result.rows?.[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/finance/credit-card-transactions", async (req: Request, res: Response) => {
  try {
    const { status, limit = "100", offset = "0" } = req.query;
    let where = "WHERE 1=1";
    if (status) where += ` AND status = '${String(status).replace(/'/g, "''")}'`;
    const safeLimit = Math.min(Math.max(parseInt(String(limit)) || 100, 1), 1000);
    const safeOffset = Math.max(parseInt(String(offset)) || 0, 0);
    const rows = await safeQuery(`SELECT * FROM credit_card_transactions ${where} ORDER BY id DESC LIMIT ${safeLimit} OFFSET ${safeOffset}`);
    const countResult = await safeQuery(`SELECT COUNT(*) as total FROM credit_card_transactions ${where}`);
    res.json({ data: rows, total: Number(countResult[0]?.total || 0) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/finance/credit-card-transactions", async (req: Request, res: Response) => {
  try {
    const body = req.body;
    const esc = (v: any) => `'${String(v || "").replace(/'/g, "''")}'`;
    const result = await db.execute(sql.raw(`
      INSERT INTO credit_card_transactions (customer_name, amount, card_last4, source, status, products, description, transaction_date)
      VALUES (${esc(body.customer_name)}, ${Number(body.amount) || 0}, ${esc(body.card_last4)}, ${esc(body.source || "manual")}, ${esc(body.status || "approved")}, ${esc(body.products)}, ${esc(body.description)}, NOW())
      RETURNING *
    `));
    res.status(201).json(result.rows?.[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/finance/standing-orders", async (req: Request, res: Response) => {
  try {
    const { status, limit = "100", offset = "0" } = req.query;
    let where = "WHERE 1=1";
    if (status) where += ` AND status = '${String(status).replace(/'/g, "''")}'`;
    const safeLimit = Math.min(Math.max(parseInt(String(limit)) || 100, 1), 1000);
    const safeOffset = Math.max(parseInt(String(offset)) || 0, 0);
    const rows = await safeQuery(`SELECT * FROM standing_orders ${where} ORDER BY id DESC LIMIT ${safeLimit} OFFSET ${safeOffset}`);
    const countResult = await safeQuery(`SELECT COUNT(*) as total FROM standing_orders ${where}`);
    res.json({ data: rows, total: Number(countResult[0]?.total || 0) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/finance/standing-orders", async (req: Request, res: Response) => {
  try {
    const body = req.body;
    const esc = (v: any) => `'${String(v || "").replace(/'/g, "''")}'`;
    const escDate = (v: any) => {
      const d = String(v || "");
      if (!/^\d{4}-\d{2}-\d{2}/.test(d)) return "NULL";
      return `'${d.slice(0, 10)}'`;
    };
    const result = await db.execute(sql.raw(`
      INSERT INTO standing_orders (customer_name, amount, frequency, start_date, end_date, payment_method, description, status)
      VALUES (${esc(body.customer_name)}, ${Number(body.amount) || 0}, ${esc(body.frequency || "monthly")}, ${escDate(body.start_date || new Date().toISOString().split("T")[0])}, ${escDate(body.end_date)}, ${esc(body.payment_method || "credit_card")}, ${esc(body.description)}, ${esc(body.status || "active")})
      RETURNING *
    `));
    res.status(201).json(result.rows?.[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.put("/finance/standing-orders/:id", async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "מזהה לא תקין" }); return; }
    const body = req.body;
    const sets: string[] = [];
    const allowed = ALLOWED_COLUMNS["standing_orders"];
    for (const k of Object.keys(body)) {
      const col = k.replace(/([A-Z])/g, "_$1").toLowerCase();
      if (!allowed.includes(col)) continue;
      const v = body[k];
      if (v === null) sets.push(`${col} = NULL`);
      else if (typeof v === "number") sets.push(`${col} = ${v}`);
      else sets.push(`${col} = '${String(v).replace(/'/g, "''")}'`);
    }
    if (sets.length === 0) { res.status(400).json({ error: "אין שדות לעדכון" }); return; }
    sets.push("updated_at = NOW()");
    const result = await db.execute(sql.raw(`UPDATE standing_orders SET ${sets.join(", ")} WHERE id = ${id} RETURNING *`));
    if (!result.rows?.length) { res.status(404).json({ error: "הוראת קבע לא נמצאה" }); return; }
    res.json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/finance/reports/income-expenses", async (req: Request, res: Response) => {
  try {
    const rawYear = parseInt(String(req.query.year || new Date().getFullYear()));
    const y = (isNaN(rawYear) || rawYear < 2000 || rawYear > 2100) ? new Date().getFullYear() : rawYear;
    const period = String(req.query.period || "monthly");
    const fromMonth = Math.max(1, Math.min(12, parseInt(String(req.query.from_month || "1")) || 1));
    const toMonth = Math.max(fromMonth, Math.min(12, parseInt(String(req.query.to_month || "12")) || 12));
    const step = period === "bimonthly" ? 2 : period === "yearly" ? 12 : 1;
    const income: Record<string, any> = {};
    const expenses: Record<string, any> = {};
    const files: Record<string, any> = {};

    for (let m = fromMonth; m <= toMonth; m += step) {
      const mEnd = Math.min(m + step, toMonth + 1);
      const monthStart = `${y}-${String(m).padStart(2, "0")}-01`;
      const monthEnd = mEnd <= 12 ? `${y}-${String(mEnd).padStart(2, "0")}-01` : `${y + 1}-01-01`;

      const incomeResult = await safeQuery(`
        SELECT 
          COALESCE(SUM(total_with_vat), 0) as taxable_with_vat,
          COALESCE(SUM(amount), 0) as taxable,
          COALESCE(SUM(vat_amount), 0) as vat
        FROM income_documents 
        WHERE invoice_date >= '${monthStart}' AND invoice_date < '${monthEnd}' AND status != 'cancelled'
      `);
      income[m] = incomeResult[0] || { taxable_with_vat: 0, taxable: 0, vat: 0 };

      const expenseResult = await safeQuery(`
        SELECT 
          COALESCE(SUM(COALESCE(total_with_vat, amount)), 0) as total,
          COALESCE(SUM(amount), 0) as without_vat,
          COALESCE(SUM(COALESCE(vat_amount, 0)), 0) as vat
        FROM expenses 
        WHERE expense_date >= '${monthStart}' AND expense_date < '${monthEnd}' AND status NOT IN ('cancelled', 'rejected')
      `);
      expenses[m] = expenseResult[0] || { total: 0, without_vat: 0, vat: 0 };

      const fileResult = await safeQuery(`
        SELECT COUNT(*) as count FROM expenses 
        WHERE expense_date >= '${monthStart}' AND expense_date < '${monthEnd}' AND file_url IS NOT NULL
      `);
      files[m] = fileResult[0] || { count: 0 };
    }

    res.json({ income, expenses, files, year: String(y) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/finance/reports/income-expenses/download", async (req: Request, res: Response) => {
  try {
    const format = String(req.query.format || "pdf");
    const rawYear = parseInt(String(req.query.year || new Date().getFullYear()));
    const y = (isNaN(rawYear) || rawYear < 2000 || rawYear > 2100) ? new Date().getFullYear() : rawYear;

    const incomeRows = await safeQuery(`
      SELECT id, doc_type, customer_name, invoice_date, amount, vat_amount, total_with_vat, status
      FROM income_documents WHERE EXTRACT(YEAR FROM invoice_date) = ${y} AND status != 'cancelled'
      ORDER BY invoice_date
    `);
    const expenseRows = await safeQuery(`
      SELECT id, supplier_name, category, expense_date, amount, vat_amount, total_with_vat, status
      FROM expenses WHERE EXTRACT(YEAR FROM expense_date) = ${y} AND status NOT IN ('cancelled','rejected')
      ORDER BY expense_date
    `);

    if (format === "xlsx") {
      const header = "סוג\tשם\tתאריך\tסכום\tמע\"מ\tסה\"כ כולל מע\"מ\tסטטוס\n";
      let tsv = header;
      incomeRows.forEach((r: any) => {
        tsv += `הכנסה\t${r.customer_name || ''}\t${r.invoice_date || ''}\t${r.amount || 0}\t${r.vat_amount || 0}\t${r.total_with_vat || 0}\t${r.status || ''}\n`;
      });
      expenseRows.forEach((r: any) => {
        tsv += `הוצאה\t${r.supplier_name || ''}\t${r.expense_date || ''}\t${r.amount || 0}\t${r.vat_amount || 0}\t${r.total_with_vat || 0}\t${r.status || ''}\n`;
      });
      res.setHeader("Content-Type", "text/tab-separated-values; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="income-expenses-${y}.tsv"`);
      res.send(tsv);
    } else if (format === "zip") {
      const files = await safeQuery(`
        SELECT file_url, file_name FROM expenses 
        WHERE EXTRACT(YEAR FROM expense_date) = ${y} AND file_url IS NOT NULL AND status NOT IN ('cancelled','rejected')
      `);
      const fileList = files.map((f: any) => `${f.file_name || 'file'}: ${f.file_url}`).join("\n");
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="expense-files-${y}.txt"`);
      res.send(`רשימת קבצי הוצאות לשנת ${y}\n${"=".repeat(40)}\n${fileList || "אין קבצים"}`);
    } else {
      let text = `דוח הכנסות והוצאות — שנת ${y}\n${"=".repeat(50)}\n\nהכנסות:\n`;
      incomeRows.forEach((r: any) => {
        text += `  ${r.invoice_date || ''} | ${r.customer_name || ''} | ₪${r.total_with_vat || 0}\n`;
      });
      text += `\nהוצאות:\n`;
      expenseRows.forEach((r: any) => {
        text += `  ${r.expense_date || ''} | ${r.supplier_name || ''} | ₪${r.total_with_vat || 0}\n`;
      });
      const totalInc = incomeRows.reduce((s: number, r: any) => s + Number(r.total_with_vat || 0), 0);
      const totalExp = expenseRows.reduce((s: number, r: any) => s + Number(r.total_with_vat || 0), 0);
      text += `\nסה"כ הכנסות: ₪${totalInc.toLocaleString("he-IL")}\nסה"כ הוצאות: ₪${totalExp.toLocaleString("he-IL")}\nרווח: ₪${(totalInc - totalExp).toLocaleString("he-IL")}`;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="income-expenses-${y}.txt"`);
      res.send(text);
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/finance/reports/income-expenses/export", async (req: Request, res: Response) => {
  try {
    const exportType = String(req.query.type || "hashbeshbet");
    const rawYear = parseInt(String(req.query.year || new Date().getFullYear()));
    const y = (isNaN(rawYear) || rawYear < 2000 || rawYear > 2100) ? new Date().getFullYear() : rawYear;

    const incomeRows = await safeQuery(`
      SELECT id, doc_type, doc_number, customer_name, customer_id, invoice_date, amount, vat_amount, total_with_vat
      FROM income_documents WHERE EXTRACT(YEAR FROM invoice_date) = ${y} AND status != 'cancelled'
      ORDER BY invoice_date
    `);
    const expenseRows = await safeQuery(`
      SELECT id, supplier_name, category, expense_date, amount, vat_amount, total_with_vat
      FROM expenses WHERE EXTRACT(YEAR FROM expense_date) = ${y} AND status NOT IN ('cancelled','rejected')
      ORDER BY expense_date
    `);

    if (exportType === "hashbeshbet") {
      let csv = "סוג,מס' מסמך,תאריך,שם לקוח/ספק,ח.פ/ת.ז,סכום,מע\"מ,סה\"כ,חשבון חובה,חשבון זכות\n";
      incomeRows.forEach((r: any) => {
        const date = r.invoice_date ? new Date(r.invoice_date).toLocaleDateString("he-IL") : "";
        csv += `הכנסה,${r.doc_number || r.id},${date},${r.customer_name || ''},${r.customer_id || ''},${r.amount || 0},${r.vat_amount || 0},${r.total_with_vat || 0},1210,4100\n`;
      });
      expenseRows.forEach((r: any) => {
        const date = r.expense_date ? new Date(r.expense_date).toLocaleDateString("he-IL") : "";
        csv += `הוצאה,,${date},${r.supplier_name || ''},,${r.amount || 0},${r.vat_amount || 0},${r.total_with_vat || 0},6100,2210\n`;
      });
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="hashbeshbet-export-${y}.csv"`);
      res.send("\uFEFF" + csv);
    } else {
      let text = `יצוא מאוחד — שנת ${y}\n${"=".repeat(50)}\n`;
      text += `סה"כ הכנסות: ${incomeRows.length} מסמכים\n`;
      text += `סה"כ הוצאות: ${expenseRows.length} מסמכים\n\n`;
      incomeRows.forEach((r: any) => {
        text += `[הכנסה] ${r.invoice_date || ''} | ${r.customer_name || ''} | ₪${r.total_with_vat || 0}\n`;
      });
      expenseRows.forEach((r: any) => {
        text += `[הוצאה] ${r.expense_date || ''} | ${r.supplier_name || ''} | ₪${r.total_with_vat || 0}\n`;
      });
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="unified-export-${y}.txt"`);
      res.send(text);
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/finance/reports/executive", async (req: Request, res: Response) => {
  try {
    const rawYear = parseInt(String(req.query.year || new Date().getFullYear()));
    const y = (isNaN(rawYear) || rawYear < 2000 || rawYear > 2100) ? new Date().getFullYear() : rawYear;

    const monthlyData = [];
    for (let m = 1; m <= 12; m++) {
      const monthStart = `${y}-${String(m).padStart(2, "0")}-01`;
      const monthEnd = m < 12 ? `${y}-${String(m + 1).padStart(2, "0")}-01` : `${y + 1}-01-01`;

      const incResult = await safeQuery(`
        SELECT COALESCE(SUM(amount), 0) as income FROM income_documents 
        WHERE invoice_date >= '${monthStart}' AND invoice_date < '${monthEnd}' AND status != 'cancelled'
      `);
      const expResult = await safeQuery(`
        SELECT COALESCE(SUM(amount), 0) as expenses FROM expenses 
        WHERE expense_date >= '${monthStart}' AND expense_date < '${monthEnd}' AND status NOT IN ('cancelled', 'rejected')
      `);
      monthlyData.push({
        month: m,
        income: Number(incResult[0]?.income || 0),
        expenses: Number(expResult[0]?.expenses || 0),
      });
    }

    const topCustomers = await safeQuery(`
      SELECT customer_name as name, COALESCE(SUM(total_with_vat), 0) as value
      FROM income_documents 
      WHERE EXTRACT(YEAR FROM invoice_date) = ${y} AND status != 'cancelled' AND customer_name IS NOT NULL AND customer_name != ''
      GROUP BY customer_name ORDER BY value DESC LIMIT 5
    `);

    const topProducts = await safeQuery(`
      SELECT COALESCE(products, 'אחר') as name, COALESCE(SUM(total_with_vat), 0) as value
      FROM income_documents 
      WHERE EXTRACT(YEAR FROM invoice_date) = ${y} AND status != 'cancelled'
      GROUP BY products ORDER BY value DESC LIMIT 5
    `);

    const collectionBalance = [];
    for (let m = 1; m <= 12; m++) {
      const monthEnd = m < 12 ? `${y}-${String(m + 1).padStart(2, "0")}-01` : `${y + 1}-01-01`;
      const balResult = await safeQuery(`
        SELECT COALESCE(SUM(total_with_vat), 0) as balance
        FROM income_documents 
        WHERE invoice_date < '${monthEnd}' AND status = 'draft' AND EXTRACT(YEAR FROM invoice_date) = ${y}
      `);
      collectionBalance.push({ month: m, balance: Number(balResult[0]?.balance || 0) });
    }

    res.json({
      monthly: monthlyData,
      topCustomers: topCustomers.map((r: any) => ({ name: r.name || "אחר", value: Number(r.value) })),
      topProducts: topProducts.map((r: any) => ({ name: r.name || "אחר", value: Number(r.value) })),
      collectionBalance,
      year: y,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.put("/finance/expenses/:id/file", async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "מזהה לא תקין" }); return; }
    const { file_url, file_name } = req.body;
    const esc = (v: any) => `'${String(v || "").replace(/'/g, "''")}'`;
    const result = await db.execute(sql.raw(`UPDATE expenses SET file_url = ${esc(file_url)}, file_name = ${esc(file_name)}, updated_at = NOW() WHERE id = ${id} RETURNING *`));
    if (!result.rows?.length) { res.status(404).json({ error: "הוצאה לא נמצאה" }); return; }
    res.json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/finance/reports/balance-sheet", async (_req: Request, res: Response) => {
  try {
    const bankEntityId = await getEntityIdBySlugFinance("finance-bank-accounts");
    const arEntityId = await getEntityIdBySlugFinance("accounts-receivable");
    const apEntityId = await getEntityIdBySlugFinance("accounts-payable");

    let bankBalances, arBalance, apBalance;
    const isDynamic = bankEntityId && arEntityId && apEntityId;
    let usedDynamic = false;

    if (isDynamic) {
      const hasRecords = await safeQuery(`SELECT 1 FROM entity_records WHERE entity_id = ${bankEntityId} LIMIT 1`);
      if (hasRecords.length > 0) {
        usedDynamic = true;
        bankBalances = await safeQuery(`SELECT COALESCE(SUM((data->>'current_balance')::numeric),0) as total FROM entity_records WHERE entity_id = ${bankEntityId} AND (data->>'is_active' = 'true' OR data->>'is_active' IS NULL)`);
        arBalance = await safeQuery(`SELECT COALESCE(SUM((data->>'balance_due')::numeric),0) as total FROM entity_records WHERE entity_id = ${arEntityId} AND status IN ('open','partial','overdue')`);
        apBalance = await safeQuery(`SELECT COALESCE(SUM((data->>'balance_due')::numeric),0) as total FROM entity_records WHERE entity_id = ${apEntityId} AND status IN ('open','partial','overdue')`);
      }
    }

    if (!usedDynamic) {
      bankBalances = await safeQuery(`SELECT COALESCE(SUM(current_balance),0) as total FROM bank_accounts WHERE is_active = true`);
      arBalance = await safeQuery(`SELECT COALESCE(SUM(balance_due),0) as total FROM accounts_receivable WHERE status IN ('open','partial','overdue')`);
      apBalance = await safeQuery(`SELECT COALESCE(SUM(balance_due),0) as total FROM accounts_payable WHERE status IN ('open','partial','overdue')`);
    }

    const assets = await safeQuery(`SELECT * FROM financial_accounts WHERE account_type = 'asset' AND is_active = true ORDER BY account_number`);
    const liabilities = await safeQuery(`SELECT * FROM financial_accounts WHERE account_type = 'liability' AND is_active = true ORDER BY account_number`);
    const equity = await safeQuery(`SELECT * FROM financial_accounts WHERE account_type = 'equity' AND is_active = true ORDER BY account_number`);

    const totalAssets = assets.reduce((s: number, a: any) => s + Number(a.balance || 0), 0)
      + Number(bankBalances![0]?.total || 0)
      + Number(arBalance![0]?.total || 0);
    const totalLiabilities = liabilities.reduce((s: number, a: any) => s + Number(a.balance || 0), 0)
      + Number(apBalance![0]?.total || 0);
    const totalEquity = equity.reduce((s: number, a: any) => s + Number(a.balance || 0), 0);

    res.json({
      assets: { items: assets, bankBalance: Number(bankBalances![0]?.total || 0), receivables: Number(arBalance![0]?.total || 0), total: totalAssets },
      liabilities: { items: liabilities, payables: Number(apBalance![0]?.total || 0), total: totalLiabilities },
      equity: { items: equity, total: totalEquity },
      netWorth: totalAssets - totalLiabilities,
      source: usedDynamic ? "dynamic" : "legacy",
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/finance/reports/profit-loss", async (req: Request, res: Response) => {
  try {
    const { from, to } = req.query;
    const datePattern = /^\d{4}-\d{2}-\d{2}$/;
    const safeFrom = from && datePattern.test(String(from)) ? `'${String(from)}'` : `date_trunc('month', CURRENT_DATE)`;
    const safeTo = to && datePattern.test(String(to)) ? `'${String(to)}'` : `CURRENT_DATE`;

    const arEntityId = await getEntityIdBySlugFinance("accounts-receivable");
    const expEntityId = await getEntityIdBySlugFinance("finance-expenses");
    const projEntityId = await getEntityIdBySlugFinance("finance-projects");

    const isDynamic = arEntityId && expEntityId;
    let usedDynamic = false;
    let revenue, costs, expensesByCategory, projectRevenue;

    if (isDynamic) {
      const hasRecords = await safeQuery(`SELECT 1 FROM entity_records WHERE entity_id = ${arEntityId} LIMIT 1`);
      if (hasRecords.length > 0) {
        usedDynamic = true;
        revenue = await safeQuery(`SELECT COALESCE(SUM((data->>'paid_amount')::numeric),0) as total FROM entity_records WHERE entity_id = ${arEntityId} AND (data->>'invoice_date')::date BETWEEN ${safeFrom} AND ${safeTo}`);
        costs = await safeQuery(`SELECT COALESCE(SUM((data->>'amount')::numeric),0) as total FROM entity_records WHERE entity_id = ${expEntityId} AND status NOT IN ('cancelled','rejected') AND (data->>'expense_date')::date BETWEEN ${safeFrom} AND ${safeTo}`);
        expensesByCategory = await safeQuery(`SELECT data->>'category' as category, SUM((data->>'amount')::numeric) as total FROM entity_records WHERE entity_id = ${expEntityId} AND status NOT IN ('cancelled','rejected') AND (data->>'expense_date')::date BETWEEN ${safeFrom} AND ${safeTo} GROUP BY data->>'category' ORDER BY total DESC`);
        if (projEntityId) {
          projectRevenue = await safeQuery(`SELECT data->>'project_name' as project_name, (data->>'actual_revenue')::numeric as actual_revenue, (data->>'actual_cost')::numeric as actual_cost, CASE WHEN (data->>'actual_revenue')::numeric > 0 THEN ROUND((((data->>'actual_revenue')::numeric - (data->>'actual_cost')::numeric) / (data->>'actual_revenue')::numeric * 100)::numeric, 1) ELSE 0 END as margin FROM entity_records WHERE entity_id = ${projEntityId} AND status IN ('active','completed') ORDER BY (data->>'actual_revenue')::numeric DESC LIMIT 20`);
        } else {
          projectRevenue = [];
        }
      }
    }

    if (!usedDynamic) {
      revenue = await safeQuery(`SELECT COALESCE(SUM(paid_amount),0) as total FROM accounts_receivable WHERE invoice_date BETWEEN ${safeFrom} AND ${safeTo}`);
      costs = await safeQuery(`SELECT COALESCE(SUM(amount),0) as total FROM expenses WHERE status NOT IN ('cancelled','rejected') AND expense_date BETWEEN ${safeFrom} AND ${safeTo}`);
      expensesByCategory = await safeQuery(`SELECT category, SUM(amount) as total FROM expenses WHERE status NOT IN ('cancelled','rejected') AND expense_date BETWEEN ${safeFrom} AND ${safeTo} GROUP BY category ORDER BY total DESC`);
      projectRevenue = await safeQuery(`SELECT project_name, actual_revenue, actual_cost, CASE WHEN actual_revenue > 0 THEN ROUND(((actual_revenue - actual_cost) / actual_revenue * 100)::numeric, 1) ELSE 0 END as margin FROM projects WHERE status IN ('active','completed') ORDER BY actual_revenue DESC LIMIT 20`);
    }

    const totalRevenue = Number(revenue![0]?.total || 0);
    const totalCosts = Number(costs![0]?.total || 0);

    res.json({
      revenue: totalRevenue,
      costs: totalCosts,
      grossProfit: totalRevenue - totalCosts,
      profitMargin: totalRevenue > 0 ? Math.round(((totalRevenue - totalCosts) / totalRevenue) * 1000) / 10 : 0,
      expensesByCategory,
      projectProfitability: projectRevenue,
      source: usedDynamic ? "dynamic" : "legacy",
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/finance/reports/cash-flow", async (_req: Request, res: Response) => {
  try {
    const bankEntityId = await getEntityIdBySlugFinance("finance-bank-accounts");
    const apEntityId = await getEntityIdBySlugFinance("accounts-payable");
    const arEntityId = await getEntityIdBySlugFinance("accounts-receivable");
    const payEntityId = await getEntityIdBySlugFinance("finance-payments");

    const isDynamic = bankEntityId && apEntityId && arEntityId;
    let bankTotal, upcomingPayables, upcomingReceivables, monthlyFlow;

    if (isDynamic) {
      const hasRecords = await safeQuery(`SELECT 1 FROM entity_records WHERE entity_id = ${bankEntityId} LIMIT 1`);
      if (hasRecords.length > 0) {
        bankTotal = await safeQuery(`SELECT COALESCE(SUM((data->>'current_balance')::numeric),0) as total FROM entity_records WHERE entity_id = ${bankEntityId} AND (data->>'is_active' = 'true' OR data->>'is_active' IS NULL)`);
        upcomingPayables = await safeQuery(`SELECT COALESCE(SUM((data->>'balance_due')::numeric),0) as total FROM entity_records WHERE entity_id = ${apEntityId} AND status IN ('open','partial','overdue') AND (data->>'due_date')::date <= CURRENT_DATE + INTERVAL '30 days'`);
        upcomingReceivables = await safeQuery(`SELECT COALESCE(SUM((data->>'balance_due')::numeric),0) as total FROM entity_records WHERE entity_id = ${arEntityId} AND status IN ('open','partial','overdue') AND (data->>'due_date')::date <= CURRENT_DATE + INTERVAL '30 days'`);
        if (payEntityId) {
          monthlyFlow = await safeQuery(`
            SELECT m.month,
              COALESCE(inc.total, 0) as income,
              COALESCE(exp.total, 0) as expenses
            FROM (SELECT TO_CHAR(generate_series(CURRENT_DATE - INTERVAL '5 months', CURRENT_DATE, '1 month'), 'YYYY-MM') as month) m
            LEFT JOIN (SELECT TO_CHAR((data->>'payment_date')::date, 'YYYY-MM') as month, SUM((data->>'amount')::numeric) as total FROM entity_records WHERE entity_id = ${payEntityId} AND data->>'payment_type' = 'incoming' GROUP BY month) inc ON m.month = inc.month
            LEFT JOIN (SELECT TO_CHAR((data->>'payment_date')::date, 'YYYY-MM') as month, SUM((data->>'amount')::numeric) as total FROM entity_records WHERE entity_id = ${payEntityId} AND data->>'payment_type' = 'outgoing' GROUP BY month) exp ON m.month = exp.month
            ORDER BY m.month
          `);
        } else {
          monthlyFlow = [];
        }

        const cash = Number(bankTotal[0]?.total || 0);
        const payables30 = Number(upcomingPayables[0]?.total || 0);
        const receivables30 = Number(upcomingReceivables[0]?.total || 0);
        res.json({ currentCash: cash, upcomingPayables: payables30, upcomingReceivables: receivables30, projectedCash: cash - payables30 + receivables30, monthlyFlow, source: "dynamic" });
        return;
      }
    }

    bankTotal = await safeQuery(`SELECT COALESCE(SUM(current_balance),0) as total FROM bank_accounts WHERE is_active = true`);
    upcomingPayables = await safeQuery(`SELECT COALESCE(SUM(balance_due),0) as total FROM accounts_payable WHERE status IN ('open','partial','overdue') AND due_date <= CURRENT_DATE + INTERVAL '30 days'`);
    upcomingReceivables = await safeQuery(`SELECT COALESCE(SUM(balance_due),0) as total FROM accounts_receivable WHERE status IN ('open','partial','overdue') AND due_date <= CURRENT_DATE + INTERVAL '30 days'`);
    monthlyFlow = await safeQuery(`
      SELECT m.month,
        COALESCE(inc.total, 0) as income,
        COALESCE(exp.total, 0) as expenses
      FROM (SELECT TO_CHAR(generate_series(CURRENT_DATE - INTERVAL '5 months', CURRENT_DATE, '1 month'), 'YYYY-MM') as month) m
      LEFT JOIN (SELECT TO_CHAR(payment_date, 'YYYY-MM') as month, SUM(amount) as total FROM payments WHERE payment_type = 'incoming' GROUP BY month) inc ON m.month = inc.month
      LEFT JOIN (SELECT TO_CHAR(payment_date, 'YYYY-MM') as month, SUM(amount) as total FROM payments WHERE payment_type = 'outgoing' GROUP BY month) exp ON m.month = exp.month
      ORDER BY m.month
    `);

    const cash = Number(bankTotal[0]?.total || 0);
    const payables30 = Number(upcomingPayables[0]?.total || 0);
    const receivables30 = Number(upcomingReceivables[0]?.total || 0);

    res.json({
      currentCash: cash,
      upcomingPayables: payables30,
      upcomingReceivables: receivables30,
      projectedCash: cash - payables30 + receivables30,
      monthlyFlow,
      source: "legacy",
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/finance/reports/aging", async (req: Request, res: Response) => {
  try {
    const { type = "payable" } = req.query;
    const entitySlug = type === "receivable" ? "accounts-receivable" : "accounts-payable";
    const nameField = type === "receivable" ? "customer_name" : "supplier_name";
    const entityId = await getEntityIdBySlugFinance(entitySlug);

    if (entityId) {
      const hasRecords = await safeQuery(`SELECT 1 FROM entity_records WHERE entity_id = ${entityId} LIMIT 1`);
      if (hasRecords.length > 0) {
        const aging = await safeQuery(`
          SELECT 
            data->>'${nameField}' as name,
            COUNT(*) as invoice_count,
            COALESCE(SUM((data->>'balance_due')::numeric) FILTER (WHERE (data->>'due_date')::date >= CURRENT_DATE), 0) as current_amount,
            COALESCE(SUM((data->>'balance_due')::numeric) FILTER (WHERE (data->>'due_date')::date < CURRENT_DATE AND (data->>'due_date')::date >= CURRENT_DATE - 30), 0) as days_1_30,
            COALESCE(SUM((data->>'balance_due')::numeric) FILTER (WHERE (data->>'due_date')::date < CURRENT_DATE - 30 AND (data->>'due_date')::date >= CURRENT_DATE - 60), 0) as days_31_60,
            COALESCE(SUM((data->>'balance_due')::numeric) FILTER (WHERE (data->>'due_date')::date < CURRENT_DATE - 60 AND (data->>'due_date')::date >= CURRENT_DATE - 90), 0) as days_61_90,
            COALESCE(SUM((data->>'balance_due')::numeric) FILTER (WHERE (data->>'due_date')::date < CURRENT_DATE - 90), 0) as over_90,
            COALESCE(SUM((data->>'balance_due')::numeric), 0) as total
          FROM entity_records
          WHERE entity_id = ${entityId} AND status IN ('open','partial','overdue')
          GROUP BY data->>'${nameField}'
          ORDER BY total DESC
        `);
        res.json({ aging, type, source: "dynamic" });
        return;
      }
    }

    const table = type === "receivable" ? "accounts_receivable" : "accounts_payable";
    const nameCol = type === "receivable" ? "customer_name" : "supplier_name";

    const aging = await safeQuery(`
      SELECT 
        ${nameCol} as name,
        COUNT(*) as invoice_count,
        COALESCE(SUM(balance_due) FILTER (WHERE due_date >= CURRENT_DATE), 0) as current_amount,
        COALESCE(SUM(balance_due) FILTER (WHERE due_date < CURRENT_DATE AND due_date >= CURRENT_DATE - 30), 0) as days_1_30,
        COALESCE(SUM(balance_due) FILTER (WHERE due_date < CURRENT_DATE - 30 AND due_date >= CURRENT_DATE - 60), 0) as days_31_60,
        COALESCE(SUM(balance_due) FILTER (WHERE due_date < CURRENT_DATE - 60 AND due_date >= CURRENT_DATE - 90), 0) as days_61_90,
        COALESCE(SUM(balance_due) FILTER (WHERE due_date < CURRENT_DATE - 90), 0) as over_90,
        COALESCE(SUM(balance_due), 0) as total
      FROM ${table}
      WHERE status IN ('open','partial','overdue')
      GROUP BY ${nameCol}
      ORDER BY total DESC
    `);

    res.json({ aging, type, source: "legacy" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/finance/migrate-to-dynamic", async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!user || (user.role !== "admin" && user.role !== "super_admin" && user.username !== "admin")) {
      res.status(403).json({ error: "הרשאת מנהל נדרשת להפעלת מיגרציה" });
      return;
    }

    const { moduleEntitiesTable, entityRecordsTable } = await import("@workspace/db/schema");
    const { eq } = await import("drizzle-orm");

    const ENTITY_FIELD_MAP: Record<string, { table: string; fieldMap?: Record<string, string> }> = {
      "accounts-payable": { table: "accounts_payable" },
      "accounts-receivable": { table: "accounts_receivable" },
      "finance-expenses": { table: "expenses", fieldMap: { date: "expense_date", vendor: "vendor_name" } },
      "finance-payments": { table: "payments" },
      "finance-budgets": { table: "budgets" },
      "finance-bank-accounts": { table: "bank_accounts", fieldMap: { name: "bank_name", balance: "current_balance" } },
      "finance-projects": { table: "projects", fieldMap: { name: "project_name", client_name: "customer_name", manager: "manager_name", revenue: "actual_revenue", cost: "actual_cost" } },
      "financial-transactions": { table: "financial_transactions" },
    };

    const results: Record<string, { migrated: number; skipped: number; errors: number }> = {};

    for (const [entitySlug, config] of Object.entries(ENTITY_FIELD_MAP)) {
      const [entity] = await db.select().from(moduleEntitiesTable)
        .where(eq(moduleEntitiesTable.slug, entitySlug));
      if (!entity) {
        results[entitySlug] = { migrated: 0, skipped: 0, errors: -1 };
        continue;
      }

      const existingRecords = await db.select({ id: entityRecordsTable.id, data: entityRecordsTable.data })
        .from(entityRecordsTable)
        .where(eq(entityRecordsTable.entityId, entity.id));
      const existingLegacyIds = new Set(
        existingRecords.map(r => (r.data as any)?._legacy_id).filter(Boolean)
      );

      const rows = await safeQuery(`SELECT * FROM ${config.table} ORDER BY id`);
      const fieldMap = config.fieldMap || {};
      let migrated = 0;
      let skipped = 0;
      let errors = 0;
      for (const row of rows as any[]) {
        const legacyId = (row as any).id;
        if (existingLegacyIds.has(legacyId) || existingLegacyIds.has(String(legacyId))) {
          skipped++;
          continue;
        }

        const data: Record<string, any> = { _legacy_id: legacyId };
        for (const [key, value] of Object.entries(row)) {
          if (key === "id" || key === "created_at" || key === "updated_at" || key === "tenant_id") continue;
          if (value !== null && value !== undefined) {
            const mappedKey = fieldMap[key] || key;
            data[mappedKey] = value;
          }
        }
        const status = (row as any).status || undefined;
        try {
          await db.insert(entityRecordsTable).values({
            entityId: entity.id,
            data,
            status: status || null,
          });
          migrated++;
        } catch (err: any) {
          console.error(`Migration error for ${entitySlug} row ${legacyId}:`, err.message);
          errors++;
        }
      }
      results[entitySlug] = { migrated, skipped, errors };
    }

    res.json({ success: true, migrated: results });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/finance/sync-overdue", async (_req: Request, res: Response) => {
  try {
    await syncOverdueInvoices();
    res.json({ success: true, message: "Overdue invoices synced" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/finance/debtors-balances", async (req: Request, res: Response) => {
  try {
    const debtDocType = String(req.query.debt_doc_type || "all");
    const closingDocType = String(req.query.closing_doc_type || "all");
    const customerFilter = String(req.query.customer || "");
    const dateFrom = String(req.query.from || "");
    const dateTo = String(req.query.to || "");

    let whereClause = "WHERE status != 'cancelled'";
    if (debtDocType !== "all") {
      whereClause += ` AND doc_type = '${debtDocType.replace(/'/g, "''")}'`;
    }
    if (dateFrom) whereClause += ` AND invoice_date >= '${dateFrom.replace(/'/g, "''")}'`;
    if (dateTo) whereClause += ` AND invoice_date <= '${dateTo.replace(/'/g, "''")}'`;

    let customerWhere = "";
    if (customerFilter) {
      customerWhere = ` AND customer_name ILIKE '%${customerFilter.replace(/'/g, "''")}%'`;
    }

    let closingFilter = "";
    if (closingDocType !== "all") {
      closingFilter = ` AND id NOT IN (
        SELECT DISTINCT i2.id FROM income_documents i2 
        WHERE i2.doc_type = '${closingDocType.replace(/'/g, "''")}' AND i2.status IN ('paid','completed')
      )`;
    }

    const debtors = await safeQuery(`
      SELECT 
        customer_name, customer_id,
        COALESCE(SUM(total_with_vat), 0) as total_invoiced,
        COALESCE(SUM(CASE WHEN status IN ('paid','completed') THEN total_with_vat ELSE 0 END), 0) as total_paid,
        COALESCE(SUM(CASE WHEN status NOT IN ('paid','completed') THEN total_with_vat ELSE 0 END), 0) as balance,
        MAX(CASE WHEN status NOT IN ('paid','completed') THEN EXTRACT(DAY FROM NOW() - invoice_date) ELSE 0 END)::int as overdue_days
      FROM income_documents
      ${whereClause} ${customerWhere} ${closingFilter}
      AND customer_name IS NOT NULL AND customer_name != ''
      GROUP BY customer_name, customer_id
      HAVING COALESCE(SUM(CASE WHEN status NOT IN ('paid','completed') THEN total_with_vat ELSE 0 END), 0) > 0
      ORDER BY balance DESC
    `);

    const totalDebt = debtors.reduce((s: number, d: any) => s + Number(d.balance || 0), 0);
    const overdue30 = debtors.filter((d: any) => Number(d.overdue_days) > 30).reduce((s: number, d: any) => s + Number(d.balance || 0), 0);
    const overdue90 = debtors.filter((d: any) => Number(d.overdue_days) > 90).reduce((s: number, d: any) => s + Number(d.balance || 0), 0);

    res.json({
      debtors,
      summary: {
        total_debt: totalDebt,
        debtor_count: debtors.length,
        overdue_30: overdue30,
        overdue_90: overdue90,
      }
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/finance/reports/operational-profit", async (req: Request, res: Response) => {
  try {
    const rawYear = parseInt(String(req.query.year || new Date().getFullYear()));
    const y = (isNaN(rawYear) || rawYear < 2000 || rawYear > 2100) ? new Date().getFullYear() : rawYear;
    const period = String(req.query.period || "monthly");
    const fromMonth = Math.max(1, Math.min(12, parseInt(String(req.query.from_month || "1")) || 1));
    const toMonth = Math.max(fromMonth, Math.min(12, parseInt(String(req.query.to_month || "12")) || 12));

    const step = period === "quarterly" ? 3 : period === "yearly" ? 12 : 1;
    const QUARTER_LABELS = ["Q1", "Q2", "Q3", "Q4"];

    const months = [];
    let totalIncome = 0;
    let totalExpenses = 0;

    for (let m = fromMonth; m <= toMonth; m += step) {
      const mEnd = Math.min(m + step, 13);
      const monthStart = `${y}-${String(m).padStart(2, "0")}-01`;
      const monthEnd = mEnd <= 12 ? `${y}-${String(mEnd).padStart(2, "0")}-01` : `${y + 1}-01-01`;

      const incResult = await safeQuery(`
        SELECT COALESCE(SUM(amount), 0) as income
        FROM income_documents 
        WHERE invoice_date >= '${monthStart}' AND invoice_date < '${monthEnd}' AND status != 'cancelled'
      `);
      const expResult = await safeQuery(`
        SELECT COALESCE(SUM(amount), 0) as expenses
        FROM expenses 
        WHERE expense_date >= '${monthStart}' AND expense_date < '${monthEnd}' AND status NOT IN ('cancelled', 'rejected')
      `);

      const inc = Number(incResult[0]?.income || 0);
      const exp = Number(expResult[0]?.expenses || 0);
      totalIncome += inc;
      totalExpenses += exp;

      months.push({
        month: m,
        label: period === "quarterly" ? QUARTER_LABELS[Math.floor((m - 1) / 3)] : period === "yearly" ? String(y) : undefined,
        income: inc,
        expenses: exp,
        profit: inc - exp,
      });
    }

    res.json({
      months,
      summary: {
        total_income: totalIncome,
        total_expenses: totalExpenses,
        total_profit: totalIncome - totalExpenses,
        profit_margin: totalIncome > 0 ? ((totalIncome - totalExpenses) / totalIncome * 100) : 0,
      },
      year: y,
      period,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
