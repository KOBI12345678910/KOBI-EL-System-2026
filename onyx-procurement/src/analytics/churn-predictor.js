/**
 * Client Churn Predictor — חיזוי נטישת לקוחות
 * Agent X-06 — Swarm 3 — Techno-Kol Uzi ERP / onyx-procurement
 * Date: 2026-04-11
 *
 * Zero-dependency pure-JavaScript module that estimates the probability that a
 * client is about to stop doing business with Techno-Kol Uzi. The predictor is
 * deterministic: the same history always yields the same risk score so that
 * reports are reproducible and auditable.
 *
 * The model is a weighted additive scorecard over ten behavioural signals.
 * It never uses random numbers, never calls external services, and has no
 * runtime dependencies — safe to ship inside a worker, CLI, test runner, or
 * as part of a report job.
 *
 * ─── Signals (each contributes 0..100 to a weighted composite) ──────────────
 *   1. Declining invoice frequency vs baseline (last 90d vs 365d avg)
 *   2. Declining average invoice amount
 *   3. Increased time between orders
 *   4. Late payments increased
 *   5. Payment disputes raised
 *   6. Support / complaint tickets
 *   7. Cancelled quotes without conversion
 *   8. Changed billing / shipping info
 *   9. Contacted less frequently
 *  10. Seasonal adjustment — dampens the signal when the client is a known
 *      seasonal buyer whose current "quiet" window is expected.
 *
 * ─── Classification buckets ─────────────────────────────────────────────────
 *   healthy  : 0  .. 30
 *   watch    : 31 .. 60
 *   at_risk  : 61 .. 80
 *   critical : 81 .. 100
 *
 * ─── Exports ───────────────────────────────────────────────────────────────
 *   predictChurn(clientId, history)     → { risk_score, classification,
 *                                            signals[], suggested_actions[] }
 *   rankAllClients(clients)             → sorted array (highest risk first)
 *   generateRetentionReport(clients, o) → Hebrew formatted string report
 *   suggestAction(client)               → string[] of suggested retention moves
 *   computeLtv(history, opts)           → { total, monthly_avg, years }
 *   computeCacToLtvRatio(client)        → { cac, ltv, ratio, quality }
 *   classify(score)                     → 'healthy' | 'watch' | 'at_risk' |
 *                                         'critical'
 *
 * ─── Rule: "לעולם לא מוחקים" — never delete ────────────────────────────────
 * The predictor reads read-only arrays. Callers must treat its output as a
 * soft signal — the UI may flag, CRM may schedule follow-ups, but no record
 * is ever removed or deactivated automatically by this module.
 */

'use strict';

// ─── constants ────────────────────────────────────────────────────────────

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const REF_DATE_KEY = '__churn_reference_date__';

/** Signal weights — must sum to 1.0 after seasonal adjustment. */
const WEIGHTS = Object.freeze({
  frequency_drop: 0.18,
  amount_drop: 0.14,
  order_gap: 0.13,
  late_payments: 0.12,
  disputes: 0.10,
  support_tickets: 0.08,
  cancelled_quotes: 0.07,
  info_changes: 0.06,
  contact_drop: 0.07,
  seasonal_adjust: 0.05, // small stabiliser — see applySeasonalDamping()
});

const CLASSIFICATION_THRESHOLDS = Object.freeze({
  healthy: { min: 0, max: 30 },
  watch: { min: 31, max: 60 },
  at_risk: { min: 61, max: 80 },
  critical: { min: 81, max: 100 },
});

/** Bilingual labels for each signal. */
const SIGNAL_LABELS = Object.freeze({
  frequency_drop: { he: 'ירידה בתדירות חשבוניות', en: 'Invoice frequency drop' },
  amount_drop: { he: 'ירידה בסכום חשבונית ממוצע', en: 'Avg invoice amount drop' },
  order_gap: { he: 'עלייה בזמן בין הזמנות', en: 'Order gap widening' },
  late_payments: { he: 'עלייה באיחורי תשלום', en: 'Late payments rising' },
  disputes: { he: 'מחלוקות על תשלומים', en: 'Payment disputes raised' },
  support_tickets: { he: 'תלונות ופניות שירות', en: 'Support / complaint tickets' },
  cancelled_quotes: { he: 'הצעות מחיר שבוטלו', en: 'Cancelled quotes w/o conversion' },
  info_changes: { he: 'שינוי בפרטי חיוב / משלוח', en: 'Billing / shipping changes' },
  contact_drop: { he: 'ירידה בתקשורת', en: 'Contact frequency drop' },
  seasonal_adjust: { he: 'התאמה עונתית', en: 'Seasonal dampening' },
});

