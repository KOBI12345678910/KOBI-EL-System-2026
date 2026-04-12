/**
 * Israeli Mortgage Calculator — מחשבון משכנתא ישראלית
 * AG-Y053 — Real-Estate swarm (Techno-Kol Uzi Mega-ERP)
 *
 * Computes everything a lender / borrower needs for an Israeli residential
 * mortgage file, with the mix of tracks (תמהיל מסלולים) the Bank of Israel
 * actually allows on the street:
 *
 *   - prime             — prime-rate linked (BOI + 1.5%), floating
 *   - kal               — CPI-linked variable (צמוד מדד משתנה)
 *   - kal-fixed         — CPI-linked fixed rate (צמוד מדד קבוע)
 *   - kalf              — non-linked fixed (לא צמוד קבוע / קל"ץ)
 *   - kalm              — non-linked variable (לא צמוד משתנה)
 *   - zamad-matbea      — foreign-currency linked (צמוד מט"ח, usually USD)
 *   - mishtanne-kol-5   — variable-every-5-years (משתנה כל 5)
 *
 * Responsibilities:
 *   1. Validate the BOI composition rules (≥33% fixed, ≤2/3 prime, etc.)
 *   2. Compute the monthly payment of a mix (computeMix)
 *   3. Produce a month-by-month amortization schedule (amortizationSchedule)
 *   4. Compute the early-repayment penalty per BOI directive 451 / Commissions
 *      Regulation 2002 (earlyRepaymentPenalty)
 *   5. Stress-test the payment against a Prime+3% shock (stressTest)
 *   6. Check affordability — payment/income ratio capped at 40% (affordabilityCheck)
 *   7. LTV ceilings per borrower type (computeMaxLTV / validateLTV)
 *
 * Rule of the shop: לא מוחקים רק משדרגים ומגדלים — never delete, only
 * upgrade & grow. All additions are purely additive.
 *
 * Zero external dependencies. Safe to run under `node --test`.
 */

'use strict';

// ═══════════════════════════════════════════════════════════════
// BANK-OF-ISRAEL CONSTANTS — 2026 reference values
// Sources:
//   - הנחיית ניהול בנקאי תקין 329 (LTV ceilings)
//   - הנחיית ניהול בנקאי תקין 451 (early-repayment penalty)
//   - צו הבנקאות (עמלות פירעון מוקדם) התשס"ב-2002
//   - חוק הגנת הלווה במשכנתא + תיקון 29 לחוק הבנקאות
// ═══════════════════════════════════════════════════════════════

const BOI_CONSTANTS = {
  // Bank-of-Israel base rate (ריבית בנק ישראל) — the anchor for Prime.
  // Prime = BOI rate + 1.5 pp (fixed spread, set by law in Israel).
  BOI_RATE: 0.045,              // 4.5% — 2026 reference
  PRIME_SPREAD: 0.015,          // +1.5 pp always
  // => current Israeli Prime = 6.0% annual nominal

  // LTV ceilings — הנחיה 329 / צו המפקח על הבנקים
  LTV: {
    FIRST_HOME: 0.75,           // דירה יחידה (primary residence)
    FIRST_TIME_BUYER: 0.75,     // רוכשי דירה ראשונה / זכאי משרד השיכון
    UPGRADER: 0.70,             // משפר דיור — selling old unit within 18 months
    SECOND_HOME: 0.50,          // דירה שנייה (not yet sold)
    INVESTOR: 0.50,             // רוכש לצורכי השקעה
  },

  // Composition rules — הנחיה 329 §3 (תמהיל המשכנתא)
  COMPOSITION: {
    MIN_FIXED_PCT: 1 / 3,       // לפחות שליש ברכיב קבוע (non-variable)
    MAX_PRIME_PCT: 2 / 3,       // עד שני-שליש ברכיב Prime
    MAX_VARIABLE_LT5Y_PCT: 2 / 3, // עד 2/3 ברכיב משתנה בתחנות < 5 שנים
    MAX_TERM_YEARS: 30,         // מקסימום 30 שנה
  },

  // Affordability — תקנות פיקוח על שירותים פיננסיים + הנחיית המפקח
  AFFORDABILITY: {
    MAX_PTI_RATIO: 0.40,        // payment-to-income ≤ 40%
    STRESS_SHOCK_PP: 0.03,      // +3 pp stress on Prime component (BOI directive)
  },

  // Early-repayment penalty components (עמלות פירעון מוקדם) — צו 2002
  EARLY_REPAYMENT: {
    OPERATIONAL_FEE: 60,        // עמלה תפעולית — ₪60 one-off
    DISCOUNT_RATE_SPREAD: 0.003, // 0.3 pp deducted from breakage rate on CPI/fixed
    NOTICE_DISCOUNT_10D: 0.002,  // notice ≥ 10 days: 0.2 pp discount on breakage
    NOTICE_DISCOUNT_30D: 0.005,  // notice ≥ 30 days: 0.5 pp discount on breakage
    EXEMPT_AFTER_THIRD: true,    // repayments after 1/3 of term pay reduced penalty
  },
};

