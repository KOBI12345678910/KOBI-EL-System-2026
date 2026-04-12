/**
 * Profit & Loss (P&L) Report Generator
 * Agent 62 — דוח רווח והפסד
 *
 * Generates monthly / quarterly / annual P&L reports in the Israeli
 * financial statement structure:
 *
 *   Revenue (הכנסות)
 *   - COGS (עלות המכר)
 *   = Gross Profit (רווח גולמי)
 *   - Operating Expenses (הוצאות תפעול)
 *   = EBIT / Operating Profit (רווח תפעולי)
 *   - Net Finance Expenses (הוצאות מימון נטו)
 *   = EBT / Pre-tax Profit (רווח לפני מס)
 *   - Corporate Tax 23% (מס חברות)
 *   = Net Income (רווח נקי)
 *
 * Outputs:
 *   - generatePNL(year, month, { supabase })     → structured JS object
 *   - generatePNLJson(data)                       → UI-ready JSON
 *   - generatePNLPdf(data, outputPath)            → PDF via pdfkit
 *   - generatePNLExcel(data, outputPath)          → SpreadsheetML 2003 XML (.xml/.xls)
 *
 * Every line in the report carries an `audit` array pointing to the
 * source transactions (invoice IDs, PO IDs, transaction IDs, etc.).
 *
 * IMPORTANT: This is a reference implementation. Before production use:
 *   1. Have a licensed CPA validate the account-to-line mapping.
 *   2. Cross-check against the company's chart of accounts (תקינה ישראלית).
 *   3. Confirm the corporate tax rate for the fiscal year
 *      (ISR corporate tax has been 23% since 2018, but verify).
 */

'use strict';

const fs = require('fs');
const path = require('path');

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

/** Corporate tax rate in Israel — 23% since 2018. */
const CORPORATE_TAX_RATE = 0.23;

/** Chart-of-accounts classification.
 *  Keys are account codes / categories; values are P&L sections. */
const ACCOUNT_MAP = {
  // Revenue (4xxx in many Israeli charts)
  revenue_sales: 'revenue.sales',
  revenue_services: 'revenue.services',
  revenue_other: 'revenue.other',

  // COGS (5xxx)
  cogs_raw_materials: 'cogs.rawMaterials',
  cogs_production_labor: 'cogs.productionLabor',
  cogs_depreciation: 'cogs.depreciation',
  cogs_subcontractors: 'cogs.subcontractors',
  cogs_other: 'cogs.other',

  // Operating (6xxx/7xxx)
  opex_salaries: 'operatingExpenses.salaries',
  opex_rent: 'operatingExpenses.rent',
  opex_marketing: 'operatingExpenses.marketing',
  opex_general: 'operatingExpenses.general',
  opex_depreciation: 'operatingExpenses.depreciation',

  // Finance (8xxx)
  finance_income: 'financeNet.income',
  finance_expense: 'financeNet.expense',
};

// ═══════════════════════════════════════════════════════════════════════════
// MONEY & FORMATTING HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/** Round money to 2 decimals to avoid binary float drift. */
function r2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/** Safe sum of numeric values. */
function sum(values) {
  return r2((values || []).reduce((a, b) => a + (Number(b) || 0), 0));
}

/** Percent change a → b, returns null when the base is zero. */
function pctChange(newVal, oldVal) {
  const a = Number(oldVal) || 0;
  const b = Number(newVal) || 0;
  if (a === 0) return null;
  return r2(((b - a) / Math.abs(a)) * 100);
}

