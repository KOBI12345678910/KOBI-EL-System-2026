import { Router, type RequestHandler, type Request, type Response, type NextFunction } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { validateSession } from "../lib/auth";
import { checkEntityAccess, logPermissionDenied, resolveUserPermissions } from "../lib/permission-engine";
import { computePaymentComparison, extractComparisonInputFromData, VAT_MULTIPLIER } from "../lib/contractor-decision";

interface SessionUser {
  id: number;
  username: string;
  email?: string;
}

const router = Router();

const requireAuth: RequestHandler = async (req, res, next) => {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.substring(7) : null;
  if (!token) { res.status(401).json({ error: "נדרשת התחברות" }); return; }
  const result = await validateSession(token);
  if (result.error || !result.user) { res.status(401).json({ error: "הסשן פג תוקף" }); return; }
  const user = result.user as SessionUser;
  (req as Record<string, unknown>).user = user;
  req.userId = String(user.id || "");
  if (req.userId && (!req.permissions || !req.permissions.roles?.length)) {
    req.permissions = await resolveUserPermissions(req.userId);
  }
  next();
};

const entityIdCache = new Map<string, number>();

async function resolveEntityId(slug: string): Promise<number | null> {
  if (entityIdCache.has(slug)) return entityIdCache.get(slug)!;
  try {
    const rows = await db.execute(sql`SELECT id FROM module_entities WHERE slug = ${slug} LIMIT 1`);
    const id = Number((rows.rows as Array<{ id: number }>)?.[0]?.id);
    if (id) entityIdCache.set(slug, id);
    return id || null;
  } catch {
    return null;
  }
}

function requireEntityRead(entityId: number): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.permissions) {
      res.status(403).json({ error: "אין הרשאות זמינות" });
      return;
    }
    if (req.permissions.isSuperAdmin) {
      next();
      return;
    }
    if (!checkEntityAccess(req.permissions, entityId, "read")) {
      logPermissionDenied(req.userId || "", "crm_read", entityId);
      res.status(403).json({ error: "אין הרשאת גישה לנתונים אלו" });
      return;
    }
    next();
  };
}

function requireEntityReadBySlug(slug: string): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.permissions) {
      res.status(403).json({ error: "אין הרשאות זמינות" });
      return;
    }
    if (req.permissions.isSuperAdmin) {
      next();
      return;
    }
    const entityId = await resolveEntityId(slug);
    if (entityId && !checkEntityAccess(req.permissions, entityId, "read")) {
      logPermissionDenied(req.userId || "", "crm_read", entityId);
      res.status(403).json({ error: "אין הרשאת גישה לנתונים אלו" });
      return;
    }
    next();
  };
}

function requireEntityWrite(entityId: number): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.permissions) {
      res.status(403).json({ error: "אין הרשאות זמינות" });
      return;
    }
    if (req.permissions.isSuperAdmin) {
      next();
      return;
    }
    if (!checkEntityAccess(req.permissions, entityId, "update")) {
      logPermissionDenied(req.userId || "", "crm_write", entityId);
      res.status(403).json({ error: "אין הרשאת כתיבה לנתונים אלו" });
      return;
    }
    next();
  };
}

const requirePlatformAdmin: RequestHandler = (req, res, next) => {
  if (!req.permissions || (!req.permissions.isSuperAdmin && !req.permissions.builderAccess)) {
    res.status(403).json({ error: "נדרשת הרשאת מנהל מערכת" });
    return;
  }
  next();
};

router.use("/crm", requireAuth);

async function safeQuery(query: string) {
  try {
    const result = await db.execute(sql.raw(query));
    return result.rows || [];
  } catch (err: any) {
    console.error("CRM query error:", err.message);
    return [];
  }
}

async function requireMultiEntityRead(entityIds: number[], slugs: string[]): Promise<RequestHandler> {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.permissions) {
      res.status(403).json({ error: "אין הרשאות זמינות" });
      return;
    }
    if (req.permissions.isSuperAdmin) {
      next();
      return;
    }
    const allIds = [...entityIds];
    for (const slug of slugs) {
      const id = await resolveEntityId(slug);
      if (id) allIds.push(id);
    }
    for (const eid of allIds) {
      if (!checkEntityAccess(req.permissions, eid, "read")) {
        logPermissionDenied(req.userId || "", "crm_read", eid);
        res.status(403).json({ error: "אין הרשאת גישה לנתונים אלו" });
        return;
      }
    }
    next();
  };
}

