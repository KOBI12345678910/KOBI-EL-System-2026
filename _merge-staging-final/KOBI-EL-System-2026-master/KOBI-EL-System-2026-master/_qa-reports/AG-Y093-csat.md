# AG-Y093 — CSAT Tracker (Transactional Surveys)

**Agent:** Y-093
**Module:** `onyx-procurement/src/customer/csat.js`
**Tests:**  `onyx-procurement/test/customer/csat.test.js`
**Version:** Y093.1.0
**Status:** Delivered
**Rule enforced:** לא מוחקים רק משדרגים ומגדלים — responses are never deleted, only superseded in-place via a `supersedes` + `version` chain.

---

## 1. Purpose

CSAT (Customer Satisfaction) measures how a customer feels about **one
specific interaction** (transaction-based), unlike NPS which is
relationship-based. The tracker ships zero-dependency, pure-JS, fully
deterministic, and bilingual (Hebrew + English) to plug into the
Techno-Kol Uzi mega-ERP.

---

## 2. Public API (class `CSATTracker`)

| Method | Purpose |
|---|---|
| `new CSATTracker(options?)` | Construct a tracker. Options: `maxRating`, `satisfactionThreshold`, `dissatisfactionThreshold`, `clock` (deterministic for tests). |
| `triggerSurvey({event, customerId, triggerData})` | Creates a contextual survey for one of 4 trigger events. Returns `{surveyId, format, questions, aspects, sentAt, label}`. |
| `surveyFormat({type})` | Returns a declarative UI description for 1 of 5 formats. |
| `recordResponse({...})` | Stores a response (immutable snapshot, frozen). Builds a supersede chain when the same customer re-answers. |
| `computeCSAT({period, filter})` | Core CSAT % + band. |
| `ces({period, filter})` | Customer Effort Score (1-7 scale). |
| `segmentByTouchpoint(period)` | CSAT per product / channel / agent / region / event. |
| `driverAnalysis({period, filter})` | Pearson correlation of aspect ratings with overall rating. |
| `actionableInsights()` | AI-lite keyword × segment pattern detector over low scores. |
| `alertLowSatisfaction({threshold})` | Real-time alert feed for 1-2 ratings (configurable threshold). |
| `setNPS(customerId, score)` | Test/integration helper — attach a customer's NPS. |
| `linkToNPS(customerId)` | Compare a customer's CSAT history to their NPS. |
| `reportingDashboard(period)` | Bilingual (he+en) dashboard payload for the UI. |

---

## 3. Formulas

### 3.1 CSAT (Customer Satisfaction)

```
CSAT% = ( count(rating >= satisfactionThreshold) / totalResponses ) * 100
```

- Default `satisfactionThreshold = 4` for a 1-5 scale → a rating of 4 or 5
  is "satisfied".
- Default `dissatisfactionThreshold = 2` → a rating of 1 or 2 is
  "dissatisfied".
- A rating of 3 is "neutral".

### 3.2 CSAT bands (industry benchmark)

| Band (EN) | Band (HE) | Range |
|---|---|---|
| Excellent | מצוין  | `CSAT >= 90` |
| Good      | טוב    | `80 <= CSAT < 90` |
| Fair      | סביר   | `70 <= CSAT < 80` |
| Poor      | נמוך   | `CSAT < 70` |

**Spec rule:** 4/5 = good, 5/5 = excellent. Tracker enforces this via
`bandFromCSAT()`.

### 3.3 Average rating

```
average = sum(rating) / totalResponses     (rounded to 3 decimals)
```

### 3.4 CES (Customer Effort Score)

Effort rating is collected on a **1..7** scale (1 = very hard, 7 = very
easy).

```
CES_avg        = mean(effortRating)
CES_normalized = ((CES_avg - 1) / 6) * 100        // 0..100, higher = easier
```

- `easy`  count = responses with `effortRating >= 5`
- `hard`  count = responses with `effortRating <= 3`

### 3.5 Driver analysis (Pearson correlation)

```
r_i = Cov(aspect_i, overall) / ( stdDev(aspect_i) * stdDev(overall) )
```

Implemented by `pearson(xs, ys)`:

```
num   = Σ (x_i - x̄)(y_i - ȳ)
denX  = Σ (x_i - x̄)²
denY  = Σ (y_i - ȳ)²
r     = num / sqrt(denX * denY)
```

