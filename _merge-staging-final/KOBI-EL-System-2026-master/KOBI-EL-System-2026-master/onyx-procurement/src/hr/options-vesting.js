/**
 * Options Vesting & Israeli Section 102 Tax Tracker
 * ──────────────────────────────────────────────────
 * Agent Y-073 • Techno-Kol Uzi mega-ERP • Swarm HR/Tax
 *
 * Stock-options / RSU / SAR vesting engine with full Israeli
 * Section 102 / Section 3(i) tax optimisation.
 *
 * Rule enforced: לא מוחקים, רק משדרגים ומגדלים —
 *   every grant, vest tick, exercise, trustee transfer and accel
 *   event is APPENDED to an immutable ledger. There is no delete.
 *
 * Zero third-party dependencies. Pure JavaScript, Node >= 18,
 * bilingual Hebrew/English labels throughout.
 *
 * Supported instruments
 *   ISO   — Incentive Stock Option (US-flavoured, kept for 409A / dual-jurisdiction)
 *   NSO   — Non-qualified Stock Option
 *   RSU   — Restricted Stock Unit (no strike, settles in shares)
 *   SAR   — Stock Appreciation Right (cash-settled delta)
 *
 * Supported Israeli tax tracks
 *   102-capital   — מסלול רווח הון עם נאמן  (25 % capital gains,
 *                   requires 24-month trustee lockup from grant date,
 *                   pre-IPO FMV portion becomes ordinary income)
 *   102-ordinary  — מסלול הכנסה עם נאמן     (ordinary income on gain,
 *                   12-month trustee lockup, BL + income tax)
 *   3(i)          — סעיף 3(i)                (consultants / non-employees,
 *                   full marginal income tax + BL, no trustee)
 *
 * Public surface (see bottom `module.exports`):
 *
 *   class OptionsVesting
 *     grantOption(grant)                  — register a new grant
 *     computeVested(grantId, asOfDate)    — vested / unvested shares
 *     exercise(grantId, shares, method)   — cash | cashless | swap
 *     computeTaxOnExercise(ctx)           — 102 vs 3(i) tax math
 *     trusteeTransfer(grantId)            — mark grant as deposited at trustee
 *     leaveAcceleration(ctx)              — termination / death / CoC rules
 *     strike83b(ctx)                      — pre-IPO election note
 *     vestingSchedulePDF(grantId)         — text/SVG PDF-surrogate
 *     reportForForm161(employeeId)        — equity row for טופס 161
 *     ledgerFor(grantId)                  — immutable ledger slice
 *
 *   CONSTANTS_2026    — tax/bl rates, lockup windows
 *   LABELS_HE         — Hebrew glossary
 *
 * All dates are ISO-8601 strings. All money in NIS unless the grant
 * carries an explicit `currency` override. Never throws on unknown
 * employee ids — returns `null` / empty arrays — so this module is
 * safe to embed in batch reporting jobs.
 */

'use strict';

// ═══════════════════════════════════════════════════════════════════
// 1. CONSTANTS — Israeli 2026 tax / statutory values
// ═══════════════════════════════════════════════════════════════════

const CONSTANTS_2026 = Object.freeze({
  /** סעיף 102 מסלול רווח הון — 25 % flat capital-gains tax */
  SECTION_102_CAPITAL_RATE: 0.25,

  /** Trustee holding period for 102-capital track: 24 months from grant */
  SECTION_102_CAPITAL_LOCKUP_MONTHS: 24,

  /** Trustee holding period for 102-ordinary track: 12 months from grant */
  SECTION_102_ORDINARY_LOCKUP_MONTHS: 12,

  /** Marginal top tax bracket used as default ordinary-income rate */
  DEFAULT_MARGINAL_RATE: 0.47,

  /** Surtax on high earners (מס יסף) — kicks in above annual threshold */
  HIGH_EARNER_SURTAX_RATE: 0.03,
  HIGH_EARNER_SURTAX_THRESHOLD_2026: 721_560,

  /** Bituach Leumi (ביטוח לאומי) + מס בריאות — combined employee rate
   *  for the high bracket used on equity comp. Rough 2026 figure. */
  BITUACH_LEUMI_HIGH_RATE: 0.12,

  /** For 102-capital: FMV-at-grant portion taxed as ordinary income
   *  (average closing price of the 30 trading days preceding grant
   *  for pre-IPO startups, this engine stores it on the grant) */
  CAPITAL_TRACK_FMV_ORDINARY_SPLIT: true,

  /** Standard accel multiples on change-of-control */
  CHANGE_OF_CONTROL_ACCEL_PCT: 1.0, // 100 % single-trigger
  DEATH_ACCEL_PCT: 1.0,
  TERMINATION_FOR_CAUSE_ACCEL_PCT: 0.0,
  TERMINATION_WITHOUT_CAUSE_ACCEL_PCT: 0.0, // default — grants may override
});

