import { query } from '../../db/connection';

// ════════════════════════════════════════════
// ENGINE 9: GROWTH ENGINE
// מנוע צמיחת החברה
// ════════════════════════════════════════════

export const growthEngine = {

  async analyzeGrowthOpportunities() {
    const [revenuetrend, productMix, geoAnalysis, marketSize] = await Promise.all([
      this.revenueTrend(),
      this.productMixAnalysis(),
      this.geographicAnalysis(),
      this.estimateMarketSize()
    ]);

    return {
      revenue_trend: revenuetrend,
      product_mix: productMix,
      geographic: geoAnalysis,
      market_size: marketSize,
      growth_levers: this.identifyGrowthLevers(revenuetrend, productMix),
      expansion_roadmap: this.buildRoadmap(revenuetrend)
    };
  },

  async revenueTrend() {
    const { rows } = await query(`
      SELECT
        DATE_TRUNC('month', date) as month,
        SUM(amount) FILTER (WHERE type IN ('income','advance') AND is_paid=true) as revenue,
        COUNT(DISTINCT client_id) as active_clients
      FROM financial_transactions
      WHERE date > NOW()-INTERVAL '24 months'
      GROUP BY DATE_TRUNC('month', date)
      ORDER BY month ASC
    `);

    const revenues = rows.map((r: any) => parseFloat(r.revenue || '0'));
    const cagr = revenues.length >= 12
      ? Math.pow(revenues[revenues.length - 1] / Math.max(1, revenues[0]), 12 / revenues.length) - 1
      : 0;

    const mom = revenues.length >= 2
      ? (revenues[revenues.length - 1] - revenues[revenues.length - 2]) / Math.max(1, revenues[revenues.length - 2])
      : 0;

    return {
      monthly_data: rows,
      cagr_pct: Math.round(cagr * 100),
      mom_growth: Math.round(mom * 100),
      peak_month: rows.reduce((max: any, r: any) =>
        parseFloat(r.revenue || '0') > parseFloat(max.revenue || '0') ? r : max, rows[0] || {}),
      trajectory: cagr > 0.15 ? 'STRONG_GROWTH' : cagr > 0.05 ? 'MODERATE' : cagr > 0 ? 'SLOW' : 'DECLINING'
    };
  },

  async productMixAnalysis() {
    const { rows } = await query(`
      SELECT
        wo.category,
        wo.material_primary,
        COUNT(*) as count,
        SUM(wo.price) as revenue,
        AVG(wo.price) as avg_price,
        AVG((wo.price - COALESCE(wo.cost_actual, wo.cost_estimate, 0))/NULLIF(wo.price,0)) as margin,
        SUM(wo.price) / (SELECT SUM(price) FROM work_orders WHERE open_date > NOW()-INTERVAL '12 months') * 100 as revenue_share
      FROM work_orders wo
      WHERE wo.open_date > NOW()-INTERVAL '12 months'
        AND wo.status NOT IN ('cancelled')
      GROUP BY wo.category, wo.material_primary
      ORDER BY revenue DESC
    `);

    return rows.map((r: any) => ({
      ...r,
      revenue: Math.round(parseFloat(r.revenue || '0')),
      avg_price: Math.round(parseFloat(r.avg_price || '0')),
      margin_pct: Math.round(parseFloat(r.margin || '0') * 100),
      revenue_share: Math.round(parseFloat(r.revenue_share || '0')),
      growth_potential: parseFloat(r.margin || '0') > 0.35 ? 'HIGH' :
                        parseFloat(r.margin || '0') > 0.25 ? 'MEDIUM' : 'LOW'
    }));
  },

  async geographicAnalysis() {
    const { rows } = await query(`
      SELECT
        SPLIT_PART(p.address, ',', -1) as city,
        COUNT(p.id) as projects,
        SUM(p.total_price) as revenue,
        AVG(p.total_price) as avg_project
      FROM projects p
      GROUP BY SPLIT_PART(p.address, ',', -1)
      ORDER BY revenue DESC LIMIT 10
    `);
    return rows;
  },

  async estimateMarketSize() {
    const { rows: ourRevenue } = await query(`
      SELECT SUM(amount) as total
      FROM financial_transactions
      WHERE type IN ('income','advance') AND is_paid=true
        AND date > NOW()-INTERVAL '12 months'
    `);

    const our = parseFloat(ourRevenue[0]?.total || '0');
    const estimatedMarketShare = 0.03; // אומדן 3% נתח שוק
    const estimatedMarket = our / estimatedMarketShare;

    return {
      our_revenue_12m: Math.round(our),
      estimated_market_size: Math.round(estimatedMarket),
      estimated_market_share_pct: Math.round(estimatedMarketShare * 100),
      headroom: Math.round(estimatedMarket * 0.10), // 10% יעד
      target_market_share_5y: '8-12%'
    };
  },

  identifyGrowthLevers(trend: any, products: any[]): any[] {
    const levers = [];

    const highMarginProducts = products.filter((p: any) => p.margin_pct > 35);
    if (highMarginProducts.length > 0) {
      levers.push({
        lever: 'PRODUCT_MIX',
        action: `הגדל נתח של ${highMarginProducts[0].category} — מרג'ין ${highMarginProducts[0].margin_pct}%`,
        impact: 'HIGH',
        effort: 'LOW'
      });
    }

    levers.push({
      lever: 'RECURRING_REVENUE',
      action: 'הצע חוזי תחזוקה שנתיים ללקוחות קיימים — ₪2,000-5,000/שנה',
      impact: 'MEDIUM',
      effort: 'LOW'
    });

    levers.push({
      lever: 'UPSELL',
      action: 'הוסף שירותי עיצוב + 3D visualization — תוספת 8-15% למחיר',
      impact: 'MEDIUM',
      effort: 'MEDIUM'
    });

    levers.push({
      lever: 'GEOGRAPHIC_EXPANSION',
      action: 'פתח שוק ירושלים / ראשל"צ — מתחרות נמוכה יחסית',
      impact: 'HIGH',
      effort: 'HIGH'
    });

    return levers;
  },

  buildRoadmap(trend: any) {
    return {
      q1: 'הגדל מחלקת מכירות — 1 סוכן נוסף',
      q2: 'פתח שירות תחזוקה שנתי — 20 לקוחות ראשונים',
      q3: 'כלי 3D + CRM מלא + אתר לידים',
      q4: 'סניף שני / שותפות קבלן גדול',
      year_1_target: Math.round(parseFloat(trend.monthly_data?.[trend.monthly_data?.length - 1]?.revenue || '0') * 12 * 1.30),
      year_3_target: Math.round(parseFloat(trend.monthly_data?.[trend.monthly_data?.length - 1]?.revenue || '0') * 12 * 2.50)
    };
  }
};
