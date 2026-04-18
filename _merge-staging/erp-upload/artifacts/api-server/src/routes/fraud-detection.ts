import { Router, Request, Response } from "express";
import { pool } from "@workspace/db";

const router = Router();

/* ───── AUTO-CREATE TABLES ───── */
async function ensureTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS fraud_rules (
      id SERIAL PRIMARY KEY,
      rule_name VARCHAR(300) NOT NULL,
      rule_type VARCHAR(40) NOT NULL CHECK (rule_type IN ('discount_abuse','price_manipulation','measurement_mismatch','expense_anomaly','ghost_employee','duplicate_invoice','unusual_hours','location_fraud')),
      condition JSONB DEFAULT '{}',
      severity VARCHAR(20) DEFAULT 'medium' CHECK (severity IN ('low','medium','high','critical')),
      enabled BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS fraud_alerts (
      id SERIAL PRIMARY KEY,
      rule_id INTEGER REFERENCES fraud_rules(id) ON DELETE SET NULL,
      entity_type VARCHAR(100),
      entity_id INTEGER,
      entity_name VARCHAR(300),
      description TEXT,
      severity VARCHAR(20) DEFAULT 'medium' CHECK (severity IN ('low','medium','high','critical')),
      evidence JSONB DEFAULT '{}',
      status VARCHAR(30) DEFAULT 'open' CHECK (status IN ('open','investigating','confirmed','dismissed')),
      assigned_to VARCHAR(200),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS fraud_investigations (
      id SERIAL PRIMARY KEY,
      alert_id INTEGER REFERENCES fraud_alerts(id) ON DELETE CASCADE,
      investigator_id INTEGER,
      findings TEXT,
      conclusion VARCHAR(30) CHECK (conclusion IN ('fraud_confirmed','false_positive','inconclusive')),
      action_taken TEXT,
      financial_impact NUMERIC(15,2) DEFAULT 0,
      closed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // Seed default rules if empty
  const { rows } = await pool.query("SELECT COUNT(*) as cnt FROM fraud_rules");
  if (Number(rows[0].cnt) === 0) {
    await pool.query(`
      INSERT INTO fraud_rules (rule_name, rule_type, condition, severity) VALUES
        ('הנחה מעל 15% ללא אישור', 'discount_abuse', '{"max_discount_pct": 15}', 'high'),
        ('מחיר הצעה מתחת לעלות', 'price_manipulation', '{"below_cost": true}', 'critical'),
        ('פער מדידה מעל 10%', 'measurement_mismatch', '{"max_deviation_pct": 10}', 'high'),
        ('מספר חשבונית כפול מספקים שונים', 'duplicate_invoice', '{"check_invoice_number": true}', 'critical'),
        ('רישום שעות בחגים', 'unusual_hours', '{"check_holidays": true}', 'medium'),
        ('מיקום סוכן לא תואם כתובת הצעה', 'location_fraud', '{"max_distance_km": 50}', 'high')
    `);
  }
}
ensureTables().catch(e => console.error("fraud-detection tables:", e.message));

/* ───── FRAUD RULES CRUD ───── */
router.get("/api/fraud/rules", async (_req: Request, res: Response) => {
  try {
    const { rows } = await pool.query("SELECT * FROM fraud_rules ORDER BY severity DESC, created_at DESC");
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/api/fraud/rules", async (req: Request, res: Response) => {
  try {
    const { rule_name, rule_type, condition, severity, enabled } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO fraud_rules (rule_name, rule_type, condition, severity, enabled) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [rule_name, rule_type, JSON.stringify(condition || {}), severity || 'medium', enabled !== false]
    );
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put("/api/fraud/rules/:id", async (req: Request, res: Response) => {
  try {
    const { rule_name, rule_type, condition, severity, enabled } = req.body;
    const { rows } = await pool.query(
      `UPDATE fraud_rules SET rule_name=$1, rule_type=$2, condition=$3, severity=$4, enabled=$5 WHERE id=$6 RETURNING *`,
      [rule_name, rule_type, JSON.stringify(condition || {}), severity, enabled, req.params.id]
    );
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete("/api/fraud/rules/:id", async (req: Request, res: Response) => {
  try {
    await pool.query("DELETE FROM fraud_rules WHERE id = $1", [req.params.id]);
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

/* ───── FRAUD ALERTS ───── */
router.get("/api/fraud/alerts", async (req: Request, res: Response) => {
  try {
    const { status, severity } = req.query;
    let where = "WHERE 1=1";
    if (status && status !== 'all') where += ` AND fa.status = '${status}'`;
    if (severity && severity !== 'all') where += ` AND fa.severity = '${severity}'`;

    const { rows } = await pool.query(`
      SELECT fa.*, fr.rule_name, fr.rule_type
      FROM fraud_alerts fa
      LEFT JOIN fraud_rules fr ON fr.id = fa.rule_id
      ${where}
      ORDER BY
        CASE fa.severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
        fa.created_at DESC
    `);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/api/fraud/alerts", async (req: Request, res: Response) => {
  try {
    const { rule_id, entity_type, entity_id, entity_name, description, severity, evidence, assigned_to } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO fraud_alerts (rule_id, entity_type, entity_id, entity_name, description, severity, evidence, assigned_to) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [rule_id, entity_type, entity_id, entity_name, description, severity || 'medium', JSON.stringify(evidence || {}), assigned_to]
    );
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Investigate an alert
router.post("/api/fraud/alerts/:id/investigate", async (req: Request, res: Response) => {
  try {
    const { assigned_to } = req.body;
    await pool.query("UPDATE fraud_alerts SET status = 'investigating', assigned_to = $1 WHERE id = $2", [assigned_to || 'system', req.params.id]);
    const { rows } = await pool.query("SELECT * FROM fraud_alerts WHERE id = $1", [req.params.id]);
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Dismiss an alert
router.post("/api/fraud/alerts/:id/dismiss", async (req: Request, res: Response) => {
  try {
    await pool.query("UPDATE fraud_alerts SET status = 'dismissed' WHERE id = $1", [req.params.id]);

    // Auto-create investigation with false_positive
    const { rows: alertRows } = await pool.query("SELECT * FROM fraud_alerts WHERE id = $1", [req.params.id]);
    if (alertRows.length) {
      await pool.query(
        `INSERT INTO fraud_investigations (alert_id, findings, conclusion, action_taken, closed_at) VALUES ($1, $2, 'false_positive', 'התראה נדחתה', NOW())`,
        [req.params.id, req.body.reason || 'נדחה ידנית']
      );
    }
    res.json(alertRows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

/* ───── SCAN - Run all rules against recent data ───── */
router.post("/api/fraud/scan", async (_req: Request, res: Response) => {
  try {
    const { rows: rules } = await pool.query("SELECT * FROM fraud_rules WHERE enabled = true");
    const alerts: any[] = [];

    for (const rule of rules) {
      const cond = rule.condition || {};

      if (rule.rule_type === 'discount_abuse') {
        const maxDiscount = cond.max_discount_pct || 15;
        try {
          const { rows: discounts } = await pool.query(`
            SELECT id, data->>'customer_name' as name, (data->>'discount_pct')::numeric as discount
            FROM entity_records
            WHERE (data->>'discount_pct')::numeric > $1
            AND created_at >= NOW() - INTERVAL '7 days'
            LIMIT 20
          `, [maxDiscount]);
          for (const d of discounts) {
            const exists = await pool.query("SELECT id FROM fraud_alerts WHERE entity_id = $1 AND rule_id = $2 AND created_at >= NOW() - INTERVAL '7 days'", [d.id, rule.id]);
            if (!exists.rows.length) {
              const { rows: [alert] } = await pool.query(
                `INSERT INTO fraud_alerts (rule_id, entity_type, entity_id, entity_name, description, severity, evidence) VALUES ($1,'quote',$2,$3,$4,$5,$6) RETURNING *`,
                [rule.id, d.id, d.name, `הנחה של ${d.discount}% מעל המותר (${maxDiscount}%)`, rule.severity, JSON.stringify({ discount_pct: d.discount, threshold: maxDiscount })]
              );
              alerts.push(alert);
            }
          }
        } catch { /* table might not exist */ }
      }

      if (rule.rule_type === 'duplicate_invoice') {
        try {
          const { rows: dupes } = await pool.query(`
            SELECT data->>'invoice_number' as inv_num, COUNT(*) as cnt, array_agg(data->>'supplier_name') as suppliers
            FROM entity_records
            WHERE data->>'invoice_number' IS NOT NULL
            AND created_at >= NOW() - INTERVAL '30 days'
            GROUP BY data->>'invoice_number'
            HAVING COUNT(DISTINCT data->>'supplier_name') > 1
            LIMIT 20
          `);
          for (const d of dupes) {
            const { rows: [alert] } = await pool.query(
              `INSERT INTO fraud_alerts (rule_id, entity_type, entity_name, description, severity, evidence) VALUES ($1,'invoice',NULL,$2,$3,$4) RETURNING *`,
              [rule.id, `חשבונית כפולה: ${d.inv_num}`, `חשבונית ${d.inv_num} מופיעה אצל ${d.cnt} ספקים`, rule.severity, JSON.stringify({ invoice_number: d.inv_num, count: d.cnt, suppliers: d.suppliers })]
            );
            alerts.push(alert);
          }
        } catch { /* ignore */ }
      }

      if (rule.rule_type === 'unusual_hours') {
        try {
          const { rows: unusual } = await pool.query(`
            SELECT id, data->>'employee_name' as name, created_at
            FROM entity_records
            WHERE EXTRACT(DOW FROM created_at) IN (0, 6)
            AND created_at >= NOW() - INTERVAL '7 days'
            LIMIT 20
          `);
          for (const u of unusual) {
            const exists = await pool.query("SELECT id FROM fraud_alerts WHERE entity_id = $1 AND rule_id = $2 AND created_at >= NOW() - INTERVAL '7 days'", [u.id, rule.id]);
            if (!exists.rows.length) {
              const { rows: [alert] } = await pool.query(
                `INSERT INTO fraud_alerts (rule_id, entity_type, entity_id, entity_name, description, severity, evidence) VALUES ($1,'timesheet',$2,$3,$4,$5,$6) RETURNING *`,
                [rule.id, u.id, u.name, `רישום שעות ביום חופש: ${new Date(u.created_at).toLocaleDateString('he-IL')}`, rule.severity, JSON.stringify({ date: u.created_at })]
              );
              alerts.push(alert);
            }
          }
        } catch { /* ignore */ }
      }
    }

    res.json({ scanned_rules: rules.length, new_alerts: alerts.length, alerts });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

/* ───── INVESTIGATIONS ───── */
router.get("/api/fraud/investigations", async (_req: Request, res: Response) => {
  try {
    const { rows } = await pool.query(`
      SELECT fi.*, fa.description as alert_description, fa.severity as alert_severity, fa.entity_name
      FROM fraud_investigations fi
      LEFT JOIN fraud_alerts fa ON fa.id = fi.alert_id
      ORDER BY fi.created_at DESC
    `);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/api/fraud/investigations", async (req: Request, res: Response) => {
  try {
    const { alert_id, investigator_id, findings, conclusion, action_taken, financial_impact } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO fraud_investigations (alert_id, investigator_id, findings, conclusion, action_taken, financial_impact, closed_at) VALUES ($1,$2,$3,$4,$5,$6, CASE WHEN $4 IS NOT NULL THEN NOW() ELSE NULL END) RETURNING *`,
      [alert_id, investigator_id, findings, conclusion, action_taken, financial_impact || 0]
    );

    // Update alert status if conclusion given
    if (conclusion && alert_id) {
      const newStatus = conclusion === 'fraud_confirmed' ? 'confirmed' : conclusion === 'false_positive' ? 'dismissed' : 'investigating';
      await pool.query("UPDATE fraud_alerts SET status = $1 WHERE id = $2", [newStatus, alert_id]);
    }

    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

/* ───── DASHBOARD ───── */
router.get("/api/fraud/dashboard", async (_req: Request, res: Response) => {
  try {
    const { rows: [counts] } = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'open') as open_alerts,
        COUNT(*) FILTER (WHERE status = 'investigating') as investigating_alerts,
        COUNT(*) FILTER (WHERE status = 'confirmed') as confirmed_alerts,
        COUNT(*) FILTER (WHERE status = 'dismissed') as dismissed_alerts,
        COUNT(*) FILTER (WHERE severity = 'critical' AND status IN ('open','investigating')) as critical_count,
        COUNT(*) FILTER (WHERE severity = 'high' AND status IN ('open','investigating')) as high_count,
        COUNT(*) FILTER (WHERE severity = 'medium' AND status IN ('open','investigating')) as medium_count,
        COUNT(*) FILTER (WHERE severity = 'low' AND status IN ('open','investigating')) as low_count,
        (SELECT COUNT(*) FROM fraud_rules WHERE enabled = true) as active_rules,
        (SELECT COALESCE(SUM(financial_impact), 0) FROM fraud_investigations WHERE conclusion = 'fraud_confirmed') as total_fraud_impact
      FROM fraud_alerts
    `);

    const { rows: recentAlerts } = await pool.query(`
      SELECT fa.*, fr.rule_name, fr.rule_type
      FROM fraud_alerts fa
      LEFT JOIN fraud_rules fr ON fr.id = fa.rule_id
      WHERE fa.status IN ('open','investigating')
      ORDER BY
        CASE fa.severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
        fa.created_at DESC
      LIMIT 15
    `);

    const { rows: ruleStats } = await pool.query(`
      SELECT fr.id, fr.rule_name, fr.rule_type, fr.severity, fr.enabled,
        COUNT(fa.id) as alert_count,
        COUNT(fa.id) FILTER (WHERE fa.status = 'confirmed') as confirmed_count
      FROM fraud_rules fr
      LEFT JOIN fraud_alerts fa ON fa.rule_id = fr.id
      GROUP BY fr.id ORDER BY alert_count DESC
    `);

    const { rows: monthlyTrend } = await pool.query(`
      SELECT TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') as month,
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'confirmed') as confirmed
      FROM fraud_alerts
      WHERE created_at >= NOW() - INTERVAL '6 months'
      GROUP BY DATE_TRUNC('month', created_at)
      ORDER BY month ASC
    `);

    res.json({ ...counts, recentAlerts, ruleStats, monthlyTrend });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