// ═══════════════════════════════════════════════════════════════
// TRACK DEFINITIONS — מסלולי משכנתא
// Each entry: internal code, Hebrew name, English name, properties flags.
//   fixedRate:   rate never changes for whole life
//   cpiLinked:   principal + payment rise with CPI (מדד המחירים לצרכן)
//   fxLinked:    principal + payment rise with FX (usually USD)
//   primeLinked: rate = BOI + spread, floats with BOI decisions
//   variable:    rate resets at known stations (תחנות יציאה)
//   stationYrs:  years between resets (if variable)
// ═══════════════════════════════════════════════════════════════

const TRACKS = Object.freeze({
  prime: {
    code: 'prime',
    nameHe: 'פריים',
    nameEn: 'Prime',
    fixedRate: false,
    cpiLinked: false,
    fxLinked: false,
    primeLinked: true,
    variable: true,
    stationYrs: 0,          // floats daily, no fixed station
    description: 'Prime-rate linked — floats daily with BOI rate. Spread is fixed by bank.',
  },
  kal: {
    code: 'kal',
    nameHe: 'קל (צמוד מדד משתנה)',
    nameEn: 'CPI-linked variable',
    fixedRate: false,
    cpiLinked: true,
    fxLinked: false,
    primeLinked: false,
    variable: true,
    stationYrs: 5,          // typically 5-year resets
    description: 'Principal indexed to CPI, rate resets every 5 years.',
  },
  'kal-fixed': {
    code: 'kal-fixed',
    nameHe: 'קל קבוע (צמוד מדד)',
    nameEn: 'CPI-linked fixed',
    fixedRate: true,
    cpiLinked: true,
    fxLinked: false,
    primeLinked: false,
    variable: false,
    stationYrs: 0,
    description: 'Principal indexed to CPI, rate fixed for life of loan.',
  },
  kalf: {
    code: 'kalf',
    nameHe: 'קל"ץ (לא צמוד קבוע)',
    nameEn: 'Non-linked fixed',
    fixedRate: true,
    cpiLinked: false,
    fxLinked: false,
    primeLinked: false,
    variable: false,
    stationYrs: 0,
    description: 'Non-indexed, rate fixed for entire term. The classic 30-yr fixed.',
  },
  kalm: {
    code: 'kalm',
    nameHe: 'קל"מ (לא צמוד משתנה)',
    nameEn: 'Non-linked variable',
    fixedRate: false,
    cpiLinked: false,
    fxLinked: false,
    primeLinked: false,
    variable: true,
    stationYrs: 5,
    description: 'Non-indexed, rate resets every 5 years against a reference.',
  },
  'zamad-matbea': {
    code: 'zamad-matbea',
    nameHe: 'צמוד מט"ח',
    nameEn: 'FX-linked',
    fixedRate: false,
    cpiLinked: false,
    fxLinked: true,
    primeLinked: false,
    variable: true,
    stationYrs: 0,
    description: 'Principal + payment rise with chosen FX (usually USD/LIBOR+).',
  },
  'mishtanne-kol-5': {
    code: 'mishtanne-kol-5',
    nameHe: 'משתנה כל 5 שנים',
    nameEn: 'Variable every 5 years',
    fixedRate: false,
    cpiLinked: false,    // optional, see flag below
    fxLinked: false,
    primeLinked: false,
    variable: true,
    stationYrs: 5,
    description: 'Rate resets every 5 years against average mortgage rate.',
  },
});

