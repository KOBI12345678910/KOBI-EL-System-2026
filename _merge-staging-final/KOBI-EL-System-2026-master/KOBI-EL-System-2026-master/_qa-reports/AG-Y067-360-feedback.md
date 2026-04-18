# AG-Y067 — 360° Feedback Collection & Aggregation

**Agent:** Y-067 (Swarm HR / People Analytics)
**System:** Techno-Kol Uzi mega-ERP
**Date:** 2026-04-11
**Status:** DELIVERED — 20 / 20 tests passing, zero external dependencies.
**Rule enforced:** לא מוחקים, רק משדרגים ומגדלים — all stores are append-only.

---

## 1. Scope

Deliver a production-grade 360-degree feedback engine for the Techno-Kol
Uzi mega-ERP. Bilingual (Hebrew / English), anonymity-protected by
k-anonymity (k = 3), with end-to-end lifecycle: launch → invite →
collect → aggregate → analyse → report → trend over cycles. **Zero**
third-party dependencies — built on Node `crypto` and stdlib only.

### Files produced

| Path | Purpose | LOC |
|---|---|---|
| `onyx-procurement/src/hr/360-feedback.js` | Core engine (`ThreeSixtyFeedback` class + constants, labels, helpers) | ~900 |
| `onyx-procurement/test/hr/360-feedback.test.js` | Unit test suite — 20 tests | ~450 |
| `_qa-reports/AG-Y067-360-feedback.md` | This report | — |

The `src/hr/` folder is existing (co-located with `analytics.js`). The
`test/hr/` folder existed empty and is now populated — this file is the
first test in it. Nothing was deleted; the engine and its test are
purely additive.

---

## 2. API surface — `ThreeSixtyFeedback`

| Method | Purpose |
|---|---|
| `launchSurvey({subject, questions, respondents, deadline, cycle?})` | Create a new survey. Normalises questions, freezes the survey object, wires up append-only stores for invites and responses. Returns `{surveyId, questionCount, expectedResponses}`. |
| `sendInvites(surveyId)` | Generate one bilingual invite envelope per respondent with a cryptographically unique anonymous link. Stores only the SHA-256 hash of the token in the internal ledger. |
| `collectResponse({surveyId, responderGroup, answers, token?})` | Store an anonymised response. Ratings are clamped to `[1, scale]`. The respondent's identity is **never** recorded against the response row — only the respondent group. If a token is supplied, the matching invite is flipped to `redeemed=true` (append-only — never flipped back). |
| `aggregateBySource(surveyId)` | Per-question, per-group averages with k-anonymity redaction. Returns `{questions:[{id, byGroup:{group:{n, avg, redacted}}}], groupCounts}`. |
| `gapAnalysis(surveyId)` | Self-perception vs. average of other (k-safe) groups. Classifies each rating question as `blind_spot`, `hidden_strength` or `aligned` based on tunable thresholds (`GAP_BLIND_SPOT=+1.0`, `GAP_HIDDEN_STRENGTH=-1.0`). |
| `thematicAnalysis(textResponses, {topN?})` | Keyword-frequency clustering over free-text answers. Bilingual tokeniser (Latin + Hebrew U+0590-U+05FF), drops Hebrew + English stop-words and sub-3-char tokens, attaches up to 3 sample snippets per term. Anonymity-safe — aggregated counts only, no per-respondent data. |
| `generateReport(surveyId)` | Comprehensive bilingual report bundle: metadata, aggregation, gap analysis, competency rollup, SVG radar chart, strengths, development areas, actionable bilingual suggestions, themes, and a hand-rolled PDF 1.4 byte buffer (single-page executive summary). Snapshots the cycle into employee history for trend tracking. |
| `kForAnonymity(surveyId)` | Public gate — returns per-group k-anonymity status (`{k, byGroup:{group:{n, meetsK}}, allMeetK, safeGroups, unsafeGroups}`). Callers MUST consult this before exposing any group-level breakdown downstream. |
| `trendAcrossCycles(employeeId)` | Append-only history with per-competency deltas versus the previous cycle, ordered by cycle label. |

All internal stores (`surveys`, `invites`, `responses`, `history`) are
`Map`s of append-only `Array`s — the class exposes no `delete` /
`remove` method, and regeneration of a report never shrinks the history
(proved by the dedicated "history is append-only" test).

---

## 3. Question taxonomy