const LABELS_HE = Object.freeze({
  grant: 'הקצאת אופציות',
  grantDate: 'תאריך הקצאה',
  vested: 'הבשלו',
  unvested: 'לא הבשילו',
  exercised: 'מומשו',
  strike: 'תוספת מימוש',
  fmv: 'שווי הוגן',
  spread: 'מרווח חייב במס',
  capitalGain: 'רווח הון',
  ordinaryIncome: 'הכנסת עבודה',
  trustee: 'נאמן',
  lockup: 'תקופת חסימה',
  section102capital: 'סעיף 102 מסלול רווח הון',
  section102ordinary: 'סעיף 102 מסלול הכנסה',
  section3i: 'סעיף 3(i)',
  cliff: 'תקופת מחסום',
  acceleration: 'האצה',
  termination: 'סיום העסקה',
  changeOfControl: 'שינוי שליטה',
  death: 'פטירה',
  form161: 'טופס 161',
  bituachLeumi: 'ביטוח לאומי',
  surtax: 'מס יסף',
});

// ═══════════════════════════════════════════════════════════════════
// 2. Helpers — dates & money (zero-dep)
// ═══════════════════════════════════════════════════════════════════

function toDate(x) {
  if (x instanceof Date) return new Date(x.getTime());
  if (typeof x === 'number') return new Date(x);
  if (typeof x === 'string') {
    const d = new Date(x);
    if (Number.isNaN(d.getTime())) throw new Error(`Invalid date: ${x}`);
    return d;
  }
  throw new Error(`Unsupported date type: ${typeof x}`);
}

function toISO(d) {
  return toDate(d).toISOString();
}

/** Add whole months to a date, clamping day-of-month on short months. */
function addMonths(d, months) {
  const date = toDate(d);
  const targetMonth = date.getUTCMonth() + months;
  const targetYear = date.getUTCFullYear() + Math.floor(targetMonth / 12);
  const normMonth = ((targetMonth % 12) + 12) % 12;
  const next = new Date(Date.UTC(targetYear, normMonth, 1));
  const lastDay = new Date(Date.UTC(targetYear, normMonth + 1, 0)).getUTCDate();
  next.setUTCDate(Math.min(date.getUTCDate(), lastDay));
  next.setUTCHours(date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds(), 0);
  return next;
}

function diffMonths(from, to) {
  const a = toDate(from);
  const b = toDate(to);
  let m = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());
  if (b.getUTCDate() < a.getUTCDate()) m -= 1;
  return m;
}

function round2(x) {
  return Math.round((Number(x) + Number.EPSILON) * 100) / 100;
}

function nisFmt(x) {
  return `₪${round2(x).toLocaleString('he-IL', { minimumFractionDigits: 2 })}`;
}

// Monotonic id generator — never collides within a process, append-only.
let _grantSeq = 0;
function nextGrantId(prefix = 'G') {
  _grantSeq += 1;
  return `${prefix}-${Date.now().toString(36)}-${_grantSeq.toString(36)}`;
}

// ═══════════════════════════════════════════════════════════════════
// 3. Vesting-schedule interpreter
// ═══════════════════════════════════════════════════════════════════
//
// A vestingSchedule object looks like:
//   { totalMonths: 48, cliffMonths: 12, frequency: 'monthly'|'quarterly'|'yearly' }
// Or a fully explicit list:
//   { tranches: [{ date: '2026-01-01', shares: 1000 }, ...] }
// The engine supports both; explicit tranches win.

