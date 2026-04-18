// ============================================================================
// מנוע אסטרטגיה וצמיחה - תכנון אסטרטגי, מודלי צמיחה וניתוח מתחרים
// Strategy & Growth Engine - Strategic Planning, Growth Models, Competitor Analysis
// ניהול אסטרטגיות חברה, מתחרים, מודלי צמיחה ומודיעין שוק
// ============================================================================

import { Router } from "express";
import { pool } from "@workspace/db";

const router = Router();

// ============================================================================
// אתחול טבלאות - יצירת כל הטבלאות של מנוע האסטרטגיה
// ============================================================================
router.post("/strategy-growth/init", async (_req, res) => {
  try {
    await pool.query(`
      -- אסטרטגיות חברה - תכנון אסטרטגי עם OKRs
      CREATE TABLE IF NOT EXISTS company_strategies (
        id SERIAL PRIMARY KEY,
        strategy_name VARCHAR(300),
        strategy_name_he VARCHAR(300),
        strategy_type VARCHAR(100),
        time_horizon VARCHAR(50),
        description TEXT,
        objectives JSONB DEFAULT '[]',
        key_results JSONB DEFAULT '[]',
        initiatives JSONB DEFAULT '[]',
        budget NUMERIC(15,2),
        responsible VARCHAR(200),
        start_date DATE,
        target_date DATE,
        progress_percent NUMERIC(5,2) DEFAULT 0,
        risks JSONB DEFAULT '[]',
        status VARCHAR(50) DEFAULT 'active',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- ניתוח מתחרים - מעקב אחרי כל מתחרה
      CREATE TABLE IF NOT EXISTS competitor_analysis (
        id SERIAL PRIMARY KEY,
        competitor_name VARCHAR(300),
        competitor_name_he VARCHAR(300),
        industry VARCHAR(200) DEFAULT 'metal_frames',
        website VARCHAR(500),
        location VARCHAR(300),
        size VARCHAR(100),
        products JSONB DEFAULT '[]',
        price_range JSONB,
        strengths JSONB DEFAULT '[]',
        weaknesses JSONB DEFAULT '[]',
        market_share_estimate NUMERIC(5,2),
        threat_level VARCHAR(50) DEFAULT 'medium',
        our_advantage TEXT,
        our_disadvantage TEXT,
        intelligence_notes TEXT,
        last_updated DATE,
        source VARCHAR(300),
        status VARCHAR(50) DEFAULT 'active',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- מודלי צמיחה - תחזיות והנחות צמיחה
      CREATE TABLE IF NOT EXISTS growth_models (
        id SERIAL PRIMARY KEY,
        model_name VARCHAR(300),
        model_type VARCHAR(100),
        current_revenue NUMERIC(15,2),
        target_revenue NUMERIC(15,2),
        growth_rate NUMERIC(5,2),
        timeline_months INTEGER,
        assumptions JSONB DEFAULT '{}',
        projections JSONB DEFAULT '[]',
        investment_required NUMERIC(15,2),
        expected_roi NUMERIC(10,2),
        breakeven_months INTEGER,
        risks TEXT,
        status VARCHAR(50) DEFAULT 'active',
        created_by VARCHAR(200),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- מודיעין שוק - מידע ותובנות ענפיות
      CREATE TABLE IF NOT EXISTS market_intelligence (
        id SERIAL PRIMARY KEY,
        topic VARCHAR(300),
        topic_he VARCHAR(300),
        category VARCHAR(100),
        source VARCHAR(300),
        data_points JSONB DEFAULT '{}',
        analysis TEXT,
        impact_on_business TEXT,
        recommended_action TEXT,
        urgency VARCHAR(50) DEFAULT 'medium',
        valid_until DATE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    res.json({ message: "טבלאות מנוע האסטרטגיה אותחלו בהצלחה" });
  } catch (error) {
    console.error("שגיאה באתחול טבלאות אסטרטגיה:", error);
    res.status(500).json({ error: "שגיאה באתחול טבלאות אסטרטגיה" });
  }
});

// ============================================================================
// CRUD - אסטרטגיות חברה
// ============================================================================

// קבלת כל האסטרטגיות
router.get("/company-strategies", async (_req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM company_strategies ORDER BY created_at DESC");
    res.json(rows);
  } catch (error) {
    console.error("שגיאה בשליפת אסטרטגיות:", error);
    res.status(500).json({ error: "שגיאה בשליפת אסטרטגיות" });
  }
});

// קבלת אסטרטגיה לפי מזהה
router.get("/company-strategies/:id", async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM company_strategies WHERE id = $1", [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: "אסטרטגיה לא נמצאה" });
    res.json(rows[0]);
  } catch (error) {
    console.error("שגיאה בשליפת אסטרטגיה:", error);
    res.status(500).json({ error: "שגיאה בשליפת אסטרטגיה" });
  }
});

// יצירת אסטרטגיה חדשה
router.post("/company-strategies", async (req, res) => {
  try {
    const { strategy_name, strategy_name_he, strategy_type, time_horizon, description, objectives, key_results, initiatives, budget, responsible, start_date, target_date, progress_percent, risks, status } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO company_strategies (strategy_name, strategy_name_he, strategy_type, time_horizon, description, objectives, key_results, initiatives, budget, responsible, start_date, target_date, progress_percent, risks, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
      [strategy_name, strategy_name_he, strategy_type, time_horizon, description, JSON.stringify(objectives || []), JSON.stringify(key_results || []), JSON.stringify(initiatives || []), budget, responsible, start_date, target_date, progress_percent, JSON.stringify(risks || []), status]
    );
    res.status(201).json(rows[0]);
  } catch (error) {
    console.error("שגיאה ביצירת אסטרטגיה:", error);
    res.status(500).json({ error: "שגיאה ביצירת אסטרטגיה" });
  }
});

// עדכון אסטרטגיה
router.put("/company-strategies/:id", async (req, res) => {
  try {
    const { strategy_name, strategy_name_he, strategy_type, time_horizon, description, objectives, key_results, initiatives, budget, responsible, start_date, target_date, progress_percent, risks, status } = req.body;
    const { rows } = await pool.query(
      `UPDATE company_strategies SET strategy_name=COALESCE($1,strategy_name), strategy_name_he=COALESCE($2,strategy_name_he),
       strategy_type=COALESCE($3,strategy_type), time_horizon=COALESCE($4,time_horizon), description=COALESCE($5,description),
       objectives=COALESCE($6,objectives), key_results=COALESCE($7,key_results), initiatives=COALESCE($8,initiatives),
       budget=COALESCE($9,budget), responsible=COALESCE($10,responsible), start_date=COALESCE($11,start_date),
       target_date=COALESCE($12,target_date), progress_percent=COALESCE($13,progress_percent), risks=COALESCE($14,risks),
       status=COALESCE($15,status), updated_at=NOW() WHERE id=$16 RETURNING *`,
      [strategy_name, strategy_name_he, strategy_type, time_horizon, description, objectives ? JSON.stringify(objectives) : null, key_results ? JSON.stringify(key_results) : null, initiatives ? JSON.stringify(initiatives) : null, budget, responsible, start_date, target_date, progress_percent, risks ? JSON.stringify(risks) : null, status, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: "אסטרטגיה לא נמצאה" });
    res.json(rows[0]);
  } catch (error) {
    console.error("שגיאה בעדכון אסטרטגיה:", error);
    res.status(500).json({ error: "שגיאה בעדכון אסטרטגיה" });
  }
});

// מחיקה רכה של אסטרטגיה
router.delete("/company-strategies/:id", async (req, res) => {
  try {
    const { rows } = await pool.query(
      "UPDATE company_strategies SET status='deleted', updated_at=NOW() WHERE id=$1 RETURNING *",
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: "אסטרטגיה לא נמצאה" });
    res.json({ message: "אסטרטגיה סומנה כמחוקה", data: rows[0] });
  } catch (error) {
    console.error("שגיאה במחיקת אסטרטגיה:", error);
    res.status(500).json({ error: "שגיאה במחיקת אסטרטגיה" });
  }
});

// ============================================================================
// CRUD - ניתוח מתחרים
// ============================================================================

// קבלת כל המתחרים
router.get("/competitor-analysis", async (_req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM competitor_analysis WHERE status != 'deleted' ORDER BY threat_level DESC, created_at DESC");
    res.json(rows);
  } catch (error) {
    console.error("שגיאה בשליפת מתחרים:", error);
    res.status(500).json({ error: "שגיאה בשליפת מתחרים" });
  }
});

// קבלת מתחרה לפי מזהה
router.get("/competitor-analysis/:id", async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM competitor_analysis WHERE id = $1", [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: "מתחרה לא נמצא" });
    res.json(rows[0]);
  } catch (error) {
    console.error("שגיאה בשליפת מתחרה:", error);
    res.status(500).json({ error: "שגיאה בשליפת מתחרה" });
  }
});

// יצירת ניתוח מתחרה חדש
router.post("/competitor-analysis", async (req, res) => {
  try {
    const { competitor_name, competitor_name_he, industry, website, location, size, products, price_range, strengths, weaknesses, market_share_estimate, threat_level, our_advantage, our_disadvantage, intelligence_notes, last_updated, source, status } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO competitor_analysis (competitor_name, competitor_name_he, industry, website, location, size, products, price_range, strengths, weaknesses, market_share_estimate, threat_level, our_advantage, our_disadvantage, intelligence_notes, last_updated, source, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING *`,
      [competitor_name, competitor_name_he, industry, website, location, size, JSON.stringify(products || []), price_range ? JSON.stringify(price_range) : null, JSON.stringify(strengths || []), JSON.stringify(weaknesses || []), market_share_estimate, threat_level, our_advantage, our_disadvantage, intelligence_notes, last_updated, source, status]
    );
    res.status(201).json(rows[0]);
  } catch (error) {
    console.error("שגיאה ביצירת ניתוח מתחרה:", error);
    res.status(500).json({ error: "שגיאה ביצירת ניתוח מתחרה" });
  }
});

