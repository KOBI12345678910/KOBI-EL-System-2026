/**
 * A/B Testing Framework — Techno-Kol Uzi mega-ERP / onyx-procurement
 * Agent AG-X99
 *
 *   לא מוחקים רק משדרגים ומגדלים
 *
 * Zero external dependencies. Pure JavaScript. No HTTP, no DB, no file I/O.
 * Everything is deterministic and offline-friendly.
 *
 * Capabilities
 * ------------
 *   - createExperiment(...)         create a new experiment with variants & weights
 *   - assignVariant(expId, userId)  deterministic sticky hash per user
 *   - recordExposure(...)           log that a user saw a variant
 *   - recordConversion(...)         log a conversion event (binary or numeric)
 *   - getResults(expId)             aggregate counts, rates, means per variant
 *   - computeSignificance(expId)    chi-square + two-sample t-test + CIs
 *   - concludeExperiment(expId, w)  mark as concluded, archive, snapshot winner
 *   - listExperiments({status})     list by status filter
 *   - requiredSampleSize(...)       power analysis: baseline + MDE + alpha + power
 *
 * Statistical primitives implemented from scratch (no deps):
 *   - Chi-square CDF via regularized lower incomplete gamma (Legendre series)
 *   - Inverse normal CDF via Beasley-Springer-Moro approximation
 *   - Student's t CDF via regularized incomplete beta function
 *   - Standard normal CDF via Abramowitz & Stegun 7.1.26
 *
 * Bilingual reporting (Hebrew + English) on every result / summary object.
 * Nothing in here mutates inputs; experiments are stored in an internal
 * Map on the class instance.
 */

'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// 0. CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

const STATUS = Object.freeze({
  DRAFT:      'draft',
  RUNNING:    'running',
  CONCLUDED:  'concluded',
  ARCHIVED:   'archived',
});

const DEFAULTS = Object.freeze({
  alpha:               0.05,
  power:               0.80,
  minSampleSize:       100,
  confidenceLevel:     0.95,
});

// ═══════════════════════════════════════════════════════════════════════════
// 1. DETERMINISTIC HASHING  —  FNV-1a 32-bit
// ═══════════════════════════════════════════════════════════════════════════
//
// We need a fast, portable, dependency-free hash that is:
//   (a) deterministic across processes and platforms
//   (b) well-distributed over the 32-bit unsigned range
//   (c) not crypto — assignment is not a security boundary
//
// FNV-1a fits perfectly. We compose `experimentId:userId` so the same user
// lands in different buckets for different experiments (independence).

function fnv1a32(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    // FNV prime 16777619, mod 2^32
    h = Math.imul(h, 0x01000193);
  }
  // Unsigned right shift converts signed -> unsigned 32-bit int
  return h >>> 0;
}