// ═══════════════════════════════════════════════════════════════
// PURE MATH HELPERS
// ═══════════════════════════════════════════════════════════════

/** Safe rounding to N decimals — avoids IEEE-754 drift on .5 */
function round(x, n = 2) {
  const f = Math.pow(10, n);
  return Math.round((x + Number.EPSILON) * f) / f;
}

/** Standard amortization PMT (לוח שפיצר) — positive payment for positive P */
function pmt(principal, annualRate, nMonths) {
  if (!(nMonths > 0)) throw new Error('nMonths must be > 0');
  if (!(principal > 0)) return 0;
  const r = annualRate / 12;
  if (r === 0) return principal / nMonths;
  return (principal * r) / (1 - Math.pow(1 + r, -nMonths));
}

/** Remaining balance of a Spitzer loan after k months of payments */
function remainingBalance(principal, annualRate, nMonths, kMonths) {
  if (kMonths >= nMonths) return 0;
  if (kMonths <= 0) return principal;
  const r = annualRate / 12;
  if (r === 0) {
    return principal * (1 - kMonths / nMonths);
  }
  const pay = pmt(principal, annualRate, nMonths);
  return (
    principal * Math.pow(1 + r, kMonths) -
    pay * ((Math.pow(1 + r, kMonths) - 1) / r)
  );
}

/** NPV (present value) of a stream of equal payments at rate r/12, n periods */
function pvOfAnnuity(payment, annualRate, nMonths) {
  if (!(nMonths > 0) || payment <= 0) return 0;
  const r = annualRate / 12;
  if (r === 0) return payment * nMonths;
  return payment * ((1 - Math.pow(1 + r, -nMonths)) / r);
}

/** Deep-freeze an object tree. Used for read-only constants. */
function deepFreeze(o) {
  Object.getOwnPropertyNames(o).forEach((p) => {
    const v = o[p];
    if (v && typeof v === 'object') deepFreeze(v);
  });
  return Object.freeze(o);
}
deepFreeze(BOI_CONSTANTS);

// ═══════════════════════════════════════════════════════════════
// MAIN CLASS — MortgageCalculator
// ═══════════════════════════════════════════════════════════════

class MortgageCalculator {
  /**
   * @param {object} [opts]
   * @param {number} [opts.boiRate]       Override Bank-of-Israel base rate
   * @param {number} [opts.primeSpread]   Override Prime spread (default 1.5pp)
   */
  constructor(opts = {}) {
    this.boiRate = opts.boiRate ?? BOI_CONSTANTS.BOI_RATE;
    this.primeSpread = opts.primeSpread ?? BOI_CONSTANTS.PRIME_SPREAD;
    this.constants = BOI_CONSTANTS;
    this.tracks = TRACKS;
  }

  // ─── 1. PRIME & TRACK META ───

  /** Current Israeli Prime (BOI + spread). */
  primeRate() {
    return round(this.boiRate + this.primeSpread, 6);
  }

  /**
   * Resolve the effective annual rate for a given composition line.
   * If `rate` is provided on the line we respect it as-is.
   * If the track is prime-linked and no rate was given, we fall back to Prime.
   */
  resolveRate(line) {
    if (typeof line.rate === 'number' && line.rate >= 0) return line.rate;
    const track = this._requireTrack(line.type);
    if (track.primeLinked) return this.primeRate();
    throw new Error(
      `MortgageCalculator.resolveRate: track "${line.type}" needs an explicit rate`
    );
  }

