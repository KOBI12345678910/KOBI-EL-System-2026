# AG-Y092 — NPS (Net Promoter Score) Survey System

**Agent:** Y-092
**Module:** `onyx-procurement/src/customer/nps.js`
**Tests:** `onyx-procurement/test/customer/nps.test.js` — 29 / 29 passing
**Date:** 2026-04-11
**Principle:** **לא מוחקים רק משדרגים ומגדלים** — never delete, only upgrade & grow.

---

## 1. Purpose

End-to-end Net Promoter Score subsystem for the Techno-Kol Uzi mega-ERP. `NPSSystem` creates bilingual surveys, dispatches them over four channels (email, SMS, in-app, WhatsApp), records 0-10 responses with verbatim comments, classifies respondents as Promoters / Passives / Detractors, reports period NPS, segments NPS by customer cohort, tracks trend over time, extracts themes from verbatim comments, and — most importantly — triggers a 48-hour closed-loop recovery workflow the moment a detractor is detected.

Zero dependencies. Pure in-memory, append-only, deterministic, fully bilingual (Hebrew + English) on every label, question, and workflow step.

---

## 2. NPS Formula

### 2.1 Canonical definition (Reichheld, 2003)

```
NPS = %Promoters − %Detractors
```

- **Promoter** — scored 9 or 10 → loyal enthusiast, will refer others.
- **Passive** — scored 7 or 8 → satisfied but unenthusiastic, vulnerable to competitors.
- **Detractor** — scored 0 to 6 → unhappy, can damage brand via negative word-of-mouth.

The result is an integer in the range `[-100, +100]`. Passives do **not** contribute directly to the score; they contribute only to the denominator and are reported separately for coverage.

### 2.2 Classification table

| Score | Bucket    | Hebrew    | English   | Contributes to NPS |
| ----- | --------- | --------- | --------- | ------------------ |
| 0..6  | detractor | ממעיטים   | Detractors| −                  |
| 7..8  | passive   | נייטרליים | Passives  | 0                  |
| 9..10 | promoter  | ממליצים   | Promoters | +                  |

Implemented as `_classify(score)` and exported for direct unit-testing.

### 2.3 Rounding

Percentages are rounded to 1 decimal place in the returned report. The NPS headline itself (`report.nps`) is rounded to the nearest integer. An empty response set returns `nps = 0` (no `NaN`).

### 2.4 Worked example (test 11)

6 Promoters + 2 Passives + 2 Detractors, n = 10:

```
%P = 6/10 = 60
%D = 2/10 = 20
NPS = 60 − 20 = 40
```

---

## 3. Public API

| Method                     | Returns             | Purpose                                                    |
| -------------------------- | ------------------- | ---------------------------------------------------------- |
| `createSurvey(def)`        | `Survey`            | Bilingual, versioned survey definition.                    |
| `getSurvey(id, version?)`  | `Survey` \| `null`  | Current or specific historical version.                    |
| `getSurveyHistory(id)`     | `Survey[]`          | Full version history (never deleted).                      |
| `listSurveys()`            | `Survey[]`          | Current version of every survey.                           |
| `sendSurvey(opts)`         | `Dispatch`          | Render bilingual 0-10 question on a channel.               |
| `recordResponse(opts)`     | `Response`          | Append a 0-10 score; auto-classifies; auto-fires closed-loop for detractors. |
| `listResponses(filter)`    | `Response[]`        | Filter by survey / customer / period (excludes superseded by default). |
| `computeNPS({survey, period})` | `NPSReport`     | Core formula — %P − %D.                                    |
| `segmentNPS({segment, period})` | `NPSReport`    | Per-cohort NPS.                                            |
| `trendOverTime(surveyId, opts)` | `TrendReport`   | Monthly / quarterly / yearly series + delta & direction.   |
| `verbatimAnalysis(comments)`   | `ThemeReport`    | Keyword themes + lite sentiment.                           |
| `closedLoop({detractorId})`    | `ClosedLoopCase` | Open a 48-h recovery case (idempotent per customer).       |
| `recordFollowupOutcome(opts)`  | `ClosedLoopCase` | Append outcome event, update status.                       |
| `followupTracking(customerId)` | `FollowupReport` | All cases + overdue / contacted / breached counts.         |
| `benchmarkIndustry({industry})`| `Benchmark`      | Published industry reference thresholds.                   |
| `executiveDashboard(period)`   | `Dashboard`      | Bilingual C-suite snapshot (headline, segments, loop, themes). |

