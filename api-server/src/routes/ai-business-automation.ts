import { Router, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const router = Router();

async function safeQuery(query: string, params: any[] = []): Promise<any[]> {
  try {
    const result = await Promise.race([
      params.length > 0
        ? db.execute(sql.raw(query))
        : db.execute(sql.raw(query)),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Query timeout")), 5000)),
    ]);
    return (result as any).rows || [];
  } catch (err: any) {
    console.error("[AI-BizAuto] Query error:", err.message);
    return [];
  }
}

async function callClaude(prompt: string): Promise<string> {
  const apiKey = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY;
  const baseUrl = process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL || "https://api.anthropic.com";
  if (!apiKey) throw new Error("Anthropic API key not configured");

  const response = await fetch(`${baseUrl}/v1/messages`, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Claude API error: ${response.status} ${err}`);
  }

  const data = await response.json() as any;
  return data.content?.[0]?.text || "";
}

function extractJson(text: string): any {
  const match = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  if (match) {
    try { return JSON.parse(match[0]); } catch {}
  }
  return null;
}

function requireAuth(req: Request, res: Response, next: () => void) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.substring(7) : null;
  if (!token) {
    res.status(401).json({ error: "נדרשת התחברות" });
    return;
  }
  next();
}

async function ensureRecommendationsTable() {
  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS ai_recommendations (
      id SERIAL PRIMARY KEY,
      category VARCHAR(100) NOT NULL,
      module VARCHAR(100) NOT NULL,
      priority VARCHAR(20) DEFAULT 'medium',
      title TEXT NOT NULL,
      description TEXT,
      reasoning TEXT,
      expected_impact TEXT,
      impact_value NUMERIC,
      impact_unit VARCHAR(50),
      action_label TEXT,
      action_type VARCHAR(100),
      action_payload JSONB,
      status VARCHAR(30) DEFAULT 'active',
      dismissed_at TIMESTAMP,
      accepted_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `));
}

async function ensureScheduledReportsTable() {
  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS ai_scheduled_reports (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      report_type VARCHAR(100) NOT NULL,
      schedule_type VARCHAR(30) DEFAULT 'weekly',
      schedule_day INTEGER,
      schedule_hour INTEGER DEFAULT 7,
      is_active BOOLEAN DEFAULT true,
      last_run TIMESTAMP,
      next_run TIMESTAMP,
      recipients TEXT[],
      template_config JSONB,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `));
  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS ai_generated_reports (
      id SERIAL PRIMARY KEY,
      schedule_id INTEGER REFERENCES ai_scheduled_reports(id),
      report_type VARCHAR(100) NOT NULL,
      title TEXT NOT NULL,
      period_label TEXT,
      start_date DATE,
      end_date DATE,
      content JSONB,
      narrative TEXT,
      action_items JSONB,
      status VARCHAR(30) DEFAULT 'generated',
      generated_at TIMESTAMP DEFAULT NOW(),
      pdf_path TEXT
    )
  `));
}

router.use("/ai-biz-auto" as any, requireAuth as any);

