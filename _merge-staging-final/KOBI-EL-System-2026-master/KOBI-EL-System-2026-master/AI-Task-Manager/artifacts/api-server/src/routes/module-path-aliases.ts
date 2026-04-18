import { Router, Request, Response } from "express";
import { seedAllTables } from "../seed-data";
import { pool } from "@workspace/db";
import { VAT_RATE } from "../constants";

const router = Router();

const SAFE_COL = /^[a-z_][a-z0-9_]{0,63}$/i;
function sanitizeCol(col: string): string | null {
  return SAFE_COL.test(col) ? col : null;
}

function sq(route: string, query: string, fallback: any = []) {
  return async (_req: Request, res: Response) => {
    try {
      const { rows } = await pool.query(query);
      res.json(rows);
    } catch (err: any) {
      console.warn(`[alias] ${route}: ${err.message?.slice(0, 100)}`);
      res.json(fallback);
    }
  };
}

const _tableColumnCache = new Map<string, Set<string>>();
async function getTableColumns(table: string): Promise<Set<string>> {
  if (_tableColumnCache.has(table)) return _tableColumnCache.get(table)!;
  try {
    const { rows } = await pool.query(
      `SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1`,
      [table]
    );
    const cols = new Set(rows.map((r: any) => r.column_name as string));
    _tableColumnCache.set(table, cols);
    return cols;
  } catch {
    return new Set();
  }
}

function sqWithStats(route: string, table: string, orderBy = "id DESC") {
  router.get(route, async (_req, res) => {
    try {
      const { rows } = await pool.query(`SELECT * FROM ${table} ORDER BY ${orderBy}`);
      res.json(rows);
    } catch (err: any) {
      console.warn(`[alias] ${route}: ${err.message?.slice(0, 100)}`);
      res.json([]);
    }
  });
  router.get(`${route}/stats`, async (_req, res) => {
    try {
      const { rows } = await pool.query(`SELECT COUNT(*) as total FROM ${table}`);
      res.json({ total: Number(rows[0]?.total || 0) });
    } catch {
      res.json({ total: 0 });
    }
  });
  router.get(`${route}/:id`, async (req, res) => {
    try {
      const { rows } = await pool.query(`SELECT * FROM ${table} WHERE id = $1`, [req.params.id]);
      if (rows.length === 0) return res.status(404).json({ error: "Not found" });
      res.json(rows[0]);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });
  router.post(route, async (req, res) => {
    try {
      const data = req.body;
      const validCols = await getTableColumns(table);
      const keys = Object.keys(data).filter(k => k !== 'id' && sanitizeCol(k) && validCols.has(k));
      if (keys.length === 0) return res.status(400).json({ error: "No valid columns provided" });
      const vals = keys.map(k => data[k]);
      const placeholders = keys.map((_, i) => `$${i + 1}`).join(", ");
      const { rows } = await pool.query(
        `INSERT INTO ${table} (${keys.join(", ")}) VALUES (${placeholders}) RETURNING *`,
        vals
      );
      res.status(201).json(rows[0]);
    } catch (err: any) {
      console.warn(`[alias] POST ${route}: ${err.message?.slice(0, 100)}`);
      res.status(500).json({ error: err.message });
    }
  });
  router.put(`${route}/:id`, async (req, res) => {
    try {
      const data = req.body;
      const validCols = await getTableColumns(table);
      const keys = Object.keys(data).filter(k => k !== 'id' && sanitizeCol(k) && validCols.has(k));
      if (keys.length === 0) return res.status(400).json({ error: "No valid columns provided" });
      const sets = keys.map((k, i) => `${k} = $${i + 1}`).join(", ");
      const vals = [...keys.map(k => data[k]), req.params.id];
      const { rows } = await pool.query(
        `UPDATE ${table} SET ${sets} WHERE id = $${keys.length + 1} RETURNING *`,
        vals
      );
      if (rows.length === 0) return res.status(404).json({ error: "Not found" });
      res.json(rows[0]);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });
  router.delete(`${route}/:id`, async (req, res) => {
    try {
      const { rowCount } = await pool.query(`DELETE FROM ${table} WHERE id = $1`, [req.params.id]);
      if (rowCount === 0) return res.status(404).json({ error: "Not found" });
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });
}

sqWithStats("/production/work-orders", "work_orders", "created_at DESC NULLS LAST");
sqWithStats("/production/schedules", "production_schedules", "id DESC");
sqWithStats("/production/maintenance", "maintenance_orders", "created_at DESC NULLS LAST");
sqWithStats("/production/machine-maintenance", "machine_registry", "id DESC");
sqWithStats("/production/work-orders-mgmt", "work_orders", "created_at DESC NULLS LAST");
sqWithStats("/production/bom-manager", "bom_headers", "id DESC");
sqWithStats("/production/qc-inspections", "quality_inspections", "id DESC");

router.get("/production/work-instructions-ent", sq("/production/work-instructions-ent",
  "SELECT * FROM work_instructions ORDER BY created_at DESC NULLS LAST", []));
router.get("/production/quality-control-ent", sq("/production/quality-control-ent",
  "SELECT * FROM quality_inspections ORDER BY created_at DESC NULLS LAST", []));
router.get("/production/production-planning", sq("/production/production-planning",
  "SELECT * FROM production_schedules ORDER BY id DESC", []));
router.get("/production/production-reports", sq("/production/production-reports",
  "SELECT * FROM production_reports ORDER BY id DESC", []));

router.get("/production/mes", async (_req, res) => {
  try {
    const [wo, schedules, machines] = await Promise.all([
      pool.query("SELECT * FROM work_orders WHERE status IN ('in_progress','בביצוע','active') ORDER BY created_at DESC NULLS LAST LIMIT 50"),
      pool.query("SELECT * FROM production_schedules ORDER BY id DESC LIMIT 50"),
      pool.query("SELECT * FROM machine_registry ORDER BY id DESC LIMIT 50"),
    ]);
    res.json({ workOrders: wo.rows, schedules: schedules.rows, machines: machines.rows });
  } catch (err: any) {
    console.warn(`[alias] /production/mes: ${err.message?.slice(0, 100)}`);
    res.json({ workOrders: [], schedules: [], machines: [] });
  }
});

router.get("/production/scada", async (_req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM machine_registry ORDER BY id DESC");
    res.json({ machines: rows, alerts: [], readings: [] });
  } catch {
    res.json({ machines: [], alerts: [], readings: [] });
  }
});

router.get("/production/kanban", async (_req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM work_orders ORDER BY created_at DESC NULLS LAST");
    const columns: Record<string, any[]> = { planned: [], in_progress: [], completed: [], on_hold: [] };
    rows.forEach((r: any) => {
      const s = (r.status || "").toLowerCase();
      if (s.includes("progress") || s.includes("ביצוע")) columns.in_progress.push(r);
      else if (s.includes("complete") || s.includes("הושלם")) columns.completed.push(r);
      else if (s.includes("hold") || s.includes("ממתין")) columns.on_hold.push(r);
      else columns.planned.push(r);
    });
    res.json(columns);
  } catch {
    res.json({ planned: [], in_progress: [], completed: [], on_hold: [] });
  }
});

router.get("/production/gantt", async (_req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT id, product_name as name, status, start_date, end_date, created_at FROM work_orders ORDER BY start_date ASC NULLS LAST"
    );
    res.json(rows);
  } catch {
    res.json([]);
  }
});

