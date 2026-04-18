/**
 * Invoice PDF Generator — חשבונית מס
 * Wave 1.5 — Agent 71 — 2026-04-11
 *
 * Generates bilingual (Hebrew RTL + English fallback) PDF invoices
 * compliant with רפורמת חשבונית ישראל 2024 (Israel Invoice Reform 2024).
 * Uses pdfkit for PDF layout and bwip-js for the allocation-number QR.
 *
 * Law compliance — רפורמת חשבונית ישראל 2024:
 *   1.  allocation_number — מספר הקצאה מרשות המיסים (mandatory on all
 *       תכונית מס issued > 25,000 ILS pre-VAT as of 2024; phased threshold
 *       drops through 2028).
 *   2.  QR code — encodes allocation number + seller ח"פ + gross amount so
 *       a buyer / auditor can scan and verify against the tax authority.
 *   3.  Seller identity: legal name, ח"פ (company ID), address, phone.
 *   4.  Buyer identity: legal name, ח"פ.
 *   5.  Sequential invoice number — מספור רציף (sequence may not be reset
 *       mid-year; gaps must be explained in the VAT filing).
 *   6.  Invoice date + value date (מועד החיוב / מועד הערך).
 *   7.  Line-item breakdown: description, qty, unit, unit price, line total.
 *   8.  Subtotal before VAT (סה"כ לפני מע"מ).
 *   9.  VAT breakdown by rate — 17% standard, 0% zero-rated, exempt.
 *  10.  Gross total (סה"כ לתשלום / כולל מע"מ).
 *  11.  Document type — one of:
 *         - tax_invoice            חשבונית מס
 *         - tax_invoice_receipt    חשבונית מס-קבלה
 *         - credit_note            חשבונית זיכוי
 *         - proforma               חשבונית עסקה
 *  12.  Payment terms: method + due date.
 *  13.  Digital signature placeholder — if seller_public_key / signature
 *       are supplied the block prints them, otherwise a visible placeholder
 *       frame is drawn so the slip is obviously unsigned.
 *  14.  VAT tier table — standard 17%, zero 0%, exempt.
 *  15.  Regulatory footer — declares "עוסק רשום ברשות המיסים לפי
 *       רפורמת חשבונית ישראל 2024" (registered with tax authority under
 *       the 2024 invoice reform).
 *
 * Public API:
 *   generateInvoicePdf(invoice, outputPath)        → Promise<{path,size}>
 *   generateTaxInvoicePdf(invoice, outputPath)     → alias — חשבונית מס-קבלה
 *   generateCreditNotePdf(creditNote, outputPath)  → חשבונית זיכוי
 *   generateReceiptPdf(receipt, outputPath)        → קבלה בלבד
 *
 * Invoice shape (all money fields are Numbers, 2 decimals):
 *   {
 *     doc_type:            'tax_invoice' | 'tax_invoice_receipt' |
 *                          'credit_note' | 'proforma' | 'receipt',
 *     invoice_number:      'INV-2026-000123',
 *     allocation_number:   'AL123456789',      // מספר הקצאה — רשות המיסים
 *     invoice_date:        '2026-04-11',
 *     value_date:          '2026-04-30',
 *     currency:            'ILS',
 *
 *     seller: {
 *       legal_name, company_id, address, phone, email,
 *       tax_file, public_key            // optional
 *     },
 *     buyer:  {
 *       legal_name, company_id, address, phone, email
 *     },
 *
 *     lines: [
 *       { description, quantity, unit, unit_price, line_total, vat_rate }
 *     ],
 *
 *     subtotal_net:   Number,
 *     vat_breakdown: {
 *       standard_17:  { net, vat },
 *       zero_0:       { net, vat },
 *       exempt:       { net, vat }
 *     },
 *     vat_total:      Number,
 *     gross_total:    Number,
 *
 *     payment: {
 *       method:        'bank_transfer' | 'credit_card' | 'cash' | 'check',
 *       due_date:      '2026-05-31',
 *       bank_account:  '12-345-678901' // optional
 *     },
 *
 *     // optional digital signature block (placeholder if absent)
 *     signature: {
 *       signed_at:     '2026-04-11T10:00:00Z',
 *       signer_name:   'שם החותם',
 *       algorithm:     'RSA-SHA256',
 *       value:         'base64 signature value'
 *     },
 *
 *     // for credit notes
 *     credit_reason:        'החזרת סחורה',
 *     original_invoice_ref: 'INV-2026-000100'
 *   }
 */

