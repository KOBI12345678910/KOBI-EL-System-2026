# AG-Y169 — A/B Test Router / נתב ניסויי A/B

**Status:** PASS (24/24 tests green)
**Date:** 2026-04-11
**Module:** `onyx-procurement/src/devops/ab-router.js`
**Tests:** `onyx-procurement/test/devops/ab-router.test.js`
**Rule enforced:** לא מוחקים רק משדרגים ומגדלים (never delete — only upgrade and grow)
**Zero external dependencies.** Pure JavaScript. `node:test` + `node:assert/strict` only.

---

## 1. Purpose / מטרה

A deterministic router for multi-experiment A/B/n testing that solves the four
classic pitfalls of ad-hoc experimentation plumbing:

נתב דטרמיניסטי לניסויי A/B/n מרובים הפותר את ארבע הבעיות הקלאסיות של תשתית
ניסויים אד-הוק:

1. **Assignment consistency** — same `(experimentId, userId)` always yields the
   same variant across processes and restarts, with no session store.
   **עקביות שיוך** — אותו זוג `(experimentId, userId)` תמיד מחזיר את אותו
   וריאנט בכל התהליכים וההפעלות מחדש, ללא צורך במאגר סשנים.

2. **Holdout groups** — a percentage of traffic is reserved and always served
   control; holdout is evaluated before any experiment and is sticky per user.
   **קבוצות דחייה** — אחוז מהתנועה שמור ומקבל תמיד control; הדחייה מוערכת
   לפני כל ניסוי ודביקה למשתמש.

3. **Mutually exclusive experiments** — experiments share a `mutexGroup` (aka
   layer); any given user is owned by exactly one experiment in that group.
   **ניסויים מנוגדים** — ניסויים חולקים `mutexGroup` (שכבה); כל משתמש נתון
   שייך בדיוק לניסוי אחד בקבוצה.

4. **Sample Ratio Mismatch (SRM) detection** — chi-square goodness-of-fit
   between observed counts and configured weights, with severity buckets and
   bilingual verdict.
   **זיהוי סטייה במדגם (SRM)** — חי-בריבוע של טיב התאמה בין כמות נצפית
   למשקלים המוגדרים, עם דרגות חומרה ותשובה דו-לשונית.

---

## 2. API Surface / ממשק

### Constructor
```js
new ABRouter({
  holdoutPct,         // 0..1, default 0
  holdoutNamespace,   // string, default 'holdout'
  minSamplesForSRM,   // int, default 100
})
```

### Experiment registry
- `registerExperiment({ id, title_he, title_en, variants, mutexGroup, enabled })`
- `getExperiment(id)`
- `listExperiments({ enabled?, mutexGroup? })`
- `disableExperiment(id)` / `enableExperiment(id)`

### Assignment (the star of the show)
- `assign(experimentId, userId)` → bilingual `AssignmentResult`

### Holdout
- `setHoldoutPct(pct)`
- `isUserInHoldout(userId)` (boolean, sticky)

### SRM
- `srmForExperiment(experimentId)` → `{ observed, expected, chiSquare, df, pValue, severity, message_he, message_en }`
- `srmCheck(observedMap, expectedWeightsMap, { minSamples })` — standalone helper

### Counters + logs
- `getAssignmentCounts(id)`
- `getLogs({ kind?, experimentId?, userId? })`
- `stats()` — bilingual router-level summary

### Primitives exposed for re-use / tests
`fnv1a32`, `hashToUnit`, `normalizeWeights`, `pickByCumulative`, `srmCheck`,
`chiSquareCDF`, `chiSquareSurvival`, `gammaIncLowerRegularized`, `logGamma`.

---

## 3. `AssignmentResult` shape / מבנה תוצאה

```js
{
  experimentId: 'exp-color',
  userId: 'user-42',
  variant: 'treatment' | 'control' | ...,
  reason: 'assigned' | 'holdout' | 'mutex-locked' | 'experiment-disabled' | 'experiment-not-found',
  reason_he: 'שויך' | 'קבוצת הדחייה' | 'נעול בקבוצת בידוד' | 'ניסוי כבוי' | 'ניסוי לא נמצא',
  reason_en: 'assigned' | 'holdout group' | 'locked by mutex group' | 'experiment disabled' | 'experiment not found',
  holdout: Boolean,
  mutexLocked: Boolean,
  mutexOwner?: 'exp-id',   // present when mutex-locked
  mutexGroup?: 'layer-id', // present when mutex-locked
  at: ISO8601,
}
```

Every bilingual log entry emitted by the router carries `message_he` and
`message_en` + `kind`, `experimentId`, `userId`, `variant`, `at`.

---

## 4. Determinism & hashing / דטרמיניזם והאשינג

The router uses **FNV-1a 32-bit** composed as `namespace:experimentId:userId`.
Three namespaces are used:

