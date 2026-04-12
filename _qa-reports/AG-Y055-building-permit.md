# AG-Y055 — Building Permit Tracker (היתרי בנייה)

**Agent**: Y-055
**Component**: `onyx-procurement/src/realestate/building-permit.js`
**Tests**: `onyx-procurement/test/realestate/building-permit.test.js`
**Status**: GREEN — 38/38 tests passing
**Written**: 2026-04-11
**Rule honoured**: *לא מוחקים רק משדרגים ומגדלים* — every "cancel" / "withdraw" operation is an append-only status transition plus an audit-trail entry. No record is ever removed. Stage history is immutable.

---

## 1. Purpose

A full life-cycle tracker for Israeli building permits (*היתרי בנייה*) used by the Techno-Kol Uzi construction ERP. The module supports every permit type a mid-sized Israeli construction group needs to run in-house:

| Key                  | Hebrew           | English            |
|----------------------|------------------|--------------------|
| `new-construction`   | בנייה חדשה       | New Construction   |
| `addition`           | תוספת             | Addition           |
| `renovation`         | שיפוץ             | Renovation         |
| `change-of-use`      | שינוי ייעוד       | Change of Use      |
| `demolition`         | הריסה             | Demolition         |
| `tama-38`            | תמ"א 38           | TAMA 38            |

The module is **zero-dependency** pure JavaScript. It uses an in-memory store by default, with a pluggable persistence adapter for production wiring.

---

## 2. Israeli Permit Process (Stage Definitions)

The module tracks the standard seven-stage *רישוי בנייה* pipeline used by Israeli *ועדות מקומיות* since the 2016 regulations reform:

| # | Stage (code)  | Hebrew           | English              | SLA (days) | Meaning |
|---|---------------|------------------|----------------------|-----------:|---------|
| 1 | `intake`      | קליטה             | Intake               | 14  | Application received, basic completeness check |
| 2 | `eng-review`  | בדיקה הנדסית     | Engineering Review   | 45  | *מהנדס הוועדה* examines plans, calcs, code compliance |
| 3 | `locating`    | איתור             | Locating / Zoning    | 30  | Surveyor + zoning against *תב"ע* (local plan) |
| 4 | `hearing`     | דיון בוועדה       | Committee Hearing    | 90  | *ועדה מקומית* (and escalation to *מחוזית*) |
| 5 | `permit`      | היתר               | Permit Issued        | 30  | Pay *אגרות*, receive signed permit |
| 6 | `open`        | פתיחה             | Construction Open    | 730 | *תחילת עבודות*, construction in progress |
| 7 | `completion`  | סיום               | Completion (Form 4)  | 30  | *טופס 4 / תעודת גמר* — occupancy certificate |

Non-linear stages (enterable from any active stage, appended to history):

| Code         | Hebrew      | English    | Notes |
|--------------|-------------|------------|-------|
| `on-hold`    | בהמתנה      | On Hold    | Resumes into any forward stage |
| `withdrawn`  | נמשך         | Withdrawn  | Terminal — applicant pulls out |
| `rejected`   | נדחה         | Rejected   | Terminal — committee denies |

**Transition rules**:
- Forward stages move strictly one step at a time (no skipping).
- Any active stage can transition to `on-hold`, `withdrawn`, or `rejected`.
- `on-hold` can resume into any forward stage.
- Terminal stages (`completion`, `rejected`, `withdrawn`) are frozen — the module throws on any attempt to reopen, preserving the audit trail.

---

## 3. API Surface

### `createApplication(input)`
Creates a new permit at `STAGES.INTAKE`. Validates all required fields; throws on bad input.

**Required fields**: `propertyId`, `applicant.name`, `architect.name`, `engineer.name`, `applicationType`, `description`, `sqmProposed > 0`.
**Optional fields**: `documents[]`, `municipality`, `committee`.
**Returns**: `applicationId` (string, prefix `permit_`).

### `recordStatusChange(permitId, newStatus, notes, date)`
Append-only stage transition. Never removes prior history. Enforces legal transitions via `_canTransition`.
**Returns**: `{ ok, from, to, at }`.

### `documentChecklist(applicationType)`
Returns the full document catalog with per-type `required` flags. Each entry has bilingual Hebrew/English labels.

