const express = require('express');
const router = express.Router();
const db = require('../db/connection');
const { sendSupplierReminder, sendBulkReminders } = require('../services/reminder.service');

// POST send reminder to specific supplier
router.post('/send/:supplierId', async (req, res) => {
  const { method } = req.body; // 'email' or 'whatsapp'
  try {
    const result = await sendSupplierReminder(parseInt(req.params.supplierId), method || 'email');
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST send bulk reminders to all suppliers with missing invoices
router.post('/bulk', async (req, res) => {
  try {
    const results = await sendBulkReminders();
    res.json({ results, sent: results.filter(r => r.success).length, failed: results.filter(r => !r.success).length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET reminder log
router.get('/log', (req, res) => {
  const { supplier_id, limit } = req.query;
  let query = `
    SELECT rl.*, s.name as supplier_name
    FROM reminder_log rl
    JOIN suppliers s ON rl.supplier_id = s.id
  `;
  const params = [];
  if (supplier_id) { query += ' WHERE rl.supplier_id = ?'; params.push(supplier_id); }
  query += ' ORDER BY rl.sent_at DESC LIMIT ?';
  params.push(parseInt(limit) || 100);

  res.json(db.prepare(query).all(...params));
});

module.exports = router;
