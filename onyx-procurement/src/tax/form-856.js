/**
 * form-856.js — טופס 856 (Annual Withholding Report — Freelancers/Contractors).
 * Agent 217 / Wave 2026 / Techno-Kol Uzi Mega-ERP
 * ---------------------------------------------------------------------------
 *
 * Israeli annual withholding-at-source report for **non-employees**:
 * freelancers, independent contractors, professional service providers,
 * landlords (for rent payments), and similar payees that the employer
 * withheld tax from during the calendar year.
 *
 *   • Form 856 (טופס 856) = annual report of payments to freelancers /
 *     contractors with withholding-at-source.
 *   • Form 857 = the BROADER annual employer withholding return covering
 *     BOTH employees and contractors. 856 is the contractor-only subset
 *     with its own tag/file shape and per-row classification code.
 *   • Submitted once a year by the employer (תיק ניכויים) to רשות המסים.
 *   • Electronic submission ("856 מקוון") via שע"מ portal — XML envelope
 *     and a fixed-width fallback per ITA 2026 spec.
 *   • Per-recipient row carries a קוד סיווג (classification code) that
 *     identifies professional vs. construction vs. transport vs. rent
 *     withholding bands. THIS is what distinguishes 856 from 857 on the
 *     wire — 857 collapses recipients into a single category.
 *
 * Source data (from elsewhere in this system):
 *
 *   1. `withholding_tax_certificates` table  — certificates issued per
 *      vendor (certificate_number, vendor_id, vendor_tax_id, period,
 *      fiscal_year, total_payments, withholding_rate, withholding_amount,
 *      issued_date, sent_to_vendor, status). See
 *      `api-server/src/routes/israeli-accounting-engine.ts:147-163`.
 *
 *   2. `contractor-payment-engine.ts` — per-payment ledger that already
 *      tracks `withholding_rate` and `withholding_tax` per contractor
 *      payment line. See `api-server/src/routes/contractor-payment-engine.ts`.
 *      THIS is the granular source the annual aggregator rolls up.
 *
 * The module is the *business-logic* layer that aggregates contractor
 * payments into a per-year, per-vendor 856 record, then produces:
 *
 *   1. `records`        — one record per vendor (recipient).
 *   2. `summary`        — payer-level totals (all recipients) matching the
 *                          "שורת סיכום" trailer at the bottom of 856.
 *   3. `electronicFile` — fixed-width per-row submission file + XML envelope.
 *
 * Zero runtime dependencies. Hebrew compliance throughout. Never mutates
 * or deletes incoming data. **לא מוחקים, רק משדרגים ומגדלים.**
 *
 * Reference:
 *   - פקודת מס הכנסה, סעיפים 164–170
 *   - תקנות מס הכנסה (ניכוי משירותים, מנכסים ומריבית), התשל"ז-1977
 *   - תקנות מס הכנסה (ניכוי מתמורה, מתשלומי הורים…), התשמ"ז-1987
 *   - הנחיות שע"מ — מפרט 856 מקוון, גרסה 2026
 *
 * ---------------------------------------------------------------------------
 * Exports:
 *   - generate856({year, payer, recipients, payments, certificates}) →
 *       { records, summary, electronicFile }
 *   - aggregateRecipient(vendorId, payments, certificates, year) → 856 record
 *   - buildPayerSummary(records, year, payer)                    → summary
 *   - buildElectronicFile(records, summary, options)             → {fixedWidth,xml}
 *   - parseDataLine / parseTrailerLine                            → round-trip
 *   - rowsFromCertificateTable(rows) / rowsFromContractorPayments(rows)
 *       → adapters that normalize raw DB rows into the engine's input shape
 *   - CLASSIFICATION_CODES, FIELD_LAYOUT, RECORD_WIDTH            → constants
 *   - createEngine()                                              → isolated
 *
 * ---------------------------------------------------------------------------
 * Data model (inputs):
 *
 *   Recipient (vendor):
 *     {
 *       vendor_id:      string,   // 9-digit ת"ז or ח.פ.
 *       vendor_name:    string,
 *       classification: string,   // CLASSIFICATION_CODES key (e.g. 'PROF')
 *       address:        string?,
 *     }
 *
 *   Payment (per gross transaction):
 *     {
 *       payment_id:    string,
 *       vendor_id:     string,
 *       date:          ISO date,  // must fall inside `year`
 *       gross:         number,    // before withholding, before VAT
 *       withheld:      number,    // tax taken at source
 *       net:           number,    // gross - withheld
 *       rate:          number,    // 0..1
 *       classification: string?,  // overrides recipient.classification
 *     }
 *
 *   Certificate (for the period covering each payment):
 *     {
 *       vendor_id:        string,
 *       certificate_no:   string,
 *       valid_from:       ISO date,
 *       valid_to:         ISO date,
 *       rate:             number,
 *       issuer:           string,
 *     }
 *
 *   Payer (the entity filing 856):
 *     {
 *       company_id:       string,  // 9-digit
 *       legal_name:       string,
 *       tax_file_number:  string,  // תיק ניכויים
 *       address:          string,
 *       contact:          string,
 *     }
 * ---------------------------------------------------------------------------
 */

