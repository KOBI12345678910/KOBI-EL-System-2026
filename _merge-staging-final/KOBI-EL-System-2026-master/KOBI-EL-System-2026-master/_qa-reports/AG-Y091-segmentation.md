# AG-Y091 — Customer Segmentation Engine (RFM + Lifecycle + Clustering + CLV)

**Agent:** Y-091
**Program:** Techno-Kol Uzi mega-ERP 2026
**Date:** 2026-04-11
**Status:** GREEN — 53/53 tests passing
**Rule honored:** לא מוחקים רק משדרגים ומגדלים — all files are net-new; no
existing file was modified, renamed, or deleted.

---

## 1. Mission

Ship a zero-dependency customer segmentation engine for the mega-ERP that can
slice the customer base five different ways from the same input, recommend
marketing actions per segment, forecast simple CLV, compute Venn-style
segment overlap, and export customer-ID lists ready for campaign targeting.
The engine must be deterministic, pure, and safe to call from workers,
reports, or request handlers without side effects.

No existing files were modified. No features were removed. Module honours
the mega-ERP's core rule: **"לא מוחקים רק משדרגים ומגדלים"** — the engine
has read-only inputs and never touches the underlying data stores.

---

## 2. Deliverables

| File | Role | LOC |
|---|---|---|
| `onyx-procurement/src/customer/segmentation.js` | Segmentation engine — `CustomerSegmentation` class + catalogues + helpers (CommonJS, zero deps) | ~770 |
| `onyx-procurement/test/customer/segmentation.test.js` | `node:test` unit suite — 53 tests | ~520 |
| `_qa-reports/AG-Y091-segmentation.md` | This report | — |

### Test run

```
ℹ tests 53
ℹ suites 0
ℹ pass 53
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ duration_ms ~114
```

Run with:

```bash
cd onyx-procurement
node --test test/customer/segmentation.test.js
```

---

## 3. Public API — `CustomerSegmentation`

```js
const { CustomerSegmentation } = require('./src/customer/segmentation');

const engine = new CustomerSegmentation({
  referenceDate: new Date('2026-04-11'),   // "today", pin for tests
  thresholds:    { /* override quintile thresholds */ },
  churnDays:     365,                      // lifecycle → churned cutoff
  atRiskDays:    180,                      // lifecycle → at_risk cutoff
  loyalOrders:   6,                        // lifecycle → loyal cutoff
  championOrders:12,                       // lifecycle → champion (also needs spend)
  championSpend: 50000,                    // ILS
});

engine.computeRFM({ customer, period });
engine.segmentRFM(rfm);
engine.lifecycleStage(customer);
engine.kMeansCluster(customers, k, features, opts);
engine.behavioralSegment(customer);
engine.segmentOverlap(segA, segB);
engine.recommendAction(segmentId);
engine.forecastValue(customer, horizon);

engine.indexCustomers(customers);   // pre-compute once
engine.exportSegments('champions'); // → customer ID list
```

Static catalogues (UI tooltips, admin screens):

```js
CustomerSegmentation.RFM_SEGMENTS
CustomerSegmentation.LIFECYCLE_STAGES
CustomerSegmentation.BEHAVIOURAL_SEGMENTS
CustomerSegmentation.ACTION_PLAYBOOK
CustomerSegmentation.GLOSSARY
CustomerSegmentation.DEFAULT_RFM_THRESHOLDS
```

---

## 4. RFM Methodology

### 4.1 Dimensions

| Dim | Meaning | Direction | Source |
|---|---|---|---|
| **R** — Recency   | Days since last purchase | lower is better | `customer.orders[*].date` OR `customer.lastOrderDate` |
| **F** — Frequency | Orders in the period     | higher is better | `orders.length` OR `customer.orderCount` |
| **M** — Monetary  | Total spend in the period (ILS) | higher is better | `Σ orders.amount` OR `customer.totalSpend` |

Each dimension is bucketed into an integer score 1..5 via
`scoreByThresholds(value, thresholds, direction)`. The default thresholds
are a deterministic quintile-like table — callers may override them in the
constructor for verticals with different tempo (e.g. B2B contracts vs. B2C
e-commerce).