/** Sanity ceiling for per-signal raw score (0..100). */
const MAX_SIGNAL = 100;

// ─── date / math utilities (all pure, deterministic) ──────────────────────

function coerceDate(d) {
  if (d == null) return null;
  if (d instanceof Date) {
    return Number.isFinite(d.getTime()) ? new Date(d.getTime()) : null;
  }
  if (typeof d === 'string' || typeof d === 'number') {
    const parsed = new Date(d);
    return Number.isFinite(parsed.getTime()) ? parsed : null;
  }
  return null;
}

function daysBetween(a, b) {
  const da = coerceDate(a);
  const db = coerceDate(b);
  if (!da || !db) return 0;
  return Math.floor((db.getTime() - da.getTime()) / MS_PER_DAY);
}

function clamp(x, lo, hi) {
  if (!Number.isFinite(x)) return lo;
  if (x < lo) return lo;
  if (x > hi) return hi;
  return x;
}

function round2(x) {
  if (!Number.isFinite(x)) return 0;
  return Math.round(x * 100) / 100;
}

function safeNumber(x, fallback) {
  const n = Number(x);
  return Number.isFinite(n) ? n : fallback;
}

function toArray(x) {
  if (Array.isArray(x)) return x;
  if (x == null) return [];
  return [x];
}

/**
 * Resolve the reference "now" used for comparison windows. Passing an explicit
 * reference keeps tests deterministic without monkey-patching Date.
 */
function resolveRef(history) {
  if (history && history[REF_DATE_KEY]) return coerceDate(history[REF_DATE_KEY]);
  if (history && history.reference_date) return coerceDate(history.reference_date);
  return new Date();
}

/**
 * Compute a ratio of (recent rate) vs (baseline rate) and convert the drop
 * into a 0..100 signal. A recent rate equal to the baseline returns 0.
 * A complete halt returns 100.
 */
function dropRatioToSignal(recentRate, baselineRate) {
  if (!Number.isFinite(baselineRate) || baselineRate <= 0) return 0;
  if (!Number.isFinite(recentRate) || recentRate < 0) recentRate = 0;
  const drop = 1 - recentRate / baselineRate;
  if (drop <= 0) return 0;
  return clamp(drop * 100, 0, MAX_SIGNAL);
}

// ─── signal extractors ────────────────────────────────────────────────────

/**
 * Signal 1 — invoice frequency drop.
 * Compare invoices per day over the last 90 days vs the last 365 days.
 */
function signalFrequencyDrop(history, refDate) {
  const invoices = toArray(history && history.invoices);
  if (invoices.length === 0) return 0;
  const cutoff90 = refDate.getTime() - 90 * MS_PER_DAY;
  const cutoff365 = refDate.getTime() - 365 * MS_PER_DAY;

  let count90 = 0;
  let count365 = 0;
  for (const inv of invoices) {
    const d = coerceDate(inv && inv.date);
    if (!d) continue;
    const t = d.getTime();
    if (t < cutoff365) continue;
    if (t > refDate.getTime()) continue;
    count365 += 1;
    if (t >= cutoff90) count90 += 1;
  }
  const rate90 = count90 / 90;
  const rate365 = count365 / 365;
  // If the client has zero history in the last 365 days they are either a
  // brand-new client (no baseline to compare) or already completely gone.
  if (count365 === 0) return 0;
  // If the baseline rate is below one invoice per 120 days we cannot tell a
  // meaningful "drop" from normal cadence — return a softened signal.
  if (rate365 < 1 / 120) return clamp(dropRatioToSignal(rate90, rate365) * 0.5, 0, MAX_SIGNAL);
  return dropRatioToSignal(rate90, rate365);
}

/**
 * Signal 2 — declining average invoice amount.
 * Compare mean amount of invoices in last 90 days vs mean across 90..365d.
 */