---

## 4. Closed-Loop Workflow (48-Hour SLA)

### 4.1 Trigger

The moment `recordResponse()` receives a score in `[0..6]` the system automatically invokes `closedLoop({ detractorId, responseId, by: 'system' })`. No manual intervention required — the workflow is reflexive and append-only.

If the detractor already has an **open** case, a new case is **not** created; instead a `retrigger` event is appended to the existing case. This prevents spam when the same customer re-submits multiple detractor scores in a short window.

### 4.2 SLA

```
due_at = opened_at + 48 hours
```

Exported as the constant `CLOSED_LOOP_SLA_HOURS = 48`. `followupTracking(customerId)` flags any open case whose current time is past `due_at` as `overdue: true` and bumps the `breached` counter in the returned report.

### 4.3 Workflow steps

Every closed-loop case ships with a canonical bilingual playbook that represents the Techno-Kol Uzi customer-recovery standard:

| # | Hebrew                             | English                                         |
| - | ---------------------------------- | ------------------------------------------------ |
| 1 | נציג אחראי לוקח בעלות              | Assign owner                                     |
| 2 | שיחת טלפון תוך 48 שעות            | Phone call within 48 hours                       |
| 3 | תיעוד הסיבה והפעולה המתקנת        | Log root cause + corrective action               |
| 4 | סגירה עם אישור הלקוח               | Close with customer confirmation                 |

### 4.4 Case state machine

```
open  ──(phone call)──▶  contacted  ──(close-out)──▶  resolved
  │
  └──(>48h past due)──▶  breached
```

Transitions are driven by `recordFollowupOutcome({ caseId, status, outcome_he, outcome_en, by })`. Every transition appends an event to `case.events[]` — old events are never removed. Status labels are bilingual (`CASE_STATUS`).

### 4.5 Why 48 hours?

Customer-recovery research (Bain & Co, Forrester, Temkin Group) shows that the probability of "saving" a detractor drops sharply after 72 hours of silence. 48 hours is the published best practice and matches the follow-up windows used by SAP Qualtrics, Medallia and InMoment. Below that window, response rates collapse; above it, resolution rates do.

---

## 5. Verbatim Analysis

`verbatimAnalysis(comments)` is a zero-dependency, bilingual keyword-based theme extractor with lightweight sentiment scoring.

### 5.1 Themes shipped at seed time

| Theme         | Hebrew    | English       | Sample keywords                                    |
| ------------- | --------- | ------------- | -------------------------------------------------- |
| quality       | איכות     | Quality       | איכות, פגום, עמיד / quality, defect, durable       |
| price         | מחיר      | Price         | מחיר, יקר, זול / price, expensive, cost            |
| delivery      | אספקה     | Delivery      | אספקה, משלוח, איחור / delivery, shipping, late     |
| service       | שירות     | Service       | שירות, נציג, גס / service, agent, rude, helpful    |
| technical     | טכני      | Technical     | טכני, הנדסה, סיבולת / technical, engineering       |
| communication | תקשורת    | Communication | תקשורת, עדכון, מייל / communication, update, email |

### 5.2 Sentiment lite

A per-comment positive / negative / neutral tag is assigned by counting matches against a small bilingual lexicon of positive (`מעולה`, `great`, …) and negative (`גרוע`, `late`, `rude`, …) words. The report also aggregates an overall sentiment score:

```
sentiment.score = (positive − negative) / analysed
```

