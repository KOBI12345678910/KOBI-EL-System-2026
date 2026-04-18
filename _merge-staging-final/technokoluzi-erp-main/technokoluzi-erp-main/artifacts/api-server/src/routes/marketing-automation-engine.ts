// ============================================================================
// מנוע אוטומציית שיווק וניהול רשתות חברתיות בינה מלאכותית
// Marketing Automation + Social Media AI Management Engine
// ניהול משפכי שיווק, פוסטים ברשתות, תקציבי שיווק ודפי נחיתה
// ============================================================================

import { Router } from "express";
import { pool } from "@workspace/db";

const router = Router();

// ============================================================================
// אתחול טבלאות - יצירת כל הטבלאות של מנוע השיווק
// ============================================================================
router.post("/marketing-automation/init", async (_req, res) => {
  try {
    await pool.query(`
      -- משפכי שיווק - ניהול כל שלבי המשפך
      CREATE TABLE IF NOT EXISTS marketing_funnels (
        id SERIAL PRIMARY KEY,
        funnel_name VARCHAR(300),
        funnel_name_he VARCHAR(300),
        stages JSONB DEFAULT '[]',
        total_leads INTEGER DEFAULT 0,
        conversion_rate NUMERIC(5,2) DEFAULT 0,
        revenue_generated NUMERIC(15,2) DEFAULT 0,
        cost NUMERIC(15,2) DEFAULT 0,
        roi_percent NUMERIC(10,2),
        channel VARCHAR(200),
        target_audience VARCHAR(500),
        status VARCHAR(50) DEFAULT 'active',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- פוסטים ברשתות חברתיות - ניהול תוכן ופרסומים
      CREATE TABLE IF NOT EXISTS social_media_posts (
        id SERIAL PRIMARY KEY,
        platform VARCHAR(100),
        post_type VARCHAR(100),
        content TEXT,
        content_he TEXT,
        media_urls JSONB DEFAULT '[]',
        hashtags JSONB DEFAULT '[]',
        scheduled_at TIMESTAMPTZ,
        published_at TIMESTAMPTZ,
        reach INTEGER DEFAULT 0,
        impressions INTEGER DEFAULT 0,
        clicks INTEGER DEFAULT 0,
        likes INTEGER DEFAULT 0,
        shares INTEGER DEFAULT 0,
        comments INTEGER DEFAULT 0,
        leads_generated INTEGER DEFAULT 0,
        ai_generated BOOLEAN DEFAULT false,
        ai_prompt TEXT,
        approval_status VARCHAR(50) DEFAULT 'draft',
        approved_by VARCHAR(200),
        notes TEXT,
        status VARCHAR(50) DEFAULT 'draft',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- תקציבי שיווק - מעקב תקציב לפי ערוץ
      CREATE TABLE IF NOT EXISTS marketing_budget (
        id SERIAL PRIMARY KEY,
        channel VARCHAR(200),
        campaign_name VARCHAR(300),
        period VARCHAR(50),
        fiscal_year INTEGER,
        planned_budget NUMERIC(15,2) DEFAULT 0,
        spent NUMERIC(15,2) DEFAULT 0,
        remaining NUMERIC(15,2) DEFAULT 0,
        leads_generated INTEGER DEFAULT 0,
        cost_per_lead NUMERIC(15,2),
        deals_closed INTEGER DEFAULT 0,
        revenue NUMERIC(15,2) DEFAULT 0,
        roi_percent NUMERIC(10,2),
        notes TEXT,
        status VARCHAR(50) DEFAULT 'active',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- דפי נחיתה - ניהול ומעקב המרות
      CREATE TABLE IF NOT EXISTS landing_pages (
        id SERIAL PRIMARY KEY,
        page_name VARCHAR(300),
        page_url TEXT,
        template VARCHAR(200),
        headline_he TEXT,
        description_he TEXT,
        cta_text VARCHAR(200),
        form_fields JSONB DEFAULT '[]',
        total_visits INTEGER DEFAULT 0,
        total_submissions INTEGER DEFAULT 0,
        conversion_rate NUMERIC(5,2) DEFAULT 0,
        ab_variant VARCHAR(50),
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    res.json({ message: "טבלאות מנוע השיווק אותחלו בהצלחה" });
  } catch (error) {
    console.error("שגיאה באתחול טבלאות שיווק:", error);
    res.status(500).json({ error: "שגיאה באתחול טבלאות שיווק" });
  }
});

// ============================================================================
// CRUD - משפכי שיווק
// ============================================================================

// קבלת כל המשפכים
router.get("/marketing-funnels", async (_req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM marketing_funnels ORDER BY created_at DESC");
    res.json(rows);
  } catch (error) {
    console.error("שגיאה בשליפת משפכי שיווק:", error);
    res.status(500).json({ error: "שגיאה בשליפת משפכי שיווק" });
  }
});

// קבלת משפך לפי מזהה
router.get("/marketing-funnels/:id", async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM marketing_funnels WHERE id = $1", [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: "משפך לא נמצא" });
    res.json(rows[0]);
  } catch (error) {
    console.error("שגיאה בשליפת משפך:", error);
    res.status(500).json({ error: "שגיאה בשליפת משפך" });
  }
});

// יצירת משפך חדש
router.post("/marketing-funnels", async (req, res) => {
  try {
    const { funnel_name, funnel_name_he, stages, total_leads, conversion_rate, revenue_generated, cost, roi_percent, channel, target_audience, status } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO marketing_funnels (funnel_name, funnel_name_he, stages, total_leads, conversion_rate, revenue_generated, cost, roi_percent, channel, target_audience, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [funnel_name, funnel_name_he, JSON.stringify(stages || []), total_leads, conversion_rate, revenue_generated, cost, roi_percent, channel, target_audience, status]
    );
    res.status(201).json(rows[0]);
  } catch (error) {
    console.error("שגיאה ביצירת משפך:", error);
    res.status(500).json({ error: "שגיאה ביצירת משפך" });
  }
});

// עדכון משפך
router.put("/marketing-funnels/:id", async (req, res) => {
  try {
    const { funnel_name, funnel_name_he, stages, total_leads, conversion_rate, revenue_generated, cost, roi_percent, channel, target_audience, status } = req.body;
    const { rows } = await pool.query(
      `UPDATE marketing_funnels SET funnel_name=COALESCE($1,funnel_name), funnel_name_he=COALESCE($2,funnel_name_he), stages=COALESCE($3,stages),
       total_leads=COALESCE($4,total_leads), conversion_rate=COALESCE($5,conversion_rate), revenue_generated=COALESCE($6,revenue_generated),
       cost=COALESCE($7,cost), roi_percent=COALESCE($8,roi_percent), channel=COALESCE($9,channel), target_audience=COALESCE($10,target_audience),
       status=COALESCE($11,status), updated_at=NOW() WHERE id=$12 RETURNING *`,
      [funnel_name, funnel_name_he, stages ? JSON.stringify(stages) : null, total_leads, conversion_rate, revenue_generated, cost, roi_percent, channel, target_audience, status, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: "משפך לא נמצא" });
    res.json(rows[0]);
  } catch (error) {
    console.error("שגיאה בעדכון משפך:", error);
    res.status(500).json({ error: "שגיאה בעדכון משפך" });
  }
});

// מחיקה רכה של משפך
router.delete("/marketing-funnels/:id", async (req, res) => {
  try {
    const { rows } = await pool.query(
      "UPDATE marketing_funnels SET status='deleted', updated_at=NOW() WHERE id=$1 RETURNING *",
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: "משפך לא נמצא" });
    res.json({ message: "משפך סומן כמחוק", data: rows[0] });
  } catch (error) {
    console.error("שגיאה במחיקת משפך:", error);
    res.status(500).json({ error: "שגיאה במחיקת משפך" });
  }
});

// ============================================================================
// CRUD - פוסטים ברשתות חברתיות
// ============================================================================

// קבלת כל הפוסטים
router.get("/social-media-posts", async (_req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM social_media_posts ORDER BY created_at DESC");
    res.json(rows);
  } catch (error) {
    console.error("שגיאה בשליפת פוסטים:", error);
    res.status(500).json({ error: "שגיאה בשליפת פוסטים" });
  }
});

// קבלת פוסט לפי מזהה
router.get("/social-media-posts/:id", async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM social_media_posts WHERE id = $1", [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: "פוסט לא נמצא" });
    res.json(rows[0]);
  } catch (error) {
    console.error("שגיאה בשליפת פוסט:", error);
    res.status(500).json({ error: "שגיאה בשליפת פוסט" });
  }
});

// יצירת פוסט חדש
router.post("/social-media-posts", async (req, res) => {
  try {
    const { platform, post_type, content, content_he, media_urls, hashtags, scheduled_at, published_at, reach, impressions, clicks, likes, shares, comments, leads_generated, ai_generated, ai_prompt, approval_status, approved_by, notes, status } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO social_media_posts (platform, post_type, content, content_he, media_urls, hashtags, scheduled_at, published_at, reach, impressions, clicks, likes, shares, comments, leads_generated, ai_generated, ai_prompt, approval_status, approved_by, notes, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21) RETURNING *`,
      [platform, post_type, content, content_he, JSON.stringify(media_urls || []), JSON.stringify(hashtags || []), scheduled_at, published_at, reach, impressions, clicks, likes, shares, comments, leads_generated, ai_generated, ai_prompt, approval_status, approved_by, notes, status]
    );
    res.status(201).json(rows[0]);
  } catch (error) {
    console.error("שגיאה ביצירת פוסט:", error);
    res.status(500).json({ error: "שגיאה ביצירת פוסט" });
  }
});

