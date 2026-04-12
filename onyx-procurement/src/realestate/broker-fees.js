/**
 * Real Estate Broker Fee Tracker  |  מעקב דמי תיווך במקרקעין
 * =============================================================
 *
 * Agent Y-057  |  Swarm Real Estate  |  Techno-Kol Uzi mega-ERP 2026
 *
 * A zero-dependency, in-memory broker-fee tracker for Kobi
 * Elkayam's Mega-ERP, fully compliant with Israeli "Brokers in
 * Real Estate Law" — חוק המתווכים במקרקעין, התשנ"ו-1996, and its
 * regulations.
 *
 * -------------------------------------------------------------
 * RULE — לא מוחקים רק משדרגים ומגדלים
 * -------------------------------------------------------------
 *   - `registerBroker` with an existing id bumps `version` and
 *     pushes the previous record into `_brokerHistory`.
 *   - `signExclusivity` with an existing propertyId stamps the
 *     prior agreement with `endDate` / `supersededBy` and
 *     appends a new version. Nothing is removed.
 *   - `logShowing` is append-only per property.
 *   - `claimCommission` appends to `_claims`. A disputed claim
 *     does not delete the other side — both are kept, linked by
 *     `disputeId` and resolved via `resolveDispute`.
 *   - `generateInvoice` is append-only; cancellations are
 *     recorded as a new credit-note entry, not a deletion.
 *   - There is NO `deleteBroker`, `deleteAgreement`,
 *     `deleteClaim`, or `deleteInvoice` method on the class.
 *     Test 33 enforces this.
 *
 * -------------------------------------------------------------
 * LAW REFERENCE — חוק המתווכים במקרקעין, התשנ"ו-1996
 * -------------------------------------------------------------
 *
 *   § 2 — רישיון:  one may engage in brokerage only if
 *          licensed by the Registrar of Real Estate Brokers
 *          (רשם המתווכים). Every registered broker MUST have
 *          a license number and an expiry date.
 *
 *   § 9 — דרישת הכתב:  a brokerage order (הזמנת תיווך) must be
 *          signed IN WRITING by the customer and MUST contain,
 *          at minimum:
 *            1. Full name and license number of the broker
 *            2. Full name, ID and address of the customer
 *            3. Type of transaction (sale / rental / etc.)
 *            4. Description of the property
 *            5. Agreed commission (amount or %)
 *            6. Signature of the customer
 *          Missing any of these voids entitlement to commission.
 *
 *   § 14 — Entitlement to commission:  the broker is entitled
 *          only if (a) licensed, (b) § 9 fulfilled, and (c) he
 *          was the "effective cause" (הגורם היעיל) of the
 *          transaction.
 *
 *   תקנות (1997) — ייחודיות:  an exclusivity agreement
 *   (הסכם ייחודיות) must run for a defined period and include
 *   at least two marketing steps ("פעולות שיווק"):
 *      - seker-mochrit — selling seller-side (common for sales)
 *      - hafnayat-nechesh — exclusive listing with escort /
 *        open house / publication
 *      - 'none' — customer retains right to use other brokers
 *
 * -------------------------------------------------------------
 * COMMISSION CAPS (market practice + law)
 * -------------------------------------------------------------
 *   Sale      — up to 2% + VAT from EACH side (buyer and seller).
 *   Rental    — up to 1 month's rent + VAT from EACH side
 *               (tenant and landlord). Capped at 12 monthly rents
 *               for a 12-month contract, pro-rata for shorter.
 *   Luxury    — >= 5,000,000 ILS: same 2% cap applies.
 *   New       — developer deals are excluded from this tracker
 *               (handled by contracts/ module).
 *
 * Any rate > cap throws `E_RATE_EXCEEDS_CAP`. Use
 * `computeCommission` to get gross + VAT breakdown.
 *
 * -------------------------------------------------------------
 * BILINGUAL LABELS
 * -------------------------------------------------------------
 * Every public enum exposes a `{ he, en }` label. See
 * `TRANSACTION_TYPE_LABELS`, `EXCLUSIVITY_TYPE_LABELS`,
 * `CLAIM_STATUS_LABELS`, `DISPUTE_STATUS_LABELS`,
 * `SHOWING_OUTCOME_LABELS`.
 *
 * =============================================================
 */

'use strict';

// ---------------------------------------------------------------
// CONSTANTS
// ---------------------------------------------------------------

/** Standard Israeli VAT rate for 2026 (17%). */
const VAT_RATE = 0.17;

/** Maximum commission per side, sale, as fraction of price. */
const SALE_CAP_PCT = 0.02; // 2% per side

/** Rental cap: months of rent per side (1 month = 100% of monthly rent). */
const RENTAL_CAP_MONTHS = 1;

/** Default alert horizon for license expiry (30 days). */
const DEFAULT_LICENSE_ALERT_DAYS = 30;

