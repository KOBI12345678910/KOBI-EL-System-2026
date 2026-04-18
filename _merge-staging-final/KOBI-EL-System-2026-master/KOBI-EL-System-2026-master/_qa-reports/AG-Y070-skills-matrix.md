# AG-Y070 — Skills Matrix / Competency Tracker

**Agent:** Y-070 — Swarm HR
**System:** Techno-Kol Uzi Mega-ERP (Israeli metal fabrication) — Wave 2026
**Module:** `onyx-procurement/src/hr/skills-matrix.js`
**Test:** `onyx-procurement/test/hr/skills-matrix.test.js`
**Date:** 2026-04-11
**Rule:** לא מוחקים רק משדרגים ומגדלים — never delete, only upgrade & grow.
**Dependencies:** ZERO. Pure Node built-ins only.

---

## 1. Purpose — מטרת המערכת

The **Skills Matrix** (Hebrew: **מטריצת כישורים**) is the competency
backbone of Techno-Kol Uzi's HR and workforce-planning stack. It
captures every skill every employee has, at what level, by which
assessor, when — and uses that data to drive nine downstream decisions:

1. Define a new competency — `defineSkill()`
2. Record an assessment — `assessEmployee()`
3. Measure gap vs. role requirement — `skillGap()`
4. Plot team capability distribution — `teamCapability()`
5. Detect single-point-of-failure skills — `singlePoint()`
6. Score succession candidates — `successionPlanning()`
7. Recommend training for an employee — `trainingRecommendation()`
8. Generate cross-training rotation plan — `crossTrainingPlan()`
9. Render heatmap (employees × skills) — `visualizeMatrix()`
10. Forecast future skill demand — `skillDemandForecast()`

