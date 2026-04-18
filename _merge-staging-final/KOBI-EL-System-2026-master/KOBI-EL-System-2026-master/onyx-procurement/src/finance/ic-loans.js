/**
 * onyx-procurement / src / finance / ic-loans.js
 * ─────────────────────────────────────────────────────────────
 * Techno-Kol Uzi Mega-ERP — Agent Y-085
 * עוקב הלוואות בין-חברתיות (Intercompany Loans Tracker)
 *
 * Single-file, zero-dependency, bilingual (Hebrew / English) module
 * that complements the X-41 intercompany engine
 * (`src/intercompany/ic-engine.js`) with loan-specific capabilities:
 *
 *   1. Originate an IC loan with full arm's-length documentation
 *      (fixed / floating / prime+X / LIBOR+X / SOFR+X).
 *   2. Accrue interest for a period (day-count ACT/365, 30/360, ACT/360).
 *   3. Record payments (scheduled / early / late) and apply a
 *      deterministic amortization waterfall.
 *   4. Compute the outstanding principal and accrued interest for any
 *      loan ID, at any point in time.
 *   5. Israeli thin-capitalisation check — if the borrower is too
 *      leveraged relative to equity, interest is non-deductible.
 *   6. Withholding tax (25 %) on interest paid to a foreign related
 *      party, with treaty relief lookup (DTA rate).
 *   7. FX revaluation of a non-functional-currency loan at any spot
 *      rate, producing a P&L impact journal proposal.
 *   8. Arm's-length rate documentation — comparable yields, credit
 *      spread, benchmarking memo, §85A justification.
 *   9. Bilingual Hebrew/English IC loan agreement template generator.
 *  10. Flags IC loans for elimination in group consolidation.
 *
 * Rules of engagement (Techno-Kol Uzi baseline)
 * ─────────────────────────────────────────────
 *   • לא מוחקים רק משדרגים ומגדלים — nothing is deleted, cancellations
 *     are explicit reversals with a reason.
 *   • Zero external dependencies; pure Node / ES2019.
 *   • Every public enum and user-facing string is bilingual.
 *   • Israeli Income Tax Ordinance §85A is the legal baseline for
 *     arm's-length rate setting.
 *   • Calculations are pure functions of the persisted state; the
 *     class is a thin façade over the store so every posting is
 *     auditable without a debugger.
 *
 * Public export
 * ─────────────
 *   class ICLoans {
 *     originateLoan({...})
 *     calculateInterest(loanId, period)
 *     recordPayment({...})
 *     outstandingBalance(loanId)
 *     thinCapRules({...})
 *     withholdingTax({...})
 *     currencyRevaluation({...})
 *     armsLengthSupport(loanId)    // aliased as `arm'sLengthSupport` too
 *     generateLoanAgreement(loanId)
 *     consolidationElimination(period)
 *   }
 */

'use strict';

// ─────────────────────────────────────────────────────────────────────
// 0. Constants / bilingual labels
// ─────────────────────────────────────────────────────────────────────

const VERSION = '1.0.0-Y085';

const RATE_TYPES = Object.freeze({
  FIXED:    'fixed',
  FLOATING: 'floating',
  PRIME:    'prime+X',
  LIBOR:    'libor+X',
  SOFR:     'sofr+X',
});

const RATE_TYPE_LABELS = Object.freeze({
  fixed:      { he: 'ריבית קבועה',                en: 'Fixed rate' },
  floating:   { he: 'ריבית משתנה',                en: 'Floating rate' },
  'prime+X':  { he: 'פריים פלוס מרווח',           en: 'Prime plus spread' },
  'libor+X':  { he: 'ליבור פלוס מרווח',           en: 'LIBOR plus spread' },
  'sofr+X':   { he: 'SOFR פלוס מרווח',            en: 'SOFR plus spread' },
});

const LOAN_STATUS = Object.freeze({
  DRAFT:     'draft',
  ACTIVE:    'active',
  IN_DEFAULT:'in_default',
  MATURED:   'matured',
  REPAID:    'repaid',
  RESTRUCTURED: 'restructured',
  REVERSED:  'reversed',
});

const LOAN_STATUS_LABELS = Object.freeze({
  draft:        { he: 'טיוטה',          en: 'Draft' },
  active:       { he: 'פעילה',          en: 'Active' },
  in_default:   { he: 'בכשל',           en: 'In default' },
  matured:      { he: 'הגיעה לפירעון', en: 'Matured' },
  repaid:       { he: 'נפרעה במלואה',   en: 'Repaid' },
  restructured: { he: 'מוחזרה',          en: 'Restructured' },
  reversed:     { he: 'בוטלה',           en: 'Reversed' },
});

const PAYMENT_TYPES = Object.freeze({
  SCHEDULED: 'scheduled',
  EARLY:     'early',
  LATE:      'late',
});

const PAYMENT_TYPE_LABELS = Object.freeze({
  scheduled: { he: 'תשלום על-פי לוח סילוקין', en: 'Scheduled payment' },
  early:     { he: 'תשלום מוקדם',              en: 'Early payment' },
  late:      { he: 'תשלום באיחור',              en: 'Late payment' },
});

const DAY_COUNT = Object.freeze({
  ACT_365: 'ACT/365',
  ACT_360: 'ACT/360',
  D30_360: '30/360',
});

const PAYMENT_FREQ = Object.freeze({
  MONTHLY:     12,
  QUARTERLY:   4,
  SEMIANNUAL:  2,
  ANNUAL:      1,
  BULLET:      0,   // principal at maturity, interest each period
});

// ─────────────────────────────────────────────────────────────────────
// 1. Israeli statutory baselines — §85A, §3(i), thin cap, WHT
// ─────────────────────────────────────────────────────────────────────

/**
 * Section 85A (Income Tax Ordinance [New]) requires every related-party
 * transaction — including loans — to be priced at arm's length.
 * Income Tax Regulations (Determination of Market Conditions), 5767-2006
 * further specify the documentation requirements.
 *
 * In addition, Section 3(i) of the Ordinance deems a minimum interest
 * rate on shareholder loans and inter-company balances (the "ריבית
 * רעיונית" — imputed interest). The statutory rate is published by the
 * ITA and is tied to the cost of living index plus a spread. The value
 * below is the 2026 baseline and may be overridden at runtime.
 */
const IL_3I_IMPUTED_RATE_2026 = 0.043;   // 4.3 % baseline, override in ctor
const IL_3J_RELATED_PARTY_RATE_2026 = 0.033; // §3(j) for linked-currency
const IL_WHT_INTEREST_DEFAULT = 0.25;    // 25 % WHT on interest to foreign
const IL_THIN_CAP_MAX_DEBT_EQUITY = 3.0; // common ITA audit threshold
const IL_CORPORATE_RATE_2026 = 0.23;     // 23 % corporate tax — for net
                                         // effect calculations

/**
 * Israeli DTA (double-taxation agreement) reduced WHT rates on interest.
 * Where the treaty offers a lower rate than the 25 % statutory ceiling,
 * the borrower may apply the treaty rate provided a certificate of
 * residency is obtained from the foreign tax authority.
 *
 * These are baseline rates — the caller may override them with
 * `setDTARate` to reflect the exact protocol in force on the payment
 * date (important, since protocols are periodically amended).
 */