// עדכון מתחרה
router.put("/competitor-analysis/:id", async (req, res) => {
  try {
    const { competitor_name, competitor_name_he, industry, website, location, size, products, price_range, strengths, weaknesses, market_share_estimate, threat_level, our_advantage, our_disadvantage, intelligence_notes, last_updated, source, status } = req.body;
    const { rows } = await pool.query(
      `UPDATE competitor_analysis SET competitor_name=COALESCE($1,competitor_name), competitor_name_he=COALESCE($2,competitor_name_he),
       industry=COALESCE($3,industry), website=COALESCE($4,website), location=COALESCE($5,location), size=COALESCE($6,size),
       products=COALESCE($7,products), price_range=COALESCE($8,price_range), strengths=COALESCE($9,strengths),
       weaknesses=COALESCE($10,weaknesses), market_share_estimate=COALESCE($11,market_share_estimate),
       threat_level=COALESCE($12,threat_level), our_advantage=COALESCE($13,our_advantage),
       our_disadvantage=COALESCE($14,our_disadvantage), intelligence_notes=COALESCE($15,intelligence_notes),
       last_updated=COALESCE($16,last_updated), source=COALESCE($17,source), status=COALESCE($18,status),
       updated_at=NOW() WHERE id=$19 RETURNING *`,
      [competitor_name, competitor_name_he, industry, website, location, size, products ? JSON.stringify(products) : null, price_range ? JSON.stringify(price_range) : null, strengths ? JSON.stringify(strengths) : null, weaknesses ? JSON.stringify(weaknesses) : null, market_share_estimate, threat_level, our_advantage, our_disadvantage, intelligence_notes, last_updated, source, status, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: "מתחרה לא נמצא" });
    res.json(rows[0]);
  } catch (error) {
    console.error("שגיאה בעדכון מתחרה:", error);
    res.status(500).json({ error: "שגיאה בעדכון מתחרה" });
  }
});

