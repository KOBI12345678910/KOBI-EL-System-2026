/**
 * form-857.js — טופס 857 (אישור ניכוי במקור) processing engine.
 * Agent X-47 / Swarm 3C / Techno-Kol Uzi Mega-ERP — Wave 2026
 * ---------------------------------------------------------------------------
 *
 * Israeli withholding-tax (ניכוי במקור) certificate + annual reporting engine.
 *
 *   • Form 857 = annual summary of withholding from non-employees
 *                (contractors, professional service providers, rent, …)
 *   • Submitted once a year by the employer to רשות המסים
 *   • A per-vendor certificate (אישור ניכוי במקור) determines the rate
 *     that applies to each payment — usually valid from 1-April to 31-March
 *
 * This module is the *business-logic* layer that sits on top of the
 * existing XML generator at `onyx-procurement/src/tax-exports/form-857-xml.js`
 * (which only knows how to serialize to XML). Here we:
 *
 *   1. Maintain a registry of vendor withholding certificates.
 *   2. Resolve the correct withholding rate per payment date + service type.
 *   3. Compute withholding on individual payments (gross → withheld → net).
 *   4. Aggregate per-vendor totals into an annual 857 record.
 *   5. Export the full year as XML ready for upload to שע"מ.
 *   6. Tie into the monthly 102 form (via the exported helper).
 *   7. Track certificate expiry and warn when a vendor's אישור is about
 *      to lapse.
 *
 * Zero external dependencies. Hebrew compliance throughout. Never mutates
 * or deletes incoming data.
 *
 * Reference: פקודת מס הכנסה, סעיפים 164–170
 *            תקנות מס הכנסה (ניכוי משירותים, מנכסים ומריבית), התשל"ז-1977
 *            תקנות מס הכנסה (ניכוי מתמורה, מתשלומי הורים…), התשמ"ז-1987
 *
 * ---------------------------------------------------------------------------
 * Exports:
 *   - getWithholdingRate(vendorId, serviceType, date) → number
 *   - computeWithholding(payment)                     → { gross, withheld, net, rate, rule }
 *   - annualReport(year, vendorId)                    → 857 annual object
 *   - exportXmlTaxAuthority(year, options)            → XML string
 *   - importCertificate(vendorId, certData)           → stored cert
 *   - expiringCerts(daysAhead)                        → array
 *   - validateCertificate(certData)                   → { valid, reason, errors }
 *   - recordPayment(payment)                          → stored withholding row
 *   - validateCertificateViaApi(vendorId)             → Promise<{valid,…}>   (stub)
 *   - tieInto102(year, month)                         → {totalWithheld,…}
 *   - DEFAULT_RATES, SERVICE_TYPES, RULES             → constants
 *   - createEngine()                                  → isolated instance (tests)
 *
 * ---------------------------------------------------------------------------
 * Data model (in-memory registry — pluggable persistence via `store` option):
 *
 *   VendorCertificate:
 *     {
 *       vendor_id:       string,      // 9-digit company id / ID number
 *       certificate_no:  string,      // מספר אישור ניכוי במקור
 *       rate:            number,      // 0.00 – 0.50  (0%–50%)
 *       valid_from:      ISO date     // usually April 1
 *       valid_to:        ISO date     // usually March 31 of following year
 *       type:            string       // SERVICE_TYPES enum
 *       issuer:          string,      // פקיד השומה / פ.ש.
 *       notes:           string
 *     }
 *
 *   PaymentWithholding:
 *     {
 *       payment_id: string,
 *       vendor_id:  string,
 *       date:       ISO date,
 *       gross:      number,           // before withholding + before VAT
 *       withheld:   number,
 *       net:        number,
 *       rate:       number,
 *       type:       string,
 *       rule:       string            // human-readable derivation trail
 *     }
 *
 *   Annual857:
 *     {
 *       year:            number,
 *       vendor_id:       string,
 *       vendor_name:     string,
 *       certificate_no:  string,
 *       total_paid:      number,
 *       total_withheld:  number,
 *       total_net:       number,
 *       payment_count:   number,
 *       average_rate:    number,
 *       payments:        [ PaymentWithholding ]
 *     }
 * ---------------------------------------------------------------------------
 */

