// ══════════════════════════════════════════════════════════════════
// MODULE: Lead Scorer
// מודול שמדרג לידים נכנסים לפי סיכוי לסגירה + ערך צפוי
// ══════════════════════════════════════════════════════════════════
//
// אסטרטגיה:
//   1. מקבל ליד חדש (מ-Google Ads, מהאתר, מ-WhatsApp)
//   2. מחשב ציון בין 0-100 על בסיס: מקור, שפה, איכות פניה, תקציב מצוין, דחיפות
//   3. מסווג לקטגוריות: hot / warm / cold / unqualified
//   4. מחליט: נציג מיידי / מייל אוטומטי / דרוס אוטומטי
//   5. לומד מתוצאות סגירה (supervised feedback loop)

const LeadScorerModule = {
  name: "lead_scorer",
  description: "Scores incoming leads and routes them to the right response path",

  // Weights for scoring dimensions — updated by self_improvement
  _weights: {
    source: { "google_ads": 30, "website_form": 25, "whatsapp": 35, "referral": 40, "facebook": 15 },
    language: { "he": 20, "en": 25, "fr": 30 },  // EN/FR higher value for Elkayam
    budget_mentioned: 15,
    urgency_mentioned: 10,
    specific_product: 20,
    location_match: 10,
  },

  // Stub pipeline — in production pulled from CRM/webhook inbox
  _pendingLeads: [
    {
      id: "lead_001",
      business: "techno_kol_uzi",
      source: "google_ads",
      language: "he",
      name: "יוסי כהן",
      contact: "052-xxx-xxxx",
      message: "שלום, מעוניין בפרגולה לחצר בבית. דחוף. תקציב עד 25K.",
      received_at: new Date().toISOString(),
    },
    {
      id: "lead_002",
      business: "techno_kol_uzi",
      source: "website_form",
      language: "he",
      name: "דני לוי",
      contact: "dani@example.com",
      message: "מחפש מעקה",
      received_at: new Date().toISOString(),
    },
    {
      id: "lead_003",
      business: "elkayam_real_estate",
      source: "referral",
      language: "en",
      name: "David Cohen (Paris)",
      contact: "david@example.com",
      message: "Looking for a luxury penthouse in Tel Aviv. Budget: $3M. Want to view next month.",
      received_at: new Date().toISOString(),
    },
    {
      id: "lead_004",
      business: "elkayam_real_estate",
      source: "google_ads",
      language: "fr",
      name: "Sophie Levy",
      contact: "sophie@example.com",
      message: "Je cherche à investir à Tel Aviv. Intéressée par un appartement à partir de 1M€.",
      received_at: new Date().toISOString(),
    },
  ],

  scoreLead(lead) {
    let score = 0;
    const breakdown = {};

    // Source weight
    const sourceScore = this._weights.source[lead.source] || 10;
    score += sourceScore;
    breakdown.source = sourceScore;

    // Language weight
    const langScore = this._weights.language[lead.language] || 10;
    score += langScore;
    breakdown.language = langScore;

    // Budget mentioned
    if (/תקציב|budget|\$|€|₪|\d+k|\d+K|\d+,\d{3}/i.test(lead.message)) {
      score += this._weights.budget_mentioned;
      breakdown.budget_mentioned = this._weights.budget_mentioned;
    }

    // Urgency mentioned
    if (/דחוף|urgent|asap|immediately|rapidement/i.test(lead.message)) {
      score += this._weights.urgency_mentioned;
      breakdown.urgency_mentioned = this._weights.urgency_mentioned;
    }

    // Specific product
    if (/פרגולה|שער|מעקה|penthouse|appartement|apartment|gate|railing|pergola/i.test(lead.message)) {
      score += this._weights.specific_product;
      breakdown.specific_product = this._weights.specific_product;
    }

    // Location
    if (/תל אביב|tel aviv|tlv|גוש דן/i.test(lead.message)) {
      score += this._weights.location_match;
      breakdown.location_match = this._weights.location_match;
    }

    score = Math.min(100, score);

    const category =
      score >= 75 ? "hot" :
      score >= 50 ? "warm" :
      score >= 25 ? "cold" : "unqualified";

    const action =
      category === "hot" ? "assign_to_agent_immediately" :
      category === "warm" ? "personalized_email_within_1h" :
      category === "cold" ? "automated_nurture_sequence" :
      "discard_or_newsletter_only";

    return { score, category, action, breakdown };
  },

  async run(state, brain, alerts) {
    const results = [];

    for (const lead of this._pendingLeads) {
      const scoring = this.scoreLead(lead);
      results.push({
        lead_id: lead.id,
        business: lead.business,
        score: scoring.score,
        category: scoring.category,
        action: scoring.action,
        breakdown: scoring.breakdown,
      });

      state.addMemory("shortTerm", {
        type: "lead_scored",
        lead_id: lead.id,
        business: lead.business,
        score: scoring.score,
        category: scoring.category,
        action: scoring.action,
      });

      if (scoring.category === "hot") {
        alerts.addAlert(
          "info",
          `HOT LEAD — ${lead.business}`,
          `${lead.name}: ${lead.message.substring(0, 80)}... (score: ${scoring.score})`,
          { lead_id: lead.id, action: scoring.action }
        );
      }
    }

    const hotCount = results.filter(r => r.category === "hot").length;
    const warmCount = results.filter(r => r.category === "warm").length;
    state.update("modules.lead_scorer.last_scoring", {
      total: results.length,
      hot: hotCount,
      warm: warmCount,
      results,
    });

    // Summary decision: how to allocate team time?
    if (hotCount > 0 || warmCount > 2) {
      await brain.makeDecision(
        {
          hot_leads: hotCount,
          warm_leads: warmCount,
          business_mix: results.map(r => r.business),
        },
        ["focus_all_agents_on_hot_leads", "balance_across_both_businesses", "prioritize_elkayam_international", "rest"],
        { extra: "איזו אסטרטגיית טיפול בלידים כעת?" }
      );
    }
  },
};

module.exports = LeadScorerModule;
