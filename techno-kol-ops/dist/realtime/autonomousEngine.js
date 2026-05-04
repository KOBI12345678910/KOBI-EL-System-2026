"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startAutonomousEngine = startAutonomousEngine;
const node_cron_1 = __importDefault(require("node-cron"));
const connection_1 = require("../db/connection");
const websocket_1 = require("./websocket");
function startAutonomousEngine() {
    // ── כל 30 שניות: עדכון סטטוס GPS
    node_cron_1.default.schedule('*/30 * * * * *', async () => {
        await markOfflineEmployees();
        await broadcastLiveMap();
    });
    // ── כל 5 דקות: בדיקת התראות
    node_cron_1.default.schedule('*/5 * * * *', async () => {
        await checkMaterialAlerts();
        await checkOrderDelays();
        await checkTasksWithoutMovement();
    });
    // ── כל שעה: ניתוח עסקי
    node_cron_1.default.schedule('0 * * * *', async () => {
        await analyzeProductivity();
        await checkOverduePayments();
    });
    // ── כל בוקר 07:00: בריפינג יומי
    node_cron_1.default.schedule('0 7 * * 0-5', async () => {
        await sendDailyBriefing();
    });
    console.log('Autonomous engine started — watching everything');
}
// עובד לא שלח GPS כבר 10 דקות → offline
async function markOfflineEmployees() {
    await (0, connection_1.query)(`
    UPDATE employee_current_location
    SET status = 'offline'
    WHERE last_seen < NOW() - INTERVAL '10 minutes'
      AND status = 'active'
  `);
}
// שדר את המפה החיה לכולם
async function broadcastLiveMap() {
    const { rows } = await (0, connection_1.query)(`
    SELECT ecl.*, e.name, e.role, e.department,
      t.title as current_task, t.address as task_address
    FROM employee_current_location ecl
    JOIN employees e ON ecl.employee_id = e.id
    LEFT JOIN tasks t ON t.employee_id = ecl.employee_id
      AND t.scheduled_date = CURRENT_DATE
      AND t.status IN ('on_way','arrived','in_progress')
    WHERE e.is_active = true
  `);
    (0, websocket_1.broadcastToAll)('LIVE_MAP_UPDATE', {
        employees: rows,
        timestamp: new Date().toISOString()
    });
}
// בדוק מלאי מתחת לסף
async function checkMaterialAlerts() {
    const { rows } = await (0, connection_1.query)(`
    SELECT * FROM material_items
    WHERE qty <= min_threshold AND is_active = true
  `);
    for (const item of rows) {
        const existing = await (0, connection_1.query)(`
      SELECT id FROM alerts
      WHERE entity_id = $1 AND type = 'material_low' AND is_resolved = false
    `, [item.id]);
        if (existing.rows.length === 0) {
            const severity = item.qty <= item.min_threshold * 0.2 ? 'critical' : 'warning';
            await (0, connection_1.query)(`
        INSERT INTO alerts (type, severity, title, message, entity_type, entity_id)
        VALUES ('material_low', $1, $2, $3, 'material', $4)
      `, [severity, `מלאי נמוך — ${item.name}`,
                `נותרו ${item.qty} ${item.unit}. סף: ${item.min_threshold}`, item.id]);
            (0, websocket_1.broadcastToAll)('ALERT_CREATED', {
                type: 'material_low', severity, item: item.name, qty: item.qty
            });
        }
    }
}
// בדוק הזמנות מאוחרות
async function checkOrderDelays() {
    const { rows } = await (0, connection_1.query)(`
    SELECT wo.*, c.name as client_name
    FROM work_orders wo
    JOIN clients c ON wo.client_id = c.id
    WHERE wo.delivery_date < CURRENT_DATE
      AND wo.status NOT IN ('delivered','cancelled')
  `);
    for (const order of rows) {
        const daysLate = Math.floor((Date.now() - new Date(order.delivery_date).getTime()) / (1000 * 60 * 60 * 24));
        (0, websocket_1.broadcastToAll)('ORDER_DELAYED', {
            id: order.id,
            product: order.product,
            client: order.client_name,
            daysLate
        });
    }
}
// עובד בשטח לא זז 30 דקות - אולי צריך עזרה
async function checkTasksWithoutMovement() {
    const { rows } = await (0, connection_1.query)(`
    SELECT t.*, e.name as employee_name,
      ecl.last_seen, ecl.lat, ecl.lng
    FROM tasks t
    JOIN employees e ON t.employee_id = e.id
    LEFT JOIN employee_current_location ecl ON t.employee_id = ecl.employee_id
    WHERE t.status = 'in_progress'
      AND t.arrived_at < NOW() - INTERVAL '30 minutes'
      AND ecl.last_seen < NOW() - INTERVAL '20 minutes'
  `);
    for (const task of rows) {
        (0, websocket_1.broadcastToAll)('ALERT_CREATED', {
            type: 'field_no_movement',
            severity: 'warning',
            title: `${task.employee_name} — אין תנועה 30 דק׳`,
            message: `משימה: ${task.title} | כתובת: ${task.address}`
        });
    }
}
// ניתוח פרודוקטיביות שעתי
async function analyzeProductivity() {
    const { rows } = await (0, connection_1.query)(`
    SELECT
      e.id, e.name,
      COUNT(t.id) FILTER (WHERE t.status = 'done' AND t.completed_at > NOW() - INTERVAL '1 hour') as tasks_last_hour,
      COUNT(t.id) FILTER (WHERE t.status = 'done' AND t.scheduled_date = CURRENT_DATE) as tasks_today
    FROM employees e
    LEFT JOIN tasks t ON e.id = t.employee_id
    WHERE e.is_active = true
    GROUP BY e.id, e.name
  `);
    (0, websocket_1.broadcastToAll)('PRODUCTIVITY_UPDATE', {
        employees: rows,
        timestamp: new Date().toISOString()
    });
}
// בדוק חשבוניות פתוחות
async function checkOverduePayments() {
    const { rows } = await (0, connection_1.query)(`
    SELECT wo.id, wo.price, wo.advance_paid,
      c.name as client_name, c.phone as client_phone,
      wo.delivery_date,
      wo.price - COALESCE(wo.advance_paid, 0) as balance_due
    FROM work_orders wo
    JOIN clients c ON wo.client_id = c.id
    WHERE wo.status = 'delivered'
      AND wo.price > COALESCE(wo.advance_paid, 0)
      AND wo.delivered_date < NOW() - INTERVAL '14 days'
  `);
    for (const order of rows) {
        (0, websocket_1.broadcastToAll)('PAYMENT_OVERDUE', {
            order_id: order.id,
            client: order.client_name,
            phone: order.client_phone,
            balance: order.balance_due
        });
    }
}
// בריפינג בוקר
async function sendDailyBriefing() {
    const [ordersRes, tasksRes, materialsRes, attendanceRes] = await Promise.all([
        (0, connection_1.query)(`SELECT COUNT(*) as count FROM work_orders WHERE status IN ('pending','production','finishing')`),
        (0, connection_1.query)(`SELECT COUNT(*) as count FROM tasks WHERE scheduled_date = CURRENT_DATE`),
        (0, connection_1.query)(`SELECT COUNT(*) as count FROM material_items WHERE qty <= min_threshold AND is_active = true`),
        (0, connection_1.query)(`SELECT COUNT(*) as count FROM attendance WHERE date = CURRENT_DATE`)
    ]);
    (0, websocket_1.broadcastToAll)('DAILY_BRIEFING', {
        activeOrders: parseInt(ordersRes.rows[0].count),
        tasksToday: parseInt(tasksRes.rows[0].count),
        materialAlerts: parseInt(materialsRes.rows[0].count),
        presentEmployees: parseInt(attendanceRes.rows[0].count),
        timestamp: new Date().toISOString()
    });
}
