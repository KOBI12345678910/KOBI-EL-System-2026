const express = require('express');
const router = express.Router();
const db = require('../db/connection');

// GET payments
router.get('/', (req, res) => {
  const { invoice_id } = req.query;
  let query = `
    SELECT p.*, i.invoice_number, s.name as supplier_name
    FROM payments p
    JOIN invoices i ON p.invoice_id = i.id
    JOIN suppliers s ON i.supplier_id = s.id
  `;
  const params = [];

  if (invoice_id) {
    query += ' WHERE p.invoice_id = ?';
    params.push(invoice_id);
  }

  query += ' ORDER BY p.payment_date DESC';
  res.json(db.prepare(query).all(...params));
});

// POST record payment
router.post('/', (req, res) => {
  const { invoice_id, amount, payment_date, payment_method, reference, notes } = req.body;
  if (!invoice_id || !amount || !payment_date) {
    return res.status(400).json({ error: 'חשבונית, סכום ותאריך חובה' });
  }

  const result = db.prepare(`
    INSERT INTO payments (invoice_id, amount, payment_date, payment_method, reference, notes)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(invoice_id, amount, payment_date, payment_method, reference, notes);

  // Check if invoice is fully paid
  const invoice = db.prepare('SELECT amount FROM invoices WHERE id = ?').get(invoice_id);
  const totalPaid = db.prepare('SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE invoice_id = ?').get(invoice_id).total;

  if (totalPaid >= invoice.amount) {
    db.prepare("UPDATE invoices SET status = 'paid', updated_at = datetime('now') WHERE id = ?").run(invoice_id);
  }

  res.status(201).json({ id: result.lastInsertRowid, fully_paid: totalPaid >= invoice.amount });
});

module.exports = router;
