# AG-Y192 — Marketing Attribution Model / מודל ייחוס שיווקי

**Agent:** Y-192
**Swarm:** Techno-Kol Uzi mega-ERP
**Module:** `onyx-procurement/src/reporting/attribution.js`
**Tests:** `onyx-procurement/test/reporting/attribution.test.js`
**Date:** 2026-04-11
**Status:** PASS — 29/29 tests green / 29 מתוך 29 עברו

---

## 1. Purpose / מטרה

**EN** — Provide a deterministic, zero-dependency marketing attribution engine
for Techno-Kol Uzi. Given a customer journey (ordered list of touchpoints), the
module computes credit-per-channel and revenue attribution under six industry
standard models, and renders a bilingual report that marketing, finance and
operations can all read without additional tooling.

**HE** — מספק מנוע ייחוס שיווקי דטרמיניסטי, ללא תלות חיצונית, עבור טכנו-קול
עוזי. בהינתן מסע לקוח (רשימה מסודרת של נקודות מגע), המודול מחשב קרדיט לכל
ערוץ וייחוס הכנסות לפי שישה מודלים מקובלים בתעשייה, ומפיק דו"ח דו-לשוני
שניתן לצרוך ישירות על-ידי מחלקות השיווק, הכספים והתפעול.

---

## 2. Models Implemented / מודלים שיושמו

| # | Model                  | EN description                                            | HE description                            |
|---|------------------------|-----------------------------------------------------------|--------------------------------------------|
| 1 | `first_touch`          | 100% credit to the first touchpoint                       | כל הקרדיט לנקודת המגע הראשונה             |
| 2 | `last_touch`           | 100% credit to the last touchpoint                        | כל הקרדיט לנקודת המגע האחרונה              |
| 3 | `linear`               | Equal split across all touchpoints                        | חלוקה שווה בין כל נקודות המגע             |
| 4 | `time_decay`           | Exponential half-life decay anchored on conversion time   | דעיכה אקספוננציאלית לפי זמן חצי-חיים        |
| 5 | `position` (U-shaped)  | 40% first, 40% last, 20% split across middle              | 40% ראשון, 40% אחרון, 20% באמצע          |
| 6 | `markov`               | First-order Markov chain with removal-effect attribution  | שרשרת מרקוב בסדר ראשון עם removal-effect |

All models are **pure mathematics** — no randomness, no wall-clock calls, no
external services. Identical inputs always produce identical outputs.

כל המודלים הם **מתמטיקה טהורה** — ללא רנדומליות, ללא קריאות לשעון מערכת,
ללא שירותים חיצוניים. קלט זהה מפיק תמיד פלט זהה.

---

## 3. Public API / ממשק ציבורי

```js
const { AttributionModel } = require('./src/reporting/attribution.js');
const model = new AttributionModel({
  halfLifeDays: 7,       // default for time_decay
  positionFirst: 0.40,   // default U-shaped first weight
  positionLast: 0.40,    // default U-shaped last weight
});

// Single-journey credit distributions (each sums to 1)
model.firstTouch(journey);
model.lastTouch(journey);
model.linear(journey);
model.timeDecay(journey, { halfLifeDays });
model.positionBased(journey, { firstWeight, lastWeight });

// Corpus-level Markov chain removal-effect attribution
model.markov(journeys);

// Revenue attribution = credit × journey.revenue
model.attributeRevenue(journey, 'first_touch');

// Compare every model against a single journey or a full corpus
model.compareModels(journey);
model.compareModelsAcrossJourneys(journeys);

// Bilingual plain-text report
model.generateReport(journeys, { locale: 'both' });   // or 'en' / 'he'
```

### Touchpoint schema

```js
{
  channel:    'google_ads' | 'facebook' | 'email' | ...,
  timestamp:  ISO-8601 string OR ms epoch,
  cost?:      number,    // optional
  meta?:      object,    // free-form
}
```

### Journey schema

```js
{
  id:          string,
  touchpoints: Touchpoint[],
  converted:   boolean,
  revenue:     number,
}
```

---

## 4. Bilingual Channel Dictionary / מילון ערוצים דו-לשוני

The module ships with 22 canonical channels, each carrying an English and a
Hebrew display label. Unknown channels fall back to their raw key, so the
engine is forward-compatible with new campaigns.

המודול כולל 22 ערוצים קאנוניים, כל אחד עם תווית באנגלית ובעברית. ערוצים
לא-מוכרים נופלים בחזרה למפתח הגולמי, כך שהמנוע תואם קמפיינים חדשים ללא
שינוי קוד.