// מחיקה רכה של מתחרה
router.delete("/competitor-analysis/:id", async (req, res) => {
  try {
    const { rows } = await pool.query(
      "UPDATE competitor_analysis SET status='deleted', updated_at=NOW() WHERE id=$1 RETURNING *",
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: "מתחרה לא נמצא" });
    res.json({ message: "מתחרה סומן כמחוק", data: rows[0] });
  } catch (error) {
    console.error("שגיאה במחיקת מתחרה:", error);
    res.status(500).json({ error: "שגיאה במחיקת מתחרה" });
  }
});

// ============================================================================
// CRUD - מודלי צמיחה
// ============================================================================

// קבלת כל המודלים
router.get("/growth-models", async (_req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM growth_models WHERE status != 'deleted' ORDER BY created_at DESC");
    res.json(rows);
  } catch (error) {
    console.error("שגיאה בשליפת מודלי צמיחה:", error);
    res.status(500).json({ error: "שגיאה בשליפת מודלי צמיחה" });
  }
});

// קבלת מודל לפי מזהה
router.get("/growth-models/:id", async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM growth_models WHERE id = $1", [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: "מודל צמיחה לא נמצא" });
    res.json(rows[0]);
  } catch (error) {
    console.error("שגיאה בשליפת מודל צמיחה:", error);
    res.status(500).json({ error: "שגיאה בשליפת מודל צמיחה" });
  }
});

