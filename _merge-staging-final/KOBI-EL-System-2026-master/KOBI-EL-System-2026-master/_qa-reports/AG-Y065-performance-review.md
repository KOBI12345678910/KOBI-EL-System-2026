# AG-Y065 — Performance Review Engine / מנוע הערכות ביצועים

**Agent:** Y-065
**Module:** `onyx-procurement/src/hr/performance-review.js`
**Tests:** `onyx-procurement/test/hr/performance-review.test.js` — **23 / 23 passing**
**Date:** 2026-04-11
**Principle:** **לא מוחקים רק משדרגים ומגדלים** — never delete, only upgrade & grow.

---

## 1. Purpose / מטרה

**EN:** A zero-dependency performance-review engine for the Techno-Kol Uzi
mega-ERP HR module. It models the full annual / semi-annual review life cycle
end-to-end: bilingual templates → scheduling → submission with weighted
scoring → forced-distribution calibration → 360° feedback aggregation with
k-anonymity → comp-grade linkage → Personal Development Plan (PDI) export →
Israeli-law-compliant Performance Improvement Plan (PIP) → multi-year history
that is **never** purged → bilingual roll-up reports for HRBPs and leadership.

**HE:** מנוע הערכות ביצועים ללא תלויות חיצוניות עבור מודול משאבי האנוש של
מערכת ה-ERP של טכנו-קול עוזי. כל מחזור החיים של ההערכה השנתית / חצי-שנתית:
תבניות דו-לשוניות → תזמון → הגשה עם ציון משוקלל → כיול לפי התפלגות פעמון →
מצרף משוב 360 מעלות בהגנת אנונימיות → הצמדה לדרגת שכר → תוכנית פיתוח אישית →
תוכנית שיפור ביצועים בהתאם לדרישות חוק העבודה הישראלי → היסטוריה רב-שנתית
שלעולם אינה נמחקת → דוחות אגרגטיביים דו-לשוניים.

---

## 2. Public API

| Method                                       | Hebrew                    | English                                   |
| -------------------------------------------- | ------------------------- | ----------------------------------------- |
| `defineTemplate(spec)`                       | הגדרת תבנית הערכה          | Define a review template                  |
| `scheduleReview(spec)`                       | תזמון הערכה                | Schedule a review                         |
| `submitReview(spec)`                         | הגשת הערכה (append-only)  | Submit a review (append-only)             |
| `calibrate(spec)`                            | כיול לפי התפלגות פעמון     | Calibrate via forced bell curve           |
| `generate360Feedback(spec)`                  | הפקת משוב 360 מעלות       | Generate 360° feedback                    |
| `linkToCompGrade(reviewId, gradeChange)`     | קישור לדרגת שכר            | Link to compensation grade                |
| `exportPDI(employeeId)`                      | ייצוא תוכנית פיתוח אישית   | Export Personal Development Plan          |
| `flagPerformanceIssue(reviewId, sev, act)`   | סימון בעיה / הפעלת PIP    | Flag performance issue / trigger PIP      |
| `triggerPIP(reviewId, opts)`                 | יצירת PIP במפורש          | Explicit PIP creation                     |
| `recordPIPMilestone(pipId, ms)`              | רישום אבן דרך ב-PIP       | Append PIP milestone                      |
| `completePIP(pipId, outcome, details)`       | סיום / הארכה / סיום העסקה | Close PIP (completed/extended/terminated) |
| `history(employeeId)`                        | היסטוריה רב-שנתית          | Multi-year history                        |
| `generateReport(period, filter)`             | דו"ח אגרגטיבי             | Bilingual roll-up report                  |
| `archive(reviewId, reason)`                  | העברה לארכיון              | Soft-archive (status only, never delete)  |

---

## 3. Competency Rubric Examples / דוגמאות לסולמות דירוג

A template defines `competencies: [{id, label_he, label_en, weight, rubric}]`
and a `scale` of either **1–5** or **1–10**. The `rubric` is free-form so HR
can attach the descriptive anchors that make scoring reproducible.

### Example A — מצוינות טכנית / Technical Excellence (scale 1–5)

