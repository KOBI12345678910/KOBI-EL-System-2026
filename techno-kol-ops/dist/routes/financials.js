"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const connection_1 = require("../db/connection");
const router = (0, express_1.Router)();
router.use(auth_1.authenticate);
router.get('/summary', async (req, res) => {
    try {
        const { period = 'month' } = req.query;
        let dateFilter = `date_trunc('month', CURRENT_DATE)`;
        if (period === 'quarter')
            dateFilter = `date_trunc('quarter', CURRENT_DATE)`;
        if (period === 'year')
            dateFilter = `date_trunc('year', CURRENT_DATE)`;
        const { rows } = await (0, connection_1.query)(`
      SELECT
        COALESCE(SUM(amount) FILTER (WHERE type IN ('income','advance') AND is_paid = true), 0) as revenue,
        COALESCE(SUM(amount) FILTER (WHERE type = 'expense' AND is_paid = true), 0) as expenses,
        COALESCE(SUM(amount) FILTER (WHERE type = 'material_cost' AND is_paid = true), 0) as material_costs,
        COALESCE(SUM(amount) FILTER (WHERE type = 'salary' AND is_paid = true), 0) as salary_costs,
        COUNT(DISTINCT order_id) FILTER (WHERE type IN ('income','advance')) as orders_billed
      FROM financial_transactions
      WHERE date >= ${dateFilter}
    `);
        res.json(rows[0]);
    }
    catch (err) {
        res.status(500).json({ error: 'Failed to fetch financial summary' });
    }
});
router.get('/monthly', async (req, res) => {
    try {
        const { rows } = await (0, connection_1.query)(`
      SELECT
        TO_CHAR(date_trunc('month', date), 'MM/YYYY') as month,
        date_trunc('month', date) as month_date,
        COALESCE(SUM(amount) FILTER (WHERE type IN ('income','advance') AND is_paid = true), 0) as revenue,
        COALESCE(SUM(amount) FILTER (WHERE type IN ('expense','material_cost','salary') AND is_paid = true), 0) as costs
      FROM financial_transactions
      WHERE date >= NOW() - INTERVAL '12 months'
      GROUP BY date_trunc('month', date)
      ORDER BY month_date ASC
    `);
        res.json(rows);
    }
    catch (err) {
        res.status(500).json({ error: 'Failed to fetch monthly data' });
    }
});
router.get('/by-category', async (req, res) => {
    try {
        const { rows } = await (0, connection_1.query)(`
      SELECT wo.category,
        COALESCE(SUM(ft.amount) FILTER (WHERE ft.type IN ('income','advance') AND ft.is_paid = true), 0) as revenue,
        COUNT(DISTINCT wo.id) as order_count
      FROM work_orders wo
      LEFT JOIN financial_transactions ft ON wo.id = ft.order_id
      WHERE wo.open_date >= date_trunc('year', CURRENT_DATE)
      GROUP BY wo.category
      ORDER BY revenue DESC
    `);
        res.json(rows);
    }
    catch (err) {
        res.status(500).json({ error: 'Failed to fetch category data' });
    }
});
router.get('/', async (req, res) => {
    try {
        const { rows } = await (0, connection_1.query)(`
      SELECT ft.*, c.name as client_name, wo.product as order_product
      FROM financial_transactions ft
      LEFT JOIN clients c ON ft.client_id = c.id
      LEFT JOIN work_orders wo ON ft.order_id = wo.id
      ORDER BY ft.date DESC
      LIMIT 200
    `);
        res.json(rows);
    }
    catch (err) {
        res.status(500).json({ error: 'Failed to fetch transactions' });
    }
});
router.post('/', async (req, res) => {
    try {
        const { order_id, client_id, type, category, amount, description, date, reference } = req.body;
        const { rows } = await (0, connection_1.query)(`
      INSERT INTO financial_transactions (order_id, client_id, type, category, amount, description, date, reference)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *
    `, [order_id, client_id, type, category, amount, description, date, reference]);
        res.status(201).json(rows[0]);
    }
    catch (err) {
        res.status(500).json({ error: 'Failed to create transaction' });
    }
});
exports.default = router;