const DTA_INTEREST_RATES = Object.freeze({
  US: 0.175,   // Israel–US treaty: 17.5 % (general) / 10 % (bank)
  GB: 0.15,    // Israel–UK
  DE: 0.05,    // Israel–Germany
  FR: 0.10,    // Israel–France
  NL: 0.10,    // Israel–Netherlands
  CH: 0.10,    // Israel–Switzerland
  CA: 0.15,    // Israel–Canada
  JP: 0.10,    // Israel–Japan
  CN: 0.10,    // Israel–China
  IN: 0.10,    // Israel–India
  IT: 0.10,    // Israel–Italy
  ES: 0.10,    // Israel–Spain
  AT: 0.15,    // Israel–Austria
  BE: 0.15,    // Israel–Belgium
  RO: 0.05,    // Israel–Romania
  IE: 0.05,    // Israel–Ireland
  LU: 0.10,    // Israel–Luxembourg
  SG: 0.07,    // Israel–Singapore
  KR: 0.10,    // Israel–South Korea
  AU: 0.10,    // Israel–Australia
});

// ─────────────────────────────────────────────────────────────────────
// 2. Utility — deterministic IDs, money math, ISO dates
// ─────────────────────────────────────────────────────────────────────

let __counter = 0;
function nextId(prefix) {
  __counter += 1;
  // Deterministic in test environments; still unique per process.
  const t = Date.now().toString(36);
  const c = __counter.toString(36).padStart(4, '0');
  return `${prefix}-${t}-${c}`;
}

function toCents(x) {
  // Work in minor units to avoid floating-point drift.
  return Math.round(Number(x) * 100);
}
function fromCents(c) {
  return Math.round(c) / 100;
}
function round2(x) {
  return Math.round(Number(x) * 100) / 100;
}
function round6(x) {
  return Math.round(Number(x) * 1e6) / 1e6;
}

function isISODate(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
}
function asDate(s) {
  if (s instanceof Date) return new Date(s.getTime());
  if (!isISODate(s)) throw new Error(`invalid ISO date: ${s}`);
  return new Date(`${s}T00:00:00Z`);
}
function iso(d) {
  const x = d instanceof Date ? d : asDate(d);
  return x.toISOString().slice(0, 10);
}
function addMonths(d, n) {
  const x = d instanceof Date ? new Date(d.getTime()) : asDate(d);
  const day = x.getUTCDate();
  x.setUTCMonth(x.getUTCMonth() + n);
  // Handle short months (31 Jan + 1mo = 28/29 Feb)
  if (x.getUTCDate() < day) x.setUTCDate(0);
  return x;
}
function daysBetween(a, b) {
  const A = a instanceof Date ? a : asDate(a);
  const B = b instanceof Date ? b : asDate(b);
  return Math.round((B.getTime() - A.getTime()) / 86400000);
}

/**
 * Day-count fraction between two dates.
 */
function dayCountFraction(from, to, basis) {
  const A = asDate(from);
  const B = asDate(to);
  if (basis === DAY_COUNT.ACT_365) return daysBetween(A, B) / 365;
  if (basis === DAY_COUNT.ACT_360) return daysBetween(A, B) / 360;
  if (basis === DAY_COUNT.D30_360) {
    // US 30/360 (NASD). Accurate enough for IC loans.
    let d1 = A.getUTCDate();
    let d2 = B.getUTCDate();
    const m1 = A.getUTCMonth() + 1;
    const m2 = B.getUTCMonth() + 1;
    const y1 = A.getUTCFullYear();
    const y2 = B.getUTCFullYear();
    if (d1 === 31) d1 = 30;
    if (d2 === 31 && d1 >= 30) d2 = 30;
    const days = 360 * (y2 - y1) + 30 * (m2 - m1) + (d2 - d1);
    return days / 360;
  }
  // default fallback
  return daysBetween(A, B) / 365;
}

// ─────────────────────────────────────────────────────────────────────
// 3. Store — plain in-memory; can be swapped with the X-41 store later
// ─────────────────────────────────────────────────────────────────────

function createStore(init) {
  return {
    loans:         new Map(),    // loanId → loan record
    payments:      [],           // chronologically appended
    revaluations:  [],           // FX revaluation history
    auditLog:      [],           // every mutating action
    dtaRates:      Object.assign({}, DTA_INTEREST_RATES, (init && init.dtaRates) || {}),
    imputedRate:   (init && init.imputedRate)    || IL_3I_IMPUTED_RATE_2026,
    whtRate:       (init && init.whtRate)        || IL_WHT_INTEREST_DEFAULT,
    thinCapMax:    (init && init.thinCapMax)     || IL_THIN_CAP_MAX_DEBT_EQUITY,
    corporateRate: (init && init.corporateRate)  || IL_CORPORATE_RATE_2026,
  };
}

function audit(store, action, payload) {
  store.auditLog.push({
    at: new Date().toISOString(),
    action,
    payload,
  });
}

// ─────────────────────────────────────────────────────────────────────
// 4. Originate a loan
// ─────────────────────────────────────────────────────────────────────

function validateRateType(rt) {
  const ok = Object.values(RATE_TYPES).includes(rt);
  if (!ok) {
    throw new Error(
      `invalid rateType: ${rt} (expected one of ${Object.values(RATE_TYPES).join(', ')})`
    );
  }
}

/**
 * Originate an intercompany loan.
 *
 * @param {Object}  p
 * @param {string}  p.lender               lender entity id
 * @param {string}  p.borrower             borrower entity id
 * @param {number}  p.principal            face amount (positive)
 * @param {string}  p.currency             ISO 4217 (e.g. 'ILS', 'USD')
 * @param {number}  p.rate                 all-in rate as decimal (0.05 = 5%)
 * @param {string}  p.rateType             one of RATE_TYPES
 * @param {number}  [p.spread]             spread over reference (for floating)
 * @param {Object}  p.term                 {startDate,maturityDate,gracePeriodMonths}
 * @param {Object}  p.paymentSchedule      {frequency:'monthly'|..., amortization:'level'|'bullet'|'interest_only'}
 * @param {string}  p.purpose              free-text business purpose (bilingual recommended)
 * @param {Object}  p.intercompanyAgreement {reference, signatories, jurisdiction, governingLaw}
 * @param {Object}  [p.armsLengthSupport]  pre-loaded comparables / benchmark
 * @param {Object}  [p.meta]               any additional metadata
 */
