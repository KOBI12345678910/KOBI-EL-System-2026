import { Router } from "express";
import { pool } from "@workspace/db";

const router = Router();

const CHATBOT_SYSTEM_PROMPT = `אתה עוזר ERP חכם לעובדי חברת טכנו-כל עוזי. תפקידך לסייע לעובדים עם שאלות על:
- שאלות משאבי אנוש: יתרת ימי חופשה, מחלה, נוכחות, משכורות
- מצאי ומלאי: כמויות, מוצרים, חומרי גלם
- הזמנות: יצירת הזמנות רכש, בדיקת סטטוס הזמנות
- לקוחות וספקים: פרטי קשר, היסטוריה
- דוחות ונתונים: נתונים שוטפים מהמערכת

חוקים חשובים:
1. ענה תמיד בעברית
2. כשמשתמש מבקש ליצור/לשנות נתונים — בקש אישור לפני ביצוע הפעולה
3. ציין בבירור אם אתה לא יכול לגשת למידע מסוים
4. סיים תגובות עם הצעות לשאלות נוספות רלוונטיות
5. אם יש צורך בפעולה שדורשת אישור, השב עם JSON: {"requiresAction": true, "action": "...", "params": {...}, "confirmMessage": "..."}

פורמט כשמשתמש מבקש פעולה הדורשת אישור (כמו יצירת הזמנה):
{"requiresAction": true, "action": "create_purchase_order", "params": {"supplier": "...", "items": [...]}, "confirmMessage": "אנא אשר: יצירת הזמנת רכש ל..."}`;

async function getErpContext(query: string): Promise<string> {
  const contextParts: string[] = [];

  try {
    if (/חופש|מחלה|נוכחות|ימי|leave|vacation/i.test(query)) {
      const result = await pool.query(`
        SELECT e.first_name, e.last_name, e.employee_number,
               COALESCE(e.vacation_days_balance, 0) as vacation_balance,
               COALESCE(e.sick_days_balance, 0) as sick_balance
        FROM employees e
        WHERE e.is_active = true
        LIMIT 10
      `);
      if (result.rows.length > 0) {
        const sample = result.rows[0];
        contextParts.push(`[נתוני HR]: ${result.rows.length} עובדים פעילים. דוגמה: ${sample.first_name} ${sample.last_name} — יתרת חופש: ${sample.vacation_balance} ימים, מחלה: ${sample.sick_balance} ימים`);
      }
    }

    if (/מלאי|מוצר|inventory|product|חומר|raw/i.test(query)) {
      const result = await pool.query(`
        SELECT sku, category, COALESCE(current_stock, 0) as stock,
               COALESCE(minimum_stock, 0) as min_stock
        FROM raw_materials
        WHERE is_active = true
        ORDER BY current_stock DESC
        LIMIT 5
      `);
      if (result.rows.length > 0) {
        const items = result.rows.map(r => `${r.sku || r.category}: ${r.stock} יח' (מינ': ${r.min_stock})`).join(', ');
        contextParts.push(`[מלאי חומרי גלם]: ${items}`);
      }
    }

    if (/הזמנה|order|רכש|ספק|supplier|purchase/i.test(query)) {
      const result = await pool.query(`
        SELECT po.order_number, po.status, s.supplier_name,
               po.total_amount, po.created_at
        FROM purchase_orders po
        LEFT JOIN suppliers s ON po.supplier_id = s.id
        ORDER BY po.created_at DESC
        LIMIT 5
      `);
      if (result.rows.length > 0) {
        const orders = result.rows.map(r => `${r.order_number || '#'+r.id}: ${r.supplier_name || 'ספק'} — ${r.status}`).join('; ');
        contextParts.push(`[הזמנות רכש אחרונות]: ${orders}`);
      }

      const suppliers = await pool.query(`
        SELECT supplier_name, contact_person, phone
        FROM suppliers
        WHERE is_active = true
        ORDER BY supplier_name
        LIMIT 10
      `);
      if (suppliers.rows.length > 0) {
        const list = suppliers.rows.map(s => s.supplier_name).join(', ');
        contextParts.push(`[ספקים פעילים]: ${list}`);
      }
    }

    if (/לקוח|customer|מכירה|sale/i.test(query)) {
      const result = await pool.query(`
        SELECT name, contact_person, phone, status
        FROM sales_customers
        WHERE is_active = true
        ORDER BY name
        LIMIT 5
      `);
      if (result.rows.length > 0) {
        const list = result.rows.map(r => `${r.name} (${r.contact_person || ''})`).join(', ');
        contextParts.push(`[לקוחות פעילים]: ${list}`);
      }
    }

    if (/עובד|employee|staff|HR/i.test(query)) {
      const empCount = await pool.query(`SELECT count(*) FROM employees WHERE is_active = true`);
      contextParts.push(`[עובדים]: ${empCount.rows[0].count} עובדים פעילים`);
    }
  } catch (e) {
    contextParts.push(`[מידע חלקי בלבד — חלק מהנתונים לא נטענו]`);
  }

  return contextParts.length > 0 ? '\n\n[הקשר מהמערכת]:\n' + contextParts.join('\n') : '';
}