The module is **append-only**. Every assessment stays on the record
forever; a new assessment supersedes the previous one for the
"current level" calculation but never erases history. Skills are
*deactivated*, never deleted. This mirrors the plant rule:
> **לא מוחקים — רק משדרגים ומגדלים**
> (We don't delete — only upgrade and grow.)

---

## 2. Level Scale — סולם רמות (Dreyfus-based)

The Skills Matrix uses a 0–5 scale aligned with the Dreyfus Model of
skill acquisition and with the Israeli Ministry of Economy's
**מסלול הכשרת עובדי ייצור** (production-worker training program).

| # | Hebrew         | English        | What it means                                                              |
|---|----------------|----------------|----------------------------------------------------------------------------|
| 0 | לא מוכר        | None           | לא נחשף למיומנות — Never exposed to the skill                               |
| 1 | מכיר           | Aware          | קרא מדריך, צפה בהדגמה — Read a manual, watched a demo                       |
| 2 | מתלמד          | Apprentice     | מבצע תחת פיקוח — Performs under supervision                                 |
| 3 | עצמאי          | Practitioner   | עובד עצמאית על עבודות שגרתיות — Independent on routine jobs                 |
| 4 | מומחה          | Expert         | מטפל בחריגים, סוקר עבודת אחרים — Handles exceptions, reviews others         |
| 5 | מורה מומחה     | Master/Teacher | מכשיר אחרים, כותב נהלים — Trains others, writes SOPs                        |

**Default redundancy target:** every skill used in production must
have at least **two employees at level ≥ 3** (Practitioner). Anything
less triggers a single-point-of-failure (SPOF) warning.

---

## 3. Single-Point-of-Failure (SPOF) Rule

A skill is flagged as a **single-point-of-failure** (`isSPOF: true`)
when the number of active employees at `level ≥ threshold` is **≤ 1**.
The default threshold is **3** (Practitioner), configurable per call.

### Severity tiers

| Qualified count | Severity  | Meaning (Hebrew)                             |
|-----------------|-----------|----------------------------------------------|
| 0               | critical  | אין איש במפעל — nobody qualified, bus factor 0 |
| 1               | high      | נקודת כשל יחידה — true SPOF                   |
| 2               | medium    | כיסוי דק — thin, one illness breaks it        |
| 3+              | ok        | רמת כיסוי תקינה                               |

When `singlePoint()` is called without a `skillId`, it scans every
active skill and returns an array sorted worst-first. Used as a
dashboard widget on the plant-manager's screen.

### Example from seed data

The test suite builds a realistic SHOP-A team:

- `SKL-LASER-CNC` → only **E-002** at level 5 → severity **high** (SPOF)
- `SKL-GDT` in SHOP-A → **nobody** → severity **critical**
- `SKL-MIG` → two+ qualified → severity **ok**

---

## 4. Metal-Fab Skill Catalog — קטלוג כישורים

The constructor seeds **9 core Techno-Kol Uzi metal-fabrication skills**
on day zero. Additional skills are added via `defineSkill()` — the seed
list is not the limit, it's the starting point.

| Skill ID            | Category      | Hebrew                     | English                  | Scope                                                                                       |
|---------------------|---------------|----------------------------|--------------------------|---------------------------------------------------------------------------------------------|
| `SKL-LASER-CNC`     | technical     | חיתוך לייזר CNC             | Laser cutting (CNC)      | Fiber / CO2 laser up to 25 mm; programming, G-code, nesting                                 |
| `SKL-PLASMA`        | technical     | חיתוך פלזמה                 | Plasma cutting           | Hand-held + CNC plasma on carbon steel, stainless, aluminum                                 |
| `SKL-PRESS-BRAKE`   | technical     | מכופף (פרס-ברייק)           | Press brake              | CNC setup, bottom/air/coin bending, bend-allowance calc                                     |
| `SKL-MIG`           | technical     | ריתוך MIG                   | MIG welding              | GMAW on carbon steel & stainless, all positions (1F–4F, 1G–4G)                              |
| `SKL-TIG`           | technical     | ריתוך TIG                   | TIG welding              | GTAW on stainless, aluminum, titanium, orbital                                              |
| `SKL-BLUEPRINT`     | technical     | קריאת שרטוטים                | Blueprint reading        | ISO/ASME drawing conventions, views, sections, title block                                  |
| `SKL-GDT`           | technical     | ניהול אי-ודאות (GD&T)       | GD&T                     | ASME Y14.5 geometric dimensioning & tolerancing, datums, MMC/LMC                            |
| `SKL-ISO-9001`      | certification | תקן ISO 9001                | ISO 9001                 | ISO 9001:2015 quality management, internal auditor qualification (תקן ישראלי ת"י 9001)       |
| `SKL-TECH-HEB`      | soft          | עברית טכנית ישראלית          | Israeli technical Hebrew | Shop-floor vocab, NIOSH/OSHA equivalents in Hebrew, Israeli spec reading                    |

### Four categories

| Category        | Hebrew              | Weight in training hours |
|-----------------|---------------------|--------------------------|
| `technical`     | טכני / מקצועי        | 40 h per level gap        |
| `management`    | ניהולי               | 30 h per level gap        |
| `soft`          | רך / בינאישי          | 20 h per level gap        |
| `certification` | תעודה / רישיון        | 80 h per level gap        |

---

## 5. Assessment Method Weights

When multiple assessors disagree on an employee's level, the Skills
Matrix picks the record with the highest **trust weight**. All records
are kept for audit — only the *authoritative current level* changes.

| Method    | Hebrew              | Weight | Rationale                         |
|-----------|---------------------|--------|-----------------------------------|
| `self`    | הערכה עצמית          | 0.5    | Optimistic, self-assessed         |
| `peer`    | הערכת עמית            | 0.8    | Peer observation                  |
| `manager` | הערכת מנהל            | 1.0    | Direct supervisor — the baseline  |
| `test`    | מבחן מיומנות          | 1.2    | Objective test, beats opinion     |
| `cert`    | תעודה חיצונית          | 1.5    | External certification, strongest |

Certifications (`method: 'cert'`) can carry an `expiresAt` date; once
expired they are silently excluded from current-level calculation, but
the audit trail still holds them forever. Manager re-assessments take
over seamlessly — no data loss.

---

## 6. Public API

### `new SkillsMatrix(opts?)`

| Option          | Type               | Default              | Notes                                      |
|-----------------|--------------------|----------------------|--------------------------------------------|
| `seedSkills`    | iterable           | `METAL_FAB_SKILLS`   | Pass `[]` to start empty.                  |
| `seedMetalFab`  | boolean            | `true`               | Shorthand to skip the default catalog.     |
| `teams`         | Map or object      | `{}`                 | `{ teamId: [employeeIds] }`                |
| `clock`         | `() => Date`       | `new Date()`         | Deterministic tests.                       |
| `spofThreshold` | integer 0–5        | `3`                  | Default threshold for `singlePoint()`.     |

### Core methods

| Method | Signature | Returns |
|--------|-----------|---------|
| `defineSkill` | `{id, name_he, name_en, category, description?}` | stored record |
| `assessEmployee` | `{employeeId, skillId, level, method, date?, note?, assessorId?, expiresAt?}` | assessment record |
| `currentLevel` | `(employeeId, skillId)` | `{level, method, date, weight, ...}` or `null` |
| `history` | `(employeeId, skillId)` | sorted array of all past assessments |
| `skillGap` | `{roleRequirements, employeeActual}` | `{rows, totalGap, fitScore, unmetCritical}` |
| `teamCapability` | `(teamId, skillId)` | histogram + atOrAbove + avg/max/members |
| `singlePoint` | `{skillId?, threshold?, teamId?}` | single report or array of reports |
| `successionPlanning` | `{position, candidates}` | ranked candidate readiness |
| `trainingRecommendation` | `{employeeId, targetRole}` | ordered plan + total hours |
| `crossTrainingPlan` | `(teamId, {threshold?})` | mentor/apprentice rotations |
| `visualizeMatrix` | `(scope?)` | `{rows, cols, matrix, legend}` heatmap data |
| `skillDemandForecast` | `{openPositions, attritionRisk, threshold?}` | forecast sorted by netDemand |

### Readiness classification (successionPlanning)

| Score              | Label            | Meaning                      |
|--------------------|------------------|------------------------------|
| ≥ 0.95 + 0 critical| `ready_now`      | Can move into role today      |
| 0.80 – 0.94        | `ready_6_months` | With short training           |
| 0.60 – 0.79        | `ready_1_year`   | Needs structured development  |
| 0.40 – 0.59        | `ready_2_plus_yr`| Long-term development         |
| < 0.40             | `not_candidate`  | Wrong role for this person    |

### Demand forecast priority

| Net demand        | Priority  |
|-------------------|-----------|
| ≥ 3.0             | critical  |
| 1.5 – 2.99        | high      |
| 0.5 – 1.49        | medium    |
| < 0.5             | low       |

`netDemand` = `demandFromHiring` + `expectedLossFromAttrition`, where
attrition loss = `Σ (risk × 1)` over every at-risk employee currently
qualified at ≥ threshold on that skill.

---

## 7. Test Coverage — `test/hr/skills-matrix.test.js`

27 tests, **all green**, zero deps (`node --test`, `node:assert/strict`):

| # | Test                                               | Covers                             |
|---|----------------------------------------------------|------------------------------------|
| 01| Constructor seeds metal-fab catalog                | Default seeding                    |
| 02| defineSkill validates category                     | Input validation                   |
| 03| defineSkill stores bilingual names                 | Hebrew/English                     |
| 04| defineSkill upgrades, never erases                 | "Only grow" rule                   |
| 05| assessEmployee rejects out-of-range level          | Input validation                   |
| 06| assessEmployee rejects unknown skill               | Referential integrity              |
| 07| currentLevel resolves from single source           | Happy path                         |
| 08| currentLevel picks highest-weight record           | Conflict resolution                |
| 09| history is append-only                             | Non-destructive update             |
| 10| Expired certs dropped from currentLevel            | Cert lifecycle                     |
| 11| skillGap — employeeId lookup, all-met case         | Gap happy path                     |
| 12| skillGap — mixed met/unmet math                    | Gap arithmetic                     |
| 13| skillGap — inline actual object                    | Alternative input mode             |
| 14| singlePoint — laser CNC SPOF detection             | Core SPOF rule                     |
| 15| singlePoint — critical when nobody qualified       | Severity tiers                     |
| 16| singlePoint — scan-all returns sorted list         | Dashboard feed                     |
| 17| singlePoint — custom threshold                     | Parameter handling                 |
| 18| successionPlanning — ready_now for qualified       | Readiness classifier               |
| 19| successionPlanning — sorted by score               | Ranking                            |
| 20| trainingRecommendation — sorted + hours            | Plan generation                    |
| 21| teamCapability — histogram + atOrAbove             | Team analytics                     |
| 22| crossTrainingPlan — mentor/apprentice pairs        | Rotation proposal                  |
| 23| visualizeMatrix — rectangular grid + legend        | Heatmap data                       |
| 24| skillDemandForecast — hiring + attrition combined  | Forecast math                      |
| 25| skillDemandForecast — sorted desc                  | Output ordering                    |
| 26| auditTrail captures every action                   | Audit trail                        |
| 27| LEVEL scale bilingual integrity                    | Constants                          |

```
tests 27    pass 27    fail 0    skipped 0
duration_ms ~150
```

---

## 8. Hebrew Glossary — מילון עברי

| Hebrew                  | English                      | Notes                                |
|-------------------------|------------------------------|--------------------------------------|
| מטריצת כישורים           | Skills matrix                 | Main module name                      |
| מעקב מיומנויות           | Competency tracker            | Alternate term                        |
| רמת מיומנות              | Skill level                   | 0–5 scale                             |
| כישור טכני               | Technical skill               | category: technical                   |
| כישור ניהולי              | Management skill              | category: management                  |
| כישור רך                 | Soft skill                    | category: soft                        |
| תעודה / הסמכה             | Certification                 | category: certification               |
| הערכה עצמית              | Self-assessment               | method: self                          |
| הערכת מנהל                | Manager assessment            | method: manager                       |
| מבחן מיומנות              | Skill test                    | method: test                          |
| הערכת עמית                | Peer assessment               | method: peer                          |
| תעודה חיצונית              | External certification        | method: cert                          |
| פער מיומנויות              | Skill gap                     | skillGap output                       |
| ציון התאמה                 | Fit score                     | 0–1 coverage ratio                    |
| נקודת כשל יחידה            | Single point of failure       | SPOF                                  |
| תכנון יורשים              | Succession planning           | successionPlanning                    |
| מועמד מוכן                 | Ready candidate               | ready_now                             |
| תוכנית הכשרה              | Training plan                 | trainingRecommendation                |
| סיבוב עבודה                | Job rotation                  | crossTrainingPlan                     |
| תחזית ביקוש לכישורים         | Skill demand forecast         | skillDemandForecast                   |
| כיסוי כפול                  | Double coverage               | redundancy                            |
| חונך                       | Mentor                        | crossTrainingPlan role                |
| מתלמד                      | Apprentice                    | LEVEL 2                               |
| עצמאי                      | Practitioner                  | LEVEL 3                               |
| מומחה                      | Expert                        | LEVEL 4                               |
| מורה מומחה                   | Master / Teacher              | LEVEL 5                               |
| דוח אי-התאמה                | Non-conformance report (NCR)  | integration with Y-037                |
| חיתוך לייזר                 | Laser cutting                 | SKL-LASER-CNC                         |
| חיתוך פלזמה                 | Plasma cutting                | SKL-PLASMA                            |
| מכופף / פרס-ברייק            | Press brake                   | SKL-PRESS-BRAKE                       |
| ריתוך                       | Welding                       | General                               |
| שרטוט הנדסי                 | Engineering drawing           | SKL-BLUEPRINT                         |
| תקן ישראלי (ת"י)              | Israeli standard              | תקן ישראלי ת"י 9001                    |
| לא מוחקים רק משדרגים ומגדלים | We don't delete, only upgrade & grow | Project rule              |

---

## 9. Integration Points

The Skills Matrix feeds and is fed by:

- **HR Analytics (X-12)** — `retentionRisk()` already reads employee
  skills to drive attrition scoring; now that data is structured.
- **NCR Tracker (Y-037)** — root-cause analysis can flag when a defect
  stems from a SPOF worker being away.
- **Training module (future)** — `trainingRecommendation()` output
  feeds the LMS scheduling engine directly.
- **Org Planning** — `successionPlanning()` plugs into the
  `human-resources:org-planning` skill workflow.
- **Recruiting (Y-16)** — `skillDemandForecast()` drives the job-requisition
  pipeline two quarters ahead.

All integrations remain optional — `SkillsMatrix` has **zero external
dependencies** and can be unit-tested, benchmarked, or embedded in
isolation without any other ERP module present.

---

## 10. Compliance & Privacy Notes

- **חוק שוויון הזדמנויות (Equal Opportunity Law):** the Matrix stores
  only competency data, not protected attributes. Gap calculations
  never surface gender, age, or religion — those live in Analytics
  (X-12) and are masked by `MIN_GROUP_SIZE`.
- **חוק הגנת הפרטיות (Privacy Protection Act):** assessments are
  append-only with an `assessorId` field for accountability, and the
  full audit trail is exposed via `auditTrail()` for Subject Access
  Requests (SAR).
- **ISO 9001:2015 §7.2 — Competence:** the module provides documented,
  auditable evidence of competence for every operator, satisfying the
  standard's "determine / ensure / retain documented information"
  clause.
- **תקן ישראלי ת"י 9001:** same as ISO, Israeli adoption.

---

## 11. Rule Adherence — לא מוחקים רק משדרגים ומגדלים

| Behaviour             | Guarantee                                                  |
|-----------------------|------------------------------------------------------------|
| `defineSkill` upgrade | Updates `updatedAt`, keeps `createdAt`, no record removed  |
| `assessEmployee`      | `_assessments[sid][eid]` is an array, APPENDED every call  |
| `history()`           | Returns the full assessment history, sorted by date        |
| `auditTrail()`        | Read-only slice of every write operation                   |
| `listSkills({includeInactive})` | Inactive skills stay on the list                    |

There is **no delete**, **no truncate**, **no reset**. Data only grows.

---

**Report owner:** Agent Y-070 · Swarm HR · 2026-04-11
**Status:** ✅ Implemented · 27/27 tests passing · Zero deps · Bilingual