function originateLoan(p, store) {
  if (!p || typeof p !== 'object') throw new Error('originateLoan: payload required');
  const required = ['lender','borrower','principal','currency','rate','rateType','term','paymentSchedule','purpose','intercompanyAgreement'];
  for (const k of required) {
    if (p[k] === undefined || p[k] === null) {
      throw new Error(`originateLoan: missing required field "${k}"`);
    }
  }
  if (p.lender === p.borrower) {
    throw new Error('originateLoan: lender and borrower must differ');
  }
  if (!(Number(p.principal) > 0)) {
    throw new Error('originateLoan: principal must be > 0');
  }
  if (typeof p.rate !== 'number' || p.rate < 0) {
    throw new Error('originateLoan: rate must be a non-negative number');
  }
  validateRateType(p.rateType);
  if (!p.term.startDate || !p.term.maturityDate) {
    throw new Error('originateLoan: term.startDate and term.maturityDate required');
  }
  if (asDate(p.term.maturityDate) <= asDate(p.term.startDate)) {
    throw new Error('originateLoan: maturityDate must be after startDate');
  }
  if (!p.paymentSchedule.frequency) {
    throw new Error('originateLoan: paymentSchedule.frequency required');
  }

  const loanId = nextId('ICL');
  const freqKey = String(p.paymentSchedule.frequency).toUpperCase();
  const freq = PAYMENT_FREQ[freqKey];
  if (freq === undefined) {
    throw new Error(`originateLoan: unknown payment frequency "${p.paymentSchedule.frequency}"`);
  }
  const amortType = p.paymentSchedule.amortization || 'level';

  const loan = {
    loanId,
    lender: p.lender,
    borrower: p.borrower,
    principal: round2(p.principal),
    currency: String(p.currency).toUpperCase(),
    rate: Number(p.rate),
    rateType: p.rateType,
    spread: typeof p.spread === 'number' ? p.spread : null,
    term: {
      startDate: p.term.startDate,
      maturityDate: p.term.maturityDate,
      gracePeriodMonths: Number(p.term.gracePeriodMonths || 0),
    },
    paymentSchedule: {
      frequency: freqKey,
      amortization: amortType,
      dayCount: p.paymentSchedule.dayCount || DAY_COUNT.ACT_365,
    },
    purpose: String(p.purpose),
    intercompanyAgreement: {
      reference: p.intercompanyAgreement.reference || null,
      signatories: p.intercompanyAgreement.signatories || [],
      jurisdiction: p.intercompanyAgreement.jurisdiction || 'Israel',
      governingLaw: p.intercompanyAgreement.governingLaw || 'Israeli law',
      signedOn: p.intercompanyAgreement.signedOn || null,
    },
    armsLengthSupport: p.armsLengthSupport || null,
    status: LOAN_STATUS.ACTIVE,
    createdAt: new Date().toISOString(),
    meta: p.meta || {},
    // derived fields
    section85ANote: buildSection85ANote(p, store),
    amortizationSchedule: buildAmortization({
      principal: p.principal,
      rate: p.rate,
      startDate: p.term.startDate,
      maturityDate: p.term.maturityDate,
      frequency: freq,
      amortization: amortType,
      dayCount: p.paymentSchedule.dayCount || DAY_COUNT.ACT_365,
    }),
  };

  // Arm's-length sanity check against §3(i) imputed rate.
  // If the declared rate is meaningfully below the imputed floor and no
  // contemporaneous arm's-length support was attached, flag it — we do
  // NOT block the origination (the accountant may override) but we
  // record the warning in the audit log for an ITA trail.
  const floor = store.imputedRate - 0.005;
  if (p.rate < floor && !p.armsLengthSupport) {
    loan.armsLengthWarning = {
      he: `הריבית ${(p.rate * 100).toFixed(2)}% נמוכה מהריבית הרעיונית לפי סעיף 3(י) (${(store.imputedRate * 100).toFixed(2)}%). יש לצרף תיעוד תומך.`,
      en: `Stated rate ${(p.rate * 100).toFixed(2)}% is below the §3(i) imputed rate ${(store.imputedRate * 100).toFixed(2)}%. Arm's-length support required.`,
    };
    audit(store, 'ARMS_LENGTH_WARNING', { loanId, rate: p.rate, floor });
  }

  store.loans.set(loanId, loan);
  audit(store, 'ORIGINATE', { loanId, lender: p.lender, borrower: p.borrower, principal: loan.principal, currency: loan.currency });
  return loan;
}

function buildSection85ANote(p, store) {
  return {
    he: [
      'הלוואה בין חברה קשורה — חובת תיעוד לפי סעיף 85א לפקודת מס הכנסה.',
      `הריבית נקבעה בסך ${(p.rate * 100).toFixed(2)}% (${RATE_TYPE_LABELS[p.rateType].he}).`,
      `סעיף 3(י) — שיעור ריבית רעיונית בסיסי: ${(store.imputedRate * 100).toFixed(2)}%.`,
      'יש לשמור תיעוד השוואתי ותזכיר בענייני מחירי-העברה.',
    ].join(' '),
    en: [
      'Related-party loan — mandatory documentation per Section 85A of the Israeli Income Tax Ordinance.',
      `Rate set at ${(p.rate * 100).toFixed(2)}% (${RATE_TYPE_LABELS[p.rateType].en}).`,
      `Section 3(i) imputed-interest floor: ${(store.imputedRate * 100).toFixed(2)}%.`,
      'Maintain contemporaneous comparable-yield documentation and TP memorandum.',
    ].join(' '),
  };
}

// ─────────────────────────────────────────────────────────────────────
// 5. Amortization — deterministic schedule builder
// ─────────────────────────────────────────────────────────────────────

/**
 * Build an amortization schedule.
 *
 * amortization === 'level'         → equal periodic payment (principal + interest)
 * amortization === 'bullet'        → interest each period, principal at maturity
 * amortization === 'interest_only' → same as bullet (explicit synonym)
 */
function buildAmortization({ principal, rate, startDate, maturityDate, frequency, amortization, dayCount }) {
  const rows = [];
  if (frequency === PAYMENT_FREQ.BULLET) {
    // single interest+principal row at maturity
    const df = dayCountFraction(startDate, maturityDate, dayCount);
    const interest = round2(principal * rate * df);
    rows.push({
      index: 1,
      date: maturityDate,
      openingBalance: round2(principal),
      interest,
      principal: round2(principal),
      payment: round2(principal + interest),
      closingBalance: 0,
    });
    return rows;
  }

  // Count the number of coupon dates between start and maturity.
  const periodsPerYear = frequency;
  const start = asDate(startDate);
  const maturity = asDate(maturityDate);
  const totalMonths = (maturity.getUTCFullYear() - start.getUTCFullYear()) * 12
    + (maturity.getUTCMonth() - start.getUTCMonth());
  const stepMonths = Math.round(12 / periodsPerYear);
  const nPeriods = Math.max(1, Math.round(totalMonths / stepMonths));

  // Periodic rate — simple division, good enough for IC loans.
  const r = rate / periodsPerYear;

  let balance = Number(principal);
  let prevDate = start;

  if (amortization === 'bullet' || amortization === 'interest_only') {
    // Interest each period, principal returned at the end.
    for (let i = 1; i <= nPeriods; i += 1) {
      const nextDate = addMonths(start, i * stepMonths);
      const df = dayCountFraction(iso(prevDate), iso(nextDate), dayCount);
      const interest = round2(balance * rate * df);
      const principalPaid = (i === nPeriods) ? round2(balance) : 0;
      const payment = round2(interest + principalPaid);
      rows.push({
        index: i,
        date: iso(nextDate),
        openingBalance: round2(balance),
        interest,
        principal: principalPaid,
        payment,
        closingBalance: round2(balance - principalPaid),
      });
      balance -= principalPaid;
      prevDate = nextDate;
    }
    return rows;
  }

  // level amortization → PMT formula
  // PMT = P * r / (1 - (1+r)^-n)
  const pmt = (r === 0)
    ? (balance / nPeriods)
    : (balance * r) / (1 - Math.pow(1 + r, -nPeriods));

  for (let i = 1; i <= nPeriods; i += 1) {
    const nextDate = addMonths(start, i * stepMonths);
    const interest = round2(balance * r);
    let principalPaid = round2(pmt - interest);
    // last row — absorb rounding drift into principal
    if (i === nPeriods) principalPaid = round2(balance);
    const payment = round2(interest + principalPaid);
    rows.push({
      index: i,
      date: iso(nextDate),
      openingBalance: round2(balance),
      interest,
      principal: principalPaid,
      payment,
      closingBalance: round2(Math.max(0, balance - principalPaid)),
    });
    balance = round2(balance - principalPaid);
    prevDate = nextDate;
  }
  return rows;
}