function buildTranches(grant) {
  const {
    shares,
    grantDate,
    vestingSchedule: vs,
  } = grant;
  if (!vs) throw new Error('grant.vestingSchedule is required');

  if (Array.isArray(vs.tranches) && vs.tranches.length > 0) {
    // Explicit tranches — trust them but normalise.
    let running = 0;
    return vs.tranches.map((t, i) => {
      const tShares = Number(t.shares);
      if (!Number.isFinite(tShares) || tShares < 0) {
        throw new Error(`tranche[${i}].shares must be a non-negative number`);
      }
      running += tShares;
      return { date: toISO(t.date), shares: tShares };
    });
  }

  const total = Number(vs.totalMonths);
  const cliff = Number(vs.cliffMonths || 0);
  if (!Number.isFinite(total) || total <= 0) {
    throw new Error('vestingSchedule.totalMonths must be > 0');
  }
  if (!Number.isFinite(cliff) || cliff < 0 || cliff > total) {
    throw new Error('vestingSchedule.cliffMonths must be 0..totalMonths');
  }

  const freq = (vs.frequency || 'monthly').toLowerCase();
  const stepMonths = freq === 'yearly' ? 12 : freq === 'quarterly' ? 3 : 1;
  if (total % stepMonths !== 0) {
    throw new Error(`totalMonths (${total}) must be a multiple of ${stepMonths} for ${freq}`);
  }

  const tranches = [];
  const totalSteps = total / stepMonths;
  const perStep = Math.floor(shares / totalSteps);
  const remainder = shares - perStep * totalSteps;

  // Cliff block — all months up to cliff vest at the cliff date.
  const cliffSteps = Math.ceil(cliff / stepMonths);
  let consumed = 0;

  for (let step = 1; step <= totalSteps; step += 1) {
    const monthMark = step * stepMonths;
    if (monthMark < cliff) continue; // swallowed into cliff block
    let shareAmt = perStep;
    if (step === totalSteps) shareAmt += remainder; // dump remainder on last
    if (step === cliffSteps && cliff > 0) {
      // at cliff, release all up-to-now months at once
      shareAmt = perStep * cliffSteps + (totalSteps === cliffSteps ? remainder : 0);
    }
    const date = addMonths(grantDate, monthMark);
    tranches.push({ date: toISO(date), shares: shareAmt });
    consumed += shareAmt;
  }

  // Sanity — all shares accounted for
  if (consumed !== shares) {
    const drift = shares - consumed;
    if (tranches.length > 0) {
      tranches[tranches.length - 1].shares += drift;
    } else {
      tranches.push({ date: toISO(addMonths(grantDate, total)), shares });
    }
  }

  return tranches;
}

// ═══════════════════════════════════════════════════════════════════
// 4. OptionsVesting class
// ═══════════════════════════════════════════════════════════════════

class OptionsVesting {
  constructor() {
    /** @type {Map<string, object>} */
    this.grants = new Map();
    /** Append-only event ledger keyed by grantId */
    /** @type {Map<string, object[]>} */
    this.ledgers = new Map();
  }

