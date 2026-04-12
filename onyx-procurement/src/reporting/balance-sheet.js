/**
 * Balance Sheet Explorer — Agent Y-183
 * מאתר המאזן — סוכן Y-183
 *
 * Provides a full balance sheet analysis engine for Techno-Kol Uzi mega-ERP.
 * מספק מנוע ניתוח מאזן מלא עבור מערכת ה-ERP של טכנו-קול עוזי.
 *
 * Features / תכונות:
 *   1. classify(account)   → Maps any chart-of-accounts entry to IFRS/Israeli
 *                            Form 6111 balance sheet classification.
 *                            ממיר חשבון מתוך מבנה החשבונות לסיווג מאזני לפי
 *                            טופס 6111 ו-IFRS.
 *   2. build(accounts)     → Produces a complete balance sheet object
 *                            (current / non-current, assets / liabilities /
 *                            equity).
 *                            מפיק אובייקט מאזן מלא (שוטף / לא-שוטף,
 *                            נכסים / התחייבויות / הון).
 *   3. ratios(bs)          → Liquidity & leverage ratios:
 *                            Current, Quick, Cash, Debt-to-Equity, Equity ratio.
 *                            יחסי נזילות ומינוף: יחס שוטף, יחס מהיר,
 *                            יחס מזומן, חוב להון, יחס הון.
 *   4. workingCapital(bs)  → Current assets − current liabilities.
 *                            הון חוזר = נכסים שוטפים − התחייבויות שוטפות.
 *   5. trend(periods)      → Period-over-period trend of key metrics.
 *                            מגמה בין תקופות של מדדים מרכזיים.
 *   6. formatReport(bs)    → Bilingual (Hebrew / English) formatted text.
 *                            דוח מעוצב דו-לשוני (עברית / אנגלית).
 *
 * Reference / אסמכתא:
 *   - Israel Tax Authority Form 6111 (דוח התאמה למס / טופס 6111)
 *   - IFRS in Israel (IFRS as adopted by the IASB — חובה בישראל
 *     לחברות ציבוריות מ-2008, ולחברות פרטיות רבות בוואלונטרי).
 *   - Israeli Companies Law 1999 §171 — Financial Statements.
 *
 * RULES enforced / כללים נאכפים:
 *   - Node built-ins only (no npm dependencies).
 *   - Never delete data — additive only.
 *   - Bilingual (Hebrew + English) for all user-facing output.
 *   - NIS / ש"ח formatting via Intl (Node built-in).
 *
 * @module onyx-procurement/reporting/balance-sheet
 */

'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// FORM 6111 CLASSIFICATION MAP
// מפת סיווג לפי טופס 6111
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Israeli Tax Authority Form 6111 balance sheet line codes.
 * קודי שורות מאזן של טופס 6111 (רשות המסים בישראל).
 *
 * The Form 6111 uses a standardized chart-of-accounts classification that
 * businesses submit together with their annual tax return. It mirrors
 * IFRS presentation but uses Israeli line-codes.
 *
 * טופס 6111 הוא מסמך חובה לדוח השנתי למס הכנסה, המשקף את המאזן
 * לפי מבנה אחיד של רשות המסים.
 */
