const db = require('../db/connection');

/**
 * ייצוא חשבוניות ל-CSV
 */
function exportInvoicesToCSV(filters = {}) {
  let query = `
    SELECT i.id, s.name as supplier_name, c.name as category_name,
      i.invoice_number, i.invoice_date, i.due_date, i.amount, i.amount_before_vat,
      i.vat_amount, i.currency, i.status, i.source, i.notes,
      i.forwarded_to_accountant, i.created_at
    FROM invoices i
    JOIN suppliers s ON i.supplier_id = s.id
    LEFT JOIN categories c ON s.category_id = c.id
    WHERE 1=1
  `;
  const params = [];
  if (filters.from_date) { query += ' AND i.invoice_date >= ?'; params.push(filters.from_date); }
  if (filters.to_date) { query += ' AND i.invoice_date <= ?'; params.push(filters.to_date); }
  if (filters.status) { query += ' AND i.status = ?'; params.push(filters.status); }
  if (filters.supplier_id) { query += ' AND i.supplier_id = ?'; params.push(filters.supplier_id); }
  query += ' ORDER BY i.invoice_date DESC';

  const invoices = db.prepare(query).all(...params);

  const headers = ['מזהה', 'ספק', 'קטגוריה', 'מס׳ חשבונית', 'תאריך', 'תשלום עד', 'סכום', 'לפני מע"מ', 'מע"מ', 'מטבע', 'סטטוס', 'מקור', 'הערות', 'נשלח לרו"ח', 'נוצר'];
  const statusMap = { pending: 'ממתין', approved: 'מאושר', rejected: 'נדחה', paid: 'שולם' };

  const rows = invoices.map(i => [
    i.id, i.supplier_name, i.category_name || '', i.invoice_number || '',
    i.invoice_date, i.due_date || '', i.amount, i.amount_before_vat || '',
    i.vat_amount || '', i.currency, statusMap[i.status] || i.status,
    i.source, i.notes || '', i.forwarded_to_accountant ? 'כן' : 'לא', i.created_at,
  ]);

  // BOM for Hebrew support in Excel
  const BOM = '\uFEFF';
  const csv = BOM + [headers.join(','), ...rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))].join('\n');

  return { csv, filename: `invoices_${new Date().toISOString().split('T')[0]}.csv`, count: invoices.length };
}

/**
 * ייצוא דוח חובות ל-CSV
 */
function exportDebtsToCSV() {
  const debts = db.prepare(`
    SELECT s.name as supplier_name, c.name as category_name, s.payment_terms,
      COUNT(i.id) as invoice_count,
      SUM(i.amount) as total_amount,
      MIN(i.due_date) as nearest_due
    FROM invoices i
    JOIN suppliers s ON i.supplier_id = s.id
    LEFT JOIN categories c ON s.category_id = c.id
    WHERE i.status IN ('pending', 'approved')
    GROUP BY s.id ORDER BY total_amount DESC
  `).all();

  const termsMap = { immediate: 'מיידי', shotef_plus_0: 'שוטף', shotef_plus_30: 'שוטף+30', shotef_plus_60: 'שוטף+60', shotef_plus_90: 'שוטף+90' };
  const headers = ['ספק', 'קטגוריה', 'תנאי תשלום', 'חשבוניות', 'סה"כ חוב', 'תשלום קרוב'];
  const rows = debts.map(d => [d.supplier_name, d.category_name || '', termsMap[d.payment_terms] || d.payment_terms, d.invoice_count, d.total_amount, d.nearest_due || '']);

  const BOM = '\uFEFF';
  const csv = BOM + [headers.join(','), ...rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))].join('\n');

  return { csv, filename: `debts_${new Date().toISOString().split('T')[0]}.csv`, count: debts.length };
}

/**
 * ייצוא ל-PDF (HTML-based)
 * מייצר HTML שניתן להמיר ל-PDF בדפדפן או בשרת
 */