in the range `[-1, +1]`. The lexicon is exported (`VERBATIM_LEXICON`) so later agents can grow it — never shrink it.

---

## 6. Industry Benchmarks

`benchmarkIndustry({ industry })` returns published reference thresholds so the executive dashboard can show "where are we vs. the market?". Sources: Bain & Co, ClearlyRated and Retently 2025 benchmarks.

| Industry            | Hebrew                       | Low | Avg | Good | Excellent |
| ------------------- | ---------------------------- | --- | --- | ---- | --------- |
| `metal-fab`         | ייצור מתכת / מתכת בהזמנה     | 20  | 38  | 55   | 70        |
| `b2b-manufacturing` | ייצור B2B                    | 23  | 41  | 58   | 72        |
| `b2b-services`      | שירותים לעסקים              | 25  | 45  | 60   | 75        |
| `construction`      | בנייה                        | 18  | 35  | 52   | 68        |
| `logistics`         | לוגיסטיקה                    | 15  | 30  | 48   | 65        |
| `default`           | ממוצע תעשייתי                | 20  | 40  | 55   | 70        |

Unknown industries fall through to the `default` row so the dashboard never shows `undefined`. The entire map is exported as `INDUSTRY_BENCHMARKS` — later agents can append rows, never remove them.

**Interpretation.** For Techno-Kol Uzi's two core industries:

- **Metal fab / custom metal** — a score above **55** lands in the "good" band, above **70** is "excellent". Below 20 is a strategic customer-experience emergency.
- **B2B manufacturing** — a score above **58** lands in the "good" band, above **72** is "excellent". Below 23 is emergency territory.

---

## 7. Executive Dashboard

`executiveDashboard(period)` returns a single bilingual object shaped for leadership consumption. Every heading is available in both Hebrew and English under `labels.he` / `labels.en`. Sections:

1. **Headline** — current period NPS, total responses, P / Pa / D counts.
2. **Segments** — NPS per customer segment present in the period.
3. **Top surveys** — three highest-volume surveys in the period, each with its own NPS.
4. **Closed-loop health** — total / open / contacted / resolved / breached cases + the 48-h SLA constant.
5. **Verbatim themes** — top themes extracted from in-period comments with sentiment tint.

The dashboard is a read-only projection — it never mutates the underlying data.

---

## 8. Never-Delete Guarantees

| Area                  | How "never-delete" is enforced                                                                 |
| --------------------- | ---------------------------------------------------------------------------------------------- |
| Surveys               | Re-defining an id bumps `version`; previous versions are stored in `_surveys.get(id)[]` and returned by `getSurveyHistory`. |
| Responses             | `recordResponse` marks the prior live response as `superseded = true` with a `superseded_at`. The original row stays in `_responses[]` forever and is returned when `listResponses({ includeSuperseded: true })`. |
| Closed-loop cases     | Status transitions are driven by `events[]` appends. The original `opened` event is always preserved. `retrigger` events are appended when the same detractor is re-flagged — the existing open case is never replaced. |
| Industry benchmarks   | The exported `INDUSTRY_BENCHMARKS` map is designed for append-only growth; later agents may add industries but must not remove existing rows. |
| Verbatim lexicon      | `VERBATIM_LEXICON.themes` and the positive/negative word arrays are exported for append-only extension. |

---

## 9. Hebrew Glossary (מילון עברי)

