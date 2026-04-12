# AG-Y023 — Lead Scoring Engine (BANT + Behavioral)

**Agent:** Y023
**Module:** `onyx-procurement/src/sales/lead-scoring.js`
**Tests:** `onyx-procurement/test/sales/lead-scoring.test.js`
**Model version:** `Y023.1.0`
**Status:** PASS (33 / 33 tests)
**Rule honored:** לא מוחקים, רק משדרגים ומגדלים

---

## 1. Purpose

A transparent, explainable, zero-dependency lead scoring engine for the
Techno-Kol Uzi mega-ERP sales module. Every lead gets a 0..100 score,
a human class (Hot / Warm / Cool / Cold), and a bilingual
Hebrew + English per-factor explanation. The model can be retrained on
historical won/lost deals via logistic regression, and behavioral
signals decay exponentially over time so an old lead's engagement is
discounted — but never deleted.

---

## 2. Public API

```js
const { LeadScorer } = require('./src/sales/lead-scoring');

const scorer = new LeadScorer();

// Base calls
scorer.scoreLead(lead);            // → { total, class, breakdown, metadata }
scorer.explainScore(lead);         // → scoreLead(...) + {explanation[], summary}
scorer.classify(score);            // → 'Hot' | 'Warm' | 'Cool' | 'Cold'

// Model admin
scorer.defineModel({ factors: [...] });
scorer.trainFromHistory(wonLeads, lostLeads, opts);
scorer.ageDecay(lead, halfLifeDays, opts);

// Audit trail — previous models/weights are always preserved here
scorer.trainingLog;   // Array<{event, at, previous, next, ...}>
```

Factor shape (for `defineModel`):

```js
{
  name:    'budget',
  type:    'demographic' | 'firmographic' | 'behavioral',
  weight:  0.18,                     // relative; auto-normalized to Σ=1.0
  scoreFn: (lead) => 0.0..1.0,       // pure function
  bant:    'B'|'A'|'N'|'T'|null,     // optional tag
}
```

---

## 3. Default Model — 10 factors, Σ weights = 1.00

### BANT factors (60%)

| # | Factor | Type | Weight | Inputs | Scoring |
|---|--------|------|-------:|--------|---------|
| 1 | Budget | firmographic | 0.18 | `company.annualRevenue`, `company.employees` | Revenue band (5 bins 0.20..1.00) blended 0.6/0.4 with headcount band, then max-boosted against the smaller signal |
| 2 | Authority | demographic | 0.16 | `contact.title`, `contact.decisionPower` | Title regex → 5 seniority bands (0.25..1.00), decision-power enum (end-user 0.3 → decision-maker 1.0), combined `0.7·max + 0.3·min` |
| 3 | Need | firmographic | 0.14 | `inquiry.type`, `inquiry.painStated` | Inquiry-type enum (newsletter 0.10 → RFP 0.92), pain closes 30% of the gap to 1.0 |
| 4 | Timeline | firmographic | 0.12 | `inquiry.urgency` | Urgency enum (no-timeline 0.10 → immediate 1.00) |

### Behavioral factors (40%)

Each uses a diminishing-returns curve `1 - exp(-count / ceiling)` so
signals saturate smoothly and can't be gamed by spammy clicks.

| # | Factor | Weight | Ceiling |
|---|--------|-------:|--------:|
| 5 | Email opens | 0.05 | 20 |
| 6 | Link clicks | 0.07 | 15 |
| 7 | Page visits | 0.05 | 25 |
| 8 | Form fills | 0.10 | 5 |
| 9 | Webinar attendance | 0.07 | 3 |
| 10 | Content downloads | 0.06 | 8 |

Weights sum to `0.18 + 0.16 + 0.14 + 0.12 + 0.05 + 0.07 + 0.05 + 0.10 + 0.07 + 0.06 = 1.00`.

---

## 4. Classification Boundaries

| Class | Score band | Label (he) | Label (en) |
|-------|-----------:|-----------|------------|
| Hot   | `>= 80`     | חם        | Hot         |
| Warm  | `50..79.99` | פושר      | Warm        |
| Cool  | `30..49.99` | צונן      | Cool        |
| Cold  | `< 30`      | קר        | Cold        |

