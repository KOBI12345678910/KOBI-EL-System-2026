const db = require('../db/connection');

/**
 * בדיקה אילו ספקים לא שלחו חשבונית החודש
 */
function checkMissingInvoices() {
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();
  const currentDay = now.getDate();

  // Get active suppliers with expected invoice day that has passed
  const suppliers = db.prepare(`
    SELECT s.*, c.name as category_name
    FROM suppliers s
    LEFT JOIN categories c ON s.category_id = c.id
    WHERE s.is_active = 1
      AND s.expected_invoice_day IS NOT NULL
      AND s.expected_invoice_day <= ?
  `).all(currentDay);

  const missing = [];

  for (const supplier of suppliers) {
    // Check if invoice exists for this month
    const invoice = db.prepare(`
      SELECT id FROM invoices
      WHERE supplier_id = ?
        AND strftime('%m', invoice_date) = ?
        AND strftime('%Y', invoice_date) = ?
    `).get(
      supplier.id,
      String(currentMonth).padStart(2, '0'),
      String(currentYear)
    );

    if (!invoice) {
      missing.push(supplier);

      // Create notification if not already exists
      const existing = db.prepare(`
        SELECT id FROM notifications
        WHERE type = 'missing_invoice'
          AND entity_type = 'supplier'
          AND entity_id = ?
          AND strftime('%m', created_at) = ?
          AND strftime('%Y', created_at) = ?
      `).get(
        supplier.id,
        String(currentMonth).padStart(2, '0'),
        String(currentYear)
      );

      if (!existing) {
        db.prepare(`
          INSERT INTO notifications (type, entity_type, entity_id, message)
          VALUES ('missing_invoice', 'supplier', ?, ?)
        `).run(supplier.id, `הספק "${supplier.name}" לא שלח חשבונית החודש`);
      }
    }
  }

  return missing;
}

/**
 * בדיקת תשלומים שמתקרבים או באיחור
 */
function checkUpcomingPayments() {
  const alerts = [];

  // Overdue
  const overdue = db.prepare(`
    SELECT i.*, s.name as supplier_name
    FROM invoices i
    JOIN suppliers s ON i.supplier_id = s.id
    WHERE i.status IN ('pending', 'approved')
      AND i.due_date < date('now')
  `).all();

  for (const inv of overdue) {
    alerts.push({ type: 'overdue', invoice: inv });

    const existing = db.prepare(`
      SELECT id FROM notifications
      WHERE type = 'payment_overdue' AND entity_id = ? AND is_read = 0
    `).get(inv.id);

    if (!existing) {
      db.prepare(`
        INSERT INTO notifications (type, entity_type, entity_id, message)
        VALUES ('payment_overdue', 'invoice', ?, ?)
      `).run(inv.id, `חשבונית ${inv.invoice_number || inv.id} מ"${inv.supplier_name}" באיחור תשלום!`);
    }
  }

  // Due within 3 days
  const upcoming = db.prepare(`
    SELECT i.*, s.name as supplier_name
    FROM invoices i
    JOIN suppliers s ON i.supplier_id = s.id
    WHERE i.status IN ('pending', 'approved')
      AND i.due_date BETWEEN date('now') AND date('now', '+3 days')
  `).all();

  for (const inv of upcoming) {
    alerts.push({ type: 'upcoming', invoice: inv });
  }

  return alerts;
}

module.exports = { checkMissingInvoices, checkUpcomingPayments };
