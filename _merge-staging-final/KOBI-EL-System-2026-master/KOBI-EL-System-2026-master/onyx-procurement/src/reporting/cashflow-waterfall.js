/**
 * Cash Flow Waterfall Visualizer — ויזואלייזר תזרים מזומנים מדורג
 * Agent Y-184 — 2026-04-11
 *
 * A deterministic cash-flow waterfall chart builder. Given a period (opening
 * balance + itemised operating / investing / financing components), it
 * produces an ordered list of waterfall "steps" and renders them as a
 * self-contained SVG document suitable for embedding in dashboards,
 * management reports, and board decks.
 *
 * Design philosophy:
 *   • Zero external dependencies — Node built-ins only
 *     (never delete, only upgrade — לא מוחקים רק משדרגים ומגדלים)
 *   • Bilingual labels (Hebrew + English) — every label is keyed in both
 *     languages, including Israeli-specific tax items (מס הכנסה, ביטוח לאומי,
 *     מע"מ / income tax payable, Bituach Leumi, VAT)
 *   • Palantir-inspired dark palette (#0b0d10 background, #13171c surface,
 *     #4a9eff accent) — positives render green (#4ade80), negatives red
 *     (#f87171), opening / closing balances use the accent blue
 *   • NIS-native formatting ("₪ 1,234,567.89") using he-IL locale
 *   • Both direct and indirect methods are supported. The indirect method
 *     expands net income → non-cash adjustments → working-capital changes →
 *     Israeli tax items → investing → financing → closing.
 *   • Append-only: no delete methods anywhere — snapshots are layered.
 *
 * Public API:
 *   const { CashFlowWaterfall } = require('./cashflow-waterfall');
 *   const wf = new CashFlowWaterfall({ method: 'indirect' });
 *   const report = wf.build(period);   // → { steps, totals, meta }
 *   const svg = wf.generateSVG(report); // → string (SVG document)
 *
 *   // Convenience one-shot:
 *   const svg2 = wf.buildAndRender(period);
 *
 * Period shape (all fields optional — missing values degrade to 0):
 *   {
 *     label: string,                       // e.g. "Q2 2026 / רבעון 2 2026"
 *     opening_balance: number,             // cash on hand at period start
 *     method: 'direct' | 'indirect',
 *
 *     // Indirect-method inputs
 *     net_income: number,                  // רווח נטו (can be negative)
 *     adjustments: {
 *       depreciation: number,              // פחת
 *       amortization: number,              // הפחתות
 *       stock_compensation: number,        // תגמול מבוסס מניות
 *       other_noncash: number,
 *     },
 *     working_capital: {
 *       ar_change: number,                 // Δ accounts receivable (negative = build)
 *       inventory_change: number,          // Δ inventory
 *       ap_change: number,                 // Δ accounts payable (positive = source)
 *       prepaid_change: number,
 *       accrued_change: number,
 *     },
 *     israeli_tax: {
 *       income_tax_payable: number,        // מס הכנסה — positive = tax accrued / paid
 *       bituach_leumi: number,             // ביטוח לאומי
 *       vat_payable: number,               // מע"מ — net VAT remitted
 *     },
 *
 *     // Direct-method operating inputs
 *     operating: Array<{ label_en, label_he, amount }>,
 *
 *     // Investing & financing — applied to both methods
 *     investing: Array<{ label_en, label_he, amount }>,
 *     financing: Array<{ label_en, label_he, amount }>,
 *   }
 *
 * Determinism contract:
 *   build(period) must produce identical output for identical inputs. No Date.now,
 *   no Math.random, no Object.keys(nonDeterministicMap) without sorting.
 *
 * RULES (from parent agent):
 *   • never delete — לא מוחקים
 *   • Node built-ins only
 *   • bilingual labels everywhere
 */

'use strict';

// ─── Palantir-inspired dark palette ────────────────────────────

const PALETTE = Object.freeze({
  background: '#0b0d10',
  surface: '#13171c',
  surfaceRaised: '#1a2028',
  grid: '#232a33',
  axis: '#3a4553',
  text: '#e6edf3',
  textMuted: '#8b95a3',
  accent: '#4a9eff',
  accentDim: '#2d6bc4',
  positive: '#4ade80',
  positiveDim: '#2c9d5c',
  negative: '#f87171',
  negativeDim: '#c14545',
  balance: '#4a9eff',
  warning: '#fbbf24',
});

