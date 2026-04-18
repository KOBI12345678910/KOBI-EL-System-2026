/**
 * vat-refund.js — Israeli VAT refund claim generator — בקשת החזר מע"מ
 * Agent Y-011 / Swarm 3D / Techno-Kol Uzi Mega-ERP — Wave 2026
 * ---------------------------------------------------------------------------
 *
 * Engine for generating an Israeli VAT refund request (בקשת החזר מע"מ)
 * from the Tax Authority (רשות המסים). When a dealer's input VAT
 * (מע"מ תשומות) exceeds their output VAT (מע"מ עסקאות) for a reporting
 * period, the difference is refundable. Exporters (מעמד יצואן) with
 * zero-rated export sales are entitled to a fast-track refund.
 *
 * Guiding rule: לא מוחקים רק משדרגים ומגדלים —
 *   this file is additive, pure-JS, zero external deps. The optional PDF
 *   letter loads `pdfkit` lazily via `require()` inside a try/catch so the
 *   module is usable without it.
 *
 * Reference legislation:
 *   - חוק מס ערך מוסף, התשל"ו-1975 (ס' 39, 39א)
 *   - תקנות מס ערך מוסף, התשל"ו-1976 (תקנות 23, 23א, 24א)
 *   - הוראת פרשנות 2/2013 — החזרי מס תשומות למעמד יצואן
 *
 * ---------------------------------------------------------------------------
 * Exports:
 *   - generateRefundClaim({period, inputVat, outputVat,
 *                          supportingInvoices, exporterStatus, …})
 *        → refund-claim package + PCN836 reference
 *   - checkExporterEligibility(entity)
 *        → { eligible, fastTrack, reasons, statutoryDays }
 *   - generateSubmissionLetter(claim, opts?)
 *        → { text, html, pdfBuffer? }
 *   - trackRefundStatus(claimId, store?)
 *        → { claim_id, status, history, nextAction }
 *   - computeRefundInterest(claim, paidDate)
 *        → { daysDelayed, interestAmount, annualRate, appliesFromDate }
 *   - REFUND_STATUSES, STATUTORY_DAYS, REQUIRED_DOCS, createStore
 *
 * ---------------------------------------------------------------------------
 * Data model:
 *
 *   RefundClaim:
 *     {
 *       claim_id:       string,   // UUID-ish, generated if not provided
 *       period:         string,   // 'YYYY-MM' monthly or 'YYYY-MMMM' bi-monthly
 *       input_vat:      number,   // מע"מ תשומות (אגורות rounded to 2dp)
 *       output_vat:     number,   // מע"מ עסקאות
 *       refund_amount:  number,   // input_vat - output_vat, must be > 0
 *       exporter:       boolean,  // מעמד יצואן
 *       fast_track:     boolean,  // 30-day track vs 90-day track
 *       statutory_days: number,   // 30 | 45 | 75 | 90
 *       status:         string,   // REFUND_STATUSES enum
 *       submitted_at:   ISO date,
 *       required_docs:  [ RequiredDoc ],
 *       supporting_invoices: [ InvoiceRef ],
 *       pcn836_ref:     string | null,
 *       notes:          string,
 *       history:        [ StatusEvent ]
 *     }
 *
 *   RequiredDoc:
 *     { code, name_he, name_en, mandatory: boolean, attached: boolean }
 *
 *   StatusEvent:
 *     { at: ISO date, from: status, to: status, by: string, note: string }
 * ---------------------------------------------------------------------------
 */

'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// Constants — Israeli 2026 statutory parameters
// ═══════════════════════════════════════════════════════════════════════════

/** Refund status lifecycle — monotonic but allows rejection + re-submission. */
const REFUND_STATUSES = Object.freeze({
  DRAFT:         'draft',          // טיוטה
  SUBMITTED:     'submitted',      // הוגש
  UNDER_REVIEW:  'under_review',   // בטיפול
  INFO_REQUEST:  'info_request',   // דרישת מסמכים
  APPROVED:      'approved',       // אושר
  REJECTED:      'rejected',       // נדחה
  PAID:          'paid',           // שולם
});

