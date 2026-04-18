const db = require('../db/connection');

/**
 * בדיקת כפילויות חשבוניות
 * מחפש חשבוניות דומות לפי ספק, סכום, תאריך ומספר חשבונית
 */
function checkDuplicate(supplierID, invoiceNumber, amount, invoiceDate) {
  const duplicates = [];

  // Exact match by invoice number and supplier
  if (invoiceNumber) {
    const byNumber = db.prepare(`
      SELECT i.*, s.name as supplier_name FROM invoices i
      JOIN suppliers s ON i.supplier_id = s.id
      WHERE i.supplier_id = ? AND i.invoice_number = ?
    `).all(supplierID, invoiceNumber);
    if (byNumber.length > 0) {
      duplicates.push(...byNumber.map(d => ({ ...d, match_type: 'exact_number' })));
    }
  }

  // Same supplier, same amount, within 7 days
  if (amount && invoiceDate) {
    const byAmountDate = db.prepare(`
      SELECT i.*, s.name as supplier_name FROM invoices i
      JOIN suppliers s ON i.supplier_id = s.id
      WHERE i.supplier_id = ? AND i.amount = ?
        AND ABS(julianday(i.invoice_date) - julianday(?)) <= 7
        ${invoiceNumber ? "AND (i.invoice_number != ? OR i.invoice_number IS NULL)" : ''}
    `).all(...[supplierID, amount, invoiceDate, ...(invoiceNumber ? [invoiceNumber] : [])]);

    if (byAmountDate.length > 0) {
      duplicates.push(...byAmountDate.map(d => ({ ...d, match_type: 'amount_date' })));
    }
  }

  return duplicates;
}

module.exports = { checkDuplicate };
