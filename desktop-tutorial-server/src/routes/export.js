const express = require('express');
const router = express.Router();
const { exportInvoicesToCSV, exportDebtsToCSV, generateInvoiceReportHTML, generateDebtReportHTML, generateSupplierReportHTML } = require('../services/export.service');

// GET CSV export - invoices
router.get('/csv/invoices', (req, res) => {
  const result = exportInvoicesToCSV(req.query);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
  res.send(result.csv);
});

// GET CSV export - debts
router.get('/csv/debts', (req, res) => {
  const result = exportDebtsToCSV();
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
  res.send(result.csv);
});

// GET PDF export - invoices (returns HTML for browser print/PDF)
router.get('/pdf/invoices', (req, res) => {
  const result = generateInvoiceReportHTML(req.query);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(result.html);
});

// GET PDF export - debts
router.get('/pdf/debts', (req, res) => {
  const result = generateDebtReportHTML();
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(result.html);
});

// GET PDF export - supplier card
router.get('/pdf/supplier/:id', (req, res) => {
  const result = generateSupplierReportHTML(parseInt(req.params.id));
  if (!result) return res.status(404).json({ error: 'ספק לא נמצא' });
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(result.html);
});

module.exports = router;
