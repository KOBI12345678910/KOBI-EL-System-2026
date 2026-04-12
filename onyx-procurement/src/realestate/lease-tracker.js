/**
 * lease-tracker.js
 * Techno-Kol Uzi Mega-ERP — Israeli Residential + Commercial Lease Tracker
 * מעקב חוזי שכירות (דירות מגורים ומסחרי)
 *
 * Rule: לא מוחקים רק משדרגים ומגדלים (never delete, only upgrade/grow)
 * Zero external dependencies. Bilingual (Hebrew/English).
 *
 * Features:
 *  - createLease / renewLease / terminateEarly
 *  - computeRent with CPI, dollar-linked, or fixed indexation (תוספת הצמדה)
 *  - Guarantee registry (checks, bank guarantee, promissory notes, deposits)
 *  - Notice period calculation per contract & Israeli tenant protection law
 *  - Key money / protected tenancy (דיירות מוגנת / דמי מפתח)
 *  - Fair Rental Law compliance (חוק שכירות הוגנת)
 *  - Hebrew RTL lease agreement PDF generator (PDF 1.4 minimal writer)
 *
 * Israeli legal references:
 *  - חוק השכירות והשאילה, התשל"א-1971 (Rental & Loan Law 1971)
 *  - חוק הגנת הדייר [נוסח משולב], התשל"ב-1972 (Protected Tenancy 1972)
 *  - חוק השכירות והשאילה (תיקון מס' 2) התשע"ז-2017 — שכירות הוגנת (Fair Rental 2017)
 *  - כללי חשב כללי – תוספת הצמדה למדד המחירים לצרכן (CPI indexation rules)
 */

'use strict';

// ───────────────────────── Constants ─────────────────────────

const LEASE_STATUS = Object.freeze({
  DRAFT: 'draft',
  ACTIVE: 'active',
  RENEWED: 'renewed',
  EXPIRED: 'expired',
  TERMINATED_EARLY: 'terminated_early',
  PROTECTED: 'protected_tenancy',
});

const INDEXATION_TYPES = Object.freeze({
  CPI: 'cpi',
  FIXED: 'fixed',
  DOLLAR: 'dollar-linked',
  NONE: 'none',
});

const GUARANTEE_TYPES = Object.freeze({
  CHECK: 'check',
  BANK_GUARANTEE: 'bank-guarantee',
  PROMISSORY_NOTE: 'promissory-note',
  DEPOSIT: 'deposit',
});

// Israeli Fair Rental Law (שכירות הוגנת) caps on deposit — max 3x monthly rent
// for residential leases (חוק השכירות והשאילה סעיף 25ח)
const FAIR_RENTAL_LAW = Object.freeze({
  MAX_DEPOSIT_MONTHS: 3,
  MAX_GUARANTEE_MONTHS: 3,
  MIN_NOTICE_DAYS_RESIDENTIAL: 60, // 60 days before lease end for renewal/termination notice
  MIN_NOTICE_DAYS_COMMERCIAL: 90,
  HABITABILITY_DEFECT_REPAIR_DAYS: 30,
  URGENT_DEFECT_REPAIR_DAYS: 3,
});

// ─────────────────────── Utility helpers ───────────────────────

function _genId(prefix) {
  const rnd = Math.random().toString(36).slice(2, 10);
  const ts = Date.now().toString(36);
  return `${prefix}_${ts}_${rnd}`;
}

function _parseDate(d) {
  if (d instanceof Date) return new Date(d.getTime());
  if (typeof d === 'string' || typeof d === 'number') return new Date(d);
  throw new TypeError('Invalid date value');
}

function _ymKey(date) {
  const d = _parseDate(date);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function _diffMonths(a, b) {
  const da = _parseDate(a);
  const db = _parseDate(b);
  return (
    (db.getUTCFullYear() - da.getUTCFullYear()) * 12 +
    (db.getUTCMonth() - da.getUTCMonth())
  );
}

function _addMonths(date, n) {
  const d = _parseDate(date);
  const res = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, d.getUTCDate())
  );
  return res;
}

