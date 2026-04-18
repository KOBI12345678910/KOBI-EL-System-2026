"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const connection_1 = require("../db/connection");
const websocket_1 = require("../realtime/websocket");
const router = (0, express_1.Router)();
router.use(auth_1.authenticate);
router.get('/', async (req, res) => {
    try {
        const { rows } = await (0, connection_1.query)(`
      SELECT l.*, e.name as assigned_name
      FROM leads l
      LEFT JOIN employees e ON l.assigned_to = e.id
      ORDER BY l.created_at DESC
    `);
        res.json(rows);
    }
    catch (err) {
        res.status(500).json({ error: 'Failed to fetch leads' });
    }
});
router.post('/', async (req, res) => {
    try {
        const { name, phone, address, lat, lng, product_interest, estimated_value, source, assigned_to, notes } = req.body;
        const { rows } = await (0, connection_1.query)(`
      INSERT INTO leads (name, phone, address, lat, lng, product_interest, estimated_value, source, assigned_to, notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *
    `, [name, phone, address, lat, lng, product_interest, estimated_value, source, assigned_to, notes]);
        (0, websocket_1.broadcastToAll)('LEAD_CREATED', rows[0]);
        res.status(201).json(rows[0]);
    }
    catch (err) {
        res.status(500).json({ error: 'Failed to create lead' });
    }
});
router.put('/:id', async (req, res) => {
    try {
        const fields = req.body;
        const keys = Object.keys(fields);
        const values = keys.map(k => fields[k]);
        const setClause = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
        const { rows } = await (0, connection_1.query)(`UPDATE leads SET ${setClause} WHERE id = $1 RETURNING *`, [req.params.id, ...values]);
        (0, websocket_1.broadcastToAll)('LEAD_UPDATED', rows[0]);
        res.json(rows[0]);
    }
    catch (err) {
        res.status(500).json({ error: 'Failed to update lead' });
    }
});
exports.default = router;