function generateInvoiceReportHTML(filters = {}) {
  let query = `
    SELECT i.*, s.name as supplier_name, c.name as category_name, c.color as category_color
    FROM invoices i
    JOIN suppliers s ON i.supplier_id = s.id
    LEFT JOIN categories c ON s.category_id = c.id
    WHERE 1=1
  `;
  const params = [];
  if (filters.from_date) { query += ' AND i.invoice_date >= ?'; params.push(filters.from_date); }
  if (filters.to_date) { query += ' AND i.invoice_date <= ?'; params.push(filters.to_date); }
  if (filters.status) { query += ' AND i.status = ?'; params.push(filters.status); }
  if (filters.supplier_id) { query += ' AND i.supplier_id = ?'; params.push(filters.supplier_id); }
  query += ' ORDER BY i.invoice_date DESC';

  const invoices = db.prepare(query).all(...params);
  const statusMap = { pending: 'ממתין', approved: 'מאושר', rejected: 'נדחה', paid: 'שולם' };
  const total = invoices.reduce((s, i) => s + i.amount, 0);

  const html = `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="UTF-8">
  <title>דוח חשבוניות</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Heebo', Arial, sans-serif; direction: rtl; padding: 40px; color: #1f2937; }
    h1 { font-size: 24px; margin-bottom: 8px; color: #111827; }
    .subtitle { color: #6b7280; margin-bottom: 24px; font-size: 14px; }
    .summary { display: flex; gap: 20px; margin-bottom: 24px; }
    .summary-card { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; flex: 1; }
    .summary-card .label { font-size: 12px; color: #6b7280; }
    .summary-card .value { font-size: 24px; font-weight: bold; margin-top: 4px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th { background: #f3f4f6; padding: 10px 12px; text-align: right; font-weight: 600; border-bottom: 2px solid #e5e7eb; }
    td { padding: 10px 12px; border-bottom: 1px solid #f3f4f6; }
    tr:hover { background: #f9fafb; }
    .status { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 500; }
    .status-pending { background: #fef3c7; color: #92400e; }
    .status-approved { background: #d1fae5; color: #065f46; }
    .status-paid { background: #dbeafe; color: #1e40af; }
    .status-rejected { background: #fee2e2; color: #991b1b; }
    .total-row { font-weight: bold; background: #f3f4f6; }
    .footer { margin-top: 24px; text-align: center; color: #9ca3af; font-size: 11px; }
    @media print { body { padding: 20px; } }
  </style>
</head>
<body>
  <h1>דוח חשבוניות</h1>
  <p class="subtitle">תאריך הפקה: ${new Date().toLocaleDateString('he-IL')} | ${invoices.length} חשבוניות</p>

  <div class="summary">
    <div class="summary-card">
      <div class="label">סה"כ</div>
      <div class="value">₪${total.toLocaleString()}</div>
    </div>
    <div class="summary-card">
      <div class="label">חשבוניות</div>
      <div class="value">${invoices.length}</div>
    </div>
    <div class="summary-card">
      <div class="label">ספקים</div>
      <div class="value">${new Set(invoices.map(i => i.supplier_id)).size}</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>ספק</th>
        <th>קטגוריה</th>
        <th>מס׳ חשבונית</th>
        <th>תאריך</th>
        <th>סכום</th>
        <th>לתשלום עד</th>
        <th>סטטוס</th>
      </tr>
    </thead>
    <tbody>
      ${invoices.map(i => `
      <tr>
        <td><strong>${i.supplier_name}</strong></td>
        <td>${i.category_name || '-'}</td>
        <td>${i.invoice_number || '-'}</td>
        <td>${i.invoice_date}</td>
        <td><strong>₪${i.amount.toLocaleString()}</strong></td>
        <td>${i.due_date || '-'}</td>
        <td><span class="status status-${i.status}">${statusMap[i.status] || i.status}</span></td>
      </tr>`).join('')}
      <tr class="total-row">
        <td colspan="4">סה"כ</td>
        <td>₪${total.toLocaleString()}</td>
        <td colspan="2"></td>
      </tr>
    </tbody>
  </table>

  <div class="footer">מנהל חשבוניות | הופק אוטומטית</div>
</body>
</html>`;

  return { html, count: invoices.length, total };
}

/**
 * ייצוא דוח חובות ל-PDF (HTML)
 */