const FORM_6111 = Object.freeze({
  // ─── Current Assets / נכסים שוטפים ───────────────────────────────────────
  '1000': { key: 'cash', he: 'מזומנים ושווי מזומנים', en: 'Cash & cash equivalents',
            side: 'asset', term: 'current', liquidityRank: 1 },
  '1010': { key: 'bankDeposits', he: 'פיקדונות בנקאיים', en: 'Bank deposits',
            side: 'asset', term: 'current', liquidityRank: 2 },
  '1020': { key: 'marketableSecurities', he: 'ניירות ערך סחירים', en: 'Marketable securities',
            side: 'asset', term: 'current', liquidityRank: 3 },
  '1100': { key: 'accountsReceivable', he: 'לקוחות', en: 'Accounts receivable',
            side: 'asset', term: 'current', liquidityRank: 4 },
  '1110': { key: 'notesReceivable', he: 'שטרות לגבייה', en: 'Notes receivable',
            side: 'asset', term: 'current', liquidityRank: 5 },
  '1120': { key: 'otherReceivables', he: 'חייבים ויתרות חובה', en: 'Other receivables',
            side: 'asset', term: 'current', liquidityRank: 6 },
  '1130': { key: 'vatReceivable', he: 'מע״מ לקבל', en: 'VAT receivable',
            side: 'asset', term: 'current', liquidityRank: 7 },
  '1200': { key: 'inventory', he: 'מלאי', en: 'Inventory',
            side: 'asset', term: 'current', liquidityRank: 8 },
  '1210': { key: 'workInProgress', he: 'מלאי בעיבוד', en: 'Work-in-progress',
            side: 'asset', term: 'current', liquidityRank: 9 },
  '1300': { key: 'prepaidExpenses', he: 'הוצאות מראש', en: 'Prepaid expenses',
            side: 'asset', term: 'current', liquidityRank: 10 },

  // ─── Non-current Assets / נכסים לא-שוטפים ────────────────────────────────
  '1400': { key: 'longTermReceivables', he: 'חייבים לזמן ארוך', en: 'Long-term receivables',
            side: 'asset', term: 'non-current' },
  '1410': { key: 'longTermInvestments', he: 'השקעות לזמן ארוך', en: 'Long-term investments',
            side: 'asset', term: 'non-current' },
  '1500': { key: 'propertyPlantEquipment', he: 'רכוש קבוע', en: 'Property, plant & equipment',
            side: 'asset', term: 'non-current' },
  '1510': { key: 'accumulatedDepreciation', he: 'פחת נצבר', en: 'Accumulated depreciation',
            side: 'asset', term: 'non-current', contra: true },
  '1600': { key: 'intangibleAssets', he: 'נכסים בלתי-מוחשיים', en: 'Intangible assets',
            side: 'asset', term: 'non-current' },
  '1610': { key: 'goodwill', he: 'מוניטין', en: 'Goodwill',
            side: 'asset', term: 'non-current' },
  '1700': { key: 'deferredTaxAssets', he: 'מסים נדחים - נכס', en: 'Deferred tax assets',
            side: 'asset', term: 'non-current' },

  // ─── Current Liabilities / התחייבויות שוטפות ────────────────────────────
  '2000': { key: 'shortTermLoans', he: 'הלוואות לזמן קצר', en: 'Short-term loans',
            side: 'liability', term: 'current' },
  '2010': { key: 'bankOverdraft', he: 'משיכת יתר', en: 'Bank overdraft',
            side: 'liability', term: 'current' },
  '2100': { key: 'accountsPayable', he: 'ספקים', en: 'Accounts payable',
            side: 'liability', term: 'current' },
  '2110': { key: 'notesPayable', he: 'שטרות לפירעון', en: 'Notes payable',
            side: 'liability', term: 'current' },
  '2120': { key: 'accruedExpenses', he: 'הוצאות לשלם', en: 'Accrued expenses',
            side: 'liability', term: 'current' },
  '2130': { key: 'vatPayable', he: 'מע״מ לשלם', en: 'VAT payable',
            side: 'liability', term: 'current' },
  '2140': { key: 'incomeTaxPayable', he: 'מס הכנסה לשלם', en: 'Income tax payable',
            side: 'liability', term: 'current' },
  '2150': { key: 'payrollPayable', he: 'שכר לשלם', en: 'Payroll payable',
            side: 'liability', term: 'current' },
  '2160': { key: 'socialSecurityPayable', he: 'ביטוח לאומי לשלם', en: 'NII / Bituach Leumi payable',
            side: 'liability', term: 'current' },
  '2200': { key: 'deferredRevenue', he: 'הכנסות מראש', en: 'Deferred revenue',
            side: 'liability', term: 'current' },
  '2210': { key: 'customerAdvances', he: 'מקדמות מלקוחות', en: 'Customer advances',
            side: 'liability', term: 'current' },
  '2220': { key: 'currentPortionLTD', he: 'חלויות שוטפות הלוואות', en: 'Current portion of LT debt',
            side: 'liability', term: 'current' },

  // ─── Non-current Liabilities / התחייבויות לא-שוטפות ─────────────────────
  '2300': { key: 'longTermLoans', he: 'הלוואות לזמן ארוך', en: 'Long-term loans',
            side: 'liability', term: 'non-current' },
  '2310': { key: 'bondsPayable', he: 'אגרות חוב', en: 'Bonds payable',
            side: 'liability', term: 'non-current' },
  '2400': { key: 'severancePayLiability', he: 'עתודה לפיצויים', en: 'Severance pay liability',
            side: 'liability', term: 'non-current' },
  '2500': { key: 'deferredTaxLiabilities', he: 'מסים נדחים - התחייבות', en: 'Deferred tax liabilities',
            side: 'liability', term: 'non-current' },
  '2600': { key: 'leaseObligations', he: 'התחייבויות חכירה', en: 'Lease obligations',
            side: 'liability', term: 'non-current' },

  // ─── Equity / הון עצמי ───────────────────────────────────────────────────
  '3000': { key: 'shareCapital', he: 'הון מניות', en: 'Share capital',
            side: 'equity', term: 'equity' },
  '3100': { key: 'capitalReserves', he: 'קרנות הון', en: 'Capital reserves',
            side: 'equity', term: 'equity' },
  '3200': { key: 'retainedEarnings', he: 'עודפים', en: 'Retained earnings',
            side: 'equity', term: 'equity' },
  '3300': { key: 'treasuryShares', he: 'מניות באוצר', en: 'Treasury shares',
            side: 'equity', term: 'equity', contra: true },
  '3400': { key: 'minorityInterest', he: 'זכויות מיעוט', en: 'Minority interest',
            side: 'equity', term: 'equity' },
});

