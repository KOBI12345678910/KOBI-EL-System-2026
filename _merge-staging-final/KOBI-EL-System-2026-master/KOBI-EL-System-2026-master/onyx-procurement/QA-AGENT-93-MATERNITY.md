# QA Agent #93 — Maternity & Parental Leave (חופשת לידה)

- **Project under test:** `payroll-autonomous`
- **Scope:** Static analysis only (no execution)
- **Date:** 2026-04-11
- **Cross-project output target:** `onyx-procurement`
- **Dimension:** Maternity & Parental Leave — Israeli labour law compliance (חוק עבודת נשים, תשי"ד-1954 + חוק הביטוח הלאומי)
- **Verdict:** FAIL — no maternity/parental/adoption leave logic exists in the codebase
- **Overall maturity (0-10):** 0

---

## 1. Project Structure (what actually exists)

Entire project footprint:

```
payroll-autonomous/
├── index.html
├── package.json           (react 18.3.1 + vite — no libs)
├── vite.config.js
└── src/
    ├── main.jsx
    └── App.jsx            (578 lines — the entire app)
```

`package.json` description: *"מערכת שכר אוטונומית — טכנו-קול | Israeli Payroll 2025 Engine"*.
Reality: a single-file React SPA storing everything in `window.storage` (localStorage-style) under six keys: `pr-emp-v2`, `pr-sub-v2`, `pr-att-v2`, `pr-jobs-v2`, `pr-runs-v2`, `pr-log-v2`. There is no backend, no database, no tests, no API layer, no types, no routes.

The payroll engine (`autoCalcEmployee`, lines 27-80) recognises exactly these attendance statuses:

| Status    | Line | Notes |
|-----------|------|-------|
| present   | 31   | pays base + OT |
| partial   | 31   | pays base + OT |
| absent    | 32   | unpaid |
| sick      | 33   | Dabush model — day 1 unpaid, days 2-3 @50%, day 4+ @100% |
| vacation  | 34   | paid @100% |
| reserve   | 35   | paid @100% |

There is no 7th status. Grep for `maternit|parental|pregnan|הנקה|אימוץ|לידה|adoption|bituach|הורות` across the entire project returned **zero matches** inside logic code (only one unrelated hit on line 468 for the word "ביטוח לאומי" used in the payslip deduction label).

---

## 2. Findings by sub-dimension

### 2.1 Maternity leave — 26 weeks (15 paid by Bituach Leumi)

**Status:** NOT IMPLEMENTED (Critical / P0).

- No `maternityLeave`, `maternity`, `לידה`, `birth`, `dm_leida`, or equivalent field exists in the `emp` entity (see employee form, lines 505-523 — the only employee properties collected are: name, role, idNumber, phone, baseSalary, creditPoints, transport, bonus, bank*, startDate, hasPension).
- There is no attendance status for maternity. A woman on leave must be logged as `absent` (no pay, triggers the >3 days absence anomaly on line 67) or `vacation` (draws down her annual allowance incorrectly and the employer pays 100% — illegal, it should be BL's liability).
- The 26-week / 15-week split mandated by §6 חוק עבודת נשים is absent from the calendar/period model entirely; the app only reasons about one calendar month at a time (`month`, `year` state, lines 126-127).
- The 15-paid-by-BL sub-period is a Bituach Leumi claim scenario — the app has no integration, no claim form, no BL file (טופס בל/355), and no export of the required 6-month gross average.
- Employer's pension + severance obligations continue during the 15 paid weeks under §7א — not modeled.

**Legal reference not honoured:** חוק עבודת נשים תשי"ד-1954 §6, §6(ח); תקנות הביטוח הלאומי (אמהות).

### 2.2 Paternity leave

**Status:** NOT IMPLEMENTED (High / P1).

- §6(ח1) allows the father to substitute the last 6 weeks of the mother's leave (דמי לידה חלקיים לבן-הזוג). There is no field distinguishing mother vs father, no sex / gender attribute, no `spouseEmpId` link, no toggle for leave transfer.
- The 5-day paid "paternity leave at birth" (חוק דמי מחלה — היעדרות עקב לידת בן/בת זוג, §7ב) is likewise missing; there is no short-event leave type.

### 2.3 Adoption leave (חופשת אימוץ)

**Status:** NOT IMPLEMENTED (High / P1).

- §6 (ו) grants the same 26-week rights for adoption of a child under 10. No `adoption` attendance status, no `adoptionDate` field, no trigger distinguishing biological from adoptive parents.
- Surrogacy (הורות מיועדת) — §6(ו1) — also absent.

### 2.4 Leave extension without pay — up to 1 year

**Status:** NOT IMPLEMENTED (High / P1).

- §7(ד)(1) permits extension of up to a quarter of the employee's seniority, capped at one year, unpaid. The engine has no concept of an "unpaid leave" period that freezes salary but preserves employment and job protection.
- The anomaly check `daysWorked === 0 && records.length === 0` (line 70) will flag such an employee as "אין דיווח נוכחות" and the `gross < emp.baseSalary * 0.7` check (line 69) will fire — meaning a legitimately-on-extended-leave employee generates false alerts every month.
- No seniority (ותק) counter at all — impossible to calculate the 1/4-seniority cap.

### 2.5 Job protection during leave

**Status:** NOT IMPLEMENTED (Critical / P0).

- §9 / §9א prohibits dismissal during pregnancy, maternity leave, and 60 days after return (with the extensions for IVF, etc.). The app has no concept of "protected employee" status — the employee list simply uses a boolean `active`, and setting `active=false` (deactivation) is unguarded: any user can flip a woman on leave to inactive with no warning and no audit log beyond a generic "עדכון עובד" event.
- No hook or validation in `saveEmployee` (lines 149-157) prevents illegal dismissal; no Ministry-of-Labour permit workflow (היתר משרד העבודה לפיטורי עובדת בהריון).

### 2.6 Return-to-work part-time option

**Status:** NOT IMPLEMENTED (Medium / P2).

- Upon return, employee rights include up to 4 months of reduced-hours + right to refuse overtime (§7(ג)(2)). The `partial` attendance status (lines 31, 38, 362, 569) exists but does not distinguish between "employee chose to work 4 hours" and "employee is on statutory post-maternity reduced schedule" — both would be processed identically and would reduce `basePay` proportionally, which is incorrect: during post-maternity reduced schedule the employer cannot unilaterally dock pay.
- No override field like `postMaternityProtected` to force 100% basePay for a reduced-hours return.

### 2.7 Pumping breaks (חוק שעת הנקה, §7(ג)(3))

**Status:** NOT IMPLEMENTED (Medium / P2).

- §7(ג)(3) gives a mother returning to a full-time position the right to leave work one hour earlier for 4 months — paid as full workday. The overtime thresholds (lines 40-44) and `hourlyRate` formula (line 46) do not distinguish a 7.5-hour pumping day from a partial day. Anyone tracking `hoursWorked=7.5` is billed as a short workday, not a full day. Line 31 filter counts it as a present day, which is correct — but line 47 (`basePay = Math.min(daysWorked, WORK_DAYS) / WORK_DAYS * emp.baseSalary`) is day-based not hour-based, so the underpayment only shows up if the day is logged as `partial`. Either way, no explicit pumping-hour mechanism exists.
- No expiry (4 months from return), no tracking of `returnDate` at all.

### 2.8 Benefits continuity (pension, vacation accrual during leave)

**Status:** NOT IMPLEMENTED (Critical / P0).

- During the 15 paid weeks, **employer must continue pension + severance** contributions on the pre-leave gross (§7א חוק עבודת נשים). Lines 59-61 compute `penE`, `penR`, `sev` strictly from `gross`, and `gross` in turn is computed from `daysWorked` etc. — so an employee with zero worked days gets zero gross, zero pension contributions, zero severance accrual. Directly non-compliant.
- Vacation accrual (חוק חופשה שנתית §3) continues during maternity leave — the app has no vacation-accrual ledger at all (no `vacationBalance`, `vacationDaysAccrued`, or `annualQuota` fields on the employee entity).
- No constants for `MATERNITY_PAID_WEEKS=15`, `MATERNITY_TOTAL_WEEKS=26`, `PATERNITY_DAYS=5`, or `MAT_EXTENSION_MAX_YEARS=1`.

### 2.9 Bituach Leumi claim filing (דמי לידה)

**Status:** NOT IMPLEMENTED (Critical / P0).

- No export of the required "אישור מעסיק לעובדת בחופשת לידה" (BL/355).
- No calculation of the average gross of the prior 3 (or 6) calendar months to derive the daily maternity benefit (= ממוצע הכנסה חודשית × 3 / 90 or × 6 / 180).
- No API client, webhook, or file-drop toward Bituach Leumi at all.
- No tracking of claim status (pending / approved / rejected / paid).
- No offset logic: during the 15 BL-paid weeks, employer is **not** liable for salary but **is** liable for pension — the engine has no notion of "BL-paid period" versus "employer-paid period," so it will either overpay (paying salary on top of BL) or underpay (skipping pension). Both are legal violations.

---

## 3. Attendance-data-model gap summary

What the model currently has (`records` array, `att` key):

```js
{ id, empId, date, time, status, hoursWorked, createdAt }
```

What maternity handling would minimally require:

```js
// employee extensions
gender                      // for §6 vs §6(ח1) dispatch
parentalEvents: [{
  id, type,                 // "maternity"|"paternity"|"adoption"|"surrogacy"
  childBirthDate,
  leaveStartDate,
  leaveEndDate,             // maternity: start + 26w
  blPaidUntil,              // start + 15w
  extensionUntil,           // optional, ≤ start + 1y
  blClaimStatus,            // "pending"|"approved"|"paid"|"rejected"
  blClaimRef,               // BL/355 reference number
  avgGrossPriorMonths,      // snapshot, 6-month average
  partnerEmpId,             // for leave-transfer (§6(ח1))
  dismissalProtectedUntil,  // leave end + 60d
  reducedHoursUntil,        // return + 4 months
  pumpingEntitlementUntil,  // return + 4 months
  pensionContinuedBy,       // "employer-full"|"employer+employee"|"none"
}]
vacationBalance             // accrues during leave
seniorityMonths             // needed for extension cap
```

None of these fields exist.

---

## 4. Engine-level violations

| Line(s) | Violation | Severity |
|---|---|---|
| 27-80 | `autoCalcEmployee` ignores parental leave entirely; uses only present/absent/sick/vacation/reserve/partial | P0 |
| 47 | `basePay = daysWorked/WORK_DAYS * baseSalary` — fails during 15 BL-paid weeks (pays 0 instead of pension-only flow) | P0 |
| 59-61 | Pension + severance keyed off `gross` → zero contributions for an employee on leave → illegal under §7א | P0 |
| 67 | `daysAbsent > 3` anomaly fires false alerts for every maternity-leave employee | P2 |
| 69 | `gross < baseSalary * 0.7` anomaly likewise fires | P2 |
| 70 | `daysWorked === 0 && records.length === 0` — the alert text "אין דיווח נוכחות" incorrectly treats a legitimate leave as a data gap | P2 |
| 149-157 | `saveEmployee` permits flipping a protected employee to `active=false` with no guardrails → unchecked dismissal | P0 |
| 362 | Attendance status picker shows only 6 statuses — no maternity/paternity/adoption/pumping/extension option | P1 |
| 174 | `logEvent` in `clockAction` has no branch for parental leave events | P1 |
| 199-218 | `runPayroll` / `bulkAttendance` have no exclusion for protected employees | P1 |

---

## 5. Missing constants (should exist, do not)

```js
// Expected constants — NONE of these appear anywhere in the codebase
const MATERNITY_TOTAL_WEEKS = 26;
const MATERNITY_BL_PAID_WEEKS = 15;
const MATERNITY_EXTENSION_MAX_WEEKS = 52; // up to 1 year unpaid
const PATERNITY_BIRTH_DAYS = 5;
const PATERNITY_TRANSFER_WEEKS = 6;        // §6(ח1)
const POST_LEAVE_DISMISSAL_PROTECT_DAYS = 60;
const POST_LEAVE_REDUCED_HOURS_MONTHS = 4;
const PUMPING_HOUR_DURATION_MONTHS = 4;
const ADOPTION_CHILD_AGE_LIMIT = 10;
const BL_CLAIM_AVG_LOOKBACK_MONTHS = 6;    // or 3, depending on path
```

---

## 6. Risk assessment

| Risk | Likelihood | Impact | Score |
|---|---|---|---|
| Payroll underpays pension during leave → BL lawsuit | High | Critical | 10/10 |
| Unlawful dismissal of protected employee → criminal liability | High | Critical | 10/10 |
| BL דמי לידה claim unfileable from the system → employee loses income | High | Critical | 10/10 |
| Vacation accrual frozen illegally | High | High | 8/10 |
| Return-to-work reduced hours underpaid | Medium | High | 7/10 |
| Pumping-hour misapplied or missed | Medium | Medium | 5/10 |
| No adoption path → discrimination claim | Low | High | 6/10 |

Aggregate compliance score for this dimension: **0 / 100**. The dimension is effectively absent from the product.

---

## 7. Remediation roadmap (static recommendation)

1. **Data model** (P0): extend `emp` with `gender`, `parentalEvents[]`, `vacationBalance`, `seniorityMonths`.
2. **Attendance status enum** (P0): add `maternity`, `paternity`, `adoption`, `parental_unpaid`, `pumping_hour`.
3. **Payroll engine split** (P0): partition each month into three periods per employee — `workedPeriod`, `blPaidPeriod`, `unpaidProtectedPeriod`. For each:
   - `workedPeriod` → current formulas.
   - `blPaidPeriod` → `basePay = 0`, `penE = 0`, but `penR = prevGross * PEN_R`, `sev = prevGross * SEV`, vacation accrual +1/21 of monthly allowance per workday.
   - `unpaidProtectedPeriod` → everything 0 except `vacation accrual continues` for up to first 14 days, `seniority` continues.
4. **Constants block** (P0): add the ten constants listed in §5.
5. **Guards on `saveEmployee` / `active=false`** (P0): if the employee has an open `parentalEvent` whose `dismissalProtectedUntil > today`, refuse the deactivation and log `DISMISSAL_BLOCKED`.
6. **Anomaly suppression** (P1): when `parentalEvents` contains an open event covering the month, skip the three false-positive anomaly checks (lines 67, 69, 70).
7. **BL claim exporter** (P1): generate a BL/355-shaped JSON with the 6-month average gross computed from prior `runs`.
8. **Return-to-work hooks** (P2): auto-flag the first 4 months after `leaveEndDate` as `reducedHoursProtected=true`; enforce `basePay = full baseSalary` even when `hoursWorked < 8.5`.
9. **Pumping-hour mechanism** (P2): auto-add 1h to `hoursWorked` when `pumpingEntitlementUntil > date`.
10. **Tests** (P1): none exist — add unit tests for each parental-leave scenario before shipping.

---

## 8. QA verdict

- **Dimension pass/fail:** **FAIL** — 0 / 9 sub-dimensions implemented.
- **Blocker for production:** YES. A payroll product deployed in Israel without maternity-leave handling is not fit for purpose and exposes operators to criminal, civil, and BL-administrative liability.
- **Recommended next action:** treat the entire dimension as a new greenfield feature; reserve ~3-4 sprints of dedicated work plus legal review before go-live.
