/**
 * Quarterly Tax Compliance Report — דוח ציות מס רבעוני
 * Agent-64 — 2026-04-11
 *
 * Builds a deterministic, audit-grade quarterly tax compliance bundle for
 * an Israeli company covering the six statutory buckets:
 *
 *   1. מע"מ רבעוני             — VAT: 3 months rolled up, net payable/refund
 *   2. ניכוי במקור             — withholdings paid by the company (salaries,
 *                                 professional fees, services) grouped by code
 *   3. ביטוח לאומי             — employer national insurance obligation
 *   4. מקדמות מס הכנסה         — income tax advance payments paid / missing /
 *                                 overpaid
 *   5. מס שכר                 — wage tax derived from wage_slips totals
 *   6. התחייבויות עתידיות      — projected taxes due in next quarter
 *
 * Outputs:
 *   • generateQuarterlyTaxReport(year, quarter, { supabase }) — structured data
 *   • renderQuarterlyTaxJson(report)                          — API payload
 *   • renderQuarterlyTaxPdf(report, outputPath)               — Hebrew PDF
 *   • renderQuarterlyTaxCsv(report)                           — CSV for רו"ח
 *
 * Sanity checks embedded in the report:
 *   • Output-VAT on closed VAT periods ≥ VAT on output invoices
 *   • Withholding total ≤ total payments that had a withholding applied
 *   • No negative advance payments
 *   • No overdue remittances (late payment warning)
 *
 * Scheduled execution:
 *   • scheduleQuarterlyReport({ supabase, cron, outputDir }) — wires a
 *     post-quarter job that triggers generation + PDF archival + DB insert.
 *
 * Tables consulted (duck-typed; missing tables fall back to empty lists):
 *   company_tax_profile, vat_periods, tax_invoices, wage_slips,
 *   withholding_payments, advance_tax_payments, vendor_payments,
 *   quarterly_tax_reports (optional — written to if present)
 *
 * Constraints:
 *   • NO DELETIONS — additive file only.
 *   • Pure Node + pdfkit. No external SDKs.
 *   • All rendering bilingual (Hebrew + English) for accessibility.
 *   • 2026 statutory constants live in `CONSTANTS_2026` below.
 */

'use strict';

const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

// ═══════════════════════════════════════════════════════════════
// 2026 CONSTANTS — Israeli tax thresholds and remittance deadlines
// Sources:
//   - רשות המסים — מקדמות מס הכנסה (סעיף 175 פקודת מס הכנסה)
//   - ביטוח לאומי — תקנות התשלום
//   - חוק מע"מ 1975
//   - חוק ניכויים במקור (תקנה 2א)
// All values in NIS unless stated.
// ═══════════════════════════════════════════════════════════════

const CONSTANTS_2026 = {
  VAT_STANDARD_RATE: 0.17,                    // 17%
  CORPORATE_TAX_RATE: 0.23,                   // 23%

  // Withholding codes used by רשות המסים (partial list — extend as needed).
  // Each key is the deduction code; human-friendly label + default rate.
  WITHHOLDING_CODES: {
    '010': { label: 'שכר עבודה', label_en: 'Employment income', default_rate: null },
    '020': { label: 'שכר אמנים/מרצים', label_en: 'Artists / lecturers', default_rate: 0.35 },
    '030': { label: 'שכ"ט יועצים וחשבונאים', label_en: 'Professional fees', default_rate: 0.30 },
    '035': { label: 'שכ"ט עורכי דין', label_en: 'Legal fees', default_rate: 0.30 },
    '040': { label: 'שירותי עבודה (קבלנים)', label_en: 'Contractor services', default_rate: 0.30 },
    '050': { label: 'שירותי נכסים', label_en: 'Property rentals', default_rate: 0.35 },
    '060': { label: 'ריבית', label_en: 'Interest', default_rate: 0.25 },
    '070': { label: 'דיבידנד', label_en: 'Dividends', default_rate: 0.25 },
    '080': { label: 'תמלוגים', label_en: 'Royalties', default_rate: 0.30 },
    '090': { label: 'עמלות', label_en: 'Commissions', default_rate: 0.30 },
    '099': { label: 'אחר', label_en: 'Other', default_rate: 0.30 },
  },

  // Remittance deadlines — day of month in the month AFTER the quarter ends.
  // e.g. Q1 ends Mar 31, VAT remit by Apr 15 (15th of following month).
  REMITTANCE_DAYS: {
    vat: 15,                 // מע"מ — 15 of month after
    withholding: 15,         // ניכוי במקור — 15 of month after
    bituach_leumi: 15,       // ביטוח לאומי — 15 of month after
    income_tax_advance: 15,  // מקדמות — 15 of month after each month
    wage_tax: 15,            // מס שכר — 15 of month after
  },

  // Sanity thresholds — variance percentages beyond which the report emits
  // a WARNING. Tuned for a small-to-medium construction/procurement company.
  VARIANCE_WARN_PCT: 0.25,   // ±25% vs prior quarter average
  VARIANCE_CRIT_PCT: 0.50,   // ±50% → CRITICAL
  LATE_PAYMENT_DAYS: 3,      // grace period on remittance deadline

  MONEY_PRECISION: 2,
};

const MONTH_NAMES_HE = [
  '', 'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר',
];

const QUARTER_LABELS_HE = {
  1: 'רבעון ראשון (ינואר–מרץ)',
  2: 'רבעון שני (אפריל–יוני)',
  3: 'רבעון שלישי (יולי–ספטמבר)',
  4: 'רבעון רביעי (אוקטובר–דצמבר)',
};

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

function money(n) {
  const num = Number(n || 0);
  const factor = Math.pow(10, CONSTANTS_2026.MONEY_PRECISION);
  return Math.round(num * factor) / factor;
}