/**
 * Keyword-based fallback classifier.
 * מסווג מבוסס-מילות-מפתח (חלופה כאשר אין קוד טופס 6111).
 *
 * Ordered: more specific patterns first.
 * מסודר מהפרטני לכללי.
 */
const KEYWORD_MAP = [
  { pattern: /cash|מזומן|קופה/i,                                        code: '1000' },
  { pattern: /deposit|פיקד/i,                                            code: '1010' },
  { pattern: /securit|ניירות ערך/i,                                      code: '1020' },
  { pattern: /receivab|customer|לקוח/i,                                  code: '1100' },
  { pattern: /note.*receiv|שטר.*לגב/i,                                   code: '1110' },
  { pattern: /vat.*(rec|refund)|מע.*לקבל/i,                              code: '1130' },
  { pattern: /inventor|מלאי/i,                                           code: '1200' },
  { pattern: /prepaid|מראש/i,                                            code: '1300' },
  { pattern: /property|plant|equipment|רכוש קבוע|ציוד/i,                 code: '1500' },
  { pattern: /depreciation|פחת/i,                                        code: '1510' },
  { pattern: /intangible|בלתי.מוחש/i,                                    code: '1600' },
  { pattern: /goodwill|מוניטין/i,                                        code: '1610' },
  { pattern: /overdraft|משיכת יתר/i,                                     code: '2010' },
  { pattern: /short.?term.*loan|הלואה.*קצר/i,                            code: '2000' },
  { pattern: /payable|supplier|ספק/i,                                    code: '2100' },
  { pattern: /accrued|לשלם/i,                                            code: '2120' },
  { pattern: /vat.*pay|מע.*לשלם/i,                                       code: '2130' },
  { pattern: /payroll|salary|שכר/i,                                      code: '2150' },
  { pattern: /bituach|national insurance|ביטוח לאומי/i,                  code: '2160' },
  { pattern: /deferred.*revenue|הכנסות מראש/i,                           code: '2200' },
  { pattern: /long.?term.*loan|הלואה.*ארוך/i,                            code: '2300' },
  { pattern: /bond|אגרות חוב/i,                                          code: '2310' },
  { pattern: /severance|פיצוי/i,                                         code: '2400' },
  { pattern: /share.*capital|הון מניות/i,                                code: '3000' },
  { pattern: /retained|עודפים/i,                                         code: '3200' },
  { pattern: /reserve|קרן|קרנות/i,                                       code: '3100' },
];

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS / עזרים
// ═══════════════════════════════════════════════════════════════════════════

/** Round to 2 decimals, safe for floats. עיגול בטוח ל-2 ספרות. */
function r2(n) {
  const num = Number(n);
  if (!Number.isFinite(num)) return 0;
  return Math.round(num * 100) / 100;
}

/** Format amount as NIS. עיצוב סכום בש״ח. */
function formatNIS(amount, locale = 'he-IL') {
  const num = Number(amount);
  if (!Number.isFinite(num)) return '—';
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: 'ILS',
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(num);
  } catch (e) {
    // Fallback if Intl currency lookup fails.
    return `${num.toFixed(2)} ₪`;
  }
}

