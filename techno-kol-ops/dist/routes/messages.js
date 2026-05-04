"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const connection_1 = require("../db/connection");
const websocket_1 = require("../realtime/websocket");
const router = (0, express_1.Router)();
router.use(auth_1.authenticate);
router.get('/:employeeId', async (req, res) => {
    try {
        const { rows } = await (0, connection_1.query)(`
      SELECT m.*, u.username as from_name
      FROM messages m
      LEFT JOIN users u ON m.from_user_id = u.id
      WHERE m.to_employee_id = $1
      ORDER BY m.created_at DESC
      LIMIT 50
    `, [req.params.employeeId]);
        res.json(rows.reverse());
    }
    catch (err) {
        res.status(500).json({ error: 'Failed to fetch messages' });
    }
});
router.post('/', async (req, res) => {
    try {
        const { to_employee_id, content, type } = req.body;
        const { rows } = await (0, connection_1.query)(`
      INSERT INTO messages (from_user_id, to_employee_id, content, type)
      VALUES ($1, $2, $3, $4) RETURNING *
    `, [req.user?.id, to_employee_id, content, type || 'text']);
        // Push to employee's WS room
        (0, websocket_1.broadcast)(`employee:${to_employee_id}`, 'NEW_MESSAGE', rows[0]);
        res.status(201).json(rows[0]);
    }
    catch (err) {
        res.status(500).json({ error: 'Failed to send message' });
    }
});
router.put('/:id/read', async (req, res) => {
    try {
        await (0, connection_1.query)(`UPDATE messages SET is_read = true, read_at = NOW() WHERE id = $1`, [req.params.id]);
        res.json({ ok: true });
    }
    catch (err) {
        res.status(500).json({ error: 'Failed to mark read' });
    }
});
exports.default = router;