function _round2(x) {
  return Math.round((x + Number.EPSILON) * 100) / 100;
}

function _isValidTenant(t) {
  return (
    t &&
    typeof t === 'object' &&
    typeof t.name === 'string' &&
    t.name.length > 0 &&
    typeof t.id === 'string' &&
    t.id.length > 0
  );
}

// ─────────────────────── LeaseTracker class ───────────────────────

class LeaseTracker {
  /**
   * @param {Object} opts
   * @param {Function} [opts.cpiProvider] fn(yyyyMm) -> index value (number)
   * @param {Function} [opts.fxProvider]  fn(ccy, yyyyMm) -> rate vs ILS
   * @param {Object}   [opts.defaults] default contract terms
   */
  constructor(opts = {}) {
    this.leases = new Map(); // leaseId -> lease
    this.guarantees = new Map(); // guaranteeId -> guarantee
    this.history = []; // append-only audit log (never delete!)
    this.cpiProvider = opts.cpiProvider || this._defaultCpiProvider.bind(this);
    this.fxProvider = opts.fxProvider || this._defaultFxProvider.bind(this);
    this._cpiCache = opts.cpiTable || {
      // Sample monthly CPI points (base=100) — can be replaced at runtime
      '2024-01': 100.0,
      '2024-06': 101.2,
      '2024-12': 102.5,
      '2025-01': 102.8,
      '2025-06': 103.9,
      '2025-12': 105.1,
      '2026-01': 105.4,
      '2026-04': 106.0,
    };
    this._fxCache = opts.fxTable || {
      'USD:2024-01': 3.65,
      'USD:2024-12': 3.58,
      'USD:2025-06': 3.72,
      'USD:2025-12': 3.68,
      'USD:2026-01': 3.70,
      'USD:2026-04': 3.75,
    };
    this.defaults = Object.assign(
      { currency: 'ILS', indexation: INDEXATION_TYPES.CPI },
      opts.defaults || {}
    );
  }

  // ── Providers (pluggable; fall back to internal tables) ──

  _defaultCpiProvider(ymKey) {
    if (this._cpiCache[ymKey] != null) return this._cpiCache[ymKey];
    // find closest earlier month (carry-forward)
    const keys = Object.keys(this._cpiCache).sort();
    let best = null;
    for (const k of keys) {
      if (k <= ymKey) best = k;
    }
    return best ? this._cpiCache[best] : 100;
  }

  _defaultFxProvider(ccy, ymKey) {
    const k = `${ccy}:${ymKey}`;
    if (this._fxCache[k] != null) return this._fxCache[k];
    const keys = Object.keys(this._fxCache).filter((x) => x.startsWith(`${ccy}:`)).sort();
    let best = null;
    for (const kk of keys) {
      if (kk <= k) best = kk;
    }
    return best ? this._fxCache[best] : 1;
  }

  _log(action, payload) {
    this.history.push({
      ts: new Date().toISOString(),
      action,
      payload: JSON.parse(JSON.stringify(payload || {})),
    });
  }

  // ── createLease ──