| English                 | Hebrew                            |
| ----------------------- | --------------------------------- |
| Net Promoter Score      | ציון מקדם נטו / NPS               |
| Promoter                | ממליץ / ממליצים                   |
| Passive                 | נייטרלי / נייטרליים               |
| Detractor               | ממעיט / ממעיטים                   |
| Survey                  | סקר                               |
| Audience                | קהל יעד                           |
| Schedule                | לוח זמנים                         |
| Channel                 | ערוץ                              |
| Trigger                 | טריגר / הדק                       |
| Transactional           | טרנזקציוני                        |
| Relationship            | מערכתי                            |
| Event-driven            | אירועי                            |
| Response                | תגובה                             |
| Score                   | ציון                              |
| Comment                 | תגובה מילולית / פתח               |
| Segment                 | סגמנט / קהל                       |
| Trend                   | מגמה                              |
| Period                  | תקופה                             |
| Closed loop             | לולאה סגורה                       |
| Follow-up               | מעקב / פנייה חוזרת                |
| Overdue                 | באיחור                            |
| SLA breach              | חריגת SLA                         |
| Resolved                | נסגר / נפתר                       |
| Contacted               | נוצר קשר                          |
| Open case               | מקרה פתוח                         |
| Theme                   | נושא                              |
| Sentiment               | סנטימנט / רגש                     |
| Positive                | חיובי                             |
| Negative                | שלילי                             |
| Benchmark               | ציון ייחוס                        |
| Industry average        | ממוצע תעשייתי                     |
| Executive dashboard     | לוח בקרה מנהלים                   |
| Verbatim analysis       | ניתוח תגובות מילוליות             |
| Quality                 | איכות                             |
| Price                   | מחיר                              |
| Delivery                | אספקה                             |
| Service                 | שירות                             |
| Communication           | תקשורת                            |
| Technical               | טכני                              |

---

## 10. Test Coverage Summary

29 / 29 tests passing in `test/customer/nps.test.js`. Categories:

| Category                         | Tests | Notes                                                      |
| -------------------------------- | ----- | ---------------------------------------------------------- |
| Classification                   | 2     | Full 0..10 sweep; bucket catalog bilingual.                |
| Survey definition / versioning   | 5     | Bilingual required, invalid channel / trigger rejected, versioning preserves history. |
| Dispatch                         | 2     | Bilingual 0-10 question, channel gating.                   |
| recordResponse + NPS formula     | 6     | Score range, 6P/2N/2D → 40, all-detractors → −100, all-promoters → +100, empty → 0, re-submit supersedes. |
| Segment NPS                      | 1     | Splits by `segment` field.                                 |
| Trend over time                  | 2     | Monthly buckets, delta + direction; month/quarter/year keys. |
| Closed-loop trigger              | 5     | Auto-open on detractor, no case for promoter, no-dup on re-trigger, outcome append, overdue detection. |
| Verbatim analysis                | 2     | Theme + sentiment across English and Hebrew comments.     |
| Benchmarks                       | 1     | metal-fab + b2b-manufacturing + default fallback.          |
| Executive dashboard              | 1     | Bilingual shape, all sections present.                    |
| Bilingual catalog coverage       | 1     | CHANNELS / TRIGGERS / CASE_STATUS all bilingual.          |
| Period filtering                 | 1     | `{from, to}` excludes out-of-range rows.                  |

Run: `node --test test/customer/nps.test.js`

---

## 11. Operational Runbook

| Question                                   | Answer                                                       |
| ------------------------------------------ | ------------------------------------------------------------ |
| How do I add a new industry benchmark?     | Append a row to `INDUSTRY_BENCHMARKS`. Never remove existing rows. |
| How do I upgrade the question wording?     | Call `createSurvey` again with the same `id` and supply `question_he` / `question_en`. Version bumps; history is preserved. |
| A detractor has two open cases — why?      | Impossible by construction. `closedLoop()` detects an open case for the same `detractorId` and appends a `retrigger` event instead of opening a second case. |
| How do I wire the 48-hour alert?           | Poll `followupTracking(customerId)` or iterate `_cases` and pick `cases[i].overdue === true`. A later agent will wire this into the notification queue. |
| What happens on re-submit?                 | Old response is marked `superseded = true` but kept in history. `listResponses()` hides it by default; pass `{ includeSuperseded: true }` for audit. |
| Can I delete a survey?                     | **No.** The rule is `לא מוחקים רק משדרגים ומגדלים`. Create a new version instead. |

---

**End of AG-Y092 report — never delete.**
