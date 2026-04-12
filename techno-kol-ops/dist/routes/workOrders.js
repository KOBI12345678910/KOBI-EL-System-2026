"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const connection_1 = require("../db/connection");
const websocket_1 = require("../realtime/websocket");
const router = (0, express_1.Router)();
router.use(auth_1.authenticate);
// GET all work orders
router.get('/', async (req, res) => {
    try {
        const { status, material, client_id, from, to } = req.query;
        let sql = `
      SELECT wo.*, c.name as client_name,
        ARRAY_AGG(DISTINCT e.name) FILTER (WHERE e.name IS NOT NULL) as assigned_employees
      FROM work_orders wo
      JOIN clients c ON wo.client_id = c.id
      LEFT JOIN work_order_employees woe ON wo.id = woe.order_id
      LEFT JOIN employees e ON woe.employee_id = e.id
      WHERE 1=1
    `;
        const params = [];
        let i = 1;
        if (status) {
            sql += ` AND wo.status = $${i++}`;
            params.push(status);
        }
        if (material) {
            sql += ` AND wo.material_primary = $${i++}`;
            params.push(material);
        }
        if (client_id) {
            sql += ` AND wo.client_id = $${i++}`;
            params.push(client_id);
        }
        if (from) {
            sql += ` AND wo.delivery_date >= $${i++}`;
            params.push(from);
        }
        if (to) {
            sql += ` AND wo.delivery_date <= $${i++}`;
            params.push(to);
        }
        sql += ` GROUP BY wo.id, c.name ORDER BY wo.delivery_date ASC`;
        const { rows } = await (0, connection_1.query)(sql, params);
        res.json(rows);
    }
    catch (err) {
        res.status(500).json({ error: 'Failed to fetch orders' });
    }
});
// GET single order with full data
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const [orderRes, employeesRes, materialsRes, eventsRes, financialsRes] = await Promise.all([
            (0, connection_1.query)(`
        SELECT wo.*, c.name as client_name, c.phone as client_phone
        FROM work_orders wo JOIN clients c ON wo.client_id = c.id
        WHERE wo.id = $1
      `, [id]),
            (0, connection_1.query)(`
        SELECT e.id, e.name, e.role, woe.hours_logged, woe.role_on_order
        FROM work_order_employees woe
        JOIN employees e ON woe.employee_id = e.id
        WHERE woe.order_id = $1
      `, [id]),
            (0, connection_1.query)(`
        SELECT mm.*, mi.name as item_name, mi.unit
        FROM material_movements mm
        JOIN material_items mi ON mm.item_id = mi.id
        WHERE mm.order_id = $1
        ORDER BY mm.created_at DESC
      `, [id]),
            (0, connection_1.query)(`
        SELECT * FROM order_events WHERE order_id = $1 ORDER BY created_at DESC
      `, [id]),
            (0, connection_1.query)(`
        SELECT * FROM financial_transactions WHERE order_id = $1 ORDER BY date DESC
      `, [id])
        ]);
        if (!orderRes.rows[0])
            return res.status(404).json({ error: 'Order not found' });
        res.json({
            ...orderRes.rows[0],
            employees: employeesRes.rows,
            materials: materialsRes.rows,
            events: eventsRes.rows,
            financials: financialsRes.rows
        });
    }
    catch (err) {
        res.status(500).json({ error: 'Failed to fetch order' });
    }
});
// POST create order
router.post('/', async (req, res) => {
    try {
        const { id, client_id, product, description, material_primary, category, quantity, unit, price, cost_estimate, advance_paid, delivery_date, priority, notes } = req.body;
        const { rows } = await (0, connection_1.query)(`
      INSERT INTO work_orders
        (id, client_id, product, description, material_primary, category,
         quantity, unit, price, cost_estimate, advance_paid, delivery_date, priority, notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
      RETURNING *
    `, [id, client_id, product, description, material_primary, category,
            quantity, unit, price, cost_estimate, advance_paid, delivery_date, priority, notes]);
        await (0, connection_1.query)(`
      INSERT INTO order_events (order_id, event_type, description, user_id)
      VALUES ($1, 'created', $2, $3)
    `, [id, `הזמנה נוצרה — ${product}`, req.user?.id]);
        if (advance_paid > 0) {
            await (0, connection_1.query)(`
        INSERT INTO financial_transactions (order_id, client_id, type, category, amount, description, is_paid)
        VALUES ($1, $2, 'advance', 'income', $3, 'מקדמה פתיחת הזמנה', true)
      `, [id, client_id, advance_paid]);
        }
        (0, websocket_1.broadcastToAll)('ORDER_CREATED', rows[0]);
        res.status(201).json(rows[0]);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// PUT update order
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const fields = req.body;
        const keys = Object.keys(fields).filter(k => k !== 'id');
        const values = keys.map(k => fields[k]);
        const setClause = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
        const { rows } = await (0, connection_1.query)(`UPDATE work_orders SET ${setClause} WHERE id = $1 RETURNING *`, [id, ...values]);
        (0, websocket_1.broadcast)(`order:${id}`, 'ORDER_UPDATED', rows[0]);
        (0, websocket_1.broadcastToAll)('ORDER_UPDATED', { id, ...fields });
        res.json(rows[0]);
    }
    catch (err) {
        res.status(500).json({ error: 'Failed to update order' });
    }
});
// PUT update progress only
router.put('/:id/progress', async (req, res) => {
    try {
        const { id } = req.params;
        const { progress, note } = req.body;
        let newStatus;
        if (progress === 100)
            newStatus = 'ready';
        const { rows } = await (0, connection_1.query)(`
      UPDATE work_orders
      SET progress = $2, status = COALESCE($3, status)
      WHERE id = $1 RETURNING *
    `, [id, progress, newStatus]);
        await (0, connection_1.query)(`
      INSERT INTO order_events (order_id, event_type, description, user_id)
      VALUES ($1, 'progress_update', $2, $3)
    `, [id, note || `התקדמות עודכנה ל-${progress}%`, req.user?.id]);
        (0, websocket_1.broadcast)(`order:${id}`, 'PROGRESS_UPDATED', { id, progress, status: rows[0].status });
        (0, websocket_1.broadcastToAll)('ORDER_UPDATED', { id, progress });
        res.json(rows[0]);
    }
    catch (err) {
        res.status(500).json({ error: 'Failed to update progress' });
    }
});
// POST assign employee to order
router.post('/:id/employees', async (req, res) => {
    try {
        const { id } = req.params;
        const { employee_id, role_on_order } = req.body;
        const { rows } = await (0, connection_1.query)(`
      INSERT INTO work_order_employees (order_id, employee_id, role_on_order)
      VALUES ($1, $2, $3)
      ON CONFLICT (order_id, employee_id) DO UPDATE SET role_on_order = $3
      RETURNING *
    `, [id, employee_id, role_on_order]);
        (0, websocket_1.broadcast)(`order:${id}`, 'EMPLOYEE_ASSIGNED', rows[0]);
        res.json(rows[0]);
    }
    catch (err) {
        res.status(500).json({ error: 'Failed to assign employee' });
    }
});
// PUT log hours
router.put('/:id/employees/:empId/hours', async (req, res) => {
    try {
        const { id, empId } = req.params;
        const { hours } = req.body;
        const { rows } = await (0, connection_1.query)(`
      UPDATE work_order_employees
      SET hours_logged = hours_logged + $3
      WHERE order_id = $1 AND employee_id = $2
      RETURNING *
    `, [id, empId, hours]);
        res.json(rows[0]);
    }
    catch (err) {
        res.status(500).json({ error: 'Failed to log hours' });
    }
});
exports.default = router;