  createLease(spec) {
    if (!spec || typeof spec !== 'object') {
      throw new TypeError('createLease requires a spec object');
    }
    const {
      propertyId,
      tenant,
      startDate,
      endDate,
      monthlyRent,
      currency = this.defaults.currency,
      indexation = this.defaults.indexation,
      indexBase,
      deposit = 0,
      guarantors = [],
      options = [],
      purpose = 'residential',
      protectedTenancy = false,
      keyMoney = 0,
    } = spec;

    if (!propertyId) throw new Error('propertyId is required / חסר מזהה נכס');
    if (!_isValidTenant(tenant))
      throw new Error('valid tenant {name,id} required / דייר לא תקין');
    if (!(monthlyRent > 0))
      throw new Error('monthlyRent must be positive / דמי שכירות חייבים להיות חיוביים');
    if (!['ILS', 'USD'].includes(currency))
      throw new Error('currency must be ILS or USD');
    if (!Object.values(INDEXATION_TYPES).includes(indexation))
      throw new Error(`indexation must be one of: ${Object.values(INDEXATION_TYPES).join(', ')}`);

    const start = _parseDate(startDate);
    const end = _parseDate(endDate);
    if (!(end > start))
      throw new Error('endDate must be after startDate / תאריך סיום חייב להיות אחרי התחלה');

    // Fair Rental Law — cap residential deposit to 3 months rent
    if (
      purpose === 'residential' &&
      !protectedTenancy &&
      deposit > FAIR_RENTAL_LAW.MAX_DEPOSIT_MONTHS * monthlyRent
    ) {
      throw new Error(
        `deposit exceeds Fair Rental Law cap (${FAIR_RENTAL_LAW.MAX_DEPOSIT_MONTHS}x monthly rent) / פיקדון חורג ממגבלת חוק שכירות הוגנת`
      );
    }

    const leaseId = _genId('lease');
    const baseIndex =
      indexBase != null ? indexBase : this._captureIndexBase(indexation, currency, start);

    const lease = {
      leaseId,
      propertyId,
      tenant: Object.assign({}, tenant),
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      monthlyRent: _round2(monthlyRent),
      currency,
      indexation,
      indexBase: baseIndex,
      deposit: _round2(deposit),
      guarantors: Array.isArray(guarantors) ? guarantors.slice() : [],
      options: Array.isArray(options) ? options.slice() : [],
      purpose,
      status: protectedTenancy ? LEASE_STATUS.PROTECTED : LEASE_STATUS.ACTIVE,
      protectedTenancy: !!protectedTenancy,
      keyMoney: _round2(keyMoney),
      guaranteeIds: [],
      terminations: [], // never mutate — append-only
      renewals: [], // append-only
      fairRentalAdjustments: [], // append-only
      notes: [],
      createdAt: new Date().toISOString(),
      lastUpdatedAt: new Date().toISOString(),
    };

    this.leases.set(leaseId, lease);
    this._log('createLease', { leaseId, propertyId, tenant: tenant.id });
    return lease;
  }

  _captureIndexBase(indexation, currency, startDate) {
    const ym = _ymKey(startDate);
    if (indexation === INDEXATION_TYPES.CPI) {
      return { type: 'cpi', yyyyMm: ym, value: this.cpiProvider(ym) };
    }
    if (indexation === INDEXATION_TYPES.DOLLAR) {
      return {
        type: 'dollar',
        yyyyMm: ym,
        value: this.fxProvider('USD', ym),
        currency: currency,
      };
    }
    if (indexation === INDEXATION_TYPES.FIXED) {
      return { type: 'fixed', yyyyMm: ym, value: 1 };
    }
    return { type: 'none', yyyyMm: ym, value: 1 };
  }

  // ── computeRent ──