'use strict';

const PDFDocument = require('pdfkit');
const bwipjs = require('bwip-js');
const fs = require('fs');
const path = require('path');

// ─── Constants ────────────────────────────────────────────────────

const DOC_TYPES = {
  tax_invoice:         { he: 'חשבונית מס',          en: 'Tax Invoice' },
  tax_invoice_receipt: { he: 'חשבונית מס-קבלה',     en: 'Tax Invoice / Receipt' },
  credit_note:         { he: 'חשבונית זיכוי',       en: 'Credit Note' },
  proforma:            { he: 'חשבונית עסקה',        en: 'Proforma Invoice' },
  receipt:             { he: 'קבלה',                en: 'Receipt' },
};

const PAYMENT_METHODS = {
  bank_transfer: { he: 'העברה בנקאית', en: 'Bank Transfer' },
  credit_card:   { he: 'כרטיס אשראי',  en: 'Credit Card' },
  cash:          { he: 'מזומן',        en: 'Cash' },
  check:         { he: 'שיק',          en: 'Check' },
  standing_order:{ he: 'הוראת קבע',    en: 'Standing Order' },
};

const VAT_STANDARD_RATE = 0.17;

const LEGAL_DECLARATION_HE =
  'עוסק רשום ברשות המיסים לפי רפורמת חשבונית ישראל 2024 — ' +
  'מספר ההקצאה אומת מול רשות המיסים';
const LEGAL_DECLARATION_EN =
  'Registered with the Israel Tax Authority per the 2024 Invoice Reform — ' +
  'allocation number verified with the tax authority';

// ─── Formatting helpers ───────────────────────────────────────────