  _requireTrack(code) {
    const t = TRACKS[code];
    if (!t) throw new Error(`Unknown mortgage track: "${code}"`);
    return t;
  }

  // ─── 2. LTV RULES ───

  /**
   * Maximum allowable LTV (Loan-to-Value) for a borrower profile.
   *   profile.type in {firstHome, upgrader, secondHome, investor, firstTimeBuyer}
   */
  computeMaxLTV(profile = {}) {
    const t = profile.type || 'firstHome';
    const map = this.constants.LTV;
    switch (t) {
      case 'firstHome':       return map.FIRST_HOME;
      case 'firstTimeBuyer':  return map.FIRST_TIME_BUYER;
      case 'upgrader':        return map.UPGRADER;
      case 'secondHome':      return map.SECOND_HOME;
      case 'investor':        return map.INVESTOR;
      default:
        throw new Error(`Unknown borrower profile: "${t}"`);
    }
  }

  /**
   * Check if a proposed loan complies with BOI LTV ceiling.
   * @returns {{ok:boolean, maxLTV:number, actualLTV:number, reason?:string}}
   */
  validateLTV({ propertyValue, loanAmount, profile }) {
    if (!(propertyValue > 0)) {
      return { ok: false, maxLTV: 0, actualLTV: 0, reason: 'invalid propertyValue' };
    }
    const maxLTV = this.computeMaxLTV(profile);
    const actualLTV = loanAmount / propertyValue;
    const ok = actualLTV <= maxLTV + 1e-9;
    return {
      ok,
      maxLTV,
      actualLTV: round(actualLTV, 4),
      reason: ok
        ? undefined
        : `LTV ${(actualLTV * 100).toFixed(1)}% exceeds ceiling ${(maxLTV * 100).toFixed(0)}%`,
    };
  }

  // ─── 3. COMPOSITION VALIDATION ───

  /**
   * Validate the BOI composition rules on a mix.
   *   - Each component pct ∈ [0,1]
   *   - Sum of pcts = 1.0 (within epsilon)
   *   - Fixed-rate share ≥ 1/3
   *   - Prime share ≤ 2/3
   *   - Max term ≤ 30 years
   * @returns {{ok:boolean, violations:string[]}}
   */
  validateComposition({ term, composition }) {
    const v = [];
    if (!Array.isArray(composition) || composition.length === 0) {
      return { ok: false, violations: ['composition array is empty'] };
    }

    let sumPct = 0;
    let fixedPct = 0;
    let primePct = 0;
    let variableLt5 = 0;

    for (const line of composition) {
      const track = TRACKS[line.type];
      if (!track) {
        v.push(`unknown track "${line.type}"`);
        continue;
      }
      const pct = Number(line.pct);
      if (!(pct >= 0 && pct <= 1)) {
        v.push(`component "${line.type}" has invalid pct=${line.pct}`);
        continue;
      }
      sumPct += pct;
      if (track.fixedRate) fixedPct += pct;
      if (track.primeLinked) primePct += pct;
      if (track.variable && track.stationYrs > 0 && track.stationYrs < 5) {
        variableLt5 += pct;
      }
    }

    // Sum tolerance is 0.2% so that triplets like [1/3, 1/3, 1/3] survive
    // the 4-decimal display-rounding on the way into this function.
    if (Math.abs(sumPct - 1) > 2e-3) {
      v.push(`composition sums to ${round(sumPct * 100, 2)}%, must equal 100%`);
    }
    // Relaxed epsilon (0.1%) — rounded-to-4dp values like 0.3333 vs 0.33333
    // should not fail the "≥ 1/3 fixed" rule.
    if (fixedPct + 1e-3 < this.constants.COMPOSITION.MIN_FIXED_PCT) {
      v.push(
        `fixed share is ${round(fixedPct * 100, 1)}%, must be at least ` +
          `${round(this.constants.COMPOSITION.MIN_FIXED_PCT * 100, 1)}%`
      );
    }
    if (primePct - 1e-3 > this.constants.COMPOSITION.MAX_PRIME_PCT) {
      v.push(
        `prime share is ${round(primePct * 100, 1)}%, must not exceed ` +
          `${round(this.constants.COMPOSITION.MAX_PRIME_PCT * 100, 1)}%`
      );
    }
    if (variableLt5 - 1e-3 > this.constants.COMPOSITION.MAX_VARIABLE_LT5Y_PCT) {
      v.push(
        `variable-station < 5yr share is ${round(variableLt5 * 100, 1)}%, ceiling ${
          round(this.constants.COMPOSITION.MAX_VARIABLE_LT5Y_PCT * 100, 1)
        }%`
      );
    }
    if (term && term / 12 > this.constants.COMPOSITION.MAX_TERM_YEARS) {
      v.push(`term ${term} months exceeds 30-year maximum`);
    }

    return { ok: v.length === 0, violations: v };
  }

