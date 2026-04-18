import { Router, Request, Response } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const router = Router();

function getKimiApiKey(): string {
  return process.env.KIMI_API_KEY || process.env.MOONSHOT_API_KEY || "";
}
function getKimiBaseUrl(): string {
  return process.env.KIMI_API_URL || "https://api.moonshot.ai/v1";
}

const DB_SCHEMA_SUMMARY = `
מבנה בסיס הנתונים של מערכת ERP "טכנו-כל עוזי" (מפעל מסגרות מתכת):

טבלאות עיקריות:
- sales_orders: הזמנות מכירה (id, customer_name, customer_id, total, status, created_at, order_number)
- sales_customers: לקוחות (id, name, phone, email, status, created_at)
- purchase_orders: הזמנות רכש (id, supplier_id, total_amount, status, created_at)
- suppliers: ספקים (id, name, contact_name, phone, email, status)
- raw_materials: חומרי גלם (id, name, sku, current_stock, reorder_point, unit_price, category, created_at)
- products: מוצרים (id, name, sku, price, category, is_active)
- work_orders: הוראות עבודה (id, title, status, priority, assigned_to, created_at)
- employees: עובדים (id, first_name, last_name, department, position, salary, status, start_date)
- customer_invoices: חשבוניות לקוח (id, customer_id, total_amount, status, created_at, due_date)
- crm_leads: לידים CRM (id, name, company, status, score, budget, source, created_at)
- projects: פרויקטים (id, name, status, estimated_cost, actual_cost, created_at)
- inventory_transactions: תנועות מלאי (id, item_id, quantity, type, created_at)
- quality_inspections: בדיקות איכות (id, result, notes, created_at)
- maintenance_orders: הזמנות תחזוקה (id, title, status, priority, created_at)
- support_tickets: פניות תמיכה (id, subject, status, priority, created_at)
- audit_log: לוג ביקורת (id, table_name, action, created_at)
- general_ledger: ספר חשבונות כללי (id, account_id, debit, credit, date, description)
- chart_of_accounts: תוכנית חשבונות (id, code, name, type, balance)

הגבלות: SELECT בלבד. אסור UPDATE/INSERT/DELETE/DROP/CREATE/ALTER.
`;

const HEBREW_TO_SQL_PROMPT = `אתה מנתח שאילתות עסקיות בעברית ומתרגם אותן ל-SQL בטוח (SELECT בלבד) על בסיס הנתונים הבא.

${DB_SCHEMA_SUMMARY}

כללים חשובים:
1. השב רק בפורמט JSON תקני ללא שום טקסט אחר
2. צור SQL בטוח שמחזיר תוצאות משמעותיות
3. הוסף LIMIT 100 לשאילתות שעלולות להחזיר הרבה שורות
4. השתמש ב-COALESCE לערכים שעלולים להיות NULL
5. תאריכים: NOW(), INTERVAL, DATE_TRUNC, TO_CHAR
6. אל תשתמש ב-information_schema
7. חזור בפורמט: {"sql": "...", "description": "תיאור קצר בעברית", "chart_type": "bar|line|pie|table|number"}

דוגמאות:
שאלה: "כמה הזמנות מכירה היו החודש?"
תשובה: {"sql": "SELECT COUNT(*)::int as total, COALESCE(SUM(total), 0)::numeric as value FROM sales_orders WHERE created_at >= DATE_TRUNC('month', NOW())", "description": "ספירת הזמנות מכירה בחודש הנוכחי", "chart_type": "number"}

שאלה: "מה המכירות לפי חודש?"
תשובה: {"sql": "SELECT TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') as month, COUNT(*)::int as count, COALESCE(SUM(total), 0)::numeric as value FROM sales_orders WHERE created_at >= NOW() - INTERVAL '12 months' GROUP BY DATE_TRUNC('month', created_at) ORDER BY month", "description": "מכירות חודשיות ב-12 חודשים האחרונים", "chart_type": "line"}

שאלה: "כמה חומר גלם יש במלאי?"
תשובה: {"sql": "SELECT name, current_stock, unit_price, COALESCE(current_stock * unit_price, 0) as total_value FROM raw_materials WHERE current_stock IS NOT NULL ORDER BY current_stock DESC LIMIT 20", "description": "רשימת חומרי גלם במלאי", "chart_type": "bar"}`;