// עדכון פוסט
router.put("/social-media-posts/:id", async (req, res) => {
  try {
    const { platform, post_type, content, content_he, media_urls, hashtags, scheduled_at, published_at, reach, impressions, clicks, likes, shares, comments, leads_generated, ai_generated, ai_prompt, approval_status, approved_by, notes, status } = req.body;
    const { rows } = await pool.query(
      `UPDATE social_media_posts SET platform=COALESCE($1,platform), post_type=COALESCE($2,post_type), content=COALESCE($3,content),
       content_he=COALESCE($4,content_he), media_urls=COALESCE($5,media_urls), hashtags=COALESCE($6,hashtags),
       scheduled_at=COALESCE($7,scheduled_at), published_at=COALESCE($8,published_at), reach=COALESCE($9,reach),
       impressions=COALESCE($10,impressions), clicks=COALESCE($11,clicks), likes=COALESCE($12,likes),
       shares=COALESCE($13,shares), comments=COALESCE($14,comments), leads_generated=COALESCE($15,leads_generated),
       ai_generated=COALESCE($16,ai_generated), ai_prompt=COALESCE($17,ai_prompt), approval_status=COALESCE($18,approval_status),
       approved_by=COALESCE($19,approved_by), notes=COALESCE($20,notes), status=COALESCE($21,status)
       WHERE id=$22 RETURNING *`,
      [platform, post_type, content, content_he, media_urls ? JSON.stringify(media_urls) : null, hashtags ? JSON.stringify(hashtags) : null, scheduled_at, published_at, reach, impressions, clicks, likes, shares, comments, leads_generated, ai_generated, ai_prompt, approval_status, approved_by, notes, status, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: "פוסט לא נמצא" });
    res.json(rows[0]);
  } catch (error) {
    console.error("שגיאה בעדכון פוסט:", error);
    res.status(500).json({ error: "שגיאה בעדכון פוסט" });
  }
});

