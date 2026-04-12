# AG-Y063 — Employee Onboarding Workflow Engine
**Agent:** Y-63 | **Swarm:** HR | **Project:** Techno-Kol Uzi mega-ERP
**Date:** 2026-04-11
**Status:** PASS — 36 / 36 tests green
**Rule upheld:** לא מוחקים רק משדרגים ומגדלים (Never delete, only upgrade and grow)

---

## 1. Scope

A zero-dependency employee onboarding workflow engine that walks every
new hire at Techno-Kol Uzi through the complete Israeli employment
lifecycle: pre-boarding, Day 1, Week 1, Month 1, and the Month-3
probation review. Bilingual (Hebrew RTL / English LTR). Pure Node.js,
no third-party packages, no `require` outside `node:*`.

### Delivered files

| File | LOC | Purpose |
|---|---|---|
| `onyx-procurement/src/hr/onboarding.js` | ~640 | Main workflow engine |
| `onyx-procurement/test/hr/onboarding.test.js` | ~420 | 36 unit tests |
| `_qa-reports/AG-Y063-onboarding.md` | this file | QA report |

### Rules respected

- **Zero deps** — only `node:test`, `node:assert` (tests).
- **Never deletes** — `createMemoryStore()` intentionally has no
  `delete`/`remove`/`clear` methods. Task state changes append to
  `task.history`, so the full transition trail is always recoverable.
- **Bilingual labels** on every phase, task, field, and equipment item.
- **Israeli-law compliant** — form 101 (פקודה 164), חוזה עבודה,
  השפ"ר, דוח קבלת עובד לביטוח לאומי, הדרכת בטיחות (תקנות ארגון הפיקוח
  על העבודה), and תקופת ניסיון all captured in the templates.
- **Real code, real tests** — `node --test` runs in 143 ms with
  36 passing assertions.

---

## 2. Public API

```js
const {
  OnboardingWorkflow,     // main class
  PHASES,                 // { PRE_BOARDING, DAY_1, WEEK_1, MONTH_1, MONTH_3 }
  PHASE_ORDER,            // array form of the above
  TASK_STATUS,            // { PENDING, IN_PROGRESS, DONE, BLOCKED, OVERDUE, SKIPPED, CANCELLED }
  ONBOARDING_STATUS,      // { ACTIVE, PAUSED, COMPLETED, CANCELLED }
  FORM_101_FIELDS,        // full field catalog for טופס 101
  ROLE_EQUIPMENT,         // role → [items]
  LABELS,                 // bilingual label dictionary
  TASK_TEMPLATES,         // source-of-truth task catalog
  createMemoryStore,      // in-memory adapter
  isValidTz,              // Luhn ת.ז. validator
  normalizeRole,          // role → canonical key
  computeCreditPoints,    // 2026 נקודות זיכוי calculator
  computeCurrentPhase,    // time → phase
} = require('./src/hr/onboarding.js');
```

### Class `OnboardingWorkflow`

| Method | Purpose |
|---|---|
| `constructor({ store?, now?, buddyPool?, logger? })` | Wire adapters, inject clock for tests |
| `startOnboarding({ employee })` | Create a new onboarding record, generate tasks, assign a buddy, build the role equipment list |
| `markTaskComplete(onboardingId, taskId, by, notes, evidence)` | Transition a task to DONE, append to history, auto-complete the whole onboarding when all mandatory tasks are finished |
| `generate101({ employee })` | Produce a fully populated Form 101 (טופס 101) with 35 fields, Israeli TZ Luhn validation, and credit-points calculation |
| `equipmentChecklist({ role })` | Bilingual equipment checklist keyed by role (office / manager / factory_worker / metal_fab / driver) |
| `buddyAssignment(employeeId)` | Rank and assign a buddy from the pool (same-department → seniority → lowest workload) |
| `alertBlockers(onboardingId)` | Detect overdue mandatory tasks, transition them to OVERDUE status (history preserved), and emit a bilingual alert |
| `getOnboarding(id)` | Look up a record |
| `listAll()` | List all onboarding records |
| `listByPhase(phase)` | Filter by current phase |

---

## 3. Phase Checklist