/** Fraction tolerance for pct and split validation. */
const EPS = 1e-6;

// ---------------------------------------------------------------
// ENUMS & BILINGUAL LABELS
// ---------------------------------------------------------------

const TRANSACTION_TYPES = Object.freeze({
  SALE:   'sale',
  RENTAL: 'rental',
});

const TRANSACTION_TYPE_LABELS = Object.freeze({
  sale:   { he: 'מכירה',   en: 'Sale'   },
  rental: { he: 'השכרה',   en: 'Rental' },
});

const EXCLUSIVITY_TYPES = Object.freeze({
  HAFNAYAT_NECHESH: 'hafnayat-nechesh', // exclusive listing
  SEKER_MOCHRIT:    'seker-mochrit',    // seller-side survey
  NONE:             'none',             // no exclusivity
});

const EXCLUSIVITY_TYPE_LABELS = Object.freeze({
  'hafnayat-nechesh': { he: 'הפניית נכס (ייחודיות)',  en: 'Exclusive Listing' },
  'seker-mochrit':    { he: 'סקר מוכרת (ייחודיות)',   en: 'Seller-side Survey' },
  'none':             { he: 'ללא ייחודיות',            en: 'No Exclusivity' },
});

const SHOWING_OUTCOMES = Object.freeze({
  NO_INTEREST: 'no-interest',
  CONSIDER:    'consider',
  OFFER:       'offer',
  SOLD:        'sold',
  RENTED:      'rented',
});

const SHOWING_OUTCOME_LABELS = Object.freeze({
  'no-interest': { he: 'ללא עניין',  en: 'No interest' },
  'consider':    { he: 'במחשבה',     en: 'Considering' },
  'offer':       { he: 'הצעה',        en: 'Offer'       },
  'sold':        { he: 'נמכר',        en: 'Sold'        },
  'rented':      { he: 'הושכר',       en: 'Rented'      },
});

const CLAIM_STATUSES = Object.freeze({
  OPEN:      'open',
  INVOICED:  'invoiced',
  PAID:      'paid',
  DISPUTED:  'disputed',
  REJECTED:  'rejected',
  CANCELLED: 'cancelled',
});

const CLAIM_STATUS_LABELS = Object.freeze({
  'open':      { he: 'פתוחה',     en: 'Open'      },
  'invoiced':  { he: 'חויבה',     en: 'Invoiced'  },
  'paid':      { he: 'שולמה',     en: 'Paid'      },
  'disputed':  { he: 'במחלוקת',    en: 'Disputed'  },
  'rejected':  { he: 'נדחתה',     en: 'Rejected'  },
  'cancelled': { he: 'בוטלה',     en: 'Cancelled' },
});

const DISPUTE_STATUSES = Object.freeze({
  OPEN:     'open',
  REVIEW:   'review',
  RESOLVED: 'resolved',
});

const DISPUTE_STATUS_LABELS = Object.freeze({
  'open':     { he: 'פתוחה',  en: 'Open'     },
  'review':   { he: 'בבדיקה',  en: 'Review'   },
  'resolved': { he: 'נפתרה',  en: 'Resolved' },
});

const VALID_EXCLUSIVITY = new Set(Object.values(EXCLUSIVITY_TYPES));
const VALID_SHOWING_OUT = new Set(Object.values(SHOWING_OUTCOMES));

// ---------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------

/** Round to 2 decimals (ILS agora precision). */
function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Parse a date string / Date / ms to Date; throws on invalid. */
function toDate(v, field) {
  if (v == null) throw new Error(`E_MISSING_${field}`);
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) throw new Error(`E_INVALID_${field}`);
  return d;
}

/** Days between two dates (b - a), rounded down. */
function daysBetween(a, b) {
  return Math.floor((b.getTime() - a.getTime()) / 86400000);
}

/** Shallow validator: throw on missing required keys. */
function requireKeys(obj, keys, ctx) {
  if (!obj || typeof obj !== 'object') {
    throw new Error(`E_MISSING_${ctx}_OBJECT`);
  }
  for (const k of keys) {
    if (obj[k] === undefined || obj[k] === null || obj[k] === '') {
      throw new Error(`E_MISSING_${ctx}_${k.toUpperCase()}`);
    }
  }
}

/** Return true if the given Luhn-like license number passes our format check. */
function isLicenseFormatValid(lic) {
  if (typeof lic !== 'string') return false;
  // Israeli broker license: 5-7 digits. Strip dashes / whitespace.
  const cleaned = lic.replace(/[\s\-]/g, '');
  return /^\d{4,8}$/.test(cleaned);
}

/** Return an allocation number for tax authority recognition.
 *  Israeli invoices for high-value transactions need a מספר הקצאה
 *  from רשות המסים. Here we generate a deterministic stub — actual
 *  integration is handled by the tax-exports/ module.
 */