// מחיקה רכה של פוסט
router.delete("/social-media-posts/:id", async (req, res) => {
  try {
    const { rows } = await pool.query(
      "UPDATE social_media_posts SET status='deleted' WHERE id=$1 RETURNING *",
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: "פוסט לא נמצא" });
    res.json({ message: "פוסט סומן כמחוק", data: rows[0] });
  } catch (error) {
    console.error("שגיאה במחיקת פוסט:", error);
    res.status(500).json({ error: "שגיאה במחיקת פוסט" });
  }
});

// ============================================================================
// CRUD - תקציבי שיווק
// ============================================================================

// קבלת כל התקציבים
router.get("/marketing-budget", async (_req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM marketing_budget ORDER BY fiscal_year DESC, created_at DESC");
    res.json(rows);
  } catch (error) {
    console.error("שגיאה בשליפת תקציבי שיווק:", error);
    res.status(500).json({ error: "שגיאה בשליפת תקציבי שיווק" });
  }
});

// קבלת תקציב לפי מזהה
router.get("/marketing-budget/:id", async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM marketing_budget WHERE id = $1", [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: "תקציב לא נמצא" });
    res.json(rows[0]);
  } catch (error) {
    console.error("שגיאה בשליפת תקציב:", error);
    res.status(500).json({ error: "שגיאה בשליפת תקציב" });
  }
});