### 4.2 Default thresholds

```js
DEFAULT_RFM_THRESHOLDS = {
  recency:   [14, 30, 60, 120],   // days — score 5/4/3/2/1
  frequency: [1, 3, 6, 12],       // orders — score 1/2/3/4/5
  monetary:  [1000, 5000, 15000, 50000], // ILS — score 1/2/3/4/5
}
```

### 4.3 Bucketing rules

- **Recency (`lower_better`)**
  | Days | Score |
  |---|---|
  | ≤ 14   | 5 |
  | ≤ 30   | 4 |
  | ≤ 60   | 3 |
  | ≤ 120  | 2 |
  | > 120  | 1 |

- **Frequency / Monetary (`higher_better`)**
  | Value ≤ | Score |
  |---|---|
  | threshold[0] | 1 |
  | threshold[1] | 2 |
  | threshold[2] | 3 |
  | threshold[3] | 4 |
  | above all    | 5 |

### 4.4 Period windowing

`computeRFM({ customer, period })` accepts an optional inclusive window:

```js
engine.computeRFM({
  customer,
  period: { start: '2026-01-11', end: '2026-04-11' },
});
```

Orders outside the window are ignored. If `period` is omitted, all orders
are used and `end` defaults to `engine.referenceDate`.

---

## 5. Named RFM Segments

The engine exposes 11 named segments. The *first matching* rule wins — rule
order is deliberate so that strong labels ("Champions") capture customers
before weaker labels ("Need Attention") do.

| # | ID | Hebrew | English | Rule (R,F,M) | Action |
|---|---|---|---|---|---|
| 1 | `champions`            | אלופים                | Champions            | R≥4 ∧ F≥4 ∧ M≥4                  | retain    |
| 2 | `loyal`                | נאמנים                | Loyal                | F≥4 ∧ M≥4 ∧ R≥3                  | retain    |
| 3 | `potential_loyalists`  | נאמנים פוטנציאליים    | Potential Loyalists  | R≥4 ∧ F∈[2..3] ∧ M≥2             | grow      |
| 4 | `new_customers`        | לקוחות חדשים          | New Customers        | R≥4 ∧ F≤1                        | nurture   |
| 5 | `promising`            | מבטיחים               | Promising            | R≥3 ∧ F≤2 ∧ M≤2                  | nurture   |
| 6 | `need_attention`       | דרושה תשומת לב        | Need Attention       | R=3 ∧ F=3 ∧ M≥2                  | grow      |
| 7 | `about_to_sleep`       | עומדים להירדם         | About to Sleep       | R∈[2..3] ∧ F≤2                   | win-back  |
| 8 | `at_risk`              | בסיכון                | At Risk              | R≤2 ∧ F≥3 ∧ M≥3                  | win-back  |
| 9 | `cannot_lose`          | אסור לאבד             | Cannot Lose Them     | R≤2 ∧ F≥4 ∧ M≥4                  | win-back  |
| 10| `hibernating`          | רדומים                | Hibernating          | R≤2 ∧ F≤2 ∧ M≥2                  | win-back  |
| 11| `lost`                 | אבודים                | Lost                 | R=1 ∧ F=1                        | win-back  |

> Any customer that fails every rule falls into a safe `need_attention`
> fallback so the engine never returns `undefined`.

---

## 6. Lifecycle Stages

A coarser, time-based axis that describes where the customer sits on the
relationship arc, independent of quintile scoring.

| ID | Hebrew | English | Entry condition |
|---|---|---|---|
| `prospect`   | ליד     | Prospect    | `orderCount === 0` |
| `first_time` | ראשוני  | First-time  | `orderCount === 1` ∧ active |
| `repeat`     | חוזר    | Repeat      | `orderCount ≥ 2` ∧ active |
| `loyal`      | נאמן    | Loyal       | `orderCount ≥ 6` ∧ active |
| `champion`   | אלוף    | Champion    | `orderCount ≥ 12` ∧ `totalSpend ≥ 50,000₪` ∧ active |
| `at_risk`    | בסיכון  | At Risk     | `180 < daysSinceLastOrder ≤ 365` |
| `churned`    | עזב     | Churned     | `daysSinceLastOrder > 365` |

