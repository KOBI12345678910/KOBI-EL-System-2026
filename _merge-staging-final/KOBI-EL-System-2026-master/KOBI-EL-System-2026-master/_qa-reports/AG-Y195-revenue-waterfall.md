# AG-Y195 — Revenue Waterfall Engine / מנוע מפל הכנסות

**Agent:** Y-195
**System:** Techno-Kol Uzi mega-ERP — ONYX Procurement subsystem
**Swarm:** Reporting & Finance
**Author:** Kobi
**Date:** 2026-04-11
**Status:** GREEN — 30 / 30 tests passing

---

## 1. Mission / משימה

**EN.** Build a zero-dependency, pure-JavaScript revenue waterfall
engine that rolls a period's revenue from a starting ARR/MRR base
through `new → expansion → contraction → churn` into a closing
balance, exposes the classic Net Revenue Retention, Gross Revenue
Retention, Quick Ratio and Burn Multiple metrics, renders a
bilingual Palantir-themed SVG, and crucially — adapts the same
engine to Techno-Kol Uzi's real business: project-based metal
fabrication revenue recognised at completion milestones (welding,
cutting, powder-coating, installation).

**HE.** לבנות מנוע מפל הכנסות ללא תלויות חיצוניות ב-JavaScript טהור,
המגלגל הכנסות תקופתיות מ-ARR/MRR פתיחה דרך `חדשים ← הרחבה ← צמצום ←
נטישה` לסיכום סגירה, חושף את המדדים הקלאסיים NRR, GRR, Quick Ratio
ו-Burn Multiple, מרנדר SVG דו-לשוני בעיצוב Palantir, וחשוב מכל —
מתאים את אותו מנוע לעסק האמיתי של טכנו-קול עוזי: הכנסה מבוססת
פרויקטים של ייצור מתכת, המוכרת באבני דרך (ריתוך, חיתוך, צביעה,
התקנה).

---

## 2. Deliverables / תוצרים

| File | Purpose |
|---|---|
| `onyx-procurement/src/reporting/revenue-waterfall.js` | Engine — class `RevenueWaterfall`, constants, helpers, SVG renderer |
| `onyx-procurement/test/reporting/revenue-waterfall.test.js` | 30 unit tests (`node --test`) |
| `_qa-reports/AG-Y195-revenue-waterfall.md` | This bilingual report |

**Zero dependencies introduced.** Only Node built-in `node:crypto`.
**Zero files deleted.** Append-only: existing QA reports, tests,
source files untouched.

---

## 3. Public API / ממשק ציבורי

```js
const {
  RevenueWaterfall,
  BUCKETS, BUCKET_ORDER, CUSTOMER_STATUS, PROJECT_STATUS, REV_MODEL,
  LABELS_HE, LABELS_EN, PALANTIR_THEME,
  formatNIS, formatPct, classifyCustomer,
  createMemoryStore, escapeSvg, makeSnapshotId, indexById,
} = require('./src/reporting/revenue-waterfall');

const rw = new RevenueWaterfall({ lang: 'he' });

// 1. SaaS-style waterfall
const snap = rw.build('2026-01-01', '2026-03-31', customerBase);

// 2. Project-based waterfall (metal fab completion revenue)
const snapP = rw.buildProjectBased('2026-01-01', '2026-03-31', projects);

// 3. Roll forward into the next period
const snap2 = rw.rollForward(snap, nextCustomerBase);

// 4. Metrics
rw.netRetention(snap);   // end / start
rw.grossRetention(snap); // (start - |contraction| - |churn|) / start
rw.quickRatio(snap);     // (new + expansion) / (|contraction| + |churn|)
rw.burnMultiple(snap, netBurn);

// 5. Bilingual Palantir-themed SVG
const svgHe = rw.renderSVG(snap, { lang: 'he' });
const svgEn = rw.renderSVG(snap, { lang: 'en' });

// 6. Append-only history
rw.history();
rw.latest();
```

### Snapshot shape / מבנה תמונה

```js
{
  snapshotId:   'snap_ab12cd34ef56',
  type:         'subscription' | 'project_completion',
  periodStart:  ISO,
  periodEnd:    ISO,
  currency:     'NIS',
  start:       { amount, count,            label: { he, en } },
  new:         { amount, count, customers, label: { he, en } },
  expansion:   { amount, count, customers, label: { he, en } },
  contraction: { amount, count, customers, label: { he, en } },
  churn:       { amount, count, customers, label: { he, en } },
  end:         { amount, count,            label: { he, en } },
  computedEnd,
  reconciles,   // true if |computedEnd - end| < 0.01 NIS
  drift,
  netRetention,
  grossRetention,
  quickRatio,
  createdAt,
  supersedes,   // null — lineage pointer for corrections
  rolledFrom,   // present on rollForward() snapshots
}
```