- `holdout` — global holdout check (experiment-agnostic)
- `mutex`   — mutex group owner election (per-candidate)
- `assign`  — variant bucketing within a winning experiment

Independent namespaces mean:
- Being in holdout for one user is uncorrelated with being in any variant.
- Mutex ownership is uncorrelated with variant bucketing.
- Running the same experiment id in a fresh process produces identical routing.

FNV-1a was chosen because it is tiny, portable, deterministic, and well-enough
distributed for non-cryptographic bucketing. The hash output is divided by
2^32 to yield a float in `[0,1)`.

---

## 5. Mutex owner election / בחירת בעלים בקבוצת בידוד

When a user lands on an experiment that belongs to a mutex group, we elect a
single owner for that `(group, user)` pair as follows:

1. Enumerate enabled experiments in the group (order-independent).
2. For each candidate, compute `hashToUnit('mutex', candidateId, userId)`.
3. The candidate with the smallest hash wins. Ties break on experiment id.

Because the hash is deterministic, the same user always elects the same owner,
and the owner distribution across users is uniform over the group members.

This lets callers invoke `assign('exp-one', userId)` and `assign('exp-two', userId)`
in either order — one of the two will return `reason: 'assigned'` and the other
will return `reason: 'mutex-locked', variant: 'control'`.

---

## 6. SRM (Sample Ratio Mismatch) check

`srmCheck(observed, expected, { minSamples })` performs a chi-square
goodness-of-fit test between observed counts and expected weights:

```
chi^2 = Σ (O_i - E_i)^2 / E_i
df    = k - 1
p     = 1 - CDF_chi2(chi^2, df)
```

Severity buckets:

| p-value range | severity   | action                         |
|---------------|------------|--------------------------------|
| >= 0.05       | `ok`       | healthy                        |
| < 0.05        | `minor`    | suspicious, keep watching      |
| < 0.01        | `major`    | investigate                    |
| < 0.001       | `critical` | **stop the experiment**        |

Below `minSamplesForSRM` (default 100) we always return `ok` to avoid early
flapping on tiny samples.

Bilingual verdict strings:

| severity  | Hebrew                                        | English                                      |
|-----------|-----------------------------------------------|----------------------------------------------|
| ok        | התפלגות תקינה                                 | distribution looks healthy                   |
| minor     | חשד קל לחוסר איזון במדגם                      | minor sample ratio mismatch suspected        |
| major     | חוסר איזון מובהק במדגם — לבדוק                | major sample ratio mismatch — investigate    |
| critical  | חוסר איזון חמור במדגם — לעצור ניסוי           | critical sample ratio mismatch — stop experiment |

---

## 7. Chi-square math implemented from scratch

Numerical primitives (no `jStat`, no `simple-statistics`):

- `logGamma(x)` — Lanczos approximation, g=7, 9 coefficients (Numerical Recipes §6.1).
- `gammaIncLowerRegularized(a, x)` — `P(a, x)`; series for `x < a+1`, continued
  fraction (Lentz) for `x >= a+1`, 200-iter cap, 1e-15 tolerance.
- `chiSquareCDF(x, df) = gammaIncLowerRegularized(df/2, x/2)`.
- `chiSquareSurvival(x, df) = 1 - chiSquareCDF(x, df)`.

Test **18. chiSquareCDF reference values** verifies against standard textbook
critical values:

- `P(X ≤ 3.841 | df=1) ≈ 0.95`
- `P(X ≤ 5.991 | df=2) ≈ 0.95`
- `P(X ≤ 11.070 | df=5) ≈ 0.95`

All three match within 1e-3.

---

## 8. Never-delete invariant / שמירה על כלל אי-מחיקה

- Experiments are never removed from the `experiments` Map. `disableExperiment`
  only sets `enabled = false`; `enableExperiment` flips it back.
- `assignmentCounts` only increments; there is no `resetCounts` call.
- `logs` is append-only (every `_log()` push, no splice, no truncation).
- Mutex groups only grow (`this.mutexGroups.get(group).add(expId)`).
- Compatible with the repo-wide rule: **לא מוחקים רק משדרגים ומגדלים**.

---

## 9. Test coverage / כיסוי בדיקות

24 tests across all surfaces:

