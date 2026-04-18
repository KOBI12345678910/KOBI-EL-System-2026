const express = require('express');
const router = express.Router();
const db = require('../db/connection');
const { checkMissingInvoices } = require('../services/alert.service');

// GET debt summary
router.get('/debts', (req, res) => {
  // Total debt by supplier
  const bySupplier = db.prepare(`
    SELECT s.id, s.name as supplier_name, c.name as category_name, c.color as category_color,
      SUM(i.amount) as total_amount,
      SUM(i.amount) - COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.invoice_id IN (SELECT id FROM invoices WHERE supplier_id = s.id AND status != 'paid')), 0) as remaining_debt,
      COUNT(i.id) as invoice_count,
      MIN(i.due_date) as nearest_due
    FROM invoices i
    JOIN suppliers s ON i.supplier_id = s.id
    LEFT JOIN categories c ON s.category_id = c.id
    WHERE i.status IN ('pending', 'approved')
    GROUP BY s.id
    ORDER BY remaining_debt DESC
  `).all();

  // Total summary
  const totals = db.prepare(`
    SELECT
      COALESCE(SUM(amount), 0) as total_debt,
      COUNT(*) as total_invoices,
      COALESCE(SUM(CASE WHEN due_date < date('now') THEN amount ELSE 0 END), 0) as overdue_amount,
      SUM(CASE WHEN due_date < date('now') THEN 1 ELSE 0 END) as overdue_count
    FROM invoices
    WHERE status IN ('pending', 'approved')
  `).get();

  res.json({ bySupplier, totals });
});

// GET cost analysis
router.get('/costs', (req, res) => {
  const { period } = req.query; // 'month' or 'year'

  // By category
  const byCategory = db.prepare(`
    SELECT c.name as category, c.color, COALESCE(SUM(i.amount), 0) as total
    FROM invoices i
    JOIN suppliers s ON i.supplier_id = s.id
    LEFT JOIN categories c ON s.category_id = c.id
    WHERE i.invoice_date >= date('now', '-12 months')
    GROUP BY c.id
    ORDER BY total DESC
  `).all();

  // Monthly trend
  const monthlyTrend = db.prepare(`
    SELECT strftime('%Y-%m', invoice_date) as month, SUM(amount) as total, COUNT(*) as count
    FROM invoices
    WHERE invoice_date >= date('now', '-12 months')
    GROUP BY month
    ORDER BY month
  `).all();

  // Top suppliers
  const topSuppliers = db.prepare(`
    SELECT s.name, SUM(i.amount) as total, COUNT(i.id) as count
    FROM invoices i
    JOIN suppliers s ON i.supplier_id = s.id
    WHERE i.invoice_date >= date('now', '-12 months')
    GROUP BY s.id
    ORDER BY total DESC
    LIMIT 10
  `).all();

  res.json({ byCategory, monthlyTrend, topSuppliers });
});

// GET missing invoices
router.get('/missing', (req, res) => {
  const missing = checkMissingInvoices();
  res.json(missing);
});

// GET upcoming payments
router.get('/upcoming', (req, res) => {
  const upcoming = db.prepare(`
    SELECT i.*, s.name as supplier_name, s.payment_terms,
      c.name as category_name, c.color as category_color,
      CASE
        WHEN i.due_date < date('now') THEN 'overdue'
        WHEN i.due_date <= date('now', '+7 days') THEN 'soon'
        ELSE 'future'
      END as urgency
    FROM invoices i
    JOIN suppliers s ON i.supplier_id = s.id
    LEFT JOIN categories c ON s.category_id = c.id
    WHERE i.status IN ('pending', 'approved')
    ORDER BY i.due_date ASC
  `).all();

  res.json(upcoming);
});

// GET dashboard stats
router.get('/dashboard', (req, res) => {
  const stats = {
    totalDebt: db.prepare("SELECT COALESCE(SUM(amount), 0) as v FROM invoices WHERE status IN ('pending', 'approved')").get().v,
    pendingApproval: db.prepare("SELECT COUNT(*) as v FROM invoices WHERE status = 'pending'").get().v,
    overduePayments: db.prepare("SELECT COUNT(*) as v FROM invoices WHERE status IN ('pending', 'approved') AND due_date < date('now')").get().v,
    invoicesThisMonth: db.prepare("SELECT COUNT(*) as v FROM invoices WHERE strftime('%Y-%m', invoice_date) = strftime('%Y-%m', 'now')").get().v,
    paidThisMonth: db.prepare("SELECT COALESCE(SUM(amount), 0) as v FROM payments WHERE strftime('%Y-%m', payment_date) = strftime('%Y-%m', 'now')").get().v,
    unreadNotifications: db.prepare("SELECT COUNT(*) as v FROM notifications WHERE is_read = 0").get().v,
  };
  res.json(stats);
});

module.exports = router;