| Score | Hebrew (HE)                                              | English (EN)                                                |
| ----- | -------------------------------------------------------- | ----------------------------------------------------------- |
| 1     | חלש — נדרש פיקוח צמוד בכל משימה                          | Poor — needs close supervision on every task                |
| 2     | מתחת לציפיות — דורש הכוונה משמעותית                       | Below expectations — needs significant guidance             |
| 3     | עומד בציפיות — עצמאי במשימות סטנדרטיות                    | Meets expectations — independent on standard tasks          |
| 4     | מעל הציפיות — מנטר עמיתים, פותר בעיות מורכבות              | Above expectations — mentors peers, solves complex issues   |
| 5     | מצוין — מומחה מוכר, משפיע על תקנים ארגוניים                | Excellent — recognised expert, shapes org-wide standards    |

### Example B — שיתוף פעולה / Collaboration (scale 1–5)

| Score | Hebrew (HE)                                            | English (EN)                                                |
| ----- | ------------------------------------------------------ | ----------------------------------------------------------- |
| 1     | פוגע בעבודת הצוות                                      | Disrupts team dynamics                                      |
| 2     | עבודה עצמאית בלבד, לא משתף                              | Works in isolation, rarely shares                           |
| 3     | משתף פעולה כשנדרש                                      | Cooperates when asked                                       |
| 4     | יוזם שיתופי פעולה חוצי-צוות                             | Initiates cross-team collaboration                          |
| 5     | בונה גשרים בין מחלקות, נחשב כמובילי תרבות                | Builds bridges across departments, cultural ambassador      |

### Example C — אספקה בזמן / On-time Delivery (scale 1–5)

| Score | Hebrew (HE)               | English (EN)                                  |
| ----- | ------------------------- | --------------------------------------------- |
| 1     | מפספס מועדי יעד באופן קבוע | Misses deadlines consistently                 |
| 2     | מפספס מועדי יעד מדי פעם   | Occasionally misses deadlines                 |
| 3     | עומד במועדי יעד            | Hits deadlines                                |
| 4     | מקדים מועדי יעד            | Beats deadlines                                |
| 5     | מקדים ומעלה את הסטנדרט      | Beats deadlines and raises the standard       |

