// ══════════════════════════════════════════════════════════════════
// MODULE: Competitor Intelligence
// מודול שעוקב אחרי מתחרים ומזהה איומים + הזדמנויות
// ══════════════════════════════════════════════════════════════════
//
// אסטרטגיה:
//   1. מחזיק רשימת מתחרים ידועים לכל עסק
//   2. לכל מתחרה — מזהה שינויים: מחיר, מוצר חדש, קמפיין, דירוג חיפוש
//   3. מעביר לניתוח AI: "האם זה איום? הזדמנות? איך להגיב?"
//   4. יוצר התראות כשמתרחש משהו משמעותי
//
// בפרודקשן: יחבר ל-SerpApi / Ahrefs / SimilarWeb / Crawler פנימי.

const CompetitorIntelModule = {
  name: "competitor_intel",
  description: "Monitors competitors and detects threats + opportunities",

  // Stub competitor data — in production would be scraped / fetched via API
  _stubCompetitors: [
    {
      id: "comp_tku_1",
      business: "techno_kol_uzi",
      name: "מטלורגיה צפון",
      website: "metalurgia-tzafon.example.com",
      last_snapshot: {
        avg_price_ils: 1850,
        products_count: 47,
        google_ranking_main_kw: 4,
        social_followers: 1240,
        recent_activity: ["launched new product line", "ran promo 15% off"],
      },
    },
    {
      id: "comp_tku_2",
      business: "techno_kol_uzi",
      name: "פרגולות 365",
      website: "pergolot365.example.com",
      last_snapshot: {
        avg_price_ils: 2100,
        products_count: 28,
        google_ranking_main_kw: 7,
        social_followers: 890,
        recent_activity: ["updated homepage", "added Instagram reels"],
      },
    },
    {
      id: "comp_elk_1",
      business: "elkayam_real_estate",
      name: "Prime Tel Aviv Real Estate",
      website: "prime-tlv.example.com",
      last_snapshot: {
        listings_count: 142,
        avg_price_usd: 1_450_000,
        google_ranking_main_kw: 2,
        languages: ["en", "he"],
        recent_activity: ["added 12 new luxury listings", "launched FR landing page"],
      },
    },
  ],

  async run(state, brain, alerts) {
    const competitors = this._stubCompetitors;
    const threatsFound = [];
    const opportunitiesFound = [];

    for (const competitor of competitors) {
      if (!competitor.last_snapshot.recent_activity?.length) continue;

      const analysis = await brain.analyze(
        {
          competitor: {
            name: competitor.name,
            business_they_compete_in: competitor.business,
            snapshot: competitor.last_snapshot,
          },
        },
        "האם יש כאן איום? הזדמנות? מה המשמעות עבורנו? איך להגיב?"
      );

      if (analysis?.findings) {
        for (const finding of analysis.findings) {
          const isThreat = /איום|threat|סכנה|danger/i.test(finding);
          if (isThreat) {
            threatsFound.push({ competitor: competitor.name, finding });
          }
        }
      }
      if (analysis?.insights) {
        for (const insight of analysis.insights) {
          const isOpportunity = /הזדמנות|opportunity|פער|gap/i.test(insight);
          if (isOpportunity) {
            opportunitiesFound.push({ competitor: competitor.name, insight });
          }
        }
      }

      state.addMemory("shortTerm", {
        type: "competitor_scan",
        competitor_id: competitor.id,
        business: competitor.business,
        findings_count: analysis?.findings?.length || 0,
      });
    }

    if (threatsFound.length > 0) {
      alerts.addAlert(
        "warning",
        `Competitor threats detected`,
        `${threatsFound.length} threats from competitors`,
        { threats: threatsFound }
      );
    }
    if (opportunitiesFound.length > 0) {
      alerts.addAlert(
        "info",
        `Competitor opportunities detected`,
        `${opportunitiesFound.length} opportunities discovered`,
        { opportunities: opportunitiesFound }
      );
    }

    state.update("modules.competitor_intel.last_threats", threatsFound);
    state.update("modules.competitor_intel.last_opportunities", opportunitiesFound);
  },
};

module.exports = CompetitorIntelModule;