---

## 4. Waterfall Math / מתמטיקת המפל

### 4.1 Canonical roll-forward / גלגול קנוני

```
end = start + new + expansion + contraction + churn
```

`contraction` and `churn` are **signed negative**, so the
expression above is a literal addition; the engine stores the
actual negative values (e.g. churn = `-8000`) rather than absolute
values, which means the reconciliation check is a plain sum with
zero floating-point sensitivity beyond 0.01 NIS drift.

### 4.2 Net Revenue Retention / שימור הכנסה נטו

```
NRR = end / start
```

**EN.** Includes new logos as well as expansion — this is the
"full" retention that investors ask about. NRR > 100% means the
existing + new base is growing faster than churn; a healthy SaaS
company typically runs 110–130%.

**HE.** כולל את כל הלקוחות החדשים וההרחבות. NRR מעל 100% פירושו
שהבסיס הקיים גדל מהר יותר מהנטישה; חברה בריאה רצה בדרך כלל
110-130%.

### 4.3 Gross Revenue Retention / שימור הכנסה ברוטו

```
GRR = (start - |contraction| - |churn|) / start
```

**EN.** Strips new + expansion. Measures how much of last
period's base is still paying. Always ≤ NRR. Healthy SaaS: 90%+.

**HE.** מסנן לקוחות חדשים והרחבות. מודד כמה מהבסיס של התקופה
הקודמת עדיין משלם. תמיד ≤ NRR.

### 4.4 Quick Ratio

```
QR = (new + expansion) / (|contraction| + |churn|)
```

**EN.** Classic Bessemer metric. QR > 4 is elite, 2–4 healthy,
< 1 burning down.

**HE.** מדד קלאסי של Bessemer. מעל 4 מצוין, 2-4 בריא, מתחת ל-1
נשרף.

### 4.5 Burn Multiple

```
BM = netBurn / netNewARR
```

where `netNewARR = new + expansion + contraction + churn`. If
net-new is ≤ 0, the metric is undefined (returns `null`). Elite
< 1, healthy 1–2, worst > 3.

---

## 5. Project-Based Adaptation / התאמה לפרויקטים

**EN.** Techno-Kol Uzi is primarily a metal-fabrication shop, not
a SaaS company. Its real revenue comes from discrete projects —
hangar steel frames, powder-coating lines, cutting-station
retrofits, installation upgrades — each with a contract value, a
percent-complete, and a status (planned / in-progress / completed
/ on-hold / cancelled).

`buildProjectBased(periodStart, periodEnd, projects)` applies the
exact same waterfall vocabulary to projects:

| Project event | Bucket |
|---|---|
| New award, 0% → any% in-period | **new** |
| In-progress, % complete rises | **expansion** |
| Scope reduced mid-job (contract value drops) | **contraction** |
| Project cancelled (written off) | **churn** |
| Steady-state completion without scope change | (no bucket) |

**Recognised revenue** per project = `contractValue × pctComplete`.
The engine computes a start and end recognition for every project
and classifies the delta.

**HE.** טכנו-קול עוזי אינה חברת SaaS — היא בעיקר מפעל לייצור
מתכת. ההכנסה האמיתית מגיעה מפרויקטים בדידים: שלדי ברזל לאולמות,
קווי צביעה, שדרוגי תחנות חיתוך, התקנות. לכל פרויקט יש ערך חוזה,
אחוז השלמה וסטטוס.

`buildProjectBased` משתמש באותה שפת מפל, רק שהמונחים מוחלים
על פרויקטים: פרויקט חדש = "חדשים", עלייה באחוז ההשלמה = "הרחבה",
ירידה בערך החוזה = "צמצום", ביטול = "נטישה".

### 5.1 Why this matters / למה זה חשוב

The same SVG, the same NRR/GRR/Quick Ratio, the same bilingual
labels — the CFO can now flip between a subscription view
(retainer customers, software licences, support contracts) and a
project view (fabrication jobs) **without changing vocabulary**.
The dashboard reads the same, the board deck reads the same, and
the roll-forward is identical math.

---

## 6. Never-Delete Contract / חוזה "לא-מוחקים"

**EN.** The engine is **append-only**:

1. Every call to `build()` / `buildProjectBased()` produces a
   new snapshot with a content-hashed id (`snap_ab12cd34ef56`)
   and pushes it onto the store.
2. Churned customers are **never removed** from the customer
   ledger — they transition to `status: churned` and remain
   available for win-back reporting years later.
