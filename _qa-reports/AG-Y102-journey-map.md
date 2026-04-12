# AG-Y102 — Customer Journey Map Engine / מנוע מיפוי מסע לקוח

**Agent:** Y-102 (Swarm: Customer)
**Module:** `onyx-procurement/src/customer/journey-map.js`
**Tests:** `onyx-procurement/test/customer/journey-map.test.js`
**Date / תאריך:** 2026-04-11
**Runtime / סביבת ריצה:** Node.js built-ins only (zero external deps)
**Rule upheld / כלל:** "לא מוחקים רק משדרגים ומגדלים" — append-only interactions, versioned definitions, history preserved

---

## 1. Purpose / מטרה

**EN** — Map customer touchpoints across the 9 standard lifecycle stages, across 10 channels, and compute quantitative friction/delight scores, stage-to-stage conversion, dwell time, moments of truth, persona patterns, and drop-off analytics — producing a bilingual (Hebrew RTL + English) SVG journey map out of the box.

**HE** — מיפוי נקודות מגע של הלקוח לאורך 9 שלבי מחזור חיים סטנדרטיים וב-10 ערוצי תקשורת, חישוב ציוני חיכוך/עונג כמותיים, אחוזי המרה בין שלבים, זמן שהייה, רגעי אמת, דפוסי פרסונות וניתוח נשירה — עם פלט SVG דו-לשוני (עברית RTL + אנגלית) כבר מהתיבה.

---

## 2. The 9 Standard Stages / 9 שלבי המסע הסטנדרטיים

| # | ID              | עברית   | English        | Description / תיאור                                                    |
|---|-----------------|---------|----------------|-------------------------------------------------------------------------|
| 1 | `awareness`     | מודעות  | Awareness      | Prospect first hears of the brand / חשיפה ראשונית למותג                 |
| 2 | `consideration` | שקילה   | Consideration  | Evaluates if the offering fits / בוחן האם ההצעה מתאימה                  |
| 3 | `evaluation`    | הערכה   | Evaluation     | Active comparison with alternatives / השוואה פעילה לאלטרנטיבות          |
| 4 | `purchase`      | רכישה   | Purchase       | Commits — signs / pays / contracts / חתימה, תשלום, חוזה                 |
| 5 | `onboarding`    | קליטה   | Onboarding     | Account setup + first success / הקמת חשבון והצלחה ראשונה                |
| 6 | `adoption`      | אימוץ   | Adoption       | Routine use across the org / שימוש שוטף בארגון                          |
| 7 | `retention`     | שימור   | Retention      | Keeps renewing + escalation handled / שימור + פתרון תקלות               |
| 8 | `expansion`     | הרחבה   | Expansion      | Upsell / cross-sell / new seats / מכירה משלימה ומעלה                    |
| 9 | `advocacy`      | המלצה   | Advocacy       | Promoter — references + case studies / תומך פעיל, המלצות ולקוחות מרוצים |

---

## 3. The 10 Channels / 10 ערוצי התקשורת

| ID          | עברית              | English     | Typical owner / אחראי אופייני |
|-------------|--------------------|-------------|-------------------------------|
| `website`   | אתר                | Website     | Marketing                     |
| `email`     | דוא"ל              | Email       | Marketing / Lifecycle         |
| `phone`     | טלפון              | Phone       | Sales / Support               |
| `sms`       | הודעה (SMS)        | SMS         | Lifecycle                     |
| `in-person` | פנים אל פנים       | In-Person   | Field / Sales                 |
| `portal`    | פורטל              | Portal      | Product                       |
| `sales-rep` | נציג מכירות        | Sales Rep   | Sales                         |
| `support`   | תמיכה              | Support     | Customer Success              |
| `social`    | רשתות חברתיות      | Social      | Community                     |
| `event`     | אירוע              | Event       | Events / Field                |

---

## 4. Friction Formula / נוסחת חיכוך

```
friction(touchpoint, period) = clamp01(
    0.40 * abandonmentRate
  + 0.35 * negativeSentimentRate
  + 0.25 * slaBreachRate
)
```

Where:
- `abandonmentRate` = #(outcome ∈ {abandoned, no-response}) / total
- `negativeSentimentRate` = #(sentiment == negative) / total
- `slaBreachRate` = #(durationMs > touchpoint.sla) / total
- empty touchpoint (no interactions in period) → score = 0

