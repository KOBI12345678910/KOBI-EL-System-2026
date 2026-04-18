/* ============================================================================
 * Techno-Kol ERP — Check Register (פנקס שיקים)
 * Agent Y-082 / Swarm Finance / Onyx Procurement
 * ----------------------------------------------------------------------------
 * רישום שיקים — שיקים יוצאים (paid-out) + שיקים נכנסים (paid-in)
 *
 *   - Outgoing check issuance with sequential numbering per account
 *   - Incoming check recording (drawer bank/branch/account, postdated flag)
 *   - Endorsement chain (הסבה / היסב) per סעיף 13 פקודת השטרות
 *   - Bank deposit tracking (הפקדה)
 *   - Clearance lifecycle: posted → pending → cleared | bounced | returned
 *   - Bounced-check handling per חוק שיקים ללא כיסוי התשמ"א-1981
 *     • First bounce = warning
 *     • 10 returned checks in 12 months → BoI "לקוח מוגבל חמור"
 *     • Status "מוגבל" = drawer may not issue new checks for 1 year
 *   - Restricted-customer (לקוח מוגבל) lookup — stub for real BoI registry
 *   - Dual-signature void (ביטול צ'ק דו-חתימתי) — requires 2 authorizers
 *   - Post-dated check list (צ'קים דחויים) — common B2B & rent practice
 *   - Bank reconciliation against cleared statement lines
 *
 * Israeli Legal References (for auditors):
 *   1. פקודת השטרות [נוסח חדש] — Bills of Exchange Ordinance
 *   2. חוק שיקים ללא כיסוי התשמ"א-1981 — Bounced Checks Law 1981
 *   3. הוראות ניהול בנקאי תקין 439 — BoI proper banking conduct
 *   4. חוק צמצום השימוש במזומן התשע"ח-2018 — limits cash ≥ ₪6,000 but
 *      permits checks; postdated checks remain legal tender instruments.
 *   5. נוהל 420 — המפקח על הבנקים — restricted customer list mechanics
 *
 * RULES (per Techno-Kol Uzi doctrine):
 *   - NEVER delete data — לא מוחקים רק משדרגים ומגדלים
 *   - Soft-void via status transitions only (voided/returned/cancelled)
 *   - Hebrew + English bilingual labels on every error / event
 *   - Zero runtime dependencies — plain JavaScript (Node + browser)
 * ========================================================================== */

'use strict';

/* ----------------------------------------------------------------------------
 * Constants — חוקים ומדיניות
 * -------------------------------------------------------------------------- */

/**
 * Restricted customer thresholds per חוק שיקים ללא כיסוי.
 *
 *  - 10 שיקים שלא כובדו מתוך 12 חודשים → לקוח מוגבל (1 year)
 *  - 15 שיקים שלא כובדו מתוך 12 חודשים → לקוח מוגבל חמור (2 years)
 *  - לקוח מוגבל רגיל                  → מוגבל במשיכת שיקים חדשים
 *  - לקוח מוגבל חמור                  → מוגבל בכל חשבונותיו וכרטיסי אשראי
 */
const RESTRICTED_CUSTOMER = Object.freeze({
  BOUNCE_THRESHOLD_REGULAR: 10,
  BOUNCE_THRESHOLD_SEVERE: 15,
  WINDOW_MONTHS: 12,
  RESTRICTION_MONTHS_REGULAR: 12, // 1 year
  RESTRICTION_MONTHS_SEVERE: 24   // 2 years
});

/** Check lifecycle states — מחזור חיי השיק */
const CHECK_STATUS = Object.freeze({
  DRAFT:     'draft',      // טיוטה — not yet signed / issued
  ISSUED:    'issued',     // הופק — issued, not yet posted
  POSTED:    'posted',     // נרשם — posted to ledger, not yet at bank
  ENDORSED:  'endorsed',   // הוסב — passed to another payee
  DEPOSITED: 'deposited',  // הופקד — handed to bank for clearance
  PENDING:   'pending',    // בהמתנה — awaiting clearance (T+1/T+2 Israeli)
  CLEARED:   'cleared',    // נפרע — honoured and cleared
  BOUNCED:   'bounced',    // חזר — returned without cover
  RETURNED:  'returned',   // הוחזר — returned for technical reason
  VOIDED:    'voided',     // בוטל — voided before clearance (requires 2 sig)
  CANCELLED: 'cancelled',  // הוחזר לפני הפקדה — handed back to payer
  EXPIRED:   'expired'     // פג תוקף — 180 days since issue (BoI default)
});

/** Direction — כיוון השיק */
const CHECK_DIRECTION = Object.freeze({
  OUTGOING: 'outgoing',  // יוצא — שיקים שאנחנו מושכים
  INCOMING: 'incoming'   // נכנס — שיקים שקיבלנו
});

/**
 * Bounce reasons — סיבות חזרת שיק (BoI code list).
 * Codes are the short-codes returned by Israeli clearing banks.
 */
const BOUNCE_REASON = Object.freeze({
  NO_COVER:           'no_cover',           // אין כיסוי — counts toward restriction
  ACCOUNT_CLOSED:     'account_closed',     // חשבון סגור — counts
  STOP_PAYMENT:       'stop_payment',       // הוראת ביטול — does NOT count
  SIGNATURE_INVALID:  'signature_invalid',  // חתימה לא תקינה — technical
  AMOUNT_MISMATCH:    'amount_mismatch',    // סכום שגוי — technical
  DATE_INVALID:       'date_invalid',       // תאריך שגוי — technical
  POSTDATED:          'postdated',          // צ'ק דחוי — technical
  FORGED:             'forged',             // מזויף — criminal
  RESTRICTED_CUSTOMER:'restricted_customer',// לקוח מוגבל — counts
  OTHER:              'other'
});

/**
 * Bounce reasons that COUNT toward the 10/15 threshold per חוק שיקים ללא כיסוי.
 * Technical reasons (signature, date, amount) do NOT count.
 */
const COUNTING_BOUNCE_REASONS = Object.freeze([
  BOUNCE_REASON.NO_COVER,
  BOUNCE_REASON.ACCOUNT_CLOSED,
  BOUNCE_REASON.RESTRICTED_CUSTOMER
]);