### `documentCompletion(permitId)`
Returns `{ missing[], provided[], completionPct }` for a specific permit.

### `committeeHearings(permitId)` — sub-API
- `schedule({committee, date, agenda})` → `hearingId`
- `recordResult(hearingId, result, notes)` — `result ∈ {approved, rejected, deferred, conditional}`
- `list()` — all hearings
- `next()` — next pending hearing by date

### `objections(permitId)` — sub-API
- `file({objector, grounds, date})` → `objectionId`
- `resolve(id, outcome, notes)` — `outcome ∈ {upheld, dismissed, withdrawn}`
- `list()` — all objections
- `countOpen()` — number of open objections

### `amendments(permitId)` — sub-API
- `propose({description, sqmDelta, reason})` → `amendmentId`
- `approve(id, approvedBy)` — applies `sqmDelta` to `sqmProposed`
- `reject(id, reason)` — does not touch sqm
- `list()` — all amendments (status: `pending | approved | rejected`)

### `permitFees({type, sqm, municipality})`
Calculates *אגרות בנייה* per municipal tariff.
**Formula**:
```
base            = tariff.perSqm × sqm × typeMultiplier
infrastructure  = 0.10 × base              (אגרות פיתוח)
archive         = 450 ILS flat             (ארכיון תכניות)
rawTotal        = base + infrastructure + archive
total           = max(rawTotal, tariff.minFee)
```
**Returns**: `{ total, currency:'ILS', breakdown, tariff }`.

### `daysInStage(permitId)`
Returns `{ currentStage, days, since, stageLabel{he,en}, history[] }` — full stage-by-stage duration tracking.

### `alertStaleApplication(permitId)`
Flags permits stalled beyond the stage-specific threshold. Terminal stages return `stale:false, reason:'terminal-stage'`.
**Returns**: `{ stale, reason, stage, since, days, threshold }`.

### `tamaTracker(propertyId)` — sub-API
- `register({permitId, tamaType, unitsBefore, unitsAfter, seismicStandard})` — `tamaType ∈ {tama-38-1, tama-38-2}`
- `recordMilestone(permitId, milestone, date)` — enforces 38/1 vs 38/2 exclusivity
- `get(permitId)` — TAMA record
- `list()` — all TAMA permits on this property

---

## 4. Municipal Fee Tariffs (2026 Reference)

Reference values anchored on *תקנות התכנון והבנייה (אגרות) התשמ"ד-1984* as updated. Real tariffs vary per *עירייה* — replace with live data feed in production.

| Municipality (key) | Hebrew         | ILS/m² | Min Fee (ILS) |
|--------------------|----------------|-------:|--------------:|
| `tel-aviv`         | תל אביב-יפו     | 72     | 2,400         |
| `jerusalem`        | ירושלים          | 58     | 1,900         |
| `haifa`            | חיפה             | 54     | 1,800         |
| `rishon`           | ראשון לציון      | 48     | 1,600         |
| `petach`           | פתח תקווה        | 50     | 1,700         |
| `netanya`          | נתניה            | 46     | 1,550         |
| `holon`            | חולון            | 47     | 1,600         |
| `ashdod`           | אשדוד            | 44     | 1,500         |
| `bnei-brak`        | בני ברק          | 42     | 1,400         |
| `beersheva`        | באר שבע          | 38     | 1,300         |
| `default`          | ברירת מחדל       | 40     | 1,400         |

Type multipliers on the base per-m² fee:

| Type               | Multiplier | Notes |
|--------------------|-----------:|-------|
| `new-construction` | 1.00       | Full fee |
| `addition`         | 0.80       | Existing structure credit |
| `renovation`       | 0.40       | Internal work only |
| `change-of-use`    | 0.60       | No new construction |
| `demolition`       | 0.30       | Low physical overhead |
| `tama-38`          | 0.50       | Seismic-strengthening **incentive** |

---

## 5. Document Checklist (בדיקת מסמכים)

The module exposes a **catalog** of 18 document types, with per-application-type required sets. Each entry carries bilingual labels.