// יצירת מודל צמיחה חדש
router.post("/growth-models", async (req, res) => {
  try {
    const { model_name, model_type, current_revenue, target_revenue, growth_rate, timeline_months, assumptions, projections, investment_required, expected_roi, breakeven_months, risks, status, created_by } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO growth_models (model_name, model_type, current_revenue, target_revenue, growth_rate, timeline_months, assumptions, projections, investment_required, expected_roi, breakeven_months, risks, status, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
      [model_name, model_type, current_revenue, target_revenue, growth_rate, timeline_months, JSON.stringify(assumptions || {}), JSON.stringify(projections || []), investment_required, expected_roi, breakeven_months, risks, status, created_by]
    );
    res.status(201).json(rows[0]);
  } catch (error) {
    console.error("שגיאה ביצירת מודל צמיחה:", error);
    res.status(500).json({ error: "שגיאה ביצירת מודל צמיחה" });
  }
});

// עדכון מודל צמיחה
router.put("/growth-models/:id", async (req, res) => {
  try {
    const { model_name, model_type, current_revenue, target_revenue, growth_rate, timeline_months, assumptions, projections, investment_required, expected_roi, breakeven_months, risks, status, created_by } = req.body;
    const { rows } = await pool.query(
      `UPDATE growth_models SET model_name=COALESCE($1,model_name), model_type=COALESCE($2,model_type),
       current_revenue=COALESCE($3,current_revenue), target_revenue=COALESCE($4,target_revenue),
       growth_rate=COALESCE($5,growth_rate), timeline_months=COALESCE($6,timeline_months),
       assumptions=COALESCE($7,assumptions), projections=COALESCE($8,projections),
       investment_required=COALESCE($9,investment_required), expected_roi=COALESCE($10,expected_roi),
       breakeven_months=COALESCE($11,breakeven_months), risks=COALESCE($12,risks),
       status=COALESCE($13,status), created_by=COALESCE($14,created_by), updated_at=NOW()
       WHERE id=$15 RETURNING *`,
      [model_name, model_type, current_revenue, target_revenue, growth_rate, timeline_months, assumptions ? JSON.stringify(assumptions) : null, projections ? JSON.stringify(projections) : null, investment_required, expected_roi, breakeven_months, risks, status, created_by, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: "מודל צמיחה לא נמצא" });
    res.json(rows[0]);
  } catch (error) {
    console.error("שגיאה בעדכון מודל צמיחה:", error);
    res.status(500).json({ error: "שגיאה בעדכון מודל צמיחה" });
  }
});

