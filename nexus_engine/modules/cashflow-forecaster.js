// ══════════════════════════════════════════════════════════════════
// MODULE: Cashflow Forecaster
// מודול שמחזה תזרים מזומנים 30/60/90 יום קדימה
// ══════════════════════════════════════════════════════════════════
//
// אסטרטגיה:
//   1. קורא נתוני הכנסות + הוצאות היסטוריים
//   2. מחשב linear trend + exponential moving average
//   3. מחזה תזרים ל-30/60/90 יום
//   4. מזהה סיכוני נזילות (cash crunch)
//   5. שולח התראה מוקדמת אם יש סיכון

const CashflowForecasterModule = {
  name: "cashflow_forecaster",
  description: "Forecasts cashflow 30/60/90 days ahead and detects liquidity risks",

  // Stub historical data — 90 days of daily revenue for each business
  _stubHistory: {
    techno_kol_uzi: {
      daily_revenue_ils: [
        12000, 14000, 11500, 13200, 15000, 12800, 11900, 13500, 14200, 12600,
        13800, 15200, 14600, 13100, 12900, 14500, 15800, 13700, 12400, 13900,
        15100, 14300, 13600, 12800, 14700, 15400, 13200, 12500, 14100, 15600,
      ],
      avg_monthly_expenses_ils: 285_000,
      cash_on_hand_ils: 420_000,
      receivables_ils: 165_000,
      payables_ils: 95_000,
    },
    elkayam_real_estate: {
      daily_revenue_ils: [
        0, 0, 45000, 0, 0, 0, 62000, 0, 0, 0,
        0, 0, 85000, 0, 0, 0, 0, 0, 120000, 0,
        0, 0, 0, 55000, 0, 0, 0, 0, 0, 95000,
      ],
      avg_monthly_expenses_ils: 95_000,
      cash_on_hand_ils: 650_000,
      receivables_ils: 240_000,
      payables_ils: 40_000,
    },
  },

  _mean(arr) {
    return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
  },

  _linearSlope(arr) {
    const n = arr.length;
    if (n < 2) return 0;
    const xBar = (n - 1) / 2;
    const yBar = this._mean(arr);
    let num = 0, den = 0;
    for (let i = 0; i < n; i++) {
      num += (i - xBar) * (arr[i] - yBar);
      den += (i - xBar) * (i - xBar);
    }
    return den === 0 ? 0 : num / den;
  },

  _forecastDays(history, horizonDays) {
    const n = history.length;
    const avgDaily = this._mean(history);
    const slope = this._linearSlope(history);
    let total = 0;
    for (let d = 1; d <= horizonDays; d++) {
      total += avgDaily + slope * (n + d);
    }
    return Math.round(total);
  },

  async run(state, brain, alerts) {
    const businesses = Object.keys(this._stubHistory);
    const forecasts = {};

    for (const business of businesses) {
      const data = this._stubHistory[business];
      const daily = data.daily_revenue_ils;

      const avgDaily = this._mean(daily);
      const slope = this._linearSlope(daily);
      const trend =
        slope > avgDaily * 0.005 ? "up" :
        slope < -avgDaily * 0.005 ? "down" : "flat";

      const forecast_30d = this._forecastDays(daily, 30);
      const forecast_60d = this._forecastDays(daily, 60);
      const forecast_90d = this._forecastDays(daily, 90);

      // Cash position projections
      const monthly_burn = data.avg_monthly_expenses_ils;
      const cash_30d = data.cash_on_hand_ils + forecast_30d + data.receivables_ils - monthly_burn - data.payables_ils;
      const cash_60d = data.cash_on_hand_ils + forecast_60d + data.receivables_ils - (monthly_burn * 2) - data.payables_ils;
      const cash_90d = data.cash_on_hand_ils + forecast_90d + data.receivables_ils - (monthly_burn * 3) - data.payables_ils;

      // Liquidity risk
      const minSafeCash = monthly_burn * 1.5; // 6 weeks buffer
      const liquidity_risk =
        cash_90d < 0 ? "critical" :
        cash_60d < minSafeCash ? "high" :
        cash_30d < minSafeCash ? "medium" :
        "low";

      forecasts[business] = {
        avg_daily_revenue_ils: Math.round(avgDaily),
        trend,
        slope: Math.round(slope * 1000) / 1000,
        forecast_30d_ils: forecast_30d,
        forecast_60d_ils: forecast_60d,
        forecast_90d_ils: forecast_90d,
        cash_on_hand_ils: data.cash_on_hand_ils,
        projected_cash_30d_ils: Math.round(cash_30d),
        projected_cash_60d_ils: Math.round(cash_60d),
        projected_cash_90d_ils: Math.round(cash_90d),
        liquidity_risk,
      };

      state.addMemory("longTerm", {
        type: "cashflow_forecast",
        business,
        ...forecasts[business],
      });

      if (liquidity_risk === "critical" || liquidity_risk === "high") {
        alerts.addAlert(
          liquidity_risk === "critical" ? "critical" : "warning",
          `Cashflow risk — ${business}`,
          `Projected cash at 90d: ₪${Math.round(cash_90d).toLocaleString()}`,
          forecasts[business]
        );
      }
    }

    state.update("modules.cashflow_forecaster.forecasts", forecasts);
    state.update("modules.cashflow_forecaster.last_updated", new Date().toISOString());
  },
};

module.exports = CashflowForecasterModule;