  // ─── 4. MAIN METHOD — computeMix ───

  /**
   * Compute payment, interest, and totals for a mixed mortgage.
   *
   * @param {object} params
   * @param {number} params.amount      Total loan amount (₪)
   * @param {number} params.term        Total term in months
   * @param {Array<object>} params.composition  [{type, pct, rate?, termMonths?}]
   * @returns {object} breakdown per line + totals
   */
  computeMix({ amount, term, composition }) {
    if (!(amount > 0)) throw new Error('amount must be > 0');
    if (!(term > 0)) throw new Error('term must be > 0');
    if (!Array.isArray(composition) || composition.length === 0) {
      throw new Error('composition must be a non-empty array');
    }

    const lines = [];
    let totalMonthlyPayment = 0;
    let totalInterest = 0;
    let totalPrincipal = 0;

    for (const raw of composition) {
      const track = this._requireTrack(raw.type);
      const pct = Number(raw.pct);
      if (!(pct > 0 && pct <= 1)) {
        throw new Error(`component "${raw.type}" has invalid pct=${raw.pct}`);
      }
      const principal = round(amount * pct, 2);
      const rate = this.resolveRate(raw);
      const nMonths = raw.termMonths || term;
      const monthly = round(pmt(principal, rate, nMonths), 2);
      const totalPaid = round(monthly * nMonths, 2);
      const interest = round(totalPaid - principal, 2);

      totalMonthlyPayment += monthly;
      totalInterest += interest;
      totalPrincipal += principal;

      lines.push({
        type: raw.type,
        nameHe: track.nameHe,
        nameEn: track.nameEn,
        principal,
        pct: round(pct, 4),
        rate,
        rateLabel: `${round(rate * 100, 3)}%`,
        termMonths: nMonths,
        monthlyPayment: monthly,
        totalPaid,
        interest,
        fixedRate: track.fixedRate,
        cpiLinked: track.cpiLinked,
        fxLinked: track.fxLinked,
        primeLinked: track.primeLinked,
      });
    }

    return {
      amount: round(totalPrincipal, 2),
      termMonths: term,
      termYears: round(term / 12, 2),
      lines,
      totalMonthlyPayment: round(totalMonthlyPayment, 2),
      totalInterest: round(totalInterest, 2),
      totalPaid: round(totalPrincipal + totalInterest, 2),
      effectiveAnnualRate: round(
        lines.reduce((a, l) => a + l.rate * l.pct, 0),
        6
      ),
    };
  }

  // ─── 5. AMORTIZATION SCHEDULE ───

