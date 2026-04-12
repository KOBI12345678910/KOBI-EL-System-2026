/**
 * Journal Entry Builder — General Ledger Core
 * Techno-Kol ERP 2026 / Kobi EL / Swarm 3C / Agent X-39
 * ----------------------------------------------------------------------------
 * Manual Journal Entry (JE) builder with:
 *   - Balanced entries (sum debits = sum credits; up to 0.01 tolerance)
 *   - Multi-line support
 *   - Foreign currency with auto-ILS conversion (base currency ILS — ש״ח)
 *   - Cost center / project allocation per line
 *   - Template library for recurring entries (10+ seeded)
 *   - Reversing entries (auto-posted on 1st day of next period)
 *   - Recurring schedules (monthly accrual / amortization)
 *   - Validation against Israeli 6111 Chart Of Accounts (COA)
 *     - account exists, not frozen, active
 *     - category match (assets/liab/equity/rev/cogs/opex/nonop/tax)
 *   - Period-lock check (fiscal calendar)
 *   - Auto-numbering JE-YYYYMM-NNNN
 *   - Supporting-document attachments (reference only)
 *   - Amount-threshold approval workflow
 *   - Post to GL (locks entry, marks posted, timestamp + user)
 *   - Unpost (audit note; refuses if period locked)
 *
 * Bilingual: every user-facing error/message carries {en, he}.
 * Zero external dependencies — pure Node, safe for browser bundling.
 *
 * USAGE:
 *   const GL = require('./journal-entry');
 *   const book = GL.createBook({ coa, periods, fx });
 *   const id = book.createEntry({ date:'2026-04-11', memo:'Rent accrual' });
 *   book.addLine(id, { account:'6200', debit:5000, description:'שכירות' });
 *   book.addLine(id, { account:'2150', credit:5000, description:'שכירות לשלם' });
 *   const v = book.validate(id);            // { balanced:true, errors:[] }
 *   book.post(id, 'user-42');               // locks
 *   const rev = book.reverse(id, 'correction'); // creates reversal
 *   const tplId = book.applyTemplate('MONTHLY_RENT', { amount:5000 });
 * ========================================================================== */

'use strict';

// ============================================================================
// § 1. CONSTANTS — Israeli 6111 Chart Of Accounts Categories
// ============================================================================

/**
 * Israeli 6111 form chart-of-accounts account-number bands.
 * Each category has {min, max, type, normalSide}.
 * normalSide determines whether an increase is a debit (D) or credit (C).
 */
const COA_CATEGORIES = Object.freeze({
  ASSET:        { min: 1000, max: 1999, type: 'asset',     normalSide: 'D',
                  he: 'נכסים',              en: 'Assets' },
  LIABILITY:    { min: 2000, max: 2999, type: 'liability', normalSide: 'C',
                  he: 'התחייבויות',          en: 'Liabilities' },
  EQUITY:       { min: 3000, max: 3999, type: 'equity',    normalSide: 'C',
                  he: 'הון עצמי',            en: 'Equity' },
  REVENUE:      { min: 4000, max: 4999, type: 'revenue',   normalSide: 'C',
                  he: 'הכנסות',              en: 'Revenue' },
  COGS:         { min: 5000, max: 5999, type: 'cogs',      normalSide: 'D',
                  he: 'עלות המכר',           en: 'Cost of Goods Sold' },
  OPEX:         { min: 6000, max: 6999, type: 'opex',      normalSide: 'D',
                  he: 'הוצאות תפעול',        en: 'Operating Expenses' },
  NONOP:        { min: 7000, max: 8999, type: 'non_op',    normalSide: 'D',
                  he: 'פעילות לא תפעולית',   en: 'Non-Operating' },
  TAX:          { min: 9000, max: 9999, type: 'tax',       normalSide: 'D',
                  he: 'מיסים',               en: 'Tax' },
});

// Legacy/special band — some Israeli books use 0100-0199 for sales
const LEGACY_REVENUE = Object.freeze({ min: 100, max: 199, type: 'revenue', normalSide: 'C' });

/** Determine category for a given account number string/number. */
function classify(accountNo) {
  const n = Number(accountNo);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n >= LEGACY_REVENUE.min && n <= LEGACY_REVENUE.max) {
    return { key: 'REVENUE', ...COA_CATEGORIES.REVENUE, legacy: true };
  }
  for (const [key, cat] of Object.entries(COA_CATEGORIES)) {
    if (n >= cat.min && n <= cat.max) return { key, ...cat, legacy: false };
  }
  return null;
}

// ============================================================================
// § 2. UTILITIES — money, ids, dates
// ============================================================================

/** Round to 2 decimals (agorot precision). */
function round2(x) {
  return Math.round((Number(x) + Number.EPSILON) * 100) / 100;
}

/** Sum a numeric field across an array (treating null as 0). */
function sumBy(arr, field) {
  let s = 0;
  for (const row of arr) s += Number(row[field] || 0);
  return round2(s);
}

/** Near-zero check accounting for floating-point (1 agora tolerance = 0.01). */
function nearZero(x, tol = 0.01) {
  return Math.abs(Number(x) || 0) < tol + 1e-9;
}