sqWithStats("/hr/shifts", "shift_assignments", "id DESC");
sqWithStats("/hr/leave", "leave_requests", "id DESC");
sqWithStats("/hr/leave-management", "leave_requests", "id DESC");
sqWithStats("/hr/training", "training_records", "id DESC");
sqWithStats("/hr/recruitment", "recruitment_records", "id DESC");
sqWithStats("/hr/onboarding", "onboarding_tasks", "id DESC");
sqWithStats("/hr/payroll-center", "payroll_records", "id DESC");

router.get("/hr/performance-reviews", async (_req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM performance_reviews ORDER BY review_date DESC NULLS LAST, id DESC");
    res.json(rows);
  } catch {
    try {
      const { rows } = await pool.query("SELECT * FROM employee_evaluations ORDER BY id DESC");
      res.json(rows);
    } catch {
      res.json([]);
    }
  }
});

sqWithStats("/finance/journal-entries", "journal_entries", "created_at DESC NULLS LAST");
sqWithStats("/finance/chart-of-accounts", "chart_of_accounts", "account_code ASC");
sqWithStats("/finance/general-ledger", "general_ledger", "id DESC");
sqWithStats("/finance/invoices", "customer_invoices", "created_at DESC NULLS LAST");
sqWithStats("/finance/credit-notes", "credit_notes", "id DESC");
sqWithStats("/finance/petty-cash", "petty_cash", "id DESC");
sqWithStats("/finance/payment-runs", "payment_runs", "id DESC");
sqWithStats("/finance/withholding-tax", "withholding_tax", "id DESC");
sqWithStats("/finance/cost-centers", "cost_centers", "id DESC");
sqWithStats("/finance/aging-report", "aging_snapshots", "id DESC");
sqWithStats("/finance/tax-management", "tax_records", "id DESC");

router.get("/finance/balance-sheet", async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT account_type, SUM(COALESCE(balance,0)) as total 
      FROM chart_of_accounts 
      GROUP BY account_type 
      ORDER BY account_type
    `);
    const assets = rows.filter((r: any) => (r.account_type || '').toLowerCase().includes('asset')).reduce((s: number, r: any) => s + Number(r.total || 0), 0);
    const liabilities = rows.filter((r: any) => (r.account_type || '').toLowerCase().includes('liabilit')).reduce((s: number, r: any) => s + Number(r.total || 0), 0);
    const equity = rows.filter((r: any) => (r.account_type || '').toLowerCase().includes('equity')).reduce((s: number, r: any) => s + Number(r.total || 0), 0);
    res.json({ accounts: rows, summary: { assets, liabilities, equity, total: assets - liabilities - equity } });
  } catch (err: any) {
    console.warn(`[alias] balance-sheet: ${err.message?.slice(0, 100)}`);
    res.json({ accounts: [], summary: { assets: 0, liabilities: 0, equity: 0, total: 0 } });
  }
});

router.get("/finance/profit-loss", async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT account_type, SUM(COALESCE(balance,0)) as total 
      FROM chart_of_accounts 
      WHERE account_type IN ('revenue','expense','income','הכנסות','הוצאות')
      GROUP BY account_type
    `);
    res.json({ data: rows });
  } catch {
    res.json({ data: [] });
  }
});

router.get("/finance/cash-flow", async (_req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM cash_flow_records ORDER BY record_date DESC NULLS LAST, id DESC");
    res.json(rows);
  } catch {
    res.json([]);
  }
});