Boundaries are inclusive at the low end, exclusive at the high end.
Tested against `classify(30)`, `classify(50)`, `classify(80)`,
`classify(29.99)`, `classify(49.99)`, `classify(79.99)`,
`classify(0)`, `classify(100)`.

---

## 5. Training Algorithm — Logistic Regression by Gradient Descent

`trainFromHistory(won, lost, opts)` tunes the factor weights from
historical outcomes.

### Step-by-step

1. **Featurize.** For every won and lost lead, run the current
   factor scoreFns to build a feature vector `x ∈ [0,1]^n` where
   `n = factors.length`. Label `y = 1` for won, `y = 0` for lost.
2. **Warm start.** Initialize `β` from the existing factor weights.
3. **Loop.** For `maxIterations` (default 500) or until the loss
   converges under `convergenceEps` (1e-6):
   - Compute `p_i = sigmoid(Σ β_j · x_{ij})` for each sample.
   - Binary cross-entropy loss (numerically clamped to `[1e-9, 1-1e-9]`).
   - Gradient: `(p - y) · x`, plus L2 regularization `λ·β` (λ = 0.01).
   - Update: `β := β − η · ∇` (η = 0.1).
4. **Weight projection.** Convert learned coefficients to weights:
   `w_i = max(minWeight, |β_i|)`, where `minWeight = 0.01`.
   This enforces the **לא מוחקים** rule — no factor is ever
   zeroed out even if the regression says it should be.
5. **Normalize.** `w := w / Σw` so the model still sums to 1.0.
6. **Audit.** Push a `trainFromHistory` entry into
   `trainingLog` with the full before/after weights, iteration count,
   convergence flag, and final loss.

### Return value

```js
{
  iterations,          // int
  converged,           // bool
  finalLoss,           // number
  lossHistory,         // number[]
  coefficients,        // number[]  raw β
  weights,             // [{name, weight}, ...] normalized
}
```

### Defaults (overridable via `opts`)

| Option | Default | Meaning |
|--------|--------:|---------|
| `learningRate` | 0.1 | Gradient step size |
| `maxIterations` | 500 | Hard cap |
| `convergenceEps` | 1e-6 | Stop when `|Δloss| <` this |
| `l2Regularization` | 0.01 | Ridge penalty |
| `minWeight` | 0.01 | Floor to prevent factor deletion |

---

## 6. Age Decay — Exponential Half-Life

`ageDecay(lead, halfLifeDays, opts)` returns a new lead whose
behavioral counters have been multiplied by:

```
factor = 0.5 ^ (age / halfLifeDays)
```

where `age` is days between the lead's last activity (or `createdAt`)
and `opts.asOf` (default: now). Defaults to a 30-day half-life if not
supplied. The original lead is never mutated. The returned lead
includes three metadata fields on the `behavior` object:
`_decayFactor`, `_decayedAt`, `_decayAgeDays`.

Verified test points:

| Age (days) | Half-life | Factor | Used in test |
|-----------:|----------:|-------:|--------------|
| 0 | 30 | 1.000 | `ageDecay with zero age` |
| 30 | 30 | 0.500 | `halves after exactly one half-life` |
| 60 | 30 | 0.250 | `two half-lives yields a quarter` |

---

## 7. BANT ↔ Factor Mapping

| BANT letter | Factor name | Default weight | Type |
|-------------|-------------|---------------:|------|
| **B**udget    | `budget`    | 0.18 | firmographic |
| **A**uthority | `authority` | 0.16 | demographic |
| **N**eed      | `need`      | 0.14 | firmographic |
| **T**imeline  | `timeline`  | 0.12 | firmographic |

Every BANT factor also carries a `bant: 'B'|'A'|'N'|'T'` tag in the
factor object for downstream reporting. Behavioral factors carry
`bant: null`.

---

## 8. Hebrew / English Glossary

Exported from `GLOSSARY` in the module.

### Classes