**HE** — נוסחת חיכוך משקללת נטישה (0.40), סנטימנט שלילי (0.35), והפרת SLA (0.25). הציון ממופה ל-[0..1] ו-0 עבור נקודת מגע ללא נתונים בתקופה.

## 5. Delight Formula / נוסחת עונג

```
delight(touchpoint, period) = clamp01(
    0.40 * positiveSentimentRate
  + 0.35 * conversionRate
  + 0.25 * repeatEngagementRate
)
```

Where:
- `positiveSentimentRate` = #(sentiment == positive) / total
- `conversionRate` = #(outcome ∈ {converted, success}) / total
- `repeatEngagementRate` = #(interactions belonging to a customer that appears more than once at this touchpoint) / total

**HE** — נוסחת עונג משקללת סנטימנט חיובי (0.40), המרה (0.35), ומעורבות חוזרת (0.25). הציון ממופה ל-[0..1].

## 6. Moments of Truth / רגעי אמת

```
impact = volume * max(delight, friction)
```

Rationale — a make-or-break touchpoint is **high-volume AND has a strong emotional signal in either direction**. Positive and negative signals both matter: a beloved checkout that drives loyalty is a moment of truth just as much as a dreaded support line. Rows sorted descending by `impact`, then `volume`, then id.

**HE** — רגע אמת הוא שילוב של תעבורה גבוהה עם אות רגשי חזק לכיוון כלשהו. גם רגעים חיוביים וגם שליליים זוכים לדירוג גבוה, כי שניהם קובעים את נאמנות הלקוח.

---

## 7. Public API Surface / ממשק ציבורי

| Method / שיטה                                   | Purpose / מטרה                                               |
|--------------------------------------------------|--------------------------------------------------------------|
| `defineStage({id, name_he, name_en, description, order})` | הגדרה/שדרוג שלב מסע                                          |
| `defineTouchpoint({id, stageId, channel, name_he, name_en, owner, sla})` | הגדרה/שדרוג נקודת מגע                                        |
| `recordInteraction({customerId, touchpointId, timestamp, outcome, sentiment, notes, durationMs})` | רישום אינטראקציה (append-only)                               |
| `journeyFor(customerId)`                         | ציר זמן ממוין של האינטראקציות של הלקוח                       |
| `frictionScore(touchpointId, period)`            | ציון חיכוך לפי הנוסחה בסעיף 4                                |
| `delightScore(touchpointId, period)`             | ציון עונג לפי הנוסחה בסעיף 5                                 |
| `stageConversion(period)`                        | אחוזי מעבר שלב → שלב הבא                                     |
| `timeInStage(customerId, stageId)`               | זמן שהייה (ms) של לקוח בשלב                                  |
| `momentsOfTruth()`                               | דירוג נקודות מגע לפי השפעה                                   |
| `generateMap()`                                  | SVG דו-לשוני עם נקודות מגע צבועות לפי עונג/חיכוך             |
| `personas({segmentId})`                          | צבירת דפוסים לפי סגמנט                                       |
| `dropoffAnalysis(period)`                        | מיקום הנשירה של הלקוחות                                      |

---

## 8. Test Coverage / כיסוי בדיקות

Run: `node --test test/customer/journey-map.test.js`
**Result / תוצאה:** **20 pass / 0 fail** (exceeds the 18-test minimum).

| #  | Suite                                   | Test / בדיקה                                                                 |
|----|-----------------------------------------|------------------------------------------------------------------------------|
| 01 | seed + definitions                      | seeds 9 standard stages                                                      |
| 02 | seed + definitions                      | bilingual labels on every standard stage                                     |
| 03 | seed + definitions                      | `defineTouchpoint` validates stage + channel                                 |
| 04 | seed + definitions                      | supports all 10 channels                                                     |
| 05 | interactions                            | `recordInteraction` appends with sequential `seq`                            |
| 06 | interactions                            | rejects unknown touchpoint / outcome / sentiment                             |
| 07 | interactions                            | `journeyFor` returns ordered timeline                                        |
| 08 | scoring                                 | `frictionScore` weights abandonment + negative + SLA breach                  |
| 09 | scoring                                 | `frictionScore` is 0 for empty touchpoint                                    |
| 10 | scoring                                 | `delightScore` weights positive + conversion + repeat                        |
| 11 | scoring                                 | scoring honours period filter                                                |
| 12 | flow analytics                          | `stageConversion` computes stage→next rates                                  |
| 13 | flow analytics                          | `timeInStage` computes dwell correctly                                       |
| 14 | flow analytics                          | `dropoffAnalysis` flags highest-reached stage per customer                   |
| 15 | moments of truth + visualization        | `momentsOfTruth` ranks highest-impact touchpoints first                      |
| 16 | moments of truth + visualization        | `generateMap` produces bilingual SVG with touchpoint dots                    |
| 17 | personas + never-delete                 | `personas` aggregate per segment                                             |
| 18 | personas + never-delete                 | never-delete: `defineStage` with same id creates new version + keeps history |
| 19 | personas + never-delete                 | all 9 standard stage ids are exported as constants                           |
| 20 | personas + never-delete                 | all 10 channels have bilingual labels                                        |