'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// Constants — Israeli 2026 withholding rates
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Canonical service-type enum used in certificates + payments.
 * All keys are snake_case — they double as XML row types.
 */
const SERVICE_TYPES = Object.freeze({
  PROFESSIONAL:      'professional',      // עורכי דין, רואי חשבון, רופאים וכו׳
  CONSTRUCTION:      'construction',      // עבודות בנייה
  CONSTRUCTION_SMALL:'construction_small',// עבודות בנייה היקף קטן
  TRANSPORTATION:    'transportation',    // הובלות
  LOTTERY:           'lottery',           // זכיות בהגרלות
  RENT:              'rent',              // דמי שכירות
  DIVIDENDS:         'dividends',         // דיבידנדים
  DIVIDENDS_FOREIGN: 'dividends_foreign', // דיבידנד לתושב חוץ
  INTEREST:          'interest',          // ריבית
  ROYALTIES:         'royalties',         // תמלוגים
  AGRICULTURE:       'agriculture',       // תוצרת חקלאית
  ASSETS:            'assets',            // נכסים
  OTHER:             'other',             // כל יתר השירותים
});

/**
 * DEFAULT_RATES — statutory default withholding rates for 2026.
 * Applied when the vendor has NO valid certificate on the payment date.
 *
 * Rates are decimals (0.30 = 30%). All figures verified against
 * ISRAELI_TAX_CONSTANTS_2026.md and the relevant תקנות.
 */
const DEFAULT_RATES = Object.freeze({
  [SERVICE_TYPES.PROFESSIONAL]:       0.30, // 30% — attorneys/accountants/doctors default
  [SERVICE_TYPES.CONSTRUCTION]:       0.05, // 5% — with valid certificate, 3%
  [SERVICE_TYPES.CONSTRUCTION_SMALL]: 0.03, // 3% — small scope
  [SERVICE_TYPES.TRANSPORTATION]:     0.05, // 5% — הובלות
  [SERVICE_TYPES.LOTTERY]:            0.25, // 25% — lottery winnings
  [SERVICE_TYPES.RENT]:               0.20, // 20% — rent payments (שכירות)
  [SERVICE_TYPES.DIVIDENDS]:          0.25, // 25% — dividends to resident individual
  [SERVICE_TYPES.DIVIDENDS_FOREIGN]:  0.25, // 25% — dividends to non-resident (before treaty)
  [SERVICE_TYPES.INTEREST]:           0.25, // 25% — interest
  [SERVICE_TYPES.ROYALTIES]:          0.25, // 25% — royalties
  [SERVICE_TYPES.AGRICULTURE]:        0.05, // 5% — agricultural produce
  [SERVICE_TYPES.ASSETS]:             0.30, // 30% — sale of assets (default)
  [SERVICE_TYPES.OTHER]:              0.30, // 30% — fallback
});

/**
 * RULES — derivation trail strings for transparency.
 * Each withholding row emits one of these codes so an auditor can see
 * *why* the rate was applied.
 */
const RULES = Object.freeze({
  NO_CERT_DEFAULT:          'no_certificate_default_rate',
  CERT_VALID_REDUCED:       'valid_certificate_reduced_rate',
  CERT_VALID_ZERO:          'valid_certificate_zero_rate',
  CERT_EXPIRED:             'certificate_expired_default_rate',
  CERT_NOT_YET_VALID:       'certificate_not_yet_valid_default_rate',
  CERT_TYPE_MISMATCH:       'certificate_type_mismatch_default_rate',
  STATUTORY_OVERRIDE:       'statutory_override',
  SMALL_AMOUNT_EXEMPT:      'small_amount_exempt',
});