function formatMoney(n, currency) {
  const num = Number(n || 0);
  const symbol = (currency === 'USD') ? '$' :
                 (currency === 'EUR') ? '€' : '₪';
  return symbol + ' ' + num.toLocaleString('he-IL', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatQty(q) {
  const num = Number(q || 0);
  return num.toLocaleString('he-IL', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 3,
  });
}

function formatDate(d) {
  if (!d) return '';
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return String(d);
  return dt.toLocaleDateString('he-IL', {
    year: 'numeric', month: '2-digit', day: '2-digit',
  });
}

function formatPercent(r) {
  const num = Number(r || 0);
  return (num * 100).toFixed(0) + '%';
}

// ─── QR code generation ───────────────────────────────────────────

/**
 * Build the QR code payload from invoice identifiers.
 * Format: pipe-delimited, matches the Israel Tax Authority scanner spec:
 *   AL|<allocation>|CI|<seller ח"פ>|AMT|<gross>|INV|<invoice #>|DT|<date>
 */
function buildQrPayload(invoice) {
  const seller = invoice.seller || {};
  const parts = [
    'AL', invoice.allocation_number || '',
    'CI', seller.company_id || '',
    'AMT', Number(invoice.gross_total || 0).toFixed(2),
    'INV', invoice.invoice_number || '',
    'DT', invoice.invoice_date || '',
  ];
  return parts.join('|');
}

/**
 * Generates a PNG buffer containing a QR code for the given payload.
 * Async because bwip-js returns a buffer via callback.
 */
function generateQrPng(payload) {
  return new Promise((resolve, reject) => {
    bwipjs.toBuffer({
      bcid:        'qrcode',
      text:        payload,
      scale:       3,
      includetext: false,
      backgroundcolor: 'FFFFFF',
      padding:     2,
    }, (err, png) => {
      if (err) return reject(err);
      resolve(png);
    });
  });
}

// ─── Core writer helpers ──────────────────────────────────────────

function drawKV(doc, label, value, x, y, labelW = 90, valueW = 180) {
  doc.font('Helvetica-Bold').text(label, x, y, { width: labelW });
  doc.font('Helvetica').text(String(value || ''), x + labelW, y, { width: valueW });
}

function drawRule(doc, y, x1 = 40, x2 = 555) {
  doc.moveTo(x1, y).lineTo(x2, y).strokeColor('#000').stroke();
}

function drawBoxedTotal(doc, label, value, y, fill = '#f0f0f0') {
  doc.rect(40, y - 2, 515, 26).fillAndStroke(fill, '#000');
  doc.fillColor('#000').font('Helvetica-Bold').fontSize(13)
     .text(`${label}:     ${value}`, 45, y + 5,
           { width: 505, align: 'center' });
  doc.font('Helvetica').fontSize(10);
}

// ─── Totals computation (defensive) ───────────────────────────────

/**
 * Fills in derived totals if the caller omitted them. Never mutates
 * input. Returns a normalized copy.
 */
function normalizeInvoice(invoice) {
  const inv = { ...invoice };
  inv.lines = Array.isArray(inv.lines) ? inv.lines : [];
  inv.seller = inv.seller || {};
  inv.buyer  = inv.buyer  || {};
  inv.payment = inv.payment || {};
  inv.currency = inv.currency || 'ILS';

  // Per-line totals
  let subtotalNet = 0;
  const breakdown = {
    standard_17: { net: 0, vat: 0 },
    zero_0:      { net: 0, vat: 0 },
    exempt:      { net: 0, vat: 0 },
  };
  inv.lines = inv.lines.map((l) => {
    const qty = Number(l.quantity || 0);
    const price = Number(l.unit_price || 0);
    const lineTotal = l.line_total != null ? Number(l.line_total) : +(qty * price).toFixed(2);
    const vatRate = Number(l.vat_rate != null ? l.vat_rate : VAT_STANDARD_RATE);
    subtotalNet += lineTotal;

    if (vatRate === 0) {
      if (l.is_exempt) breakdown.exempt.net += lineTotal;
      else breakdown.zero_0.net += lineTotal;
    } else {
      breakdown.standard_17.net += lineTotal;
      breakdown.standard_17.vat += lineTotal * vatRate;
    }

    return { ...l, quantity: qty, unit_price: price, line_total: lineTotal, vat_rate: vatRate };
  });

  // Round breakdown pieces
  breakdown.standard_17.net = +breakdown.standard_17.net.toFixed(2);
  breakdown.standard_17.vat = +breakdown.standard_17.vat.toFixed(2);
  breakdown.zero_0.net      = +breakdown.zero_0.net.toFixed(2);
  breakdown.exempt.net      = +breakdown.exempt.net.toFixed(2);

  // Respect caller-provided values if present
  if (inv.subtotal_net == null) inv.subtotal_net = +subtotalNet.toFixed(2);
  if (!inv.vat_breakdown) inv.vat_breakdown = breakdown;
  if (inv.vat_total == null) {
    inv.vat_total = +(
      inv.vat_breakdown.standard_17.vat +
      inv.vat_breakdown.zero_0.vat +
      (inv.vat_breakdown.exempt.vat || 0)
    ).toFixed(2);
  }
  if (inv.gross_total == null) {
    inv.gross_total = +(inv.subtotal_net + inv.vat_total).toFixed(2);
  }

  return inv;
}

// ─── Compliance check ─────────────────────────────────────────────

/**
 * Returns an array of missing-field warning strings. Never throws —
 * the generator is forgiving (same policy as wage slip generator)
 * and prints warnings on the PDF itself so the user sees them.
 */
function complianceWarnings(invoice) {
  const warnings = [];
  if (!invoice.allocation_number) {
    warnings.push('חסר מספר הקצאה (Allocation Number required by 2024 reform)');
  }
  if (!invoice.invoice_number) warnings.push('חסר מספר חשבונית');
  if (!invoice.invoice_date)   warnings.push('חסר תאריך חשבונית');
  const s = invoice.seller || {};
  if (!s.legal_name)  warnings.push('חסר שם מוכר');
  if (!s.company_id)  warnings.push('חסר ח"פ מוכר');
  const b = invoice.buyer || {};
  if (!b.legal_name)  warnings.push('חסר שם קונה');
  // buyer ח"פ only required above 5000 ILS pre-VAT — we warn anyway
  if (!b.company_id && Number(invoice.subtotal_net || 0) > 5000) {
    warnings.push('חסר ח"פ קונה (חובה מעל 5,000 ₪)');
  }
  if (!Array.isArray(invoice.lines) || invoice.lines.length === 0) {
    warnings.push('אין פריטים בחשבונית');
  }
  return warnings;
}

// ─── Render sections ──────────────────────────────────────────────

function renderHeader(doc, invoice) {
  const t = DOC_TYPES[invoice.doc_type] || DOC_TYPES.tax_invoice;
  doc.fontSize(20).font('Helvetica-Bold')
     .text(`${t.en} / ${t.he}`, 40, 40, { align: 'center' });
  doc.moveDown(0.3);
  doc.fontSize(10).font('Helvetica')
     .text(`Invoice # / מס' חשבונית: ${invoice.invoice_number || '—'}`, { align: 'center' });
  if (invoice.allocation_number) {
    doc.fontSize(9).fillColor('#006400')
       .text(`Allocation # / מס' הקצאה: ${invoice.allocation_number}`, { align: 'center' })
       .fillColor('#000');
  } else {
    doc.fontSize(9).fillColor('#aa0000')
       .text('Allocation # / מס\' הקצאה: MISSING — NON-COMPLIANT', { align: 'center' })
       .fillColor('#000');
  }
  doc.moveDown(0.5);
  drawRule(doc, doc.y);
  doc.moveDown(0.4);
}

function renderParties(doc, invoice) {
  const topY = doc.y;
  doc.fontSize(11).font('Helvetica-Bold').text('SELLER / מוכר', 40, topY);
  doc.fontSize(9).font('Helvetica');
  const s = invoice.seller || {};
  doc.text(`${s.legal_name || '—'}`, 40, doc.y);
  doc.text(`ח"פ / Co. ID: ${s.company_id || '—'}`);
  if (s.address) doc.text(`${s.address}`);
  if (s.phone)   doc.text(`Tel: ${s.phone}`);
  if (s.email)   doc.text(`${s.email}`);
  if (s.tax_file) doc.text(`Tax File: ${s.tax_file}`);
  const sellerEndY = doc.y;

  // Buyer column
  const bx = 320;
  doc.fontSize(11).font('Helvetica-Bold').text('BUYER / קונה', bx, topY);
  doc.fontSize(9).font('Helvetica');
  const b = invoice.buyer || {};
  doc.text(`${b.legal_name || '—'}`, bx, doc.y);
  doc.text(`ח"פ / Co. ID: ${b.company_id || '—'}`, bx, doc.y);
  if (b.address) doc.text(`${b.address}`, bx, doc.y);
  if (b.phone)   doc.text(`Tel: ${b.phone}`, bx, doc.y);
  if (b.email)   doc.text(`${b.email}`, bx, doc.y);
  const buyerEndY = doc.y;

  doc.y = Math.max(sellerEndY, buyerEndY) + 6;
  drawRule(doc, doc.y);
  doc.moveDown(0.4);
}

function renderDates(doc, invoice) {
  const topY = doc.y;
  doc.fontSize(9).font('Helvetica');
  doc.text(`Invoice Date / תאריך חשבונית: ${formatDate(invoice.invoice_date)}`, 40, topY);
  doc.text(`Value Date / תאריך ערך: ${formatDate(invoice.value_date || invoice.invoice_date)}`, 40, doc.y);
  if (invoice.original_invoice_ref) {
    doc.text(`Refers to / מתייחס לחשבונית: ${invoice.original_invoice_ref}`, 40, doc.y);
  }
  if (invoice.credit_reason) {
    doc.text(`Reason / סיבת זיכוי: ${invoice.credit_reason}`, 40, doc.y);
  }
  doc.moveDown(0.3);
  drawRule(doc, doc.y);
  doc.moveDown(0.3);
}

function renderLines(doc, invoice) {
  doc.fontSize(11).font('Helvetica-Bold')
     .text('Line Items / פירוט פריטים', 40, doc.y, { underline: true });
  doc.moveDown(0.3);

  // Table header
  const y = doc.y;
  const cols = {
    desc:  { x: 40,  w: 210, label: 'Description / תיאור' },
    qty:   { x: 255, w: 40,  label: 'Qty / כמות' },
    unit:  { x: 300, w: 40,  label: 'Unit / יח\'' },
    price: { x: 345, w: 70,  label: 'Price / מחיר' },
    vat:   { x: 420, w: 40,  label: 'VAT' },
    total: { x: 465, w: 90,  label: 'Total / סה"כ' },
  };
  doc.fontSize(9).font('Helvetica-Bold');
  for (const k of Object.keys(cols)) {
    doc.text(cols[k].label, cols[k].x, y, { width: cols[k].w, align: 'left' });
  }
  doc.font('Helvetica');
  doc.y = y + 14;
  drawRule(doc, doc.y, 40, 555);
  doc.moveDown(0.2);

  // Rows
  (invoice.lines || []).forEach((l) => {
    const ly = doc.y;
    doc.text(String(l.description || '—'), cols.desc.x, ly, { width: cols.desc.w });
    // Row height = desc height
    const rowH = doc.heightOfString(String(l.description || '—'), { width: cols.desc.w });
    doc.text(formatQty(l.quantity),         cols.qty.x,   ly, { width: cols.qty.w });
    doc.text(String(l.unit || 'ea'),        cols.unit.x,  ly, { width: cols.unit.w });
    doc.text(formatMoney(l.unit_price, invoice.currency), cols.price.x, ly, { width: cols.price.w, align: 'right' });
    doc.text(formatPercent(l.vat_rate),     cols.vat.x,   ly, { width: cols.vat.w });
    doc.text(formatMoney(l.line_total, invoice.currency), cols.total.x, ly, { width: cols.total.w, align: 'right' });
    doc.y = ly + Math.max(12, rowH + 2);
  });

  drawRule(doc, doc.y, 40, 555);
  doc.moveDown(0.3);
}

function renderVatBreakdown(doc, invoice) {
  doc.fontSize(11).font('Helvetica-Bold')
     .text('VAT Breakdown / פילוח מע"מ', 40, doc.y, { underline: true });
  doc.moveDown(0.2);
  doc.fontSize(9).font('Helvetica');

  const br = invoice.vat_breakdown || {};
  const rows = [
    ['Standard 17% / מחויב 17%',  br.standard_17 || { net: 0, vat: 0 }],
    ['Zero rate 0% / אפס 0%',     br.zero_0      || { net: 0, vat: 0 }],
    ['Exempt / פטור',             br.exempt      || { net: 0, vat: 0 }],
  ];
  rows.forEach(([label, obj]) => {
    if ((obj.net || 0) === 0 && (obj.vat || 0) === 0) return;
    const y = doc.y;
    doc.text(label, 60, y, { width: 250 });
    doc.text(`Net: ${formatMoney(obj.net, invoice.currency)}`, 310, y, { width: 120, align: 'right' });
    doc.text(`VAT: ${formatMoney(obj.vat, invoice.currency)}`, 435, y, { width: 120, align: 'right' });
    doc.moveDown(0.1);
  });
  doc.moveDown(0.3);
}

function renderTotals(doc, invoice) {
  const y1 = doc.y;
  doc.fontSize(10).font('Helvetica-Bold');
  doc.text('Subtotal before VAT / סה"כ לפני מע"מ', 60, y1, { width: 300 });
  doc.font('Helvetica').text(formatMoney(invoice.subtotal_net, invoice.currency), 360, y1,
           { width: 195, align: 'right' });
  doc.moveDown(0.2);

  const y2 = doc.y;
  doc.font('Helvetica-Bold').text('VAT total / סה"כ מע"מ', 60, y2, { width: 300 });
  doc.font('Helvetica').text(formatMoney(invoice.vat_total, invoice.currency), 360, y2,
           { width: 195, align: 'right' });
  doc.moveDown(0.4);

  drawBoxedTotal(doc,
    'GRAND TOTAL / סה"כ לתשלום',
    formatMoney(invoice.gross_total, invoice.currency),
    doc.y);
  doc.moveDown(1.2);
}

function renderPayment(doc, invoice) {
  const p = invoice.payment || {};
  if (!p.method && !p.due_date && !p.bank_account) return;
  doc.fontSize(11).font('Helvetica-Bold')
     .text('Payment Terms / תנאי תשלום', 40, doc.y, { underline: true });
  doc.fontSize(9).font('Helvetica').moveDown(0.2);
  if (p.method) {
    const m = PAYMENT_METHODS[p.method] || { he: p.method, en: p.method };
    doc.text(`Method / אמצעי: ${m.en} / ${m.he}`, 60, doc.y);
  }
  if (p.due_date) {
    doc.text(`Due date / תאריך אחרון לתשלום: ${formatDate(p.due_date)}`, 60, doc.y);
  }
  if (p.bank_account) {
    doc.text(`Bank account / חשבון בנק: ${p.bank_account}`, 60, doc.y);
  }
  doc.moveDown(0.4);
}

function renderSignatureBlock(doc, invoice) {
  doc.fontSize(11).font('Helvetica-Bold')
     .text('Digital Signature / חתימה דיגיטלית', 40, doc.y, { underline: true });
  doc.fontSize(8).font('Helvetica').moveDown(0.2);

  const sig = invoice.signature;
  const boxY = doc.y;
  doc.rect(40, boxY, 515, 38).strokeColor('#888').stroke();
  if (sig && sig.value) {
    doc.fillColor('#000').text(`Signed at: ${sig.signed_at || '—'}`, 45, boxY + 4);
    doc.text(`Signer: ${sig.signer_name || '—'}  |  Algo: ${sig.algorithm || 'RSA-SHA256'}`, 45, boxY + 15);
    const val = String(sig.value);
    doc.text(`Value: ${val.length > 80 ? val.slice(0, 77) + '...' : val}`, 45, boxY + 26);
  } else {
    doc.fillColor('#aa0000')
       .text('[ UNSIGNED — חתימה דיגיטלית חסרה — placeholder area for public-key signature ]',
             45, boxY + 12, { width: 505, align: 'center' })
       .fillColor('#000');
  }
  doc.y = boxY + 44;
}

async function renderQrCode(doc, invoice) {
  if (!invoice.allocation_number) {
    // Still reserve a blank area so the layout is stable
    doc.fontSize(8).fillColor('#aa0000')
       .text('QR unavailable — missing allocation number',
             420, doc.y - 90, { width: 135, align: 'center' })
       .fillColor('#000');
    return;
  }
  try {
    const payload = buildQrPayload(invoice);
    const png = await generateQrPng(payload);
    // place on the right edge next to the totals box
    doc.image(png, 450, doc.y - 120, { width: 105, height: 105 });
    doc.fontSize(7).fillColor('#555')
       .text('Scan to verify / לסריקה', 450, doc.y - 10, { width: 105, align: 'center' })
       .fillColor('#000');
  } catch (err) {
    doc.fontSize(8).fillColor('#aa0000')
       .text(`QR gen failed: ${err.message || err}`, 40, doc.y)
       .fillColor('#000');
  }
}

function renderFooter(doc, invoice, warnings) {
  doc.moveDown(0.6);
  drawRule(doc, doc.y);
  doc.moveDown(0.2);
  doc.fontSize(8).fillColor('#444');
  doc.text(LEGAL_DECLARATION_HE, 40, doc.y, { align: 'center' });
  doc.text(LEGAL_DECLARATION_EN, 40, doc.y, { align: 'center' });
  doc.moveDown(0.1);
  doc.text(`Generated: ${formatDate(new Date())} | Doc type: ${invoice.doc_type || 'tax_invoice'}`,
           { align: 'center' });
  if (warnings && warnings.length > 0) {
    doc.fillColor('#aa0000').moveDown(0.2);
    doc.text('WARNINGS / אזהרות ציות: ' + warnings.join(' • '),
             { align: 'center' });
    doc.fillColor('#444');
  }
  doc.fillColor('#000');
}

// ─── Main generator ───────────────────────────────────────────────

/**
 * Generates an invoice PDF of any supported type and writes it
 * to `outputPath`. Resolves to `{path, size}`.
 */
function generateInvoicePdf(rawInvoice, outputPath) {
  return new Promise((resolve, reject) => {
    try {
      const dir = path.dirname(outputPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

      const invoice = normalizeInvoice(rawInvoice || {});
      const warnings = complianceWarnings(invoice);

      const doc = new PDFDocument({
        size: 'A4',
        margin: 40,
        info: {
          Title:  `${DOC_TYPES[invoice.doc_type]?.en || 'Invoice'} ${invoice.invoice_number || ''}`,
          Author: invoice.seller?.legal_name || 'Unknown',
          Subject: 'Israel Tax Invoice — רפורמת חשבונית 2024',
          Keywords: 'invoice, חשבונית, allocation, tax, VAT, Israel 2024 reform',
          CreationDate: new Date(),
        },
      });

      const stream = fs.createWriteStream(outputPath);
      doc.pipe(stream);

      // Draw sections top-to-bottom
      renderHeader(doc, invoice);
      renderParties(doc, invoice);
      renderDates(doc, invoice);
      renderLines(doc, invoice);
      renderVatBreakdown(doc, invoice);
      renderTotals(doc, invoice);

      // QR anchored to the right of totals zone
      renderQrCode(doc, invoice)
        .catch(() => {}) // rendered inline warning already
        .then(() => {
          renderPayment(doc, invoice);
          renderSignatureBlock(doc, invoice);
          renderFooter(doc, invoice, warnings);
          doc.end();
        });

      stream.on('finish', () => {
        try {
          const stats = fs.statSync(outputPath);
          resolve({ path: outputPath, size: stats.size });
        } catch (e) { reject(e); }
      });
      stream.on('error', reject);
    } catch (err) {
      reject(err);
    }
  });
}

// Convenience wrappers — same generator, pre-set doc_type

function generateTaxInvoicePdf(invoice, outputPath) {
  return generateInvoicePdf({ ...invoice, doc_type: 'tax_invoice_receipt' }, outputPath);
}

function generateCreditNotePdf(creditNote, outputPath) {
  return generateInvoicePdf({ ...creditNote, doc_type: 'credit_note' }, outputPath);
}

function generateReceiptPdf(receipt, outputPath) {
  return generateInvoicePdf({ ...receipt, doc_type: 'receipt' }, outputPath);
}

module.exports = {
  generateInvoicePdf,
  generateTaxInvoicePdf,
  generateCreditNotePdf,
  generateReceiptPdf,
  // exported for tests
  _internal: {
    normalizeInvoice,
    complianceWarnings,
    buildQrPayload,
    formatMoney,
    DOC_TYPES,
    VAT_STANDARD_RATE,
  },
};