// יצירת תקציב חדש
router.post("/marketing-budget", async (req, res) => {
  try {
    const { channel, campaign_name, period, fiscal_year, planned_budget, spent, remaining, leads_generated, cost_per_lead, deals_closed, revenue, roi_percent, notes, status } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO marketing_budget (channel, campaign_name, period, fiscal_year, planned_budget, spent, remaining, leads_generated, cost_per_lead, deals_closed, revenue, roi_percent, notes, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
      [channel, campaign_name, period, fiscal_year, planned_budget, spent, remaining, leads_generated, cost_per_lead, deals_closed, revenue, roi_percent, notes, status]
    );
    res.status(201).json(rows[0]);
  } catch (error) {
    console.error("שגיאה ביצירת תקציב:", error);
    res.status(500).json({ error: "שגיאה ביצירת תקציב" });
  }
});

// עדכון תקציב
router.put("/marketing-budget/:id", async (req, res) => {
  try {
    const { channel, campaign_name, period, fiscal_year, planned_budget, spent, remaining, leads_generated, cost_per_lead, deals_closed, revenue, roi_percent, notes, status } = req.body;
    const { rows } = await pool.query(
      `UPDATE marketing_budget SET channel=COALESCE($1,channel), campaign_name=COALESCE($2,campaign_name), period=COALESCE($3,period),
       fiscal_year=COALESCE($4,fiscal_year), planned_budget=COALESCE($5,planned_budget), spent=COALESCE($6,spent),
       remaining=COALESCE($7,remaining), leads_generated=COALESCE($8,leads_generated), cost_per_lead=COALESCE($9,cost_per_lead),
       deals_closed=COALESCE($10,deals_closed), revenue=COALESCE($11,revenue), roi_percent=COALESCE($12,roi_percent),
       notes=COALESCE($13,notes), status=COALESCE($14,status), updated_at=NOW() WHERE id=$15 RETURNING *`,
      [channel, campaign_name, period, fiscal_year, planned_budget, spent, remaining, leads_generated, cost_per_lead, deals_closed, revenue, roi_percent, notes, status, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: "תקציב לא נמצא" });
    res.json(rows[0]);
  } catch (error) {
    console.error("שגיאה בעדכון תקציב:", error);
    res.status(500).json({ error: "שגיאה בעדכון תקציב" });
  }
});

// מחיקה רכה של תקציב
router.delete("/marketing-budget/:id", async (req, res) => {
  try {
    const { rows } = await pool.query(
      "UPDATE marketing_budget SET status='deleted', updated_at=NOW() WHERE id=$1 RETURNING *",
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: "תקציב לא נמצא" });
    res.json({ message: "תקציב סומן כמחוק", data: rows[0] });
  } catch (error) {
    console.error("שגיאה במחיקת תקציב:", error);
    res.status(500).json({ error: "שגיאה במחיקת תקציב" });
  }
});

// ============================================================================
// CRUD - דפי נחיתה
// ============================================================================

// קבלת כל דפי הנחיתה
router.get("/landing-pages", async (_req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM landing_pages ORDER BY created_at DESC");
    res.json(rows);
  } catch (error) {
    console.error("שגיאה בשליפת דפי נחיתה:", error);
    res.status(500).json({ error: "שגיאה בשליפת דפי נחיתה" });
  }
});

// קבלת דף נחיתה לפי מזהה
router.get("/landing-pages/:id", async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM landing_pages WHERE id = $1", [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: "דף נחיתה לא נמצא" });
    res.json(rows[0]);
  } catch (error) {
    console.error("שגיאה בשליפת דף נחיתה:", error);
    res.status(500).json({ error: "שגיאה בשליפת דף נחיתה" });
  }
});