// ─── Step kinds ────────────────────────────────────────────────

const STEP_KIND = Object.freeze({
  OPENING: 'opening',
  OPERATING: 'operating',
  ADJUSTMENT: 'adjustment',
  WORKING_CAPITAL: 'working_capital',
  ISRAELI_TAX: 'israeli_tax',
  INVESTING: 'investing',
  FINANCING: 'financing',
  SUBTOTAL: 'subtotal',
  CLOSING: 'closing',
});

// ─── Built-in bilingual labels (defaults) ──────────────────────

const LABELS = Object.freeze({
  opening: { en: 'Opening Balance', he: 'יתרת פתיחה' },
  closing: { en: 'Closing Balance', he: 'יתרת סגירה' },
  net_income: { en: 'Net Income', he: 'רווח נטו' },
  depreciation: { en: 'Depreciation', he: 'פחת' },
  amortization: { en: 'Amortization', he: 'הפחתות' },
  stock_compensation: { en: 'Stock Compensation', he: 'תגמול מבוסס מניות' },
  other_noncash: { en: 'Other Non-Cash', he: 'אחר לא-מזומן' },
  ar_change: { en: 'Δ Accounts Receivable', he: 'שינוי לקוחות' },
  inventory_change: { en: 'Δ Inventory', he: 'שינוי מלאי' },
  ap_change: { en: 'Δ Accounts Payable', he: 'שינוי ספקים' },
  prepaid_change: { en: 'Δ Prepaid Expenses', he: 'שינוי הוצ׳ מראש' },
  accrued_change: { en: 'Δ Accrued Expenses', he: 'שינוי הוצ׳ לשלם' },
  income_tax_payable: { en: 'Income Tax Payable', he: 'מס הכנסה לשלם' },
  bituach_leumi: { en: 'Bituach Leumi (BL)', he: 'ביטוח לאומי' },
  vat_payable: { en: 'VAT Payable', he: 'מע״מ לשלם' },
  subtotal_operating: { en: 'Operating Cash Flow', he: 'תזרים מפעילות' },
  subtotal_investing: { en: 'Investing Cash Flow', he: 'תזרים מהשקעות' },
  subtotal_financing: { en: 'Financing Cash Flow', he: 'תזרים מימון' },
  // Section headers
  sec_operating: { en: 'Operating', he: 'פעילות' },
  sec_investing: { en: 'Investing', he: 'השקעות' },
  sec_financing: { en: 'Financing', he: 'מימון' },
  chart_title: { en: 'Cash Flow Waterfall', he: 'תזרים מזומנים מדורג' },
});

// ─── Utilities ─────────────────────────────────────────────────

function money(n) {
  const num = Number(n);
  if (!Number.isFinite(num)) return 0;
  return Math.round(num * 100) / 100;
}

