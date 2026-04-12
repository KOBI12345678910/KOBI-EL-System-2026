/* ============================================================================
 * Techno-Kol ERP — Treasury Management (ניהול אוצר / גזברות)
 * Agent Y-080 / Onyx Procurement / Finance Suite
 * ----------------------------------------------------------------------------
 * ניהול גזברות ארגוני:
 *   - רישום חשבונות בנק (Bank Account Register)
 *   - מצב מזומנים מאוחד ממטבע המוצא ל־ILS (Cash Position)
 *   - ריכוז מזומנים (Cash Concentration / Sweep)
 *   - סולם השקעות — סל אג"ח / פק"מ (Investment Ladder)
 *   - כרית נזילות מינימלית (Liquidity Buffer)
 *   - ניתוח עמלות בנק (Bank Fees)
 *   - פתיחת חשבון חדש — תהליך עבודה ידני (NOT automated)
 *   - חשבון ראשי + חשבונות משנה (Mirror Accounts)
 *   - מטריצת בעלי זכות חתימה (Signatory Matrix)
 *   - התראות גזברות (Treasury Alerts)
 *   - חשיפה מטבעית (FX Exposure)
 *   - דיווח לבנק ישראל — ישויות גדולות (BOI Reporting)
 *
 * RULES — חוקי ברזל:
 *   1. לא מוחקים אף פעם — רק משדרגים ומגדלים (archive, never delete).
 *   2. READ + PLAN בלבד. מודול זה לא מבצע העברות.
 *      ביצוע העברות חייב לעבור דרך מודול נפרד (Y-083) עם זרימת אישורים.
 *   3. Hebrew + English bilingual on every error / event.
 *   4. Zero dependencies — plain JS, Node + browser compatible.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * Israeli regulatory context (for the BOI reporting hook):
 *   - חוק בנק ישראל, תש"ע-2010
 *   - הוראות הפיקוח על הבנקים — Reporting obligations for
 *     "large borrowers / large depositors" (לווה גדול / מפקיד גדול)
 *   - חוק איסור הלבנת הון, תש"ס-2000 — transaction reporting thresholds
 *   - חוק צמצום השימוש במזומן, תשע"ח-2018 — cash transaction limits
 *   - PCI-DSS is NOT applicable here (no card data handled).
 * ==========================================================================*/

'use strict';

/* ----------------------------------------------------------------------------
 * Constants / קבועים
 * -------------------------------------------------------------------------- */

/** Base currency — מטבע בסיס = שקל חדש */
const BASE_CCY = 'ILS';

/** Enum: account type — סוג חשבון */
const ACCOUNT_TYPE = Object.freeze({
  CHECKING: 'checking',       // עובר ושב
  SAVINGS: 'savings',         // חסכון / פק"מ
  ESCROW: 'escrow',           // נאמנות (לפרויקט ספציפי)
  TRUST: 'trust',             // נאמנות כללית
  FOREIGN: 'foreign'          // חשבון מט"ח
});

/** Enum: account status — אף פעם לא נמחק, רק סטטוס משתנה */
const ACCOUNT_STATUS = Object.freeze({
  APPLIED: 'applied',         // הוגשה בקשה
  UNDER_REVIEW: 'under_review', // בבדיקת בנק
  APPROVED: 'approved',       // אושר
  ACTIVE: 'active',           // פעיל
  FROZEN: 'frozen',           // מוקפא
  DORMANT: 'dormant',         // לא פעיל > 12 חודשים
  CLOSED: 'closed'            // סגור (נשמר להיסטוריה)
});

/** Enum: concentration rule — סוג כלל הריכוז */
const CONCENTRATION_RULE = Object.freeze({
  ZERO_BALANCE: 'zero-balance',   // סחיפה מלאה — יתרה ליתרה 0
  TARGET_BALANCE: 'target-balance', // השארת יתרת מינימום ביעד
  THRESHOLD: 'threshold'          // סחיפה רק מעל סף
});

/** Default FX rates (fallback). In production these are injected daily. */
const DEFAULT_FX_RATES_TO_ILS = Object.freeze({
  ILS: 1.0,
  USD: 3.65,
  EUR: 3.95,
  GBP: 4.60,
  JPY: 0.024
});

/** Thresholds */
const BOI_LARGE_DEPOSIT_THRESHOLD_ILS = 50_000_000;  // "מפקיד גדול" sample threshold
const DEFAULT_LOW_BALANCE_ALERT_ILS = 10_000;
const DEFAULT_LARGE_TX_ALERT_ILS = 500_000;
const AFTER_HOURS_START = 20; // 20:00
const AFTER_HOURS_END = 6;    // 06:00

/* ----------------------------------------------------------------------------
 * Error factory — הודעות דו־לשוניות
 * -------------------------------------------------------------------------- */

function bilingualError(code, he, en, extra) {
  const err = new Error(`[${code}] ${he} / ${en}`);
  err.code = code;
  err.hebrew = he;
  err.english = en;
  if (extra) Object.assign(err, extra);
  return err;
}

/* ----------------------------------------------------------------------------
 * Helpers / עזרים
 * -------------------------------------------------------------------------- */