function signalAmountDrop(history, refDate) {
  const invoices = toArray(history && history.invoices);
  if (invoices.length === 0) return 0;
  const cutoff90 = refDate.getTime() - 90 * MS_PER_DAY;
  const cutoff365 = refDate.getTime() - 365 * MS_PER_DAY;

  let sumRecent = 0;
  let countRecent = 0;
  let sumBase = 0;
  let countBase = 0;
  for (const inv of invoices) {
    const d = coerceDate(inv && inv.date);
    if (!d) continue;
    const amount = safeNumber(inv && inv.amount, 0);
    if (amount <= 0) continue;
    const t = d.getTime();
    if (t > refDate.getTime()) continue;
    if (t >= cutoff90) {
      sumRecent += amount;
      countRecent += 1;
    } else if (t >= cutoff365) {
      sumBase += amount;
      countBase += 1;
    }
  }
  if (countBase === 0) return 0;
  const avgRecent = countRecent > 0 ? sumRecent / countRecent : 0;
  const avgBase = sumBase / countBase;
  return dropRatioToSignal(avgRecent, avgBase);
}

/**
 * Signal 3 — increased time between orders.
 * Compare average gap (days) for the last 3 orders vs overall average gap.
 */
function signalOrderGap(history, refDate) {
  const orders = toArray(history && history.orders);
  if (orders.length < 2) return 0;
  const dates = orders
    .map((o) => coerceDate(o && o.date))
    .filter(Boolean)
    .sort((a, b) => a.getTime() - b.getTime());
  if (dates.length < 2) return 0;

  const gaps = [];
  for (let i = 1; i < dates.length; i++) {
    gaps.push((dates[i].getTime() - dates[i - 1].getTime()) / MS_PER_DAY);
  }
  const avgAll = gaps.reduce((s, g) => s + g, 0) / gaps.length;
  const tailCount = Math.min(3, gaps.length);
  const tail = gaps.slice(-tailCount);
  const avgTail = tail.reduce((s, g) => s + g, 0) / tail.length;

  // Also include the gap from the most recent order to "now".
  const since = Math.max(0, (refDate.getTime() - dates[dates.length - 1].getTime()) / MS_PER_DAY);
  const effectiveTail = Math.max(avgTail, since);

  if (avgAll <= 0) return 0;
  const growth = effectiveTail / avgAll - 1;
  if (growth <= 0) return 0;
  // 2x gap = 50 points, 3x gap = 100 points
  return clamp(growth * 50, 0, MAX_SIGNAL);
}

/**
 * Signal 4 — late payments rising.
 * Compare the rate of invoices flagged `paid_late` in the last 90 days vs
 * last 365 days.
 */
function signalLatePayments(history, refDate) {
  const invoices = toArray(history && history.invoices);
  if (invoices.length === 0) return 0;
  const cutoff90 = refDate.getTime() - 90 * MS_PER_DAY;
  const cutoff365 = refDate.getTime() - 365 * MS_PER_DAY;

  let lateRecent = 0;
  let totalRecent = 0;
  let lateBase = 0;
  let totalBase = 0;
  for (const inv of invoices) {
    const d = coerceDate(inv && inv.date);
    if (!d) continue;
    const t = d.getTime();
    if (t > refDate.getTime()) continue;
    if (t < cutoff365) continue;
    const isLate = Boolean(
      inv && (inv.paid_late === true || inv.late === true || safeNumber(inv.days_late, 0) > 0)
    );
    if (t >= cutoff90) {
      totalRecent += 1;
      if (isLate) lateRecent += 1;
    } else {
      totalBase += 1;
      if (isLate) lateBase += 1;
    }
  }
  if (totalRecent === 0) return 0;
  const rateRecent = lateRecent / totalRecent;
  const rateBase = totalBase > 0 ? lateBase / totalBase : 0;
  // The delta between recent and baseline is the signal — higher if the
  // client never used to pay late and now does.
  const delta = rateRecent - rateBase;
  if (delta <= 0) return rateRecent * 40; // still flag chronic late payers
  return clamp(40 * rateRecent + 60 * delta, 0, MAX_SIGNAL);
}

/**
 * Signal 5 — payment disputes.
 * Any dispute raised in the last 180 days adds 25 points. Unresolved disputes
 * double the score for that dispute.
 */