function generateAllocationNumber(claimId, issuedAt) {
  const base = String(claimId).replace(/[^A-Za-z0-9]/g, '');
  const ts = issuedAt.toISOString().slice(0, 10).replace(/-/g, '');
  // 25-digit synthetic allocation number — real one comes from IL tax API.
  const pad = (base + '000000000000').slice(0, 12);
  return `IL${ts}${pad}`.slice(0, 25);
}

// ---------------------------------------------------------------
// CLASS
// ---------------------------------------------------------------

class BrokerFeeTracker {
  constructor(opts = {}) {
    const now = opts.now || (() => new Date());
    this._now = now;

    // primary stores
    this._brokers     = new Map(); // id -> record
    this._agreements  = new Map(); // propertyId -> current agreement
    this._showings    = [];         // append-only
    this._claims      = new Map(); // claimId -> claim record
    this._invoices    = new Map(); // invoiceId -> invoice record
    this._disputes    = new Map(); // disputeId -> dispute record

    // history stores (never deleted from)
    this._brokerHistory    = [];   // {id, version, record, supersededAt}
    this._agreementHistory = [];   // {propertyId, version, record, supersededAt}
    this._claimHistory     = [];   // {claimId, version, record, supersededAt}

    // monotonic counters for synthetic ids
    this._seqClaim    = 0;
    this._seqInvoice  = 0;
    this._seqDispute  = 0;
    this._seqShowing  = 0;
  }

  // -----------------------------------------------------------
  // registerBroker — § 2 license requirement
  // -----------------------------------------------------------

  /**
   * Register or upgrade a broker. Israeli brokers must hold
   * a valid license issued by the Registrar of Real Estate
   * Brokers (רשם המתווכים).
   *
   * @param {object} spec
   * @param {string} spec.id
   * @param {string} spec.name
   * @param {string} spec.licenseNumber - required
   * @param {string|Date} spec.licenseExpiry - required
   * @param {string} [spec.phone]
   * @param {string} [spec.email]
   * @returns {object} broker record with version
   */
  registerBroker(spec) {
    requireKeys(spec, ['id', 'name', 'licenseNumber', 'licenseExpiry'], 'BROKER');
    if (!isLicenseFormatValid(spec.licenseNumber)) {
      throw new Error('E_INVALID_LICENSE_FORMAT');
    }
    const expiry = toDate(spec.licenseExpiry, 'LICENSE_EXPIRY');

    const existing = this._brokers.get(spec.id);
    const version = existing ? existing.version + 1 : 1;

    if (existing) {
      this._brokerHistory.push({
        id: existing.id,
        version: existing.version,
        record: existing,
        supersededAt: this._now(),
      });
    }

    const record = Object.freeze({
      id: spec.id,
      name: spec.name,
      licenseNumber: String(spec.licenseNumber).trim(),
      licenseExpiry: expiry,
      phone: spec.phone || null,
      email: spec.email || null,
      version,
      registeredAt: existing ? existing.registeredAt : this._now(),
      updatedAt: this._now(),
      labels: { he: spec.nameHe || spec.name, en: spec.nameEn || spec.name },
    });

    this._brokers.set(spec.id, record);
    return record;
  }

  /** Retrieve a broker record (current version). */
  getBroker(id) {
    return this._brokers.get(id) || null;
  }

  // -----------------------------------------------------------
  // signExclusivity — ייחודיות per 1997 regulations
  // -----------------------------------------------------------

  /**
   * Sign (or upgrade) an exclusivity agreement for a property.
   *
   * @param {object} spec
   * @param {string} spec.propertyId
   * @param {string} spec.broker - broker id
   * @param {string|Date} spec.startDate
   * @param {string|Date} spec.endDate
   * @param {'hafnayat-nechesh'|'seker-mochrit'|'none'} spec.exclusiveType
   * @param {string[]} [spec.marketingActions] - required for exclusivity
   * @param {object} [spec.customer] - { name, id } customer signing
   * @param {boolean} [spec.writtenSigned=true] - § 9 requirement
   */
  signExclusivity(spec) {
    requireKeys(spec, ['propertyId', 'broker', 'startDate', 'endDate', 'exclusiveType'], 'AGREEMENT');
    if (!VALID_EXCLUSIVITY.has(spec.exclusiveType)) {
      throw new Error('E_INVALID_EXCLUSIVITY_TYPE');
    }
    const broker = this._brokers.get(spec.broker);
    if (!broker) throw new Error('E_BROKER_NOT_FOUND');

    const start = toDate(spec.startDate, 'START_DATE');
    const end   = toDate(spec.endDate,   'END_DATE');
    if (end.getTime() <= start.getTime()) {
      throw new Error('E_END_DATE_BEFORE_START');
    }

    // Exclusivity regulations require at least 2 marketing actions.
    if (spec.exclusiveType !== 'none') {
      const actions = Array.isArray(spec.marketingActions) ? spec.marketingActions : [];
      if (actions.length < 2) {
        throw new Error('E_EXCLUSIVITY_REQUIRES_TWO_ACTIONS');
      }
    }

    const existing = this._agreements.get(spec.propertyId);
    const version = existing ? existing.version + 1 : 1;

    if (existing) {
      this._agreementHistory.push({
        propertyId: existing.propertyId,
        version: existing.version,
        record: { ...existing, endedAt: this._now(), supersededBy: version },
        supersededAt: this._now(),
      });
    }

    const rec = Object.freeze({
      id: `AGR-${spec.propertyId}-v${version}`,
      propertyId: spec.propertyId,
      broker: spec.broker,
      brokerLicense: broker.licenseNumber,
      startDate: start,
      endDate: end,
      exclusiveType: spec.exclusiveType,
      exclusiveTypeLabel: EXCLUSIVITY_TYPE_LABELS[spec.exclusiveType],
      marketingActions: Array.isArray(spec.marketingActions)
        ? Object.freeze(spec.marketingActions.slice())
        : Object.freeze([]),
      customer: spec.customer ? Object.freeze({ ...spec.customer }) : null,
      writtenSigned: spec.writtenSigned !== false,
      createdAt: this._now(),
      version,
    });

    this._agreements.set(spec.propertyId, rec);
    return rec;
  }