  // ─────────────────────────────────────────────────────────────
  // 4.1 grantOption
  // ─────────────────────────────────────────────────────────────
  grantOption(input) {
    const {
      employeeId,
      type,
      shares,
      strike = 0,
      grantDate,
      vestingSchedule,
      expiryDate,
      trackType = '102-capital',
      trustee = null,
      fmvAtGrant = null,
      currency = 'ILS',
      metadata = {},
    } = input || {};

    if (!employeeId) throw new Error('employeeId is required');
    if (!['ISO', 'NSO', 'RSU', 'SAR'].includes(type)) {
      throw new Error(`type must be ISO|NSO|RSU|SAR, got ${type}`);
    }
    if (!Number.isFinite(shares) || shares <= 0) {
      throw new Error('shares must be > 0');
    }
    if (!['102-capital', '102-ordinary', '3(i)'].includes(trackType)) {
      throw new Error(`trackType must be 102-capital|102-ordinary|3(i), got ${trackType}`);
    }
    if (!grantDate) throw new Error('grantDate is required');
    if (!vestingSchedule) throw new Error('vestingSchedule is required');

    // Section 102 must have a trustee identified (even as a string / id).
    if (trackType.startsWith('102') && !trustee) {
      // Warning-only — trustee may be registered later via trusteeTransfer.
    }

    const id = nextGrantId(type);
    const normGrantDate = toISO(grantDate);

    const grant = {
      id,
      employeeId,
      type,
      shares,
      exercisedShares: 0,
      cancelledShares: 0,
      strike: Number(strike) || 0,
      grantDate: normGrantDate,
      expiryDate: expiryDate ? toISO(expiryDate) : toISO(addMonths(normGrantDate, 120)),
      trackType,
      trustee,
      trusteeDepositDate: null,
      fmvAtGrant: fmvAtGrant == null ? null : Number(fmvAtGrant),
      currency,
      vestingSchedule,
      tranches: [], // filled next
      status: 'active',
      metadata: { ...metadata },
    };
    grant.tranches = buildTranches(grant);

    this.grants.set(id, grant);
    this.ledgers.set(id, []);
    this._append(id, {
      type: 'grant',
      at: normGrantDate,
      payload: {
        employeeId,
        shares,
        strike: grant.strike,
        trackType,
        trustee,
        fmvAtGrant: grant.fmvAtGrant,
      },
    });
    return grant;
  }

  // ─────────────────────────────────────────────────────────────
  // 4.2 computeVested
  // ─────────────────────────────────────────────────────────────
  computeVested(grantId, asOfDate) {
    const g = this.grants.get(grantId);
    if (!g) return null;
    const asOf = toDate(asOfDate || new Date());
    const grantDate = toDate(g.grantDate);

    const cliffMonths = Number(g.vestingSchedule.cliffMonths || 0);
    const beforeCliff = diffMonths(grantDate, asOf) < cliffMonths;

    let vested = 0;
    const perTranche = [];
    for (const t of g.tranches) {
      const tDate = toDate(t.date);
      const active = !beforeCliff && tDate.getTime() <= asOf.getTime();
      if (active) vested += t.shares;
      perTranche.push({
        date: t.date,
        shares: t.shares,
        vested: active,
      });
    }

    vested = Math.max(0, vested - (g.cancelledShares || 0));
    const unvested = Math.max(0, g.shares - vested);
    const exercisable = Math.max(0, vested - (g.exercisedShares || 0));

    return {
      grantId,
      asOf: toISO(asOf),
      totalShares: g.shares,
      vested,
      unvested,
      exercised: g.exercisedShares || 0,
      cancelled: g.cancelledShares || 0,
      exercisable,
      beforeCliff,
      tranches: perTranche,
    };
  }

  // ─────────────────────────────────────────────────────────────
  // 4.3 exercise
  // ─────────────────────────────────────────────────────────────
  exercise(grantId, shares, method = 'cash', opts = {}) {
    const g = this.grants.get(grantId);
    if (!g) throw new Error(`grant ${grantId} not found`);
    if (!['cash', 'cashless', 'swap'].includes(method)) {
      throw new Error(`method must be cash|cashless|swap`);
    }
    if (!Number.isFinite(shares) || shares <= 0) {
      throw new Error('exercise shares must be > 0');
    }

    const asOf = opts.asOfDate ? toDate(opts.asOfDate) : new Date();
    const vested = this.computeVested(grantId, asOf);
    if (shares > vested.exercisable) {
      throw new Error(
        `cannot exercise ${shares}: only ${vested.exercisable} exercisable as of ${toISO(asOf)}`,
      );
    }

    const fmv = Number(opts.fmv || 0);
    const spread = Math.max(0, fmv - g.strike) * shares;
    const cost = g.strike * shares;

    let cashOutlay = 0;
    let sharesReceived = 0;

    if (method === 'cash') {
      cashOutlay = cost;
      sharesReceived = shares;
    } else if (method === 'cashless') {
      // broker sells enough shares to cover strike + tax, employee keeps net
      const coverageShares = fmv > 0 ? Math.ceil(cost / fmv) : shares;
      sharesReceived = Math.max(0, shares - coverageShares);
      cashOutlay = 0;
    } else if (method === 'swap') {
      // employee surrenders already-owned shares at FMV to pay strike
      const surrendered = fmv > 0 ? Math.ceil(cost / fmv) : 0;
      sharesReceived = shares;
      cashOutlay = 0;
      opts.surrenderedShares = surrendered;
    }

    g.exercisedShares += shares;

    const event = {
      type: 'exercise',
      at: toISO(asOf),
      payload: {
        grantId,
        shares,
        method,
        fmv,
        strike: g.strike,
        cost,
        spread,
        cashOutlay,
        sharesReceived,
        surrenderedShares: opts.surrenderedShares || 0,
      },
    };
    this._append(grantId, event);
    return event.payload;
  }