const STATUS_LABELS_HE = Object.freeze({
  draft:         'טיוטה',
  submitted:     'הוגש',
  under_review:  'בטיפול',
  info_request:  'דרישת מסמכים משלימים',
  approved:      'אושר',
  rejected:      'נדחה',
  paid:          'שולם',
});

/**
 * Statutory refund windows, in days, counted from the date the claim is
 * accepted as complete (not the date of first submission).
 *
 * ס' 39 + תקנה 24א —
 *   Non-exporter, routine claim:         90 days
 *   Non-exporter, claim ≤ ₪18,880:       30 days (§39(a2))
 *   Exporter (routine track):            45 days  — תקנה 23א
 *   Exporter (fast-track, מעמד יצואן +): 30 days  — הוראת פרשנות 2/2013
 *
 * Values below are upper bounds; interest accrues from day+1.
 */
const STATUTORY_DAYS = Object.freeze({
  ROUTINE:          90,
  SMALL_CLAIM:      30,
  EXPORTER_ROUTINE: 45,
  EXPORTER_FAST:    30,
});

/** Upper-limit of a "small claim" (§39(a2)) — 2026 indexed value, ILS. */
const SMALL_CLAIM_CEILING = 18880;

/**
 * Annual interest rate applied by רשות המסים when they miss the statutory
 * window. Based on חוק ריבית והצמדה על מס, תשמ"א-1981 — currently 4% per
 * annum + CPI linkage. CPI is applied separately; this module uses the
 * flat 4% for the interest component (additive, not mandatory).
 */
const LATE_REFUND_ANNUAL_RATE = 0.04;

/** Canonical list of supporting documents required (or recommended). */
const REQUIRED_DOCS = Object.freeze([
  { code: 'PCN836',       name_he: 'קובץ PCN836 לתקופת הדיווח',             name_en: 'PCN836 file for period',        mandatory: true },
  { code: 'INVOICE_LIST', name_he: 'רשימת חשבוניות תשומות מפורטת',          name_en: 'Detailed input-invoice list',   mandatory: true },
  { code: 'BANK_CONFIRM', name_he: 'אישור ניהול חשבון בנק',                name_en: 'Bank account confirmation',     mandatory: true },
  { code: 'VAT_RETURN',   name_he: 'דו"ח מע"מ תקופתי (טופס 836)',           name_en: 'Periodic VAT return (836)',     mandatory: true },
  { code: 'EXPORT_CERT',  name_he: 'אישור יצואן / רשימוני יצוא (אם רלוונטי)', name_en: 'Exporter certificate (if 0% sales)', mandatory: false },
  { code: 'BOOKS',        name_he: 'הודעה על ניהול ספרים תקין',              name_en: 'Books-in-order notice',          mandatory: false },
  { code: 'CPA_LETTER',   name_he: 'מכתב רו"ח (להחזר מהותי)',                name_en: 'CPA letter (material refunds)', mandatory: false },
]);

/** Exporter eligibility thresholds (2026). */
const EXPORTER_THRESHOLDS = Object.freeze({
  /** Minimum share of export (0%-rated) sales in last 12 months — 20%. */
  MIN_EXPORT_SHARE:          0.20,
  /** Minimum annual export turnover for fast-track status (ILS). */
  MIN_EXPORT_TURNOVER:       4_000_000,
  /** Maximum months of open VAT debt allowed. */
  MAX_OPEN_VAT_DEBT_MONTHS:  0,
});

// ═══════════════════════════════════════════════════════════════════════════
// Utilities — money / dates / ids (pure, no deps)
// ═══════════════════════════════════════════════════════════════════════════

function round2(n) {
  return Math.round(Number(n || 0) * 100) / 100;
}

function isFiniteNum(n) {
  return typeof n === 'number' && Number.isFinite(n);
}

function toDate(d) {
  if (d instanceof Date) return d;
  if (typeof d === 'string' || typeof d === 'number') return new Date(d);
  return new Date();
}

