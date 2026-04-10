// ══════════════════════════════════════════════════════════════════
// MODULE: Google Ads Optimizer
// מודול שמנהל ומייעל קמפייני גוגל אדס אוטונומית
// ══════════════════════════════════════════════════════════════════
//
// אסטרטגיה:
//   1. קורא KPIs אחרונים של כל קמפיין (clicks, impressions, CTR, CPA, ROAS)
//   2. מזהה קמפיינים לא-רווחיים (CPA > goal, ROAS < goal)
//   3. מבקש מה-Brain החלטה לכל קמפיין: pause/increase_bid/decrease_bid/rewrite_ad
//   4. מפעיל את ההחלטה (אצלנו simulated — בפרודקשן יחבר ל-Google Ads API)
//   5. עוקב אחרי התוצאות ולומד
//
// בפרודקשן: יחבר ל-Google Ads API דרך google-ads-api npm package + OAuth2.

const GoogleAdsOptimizer = {
  name: "google_ads_optimizer",
  description: "Autonomously optimizes Google Ads campaigns for both businesses",

  // Stub data — in production this fetches from the Google Ads API
  _stubCampaigns: [
    {
      id: "camp_tku_001",
      business: "techno_kol_uzi",
      name: "מעקות אלומיניום — תל אביב",
      status: "active",
      daily_budget_ils: 250,
      spend_last_7d: 1680,
      clicks_last_7d: 340,
      impressions_last_7d: 14200,
      ctr: 2.39,
      cpa_ils: 18.5,
      conversions_last_7d: 18,
      roas: 4.2,
    },
    {
      id: "camp_tku_002",
      business: "techno_kol_uzi",
      name: "שערים חשמליים — גוש דן",
      status: "active",
      daily_budget_ils: 180,
      spend_last_7d: 1230,
      clicks_last_7d: 195,
      impressions_last_7d: 9800,
      ctr: 1.99,
      cpa_ils: 41.0,
      conversions_last_7d: 6,
      roas: 2.1,
    },
    {
      id: "camp_elk_001",
      business: "elkayam_real_estate",
      name: "Luxury Tel Aviv Apartments (EN)",
      status: "active",
      daily_budget_ils: 400,
      spend_last_7d: 2800,
      clicks_last_7d: 420,
      impressions_last_7d: 22000,
      ctr: 1.91,
      cpa_ils: 62.0,
      conversions_last_7d: 4,
      roas: 9.8,
    },
    {
      id: "camp_elk_002",
      business: "elkayam_real_estate",
      name: "Appartements de Luxe Tel Aviv (FR)",
      status: "active",
      daily_budget_ils: 300,
      spend_last_7d: 1950,
      clicks_last_7d: 185,
      impressions_last_7d: 15400,
      ctr: 1.20,
      cpa_ils: 110.0,
      conversions_last_7d: 2,
      roas: 5.4,
    },
  ],

  async run(state, brain, alerts) {
    const campaigns = this._stubCampaigns;
    const goals = {
      cpa_max_ils: 25,       // CPA ביעד
      roas_min: 8,           // ROAS ביעד
    };

    const decisions = [];
    for (const campaign of campaigns) {
      const isProblematic =
        campaign.cpa_ils > goals.cpa_max_ils ||
        campaign.roas < goals.roas_min;

      if (!isProblematic) continue;

      const decision = await brain.makeDecision(
        {
          campaign: {
            id: campaign.id,
            business: campaign.business,
            name: campaign.name,
            cpa_ils: campaign.cpa_ils,
            roas: campaign.roas,
            ctr: campaign.ctr,
            spend_last_7d: campaign.spend_last_7d,
            conversions_last_7d: campaign.conversions_last_7d,
          },
          targets: goals,
          problem_type:
            campaign.cpa_ils > goals.cpa_max_ils && campaign.roas < goals.roas_min
              ? "high_cpa_and_low_roas"
              : campaign.cpa_ils > goals.cpa_max_ils
              ? "high_cpa"
              : "low_roas",
        },
        [
          "pause_campaign",
          "decrease_bid_20pct",
          "decrease_bid_40pct",
          "increase_bid_20pct",
          "rewrite_ad_copy",
          "shift_budget_to_winner",
          "expand_negative_keywords",
          "narrow_geo_targeting",
        ],
        { extra: `אופטימיזציית קמפיין גוגל אדס — מטרה: CPA < ₪${goals.cpa_max_ils}, ROAS > ${goals.roas_min}x` }
      );

      if (decision) {
        decisions.push({
          campaign_id: campaign.id,
          business: campaign.business,
          decision: decision.decision,
          reasoning: decision.reasoning,
          confidence: decision.confidence,
        });

        // In production: would actually call the Google Ads API here
        // For now we just record the intention in shortTerm memory
        state.addMemory("shortTerm", {
          type: "ads_optimization",
          campaign_id: campaign.id,
          action: decision.decision,
          business: campaign.business,
        });
      }
    }

    if (decisions.length > 0) {
      alerts.addAlert(
        "info",
        "Google Ads optimizations planned",
        `${decisions.length} campaigns flagged for optimization`,
        { decisions }
      );
    }

    state.update("modules.google_ads_optimizer.last_decisions", decisions);
    state.update("modules.google_ads_optimizer.last_total_spend_7d",
      campaigns.reduce((sum, c) => sum + c.spend_last_7d, 0));
    state.update("modules.google_ads_optimizer.last_total_conversions_7d",
      campaigns.reduce((sum, c) => sum + c.conversions_last_7d, 0));
  },
};

module.exports = GoogleAdsOptimizer;