router.get("/crm/dashboard", async (req: Request, res: Response, next: NextFunction) => {
  const handler = await requireMultiEntityRead([1, 26, 28], []);
  handler(req, res, next);
}, async (_req: Request, res: Response) => {
  try {
    const customersBySegment = await safeQuery(`
      SELECT 
        COALESCE(data->>'customer_segment', 'לא מסווג') as segment,
        COUNT(*) as count
      FROM entity_records WHERE entity_id = 1
      GROUP BY segment ORDER BY count DESC
    `);

    const customersByStatus = await safeQuery(`
      SELECT 
        COALESCE(status, 'draft') as status,
        COUNT(*) as count
      FROM entity_records WHERE entity_id = 1
      GROUP BY status ORDER BY count DESC
    `);

    const totalCustomers = await safeQuery(`
      SELECT COUNT(*) as total FROM entity_records WHERE entity_id = 1
    `);

    const recentCustomers = await safeQuery(`
      SELECT id, data, status, created_at 
      FROM entity_records WHERE entity_id = 1
      ORDER BY created_at DESC LIMIT 10
    `);

    const quotesStats = await safeQuery(`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'approved') as approved,
        COUNT(*) FILTER (WHERE status = 'pending') as pending,
        COUNT(*) FILTER (WHERE status = 'rejected') as rejected,
        COUNT(*) FILTER (WHERE status = 'draft') as draft,
        COALESCE(SUM((data->>'total_amount')::numeric), 0) as total_value,
        COALESCE(SUM((data->>'total_amount')::numeric) FILTER (WHERE status = 'approved'), 0) as approved_value
      FROM entity_records WHERE entity_id = 26
    `);

    const invoiceStats = await safeQuery(`
      SELECT 
        COUNT(*) as total,
        COALESCE(SUM((data->>'total_amount')::numeric), 0) as total_value,
        COALESCE(SUM((data->>'paid_amount')::numeric), 0) as paid_value,
        COUNT(*) FILTER (WHERE status = 'overdue') as overdue_count
      FROM entity_records WHERE entity_id = 28
    `);

    const conversionFunnel = await safeQuery(`
      SELECT 
        (SELECT COUNT(*) FROM entity_records WHERE entity_id = 1) as total_leads,
        (SELECT COUNT(*) FROM entity_records WHERE entity_id = 26) as total_quotes,
        (SELECT COUNT(*) FROM entity_records WHERE entity_id = 26 AND status = 'approved') as approved_quotes,
        (SELECT COUNT(*) FROM entity_records WHERE entity_id = 27) as total_orders,
        (SELECT COUNT(*) FROM entity_records WHERE entity_id = 28) as total_invoices
    `);

    const monthlyNewCustomers = await safeQuery(`
      SELECT 
        TO_CHAR(created_at, 'YYYY-MM') as month,
        COUNT(*) as count
      FROM entity_records WHERE entity_id = 1
        AND created_at >= CURRENT_DATE - INTERVAL '6 months'
      GROUP BY month ORDER BY month
    `);

    const topCustomersByValue = await safeQuery(`
      SELECT 
        r.id,
        r.data->>'name' as name,
        r.data->>'customer_segment' as segment,
        COALESCE((SELECT SUM((q.data->>'total_amount')::numeric) FROM entity_records q WHERE q.entity_id = 28 AND q.data->>'customer_id' = r.id::text), 0) as lifetime_value
      FROM entity_records r WHERE r.entity_id = 1
      ORDER BY lifetime_value DESC LIMIT 10
    `);

    res.json({
      totalCustomers: Number(totalCustomers[0]?.total || 0),
      customersBySegment,
      customersByStatus,
      recentCustomers,
      quotesStats: quotesStats[0] || {},
      invoiceStats: invoiceStats[0] || {},
      conversionFunnel: conversionFunnel[0] || {},
      monthlyNewCustomers,
      topCustomersByValue,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/crm/field-agents", requireEntityReadBySlug("field-agents"), async (_req: Request, res: Response) => {
  try {
    const agents = await safeQuery(`
      SELECT id, data, status, created_at, updated_at
      FROM entity_records WHERE entity_id = (
        SELECT id FROM module_entities WHERE slug = 'field-agents' LIMIT 1
      )
      ORDER BY created_at DESC
    `);

    const agentStats = await safeQuery(`
      SELECT 
        COUNT(*) as total_agents,
        COUNT(*) FILTER (WHERE status = 'active') as active_agents
      FROM entity_records WHERE entity_id = (
        SELECT id FROM module_entities WHERE slug = 'field-agents' LIMIT 1
      )
    `);

    res.json({
      agents,
      stats: agentStats[0] || { total_agents: 0, active_agents: 0 },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/crm/leads", requireEntityReadBySlug("leads"), async (_req: Request, res: Response) => {
  try {
    const leads = await safeQuery(`
      SELECT id, data, status, created_at, updated_at
      FROM entity_records WHERE entity_id = (
        SELECT id FROM module_entities WHERE slug = 'leads' LIMIT 1
      )
      ORDER BY created_at DESC
    `);

    const leadStats = await safeQuery(`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'new') as new_leads,
        COUNT(*) FILTER (WHERE status = 'contacted') as contacted,
        COUNT(*) FILTER (WHERE status = 'qualified') as qualified,
        COUNT(*) FILTER (WHERE status = 'converted') as converted,
        COUNT(*) FILTER (WHERE status = 'lost') as lost
      FROM entity_records WHERE entity_id = (
        SELECT id FROM module_entities WHERE slug = 'leads' LIMIT 1
      )
    `);

    res.json({
      leads,
      stats: leadStats[0] || {},
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/crm/alerts", requireEntityRead(1), async (req: Request, res: Response) => {
  try {
    const threshold = Number(req.query.threshold) || 20;
    const alerts: Array<{ type: string; severity: string; message: string; value: number }> = [];

    const leadConversion = await safeQuery(`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'converted') as converted
      FROM entity_records WHERE entity_id = (
        SELECT id FROM module_entities WHERE slug = 'leads' LIMIT 1
      )
    `);
    const total = Number(leadConversion[0]?.total || 0);
    const converted = Number(leadConversion[0]?.converted || 0);
    const convRate = total > 5 ? Math.round((converted / total) * 100) : 100;
    if (convRate < threshold) {
      alerts.push({
        type: "lead_conversion",
        severity: "warning",
        message: `שיעור המרת לידים (${convRate}%) מתחת לסף ההתראה (${threshold}%)`,
        value: convRate,
      });
    }

    const agentPerformance = await safeQuery(`
      SELECT 
        data->>'name' as agent_name,
        COALESCE((data->>'deals_closed')::numeric, 0) as deals_closed,
        COALESCE((data->>'total_visits')::numeric, 0) as total_visits,
        COALESCE((data->>'quotes_generated')::numeric, 0) as quotes_generated
      FROM entity_records WHERE entity_id = (
        SELECT id FROM module_entities WHERE slug = 'field-agents' LIMIT 1
      ) AND status = 'active'
    `);
    for (const agent of agentPerformance) {
      const visits = Number(agent.total_visits || 0);
      const closed = Number(agent.deals_closed || 0);
      if (visits > 5) {
        const agentRate = Math.round((closed / visits) * 100);
        if (agentRate < threshold) {
          alerts.push({
            type: "agent_conversion",
            severity: agentRate < threshold / 2 ? "critical" : "warning",
            message: `סוכן ${agent.agent_name || "לא ידוע"}: המרה ${agentRate}% (${closed} עסקאות מתוך ${visits} ביקורים, מתחת לסף ${threshold}%)`,
            value: agentRate,
          });
        }
      }
    }

    const overdueInvoices = await safeQuery(`
      SELECT COUNT(*) as count, COALESCE(SUM(balance_due), 0) as total_due
      FROM accounts_receivable
      WHERE status IN ('open','partial','overdue') AND due_date < CURRENT_DATE - 30
    `);
    const overdueCount = Number(overdueInvoices[0]?.count || 0);
    if (overdueCount > 0) {
      alerts.push({
        type: "overdue_collections",
        severity: overdueCount > 10 ? "critical" : "warning",
        message: `${overdueCount} חשבוניות באיחור מעל 30 יום (סה"כ ₪${Number(overdueInvoices[0]?.total_due || 0).toLocaleString()})`,
        value: overdueCount,
      });
    }

    res.json({ alerts, threshold });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "שגיאה לא ידועה";
    res.status(500).json({ error: message });
  }
});

router.get("/crm/pricing/dashboard", requireEntityReadBySlug("price-lists"), async (_req: Request, res: Response) => {
  try {
    const priceLists = await safeQuery(`
      SELECT id, data, status, created_at
      FROM entity_records WHERE entity_id = (
        SELECT id FROM module_entities WHERE slug = 'price-lists' LIMIT 1
      )
      ORDER BY created_at DESC
    `);

    const rawMaterialsCost = await safeQuery(`
      SELECT 
        COUNT(*) as total_materials,
        COALESCE(AVG((data->>'unit_price')::numeric), 0) as avg_price,
        COALESCE(SUM((data->>'unit_price')::numeric * (data->>'quantity')::numeric), 0) as total_value
      FROM entity_records WHERE entity_id = 5
    `);

    const marginAnalysis = await safeQuery(`
      SELECT 
        COALESCE(data->>'category', 'כללי') as category,
        COALESCE(AVG((data->>'margin_percent')::numeric), 0) as avg_margin,
        COUNT(*) as items
      FROM entity_records WHERE entity_id = (
        SELECT id FROM module_entities WHERE slug = 'price-lists' LIMIT 1
      )
      GROUP BY category
    `);

    res.json({
      priceLists,
      rawMaterialsCost: rawMaterialsCost[0] || {},
      marginAnalysis,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/crm/collections/dashboard", async (req: Request, res: Response, next: NextFunction) => {
  const handler = await requireMultiEntityRead([1], ["collection-actions"]);
  handler(req, res, next);
}, async (_req: Request, res: Response) => {
  try {
    const riskDistribution = await safeQuery(`
      SELECT 
        COALESCE(data->>'risk_level', 'medium') as risk_level,
        COUNT(*) as count,
        COALESCE(SUM((data->>'outstanding_balance')::numeric), 0) as total_balance
      FROM entity_records WHERE entity_id = 1
      GROUP BY risk_level
    `);

    const agingAnalysis = await safeQuery(`
      SELECT 
        COALESCE(SUM(balance_due) FILTER (WHERE due_date >= CURRENT_DATE), 0) as current_amount,
        COALESCE(SUM(balance_due) FILTER (WHERE due_date < CURRENT_DATE AND due_date >= CURRENT_DATE - 30), 0) as days_1_30,
        COALESCE(SUM(balance_due) FILTER (WHERE due_date < CURRENT_DATE - 30 AND due_date >= CURRENT_DATE - 60), 0) as days_31_60,
        COALESCE(SUM(balance_due) FILTER (WHERE due_date < CURRENT_DATE - 60 AND due_date >= CURRENT_DATE - 90), 0) as days_61_90,
        COALESCE(SUM(balance_due) FILTER (WHERE due_date < CURRENT_DATE - 90), 0) as over_90
      FROM accounts_receivable WHERE status IN ('open','partial','overdue')
    `);

    const overdueCustomers = await safeQuery(`
      SELECT 
        customer_name as name,
        COUNT(*) as invoice_count,
        SUM(balance_due) as total_due,
        MIN(due_date) as oldest_due
      FROM accounts_receivable 
      WHERE status IN ('open','partial','overdue') AND due_date < CURRENT_DATE
      GROUP BY customer_name
      ORDER BY total_due DESC LIMIT 20
    `);

    const collectionActions = await safeQuery(`
      SELECT id, data, status, created_at
      FROM entity_records WHERE entity_id = (
        SELECT id FROM module_entities WHERE slug = 'collection-actions' LIMIT 1
      )
      ORDER BY created_at DESC LIMIT 20
    `);

    const totalOutstanding = await safeQuery(`
      SELECT 
        COALESCE(SUM(balance_due), 0) as total
      FROM accounts_receivable WHERE status IN ('open','partial','overdue')
    `);

    res.json({
      riskDistribution,
      agingAnalysis: agingAnalysis[0] || {},
      overdueCustomers,
      collectionActions,
      totalOutstanding: Number(totalOutstanding[0]?.total || 0),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/crm/profitability/daily", requireEntityRead(28), async (_req: Request, res: Response) => {
  try {
    const dailyRevenue = await safeQuery(`
      SELECT 
        TO_CHAR(created_at, 'YYYY-MM-DD') as date,
        COALESCE(SUM((data->>'total_amount')::numeric), 0) as revenue
      FROM entity_records 
      WHERE entity_id = 28 AND created_at >= CURRENT_DATE - INTERVAL '30 days'
      GROUP BY date ORDER BY date
    `);

    const dailyCosts = await safeQuery(`
      SELECT 
        TO_CHAR(expense_date, 'YYYY-MM-DD') as date,
        COALESCE(SUM(amount), 0) as cost
      FROM expenses 
      WHERE status NOT IN ('cancelled','rejected') AND expense_date >= CURRENT_DATE - INTERVAL '30 days'
      GROUP BY date ORDER BY date
    `);

    const arRevenue = await safeQuery(`
      SELECT 
        COALESCE(SUM(paid_amount), 0) as total_collected,
        COALESCE(SUM(amount), 0) as total_invoiced
      FROM accounts_receivable 
      WHERE invoice_date >= CURRENT_DATE - INTERVAL '30 days'
    `);

    const totalExpenses30 = await safeQuery(`
      SELECT COALESCE(SUM(amount), 0) as total
      FROM expenses 
      WHERE status NOT IN ('cancelled','rejected') AND expense_date >= CURRENT_DATE - INTERVAL '30 days'
    `);

    const todayRevenue = await safeQuery(`
      SELECT COALESCE(SUM((data->>'total_amount')::numeric), 0) as revenue
      FROM entity_records 
      WHERE entity_id = 28 AND DATE(created_at) = CURRENT_DATE
    `);

    const todayCosts = await safeQuery(`
      SELECT COALESCE(SUM(amount), 0) as cost
      FROM expenses 
      WHERE status NOT IN ('cancelled','rejected') AND expense_date = CURRENT_DATE
    `);

    const monthlyTrend = await safeQuery(`
      SELECT 
        TO_CHAR(m.month_start, 'YYYY-MM') as month,
        COALESCE(r.revenue, 0) as revenue,
        COALESCE(e.cost, 0) as cost
      FROM (
        SELECT generate_series(
          date_trunc('month', CURRENT_DATE - INTERVAL '5 months'),
          date_trunc('month', CURRENT_DATE),
          '1 month'
        ) as month_start
      ) m
      LEFT JOIN (
        SELECT date_trunc('month', created_at) as month_start, 
          SUM((data->>'total_amount')::numeric) as revenue
        FROM entity_records WHERE entity_id = 28 
          AND created_at >= CURRENT_DATE - INTERVAL '6 months'
        GROUP BY month_start
      ) r ON m.month_start = r.month_start
      LEFT JOIN (
        SELECT date_trunc('month', expense_date) as month_start,
          SUM(amount) as cost
        FROM expenses WHERE status NOT IN ('cancelled','rejected')
          AND expense_date >= CURRENT_DATE - INTERVAL '6 months'
        GROUP BY month_start
      ) e ON m.month_start = e.month_start
      ORDER BY month
    `);

    const revenue30 = Number(arRevenue[0]?.total_collected || 0);
    const costs30 = Number(totalExpenses30[0]?.total || 0);
    const todayRev = Number(todayRevenue[0]?.revenue || 0);
    const todayCst = Number(todayCosts[0]?.cost || 0);

    res.json({
      today: {
        revenue: todayRev,
        cost: todayCst,
        profit: todayRev - todayCst,
        margin: todayRev > 0 ? Math.round(((todayRev - todayCst) / todayRev) * 1000) / 10 : 0,
      },
      last30Days: {
        revenue: revenue30,
        costs: costs30,
        profit: revenue30 - costs30,
        margin: revenue30 > 0 ? Math.round(((revenue30 - costs30) / revenue30) * 1000) / 10 : 0,
      },
      dailyRevenue,
      dailyCosts,
      monthlyTrend,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/crm/contractor-decision/calculate", requireEntityRead(26), async (req: Request, res: Response) => {
  try {
    const invoiceAmount = Number(req.body.invoiceAmount);
    const squareMeters = Number(req.body.squareMeters);
    const ratePerSqm = Number(req.body.ratePerSqm);
    const contractorPercent = Number(req.body.contractorPercent);

    if (!Number.isFinite(invoiceAmount) || invoiceAmount <= 0) {
      res.status(400).json({ error: "סכום חשבונית חייב להיות מספר חיובי" });
      return;
    }
    if (!Number.isFinite(squareMeters) || squareMeters <= 0) {
      res.status(400).json({ error: "שטח מ\"ר חייב להיות מספר חיובי" });
      return;
    }
    if (!Number.isFinite(ratePerSqm) || ratePerSqm <= 0) {
      res.status(400).json({ error: "תעריף למ\"ר חייב להיות מספר חיובי" });
      return;
    }
    if (!Number.isFinite(contractorPercent) || contractorPercent <= 0 || contractorPercent > 100) {
      res.status(400).json({ error: "אחוז קבלן חייב להיות מספר בין 0 ל-100" });
      return;
    }
    const result = computePaymentComparison({ invoiceAmount, squareMeters, ratePerSqm, contractorPercent });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/crm/contractor-decision/quotes", requireEntityRead(26), async (_req: Request, res: Response) => {
  try {
    const quotes = await safeQuery(`
      SELECT id, data, status, created_at, updated_at
      FROM entity_records WHERE entity_id = 26
      ORDER BY created_at DESC LIMIT 100
    `);

    const results = quotes.map((q: any) => {
      const d = typeof q.data === "string" ? JSON.parse(q.data) : (q.data || {});
      const base = {
        id: q.id,
        status: q.status,
        createdAt: q.created_at,
        customerName: d.customer_name || d.name || "",
        projectName: d.project_name || d.description || "",
      };
      const input = extractComparisonInputFromData(d);
      if (input) {
        return { ...base, ...computePaymentComparison(input) };
      }
      const invoiceAmount = Number(d.total_amount || d.amount || 0);
      return {
        ...base,
        invoiceAmount,
        amountExVat: invoiceAmount > 0 ? Math.round((invoiceAmount / VAT_MULTIPLIER) * 100) / 100 : 0,
        squareMeters: 0, ratePerSqm: 0, contractorPercent: 0,
        costByPercent: 0, costBySqm: 0, difference: 0,
        recommendation: "equal" as const, savings: 0,
      };
    });

    res.json({ quotes: results });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/crm/contractor-decision/deals", requireEntityRead(28), async (_req: Request, res: Response) => {
  try {
    const deals = await safeQuery(`
      SELECT id, data, status, created_at, updated_at
      FROM entity_records WHERE entity_id = 28
      ORDER BY created_at DESC LIMIT 100
    `);

    const results = deals.map((q: any) => {
      const d = typeof q.data === "string" ? JSON.parse(q.data) : (q.data || {});
      const chosenMethod = d.payment_method_chosen || d.contractor_payment_method || d.contractor_decision_chosen_method || null;
      const base = {
        id: q.id,
        status: q.status,
        createdAt: q.created_at,
        customerName: d.customer_name || d.name || "",
        projectName: d.project_name || d.description || "",
        chosenMethod,
      };
      const input = extractComparisonInputFromData(d);
      if (input) {
        return { ...base, ...computePaymentComparison(input) };
      }
      const invoiceAmount = Number(d.total_amount || d.amount || 0);
      return {
        ...base,
        invoiceAmount,
        amountExVat: invoiceAmount > 0 ? Math.round((invoiceAmount / VAT_MULTIPLIER) * 100) / 100 : 0,
        squareMeters: 0, ratePerSqm: 0, contractorPercent: 0,
        costByPercent: 0, costBySqm: 0, difference: 0,
        recommendation: "equal" as const, savings: 0,
      };
    });

    res.json({ deals: results });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/crm/leads/scored", requireEntityReadBySlug("leads"), async (_req: Request, res: Response) => {
  try {
    const leads = await safeQuery(`
      SELECT id, data, status, created_at, updated_at
      FROM entity_records WHERE entity_id = (
        SELECT id FROM module_entities WHERE slug = 'leads' LIMIT 1
      )
      ORDER BY created_at DESC LIMIT 200
    `);

    const SOURCE_WEIGHTS: Record<string, number> = {
      "הפניה": 30, "referral": 30, "אתר": 25, "website": 25,
      "לינקדאין": 22, "linkedin": 22, "תערוכה": 20, "exhibition": 20,
      "גוגל": 15, "google": 15, "פייסבוק": 12, "facebook": 12,
      "טלפון": 10, "phone": 10, "דוא\"ל": 8, "email": 8,
    };

    const scored = leads.map((r: any) => {
      const d = typeof r.data === "string" ? JSON.parse(r.data) : (r.data || {});
      const source = d.source || d.lead_source || "";
      const budget = Number(d.budget || d.value || d.estimated_value || 0);
      const activity = Number(d.activity_score || d.interactions || d.meetings_count || 0);
      const sourceScore = SOURCE_WEIGHTS[source] ?? 5;
      const budgetScore = budget >= 100000 ? 25 : budget >= 50000 ? 20 : budget >= 20000 ? 12 : budget >= 5000 ? 7 : 3;
      const activityScore = Math.min(activity * 3, 25);
      const socialScore = Number(d.social_score || d.linkedin_score || 0) || 0;
      const rawScore = sourceScore + budgetScore + activityScore + socialScore;
      const score = Math.min(Math.max(rawScore, 5), 100);
      const category = score >= 80 ? "hot" : score >= 60 ? "warm" : "cold";
      const potential = score >= 80 ? "גבוה" : score >= 60 ? "בינוני" : "נמוך";
      return {
        id: r.id,
        name: d.name || d.contact_name || d.customer_name || "ליד לא ידוע",
        company: d.company || d.company_name || "",
        phone: d.phone || d.mobile || "",
        source,
        budget,
        status: r.status || "new",
        activity: Math.min(activity, 10),
        social: socialScore,
        score,
        category,
        potential,
        lastContact: d.last_contact || (r.updated_at ? new Date(r.updated_at).toISOString().split("T")[0] : ""),
        value: budget,
        signals: d.signals || [],
      };
    });

    const hotCount = scored.filter((l: any) => l.category === "hot").length;
    const warmCount = scored.filter((l: any) => l.category === "warm").length;
    const coldCount = scored.filter((l: any) => l.category === "cold").length;
    const avgScore = scored.length > 0 ? Math.round(scored.reduce((a: number, b: any) => a + b.score, 0) / scored.length) : 0;

    const scoreDist = [
      { range: "80-100", count: scored.filter((l: any) => l.score >= 80).length, color: "#ef4444" },
      { range: "60-79", count: scored.filter((l: any) => l.score >= 60 && l.score < 80).length, color: "#f97316" },
      { range: "0-59", count: scored.filter((l: any) => l.score < 60).length, color: "#3b82f6" },
    ];

    res.json({ leads: scored, hotCount, warmCount, coldCount, avgScore, scoreDist });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/crm/analytics/monthly", requireEntityRead(1), async (req: Request, res: Response) => {
  try {
    const perms = req.permissions!;
    const leadsRow = await safeQuery(`SELECT id FROM module_entities WHERE slug = 'leads' LIMIT 1`);
    const leadsEntityId: number | null = leadsRow[0]?.id != null ? Number(leadsRow[0].id) : null;
    const canReadLeads = leadsEntityId && (perms.isSuperAdmin || checkEntityAccess(perms, leadsEntityId, "read"));
    const canReadRevenue = perms.isSuperAdmin || checkEntityAccess(perms, 28, "read");
    const canReadDeals = perms.isSuperAdmin || checkEntityAccess(perms, 27, "read");

    const monthlyLeads = canReadLeads ? await safeQuery(`
      SELECT 
        TO_CHAR(date_trunc('month', created_at), 'YYYY-MM') as month,
        COUNT(*) as leads
      FROM entity_records WHERE entity_id = ${leadsEntityId}
      AND created_at >= CURRENT_DATE - INTERVAL '8 months'
      GROUP BY month ORDER BY month
    `) : [];

    const monthlyRevenue = canReadRevenue ? await safeQuery(`
      SELECT 
        TO_CHAR(date_trunc('month', created_at), 'YYYY-MM') as month,
        COALESCE(SUM((data->>'total_amount')::numeric), 0) as revenue
      FROM entity_records WHERE entity_id = 28
      AND created_at >= CURRENT_DATE - INTERVAL '8 months'
      GROUP BY month ORDER BY month
    `) : [];

    const monthlyDeals = canReadDeals ? await safeQuery(`
      SELECT 
        TO_CHAR(date_trunc('month', created_at), 'YYYY-MM') as month,
        COUNT(*) as deals
      FROM entity_records WHERE entity_id = 27
      AND created_at >= CURRENT_DATE - INTERVAL '8 months'
      GROUP BY month ORDER BY month
    `) : [];

    const leadStats = canReadLeads ? await safeQuery(`
      SELECT 
        COUNT(*) as total_leads,
        COUNT(*) FILTER (WHERE status = 'new' OR status = 'contacted') as active_leads
      FROM entity_records WHERE entity_id = ${leadsEntityId}
    `) : [];

    const revenueStats = canReadRevenue ? await safeQuery(`
      SELECT 
        COALESCE(SUM((data->>'total_amount')::numeric), 0) as total_revenue,
        COALESCE(SUM((data->>'total_amount')::numeric) FILTER (
          WHERE created_at >= date_trunc('month', CURRENT_DATE)
        ), 0) as this_month_revenue,
        COALESCE(SUM((data->>'total_amount')::numeric) FILTER (
          WHERE created_at >= date_trunc('month', CURRENT_DATE) - INTERVAL '1 month'
          AND created_at < date_trunc('month', CURRENT_DATE)
        ), 0) as last_month_revenue
      FROM entity_records WHERE entity_id = 28
    `) : [];

    res.json({
      monthlyLeads,
      monthlyRevenue,
      monthlyDeals,
      leadStats: leadStats[0] || {},
      revenueStats: revenueStats[0] || {},
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/crm/activity-feed", requireEntityRead(1), async (req: Request, res: Response) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 50);
    const perms = req.permissions!;
    let entityFilter = "";
    if (!perms.isSuperAdmin) {
      const accessibleEntityIds = Object.entries(perms.entities || {})
        .filter(([, v]: [string, any]) => v?.read)
        .map(([k]) => Number(k))
        .filter(n => !isNaN(n));
      if (accessibleEntityIds.length === 0) {
        res.json({ feed: [] });
        return;
      }
      entityFilter = `AND ral.entity_id IN (${accessibleEntityIds.join(",")})`;
    }
    const auditLogs = await safeQuery(`
      SELECT 
        ral.id,
        ral.action,
        ral.entity_id,
        ral.record_id,
        ral.performed_by,
        ral.created_at,
        ral.changes,
        u.username as performer_name,
        me.name as entity_name
      FROM record_audit_log ral
      LEFT JOIN users u ON u.id::text = ral.performed_by
      LEFT JOIN module_entities me ON me.id = ral.entity_id
      WHERE 1=1 ${entityFilter}
      ORDER BY ral.created_at DESC
      LIMIT ${limit}
    `);

    const feed = auditLogs.map((log: any) => ({
      id: log.id,
      type: log.action || "update",
      msg: buildFeedMessage(log),
      time: log.created_at,
      entityName: log.entity_name || "",
      performedBy: log.performer_name || log.performed_by || "משתמש",
    }));

    res.json({ feed });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

function buildFeedMessage(log: any): string {
  const performer = log.performer_name || log.performed_by || "משתמש";
  const entity = log.entity_name || "רשומה";
  const action = log.action || "update";
  if (action === "create") return `${performer} יצר ${entity} חדש`;
  if (action === "delete") return `${performer} מחק ${entity}`;
  if (action === "update") return `${performer} עדכן ${entity}`;
  if (action === "status_change") {
    const changes = typeof log.changes === "string" ? JSON.parse(log.changes || "{}") : (log.changes || {});
    return `${performer} שינה סטטוס ${entity} ל-${changes.new_status || ""}`;
  }
  return `${performer} פעל על ${entity}`;
}

router.get("/crm/collaboration/notes", requireEntityRead(1), async (_req: Request, res: Response) => {
  try {
    const notes = await safeQuery(`
      SELECT 
        id, content, author, entity_type, entity_id, 
        created_at, updated_at, is_pinned,
        mentions
      FROM collaboration_notes
      ORDER BY is_pinned DESC, created_at DESC
      LIMIT 50
    `);
    res.json({ notes });
  } catch (_err: any) {
    res.json({ notes: [] });
  }
});

router.post("/crm/collaboration/notes", requireEntityWrite(1), async (req: Request, res: Response) => {
  try {
    const { content, entity_type, entity_id, mentions } = req.body;
    const username = (req as any).user?.username || "משתמש";
    const safeContent = String(content || "");
    const safeEntityType = String(entity_type || "כללי");
    const safeEntityId = entity_id ? String(entity_id) : null;
    const safeMentions = JSON.stringify(Array.isArray(mentions) ? mentions : []);
    await db.execute(
      sql`INSERT INTO collaboration_notes (content, author, entity_type, entity_id, mentions, created_at, updated_at, is_pinned)
          VALUES (${safeContent}, ${username}, ${safeEntityType}, ${safeEntityId}, ${safeMentions}, NOW(), NOW(), false)`
    );
    res.json({ ok: true });
  } catch (_err: any) {
    res.json({ ok: false });
  }
});

router.get("/crm/collaboration/tasks", requireEntityRead(1), async (_req: Request, res: Response) => {
  try {
    const tasks = await safeQuery(`
      SELECT id, title, assignee, due_date, priority, is_done, entity_type, entity_ref, created_at
      FROM collaboration_tasks
      ORDER BY is_done ASC, created_at DESC
      LIMIT 100
    `);
    res.json({ tasks });
  } catch (_err: any) {
    res.json({ tasks: [] });
  }
});

router.post("/crm/collaboration/tasks", requireEntityWrite(1), async (req: Request, res: Response) => {
  try {
    const { title, assignee, due_date, priority, entity_type, entity_ref } = req.body;
    const safeTitle = String(title || "");
    const safeAssignee = String(assignee || "");
    const safeDueDate = due_date ? String(due_date) : null;
    const safePriority = ["urgent", "high", "medium", "low"].includes(priority) ? priority : "medium";
    const safeEntityType = String(entity_type || "כללי");
    const safeEntityRef = String(entity_ref || "");
    await db.execute(
      sql`INSERT INTO collaboration_tasks (title, assignee, due_date, priority, entity_type, entity_ref, is_done, created_at)
          VALUES (${safeTitle}, ${safeAssignee}, ${safeDueDate}, ${safePriority}, ${safeEntityType}, ${safeEntityRef}, false, NOW())`
    );
    res.json({ ok: true });
  } catch (_err: any) {
    res.json({ ok: false });
  }
});

router.patch("/crm/collaboration/tasks/:id/toggle", requireEntityWrite(1), async (req: Request, res: Response) => {
  try {
    const taskId = Number(req.params.id);
    if (!taskId || taskId <= 0) { res.status(400).json({ error: "Invalid task ID" }); return; }
    await db.execute(sql`UPDATE collaboration_tasks SET is_done = NOT is_done WHERE id = ${taskId}`);
    res.json({ ok: true });
  } catch (_err: any) {
    res.json({ ok: false });
  }
});

router.get("/crm/calls", requireEntityRead(1), async (req: Request, res: Response) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 30, 100);
    const callEntities = await safeQuery(`
      SELECT id FROM module_entities
      WHERE slug IN ('calls', 'interactions', 'call_logs', 'contacts_log', 'activities')
         OR name ILIKE '%שיחה%' OR name ILIKE '%פגישה%' OR name ILIKE '%call%'
    `);
    const accessibleEntityIds = req.permissions?.isSuperAdmin
      ? callEntities.map((e: any) => e.id)
      : callEntities.map((e: any) => e.id).filter((eid: number) =>
          checkEntityAccess(req.permissions!, eid, "read")
        );
    if (accessibleEntityIds.length === 0) {
      res.json({ calls: [], total: 0, avgSentiment: 0, avgIntent: 0, highIntentCount: 0 });
      return;
    }
    const entityIdList = accessibleEntityIds.join(",");
    const calls = await safeQuery(`
      SELECT 
        er.id,
        er.data,
        er.status,
        er.created_at,
        er.updated_at,
        me.name as entity_name
      FROM entity_records er
      JOIN module_entities me ON me.id = er.entity_id
      WHERE er.entity_id IN (${entityIdList})
      ORDER BY er.created_at DESC
      LIMIT ${limit}
    `);

    const result = calls.map((r: any) => {
      const d = typeof r.data === "string" ? JSON.parse(r.data) : (r.data || {});
      const sentimentRaw = Number(d.sentiment_score || d.sentiment || 0);
      const intentRaw = Number(d.buy_intent || d.intent_score || d.interest_score || 0);
      return {
        id: r.id,
        lead: d.contact_name || d.lead_name || d.name || d.customer_name || "לא ידוע",
        phone: d.phone || d.mobile || "",
        date: d.call_date || (r.created_at ? new Date(r.created_at).toISOString().split("T")[0] : ""),
        duration: d.duration || d.call_duration || "",
        sentiment: sentimentRaw > 0 ? Math.min(sentimentRaw, 100) : null,
        buyIntent: intentRaw > 0 ? Math.min(intentRaw, 100) : null,
        agent: d.agent || d.assigned_to || d.salesperson || "",
        keywords: d.keywords || d.topics || [],
        summary: d.summary || d.notes || d.description || "",
        direction: d.direction || d.call_type || "",
        result: d.result || d.outcome || d.status || r.status || "",
        source: r.entity_name || "",
      };
    });

    const withSentiment = result.filter((c: any) => c.sentiment !== null);
    const avgSentiment = withSentiment.length > 0
      ? Math.round(withSentiment.reduce((a: number, b: any) => a + b.sentiment, 0) / withSentiment.length)
      : 0;
    const withIntent = result.filter((c: any) => c.buyIntent !== null);
    const avgIntent = withIntent.length > 0
      ? Math.round(withIntent.reduce((a: number, b: any) => a + b.buyIntent, 0) / withIntent.length)
      : 0;

    res.json({
      calls: result,
      total: result.length,
      avgSentiment,
      avgIntent,
      highIntentCount: withIntent.filter((c: any) => c.buyIntent >= 75).length,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/crm/contractor-decision/summary", requireEntityRead(28), async (_req: Request, res: Response) => {
  try {
    const deals = await safeQuery(`
      SELECT data FROM entity_records 
      WHERE entity_id = 28 AND status IN ('approved', 'completed', 'paid', 'active')
      ORDER BY created_at DESC LIMIT 500
    `);

    let totalSavings = 0;
    let totalDeals = 0;
    let percentRecommended = 0;
    let sqmRecommended = 0;
    let equalRecommended = 0;

    for (const deal of deals) {
      const d = typeof deal.data === "string" ? JSON.parse(deal.data) : (deal.data || {});
      const input = extractComparisonInputFromData(d);
      if (input) {
        const comparison = computePaymentComparison(input);
        totalSavings += comparison.savings;
        totalDeals++;
        if (comparison.recommendation === "percent") percentRecommended++;
        else if (comparison.recommendation === "sqm") sqmRecommended++;
        else equalRecommended++;
      }
    }

    res.json({
      totalSavings: Math.round(totalSavings * 100) / 100,
      totalDeals,
      percentRecommended,
      sqmRecommended,
      equalRecommended,
      avgSavingsPerDeal: totalDeals > 0 ? Math.round((totalSavings / totalDeals) * 100) / 100 : 0,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