---

## 9. Bilingual Glossary / מילון מונחים

| English term       | עברית              | Notes / הערות                                                         |
|--------------------|--------------------|------------------------------------------------------------------------|
| Journey            | מסע                | קשת חיי הלקוח                                                          |
| Stage              | שלב                | אחד מתוך 9 שלבי החיים הסטנדרטיים                                      |
| Touchpoint         | נקודת מגע          | אינטראקציה קונקרטית בין לקוח לעסק                                     |
| Channel            | ערוץ               | מדיום — אחד מ-10 הערוצים                                              |
| Interaction        | אינטראקציה         | אירוע append-only ברישום הלקוח                                        |
| Outcome            | תוצאה              | success / abandoned / converted / escalated / repeat / no-response / pending |
| Sentiment          | סנטימנט            | positive / neutral / negative                                         |
| Friction           | חיכוך              | חיכוך — מדד שלילי לחוויית הלקוח                                      |
| Delight            | עונג               | עונג — מדד חיובי לחוויית הלקוח                                        |
| Abandonment rate   | אחוז נטישה         | אינטראקציות שהסתיימו בנטישה/חוסר תגובה                                |
| SLA breach         | הפרת אמנה          | משך ארוך מה-SLA המוגדר לנקודת המגע                                    |
| Conversion rate    | אחוז המרה          | אינטראקציות שהסתיימו ב-converted/success                              |
| Repeat engagement  | מעורבות חוזרת      | אותו לקוח חוזר יותר מפעם אחת באותה נקודת מגע                          |
| Moment of truth    | רגע אמת            | נקודת מגע עם תעבורה גבוהה ואות רגשי חזק                                |
| Dwell time         | זמן שהייה          | הזמן שלקוח מבלה בשלב                                                  |
| Drop-off           | נשירה              | הנקודה שבה לקוח עוזב את המסע ולא מתקדם                                |
| Persona            | פרסונה             | דפוס התנהגות של קבוצת לקוחות                                          |
| Segment            | סגמנט              | חיתוך של בסיס הלקוחות (enterprise, smb, vip, ...)                     |
| Append-only        | רק-הוספה           | הרישומים לא נמחקים אף פעם — רק מתווספים                               |
| Version upgrade    | שדרוג גרסה         | החלפת הגדרה במקום מחיקה — הגרסה הקודמת נשמרת ב-`_history`              |

---

## 10. Rule compliance / ציות לכלל

- **Append-only interactions** — `_interactions` הוא מערך שלא נגרע ממנו אף פעם; לכל רשומה `seq` יציב.
- **Versioned definitions** — `defineStage` ו-`defineTouchpoint` עם id קיים יוצרים גרסה חדשה ומעבירים את הישנה ל-`_history`.
- **Zero external deps** — רק `node:*` (test runner בלבד); שום npm package.
- **Bilingual RTL** — כל שלב, ערוץ ונקודת מגע חייבים `name_he` + `name_en`; ה-SVG כולל `direction="rtl"` ו-`lang="he"` וכותרות Hebrew+English.
- **Determinism** — ה-constructor מקבל `now()` להזרקת שעון כך שבדיקות דטרמיניסטיות.

---

## 11. Files delivered / קבצים שנמסרו

1. `C:/Users/kobi/OneDrive/kobi/המערכת 2026  KOBI EL/onyx-procurement/src/customer/journey-map.js`
2. `C:/Users/kobi/OneDrive/kobi/המערכת 2026  KOBI EL/onyx-procurement/test/customer/journey-map.test.js`
3. `C:/Users/kobi/OneDrive/kobi/המערכת 2026  KOBI EL/_qa-reports/AG-Y102-journey-map.md` (this file)

**Sign-off / אישור:** Agent Y-102 — build green — 20/20 tests passing — 2026-04-11