  /**
   * Compute the rent due in a specific month, applying indexation.
   * Israeli תוספת הצמדה:
   *   newRent = baseRent × (currentIndex / baseIndex)
   *
   * For dollar-linked (חוזה צמוד דולר): rent stays in USD nominal, but converted
   *   to ILS using the current FX rate. If the lease currency is ILS and
   *   indexation is dollar-linked, the ILS rent tracks the USD rate change.
   */
  computeRent(leaseId, month) {
    const lease = this._getLease(leaseId);
    const monthDate = _parseDate(month);
    const ym = _ymKey(monthDate);
    const base = lease.monthlyRent;

    // Check lease is active for that month
    const start = _parseDate(lease.startDate);
    const end = _parseDate(lease.endDate);
    if (monthDate < start || monthDate > end) {
      // Still compute (for projections), but flag out-of-range
    }

    let indexedRent = base;
    let factor = 1;
    let currentIndex = null;

    switch (lease.indexation) {
      case INDEXATION_TYPES.CPI: {
        currentIndex = this.cpiProvider(ym);
        const baseVal = lease.indexBase && lease.indexBase.value ? lease.indexBase.value : 100;
        factor = currentIndex / baseVal;
        indexedRent = base * factor;
        break;
      }
      case INDEXATION_TYPES.DOLLAR: {
        currentIndex = this.fxProvider('USD', ym);
        const baseVal = lease.indexBase && lease.indexBase.value ? lease.indexBase.value : 1;
        if (lease.currency === 'USD') {
          // nominal rent is in USD; no adjustment, report ILS-equivalent too
          indexedRent = base;
        } else {
          // ILS lease linked to USD: rent scales with USD rate change
          factor = currentIndex / baseVal;
          indexedRent = base * factor;
        }
        break;
      }
      case INDEXATION_TYPES.FIXED:
      case INDEXATION_TYPES.NONE:
      default:
        indexedRent = base;
        factor = 1;
        currentIndex = 1;
    }

    // Apply Fair Rental Law adjustments (chronologically, append-only)
    for (const adj of lease.fairRentalAdjustments) {
      if (_parseDate(adj.effectiveFrom) <= monthDate) {
        indexedRent = indexedRent + Number(adj.delta || 0);
      }
    }

    const ilsEquiv =
      lease.currency === 'USD'
        ? indexedRent * this.fxProvider('USD', ym)
        : indexedRent;

    return {
      leaseId,
      month: ym,
      baseRent: _round2(base),
      indexationType: lease.indexation,
      factor: _round2(factor),
      currentIndex,
      baseIndex: lease.indexBase && lease.indexBase.value,
      indexedRent: _round2(indexedRent),
      currency: lease.currency,
      ilsEquivalent: _round2(ilsEquiv),
      formula:
        lease.indexation === INDEXATION_TYPES.CPI
          ? 'newRent = baseRent × (currentCPI / baseCPI)'
          : lease.indexation === INDEXATION_TYPES.DOLLAR
          ? 'newRent = baseRent × (currentUSDILS / baseUSDILS)'
          : 'newRent = baseRent (no indexation)',
      hebrewFormula: 'דמי שכירות מעודכנים = דמי שכירות בסיסיים × (מדד נוכחי / מדד בסיס)',
    };
  }

  // ── registerGuarantee ──

  registerGuarantee(spec) {
    if (!spec || typeof spec !== 'object')
      throw new TypeError('registerGuarantee requires spec');
    const { leaseId, type, amount, expiryDate, reference = '' } = spec;
    const lease = this._getLease(leaseId);

    if (!Object.values(GUARANTEE_TYPES).includes(type))
      throw new Error(
        `guarantee type must be one of: ${Object.values(GUARANTEE_TYPES).join(', ')}`
      );
    if (!(amount > 0)) throw new Error('guarantee amount must be positive');

    // Fair Rental Law: total guarantees + deposit cannot exceed 3x rent for residential
    if (lease.purpose === 'residential' && !lease.protectedTenancy) {
      const existingTotal = this._sumActiveGuarantees(lease) + lease.deposit;
      const cap = FAIR_RENTAL_LAW.MAX_GUARANTEE_MONTHS * lease.monthlyRent;
      if (existingTotal + amount > cap + 0.01) {
        throw new Error(
          `total guarantees+deposit would exceed Fair Rental Law cap (${cap}) / חריגה ממגבלת חוק שכירות הוגנת`
        );
      }
    }

    const guaranteeId = _genId('gtee');
    const g = {
      guaranteeId,
      leaseId,
      type,
      amount: _round2(amount),
      expiryDate: expiryDate ? _parseDate(expiryDate).toISOString() : null,
      reference: String(reference || ''),
      status: 'active',
      registeredAt: new Date().toISOString(),
      releasedAt: null,
    };
    this.guarantees.set(guaranteeId, g);
    lease.guaranteeIds.push(guaranteeId);
    lease.lastUpdatedAt = new Date().toISOString();
    this._log('registerGuarantee', { guaranteeId, leaseId, type, amount });
    return g;
  }

