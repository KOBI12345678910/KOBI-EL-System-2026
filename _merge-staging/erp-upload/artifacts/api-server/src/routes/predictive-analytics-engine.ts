// ============================================================
// Predictive Analytics Engine - מנוע אנליטיקה חזויה
// חיזוי ביקוש, סיכון נטישה, תזרים מזומנים, ניקוד לידים
// ============================================================

import { Router, Request, Response } from 'express';
import pool from '@workspace/db';

const router = Router();

// ============================================================
// אתחול טבלאות
// ============================================================
async function ensureTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS prediction_models (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      model_type VARCHAR(100) NOT NULL CHECK (model_type IN (
        'demand_forecast','churn_risk','price_optimization','delivery_delay',
        'quality_defect','cashflow_forecast','lead_scoring','supplier_risk'
      )),
      target_entity VARCHAR(255),
      features JSONB DEFAULT '[]',
      accuracy_score REAL DEFAULT 0,
      last_trained TIMESTAMPTZ,
      status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('training','active','deprecated')),
      config JSONB DEFAULT '{}',
      created_by VARCHAR(255),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS prediction_results (
      id SERIAL PRIMARY KEY,
      model_id INTEGER REFERENCES prediction_models(id) ON DELETE CASCADE,
      entity_type VARCHAR(255),
      entity_id VARCHAR(255),
      predicted_value NUMERIC,
      confidence REAL DEFAULT 0,
      prediction_date DATE DEFAULT CURRENT_DATE,
      actual_value NUMERIC,
      feedback_status VARCHAR(50) DEFAULT 'pending' CHECK (feedback_status IN ('pending','confirmed','incorrect')),
      explanation JSONB DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS prediction_feedback (
      id SERIAL PRIMARY KEY,
      prediction_id INTEGER REFERENCES prediction_results(id) ON DELETE CASCADE,
      user_id VARCHAR(255),
      feedback_type VARCHAR(50),
      comment TEXT,
      correct_value NUMERIC,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
}

ensureTables().catch(err => console.error('[Predictive Analytics] Table init error:', err));

// ============================================================
// CRUD - מודלים
// ============================================================
router.get('/predictions/models', async (_req: Request, res: Response) => {
  try {
    const { rows } = await pool.query(`
      SELECT m.*,
        (SELECT COUNT(*) FROM prediction_results WHERE model_id = m.id) as total_predictions,
        (SELECT COUNT(*) FROM prediction_results WHERE model_id = m.id AND feedback_status = 'confirmed') as confirmed_predictions
      FROM prediction_models m ORDER BY m.created_at DESC
    `);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get('/predictions/models/:id', async (req: Request, res: Response) => {
  try {
    const { rows } = await pool.query('SELECT * FROM prediction_models WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Model not found' });
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post('/predictions/models', async (req: Request, res: Response) => {
  try {
    const { name, model_type, target_entity, features, config, created_by } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO prediction_models (name, model_type, target_entity, features, config, created_by)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [name, model_type, target_entity, JSON.stringify(features || []), JSON.stringify(config || {}), created_by]
    );
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put('/predictions/models/:id', async (req: Request, res: Response) => {
  try {
    const { name, model_type, target_entity, features, config, status } = req.body;
    const { rows } = await pool.query(
      `UPDATE prediction_models SET name=$1, model_type=$2, target_entity=$3, features=$4,
       config=$5, status=$6, updated_at=NOW() WHERE id=$7 RETURNING *`,
      [name, model_type, target_entity, JSON.stringify(features || []), JSON.stringify(config || {}), status, req.params.id]
    );
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete('/predictions/models/:id', async (req: Request, res: Response) => {
  try {
    await pool.query('DELETE FROM prediction_models WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ============================================================
// הרצת מודל - מחשב חיזוי סינתטי
// ============================================================
router.post('/predictions/run/:modelId', async (req: Request, res: Response) => {
  try {
    const { rows: models } = await pool.query('SELECT * FROM prediction_models WHERE id = $1', [req.params.modelId]);
    if (!models[0]) return res.status(404).json({ error: 'Model not found' });
    const model = models[0];

    // סימולציה של הרצת מודל חיזוי
    await pool.query('UPDATE prediction_models SET last_trained = NOW(), accuracy_score = $1 WHERE id = $2',
      [Math.round((75 + Math.random() * 20) * 10) / 10, model.id]);

    const entityCount = req.body.entity_count || 10;
    const results: any[] = [];
    for (let i = 0; i < entityCount; i++) {
      const predicted = Math.round(Math.random() * 100000) / 100;
      const confidence = Math.round((60 + Math.random() * 35) * 10) / 10;
      const explanation = {
        top_features: (model.features || []).slice(0, 3).map((f: string) => ({
          feature: f, importance: Math.round(Math.random() * 100) / 100
        })),
        reasoning: `חיזוי מבוסס על ${model.model_type} עבור ישות #${i + 1}`
      };
      const { rows } = await pool.query(
        `INSERT INTO prediction_results (model_id, entity_type, entity_id, predicted_value, confidence, explanation)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [model.id, model.target_entity || 'general', `ENT-${i + 1}`, predicted, confidence, JSON.stringify(explanation)]
      );
      results.push(rows[0]);
    }
    res.json({ model_id: model.id, results_count: results.length, results });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ============================================================
// תוצאות חיזוי
// ============================================================
router.get('/predictions/results', async (req: Request, res: Response) => {
  try {
    const modelId = req.query.model_id;
    const status = req.query.feedback_status;
    let query = `SELECT r.*, m.name as model_name, m.model_type
      FROM prediction_results r JOIN prediction_models m ON r.model_id = m.id WHERE 1=1`;
    const params: any[] = [];
    if (modelId) { params.push(modelId); query += ` AND r.model_id = $${params.length}`; }
    if (status) { params.push(status); query += ` AND r.feedback_status = $${params.length}`; }
    query += ' ORDER BY r.created_at DESC LIMIT 200';
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ============================================================
// פידבק על חיזוי
// ============================================================
router.post('/predictions/:id/feedback', async (req: Request, res: Response) => {
  try {
    const { feedback_status, actual_value, user_id, comment } = req.body;
    await pool.query(
      'UPDATE prediction_results SET feedback_status = $1, actual_value = $2 WHERE id = $3',
      [feedback_status, actual_value, req.params.id]
    );
    const { rows } = await pool.query(
      `INSERT INTO prediction_feedback (prediction_id, user_id, feedback_type, comment, correct_value)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [req.params.id, user_id, feedback_status, comment, actual_value]
    );
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ============================================================
// דוח דיוק
// ============================================================
router.get('/predictions/accuracy-report', async (_req: Request, res: Response) => {
  try {
    const { rows } = await pool.query(`
      SELECT m.id, m.name, m.model_type, m.accuracy_score,
        COUNT(r.id) as total_predictions,
        COUNT(r.id) FILTER(WHERE r.feedback_status='confirmed') as confirmed,
        COUNT(r.id) FILTER(WHERE r.feedback_status='incorrect') as incorrect,
        COUNT(r.id) FILTER(WHERE r.feedback_status='pending') as pending,
        CASE WHEN COUNT(r.id) FILTER(WHERE r.feedback_status IN ('confirmed','incorrect')) > 0
          THEN ROUND(COUNT(r.id) FILTER(WHERE r.feedback_status='confirmed')::numeric /
            COUNT(r.id) FILTER(WHERE r.feedback_status IN ('confirmed','incorrect')) * 100, 1)
          ELSE 0 END as verified_accuracy,
        COALESCE(AVG(r.confidence), 0) as avg_confidence
      FROM prediction_models m
      LEFT JOIN prediction_results r ON r.model_id = m.id
      GROUP BY m.id ORDER BY m.accuracy_score DESC
    `);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ============================================================
// חיזוי ביקוש
// ============================================================
router.post('/predictions/demand-forecast', async (req: Request, res: Response) => {
  try {
    const { item_id, horizon_days = 30 } = req.body;
    const days = parseInt(horizon_days);
    const forecasts = [];
    let baseValue = 50 + Math.random() * 200;
    for (let d = 1; d <= days; d++) {
      const date = new Date();
      date.setDate(date.getDate() + d);
      const seasonal = Math.sin((d / 7) * Math.PI) * 15;
      const trend = d * 0.3;
      const noise = (Math.random() - 0.5) * 20;
      const predicted = Math.max(0, Math.round((baseValue + seasonal + trend + noise) * 100) / 100);
      const confidence = Math.round((70 + Math.random() * 25) * 10) / 10;
      forecasts.push({
        date: date.toISOString().split('T')[0],
        predicted_demand: predicted,
        confidence,
        lower_bound: Math.round(predicted * 0.85 * 100) / 100,
        upper_bound: Math.round(predicted * 1.15 * 100) / 100,
      });
    }
    res.json({
      item_id: item_id || 'all',
      horizon_days: days,
      forecasts,
      summary: {
        avg_daily_demand: Math.round(forecasts.reduce((s, f) => s + f.predicted_demand, 0) / days * 100) / 100,
        peak_day: forecasts.reduce((max, f) => f.predicted_demand > max.predicted_demand ? f : max, forecasts[0]),
        total_demand: Math.round(forecasts.reduce((s, f) => s + f.predicted_demand, 0) * 100) / 100,
        avg_confidence: Math.round(forecasts.reduce((s, f) => s + f.confidence, 0) / days * 10) / 10,
      }
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ============================================================
// סיכון נטישה
// ============================================================
router.post('/predictions/churn-risk', async (req: Request, res: Response) => {
  try {
    const { customer_id } = req.body;
    // סימולציה של ניתוח נטישה
    const churnProb = Math.round((Math.random() * 80 + 10) * 10) / 10;
    const riskLevel = churnProb >= 70 ? 'critical' : churnProb >= 50 ? 'high' : churnProb >= 30 ? 'medium' : 'low';
    const factors = [
      { factor: 'ירידה בנפח הזמנות', impact: Math.round(Math.random() * 40) },
      { factor: 'זמן מאז רכישה אחרונה', impact: Math.round(Math.random() * 30) },
      { factor: 'פניות תמיכה ללא מענה', impact: Math.round(Math.random() * 20) },
      { factor: 'מעבר למתחרים', impact: Math.round(Math.random() * 15) },
      { factor: 'ירידה בשימוש', impact: Math.round(Math.random() * 25) },
    ].sort((a, b) => b.impact - a.impact);

    const recommendations = [
      churnProb >= 60 ? 'פנייה אישית מנהל תיק לקוח' : null,
      churnProb >= 40 ? 'הצעת הנחה / מבצע שימור' : null,
      'בדיקת שביעות רצון טלפונית',
      'שליחת תוכן ערך מוסף',
      churnProb >= 70 ? 'הסלמה להנהלה' : null,
    ].filter(Boolean);

    res.json({
      customer_id: customer_id || 'general',
      churn_probability: churnProb,
      risk_level: riskLevel,
      factors,
      recommendations,
      estimated_revenue_at_risk: Math.round(Math.random() * 500000),
      retention_cost_estimate: Math.round(Math.random() * 15000),
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ============================================================
// חיזוי תזרים מזומנים
// ============================================================
router.post('/predictions/cashflow-forecast', async (req: Request, res: Response) => {
  try {
    const { days_ahead = 90 } = req.body;
    const days = parseInt(days_ahead);
    let balance = 100000 + Math.random() * 500000;
    const forecasts = [];
    for (let d = 1; d <= days; d++) {
      const date = new Date();
      date.setDate(date.getDate() + d);
      const inflow = Math.round((Math.random() * 50000 + (d % 30 < 5 ? 80000 : 10000)) * 100) / 100;
      const outflow = Math.round((Math.random() * 40000 + (d % 30 > 25 ? 70000 : 15000)) * 100) / 100;
      balance = Math.round((balance + inflow - outflow) * 100) / 100;
      forecasts.push({
        date: date.toISOString().split('T')[0],
        inflow, outflow,
        net: Math.round((inflow - outflow) * 100) / 100,
        balance,
        confidence: Math.round((85 - d * 0.3 + Math.random() * 10) * 10) / 10,
      });
    }
    const minBalance = forecasts.reduce((min, f) => f.balance < min.balance ? f : min, forecasts[0]);
    res.json({
      days_ahead: days,
      starting_balance: forecasts[0]?.balance,
      ending_balance: forecasts[forecasts.length - 1]?.balance,
      min_balance: { date: minBalance.date, balance: minBalance.balance },
      total_inflow: Math.round(forecasts.reduce((s, f) => s + f.inflow, 0) * 100) / 100,
      total_outflow: Math.round(forecasts.reduce((s, f) => s + f.outflow, 0) * 100) / 100,
      risk_days: forecasts.filter(f => f.balance < 50000).length,
      forecasts,
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ============================================================
// דשבורד ראשי
// ============================================================
router.get('/predictions/dashboard', async (_req: Request, res: Response) => {
  try {
    const modelsQ = pool.query(`SELECT COUNT(*) as total, COUNT(*) FILTER(WHERE status='active') as active,
      COALESCE(AVG(accuracy_score),0) as avg_accuracy FROM prediction_models`);
    const resultsQ = pool.query(`SELECT COUNT(*) as total,
      COUNT(*) FILTER(WHERE prediction_date = CURRENT_DATE) as today,
      COUNT(*) FILTER(WHERE feedback_status='confirmed') as confirmed,
      COUNT(*) FILTER(WHERE feedback_status='incorrect') as incorrect,
      COALESCE(AVG(confidence),0) as avg_confidence
      FROM prediction_results`);
    const byTypeQ = pool.query(`SELECT m.model_type, COUNT(r.id) as predictions, COALESCE(AVG(r.confidence),0) as avg_confidence
      FROM prediction_models m LEFT JOIN prediction_results r ON r.model_id = m.id
      GROUP BY m.model_type ORDER BY predictions DESC`);
    const recentQ = pool.query(`SELECT r.*, m.name as model_name, m.model_type
      FROM prediction_results r JOIN prediction_models m ON r.model_id = m.id
      ORDER BY r.created_at DESC LIMIT 10`);

    const [models, results, byType, recent] = await Promise.all([modelsQ, resultsQ, byTypeQ, recentQ]);
    res.json({
      models: models.rows[0],
      results: results.rows[0],
      by_type: byType.rows,
      recent: recent.rows,
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
