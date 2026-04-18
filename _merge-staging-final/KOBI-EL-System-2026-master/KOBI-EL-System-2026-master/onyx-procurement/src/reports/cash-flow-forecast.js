/**
 * Cash Flow Forecast Report — תחזית תזרים מזומנים
 * Agent 63 — 2026-04-11
 *
 * Builds a deterministic N-day cash-flow projection combining:
 *   • Current bank balances (sum of all active accounts)
 *   • Open AR (customer invoices + expected pay dates)
 *   • Open AP (vendor invoices + due dates)
 *   • Recurring obligations (payroll, rent, VAT, payroll withholdings)
 *   • Open PO commitments (expected delivery/payment dates)
 *   • Tax obligations (monthly VAT, annual tax, Bituach Leumi)
 *
 * Produces:
 *   • Per-day ledger of opening balance, inflows, outflows, closing balance
 *   • Low-point amount + date ("when will it hurt most?")
 *   • Days till negative (if applicable)
 *   • Confidence interval (wider when AR is stale or data is thin)
 *   • Three scenarios: base / pessimistic / optimistic
 *   • Automatic alerts (CRITICAL if low-point is negative, HIGH if < 30d away)
 *
 * Rendering:
 *   • renderCashFlowPdf(data, outputPath) — bilingual A4 PDF using pdfkit
 *   • renderCashFlowJson(data)            — plain object for API responses
 *
 * Supabase contract (read-only, duck-typed):
 *   supabase.from(table).select(...).eq(...).gte(...).lte(...)
 *   Required tables (best-effort, missing tables fall back to empty arrays):
 *     bank_accounts           : { id, name, balance, currency, is_active }
 *     ar_invoices             : { id, customer_id, amount, expected_pay_date, status }
 *     ap_invoices             : { id, vendor_id, amount, due_date, status }
 *     recurring_obligations   : { id, kind, amount, day_of_month, next_date, active }
 *     purchase_orders         : { id, vendor_id, amount_total, expected_payment_date, status }
 *     tax_obligations         : { id, kind, amount, due_date, period }
 */

'use strict';

const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

// ─── constants ─────────────────────────────────────────────────

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Default confidence buckets (% of net flow). Pessimistic = less AR collected,
// more AP paid on time. Optimistic = AR comes in early, AP negotiated.
const SCENARIO_FACTORS = {
  base: { arCollect: 1.0, apPay: 1.0 },
  pessimistic: { arCollect: 0.80, apPay: 1.10 },
  optimistic: { arCollect: 1.05, apPay: 0.95 },
};

// Confidence widens with horizon & stale AR (heuristic).
const CONFIDENCE_BASE_PCT = 0.05; // ±5% at day 0
const CONFIDENCE_DAY_PCT = 0.004; // +0.4% per forecast day
const CONFIDENCE_STALE_AR_PCT = 0.02; // +2% per stale AR invoice (>60d)

// ─── utilities ─────────────────────────────────────────────────

function toDate(d) {
  if (d instanceof Date) return new Date(d.getTime());
  if (typeof d === 'string' || typeof d === 'number') return new Date(d);
  return new Date();
}

function startOfDay(d) {
  const dt = toDate(d);
  dt.setHours(0, 0, 0, 0);
  return dt;
}

function addDays(d, n) {
  const dt = toDate(d);
  dt.setDate(dt.getDate() + n);
  return dt;
}

function daysBetween(a, b) {
  const da = startOfDay(a).getTime();
  const db = startOfDay(b).getTime();
  return Math.round((db - da) / MS_PER_DAY);
}

