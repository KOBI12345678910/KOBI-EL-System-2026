// ============================================================
// מנוע פיננסי בזמן אמת - TechnoKoluzi ERP
// מצב פיננסי של החברה, התחייבויות, חייבים, תזרים מזומנים
// מותאם למפעל מתכת עם ~200 עובדים, 50 פרויקטים, מחזור ~2M ש"ח/חודש
// ============================================================

import { Router, Request, Response } from "express";
import { pool } from "@workspace/db";
import { CORPORATE_TAX_RATE } from "../constants";

const router = Router();

// ============================================================
// יצירת טבלאות + זריעת נתונים ריאליסטיים
// ============================================================
router.post("/init", async (_req: Request, res: Response) => {
  try {
    // טבלת תמונת מצב יומית
    await pool.query(`
      CREATE TABLE IF NOT EXISTS company_daily_snapshot (
        id SERIAL PRIMARY KEY,
        snapshot_date DATE UNIQUE NOT NULL,
        total_revenue NUMERIC(15,2) DEFAULT 0,
        total_expenses NUMERIC(15,2) DEFAULT 0,
        gross_profit NUMERIC(15,2) DEFAULT 0,
        gross_margin_pct NUMERIC(5,2) DEFAULT 0,
        operating_expenses NUMERIC(15,2) DEFAULT 0,
        operating_profit NUMERIC(15,2) DEFAULT 0,
        net_profit NUMERIC(15,2) DEFAULT 0,
        cash_balance NUMERIC(15,2) DEFAULT 0,
        accounts_receivable NUMERIC(15,2) DEFAULT 0,
        accounts_payable NUMERIC(15,2) DEFAULT 0,
        inventory_value NUMERIC(15,2) DEFAULT 0,
        total_assets NUMERIC(15,2) DEFAULT 0,
        total_liabilities NUMERIC(15,2) DEFAULT 0,
        equity NUMERIC(15,2) DEFAULT 0,
        projects_in_pipeline NUMERIC(15,2) DEFAULT 0,
        deals_closed_today INTEGER DEFAULT 0,
        deals_amount_today NUMERIC(15,2) DEFAULT 0,
        employees_count INTEGER DEFAULT 0,
        payroll_this_month NUMERIC(15,2) DEFAULT 0,
        tax_liability NUMERIC(15,2) DEFAULT 0,
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // טבלת התחייבויות - למי החברה חייבת
    await pool.query(`
      CREATE TABLE IF NOT EXISTS company_obligations (
        id SERIAL PRIMARY KEY,
        obligation_type VARCHAR(50) NOT NULL,
        creditor_name VARCHAR(255) NOT NULL,
        description TEXT,
        description_he TEXT,
        total_amount NUMERIC(15,2) NOT NULL,
        paid_amount NUMERIC(15,2) DEFAULT 0,
        remaining_amount NUMERIC(15,2) NOT NULL,
        due_date DATE,
        payment_schedule JSONB DEFAULT '[]',
        priority VARCHAR(20) DEFAULT 'normal',
        category VARCHAR(50),
        status VARCHAR(20) DEFAULT 'active',
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // טבלת חייבים - מי חייב לחברה
    await pool.query(`
      CREATE TABLE IF NOT EXISTS company_receivables (
        id SERIAL PRIMARY KEY,
        debtor_type VARCHAR(50) NOT NULL,
        debtor_name VARCHAR(255) NOT NULL,
        description TEXT,
        description_he TEXT,
        total_amount NUMERIC(15,2) NOT NULL,
        received_amount NUMERIC(15,2) DEFAULT 0,
        remaining_amount NUMERIC(15,2) NOT NULL,
        due_date DATE,
        invoice_number VARCHAR(50),
        project_id INTEGER,
        risk_level VARCHAR(20) DEFAULT 'low',
        days_overdue INTEGER DEFAULT 0,
        collection_status VARCHAR(30) DEFAULT 'current',
        last_reminder DATE,
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // אינדקסים
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_snapshot_date ON company_daily_snapshot(snapshot_date)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_obligations_due_date ON company_obligations(due_date)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_obligations_status ON company_obligations(status)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_obligations_type ON company_obligations(obligation_type)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_receivables_due_date ON company_receivables(due_date)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_receivables_status ON company_receivables(collection_status)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_receivables_debtor ON company_receivables(debtor_name)`);

    // ============================
    // זריעת נתונים ריאליסטיים למפעל מתכת
    // ============================

    // בדיקה האם כבר יש נתונים
    const existingObligations = await pool.query(`SELECT COUNT(*) FROM company_obligations`);
    if (parseInt(existingObligations.rows[0].count) === 0) {

      // התחייבויות - ספקים
      await pool.query(`
        INSERT INTO company_obligations (obligation_type, creditor_name, description, description_he, total_amount, paid_amount, remaining_amount, due_date, priority, category, status) VALUES
        ('supplier', 'פלדות ישראל בע"מ', 'Steel sheets and beams Q1', 'פלדות וקורות רבעון 1', 485000, 200000, 285000, '2026-04-10', 'high', 'חומרי גלם', 'active'),
        ('supplier', 'אלומיניום הגליל', 'Aluminum profiles monthly', 'פרופילי אלומיניום חודשי', 178000, 0, 178000, '2026-04-05', 'high', 'חומרי גלם', 'active'),
        ('supplier', 'ברגים ומחברים תעשייתי', 'Fasteners and hardware', 'ברגים וחומרי חיבור', 42000, 15000, 27000, '2026-04-15', 'normal', 'חומרי גלם', 'active'),
        ('supplier', 'צבעים ואנטי-קורוזיה בע"מ', 'Coating and paint supplies', 'ציפוי וצבע תעשייתי', 67000, 67000, 0, '2026-03-30', 'normal', 'חומרי גלם', 'paid'),
        ('supplier', 'כלי חיתוך מדויק', 'CNC cutting tools', 'כלי חיתוך CNC', 93000, 30000, 63000, '2026-04-20', 'normal', 'כלים וציוד', 'active'),
        ('supplier', 'גז תעשייתי ישראל', 'Welding gas supply', 'גז ריתוך חודשי', 28500, 0, 28500, '2026-04-01', 'normal', 'מתכלים', 'active'),
        ('supplier', 'חשמל ואנרגיה תעשייתי', 'Electrical components', 'רכיבי חשמל', 55000, 20000, 35000, '2026-04-12', 'normal', 'חומרי גלם', 'active'),
        -- מיסים והתחייבויות ממשלתיות
        ('tax_vat', 'רשות המיסים - מע"מ', 'VAT payment March 2026', 'תשלום מע"מ מרץ 2026', 312000, 0, 312000, '2026-04-15', 'critical', 'מיסים', 'active'),
        ('tax_income', 'רשות המיסים - מס הכנסה', 'Corporate income tax Q1', 'מס הכנסה רבעון 1', 185000, 0, 185000, '2026-04-30', 'critical', 'מיסים', 'active'),
        ('tax_national_insurance', 'ביטוח לאומי', 'National insurance March', 'ביטוח לאומי מרץ 2026', 245000, 0, 245000, '2026-04-15', 'critical', 'מיסים', 'active'),
        -- משכורות
        ('salary', 'משכורות עובדים', 'March 2026 payroll - 200 employees', 'משכורות מרץ 2026 - 200 עובדים', 1850000, 0, 1850000, '2026-04-09', 'critical', 'שכר', 'active'),
        ('salary', 'הפרשות פנסיה וקופות', 'Pension and savings funds March', 'הפרשות פנסיה וגמל מרץ', 280000, 0, 280000, '2026-04-15', 'critical', 'שכר', 'active'),
        -- קבלני משנה
        ('contractor', 'הובלות שמש בע"מ', 'Delivery and logistics', 'שירותי הובלה ולוגיסטיקה', 85000, 40000, 45000, '2026-04-10', 'normal', 'שירותים', 'active'),
        ('contractor', 'שירותי ניקיון תעשייתי', 'Factory cleaning services', 'שירותי ניקיון מפעל', 18000, 0, 18000, '2026-04-05', 'low', 'שירותים', 'active'),
        ('contractor', 'אבטחה מקצועית', 'Security services monthly', 'שירותי אבטחה חודשי', 32000, 0, 32000, '2026-04-01', 'normal', 'שירותים', 'active'),
        -- הלוואות
        ('loan', 'בנק לאומי', 'Equipment loan - monthly payment', 'הלוואת ציוד - תשלום חודשי', 125000, 0, 125000, '2026-04-01', 'high', 'הלוואות', 'active'),
        ('loan', 'בנק הפועלים', 'Working capital credit line', 'מסגרת אשראי הון חוזר', 200000, 50000, 150000, '2026-04-15', 'high', 'הלוואות', 'active'),
        -- שכירות וביטוח
        ('rent', 'נכסי עזריאלי תעשייה', 'Factory rent monthly', 'שכירות מפעל חודשית', 95000, 0, 95000, '2026-04-01', 'high', 'שכירות', 'active'),
        ('insurance', 'הראל ביטוח', 'Factory and liability insurance', 'ביטוח מפעל ואחריות', 45000, 0, 45000, '2026-04-10', 'normal', 'ביטוח', 'active'),
        -- חשמל ומים
        ('utilities', 'חברת חשמל', 'Electricity March', 'חשמל מרץ 2026', 120000, 0, 120000, '2026-04-20', 'normal', 'שוטף', 'active'),
        ('utilities', 'מקורות', 'Water supply March', 'מים מרץ 2026', 15000, 0, 15000, '2026-04-15', 'low', 'שוטף', 'active'),
        -- ליסינג ציוד
        ('equipment_lease', 'ליסינג ישיר', 'CNC machines lease', 'ליסינג מכונות CNC', 68000, 0, 68000, '2026-04-01', 'high', 'ליסינג', 'active')
      `);

      // חייבים - מי חייב לחברה
      await pool.query(`
        INSERT INTO company_receivables (debtor_type, debtor_name, description, description_he, total_amount, received_amount, remaining_amount, due_date, invoice_number, project_id, risk_level, days_overdue, collection_status) VALUES
        -- לקוחות פעילים - פרויקטים גדולים
        ('customer', 'אלביט מערכות', 'Metal frames for defense project', 'שלדות מתכת לפרויקט ביטחוני', 520000, 260000, 260000, '2026-04-15', 'INV-2026-0342', 101, 'low', 0, 'current'),
        ('customer', 'רפאל מערכות לחימה', 'Precision components batch 3', 'רכיבי דיוק אצווה 3', 380000, 0, 380000, '2026-04-20', 'INV-2026-0355', 102, 'low', 0, 'current'),
        ('customer', 'תעשיות אווירית', 'Aircraft structural parts', 'חלקי מבנה למטוסים', 445000, 200000, 245000, '2026-04-10', 'INV-2026-0338', 103, 'low', 0, 'current'),
        ('customer', 'מגדל אור בנייה', 'Steel structure - Herzliya tower', 'שלד פלדה - מגדל הרצליה', 890000, 450000, 440000, '2026-05-01', 'INV-2026-0301', 104, 'low', 0, 'current'),
        ('customer', 'סולל בונה', 'Rebar and structural steel', 'ברזל זיון ופלדת מבנה', 310000, 100000, 210000, '2026-03-25', 'INV-2026-0289', 105, 'medium', 0, 'current'),
        ('customer', 'אשדר בניה', 'Metal facades - Ashdod project', 'חזיתות מתכת - פרויקט אשדוד', 275000, 0, 275000, '2026-04-30', 'INV-2026-0361', 106, 'low', 0, 'current'),
        -- לקוחות עם איחור תשלום
        ('customer', 'בניין ירוק בע"מ', 'Green building steel works', 'עבודות פלדה בנייה ירוקה', 185000, 50000, 135000, '2026-02-28', 'INV-2026-0245', 107, 'medium', 25, 'reminder_sent'),
        ('customer', 'גלובל סטיל טריידינג', 'Steel export order', 'הזמנת ייצוא פלדה', 230000, 0, 230000, '2026-02-15', 'INV-2026-0221', 108, 'high', 38, 'overdue_30'),
        ('customer', 'קונסטרוקציות הדרום', 'Southern plant construction', 'בניית מפעל בדרום', 156000, 60000, 96000, '2026-01-31', 'INV-2026-0198', 109, 'high', 53, 'overdue_60'),
        ('customer', 'מתכת אום אל פחם', 'Metal workshop equipment', 'ציוד לבית מלאכה מתכת', 78000, 0, 78000, '2025-12-20', 'INV-2025-1876', 110, 'critical', 95, 'overdue_90'),
        -- לקוחות נוספים - תשלום שוטף
        ('customer', 'אורדן תעשיות', 'Metal cabinets and enclosures', 'ארונות מתכת ומארזים', 145000, 70000, 75000, '2026-04-05', 'INV-2026-0347', 111, 'low', 0, 'current'),
        ('customer', 'טמבור תעשיות', 'Storage systems manufacturing', 'ייצור מערכות אחסון', 198000, 100000, 98000, '2026-04-10', 'INV-2026-0333', 112, 'low', 0, 'current'),
        ('customer', 'עיריית תל אביב', 'Street furniture project', 'פרויקט ריהוט רחוב', 340000, 170000, 170000, '2026-04-25', 'INV-2026-0358', 113, 'low', 0, 'current'),
        ('customer', 'מפעלי ים המלח', 'Industrial tanks renovation', 'שיפוץ מכלים תעשייתיים', 267000, 130000, 137000, '2026-04-18', 'INV-2026-0352', 114, 'low', 0, 'current'),
        ('customer', 'חברת נמלי ישראל', 'Port crane components', 'רכיבי עגורן נמל', 412000, 200000, 212000, '2026-05-10', 'INV-2026-0367', 115, 'low', 0, 'current')
      `);

      // תמונת מצב יומית נוכחית
      const today = new Date().toISOString().split("T")[0];
      await pool.query(`
        INSERT INTO company_daily_snapshot (
          snapshot_date, total_revenue, total_expenses, gross_profit, gross_margin_pct,
          operating_expenses, operating_profit, net_profit,
          cash_balance, accounts_receivable, accounts_payable, inventory_value,
          total_assets, total_liabilities, equity,
          projects_in_pipeline, deals_closed_today, deals_amount_today,
          employees_count, payroll_this_month, tax_liability, notes
        ) VALUES (
          $1, 2150000, 1680000, 470000, 21.86,
          385000, 85000, 68000,
          1250000, 3231000, 3623500, 890000,
          8750000, 4200000, 4550000,
          4500000, 2, 185000,
          200, 1850000, 742000, 'תמונת מצב ראשונית - מפעל מתכת טכנוקולוזי'
        )
        ON CONFLICT (snapshot_date) DO NOTHING
      `, [today]);
    }

    res.json({
      success: true,
      message: "טבלאות פיננסיות נוצרו ונתוני מפעל מתכת נזרעו בהצלחה",
      tables: ["company_daily_snapshot", "company_obligations", "company_receivables"],
      seeded: {
        obligations: 22,
        receivables: 15,
        snapshots: 1,
        description: "מפעל מתכת, ~200 עובדים, 50 פרויקטים, מחזור ~2M ש\"ח/חודש"
      }
    });
  } catch (error: any) {
    console.error("שגיאה באתחול מנוע פיננסי:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// מצב פיננסי נוכחי - כמה יש, כמה חייבים, כמה חייבים לנו
// ============================================================
router.get("/now", async (_req: Request, res: Response) => {
  try {
    // תמונת מצב אחרונה
    const snapshot = await pool.query(
      `SELECT * FROM company_daily_snapshot ORDER BY snapshot_date DESC LIMIT 1`
    );

    // סה"כ התחייבויות פעילות
    const obligations = await pool.query(`
      SELECT
        COUNT(*) as total_obligations,
        COALESCE(SUM(remaining_amount), 0) as total_owed,
        COALESCE(SUM(remaining_amount) FILTER (WHERE priority = 'critical'), 0) as critical_owed,
        COALESCE(SUM(remaining_amount) FILTER (WHERE due_date <= CURRENT_DATE + INTERVAL '7 days'), 0) as due_this_week,
        COALESCE(SUM(remaining_amount) FILTER (WHERE due_date <= CURRENT_DATE), 0) as overdue
      FROM company_obligations
      WHERE status = 'active' AND remaining_amount > 0
    `);

    // סה"כ חייבים
    const receivables = await pool.query(`
      SELECT
        COUNT(*) as total_receivables,
        COALESCE(SUM(remaining_amount), 0) as total_owed_to_us,
        COALESCE(SUM(remaining_amount) FILTER (WHERE collection_status = 'current'), 0) as current_receivables,
        COALESCE(SUM(remaining_amount) FILTER (WHERE days_overdue > 0), 0) as overdue_receivables,
        COALESCE(SUM(remaining_amount) FILTER (WHERE risk_level IN ('high', 'critical')), 0) as high_risk_amount
      FROM company_receivables
      WHERE remaining_amount > 0
    `);

    const snap = snapshot.rows[0] || {};
    const obl = obligations.rows[0];
    const rec = receivables.rows[0];

    // חישוב מצב נטו
    const cashBalance = parseFloat(snap.cash_balance || 0);
    const owedToUs = parseFloat(rec.total_owed_to_us || 0);
    const weOwe = parseFloat(obl.total_owed || 0);
    const netPosition = cashBalance + owedToUs - weOwe;

    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      financial_position: {
        cash_balance: cashBalance,
        accounts_receivable: owedToUs,
        accounts_payable: weOwe,
        net_position: netPosition,
        net_positive: netPosition > 0,
        liquidity_ratio: weOwe > 0 ? Math.round(((cashBalance + owedToUs) / weOwe) * 100) / 100 : null
      },
      obligations_summary: obl,
      receivables_summary: rec,
      latest_snapshot: snap
    });
  } catch (error: any) {
    console.error("שגיאה בשליפת מצב פיננסי:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// רווח יומי - כמה החברה הרוויחה היום
// ============================================================
router.get("/daily-profit", async (_req: Request, res: Response) => {
  try {
    const today = new Date().toISOString().split("T")[0];

    const snapshot = await pool.query(
      `SELECT * FROM company_daily_snapshot WHERE snapshot_date = $1`,
      [today]
    );

    if (snapshot.rows.length === 0) {
      return res.json({
        success: true,
        date: today,
        message: "אין תמונת מצב להיום - יש ליצור snapshot",
        daily_profit: null
      });
    }

    const snap = snapshot.rows[0];
    res.json({
      success: true,
      date: today,
      revenue: parseFloat(snap.total_revenue),
      expenses: parseFloat(snap.total_expenses),
      gross_profit: parseFloat(snap.gross_profit),
      gross_margin_pct: parseFloat(snap.gross_margin_pct),
      operating_profit: parseFloat(snap.operating_profit),
      net_profit: parseFloat(snap.net_profit),
      deals_closed: snap.deals_closed_today,
      deals_amount: parseFloat(snap.deals_amount_today)
    });
  } catch (error: any) {
    console.error("שגיאה בשליפת רווח יומי:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// דוח רווח והפסד חודשי
// ============================================================
router.get("/monthly-pnl/:month", async (req: Request, res: Response) => {
  try {
    const { month } = req.params; // YYYY-MM
    const startDate = `${month}-01`;
    const endDate = `${month}-31`;

    // סיכום חודשי מתמונות המצב
    const pnl = await pool.query(`
      SELECT
        COUNT(*) as snapshot_days,
        COALESCE(SUM(total_revenue), 0) as monthly_revenue,
        COALESCE(SUM(total_expenses), 0) as monthly_expenses,
        COALESCE(SUM(gross_profit), 0) as monthly_gross_profit,
        COALESCE(AVG(gross_margin_pct), 0) as avg_gross_margin,
        COALESCE(SUM(operating_expenses), 0) as monthly_operating_expenses,
        COALESCE(SUM(operating_profit), 0) as monthly_operating_profit,
        COALESCE(SUM(net_profit), 0) as monthly_net_profit,
        COALESCE(SUM(deals_closed_today), 0) as total_deals_closed,
        COALESCE(SUM(deals_amount_today), 0) as total_deals_amount,
        COALESCE(MAX(cash_balance), 0) as end_cash_balance,
        COALESCE(MAX(payroll_this_month), 0) as payroll,
        COALESCE(MAX(tax_liability), 0) as tax_liability
      FROM company_daily_snapshot
      WHERE snapshot_date BETWEEN $1 AND $2
    `, [startDate, endDate]);

    // התחייבויות שנפרעו בחודש
    const paidObligations = await pool.query(`
      SELECT
        obligation_type,
        COALESCE(SUM(paid_amount), 0) as total_paid
      FROM company_obligations
      WHERE updated_at >= $1::date AND updated_at < ($2::date + INTERVAL '1 day')
      GROUP BY obligation_type
    `, [startDate, endDate]);

    const data = pnl.rows[0];

    res.json({
      success: true,
      month,
      profit_and_loss: {
        revenue: parseFloat(data.monthly_revenue),
        cost_of_goods_sold: parseFloat(data.monthly_expenses),
        gross_profit: parseFloat(data.monthly_gross_profit),
        avg_gross_margin_pct: Math.round(parseFloat(data.avg_gross_margin) * 100) / 100,
        operating_expenses: parseFloat(data.monthly_operating_expenses),
        operating_profit: parseFloat(data.monthly_operating_profit),
        net_profit: parseFloat(data.monthly_net_profit),
        payroll: parseFloat(data.payroll),
        tax_liability: parseFloat(data.tax_liability)
      },
      deals: {
        closed: parseInt(data.total_deals_closed),
        amount: parseFloat(data.total_deals_amount)
      },
      payments_made: paidObligations.rows,
      snapshot_days: parseInt(data.snapshot_days)
    });
  } catch (error: any) {
    console.error("שגיאה בדוח רווח והפסד:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// כל ההתחייבויות - למי אנחנו חייבים, כמה, מתי
// ============================================================
router.get("/obligations", async (req: Request, res: Response) => {
  try {
    const { status, type, category } = req.query;

    let query = `SELECT * FROM company_obligations WHERE 1=1`;
    const params: any[] = [];
    let idx = 1;

    if (status) {
      query += ` AND status = $${idx}`;
      params.push(status);
      idx++;
    } else {
      // ברירת מחדל - רק פעילים
      query += ` AND status = 'active'`;
    }

    if (type) {
      query += ` AND obligation_type = $${idx}`;
      params.push(type);
      idx++;
    }

    if (category) {
      query += ` AND category = $${idx}`;
      params.push(category);
      idx++;
    }

    query += ` ORDER BY due_date ASC, priority DESC`;

    const result = await pool.query(query, params);

    // סיכום לפי סוג
    const summary = await pool.query(`
      SELECT
        obligation_type,
        COUNT(*) as count,
        COALESCE(SUM(remaining_amount), 0) as total_remaining,
        MIN(due_date) as earliest_due
      FROM company_obligations
      WHERE status = 'active' AND remaining_amount > 0
      GROUP BY obligation_type
      ORDER BY total_remaining DESC
    `);

    const totalRemaining = result.rows.reduce((sum: number, r: any) => sum + parseFloat(r.remaining_amount || 0), 0);

    res.json({
      success: true,
      total_obligations: result.rows.length,
      total_remaining_amount: totalRemaining,
      by_type: summary.rows,
      obligations: result.rows
    });
  } catch (error: any) {
    console.error("שגיאה בשליפת התחייבויות:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// התחייבויות שמגיעות בימים הקרובים
// ============================================================
router.get("/obligations/upcoming/:days", async (req: Request, res: Response) => {
  try {
    const days = parseInt(req.params.days) || 30;

    const result = await pool.query(`
      SELECT *,
        due_date - CURRENT_DATE as days_until_due,
        CASE
          WHEN due_date < CURRENT_DATE THEN 'באיחור'
          WHEN due_date = CURRENT_DATE THEN 'היום!'
          WHEN due_date <= CURRENT_DATE + 3 THEN 'דחוף'
          WHEN due_date <= CURRENT_DATE + 7 THEN 'השבוע'
          ELSE 'בקרוב'
        END as urgency_he
      FROM company_obligations
      WHERE status = 'active'
        AND remaining_amount > 0
        AND due_date <= CURRENT_DATE + $1
      ORDER BY due_date ASC
    `, [days]);

    // סיכום לפי דחיפות
    const urgencySummary = await pool.query(`
      SELECT
        CASE
          WHEN due_date < CURRENT_DATE THEN 'overdue'
          WHEN due_date = CURRENT_DATE THEN 'today'
          WHEN due_date <= CURRENT_DATE + 7 THEN 'this_week'
          WHEN due_date <= CURRENT_DATE + 14 THEN 'next_week'
          ELSE 'later'
        END as urgency,
        COUNT(*) as count,
        COALESCE(SUM(remaining_amount), 0) as total_amount
      FROM company_obligations
      WHERE status = 'active' AND remaining_amount > 0 AND due_date <= CURRENT_DATE + $1
      GROUP BY urgency
      ORDER BY total_amount DESC
    `, [days]);

    res.json({
      success: true,
      days_ahead: days,
      total_upcoming: result.rows.length,
      total_amount: result.rows.reduce((s: number, r: any) => s + parseFloat(r.remaining_amount), 0),
      by_urgency: urgencySummary.rows,
      obligations: result.rows
    });
  } catch (error: any) {
    console.error("שגיאה בשליפת התחייבויות קרובות:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// חייבים - מי חייב לנו, כמה, מתי
// ============================================================
router.get("/receivables", async (req: Request, res: Response) => {
  try {
    const { status, risk_level } = req.query;

    let query = `SELECT * FROM company_receivables WHERE remaining_amount > 0`;
    const params: any[] = [];
    let idx = 1;

    if (status) {
      query += ` AND collection_status = $${idx}`;
      params.push(status);
      idx++;
    }

    if (risk_level) {
      query += ` AND risk_level = $${idx}`;
      params.push(risk_level);
      idx++;
    }

    query += ` ORDER BY due_date ASC`;

    const result = await pool.query(query, params);

    // סיכום
    const summary = await pool.query(`
      SELECT
        collection_status,
        COUNT(*) as count,
        COALESCE(SUM(remaining_amount), 0) as total_amount
      FROM company_receivables
      WHERE remaining_amount > 0
      GROUP BY collection_status
      ORDER BY total_amount DESC
    `);

    const totalRemaining = result.rows.reduce((sum: number, r: any) => sum + parseFloat(r.remaining_amount || 0), 0);

    res.json({
      success: true,
      total_receivables: result.rows.length,
      total_remaining_amount: totalRemaining,
      by_status: summary.rows,
      receivables: result.rows
    });
  } catch (error: any) {
    console.error("שגיאה בשליפת חייבים:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// חייבים באיחור - עם ניתוח הזדקנות
// ============================================================
router.get("/receivables/overdue", async (_req: Request, res: Response) => {
  try {
    const result = await pool.query(`
      SELECT *,
        CURRENT_DATE - due_date as actual_days_overdue,
        CASE
          WHEN CURRENT_DATE - due_date <= 30 THEN '1-30 ימים'
          WHEN CURRENT_DATE - due_date <= 60 THEN '31-60 ימים'
          WHEN CURRENT_DATE - due_date <= 90 THEN '61-90 ימים'
          ELSE 'מעל 90 ימים'
        END as aging_bucket_he
      FROM company_receivables
      WHERE remaining_amount > 0 AND due_date < CURRENT_DATE
      ORDER BY days_overdue DESC
    `);

    // ניתוח הזדקנות
    const aging = await pool.query(`
      SELECT
        CASE
          WHEN CURRENT_DATE - due_date <= 30 THEN '1-30'
          WHEN CURRENT_DATE - due_date <= 60 THEN '31-60'
          WHEN CURRENT_DATE - due_date <= 90 THEN '61-90'
          ELSE '90+'
        END as aging_bucket,
        COUNT(*) as count,
        COALESCE(SUM(remaining_amount), 0) as total_amount
      FROM company_receivables
      WHERE remaining_amount > 0 AND due_date < CURRENT_DATE
      GROUP BY aging_bucket
      ORDER BY aging_bucket
    `);

    const totalOverdue = result.rows.reduce((s: number, r: any) => s + parseFloat(r.remaining_amount), 0);

    res.json({
      success: true,
      total_overdue_count: result.rows.length,
      total_overdue_amount: totalOverdue,
      aging_analysis: aging.rows,
      overdue_receivables: result.rows
    });
  } catch (error: any) {
    console.error("שגיאה בשליפת חייבים באיחור:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// תחזית תזרים מזומנים - N חודשים קדימה
// ============================================================
router.get("/cashflow-forecast/:months", async (req: Request, res: Response) => {
  try {
    const months = parseInt(req.params.months) || 3;

    // מצב נוכחי
    const currentSnap = await pool.query(
      `SELECT cash_balance FROM company_daily_snapshot ORDER BY snapshot_date DESC LIMIT 1`
    );
    let runningBalance = parseFloat(currentSnap.rows[0]?.cash_balance || 0);

    const forecast: any[] = [];

    for (let i = 0; i < months; i++) {
      const forecastDate = new Date();
      forecastDate.setMonth(forecastDate.getMonth() + i);
      const yearMonth = forecastDate.toISOString().substring(0, 7);
      const monthStart = `${yearMonth}-01`;
      const monthEnd = `${yearMonth}-31`;

      // הכנסות צפויות - חייבים שמגיעים בחודש הזה
      const expectedIncome = await pool.query(`
        SELECT COALESCE(SUM(remaining_amount), 0) as expected
        FROM company_receivables
        WHERE remaining_amount > 0 AND due_date BETWEEN $1 AND $2
      `, [monthStart, monthEnd]);

      // הוצאות צפויות - התחייבויות שמגיעות בחודש הזה
      const expectedExpenses = await pool.query(`
        SELECT COALESCE(SUM(remaining_amount), 0) as expected
        FROM company_obligations
        WHERE status = 'active' AND remaining_amount > 0 AND due_date BETWEEN $1 AND $2
      `, [monthStart, monthEnd]);

      // הנחות חודשיות קבועות (הכנסה ממכירות שוטפות)
      const monthlyRecurringRevenue = 2000000; // ~2M ש"ח/חודש מחזור
      const monthlyRecurringExpenses = 1650000; // הוצאות שוטפות

      const income = parseFloat(expectedIncome.rows[0].expected) + (i === 0 ? 0 : monthlyRecurringRevenue);
      const expenses = parseFloat(expectedExpenses.rows[0].expected) + (i === 0 ? 0 : monthlyRecurringExpenses);
      const netFlow = income - expenses;
      runningBalance += netFlow;

      forecast.push({
        month: yearMonth,
        expected_income: Math.round(income),
        expected_expenses: Math.round(expenses),
        net_cashflow: Math.round(netFlow),
        projected_balance: Math.round(runningBalance),
        is_negative: runningBalance < 0
      });
    }

    res.json({
      success: true,
      starting_balance: parseFloat(currentSnap.rows[0]?.cash_balance || 0),
      forecast_months: months,
      forecast,
      warning: forecast.some(f => f.is_negative) ? "תזרים שלילי צפוי - נדרש תכנון מימון!" : null
    });
  } catch (error: any) {
    console.error("שגיאה בתחזית תזרים:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// נזילות מיידית - מזומן + הכנסה צפויה - התחייבויות קרובות
// ============================================================
router.get("/liquidity", async (_req: Request, res: Response) => {
  try {
    // מזומן נוכחי
    const cash = await pool.query(
      `SELECT cash_balance FROM company_daily_snapshot ORDER BY snapshot_date DESC LIMIT 1`
    );
    const cashBalance = parseFloat(cash.rows[0]?.cash_balance || 0);

    // הכנסות צפויות ב-30 יום
    const income30 = await pool.query(`
      SELECT COALESCE(SUM(remaining_amount), 0) as expected
      FROM company_receivables
      WHERE remaining_amount > 0 AND due_date <= CURRENT_DATE + 30 AND collection_status = 'current'
    `);

    // הכנסות צפויות ב-60 יום
    const income60 = await pool.query(`
      SELECT COALESCE(SUM(remaining_amount), 0) as expected
      FROM company_receivables
      WHERE remaining_amount > 0 AND due_date <= CURRENT_DATE + 60 AND collection_status = 'current'
    `);

    // התחייבויות ב-30 יום
    const obligations30 = await pool.query(`
      SELECT COALESCE(SUM(remaining_amount), 0) as due_amount
      FROM company_obligations
      WHERE status = 'active' AND remaining_amount > 0 AND due_date <= CURRENT_DATE + 30
    `);

    // התחייבויות ב-60 יום
    const obligations60 = await pool.query(`
      SELECT COALESCE(SUM(remaining_amount), 0) as due_amount
      FROM company_obligations
      WHERE status = 'active' AND remaining_amount > 0 AND due_date <= CURRENT_DATE + 60
    `);

    const income30Val = parseFloat(income30.rows[0].expected);
    const income60Val = parseFloat(income60.rows[0].expected);
    const oblig30Val = parseFloat(obligations30.rows[0].due_amount);
    const oblig60Val = parseFloat(obligations60.rows[0].due_amount);

    const liquidity30 = cashBalance + income30Val - oblig30Val;
    const liquidity60 = cashBalance + income60Val - oblig60Val;

    // יחס נזילות שוטף
    const currentRatio = oblig30Val > 0 ? (cashBalance + income30Val) / oblig30Val : null;

    res.json({
      success: true,
      cash_on_hand: cashBalance,
      liquidity_30_days: {
        expected_income: income30Val,
        expected_obligations: oblig30Val,
        net_liquidity: liquidity30,
        is_positive: liquidity30 > 0
      },
      liquidity_60_days: {
        expected_income: income60Val,
        expected_obligations: oblig60Val,
        net_liquidity: liquidity60,
        is_positive: liquidity60 > 0
      },
      current_ratio: currentRatio ? Math.round(currentRatio * 100) / 100 : null,
      health: currentRatio && currentRatio >= 1.5 ? "בריא" : currentRatio && currentRatio >= 1.0 ? "סביר" : "דרוש מימון"
    });
  } catch (error: any) {
    console.error("שגיאה בחישוב נזילות:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// מאזן מפושט - נכסים מול התחייבויות מול הון עצמי
// ============================================================
router.get("/balance-sheet", async (_req: Request, res: Response) => {
  try {
    // תמונת מצב אחרונה
    const snap = await pool.query(
      `SELECT * FROM company_daily_snapshot ORDER BY snapshot_date DESC LIMIT 1`
    );

    // סה"כ חייבים
    const receivables = await pool.query(`
      SELECT COALESCE(SUM(remaining_amount), 0) as total FROM company_receivables WHERE remaining_amount > 0
    `);

    // סה"כ התחייבויות
    const obligations = await pool.query(`
      SELECT COALESCE(SUM(remaining_amount), 0) as total FROM company_obligations WHERE status = 'active' AND remaining_amount > 0
    `);

    const s = snap.rows[0] || {};
    const cashBalance = parseFloat(s.cash_balance || 0);
    const inventoryValue = parseFloat(s.inventory_value || 0);
    const receivablesTotal = parseFloat(receivables.rows[0].total);
    const obligationsTotal = parseFloat(obligations.rows[0].total);

    // נכסים
    const currentAssets = cashBalance + receivablesTotal + inventoryValue;
    const fixedAssets = parseFloat(s.total_assets || 0) - currentAssets;
    const totalAssets = currentAssets + Math.max(fixedAssets, 0);

    // התחייבויות
    const currentLiabilities = obligationsTotal;
    const longTermLiabilities = parseFloat(s.total_liabilities || 0) - currentLiabilities;
    const totalLiabilities = currentLiabilities + Math.max(longTermLiabilities, 0);

    // הון עצמי
    const equity = totalAssets - totalLiabilities;

    res.json({
      success: true,
      date: s.snapshot_date || new Date().toISOString().split("T")[0],
      assets: {
        current: {
          cash: cashBalance,
          accounts_receivable: receivablesTotal,
          inventory: inventoryValue,
          total_current: currentAssets
        },
        fixed: Math.max(fixedAssets, 0),
        total_assets: totalAssets
      },
      liabilities: {
        current: {
          accounts_payable: obligationsTotal,
          total_current: currentLiabilities
        },
        long_term: Math.max(longTermLiabilities, 0),
        total_liabilities: totalLiabilities
      },
      equity: {
        total_equity: equity,
        equity_ratio: totalAssets > 0 ? Math.round((equity / totalAssets) * 10000) / 100 : 0
      },
      balanced: Math.abs(totalAssets - totalLiabilities - equity) < 1 // בדיקת איזון
    });
  } catch (error: any) {
    console.error("שגיאה במאזן:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// דשבורד מנכ"ל - הכל במסך אחד
// ============================================================
router.get("/dashboard", async (_req: Request, res: Response) => {
  try {
    // תמונת מצב אחרונה
    const snap = await pool.query(
      `SELECT * FROM company_daily_snapshot ORDER BY snapshot_date DESC LIMIT 1`
    );

    // סה"כ התחייבויות פעילות
    const oblSummary = await pool.query(`
      SELECT
        COUNT(*) as count,
        COALESCE(SUM(remaining_amount), 0) as total,
        COALESCE(SUM(remaining_amount) FILTER (WHERE due_date <= CURRENT_DATE), 0) as overdue,
        COALESCE(SUM(remaining_amount) FILTER (WHERE due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 7), 0) as due_this_week,
        COALESCE(SUM(remaining_amount) FILTER (WHERE priority = 'critical'), 0) as critical
      FROM company_obligations WHERE status = 'active' AND remaining_amount > 0
    `);

    // סה"כ חייבים
    const recSummary = await pool.query(`
      SELECT
        COUNT(*) as count,
        COALESCE(SUM(remaining_amount), 0) as total,
        COALESCE(SUM(remaining_amount) FILTER (WHERE days_overdue > 0), 0) as overdue,
        COALESCE(SUM(remaining_amount) FILTER (WHERE risk_level IN ('high', 'critical')), 0) as at_risk
      FROM company_receivables WHERE remaining_amount > 0
    `);

    // 5 התחייבויות דחופות ביותר
    const urgentObligations = await pool.query(`
      SELECT creditor_name, description_he, remaining_amount, due_date, priority,
        due_date - CURRENT_DATE as days_until_due
      FROM company_obligations
      WHERE status = 'active' AND remaining_amount > 0
      ORDER BY due_date ASC
      LIMIT 5
    `);

    // 5 חייבים גדולים ביותר
    const topReceivables = await pool.query(`
      SELECT debtor_name, description_he, remaining_amount, due_date, collection_status, days_overdue
      FROM company_receivables
      WHERE remaining_amount > 0
      ORDER BY remaining_amount DESC
      LIMIT 5
    `);

    const s = snap.rows[0] || {};
    const obl = oblSummary.rows[0];
    const rec = recSummary.rows[0];

    const cashBalance = parseFloat(s.cash_balance || 0);
    const netPosition = cashBalance + parseFloat(rec.total) - parseFloat(obl.total);

    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      overview: {
        cash_balance: cashBalance,
        we_owe: parseFloat(obl.total),
        owed_to_us: parseFloat(rec.total),
        net_position: netPosition,
        net_positive: netPosition > 0,
        employees: s.employees_count || 200,
        monthly_revenue: parseFloat(s.total_revenue || 0),
        net_profit: parseFloat(s.net_profit || 0),
        gross_margin_pct: parseFloat(s.gross_margin_pct || 0)
      },
      alerts: {
        overdue_obligations: parseFloat(obl.overdue),
        due_this_week: parseFloat(obl.due_this_week),
        critical_obligations: parseFloat(obl.critical),
        overdue_receivables: parseFloat(rec.overdue),
        at_risk_receivables: parseFloat(rec.at_risk)
      },
      urgent_obligations: urgentObligations.rows,
      top_receivables: topReceivables.rows,
      payroll: parseFloat(s.payroll_this_month || 0),
      tax_liability: parseFloat(s.tax_liability || 0),
      projects_in_pipeline: parseFloat(s.projects_in_pipeline || 0)
    });
  } catch (error: any) {
    console.error("שגיאה בדשבורד מנכ\"ל:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// צילום מצב יומי - אגרגציה מכל המודולים
// ============================================================
router.post("/snapshot", async (req: Request, res: Response) => {
  try {
    const {
      total_revenue, total_expenses, operating_expenses,
      cash_balance, inventory_value, deals_closed_today, deals_amount_today,
      employees_count, payroll_this_month, notes
    } = req.body;

    const today = new Date().toISOString().split("T")[0];

    // חישוב ערכים מהטבלאות הקיימות
    const receivablesTotal = await pool.query(
      `SELECT COALESCE(SUM(remaining_amount), 0) as total FROM company_receivables WHERE remaining_amount > 0`
    );
    const obligationsTotal = await pool.query(
      `SELECT COALESCE(SUM(remaining_amount), 0) as total FROM company_obligations WHERE status = 'active' AND remaining_amount > 0`
    );

    const revenue = total_revenue || 0;
    const expenses = total_expenses || 0;
    const grossProfit = revenue - expenses;
    const grossMargin = revenue > 0 ? (grossProfit / revenue) * 100 : 0;
    const opExpenses = operating_expenses || 0;
    const operatingProfit = grossProfit - opExpenses;
    const netProfit = operatingProfit * (1 - CORPORATE_TAX_RATE);

    const ar = parseFloat(receivablesTotal.rows[0].total);
    const ap = parseFloat(obligationsTotal.rows[0].total);
    const cash = cash_balance || 0;
    const inv = inventory_value || 0;
    const totalAssets = cash + ar + inv + 3500000; // + רכוש קבוע מוערך
    const totalLiabilities = ap + 800000; // + התחייבויות ארוכות טווח מוערכות
    const equity = totalAssets - totalLiabilities;

    // חישוב מיסים
    const taxLiability = Math.max(0, operatingProfit * taxRate);

    const result = await pool.query(`
      INSERT INTO company_daily_snapshot (
        snapshot_date, total_revenue, total_expenses, gross_profit, gross_margin_pct,
        operating_expenses, operating_profit, net_profit,
        cash_balance, accounts_receivable, accounts_payable, inventory_value,
        total_assets, total_liabilities, equity,
        projects_in_pipeline, deals_closed_today, deals_amount_today,
        employees_count, payroll_this_month, tax_liability, notes
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
        $13, $14, $15, $16, $17, $18, $19, $20, $21, $22
      )
      ON CONFLICT (snapshot_date) DO UPDATE SET
        total_revenue = EXCLUDED.total_revenue,
        total_expenses = EXCLUDED.total_expenses,
        gross_profit = EXCLUDED.gross_profit,
        gross_margin_pct = EXCLUDED.gross_margin_pct,
        operating_expenses = EXCLUDED.operating_expenses,
        operating_profit = EXCLUDED.operating_profit,
        net_profit = EXCLUDED.net_profit,
        cash_balance = EXCLUDED.cash_balance,
        accounts_receivable = EXCLUDED.accounts_receivable,
        accounts_payable = EXCLUDED.accounts_payable,
        inventory_value = EXCLUDED.inventory_value,
        total_assets = EXCLUDED.total_assets,
        total_liabilities = EXCLUDED.total_liabilities,
        equity = EXCLUDED.equity,
        projects_in_pipeline = EXCLUDED.projects_in_pipeline,
        deals_closed_today = EXCLUDED.deals_closed_today,
        deals_amount_today = EXCLUDED.deals_amount_today,
        employees_count = EXCLUDED.employees_count,
        payroll_this_month = EXCLUDED.payroll_this_month,
        tax_liability = EXCLUDED.tax_liability,
        notes = EXCLUDED.notes,
        updated_at = NOW()
      RETURNING *
    `, [
      today, revenue, expenses, grossProfit, Math.round(grossMargin * 100) / 100,
      opExpenses, operatingProfit, Math.round(netProfit * 100) / 100,
      cash, ar, ap, inv,
      totalAssets, totalLiabilities, equity,
      0, deals_closed_today || 0, deals_amount_today || 0,
      employees_count || 200, payroll_this_month || 0, Math.round(taxLiability * 100) / 100,
      notes || `תמונת מצב יומית - ${today}`
    ]);

    res.json({
      success: true,
      message: `תמונת מצב ל-${today} נשמרה בהצלחה`,
      snapshot: result.rows[0]
    });
  } catch (error: any) {
    console.error("שגיאה בצילום מצב:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// CRUD התחייבויות - יצירה
// ============================================================
router.post("/obligations", async (req: Request, res: Response) => {
  try {
    const {
      obligation_type, creditor_name, description, description_he,
      total_amount, paid_amount, due_date, payment_schedule,
      priority, category, notes
    } = req.body;

    if (!obligation_type || !creditor_name || !total_amount) {
      return res.status(400).json({ success: false, error: "נדרש סוג, שם נושה וסכום" });
    }

    const paid = paid_amount || 0;
    const remaining = total_amount - paid;

    const result = await pool.query(
      `INSERT INTO company_obligations (obligation_type, creditor_name, description, description_he, total_amount, paid_amount, remaining_amount, due_date, payment_schedule, priority, category, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      [obligation_type, creditor_name, description, description_he, total_amount, paid, remaining, due_date, JSON.stringify(payment_schedule || []), priority || "normal", category, notes]
    );

    res.json({ success: true, message: "התחייבות נוצרה", obligation: result.rows[0] });
  } catch (error: any) {
    console.error("שגיאה ביצירת התחייבות:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// שליפת התחייבות בודדת
router.get("/obligations/:id", async (req: Request, res: Response) => {
  try {
    const result = await pool.query(`SELECT * FROM company_obligations WHERE id = $1`, [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: "התחייבות לא נמצאה" });
    }
    res.json({ success: true, obligation: result.rows[0] });
  } catch (error: any) {
    console.error("שגיאה בשליפת התחייבות:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// עדכון התחייבות
router.put("/obligations/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const fields = req.body;
    const setClauses: string[] = [];
    const values: any[] = [];
    let idx = 1;

    const allowedFields = [
      "obligation_type", "creditor_name", "description", "description_he",
      "total_amount", "paid_amount", "remaining_amount", "due_date",
      "payment_schedule", "priority", "category", "status", "notes"
    ];

    for (const field of allowedFields) {
      if (fields[field] !== undefined) {
        setClauses.push(`${field} = $${idx}`);
        values.push(field === "payment_schedule" ? JSON.stringify(fields[field]) : fields[field]);
        idx++;
      }
    }

    // עדכון אוטומטי של remaining אם שולם סכום
    if (fields.paid_amount !== undefined && fields.total_amount === undefined) {
      // שליפת total קיים
      const existing = await pool.query(`SELECT total_amount FROM company_obligations WHERE id = $1`, [id]);
      if (existing.rows.length > 0) {
        const remaining = parseFloat(existing.rows[0].total_amount) - fields.paid_amount;
        setClauses.push(`remaining_amount = $${idx}`);
        values.push(Math.max(0, remaining));
        idx++;

        // אם שולם הכל - עדכון סטטוס
        if (remaining <= 0) {
          setClauses.push(`status = $${idx}`);
          values.push("paid");
          idx++;
        }
      }
    }

    if (setClauses.length === 0) {
      return res.status(400).json({ success: false, error: "לא נשלחו שדות לעדכון" });
    }

    setClauses.push(`updated_at = NOW()`);
    values.push(id);

    const result = await pool.query(
      `UPDATE company_obligations SET ${setClauses.join(", ")} WHERE id = $${idx} RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: "התחייבות לא נמצאה" });
    }

    res.json({ success: true, message: "התחייבות עודכנה", obligation: result.rows[0] });
  } catch (error: any) {
    console.error("שגיאה בעדכון התחייבות:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ביטול התחייבות (לא מוחקים)
router.delete("/obligations/:id", async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `UPDATE company_obligations SET status = 'cancelled', updated_at = NOW() WHERE id = $1 RETURNING *`,
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: "התחייבות לא נמצאה" });
    }
    res.json({ success: true, message: "התחייבות בוטלה (לא נמחקה)", obligation: result.rows[0] });
  } catch (error: any) {
    console.error("שגיאה בביטול התחייבות:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// CRUD חייבים - יצירה
// ============================================================
router.post("/receivables", async (req: Request, res: Response) => {
  try {
    const {
      debtor_type, debtor_name, description, description_he,
      total_amount, received_amount, due_date, invoice_number,
      project_id, risk_level, notes
    } = req.body;

    if (!debtor_type || !debtor_name || !total_amount) {
      return res.status(400).json({ success: false, error: "נדרש סוג, שם חייב וסכום" });
    }

    const received = received_amount || 0;
    const remaining = total_amount - received;

    const result = await pool.query(
      `INSERT INTO company_receivables (debtor_type, debtor_name, description, description_he, total_amount, received_amount, remaining_amount, due_date, invoice_number, project_id, risk_level, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      [debtor_type, debtor_name, description, description_he, total_amount, received, remaining, due_date, invoice_number, project_id, risk_level || "low", notes]
    );

    res.json({ success: true, message: "חייב נוסף", receivable: result.rows[0] });
  } catch (error: any) {
    console.error("שגיאה ביצירת חייב:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// שליפת חייב בודד
router.get("/receivables/:id", async (req: Request, res: Response) => {
  try {
    const result = await pool.query(`SELECT * FROM company_receivables WHERE id = $1`, [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: "חייב לא נמצא" });
    }
    res.json({ success: true, receivable: result.rows[0] });
  } catch (error: any) {
    console.error("שגיאה בשליפת חייב:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// עדכון חייב
router.put("/receivables/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const fields = req.body;
    const setClauses: string[] = [];
    const values: any[] = [];
    let idx = 1;

    const allowedFields = [
      "debtor_type", "debtor_name", "description", "description_he",
      "total_amount", "received_amount", "remaining_amount", "due_date",
      "invoice_number", "project_id", "risk_level", "days_overdue",
      "collection_status", "last_reminder", "notes"
    ];

    for (const field of allowedFields) {
      if (fields[field] !== undefined) {
        setClauses.push(`${field} = $${idx}`);
        values.push(fields[field]);
        idx++;
      }
    }

    // עדכון אוטומטי של remaining אם התקבל תשלום
    if (fields.received_amount !== undefined && fields.total_amount === undefined) {
      const existing = await pool.query(`SELECT total_amount FROM company_receivables WHERE id = $1`, [id]);
      if (existing.rows.length > 0) {
        const remaining = parseFloat(existing.rows[0].total_amount) - fields.received_amount;
        setClauses.push(`remaining_amount = $${idx}`);
        values.push(Math.max(0, remaining));
        idx++;

        if (remaining <= 0) {
          setClauses.push(`collection_status = $${idx}`);
          values.push("paid");
          idx++;
        }
      }
    }

    if (setClauses.length === 0) {
      return res.status(400).json({ success: false, error: "לא נשלחו שדות לעדכון" });
    }

    setClauses.push(`updated_at = NOW()`);
    values.push(id);

    const result = await pool.query(
      `UPDATE company_receivables SET ${setClauses.join(", ")} WHERE id = $${idx} RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: "חייב לא נמצא" });
    }

    res.json({ success: true, message: "חייב עודכן", receivable: result.rows[0] });
  } catch (error: any) {
    console.error("שגיאה בעדכון חייב:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ביטול חייב (לא מוחקים)
router.delete("/receivables/:id", async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `UPDATE company_receivables SET collection_status = 'written_off', updated_at = NOW() WHERE id = $1 RETURNING *`,
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: "חייב לא נמצא" });
    }
    res.json({ success: true, message: "חייב סומן כמחוק חשבונאית (לא נמחק)", receivable: result.rows[0] });
  } catch (error: any) {
    console.error("שגיאה בביטול חייב:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