function formatNIS(n) {
  const num = Number(n || 0);
  const abs = Math.abs(num);
  const sign = num < 0 ? '-' : '';
  // he-IL locale for proper NIS grouping ("1,234,567.89").
  const body = abs.toLocaleString('he-IL', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${sign}₪ ${body}`;
}

function formatNISCompact(n) {
  const num = Number(n || 0);
  const abs = Math.abs(num);
  const sign = num < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${sign}₪ ${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}₪ ${(abs / 1_000).toFixed(1)}K`;
  return `${sign}₪ ${abs.toFixed(0)}`;
}

function xmlEscape(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

// ─── CashFlowWaterfall class ───────────────────────────────────

class CashFlowWaterfall {
  /**
   * @param {Object} [options]
   * @param {'direct'|'indirect'} [options.method='indirect']
   * @param {'he-en'|'en-he'} [options.labelOrder='he-en']
   * @param {number} [options.width=960]
   * @param {number} [options.height=540]
   * @param {Object} [options.palette] override palette keys
   * @param {Object} [options.labels] override label keys (en/he)
   */
  constructor(options = {}) {
    this.method = options.method === 'direct' ? 'direct' : 'indirect';
    this.labelOrder = options.labelOrder === 'en-he' ? 'en-he' : 'he-en';
    this.width = Number(options.width) > 0 ? Number(options.width) : 960;
    this.height = Number(options.height) > 0 ? Number(options.height) : 540;
    this.palette = Object.assign({}, PALETTE, options.palette || {});
    this.labels = Object.assign({}, LABELS, options.labels || {});
    // Build history (append-only — never delete — לא מוחקים)
    this._history = [];
  }

  /**
   * build(period) — compute the ordered list of waterfall steps.
   *
   * Each step is an object:
   *   {
   *     kind, key, label_en, label_he, amount, running_before, running_after,
   *     delta_direction: 'up'|'down'|'flat',
   *     section: 'opening'|'operating'|'investing'|'financing'|'closing',
   *   }
   *
   * Subtotals (operating/investing/financing) are inserted inline after each
   * section so charts can draw connector lines. The final "closing" step is
   * always present.
   */
  build(period) {
    if (!isPlainObject(period)) {
      throw new TypeError('CashFlowWaterfall.build: period must be an object');
    }
    const method = period.method === 'direct' || period.method === 'indirect'
      ? period.method
      : this.method;

    const opening = money(period.opening_balance);
    const steps = [];
    let running = opening;

    // Step 0 — opening balance
    steps.push(this._makeStep({
      kind: STEP_KIND.OPENING,
      key: 'opening',
      label_en: this.labels.opening.en,
      label_he: this.labels.opening.he,
      amount: opening,
      running_before: 0,
      running_after: opening,
      section: 'opening',
      direction: 'flat',
    }));

    // Operating section
    const operatingStart = running;
    if (method === 'indirect') {
      const ni = money(period.net_income);
      steps.push(this._pushDelta(
        running, ni,
        STEP_KIND.OPERATING, 'net_income',
        this.labels.net_income, 'operating'
      ));
      running += ni;

      const adj = isPlainObject(period.adjustments) ? period.adjustments : {};
      for (const key of ['depreciation', 'amortization', 'stock_compensation', 'other_noncash']) {
        if (adj[key] === undefined || adj[key] === null) continue;
        const amt = money(adj[key]);
        if (amt === 0) continue;
        steps.push(this._pushDelta(
          running, amt,
          STEP_KIND.ADJUSTMENT, `adj_${key}`,
          this.labels[key], 'operating'
        ));
        running += amt;
      }

      const wc = isPlainObject(period.working_capital) ? period.working_capital : {};
      for (const key of ['ar_change', 'inventory_change', 'ap_change', 'prepaid_change', 'accrued_change']) {
        if (wc[key] === undefined || wc[key] === null) continue;
        const amt = money(wc[key]);
        if (amt === 0) continue;
        steps.push(this._pushDelta(
          running, amt,
          STEP_KIND.WORKING_CAPITAL, `wc_${key}`,
          this.labels[key], 'operating'
        ));
        running += amt;
      }

      const tax = isPlainObject(period.israeli_tax) ? period.israeli_tax : {};
      for (const key of ['income_tax_payable', 'bituach_leumi', 'vat_payable']) {
        if (tax[key] === undefined || tax[key] === null) continue;
        const amt = money(tax[key]);
        if (amt === 0) continue;
        steps.push(this._pushDelta(
          running, amt,
          STEP_KIND.ISRAELI_TAX, `tax_${key}`,
          this.labels[key], 'operating'
        ));
        running += amt;
      }
    } else {
      // Direct method — consume operating[] line items.
      const ops = Array.isArray(period.operating) ? period.operating : [];
      for (let i = 0; i < ops.length; i++) {
        const row = ops[i] || {};
        const amt = money(row.amount);
        if (amt === 0) continue;
        steps.push(this._pushDelta(
          running, amt,
          STEP_KIND.OPERATING, `op_${i}`,
          { en: row.label_en || row.label || `Operating ${i + 1}`,
            he: row.label_he || row.label || `פעילות ${i + 1}` },
          'operating'
        ));
        running += amt;
      }
    }

    // Operating subtotal
    const operatingTotal = running - operatingStart;
    steps.push(this._makeStep({
      kind: STEP_KIND.SUBTOTAL,
      key: 'subtotal_operating',
      label_en: this.labels.subtotal_operating.en,
      label_he: this.labels.subtotal_operating.he,
      amount: operatingTotal,
      running_before: running,
      running_after: running,
      section: 'operating',
      direction: operatingTotal > 0 ? 'up' : operatingTotal < 0 ? 'down' : 'flat',
    }));

    // Investing section
    const investingStart = running;
    const invs = Array.isArray(period.investing) ? period.investing : [];
    for (let i = 0; i < invs.length; i++) {
      const row = invs[i] || {};
      const amt = money(row.amount);
      if (amt === 0) continue;
      steps.push(this._pushDelta(
        running, amt,
        STEP_KIND.INVESTING, `inv_${i}`,
        { en: row.label_en || row.label || `Investing ${i + 1}`,
          he: row.label_he || row.label || `השקעה ${i + 1}` },
        'investing'
      ));
      running += amt;
    }
    const investingTotal = running - investingStart;
    steps.push(this._makeStep({
      kind: STEP_KIND.SUBTOTAL,
      key: 'subtotal_investing',
      label_en: this.labels.subtotal_investing.en,
      label_he: this.labels.subtotal_investing.he,
      amount: investingTotal,
      running_before: running,
      running_after: running,
      section: 'investing',
      direction: investingTotal > 0 ? 'up' : investingTotal < 0 ? 'down' : 'flat',
    }));

    // Financing section
    const financingStart = running;
    const fins = Array.isArray(period.financing) ? period.financing : [];
    for (let i = 0; i < fins.length; i++) {
      const row = fins[i] || {};
      const amt = money(row.amount);
      if (amt === 0) continue;
      steps.push(this._pushDelta(
        running, amt,
        STEP_KIND.FINANCING, `fin_${i}`,
        { en: row.label_en || row.label || `Financing ${i + 1}`,
          he: row.label_he || row.label || `מימון ${i + 1}` },
        'financing'
      ));
      running += amt;
    }
    const financingTotal = running - financingStart;
    steps.push(this._makeStep({
      kind: STEP_KIND.SUBTOTAL,
      key: 'subtotal_financing',
      label_en: this.labels.subtotal_financing.en,
      label_he: this.labels.subtotal_financing.he,
      amount: financingTotal,
      running_before: running,
      running_after: running,
      section: 'financing',
      direction: financingTotal > 0 ? 'up' : financingTotal < 0 ? 'down' : 'flat',
    }));

    // Closing balance
    const closing = money(running);
    steps.push(this._makeStep({
      kind: STEP_KIND.CLOSING,
      key: 'closing',
      label_en: this.labels.closing.en,
      label_he: this.labels.closing.he,
      amount: closing,
      running_before: closing,
      running_after: closing,
      section: 'closing',
      direction: 'flat',
    }));

    const report = {
      method,
      period_label: period.label || '',
      opening_balance: opening,
      closing_balance: closing,
      totals: {
        operating: money(operatingTotal),
        investing: money(investingTotal),
        financing: money(financingTotal),
        net_change: money(closing - opening),
      },
      steps,
      meta: {
        generated_by: 'CashFlowWaterfall',
        agent: 'Y-184',
        method,
        step_count: steps.length,
      },
    };

    // Append to history (never delete — לא מוחקים רק משדרגים ומגדלים)
    this._history.push({ ts: steps.length, report });

    return report;
  }

  /**
   * Expose the append-only history of previously built reports.
   */
  history() {
    return this._history.slice();
  }

  /**
   * One-shot: build(period) → generateSVG(report)
   */
  buildAndRender(period) {
    const report = this.build(period);
    return this.generateSVG(report);
  }

  // Internal — append a delta step (positive or negative).
  _pushDelta(running, amount, kind, key, labelPair, section) {
    const amt = money(amount);
    const direction = amt > 0 ? 'up' : amt < 0 ? 'down' : 'flat';
    return this._makeStep({
      kind,
      key,
      label_en: (labelPair && labelPair.en) || key,
      label_he: (labelPair && labelPair.he) || key,
      amount: amt,
      running_before: money(running),
      running_after: money(running + amt),
      section,
      direction,
    });
  }

  _makeStep(s) {
    return {
      kind: s.kind,
      key: s.key,
      label_en: s.label_en,
      label_he: s.label_he,
      amount: money(s.amount),
      running_before: money(s.running_before),
      running_after: money(s.running_after),
      section: s.section,
      delta_direction: s.direction,
    };
  }

  // ─── SVG renderer ────────────────────────────────────────────

  /**
   * generateSVG(report) — produce a self-contained SVG document.
   *
   * The SVG is fully inlined (no external CSS/fonts/images), dark-palette,
   * bilingual, and safe to drop into an <img src="data:image/svg+xml;..."> or
   * an HTML page. Positive deltas render green, negatives red, opening and
   * closing use the Palantir blue accent (#4a9eff).
   */
  generateSVG(report) {
    if (!isPlainObject(report) || !Array.isArray(report.steps)) {
      throw new TypeError('CashFlowWaterfall.generateSVG: invalid report');
    }

    const W = this.width;
    const H = this.height;
    const PAD = { top: 90, right: 40, bottom: 120, left: 90 };
    const plotW = W - PAD.left - PAD.right;
    const plotH = H - PAD.top - PAD.bottom;
    const steps = report.steps;
    const n = steps.length;
    if (n === 0) {
      return this._renderEmptySvg();
    }

    // Compute y-scale from running balances.
    let yMin = Infinity;
    let yMax = -Infinity;
    for (const s of steps) {
      yMin = Math.min(yMin, s.running_before, s.running_after, 0);
      yMax = Math.max(yMax, s.running_before, s.running_after, 0);
    }
    if (yMin === yMax) { yMin -= 1; yMax += 1; }
    const yPad = (yMax - yMin) * 0.08;
    yMin -= yPad;
    yMax += yPad;

    const barSpacing = plotW / n;
    const barW = Math.max(12, Math.min(60, barSpacing * 0.62));

    const yScale = (v) => {
      return PAD.top + plotH - ((v - yMin) / (yMax - yMin)) * plotH;
    };
    const xBar = (i) => PAD.left + i * barSpacing + (barSpacing - barW) / 2;

    const parts = [];
    parts.push(`<?xml version="1.0" encoding="UTF-8"?>`);
    parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${xmlEscape(this.labels.chart_title.he + ' / ' + this.labels.chart_title.en)}">`);

    // Definitions
    parts.push('<defs>');
    parts.push(`<linearGradient id="bg-grad" x1="0" y1="0" x2="0" y2="1">`);
    parts.push(`<stop offset="0%" stop-color="${this.palette.background}"/>`);
    parts.push(`<stop offset="100%" stop-color="${this.palette.surface}"/>`);
    parts.push(`</linearGradient>`);
    parts.push(`<linearGradient id="bar-pos" x1="0" y1="0" x2="0" y2="1">`);
    parts.push(`<stop offset="0%" stop-color="${this.palette.positive}" stop-opacity="1"/>`);
    parts.push(`<stop offset="100%" stop-color="${this.palette.positiveDim}" stop-opacity="0.85"/>`);
    parts.push(`</linearGradient>`);
    parts.push(`<linearGradient id="bar-neg" x1="0" y1="0" x2="0" y2="1">`);
    parts.push(`<stop offset="0%" stop-color="${this.palette.negative}" stop-opacity="1"/>`);
    parts.push(`<stop offset="100%" stop-color="${this.palette.negativeDim}" stop-opacity="0.85"/>`);
    parts.push(`</linearGradient>`);
    parts.push(`<linearGradient id="bar-bal" x1="0" y1="0" x2="0" y2="1">`);
    parts.push(`<stop offset="0%" stop-color="${this.palette.accent}" stop-opacity="1"/>`);
    parts.push(`<stop offset="100%" stop-color="${this.palette.accentDim}" stop-opacity="0.85"/>`);
    parts.push(`</linearGradient>`);
    parts.push('</defs>');

    // Background
    parts.push(`<rect x="0" y="0" width="${W}" height="${H}" fill="url(#bg-grad)"/>`);
    parts.push(`<rect x="${PAD.left}" y="${PAD.top}" width="${plotW}" height="${plotH}" fill="${this.palette.surface}" stroke="${this.palette.axis}" stroke-width="1"/>`);

    // Title (bilingual) — Palantir-dark header
    const titleHe = this.labels.chart_title.he;
    const titleEn = this.labels.chart_title.en;
    const periodLabel = report.period_label ? ' — ' + report.period_label : '';
    parts.push(`<text class="wf-title" x="${W / 2}" y="34" text-anchor="middle" fill="${this.palette.text}" font-family="Arial, Helvetica, sans-serif" font-size="20" font-weight="700">${xmlEscape(titleHe + ' / ' + titleEn + periodLabel)}</text>`);
    parts.push(`<text class="wf-subtitle" x="${W / 2}" y="58" text-anchor="middle" fill="${this.palette.textMuted}" font-family="Arial, Helvetica, sans-serif" font-size="12">${xmlEscape('Method / שיטה: ' + report.method + '  •  Opening ' + formatNISCompact(report.opening_balance) + ' → Closing ' + formatNISCompact(report.closing_balance))}</text>`);

    // Gridlines (5 horizontal)
    const gridCount = 5;
    for (let g = 0; g <= gridCount; g++) {
      const v = yMin + ((yMax - yMin) * g) / gridCount;
      const y = yScale(v);
      parts.push(`<line class="wf-grid" x1="${PAD.left}" y1="${y}" x2="${PAD.left + plotW}" y2="${y}" stroke="${this.palette.grid}" stroke-width="1" stroke-dasharray="2,3"/>`);
      parts.push(`<text class="wf-y-label" x="${PAD.left - 8}" y="${y + 4}" text-anchor="end" fill="${this.palette.textMuted}" font-family="Arial, Helvetica, sans-serif" font-size="10">${xmlEscape(formatNISCompact(v))}</text>`);
    }

    // Zero baseline (if within range)
    if (yMin < 0 && yMax > 0) {
      const yZero = yScale(0);
      parts.push(`<line class="wf-zero" x1="${PAD.left}" y1="${yZero}" x2="${PAD.left + plotW}" y2="${yZero}" stroke="${this.palette.warning}" stroke-width="1.2" stroke-dasharray="4,4"/>`);
    }

    // Bars + connectors
    for (let i = 0; i < n; i++) {
      const s = steps[i];
      const x = xBar(i);
      const isBalance = s.kind === STEP_KIND.OPENING || s.kind === STEP_KIND.CLOSING || s.kind === STEP_KIND.SUBTOTAL;

      let barTop, barBottom, fill;
      if (isBalance) {
        barTop = yScale(Math.max(0, s.amount));
        barBottom = yScale(Math.min(0, s.amount));
        fill = s.kind === STEP_KIND.SUBTOTAL
          ? (s.delta_direction === 'down' ? 'url(#bar-neg)' : 'url(#bar-pos)')
          : 'url(#bar-bal)';
      } else {
        barTop = yScale(Math.max(s.running_before, s.running_after));
        barBottom = yScale(Math.min(s.running_before, s.running_after));
        fill = s.amount >= 0 ? 'url(#bar-pos)' : 'url(#bar-neg)';
      }
      const barH = Math.max(2, barBottom - barTop);
      parts.push(`<rect class="wf-bar wf-bar-${s.kind}" data-key="${xmlEscape(s.key)}" x="${x.toFixed(2)}" y="${barTop.toFixed(2)}" width="${barW.toFixed(2)}" height="${barH.toFixed(2)}" fill="${fill}" stroke="${this.palette.axis}" stroke-width="0.5" rx="2"/>`);

      // Connector line from this bar top to next bar's running_before
      if (i < n - 1) {
        const nextStep = steps[i + 1];
        const nextIsBalance = nextStep.kind === STEP_KIND.OPENING || nextStep.kind === STEP_KIND.CLOSING || nextStep.kind === STEP_KIND.SUBTOTAL;
        const connYEnd = nextIsBalance ? yScale(nextStep.amount) : yScale(nextStep.running_before);
        const connYStart = isBalance ? yScale(s.amount) : yScale(s.running_after);
        const x1 = x + barW;
        const x2 = xBar(i + 1);
        parts.push(`<line class="wf-conn" x1="${x1.toFixed(2)}" y1="${connYStart.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${connYEnd.toFixed(2)}" stroke="${this.palette.accent}" stroke-width="1" stroke-dasharray="3,3" opacity="0.55"/>`);
      }

      // Value label above bar
      const valLabel = formatNISCompact(s.amount);
      const valY = Math.max(barTop - 6, PAD.top + 12);
      parts.push(`<text class="wf-value" x="${(x + barW / 2).toFixed(2)}" y="${valY.toFixed(2)}" text-anchor="middle" fill="${this.palette.text}" font-family="Arial, Helvetica, sans-serif" font-size="10" font-weight="600">${xmlEscape(valLabel)}</text>`);

      // X-axis bilingual labels (he on top, en below)
      const labelY = PAD.top + plotH + 16;
      const heLabel = s.label_he;
      const enLabel = s.label_en;
      parts.push(`<g class="wf-xlabel" transform="translate(${(x + barW / 2).toFixed(2)},${labelY}) rotate(-40)">`);
      parts.push(`<text fill="${this.palette.text}" font-family="Arial, Helvetica, sans-serif" font-size="10" text-anchor="end" direction="rtl">${xmlEscape(heLabel)}</text>`);
      parts.push(`<text y="12" fill="${this.palette.textMuted}" font-family="Arial, Helvetica, sans-serif" font-size="9" text-anchor="end">${xmlEscape(enLabel)}</text>`);
      parts.push(`</g>`);
    }

    // Legend (bottom)
    const legendY = H - 24;
    const legendItems = [
      { label_he: 'חיובי', label_en: 'Positive', color: this.palette.positive },
      { label_he: 'שלילי', label_en: 'Negative', color: this.palette.negative },
      { label_he: 'יתרה', label_en: 'Balance', color: this.palette.accent },
    ];
    const legendSpacing = 140;
    const legendX0 = (W - legendItems.length * legendSpacing) / 2;
    for (let i = 0; i < legendItems.length; i++) {
      const item = legendItems[i];
      const lx = legendX0 + i * legendSpacing;
      parts.push(`<rect class="wf-legend-swatch" x="${lx}" y="${legendY - 10}" width="14" height="14" fill="${item.color}" rx="2"/>`);
      parts.push(`<text class="wf-legend-text" x="${lx + 20}" y="${legendY + 2}" fill="${this.palette.text}" font-family="Arial, Helvetica, sans-serif" font-size="11">${xmlEscape(item.label_he + ' / ' + item.label_en)}</text>`);
    }

    // Footer credit — bilingual
    parts.push(`<text class="wf-footer" x="${W - 12}" y="${H - 6}" text-anchor="end" fill="${this.palette.textMuted}" font-family="Arial, Helvetica, sans-serif" font-size="9">${xmlEscape('ONYX Finance — CashFlowWaterfall Y-184')}</text>`);

    parts.push(`</svg>`);
    return parts.join('\n');
  }

  _renderEmptySvg() {
    const W = this.width;
    const H = this.height;
    return [
      `<?xml version="1.0" encoding="UTF-8"?>`,
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">`,
      `<rect x="0" y="0" width="${W}" height="${H}" fill="${this.palette.background}"/>`,
      `<text x="${W / 2}" y="${H / 2}" text-anchor="middle" fill="${this.palette.textMuted}" font-family="Arial, Helvetica, sans-serif" font-size="14">No data / אין נתונים</text>`,
      `</svg>`,
    ].join('\n');
  }
}

// ─── exports ───────────────────────────────────────────────────

module.exports = {
  CashFlowWaterfall,
  PALETTE,
  STEP_KIND,
  LABELS,
  // Internal helpers exposed for unit tests.
  _internals: {
    money,
    formatNIS,
    formatNISCompact,
    xmlEscape,
    isPlainObject,
  },
};