function isoDate(d) {
  const dt = toDate(d);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function money(n) {
  const num = Number(n || 0);
  return Math.round(num * 100) / 100;
}

function formatMoney(n) {
  const num = Number(n || 0);
  return '₪ ' + num.toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDateHe(d) {
  if (!d) return '';
  return toDate(d).toLocaleDateString('he-IL', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

// ─── supabase data loaders (duck-typed & defensive) ───────────

async function safeSelect(supabase, table, builder = (q) => q) {
  if (!supabase || typeof supabase.from !== 'function') return [];
  try {
    const q = supabase.from(table).select('*');
    const result = await builder(q);
    if (!result) return [];
    if (Array.isArray(result)) return result;
    if (Array.isArray(result.data)) return result.data;
    return [];
  } catch (err) {
    // Missing table or column — degrade gracefully. Callers keep the
    // forecast running even when some sources are unavailable.
    return [];
  }
}

async function loadBankBalances(supabase) {
  const rows = await safeSelect(supabase, 'bank_accounts', (q) =>
    typeof q.eq === 'function' ? q.eq('is_active', true) : q
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name || r.bank_name || 'Unknown',
    balance: money(r.balance ?? r.current_balance ?? 0),
    currency: r.currency || 'ILS',
  }));
}

async function loadOpenAR(supabase, asOf, horizonEnd) {
  const rows = await safeSelect(supabase, 'ar_invoices');
  return rows
    .filter((r) => {
      const status = String(r.status || 'open').toLowerCase();
      return status !== 'paid' && status !== 'void' && status !== 'cancelled';
    })
    .map((r) => {
      const expected = toDate(r.expected_pay_date || r.due_date || r.invoice_date || asOf);
      return {
        id: r.id,
        customer_id: r.customer_id,
        amount: money(r.amount || r.amount_total || 0),
        expected_pay_date: expected,
        invoice_date: toDate(r.invoice_date || r.issued_at || asOf),
      };
    })
    .filter((r) => r.expected_pay_date <= horizonEnd);
}

async function loadOpenAP(supabase, asOf, horizonEnd) {
  const rows = await safeSelect(supabase, 'ap_invoices');
  return rows
    .filter((r) => {
      const status = String(r.status || 'open').toLowerCase();
      return status !== 'paid' && status !== 'void' && status !== 'cancelled';
    })
    .map((r) => ({
      id: r.id,
      vendor_id: r.vendor_id,
      amount: money(r.amount || r.amount_total || 0),
      due_date: toDate(r.due_date || r.expected_payment_date || asOf),
    }))
    .filter((r) => r.due_date <= horizonEnd);
}

async function loadRecurringObligations(supabase) {
  const rows = await safeSelect(supabase, 'recurring_obligations', (q) =>
    typeof q.eq === 'function' ? q.eq('active', true) : q
  );
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind || r.category || 'other',
    label: r.label || r.description || r.kind || 'recurring',
    amount: money(r.amount || 0),
    day_of_month: Number(r.day_of_month || 0),
    next_date: r.next_date ? toDate(r.next_date) : null,
    frequency: r.frequency || 'monthly',
  }));
}

async function loadOpenPOs(supabase, asOf, horizonEnd) {
  const rows = await safeSelect(supabase, 'purchase_orders');
  return rows
    .filter((r) => {
      const status = String(r.status || 'open').toLowerCase();
      return status !== 'closed' && status !== 'cancelled' && status !== 'paid';
    })
    .map((r) => ({
      id: r.id,
      vendor_id: r.vendor_id,
      amount: money(r.amount_total || r.amount || 0),
      expected_payment_date: toDate(r.expected_payment_date || r.delivery_date || r.created_at || asOf),
    }))
    .filter((r) => r.expected_payment_date <= horizonEnd);
}

async function loadTaxObligations(supabase, asOf, horizonEnd) {
  const rows = await safeSelect(supabase, 'tax_obligations');
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind || 'other',
    amount: money(r.amount || 0),
    due_date: toDate(r.due_date || asOf),
    period: r.period || null,
  })).filter((r) => r.due_date <= horizonEnd);
}

// ─── recurrence expansion ──────────────────────────────────────

/**
 * Expand a recurring obligation into individual outflow events within the
 * forecast horizon. Monthly is the default (payroll, rent, VAT, bituach leumi).
 */
function expandRecurring(obligation, startDate, endDate) {
  const events = [];
  const start = startOfDay(startDate);
  const end = startOfDay(endDate);
  const freq = String(obligation.frequency || 'monthly').toLowerCase();

  let cursor;
  if (obligation.next_date) {
    cursor = startOfDay(obligation.next_date);
  } else if (obligation.day_of_month > 0) {
    cursor = new Date(start.getFullYear(), start.getMonth(), obligation.day_of_month);
    if (cursor < start) {
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, obligation.day_of_month);
    }
  } else {
    return events;
  }

  while (cursor <= end) {
    if (cursor >= start) {
      events.push({
        date: new Date(cursor),
        amount: obligation.amount,
        label: obligation.label,
        kind: obligation.kind,
        source: 'recurring',
      });
    }
    if (freq === 'weekly') cursor = addDays(cursor, 7);
    else if (freq === 'biweekly') cursor = addDays(cursor, 14);
    else if (freq === 'quarterly') {
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 3, cursor.getDate());
    } else if (freq === 'annual' || freq === 'yearly') {
      cursor = new Date(cursor.getFullYear() + 1, cursor.getMonth(), cursor.getDate());
    } else {
      // monthly
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, cursor.getDate());
    }
  }
  return events;
}

