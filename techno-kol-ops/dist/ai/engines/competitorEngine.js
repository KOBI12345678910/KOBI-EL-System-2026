"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.competitorEngine = void 0;
const connection_1 = require("../../db/connection");
// ════════════════════════════════════════════
// ENGINE 5+6: COMPETITOR ENGINE
// מנוע מתחרים + היסטוריית מחירים
// ════════════════════════════════════════════
exports.competitorEngine = {
    // רישום מחיר מתחרה
    async recordCompetitorPrice(data) {
        const { rows } = await (0, connection_1.query)(`
      INSERT INTO competitor_prices
        (competitor_name, category, material, price_per_unit, total_price, source, client_id, notes, recorded_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
      RETURNING *
    `, [data.competitor_name, data.category, data.material,
            data.price_per_unit, data.total_price, data.source,
            data.client_id, data.notes]);
        return rows[0];
    },
    // ניתוח תחרות מלא
    async analyzeCompetition(category, material) {
        const [ourPrices, competitorPrices, winLossData] = await Promise.all([
            // המחירים שלנו
            (0, connection_1.query)(`
        SELECT
          AVG(wo.price/NULLIF(wo.quantity,0)) as our_avg_ppu,
          MIN(wo.price/NULLIF(wo.quantity,0)) as our_min_ppu,
          MAX(wo.price/NULLIF(wo.quantity,0)) as our_max_ppu,
          COUNT(*) as our_deals,
          AVG(wo.price/NULLIF(wo.quantity,0)) FILTER (WHERE wo.open_date > NOW()-INTERVAL '30 days') as our_recent_ppu
        FROM work_orders wo
        WHERE wo.category=$1 AND wo.material_primary=$2
          AND wo.status='delivered' AND wo.quantity>0
          AND wo.open_date > NOW()-INTERVAL '180 days'
      `, [category, material]),
            // מחירי מתחרים
            (0, connection_1.query)(`
        SELECT competitor_name,
          AVG(price_per_unit) as avg_ppu,
          MIN(price_per_unit) as min_ppu,
          MAX(price_per_unit) as max_ppu,
          COUNT(*) as data_points,
          MAX(recorded_at) as last_seen,
          AVG(price_per_unit) FILTER (WHERE recorded_at > NOW()-INTERVAL '30 days') as recent_ppu
        FROM competitor_prices
        WHERE category=$1 AND material=$2
        GROUP BY competitor_name
        ORDER BY avg_ppu ASC
      `, [category, material]),
            // ניצחונות/הפסדים מול מתחרים
            (0, connection_1.query)(`
        SELECT
          COUNT(*) FILTER (WHERE l.status='won') as won,
          COUNT(*) FILTER (WHERE l.status='lost') as lost,
          COUNT(*) FILTER (WHERE l.status='lost' AND l.notes ILIKE '%מחיר%') as lost_on_price,
          AVG(l.estimated_value) FILTER (WHERE l.status='won') as avg_won_value
        FROM leads l
        WHERE l.created_at > NOW()-INTERVAL '90 days'
      `)
        ]);
        const ours = ourPrices.rows[0];
        const competitors = competitorPrices.rows;
        const wl = winLossData.rows[0];
        const ourAvg = parseFloat(ours?.our_avg_ppu || '0');
        const cheapest = competitors[0];
        const priceGap = cheapest
            ? Math.round((ourAvg - parseFloat(cheapest.avg_ppu)) / parseFloat(cheapest.avg_ppu) * 100)
            : 0;
        return {
            our_pricing: {
                avg_per_unit: Math.round(ourAvg),
                min: Math.round(parseFloat(ours?.our_min_ppu || '0')),
                max: Math.round(parseFloat(ours?.our_max_ppu || '0')),
                recent: Math.round(parseFloat(ours?.our_recent_ppu || '0')),
                total_deals: parseInt(ours?.our_deals || '0')
            },
            competitors: competitors.map((c) => ({
                name: c.competitor_name,
                avg_ppu: Math.round(parseFloat(c.avg_ppu)),
                min_ppu: Math.round(parseFloat(c.min_ppu)),
                max_ppu: Math.round(parseFloat(c.max_ppu)),
                data_points: parseInt(c.data_points),
                last_seen: c.last_seen,
                vs_us: Math.round((ourAvg - parseFloat(c.avg_ppu)) / parseFloat(c.avg_ppu) * 100)
            })),
            market_position: priceGap > 10 ? 'premium' : priceGap > 0 ? 'above_market' : 'competitive',
            price_gap_pct: priceGap,
            win_rate: wl.won > 0 ? Math.round(parseInt(wl.won) / (parseInt(wl.won) + parseInt(wl.lost)) * 100) : 0,
            lost_on_price: parseInt(wl.lost_on_price || '0'),
            recommendations: this.generateRecommendations(priceGap, wl)
        };
    },
    generateRecommendations(priceGap, wl) {
        const recs = [];
        if (priceGap > 15)
            recs.push('המחיר שלנו גבוה ב-15%+ מהשוק — שקול הורדה בפרוייקטים תחרותיים');
        if (parseInt(wl.lost_on_price || '0') > 3)
            recs.push(`${wl.lost_on_price} הפסדות בגלל מחיר — בנה חבילות ערך`);
        if (priceGap < 0)
            recs.push('אנחנו זולים מהשוק — יש מקום להעלות מחיר');
        if (parseInt(wl.won || '0') / Math.max(1, parseInt(wl.won) + parseInt(wl.lost)) > 0.7) {
            recs.push('אחוז המרה גבוה — המחיר אטרקטיבי, שקול העלאה');
        }
        return recs;
    },
    // היסטוריית מחירים — שלנו ושל השוק
    async getPriceHistory(category, material, months = 12) {
        const [ourHistory, competitorHistory] = await Promise.all([
            (0, connection_1.query)(`
        SELECT DATE_TRUNC('month', wo.open_date) as month,
          AVG(wo.price/NULLIF(wo.quantity,0)) as avg_ppu,
          COUNT(*) as deals
        FROM work_orders wo
        WHERE wo.category=$1 AND wo.material_primary=$2
          AND wo.quantity>0
          AND wo.open_date > NOW()-($3 || ' months')::INTERVAL
        GROUP BY DATE_TRUNC('month', wo.open_date)
        ORDER BY month ASC
      `, [category, material, months]),
            (0, connection_1.query)(`
        SELECT DATE_TRUNC('month', recorded_at) as month,
          AVG(price_per_unit) as market_avg,
          competitor_name
        FROM competitor_prices
        WHERE category=$1 AND material=$2
          AND recorded_at > NOW()-($3 || ' months')::INTERVAL
        GROUP BY DATE_TRUNC('month', recorded_at), competitor_name
        ORDER BY month ASC
      `, [category, material, months])
        ]);
        return {
            our_history: ourHistory.rows,
            market_history: competitorHistory.rows
        };
    }
};
