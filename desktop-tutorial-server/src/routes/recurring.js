const express = require('express');
const router = express.Router();
const db = require('../db/connection');
const { computeDueDate } = require('../services/payment.service');
const { createNotification } = require('../services/notification.service');

// GET all recurring invoices
router.get('/', (req, res) => {
  const recurring = db.prepare(`
    SELECT r.*, s.name as supplier_name, s.payment_terms, c.name as category_name
    FROM recurring_invoices r
    JOIN suppliers s ON r.supplier_id = s.id
    LEFT JOIN categories c ON s.category_id = c.id
    ORDER BY r.is_active DESC, s.name ASC
  `).all();
  res.json(recurring);
});

// POST create recurring invoice
router.post('/', (req, res) => {
  const { supplier_id, description, expected_amount, frequency, day_of_month } = req.body;
  if (!supplier_id || !expected_amount) {
    return res.status(400).json({ error: 'ספק וסכום צפוי חובה' });
  }

  const result = db.prepare(`
    INSERT INTO recurring_invoices (supplier_id, description, expected_amount, frequency, day_of_month)
    VALUES (?, ?, ?, ?, ?)
  `).run(supplier_id, description, expected_amount, frequency || 'monthly', day_of_month || 1);

  res.status(201).json({ id: result.lastInsertRowid });
});

// PATCH update recurring invoice
router.patch('/:id', (req, res) => {
  const fields = ['description', 'expected_amount', 'frequency', 'day_of_month', 'is_active'];
  const updates = [];
  const values = [];

  for (const field of fields) {
    if (req.body[field] !== undefined) {
      updates.push(`${field} = ?`);
      values.push(req.body[field]);
    }
  }

  if (updates.length === 0) return res.status(400).json({ error: 'אין שדות לעדכון' });
  values.push(req.params.id);

  db.prepare(`UPDATE recurring_invoices SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  res.json({ success: true });
});

// DELETE recurring invoice
router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM recurring_invoices WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// POST check and create invoices for due recurring items
router.post('/check', (req, res) => {
  const now = new Date();
  const currentDay = now.getDate();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  const recurring = db.prepare(`
    SELECT r.*, s.payment_terms, s.custom_terms_days
    FROM recurring_invoices r
    JOIN suppliers s ON r.supplier_id = s.id
    WHERE r.is_active = 1 AND r.day_of_month <= ?
  `).all(currentDay);

  const created = [];

  for (const rec of recurring) {
    // Check if already created this month
    const existing = db.prepare(`
      SELECT id FROM invoices
      WHERE supplier_id = ? AND source_ref = ?
        AND strftime('%m', invoice_date) = ? AND strftime('%Y', invoice_date) = ?
    `).get(rec.supplier_id, `recurring_${rec.id}`, String(currentMonth).padStart(2, '0'), String(currentYear));

    if (existing) continue;

    const invoiceDate = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(rec.day_of_month).padStart(2, '0')}`;
    const dueDate = computeDueDate(invoiceDate, rec.payment_terms, rec.custom_terms_days);

    const result = db.prepare(`
      INSERT INTO invoices (supplier_id, invoice_date, due_date, amount, source, source_ref, notes)
      VALUES (?, ?, ?, ?, 'recurring', ?, ?)
    `).run(rec.supplier_id, invoiceDate, dueDate, rec.expected_amount, `recurring_${rec.id}`, rec.description || 'חשבונית חוזרת');

    db.prepare("UPDATE recurring_invoices SET last_created_at = datetime('now') WHERE id = ?").run(rec.id);

    const supplierName = db.prepare('SELECT name FROM suppliers WHERE id = ?').get(rec.supplier_id).name;
    createNotification('recurring_created', 'invoice', result.lastInsertRowid, `חשבונית חוזרת נוצרה עבור "${supplierName}" - ₪${rec.expected_amount}`);

    created.push({ recurring_id: rec.id, invoice_id: result.lastInsertRowid });
  }

  res.json({ created, count: created.length });
});

module.exports = router;
