"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startAlertEngine = startAlertEngine;
const node_cron_1 = __importDefault(require("node-cron"));
const connection_1 = require("../db/connection");
const websocket_1 = require("./websocket");
function startAlertEngine() {
    // Run every 5 minutes
    node_cron_1.default.schedule('*/5 * * * *', async () => {
        await checkMaterialAlerts();
        await checkOrderDelays();
        await broadcastFactorySnapshot();
    });
    // Factory snapshot every 30 seconds
    node_cron_1.default.schedule('*/30 * * * * *', async () => {
        await broadcastFactorySnapshot();
    });
    console.log('Alert engine started');
}
async function checkMaterialAlerts() {
    const { rows } = await (0, connection_1.query)(`
    SELECT id, name, qty, min_threshold, unit
    FROM material_items
    WHERE qty <= min_threshold AND is_active = true
  `);
    for (const item of rows) {
        const existing = await (0, connection_1.query)(`
      SELECT id FROM alerts
      WHERE entity_type = 'material'
        AND entity_id = $1
        AND is_resolved = false
        AND type = 'material_low'
    `, [item.id]);
        if (existing.rows.length === 0) {
            const severity = item.qty <= item.min_threshold * 0.3 ? 'danger' : 'warning';
            await (0, connection_1.query)(`
        INSERT INTO alerts (type, severity, title, message, entity_type, entity_id)
        VALUES ('material_low', $1, $2, $3, 'material', $4)
      `, [
                severity,
                `מלאי נמוך — ${item.name}`,
                `נותרו ${item.qty} ${item.unit}. סף מינימום ${item.min_threshold} ${item.unit}.`,
                item.id
            ]);
            (0, websocket_1.broadcastToAll)('ALERT_CREATED', {
                type: 'material_low',
                severity,
                title: `מלאי נמוך — ${item.name}`,
                message: `נותרו ${item.qty} ${item.unit}`
            });
        }
    }
}
async function checkOrderDelays() {
    const { rows } = await (0, connection_1.query)(`
    SELECT id, product, delivery_date, client_id
    FROM work_orders
    WHERE delivery_date < CURRENT_DATE
      AND status NOT IN ('delivered', 'cancelled')
      AND progress < 100
  `);
    for (const order of rows) {
        const existing = await (0, connection_1.query)(`
      SELECT id FROM alerts
      WHERE entity_type = 'order'
        AND entity_id = $1
        AND is_resolved = false
        AND type = 'order_delayed'
    `, [order.id]);
        if (existing.rows.length === 0) {
            await (0, connection_1.query)(`
        INSERT INTO alerts (type, severity, title, message, entity_type, entity_id)
        VALUES ('order_delayed', 'danger', $1, $2, 'order', $3)
      `, [
                `הזמנה ${order.id} עברה מועד אספקה`,
                `${order.product} — מועד אספקה ${new Date(order.delivery_date).toLocaleDateString('he-IL')}`,
                order.id
            ]);
            (0, websocket_1.broadcastToAll)('ALERT_CREATED', {
                type: 'order_delayed',
                severity: 'danger',
                title: `הזמנה ${order.id} מאוחרת`,
                orderId: order.id
            });
        }
    }
}
async function broadcastFactorySnapshot() {
    try {
        const [orders, materials, attendance, revenue] = await Promise.all([
            (0, connection_1.query)(`SELECT status, COUNT(*) as count FROM work_orders GROUP BY status`),
            (0, connection_1.query)(`SELECT COUNT(*) as count FROM material_items WHERE qty <= min_threshold AND is_active = true`),
            (0, connection_1.query)(`SELECT location, COUNT(*) as count FROM attendance WHERE date = CURRENT_DATE GROUP BY location`),
            (0, connection_1.query)(`SELECT COALESCE(SUM(amount), 0) as total FROM financial_transactions WHERE type IN ('income','advance') AND date >= date_trunc('month', CURRENT_DATE) AND is_paid = true`)
        ]);
        (0, websocket_1.broadcastToAll)('FACTORY_SNAPSHOT', {
            orders: orders.rows,
            materialAlerts: parseInt(materials.rows[0]?.count || '0'),
            attendance: attendance.rows,
            monthlyRevenue: parseFloat(revenue.rows[0]?.total || '0'),
            timestamp: new Date().toISOString()
        });
    }
    catch (err) {
        console.error('Snapshot error:', err);
    }
}
