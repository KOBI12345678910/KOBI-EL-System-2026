// ============================================================
// מנוע פיננסים בזמן אמת - Real-time Financials Engine
// מצב פיננסי נוכחי: כמה חייבים לנו, כמה אנחנו חייבים, נזילות, תשלומים צפויים
// ============================================================

import { Router, Request, Response } from 'express';
import pool from '@workspace/db';

const router = Router();

// ============================================================
// POST /init - יצירת טבלאות
// ============================================================
router.post('/init', async (_req: Request, res: Response) => {
  try {
    // טבלת מצב פיננסי של החברה - תמונת מצב
    await pool.query(`
      CREATE TABLE IF NOT EXISTS company_financial_position (
        id SERIAL PRIMARY KEY,
        snapshot_date TIMESTAMPTZ DEFAULT NOW(),
        total_receivables NUMERIC(15,2) DEFAULT 0,
        total_payables NUMERIC(15,2) DEFAULT 0,
        cash_in_bank NUMERIC(15,2) DEFAULT 0,
        petty_cash NUMERIC(15,2) DEFAULT 0,
        total_liquidity NUMERIC(15,2) DEFAULT 0,
        net_position NUMERIC(15,2) DEFAULT 0,
        upcoming_income_30d NUMERIC(15,2) DEFAULT 0,
        upcoming_expenses_30d NUMERIC(15,2) DEFAULT 0,
        projected_balance_30d NUMERIC(15,2) DEFAULT 0,
        tax_liability NUMERIC(15,2) DEFAULT 0,
        payroll_liability NUMERIC(15,2) DEFAULT 0,
        supplier_debt_detail JSONB DEFAULT '[]',
        customer_debt_detail JSONB DEFAULT '[]',
        daily_revenue NUMERIC(15,2) DEFAULT 0,
        monthly_revenue NUMERIC(15,2) DEFAULT 0,
        daily_expenses NUMERIC(15,2) DEFAULT 0,
        monthly_expenses NUMERIC(15,2) DEFAULT 0,
        gross_margin_percent NUMERIC(5,2),
        operating_margin_percent NUMERIC(5,2),
        burn_rate_daily NUMERIC(15,2),
        runway_days INTEGER,
        alerts JSONB DEFAULT '[]',
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // טבלת לוח תשלומים
    await pool.query(`
      CREATE TABLE IF NOT EXISTS payment_schedule (
        id SERIAL PRIMARY KEY,
        party_type VARCHAR NOT NULL,
        party_id INTEGER,
        party_name VARCHAR,
        direction VARCHAR NOT NULL,
        amount NUMERIC(15,2),
        currency VARCHAR DEFAULT 'ILS',
        due_date DATE NOT NULL,
        description VARCHAR,
        invoice_number VARCHAR,
        status VARCHAR DEFAULT 'upcoming',
        paid_date DATE,
        paid_amount NUMERIC(15,2),
        payment_method VARCHAR,
        priority VARCHAR DEFAULT 'normal',
        auto_pay BOOLEAN DEFAULT false,
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // טבלת מעקב רווח יומי
    await pool.query(`
      CREATE TABLE IF NOT EXISTS daily_profit_tracker (
        id SERIAL PRIMARY KEY,
        date DATE UNIQUE NOT NULL,
        total_revenue NUMERIC(15,2) DEFAULT 0,
        total_cogs NUMERIC(15,2) DEFAULT 0,
        gross_profit NUMERIC(15,2) DEFAULT 0,
        operating_expenses NUMERIC(15,2) DEFAULT 0,
        operating_profit NUMERIC(15,2) DEFAULT 0,
        other_income NUMERIC(15,2) DEFAULT 0,
        other_expenses NUMERIC(15,2) DEFAULT 0,
        net_profit_before_tax NUMERIC(15,2) DEFAULT 0,
        estimated_tax NUMERIC(15,2) DEFAULT 0,
        net_profit NUMERIC(15,2) DEFAULT 0,
        transaction_count INTEGER DEFAULT 0,
        deals_closed INTEGER DEFAULT 0,
        projects_completed INTEGER DEFAULT 0,
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    res.json({
      success: true,
      message: 'מנוע פיננסים בזמן אמת אותחל בהצלחה',
      tables: ['company_financial_position', 'payment_schedule', 'daily_profit_tracker']
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// POST /take-snapshot - חישוב מצב פיננסי נוכחי מכל המקורות
// ============================================================
router.post('/take-snapshot', async (req: Request, res: Response) => {
  try {
    const {
      cash_in_bank, petty_cash, tax_liability, payroll_liability
    } = req.body;

    const alerts: any[] = [];

    // ========================================
    // חישוב חובות לקוחות (כמה חייבים לנו)
    // ========================================
    let totalReceivables = 0;
    const customerDebtDetail: any[] = [];

    const incomingPayments = await pool.query(`
      SELECT party_name, party_id, SUM(amount) as total_owed
      FROM payment_schedule
      WHERE direction = 'in' AND status IN ('upcoming', 'overdue')
      GROUP BY party_name, party_id
      ORDER BY total_owed DESC
    `);

    for (const row of incomingPayments.rows) {
      const owed = parseFloat(row.total_owed);
      totalReceivables += owed;
      customerDebtDetail.push({
        name: row.party_name,
        id: row.party_id,
        amount: owed
      });
    }

    // ========================================
    // חישוב חובות לספקים (כמה אנחנו חייבים)
    // ========================================
    let totalPayables = 0;
    const supplierDebtDetail: any[] = [];

    const outgoingPayments = await pool.query(`
      SELECT party_name, party_id, SUM(amount) as total_owed
      FROM payment_schedule
      WHERE direction = 'out' AND status IN ('upcoming', 'overdue')
      GROUP BY party_name, party_id
      ORDER BY total_owed DESC
    `);

    for (const row of outgoingPayments.rows) {
      const owed = parseFloat(row.total_owed);
      totalPayables += owed;
      supplierDebtDetail.push({
        name: row.party_name,
        id: row.party_id,
        amount: owed
      });
    }

    // ========================================
    // נזילות
    // ========================================
    const cashBank = cash_in_bank || 0;
    const pettyCash = petty_cash || 0;
    const totalLiquidity = parseFloat((cashBank + pettyCash).toFixed(2));

    // ========================================
    // מצב נטו
    // ========================================
    const netPosition = parseFloat((totalLiquidity + totalReceivables - totalPayables).toFixed(2));

    // ========================================
    // הכנסות והוצאות צפויות ב-30 יום
    // ========================================
    const upcoming30d = await pool.query(`
      SELECT
        COALESCE(SUM(amount) FILTER (WHERE direction = 'in'), 0) as income_30d,
        COALESCE(SUM(amount) FILTER (WHERE direction = 'out'), 0) as expenses_30d
      FROM payment_schedule
      WHERE due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'
        AND status IN ('upcoming', 'overdue')
    `);

    const upcomingIncome30d = parseFloat(upcoming30d.rows[0].income_30d);
    const upcomingExpenses30d = parseFloat(upcoming30d.rows[0].expenses_30d);
    const projectedBalance30d = parseFloat((totalLiquidity + upcomingIncome30d - upcomingExpenses30d).toFixed(2));

    // ========================================
    // הכנסות והוצאות יומיות וחודשיות
    // ========================================
    const today = new Date().toISOString().split('T')[0];
    const dailyData = await pool.query(`
      SELECT total_revenue, operating_expenses FROM daily_profit_tracker WHERE date = $1
    `, [today]);

    const dailyRevenue = dailyData.rows.length > 0 ? parseFloat(dailyData.rows[0].total_revenue) : 0;
    const dailyExpenses = dailyData.rows.length > 0 ? parseFloat(dailyData.rows[0].operating_expenses) : 0;

    const monthStart = today.substring(0, 7) + '-01';
    const monthlyData = await pool.query(`
      SELECT
        COALESCE(SUM(total_revenue), 0) as monthly_revenue,
        COALESCE(SUM(operating_expenses), 0) as monthly_expenses,
        COALESCE(SUM(gross_profit), 0) as monthly_gross_profit,
        COALESCE(SUM(operating_profit), 0) as monthly_operating_profit
      FROM daily_profit_tracker WHERE date >= $1
    `, [monthStart]);

    const monthlyRevenue = parseFloat(monthlyData.rows[0].monthly_revenue);
    const monthlyExpenses = parseFloat(monthlyData.rows[0].monthly_expenses);

    // מרווחים
    const grossMarginPercent = monthlyRevenue > 0
      ? parseFloat(((parseFloat(monthlyData.rows[0].monthly_gross_profit) / monthlyRevenue) * 100).toFixed(2))
      : null;
    const operatingMarginPercent = monthlyRevenue > 0
      ? parseFloat(((parseFloat(monthlyData.rows[0].monthly_operating_profit) / monthlyRevenue) * 100).toFixed(2))
      : null;

    // קצב שריפה ומסלול
    const daysThisMonth = new Date().getDate();
    const burnRateDaily = daysThisMonth > 0 ? parseFloat((monthlyExpenses / daysThisMonth).toFixed(2)) : 0;
    const runwayDays = burnRateDaily > 0 ? Math.floor(totalLiquidity / burnRateDaily) : 999;

    // ========================================
    // התראות
    // ========================================
    // נזילות נמוכה
    if (totalLiquidity < 50000) {
      alerts.push({ type: 'low_cash', severity: 'critical', message_he: `נזילות נמוכה מאוד: ₪${totalLiquidity.toLocaleString()}`, amount: totalLiquidity });
    } else if (totalLiquidity < 200000) {
      alerts.push({ type: 'low_cash', severity: 'warning', message_he: `נזילות נמוכה: ₪${totalLiquidity.toLocaleString()}`, amount: totalLiquidity });
    }

    // חובות באיחור
    const overduePayments = await pool.query(`
      SELECT COUNT(*) as count, SUM(amount) as total
      FROM payment_schedule WHERE status = 'overdue' AND direction = 'in'
    `);
    if (parseInt(overduePayments.rows[0].count) > 0) {
      alerts.push({
        type: 'overdue_receivables', severity: 'warning',
        message_he: `${overduePayments.rows[0].count} תשלומים באיחור - סה"כ ₪${parseFloat(overduePayments.rows[0].total).toLocaleString()}`,
        count: parseInt(overduePayments.rows[0].count),
        amount: parseFloat(overduePayments.rows[0].total)
      });
    }

    // תשלום גדול קרוב (מעל 50,000 ₪ ב-7 ימים)
    const largeUpcoming = await pool.query(`
      SELECT party_name, amount, due_date FROM payment_schedule
      WHERE direction = 'out' AND amount > 50000 AND status = 'upcoming'
        AND due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'
      ORDER BY amount DESC
    `);
    for (const payment of largeUpcoming.rows) {
      alerts.push({
        type: 'large_payment_upcoming', severity: 'info',
        message_he: `תשלום גדול קרוב: ₪${parseFloat(payment.amount).toLocaleString()} ל-${payment.party_name} ב-${payment.due_date}`,
        amount: parseFloat(payment.amount),
        party: payment.party_name,
        due_date: payment.due_date
      });
    }

    // מסלול קצר
    if (runwayDays < 30) {
      alerts.push({ type: 'short_runway', severity: 'critical', message_he: `מסלול קצר: ${runwayDays} ימים בלבד`, days: runwayDays });
    } else if (runwayDays < 90) {
      alerts.push({ type: 'short_runway', severity: 'warning', message_he: `מסלול מוגבל: ${runwayDays} ימים`, days: runwayDays });
    }

    // יתרה צפויה שלילית ב-30 יום
    if (projectedBalance30d < 0) {
      alerts.push({ type: 'negative_projected_balance', severity: 'critical', message_he: `יתרה צפויה שלילית בעוד 30 יום: ₪${projectedBalance30d.toLocaleString()}`, amount: projectedBalance30d });
    }

    // ========================================
    // שמירת תמונת מצב
    // ========================================
    const snapshot = await pool.query(`
      INSERT INTO company_financial_position (
        total_receivables, total_payables, cash_in_bank, petty_cash, total_liquidity, net_position,
        upcoming_income_30d, upcoming_expenses_30d, projected_balance_30d,
        tax_liability, payroll_liability,
        supplier_debt_detail, customer_debt_detail,
        daily_revenue, monthly_revenue, daily_expenses, monthly_expenses,
        gross_margin_percent, operating_margin_percent, burn_rate_daily, runway_days, alerts
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
      RETURNING *
    `, [
      totalReceivables.toFixed(2), totalPayables.toFixed(2), cashBank, pettyCash,
      totalLiquidity, netPosition,
      upcomingIncome30d.toFixed(2), upcomingExpenses30d.toFixed(2), projectedBalance30d,
      tax_liability || 0, payroll_liability || 0,
      JSON.stringify(supplierDebtDetail), JSON.stringify(customerDebtDetail),
      dailyRevenue, monthlyRevenue, dailyExpenses, monthlyExpenses,
      grossMarginPercent, operatingMarginPercent, burnRateDaily, runwayDays,
      JSON.stringify(alerts)
    ]);

    // עדכון סטטוס חובות באיחור
    await pool.query(`
      UPDATE payment_schedule SET status = 'overdue', updated_at = NOW()
      WHERE due_date < CURRENT_DATE AND status = 'upcoming'
    `);

    res.json({
      success: true,
      message: 'תמונת מצב פיננסית נשמרה בהצלחה',
      snapshot: snapshot.rows[0]
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// GET /current-position - מצב פיננסי אחרון
// ============================================================
router.get('/current-position', async (_req: Request, res: Response) => {
  try {
    const result = await pool.query(`
      SELECT * FROM company_financial_position ORDER BY snapshot_date DESC LIMIT 1
    `);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'אין תמונת מצב פיננסית. יש להריץ POST /take-snapshot קודם' });
    }

    res.json({
      success: true,
      position: result.rows[0]
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// GET /who-owes-us - מי חייב לנו (חשבוניות פתוחות לקוחות)
// ============================================================
router.get('/who-owes-us', async (_req: Request, res: Response) => {
  try {
    const result = await pool.query(`
      SELECT
        party_name, party_id,
        COUNT(*) as invoices_count,
        SUM(amount) as total_owed,
        MIN(due_date) as earliest_due,
        MAX(due_date) as latest_due,
        COUNT(*) FILTER (WHERE status = 'overdue') as overdue_count,
        COALESCE(SUM(amount) FILTER (WHERE status = 'overdue'), 0) as overdue_amount
      FROM payment_schedule
      WHERE direction = 'in' AND status IN ('upcoming', 'overdue')
      GROUP BY party_name, party_id
      ORDER BY total_owed DESC
    `);

    // פירוט כל תשלום
    const details = await pool.query(`
      SELECT * FROM payment_schedule
      WHERE direction = 'in' AND status IN ('upcoming', 'overdue')
      ORDER BY due_date ASC
    `);

    const totalOwed = result.rows.reduce((sum: number, r: any) => sum + parseFloat(r.total_owed), 0);
    const totalOverdue = result.rows.reduce((sum: number, r: any) => sum + parseFloat(r.overdue_amount), 0);

    res.json({
      success: true,
      summary: {
        total_customers: result.rows.length,
        total_owed: parseFloat(totalOwed.toFixed(2)),
        total_overdue: parseFloat(totalOverdue.toFixed(2)),
        total_invoices: details.rows.length
      },
      by_customer: result.rows,
      all_invoices: details.rows
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// GET /who-we-owe - למי אנחנו חייבים (ספקים, מס, עובדים)
// ============================================================
router.get('/who-we-owe', async (_req: Request, res: Response) => {
  try {
    const result = await pool.query(`
      SELECT
        party_type, party_name, party_id,
        COUNT(*) as invoices_count,
        SUM(amount) as total_owed,
        MIN(due_date) as earliest_due,
        MAX(due_date) as latest_due,
        COUNT(*) FILTER (WHERE status = 'overdue') as overdue_count,
        COALESCE(SUM(amount) FILTER (WHERE status = 'overdue'), 0) as overdue_amount
      FROM payment_schedule
      WHERE direction = 'out' AND status IN ('upcoming', 'overdue')
      GROUP BY party_type, party_name, party_id
      ORDER BY total_owed DESC
    `);

    const details = await pool.query(`
      SELECT * FROM payment_schedule
      WHERE direction = 'out' AND status IN ('upcoming', 'overdue')
      ORDER BY due_date ASC
    `);

    const totalWeOwe = result.rows.reduce((sum: number, r: any) => sum + parseFloat(r.total_owed), 0);
    const totalOverdue = result.rows.reduce((sum: number, r: any) => sum + parseFloat(r.overdue_amount), 0);

    // קיבוץ לפי סוג צד
    const byType: Record<string, any[]> = {};
    for (const row of result.rows) {
      const type = row.party_type || 'other';
      if (!byType[type]) byType[type] = [];
      byType[type].push(row);
    }

    res.json({
      success: true,
      summary: {
        total_parties: result.rows.length,
        total_we_owe: parseFloat(totalWeOwe.toFixed(2)),
        total_overdue: parseFloat(totalOverdue.toFixed(2)),
        total_invoices: details.rows.length
      },
      by_party_type: byType,
      by_party: result.rows,
      all_invoices: details.rows
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// GET /payment-schedule - לוח תשלומים נכנסים ויוצאים
// ============================================================
router.get('/payment-schedule', async (req: Request, res: Response) => {
  try {
    const { direction, status, days = 90, priority } = req.query;

    let query = `SELECT * FROM payment_schedule WHERE due_date <= CURRENT_DATE + $1::INTEGER * INTERVAL '1 day'`;
    const params: any[] = [days];
    let idx = 2;

    if (direction) { query += ` AND direction = $${idx++}`; params.push(direction); }
    if (status) { query += ` AND status = $${idx++}`; params.push(status); }
    if (priority) { query += ` AND priority = $${idx++}`; params.push(priority); }

    query += ` ORDER BY due_date ASC`;

    const result = await pool.query(query, params);

    // סיכום לפי שבוע
    const weeklyBreakdown = await pool.query(`
      SELECT
        DATE_TRUNC('week', due_date) as week_start,
        SUM(amount) FILTER (WHERE direction = 'in') as income,
        SUM(amount) FILTER (WHERE direction = 'out') as expenses,
        COUNT(*) as total_payments
      FROM payment_schedule
      WHERE due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + $1::INTEGER * INTERVAL '1 day'
        AND status IN ('upcoming', 'overdue')
      GROUP BY DATE_TRUNC('week', due_date)
      ORDER BY week_start
    `, [days]);

    res.json({
      success: true,
      payments: result.rows,
      weekly_breakdown: weeklyBreakdown.rows,
      total: result.rows.length
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// GET /cash-flow-forecast/:days - תחזית תזרים מזומנים
// ============================================================
router.get('/cash-flow-forecast/:days', async (req: Request, res: Response) => {
  try {
    const days = parseInt(req.params.days) || 30;

    // יתרת פתיחה
    const latestPosition = await pool.query(`
      SELECT total_liquidity FROM company_financial_position ORDER BY snapshot_date DESC LIMIT 1
    `);
    let openingBalance = latestPosition.rows.length > 0 ? parseFloat(latestPosition.rows[0].total_liquidity) : 0;

    // תשלומים צפויים לפי יום
    const dailyFlows = await pool.query(`
      SELECT
        due_date,
        COALESCE(SUM(amount) FILTER (WHERE direction = 'in'), 0) as inflow,
        COALESCE(SUM(amount) FILTER (WHERE direction = 'out'), 0) as outflow
      FROM payment_schedule
      WHERE due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + $1 * INTERVAL '1 day'
        AND status IN ('upcoming', 'overdue')
      GROUP BY due_date
      ORDER BY due_date
    `, [days]);

    // בניית תחזית יומית
    const forecast: any[] = [];
    let runningBalance = openingBalance;
    let minBalance = openingBalance;
    let minBalanceDate = new Date().toISOString().split('T')[0];

    const flowMap: Record<string, { inflow: number; outflow: number }> = {};
    for (const flow of dailyFlows.rows) {
      flowMap[flow.due_date.toISOString().split('T')[0]] = {
        inflow: parseFloat(flow.inflow),
        outflow: parseFloat(flow.outflow)
      };
    }

    const currentDate = new Date();
    for (let i = 0; i <= days; i++) {
      const dateStr = new Date(currentDate.getTime() + i * 86400000).toISOString().split('T')[0];
      const dayFlow = flowMap[dateStr] || { inflow: 0, outflow: 0 };
      const netFlow = dayFlow.inflow - dayFlow.outflow;
      runningBalance += netFlow;

      forecast.push({
        date: dateStr,
        inflow: dayFlow.inflow,
        outflow: dayFlow.outflow,
        net_flow: parseFloat(netFlow.toFixed(2)),
        balance: parseFloat(runningBalance.toFixed(2))
      });

      if (runningBalance < minBalance) {
        minBalance = runningBalance;
        minBalanceDate = dateStr;
      }
    }

    const totalInflow = forecast.reduce((s, f) => s + f.inflow, 0);
    const totalOutflow = forecast.reduce((s, f) => s + f.outflow, 0);

    res.json({
      success: true,
      forecast_days: days,
      opening_balance: openingBalance,
      closing_balance: parseFloat(runningBalance.toFixed(2)),
      total_inflow: parseFloat(totalInflow.toFixed(2)),
      total_outflow: parseFloat(totalOutflow.toFixed(2)),
      net_flow: parseFloat((totalInflow - totalOutflow).toFixed(2)),
      minimum_balance: parseFloat(minBalance.toFixed(2)),
      minimum_balance_date: minBalanceDate,
      negative_balance_risk: minBalance < 0,
      daily_forecast: forecast
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// GET /daily-profit/:date - רווח יומי
// ============================================================
router.get('/daily-profit/:date', async (req: Request, res: Response) => {
  try {
    const { date } = req.params;
    const result = await pool.query(`SELECT * FROM daily_profit_tracker WHERE date = $1`, [date]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: `אין נתוני רווח לתאריך ${date}` });
    }

    res.json({ success: true, profit: result.rows[0] });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// GET /monthly-profit/:month - רווח חודשי
// ============================================================
router.get('/monthly-profit/:month', async (req: Request, res: Response) => {
  try {
    const { month } = req.params; // YYYY-MM
    const startDate = `${month}-01`;
    const endDate = `${month}-31`;

    const result = await pool.query(`
      SELECT
        SUM(total_revenue) as total_revenue,
        SUM(total_cogs) as total_cogs,
        SUM(gross_profit) as gross_profit,
        SUM(operating_expenses) as operating_expenses,
        SUM(operating_profit) as operating_profit,
        SUM(other_income) as other_income,
        SUM(other_expenses) as other_expenses,
        SUM(net_profit_before_tax) as net_profit_before_tax,
        SUM(estimated_tax) as estimated_tax,
        SUM(net_profit) as net_profit,
        SUM(transaction_count) as total_transactions,
        SUM(deals_closed) as total_deals,
        SUM(projects_completed) as total_projects,
        COUNT(*) as days_recorded
      FROM daily_profit_tracker WHERE date BETWEEN $1 AND $2
    `, [startDate, endDate]);

    // פירוט יומי
    const daily = await pool.query(`
      SELECT * FROM daily_profit_tracker WHERE date BETWEEN $1 AND $2 ORDER BY date
    `, [startDate, endDate]);

    const summary = result.rows[0];
    const totalRevenue = parseFloat(summary.total_revenue) || 0;
    const grossProfit = parseFloat(summary.gross_profit) || 0;
    const operatingProfit = parseFloat(summary.operating_profit) || 0;

    res.json({
      success: true,
      period: month,
      summary: {
        ...summary,
        gross_margin_percent: totalRevenue > 0 ? parseFloat(((grossProfit / totalRevenue) * 100).toFixed(2)) : 0,
        operating_margin_percent: totalRevenue > 0 ? parseFloat(((operatingProfit / totalRevenue) * 100).toFixed(2)) : 0,
        avg_daily_revenue: parseFloat(summary.days_recorded) > 0 ? parseFloat((totalRevenue / parseFloat(summary.days_recorded)).toFixed(2)) : 0,
        avg_daily_profit: parseFloat(summary.days_recorded) > 0 ? parseFloat((parseFloat(summary.net_profit) / parseFloat(summary.days_recorded)).toFixed(2)) : 0
      },
      daily_breakdown: daily.rows
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// GET /profit-trend - מגמת רווח 12 חודשים אחרונים
// ============================================================
router.get('/profit-trend', async (_req: Request, res: Response) => {
  try {
    const result = await pool.query(`
      SELECT
        TO_CHAR(date, 'YYYY-MM') as month,
        SUM(total_revenue) as revenue,
        SUM(total_cogs) as cogs,
        SUM(gross_profit) as gross_profit,
        SUM(operating_expenses) as operating_expenses,
        SUM(operating_profit) as operating_profit,
        SUM(net_profit) as net_profit,
        SUM(transaction_count) as transactions,
        COUNT(*) as days
      FROM daily_profit_tracker
      WHERE date >= CURRENT_DATE - INTERVAL '12 months'
      GROUP BY TO_CHAR(date, 'YYYY-MM')
      ORDER BY month
    `);

    // חישוב שינוי חודשי
    const trend = result.rows.map((row: any, index: number) => {
      const prevRevenue = index > 0 ? parseFloat(result.rows[index - 1].revenue) : 0;
      const currentRevenue = parseFloat(row.revenue);
      const revenueChange = prevRevenue > 0 ? parseFloat((((currentRevenue - prevRevenue) / prevRevenue) * 100).toFixed(2)) : 0;

      return {
        ...row,
        revenue_change_percent: index > 0 ? revenueChange : null,
        profit_margin: currentRevenue > 0 ? parseFloat(((parseFloat(row.net_profit) / currentRevenue) * 100).toFixed(2)) : 0
      };
    });

    res.json({
      success: true,
      months: trend.length,
      trend
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// GET /dashboard - לוח מחוונים פיננסי מלא
// ============================================================
router.get('/dashboard', async (_req: Request, res: Response) => {
  try {
    // מצב אחרון
    const position = await pool.query(`
      SELECT * FROM company_financial_position ORDER BY snapshot_date DESC LIMIT 1
    `);

    // רווח היום
    const today = new Date().toISOString().split('T')[0];
    const todayProfit = await pool.query(`
      SELECT * FROM daily_profit_tracker WHERE date = $1
    `, [today]);

    // תשלומים קרובים (7 ימים)
    const upcomingPayments = await pool.query(`
      SELECT direction, COUNT(*) as count, SUM(amount) as total
      FROM payment_schedule
      WHERE due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'
        AND status = 'upcoming'
      GROUP BY direction
    `);

    // חובות באיחור
    const overdue = await pool.query(`
      SELECT direction, COUNT(*) as count, SUM(amount) as total
      FROM payment_schedule WHERE status = 'overdue'
      GROUP BY direction
    `);

    // רווח חודשי נוכחי
    const monthStart = today.substring(0, 7) + '-01';
    const monthlyProfit = await pool.query(`
      SELECT SUM(total_revenue) as revenue, SUM(net_profit) as profit, COUNT(*) as days
      FROM daily_profit_tracker WHERE date >= $1
    `, [monthStart]);

    // הכנסה ממוצעת יומית (90 יום)
    const avgDaily = await pool.query(`
      SELECT AVG(total_revenue) as avg_revenue, AVG(net_profit) as avg_profit
      FROM daily_profit_tracker WHERE date >= CURRENT_DATE - INTERVAL '90 days'
    `);

    res.json({
      success: true,
      dashboard: {
        financial_position: position.rows[0] || null,
        today: todayProfit.rows[0] || null,
        upcoming_7d: {
          incoming: upcomingPayments.rows.find((r: any) => r.direction === 'in') || { count: 0, total: 0 },
          outgoing: upcomingPayments.rows.find((r: any) => r.direction === 'out') || { count: 0, total: 0 }
        },
        overdue: {
          receivables: overdue.rows.find((r: any) => r.direction === 'in') || { count: 0, total: 0 },
          payables: overdue.rows.find((r: any) => r.direction === 'out') || { count: 0, total: 0 }
        },
        monthly: monthlyProfit.rows[0],
        avg_daily_90d: avgDaily.rows[0],
        alerts: position.rows.length > 0 ? position.rows[0].alerts : []
      }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// GET /how-much-we-make-per-day - כמה אנחנו מרוויחים ביום
// ============================================================
router.get('/how-much-we-make-per-day', async (req: Request, res: Response) => {
  try {
    const { period = 90 } = req.query;

    const result = await pool.query(`
      SELECT
        AVG(total_revenue) as avg_daily_revenue,
        AVG(net_profit) as avg_daily_profit,
        AVG(gross_profit) as avg_daily_gross_profit,
        AVG(operating_profit) as avg_daily_operating_profit,
        MIN(total_revenue) as min_daily_revenue,
        MAX(total_revenue) as max_daily_revenue,
        MIN(net_profit) as min_daily_profit,
        MAX(net_profit) as max_daily_profit,
        SUM(total_revenue) as total_revenue,
        SUM(net_profit) as total_profit,
        COUNT(*) as days_counted,
        AVG(transaction_count) as avg_daily_transactions,
        AVG(deals_closed) as avg_daily_deals
      FROM daily_profit_tracker
      WHERE date >= CURRENT_DATE - $1::INTEGER * INTERVAL '1 day'
    `, [period]);

    const data = result.rows[0];
    const avgRevenue = parseFloat(data.avg_daily_revenue) || 0;
    const avgProfit = parseFloat(data.avg_daily_profit) || 0;

    // השוואה לחודש קודם
    const lastMonth = await pool.query(`
      SELECT AVG(total_revenue) as avg_revenue, AVG(net_profit) as avg_profit
      FROM daily_profit_tracker
      WHERE date BETWEEN CURRENT_DATE - INTERVAL '60 days' AND CURRENT_DATE - INTERVAL '30 days'
    `);

    const prevAvgRevenue = parseFloat(lastMonth.rows[0].avg_revenue) || 0;
    const revenueChange = prevAvgRevenue > 0 ? parseFloat((((avgRevenue - prevAvgRevenue) / prevAvgRevenue) * 100).toFixed(2)) : 0;

    res.json({
      success: true,
      period_days: period,
      daily_averages: {
        revenue: parseFloat(avgRevenue.toFixed(2)),
        gross_profit: parseFloat(parseFloat(data.avg_daily_gross_profit || 0).toFixed(2)),
        operating_profit: parseFloat(parseFloat(data.avg_daily_operating_profit || 0).toFixed(2)),
        net_profit: parseFloat(avgProfit.toFixed(2)),
        transactions: parseFloat(parseFloat(data.avg_daily_transactions || 0).toFixed(1)),
        deals: parseFloat(parseFloat(data.avg_daily_deals || 0).toFixed(1))
      },
      ranges: {
        min_revenue: parseFloat(data.min_daily_revenue || 0),
        max_revenue: parseFloat(data.max_daily_revenue || 0),
        min_profit: parseFloat(data.min_daily_profit || 0),
        max_profit: parseFloat(data.max_daily_profit || 0)
      },
      totals: {
        revenue: parseFloat(data.total_revenue || 0),
        profit: parseFloat(data.total_profit || 0),
        days: parseInt(data.days_counted)
      },
      vs_previous_period: {
        revenue_change_percent: revenueChange,
        trend: revenueChange > 0 ? 'עלייה' : revenueChange < 0 ? 'ירידה' : 'ללא שינוי'
      },
      projected_monthly: {
        revenue: parseFloat((avgRevenue * 22).toFixed(2)), // 22 ימי עבודה
        profit: parseFloat((avgProfit * 22).toFixed(2))
      },
      projected_annual: {
        revenue: parseFloat((avgRevenue * 250).toFixed(2)), // 250 ימי עבודה בשנה
        profit: parseFloat((avgProfit * 250).toFixed(2))
      }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// POST /record-payment - רישום תשלום נכנס/יוצא
// ============================================================
router.post('/record-payment', async (req: Request, res: Response) => {
  try {
    const {
      party_type, party_id, party_name, direction, amount, currency,
      due_date, description, invoice_number, status, paid_date, paid_amount,
      payment_method, priority, auto_pay, notes
    } = req.body;

    if (!party_type || !direction || !amount || !due_date) {
      return res.status(400).json({ success: false, error: 'חובה: party_type, direction, amount, due_date' });
    }

    if (!['in', 'out'].includes(direction)) {
      return res.status(400).json({ success: false, error: 'direction חייב להיות in או out' });
    }

    const paymentStatus = paid_date ? 'paid' : (status || 'upcoming');

    const result = await pool.query(`
      INSERT INTO payment_schedule (
        party_type, party_id, party_name, direction, amount, currency, due_date,
        description, invoice_number, status, paid_date, paid_amount, payment_method,
        priority, auto_pay, notes
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
      RETURNING *
    `, [
      party_type, party_id, party_name, direction, amount, currency || 'ILS',
      due_date, description, invoice_number, paymentStatus, paid_date, paid_amount,
      payment_method, priority || 'normal', auto_pay || false, notes
    ]);

    res.json({
      success: true,
      message: `תשלום ${direction === 'in' ? 'נכנס' : 'יוצא'} נרשם בהצלחה`,
      payment: result.rows[0]
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// GET /alerts - כל ההתראות הפיננסיות
// ============================================================
router.get('/alerts', async (_req: Request, res: Response) => {
  try {
    const alerts: any[] = [];

    // נזילות נמוכה - מתוך תמונת מצב אחרונה
    const position = await pool.query(`
      SELECT total_liquidity, runway_days, projected_balance_30d, alerts
      FROM company_financial_position ORDER BY snapshot_date DESC LIMIT 1
    `);

    if (position.rows.length > 0) {
      const posAlerts = position.rows[0].alerts || [];
      alerts.push(...posAlerts);
    }

    // חובות באיחור - נכנסים
    const overdueIn = await pool.query(`
      SELECT party_name, amount, due_date, invoice_number,
        CURRENT_DATE - due_date as days_overdue
      FROM payment_schedule
      WHERE direction = 'in' AND status = 'overdue'
      ORDER BY amount DESC
    `);
    for (const row of overdueIn.rows) {
      alerts.push({
        type: 'overdue_receivable',
        severity: parseInt(row.days_overdue) > 30 ? 'critical' : 'warning',
        message_he: `חוב באיחור ${row.days_overdue} ימים: ${row.party_name} - ₪${parseFloat(row.amount).toLocaleString()}`,
        party: row.party_name,
        amount: parseFloat(row.amount),
        days_overdue: parseInt(row.days_overdue),
        invoice: row.invoice_number
      });
    }

    // חובות באיחור - יוצאים
    const overdueOut = await pool.query(`
      SELECT party_name, amount, due_date, invoice_number,
        CURRENT_DATE - due_date as days_overdue
      FROM payment_schedule
      WHERE direction = 'out' AND status = 'overdue'
      ORDER BY amount DESC
    `);
    for (const row of overdueOut.rows) {
      alerts.push({
        type: 'overdue_payable',
        severity: parseInt(row.days_overdue) > 30 ? 'critical' : 'warning',
        message_he: `אנחנו באיחור ${row.days_overdue} ימים: ₪${parseFloat(row.amount).toLocaleString()} ל-${row.party_name}`,
        party: row.party_name,
        amount: parseFloat(row.amount),
        days_overdue: parseInt(row.days_overdue),
        invoice: row.invoice_number
      });
    }

    // תשלומים גדולים קרובים
    const largePending = await pool.query(`
      SELECT party_name, amount, due_date, direction
      FROM payment_schedule
      WHERE amount > 50000 AND status = 'upcoming'
        AND due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '14 days'
      ORDER BY due_date
    `);
    for (const row of largePending.rows) {
      alerts.push({
        type: 'large_payment_upcoming',
        severity: 'info',
        message_he: `תשלום גדול ${row.direction === 'out' ? 'יוצא' : 'נכנס'}: ₪${parseFloat(row.amount).toLocaleString()} - ${row.party_name} ב-${row.due_date}`,
        direction: row.direction,
        party: row.party_name,
        amount: parseFloat(row.amount),
        due_date: row.due_date
      });
    }

    // מיון לפי חומרה
    const severityOrder: Record<string, number> = { critical: 1, warning: 2, info: 3 };
    alerts.sort((a, b) => (severityOrder[a.severity] || 4) - (severityOrder[b.severity] || 4));

    res.json({
      success: true,
      total_alerts: alerts.length,
      critical: alerts.filter(a => a.severity === 'critical').length,
      warnings: alerts.filter(a => a.severity === 'warning').length,
      info: alerts.filter(a => a.severity === 'info').length,
      alerts
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// CRUD - רווח יומי
// ============================================================
router.post('/daily-profit', async (req: Request, res: Response) => {
  try {
    const {
      date, total_revenue, total_cogs, operating_expenses,
      other_income, other_expenses, transaction_count, deals_closed,
      projects_completed, notes
    } = req.body;

    const grossProfit = (total_revenue || 0) - (total_cogs || 0);
    const operatingProfit = grossProfit - (operating_expenses || 0);
    const netProfitBeforeTax = operatingProfit + (other_income || 0) - (other_expenses || 0);
    const estimatedTax = Math.max(0, netProfitBeforeTax * 0.23); // מס חברות 23%
    const netProfit = netProfitBeforeTax - estimatedTax;

    const result = await pool.query(`
      INSERT INTO daily_profit_tracker (
        date, total_revenue, total_cogs, gross_profit, operating_expenses, operating_profit,
        other_income, other_expenses, net_profit_before_tax, estimated_tax, net_profit,
        transaction_count, deals_closed, projects_completed, notes
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
      ON CONFLICT (date) DO UPDATE SET
        total_revenue = $2, total_cogs = $3, gross_profit = $4, operating_expenses = $5,
        operating_profit = $6, other_income = $7, other_expenses = $8,
        net_profit_before_tax = $9, estimated_tax = $10, net_profit = $11,
        transaction_count = $12, deals_closed = $13, projects_completed = $14,
        notes = $15, updated_at = NOW()
      RETURNING *
    `, [
      date, total_revenue || 0, total_cogs || 0, grossProfit.toFixed(2),
      operating_expenses || 0, operatingProfit.toFixed(2),
      other_income || 0, other_expenses || 0, netProfitBeforeTax.toFixed(2),
      estimatedTax.toFixed(2), netProfit.toFixed(2),
      transaction_count || 0, deals_closed || 0, projects_completed || 0, notes
    ]);

    res.json({ success: true, profit: result.rows[0] });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// CRUD - לוח תשלומים
// ============================================================
router.get('/payments', async (req: Request, res: Response) => {
  try {
    const { direction, status, party_type, limit = 50, offset = 0 } = req.query;
    let query = `SELECT * FROM payment_schedule WHERE 1=1`;
    const params: any[] = [];
    let idx = 1;
    if (direction) { query += ` AND direction = $${idx++}`; params.push(direction); }
    if (status) { query += ` AND status = $${idx++}`; params.push(status); }
    if (party_type) { query += ` AND party_type = $${idx++}`; params.push(party_type); }
    query += ` ORDER BY due_date ASC LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(limit, offset);
    const result = await pool.query(query, params);
    res.json({ success: true, payments: result.rows });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/payments/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const fields = req.body;
    const setClauses: string[] = [];
    const params: any[] = [];
    let idx = 1;
    for (const [key, value] of Object.entries(fields)) {
      setClauses.push(`${key} = $${idx++}`);
      params.push(value);
    }
    setClauses.push('updated_at = NOW()');
    if (setClauses.length === 1) return res.status(400).json({ success: false, error: 'לא סופקו שדות' });
    params.push(id);
    const result = await pool.query(`UPDATE payment_schedule SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING *`, params);
    res.json({ success: true, payment: result.rows[0] });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