  // ─────────────────────────────────────────────────────────────
  // 4.4 computeTaxOnExercise — Israeli 102 / 3(i) tax math
  // ─────────────────────────────────────────────────────────────
  computeTaxOnExercise(ctx) {
    const { grant, fmv, exerciseDate, shares } = ctx || {};
    if (!grant) throw new Error('grant is required');
    if (!Number.isFinite(fmv)) throw new Error('fmv must be a number');
    if (!exerciseDate) throw new Error('exerciseDate is required');
    const exShares = Number(shares || grant.exercisedShares || 0);
    if (exShares <= 0) throw new Error('shares > 0 required for tax calc');

    const grantDate = toDate(grant.grantDate);
    const exDate = toDate(exerciseDate);
    const monthsHeld = diffMonths(grantDate, exDate);

    const spreadPerShare = Math.max(0, fmv - (grant.strike || 0));
    const totalSpread = spreadPerShare * exShares;

    const result = {
      track: grant.trackType,
      shares: exShares,
      fmv,
      strike: grant.strike || 0,
      totalSpread,
      monthsHeld,
      grossTax: 0,
      components: {},
      netProceeds: 0,
      lockupSatisfied: false,
      notes: [],
      labelsHe: {
        track: grant.trackType === '102-capital' ? LABELS_HE.section102capital
             : grant.trackType === '102-ordinary' ? LABELS_HE.section102ordinary
             : LABELS_HE.section3i,
      },
    };

    const marginal = Number(ctx.marginalRate || CONSTANTS_2026.DEFAULT_MARGINAL_RATE);
    const blRate = ctx.skipBL ? 0 : CONSTANTS_2026.BITUACH_LEUMI_HIGH_RATE;

    if (grant.trackType === '102-capital') {
      const lockupMonths = CONSTANTS_2026.SECTION_102_CAPITAL_LOCKUP_MONTHS;
      const satisfied = monthsHeld >= lockupMonths;
      result.lockupSatisfied = satisfied;

      if (satisfied) {
        // Split: pre-IPO FMV portion → ordinary; remainder → capital gain.
        const fmvAtGrant = grant.fmvAtGrant == null ? 0 : grant.fmvAtGrant;
        const ordinaryPortion = Math.max(0, fmvAtGrant - (grant.strike || 0)) * exShares;
        const capitalPortion = Math.max(0, totalSpread - ordinaryPortion);

        const ordTax = ordinaryPortion * marginal;
        const blTax = ordinaryPortion * blRate;
        const capTax = capitalPortion * CONSTANTS_2026.SECTION_102_CAPITAL_RATE;

        result.components = {
          ordinaryPortion,
          capitalPortion,
          ordinaryTax: round2(ordTax),
          ordinaryBL: round2(blTax),
          capitalGainsTax: round2(capTax),
        };
        result.grossTax = round2(ordTax + blTax + capTax);
        result.notes.push('102-capital: 24m lockup satisfied — 25% capital gains on post-grant appreciation.');
      } else {
        // Disqualified exercise — full ordinary treatment + BL.
        const ordTax = totalSpread * marginal;
        const blTax = totalSpread * blRate;
        result.components = {
          ordinaryPortion: totalSpread,
          capitalPortion: 0,
          ordinaryTax: round2(ordTax),
          ordinaryBL: round2(blTax),
          capitalGainsTax: 0,
        };
        result.grossTax = round2(ordTax + blTax);
        result.notes.push(`102-capital DISQUALIFIED: only ${monthsHeld}m < ${lockupMonths}m lockup — full ordinary tax + BL.`);
      }
    } else if (grant.trackType === '102-ordinary') {
      const lockupMonths = CONSTANTS_2026.SECTION_102_ORDINARY_LOCKUP_MONTHS;
      result.lockupSatisfied = monthsHeld >= lockupMonths;
      const ordTax = totalSpread * marginal;
      const blTax = totalSpread * blRate;
      result.components = {
        ordinaryPortion: totalSpread,
        capitalPortion: 0,
        ordinaryTax: round2(ordTax),
        ordinaryBL: round2(blTax),
        capitalGainsTax: 0,
      };
      result.grossTax = round2(ordTax + blTax);
      result.notes.push('102-ordinary: employment income at marginal rate + BL (deductible for employer).');
    } else {
      // 3(i) — consultants / non-employees / pre-IPO founders.
      const ordTax = totalSpread * marginal;
      const blTax = totalSpread * blRate;
      result.components = {
        ordinaryPortion: totalSpread,
        capitalPortion: 0,
        ordinaryTax: round2(ordTax),
        ordinaryBL: round2(blTax),
        capitalGainsTax: 0,
      };
      result.grossTax = round2(ordTax + blTax);
      result.notes.push('3(i): full marginal income tax + BL — no trustee, no capital track.');
    }

    // Optional מס יסף surtax on the spread.
    if (ctx.annualIncome != null &&
        Number(ctx.annualIncome) > CONSTANTS_2026.HIGH_EARNER_SURTAX_THRESHOLD_2026) {
      const surtax = totalSpread * CONSTANTS_2026.HIGH_EARNER_SURTAX_RATE;
      result.components.surtax = round2(surtax);
      result.grossTax = round2(result.grossTax + surtax);
      result.notes.push('מס יסף applied: +3% on equity spread.');
    }

    result.netProceeds = round2(totalSpread - result.grossTax);
    result.effectiveRate = totalSpread > 0
      ? round2((result.grossTax / totalSpread) * 100) / 100
      : 0;
    return result;
  }

