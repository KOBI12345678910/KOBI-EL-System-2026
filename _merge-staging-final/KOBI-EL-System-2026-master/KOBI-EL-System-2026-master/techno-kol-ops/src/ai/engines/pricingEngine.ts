import { query } from '../../db/connection';
import { broadcastToAll } from '../../realtime/websocket';

// ════════════════════════════════════════════
// ENGINE 1: PROJECT PRICING ENGINE
// מנוע תמחור פרוייקטים — Dynamic Pricing
// ════════════════════════════════════════════

export const projectPricingEngine = {

  // תמחור דינמי לפי 12 פרמטרים
  async calculateOptimalPrice(params: {
    category: string;
    material: string;
    quantity: number;
    unit: string;
    clientId?: string;
    urgency: 'normal' | 'urgent' | 'flexible';
    season?: string;
    competitorQuote?: number;
    floorArea?: number;
    complexity: 'simple' | 'medium' | 'complex';
    installationRequired: boolean;
    paintRequired: boolean;
  }) {
    const [historical, marketData, clientHistory, materialCosts, demandData] = await Promise.all([
      // מחירים היסטוריים
      query(`
        SELECT wo.price, wo.quantity, wo.price/NULLIF(wo.quantity,0) as ppu,
          wo.cost_actual, wo.open_date,
          (wo.price - COALESCE(wo.cost_actual,wo.cost_estimate,0))/NULLIF(wo.price,0) as margin
        FROM work_orders wo
        WHERE wo.category=$1 AND wo.material_primary=$2
          AND wo.status='delivered' AND wo.quantity>0
        ORDER BY wo.open_date DESC LIMIT 30
      `, [params.category, params.material]),

      // מחירי שוק (היסטוריית מחירים)
      query(`
        SELECT AVG(market_price) as avg_market, MAX(market_price) as max_market,
          MIN(market_price) as min_market
        FROM market_prices
        WHERE category=$1 AND material=$2
          AND recorded_at > NOW()-INTERVAL '90 days'
      `, [params.category, params.material]),

      // היסטוריית לקוח
      params.clientId ? query(`
        SELECT AVG(wo.price/NULLIF(wo.quantity,0)) as avg_ppu,
          COUNT(*) as order_count,
          SUM(wo.price) as lifetime_value,
          AVG(ft.amount/NULLIF(wo.price,0)) as payment_rate
        FROM work_orders wo
        LEFT JOIN financial_transactions ft ON wo.id=ft.order_id AND ft.type='income' AND ft.is_paid=true
        WHERE wo.client_id=$1 AND wo.status='delivered'
      `, [params.clientId]) : Promise.resolve({ rows: [{}] }),

      // עלויות חומרי גלם נוכחיות
      query(`
        SELECT AVG(mi.cost_per_unit) as avg_cost, MAX(mi.cost_per_unit) as max_cost
        FROM material_items mi
        WHERE mi.category=$1 AND mi.is_active=true
      `, [params.material]),

      // ביקוש נוכחי
      query(`
        SELECT COUNT(*) as active_orders,
          AVG(wo.price) as avg_active_price
        FROM work_orders wo
        WHERE wo.category=$1 AND wo.status IN ('pending','production')
          AND wo.open_date > NOW()-INTERVAL '30 days'
      `, [params.category])
    ]);

    const hist = historical.rows;
    const market = marketData.rows[0];
    const client = clientHistory.rows[0];
    const matCost = materialCosts.rows[0];
    const demand = demandData.rows[0];

    // BASE PRICE
    const avgPPU = hist.length > 0
      ? hist.reduce((s: number, h: any) => s + parseFloat(h.ppu||0), 0) / hist.length
      : this.getMarketBaseline(params.category, params.material);

    // MULTIPLIERS
    let multiplier = 1.0;

    // עונתיות
    const month = new Date().getMonth();
    if ([2,3,4].includes(month)) multiplier *= 1.08; // אביב — עונת שיא
    if ([6,7].includes(month)) multiplier *= 0.95;   // קיץ — ירידה

    // דחיפות
    if (params.urgency === 'urgent') multiplier *= 1.18;
    if (params.urgency === 'flexible') multiplier *= 0.95;

    // מורכבות
    if (params.complexity === 'complex') multiplier *= 1.22;
    if (params.complexity === 'simple') multiplier *= 0.92;

    // ביקוש גבוה
    const activeOrders = parseInt(demand.active_orders || '0');
    if (activeOrders > 8) multiplier *= 1.12;
    if (activeOrders < 3) multiplier *= 0.95;

    // לקוח חוזר
    const orderCount = parseInt(client?.order_count || '0');
    if (orderCount >= 5) multiplier *= 0.94;
    if (orderCount >= 10) multiplier *= 0.90;

    // מתחרה
    if (params.competitorQuote) {
      const competitorPPU = params.competitorQuote / params.quantity;
      if (competitorPPU < avgPPU) multiplier = Math.min(multiplier, 0.97);
    }

    // התקנה וצביעה
    let additions = 0;
    if (params.installationRequired) additions += params.quantity * 45;
    if (params.paintRequired) additions += params.quantity * 28;

    const baseCost = parseFloat(matCost?.avg_cost || '0') * params.quantity * 1.4;
    const suggestedPPU = avgPPU * multiplier;
    const suggestedTotal = Math.round((suggestedPPU * params.quantity + additions) / 100) * 100;

    const margin = baseCost > 0 ? (suggestedTotal - baseCost) / suggestedTotal : 0.32;

    return {
      suggested_price: suggestedTotal,
      min_acceptable: Math.round(suggestedTotal * 0.85 / 100) * 100,
      max_market: Math.round(suggestedTotal * 1.20 / 100) * 100,
      price_per_unit: Math.round(suggestedPPU),
      gross_margin_pct: Math.round(margin * 100),
      cost_breakdown: {
        materials: Math.round(baseCost * 0.6),
        labor: Math.round(baseCost * 0.25),
        overhead: Math.round(baseCost * 0.15),
        installation: params.installationRequired ? Math.round(params.quantity * 45) : 0,
        paint: params.paintRequired ? Math.round(params.quantity * 28) : 0
      },
      multipliers_applied: {
        seasonality: month,
        urgency: params.urgency,
        complexity: params.complexity,
        demand_level: activeOrders,
        client_loyalty: orderCount,
        total_multiplier: Math.round(multiplier * 100)
      },
      competitor_gap: params.competitorQuote
        ? Math.round(((suggestedTotal - params.competitorQuote) / params.competitorQuote) * 100)
        : null,
      confidence: Math.min(95, 50 + hist.length * 1.5),
      similar_deals: hist.slice(0, 5)
    };
  },

  getMarketBaseline(category: string, material: string): number {
    const baselines: Record<string, Record<string, number>> = {
      railings:  { iron: 320, aluminum: 420, stainless: 850, glass: 1200 },
      gates:     { iron: 2800, aluminum: 3400, stainless: 5500 },
      fences:    { iron: 280, aluminum: 340, stainless: 680 },
      pergolas:  { iron: 680, aluminum: 820 },
      stairs:    { iron: 4800, stainless: 9200 }
    };
    return baselines[category]?.[material] || 500;
  },

  // מעקב אחר שינויי מחיר
  async trackPriceChange(category: string, material: string, newPrice: number, source: string) {
    await query(`
      INSERT INTO market_prices (category, material, market_price, source, recorded_at)
      VALUES ($1,$2,$3,$4,NOW())
    `, [category, material, newPrice, source]);

    broadcastToAll('PRICE_UPDATE', { category, material, price: newPrice, source });
  }
};
