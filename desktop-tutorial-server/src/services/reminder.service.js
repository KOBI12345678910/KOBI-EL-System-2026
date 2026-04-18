const nodemailer = require('nodemailer');
const db = require('../db/connection');
const { createNotification } = require('./notification.service');

/**
 * שליחת תזכורת לספק שלא שלח חשבונית
 */
async function sendSupplierReminder(supplierId, method = 'email') {
  const supplier = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(supplierId);
  if (!supplier) throw new Error('ספק לא נמצא');

  const currentMonth = new Date().toLocaleString('he-IL', { month: 'long', year: 'numeric' });
  const message = `שלום ${supplier.contact_name || supplier.name},\n\nזוהי תזכורת ידידותית כי טרם קיבלנו חשבונית עבור חודש ${currentMonth}.\nנודה לשליחת החשבונית בהקדם.\n\nבברכה`;

  if (method === 'email' && supplier.email) {
    await sendEmailReminder(supplier, message);
  }

  if (method === 'whatsapp' && supplier.phone) {
    await sendWhatsAppReminder(supplier, message);
  }

  // Log reminder
  db.prepare(`
    INSERT INTO reminder_log (supplier_id, method, message, sent_at)
    VALUES (?, ?, ?, datetime('now'))
  `).run(supplierId, method, message);

  createNotification('reminder_sent', 'supplier', supplierId, `תזכורת נשלחה ל"${supplier.name}" ב-${method === 'email' ? 'אימייל' : 'WhatsApp'}`);

  return { success: true, method, supplier: supplier.name };
}

async function sendEmailReminder(supplier, message) {
  if (!process.env.SMTP_HOST) throw new Error('SMTP לא מוגדר');

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT) || 587,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });

  await transporter.sendMail({
    from: process.env.SMTP_USER,
    to: supplier.email,
    subject: `תזכורת: חשבונית חודשית - ${supplier.name}`,
    text: message,
  });
}