| Key           | English           | עברית            |
|---------------|-------------------|-------------------|
| google_ads    | Google Ads        | מודעות גוגל       |
| facebook      | Facebook          | פייסבוק            |
| instagram     | Instagram         | אינסטגרם           |
| linkedin      | LinkedIn          | לינקדאין           |
| tiktok        | TikTok            | טיקטוק             |
| email         | Email Campaign    | קמפיין דוא"ל       |
| newsletter    | Newsletter        | ניוזלטר            |
| organic       | Organic Search    | חיפוש אורגני       |
| direct        | Direct            | ישיר               |
| referral      | Referral          | הפניה              |
| affiliate     | Affiliate         | שותפים             |
| display       | Display Ads       | באנרים             |
| youtube       | YouTube           | יוטיוב             |
| whatsapp      | WhatsApp          | ווטסאפ             |
| sms           | SMS               | הודעת טקסט         |
| print         | Print Media       | עיתונות            |
| radio         | Radio             | רדיו               |
| tv            | Television        | טלוויזיה           |
| billboard     | Billboard         | שלט חוצות          |
| trade_show    | Trade Show        | תערוכה             |
| webinar       | Webinar           | וובינר             |
| podcast       | Podcast           | פודקאסט            |

---

## 5. Test Suite / מערך בדיקות

29 deterministic unit tests under `node --test`. Every test is self-contained,
uses only `node:test` and `node:assert/strict`, and runs in under 150 ms.

```text
node --test test/reporting/attribution.test.js

ok — firstTouch assigns 100% credit to the first touchpoint
ok — lastTouch assigns 100% credit to the last touchpoint
ok — linear splits credit evenly across all touchpoints
ok — linear stacks credit for repeated channels in the same journey
ok — timeDecay weights recent touchpoints more than older ones
ok — timeDecay with very short half-life concentrates on last touch
ok — timeDecay with very long half-life approximates linear
ok — positionBased gives 40/20/40 split for 4-touch journey by default
ok — positionBased with 1 touchpoint gives 100% to it
ok — positionBased with 2 touchpoints splits 50/50 by default weights
ok — markov returns a valid probability distribution summing to 1
ok — markov assigns more credit to channels with higher conversion impact
ok — attributeRevenue multiplies credit by journey revenue (first_touch)
ok — attributeRevenue multiplies credit by journey revenue (linear)
ok — attributeRevenue throws on unknown model
ok — empty journey returns empty credit map for every model
ok — compareModels returns credits for every model
ok — compareModelsAcrossJourneys aggregates revenue per model
ok — compareModelsAcrossJourneys excludes non-converted journeys from linear revenue
ok — generateReport produces a bilingual report by default
ok — generateReport honours locale="en" and locale="he"
ok — all models are fully deterministic — same input, same output
ok — models never mutate the input journey
ok — CHANNEL_LABELS includes Hebrew labels for every canonical channel
ok — markov handles single-channel corpus without throwing
ok — markov falls back gracefully on all-non-converted corpus
ok — positionBased respects custom first/last weights
ok — every method throws TypeError on non-object journey
ok — every model except markov on a single empty journey sums to exactly 1

tests 29 — pass 29 — fail 0 — skipped 0 — duration ~131 ms
```

### Coverage matrix / מטריצת כיסוי

| Area                         | Tests |
|------------------------------|:-----:|
| First-touch semantics        |  1    |
| Last-touch semantics         |  1    |
| Linear semantics + stacking  |  2    |
| Time-decay (3 regimes)       |  3    |
| U-shaped / position-based    |  5    |
| Markov removal-effect        |  4    |
| Revenue attribution          |  3    |
| Empty & edge cases           |  2    |
| Determinism & immutability   |  2    |
| Bilingual report             |  2    |
| Type guards                  |  1    |
| Sum-to-one invariants        |  1    |
| Channel dictionary           |  1    |
| Cross-journey aggregation    |  1    |
| **Total**                    | **29**|

---

## 6. Sample Output / דוגמת פלט

Running `generateReport` on a three-journey corpus (two converted, one not):