"Active" means the customer's recency is within `atRiskDays` (default 180).
Stages are evaluated top-down, so the strongest matching stage wins.

---

## 7. k-Means Clustering

`kMeansCluster(customers, k, features, opts)` returns:

```js
{
  centroids:      number[][],   // k normalised centroids
  assignments:    number[],     // index per customer → cluster idx
  clusters:       object[][],   // grouped customer objects
  iterations:     number,
  converged:      boolean,
  inertia:        number,       // Σ squared-distance to centroid
  normalization:  { means, stds },
}
```

### 7.1 Highlights

- **Zero dependencies** — pure JS, no numeric libraries.
- **z-score normalisation** per feature so disparate scales (spend in ₪ vs.
  frequency in orders) compete on equal footing.
- **k-means++ seeding** for better starting centroids than random init.
- **Deterministic LCG** (Numerical Recipes constants) — NO `Math.random`,
  so a given `seed` always yields the same assignments. Same-seed
  reproducibility is covered by a dedicated test.
- **Features can be property names or functions** — `['spend', 'freq']` or
  `[(c) => c.orders.reduce(…), (c) => c.orders.length]`.
- **Clamps `k`** to the number of unique points to avoid empty clusters.
- Handles degenerate cases: empty input, k > n, duplicate points.

### 7.2 Convergence

Lloyd iterations stop when either no assignment changes in a pass, or the
largest centroid shift falls below `tolerance` (default `1e-6`). Hard cap
of `maxIterations` (default 100) as a safety net.

### 7.3 Test coverage

- Separable 2-cluster sanity test — verifies "a" group and "b" group end up
  in different clusters.
- Same-seed reproducibility test — two runs produce identical assignments.
- Function-extractor test — works with lambdas over nested data.
- Empty-input and `k > n` degeneracy tests.
- Invalid-`k` throw test.

---

## 8. Behavioural Segmentation

`behavioralSegment(customer)` classifies a customer into one of five
behavioural buckets using signal thresholds evaluated in this priority
order:

1. `avgDiscountPct ≥ 0.15`                              → **price_sensitive**
2. `avgOrderValue ≥ 3000 ∧ returnRate ≤ 0.05`           → **quality_seeker**
3. `reorderRate ≥ 0.5 ∧ touchpoints ≤ 3`                → **convenience**
4. `topBrandShare ≥ 0.6`                                → **brand_loyal**
5. `promoShare ≥ 0.5`                                   → **promo_driven**
6. fallback                                             → **convenience**

| ID | Hebrew | English | Signal |
|---|---|---|---|
| `price_sensitive` | רגיש-למחיר  | Price Sensitive | avg discount |
| `quality_seeker`  | מחפש-איכות  | Quality Seeker  | AOV + low returns |
| `convenience`     | מחפש-נוחות  | Convenience     | reorder + low touch |
| `brand_loyal`     | נאמן-מותג   | Brand Loyal     | brand share |
| `promo_driven`    | מונע-מבצעים | Promo Driven    | promo share |

Signals can be supplied explicitly on the `customer` object (preferred
when available) or derived automatically from the `orders` array —
`brand`, `amount`, `discountPct`, `returned`, `isReorder`, `promo`.

---

## 9. Venn-style Segment Overlap

`segmentOverlap(segA, segB)` returns classic set math plus Jaccard
similarity:

```js
{
  intersection: [...sorted ids],
  union:        [...sorted ids],
  onlyA:        [...sorted ids],
  onlyB:        [...sorted ids],
  jaccard:      |A ∩ B| / |A ∪ B|,
  sizeA:        number,
  sizeB:        number,
}
```

Accepts plain string arrays, `{customerIds: [...]}` objects, or `Set`
instances. Sorted outputs make diffs reproducible.

---

## 10. `recommendAction(segmentId)`

