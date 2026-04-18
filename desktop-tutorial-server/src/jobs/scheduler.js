const cron = require('node-cron');
const { checkMissingInvoices, checkUpcomingPayments } = require('../services/alert.service');

// Check missing invoices daily at 8:00 AM
cron.schedule('0 8 * * *', () => {
  console.log('Running missing invoices check...');
  const missing = checkMissingInvoices();
  if (missing.length > 0) {
    console.log(`Found ${missing.length} suppliers with missing invoices`);
  }
});

// Check upcoming payments daily at 8:00 AM
cron.schedule('5 8 * * *', () => {
  console.log('Running payment reminders check...');
  const alerts = checkUpcomingPayments();
  if (alerts.length > 0) {
    console.log(`Found ${alerts.length} payment alerts`);
  }
});

// Send owner daily digest at 7:30 AM
cron.schedule('30 7 * * *', async () => {
  try {
    const { sendOwnerDigest } = require('../services/reminder.service');
    await sendOwnerDigest();
    console.log('Owner digest sent');
  } catch (err) {
    console.log('Owner digest skipped:', err.message);
  }
});

// Auto-send reminders to suppliers on 1st of month at 9:00 AM
cron.schedule('0 9 1 * *', async () => {
  try {
    const { sendBulkReminders } = require('../services/reminder.service');
    const results = await sendBulkReminders();
    console.log(`Bulk reminders: ${results.filter(r => r.success).length} sent, ${results.filter(r => !r.success).length} failed`);
  } catch (err) {
    console.log('Bulk reminders error:', err.message);
  }
});

// Check recurring invoices daily at 8:15 AM
cron.schedule('15 8 * * *', async () => {
  try {
    // Dynamic require to avoid circular dependency at startup
    const db = require('../db/connection');
    const { computeDueDate } = require('../services/payment.service');
    const { createNotification } = require('../services/notification.service');

    const now = new Date();
    const currentDay = now.getDate();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();

    const recurring = db.prepare(`
      SELECT r.*, s.payment_terms, s.custom_terms_days, s.name as supplier_name
      FROM recurring_invoices r
      JOIN suppliers s ON r.supplier_id = s.id
      WHERE r.is_active = 1 AND r.day_of_month <= ?
    `).all(currentDay);

    let created = 0;
    for (const rec of recurring) {
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
      createNotification('recurring_created', 'invoice', result.lastInsertRowid, `חשבונית חוזרת: "${rec.supplier_name}" - ₪${rec.expected_amount}`);
      created++;
    }

    if (created > 0) console.log(`Created ${created} recurring invoices`);
  } catch (err) {
    console.log('Recurring invoices check error:', err.message);
  }
});

// Gmail auto-fetch every 15 minutes (if connected)
cron.schedule('*/15 * * * *', async () => {
  try {
    const db = require('../db/connection');
    const tokensRow = db.prepare("SELECT value FROM settings WHERE key = 'gmail_tokens'").get();
    if (!tokensRow) return; // Gmail not connected

    const { google } = require('googleapis');
    const oauth2Client = new google.auth.OAuth2(
      process.env.GMAIL_CLIENT_ID,
      process.env.GMAIL_CLIENT_SECRET,
      process.env.GMAIL_REDIRECT_URI
    );
    oauth2Client.setCredentials(JSON.parse(tokensRow.value));

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    const response = await gmail.users.messages.list({
      userId: 'me',
      q: 'has:attachment filename:pdf subject:(חשבונית OR invoice) newer_than:1d',
      maxResults: 10,
    });

    if (response.data.messages && response.data.messages.length > 0) {
      console.log(`Gmail: Found ${response.data.messages.length} new messages with invoices`);
    }
  } catch (err) {
    // Silently skip if Gmail not configured
  }
});

console.log('Scheduled jobs initialized (6 jobs)');