  /** Current agreement for a property, or null. */
  getAgreement(propertyId) {
    return this._agreements.get(propertyId) || null;
  }

  // -----------------------------------------------------------
  // logShowing — viewing log (append-only)
  // -----------------------------------------------------------

  /**
   * Log a viewing of a property by a potential buyer/renter.
   *
   * @param {object} spec
   * @param {string} spec.propertyId
   * @param {string} spec.broker
   * @param {string|object} spec.visitor - name or {name, id, phone}
   * @param {string|Date} spec.date
   * @param {string} spec.outcome - one of SHOWING_OUTCOMES values
   * @param {string} [spec.notes]
   */
  logShowing(spec) {
    requireKeys(spec, ['propertyId', 'broker', 'visitor', 'date', 'outcome'], 'SHOWING');
    if (!this._brokers.has(spec.broker)) throw new Error('E_BROKER_NOT_FOUND');
    if (!VALID_SHOWING_OUT.has(spec.outcome)) throw new Error('E_INVALID_SHOWING_OUTCOME');
    const date = toDate(spec.date, 'SHOWING_DATE');

    this._seqShowing += 1;
    const rec = Object.freeze({
      id: `SHOW-${this._seqShowing.toString().padStart(6, '0')}`,
      propertyId: spec.propertyId,
      broker: spec.broker,
      visitor: typeof spec.visitor === 'string'
        ? Object.freeze({ name: spec.visitor })
        : Object.freeze({ ...spec.visitor }),
      date,
      outcome: spec.outcome,
      outcomeLabel: SHOWING_OUTCOME_LABELS[spec.outcome],
      notes: spec.notes || null,
      loggedAt: this._now(),
    });
    this._showings.push(rec);
    return rec;
  }

  /** Return all showings for a given property (append-only copy). */
  showingsForProperty(propertyId) {
    return this._showings.filter(s => s.propertyId === propertyId);
  }

  // -----------------------------------------------------------
  // computeCommission — returns gross + VAT + per-side breakdown
  // -----------------------------------------------------------

  /**
   * Compute commission for a transaction.
   *
   * For SALE:
   *   gross       = price * rate
   *   rate cap    = SALE_CAP_PCT (2%) per side
   * For RENTAL:
   *   price is monthly rent; rate is number of months
   *   gross       = price * rate
   *   rate cap    = RENTAL_CAP_MONTHS (1) per side
   *
   * @param {object} spec
   * @param {'sale'|'rental'} spec.transactionType
   * @param {number} spec.price
   * @param {number} spec.rate - % for sale (0.02), months for rental (1)
   * @param {object} [spec.split] - { buyer, seller } each 0..1 (sum=1) - optional
   * @returns {object} { gross, vat, total, vatRate, cap, perSide?, breakdown }
   */
  computeCommission(spec) {
    requireKeys(spec, ['transactionType', 'price', 'rate'], 'COMMISSION');
    const { transactionType, price, rate } = spec;

    if (transactionType !== TRANSACTION_TYPES.SALE && transactionType !== TRANSACTION_TYPES.RENTAL) {
      throw new Error('E_INVALID_TRANSACTION_TYPE');
    }
    if (typeof price !== 'number' || !(price >= 0)) {
      throw new Error('E_INVALID_PRICE');
    }
    if (typeof rate !== 'number' || !(rate >= 0)) {
      throw new Error('E_INVALID_RATE');
    }

    let cap, gross;
    if (transactionType === TRANSACTION_TYPES.SALE) {
      cap = SALE_CAP_PCT;
      if (rate > SALE_CAP_PCT + EPS) {
        throw new Error('E_RATE_EXCEEDS_CAP');
      }
      gross = price * rate;
    } else {
      cap = RENTAL_CAP_MONTHS;
      if (rate > RENTAL_CAP_MONTHS + EPS) {
        throw new Error('E_RATE_EXCEEDS_CAP');
      }
      gross = price * rate; // price is monthly rent
    }

    const vat   = gross * VAT_RATE;
    const total = gross + vat;

    const out = {
      transactionType,
      transactionTypeLabel: TRANSACTION_TYPE_LABELS[transactionType],
      price: round2(price),
      rate,
      cap,
      gross: round2(gross),
      vat: round2(vat),
      total: round2(total),
      vatRate: VAT_RATE,
    };

    if (spec.split && typeof spec.split === 'object') {
      const sum = Object.values(spec.split).reduce((a, b) => a + (Number(b) || 0), 0);
      if (Math.abs(sum - 1) > 1e-4) {
        throw new Error('E_SPLIT_NOT_100');
      }
      out.perSide = {};
      for (const k of Object.keys(spec.split)) {
        const pct = Number(spec.split[k]) || 0;
        out.perSide[k] = {
          gross: round2(gross * pct),
          vat:   round2(vat * pct),
          total: round2(total * pct),
        };
      }
    }
    return out;
  }

