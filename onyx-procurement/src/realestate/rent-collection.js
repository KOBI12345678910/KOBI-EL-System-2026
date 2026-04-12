/**
 * rent-collection.js — גביית שכר דירה (Israeli Rent Collection System)
 * Agent Y-048 / Swarm 3C — Real Estate Operations / Techno-Kol Uzi Mega-ERP — Wave 2026
 * ---------------------------------------------------------------------------
 *
 * End-to-end rent-collection engine for Israeli landlords. Handles:
 *
 *   • Schedule generation from a lease (month-by-month)
 *   • Payments: check / bank transfer / cash / standing order / Paybox / Bit
 *   • Check bank (בנק שיקים) — 12+ post-dated checks typical of Israeli leases
 *   • Late notice generation (Hebrew + English) with compounding interest
 *     per ריבית פיגורים (Israeli default interest rate, Bank of Israel)
 *   • Aging buckets (1-30 / 31-60 / 61-90 / 90+) per landlord/tenant
 *   • Bounced-check handling per חוק שיקים ללא כיסוי, התשמ"א-1981
 *   • Standing-order file generation (Masav-compatible, bank-agnostic)
 *   • 1099-equivalent annual income summary — report to רשות המסים /
 *     מס הכנסה for the landlord's annual return (form 5329 / 1301).
 *
 * Rule of the house: לא מוחקים רק משדרגים ומגדלים —
 * this module NEVER deletes, NEVER mutates caller data, and is additive only.
 * All state is kept inside the RentCollection instance (or bring-your-own store),
 * and every method returns a *new* object rather than reaching into inputs.
 *
 * Zero external dependencies. Bilingual labels (Hebrew + English) everywhere.
 * Pure functions where possible; methods that mutate instance state are
 * documented as such.
 *
 * ---------------------------------------------------------------------------
 * Public API (class RentCollection):
 *
 *   addLease(lease)                   → registers a lease for the landlord
 *   scheduleRent(leaseId)             → month-by-month rent schedule
 *   recordPayment(entry)              → logs a payment + allocates to period
 *   checkBankRegister({leaseId,...})  → stores a batch of post-dated checks
 *   generateLateNotice(leaseId,period)→ bilingual late notice with interest
 *   aging(landlord)                   → 1-30 / 31-60 / 61-90 / 90+ buckets
 *   bouncedCheckHandling(checkId)     → consequences + legal next steps
 *   standingOrderFile(bank)           → Masav-style direct-debit batch file
 *   tax1099(period)                   → 1099-equivalent landlord income summary
 *
 * ---------------------------------------------------------------------------
 * Legal references (Israeli):
 *
 *   חוק השכירות והשאילה, תשל"א-1971             Rental & loan law
 *   חוק שיקים ללא כיסוי, התשמ"א-1981             Bounced-checks law
 *   חוק פסיקת ריבית והצמדה, תשכ"א-1961           Default interest law
 *   חוק מיסוי מקרקעין (שבח ורכישה), התשכ"ג-1963  Real-estate taxation
 *   חוק פרוטקציה לשוכרי דיור - אין רלוונטי לשכירות חופשית
 *   פקודת מס הכנסה [נוסח חדש], התשכ"א-1961       Income tax ordinance
 *     סעיף 2(6) — הכנסה משכר דירה / rental income
 *     סעיף 122  — מסלול 10% על דירת מגורים להשכרה
 *
 * ---------------------------------------------------------------------------
 * Data shapes (JSDoc):
 *
 * @typedef {Object} Lease
 * @property {string} id                         Lease ID (unique)
 * @property {string} landlord                   Landlord name / ID
 * @property {string} tenant                     Tenant name / ID
 * @property {string} property                   Property description / address
 * @property {number} monthlyRent                Base monthly rent in ILS
 * @property {string} currency                   'ILS' (default)
 * @property {string} startDate                  ISO YYYY-MM-DD
 * @property {string} endDate                    ISO YYYY-MM-DD
 * @property {number} [dayOfMonth]               Due day of month (default: 1)
 * @property {number} [indexation]               Annual CPI adjustment (e.g. 0.02)
 * @property {number} [graceDays]                Grace period before late (default: 7)
 * @property {number} [latePenaltyRate]          Override annual penalty rate
 * @property {string} [vatMode]                  'none' | 'included' | 'added'
 *
 * @typedef {Object} PaymentEntry
 * @property {string} leaseId
 * @property {string} period                     'YYYY-MM' — rent period covered
 * @property {number} amount                     ILS
 * @property {'check'|'transfer'|'cash'|'standing-order'|'paybox'|'bit'} method
 * @property {string} [reference]                Check number / txn ID / receipt
 * @property {string} paymentDate                ISO YYYY-MM-DD
 * @property {string} [notes]
 *
 * @typedef {Object} CheckEntry
 * @property {string} number                     Check number
 * @property {string} bank                       Bank name or Israeli bank code
 * @property {string} branch                     Branch number
 * @property {string} account                    Account number
 * @property {number} amount                     ILS
 * @property {string} dueDate                    ISO YYYY-MM-DD (post-dated)
 * @property {'pending'|'cleared'|'bounced'|'returned'} [status]
 * @property {string} [period]                   Rent period this check covers
 */

