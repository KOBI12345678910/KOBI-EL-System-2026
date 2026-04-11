// ════════════════════════════════════════════
// ENGINE 7: MONTE CARLO SIMULATION
// מנוע מונטה קרלו — סימולציית סיכונים
// ════════════════════════════════════════════

export const monteCarloEngine = {

  // סימולציית הכנסות — 10,000 ריצות
  simulateRevenue(params: {
    base_monthly: number;
    std_dev_pct: number;
    months: number;
    growth_rate: number;
    churn_risk: number;
    new_client_rate: number;
    iterations?: number;
  }) {
    const iterations = params.iterations || 10000;
    const results: number[] = [];

    for (let i = 0; i < iterations; i++) {
      let totalRevenue = 0;
      let currentBase = params.base_monthly;

      for (let m = 0; m < params.months; m++) {
        // Random walk with drift
        const shock = this.normalRandom(0, params.std_dev_pct / 100);
        const growth = params.growth_rate / 12;
        const churnImpact = Math.random() < params.churn_risk / 100 ? -0.08 : 0;
        const newClientBoost = Math.random() < params.new_client_rate / 100 ? 0.06 : 0;

        currentBase *= (1 + growth + shock + churnImpact + newClientBoost);
        currentBase = Math.max(0, currentBase);
        totalRevenue += currentBase;
      }

      results.push(totalRevenue);
    }

    results.sort((a, b) => a - b);

    return {
      iterations,
      months: params.months,
      results: {
        p5:  Math.round(results[Math.floor(iterations * 0.05)]),
        p25: Math.round(results[Math.floor(iterations * 0.25)]),
        p50: Math.round(results[Math.floor(iterations * 0.50)]),
        p75: Math.round(results[Math.floor(iterations * 0.75)]),
        p95: Math.round(results[Math.floor(iterations * 0.95)]),
        mean: Math.round(results.reduce((a, b) => a + b, 0) / iterations),
        std_dev: Math.round(this.stdDev(results))
      },
      probability_above_target: (target: number) =>
        Math.round(results.filter(r => r >= target).length / iterations * 100),
      histogram: this.buildHistogram(results, 20),
      risk_assessment: this.assessRisk(results, params.base_monthly * params.months)
    };
  },

  // סימולציית פרוייקט בודד
  simulateProject(params: {
    quoted_price: number;
    estimated_cost: number;
    cost_uncertainty_pct: number;
    delay_probability: number;
    delay_cost_per_day: number;
    max_delay_days: number;
    iterations?: number;
  }) {
    const iterations = params.iterations || 5000;
    const profits: number[] = [];
    const costs: number[] = [];
    const delays: number[] = [];

    for (let i = 0; i < iterations; i++) {
      const costShock = this.normalRandom(0, params.cost_uncertainty_pct / 100);
      const actualCost = params.estimated_cost * (1 + costShock);

      const delayed = Math.random() < params.delay_probability;
      const delayDays = delayed
        ? Math.round(Math.random() * params.max_delay_days)
        : 0;
      const delayCost = delayDays * params.delay_cost_per_day;

      const totalCost = actualCost + delayCost;
      const profit = params.quoted_price - totalCost;

      profits.push(profit);
      costs.push(totalCost);
      delays.push(delayDays);
    }

    profits.sort((a, b) => a - b);

    return {
      profit_distribution: {
        p10: Math.round(profits[Math.floor(iterations * 0.10)]),
        p25: Math.round(profits[Math.floor(iterations * 0.25)]),
        median: Math.round(profits[Math.floor(iterations * 0.50)]),
        p75: Math.round(profits[Math.floor(iterations * 0.75)]),
        p90: Math.round(profits[Math.floor(iterations * 0.90)]),
        mean: Math.round(profits.reduce((a, b) => a + b, 0) / iterations)
      },
      probability_of_loss: Math.round(profits.filter(p => p < 0).length / iterations * 100),
      probability_of_target_margin: (targetMargin: number) => {
        const target = params.quoted_price * targetMargin;
        return Math.round(profits.filter(p => p >= target).length / iterations * 100);
      },
      expected_margin_pct: Math.round(
        (profits.reduce((a, b) => a + b, 0) / iterations) / params.quoted_price * 100
      ),
      delay_stats: {
        probability: Math.round(params.delay_probability * 100),
        avg_delay_days: Math.round(delays.reduce((a, b) => a + b, 0) / iterations),
        expected_delay_cost: Math.round(delays.reduce((a, b) => a + b, 0) / iterations * params.delay_cost_per_day)
      },
      recommendation: profits[Math.floor(iterations * 0.10)] > 0 ? 'PROCEED' : 'REVIEW_PRICING'
    };
  },

  normalRandom(mean: number, std: number): number {
    const u1 = Math.random();
    const u2 = Math.random();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return mean + std * z;
  },

  stdDev(arr: number[]): number {
    const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
    return Math.sqrt(arr.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / arr.length);
  },

  buildHistogram(data: number[], bins: number) {
    const min = data[0];
    const max = data[data.length - 1];
    const binSize = (max - min) / bins;
    const histogram = Array(bins).fill(0).map((_, i) => ({
      range_start: Math.round(min + i * binSize),
      range_end: Math.round(min + (i + 1) * binSize),
      count: 0
    }));

    data.forEach(v => {
      const bin = Math.min(bins - 1, Math.floor((v - min) / binSize));
      histogram[bin].count++;
    });

    return histogram;
  },

  assessRisk(results: number[], baseline: number): string {
    const median = results[Math.floor(results.length * 0.5)];
    const p10 = results[Math.floor(results.length * 0.1)];
    if (p10 < baseline * 0.5) return 'HIGH_RISK';
    if (median > baseline * 1.2) return 'UPSIDE';
    return 'MODERATE';
  }
};