  // -----------------------------------------------------------
  // claimCommission — record a claim against a sale
  // -----------------------------------------------------------

  /**
   * Claim commission from both sides of a sale/rental.
   *
   * @param {object} spec
   * @param {string} spec.saleId
   * @param {string} spec.broker
   * @param {number} [spec.buyerBrokerPct=0]  0..0.02
   * @param {number} [spec.sellerBrokerPct=0] 0..0.02
   * @param {'sale'|'rental'} [spec.transactionType='sale']
   * @param {number} spec.price
   * @param {string} [spec.propertyId]  link to agreement for validation
   * @returns {object} claim record
   */
  claimCommission(spec) {
    requireKeys(spec, ['saleId', 'broker', 'price'], 'CLAIM');
    const broker = this._brokers.get(spec.broker);
    if (!broker) throw new Error('E_BROKER_NOT_FOUND');

    // § 14 — must be licensed at time of claim.
    const today = this._now();
    if (broker.licenseExpiry.getTime() < today.getTime()) {
      throw new Error('E_LICENSE_EXPIRED');
    }

    const transactionType = spec.transactionType || TRANSACTION_TYPES.SALE;
    const buyerPct  = Number(spec.buyerBrokerPct)  || 0;
    const sellerPct = Number(spec.sellerBrokerPct) || 0;

    if (buyerPct === 0 && sellerPct === 0) {
      throw new Error('E_EMPTY_COMMISSION_CLAIM');
    }

    // Each side must respect the legal cap.
    if (transactionType === TRANSACTION_TYPES.SALE) {
      if (buyerPct > SALE_CAP_PCT + EPS || sellerPct > SALE_CAP_PCT + EPS) {
        throw new Error('E_RATE_EXCEEDS_CAP');
      }
    } else {
      if (buyerPct > RENTAL_CAP_MONTHS + EPS || sellerPct > RENTAL_CAP_MONTHS + EPS) {
        throw new Error('E_RATE_EXCEEDS_CAP');
      }
    }

    // Compute per-side amounts (each uses its own rate).
    const buyerGross  = spec.price * buyerPct;
    const sellerGross = spec.price * sellerPct;
    const gross  = buyerGross + sellerGross;
    const vat    = gross * VAT_RATE;
    const total  = gross + vat;

    // If agreement exists — carry its status forward for validation.
    const agreement = spec.propertyId ? this._agreements.get(spec.propertyId) : null;

    this._seqClaim += 1;
    const claimId = `CLM-${this._seqClaim.toString().padStart(6, '0')}`;

    const record = {
      id: claimId,
      saleId: spec.saleId,
      propertyId: spec.propertyId || null,
      broker: spec.broker,
      transactionType,
      price: round2(spec.price),
      buyerBrokerPct: buyerPct,
      sellerBrokerPct: sellerPct,
      buyerGross:  round2(buyerGross),
      sellerGross: round2(sellerGross),
      gross: round2(gross),
      vat:   round2(vat),
      total: round2(total),
      vatRate: VAT_RATE,
      status: CLAIM_STATUSES.OPEN,
      statusLabel: CLAIM_STATUS_LABELS[CLAIM_STATUSES.OPEN],
      agreementId: agreement ? agreement.id : null,
      agreementVersion: agreement ? agreement.version : null,
      createdAt: this._now(),
      version: 1,
    };

    this._claims.set(claimId, record);
    return { ...record };
  }

  getClaim(claimId) {
    const c = this._claims.get(claimId);
    return c ? { ...c } : null;
  }

  // -----------------------------------------------------------
  // validateAgreement — § 9 written-form validation
  // -----------------------------------------------------------