| Key | Hebrew | English |
|-----|--------|---------|
| Hot  | חם   | Hot |
| Warm | פושר | Warm |
| Cool | צונן | Cool |
| Cold | קר   | Cold |

### BANT factors

| Key | Hebrew | English |
|-----|--------|---------|
| budget    | תקציב | Budget |
| authority | סמכות | Authority |
| need      | צורך  | Need |
| timeline  | זמן   | Timeline |

### Behavioral factors

| Key | Hebrew | English |
|-----|--------|---------|
| emailOpens        | פתיחות דוא״ל    | Email opens |
| linkClicks        | הקלקות על קישורים | Link clicks |
| pageVisits        | ביקורים בעמודים  | Page visits |
| formFills         | מילוי טפסים      | Form fills |
| webinarAttendance | השתתפות בוובינר  | Webinar attendance |
| contentDownloads  | הורדות תוכן      | Content downloads |

### Title seniority bands (Hebrew synonyms the regex matches)

| Band | Score | Hebrew keywords |
|------|------:|-----------------|
| c-suite  | 1.00 | מנכ״ל, סמנכ״ל, בעלים, נשיא |
| vp       | 0.85 | סגן, סגנית, ראש אגף, ראש תחום |
| director | 0.70 | מנהל מחלקה, מנהל אגף, דירקטור |
| manager  | 0.50 | מנהל, מנהלת, ראש צוות |
| ic       | 0.25 | מתכנת, מהנדס, אנליסט, רכזת |

### Urgency keywords

| Enum | Hebrew expression | Score |
|------|-------------------|------:|
| immediate    | מידי / באופן מיידי   | 1.00 |
| this-month   | החודש               | 0.90 |
| this-quarter | ברבעון הזה          | 0.75 |
| this-year    | השנה                | 0.50 |
| next-year    | שנה הבאה            | 0.25 |
| no-timeline  | ללא לוח זמנים       | 0.10 |

---

## 9. Test Coverage

33 tests, all passing. Categories:

1. **Pure helpers sanity (4):** `clamp`, `sigmoid`, `bandScore`,
   `daysBetween`.
2. **BANT scorers (6):** budget / authority (English + Hebrew) / need
   (pain boost) / timeline / behavioral saturation curve.
3. **LeadScorer construction (2):** 10 factors, normalized weights,
   type tagging.
4. **scoreLead + classification (6):** full breakdown sums to total,
   Hot/Warm/Cool/Cold leads land in their bands, classify boundary
   points.
5. **explainScore (2):** bilingual per-factor strings, class name
   in summary.
6. **defineModel (3):** custom 2-factor model, invalid input
   rejection, audit trail preserved in trainingLog.
7. **trainFromHistory (3):** convergence on separable synthetic data
   (30 winners + 30 losers, loss strictly decreasing, retrained model
   still separates wins from losses, no factor zeroed out), audit
   log, empty dataset rejection.
8. **ageDecay (4):** one half-life → 0.5, two half-lives → 0.25,
   zero age → identity, decayed lead scores lower than fresh.
9. **Robustness (3):** empty lead, null fields, scoreFn that throws.

Command:

```
cd onyx-procurement
node --test test/sales/lead-scoring.test.js
```

Result: `33 pass / 0 fail / 0 skipped`, duration ≈ 150ms.

---

## 10. Techno-Kol Uzi Rule Compliance — לא מוחקים, רק משדרגים ומגדלים

| Surface | How the rule is honored |
|---------|--------------------------|
| `defineModel` | The previous factor set is snapshotted into `trainingLog.previous` before the new factors overwrite `this.factors`. Callers can roll back by replaying the log. |
| `trainFromHistory` | Learned coefficients are projected via `max(minWeight, |β_i|)` — no factor is ever deleted, even if the regression says it's useless. Before/after weights are logged. |
| `ageDecay` | Input lead is deep-cloned; the original is untouched. Decayed counters are reduced, never removed. `_decayFactor`/`_decayedAt`/`_decayAgeDays` metadata are added, not stripped. |
| `scoreLead` | A `scoreFn` that throws contributes 0 but does not remove the factor — the rest of the breakdown still runs. |

---

