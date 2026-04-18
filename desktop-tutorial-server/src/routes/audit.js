const express = require('express');
const router = express.Router();
const db = require('../db/connection');

// GET audit log
router.get('/', (req, res) => {
  const { entity_type, entity_id, action, limit } = req.query;
  let query = 'SELECT * FROM audit_log WHERE 1=1';
  const params = [];

  if (entity_type) { query += ' AND entity_type = ?'; params.push(entity_type); }
  if (entity_id) { query += ' AND entity_id = ?'; params.push(entity_id); }
  if (action) { query += ' AND action = ?'; params.push(action); }

  query += ' ORDER BY created_at DESC LIMIT ?';
  params.push(parseInt(limit) || 100);

  res.json(db.prepare(query).all(...params));
});

module.exports = router;

// Helper: log an audit action (used by other routes)
module.exports.logAudit = function(action, entityType, entityId, details, performedBy = 'system') {
  db.prepare(`
    INSERT INTO audit_log (action, entity_type, entity_id, details, performed_by)
    VALUES (?, ?, ?, ?, ?)
  `).run(action, entityType, entityId, typeof details === 'string' ? details : JSON.stringify(details), performedBy);
};