'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// Constants — Form 856 fixed-width layout (per שע"מ 2026 spec)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Recipient classification codes (קוד סיווג). The single most important
 * 856-specific field — it tells the Tax Authority which withholding band
 * applies and lets cross-reference checks against the recipient's own
 * 1301 (annual personal return) work.
 *
 * The numeric codes mirror the ITA רשימת סיווגים for 856.
 */
const CLASSIFICATION_CODES = Object.freeze({
  PROF:      { code: '01', he: 'מקצועי / שירותים', en: 'Professional services' },
  CONSTRUCT: { code: '02', he: 'עבודות בנייה',     en: 'Construction work' },
  TRANSPORT: { code: '03', he: 'הובלות',           en: 'Transportation' },
  RENT:      { code: '04', he: 'דמי שכירות',       en: 'Rent payments' },
  INTEREST:  { code: '05', he: 'ריבית',             en: 'Interest' },
  ROYALTY:   { code: '06', he: 'תמלוגים',          en: 'Royalties' },
  OTHER:     { code: '99', he: 'אחר',              en: 'Other' },
});

/** Resolve a classification key (PROF | 'PROF' | '01') to its 2-char code. */
function classifyCode(key) {
  if (!key) return CLASSIFICATION_CODES.OTHER.code;
  const k = String(key).toUpperCase();
  if (CLASSIFICATION_CODES[k]) return CLASSIFICATION_CODES[k].code;
  // Already-numeric? Accept any 2-char digit string we recognize.
  const codes = Object.values(CLASSIFICATION_CODES).map(c => c.code);
  return codes.includes(String(key).padStart(2, '0'))
    ? String(key).padStart(2, '0')
    : CLASSIFICATION_CODES.OTHER.code;
}

/**
 * Field layout for the fixed-width electronic line. Each recipient record
 * is serialized into a single 250-char line. Order matches מפרט 856 v2026.
 * Numeric amounts are whole shekels (no decimal); dates are YYYYMMDD.
 */