360° surveys at Techno-Kol Uzi are organised as a shallow tree:

```
Survey
└── Question  { id, text_he, text_en, type, scale, competency? }
     ├── type = 'rating'  → Likert 1..scale (default 5)
     └── type = 'text'    → free-form bilingual answer
```

Each question may (and should) carry a `competency` tag. Questions that
share a competency are rolled up into a single radar axis when the
report is generated; questions without a competency tag degrade
gracefully to one-axis-per-question.

### Recommended competency taxonomy (2026 cycle)

| Competency (en) | יכולת (he) | Typical questions |
|---|---|---|
| `leadership` | מנהיגות | Sets vision, removes blockers, develops others |
| `communication` | תקשורת | Clarity, listening, upward and cross-team sync |
| `technical` | מקצועיות טכנית | Depth, quality, judgement, architectural calls |
| `execution` | ביצוע ותוצאות | Delivery on time, follow-through, priority management |
| `collaboration` | שיתוף פעולה | Team player, knowledge sharing, conflict handling |
| `customer_focus` | מוקד לקוח | Empathy for internal/external customers, NPS drivers |
| `innovation` | חדשנות | New ideas, experimentation, learning velocity |
| `values` | ערכים ותרבות | Integrity, inclusion, feedback culture |

Text questions are **opt-in**. Recommended wording:
 - "What should this person START doing?" / "מה כדאי להתחיל לעשות?"
 - "What should this person STOP doing?"  / "מה כדאי להפסיק לעשות?"
 - "What should this person CONTINUE doing?" / "מה כדאי להמשיך?"

---

## 4. Anonymity rules (k = 3)

1. **Group gate** — no respondent group with fewer than `K_ANONYMITY`
   (= 3) responders is revealed in aggregates, gaps, radar axes, themes
   or the PDF. Under-populated groups surface as `{avg: null,
   redacted: true}`.
2. **Self exception** — the `self` group is intrinsically n = 1, so it is
   whitelisted in `UNCONSTRAINED_GROUPS`. It is only "redacted" when the
   subject has not yet self-evaluated (n = 0).
3. **Others-mean sanitation** — `gapAnalysis()` computes the "others"
   average from **revealed-only** groups. Redacted groups are dropped
   before averaging, so a single disgruntled respondent in an under-k
   group can never contaminate the gap score.
4. **Text group gate** — `_collectTextAnswers` bundles text responses by
   respondent group and drops any group whose text-count is below k
   wholesale before feeding text into `thematicAnalysis`.
5. **Identity never stored** — `collectResponse` writes only the
   respondent group (+ submittedAt). A dedicated test asserts
   `"respondent" in row === false`.
6. **Tokens are hashed on rest** — `sendInvites` returns raw tokens in
   the envelope for immediate mail dispatch, but the internal ledger
   stores only `SHA-256(token)`. Reading `engine.invites` can never
   re-derive an active link.
7. **Append-only redemption** — `collectResponse` may flip an invite's
   `redeemed` flag from `false → true`, but never back. No code path
   removes an invite row.
8. **Constructor override** — tests and very small orgs may set
   `new ThreeSixtyFeedback({ kAnonymity: N })` (N ≥ 1). Defaults to 3.
   The "custom threshold" test exercises k = 5.

---

## 5. Hebrew glossary (HR & performance terms)