function isoDate(d) {
  const dt = toDate(d);
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const day = String(dt.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function daysBetween(a, b) {
  const MS = 24 * 60 * 60 * 1000;
  const ta = toDate(a).getTime();
  const tb = toDate(b).getTime();
  return Math.floor((tb - ta) / MS);
}

function addDays(d, days) {
  const src = toDate(d);
  const dt = new Date(src.getTime()); // always clone — never mutate caller's Date
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt;
}

/**
 * Cheap UUID-ish (no `crypto` dependency, deterministic enough for claim IDs,
 * unique-enough for a single submission session). Uses Math.random + time.
 */
function newClaimId(prefix = 'VR') {
  const t = Date.now().toString(36);
  const r = Math.random().toString(36).slice(2, 10);
  return `${prefix}-${t}-${r}`.toUpperCase();
}

/** Normalise an Israeli VAT period identifier. Accepts 'YYYY-MM' or Date. */
function normalisePeriod(period) {
  if (!period) throw new Error('period is required');
  if (typeof period === 'string' && /^\d{4}-\d{2}$/.test(period)) return period;
  if (typeof period === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(period)) {
    return period.slice(0, 7);
  }
  const d = toDate(period);
  if (isNaN(d.getTime())) throw new Error(`invalid period: ${period}`);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// checkExporterEligibility
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Decide whether `entity` qualifies for the exporter fast-track refund
 * (מעמד יצואן) under הוראת פרשנות 2/2013.
 *
 * @param {object} entity
 * @param {number} entity.export_turnover_12m — total 0%-rated export sales
 * @param {number} entity.total_turnover_12m  — total sales including exports
 * @param {number} [entity.open_vat_debt_months] — months of outstanding VAT debt
 * @param {boolean} [entity.books_in_order]   — ספרים מנוהלים כדין
 * @param {boolean} [entity.registered]       — registered VAT dealer
 * @returns {{eligible:boolean, fastTrack:boolean, reasons:string[], statutoryDays:number, metrics:object}}
 */
function checkExporterEligibility(entity = {}) {
  const reasons = [];
  const metrics = {
    exportShare:     0,
    exportTurnover:  Number(entity.export_turnover_12m || 0),
    totalTurnover:   Number(entity.total_turnover_12m  || 0),
    openVatDebt:     Number(entity.open_vat_debt_months || 0),
    booksInOrder:    entity.books_in_order !== false,
    registered:      entity.registered !== false,
  };

  if (metrics.totalTurnover > 0) {
    metrics.exportShare = round2(metrics.exportTurnover / metrics.totalTurnover);
  }

  if (!metrics.registered) {
    reasons.push('לא רשום כעוסק — not a registered dealer');
  }
  if (!metrics.booksInOrder) {
    reasons.push('ספרים לא מנוהלים כדין — books not in order');
  }
  if (metrics.openVatDebt > EXPORTER_THRESHOLDS.MAX_OPEN_VAT_DEBT_MONTHS) {
    reasons.push(`חוב מע"מ פתוח (${metrics.openVatDebt} חודשים) — open VAT debt`);
  }
  if (metrics.exportShare < EXPORTER_THRESHOLDS.MIN_EXPORT_SHARE) {
    reasons.push(
      `שיעור יצוא ${Math.round(metrics.exportShare * 100)}% מתחת ל-` +
      `${Math.round(EXPORTER_THRESHOLDS.MIN_EXPORT_SHARE * 100)}% — export share below threshold`
    );
  }

  const eligible = reasons.length === 0;
  const fastTrack =
    eligible && metrics.exportTurnover >= EXPORTER_THRESHOLDS.MIN_EXPORT_TURNOVER;

  let statutoryDays = STATUTORY_DAYS.ROUTINE;
  if (fastTrack) statutoryDays = STATUTORY_DAYS.EXPORTER_FAST;
  else if (eligible) statutoryDays = STATUTORY_DAYS.EXPORTER_ROUTINE;

  return { eligible, fastTrack, reasons, statutoryDays, metrics };
}

// ═══════════════════════════════════════════════════════════════════════════
// generateRefundClaim
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Build a refund-claim package from a period's VAT figures.
 *
 * @param {object} params
 * @param {string|Date} params.period            — 'YYYY-MM' or Date
 * @param {number} params.inputVat               — מע"מ תשומות
 * @param {number} params.outputVat              — מע"מ עסקאות
 * @param {Array<object>} [params.supportingInvoices]
 * @param {object|boolean} [params.exporterStatus] — truthy/eligibility object
 * @param {string} [params.pcn836Ref]            — PCN836 file path / hash
 * @param {string} [params.dealerVatFile]        — 9-digit מספר עוסק
 * @param {string} [params.dealerName]
 * @param {Date}   [params.submittedAt]
 * @param {string} [params.notes]
 * @returns {object} claim package
 */
function generateRefundClaim(params = {}) {
  const {
    period,
    inputVat,
    outputVat,
    supportingInvoices = [],
    exporterStatus = null,
    pcn836Ref = null,
    dealerVatFile = null,
    dealerName = null,
    submittedAt = new Date(),
    notes = '',
  } = params;

  // ── Validation ──────────────────────────────────────────────────────────
  const errors = [];
  if (!isFiniteNum(inputVat) || inputVat < 0)  errors.push('inputVat must be a non-negative number');
  if (!isFiniteNum(outputVat) || outputVat < 0) errors.push('outputVat must be a non-negative number');
  if (!period) errors.push('period is required');

  let normPeriod;
  try { normPeriod = normalisePeriod(period); }
  catch (e) { errors.push(e.message); normPeriod = null; }

  if (errors.length) {
    const err = new Error('invalid refund claim input: ' + errors.join('; '));
    err.errors = errors;
    throw err;
  }

  const inVat  = round2(inputVat);
  const outVat = round2(outputVat);
  const refund = round2(inVat - outVat);

  // No refund is due if output ≥ input
  if (refund <= 0) {
    return {
      ok: false,
      error: 'אין החזר — מע"מ תשומות ≤ מע"מ עסקאות',
      error_en: 'No refund due — input VAT does not exceed output VAT',
      period: normPeriod,
      input_vat: inVat,
      output_vat: outVat,
      refund_amount: 0,
    };
  }

  // ── Exporter + statutory window ─────────────────────────────────────────
  let exporterInfo = { eligible: false, fastTrack: false, statutoryDays: STATUTORY_DAYS.ROUTINE };
  if (exporterStatus && typeof exporterStatus === 'object') {
    // Caller passed either a prior checkExporterEligibility result or an entity.
    exporterInfo = (typeof exporterStatus.eligible === 'boolean')
      ? exporterStatus
      : checkExporterEligibility(exporterStatus);
  } else if (exporterStatus === true) {
    exporterInfo = { eligible: true, fastTrack: true, statutoryDays: STATUTORY_DAYS.EXPORTER_FAST };
  }

  // Small-claim fast refund (§39(a2)) — non-exporter, refund ≤ ceiling.
  let statutoryDays = exporterInfo.statutoryDays;
  if (!exporterInfo.eligible && refund <= SMALL_CLAIM_CEILING) {
    statutoryDays = STATUTORY_DAYS.SMALL_CLAIM;
  }

  // ── Required documents ─────────────────────────────────────────────────
  const requiredDocs = REQUIRED_DOCS.map(doc => {
    const isExportCert = doc.code === 'EXPORT_CERT';
    const isPcnRef     = doc.code === 'PCN836' && !!pcn836Ref;
    const mandatory    = isExportCert ? !!exporterInfo.eligible : doc.mandatory;
    return {
      code:      doc.code,
      name_he:   doc.name_he,
      name_en:   doc.name_en,
      mandatory,
      attached:  isPcnRef, // only PCN auto-attached when a ref is provided
    };
  });

  // ── Supporting-invoice summary ─────────────────────────────────────────
  const invoices = Array.isArray(supportingInvoices) ? supportingInvoices : [];
  const invoiceSummary = invoices.reduce((acc, inv) => {
    acc.count += 1;
    acc.total_amount   += round2(inv.amount      || 0);
    acc.total_vat      += round2(inv.vat         || 0);
    if (inv.is_export || inv.vat_rate === 0) acc.export_count += 1;
    return acc;
  }, { count: 0, total_amount: 0, total_vat: 0, export_count: 0 });
  invoiceSummary.total_amount = round2(invoiceSummary.total_amount);
  invoiceSummary.total_vat    = round2(invoiceSummary.total_vat);

  // Sanity check: sum of invoice VAT should match input_vat (loose tolerance).
  const vatDelta = round2(Math.abs(invoiceSummary.total_vat - inVat));
  const vatReconciles = invoices.length === 0 || vatDelta < 1;

  // ── Assemble claim ─────────────────────────────────────────────────────
  const submitted = toDate(submittedAt);
  const claimId   = params.claimId || newClaimId('VR');
  const deadline  = addDays(submitted, statutoryDays);

  const claim = {
    claim_id:       claimId,
    period:         normPeriod,
    dealer_vat_file: dealerVatFile,
    dealer_name:    dealerName,
    input_vat:      inVat,
    output_vat:     outVat,
    refund_amount:  refund,
    currency:       'ILS',
    exporter:       !!exporterInfo.eligible,
    fast_track:     !!exporterInfo.fastTrack,
    statutory_days: statutoryDays,
    deadline:       isoDate(deadline),
    status:         REFUND_STATUSES.DRAFT,
    submitted_at:   isoDate(submitted),
    required_docs:  requiredDocs,
    supporting_invoices: invoices,
    invoice_summary: invoiceSummary,
    vat_reconciles:  vatReconciles,
    pcn836_ref:     pcn836Ref,
    notes,
    history: [
      {
        at:   isoDate(submitted),
        from: null,
        to:   REFUND_STATUSES.DRAFT,
        by:   'system',
        note: 'Claim generated from period figures',
      },
    ],
  };

  // Human summary (bilingual, single sentence).
  claim.summary_he = `בקשת החזר מע"מ לתקופה ${normPeriod}: ₪${refund.toLocaleString('he-IL')} (מועד יעד: ${claim.deadline}).`;
  claim.summary_en = `VAT refund claim for ${normPeriod}: ILS ${refund.toLocaleString('en-US')} (target date: ${claim.deadline}).`;

  return {
    ok: true,
    claim,
    pcn836_ref: pcn836Ref,
    required_docs: requiredDocs,
    // Missing-docs checklist — items the caller still has to attach.
    missing_docs: requiredDocs.filter(d => d.mandatory && !d.attached).map(d => d.code),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// generateSubmissionLetter
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Produce a formal submission letter (text + HTML, optionally PDF buffer).
 * The letter is addressed to משרד מע"מ and lists the claim particulars,
 * required documents, and a signature line. Bilingual (Hebrew + English).
 *
 * @param {object} claim — the `.claim` object from generateRefundClaim
 * @param {object} [opts]
 * @param {boolean} [opts.includePdf=false] — if true and pdfkit is installed,
 *                                            a `pdfBuffer` is returned
 * @returns {{text:string, html:string, pdfBuffer?:Buffer}}
 */
function generateSubmissionLetter(claim, opts = {}) {
  if (!claim || !claim.claim_id) {
    throw new Error('generateSubmissionLetter: claim with claim_id is required');
  }
  const {
    claim_id, period, refund_amount, dealer_name, dealer_vat_file,
    exporter, fast_track, statutory_days, submitted_at, deadline,
    required_docs = [],
  } = claim;

  const nf = n => Number(n || 0).toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const today = isoDate(new Date());

  // ── Hebrew block ───────────────────────────────────────────────────────
  const heLines = [
    `תאריך: ${today}`,
    '',
    'לכבוד,',
    'משרד מע"מ — רשות המסים בישראל',
    '',
    'הנדון: בקשת החזר מע"מ',
    '',
    `הריני להגיש בזאת בקשת החזר מע"מ בהתאם לסעיף 39 לחוק מע"מ, התשל"ו-1975, לתקופת הדיווח ${period}.`,
    '',
    'פרטי העוסק:',
    `  שם:        ${dealer_name || '—'}`,
    `  מספר עוסק: ${dealer_vat_file || '—'}`,
    '',
    'פרטי הבקשה:',
    `  מספר בקשה:            ${claim_id}`,
    `  מע"מ תשומות:          ₪${nf(claim.input_vat)}`,
    `  מע"מ עסקאות:          ₪${nf(claim.output_vat)}`,
    `  סכום ההחזר המבוקש:    ₪${nf(refund_amount)}`,
    `  מעמד יצואן:           ${exporter ? 'כן' : 'לא'}${fast_track ? ' (מסלול מהיר)' : ''}`,
    `  מועד יעד לתשלום:      ${deadline} (${statutory_days} ימים)`,
    '',
    'מסמכים מצורפים:',
    ...required_docs.filter(d => d.mandatory).map((d, i) => `  ${i + 1}. ${d.name_he}${d.attached ? ' ✓' : ''}`),
    '',
    'אבקש לאשר את ההחזר ולהעבירו לחשבון הבנק הרשום במערכת.',
    '',
    'בכבוד רב,',
    dealer_name || '__________________',
    '',
    '_____________________',
    'חתימת מורשה חתימה',
  ];

  // ── English block ──────────────────────────────────────────────────────
  const enLines = [
    `Date: ${today}`,
    '',
    'To: Israel VAT Office — Tax Authority',
    '',
    'Subject: VAT Refund Claim',
    '',
    `Pursuant to §39 of the Israeli VAT Law 1975, we hereby submit a refund claim for the reporting period ${period}.`,
    '',
    'Dealer particulars:',
    `  Name:      ${dealer_name || '—'}`,
    `  VAT file:  ${dealer_vat_file || '—'}`,
    '',
    'Claim details:',
    `  Claim ID:          ${claim_id}`,
    `  Input VAT:         ILS ${nf(claim.input_vat)}`,
    `  Output VAT:        ILS ${nf(claim.output_vat)}`,
    `  Refund requested:  ILS ${nf(refund_amount)}`,
    `  Exporter status:   ${exporter ? 'Yes' : 'No'}${fast_track ? ' (fast track)' : ''}`,
    `  Statutory due:     ${deadline} (${statutory_days} days)`,
    '',
    'Attached documents:',
    ...required_docs.filter(d => d.mandatory).map((d, i) => `  ${i + 1}. ${d.name_en}${d.attached ? ' [x]' : ''}`),
    '',
    'Please approve the refund and transfer it to our bank account on file.',
    '',
    'Respectfully,',
    dealer_name || '__________________',
  ];

  const text = heLines.join('\n') + '\n\n— — — — — — — — — — — — — — — —\n\n' + enLines.join('\n');

  const html = [
    '<!doctype html>',
    '<html lang="he" dir="rtl"><head>',
    '<meta charset="utf-8"><title>בקשת החזר מע"מ</title>',
    '<style>',
    'body{font-family:Arial,sans-serif;margin:2em;line-height:1.5;}',
    '.en{direction:ltr;text-align:left;margin-top:2em;border-top:1px solid #ccc;padding-top:1em;}',
    'h2{color:#003366;}',
    'table{border-collapse:collapse;margin:.5em 0;}',
    'td{padding:.2em .6em;}',
    '.mono{font-family:monospace;}',
    '</style></head><body>',
    `<h2>בקשת החזר מע"מ — ${period}</h2>`,
    `<p>תאריך: ${today}</p>`,
    '<p>לכבוד,<br>משרד מע"מ — רשות המסים בישראל</p>',
    `<p>הריני להגיש בקשת החזר מע"מ לפי ס' 39 לחוק מע"מ, התשל"ו-1975, לתקופה ${period}.</p>`,
    '<h3>פרטי העוסק</h3>',
    '<table>',
    `<tr><td>שם</td><td>${dealer_name || '—'}</td></tr>`,
    `<tr><td>מספר עוסק</td><td class="mono">${dealer_vat_file || '—'}</td></tr>`,
    '</table>',
    '<h3>פרטי הבקשה</h3>',
    '<table>',
    `<tr><td>מספר בקשה</td><td class="mono">${claim_id}</td></tr>`,
    `<tr><td>מע"מ תשומות</td><td>₪${nf(claim.input_vat)}</td></tr>`,
    `<tr><td>מע"מ עסקאות</td><td>₪${nf(claim.output_vat)}</td></tr>`,
    `<tr><td><b>סכום ההחזר המבוקש</b></td><td><b>₪${nf(refund_amount)}</b></td></tr>`,
    `<tr><td>מעמד יצואן</td><td>${exporter ? 'כן' : 'לא'}${fast_track ? ' (מסלול מהיר)' : ''}</td></tr>`,
    `<tr><td>מועד יעד לתשלום</td><td>${deadline} (${statutory_days} ימים)</td></tr>`,
    '</table>',
    '<h3>מסמכים מצורפים</h3>',
    '<ol>',
    ...required_docs.filter(d => d.mandatory).map(d =>
      `<li>${d.name_he}${d.attached ? ' ✓' : ''}</li>`),
    '</ol>',
    '<p>בכבוד רב,<br>' + (dealer_name || '__________________') + '</p>',
    '<div class="en">',
    `<h2>VAT Refund Claim — ${period}</h2>`,
    enLines.map(l => l.replace(/&/g, '&amp;').replace(/</g, '&lt;')).join('<br>'),
    '</div>',
    '</body></html>',
  ].join('\n');

  const result = { text, html };

  // ── Optional PDF via lazy-loaded pdfkit ────────────────────────────────
  if (opts.includePdf) {
    try {
      // eslint-disable-next-line global-require
      const PDFDocument = require('pdfkit');
      const chunks = [];
      const doc = new PDFDocument({ margin: 50 });
      doc.on('data', c => chunks.push(c));
      const endPromise = new Promise(resolve => doc.on('end', () => resolve()));
      doc.fontSize(16).text('VAT Refund Claim — בקשת החזר מע"מ', { align: 'center' });
      doc.moveDown();
      doc.fontSize(10).text(text);
      doc.end();
      // Synchronous stream-to-buffer only works if pdfkit flushed synchronously;
      // most callers will use the promise form. Attach both.
      result.pdfBuffer = Buffer.concat(chunks);
      result.pdfReady = endPromise.then(() => Buffer.concat(chunks));
    } catch (err) {
      result.pdfError = err.message;
    }
  }

  return result;
}

// ═══════════════════════════════════════════════════════════════════════════
// In-memory status store + trackRefundStatus
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create an isolated status store (for tests + non-DB deployments).
 * Persistence can be plugged in by replacing `.save` / `.load`.
 */
function createStore() {
  const map = new Map();
  return {
    save(claim) {
      if (!claim || !claim.claim_id) throw new Error('claim.claim_id required');
      map.set(claim.claim_id, claim);
      return claim;
    },
    load(id) {
      return map.get(id) || null;
    },
    list() {
      return Array.from(map.values());
    },
    transition(id, toStatus, note = '', by = 'system') {
      const claim = map.get(id);
      if (!claim) throw new Error(`claim not found: ${id}`);
      const from = claim.status;
      claim.status = toStatus;
      claim.history = claim.history || [];
      claim.history.push({
        at: isoDate(new Date()),
        from,
        to: toStatus,
        by,
        note,
      });
      return claim;
    },
  };
}

/** Module-level default store. Tests should use createStore() for isolation. */
const _defaultStore = createStore();

/**
 * Return the current status + lifecycle metadata for a claim.
 * If the claim is not found, returns `{found:false}` rather than throwing.
 */
function trackRefundStatus(claimId, store = _defaultStore) {
  const claim = store.load(claimId);
  if (!claim) return { found: false, claim_id: claimId };

  const today = new Date();
  const deadline = toDate(claim.deadline || addDays(claim.submitted_at, claim.statutory_days));
  const daysRemaining = daysBetween(today, deadline);
  const overdue = daysRemaining < 0;

  let nextAction;
  switch (claim.status) {
    case REFUND_STATUSES.DRAFT:
      nextAction = 'להגיש למע"מ — submit to VAT office';
      break;
    case REFUND_STATUSES.SUBMITTED:
      nextAction = 'להמתין לאישור / To await review';
      break;
    case REFUND_STATUSES.UNDER_REVIEW:
      nextAction = overdue
        ? 'לבקש ריבית על איחור / Request late-refund interest'
        : 'להמתין לסיום הבדיקה / Await review completion';
      break;
    case REFUND_STATUSES.INFO_REQUEST:
      nextAction = 'לספק מסמכים חסרים / Provide requested documents';
      break;
    case REFUND_STATUSES.APPROVED:
      nextAction = 'להמתין לתשלום / Await disbursement';
      break;
    case REFUND_STATUSES.REJECTED:
      nextAction = 'להגיש השגה / File an objection';
      break;
    case REFUND_STATUSES.PAID:
      nextAction = 'תיק סגור / Closed';
      break;
    default:
      nextAction = 'לא ידוע / Unknown';
  }

  return {
    found: true,
    claim_id:        claim.claim_id,
    status:          claim.status,
    status_label_he: STATUS_LABELS_HE[claim.status] || claim.status,
    period:          claim.period,
    refund_amount:   claim.refund_amount,
    submitted_at:    claim.submitted_at,
    deadline:        claim.deadline,
    days_remaining:  daysRemaining,
    overdue,
    history:         claim.history || [],
    nextAction,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// computeRefundInterest
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Compute late-refund interest owed by רשות המסים when they miss the
 * statutory window.
 *
 * Formula (simple-interest, daily pro-rata):
 *   interest = refund_amount × annual_rate × (delay_days / 365)
 *
 * Where `delay_days = max(0, paidDate - deadline)`. Interest begins to
 * accrue from the day AFTER the statutory deadline. Returns 0 if the
 * refund was paid on time.
 *
 * @param {object} claim   — claim object (needs submitted_at, statutory_days, refund_amount, deadline)
 * @param {Date|string} paidDate
 * @param {object} [opts]  — {annualRate?: number}
 */
function computeRefundInterest(claim, paidDate, opts = {}) {
  if (!claim || !isFiniteNum(claim.refund_amount)) {
    throw new Error('computeRefundInterest: claim.refund_amount required');
  }
  const annualRate = isFiniteNum(opts.annualRate) ? opts.annualRate : LATE_REFUND_ANNUAL_RATE;

  const deadline = claim.deadline
    ? toDate(claim.deadline)
    : addDays(claim.submitted_at, claim.statutory_days || STATUTORY_DAYS.ROUTINE);

  const paid = toDate(paidDate);
  const delayDays = Math.max(0, daysBetween(deadline, paid));

  const interest = round2((claim.refund_amount * annualRate * delayDays) / 365);

  return {
    claim_id:         claim.claim_id,
    refund_amount:    round2(claim.refund_amount),
    statutory_days:   claim.statutory_days,
    deadline:         isoDate(deadline),
    paid_date:        isoDate(paid),
    days_delayed:     delayDays,
    annual_rate:      annualRate,
    interest_amount:  interest,
    total_due:        round2(claim.refund_amount + interest),
    applies_from:     isoDate(addDays(deadline, 1)),
    within_statute:   delayDays === 0,
    label_he:         delayDays === 0
      ? 'שולם במועד — אין ריבית'
      : `איחור של ${delayDays} ימים — ריבית ₪${interest.toLocaleString('he-IL')}`,
    label_en:         delayDays === 0
      ? 'Paid on time — no interest'
      : `${delayDays} days late — interest ILS ${interest.toLocaleString('en-US')}`,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Exports
// ═══════════════════════════════════════════════════════════════════════════

module.exports = {
  // primary API
  generateRefundClaim,
  checkExporterEligibility,
  generateSubmissionLetter,
  trackRefundStatus,
  computeRefundInterest,
  // helpers & stores
  createStore,
  // constants (Object.freeze'd, additive only)
  REFUND_STATUSES,
  STATUS_LABELS_HE,
  STATUTORY_DAYS,
  SMALL_CLAIM_CEILING,
  LATE_REFUND_ANNUAL_RATE,
  REQUIRED_DOCS,
  EXPORTER_THRESHOLDS,
  // internals — exposed for unit tests only
  _internals: {
    round2,
    normalisePeriod,
    newClaimId,
    daysBetween,
    addDays,
    isoDate,
  },
};