## 11. Files

| Path | Role |
|------|------|
| `onyx-procurement/src/sales/lead-scoring.js` | Source (zero deps, pure JS) |
| `onyx-procurement/test/sales/lead-scoring.test.js` | 33-test suite using `node --test` |
| `_qa-reports/AG-Y023-lead-scoring.md` | This report |

---

## 12. Known Limitations / Future Work

- Title regex is English + Hebrew only; other RTL languages would
  need additional bands.
- Training uses a single bias-free logistic regression — it fits
  monotone weights, not interaction terms. Kernel methods or a
  simple MLP would capture cross-factor lifts if the dataset grows.
- Behavioral ceilings are hard-coded. They could be learned from
  percentiles of the historical data in a future iteration.
- `ageDecay` applies a uniform half-life to every behavioral field.
  Different fields (e.g. webinar attendance vs. email opens) could
  have different half-lives.

None of these gaps block production use of the current default
model; they are upgrade paths, not fixes.

---

# AG-Y023 — Upgrade Pass / שדרוג Y023.2.0

> **Rule honored once again: לא מוחקים רק משדרגים ומגדלים.** All Y023.1.0
> material above is preserved verbatim. The Y023.2.0 upgrade adds a new
> dimension model + multi-model registry + append-only event log + decay +
> recalibration + bilingual explain by lead-id. Both engines co-exist on a
> single `LeadScorer` instance — old callers continue to work unchanged.

**Model version (current head):** `Y023.2.0`
**Tests:** 57 passing (33 BANT legacy + 24 upgrade-layer Y023.2)
**Date:** 2026-04-11

---

## 13. Bilingual overview / סקירה דו־לשונית

| EN | HE |
|----|----|
| Lead Scoring Engine — demographic + behavioral + engagement | מנוע דירוג לידים — דמוגרפי + התנהגותי + מעורבות |
| Multi-model registry indexed by `id` | מרשם מודלים מרובה אינדקסים לפי `id` |
| Append-only event log (immutable) | יומן אירועים (append-only, בלתי משתנה) |
| Exponential decay 0.9^(days/30) | דעיכה מעריכית 0.9^(ימים/30) |
| Three-band classification: hot / warm / cold | סיווג בשלושה פסים: חם / פושר / קר |
| Bilingual explain per dimension | הסבר דו־לשוני לכל ממד |
| Recalibrate from closed/lost deals | כיול מחדש לפי עסקאות שנסגרו/אבדו |

---

## 14. Scoring dimensions / ממדי הדירוג (Y023.2.0 spec)

The default model registered by `getDefaultDimensionModel()` carries 10
dimensions matching the Y023 spec exactly. Default weights sum to 1.0.

| # | Key | Hebrew label / תווית | Rule type | Default weight |
|---|------|---------------------|-----------|---------------:|
| 1 | `industry_fit` | התאמת תעשייה | `enum` | 0.10 |
| 2 | `company_size` | גודל חברה | `numeric` (banded) | 0.12 |
| 3 | `job_title` | תפקיד | `enum` | 0.10 |
| 4 | `budget_range` | טווח תקציב | `numeric` (banded) | 0.13 |
| 5 | `timeline` | לוח זמנים | `enum` | 0.10 |
| 6 | `engagement_recency` | מידת רעננות הקשר | `numeric` (inverse banded) | 0.10 |
| 7 | `email_engagement` | מעורבות בדוא״ל | `event` | 0.08 |
| 8 | `website_activity` | פעילות באתר | `event` | 0.09 |
| 9 | `content_consumption` | צריכת תוכן | `event` | 0.08 |
| 10 | `pricing_interest` | עניין במחיר | `event` | 0.10 |

The first six dimensions are demographic / firmographic; the last four are
event-derived (behavioral). `blendedScore()` separates the two halves,
renormalises each to 0..100, and reports a 50/50 blend so demographic fit
and engagement signals can be compared independently.

### Rule types / סוגי כללים