function generateDebtReportHTML() {
  const debts = db.prepare(`
    SELECT s.name, c.name as category_name, s.payment_terms,
      COUNT(i.id) as count, SUM(i.amount) as total,
      MIN(i.due_date) as nearest_due,
      SUM(CASE WHEN i.due_date < date('now') THEN i.amount ELSE 0 END) as overdue_amount
    FROM invoices i
    JOIN suppliers s ON i.supplier_id = s.id
    LEFT JOIN categories c ON s.category_id = c.id
    WHERE i.status IN ('pending', 'approved')
    GROUP BY s.id ORDER BY total DESC
  `).all();

  const grandTotal = debts.reduce((s, d) => s + d.total, 0);
  const overdueTotal = debts.reduce((s, d) => s + d.overdue_amount, 0);
  const termsMap = { immediate: 'מיידי', shotef_plus_0: 'שוטף', shotef_plus_30: 'שוטף+30', shotef_plus_60: 'שוטף+60', shotef_plus_90: 'שוטף+90' };

  const html = `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="UTF-8">
  <title>דוח חובות</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Heebo', Arial, sans-serif; direction: rtl; padding: 40px; color: #1f2937; }
    h1 { font-size: 24px; margin-bottom: 8px; }
    .subtitle { color: #6b7280; margin-bottom: 24px; font-size: 14px; }
    .summary { display: flex; gap: 20px; margin-bottom: 24px; }
    .summary-card { border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; flex: 1; }
    .card-red { background: #fef2f2; border-color: #fecaca; }
    .card-orange { background: #fffbeb; border-color: #fed7aa; }
    .card-blue { background: #eff6ff; border-color: #bfdbfe; }
    .summary-card .label { font-size: 12px; color: #6b7280; }
    .summary-card .value { font-size: 24px; font-weight: bold; margin-top: 4px; }
    .value-red { color: #dc2626; }
    .value-orange { color: #ea580c; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th { background: #f3f4f6; padding: 10px 12px; text-align: right; font-weight: 600; border-bottom: 2px solid #e5e7eb; }
    td { padding: 10px 12px; border-bottom: 1px solid #f3f4f6; }
    .total-row { font-weight: bold; background: #f3f4f6; }
    .overdue { color: #dc2626; }
    .footer { margin-top: 24px; text-align: center; color: #9ca3af; font-size: 11px; }
    @media print { body { padding: 20px; } }
  </style>
</head>
<body>
  <h1>דוח חובות פתוחים</h1>
  <p class="subtitle">תאריך: ${new Date().toLocaleDateString('he-IL')} | ${debts.length} ספקים</p>

  <div class="summary">
    <div class="summary-card card-red">
      <div class="label">סה"כ חוב</div>
      <div class="value value-red">₪${grandTotal.toLocaleString()}</div>
    </div>
    <div class="summary-card card-orange">
      <div class="label">באיחור</div>
      <div class="value value-orange">₪${overdueTotal.toLocaleString()}</div>
    </div>
    <div class="summary-card card-blue">
      <div class="label">ספקים</div>
      <div class="value">${debts.length}</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>ספק</th>
        <th>קטגוריה</th>
        <th>תנאי תשלום</th>
        <th>חשבוניות</th>
        <th>סה"כ חוב</th>
        <th>באיחור</th>
        <th>תשלום קרוב</th>
      </tr>
    </thead>
    <tbody>
      ${debts.map(d => `
      <tr>
        <td><strong>${d.name}</strong></td>
        <td>${d.category_name || '-'}</td>
        <td>${termsMap[d.payment_terms] || d.payment_terms || '-'}</td>
        <td>${d.count}</td>
        <td><strong>₪${d.total.toLocaleString()}</strong></td>
        <td class="${d.overdue_amount > 0 ? 'overdue' : ''}">₪${d.overdue_amount.toLocaleString()}</td>
        <td>${d.nearest_due || '-'}</td>
      </tr>`).join('')}
      <tr class="total-row">
        <td colspan="4">סה"כ</td>
        <td>₪${grandTotal.toLocaleString()}</td>
        <td class="overdue">₪${overdueTotal.toLocaleString()}</td>
        <td></td>
      </tr>
    </tbody>
  </table>

  <div class="footer">מנהל חשבוניות | הופק אוטומטית</div>
</body>
</html>`;

  return { html, count: debts.length, grandTotal, overdueTotal };
}

/**
 * ייצוא דוח ספק בודד ל-PDF (HTML)
 */
