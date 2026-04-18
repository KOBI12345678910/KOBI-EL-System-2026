// ============================================================
// מנוע חישוב עמלות ובונוסים - סוכני מכירות, מתקינים, יצרנים
// Commission & Bonus Calculator Engine
// TechnoKoluzi ERP
// ============================================================

import { Router, Request, Response } from 'express';
import pool from '@workspace/db';
import { VAT_RATE } from '../constants';

const router = Router();

// ============================================================
// אתחול טבלאות עמלות
// ============================================================
const initSQL = `
-- כללי עמלות
CREATE TABLE IF NOT EXISTS commission_rules (
  id SERIAL PRIMARY KEY,
  rule_name VARCHAR,
  rule_name_he VARCHAR,
  worker_type VARCHAR NOT NULL,
  base_rate NUMERIC(5,2) NOT NULL,
  bonus_rate NUMERIC(5,2) DEFAULT 0,
  bonus_threshold_amount NUMERIC(15,2),
  bonus_threshold_deals INTEGER,
  calculation_method VARCHAR DEFAULT 'percentage',
  per_meter_rate NUMERIC(10,2),
  include_vat BOOLEAN DEFAULT false,
  deductions JSONB DEFAULT '[]',
  conditions JSONB DEFAULT '[]',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- חישובי עמלות
CREATE TABLE IF NOT EXISTS commission_calculations (
  id SERIAL PRIMARY KEY,
  calculation_number VARCHAR UNIQUE,
  worker_id INTEGER NOT NULL,
  worker_name VARCHAR,
  worker_type VARCHAR,
  period VARCHAR NOT NULL,
  rule_id INTEGER REFERENCES commission_rules(id),
  deals JSONB DEFAULT '[]',
  total_deals INTEGER DEFAULT 0,
  total_revenue NUMERIC(15,2) DEFAULT 0,
  total_meters NUMERIC(10,2) DEFAULT 0,
  base_commission NUMERIC(15,2) DEFAULT 0,
  bonus_earned BOOLEAN DEFAULT false,
  bonus_amount NUMERIC(15,2) DEFAULT 0,
  deductions NUMERIC(15,2) DEFAULT 0,
  total_commission NUMERIC(15,2) DEFAULT 0,
  commission_before_vat NUMERIC(15,2) DEFAULT 0,
  vat_on_commission NUMERIC(15,2) DEFAULT 0,
  commission_with_vat NUMERIC(15,2) DEFAULT 0,
  payment_status VARCHAR DEFAULT 'pending',
  paid_date DATE,
  paid_amount NUMERIC(15,2),
  invoice_number VARCHAR,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- יעדי עמלות
CREATE TABLE IF NOT EXISTS commission_targets (
  id SERIAL PRIMARY KEY,
  worker_id INTEGER NOT NULL,
  worker_name VARCHAR,
  worker_type VARCHAR,
  period VARCHAR NOT NULL,
  target_deals INTEGER,
  target_revenue NUMERIC(15,2),
  target_meters NUMERIC(10,2),
  actual_deals INTEGER DEFAULT 0,
  actual_revenue NUMERIC(15,2) DEFAULT 0,
  actual_meters NUMERIC(10,2) DEFAULT 0,
  achievement_percentage NUMERIC(5,2) DEFAULT 0,
  bonus_unlocked BOOLEAN DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(worker_id, period)
);
`;