| `rule.type` | Behavior / התנהגות | EN | HE |
|-------------|--------------------|----|----|
| `numeric` | Banded lookup or `(value-min)/(max-min)` | Numeric ranges | טווחים מספריים |
| `enum` | Map lookup against `lead.demographic[key]` | Enumerated values | ערכים מנויים |
| `boolean` | `whenTrue` / `whenFalse` lookup | True/false flags | דגלים בוליאניים |
| `event` | `1 - exp(-Σ events / cap)` saturating curve | Event accumulation | צבירת אירועים |

---

## 15. Band thresholds / ספי פסים

The default thresholds (configurable per model via `defineScoringModel`):

| Band | EN | HE | Score |
|------|----|----|-------|
| `hot` | Hot | חם | `score >= 80` |
| `warm` | Warm | פושר | `50 <= score < 80` |
| `cold` | Cold | קר | `20 <= score < 50` (and below 20) |

The original 4-band scheme `CLASS_THRESHOLDS = {hot:80, warm:50, cool:30}`
remains exported for the legacy BANT engine — both schemes co-exist.
`bandDistribution()` counts only hot/warm/cold; `bandDistribution({days:N})`
restricts the window to the last N days.

---

## 16. Decay formula / נוסחת הדעיכה (Y023.2.0)

The upgrade-layer `decayScore(leadId, daysSinceEngagement)` applies:

```
factor       = DECAY_BASE ^ (daysSinceEngagement / DECAY_WINDOW_DAYS)
             = 0.9 ^ (days / 30)
decayedScore = clamp(baseScore * factor, 0, 100)
```

| Days silent | factor | Example: 80 → |
|-------------|--------|---------------|
| 0 | 1.000 | 80.00 |
| 30 | 0.900 | 72.00 |
| 60 | 0.810 | 64.80 |
| 90 | 0.729 | 58.32 |
| 180 | 0.531 | 42.51 |
| 365 | 0.293 | 23.45 |

**Important:** the original snapshot is **never deleted**. Decay pushes a
new snapshot with `decayed:true` so the history of scores remains complete
and auditable. The legacy `LeadScorer.ageDecay()` (half-life `0.5^(d/half)`)
is **also preserved** and runs side-by-side.

---

## 17. Event taxonomy / טקסונומיית אירועים

Tracked event types (all assigned via `recordEvent({leadId, type, ...})`):

| Event type | Default delta | Dimensions hit | EN | HE |
|------------|--------------:|----------------|----|----|
| `email_opened` | +1 | `email_engagement` | Email opened | פתיחת דוא״ל |
| `link_clicked` | +2 | `email_engagement`, `website_activity` | Link clicked | הקלקה על קישור |
| `demo_booked` | +10 | `timeline`, `pricing_interest` | Demo booked | תיאום הדגמה |
| `website_visit` | +1 | `website_activity` | Website visit | ביקור באתר |
| `content_downloaded` | +3 | `content_consumption` | Content downloaded | הורדת תוכן |
| `pricing_page_visited` | +5 | `pricing_interest` | Pricing page visit | ביקור בדף תמחור |
| `unsubscribed` | -15 | `email_engagement` | Unsubscribed | ביטול הרשמה |

Events are stored in an **append-only** array (`scorer._eventLog`). There
is no remove API. Sequence numbers (`seq`) grow monotonically. Per the rule
"לא מוחקים", an `unsubscribed` event is recorded as a negative delta and
**kept alongside** all earlier positive events — the lead's full history
remains visible to analysts.

---

## 18. New API surface / ממשק תוכנה חדש (Y023.2.0)

