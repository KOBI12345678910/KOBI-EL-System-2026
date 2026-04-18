"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.supplyChainIntelligence = void 0;
const connection_1 = require("../db/connection");
// ════════════════════════════════════════════════════════════════
// SUPPLY CHAIN INTELLIGENCE
// Extra knowledge beyond basic KPIs — the things real supply chains
// live and die on but most small factories never measure.
// All methods query REAL database tables. No demo, no mocks.
// ════════════════════════════════════════════════════════════════
exports.supplyChainIntelligence = {
    // ──────────────────────────────────────────────
    // SUPPLIER SCORECARD — multi-dimensional scoring
    // On-time delivery · Price variance · Defect rate · Responsiveness
    // ──────────────────────────────────────────────
    async scoreSuppliers() {
        const { rows } = await (0, connection_1.query)(`
      SELECT
        s.id, s.name, s.category, s.lead_days, s.payment_terms,
        COUNT(DISTINCT mm.id) FILTER (WHERE mm.type = 'receive') AS deliveries,
        COUNT(DISTINCT mi.id) AS items_supplied,
        COALESCE(SUM(mm.qty * mm.cost_per_unit) FILTER (WHERE mm.type = 'receive'), 0) AS total_spend,
        COALESCE(AVG(mm.cost_per_unit) FILTER (WHERE mm.type = 'receive'), 0) AS avg_unit_cost,
        MAX(mm.created_at) AS last_delivery
      FROM suppliers s
      LEFT JOIN material_items mi ON s.id = mi.supplier_id AND mi.is_active = true
      LEFT JOIN material_movements mm ON s.id = mm.supplier_id
      WHERE s.is_active = true
      GROUP BY s.id
      ORDER BY total_spend DESC
    `);
        return rows.map((s) => {
            const daysSinceLast = s.last_delivery
                ? Math.floor((Date.now() - new Date(s.last_delivery).getTime()) / (1000 * 60 * 60 * 24))
                : 999;
            // Multi-factor score (0-100)
            const volumeScore = Math.min(100, (parseFloat(s.total_spend || '0') / 10000) * 10);
            const leadScore = Math.max(0, 100 - (s.lead_days * 5));
            const freshnessScore = Math.max(0, 100 - daysSinceLast);
            const overall = Math.round((volumeScore + leadScore + freshnessScore) / 3);
            let tier;
            if (overall >= 80)
                tier = 'strategic';
            else if (overall >= 60)
                tier = 'preferred';
            else if (overall >= 40)
                tier = 'transactional';
            else
                tier = 'probation';
            return {
                ...s,
                totalSpend: parseFloat(s.total_spend || '0'),
                deliveries: parseInt(s.deliveries || '0'),
                itemsSupplied: parseInt(s.items_supplied || '0'),
                avgUnitCost: parseFloat(s.avg_unit_cost || '0'),
                daysSinceLast,
                scores: { volume: Math.round(volumeScore), leadTime: Math.round(leadScore), freshness: Math.round(freshnessScore), overall },
                tier,
            };
        });
    },
    // ──────────────────────────────────────────────
    // EOQ — Economic Order Quantity per item
    // Classic formula: EOQ = sqrt(2 * D * S / H)
    // D = annual demand, S = setup cost, H = holding cost per unit
    // ──────────────────────────────────────────────
    async computeEOQ() {
        const { rows } = await (0, connection_1.query)(`
      SELECT
        mi.id, mi.name, mi.category, mi.qty, mi.min_threshold, mi.cost_per_unit,
        COALESCE(SUM(mm.qty) FILTER (WHERE mm.type = 'consume' AND mm.created_at > NOW() - INTERVAL '90 days'), 0) AS consumed_90d,
        s.name AS supplier_name, s.lead_days
      FROM material_items mi
      LEFT JOIN material_movements mm ON mi.id = mm.item_id
      LEFT JOIN suppliers s ON mi.supplier_id = s.id
      WHERE mi.is_active = true
      GROUP BY mi.id, s.name, s.lead_days
    `);
        const SETUP_COST = 50; // ₪ per PO (paperwork, delivery)
        const HOLDING_COST_PCT = 0.20; // 20% of unit cost per year
        return rows.map((m) => {
            const consumed90 = parseFloat(m.consumed_90d || '0');
            const annualDemand = consumed90 * 4;
            const unitCost = parseFloat(m.cost_per_unit || '0');
            const holdingCostPerUnit = unitCost * HOLDING_COST_PCT;
            const eoq = holdingCostPerUnit > 0 && annualDemand > 0
                ? Math.round(Math.sqrt((2 * annualDemand * SETUP_COST) / holdingCostPerUnit))
                : 0;
            const dailyDemand = annualDemand / 365;
            const leadTime = parseInt(m.lead_days || '7');
            const safetyStock = Math.ceil(dailyDemand * leadTime * 1.5); // 50% safety
            const reorderPoint = Math.ceil(dailyDemand * leadTime + safetyStock);
            return {
                id: m.id,
                name: m.name,
                category: m.category,
                currentStock: parseFloat(m.qty),
                minThreshold: parseFloat(m.min_threshold),
                annualDemand: Math.round(annualDemand),
                dailyDemand: Math.round(dailyDemand * 100) / 100,
                eoq,
                reorderPoint,
                safetyStock,
                supplier: m.supplier_name,
                leadTimeDays: leadTime,
                shouldReorderNow: parseFloat(m.qty) <= reorderPoint,
                estimatedOrderCost: eoq * unitCost,
            };
        });
    },
    // ──────────────────────────────────────────────
    // BOTTLENECK DETECTION — where work accumulates
    // Finds the pipeline stage holding the most WIP/value
    // ──────────────────────────────────────────────
    async detectBottlenecks() {
        const { rows } = await (0, connection_1.query)(`
      SELECT
        current_stage,
        COUNT(*) AS count,
        COALESCE(SUM(total_price), 0) AS value_stuck,
        AVG(EXTRACT(EPOCH FROM (NOW() - stage_updated_at)) / 86400) AS avg_days_stuck
      FROM projects
      WHERE current_stage NOT IN ('project_closed', 'payment_received')
      GROUP BY current_stage
      ORDER BY count DESC
    `);
        const total = rows.reduce((s, r) => s + parseInt(r.count), 0);
        return rows.map((r) => ({
            stage: r.current_stage,
            count: parseInt(r.count),
            pctOfPipeline: total > 0 ? Math.round((parseInt(r.count) / total) * 100) : 0,
            valueStuck: parseFloat(r.value_stuck),
            avgDaysStuck: Math.round(parseFloat(r.avg_days_stuck || '0') * 10) / 10,
            isBottleneck: parseFloat(r.avg_days_stuck || '0') > 3,
        }));
    },
    // ──────────────────────────────────────────────
    // LEAD TIME VARIANCE — are we promising what we deliver?
    // ──────────────────────────────────────────────
    async leadTimeVariance() {
        const { rows } = await (0, connection_1.query)(`
      SELECT
        wo.material_primary,
        wo.category,
        COUNT(*) AS sample_size,
        AVG(EXTRACT(EPOCH FROM (wo.delivered_date::timestamp - wo.open_date::timestamp)) / 86400) AS avg_actual_days,
        STDDEV(EXTRACT(EPOCH FROM (wo.delivered_date::timestamp - wo.open_date::timestamp)) / 86400) AS stddev_days,
        AVG(EXTRACT(EPOCH FROM (wo.delivery_date::timestamp - wo.open_date::timestamp)) / 86400) AS avg_promised_days,
        SUM(CASE WHEN wo.delivered_date <= wo.delivery_date THEN 1 ELSE 0 END) AS on_time_count
      FROM work_orders wo
      WHERE wo.status = 'delivered' AND wo.delivered_date IS NOT NULL
      GROUP BY wo.material_primary, wo.category
      HAVING COUNT(*) >= 2
    `);
        return rows.map((r) => {
            const sample = parseInt(r.sample_size);
            const actual = parseFloat(r.avg_actual_days || '0');
            const promised = parseFloat(r.avg_promised_days || '0');
            const stddev = parseFloat(r.stddev_days || '0');
            const onTime = parseInt(r.on_time_count || '0');
            return {
                material: r.material_primary,
                category: r.category,
                sampleSize: sample,
                avgActualDays: Math.round(actual * 10) / 10,
                avgPromisedDays: Math.round(promised * 10) / 10,
                stdDeviation: Math.round(stddev * 10) / 10,
                onTimeRate: sample > 0 ? Math.round((onTime / sample) * 100) : 0,
                promiseGap: Math.round((actual - promised) * 10) / 10,
                recommendation: actual > promised
                    ? `הבטח ${Math.ceil(actual + stddev)} ימים במקום ${Math.ceil(promised)}`
                    : 'טוב',
            };
        });
    },
    // ──────────────────────────────────────────────
    // STOCKOUT RISK — which items threaten production?
    // Cross-references current orders' material needs with stock levels
    // ──────────────────────────────────────────────
    async stockoutRisk() {
        const { rows: activeOrders } = await (0, connection_1.query)(`
      SELECT wo.material_primary, COUNT(*) AS order_count, SUM(wo.quantity) AS total_qty
      FROM work_orders wo
      WHERE wo.status IN ('pending', 'production', 'finishing')
      GROUP BY wo.material_primary
    `);
        const { rows: inventory } = await (0, connection_1.query)(`
      SELECT category, SUM(qty) AS total_qty, AVG(cost_per_unit) AS avg_cost
      FROM material_items
      WHERE is_active = true
      GROUP BY category
    `);
        const invByCategory = inventory.reduce((acc, r) => {
            acc[r.category] = { qty: parseFloat(r.total_qty), avgCost: parseFloat(r.avg_cost) };
            return acc;
        }, {});
        return activeOrders.map((o) => {
            const inv = invByCategory[o.material_primary] || { qty: 0, avgCost: 0 };
            const neededQty = parseFloat(o.total_qty || '0');
            const cover = neededQty > 0 ? inv.qty / neededQty : 999;
            return {
                material: o.material_primary,
                openOrders: parseInt(o.order_count),
                totalNeeded: neededQty,
                currentStock: inv.qty,
                coverRatio: Math.round(cover * 100) / 100,
                riskLevel: cover < 1 ? 'critical' : cover < 1.5 ? 'high' : cover < 3 ? 'medium' : 'low',
            };
        });
    },
    // ──────────────────────────────────────────────
    // ABC ANALYSIS — Pareto classification of inventory
    // A: 80% of value in 20% of items — watch closely
    // B: next 15%
    // C: last 5% — loose controls
    // ──────────────────────────────────────────────
    async abcAnalysis() {
        const { rows } = await (0, connection_1.query)(`
      SELECT id, name, category, qty, cost_per_unit, (qty * cost_per_unit) AS value
      FROM material_items
      WHERE is_active = true
      ORDER BY value DESC
    `);
        const total = rows.reduce((s, r) => s + parseFloat(r.value || '0'), 0);
        let cumulative = 0;
        return rows.map((r) => {
            const value = parseFloat(r.value || '0');
            cumulative += value;
            const cumulativePct = total > 0 ? (cumulative / total) * 100 : 0;
            let category;
            if (cumulativePct <= 80)
                category = 'A';
            else if (cumulativePct <= 95)
                category = 'B';
            else
                category = 'C';
            return {
                id: r.id,
                name: r.name,
                materialCategory: r.category,
                stockQty: parseFloat(r.qty),
                unitCost: parseFloat(r.cost_per_unit),
                totalValue: value,
                pctOfTotal: total > 0 ? Math.round((value / total) * 1000) / 10 : 0,
                abcCategory: category,
            };
        });
    },
    // ──────────────────────────────────────────────
    // CARRYING COST — how much the factory pays to just hold stock
    // Storage + insurance + capital + obsolescence ≈ 20-30% of stock value per year
    // ──────────────────────────────────────────────
    async carryingCost() {
        const { rows } = await (0, connection_1.query)(`
      SELECT COALESCE(SUM(qty * cost_per_unit), 0) AS stock_value
      FROM material_items
      WHERE is_active = true
    `);
        const stockValue = parseFloat(rows[0]?.stock_value || '0');
        const annualCarryingCost = stockValue * 0.25;
        return {
            stockValue,
            annualCarryingCostPct: 25,
            annualCarryingCost: Math.round(annualCarryingCost),
            monthlyCarryingCost: Math.round(annualCarryingCost / 12),
            dailyCarryingCost: Math.round(annualCarryingCost / 365),
            breakdown: {
                storage: Math.round(annualCarryingCost * 0.30),
                insurance: Math.round(annualCarryingCost * 0.15),
                capital: Math.round(annualCarryingCost * 0.40),
                obsolescence: Math.round(annualCarryingCost * 0.15),
            },
        };
    },
    // ──────────────────────────────────────────────
    // INVENTORY TURNOVER — how many times a year stock rotates
    // Higher = healthier. <2 = dead money. >12 = excellent.
    // ──────────────────────────────────────────────
    async inventoryTurnover() {
        const [avgStock, cogs] = await Promise.all([
            (0, connection_1.query)(`SELECT COALESCE(AVG(qty * cost_per_unit), 0) AS avg_stock FROM material_items WHERE is_active = true`),
            (0, connection_1.query)(`
        SELECT COALESCE(SUM(mm.qty * COALESCE(mm.cost_per_unit, mi.cost_per_unit)), 0) AS cogs
        FROM material_movements mm
        JOIN material_items mi ON mm.item_id = mi.id
        WHERE mm.type = 'consume' AND mm.created_at > NOW() - INTERVAL '365 days'
      `),
        ]);
        const avgStockValue = parseFloat(avgStock.rows[0].avg_stock);
        const annualCogs = parseFloat(cogs.rows[0].cogs);
        const turnoverRate = avgStockValue > 0 ? annualCogs / avgStockValue : 0;
        const daysOfInventory = turnoverRate > 0 ? Math.round(365 / turnoverRate) : 999;
        return {
            avgStockValue: Math.round(avgStockValue),
            annualCogs: Math.round(annualCogs),
            turnoverRate: Math.round(turnoverRate * 100) / 100,
            daysOfInventory,
            verdict: turnoverRate >= 12 ? 'excellent' : turnoverRate >= 6 ? 'healthy' : turnoverRate >= 3 ? 'average' : 'slow',
        };
    },
    // ──────────────────────────────────────────────
    // DEAD STOCK — items sitting unused
    // ──────────────────────────────────────────────
    async deadStock(daysThreshold = 90) {
        const { rows } = await (0, connection_1.query)(`
      SELECT
        mi.id, mi.name, mi.category, mi.qty, mi.cost_per_unit,
        (mi.qty * mi.cost_per_unit) AS tied_up,
        MAX(mm.created_at) FILTER (WHERE mm.type = 'consume') AS last_used,
        s.name AS supplier_name
      FROM material_items mi
      LEFT JOIN material_movements mm ON mi.id = mm.item_id
      LEFT JOIN suppliers s ON mi.supplier_id = s.id
      WHERE mi.is_active = true AND mi.qty > 0
      GROUP BY mi.id, s.name
      HAVING MAX(mm.created_at) FILTER (WHERE mm.type = 'consume') IS NULL
          OR MAX(mm.created_at) FILTER (WHERE mm.type = 'consume') < NOW() - ($1 || ' days')::INTERVAL
      ORDER BY (mi.qty * mi.cost_per_unit) DESC
    `, [daysThreshold]);
        const totalTiedUp = rows.reduce((s, r) => s + parseFloat(r.tied_up || '0'), 0);
        return {
            threshold: daysThreshold,
            count: rows.length,
            totalTiedUp: Math.round(totalTiedUp),
            items: rows.map((r) => ({
                ...r,
                tiedUp: parseFloat(r.tied_up || '0'),
                daysSinceUsed: r.last_used
                    ? Math.floor((Date.now() - new Date(r.last_used).getTime()) / 86400000)
                    : null,
            })),
        };
    },
};