/** BoI default expiry — 180 days after issue */
const CHECK_EXPIRY_DAYS = 180;

/** Israeli clearing settlement — T+1 for same bank, T+2 cross-bank */
const CLEARING_DAYS_DEFAULT = 2;

/* ----------------------------------------------------------------------------
 * Helpers — money, id, dates, clone, errors
 * -------------------------------------------------------------------------- */

function round2(n) {
  if (n === null || n === undefined || isNaN(n)) return 0;
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

function isPositiveNumber(n) {
  return typeof n === 'number' && isFinite(n) && n > 0;
}

function nowIso() {
  return new Date().toISOString();
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function isValidDate(s) {
  if (typeof s !== 'string') return false;
  const d = new Date(s);
  return !isNaN(d.getTime());
}

function diffDays(a, b) {
  const da = new Date(a).getTime();
  const db = new Date(b).getTime();
  if (isNaN(da) || isNaN(db)) return 0;
  return Math.round((db - da) / (1000 * 60 * 60 * 24));
}

function monthsBetween(a, b) {
  const da = new Date(a);
  const db = new Date(b);
  if (isNaN(da.getTime()) || isNaN(db.getTime())) return 0;
  return (db.getFullYear() - da.getFullYear()) * 12 +
         (db.getMonth() - da.getMonth());
}

function clone(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Bilingual error — never throws raw strings.
 */
function err(code, en, he, extra) {
  const e = new Error(`${code}: ${en} / ${he}`);
  e.code = code;
  e.en = en;
  e.he = he;
  if (extra) e.data = extra;
  return e;
}

/* ----------------------------------------------------------------------------
 * In-memory store — pluggable
 * -------------------------------------------------------------------------- */

function createMemoryStore() {
  return {
    checks: new Map(),             // checkId -> Check
    checksByNumber: new Map(),     // `${accountId}:${number}` -> checkId
    accountSeq: new Map(),         // accountId -> next sequential check number
    restrictedDrawers: new Map(),  // drawerAccount -> {status, until, reason}
    bounceHistory: new Map(),      // drawerAccount -> [bounce records]
    audits: [],                    // append-only event log
    checkSeq: 0                    // global id seed
  };
}

let _defaultStore = createMemoryStore();

/* ----------------------------------------------------------------------------
 * CheckRegister — main class
 * -------------------------------------------------------------------------- */

class CheckRegister {

  /**
   * @param {object} [opts]
   * @param {object} [opts.store]       — pluggable store (pass {} for fresh)
   * @param {function} [opts.now]       — () => ISO string (for tests)
   * @param {number} [opts.clearingDays]
   * @param {object} [opts.restrictedRegistry] — external BoI stub
   *        { isRestricted(drawerAccount) -> boolean|object }
   */
  constructor(opts) {
    const o = opts || {};
    this.store = o.store || _defaultStore;
    // Ensure the store has every expected slot (callers may pass `{}`).
    if (!this.store.checks) this.store.checks = new Map();
    if (!this.store.checksByNumber) this.store.checksByNumber = new Map();
    if (!this.store.accountSeq) this.store.accountSeq = new Map();
    if (!this.store.restrictedDrawers) this.store.restrictedDrawers = new Map();
    if (!this.store.bounceHistory) this.store.bounceHistory = new Map();
    if (!this.store.audits) this.store.audits = [];
    if (typeof this.store.checkSeq !== 'number') this.store.checkSeq = 0;

    this._now = typeof o.now === 'function' ? o.now : nowIso;
    this.clearingDays = Number.isFinite(o.clearingDays)
      ? o.clearingDays
      : CLEARING_DAYS_DEFAULT;
    this.restrictedRegistry = o.restrictedRegistry || null;
  }

  /* -------------------------------------------------------------------- */
  /* Internal helpers                                                     */
  /* -------------------------------------------------------------------- */

  _genCheckId() {
    this.store.checkSeq = (this.store.checkSeq || 0) + 1;
    return `CHK-${String(this.store.checkSeq).padStart(8, '0')}`;
  }

  _audit(checkId, event, payload) {
    const entry = {
      id: this.store.audits.length + 1,
      checkId: checkId || null,
      event,
      at: this._now(),
      actor: (payload && payload.actor) || null,
      data: clone(payload || {})
    };
    this.store.audits.push(entry);
    return entry;
  }

  _getCheck(checkId) {
    const c = this.store.checks.get(checkId);
    if (!c) {
      throw err(
        'ERR_CHECK_NOT_FOUND',
        `Check ${checkId} not found`,
        `שיק ${checkId} לא נמצא`
      );
    }
    return c;
  }

  /* -------------------------------------------------------------------- */
  /* Sequential number allocation — מספור רץ                              */
  /* -------------------------------------------------------------------- */

  /**
   * Returns the next available check number for an account and reserves it.
   * @param {string} accountId
   * @returns {number}
   */
  nextAvailableNumber(accountId) {
    if (!accountId) {
      throw err(
        'ERR_ACCOUNT_REQUIRED',
        'accountId required',
        'חובה לציין חשבון'
      );
    }
    const cur = this.store.accountSeq.get(accountId) || 0;
    const next = cur + 1;
    this.store.accountSeq.set(accountId, next);
    return next;
  }

  /**
   * Peek at the next number without reserving it — for UI hints.
   */
  peekNextNumber(accountId) {
    return (this.store.accountSeq.get(accountId) || 0) + 1;
  }

  /**
   * Force-set the starting number when wiring up a fresh pre-printed book.
   * Will not lower below current counter (monotonic).
   */
  setStartingNumber(accountId, startNum) {
    const cur = this.store.accountSeq.get(accountId) || 0;
    if (startNum <= cur) {
      throw err(
        'ERR_NON_MONOTONIC',
        `Starting number ${startNum} must exceed current counter ${cur}`,
        `מספר התחלתי ${startNum} חייב להיות גדול ממונה נוכחי ${cur}`
      );
    }
    this.store.accountSeq.set(accountId, startNum - 1);
  }

  /* -------------------------------------------------------------------- */
  /* Issue outgoing check — הפקת שיק יוצא                                 */
  /* -------------------------------------------------------------------- */

  /**
   * Record a check we are issuing (outgoing / paid-out).
   * @param {object} fields
   *   - accountId     : string (required) — our bank account
   *   - number        : number  — optional; auto-assigned if omitted
   *   - payee         : string (required)
   *   - amount        : number > 0 (required)
   *   - currency      : string (default 'ILS')
   *   - dueDate       : ISO date (required) — may be postdated
   *   - issueDate     : ISO date (default = today)
   *   - memo          : string (optional)
   *   - authorizer    : string (required) — signing officer
   * @returns {string} checkId
   */
  recordIssuedCheck(fields) {
    if (!fields || typeof fields !== 'object') {
      throw err('ERR_INVALID_INPUT', 'Fields required', 'שדות חובה חסרים');
    }
    const accountId = String(fields.accountId || '').trim();
    if (!accountId) {
      throw err('ERR_ACCOUNT_REQUIRED', 'accountId required', 'חובה לציין חשבון');
    }
    const payee = String(fields.payee || '').trim();
    if (!payee) {
      throw err('ERR_PAYEE_REQUIRED', 'payee required', 'חובה לציין מוטב');
    }
    const amount = round2(fields.amount);
    if (!isPositiveNumber(amount)) {
      throw err(
        'ERR_AMOUNT_INVALID',
        'amount must be positive',
        'סכום חייב להיות חיובי'
      );
    }
    const currency = String(fields.currency || 'ILS').toUpperCase();
    const dueDate = String(fields.dueDate || '').trim();
    if (!isValidDate(dueDate)) {
      throw err(
        'ERR_DUE_DATE_INVALID',
        'dueDate must be a valid ISO date',
        'תאריך פירעון חייב להיות תקין'
      );
    }
    const authorizer = String(fields.authorizer || '').trim();
    if (!authorizer) {
      throw err(
        'ERR_AUTHORIZER_REQUIRED',
        'authorizer required',
        'חובה לציין מאשר / חתום'
      );
    }

    // Allocate / honour explicit number
    let number = fields.number;
    if (number === undefined || number === null) {
      number = this.nextAvailableNumber(accountId);
    } else {
      number = Number(number);
      if (!Number.isFinite(number) || number <= 0) {
        throw err(
          'ERR_NUMBER_INVALID',
          'check number must be positive',
          'מספר שיק חייב להיות חיובי'
        );
      }
      const key = `${accountId}:${number}`;
      if (this.store.checksByNumber.has(key)) {
        throw err(
          'ERR_NUMBER_DUPLICATE',
          `check number ${number} already used on ${accountId}`,
          `מספר שיק ${number} כבר בשימוש בחשבון ${accountId}`
        );
      }
      // Advance counter if explicit number is ahead
      const cur = this.store.accountSeq.get(accountId) || 0;
      if (number > cur) this.store.accountSeq.set(accountId, number);
    }

    const issueDate = fields.issueDate
      ? String(fields.issueDate)
      : todayIso();
    const postdated = diffDays(issueDate, dueDate) > 0;

    const id = this._genCheckId();
    const check = {
      id,
      direction: CHECK_DIRECTION.OUTGOING,
      accountId,
      number,
      payee,
      payeeHe: String(fields.payeeHe || payee),
      amount,
      currency,
      issueDate,
      dueDate,
      memo: String(fields.memo || ''),
      authorizer,
      postdated,
      status: CHECK_STATUS.ISSUED,
      endorsements: [],
      depositedTo: null,
      depositedAt: null,
      clearedAt: null,
      bouncedAt: null,
      bounceReason: null,
      voidedAt: null,
      voidReason: null,
      voidApprovers: [],
      reconciled: false,
      reconciledAt: null,
      createdAt: this._now(),
      updatedAt: this._now()
    };

    this.store.checks.set(id, check);
    this.store.checksByNumber.set(`${accountId}:${number}`, id);

    this._audit(id, 'CHECK_ISSUED', {
      en: 'Outgoing check issued',
      he: 'שיק יוצא הופק',
      actor: authorizer,
      number,
      amount,
      payee,
      dueDate
    });

    return id;
  }

  /* -------------------------------------------------------------------- */
  /* Record incoming check — רישום שיק נכנס                               */
  /* -------------------------------------------------------------------- */

  /**
   * Record a check that was given TO us by a customer / counterparty.
   * @param {object} fields
   *   - accountId      : string — optional; our account that will receive it
   *   - drawerBank     : string (required) — bank code (e.g. "12" Hapoalim)
   *   - drawerBranch   : string (required)
   *   - drawerAccount  : string (required)
   *   - number         : number | string (required)
   *   - payer          : string (required) — name on check
   *   - amount         : number > 0
   *   - currency       : default 'ILS'
   *   - dueDate        : ISO date (required)
   *   - issueDate      : ISO date (default = today)
   *   - memo           : string
   *   - postdated      : boolean override; else auto-computed
   * @returns {string} checkId
   */
  recordReceivedCheck(fields) {
    if (!fields || typeof fields !== 'object') {
      throw err('ERR_INVALID_INPUT', 'Fields required', 'שדות חובה חסרים');
    }
    const drawerBank = String(fields.drawerBank || '').trim();
    if (!drawerBank) {
      throw err(
        'ERR_DRAWER_BANK_REQUIRED',
        'drawerBank required',
        'חובה לציין בנק מושך'
      );
    }
    const drawerBranch = String(fields.drawerBranch || '').trim();
    if (!drawerBranch) {
      throw err(
        'ERR_DRAWER_BRANCH_REQUIRED',
        'drawerBranch required',
        'חובה לציין סניף מושך'
      );
    }
    const drawerAccount = String(fields.drawerAccount || '').trim();
    if (!drawerAccount) {
      throw err(
        'ERR_DRAWER_ACCOUNT_REQUIRED',
        'drawerAccount required',
        'חובה לציין חשבון מושך'
      );
    }
    const number = fields.number;
    if (number === undefined || number === null || String(number).trim() === '') {
      throw err('ERR_NUMBER_REQUIRED', 'check number required', 'מספר שיק חובה');
    }
    const payer = String(fields.payer || '').trim();
    if (!payer) {
      throw err('ERR_PAYER_REQUIRED', 'payer required', 'חובה לציין משלם');
    }
    const amount = round2(fields.amount);
    if (!isPositiveNumber(amount)) {
      throw err(
        'ERR_AMOUNT_INVALID',
        'amount must be positive',
        'סכום חייב להיות חיובי'
      );
    }
    const dueDate = String(fields.dueDate || '').trim();
    if (!isValidDate(dueDate)) {
      throw err(
        'ERR_DUE_DATE_INVALID',
        'dueDate must be a valid ISO date',
        'תאריך פירעון חייב להיות תקין'
      );
    }
    const issueDate = fields.issueDate
      ? String(fields.issueDate)
      : todayIso();
    const postdatedAuto = diffDays(issueDate, dueDate) > 0;
    const postdated = typeof fields.postdated === 'boolean'
      ? fields.postdated
      : postdatedAuto;

    // Flag if drawer is known restricted
    const restricted = this.restrictedCustomerCheck(drawerAccount);
    if (restricted && restricted.restricted) {
      // Record still accepted — but audit warning raised; caller can choose
      // to reject upstream.
    }

    const id = this._genCheckId();
    const check = {
      id,
      direction: CHECK_DIRECTION.INCOMING,
      accountId: fields.accountId ? String(fields.accountId) : null,
      drawerBank,
      drawerBranch,
      drawerAccount,
      drawerKey: `${drawerBank}-${drawerBranch}-${drawerAccount}`,
      number: String(number),
      payer,
      payerHe: String(fields.payerHe || payer),
      amount,
      currency: String(fields.currency || 'ILS').toUpperCase(),
      issueDate,
      dueDate,
      memo: String(fields.memo || ''),
      postdated,
      status: CHECK_STATUS.POSTED,
      endorsements: [],
      depositedTo: null,
      depositedAt: null,
      clearedAt: null,
      bouncedAt: null,
      bounceReason: null,
      voidedAt: null,
      voidReason: null,
      voidApprovers: [],
      reconciled: false,
      reconciledAt: null,
      restrictedDrawerWarning: !!(restricted && restricted.restricted),
      createdAt: this._now(),
      updatedAt: this._now()
    };

    this.store.checks.set(id, check);

    this._audit(id, 'CHECK_RECEIVED', {
      en: 'Incoming check recorded',
      he: 'שיק נכנס נרשם',
      drawerAccount,
      amount,
      payer,
      dueDate,
      postdated,
      restrictedWarning: check.restrictedDrawerWarning
    });

    return id;
  }

  /* -------------------------------------------------------------------- */
  /* Endorsement chain — שרשרת הסבות                                      */
  /* -------------------------------------------------------------------- */

  /**
   * Add an endorsement (הסבה) to a check. Each link is appended; never
   * overwritten. Endorsements make the endorser liable if the check bounces.
   * @param {string} checkId
   * @param {string|object} endorsee — name or {name, idNumber, note}
   */
  endorseCheck(checkId, endorsee) {
    const check = this._getCheck(checkId);

    if (check.status === CHECK_STATUS.CLEARED ||
        check.status === CHECK_STATUS.VOIDED ||
        check.status === CHECK_STATUS.CANCELLED ||
        check.status === CHECK_STATUS.EXPIRED) {
      throw err(
        'ERR_CHECK_NOT_ENDORSABLE',
        `Check ${checkId} cannot be endorsed in status ${check.status}`,
        `שיק במצב ${check.status} אינו ניתן להסבה`
      );
    }

    let rec;
    if (typeof endorsee === 'string') {
      rec = { name: endorsee.trim() };
    } else if (endorsee && typeof endorsee === 'object') {
      rec = { ...endorsee };
      rec.name = String(rec.name || '').trim();
    } else {
      throw err(
        'ERR_ENDORSEE_REQUIRED',
        'endorsee required',
        'חובה לציין נסב (endorsee)'
      );
    }
    if (!rec.name) {
      throw err(
        'ERR_ENDORSEE_NAME_REQUIRED',
        'endorsee name required',
        'שם נסב חובה'
      );
    }
    rec.at = this._now();
    rec.sequence = check.endorsements.length + 1;

    check.endorsements.push(rec);
    check.status = CHECK_STATUS.ENDORSED;
    check.updatedAt = this._now();

    this._audit(checkId, 'CHECK_ENDORSED', {
      en: 'Check endorsed',
      he: 'שיק הוסב',
      endorsee: rec,
      chainLength: check.endorsements.length
    });

    return clone(rec);
  }

  /* -------------------------------------------------------------------- */
  /* Deposit — הפקדה                                                       */
  /* -------------------------------------------------------------------- */

  /**
   * Deposit a check to an account.
   * @param {string} checkId
   * @param {string} accountId
   * @param {string} [date] — ISO date (default = today)
   */
  depositCheck(checkId, accountId, date) {
    const check = this._getCheck(checkId);
    if (!accountId) {
      throw err('ERR_ACCOUNT_REQUIRED', 'accountId required', 'חובה לציין חשבון');
    }

    if (check.status === CHECK_STATUS.DEPOSITED ||
        check.status === CHECK_STATUS.PENDING ||
        check.status === CHECK_STATUS.CLEARED) {
      throw err(
        'ERR_ALREADY_DEPOSITED',
        `Check ${checkId} already at status ${check.status}`,
        `שיק ${checkId} כבר במצב ${check.status}`
      );
    }
    if (check.status === CHECK_STATUS.VOIDED ||
        check.status === CHECK_STATUS.CANCELLED ||
        check.status === CHECK_STATUS.EXPIRED) {
      throw err(
        'ERR_CHECK_NOT_DEPOSITABLE',
        `Check ${checkId} in status ${check.status} cannot be deposited`,
        `שיק במצב ${check.status} אינו ניתן להפקדה`
      );
    }

    const depositDate = date ? String(date) : todayIso();

    // Post-dated check cannot be deposited before due date
    if (check.postdated && diffDays(depositDate, check.dueDate) > 0) {
      throw err(
        'ERR_POSTDATED_EARLY_DEPOSIT',
        `Post-dated check cannot be deposited before ${check.dueDate}`,
        `צ'ק דחוי לא ניתן להפקדה לפני תאריך הפירעון ${check.dueDate}`
      );
    }

    check.depositedTo = String(accountId);
    check.depositedAt = depositDate;
    check.status = CHECK_STATUS.DEPOSITED;
    check.updatedAt = this._now();

    // Mark as pending clearance (goes through banking rails)
    check.status = CHECK_STATUS.PENDING;

    this._audit(checkId, 'CHECK_DEPOSITED', {
      en: 'Check deposited, awaiting clearance',
      he: 'שיק הופקד, ממתין לפירעון',
      accountId,
      depositDate,
      clearingDays: this.clearingDays
    });

    return {
      checkId,
      accountId: check.depositedTo,
      depositDate,
      expectedClearance: this._addDays(depositDate, this.clearingDays)
    };
  }

  _addDays(date, days) {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  }

  /* -------------------------------------------------------------------- */
  /* Clearance status                                                     */
  /* -------------------------------------------------------------------- */

  /**
   * Inspect a check's current clearance status.
   * @param {string} checkId
   * @returns {object} { checkId, status, statusHe, at, meta }
   */
  clearanceStatus(checkId) {
    const check = this._getCheck(checkId);
    const HE = {
      [CHECK_STATUS.DRAFT]:     'טיוטה',
      [CHECK_STATUS.ISSUED]:    'הופק',
      [CHECK_STATUS.POSTED]:    'נרשם',
      [CHECK_STATUS.ENDORSED]:  'הוסב',
      [CHECK_STATUS.DEPOSITED]: 'הופקד',
      [CHECK_STATUS.PENDING]:   'בהמתנה לפירעון',
      [CHECK_STATUS.CLEARED]:   'נפרע',
      [CHECK_STATUS.BOUNCED]:   'חזר ללא כיסוי',
      [CHECK_STATUS.RETURNED]:  'הוחזר (טכני)',
      [CHECK_STATUS.VOIDED]:    'בוטל',
      [CHECK_STATUS.CANCELLED]: 'בוטל לפני הפקדה',
      [CHECK_STATUS.EXPIRED]:   'פג תוקף'
    };

    return {
      checkId,
      number: check.number,
      direction: check.direction,
      status: check.status,
      statusHe: HE[check.status] || check.status,
      amount: check.amount,
      currency: check.currency,
      dueDate: check.dueDate,
      depositedAt: check.depositedAt,
      clearedAt: check.clearedAt,
      bouncedAt: check.bouncedAt,
      bounceReason: check.bounceReason,
      voidedAt: check.voidedAt,
      endorsementCount: check.endorsements.length,
      postdated: check.postdated
    };
  }

  /**
   * Mark a check cleared (successful bank settlement).
   * @param {string} checkId
   * @param {string} [date]
   */
  markCleared(checkId, date) {
    const check = this._getCheck(checkId);
    if (check.status === CHECK_STATUS.CLEARED) return clone(check);
    // Outgoing checks clear when the payee's bank pulls funds — we see
    // that on OUR bank statement, so ISSUED/POSTED are valid precursor
    // states. Incoming checks clear only after we deposit them.
    const clearable = [
      CHECK_STATUS.ISSUED,
      CHECK_STATUS.POSTED,
      CHECK_STATUS.ENDORSED,
      CHECK_STATUS.DEPOSITED,
      CHECK_STATUS.PENDING
    ];
    if (!clearable.includes(check.status)) {
      throw err(
        'ERR_NOT_CLEARABLE',
        `Check ${checkId} in status ${check.status} cannot clear`,
        `שיק במצב ${check.status} אינו ניתן לפירעון`
      );
    }
    check.status = CHECK_STATUS.CLEARED;
    check.clearedAt = date ? String(date) : todayIso();
    check.updatedAt = this._now();

    this._audit(checkId, 'CHECK_CLEARED', {
      en: 'Check cleared',
      he: 'שיק נפרע',
      clearedAt: check.clearedAt
    });
    return clone(check);
  }

  /* -------------------------------------------------------------------- */
  /* Bounce handling — טיפול בשיקים חוזרים                                */
  /* -------------------------------------------------------------------- */

  /**
   * Record a bounced (returned) check per חוק שיקים ללא כיסוי.
   *
   * Accounting:
   *   - the original receivable is reversed
   *   - a bounce fee (optional) is posted to suspense
   *   - the drawer's 12-month bounce counter is bumped IF the reason
   *     is one that counts toward restriction (no_cover / closed /
   *     restricted_customer). Technical bounces (signature, date) do not.
   *
   * Restriction ladder:
   *   - 10 counting bounces / 12 months → לקוח מוגבל (12-month ban)
   *   - 15 counting bounces / 12 months → לקוח מוגבל חמור (24-month ban)
   *
   * @param {object} fields
   *   - checkId    : string (required)
   *   - bounceDate : ISO date (default = today)
   *   - reason     : BOUNCE_REASON code (default = NO_COVER)
   *   - fee        : number (optional)
   *   - actor      : string (optional — teller / auditor ID)
   * @returns {object} bounce record with updated restriction status
   */
  bouncedCheckRecord(fields) {
    if (!fields || !fields.checkId) {
      throw err('ERR_CHECK_ID_REQUIRED', 'checkId required', 'מזהה שיק חובה');
    }
    const check = this._getCheck(fields.checkId);

    if (check.status === CHECK_STATUS.CLEARED) {
      throw err(
        'ERR_ALREADY_CLEARED',
        `Check ${fields.checkId} already cleared`,
        `שיק ${fields.checkId} כבר נפרע`
      );
    }
    if (check.status === CHECK_STATUS.VOIDED ||
        check.status === CHECK_STATUS.CANCELLED) {
      throw err(
        'ERR_VOIDED_CANNOT_BOUNCE',
        `Check ${fields.checkId} is ${check.status}`,
        `שיק ${fields.checkId} במצב ${check.status}`
      );
    }

    const bounceDate = fields.bounceDate
      ? String(fields.bounceDate)
      : todayIso();
    const reason = fields.reason || BOUNCE_REASON.NO_COVER;
    if (!Object.values(BOUNCE_REASON).includes(reason)) {
      throw err(
        'ERR_BOUNCE_REASON_INVALID',
        `Unknown bounce reason ${reason}`,
        `סיבת חזרה לא תקינה ${reason}`
      );
    }
    const fee = round2(fields.fee || 0);

    const counts = COUNTING_BOUNCE_REASONS.includes(reason);

    check.status = counts ? CHECK_STATUS.BOUNCED : CHECK_STATUS.RETURNED;
    check.bouncedAt = bounceDate;
    check.bounceReason = reason;
    check.bounceFee = fee;
    check.updatedAt = this._now();

    // Update drawer history for incoming checks only — we only track the
    // issuers (drawers) of received checks against BoI rules.
    let restriction = null;
    if (check.direction === CHECK_DIRECTION.INCOMING && counts) {
      restriction = this._recordDrawerBounce(check, bounceDate, reason);
    }

    const record = {
      checkId: check.id,
      bounceDate,
      reason,
      fee,
      counts,
      restriction,
      statusAfter: check.status
    };

    this._audit(check.id, 'CHECK_BOUNCED', {
      en: 'Check bounced',
      he: 'שיק חזר',
      actor: fields.actor || null,
      ...record
    });

    return record;
  }

  /**
   * Bump drawer's bounce counter and transition to restricted if thresholds
   * are crossed inside the 12-month window.
   * @private
   */
  _recordDrawerBounce(check, bounceDate, reason) {
    const key = check.drawerAccount;
    if (!key) return null;

    const list = this.store.bounceHistory.get(key) || [];
    list.push({
      checkId: check.id,
      date: bounceDate,
      reason,
      amount: check.amount,
      number: check.number
    });
    this.store.bounceHistory.set(key, list);

    // Count within rolling 12-month window
    const window = list.filter(b =>
      monthsBetween(b.date, bounceDate) < RESTRICTED_CUSTOMER.WINDOW_MONTHS
    );
    const countingInWindow = window.filter(b =>
      COUNTING_BOUNCE_REASONS.includes(b.reason)
    ).length;

    let status = null;
    let level = null;
    if (countingInWindow >= RESTRICTED_CUSTOMER.BOUNCE_THRESHOLD_SEVERE) {
      level = 'severe';
      status = {
        drawerAccount: key,
        restricted: true,
        level,
        since: bounceDate,
        until: this._addMonths(
          bounceDate,
          RESTRICTED_CUSTOMER.RESTRICTION_MONTHS_SEVERE
        ),
        bounceCount: countingInWindow,
        reasonHe: 'לקוח מוגבל חמור — ' + countingInWindow + ' שיקים חזרו ב-12 חודשים',
        reasonEn: `Severely restricted customer — ${countingInWindow} returned in 12mo`
      };
      this.store.restrictedDrawers.set(key, status);
    } else if (countingInWindow >= RESTRICTED_CUSTOMER.BOUNCE_THRESHOLD_REGULAR) {
      level = 'regular';
      status = {
        drawerAccount: key,
        restricted: true,
        level,
        since: bounceDate,
        until: this._addMonths(
          bounceDate,
          RESTRICTED_CUSTOMER.RESTRICTION_MONTHS_REGULAR
        ),
        bounceCount: countingInWindow,
        reasonHe: 'לקוח מוגבל — ' + countingInWindow + ' שיקים חזרו ב-12 חודשים',
        reasonEn: `Restricted customer — ${countingInWindow} returned in 12mo`
      };
      this.store.restrictedDrawers.set(key, status);
    } else {
      status = {
        drawerAccount: key,
        restricted: false,
        level: null,
        bounceCount: countingInWindow,
        remainingToRestriction:
          RESTRICTED_CUSTOMER.BOUNCE_THRESHOLD_REGULAR - countingInWindow
      };
    }

    return status;
  }

  _addMonths(dateIso, months) {
    const d = new Date(dateIso);
    d.setMonth(d.getMonth() + months);
    return d.toISOString().slice(0, 10);
  }

  /* -------------------------------------------------------------------- */
  /* Restricted-customer lookup — בדיקת לקוח מוגבל                        */
  /* -------------------------------------------------------------------- */

  /**
   * Check if a drawer account is flagged as "לקוח מוגבל".
   *
   * Order of lookup:
   *   1. Internal bounce history (our own experience).
   *   2. External restrictedRegistry (stub for real BoI — the Supervisor
   *      of Banks publishes a list at boi.org.il under הוראה 420).
   *
   * @param {string} drawerAccount
   * @returns {object|null}
   */
  restrictedCustomerCheck(drawerAccount) {
    if (!drawerAccount) return null;
    const key = String(drawerAccount);

    // Internal first
    const internal = this.store.restrictedDrawers.get(key);
    if (internal && internal.restricted) {
      return {
        source: 'internal',
        ...internal
      };
    }

    // External BoI stub
    if (this.restrictedRegistry &&
        typeof this.restrictedRegistry.isRestricted === 'function') {
      const ext = this.restrictedRegistry.isRestricted(key);
      if (ext) {
        if (ext === true) {
          return {
            source: 'boi',
            drawerAccount: key,
            restricted: true,
            level: 'regular'
          };
        }
        return { source: 'boi', ...ext };
      }
    }

    return internal || {
      source: 'internal',
      drawerAccount: key,
      restricted: false,
      bounceCount: 0
    };
  }

  /* -------------------------------------------------------------------- */
  /* Void — ביטול שיק (דו-חתימתי)                                          */
  /* -------------------------------------------------------------------- */

  /**
   * Void a check. Dual-signature is required by default (requires2Sig=true);
   * two distinct approvers must be supplied via the `approvers` array or
   * two sequential voidCheck calls referencing the same checkId.
   *
   * @param {string} checkId
   * @param {string} reason
   * @param {boolean|object} requires2Sig — true (default) OR opts object
   *          with { approvers: ['idA','idB'], requires2Sig: true }
   * @returns {object} { checkId, status, pendingApprovers, voidedAt }
   */
  voidCheck(checkId, reason, requires2Sig) {
    const check = this._getCheck(checkId);

    const reasonStr = String(reason || '').trim();
    if (!reasonStr) {
      throw err('ERR_REASON_REQUIRED', 'void reason required', 'סיבת ביטול חובה');
    }
    if (check.status === CHECK_STATUS.CLEARED ||
        check.status === CHECK_STATUS.VOIDED ||
        check.status === CHECK_STATUS.CANCELLED) {
      throw err(
        'ERR_NOT_VOIDABLE',
        `Check ${checkId} cannot be voided in status ${check.status}`,
        `שיק ${checkId} אינו ניתן לביטול במצב ${check.status}`
      );
    }

    // Normalise options — callers may pass a boolean or an object
    let opts = {};
    if (typeof requires2Sig === 'object' && requires2Sig !== null) {
      opts = requires2Sig;
    } else {
      opts.requires2Sig = requires2Sig !== false; // default true
    }

    const needTwo = opts.requires2Sig !== false;
    const approverFromArg = Array.isArray(opts.approvers)
      ? opts.approvers.map(String).filter(Boolean)
      : (opts.approver ? [String(opts.approver)] : []);

    // Track pending approvals on the check itself — soft state
    check.voidReason = reasonStr;
    const already = check.voidApprovers || [];
    for (const a of approverFromArg) {
      if (!already.includes(a)) already.push(a);
    }
    check.voidApprovers = already;
    check.updatedAt = this._now();

    const requiredCount = needTwo ? 2 : 1;
    if (check.voidApprovers.length < requiredCount) {
      this._audit(checkId, 'CHECK_VOID_PENDING', {
        en: 'Void pending additional approval',
        he: 'ביטול ממתין לאישור נוסף',
        approvers: check.voidApprovers.slice(),
        required: requiredCount
      });
      return {
        checkId,
        status: check.status,
        pendingApprovers: requiredCount - check.voidApprovers.length,
        approvers: check.voidApprovers.slice(),
        voided: false
      };
    }

    // Distinct approvers required for dual-sig
    if (needTwo) {
      const unique = new Set(check.voidApprovers);
      if (unique.size < 2) {
        throw err(
          'ERR_DUAL_SIG_DISTINCT',
          'dual signature requires two distinct approvers',
          'ביטול דו-חתימתי דורש שני מאשרים שונים'
        );
      }
    }

    // Commit the void — status depends on whether it was deposited
    const before = check.status;
    check.status = before === CHECK_STATUS.ISSUED ||
                   before === CHECK_STATUS.POSTED ||
                   before === CHECK_STATUS.DRAFT
                     ? CHECK_STATUS.VOIDED
                     : CHECK_STATUS.VOIDED;
    check.voidedAt = this._now();

    this._audit(checkId, 'CHECK_VOIDED', {
      en: 'Check voided',
      he: 'שיק בוטל',
      approvers: check.voidApprovers.slice(),
      reason: reasonStr,
      requires2Sig: needTwo
    });

    return {
      checkId,
      status: check.status,
      voidedAt: check.voidedAt,
      approvers: check.voidApprovers.slice(),
      voided: true
    };
  }

  /* -------------------------------------------------------------------- */
  /* Post-dated check list — פוסט-דייטד                                   */
  /* -------------------------------------------------------------------- */

  /**
   * List all post-dated checks not yet cleared/voided, with aging buckets.
   * Essential for landlords, B2B receivables, and cash-flow forecasting.
   *
   * @param {object} [opts]
   *   - asOfDate   : ISO date (default = today)
   *   - direction  : 'incoming' | 'outgoing' | undefined (both)
   *   - accountId  : filter by our account
   * @returns {{checks: object[], buckets: object, total: number}}
   */
  postDatedCheckList(opts) {
    opts = opts || {};
    const asOf = opts.asOfDate ? String(opts.asOfDate) : todayIso();

    const active = new Set([
      CHECK_STATUS.DRAFT,
      CHECK_STATUS.ISSUED,
      CHECK_STATUS.POSTED,
      CHECK_STATUS.ENDORSED,
      CHECK_STATUS.DEPOSITED,
      CHECK_STATUS.PENDING
    ]);

    const rows = [];
    for (const c of this.store.checks.values()) {
      if (!c.postdated) continue;
      if (!active.has(c.status)) continue;
      if (opts.direction && c.direction !== opts.direction) continue;
      if (opts.accountId && c.accountId !== opts.accountId) continue;

      const daysToDue = diffDays(asOf, c.dueDate);
      rows.push({
        checkId: c.id,
        direction: c.direction,
        number: c.number,
        accountId: c.accountId,
        drawerAccount: c.drawerAccount || null,
        counterparty: c.direction === CHECK_DIRECTION.INCOMING ? c.payer : c.payee,
        amount: c.amount,
        currency: c.currency,
        issueDate: c.issueDate,
        dueDate: c.dueDate,
        daysToDue,
        bucket: this._ageBucket(daysToDue),
        status: c.status
      });
    }

    // Sort by dueDate ascending
    rows.sort((a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0));

    const buckets = {
      overdue:      { count: 0, total: 0 },
      due_0_7:      { count: 0, total: 0 },
      due_8_30:     { count: 0, total: 0 },
      due_31_60:    { count: 0, total: 0 },
      due_61_90:    { count: 0, total: 0 },
      due_90_plus:  { count: 0, total: 0 }
    };
    let total = 0;
    for (const r of rows) {
      buckets[r.bucket].count += 1;
      buckets[r.bucket].total = round2(buckets[r.bucket].total + r.amount);
      total = round2(total + r.amount);
    }

    return { asOf, checks: rows, buckets, total };
  }

  _ageBucket(daysToDue) {
    if (daysToDue < 0)   return 'overdue';
    if (daysToDue <= 7)  return 'due_0_7';
    if (daysToDue <= 30) return 'due_8_30';
    if (daysToDue <= 60) return 'due_31_60';
    if (daysToDue <= 90) return 'due_61_90';
    return 'due_90_plus';
  }

  /* -------------------------------------------------------------------- */
  /* Bank reconciliation — התאמת בנק                                       */
  /* -------------------------------------------------------------------- */

  /**
   * Reconcile our outgoing checks against a bank statement.
   *
   * @param {string} accountId — our account
   * @param {Array<object>} statement — lines like
   *        [{ checkNumber, amount, date, type:'check', status:'cleared'|'returned' }, ...]
   *        Also accepts: { number, amount, date, status }
   * @returns {object} { matched, unmatched, bankOnly, ourUnmatched }
   */
  reconcileWithBank(accountId, statement) {
    if (!accountId) {
      throw err('ERR_ACCOUNT_REQUIRED', 'accountId required', 'חובה לציין חשבון');
    }
    if (!Array.isArray(statement)) {
      throw err(
        'ERR_STATEMENT_REQUIRED',
        'statement must be array',
        'דף חשבון חייב להיות מערך'
      );
    }

    const result = {
      accountId,
      asOf: todayIso(),
      matched: [],       // {checkId, number, amount, date}
      unmatched: [],     // statement lines with no corresponding check
      ourUnmatched: [],  // our checks that never cleared on bank side
      bankOnly: [],      // alias of unmatched (legacy name)
      summary: {
        matchedCount: 0,
        matchedTotal: 0,
        unmatchedBankCount: 0,
        unmatchedOurCount: 0
      }
    };

    // Build an index of our still-outstanding checks
    const ourByNumber = new Map();
    for (const c of this.store.checks.values()) {
      if (c.direction !== CHECK_DIRECTION.OUTGOING) continue;
      if (c.accountId !== accountId) continue;
      if (c.status === CHECK_STATUS.VOIDED ||
          c.status === CHECK_STATUS.CANCELLED) continue;
      ourByNumber.set(String(c.number), c);
    }

    for (const line of statement) {
      const lineNum = line.checkNumber != null ? line.checkNumber : line.number;
      const num = String(lineNum);
      const check = ourByNumber.get(num);

      if (!check) {
        result.unmatched.push({ ...line });
        continue;
      }
      // Amount sanity check — 1 agora tolerance
      if (Math.abs(round2(check.amount) - round2(line.amount)) > 0.01) {
        result.unmatched.push({ ...line, reason: 'amount_mismatch' });
        continue;
      }

      const lineStatus = String(line.status || 'cleared').toLowerCase();
      if (lineStatus === 'cleared' || lineStatus === 'paid') {
        if (check.status !== CHECK_STATUS.CLEARED) {
          this.markCleared(check.id, line.date || todayIso());
        }
        check.reconciled = true;
        check.reconciledAt = this._now();
        result.matched.push({
          checkId: check.id,
          number: check.number,
          amount: check.amount,
          date: line.date || null
        });
        result.summary.matchedTotal = round2(
          result.summary.matchedTotal + check.amount
        );
      } else if (lineStatus === 'returned' || lineStatus === 'bounced') {
        this.bouncedCheckRecord({
          checkId: check.id,
          bounceDate: line.date,
          reason: line.reason || BOUNCE_REASON.NO_COVER,
          fee: line.fee || 0,
          actor: 'bank-reconciliation'
        });
        check.reconciled = true;
        check.reconciledAt = this._now();
        result.matched.push({
          checkId: check.id,
          number: check.number,
          amount: check.amount,
          date: line.date || null,
          bounced: true
        });
      } else {
        result.unmatched.push({ ...line, reason: 'unknown_status' });
      }
      ourByNumber.delete(num);
    }

    // Whatever remains in ourByNumber never appeared on the bank
    for (const c of ourByNumber.values()) {
      if (c.status === CHECK_STATUS.CLEARED) continue;
      result.ourUnmatched.push({
        checkId: c.id,
        number: c.number,
        amount: c.amount,
        status: c.status,
        issueDate: c.issueDate,
        dueDate: c.dueDate
      });
    }

    result.bankOnly = result.unmatched;
    result.summary.matchedCount = result.matched.length;
    result.summary.unmatchedBankCount = result.unmatched.length;
    result.summary.unmatchedOurCount = result.ourUnmatched.length;

    this._audit(null, 'BANK_RECONCILIATION', {
      en: 'Bank reconciliation run',
      he: 'הרצת התאמת בנק',
      accountId,
      summary: result.summary
    });

    return result;
  }

  /* -------------------------------------------------------------------- */
  /* Query / inspection utilities                                         */
  /* -------------------------------------------------------------------- */

  getCheck(checkId) {
    return clone(this._getCheck(checkId));
  }

  listChecks(filter) {
    const f = filter || {};
    const rows = [];
    for (const c of this.store.checks.values()) {
      if (f.direction && c.direction !== f.direction) continue;
      if (f.accountId && c.accountId !== f.accountId) continue;
      if (f.status && c.status !== f.status) continue;
      if (f.drawerAccount && c.drawerAccount !== f.drawerAccount) continue;
      if (f.payee && c.payee !== f.payee) continue;
      if (f.payer && c.payer !== f.payer) continue;
      rows.push(clone(c));
    }
    return rows;
  }

  getAuditLog(checkId) {
    return this.store.audits.filter(a => !checkId || a.checkId === checkId)
      .map(clone);
  }

  getBounceHistory(drawerAccount) {
    return (this.store.bounceHistory.get(String(drawerAccount)) || [])
      .map(clone);
  }
}

/* ----------------------------------------------------------------------------
 * Module exports — zero deps
 * -------------------------------------------------------------------------- */

module.exports = {
  CheckRegister,
  CHECK_STATUS,
  CHECK_DIRECTION,
  BOUNCE_REASON,
  COUNTING_BOUNCE_REASONS,
  RESTRICTED_CUSTOMER,
  CHECK_EXPIRY_DAYS,
  CLEARING_DAYS_DEFAULT,
  // Expose helpers for tests/advanced consumers
  createMemoryStore
};