function formatMoney(n) {
  const num = Number(n || 0);
  return '₪ ' + num.toLocaleString('he-IL', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatPct(n) {
  return (Math.round(Number(n || 0) * 10000) / 100).toFixed(2) + '%';
}

function isoDate(d) {
  if (!d) return null;
  const dt = d instanceof Date ? d : new Date(d);
  if (isNaN(dt.getTime())) return null;
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatDateHe(d) {
  const iso = isoDate(d);
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('he-IL', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

/**
 * Return quarter boundaries as ISO strings.
 * Q1 = Jan 1 → Mar 31, etc.
 */
function quarterBounds(year, quarter) {
  if (![1, 2, 3, 4].includes(Number(quarter))) {
    throw new Error(`Invalid quarter: ${quarter}. Must be 1..4.`);
  }
  const q = Number(quarter);
  const startMonth = (q - 1) * 3 + 1;  // 1, 4, 7, 10
  const endMonth = startMonth + 2;      // 3, 6, 9, 12
  const start = `${year}-${String(startMonth).padStart(2, '0')}-01`;
  const endDt = new Date(year, endMonth, 0); // day 0 of next month = last day
  const end = isoDate(endDt);
  const months = [startMonth, startMonth + 1, startMonth + 2];
  return { start, end, months, year: Number(year), quarter: q };
}

function priorQuarter(year, quarter) {
  if (quarter === 1) return { year: year - 1, quarter: 4 };
  return { year, quarter: quarter - 1 };
}

function nextQuarter(year, quarter) {
  if (quarter === 4) return { year: year + 1, quarter: 1 };
  return { year, quarter: quarter + 1 };
}

/**
 * Safe Supabase SELECT — ignores missing tables.
 */
async function safeSelect(supabase, table, builder = (q) => q) {
  if (!supabase || typeof supabase.from !== 'function') return [];
  try {
    const q = supabase.from(table).select('*');
    const result = await builder(q);
    if (!result) return [];
    if (Array.isArray(result)) return result;
    if (Array.isArray(result.data)) return result.data;
    return [];
  } catch {
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════
// DATA LOADERS
// ═══════════════════════════════════════════════════════════════

async function loadCompanyProfile(supabase) {
  if (!supabase || typeof supabase.from !== 'function') return null;
  try {
    const r = await supabase.from('company_tax_profile').select('*').limit(1).maybeSingle();
    return r && r.data ? r.data : null;
  } catch {
    return null;
  }
}

async function loadVatPeriods(supabase, bounds) {
  const rows = await safeSelect(supabase, 'vat_periods', (q) => {
    if (typeof q.gte === 'function' && typeof q.lte === 'function') {
      return q.gte('period_start', bounds.start).lte('period_end', bounds.end);
    }
    return q;
  });
  return rows;
}

async function loadTaxInvoices(supabase, bounds) {
  const rows = await safeSelect(supabase, 'tax_invoices', (q) => {
    if (typeof q.gte === 'function' && typeof q.lte === 'function') {
      return q.gte('invoice_date', bounds.start).lte('invoice_date', bounds.end);
    }
    return q;
  });
  return rows;
}

async function loadWageSlips(supabase, bounds) {
  const rows = await safeSelect(supabase, 'wage_slips', (q) => {
    if (typeof q.gte === 'function' && typeof q.lte === 'function') {
      return q.gte('pay_date', bounds.start).lte('pay_date', bounds.end);
    }
    return q;
  });
  return rows;
}

async function loadWithholdingPayments(supabase, bounds) {
  const rows = await safeSelect(supabase, 'withholding_payments', (q) => {
    if (typeof q.gte === 'function' && typeof q.lte === 'function') {
      return q.gte('payment_date', bounds.start).lte('payment_date', bounds.end);
    }
    return q;
  });
  return rows;
}

async function loadAdvanceTaxPayments(supabase, bounds) {
  const rows = await safeSelect(supabase, 'advance_tax_payments', (q) => {
    if (typeof q.gte === 'function' && typeof q.lte === 'function') {
      return q.gte('payment_date', bounds.start).lte('payment_date', bounds.end);
    }
    return q;
  });
  return rows;
}

async function loadVendorPayments(supabase, bounds) {
  const rows = await safeSelect(supabase, 'vendor_payments', (q) => {
    if (typeof q.gte === 'function' && typeof q.lte === 'function') {
      return q.gte('payment_date', bounds.start).lte('payment_date', bounds.end);
    }
    return q;
  });
  return rows;
}

// ═══════════════════════════════════════════════════════════════
// SECTION BUILDERS
// ═══════════════════════════════════════════════════════════════

/**
 * SECTION 1 — מע"מ רבעוני
 *
 * Roll up the 3 months of VAT periods that fall inside this quarter.
 * Prefer the cached totals on `vat_periods` (written when each period was
 * closed). Fall back to computing from `tax_invoices` when a period is
 * still open (this keeps the report available mid-quarter).
 */
function buildVatSection(bounds, vatPeriods, taxInvoices) {
  // Sort periods chronologically
  const periods = (vatPeriods || [])
    .slice()
    .sort((a, b) => String(a.period_start).localeCompare(String(b.period_start)));

  const monthlyBreakdown = [];
  let totalOutputVat = 0;
  let totalInputVat = 0;
  let totalAssetVat = 0;
  let totalTaxableSales = 0;
  let totalZeroRateSales = 0;
  let totalExemptSales = 0;
  let totalTaxablePurchases = 0;
  let totalAssetPurchases = 0;

  for (const p of periods) {
    const row = {
      period_label: p.period_label || (p.period_start || '').slice(0, 7),
      period_start: p.period_start,
      period_end: p.period_end,
      status: p.status || 'unknown',
      taxable_sales: money(p.taxable_sales || 0),
      zero_rate_sales: money(p.zero_rate_sales || 0),
      exempt_sales: money(p.exempt_sales || 0),
      vat_on_sales: money(p.vat_on_sales || 0),
      taxable_purchases: money(p.taxable_purchases || 0),
      vat_on_purchases: money(p.vat_on_purchases || 0),
      asset_purchases: money(p.asset_purchases || 0),
      vat_on_assets: money(p.vat_on_assets || 0),
      net_vat_payable: money(p.net_vat_payable || 0),
      is_refund: Boolean(p.is_refund),
      submitted_at: p.submitted_at || null,
    };
    monthlyBreakdown.push(row);
    totalOutputVat += row.vat_on_sales;
    totalInputVat += row.vat_on_purchases;
    totalAssetVat += row.vat_on_assets;
    totalTaxableSales += row.taxable_sales;
    totalZeroRateSales += row.zero_rate_sales;
    totalExemptSales += row.exempt_sales;
    totalTaxablePurchases += row.taxable_purchases;
    totalAssetPurchases += row.asset_purchases;
  }

  // Fallback: if no period rows were stored, compute from invoices directly.
  let computedFromInvoices = false;
  if (monthlyBreakdown.length === 0 && (taxInvoices || []).length > 0) {
    computedFromInvoices = true;
    const outputs = taxInvoices.filter((i) => i.direction === 'output' && i.status !== 'voided');
    const inputs = taxInvoices.filter((i) => i.direction === 'input' && i.status !== 'voided');
    totalOutputVat = outputs.reduce((s, i) => s + Number(i.vat_amount || 0), 0);
    totalInputVat = inputs
      .filter((i) => !i.is_asset)
      .reduce((s, i) => s + Number(i.vat_amount || 0), 0);
    totalAssetVat = inputs
      .filter((i) => i.is_asset)
      .reduce((s, i) => s + Number(i.vat_amount || 0), 0);
    totalTaxableSales = outputs
      .filter((i) => !i.is_exempt && !i.is_zero_rate)
      .reduce((s, i) => s + Number(i.net_amount || 0), 0);
    totalZeroRateSales = outputs
      .filter((i) => i.is_zero_rate)
      .reduce((s, i) => s + Number(i.net_amount || 0), 0);
    totalExemptSales = outputs
      .filter((i) => i.is_exempt)
      .reduce((s, i) => s + Number(i.net_amount || 0), 0);
    totalTaxablePurchases = inputs
      .filter((i) => !i.is_asset)
      .reduce((s, i) => s + Number(i.net_amount || 0), 0);
    totalAssetPurchases = inputs
      .filter((i) => i.is_asset)
      .reduce((s, i) => s + Number(i.net_amount || 0), 0);
  }

  const netPayable = money(totalOutputVat - totalInputVat - totalAssetVat);

  // Output VAT from invoices — used in sanity check below.
  const invoiceOutputVat = (taxInvoices || [])
    .filter((i) => i.direction === 'output' && i.status !== 'voided')
    .reduce((s, i) => s + Number(i.vat_amount || 0), 0);

  return {
    kind: 'vat',
    label_he: 'מע"מ רבעוני',
    label_en: 'Quarterly VAT',
    months: monthlyBreakdown,
    totals: {
      taxable_sales: money(totalTaxableSales),
      zero_rate_sales: money(totalZeroRateSales),
      exempt_sales: money(totalExemptSales),
      vat_on_sales: money(totalOutputVat),
      taxable_purchases: money(totalTaxablePurchases),
      vat_on_purchases: money(totalInputVat),
      asset_purchases: money(totalAssetPurchases),
      vat_on_assets: money(totalAssetVat),
      net_vat_payable: netPayable,
      is_refund: netPayable < 0,
      invoice_output_vat: money(invoiceOutputVat),
    },
    computed_from_invoices: computedFromInvoices,
    period_count: monthlyBreakdown.length,
  };
}

/**
 * SECTION 2 — ניכוי במקור
 *
 * Aggregate withholdings the company applied and remitted. Groups by
 * withholding code so the רו"ח can see the breakdown per classification.
 *
 * Accepts rows from either:
 *   - withholding_payments  (preferred — dedicated table with code)
 *   - vendor_payments       (fallback — joins by tax_withheld column)
 *   - wage_slips            (fallback — bundles employment tax under code 010)
 */
function buildWithholdingSection(bounds, withholdingPayments, vendorPayments, wageSlips) {
  const byCode = {};

  function add(code, amount, baseAmount, source) {
    const key = String(code || '099');
    if (!byCode[key]) {
      const meta = CONSTANTS_2026.WITHHOLDING_CODES[key] ||
        CONSTANTS_2026.WITHHOLDING_CODES['099'];
      byCode[key] = {
        code: key,
        label_he: meta.label,
        label_en: meta.label_en,
        default_rate: meta.default_rate,
        total_withheld: 0,
        total_base: 0,
        payment_count: 0,
        sources: {},
      };
    }
    byCode[key].total_withheld += Number(amount || 0);
    byCode[key].total_base += Number(baseAmount || 0);
    byCode[key].payment_count += 1;
    byCode[key].sources[source] = (byCode[key].sources[source] || 0) + 1;
  }

  // Preferred source
  for (const p of withholdingPayments || []) {
    add(
      p.withholding_code || p.code || '099',
      p.amount_withheld || p.tax_withheld || 0,
      p.base_amount || p.gross_amount || 0,
      'withholding_payments'
    );
  }

  // Fallback — vendor_payments with a withheld column
  if ((withholdingPayments || []).length === 0) {
    for (const p of vendorPayments || []) {
      const withheld = Number(p.tax_withheld || p.withholding_amount || 0);
      if (withheld > 0) {
        add(
          p.withholding_code || p.service_type || '030',
          withheld,
          p.gross_amount || p.amount || 0,
          'vendor_payments'
        );
      }
    }
  }

  // Employment withholding — always code 010 from wage slips
  const wageTaxTotal = (wageSlips || []).reduce(
    (s, w) => s + Number(w.income_tax || 0),
    0
  );
  const wageGrossTotal = (wageSlips || []).reduce(
    (s, w) => s + Number(w.gross_pay || 0),
    0
  );
  if (wageTaxTotal > 0) {
    add('010', wageTaxTotal, wageGrossTotal, 'wage_slips');
  }

  const breakdown = Object.values(byCode).map((r) => ({
    code: r.code,
    label_he: r.label_he,
    label_en: r.label_en,
    total_withheld: money(r.total_withheld),
    total_base: money(r.total_base),
    effective_rate: r.total_base > 0
      ? Math.round((r.total_withheld / r.total_base) * 10000) / 10000
      : 0,
    default_rate: r.default_rate,
    payment_count: r.payment_count,
    sources: r.sources,
  }));
  breakdown.sort((a, b) => b.total_withheld - a.total_withheld);

  const totalWithheld = breakdown.reduce((s, r) => s + r.total_withheld, 0);
  const totalBase = breakdown.reduce((s, r) => s + r.total_base, 0);
  const totalVendorGross = (vendorPayments || []).reduce(
    (s, p) => s + Number(p.gross_amount || p.amount || 0),
    0
  );

  return {
    kind: 'withholding',
    label_he: 'ניכוי במקור',
    label_en: 'Withholding tax',
    breakdown,
    totals: {
      total_withheld: money(totalWithheld),
      total_base: money(totalBase),
      effective_rate: totalBase > 0
        ? Math.round((totalWithheld / totalBase) * 10000) / 10000
        : 0,
      code_count: breakdown.length,
      // For sanity check — the universe of payments that *could* have been withheld
      total_vendor_gross: money(totalVendorGross),
      total_wage_gross: money(wageGrossTotal),
    },
  };
}

/**
 * SECTION 3 — ביטוח לאומי (employer portion)
 *
 * Sum the employer-side Bituach Leumi contributions from wage slips for
 * all three months of the quarter.
 */
function buildBituachLeumiSection(bounds, wageSlips) {
  const monthlyTotals = {};
  let totalEmployer = 0;
  let totalEmployee = 0;
  let totalHealthEmployer = 0;
  let totalGross = 0;
  let employeeCount = new Set();

  for (const w of wageSlips || []) {
    const mKey = `${w.period_year}-${String(w.period_month).padStart(2, '0')}`;
    if (!monthlyTotals[mKey]) {
      monthlyTotals[mKey] = {
        month: mKey,
        bituach_leumi_employer: 0,
        bituach_leumi_employee: 0,
        health_tax_employer: 0,
        gross_pay: 0,
        slip_count: 0,
      };
    }
    monthlyTotals[mKey].bituach_leumi_employer += Number(w.bituach_leumi_employer || 0);
    monthlyTotals[mKey].bituach_leumi_employee += Number(w.bituach_leumi || 0);
    monthlyTotals[mKey].health_tax_employer += Number(w.health_tax_employer || 0);
    monthlyTotals[mKey].gross_pay += Number(w.gross_pay || 0);
    monthlyTotals[mKey].slip_count += 1;

    totalEmployer += Number(w.bituach_leumi_employer || 0);
    totalEmployee += Number(w.bituach_leumi || 0);
    totalHealthEmployer += Number(w.health_tax_employer || 0);
    totalGross += Number(w.gross_pay || 0);
    if (w.employee_id != null) employeeCount.add(w.employee_id);
  }

  const months = Object.values(monthlyTotals)
    .sort((a, b) => a.month.localeCompare(b.month))
    .map((m) => ({
      month: m.month,
      bituach_leumi_employer: money(m.bituach_leumi_employer),
      bituach_leumi_employee: money(m.bituach_leumi_employee),
      health_tax_employer: money(m.health_tax_employer),
      gross_pay: money(m.gross_pay),
      slip_count: m.slip_count,
    }));

  return {
    kind: 'bituach_leumi',
    label_he: 'ביטוח לאומי',
    label_en: 'National Insurance',
    months,
    totals: {
      bituach_leumi_employer: money(totalEmployer),
      bituach_leumi_employee: money(totalEmployee),
      health_tax_employer: money(totalHealthEmployer),
      gross_pay: money(totalGross),
      employer_total_obligation: money(totalEmployer + totalHealthEmployer),
      unique_employees: employeeCount.size,
      slip_count: (wageSlips || []).length,
    },
  };
}

/**
 * SECTION 4 — מקדמות מס הכנסה
 *
 * Reconciles advance tax payments the company was required to pay vs
 * what was actually paid. `advance_tax_payments` table schema:
 *   { month, year, required_amount, paid_amount, payment_date, status }
 *
 * If no rows exist, we back-fill by deriving required = revenue * advance_rate
 * (from company_tax_profile.advance_tax_rate) as a best-effort stub.
 */
function buildAdvanceTaxSection(bounds, advancePayments, vatSection, profile) {
  const required = {};
  const paid = {};

  for (const p of advancePayments || []) {
    const mKey = p.period_label ||
      (p.year && p.month ? `${p.year}-${String(p.month).padStart(2, '0')}` : p.month);
    if (!mKey) continue;
    required[mKey] = (required[mKey] || 0) + Number(p.required_amount || 0);
    paid[mKey] = (paid[mKey] || 0) + Number(p.paid_amount || p.amount || 0);
  }

  // If DB has no required amounts and we have a profile, fall back to
  // applying profile.advance_tax_rate against taxable sales per month.
  const rate = Number((profile && profile.advance_tax_rate) || 0);
  let derivedRequired = false;
  if (Object.keys(required).length === 0 && rate > 0 && vatSection && vatSection.months) {
    derivedRequired = true;
    for (const m of vatSection.months) {
      const key = m.period_label || (m.period_start || '').slice(0, 7);
      required[key] = (required[key] || 0) + Number(m.taxable_sales || 0) * rate;
    }
  }

  const allMonths = new Set([...Object.keys(required), ...Object.keys(paid)]);
  const monthlyReconciliation = Array.from(allMonths)
    .sort()
    .map((m) => {
      const req = Number(required[m] || 0);
      const pd = Number(paid[m] || 0);
      const variance = pd - req;
      return {
        month: m,
        required: money(req),
        paid: money(pd),
        variance: money(variance),
        status: Math.abs(variance) < 1
          ? 'balanced'
          : variance > 0
            ? 'overpaid'
            : 'underpaid',
      };
    });

  const totalRequired = monthlyReconciliation.reduce((s, r) => s + r.required, 0);
  const totalPaid = monthlyReconciliation.reduce((s, r) => s + r.paid, 0);
  const totalVariance = money(totalPaid - totalRequired);

  return {
    kind: 'advance_tax',
    label_he: 'מקדמות מס הכנסה',
    label_en: 'Income tax advances',
    monthly: monthlyReconciliation,
    derived_required: derivedRequired,
    advance_rate: rate,
    totals: {
      required: money(totalRequired),
      paid: money(totalPaid),
      variance: totalVariance,
      underpaid_amount: money(
        Math.max(0, totalRequired - totalPaid)
      ),
      overpaid_amount: money(
        Math.max(0, totalPaid - totalRequired)
      ),
    },
  };
}

/**
 * SECTION 5 — מס שכר (wage tax)
 *
 * Wage tax in Israel is a composite of income tax withheld + Bituach Leumi
 * employer portion + health tax employer portion, derived straight from
 * wage_slips. This section is the payroll-side summary (per-month) that
 * complements the annual 126 report.
 */
function buildWageTaxSection(bounds, wageSlips) {
  const monthly = {};
  let totalIncomeTax = 0;
  let totalBlEmployee = 0;
  let totalBlEmployer = 0;
  let totalHealthEmployee = 0;
  let totalHealthEmployer = 0;
  let totalPensionEmployer = 0;
  let totalGross = 0;
  let totalNet = 0;

  for (const w of wageSlips || []) {
    const mKey = `${w.period_year}-${String(w.period_month).padStart(2, '0')}`;
    if (!monthly[mKey]) {
      monthly[mKey] = {
        month: mKey,
        gross: 0,
        income_tax: 0,
        bituach_leumi_employee: 0,
        bituach_leumi_employer: 0,
        health_tax_employee: 0,
        health_tax_employer: 0,
        pension_employer: 0,
        net: 0,
        slip_count: 0,
      };
    }
    const m = monthly[mKey];
    m.gross += Number(w.gross_pay || 0);
    m.income_tax += Number(w.income_tax || 0);
    m.bituach_leumi_employee += Number(w.bituach_leumi || 0);
    m.bituach_leumi_employer += Number(w.bituach_leumi_employer || 0);
    m.health_tax_employee += Number(w.health_tax || 0);
    m.health_tax_employer += Number(w.health_tax_employer || 0);
    m.pension_employer += Number(w.pension_employer || 0);
    m.net += Number(w.net_pay || 0);
    m.slip_count += 1;

    totalGross += Number(w.gross_pay || 0);
    totalIncomeTax += Number(w.income_tax || 0);
    totalBlEmployee += Number(w.bituach_leumi || 0);
    totalBlEmployer += Number(w.bituach_leumi_employer || 0);
    totalHealthEmployee += Number(w.health_tax || 0);
    totalHealthEmployer += Number(w.health_tax_employer || 0);
    totalPensionEmployer += Number(w.pension_employer || 0);
    totalNet += Number(w.net_pay || 0);
  }

  const months = Object.values(monthly)
    .sort((a, b) => a.month.localeCompare(b.month))
    .map((m) => ({
      month: m.month,
      gross: money(m.gross),
      income_tax: money(m.income_tax),
      bituach_leumi_employee: money(m.bituach_leumi_employee),
      bituach_leumi_employer: money(m.bituach_leumi_employer),
      health_tax_employee: money(m.health_tax_employee),
      health_tax_employer: money(m.health_tax_employer),
      pension_employer: money(m.pension_employer),
      net: money(m.net),
      slip_count: m.slip_count,
    }));

  return {
    kind: 'wage_tax',
    label_he: 'מס שכר',
    label_en: 'Wage tax',
    months,
    totals: {
      gross: money(totalGross),
      income_tax: money(totalIncomeTax),
      bituach_leumi_employee: money(totalBlEmployee),
      bituach_leumi_employer: money(totalBlEmployer),
      health_tax_employee: money(totalHealthEmployee),
      health_tax_employer: money(totalHealthEmployer),
      pension_employer: money(totalPensionEmployer),
      net: money(totalNet),
      employer_total: money(totalBlEmployer + totalHealthEmployer + totalPensionEmployer),
      employee_deductions: money(
        totalIncomeTax + totalBlEmployee + totalHealthEmployee
      ),
      slip_count: (wageSlips || []).length,
    },
  };
}

/**
 * SECTION 6 — התחייבויות עתידיות
 *
 * Projects what the company will owe in the following quarter. This is a
 * deterministic projection: we take current-quarter run-rates and apply
 * deadlines from CONSTANTS_2026.REMITTANCE_DAYS.
 */
function buildFutureObligationsSection(bounds, sections) {
  const next = nextQuarter(bounds.year, bounds.quarter);
  const nextBounds = quarterBounds(next.year, next.quarter);

  // Run-rate projection — prior-quarter totals as the baseline for the
  // next quarter. Pessimistic caller can override via a scenario factor.
  const projections = [];

  // VAT — assume similar net VAT payable
  projections.push({
    kind: 'vat',
    label_he: 'מע"מ — רבעון הבא',
    label_en: 'Next-quarter VAT',
    projected_amount: money(Math.abs(sections.vat.totals.net_vat_payable)),
    direction: sections.vat.totals.is_refund ? 'refund' : 'payable',
    due_dates: nextBounds.months.map((m) => {
      const remitMonth = m === 12 ? 1 : m + 1;
      const remitYear = m === 12 ? nextBounds.year + 1 : nextBounds.year;
      return `${remitYear}-${String(remitMonth).padStart(2, '0')}-${String(CONSTANTS_2026.REMITTANCE_DAYS.vat).padStart(2, '0')}`;
    }),
  });

  // Withholding — projected at same run-rate
  projections.push({
    kind: 'withholding',
    label_he: 'ניכוי במקור — רבעון הבא',
    label_en: 'Next-quarter withholding',
    projected_amount: money(sections.withholding.totals.total_withheld),
    direction: 'payable',
    due_dates: nextBounds.months.map((m) => {
      const remitMonth = m === 12 ? 1 : m + 1;
      const remitYear = m === 12 ? nextBounds.year + 1 : nextBounds.year;
      return `${remitYear}-${String(remitMonth).padStart(2, '0')}-${String(CONSTANTS_2026.REMITTANCE_DAYS.withholding).padStart(2, '0')}`;
    }),
  });

  // Bituach Leumi employer
  projections.push({
    kind: 'bituach_leumi',
    label_he: 'ביטוח לאומי — רבעון הבא',
    label_en: 'Next-quarter national insurance',
    projected_amount: money(sections.bituach_leumi.totals.employer_total_obligation),
    direction: 'payable',
    due_dates: nextBounds.months.map((m) => {
      const remitMonth = m === 12 ? 1 : m + 1;
      const remitYear = m === 12 ? nextBounds.year + 1 : nextBounds.year;
      return `${remitYear}-${String(remitMonth).padStart(2, '0')}-${String(CONSTANTS_2026.REMITTANCE_DAYS.bituach_leumi).padStart(2, '0')}`;
    }),
  });

  // Advance income tax
  projections.push({
    kind: 'income_tax_advance',
    label_he: 'מקדמות מס הכנסה — רבעון הבא',
    label_en: 'Next-quarter income tax advances',
    projected_amount: money(sections.advance_tax.totals.required),
    direction: 'payable',
    due_dates: nextBounds.months.map((m) => {
      const remitMonth = m === 12 ? 1 : m + 1;
      const remitYear = m === 12 ? nextBounds.year + 1 : nextBounds.year;
      return `${remitYear}-${String(remitMonth).padStart(2, '0')}-${String(CONSTANTS_2026.REMITTANCE_DAYS.income_tax_advance).padStart(2, '0')}`;
    }),
  });

  const totalProjected = projections.reduce(
    (s, p) => s + (p.direction === 'payable' ? p.projected_amount : 0),
    0
  );

  return {
    kind: 'future_obligations',
    label_he: 'התחייבויות עתידיות',
    label_en: 'Future obligations',
    next_quarter: {
      year: nextBounds.year,
      quarter: nextBounds.quarter,
      start: nextBounds.start,
      end: nextBounds.end,
    },
    projections,
    totals: {
      total_projected_payable: money(totalProjected),
    },
  };
}

// ═══════════════════════════════════════════════════════════════
// SANITY CHECKS & ALERTS
// ═══════════════════════════════════════════════════════════════

/**
 * Run deterministic sanity checks over the aggregated sections.
 * Each finding is { severity: 'OK'|'WARN'|'CRITICAL', code, message_he, message_en, details }.
 */
function runSanityChecks(report) {
  const findings = [];

  // CHECK 1 — Output VAT on periods ≥ Output VAT on invoices.
  // Rationale: period totals are the source of truth for submission; they
  // must cover every issued invoice or we have a missing/voided row.
  const vatTotals = report.sections.vat.totals;
  const saleVatPeriod = vatTotals.vat_on_sales;
  const saleVatInvoices = vatTotals.invoice_output_vat;
  if (saleVatInvoices > 0 && saleVatPeriod + 0.01 < saleVatInvoices) {
    findings.push({
      severity: 'CRITICAL',
      code: 'VAT_PERIOD_LT_INVOICES',
      message_he: `סך מע"מ מכר בתקופות (${formatMoney(saleVatPeriod)}) קטן מסך מע"מ בחשבוניות (${formatMoney(saleVatInvoices)})`,
      message_en: `Period output-VAT (${formatMoney(saleVatPeriod)}) is less than invoice output-VAT (${formatMoney(saleVatInvoices)})`,
      details: { saleVatPeriod, saleVatInvoices, diff: saleVatInvoices - saleVatPeriod },
    });
  } else {
    findings.push({
      severity: 'OK',
      code: 'VAT_PERIOD_GE_INVOICES',
      message_he: 'סך מע"מ מכר בתקופות ≥ סך מע"מ בחשבוניות',
      message_en: 'Period output-VAT is ≥ invoice output-VAT',
      details: { saleVatPeriod, saleVatInvoices },
    });
  }

  // CHECK 2 — Total withheld ≤ total payments that had withholding applied.
  // Rationale: a withholding cannot exceed the gross payment it was computed from.
  const wTotals = report.sections.withholding.totals;
  const maxPossibleBase = wTotals.total_vendor_gross + wTotals.total_wage_gross;
  if (wTotals.total_withheld > maxPossibleBase + 0.01 && maxPossibleBase > 0) {
    findings.push({
      severity: 'CRITICAL',
      code: 'WITHHOLDING_EXCEEDS_PAYMENTS',
      message_he: `סך ניכוי במקור (${formatMoney(wTotals.total_withheld)}) עולה על סך התשלומים (${formatMoney(maxPossibleBase)})`,
      message_en: `Total withholding (${formatMoney(wTotals.total_withheld)}) exceeds total payments (${formatMoney(maxPossibleBase)})`,
      details: {
        total_withheld: wTotals.total_withheld,
        max_possible_base: maxPossibleBase,
      },
    });
  } else {
    findings.push({
      severity: 'OK',
      code: 'WITHHOLDING_LE_PAYMENTS',
      message_he: 'סך ניכוי במקור ≤ סך התשלומים',
      message_en: 'Withholding total is within payment base',
      details: {
        total_withheld: wTotals.total_withheld,
        max_possible_base: maxPossibleBase,
      },
    });
  }

  // CHECK 3 — No negative advance payments. Advances cannot be negative;
  // refunds are posted separately against the income-tax account.
  const aTotals = report.sections.advance_tax.totals;
  const negRows = (report.sections.advance_tax.monthly || []).filter((r) => r.paid < 0 || r.required < 0);
  if (negRows.length) {
    findings.push({
      severity: 'CRITICAL',
      code: 'NEGATIVE_ADVANCE_PAYMENT',
      message_he: `זוהו מקדמות שליליות (${negRows.length})`,
      message_en: `${negRows.length} negative advance payment row(s) detected`,
      details: { rows: negRows },
    });
  } else {
    findings.push({
      severity: 'OK',
      code: 'ADVANCES_NON_NEGATIVE',
      message_he: 'כל המקדמות אינן שליליות',
      message_en: 'All advances are non-negative',
      details: { paid: aTotals.paid, required: aTotals.required },
    });
  }

  // CHECK 4 — Advance underpayment warning
  if (aTotals.underpaid_amount > 0) {
    const pct = aTotals.required > 0
      ? aTotals.underpaid_amount / aTotals.required
      : 0;
    const sev = pct >= CONSTANTS_2026.VARIANCE_CRIT_PCT
      ? 'CRITICAL'
      : pct >= CONSTANTS_2026.VARIANCE_WARN_PCT
        ? 'WARN'
        : 'WARN';
    findings.push({
      severity: sev,
      code: 'ADVANCE_UNDERPAID',
      message_he: `חוסר במקדמות: ${formatMoney(aTotals.underpaid_amount)} (${formatPct(pct)} מהנדרש)`,
      message_en: `Advance underpayment: ${formatMoney(aTotals.underpaid_amount)} (${formatPct(pct)} of required)`,
      details: {
        required: aTotals.required,
        paid: aTotals.paid,
        shortfall: aTotals.underpaid_amount,
        shortfall_pct: pct,
      },
    });
  }

  // CHECK 5 — Late VAT submissions within the quarter
  const lateVat = (report.sections.vat.months || []).filter((m) => {
    if (!m.submitted_at || !m.period_end) return false;
    const due = new Date(m.period_end);
    due.setMonth(due.getMonth() + 1);
    due.setDate(CONSTANTS_2026.REMITTANCE_DAYS.vat);
    const submitted = new Date(m.submitted_at);
    const graceMs = CONSTANTS_2026.LATE_PAYMENT_DAYS * 86400 * 1000;
    return submitted.getTime() > due.getTime() + graceMs;
  });
  if (lateVat.length) {
    findings.push({
      severity: 'WARN',
      code: 'LATE_VAT_SUBMISSION',
      message_he: `דיווחי מע"מ מאוחרים (${lateVat.length})`,
      message_en: `${lateVat.length} VAT submission(s) were filed late`,
      details: { periods: lateVat.map((m) => m.period_label) },
    });
  }

  // CHECK 6 — VAT gross revenue spike vs prior quarter average
  if (report.prior_quarter && report.prior_quarter.totals) {
    const prior = report.prior_quarter.totals.taxable_sales || 0;
    const curr = vatTotals.taxable_sales;
    if (prior > 0) {
      const variance = (curr - prior) / prior;
      if (Math.abs(variance) >= CONSTANTS_2026.VARIANCE_CRIT_PCT) {
        findings.push({
          severity: 'CRITICAL',
          code: 'REVENUE_VARIANCE_CRITICAL',
          message_he: `שינוי חריג בהכנסות: ${formatPct(variance)}`,
          message_en: `Critical revenue variance: ${formatPct(variance)}`,
          details: { prior, curr, variance_pct: variance },
        });
      } else if (Math.abs(variance) >= CONSTANTS_2026.VARIANCE_WARN_PCT) {
        findings.push({
          severity: 'WARN',
          code: 'REVENUE_VARIANCE_WARN',
          message_he: `שינוי משמעותי בהכנסות: ${formatPct(variance)}`,
          message_en: `Revenue variance above threshold: ${formatPct(variance)}`,
          details: { prior, curr, variance_pct: variance },
        });
      }
    }
  }

  return findings;
}

// ═══════════════════════════════════════════════════════════════
// MAIN ENTRY — generateQuarterlyTaxReport
// ═══════════════════════════════════════════════════════════════

/**
 * Build a Quarterly Tax Compliance Report.
 *
 * @param {number}   year        — fiscal year (e.g. 2026)
 * @param {number}   quarter     — 1..4
 * @param {Object}   opts
 * @param {Object}   opts.supabase — supabase client (duck-typed)
 * @param {boolean} [opts.includePriorQuarter=true] — load Q-1 for variance
 * @returns {Promise<Object>} the quarterly tax report
 */
async function generateQuarterlyTaxReport(year, quarter, opts = {}) {
  const { supabase, includePriorQuarter = true } = opts;
  if (!year || isNaN(Number(year))) throw new Error('year is required');
  if (!quarter || ![1, 2, 3, 4].includes(Number(quarter))) {
    throw new Error('quarter must be 1..4');
  }

  const bounds = quarterBounds(year, quarter);

  // 1) Load in parallel
  const [profile, vatPeriods, taxInvoices, wageSlips, withholdings, advances, vendorPayments] =
    await Promise.all([
      loadCompanyProfile(supabase),
      loadVatPeriods(supabase, bounds),
      loadTaxInvoices(supabase, bounds),
      loadWageSlips(supabase, bounds),
      loadWithholdingPayments(supabase, bounds),
      loadAdvanceTaxPayments(supabase, bounds),
      loadVendorPayments(supabase, bounds),
    ]);

  // 2) Build each section
  const vatSection = buildVatSection(bounds, vatPeriods, taxInvoices);
  const withholdingSection = buildWithholdingSection(
    bounds, withholdings, vendorPayments, wageSlips
  );
  const bituachSection = buildBituachLeumiSection(bounds, wageSlips);
  const advanceSection = buildAdvanceTaxSection(
    bounds, advances, vatSection, profile
  );
  const wageTaxSection = buildWageTaxSection(bounds, wageSlips);

  // 3) Prior-quarter (for variance checks)
  let priorQuarter = null;
  if (includePriorQuarter) {
    const prior = priorQuarter_compute(year, quarter);
    priorQuarter = prior;
    try {
      const priorBounds = quarterBounds(prior.year, prior.quarter);
      const [priorPeriods, priorInvoices] = await Promise.all([
        loadVatPeriods(supabase, priorBounds),
        loadTaxInvoices(supabase, priorBounds),
      ]);
      priorQuarter = {
        year: prior.year,
        quarter: prior.quarter,
        totals: buildVatSection(priorBounds, priorPeriods, priorInvoices).totals,
      };
    } catch {
      priorQuarter = { year: prior.year, quarter: prior.quarter, totals: null };
    }
  }

  // 4) Future obligations
  const sectionsForFuture = {
    vat: vatSection,
    withholding: withholdingSection,
    bituach_leumi: bituachSection,
    advance_tax: advanceSection,
    wage_tax: wageTaxSection,
  };
  const futureSection = buildFutureObligationsSection(bounds, sectionsForFuture);

  // 5) Assemble report
  const report = {
    generated_at: new Date().toISOString(),
    report_type: 'quarterly_tax_compliance',
    report_version: 'agent-64-v1',
    fiscal_year: bounds.year,
    quarter: bounds.quarter,
    period_label: `${bounds.year}-Q${bounds.quarter}`,
    period_label_he: QUARTER_LABELS_HE[bounds.quarter],
    period_start: bounds.start,
    period_end: bounds.end,
    company: profile ? {
      legal_name: profile.legal_name || profile.company_name || null,
      vat_file_number: profile.vat_file_number || null,
      tax_file_number: profile.tax_file_number || null,
      reporting_frequency: profile.reporting_frequency || null,
    } : null,
    sections: {
      vat: vatSection,
      withholding: withholdingSection,
      bituach_leumi: bituachSection,
      advance_tax: advanceSection,
      wage_tax: wageTaxSection,
      future_obligations: futureSection,
    },
    prior_quarter: priorQuarter,
    inputs_summary: {
      vat_period_count: (vatPeriods || []).length,
      tax_invoice_count: (taxInvoices || []).length,
      wage_slip_count: (wageSlips || []).length,
      withholding_payment_count: (withholdings || []).length,
      advance_payment_count: (advances || []).length,
      vendor_payment_count: (vendorPayments || []).length,
    },
  };

  // 6) Run sanity checks (must be after report is assembled)
  report.sanity_checks = runSanityChecks(report);
  report.alerts = report.sanity_checks.filter((f) => f.severity !== 'OK');
  report.status = report.sanity_checks.some((f) => f.severity === 'CRITICAL')
    ? 'needs_review'
    : report.sanity_checks.some((f) => f.severity === 'WARN')
      ? 'warnings'
      : 'clean';

  return report;
}

// Rename-proof helper that returns { year, quarter }
function priorQuarter_compute(year, quarter) {
  return priorQuarter(year, quarter);
}

// ═══════════════════════════════════════════════════════════════
// JSON RENDERER — API shape
// ═══════════════════════════════════════════════════════════════

function renderQuarterlyTaxJson(report) {
  if (!report) throw new Error('renderQuarterlyTaxJson: report is required');
  return {
    meta: {
      report_type: report.report_type,
      report_version: report.report_version,
      generated_at: report.generated_at,
      fiscal_year: report.fiscal_year,
      quarter: report.quarter,
      period_label: report.period_label,
      period_label_he: report.period_label_he,
      period_start: report.period_start,
      period_end: report.period_end,
      status: report.status,
    },
    company: report.company,
    sections: report.sections,
    sanity_checks: report.sanity_checks,
    alerts: report.alerts,
    inputs_summary: report.inputs_summary,
    prior_quarter: report.prior_quarter,
  };
}

// ═══════════════════════════════════════════════════════════════
// CSV RENDERER — flat per-section rows for רו"ח
// ═══════════════════════════════════════════════════════════════

/**
 * Build a CSV string with one row per line-item across all sections.
 * Columns: section, subsection, key, label_he, label_en, value, currency, notes.
 *
 * This format is friendly for import into Excel/Google Sheets for an
 * accountant to cross-check and annotate.
 */
function renderQuarterlyTaxCsv(report) {
  if (!report) throw new Error('renderQuarterlyTaxCsv: report is required');

  const rows = [];
  const header = ['section', 'subsection', 'key', 'label_he', 'label_en', 'value', 'currency', 'notes'];
  rows.push(header);

  function push(section, subsection, key, labelHe, labelEn, value, notes = '') {
    rows.push([
      section,
      subsection,
      key,
      labelHe,
      labelEn,
      formatNumeric(value),
      'ILS',
      notes,
    ]);
  }

  // Header metadata
  push('meta', '', 'period', report.period_label_he, report.period_label, '', '');
  push('meta', '', 'period_start', report.period_start, report.period_start, '', '');
  push('meta', '', 'period_end', report.period_end, report.period_end, '', '');
  push('meta', '', 'status', report.status, report.status, '', '');

  // VAT
  const v = report.sections.vat.totals;
  push('vat', 'totals', 'taxable_sales', 'מכר חייב', 'Taxable sales', v.taxable_sales);
  push('vat', 'totals', 'zero_rate_sales', 'מכר אפס', 'Zero-rate sales', v.zero_rate_sales);
  push('vat', 'totals', 'exempt_sales', 'מכר פטור', 'Exempt sales', v.exempt_sales);
  push('vat', 'totals', 'vat_on_sales', 'מע"מ עסקאות', 'Output VAT', v.vat_on_sales);
  push('vat', 'totals', 'taxable_purchases', 'תשומות חייבות', 'Taxable purchases', v.taxable_purchases);
  push('vat', 'totals', 'vat_on_purchases', 'מע"מ תשומות', 'Input VAT', v.vat_on_purchases);
  push('vat', 'totals', 'asset_purchases', 'תשומות רכוש קבוע', 'Asset purchases', v.asset_purchases);
  push('vat', 'totals', 'vat_on_assets', 'מע"מ רכוש קבוע', 'VAT on assets', v.vat_on_assets);
  push('vat', 'totals', 'net_vat_payable', 'יתרה לתשלום', 'Net VAT payable', v.net_vat_payable,
    v.is_refund ? 'refund' : '');
  for (const m of report.sections.vat.months) {
    push('vat', `month:${m.period_label}`, 'net_vat_payable',
      `${m.period_label} יתרה`, `${m.period_label} net`, m.net_vat_payable);
  }

  // Withholding
  const w = report.sections.withholding.totals;
  push('withholding', 'totals', 'total_withheld', 'סך ניכוי', 'Total withheld', w.total_withheld);
  push('withholding', 'totals', 'total_base', 'בסיס', 'Total base', w.total_base);
  push('withholding', 'totals', 'effective_rate', 'שיעור אפקטיבי', 'Effective rate',
    w.effective_rate, '(rate)');
  for (const b of report.sections.withholding.breakdown) {
    push('withholding', `code:${b.code}`, 'total_withheld', b.label_he, b.label_en, b.total_withheld);
  }

  // Bituach Leumi
  const bl = report.sections.bituach_leumi.totals;
  push('bituach_leumi', 'totals', 'employer_obligation', 'חובת מעסיק',
    'Employer obligation', bl.employer_total_obligation);
  push('bituach_leumi', 'totals', 'bituach_leumi_employer', 'ביטוח לאומי מעסיק',
    'Bituach Leumi employer', bl.bituach_leumi_employer);
  push('bituach_leumi', 'totals', 'health_tax_employer', 'מס בריאות מעסיק',
    'Health tax employer', bl.health_tax_employer);
  for (const m of report.sections.bituach_leumi.months) {
    push('bituach_leumi', `month:${m.month}`, 'employer_total',
      `${m.month} מעסיק`, `${m.month} employer`,
      m.bituach_leumi_employer + m.health_tax_employer);
  }

  // Advance tax
  const a = report.sections.advance_tax.totals;
  push('advance_tax', 'totals', 'required', 'מקדמה נדרשת', 'Required', a.required);
  push('advance_tax', 'totals', 'paid', 'מקדמה ששולמה', 'Paid', a.paid);
  push('advance_tax', 'totals', 'variance', 'פער', 'Variance', a.variance);
  push('advance_tax', 'totals', 'underpaid', 'חוסר', 'Underpaid', a.underpaid_amount);
  push('advance_tax', 'totals', 'overpaid', 'עודף', 'Overpaid', a.overpaid_amount);
  for (const r of report.sections.advance_tax.monthly) {
    push('advance_tax', `month:${r.month}`, 'required',
      `${r.month} נדרש`, `${r.month} required`, r.required);
    push('advance_tax', `month:${r.month}`, 'paid',
      `${r.month} שולם`, `${r.month} paid`, r.paid);
  }

  // Wage tax
  const wt = report.sections.wage_tax.totals;
  push('wage_tax', 'totals', 'gross', 'ברוטו', 'Gross', wt.gross);
  push('wage_tax', 'totals', 'income_tax', 'מס הכנסה', 'Income tax', wt.income_tax);
  push('wage_tax', 'totals', 'employer_total', 'חובת מעסיק',
    'Employer total', wt.employer_total);
  push('wage_tax', 'totals', 'employee_deductions', 'ניכויי עובדים',
    'Employee deductions', wt.employee_deductions);

  // Future obligations
  for (const p of report.sections.future_obligations.projections) {
    push('future', p.kind, 'projected_amount', p.label_he, p.label_en, p.projected_amount,
      p.due_dates ? `due:${p.due_dates.join('|')}` : '');
  }

  // Sanity checks
  for (const f of report.sanity_checks) {
    push('sanity', f.severity, f.code, f.message_he, f.message_en, '',
      JSON.stringify(f.details || {}));
  }

  return rows.map(csvRow).join('\n') + '\n';
}

function formatNumeric(v) {
  if (v === '' || v === null || v === undefined) return '';
  const n = Number(v);
  if (isNaN(n)) return String(v);
  return n.toFixed(2);
}

function csvRow(arr) {
  return arr
    .map((v) => {
      const s = v === null || v === undefined ? '' : String(v);
      if (/[",\n\r]/.test(s)) {
        return '"' + s.replace(/"/g, '""') + '"';
      }
      return s;
    })
    .join(',');
}

// ═══════════════════════════════════════════════════════════════
// PDF RENDERER — Hebrew bilingual A4
// ═══════════════════════════════════════════════════════════════

/**
 * Render a bilingual (Hebrew + English label) A4 PDF of the quarterly
 * tax compliance report. Writes to `outputPath` and resolves to
 * { path, size }.
 */
function renderQuarterlyTaxPdf(report, outputPath) {
  return new Promise((resolve, reject) => {
    if (!report) return reject(new Error('renderQuarterlyTaxPdf: report is required'));
    if (!outputPath) return reject(new Error('renderQuarterlyTaxPdf: outputPath is required'));
    try {
      const dir = path.dirname(outputPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

      const doc = new PDFDocument({
        size: 'A4',
        margin: 40,
        info: {
          Title: `דוח ציות מס רבעוני ${report.period_label}`,
          Author: (report.company && report.company.legal_name) || 'ONYX Finance',
          Subject: 'Quarterly Tax Compliance Report / דוח ציות מס רבעוני',
          Keywords: 'tax, vat, withholding, payroll, israel, quarterly',
          CreationDate: new Date(),
        },
      });
      const stream = fs.createWriteStream(outputPath);
      doc.pipe(stream);

      // ─── COVER / HEADER ─────────────────────────────────────────
      doc.fontSize(18).text('Quarterly Tax Compliance Report', { align: 'center' });
      doc.fontSize(14).text('דוח ציות מס רבעוני', { align: 'center' });
      doc.moveDown(0.3);
      doc.fontSize(12).text(
        `${report.period_label_he || report.period_label}  —  ${report.period_start} → ${report.period_end}`,
        { align: 'center' }
      );
      doc.moveDown();

      // Company header
      if (report.company) {
        doc.fontSize(10);
        if (report.company.legal_name) doc.text(`Company / חברה: ${report.company.legal_name}`);
        if (report.company.vat_file_number) doc.text(`VAT file / תיק מע"מ: ${report.company.vat_file_number}`);
        if (report.company.tax_file_number) doc.text(`Tax file / תיק ניכויים: ${report.company.tax_file_number}`);
        doc.text(`Status / סטטוס: ${report.status}`);
        doc.moveDown(0.5);
      }

      doc.moveTo(40, doc.y).lineTo(555, doc.y).stroke();
      doc.moveDown(0.5);

      // ─── SECTION 1 — VAT ────────────────────────────────────────
      drawSectionHeader(doc, '1. VAT / מע"מ');
      const v = report.sections.vat.totals;
      drawRow(doc, 'Taxable sales / מכר חייב', formatMoney(v.taxable_sales));
      drawRow(doc, 'Zero-rate sales / מכר אפס', formatMoney(v.zero_rate_sales));
      drawRow(doc, 'Exempt sales / מכר פטור', formatMoney(v.exempt_sales));
      drawRow(doc, 'Output VAT / מע"מ עסקאות', formatMoney(v.vat_on_sales));
      drawRow(doc, 'Taxable purchases / תשומות חייבות', formatMoney(v.taxable_purchases));
      drawRow(doc, 'Input VAT / מע"מ תשומות', formatMoney(v.vat_on_purchases));
      drawRow(doc, 'Asset purchases / תשומות רכוש קבוע', formatMoney(v.asset_purchases));
      drawRow(doc, 'VAT on assets / מע"מ רכוש קבוע', formatMoney(v.vat_on_assets));
      drawRow(
        doc,
        v.is_refund ? 'Net VAT refund / החזר מע"מ' : 'Net VAT payable / יתרת מע"מ לתשלום',
        formatMoney(Math.abs(v.net_vat_payable)),
        true
      );
      if (report.sections.vat.months && report.sections.vat.months.length) {
        doc.moveDown(0.3);
        doc.fontSize(9).fillColor('#555').text('Months breakdown / פירוט חודשים:');
        for (const m of report.sections.vat.months) {
          doc.text(
            `  ${m.period_label}: ${formatMoney(m.net_vat_payable)}` +
            (m.is_refund ? ' (refund)' : '') +
            ` [${m.status}]`
          );
        }
        doc.fillColor('#000').fontSize(10);
      }
      doc.moveDown(0.5);

      // ─── SECTION 2 — WITHHOLDING ────────────────────────────────
      drawSectionHeader(doc, '2. Withholding tax / ניכוי במקור');
      const w = report.sections.withholding;
      drawRow(doc, 'Total withheld / סך הניכוי', formatMoney(w.totals.total_withheld), true);
      drawRow(doc, 'Payment base / בסיס התשלומים', formatMoney(w.totals.total_base));
      drawRow(doc, 'Effective rate / שיעור אפקטיבי', formatPct(w.totals.effective_rate));
      if (w.breakdown && w.breakdown.length) {
        doc.moveDown(0.3);
        doc.fontSize(9).fillColor('#555').text('By code / לפי קוד:');
        for (const b of w.breakdown) {
          doc.text(
            `  [${b.code}] ${b.label_he} / ${b.label_en}: ` +
            `${formatMoney(b.total_withheld)} (base ${formatMoney(b.total_base)}, ${formatPct(b.effective_rate)})`
          );
        }
        doc.fillColor('#000').fontSize(10);
      }
      doc.moveDown(0.5);

      ensurePageSpace(doc, 180);

      // ─── SECTION 3 — BITUACH LEUMI ──────────────────────────────
      drawSectionHeader(doc, '3. National Insurance / ביטוח לאומי');
      const bl = report.sections.bituach_leumi.totals;
      drawRow(doc, 'Bituach Leumi employer / מעסיק', formatMoney(bl.bituach_leumi_employer));
      drawRow(doc, 'Health tax employer / מס בריאות מעסיק', formatMoney(bl.health_tax_employer));
      drawRow(doc, 'Employer total obligation / סך חובה', formatMoney(bl.employer_total_obligation), true);
      drawRow(doc, 'Gross pay / שכר ברוטו', formatMoney(bl.gross_pay));
      drawRow(doc, 'Employees / עובדים', String(bl.unique_employees));
      drawRow(doc, 'Wage slips / תלושים', String(bl.slip_count));
      doc.moveDown(0.5);

      // ─── SECTION 4 — ADVANCE TAX ────────────────────────────────
      drawSectionHeader(doc, '4. Income tax advances / מקדמות מס הכנסה');
      const a = report.sections.advance_tax.totals;
      drawRow(doc, 'Required / נדרש', formatMoney(a.required));
      drawRow(doc, 'Paid / שולם', formatMoney(a.paid));
      drawRow(doc, 'Variance / פער', formatMoney(a.variance), true);
      if (a.underpaid_amount > 0) {
        drawRow(doc, 'Underpayment / חוסר', formatMoney(a.underpaid_amount));
      }
      if (a.overpaid_amount > 0) {
        drawRow(doc, 'Overpayment / עודף', formatMoney(a.overpaid_amount));
      }
      if (report.sections.advance_tax.derived_required) {
        doc.fontSize(8).fillColor('#a60').text(
          'Note / הערה: required amounts derived from profile.advance_tax_rate because DB had no rows.'
        );
        doc.fontSize(10).fillColor('#000');
      }
      doc.moveDown(0.5);

      ensurePageSpace(doc, 160);

      // ─── SECTION 5 — WAGE TAX ───────────────────────────────────
      drawSectionHeader(doc, '5. Wage tax / מס שכר');
      const wt = report.sections.wage_tax.totals;
      drawRow(doc, 'Gross payroll / ברוטו', formatMoney(wt.gross));
      drawRow(doc, 'Income tax withheld / מס הכנסה', formatMoney(wt.income_tax));
      drawRow(doc, 'Employee deductions / ניכויי עובדים', formatMoney(wt.employee_deductions));
      drawRow(doc, 'Employer total / חובת מעסיק', formatMoney(wt.employer_total), true);
      drawRow(doc, 'Net payroll / נטו', formatMoney(wt.net));
      drawRow(doc, 'Slip count / תלושים', String(wt.slip_count));
      doc.moveDown(0.5);

      // ─── SECTION 6 — FUTURE OBLIGATIONS ─────────────────────────
      drawSectionHeader(doc, '6. Future obligations / התחייבויות עתידיות');
      const future = report.sections.future_obligations;
      drawRow(
        doc,
        `Next quarter / רבעון הבא`,
        `${future.next_quarter.year}-Q${future.next_quarter.quarter}`
      );
      for (const p of future.projections) {
        drawRow(doc, `  ${p.label_he}`, formatMoney(p.projected_amount));
      }
      drawRow(
        doc,
        'Total projected payable / סה"כ חזוי',
        formatMoney(future.totals.total_projected_payable),
        true
      );
      doc.moveDown(0.5);

      // ─── SANITY CHECKS & ALERTS ─────────────────────────────────
      if (report.sanity_checks && report.sanity_checks.length) {
        ensurePageSpace(doc, 200);
        drawSectionHeader(doc, 'Sanity checks / בדיקות תקינות');
        doc.fontSize(9);
        for (const f of report.sanity_checks) {
          const color = f.severity === 'CRITICAL'
            ? '#b00'
            : f.severity === 'WARN'
              ? '#a60'
              : '#070';
          doc.fillColor(color).text(`[${f.severity}] ${f.code}`);
          doc.fillColor('#000').text(`   ${f.message_he}`);
          doc.fillColor('#666').text(`   ${f.message_en}`);
          doc.moveDown(0.15);
        }
        doc.fillColor('#000').fontSize(10);
      }

      // ─── FOOTER ─────────────────────────────────────────────────
      doc.moveDown(1);
      doc.fontSize(8).fillColor('#666');
      doc.text(
        `Generated ${new Date().toISOString()} | ONYX Finance — Quarterly Tax Compliance`,
        { align: 'center' }
      );
      doc.text(
        'Methodology: deterministic rollup from vat_periods, tax_invoices, wage_slips, ' +
        'withholding_payments, advance_tax_payments. See docs/QUARTERLY_TAX.md.',
        { align: 'center' }
      );

      doc.end();

      stream.on('finish', () => {
        const stats = fs.statSync(outputPath);
        resolve({ path: outputPath, size: stats.size });
      });
      stream.on('error', reject);
    } catch (err) {
      reject(err);
    }
  });
}

function drawSectionHeader(doc, label) {
  doc.fontSize(12).fillColor('#000').text(label, { underline: true });
  doc.fontSize(10).moveDown(0.2);
}

function drawRow(doc, label, value, bold = false) {
  const y = doc.y;
  if (bold) doc.font('Helvetica-Bold');
  doc.text(label, 60, y, { width: 320, align: 'left', continued: false });
  doc.text(value, 380, y, { width: 175, align: 'right' });
  if (bold) doc.font('Helvetica');
  doc.moveDown(0.15);
}

function ensurePageSpace(doc, neededPts) {
  if (doc.y + neededPts > 780) {
    doc.addPage();
  }
}

// ═══════════════════════════════════════════════════════════════
// SCHEDULED EXECUTION — end-of-quarter automation hook
// ═══════════════════════════════════════════════════════════════

/**
 * Wire a scheduled job that generates the quarterly tax report at the
 * end of each quarter and archives the PDF + JSON.
 *
 * The caller owns the cron runner — we just return the handler, metadata,
 * and a schedule spec. Pass your preferred scheduler (node-cron,
 * bull, or a custom dispatcher). If `cron.schedule` is provided, we
 * register the job immediately.
 *
 * @param {Object}   opts
 * @param {Object}   opts.supabase  — supabase client
 * @param {Object}  [opts.cron]     — optional cron runner with `schedule(expr, fn)`
 * @param {string}  [opts.outputDir='data/quarterly-tax'] — where to write PDFs
 * @param {Function} [opts.onComplete] — async callback(report) for side-effects
 * @returns {{ spec:string, handler:Function, meta:Object }}
 */
function scheduleQuarterlyReport(opts = {}) {
  const {
    supabase,
    cron,
    outputDir = path.join('data', 'quarterly-tax'),
    onComplete,
  } = opts;

  // Run on the 1st day of months following each quarter end (Apr, Jul, Oct, Jan)
  // at 03:00 local time. Format: "minute hour day month dow".
  const spec = '0 3 1 1,4,7,10 *';

  async function handler() {
    const now = new Date();
    // We ran on day 1 of month M; the quarter we report is the PRIOR quarter.
    const reportMonth = now.getMonth() === 0 ? 12 : now.getMonth();
    const reportYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
    const q = Math.ceil(reportMonth / 3);

    const report = await generateQuarterlyTaxReport(reportYear, q, { supabase });

    // Write PDF
    try {
      if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
      const pdfPath = path.join(
        outputDir,
        `quarterly-tax-${reportYear}-Q${q}.pdf`
      );
      await renderQuarterlyTaxPdf(report, pdfPath);

      // Write JSON sidecar
      const jsonPath = path.join(
        outputDir,
        `quarterly-tax-${reportYear}-Q${q}.json`
      );
      fs.writeFileSync(
        jsonPath,
        JSON.stringify(renderQuarterlyTaxJson(report), null, 2),
        'utf8'
      );

      // Optional CSV
      const csvPath = path.join(
        outputDir,
        `quarterly-tax-${reportYear}-Q${q}.csv`
      );
      fs.writeFileSync(csvPath, renderQuarterlyTaxCsv(report), 'utf8');

      // Persist to DB if the table exists (fire-and-forget, best-effort)
      if (supabase && typeof supabase.from === 'function') {
        try {
          await supabase.from('quarterly_tax_reports').insert({
            fiscal_year: reportYear,
            quarter: q,
            period_label: report.period_label,
            status: report.status,
            report_json: renderQuarterlyTaxJson(report),
            pdf_path: pdfPath,
            csv_path: csvPath,
            generated_at: report.generated_at,
            generated_by: 'scheduled:agent-64',
          });
        } catch {
          // ignore — table may not exist yet
        }
      }

      if (typeof onComplete === 'function') {
        await onComplete(report);
      }
      return { report, pdfPath, jsonPath, csvPath };
    } catch (err) {
      console.error('scheduleQuarterlyReport handler error:', err);
      throw err;
    }
  }

  // Register immediately if the caller provided a cron runner
  if (cron && typeof cron.schedule === 'function') {
    try {
      cron.schedule(spec, handler);
    } catch (err) {
      console.error('Failed to register quarterly-tax cron:', err);
    }
  }

  return {
    spec,
    handler,
    meta: {
      name: 'quarterly-tax-report',
      description: 'Generates Quarterly Tax Compliance Report at start of new quarter',
      next_runs: [
        // Deterministic upcoming runs — calendar dates (JST of MRT = local)
        // These are informational only; the real scheduler honours `spec`.
        `${new Date().getFullYear()}-04-01T03:00`,
        `${new Date().getFullYear()}-07-01T03:00`,
        `${new Date().getFullYear()}-10-01T03:00`,
        `${new Date().getFullYear() + 1}-01-01T03:00`,
      ],
    },
  };
}

// ═══════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════

module.exports = {
  generateQuarterlyTaxReport,
  renderQuarterlyTaxJson,
  renderQuarterlyTaxCsv,
  renderQuarterlyTaxPdf,
  scheduleQuarterlyReport,
  // Exposed for tests & advanced callers
  _internals: {
    CONSTANTS_2026,
    QUARTER_LABELS_HE,
    quarterBounds,
    priorQuarter,
    nextQuarter,
    buildVatSection,
    buildWithholdingSection,
    buildBituachLeumiSection,
    buildAdvanceTaxSection,
    buildWageTaxSection,
    buildFutureObligationsSection,
    runSanityChecks,
    money,
    formatMoney,
    formatPct,
    csvRow,
    formatNumeric,
  },
};