const FIELD_LAYOUT = [
  { name: 'record_type',         width:  3, type: 'N', pad: '0' },  // "856"
  { name: 'payer_id',            width:  9, type: 'N', pad: '0' },
  { name: 'tax_year',            width:  4, type: 'N', pad: '0' },
  { name: 'recipient_id',        width:  9, type: 'N', pad: '0' },  // ת.ז./ח.פ.
  { name: 'classification_code', width:  2, type: 'N', pad: '0' },  // 01..99
  { name: 'recipient_name',      width: 50, type: 'H', pad: ' ' },  // Hebrew
  { name: 'certificate_no',      width: 12, type: 'A', pad: ' ' },
  { name: 'cert_valid_from',     width:  8, type: 'D', pad: '0' },
  { name: 'cert_valid_to',       width:  8, type: 'D', pad: '0' },
  { name: 'rate_bp',             width:  4, type: 'N', pad: '0' },  // basis-pts (0.07 → 0700)
  { name: 'gross_total',         width: 12, type: 'N', pad: '0' },
  { name: 'tax_withheld',        width: 12, type: 'N', pad: '0' },
  { name: 'bituach_leumi_wh',    width: 12, type: 'N', pad: '0' },  // when applicable
  { name: 'health_tax_wh',       width: 12, type: 'N', pad: '0' },  // when applicable
  { name: 'net_paid',            width: 12, type: 'N', pad: '0' },
  { name: 'payment_count',       width:  5, type: 'N', pad: '0' },
  { name: 'first_payment_date',  width:  8, type: 'D', pad: '0' },
  { name: 'last_payment_date',   width:  8, type: 'D', pad: '0' },
  { name: 'filler',              width: 18, type: 'A', pad: ' ' },
];

const RECORD_WIDTH = FIELD_LAYOUT.reduce((s, f) => s + f.width, 0);

const TRAILER_LAYOUT = [
  { name: 'record_type',         width:  3, type: 'N', pad: '0' },  // "999"
  { name: 'payer_id',            width:  9, type: 'N', pad: '0' },
  { name: 'tax_year',            width:  4, type: 'N', pad: '0' },
  { name: 'record_count',        width:  7, type: 'N', pad: '0' },
  { name: 'gross_total',         width: 14, type: 'N', pad: '0' },
  { name: 'tax_withheld',        width: 14, type: 'N', pad: '0' },
  { name: 'bituach_leumi_wh',    width: 14, type: 'N', pad: '0' },
  { name: 'health_tax_wh',       width: 14, type: 'N', pad: '0' },
  { name: 'net_paid',            width: 14, type: 'N', pad: '0' },
  { name: 'payment_count',       width:  9, type: 'N', pad: '0' },
  { name: 'filler',              width: RECORD_WIDTH - (3+9+4+7+14*5+9), type: 'A', pad: ' ' },
];
const TRAILER_WIDTH = TRAILER_LAYOUT.reduce((s, f) => s + f.width, 0);

// ═══════════════════════════════════════════════════════════════════════════
// Helpers (numbers, strings, dates, XML)
// ═══════════════════════════════════════════════════════════════════════════