// יצירת דף נחיתה חדש
router.post("/landing-pages", async (req, res) => {
  try {
    const { page_name, page_url, template, headline_he, description_he, cta_text, form_fields, total_visits, total_submissions, conversion_rate, ab_variant, is_active } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO landing_pages (page_name, page_url, template, headline_he, description_he, cta_text, form_fields, total_visits, total_submissions, conversion_rate, ab_variant, is_active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [page_name, page_url, template, headline_he, description_he, cta_text, JSON.stringify(form_fields || []), total_visits, total_submissions, conversion_rate, ab_variant, is_active]
    );
    res.status(201).json(rows[0]);
  } catch (error) {
    console.error("שגיאה ביצירת דף נחיתה:", error);
    res.status(500).json({ error: "שגיאה ביצירת דף נחיתה" });
  }
});

// עדכון דף נחיתה
router.put("/landing-pages/:id", async (req, res) => {
  try {
    const { page_name, page_url, template, headline_he, description_he, cta_text, form_fields, total_visits, total_submissions, conversion_rate, ab_variant, is_active } = req.body;
    const { rows } = await pool.query(
      `UPDATE landing_pages SET page_name=COALESCE($1,page_name), page_url=COALESCE($2,page_url), template=COALESCE($3,template),
       headline_he=COALESCE($4,headline_he), description_he=COALESCE($5,description_he), cta_text=COALESCE($6,cta_text),
       form_fields=COALESCE($7,form_fields), total_visits=COALESCE($8,total_visits), total_submissions=COALESCE($9,total_submissions),
       conversion_rate=COALESCE($10,conversion_rate), ab_variant=COALESCE($11,ab_variant), is_active=COALESCE($12,is_active),
       updated_at=NOW() WHERE id=$13 RETURNING *`,
      [page_name, page_url, template, headline_he, description_he, cta_text, form_fields ? JSON.stringify(form_fields) : null, total_visits, total_submissions, conversion_rate, ab_variant, is_active, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: "דף נחיתה לא נמצא" });
    res.json(rows[0]);
  } catch (error) {
    console.error("שגיאה בעדכון דף נחיתה:", error);
    res.status(500).json({ error: "שגיאה בעדכון דף נחיתה" });
  }
});

// מחיקה רכה של דף נחיתה
router.delete("/landing-pages/:id", async (req, res) => {
  try {
    const { rows } = await pool.query(
      "UPDATE landing_pages SET is_active=false, updated_at=NOW() WHERE id=$1 RETURNING *",
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: "דף נחיתה לא נמצא" });
    res.json({ message: "דף נחיתה בוטל", data: rows[0] });
  } catch (error) {
    console.error("שגיאה במחיקת דף נחיתה:", error);
    res.status(500).json({ error: "שגיאה במחיקת דף נחיתה" });
  }
});