  /**
   * Month-by-month schedule for each component + aggregate row.
   * @param {object} mix — output of computeMix OR the same input shape
   * @returns {Array<{month, principalPaid, interestPaid, balance, payment, lines}>}
   */
  amortizationSchedule(mix) {
    const resolved = mix.lines
      ? mix
      : this.computeMix(mix);
    const maxMonths = resolved.lines.reduce(
      (m, l) => Math.max(m, l.termMonths),
      0
    );

    // Initial balances per line
    const state = resolved.lines.map((l) => ({
      ...l,
      balance: l.principal,
      monthlyRate: l.rate / 12,
    }));

    const rows = [];
    for (let month = 1; month <= maxMonths; month++) {
      let aggPrincipal = 0;
      let aggInterest = 0;
      let aggBalance = 0;
      let aggPayment = 0;
      const perLine = [];

      for (const s of state) {
        if (month > s.termMonths || s.balance <= 0) {
          perLine.push({
            type: s.type,
            payment: 0,
            principalPaid: 0,
            interestPaid: 0,
            balance: 0,
          });
          continue;
        }
        const interestPart = round(s.balance * s.monthlyRate, 2);
        let principalPart = round(s.monthlyPayment - interestPart, 2);
        // Last payment tidies up any rounding residue
        if (month === s.termMonths) {
          principalPart = round(s.balance, 2);
        }
        if (principalPart > s.balance) principalPart = round(s.balance, 2);

        const payment = round(principalPart + interestPart, 2);
        s.balance = round(s.balance - principalPart, 2);
        if (s.balance < 0) s.balance = 0;

        aggPrincipal += principalPart;
        aggInterest += interestPart;
        aggBalance += s.balance;
        aggPayment += payment;

        perLine.push({
          type: s.type,
          payment,
          principalPaid: principalPart,
          interestPaid: interestPart,
          balance: s.balance,
        });
      }

      rows.push({
        month,
        payment: round(aggPayment, 2),
        principalPaid: round(aggPrincipal, 2),
        interestPaid: round(aggInterest, 2),
        balance: round(aggBalance, 2),
        lines: perLine,
      });
    }
    return rows;
  }

  // ─── 6. EARLY-REPAYMENT PENALTY ───

