// ══════════════════════════════════════════════════════════════════
// MODULE: Market Trend Analyzer
// מודול שקורא טרנדים מקרו + מתרגם להשפעה על שני העסקים
// ══════════════════════════════════════════════════════════════════
//
// אסטרטגיה:
//   1. קולט אינדיקטורים מקרו (ריבית, מדד נדל"ן, עלויות חומרי גלם, שע"ח)
//   2. מעביר ל-AI ניתוח: "איך זה משפיע עלינו בשבועות הקרובים?"
//   3. מייצר המלצות פעולה קונקרטיות
//   4. שומר תחזיות לבדיקה חוזרת (accountability loop)

const MarketTrendAnalyzerModule = {
  name: "market_trend_analyzer",
  description: "Reads macro indicators and translates to business impact",

  _stubIndicators: {
    bank_of_israel_rate_pct: 4.5,
    bank_of_israel_rate_change_30d: -0.25,
    tel_aviv_home_price_index: 187.3,
    tel_aviv_home_price_change_30d_pct: 1.8,
    usd_ils: 3.68,
    usd_ils_change_30d_pct: -0.5,
    eur_ils: 4.01,
    eur_ils_change_30d_pct: 0.3,
    aluminum_price_usd_ton: 2415,
    aluminum_price_change_30d_pct: 3.2,
    steel_price_usd_ton: 780,
    steel_price_change_30d_pct: -1.1,
    consumer_confidence_index: 112.4,
    construction_permits_30d_change_pct: 5.6,
  },

  async run(state, brain, alerts) {
    const indicators = this._stubIndicators;

    // Analyze for Techno-Kol Uzi (metal work affected by raw material prices)
    const tkuAnalysis = await brain.analyze(
      {
        business: "techno_kol_uzi",
        aluminum_price: indicators.aluminum_price_usd_ton,
        aluminum_change_pct: indicators.aluminum_price_change_30d_pct,
        steel_price: indicators.steel_price_usd_ton,
        steel_change_pct: indicators.steel_price_change_30d_pct,
        construction_permits: indicators.construction_permits_30d_change_pct,
        consumer_confidence: indicators.consumer_confidence_index,
      },
      "איך האינדיקטורים האלה משפיעים על טכנו כל עוזי ב-30 יום הקרובים? האם להעלות מחיר? להקטין מלאי? להאיץ קמפיין?"
    );

    // Analyze for Elkayam Real Estate (affected by interest rates + exchange rates)
    const elkAnalysis = await brain.analyze(
      {
        business: "elkayam_real_estate",
        interest_rate: indicators.bank_of_israel_rate_pct,
        rate_change: indicators.bank_of_israel_rate_change_30d,
        home_price_index: indicators.tel_aviv_home_price_index,
        home_price_change: indicators.tel_aviv_home_price_change_30d_pct,
        usd_ils: indicators.usd_ils,
        eur_ils: indicators.eur_ils,
      },
      "איך זה משפיע על לקוחות בינלאומיים של קובי אלקיים נדל\"ן? עדיין כדאי לדחוף בשוק האמריקאי? האירופאי?"
    );

    state.addMemory("longTerm", {
      type: "market_trend_analysis",
      indicators,
      tku_insights: tkuAnalysis?.insights,
      tku_recommendations: tkuAnalysis?.recommendations,
      elk_insights: elkAnalysis?.insights,
      elk_recommendations: elkAnalysis?.recommendations,
    });

    state.update("modules.market_trend_analyzer.last_indicators", indicators);
    state.update("modules.market_trend_analyzer.last_tku", tkuAnalysis);
    state.update("modules.market_trend_analyzer.last_elk", elkAnalysis);

    // Flag major moves
    if (Math.abs(indicators.aluminum_price_change_30d_pct) > 5) {
      alerts.addAlert(
        "warning",
        "Aluminum price swing >5%",
        `Aluminum ${indicators.aluminum_price_change_30d_pct > 0 ? "up" : "down"} ${indicators.aluminum_price_change_30d_pct}% in 30d`,
        { impact: "re-price offers to customers" }
      );
    }
    if (Math.abs(indicators.usd_ils_change_30d_pct) > 2) {
      alerts.addAlert(
        "info",
        "USD/ILS shifted >2%",
        `USD ${indicators.usd_ils_change_30d_pct > 0 ? "strengthens" : "weakens"} — affects Elkayam pricing strategy for US buyers`,
        { usd_ils: indicators.usd_ils }
      );
    }
  },
};

module.exports = MarketTrendAnalyzerModule;