// מחיקה רכה של מודל צמיחה
router.delete("/growth-models/:id", async (req, res) => {
  try {
    const { rows } = await pool.query(
      "UPDATE growth_models SET status='deleted', updated_at=NOW() WHERE id=$1 RETURNING *",
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: "מודל צמיחה לא נמצא" });
    res.json({ message: "מודל צמיחה סומן כמחוק", data: rows[0] });
  } catch (error) {
    console.error("שגיאה במחיקת מודל צמיחה:", error);
    res.status(500).json({ error: "שגיאה במחיקת מודל צמיחה" });
  }
});

// ============================================================================
// CRUD - מודיעין שוק
// ============================================================================

// קבלת כל המודיעין
router.get("/market-intelligence", async (_req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM market_intelligence ORDER BY created_at DESC");
    res.json(rows);
  } catch (error) {
    console.error("שגיאה בשליפת מודיעין שוק:", error);
    res.status(500).json({ error: "שגיאה בשליפת מודיעין שוק" });
  }
});

// קבלת מודיעין לפי מזהה
router.get("/market-intelligence/:id", async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM market_intelligence WHERE id = $1", [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: "מודיעין לא נמצא" });
    res.json(rows[0]);
  } catch (error) {
    console.error("שגיאה בשליפת מודיעין:", error);
    res.status(500).json({ error: "שגיאה בשליפת מודיעין" });
  }
});

// יצירת מודיעין חדש
router.post("/market-intelligence", async (req, res) => {
  try {
    const { topic, topic_he, category, source, data_points, analysis, impact_on_business, recommended_action, urgency, valid_until } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO market_intelligence (topic, topic_he, category, source, data_points, analysis, impact_on_business, recommended_action, urgency, valid_until)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [topic, topic_he, category, source, JSON.stringify(data_points || {}), analysis, impact_on_business, recommended_action, urgency, valid_until]
    );
    res.status(201).json(rows[0]);
  } catch (error) {
    console.error("שגיאה ביצירת מודיעין:", error);
    res.status(500).json({ error: "שגיאה ביצירת מודיעין" });
  }
});

// עדכון מודיעין
router.put("/market-intelligence/:id", async (req, res) => {
  try {
    const { topic, topic_he, category, source, data_points, analysis, impact_on_business, recommended_action, urgency, valid_until } = req.body;
    const { rows } = await pool.query(
      `UPDATE market_intelligence SET topic=COALESCE($1,topic), topic_he=COALESCE($2,topic_he),
       category=COALESCE($3,category), source=COALESCE($4,source), data_points=COALESCE($5,data_points),
       analysis=COALESCE($6,analysis), impact_on_business=COALESCE($7,impact_on_business),
       recommended_action=COALESCE($8,recommended_action), urgency=COALESCE($9,urgency),
       valid_until=COALESCE($10,valid_until) WHERE id=$11 RETURNING *`,
      [topic, topic_he, category, source, data_points ? JSON.stringify(data_points) : null, analysis, impact_on_business, recommended_action, urgency, valid_until, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: "מודיעין לא נמצא" });
    res.json(rows[0]);
  } catch (error) {
    console.error("שגיאה בעדכון מודיעין:", error);
    res.status(500).json({ error: "שגיאה בעדכון מודיעין" });
  }
});