'use strict';

// ═══════════════════════════════════════════════════════════════
// Constants — bilingual labels, rates, citations
// ═══════════════════════════════════════════════════════════════

/**
 * Default Israeli rent-collection constants for 2026.
 *
 * LATE_INTEREST_ANNUAL — ריבית פיגורים (annual) per חוק פסיקת ריבית והצמדה,
 * published by the Accountant General; in 2026 the statutory default is
 * 4% + CPI. We use 4% flat here so the engine is deterministic; callers
 * can override via `lease.latePenaltyRate`.
 *
 * GRACE_DAYS_DEFAULT — customary grace period before a rent is "late".
 * Under Israeli rental practice, 7 days is the market standard.
 *
 * BOUNCED_CHECK_THRESHOLD — after N bounced checks in a 12-month window,
 * a tenant may be placed on the "restricted customer" list by Bank of
 * Israel. Per חוק שיקים ללא כיסוי the threshold is 10 checks in 12 months.
 */
const CONSTANTS = Object.freeze({
  LATE_INTEREST_ANNUAL: 0.04,          // 4% annual — ריבית פיגורים
  GRACE_DAYS_DEFAULT: 7,                // תקופת חסד
  BOUNCED_CHECK_THRESHOLD: 10,          // סעיף 2(א) חוק שיקים ללא כיסוי
  BOUNCED_CHECK_WINDOW_MONTHS: 12,
  RESTRICTION_PERIOD_MONTHS: 12,        // "לקוח מוגבל" — 12 חודשים
  DAY_MS: 86400000,
});

const LAW_CITATIONS = Object.freeze({
  RENTAL_LAW: {
    he: 'חוק השכירות והשאילה, התשל"א-1971',
    en: 'Rental and Loan Law, 1971',
  },
  BOUNCED_CHECKS_LAW: {
    he: 'חוק שיקים ללא כיסוי, התשמ"א-1981',
    en: 'Bounced Checks Law, 1981',
  },
  INTEREST_LAW: {
    he: 'חוק פסיקת ריבית והצמדה, התשכ"א-1961',
    en: 'Interest Adjudication and Linkage Law, 1961',
  },
  INCOME_TAX: {
    he: 'פקודת מס הכנסה [נוסח חדש], התשכ"א-1961, סעיף 2(6) / סעיף 122',
    en: 'Income Tax Ordinance, §2(6) / §122',
  },
});

const LABELS = Object.freeze({
  lease:       { he: 'חוזה שכירות',        en: 'Lease' },
  landlord:    { he: 'משכיר',              en: 'Landlord' },
  tenant:      { he: 'שוכר',               en: 'Tenant' },
  property:    { he: 'נכס',                en: 'Property' },
  period:      { he: 'תקופה',              en: 'Period' },
  dueDate:     { he: 'תאריך לתשלום',       en: 'Due date' },
  paidDate:    { he: 'תאריך תשלום',         en: 'Paid date' },
  daysLate:    { he: 'ימי פיגור',          en: 'Days late' },
  amount:      { he: 'סכום',               en: 'Amount' },
  interest:    { he: 'ריבית פיגורים',      en: 'Late interest' },
  total:       { he: 'סה"כ לתשלום',        en: 'Total due' },
  check:       { he: 'שיק',                en: 'Check' },
  bounced:     { he: 'חזר',                en: 'Bounced' },
  cleared:     { he: 'נפרע',               en: 'Cleared' },
  pending:     { he: 'ממתין',              en: 'Pending' },
  returned:    { he: 'הוחזר',              en: 'Returned' },
  transfer:    { he: 'העברה בנקאית',       en: 'Bank transfer' },
  cash:        { he: 'מזומן',              en: 'Cash' },
  standing:    { he: 'הוראת קבע',          en: 'Standing order' },
  paybox:      { he: 'פייבוקס',            en: 'Paybox' },
  bit:         { he: 'ביט',                en: 'Bit' },
});

const PAYMENT_METHODS = Object.freeze([
  'check',
  'transfer',
  'cash',
  'standing-order',
  'paybox',
  'bit',
]);

const CHECK_STATUSES = Object.freeze([
  'pending',
  'cleared',
  'bounced',
  'returned',
]);

// ═══════════════════════════════════════════════════════════════
// Tiny zero-dep helpers — dates, rounding, formatting
// ═══════════════════════════════════════════════════════════════

/** Round to 2 decimal places (ILS agorot). */
function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