```js
const scorer = new LeadScorer();

// 1. Register a model
scorer.defineScoringModel(getDefaultDimensionModel());
// → { id, dimensions, thresholds, version, previousVersions, createdAt, updatedAt }

// 2. Store leads + events
scorer.upsertLead({ id: 'L1', demographic: { industry_fit: 'manufacturing', ... }});
scorer.recordEvent({ leadId: 'L1', type: 'pricing_page_visited' });
// → { leadId, type, value, delta, at, dimensions, seq } (frozen)

// 3. Score by lead-id
const r = scorer.scoreLead('L1', 'default-y023-v2');
// → { score, band, breakdown[], modelId, leadId, asOf }

// 4. Bilingual explain
const e = scorer.explainScore('L1');
// → { leadId, modelId, score, band, bandLabelHe, bandLabelEn,
//     breakdown[], reasons[{key, he, en}], summary{he, en} }

// 5. Decay an existing snapshot
scorer.decayScore('L1', 60);
// → { leadId, decayedScore, factor, original, band, days }

// 6. Recalibrate weights from history
scorer.recalibrate({
  closedDeals: [{leadId:'L1'}, {leadId:'L2'}],
  lostDeals:   [{leadId:'L8'}, {leadId:'L9'}],
});
// → { modelId, correlation[], previousWeights[], nextWeights[], wonCount, lostCount }

// 7. Aggregations
scorer.bandDistribution({ days: 30 });
// → { hot, warm, cold, total }

scorer.topReasons('hot');
// → [{ key, labelHe, labelEn, meanRawScore, leadCount }, ...]

scorer.blendedScore('L1', 'default-y023-v2');
// → { leadId, modelId, demographic, behavioral, blended, rawScore, band }
```

`scoreLead` and `explainScore` are now **polymorphic**: passing a lead
object follows the legacy BANT path; passing a `(leadId, modelId)` pair
invokes the upgrade-layer engine. This is what makes the upgrade additive
rather than destructive.

---

## 19. Storage model / מבנה אחסון

Pure in-memory `Map`s and arrays — zero external dependencies, zero I/O:

| Field | Type | Purpose / מטרה |
|-------|------|----------------|
| `_models` | `Map<id, modelRecord>` | Multi-model registry |
| `_leads` | `Map<id, leadObject>` | Lead store (upserted on every event/score) |
| `_eventLog` | `Array<frozen event>` | Append-only event log |
| `_scoreSnapshots` | `Map<leadId, snapshot[]>` | Score timeline per lead |
| `_activeModelId` | `string` | Default model for explain/blended/recalibrate |
| `trainingLog` | `Array` | BANT-era audit log (preserved) |

`previousVersions[]` on every model record retains every prior dimension
list every time `defineScoringModel` is called with the same `id`. This is
the multi-model analogue of the BANT `trainingLog`.

---

## 20. Hebrew glossary (Y023.2.0 additions) / מילון עברי

| EN | HE | Notes / הערות |
|----|----|----|
| Lead | ליד / מתעניין | |
| Lead scoring | דירוג לידים | |
| Demographic | דמוגרפי | |
| Firmographic | פירמוגרפי / מאפייני חברה | |
| Behavioral | התנהגותי | |
| Engagement | מעורבות | |
| Industry fit | התאמת תעשייה | |
| Company size | גודל חברה | |
| Job title | תפקיד | |
| Budget range | טווח תקציב | |
| Timeline | לוח זמנים | |
| Engagement recency | מידת רעננות הקשר | smaller is better — ימים מאז המגע האחרון |
| Email engagement | מעורבות בדוא״ל | |
| Website activity | פעילות באתר | |
| Content consumption | צריכת תוכן | |
| Pricing interest | עניין במחיר | |
| Hot lead | ליד חם | `score >= 80` |
| Warm lead | ליד פושר | `50 <= score < 80` |
| Cold lead | ליד קר | `score < 50` |
| Score | ניקוד | |
| Band | פס / רמה | |
| Threshold | סף | |
| Decay | דעיכה | |
| Half-life | חצי חיים | BANT path only |
| Event log | יומן אירועים | append-only |
| Append-only | רק הוספה (בלתי ניתן למחיקה) | |
| Recalibrate | כיול מחדש | |
| Snapshot | תצלום מצב | |
| Breakdown | פירוט | |
| Bilingual | דו־לשוני | |
| RTL | מימין־לשמאל | |
| Demo booked | תיאום הדגמה | |
| Pricing page visit | ביקור בדף תמחור | |
| Content downloaded | הורדת תוכן | |
| Unsubscribed | ביטול הרשמה | negative-delta event, kept on the log |
| Closed deal | עסקה שנסגרה / עסקה שזכתה | |
| Lost deal | עסקה שאבדה / עסקה שנכשלה | |
| Win/loss correlation | קורלציית זכייה/הפסד | |
| Top reasons | סיבות מובילות | per-band aggregation |
| Blended score | ניקוד משולב | demographic + behavioral 50/50 |
| Band distribution | התפלגות פסים | hot/warm/cold counts |
| Multi-model registry | מרשם מודלים מרובה | indexed by `id` |
| Active model | מודל פעיל | default for `explainScore` / `blendedScore` |
| Lead-id | מזהה ליד | string key |