// ─── core forecast ─────────────────────────────────────────────

/**
 * forecastCashFlow — build an N-day cash-flow projection.
 *
 * @param {Object}   opts
 * @param {number}   opts.horizonDays   number of forecast days (default 90)
 * @param {Object}   opts.supabase      supabase client (optional — fallbacks apply)
 * @param {Date|string} [opts.asOf]     forecast start date (default: today)
 * @returns {Promise<Object>} forecast report
 */
async function forecastCashFlow({ horizonDays = 90, supabase, asOf } = {}) {
  const start = startOfDay(asOf || new Date());
  const horizon = Math.max(1, Math.floor(Number(horizonDays) || 90));
  const end = addDays(start, horizon - 1);

  // 1) Load inputs in parallel.
  const [banks, ar, ap, recurring, pos, taxes] = await Promise.all([
    loadBankBalances(supabase),
    loadOpenAR(supabase, start, end),
    loadOpenAP(supabase, start, end),
    loadRecurringObligations(supabase),
    loadOpenPOs(supabase, start, end),
    loadTaxObligations(supabase, start, end),
  ]);

  const openingBalance = banks.reduce((sum, b) => sum + b.balance, 0);

  // 2) Build an event list, normalized to { date, amount, source, label, kind }.
  //    Inflows carry positive amounts, outflows negative.
  const events = [];

  for (const row of ar) {
    events.push({
      date: startOfDay(row.expected_pay_date),
      amount: row.amount,
      source: 'ar',
      label: `AR ${row.id || ''}`,
      kind: 'ar_invoice',
    });
  }
  for (const row of ap) {
    events.push({
      date: startOfDay(row.due_date),
      amount: -row.amount,
      source: 'ap',
      label: `AP ${row.id || ''}`,
      kind: 'ap_invoice',
    });
  }
  for (const row of pos) {
    events.push({
      date: startOfDay(row.expected_payment_date),
      amount: -row.amount,
      source: 'po',
      label: `PO ${row.id || ''}`,
      kind: 'purchase_order',
    });
  }
  for (const tax of taxes) {
    events.push({
      date: startOfDay(tax.due_date),
      amount: -tax.amount,
      source: 'tax',
      label: `Tax ${tax.kind}${tax.period ? ' ' + tax.period : ''}`,
      kind: tax.kind,
    });
  }
  for (const obligation of recurring) {
    const occurrences = expandRecurring(obligation, start, end);
    for (const occ of occurrences) {
      events.push({
        date: occ.date,
        amount: -occ.amount,
        source: 'recurring',
        label: occ.label,
        kind: occ.kind,
      });
    }
  }

  // 3) Bucket events into per-day ledger.
  const days = [];
  let running = openingBalance;
  for (let i = 0; i < horizon; i++) {
    const day = addDays(start, i);
    const dayIso = isoDate(day);
    const dayEvents = events.filter((e) => isoDate(e.date) === dayIso);
    const inflow = dayEvents.filter((e) => e.amount > 0).reduce((s, e) => s + e.amount, 0);
    const outflow = dayEvents.filter((e) => e.amount < 0).reduce((s, e) => s + Math.abs(e.amount), 0);
    const net = inflow - outflow;
    const opening = running;
    const closing = money(opening + net);
    running = closing;
    days.push({
      date: dayIso,
      day_offset: i,
      opening_balance: money(opening),
      inflow: money(inflow),
      outflow: money(outflow),
      net: money(net),
      closing_balance: closing,
      events: dayEvents.map((e) => ({
        source: e.source,
        kind: e.kind,
        label: e.label,
        amount: money(e.amount),
      })),
    });
  }

  // 4) Low-point + days till negative.
  let lowPoint = days.length ? { amount: days[0].closing_balance, date: days[0].date, day_offset: 0 } : null;
  let firstNegativeDate = null;
  let firstNegativeOffset = null;
  for (const d of days) {
    if (lowPoint === null || d.closing_balance < lowPoint.amount) {
      lowPoint = { amount: d.closing_balance, date: d.date, day_offset: d.day_offset };
    }
    if (firstNegativeDate === null && d.closing_balance < 0) {
      firstNegativeDate = d.date;
      firstNegativeOffset = d.day_offset;
    }
  }

  // 5) Confidence interval. Gets wider with horizon + stale AR count.
  const staleArCount = ar.filter((r) => daysBetween(r.invoice_date, start) > 60).length;
  const confidencePct = CONFIDENCE_BASE_PCT
    + CONFIDENCE_DAY_PCT * horizon
    + CONFIDENCE_STALE_AR_PCT * staleArCount;

  // 6) Scenarios — re-run with collection/payment scale factors, no re-query.
  function buildScenario(factor) {
    let r = openingBalance;
    let scLow = null;
    let scFirstNeg = null;
    const scDays = [];
    for (let i = 0; i < horizon; i++) {
      const day = addDays(start, i);
      const iso = isoDate(day);
      const ev = events.filter((e) => isoDate(e.date) === iso);
      let inflow = 0;
      let outflow = 0;
      for (const e of ev) {
        if (e.source === 'ar') inflow += e.amount * factor.arCollect;
        else if (e.amount > 0) inflow += e.amount;
        else if (e.source === 'ap' || e.source === 'po') outflow += Math.abs(e.amount) * factor.apPay;
        else outflow += Math.abs(e.amount);
      }
      const net = inflow - outflow;
      const opening = r;
      const closing = money(opening + net);
      r = closing;
      scDays.push({ date: iso, closing_balance: closing });
      if (scLow === null || closing < scLow.amount) scLow = { amount: closing, date: iso, day_offset: i };
      if (scFirstNeg === null && closing < 0) scFirstNeg = { date: iso, day_offset: i };
    }
    return {
      low_point: scLow,
      first_negative: scFirstNeg,
      final_balance: scDays.length ? scDays[scDays.length - 1].closing_balance : openingBalance,
      days: scDays,
    };
  }

  const scenarios = {
    base: buildScenario(SCENARIO_FACTORS.base),
    pessimistic: buildScenario(SCENARIO_FACTORS.pessimistic),
    optimistic: buildScenario(SCENARIO_FACTORS.optimistic),
  };

  // 7) Alerts. CRITICAL if base low-point is negative; HIGH if it's
  //    non-negative but < 30 days away (too close for comfort). When there
  //    is zero activity AND the low-point equals the opening balance, there
  //    is nothing actionable to warn about — suppress.
  const alerts = [];
  const hasActivity = events.length > 0;
  if (lowPoint && lowPoint.amount < 0) {
    alerts.push({
      severity: 'CRITICAL',
      code: 'CASH_FLOW_NEGATIVE_LOW_POINT',
      message: `Projected cash low-point is negative: ${formatMoney(lowPoint.amount)} on ${lowPoint.date}`,
      amount: lowPoint.amount,
      date: lowPoint.date,
      day_offset: lowPoint.day_offset,
    });
  } else if (lowPoint && lowPoint.day_offset < 30 && hasActivity) {
    alerts.push({
      severity: 'HIGH',
      code: 'CASH_FLOW_LOW_POINT_CLOSE',
      message: `Cash low-point is within 30 days: ${formatMoney(lowPoint.amount)} on ${lowPoint.date}`,
      amount: lowPoint.amount,
      date: lowPoint.date,
      day_offset: lowPoint.day_offset,
    });
  }
  if (scenarios.pessimistic.low_point && scenarios.pessimistic.low_point.amount < 0 &&
      (!lowPoint || lowPoint.amount >= 0)) {
    alerts.push({
      severity: 'HIGH',
      code: 'CASH_FLOW_PESSIMISTIC_NEGATIVE',
      message: `Pessimistic scenario turns negative on ${scenarios.pessimistic.low_point.date}`,
      date: scenarios.pessimistic.low_point.date,
      day_offset: scenarios.pessimistic.low_point.day_offset,
    });
  }

  // 8) Totals & meta.
  const totalInflow = days.reduce((s, d) => s + d.inflow, 0);
  const totalOutflow = days.reduce((s, d) => s + d.outflow, 0);
  const finalBalance = days.length ? days[days.length - 1].closing_balance : openingBalance;

  return {
    generated_at: new Date().toISOString(),
    as_of: isoDate(start),
    horizon_days: horizon,
    horizon_end: isoDate(end),
    opening_balance: money(openingBalance),
    final_balance: money(finalBalance),
    total_inflow: money(totalInflow),
    total_outflow: money(totalOutflow),
    net_change: money(totalInflow - totalOutflow),
    low_point: lowPoint,
    first_negative_date: firstNegativeDate,
    days_till_negative: firstNegativeOffset,
    confidence: {
      interval_pct: Math.round(confidencePct * 10000) / 10000,
      reason: buildConfidenceReason(staleArCount, horizon, ar.length, ap.length),
      stale_ar_count: staleArCount,
    },
    scenarios,
    alerts,
    inputs_summary: {
      bank_accounts: banks.length,
      open_ar_count: ar.length,
      open_ap_count: ap.length,
      recurring_obligations: recurring.length,
      open_pos: pos.length,
      tax_obligations: taxes.length,
    },
    banks,
    days,
  };
}