/** Format a ratio (0.42 → "0.42" / "42%"). */
function formatRatio(value, asPercent = false) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) {
    return '—';
  }
  const num = Number(value);
  return asPercent ? `${(num * 100).toFixed(1)}%` : num.toFixed(2);
}

// ═══════════════════════════════════════════════════════════════════════════
// CORE CLASS / המחלקה המרכזית
// ═══════════════════════════════════════════════════════════════════════════

class BalanceSheetExplorer {
  /**
   * @param {object} [options]
   * @param {string} [options.locale='he-IL']        Locale for money formatting.
   * @param {string} [options.entityName='Techno-Kol Uzi Ltd.'] Entity name.
   * @param {string} [options.currency='ILS']         Reporting currency.
   */
  constructor(options = {}) {
    this.locale = options.locale || 'he-IL';
    this.entityName = options.entityName || 'Techno-Kol Uzi Ltd.';
    this.entityNameHe = options.entityNameHe || 'טכנו-קול עוזי בע״מ';
    this.currency = options.currency || 'ILS';
    this.gaapReference = 'IFRS as adopted in Israel / IFRS מאומץ בישראל';
    this.form6111Reference = 'Israel Tax Authority Form 6111 / טופס 6111 רשות המסים';
  }

  // ──────────────────────────────────────────────────────────────────────
  // classify(account) — core requirement #1
  // ──────────────────────────────────────────────────────────────────────

  /**
   * Classify an account into balance-sheet coordinates.
   * מסווג חשבון לקואורדינטות מאזניות.
   *
   * @param {object} account
   * @param {string} [account.code]       6111-style code (preferred).
   * @param {string} [account.form6111]   Explicit 6111 code override.
   * @param {string} [account.name]       Account name (used if no code).
   * @param {number} [account.balance]    Account balance (ILS).
   * @returns {{
   *   side: 'asset'|'liability'|'equity',
   *   term: 'current'|'non-current'|'equity',
   *   key: string,
   *   nameHe: string,
   *   nameEn: string,
   *   form6111: string|null,
   *   contra: boolean,
   *   confidence: 'explicit'|'code-prefix'|'keyword'|'unknown'
   * }}
   */
  classify(account) {
    if (!account || typeof account !== 'object') {
      return this._unknownClassification('invalid-input');
    }

    // 1. Explicit 6111 code has highest priority.
    const explicit = account.form6111 || account.code;
    if (explicit && FORM_6111[String(explicit)]) {
      return this._hydrate(String(explicit), 'explicit');
    }

    // 2. Code-prefix match: "1100-SPK" → "1100".
    if (account.code) {
      const prefix = String(account.code).split(/[-._]/)[0];
      if (FORM_6111[prefix]) {
        return this._hydrate(prefix, 'code-prefix');
      }
    }

    // 3. Keyword fallback on the name.
    const name = String(account.name || '').trim();
    if (name) {
      for (const rule of KEYWORD_MAP) {
        if (rule.pattern.test(name)) {
          return this._hydrate(rule.code, 'keyword');
        }
      }
    }

    // 4. Unknown.
    return this._unknownClassification('no-match', name);
  }

  _hydrate(code, confidence) {
    const def = FORM_6111[code];
    return {
      side: def.side,
      term: def.term,
      key: def.key,
      nameHe: def.he,
      nameEn: def.en,
      form6111: code,
      contra: Boolean(def.contra),
      liquidityRank: def.liquidityRank || null,
      confidence,
    };
  }

  _unknownClassification(reason, name) {
    return {
      side: 'unknown',
      term: 'unknown',
      key: 'unclassified',
      nameHe: name || 'לא מסווג',
      nameEn: name || 'Unclassified',
      form6111: null,
      contra: false,
      liquidityRank: null,
      confidence: 'unknown',
      reason,
    };
  }

  // ──────────────────────────────────────────────────────────────────────
  // build(accounts) — assemble a full balance sheet
  // ──────────────────────────────────────────────────────────────────────