Maps any segment ID (RFM, lifecycle, or behavioural) to a marketing
playbook entry. Returns:

```js
{
  segmentId,
  kind:     'rfm' | 'lifecycle' | 'behavioural' | 'unknown',
  action:   'retain' | 'grow' | 'win-back' | 'nurture' | 'welcome',
  he:       'שימור — תגמול, VIP, ...',
  en:       'Retain — reward, VIP program, ...',
  channels: ['email', 'whatsapp', 'phone'],
  priority: 'high' | 'medium' | 'low',
}
```

Unknown IDs return a safe `nurture` fallback — the function never throws.

### Playbook defaults

| Action | Priority | Channels |
|---|---|---|
| retain    | high   | email, whatsapp, phone |
| grow      | medium | email, sms, whatsapp   |
| win-back  | high   | email, phone, whatsapp |
| nurture   | medium | email, sms             |
| welcome   | low    | email                  |

---

## 11. CLV Forecast Formula

`forecastValue(customer, horizon)` uses a transparent, auditable formula:

```
CLV = AOV × FreqPerYear × GrossMargin × RetentionFactor × DiscountFactor × H
```

Where:

- **AOV** — average order value. Derived from `orders` if present,
  otherwise `customer.avgOrderValue`.
- **FreqPerYear** — `orders.length / yearsActive` from first→last order
  span, or `customer.annualFrequency`.
- **GrossMargin** — `customer.grossMargin`, default `0.35`.
- **RetentionFactor** — mean of a geometric retention series:
  `[(1 − r^H) / (1 − r)] / H` with `r = customer.retentionRate`
  (default `0.8`). If `r ≥ 1` → `1` (no decay). If `r ≤ 0` → `1 / H`.
- **DiscountFactor** — optional NPV-style present-value discount:
  `[(1 − 1/(1+d)^H) / d] / H` when `0 < d < 1`. Defaults to `1`.
- **H** — horizon in years (`horizon` can be a number or
  `{ horizonYears, discountRate }`). Default `3`. Non-positive → `0`.

### Worked example

```
customer = { aov: 1000, freq: 10, margin: 0.4, retention: 1.0 }
horizon  = 3 years

CLV = 1000 × 10 × 0.4 × 1 × 1 × 3 = 12,000 ₪
```

With `retention = 0.5` over the same horizon:

```
retentionFactor = (1 + 0.5 + 0.25) / 3 ≈ 0.5833
CLV             = 1000 × 10 × 0.4 × 0.5833 × 3 ≈ 7,000 ₪
```

The `inputs` field in the response exposes every intermediate value so
reports and UIs can explain the number.

---

## 12. `indexCustomers` / `exportSegments` — campaign workflow

Pre-compute segment membership for a roster in one pass, then pull
ready-to-send customer-ID lists for marketing workflows:

```js
engine.indexCustomers(allCustomers);   // O(n)
const champIds   = engine.exportSegments('champions');
const atRiskIds  = engine.exportSegments('at_risk');
const newIds     = engine.exportSegments('new_customers');
```

Each customer is added to three lists per pass:

1. RFM segment ID (e.g. `champions`, `at_risk`)
2. Lifecycle stage ID (e.g. `first_time`, `churned`)
3. Behavioural ID (e.g. `price_sensitive`, `brand_loyal`)

`indexCustomers` never mutates the input array — verified by a snapshot
test.

---

## 13. Hebrew Glossary — מילון עברי