// מחיקה רכה של מודיעין - סימון כלא תקף
router.delete("/market-intelligence/:id", async (req, res) => {
  try {
    const { rows } = await pool.query(
      "UPDATE market_intelligence SET valid_until=NOW()::date WHERE id=$1 RETURNING *",
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: "מודיעין לא נמצא" });
    res.json({ message: "מודיעין סומן כלא תקף", data: rows[0] });
  } catch (error) {
    console.error("שגיאה במחיקת מודיעין:", error);
    res.status(500).json({ error: "שגיאה במחיקת מודיעין" });
  }
});

// ============================================================================
// דשבורד אסטרטגי - סיכום כל המידע האסטרטגי
// ============================================================================
router.get("/strategy-growth/strategy-dashboard", async (_req, res) => {
  try {
    // סיכום אסטרטגיות
    const strategies = await pool.query(`
      SELECT COUNT(*) as total,
             COUNT(*) FILTER (WHERE status = 'active') as active,
             AVG(progress_percent) as avg_progress,
             SUM(budget) as total_budget,
             COUNT(*) FILTER (WHERE progress_percent < 25 AND target_date < NOW()) as at_risk
      FROM company_strategies
      WHERE status != 'deleted'
    `);

    // סיכום מתחרים
    const competitors = await pool.query(`
      SELECT COUNT(*) as total_competitors,
             COUNT(*) FILTER (WHERE threat_level = 'high') as high_threat,
             COUNT(*) FILTER (WHERE threat_level = 'medium') as medium_threat,
             COUNT(*) FILTER (WHERE threat_level = 'low') as low_threat,
             AVG(market_share_estimate) as avg_market_share
      FROM competitor_analysis
      WHERE status = 'active'
    `);

    // סיכום מודלי צמיחה
    const growth = await pool.query(`
      SELECT COUNT(*) as total_models,
             AVG(growth_rate) as avg_growth_rate,
             SUM(investment_required) as total_investment,
             AVG(expected_roi) as avg_expected_roi,
             AVG(breakeven_months) as avg_breakeven
      FROM growth_models
      WHERE status = 'active'
    `);

    // מודיעין שוק אחרון
    const recentIntel = await pool.query(`
      SELECT * FROM market_intelligence
      WHERE (valid_until IS NULL OR valid_until >= NOW()::date)
      ORDER BY created_at DESC
      LIMIT 10
    `);

    // אסטרטגיות בסיכון
    const atRiskStrategies = await pool.query(`
      SELECT strategy_name, strategy_name_he, progress_percent, target_date, responsible
      FROM company_strategies
      WHERE status = 'active' AND progress_percent < 30 AND target_date < NOW() + INTERVAL '90 days'
      ORDER BY target_date ASC
    `);

    res.json({
      strategies_summary: strategies.rows[0],
      competitors_summary: competitors.rows[0],
      growth_summary: growth.rows[0],
      recent_intelligence: recentIntel.rows,
      at_risk_strategies: atRiskStrategies.rows
    });
  } catch (error) {
    console.error("שגיאה בטעינת דשבורד אסטרטגי:", error);
    res.status(500).json({ error: "שגיאה בטעינת דשבורד אסטרטגי" });
  }
});

// ============================================================================
// מפת מתחרים - השוואה מלאה בין כל המתחרים
// ============================================================================
router.get("/strategy-growth/competitor-map", async (_req, res) => {
  try {
    const { rows: competitors } = await pool.query(`
      SELECT *,
             CASE
               WHEN threat_level = 'high' THEN 3
               WHEN threat_level = 'medium' THEN 2
               ELSE 1
             END as threat_score
      FROM competitor_analysis
      WHERE status = 'active'
      ORDER BY threat_level DESC, market_share_estimate DESC NULLS LAST
    `);

    // סיכום כולל
    const totalMarketShare = competitors.reduce((sum: number, c: any) => sum + (Number(c.market_share_estimate) || 0), 0);
    const ourEstimatedShare = 100 - totalMarketShare;

    res.json({
      total_competitors: competitors.length,
      competitors,
      market_overview: {
        total_competitor_share: totalMarketShare,
        our_estimated_share: ourEstimatedShare > 0 ? ourEstimatedShare : 0,
        high_threat_count: competitors.filter((c: any) => c.threat_level === 'high').length,
        dominant_competitor: competitors[0] || null
      }
    });
  } catch (error) {
    console.error("שגיאה בטעינת מפת מתחרים:", error);
    res.status(500).json({ error: "שגיאה בטעינת מפת מתחרים" });
  }
});

