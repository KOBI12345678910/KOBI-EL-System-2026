/**
 * Management Dashboard PDF Generator — דוח הנהלה חודשי
 * Agent-61 — written 2026-04-11
 *
 * Generates a bilingual (Hebrew RTL + English label) monthly management
 * dashboard PDF for טכנו-קול עוזי בע"מ. Uses pdfkit — same shape as
 * src/payroll/pdf-generator.js.
 *
 * Layout:
 *   Page 1  Cover                — logo, period, company, generated at
 *   Page 2  Executive Summary    — 8 KPI tiles
 *   Page 3+ Revenue breakdown    — table + ASCII bar chart
 *           Expenses by category — table + ASCII bar chart
 *           Top 10 suppliers
 *           Top 10 customers
 *           Headcount trend
 *           Overdue invoices
 *           VAT liability
 *           Outstanding payments
 *           Critical alerts      — ניכוי במקור חסר, חתימות חסרות ...
 *
 * Every section is optional — if the corresponding field on `data` is
 * missing / empty, the section is skipped (no empty headers, no blank pages).
 *
 * Usage:
 *   const { generateManagementDashboardPDF } = require('./reports/management-dashboard-pdf');
 *   const { path, size } = await generateManagementDashboardPDF(data, 'out/mgmt.pdf');
 *
 * Constraints:
 *   - A4, margin 40, base font size 10
 *   - Pure pdfkit. No external templating.
 *   - Law: NEVER DELETE anything — additive only.
 */

'use strict';

const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const PAGE_WIDTH = 595.28;          // A4 width in pt
const PAGE_HEIGHT = 841.89;         // A4 height in pt
const MARGIN = 40;
const CONTENT_LEFT = MARGIN;
const CONTENT_RIGHT = PAGE_WIDTH - MARGIN;
const CONTENT_WIDTH = CONTENT_RIGHT - CONTENT_LEFT;
const BASE_FONT_SIZE = 10;

const MONTH_NAMES_HE = [
  '', 'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר',
];