  /**
   * Israeli early-repayment penalty (עמלת פירעון מוקדם) per:
   *   - צו הבנקאות (עמלות פירעון מוקדם) התשס"ב-2002
   *   - הנחיית ניהול בנקאי תקין 451
   *
   * Main component: breakage / היוון (for fixed/CPI tracks only) —
   *   penalty ≈ max(0, repayAmount × ((contractRate − currentMarketRate − discounts) / 12) × remainingMonths)
   *   More precisely: the PV at currentRate of the remaining fixed cash-flows
   *   MINUS the principal repaid. Prime tracks carry no breakage.
   *
   * We also add:
   *   - operational fee (₪60)
   *   - notice discount (10d / 30d)
   *   - after 1/3 of term: exempt from breakage (still operational fee)
   *
   * @param {object} mix — output of computeMix
   * @param {number} whenMonth — month at which borrower repays (1-based)
   * @param {number} repayAmount — how much principal is being repaid (₪)
   * @param {object} [opts]
   *   @param {number} [opts.currentMarketRate] reference rate for breakage (annual)
   *   @param {number} [opts.noticeDays=0]      days of advance notice given
   * @returns {object}
   */
  earlyRepaymentPenalty(mix, whenMonth, repayAmount, opts = {}) {
    if (!(whenMonth > 0)) throw new Error('whenMonth must be > 0');
    if (!(repayAmount > 0)) throw new Error('repayAmount must be > 0');

    const resolved = mix.lines ? mix : this.computeMix(mix);
    const noticeDays = opts.noticeDays || 0;
    const currentMarketRate =
      typeof opts.currentMarketRate === 'number'
        ? opts.currentMarketRate
        : this.primeRate();

    // Outstanding per line at month `whenMonth` (assume repayment weighted by pct)
    let totalBreakage = 0;
    const perLine = [];

    for (const l of resolved.lines) {
      const outstanding = remainingBalance(
        l.principal,
        l.rate,
        l.termMonths,
        whenMonth - 1
      );
      // The slice being repaid from this line, proportional to its share.
      const repayShare = round(repayAmount * l.pct, 2);
      const effectiveRepay = Math.min(repayShare, outstanding);
      const remainingAfter = Math.max(0, outstanding - effectiveRepay);
      const remainingMonths = l.termMonths - (whenMonth - 1);
      let breakage = 0;
      let exemptReason = null;

      // Exemption: after 1/3 of term, breakage is waived (still operational fee).
      const thirdOfTerm = Math.floor(l.termMonths / 3);
      const pastThird = whenMonth > thirdOfTerm;

      if (l.primeLinked) {
        exemptReason = 'prime-linked: no breakage';
      } else if (remainingMonths <= 0) {
        exemptReason = 'term completed';
      } else if (l.fxLinked && !l.fixedRate) {
        exemptReason = 'fx-linked variable: no breakage';
      } else if (pastThird && this.constants.EARLY_REPAYMENT.EXEMPT_AFTER_THIRD) {
        exemptReason = 'after 1/3 of term (reduced)';
        // Reduced: still compute but apply 50% discount
        breakage = this._computeBreakage(
          effectiveRepay,
          l.rate,
          currentMarketRate,
          remainingMonths,
          noticeDays
        ) * 0.5;
      } else {
        breakage = this._computeBreakage(
          effectiveRepay,
          l.rate,
          currentMarketRate,
          remainingMonths,
          noticeDays
        );
      }

      breakage = Math.max(0, round(breakage, 2));
      totalBreakage += breakage;

      perLine.push({
        type: l.type,
        outstanding: round(outstanding, 2),
        effectiveRepay,
        remainingAfter: round(remainingAfter, 2),
        remainingMonths,
        breakage,
        exemptReason,
      });
    }

    const operationalFee = this.constants.EARLY_REPAYMENT.OPERATIONAL_FEE;
    const total = round(totalBreakage + operationalFee, 2);

    return {
      whenMonth,
      repayAmount,
      noticeDays,
      currentMarketRate,
      operationalFee,
      breakage: round(totalBreakage, 2),
      total,
      lines: perLine,
    };
  }

  /**
   * Internal: breakage formula per BOI.
   *   breakage = PV at currentRate of remaining fixed payments  -  effectiveRepay
   * We linearise at the level of repayAmount: if the contract rate is ABOVE
   * the current market rate, the bank is losing future profit → positive fee.
   * If contract rate is BELOW market, the bank is making profit → fee = 0.
   *
   * Notice discounts reduce the effective "current market rate" advantage,
   * capped at the configured deltas.
   */
  _computeBreakage(effectiveRepay, contractRate, marketRate, remainingMonths, noticeDays) {
    if (!(effectiveRepay > 0) || !(remainingMonths > 0)) return 0;
    if (contractRate <= marketRate) return 0;   // no loss to bank

    // Apply notice discount to contract rate (reduces our spread)
    let discount = this.constants.EARLY_REPAYMENT.DISCOUNT_RATE_SPREAD;
    if (noticeDays >= 30) {
      discount += this.constants.EARLY_REPAYMENT.NOTICE_DISCOUNT_30D;
    } else if (noticeDays >= 10) {
      discount += this.constants.EARLY_REPAYMENT.NOTICE_DISCOUNT_10D;
    }
    const effContractRate = Math.max(marketRate, contractRate - discount);
    if (effContractRate <= marketRate) return 0;

    // Monthly payment at contract rate (of the slice being repaid)
    const contractPmt = pmt(effectiveRepay, effContractRate, remainingMonths);
    // Value of that payment stream discounted at market rate
    const pvAtMarket = pvOfAnnuity(contractPmt, marketRate, remainingMonths);
    // The difference is what the bank loses on the slice — our breakage
    return round(pvAtMarket - effectiveRepay, 2);
  }

  // ─── 7. STRESS TEST (Prime + 3%) ───