// ============================================================================
// תחזית צמיחה - חישוב הכנסות צפויות לפי הנחות
// ============================================================================
router.post("/strategy-growth/growth-projection", async (req, res) => {
  try {
    const { current_revenue, growth_rate, timeline_months, investment, model_name } = req.body;

    if (!current_revenue || !growth_rate || !timeline_months) {
      return res.status(400).json({ error: "נדרש הכנסה נוכחית, שיעור צמיחה ותקופת זמן" });
    }

    // חישוב תחזיות חודשיות
    const projections = [];
    let revenue = Number(current_revenue);
    const monthlyGrowthRate = Number(growth_rate) / 100 / 12;

    for (let month = 1; month <= Number(timeline_months); month++) {
      revenue = revenue * (1 + monthlyGrowthRate);
      projections.push({
        month,
        projected_revenue: Math.round(revenue * 100) / 100,
        cumulative_growth: Math.round(((revenue - Number(current_revenue)) / Number(current_revenue)) * 100 * 100) / 100
      });
    }

    const finalRevenue = projections[projections.length - 1]?.projected_revenue || current_revenue;
    const totalGrowth = Math.round(((finalRevenue - Number(current_revenue)) / Number(current_revenue)) * 100 * 100) / 100;
    const roi = investment ? Math.round(((finalRevenue - Number(current_revenue) - Number(investment)) / Number(investment)) * 100 * 100) / 100 : null;

    // שמירת המודל
    const { rows } = await pool.query(
      `INSERT INTO growth_models (model_name, model_type, current_revenue, target_revenue, growth_rate, timeline_months, assumptions, projections, investment_required, expected_roi, status, created_by)
       VALUES ($1, 'projection', $2, $3, $4, $5, $6, $7, $8, $9, 'active', 'system') RETURNING *`,
      [
        model_name || `תחזית צמיחה ${new Date().toLocaleDateString('he-IL')}`,
        current_revenue, finalRevenue, growth_rate, timeline_months,
        JSON.stringify({ growth_rate, timeline_months, investment }),
        JSON.stringify(projections),
        investment || 0, roi
      ]
    );

    res.status(201).json({
      model: rows[0],
      summary: {
        start_revenue: Number(current_revenue),
        end_revenue: finalRevenue,
        total_growth_percent: totalGrowth,
        monthly_growth_rate: Math.round(monthlyGrowthRate * 100 * 100) / 100,
        investment,
        expected_roi: roi,
        projections
      }
    });
  } catch (error) {
    console.error("שגיאה בחישוב תחזית צמיחה:", error);
    res.status(500).json({ error: "שגיאה בחישוב תחזית צמיחה" });
  }
});

// ============================================================================
// מגמות שוק - מודיעין שוק לפי קטגוריות
// ============================================================================
router.get("/strategy-growth/market-trends", async (_req, res) => {
  try {
    // מגמות לפי קטגוריה
    const byCategory = await pool.query(`
      SELECT category,
             COUNT(*) as total_items,
             COUNT(*) FILTER (WHERE urgency = 'high') as high_urgency,
             COUNT(*) FILTER (WHERE urgency = 'medium') as medium_urgency,
             COUNT(*) FILTER (WHERE urgency = 'low') as low_urgency
      FROM market_intelligence
      WHERE valid_until IS NULL OR valid_until >= NOW()::date
      GROUP BY category
      ORDER BY high_urgency DESC
    `);

    // מגמות אחרונות
    const recent = await pool.query(`
      SELECT topic, topic_he, category, source, urgency, analysis, recommended_action, created_at
      FROM market_intelligence
      WHERE valid_until IS NULL OR valid_until >= NOW()::date
      ORDER BY created_at DESC
      LIMIT 20
    `);

    // דחופים
    const urgent = await pool.query(`
      SELECT * FROM market_intelligence
      WHERE urgency = 'high' AND (valid_until IS NULL OR valid_until >= NOW()::date)
      ORDER BY created_at DESC
    `);

    res.json({
      by_category: byCategory.rows,
      recent_trends: recent.rows,
      urgent_items: urgent.rows
    });
  } catch (error) {
    console.error("שגיאה בטעינת מגמות שוק:", error);
    res.status(500).json({ error: "שגיאה בטעינת מגמות שוק" });
  }
});

