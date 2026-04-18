const express = require('express');
const router = express.Router();
const db = require('../db/connection');

// GET all suppliers
router.get('/', (req, res) => {
  const { active } = req.query;
  let query = `
    SELECT s.*, c.name as category_name, c.color as category_color,
      (SELECT COUNT(*) FROM invoices WHERE supplier_id = s.id) as invoice_count,
      (SELECT COALESCE(SUM(amount), 0) FROM invoices WHERE supplier_id = s.id AND status != 'paid') as total_debt
    FROM suppliers s
    LEFT JOIN categories c ON s.category_id = c.id
  `;
  if (active !== undefined) query += ` WHERE s.is_active = ${active === 'true' ? 1 : 0}`;
  query += ' ORDER BY s.name';

  res.json(db.prepare(query).all());
});

// GET single supplier
router.get('/:id', (req, res) => {
  const supplier = db.prepare(`
    SELECT s.*, c.name as category_name, c.color as category_color
    FROM suppliers s
    LEFT JOIN categories c ON s.category_id = c.id
    WHERE s.id = ?
  `).get(req.params.id);

  if (!supplier) return res.status(404).json({ error: 'ספק לא נמצא' });
  res.json(supplier);
});

// POST create supplier
router.post('/', (req, res) => {
  const { name, contact_name, email, phone, category_id, payment_terms, custom_terms_days, expected_invoice_day, notes } = req.body;
  if (!name) return res.status(400).json({ error: 'שם ספק חובה' });

  const result = db.prepare(`
    INSERT INTO suppliers (name, contact_name, email, phone, category_id, payment_terms, custom_terms_days, expected_invoice_day, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(name, contact_name, email, phone, category_id, payment_terms || 'shotef_plus_30', custom_terms_days, expected_invoice_day, notes);

  res.status(201).json({ id: result.lastInsertRowid, ...req.body });
});

// PATCH update supplier
router.patch('/:id', (req, res) => {
  const fields = ['name', 'contact_name', 'email', 'phone', 'category_id', 'payment_terms', 'custom_terms_days', 'expected_invoice_day', 'notes', 'is_active'];
  const updates = [];
  const values = [];

  for (const field of fields) {
    if (req.body[field] !== undefined) {
      updates.push(`${field} = ?`);
      values.push(req.body[field]);
    }
  }

  if (updates.length === 0) return res.status(400).json({ error: 'אין שדות לעדכון' });

  updates.push("updated_at = datetime('now')");
  values.push(req.params.id);

  db.prepare(`UPDATE suppliers SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  res.json({ success: true });
});

module.exports = router;