function signalDisputes(history, refDate) {
  const disputes = toArray(history && history.disputes);
  if (disputes.length === 0) return 0;
  const cutoff = refDate.getTime() - 180 * MS_PER_DAY;
  let score = 0;
  for (const d of disputes) {
    const raised = coerceDate(d && (d.raised_at || d.date));
    if (!raised || raised.getTime() < cutoff) continue;
    const unresolved = !(d && (d.resolved === true || d.resolved_at));
    score += unresolved ? 50 : 25;
  }
  return clamp(score, 0, MAX_SIGNAL);
}

/**
 * Signal 6 — support / complaint tickets.
 * Uses a ticket count per 90 days weighted by severity.
 */
function signalSupportTickets(history, refDate) {
  const tickets = toArray(history && history.tickets);
  if (tickets.length === 0) return 0;
  const cutoff = refDate.getTime() - 90 * MS_PER_DAY;
  let score = 0;
  let complaintCount = 0;
  for (const t of tickets) {
    const opened = coerceDate(t && (t.opened_at || t.date));
    if (!opened || opened.getTime() < cutoff) continue;
    const sev = (t && typeof t.severity === 'string' ? t.severity : 'normal').toLowerCase();
    const isComplaint = Boolean(t && (t.type === 'complaint' || t.complaint === true));
    let weight = 10;
    if (sev === 'high') weight = 20;
    else if (sev === 'critical') weight = 35;
    else if (sev === 'low') weight = 5;
    if (isComplaint) {
      weight += 10;
      complaintCount += 1;
    }
    score += weight;
  }
  if (complaintCount >= 3) score += 15; // pattern premium
  return clamp(score, 0, MAX_SIGNAL);
}

/**
 * Signal 7 — cancelled quotes without conversion.
 * Quotes that were cancelled in the last 180 days and never turned into an
 * invoice contribute to the risk. Conversion of even one quote resets a
 * portion of the risk.
 */
function signalCancelledQuotes(history, refDate) {
  const quotes = toArray(history && history.quotes);
  if (quotes.length === 0) return 0;
  const cutoff = refDate.getTime() - 180 * MS_PER_DAY;

  let cancelled = 0;
  let converted = 0;
  for (const q of quotes) {
    const created = coerceDate(q && (q.created_at || q.date));
    if (!created || created.getTime() < cutoff) continue;
    const status = (q && typeof q.status === 'string' ? q.status : '').toLowerCase();
    const isConverted = Boolean(q && (q.converted === true || status === 'converted'));
    const isCancelled = Boolean(
      q && (q.cancelled === true || status === 'cancelled' || status === 'rejected')
    );
    if (isConverted) converted += 1;
    else if (isCancelled) cancelled += 1;
  }
  if (cancelled === 0) return 0;
  const conversionRelief = Math.min(0.5, converted * 0.1);
  const base = Math.min(MAX_SIGNAL, cancelled * 20);
  return clamp(base * (1 - conversionRelief), 0, MAX_SIGNAL);
}

/**
 * Signal 8 — billing / shipping info changes.
 * Any change in the last 90 days is mildly suspicious (5 points). Multiple
 * changes compound. Address changes are weighted higher than phone changes.
 */
function signalInfoChanges(history, refDate) {
  const changes = toArray(history && history.info_changes);
  if (changes.length === 0) return 0;
  const cutoff = refDate.getTime() - 90 * MS_PER_DAY;
  let score = 0;
  for (const c of changes) {
    const when = coerceDate(c && (c.changed_at || c.date));
    if (!when || when.getTime() < cutoff) continue;
    const field = (c && typeof c.field === 'string' ? c.field : '').toLowerCase();
    if (field === 'billing_address' || field === 'shipping_address') score += 18;
    else if (field === 'bank_account' || field === 'iban') score += 25;
    else if (field === 'contact_email') score += 10;
    else score += 5;
  }
  return clamp(score, 0, MAX_SIGNAL);
}

/**
 * Signal 9 — contacted less frequently.
 * Compare contact events (calls, meetings, emails) in last 90 vs prior 90.
 */
function signalContactDrop(history, refDate) {
  const contacts = toArray(history && history.contacts);
  if (contacts.length === 0) return 0;
  const now = refDate.getTime();
  const cutoff90 = now - 90 * MS_PER_DAY;
  const cutoff180 = now - 180 * MS_PER_DAY;
  let recent = 0;
  let prior = 0;
  for (const c of contacts) {
    const when = coerceDate(c && (c.at || c.date));
    if (!when) continue;
    const t = when.getTime();
    if (t > now) continue;
    if (t >= cutoff90) recent += 1;
    else if (t >= cutoff180) prior += 1;
  }
  if (prior === 0 && recent === 0) return 0;
  if (prior === 0) return 0;
  return dropRatioToSignal(recent, prior);
}