// ============================================================================
// ניתוח SWOT אוטומטי - מבוסס על נתוני מתחרים ואסטרטגיות
// ============================================================================
router.get("/strategy-growth/swot-analysis", async (_req, res) => {
  try {
    // חוזקות - היתרונות שלנו מול מתחרים
    const strengths = await pool.query(`
      SELECT our_advantage as item, competitor_name as context
      FROM competitor_analysis
      WHERE status = 'active' AND our_advantage IS NOT NULL AND our_advantage != ''
      ORDER BY threat_level DESC
    `);

    // חולשות - החסרונות שלנו מול מתחרים
    const weaknesses = await pool.query(`
      SELECT our_disadvantage as item, competitor_name as context
      FROM competitor_analysis
      WHERE status = 'active' AND our_disadvantage IS NOT NULL AND our_disadvantage != ''
      ORDER BY threat_level DESC
    `);

    // הזדמנויות - מודיעין שוק עם השפעה חיובית
    const opportunities = await pool.query(`
      SELECT topic as item, topic_he as item_he, recommended_action as action, category as context
      FROM market_intelligence
      WHERE (valid_until IS NULL OR valid_until >= NOW()::date)
        AND (impact_on_business ILIKE '%חיובי%' OR impact_on_business ILIKE '%הזדמנות%' OR impact_on_business ILIKE '%positive%' OR impact_on_business ILIKE '%opportunity%')
      ORDER BY urgency DESC
    `);

    // איומים - מתחרים ברמת איום גבוהה + מודיעין שלילי
    const threats_competitors = await pool.query(`
      SELECT competitor_name as item, competitor_name_he as item_he, 'מתחרה ברמת איום גבוהה' as context
      FROM competitor_analysis
      WHERE status = 'active' AND threat_level = 'high'
    `);

    const threats_market = await pool.query(`
      SELECT topic as item, topic_he as item_he, recommended_action as action, category as context
      FROM market_intelligence
      WHERE (valid_until IS NULL OR valid_until >= NOW()::date)
        AND (impact_on_business ILIKE '%שלילי%' OR impact_on_business ILIKE '%איום%' OR impact_on_business ILIKE '%negative%' OR impact_on_business ILIKE '%threat%')
      ORDER BY urgency DESC
    `);

    // אסטרטגיות בסיכון
    const riskyStrategies = await pool.query(`
      SELECT strategy_name, strategy_name_he, risks, progress_percent
      FROM company_strategies
      WHERE status = 'active' AND (risks::text != '[]' OR progress_percent < 20)
    `);

    res.json({
      strengths: strengths.rows,
      weaknesses: weaknesses.rows,
      opportunities: opportunities.rows,
      threats: [...threats_competitors.rows, ...threats_market.rows],
      risky_strategies: riskyStrategies.rows,
      generated_at: new Date().toISOString(),
      note: "ניתוח SWOT נוצר אוטומטית מנתוני המערכת - מומלץ לבצע ניתוח ידני נוסף"
    });
  } catch (error) {
    console.error("שגיאה ביצירת ניתוח SWOT:", error);
    res.status(500).json({ error: "שגיאה ביצירת ניתוח SWOT" });
  }
});

export default router;