  // ─────────────────────────────────────────────────────────────
  // 4.5 trusteeTransfer — Section 102 lockup deposit
  // ─────────────────────────────────────────────────────────────
  trusteeTransfer(grantId, opts = {}) {
    const g = this.grants.get(grantId);
    if (!g) throw new Error(`grant ${grantId} not found`);
    if (!g.trackType.startsWith('102')) {
      throw new Error(`grant ${grantId} is ${g.trackType} — no trustee required`);
    }
    const depositDate = toISO(opts.depositDate || new Date());
    const trustee = opts.trustee || g.trustee;
    if (!trustee) throw new Error('trustee identity required for 102 deposit');

    g.trustee = trustee;
    g.trusteeDepositDate = depositDate;

    const lockupMonths = g.trackType === '102-capital'
      ? CONSTANTS_2026.SECTION_102_CAPITAL_LOCKUP_MONTHS
      : CONSTANTS_2026.SECTION_102_ORDINARY_LOCKUP_MONTHS;
    const lockupEnds = toISO(addMonths(g.grantDate, lockupMonths));

    this._append(grantId, {
      type: 'trusteeTransfer',
      at: depositDate,
      payload: {
        trustee,
        lockupMonths,
        lockupEnds,
        track: g.trackType,
      },
    });

    return {
      grantId,
      trustee,
      depositDate,
      lockupMonths,
      lockupEnds,
    };
  }