function toNum(v) {
  if (v === null || v === undefined || v === '') return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function round(n, decimals = 2) {
  const f = Math.pow(10, decimals);
  return Math.round(toNum(n) * f) / f;
}
function toShekels(n) { return Math.round(toNum(n)); }

function padNumber(v, width, pad = '0') {
  const s = String(Math.max(0, Math.trunc(toNum(v))));
  return s.length >= width ? s.slice(-width) : pad.repeat(width - s.length) + s;
}
function padString(v, width, pad = ' ') {
  const s = (v === undefined || v === null) ? '' : String(v);
  if (s.length >= width) return s.slice(0, width);
  return s + pad.repeat(width - s.length);
}
function toCompactDate(iso) {
  if (!iso) return '00000000';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '00000000';
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  return `${y}${String(m).padStart(2, '0')}${String(day).padStart(2, '0')}`;
}
function isoYear(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d.getUTCFullYear();
}
function xmlEscape(v) {
  if (v === undefined || v === null) return '';
  return String(v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}
function xmlElement(tag, content, attrs = {}) {
  const a = Object.keys(attrs).map(k => ` ${k}="${xmlEscape(attrs[k])}"`).join('');
  if (content === undefined || content === null || content === '') {
    return `<${tag}${a}/>`;
  }
  return `<${tag}${a}>${content}</${tag}>`;
}

// ═══════════════════════════════════════════════════════════════════════════
// Adapters — turn raw DB rows into the engine's input shape
// ═══════════════════════════════════════════════════════════════════════════

/**
 * From `withholding_tax_certificates` rows (israeli-accounting-engine.ts:147).
 * Useful when the certificate row IS the aggregate (one cert = one yearly
 * total for that vendor). Returns one synthetic payment per certificate so
 * the aggregator can still produce a record.
 */
function rowsFromCertificateTable(rows) {
  if (!Array.isArray(rows)) return { recipients: [], payments: [], certificates: [] };
  const recipients = [];
  const payments = [];
  const certificates = [];
  const seenVendor = new Set();
  for (const r of rows) {
    const vendorId = String(r.vendor_tax_id || r.vendor_id || '').trim();
    if (!vendorId) continue;
    if (!seenVendor.has(vendorId)) {
      recipients.push({
        vendor_id: vendorId,
        vendor_name: r.vendor_name || '',
        classification: r.classification || 'PROF',
      });
      seenVendor.add(vendorId);
    }
    certificates.push({
      vendor_id: vendorId,
      certificate_no: r.certificate_number || '',
      valid_from: r.valid_from || `${r.fiscal_year}-04-01`,
      valid_to: r.valid_to || `${(toNum(r.fiscal_year) || new Date().getUTCFullYear()) + 1}-03-31`,
      rate: toNum(r.withholding_rate) > 1 ? toNum(r.withholding_rate) / 100 : toNum(r.withholding_rate),
      issuer: r.issuer || '',
    });
    payments.push({
      payment_id: `cert-${r.id || r.certificate_number}`,
      vendor_id: vendorId,
      date: r.issued_date || `${r.fiscal_year}-12-31`,
      gross: toNum(r.total_payments),
      withheld: toNum(r.withholding_amount),
      net: toNum(r.total_payments) - toNum(r.withholding_amount),
      rate: toNum(r.withholding_rate) > 1 ? toNum(r.withholding_rate) / 100 : toNum(r.withholding_rate),
    });
  }
  return { recipients, payments, certificates };
}

/**
 * From contractor-payment-engine.ts ledger rows (granular per-project rows).
 * Each row has gross (final_amount), withholding_tax, contractor_id and the
 * recommended_model + paid_date markers — we build per-payment records.
 */
function rowsFromContractorPayments(rows, profilesById = {}) {
  if (!Array.isArray(rows)) return { recipients: [], payments: [], certificates: [] };
  const recipients = [];
  const payments = [];
  const seen = new Set();
  for (const r of rows) {
    const profile = profilesById[r.contractor_id] || {};
    const vendorId = String(profile.tax_id || profile.id_number || r.contractor_id || '').trim();
    if (!vendorId) continue;
    if (!seen.has(vendorId)) {
      recipients.push({
        vendor_id: vendorId,
        vendor_name: profile.full_name || `Contractor #${r.contractor_id}`,
        classification: classifyContractorType(profile.contractor_type),
      });
      seen.add(vendorId);
    }
    const gross = toNum(r.final_amount);
    const withheld = toNum(r.withholding_tax) ||
      gross * (toNum(profile.withholding_rate) / 100);
    payments.push({
      payment_id: String(r.id || `${r.contractor_id}-${r.paid_date}`),
      vendor_id: vendorId,
      date: r.paid_date || r.created_at || new Date().toISOString().slice(0, 10),
      gross,
      withheld: round(withheld),
      net: round(gross - withheld),
      rate: gross > 0 ? round(withheld / gross, 4) : 0,
    });
  }
  return { recipients, payments, certificates: [] };
}

function classifyContractorType(t) {
  switch (String(t || '').toLowerCase()) {
    case 'painter':
    case 'installer':
    case 'production':
    case 'construction':  return 'CONSTRUCT';
    case 'sales_agent':
    case 'consultant':
    case 'professional':  return 'PROF';
    case 'driver':
    case 'transport':     return 'TRANSPORT';
    case 'landlord':
    case 'rent':          return 'RENT';
    default:              return 'PROF';
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Core aggregation — payments → annual record per recipient
// ═══════════════════════════════════════════════════════════════════════════

function pickCertificate(certificates, vendorId, paymentDate) {
  if (!Array.isArray(certificates)) return null;
  const dt = new Date(paymentDate);
  const candidates = certificates.filter(c => String(c.vendor_id) === String(vendorId));
  for (const c of candidates) {
    const from = new Date(c.valid_from);
    const to = new Date(c.valid_to);
    if (!isNaN(from) && !isNaN(to) && dt >= from && dt <= to) return c;
  }
  return candidates[0] || null;
}

/**
 * Aggregate all payments belonging to one recipient (vendor) within `year`.
 */
function aggregateRecipient(recipient, payments, certificates, year) {
  if (!recipient) throw new Error('form-856: recipient is required');
  if (!Number.isInteger(year)) throw new Error('form-856: year must be an integer');

  const vendorId = String(recipient.vendor_id || '').trim();
  const ours = (Array.isArray(payments) ? payments : [])
    .filter(p => p && String(p.vendor_id) === vendorId && isoYear(p.date) === year)
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  let gross_total = 0, tax_withheld = 0, bl_wh = 0, ht_wh = 0, net_paid = 0;
  for (const p of ours) {
    gross_total += toNum(p.gross);
    tax_withheld += toNum(p.withheld);
    bl_wh += toNum(p.bituach_leumi_withheld);
    ht_wh += toNum(p.health_tax_withheld);
    net_paid += toNum(p.net) || (toNum(p.gross) - toNum(p.withheld));
  }

  const firstDate = ours[0]?.date || null;
  const lastDate = ours[ours.length - 1]?.date || null;
  const cert = pickCertificate(certificates, vendorId, lastDate || `${year}-12-31`);
  const classification = ours.find(p => p.classification)?.classification ||
    recipient.classification || 'PROF';

  const avgRate = gross_total > 0 ? tax_withheld / gross_total : 0;

  return {
    year,
    vendor_id: vendorId,
    vendor_name: recipient.vendor_name || '',
    classification,
    classification_code: classifyCode(classification),
    certificate_no: cert?.certificate_no || '',
    certificate: cert ? {
      certificate_no: cert.certificate_no || '',
      valid_from: cert.valid_from || null,
      valid_to: cert.valid_to || null,
      rate: round(toNum(cert.rate), 4),
      issuer: cert.issuer || '',
    } : null,
    rate_used: round(avgRate, 4),
    gross_total: round(gross_total),
    tax_withheld: round(tax_withheld),
    bituach_leumi_withheld: round(bl_wh),
    health_tax_withheld: round(ht_wh),
    net_paid: round(net_paid),
    payment_count: ours.length,
    first_payment_date: firstDate,
    last_payment_date: lastDate,
    payments: ours,
    _self_check: (() => {
      const expected = gross_total - tax_withheld - bl_wh - ht_wh;
      return {
        expected_net: round(expected),
        actual_net: round(net_paid),
        ok: Math.abs(expected - net_paid) < 0.5,
      };
    })(),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Payer summary
// ═══════════════════════════════════════════════════════════════════════════

function buildPayerSummary(records, year, payer) {
  const sum = { gross: 0, withheld: 0, bl: 0, ht: 0, net: 0, count: 0 };
  const byClass = {};
  for (const r of records) {
    sum.gross    += r.gross_total;
    sum.withheld += r.tax_withheld;
    sum.bl       += r.bituach_leumi_withheld;
    sum.ht       += r.health_tax_withheld;
    sum.net      += r.net_paid;
    sum.count    += r.payment_count;
    const c = r.classification_code;
    byClass[c] = byClass[c] || { code: c, count: 0, gross: 0, withheld: 0 };
    byClass[c].count++;
    byClass[c].gross += r.gross_total;
    byClass[c].withheld += r.tax_withheld;
  }
  return {
    year,
    payer_id: payer?.company_id || '',
    payer_name: payer?.legal_name || '',
    tax_file_number: payer?.tax_file_number || '',
    record_count: records.length,
    payment_count: sum.count,
    gross_total: round(sum.gross),
    tax_withheld: round(sum.withheld),
    bituach_leumi_withheld: round(sum.bl),
    health_tax_withheld: round(sum.ht),
    net_paid: round(sum.net),
    by_classification: Object.values(byClass).map(c => ({
      code: c.code,
      count: c.count,
      gross: round(c.gross),
      withheld: round(c.withheld),
    })),
    generated_at: new Date().toISOString(),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Electronic file — fixed-width + XML envelope
// ═══════════════════════════════════════════════════════════════════════════

function serializeField(field, value) {
  const { width, type, pad = ' ', scale } = field;
  switch (type) {
    case 'N': {
      const v = scale ? Math.round(toNum(value) * Math.pow(10, scale)) : toShekels(value);
      return padNumber(v, width, pad);
    }
    case 'D':
      return padNumber(String(value || '').replace(/\D/g, ''), width, '0');
    case 'H':
    case 'A':
    default:
      return padString(value, width, pad);
  }
}

function buildDataLine(record, payer, year) {
  const values = {
    record_type: 856,
    payer_id: toNum((payer?.company_id || '').replace(/\D/g, '')),
    tax_year: year,
    recipient_id: toNum((record.vendor_id || '').replace(/\D/g, '')),
    classification_code: toNum(record.classification_code),
    recipient_name: record.vendor_name,
    certificate_no: record.certificate_no || '',
    cert_valid_from: toCompactDate(record.certificate?.valid_from),
    cert_valid_to:   toCompactDate(record.certificate?.valid_to),
    rate_bp: Math.round(record.rate_used * 10000),  // 0.07 → 700
    gross_total: record.gross_total,
    tax_withheld: record.tax_withheld,
    bituach_leumi_wh: record.bituach_leumi_withheld,
    health_tax_wh: record.health_tax_withheld,
    net_paid: record.net_paid,
    payment_count: record.payment_count,
    first_payment_date: toCompactDate(record.first_payment_date),
    last_payment_date:  toCompactDate(record.last_payment_date),
    filler: '',
  };
  return FIELD_LAYOUT.map(f => serializeField(f, values[f.name])).join('');
}

function buildTrailerLine(summary) {
  const values = {
    record_type: 999,
    payer_id: toNum((summary.payer_id || '').replace(/\D/g, '')),
    tax_year: summary.year,
    record_count: summary.record_count,
    gross_total: summary.gross_total,
    tax_withheld: summary.tax_withheld,
    bituach_leumi_wh: summary.bituach_leumi_withheld,
    health_tax_wh: summary.health_tax_withheld,
    net_paid: summary.net_paid,
    payment_count: summary.payment_count,
    filler: '',
  };
  return TRAILER_LAYOUT.map(f => serializeField(f, values[f.name])).join('');
}

function parseDataLine(line) {
  if (typeof line !== 'string') throw new Error('form-856.parseDataLine: string required');
  if (line.length !== RECORD_WIDTH) {
    throw new Error(`form-856.parseDataLine: expected ${RECORD_WIDTH} chars, got ${line.length}`);
  }
  const out = {};
  let offset = 0;
  for (const f of FIELD_LAYOUT) {
    const chunk = line.slice(offset, offset + f.width);
    offset += f.width;
    if (f.type === 'N') {
      const raw = chunk.replace(/^0+/, '') || '0';
      out[f.name] = toNum(raw);
    } else if (f.type === 'D') {
      out[f.name] = chunk === '00000000'
        ? null
        : `${chunk.slice(0,4)}-${chunk.slice(4,6)}-${chunk.slice(6,8)}`;
    } else {
      out[f.name] = chunk.replace(/\s+$/, '');
    }
  }
  return out;
}

function parseTrailerLine(line) {
  if (typeof line !== 'string' || line.length !== TRAILER_WIDTH) {
    throw new Error(`form-856.parseTrailerLine: expected ${TRAILER_WIDTH} chars`);
  }
  const out = {};
  let offset = 0;
  for (const f of TRAILER_LAYOUT) {
    const chunk = line.slice(offset, offset + f.width);
    offset += f.width;
    out[f.name] = f.type === 'N' ? toNum(chunk.replace(/^0+/, '') || '0')
                                 : chunk.replace(/\s+$/, '');
  }
  return out;
}

function buildElectronicFile(records, summary, options = {}) {
  const year = summary.year;
  const payer = {
    company_id: summary.payer_id,
    legal_name: summary.payer_name,
    tax_file_number: summary.tax_file_number,
  };

  // Header line — fixed-width header per שע"מ §2.1, padded to RECORD_WIDTH.
  const headerCore =
    padNumber(100, 3) +
    padNumber((payer.company_id || '').replace(/\D/g, ''), 9) +
    padNumber(year, 4) +
    padString(payer.legal_name || '', 50) +
    padString(payer.tax_file_number || '', 12) +
    padString((options.submission_type || 'initial'), 10) +
    toCompactDate(new Date().toISOString());
  const header = headerCore + ' '.repeat(Math.max(0, RECORD_WIDTH - headerCore.length));

  const dataLines = records.map(r => buildDataLine(r, payer, year));
  const trailer = buildTrailerLine(summary);
  const lines = [header, ...dataLines, trailer];

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].length !== RECORD_WIDTH && lines[i].length !== TRAILER_WIDTH) {
      throw new Error(`form-856: line ${i} width ${lines[i].length}, expected ${RECORD_WIDTH}`);
    }
  }
  const fixedWidth = lines.join('\n') + '\n';

  // ── XML envelope ──────────────────────────────────────────────────────
  const recordXml = records.map(r => xmlElement('Recipient',
    xmlElement('RecipientId',          xmlEscape(r.vendor_id)) +
    xmlElement('RecipientName',        xmlEscape(r.vendor_name)) +
    xmlElement('ClassificationCode',   xmlEscape(r.classification_code)) +
    xmlElement('ClassificationLabel',  xmlEscape(r.classification)) +
    xmlElement('CertificateNo',        xmlEscape(r.certificate_no)) +
    xmlElement('CertValidFrom',        xmlEscape(r.certificate?.valid_from || '')) +
    xmlElement('CertValidTo',          xmlEscape(r.certificate?.valid_to || '')) +
    xmlElement('AverageRate',          r.rate_used.toFixed(4)) +
    xmlElement('GrossTotal',           toShekels(r.gross_total)) +
    xmlElement('TaxWithheld',          toShekels(r.tax_withheld)) +
    xmlElement('BituachLeumiWithheld', toShekels(r.bituach_leumi_withheld)) +
    xmlElement('HealthTaxWithheld',    toShekels(r.health_tax_withheld)) +
    xmlElement('NetPaid',              toShekels(r.net_paid)) +
    xmlElement('PaymentCount',         r.payment_count) +
    xmlElement('FirstPaymentDate',     xmlEscape(r.first_payment_date || '')) +
    xmlElement('LastPaymentDate',      xmlEscape(r.last_payment_date || ''))
  )).join('');

  const summaryXml = xmlElement('Summary',
    xmlElement('RecordCount',          summary.record_count) +
    xmlElement('PaymentCount',         summary.payment_count) +
    xmlElement('GrossTotal',           toShekels(summary.gross_total)) +
    xmlElement('TaxWithheld',          toShekels(summary.tax_withheld)) +
    xmlElement('BituachLeumiWithheld', toShekels(summary.bituach_leumi_withheld)) +
    xmlElement('HealthTaxWithheld',    toShekels(summary.health_tax_withheld)) +
    xmlElement('NetPaid',              toShekels(summary.net_paid))
  );

  const headerXml = xmlElement('Header',
    xmlElement('FormCode',       '856') +
    xmlElement('TaxYear',        year) +
    xmlElement('PayerId',        xmlEscape(summary.payer_id)) +
    xmlElement('PayerName',      xmlEscape(summary.payer_name)) +
    xmlElement('TaxFile',        xmlEscape(summary.tax_file_number)) +
    xmlElement('SubmissionType', xmlEscape(options.submission_type || 'initial')) +
    xmlElement('GeneratedAt',    xmlEscape(new Date().toISOString()))
  );

  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    xmlElement('Report856',
      headerXml + xmlElement('Recipients', recordXml) + summaryXml,
      { version: '2026.1' }
    );

  return { fixedWidth, xml, lineCount: lines.length, recordWidth: RECORD_WIDTH, trailerWidth: TRAILER_WIDTH };
}

// ═══════════════════════════════════════════════════════════════════════════
// Public API
// ═══════════════════════════════════════════════════════════════════════════

/**
 * MAIN ENTRY POINT.
 * generate856({year, payer, recipients, payments, certificates}) →
 *   { records, summary, electronicFile }
 *
 * Options on the payload:
 *   - submission_type: 'initial' | 'correction'
 *   - lang: 'he' | 'en'
 *
 * If `recipients` is omitted, the recipient list is derived from the unique
 * vendor_ids present in `payments`. Useful when the caller passes only the
 * contractor-payment-engine ledger.
 */
function generate856(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('form-856.generate856: payload {year, payer, payments} required');
  }
  const { year, payer } = payload;
  if (!Number.isInteger(year)) {
    throw new Error('form-856.generate856: payload.year must be an integer');
  }
  const payments = Array.isArray(payload.payments) ? payload.payments : [];
  const certificates = Array.isArray(payload.certificates) ? payload.certificates : [];

  // Derive recipients if missing.
  let recipients = Array.isArray(payload.recipients) ? payload.recipients : null;
  if (!recipients) {
    const seen = new Map();
    for (const p of payments) {
      const id = String(p.vendor_id || '').trim();
      if (!id || seen.has(id)) continue;
      seen.set(id, {
        vendor_id: id,
        vendor_name: p.vendor_name || `Vendor ${id}`,
        classification: p.classification || 'PROF',
      });
    }
    recipients = Array.from(seen.values());
  }

  const records = recipients
    .map(r => aggregateRecipient(r, payments, certificates, year))
    .filter(r => r.payment_count > 0);  // suppress empty rows from filing

  const summary = buildPayerSummary(records, year, payer || {});
  const electronicFile = buildElectronicFile(records, summary, {
    submission_type: payload.submission_type || 'initial',
  });

  return {
    version: '2026.1',
    form_code: '856',
    generated_at: new Date().toISOString(),
    records,
    summary,
    electronicFile,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Engine factory + module exports
// ═══════════════════════════════════════════════════════════════════════════

function createEngine() {
  return {
    generate856, aggregateRecipient, buildPayerSummary, buildElectronicFile,
    parseDataLine, parseTrailerLine, classifyCode,
    rowsFromCertificateTable, rowsFromContractorPayments,
    CLASSIFICATION_CODES, FIELD_LAYOUT, TRAILER_LAYOUT, RECORD_WIDTH, TRAILER_WIDTH,
  };
}

module.exports = {
  // main API
  generate856,
  // sub-functions (partial workflows, tests, API routes)
  aggregateRecipient,
  buildPayerSummary,
  buildElectronicFile,
  parseDataLine,
  parseTrailerLine,
  classifyCode,
  // adapters for raw DB rows
  rowsFromCertificateTable,
  rowsFromContractorPayments,
  // constants
  CLASSIFICATION_CODES,
  FIELD_LAYOUT,
  TRAILER_LAYOUT,
  RECORD_WIDTH,
  TRAILER_WIDTH,
  // factory
  createEngine,
};