  /**
   * Build a full balance sheet structure from raw accounts.
   * בונה מבנה מאזן מלא ממערך חשבונות גולמי.
   *
   * @param {Array<{code?:string,name?:string,balance:number}>} accounts
   * @param {object} [meta]
   * @param {string} [meta.periodStart]  ISO date.
   * @param {string} [meta.periodEnd]    ISO date.
   * @param {string} [meta.label]        e.g. "2026-Q1".
   * @returns {object} Balance sheet object.
   */
  build(accounts, meta = {}) {
    if (!Array.isArray(accounts)) {
      throw new TypeError('build: accounts must be an array / accounts חייב להיות מערך');
    }

    const bs = {
      entity: { he: this.entityNameHe, en: this.entityName },
      period: {
        start: meta.periodStart || null,
        end: meta.periodEnd || null,
        label: meta.label || 'current-period',
      },
      currency: this.currency,
      reference: {
        form6111: this.form6111Reference,
        gaap: this.gaapReference,
      },
      assets: {
        current: { lines: [], total: 0 },
        nonCurrent: { lines: [], total: 0 },
        total: 0,
      },
      liabilities: {
        current: { lines: [], total: 0 },
        nonCurrent: { lines: [], total: 0 },
        total: 0,
      },
      equity: {
        lines: [],
        total: 0,
      },
      unclassified: { lines: [], total: 0 },
      totals: {
        assets: 0,
        liabilitiesAndEquity: 0,
        balanced: false,
        imbalance: 0,
      },
    };

    for (const acc of accounts) {
      const balance = r2(acc && acc.balance);
      const classification = this.classify(acc || {});
      const line = {
        code: (acc && acc.code) || null,
        name: (acc && acc.name) || null,
        balance,
        classification,
      };

      // Contra accounts subtract; accumulated depreciation e.g. reduces PP&E.
      const effective = classification.contra ? -balance : balance;

      if (classification.side === 'asset') {
        if (classification.term === 'current') {
          bs.assets.current.lines.push(line);
          bs.assets.current.total = r2(bs.assets.current.total + effective);
        } else {
          bs.assets.nonCurrent.lines.push(line);
          bs.assets.nonCurrent.total = r2(bs.assets.nonCurrent.total + effective);
        }
      } else if (classification.side === 'liability') {
        if (classification.term === 'current') {
          bs.liabilities.current.lines.push(line);
          bs.liabilities.current.total = r2(bs.liabilities.current.total + effective);
        } else {
          bs.liabilities.nonCurrent.lines.push(line);
          bs.liabilities.nonCurrent.total = r2(bs.liabilities.nonCurrent.total + effective);
        }
      } else if (classification.side === 'equity') {
        bs.equity.lines.push(line);
        bs.equity.total = r2(bs.equity.total + effective);
      } else {
        bs.unclassified.lines.push(line);
        bs.unclassified.total = r2(bs.unclassified.total + balance);
      }
    }

    bs.assets.total = r2(bs.assets.current.total + bs.assets.nonCurrent.total);
    bs.liabilities.total = r2(
      bs.liabilities.current.total + bs.liabilities.nonCurrent.total
    );
    bs.totals.assets = bs.assets.total;
    bs.totals.liabilitiesAndEquity = r2(bs.liabilities.total + bs.equity.total);
    bs.totals.imbalance = r2(bs.totals.assets - bs.totals.liabilitiesAndEquity);
    // Allow a 1-agora rounding wiggle.
    bs.totals.balanced = Math.abs(bs.totals.imbalance) < 0.02;

    // Pre-compute derived metrics.
    bs.workingCapital = this.workingCapital(bs);
    bs.ratios = this.ratios(bs);

    return bs;
  }

  // ──────────────────────────────────────────────────────────────────────
  // workingCapital(bs) / הון חוזר
  // ──────────────────────────────────────────────────────────────────────

  /**
   * Working capital analysis.
   * ניתוח הון חוזר.
   *
   * @param {object} bs  Balance sheet object from build().
   * @returns {{
   *   value: number,
   *   currentAssets: number,
   *   currentLiabilities: number,
   *   positive: boolean,
   *   status: 'healthy'|'tight'|'deficit'
   * }}
   */
  workingCapital(bs) {
    if (!bs || !bs.assets || !bs.liabilities) {
      return { value: 0, currentAssets: 0, currentLiabilities: 0, positive: false, status: 'deficit' };
    }
    const ca = bs.assets.current.total;
    const cl = bs.liabilities.current.total;
    const value = r2(ca - cl);
    let status;
    if (value < 0) status = 'deficit';
    else if (ca < cl * 1.2) status = 'tight';
    else status = 'healthy';

    return {
      value,
      currentAssets: ca,
      currentLiabilities: cl,
      positive: value > 0,
      status,
      he: {
        healthy: 'תקין',
        tight: 'מתוח',
        deficit: 'גירעון',
      }[status],
      en: status,
    };
  }