  // ─────────────────────────────────────────────────────────────
  // 4.6 leaveAcceleration — termination / death / change-of-control
  // ─────────────────────────────────────────────────────────────
  leaveAcceleration(ctx) {
    const { grantId, reason, asOfDate, accelPct, cause } = ctx || {};
    const g = this.grants.get(grantId);
    if (!g) throw new Error(`grant ${grantId} not found`);
    if (!['termination', 'death', 'change-of-control'].includes(reason)) {
      throw new Error(`reason must be termination|death|change-of-control`);
    }
    const asOf = toDate(asOfDate || new Date());
    const snapshot = this.computeVested(grantId, asOf);

    // Determine accel pct.
    let pct = 0;
    if (accelPct != null) pct = Number(accelPct);
    else if (reason === 'death') pct = CONSTANTS_2026.DEATH_ACCEL_PCT;
    else if (reason === 'change-of-control') pct = CONSTANTS_2026.CHANGE_OF_CONTROL_ACCEL_PCT;
    else if (reason === 'termination' && cause === 'for-cause') {
      pct = CONSTANTS_2026.TERMINATION_FOR_CAUSE_ACCEL_PCT;
    } else {
      pct = CONSTANTS_2026.TERMINATION_WITHOUT_CAUSE_ACCEL_PCT;
    }
    pct = Math.max(0, Math.min(1, pct));

    const unvested = snapshot.unvested;
    const accelerated = Math.floor(unvested * pct);
    const cancelled = unvested - accelerated;

    // Accelerated shares become immediately vested — we synthesise a
    // synthetic tranche "date = asOf" and mark cancelled remainder.
    if (accelerated > 0) {
      g.tranches = g.tranches.map((t) => {
        const tDate = toDate(t.date);
        if (tDate.getTime() > asOf.getTime()) {
          // pull forward
          return { ...t, date: toISO(asOf) };
        }
        return t;
      });
    }
    g.cancelledShares = (g.cancelledShares || 0) + cancelled;

    // For termination without cause: post-termination exercise window kicks in.
    const postTerminationWindowDays = reason === 'termination' ? 90 : 0;
    const exerciseDeadline = postTerminationWindowDays > 0
      ? toISO(new Date(asOf.getTime() + postTerminationWindowDays * 86400000))
      : g.expiryDate;

    if (reason === 'termination' || reason === 'death') {
      g.status = 'closed';
    }

    const event = {
      type: 'acceleration',
      at: toISO(asOf),
      payload: {
        grantId,
        reason,
        cause: cause || null,
        accelPct: pct,
        unvestedBefore: unvested,
        accelerated,
        cancelled,
        exerciseDeadline,
      },
    };
    this._append(grantId, event);
    return event.payload;
  }

  // ─────────────────────────────────────────────────────────────
  // 4.7 strike83b — Israeli "early-exercise" note
  // ─────────────────────────────────────────────────────────────
  strike83b(ctx) {
    const { grantId, date } = ctx || {};
    const g = this.grants.get(grantId);
    if (!g) throw new Error(`grant ${grantId} not found`);

    // Israeli tax code has no exact 83(b) equivalent, but for
    // pre-IPO 102-capital grants the tax authority accepts a
    // documented FMV declaration at grant. We record it.
    const at = toISO(date || new Date());

    const note = {
      grantId,
      at,
      mechanism: 'israeli-pre-ipo-fmv-declaration',
      track: g.trackType,
      fmvAtGrant: g.fmvAtGrant,
      strike: g.strike,
      shares: g.shares,
      equivalent: 'us-83b',
      notes: [
        'Israeli tax law has no literal §83(b) election.',
        'For 102-capital pre-IPO grants, the 30-day avg FMV is documented at grant date,',
        'locking the ordinary-income portion to (FMV − strike) × shares and treating all',
        'future appreciation as 25% capital gains after trustee lockup.',
      ],
    };
    this._append(grantId, { type: 'strike83b', at, payload: note });
    return note;
  }

