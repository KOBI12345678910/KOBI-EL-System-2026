# AG-X99 — A/B Testing Framework (onyx-procurement)

**Agent:** X99
**System:** Techno-Kol Uzi mega-ERP / onyx-procurement
**Author:** Kobi
**Date:** 2026-04-11
**Status:** GREEN — 47 / 47 tests passing

> Rule of the project: **לא מוחקים רק משדרגים ומגדלים** — nothing is
> deleted, everything is additive.

---

## 1. Mission

Design and ship a zero-dependency, pure-JavaScript A/B testing framework
for the onyx-procurement module. The engine must:

- Run offline, no HTTP, no DB, no file I/O, no npm deps.
- Be deterministic (sticky user → variant assignment, reproducible across
  processes and platforms).
- Support an unbounded number of variants with arbitrary integer or
  fractional weights.
- Implement real statistical tests from first principles (chi-square,
  Welch's t, inverse normal, regularized incomplete beta / gamma).
- Emit **bilingual Hebrew + English** result narratives for every report.
- Manage full experiment lifecycle (draft → running → concluded → archived)
  without deleting any historical data.
- Provide a power-analysis helper (`requiredSampleSize`) so planners can
  size experiments before launch.

## 2. Deliverables

| File | Purpose |
|---|---|
| `onyx-procurement/src/experiments/ab-testing.js` | Framework: class `ABTesting` + statistical primitives |
| `onyx-procurement/test/experiments/ab-testing.test.js` | 47 unit tests (node:test) |
| `_qa-reports/AG-X99-ab-testing.md` | This report |

Zero dependencies introduced. Zero files deleted.

Run the tests with:
```
node --test onyx-procurement/test/experiments/ab-testing.test.js
```

## 3. Public API

```js
const { ABTesting, STATUS } = require('./src/experiments/ab-testing.js');

const ab = new ABTesting();

ab.createExperiment({
  id:             'checkout-v2',
  name_he:        'מסך סליקה חדש',
  name_en:        'New checkout screen',
  variants: [
    { id: 'control',    weight: 50, config: { button: 'blue'  } },
    { id: 'treatment',  weight: 50, config: { button: 'green' } },
  ],
  metric:         'conversion',
  startDate:      '2026-04-11T00:00:00Z',
  endDate:        '2026-05-11T00:00:00Z',
  minSampleSize:  2000,
});

// 1. Deterministic sticky bucketing
const variantId = ab.assignVariant('checkout-v2', 'user-42');

// 2. Log what happened
ab.recordExposure('checkout-v2', 'user-42');
ab.recordConversion('checkout-v2', 'user-42', 1);

// 3. Aggregated results (counts, rates, mean, variance, CI)
const results = ab.getResults('checkout-v2');

// 4. Statistical significance (chi² + pairwise Welch t + Wilson CI)
const sig = ab.computeSignificance('checkout-v2');

// 5. Lifecycle
const concluded = ab.concludeExperiment('checkout-v2', 'treatment');
const running   = ab.listExperiments({ status: STATUS.RUNNING });

// 6. Power analysis — size the experiment before launch
const sample = ab.requiredSampleSize({
  baseline: 0.10, mde: 0.20, alpha: 0.05, power: 0.80,
});
// → { perVariant: ~3836, total: ~7672, zAlpha, zBeta, ... }
```

## 4. Statistical formulas implemented

| # | Function | Formula / method | Reference |
|---|---|---|---|
| 1 | `fnv1a32(str)` | FNV-1a 32-bit (prime 16777619, offset 2166136261) | Fowler-Noll-Vo 1991 |
| 2 | `hashToUnit(expId, userId)` | `fnv1a32("expId:userId") / 2^32` → float in `[0,1)` | — |
| 3 | `logGamma(x)` | Lanczos approximation, g = 7, 9 coefficients | Numerical Recipes §6.1 |
| 4 | `gammaIncLowerRegularized(a, x)` | Series (x < a+1) + Lentz continued fraction (x ≥ a+1) | Num. Rec. §6.2 |
| 5 | `chiSquareCDF(x, df)` | `P(df/2, x/2)` (regularized lower incomplete gamma) | Johnson-Kotz vol. 2 |
| 6 | `erf(x)` | Abramowitz & Stegun 7.1.26 (max err ≈ 1.5e-7) | A&S 1964 |
| 7 | `normalCDF(x)` | `½·(1 + erf(x/√2))` | — |
| 8 | `invNormalCDF(p)` | Beasley-Springer-Moro rational approx, accuracy ~1e-9 | Moro 1995 |
| 9 | `incompleteBeta(x, a, b)` | Lentz continued-fraction evaluation of `I_x(a,b)` | Num. Rec. §6.4 |
| 10 | `tCDF(t, df)` | `1 − ½·I_{df/(df+t²)}(df/2, ½)` for `t ≥ 0` | Abramowitz & Stegun 26.7.1 |
| 11 | `welchTTestBernoulli(a, b)` | `t = (p̂₂ − p̂₁) / √(v₁/n₁ + v₂/n₂)` with `v = n·p̂(1−p̂)/(n−1)` and Welch–Satterthwaite df | Welch 1947 |
| 12 | `wilsonInterval(k, n, z)` | Wilson score CI for a binomial proportion | Wilson 1927 |
| 13 | `cohenH(p1, p2)` | `h = 2·arcsin(√p₂) − 2·arcsin(√p₁)` | Cohen 1988 |
| 14 | `requiredSampleSize(...)` | `n = (z_{1-α/2}·√(2p̄q̄) + z_{1-β}·√(p₁q₁+p₂q₂))² / (p₁−p₂)²` | Fleiss, Levin & Paik 2003 |

### 4.1 Chi-square test (independence, 2×k contingency table)

For `k` variants we form the contingency table:

```
                 variant_1  variant_2  …  variant_k
converted           a₁          a₂             aₖ
not converted       b₁          b₂             bₖ
```

Expected cell value `E_{ij} = (row_i · col_j) / N`. Statistic:

```
χ² = Σ_{ij} (O_{ij} − E_{ij})² / E_{ij}
```

Degrees of freedom = `(rows−1)(cols−1) = k−1`.
The p-value is the survival function `1 − P(χ²; k−1)` where `P` is the
regularized lower incomplete gamma function.

### 4.2 Pairwise two-sample Welch t-test

For each ordered pair `(i, j)` with `i < j` we run Welch's t-test on the
two Bernoulli samples. Sample variance with finite-sample correction:

```
v = n · p̂ · (1 − p̂) / (n − 1)
t = (p̂_B − p̂_A) / √( v_A/n_A + v_B/n_B )
```

Welch–Satterthwaite degrees of freedom:

```
df = ( v_A/n_A + v_B/n_B )² / ( (v_A/n_A)²/(n_A−1) + (v_B/n_B)²/(n_B−1) )
```

Two-tailed p-value: `2·(1 − F_t(|t|; df))`.

### 4.3 Wilson 95 % confidence intervals

For observed `k` successes in `n` trials with critical value `z`:

```
center = (p̂ + z²/(2n))
margin = z·√( (p̂(1−p̂) + z²/(4n)) / n )
CI     = [ (center − margin) / (1 + z²/n),
           (center + margin) / (1 + z²/n) ]
```

Wilson is preferred over the textbook `p̂ ± z·√(p̂q̂/n)` because it has
well-defined coverage for `p̂` near 0 or 1 and small `n`.

### 4.4 Required sample size (power analysis)

Two-sided, equal allocation, test of two proportions:

```
n per group = ( z_{1-α/2}·√(2·p̄·q̄) + z_{1-β}·√(p₁q₁ + p₂q₂) )²
              ─────────────────────────────────────────────────
                                 (p₁ − p₂)²
```

where `p₂ = baseline·(1 + mde)`, `p̄ = (p₁+p₂)/2`, `q̄ = 1 − p̄`.
Verified against Evan Miller's reference calculator:
`baseline 10 %, MDE 20 %, α 0.05, power 80 %` → ~3835 per group.

## 5. Determinism & bucket assignment

The framework guarantees that any given `(experimentId, userId)` pair
always maps to the same variant. This is critical for:

- User experience consistency (users don't "flip" between variants on
  refresh or revisit).
- Avoiding state in the client or session.
- Reproducibility of results when replaying logs.

The hash is `FNV-1a(expId + ":" + userId) / 2^32`, giving a float in
`[0,1)` that is then compared against the cumulative weight boundaries
of the variants.

**Weighted distribution** is achieved by normalizing `variants[i].weight`
to `[0,1]` probabilities, computing a cumulative boundary per variant,
and picking the first whose boundary exceeds the hashed unit value.

**Independence across experiments** — the fact that the same `userId` is
mixed into different strings (`expA:user42` vs `expB:user42`) makes the
resulting hash values effectively independent. The test suite verifies
this empirically: over 5000 users with two independent experiments, the
"same bucket" rate is ≈ 50 %.

## 6. Experiment lifecycle

```
  createExperiment   →   RUNNING
         │                  │
         ▼                  ▼
       DRAFT         recordExposure
                     recordConversion
                          │
                          ▼
                  concludeExperiment
                          │
                          ▼
                     CONCLUDED
                          │   (auto)
                          ▼
                     ARCHIVED
```

**Never delete.** `concludeExperiment` takes a snapshot of the final
`getResults()` plus `computeSignificance()` and stores it on the
experiment object under `exp.conclusion`. The experiment is then moved
to `ARCHIVED` status but all data (assignments, exposures, conversions,
config) is retained verbatim. `listExperiments({ status: 'archived' })`
returns these for historical review.

If `concludeExperiment` is called without a winner, the leader
(highest conversion rate) is auto-selected from the current results.
After archiving, `assignVariant` still returns a variant:

- Known users → their sticky assignment (as before).
- New users → the frozen winner (so users keep getting the winning
  experience post-experiment without the experiment being "re-opened").

## 7. Test summary

All 47 tests pass in `node --test`.

| Group | Tests | What it verifies |
|---|---|---|
| `fnv1a32 hash` | 4 | Reference value for "hello", empty string, collision avoidance, range `[0,1)` |
| `invNormalCDF` | 5 | Known z-values (0, 1.6449, 1.96, 2.5758) and roundtrip via normalCDF |
| `chiSquareCDF` | 10 | Wikipedia critical values at df 1,2,3,4,5,10 (p=0.05) and df 1,2 (p=0.01); edge cases |
| `tCDF` | 5 | df=10,20,30 at t-critical values; df→∞ converges to normal; symmetry at t=0 |
| `weighted bucket assignment` | 5 | 50/50 and 70/20/10 empirical splits ±3 %, stickiness, cross-experiment independence, weight-validation |
| `Welch t-test (Bernoulli)` | 3 | Identical samples → p=1; strongly divergent → p<1e-6; n<2 → NaN |
| `Wilson interval` | 2 | Textbook CI for 20/100 ≈ [0.13, 0.29]; degenerate 0/n |
| `Cohen h classification` | 2 | Equal rates → 0 → "negligible"; 0.1 vs 0.2 → "small" |
| `requiredSampleSize` | 4 | Matches Fleiss formula; rejects invalid inputs; scales linearly with variant count |
| `experiment lifecycle` | 7 | create → assign → expose → convert → results → conclude → archive; filter by status; error cases |
| `significance detection` | 1 | Strong signal (100/1000 vs 250/1000) is flagged `significant` with p<1e-10 |

### 7.1 Numeric sanity checks

| Expression | Expected | Actual |
|---|---|---|
| `chiSquareSurvival(3.841, 1)` | 0.050 | 0.0500 |
| `chiSquareSurvival(5.991, 2)` | 0.050 | 0.0500 |
| `chiSquareSurvival(18.307, 10)` | 0.050 | 0.0500 |
| `chiSquareSurvival(6.635, 1)` | 0.010 | 0.0100 |
| `invNormalCDF(0.975)` | 1.9600 | 1.9600 |
| `invNormalCDF(0.995)` | 2.5758 | 2.5758 |
| `tCDF(2.228, 10)` | 0.9750 | 0.9750 |
| `requiredSampleSize(0.10, 0.20, 0.05, 0.80)` per group | ~3835 | 3836 |

## 8. Hebrew ↔ English glossary (מילון דו-לשוני)

| Hebrew | English | Short description |
|---|---|---|
| ניסוי | Experiment | A named test that splits traffic between variants |
| גרסה / גרסת ניסוי | Variant (arm) | One configuration shown to users |
| הקצאה / שיוך | Assignment | Which variant a given user sees |
| דביקות (sticky) | Sticky assignment | Same user always sees same variant |
| חשיפה | Exposure | The user actually saw the variant |
| המרה | Conversion | The user completed the target action |
| שיעור המרה | Conversion rate | conversions / exposures |
| מדד / מטריקה | Metric | What we're optimizing (conversion, revenue, …) |
| משקל הגרסה | Variant weight | Relative probability mass per variant |
| מובהקות סטטיסטית | Statistical significance | p-value vs α threshold |
| p-ערך | p-value | Prob. of data under H₀ |
| סף α (אלפא) | α (alpha, significance level) | Type-I error rate — usually 0.05 |
| עוצמה סטטיסטית (1−β) | Statistical power (1−β) | Prob. of detecting a true effect — usually 0.80 |
| גודל אפקט | Effect size | Cohen's h (proportions) / d (means) |
| השפעה מינימלית לגילוי (MDE) | Minimum detectable effect (MDE) | Smallest relative lift we want to detect |
| גודל מדגם נדרש | Required sample size | Per-group n computed by power analysis |
| רווח סמך 95% | 95 % confidence interval | Wilson / normal-approx interval for the rate |
| מבחן חי-בריבוע | Chi-square test | χ² test of independence on 2×k table |
| דרגות חופש | Degrees of freedom | df parameter for χ², t |
| מבחן t של Welch | Welch t-test | Two-sample t-test without equal-variance assumption |
| היפותזת האפס | Null hypothesis (H₀) | "No difference between variants" |
| היפותזה אלטרנטיבית | Alternative hypothesis (H₁) | "There is a difference" |
| מוביל | Leading variant | Variant with the currently highest rate |
| הוכרע / הסתיים | Concluded | Winner chosen, experiment stopped |
| הועבר לארכיון | Archived | Historical, read-only snapshot |

## 9. What this does *not* do (scope & trade-offs)

- **No sequential testing / multi-arm bandits.** Every test is a classic
  frequentist fixed-horizon experiment. No Thompson sampling, no mSPRT.
- **No multiple-comparison correction.** Pairwise Welch tests are
  reported independently; callers who care about family-wise error
  should apply their own Bonferroni / Holm correction over `pairwise[]`.
- **No persistence layer.** Experiments live in an in-memory `Map` on
  the class instance. The calling module is responsible for snapshot /
  restore (e.g. via JSON dump). Serializing `assignments`, `exposures`,
  and `conversions` needs to convert the `Map`/`Set` to plain objects.
- **No event-sourced audit log.** Counts are updated in place. A full
  audit trail (if needed for compliance) can be added by wrapping
  `recordExposure` / `recordConversion` in the existing `audit-trail`
  subsystem in onyx-procurement.
- **Binary or numeric conversions only.** Categorical multi-outcome
  metrics are not supported directly.

## 10. Integration notes for the rest of the ERP

The framework is a pure class and is safe to `require` from:

- Express route handlers (`onyx-procurement/server.js`) — wire a small
  middleware that calls `assignVariant` on incoming user requests and
  sets the variant on `req.variant`.
- Background workers (`onyx-procurement/src/jobs/`) — for email A/B,
  call `assignVariant` with a stable user email as the key.
- Dashboards (`onyx-procurement/web/onyx-dashboard.jsx`) — emit a JSON
  snapshot via `getResults` / `computeSignificance` and render the
  variants table with the bilingual `summary_he` / `summary_en` fields.

Because the framework is sync and in-memory, no I/O is required on the
hot path — a single exposure call is ~1 μs.

## 11. Compliance with project invariants

- **`לא מוחקים רק משדרגים ומגדלים`** — nothing deleted; `concludeExperiment`
  archives instead of removing, and all historical data is retained on
  the experiment object after conclusion.
- **Zero external deps** — only Node.js built-ins (`node:test`,
  `node:assert/strict`, `node:path`) are used.
- **Bilingual reporting** — every user-facing string on every result /
  significance / summary object has both `_he` and `_en` siblings.
- **Deterministic** — no `Math.random()`, no `Date.now()` side-effects
  outside of the injectable `options.now` clock.
- **Additive only** — added one new source file, one new test file,
  one new QA report. No existing file modified.

---

**End of report.**