/**
 * Signal 10 — seasonal adjustment.
 * Returns the damping factor (0..1) to apply to the combined raw score.
 *
 *   damping = 1         → no seasonal effect
 *   damping = 0.5       → halve the score (client is in expected quiet window)
 *
 * Seasonal clients are identified by `history.seasonal = true` plus an array
 * `history.quiet_months` (1..12). When the current month is in quiet_months
 * we apply heavier damping. Callers that don't know can leave it out — we
 * auto-detect seasonality from month-of-year distribution of past invoices
 * using a coefficient-of-variation heuristic.
 */
function applySeasonalDamping(history, refDate, rawScore) {
  if (!history) return { adjustedScore: rawScore, damping: 1, note: null };
  const month = refDate.getMonth() + 1;

  // Explicit metadata wins.
  if (history.seasonal === true && Array.isArray(history.quiet_months)) {
    if (history.quiet_months.includes(month)) {
      return {
        adjustedScore: rawScore * 0.5,
        damping: 0.5,
        note: 'known seasonal buyer — quiet window',
      };
    }
    return { adjustedScore: rawScore, damping: 1, note: null };
  }
  if (history.seasonal === false) {
    return { adjustedScore: rawScore, damping: 1, note: null };
  }

  // Auto-detect: look at month-of-year distribution of invoices over 2+ years.
  const invoices = toArray(history.invoices);
  if (invoices.length < 12) return { adjustedScore: rawScore, damping: 1, note: null };
  const counts = new Array(12).fill(0);
  for (const inv of invoices) {
    const d = coerceDate(inv && inv.date);
    if (!d) continue;
    counts[d.getMonth()] += 1;
  }
  const total = counts.reduce((s, c) => s + c, 0);
  if (total < 12) return { adjustedScore: rawScore, damping: 1, note: null };
  const mean = total / 12;
  let variance = 0;
  for (const c of counts) variance += (c - mean) * (c - mean);
  variance /= 12;
  const stddev = Math.sqrt(variance);
  const cv = stddev / mean; // coefficient of variation

  // High CV + current month has very low count = likely seasonal quiet window.
  const monthCount = counts[refDate.getMonth()];
  if (cv >= 0.6 && monthCount <= mean * 0.4) {
    return {
      adjustedScore: rawScore * 0.7,
      damping: 0.7,
      note: 'auto-detected seasonal pattern — partial damping',
    };
  }
  return { adjustedScore: rawScore, damping: 1, note: null };
}

// ─── classification / suggested actions ───────────────────────────────────

function classify(score) {
  const s = clamp(Math.round(safeNumber(score, 0)), 0, 100);
  if (s <= CLASSIFICATION_THRESHOLDS.healthy.max) return 'healthy';
  if (s <= CLASSIFICATION_THRESHOLDS.watch.max) return 'watch';
  if (s <= CLASSIFICATION_THRESHOLDS.at_risk.max) return 'at_risk';
  return 'critical';
}

/**
 * Suggest Hebrew retention actions based on classification + dominant signal.
 * Accepts either a full prediction object or `{ classification, signals }`.
 */
