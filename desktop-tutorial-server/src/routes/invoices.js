const express = require('express');
const router = express.Router();
const db = require('../db/connection');
const { computeDueDate } = require('../services/payment.service');
const { createNotification } = require('../services/notification.service');
const { checkDuplicate } = require('../services/duplicate.service');
const { extractVATFromTotal } = require('../services/vat.service');
const { logAudit } = require('./audit');

// GET all invoices with filters
router.get('/', (req, res) => {
  const { status, supplier_id, from_date, to_date, source } = req.query;
  let query = `
    SELECT i.*, s.name as supplier_name, s.payment_terms,
      c.name as category_name, c.color as category_color,
      GROUP_CONCAT(t.name) as tag_names, GROUP_CONCAT(t.color) as tag_colors
    FROM invoices i
    JOIN suppliers s ON i.supplier_id = s.id
    LEFT JOIN categories c ON s.category_id = c.id
    LEFT JOIN invoice_tags it ON it.invoice_id = i.id
    LEFT JOIN tags t ON t.id = it.tag_id
    WHERE 1=1
  `;
  const params = [];

  if (status) { query += ' AND i.status = ?'; params.push(status); }
  if (supplier_id) { query += ' AND i.supplier_id = ?'; params.push(supplier_id); }
  if (from_date) { query += ' AND i.invoice_date >= ?'; params.push(from_date); }
  if (to_date) { query += ' AND i.invoice_date <= ?'; params.push(to_date); }
  if (source) { query += ' AND i.source = ?'; params.push(source); }

  query += ' GROUP BY i.id ORDER BY i.invoice_date DESC';

  const invoices = db.prepare(query).all(...params).map(inv => ({
    ...inv,
    tags: inv.tag_names ? inv.tag_names.split(',').map((name, i) => ({ name, color: (inv.tag_colors || '').split(',')[i] })) : [],
  }));

  res.json(invoices);
});

// GET single invoice with full details
router.get('/:id', (req, res) => {
  const invoice = db.prepare(`
    SELECT i.*, s.name as supplier_name, s.email as supplier_email,
      s.phone as supplier_phone, s.contact_name as supplier_contact,
      s.payment_terms, c.name as category_name, c.color as category_color
    FROM invoices i
    JOIN suppliers s ON i.supplier_id = s.id
    LEFT JOIN categories c ON s.category_id = c.id
    WHERE i.id = ?
  `).get(req.params.id);

  if (!invoice) return res.status(404).json({ error: 'חשבונית לא נמצאה' });

  // Get payments
  const payments = db.prepare('SELECT * FROM payments WHERE invoice_id = ? ORDER BY payment_date DESC').all(req.params.id);
  invoice.payments = payments;
  invoice.total_paid = payments.reduce((sum, p) => sum + p.amount, 0);
  invoice.remaining = invoice.amount - invoice.total_paid;

  // Get tags
  invoice.tags = db.prepare(`
    SELECT t.* FROM tags t
    JOIN invoice_tags it ON it.tag_id = t.id
    WHERE it.invoice_id = ?
  `).all(req.params.id);

  // Get audit log
  invoice.audit = db.prepare(`
    SELECT * FROM audit_log WHERE entity_type = 'invoice' AND entity_id = ?
    ORDER BY created_at DESC LIMIT 20
  `).all(req.params.id);

  res.json(invoice);
});

// POST check for duplicates before creating
router.post('/check-duplicate', (req, res) => {
  const { supplier_id, invoice_number, amount, invoice_date } = req.body;
  const duplicates = checkDuplicate(supplier_id, invoice_number, amount, invoice_date);
  res.json({ duplicates, hasDuplicates: duplicates.length > 0 });
});