// ============================================================================
// דשבורד שיווק כולל - סיכום כל הערוצים, ROI, משפכים ותקציבים
// ============================================================================
router.get("/marketing-automation/marketing-dashboard", async (_req, res) => {
  try {
    // סיכום ROI לפי ערוצים
    const channelRoi = await pool.query(`
      SELECT channel,
             COUNT(*) as total_campaigns,
             SUM(planned_budget) as total_planned,
             SUM(spent) as total_spent,
             SUM(revenue) as total_revenue,
             SUM(leads_generated) as total_leads,
             SUM(deals_closed) as total_deals,
             CASE WHEN SUM(spent) > 0 THEN ROUND(((SUM(revenue) - SUM(spent)) / SUM(spent)) * 100, 2) ELSE 0 END as roi_percent
      FROM marketing_budget
      WHERE status = 'active'
      GROUP BY channel
      ORDER BY roi_percent DESC
    `);

    // סיכום משפכים
    const funnelMetrics = await pool.query(`
      SELECT COUNT(*) as total_funnels,
             SUM(total_leads) as total_leads,
             AVG(conversion_rate) as avg_conversion_rate,
             SUM(revenue_generated) as total_revenue,
             SUM(cost) as total_cost
      FROM marketing_funnels
      WHERE status = 'active'
    `);

    // ניצול תקציב כולל
    const budgetUtilization = await pool.query(`
      SELECT SUM(planned_budget) as total_planned,
             SUM(spent) as total_spent,
             SUM(remaining) as total_remaining,
             CASE WHEN SUM(planned_budget) > 0 THEN ROUND((SUM(spent) / SUM(planned_budget)) * 100, 2) ELSE 0 END as utilization_percent
      FROM marketing_budget
      WHERE status = 'active'
    `);

    // ביצועי רשתות חברתיות
    const socialPerformance = await pool.query(`
      SELECT platform,
             COUNT(*) as total_posts,
             SUM(reach) as total_reach,
             SUM(impressions) as total_impressions,
             SUM(clicks) as total_clicks,
             SUM(likes) as total_likes,
             SUM(shares) as total_shares,
             SUM(leads_generated) as total_leads,
             CASE WHEN SUM(impressions) > 0 THEN ROUND((SUM(clicks)::numeric / SUM(impressions)) * 100, 2) ELSE 0 END as ctr
      FROM social_media_posts
      WHERE status != 'deleted'
      GROUP BY platform
    `);

    // ביצועי דפי נחיתה
    const landingPagePerformance = await pool.query(`
      SELECT COUNT(*) as total_pages,
             SUM(total_visits) as total_visits,
             SUM(total_submissions) as total_submissions,
             CASE WHEN SUM(total_visits) > 0 THEN ROUND((SUM(total_submissions)::numeric / SUM(total_visits)) * 100, 2) ELSE 0 END as avg_conversion_rate
      FROM landing_pages
      WHERE is_active = true
    `);

    res.json({
      channel_roi: channelRoi.rows,
      funnel_metrics: funnelMetrics.rows[0],
      budget_utilization: budgetUtilization.rows[0],
      social_performance: socialPerformance.rows,
      landing_page_performance: landingPagePerformance.rows[0]
    });
  } catch (error) {
    console.error("שגיאה בטעינת דשבורד שיווק:", error);
    res.status(500).json({ error: "שגיאה בטעינת דשבורד שיווק" });
  }
});

// ============================================================================
// יצירת פוסט בינה מלאכותית - מייצר תוכן לפלטפורמה ספציפית
// ============================================================================
router.post("/marketing-automation/ai-generate-post", async (req, res) => {
  try {
    const { platform, topic, tone, target_audience, language, include_hashtags, include_cta } = req.body;

    // יצירת תבנית פוסט לפי הפלטפורמה
    const platformTemplates: Record<string, any> = {
      facebook: {
        max_length: 500,
        format: "פוסט פייסבוק - טקסט עשיר עם קריאה לפעולה",
        tips: "שימוש באימוג'ים, שאלות לקהל, תמונה מומלצת"
      },
      instagram: {
        max_length: 300,
        format: "פוסט אינסטגרם - ויזואלי עם האשטגים",
        tips: "תמונה חזקה, עד 30 האשטגים, סטורי מומלץ"
      },
      linkedin: {
        max_length: 700,
        format: "פוסט לינקדאין - מקצועי ומעמיק",
        tips: "תוכן מקצועי, נתונים, תובנות ענפיות"
      },
      twitter: {
        max_length: 280,
        format: "ציוץ - קצר וקולע",
        tips: "קצר, חד, האשטגים רלוונטיים"
      }
    };

    const template = platformTemplates[platform] || platformTemplates.facebook;

    // שמירת הפוסט שנוצר כטיוטה
    const { rows } = await pool.query(
      `INSERT INTO social_media_posts (platform, post_type, content, content_he, hashtags, ai_generated, ai_prompt, approval_status, status)
       VALUES ($1, 'ai_generated', $2, $3, $4, true, $5, 'pending_review', 'draft') RETURNING *`,
      [
        platform,
        `[AI Generated] Topic: ${topic} | Tone: ${tone} | Audience: ${target_audience}`,
        `[נוצר בבינה מלאכותית] נושא: ${topic} | טון: ${tone} | קהל יעד: ${target_audience}`,
        JSON.stringify(include_hashtags ? [`#${topic?.replace(/\s+/g, '')}`, `#${platform}`, '#marketing'] : []),
        JSON.stringify({ platform, topic, tone, target_audience, language, include_hashtags, include_cta })
      ]
    );

    res.status(201).json({
      message: "פוסט AI נוצר בהצלחה - ממתין לאישור",
      post: rows[0],
      template,
      suggestions: {
        best_time_to_post: "בימי שלישי ורביעי בין 10:00-14:00",
        recommended_media: "תמונה או וידאו קצר",
        cta_suggestion: include_cta ? "לחצו על הלינק בביו / צרו קשר עוד היום" : null
      }
    });
  } catch (error) {
    console.error("שגיאה ביצירת פוסט AI:", error);
    res.status(500).json({ error: "שגיאה ביצירת פוסט AI" });
  }
});