async function sendWhatsAppReminder(supplier, message) {
  const token = process.env.WHATSAPP_API_TOKEN;
  if (!token) throw new Error('WhatsApp API לא מוגדר');

  const phone = supplier.phone.replace(/[^0-9]/g, '');
  // Use WhatsApp Business API
  const response = await fetch(`https://graph.facebook.com/v18.0/${process.env.WHATSAPP_PHONE_ID}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: phone,
      type: 'text',
      text: { body: message },
    }),
  });

  if (!response.ok) throw new Error('שגיאה בשליחת WhatsApp');
}

/**
 * שליחת תזכורות אוטומטיות לכל הספקים שחסרה חשבונית
 */
async function sendBulkReminders() {
  const { checkMissingInvoices } = require('./alert.service');
  const missing = checkMissingInvoices();
  const results = [];

  for (const supplier of missing) {
    try {
      if (supplier.email) {
        await sendSupplierReminder(supplier.id, 'email');
        results.push({ supplier: supplier.name, method: 'email', success: true });
      } else if (supplier.phone) {
        await sendSupplierReminder(supplier.id, 'whatsapp');
        results.push({ supplier: supplier.name, method: 'whatsapp', success: true });
      } else {
        results.push({ supplier: supplier.name, success: false, reason: 'אין פרטי קשר' });
      }
    } catch (err) {
      results.push({ supplier: supplier.name, success: false, reason: err.message });
    }
  }

  return results;
}

/**
 * שליחת סיכום יומי/שבועי לבעלים
 */
async function sendOwnerDigest() {
  if (!process.env.NOTIFICATION_EMAIL || !process.env.SMTP_HOST) return;

  const stats = {
    totalDebt: db.prepare("SELECT COALESCE(SUM(amount), 0) as v FROM invoices WHERE status IN ('pending', 'approved')").get().v,
    pendingApproval: db.prepare("SELECT COUNT(*) as v FROM invoices WHERE status = 'pending'").get().v,
    overdueCount: db.prepare("SELECT COUNT(*) as v FROM invoices WHERE status IN ('pending', 'approved') AND due_date < date('now')").get().v,
    overdueAmount: db.prepare("SELECT COALESCE(SUM(amount), 0) as v FROM invoices WHERE status IN ('pending', 'approved') AND due_date < date('now')").get().v,
    dueThisWeek: db.prepare("SELECT COUNT(*) as v FROM invoices WHERE status IN ('pending', 'approved') AND due_date BETWEEN date('now') AND date('now', '+7 days')").get().v,
    dueThisWeekAmount: db.prepare("SELECT COALESCE(SUM(amount), 0) as v FROM invoices WHERE status IN ('pending', 'approved') AND due_date BETWEEN date('now') AND date('now', '+7 days')").get().v,
  };

  const upcoming = db.prepare(`
    SELECT i.amount, i.due_date, i.invoice_number, s.name as supplier_name
    FROM invoices i JOIN suppliers s ON i.supplier_id = s.id
    WHERE i.status IN ('pending', 'approved') AND i.due_date BETWEEN date('now') AND date('now', '+7 days')
    ORDER BY i.due_date
  `).all();

  const upcomingList = upcoming.map(i =>
    `  • ${i.supplier_name} - ₪${i.amount.toLocaleString()} - עד ${i.due_date}`
  ).join('\n');

  const text = `סיכום יומי - מנהל חשבוניות
${'='.repeat(40)}

💰 סה"כ חוב פתוח: ₪${stats.totalDebt.toLocaleString()}
⏳ ממתינות לאישור: ${stats.pendingApproval}
🔴 באיחור: ${stats.overdueCount} חשבוניות (₪${stats.overdueAmount.toLocaleString()})
📅 לתשלום השבוע: ${stats.dueThisWeek} חשבוניות (₪${stats.dueThisWeekAmount.toLocaleString()})

${upcoming.length > 0 ? `תשלומים קרובים:\n${upcomingList}` : 'אין תשלומים קרובים השבוע.'}

---
מנהל חשבוניות | סיכום אוטומטי`;

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT) || 587,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });

  await transporter.sendMail({
    from: process.env.SMTP_USER,
    to: process.env.NOTIFICATION_EMAIL,
    subject: `סיכום יומי: ₪${stats.totalDebt.toLocaleString()} חוב | ${stats.overdueCount} באיחור`,
    text,
  });
}

/**
 * שליחת אישור קבלת חשבונית לספק
 */
async function sendReceiptConfirmation(invoiceId) {
  const invoice = db.prepare(`
    SELECT i.*, s.name as supplier_name, s.email as supplier_email, s.contact_name
    FROM invoices i JOIN suppliers s ON i.supplier_id = s.id WHERE i.id = ?
  `).get(invoiceId);

  if (!invoice || !invoice.supplier_email) return { success: false, reason: 'אין אימייל לספק' };
  if (!process.env.SMTP_HOST) return { success: false, reason: 'SMTP לא מוגדר' };

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT) || 587,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });

  await transporter.sendMail({
    from: process.env.SMTP_USER,
    to: invoice.supplier_email,
    subject: `אישור קבלת חשבונית ${invoice.invoice_number || ''}`,
    text: `שלום ${invoice.contact_name || invoice.supplier_name},\n\nאנו מאשרים קבלת חשבונית${invoice.invoice_number ? ` מס׳ ${invoice.invoice_number}` : ''} על סך ₪${invoice.amount.toLocaleString()}.\n\nתאריך חשבונית: ${invoice.invoice_date}\nצפי תשלום: ${invoice.due_date || 'לא נקבע'}\n\nתודה,\nמנהל חשבוניות`,
  });

  return { success: true };
}

module.exports = { sendSupplierReminder, sendBulkReminders, sendOwnerDigest, sendReceiptConfirmation };