3. A correction is a **new snapshot** that references the prior
   snapshot via `supersedes: <prevId>`, never an in-place
   overwrite. The original snapshot is preserved for audit.
4. `history()` returns a chronological slice of every snapshot
   ever produced. `latest()` returns the most recent.

**HE.** המנוע מצרף בלבד:

1. כל קריאה ל-`build()` מייצרת תמונת מצב חדשה עם מזהה
   גיבוב-תוכן ומוסיפה אותה לחנות.
2. לקוחות שנטשו לא נמחקים אף פעם — הם עוברים לסטטוס `churned`
   ונשארים לנצח במערכת.
3. תיקון הוא תמונת מצב חדשה עם הפניה לקודמת דרך `supersedes`.
4. `history()` חוזרת כל התמונות שאי-פעם נוצרו.

---

## 7. Palantir Theme / ערכת עיצוב Palantir

SVG rendering uses a hand-tuned Palantir-esque dark palette:

```
bg             #0b0f17  near-black navy
surface        #101623  card surface
border         #1f2b3e  subtle border
text           #e6edf6  primary text
textMuted      #9aa8bf  secondary text
accent         #1f8bff  signature blue
accentAlt      #00d1b2  teal
success        #00b37e  expansion / new
warning        #f2a900  contraction
danger         #d22b2b  churn
gridline       #22304a  axis gridlines
```

Fonts:

```
he   Rubik, Heebo, "Arial Hebrew", Arial, sans-serif
en   Inter, "IBM Plex Sans", Helvetica, Arial, sans-serif
mono "IBM Plex Mono", "JetBrains Mono", monospace
```

The layout is 1000 × 560 by default with 48pt title, 12pt body,
10pt small. Bars are 70% slot-width, rounded 2px, 92% opacity.
Connector lines between non-total bars are dashed
`textMuted` 2-2. The grid is 4 horizontal lines with mono NIS
labels on the left margin.

RTL: when `{ lang: 'he' }` is passed, the SVG root emits
`direction="rtl"` and the `font-family` is the Hebrew stack. LTR
for English.

---

## 8. NIS Formatting / עיצוב שקל

`formatNIS(n, opts)` is a pure, deterministic formatter — never
touches `Intl.NumberFormat` so output is stable across locales:

```js
formatNIS(1234.5)                      // "₪1,234.50"
formatNIS(-1234.5)                     // "−₪1,234.50"
formatNIS(1_500_000, { compact: true }) // "₪1.50M"
formatNIS(1_500,     { compact: true }) // "₪1.5K"
formatNIS(10, { symbol: 'USD ' })       // "USD 10.00"
formatNIS(null)                         // "—"
formatNIS(NaN)                          // "—"
```

Uses a proper minus sign (U+2212) for negatives, a thousands
comma, fixed 2-digit minor unit, and `₪` as the default glyph.

---

## 9. Test Coverage / כיסוי בדיקות

30 tests, 100% pass — `node --test test/reporting/revenue-waterfall.test.js`

| # | Test | Focus |
|---|---|---|
| 01 | build smoke | end-to-end shape |
| 02 | bucket amounts | fixture arithmetic |
| 03 | reconciliation | start + deltas == end |
| 04 | NRR | end / start |
| 05 | GRR | excludes new + expansion |
| 06 | flat customers | no bucket movement |
| 07 | pure new-logo period | zero start → null NRR |
| 08 | pure churn period | end = 0 → NRR = 0 |
| 09 | classifyCustomer | helper coverage |
| 10 | formatNIS | positive/negative/compact/symbol |
| 11 | formatPct | rounding |
| 12 | buildProjectBased | metal-fab fixture |
| 13 | project waterfall rollup | drift + reconciliation |
| 14 | pure new project awards | zero start |
| 15 | renderSVG structural | `<svg>`, `<rect>`, `<text>`, `<line>` |
| 16 | SVG Hebrew | `direction="rtl"` + Hebrew labels |
| 17 | SVG English | `direction="ltr"` + English labels |
| 18 | SVG Palantir palette | all bucket colours present |
| 19 | append-only history | 3 snapshots, distinct ids |
| 20 | invalid period throws | periodEnd ≤ periodStart |
| 21 | non-array base throws | null / object |
| 22 | quick ratio | (new+exp)/(|contr|+|churn|) |
| 23 | burn multiple | positive vs negative net-new |
| 24 | rollForward | prev.end → next.start |
| 25 | renderSVG guard | null / empty snapshot |
| 26 | escapeSvg | XML injection guard |
| 27 | BUCKET_ORDER frozen | canonical order |
| 28 | makeSnapshotId | deterministic |
| 29 | indexById | Map lookup helper |
| 30 | project SVG render | bilingual labels |