// ============================================================
// POST /init - אתחול טבלאות וכללי עמלות ברירת מחדל
// ============================================================
router.post('/init', async (req: Request, res: Response) => {
  try {
    await pool.query(initSQL);

    // כללי עמלות ברירת מחדל לכל סוגי העובדים
    const rules = [
      // סוכן מכירות - 7.5% + 2.5% בונוס על יעד
      {
        rule_name: 'Sales Agent Standard',
        rule_name_he: 'סוכן מכירות - סטנדרט',
        worker_type: 'sales_agent',
        base_rate: 7.5,
        bonus_rate: 2.5,
        bonus_threshold_amount: 100000,
        bonus_threshold_deals: 8,
        calculation_method: 'percentage',
        per_meter_rate: null,
        include_vat: false,
        deductions: JSON.stringify([
          { type: 'advance', description_he: 'מקדמה', amount: 0 },
          { type: 'returns', description_he: 'החזרות/ביטולים', amount: 0 }
        ]),
        conditions: JSON.stringify([
          { condition_he: 'עמלה מחושבת על מחיר לפני מע"מ' },
          { condition_he: 'בונוס ניתן רק אם הושג יעד חודשי של 8 עסקאות או 100,000 ₪' }
        ])
      },
      // מתקין - למטר רץ
      {
        rule_name: 'Installer Per Meter',
        rule_name_he: 'מתקין - תשלום למטר',
        worker_type: 'installer_meter',
        base_rate: 0,
        bonus_rate: 0,
        bonus_threshold_amount: null,
        bonus_threshold_deals: null,
        calculation_method: 'per_meter',
        per_meter_rate: 120,
        include_vat: false,
        deductions: JSON.stringify([]),
        conditions: JSON.stringify([
          { condition_he: 'תשלום 120 ₪ למטר רץ מותקן' },
          { condition_he: 'כולל עבודה + כלי עבודה בסיסיים' }
        ])
      },
      // מתקין - אחוז מפרויקט
      {
        rule_name: 'Installer Percentage',
        rule_name_he: 'מתקין - אחוז מפרויקט',
        worker_type: 'installer_percentage',
        base_rate: 12,
        bonus_rate: 0,
        bonus_threshold_amount: null,
        bonus_threshold_deals: null,
        calculation_method: 'percentage',
        per_meter_rate: null,
        include_vat: false,
        deductions: JSON.stringify([]),
        conditions: JSON.stringify([
          { condition_he: '12% ממחיר הפרויקט לפני מע"מ' },
          { condition_he: 'כולל עבודה + הובלה לאתר' }
        ])
      },
      // יצרן - למ"ר
      {
        rule_name: 'Producer Per SQM',
        rule_name_he: 'יצרן - תשלום למ"ר',
        worker_type: 'producer_meter',
        base_rate: 0,
        bonus_rate: 0,
        bonus_threshold_amount: null,
        bonus_threshold_deals: null,
        calculation_method: 'per_meter',
        per_meter_rate: 85,
        include_vat: false,
        deductions: JSON.stringify([]),
        conditions: JSON.stringify([
          { condition_he: 'תשלום 85 ₪ למ"ר מיוצר' },
          { condition_he: 'כולל ריתוך + שיוף + הכנה לצביעה' }
        ])
      },
      // יצרן - אחוז מפרויקט
      {
        rule_name: 'Producer Percentage',
        rule_name_he: 'יצרן - אחוז מפרויקט',
        worker_type: 'producer_percentage',
        base_rate: 8,
        bonus_rate: 0,
        bonus_threshold_amount: null,
        bonus_threshold_deals: null,
        calculation_method: 'percentage',
        per_meter_rate: null,
        include_vat: false,
        deductions: JSON.stringify([]),
        conditions: JSON.stringify([
          { condition_he: '8% ממחיר הפרויקט לפני מע"מ' },
          { condition_he: 'כולל ייצור + חומר מילוי' }
        ])
      }
    ];

    for (const rule of rules) {
      await pool.query(`
        INSERT INTO commission_rules (
          rule_name, rule_name_he, worker_type, base_rate, bonus_rate,
          bonus_threshold_amount, bonus_threshold_deals, calculation_method,
          per_meter_rate, include_vat, deductions, conditions
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
        ON CONFLICT DO NOTHING
      `, [
        rule.rule_name, rule.rule_name_he, rule.worker_type, rule.base_rate,
        rule.bonus_rate, rule.bonus_threshold_amount, rule.bonus_threshold_deals,
        rule.calculation_method, rule.per_meter_rate, rule.include_vat,
        rule.deductions, rule.conditions
      ]);
    }

    // נתוני דוגמה - יעדי סוכנים
    await pool.query(`
      INSERT INTO commission_targets (worker_id, worker_name, worker_type, period, target_deals, target_revenue, actual_deals, actual_revenue, achievement_percentage)
      VALUES
        (1, 'יוסי כהן', 'sales_agent', '2026-03', 8, 100000, 6, 78000, 78),
        (2, 'דני לוי', 'sales_agent', '2026-03', 10, 120000, 11, 135000, 112.5),
        (3, 'אבי מזרחי', 'installer_meter', '2026-03', NULL, NULL, NULL, NULL, 0)
      ON CONFLICT (worker_id, period) DO NOTHING
    `);

    res.json({
      success: true,
      message: 'מנוע עמלות אותחל בהצלחה - כללים, יעדים ונתוני דוגמה נוצרו',
      tables: ['commission_rules', 'commission_calculations', 'commission_targets'],
      rules_created: rules.length
    });
  } catch (error: any) {
    console.error('שגיאה באתחול מנוע עמלות:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// CRUD - כללי עמלות
// ============================================================

// קבלת כל הכללים
router.get('/rules', async (req: Request, res: Response) => {
  try {
    const { worker_type, is_active } = req.query;
    let where = 'WHERE 1=1';
    const params: any[] = [];

    if (worker_type) {
      params.push(worker_type);
      where += ` AND worker_type = $${params.length}`;
    }
    if (is_active !== undefined) {
      params.push(is_active === 'true');
      where += ` AND is_active = $${params.length}`;
    }

    const result = await pool.query(
      `SELECT * FROM commission_rules ${where} ORDER BY worker_type, created_at`,
      params
    );
    res.json({ success: true, data: result.rows });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// קבלת כלל בודד
router.get('/rules/:id', async (req: Request, res: Response) => {
  try {
    const result = await pool.query('SELECT * FROM commission_rules WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'כלל עמלה לא נמצא' });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// יצירת כלל חדש
router.post('/rules', async (req: Request, res: Response) => {
  try {
    const {
      rule_name, rule_name_he, worker_type, base_rate, bonus_rate,
      bonus_threshold_amount, bonus_threshold_deals, calculation_method,
      per_meter_rate, include_vat, deductions, conditions
    } = req.body;

    const result = await pool.query(`
      INSERT INTO commission_rules (
        rule_name, rule_name_he, worker_type, base_rate, bonus_rate,
        bonus_threshold_amount, bonus_threshold_deals, calculation_method,
        per_meter_rate, include_vat, deductions, conditions
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      RETURNING *
    `, [
      rule_name, rule_name_he, worker_type, base_rate, bonus_rate || 0,
      bonus_threshold_amount, bonus_threshold_deals, calculation_method || 'percentage',
      per_meter_rate, include_vat || false,
      JSON.stringify(deductions || []), JSON.stringify(conditions || [])
    ]);

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// עדכון כלל
router.put('/rules/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const fields = req.body;
    delete fields.id;
    delete fields.created_at;
    fields.updated_at = new Date().toISOString();

    if (fields.deductions) fields.deductions = JSON.stringify(fields.deductions);
    if (fields.conditions) fields.conditions = JSON.stringify(fields.conditions);

    const keys = Object.keys(fields);
    const values = Object.values(fields);
    const setClause = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');

    const result = await pool.query(
      `UPDATE commission_rules SET ${setClause} WHERE id = $${keys.length + 1} RETURNING *`,
      [...values, id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'כלל לא נמצא' });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ביטול כלל (לא מחיקה!)
router.delete('/rules/:id', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      'UPDATE commission_rules SET is_active = false, updated_at = NOW() WHERE id = $1 RETURNING *',
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'כלל לא נמצא' });
    }
    res.json({ success: true, data: result.rows[0], message: 'כלל עמלה הושבת (לא נמחק)' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// CRUD - חישובי עמלות
// ============================================================

// קבלת כל החישובים
router.get('/calculations', async (req: Request, res: Response) => {
  try {
    const { worker_id, period, payment_status, page = 1, limit = 50 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);
    let where = 'WHERE 1=1';
    const params: any[] = [];

    if (worker_id) { params.push(worker_id); where += ` AND worker_id = $${params.length}`; }
    if (period) { params.push(period); where += ` AND period = $${params.length}`; }
    if (payment_status) { params.push(payment_status); where += ` AND payment_status = $${params.length}`; }

    params.push(Number(limit), offset);
    const result = await pool.query(
      `SELECT * FROM commission_calculations ${where} ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM commission_calculations ${where}`,
      params.slice(0, -2)
    );

    res.json({
      success: true,
      data: result.rows,
      total: parseInt(countResult.rows[0].count),
      page: Number(page),
      limit: Number(limit)
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// קבלת חישוב בודד
router.get('/calculations/:id', async (req: Request, res: Response) => {
  try {
    const result = await pool.query('SELECT * FROM commission_calculations WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'חישוב עמלה לא נמצא' });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// POST /calculate/:workerId/:period - חישוב עמלה מלא מעסקאות סגורות
// ============================================================
router.post('/calculate/:workerId/:period', async (req: Request, res: Response) => {
  try {
    const { workerId, period } = req.params;
    const { deals, worker_name, worker_type, rule_id } = req.body;

    // טעינת כלל עמלה
    let rule;
    if (rule_id) {
      const ruleResult = await pool.query('SELECT * FROM commission_rules WHERE id = $1 AND is_active = true', [rule_id]);
      rule = ruleResult.rows[0];
    }
    if (!rule) {
      // חיפוש כלל לפי סוג עובד
      const ruleResult = await pool.query(
        'SELECT * FROM commission_rules WHERE worker_type = $1 AND is_active = true LIMIT 1',
        [worker_type]
      );
      rule = ruleResult.rows[0];
    }

    if (!rule) {
      return res.status(400).json({ success: false, error: 'לא נמצא כלל עמלה מתאים' });
    }

    // חישוב סכומים מהעסקאות
    const dealsList = deals || [];

    // עבור סוכני מכירות — בדיקת אימות מיקום לכל עסקה
    let locationVerifiedDeals = 0;
    let locationUnverifiedDeals = 0;
    // For sales agents: default to 0 until verified deals are confirmed. Non-sales-agent workers always get rate=1.
    let locationVerificationRate = worker_type === 'sales_agent' ? 0 : 1;

    if (worker_type === 'sales_agent') {
      for (const deal of dealsList) {
        if (deal.quote_id) {
          try {
            // Only count as verified if there is an explicit verification record with is_verified=true
            // and it belongs to this worker. Missing records are treated as unverified.
            const verResult = await pool.query(
              `SELECT is_verified FROM quote_location_verifications
               WHERE quote_id = $1 AND agent_user_id = $2
               ORDER BY created_at DESC LIMIT 1`,
              [deal.quote_id, workerId]
            );
            if (verResult.rows.length > 0 && verResult.rows[0].is_verified === true) {
              locationVerifiedDeals++;
            } else {
              // Missing record or explicitly not verified → unverified
              locationUnverifiedDeals++;
            }
          } catch {
            // On DB error, count as unverified to fail safe
            locationUnverifiedDeals++;
          }
        } else {
          // Deals without a quote_id have no location to verify — treated as unverified
          locationUnverifiedDeals++;
        }
      }
      const totalChecked = locationVerifiedDeals + locationUnverifiedDeals;
      if (totalChecked > 0) {
        locationVerificationRate = locationVerifiedDeals / totalChecked;
      } else {
        // No deals with quote_id or no deals at all → no verification data, default to full eligibility
        locationVerificationRate = 1;
      }
    }

    const totalDeals = dealsList.length;
    let totalRevenue = 0;
    let totalMeters = 0;

    for (const deal of dealsList) {
      totalRevenue += parseFloat(deal.amount) || 0;
      totalMeters += parseFloat(deal.meters) || 0;
    }

    // חישוב עמלה בסיסית
    let baseCommission = 0;
    if (rule.calculation_method === 'percentage') {
      // אחוז מההכנסות (לפני מע"מ אלא אם כן include_vat = true)
      baseCommission = totalRevenue * (parseFloat(rule.base_rate) / 100);
    } else if (rule.calculation_method === 'per_meter') {
      // לפי מטרים
      baseCommission = totalMeters * (parseFloat(rule.per_meter_rate) || 0);
    }

    // בדיקת בונוס
    let bonusEarned = false;
    let bonusAmount = 0;

    if (rule.bonus_rate > 0) {
      const meetsAmountThreshold = !rule.bonus_threshold_amount || totalRevenue >= parseFloat(rule.bonus_threshold_amount);
      const meetsDealsThreshold = !rule.bonus_threshold_deals || totalDeals >= rule.bonus_threshold_deals;

      if (meetsAmountThreshold || meetsDealsThreshold) {
        bonusEarned = true;
        bonusAmount = totalRevenue * (parseFloat(rule.bonus_rate) / 100);
        // עבור סוכני מכירות — הפחתת בונוס לפי אחוז אימות מיקום
        // עסקאות שלא אומתו מיקומית מפחיתות את הבונוס (אך לא את העמלה הבסיסית)
        if (worker_type === 'sales_agent') {
          bonusAmount = bonusAmount * locationVerificationRate;
        }
      }
    }

    // ניכויים
    let totalDeductions = 0;
    const deductions = rule.deductions || [];
    for (const ded of deductions) {
      totalDeductions += parseFloat(ded.amount) || 0;
    }

    // סך עמלה
    const totalCommission = baseCommission + bonusAmount - totalDeductions;
    const commissionBeforeVat = totalCommission;
    const vatOnCommission = totalCommission * VAT_RATE;
    const commissionWithVat = totalCommission + vatOnCommission;

    // יצירת מספר חישוב ייחודי
    const countResult = await pool.query('SELECT COUNT(*) FROM commission_calculations');
    const count = parseInt(countResult.rows[0].count) + 1;
    const calculationNumber = `COM-${period}-${String(count).padStart(4, '0')}`;

    // שמירה בDB
    const result = await pool.query(`
      INSERT INTO commission_calculations (
        calculation_number, worker_id, worker_name, worker_type, period, rule_id,
        deals, total_deals, total_revenue, total_meters,
        base_commission, bonus_earned, bonus_amount, deductions,
        total_commission, commission_before_vat, vat_on_commission, commission_with_vat
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
      RETURNING *
    `, [
      calculationNumber, workerId, worker_name, worker_type, period, rule.id,
      JSON.stringify(dealsList), totalDeals, totalRevenue, totalMeters,
      baseCommission, bonusEarned, bonusAmount, totalDeductions,
      totalCommission, commissionBeforeVat, vatOnCommission, commissionWithVat
    ]);

    // עדכון יעדים אם קיימים
    await pool.query(`
      UPDATE commission_targets SET
        actual_deals = $1, actual_revenue = $2, actual_meters = $3,
        achievement_percentage = CASE
          WHEN target_revenue > 0 THEN ($2::numeric / target_revenue) * 100
          WHEN target_deals > 0 THEN ($1::numeric / target_deals) * 100
          ELSE 0
        END,
        bonus_unlocked = $4
      WHERE worker_id = $5 AND period = $6
    `, [totalDeals, totalRevenue, totalMeters, bonusEarned, workerId, period]);

    res.json({
      success: true,
      message: 'חישוב עמלה הושלם',
      data: result.rows[0],
      breakdown: {
        rule_applied: rule.rule_name_he,
        calculation_method: rule.calculation_method,
        total_deals: totalDeals,
        total_revenue: totalRevenue,
        total_meters: totalMeters,
        base_rate: rule.calculation_method === 'percentage' ? `${rule.base_rate}%` : `${rule.per_meter_rate} ₪/מטר`,
        base_commission: baseCommission,
        bonus: {
          earned: bonusEarned,
          rate: `${rule.bonus_rate}%`,
          amount: bonusAmount,
          threshold: {
            amount: rule.bonus_threshold_amount,
            deals: rule.bonus_threshold_deals
          }
        },
        location_verification: worker_type === 'sales_agent' ? {
          verified_deals: locationVerifiedDeals,
          unverified_deals: locationUnverifiedDeals,
          verification_rate: Math.round(locationVerificationRate * 100),
          bonus_adjusted: locationVerificationRate < 1,
          note: locationVerificationRate < 1
            ? `בונוס הופחת ל-${Math.round(locationVerificationRate * 100)}% בשל ${locationUnverifiedDeals} עסקאות ללא אימות מיקום`
            : 'כל העסקאות אומתו מיקומית'
        } : null,
        deductions: totalDeductions,
        total_commission: totalCommission,
        vat: vatOnCommission,
        total_with_vat: commissionWithVat
      }
    });
  } catch (error: any) {
    console.error('שגיאה בחישוב עמלה:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// GET /commission-slip/:calculationId - תלוש עמלה מפורט
// ============================================================
router.get('/commission-slip/:calculationId', async (req: Request, res: Response) => {
  try {
    const { calculationId } = req.params;
    const calc = await pool.query('SELECT * FROM commission_calculations WHERE id = $1', [calculationId]);
    if (calc.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'חישוב עמלה לא נמצא' });
    }

    const c = calc.rows[0];
    const rule = await pool.query('SELECT * FROM commission_rules WHERE id = $1', [c.rule_id]);

    res.json({
      success: true,
      slip: {
        // כותרת
        title: 'תלוש עמלה - טכנוקולוזי',
        calculation_number: c.calculation_number,
        period: c.period,
        generated_at: new Date().toISOString(),
        // פרטי עובד
        worker: {
          id: c.worker_id,
          name: c.worker_name,
          type: c.worker_type,
          type_he: c.worker_type === 'sales_agent' ? 'סוכן מכירות' :
            c.worker_type === 'installer_meter' ? 'מתקין (למטר)' :
            c.worker_type === 'installer_percentage' ? 'מתקין (אחוז)' :
            c.worker_type === 'producer_meter' ? 'יצרן (למ"ר)' :
            c.worker_type === 'producer_percentage' ? 'יצרן (אחוז)' : c.worker_type
        },
        // כלל עמלה
        rule: rule.rows[0] || null,
        // פירוט עסקאות
        deals: c.deals || [],
        deals_summary: {
          total_deals: c.total_deals,
          total_revenue: parseFloat(c.total_revenue),
          total_meters: parseFloat(c.total_meters)
        },
        // חישוב
        calculation: {
          base_commission: parseFloat(c.base_commission),
          bonus_earned: c.bonus_earned,
          bonus_amount: parseFloat(c.bonus_amount),
          deductions: parseFloat(c.deductions),
          total_commission: parseFloat(c.total_commission),
          commission_before_vat: parseFloat(c.commission_before_vat),
          vat_on_commission: parseFloat(c.vat_on_commission),
          commission_with_vat: parseFloat(c.commission_with_vat)
        },
        // סטטוס תשלום
        payment: {
          status: c.payment_status,
          paid_date: c.paid_date,
          paid_amount: c.paid_amount ? parseFloat(c.paid_amount) : null,
          invoice_number: c.invoice_number
        },
        notes: c.notes
      }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// GET /monthly-report/:period - דוח עמלות חודשי לכל העובדים
// ============================================================
router.get('/monthly-report/:period', async (req: Request, res: Response) => {
  try {
    const { period } = req.params;

    const calculations = await pool.query(`
      SELECT * FROM commission_calculations
      WHERE period = $1
      ORDER BY worker_type, total_commission DESC
    `, [period]);

    // סיכום לפי סוג עובד
    const byType: any = {};
    let grandTotal = 0;
    let grandTotalWithVat = 0;

    for (const calc of calculations.rows) {
      const type = calc.worker_type;
      if (!byType[type]) {
        byType[type] = {
          worker_type: type,
          count: 0,
          total_commission: 0,
          total_with_vat: 0,
          workers: []
        };
      }
      byType[type].count++;
      byType[type].total_commission += parseFloat(calc.total_commission) || 0;
      byType[type].total_with_vat += parseFloat(calc.commission_with_vat) || 0;
      byType[type].workers.push({
        worker_name: calc.worker_name,
        total_deals: calc.total_deals,
        total_revenue: parseFloat(calc.total_revenue),
        commission: parseFloat(calc.total_commission),
        bonus: parseFloat(calc.bonus_amount),
        payment_status: calc.payment_status
      });

      grandTotal += parseFloat(calc.total_commission) || 0;
      grandTotalWithVat += parseFloat(calc.commission_with_vat) || 0;
    }

    res.json({
      success: true,
      period,
      summary: {
        total_workers: calculations.rows.length,
        grand_total_commission: grandTotal,
        grand_total_with_vat: grandTotalWithVat,
        by_type: Object.values(byType)
      },
      calculations: calculations.rows
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// POST /compare-payment-models/:projectId - השוואת מודלי תשלום מתקין/יצרן
// ============================================================
router.post('/compare-payment-models/:projectId', async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const {
      project_price, total_meters, total_sqm,
      installer_per_meter_rate, installer_percentage_rate,
      producer_per_meter_rate, producer_percentage_rate
    } = req.body;

    const price = parseFloat(project_price) || 0;
    const meters = parseFloat(total_meters) || 0;
    const sqm = parseFloat(total_sqm) || 0;

    // השוואת מתקין
    const instPerMeter = meters * (parseFloat(installer_per_meter_rate) || 120);
    const instPercentage = price * ((parseFloat(installer_percentage_rate) || 12) / 100);
    const instCheaper = instPerMeter <= instPercentage ? 'per_meter' : 'percentage';

    // השוואת יצרן
    const prodPerMeter = sqm * (parseFloat(producer_per_meter_rate) || 85);
    const prodPercentage = price * ((parseFloat(producer_percentage_rate) || 8) / 100);
    const prodCheaper = prodPerMeter <= prodPercentage ? 'per_meter' : 'percentage';

    // נקודות שוויון
    // מתקין: meters * per_meter_rate = price * percentage/100
    // => price = meters * per_meter_rate * 100 / percentage
    const instBreakeven = meters > 0 && installer_percentage_rate > 0
      ? (meters * (parseFloat(installer_per_meter_rate) || 120) * 100) / (parseFloat(installer_percentage_rate) || 12)
      : null;

    const prodBreakeven = sqm > 0 && producer_percentage_rate > 0
      ? (sqm * (parseFloat(producer_per_meter_rate) || 85) * 100) / (parseFloat(producer_percentage_rate) || 8)
      : null;

    res.json({
      success: true,
      project_id: projectId,
      project_price: price,
      installer: {
        per_meter: {
          rate: parseFloat(installer_per_meter_rate) || 120,
          meters,
          total: instPerMeter,
          description_he: `${parseFloat(installer_per_meter_rate) || 120} ₪ × ${meters} מטר`
        },
        percentage: {
          rate: parseFloat(installer_percentage_rate) || 12,
          total: instPercentage,
          description_he: `${parseFloat(installer_percentage_rate) || 12}% × ${price} ₪`
        },
        cheaper: instCheaper,
        saving: Math.abs(instPerMeter - instPercentage),
        breakeven_price: instBreakeven,
        recommendation_he: instCheaper === 'per_meter'
          ? `מומלץ מודל למטר - חוסך ${Math.abs(instPerMeter - instPercentage).toFixed(2)} ₪`
          : `מומלץ מודל אחוז - חוסך ${Math.abs(instPerMeter - instPercentage).toFixed(2)} ₪`
      },
      producer: {
        per_meter: {
          rate: parseFloat(producer_per_meter_rate) || 85,
          sqm,
          total: prodPerMeter,
          description_he: `${parseFloat(producer_per_meter_rate) || 85} ₪ × ${sqm} מ"ר`
        },
        percentage: {
          rate: parseFloat(producer_percentage_rate) || 8,
          total: prodPercentage,
          description_he: `${parseFloat(producer_percentage_rate) || 8}% × ${price} ₪`
        },
        cheaper: prodCheaper,
        saving: Math.abs(prodPerMeter - prodPercentage),
        breakeven_price: prodBreakeven,
        recommendation_he: prodCheaper === 'per_meter'
          ? `מומלץ מודל למ"ר - חוסך ${Math.abs(prodPerMeter - prodPercentage).toFixed(2)} ₪`
          : `מומלץ מודל אחוז - חוסך ${Math.abs(prodPerMeter - prodPercentage).toFixed(2)} ₪`
      },
      total_labor_cost_optimal: (instCheaper === 'per_meter' ? instPerMeter : instPercentage) +
        (prodCheaper === 'per_meter' ? prodPerMeter : prodPercentage),
      total_labor_cost_worst: (instCheaper !== 'per_meter' ? instPerMeter : instPercentage) +
        (prodCheaper !== 'per_meter' ? prodPerMeter : prodPercentage)
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// GET /target-progress/:workerId/:period - התקדמות ליעד
// ============================================================
router.get('/target-progress/:workerId/:period', async (req: Request, res: Response) => {
  try {
    const { workerId, period } = req.params;
    const result = await pool.query(
      'SELECT * FROM commission_targets WHERE worker_id = $1 AND period = $2',
      [workerId, period]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'לא נמצא יעד לעובד בתקופה זו' });
    }

    const t = result.rows[0];
    const dealsProgress = t.target_deals > 0 ? (t.actual_deals / t.target_deals) * 100 : 0;
    const revenueProgress = t.target_revenue > 0 ? (parseFloat(t.actual_revenue) / parseFloat(t.target_revenue)) * 100 : 0;
    const metersProgress = t.target_meters > 0 ? (parseFloat(t.actual_meters) / parseFloat(t.target_meters)) * 100 : 0;

    // חיזוי סוף חודש (לינארי)
    const dayOfMonth = new Date().getDate();
    const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
    const projectionFactor = daysInMonth / dayOfMonth;

    res.json({
      success: true,
      worker: { id: t.worker_id, name: t.worker_name, type: t.worker_type },
      period,
      targets: {
        deals: { target: t.target_deals, actual: t.actual_deals, progress: dealsProgress },
        revenue: { target: parseFloat(t.target_revenue), actual: parseFloat(t.actual_revenue), progress: revenueProgress },
        meters: { target: parseFloat(t.target_meters), actual: parseFloat(t.actual_meters), progress: metersProgress }
      },
      achievement_percentage: parseFloat(t.achievement_percentage),
      bonus_unlocked: t.bonus_unlocked,
      projection: {
        projected_deals: Math.round(t.actual_deals * projectionFactor),
        projected_revenue: parseFloat(t.actual_revenue) * projectionFactor,
        projected_meters: parseFloat(t.actual_meters) * projectionFactor,
        on_track: parseFloat(t.achievement_percentage) >= (dayOfMonth / daysInMonth * 100),
        days_remaining: daysInMonth - dayOfMonth
      }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// POST /set-target/:workerId/:period - הגדרת יעד לעובד
// ============================================================
router.post('/set-target/:workerId/:period', async (req: Request, res: Response) => {
  try {
    const { workerId, period } = req.params;
    const { worker_name, worker_type, target_deals, target_revenue, target_meters, notes } = req.body;

    const result = await pool.query(`
      INSERT INTO commission_targets (worker_id, worker_name, worker_type, period, target_deals, target_revenue, target_meters, notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      ON CONFLICT (worker_id, period) DO UPDATE SET
        target_deals = COALESCE(EXCLUDED.target_deals, commission_targets.target_deals),
        target_revenue = COALESCE(EXCLUDED.target_revenue, commission_targets.target_revenue),
        target_meters = COALESCE(EXCLUDED.target_meters, commission_targets.target_meters),
        notes = COALESCE(EXCLUDED.notes, commission_targets.notes)
      RETURNING *
    `, [workerId, worker_name, worker_type, period, target_deals, target_revenue, target_meters, notes]);

    res.json({ success: true, data: result.rows[0], message: 'יעד הוגדר/עודכן בהצלחה' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// GET /leaderboard/:period - טבלת מובילים
// ============================================================
router.get('/leaderboard/:period', async (req: Request, res: Response) => {
  try {
    const { period } = req.params;

    const result = await pool.query(`
      SELECT
        cc.worker_id, cc.worker_name, cc.worker_type,
        cc.total_deals, cc.total_revenue, cc.total_commission,
        cc.bonus_earned, cc.bonus_amount,
        ct.achievement_percentage,
        ct.target_revenue,
        RANK() OVER (ORDER BY cc.total_commission DESC) as rank
      FROM commission_calculations cc
      LEFT JOIN commission_targets ct ON cc.worker_id = ct.worker_id AND cc.period = ct.period
      WHERE cc.period = $1
      ORDER BY cc.total_commission DESC
    `, [period]);

    res.json({
      success: true,
      period,
      leaderboard: result.rows,
      top_performer: result.rows[0] || null
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// GET /dashboard - דשבורד עמלות ראשי
// ============================================================
router.get('/dashboard', async (req: Request, res: Response) => {
  try {
    // סה"כ עמלות
    const totals = await pool.query(`
      SELECT
        SUM(total_commission) as total_commissions,
        SUM(commission_with_vat) as total_with_vat,
        COUNT(*) as total_calculations,
        SUM(CASE WHEN payment_status = 'pending' THEN total_commission ELSE 0 END) as pending_payment,
        SUM(CASE WHEN payment_status = 'paid' THEN total_commission ELSE 0 END) as paid_total,
        AVG(total_commission) as avg_commission
      FROM commission_calculations
    `);

    // לפי סוג עובד
    const byType = await pool.query(`
      SELECT
        worker_type,
        COUNT(*) as count,
        SUM(total_commission) as total,
        AVG(total_commission) as average
      FROM commission_calculations
      GROUP BY worker_type
      ORDER BY total DESC
    `);

    // יעדים - כמה עומדים ביעד
    const targetAchievement = await pool.query(`
      SELECT
        COUNT(*) as total_targets,
        SUM(CASE WHEN achievement_percentage >= 100 THEN 1 ELSE 0 END) as targets_met,
        SUM(CASE WHEN bonus_unlocked = true THEN 1 ELSE 0 END) as bonuses_unlocked,
        AVG(achievement_percentage) as avg_achievement
      FROM commission_targets
    `);

    // תשלומים ממתינים
    const pendingPayments = await pool.query(`
      SELECT worker_name, worker_type, total_commission, commission_with_vat, period
      FROM commission_calculations
      WHERE payment_status = 'pending'
      ORDER BY total_commission DESC
      LIMIT 10
    `);

    res.json({
      success: true,
      dashboard: {
        totals: totals.rows[0],
        by_worker_type: byType.rows,
        target_achievement: targetAchievement.rows[0],
        pending_payments: pendingPayments.rows
      }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// GET /cost-analysis/:period - ניתוח עלות עמלות לחברה
// ============================================================
router.get('/cost-analysis/:period', async (req: Request, res: Response) => {
  try {
    const { period } = req.params;

    const result = await pool.query(`
      SELECT
        worker_type,
        COUNT(*) as workers,
        SUM(total_revenue) as total_revenue,
        SUM(total_commission) as total_commission,
        SUM(commission_with_vat) as total_with_vat,
        CASE WHEN SUM(total_revenue) > 0
          THEN (SUM(total_commission) / SUM(total_revenue)) * 100
          ELSE 0
        END as commission_to_revenue_ratio
      FROM commission_calculations
      WHERE period = $1
      GROUP BY worker_type
    `, [period]);

    const grandTotal = result.rows.reduce((s: number, r: any) => s + (parseFloat(r.total_commission) || 0), 0);
    const grandRevenue = result.rows.reduce((s: number, r: any) => s + (parseFloat(r.total_revenue) || 0), 0);

    res.json({
      success: true,
      period,
      cost_analysis: {
        by_type: result.rows,
        grand_total_commission: grandTotal,
        grand_total_revenue: grandRevenue,
        overall_commission_ratio: grandRevenue > 0 ? (grandTotal / grandRevenue) * 100 : 0,
        description_he: `סה"כ עלות עמלות בתקופה ${period}: ${grandTotal.toFixed(2)} ₪ (${grandRevenue > 0 ? ((grandTotal / grandRevenue) * 100).toFixed(1) : 0}% מההכנסות)`
      }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// POST /approve-payment/:calculationId - אישור תשלום עמלה
// ============================================================
router.post('/approve-payment/:calculationId', async (req: Request, res: Response) => {
  try {
    const { calculationId } = req.params;
    const { approved_by, notes } = req.body;

    const result = await pool.query(`
      UPDATE commission_calculations SET
        payment_status = 'approved',
        notes = COALESCE(notes || ' | ', '') || $1,
        updated_at = NOW()
      WHERE id = $2
      RETURNING *
    `, [`אושר ע"י ${approved_by || 'מנהל'} בתאריך ${new Date().toLocaleDateString('he-IL')}. ${notes || ''}`, calculationId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'חישוב עמלה לא נמצא' });
    }
    res.json({ success: true, data: result.rows[0], message: 'תשלום עמלה אושר' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// POST /mark-paid/:calculationId - סימון עמלה כשולמה
// ============================================================
router.post('/mark-paid/:calculationId', async (req: Request, res: Response) => {
  try {
    const { calculationId } = req.params;
    const { paid_amount, invoice_number, notes } = req.body;

    const result = await pool.query(`
      UPDATE commission_calculations SET
        payment_status = 'paid',
        paid_date = NOW(),
        paid_amount = $1,
        invoice_number = $2,
        notes = COALESCE(notes || ' | ', '') || $3,
        updated_at = NOW()
      WHERE id = $4
      RETURNING *
    `, [
      paid_amount, invoice_number,
      `שולם בתאריך ${new Date().toLocaleDateString('he-IL')}. חשבונית: ${invoice_number || 'N/A'}. ${notes || ''}`,
      calculationId
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'חישוב עמלה לא נמצא' });
    }
    res.json({ success: true, data: result.rows[0], message: 'עמלה סומנה כשולמה' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