function buildConfidenceReason(staleArCount, horizon, arCount, apCount) {
  const parts = [];
  parts.push(`baseline ±${Math.round(CONFIDENCE_BASE_PCT * 100)}%`);
  parts.push(`+${Math.round(CONFIDENCE_DAY_PCT * 100 * horizon)}% horizon drift (${horizon}d)`);
  if (staleArCount > 0) {
    parts.push(`+${Math.round(CONFIDENCE_STALE_AR_PCT * 100 * staleArCount)}% from ${staleArCount} stale AR invoice(s) (>60d old)`);
  }
  if (arCount === 0 && apCount === 0) {
    parts.push('no open AR/AP — forecast relies on recurring items only');
  }
  parts.push('unexpected invoices (new business or emergency repairs) are NOT modeled');
  return parts.join('; ');
}

// ─── JSON renderer (API-friendly) ──────────────────────────────

function renderCashFlowJson(data) {
  if (!data) throw new Error('renderCashFlowJson: data is required');
  return {
    ...data,
    days: (data.days || []).map((d) => ({
      date: d.date,
      day_offset: d.day_offset,
      opening_balance: d.opening_balance,
      inflow: d.inflow,
      outflow: d.outflow,
      net: d.net,
      closing_balance: d.closing_balance,
      event_count: (d.events || []).length,
      events: d.events || [],
    })),
  };
}