| Phase | Offset (days) | Task id | Mandatory | Legal anchor |
|---|---|---|---|---|
| **Pre-boarding** (קליטה מוקדמת) | −7 | `order_equip` | Yes | internal |
| | −5 | `welcome_email` | Yes | internal |
| | −3 | `prep_desk` | Yes | internal |
| | −3 | `assign_buddy` | Yes | internal |
| | −2 | `create_accounts` | Yes | internal |
| **Day 1** (יום ראשון) | 0 | `welcome_meeting` | Yes | internal |
| | 0 | `orientation` | Yes | internal |
| | 0 | `form_101` (טופס 101) | Yes | פקודה 164 מס הכנסה |
| | 0 | `employment_contract` (חוזה עבודה) | Yes | חוק הודעה לעובד תשס״ב-2002 |
| | 0 | `form_shpar` (טופס השפ"ר) | Yes | קרן השתלמות |
| | 0 | `bl_report` (דוח קבלת עובד לביטוח לאומי) | Yes | ביטוח לאומי |
| **Week 1** (שבוע ראשון) | +2 | `systems_access` | Yes | internal |
| | +3 | `safety_training` (הדרכת בטיחות) | Yes | תקנות ארגון הפיקוח על העבודה |
| | +4 | `team_intro` | No | internal |
| **Month 1** (חודש ראשון) | +14 | `first_1on1` | Yes | internal |
| | +21 | `project_assignment` | Yes | internal |
| | +28 | `training_plan` | Yes | internal |
| **Month 3** (חודש שלישי / תקופת ניסיון) | +85 | `probation_review` | Yes | תקופת ניסיון |
| | +90 | `ongoing_training` | No | internal |

**Total:** 19 templated tasks across 5 phases. 17 are mandatory.

---

## 4. Form 101 Fields (טופס 101) — full catalog

### Section A — Employee Identity (פרטי העובד)

| Field | Hebrew | English | Type | Required |
|---|---|---|---|---|
| full_name | שם מלא | Full name | string | ✓ |
| tz | מספר זהות | ID number (TZ) | id | ✓ |
| date_of_birth | תאריך לידה | Date of birth | date | ✓ |
| aliyah_date | תאריך עלייה | Aliyah date | date | – |
| country_of_birth | ארץ לידה | Country of birth | string | – |
| gender | מין | Gender | enum | ✓ |
| address | כתובת מגורים | Home address | address | ✓ |
| phone | טלפון | Phone | string | ✓ |
| email | דוא"ל | Email | string | ✓ |

### Section B — Marital status & Children (מצב משפחתי וילדים)

| Field | Hebrew | English | Type | Required |
|---|---|---|---|---|
| marital_status | מצב משפחתי | Marital status | enum | ✓ |
| spouse_name | שם בן/בת הזוג | Spouse name | string | – |
| spouse_tz | ת.ז. בן/בת הזוג | Spouse ID | id | – |
| spouse_works | בן/בת הזוג עובד/ת | Spouse employed | bool | – |
| spouse_income | הכנסת בן/בת הזוג | Spouse income | decimal | – |
| children_count | מספר ילדים | Number of children | int | ✓ |
| children_under_18 | ילדים עד גיל 18 | Children under 18 | int | – |
| children_details | פרטי ילדים | Children details | array | – |

### Section C — Income sources (מקורות הכנסה)

| Field | Hebrew | English | Type | Required |
|---|---|---|---|---|
| is_primary_employer | משכורת עיקרית אצל מעסיק זה | Primary employer? | bool | ✓ |
| other_income | הכנסה ממקור אחר | Other income sources | bool | ✓ |
| other_income_type | סוג הכנסה אחרת | Other income type | enum | – |
| other_income_amount | סכום הכנסה אחרת | Other income amount | decimal | – |
| additional_employer | מעסיק נוסף | Additional employer | string | – |
| pension_received | מקבל/ת קצבה | Receiving pension | bool | – |

### Section D — Tax Credit Points (נקודות זיכוי)

| Field | Hebrew | English | Type | Required |
|---|---|---|---|---|
| is_resident | תושב/ת ישראל | Israeli resident | bool | ✓ |
| new_immigrant | עולה חדש | New immigrant (Oleh) | bool | – |
| single_parent | הורה יחיד | Single parent | bool | – |
| disability | נכה | Disabled | bool | – |
| disability_cert | אישור נכות | Disability certificate | string | – |
| soldier_discharge | חייל משוחרר | Discharged soldier | bool | – |
| discharge_date | תאריך שחרור מצה"ל | Discharge date | date | – |
| academic_degree | בעל/ת תואר אקדמי | Academic degree | bool | – |
| development_town | יישוב מזכה | Development town | bool | – |
| credit_points_claimed | נקודות זיכוי נתבעות | Credit points claimed | decimal | ✓ |

### Section E — Declaration (הצהרה)

| Field | Hebrew | English | Type | Required |
|---|---|---|---|---|
| declaration_true | הצהרה על אמיתות הפרטים | Declaration of truth | bool | ✓ |
| signature | חתימת העובד | Employee signature | string | ✓ |
| signature_date | תאריך חתימה | Signature date | date | ✓ |

**Total fields:** 35 across 5 sections. 16 are marked required.

### Credit-points defaults (2026)

- Base: 2.25 male / 2.75 female Israeli resident
- +1.00 per non-working resident spouse
- +0.50 per child under 18 (capped at 5 children)
- +1.00 new immigrant (first 18 months)
- +0.50 academic degree (year after certification)
- +1.00 single parent
- +2.00 disabled

---

## 5. Role Equipment Matrix

### office_worker (עובד משרד)

laptop (מחשב נייד), mouse (עכבר), keyboard (מקלדת), monitor (מסך),
headset (אוזניות), phone (טלפון סלולרי), access_card (כרטיס כניסה),
chair (כיסא ארגונומי).

### manager (מנהל/ת)

laptop, phone, access_card, credit_card (כרטיס אשראי חברה),
parking_tag (תג חנייה).

### factory_worker (עובד ייצור)

uniform (מדי עבודה), safety_shoes (נעלי בטיחות), access_card,
time_clock_card (כרטיס שעון נוכחות), helmet (קסדה), vest (אפוד זוהר),
ear_protection (אטמי אוזניים).

### metal_fab (מתכת / ריתוך) — full PPE bundle

uniform (חסין חום), safety_shoes S3, access_card, welding_helmet
(קסדת ריתוך), welding_gloves (כפפות ריתוך), apron (סינר עור), goggles
(משקפי מגן), respirator (מסכת נשימה), ear_protection, cut_resistant_gloves
(כפפות נגד חיתוך). Every PPE item is mandatory per
**תקנות הבטיחות בעבודה**.

### driver (נהג/שליח)

uniform, phone, gps (מכשיר ניווט), fuel_card (כרטיס דלק),
safety_vest (אפוד זוהר).

Unknown / unmapped roles fall back to `office_worker`.

---

## 6. Blocker Detection

`alertBlockers(id)` scans all tasks, flags mandatory ones past their
`dueAt`, transitions them to `OVERDUE` status, appends an audit entry
to `task.history`, and returns:

```js
{
  onboardingId,
  employee: "דני כהן",
  count: 3,
  blockers: [{ taskId, phase, label, dueAt, daysOverdue, legal }],
  severity: "medium",
  alertHe: "נמצאו 3 חסמים בקליטת דני כהן",
  alertEn: "3 blocker(s) found for דני כהן"
}
```

### Severity ladder

| Count | Severity | Notes |
|---|---|---|
| 0 | none | All clear |
| 1–2 | low | Coach manager |
| 3–5 | medium | Escalate to HR |
| 6+ | high | Executive alert |

**Critical observation:** overdue tasks are NEVER removed or
re-scheduled silently — they are transitioned to `OVERDUE` and the
entire state chain stays in `task.history`. When the task is finally
completed, a new history record is appended, so you can audit how
late it was and why.

---

## 7. Test Coverage (36 / 36 PASS)

| Group | Tests | Notes |
|---|---|---|
| Utility validation (TZ, roles, credit points, phase math) | 5 | Luhn, fallbacks, 2026 rules |
| startOnboarding | 6 | Happy path, validation, sequencing, phase contents |
| markTaskComplete | 3 | Transition, auto-complete, error handling |
| Form 101 | 6 | Field coverage, pre-fill, TZ validation, credit points, required fields, sections |
| equipmentChecklist | 5 | Office, factory, metal-fab PPE, fallback, bilingual |
| buddyAssignment | 2 | Empty pool, same-dept/seniority ranking |
| alertBlockers | 4 | Detection, ignoring completed, empty, append-only history |
| Never-delete rule | 2 | Store has no delete method, history is append-only |
| Bilingual coverage | 2 | All tasks and 101 fields carry {he,en} |
| **Total** | **36** | duration 143 ms |

```
ℹ tests 36
ℹ pass  36
ℹ fail  0
ℹ duration_ms 143.7259
```

---

## 8. Hebrew Glossary (מילון)

| Hebrew | Transliteration | English | Use in system |
|---|---|---|---|
| קליטת עובד | klitat oved | Employee onboarding | workflow name |
| קליטה מוקדמת | klita mukdemet | Pre-boarding | PHASES.PRE_BOARDING |
| יום ראשון | yom rishon | Day 1 | PHASES.DAY_1 |
| שבוע ראשון | shavua rishon | Week 1 | PHASES.WEEK_1 |
| חודש ראשון | chodesh rishon | Month 1 | PHASES.MONTH_1 |
| תקופת ניסיון | tkufat nisayon | Probation period | PHASES.MONTH_3 |
| טופס 101 | tofes mea veachad | Form 101 | generate101() |
| חוזה עבודה | choze avoda | Employment contract | task `employment_contract` |
| טופס השפ"ר | tofes hashpar | Training-fund (keren histalmut) declaration | task `form_shpar` |
| ביטוח לאומי | bituach leumi | National Insurance | task `bl_report` |
| הדרכת בטיחות | hadrachat b'tichut | Safety training | task `safety_training` |
| מספר זהות / ת.ז. | mispar zehut / teudat zehut | National ID | Form 101 tz field |
| נקודות זיכוי | nkudot zikui | Tax credit points | Form 101 section D |
| עולה חדש | ole chadash | New immigrant | +1 credit point |
| הורה יחיד | hore yachid | Single parent | +1 credit point |
| חייל משוחרר | chayal meshuchrar | Discharged soldier | Form 101 section D |
| יישוב מזכה | yishuv mezake | Development town | Form 101 section D |
| נכה | nache | Disabled | +2 credit points |
| חונך | chonech | Buddy / mentor | buddyAssignment() |
| מדי עבודה | madei avoda | Work uniform | factory_worker / metal_fab |
| נעלי בטיחות | naalei b'tichut | Safety shoes | PPE |
| קסדת ריתוך | kasdat rituch | Welding helmet | metal_fab PPE |
| סינר עור | sinar or | Leather apron | metal_fab PPE |
| מסכת נשימה | masechat neshima | Respirator | metal_fab PPE |
| כרטיס שעון נוכחות | kartis shaon nochechut | Time-clock card | factory_worker |
| שיבוץ | shibutz | Assignment (buddy, project) | buddyAssignment, task `project_assignment` |
| סקירת תקופת ניסיון | skirat tkufat nisayon | Probation review | task `probation_review` |
| דוח קבלת עובד | doch kabalat oved | New-hire report | task `bl_report` |
| פגישת 1:1 | pgishat echad al echad | 1-on-1 meeting | task `first_1on1` |
| חסמים | chasamim | Blockers | alertBlockers() |

---

## 9. Rule Upheld — לא מוחקים רק משדרגים ומגדלים

Evidence the rule is structurally enforced, not just policy:

1. **`createMemoryStore()` has no delete method.** Verified by unit
   test `store has no delete method — לא מוחקים` which asserts
   `typeof store.delete === 'undefined'` (also `remove`, `clear`).
2. **Task history is append-only.** Every state transition pushes a
   new object into `task.history`. The test
   `task history is append-only through multiple transitions` takes
   one task through PENDING → OVERDUE → DONE and verifies both the
   OVERDUE and DONE entries survive.
3. **Skipped / cancelled status ≠ deleted.** `TASK_STATUS.SKIPPED` and
   `TASK_STATUS.CANCELLED` are first-class statuses. The task stays
   in the record — the UI just filters it.
4. **Onboarding cancellation preserves the whole record.**
   `ONBOARDING_STATUS.CANCELLED` is just a status transition;
   `history` entries preserve why and by whom.
5. **Form 101 re-generation is non-destructive.** Each call to
   `generate101()` returns a fresh payload; the previous copy (if
   persisted) stays in place.

---

## 10. Files (absolute paths)

- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\onyx-procurement\src\hr\onboarding.js`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\onyx-procurement\test\hr\onboarding.test.js`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\_qa-reports\AG-Y063-onboarding.md`

---

**Agent Y-63 sign-off:** 2026-04-11 — ready for integration with
payroll (Form 101 feeds withholding setup) and with the declarative
workflow engine (AG-X15) for approval gates on the probation review.