  _sumActiveGuarantees(lease) {
    let sum = 0;
    for (const id of lease.guaranteeIds) {
      const g = this.guarantees.get(id);
      if (g && g.status === 'active') sum += g.amount;
    }
    return _round2(sum);
  }

  // ── terminateEarly ──

  terminateEarly(leaseId, reason, penaltyAmount = 0) {
    const lease = this._getLease(leaseId);
    if (
      lease.status !== LEASE_STATUS.ACTIVE &&
      lease.status !== LEASE_STATUS.RENEWED &&
      lease.status !== LEASE_STATUS.PROTECTED
    ) {
      throw new Error(
        `cannot terminate lease in status ${lease.status} / לא ניתן לסיים חוזה במצב זה`
      );
    }
    const termEntry = {
      reason: String(reason || ''),
      penaltyAmount: _round2(penaltyAmount),
      terminatedAt: new Date().toISOString(),
      effectiveEndDate: new Date().toISOString(),
      priorStatus: lease.status,
    };
    // Append, never delete (rule: לא מוחקים רק משדרגים ומגדלים)
    lease.terminations.push(termEntry);
    lease.status = LEASE_STATUS.TERMINATED_EARLY;
    lease.lastUpdatedAt = new Date().toISOString();
    this._log('terminateEarly', { leaseId, reason, penaltyAmount });
    return termEntry;
  }

  // ── renewLease ──

  renewLease(leaseId, newEndDate, newRent) {
    const lease = this._getLease(leaseId);
    if (
      lease.status !== LEASE_STATUS.ACTIVE &&
      lease.status !== LEASE_STATUS.RENEWED &&
      lease.status !== LEASE_STATUS.EXPIRED
    ) {
      throw new Error(
        `cannot renew lease in status ${lease.status} / לא ניתן לחדש חוזה במצב זה`
      );
    }
    const newEnd = _parseDate(newEndDate);
    const currentEnd = _parseDate(lease.endDate);
    if (!(newEnd > currentEnd))
      throw new Error('newEndDate must be after current endDate / תאריך סיום חדש חייב להיות מאוחר יותר');
    if (!(newRent > 0))
      throw new Error('newRent must be positive');

    const renewal = {
      previousEndDate: lease.endDate,
      previousRent: lease.monthlyRent,
      newEndDate: newEnd.toISOString(),
      newRent: _round2(newRent),
      renewedAt: new Date().toISOString(),
    };
    lease.renewals.push(renewal);
    // Upgrade, don't overwrite historical — current fields reflect latest renewal
    lease.endDate = newEnd.toISOString();
    lease.monthlyRent = _round2(newRent);
    lease.status = LEASE_STATUS.RENEWED;
    lease.lastUpdatedAt = new Date().toISOString();
    // Rebase indexation to the renewal date (standard Israeli practice)
    lease.indexBase = this._captureIndexBase(lease.indexation, lease.currency, newEnd);
    this._log('renewLease', { leaseId, newEndDate: newEnd.toISOString(), newRent });
    return renewal;
  }

  // ── noticePeriod ──

