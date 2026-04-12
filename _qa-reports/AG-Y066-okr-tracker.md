# AG-Y066 — OKR / KPI Tracker

**Agent:** Y-066
**Module:** `onyx-procurement/src/hr/okr-tracker.js`
**Tests:** `onyx-procurement/test/hr/okr-tracker.test.js` — 35 / 35 passing
**Date:** 2026-04-11
**Principle:** **לא מוחקים רק משדרגים ומגדלים** — never delete, only upgrade & grow.

---

## 1. Purpose

A zero-dependency OKR (Objectives & Key Results) and KPI tracker for the Techno-Kol Uzi mega-ERP. It models the classic Google/Grove/Doerr OKR methodology adapted to an Israeli organisation, with bilingual (Hebrew/English) labels throughout and a cascading org model (company → department → team → individual).

The tracker handles the full OKR life cycle:
creation → weekly check-ins → progress updates → traffic-light grading → stretch-goal analysis → end-of-period retrospective → archival (never hard-delete).

---

## 2. OKR Methodology

### 2.1 OKR vs. KPI — how this module treats them

- **Objective** — qualitative, inspirational statement ("win Q2").
- **Key Result** — 1 to 5 measurable outcomes per objective that collectively prove the objective was achieved.
- **KPI** — continuous operational metric. In this tracker KPIs are modelled as KRs with long periods (annual) or baseline comparisons.

### 2.2 Cascading alignment

The org hierarchy is strictly ordered:

| Rank | Level        | Hebrew   | English    |
| ---- | ------------ | -------- | ---------- |
| 0    | `company`    | חברה     | Company    |
| 1    | `department` | מחלקה    | Department |
| 2    | `team`       | צוות     | Team       |
| 3    | `individual` | עובד     | Individual |

A child objective must be at a strictly **lower rank** than its parent. The tracker enforces this at creation time.

### 2.3 Weekly ritual

`weeklyCheckIn(objectiveId, status, blockers)` is the lightweight status ritual. Each check-in captures current status (`on_track` / `at_risk` / `achieved` / `missed`), free-form blockers, an author, and a timestamp. Check-ins are append-only.

### 2.4 Retrospective