function generateSupplierReportHTML(supplierId) {
  const supplier = db.prepare(`
    SELECT s.*, c.name as category_name FROM suppliers s
    LEFT JOIN categories c ON s.category_id = c.id WHERE s.id = ?
  `).get(supplierId);

  if (!supplier) return null;

  const invoices = db.prepare(`
    SELECT * FROM invoices WHERE supplier_id = ? ORDER BY invoice_date DESC
  `).all(supplierId);

  const payments = db.prepare(`
    SELECT p.*, i.invoice_number FROM payments p
    JOIN invoices i ON p.invoice_id = i.id WHERE i.supplier_id = ?
    ORDER BY p.payment_date DESC
  `).all(supplierId);

  const totalInvoiced = invoices.reduce((s, i) => s + i.amount, 0);
  const totalPaid = payments.reduce((s, p) => s + p.amount, 0);
  const balance = totalInvoiced - totalPaid;
  const statusMap = { pending: 'ממתין', approved: 'מאושר', rejected: 'נדחה', paid: 'שולם' };
  const termsMap = { immediate: 'מיידי', shotef_plus_0: 'שוטף', shotef_plus_30: 'שוטף+30', shotef_plus_60: 'שוטף+60', shotef_plus_90: 'שוטף+90' };

  const html = `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="UTF-8">
  <title>כרטיס ספק - ${supplier.name}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Heebo', Arial, sans-serif; direction: rtl; padding: 40px; color: #1f2937; }
    h1 { font-size: 24px; margin-bottom: 4px; }
    h2 { font-size: 18px; margin: 24px 0 12px; color: #374151; }
    .subtitle { color: #6b7280; margin-bottom: 20px; font-size: 14px; }
    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 24px; }
    .info-item { font-size: 13px; }
    .info-item .label { color: #6b7280; }
    .info-item .value { font-weight: 600; }
    .summary { display: flex; gap: 16px; margin-bottom: 24px; }
    .summary-card { border: 1px solid #e5e7eb; border-radius: 8px; padding: 14px; flex: 1; background: #f9fafb; }
    .summary-card .label { font-size: 12px; color: #6b7280; }
    .summary-card .value { font-size: 20px; font-weight: bold; margin-top: 4px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 24px; }
    th { background: #f3f4f6; padding: 8px 10px; text-align: right; font-weight: 600; border-bottom: 2px solid #e5e7eb; }
    td { padding: 8px 10px; border-bottom: 1px solid #f3f4f6; }
    .status { padding: 2px 6px; border-radius: 10px; font-size: 10px; }
    .status-pending { background: #fef3c7; color: #92400e; }
    .status-approved { background: #d1fae5; color: #065f46; }
    .status-paid { background: #dbeafe; color: #1e40af; }
    .footer { margin-top: 24px; text-align: center; color: #9ca3af; font-size: 11px; }
    @media print { body { padding: 20px; } }
  </style>
</head>
<body>
  <h1>כרטיס ספק: ${supplier.name}</h1>
  <p class="subtitle">הופק בתאריך: ${new Date().toLocaleDateString('he-IL')}</p>

  <div class="info-grid">
    <div class="info-item"><span class="label">איש קשר: </span><span class="value">${supplier.contact_name || '-'}</span></div>
    <div class="info-item"><span class="label">אימייל: </span><span class="value">${supplier.email || '-'}</span></div>
    <div class="info-item"><span class="label">טלפון: </span><span class="value">${supplier.phone || '-'}</span></div>
    <div class="info-item"><span class="label">קטגוריה: </span><span class="value">${supplier.category_name || '-'}</span></div>
    <div class="info-item"><span class="label">תנאי תשלום: </span><span class="value">${termsMap[supplier.payment_terms] || supplier.payment_terms}</span></div>
    <div class="info-item"><span class="label">יום חשבונית צפוי: </span><span class="value">${supplier.expected_invoice_day || '-'}</span></div>
  </div>

  <div class="summary">
    <div class="summary-card"><div class="label">סה"כ חיוב</div><div class="value">₪${totalInvoiced.toLocaleString()}</div></div>
    <div class="summary-card"><div class="label">סה"כ שולם</div><div class="value" style="color:#059669">₪${totalPaid.toLocaleString()}</div></div>
    <div class="summary-card"><div class="label">יתרה</div><div class="value" style="color:${balance > 0 ? '#dc2626' : '#059669'}">₪${balance.toLocaleString()}</div></div>
  </div>

  <h2>חשבוניות (${invoices.length})</h2>
  <table>
    <thead><tr><th>מס׳</th><th>תאריך</th><th>סכום</th><th>לתשלום</th><th>סטטוס</th></tr></thead>
    <tbody>
      ${invoices.map(i => `<tr>
        <td>${i.invoice_number || '-'}</td>
        <td>${i.invoice_date}</td>
        <td>₪${i.amount.toLocaleString()}</td>
        <td>${i.due_date || '-'}</td>
        <td><span class="status status-${i.status}">${statusMap[i.status]}</span></td>
      </tr>`).join('')}
    </tbody>
  </table>

  ${payments.length > 0 ? `
  <h2>תשלומים (${payments.length})</h2>
  <table>
    <thead><tr><th>תאריך</th><th>סכום</th><th>אמצעי</th><th>אסמכתא</th><th>חשבונית</th></tr></thead>
    <tbody>
      ${payments.map(p => `<tr>
        <td>${p.payment_date}</td>
        <td>₪${p.amount.toLocaleString()}</td>
        <td>${p.payment_method || '-'}</td>
        <td>${p.reference || '-'}</td>
        <td>${p.invoice_number || '-'}</td>
      </tr>`).join('')}
    </tbody>
  </table>` : ''}

  <div class="footer">מנהל חשבוניות | כרטיס ספק</div>
</body>
</html>`;

  return { html, supplier: supplier.name, invoiceCount: invoices.length, balance };
}

module.exports = { exportInvoicesToCSV, exportDebtsToCSV, generateInvoiceReportHTML, generateDebtReportHTML, generateSupplierReportHTML };