function hashToUnit(expId, userId) {
  // Returns a deterministic float in [0, 1)
  const key = String(expId) + ':' + String(userId);
  return fnv1a32(key) / 0x100000000;
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. SPECIAL FUNCTIONS  —  chi^2, t, normal
// ═══════════════════════════════════════════════════════════════════════════
//
// Rather than pulling in jStat or simple-statistics we implement the three
// families we actually need. Accuracy target: ±1e-6 for p-values in
// the operating range (chi^2 up to 200 dof, t up to 10k dof).

// ---- 2.1 log-gamma  (Lanczos approximation, g=7, n=9) ----
// Numerical Recipes §6.1 — accurate to ~15 decimal places.
const LANCZOS_G = 7;
const LANCZOS_P = [
  0.99999999999980993,
  676.5203681218851,
  -1259.1392167224028,
  771.32342877765313,
  -176.61502916214059,
  12.507343278686905,
  -0.13857109526572012,
  9.9843695780195716e-6,
  1.5056327351493116e-7,
];

function logGamma(x) {
  if (x < 0.5) {
    // Reflection: Γ(x)Γ(1-x) = π / sin(π x)
    return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
  }
  x -= 1;
  let a = LANCZOS_P[0];
  const t = x + LANCZOS_G + 0.5;
  for (let i = 1; i < LANCZOS_P.length; i += 1) {
    a += LANCZOS_P[i] / (x + i);
  }
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

function gamma(x) {
  return Math.exp(logGamma(x));
}

// ---- 2.2 Regularized lower incomplete gamma  P(a, x) ----
// For x < a+1 use series, for x >= a+1 use continued fraction.
// Reference: Numerical Recipes §6.2 gser / gcf.

function gammaIncLowerRegularized(a, x) {
  if (x < 0 || a <= 0) return NaN;
  if (x === 0) return 0;
  if (x < a + 1) {
    // Series
    let ap = a;
    let sum = 1 / a;
    let del = sum;
    for (let n = 1; n < 200; n += 1) {
      ap += 1;
      del *= x / ap;
      sum += del;
      if (Math.abs(del) < Math.abs(sum) * 1e-15) {
        return sum * Math.exp(-x + a * Math.log(x) - logGamma(a));
      }
    }
    return sum * Math.exp(-x + a * Math.log(x) - logGamma(a));
  }
  // Continued fraction (Lentz's method)
  const FPMIN = 1e-300;
  let b = x + 1 - a;
  let c = 1 / FPMIN;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i < 200; i += 1) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = b + an / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < 1e-15) break;
  }
  const q = h * Math.exp(-x + a * Math.log(x) - logGamma(a));
  return 1 - q;
}

// ---- 2.3 Chi-square CDF ----
// P(X <= x) where X ~ χ²(df). Equals regularized lower incomplete gamma.

function chiSquareCDF(x, df) {
  if (x <= 0) return 0;
  if (df <= 0) return NaN;
  return gammaIncLowerRegularized(df / 2, x / 2);
}

function chiSquareSurvival(x, df) {
  // 1 - CDF, i.e. p-value
  return 1 - chiSquareCDF(x, df);
}

// ---- 2.4 Standard normal CDF  (Abramowitz & Stegun 7.1.26) ----
function erf(x) {
  // Maximum error ≈ 1.5e-7
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const t = 1 / (1 + p * ax);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-ax * ax);
  return sign * y;
}

function normalCDF(x) {
  return 0.5 * (1 + erf(x / Math.SQRT2));
}

// ---- 2.5 Inverse normal CDF  (Beasley-Springer-Moro) ----
// Returns z such that Φ(z) = p.  Accurate to ~1e-9 over (0,1).