async function callAnthropicAPI(messages: any[], systemPrompt: string): Promise<string> {
  const apiKey = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;
  const baseUrl = process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL || 'https://api.anthropic.com';
  const model = process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL ? 'claude-sonnet-4-6' : 'claude-3-5-haiku-20241022';

  if (!apiKey) {
    throw new Error('Anthropic API key not configured');
  }

  const response = await fetch(`${baseUrl}/v1/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 1500,
      system: systemPrompt,
      messages,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Anthropic API error: ${response.status} ${err}`);
  }

  const data = await response.json() as any;
  return data.content?.[0]?.text || '';
}

router.post('/employee-chatbot/chat', async (req: any, res: any) => {
  const { message, history = [] } = req.body;

  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'message נדרש' });
  }

  try {
    const erpContext = await getErpContext(message);
    const systemWithContext = CHATBOT_SYSTEM_PROMPT + erpContext;

    const claudeMessages = [
      ...history.map((m: any) => ({ role: m.role, content: m.content })),
      { role: 'user', content: message },
    ];

    const reply = await callAnthropicAPI(claudeMessages, systemWithContext);

    let parsed: any = null;
    try {
      const jsonMatch = reply.match(/\{[\s\S]*"requiresAction"[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      }
    } catch {}

    res.json({
      reply,
      requiresAction: parsed?.requiresAction || false,
      action: parsed?.action || null,
      actionParams: parsed?.params || null,
      confirmMessage: parsed?.confirmMessage || null,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'שגיאה פנימית' });
  }
});

router.post('/employee-chatbot/execute-action', async (req: any, res: any) => {
  const { action, params } = req.body;

  try {
    let result = '';

    switch (action) {
      case 'create_purchase_order': {
        const { supplier, items, notes } = params || {};
        if (!supplier) throw new Error('ספק נדרש');
        const po = await pool.query(`
          INSERT INTO purchase_orders (status, notes, created_at, updated_at)
          VALUES ('draft', $1, NOW(), NOW())
          RETURNING id, order_number
        `, [`הוזמן ע"י בוט: ${notes || ''}`]);
        result = `הזמנת רכש נוצרה בהצלחה — מספר ${po.rows[0].order_number || '#' + po.rows[0].id}`;
        break;
      }
      default:
        result = `פעולה '${action}' לא ממומשת`;
    }

    res.json({ success: true, result });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/employee-chatbot/quick-actions', async (req: any, res: any) => {
  res.json({
    quickActions: [
      { label: 'כמה ימי חופשה נותרו לי?', icon: 'Calendar' },
      { label: 'מה המלאי הנוכחי?', icon: 'Package' },
      { label: 'הזמנות רכש פתוחות', icon: 'ClipboardList' },
      { label: 'רשימת ספקים פעילים', icon: 'Truck' },
      { label: 'לקוחות הגדולים ביותר', icon: 'Users' },
      { label: 'מה הסטטוס של הייצור?', icon: 'Factory' },
    ],
  });
});

export default router;