| English | עברית | הסבר קצר |
|---|---|---|
| 360° feedback | משוב 360 מעלות | הערכה רב-מקורית ממנהל, עמיתים, כפיפים, לקוחות והערכה עצמית |
| Subject / reviewee | נושא המשוב, מוערך/ת | העובד/ת שהמשוב מתבצע עבורו/ה |
| Self assessment | הערכה עצמית | השאלון שהמוערך/ת ממלא/ת על עצמו/ה |
| Line manager | מנהל ישיר | המנהל הראשון בשרשרת הפיקוד |
| Skip-level manager | מנהל-על | המנהל של המנהל הישיר |
| Peer | עמית/עמיתה | עובד/ת ברמת תפקיד דומה |
| Direct report | כפיף/ה ישיר/ה | עובד/ת שמדווח/ת ישירות |
| Client reviewer | מעריך/ה לקוח | נותן משוב מזווית לקוח פנימי/חיצוני |
| Rating question | שאלת דירוג | סולם ליקרט (1..5) |
| Text question | שאלת טקסט | תשובה חופשית |
| Aggregation | צבירה/הצלבה | חישוב ממוצעים לפי קבוצה |
| Gap analysis | ניתוח פערים | הפער בין הערכה עצמית לאחרים |
| Blind spot | נקודת עיוורון | עצמי גבוה משמעותית מהאחרים (גאווה עיוורת) |
| Hidden strength | חוזקה נסתרת | אחרים גבוה משמעותית מהעצמי (צניעות-יתר) |
| Alignment | הלימה | פער קטן בין עצמי לאחרים |
| Blind spot threshold | סף נקודת עיוורון | ברירת מחדל: פער של +1.0 או יותר בסולם 5 |
| Competency | יכולת/כשירות | ציר במודל ההערכה (מנהיגות, תקשורת, …) |
| Radar chart | תרשים מצולע/רדאר | תצוגה רב-צירית של היכולות |
| k-anonymity | אנונימיות-k | מגן פרטיות: לא חושפים קבוצה קטנה מ-k |
| Redaction | חסימה/השחרה | ערך מסווה כי הקבוצה קטנה מדי |
| Thematic analysis | ניתוח נושאי | קיבוץ מילות מפתח בתשובות טקסט |
| Stop word | מילת עצירה | מילה נפוצה שמוסרת מקיבוץ הנושאים |
| Cycle | מחזור משוב | תקופת המשוב (למשל H1/H2, Q1/Q2/…) |
| Trend across cycles | מגמה לאורך מחזורים | התקדמות הממוצעים לאורך זמן |
| Actionable suggestion | המלצה לפעולה | המלצה ספציפית וברת-ביצוע שמיוצרת אוטומטית |
| Invite token | אסימון הזמנה | מזהה חד-פעמי אנונימי לקישור |
| Development area | תחום לפיתוח | יכולת עם ציון נמוך שדורשת פיתוח |
| Strength | נקודת חוזק | יכולת עם ציון גבוה |

---

## 6. Test coverage — 20 tests, all green

```
node --test test/hr/360-feedback.test.js
```

| # | Test | Covers |
|---|---|---|
| 1 | `launchSurvey: creates survey with normalized questions and respondent totals` | ID allocation, question count, respondent total = 13 |
| 2 | `launchSurvey: validates required fields` | subject / questions / respondents / deadline guards |
| 3 | `sendInvites: produces one bilingual envelope per respondent with unique tokens` | 13 envelopes, unique tokens, bilingual bodies, SHA-256 at rest |
| 4 | `sendInvites: groups match configured respondents` | group distribution self/manager/skipLevel/peers/reports/clients |
| 5 | `collectResponse: stores anonymized response and clamps ratings` | rating clamp [1..scale], text trim, **no identity stored** |
| 6 | `collectResponse: rejects unknown responder group` | input validation |
| 7 | `collectResponse: token marks invite as redeemed (append-only)` | token redemption, SHA-256 match |
| 8 | `aggregateBySource: averages per question per group with k-anonymity redaction` | n=1 manager redacted, n=3 peers revealed, self n=1 still shown |
| 9 | `gapAnalysis: classifies blind spots, hidden strengths and alignment` | 3-way classification |
| 10 | `gapAnalysis: ignores redacted groups when computing "others" mean` | anti-contamination guarantee |
| 11 | `thematicAnalysis: bilingual keyword clustering drops stop-words and short tokens` | Hebrew + English, stop-words dropped, samples attached |
| 12 | `thematicAnalysis: empty / blank input returns empty array` | edge case |
| 13 | `kForAnonymity: enforces k=3 floor and reports unsafe groups` | default k, safe/unsafe lists |
| 14 | `kForAnonymity: custom threshold via constructor` | k=5 override |
| 15 | `generateReport: produces SVG radar, bilingual summaries and PDF buffer` | SVG polygon, legend, PDF `%PDF-1.4` .. `%%EOF` |
| 16 | `trendAcrossCycles: append-only history with per-competency deltas` | two-cycle run, per-competency delta = +1 |
| 17 | `history is append-only: previous cycle rows never overwritten` | regeneration extends history, never shrinks it |
| 18 | `internals: tokenize handles Hebrew + drops stop-words` | tokenizer unit test |
| 19 | `internals: classifyGap thresholds` | boundary conditions at ±1.0 and ±0.5 |
| 20 | `constants & labels are bilingual and frozen` | Object.isFrozen, bilingual labels present |