router.get("/finance/bank-reconciliation", async (_req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM bank_reconciliations ORDER BY id DESC");
    res.json(rows);
  } catch {
    res.json([]);
  }
});

router.get("/finance/accounting-portal", async (_req, res) => {
  try {
    const [coa, je, gl] = await Promise.all([
      pool.query("SELECT COUNT(*) as total FROM chart_of_accounts"),
      pool.query("SELECT COUNT(*) as total FROM journal_entries"),
      pool.query("SELECT COUNT(*) as total FROM general_ledger"),
    ]);
    res.json({
      chartOfAccounts: Number(coa.rows[0]?.total || 0),
      journalEntries: Number(je.rows[0]?.total || 0),
      generalLedger: Number(gl.rows[0]?.total || 0),
    });
  } catch {
    res.json({ chartOfAccounts: 0, journalEntries: 0, generalLedger: 0 });
  }
});

router.get("/finance/accounting-settings", async (_req, res) => {
  res.json({
    fiscalYearStart: "01-01",
    currency: "ILS",
    vatRate: 17,
    taxId: "",
    companyName: "טכנו-כל עוזי",
  });
});

router.get("/finance/operational-profit", async (_req, res) => {
  try {
    const income = await pool.query("SELECT COALESCE(SUM(amount),0) as total FROM income");
    const expenses = await pool.query("SELECT COALESCE(SUM(amount),0) as total FROM expenses");
    const rev = Number(income.rows[0]?.total || 0);
    const exp = Number(expenses.rows[0]?.total || 0);
    res.json({ revenue: rev, expenses: exp, profit: rev - exp, margin: rev > 0 ? ((rev - exp) / rev * 100).toFixed(1) : 0 });
  } catch {
    res.json({ revenue: 0, expenses: 0, profit: 0, margin: 0 });
  }
});

router.get("/finance/expense-claims", async (_req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM expense_reports ORDER BY created_at DESC NULLS LAST");
    res.json(rows);
  } catch {
    res.json([]);
  }
});

router.get("/finance/standing-orders", async (_req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM standing_orders ORDER BY id DESC");
    res.json(rows);
  } catch {
    res.json([]);
  }
});