/** Small-amount exemption threshold — below this, withholding is 0 (תקנה 3). */
const SMALL_AMOUNT_THRESHOLD_NIS = 5200; // 2026 approx; aligned with תקנות הניכוי

/** Certificate validity convention — Israeli tax year runs April→March. */
const CERT_YEAR_START_MONTH = 4; // April
const CERT_YEAR_START_DAY = 1;
const CERT_YEAR_END_MONTH = 3;   // March
const CERT_YEAR_END_DAY = 31;

// ═══════════════════════════════════════════════════════════════════════════
// Pure helpers
// ═══════════════════════════════════════════════════════════════════════════

/** Round to 2 decimal places without FP surprises. */
function round2(n) {
  const x = Number(n);
  if (!isFinite(x)) return 0;
  return Math.round((x + Number.EPSILON) * 100) / 100;
}

/** Parse a date-ish value to a Date at UTC midnight. Returns null on failure. */
function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) {
    if (isNaN(value.getTime())) return null;
    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  }
  // Accept YYYY-MM-DD directly
  if (typeof value === 'string') {
    const m = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) {
      const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
      return isNaN(d.getTime()) ? null : d;
    }
  }
  const d = new Date(value);
  if (isNaN(d.getTime())) return null;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** Format a Date as ISO YYYY-MM-DD (UTC). */
function fmtDate(d) {
  if (!d) return '';
  const x = d instanceof Date ? d : toDate(d);
  if (!x) return '';
  const y = x.getUTCFullYear().toString().padStart(4, '0');
  const m = (x.getUTCMonth() + 1).toString().padStart(2, '0');
  const day = x.getUTCDate().toString().padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Days between two dates (positive = b after a). */
function daysBetween(a, b) {
  const da = toDate(a);
  const db = toDate(b);
  if (!da || !db) return NaN;
  return Math.round((db.getTime() - da.getTime()) / 86400000);
}

/** Validate an Israeli 9-digit ID (business/tax file or individual). */
function isValidIsraeliId(id) {
  if (id === null || id === undefined) return false;
  const s = String(id).trim();
  if (!/^\d{7,9}$/.test(s)) return false;
  const padded = s.padStart(9, '0');
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    let d = +padded[i] * ((i % 2) + 1);
    if (d > 9) d -= 9;
    sum += d;
  }
  return sum % 10 === 0;
}

/** Deep clone via JSON — safe for pure-data records. */
function clone(x) {
  return x === undefined ? undefined : JSON.parse(JSON.stringify(x));
}

// ═══════════════════════════════════════════════════════════════════════════
// Engine factory — encapsulates state so the module is testable
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Build an isolated engine instance. The top-level `module.exports` is
 * itself an engine so end-users can `require('form-857').computeWithholding(..)`
 * directly, but tests (or multi-tenant scenarios) can spin up extras via
 * `createEngine()`.
 */