/** Format money with ILS locale (always returns a string). */
function fmtILS(n) {
  const num = Number(n) || 0;
  return num.toLocaleString('he-IL', {
    style: 'currency',
    currency: 'ILS',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Escape text for inclusion inside an XML node. */
function xmlEscape(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// ═══════════════════════════════════════════════════════════════════════════
// PERIOD RESOLUTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Resolve a reporting period.
 *
 * @param {number} year     — 4-digit fiscal year (required).
 * @param {number|string|null} month — month 1..12, or 'Q1'..'Q4', or null for full year.
 * @returns {{ type: 'month'|'quarter'|'year', label, start, end, prevStart, prevEnd, yoyStart, yoyEnd }}
 */
function resolvePeriod(year, month) {
  if (!year || year < 1900 || year > 2200) {
    throw new Error('year must be a 4-digit number');
  }

  // Quarterly
  if (typeof month === 'string' && /^Q[1-4]$/i.test(month)) {
    const q = Number(month.slice(1));
    const startMonth = (q - 1) * 3 + 1;
    const endMonth = startMonth + 2;
    const start = new Date(Date.UTC(year, startMonth - 1, 1));
    const end = lastDayOfMonth(year, endMonth);
    return {
      type: 'quarter',
      label: `${year}-${month.toUpperCase()}`,
      start: isoDate(start),
      end: isoDate(end),
      prevStart: isoDate(new Date(Date.UTC(year, startMonth - 4, 1))),
      prevEnd: isoDate(lastDayOfMonth(year, endMonth - 3)),
      yoyStart: isoDate(new Date(Date.UTC(year - 1, startMonth - 1, 1))),
      yoyEnd: isoDate(lastDayOfMonth(year - 1, endMonth)),
    };
  }

  // Full year
  if (month == null) {
    return {
      type: 'year',
      label: String(year),
      start: `${year}-01-01`,
      end: `${year}-12-31`,
      prevStart: null,
      prevEnd: null,
      yoyStart: `${year - 1}-01-01`,
      yoyEnd: `${year - 1}-12-31`,
    };
  }

  // Monthly
  const m = Number(month);
  if (!Number.isInteger(m) || m < 1 || m > 12) {
    throw new Error('month must be 1..12, "Q1".."Q4", or null');
  }
  const start = new Date(Date.UTC(year, m - 1, 1));
  const end = lastDayOfMonth(year, m);
  const prevStart = new Date(Date.UTC(year, m - 2, 1));
  const prevEnd = lastDayOfMonth(year, m - 1);
  return {
    type: 'month',
    label: `${year}-${String(m).padStart(2, '0')}`,
    start: isoDate(start),
    end: isoDate(end),
    prevStart: isoDate(prevStart),
    prevEnd: isoDate(prevEnd),
    yoyStart: isoDate(new Date(Date.UTC(year - 1, m - 1, 1))),
    yoyEnd: isoDate(lastDayOfMonth(year - 1, m)),
  };
}

function lastDayOfMonth(year, month) {
  // month is 1..12 but may be out of range; Date normalizes it.
  // Day 0 of next month = last day of this month.
  return new Date(Date.UTC(year, month, 0));
}

function isoDate(d) {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

// ═══════════════════════════════════════════════════════════════════════════
// SUPABASE DATA LOADER
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Fetch raw P&L inputs from Supabase for a date range.
 * Gracefully returns empty arrays when a table is missing so that the
 * report can still render (with audit-trail gaps noted).
 */
async function loadPeriodData({ supabase, start, end }) {
  if (!supabase) {
    return {
      customerInvoices: [],
      supplierInvoices: [],
      payrollRuns: [],
      glEntries: [],
      transactions: [],
      warnings: ['no supabase client supplied — returning empty dataset'],
    };
  }

  const warnings = [];

  async function safeSelect(table, cols, fromCol = 'issue_date') {
    try {
      const { data, error } = await supabase
        .from(table)
        .select(cols)
        .gte(fromCol, start)
        .lte(fromCol, end);
      if (error) {
        warnings.push(`${table}: ${error.message}`);
        return [];
      }
      return data || [];
    } catch (err) {
      warnings.push(`${table}: ${err.message || String(err)}`);
      return [];
    }
  }

  const [customerInvoices, supplierInvoices, payrollRuns, glEntries, transactions] =
    await Promise.all([
      safeSelect(
        'customer_invoices',
        'id, invoice_number, issue_date, net_amount, status, revenue_category, project_id, customer_id',
        'issue_date',
      ),
      safeSelect(
        'tax_invoices',
        'id, invoice_number, issue_date, net_amount, status, direction, is_asset, category, counterparty_id, po_id',
        'issue_date',
      ),
      safeSelect(
        'payroll_runs',
        'id, period_month, gross_pay, employer_cost, category, employee_count',
        'period_month',
      ),
      safeSelect(
        'gl_entries',
        'id, entry_date, account_code, description, debit, credit, reference_type, reference_id',
        'entry_date',
      ),
      safeSelect(
        'transactions',
        'id, transaction_date, amount, category, description',
        'transaction_date',
      ),
    ]);

  return {
    customerInvoices,
    supplierInvoices,
    payrollRuns,
    glEntries,
    transactions,
    warnings,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// LINE BUILDERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * A single P&L line carrying an audit trail.
 * @typedef {Object} PNLLine
 * @property {string} code       — stable identifier (e.g. 'revenue.sales').
 * @property {string} label_he   — Hebrew label.
 * @property {string} label_en   — English label.
 * @property {number} amount     — signed amount in ILS.
 * @property {Array<{source: string, id: string, ref?: string, amount: number}>} audit
 */

function emptyLine(code, labelHe, labelEn) {
  return { code, label_he: labelHe, label_en: labelEn, amount: 0, audit: [] };
}

function addToLine(line, amount, auditEntry) {
  const n = Number(amount) || 0;
  line.amount = r2(line.amount + n);
  if (auditEntry) line.audit.push({ ...auditEntry, amount: n });
  return line;
}

/** Pick the revenue sub-category from an invoice row. */
function classifyRevenue(inv) {
  const cat = String(inv.revenue_category || '').toLowerCase();
  if (cat.includes('service') || cat === 'services') return 'services';
  if (cat.includes('other') || cat === 'misc') return 'other';
  return 'sales';
}

/** Pick the COGS / OpEx bucket for a supplier/tax invoice. */
function classifySupplierInvoice(inv) {
  const cat = String(inv.category || '').toLowerCase();
  if (inv.is_asset) return null; // capital — not P&L
  if (cat === 'raw_materials' || cat === 'materials') return 'cogs.rawMaterials';
  if (cat === 'subcontractors' || cat === 'subs') return 'cogs.subcontractors';
  if (cat === 'production' || cat === 'manufacturing') return 'cogs.other';
  if (cat === 'rent' || cat === 'lease') return 'operatingExpenses.rent';
  if (cat === 'marketing' || cat === 'advertising') return 'operatingExpenses.marketing';
  if (cat === 'general' || cat === 'office' || cat === 'admin')
    return 'operatingExpenses.general';
  if (cat === 'finance' || cat === 'interest') return 'financeNet.expense';
  // Fallback: treat as general OpEx
  return 'operatingExpenses.general';
}

/** Pick the bucket for a payroll run. */
function classifyPayroll(run) {
  const cat = String(run.category || '').toLowerCase();
  if (cat === 'production' || cat === 'factory' || cat === 'shop_floor')
    return 'cogs.productionLabor';
  return 'operatingExpenses.salaries';
}

// ═══════════════════════════════════════════════════════════════════════════
// CORE: computePNL — runs on in-memory data
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Compute a P&L structure from already-loaded data.
 * Exported so that test code can run without a Supabase client.
 */
function computePNL(data, { label = 'period', start = null, end = null } = {}) {
  const {
    customerInvoices = [],
    supplierInvoices = [],
    payrollRuns = [],
    glEntries = [],
    transactions = [],
  } = data || {};

  // --- Revenue ---------------------------------------------------------------
  const revSales = emptyLine('revenue.sales', 'מכירות', 'Sales');
  const revServices = emptyLine('revenue.services', 'שירותים', 'Services');
  const revOther = emptyLine('revenue.other', 'הכנסות אחרות', 'Other revenue');

  for (const inv of customerInvoices) {
    if (inv.status === 'voided' || inv.status === 'cancelled') continue;
    const amt = Number(inv.net_amount) || 0;
    const audit = {
      source: 'customer_invoice',
      id: inv.id,
      ref: inv.invoice_number,
    };
    const bucket = classifyRevenue(inv);
    if (bucket === 'services') addToLine(revServices, amt, audit);
    else if (bucket === 'other') addToLine(revOther, amt, audit);
    else addToLine(revSales, amt, audit);
  }

  // --- COGS ------------------------------------------------------------------
  const cogsRaw = emptyLine('cogs.rawMaterials', 'חומרי גלם', 'Raw materials');
  const cogsLabor = emptyLine('cogs.productionLabor', 'שכר ייצור', 'Production labor');
  const cogsDepr = emptyLine('cogs.depreciation', 'פחת ייצור', 'Production depreciation');
  const cogsSubs = emptyLine('cogs.subcontractors', 'קבלני משנה', 'Subcontractors');
  const cogsOther = emptyLine('cogs.other', 'עלויות ייצור אחרות', 'Other COGS');

  // --- Operating expenses ----------------------------------------------------
  const opexSalaries = emptyLine('operatingExpenses.salaries', 'שכר ונלוות', 'Salaries & benefits');
  const opexRent = emptyLine('operatingExpenses.rent', 'שכירות', 'Rent');
  const opexMarketing = emptyLine('operatingExpenses.marketing', 'שיווק ופרסום', 'Marketing & advertising');
  const opexGeneral = emptyLine('operatingExpenses.general', 'הוצאות כלליות', 'General & admin');
  const opexDepr = emptyLine('operatingExpenses.depreciation', 'פחת והפחתות', 'Depreciation & amortization');

  // --- Finance ---------------------------------------------------------------
  const finIncome = emptyLine('financeNet.income', 'הכנסות מימון', 'Finance income');
  const finExpense = emptyLine('financeNet.expense', 'הוצאות מימון', 'Finance expenses');

  const BUCKETS = {
    'cogs.rawMaterials': cogsRaw,
    'cogs.productionLabor': cogsLabor,
    'cogs.depreciation': cogsDepr,
    'cogs.subcontractors': cogsSubs,
    'cogs.other': cogsOther,
    'operatingExpenses.salaries': opexSalaries,
    'operatingExpenses.rent': opexRent,
    'operatingExpenses.marketing': opexMarketing,
    'operatingExpenses.general': opexGeneral,
    'operatingExpenses.depreciation': opexDepr,
    'financeNet.income': finIncome,
    'financeNet.expense': finExpense,
  };

  // Supplier / tax invoices
  for (const inv of supplierInvoices) {
    if (inv.status === 'voided' || inv.status === 'cancelled') continue;
    if (inv.direction && inv.direction !== 'input') continue; // skip outputs
    const bucket = classifySupplierInvoice(inv);
    if (!bucket) continue;
    const amt = Number(inv.net_amount) || 0;
    const audit = {
      source: 'supplier_invoice',
      id: inv.id,
      ref: inv.invoice_number,
      po_id: inv.po_id || null,
    };
    addToLine(BUCKETS[bucket], amt, audit);
  }

  // Payroll
  for (const run of payrollRuns) {
    const bucket = classifyPayroll(run);
    const amt = (Number(run.employer_cost) || Number(run.gross_pay) || 0);
    const audit = {
      source: 'payroll_run',
      id: run.id,
      ref: run.period_month,
    };
    addToLine(BUCKETS[bucket], amt, audit);
  }

  // Generic GL entries — routed via account_code if ACCOUNT_MAP has it.
  for (const e of glEntries) {
    const key = ACCOUNT_MAP[e.account_code];
    if (!key) continue;
    const delta = (Number(e.debit) || 0) - (Number(e.credit) || 0);
    const line =
      key === 'revenue.sales'
        ? revSales
        : key === 'revenue.services'
          ? revServices
          : key === 'revenue.other'
            ? revOther
            : BUCKETS[key];
    if (!line) continue;
    // Expense accounts are natural debits (+). Revenue accounts are natural credits (−).
    const isRevenue = key.startsWith('revenue.') || key === 'financeNet.income';
    const signed = isRevenue ? -delta : delta;
    addToLine(line, signed, {
      source: 'gl_entry',
      id: e.id,
      ref: e.reference_id || e.description,
      account: e.account_code,
    });
  }

  // Miscellaneous transactions can contribute to finance or general
  for (const t of transactions) {
    const cat = String(t.category || '').toLowerCase();
    if (cat === 'interest_expense' || cat === 'bank_fees')
      addToLine(finExpense, t.amount, {
        source: 'transaction',
        id: t.id,
        ref: t.description,
      });
    else if (cat === 'interest_income')
      addToLine(finIncome, t.amount, {
        source: 'transaction',
        id: t.id,
        ref: t.description,
      });
  }

  // --- Aggregates ------------------------------------------------------------
  const revenueLines = [revSales, revServices, revOther];
  const cogsLines = [cogsRaw, cogsLabor, cogsDepr, cogsSubs, cogsOther];
  const opexLines = [opexSalaries, opexRent, opexMarketing, opexGeneral, opexDepr];

  const totalRevenue = sum(revenueLines.map(l => l.amount));
  const totalCOGS = sum(cogsLines.map(l => l.amount));
  const grossProfit = r2(totalRevenue - totalCOGS);
  const totalOpEx = sum(opexLines.map(l => l.amount));
  const ebit = r2(grossProfit - totalOpEx);
  const netFinance = r2(finExpense.amount - finIncome.amount); // net expense
  const ebt = r2(ebit - netFinance);
  const taxProvision = ebt > 0 ? r2(ebt * CORPORATE_TAX_RATE) : 0;
  const netIncome = r2(ebt - taxProvision);

  const grossMargin = totalRevenue === 0 ? null : r2((grossProfit / totalRevenue) * 100);
  const operatingMargin = totalRevenue === 0 ? null : r2((ebit / totalRevenue) * 100);
  const netMargin = totalRevenue === 0 ? null : r2((netIncome / totalRevenue) * 100);

  return {
    meta: {
      label,
      start,
      end,
      currency: 'ILS',
      corporateTaxRate: CORPORATE_TAX_RATE,
      generatedAt: new Date().toISOString(),
    },
    revenue: {
      lines: revenueLines,
      total: totalRevenue,
    },
    cogs: {
      lines: cogsLines,
      total: totalCOGS,
    },
    grossProfit,
    grossMargin,
    operatingExpenses: {
      lines: opexLines,
      total: totalOpEx,
    },
    ebit,
    operatingMargin,
    financeNet: {
      income: finIncome,
      expense: finExpense,
      net: netFinance,
    },
    ebt,
    taxProvision,
    netIncome,
    netMargin,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// PUBLIC: generatePNL — queries Supabase then computes
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate a P&L report for `year` / `month`, including YoY and MoM comparisons.
 *
 * @param {number} year         — 4-digit year.
 * @param {number|string|null} month — month 1..12, 'Q1'..'Q4', or null for full year.
 * @param {{supabase?: object}} opts
 * @returns {Promise<object>}   — structured P&L + comparisons + warnings.
 */
async function generatePNL(year, month, { supabase } = {}) {
  const period = resolvePeriod(year, month);

  // Fetch current period
  const current = await loadPeriodData({ supabase, start: period.start, end: period.end });
  const currentPNL = computePNL(current, {
    label: period.label,
    start: period.start,
    end: period.end,
  });

  // Fetch previous period (MoM / QoQ) — skipped for full-year reports
  let previousPNL = null;
  if (period.prevStart && period.prevEnd) {
    const prev = await loadPeriodData({
      supabase,
      start: period.prevStart,
      end: period.prevEnd,
    });
    previousPNL = computePNL(prev, {
      label: `prev:${period.prevStart}..${period.prevEnd}`,
      start: period.prevStart,
      end: period.prevEnd,
    });
  }

  // Fetch year-ago period (YoY)
  let yoyPNL = null;
  if (period.yoyStart && period.yoyEnd) {
    const yoy = await loadPeriodData({
      supabase,
      start: period.yoyStart,
      end: period.yoyEnd,
    });
    yoyPNL = computePNL(yoy, {
      label: `yoy:${period.yoyStart}..${period.yoyEnd}`,
      start: period.yoyStart,
      end: period.yoyEnd,
    });
  }

  const comparisons = buildComparisons(currentPNL, previousPNL, yoyPNL);

  return {
    ...currentPNL,
    period,
    comparisons,
    warnings: [
      ...(current.warnings || []),
      ...(previousPNL ? [] : ['previous period comparison unavailable']),
      ...(yoyPNL ? [] : ['year-over-year comparison unavailable']),
    ],
  };
}

/**
 * Build percent-change comparisons for headline numbers.
 */
function buildComparisons(cur, prev, yoy) {
  const headline = ['revenue', 'cogs', 'grossProfit', 'operatingExpenses', 'ebit', 'ebt', 'netIncome'];
  const read = (p, k) => {
    if (!p) return null;
    if (k === 'revenue') return p.revenue.total;
    if (k === 'cogs') return p.cogs.total;
    if (k === 'operatingExpenses') return p.operatingExpenses.total;
    return p[k];
  };

  const out = { mom: {}, yoy: {} };
  for (const k of headline) {
    out.mom[k] = {
      current: read(cur, k),
      previous: read(prev, k),
      pct: pctChange(read(cur, k), read(prev, k)),
    };
    out.yoy[k] = {
      current: read(cur, k),
      previous: read(yoy, k),
      pct: pctChange(read(cur, k), read(yoy, k)),
    };
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════
// PUBLIC: generatePNLJson — UI-friendly JSON
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Flatten a P&L into a UI-ready JSON shape with display strings.
 * Keeps full audit trail and comparisons.
 */
function generatePNLJson(data) {
  if (!data) throw new Error('generatePNLJson: data is required');
  const section = (s) => ({
    total: s.total,
    totalFormatted: fmtILS(s.total),
    lines: s.lines.map(l => ({
      code: l.code,
      label: l.label_he,
      label_en: l.label_en,
      amount: l.amount,
      amountFormatted: fmtILS(l.amount),
      auditCount: l.audit.length,
      audit: l.audit,
    })),
  });

  return {
    version: '1.0',
    meta: data.meta,
    period: data.period || null,
    revenue: section(data.revenue),
    cogs: section(data.cogs),
    grossProfit: {
      amount: data.grossProfit,
      amountFormatted: fmtILS(data.grossProfit),
      margin: data.grossMargin,
    },
    operatingExpenses: section(data.operatingExpenses),
    ebit: {
      amount: data.ebit,
      amountFormatted: fmtILS(data.ebit),
      margin: data.operatingMargin,
    },
    financeNet: {
      incomeLine: {
        label: data.financeNet.income.label_he,
        amount: data.financeNet.income.amount,
        amountFormatted: fmtILS(data.financeNet.income.amount),
        audit: data.financeNet.income.audit,
      },
      expenseLine: {
        label: data.financeNet.expense.label_he,
        amount: data.financeNet.expense.amount,
        amountFormatted: fmtILS(data.financeNet.expense.amount),
        audit: data.financeNet.expense.audit,
      },
      net: data.financeNet.net,
      netFormatted: fmtILS(data.financeNet.net),
    },
    ebt: {
      amount: data.ebt,
      amountFormatted: fmtILS(data.ebt),
    },
    taxProvision: {
      amount: data.taxProvision,
      amountFormatted: fmtILS(data.taxProvision),
      rate: CORPORATE_TAX_RATE,
      ratePercent: `${(CORPORATE_TAX_RATE * 100).toFixed(0)}%`,
    },
    netIncome: {
      amount: data.netIncome,
      amountFormatted: fmtILS(data.netIncome),
      margin: data.netMargin,
    },
    comparisons: data.comparisons || null,
    warnings: data.warnings || [],
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// PUBLIC: generatePNLPdf — pdfkit
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Render a P&L report as PDF.
 * Returns a Promise that resolves to the outputPath once the file is flushed.
 */
function generatePNLPdf(data, outputPath) {
  if (!data) throw new Error('generatePNLPdf: data is required');
  if (!outputPath) throw new Error('generatePNLPdf: outputPath is required');

  // Lazy-require pdfkit so unit tests that don't touch PDF don't need it loaded.
  let PDFDocument;
  try {
    PDFDocument = require('pdfkit');
  } catch (err) {
    return Promise.reject(new Error(`pdfkit not available: ${err.message}`));
  }

  return new Promise((resolve, reject) => {
    try {
      ensureDir(path.dirname(outputPath));
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const stream = fs.createWriteStream(outputPath);
      doc.pipe(stream);

      // --- Title ---
      doc.fontSize(18).text('Profit & Loss Report', { align: 'center' });
      doc.moveDown(0.3);
      doc
        .fontSize(11)
        .fillColor('#555')
        .text(`Period: ${data.meta.label}  (${data.meta.start} — ${data.meta.end})`, {
          align: 'center',
        })
        .fillColor('black');
      doc.moveDown(1);

      const writeSection = (title, section) => {
        doc.fontSize(13).fillColor('#0b4a82').text(title).fillColor('black');
        doc.moveDown(0.2);
        doc.fontSize(10);
        for (const line of section.lines) {
          doc
            .text(`  ${line.label_en}`, { continued: true })
            .text(fmtILS(line.amount), { align: 'right' });
        }
        doc
          .font('Helvetica-Bold')
          .text(`  Total ${title}`, { continued: true })
          .text(fmtILS(section.total), { align: 'right' })
          .font('Helvetica');
        doc.moveDown(0.5);
      };

      const writeTotalLine = (label, amount, opts = {}) => {
        doc
          .font(opts.bold ? 'Helvetica-Bold' : 'Helvetica')
          .fontSize(11)
          .text(`  ${label}`, { continued: true })
          .text(fmtILS(amount), { align: 'right' })
          .font('Helvetica');
        doc.moveDown(0.3);
      };

      writeSection('Revenue', data.revenue);
      writeSection('Cost of Goods Sold', data.cogs);
      writeTotalLine('Gross Profit', data.grossProfit, { bold: true });
      doc.moveDown(0.4);

      writeSection('Operating Expenses', data.operatingExpenses);
      writeTotalLine('Operating Profit (EBIT)', data.ebit, { bold: true });
      doc.moveDown(0.4);

      writeTotalLine('Finance Income', -data.financeNet.income.amount);
      writeTotalLine('Finance Expense', data.financeNet.expense.amount);
      writeTotalLine('Net Finance Cost', data.financeNet.net);
      writeTotalLine('Profit Before Tax (EBT)', data.ebt, { bold: true });
      writeTotalLine(
        `Corporate Tax (${(CORPORATE_TAX_RATE * 100).toFixed(0)}%)`,
        data.taxProvision,
      );
      writeTotalLine('Net Income', data.netIncome, { bold: true });

      // --- Comparisons page ---
      if (data.comparisons) {
        doc.addPage();
        doc.fontSize(14).text('Comparisons', { align: 'center' });
        doc.moveDown(0.5);
        doc.fontSize(10);
        const keys = ['revenue', 'cogs', 'grossProfit', 'operatingExpenses', 'ebit', 'ebt', 'netIncome'];
        for (const k of keys) {
          const mom = data.comparisons.mom[k];
          const yoy = data.comparisons.yoy[k];
          doc.text(
            `  ${k.padEnd(20)}  MoM: ${pctStr(mom && mom.pct)}   YoY: ${pctStr(yoy && yoy.pct)}`,
          );
        }
      }

      // --- Audit trail page ---
      doc.addPage();
      doc.fontSize(14).text('Audit Trail', { align: 'center' });
      doc.moveDown(0.3);
      doc.fontSize(9);
      const allLines = [
        ...data.revenue.lines,
        ...data.cogs.lines,
        ...data.operatingExpenses.lines,
        data.financeNet.income,
        data.financeNet.expense,
      ];
      for (const line of allLines) {
        if (!line.audit.length) continue;
        doc
          .font('Helvetica-Bold')
          .text(`${line.code} — ${line.label_en}  (${fmtILS(line.amount)})`)
          .font('Helvetica');
        for (const a of line.audit) {
          doc.text(`    • ${a.source} ${a.ref || a.id}  →  ${fmtILS(a.amount)}`);
        }
        doc.moveDown(0.2);
      }

      doc.end();
      stream.on('finish', () => resolve(outputPath));
      stream.on('error', reject);
    } catch (err) {
      reject(err);
    }
  });
}

function pctStr(p) {
  if (p == null) return '   n/a ';
  const sign = p > 0 ? '+' : '';
  return `${sign}${p.toFixed(2)}%`;
}

// ═══════════════════════════════════════════════════════════════════════════
// PUBLIC: generatePNLExcel — SpreadsheetML 2003 XML
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Render a P&L report to an Excel-compatible XML (SpreadsheetML 2003).
 *
 * Chosen over true .xlsx because we do not ship a zip/xlsx library. Excel,
 * LibreOffice and Google Sheets all open SpreadsheetML XML directly.
 */
function generatePNLExcel(data, outputPath) {
  if (!data) throw new Error('generatePNLExcel: data is required');
  if (!outputPath) throw new Error('generatePNLExcel: outputPath is required');

  const rows = [];

  const headerRow = (cols) =>
    `<Row>${cols
      .map(
        (c) =>
          `<Cell ss:StyleID="Header"><Data ss:Type="String">${xmlEscape(c)}</Data></Cell>`,
      )
      .join('')}</Row>`;

  const dataRow = (label, amount, styleID = 'Default') =>
    `<Row><Cell ss:StyleID="${styleID}"><Data ss:Type="String">${xmlEscape(
      label,
    )}</Data></Cell><Cell ss:StyleID="${styleID}Money"><Data ss:Type="Number">${Number(
      amount,
    ).toFixed(2)}</Data></Cell></Row>`;

  const blankRow = () => `<Row></Row>`;

  // Header
  rows.push(headerRow(['Profit & Loss', data.meta.label]));
  rows.push(headerRow(['Period', `${data.meta.start} — ${data.meta.end}`]));
  rows.push(blankRow());

  // Revenue
  rows.push(headerRow(['Revenue (הכנסות)', '']));
  for (const l of data.revenue.lines) rows.push(dataRow(l.label_en, l.amount));
  rows.push(dataRow('Total Revenue', data.revenue.total, 'Total'));
  rows.push(blankRow());

  // COGS
  rows.push(headerRow(['Cost of Goods Sold (עלות המכר)', '']));
  for (const l of data.cogs.lines) rows.push(dataRow(l.label_en, l.amount));
  rows.push(dataRow('Total COGS', data.cogs.total, 'Total'));
  rows.push(blankRow());

  rows.push(dataRow('Gross Profit (רווח גולמי)', data.grossProfit, 'Total'));
  if (data.grossMargin != null)
    rows.push(dataRow('Gross Margin %', data.grossMargin));
  rows.push(blankRow());

  // Operating
  rows.push(headerRow(['Operating Expenses (הוצאות תפעול)', '']));
  for (const l of data.operatingExpenses.lines) rows.push(dataRow(l.label_en, l.amount));
  rows.push(dataRow('Total OpEx', data.operatingExpenses.total, 'Total'));
  rows.push(blankRow());

  rows.push(dataRow('Operating Profit / EBIT (רווח תפעולי)', data.ebit, 'Total'));
  if (data.operatingMargin != null)
    rows.push(dataRow('Operating Margin %', data.operatingMargin));
  rows.push(blankRow());

  // Finance
  rows.push(dataRow('Finance Income', data.financeNet.income.amount));
  rows.push(dataRow('Finance Expense', data.financeNet.expense.amount));
  rows.push(dataRow('Net Finance', data.financeNet.net, 'Total'));
  rows.push(blankRow());

  rows.push(dataRow('Profit Before Tax / EBT (רווח לפני מס)', data.ebt, 'Total'));
  rows.push(
    dataRow(
      `Corporate Tax ${(CORPORATE_TAX_RATE * 100).toFixed(0)}% (מס חברות)`,
      data.taxProvision,
    ),
  );
  rows.push(dataRow('Net Income (רווח נקי)', data.netIncome, 'Total'));
  if (data.netMargin != null) rows.push(dataRow('Net Margin %', data.netMargin));

  // Comparisons sheet content appended as extra rows
  let compRows = '';
  if (data.comparisons) {
    compRows += blankRow();
    compRows += headerRow(['Comparisons', '']);
    compRows += headerRow(['Metric', 'MoM %', 'YoY %']);
    for (const k of Object.keys(data.comparisons.mom)) {
      const mom = data.comparisons.mom[k];
      const yoy = data.comparisons.yoy[k];
      compRows += `<Row><Cell><Data ss:Type="String">${xmlEscape(k)}</Data></Cell><Cell><Data ss:Type="String">${pctStr(mom.pct)}</Data></Cell><Cell><Data ss:Type="String">${pctStr(yoy.pct)}</Data></Cell></Row>`;
    }
  }

  // Audit rows
  let auditRows = blankRow() + headerRow(['Audit Trail', '']);
  const allLines = [
    ...data.revenue.lines,
    ...data.cogs.lines,
    ...data.operatingExpenses.lines,
    data.financeNet.income,
    data.financeNet.expense,
  ];
  for (const line of allLines) {
    for (const a of line.audit) {
      auditRows += `<Row><Cell><Data ss:Type="String">${xmlEscape(line.code)}</Data></Cell><Cell><Data ss:Type="String">${xmlEscape(a.source + ' ' + (a.ref || a.id || ''))}</Data></Cell><Cell><Data ss:Type="Number">${Number(a.amount).toFixed(2)}</Data></Cell></Row>`;
    }
  }

  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<?mso-application progid="Excel.Sheet"?>\n' +
    '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" ' +
    'xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet" ' +
    'xmlns:x="urn:schemas-microsoft-com:office:excel">\n' +
    ' <Styles>\n' +
    '  <Style ss:ID="Default" ss:Name="Normal"><Font ss:FontName="Calibri" ss:Size="11"/></Style>\n' +
    '  <Style ss:ID="DefaultMoney"><NumberFormat ss:Format="#,##0.00"/></Style>\n' +
    '  <Style ss:ID="Header"><Font ss:Bold="1"/><Interior ss:Color="#D9E1F2" ss:Pattern="Solid"/></Style>\n' +
    '  <Style ss:ID="Total"><Font ss:Bold="1"/><Borders><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/></Borders></Style>\n' +
    '  <Style ss:ID="TotalMoney"><Font ss:Bold="1"/><NumberFormat ss:Format="#,##0.00"/><Borders><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/></Borders></Style>\n' +
    ' </Styles>\n' +
    ' <Worksheet ss:Name="P&amp;L">\n' +
    '  <Table>\n' +
    '   <Column ss:Width="280"/>\n' +
    '   <Column ss:Width="130"/>\n' +
    '   <Column ss:Width="130"/>\n' +
    rows.join('\n') +
    '\n' +
    compRows +
    '\n' +
    auditRows +
    '\n' +
    '  </Table>\n' +
    ' </Worksheet>\n' +
    '</Workbook>\n';

  ensureDir(path.dirname(outputPath));
  fs.writeFileSync(outputPath, xml, 'utf8');
  return outputPath;
}

// ═══════════════════════════════════════════════════════════════════════════
// Small utilities
// ═══════════════════════════════════════════════════════════════════════════

function ensureDir(dir) {
  if (!dir) return;
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

module.exports = {
  // public API
  generatePNL,
  generatePNLJson,
  generatePNLPdf,
  generatePNLExcel,
  // primitives / helpers exposed for tests
  computePNL,
  resolvePeriod,
  classifyRevenue,
  classifySupplierInvoice,
  classifyPayroll,
  pctChange,
  r2,
  sum,
  fmtILS,
  CORPORATE_TAX_RATE,
  ACCOUNT_MAP,
};