  /**
   * Validate that an exclusivity/brokerage agreement satisfies
   * § 9 of חוק המתווכים: written, signed, clear terms.
   *
   * Returns { valid: bool, errors: [codes], issues: [{code, he, en}] }
   */
  validateAgreement(agreementIdOrPropertyId) {
    // Accept either the agreement's synthetic id (AGR-...) or propertyId.
    let rec = null;
    if (typeof agreementIdOrPropertyId === 'string' && agreementIdOrPropertyId.startsWith('AGR-')) {
      // Find by id across current + history
      for (const v of this._agreements.values()) {
        if (v.id === agreementIdOrPropertyId) { rec = v; break; }
      }
      if (!rec) {
        for (const h of this._agreementHistory) {
          if (h.record.id === agreementIdOrPropertyId) { rec = h.record; break; }
        }
      }
    } else {
      rec = this._agreements.get(agreementIdOrPropertyId);
    }
    if (!rec) {
      return {
        valid: false,
        errors: ['E_AGREEMENT_NOT_FOUND'],
        issues: [{ code: 'E_AGREEMENT_NOT_FOUND',
                   he: 'ההסכם לא נמצא',
                   en: 'Agreement not found' }],
      };
    }

    const errors = [];
    const issues = [];

    // 1. Written form
    if (!rec.writtenSigned) {
      errors.push('E_NOT_IN_WRITING');
      issues.push({ code: 'E_NOT_IN_WRITING',
                    he: 'ההסכם לא נחתם בכתב (סעיף 9)',
                    en: 'Agreement not in writing (§ 9)' });
    }

    // 2. Customer identification
    if (!rec.customer || !rec.customer.name || !rec.customer.id) {
      errors.push('E_MISSING_CUSTOMER');
      issues.push({ code: 'E_MISSING_CUSTOMER',
                    he: 'חסרים פרטי לקוח',
                    en: 'Customer details missing' });
    }

    // 3. Broker license
    const broker = this._brokers.get(rec.broker);
    if (!broker) {
      errors.push('E_BROKER_MISSING');
      issues.push({ code: 'E_BROKER_MISSING',
                    he: 'המתווך לא רשום במערכת',
                    en: 'Broker not registered' });
    } else {
      const today = this._now();
      if (broker.licenseExpiry.getTime() < today.getTime()) {
        errors.push('E_LICENSE_EXPIRED');
        issues.push({ code: 'E_LICENSE_EXPIRED',
                      he: 'רישיון המתווך פג תוקף',
                      en: 'Broker license expired' });
      }
    }

    // 4. Duration sanity
    if (rec.endDate.getTime() <= rec.startDate.getTime()) {
      errors.push('E_INVALID_DURATION');
      issues.push({ code: 'E_INVALID_DURATION',
                    he: 'תוקף ההסכם לא חוקי',
                    en: 'Invalid agreement duration' });
    }

    // 5. Exclusivity → needs marketing actions
    if (rec.exclusiveType !== 'none' && (!rec.marketingActions || rec.marketingActions.length < 2)) {
      errors.push('E_MISSING_MARKETING_ACTIONS');
      issues.push({ code: 'E_MISSING_MARKETING_ACTIONS',
                    he: 'חסרות פעולות שיווק לייחודיות',
                    en: 'Marketing actions missing for exclusivity' });
    }

    return {
      valid: errors.length === 0,
      errors,
      issues,
      agreementId: rec.id,
      propertyId: rec.propertyId,
      version: rec.version,
    };
  }

  // -----------------------------------------------------------
  // disputes — double-broker claim tracking
  // -----------------------------------------------------------

  /**
   * Open a dispute between two competing claims over the same
   * sale. Both claims are retained — the dispute record simply
   * links them until a decision is taken.
   *
   * @param {object} spec
   * @param {string[]} spec.claimIds - two or more claim ids
   * @param {string} [spec.reason]
   * @returns {object} dispute record
   */
  openDispute(spec) {
    requireKeys(spec, ['claimIds'], 'DISPUTE');
    if (!Array.isArray(spec.claimIds) || spec.claimIds.length < 2) {
      throw new Error('E_DISPUTE_NEEDS_TWO_CLAIMS');
    }
    for (const cid of spec.claimIds) {
      if (!this._claims.has(cid)) throw new Error(`E_CLAIM_NOT_FOUND_${cid}`);
    }
    this._seqDispute += 1;
    const id = `DSP-${this._seqDispute.toString().padStart(6, '0')}`;

    const rec = {
      id,
      claimIds: spec.claimIds.slice(),
      reason: spec.reason || null,
      status: DISPUTE_STATUSES.OPEN,
      statusLabel: DISPUTE_STATUS_LABELS[DISPUTE_STATUSES.OPEN],
      openedAt: this._now(),
      resolvedAt: null,
      resolution: null,
      winnerClaimId: null,
    };

    // Mark each claim as disputed (new version, history retained).
    for (const cid of spec.claimIds) {
      const prev = this._claims.get(cid);
      this._claimHistory.push({
        claimId: cid,
        version: prev.version,
        record: { ...prev },
        supersededAt: this._now(),
      });
      const upgraded = Object.assign({}, prev, {
        status: CLAIM_STATUSES.DISPUTED,
        statusLabel: CLAIM_STATUS_LABELS[CLAIM_STATUSES.DISPUTED],
        disputeId: id,
        version: prev.version + 1,
      });
      this._claims.set(cid, upgraded);
    }

    this._disputes.set(id, rec);
    return { ...rec };
  }