const MONTH_NAMES_EN = [
  '', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// ─────────────────────────────────────────────────────────────
// Formatting helpers
// ─────────────────────────────────────────────────────────────

function formatMoney(n) {
  const num = Number(n || 0);
  return '₪ ' + num.toLocaleString('he-IL', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatMoneyShort(n) {
  const num = Number(n || 0);
  const abs = Math.abs(num);
  if (abs >= 1_000_000) return '₪ ' + (num / 1_000_000).toFixed(2) + 'M';
  if (abs >= 1_000) return '₪ ' + (num / 1_000).toFixed(1) + 'K';
  return '₪ ' + num.toFixed(0);
}

function formatInt(n) {
  const num = Number(n || 0);
  return num.toLocaleString('he-IL', { maximumFractionDigits: 0 });
}

function formatPct(n) {
  const num = Number(n || 0);
  return num.toFixed(1) + '%';
}

function formatDate(d) {
  if (!d) return '';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return String(d);
  return dt.toLocaleDateString('he-IL', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

function formatDateTime(d) {
  if (!d) return '';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return String(d);
  return dt.toLocaleString('he-IL', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function safeString(s, fallback = '') {
  if (s === null || s === undefined) return fallback;
  return String(s);
}

function hasData(arr) {
  return Array.isArray(arr) && arr.length > 0;
}

// ─────────────────────────────────────────────────────────────
// Low-level drawing helpers
// ─────────────────────────────────────────────────────────────

/**
 * Ensure there's enough vertical room for `needed` points.
 * If not, add a new page. Returns the doc for chaining.
 */
function ensureRoom(doc, needed) {
  const bottom = PAGE_HEIGHT - MARGIN;
  if (doc.y + needed > bottom) {
    doc.addPage();
  }
  return doc;
}

/**
 * Draw a horizontal rule at the current y position.
 */
function hr(doc, color = '#cccccc') {
  const y = doc.y;
  doc.save();
  doc.strokeColor(color).lineWidth(0.5);
  doc.moveTo(CONTENT_LEFT, y).lineTo(CONTENT_RIGHT, y).stroke();
  doc.restore();
  doc.moveDown(0.3);
}

/**
 * Bilingual section header. Expects bilingual strings as
 * "English / עברית" (we just render them verbatim — pdfkit handles RTL
 * runs inline as best it can).
 */
function sectionHeader(doc, en, he) {
  ensureRoom(doc, 40);
  doc.moveDown(0.6);
  doc.fontSize(13).fillColor('#1a365d').font('Helvetica-Bold');
  doc.text(`${en} / ${he}`, CONTENT_LEFT, doc.y, {
    width: CONTENT_WIDTH,
    align: 'left',
  });
  doc.fontSize(BASE_FONT_SIZE).fillColor('#000').font('Helvetica');
  doc.moveDown(0.2);
  hr(doc, '#1a365d');
}

/**
 * Two-column row: label on the left, value right-aligned on the right.
 */
function twoColRow(doc, label, value, opts = {}) {
  const { bold = false, color = '#000' } = opts;
  ensureRoom(doc, 16);
  const y = doc.y;
  if (bold) doc.font('Helvetica-Bold');
  doc.fillColor(color);
  doc.text(label, CONTENT_LEFT + 10, y, {
    width: CONTENT_WIDTH * 0.55,
    align: 'left',
    continued: false,
  });
  doc.text(value, CONTENT_LEFT + 10 + CONTENT_WIDTH * 0.55, y, {
    width: CONTENT_WIDTH * 0.4,
    align: 'right',
  });
  if (bold) doc.font('Helvetica');
  doc.fillColor('#000');
  doc.moveDown(0.15);
}

/**
 * ASCII-style bar chart built out of unicode block characters so we can
 * stay font-agnostic. Each row: label (left), value (right), bar below.
 *   maxChars: total width of bar area in characters
 */
function drawAsciiBarChart(doc, rows, opts = {}) {
  const { maxChars = 40, valueFormatter = formatMoneyShort } = opts;
  if (!hasData(rows)) return;
  const max = rows.reduce((m, r) => Math.max(m, Math.abs(Number(r.value || 0))), 0);
  if (max === 0) return;
  doc.font('Courier').fontSize(9);
  for (const row of rows) {
    ensureRoom(doc, 22);
    const v = Math.abs(Number(row.value || 0));
    const filled = Math.max(0, Math.round((v / max) * maxChars));
    const bar = '█'.repeat(filled) + '░'.repeat(Math.max(0, maxChars - filled));
    const label = safeString(row.label).padEnd(28, ' ').slice(0, 28);
    const valueStr = valueFormatter(row.value).padStart(12, ' ');
    doc.text(`${label} ${bar} ${valueStr}`, CONTENT_LEFT + 5, doc.y, {
      width: CONTENT_WIDTH - 5,
      align: 'left',
    });
  }
  doc.font('Helvetica').fontSize(BASE_FONT_SIZE);
  doc.moveDown(0.3);
}

/**
 * Simple table renderer. Columns: [{ label, key, width, align }]
 * widths sum can be any number — rescaled to CONTENT_WIDTH.
 */
function drawTable(doc, columns, rows, opts = {}) {
  const { headerFill = '#1a365d', headerText = '#ffffff', zebraFill = '#f5f5f5' } = opts;
  if (!hasData(rows)) return;

  const totalW = columns.reduce((s, c) => s + (c.width || 1), 0);
  const scale = CONTENT_WIDTH / totalW;
  const widths = columns.map((c) => (c.width || 1) * scale);
  const rowHeight = 16;

  // Header
  ensureRoom(doc, rowHeight * 3);
  const hy = doc.y;
  doc.save();
  doc.rect(CONTENT_LEFT, hy - 2, CONTENT_WIDTH, rowHeight).fill(headerFill);
  doc.restore();
  doc.fillColor(headerText).font('Helvetica-Bold').fontSize(9);
  let x = CONTENT_LEFT;
  for (let i = 0; i < columns.length; i++) {
    doc.text(columns[i].label, x + 3, hy + 2, {
      width: widths[i] - 6,
      align: columns[i].align || 'left',
    });
    x += widths[i];
  }
  doc.fillColor('#000').font('Helvetica').fontSize(9);
  doc.y = hy + rowHeight;

  // Rows
  for (let r = 0; r < rows.length; r++) {
    ensureRoom(doc, rowHeight + 4);
    const ry = doc.y;
    if (r % 2 === 1) {
      doc.save();
      doc.rect(CONTENT_LEFT, ry - 1, CONTENT_WIDTH, rowHeight).fill(zebraFill);
      doc.restore();
      doc.fillColor('#000');
    }
    let cx = CONTENT_LEFT;
    for (let i = 0; i < columns.length; i++) {
      const col = columns[i];
      const raw = rows[r][col.key];
      const text = col.format ? col.format(raw, rows[r]) : safeString(raw);
      doc.text(text, cx + 3, ry + 2, {
        width: widths[i] - 6,
        align: col.align || 'left',
      });
      cx += widths[i];
    }
    doc.y = ry + rowHeight;
  }
  doc.fontSize(BASE_FONT_SIZE);
  doc.moveDown(0.4);
}

/**
 * KPI tile — large number with a bilingual label underneath.
 * Returns the rect consumed.
 */
function drawKpiTile(doc, x, y, w, h, en, he, value, opts = {}) {
  const { fill = '#f0f5fa', stroke = '#1a365d', valueColor = '#1a365d' } = opts;
  doc.save();
  doc.rect(x, y, w, h).fillAndStroke(fill, stroke);
  doc.restore();
  doc.fillColor(valueColor).font('Helvetica-Bold').fontSize(16);
  doc.text(value, x + 6, y + 10, { width: w - 12, align: 'center' });
  doc.fillColor('#333').font('Helvetica').fontSize(8);
  doc.text(en, x + 6, y + 34, { width: w - 12, align: 'center' });
  doc.text(he, x + 6, y + 46, { width: w - 12, align: 'center' });
  doc.fillColor('#000');
}

// ─────────────────────────────────────────────────────────────
// Individual section renderers
// ─────────────────────────────────────────────────────────────

function renderCoverPage(doc, data) {
  const company = data.company || {};
  const period = data.period || {};

  // Logo placeholder — a simple rectangle with initials
  const logoX = (PAGE_WIDTH - 120) / 2;
  const logoY = 180;
  doc.save();
  doc.rect(logoX, logoY, 120, 120).fillAndStroke('#1a365d', '#0a1f3d');
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(28);
  doc.text('TK', logoX, logoY + 42, { width: 120, align: 'center' });
  doc.fontSize(10);
  doc.text('טכנו-קול', logoX, logoY + 78, { width: 120, align: 'center' });
  doc.restore();

  doc.fillColor('#000').font('Helvetica-Bold').fontSize(24);
  doc.text('Management Dashboard', CONTENT_LEFT, 330, {
    width: CONTENT_WIDTH,
    align: 'center',
  });
  doc.fontSize(20);
  doc.text('דוח הנהלה חודשי', CONTENT_LEFT, 360, {
    width: CONTENT_WIDTH,
    align: 'center',
  });

  doc.font('Helvetica').fontSize(16).fillColor('#1a365d');
  const companyName = safeString(company.legal_name, 'טכנו-קול עוזי בע"מ');
  doc.text(companyName, CONTENT_LEFT, 410, {
    width: CONTENT_WIDTH,
    align: 'center',
  });
  if (company.company_id) {
    doc.fontSize(11).fillColor('#555');
    doc.text(`Company ID / ח.פ: ${company.company_id}`, CONTENT_LEFT, 436, {
      width: CONTENT_WIDTH,
      align: 'center',
    });
  }

  // Period
  doc.fontSize(14).fillColor('#000');
  const month = Number(period.month || 0);
  const year = Number(period.year || new Date().getFullYear());
  const monthHe = MONTH_NAMES_HE[month] || '';
  const monthEn = MONTH_NAMES_EN[month] || '';
  const periodLabel = period.label || `${year}-${String(month).padStart(2, '0')}`;
  doc.text(
    `${monthEn} ${year}  /  ${monthHe} ${year}`,
    CONTENT_LEFT, 480,
    { width: CONTENT_WIDTH, align: 'center' },
  );
  doc.fontSize(11).fillColor('#666');
  doc.text(`Period / תקופה: ${periodLabel}`, CONTENT_LEFT, 502, {
    width: CONTENT_WIDTH,
    align: 'center',
  });

  // Generated at
  const generatedAt = data.generated_at || new Date();
  doc.fontSize(10).fillColor('#888');
  doc.text(
    `Generated / הופק: ${formatDateTime(generatedAt)}`,
    CONTENT_LEFT, 700,
    { width: CONTENT_WIDTH, align: 'center' },
  );
  doc.text(
    'CONFIDENTIAL — Internal management use only / סודי — לשימוש הנהלה בלבד',
    CONTENT_LEFT, 720,
    { width: CONTENT_WIDTH, align: 'center' },
  );
  doc.fillColor('#000');
}

function renderExecutiveSummary(doc, data) {
  if (!data.kpis) return;
  const k = data.kpis;

  doc.addPage();
  sectionHeader(doc, 'Executive Summary', 'תקציר מנהלים');

  // 8 KPIs: 4 columns x 2 rows
  const gap = 10;
  const cols = 4;
  const rows = 2;
  const tileW = (CONTENT_WIDTH - gap * (cols - 1)) / cols;
  const tileH = 70;
  const startX = CONTENT_LEFT;
  const startY = doc.y + 5;

  const tiles = [
    {
      en: 'Revenue', he: 'הכנסות',
      value: formatMoneyShort(k.revenue),
      fill: '#e6f4ea', stroke: '#137333', valueColor: '#137333',
    },
    {
      en: 'Expenses', he: 'הוצאות',
      value: formatMoneyShort(k.expenses),
      fill: '#fce8e6', stroke: '#a50e0e', valueColor: '#a50e0e',
    },
    {
      en: 'P&L', he: 'רווח / הפסד',
      value: formatMoneyShort(k.pnl),
      fill: (Number(k.pnl) >= 0 ? '#e6f4ea' : '#fce8e6'),
      stroke: (Number(k.pnl) >= 0 ? '#137333' : '#a50e0e'),
      valueColor: (Number(k.pnl) >= 0 ? '#137333' : '#a50e0e'),
    },
    {
      en: 'Headcount', he: 'מצבת עובדים',
      value: formatInt(k.headcount),
    },
    {
      en: 'Open POs', he: 'הזמנות פתוחות',
      value: formatInt(k.open_pos),
    },
    {
      en: 'Pending VAT', he: 'מע"מ לתשלום',
      value: formatMoneyShort(k.pending_vat),
      fill: '#fff4e5', stroke: '#b45309', valueColor: '#b45309',
    },
    {
      en: 'Cash Position', he: 'מצב מזומנים',
      value: formatMoneyShort(k.cash_position),
    },
    {
      en: 'AR / AP', he: 'חייבים / זכאים',
      value: `${formatMoneyShort(k.ar)} / ${formatMoneyShort(k.ap)}`,
    },
  ];

  for (let i = 0; i < tiles.length; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = startX + col * (tileW + gap);
    const y = startY + row * (tileH + gap);
    drawKpiTile(doc, x, y, tileW, tileH, tiles[i].en, tiles[i].he, tiles[i].value, tiles[i]);
  }

  doc.y = startY + rows * (tileH + gap) + 10;
}

function renderRevenueBreakdown(doc, data) {
  if (!hasData(data.revenue_breakdown)) return;
  sectionHeader(doc, 'Revenue Breakdown', 'פילוח הכנסות');

  drawAsciiBarChart(
    doc,
    data.revenue_breakdown.map((r) => ({ label: r.label, value: r.amount })),
    { valueFormatter: formatMoneyShort },
  );

  const total = data.revenue_breakdown.reduce((s, r) => s + Number(r.amount || 0), 0);
  drawTable(
    doc,
    [
      { label: 'Source / מקור', key: 'label', width: 3, align: 'left' },
      {
        label: 'Amount / סכום', key: 'amount', width: 2, align: 'right',
        format: (v) => formatMoney(v),
      },
      {
        label: 'Share / חלק', key: 'amount', width: 1, align: 'right',
        format: (v) => total > 0 ? formatPct((Number(v) / total) * 100) : '-',
      },
    ],
    data.revenue_breakdown,
  );
}

function renderExpensesBreakdown(doc, data) {
  if (!hasData(data.expenses_breakdown)) return;
  sectionHeader(doc, 'Expenses by Category', 'הוצאות לפי קטגוריה');

  drawAsciiBarChart(
    doc,
    data.expenses_breakdown.map((r) => ({ label: r.category, value: r.amount })),
    { valueFormatter: formatMoneyShort },
  );

  const total = data.expenses_breakdown.reduce((s, r) => s + Number(r.amount || 0), 0);
  drawTable(
    doc,
    [
      { label: 'Category / קטגוריה', key: 'category', width: 3, align: 'left' },
      {
        label: 'Amount / סכום', key: 'amount', width: 2, align: 'right',
        format: (v) => formatMoney(v),
      },
      {
        label: 'Share / חלק', key: 'amount', width: 1, align: 'right',
        format: (v) => total > 0 ? formatPct((Number(v) / total) * 100) : '-',
      },
    ],
    data.expenses_breakdown,
  );
}

function renderTopSuppliers(doc, data) {
  if (!hasData(data.top_suppliers)) return;
  sectionHeader(doc, 'Top 10 Suppliers', '10 הספקים המובילים');
  const rows = data.top_suppliers.slice(0, 10).map((r, i) => ({ rank: i + 1, ...r }));
  drawTable(
    doc,
    [
      { label: '#', key: 'rank', width: 0.4, align: 'center' },
      { label: 'Supplier / ספק', key: 'name', width: 3, align: 'left' },
      { label: 'Company ID / ח.פ', key: 'company_id', width: 1.2, align: 'left' },
      {
        label: 'Total / סה"כ', key: 'total', width: 1.6, align: 'right',
        format: (v) => formatMoney(v),
      },
      {
        label: 'Invoices / חשבוניות', key: 'invoice_count', width: 0.8, align: 'right',
        format: (v) => formatInt(v),
      },
    ],
    rows,
  );
}

function renderTopCustomers(doc, data) {
  if (!hasData(data.top_customers)) return;
  sectionHeader(doc, 'Top 10 Customers', '10 הלקוחות המובילים');
  const rows = data.top_customers.slice(0, 10).map((r, i) => ({ rank: i + 1, ...r }));
  drawTable(
    doc,
    [
      { label: '#', key: 'rank', width: 0.4, align: 'center' },
      { label: 'Customer / לקוח', key: 'name', width: 3, align: 'left' },
      { label: 'Company ID / ח.פ', key: 'company_id', width: 1.2, align: 'left' },
      {
        label: 'Revenue / הכנסה', key: 'total', width: 1.6, align: 'right',
        format: (v) => formatMoney(v),
      },
      {
        label: 'Invoices / חשבוניות', key: 'invoice_count', width: 0.8, align: 'right',
        format: (v) => formatInt(v),
      },
    ],
    rows,
  );
}

function renderHeadcountTrend(doc, data) {
  if (!hasData(data.headcount_trend)) return;
  sectionHeader(doc, 'Headcount Trend', 'מגמת מצבת עובדים');

  drawAsciiBarChart(
    doc,
    data.headcount_trend.map((r) => ({ label: r.period, value: r.headcount })),
    { valueFormatter: (v) => formatInt(v) + ' emp' },
  );

  drawTable(
    doc,
    [
      { label: 'Period / תקופה', key: 'period', width: 2, align: 'left' },
      {
        label: 'Headcount / מצבת', key: 'headcount', width: 1, align: 'right',
        format: (v) => formatInt(v),
      },
      {
        label: 'Joiners / נכנסים', key: 'joiners', width: 1, align: 'right',
        format: (v) => v != null ? formatInt(v) : '-',
      },
      {
        label: 'Leavers / עוזבים', key: 'leavers', width: 1, align: 'right',
        format: (v) => v != null ? formatInt(v) : '-',
      },
    ],
    data.headcount_trend,
  );
}

function renderOverdueInvoices(doc, data) {
  if (!hasData(data.overdue_invoices)) return;
  sectionHeader(doc, 'Overdue Invoices', 'חשבוניות באיחור');
  drawTable(
    doc,
    [
      { label: 'Invoice # / מס\' חשבונית', key: 'invoice_number', width: 1.2, align: 'left' },
      { label: 'Customer / לקוח', key: 'customer', width: 2, align: 'left' },
      {
        label: 'Due Date / תאריך יעד', key: 'due_date', width: 1.2, align: 'left',
        format: (v) => formatDate(v),
      },
      {
        label: 'Days Late / ימי איחור', key: 'days_late', width: 0.8, align: 'right',
        format: (v) => formatInt(v),
      },
      {
        label: 'Amount / סכום', key: 'amount', width: 1.4, align: 'right',
        format: (v) => formatMoney(v),
      },
    ],
    data.overdue_invoices,
  );
}

function renderVatLiability(doc, data) {
  if (!data.vat_liability) return;
  const v = data.vat_liability;
  sectionHeader(doc, 'VAT Liability for the Month', 'חבות מע"מ לחודש');
  twoColRow(doc, 'Output VAT (sales) / מע"מ עסקאות', formatMoney(v.output_vat));
  twoColRow(doc, 'Input VAT (purchases) / מע"מ תשומות', formatMoney(v.input_vat));
  if (v.input_vat_fixed_assets != null) {
    twoColRow(doc, 'Input VAT — fixed assets / תשומות רכוש קבוע', formatMoney(v.input_vat_fixed_assets));
  }
  doc.moveDown(0.2);
  const net = Number(v.net_vat_due || 0);
  const netColor = net >= 0 ? '#a50e0e' : '#137333';
  twoColRow(
    doc,
    'Net VAT Due / מע"מ לתשלום נטו',
    formatMoney(net),
    { bold: true, color: netColor },
  );
  if (v.due_date) {
    doc.moveDown(0.2);
    twoColRow(doc, 'Payment due / תאריך תשלום', formatDate(v.due_date));
  }
  if (v.form_type) {
    twoColRow(doc, 'Form / טופס', safeString(v.form_type));
  }
  doc.moveDown(0.3);
}

function renderOutstandingPayments(doc, data) {
  if (!hasData(data.outstanding_payments)) return;
  sectionHeader(doc, 'Outstanding Payments', 'תשלומים פתוחים');
  drawTable(
    doc,
    [
      { label: 'Supplier / ספק', key: 'supplier', width: 2.2, align: 'left' },
      { label: 'Doc # / מס\' מסמך', key: 'doc_number', width: 1.2, align: 'left' },
      {
        label: 'Due Date / תאריך יעד', key: 'due_date', width: 1.2, align: 'left',
        format: (v) => formatDate(v),
      },
      {
        label: 'Amount / סכום', key: 'amount', width: 1.4, align: 'right',
        format: (v) => formatMoney(v),
      },
      { label: 'Status / סטטוס', key: 'status', width: 1, align: 'left' },
    ],
    data.outstanding_payments,
  );
}

function renderCriticalAlerts(doc, data) {
  if (!hasData(data.critical_alerts)) return;
  sectionHeader(doc, 'Critical Alerts', 'התראות קריטיות');

  doc.font('Helvetica').fontSize(9);
  for (const a of data.critical_alerts) {
    ensureRoom(doc, 36);
    const y = doc.y;
    const severity = safeString(a.severity, 'INFO').toUpperCase();
    const severityColor =
      severity === 'CRITICAL' ? '#a50e0e' :
      severity === 'HIGH' ? '#b45309' :
      severity === 'MEDIUM' ? '#8a6d0b' :
      '#666666';

    doc.save();
    doc.rect(CONTENT_LEFT, y, 6, 24).fill(severityColor);
    doc.restore();

    doc.fillColor(severityColor).font('Helvetica-Bold').fontSize(9);
    doc.text(`[${severity}]`, CONTENT_LEFT + 12, y + 2, { width: 80 });
    doc.fillColor('#000').font('Helvetica-Bold');
    doc.text(safeString(a.title), CONTENT_LEFT + 95, y + 2, {
      width: CONTENT_WIDTH - 95,
    });
    doc.font('Helvetica').fillColor('#333');
    doc.text(safeString(a.message), CONTENT_LEFT + 95, y + 13, {
      width: CONTENT_WIDTH - 95,
    });
    if (a.count != null) {
      doc.fillColor('#666').fontSize(8);
      doc.text(`Count / כמות: ${formatInt(a.count)}`, CONTENT_LEFT + 95, y + 24, {
        width: CONTENT_WIDTH - 95,
      });
      doc.fontSize(9);
    }
    doc.fillColor('#000');
    doc.y = y + 34;
  }
  doc.fontSize(BASE_FONT_SIZE);
  doc.moveDown(0.3);
}

function renderFooter(doc, data) {
  // Stamp page numbers + report tag on every page.
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    const bottom = PAGE_HEIGHT - MARGIN + 5;
    doc.save();
    doc.fontSize(8).fillColor('#888').font('Helvetica');
    const period = data.period || {};
    const periodLabel = period.label ||
      `${period.year || ''}-${String(period.month || '').padStart(2, '0')}`;
    doc.text(
      `Management Dashboard ${periodLabel}  |  ${safeString((data.company || {}).legal_name, 'טכנו-קול עוזי בע"מ')}  |  Page ${i + 1} / ${range.count}`,
      MARGIN, bottom,
      { width: CONTENT_WIDTH, align: 'center', lineBreak: false },
    );
    doc.restore();
  }
}

// ─────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────

/**
 * Generate a management dashboard PDF and write it to outputPath.
 *
 * @param {object} data  — see README / fixtures/sample-mgmt-data.json
 * @param {string} outputPath  — absolute or relative file path
 * @returns {Promise<{path: string, size: number}>}
 */
function generateManagementDashboardPDF(data, outputPath) {
  return new Promise((resolve, reject) => {
    try {
      if (!data || typeof data !== 'object') {
        return reject(new TypeError('data must be an object'));
      }
      if (!outputPath || typeof outputPath !== 'string') {
        return reject(new TypeError('outputPath must be a string'));
      }

      const dir = path.dirname(outputPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

      const period = data.period || {};
      const company = data.company || {};
      const periodLabel = period.label ||
        `${period.year || new Date().getFullYear()}-${String(period.month || 0).padStart(2, '0')}`;

      const doc = new PDFDocument({
        size: 'A4',
        margin: MARGIN,
        bufferPages: true,
        info: {
          Title: `Management Dashboard ${periodLabel}`,
          Author: safeString(company.legal_name, 'טכנו-קול עוזי בע"מ'),
          Subject: 'Monthly Management Dashboard / דוח הנהלה חודשי',
          Keywords: 'management, dashboard, kpi, דוח הנהלה, טכנו-קול',
          CreationDate: new Date(),
        },
      });

      doc.fontSize(BASE_FONT_SIZE);

      const stream = fs.createWriteStream(outputPath);
      doc.pipe(stream);

      // ── Cover ──
      renderCoverPage(doc, data);

      // ── Executive Summary ──
      renderExecutiveSummary(doc, data);

      // ── Detail sections ── (each one self-guards on empty data)
      renderRevenueBreakdown(doc, data);
      renderExpensesBreakdown(doc, data);
      renderTopSuppliers(doc, data);
      renderTopCustomers(doc, data);
      renderHeadcountTrend(doc, data);
      renderOverdueInvoices(doc, data);
      renderVatLiability(doc, data);
      renderOutstandingPayments(doc, data);
      renderCriticalAlerts(doc, data);

      // ── Footer on every page ──
      renderFooter(doc, data);

      doc.end();

      stream.on('finish', () => {
        try {
          const stats = fs.statSync(outputPath);
          resolve({ path: outputPath, size: stats.size });
        } catch (err) {
          reject(err);
        }
      });
      stream.on('error', reject);
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = {
  generateManagementDashboardPDF,
  // Exposed for testing / reuse
  _internals: {
    formatMoney,
    formatMoneyShort,
    formatInt,
    formatPct,
    formatDate,
    formatDateTime,
    drawAsciiBarChart,
    drawTable,
    drawKpiTile,
  },
};
