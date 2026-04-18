const express = require('express');
const router = express.Router();
const db = require('../db/connection');
const path = require('path');

// POST forward invoices to accountant
router.post('/forward', async (req, res) => {
  const { invoice_ids } = req.body;
  if (!invoice_ids || !invoice_ids.length) {
    return res.status(400).json({ error: 'יש לבחור חשבוניות להעברה' });
  }

  const accountantEmail = process.env.ACCOUNTANT_EMAIL;
  if (!accountantEmail) {
    return res.status(400).json({ error: 'מייל רואה חשבון לא מוגדר ב-.env' });
  }

  try {
    const nodemailer = require('nodemailer');
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT) || 587,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    const placeholders = invoice_ids.map(() => '?').join(',');
    const invoices = db.prepare(`
      SELECT i.*, s.name as supplier_name
      FROM invoices i
      JOIN suppliers s ON i.supplier_id = s.id
      WHERE i.id IN (${placeholders})
    `).all(...invoice_ids);

    const attachments = invoices
      .filter(inv => inv.file_path)
      .map(inv => ({
        filename: `${inv.supplier_name}-${inv.invoice_number || inv.id}.pdf`,
        path: path.join(__dirname, '../../', inv.file_path),
      }));

    const invoiceList = invoices.map(inv =>
      `• ${inv.supplier_name} - חשבונית ${inv.invoice_number || 'ללא מספר'} - ₪${inv.amount.toLocaleString()}`
    ).join('\n');

    await transporter.sendMail({
      from: process.env.SMTP_USER,
      to: accountantEmail,
      subject: `חשבוניות לטיפול - ${new Date().toLocaleDateString('he-IL')}`,
      text: `שלום,\n\nמצורפות ${invoices.length} חשבוניות לטיפול:\n\n${invoiceList}\n\nסה"כ: ₪${invoices.reduce((s, i) => s + i.amount, 0).toLocaleString()}\n\nבברכה`,
      attachments,
    });

    // Mark as forwarded
    const updateStmt = db.prepare("UPDATE invoices SET forwarded_to_accountant = 1, forwarded_at = datetime('now') WHERE id = ?");
    for (const id of invoice_ids) {
      updateStmt.run(id);
    }

    res.json({ success: true, count: invoices.length });
  } catch (err) {
    res.status(500).json({ error: 'שגיאה בשליחת המייל', details: err.message });
  }
});

module.exports = router;