  // ──────────────────────────────────────────────────────────────────────
  // ratios(bs) — liquidity & leverage
  // ──────────────────────────────────────────────────────────────────────

  /**
   * Compute key balance-sheet ratios.
   * חישוב יחסי מאזן מרכזיים.
   *
   * Returned ratios / יחסים מוחזרים:
   *   - current       = CA / CL               (יחס שוטף)
   *   - quick         = (CA − Inventory) / CL  (יחס מהיר / acid test)
   *   - cash          = Cash / CL              (יחס מזומן)
   *   - debtToEquity  = Total Liab / Equity    (חוב להון)
   *   - equityRatio   = Equity / Total Assets  (יחס הון)
   *   - leverageRatio = Total Assets / Equity  (מינוף)
   *
   * @param {object} bs
   * @returns {object} Ratios plus null-safe divisions.
   */
  ratios(bs) {
    const ca = (bs && bs.assets && bs.assets.current.total) || 0;
    const cl = (bs && bs.liabilities && bs.liabilities.current.total) || 0;
    const totalLiab = (bs && bs.liabilities && bs.liabilities.total) || 0;
    const equity = (bs && bs.equity && bs.equity.total) || 0;
    const totalAssets = (bs && bs.assets && bs.assets.total) || 0;

    // Find inventory and cash amounts inside current assets.
    let inventory = 0;
    let cash = 0;
    const currentLines = (bs && bs.assets && bs.assets.current.lines) || [];
    for (const line of currentLines) {
      const key = line.classification && line.classification.key;
      if (key === 'inventory' || key === 'workInProgress') {
        inventory = r2(inventory + line.balance);
      } else if (key === 'cash' || key === 'bankDeposits') {
        cash = r2(cash + line.balance);
      }
    }

    const safeDiv = (num, den) => (den && Number.isFinite(den) && den !== 0 ? num / den : null);

    return {
      current: safeDiv(ca, cl),
      quick: safeDiv(ca - inventory, cl),
      cash: safeDiv(cash, cl),
      debtToEquity: safeDiv(totalLiab, equity),
      equityRatio: safeDiv(equity, totalAssets),
      leverageRatio: safeDiv(totalAssets, equity),
      inputs: {
        currentAssets: r2(ca),
        currentLiabilities: r2(cl),
        inventory: r2(inventory),
        cash: r2(cash),
        totalLiabilities: r2(totalLiab),
        equity: r2(equity),
        totalAssets: r2(totalAssets),
      },
      interpretations: {
        // Rule of thumb: current ≥ 1.5, quick ≥ 1.0, debt/equity ≤ 2.0.
        current: {
          value: safeDiv(ca, cl),
          healthy: safeDiv(ca, cl) !== null && safeDiv(ca, cl) >= 1.5,
          he: 'יחס שוטף בריא ≥ 1.5',
          en: 'Healthy current ratio ≥ 1.5',
        },
        quick: {
          value: safeDiv(ca - inventory, cl),
          healthy: safeDiv(ca - inventory, cl) !== null && safeDiv(ca - inventory, cl) >= 1.0,
          he: 'יחס מהיר בריא ≥ 1.0',
          en: 'Healthy quick ratio ≥ 1.0',
        },
        debtToEquity: {
          value: safeDiv(totalLiab, equity),
          healthy: safeDiv(totalLiab, equity) !== null && safeDiv(totalLiab, equity) <= 2.0,
          he: 'חוב להון בריא ≤ 2.0',
          en: 'Healthy D/E ≤ 2.0',
        },
      },
    };
  }

  // ──────────────────────────────────────────────────────────────────────
  // trend(periods) — period-over-period comparison
  // ──────────────────────────────────────────────────────────────────────