---

## 21. Test catalogue — Y023.2.0 additions / קטלוג בדיקות

24 new tests (added on top of the 33 BANT legacy tests) — all passing.

1. defineScoringModel registers a model and normalises weights
2. defineScoringModel keeps previous versions on redefinition (לא מוחקים)
3. defineScoringModel rejects bad rule types
4. scoreLead with modelId scores a numeric dimension
5. scoreLead with modelId scores an enum dimension
6. scoreLead with modelId scores a boolean dimension
7. recordEvent appends to immutable log with default score deltas
8. recordEvent records unsubscribed with negative delta but keeps the event
9. event dimension rule accumulates engagement events
10. decayScore applies 0.9^(days/30) to the latest snapshot
11. decayScore with 0 days returns the original snapshot
12. band classification respects model thresholds
13. explainScore by leadId returns bilingual reasons sorted by contribution
14. bandDistribution counts the latest snapshot per lead
15. topReasons returns dimensions sorted by mean raw score
16. recalibrate shifts weights toward dimensions that correlate with wins
17. recalibrate refuses empty closed/lost lists
18. blendedScore separates demographic and behavioral parts
19. upgrade layer co-exists with the original BANT scoreLead API
20. evaluateDimensionRule handles all rule types as a pure function
21. getDefaultDimensionModel returns the 10 dimensions from the Y023 spec
22. EVENT_SCORE_DELTAS exposes the spec event types with correct signs
23. DECAY_BASE and DECAY_WINDOW_DAYS match the Y023 spec
24. normBand accepts Hebrew band tokens

### Run command

```
cd onyx-procurement
node --test test/sales/lead-scoring.test.js
```

### Latest result

```
ℹ tests 57
ℹ pass 57
ℹ fail 0
ℹ duration_ms ~135
```

---

## 22. Compliance recap / עמידה בכללים בלתי משתנים

| Rule | EN | HE | Status |
|------|----|----|--------|
| לא מוחקים רק משדרגים ומגדלים | Never delete, only upgrade and grow | רק מוסיפים, אף פעם לא מוחקים | PASS — original Y023.1.0 module preserved verbatim, all new code is additive (prototype extension on the same class); event log is append-only; model versions retained in `previousVersions[]`; decay snapshots are pushed, not overwritten; recalibrate keeps `previousWeights`; weights floored at `0.01`; this report itself is appended, not rewritten |
| Zero external deps | Only Node built-ins | רק בנייה־מראש של Node | PASS — only `node:test`, `node:assert/strict`, `node:path` in tests; no `require()` of any third-party package in source |
| Hebrew RTL + bilingual | UI labels in HE+EN, RTL-safe | תוויות עברית+אנגלית, ידידותי ל־RTL | PASS — every dimension, band, and event has HE+EN labels via `DIMENSION_GLOSSARY`, `BAND_GLOSSARY`; explain output produces parallel `he`/`en` strings per row plus bilingual `summary` |

---

## 23. Open follow-ups / משימות המשך

- Hook the upgrade layer to `crm/pipeline.js` so new opportunities update
  `_leads` automatically.
- Add an HTTP route `/api/sales/leads/:id/score` that wraps
  `explainScore(id)` for the dashboard.
- Persist `_eventLog` to the file-backed store so events survive a process
  restart (currently in-memory, satisfying the "zero external deps" rule).
- Add a nightly job that calls `decayScore` for any lead idle > 7 days.

---

*Y023.2.0 upgrade pass authored by Agent Y-023 on 2026-04-11 — Techno-Kol Uzi mega-ERP.*