- Zero variance → `r = 0` (safe fallback, no NaN).
- Aspects are ranked by `r` desc — highest correlation = strongest driver
  of satisfaction.

### 3.6 CSAT × NPS alignment

```
csatNormalized = ((avgRating - 1) / (maxRating - 1)) * 100
npsNormalized  = (npsScore / 10) * 100
gap            = csatNormalized - npsNormalized
```

| Alignment bucket | Condition |
|---|---|
| `aligned`      | `|gap| <= 10` |
| `csat-higher`  | `gap > 10`    |
| `nps-higher`   | `gap < -10`   |
| `unknown`      | Missing CSAT history **or** missing NPS |

---

## 4. Trigger events

| Event | HE label | Default format | Default aspects |
|---|---|---|---|
| `ticket-closed`      | סגירת קריאת שירות | emoji             | response-time, resolution-quality, agent-knowledge, ease-of-contact |
| `order-delivered`    | משלוח הזמנה        | 5-star            | on-time, packaging, product-quality, accuracy |
| `project-completed`  | סיום פרויקט        | detailed-matrix   | on-time, on-budget, quality, communication, safety |
| `install-completed`  | סיום התקנה         | detailed-matrix   | tidiness, technician-professionalism, functionality, scheduling |

Every triggered survey is an immutable envelope with:

- `surveyId` — `SRV-<event>-<customerId>-<epoch>-<seq>`
- `format`, `questions`, `aspects`, `sentAt`
- `label.he` and `label.en`
- `triggerData` — **copied** (not aliased) so caller mutations cannot
  leak into stored state.

---

## 5. Survey formats

| Type | Scale | Icons | Notes |
|---|---|---|---|
| `5-star`           | 1..5 | ★ | Classic star rating |
| `1-5-scale`        | 1..5 | — | Plain numeric |
| `thumbs`           | 1..5 | 👎 / 👍 | Only values `[1, 5]` |
| `emoji`            | 1..5 | 😡 😟 😐 🙂 😍 | Default for ticket-closed |
| `detailed-matrix`  | 1..5 | — | `hasAspects = true` → renders aspect grid |

All formats share the same underlying scale so ratings can be compared
apples-to-apples across surveys.

---

## 6. Actionable insights (AI-lite)

Implemented without ML, without HTTP, without randomness:

1. Filter responses with `rating <= dissatisfactionThreshold` (default ≤ 2).
2. For each low-score response, extract segments:
   `agent`, `product`, `channel`, `region` (fallback: `overall`).
3. `tokenize(feedback)` — lowercase, Unicode-letter/digit split, drop
   tokens shorter than 3 chars, drop a bilingual stop-word set
   (he + en).
4. Count `(dimension, segment, keyword)` occurrences.
5. Emit the top 10 patterns with `count >= 2`, sorted by count desc then
   keyword asc. Each pattern carries up to 3 example `{surveyId,
   customerId, rating}` tuples.

This is the minimum viable "why are customers unhappy" surface — it
catches repeating complaints like "delivery" or "איחר" showing up
across 2+ tickets for the same agent/product.

---

## 7. Alert stream

- `recordResponse()` appends a frozen alert to the internal log whenever
  a rating `<= dissatisfactionThreshold` lands.
- `alertLowSatisfaction({threshold})` returns **all** responses at-or-
  below the supplied threshold as bilingual-ready alerts with
  `severity = 'critical' | 'high'` (1 = critical, 2 = high).
- Alerts are never deleted — a re-response creates a new alert and
  preserves the old one.

---

## 8. "Never delete, only upgrade" — supersede chain

```
response.version     // 1-based ordinal per surveyId
response.supersedes  // reference to the immediately previous response
```

When a customer re-rates a survey:

- A **new** frozen response is appended.
- Its `supersedes` field points to the previous response.
- Its `version` is `previousCount + 1`.
- **Nothing is mutated or deleted.**
- `.responses` exposes a defensive **copy** of the full append-only log.

This is the code-level embodiment of the Techno-Kol rule.

---

## 9. Hebrew glossary