At period end, `retrospective(periodId)` returns the full dataset required for a structured retro discussion: per-objective final score, grade color, stretch success flag, all blockers mentioned during the period, and a standard set of bilingual prompts (What worked / What didn't / What did we learn / What will we change).

---

## 3. Grading — Google Traffic Light

Progress is always a number in `[0.0, 1.0]`. Grading uses the classic Google thresholds:

| Range             | Color      | Hebrew                   | English                   |
| ----------------- | ---------- | ------------------------ | ------------------------- |
| `[0.00, 0.30)`    | **red**    | אדום — לא עומד ביעד       | Red — missed              |
| `[0.30, 0.70)`    | **yellow** | צהוב — בהתקדמות          | Yellow — progressing      |
| `[0.70, 1.00]`    | **green**  | ירוק — בכיוון             | Green — on track          |

### 3.1 Stretch interpretation

- **0.70 is a success for a stretch goal** — the Google OKR philosophy is that if you hit every KR at 1.00 your targets were too conservative.
- `stretchGoals(objectiveId)` returns `stretchMet = score >= 0.70` and `tooEasy = score >= 1.00` so leadership can distinguish *"shipped the stretch"* from *"set the bar too low"*.

---

## 4. Cascade Rules

`cascadeCheck(parentObjectiveId)` walks direct children and classifies each one:

| Reason         | Meaning                                                  |
| -------------- | -------------------------------------------------------- |
| *(aligned)*    | Child is at a strictly lower level AND same period.      |
| `wrong_level`  | Child is at an equal or higher level than its parent.    |
| `wrong_period` | Child's period string (e.g. `2026-Q1`) doesn't match.    |
| `orphan`       | Child references a parent id that no longer exists.     |

A leaf objective (no children) is considered trivially aligned.

`alignment(employeeId)` returns the full up-chain for every objective owned by that employee, plus a `fullyAligned` flag that is true only when every chain terminates at a `company`-level objective.

---

## 5. KR Progress Math

```
numeric / percent / currency:
    progress = (current - start) / (target - start)   clamped to [0, 1]

boolean:
    progress = (current === target) ? 1.0 : 0.0
```

This formula **handles inverse goals** (e.g. *"reduce defects 10 → 2"*) correctly: with `start=10, target=2, current=6`, progress is `(6-10)/(2-10) = 0.5`. Tests 14-19 cover all type branches plus clamping.

Objective score is the **weight-adjusted mean** of its KR progresses. Default KR weight is 1; callers may pass `weight` to addKeyResult to rebalance.

---

## 6. Upgrade-Only Principle

Per the core ERP rule **"לא מוחקים רק משדרגים ומגדלים"**, the tracker has no `delete` method at all. Instead:

- `archive(objectiveId, reason)` — sets `status = 'archived'` and records a timestamp + reason. Archived objectives remain in storage forever for audit, retro, and historical grading.
- `listObjectives()` — hides archived records by default. Pass `{ includeArchived: true }` to see them.
- `updateKR` — always appends to the KR's `history` array. The entire change history is retained.
- Weekly check-ins — append-only per objective.

Test 35 verifies that archival is a soft-delete and records are still retrievable.

---

## 7. API Surface

```js
const { OKRTracker, LEVELS, KR_TYPES, STATUS, GRADE_COLORS } = require('./src/hr/okr-tracker.js');

const okr = new OKRTracker();

const co = okr.createObjective({
  id: 'obj_2026q2_growth',
  title_he: 'לצמוח בשוק הבנייה בישראל',
  title_en: 'Grow in the Israeli construction market',
  owner: 'emp_ceo',
  level: LEVELS.COMPANY,
  period: '2026-Q2',
});

okr.addKeyResult({
  objectiveId: co.id,
  title_he: 'הכנסות רבעוניות',
  title_en: 'Quarterly revenue',
  metric: 'ILS',
  type: KR_TYPES.CURRENCY,
  start: 8_000_000,
  target: 12_000_000,
});

okr.updateKR({ krId: '<kr-id>', value: 9_500_000, note: 'week 3', author: 'emp_cfo' });

okr.krProgress('<kr-id>');           // 0.375
okr.objectiveScore(co.id);           // weighted mean
okr.cascadeCheck(co.id);             // child alignment report
okr.alignment('emp_dev');            // up-chain for employee
okr.grading('2026-Q2');              // traffic-light report
okr.stretchGoals(co.id);             // 70% = good, 100% = too easy
okr.dashboardData('department');     // per-level aggregation
okr.weeklyCheckIn(co.id, 'on_track', ['גיוס איטי'], 'Still within plan');
okr.retrospective('2026-Q2');        // end-of-period dataset
okr.archive(co.id, 'superseded by 2026-Q3 objective');
```

---

## 8. Hebrew Glossary

| Hebrew               | Transliteration     | English               |
| -------------------- | ------------------- | --------------------- |
| יעד                  | ya'ad               | Objective             |
| תוצאה מרכזית         | to'tza'a merkazit   | Key Result            |
| התקדמות              | hitkadmut           | Progress              |
| בעלים                | ba'alim             | Owner                 |
| יעד-אב               | ya'ad av            | Parent objective      |
| התיישרות             | hityashrut          | Alignment             |
| מפל                  | mappal              | Cascade               |
| יעד מתיחה            | ya'ad metikha       | Stretch goal          |
| צ'ק-אין שבועי        | check-in shvu'i     | Weekly check-in       |
| חסם                  | khasam              | Blocker               |
| רטרוספקטיבה          | retrospektiva       | Retrospective         |
| ארכיון               | arkhiyon            | Archive               |
| חברה                 | khevra              | Company               |
| מחלקה                | makhlaka            | Department            |
| צוות                 | tzevet              | Team                  |
| עובד                 | oved                | Individual / Employee |
| בכיוון               | ba'kivun            | On track              |
| בסיכון               | besikun             | At risk               |
| הושג                 | hus'ag              | Achieved              |
| לא הושג              | lo hus'ag           | Missed                |
| טיוטה                | tyuta               | Draft                 |
| פעיל                 | pa'il               | Active                |

---

## 9. Test Coverage

`node --test onyx-procurement/test/hr/okr-tracker.test.js` — **35 / 35 passing** (pure `node:test`, zero dev dependencies).

| # | Theme            | Tests |
| - | ---------------- | ----- |
| A | Grade thresholds | 01-06 |
| B | createObjective  | 07-10 |
| C | addKeyResult     | 11-13 |
| D | krProgress math  | 14-19 |
| E | updateKR history | 20    |
| F | objectiveScore   | 21-23 |
| G | cascadeCheck     | 24-26 |
| H | alignment        | 27-28 |
| I | grading          | 29    |
| J | stretchGoals     | 30-31 |
| K | dashboardData    | 32    |
| L | weeklyCheckIn    | 33    |
| M | retrospective    | 34    |
| N | archive          | 35    |

All tests use the built-in `node:test` runner and `node:assert/strict`. Zero external dependencies.

---

## 10. Privacy & Transparency

OKRs by design are transparent — any employee can see any other's OKRs. The tracker therefore stores no sensitive PII on objectives, only `owner` employee ids. Link resolution to names / avatars / emails is the responsibility of the UI layer using the existing HR directory.

Check-ins and history logs record the `author` of each entry so audit trails remain intact without embedding full user profiles.

---

## 11. Never Delete

This document is **permanent**. Per ERP rule: future agents may *add* sections or *upgrade* the module, but this report and the module itself must never be removed. Deprecations — if any — go through the `archive` soft-delete path, never through file deletion.

---

*Generated by Agent Y-066 — 2026-04-11 — Techno-Kol Uzi mega-ERP*