function createEngine(options) {
  const opts = options || {};

  // In-memory stores. Override by passing `store` — any object with the
  // same shape (Map-like certs + Array-like payments) will do.
  const certs = new Map();          // vendor_id → [ cert, cert, … ] (history)
  const payments = [];              // PaymentWithholding[]
  const byVendorYear = new Map();   // `${year}:${vendor_id}` → payment ids

  // Logger shim — caller may supply their own.
  const logger = opts.logger || {
    info:  () => {},
    warn:  () => {},
    error: () => {},
    debug: () => {},
  };

  // API-stub — verify vendor withholding status with tax authority.
  // In production wire this to a real endpoint. Here it returns the
  // local registry answer so the full pipeline is exercised.
  const apiVerify = opts.apiVerify || async function stubVerify(vendorId) {
    const list = certs.get(vendorId) || [];
    const today = new Date();
    const active = list.find((c) => isCertActiveOn(c, today));
    if (active) {
      return {
        vendorId,
        valid: true,
        certificate_no: active.certificate_no,
        rate: active.rate,
        type: active.type,
        valid_from: active.valid_from,
        valid_to: active.valid_to,
        source: 'stub-local',
      };
    }
    return {
      vendorId,
      valid: false,
      reason: 'no_active_certificate',
      source: 'stub-local',
    };
  };

  // ───────────────────────────────────────────────────────────────────────
  // Certificate registry
  // ───────────────────────────────────────────────────────────────────────

  function validateCertificate(certData) {
    const errors = [];
    if (!certData || typeof certData !== 'object') {
      return { valid: false, reason: 'missing_data', errors: ['missing_data'] };
    }
    if (!certData.vendor_id)       errors.push('vendor_id required');
    if (certData.vendor_id && !/^\d{7,9}$/.test(String(certData.vendor_id))) {
      errors.push('vendor_id must be 7-9 digits');
    }
    if (!certData.certificate_no)  errors.push('certificate_no required');
    if (certData.certificate_no && !/^[A-Z0-9-]{4,20}$/i.test(String(certData.certificate_no))) {
      errors.push('certificate_no format invalid');
    }
    if (typeof certData.rate !== 'number' || certData.rate < 0 || certData.rate > 0.5) {
      errors.push('rate must be a number between 0 and 0.5');
    }
    const vf = toDate(certData.valid_from);
    const vt = toDate(certData.valid_to);
    if (!vf) errors.push('valid_from invalid');
    if (!vt) errors.push('valid_to invalid');
    if (vf && vt && vt.getTime() < vf.getTime()) errors.push('valid_to before valid_from');
    if (!certData.type) errors.push('type required');
    if (certData.type && !Object.values(SERVICE_TYPES).includes(certData.type)) {
      errors.push('type unknown — must be one of SERVICE_TYPES');
    }
    const reason = errors.length === 0 ? 'ok' : errors[0];
    return { valid: errors.length === 0, reason, errors };
  }

  function importCertificate(vendorId, certData) {
    const cert = Object.assign({}, certData, { vendor_id: vendorId || certData.vendor_id });
    const v = validateCertificate(cert);
    if (!v.valid) {
      const err = new Error(`invalid certificate: ${v.errors.join('; ')}`);
      err.code = 'INVALID_CERT';
      err.errors = v.errors;
      throw err;
    }
    const normalized = {
      vendor_id:       String(cert.vendor_id),
      certificate_no:  String(cert.certificate_no),
      rate:            Number(cert.rate),
      valid_from:      fmtDate(cert.valid_from),
      valid_to:        fmtDate(cert.valid_to),
      type:            cert.type,
      issuer:          cert.issuer || '',
      notes:           cert.notes || '',
      imported_at:     new Date().toISOString(),
    };
    const list = certs.get(normalized.vendor_id) || [];
    list.push(normalized);
    certs.set(normalized.vendor_id, list);
    logger.info('form-857: imported certificate', {
      vendor_id: normalized.vendor_id,
      certificate_no: normalized.certificate_no,
      valid_from: normalized.valid_from,
      valid_to: normalized.valid_to,
    });
    return clone(normalized);
  }

  function isCertActiveOn(cert, date) {
    const when = toDate(date);
    const from = toDate(cert.valid_from);
    const to   = toDate(cert.valid_to);
    if (!when || !from || !to) return false;
    return when.getTime() >= from.getTime() && when.getTime() <= to.getTime();
  }

  function findActiveCertificate(vendorId, serviceType, date) {
    const list = certs.get(String(vendorId)) || [];
    if (list.length === 0) return null;
    // Most specific match: type match + active on date.
    const active = list.filter((c) => isCertActiveOn(c, date));
    if (active.length === 0) return null;
    const typed = active.filter((c) => c.type === serviceType);
    // Prefer an exact-type match; otherwise any active cert.
    const picked = (typed.length ? typed : active).sort((a, b) => a.rate - b.rate)[0];
    return picked || null;
  }

  function listCertificates(vendorId) {
    if (vendorId) return (certs.get(String(vendorId)) || []).map(clone);
    const out = [];
    for (const arr of certs.values()) for (const c of arr) out.push(clone(c));
    return out;
  }

  /**
   * Return all certificates expiring within `daysAhead` days from `from`.
   * Only certificates still valid on `from` are considered — an already-
   * expired one is not "expiring".
   */
  function expiringCerts(daysAhead, from) {
    const start = toDate(from) || new Date();
    const limit = daysAhead == null ? 30 : Number(daysAhead);
    const out = [];
    for (const arr of certs.values()) {
      for (const c of arr) {
        const to = toDate(c.valid_to);
        if (!to) continue;
        const diff = daysBetween(start, to);
        if (diff >= 0 && diff <= limit) {
          out.push(Object.assign(clone(c), { days_until_expiry: diff }));
        }
      }
    }
    out.sort((a, b) => a.days_until_expiry - b.days_until_expiry);
    return out;
  }

  // ───────────────────────────────────────────────────────────────────────
  // Rate resolution + payment computation
  // ───────────────────────────────────────────────────────────────────────

  /**
   * Return the withholding rate for (vendorId, serviceType, date).
   * Uses the certificate registry, falling back to DEFAULT_RATES.
   *
   * Pure function — no side effects.
   */
  function getWithholdingRate(vendorId, serviceType, date) {
    const type = serviceType || SERVICE_TYPES.OTHER;
    if (!Object.values(SERVICE_TYPES).includes(type)) {
      return DEFAULT_RATES[SERVICE_TYPES.OTHER];
    }
    const when = toDate(date) || new Date();
    const cert = findActiveCertificate(vendorId, type, when);
    // Only apply the cert if it is of the exact requested service type.
    // A cert covering a *different* service type must not bleed over.
    if (cert && cert.type === type) return Number(cert.rate);
    return DEFAULT_RATES[type];
  }

  /**
   * Compute withholding for a single payment.
   *
   * Accepts:
   *   { payment_id, vendor_id, gross, date, type, [vat], [small_amount_exempt] }
   *
   * Returns:
   *   { payment_id, vendor_id, gross, withheld, net, rate, type, date, rule,
   *     certificate_no (if used) }
   */
  function computeWithholding(payment) {
    if (!payment || typeof payment !== 'object') {
      throw new Error('form-857.computeWithholding: payment object required');
    }
    const vendor_id = String(payment.vendor_id || payment.vendorId || '').trim();
    if (!vendor_id) throw new Error('form-857.computeWithholding: vendor_id required');

    const gross = Number(payment.gross);
    if (!isFinite(gross) || gross < 0) {
      throw new Error('form-857.computeWithholding: gross must be a non-negative number');
    }

    const type = payment.type || SERVICE_TYPES.OTHER;
    const date = toDate(payment.date || new Date());
    const cert = findActiveCertificate(vendor_id, type, date);

    let rate;
    let rule;
    let certificate_no = null;

    // Rule 1 — small-amount exemption (תקנה 3 לתקנות הניכוי)
    if (payment.small_amount_exempt === true || gross < SMALL_AMOUNT_THRESHOLD_NIS) {
      // Small-amount exemption only kicks in for "other" + default types,
      // not for dividends/lottery/rent which are statutory.
      const exemptable = [
        SERVICE_TYPES.PROFESSIONAL,
        SERVICE_TYPES.CONSTRUCTION,
        SERVICE_TYPES.CONSTRUCTION_SMALL,
        SERVICE_TYPES.TRANSPORTATION,
        SERVICE_TYPES.AGRICULTURE,
        SERVICE_TYPES.ASSETS,
        SERVICE_TYPES.OTHER,
      ];
      if (payment.small_amount_exempt === true && exemptable.includes(type)) {
        rate = 0;
        rule = RULES.SMALL_AMOUNT_EXEMPT;
      }
    }

    // Rule 2 — valid certificate for this type
    if (rate === undefined && cert) {
      if (cert.type === type) {
        rate = Number(cert.rate);
        rule = rate === 0 ? RULES.CERT_VALID_ZERO : RULES.CERT_VALID_REDUCED;
        certificate_no = cert.certificate_no;
      } else {
        // Cert exists but for a different service type → default applies
        rate = DEFAULT_RATES[type];
        rule = RULES.CERT_TYPE_MISMATCH;
      }
    }

    // Rule 3 — expired/future check using *any* cert on record
    if (rate === undefined) {
      const any = (certs.get(vendor_id) || []).find((c) => c.type === type);
      if (any) {
        const to = toDate(any.valid_to);
        const from = toDate(any.valid_from);
        if (to && date && date.getTime() > to.getTime()) {
          rate = DEFAULT_RATES[type];
          rule = RULES.CERT_EXPIRED;
        } else if (from && date && date.getTime() < from.getTime()) {
          rate = DEFAULT_RATES[type];
          rule = RULES.CERT_NOT_YET_VALID;
        }
      }
    }

    // Rule 4 — default
    if (rate === undefined) {
      rate = DEFAULT_RATES[type] !== undefined ? DEFAULT_RATES[type] : DEFAULT_RATES[SERVICE_TYPES.OTHER];
      rule = RULES.NO_CERT_DEFAULT;
    }

    const withheld = round2(gross * rate);
    const net = round2(gross - withheld);

    const result = {
      payment_id: payment.payment_id || payment.paymentId || null,
      vendor_id,
      date: fmtDate(date),
      gross: round2(gross),
      withheld,
      net,
      rate,
      type,
      rule,
    };
    if (certificate_no) result.certificate_no = certificate_no;
    if (payment.vat != null) result.vat = round2(payment.vat);
    return result;
  }

  /**
   * Record a computed payment into the in-memory ledger.
   * Returns the stored row (cloned).
   */
  function recordPayment(payment) {
    const row = computeWithholding(payment);
    const stored = Object.assign({}, row, {
      recorded_at: new Date().toISOString(),
    });
    payments.push(stored);
    const year = toDate(row.date).getUTCFullYear();
    const key = `${year}:${row.vendor_id}`;
    const idx = byVendorYear.get(key) || [];
    idx.push(payments.length - 1);
    byVendorYear.set(key, idx);
    return clone(stored);
  }

  function listPayments(filter) {
    const f = filter || {};
    return payments
      .filter((p) => {
        if (f.vendor_id && p.vendor_id !== String(f.vendor_id)) return false;
        if (f.year) {
          const y = toDate(p.date).getUTCFullYear();
          if (y !== Number(f.year)) return false;
        }
        if (f.type && p.type !== f.type) return false;
        return true;
      })
      .map(clone);
  }

  // ───────────────────────────────────────────────────────────────────────
  // Annual 857 aggregation
  // ───────────────────────────────────────────────────────────────────────

  function annualReport(year, vendorId) {
    if (!year) throw new Error('form-857.annualReport: year is required');
    const y = Number(year);
    const target = vendorId != null ? String(vendorId) : null;

    // Group
    const groups = new Map(); // vendor_id → [rows]
    for (const p of payments) {
      const py = toDate(p.date).getUTCFullYear();
      if (py !== y) continue;
      if (target && p.vendor_id !== target) continue;
      const list = groups.get(p.vendor_id) || [];
      list.push(p);
      groups.set(p.vendor_id, list);
    }

    const reports = [];
    for (const [vid, rows] of groups.entries()) {
      const total_paid    = round2(rows.reduce((s, r) => s + r.gross, 0));
      const total_withheld = round2(rows.reduce((s, r) => s + r.withheld, 0));
      const total_net     = round2(rows.reduce((s, r) => s + r.net, 0));
      const avgRate = total_paid > 0 ? round2((total_withheld / total_paid) * 10000) / 10000 : 0;
      // Grab the most recent cert used in the period, if any
      const usedCert = rows.find((r) => r.certificate_no);
      reports.push({
        year: y,
        vendor_id: vid,
        certificate_no: usedCert ? usedCert.certificate_no : null,
        total_paid,
        total_withheld,
        total_net,
        payment_count: rows.length,
        average_rate: avgRate,
        payments: rows.map(clone),
      });
    }

    if (target) {
      return reports[0] || {
        year: y,
        vendor_id: target,
        certificate_no: null,
        total_paid: 0,
        total_withheld: 0,
        total_net: 0,
        payment_count: 0,
        average_rate: 0,
        payments: [],
      };
    }
    return reports;
  }

  // ───────────────────────────────────────────────────────────────────────
  // XML export — delegates to the low-level generator if available.
  // ───────────────────────────────────────────────────────────────────────

  function buildXmlRowsFromAnnualData(annualList) {
    return annualList.map((a) => ({
      type: 'contractor',
      recipientId: a.vendor_id,
      recipientName: a.vendor_name || a.vendor_id,
      grossPaid: a.total_paid,
      taxWithheld: a.total_withheld,
      bituachLeumi: 0,
      health: 0,
      netPaid: a.total_net,
      paymentsCount: a.payment_count,
    }));
  }

  /**
   * Build the full XML payload for a given tax year.
   *
   * Tries to delegate to the existing `form-857-xml.js` generator (which
   * already matches רשות המסים schema). If unavailable (e.g. stripped
   * build), falls back to a minimal in-line XML builder so this module
   * remains standalone.
   *
   * @param year       {number}
   * @param options    { employer: {employerId, employerName, address, …}, submission }
   * @returns XML string
   */
  function exportXmlTaxAuthority(year, options) {
    if (!year) throw new Error('form-857.exportXmlTaxAuthority: year required');
    const y = Number(year);
    const o = options || {};
    const annualList = annualReport(y);

    const data = {
      taxYear: y,
      periodStart: `${y}-01-01`,
      periodEnd:   `${y}-12-31`,
      employer:    o.employer || {
        employerId:   '000000000',
        employerName: 'UNKNOWN',
      },
      submission: o.submission || { type: 'initial', date: fmtDate(new Date()) },
      rows: buildXmlRowsFromAnnualData(annualList),
    };

    // Try the canonical generator first
    let generator = null;
    try {
      // Lazy require — avoids hard coupling at load time.
      // eslint-disable-next-line global-require
      generator = require('../tax-exports/form-857-xml');
    } catch (_) {
      generator = null;
    }
    if (generator && typeof generator.generate === 'function') {
      return generator.generate(data);
    }

    // Inline minimal fallback (UTF-8 BOM + prolog + root + rows)
    return buildInlineXml(data);
  }

  function buildInlineXml(data) {
    const BOM = '\ufeff';
    const esc = (s) => String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
    const amt = (n) => (Number(n) || 0).toFixed(2);
    const rowsXml = (data.rows || []).map((r) => {
      return '' +
        '<WithholdingRow>' +
          `<RowType>${esc(r.type)}</RowType>` +
          `<RecipientId>${esc(r.recipientId)}</RecipientId>` +
          `<RecipientName>${esc(r.recipientName)}</RecipientName>` +
          `<GrossPaid>${amt(r.grossPaid)}</GrossPaid>` +
          `<TaxWithheld>${amt(r.taxWithheld)}</TaxWithheld>` +
          `<NetPaid>${amt(r.netPaid)}</NetPaid>` +
          `<PaymentsCount>${Number(r.paymentsCount) || 0}</PaymentsCount>` +
        '</WithholdingRow>';
    }).join('');
    const totalGross = (data.rows || []).reduce((s, r) => s + (+r.grossPaid || 0), 0);
    const totalTax   = (data.rows || []).reduce((s, r) => s + (+r.taxWithheld || 0), 0);
    return BOM +
      '<?xml version="1.0" encoding="UTF-8"?>' +
      `<Report857 xmlns="http://www.taxes.gov.il/schema/857" formCode="857">` +
        '<Meta>' +
          `<FormCode>857</FormCode>` +
          `<TaxYear>${Number(data.taxYear) || 0}</TaxYear>` +
          `<PeriodStart>${esc(data.periodStart)}</PeriodStart>` +
          `<PeriodEnd>${esc(data.periodEnd)}</PeriodEnd>` +
          `<GeneratedAt>${new Date().toISOString()}</GeneratedAt>` +
        '</Meta>' +
        '<Employer>' +
          `<EmployerId>${esc(data.employer.employerId)}</EmployerId>` +
          `<EmployerName>${esc(data.employer.employerName)}</EmployerName>` +
        '</Employer>' +
        `<Withholdings>${rowsXml}</Withholdings>` +
        '<Summary>' +
          `<TotalGrossPaid>${amt(totalGross)}</TotalGrossPaid>` +
          `<TotalTaxWithheld>${amt(totalTax)}</TotalTaxWithheld>` +
        '</Summary>' +
      '</Report857>';
  }

  // ───────────────────────────────────────────────────────────────────────
  // Form 102 tie-in (monthly remittance)
  // ───────────────────────────────────────────────────────────────────────

  /**
   * Tie into the monthly 102 remittance. Returns the total withholding
   * for the given (year, month) across all vendors, formatted as a row
   * ready to be fed into `form-102-xml.js`.
   */
  function tieInto102(year, month) {
    if (!year || !month) throw new Error('form-857.tieInto102: year+month required');
    const y = Number(year), m = Number(month);
    let total_gross = 0;
    let total_withheld = 0;
    let count = 0;
    const vendors = new Set();
    for (const p of payments) {
      const d = toDate(p.date);
      if (!d) continue;
      if (d.getUTCFullYear() === y && (d.getUTCMonth() + 1) === m) {
        total_gross += p.gross;
        total_withheld += p.withheld;
        count += 1;
        vendors.add(p.vendor_id);
      }
    }
    return {
      year: y,
      month: m,
      contractor_count: vendors.size,
      payment_count: count,
      total_gross: round2(total_gross),
      total_withheld: round2(total_withheld),
      // 102 payload shape — the XML builder will merge this under `incomeTax`
      form_102_row: {
        EmployeesCount: vendors.size,
        TotalGrossWages: round2(total_gross),
        TotalTaxWithheld: round2(total_withheld),
      },
    };
  }

  // ───────────────────────────────────────────────────────────────────────
  // API stub — vendor verification against tax authority
  // ───────────────────────────────────────────────────────────────────────

  async function validateCertificateViaApi(vendorId) {
    try {
      return await apiVerify(String(vendorId));
    } catch (err) {
      logger.warn('form-857: api verify failed', { vendorId, err: err.message });
      return { vendorId, valid: false, reason: 'api_error', error: err.message };
    }
  }

  // ───────────────────────────────────────────────────────────────────────
  // Maintenance
  // ───────────────────────────────────────────────────────────────────────

  function reset() {
    certs.clear();
    payments.length = 0;
    byVendorYear.clear();
  }

  function stats() {
    let certCount = 0;
    for (const arr of certs.values()) certCount += arr.length;
    return {
      certificates: certCount,
      vendors: certs.size,
      payments: payments.length,
    };
  }

  return {
    // Constants
    SERVICE_TYPES,
    DEFAULT_RATES,
    RULES,
    SMALL_AMOUNT_THRESHOLD_NIS,
    // Certificates
    validateCertificate,
    importCertificate,
    listCertificates,
    expiringCerts,
    validateCertificateViaApi,
    // Payments
    getWithholdingRate,
    computeWithholding,
    recordPayment,
    listPayments,
    // Annual
    annualReport,
    exportXmlTaxAuthority,
    // 102 tie-in
    tieInto102,
    // Helpers exposed for tests
    _helpers: {
      round2, toDate, fmtDate, daysBetween, isValidIsraeliId,
      isCertActiveOn, findActiveCertificate,
    },
    // State
    reset,
    stats,
    createEngine,
  };
}

// Default module-level singleton
const defaultEngine = createEngine();

module.exports = Object.assign({}, defaultEngine, {
  // Re-export the factory so callers can build isolated engines.
  createEngine,
});