router.get("/ai-biz-auto/recommendations", async (req: Request, res: Response) => {
  try {
    await ensureRecommendationsTable();

    const status = (req.query.status as string) || "active";
    const category = req.query.category as string;

    let query = `SELECT * FROM ai_recommendations WHERE status = '${status}'`;
    if (category) query += ` AND category = '${category}'`;
    query += ` ORDER BY CASE priority WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END, created_at DESC`;

    const rows = await safeQuery(query);
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/ai-biz-auto/recommendations/generate", async (req: Request, res: Response) => {
  try {
    await ensureRecommendationsTable();

    const [
      inventoryData,
      salesData,
      supplierData,
      productionData,
      financeData,
    ] = await Promise.all([
      safeQuery(`
        SELECT m.material_name, m.current_stock::numeric as current_stock, m.minimum_stock::numeric as minimum_stock,
          m.reorder_point::numeric as reorder_point, m.unit,
          COALESCE(SUM(it.quantity::numeric) FILTER (WHERE it.transaction_type = 'issue' AND it.created_at > NOW() - INTERVAL '30 days'), 0) as monthly_consumption
        FROM raw_materials m
        LEFT JOIN inventory_transactions it ON it.material_id = m.id
        WHERE m.status = 'פעיל'
        GROUP BY m.id, m.material_name, m.current_stock, m.minimum_stock, m.reorder_point, m.unit
        ORDER BY m.current_stock ASC
        LIMIT 20
      `),
      safeQuery(`
        SELECT
          COALESCE(SUM(amount) FILTER (WHERE invoice_date >= CURRENT_DATE - INTERVAL '30 days'), 0) as monthly_revenue,
          COALESCE(SUM(amount) FILTER (WHERE invoice_date >= CURRENT_DATE - INTERVAL '60 days' AND invoice_date < CURRENT_DATE - INTERVAL '30 days'), 0) as prev_revenue,
          COUNT(*) FILTER (WHERE invoice_date >= CURRENT_DATE - INTERVAL '30 days') as monthly_deals,
          COUNT(*) FILTER (WHERE invoice_date >= CURRENT_DATE - INTERVAL '60 days' AND invoice_date < CURRENT_DATE - INTERVAL '30 days') as prev_deals,
          COALESCE(AVG(amount) FILTER (WHERE invoice_date >= CURRENT_DATE - INTERVAL '30 days'), 0) as avg_deal_value
        FROM income_documents WHERE status != 'cancelled'
      `),
      safeQuery(`
        SELECT s.supplier_name, s.rating, s.category,
          COUNT(ap.id) as invoice_count,
          COALESCE(AVG(ap.amount::numeric), 0) as avg_invoice,
          COALESCE(SUM(ap.amount::numeric), 0) as total_spend,
          COUNT(ap.id) FILTER (WHERE ap.status = 'overdue') as overdue_count
        FROM suppliers s
        LEFT JOIN accounts_payable ap ON ap.supplier_id = s.id AND ap.invoice_date > NOW() - INTERVAL '90 days'
        WHERE s.status = 'פעיל'
        GROUP BY s.id, s.supplier_name, s.rating, s.category
        ORDER BY total_spend DESC
        LIMIT 15
      `),
      safeQuery(`
        SELECT
          COUNT(*) as total_orders,
          COUNT(*) FILTER (WHERE status = 'completed') as completed,
          COUNT(*) FILTER (WHERE status IN ('בביצוע', 'in_progress')) as in_progress,
          COUNT(*) FILTER (WHERE status IN ('מתוכנן', 'planned')) as planned,
          COUNT(*) FILTER (WHERE priority IN ('דחוף', 'critical', 'urgent')) as critical,
          COUNT(*) FILTER (WHERE due_date < CURRENT_DATE AND status != 'completed') as overdue
        FROM work_orders WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
      `),
      safeQuery(`
        SELECT
          COALESCE(SUM(current_balance), 0) as total_cash,
          (SELECT COALESCE(SUM(balance_due), 0) FROM accounts_receivable WHERE status IN ('open', 'partial') AND due_date < CURRENT_DATE) as overdue_receivables,
          (SELECT COALESCE(SUM(balance_due), 0) FROM accounts_payable WHERE status IN ('open', 'partial') AND due_date <= CURRENT_DATE + INTERVAL '14 days') as upcoming_payables,
          (SELECT COALESCE(SUM(amount), 0) FROM expenses WHERE expense_date >= CURRENT_DATE - INTERVAL '30 days' AND status NOT IN ('cancelled', 'rejected')) as monthly_expenses
        FROM bank_accounts WHERE is_active = true
      `),
    ]);

    const contextData = {
      inventory: inventoryData,
      sales: salesData[0] || {},
      suppliers: supplierData,
      production: productionData[0] || {},
      finance: financeData[0] || {},
    };

    const prompt = `אתה מנתח עסקי AI של מערכת ERP לחברת מסגרות ברזל/אלומיניום/זכוכית. נתח את הנתונים הבאים וייצר המלצות עסקיות ממוקדות ומוסמכות.

נתוני המערכת:
${JSON.stringify(contextData, null, 2)}

ייצר מערך JSON עם 8-12 המלצות. כל המלצה בפורמט:
{
  "category": "מלאי|מכירות|ספקים|ייצור|פיננסים",
  "module": "raw-materials|sales|suppliers|production|finance",
  "priority": "critical|high|medium|low",
  "title": "כותרת קצרה בעברית",
  "description": "תיאור קצר ב-2-3 משפטים",
  "reasoning": "הסבר המבוסס על הנתונים בפועל",
  "expected_impact": "תיאור ההשפעה המצופה",
  "impact_value": מספר (ערך השפעה משוער בשקלים או אחוזים),
  "impact_unit": "ILS|%|ימים|יחידות",
  "action_label": "טקסט כפתור פעולה",
  "action_type": "navigate|api_call|none"
}

כללים:
- בסס המלצות על הנתונים בפועל
- הדגש בעיות קריטיות (מלאי נמוך, תשלומים מאוחרים, ייצור בפיגור)
- המלץ על שיפורים ספציפיים ומדידים
- השתמש בעברית בלבד
- החזר רק JSON תקני של מערך, ללא הסבר נוסף`;

    const response = await callClaude(prompt);
    const recommendations = extractJson(response);

    if (!Array.isArray(recommendations)) {
      res.status(500).json({ error: "AI לא החזיר המלצות תקינות" });
      return;
    }

    await safeQuery(`DELETE FROM ai_recommendations WHERE status = 'active' AND created_at < NOW() - INTERVAL '24 hours'`);

    const inserted: any[] = [];
    for (const rec of recommendations) {
      const result = await db.execute(sql`
        INSERT INTO ai_recommendations (category, module, priority, title, description, reasoning, expected_impact, impact_value, impact_unit, action_label, action_type, status)
        VALUES (
          ${rec.category || "כללי"},
          ${rec.module || "general"},
          ${rec.priority || "medium"},
          ${rec.title || "המלצה"},
          ${rec.description || ""},
          ${rec.reasoning || ""},
          ${rec.expected_impact || ""},
          ${rec.impact_value ? String(rec.impact_value) : null},
          ${rec.impact_unit || "ILS"},
          ${rec.action_label || "פעל"},
          ${rec.action_type || "none"},
          'active'
        )
        RETURNING *
      `);
      if (result.rows[0]) inserted.push(result.rows[0]);
    }

    res.json({ generated: inserted.length, recommendations: inserted });
  } catch (err: any) {
    console.error("[AI-Rec] Generation error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

router.patch("/ai-biz-auto/recommendations/:id/dismiss", async (req: Request, res: Response) => {
  try {
    await ensureRecommendationsTable();
    const id = parseInt(req.params.id);
    await db.execute(sql`UPDATE ai_recommendations SET status = 'dismissed', dismissed_at = NOW() WHERE id = ${id}`);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.patch("/ai-biz-auto/recommendations/:id/accept", async (req: Request, res: Response) => {
  try {
    await ensureRecommendationsTable();
    const id = parseInt(req.params.id);
    await db.execute(sql`UPDATE ai_recommendations SET status = 'accepted', accepted_at = NOW() WHERE id = ${id}`);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/ai-biz-auto/recommendations/stats", async (req: Request, res: Response) => {
  try {
    await ensureRecommendationsTable();
    const rows = await safeQuery(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'active') as active_count,
        COUNT(*) FILTER (WHERE status = 'accepted') as accepted_count,
        COUNT(*) FILTER (WHERE status = 'dismissed') as dismissed_count,
        COUNT(*) FILTER (WHERE priority = 'critical' AND status = 'active') as critical_count,
        COUNT(*) FILTER (WHERE priority = 'high' AND status = 'active') as high_count,
        COALESCE(SUM(impact_value::numeric) FILTER (WHERE status = 'accepted'), 0) as accepted_impact
      FROM ai_recommendations
    `);
    res.json(rows[0] || {});
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/ai-biz-auto/scheduled-reports", async (req: Request, res: Response) => {
  try {
    await ensureScheduledReportsTable();
    const rows = await safeQuery(`SELECT * FROM ai_scheduled_reports ORDER BY created_at DESC`);
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/ai-biz-auto/scheduled-reports", async (req: Request, res: Response) => {
  try {
    await ensureScheduledReportsTable();
    const { name, description, report_type, schedule_type, schedule_day, schedule_hour, recipients } = req.body;

    const result = await db.execute(sql`
      INSERT INTO ai_scheduled_reports (name, description, report_type, schedule_type, schedule_day, schedule_hour, recipients, is_active)
      VALUES (
        ${name || "דוח חדש"},
        ${description || ""},
        ${report_type || "sales_summary"},
        ${schedule_type || "weekly"},
        ${schedule_day ?? null},
        ${schedule_hour ?? 7},
        ${recipients ? JSON.stringify(recipients) : null},
        true
      )
      RETURNING *
    `);
    res.json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.put("/ai-biz-auto/scheduled-reports/:id", async (req: Request, res: Response) => {
  try {
    await ensureScheduledReportsTable();
    const id = parseInt(req.params.id);
    const { name, description, report_type, schedule_type, schedule_day, schedule_hour, is_active, recipients } = req.body;

    await db.execute(sql`
      UPDATE ai_scheduled_reports SET
        name = COALESCE(${name}, name),
        description = COALESCE(${description}, description),
        report_type = COALESCE(${report_type}, report_type),
        schedule_type = COALESCE(${schedule_type}, schedule_type),
        schedule_day = COALESCE(${schedule_day ?? null}, schedule_day),
        schedule_hour = COALESCE(${schedule_hour ?? null}, schedule_hour),
        is_active = COALESCE(${is_active ?? null}, is_active),
        recipients = COALESCE(${recipients ? JSON.stringify(recipients) : null}, recipients),
        updated_at = NOW()
      WHERE id = ${id}
    `);
    const rows = await safeQuery(`SELECT * FROM ai_scheduled_reports WHERE id = ${id}`);
    res.json(rows[0] || {});
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/ai-biz-auto/scheduled-reports/:id", async (req: Request, res: Response) => {
  try {
    await ensureScheduledReportsTable();
    const id = parseInt(req.params.id);
    await db.execute(sql`DELETE FROM ai_scheduled_reports WHERE id = ${id}`);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/ai-biz-auto/reports", async (req: Request, res: Response) => {
  try {
    await ensureScheduledReportsTable();
    const scheduleId = req.query.schedule_id;
    let query = `SELECT * FROM ai_generated_reports`;
    if (scheduleId) query += ` WHERE schedule_id = ${parseInt(String(scheduleId))}`;
    query += ` ORDER BY generated_at DESC LIMIT 50`;
    const rows = await safeQuery(query);
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/ai-biz-auto/reports/generate", async (req: Request, res: Response) => {
  try {
    await ensureScheduledReportsTable();
    const { report_type, period, schedule_id, start_date, end_date } = req.body;

    const now = new Date();
    const startDate = start_date || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    const endDate = end_date || now.toISOString().slice(0, 10);

    const [salesData, expenseData, hrData, inventoryData, productionData] = await Promise.all([
      safeQuery(`
        SELECT
          COALESCE(SUM(amount), 0) as total_revenue,
          COUNT(*) as invoice_count,
          COALESCE(AVG(amount), 0) as avg_invoice,
          COALESCE(SUM(amount) FILTER (WHERE invoice_date >= CURRENT_DATE - INTERVAL '7 days'), 0) as last_week_revenue
        FROM income_documents
        WHERE status != 'cancelled' AND invoice_date >= '${startDate}' AND invoice_date <= '${endDate}'
      `),
      safeQuery(`
        SELECT
          COALESCE(SUM(amount), 0) as total_expenses,
          COUNT(*) as expense_count,
          category,
          COALESCE(SUM(amount), 0) as category_total
        FROM expenses
        WHERE status NOT IN ('cancelled', 'rejected') AND expense_date >= '${startDate}' AND expense_date <= '${endDate}'
        GROUP BY category
        ORDER BY category_total DESC
        LIMIT 10
      `),
      safeQuery(`
        SELECT COUNT(*) FILTER (WHERE status = 'active') as active_employees,
          COALESCE(SUM(base_salary) FILTER (WHERE status = 'active'), 0) as total_salary_cost
        FROM employees
      `),
      safeQuery(`
        SELECT COUNT(*) as total_materials,
          COUNT(*) FILTER (WHERE current_stock::numeric <= reorder_point::numeric) as low_stock_count,
          COUNT(*) FILTER (WHERE current_stock::numeric = 0) as out_of_stock_count
        FROM raw_materials WHERE status = 'פעיל'
      `),
      safeQuery(`
        SELECT COUNT(*) as total_orders,
          COUNT(*) FILTER (WHERE status = 'completed') as completed_orders,
          COUNT(*) FILTER (WHERE status IN ('בביצוע', 'in_progress')) as in_progress_orders,
          COUNT(*) FILTER (WHERE due_date < CURRENT_DATE AND status != 'completed') as overdue_orders
        FROM work_orders WHERE created_at >= '${startDate}' AND created_at <= '${endDate}'
      `),
    ]);

    const totalRevenue = Number(salesData[0]?.total_revenue || 0);
    const totalExpenses = expenseData.reduce((s: number, r: any) => s + Number(r.category_total || 0), 0);
    const grossProfit = totalRevenue - totalExpenses;
    const profitMargin = totalRevenue > 0 ? Math.round((grossProfit / totalRevenue) * 100 * 10) / 10 : 0;

    const kpiSummary = {
      revenue: totalRevenue,
      expenses: totalExpenses,
      grossProfit,
      profitMargin,
      invoiceCount: Number(salesData[0]?.invoice_count || 0),
      avgInvoice: Number(salesData[0]?.avg_invoice || 0),
      activeEmployees: Number(hrData[0]?.active_employees || 0),
      salaryCost: Number(hrData[0]?.total_salary_cost || 0),
      lowStockCount: Number(inventoryData[0]?.low_stock_count || 0),
      outOfStock: Number(inventoryData[0]?.out_of_stock_count || 0),
      productionOrders: Number(productionData[0]?.total_orders || 0),
      completedOrders: Number(productionData[0]?.completed_orders || 0),
      overdueOrders: Number(productionData[0]?.overdue_orders || 0),
      expenseBreakdown: expenseData,
    };

    const reportTypeLabel: Record<string, string> = {
      sales_summary: "סיכום מכירות",
      financial_health: "בריאות פיננסית",
      inventory_status: "מצב מלאי",
      production_efficiency: "יעילות ייצור",
      hr_metrics: "מדדי משאבי אנוש",
      full_report: "דוח כולל",
    };

    const periodLabel = period || "חודשי";
    const reportTitle = `${reportTypeLabel[report_type || "full_report"] || "דוח עסקי"} — ${periodLabel}`;

    const narrativePrompt = `אתה מנהל כספים בכיר של חברת מסגרות ברזל/אלומיניום/זכוכית. כתוב סיכום דוח ${reportTypeLabel[report_type || "full_report"] || "עסקי"} ${periodLabel} בעברית מקצועית.

נתוני התקופה ${startDate} עד ${endDate}:
${JSON.stringify(kpiSummary, null, 2)}

כתוב:
1. פסקת סיכום מנהלים (3-4 משפטים) עם ההישגים העיקריים
2. ניתוח 3 נקודות חוזק
3. ניתוח 2-3 אזורים לשיפור
4. 3-5 פריטי פעולה ספציפיים ומדידים לתקופה הבאה

פורמט JSON:
{
  "executive_summary": "סיכום מנהלים...",
  "strengths": ["חוזק 1", "חוזק 2", "חוזק 3"],
  "improvements": ["שיפור 1", "שיפור 2"],
  "action_items": [
    {"title": "כותרת", "description": "תיאור", "priority": "high|medium|low", "owner": "מחלקה אחראית", "due_days": 14}
  ]
}

כתוב בעברית בלבד, החזר JSON תקני בלבד.`;

    let narrative = { executive_summary: "הדוח נוצר בהצלחה.", strengths: [], improvements: [], action_items: [] };
    try {
      const aiResponse = await callClaude(narrativePrompt);
      const parsed = extractJson(aiResponse);
      if (parsed) narrative = parsed;
    } catch (aiErr: any) {
      console.error("[AI-Report] Narrative generation failed:", aiErr.message);
    }

    const result = await db.execute(sql`
      INSERT INTO ai_generated_reports (schedule_id, report_type, title, period_label, start_date, end_date, content, narrative, action_items, status)
      VALUES (
        ${schedule_id || null},
        ${report_type || "full_report"},
        ${reportTitle},
        ${periodLabel},
        ${startDate},
        ${endDate},
        ${JSON.stringify(kpiSummary)}::jsonb,
        ${typeof narrative === "string" ? narrative : JSON.stringify(narrative)},
        ${JSON.stringify(narrative.action_items || [])}::jsonb,
        'generated'
      )
      RETURNING *
    `);

    const report = result.rows[0] as any;
    res.json({ ...report, narrative_parsed: narrative, kpiSummary });
  } catch (err: any) {
    console.error("[AI-Report] Generate error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get("/ai-biz-auto/reports/:id", async (req: Request, res: Response) => {
  try {
    await ensureScheduledReportsTable();
    const id = parseInt(req.params.id);
    const rows = await safeQuery(`SELECT * FROM ai_generated_reports WHERE id = ${id}`);
    if (!rows[0]) {
      res.status(404).json({ error: "דוח לא נמצא" });
      return;
    }
    const report = rows[0];
    try {
      if (typeof report.narrative === "string") {
        report.narrative_parsed = JSON.parse(report.narrative);
      } else {
        report.narrative_parsed = report.narrative;
      }
    } catch {}
    res.json(report);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