```text
══════════════════════════════════════════════════════════════════════
Marketing Attribution Report — דו"ח ייחוס שיווקי
Agent Y-192 — Techno-Kol Uzi mega-ERP
══════════════════════════════════════════════════════════════════════

סה"כ מסעות לקוח: 3
מסעות שהומרו לעסקה: 2
שיעור המרה: 66.67%
הכנסה כוללת: ₪15000.00

Total journeys: 3
Converted journeys: 2
Conversion rate: 66.67%
Total revenue: $15000.00

──────────────────────────────────────────────────────────────────────
First Touch — מגע ראשון
──────────────────────────────────────────────────────────────────────
  Google Ads         / מודעות גוגל        ₪    10000.00  (66.7%)
  Organic Search     / חיפוש אורגני       ₪     5000.00  (33.3%)

──────────────────────────────────────────────────────────────────────
Last Touch — מגע אחרון
──────────────────────────────────────────────────────────────────────
  Direct             / ישיר               ₪    10000.00  (66.7%)
  WhatsApp           / ווטסאפ             ₪     5000.00  (33.3%)

──────────────────────────────────────────────────────────────────────
Linear — ליניארי
──────────────────────────────────────────────────────────────────────
  Google Ads         / מודעות גוגל        ₪     4166.67  (27.8%)
  Direct             / ישיר               ₪     2500.00  (16.7%)
  Email Campaign     / קמפיין דוא"ל       ₪     2500.00  (16.7%)
  Facebook           / פייסבוק            ₪     2500.00  (16.7%)
  Organic Search     / חיפוש אורגני       ₪     1666.67  (11.1%)
  WhatsApp           / ווטסאפ             ₪     1666.67  (11.1%)

──────────────────────────────────────────────────────────────────────
Time Decay — דעיכת זמן
──────────────────────────────────────────────────────────────────────
  Direct             / ישיר               ₪     4108.69  (27.4%)
  Google Ads         / מודעות גוגל        ₪     2741.76  (18.3%)
  WhatsApp           / ווטסאפ             ₪     2683.80  (17.9%)
  Email Campaign     / קמפיין דוא"ל       ₪     2504.27  (16.7%)
  Facebook           / פייסבוק            ₪     1860.67  (12.4%)
  Organic Search     / חיפוש אורגני       ₪     1100.81  (7.3%)

──────────────────────────────────────────────────────────────────────
Position (U-Shaped) — מבוסס-מיקום (צורת U)
──────────────────────────────────────────────────────────────────────
  Google Ads         / מודעות גוגל        ₪     5000.00  (33.3%)
  Direct             / ישיר               ₪     4000.00  (26.7%)
  Organic Search     / חיפוש אורגני       ₪     2000.00  (13.3%)
  WhatsApp           / ווטסאפ             ₪     2000.00  (13.3%)
  Email Campaign     / קמפיין דוא"ל       ₪     1000.00  (6.7%)
  Facebook           / פייסבוק            ₪     1000.00  (6.7%)

──────────────────────────────────────────────────────────────────────
Markov Chain — שרשרת מרקוב
──────────────────────────────────────────────────────────────────────
  Google Ads         / מודעות גוגל        ₪     4285.71  (28.6%)
  Direct             / ישיר               ₪     2142.86  (14.3%)
  Email Campaign     / קמפיין דוא"ל       ₪     2142.86  (14.3%)
  Facebook           / פייסבוק            ₪     2142.86  (14.3%)
  Organic Search     / חיפוש אורגני       ₪     2142.86  (14.3%)
  WhatsApp           / ווטסאפ             ₪     2142.86  (14.3%)

══════════════════════════════════════════════════════════════════════
סוף הדו"ח
End of report
══════════════════════════════════════════════════════════════════════
```

---

## 7. Mathematical Notes / הערות מתמטיות

### 7.1 Time-decay weights

For each touchpoint `i`, the weight is `2^(-Δdays / halfLife)` where `Δdays`
is the distance in days between touchpoint `i` and the conversion time
(defined as the timestamp of the final touchpoint). Weights are then
normalised so the total credit equals exactly 1.

### 7.2 Position-based (U-shaped) for N touchpoints

* N = 1   → 1.0 to the single touch.
* N = 2   → `firstW / (firstW + lastW)` to first, `lastW / (...)` to last.
* N ≥ 3   → `firstW` to first, `lastW` to last, `(1 - firstW - lastW) / (N-2)`
  shared by each middle touch.

### 7.3 Markov removal-effect

Let `G` be the empirical first-order Markov graph built from all journeys
with edges counted and normalised to transition probabilities. The graph
has three special states: `__start__`, `__converted__` (absorbing) and
`__null__` (absorbing). For each observed channel `c`, the engine computes:

```
removal_effect(c) = 1 - P_{-c}(conv) / P_baseline(conv)
```

where `P_{-c}(conv)` is the conversion probability when every incoming and
outgoing edge to `c` is redirected to `__null__`. Final credit is:

```
credit(c) = removal_effect(c) / Σ removal_effect(ch)
```

Absorption probabilities are computed by bounded power-iteration (max 200
iterations) — deterministic and dependency-free.

---

## 8. Rule Compliance / עמידה בחוקים

| Rule / חוק                          | Status  | Notes                                                                                                       |
|--------------------------------------|---------|-------------------------------------------------------------------------------------------------------------|
| Never delete / לעולם לא מוחקים       | PASS    | Analytic-only module; no persistence, no mutation. Input journeys are never modified — verified by test.    |
| Node built-ins only                  | PASS    | Uses `node:test`, `node:assert/strict`, `path`. No `require` of anything outside the standard library.      |
| Bilingual EN/HE                       | PASS    | Channel dictionary, model names and report output are all EN + HE. `locale: 'en' | 'he' | 'both'` supported. |
| Deterministic                        | PASS    | No `Math.random`, no `Date.now`, no I/O. Determinism verified by an explicit test.                          |
| 15+ tests                            | PASS    | 29 tests — nearly double the requirement.                                                                   |
| Bilingual report file                | PASS    | This document.                                                                                              |

---

## 9. Files Touched / קבצים שנוצרו

| File                                                     | Purpose                        |
|----------------------------------------------------------|--------------------------------|
| `onyx-procurement/src/reporting/attribution.js`          | Engine source (new)            |
| `onyx-procurement/test/reporting/attribution.test.js`    | Unit tests — 29 cases (new)    |
| `_qa-reports/AG-Y192-attribution.md`                     | This QA report (new)           |

No existing file was modified, renamed or deleted.

---

## 10. Run / הפעלה

```bash
cd onyx-procurement
node --test test/reporting/attribution.test.js
```

Expected: `tests 29 — pass 29 — fail 0`. / צפוי: כל 29 הבדיקות עוברות.