async function callKimiForSQL(question: string): Promise<{ sql: string; description: string; chart_type: string } | null> {
  const apiKey = getKimiApiKey();
  if (!apiKey) return null;

  try {
    const response = await fetch(`${getKimiBaseUrl()}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "moonshot-v1-8k",
        messages: [
          { role: "system", content: HEBREW_TO_SQL_PROMPT },
          { role: "user", content: question },
        ],
        temperature: 0.1,
        max_tokens: 2048,
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      console.error(`[NLQuery] Kimi API error: ${response.status}`);
      return null;
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    return JSON.parse(jsonMatch[0]);
  } catch (err) {
    console.error("[NLQuery] Kimi call failed:", err);
    return null;
  }
}

function validateSQL(query: string): { safe: boolean; error?: string } {
  const lower = query.toLowerCase().replace(/\s+/g, " ").trim();
  const dangerous = ["insert ", "update ", "delete ", "drop ", "create ", "alter ", "truncate ", "grant ", "revoke "];
  for (const kw of dangerous) {
    if (lower.includes(kw)) {
      return { safe: false, error: `שאילתה מסוכנת: כוללת '${kw.trim()}'` };
    }
  }
  const firstWord = lower.replace(/^\(/, "").trim().split(/\s/)[0];
  const allowed = ["select", "with", "explain"];
  if (!allowed.includes(firstWord)) {
    return { safe: false, error: "רק שאילתות SELECT מותרות" };
  }
  return { safe: true };
}

async function generateAISummary(question: string, sql: string, rows: any[], chartType: string): Promise<string> {
  const apiKey = getKimiApiKey();
  if (!apiKey || rows.length === 0) return "";

  const previewRows = rows.slice(0, 5);
  const summaryPrompt = `סכם את תוצאות השאילתה הבאה בעברית בצורה ברורה ועסקית (2-3 משפטים):
שאלה: ${question}
תוצאות (${rows.length} שורות): ${JSON.stringify(previewRows)}
תן תובנה עסקית מהנתונים.`;

  try {
    const response = await fetch(`${getKimiBaseUrl()}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "moonshot-v1-8k",
        messages: [
          { role: "system", content: "אתה מנתח עסקי של מפעל מסגרות. ענה בעברית קצרה ומדויקת." },
          { role: "user", content: summaryPrompt },
        ],
        temperature: 0.3,
        max_tokens: 500,
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) return "";
    const data = await response.json();
    return data.choices?.[0]?.message?.content || "";
  } catch {
    return "";
  }
}

function getRuleBasedSQL(question: string): { sql: string; description: string; chart_type: string } | null {
  const q = question.toLowerCase();

  if (q.includes("מכירות") && (q.includes("חודש") || q.includes("חודשי"))) {
    if (q.includes("שעבר") || q.includes("אחרון")) {
      return {
        sql: `SELECT COUNT(*)::int as total, COALESCE(SUM(total), 0)::numeric as value FROM sales_orders WHERE created_at >= DATE_TRUNC('month', NOW() - INTERVAL '1 month') AND created_at < DATE_TRUNC('month', NOW())`,
        description: "מכירות חודש שעבר",
        chart_type: "number",
      };
    }
    return {
      sql: `SELECT TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') as month, COUNT(*)::int as count, COALESCE(SUM(total), 0)::numeric as value FROM sales_orders WHERE created_at >= NOW() - INTERVAL '12 months' GROUP BY DATE_TRUNC('month', created_at) ORDER BY month`,
      description: "מכירות חודשיות ב-12 חודשים האחרונים",
      chart_type: "line",
    };
  }

  if (q.includes("חומר גלם") || q.includes("מלאי") || q.includes("מלאי חומרים")) {
    return {
      sql: `SELECT name, COALESCE(current_stock, 0)::int as current_stock, COALESCE(unit_price, 0)::numeric as unit_price, COALESCE(current_stock * unit_price, 0)::numeric as total_value FROM raw_materials WHERE current_stock IS NOT NULL ORDER BY current_stock DESC LIMIT 20`,
      description: "חומרי גלם במלאי",
      chart_type: "bar",
    };
  }

  if (q.includes("לקוח") || q.includes("לקוחות")) {
    return {
      sql: `SELECT COALESCE(sc.name, so.customer_name, 'לא ידוע') as name, COUNT(so.id)::int as orders, COALESCE(SUM(so.total), 0)::numeric as total_value FROM sales_orders so LEFT JOIN sales_customers sc ON sc.id = so.customer_id GROUP BY COALESCE(sc.name, so.customer_name, 'לא ידוע') ORDER BY total_value DESC LIMIT 15`,
      description: "לקוחות מובילים לפי ערך הזמנות",
      chart_type: "bar",
    };
  }

  if (q.includes("עובד") || q.includes("עובדים") || q.includes("כוח אדם")) {
    if (q.includes("מחלקה")) {
      return {
        sql: `SELECT COALESCE(department, 'לא משויך') as name, COUNT(*)::int as value FROM employees WHERE status IN ('פעיל', 'active') GROUP BY department ORDER BY value DESC`,
        description: "עובדים לפי מחלקה",
        chart_type: "pie",
      };
    }
    return {
      sql: `SELECT COUNT(*)::int as total, COUNT(*) FILTER (WHERE status IN ('פעיל','active'))::int as active, COUNT(*) FILTER (WHERE start_date >= NOW() - INTERVAL '30 days')::int as new_this_month FROM employees`,
      description: "סיכום נתוני עובדים",
      chart_type: "number",
    };
  }

  if (q.includes("ספק") || q.includes("ספקים")) {
    return {
      sql: `SELECT s.name, COUNT(po.id)::int as orders, COALESCE(SUM(po.total_amount), 0)::numeric as total_amount FROM suppliers s LEFT JOIN purchase_orders po ON po.supplier_id = s.id GROUP BY s.name ORDER BY total_amount DESC LIMIT 15`,
      description: "ספקים מובילים לפי ערך הזמנות",
      chart_type: "bar",
    };
  }

  if (q.includes("חשבונית") || q.includes("חשבוניות")) {
    return {
      sql: `SELECT status, COUNT(*)::int as count, COALESCE(SUM(total_amount), 0)::numeric as value FROM customer_invoices GROUP BY status ORDER BY count DESC`,
      description: "חשבוניות לפי סטטוס",
      chart_type: "pie",
    };
  }

  if (q.includes("הכנסות") || q.includes("רווח")) {
    return {
      sql: `SELECT TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') as month, COALESCE(SUM(total_amount), 0)::numeric as revenue FROM customer_invoices WHERE created_at >= NOW() - INTERVAL '12 months' GROUP BY DATE_TRUNC('month', created_at) ORDER BY month`,
      description: "הכנסות חודשיות ב-12 חודשים האחרונים",
      chart_type: "line",
    };
  }

  if (q.includes("ליד") || q.includes("לידים")) {
    return {
      sql: `SELECT status, COUNT(*)::int as count FROM crm_leads GROUP BY status ORDER BY count DESC`,
      description: "לידים לפי סטטוס",
      chart_type: "pie",
    };
  }

  return null;
}