  /**
   * Compute trends across multiple periods.
   * חישוב מגמות בין מספר תקופות.
   *
   * @param {Array<object>} periods  Array of balance sheets from build().
   * @returns {object} Trend analysis with absolute & percent deltas.
   */
  trend(periods) {
    if (!Array.isArray(periods) || periods.length === 0) {
      return { periods: [], deltas: [], summary: { he: 'אין נתונים', en: 'No data' } };
    }

    const series = periods.map((bs) => ({
      label: (bs && bs.period && bs.period.label) || 'period',
      totalAssets: (bs && bs.totals && bs.totals.assets) || 0,
      workingCapital: (bs && bs.workingCapital && bs.workingCapital.value) || 0,
      currentRatio: (bs && bs.ratios && bs.ratios.current) || null,
      quickRatio: (bs && bs.ratios && bs.ratios.quick) || null,
      debtToEquity: (bs && bs.ratios && bs.ratios.debtToEquity) || null,
      equityRatio: (bs && bs.ratios && bs.ratios.equityRatio) || null,
      equity: (bs && bs.equity && bs.equity.total) || 0,
    }));

    const deltas = [];
    for (let i = 1; i < series.length; i++) {
      const prev = series[i - 1];
      const cur = series[i];
      deltas.push({
        from: prev.label,
        to: cur.label,
        totalAssetsAbs: r2(cur.totalAssets - prev.totalAssets),
        totalAssetsPct: prev.totalAssets
          ? r2(((cur.totalAssets - prev.totalAssets) / prev.totalAssets) * 100)
          : null,
        workingCapitalAbs: r2(cur.workingCapital - prev.workingCapital),
        currentRatioDelta:
          prev.currentRatio !== null && cur.currentRatio !== null
            ? r2(cur.currentRatio - prev.currentRatio)
            : null,
        equityAbs: r2(cur.equity - prev.equity),
      });
    }

    // Determine trend direction for working capital.
    let direction = 'stable';
    if (deltas.length > 0) {
      const totalDelta = deltas.reduce((s, d) => s + d.workingCapitalAbs, 0);
      if (totalDelta > 0.02) direction = 'improving';
      else if (totalDelta < -0.02) direction = 'deteriorating';
    }

    return {
      periods: series,
      deltas,
      direction,
      summary: {
        he: {
          improving: 'המגמה משתפרת',
          deteriorating: 'המגמה מתדרדרת',
          stable: 'המגמה יציבה',
        }[direction],
        en: {
          improving: 'Trend is improving',
          deteriorating: 'Trend is deteriorating',
          stable: 'Trend is stable',
        }[direction],
      },
    };
  }

  // ──────────────────────────────────────────────────────────────────────
  // formatReport(bs) — bilingual text output
  // ──────────────────────────────────────────────────────────────────────