| מונח | Hebrew | הסבר |
|---|---|---|
| RFM           | מודל RFM             | מודל עדכניות (R), תדירות (F), כסף (M) |
| Recency       | עדכניות              | מספר הימים מאז הרכישה האחרונה |
| Frequency     | תדירות               | מספר הרכישות בתקופה הנבחנת |
| Monetary      | כסף                  | סכום ההוצאה בתקופה (בש״ח) |
| Segment       | פלח                  | קבוצת לקוחות עם מאפיינים משותפים |
| Lifecycle     | מחזור חיים           | שלב הלקוח במערכת היחסים עם הארגון |
| Cohort        | קוהורט               | קבוצת לקוחות שהצטרפה באותה תקופה |
| Churn         | נטישה                | לקוח שעזב או ירד מהמפה |
| CLV           | ערך חיי לקוח         | תחזית הרווח הכולל מלקוח לאורך חייו |
| k-means       | אשכול k-means        | שיטת חלוקת לקוחות לאשכולות לפי דמיון |
| Champions     | אלופים               | לקוחות הכי שווים — רוכשים לאחרונה וגם הרבה |
| Loyal         | נאמנים               | קונים עקביים עם הוצאה גבוהה |
| New           | לקוחות חדשים         | רכישה ראשונה לאחרונה |
| At Risk       | בסיכון               | לקוחות טובים שהפסיקו לרכוש |
| Cannot Lose   | אסור לאבד            | לקוחות גדולים שנעלמו — דורשים פעולה מיידית |
| Hibernating   | רדומים               | לקוחות ישנים עם פעילות נמוכה |
| Lost          | אבודים               | כנראה לא יחזרו — ROI נמוך למאמץ שימור |
| Price Sens.   | רגיש-למחיר           | מגיב להנחות, בוחר את הזול |
| Quality       | מחפש-איכות           | קונה פרימיום, החזרות מעטות |
| Convenience   | מחפש-נוחות           | הזמנה מהירה, מעט מגע |
| Brand Loyal   | נאמן-מותג            | מעדיף מותג מסוים |
| Promo Driven  | מונע-מבצעים          | קונה בעיקר כשיש מבצע |
| Retain        | שימור                | פעולה שיווקית לשמור על הלקוח |
| Grow          | הגדלה                | cross-sell / up-sell / חבילות |
| Win-back      | החזרה                | הנחה אישית / שיחת רפרנט / סקר "מה קרה" |
| Nurture       | טיפוח                | תוכן, הדגמות, הצעת קנייה שנייה |

The glossary is also exposed programmatically via
`CustomerSegmentation.GLOSSARY` for UI tooltip injection.

---

## 14. Test Suite — Coverage Map

53 tests in `onyx-procurement/test/customer/segmentation.test.js`, grouped:

| Area | # tests |
|---|---|
| RFM scoring (champion / new / lost / period window / pre-aggregated / validation) | 6 |
| Named segment mapping (champions / new / at-risk / lost / range validation / catalogue labels) | 6 |
| Lifecycle transitions (prospect / first_time / repeat / loyal / champion / at_risk / churned / catalogue) | 8 |
| k-means clustering (separable / reproducibility / function extractors / empty / k>n / invalid k) | 6 |
| Behavioural segmentation (5 buckets + derived from orders + catalogue) | 6 |
| Segment overlap (Venn math / disjoint / `{customerIds}` form) | 3 |
| recommendAction (rfm / lifecycle / behavioural / fallback) | 4 |
| CLV forecast (base / retention decay / from orders / zero horizon / discount rate / missing customer) | 6 |
| indexCustomers / exportSegments (happy path / unknown / throws / immutability) | 4 |
| Internal helpers & glossary | 3 |
| Constructor validation | 1 |

**All 53 tests pass.**

---

## 15. Rule Compliance — "לא מוחקים רק משדרגים ומגדלים"

- No existing file was modified, renamed, deleted, or touched. Every
  deliverable is net-new:
  - `onyx-procurement/src/customer/segmentation.js` — new file
  - `onyx-procurement/test/customer/segmentation.test.js` — new file
  - `_qa-reports/AG-Y091-segmentation.md` — new file (this report)
- The module never mutates its inputs. `indexCustomers` is verified
  immutable by a JSON-snapshot test.
- The module has no side effects — no writes, no network, no filesystem,
  no timers, no singletons, no globals, no `Math.random`.
- Zero runtime dependencies (no npm installs required).
- Deterministic — same input → same output. k-means seed is a plain LCG
  over an integer, so a pinned seed produces identical results across
  Node versions and operating systems.

This report is permanent and MUST NEVER be deleted. Future agents should
extend it (add a `### 2026-05-XX follow-up` section) rather than replace it.
