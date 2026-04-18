import { query } from '../../db/connection';
import { broadcastToAll } from '../../realtime/websocket';

// ════════════════════════════════════════════
// ENGINE 2: MATERIAL COST ENGINE
// מנוע עלויות חומרי גלם — Price Tracking + Hedging
// ════════════════════════════════════════════

export const materialCostEngine = {

  // ניתוח עלויות + המלצת רכישה
  async analyzeCosts() {
    const { rows } = await query(`
      WITH cost_trend AS (
        SELECT
          mi.id, mi.name, mi.category, mi.cost_per_unit, mi.qty,
          mi.min_threshold, mi.unit,
          s.name as supplier_name, s.lead_days,
          AVG(mm.cost_per_unit) FILTER (WHERE mm.created_at > NOW()-INTERVAL '30 days') as cost_30d,
          AVG(mm.cost_per_unit) FILTER (WHERE mm.created_at BETWEEN NOW()-INTERVAL '60 days' AND NOW()-INTERVAL '30 days') as cost_60d,
          AVG(mm.cost_per_unit) FILTER (WHERE mm.created_at BETWEEN NOW()-INTERVAL '90 days' AND NOW()-INTERVAL '60 days') as cost_90d,
          SUM(mm.qty) FILTER (WHERE mm.type='consume' AND mm.created_at > NOW()-INTERVAL '30 days') as monthly_consumption
        FROM material_items mi
        LEFT JOIN suppliers s ON mi.supplier_id = s.id
        LEFT JOIN material_movements mm ON mi.id = mm.item_id
        WHERE mi.is_active = true
        GROUP BY mi.id, mi.name, mi.category, mi.cost_per_unit, mi.qty,
          mi.min_threshold, mi.unit, s.name, s.lead_days
      )
      SELECT *,
        CASE WHEN cost_60d > 0 THEN ROUND((cost_30d - cost_60d)/cost_60d*100, 1) ELSE 0 END as price_change_pct,
        CASE WHEN monthly_consumption > 0 THEN ROUND(qty/monthly_consumption*30) ELSE 999 END as days_stock,
        ROUND(COALESCE(monthly_consumption,0) * 2 * cost_per_unit) as recommended_order_value
      FROM cost_trend
      ORDER BY price_change_pct DESC
    `);

    const analysis = rows.map((item: any) => ({
      ...item,
      trend: parseFloat(item.price_change_pct) > 5 ? 'rising' :
             parseFloat(item.price_change_pct) < -5 ? 'falling' : 'stable',
      action: this.recommendAction(item),
      risk_score: this.calculateRisk(item)
    }));

    // התראות על עליות מחיר חריגות
    const risers = analysis.filter(a => parseFloat(a.price_change_pct) > 10);
    if (risers.length > 0) {
      broadcastToAll('MATERIAL_PRICE_SPIKE', {
        items: risers.map(r => ({ name: r.name, change: r.price_change_pct }))
      });
    }

    return analysis;
  },

  recommendAction(item: any): string {
    const days = parseInt(item.days_stock || '999');
    const trend = parseFloat(item.price_change_pct || '0');
    const leadDays = parseInt(item.lead_days || '5');

    if (days < leadDays) return 'ORDER_NOW_URGENT';
    if (days < 14 && trend > 5) return 'ORDER_NOW_BEFORE_PRICE_RISE';
    if (trend > 10) return 'CONSIDER_BULK_ORDER';
    if (trend < -8) return 'WAIT_FOR_LOWER_PRICE';
    if (days > 90) return 'REDUCE_ORDER';
    return 'NORMAL';
  },

  calculateRisk(item: any): number {
    let risk = 0;
    const days = parseInt(item.days_stock || '999');
    const trend = parseFloat(item.price_change_pct || '0');

    if (days < 7) risk += 40;
    else if (days < 14) risk += 20;
    if (trend > 10) risk += 25;
    if (trend > 20) risk += 35;
    if (parseInt(item.lead_days || '0') > 10) risk += 15;

    return Math.min(100, risk);
  },

  // ניתוח ספק vs ספק
  async compareSuppliers(itemName: string) {
    const { rows } = await query(`
      SELECT s.name as supplier, s.lead_days, s.payment_terms,
        AVG(mm.cost_per_unit) as avg_price,
        COUNT(mm.id) as orders_count,
        MIN(mm.cost_per_unit) as best_price,
        MAX(mm.cost_per_unit) as worst_price
      FROM material_movements mm
      JOIN material_items mi ON mm.item_id = mi.id
      JOIN suppliers s ON mm.supplier_id = s.id
      WHERE mi.name ILIKE $1 AND mm.type = 'receive'
      GROUP BY s.id, s.name, s.lead_days, s.payment_terms
      ORDER BY avg_price ASC
    `, [`%${itemName}%`]);
    return rows;
  },

  // תחזית עלויות חומרי גלם Q הבא
  async forecastMaterialCosts() {
    const { rows } = await query(`
      WITH monthly_costs AS (
        SELECT
          DATE_TRUNC('month', mm.created_at) as month,
          SUM(mm.qty * mm.cost_per_unit) as total_cost,
          mi.category
        FROM material_movements mm
        JOIN material_items mi ON mm.item_id = mi.id
        WHERE mm.type = 'receive'
          AND mm.created_at > NOW()-INTERVAL '6 months'
        GROUP BY DATE_TRUNC('month', mm.created_at), mi.category
      )
      SELECT category,
        AVG(total_cost) as avg_monthly_cost,
        (AVG(total_cost) - LAG(AVG(total_cost)) OVER (PARTITION BY category ORDER BY MAX(month))) /
          NULLIF(LAG(AVG(total_cost)) OVER (PARTITION BY category ORDER BY MAX(month)), 0) * 100 as trend_pct
      FROM monthly_costs
      GROUP BY category
    `);

    return rows.map((r: any) => ({
      category: r.category,
      avg_monthly: Math.round(parseFloat(r.avg_monthly_cost || '0')),
      trend: parseFloat(r.trend_pct || '0').toFixed(1),
      q_forecast: Math.round(parseFloat(r.avg_monthly_cost || '0') * 3 *
        (1 + parseFloat(r.trend_pct || '0') / 100))
    }));
  }
};