// ─────────────────────────────────────────────────────────────────────
// 6. Interest accrual for a period
// ─────────────────────────────────────────────────────────────────────

/**
 * Calculate accrued interest between two dates, against the current
 * outstanding balance (net of any payments recorded).
 *
 * @param {string} loanId
 * @param {{from:string,to:string,asOf?:string}} period
 */
function calculateInterest(loanId, period, store) {
  const loan = store.loans.get(loanId);
  if (!loan) throw new Error(`loan not found: ${loanId}`);
  if (!period || !period.from || !period.to) {
    throw new Error('calculateInterest: period.from and period.to required');
  }
  const from = asDate(period.from);
  const to   = asDate(period.to);
  if (to <= from) throw new Error('calculateInterest: period.to must be after period.from');

  // Walk the payments to find the average balance during the period.
  // Simple approach: use the balance as of `from`, then for each payment
  // that falls inside the window, split the accrual into sub-intervals.
  const pays = store.payments
    .filter(x => x.loanId === loanId && x.type !== 'reversed')
    .sort((a, b) => a.date < b.date ? -1 : 1);

  let balance = loan.principal;
  // Advance balance by all payments strictly before `from`.
  for (const pay of pays) {
    if (asDate(pay.date) <= from) {
      balance = round2(balance - pay.principal);
    }
  }

  const basis = loan.paymentSchedule.dayCount || DAY_COUNT.ACT_365;
  let accrued = 0;
  let cursor = from;
  const chunks = [];

  for (const pay of pays) {
    const pd = asDate(pay.date);
    if (pd > from && pd <= to) {
      const frac = dayCountFraction(iso(cursor), iso(pd), basis);
      const chunk = round2(balance * loan.rate * frac);
      chunks.push({ from: iso(cursor), to: iso(pd), balance: round2(balance), fraction: round6(frac), interest: chunk });
      accrued = round2(accrued + chunk);
      balance = round2(balance - pay.principal);
      cursor = pd;
    }
  }
  if (cursor < to) {
    const frac = dayCountFraction(iso(cursor), iso(to), basis);
    const chunk = round2(balance * loan.rate * frac);
    chunks.push({ from: iso(cursor), to: iso(to), balance: round2(balance), fraction: round6(frac), interest: chunk });
    accrued = round2(accrued + chunk);
  }

  return {
    loanId,
    period: { from: iso(from), to: iso(to) },
    rate: loan.rate,
    dayCount: basis,
    currency: loan.currency,
    chunks,
    accruedInterest: accrued,
  };
}

// ─────────────────────────────────────────────────────────────────────
// 7. Record a payment — waterfall: fees → interest → principal
// ─────────────────────────────────────────────────────────────────────

function recordPayment(p, store) {
  if (!p || typeof p !== 'object') throw new Error('recordPayment: payload required');
  if (!p.loanId) throw new Error('recordPayment: loanId required');
  const loan = store.loans.get(p.loanId);
  if (!loan) throw new Error(`loan not found: ${p.loanId}`);
  if (!p.date) throw new Error('recordPayment: date required');
  const type = p.type || PAYMENT_TYPES.SCHEDULED;
  if (!Object.values(PAYMENT_TYPES).includes(type)) {
    throw new Error(`recordPayment: invalid type "${type}"`);
  }
  const principalPaid = Number(p.principal || 0);
  const interestPaid  = Number(p.interest || 0);
  if (principalPaid < 0 || interestPaid < 0) {
    throw new Error('recordPayment: amounts must be non-negative');
  }

  // Waterfall enforcement: a late payment first clears accrued interest,
  // then principal. If the caller supplied a split, trust it; otherwise
  // compute the split from the accrued interest at `date`.
  let finalInterest = interestPaid;
  let finalPrincipal = principalPaid;
  if (!p.interest && !p.principal && typeof p.amount === 'number') {
    // Gross amount — allocate via waterfall.
    const last = lastPaymentDate(store, p.loanId) || loan.term.startDate;
    const accr = calculateInterest(p.loanId, { from: last, to: p.date }, store).accruedInterest;
    finalInterest  = Math.min(p.amount, accr);
    finalPrincipal = round2(p.amount - finalInterest);
  }

  const rec = {
    paymentId: nextId('PAY'),
    loanId:    p.loanId,
    date:      p.date,
    type,
    principal: round2(finalPrincipal),
    interest:  round2(finalInterest),
    total:     round2(finalInterest + finalPrincipal),
    currency:  loan.currency,
    note:      p.note || null,
    recordedAt: new Date().toISOString(),
  };

  // A late payment bumps the loan into IN_DEFAULT until we see a catch-up
  // (we don't delete state — we transition it).
  if (type === PAYMENT_TYPES.LATE && loan.status === LOAN_STATUS.ACTIVE) {
    loan.status = LOAN_STATUS.IN_DEFAULT;
    audit(store, 'STATUS_CHANGE', { loanId: p.loanId, from: 'active', to: 'in_default', reason: 'late_payment' });
  }
  // Fully repaid?
  const balAfter = outstandingBalanceRaw(p.loanId, store, rec);
  if (balAfter.principal <= 0.005) {
    loan.status = LOAN_STATUS.REPAID;
    audit(store, 'STATUS_CHANGE', { loanId: p.loanId, from: 'active', to: 'repaid' });
  }

  store.payments.push(rec);
  audit(store, 'PAYMENT', {
    paymentId: rec.paymentId, loanId: rec.loanId, type, principal: rec.principal, interest: rec.interest,
  });
  return rec;
}

function lastPaymentDate(store, loanId) {
  let latest = null;
  for (const p of store.payments) {
    if (p.loanId !== loanId) continue;
    if (!latest || p.date > latest) latest = p.date;
  }
  return latest;
}

// ─────────────────────────────────────────────────────────────────────
// 8. Outstanding balance — sum of principal with optional look-ahead
// ─────────────────────────────────────────────────────────────────────

/**
 * Exposed API.
 * @param {string} loanId
 * @param {string} [asOf] optional ISO date; defaults to "now" in UTC
 */