| Key             | Hebrew                   | English                      |
|-----------------|--------------------------|------------------------------|
| `plans`         | תוכניות אדריכליות       | Architectural Plans          |
| `calc`          | חישובים סטטיים           | Structural Calculations      |
| `lawyer`        | אישור עורך דין           | Lawyer Confirmation          |
| `contractor`    | רישיון קבלן רשום         | Contractor License           |
| `owner-consent` | הסכמת בעלים              | Owner Consent                |
| `nefesh`        | חישוב שטחים              | Area Calculation             |
| `survey`        | מפה מצבית מדידה          | Surveyor Map                 |
| `env-impact`    | הערכת השפעה סביבתית      | Environmental Impact         |
| `shelter`       | מקלט / ממ"ד              | Shelter / MAMAD              |
| `parking`       | פתרון חניה               | Parking Plan                 |
| `tama-cert`     | אישור תמ"א               | TAMA Certification           |
| `seismic-eng`   | הצהרת מהנדס רעידות       | Seismic Engineer Declaration |
| `demo-plan`     | תוכנית הריסה             | Demolition Plan              |
| `use-justify`   | הצדקת שינוי ייעוד         | Use-Change Justification     |
| `neighbors`     | הודעה לשכנים             | Neighbor Notification        |
| `fire`          | אישור כבאות              | Fire Department Approval     |
| `access`        | אישור חברת חשמל          | Electric Utility Approval    |
| `water`         | אישור תאגיד מים          | Water Utility Approval       |

### Required sets by type

- **new-construction** → plans, calc, lawyer, contractor, owner-consent, nefesh, survey, **shelter**, **parking**, neighbors, fire, access, water
- **addition** → plans, calc, lawyer, contractor, owner-consent, nefesh, survey, neighbors, fire
- **renovation** → plans, lawyer, contractor, owner-consent, neighbors
- **change-of-use** → plans, lawyer, owner-consent, **use-justify**, neighbors, fire, parking
- **demolition** → **demo-plan**, lawyer, contractor, owner-consent, survey, neighbors
- **tama-38** → plans, calc, lawyer, contractor, owner-consent, nefesh, survey, **tama-cert**, **seismic-eng**, neighbors, fire, access, water

---

## 6. TAMA 38 Rules (תמ"א 38)

*תמ"א 38* is Israel's National Master Plan 38 — the seismic-strengthening framework aimed at bringing pre-1980 buildings up to *תקן ישראלי 413* seismic standard. The module tracks both sub-types:

### TAMA 38/1 — חיזוק + תוספת
- **Trigger**: Existing building lacks seismic reinforcement.
- **Action**: Strengthen structure in place **and** add new floors/units as incentive for the developer.
- **Key milestones**: `seismic-assessment`, `resident-agreement`, `committee-approval`, `building-permit`, **`strengthening`**, `construction`, `form-4`.
- **Forbidden**: `demolition` milestone (structure is preserved).