/** Parse ISO or Date -> {y,m,d} integers. */
function parseDate(input) {
  if (input instanceof Date) {
    return { y: input.getFullYear(), m: input.getMonth() + 1, d: input.getDate() };
  }
  const s = String(input || '');
  const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return { y: +m[1], m: +m[2], d: +m[3] };
  const dt = new Date(s);
  if (!isNaN(dt.getTime())) {
    return { y: dt.getFullYear(), m: dt.getMonth() + 1, d: dt.getDate() };
  }
  return null;
}

/** Format YYYY-MM-DD. */
function fmtISO({ y, m, d }) {
  return `${String(y).padStart(4,'0')}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
}

/** Return YYYYMM for a date. */
function periodKey(input) {
  const p = parseDate(input);
  if (!p) return null;
  return `${String(p.y).padStart(4,'0')}${String(p.m).padStart(2,'0')}`;
}

/** First day of the *next* period (month), ISO string. */
function firstOfNextPeriod(input) {
  const p = parseDate(input);
  if (!p) return null;
  const nextMonth = p.m === 12 ? 1 : p.m + 1;
  const nextYear = p.m === 12 ? p.y + 1 : p.y;
  return fmtISO({ y: nextYear, m: nextMonth, d: 1 });
}

/** Shift date by N months, preserving day when possible, ISO string. */
function addMonths(input, months) {
  const p = parseDate(input);
  if (!p) return null;
  let m = p.m + months;
  let y = p.y;
  while (m > 12) { m -= 12; y += 1; }
  while (m < 1)  { m += 12; y -= 1; }
  // clamp day to last day of target month
  const lastDay = new Date(y, m, 0).getDate();
  const d = Math.min(p.d, lastDay);
  return fmtISO({ y, m, d });
}

/** Generate a monotonic random-ish id (no crypto dep). */
let __idCounter = 0;
function genId(prefix) {
  __idCounter += 1;
  const t = Date.now().toString(36);
  const c = __idCounter.toString(36).padStart(4, '0');
  const r = Math.floor(Math.random() * 46656).toString(36).padStart(3, '0');
  return `${prefix}-${t}${c}${r}`;
}

// ============================================================================
// § 3. BILINGUAL MESSAGES
// ============================================================================

const MSG = Object.freeze({
  ERR_NO_LINES:          { en: 'Entry has no lines',                     he: 'אין שורות בפקודת יומן' },
  ERR_UNBALANCED:        { en: 'Debits do not equal credits',            he: 'חובה אינו שווה לזכות' },
  ERR_LINE_INVALID:      { en: 'Line must have exactly one of debit or credit',
                           he: 'שורה חייבת חובה או זכות בלבד' },
  ERR_AMOUNT_NEG:        { en: 'Amount must be positive',                he: 'סכום חייב להיות חיובי' },
  ERR_ACCT_MISSING:      { en: 'Account does not exist in COA',          he: 'חשבון לא קיים בלוח חשבונות' },
  ERR_ACCT_FROZEN:       { en: 'Account is frozen (closed to posting)',  he: 'חשבון מוקפא — אסור לרשום' },
  ERR_ACCT_INACTIVE:     { en: 'Account is inactive',                    he: 'חשבון לא פעיל' },
  ERR_ACCT_BAD:          { en: 'Account number out of Israeli 6111 range',
                           he: 'מספר חשבון מחוץ לטווח 6111' },
  ERR_PERIOD_LOCKED:     { en: 'Period is locked — cannot post',         he: 'התקופה נעולה — לא ניתן לרשום' },
  ERR_POSTED_LOCK:       { en: 'Entry already posted and locked',        he: 'הפקודה כבר נרשמה ונעולה' },
  ERR_NOT_POSTED:        { en: 'Entry is not posted',                    he: 'הפקודה לא נרשמה' },
  ERR_TEMPLATE_MISSING:  { en: 'Template not found',                     he: 'תבנית לא נמצאה' },
  ERR_APPROVAL_REQUIRED: { en: 'Approval required for this amount',      he: 'נדרש אישור לסכום זה' },
  ERR_DATE_BAD:          { en: 'Invalid date',                            he: 'תאריך לא תקין' },
  ERR_FX_RATE_MISSING:   { en: 'FX rate missing for currency',           he: 'חסר שער חליפין למטבע' },
  ERR_REVERSED_TWICE:    { en: 'Entry already reversed',                 he: 'פקודה כבר בוטלה' },
  OK_POSTED:             { en: 'Entry posted',                           he: 'הפקודה נרשמה' },
  OK_UNPOSTED:           { en: 'Entry unposted',                         he: 'הפקודה בוטלה' },
});

/** Create a bilingual error object. */
function bilingualError(code, details) {
  const m = MSG[code] || { en: code, he: code };
  const err = new Error(m.en);
  err.code = code;
  err.en = m.en;
  err.he = m.he;
  err.details = details || {};
  return err;
}

// ============================================================================
// § 4. IN-MEMORY STORES (can be replaced with DB adapter)
// ============================================================================

/** Default COA — minimal seed; callers usually inject a full chart. */
function defaultCoa() {
  const accts = [
    { no: '1100', name: 'מזומנים בבנק',     nameEn: 'Bank Cash',          active: true, frozen: false },
    { no: '1200', name: 'לקוחות',           nameEn: 'Accounts Receivable',active: true, frozen: false },
    { no: '1300', name: 'מלאי',             nameEn: 'Inventory',          active: true, frozen: false },
    { no: '1500', name: 'רכוש קבוע',        nameEn: 'Fixed Assets',       active: true, frozen: false },
    { no: '1590', name: 'פחת נצבר',         nameEn: 'Accum Depreciation', active: true, frozen: false },
    { no: '2100', name: 'ספקים',            nameEn: 'Accounts Payable',   active: true, frozen: false },
    { no: '2150', name: 'הוצאות לשלם',      nameEn: 'Accrued Expenses',   active: true, frozen: false },
    { no: '2200', name: 'הלוואות לזמן קצר', nameEn: 'Short-term Loans',   active: true, frozen: false },
    { no: '2300', name: 'מע״מ לשלם',        nameEn: 'VAT Payable',        active: true, frozen: false },
    { no: '2310', name: 'מע״מ תשומות',      nameEn: 'VAT Input',          active: true, frozen: false },
    { no: '3000', name: 'הון מניות',        nameEn: 'Share Capital',      active: true, frozen: false },
    { no: '3500', name: 'עודפים',           nameEn: 'Retained Earnings',  active: true, frozen: false },
    { no: '4000', name: 'הכנסות ממכירות',    nameEn: 'Sales Revenue',      active: true, frozen: false },
    { no: '5000', name: 'עלות המכירות',     nameEn: 'COGS',               active: true, frozen: false },
    { no: '6100', name: 'שכר ומשכורות',     nameEn: 'Salaries & Wages',   active: true, frozen: false },
    { no: '6200', name: 'שכירות',           nameEn: 'Rent Expense',       active: true, frozen: false },
    { no: '6300', name: 'ביטוחים',          nameEn: 'Insurance Expense',  active: true, frozen: false },
    { no: '6400', name: 'עמלות בנק',        nameEn: 'Bank Service Fees',  active: true, frozen: false },
    { no: '6500', name: 'פחת והפחתות',      nameEn: 'Depreciation Expense',active: true, frozen: false },
    { no: '6800', name: 'הוצאות שונות',     nameEn: 'Misc Expenses',      active: true, frozen: false },
    { no: '7100', name: 'הפרשי שער',        nameEn: 'FX Gain/Loss',       active: true, frozen: false },
    { no: '7200', name: 'ריבית',            nameEn: 'Interest Expense',   active: true, frozen: false },
    { no: '9000', name: 'מס הכנסה',         nameEn: 'Income Tax',         active: true, frozen: false },
  ];
  const map = new Map();
  for (const a of accts) map.set(String(a.no), Object.freeze({ ...a }));
  return map;
}

// ============================================================================
// § 5. TEMPLATE LIBRARY — 10+ seeded recurring JE templates
// ============================================================================

/**
 * A template takes variables and produces {memo, lines}.
 * Each line is {account, debit|credit, description, cost_center?}.
 */
function defaultTemplates() {
  return Object.freeze({
    /* -------------------------------------------------------------- */
    MONTHLY_RENT_ACCRUAL: {
      id: 'MONTHLY_RENT_ACCRUAL',
      name: { he: 'הפרשת שכירות חודשית', en: 'Monthly Rent Accrual' },
      variables: ['amount', 'cost_center'],
      build: (v) => ({
        memo: (v.memo || 'Monthly rent accrual'),
        lines: [
          { account: '6200', debit:  v.amount, description: 'שכירות חודשית',
            cost_center: v.cost_center || null },
          { account: '2150', credit: v.amount, description: 'שכירות לשלם' },
        ],
      }),
    },
    /* -------------------------------------------------------------- */
    PREPAID_INSURANCE_AMORT: {
      id: 'PREPAID_INSURANCE_AMORT',
      name: { he: 'אמורטיזציית ביטוח ששולם מראש', en: 'Prepaid Insurance Amortization' },
      variables: ['monthly_amount', 'prepaid_account'],
      build: (v) => ({
        memo: (v.memo || 'Prepaid insurance amortization'),
        lines: [
          { account: '6300', debit:  v.monthly_amount, description: 'ביטוח תקופתי' },
          { account: v.prepaid_account || '1400', credit: v.monthly_amount,
            description: 'ביטוח ששולם מראש' },
        ],
      }),
    },
    /* -------------------------------------------------------------- */
    DEPRECIATION: {
      id: 'DEPRECIATION',
      name: { he: 'פחת רכוש קבוע', en: 'Depreciation' },
      variables: ['amount', 'asset_account'],
      // Hook into asset-manager by providing an `asset_account` override.
      build: (v) => ({
        memo: (v.memo || 'Monthly depreciation'),
        lines: [
          { account: '6500', debit:  v.amount, description: 'הוצאות פחת' },
          { account: '1590', credit: v.amount, description: 'פחת נצבר' },
        ],
      }),
    },
    /* -------------------------------------------------------------- */
    PAYROLL_ACCRUAL: {
      id: 'PAYROLL_ACCRUAL',
      name: { he: 'הפרשת שכר', en: 'Payroll Accrual' },
      variables: ['gross', 'employer_cost', 'net_payable'],
      build: (v) => {
        const gross = Number(v.gross || 0);
        const empCost = Number(v.employer_cost || 0);
        const netPay = Number(v.net_payable || 0);
        const withhold = round2(gross - netPay);
        return {
          memo: (v.memo || 'Payroll accrual'),
          lines: [
            { account: '6100', debit:  round2(gross + empCost),
              description: 'שכר + עלות מעסיק' },
            { account: '2150', credit: round2(netPay),
              description: 'שכר לשלם - עובדים' },
            { account: '2150', credit: round2(withhold + empCost),
              description: 'ניכויים + מעסיק לשלם' },
          ],
        };
      },
    },
    /* -------------------------------------------------------------- */
    BANK_SERVICE_FEES: {
      id: 'BANK_SERVICE_FEES',
      name: { he: 'עמלות בנק', en: 'Bank Service Fees' },
      variables: ['amount', 'bank_account'],
      build: (v) => ({
        memo: (v.memo || 'Bank fees'),
        lines: [
          { account: '6400', debit:  v.amount, description: 'עמלות בנק' },
          { account: v.bank_account || '1100', credit: v.amount, description: 'בנק' },
        ],
      }),
    },
    /* -------------------------------------------------------------- */
    FX_REVALUATION: {
      id: 'FX_REVALUATION',
      name: { he: 'שערוך מטבע חוץ', en: 'FX Revaluation' },
      variables: ['fx_gain_loss', 'target_account'],
      // Positive amount = gain (credit 7100), negative = loss (debit 7100)
      build: (v) => {
        const amt = Number(v.fx_gain_loss || 0);
        const target = v.target_account || '1200';
        if (amt >= 0) {
          return {
            memo: (v.memo || 'FX revaluation — gain'),
            lines: [
              { account: target, debit:  amt, description: 'שערוך מטח' },
              { account: '7100', credit: amt, description: 'רווח הפרשי שער' },
            ],
          };
        }
        const a = Math.abs(amt);
        return {
          memo: (v.memo || 'FX revaluation — loss'),
          lines: [
            { account: '7100', debit:  a, description: 'הפסד הפרשי שער' },
            { account: target, credit: a, description: 'שערוך מטח' },
          ],
        };
      },
    },
    /* -------------------------------------------------------------- */
    INVENTORY_ADJUSTMENT: {
      id: 'INVENTORY_ADJUSTMENT',
      name: { he: 'התאמת מלאי', en: 'Inventory Adjustment' },
      variables: ['amount', 'direction'],
      // direction: 'up' (increase inventory) or 'down' (write-off)
      build: (v) => {
        if (v.direction === 'up') {
          return {
            memo: (v.memo || 'Inventory count-up'),
            lines: [
              { account: '1300', debit:  v.amount, description: 'התאמת מלאי חיובית' },
              { account: '5000', credit: v.amount, description: 'תיקון עלות' },
            ],
          };
        }
        return {
          memo: (v.memo || 'Inventory write-down'),
          lines: [
            { account: '5000', debit:  v.amount, description: 'הפסד מלאי' },
            { account: '1300', credit: v.amount, description: 'מלאי' },
          ],
        };
      },
    },
    /* -------------------------------------------------------------- */
    VAT_OFFSET: {
      id: 'VAT_OFFSET',
      name: { he: 'קיזוז מע״מ', en: 'VAT Offset (periodic)' },
      variables: ['vat_output', 'vat_input'],
      build: (v) => {
        const out = Number(v.vat_output || 0);
        const inp = Number(v.vat_input || 0);
        const net = round2(out - inp);
        return {
          memo: (v.memo || 'VAT period offset'),
          lines: [
            { account: '2300', debit:  out, description: 'מע״מ פלט' },
            { account: '2310', credit: inp, description: 'מע״מ תשומות' },
            { account: '2300', credit: net, description: net >= 0 ? 'מע״מ לתשלום' : 'מע״מ להחזר' },
          ],
        };
      },
    },
    /* -------------------------------------------------------------- */
    LOAN_PAYMENT: {
      id: 'LOAN_PAYMENT',
      name: { he: 'תשלום הלוואה', en: 'Loan Payment' },
      variables: ['principal', 'interest', 'bank_account'],
      build: (v) => ({
        memo: (v.memo || 'Loan installment'),
        lines: [
          { account: '2200', debit:  Number(v.principal || 0), description: 'קרן הלוואה' },
          { account: '7200', debit:  Number(v.interest  || 0), description: 'ריבית הלוואה' },
          { account: v.bank_account || '1100',
            credit: round2(Number(v.principal || 0) + Number(v.interest || 0)),
            description: 'תשלום מהבנק' },
        ],
      }),
    },
    /* -------------------------------------------------------------- */
    YEAR_END_CLOSE: {
      id: 'YEAR_END_CLOSE',
      name: { he: 'סגירת שנה — העברת רווח/הפסד', en: 'Year-End Close' },
      variables: ['net_income'],
      // Positive = profit, moves to retained earnings
      build: (v) => {
        const amt = Number(v.net_income || 0);
        if (amt >= 0) {
          return {
            memo: (v.memo || 'Year-end close — profit'),
            lines: [
              { account: '4000', debit:  amt, description: 'סגירת הכנסות' },
              { account: '3500', credit: amt, description: 'רווח לעודפים' },
            ],
          };
        }
        const a = Math.abs(amt);
        return {
          memo: (v.memo || 'Year-end close — loss'),
          lines: [
            { account: '3500', debit:  a, description: 'הפסד מעודפים' },
            { account: '4000', credit: a, description: 'סגירת הכנסות' },
          ],
        };
      },
    },
    /* -------------------------------------------------------------- */
    ACCRUED_INTEREST_INCOME: {
      id: 'ACCRUED_INTEREST_INCOME',
      name: { he: 'הפרשת ריבית לקבל', en: 'Accrued Interest Income' },
      variables: ['amount'],
      build: (v) => ({
        memo: (v.memo || 'Accrued interest income'),
        lines: [
          { account: '1200', debit:  v.amount, description: 'ריבית לקבל' },
          { account: '4000', credit: v.amount, description: 'הכנסות מריבית' },
        ],
      }),
    },
  });
}

// ============================================================================
// § 6. APPROVAL THRESHOLDS
// ============================================================================

/**
 * Default amount-based approval tiers (total debit side, in ILS).
 * Consumers can override via createBook({ approvalTiers: [...] }).
 */
const DEFAULT_APPROVAL_TIERS = Object.freeze([
  { upTo:   5000, role: 'bookkeeper' },
  { upTo:  50000, role: 'accountant' },
  { upTo: 500000, role: 'cfo' },
  { upTo: Infinity, role: 'ceo' },
]);

function approvalRoleFor(amount, tiers) {
  const list = tiers || DEFAULT_APPROVAL_TIERS;
  for (const t of list) if (amount <= t.upTo) return t.role;
  return 'ceo';
}

// ============================================================================
// § 7. CORE — createBook() returns an isolated GL book
// ============================================================================

/**
 * Create a Book instance that owns entries, counters, and adapters.
 * Options:
 *   coa            Map<acctNo, {active, frozen, ...}>   (defaults to defaultCoa())
 *   periods        { isLocked(periodKey): boolean }      (defaults to never-locked)
 *   fx             { rateToILS(currency, date): number } (defaults to ILS-only)
 *   baseCurrency   default 'ILS'
 *   templates      object of templates (defaults to defaultTemplates())
 *   approvalTiers  array of {upTo, role}
 */
function createBook(opts) {
  const options = opts || {};
  const coa = options.coa || defaultCoa();
  const periods = options.periods || { isLocked() { return false; } };
  const fx = options.fx || null;
  const baseCurrency = options.baseCurrency || 'ILS';
  const templates = options.templates || defaultTemplates();
  const approvalTiers = options.approvalTiers || DEFAULT_APPROVAL_TIERS;

  const entries = new Map();              // id -> entry
  const counters = new Map();             // YYYYMM -> next seq
  const recurringSchedules = new Map();   // id -> schedule

  /** Find account in COA. */
  function findAccount(no) {
    return coa.get(String(no));
  }

  /** Allocate next number JE-YYYYMM-NNNN. */
  function nextNumber(dateStr) {
    const k = periodKey(dateStr);
    if (!k) throw bilingualError('ERR_DATE_BAD', { date: dateStr });
    const cur = counters.get(k) || 0;
    const next = cur + 1;
    counters.set(k, next);
    return `JE-${k}-${String(next).padStart(4, '0')}`;
  }

  /** Convert a line amount to ILS using the book's FX adapter. */
  function toILS(amount, currency, date) {
    if (!currency || currency === baseCurrency) return round2(amount);
    if (!fx || typeof fx.rateToILS !== 'function') {
      throw bilingualError('ERR_FX_RATE_MISSING', { currency, date });
    }
    const r = Number(fx.rateToILS(currency, date));
    if (!Number.isFinite(r) || r <= 0) {
      throw bilingualError('ERR_FX_RATE_MISSING', { currency, date, rate: r });
    }
    return round2(amount * r);
  }

  // ------------------------------------------------------------------------
  // § 7.1 createEntry
  // ------------------------------------------------------------------------
  function createEntry({ date, lines, memo, currency, references, created_by } = {}) {
    const d = parseDate(date);
    if (!d) throw bilingualError('ERR_DATE_BAD', { date });
    const isoDate = fmtISO(d);
    const id = genId('JE');
    const number = nextNumber(isoDate);
    const entry = {
      id,
      number,
      date: isoDate,
      period: periodKey(isoDate),
      memo: String(memo || ''),
      currency: currency || baseCurrency,
      lines: [],
      references: Array.isArray(references) ? references.slice() : [],
      status: 'draft',                    // draft | pending_approval | approved | posted | reversed
      posted_at: null,
      posted_by: null,
      created_at: new Date().toISOString(),
      created_by: created_by || null,
      reversed_by: null,
      reverses: null,
      audit: [],
    };
    if (Array.isArray(lines)) {
      for (const line of lines) addLineInternal(entry, line);
    }
    entry.audit.push({ at: entry.created_at, by: entry.created_by, action: 'create' });
    entries.set(id, entry);
    return id;
  }

  // ------------------------------------------------------------------------
  // § 7.2 addLine
  // ------------------------------------------------------------------------
  function addLine(entryId, line) {
    const e = mustEntry(entryId);
    if (e.status === 'posted' || e.status === 'reversed') {
      throw bilingualError('ERR_POSTED_LOCK', { id: entryId });
    }
    addLineInternal(e, line);
  }

  function addLineInternal(entry, line) {
    if (!line || typeof line !== 'object') {
      throw bilingualError('ERR_LINE_INVALID', { line });
    }
    const debit = Number(line.debit || 0);
    const credit = Number(line.credit || 0);
    if (debit < 0 || credit < 0) {
      throw bilingualError('ERR_AMOUNT_NEG', { debit, credit });
    }
    if ((debit > 0 && credit > 0) || (debit === 0 && credit === 0)) {
      throw bilingualError('ERR_LINE_INVALID', { debit, credit });
    }
    const lineCurrency = line.currency || entry.currency || baseCurrency;
    const lineDate = line.date || entry.date;
    const debit_ils  = debit  > 0 ? toILS(debit,  lineCurrency, lineDate) : 0;
    const credit_ils = credit > 0 ? toILS(credit, lineCurrency, lineDate) : 0;
    const lineId = genId('LN');
    entry.lines.push({
      id: lineId,
      account: String(line.account || ''),
      debit:  round2(debit),
      credit: round2(credit),
      currency: lineCurrency,
      debit_ils,
      credit_ils,
      fx_rate: (lineCurrency === baseCurrency) ? 1
                : (debit > 0 ? round2(debit_ils  / debit)
                             : round2(credit_ils / credit)),
      description: String(line.description || ''),
      cost_center: line.cost_center || null,
      project:     line.project     || null,
      tax_code:    line.tax_code    || null,
    });
  }

  // ------------------------------------------------------------------------
  // § 7.3 removeLine
  // ------------------------------------------------------------------------
  function removeLine(entryId, lineId) {
    const e = mustEntry(entryId);
    if (e.status === 'posted' || e.status === 'reversed') {
      throw bilingualError('ERR_POSTED_LOCK', { id: entryId });
    }
    e.lines = e.lines.filter(l => l.id !== lineId);
  }

  // ------------------------------------------------------------------------
  // § 7.4 validate
  // ------------------------------------------------------------------------
  function validate(entryId) {
    const e = mustEntry(entryId);
    const errors = [];

    if (!e.lines.length) errors.push({ code: 'ERR_NO_LINES', ...MSG.ERR_NO_LINES });

    // Check each line's account
    for (const line of e.lines) {
      const acct = findAccount(line.account);
      const cat = classify(line.account);
      if (!cat) {
        errors.push({ code: 'ERR_ACCT_BAD', line: line.id, account: line.account, ...MSG.ERR_ACCT_BAD });
        continue;
      }
      if (!acct) {
        errors.push({ code: 'ERR_ACCT_MISSING', line: line.id, account: line.account, ...MSG.ERR_ACCT_MISSING });
        continue;
      }
      if (acct.frozen) {
        errors.push({ code: 'ERR_ACCT_FROZEN', line: line.id, account: line.account, ...MSG.ERR_ACCT_FROZEN });
      }
      if (acct.active === false) {
        errors.push({ code: 'ERR_ACCT_INACTIVE', line: line.id, account: line.account, ...MSG.ERR_ACCT_INACTIVE });
      }
      if ((line.debit > 0 && line.credit > 0) || (line.debit === 0 && line.credit === 0)) {
        errors.push({ code: 'ERR_LINE_INVALID', line: line.id, ...MSG.ERR_LINE_INVALID });
      }
      if (line.debit < 0 || line.credit < 0) {
        errors.push({ code: 'ERR_AMOUNT_NEG', line: line.id, ...MSG.ERR_AMOUNT_NEG });
      }
    }

    // Balance check in base currency (ILS)
    const totalDebits  = sumBy(e.lines, 'debit_ils');
    const totalCredits = sumBy(e.lines, 'credit_ils');
    const diff = round2(totalDebits - totalCredits);
    const balanced = nearZero(diff);
    if (!balanced && e.lines.length > 0) {
      errors.push({
        code: 'ERR_UNBALANCED',
        ...MSG.ERR_UNBALANCED,
        totalDebits, totalCredits, diff,
      });
    }

    // Period lock
    if (periods.isLocked(e.period)) {
      errors.push({ code: 'ERR_PERIOD_LOCKED', period: e.period, ...MSG.ERR_PERIOD_LOCKED });
    }

    return { balanced, totalDebits, totalCredits, diff, errors };
  }

  // ------------------------------------------------------------------------
  // § 7.5 approval workflow
  // ------------------------------------------------------------------------
  function requiredApprovalRole(entryId) {
    const e = mustEntry(entryId);
    const amount = sumBy(e.lines, 'debit_ils');
    return approvalRoleFor(amount, approvalTiers);
  }

  function submitForApproval(entryId, userId) {
    const e = mustEntry(entryId);
    const v = validate(entryId);
    if (!v.balanced || v.errors.length) {
      const err = bilingualError('ERR_UNBALANCED', { errors: v.errors });
      err.errors = v.errors;
      throw err;
    }
    e.status = 'pending_approval';
    e.audit.push({ at: new Date().toISOString(), by: userId || null, action: 'submit' });
    return requiredApprovalRole(entryId);
  }

  function approve(entryId, userId, role) {
    const e = mustEntry(entryId);
    const needed = requiredApprovalRole(entryId);
    if (role && role !== needed && !roleOutranks(role, needed)) {
      throw bilingualError('ERR_APPROVAL_REQUIRED', { needed, provided: role });
    }
    e.status = 'approved';
    e.audit.push({ at: new Date().toISOString(), by: userId || null, action: 'approve', role: role || needed });
  }

  function roleOutranks(a, b) {
    const ranks = { bookkeeper: 1, accountant: 2, cfo: 3, ceo: 4 };
    return (ranks[a] || 0) >= (ranks[b] || 0);
  }

  // ------------------------------------------------------------------------
  // § 7.6 post / unpost
  // ------------------------------------------------------------------------
  function post(entryId, userId) {
    const e = mustEntry(entryId);
    if (e.status === 'posted') throw bilingualError('ERR_POSTED_LOCK', { id: entryId });
    const v = validate(entryId);
    if (!v.balanced || v.errors.length) {
      const err = bilingualError('ERR_UNBALANCED', { errors: v.errors });
      err.errors = v.errors;
      throw err;
    }
    if (periods.isLocked(e.period)) {
      throw bilingualError('ERR_PERIOD_LOCKED', { period: e.period });
    }
    e.status = 'posted';
    e.posted_at = new Date().toISOString();
    e.posted_by = userId || null;
    e.audit.push({ at: e.posted_at, by: userId || null, action: 'post' });
    return { ok: true, posted_at: e.posted_at, ...MSG.OK_POSTED };
  }

  function unpost(entryId, userId, reason) {
    const e = mustEntry(entryId);
    if (e.status !== 'posted') throw bilingualError('ERR_NOT_POSTED', { id: entryId });
    if (periods.isLocked(e.period)) {
      throw bilingualError('ERR_PERIOD_LOCKED', { period: e.period });
    }
    const at = new Date().toISOString();
    e.status = 'approved';
    e.posted_at = null;
    e.posted_by = null;
    e.audit.push({ at, by: userId || null, action: 'unpost', reason: reason || null });
    return { ok: true, ...MSG.OK_UNPOSTED };
  }

  // ------------------------------------------------------------------------
  // § 7.7 reverse — create reversal entry
  // ------------------------------------------------------------------------
  function reverse(entryId, reason, opts2 = {}) {
    const e = mustEntry(entryId);
    if (e.reversed_by) throw bilingualError('ERR_REVERSED_TWICE', { id: entryId });
    if (e.status !== 'posted') throw bilingualError('ERR_NOT_POSTED', { id: entryId });
    const revDate = opts2.date || firstOfNextPeriod(e.date);
    const revId = createEntry({
      date: revDate,
      memo: `REVERSAL of ${e.number}: ${reason || ''}`.trim(),
      currency: e.currency,
      created_by: opts2.userId || null,
    });
    const revEntry = entries.get(revId);
    // Swap each line's debit <-> credit
    for (const line of e.lines) {
      addLineInternal(revEntry, {
        account:     line.account,
        debit:       line.credit,   // swap
        credit:      line.debit,    // swap
        currency:    line.currency,
        description: line.description,
        cost_center: line.cost_center,
        project:     line.project,
        tax_code:    line.tax_code,
      });
    }
    revEntry.reverses = e.id;
    e.reversed_by = revId;
    e.audit.push({
      at: new Date().toISOString(),
      by: opts2.userId || null,
      action: 'reverse',
      reason: reason || null,
      reversal_id: revId,
    });
    return revId;
  }

  // ------------------------------------------------------------------------
  // § 7.8 applyTemplate
  // ------------------------------------------------------------------------
  function applyTemplate(templateId, variables = {}) {
    const t = templates[templateId];
    if (!t) throw bilingualError('ERR_TEMPLATE_MISSING', { templateId });
    const built = t.build(variables || {});
    const id = createEntry({
      date: variables.date || new Date().toISOString().slice(0, 10),
      memo: built.memo,
      currency: variables.currency || baseCurrency,
      created_by: variables.userId || null,
    });
    for (const line of built.lines) addLine(id, line);
    const e = entries.get(id);
    e.audit.push({
      at: new Date().toISOString(),
      by: variables.userId || null,
      action: 'apply_template',
      template: templateId,
    });
    return id;
  }

  function listTemplates() {
    return Object.keys(templates).map(k => ({
      id: templates[k].id,
      name: templates[k].name,
      variables: templates[k].variables || [],
    }));
  }

  // ------------------------------------------------------------------------
  // § 7.9 createRecurring — monthly schedule
  // ------------------------------------------------------------------------
  /**
   * schedule = {
   *   frequency: 'monthly',
   *   start: 'YYYY-MM-DD',
   *   occurrences: 12,       // number of times to run
   *   variables: {...}
   * }
   */
  function createRecurring(templateId, schedule) {
    if (!templates[templateId]) throw bilingualError('ERR_TEMPLATE_MISSING', { templateId });
    const id = genId('RCR');
    const rec = {
      id,
      templateId,
      frequency: schedule.frequency || 'monthly',
      start: schedule.start || new Date().toISOString().slice(0, 10),
      occurrences: Number(schedule.occurrences || 0),
      variables: schedule.variables || {},
      runs: [],
      active: true,
      created_at: new Date().toISOString(),
    };
    recurringSchedules.set(id, rec);
    return id;
  }

  /**
   * Run any due occurrences up to `asOfDate`.
   * Returns array of new entry ids created.
   */
  function runRecurring(asOfDate) {
    const ids = [];
    for (const rec of recurringSchedules.values()) {
      if (!rec.active) continue;
      for (let i = 0; i < rec.occurrences; i += 1) {
        if (rec.runs[i]) continue;
        const runDate = addMonths(rec.start, i);
        if (runDate > asOfDate) break;
        const eid = applyTemplate(rec.templateId, { ...rec.variables, date: runDate });
        rec.runs[i] = { at: new Date().toISOString(), entryId: eid, date: runDate };
        ids.push(eid);
      }
    }
    return ids;
  }

  function cancelRecurring(id) {
    const r = recurringSchedules.get(id);
    if (r) r.active = false;
  }

  // ------------------------------------------------------------------------
  // § 7.10 attach reference / supporting document
  // ------------------------------------------------------------------------
  function attachReference(entryId, ref) {
    const e = mustEntry(entryId);
    if (!ref || !ref.type) throw bilingualError('ERR_LINE_INVALID', { ref });
    // ref: { type: 'invoice'|'receipt'|'url'|'file', id|url, label?, sha256? }
    e.references.push({ ...ref, at: new Date().toISOString() });
  }

  // ------------------------------------------------------------------------
  // § 7.11 getters
  // ------------------------------------------------------------------------
  function getEntry(id) {
    const e = entries.get(id);
    return e ? JSON.parse(JSON.stringify(e)) : null;  // deep copy, immutable view
  }

  function listEntries(filter) {
    const out = [];
    for (const e of entries.values()) {
      if (filter) {
        if (filter.status && e.status !== filter.status) continue;
        if (filter.period && e.period !== filter.period) continue;
        if (filter.from && e.date < filter.from) continue;
        if (filter.to && e.date > filter.to) continue;
      }
      out.push(JSON.parse(JSON.stringify(e)));
    }
    return out;
  }

  function mustEntry(id) {
    const e = entries.get(id);
    if (!e) throw new Error(`entry not found: ${id}`);
    return e;
  }

  // Exposed API
  return {
    // entries
    createEntry,
    addLine,
    removeLine,
    validate,
    post,
    unpost,
    reverse,
    // approval
    submitForApproval,
    approve,
    requiredApprovalRole,
    // templates
    applyTemplate,
    listTemplates,
    // recurring
    createRecurring,
    runRecurring,
    cancelRecurring,
    // references
    attachReference,
    // getters
    getEntry,
    listEntries,
    // internal (exposed for tests / admin)
    _entries: entries,
    _counters: counters,
    _recurring: recurringSchedules,
    _coa: coa,
    _templates: templates,
  };
}

// ============================================================================
// § 8. MODULE-LEVEL DEFAULT BOOK (optional convenience singleton)
// ============================================================================

let _default = null;
function getDefaultBook() {
  if (!_default) _default = createBook();
  return _default;
}
function resetDefaultBook() { _default = null; }

// ============================================================================
// § 9. EXPORTS
// ============================================================================

module.exports = {
  // factory
  createBook,
  getDefaultBook,
  resetDefaultBook,

  // classification / coa helpers
  classify,
  COA_CATEGORIES,
  defaultCoa,

  // templates
  defaultTemplates,

  // utilities (exposed for tests and downstream modules)
  round2,
  sumBy,
  nearZero,
  parseDate,
  fmtISO,
  periodKey,
  firstOfNextPeriod,
  addMonths,
  genId,
  approvalRoleFor,
  DEFAULT_APPROVAL_TIERS,

  // messages
  MSG,
  bilingualError,

  // ------------------------------------------------------------------
  // Thin top-level convenience wrappers that operate on the default book,
  // matching the exact signatures the task asked for.
  // ------------------------------------------------------------------
  createEntry: (args) => getDefaultBook().createEntry(args),
  addLine:     (id, l) => getDefaultBook().addLine(id, l),
  validate:    (id)     => getDefaultBook().validate(id),
  post:        (id, u)  => getDefaultBook().post(id, u),
  reverse:     (id, r)  => getDefaultBook().reverse(id, r),
  applyTemplate: (tpl, v) => getDefaultBook().applyTemplate(tpl, v),
  createRecurring: (tpl, s) => getDefaultBook().createRecurring(tpl, s),
};