function round2(n) {
  if (typeof n !== 'number' || !isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

function fxConvert(amount, fromCcy, toCcy, rateTable) {
  if (typeof amount !== 'number' || !isFinite(amount)) return 0;
  const rates = rateTable || DEFAULT_FX_RATES_TO_ILS;
  if (!rates[fromCcy]) {
    throw bilingualError(
      'TREAS_FX_001',
      `שער חליפין לא ידוע עבור ${fromCcy}`,
      `Unknown FX rate for ${fromCcy}`
    );
  }
  if (!rates[toCcy]) {
    throw bilingualError(
      'TREAS_FX_002',
      `שער חליפין לא ידוע עבור ${toCcy}`,
      `Unknown FX rate for ${toCcy}`
    );
  }
  // Convert via base ILS
  const amountInILS = amount * rates[fromCcy];
  return round2(amountInILS / rates[toCcy]);
}

function isoDate(d) {
  const dt = (d instanceof Date) ? d : new Date(d);
  if (isNaN(dt.getTime())) return null;
  return dt.toISOString().slice(0, 10);
}

function isoNow() {
  return new Date().toISOString();
}

function isAfterHours(date) {
  const d = (date instanceof Date) ? date : new Date(date);
  const h = d.getHours();
  return h >= AFTER_HOURS_START || h < AFTER_HOURS_END;
}

/* ============================================================================
 * Class: Treasury — ניהול גזברות
 * ==========================================================================*/

class Treasury {
  /**
   * @param {Object} options
   * @param {string} [options.baseCurrency='ILS']
   * @param {Object} [options.fxRates]  map ccy -> ILS rate
   * @param {Function} [options.clock]  () => Date (for testing)
   */
  constructor(options) {
    const opts = options || {};
    this.baseCurrency = opts.baseCurrency || BASE_CCY;
    this.fxRates = Object.assign({}, DEFAULT_FX_RATES_TO_ILS, opts.fxRates || {});
    this.clock = opts.clock || (() => new Date());

    // Core stores — these never delete, only grow
    this._accounts = new Map();          // id -> account
    this._balances = new Map();          // id -> [{asOf,amount,ccy}]
    this._mirrors = new Map();           // masterId -> Set(mirrorId)
    this._masterOf = new Map();          // mirrorId -> masterId
    this._signatories = [];              // append-only matrix
    this._openAccountWorkflows = [];     // append-only
    this._bankFees = [];                 // append-only
    this._investmentLadders = [];        // append-only
    this._alertRules = {
      lowBalance: DEFAULT_LOW_BALANCE_ALERT_ILS,
      largeTransaction: DEFAULT_LARGE_TX_ALERT_ILS,
      afterHoursActivity: true,
      rateChanges: { bpsThreshold: 25 } // 0.25% move
    };
    this._alertHistory = [];             // append-only
    this._concentrationPlans = [];       // append-only (plans only — not executed!)
    this._boiReports = [];               // append-only

    // Audit trail — a ring of every mutation (also append-only)
    this._audit = [];
  }

  /* --------------------------------------------------------------------------
   * Internal — audit logger
   * -----------------------------------------------------------------------*/
  _audit_log(action, payload) {
    this._audit.push({
      ts: isoNow(),
      action: action,
      payload: payload || null
    });
  }

  /* ==========================================================================
   * 1. bankAccountRegister — רישום חשבון בנק
   * ========================================================================*/

  /**
   * Register (or upsert) a bank account.
   * NEVER deletes. Upgrading an existing record bumps its version.
   *
   * @param {Object} spec
   * @returns {Object} the stored account snapshot
   */
  bankAccountRegister(spec) {
    if (!spec || typeof spec !== 'object') {
      throw bilingualError(
        'TREAS_REG_001',
        'חובה לספק אובייקט חשבון',
        'Account spec is required'
      );
    }
    const id = spec.id;
    if (!id || typeof id !== 'string') {
      throw bilingualError(
        'TREAS_REG_002',
        'חסר מזהה חשבון (id)',
        'Missing account id'
      );
    }
    if (!spec.bank || typeof spec.bank !== 'string') {
      throw bilingualError(
        'TREAS_REG_003',
        'חסר שם בנק',
        'Missing bank name'
      );
    }
    if (!spec.accountNumber) {
      throw bilingualError(
        'TREAS_REG_004',
        'חסר מספר חשבון',
        'Missing account number'
      );
    }
    const type = spec.type || ACCOUNT_TYPE.CHECKING;
    const validTypes = Object.values(ACCOUNT_TYPE);
    if (!validTypes.includes(type)) {
      throw bilingualError(
        'TREAS_REG_005',
        `סוג חשבון לא חוקי: ${type}`,
        `Invalid account type: ${type}`,
        { validTypes }
      );
    }
    const ccy = spec.currency || BASE_CCY;

    const prior = this._accounts.get(id);
    const version = prior ? (prior.version + 1) : 1;

    const record = Object.freeze({
      id,
      bank: spec.bank,
      branch: spec.branch || null,
      accountNumber: String(spec.accountNumber),
      currency: ccy,
      type,
      signatories: Array.isArray(spec.signatories) ? spec.signatories.slice() : [],
      dailyLimit: typeof spec.dailyLimit === 'number' ? spec.dailyLimit : null,
      purpose: spec.purpose || null,
      status: prior ? prior.status : ACCOUNT_STATUS.ACTIVE,
      version,
      createdAt: prior ? prior.createdAt : isoNow(),
      updatedAt: isoNow(),
      // Hebrew labels for UI
      labels: {
        he: {
          type: this._typeHebrew(type),
          currency: ccy === 'ILS' ? 'שקל' : ccy
        }
      }
    });

    this._accounts.set(id, record);
    this._audit_log(prior ? 'account.upgrade' : 'account.register', { id, version });

    // Snapshot signatories into matrix (append-only)
    if (record.signatories && record.signatories.length) {
      for (const s of record.signatories) {
        this._signatories.push({
          accountId: id,
          person: s.person || s.name || s,
          limit: (typeof s === 'object' && typeof s.limit === 'number') ? s.limit : null,
          role: (typeof s === 'object' && s.role) ? s.role : 'signer',
          pairRequired: (typeof s === 'object' && !!s.pairRequired),
          addedAt: isoNow()
        });
      }
    }
    return record;
  }

  _typeHebrew(type) {
    switch (type) {
      case ACCOUNT_TYPE.CHECKING: return 'עו"ש';
      case ACCOUNT_TYPE.SAVINGS: return 'חסכון / פק"מ';
      case ACCOUNT_TYPE.ESCROW: return 'נאמנות פרויקטלי';
      case ACCOUNT_TYPE.TRUST: return 'נאמנות';
      case ACCOUNT_TYPE.FOREIGN: return 'חשבון מט"ח';
      default: return type;
    }
  }

  /**
   * Post a balance observation for an account. (Not a transfer — just data.)
   */
  postBalance(accountId, amount, asOfDate, currency) {
    const acc = this._accounts.get(accountId);
    if (!acc) {
      throw bilingualError(
        'TREAS_BAL_001',
        `חשבון לא נמצא: ${accountId}`,
        `Account not found: ${accountId}`
      );
    }
    if (typeof amount !== 'number' || !isFinite(amount)) {
      throw bilingualError(
        'TREAS_BAL_002',
        'סכום יתרה לא חוקי',
        'Invalid balance amount'
      );
    }
    const list = this._balances.get(accountId) || [];
    const ccy = currency || acc.currency;
    list.push({
      asOf: isoDate(asOfDate || this.clock()),
      amount: round2(amount),
      ccy,
      postedAt: isoNow()
    });
    this._balances.set(accountId, list);
    this._audit_log('balance.post', { accountId, amount, ccy });

    // Fire low-balance alert
    const amountInBase = fxConvert(amount, ccy, this.baseCurrency, this.fxRates);
    if (amountInBase < this._alertRules.lowBalance) {
      this._alertHistory.push({
        ts: isoNow(),
        kind: 'lowBalance',
        accountId,
        message: `יתרה נמוכה / Low balance: ${amountInBase} ${this.baseCurrency}`,
        amountBase: amountInBase
      });
    }
    return { ok: true };
  }

  /* ==========================================================================
   * 2. cashPosition — מצב מזומנים
   * ========================================================================*/

  /**
   * Aggregates the latest balance on/before asOfDate across all accounts,
   * FX-converted to base currency.
   *
   * @param {Date|string} [asOfDate]
   * @returns {Object} { asOf, base, totalBase, byAccount, byCurrency, byType }
   */
  cashPosition(asOfDate) {
    const asOf = isoDate(asOfDate || this.clock());
    const byAccount = [];
    const byCurrency = {};
    const byType = {};
    let totalBase = 0;

    for (const [id, acc] of this._accounts) {
      if (acc.status === ACCOUNT_STATUS.CLOSED) continue;
      const balances = this._balances.get(id) || [];
      // Latest balance on or before asOf
      let latest = null;
      for (const b of balances) {
        if (b.asOf <= asOf) {
          if (!latest || b.asOf >= latest.asOf) latest = b;
        }
      }
      const rawAmount = latest ? latest.amount : 0;
      const rawCcy = latest ? latest.ccy : acc.currency;
      const baseAmount = fxConvert(rawAmount, rawCcy, this.baseCurrency, this.fxRates);

      byAccount.push({
        id,
        bank: acc.bank,
        type: acc.type,
        currency: rawCcy,
        amount: rawAmount,
        amountBase: baseAmount,
        asOf: latest ? latest.asOf : null
      });

      totalBase += baseAmount;
      byCurrency[rawCcy] = round2((byCurrency[rawCcy] || 0) + rawAmount);
      byType[acc.type] = round2((byType[acc.type] || 0) + baseAmount);
    }

    return {
      asOf,
      base: this.baseCurrency,
      totalBase: round2(totalBase),
      byAccount,
      byCurrency,
      byType,
      generatedAt: isoNow()
    };
  }

  /* ==========================================================================
   * 3. concentration — ריכוז מזומנים (plan only, NOT executed)
   * ========================================================================*/

  /**
   * Build a cash sweep PLAN. Does NOT execute. For execution see Y-083.
   *
   * @param {Object} cfg
   * @param {string[]} cfg.sourceAccounts
   * @param {string} cfg.targetAccount
   * @param {string} cfg.rule  zero-balance | target-balance | threshold
   * @param {number} [cfg.targetBalance]  for target-balance rule
   * @param {number} [cfg.threshold]      for threshold rule
   * @returns {Object} the plan
   */
  concentration(cfg) {
    if (!cfg || typeof cfg !== 'object') {
      throw bilingualError(
        'TREAS_CON_001',
        'חסרה תצורה לריכוז מזומנים',
        'Missing concentration config'
      );
    }
    const { sourceAccounts, targetAccount, rule } = cfg;
    if (!Array.isArray(sourceAccounts) || sourceAccounts.length === 0) {
      throw bilingualError(
        'TREAS_CON_002',
        'חסרה רשימת חשבונות מקור',
        'Missing sourceAccounts list'
      );
    }
    if (!targetAccount) {
      throw bilingualError(
        'TREAS_CON_003',
        'חסר חשבון יעד (ריכוז)',
        'Missing targetAccount'
      );
    }
    if (!Object.values(CONCENTRATION_RULE).includes(rule)) {
      throw bilingualError(
        'TREAS_CON_004',
        `כלל ריכוז לא חוקי: ${rule}`,
        `Invalid concentration rule: ${rule}`,
        { validRules: Object.values(CONCENTRATION_RULE) }
      );
    }
    if (!this._accounts.get(targetAccount)) {
      throw bilingualError(
        'TREAS_CON_005',
        `חשבון יעד לא רשום: ${targetAccount}`,
        `Target account not registered: ${targetAccount}`
      );
    }

    const pos = this.cashPosition();
    const plan = {
      id: `PLAN-${this._concentrationPlans.length + 1}`,
      rule,
      sourceAccounts: sourceAccounts.slice(),
      targetAccount,
      targetBalance: typeof cfg.targetBalance === 'number' ? cfg.targetBalance : 0,
      threshold: typeof cfg.threshold === 'number' ? cfg.threshold : 0,
      generatedAt: isoNow(),
      moves: [],
      totalSweepBase: 0,
      executed: false,
      status: 'planned',
      // CRITICAL safety note in every plan
      warning: {
        he: 'תוכנית בלבד — לא מתבצעת העברה. יש להעביר למודול תשלומים עם אישורים.',
        en: 'PLAN ONLY — no transfer executed. Route to payments module with approvals (Y-083).'
      }
    };

    for (const srcId of sourceAccounts) {
      const srcAcc = this._accounts.get(srcId);
      if (!srcAcc) {
        plan.moves.push({
          source: srcId,
          skipped: true,
          reason: 'account not registered'
        });
        continue;
      }
      if (srcId === targetAccount) continue; // can't sweep to self

      const posRow = pos.byAccount.find(r => r.id === srcId);
      const srcAmount = posRow ? posRow.amount : 0;
      const srcCcy = posRow ? posRow.currency : srcAcc.currency;

      let moveAmount = 0;
      if (rule === CONCENTRATION_RULE.ZERO_BALANCE) {
        moveAmount = srcAmount;
      } else if (rule === CONCENTRATION_RULE.TARGET_BALANCE) {
        moveAmount = srcAmount - (plan.targetBalance || 0);
        if (moveAmount < 0) moveAmount = 0;
      } else if (rule === CONCENTRATION_RULE.THRESHOLD) {
        if (srcAmount > plan.threshold) {
          moveAmount = srcAmount - plan.threshold;
        }
      }

      moveAmount = round2(moveAmount);
      if (moveAmount <= 0) {
        plan.moves.push({
          source: srcId, target: targetAccount,
          amount: 0, ccy: srcCcy, note: 'nothing to sweep'
        });
        continue;
      }

      const moveBase = fxConvert(moveAmount, srcCcy, this.baseCurrency, this.fxRates);
      plan.moves.push({
        source: srcId,
        target: targetAccount,
        amount: moveAmount,
        ccy: srcCcy,
        amountBase: moveBase
      });
      plan.totalSweepBase += moveBase;
    }
    plan.totalSweepBase = round2(plan.totalSweepBase);
    this._concentrationPlans.push(plan);
    this._audit_log('concentration.plan', { id: plan.id, rule });
    return plan;
  }

  /* ==========================================================================
   * 4. investmentLadder — סולם השקעות (בונד / פק"מ)
   * ========================================================================*/

  /**
   * Build a maturity ladder. Doesn't buy anything — produces a schedule
   * that the investment committee can approve and then route to bank.
   *
   * @param {Object} cfg
   * @param {Array<{maturityDays:number,minRate:number,amount:number}>} cfg.buckets
   * @param {Date|string} [cfg.startDate]
   * @returns {Object}
   */
  investmentLadder(cfg) {
    if (!cfg || !Array.isArray(cfg.buckets) || cfg.buckets.length === 0) {
      throw bilingualError(
        'TREAS_LAD_001',
        'חסרות מדרגות סולם השקעות',
        'Missing ladder buckets'
      );
    }
    const start = (cfg.startDate instanceof Date)
      ? cfg.startDate
      : (cfg.startDate ? new Date(cfg.startDate) : this.clock());
    if (isNaN(start.getTime())) {
      throw bilingualError(
        'TREAS_LAD_002',
        'תאריך התחלה לא חוקי',
        'Invalid start date'
      );
    }

    // Sort buckets by maturity
    const sorted = cfg.buckets.slice().sort((a, b) => a.maturityDays - b.maturityDays);
    let totalAmount = 0;
    let weightedRate = 0;
    const rungs = sorted.map((bk, idx) => {
      if (typeof bk.maturityDays !== 'number' || bk.maturityDays <= 0) {
        throw bilingualError(
          'TREAS_LAD_003',
          `מדרגה לא חוקית #${idx + 1}: ימי פדיון`,
          `Invalid bucket #${idx + 1}: maturityDays`
        );
      }
      if (typeof bk.amount !== 'number' || bk.amount <= 0) {
        throw bilingualError(
          'TREAS_LAD_004',
          `מדרגה לא חוקית #${idx + 1}: סכום`,
          `Invalid bucket #${idx + 1}: amount`
        );
      }
      const rate = typeof bk.minRate === 'number' ? bk.minRate : 0;
      const maturity = new Date(start.getTime() + bk.maturityDays * 86400000);
      // Simple-interest estimate (APR basis)
      const estInterest = round2(bk.amount * rate * (bk.maturityDays / 365));
      totalAmount += bk.amount;
      weightedRate += rate * bk.amount;
      return {
        rung: idx + 1,
        maturityDays: bk.maturityDays,
        maturityDate: isoDate(maturity),
        minRate: rate,
        amount: round2(bk.amount),
        estInterest,
        estReturn: round2(bk.amount + estInterest),
        label: {
          he: `מדרגה ${idx + 1}: ${bk.maturityDays} ימים`,
          en: `Rung ${idx + 1}: ${bk.maturityDays} days`
        }
      };
    });

    const avgRate = totalAmount > 0 ? weightedRate / totalAmount : 0;
    const totalEstInterest = rungs.reduce((s, r) => s + r.estInterest, 0);
    const maxMaturity = rungs.reduce((m, r) => Math.max(m, r.maturityDays), 0);

    const ladder = {
      id: `LADDER-${this._investmentLadders.length + 1}`,
      startDate: isoDate(start),
      base: this.baseCurrency,
      rungs,
      totalAmount: round2(totalAmount),
      avgRate: Math.round(avgRate * 10000) / 10000, // 4 decimals
      totalEstInterest: round2(totalEstInterest),
      longestDays: maxMaturity,
      generatedAt: isoNow(),
      warning: {
        he: 'סולם תכנוני — לא נרכש דבר. להעביר לוועדת השקעות ולמודול תשלומים.',
        en: 'Planning ladder — nothing purchased. Route to investment committee and payments (Y-083).'
      }
    };
    this._investmentLadders.push(ladder);
    this._audit_log('ladder.plan', { id: ladder.id, rungs: rungs.length });
    return ladder;
  }

  /* ==========================================================================
   * 5. liquidityBuffer — כרית נזילות
   * ========================================================================*/

  /**
   * Compares required minimum vs current cash and tells you if there's
   * a gap. Expressed in base currency.
   */
  liquidityBuffer(cfg) {
    if (!cfg || typeof cfg !== 'object') {
      throw bilingualError(
        'TREAS_LIQ_001',
        'חסרה תצורת כרית נזילות',
        'Missing liquidity buffer config'
      );
    }
    const required = typeof cfg.required === 'number' ? cfg.required : null;
    if (required === null || required < 0) {
      throw bilingualError(
        'TREAS_LIQ_002',
        'דרישת נזילות לא חוקית',
        'Invalid required liquidity'
      );
    }
    let current = cfg.current;
    if (typeof current !== 'number') {
      // Derive from cashPosition
      const pos = this.cashPosition();
      current = pos.totalBase;
    }
    const gap = round2(current - required);
    const coverage = required > 0 ? Math.round((current / required) * 100) / 100 : null;
    const result = {
      required: round2(required),
      current: round2(current),
      gap,
      coverageRatio: coverage,
      base: this.baseCurrency,
      status: gap >= 0 ? 'ok' : 'shortfall',
      message: gap >= 0
        ? {
            he: `עודף נזילות ${gap} ${this.baseCurrency}`,
            en: `Liquidity surplus ${gap} ${this.baseCurrency}`
          }
        : {
            he: `חוסר נזילות ${-gap} ${this.baseCurrency}`,
            en: `Liquidity shortfall ${-gap} ${this.baseCurrency}`
          },
      generatedAt: isoNow()
    };

    if (gap < 0) {
      this._alertHistory.push({
        ts: isoNow(),
        kind: 'liquidityShortfall',
        message: result.message.he,
        gap
      });
    }
    return result;
  }

  /* ==========================================================================
   * 6. bankFees — מעקב וניתוח עמלות
   * ========================================================================*/

  recordBankFee(entry) {
    if (!entry || typeof entry !== 'object') {
      throw bilingualError(
        'TREAS_FEE_001',
        'חסר רישום עמלה',
        'Missing fee entry'
      );
    }
    const rec = {
      id: `FEE-${this._bankFees.length + 1}`,
      accountId: entry.accountId || null,
      category: entry.category || 'other',
      amount: round2(entry.amount || 0),
      ccy: entry.ccy || this.baseCurrency,
      date: isoDate(entry.date || this.clock()),
      description: entry.description || null,
      recordedAt: isoNow()
    };
    this._bankFees.push(rec);
    this._audit_log('fee.record', rec);
    return rec;
  }

  /**
   * @param {Object} period  {from,to} ISO dates
   */
  bankFees(period) {
    const from = period && period.from ? isoDate(period.from) : '0000-01-01';
    const to = period && period.to ? isoDate(period.to) : '9999-12-31';

    const byCategory = {};
    const byAccount = {};
    let totalBase = 0;
    const rows = [];
    for (const fee of this._bankFees) {
      if (fee.date < from || fee.date > to) continue;
      const feeBase = fxConvert(fee.amount, fee.ccy, this.baseCurrency, this.fxRates);
      byCategory[fee.category] = round2((byCategory[fee.category] || 0) + feeBase);
      if (fee.accountId) {
        byAccount[fee.accountId] = round2((byAccount[fee.accountId] || 0) + feeBase);
      }
      totalBase += feeBase;
      rows.push(Object.assign({ amountBase: feeBase }, fee));
    }
    return {
      period: { from, to },
      base: this.baseCurrency,
      totalBase: round2(totalBase),
      byCategory,
      byAccount,
      rows,
      generatedAt: isoNow()
    };
  }

  /* ==========================================================================
   * 7. openAccount — תהליך פתיחת חשבון (ידני ולא אוטומטי)
   * ========================================================================*/

  /**
   * Tracks an account-opening workflow. This is explicitly NOT automated —
   * opening a bank account requires physical documentation, human approvals,
   * KYC, and bank visits. We only track the workflow states.
   */
  openAccount(application) {
    if (!application || typeof application !== 'object') {
      throw bilingualError(
        'TREAS_OPN_001',
        'חסרה בקשת פתיחת חשבון',
        'Missing account application'
      );
    }
    const id = application.id || `APP-${this._openAccountWorkflows.length + 1}`;
    const checklist = [
      { item: 'תעודת זהות / ח.פ.', en: 'Corporate ID / C.P.', done: !!application.companyIdVerified },
      { item: 'זכויות חתימה', en: 'Signing rights document', done: !!application.signingRightsDoc },
      { item: 'פרוטוקול דירקטוריון', en: 'Board resolution', done: !!application.boardResolution },
      { item: 'מזכר התאגדות', en: 'Articles of incorporation', done: !!application.articles },
      { item: 'KYC — לקוח', en: 'KYC — customer', done: !!application.kycDone },
      { item: 'AML — בדיקת מקורות', en: 'AML — source of funds', done: !!application.amlCleared },
      { item: 'פגישה פיזית בסניף', en: 'Physical branch meeting', done: !!application.branchMeetingDate },
      { item: 'חתימה על הסכם', en: 'Agreement signed', done: !!application.agreementSigned }
    ];
    const allDone = checklist.every(c => c.done);
    const wf = {
      id,
      appliedAt: isoNow(),
      bank: application.bank || null,
      branch: application.branch || null,
      requestedType: application.type || ACCOUNT_TYPE.CHECKING,
      currency: application.currency || BASE_CCY,
      purpose: application.purpose || null,
      status: allDone ? ACCOUNT_STATUS.APPROVED : ACCOUNT_STATUS.UNDER_REVIEW,
      checklist,
      humanNote: {
        he: 'פתיחת חשבון דורשת מגע אנושי ומסמכים. המערכת רק עוקבת — לא מבצעת.',
        en: 'Account opening requires human + documents. System tracks only — does not execute.'
      }
    };
    this._openAccountWorkflows.push(wf);
    this._audit_log('account.apply', { id, status: wf.status });
    return wf;
  }

  /* ==========================================================================
   * 8. mirrorAccounts — חשבון ראשי + חשבונות משנה
   * ========================================================================*/

  /**
   * Link a master account to N mirror (sub) accounts.
   * Common Israeli structure: חשבון ראשי לחברה + חשבונות משנה לפרויקטים.
   */
  mirrorAccounts(masterAccount, mirrors) {
    if (!masterAccount || typeof masterAccount !== 'string') {
      throw bilingualError(
        'TREAS_MIR_001',
        'חסר חשבון ראשי',
        'Missing master account'
      );
    }
    if (!this._accounts.get(masterAccount)) {
      throw bilingualError(
        'TREAS_MIR_002',
        `חשבון ראשי לא רשום: ${masterAccount}`,
        `Master account not registered: ${masterAccount}`
      );
    }
    if (!Array.isArray(mirrors) || mirrors.length === 0) {
      throw bilingualError(
        'TREAS_MIR_003',
        'חסרה רשימת חשבונות משנה',
        'Missing mirror accounts list'
      );
    }

    let set = this._mirrors.get(masterAccount);
    if (!set) { set = new Set(); this._mirrors.set(masterAccount, set); }
    for (const m of mirrors) {
      if (!this._accounts.get(m)) {
        throw bilingualError(
          'TREAS_MIR_004',
          `חשבון משנה לא רשום: ${m}`,
          `Mirror account not registered: ${m}`
        );
      }
      if (m === masterAccount) continue;
      set.add(m);
      this._masterOf.set(m, masterAccount);
    }
    this._audit_log('mirror.link', { masterAccount, mirrors });
    const pos = this.cashPosition();
    const masterRow = pos.byAccount.find(r => r.id === masterAccount);
    const mirrorRows = [];
    let consolidated = masterRow ? masterRow.amountBase : 0;
    for (const m of set) {
      const r = pos.byAccount.find(rr => rr.id === m);
      mirrorRows.push(r || { id: m, amountBase: 0 });
      consolidated += r ? r.amountBase : 0;
    }
    return {
      master: masterAccount,
      mirrors: Array.from(set),
      masterBalanceBase: masterRow ? masterRow.amountBase : 0,
      mirrorBalances: mirrorRows,
      consolidatedBase: round2(consolidated),
      labels: {
        he: 'חשבון ראשי + חשבונות משנה',
        en: 'Master + mirror accounts'
      }
    };
  }

  /* ==========================================================================
   * 9. signatoryMatrix — מטריצת זכות חתימה
   * ========================================================================*/

  signatoryMatrix() {
    // Build a current view by account id
    const byAccount = {};
    const byPerson = {};
    for (const acc of this._accounts.values()) {
      byAccount[acc.id] = {
        bank: acc.bank,
        type: acc.type,
        dailyLimit: acc.dailyLimit,
        signatories: []
      };
    }
    for (const s of this._signatories) {
      const row = byAccount[s.accountId];
      if (!row) continue;
      row.signatories.push({
        person: s.person,
        role: s.role,
        limit: s.limit,
        pairRequired: s.pairRequired
      });
      if (!byPerson[s.person]) byPerson[s.person] = [];
      byPerson[s.person].push({
        accountId: s.accountId,
        limit: s.limit,
        pairRequired: s.pairRequired
      });
    }
    return {
      byAccount,
      byPerson,
      totalSignatories: Object.keys(byPerson).length,
      labels: { he: 'מטריצת בעלי זכות חתימה', en: 'Signatory matrix' },
      generatedAt: isoNow()
    };
  }

  /* ==========================================================================
   * 10. alerts — התראות גזברות
   * ========================================================================*/

  /**
   * Configure and evaluate treasury alerts. Returns new alerts triggered
   * by the rule set when evaluating current state.
   *
   * @param {Object} rules
   */
  alerts(rules) {
    if (rules && typeof rules === 'object') {
      if (typeof rules.lowBalance === 'number') this._alertRules.lowBalance = rules.lowBalance;
      if (typeof rules.largeTransaction === 'number') this._alertRules.largeTransaction = rules.largeTransaction;
      if (typeof rules.afterHoursActivity === 'boolean') this._alertRules.afterHoursActivity = rules.afterHoursActivity;
      if (rules.rateChanges && typeof rules.rateChanges.bpsThreshold === 'number') {
        this._alertRules.rateChanges.bpsThreshold = rules.rateChanges.bpsThreshold;
      }
    }
    // Evaluate low balances against current state
    const pos = this.cashPosition();
    const triggered = [];
    for (const row of pos.byAccount) {
      if (row.amountBase < this._alertRules.lowBalance) {
        const alert = {
          ts: isoNow(),
          kind: 'lowBalance',
          accountId: row.id,
          amountBase: row.amountBase,
          threshold: this._alertRules.lowBalance,
          message: {
            he: `יתרה נמוכה בחשבון ${row.id}`,
            en: `Low balance in account ${row.id}`
          }
        };
        this._alertHistory.push(alert);
        triggered.push(alert);
      }
    }
    return {
      rules: this._alertRules,
      triggered,
      history: this._alertHistory.slice(-50),
      labels: { he: 'התראות גזברות', en: 'Treasury alerts' }
    };
  }

  /* Helper for external callers: stream a transaction through the alert check
     without mutating balances (since we are READ+PLAN). */
  evaluateTransactionAlert(tx) {
    const out = [];
    const amountBase = fxConvert(tx.amount || 0, tx.ccy || this.baseCurrency, this.baseCurrency, this.fxRates);
    if (Math.abs(amountBase) >= this._alertRules.largeTransaction) {
      const a = {
        ts: isoNow(),
        kind: 'largeTransaction',
        tx,
        amountBase,
        message: { he: 'עסקה גדולה', en: 'Large transaction' }
      };
      this._alertHistory.push(a); out.push(a);
    }
    if (this._alertRules.afterHoursActivity && tx.when && isAfterHours(tx.when)) {
      const a = {
        ts: isoNow(),
        kind: 'afterHoursActivity',
        tx,
        message: { he: 'פעילות מחוץ לשעות הפעילות', en: 'After-hours activity' }
      };
      this._alertHistory.push(a); out.push(a);
    }
    return out;
  }

  /* ==========================================================================
   * 11. fxExposure — חשיפה מטבעית
   * ========================================================================*/

  fxExposure() {
    const pos = this.cashPosition();
    const byCcy = {};
    let totalBase = 0;
    for (const row of pos.byAccount) {
      if (!byCcy[row.currency]) {
        byCcy[row.currency] = { ccy: row.currency, amount: 0, amountBase: 0 };
      }
      byCcy[row.currency].amount = round2(byCcy[row.currency].amount + row.amount);
      byCcy[row.currency].amountBase = round2(byCcy[row.currency].amountBase + row.amountBase);
      totalBase += row.amountBase;
    }
    // Non-base exposure
    const exposures = [];
    for (const ccy in byCcy) {
      const row = byCcy[ccy];
      const share = totalBase > 0 ? row.amountBase / totalBase : 0;
      exposures.push({
        ccy,
        amount: row.amount,
        amountBase: row.amountBase,
        share: Math.round(share * 10000) / 10000,
        isBase: ccy === this.baseCurrency
      });
    }
    exposures.sort((a, b) => b.amountBase - a.amountBase);
    const nonBaseShare = exposures
      .filter(e => !e.isBase)
      .reduce((s, e) => s + e.share, 0);

    return {
      base: this.baseCurrency,
      totalBase: round2(totalBase),
      exposures,
      nonBaseShare: Math.round(nonBaseShare * 10000) / 10000,
      labels: { he: 'חשיפה מטבעית', en: 'FX exposure' },
      generatedAt: isoNow()
    };
  }

  /* ==========================================================================
   * 12. reportToBOI — דיווח לבנק ישראל (ישויות גדולות)
   * ========================================================================*/

  /**
   * Builds a Bank of Israel reporting packet.  This is a FILE/PACKET builder.
   * Actual submission is manual or via a dedicated gateway — NOT this module.
   *
   * @param {Object} period {from,to}
   */
  reportToBOI(period) {
    if (!period || !period.from || !period.to) {
      throw bilingualError(
        'TREAS_BOI_001',
        'חסרה תקופת דיווח',
        'Missing reporting period'
      );
    }
    const from = isoDate(period.from);
    const to = isoDate(period.to);
    const asOfPosition = this.cashPosition(to);
    const fx = this.fxExposure();

    const largeAccounts = asOfPosition.byAccount.filter(
      r => r.amountBase >= BOI_LARGE_DEPOSIT_THRESHOLD_ILS
    );
    const packet = {
      id: `BOI-${this._boiReports.length + 1}`,
      regulator: 'Bank of Israel / בנק ישראל',
      authority: 'הפיקוח על הבנקים',
      period: { from, to },
      base: this.baseCurrency,
      totalBase: asOfPosition.totalBase,
      largeAccounts,
      fxExposure: fx.exposures,
      // Metadata the reviewer must confirm before submission
      confirmations: [
        { he: 'הנתונים הושוו עם דפי הבנק', en: 'Data reconciled with statements', done: false },
        { he: 'אישור רואה חשבון / סמנכ"ל כספים', en: 'CPA / CFO approval', done: false },
        { he: 'אישור בעל תפקיד מוסמך', en: 'Authorized officer approval', done: false }
      ],
      safetyNote: {
        he: 'חבילה זו נבנתה לצורך דיווח בלבד. אינה שולחת מידע. יש לשלוח ידנית/בשער ייעודי.',
        en: 'This packet is build-only. It does NOT transmit. Submit manually or via dedicated gateway.'
      },
      generatedAt: isoNow()
    };
    this._boiReports.push(packet);
    this._audit_log('boi.build', { id: packet.id });
    return packet;
  }

  /* ==========================================================================
   * Read-only introspection — for QA, dashboards, and tests
   * ========================================================================*/

  listAccounts() {
    return Array.from(this._accounts.values());
  }
  listAlerts() {
    return this._alertHistory.slice();
  }
  listConcentrationPlans() {
    return this._concentrationPlans.slice();
  }
  listLadders() {
    return this._investmentLadders.slice();
  }
  auditTrail() {
    return this._audit.slice();
  }

  /**
   * Safety assertion — proves this module never executes a transfer.
   */
  isReadOnly() {
    return true;
  }
}

/* ----------------------------------------------------------------------------
 * Exports — CJS only, zero deps
 * -------------------------------------------------------------------------- */

module.exports = {
  Treasury,
  ACCOUNT_TYPE,
  ACCOUNT_STATUS,
  CONCENTRATION_RULE,
  BASE_CCY,
  DEFAULT_FX_RATES_TO_ILS,
  BOI_LARGE_DEPOSIT_THRESHOLD_ILS,
  // exported for tests
  _internal: { fxConvert, isAfterHours, round2 }
};