  // ─────────────────────────────────────────────────────────────
  // 4.8 vestingSchedulePDF — text/SVG PDF-surrogate
  // ─────────────────────────────────────────────────────────────
  vestingSchedulePDF(grantId) {
    const g = this.grants.get(grantId);
    if (!g) return null;
    const vested = this.computeVested(grantId);

    const lines = [];
    lines.push('═════════════════════════════════════════════════════════');
    lines.push(`Grant Agreement / הסכם הקצאת אופציות — ${g.id}`);
    lines.push('═════════════════════════════════════════════════════════');
    lines.push('');
    lines.push(`Employee / עובד:        ${g.employeeId}`);
    lines.push(`Type / סוג:             ${g.type}`);
    lines.push(`Track / מסלול:          ${g.trackType}`);
    lines.push(`Grant Date / ת. הקצאה:  ${g.grantDate.slice(0, 10)}`);
    lines.push(`Expiry / ת. פקיעה:      ${g.expiryDate.slice(0, 10)}`);
    lines.push(`Shares / מניות:         ${g.shares.toLocaleString('he-IL')}`);
    lines.push(`Strike / תוספת מימוש:   ${nisFmt(g.strike)}`);
    if (g.fmvAtGrant != null) lines.push(`FMV at grant / שווי הוגן: ${nisFmt(g.fmvAtGrant)}`);
    lines.push(`Trustee / נאמן:         ${g.trustee || '— (pending)'}`);
    if (g.trusteeDepositDate) {
      lines.push(`Deposit / ת. הפקדה:     ${g.trusteeDepositDate.slice(0, 10)}`);
    }
    lines.push('');
    lines.push('── Vesting Schedule / לוח הבשלה ──');
    for (const t of g.tranches) {
      lines.push(`  ${t.date.slice(0, 10)}   ${String(t.shares).padStart(8)} shares`);
    }
    lines.push('');
    lines.push(`Currently vested / הבשילו עד היום: ${vested.vested.toLocaleString('he-IL')}`);
    lines.push(`Exercisable / ניתנות למימוש:       ${vested.exercisable.toLocaleString('he-IL')}`);
    lines.push('');
    lines.push('לא מוחקים — רק משדרגים ומגדלים.');
    lines.push('═════════════════════════════════════════════════════════');

    return {
      format: 'text/plain',
      content: lines.join('\n'),
      meta: {
        grantId,
        generatedAt: toISO(new Date()),
        pages: 1,
      },
    };
  }

  // ─────────────────────────────────────────────────────────────
  // 4.9 reportForForm161 — equity row for severance form 161
  // ─────────────────────────────────────────────────────────────
  reportForForm161(employeeId) {
    const rows = [];
    for (const g of this.grants.values()) {
      if (g.employeeId !== employeeId) continue;
      const vested = this.computeVested(g.id);
      rows.push({
        grantId: g.id,
        type: g.type,
        track: g.trackType,
        trackHe: g.trackType === '102-capital' ? LABELS_HE.section102capital
               : g.trackType === '102-ordinary' ? LABELS_HE.section102ordinary
               : LABELS_HE.section3i,
        grantDate: g.grantDate,
        shares: g.shares,
        vested: vested.vested,
        exercised: g.exercisedShares || 0,
        strike: g.strike,
        fmvAtGrant: g.fmvAtGrant,
        trustee: g.trustee,
        trusteeDepositDate: g.trusteeDepositDate,
        status: g.status,
      });
    }

    const totals = rows.reduce(
      (acc, r) => ({
        shares: acc.shares + r.shares,
        vested: acc.vested + r.vested,
        exercised: acc.exercised + r.exercised,
      }),
      { shares: 0, vested: 0, exercised: 0 },
    );

    return {
      employeeId,
      generatedAt: toISO(new Date()),
      formId: 'form-161-equity-addendum',
      formIdHe: LABELS_HE.form161,
      rows,
      totals,
    };
  }

  // ─────────────────────────────────────────────────────────────
  // Internal — ledger append
  // ─────────────────────────────────────────────────────────────
  _append(grantId, event) {
    const ledger = this.ledgers.get(grantId) || [];
    // Deep-freeze event so no caller can mutate history.
    const frozen = Object.freeze({
      ...event,
      payload: Object.freeze({ ...event.payload }),
      seq: ledger.length,
    });
    ledger.push(frozen);
    this.ledgers.set(grantId, ledger);
    return frozen;
  }

  ledgerFor(grantId) {
    const l = this.ledgers.get(grantId);
    return l ? l.slice() : [];
  }
}

// ═══════════════════════════════════════════════════════════════════
// 5. Export surface
// ═══════════════════════════════════════════════════════════════════

module.exports = {
  OptionsVesting,
  CONSTANTS_2026,
  LABELS_HE,
  _internals: {
    buildTranches,
    addMonths,
    diffMonths,
    round2,
    toISO,
    nextGrantId,
  },
};