  /**
   * BOI-mandated stress test: recompute monthly payment with +shock on the
   * prime-linked component (and optionally on all variable components).
   * Default shock = 3 percentage points.
   *
   * @param {object} mix           — output of computeMix OR an input shape
   * @param {number} [rateShock]   — shock in decimal (0.03 = +3pp)
   * @param {object} [opts]
   *   @param {boolean} [opts.applyToVariable=true] apply shock to all variable tracks, not just prime
   */
  stressTest(mix, rateShock, opts = {}) {
    const shock = typeof rateShock === 'number'
      ? rateShock
      : this.constants.AFFORDABILITY.STRESS_SHOCK_PP;
    const applyToVariable = opts.applyToVariable !== false;

    const resolved = mix.lines ? mix : this.computeMix(mix);

    const shocked = {
      amount: resolved.amount,
      term: resolved.termMonths || resolved.term,
      composition: resolved.lines.map((l) => {
        const track = TRACKS[l.type];
        const shouldShock =
          track.primeLinked ||
          (applyToVariable && track.variable && !track.fixedRate);
        return {
          type: l.type,
          pct: l.pct,
          rate: shouldShock ? l.rate + shock : l.rate,
          termMonths: l.termMonths,
        };
      }),
    };

    const stressed = this.computeMix(shocked);
    return {
      shock,
      baselinePayment: resolved.totalMonthlyPayment,
      stressedPayment: stressed.totalMonthlyPayment,
      delta: round(stressed.totalMonthlyPayment - resolved.totalMonthlyPayment, 2),
      deltaPct:
        resolved.totalMonthlyPayment > 0
          ? round(
              (stressed.totalMonthlyPayment - resolved.totalMonthlyPayment) /
                resolved.totalMonthlyPayment,
              4
            )
          : 0,
      stressed,
    };
  }

  // ─── 8. AFFORDABILITY (PTI ≤ 40%) ───

  /**
   * Verify payment-to-income ratio per BOI directive (≤ 40%).
   * Also runs a stress test and reports the stressed ratio.
   *
   * @param {number} income  — monthly household net income (₪)
   * @param {object} mix     — output of computeMix OR its input shape
   * @param {object} [opts]
   *   @param {number} [opts.maxRatio] override the default 40% cap
   *   @param {number} [opts.stressShock] override the stress shock
   * @returns {object}
   */
  affordabilityCheck(income, mix, opts = {}) {
    if (!(income > 0)) throw new Error('income must be > 0');

    const resolved = mix.lines ? mix : this.computeMix(mix);
    const payment = resolved.totalMonthlyPayment;
    const maxRatio = opts.maxRatio ?? this.constants.AFFORDABILITY.MAX_PTI_RATIO;
    const pti = payment / income;
    const stress = this.stressTest(resolved, opts.stressShock);
    const stressedPti = stress.stressedPayment / income;

    const maxPaymentAllowed = round(income * maxRatio, 2);
    const headroom = round(maxPaymentAllowed - payment, 2);

    return {
      income,
      payment,
      stressedPayment: stress.stressedPayment,
      pti: round(pti, 4),
      stressedPti: round(stressedPti, 4),
      maxRatio,
      maxPaymentAllowed,
      headroom,
      ok: pti <= maxRatio + 1e-9,
      stressOk: stressedPti <= maxRatio + 1e-9,
      reason:
        pti > maxRatio
          ? `PTI ${(pti * 100).toFixed(1)}% exceeds ceiling ${(maxRatio * 100).toFixed(0)}%`
          : stressedPti > maxRatio
          ? `Stressed PTI ${(stressedPti * 100).toFixed(1)}% exceeds ceiling under +${
              (stress.shock * 100).toFixed(0)
            }pp shock`
          : 'ok',
    };
  }
}

// ═══════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════

module.exports = {
  MortgageCalculator,
  BOI_CONSTANTS,
  TRACKS,
  // pure helpers — exposed for unit tests and external reuse
  pmt,
  remainingBalance,
  pvOfAnnuity,
  round,
};