router.post("/analytics/nl-query", async (req: Request, res: Response) => {
  const { question } = req.body;

  if (!question || typeof question !== "string" || !question.trim()) {
    res.status(400).json({ error: "שאלה נדרשת" });
    return;
  }

  const questionTrimmed = question.trim();
  const startTime = Date.now();

  try {
    let parsed = getRuleBasedSQL(questionTrimmed);
    let method = "rule-based";

    if (!parsed) {
      parsed = await callKimiForSQL(questionTrimmed);
      method = "ai";
    }

    if (!parsed) {
      res.status(503).json({
        error: "לא הצלחתי להמיר את השאלה לשאילתת SQL. נסה לנסח מחדש.",
        suggestion: "נסה לשאול: מה המכירות של חודש שעבר? כמה עובדים יש? מה המלאי של חומרי הגלם?",
      });
      return;
    }

    const { sql: rawSQL, description, chart_type } = parsed;

    const validation = validateSQL(rawSQL);
    if (!validation.safe) {
      res.status(403).json({ error: `שאילתה לא בטוחה: ${validation.error}` });
      return;
    }

    let sqlWithLimit = rawSQL;
    if (!rawSQL.toLowerCase().includes("limit")) {
      sqlWithLimit = `${rawSQL} LIMIT 100`;
    }

    const result = await db.execute(sql.raw(sqlWithLimit));
    const rows = (result.rows || []) as Record<string, unknown>[];

    const columns = rows.length > 0
      ? Object.keys(rows[0]).map(key => ({
          key,
          label: key,
          type: typeof rows[0][key] === "number" ? "number" : "string",
        }))
      : [];

    const aiSummary = await generateAISummary(questionTrimmed, rawSQL, rows, chart_type);

    const elapsed = Date.now() - startTime;
    console.log(`[NLQuery] "${questionTrimmed}" => ${rows.length} rows, ${elapsed}ms (${method})`);

    res.json({
      question: questionTrimmed,
      description,
      sql: rawSQL,
      rows,
      columns,
      rowCount: rows.length,
      chart_type,
      ai_summary: aiSummary,
      elapsed_ms: elapsed,
    });
  } catch (err: any) {
    console.error("[NLQuery] Error:", err.message);
    res.status(500).json({ error: `שגיאה בביצוע השאילתה: ${err.message}` });
  }
});

router.get("/analytics/nl-query/suggestions", (_req: Request, res: Response) => {
  res.json({
    suggestions: [
      "מה המכירות של חודש שעבר?",
      "כמה חומר גלם יש במלאי?",
      "מה ההכנסות החודשיות?",
      "כמה לקוחות פעילים יש?",
      "מה הלידים לפי סטטוס?",
      "כמה עובדים יש לפי מחלקה?",
      "מה הספקים המובילים?",
      "כמה חשבוניות פתוחות יש?",
      "מה הרווח ב-12 חודשים האחרונים?",
      "כמה הזמנות עבודה קריטיות יש?",
    ],
  });
});

export default router;