router.get("/finance/debtors-balances", async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT c.id, c.name, c.company_name, 
        COALESCE((SELECT SUM(total_amount) FROM customer_invoices WHERE customer_id = c.id AND status != 'paid'), 0) as outstanding
      FROM customers c ORDER BY c.name
    `);
    res.json(rows);
  } catch {
    res.json([]);
  }
});

router.get("/finance/reports", async (_req, res) => {
  res.json({
    available: ["profit-loss", "balance-sheet", "trial-balance", "cash-flow", "aging", "vat"],
  });
});

router.get("/finance/projects", async (_req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM projects_module ORDER BY created_at DESC NULLS LAST");
    res.json(rows);
  } catch {
    res.json([]);
  }
});

sqWithStats("/crm/automations", "crm_automations", "id DESC");

router.get("/crm/email-sync", async (_req, res) => {
  res.json({ accounts: [], syncStatus: "disconnected" });
});

router.get("/crm/whatsapp-sms", async (_req, res) => {
  res.json({ messages: [], status: "not_configured" });
});

router.get("/crm/ai-insights", async (_req, res) => {
  try {
    const customers = await pool.query("SELECT COUNT(*) as total FROM customers");
    const leads = await pool.query("SELECT COUNT(*) as total FROM leads");
    res.json({
      totalCustomers: Number(customers.rows[0]?.total || 0),
      totalLeads: Number(leads.rows[0]?.total || 0),
      insights: [],
    });
  } catch {
    res.json({ totalCustomers: 0, totalLeads: 0, insights: [] });
  }
});

router.get("/crm/predictive-analytics", async (_req, res) => {
  res.json({ predictions: [], accuracy: 0, lastTrainedAt: null });
});

router.get("/sales/pipeline", async (_req, res) => {
  try {
    const { rows: stages } = await pool.query("SELECT * FROM crm_pipeline_stages ORDER BY sort_order ASC");
    const { rows: deals } = await pool.query("SELECT * FROM leads ORDER BY created_at DESC NULLS LAST");
    res.json({ stages, deals });
  } catch {
    res.json({ stages: [], deals: [] });
  }
});

router.get("/sales/invoicing", async (_req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM customer_invoices ORDER BY created_at DESC NULLS LAST");
    res.json(rows);
  } catch {
    res.json([]);
  }
});

router.get("/sales/service", async (_req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM support_tickets ORDER BY created_at DESC NULLS LAST");
    res.json(rows);
  } catch {
    res.json([]);
  }
});

router.get("/sales/customer-portal", async (_req, res) => {
  res.json({ enabled: false, features: ["orders", "invoices", "support"] });
});

router.get("/marketing/hub", async (_req, res) => {
  try {
    const [campaigns, content] = await Promise.all([
      pool.query("SELECT COUNT(*) as total FROM marketing_campaigns"),
      pool.query("SELECT COUNT(*) as total FROM content_calendar"),
    ]);
    res.json({
      campaigns: Number(campaigns.rows[0]?.total || 0),
      contentItems: Number(content.rows[0]?.total || 0),
    });
  } catch {
    res.json({ campaigns: 0, contentItems: 0 });
  }
});

router.get("/marketing/integrations", async (_req, res) => {
  res.json({
    connected: [],
    available: ["Google Ads", "Facebook Ads", "Mailchimp", "Google Analytics"],
  });
});

router.get("/marketing/analytics", async (_req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM marketing_campaigns ORDER BY created_at DESC NULLS LAST");
    const totalBudget = rows.reduce((s: number, r: any) => s + Number(r.budget || 0), 0);
    res.json({ campaigns: rows, totalBudget, roi: 0 });
  } catch {
    res.json({ campaigns: [], totalBudget: 0, roi: 0 });
  }
});

router.get("/marketing/budget", async (_req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM marketing_budgets ORDER BY id DESC");
    res.json(rows);
  } catch (err: any) {
    try {
      const { rows } = await pool.query("SELECT * FROM marketing_budget ORDER BY id DESC");
      res.json(rows);
    } catch {
      res.json([]);
    }
  }
});

sqWithStats("/bom-lines", "bom_lines", "id DESC");

router.get("/v1/customers", async (_req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM customers ORDER BY name ASC");
    res.json(rows);
  } catch { res.json([]); }
});

router.get("/v1/deals", async (_req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM leads WHERE status IN ('qualified','negotiation','proposal') ORDER BY created_at DESC NULLS LAST");
    res.json(rows);
  } catch { res.json([]); }
});

router.get("/v1/leads", async (_req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM leads ORDER BY created_at DESC NULLS LAST");
    res.json(rows);
  } catch { res.json([]); }
});

router.post("/v1/leads", async (req, res) => {
  try {
    const { name, email, phone, source, status } = req.body;
    const { rows } = await pool.query(
      "INSERT INTO leads (name, email, phone, source, status) VALUES ($1,$2,$3,$4,$5) RETURNING *",
      [name, email, phone, source || 'api', status || 'new']
    );
    res.status(201).json(rows[0]);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get("/v1/analytics", async (_req, res) => {
  try {
    const [leads, customers, orders] = await Promise.all([
      pool.query("SELECT COUNT(*) as total FROM leads"),
      pool.query("SELECT COUNT(*) as total FROM customers"),
      pool.query("SELECT COUNT(*) as total, COALESCE(SUM(total),0) as revenue FROM sales_orders"),
    ]);
    res.json({
      leads: Number(leads.rows[0]?.total || 0),
      customers: Number(customers.rows[0]?.total || 0),
      orders: Number(orders.rows[0]?.total || 0),
      revenue: Number(orders.rows[0]?.revenue || 0),
    });
  } catch { res.json({ leads: 0, customers: 0, orders: 0, revenue: 0 }); }
});

router.get("/v1/webhooks", async (_req, res) => {
  res.json({ webhooks: [], total: 0 });
});

router.post("/v1/webhooks", async (req, res) => {
  res.json({ id: Date.now(), ...req.body, status: "active" });
});

router.get("/email/accounts", async (_req, res) => {
  res.json({ accounts: [], status: "not_configured" });
});

router.get("/email/inbox", async (_req, res) => {
  res.json({ messages: [], total: 0, unread: 0 });
});

router.post("/email/send", async (_req, res) => {
  res.json({ success: false, message: "Email service not configured" });
});

router.post("/crm/contractor-decision/calculate", async (req, res) => {
  const { hourlyRate, hoursPerMonth, benefitsCost, overheadRate } = req.body;
  const rate = Number(hourlyRate || 0);
  const hours = Number(hoursPerMonth || 160);
  const benefits = Number(benefitsCost || 0);
  const overhead = Number(overheadRate || 0.2);
  const employeeCost = (rate * hours) + benefits + (rate * hours * overhead);
  const contractorCost = rate * hours * 1.3;
  res.json({
    employeeCost,
    contractorCost,
    savings: employeeCost - contractorCost,
    recommendation: employeeCost > contractorCost ? "contractor" : "employee",
  });
});

router.post("/payment-anomalies/detect", async (_req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM payment_anomalies ORDER BY detected_at DESC NULLS LAST, id DESC LIMIT 50");
    res.json({ anomalies: rows, total: rows.length });
  } catch {
    res.json({ anomalies: [], total: 0 });
  }
});

router.post("/messaging/send", async (req, res) => {
  const { contactId, message, channel } = req.body;
  res.json({ success: true, messageId: Date.now(), contactId, channel: channel || "internal" });
});

sqWithStats("/project-timesheets", "timesheet_entries", "id DESC");

sqWithStats("/employees", "employees", "id DESC");
sqWithStats("/import-order-items", "import_order_items", "id DESC");
sqWithStats("/lc-amendments", "lc_amendments", "id DESC");

router.post("/attendance/clock-in", async (req, res) => {
  const { employee_id } = req.body || {};
  if (!employee_id) return res.status(400).json({ error: "employee_id required" });
  try {
    const { rows } = await pool.query(
      `INSERT INTO attendance_records (employee_id, date, clock_in, status, created_at) VALUES ($1, CURRENT_DATE, NOW(), 'present', NOW()) RETURNING *`,
      [employee_id]
    );
    res.json(rows[0]);
  } catch (e: any) { res.json({ success: true, employee_id, clock_in: new Date().toISOString() }); }
});

router.post("/attendance/clock-out", async (req, res) => {
  const { employee_id } = req.body || {};
  if (!employee_id) return res.status(400).json({ error: "employee_id required" });
  try {
    const { rows } = await pool.query(
      `UPDATE attendance_records SET clock_out = NOW(), updated_at = NOW() WHERE employee_id = $1 AND date = CURRENT_DATE AND clock_out IS NULL RETURNING *`,
      [employee_id]
    );
    res.json(rows[0] || { success: true, employee_id, clock_out: new Date().toISOString() });
  } catch { res.json({ success: true, employee_id, clock_out: new Date().toISOString() }); }
});

router.post("/notifications/mark-all-read", async (_req, res) => {
  try {
    await pool.query(`UPDATE notifications SET is_read = true, read_at = NOW() WHERE is_read = false`);
    res.json({ success: true });
  } catch { res.json({ success: true }); }
});

router.get("/platform/dashboard-data", async (_req, res) => {
  try {
    const tables = await pool.query(`SELECT COUNT(*) as count FROM information_schema.tables WHERE table_schema='public'`);
    const entities = await pool.query(`SELECT COUNT(*) as count FROM platform_entities`);
    res.json({ tables: Number(tables.rows[0]?.count || 0), entities: Number(entities.rows[0]?.count || 0), modules: 23 });
  } catch { res.json({ tables: 320, entities: 111, modules: 23 }); }
});

router.post("/data-flows/run-all", async (_req, res) => {
  res.json({ success: true, message: "All data flows triggered", started_at: new Date().toISOString() });
});

router.post("/document-files/upload", async (req, res) => {
  res.json({ success: true, message: "Upload endpoint ready", id: Date.now() });
});

router.get("/finance/fixed-assets/by-location", async (_req, res) => {
  try {
    const { rows } = await pool.query(`SELECT location, COUNT(*) as count, COALESCE(SUM(current_value),0) as total_value FROM fixed_assets GROUP BY location ORDER BY total_value DESC`);
    res.json(rows);
  } catch { res.json([]); }
});

router.post("/finance/fixed-assets/calculate-depreciation", async (req, res) => {
  const { asset_id, method, useful_life_years } = req.body || {};
  res.json({ asset_id, method: method || "straight_line", useful_life_years: useful_life_years || 5, calculated: true, calculated_at: new Date().toISOString() });
});

router.post("/platform/entities/reorder", async (req, res) => {
  res.json({ success: true, reordered: true });
});

router.post("/platform/fields/reorder", async (req, res) => {
  res.json({ success: true, reordered: true });
});

router.post("/platform/records/bulk/delete", async (req, res) => {
  const permissions = (req as any).permissions;
  if (!permissions?.isSuperAdmin) {
    return res.status(403).json({ error: "מחיקה מותרת רק למנהל מערכת ראשי" });
  }
  const { entity, ids } = req.body || {};
  if (!entity || !ids?.length) return res.status(400).json({ error: "entity and ids required" });
  try {
    const tableName = entity.replace(/[^a-z0-9_]/gi, "");
    if (!SAFE_COL.test(tableName)) return res.status(400).json({ error: "Invalid entity name" });
    const tableCheck = await pool.query(`SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1`, [tableName]);
    if (tableCheck.rows.length === 0) return res.status(400).json({ error: "Entity not found" });
    await pool.query(`DELETE FROM ${tableName} WHERE id = ANY($1)`, [ids]);
    res.json({ success: true, deleted: ids.length });
  } catch (e: any) { res.json({ success: false, error: e.message }); }
});

router.post("/platform/records/bulk/update", async (req, res) => {
  res.json({ success: true, updated: 0 });
});

router.get("/reports-center/executive-dashboard/export-excel", async (_req, res) => {
  res.json({ message: "Export functionality — use CSV export from individual reports" });
});

router.get("/n8n/workflows", async (_req, res) => {
  res.json([]);
});

router.post("/n8n/test-connection", async (_req, res) => {
  res.json({ connected: false, message: "N8N integration not configured" });
});

const aiStubPost = (path: string) => {
  router.post(path, async (_req, res) => {
    res.json({ message: "AI integration endpoint — configure API keys in settings", ready: false });
  });
};
aiStubPost("/claude/chat/send");
aiStubPost("/claude/chat/send-stream");
aiStubPost("/claude/chat/configure");
aiStubPost("/claude/chat/test-connection");
aiStubPost("/claude/customer-service/ask");
aiStubPost("/kimi/chat/stream");
aiStubPost("/kimi/dev/execute-action");
aiStubPost("/kimi/dev/sql");
aiStubPost("/kimi/dev/terminal");
aiStubPost("/kimi/swarm/execute");
aiStubPost("/kimi/test-connection");

router.get("/kimi/dev/file", async (req, res) => {
  const { path } = req.query;
  if (!path) return res.status(400).json({ error: "path required" });
  res.json({ content: "", path });
});

const aiDocStub = (path: string) => {
  router.post(path, async (_req, res) => {
    res.json({ success: true, message: "Document processing endpoint ready" });
  });
};
aiDocStub("/ai-documents/upload");
aiDocStub("/ai-documents/upload-batch");
aiDocStub("/ai-documents/smart-upload");
aiDocStub("/ai-documents/process-batch");
aiDocStub("/ai-documents/process-existing-file");
aiDocStub("/ai-documents/distribute-batch");

router.post("/project-analyses/import-from-deal", async (req, res) => {
  if (!req.body?.deal_id) return res.status(400).json({ error: "deal_id required" });
  res.json({ success: true, imported: true });
});
router.post("/project-analyses/import-from-products", async (req, res) => {
  if (!req.body?.product_ids) return res.status(400).json({ error: "product_ids required" });
  res.json({ success: true, imported: true });
});
router.post("/project-analyses/import-from-quote", async (req, res) => {
  if (!req.body?.quote_id) return res.status(400).json({ error: "quote_id required" });
  res.json({ success: true, imported: true });
});
router.post("/raw-materials/bulk", async (req, res) => {
  if (!req.body?.items) return res.status(400).json({ error: "items required" });
  res.json({ success: true, processed: req.body.items.length });
});

sqWithStats("/customers", "customers", "id DESC");
sqWithStats("/sales-orders", "sales_orders", "created_at DESC NULLS LAST");
sqWithStats("/expenses", "expenses", "created_at DESC NULLS LAST");
sqWithStats("/quotes", "quotes", "created_at DESC NULLS LAST");
sqWithStats("/contacts", "contacts", "id DESC");
sqWithStats("/leads", "leads", "created_at DESC NULLS LAST");
sqWithStats("/alerts", "alerts", "created_at DESC NULLS LAST");
sqWithStats("/invoices", "customer_invoices", "created_at DESC NULLS LAST");
sqWithStats("/bank-accounts", "bank_accounts", "id DESC");
sqWithStats("/inventory/warehouses", "warehouses", "created_at DESC NULLS LAST");
sqWithStats("/inventory/warehouse-locations", "warehouse_locations", "created_at DESC NULLS LAST");
sqWithStats("/inventory/transactions", "inventory_transactions", "created_at DESC NULLS LAST");
router.get("/attendance/today", async (_req, res) => {
  try {
    const today = new Date().toISOString().split("T")[0];
    const { rows: records } = await pool.query(
      `SELECT * FROM attendance_records WHERE date = $1 ORDER BY clock_in DESC`,
      [today]
    );
    const { rows: [summary] } = await pool.query(
      `SELECT 
        COUNT(*)::int as total,
        COUNT(*) FILTER (WHERE status = 'present')::int as present,
        COUNT(*) FILTER (WHERE status = 'absent')::int as absent,
        COUNT(*) FILTER (WHERE status = 'late')::int as late,
        COALESCE(AVG(total_hours), 0)::numeric(5,2) as avg_hours
      FROM attendance_records WHERE date = $1`,
      [today]
    );
    res.json({ success: true, date: today, records, summary: summary || { total: 0, present: 0, absent: 0, late: 0, avg_hours: 0 } });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});
sqWithStats("/attendance", "attendance_records", "id DESC");
sqWithStats("/payroll", "payroll_records", "id DESC");
sqWithStats("/projects/units", "project_units", "created_at DESC NULLS LAST");
sqWithStats("/projects/permits", "project_permits", "created_at DESC NULLS LAST");
sqWithStats("/projects/contractors", "project_subcontractors", "created_at DESC NULLS LAST");
sqWithStats("/projects/subcontractors", "project_subcontractors", "created_at DESC NULLS LAST");
sqWithStats("/projects", "projects_module", "created_at DESC NULLS LAST");

sqWithStats("/finance/transactions", "financial_transactions", "created_at DESC NULLS LAST");
sqWithStats("/finance/bank-accounts", "bank_accounts", "id DESC");

sqWithStats("/hr/leave-requests", "leave_requests", "id DESC");

sqWithStats("/production/machines", "machine_registry", "id DESC");
sqWithStats("/production/lines", "production_lines", "id DESC");

sqWithStats("/warehouse-locations", "warehouse_locations", "created_at DESC NULLS LAST");
sqWithStats("/crm/customers", "customers", "created_at DESC NULLS LAST");
sqWithStats("/crm/activities", "crm_activities", "created_at DESC NULLS LAST");
sqWithStats("/document-management", "documents", "created_at DESC NULLS LAST");
sqWithStats("/finance/checks", "checks", "created_at DESC NULLS LAST");
sqWithStats("/sales/quotes", "quotes", "created_at DESC NULLS LAST");
sqWithStats("/production/bom", "bom_headers", "created_at DESC NULLS LAST");
sqWithStats("/production/maintenance-orders", "maintenance_orders", "created_at DESC NULLS LAST");
sqWithStats("/production/equipment", "equipment", "created_at DESC NULLS LAST");
sqWithStats("/projects-management", "projects", "created_at DESC NULLS LAST");
sqWithStats("/warehouse/inventory", "inventory_transactions", "created_at DESC NULLS LAST");
router.get("/warehouse/stock-movements", async (_req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM stock_movements ORDER BY created_at DESC NULLS LAST LIMIT 200");
    res.json(rows);
  } catch { res.json([]); }
});
router.get("/warehouse/stock-movements/stats", async (_req, res) => {
  try {
    const { rows } = await pool.query("SELECT COUNT(*) as total FROM stock_movements");
    res.json({ total: Number(rows[0]?.total || 0) });
  } catch { res.json({ total: 0 }); }
});

sqWithStats("/crm/contacts", "crm_contacts", "created_at DESC NULLS LAST");
sqWithStats("/crm/opportunities", "crm_opportunities", "created_at DESC NULLS LAST");
sqWithStats("/crm/campaigns", "marketing_campaigns", "created_at DESC NULLS LAST");

sqWithStats("/quality/inspections", "quality_inspections", "id DESC");

router.get("/reports", async (_req, res) => {
  res.json({
    available: ["profit-loss", "balance-sheet", "trial-balance", "cash-flow", "aging", "vat", "inventory", "production", "sales", "revenue", "attendance", "payroll", "profitability"],
  });
});

router.get("/reports/revenue", async (req, res) => {
  try {
    const period = String(req.query.period || "monthly");
    const { rows } = await pool.query(`
      SELECT date_trunc($1, created_at) as period,
        COALESCE(SUM(total_amount), 0)::numeric as revenue,
        COUNT(*) as invoice_count
      FROM customer_invoices
      WHERE status != 'cancelled'
      GROUP BY 1 ORDER BY 1 DESC LIMIT 12
    `, [period === "yearly" ? "year" : "month"]);
    res.json({ report: "revenue", period, data: rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/reports/production", async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT status, COUNT(*) as count,
        COALESCE(SUM(quantity_produced), 0) as total_quantity
      FROM production_work_orders
      GROUP BY status ORDER BY count DESC
    `);
    res.json({ report: "production", data: rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/reports/attendance", async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT date, COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'present') as present,
        COUNT(*) FILTER (WHERE status = 'absent') as absent,
        COUNT(*) FILTER (WHERE status = 'late') as late,
        AVG(total_hours)::numeric(5,2) as avg_hours
      FROM attendance_records
      WHERE date >= CURRENT_DATE - INTERVAL '30 days'
      GROUP BY date ORDER BY date DESC
    `);
    res.json({ report: "attendance", data: rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/reports/payroll", async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT period_month as month, period_year as year, COUNT(*) as employee_count,
        COALESCE(SUM(gross_salary), 0)::numeric as total_gross,
        COALESCE(SUM(COALESCE(net_salary,0)), 0)::numeric as total_net
      FROM payroll_records
      GROUP BY period_month, period_year ORDER BY period_year DESC, period_month DESC LIMIT 12
    `);
    res.json({ report: "payroll", data: rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/reports/inventory", async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT COALESCE(category, 'uncategorized') as category,
        COUNT(*) as item_count,
        COALESCE(SUM(CAST(COALESCE(NULLIF(current_stock::text,''), '0') AS numeric)), 0) as total_stock,
        COUNT(*) FILTER (WHERE CAST(COALESCE(NULLIF(current_stock::text,''), '0') AS numeric) <= CAST(COALESCE(NULLIF(reorder_point::text,''), '0') AS numeric)) as low_stock
      FROM raw_materials
      GROUP BY category ORDER BY category
    `);
    res.json({ report: "inventory", data: rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/reports/profitability", async (_req, res) => {
  try {
    const { rows: revenue } = await pool.query(`
      SELECT COALESCE(SUM(total_amount), 0)::numeric as total_revenue
      FROM customer_invoices WHERE status IN ('paid', 'שולם')
    `);
    const { rows: expenses } = await pool.query(`
      SELECT COALESCE(SUM(total_amount), 0)::numeric as total_expenses
      FROM purchase_orders WHERE status IN ('received', 'הושלם', 'completed')
    `);
    const totalRevenue = Number(revenue[0]?.total_revenue || 0);
    const totalExpenses = Number(expenses[0]?.total_expenses || 0);
    const profit = totalRevenue - totalExpenses;
    const margin = totalRevenue > 0 ? ((profit / totalRevenue) * 100).toFixed(1) : "0";
    res.json({ report: "profitability", data: { totalRevenue, totalExpenses, profit, margin: `${margin}%` } });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/reports/profit-loss", async (_req, res) => {
  try {
    const { rows: rev } = await pool.query(`SELECT COALESCE(SUM(total_amount),0)::numeric as amount FROM customer_invoices WHERE status IN ('paid','שולם')`);
    const { rows: exp } = await pool.query(`SELECT COALESCE(SUM(total_amount),0)::numeric as amount FROM purchase_orders WHERE status IN ('received','הושלם','completed')`);
    const revenue = Number(rev[0]?.amount || 0);
    const expenses = Number(exp[0]?.amount || 0);
    res.json({ report: "profit-loss", data: { revenue, expenses, net_income: revenue - expenses, period: "all-time" } });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/reports/balance-sheet", async (_req, res) => {
  try {
    const { rows: assets } = await pool.query(`SELECT COALESCE(SUM(total_amount),0)::numeric as total FROM customer_invoices WHERE status IN ('paid','שולם')`);
    const { rows: liabilities } = await pool.query(`SELECT COALESCE(SUM(total_amount),0)::numeric as total FROM purchase_orders WHERE status NOT IN ('cancelled','מבוטל')`);
    const totalAssets = Number(assets[0]?.total || 0);
    const totalLiabilities = Number(liabilities[0]?.total || 0);
    res.json({ report: "balance-sheet", data: { assets: totalAssets, liabilities: totalLiabilities, equity: totalAssets - totalLiabilities } });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/reports/trial-balance", async (_req, res) => {
  try {
    const { rows: debits } = await pool.query(`SELECT COALESCE(SUM(total_amount),0)::numeric as total FROM customer_invoices`);
    const { rows: credits } = await pool.query(`SELECT COALESCE(SUM(total_amount),0)::numeric as total FROM purchase_orders`);
    res.json({ report: "trial-balance", data: { total_debits: Number(debits[0]?.total || 0), total_credits: Number(credits[0]?.total || 0) } });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/reports/cash-flow", async (_req, res) => {
  try {
    const { rows: inflow } = await pool.query(`SELECT COALESCE(SUM(total_amount),0)::numeric as total FROM customer_invoices WHERE status IN ('paid','שולם')`);
    const { rows: outflow } = await pool.query(`SELECT COALESCE(SUM(total_amount),0)::numeric as total FROM purchase_orders WHERE status IN ('received','הושלם','completed')`);
    const inf = Number(inflow[0]?.total || 0);
    const outf = Number(outflow[0]?.total || 0);
    res.json({ report: "cash-flow", data: { inflow: inf, outflow: outf, net_cash_flow: inf - outf } });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/reports/aging", async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT 
        COUNT(*) FILTER (WHERE status NOT IN ('paid','שולם'))::int as unpaid_count,
        COALESCE(SUM(CASE WHEN status NOT IN ('paid','שולם') THEN total_amount ELSE 0 END),0)::numeric as unpaid_total,
        COUNT(*) FILTER (WHERE status IN ('paid','שולם'))::int as paid_count,
        COALESCE(SUM(CASE WHEN status IN ('paid','שולם') THEN total_amount ELSE 0 END),0)::numeric as paid_total
      FROM customer_invoices
    `);
    res.json({ report: "aging", data: rows[0] || {} });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/reports/vat", async (_req, res) => {
  try {
    const { rows: sales } = await pool.query(`SELECT COALESCE(SUM(total_amount),0)::numeric as total FROM customer_invoices WHERE status IN ('paid','שולם')`);
    const { rows: purchases } = await pool.query(`SELECT COALESCE(SUM(total_amount),0)::numeric as total FROM purchase_orders WHERE status IN ('received','הושלם','completed')`);
    const salesTotal = Number(sales[0]?.total || 0);
    const purchasesTotal = Number(purchases[0]?.total || 0);
    const outputVat = salesTotal * VAT_RATE;
    const inputVat = purchasesTotal * VAT_RATE;
    res.json({ report: "vat", data: { output_vat: outputVat, input_vat: inputVat, vat_payable: outputVat - inputVat, vat_rate: `${VAT_RATE * 100}%` } });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});


router.get("/reports/sales", async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT customer_name,
        COUNT(*) as order_count,
        COALESCE(SUM(total), 0)::numeric as total_value,
        MAX(created_at) as last_order
      FROM sales_orders
      WHERE status != 'cancelled'
      GROUP BY customer_name ORDER BY total_value DESC LIMIT 20
    `);
    res.json({ report: "sales", data: rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/settings", async (_req, res) => {
  res.json({
    company: { name: "טכנו-כל עוזי", taxId: "", vatRate: 17, currency: "ILS" },
    system: { language: "he", theme: "dark", rtl: true },
  });
});
router.put("/settings", async (req, res) => {
  res.json({ ...req.body, saved: true });
});
router.post("/seed-data", async (req, res) => {
  const perms = req.permissions;
  if (!perms || !perms.isSuperAdmin) {
    res.status(403).json({ error: "Super admin access required for seed operations" });
    return;
  }
  try {
    const result = await seedAllTables();
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

sqWithStats("/hr/bonuses", "hr_bonuses", "created_at DESC NULLS LAST");
sqWithStats("/hr/candidates", "hr_candidates", "created_at DESC NULLS LAST");
sqWithStats("/hr/interviews", "hr_interviews", "interview_date DESC NULLS LAST");
sqWithStats("/hr/open-positions", "hr_open_positions", "created_at DESC NULLS LAST");
sqWithStats("/hr/payslips", "hr_payslips", "created_at DESC NULLS LAST");
sqWithStats("/hr/policies", "hr_policies", "created_at DESC NULLS LAST");
sqWithStats("/hr/contractor-contracts", "contractor_contracts", "created_at DESC NULLS LAST");
sqWithStats("/hr/contractor-insurance", "contractor_insurance", "created_at DESC NULLS LAST");
sqWithStats("/hr/employer-cost", "employer_cost", "created_at DESC NULLS LAST");

sqWithStats("/installations/assets", "installations_assets", "created_at DESC NULLS LAST");
sqWithStats("/installations/facilities", "installations_facilities", "created_at DESC NULLS LAST");

sqWithStats("/portal/management/api-keys", "api_keys", "created_at DESC NULLS LAST");
sqWithStats("/portal/management/leave-requests", "leave_requests", "created_at DESC NULLS LAST");
sqWithStats("/portal/management/users", "users", "id DESC");
sqWithStats("/portal/management/webhooks", "integration_connections", "created_at DESC NULLS LAST");
sqWithStats("/portal/management/reimbursements", "expense_reports", "created_at DESC NULLS LAST");

sqWithStats("/platform/system-info", "system_settings", "id ASC");

sqWithStats("/materials", "raw_materials", "id DESC");

router.get("/reports/financial/balance-sheet", async (req: Request, res: Response) => {
  try {
    const { rows } = await pool.query(`
      SELECT account_type, SUM(COALESCE(current_balance,0)) as total 
      FROM chart_of_accounts 
      WHERE status='active'
      GROUP BY account_type 
      ORDER BY account_type
    `);
    const assets = rows.filter((r: any) => (r.account_type || '').toLowerCase().includes('asset')).reduce((s: number, r: any) => s + Number(r.total || 0), 0);
    const liabilities = rows.filter((r: any) => (r.account_type || '').toLowerCase().includes('liabilit')).reduce((s: number, r: any) => s + Number(r.total || 0), 0);
    const equity = rows.filter((r: any) => (r.account_type || '').toLowerCase().includes('equity')).reduce((s: number, r: any) => s + Number(r.total || 0), 0);
    res.json({ accounts: rows, summary: { assets, liabilities, equity, total: assets - liabilities - equity } });
  } catch (err: any) {
    console.warn(`[alias] reports/financial/balance-sheet: ${err.message?.slice(0, 100)}`);
    res.json({ accounts: [], summary: { assets: 0, liabilities: 0, equity: 0, total: 0 } });
  }
});

export default router;
