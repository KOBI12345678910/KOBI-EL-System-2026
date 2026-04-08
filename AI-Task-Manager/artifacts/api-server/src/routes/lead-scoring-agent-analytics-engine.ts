// ============================================================
// מנוע דירוג לידים ואנליטיקס סוכני מכירות
// ניקוד AI לידים + ניתוח עמוק של ביצועי סוכנים
// ============================================================

import { Router, Request, Response } from "express";
import { pool } from "@workspace/db";

const router = Router();

// ============================================================
// יצירת טבלאות ונתוני בסיס
// ============================================================
router.post("/init", async (req: Request, res: Response) => {
  try {
    // טבלת ציוני לידים
    await pool.query(`
      CREATE TABLE IF NOT EXISTS lead_scores (
        id SERIAL PRIMARY KEY,
        lead_id INTEGER,
        lead_name VARCHAR(255),
        score INTEGER DEFAULT 0,
        score_breakdown JSONB DEFAULT '{}',
        source_score INTEGER DEFAULT 0,
        budget_score INTEGER DEFAULT 0,
        urgency_score INTEGER DEFAULT 0,
        engagement_score INTEGER DEFAULT 0,
        location_score INTEGER DEFAULT 0,
        product_interest_score INTEGER DEFAULT 0,
        response_time_score INTEGER DEFAULT 0,
        tier VARCHAR(10) DEFAULT 'C',
        last_calculated TIMESTAMPTZ DEFAULT NOW(),
        conversion_probability NUMERIC(5,2) DEFAULT 0,
        recommended_action VARCHAR(100),
        recommended_action_he VARCHAR(100),
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // טבלת אנליטיקס סוכנים
    await pool.query(`
      CREATE TABLE IF NOT EXISTS agent_analytics (
        id SERIAL PRIMARY KEY,
        agent_id INTEGER,
        agent_name VARCHAR(255),
        period VARCHAR(7),
        total_leads_received INTEGER DEFAULT 0,
        total_leads_contacted INTEGER DEFAULT 0,
        contact_rate NUMERIC(5,2) DEFAULT 0,
        total_meetings_set INTEGER DEFAULT 0,
        meeting_rate NUMERIC(5,2) DEFAULT 0,
        total_quotes_sent INTEGER DEFAULT 0,
        quote_rate NUMERIC(5,2) DEFAULT 0,
        total_deals_closed INTEGER DEFAULT 0,
        close_rate NUMERIC(5,2) DEFAULT 0,
        total_revenue NUMERIC(15,2) DEFAULT 0,
        avg_deal_size NUMERIC(15,2) DEFAULT 0,
        total_calls_made INTEGER DEFAULT 0,
        total_calls_received INTEGER DEFAULT 0,
        total_calls_missed INTEGER DEFAULT 0,
        missed_call_rate NUMERIC(5,2) DEFAULT 0,
        avg_call_duration_sec INTEGER DEFAULT 0,
        total_call_time_hours NUMERIC(6,2) DEFAULT 0,
        avg_response_time_min INTEGER DEFAULT 0,
        followup_compliance NUMERIC(5,2) DEFAULT 0,
        discount_requests INTEGER DEFAULT 0,
        avg_discount_pct NUMERIC(5,2) DEFAULT 0,
        customer_satisfaction NUMERIC(3,1) DEFAULT 0,
        leads_lost INTEGER DEFAULT 0,
        leads_lost_reasons JSONB DEFAULT '{}',
        gps_anomalies INTEGER DEFAULT 0,
        agent_risk_score INTEGER DEFAULT 0,
        agent_value_score INTEGER DEFAULT 0,
        rank_in_team INTEGER,
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // טבלת פעילות יומית סוכנים
    await pool.query(`
      CREATE TABLE IF NOT EXISTS agent_daily_activity (
        id SERIAL PRIMARY KEY,
        agent_id INTEGER,
        agent_name VARCHAR(255),
        activity_date DATE,
        calls_out INTEGER DEFAULT 0,
        calls_in INTEGER DEFAULT 0,
        calls_missed INTEGER DEFAULT 0,
        call_duration_total_min INTEGER DEFAULT 0,
        meetings_attended INTEGER DEFAULT 0,
        quotes_created INTEGER DEFAULT 0,
        quotes_amount NUMERIC(15,2) DEFAULT 0,
        deals_closed INTEGER DEFAULT 0,
        deals_amount NUMERIC(15,2) DEFAULT 0,
        leads_contacted INTEGER DEFAULT 0,
        leads_new INTEGER DEFAULT 0,
        whatsapp_messages_sent INTEGER DEFAULT 0,
        emails_sent INTEGER DEFAULT 0,
        km_driven NUMERIC(8,2) DEFAULT 0,
        locations_visited INTEGER DEFAULT 0,
        first_activity_at TIMESTAMPTZ,
        last_activity_at TIMESTAMPTZ,
        work_hours NUMERIC(4,2) DEFAULT 0,
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // ============================================================
    // זריעת 20 לידים עם ציונים
    // ============================================================
    const leadSeeds = [
      { id: 1, name: "חיים גולדברג", score: 92, source: 25, budget: 25, urgency: 25, engagement: 25, location: 10, product: 15, response: 0, tier: "A", prob: 88, action: "Call immediately", actionHe: "להתקשר מיד" },
      { id: 2, name: "משה ברנשטיין", score: 85, source: 20, budget: 25, urgency: 20, engagement: 20, location: 10, product: 15, response: 0, tier: "A", prob: 82, action: "Schedule meeting", actionHe: "לקבוע פגישה" },
      { id: 3, name: "אורית שפירא", score: 78, source: 15, budget: 20, urgency: 25, engagement: 10, location: 10, product: 10, response: 0, tier: "B", prob: 65, action: "Send quote", actionHe: "לשלוח הצעת מחיר" },
      { id: 4, name: "יעקב כהנא", score: 72, source: 20, budget: 20, urgency: 10, engagement: 20, location: 7, product: 10, response: 0, tier: "B", prob: 58, action: "Follow up call", actionHe: "שיחת מעקב" },
      { id: 5, name: "רחל אדלר", score: 68, source: 25, budget: 15, urgency: 10, engagement: 10, location: 10, product: 10, response: 0, tier: "B", prob: 52, action: "Send catalog", actionHe: "לשלוח קטלוג" },
      { id: 6, name: "דניאל מזרחי", score: 65, source: 15, budget: 20, urgency: 10, engagement: 10, location: 10, product: 10, response: 0, tier: "B", prob: 48, action: "WhatsApp follow up", actionHe: "מעקב בוואטסאפ" },
      { id: 7, name: "נתן פרידמן", score: 60, source: 20, budget: 15, urgency: 10, engagement: 10, location: 7, product: 5, response: 0, tier: "B", prob: 42, action: "Call next week", actionHe: "להתקשר שבוע הבא" },
      { id: 8, name: "שולמית בן דוד", score: 55, source: 15, budget: 15, urgency: 5, engagement: 10, location: 10, product: 10, response: 0, tier: "B", prob: 38, action: "Email nurture", actionHe: "טיפוח במייל" },
      { id: 9, name: "אבי רוזנברג", score: 48, source: 10, budget: 15, urgency: 10, engagement: 10, location: 3, product: 5, response: 0, tier: "C", prob: 30, action: "Add to drip campaign", actionHe: "להוסיף לקמפיין טפטוף" },
      { id: 10, name: "מיכאל חדד", score: 45, source: 15, budget: 5, urgency: 10, engagement: 10, location: 7, product: 5, response: 0, tier: "C", prob: 28, action: "Monthly check-in", actionHe: "בדיקה חודשית" },
      { id: 11, name: "סיגל אלון", score: 42, source: 10, budget: 15, urgency: 5, engagement: 10, location: 3, product: 5, response: 0, tier: "C", prob: 25, action: "Send newsletter", actionHe: "לשלוח ניוזלטר" },
      { id: 12, name: "עמית דגני", score: 38, source: 15, budget: 5, urgency: 5, engagement: 10, location: 3, product: 5, response: 0, tier: "C", prob: 22, action: "Low priority follow up", actionHe: "מעקב עדיפות נמוכה" },
      { id: 13, name: "תמר הרשקוביץ", score: 35, source: 10, budget: 5, urgency: 10, engagement: 10, location: 3, product: 5, response: 0, tier: "C", prob: 20, action: "Quarterly follow up", actionHe: "מעקב רבעוני" },
      { id: 14, name: "בוריס יאנוב", score: 30, source: 10, budget: 5, urgency: 5, engagement: 5, location: 7, product: 5, response: 0, tier: "C", prob: 18, action: "Archive - low interest", actionHe: "ארכיון - עניין נמוך" },
      { id: 15, name: "פאטמה חוסין", score: 25, source: 10, budget: 5, urgency: 5, engagement: 5, location: 3, product: 5, response: 0, tier: "C", prob: 15, action: "Passive nurture", actionHe: "טיפוח פסיבי" },
      { id: 16, name: "אלכסנדר קוז'ין", score: 18, source: 10, budget: 5, urgency: 5, engagement: 0, location: 3, product: 5, response: 0, tier: "D", prob: 8, action: "No action", actionHe: "ללא פעולה" },
      { id: 17, name: "סאמי נסאר", score: 15, source: 10, budget: 5, urgency: 5, engagement: 0, location: 3, product: 0, response: 0, tier: "D", prob: 5, action: "Cold lead", actionHe: "ליד קר" },
      { id: 18, name: "ולדימיר סטפנוב", score: 12, source: 10, budget: 0, urgency: 5, engagement: 0, location: 3, product: 0, response: 0, tier: "D", prob: 3, action: "Archive", actionHe: "ארכיון" },
      { id: 19, name: "ג'ון סמית", score: 8, source: 10, budget: 0, urgency: 0, engagement: 0, location: 3, product: 0, response: 0, tier: "D", prob: 2, action: "Disqualify", actionHe: "לפסול" },
      { id: 20, name: "מריה פטרובה", score: 5, source: 5, budget: 0, urgency: 0, engagement: 0, location: 0, product: 0, response: 0, tier: "D", prob: 1, action: "Disqualify", actionHe: "לפסול" },
    ];

    for (const lead of leadSeeds) {
      await pool.query(
        `INSERT INTO lead_scores (lead_id, lead_name, score, score_breakdown, source_score, budget_score, urgency_score, engagement_score, location_score, product_interest_score, response_time_score, tier, conversion_probability, recommended_action, recommended_action_he)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
         ON CONFLICT DO NOTHING`,
        [
          lead.id, lead.name, lead.score,
          JSON.stringify({ source: lead.source, budget: lead.budget, urgency: lead.urgency, engagement: lead.engagement, location: lead.location, product_interest: lead.product }),
          lead.source, lead.budget, lead.urgency, lead.engagement, lead.location, lead.product, lead.response,
          lead.tier, lead.prob, lead.action, lead.actionHe,
        ]
      );
    }

    // ============================================================
    // זריעת אנליטיקס ל-5 סוכנים על 3 חודשים
    // ============================================================
    const agents = [
      { id: 1, name: "רועי שמעון" },
      { id: 2, name: "דנה פרידמן" },
      { id: 3, name: "אייל כץ" },
      { id: 4, name: "מורן אביטל" },
      { id: 5, name: "טל חסון" },
    ];

    const periods = ["2026-01", "2026-02", "2026-03"];

    for (const agent of agents) {
      for (const period of periods) {
        // סימולציה של נתוני ביצועים שונים לכל סוכן
        const isTopPerformer = agent.id <= 2;
        const isAverage = agent.id === 3;
        const isStruggling = agent.id >= 4;

        const leadsReceived = Math.floor(Math.random() * 20) + 15;
        const contactRate = isTopPerformer ? 85 + Math.random() * 10 : isAverage ? 65 + Math.random() * 15 : 45 + Math.random() * 20;
        const leadsContacted = Math.round(leadsReceived * contactRate / 100);
        const meetingRate = isTopPerformer ? 50 + Math.random() * 15 : isAverage ? 30 + Math.random() * 15 : 15 + Math.random() * 15;
        const meetingsSet = Math.round(leadsContacted * meetingRate / 100);
        const quoteRate = isTopPerformer ? 60 + Math.random() * 20 : isAverage ? 35 + Math.random() * 15 : 20 + Math.random() * 15;
        const quotesSent = Math.round(meetingsSet * quoteRate / 100) + (isTopPerformer ? 3 : 1);
        const closeRate = isTopPerformer ? 35 + Math.random() * 15 : isAverage ? 20 + Math.random() * 10 : 8 + Math.random() * 12;
        const dealsClosed = Math.max(1, Math.round(quotesSent * closeRate / 100));
        const avgDealSize = isTopPerformer ? 45000 + Math.random() * 30000 : isAverage ? 25000 + Math.random() * 20000 : 15000 + Math.random() * 15000;
        const totalRevenue = dealsClosed * avgDealSize;

        const callsMade = Math.floor(Math.random() * 80) + 40;
        const callsReceived = Math.floor(Math.random() * 30) + 10;
        const callsMissed = isStruggling ? Math.floor(Math.random() * 15) + 5 : Math.floor(Math.random() * 5);
        const missedCallRate = Math.round(callsMissed / (callsMade + callsReceived) * 10000) / 100;
        const avgCallDuration = 180 + Math.floor(Math.random() * 300);
        const totalCallHours = Math.round((callsMade + callsReceived) * avgCallDuration / 3600 * 100) / 100;
        const avgResponseTime = isTopPerformer ? 5 + Math.floor(Math.random() * 10) : isAverage ? 15 + Math.floor(Math.random() * 20) : 30 + Math.floor(Math.random() * 60);
        const followupCompliance = isTopPerformer ? 85 + Math.random() * 10 : isAverage ? 60 + Math.random() * 15 : 30 + Math.random() * 20;

        const discountRequests = Math.floor(Math.random() * 8);
        const avgDiscountPct = isStruggling ? 10 + Math.random() * 8 : 3 + Math.random() * 5;
        const customerSat = isTopPerformer ? 4.2 + Math.random() * 0.6 : isAverage ? 3.5 + Math.random() * 0.8 : 2.8 + Math.random() * 0.8;

        const leadsLost = Math.floor(Math.random() * 5) + (isStruggling ? 3 : 0);
        const lostReasons: Record<string, number> = {};
        if (leadsLost > 0) {
          lostReasons["מחיר גבוה"] = Math.ceil(leadsLost * 0.4);
          lostReasons["זמן תגובה ארוך"] = Math.ceil(leadsLost * 0.2);
          lostReasons["בחר מתחרה"] = Math.ceil(leadsLost * 0.25);
          lostReasons["ביטל"] = leadsLost - Object.values(lostReasons).reduce((a, b) => a + b, 0);
        }

        const gpsAnomalies = isStruggling ? Math.floor(Math.random() * 4) : 0;
        const riskScore = Math.min(100, gpsAnomalies * 15 + (missedCallRate > 10 ? 20 : 0) + (avgDiscountPct > 12 ? 15 : 0) + (followupCompliance < 50 ? 20 : 0));
        const valueScore = Math.min(100, Math.round(closeRate * 0.3 + (totalRevenue / 10000) * 0.3 + customerSat * 10 * 0.2 + followupCompliance * 0.2));

        await pool.query(
          `INSERT INTO agent_analytics (
            agent_id, agent_name, period,
            total_leads_received, total_leads_contacted, contact_rate,
            total_meetings_set, meeting_rate, total_quotes_sent, quote_rate,
            total_deals_closed, close_rate, total_revenue, avg_deal_size,
            total_calls_made, total_calls_received, total_calls_missed, missed_call_rate,
            avg_call_duration_sec, total_call_time_hours, avg_response_time_min,
            followup_compliance, discount_requests, avg_discount_pct,
            customer_satisfaction, leads_lost, leads_lost_reasons,
            gps_anomalies, agent_risk_score, agent_value_score
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30)
          ON CONFLICT DO NOTHING`,
          [
            agent.id, agent.name, period,
            leadsReceived, leadsContacted, Math.round(contactRate * 100) / 100,
            meetingsSet, Math.round(meetingRate * 100) / 100, quotesSent, Math.round(quoteRate * 100) / 100,
            dealsClosed, Math.round(closeRate * 100) / 100, Math.round(totalRevenue * 100) / 100, Math.round(avgDealSize * 100) / 100,
            callsMade, callsReceived, callsMissed, missedCallRate,
            avgCallDuration, totalCallHours, avgResponseTime,
            Math.round(followupCompliance * 100) / 100, discountRequests, Math.round(avgDiscountPct * 100) / 100,
            Math.round(customerSat * 10) / 10, leadsLost, JSON.stringify(lostReasons),
            gpsAnomalies, riskScore, valueScore,
          ]
        );

        // זריעת פעילות יומית - 22 ימי עבודה לחודש
        const [yearStr, monthStr] = period.split("-");
        const year = parseInt(yearStr);
        const month = parseInt(monthStr);
        const daysInMonth = new Date(year, month, 0).getDate();

        for (let day = 1; day <= daysInMonth; day++) {
          const date = new Date(year, month - 1, day);
          const dayOfWeek = date.getDay();
          // דילוג על שבת
          if (dayOfWeek === 6) continue;
          // יום שישי קצר
          const isFriday = dayOfWeek === 5;

          const dailyCallsOut = isFriday ? Math.floor(Math.random() * 4) + 1 : Math.floor(Math.random() * 8) + 2;
          const dailyCallsIn = Math.floor(Math.random() * 4) + 1;
          const dailyCallsMissed = isStruggling ? Math.floor(Math.random() * 2) : Math.random() > 0.7 ? 1 : 0;
          const dailyCallDuration = (dailyCallsOut + dailyCallsIn) * (3 + Math.floor(Math.random() * 5));
          const dailyMeetings = Math.random() > (isFriday ? 0.8 : 0.5) ? Math.floor(Math.random() * 2) + 1 : 0;
          const dailyQuotes = Math.random() > 0.6 ? 1 : 0;
          const dailyQuoteAmount = dailyQuotes * (10000 + Math.floor(Math.random() * 50000));
          const dailyDeals = Math.random() > 0.85 ? 1 : 0;
          const dailyDealAmount = dailyDeals * (15000 + Math.floor(Math.random() * 60000));
          const dailyLeadsContacted = Math.floor(Math.random() * 4) + 1;
          const dailyNewLeads = Math.random() > 0.6 ? Math.floor(Math.random() * 3) + 1 : 0;
          const dailyWhatsapp = Math.floor(Math.random() * 15) + 3;
          const dailyEmails = Math.floor(Math.random() * 8) + 1;
          const dailyKm = dailyMeetings > 0 ? 20 + Math.floor(Math.random() * 80) : Math.floor(Math.random() * 15);
          const dailyLocations = dailyMeetings;
          const workHours = isFriday ? 4 + Math.random() * 2 : 8 + Math.random() * 2;

          await pool.query(
            `INSERT INTO agent_daily_activity (
              agent_id, agent_name, activity_date,
              calls_out, calls_in, calls_missed, call_duration_total_min,
              meetings_attended, quotes_created, quotes_amount,
              deals_closed, deals_amount, leads_contacted, leads_new,
              whatsapp_messages_sent, emails_sent, km_driven, locations_visited,
              work_hours
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
            ON CONFLICT DO NOTHING`,
            [
              agent.id, agent.name, date.toISOString().split("T")[0],
              dailyCallsOut, dailyCallsIn, dailyCallsMissed, dailyCallDuration,
              dailyMeetings, dailyQuotes, dailyQuoteAmount,
              dailyDeals, dailyDealAmount, dailyLeadsContacted, dailyNewLeads,
              dailyWhatsapp, dailyEmails, dailyKm, dailyLocations,
              Math.round(workHours * 100) / 100,
            ]
          );
        }
      }
    }

    res.json({
      success: true,
      message: "טבלאות דירוג לידים ואנליטיקס סוכנים נוצרו. 20 לידים ו-5 סוכנים על 3 חודשים נזרעו",
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// חישוב ציון ליד
// ============================================================
router.post("/calculate-score/:leadId", async (req: Request, res: Response) => {
  try {
    const { leadId } = req.params;
    const { source, budget, urgency, engagement, location, product_interest, response_time_min } = req.body;

    // חישוב ציון מקור
    const sourceScores: Record<string, number> = {
      website: 20, referral: 25, facebook: 15, phone: 10, walkin: 20,
    };
    const sourceScore = sourceScores[source] || 10;

    // חישוב ציון תקציב
    let budgetScore = 5;
    if (budget > 100000) budgetScore = 25;
    else if (budget > 50000) budgetScore = 20;
    else if (budget > 20000) budgetScore = 15;

    // חישוב ציון דחיפות
    const urgencyScores: Record<string, number> = {
      immediate: 25, "1month": 20, "3months": 10, exploring: 5,
    };
    const urgencyScore = urgencyScores[urgency] || 5;

    // חישוב ציון מעורבות
    const engagementScores: Record<string, number> = {
      replied: 10, meeting_set: 20, quote_requested: 25,
    };
    const engagementScore = engagementScores[engagement] || 0;

    // חישוב ציון מיקום
    const locationScores: Record<string, number> = {
      local: 10, nearby: 7, far: 3,
    };
    const locationScore = locationScores[location] || 3;

    // חישוב ציון עניין במוצר
    const productScores: Record<string, number> = {
      high_margin: 15, medium: 10, low: 5,
    };
    const productScore = productScores[product_interest] || 5;

    // ציון זמן תגובה (בונוס)
    let responseScore = 0;
    if (response_time_min !== undefined) {
      if (response_time_min <= 5) responseScore = 10;
      else if (response_time_min <= 15) responseScore = 7;
      else if (response_time_min <= 30) responseScore = 4;
      else if (response_time_min <= 60) responseScore = 2;
    }

    // חישוב ציון כולל
    const totalScore = Math.min(100, sourceScore + budgetScore + urgencyScore + engagementScore + locationScore + productScore + responseScore);

    // קביעת דרגה
    let tier = "D";
    if (totalScore >= 80) tier = "A";
    else if (totalScore >= 50) tier = "B";
    else if (totalScore >= 20) tier = "C";

    // הסתברות המרה משוערת
    const conversionProbability = Math.round(totalScore * 0.85 * 100) / 100;

    // פעולה מומלצת
    let action = "No action";
    let actionHe = "ללא פעולה";
    if (tier === "A") { action = "Call immediately"; actionHe = "להתקשר מיד"; }
    else if (tier === "B" && engagementScore >= 20) { action = "Send quote"; actionHe = "לשלוח הצעת מחיר"; }
    else if (tier === "B") { action = "Schedule meeting"; actionHe = "לקבוע פגישה"; }
    else if (tier === "C") { action = "Email nurture"; actionHe = "טיפוח במייל"; }
    else { action = "Add to newsletter"; actionHe = "להוסיף לניוזלטר"; }

    const scoreBreakdown = {
      source: sourceScore,
      budget: budgetScore,
      urgency: urgencyScore,
      engagement: engagementScore,
      location: locationScore,
      product_interest: productScore,
      response_time: responseScore,
    };

    // עדכון או יצירה
    const existing = await pool.query(`SELECT id FROM lead_scores WHERE lead_id = $1`, [leadId]);

    if (existing.rows.length > 0) {
      await pool.query(
        `UPDATE lead_scores SET
          score = $1, score_breakdown = $2, source_score = $3, budget_score = $4,
          urgency_score = $5, engagement_score = $6, location_score = $7,
          product_interest_score = $8, response_time_score = $9, tier = $10,
          last_calculated = NOW(), conversion_probability = $11,
          recommended_action = $12, recommended_action_he = $13, updated_at = NOW()
         WHERE lead_id = $14`,
        [totalScore, JSON.stringify(scoreBreakdown), sourceScore, budgetScore, urgencyScore, engagementScore, locationScore, productScore, responseScore, tier, conversionProbability, action, actionHe, leadId]
      );
    } else {
      await pool.query(
        `INSERT INTO lead_scores (lead_id, lead_name, score, score_breakdown, source_score, budget_score, urgency_score, engagement_score, location_score, product_interest_score, response_time_score, tier, conversion_probability, recommended_action, recommended_action_he)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
        [leadId, req.body.lead_name || `ליד ${leadId}`, totalScore, JSON.stringify(scoreBreakdown), sourceScore, budgetScore, urgencyScore, engagementScore, locationScore, productScore, responseScore, tier, conversionProbability, action, actionHe]
      );
    }

    res.json({
      success: true,
      data: {
        lead_id: parseInt(leadId as string),
        total_score: totalScore,
        tier,
        conversion_probability: conversionProbability,
        recommended_action: action,
        recommended_action_he: actionHe,
        breakdown: scoreBreakdown,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// כל הלידים עם ציונים - מהגבוה לנמוך
// ============================================================
router.get("/lead-scores", async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT * FROM lead_scores ORDER BY score DESC`
    );

    // סיכום לפי דרגה
    const tierSummary: Record<string, number> = { A: 0, B: 0, C: 0, D: 0 };
    for (const lead of result.rows) {
      tierSummary[lead.tier] = (tierSummary[lead.tier] || 0) + 1;
    }

    res.json({
      success: true,
      data: result.rows,
      total: result.rows.length,
      tier_summary: tierSummary,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// לידים לפי דרגה
// ============================================================
router.get("/lead-scores/tier/:tier", async (req: Request, res: Response) => {
  try {
    const { tier } = req.params;
    const result = await pool.query(
      `SELECT * FROM lead_scores WHERE tier = $1 ORDER BY score DESC`,
      [tier.toUpperCase()]
    );
    res.json({ success: true, data: result.rows, total: result.rows.length, tier: tier.toUpperCase() });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// פירוט ציון ליד
// ============================================================
router.get("/lead-scores/:leadId", async (req: Request, res: Response) => {
  try {
    const { leadId } = req.params;
    const result = await pool.query(
      `SELECT * FROM lead_scores WHERE lead_id = $1`,
      [leadId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: "ליד לא נמצא" });
    }

    const lead = result.rows[0];

    // חישוב ציון מקסימלי אפשרי
    const maxScores = {
      source: 25, budget: 25, urgency: 25, engagement: 25, location: 10, product_interest: 15, response_time: 10,
    };
    const maxTotal = Object.values(maxScores).reduce((a, b) => a + b, 0);

    const breakdown = lead.score_breakdown || {};
    const detailedBreakdown = Object.entries(maxScores).map(([key, max]) => ({
      category: key,
      score: breakdown[key] || (lead as any)[`${key}_score`] || 0,
      max_score: max,
      percentage: Math.round(((breakdown[key] || 0) / max) * 10000) / 100,
    }));

    res.json({
      success: true,
      data: lead,
      detailed_breakdown: detailedBreakdown,
      score_percentage: Math.round(lead.score / maxTotal * 10000) / 100,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// חישוב מחדש לכל הלידים
// ============================================================
router.post("/recalculate-all", async (req: Request, res: Response) => {
  try {
    const leads = await pool.query(`SELECT * FROM lead_scores`);
    let updated = 0;

    for (const lead of leads.rows) {
      // חישוב דרגה מחדש לפי ציון
      let tier = "D";
      if (lead.score >= 80) tier = "A";
      else if (lead.score >= 50) tier = "B";
      else if (lead.score >= 20) tier = "C";

      const conversionProbability = Math.round(lead.score * 0.85 * 100) / 100;

      let action = "No action";
      let actionHe = "ללא פעולה";
      if (tier === "A") { action = "Call immediately"; actionHe = "להתקשר מיד"; }
      else if (tier === "B") { action = "Schedule meeting"; actionHe = "לקבוע פגישה"; }
      else if (tier === "C") { action = "Email nurture"; actionHe = "טיפוח במייל"; }

      await pool.query(
        `UPDATE lead_scores SET tier = $1, conversion_probability = $2, recommended_action = $3, recommended_action_he = $4, last_calculated = NOW(), updated_at = NOW() WHERE id = $5`,
        [tier, conversionProbability, action, actionHe, lead.id]
      );
      updated++;
    }

    res.json({ success: true, message: `${updated} לידים עודכנו`, total_updated: updated });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// אנליטיקס סוכן לתקופה
// ============================================================
router.get("/agent/:id/analytics/:period", async (req: Request, res: Response) => {
  try {
    const { id, period } = req.params;
    const result = await pool.query(
      `SELECT * FROM agent_analytics WHERE agent_id = $1 AND period = $2`,
      [id, period]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: "נתוני סוכן לא נמצאו לתקופה זו" });
    }

    const agent = result.rows[0];

    // חישוב KPIs
    const kpis = {
      efficiency_score: Math.round((agent.contact_rate * 0.3 + agent.close_rate * 0.4 + agent.followup_compliance * 0.3) * 100) / 100,
      revenue_per_lead: agent.total_leads_received > 0 ? Math.round(agent.total_revenue / agent.total_leads_received * 100) / 100 : 0,
      revenue_per_call: (agent.total_calls_made + agent.total_calls_received) > 0 ? Math.round(agent.total_revenue / (agent.total_calls_made + agent.total_calls_received) * 100) / 100 : 0,
      calls_per_deal: agent.total_deals_closed > 0 ? Math.round((agent.total_calls_made + agent.total_calls_received) / agent.total_deals_closed * 100) / 100 : 0,
      is_at_risk: agent.agent_risk_score > 40,
    };

    res.json({ success: true, data: agent, kpis });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// פעילות יומית סוכן
// ============================================================
router.get("/agent/:id/daily/:date", async (req: Request, res: Response) => {
  try {
    const { id, date } = req.params;
    const result = await pool.query(
      `SELECT * FROM agent_daily_activity WHERE agent_id = $1 AND activity_date = $2`,
      [id, date]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: "לא נמצאה פעילות לתאריך זה" });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// דירוג סוכנים לתקופה
// ============================================================
router.get("/agent-ranking/:period", async (req: Request, res: Response) => {
  try {
    const { period } = req.params;
    const result = await pool.query(
      `SELECT *,
        RANK() OVER (ORDER BY agent_value_score DESC) as ranking
       FROM agent_analytics
       WHERE period = $1
       ORDER BY agent_value_score DESC`,
      [period]
    );

    res.json({ success: true, data: result.rows, period });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// דוח סיכון סוכנים - סוכנים עם ציון סיכון גבוה
// ============================================================
router.get("/agent-risk-report", async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT agent_id, agent_name, period, agent_risk_score,
              missed_call_rate, avg_discount_pct, followup_compliance,
              gps_anomalies, leads_lost, leads_lost_reasons,
              avg_response_time_min
       FROM agent_analytics
       WHERE agent_risk_score > 20
       ORDER BY agent_risk_score DESC, period DESC`
    );

    // זיהוי דגלים אדומים
    const flaggedAgents = result.rows.map((a: any) => {
      const redFlags: string[] = [];
      if (a.missed_call_rate > 10) redFlags.push("שיעור שיחות שלא נענו גבוה");
      if (a.avg_discount_pct > 12) redFlags.push("הנחות גבוהות מדי");
      if (a.followup_compliance < 50) redFlags.push("מעקב נמוך");
      if (a.gps_anomalies > 2) redFlags.push("חריגות GPS");
      if (a.avg_response_time_min > 45) redFlags.push("זמן תגובה ארוך");

      return { ...a, red_flags: redFlags, red_flags_count: redFlags.length };
    });

    res.json({ success: true, data: flaggedAgents, total_flagged: flaggedAgents.length });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// השוואת סוכנים - זה לצד זה
// ============================================================
router.get("/agent-comparison", async (req: Request, res: Response) => {
  try {
    // ממוצע על כל התקופות
    const result = await pool.query(
      `SELECT
         agent_id, agent_name,
         COUNT(*) as periods_count,
         AVG(contact_rate) as avg_contact_rate,
         AVG(meeting_rate) as avg_meeting_rate,
         AVG(close_rate) as avg_close_rate,
         SUM(total_revenue) as total_revenue,
         AVG(avg_deal_size) as avg_deal_size,
         SUM(total_deals_closed) as total_deals,
         AVG(missed_call_rate) as avg_missed_call_rate,
         AVG(avg_response_time_min) as avg_response_time,
         AVG(followup_compliance) as avg_followup_compliance,
         AVG(customer_satisfaction) as avg_satisfaction,
         AVG(agent_value_score) as avg_value_score,
         AVG(agent_risk_score) as avg_risk_score,
         SUM(leads_lost) as total_leads_lost
       FROM agent_analytics
       GROUP BY agent_id, agent_name
       ORDER BY avg_value_score DESC`
    );

    // עיגול ערכים
    const comparison = result.rows.map((a: any) => ({
      ...a,
      avg_contact_rate: Math.round(parseFloat(a.avg_contact_rate) * 100) / 100,
      avg_meeting_rate: Math.round(parseFloat(a.avg_meeting_rate) * 100) / 100,
      avg_close_rate: Math.round(parseFloat(a.avg_close_rate) * 100) / 100,
      total_revenue: Math.round(parseFloat(a.total_revenue) * 100) / 100,
      avg_deal_size: Math.round(parseFloat(a.avg_deal_size) * 100) / 100,
      avg_missed_call_rate: Math.round(parseFloat(a.avg_missed_call_rate) * 100) / 100,
      avg_response_time: Math.round(parseFloat(a.avg_response_time)),
      avg_followup_compliance: Math.round(parseFloat(a.avg_followup_compliance) * 100) / 100,
      avg_satisfaction: Math.round(parseFloat(a.avg_satisfaction) * 10) / 10,
      avg_value_score: Math.round(parseFloat(a.avg_value_score)),
      avg_risk_score: Math.round(parseFloat(a.avg_risk_score)),
    }));

    res.json({ success: true, data: comparison });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// משפך המרה לתקופה
// ============================================================
router.get("/conversion-funnel/:period", async (req: Request, res: Response) => {
  try {
    const { period } = req.params;

    const result = await pool.query(
      `SELECT
         SUM(total_leads_received) as total_leads,
         SUM(total_leads_contacted) as total_contacted,
         SUM(total_meetings_set) as total_meetings,
         SUM(total_quotes_sent) as total_quotes,
         SUM(total_deals_closed) as total_closed,
         SUM(total_revenue) as total_revenue
       FROM agent_analytics
       WHERE period = $1`,
      [period]
    );

    if (!result.rows[0].total_leads) {
      return res.status(404).json({ success: false, error: "לא נמצאו נתונים לתקופה" });
    }

    const data = result.rows[0];
    const totalLeads = parseInt(data.total_leads);
    const totalContacted = parseInt(data.total_contacted);
    const totalMeetings = parseInt(data.total_meetings);
    const totalQuotes = parseInt(data.total_quotes);
    const totalClosed = parseInt(data.total_closed);

    const funnel = [
      {
        stage: "לידים שהתקבלו",
        stage_en: "Leads Received",
        count: totalLeads,
        percentage: 100,
        drop_off: 0,
        drop_off_pct: 0,
      },
      {
        stage: "נוצר קשר",
        stage_en: "Contacted",
        count: totalContacted,
        percentage: totalLeads > 0 ? Math.round(totalContacted / totalLeads * 10000) / 100 : 0,
        drop_off: totalLeads - totalContacted,
        drop_off_pct: totalLeads > 0 ? Math.round((totalLeads - totalContacted) / totalLeads * 10000) / 100 : 0,
      },
      {
        stage: "פגישה נקבעה",
        stage_en: "Meeting Set",
        count: totalMeetings,
        percentage: totalLeads > 0 ? Math.round(totalMeetings / totalLeads * 10000) / 100 : 0,
        drop_off: totalContacted - totalMeetings,
        drop_off_pct: totalContacted > 0 ? Math.round((totalContacted - totalMeetings) / totalContacted * 10000) / 100 : 0,
      },
      {
        stage: "הצעת מחיר",
        stage_en: "Quote Sent",
        count: totalQuotes,
        percentage: totalLeads > 0 ? Math.round(totalQuotes / totalLeads * 10000) / 100 : 0,
        drop_off: totalMeetings - totalQuotes,
        drop_off_pct: totalMeetings > 0 ? Math.round((totalMeetings - totalQuotes) / totalMeetings * 10000) / 100 : 0,
      },
      {
        stage: "עסקה נסגרה",
        stage_en: "Deal Closed",
        count: totalClosed,
        percentage: totalLeads > 0 ? Math.round(totalClosed / totalLeads * 10000) / 100 : 0,
        drop_off: totalQuotes - totalClosed,
        drop_off_pct: totalQuotes > 0 ? Math.round((totalQuotes - totalClosed) / totalQuotes * 10000) / 100 : 0,
      },
    ];

    res.json({
      success: true,
      period,
      funnel,
      total_revenue: parseFloat(data.total_revenue),
      overall_conversion_rate: totalLeads > 0 ? Math.round(totalClosed / totalLeads * 10000) / 100 : 0,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// דשבורד כללי
// ============================================================
router.get("/dashboard", async (req: Request, res: Response) => {
  try {
    // לידים מובילים
    const topLeads = await pool.query(
      `SELECT lead_id, lead_name, score, tier, conversion_probability, recommended_action_he
       FROM lead_scores WHERE tier IN ('A','B')
       ORDER BY score DESC LIMIT 10`
    );

    // סוכנים מובילים (תקופה אחרונה)
    const latestPeriod = await pool.query(
      `SELECT DISTINCT period FROM agent_analytics ORDER BY period DESC LIMIT 1`
    );
    const currentPeriod = latestPeriod.rows[0]?.period || "2026-03";

    const topAgents = await pool.query(
      `SELECT agent_id, agent_name, agent_value_score, total_revenue, close_rate, customer_satisfaction
       FROM agent_analytics WHERE period = $1
       ORDER BY agent_value_score DESC`,
      [currentPeriod]
    );

    // שיעורי המרה
    const conversionRates = await pool.query(
      `SELECT
         AVG(contact_rate) as avg_contact_rate,
         AVG(meeting_rate) as avg_meeting_rate,
         AVG(close_rate) as avg_close_rate,
         SUM(total_revenue) as total_revenue,
         SUM(total_deals_closed) as total_deals
       FROM agent_analytics WHERE period = $1`,
      [currentPeriod]
    );

    // תחזית הכנסות מבוססת צינור
    const pipeline = await pool.query(
      `SELECT
         SUM(CASE WHEN tier = 'A' THEN 1 ELSE 0 END) as tier_a_count,
         SUM(CASE WHEN tier = 'B' THEN 1 ELSE 0 END) as tier_b_count,
         SUM(CASE WHEN tier = 'C' THEN 1 ELSE 0 END) as tier_c_count,
         SUM(CASE WHEN tier = 'D' THEN 1 ELSE 0 END) as tier_d_count,
         AVG(conversion_probability) as avg_conversion_prob
       FROM lead_scores`
    );

    // הערכת תחזית - לפי ממוצע עסקה וסיכויי המרה
    const avgDeal = await pool.query(
      `SELECT AVG(avg_deal_size) as avg FROM agent_analytics WHERE period = $1`,
      [currentPeriod]
    );
    const avgDealSize = parseFloat(avgDeal.rows[0]?.avg || 30000);

    const tierACount = parseInt(pipeline.rows[0]?.tier_a_count || 0);
    const tierBCount = parseInt(pipeline.rows[0]?.tier_b_count || 0);
    const tierCCount = parseInt(pipeline.rows[0]?.tier_c_count || 0);

    const revenueForcast =
      tierACount * avgDealSize * 0.85 +
      tierBCount * avgDealSize * 0.45 +
      tierCCount * avgDealSize * 0.15;

    // סיכום דרגות לידים
    const tierSummary = await pool.query(
      `SELECT tier, COUNT(*) as count FROM lead_scores GROUP BY tier ORDER BY tier`
    );

    res.json({
      success: true,
      dashboard: {
        top_leads: topLeads.rows,
        top_agents: topAgents.rows,
        current_period: currentPeriod,
        conversion_rates: {
          avg_contact_rate: Math.round(parseFloat(conversionRates.rows[0]?.avg_contact_rate || 0) * 100) / 100,
          avg_meeting_rate: Math.round(parseFloat(conversionRates.rows[0]?.avg_meeting_rate || 0) * 100) / 100,
          avg_close_rate: Math.round(parseFloat(conversionRates.rows[0]?.avg_close_rate || 0) * 100) / 100,
          total_revenue: Math.round(parseFloat(conversionRates.rows[0]?.total_revenue || 0) * 100) / 100,
          total_deals: parseInt(conversionRates.rows[0]?.total_deals || 0),
        },
        lead_tiers: tierSummary.rows,
        revenue_forecast: Math.round(revenueForcast * 100) / 100,
        pipeline_value: {
          tier_a: tierACount,
          tier_b: tierBCount,
          tier_c: tierCCount,
          avg_deal_size: Math.round(avgDealSize * 100) / 100,
        },
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// ניתוח לידים אבודים
// ============================================================
router.get("/lost-lead-analysis/:period", async (req: Request, res: Response) => {
  try {
    const { period } = req.params;

    const result = await pool.query(
      `SELECT agent_id, agent_name, leads_lost, leads_lost_reasons
       FROM agent_analytics
       WHERE period = $1 AND leads_lost > 0
       ORDER BY leads_lost DESC`,
      [period]
    );

    // אגרגציית סיבות
    const allReasons: Record<string, number> = {};
    let totalLost = 0;

    for (const row of result.rows) {
      totalLost += row.leads_lost;
      const reasons = row.leads_lost_reasons || {};
      for (const [reason, count] of Object.entries(reasons)) {
        allReasons[reason] = (allReasons[reason] || 0) + (count as number);
      }
    }

    // מיון סיבות
    const sortedReasons = Object.entries(allReasons)
      .map(([reason, count]) => ({
        reason,
        count,
        percentage: totalLost > 0 ? Math.round(count / totalLost * 10000) / 100 : 0,
      }))
      .sort((a, b) => b.count - a.count);

    res.json({
      success: true,
      period,
      total_leads_lost: totalLost,
      reasons_breakdown: sortedReasons,
      by_agent: result.rows,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// יצירת אנליטיקס אוטומטי מנתוני פעילות
// ============================================================
router.post("/generate-agent-analytics/:period", async (req: Request, res: Response) => {
  try {
    const { period } = req.params;
    const [yearStr, monthStr] = period.split("-");

    // שליפת כל הסוכנים שיש להם פעילות בתקופה
    const agents = await pool.query(
      `SELECT DISTINCT agent_id, agent_name FROM agent_daily_activity
       WHERE activity_date >= $1 AND activity_date < $2`,
      [`${period}-01`, `${yearStr}-${String(parseInt(monthStr) + 1).padStart(2, "0")}-01`]
    );

    const results = [];

    for (const agent of agents.rows) {
      // אגרגציית נתוני פעילות יומית
      const activity = await pool.query(
        `SELECT
           SUM(calls_out) as total_calls_out,
           SUM(calls_in) as total_calls_in,
           SUM(calls_missed) as total_calls_missed,
           SUM(call_duration_total_min) as total_call_min,
           SUM(meetings_attended) as total_meetings,
           SUM(quotes_created) as total_quotes,
           SUM(quotes_amount) as total_quotes_amount,
           SUM(deals_closed) as total_deals,
           SUM(deals_amount) as total_deals_amount,
           SUM(leads_contacted) as total_contacted,
           SUM(leads_new) as total_new_leads,
           SUM(whatsapp_messages_sent) as total_whatsapp,
           SUM(emails_sent) as total_emails,
           SUM(km_driven) as total_km,
           SUM(locations_visited) as total_locations,
           AVG(work_hours) as avg_work_hours,
           COUNT(*) as work_days
         FROM agent_daily_activity
         WHERE agent_id = $1 AND activity_date >= $2 AND activity_date < $3`,
        [agent.agent_id, `${period}-01`, `${yearStr}-${String(parseInt(monthStr) + 1).padStart(2, "0")}-01`]
      );

      const a = activity.rows[0];
      const totalCallsMade = parseInt(a.total_calls_out || 0);
      const totalCallsReceived = parseInt(a.total_calls_in || 0);
      const totalCallsMissed = parseInt(a.total_calls_missed || 0);
      const totalAllCalls = totalCallsMade + totalCallsReceived;
      const missedCallRate = totalAllCalls > 0 ? Math.round(totalCallsMissed / totalAllCalls * 10000) / 100 : 0;

      const totalLeadsReceived = parseInt(a.total_new_leads || 0) + parseInt(a.total_contacted || 0);
      const totalContacted = parseInt(a.total_contacted || 0);
      const contactRate = totalLeadsReceived > 0 ? Math.round(totalContacted / totalLeadsReceived * 10000) / 100 : 0;

      const totalMeetings = parseInt(a.total_meetings || 0);
      const meetingRate = totalContacted > 0 ? Math.round(totalMeetings / totalContacted * 10000) / 100 : 0;

      const totalQuotes = parseInt(a.total_quotes || 0);
      const quoteRate = totalMeetings > 0 ? Math.round(totalQuotes / totalMeetings * 10000) / 100 : 0;

      const totalDeals = parseInt(a.total_deals || 0);
      const closeRate = totalQuotes > 0 ? Math.round(totalDeals / totalQuotes * 10000) / 100 : 0;

      const totalRevenue = parseFloat(a.total_deals_amount || 0);
      const avgDealSize = totalDeals > 0 ? Math.round(totalRevenue / totalDeals * 100) / 100 : 0;
      const totalCallHours = Math.round(parseInt(a.total_call_min || 0) / 60 * 100) / 100;
      const avgCallDuration = totalAllCalls > 0 ? Math.round(parseInt(a.total_call_min || 0) * 60 / totalAllCalls) : 0;

      // ערך וסיכון
      const valueScore = Math.min(100, Math.round(closeRate * 0.3 + (totalRevenue / 10000) * 0.3 + contactRate * 0.2 + meetingRate * 0.2));
      const riskScore = Math.min(100, (missedCallRate > 10 ? 25 : 0) + (contactRate < 50 ? 25 : 0) + (closeRate < 10 ? 25 : 0));

      // עדכון או יצירה
      await pool.query(
        `INSERT INTO agent_analytics (
          agent_id, agent_name, period,
          total_leads_received, total_leads_contacted, contact_rate,
          total_meetings_set, meeting_rate, total_quotes_sent, quote_rate,
          total_deals_closed, close_rate, total_revenue, avg_deal_size,
          total_calls_made, total_calls_received, total_calls_missed, missed_call_rate,
          avg_call_duration_sec, total_call_time_hours,
          agent_risk_score, agent_value_score
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
        ON CONFLICT DO NOTHING`,
        [
          agent.agent_id, agent.agent_name, period,
          totalLeadsReceived, totalContacted, contactRate,
          totalMeetings, meetingRate, totalQuotes, quoteRate,
          totalDeals, closeRate, totalRevenue, avgDealSize,
          totalCallsMade, totalCallsReceived, totalCallsMissed, missedCallRate,
          avgCallDuration, totalCallHours,
          riskScore, valueScore,
        ]
      );

      results.push({
        agent_name: agent.agent_name,
        period,
        total_revenue: totalRevenue,
        deals_closed: totalDeals,
        value_score: valueScore,
      });
    }

    res.json({
      success: true,
      message: `אנליטיקס חושב ל-${results.length} סוכנים לתקופה ${period}`,
      data: results,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
