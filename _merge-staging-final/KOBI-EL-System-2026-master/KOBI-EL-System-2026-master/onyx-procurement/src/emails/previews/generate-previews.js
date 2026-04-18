#!/usr/bin/env node
/**
 * ONYX — Email preview generator
 * ──────────────────────────────
 * Agent-73.  Run:
 *   node src/emails/previews/generate-previews.js
 *
 * Writes one .html file per template into this directory plus an `index.html`
 * that links to all of them.  Uses the fixture variables below so designers
 * can open the files in any browser and visually QA each template.
 *
 * This script is purely additive — it only writes into the previews directory.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { renderAll, listTemplates } = require('../email-templates');

const FIXTURE = {
  employee_name: 'דנה כהן',
  period: '2026-03',
  net_amount: '₪12,345.67',
  gross_amount: '₪16,800.00',
  pay_date: '2026-04-10',
  slip_id: 'SLP-20260410-001',
  vendor_name: 'ספק דוגמה בע"מ',
  invoice_number: 'INV-9001',
  amount: '₪4,500.00',
  due_date: '2026-05-15',
  received_date: '2026-04-11',
  customer_name: 'לקוח חשוב',
  days_overdue: 12,
  recipient_name: 'מוטב דוגמה',
  payment_reference: 'PAY-20260411-7788',
  payment_date: '2026-04-11',
  payment_method: 'העברה בנקאית',
  total_sales: '₪120,000',
  total_purchases: '₪60,000',
  vat_due: '₪10,200',
  submission_deadline: '2026-04-30',
  tax_year: '2025',
  taxpayer_name: 'חברת דוגמה בע"מ',
  gross_income: '₪1,250,000',
  total_tax: '₪275,000',
  approver_name: 'מנהל רכש',
  po_number: 'PO-2026-0042',
  requester_name: 'עובד מבקש',
  approval_url: 'https://onyx.local/po/PO-2026-0042',
  account_name: 'חשבון תפעולי ראשי',
  current_balance: '₪5,000',
  threshold: '₪10,000',
  as_of_date: '2026-04-11',
  upcoming_outflows: '₪18,500',
  matched_count: 142,
  unmatched_count: 3,
  reconciled_balance: '₪128,450',
  employee_count: 40,
  failed_count: 2,
  error_code: 'PAY-E-042',
  error_message: 'Missing rate for employee 10023',
};

function main() {
  const outDir = __dirname;
  const rendered = renderAll(FIXTURE);
  const list = listTemplates();
  const summary = [];

  for (const [name, out] of Object.entries(rendered)) {
    const file = path.join(outDir, `${name}.html`);
    fs.writeFileSync(file, out.html, 'utf8');
    const textFile = path.join(outDir, `${name}.txt`);
    fs.writeFileSync(textFile, out.text, 'utf8');
    summary.push({ name, subject: out.subject, file });
    console.log(`wrote ${name}.html (${out.html.length} bytes)`);
  }

  // Index
  const idxRows = list.map((t) => {
    const r = rendered[t.name];
    return `
      <tr>
        <td><a href="./${t.name}.html">${t.name}</a></td>
        <td>${t.category}</td>
        <td dir="rtl">${r.subject}</td>
        <td dir="ltr">${r.subject_en}</td>
        <td><a href="./${t.name}.txt">text</a></td>
      </tr>`;
  }).join('');

  const idx = `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8">
<title>Onyx email previews</title>
<style>
  body{font-family:Arial,sans-serif;background:#f4f4f7;margin:0;padding:24px;}
  h1{color:#1f3a5f;}
  table{border-collapse:collapse;background:#fff;width:100%;max-width:1000px;box-shadow:0 1px 3px rgba(0,0,0,.08);}
  th,td{padding:10px 12px;border-bottom:1px solid #eee;text-align:right;font-size:14px;}
  th{background:#1f3a5f;color:#fff;}
  a{color:#1f3a5f;}
</style></head><body>
<h1>Onyx — Email template previews</h1>
<p>Agent-73.  Fixtures: <code>generate-previews.js</code>.  Total templates: ${list.length}.</p>
<table>
  <tr><th>Name</th><th>Category</th><th>Subject (HE)</th><th>Subject (EN)</th><th>Plain text</th></tr>
  ${idxRows}
</table>
</body></html>`;
  fs.writeFileSync(path.join(outDir, 'index.html'), idx, 'utf8');
  console.log(`wrote index.html with ${list.length} links`);
  return summary;
}

if (require.main === module) {
  try { main(); } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

module.exports = { main, FIXTURE };