```
✔ 01. constants and exports are present / קבועים וייצואים קיימים
✔ 02. FNV-1a is deterministic / hash דטרמיניסטי
✔ 03. hashToUnit in [0,1) and namespaces disagree / טווח [0,1) ורחבי שם
✔ 04. normalizeWeights sums to 1 / נרמול משקלים
✔ 05. registerExperiment validates / אימות רישום ניסוי
✔ 06. assign() sticky across repeated calls / שיוך דביק
✔ 07. assign() sticky across fresh routers / עקביות בין תהליכים
✔ 08. weighted distribution matches split / התפלגות לפי משקלים
✔ 09. holdout serves control and is sticky / קבוצת דחייה דביקה
✔ 10. holdoutPct=0 means no holdout / 0% = אין דחייה
✔ 11. mutex group locks user into one experiment / קבוצת בידוד נועלת
✔ 12. mutex owner is sticky / בעלות בידוד דביקה
✔ 13. disabled experiment returns control / ניסוי כבוי
✔ 14. unknown experiment returns control / ניסוי לא ידוע
✔ 15. SRM — healthy 50/50 split is ok / SRM על התפלגות תקינה
✔ 16. SRM — 60/40 skew on 10k flags critical / SRM על סטייה חמורה
✔ 17. SRM — tiny sample returns ok / SRM על מדגם קטן
✔ 18. chiSquareCDF reference values / CDF של חי-בריבוע
✔ 19. srmForExperiment exposes observed + expected / SRM לניסוי
✔ 20. assign() returns bilingual reason labels / תוויות דו-לשוניות
✔ 21. getLogs filters correctly / סינון יומנים
✔ 22. stats() bilingual summary / סיכום נתב
✔ 23. setHoldoutPct validates range / אימות טווח
✔ 24. holdout + mutex users excluded from SRM counts / דחויים לא נספרים

tests 24
pass  24
fail  0
duration_ms ~200
```

Run locally with:

```bash
node --test test/devops/ab-router.test.js
```

---

## 10. Operational notes / הערות תפעול

- **Cross-process consistency (בין תהליכים)** — tests 06 and 07 together show
  that a fresh router instance with the same experiment spec reproduces the
  exact same assignments for the same users. No shared storage needed.

- **Scaling holdout after launch** — increasing `holdoutPct` is safe: users who
  were already in holdout stay in holdout (their hash is unchanged, and the
  threshold can only grow). Shrinking holdout is also sticky from the shrunk
  side. Do **not** change `holdoutNamespace` mid-flight or every user will be
  re-rolled.

- **Adding a new experiment to an existing mutex group** — safe. Existing users
  keep their current owner because the new sibling only wins for users whose
  hash against the new experiment id happens to be the smallest; for every
  other user, the existing owner still has a smaller hash. Users whose hash
  against the new sibling *is* the smallest will be re-routed to the new
  experiment — this is unavoidable in a mutex layer without global allocation
  tracking, and it is the price of zero persistence. In practice, freeze
  mutex-group membership for the duration of any running experiment.

- **Disabling a winning mutex sibling** — users who were owned by the disabled
  experiment get re-elected to the next smallest hash among the remaining
  enabled siblings. The `_pickMutexOwner` routine already filters to
  `enabled === true`.

- **SRM polling cadence** — call `srmForExperiment()` on a cron (e.g. hourly)
  and page on `severity === 'critical'`. `minor`/`major` should feed a
  dashboard, not a pager.

---

## 11. Integration points / נקודות אינטגרציה

- `onyx-procurement/src/experiments/ab-testing.js` — the existing A/B testing
  framework (AG-X99) owns conversion tracking, significance tests, and power
  analysis. Y-169 is the **router** — it answers "which variant does this user
  see?". The two can coexist: Y-169 feeds assignments, X99 records exposures
  and conversions.
- `onyx-procurement/src/flags/feature-flags.js` — feature flag evaluation can
  call `ABRouter.assign` to vary a flag by experiment cohort.
- `onyx-procurement/src/devops/` — other DevOps tooling (deploy gates, canaries,
  shadow launches) can import the same FNV-1a primitives for consistent
  traffic slicing.

---

## 12. Dependencies / תלויות

**None.** The module uses only built-in JavaScript (`Math`, `Date`, `Map`,
`Set`, `Object`). Tests use only `node:test` and `node:assert/strict`.

- No `jStat` / `simple-statistics` — chi-square math is implemented here.
- No `uuid` / `nanoid` — callers provide their own user ids.
- No `lodash` — small standalone helpers suffice.
- No network, file I/O, or process primitives — everything is pure in-memory.

---

## 13. Files / קבצים

| File                                                         | Lines | Purpose                          |
|--------------------------------------------------------------|------:|----------------------------------|
| `onyx-procurement/src/devops/ab-router.js`                   |  ~550 | Implementation                   |
| `onyx-procurement/test/devops/ab-router.test.js`             |  ~400 | 24 tests                         |
| `_qa-reports/AG-Y169-ab-router.md`                           |  this | This report                      |

---

## 14. Verdict / פסק דין

**PASS — production ready.**
**עבר — מוכן לייצור.**

- 24/24 tests green, including determinism, holdout stickiness, mutex
  exclusivity, SRM severity buckets, and chi-square reference values.
- Zero external dependencies.
- Every public return value and log line is bilingual (Hebrew + English).
- Never-delete invariant preserved (only disable/enable, only append).
