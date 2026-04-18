"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.riskEngine = void 0;
const connection_1 = require("../../db/connection");
const websocket_1 = require("../../realtime/websocket");
// ════════════════════════════════════════════
// ENGINE 8: RISK & HEDGING ENGINE
// מנוע גידורים וסיכונים
// ════════════════════════════════════════════
exports.riskEngine = {
    // ניתוח סיכונים מלא לחברה
    async analyzeCompanyRisks() {
        const [concentrationRisk, cashRisk, operationalRisk, marketRisk, creditRisk] = await Promise.all([
            this.clientConcentrationRisk(),
            this.cashFlowRisk(),
            this.operationalRisk(),
            this.materialMarketRisk(),
            this.creditRisk()
        ]);
        const totalRiskScore = Math.round(concentrationRisk.score * 0.25 +
            cashRisk.score * 0.25 +
            operationalRisk.score * 0.20 +
            marketRisk.score * 0.15 +
            creditRisk.score * 0.15);
        if (totalRiskScore > 70) {
            (0, websocket_1.broadcastToAll)('HIGH_RISK_ALERT', { score: totalRiskScore });
        }
        return {
            total_risk_score: totalRiskScore,
            risk_level: totalRiskScore > 70 ? 'HIGH' : totalRiskScore > 40 ? 'MEDIUM' : 'LOW',
            breakdown: {
                concentration: concentrationRisk,
                cash_flow: cashRisk,
                operational: operationalRisk,
                market: marketRisk,
                credit: creditRisk
            },
            hedging_recommendations: this.generateHedgingStrategies(concentrationRisk, cashRisk, operationalRisk)
        };
    },
    async clientConcentrationRisk() {
        const { rows } = await (0, connection_1.query)(`
      SELECT c.name,
        SUM(wo.price) as revenue,
        SUM(wo.price) / (SELECT SUM(price) FROM work_orders WHERE open_date > NOW()-INTERVAL '12 months') * 100 as pct
      FROM clients c
      JOIN work_orders wo ON c.id = wo.client_id
      WHERE wo.open_date > NOW()-INTERVAL '12 months'
      GROUP BY c.id, c.name
      ORDER BY revenue DESC LIMIT 5
    `);
        const topClientPct = parseFloat(rows[0]?.pct || '0');
        const top3Pct = rows.slice(0, 3).reduce((s, r) => s + parseFloat(r.pct || '0'), 0);
        return {
            score: topClientPct > 40 ? 80 : topClientPct > 25 ? 50 : 20,
            top_client_pct: Math.round(topClientPct),
            top3_clients_pct: Math.round(top3Pct),
            clients: rows,
            risk_label: topClientPct > 40 ? 'HIGH — תלות יתר בלקוח אחד' : 'ACCEPTABLE',
            recommendation: topClientPct > 35 ? 'גוון את בסיס הלקוחות — מקסימום 30% מלקוח בודד' : 'מאוזן'
        };
    },
    async cashFlowRisk() {
        const { rows } = await (0, connection_1.query)(`
      SELECT
        COALESCE(SUM(amount) FILTER (WHERE type IN ('income','advance') AND is_paid=true
          AND date >= CURRENT_DATE-30), 0) as inflow_30d,
        COALESCE(SUM(amount) FILTER (WHERE type IN ('expense','salary','material_cost')
          AND date >= CURRENT_DATE-30), 0) as outflow_30d,
        COALESCE(SUM(amount) FILTER (WHERE type IN ('income','advance') AND is_paid=false
          AND date < CURRENT_DATE), 0) as overdue_receivables
      FROM financial_transactions
    `);
        const r = rows[0];
        const inflow = parseFloat(r.inflow_30d);
        const outflow = parseFloat(r.outflow_30d);
        const overdue = parseFloat(r.overdue_receivables);
        const ratio = outflow > 0 ? inflow / outflow : 2;
        return {
            score: ratio < 0.8 ? 90 : ratio < 1.0 ? 70 : ratio < 1.2 ? 40 : 15,
            coverage_ratio: parseFloat(ratio.toFixed(2)),
            monthly_inflow: Math.round(inflow),
            monthly_outflow: Math.round(outflow),
            overdue_receivables: Math.round(overdue),
            risk_label: ratio < 1.0 ? 'CRITICAL — הוצאות עולות על הכנסות' : 'OK',
            recommendation: ratio < 1.2 ? 'הגדל יתרת מזומן — שמור 3 חודשי הוצאות' : 'תזרים בריא'
        };
    },
    async operationalRisk() {
        const { rows } = await (0, connection_1.query)(`
      SELECT
        COUNT(*) FILTER (WHERE status NOT IN ('delivered','cancelled')
          AND delivery_date < CURRENT_DATE) as overdue_orders,
        COUNT(*) FILTER (WHERE status IN ('pending','production')) as active_load,
        AVG(progress) FILTER (WHERE status='production') as avg_progress
      FROM work_orders
    `);
        const r = rows[0];
        const overdue = parseInt(r.overdue_orders || '0');
        const load = parseInt(r.active_load || '0');
        return {
            score: overdue > 5 ? 80 : overdue > 2 ? 50 : load > 15 ? 40 : 15,
            overdue_orders: overdue,
            active_load: load,
            avg_progress: Math.round(parseFloat(r.avg_progress || '0')),
            capacity_utilization: Math.min(100, Math.round(load / 12 * 100)),
            risk_label: overdue > 3 ? 'HIGH — הרבה הזמנות מאוחרות' : 'NORMAL'
        };
    },
    async materialMarketRisk() {
        const { rows } = await (0, connection_1.query)(`
      SELECT mi.category,
        AVG(mm.cost_per_unit) FILTER (WHERE mm.created_at > NOW()-INTERVAL '30 days') as recent_cost,
        AVG(mm.cost_per_unit) FILTER (WHERE mm.created_at BETWEEN NOW()-INTERVAL '90 days' AND NOW()-INTERVAL '30 days') as prev_cost
      FROM material_items mi
      JOIN material_movements mm ON mi.id = mm.item_id AND mm.type='receive'
      WHERE mi.is_active=true
      GROUP BY mi.category
    `);
        const maxIncrease = Math.max(...rows.map((r) => {
            const recent = parseFloat(r.recent_cost || '0');
            const prev = parseFloat(r.prev_cost || '0');
            return prev > 0 ? (recent - prev) / prev * 100 : 0;
        }));
        return {
            score: maxIncrease > 20 ? 75 : maxIncrease > 10 ? 45 : 15,
            max_price_increase_pct: Math.round(maxIncrease),
            categories: rows,
            risk_label: maxIncrease > 15 ? 'HIGH — עליית מחירי חומרים' : 'STABLE',
            recommendation: maxIncrease > 15 ? 'שקול הזמנה מראש + עדכן מחירונים ללקוחות' : 'יציב'
        };
    },
    async creditRisk() {
        const { rows } = await (0, connection_1.query)(`
      SELECT
        COALESCE(SUM(ft.amount) FILTER (WHERE ft.is_paid=false AND ft.date < CURRENT_DATE-30), 0) as overdue_30,
        COALESCE(SUM(ft.amount) FILTER (WHERE ft.is_paid=false AND ft.date < CURRENT_DATE-60), 0) as overdue_60,
        COALESCE(SUM(ft.amount) FILTER (WHERE ft.is_paid=false AND ft.date < CURRENT_DATE-90), 0) as overdue_90,
        COUNT(DISTINCT ft.client_id) FILTER (WHERE ft.is_paid=false AND ft.date < CURRENT_DATE-30) as delinquent_clients
      FROM financial_transactions ft
      WHERE ft.type IN ('income','advance')
    `);
        const r = rows[0];
        const overdue90 = parseFloat(r.overdue_90 || '0');
        const overdue30 = parseFloat(r.overdue_30 || '0');
        return {
            score: overdue90 > 50000 ? 80 : overdue30 > 30000 ? 50 : 15,
            overdue_30_days: Math.round(overdue30),
            overdue_60_days: Math.round(parseFloat(r.overdue_60 || '0')),
            overdue_90_days: Math.round(overdue90),
            delinquent_clients: parseInt(r.delinquent_clients || '0'),
            risk_label: overdue90 > 50000 ? 'HIGH — חובות פגומים' : 'ACCEPTABLE'
        };
    },
    generateHedgingStrategies(concentration, cash, operational) {
        const strategies = [];
        if (concentration.score > 60) {
            strategies.push('פיזור סיכון לקוחות: מקסם 30% הכנסה מלקוח בודד');
            strategies.push('פתח 3-5 לקוחות חדשים ב-Q הבא');
        }
        if (cash.score > 60) {
            strategies.push('בנה יתרת מזומן שווה ל-90 יום הוצאות');
            strategies.push('שנה תנאי תשלום: 40% מקדמה, 40% באמצע, 20% בסיום');
        }
        if (operational.score > 50) {
            strategies.push('הגבל קבלת עבודות חדשות עד סגירת הפיגור');
            strategies.push('גייס קבלן משנה זמני לאיזון עומס');
        }
        strategies.push('ביטוח אחריות מקצועית — מינימום ₪2M');
        strategies.push('חוזים עם סעיף מחיר צמוד למדד תשומות הבנייה');
        return strategies;
    }
};