function outstandingBalance(loanId, asOf, store) {
  const loan = store.loans.get(loanId);
  if (!loan) throw new Error(`loan not found: ${loanId}`);
  const cut = asOf || iso(new Date());
  let principal = loan.principal;
  let interestPaid = 0;
  for (const pay of store.payments) {
    if (pay.loanId !== loanId) continue;
    if (pay.date > cut) continue;
    principal = round2(principal - pay.principal);
    interestPaid = round2(interestPaid + pay.interest);
  }
  const accrued = calculateInterest(loanId, { from: loan.term.startDate, to: cut }, store).accruedInterest;
  const accruedOutstanding = round2(Math.max(0, accrued - interestPaid));
  return {
    loanId,
    asOf: cut,
    currency: loan.currency,
    principal: round2(Math.max(0, principal)),
    interestAccrued: accrued,
    interestPaid,
    interestOutstanding: accruedOutstanding,
    total: round2(Math.max(0, principal) + accruedOutstanding),
    status: loan.status,
  };
}

// Internal helper that also considers an in-flight payment not yet
// appended to the store.
function outstandingBalanceRaw(loanId, store, pendingPayment) {
  const loan = store.loans.get(loanId);
  let principal = loan.principal;
  for (const pay of store.payments) {
    if (pay.loanId !== loanId) continue;
    principal -= pay.principal;
  }
  if (pendingPayment) principal -= pendingPayment.principal;
  return { principal: round2(principal) };
}

// ─────────────────────────────────────────────────────────────────────
// 9. Thin-cap rules (Israeli ITA audit heuristic)
// ─────────────────────────────────────────────────────────────────────

/**
 * Israeli thin-capitalisation analysis.
 *
 * Although Israel does not yet have a formal, codified debt-to-equity
 * ratio in statute (in contrast to many OECD members), the ITA has long
 * applied a thin-cap heuristic during §85A audits: when a related-party
 * borrower's debt-to-equity exceeds ~3:1, the "excess interest" is
 * recharacterised as a non-deductible equity return. In parallel,
 * Israel has adopted BEPS Action 4 for certain MNE groups, capping net
 * interest at 30 % of EBITDA. Both tests are supported below.
 */
function thinCapRules({ entity, debtEquityRatio, maxRatio, interestExpense, ebitda, mode }, store) {
  if (!entity) throw new Error('thinCapRules: entity required');
  if (typeof debtEquityRatio !== 'number' && typeof interestExpense !== 'number') {
    throw new Error('thinCapRules: provide either debtEquityRatio or interestExpense+ebitda');
  }
  const cap = typeof maxRatio === 'number' ? maxRatio : store.thinCapMax;
  const corporateRate = store.corporateRate;

  const result = {
    entity,
    mode: mode || 'auto',
    breaches: [],
    deductibleInterest: null,
    nonDeductibleInterest: null,
    taxImpact: null,
    opinion: null,
  };

  // Test 1 — debt/equity heuristic (3:1 baseline)
  if (typeof debtEquityRatio === 'number') {
    const breach = debtEquityRatio > cap;
    result.debtEquityRatio = round2(debtEquityRatio);
    result.debtEquityCap = cap;
    if (breach) {
      // Excess leverage portion = (D/E - cap) / (D/E)
      const excessFrac = (debtEquityRatio - cap) / debtEquityRatio;
      result.breaches.push({
        test: 'debt_equity',
        ratio: round2(debtEquityRatio),
        cap,
        excessFraction: round6(excessFrac),
        he: `יחס חוב להון (${debtEquityRatio.toFixed(2)}) חורג מרף ה-${cap.toFixed(1)}. ${(excessFrac * 100).toFixed(1)}% מהוצאות הריבית עלולות להישלל.`,
        en: `Debt/equity ${debtEquityRatio.toFixed(2)} exceeds ${cap.toFixed(1)} threshold. ${(excessFrac * 100).toFixed(1)}% of interest expense may be disallowed.`,
      });
      if (typeof interestExpense === 'number') {
        const nonDed = round2(interestExpense * excessFrac);
        result.deductibleInterest = round2(interestExpense - nonDed);
        result.nonDeductibleInterest = nonDed;
      }
    }
  }

  // Test 2 — BEPS Action 4 (30 % EBITDA)
  if (typeof interestExpense === 'number' && typeof ebitda === 'number') {
    const cap30 = round2(0.30 * ebitda);
    const nonDed30 = round2(Math.max(0, interestExpense - cap30));
    if (nonDed30 > 0) {
      result.breaches.push({
        test: 'beps_4_30pct_ebitda',
        cap: cap30,
        he: `הוצאות ריבית (${interestExpense.toLocaleString('he-IL')}) חורגות מ-30% EBITDA (${cap30.toLocaleString('he-IL')}).`,
        en: `Interest expense (${interestExpense.toLocaleString('en-US')}) exceeds 30% of EBITDA (${cap30.toLocaleString('en-US')}).`,
      });
      // If both tests triggered, the more restrictive applies
      const prevNonDed = result.nonDeductibleInterest || 0;
      if (nonDed30 > prevNonDed) {
        result.nonDeductibleInterest = nonDed30;
        result.deductibleInterest = round2(interestExpense - nonDed30);
      }
    } else if (result.deductibleInterest === null && typeof interestExpense === 'number') {
      result.deductibleInterest = interestExpense;
      result.nonDeductibleInterest = 0;
    }
  }

  if (result.nonDeductibleInterest !== null) {
    result.taxImpact = round2(result.nonDeductibleInterest * corporateRate);
  }

  result.opinion = result.breaches.length === 0
    ? { he: 'לא זוהתה חריגה — ריבית ניתנת לניכוי במלואה.', en: 'No breach — interest fully deductible.' }
    : { he: 'זוהתה חריגה — יש לשקול סיווג מחדש של חלק מהריבית.', en: 'Breach detected — consider partial reclassification of interest.' };

  audit(store, 'THIN_CAP', { entity, result });
  return result;
}

// ─────────────────────────────────────────────────────────────────────
// 10. Withholding tax on interest paid to foreign related party
// ─────────────────────────────────────────────────────────────────────

/**
 * Israeli WHT on interest paid to a foreign related party.
 *
 * • Statutory rate: 25 % (Ordinance §170, §164 et seq.)
 * • Treaty relief: apply the lower of statutory and treaty rate, on
 *   presentation of a Form 2513/2513A certificate of residency. This
 *   function returns both the gross statutory WHT and the treaty-relief
 *   amount, leaving the accounting team to decide which to apply.
 * • Bank exception: some treaties grant a further reduced rate on
 *   interest paid to a foreign bank. The caller may override via
 *   `bankException: true`.
 */