// ─── PDF renderer ──────────────────────────────────────────────

/**
 * renderCashFlowPdf — writes a bilingual A4 PDF summary of a forecast.
 * Returns a promise that resolves to { path, size }.
 */
function renderCashFlowPdf(data, outputPath) {
  return new Promise((resolve, reject) => {
    if (!data) return reject(new Error('renderCashFlowPdf: data is required'));
    if (!outputPath) return reject(new Error('renderCashFlowPdf: outputPath is required'));
    try {
      const dir = path.dirname(outputPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

      const doc = new PDFDocument({
        size: 'A4',
        margin: 40,
        info: {
          Title: `Cash Flow Forecast ${data.as_of} → ${data.horizon_end}`,
          Author: 'ONYX Finance',
          Subject: 'Cash Flow Forecast / תחזית תזרים מזומנים',
          CreationDate: new Date(),
        },
      });
      const stream = fs.createWriteStream(outputPath);
      doc.pipe(stream);

      // Header
      doc.fontSize(18).text('Cash Flow Forecast / תחזית תזרים מזומנים', { align: 'center' });
      doc.moveDown(0.3);
      doc.fontSize(11).text(
        `${data.as_of} → ${data.horizon_end}  (${data.horizon_days} days)`,
        { align: 'center' }
      );
      doc.moveDown();

      // Summary box
      doc.fontSize(12).text('Summary / סיכום', { underline: true });
      doc.fontSize(10).moveDown(0.2);
      drawRow(doc, 'Opening balance / יתרת פתיחה', formatMoney(data.opening_balance));
      drawRow(doc, 'Total inflow / סך הכנסות', formatMoney(data.total_inflow));
      drawRow(doc, 'Total outflow / סך הוצאות', formatMoney(data.total_outflow));
      drawRow(doc, 'Net change / שינוי נטו', formatMoney(data.net_change));
      drawRow(doc, 'Final balance / יתרת סגירה', formatMoney(data.final_balance), true);
      doc.moveDown(0.5);

      // Low point
      doc.fontSize(12).text('Low Point / נקודת השפל', { underline: true });
      doc.fontSize(10).moveDown(0.2);
      if (data.low_point) {
        drawRow(doc, 'Amount / סכום', formatMoney(data.low_point.amount));
        drawRow(doc, 'Date / תאריך', formatDateHe(data.low_point.date));
        drawRow(doc, 'Days from now / ימים מהיום', String(data.low_point.day_offset));
      }
      if (data.days_till_negative !== null && data.days_till_negative !== undefined) {
        drawRow(doc, 'Days till negative / ימים עד שלילי', String(data.days_till_negative), true);
      }
      doc.moveDown(0.5);

      // Confidence
      doc.fontSize(12).text('Confidence / רמת ודאות', { underline: true });
      doc.fontSize(10).moveDown(0.2);
      drawRow(doc, 'Interval', `±${Math.round((data.confidence.interval_pct || 0) * 100)}%`);
      doc.fontSize(9).text(data.confidence.reason || '', { width: 515 });
      doc.fontSize(10).moveDown(0.5);

      // Scenarios
      doc.fontSize(12).text('Scenarios / תרחישים', { underline: true });
      doc.fontSize(10).moveDown(0.2);
      for (const name of ['base', 'pessimistic', 'optimistic']) {
        const sc = data.scenarios && data.scenarios[name];
        if (!sc) continue;
        const lowStr = sc.low_point
          ? `${formatMoney(sc.low_point.amount)} @ ${sc.low_point.date}`
          : '—';
        const finalStr = formatMoney(sc.final_balance);
        drawRow(doc, `${name} — low`, lowStr);
        drawRow(doc, `${name} — final`, finalStr);
      }
      doc.moveDown(0.5);

      // Alerts
      if (data.alerts && data.alerts.length) {
        doc.fontSize(12).fillColor('#b00').text('Alerts / התראות', { underline: true });
        doc.fontSize(10).fillColor('#000').moveDown(0.2);
        for (const a of data.alerts) {
          doc.fillColor(a.severity === 'CRITICAL' ? '#b00' : '#a60');
          doc.text(`[${a.severity}] ${a.message}`);
        }
        doc.fillColor('#000').moveDown(0.5);
      }

      // Per-day table (first 30 days to keep PDF readable)
      doc.addPage();
      doc.fontSize(12).text('Daily Ledger (first 30 days) / יומן תזרים', { underline: true });
      doc.fontSize(9).moveDown(0.3);
      const header = ['Date', 'Open', 'In', 'Out', 'Net', 'Close'];
      const colX = [40, 120, 210, 285, 360, 450];
      header.forEach((h, i) => doc.text(h, colX[i], doc.y, { continued: i < header.length - 1 }));
      doc.moveDown(0.3);
      doc.moveTo(40, doc.y).lineTo(555, doc.y).stroke();
      const firstDays = (data.days || []).slice(0, 30);
      for (const d of firstDays) {
        const y = doc.y + 2;
        doc.text(d.date, colX[0], y, { width: 75 });
        doc.text(formatMoney(d.opening_balance), colX[1], y, { width: 85, align: 'right' });
        doc.text(formatMoney(d.inflow), colX[2], y, { width: 70, align: 'right' });
        doc.text(formatMoney(d.outflow), colX[3], y, { width: 70, align: 'right' });
        doc.text(formatMoney(d.net), colX[4], y, { width: 85, align: 'right' });
        doc.text(formatMoney(d.closing_balance), colX[5], y, { width: 105, align: 'right' });
        doc.moveDown(0.6);
        if (doc.y > 780) {
          doc.addPage();
          doc.fontSize(9);
        }
      }

      // Footer
      doc.moveDown(1);
      doc.fontSize(8).fillColor('#666');
      doc.text(
        `Generated ${new Date().toISOString()} — ONYX Finance Cash Flow Forecast`,
        { align: 'center' }
      );
      doc.text(
        'Methodology: deterministic AR/AP/recurring/tax projection with scenario factors. See docs/CASH_FLOW_FORECAST.md.',
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

function drawRow(doc, label, value, bold = false) {
  const y = doc.y;
  if (bold) doc.font('Helvetica-Bold');
  doc.text(label, 60, y, { width: 300, align: 'left', continued: false });
  doc.text(value, 360, y, { width: 200, align: 'right' });
  if (bold) doc.font('Helvetica');
  doc.moveDown(0.15);
}

// ─── exports ───────────────────────────────────────────────────

module.exports = {
  forecastCashFlow,
  renderCashFlowPdf,
  renderCashFlowJson,
  // exposed for tests / advanced callers
  _internals: {
    expandRecurring,
    loadBankBalances,
    loadOpenAR,
    loadOpenAP,
    loadRecurringObligations,
    loadOpenPOs,
    loadTaxObligations,
    SCENARIO_FACTORS,
  },
};