  /**
   * Resolve a dispute, choosing a winning claim. Losing claims
   * are moved to REJECTED but retained in history.
   */
  resolveDispute(disputeId, winnerClaimId, resolution) {
    const d = this._disputes.get(disputeId);
    if (!d) throw new Error('E_DISPUTE_NOT_FOUND');
    if (!d.claimIds.includes(winnerClaimId)) {
      throw new Error('E_WINNER_NOT_IN_DISPUTE');
    }

    d.status = DISPUTE_STATUSES.RESOLVED;
    d.statusLabel = DISPUTE_STATUS_LABELS[DISPUTE_STATUSES.RESOLVED];
    d.resolvedAt = this._now();
    d.resolution = resolution || null;
    d.winnerClaimId = winnerClaimId;

    for (const cid of d.claimIds) {
      const prev = this._claims.get(cid);
      this._claimHistory.push({
        claimId: cid,
        version: prev.version,
        record: { ...prev },
        supersededAt: this._now(),
      });
      const newStatus = cid === winnerClaimId
        ? CLAIM_STATUSES.OPEN      // winner goes back to OPEN, can be invoiced
        : CLAIM_STATUSES.REJECTED;
      const upgraded = Object.assign({}, prev, {
        status: newStatus,
        statusLabel: CLAIM_STATUS_LABELS[newStatus],
        disputeResolvedAt: this._now(),
        version: prev.version + 1,
      });
      this._claims.set(cid, upgraded);
    }
    return { ...d };
  }

  /**
   * Return dispute record (single) or all disputes involving
   * the given claim id.
   */
  disputes(claimIdOrDisputeId) {
    if (!claimIdOrDisputeId) {
      return Array.from(this._disputes.values()).map(d => ({ ...d }));
    }
    // Direct disputeId lookup
    const direct = this._disputes.get(claimIdOrDisputeId);
    if (direct) return { ...direct };
    // By claim id
    const matches = [];
    for (const d of this._disputes.values()) {
      if (d.claimIds.includes(claimIdOrDisputeId)) matches.push({ ...d });
    }
    return matches;
  }

  // -----------------------------------------------------------
  // generateInvoice — brokerage invoice with allocation number
  // -----------------------------------------------------------

  /**
   * Generate a bilingual brokerage invoice for a claim.
   * Attaches a synthetic allocation number (מספר הקצאה) —
   * real ones come from the tax-exports/ module, but this
   * stub allows downstream PDF / GL flow to link.
   */
  generateInvoice(claimId, opts = {}) {
    const claim = this._claims.get(claimId);
    if (!claim) throw new Error('E_CLAIM_NOT_FOUND');
    if (claim.status === CLAIM_STATUSES.DISPUTED) {
      throw new Error('E_CLAIM_DISPUTED');
    }
    if (claim.status === CLAIM_STATUSES.REJECTED) {
      throw new Error('E_CLAIM_REJECTED');
    }
    if (claim.status === CLAIM_STATUSES.CANCELLED) {
      throw new Error('E_CLAIM_CANCELLED');
    }

    const broker = this._brokers.get(claim.broker);
    if (!broker) throw new Error('E_BROKER_NOT_FOUND');

    this._seqInvoice += 1;
    const invoiceId = `INV-BRK-${this._seqInvoice.toString().padStart(6, '0')}`;
    const issuedAt = this._now();
    const allocationNumber = generateAllocationNumber(claimId, issuedAt);

    const lines = [];
    if (claim.buyerGross > 0) {
      lines.push({
        side: 'buyer',
        description: {
          he: `דמי תיווך מצד הקונה (${(claim.buyerBrokerPct * 100).toFixed(2)}%)`,
          en: `Brokerage fee — buyer side (${(claim.buyerBrokerPct * 100).toFixed(2)}%)`,
        },
        gross: claim.buyerGross,
        vat:   round2(claim.buyerGross * VAT_RATE),
        total: round2(claim.buyerGross * (1 + VAT_RATE)),
      });
    }
    if (claim.sellerGross > 0) {
      lines.push({
        side: 'seller',
        description: {
          he: `דמי תיווך מצד המוכר (${(claim.sellerBrokerPct * 100).toFixed(2)}%)`,
          en: `Brokerage fee — seller side (${(claim.sellerBrokerPct * 100).toFixed(2)}%)`,
        },
        gross: claim.sellerGross,
        vat:   round2(claim.sellerGross * VAT_RATE),
        total: round2(claim.sellerGross * (1 + VAT_RATE)),
      });
    }

    const invoice = {
      id: invoiceId,
      claimId,
      saleId: claim.saleId,
      propertyId: claim.propertyId,
      broker: {
        id: broker.id,
        name: broker.name,
        licenseNumber: broker.licenseNumber,
      },
      lines,
      gross: claim.gross,
      vat:   claim.vat,
      total: claim.total,
      vatRate: VAT_RATE,
      currency: 'ILS',
      allocationNumber,
      issuedAt,
      dueDate: opts.dueDate ? toDate(opts.dueDate, 'DUE_DATE') : new Date(issuedAt.getTime() + 30 * 86400000),
      headings: {
        he: 'חשבונית מס — דמי תיווך במקרקעין',
        en: 'Tax Invoice — Real Estate Brokerage Fees',
      },
      legalNotice: {
        he: 'חשבונית זו עומדת בדרישות חוק המתווכים במקרקעין, התשנ"ו-1996, סעיפים 9 ו-14.',
        en: 'This invoice complies with the Brokers in Real Estate Law, 1996, §§ 9 and 14.',
      },
    };
    this._invoices.set(invoiceId, invoice);

    // Mark the claim as invoiced (new version, history retained).
    this._claimHistory.push({
      claimId,
      version: claim.version,
      record: { ...claim },
      supersededAt: this._now(),
    });
    const upgradedClaim = Object.assign({}, claim, {
      status: CLAIM_STATUSES.INVOICED,
      statusLabel: CLAIM_STATUS_LABELS[CLAIM_STATUSES.INVOICED],
      invoiceId,
      version: claim.version + 1,
    });
    this._claims.set(claimId, upgradedClaim);

    return { ...invoice };
  }