function suggestAction(client) {
  if (!client) return [];
  const classification = client.classification || classify(client.risk_score || 0);
  const signals = Array.isArray(client.signals) ? client.signals : [];
  const topSignals = [...signals].sort((a, b) => b.score - a.score).slice(0, 3);
  const actions = [];

  if (classification === 'healthy') {
    actions.push('שיחת שימור תקופתית');
    actions.push('לשלוח עדכון על מוצרים חדשים');
    return actions;
  }

  if (classification === 'watch') {
    actions.push('שיחת מעקב');
    actions.push('בירור שביעות רצון');
  }

  if (classification === 'at_risk') {
    actions.push('שיחת מעקב דחופה');
    actions.push('פגישה אישית עם מנהל לקוחות');
    actions.push('הנחה 5% על הזמנה הבאה');
  }

  if (classification === 'critical') {
    actions.push('פגישה אישית מיידית עם מנהל הלקוחות');
    actions.push('הצעה להנחה 10% + תנאי תשלום משופרים');
    actions.push('מעבר אישי של תיק הלקוח להנהלה');
    actions.push('תזמון ועדת שימור');
  }

  // Contextual add-ons keyed by the dominant signals.
  for (const sig of topSignals) {
    if (sig.score < 40) continue;
    switch (sig.key) {
      case 'late_payments':
        actions.push('בירור גמישות בתנאי תשלום');
        break;
      case 'disputes':
        actions.push('טיפול מיידי במחלוקות פתוחות');
        break;
      case 'support_tickets':
        actions.push('שיחה עם צוות השירות על פניות פתוחות');
        break;
      case 'frequency_drop':
        actions.push('הצעה מותאמת אישית למוצרים נרכשים');
        break;
      case 'amount_drop':
        actions.push('ניתוח מחירים מול המתחרים');
        break;
      case 'order_gap':
        actions.push('פנייה יזומה להזמנה הבאה');
        break;
      case 'cancelled_quotes':
        actions.push('בדיקה מדוע בוטלו הצעות המחיר');
        break;
      case 'info_changes':
        actions.push('וידוא פרטי חיוב ומשלוח מעודכנים');
        break;
      case 'contact_drop':
        actions.push('חידוש קשר עם איש הקשר העיקרי');
        break;
      default:
        break;
    }
  }

  // Deduplicate while preserving order.
  const seen = new Set();
  const unique = [];
  for (const a of actions) {
    if (!seen.has(a)) {
      seen.add(a);
      unique.push(a);
    }
  }
  return unique;
}

// ─── LTV / CAC ────────────────────────────────────────────────────────────

/**
 * Compute lifetime value from an invoice history.
 * Returns { total, monthly_avg, years }.
 */
function computeLtv(history, opts) {
  const invoices = toArray(history && history.invoices);
  if (invoices.length === 0) {
    return { total: 0, monthly_avg: 0, years: 0 };
  }
  let total = 0;
  let minTime = Number.POSITIVE_INFINITY;
  let maxTime = Number.NEGATIVE_INFINITY;
  for (const inv of invoices) {
    const d = coerceDate(inv && inv.date);
    const amount = safeNumber(inv && inv.amount, 0);
    if (!d || amount <= 0) continue;
    total += amount;
    const t = d.getTime();
    if (t < minTime) minTime = t;
    if (t > maxTime) maxTime = t;
  }
  if (total === 0 || !Number.isFinite(minTime) || !Number.isFinite(maxTime)) {
    return { total: 0, monthly_avg: 0, years: 0 };
  }
  const refDate =
    (opts && coerceDate(opts.reference_date)) ||
    (history && coerceDate(history.reference_date)) ||
    new Date(maxTime);
  const spanDays = Math.max(1, (refDate.getTime() - minTime) / MS_PER_DAY);
  const months = spanDays / 30.4375;
  const years = spanDays / 365.25;
  const monthly_avg = total / Math.max(1, months);
  return {
    total: round2(total),
    monthly_avg: round2(monthly_avg),
    years: round2(years),
  };
}

/**
 * CAC-to-LTV ratio. Accepts either a client with `cac` set or an opts bag.
 * Quality buckets follow the industry rule of thumb:
 *
 *   ratio < 1         → "loss"           (client costs more than it returns)
 *   1 <= ratio < 3    → "marginal"
 *   3 <= ratio < 5    → "healthy"
 *   ratio >= 5        → "excellent"
 *
 * Returns { cac, ltv, ratio, quality, quality_he }.
 */
function computeCacToLtvRatio(client, opts) {
  if (!client) return { cac: 0, ltv: 0, ratio: 0, quality: 'unknown', quality_he: 'לא ידוע' };
  const history = client.history || client;
  const cac = safeNumber(
    (opts && opts.cac) !== undefined ? opts.cac : client.cac,
    0
  );
  const ltv = computeLtv(history, opts).total;
  if (cac <= 0) {
    return { cac: 0, ltv, ratio: 0, quality: 'unknown', quality_he: 'לא ידוע' };
  }
  const ratio = ltv / cac;
  let quality = 'loss';
  let quality_he = 'הפסדי';
  if (ratio >= 5) {
    quality = 'excellent';
    quality_he = 'מצוין';
  } else if (ratio >= 3) {
    quality = 'healthy';
    quality_he = 'בריא';
  } else if (ratio >= 1) {
    quality = 'marginal';
    quality_he = 'גבולי';
  }
  return { cac: round2(cac), ltv: round2(ltv), ratio: round2(ratio), quality, quality_he };
}