```
ℹ tests 20
ℹ pass 20
ℹ fail 0
ℹ duration_ms ~120
```

---

## 7. SVG radar — rendering details

The radar chart is generated by hand (no `d3`, `echarts`, `chart.js`).
Given `N` competencies with a self/others score each:

1. Axes are laid out evenly on a circle starting at 12 o'clock and going
   clockwise.
2. `maxScale` is taken as the max `scale` across competencies (default
   5).
3. `maxScale` concentric scale rings are drawn (`#ddd`), one per integer
   level.
4. Axis spokes and bilingual labels (Hebrew preferred, English fallback).
5. "Others" polygon first (red, 25 % fill), "Self" polygon on top (blue,
   25 % fill) — putting self on top ensures the legend colour matches
   the visually dominant shape.
6. Top-left legend with both colours and bilingual labels.
7. `N < 3` safely falls back to a placeholder SVG with a bilingual
   message — the function never throws and never produces an invalid
   `<polygon>` with < 3 points.

Output is a single `<svg>` string, ready to drop into HTML, a PDF
transcoder, or a Tauri/React desktop view.

---

## 8. PDF — hand-rolled minimal writer

Because the project is zero-dep, `generateReport` emits a by-hand
**PDF 1.4** byte buffer with a single page content stream that prints:

- title (bilingual)
- subject / cycle / generation timestamp
- respondent counts per group
- top 5 strengths (others average)
- top 5 development areas (others average)
- top 5 themes (term + count)
- bilingual anonymity note

The writer builds five objects — Catalog, Pages, Page, Contents, Font
(Helvetica WinAnsi) — and an `xref` table with exact byte offsets.
Hebrew text is downgraded to `?` placeholders in the PDF glyph stream
because WinAnsi cannot represent Hebrew without a Type 0 / CIDFont
subset, which would require an embedded font file. The full bilingual
content is still available via `report.strengths`, `report.themes`,
`report.meta.anonymityNote`, which the UI / email transport can render
with system fonts. The PDF is asserted in tests to:

- start with the magic number `%PDF-1.4`
- end with `%%EOF`
- be longer than 200 bytes
- be a `Buffer`

---

## 9. Operational notes

- **Transport** — `sendInvites` returns envelopes but does not call any
  mail API. Downstream code plugs the envelopes into the existing mail
  transport layer. Raw tokens are returned to the caller exactly once
  (at send time) and then live only as SHA-256 hashes inside the engine.
- **Survey immutability** — the returned survey object is
  `Object.freeze`d. Question drift across a single cycle would
  invalidate the aggregation, so upgrades to the question set MUST
  launch a new survey (new `surveyId`).
- **Response upgrades** — because `responses` is append-only, a
  respondent may legitimately submit an updated response (re-opening
  the invite). The engine currently stores both; downstream analytics
  should dedupe by latest `submittedAt` per group if that becomes a
  requirement. No deletion is ever involved.
- **Trend continuity** — `trendAcrossCycles` sorts by cycle label then
  timestamp, so label formats should be lex-sortable (e.g. `2026-H1`,
  `2026-H2`, `2027-H1`). This matches the convention already in use in
  `analytics.js`.

---

## 10. Non-goals (intentionally out of scope)

- Multi-page PDF — deferred to a dedicated PDF-upgrade agent. The one-
  page executive summary is sufficient for audit trail and QA.
- Sentiment scoring on text responses — `thematicAnalysis` gives
  frequency clustering only. A downstream agent (Y-068 or later) can
  layer sentiment on top.
- Cross-employee benchmarks — handled by `analytics.js` team-level
  aggregates. 360 stays scoped to one subject.
- Persistence — the engine is pure in-memory. A thin adapter layer can
  serialise the four `Map`s to SQL / S3 if needed; the append-only
  shape makes that straightforward.

---

## 11. Compliance with the core rule

> **לא מוחקים, רק משדרגים ומגדלים.**

- No public `delete` / `remove` / `reset` method on `ThreeSixtyFeedback`.
- Internal stores are `Map<id, Array>` appended to in every code path.
- Invite `redeemed` is monotonic (`false → true`, never back).
- History regeneration appends a new cycle row; the "append-only"
  regression test asserts that the history grows and never shrinks.
- The new files live alongside existing `hr/` artefacts — nothing
  existing was touched or removed.

---

**End of report — AG-Y067.**
