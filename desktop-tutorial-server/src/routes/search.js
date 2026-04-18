const express = require('express');
const router = express.Router();
const db = require('../db/connection');

// GET global search
router.get('/', (req, res) => {
  const { q } = req.query;
  if (!q || q.length < 2) return res.json({ invoices: [], suppliers: [] });

  const term = `%${q}%`;

  const invoices = db.prepare(`
    SELECT i.id, i.invoice_number, i.invoice_date, i.amount, i.status,
      s.name as supplier_name, c.name as category_name
    FROM invoices i
    JOIN suppliers s ON i.supplier_id = s.id
    LEFT JOIN categories c ON s.category_id = c.id
    WHERE i.invoice_number LIKE ? OR s.name LIKE ? OR i.notes LIKE ?
    ORDER BY i.invoice_date DESC LIMIT 20
  `).all(term, term, term);

  const suppliers = db.prepare(`
    SELECT s.id, s.name, s.email, s.phone, c.name as category_name,
      (SELECT COUNT(*) FROM invoices WHERE supplier_id = s.id) as invoice_count
    FROM suppliers s
    LEFT JOIN categories c ON s.category_id = c.id
    WHERE s.name LIKE ? OR s.email LIKE ? OR s.phone LIKE ? OR s.contact_name LIKE ?
    ORDER BY s.name LIMIT 10
  `).all(term, term, term, term);

  res.json({ invoices, suppliers, total: invoices.length + suppliers.length });
});

module.exports = router;