### Run / הרצה

```bash
cd onyx-procurement
node --test test/reporting/revenue-waterfall.test.js
```

### Result / תוצאה

```
ℹ tests 30
ℹ pass 30
ℹ fail 0
ℹ duration_ms ~125
```

---

## 10. Integration Notes / הערות שילוב

**EN.** The engine is a pure function library — it does not
touch HTTP, the database or the filesystem. To wire it into the
existing ONYX Procurement dashboard:

1. Import from `./src/reporting/revenue-waterfall`.
2. Construct `new RevenueWaterfall({ lang, store, theme })`.
   Pass a persistent store (Postgres-backed `save`/`list`/`latest`
   closure) for production; the default in-memory store is fine
   for tests.
3. Feed `customerBase` from `customers` + `subscriptions`
   tables, or `projects` for metal-fab view.
4. Serve `renderSVG(snap, { lang })` as `image/svg+xml` at
   `/api/reporting/revenue-waterfall.svg`.
5. Expose JSON at `/api/reporting/revenue-waterfall.json`.

**HE.** המנוע הוא ספריית פונקציות טהורה. לשילוב בדשבורד:

1. ייבוא מ-`./src/reporting/revenue-waterfall`.
2. יצירת `new RevenueWaterfall({ lang, store, theme })` —
   לייצור, להעביר store שמחובר ל-Postgres.
3. הזנת הנתונים מטבלאות `customers` + `subscriptions` או
   `projects` לייצור מתכת.
4. הגשת `renderSVG` כ-`image/svg+xml` ב-`/api/reporting/revenue-waterfall.svg`.

---

## 11. Bucket Examples / דוגמאות דליים

Using the Q1-2026 fixture in the test file:

| Customer | MRR start | MRR end | Delta | Bucket |
|---|---|---|---|---|
| Teva Pharmaceuticals | 10,000 | 12,000 | +2,000 | **expansion** |
| Strauss Group | 5,000 | 5,000 | 0 | (flat) |
| Osem | 8,000 | 0 | −8,000 | **churn** |
| Iscar | 0 | 4,000 | +4,000 | **new** |
| Elbit Systems | 6,000 | 3,000 | −3,000 | **contraction** |
| Rafael | 0 | 2,500 | +2,500 | **new** |

**Waterfall / מפל:**

```
start        ₪29,000
  + new      ₪ 6,500  (Iscar + Rafael)
  + expansion ₪2,000  (Teva)
  − contraction ₪3,000 (Elbit)
  − churn     ₪8,000  (Osem)
= end        ₪26,500

NRR = 26,500 / 29,000 = 91.38%
GRR = (29,000 − 3,000 − 8,000) / 29,000 = 62.07%
Quick ratio = (6,500 + 2,000) / (3,000 + 8,000) = 0.773
```

---

## 12. Metal-Fab Example / דוגמה לייצור מתכת

Using the Q1-2026 project fixture:

| Project | Contract | %start | %end | Status end | Bucket |
|---|---|---|---|---|---|
| Hangar steel frame | ₪450,000 | 0% | 100% | completed | **new** |
| Powder-coating line | ₪800,000 | 25% | 60% | in_progress | **expansion** (+₪280,000) |
| Cutting station retrofit | ₪200,000 | 30% | 30% | cancelled | **churn** (−₪60,000) |
| Installation upgrade | ₪300,000 (was ₪400,000) | 40% | 40% | in_progress | **contraction** (−₪40,000) |

```
start     ₪420,000
  + new   ₪450,000
  + exp   ₪280,000
  − cont  ₪ 40,000
  − churn ₪ 60,000
  (computed) = ₪1,050,000
```

---

## 13. Rule-of-the-ERP Compliance / תאימות לחוק "לא-מוחקים"

| Check | Status |
|---|---|
| No files deleted | ✅ |
| No existing files modified | ✅ |
| No npm dependencies added | ✅ |
| Only Node built-ins (`node:crypto`) | ✅ |
| Bilingual he + en | ✅ |
| Append-only history | ✅ |
| Test count ≥ 15 | ✅ (30) |
| All tests green | ✅ (30 / 30) |
| Palantir theme | ✅ |
| NIS formatting | ✅ |
| Project-based adaptation | ✅ |
| SVG bilingual output | ✅ |

---

## 14. Signature / חתימה

**Agent:** Y-195
**Swarm:** Reporting & Finance
**ERP:** Techno-Kol Uzi
**Date:** 2026-04-11
**Report lines:** ~300
**Engine lines:** ~620
**Test lines:** ~380
**Tests passing:** 30 / 30