  /**
   * Produce a bilingual (Hebrew / English) text report.
   * מפיק דוח טקסט דו-לשוני.
   *
   * @param {object} bs  Balance sheet object.
   * @returns {string}   Multi-line text report.
   */
  formatReport(bs) {
    if (!bs) return '';
    const L = (n) => formatNIS(n, this.locale);
    const lines = [];
    const sep = '═'.repeat(72);
    const thin = '─'.repeat(72);

    lines.push(sep);
    lines.push(`  BALANCE SHEET / מאזן`);
    lines.push(`  ${bs.entity.en}  |  ${bs.entity.he}`);
    lines.push(`  Period / תקופה: ${bs.period.label}  (${bs.period.start || '—'} → ${bs.period.end || '—'})`);
    lines.push(`  Reference / אסמכתא:`);
    lines.push(`    • ${bs.reference.form6111}`);
    lines.push(`    • ${bs.reference.gaap}`);
    lines.push(sep);
    lines.push('');

    // ── Assets
    lines.push('ASSETS / נכסים');
    lines.push(thin);
    lines.push('  Current Assets / נכסים שוטפים:');
    for (const line of bs.assets.current.lines) {
      const c = line.classification;
      const label = `${c.nameEn} / ${c.nameHe}`;
      const shown = c.contra ? `(${L(line.balance)})` : L(line.balance);
      lines.push(`    ${label.padEnd(50)} ${shown.padStart(18)}`);
    }
    lines.push(`    ${'Total Current / סה״כ שוטפים'.padEnd(50)} ${L(bs.assets.current.total).padStart(18)}`);
    lines.push('');
    lines.push('  Non-current Assets / נכסים לא-שוטפים:');
    for (const line of bs.assets.nonCurrent.lines) {
      const c = line.classification;
      const label = `${c.nameEn} / ${c.nameHe}`;
      const shown = c.contra ? `(${L(line.balance)})` : L(line.balance);
      lines.push(`    ${label.padEnd(50)} ${shown.padStart(18)}`);
    }
    lines.push(`    ${'Total Non-current / סה״כ לא-שוטפים'.padEnd(50)} ${L(bs.assets.nonCurrent.total).padStart(18)}`);
    lines.push(thin);
    lines.push(`  ${'TOTAL ASSETS / סה״כ נכסים'.padEnd(50)} ${L(bs.assets.total).padStart(18)}`);
    lines.push('');

    // ── Liabilities
    lines.push('LIABILITIES / התחייבויות');
    lines.push(thin);
    lines.push('  Current Liabilities / התחייבויות שוטפות:');
    for (const line of bs.liabilities.current.lines) {
      const c = line.classification;
      const label = `${c.nameEn} / ${c.nameHe}`;
      lines.push(`    ${label.padEnd(50)} ${L(line.balance).padStart(18)}`);
    }
    lines.push(`    ${'Total Current / סה״כ שוטפות'.padEnd(50)} ${L(bs.liabilities.current.total).padStart(18)}`);
    lines.push('');
    lines.push('  Non-current Liabilities / התחייבויות לא-שוטפות:');
    for (const line of bs.liabilities.nonCurrent.lines) {
      const c = line.classification;
      const label = `${c.nameEn} / ${c.nameHe}`;
      lines.push(`    ${label.padEnd(50)} ${L(line.balance).padStart(18)}`);
    }
    lines.push(`    ${'Total Non-current / סה״כ לא-שוטפות'.padEnd(50)} ${L(bs.liabilities.nonCurrent.total).padStart(18)}`);
    lines.push(thin);
    lines.push(`  ${'TOTAL LIABILITIES / סה״כ התחייבויות'.padEnd(50)} ${L(bs.liabilities.total).padStart(18)}`);
    lines.push('');

    // ── Equity
    lines.push('EQUITY / הון עצמי');
    lines.push(thin);
    for (const line of bs.equity.lines) {
      const c = line.classification;
      const label = `${c.nameEn} / ${c.nameHe}`;
      const shown = c.contra ? `(${L(line.balance)})` : L(line.balance);
      lines.push(`    ${label.padEnd(50)} ${shown.padStart(18)}`);
    }
    lines.push(thin);
    lines.push(`  ${'TOTAL EQUITY / סה״כ הון עצמי'.padEnd(50)} ${L(bs.equity.total).padStart(18)}`);
    lines.push('');
    lines.push(sep);
    lines.push(`  ${'TOTAL LIAB + EQUITY / סה״כ התחייבויות והון'.padEnd(50)} ${L(bs.totals.liabilitiesAndEquity).padStart(18)}`);
    lines.push(`  ${'TOTAL ASSETS        / סה״כ נכסים        '.padEnd(50)} ${L(bs.totals.assets).padStart(18)}`);
    lines.push(`  Balanced / מאוזן: ${bs.totals.balanced ? 'YES / כן' : 'NO / לא'}  |  imbalance = ${L(bs.totals.imbalance)}`);
    lines.push(sep);
    lines.push('');

    // ── Ratios
    lines.push('KEY RATIOS / יחסים מרכזיים');
    lines.push(thin);
    lines.push(`  Current Ratio    / יחס שוטף       : ${formatRatio(bs.ratios.current)}`);
    lines.push(`  Quick Ratio      / יחס מהיר        : ${formatRatio(bs.ratios.quick)}`);
    lines.push(`  Cash Ratio       / יחס מזומן       : ${formatRatio(bs.ratios.cash)}`);
    lines.push(`  Debt to Equity   / חוב להון        : ${formatRatio(bs.ratios.debtToEquity)}`);
    lines.push(`  Equity Ratio     / יחס הון         : ${formatRatio(bs.ratios.equityRatio, true)}`);
    lines.push('');

    // ── Working Capital
    lines.push('WORKING CAPITAL / הון חוזר');
    lines.push(thin);
    lines.push(`  Value / ערך              : ${L(bs.workingCapital.value)}`);
    lines.push(`  Current Assets / שוטפים   : ${L(bs.workingCapital.currentAssets)}`);
    lines.push(`  Current Liab.  / שוטפות   : ${L(bs.workingCapital.currentLiabilities)}`);
    lines.push(`  Status / סטטוס           : ${bs.workingCapital.en} / ${bs.workingCapital.he}`);
    lines.push(sep);

    return lines.join('\n');
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

module.exports = {
  BalanceSheetExplorer,
  FORM_6111,
  KEYWORD_MAP,
  // Utility helpers exposed for testing.
  _helpers: { r2, formatNIS, formatRatio },
};