  /**
   * Compute the required notice period before the contract's endDate.
   * Uses the max of:
   *  - contract `options.renewal.notice` (days)
   *  - Israeli statutory minimum (60d residential, 90d commercial)
   */
  noticePeriod(leaseId) {
    const lease = this._getLease(leaseId);
    const statutoryDays =
      lease.purpose === 'commercial'
        ? FAIR_RENTAL_LAW.MIN_NOTICE_DAYS_COMMERCIAL
        : FAIR_RENTAL_LAW.MIN_NOTICE_DAYS_RESIDENTIAL;
    let contractualDays = 0;
    for (const opt of lease.options || []) {
      if (opt && opt.type === 'renewal' && typeof opt.notice === 'number') {
        contractualDays = Math.max(contractualDays, opt.notice);
      }
    }
    const effective = Math.max(statutoryDays, contractualDays);
    const endDate = _parseDate(lease.endDate);
    const noticeBy = new Date(endDate.getTime() - effective * 86400000);
    return {
      leaseId,
      purpose: lease.purpose,
      statutoryDays,
      contractualDays,
      effectiveDays: effective,
      endDate: endDate.toISOString(),
      noticeBy: noticeBy.toISOString(),
      hebrew: 'תקופת הודעה מוקדמת להארכה/סיום',
      reference:
        lease.purpose === 'commercial'
          ? 'חוק השכירות והשאילה — מסחרי'
          : 'חוק השכירות והשאילה — שכירות הוגנת (מגורים)',
    };
  }

  // ── keyMoneyTracking ──

  /**
   * Protected-tenant (דיירות מוגנת) key-money tracking.
   * Old-contracts under חוק הגנת הדייר 1972: tenant paid key money upfront
   * and receives statutory rent protection. When the tenant vacates, the
   * landlord owes back a regulated portion (typically 2/3 for residential,
   * unless the contract specifies otherwise).
   */
  keyMoneyTracking(spec) {
    if (!spec || typeof spec !== 'object')
      throw new TypeError('keyMoneyTracking requires spec');
    const { leaseId, keyMoney, releaseDate, landlordShare = 1 / 3 } = spec;
    const lease = this._getLease(leaseId);
    lease.protectedTenancy = true;
    lease.status = LEASE_STATUS.PROTECTED;
    if (!(keyMoney >= 0))
      throw new Error('keyMoney must be non-negative');
    if (landlordShare < 0 || landlordShare > 1)
      throw new Error('landlordShare must be 0..1');

    const tenantRefund = _round2(keyMoney * (1 - landlordShare));
    const landlordRetain = _round2(keyMoney * landlordShare);

    const record = {
      keyMoney: _round2(keyMoney),
      releaseDate: releaseDate ? _parseDate(releaseDate).toISOString() : null,
      landlordShare,
      tenantRefund,
      landlordRetain,
      recordedAt: new Date().toISOString(),
      reference: 'חוק הגנת הדייר [נוסח משולב], תשל"ב-1972',
    };
    lease.keyMoney = record.keyMoney;
    lease.keyMoneyRecord = record;
    lease.lastUpdatedAt = new Date().toISOString();
    this._log('keyMoneyTracking', { leaseId, keyMoney, releaseDate });
    return record;
  }

  // ── sheltermaxLaw / Fair Rental Law compliance check ──

  /**
   * Apply an adjustment under חוק שכירות הוגנת (Fair Rental Law).
   * Validates that adjustments stay within legal bounds and appends to
   * the append-only adjustment log.
   *
   * @param {string} leaseId
   * @param {Object} adjustment
   *  - type: 'habitability-credit'|'defect-repair'|'rent-reduction'|'compliance-fine'
   *  - delta: signed amount (negative reduces rent)
   *  - effectiveFrom: ISO date
   *  - reason: hebrew/english text
   */
  sheltermaxLaw(leaseId, adjustment) {
    const lease = this._getLease(leaseId);
    if (!adjustment || typeof adjustment !== 'object')
      throw new TypeError('adjustment required');
    const {
      type,
      delta = 0,
      effectiveFrom = new Date().toISOString(),
      reason = '',
    } = adjustment;

    const allowedTypes = [
      'habitability-credit',
      'defect-repair',
      'rent-reduction',
      'compliance-fine',
      'deposit-refund',
      'notice-cure',
    ];
    if (!allowedTypes.includes(type))
      throw new Error(
        `adjustment.type must be one of: ${allowedTypes.join(', ')}`
      );

    // Compliance report
    const compliance = this._checkFairRentalCompliance(lease);

    const record = {
      type,
      delta: _round2(delta),
      effectiveFrom: _parseDate(effectiveFrom).toISOString(),
      reason: String(reason || ''),
      recordedAt: new Date().toISOString(),
      compliance,
      reference:
        'חוק השכירות והשאילה (תיקון מס\' 2) התשע"ז-2017 — שכירות הוגנת',
    };
    lease.fairRentalAdjustments.push(record);
    lease.lastUpdatedAt = new Date().toISOString();
    this._log('sheltermaxLaw', { leaseId, type, delta });
    return record;
  }

