"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const connection_1 = require("../db/connection");
const router = (0, express_1.Router)();
router.use(auth_1.authenticate);
router.get('/', async (req, res) => {
    try {
        const { rows } = await (0, connection_1.query)(`
      SELECT s.*,
        COUNT(mi.id) as material_count,
        COALESCE(SUM(mi.qty * mi.cost_per_unit), 0) as stock_value
      FROM suppliers s
      LEFT JOIN material_items mi ON s.id = mi.supplier_id AND mi.is_active = true
      WHERE s.is_active = true
      GROUP BY s.id
      ORDER BY s.name
    `);
        res.json(rows);
    }
    catch (err) {
        res.status(500).json({ error: 'Failed to fetch suppliers' });
    }
});
router.post('/', async (req, res) => {
    try {
        const { name, category, contact_name, phone, email, payment_terms, lead_days } = req.body;
        const { rows } = await (0, connection_1.query)(`
      INSERT INTO suppliers (name, category, contact_name, phone, email, payment_terms, lead_days)
      VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *
    `, [name, category, contact_name, phone, email, payment_terms, lead_days]);
        res.status(201).json(rows[0]);
    }
    catch (err) {
        res.status(500).json({ error: 'Failed to create supplier' });
    }
});
exports.default = router;