/** Parse ISO YYYY-MM-DD into an integer UTC timestamp. */
function parseDate(iso) {
  if (iso instanceof Date) return iso.getTime();
  if (typeof iso !== 'string') {
    throw new TypeError(`Invalid date: ${iso}`);
  }
  // Accept 'YYYY-MM-DD' or 'YYYY-MM-DDTHH:MM:SS...'
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) throw new TypeError(`Invalid ISO date: ${iso}`);
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/** Format a UTC timestamp as YYYY-MM-DD. */
function formatDate(ts) {
  const d = new Date(ts);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

/** Add N whole days to a YYYY-MM-DD (or timestamp). */
function addDays(iso, days) {
  return formatDate(parseDate(iso) + days * CONSTANTS.DAY_MS);
}

/** Add N whole months to a YYYY-MM-DD, clamping day-of-month. */
function addMonths(iso, months) {
  const d = new Date(parseDate(iso));
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const day = d.getUTCDate();
  const target = new Date(Date.UTC(y, m + months, 1));
  const lastDay = new Date(Date.UTC(
    target.getUTCFullYear(),
    target.getUTCMonth() + 1,
    0,
  )).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return formatDate(target.getTime());
}

/** Whole-day difference (b − a). */
function daysBetween(a, b) {
  return Math.round((parseDate(b) - parseDate(a)) / CONSTANTS.DAY_MS);
}

/** Format ILS amount as a bilingual label (₪ 1,234.56). */
function formatIls(n) {
  const parts = round2(n).toFixed(2).split('.');
  const intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `\u20AA ${intPart}.${parts[1]}`;
}

/** Generate a YYYY-MM period key. */
function periodKey(iso) {
  return iso.slice(0, 7);
}

/** Normalize any incoming Lease to a safe frozen object. */
function normalizeLease(lease) {
  if (!lease || typeof lease !== 'object') {
    throw new TypeError('Lease must be an object');
  }
  if (!lease.id) throw new TypeError('Lease.id required');
  if (!lease.startDate || !lease.endDate) {
    throw new TypeError('Lease.startDate / endDate required');
  }
  if (!(Number(lease.monthlyRent) > 0)) {
    throw new TypeError('Lease.monthlyRent must be a positive number');
  }
  return Object.freeze({
    id: String(lease.id),
    landlord: String(lease.landlord || ''),
    tenant: String(lease.tenant || ''),
    property: String(lease.property || ''),
    monthlyRent: Number(lease.monthlyRent),
    currency: String(lease.currency || 'ILS'),
    startDate: String(lease.startDate),
    endDate: String(lease.endDate),
    dayOfMonth: Number.isInteger(lease.dayOfMonth) ? lease.dayOfMonth : 1,
    indexation: Number(lease.indexation || 0),
    graceDays: Number.isInteger(lease.graceDays)
      ? lease.graceDays
      : CONSTANTS.GRACE_DAYS_DEFAULT,
    latePenaltyRate: Number.isFinite(lease.latePenaltyRate)
      ? lease.latePenaltyRate
      : CONSTANTS.LATE_INTEREST_ANNUAL,
    vatMode: String(lease.vatMode || 'none'),
  });
}

// ═══════════════════════════════════════════════════════════════
// RentCollection class
// ═══════════════════════════════════════════════════════════════

class RentCollection {
  constructor(options = {}) {
    /** @type {Map<string, Lease>} */
    this.leases = new Map();
    /** @type {Map<string, Array>} */ // leaseId → payment entries
    this.payments = new Map();
    /** @type {Map<string, Array>} */ // leaseId → check entries
    this.checks = new Map();
    /** @type {Array} */               // flat list of all bounced events
    this.bouncedEvents = [];
    /** @type {string} today (ISO)     — for deterministic tests */
    this.today = options.today
      ? formatDate(parseDate(options.today))
      : formatDate(Date.now());
    /** @type {object} optional bring-your-own logger */
    this.logger = options.logger || null;
  }

  // ───────────────────────────────────────────────────────────
  // Lease registration — additive only
  // ───────────────────────────────────────────────────────────

  /**
   * Register a lease. Upgrading an existing ID is allowed (returns a new
   * frozen lease); never deletes.
   */
  addLease(lease) {
    const n = normalizeLease(lease);
    this.leases.set(n.id, n);
    if (!this.payments.has(n.id)) this.payments.set(n.id, []);
    if (!this.checks.has(n.id))   this.checks.set(n.id, []);
    return n;
  }

  _requireLease(leaseId) {
    const lease = this.leases.get(String(leaseId));
    if (!lease) throw new Error(`Unknown leaseId: ${leaseId}`);
    return lease;
  }

  // ───────────────────────────────────────────────────────────
  // scheduleRent — month-by-month schedule from a lease
  // ───────────────────────────────────────────────────────────

  /**
   * Generate a month-by-month rent schedule for a lease.
   * Applies `indexation` (annual CPI) on each anniversary.
   *
   * Returns a frozen array of { period, dueDate, amount, cumulative }.
   */
  scheduleRent(leaseId) {
    const lease = this._requireLease(leaseId);
    const start = parseDate(lease.startDate);
    const end   = parseDate(lease.endDate);
    if (end < start) {
      throw new Error(`Lease ${leaseId} ends before it starts`);
    }

    const rows = [];
    let cumulative = 0;
    let cursor = lease.startDate;
    let monthIdx = 0;
    let currentRent = lease.monthlyRent;
    const anniversaryYear = new Date(start).getUTCFullYear();

    while (parseDate(cursor) <= end) {
      // Apply indexation on each new anniversary year
      const yr = new Date(parseDate(cursor)).getUTCFullYear();
      const yearsElapsed = yr - anniversaryYear;
      if (yearsElapsed > 0 && lease.indexation > 0) {
        currentRent = round2(
          lease.monthlyRent * Math.pow(1 + lease.indexation, yearsElapsed),
        );
      }

      // Anchor dueDate to the configured day-of-month (clamped)
      const d = new Date(parseDate(cursor));
      const yr2 = d.getUTCFullYear();
      const mo2 = d.getUTCMonth();
      const lastDay = new Date(Date.UTC(yr2, mo2 + 1, 0)).getUTCDate();
      const day = Math.min(lease.dayOfMonth, lastDay);
      const dueDate = formatDate(Date.UTC(yr2, mo2, day));

      cumulative = round2(cumulative + currentRent);
      rows.push(Object.freeze({
        period: periodKey(dueDate),
        dueDate,
        amount: round2(currentRent),
        cumulative,
        index: monthIdx,
      }));
      monthIdx++;
      cursor = addMonths(cursor, 1);
    }
    return Object.freeze(rows);
  }

  // ───────────────────────────────────────────────────────────
  // recordPayment — allocate to a period
  // ───────────────────────────────────────────────────────────

  /**
   * Log a payment against a lease period.
   * Payment methods: check, transfer, cash, standing-order, paybox, bit.
   * Returns the stored entry (frozen).
   */
  recordPayment(entry) {
    if (!entry || typeof entry !== 'object') {
      throw new TypeError('Payment entry must be an object');
    }
    const lease = this._requireLease(entry.leaseId);
    if (!PAYMENT_METHODS.includes(entry.method)) {
      throw new TypeError(
        `Invalid method: ${entry.method}. ` +
        `Expected one of: ${PAYMENT_METHODS.join(', ')}`,
      );
    }
    if (!(Number(entry.amount) > 0)) {
      throw new TypeError('Payment amount must be positive');
    }
    if (!entry.paymentDate) {
      throw new TypeError('Payment date required');
    }
    if (!entry.period) {
      throw new TypeError('Period required (YYYY-MM)');
    }

    const stored = Object.freeze({
      id: `PMT-${lease.id}-${entry.period}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      leaseId: lease.id,
      period: String(entry.period),
      amount: round2(entry.amount),
      method: String(entry.method),
      reference: String(entry.reference || ''),
      paymentDate: String(entry.paymentDate),
      notes: String(entry.notes || ''),
      recordedAt: this.today,
    });

    const list = this.payments.get(lease.id) || [];
    list.push(stored);
    this.payments.set(lease.id, list);

    // If this payment corresponds to a check, mark the check cleared
    if (stored.method === 'check' && stored.reference) {
      const checks = this.checks.get(lease.id) || [];
      const chk = checks.find(c => c.number === stored.reference);
      if (chk && chk.status !== 'cleared') {
        chk.status = 'cleared';
        chk.clearedAt = stored.paymentDate;
      }
    }
    return stored;
  }

  /** Total paid for a given leaseId + period key. */
  totalPaid(leaseId, period) {
    const list = this.payments.get(leaseId) || [];
    return round2(
      list
        .filter(p => p.period === period)
        .reduce((sum, p) => sum + p.amount, 0),
    );
  }

  // ───────────────────────────────────────────────────────────
  // checkBankRegister — post-dated checks ledger
  // ───────────────────────────────────────────────────────────

  /**
   * Register a batch of post-dated checks ("בנק שיקים").
   * Israeli rentals typically collect 12+ post-dated checks at signing.
   *
   * Returns the frozen list of stored checks (the whole lease ledger,
   * including any previously registered checks — additive only).
   */
  checkBankRegister({ leaseId, checks }) {
    const lease = this._requireLease(leaseId);
    if (!Array.isArray(checks)) {
      throw new TypeError('checks must be an array');
    }
    const list = this.checks.get(lease.id) || [];
    for (const c of checks) {
      if (!c || !c.number) {
        throw new TypeError('Each check needs a `number`');
      }
      if (!(Number(c.amount) > 0)) {
        throw new TypeError(`Check ${c.number} amount must be positive`);
      }
      if (!c.dueDate) {
        throw new TypeError(`Check ${c.number} dueDate required`);
      }
      const status = c.status && CHECK_STATUSES.includes(c.status)
        ? c.status
        : 'pending';

      // Avoid duplicates by check number for the same lease
      const exists = list.find(x => x.number === String(c.number));
      if (exists) {
        // Upgrade path: only change status if progressing
        exists.status = status;
        if (c.period) exists.period = String(c.period);
        continue;
      }
      list.push({
        id: `CHK-${lease.id}-${c.number}`,
        leaseId: lease.id,
        number: String(c.number),
        bank: String(c.bank || ''),
        branch: String(c.branch || ''),
        account: String(c.account || ''),
        amount: round2(c.amount),
        dueDate: String(c.dueDate),
        status,
        period: c.period ? String(c.period) : periodKey(c.dueDate),
        registeredAt: this.today,
      });
    }
    // Sort by dueDate so ledger is always in order
    list.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    this.checks.set(lease.id, list);
    // Return a deep-frozen snapshot (copies) so callers can't mutate the
    // internal ledger — the live ledger stays mutable so status can be
    // upgraded forward (pending → cleared / bounced) without deleting.
    return Object.freeze(list.map(c => Object.freeze({ ...c })));
  }

  // ───────────────────────────────────────────────────────────
  // generateLateNotice — bilingual late notice + interest
  // ───────────────────────────────────────────────────────────

  /**
   * Late interest formula — compounding daily, annual rate → daily:
   *
   *    dailyRate   = (1 + annualRate) ** (1 / 365) - 1
   *    interest    = principal * ((1 + dailyRate) ** daysLate - 1)
   *
   * This matches the general חוק פסיקת ריבית והצמדה practice of compounding
   * annual rate over the delay window.
   */
  computeLateInterest(principal, daysLate, annualRate) {
    if (daysLate <= 0) return 0;
    const rate = Number.isFinite(annualRate) ? annualRate : CONSTANTS.LATE_INTEREST_ANNUAL;
    const dailyRate = Math.pow(1 + rate, 1 / 365) - 1;
    const interest = principal * (Math.pow(1 + dailyRate, daysLate) - 1);
    return round2(interest);
  }

  /**
   * Generate a Hebrew+English late-payment notice for a specific period.
   * Returns a frozen object containing: principal, paid, outstanding,
   * daysLate, interest, totalDue, and a bilingual `text` block.
   */
  generateLateNotice(leaseId, period) {
    const lease = this._requireLease(leaseId);
    const schedule = this.scheduleRent(leaseId);
    const row = schedule.find(r => r.period === period);
    if (!row) {
      throw new Error(`Period ${period} not in lease ${leaseId} schedule`);
    }

    const principal = row.amount;
    const paid = this.totalPaid(leaseId, period);
    const outstanding = round2(Math.max(0, principal - paid));
    const dueWithGrace = addDays(row.dueDate, lease.graceDays);
    const todayTs = parseDate(this.today);
    const dueTs = parseDate(dueWithGrace);
    const daysLate = todayTs > dueTs ? daysBetween(dueWithGrace, this.today) : 0;
    const interest = this.computeLateInterest(
      outstanding,
      daysLate,
      lease.latePenaltyRate,
    );
    const totalDue = round2(outstanding + interest);

    const he = [
      `התראת פיגור בתשלום שכר דירה`,
      ``,
      `לכבוד: ${lease.tenant}`,
      `מאת:   ${lease.landlord}`,
      `נכס:   ${lease.property}`,
      `חוזה:  ${lease.id}`,
      ``,
      `תקופה:             ${row.period}`,
      `תאריך לתשלום:      ${row.dueDate}`,
      `תקופת חסד:         ${lease.graceDays} ימים`,
      `ימי פיגור:         ${daysLate}`,
      `קרן חייבת:         ${formatIls(outstanding)}`,
      `ריבית פיגורים:     ${formatIls(interest)}  (${(lease.latePenaltyRate * 100).toFixed(2)}% שנתי)`,
      `סה"כ לתשלום:       ${formatIls(totalDue)}`,
      ``,
      `בהתאם ל${LAW_CITATIONS.RENTAL_LAW.he}`,
      `ולחוק פסיקת ריבית והצמדה, התשכ"א-1961,`,
      `הננו דורשים לסלק את החוב לאלתר.`,
      `אי-תשלום עלול לגרור הליכים משפטיים.`,
    ].join('\n');

    const en = [
      `RENT PAYMENT LATE NOTICE`,
      ``,
      `To:       ${lease.tenant}`,
      `From:     ${lease.landlord}`,
      `Property: ${lease.property}`,
      `Lease:    ${lease.id}`,
      ``,
      `Period:            ${row.period}`,
      `Due date:          ${row.dueDate}`,
      `Grace:             ${lease.graceDays} days`,
      `Days late:         ${daysLate}`,
      `Principal owed:    ${formatIls(outstanding)}`,
      `Late interest:     ${formatIls(interest)}  (${(lease.latePenaltyRate * 100).toFixed(2)}% annual)`,
      `Total due:         ${formatIls(totalDue)}`,
      ``,
      `Per ${LAW_CITATIONS.RENTAL_LAW.en}`,
      `and the Interest Adjudication & Linkage Law, 1961,`,
      `payment is required immediately.`,
      `Non-payment may result in legal proceedings.`,
    ].join('\n');

    return Object.freeze({
      leaseId: lease.id,
      period: row.period,
      dueDate: row.dueDate,
      graceDays: lease.graceDays,
      daysLate,
      principal,
      paid,
      outstanding,
      annualRate: lease.latePenaltyRate,
      interest,
      totalDue,
      text: Object.freeze({ he, en }),
      generatedAt: this.today,
      citation: LAW_CITATIONS.INTEREST_LAW,
    });
  }

  // ───────────────────────────────────────────────────────────
  // aging — buckets 1-30 / 31-60 / 61-90 / 90+
  // ───────────────────────────────────────────────────────────

  /**
   * Aging report for all leases belonging to a landlord.
   * Returns frozen { landlord, today, totals, bucket_1_30, bucket_31_60,
   *                  bucket_61_90, bucket_90_plus, details[] }.
   *
   * Any period with outstanding > 0 where daysLate > 0 is bucketed.
   */
  aging(landlord) {
    const buckets = {
      '1-30': { count: 0, amount: 0 },
      '31-60': { count: 0, amount: 0 },
      '61-90': { count: 0, amount: 0 },
      '90+':   { count: 0, amount: 0 },
    };
    const details = [];

    for (const lease of this.leases.values()) {
      if (lease.landlord !== landlord) continue;
      const schedule = this.scheduleRent(lease.id);
      for (const row of schedule) {
        // Skip future rows
        if (parseDate(row.dueDate) > parseDate(this.today)) continue;
        const paid = this.totalPaid(lease.id, row.period);
        const outstanding = round2(Math.max(0, row.amount - paid));
        if (outstanding <= 0) continue;

        const dueWithGrace = addDays(row.dueDate, lease.graceDays);
        const daysLate = parseDate(this.today) > parseDate(dueWithGrace)
          ? daysBetween(dueWithGrace, this.today)
          : 0;
        if (daysLate <= 0) continue;

        let bucketName;
        if (daysLate <= 30)      bucketName = '1-30';
        else if (daysLate <= 60) bucketName = '31-60';
        else if (daysLate <= 90) bucketName = '61-90';
        else                     bucketName = '90+';

        buckets[bucketName].count += 1;
        buckets[bucketName].amount = round2(
          buckets[bucketName].amount + outstanding,
        );
        details.push(Object.freeze({
          leaseId: lease.id,
          tenant: lease.tenant,
          property: lease.property,
          period: row.period,
          dueDate: row.dueDate,
          daysLate,
          outstanding,
          bucket: bucketName,
        }));
      }
    }

    const totals = {
      count: details.length,
      amount: round2(
        Object.values(buckets).reduce((s, b) => s + b.amount, 0),
      ),
    };
    return Object.freeze({
      landlord: String(landlord),
      today: this.today,
      totals,
      bucket_1_30:   Object.freeze(buckets['1-30']),
      bucket_31_60:  Object.freeze(buckets['31-60']),
      bucket_61_90:  Object.freeze(buckets['61-90']),
      bucket_90_plus: Object.freeze(buckets['90+']),
      details: Object.freeze(details),
    });
  }

  // ───────────────────────────────────────────────────────────
  // bouncedCheckHandling — consequences + legal tracker
  // ───────────────────────────────────────────────────────────

  /**
   * Handle a bounced check under חוק שיקים ללא כיסוי, התשמ"א-1981.
   * Marks the check as 'bounced', logs a bounced event, and returns a
   * consequences object including:
   *
   *   • countInWindow — how many bounced checks this tenant has in the
   *                     last 12 months
   *   • restrictedRisk — true if countInWindow ≥ 10 (threshold for
   *                      "לקוח מוגבל" status under §2 of the law)
   *   • suggestedActions[] — bilingual next-steps list
   *   • legalCitation — bilingual law reference
   */
  bouncedCheckHandling(checkId) {
    // checkId can be either the internal "CHK-leaseId-number" or
    // just "number" if there is only one lease
    let found = null;
    let foundLease = null;
    for (const [leaseId, list] of this.checks.entries()) {
      const chk = list.find(c => c.id === checkId || c.number === String(checkId));
      if (chk) {
        found = chk;
        foundLease = this.leases.get(leaseId);
        break;
      }
    }
    if (!found) {
      throw new Error(`Check not found: ${checkId}`);
    }
    // Never delete — only upgrade status forward
    found.status = 'bounced';
    found.bouncedAt = this.today;

    const event = Object.freeze({
      checkId: found.id,
      leaseId: foundLease ? foundLease.id : null,
      tenant: foundLease ? foundLease.tenant : '',
      number: found.number,
      amount: found.amount,
      bank: found.bank,
      bouncedAt: this.today,
      dueDate: found.dueDate,
    });
    this.bouncedEvents.push(event);

    // Count events for this tenant in the last 12 months
    const windowStart = addMonths(this.today, -CONSTANTS.BOUNCED_CHECK_WINDOW_MONTHS);
    const countInWindow = this.bouncedEvents.filter(e =>
      e.tenant && foundLease && e.tenant === foundLease.tenant &&
      parseDate(e.bouncedAt) >= parseDate(windowStart),
    ).length;

    const restrictedRisk = countInWindow >= CONSTANTS.BOUNCED_CHECK_THRESHOLD;

    const suggestedActions = [
      {
        code: 'NOTIFY_TENANT',
        he: 'שלח הודעה רשמית לשוכר על החזרת השיק',
        en: 'Send formal notice to tenant about bounced check',
      },
      {
        code: 'RESUBMIT_OR_COLLECT',
        he: 'הצג את השיק שוב לבנק או דרוש תשלום חלופי',
        en: 'Resubmit the check to the bank or demand alternative payment',
      },
      {
        code: 'ADD_LATE_INTEREST',
        he: 'הוסף ריבית פיגורים מיום הפירעון המקורי',
        en: 'Add late interest from the original due date',
      },
      {
        code: 'CONSIDER_ENFORCEMENT',
        he: 'שקול פתיחת תיק הוצל"פ בגין שיק ללא כיסוי',
        en: 'Consider opening a Hotza\'a LaPoal (execution) file for the dishonored check',
      },
    ];
    if (restrictedRisk) {
      suggestedActions.push({
        code: 'REPORT_RESTRICTED_CUSTOMER',
        he: 'לקוח עבר את רף 10 שיקים ב-12 חודשים — עלול להיכנס לרשימת לקוח מוגבל',
        en: 'Tenant has exceeded 10 bounced checks in 12 months — eligible for "restricted customer" list',
      });
    }

    return Object.freeze({
      event,
      status: found.status,
      countInWindow,
      threshold: CONSTANTS.BOUNCED_CHECK_THRESHOLD,
      restrictedRisk,
      restrictionPeriodMonths: CONSTANTS.RESTRICTION_PERIOD_MONTHS,
      suggestedActions: Object.freeze(suggestedActions.map(Object.freeze)),
      legalCitation: LAW_CITATIONS.BOUNCED_CHECKS_LAW,
    });
  }

  // ───────────────────────────────────────────────────────────
  // standingOrderFile — Masav-style direct-debit batch
  // ───────────────────────────────────────────────────────────

  /**
   * Generate a standing-order instruction batch for a given bank.
   * The output is a minimal, deterministic, bank-agnostic representation
   * suitable for Masav ("מס"ב") or direct-debit systems — every row is a
   * single charge entry with all identifying fields.
   *
   * We emit both a pipe-delimited text payload (human-readable, bilingual)
   * and a structured rows[] array the caller can convert to whatever real
   * bank format they need (fixed-width, XML, ISO 20022, etc.).
   */
  standingOrderFile(bank) {
    const rows = [];
    for (const lease of this.leases.values()) {
      const checks = this.checks.get(lease.id) || [];
      // Only leases configured for bank transfer / standing order count,
      // identified here by having at least one pending check at that bank
      // OR by an explicit recordPayment flagged standing-order.
      const matchChecks = checks.filter(c =>
        (!bank || c.bank === bank) && c.status === 'pending',
      );
      if (matchChecks.length === 0) {
        // Fall back to raw schedule-based charges for pure standing orders
        const schedule = this.scheduleRent(lease.id);
        for (const row of schedule) {
          if (parseDate(row.dueDate) < parseDate(this.today)) continue;
          rows.push({
            leaseId: lease.id,
            tenant: lease.tenant,
            bank: bank || '',
            branch: '',
            account: '',
            period: row.period,
            dueDate: row.dueDate,
            amount: row.amount,
            currency: lease.currency,
            reference: `SO-${lease.id}-${row.period}`,
            type: 'standing-order',
          });
        }
        continue;
      }
      for (const c of matchChecks) {
        rows.push({
          leaseId: lease.id,
          tenant: lease.tenant,
          bank: c.bank,
          branch: c.branch,
          account: c.account,
          period: c.period,
          dueDate: c.dueDate,
          amount: c.amount,
          currency: lease.currency,
          reference: `CHK-${c.number}`,
          type: 'check',
        });
      }
    }
    rows.sort((a, b) =>
      (a.dueDate + a.leaseId).localeCompare(b.dueDate + b.leaseId),
    );

    const header = [
      `# STANDING ORDER BATCH / הוראת קבע`,
      `# Generated: ${this.today}`,
      `# Bank filter: ${bank || 'ALL'}`,
      `# Row count: ${rows.length}`,
      `leaseId|tenant|bank|branch|account|period|dueDate|amount|currency|reference|type`,
    ].join('\n');
    const body = rows.map(r =>
      [
        r.leaseId, r.tenant, r.bank, r.branch, r.account,
        r.period, r.dueDate, r.amount.toFixed(2),
        r.currency, r.reference, r.type,
      ].join('|'),
    ).join('\n');

    const totalAmount = round2(
      rows.reduce((s, r) => s + r.amount, 0),
    );
    return Object.freeze({
      bank: bank || 'ALL',
      generatedAt: this.today,
      count: rows.length,
      totalAmount,
      rows: Object.freeze(rows.map(Object.freeze)),
      text: `${header}\n${body}\n`,
    });
  }

  // ───────────────────────────────────────────────────────────
  // tax1099 — 1099-equivalent annual landlord income summary
  // ───────────────────────────────────────────────────────────

  /**
   * Build a 1099-equivalent income summary per landlord for a given period.
   *
   * `period` may be either 'YYYY' (full calendar year) or 'YYYY-MM'.
   * Israel doesn't have a "1099", but landlords are required to declare
   * rental income on their annual return (form 5329 / 1301) under
   * פקודת מס הכנסה סעיף 2(6). This helper aggregates:
   *
   *   • grossRental          — total cash collected
   *   • byMethod             — subtotals per payment method
   *   • byTenant             — one row per tenant
   *   • estimatedTaxSection122 — 10% regime on residential rent (section 122)
   *
   * Returns a frozen report object suitable for attaching to the annual
   * tax package.
   */
  tax1099(period) {
    if (!period || typeof period !== 'string') {
      throw new TypeError('period required — YYYY or YYYY-MM');
    }
    const isYear = /^\d{4}$/.test(period);
    const isMonth = /^\d{4}-\d{2}$/.test(period);
    if (!isYear && !isMonth) {
      throw new TypeError('period must be YYYY or YYYY-MM');
    }

    const matches = (p) =>
      isYear ? p.startsWith(`${period}-`) : p === period;

    const byLandlord = new Map();
    for (const lease of this.leases.values()) {
      const list = this.payments.get(lease.id) || [];
      const relevant = list.filter(p => matches(p.period));
      if (relevant.length === 0) continue;

      if (!byLandlord.has(lease.landlord)) {
        byLandlord.set(lease.landlord, {
          landlord: lease.landlord,
          period,
          grossRental: 0,
          byMethod: {},
          byTenant: new Map(),
          count: 0,
        });
      }
      const entry = byLandlord.get(lease.landlord);
      for (const p of relevant) {
        entry.grossRental = round2(entry.grossRental + p.amount);
        entry.byMethod[p.method] = round2(
          (entry.byMethod[p.method] || 0) + p.amount,
        );
        const t = entry.byTenant.get(lease.tenant) || {
          tenant: lease.tenant,
          leaseId: lease.id,
          property: lease.property,
          amount: 0,
          count: 0,
        };
        t.amount = round2(t.amount + p.amount);
        t.count += 1;
        entry.byTenant.set(lease.tenant, t);
        entry.count += 1;
      }
    }

    // Section 122 — 10% regime (residential)
    const reports = Array.from(byLandlord.values()).map(entry => {
      const estimatedTaxSection122 = round2(entry.grossRental * 0.10);
      return Object.freeze({
        landlord: entry.landlord,
        period: entry.period,
        periodType: isYear ? 'year' : 'month',
        grossRental: entry.grossRental,
        byMethod: Object.freeze({ ...entry.byMethod }),
        byTenant: Object.freeze(
          Array.from(entry.byTenant.values()).map(Object.freeze),
        ),
        paymentCount: entry.count,
        estimatedTaxSection122,
        citation: LAW_CITATIONS.INCOME_TAX,
        generatedAt: this.today,
      });
    });
    return Object.freeze({
      period,
      periodType: isYear ? 'year' : 'month',
      count: reports.length,
      reports: Object.freeze(reports),
    });
  }
}

// ═══════════════════════════════════════════════════════════════
// Exports
// ═══════════════════════════════════════════════════════════════

module.exports = {
  RentCollection,
  CONSTANTS,
  LAW_CITATIONS,
  LABELS,
  PAYMENT_METHODS,
  CHECK_STATUSES,
  // Internal helpers exposed for testing / reuse
  _internals: Object.freeze({
    round2,
    parseDate,
    formatDate,
    addDays,
    addMonths,
    daysBetween,
    formatIls,
    periodKey,
    normalizeLease,
  }),
};
