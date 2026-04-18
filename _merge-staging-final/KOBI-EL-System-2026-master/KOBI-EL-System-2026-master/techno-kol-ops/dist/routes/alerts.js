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
        const { resolved, severity, type } = req.query;
        let sql = `SELECT * FROM alerts WHERE 1=1`;
        const params = [];
        let i = 1;
        if (resolved !== undefined) {
            sql += ` AND is_resolved = $${i++}`;
            params.push(resolved === 'true');
        }
        if (severity) {
            sql += ` AND severity = $${i++}`;
            params.push(severity);
        }
        if (type) {
            sql += ` AND type = $${i++}`;
            params.push(type);
        }
        sql += ` ORDER BY created_at DESC LIMIT 100`;
        const { rows } = await (0, connection_1.query)(sql, params);
        res.json(rows);
    }
    catch (err) {
        res.status(500).json({ error: 'Failed to fetch alerts' });
    }
});
router.put('/:id/resolve', async (req, res) => {
    try {
        const { id } = req.params;
        const { rows } = await (0, connection_1.query)(`
      UPDATE alerts
      SET is_resolved = true, resolved_at = NOW(), resolved_by = $2
      WHERE id = $1 RETURNING *
    `, [id, req.user?.id]);
        (0, websocket_1.broadcastToAll)('ALERT_RESOLVED', rows[0]);
        res.json(rows[0]);
    }
    catch (err) {
        res.status(500).json({ error: 'Failed to resolve alert' });
    }
});
exports.default = router;