// POST create invoice (with duplicate check + auto VAT)
router.post('/', (req, res) => {
  let { supplier_id, invoice_number, invoice_date, amount, amount_before_vat, vat_amount, currency, source, source_ref, file_path, notes, force } = req.body;

  if (!supplier_id || !invoice_date || !amount) {
    return res.status(400).json({ error: 'ספק, תאריך וסכום הם שדות חובה' });
  }

  // Duplicate check (unless force=true to override)
  if (!force) {
    const duplicates = checkDuplicate(supplier_id, invoice_number, amount, invoice_date);
    if (duplicates.length > 0) {
      return res.status(409).json({
        error: 'חשבונית כפולה אפשרית',
        duplicates,
        message: 'נמצאו חשבוניות דומות. שלח עם force=true כדי ליצור בכל זאת.',
      });
    }
  }

  // Auto-calculate VAT if not provided
  if (!amount_before_vat && !vat_amount) {
    const vatCalc = extractVATFromTotal(amount);
    amount_before_vat = vatCalc.amountBeforeVAT;
    vat_amount = vatCalc.vatAmount;
  }

  // Compute due date
  const supplier = db.prepare('SELECT name, payment_terms, custom_terms_days FROM suppliers WHERE id = ?').get(supplier_id);
  const due_date = computeDueDate(invoice_date, supplier?.payment_terms || 'shotef_plus_30', supplier?.custom_terms_days || 0);

  const result = db.prepare(`
    INSERT INTO invoices (supplier_id, invoice_number, invoice_date, due_date, amount, amount_before_vat, vat_amount, currency, source, source_ref, file_path, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(supplier_id, invoice_number, invoice_date, due_date, amount, amount_before_vat, vat_amount, currency || 'ILS', source || 'manual', source_ref, file_path, notes);

  const invoiceId = result.lastInsertRowid;
  createNotification('new_invoice', 'invoice', invoiceId, `חשבונית חדשה התקבלה מ"${supplier.name}"`);
  logAudit('create', 'invoice', invoiceId, `חשבונית חדשה: ₪${amount} מ-${supplier.name}`);

  res.status(201).json({ id: invoiceId, due_date, amount_before_vat, vat_amount });
});

// PATCH update invoice
router.patch('/:id', (req, res) => {
  const fields = ['invoice_number', 'invoice_date', 'due_date', 'amount', 'amount_before_vat', 'vat_amount', 'currency', 'notes', 'status'];
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

  db.prepare(`UPDATE invoices SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  logAudit('update', 'invoice', req.params.id, JSON.stringify(req.body));
  res.json({ success: true });
});

// PATCH approve invoice
router.patch('/:id/approve', (req, res) => {
  const { approved_by } = req.body;
  db.prepare(`
    UPDATE invoices SET status = 'approved', approved_by = ?, approved_at = datetime('now'), updated_at = datetime('now')
    WHERE id = ?
  `).run(approved_by || 'בעלים', req.params.id);

  const inv = db.prepare('SELECT i.*, s.name as supplier_name FROM invoices i JOIN suppliers s ON i.supplier_id = s.id WHERE i.id = ?').get(req.params.id);
  createNotification('invoice_approved', 'invoice', req.params.id, `חשבונית ${inv.invoice_number || inv.id} מ"${inv.supplier_name}" אושרה`);
  logAudit('approve', 'invoice', req.params.id, `אושרה ע"י ${approved_by || 'בעלים'}`);

  res.json({ success: true });
});

// PATCH reject invoice
router.patch('/:id/reject', (req, res) => {
  db.prepare(`UPDATE invoices SET status = 'rejected', updated_at = datetime('now') WHERE id = ?`).run(req.params.id);
  logAudit('reject', 'invoice', req.params.id, 'חשבונית נדחתה');
  res.json({ success: true });
});

// POST bulk approve
router.post('/bulk-approve', (req, res) => {
  const { invoice_ids, approved_by } = req.body;
  if (!invoice_ids || !invoice_ids.length) return res.status(400).json({ error: 'יש לבחור חשבוניות' });

  const stmt = db.prepare(`UPDATE invoices SET status = 'approved', approved_by = ?, approved_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`);
  for (const id of invoice_ids) {
    stmt.run(approved_by || 'בעלים', id);
    logAudit('approve', 'invoice', id, `אישור גורף ע"י ${approved_by || 'בעלים'}`);
  }

  res.json({ success: true, count: invoice_ids.length });
});

// POST bulk delete
router.post('/bulk-delete', (req, res) => {
  const { invoice_ids } = req.body;
  if (!invoice_ids || !invoice_ids.length) return res.status(400).json({ error: 'יש לבחור חשבוניות' });

  for (const id of invoice_ids) {
    db.prepare('DELETE FROM invoice_tags WHERE invoice_id = ?').run(id);
    db.prepare('DELETE FROM payments WHERE invoice_id = ?').run(id);
    db.prepare('DELETE FROM invoices WHERE id = ?').run(id);
    logAudit('delete', 'invoice', id, 'חשבונית נמחקה');
  }

  res.json({ success: true, count: invoice_ids.length });
});

// POST confirm receipt to supplier
router.post('/:id/confirm-receipt', async (req, res) => {
  try {
    const { sendReceiptConfirmation } = require('../services/reminder.service');
    const result = await sendReceiptConfirmation(parseInt(req.params.id));
    logAudit('confirm_receipt', 'invoice', req.params.id, 'אישור קבלה נשלח לספק');
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST add/set tags on invoice
router.post('/:id/tags', (req, res) => {
  const { tag_ids } = req.body;
  const invoiceId = req.params.id;

  // Remove existing tags
  db.prepare('DELETE FROM invoice_tags WHERE invoice_id = ?').run(invoiceId);

  // Add new tags
  if (tag_ids && tag_ids.length) {
    const stmt = db.prepare('INSERT OR IGNORE INTO invoice_tags (invoice_id, tag_id) VALUES (?, ?)');
    for (const tagId of tag_ids) {
      stmt.run(invoiceId, tagId);
    }
  }

  res.json({ success: true });
});

// GET all tags
router.get('/meta/tags', (req, res) => {
  res.json(db.prepare('SELECT * FROM tags ORDER BY name').all());
});

// POST create tag
router.post('/meta/tags', (req, res) => {
  const { name, color } = req.body;
  if (!name) return res.status(400).json({ error: 'שם תגית חובה' });
  try {
    const result = db.prepare('INSERT INTO tags (name, color) VALUES (?, ?)').run(name, color || '#6366f1');
    res.status(201).json({ id: result.lastInsertRowid, name, color });
  } catch (err) {
    if (err.message.includes('UNIQUE')) return res.status(409).json({ error: 'תגית כבר קיימת' });
    throw err;
  }
});

// DELETE invoice
router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM invoice_tags WHERE invoice_id = ?').run(req.params.id);
  db.prepare('DELETE FROM payments WHERE invoice_id = ?').run(req.params.id);
  db.prepare('DELETE FROM invoices WHERE id = ?').run(req.params.id);
  logAudit('delete', 'invoice', req.params.id, 'חשבונית נמחקה');
  res.json({ success: true });
});

module.exports = router;