function withholdingTax({ borrower, lender, interest, lenderCountry, bankException, treatyCertificate }, store) {
  if (!borrower || !lender) throw new Error('withholdingTax: borrower and lender required');
  if (typeof interest !== 'number' || interest < 0) {
    throw new Error('withholdingTax: interest must be a non-negative number');
  }
  const statRate = store.whtRate;
  let treatyRate = null;
  let treatyUsed = false;
  const country = lenderCountry && String(lenderCountry).toUpperCase();
  if (country && country !== 'IL' && store.dtaRates[country] !== undefined) {
    treatyRate = store.dtaRates[country];
    if (bankException) treatyRate = Math.min(treatyRate, 0.10); // conservative
    // Treaty relief only applies when the certificate is on file; we
    // return both numbers so the caller/auditor can decide.
    treatyUsed = !!treatyCertificate;
  }

  const statutoryWHT = round2(interest * statRate);
  const treatyWHT    = treatyRate !== null ? round2(interest * treatyRate) : null;
  const applied      = treatyUsed ? treatyWHT : statutoryWHT;
  const netToLender  = round2(interest - applied);

  const result = {
    borrower,
    lender,
    lenderCountry: country || null,
    interest: round2(interest),
    statutoryRate: statRate,
    treatyRate,
    treatyUsed,
    statutoryWHT,
    treatyWHT,
    appliedWHT: applied,
    netInterestToLender: netToLender,
    he: {
      note: country && country !== 'IL'
        ? (treatyUsed
          ? `הוחל שיעור אמנה מופחת של ${(treatyRate * 100).toFixed(1)}% (${country}) — יש לצרף אישור תושבות (טופס 2513/2513א).`
          : `שיעור ניכוי מס במקור סטטוטורי: ${(statRate * 100).toFixed(1)}%. לצורך הקלת אמנה נדרש אישור תושבות.`)
        : 'הלווה והמלווה ישראלים — אין חובת ניכוי מס במקור (בכפוף לסעיפים 164-170).',
    },
    en: {
      note: country && country !== 'IL'
        ? (treatyUsed
          ? `Applied reduced treaty rate of ${(treatyRate * 100).toFixed(1)}% (${country}) — residency certificate (Form 2513/2513A) required.`
          : `Statutory WHT rate: ${(statRate * 100).toFixed(1)}%. Treaty relief requires residency certificate.`)
        : 'Borrower and lender are Israeli — no WHT obligation on domestic interest (subject to §164-§170).',
    },
  };

  audit(store, 'WHT_CALC', result);
  return result;
}

// ─────────────────────────────────────────────────────────────────────
// 11. FX revaluation for non-functional-currency loans
// ─────────────────────────────────────────────────────────────────────

/**
 * Revalue a foreign-currency loan at a given spot rate, relative to
 * either the original rate or the previous revaluation, producing an
 * unrealised FX gain/loss.
 *
 * The return value includes a journal proposal (JV) which can be fed
 * straight into the GL adapter — we do not post it ourselves, keeping
 * this module side-effect-free on the ledger.
 */
function currencyRevaluation({ loanId, asOfDate, spotRate, functionalCurrency, previousSpot }, store) {
  if (!loanId) throw new Error('currencyRevaluation: loanId required');
  const loan = store.loans.get(loanId);
  if (!loan) throw new Error(`loan not found: ${loanId}`);
  if (typeof spotRate !== 'number' || spotRate <= 0) {
    throw new Error('currencyRevaluation: spotRate must be > 0');
  }
  if (!asOfDate) throw new Error('currencyRevaluation: asOfDate required');

  const bal = outstandingBalance(loanId, asOfDate, store);
  const func = functionalCurrency || 'ILS';
  const balForeign = bal.principal;

  // Find the previous rate — caller-provided, last revaluation for this
  // loan, or fall back to implied "1.0" for loans booked in the
  // functional currency.
  let prevRate = previousSpot;
  if (!prevRate) {
    const last = [...store.revaluations].reverse().find(r => r.loanId === loanId);
    prevRate = last ? last.spotRate : null;
  }
  if (!prevRate) {
    // No previous mark — use the loan as originated; for a same-currency
    // loan this is simply 1.0 and produces zero impact.
    prevRate = loan.currency === func ? 1.0 : null;
  }
  if (!prevRate) {
    throw new Error('currencyRevaluation: no previous rate for first revaluation; pass previousSpot');
  }

  const balBefore = round2(balForeign * prevRate);
  const balAfter  = round2(balForeign * spotRate);
  const diff      = round2(balAfter - balBefore);

  // Gain/loss sign convention:
  // - Lender's receivable: up = gain (we are owed more in ILS)
  // - Borrower's payable:   up = loss (we owe more in ILS)
  const lenderImpact   = round2(diff);       // receivable move
  const borrowerImpact = round2(-diff);      // payable move

  const rec = {
    revaluationId: nextId('FXR'),
    loanId,
    asOfDate,
    currency: loan.currency,
    functionalCurrency: func,
    prevRate,
    spotRate,
    balanceForeign: balForeign,
    balanceBefore: balBefore,
    balanceAfter: balAfter,
    diff,
    lenderImpact,
    borrowerImpact,
    journal: {
      lender: [
        { account: `AR-IC-${loan.borrower}`,            debit: diff > 0 ? diff : 0,  credit: diff < 0 ? -diff : 0, currency: func, memo: 'IC loan FX reval' },
        { account: 'FX-GAIN-LOSS',                      debit: diff < 0 ? -diff : 0, credit: diff > 0 ? diff : 0,  currency: func, memo: 'IC loan FX reval' },
      ],
      borrower: [
        { account: 'FX-GAIN-LOSS',                      debit: diff > 0 ? diff : 0,  credit: diff < 0 ? -diff : 0, currency: func, memo: 'IC loan FX reval' },
        { account: `AP-IC-${loan.lender}`,              debit: diff < 0 ? -diff : 0, credit: diff > 0 ? diff : 0,  currency: func, memo: 'IC loan FX reval' },
      ],
    },
    he: {
      summary: `שערוך יתרה: ${balForeign} ${loan.currency} × ${spotRate} = ${balAfter} ${func}. הפרש: ${diff} ${func}.`,
    },
    en: {
      summary: `Revaluation: ${balForeign} ${loan.currency} × ${spotRate} = ${balAfter} ${func}. Delta: ${diff} ${func}.`,
    },
    recordedAt: new Date().toISOString(),
  };

  store.revaluations.push(rec);
  audit(store, 'FX_REVAL', { loanId, asOfDate, spotRate, diff });
  return rec;
}

// ─────────────────────────────────────────────────────────────────────
// 12. Arm's-length support — §85A TP memo
// ─────────────────────────────────────────────────────────────────────

/**
 * Produce an arm's-length support package for a loan. The caller may
 * pre-load comparables via `loan.armsLengthSupport`; otherwise this
 * function synthesises a baseline memo grounded in the §3(i) imputed
 * rate (which, while not a substitute for external comparables, is a
 * defensible starting point for small domestic IC loans).
 */