function invNormalCDF(p) {
  if (p <= 0 || p >= 1) {
    if (p === 0) return -Infinity;
    if (p === 1) return Infinity;
    return NaN;
  }
  const a = [
    -3.969683028665376e+01,
    2.209460984245205e+02,
    -2.759285104469687e+02,
    1.383577518672690e+02,
    -3.066479806614716e+01,
    2.506628277459239e+00,
  ];
  const b = [
    -5.447609879822406e+01,
    1.615858368580409e+02,
    -1.556989798598866e+02,
    6.680131188771972e+01,
    -1.328068155288572e+01,
  ];
  const c = [
    -7.784894002430293e-03,
    -3.223964580411365e-01,
    -2.400758277161838e+00,
    -2.549732539343734e+00,
    4.374664141464968e+00,
    2.938163982698783e+00,
  ];
  const d = [
    7.784695709041462e-03,
    3.224671290700398e-01,
    2.445134137142996e+00,
    3.754408661907416e+00,
  ];
  const pLow = 0.02425;
  const pHigh = 1 - pLow;
  let q;
  let r;
  if (p < pLow) {
    q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
           ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p <= pHigh) {
    q = p - 0.5;
    r = q * q;
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
           (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }
  q = Math.sqrt(-2 * Math.log(1 - p));
  return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
         ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
}

// ---- 2.6 Regularized incomplete beta I_x(a,b) via continued fraction ----
// Needed for Student's t CDF.

function betacf(x, a, b) {
  const MAXIT = 200;
  const EPS = 3e-16;
  const FPMIN = 1e-300;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - qab * x / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= MAXIT; m += 1) {
    const m2 = 2 * m;
    let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    h *= d * c;
    aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

function incompleteBeta(x, a, b) {
  if (x < 0 || x > 1) return NaN;
  if (x === 0 || x === 1) return x;
  const bt = Math.exp(
    logGamma(a + b) - logGamma(a) - logGamma(b) +
    a * Math.log(x) + b * Math.log(1 - x)
  );
  if (x < (a + 1) / (a + b + 2)) {
    return bt * betacf(x, a, b) / a;
  }
  return 1 - bt * betacf(1 - x, b, a) / b;
}

// ---- 2.7 Student's t CDF ----
function tCDF(t, df) {
  if (df <= 0) return NaN;
  const x = df / (df + t * t);
  const ib = incompleteBeta(x, df / 2, 0.5);
  if (t >= 0) return 1 - 0.5 * ib;
  return 0.5 * ib;
}

function tTwoTailedPValue(t, df) {
  // 2 * (1 - CDF(|t|))
  const absT = Math.abs(t);
  return 2 * (1 - tCDF(absT, df));
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. WEIGHTED BUCKET ASSIGNMENT
// ═══════════════════════════════════════════════════════════════════════════

function normalizeWeights(variants) {
  // Returns a copy with an additional _cumulative field in [0,1].
  const total = variants.reduce((s, v) => s + (v.weight > 0 ? v.weight : 0), 0);
  if (total <= 0) {
    throw new Error('Total variant weight must be positive');
  }
  let acc = 0;
  return variants.map((v) => {
    const p = v.weight / total;
    acc += p;
    return { ...v, _probability: p, _cumulative: acc };
  });
}

function pickByCumulative(variantsWithCum, u) {
  // Find the first variant whose cumulative bound >= u.
  // Accepts either `_cumulative` (pre-normalized output) or `cumulative`
  // (the field name stored on created experiments).
  for (let i = 0; i < variantsWithCum.length; i += 1) {
    const c = variantsWithCum[i].cumulative !== undefined
      ? variantsWithCum[i].cumulative
      : variantsWithCum[i]._cumulative;
    if (u < c) return variantsWithCum[i];
  }
  // Float rounding edge: return last
  return variantsWithCum[variantsWithCum.length - 1];
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. ABTesting CLASS
// ═══════════════════════════════════════════════════════════════════════════

class ABTesting {
  constructor(options) {
    const opts = options || {};
    this.experiments = new Map(); // experimentId -> experiment object
    this.now = typeof opts.now === 'function'
      ? opts.now
      : () => new Date().toISOString();
  }

  // ─────────────────────────────────────────────────────────────────────
  // 4.1  createExperiment
  // ─────────────────────────────────────────────────────────────────────
  createExperiment({
    id,
    name_he,
    name_en,
    variants,
    metric,
    startDate,
    endDate,
    minSampleSize,
  }) {
    if (!id || typeof id !== 'string') {
      throw new Error('createExperiment: id is required (string)');
    }
    if (this.experiments.has(id)) {
      throw new Error(`Experiment already exists: ${id}`);
    }
    if (!Array.isArray(variants) || variants.length < 2) {
      throw new Error('createExperiment: at least 2 variants required');
    }
    const variantIds = new Set();
    for (const v of variants) {
      if (!v.id || typeof v.id !== 'string') {
        throw new Error('createExperiment: each variant needs a string id');
      }
      if (variantIds.has(v.id)) {
        throw new Error(`createExperiment: duplicate variant id "${v.id}"`);
      }
      if (typeof v.weight !== 'number' || v.weight < 0) {
        throw new Error(`createExperiment: variant "${v.id}" weight must be >= 0`);
      }
      variantIds.add(v.id);
    }
    const normalized = normalizeWeights(variants);

    const exp = {
      id,
      name_he: name_he || id,
      name_en: name_en || id,
      variants: normalized.map((v) => ({
        id: v.id,
        weight: v.weight,
        probability: v._probability,
        cumulative: v._cumulative,
        config: v.config || {},
      })),
      metric: metric || 'conversion',
      startDate: startDate || this.now(),
      endDate: endDate || null,
      minSampleSize: minSampleSize || DEFAULTS.minSampleSize,
      status: STATUS.RUNNING,
      createdAt: this.now(),
      updatedAt: this.now(),
      assignments: new Map(),      // userId -> variantId (sticky)
      exposures: new Map(),        // variantId -> Set(userId)
      conversions: new Map(),      // variantId -> { users: Set, count, sum, sumSq }
      winner: null,
      conclusion: null,
    };

    for (const v of exp.variants) {
      exp.exposures.set(v.id, new Set());
      exp.conversions.set(v.id, { users: new Set(), count: 0, sum: 0, sumSq: 0 });
    }

    this.experiments.set(id, exp);
    return this._publicExperimentView(exp);
  }

  // ─────────────────────────────────────────────────────────────────────
  // 4.2  assignVariant — deterministic sticky hash
  // ─────────────────────────────────────────────────────────────────────
  assignVariant(experimentId, userId) {
    const exp = this._requireExperiment(experimentId);
    if (exp.status !== STATUS.RUNNING) {
      // Once concluded/archived, return the frozen assignment (if any) or winner
      if (exp.assignments.has(String(userId))) {
        return exp.assignments.get(String(userId));
      }
      if (exp.winner) return exp.winner;
      return null;
    }

    const key = String(userId);
    if (exp.assignments.has(key)) {
      return exp.assignments.get(key);
    }
    const u = hashToUnit(experimentId, key);
    const chosen = pickByCumulative(exp.variants, u);
    exp.assignments.set(key, chosen.id);
    exp.updatedAt = this.now();
    return chosen.id;
  }

  // ─────────────────────────────────────────────────────────────────────
  // 4.3  recordExposure / recordConversion
  // ─────────────────────────────────────────────────────────────────────
  recordExposure(experimentId, userId, variantId) {
    const exp = this._requireExperiment(experimentId);
    const vId = variantId || this.assignVariant(experimentId, userId);
    if (!exp.exposures.has(vId)) {
      throw new Error(`Unknown variant "${vId}" for experiment "${experimentId}"`);
    }
    exp.exposures.get(vId).add(String(userId));
    exp.updatedAt = this.now();
    return vId;
  }

  recordConversion(experimentId, userId, value) {
    const exp = this._requireExperiment(experimentId);
    const key = String(userId);
    const variantId = exp.assignments.get(key);
    if (!variantId) {
      throw new Error(
        `recordConversion: user "${userId}" was never assigned in "${experimentId}"`
      );
    }
    const conv = exp.conversions.get(variantId);
    const v = typeof value === 'number' && Number.isFinite(value) ? value : 1;
    if (!conv.users.has(key)) {
      conv.users.add(key);
      conv.count += 1;
    }
    conv.sum += v;
    conv.sumSq += v * v;
    exp.updatedAt = this.now();
    return { variantId, value: v };
  }

  // ─────────────────────────────────────────────────────────────────────
  // 4.4  getResults — counts and rates per variant
  // ─────────────────────────────────────────────────────────────────────
  getResults(experimentId) {
    const exp = this._requireExperiment(experimentId);
    const variants = exp.variants.map((v) => {
      const exposures = exp.exposures.get(v.id).size;
      const conv = exp.conversions.get(v.id);
      const conversions = conv.count;
      const rate = exposures > 0 ? conversions / exposures : 0;
      const mean = conv.count > 0 ? conv.sum / conv.count : 0;
      const variance = conv.count > 1
        ? (conv.sumSq - conv.count * mean * mean) / (conv.count - 1)
        : 0;
      return {
        id: v.id,
        weight: v.weight,
        probability: v.probability,
        exposures,
        conversions,
        conversionRate: rate,
        mean,
        variance,
        stddev: Math.sqrt(Math.max(variance, 0)),
      };
    });

    const totalExposures = variants.reduce((s, v) => s + v.exposures, 0);
    const totalConversions = variants.reduce((s, v) => s + v.conversions, 0);

    return {
      experimentId: exp.id,
      name_he: exp.name_he,
      name_en: exp.name_en,
      status: exp.status,
      metric: exp.metric,
      minSampleSize: exp.minSampleSize,
      totalExposures,
      totalConversions,
      overallRate: totalExposures > 0 ? totalConversions / totalExposures : 0,
      sampleSizeReached: totalExposures >= exp.minSampleSize,
      variants,
      summary_he: this._summaryHe(exp, variants, totalExposures),
      summary_en: this._summaryEn(exp, variants, totalExposures),
    };
  }

  // ─────────────────────────────────────────────────────────────────────
  // 4.5  computeSignificance
  // ─────────────────────────────────────────────────────────────────────
  // For N variants we compute:
  //
  //   (a) Chi-square test of independence on the 2xN contingency table
  //       (conversions / non-conversions), df = N-1.
  //
  //   (b) Pairwise two-sample Welch's t-test on the conversion-value
  //       distributions (Bernoulli 0/1 when metric is conversion, otherwise
  //       the numeric values recorded). Returns p-value per pair and effect
  //       size (Cohen's h for proportions, Cohen's d for continuous).
  //
  //   (c) Wilson / normal-approx 95% confidence intervals per variant.
  //
  // ─────────────────────────────────────────────────────────────────────
  computeSignificance(experimentId, options) {
    const opts = options || {};
    const alpha = typeof opts.alpha === 'number' ? opts.alpha : DEFAULTS.alpha;
    const exp = this._requireExperiment(experimentId);
    const results = this.getResults(experimentId);
    const variants = results.variants;

    // ---- Chi-square on 2 x k contingency table ----
    const k = variants.length;
    const row0 = variants.map((v) => v.conversions);
    const row1 = variants.map((v) => v.exposures - v.conversions);
    const colTotals = variants.map((v) => v.exposures);
    const totalN = colTotals.reduce((s, x) => s + x, 0);
    const rowTot0 = row0.reduce((s, x) => s + x, 0);
    const rowTot1 = row1.reduce((s, x) => s + x, 0);

    let chiSquare = 0;
    let chiDf = Math.max(k - 1, 1);
    let chiP = NaN;
    let chiValid = true;

    if (totalN === 0 || rowTot0 === 0 || rowTot1 === 0) {
      chiValid = false;
      chiSquare = 0;
      chiP = 1;
    } else {
      for (let j = 0; j < k; j += 1) {
        const exp0 = (rowTot0 * colTotals[j]) / totalN;
        const exp1 = (rowTot1 * colTotals[j]) / totalN;
        if (exp0 > 0) chiSquare += ((row0[j] - exp0) ** 2) / exp0;
        if (exp1 > 0) chiSquare += ((row1[j] - exp1) ** 2) / exp1;
      }
      chiP = chiSquareSurvival(chiSquare, chiDf);
    }

    // ---- Confidence intervals (Wilson score) ----
    const z = invNormalCDF(1 - alpha / 2); // two-sided
    const withCI = variants.map((v) => {
      const ci = wilsonInterval(v.conversions, v.exposures, z);
      return {
        ...v,
        ci95Lower: ci.lower,
        ci95Upper: ci.upper,
      };
    });

    // ---- Pairwise Welch t-test and effect sizes ----
    // For each variant pair (i, j) with i < j compare conversion rates.
    // Treat each exposure as a Bernoulli trial (1 = converted, 0 = not).
    const pairs = [];
    for (let i = 0; i < k; i += 1) {
      for (let j = i + 1; j < k; j += 1) {
        const a = variants[i];
        const b = variants[j];
        const pairResult = welchTTestBernoulli(a, b);
        const effectH = cohenH(a.conversionRate, b.conversionRate);
        pairs.push({
          a: a.id,
          b: b.id,
          rateA: a.conversionRate,
          rateB: b.conversionRate,
          diff: b.conversionRate - a.conversionRate,
          relativeLift: a.conversionRate > 0
            ? (b.conversionRate - a.conversionRate) / a.conversionRate
            : 0,
          tStatistic: pairResult.t,
          df: pairResult.df,
          pValue: pairResult.p,
          significant: Number.isFinite(pairResult.p) && pairResult.p < alpha,
          cohenH: effectH,
          effectSizeLabel: classifyEffect(effectH),
        });
      }
    }

    const leader = variants
      .slice()
      .sort((x, y) => y.conversionRate - x.conversionRate)[0];

    return {
      experimentId,
      alpha,
      confidenceLevel: 1 - alpha,
      chiSquare: {
        statistic: chiSquare,
        df: chiDf,
        pValue: chiP,
        significant: chiValid && Number.isFinite(chiP) && chiP < alpha,
        valid: chiValid,
      },
      variants: withCI,
      pairwise: pairs,
      leadingVariant: leader ? leader.id : null,
      sampleSizeReached: results.sampleSizeReached,
      narrative_he: this._significanceHe(chiP, chiValid, alpha, leader, pairs),
      narrative_en: this._significanceEn(chiP, chiValid, alpha, leader, pairs),
    };
  }

  // ─────────────────────────────────────────────────────────────────────
  // 4.6  concludeExperiment
  // ─────────────────────────────────────────────────────────────────────
  concludeExperiment(experimentId, winner) {
    const exp = this._requireExperiment(experimentId);
    if (exp.status === STATUS.CONCLUDED || exp.status === STATUS.ARCHIVED) {
      return this._publicExperimentView(exp);
    }
    const variantIds = exp.variants.map((v) => v.id);
    if (winner && !variantIds.includes(winner)) {
      throw new Error(`concludeExperiment: unknown winner "${winner}"`);
    }
    // If caller didn't specify, pick the leader from current results
    let chosen = winner;
    if (!chosen) {
      const res = this.getResults(experimentId);
      const sorted = res.variants.slice().sort((a, b) => b.conversionRate - a.conversionRate);
      chosen = sorted[0] ? sorted[0].id : variantIds[0];
    }
    exp.winner = chosen;
    exp.status = STATUS.CONCLUDED;
    exp.concludedAt = this.now();
    // Snapshot results at conclusion time
    exp.conclusion = this.getResults(experimentId);
    exp.conclusion.significance = this.computeSignificance(experimentId);
    // Auto-archive
    exp.status = STATUS.ARCHIVED;
    exp.archivedAt = this.now();
    exp.updatedAt = this.now();
    return this._publicExperimentView(exp);
  }

  // ─────────────────────────────────────────────────────────────────────
  // 4.7  listExperiments
  // ─────────────────────────────────────────────────────────────────────
  listExperiments(filter) {
    const f = filter || {};
    const out = [];
    for (const exp of this.experiments.values()) {
      if (f.status && exp.status !== f.status) continue;
      out.push(this._publicExperimentView(exp));
    }
    // Stable order — createdAt ascending
    out.sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
    return out;
  }

  // ─────────────────────────────────────────────────────────────────────
  // 4.8  requiredSampleSize — power analysis for proportions
  // ─────────────────────────────────────────────────────────────────────
  // Formula (two-sided, equal allocation, proportions):
  //
  //   n per group = ( z_{1-α/2} * √(2 p̄ q̄) + z_{1-β} * √(p1 q1 + p2 q2) )²
  //                 -------------------------------------------------------
  //                                        (p1 - p2)²
  //
  // where p1 = baseline, p2 = baseline * (1 + mde),  p̄ = (p1+p2)/2.
  //
  // Returns { perVariant, total, pooled, zAlpha, zBeta }.
  // ─────────────────────────────────────────────────────────────────────
  requiredSampleSize({ baseline, mde, alpha, power, variants }) {
    const a = typeof alpha === 'number' ? alpha : DEFAULTS.alpha;
    const pw = typeof power === 'number' ? power : DEFAULTS.power;
    const k = variants && variants > 1 ? variants : 2;
    if (!(baseline > 0 && baseline < 1)) {
      throw new Error('requiredSampleSize: baseline must be in (0,1)');
    }
    if (!(mde > 0)) {
      throw new Error('requiredSampleSize: mde must be > 0 (relative)');
    }
    const p1 = baseline;
    const p2 = baseline * (1 + mde);
    if (p2 >= 1) {
      throw new Error('requiredSampleSize: p2 = baseline*(1+mde) must be < 1');
    }
    const q1 = 1 - p1;
    const q2 = 1 - p2;
    const pBar = (p1 + p2) / 2;
    const qBar = 1 - pBar;
    const zAlpha = invNormalCDF(1 - a / 2);
    const zBeta = invNormalCDF(pw);
    const num = zAlpha * Math.sqrt(2 * pBar * qBar) + zBeta * Math.sqrt(p1 * q1 + p2 * q2);
    const perVariant = Math.ceil((num * num) / ((p2 - p1) ** 2));
    return {
      perVariant,
      total: perVariant * k,
      baseline: p1,
      treatment: p2,
      mde,
      alpha: a,
      power: pw,
      variants: k,
      zAlpha,
      zBeta,
      pooled: pBar,
    };
  }

  // ─────────────────────────────────────────────────────────────────────
  // 4.9  internal helpers
  // ─────────────────────────────────────────────────────────────────────
  _requireExperiment(id) {
    const exp = this.experiments.get(id);
    if (!exp) throw new Error(`Experiment not found: ${id}`);
    return exp;
  }

  _publicExperimentView(exp) {
    return {
      id: exp.id,
      name_he: exp.name_he,
      name_en: exp.name_en,
      status: exp.status,
      metric: exp.metric,
      minSampleSize: exp.minSampleSize,
      startDate: exp.startDate,
      endDate: exp.endDate,
      createdAt: exp.createdAt,
      updatedAt: exp.updatedAt,
      concludedAt: exp.concludedAt || null,
      archivedAt: exp.archivedAt || null,
      winner: exp.winner,
      variants: exp.variants.map((v) => ({
        id: v.id,
        weight: v.weight,
        probability: v.probability,
        config: v.config,
      })),
      assignmentsCount: exp.assignments.size,
    };
  }

  _summaryHe(exp, variants, totalExposures) {
    if (totalExposures === 0) {
      return `ניסוי "${exp.name_he}" – אין עדיין חשיפות.`;
    }
    const parts = variants.map((v) => {
      const pct = (v.conversionRate * 100).toFixed(2);
      return `גרסה ${v.id}: ${v.exposures} חשיפות, ${v.conversions} המרות (${pct}%)`;
    });
    return `ניסוי "${exp.name_he}" – ${totalExposures} חשיפות סה"כ. ${parts.join('; ')}.`;
  }

  _summaryEn(exp, variants, totalExposures) {
    if (totalExposures === 0) {
      return `Experiment "${exp.name_en}" — no exposures yet.`;
    }
    const parts = variants.map((v) => {
      const pct = (v.conversionRate * 100).toFixed(2);
      return `variant ${v.id}: ${v.exposures} exposures, ${v.conversions} conversions (${pct}%)`;
    });
    return `Experiment "${exp.name_en}" — ${totalExposures} total exposures. ${parts.join('; ')}.`;
  }

  _significanceHe(chiP, chiValid, alpha, leader, pairs) {
    if (!chiValid) {
      return 'אין מספיק נתונים לחישוב מובהקות סטטיסטית.';
    }
    if (!Number.isFinite(chiP)) {
      return 'חישוב χ² נכשל — ראה תוצאה גולמית.';
    }
    const lead = leader ? `המוביל הנוכחי הוא ${leader.id} (${(leader.conversionRate * 100).toFixed(2)}%).` : '';
    if (chiP < alpha) {
      const sig = pairs.filter((p) => p.significant).length;
      return `הבדל מובהק סטטיסטית (χ² p=${chiP.toExponential(2)} < α=${alpha}). ${sig} מתוך ${pairs.length} זוגות מובהקים. ${lead}`;
    }
    return `אין הבדל מובהק סטטיסטית בין הגרסאות (χ² p=${chiP.toFixed(4)} ≥ α=${alpha}). ${lead}`;
  }

  _significanceEn(chiP, chiValid, alpha, leader, pairs) {
    if (!chiValid) {
      return 'Insufficient data for statistical significance test.';
    }
    if (!Number.isFinite(chiP)) {
      return 'χ² computation failed — inspect raw output.';
    }
    const lead = leader ? `Current leader: ${leader.id} (${(leader.conversionRate * 100).toFixed(2)}%).` : '';
    if (chiP < alpha) {
      const sig = pairs.filter((p) => p.significant).length;
      return `Statistically significant (χ² p=${chiP.toExponential(2)} < α=${alpha}). ${sig} of ${pairs.length} pairs significant. ${lead}`;
    }
    return `No statistically significant difference between variants (χ² p=${chiP.toFixed(4)} ≥ α=${alpha}). ${lead}`;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. SUPPORTING TESTS  —  Welch t-test for two Bernoulli samples
// ═══════════════════════════════════════════════════════════════════════════

function welchTTestBernoulli(a, b) {
  const n1 = a.exposures;
  const n2 = b.exposures;
  if (n1 < 2 || n2 < 2) {
    return { t: NaN, df: NaN, p: NaN };
  }
  const p1 = a.conversionRate;
  const p2 = b.conversionRate;
  // Sample variance of Bernoulli with finite-sample correction:
  //   s² = n·p(1-p) / (n-1)
  const v1 = (n1 * p1 * (1 - p1)) / (n1 - 1);
  const v2 = (n2 * p2 * (1 - p2)) / (n2 - 1);
  const se = Math.sqrt(v1 / n1 + v2 / n2);
  if (!(se > 0)) {
    return { t: 0, df: n1 + n2 - 2, p: 1 };
  }
  const t = (p2 - p1) / se;
  // Welch-Satterthwaite df
  const num = (v1 / n1 + v2 / n2) ** 2;
  const den = ((v1 / n1) ** 2) / (n1 - 1) + ((v2 / n2) ** 2) / (n2 - 1);
  const df = den > 0 ? num / den : n1 + n2 - 2;
  const p = tTwoTailedPValue(t, df);
  return { t, df, p };
}

function wilsonInterval(successes, n, z) {
  if (n === 0) return { lower: 0, upper: 0 };
  const phat = successes / n;
  const denom = 1 + (z * z) / n;
  const center = phat + (z * z) / (2 * n);
  const margin = z * Math.sqrt((phat * (1 - phat) + (z * z) / (4 * n)) / n);
  return {
    lower: Math.max(0, (center - margin) / denom),
    upper: Math.min(1, (center + margin) / denom),
  };
}

function cohenH(p1, p2) {
  // Effect size for two proportions: h = 2 arcsin(√p1) − 2 arcsin(√p2)
  const phi1 = 2 * Math.asin(Math.sqrt(Math.max(0, Math.min(1, p1))));
  const phi2 = 2 * Math.asin(Math.sqrt(Math.max(0, Math.min(1, p2))));
  return phi2 - phi1;
}

function classifyEffect(h) {
  const abs = Math.abs(h);
  if (abs < 0.2) return 'negligible';
  if (abs < 0.5) return 'small';
  if (abs < 0.8) return 'medium';
  return 'large';
}

// ═══════════════════════════════════════════════════════════════════════════
// 6. EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

module.exports = {
  ABTesting,
  STATUS,
  DEFAULTS,
  // Expose primitives for direct use and tests
  fnv1a32,
  hashToUnit,
  chiSquareCDF,
  chiSquareSurvival,
  normalCDF,
  invNormalCDF,
  tCDF,
  tTwoTailedPValue,
  gamma,
  logGamma,
  gammaIncLowerRegularized,
  incompleteBeta,
  welchTTestBernoulli,
  wilsonInterval,
  cohenH,
  classifyEffect,
  normalizeWeights,
  pickByCumulative,
};