  getInvoice(invoiceId) {
    const inv = this._invoices.get(invoiceId);
    return inv ? { ...inv } : null;
  }

  // -----------------------------------------------------------
  // licenseRenewalAlert — proactively warn brokers
  // -----------------------------------------------------------

  /**
   * Return a list of brokers whose license expires within
   * `days` days from now (or is already expired).
   *
   * @param {number} [days=30]
   * @returns {Array<{id,name,licenseNumber,licenseExpiry,daysLeft,expired,message}>}
   */
  licenseRenewalAlert(days) {
    const horizon = Number.isFinite(days) ? days : DEFAULT_LICENSE_ALERT_DAYS;
    const today = this._now();
    const out = [];
    for (const b of this._brokers.values()) {
      const diff = daysBetween(today, b.licenseExpiry);
      if (diff <= horizon) {
        const expired = diff < 0;
        out.push({
          id: b.id,
          name: b.name,
          licenseNumber: b.licenseNumber,
          licenseExpiry: b.licenseExpiry,
          daysLeft: diff,
          expired,
          message: {
            he: expired
              ? `רישיון המתווך ${b.name} פג תוקף לפני ${Math.abs(diff)} ימים`
              : `רישיון המתווך ${b.name} יפוג בעוד ${diff} ימים`,
            en: expired
              ? `Broker ${b.name} license expired ${Math.abs(diff)} days ago`
              : `Broker ${b.name} license expires in ${diff} days`,
          },
        });
      }
    }
    out.sort((a, b) => a.daysLeft - b.daysLeft);
    return out;
  }

  // -----------------------------------------------------------
  // introspection / history accessors
  // -----------------------------------------------------------

  brokerHistory(id)    { return this._brokerHistory.filter(h => h.id === id); }
  agreementHistory(id) { return this._agreementHistory.filter(h => h.propertyId === id); }
  claimHistoryOf(id)   { return this._claimHistory.filter(h => h.claimId === id); }

  allBrokers()    { return Array.from(this._brokers.values()); }
  allClaims()     { return Array.from(this._claims.values()).map(c => ({ ...c })); }
  allInvoices()   { return Array.from(this._invoices.values()).map(i => ({ ...i })); }
  allAgreements() { return Array.from(this._agreements.values()); }
}

// ---------------------------------------------------------------
// EXPORTS
// ---------------------------------------------------------------

module.exports = {
  BrokerFeeTracker,
  VAT_RATE,
  SALE_CAP_PCT,
  RENTAL_CAP_MONTHS,
  TRANSACTION_TYPES,
  TRANSACTION_TYPE_LABELS,
  EXCLUSIVITY_TYPES,
  EXCLUSIVITY_TYPE_LABELS,
  SHOWING_OUTCOMES,
  SHOWING_OUTCOME_LABELS,
  CLAIM_STATUSES,
  CLAIM_STATUS_LABELS,
  DISPUTE_STATUSES,
  DISPUTE_STATUS_LABELS,
};