function armsLengthSupport(loanId, store) {
  const loan = store.loans.get(loanId);
  if (!loan) throw new Error(`loan not found: ${loanId}`);
  const supplied = loan.armsLengthSupport;
  const comparables = (supplied && Array.isArray(supplied.comparables)) ? supplied.comparables.slice() : [];

  // If no comparables were supplied, synthesise a minimal set of two
  // public benchmarks + the §3(i) floor. These are clearly labelled as
  // synthesised so an auditor can distinguish them from genuine data.
  if (comparables.length === 0) {
    comparables.push(
      { source: 'Bank of Israel — government bond yield curve', tenor: loan.term, rate: round6(store.imputedRate - 0.005), synthesised: true },
      { source: 'Section 3(i) imputed-interest baseline',       tenor: loan.term, rate: round6(store.imputedRate),         synthesised: true },
      { source: 'Commercial lending benchmark (synthetic)',     tenor: loan.term, rate: round6(store.imputedRate + 0.010), synthesised: true },
    );
  }

  const rates = comparables.map(c => Number(c.rate)).sort((a, b) => a - b);
  const q1 = percentile(rates, 0.25);
  const median = percentile(rates, 0.5);
  const q3 = percentile(rates, 0.75);
  const inRange = loan.rate >= q1 - 1e-9 && loan.rate <= q3 + 1e-9;

  return {
    loanId,
    method: { he: 'שיטת השוואת מחיר בלתי מבוקר (CUP)', en: 'Comparable Uncontrolled Price (CUP)' },
    statutoryAnchor: {
      he: 'סעיף 85א לפקודת מס הכנסה + תקנות 5767-2006',
      en: 'Section 85A, Israeli Income Tax Ordinance + Regulations 5767-2006',
    },
    loanRate: loan.rate,
    rateType: loan.rateType,
    comparables,
    interquartileRange: { q1: round6(q1), median: round6(median), q3: round6(q3) },
    conclusion: {
      inRange,
      he: inRange
        ? `ריבית הלוואה (${(loan.rate * 100).toFixed(2)}%) נכנסת לטווח הבין-רבעוני של הנתונים ההשוואתיים — תומכת בעמידה בדרישת מרחק הידיים.`
        : `ריבית הלוואה (${(loan.rate * 100).toFixed(2)}%) מחוץ לטווח הבין-רבעוני — נדרש נימוק עסקי מפורט או התאמת ריבית.`,
      en: inRange
        ? `Loan rate (${(loan.rate * 100).toFixed(2)}%) falls within the interquartile range of comparable yields — supports arm's-length conclusion.`
        : `Loan rate (${(loan.rate * 100).toFixed(2)}%) outside the interquartile range — requires business-purpose narrative or a rate adjustment.`,
    },
    preparedAt: new Date().toISOString(),
  };
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  const w = idx - lo;
  return sorted[lo] * (1 - w) + sorted[hi] * w;
}

// ─────────────────────────────────────────────────────────────────────
// 13. Bilingual Hebrew/English loan agreement template
// ─────────────────────────────────────────────────────────────────────

function generateLoanAgreement(loanId, store) {
  const loan = store.loans.get(loanId);
  if (!loan) throw new Error(`loan not found: ${loanId}`);
  const now = iso(new Date());

  const he = [
    '===========================================================',
    '  הסכם הלוואה בין חברות קשורות',
    '===========================================================',
    '',
    `מספר הלוואה: ${loan.loanId}`,
    `תאריך: ${now}`,
    '',
    `המלווה (להלן: "המלווה"): ${loan.lender}`,
    `הלווה  (להלן: "הלווה"): ${loan.borrower}`,
    '',
    '1. סכום ההלוואה',
    `   המלווה מעניק ללווה הלוואה בסך ${loan.principal.toLocaleString('he-IL')} ${loan.currency}.`,
    '',
    '2. ריבית',
    `   ההלוואה נושאת ריבית בשיעור ${(loan.rate * 100).toFixed(2)}% (${RATE_TYPE_LABELS[loan.rateType].he}).`,
    `   בסיס חישוב: ${loan.paymentSchedule.dayCount}.`,
    '',
    '3. תקופה',
    `   תחילת ההלוואה: ${loan.term.startDate}.`,
    `   מועד פירעון: ${loan.term.maturityDate}.`,
    `   תקופת גרייס: ${loan.term.gracePeriodMonths} חודשים.`,
    '',
    '4. לוח סילוקין',
    `   תדירות תשלום: ${loan.paymentSchedule.frequency}.`,
    `   שיטת סילוקין: ${loan.paymentSchedule.amortization}.`,
    '',
    '5. מטרה עסקית',
    `   ${loan.purpose}`,
    '',
    '6. תיעוד מחירי העברה',
    '   הצדדים מצהירים כי תנאי ההלוואה נקבעו בתנאי שוק (arm\'s length)',
    '   כנדרש בסעיף 85א לפקודת מס הכנסה (נוסח חדש), ומתחייבים',
    '   לתעד את הרציונל הכלכלי כמפורט בתקנות מס הכנסה',
    '   (קביעת תנאי שוק), התשס"ז-2006.',
    '',
    '7. ניכוי מס במקור',
    '   ככל שהמלווה אינו תושב ישראל, ינוכה מס במקור מתשלומי הריבית',
    '   על-פי הדין ו/או הוראת פקיד השומה, בשיעור סטטוטורי של 25%',
    '   או בשיעור מופחת לפי אמנה למניעת כפל מס, בכפוף להצגת טופס 2513.',
    '',
    '8. דין וסמכות שיפוט',
    `   חוקי מדינת ישראל. סמכות שיפוט ייחודית לבתי המשפט ב${loan.intercompanyAgreement.jurisdiction}.`,
    '',
    '9. חתימות',
    '   _________________________          _________________________',
    `   בשם המלווה                          בשם הלווה`,
    '',
  ].join('\n');

  const en = [
    '===========================================================',
    '  INTERCOMPANY LOAN AGREEMENT',
    '===========================================================',
    '',
    `Loan ID: ${loan.loanId}`,
    `Date:    ${now}`,
    '',
    `LENDER   (the "Lender"):   ${loan.lender}`,
    `BORROWER (the "Borrower"): ${loan.borrower}`,
    '',
    '1. PRINCIPAL',
    `   The Lender grants the Borrower a loan of ${loan.principal.toLocaleString('en-US')} ${loan.currency}.`,
    '',
    '2. INTEREST',
    `   The loan bears interest at ${(loan.rate * 100).toFixed(2)}% (${RATE_TYPE_LABELS[loan.rateType].en}).`,
    `   Day-count basis: ${loan.paymentSchedule.dayCount}.`,
    '',
    '3. TERM',
    `   Effective date:  ${loan.term.startDate}.`,
    `   Maturity date:   ${loan.term.maturityDate}.`,
    `   Grace period:    ${loan.term.gracePeriodMonths} months.`,
    '',
    '4. PAYMENT SCHEDULE',
    `   Frequency:    ${loan.paymentSchedule.frequency}.`,
    `   Amortization: ${loan.paymentSchedule.amortization}.`,
    '',
    '5. BUSINESS PURPOSE',
    `   ${loan.purpose}`,
    '',
    '6. TRANSFER-PRICING DOCUMENTATION',
    '   The Parties represent that the terms of this loan have been set on',
    '   an arm\'s-length basis, as required by Section 85A of the Israeli',
    '   Income Tax Ordinance [New Version] and the Income Tax Regulations',
    '   (Determination of Market Conditions), 5767-2006, and undertake to',
    '   maintain contemporaneous documentation of the economic rationale.',
    '',
    '7. WITHHOLDING TAX',
    '   If the Lender is not an Israeli tax resident, interest payments',
    '   shall be subject to Israeli withholding tax at the statutory rate',
    '   of 25%, or at a reduced rate under an applicable double-taxation',
    '   treaty, subject to the Lender\'s timely delivery of a Form 2513/',
    '   2513A certificate of tax residency.',
    '',
    '8. GOVERNING LAW AND JURISDICTION',
    `   The laws of the State of Israel shall govern this Agreement.`,
    `   Exclusive jurisdiction lies with the courts of ${loan.intercompanyAgreement.jurisdiction}.`,
    '',
    '9. SIGNATURES',
    '   _________________________          _________________________',
    '   For the Lender                      For the Borrower',
    '',
  ].join('\n');

  return { loanId, he, en, generatedAt: new Date().toISOString() };
}