// ─── core predictor ───────────────────────────────────────────────────────

/**
 * Main entry point.
 *
 * @param {string|number} clientId — the client identifier
 * @param {object} history — { invoices, orders, disputes, tickets, quotes,
 *                             info_changes, contacts, seasonal?, quiet_months?,
 *                             reference_date? }
 * @returns {{
 *   client_id: string|number,
 *   risk_score: number,
 *   classification: 'healthy'|'watch'|'at_risk'|'critical',
 *   signals: Array<{key:string, label_he:string, label_en:string, score:number, weight:number}>,
 *   suggested_actions: string[],
 *   seasonal_note: string|null
 * }}
 */
function predictChurn(clientId, history) {
  if (clientId === undefined || clientId === null) {
    throw new TypeError('predictChurn: clientId is required');
  }
  const refDate = resolveRef(history || {});
  const h = history || {};

  const rawSignals = {
    frequency_drop: signalFrequencyDrop(h, refDate),
    amount_drop: signalAmountDrop(h, refDate),
    order_gap: signalOrderGap(h, refDate),
    late_payments: signalLatePayments(h, refDate),
    disputes: signalDisputes(h, refDate),
    support_tickets: signalSupportTickets(h, refDate),
    cancelled_quotes: signalCancelledQuotes(h, refDate),
    info_changes: signalInfoChanges(h, refDate),
    contact_drop: signalContactDrop(h, refDate),
  };

  // Weighted sum over the non-seasonal signals.
  // The remaining seasonal-adjust weight (0.05) is distributed pro-rata so
  // that signals still project to a 0..100 score pre-damping.
  let nonSeasonalWeightTotal = 0;
  for (const key of Object.keys(rawSignals)) nonSeasonalWeightTotal += WEIGHTS[key];
  let weighted = 0;
  const signals = [];
  for (const key of Object.keys(rawSignals)) {
    const score = clamp(rawSignals[key], 0, MAX_SIGNAL);
    const effectiveWeight = WEIGHTS[key] / nonSeasonalWeightTotal;
    weighted += score * effectiveWeight;
    signals.push({
      key,
      label_he: SIGNAL_LABELS[key].he,
      label_en: SIGNAL_LABELS[key].en,
      score: round2(score),
      weight: round2(effectiveWeight),
    });
  }

  const { adjustedScore, damping, note } = applySeasonalDamping(h, refDate, weighted);
  signals.push({
    key: 'seasonal_adjust',
    label_he: SIGNAL_LABELS.seasonal_adjust.he,
    label_en: SIGNAL_LABELS.seasonal_adjust.en,
    score: round2((1 - damping) * 100),
    weight: round2(WEIGHTS.seasonal_adjust),
  });

  const finalScore = clamp(Math.round(adjustedScore), 0, 100);
  const classification = classify(finalScore);

  const prediction = {
    client_id: clientId,
    risk_score: finalScore,
    classification,
    signals,
    suggested_actions: [],
    seasonal_note: note,
  };
  prediction.suggested_actions = suggestAction(prediction);
  return prediction;
}

/**
 * Rank every client from most at-risk to most healthy. Returns a new array
 * (does not mutate input). Each entry has a `prediction` field with the full
 * predictChurn output, plus `ltv` and `cac_ltv` for convenience.
 */
function rankAllClients(clients, opts) {
  const list = toArray(clients);
  const ranked = list.map((c) => {
    const clientId = c && (c.id !== undefined ? c.id : c.client_id);
    const history = c && c.history ? c.history : c;
    const prediction = predictChurn(clientId, history);
    const ltv = computeLtv(history, opts);
    const cacLtv = computeCacToLtvRatio(c, opts);
    return {
      client_id: clientId,
      name: (c && c.name) || '',
      prediction,
      ltv,
      cac_ltv: cacLtv,
      risk_score: prediction.risk_score,
      classification: prediction.classification,
    };
  });
  // Stable sort: descending risk, then descending LTV (prefer keeping
  // high-LTV clients visible at the top of ties), then client_id.
  ranked.sort((a, b) => {
    if (b.risk_score !== a.risk_score) return b.risk_score - a.risk_score;
    if ((b.ltv.total || 0) !== (a.ltv.total || 0)) return (b.ltv.total || 0) - (a.ltv.total || 0);
    return String(a.client_id).localeCompare(String(b.client_id));
  });
  return ranked;
}