// ============================================================================
// ניתוח משפך מלא - עם שיעורי נשירה בין שלבים
// ============================================================================
router.get("/marketing-automation/funnel-analysis", async (_req, res) => {
  try {
    const { rows: funnels } = await pool.query(`
      SELECT *,
             CASE WHEN cost > 0 THEN ROUND(((revenue_generated - cost) / cost) * 100, 2) ELSE 0 END as calculated_roi,
             CASE WHEN total_leads > 0 THEN ROUND(cost / total_leads, 2) ELSE 0 END as cost_per_lead
      FROM marketing_funnels
      WHERE status = 'active'
      ORDER BY revenue_generated DESC
    `);

    // חישוב שיעורי נשירה לכל משפך
    const funnelAnalysis = funnels.map((funnel: any) => {
      const stages = funnel.stages || [];
      const stageAnalysis = stages.map((stage: any, index: number) => {
        const prevLeads = index === 0 ? funnel.total_leads : (stages[index - 1]?.leads || 0);
        const currentLeads = stage.leads || 0;
        const dropOff = prevLeads > 0 ? Math.round(((prevLeads - currentLeads) / prevLeads) * 100 * 100) / 100 : 0;
        return { ...stage, drop_off_rate: dropOff, previous_stage_leads: prevLeads };
      });
      return { ...funnel, stage_analysis: stageAnalysis };
    });

    res.json({
      total_funnels: funnels.length,
      funnels: funnelAnalysis
    });
  } catch (error) {
    console.error("שגיאה בניתוח משפכים:", error);
    res.status(500).json({ error: "שגיאה בניתוח משפכים" });
  }
});