> The `rubric` field is stored verbatim and round-tripped through
> `defineTemplate`. HR can publish a new version of a template — the
> previous version is preserved under `previousVersion` (Kobi's law).

---

## 4. Scoring Formula / נוסחת חישוב הציון

### 4.1 Per-competency input

Every competency receives an integer (or half-integer) score in `[1, scale]`.
Out-of-range or missing scores throw an error at submission time
(test 07).

### 4.2 Weighted overall

```
overall = Σ (score_i × weight_i) / Σ (weight_i)
```

`overallNormalized = overall / scale` is also stored — this is the value
used by `calibrate()` for cross-cohort sorting and by `history()` for the
trend slope.

### 4.3 Worked examples

| Template      | Weights         | Scores         | Numerator               | Denominator | Overall          |
| ------------- | --------------- | -------------- | ----------------------- | ----------- | ---------------- |
| `tpl-eq`      | 1 / 1 / 1       | 5 / 4 / 3      | 5 + 4 + 3 = 12          | 3           | **4.0** (test 5) |
| `tpl-eng`     | 3 / 2 / 1       | 5 / 3 / 2      | 15 + 6 + 2 = 23         | 6           | **3.8333** (t6)  |
| `tpl-eng`     | 3 / 2 / 1       | 4 / 4 / 4      | 12 + 8 + 4 = 24         | 6           | **4.0** (t21)    |

### 4.4 Append-only history

`submitReview` **never** overwrites a prior submission. It pushes onto
`review.submissions[]` and mirrors the latest values onto the canonical
`scores`, `overall`, `comments`, etc. Old submissions remain inspectable
forever (test 08).

---

## 5. Calibration Rules / כללי כיול

### 5.1 Default forced distribution — bell curve 10/20/40/20/10

| Bucket id        | HE             | EN                    | Target % |
| ---------------- | -------------- | --------------------- | -------- |
| `top`            | מצטיינים        | Top performers        | **10%**  |
| `above`          | מעל הציפיות    | Above expectations    | **20%**  |
| `meets`          | עומד בציפיות   | Meets expectations    | **40%**  |
| `below`          | מתחת לציפיות   | Below expectations    | **20%**  |
| `unsatisfactory` | לא משביע רצון  | Unsatisfactory        | **10%**  |

For a cohort of `n` reviews, expected counts are computed as
`round(n × pct)` and rounding error is absorbed in the `meets` bucket so
the totals always sum to `n`. Test 09 verifies the canonical
`10 → 1 / 2 / 4 / 2 / 1` mapping for `n = 10`.

### 5.2 Custom rules

Callers may pass a custom `rule.buckets` array. Percentages must sum to
**1.0 ± 0.01** or `calibrate()` throws. Bucket `id`, `he`, and `en`
labels are optional but recommended for the bilingual roll-up
(test 10 uses a 20/40/40/0/0 skew).

### 5.3 Re-calibration & adjustments report

If `calibrate()` is invoked again on the same cohort, the engine
records prior assignments in `review.calibrationHistory[]` and returns
an `adjustments` array listing every employee whose bucket changed:
`{ reviewId, employeeId, from, to }`. The status only ever moves
forward (`submitted → calibrated`), never back (test 23).

### 5.4 Eligibility

Eligible reviews are those whose `period` matches and whose
`managerId` (or `reviewerId`, if managerId is absent) matches the
calibrating manager. They must be at status `submitted` or
`calibrated`. Drafts are skipped.

---

## 6. 360° Feedback / משוב 360 מעלות

### 6.1 Reviewer kinds

| Kind          | HE                | EN                |
| ------------- | ----------------- | ----------------- |
| `self`        | הערכה עצמית        | Self assessment   |
| `manager`     | מנהל ישיר          | Line manager      |
| `peer`        | עמית               | Peer              |
| `subordinate` | כפיף ישיר          | Direct report     |
| `skipLevel`   | מנהל-על            | Skip-level        |
| `client`      | לקוח               | Client            |

### 6.2 Anonymity guarantee

When `anonymous: true` (default), every `reviewerId` is replaced with a
**12-character SHA-256 hash** salted with the engine's `anonSalt`. The
salt is randomised at construction time unless the caller pins it. The
returned bundle never embeds the raw id anywhere (test 11 verifies this
via a full JSON-string scan).

### 6.3 k-anonymity (k = 3)

Any non-`self` reviewer group with **fewer than 3 respondents** is
returned as `{ count, redacted: true, reason: 'k-anonymity' }`. Only
the count is exposed — never the scores or comments. The `self` group
is by definition n=1 and is not k-constrained (test 12).

### 6.4 Reviewer count vs. identity

The aggregated bundle returns:

```json
{
  "reviewerCount": 8,
  "countsByKind": { "manager": 1, "peer": 3, "subordinate": 3, "self": 1 },
  "aggregated": {
    "peer": { "count": 3, "scores": { "tech": 4.0, "collab": 4.667 } },
    "manager": { "count": 1, "scores": { ... } }
  },
  "reviewerHashes": [{ "anonId": "ab12cd34ef56", "kind": "peer" }, ...]
}
```

The total count is always exposed (the spec requires it), the
**identity is not** (test 13).

---

## 7. PIP Workflow / תהליך תוכנית שיפור ביצועים

### 7.1 Israeli labor-law context — שימוע הוגן

Israeli case law (פס"ד **מילפלדר**, **נון**, ועוד) and the duty of
**good-faith** in the employment contract require that, before an
employer may consider termination on performance grounds, the
following gates **must** be cleared:

1. **התראה בכתב — Written notice** of the performance gap.
2. **הזדמנות אמיתית להשתפר** — A genuine opportunity to improve, with
   measurable, written **KPIs**.
3. **מנטור / מנהל מלווה** — A coach or mentor assigned to the
   employee.
4. **חלון שיפור סביר** — A reasonable improvement window, normally
   **3 to 6 months** (90–180 days).
5. **שימוע הוגן** — A fair pre-decision hearing with the employee
   present and represented if requested.

### 7.2 Severity → PIP mapping

| Severity   | HE       | requires PIP? | Default PIP days |
| ---------- | -------- | ------------- | ---------------- |
| `minor`    | קלה      | no            | 0                |
| `moderate` | בינונית  | **yes**       | 90               |
| `serious`  | חמורה    | **yes**       | 120              |
| `critical` | קריטית   | **yes**       | 180              |

`flagPerformanceIssue(reviewId, severity, action)` records the flag on
the review and, when severity ≥ moderate, automatically calls
`triggerPIP()`. Tests 16 and 17 cover both branches.

### 7.3 PIP record fields

```js
{
  id: "pip-...",
  reviewId, employeeId,
  severity, severity_he, severity_en,
  writtenNoticeIssued: true,             // statutory gate #1
  writtenNoticeDate:    "...ISO...",
  fairHearingScheduled: true,            // statutory gate #5
  mentorId:    "<defaults to managerId>",// statutory gate #3
  kpis:        [{ kpi, target }, ...],   // statutory gate #2
  durationDays: 90 .. 180,               // statutory gate #4
  startDate, endDate,
  status:      "open" | "extended" | "completed" | "terminated",
  milestones:  [...append-only...],
  outcome:     null | { at, outcome, notes, fairHearingHeld },
  statutoryReferences: [
    { he: 'חובת שימוע הוגן — פס"ד מילפלדר', en: 'Duty of fair hearing — Milfelder ruling' },
    { he: 'חובת תום-לב במשפט העבודה',        en: 'Good-faith duty in Israeli labour law' },
  ],
}
```

### 7.4 Duration clamping (test 19)

`triggerPIP` clamps `durationDays` into `[90, 180]`. Asking for 30 days
becomes 90; asking for 365 becomes 180. This is enforced regardless of
how the PIP was created — direct call or via `flagPerformanceIssue`.

### 7.5 Milestones and outcomes (test 18)

`recordPIPMilestone(pipId, { title, progress, note, author })` appends
to `pip.milestones[]` — never overwrites. `completePIP(pipId, outcome,
details)` accepts:

* `'completed'` — successful, employee retained.
* `'extended'`  — append a `{ extraDays, reason }` entry to
  `pip.extensions[]` and push `endDate` forward.
* `'terminated'` — final outcome. Audited as
  `pipTerminationWithoutHearing` if `details.fairHearingHeld !== true`.

---

## 8. Personal Development Plan (PDI) / תוכנית פיתוח אישית

`exportPDI(employeeId, { period? })` walks the employee's reviews,
selects the most recent submitted (or period-matched) one, then runs
each competency through these thresholds:

| Score band              | Bucket       | Adds to PDI                                            |
| ----------------------- | ------------ | ------------------------------------------------------ |
| `score >= 0.7 × scale`  | strength     | Listed under `strengths[]`                             |
| `score < 0.6 × scale`   | weakness     | `weaknesses[]` + `goals[]` + `training[]` (bilingual)  |
| `0.6 × scale ≤ s < 0.7` | observation  | (neither — recorded only as raw score)                 |

For a `scale=5` template that means **strengths ≥ 3.5** and
**weaknesses < 3.0**. Goal `targetScore` is set to the meets-threshold
and `timelineDays` defaults to **90**. Training recommendations carry
bilingual `recommendation_he` / `recommendation_en` strings and a
`priority: 'high' | 'medium'` derived from how far below threshold the
score is (test 15).

A PDI for an employee with no reviews returns an empty plan (no
throw) — useful for new hires.

---

## 9. Comp-grade Linkage / קישור לדרגת שכר

`linkToCompGrade(reviewId, { fromGrade, toGrade, salaryFrom?, salaryTo?,
reason?, effectiveDate? })` attaches a grade-change record to the
review. If both salary fields are provided, `salaryDelta` is computed
and stored. Calling the method again **does not overwrite** — the
previous link is pushed onto `review.compLinkHistory[]` (Kobi's law,
test 14).

---

## 10. Multi-year History / היסטוריה רב-שנתית

`history(employeeId)` returns:

* `total` — number of reviews on file (drafts + submitted + calibrated
  + archived).
* `byYear` — `{ '2024': [...], '2025': [...], '2026': [...] }`. Year is
  derived from the leading 4 digits of `period` or, if absent, from
  `createdAt`.
* `trend` — slope of `overallNormalized` over time, computed as the
  difference between the last and first score. A positive number means
  the employee is improving (test 20).
* `reviews` — full snapshots of every review record, never purged.

Archived reviews are **always** included (status changes only, never
deletion).

---

## 11. Bilingual Roll-up Report / דו"ח דו-לשוני

`generateReport(period, { departmentId?, managerId? })` produces:

```json
{
  "period": "2026-H1",
  "labels": {
    "he": { "title": "דו\"ח — הערכת ביצועים", "average": "ממוצע", ... },
    "en": { "title": "Report — Performance review", "average": "Average", ... }
  },
  "counts": { "total": 6, "submitted": 6, "calibrated": 0, "flagged": 0, "onPIP": 0 },
  "averageOverall": 3.6667,
  "distribution": { "unassigned": 6 },
  "pipIds": [],
  "flaggedReviewIds": []
}
```

Filters cascade — both `departmentId` and `managerId` are honoured if
supplied (test 21). Every label is provided in both `he` and `en`.

---

## 12. Status Lifecycle (Kobi's Law)

```
draft  →  scheduled  →  submitted  →  calibrated  →  archived
                                                    │
                                                    └── archive() — soft only
```

* Forward-only transitions enforced by `_setStatus`. A backwards move
  throws (test 23).
* `submissions[]`, `calibrationHistory[]`, `compLinkHistory[]`,
  `flags[]`, `milestones[]` — every collection is append-only.
* Templates are **versioned**: redefining an id bumps `version` and
  preserves the prior version under `previousVersion` (test 02).
* Audit log (`engine.audit`) is append-only, capturing every API call
  with timestamp and snapshot.

---

## 13. Hebrew Glossary / מילון עברי

| HE                            | EN                                  | Notes                                                              |
| ----------------------------- | ----------------------------------- | ------------------------------------------------------------------ |
| הערכת ביצועים                  | Performance review                  | The whole engine                                                   |
| תבנית הערכה                   | Review template                     | `defineTemplate` artifact                                          |
| יכולת / יכולות                 | Competency / Competencies           | Scored dimensions inside a template                                |
| משקל                          | Weight                              | Per-competency, used in weighted average                           |
| ציון משוקלל                    | Weighted score                      | `Σ(score×weight)/Σweight`                                          |
| סולם דירוג                    | Rubric                              | Free-form anchors per competency                                   |
| הערכה עצמית                    | Self-assessment                     | Optional `selfAssessment` field on submission                      |
| התפלגות מאולצת / פעמון        | Forced distribution / Bell curve    | 10/20/40/20/10 default                                             |
| מצטיינים / מעל / עומד / מתחת   | Top / Above / Meets / Below         | Bucket labels                                                      |
| לא משביע רצון                  | Unsatisfactory                      | Worst bucket                                                       |
| כיול                          | Calibration                         | `calibrate()` operation                                            |
| מנהל ישיר                     | Line manager                        | `managerId`                                                        |
| מנהל-על                       | Skip-level manager                  | `REVIEWER_KIND.SKIP_LEVEL`                                         |
| משוב 360 מעלות                 | 360° feedback                       | `generate360Feedback`                                              |
| חסוי                          | Redacted                            | k-anon redaction                                                   |
| תוכנית שיפור ביצועים            | Performance Improvement Plan (PIP)  | Statutory pre-termination process                                  |
| התראה בכתב                    | Written notice                       | Statutory gate #1                                                  |
| שימוע הוגן                    | Fair hearing                        | Statutory gate #5 — אסור לפטר ללא שימוע                           |
| מנטור                         | Mentor                              | Statutory gate #3 — defaults to direct manager                     |
| מדד הצלחה / KPI                | KPI                                 | Statutory gate #2 — measurable improvement target                  |
| חלון שיפור                    | Improvement window                  | Statutory gate #4 — 90 to 180 days                                 |
| תוכנית פיתוח אישית              | Personal Development Plan (PDI)     | `exportPDI` artifact                                               |
| יעדים                         | Goals                               | Inside a PDI                                                       |
| הכשרות מומלצות                  | Recommended training                | Inside a PDI                                                       |
| היסטוריה רב-שנתית               | Multi-year history                  | `history(employeeId)`                                              |
| דרגת שכר                      | Compensation grade                  | `linkToCompGrade`                                                  |
| טווח שכר                      | Salary band                         | Salary delta is computed if both ends supplied                     |
| טיוטה / מתוזמן / הוגש / כויל / בארכיון | Draft / Scheduled / Submitted / Calibrated / Archived | Status enum                                                |
| לא מוחקים רק משדרגים ומגדלים   | Never delete, only upgrade & grow   | Kobi's law — enforced everywhere                                   |

---

## 14. Test Matrix / מטריצת בדיקות

Run with: `node --test test/hr/performance-review.test.js`

| #  | Test name                                                                          | Result |
| -- | ---------------------------------------------------------------------------------- | ------ |
| 01 | defineTemplate creates a template with bilingual labels and weights                | ✓ pass |
| 02 | defineTemplate upgrade keeps previousVersion (לא מוחקים)                           | ✓ pass |
| 03 | scheduleReview wires reviewer + due date + status=scheduled                        | ✓ pass |
| 04 | scheduleReview rejects missing fields and unknown template                         | ✓ pass |
| 05 | submitReview computes weighted overall score (equal weights)                       | ✓ pass |
| 06 | submitReview computes weighted overall score (unequal weights)                     | ✓ pass |
| 07 | submitReview rejects out-of-range and missing scores                               | ✓ pass |
| 08 | submitReview is append-only — second submission keeps history                      | ✓ pass |
| 09 | calibrate enforces forced bell-curve distribution                                  | ✓ pass |
| 10 | calibrate adjustments report shows movements between buckets                       | ✓ pass |
| 11 | generate360Feedback hashes reviewer ids by default                                 | ✓ pass |
| 12 | generate360Feedback redacts groups with fewer than 3 respondents                   | ✓ pass |
| 13 | generate360Feedback returns reviewer count without revealing identity              | ✓ pass |
| 14 | linkToCompGrade attaches grade change with salary delta                            | ✓ pass |
| 15 | exportPDI extracts strengths, weaknesses, and training                             | ✓ pass |
| 16 | flagPerformanceIssue with minor severity does NOT trigger PIP                      | ✓ pass |
| 17 | flagPerformanceIssue with moderate severity triggers PIP per Israeli labor law     | ✓ pass |
| 18 | PIP milestones append-only + completePIP outcomes                                  | ✓ pass |
| 19 | PIP duration is clamped to 90..180 days (Israeli case-law)                         | ✓ pass |
| 20 | history returns full multi-year history with trend                                 | ✓ pass |
| 21 | generateReport produces bilingual roll-up with filter                              | ✓ pass |
| 22 | archive cannot run on unsubmitted; archived review is preserved                    | ✓ pass |
| 23 | status transitions are monotonic forward — never roll back                         | ✓ pass |

**Summary:** 23 tests, **23 pass**, 0 fail.

---

## 15. Zero-Dependency Compliance

* `require('node:crypto')` — Node built-in only, used for `randomBytes` and
  SHA-256 hashing.
* No `npm install` needed. `package.json` is unchanged by this module.
* Storage is in-memory (`Map` instances) — exactly per the brief.

## 16. Files

* `onyx-procurement/src/hr/performance-review.js` — engine (≈ 1,000 LOC)
* `onyx-procurement/test/hr/performance-review.test.js` — 23 tests
* `_qa-reports/AG-Y065-performance-review.md` — this report

End of report — Y-065 / 2026-04-11.