| EN | HE |
|---|---|
| Customer Satisfaction (CSAT) | שביעות רצון לקוח |
| Customer Effort Score (CES)  | מדד המאמץ של הלקוח |
| Net Promoter Score (NPS)     | ציון נאמנות לקוחות |
| Survey                       | סקר |
| Rating                       | דירוג |
| Verbal feedback              | משוב מילולי |
| Aspect                       | היבט |
| Touchpoint                   | נקודת מגע |
| Product                      | מוצר |
| Channel                      | ערוץ |
| Agent                        | נציג |
| Region                       | אזור |
| Driver                       | גורם מניע |
| Satisfied                    | מרוצים |
| Neutral                      | ניטרליים |
| Dissatisfied                 | לא מרוצים |
| Low rating                   | דירוג נמוך |
| High rating                  | דירוג גבוה |
| Alert                        | התראה |
| Threshold                    | סף |
| Pattern                      | תבנית |
| Insight                      | תובנה |
| Easy                         | קל |
| Hard                         | קשה |
| Aligned                      | מיושר |
| Ticket Closed                | סגירת קריאת שירות |
| Order Delivered              | משלוח הזמנה |
| Project Completed            | סיום פרויקט |
| Install Completed            | סיום התקנה |
| Excellent                    | מצוין |
| Good                         | טוב |
| Fair                         | סביר |
| Poor                         | נמוך |
| Response Time                | זמן תגובה |
| Resolution Quality           | איכות הפתרון |
| Agent Knowledge              | ידע הנציג |
| Ease of Contact              | נוחות הפנייה |
| On Time                      | עמידה בזמנים |
| Packaging                    | אריזה |
| Product Quality              | איכות המוצר |
| Order Accuracy               | דיוק ההזמנה |
| On Budget                    | עמידה בתקציב |
| Quality                      | איכות |
| Communication                | תקשורת |
| Safety                       | בטיחות |
| Tidiness                     | ניקיון וסדר |
| Technician Professionalism   | מקצועיות הטכנאי |
| Functionality                | תפקוד המערכת |
| Scheduling                   | תיאום מועדים |

---

## 10. Test coverage

`node --test test/customer/csat.test.js`

```
ℹ tests 51
ℹ pass 51
ℹ fail 0
```

Coverage by domain:

| Area | Tests |
|---|---|
| Constructor + thresholds            | 3 |
| `triggerSurvey` contracts           | 5 |
| `surveyFormat` contracts            | 4 |
| `recordResponse` contracts          | 6 |
| **CSAT calculation**                | 8 |
| **CES calculation**                 | 3 |
| **Driver analysis**                 | 2 |
| **Touchpoint segmentation**         | 2 |
| Actionable insights                 | 2 |
| **Threshold alerts**                | 2 |
| NPS linking + `setNPS`              | 5 |
| Dashboard (bilingual)               | 2 |
| Low-level helpers (band/pearson/tokenize) | 7 |

The 5 mandatory focus areas from the spec — **CSAT calculation, CES,
driver analysis, threshold alerts, touchpoint segmentation** — are all
covered with dedicated tests plus at least one edge case each (empty
input, period filter, zero-variance, NaN guard).

---

## 11. File locations

- Module:  `onyx-procurement/src/customer/csat.js`
- Tests:   `onyx-procurement/test/customer/csat.test.js`
- Report:  `_qa-reports/AG-Y093-csat.md`  (this file — **never delete**)

---

## 12. Integration notes

- No DB, no HTTP, no file I/O, no timers, no globals. Safe to require
  from server routes, workers, or CLI tools.
- Responses are **frozen** — downstream consumers can share them
  without defensive copies.
- `reportingDashboard()` returns a shape that already carries both
  Hebrew and English labels, so the client can switch RTL/LTR without
  another round-trip.
- For production wiring, feed `triggerSurvey()` from a worker that
  listens on the existing ERP event bus (ticket close, PO delivery
  webhook, project milestone, installer check-out) and push the
  resulting envelope to the chosen delivery channel (email / SMS /
  WhatsApp / in-app).

---

## 13. Never-delete guarantee (audit)

The module exposes **no** public or private method that removes a
response, a survey, an alert, or an NPS record. Every internal
container (`_responses`, `_surveys`, `_alertLog`, `_npsByCustomer`) is
only ever appended to. Re-rating builds a new row linked via
`supersedes` — grep confirms zero occurrences of `.splice`, `.pop`,
`.shift`, or `delete` statements in `src/customer/csat.js`.