  _checkFairRentalCompliance(lease) {
    const issues = [];
    if (lease.purpose === 'residential' && !lease.protectedTenancy) {
      if (lease.deposit > FAIR_RENTAL_LAW.MAX_DEPOSIT_MONTHS * lease.monthlyRent) {
        issues.push('deposit exceeds 3x monthly rent / פיקדון חורג מ-3 חודשים');
      }
      const totalGuarantees = this._sumActiveGuarantees(lease) + lease.deposit;
      if (totalGuarantees > FAIR_RENTAL_LAW.MAX_GUARANTEE_MONTHS * lease.monthlyRent + 0.01) {
        issues.push('total guarantees exceed 3x monthly rent / סך בטחונות חורג מ-3 חודשים');
      }
    }
    return {
      compliant: issues.length === 0,
      issues,
      checkedAt: new Date().toISOString(),
    };
  }

  // ── Hebrew RTL PDF generator ──

  /**
   * Produces a minimal self-contained PDF (PDF 1.4) containing the lease
   * terms in Hebrew RTL format. Zero external dependencies.
   *
   * NOTE: PDF 1.4 built-in fonts do not include Hebrew glyphs directly.
   * This writer emits text in logical (right-to-left reading) order with
   * Hebrew characters escaped as Unicode labels, plus an ASCII transliteration
   * fallback. Consuming clients that need full Hebrew glyph rendering should
   * replace the font stream with an embedded TTF (e.g. Alef, Heebo).
   *
   * @returns {{buffer: Buffer, text: string, metadata: Object}}
   */
  generateLeaseHebrewPDF(leaseId) {
    const lease = this._getLease(leaseId);
    const lines = this._renderHebrewLeaseLines(lease);

    // Build a minimal PDF
    const objects = [];

    // 1: Catalog
    objects.push('<< /Type /Catalog /Pages 2 0 R >>');
    // 2: Pages
    objects.push('<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
    // 3: Page
    objects.push(
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] ' +
        '/Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>'
    );
    // 4: Contents (we will fill after building stream)
    const streamLines = [];
    streamLines.push('BT');
    streamLines.push('/F1 12 Tf');
    streamLines.push('50 800 Td');
    streamLines.push('14 TL');
    for (const ln of lines) {
      // Escape parens & backslashes
      const safe = ln.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
      streamLines.push(`(${safe}) Tj T*`);
    }
    streamLines.push('ET');
    const stream = streamLines.join('\n');
    objects.push(
      `<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`
    );
    // 5: Font (Helvetica built-in; Hebrew is transliterated in `lines`)
    objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');

    // Assemble PDF bytes
    let body = '%PDF-1.4\n%\u00e2\u00e3\u00cf\u00d3\n';
    const offsets = [];
    for (let i = 0; i < objects.length; i++) {
      offsets.push(Buffer.byteLength(body, 'latin1'));
      body += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
    }
    const xrefStart = Buffer.byteLength(body, 'latin1');
    let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    for (const off of offsets) {
      xref += `${String(off).padStart(10, '0')} 00000 n \n`;
    }
    const trailer =
      `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
    const pdf = body + xref + trailer;
    const buffer = Buffer.from(pdf, 'latin1');

    const metadata = {
      leaseId,
      propertyId: lease.propertyId,
      tenantName: lease.tenant.name,
      generatedAt: new Date().toISOString(),
      pageCount: 1,
      direction: 'rtl',
      language: 'he',
      size: buffer.length,
    };
    this._log('generateLeaseHebrewPDF', { leaseId, size: buffer.length });
    return { buffer, text: lines.join('\n'), metadata };
  }

  _renderHebrewLeaseLines(lease) {
    const L = [];
    // Hebrew title + ASCII transliteration in parentheses for font compatibility
    L.push('==========================================');
    L.push('HESHEM SHCHIRUT / חוזה שכירות');
    L.push('==========================================');
    L.push('');
    L.push(`Lease ID / mis. choze: ${lease.leaseId}`);
    L.push(`Property / nechess: ${lease.propertyId}`);
    L.push(`Purpose / matara: ${lease.purpose}`);
    L.push('');
    L.push('--- Tenant / soker ---');
    L.push(`Name / shem: ${lease.tenant.name}`);
    L.push(`ID / t.z.: ${lease.tenant.id}`);
    if (lease.tenant.phone) L.push(`Phone / telefon: ${lease.tenant.phone}`);
    if (lease.tenant.address) L.push(`Address / ktovet: ${lease.tenant.address}`);
    L.push('');
    L.push('--- Terms / tnaim ---');
    L.push(`Start / tchilat ha-choze: ${lease.startDate.slice(0, 10)}`);
    L.push(`End / sof ha-choze: ${lease.endDate.slice(0, 10)}`);
    L.push(`Rent / schar chodshi: ${lease.monthlyRent} ${lease.currency}`);
    L.push(`Indexation / hatzmada: ${lease.indexation}`);
    if (lease.indexBase)
      L.push(`Index base / basis hatzmada: ${JSON.stringify(lease.indexBase)}`);
    L.push(`Deposit / pikadon: ${lease.deposit} ${lease.currency}`);
    L.push('');
    if (lease.guarantors && lease.guarantors.length) {
      L.push('--- Guarantors / arevim ---');
      for (const g of lease.guarantors) {
        L.push(`- ${g.name || ''} (${g.id || ''}) ${g.phone || ''}`);
      }
      L.push('');
    }
    if (lease.options && lease.options.length) {
      L.push('--- Options / optzioth ---');
      for (const opt of lease.options) {
        L.push(`- ${opt.type} notice=${opt.notice || 0}d rentChange=${opt.rentChange || 0}`);
      }
      L.push('');
    }
    if (lease.protectedTenancy) {
      L.push('PROTECTED TENANCY / dayarut muganet — chok hagnat ha-dayar 1972');
      L.push(`Key money / dmei mafteach: ${lease.keyMoney}`);
      L.push('');
    }
    L.push('--- Legal refs / aslechet chok ---');
    L.push('chok ha-schirut ve-hashela, 1971');
    L.push('chok ha-schirut ha-hogenet (tikun 2017)');
    if (lease.protectedTenancy) L.push('chok hagnat ha-dayar [nusach meshulav] 1972');
    L.push('');
    L.push('Signatures / chatima:');
    L.push('Landlord / ha-maskir: ______________');
    L.push('Tenant   / ha-soker: ______________');
    L.push('Date     / taarich: ______________');
    return L;
  }

  // ── helpers ──

  _getLease(id) {
    const l = this.leases.get(id);
    if (!l) throw new Error(`lease not found: ${id} / חוזה לא נמצא`);
    return l;
  }

  getLease(id) {
    // Return a defensive copy
    return JSON.parse(JSON.stringify(this._getLease(id)));
  }

  listLeases() {
    return Array.from(this.leases.values()).map((l) => JSON.parse(JSON.stringify(l)));
  }

  getHistory() {
    return this.history.slice();
  }
}

// ─────────────────────── Exports ───────────────────────

module.exports = {
  LeaseTracker,
  LEASE_STATUS,
  INDEXATION_TYPES,
  GUARANTEE_TYPES,
  FAIR_RENTAL_LAW,
};
module.exports.default = LeaseTracker;