// ============================================================================
// השוואת ערוצים - איזה ערוץ הכי משתלם
// ============================================================================
router.get("/marketing-automation/channel-comparison", async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT channel,
             COUNT(*) as campaigns_count,
             SUM(planned_budget) as total_budget,
             SUM(spent) as total_spent,
             SUM(revenue) as total_revenue,
             SUM(leads_generated) as total_leads,
             SUM(deals_closed) as total_deals,
             CASE WHEN SUM(leads_generated) > 0 THEN ROUND(SUM(spent) / SUM(leads_generated), 2) ELSE 0 END as avg_cost_per_lead,
             CASE WHEN SUM(deals_closed) > 0 THEN ROUND(SUM(spent) / SUM(deals_closed), 2) ELSE 0 END as avg_cost_per_deal,
             CASE WHEN SUM(spent) > 0 THEN ROUND(((SUM(revenue) - SUM(spent)) / SUM(spent)) * 100, 2) ELSE 0 END as roi_percent,
             CASE WHEN SUM(leads_generated) > 0 THEN ROUND((SUM(deals_closed)::numeric / SUM(leads_generated)) * 100, 2) ELSE 0 END as lead_to_deal_rate
      FROM marketing_budget
      WHERE status = 'active'
      GROUP BY channel
      ORDER BY roi_percent DESC
    `);

    // דירוג ערוצים
    const ranked = rows.map((row: any, index: number) => ({
      rank: index + 1,
      ...row,
      recommendation: Number(row.roi_percent) > 200 ? "ערוץ מצוין - להגדיל תקציב" :
                       Number(row.roi_percent) > 100 ? "ערוץ טוב - לשמר" :
                       Number(row.roi_percent) > 0 ? "ערוץ בינוני - לשפר" : "ערוץ מפסיד - לבחון מחדש"
    }));

    res.json({
      total_channels: rows.length,
      channels: ranked,
      best_channel: ranked[0] || null,
      worst_channel: ranked[ranked.length - 1] || null
    });
  } catch (error) {
    console.error("שגיאה בהשוואת ערוצים:", error);
    res.status(500).json({ error: "שגיאה בהשוואת ערוצים" });
  }
});

// ============================================================================
// ניצול תקציב - תקציב מול בפועל לפי ערוץ
// ============================================================================
router.get("/marketing-automation/budget-utilization", async (_req, res) => {
  try {
    // ניצול לפי ערוץ
    const byChannel = await pool.query(`
      SELECT channel,
             SUM(planned_budget) as planned,
             SUM(spent) as spent,
             SUM(remaining) as remaining,
             CASE WHEN SUM(planned_budget) > 0 THEN ROUND((SUM(spent) / SUM(planned_budget)) * 100, 2) ELSE 0 END as utilization_percent,
             SUM(leads_generated) as leads,
             SUM(revenue) as revenue
      FROM marketing_budget
      WHERE status = 'active'
      GROUP BY channel
      ORDER BY utilization_percent DESC
    `);

    // ניצול לפי תקופה
    const byPeriod = await pool.query(`
      SELECT period, fiscal_year,
             SUM(planned_budget) as planned,
             SUM(spent) as spent,
             SUM(remaining) as remaining,
             CASE WHEN SUM(planned_budget) > 0 THEN ROUND((SUM(spent) / SUM(planned_budget)) * 100, 2) ELSE 0 END as utilization_percent
      FROM marketing_budget
      WHERE status = 'active'
      GROUP BY period, fiscal_year
      ORDER BY fiscal_year DESC, period
    `);

    // סיכום כולל
    const total = await pool.query(`
      SELECT SUM(planned_budget) as total_planned,
             SUM(spent) as total_spent,
             SUM(remaining) as total_remaining,
             CASE WHEN SUM(planned_budget) > 0 THEN ROUND((SUM(spent) / SUM(planned_budget)) * 100, 2) ELSE 0 END as overall_utilization
      FROM marketing_budget
      WHERE status = 'active'
    `);

    // התראות חריגה
    const overBudget = await pool.query(`
      SELECT channel, campaign_name, planned_budget, spent,
             ROUND(spent - planned_budget, 2) as over_amount
      FROM marketing_budget
      WHERE status = 'active' AND spent > planned_budget
      ORDER BY (spent - planned_budget) DESC
    `);

    res.json({
      by_channel: byChannel.rows,
      by_period: byPeriod.rows,
      total: total.rows[0],
      over_budget_alerts: overBudget.rows
    });
  } catch (error) {
    console.error("שגיאה בטעינת ניצול תקציב:", error);
    res.status(500).json({ error: "שגיאה בטעינת ניצול תקציב" });
  }
});

// ============================================================================
// תזמון פוסט - תזמון פוסט לפרסום עתידי
// ============================================================================
router.post("/marketing-automation/schedule-post", async (req, res) => {
  try {
    const { post_id, scheduled_at } = req.body;

    if (!post_id || !scheduled_at) {
      return res.status(400).json({ error: "נדרש מזהה פוסט ותאריך תזמון" });
    }

    // עדכון הפוסט עם זמן תזמון
    const { rows } = await pool.query(
      `UPDATE social_media_posts SET scheduled_at=$1, status='scheduled', approval_status='approved'
       WHERE id=$2 RETURNING *`,
      [scheduled_at, post_id]
    );

    if (!rows.length) return res.status(404).json({ error: "פוסט לא נמצא" });

    res.json({
      message: "פוסט תוזמן בהצלחה",
      post: rows[0],
      scheduled_for: scheduled_at
    });
  } catch (error) {
    console.error("שגיאה בתזמון פוסט:", error);
    res.status(500).json({ error: "שגיאה בתזמון פוסט" });
  }
});

export default router;