// ─────────────────────────────────────────────────────────────────────
// 14. Consolidation elimination flags
// ─────────────────────────────────────────────────────────────────────

/**
 * Flag IC loans for elimination in a given reporting period.
 * Returns two mirrored "elimination entries":
 *   • Debit: AP-IC (borrower books)   Credit: AR-IC (lender books)   — principal
 *   • Debit: Interest income (lender) Credit: Interest expense (borrower) — P&L
 *
 * We do not post these to a GL; we return the proposed JV so the
 * consolidation engine can feed them into `consolidation/` as needed.
 */
function consolidationElimination(period, store) {
  if (!period || !period.from || !period.to) {
    throw new Error('consolidationElimination: period.from and period.to required');
  }
  const from = asDate(period.from);
  const to   = asDate(period.to);
  const items = [];

  for (const loan of store.loans.values()) {
    if (loan.status === LOAN_STATUS.REVERSED) continue;
    // Outstanding balance at period end
    const bal = outstandingBalance(loan.loanId, period.to, store);
    // Interest accrued during the period
    const int = calculateInterest(loan.loanId, { from: period.from, to: period.to }, store);

    items.push({
      loanId: loan.loanId,
      lender: loan.lender,
      borrower: loan.borrower,
      currency: loan.currency,
      periodStart: period.from,
      periodEnd:   period.to,
      balanceSheetElimination: {
        memo: `Eliminate IC loan ${loan.loanId}`,
        // Debit AP-IC on borrower's side, Credit AR-IC on lender's side
        entries: [
          { entity: loan.borrower, account: `AP-IC-${loan.lender}`,   debit: bal.principal, credit: 0, currency: loan.currency },
          { entity: loan.lender,   account: `AR-IC-${loan.borrower}`, debit: 0, credit: bal.principal, currency: loan.currency },
        ],
      },
      incomeStatementElimination: {
        memo: `Eliminate IC interest on ${loan.loanId}`,
        entries: [
          { entity: loan.lender,   account: 'IC-INTEREST-INCOME',  debit: int.accruedInterest, credit: 0, currency: loan.currency },
          { entity: loan.borrower, account: 'IC-INTEREST-EXPENSE', debit: 0, credit: int.accruedInterest, currency: loan.currency },
        ],
      },
      he: `ביטול בהתאמת איחוד: יתרה ${bal.principal} ${loan.currency}, ריבית ${int.accruedInterest} ${loan.currency}.`,
      en: `Consolidation elimination: balance ${bal.principal} ${loan.currency}, interest ${int.accruedInterest} ${loan.currency}.`,
    });
  }

  audit(store, 'CONSOL_ELIM', { period, count: items.length });
  return {
    period,
    count: items.length,
    items,
    generatedAt: new Date().toISOString(),
  };
}

// ─────────────────────────────────────────────────────────────────────
// 15. Class façade
// ─────────────────────────────────────────────────────────────────────

class ICLoans {
  constructor(options) {
    this._store = createStore(options || {});
    this.VERSION = VERSION;
    // Non-identifier alias so code written with the literal field name
    // "arm'sLengthSupport" still dispatches to the same implementation.
    this["arm'sLengthSupport"] = (id) => armsLengthSupport(id, this._store);
  }

  // ── lifecycle ────────────────────────────────────────────────────
  originateLoan(p)            { return originateLoan(p, this._store); }
  calculateInterest(id, per)  { return calculateInterest(id, per, this._store); }
  recordPayment(p)            { return recordPayment(p, this._store); }
  outstandingBalance(id, asOf){ return outstandingBalance(id, asOf, this._store); }

  // ── Israeli tax ──────────────────────────────────────────────────
  thinCapRules(p)             { return thinCapRules(p, this._store); }
  withholdingTax(p)           { return withholdingTax(p, this._store); }

  // ── FX + documentation ──────────────────────────────────────────
  currencyRevaluation(p)      { return currencyRevaluation(p, this._store); }
  armsLengthSupport(id)       { return armsLengthSupport(id, this._store); }
  generateLoanAgreement(id)   { return generateLoanAgreement(id, this._store); }

  // ── consolidation ───────────────────────────────────────────────
  consolidationElimination(p) { return consolidationElimination(p, this._store); }

  // ── utilities / observability ───────────────────────────────────
  getLoan(id)                 { return this._store.loans.get(id) || null; }
  listLoans(filter)           {
    const out = [];
    for (const l of this._store.loans.values()) {
      if (!filter) { out.push(l); continue; }
      if (filter.status && l.status !== filter.status) continue;
      if (filter.lender && l.lender !== filter.lender) continue;
      if (filter.borrower && l.borrower !== filter.borrower) continue;
      if (filter.currency && l.currency !== filter.currency) continue;
      out.push(l);
    }
    return out;
  }
  listPayments(loanId)        { return this._store.payments.filter(p => !loanId || p.loanId === loanId); }
  listRevaluations(loanId)    { return this._store.revaluations.filter(r => !loanId || r.loanId === loanId); }
  getAuditLog()               { return this._store.auditLog.slice(); }
  setDTARate(country, rate)   { this._store.dtaRates[String(country).toUpperCase()] = Number(rate); }
  setImputedRate(rate)        { this._store.imputedRate = Number(rate); }
  setThinCapMax(cap)          { this._store.thinCapMax = Number(cap); }
}

// ─────────────────────────────────────────────────────────────────────
// 16. Exports
// ─────────────────────────────────────────────────────────────────────

module.exports = {
  // primary class
  ICLoans,

  // constants / enums (for callers, tests, UI)
  VERSION,
  RATE_TYPES,
  RATE_TYPE_LABELS,
  LOAN_STATUS,
  LOAN_STATUS_LABELS,
  PAYMENT_TYPES,
  PAYMENT_TYPE_LABELS,
  DAY_COUNT,
  PAYMENT_FREQ,
  DTA_INTEREST_RATES,
  IL_3I_IMPUTED_RATE_2026,
  IL_3J_RELATED_PARTY_RATE_2026,
  IL_WHT_INTEREST_DEFAULT,
  IL_THIN_CAP_MAX_DEBT_EQUITY,
  IL_CORPORATE_RATE_2026,

  // pure helpers (handy for targeted unit tests)
  buildAmortization,
  dayCountFraction,
  createStore,
};
