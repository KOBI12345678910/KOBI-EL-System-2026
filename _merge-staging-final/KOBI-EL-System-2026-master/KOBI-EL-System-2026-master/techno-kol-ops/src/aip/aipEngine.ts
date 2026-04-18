// ════════════════════════════════════════════════════════════
//
//   TECHNO-KOL AIP — AI Platform
//   שאל שאלות על המפעל בשפה טבעית
//   קבל תשובות מהנתונים האמיתיים
//
// ════════════════════════════════════════════════════════════

import { query } from '../db/connection';
import { ontologyEngine, ObjectType } from '../ontology/ontologyEngine';

interface AIPQuery {
  question: string;
  context?: Record<string, any>;
  user_id?: string;
}

interface AIPResponse {
  answer: string;
  data: any;
  sql_used?: string;
  confidence: number;
  suggestions: string[];
  visualization?: {
    type: 'table' | 'chart' | 'metric' | 'list' | 'map';
    config: any;
  };
}

// מפת כוונות לשאילתות SQL
const INTENT_PATTERNS: {
  pattern: RegExp;
  intent: string;
  handler: (matches: RegExpMatchArray, ctx?: any) => Promise<AIPResponse>;
}[] = [];

export const aipEngine = {

  async query(input: AIPQuery): Promise<AIPResponse> {
    const q = input.question.toLowerCase().trim();

    // שמור לוג
    await query(`
      INSERT INTO aip_queries (question, user_id, created_at)
      VALUES ($1, $2, NOW())
    `, [input.question, input.user_id || null]).catch(() => {});

    // נסה לזהות כוונה
    const response = await this.detectAndExecute(q, input.context);

    return response;
  },

  async detectAndExecute(q: string, ctx?: any): Promise<AIPResponse> {

    // ── כמה הכנסות החודש
    if (this.matches(q, ['הכנסות', 'מכירות', 'revenue', 'כסף נכנס'])) {
      return this.answerRevenue(q);
    }

    // ── סטטוס הזמנה
    if (this.matches(q, ['הזמנה', 'order', 'tk-', 'אחוז'])) {
      return this.answerOrderStatus(q);
    }

    // ── מלאי
    if (this.matches(q, ['מלאי', 'חומר', 'מחסן', 'נגמר', 'חסר'])) {
      return this.answerInventory(q);
    }

    // ── עובדים
    if (this.matches(q, ['עובד', 'נוכח', 'חולה', 'שטח', 'איפה'])) {
      return this.answerWorkforce(q);
    }

    // ── לקוחות
    if (this.matches(q, ['לקוח', 'client', 'הכי גדול', 'הכי רווחי'])) {
      return this.answerClients(q);
    }

    // ── פרוייקטים
    if (this.matches(q, ['פרוייקט', 'שרשרת', 'שלב', 'התקנה'])) {
      return this.answerProjects(q);
    }

    // ── חיזוי
    if (this.matches(q, ['תחזית', 'צפי', 'חודש הבא', 'לשנה הבאה'])) {
      return this.answerForecast(q);
    }

    // ── ביצועי עובד
    if (this.matches(q, ['ביצוע', 'roi', 'פרודוקטיב', 'הכי טוב'])) {
      return this.answerPerformance(q);
    }

    // ── סיכונים
    if (this.matches(q, ['סיכון', 'בעיה', 'alert', 'התראה'])) {
      return this.answerRisks(q);
    }

    // ── שאלה כללית
    return this.answerGeneral(q);
  },

  matches(q: string, keywords: string[]): boolean {
    return keywords.some(k => q.includes(k));
  },

  // ── הכנסות
  async answerRevenue(q: string): Promise<AIPResponse> {
    const isYTD = q.includes('שנה') || q.includes('ytd');
    const isLastMonth = q.includes('חודש שעבר') || q.includes('קודם');

    let period = `date_trunc('month', CURRENT_DATE)`;
    let label = 'חודש נוכחי';

    if (isYTD) { period = `date_trunc('year', CURRENT_DATE)`; label = 'שנה נוכחית'; }
    if (isLastMonth) {
      period = `date_trunc('month', CURRENT_DATE - INTERVAL '1 month')`;
      label = 'חודש שעבר';
    }

    const { rows } = await query(`
      SELECT
        COALESCE(SUM(amount) FILTER (WHERE type IN ('income','advance') AND is_paid=true), 0) as revenue,
        COALESCE(SUM(amount) FILTER (WHERE type IN ('expense','salary','material_cost')), 0) as costs,
        COUNT(DISTINCT order_id) FILTER (WHERE type IN ('income','advance')) as deals,
        AVG(amount) FILTER (WHERE type='income' AND is_paid=true) as avg_deal
      FROM financial_transactions
      WHERE date >= ${period}
    `);

    const r = rows[0];
    const revenue = Math.round(parseFloat(r.revenue));
    const costs = Math.round(parseFloat(r.costs));
    const margin = revenue > 0 ? Math.round((revenue - costs) / revenue * 100) : 0;

    return {
      answer: `הכנסות ${label}: ₪${revenue.toLocaleString('he-IL')}\nעלויות: ₪${costs.toLocaleString('he-IL')}\nרווח גולמי: ${margin}%\nעסקאות: ${r.deals}`,
      data: { revenue, costs, margin, deals: r.deals, avg_deal: Math.round(parseFloat(r.avg_deal || '0')) },
      confidence: 98,
      suggestions: [
        'מה הלקוח הגדול ביותר החודש?',
        'מה ההשוואה לחודש שעבר?',
        'מה תחזית ההכנסות לחודש הבא?'
      ],
      visualization: {
        type: 'metric',
        config: {
          primary: { label: 'הכנסות', value: `₪${revenue.toLocaleString('he-IL')}` },
          secondary: [
            { label: 'עלויות', value: `₪${costs.toLocaleString('he-IL')}` },
            { label: 'מרג\'ין', value: `${margin}%` }
          ]
        }
      }
    };
  },

  // ── סטטוס הזמנות
  async answerOrderStatus(q: string): Promise<AIPResponse> {
    const orderMatch = q.match(/tk[-\s]?(\d+)/i);

    if (orderMatch) {
      const orderId = `TK-${orderMatch[1]}`;
      const { rows } = await query(`
        SELECT wo.*, c.name as client_name
        FROM work_orders wo JOIN clients c ON wo.client_id=c.id
        WHERE wo.id ILIKE $1
      `, [`%${orderMatch[1]}%`]);

      if (rows[0]) {
        const o = rows[0];
        const daysLeft = Math.ceil((new Date(o.delivery_date).getTime() - Date.now()) / 86400000);
        return {
          answer: `הזמנה ${o.id}\nלקוח: ${o.client_name}\nמוצר: ${o.product}\nהתקדמות: ${o.progress}%\nסטטוס: ${o.status}\nאספקה: ${new Date(o.delivery_date).toLocaleDateString('he-IL')} (${daysLeft > 0 ? `עוד ${daysLeft} ימים` : `${Math.abs(daysLeft)} ימים איחור`})\nשווי: ₪${parseFloat(o.price).toLocaleString('he-IL')}`,
          data: o,
          confidence: 99,
          suggestions: [`מי עובד על ${o.id}?`, `כמה עלתה ייצור ${o.id}?`],
          visualization: { type: 'metric', config: { progress: o.progress, status: o.status } }
        };
      }
    }

    // סטטוס כללי
    const { rows } = await query(`
      SELECT status, COUNT(*) as count, SUM(price) as value
      FROM work_orders WHERE status NOT IN ('delivered','cancelled')
      GROUP BY status ORDER BY count DESC
    `);

    const overdue = rows.filter((r: any) => r.status === 'overdue').length;
    const total = rows.reduce((s: any, r: any) => s + parseInt(r.count), 0);

    return {
      answer: `סטטוס הזמנות:\n${rows.map((r: any) => `${r.status}: ${r.count} הזמנות (₪${Math.round(parseFloat(r.value || '0')).toLocaleString('he-IL')})`).join('\n')}\n\nסה"כ: ${total} הזמנות פעילות`,
      data: rows,
      confidence: 95,
      suggestions: ['איזו הזמנה הכי מאוחרת?', 'מה ניצולת המפעל?'],
      visualization: { type: 'table', config: { rows } }
    };
  },

  // ── מלאי
  async answerInventory(q: string): Promise<AIPResponse> {
    const isCritical = q.includes('נגמר') || q.includes('חסר') || q.includes('קריטי');

    let sql = `
      SELECT mi.name, mi.qty, mi.unit, mi.min_threshold, mi.cost_per_unit,
        s.name as supplier_name,
        CASE WHEN mi.qty <= mi.min_threshold*0.3 THEN 'קריטי'
             WHEN mi.qty <= mi.min_threshold THEN 'נמוך'
             ELSE 'תקין' END as status
      FROM material_items mi
      LEFT JOIN suppliers s ON mi.supplier_id=s.id
      WHERE mi.is_active=true
    `;

    if (isCritical) sql += ` AND mi.qty <= mi.min_threshold`;
    sql += ` ORDER BY (mi.qty/NULLIF(mi.min_threshold,0)) ASC LIMIT 15`;

    const { rows } = await query(sql);
    const critical = rows.filter((r: any) => r.status === 'קריטי').length;
    const low = rows.filter((r: any) => r.status === 'נמוך').length;

    return {
      answer: isCritical
        ? `${rows.length} פריטים מתחת לסף מינימום:\n${rows.slice(0,5).map((r: any) => `• ${r.name}: ${r.qty} ${r.unit} (${r.status})`).join('\n')}`
        : `מצב מלאי:\n• קריטי: ${critical} פריטים\n• נמוך: ${low} פריטים\n• תקין: ${rows.length - critical - low} פריטים`,
      data: rows,
      confidence: 97,
      suggestions: ['מה עלות המלאי הכולל?', 'מתי להזמין ברזל?', 'איזה ספק הכי זול?'],
      visualization: { type: 'table', config: { rows } }
    };
  },

  // ── עובדים
  async answerWorkforce(q: string): Promise<AIPResponse> {
    const isLocation = q.includes('איפה') || q.includes('מיקום');
    const isSick = q.includes('חולה') || q.includes('נעדר');

    const { rows } = await query(`
      SELECT e.name, e.role, e.department,
        COALESCE(a.location, 'לא ידוע') as location,
        a.check_in,
        ecl.lat, ecl.lng, ecl.last_seen, ecl.battery_level
      FROM employees e
      LEFT JOIN attendance a ON e.id=a.employee_id AND a.date=CURRENT_DATE
      LEFT JOIN employee_current_location ecl ON e.id=ecl.employee_id
      WHERE e.is_active=true
      ORDER BY e.department, e.name
    `);

    const inFactory = rows.filter((r: any) => r.location === 'factory').length;
    const inField = rows.filter((r: any) => r.location === 'field').length;
    const sick = rows.filter((r: any) => r.location === 'sick').length;
    const absent = rows.filter((r: any) => ['absent', 'vacation'].includes(r.location)).length;

    if (isLocation) {
      const fieldWorkers = rows.filter((r: any) => r.location === 'field');
      return {
        answer: `עובדים בשטח עכשיו (${fieldWorkers.length}):\n${fieldWorkers.map((r: any) => `• ${r.name} — ${r.role}`).join('\n')}`,
        data: fieldWorkers,
        confidence: 95,
        suggestions: ['מה המשימה של כל אחד?', 'הצג על מפה'],
        visualization: { type: 'map', config: { workers: fieldWorkers } }
      };
    }

    return {
      answer: `נוכחות היום (${rows.length} עובדים):\n• במפעל: ${inFactory}\n• שטח: ${inField}\n• חולה: ${sick}\n• נעדר/חופש: ${absent}`,
      data: { inFactory, inField, sick, absent, workers: rows },
      confidence: 95,
      suggestions: ['מי בשטח?', 'כמה שעות עבד X החודש?'],
      visualization: { type: 'metric', config: { present: inFactory + inField, total: rows.length } }
    };
  },

  // ── לקוחות
  async answerClients(q: string): Promise<AIPResponse> {
    const isTop = q.includes('גדול') || q.includes('רווחי') || q.includes('top');

    const { rows } = await query(`
      SELECT c.name, c.type,
        COUNT(wo.id) as orders,
        SUM(wo.price) as revenue,
        MAX(wo.open_date) as last_order,
        EXTRACT(DAY FROM NOW()-MAX(wo.open_date)) as days_since_last
      FROM clients c
      LEFT JOIN work_orders wo ON c.id=wo.client_id
      WHERE c.is_active=true
      GROUP BY c.id, c.name, c.type
      HAVING SUM(wo.price) > 0
      ORDER BY revenue DESC LIMIT 10
    `);

    return {
      answer: `10 לקוחות מובילים:\n${rows.slice(0,5).map((r: any, i: number) =>
        `${i+1}. ${r.name}: ₪${Math.round(parseFloat(r.revenue)).toLocaleString('he-IL')} | ${r.orders} הזמנות`
      ).join('\n')}`,
      data: rows,
      confidence: 97,
      suggestions: ['מי לא הזמין מעל 60 יום?', 'מה ממוצע עסקה ללקוח?'],
      visualization: { type: 'table', config: { rows } }
    };
  },

  // ── פרוייקטים
  async answerProjects(q: string): Promise<AIPResponse> {
    const { rows } = await query(`
      SELECT p.project_number, p.title, p.current_stage,
        p.total_price, p.balance_due, c.name as client_name,
        EXTRACT(DAY FROM NOW()-p.created_at) as days_open
      FROM projects p JOIN clients c ON p.client_id=c.id
      WHERE p.current_stage != 'project_closed'
      ORDER BY p.created_at DESC LIMIT 10
    `);

    return {
      answer: `פרוייקטים פעילים (${rows.length}):\n${rows.slice(0,5).map((r: any) =>
        `• ${r.project_number} | ${r.title}\n  שלב: ${r.current_stage?.replace(/_/g,' ')} | יתרה: ₪${Math.round(parseFloat(r.balance_due)).toLocaleString('he-IL')}`
      ).join('\n')}`,
      data: rows,
      confidence: 95,
      suggestions: ['מה הפרוייקט הכי תקוע?', 'כמה כסף מחכה לגבייה?'],
      visualization: { type: 'list', config: { items: rows } }
    };
  },

  // ── תחזית
  async answerForecast(q: string): Promise<AIPResponse> {
    const { rows } = await query(`
      SELECT DATE_TRUNC('month', date) as month,
        SUM(amount) FILTER (WHERE type IN ('income','advance') AND is_paid=true) as revenue
      FROM financial_transactions
      WHERE date > NOW()-INTERVAL '6 months'
      GROUP BY DATE_TRUNC('month', date)
      ORDER BY month ASC
    `);

    const revenues = rows.map((r: any) => parseFloat(r.revenue || '0'));
    const avg = revenues.reduce((a, b) => a + b, 0) / Math.max(revenues.length, 1);
    const trend = revenues.length >= 2
      ? (revenues[revenues.length-1] - revenues[0]) / revenues.length * 0.3
      : 0;
    const forecast = Math.round((avg + trend) / 1000) * 1000;

    return {
      answer: `תחזית חודש הבא: ₪${forecast.toLocaleString('he-IL')}\nבהתבסס על ממוצע 6 חודשים: ₪${Math.round(avg).toLocaleString('he-IL')}\nמגמה: ${trend > 0 ? '↑' : '↓'} ${Math.abs(Math.round(trend)).toLocaleString('he-IL')}`,
      data: { forecast, historical: rows, trend },
      confidence: 72,
      suggestions: ['מה תחזית 3 חודשים?', 'מה יעד החודש?'],
      visualization: { type: 'chart', config: { data: rows, forecast } }
    };
  },

  // ── ביצועים
  async answerPerformance(q: string): Promise<AIPResponse> {
    const { rows } = await query(`
      SELECT e.name, e.role,
        COUNT(t.id) FILTER (WHERE t.status='done'
          AND t.created_at > NOW()-INTERVAL '30 days') as tasks_done,
        COUNT(t.id) FILTER (WHERE t.status='done'
          AND t.completed_at <= t.scheduled_date::TIMESTAMP+INTERVAL '2 hours'
          AND t.created_at > NOW()-INTERVAL '30 days') as on_time,
        COUNT(t.id) FILTER (WHERE t.status='done'
          AND t.created_at > NOW()-INTERVAL '30 days') * 100.0 /
          NULLIF(COUNT(t.id) FILTER (WHERE t.created_at > NOW()-INTERVAL '30 days'), 0) as completion_rate
      FROM employees e
      LEFT JOIN tasks t ON e.id=t.employee_id
      WHERE e.is_active=true
      GROUP BY e.id, e.name, e.role
      ORDER BY tasks_done DESC
    `);

    return {
      answer: `ביצועי עובדים (30 יום):\n${rows.slice(0,5).map((r: any) =>
        `${r.name}: ${r.tasks_done} משימות | ${Math.round(parseFloat(r.completion_rate||'0'))}% השלמה`
      ).join('\n')}`,
      data: rows,
      confidence: 90,
      suggestions: ['מי צריך שיחת שיפור?', 'מי מגיע לבונוס?'],
      visualization: { type: 'table', config: { rows } }
    };
  },

  // ── סיכונים
  async answerRisks(q: string): Promise<AIPResponse> {
    const { rows } = await query(`
      SELECT type, severity, title, message, created_at
      FROM alerts WHERE is_resolved=false
      ORDER BY CASE severity
        WHEN 'critical' THEN 1 WHEN 'danger' THEN 2
        WHEN 'warning' THEN 3 ELSE 4 END,
        created_at DESC LIMIT 10
    `);

    const critical = rows.filter((r: any) => r.severity === 'critical').length;

    return {
      answer: `${rows.length} התראות פתוחות:\n• קריטי: ${critical}\n\nדחופות ביותר:\n${rows.slice(0,3).map((r: any) => `⚠ ${r.title}`).join('\n')}`,
      data: rows,
      confidence: 99,
      suggestions: ['פרט על ההתראה הקריטית', 'מה הפתרון המוצע?'],
      visualization: { type: 'list', config: { items: rows } }
    };
  },

  // ── שאלה כללית
  async answerGeneral(q: string): Promise<AIPResponse> {
    const snapshot = await ontologyEngine.getDigitalTwin();

    return {
      answer: `מצב המפעל עכשיו:\n• הזמנות פעילות: ${snapshot.production.active_orders}\n• ניצולת: ${snapshot.production.capacity_utilization}%\n• הכנסות החודש: ₪${snapshot.finance.revenue_mtd.toLocaleString('he-IL')}\n• מרג'ין: ${snapshot.finance.gross_margin}%\n• חומרים קריטיים: ${snapshot.supply_chain.critical_materials}`,
      data: snapshot,
      confidence: 85,
      suggestions: [
        'כמה הרווחנו החודש?',
        'מה מצב המלאי?',
        'איזה הזמנות מאוחרות?',
        'מי בשטח עכשיו?',
        'מה תחזית החודש הבא?'
      ],
      visualization: { type: 'metric', config: snapshot }
    };
  }
};