### TAMA 38/2 — הריסה ובנייה מחדש
- **Trigger**: Strengthening is uneconomic; full teardown chosen.
- **Action**: Demolish existing building and rebuild from scratch to code.
- **Key milestones**: `seismic-assessment`, `resident-agreement`, `committee-approval`, `building-permit`, **`demolition`**, `construction`, `form-4`.
- **Forbidden**: `strengthening` milestone (there's nothing to strengthen).

### Resident agreement (80% rule)
The *resident-agreement* milestone represents the statutory *80% הסכמת דיירים* threshold required under TAMA 38 before the local committee will grant a permit. The module records the date of the milestone; the actual signature count lives in the HOA (*נציגות הבית המשותף*) sub-system.

### Mutual exclusivity
The module **enforces** that you cannot record a `strengthening` milestone on a 38/2 permit, nor a `demolition` milestone on a 38/1 permit. Both attempts throw. This is test-covered.

---

## 7. Hebrew Glossary (מילון)

| Term              | Latin         | English                        |
|-------------------|---------------|--------------------------------|
| היתר בנייה        | heter bniya   | Building permit                |
| ועדה מקומית       | va'ada mekomit| Local planning committee       |
| ועדה מחוזית       | va'ada mehozit| District planning committee   |
| ועדת ערר          | va'adat erer  | Appeal committee               |
| קליטה             | klita         | Intake                         |
| בדיקה הנדסית      | bedika handasit| Engineering review            |
| איתור             | itur          | Locating / zoning              |
| דיון              | diyun         | Committee hearing              |
| היתר              | heter         | Permit                         |
| פתיחה             | ptiha         | Opening (construction)         |
| סיום              | siyum         | Completion                     |
| טופס 4            | tofes 4       | Form 4 — occupancy certificate |
| תעודת גמר         | te'udat gmar  | Completion certificate         |
| תוכניות           | tochniyot     | Plans                          |
| חישובים סטטיים    | hishuvim statiyim | Structural calculations    |
| עורך דין          | orech din     | Lawyer                         |
| רישיון קבלן       | rishyon kablan| Contractor license             |
| תב"ע              | tabba         | Local outline plan             |
| אגרות בנייה       | agrot bniya   | Permit fees                    |
| אגרות פיתוח       | agrot pituah  | Infrastructure fees            |
| התנגדות           | hitnagdut     | Objection                      |
| שכנים             | shchenim      | Neighbors                      |
| שינוי היתר        | shinuy heter  | Permit amendment               |
| שטחים             | shtachim      | Areas (m²)                     |
| ממ"ד              | mamad         | Safe room                      |
| מקלט              | miklat        | Shelter                        |
| תמ"א 38           | tama 38       | National Master Plan 38        |
| חיזוק             | hizuk         | Strengthening                  |
| הריסה             | harisa        | Demolition                     |
| נציגות הבית       | netzigut      | HOA / house representation     |
| מהנדס הוועדה      | mehandes      | Committee engineer             |
| חוות דעת          | chavat da'at  | Professional opinion           |

---

## 8. Test Coverage

38 test cases, all green:

| Area                | Tests |
|---------------------|------:|
| createApplication   | 3     |
| stage progression   | 5     |
| documentChecklist   | 5     |
| permitFees          | 6     |
| committeeHearings   | 2     |
| objections          | 2     |
| amendments          | 3     |
| daysInStage / stale | 4     |
| TAMA 38 tracker     | 5     |
| audit / list        | 3     |

**Run**:
```bash
cd onyx-procurement
node --test test/realestate/building-permit.test.js
```

**Result (2026-04-11)**:
```
tests       38
suites       0
pass        38
fail         0
cancelled    0
skipped      0
todo         0
duration_ms 209.87
```

---

## 9. Israeli-Law Anchors

Module references the following statutes and regulations:

- **חוק התכנון והבנייה תשכ"ה-1965** — Planning & Building Law (primary statute)
- **תקנות התכנון והבנייה (רישוי בנייה)** — Permit Regulations 2016 (process reform)
- **תקנות התכנון והבנייה (אגרות) התשמ"ד-1984** — Fee Regulations
- **תמ"א 38** — National Master Plan 38 (seismic)
- **תמ"א 38/1 / 38/2** — Strengthening vs teardown sub-plans
- **תקן ישראלי 413** — Israeli Standard 413 (seismic design)
- **חוק מבנים מסוכנים** — Dangerous Buildings Law (fast-track TAMA)
- **חוק המקרקעין תשכ"ט-1969** — Land Law (80% rule, HOA resolution)

These anchors are documented in the source file header for legal traceability.

---

## 10. Integration Notes

- **Persistence**: the `store` adapter interface is `{ get, set, has, list, clear }`. Production wiring should plug into the Onyx DB adapter; the default in-memory Map is test-only.
- **Audit trail**: `getAuditTrail()` returns an append-only journal of every mutation. Persist this separately for SOX / ISO compliance.
- **Bilingual UI**: every enum has `{ he, en }` labels exported; the dashboard can render Hebrew-first and fall back to English.
- **RTL**: all strings are RTL-safe; the module does not touch DOM so direction is the caller's responsibility.
- **Never delete**: `resetStore()` exists as a test helper only. It logs the reset into the audit trail before clearing, honouring the *לא מוחקים* rule by making even resets observable.

---

## 11. Files

- **Source**: `onyx-procurement/src/realestate/building-permit.js`
- **Tests**: `onyx-procurement/test/realestate/building-permit.test.js`
- **Report**: `_qa-reports/AG-Y055-building-permit.md` *(this file — never delete)*
