const express = require('express');
const router = express.Router();
const db = require('../db/connection');

// GET all budgets (optionally filter by year)
router.get('/', (req, res) => {
  const { year } = req.query;
  let query = `
    SELECT b.*, c.name as category_name, c.color as category_color
    FROM budgets b
    JOIN categories c ON b.category_id = c.id
  `;
  const params = [];
  if (year) { query += ' WHERE b.year = ?'; params.push(parseInt(year)); }
  query += ' ORDER BY b.year DESC, b.month ASC, c.name ASC';

  res.json(db.prepare(query).all(...params));
});

// POST create/update budget
router.post('/', (req, res) => {
  const { category_id, month, year, amount } = req.body;
  if (!category_id || !month || !year || !amount) {
    return res.status(400).json({ error: 'קטגוריה, חודש, שנה וסכום חובה' });
  }

  try {
    const result = db.prepare(`
      INSERT INTO budgets (category_id, month, year, amount)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(category_id, month, year) DO UPDATE SET amount = excluded.amount
    `).run(category_id, month, year, amount);

    res.status(201).json({ id: result.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE budget
router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM budgets WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// GET budget vs actual comparison
router.get('/vs-actual', (req, res) => {
  const year = parseInt(req.query.year) || new Date().getFullYear();
  const month = parseInt(req.query.month) || (new Date().getMonth() + 1);

  const budgets = db.prepare(`
    SELECT b.*, c.name as category_name, c.color as category_color
    FROM budgets b
    JOIN categories c ON b.category_id = c.id
    WHERE b.year = ? AND b.month = ?
  `).all(year, month);

  const actuals = db.prepare(`
    SELECT c.id as category_id, c.name as category_name, c.color as category_color,
      COALESCE(SUM(i.amount), 0) as actual_amount, COUNT(i.id) as invoice_count
    FROM categories c
    LEFT JOIN suppliers s ON s.category_id = c.id
    LEFT JOIN invoices i ON i.supplier_id = s.id
      AND strftime('%Y', i.invoice_date) = ? AND strftime('%m', i.invoice_date) = ?
    GROUP BY c.id
  `).all(String(year), String(month).padStart(2, '0'));

  const comparison = actuals.map(actual => {
    const budget = budgets.find(b => b.category_id === actual.category_id);
    return {
      ...actual,
      budget_amount: budget ? budget.amount : 0,
      difference: (budget ? budget.amount : 0) - actual.actual_amount,
      percentage: budget && budget.amount > 0 ? Math.round((actual.actual_amount / budget.amount) * 100) : 0,
    };
  });

  res.json({ comparison, year, month });
});

module.exports = router;