// ─── Hebrew retention report ──────────────────────────────────────────────

function padRight(s, n) {
  const str = String(s == null ? '' : s);
  if (str.length >= n) return str.slice(0, n);
  return str + ' '.repeat(n - str.length);
}

function padLeft(s, n) {
  const str = String(s == null ? '' : s);
  if (str.length >= n) return str.slice(0, n);
  return ' '.repeat(n - str.length) + str;
}

/**
 * Bilingual (Hebrew-primary) formatted retention report.
 * Returns a plain-text string suitable for logging, email, or PDF embedding.
 *
 * @param {Array} clients — array of clients (same shape as rankAllClients)
 * @param {object} opts — { top_n, reference_date, title }
 */
function generateRetentionReport(clients, opts) {
  const options = opts || {};
  const topN = safeNumber(options.top_n, 20);
  const title = options.title || 'דוח שימור לקוחות — Client Retention Report';
  const ranked = rankAllClients(clients, options);
  const now = coerceDate(options.reference_date) || new Date();
  const iso = now.toISOString().slice(0, 10);

  const byBucket = { critical: 0, at_risk: 0, watch: 0, healthy: 0 };
  for (const r of ranked) byBucket[r.classification] += 1;

  const lines = [];
  lines.push('═'.repeat(72));
  lines.push(padRight(title, 72));
  lines.push(`תאריך דוח / Report date: ${iso}`);
  lines.push(`סך לקוחות שנבדקו / Clients analysed: ${ranked.length}`);
  lines.push('═'.repeat(72));
  lines.push('');
  lines.push('סיכום סיכון / Risk summary:');
  lines.push(`  קריטי    / critical : ${byBucket.critical}`);
  lines.push(`  בסיכון   / at_risk  : ${byBucket.at_risk}`);
  lines.push(`  במעקב    / watch    : ${byBucket.watch}`);
  lines.push(`  בריא     / healthy  : ${byBucket.healthy}`);
  lines.push('');
  lines.push(`טופ ${topN} לקוחות בסיכון / Top ${topN} clients at risk:`);
  lines.push('-'.repeat(72));
  lines.push(
    padLeft('#', 3) +
      '  ' +
      padRight('שם / Name', 24) +
      padLeft('ציון', 6) +
      '  ' +
      padRight('סטטוס', 12) +
      padLeft('LTV', 12)
  );
  lines.push('-'.repeat(72));

  const top = ranked.slice(0, topN);
  top.forEach((r, i) => {
    const name = r.name || String(r.client_id);
    lines.push(
      padLeft(String(i + 1), 3) +
        '  ' +
        padRight(name, 24) +
        padLeft(String(r.risk_score), 6) +
        '  ' +
        padRight(r.classification, 12) +
        padLeft(String(r.ltv.total || 0), 12)
    );
    const actions = r.prediction.suggested_actions.slice(0, 3);
    if (actions.length > 0) {
      lines.push('     פעולות מוצעות / Actions: ' + actions.join(' · '));
    }
  });
  lines.push('-'.repeat(72));
  lines.push('');
  lines.push('חוקי מערכת / System rules:');
  lines.push('  • לעולם לא מוחקים — הדוח הוא סיגנל בלבד.');
  lines.push('  • Predictor is deterministic and zero-dependency.');
  lines.push('═'.repeat(72));
  return lines.join('\n');
}

// ─── public exports ───────────────────────────────────────────────────────

module.exports = {
  predictChurn,
  rankAllClients,
  generateRetentionReport,
  suggestAction,
  computeLtv,
  computeCacToLtvRatio,
  classify,
  WEIGHTS,
  CLASSIFICATION_THRESHOLDS,
  SIGNAL_LABELS,
  // The internals are exported for testing. They are pure helpers.
  __internal__: {
    signalFrequencyDrop,
    signalAmountDrop,
    signalOrderGap,
    signalLatePayments,
    signalDisputes,
    signalSupportTickets,
    signalCancelledQuotes,
    signalInfoChanges,
    signalContactDrop,
    applySeasonalDamping,
    dropRatioToSignal,
    daysBetween,
    coerceDate,
    resolveRef,
  },
};
