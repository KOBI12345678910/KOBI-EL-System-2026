# QA-AGENT-90 — Vacation & Sick Days Tracking

**Project:** `payroll-autonomous`
**Date:** 2026-04-11
**Scope:** Static analysis only (read-only)
**Dimension:** מעקב חופשה, מחלה, מילואים, ימי חג
**Legal context:** Israeli labor law — חוק חופשה שנתית תשי"א-1951, חוק דמי מחלה תשל"ו-1976, חוק חיילים משוחררים, חוק שעות עבודה ומנוחה, חוק דמי מחלה (היעדרות בשל מחלת בן זוג/הורה/ילד)

---

## 1. Project footprint

The entire `payroll-autonomous` project is a minimal single-page React application:

| File | Lines | Role |
|---|---|---|
| `payroll-autonomous/src/App.jsx` | 578 | Entire app — UI, engine, storage, modal forms |
| `payroll-autonomous/src/main.jsx` | ~5 | React root |
| `payroll-autonomous/src/index.css` | — | Styling |
| `payroll-autonomous/package.json` | 21 | React 18.3 + Vite 5.4 only |
| `payroll-autonomous/vite.config.js` | — | Vite config |
| `payroll-autonomous/index.html` | — | HTML shell |

There are no additional modules, no services layer, no database schema, no tests, no utility files. All payroll logic lives inside `App.jsx` — chiefly in two functions: `autoCalcEmployee` (lines 27–80) and `autoCalcSub` (82–94).

---

## 2. Data model — what actually exists

### Employee entity (from form, lines 505–523)
```
name, role, idNumber, phone,
baseSalary, creditPoints, transport, bonus, overtime,
bankName, bankBranch, bankAccount, startDate,
hasPension, id, active, createdAt
```

**Critical observation:** there is no `vacationBalance`, no `sickBalance`, no `reserveBalance`, no `vacationUsed`, no `sickUsed`, no `carryOver`, no `lastAccrualDate`, no `yearlyQuota`, no `tenureYears`.

The field `startDate` is captured by the form (line 519) — but a grep across the file shows it is **never read anywhere in the calculation logic**, never compared to the current date, never converted to years of tenure (ותק), and never used to derive an accrual rate.

### Attendance entity (line 170)
```
{ id, empId, date, time, status, hoursWorked, createdAt }
```
Where `status ∈ {present, absent, sick, vacation, reserve, partial}` (see line 362).

This is a **flat event log** — one row per employee per day. No monthly or yearly aggregation table, no running-balance table, no reset-at-year-end mechanism.

### Storage keys (line 99)
```
KEYS = { emp, sub, att, jobs, runs, log }
```
No `balances`, no `accrual`, no `quotas` key. Nothing persists running vacation/sick/reserve totals.

---

## 3. Dimension-by-dimension findings

### 3.1 Vacation accrual per Israeli law (12–28 days based on tenure)

**Israeli law (חוק חופשה שנתית תשי"א-1951, §3 as amended 2016–2017):**
- Years 1–4: 12 working days (16 calendar)
- Year 5: 14 working days
- Year 6: 16 working days
- Year 7: 18 working days
- Year 8: 19 working days
- Year 9: 20 working days
- Year 10+: 20–28 working days (depending on tenure and work pattern, capped at 28)
For a 5-day work week the working-day counts are slightly lower.

**Implementation status: NOT IMPLEMENTED.**

- No constant, array or function encodes the 12→28 ladder. Grep for `12, 14, 16, 18, 20, 24, 28` returns only the tax-bracket constants (`{max:7010,...}` line 7), overtime thresholds (`hrs <= 12` line 42), and UI sizes — nothing vacation-related.
- `startDate` is captured (line 519) but never read. There is no `tenureYears`, no `accrualRate`, no `getVacationQuota(emp)`.
- The only thing the code does with vacation is count **used** days in the current month (`daysVacation = records.filter(r=>r.status==="vacation").length`, line 34) and pay for them (`vacPay = daysVacation * hourlyRate * 8.5`, line 50).
- `vacPay` is calculated at the **same hourly rate as regular work** and is simply **added to gross** (line 55). That means:
  - An employee on vacation is effectively paid **twice**: once via `basePay = daysWorked/WORK_DAYS * baseSalary` which already includes the monthly salary proration, and again via `vacPay`. More precisely, `basePay` uses only `daysWorked` (not vacation days) so it is prorated down — but then `vacPay` adds a full day's worth at hourly rate × 8.5, which is a materially different amount from (1/22) × monthly salary (the two are mathematically equal only if `WORK_HRS == WORK_DAYS × 8.5 = 187`, and the code defines `WORK_HRS = 186` — a small but real rounding drift).
- There is **no quota enforcement whatsoever** — an employee could be marked "vacation" for 365 days a year and the system would silently pay it.
- No distinction between paid vacation and unpaid vacation (חל"ת).

**Gap severity: CRITICAL.** The legal core of vacation tracking is entirely absent.

### 3.2 Carry-over rules (max 2 years)

**Israeli law (חוק חופשה שנתית §7):** unused vacation may be carried for up to 2 years. After that it is forfeited (except in specific exemptions).

**Implementation status: NOT IMPLEMENTED.**

- No year boundary handling. The app derives `month` / `year` only from `new Date()` (lines 126–127) and filters attendance by `monthKey = YYYY-MM` (line 28). There is no "yearly close" step.
- No `carryOver`, no `previousYearBalance`, no forfeiture logic, no "end of calendar year" event.
- `runPayroll` (lines 199–211) stores a `monthKey` snapshot in `runs[]` but never touches balances.
- Because no balance is ever stored, carry-over is undefined by construction.

**Gap severity: CRITICAL.**

### 3.3 Cash-out at resignation (פידיון חופשה)

**Israeli law (חוק חופשה שנתית §13):** on termination the employer must pay the employee for unused vacation days at the last daily rate.

**Implementation status: NOT IMPLEMENTED.**

- There is no "terminate employee" action. The only deactivation path is the × button at line 327: `const next = employees.map(x=>x.id===e.id ? {...x,active:false} : x)`. It sets `active=false`, logs `"עובד הושבת"`, and does nothing else.
- No termination date, no "final settlement" screen, no פידיון calculation, no call into a payroll-close function.
- No unused-balance computation (since there is no balance to begin with — see §3.1).
- Line 61 (`const sev = gross * SEV`) is severance pay (פיצויים) based on the monthly gross × 8.33%, not vacation cash-out.

**Gap severity: CRITICAL — legal liability.** Israeli employers who terminate without paying פידיון חופשה are exposed to claims in Beit Din LeAvoda (בית הדין לעבודה) and to wage-protection-law penalties (פיצויי הלנה).

### 3.4 Sick days accrual (1.5 days/month, max 90)

**Israeli law (חוק דמי מחלה תשל"ו-1976 §4):** employees accrue 1.5 sick days per month (18 per year) up to a cumulative maximum of 90 days.

**Implementation status: NOT IMPLEMENTED.**

- No constant `1.5`, no constant `90` anywhere in sick-day context. Grep for `90` returns nothing sick-related.
- No `sickBalance` field, no monthly accrual job, no cap enforcement.
- Only **usage** is tracked: `daysSick = records.filter(r=>r.status==="sick").length` (line 33) — and only for the current month.
- An employee could be marked sick for 90+ days and the system would pay every single one with no check.

**Gap severity: CRITICAL.**

### 3.5 Sick pay percentages (Day 1: 0%, Days 2–3: 50%, Day 4+: 100%)

**Israeli law (חוק דמי מחלה §2):**
- Day 1: 0% (no pay)
- Days 2–3: 50% of the daily wage
- Day 4 onward: 100% of the daily wage

**Implementation status: PARTIALLY IMPLEMENTED — WITH A CORRECTNESS BUG.**

Line 49:
```js
const sickPay = daysSick <= 1 ? 0
  : daysSick <= 3 ? hourlyRate*8.5*(daysSick-1)*0.5
  : hourlyRate*8.5*2*0.5 + hourlyRate*8.5*(daysSick-3);
```

Case analysis:

| `daysSick` | Formula result | Expected per law | Correct? |
|---|---|---|---|
| 0 | 0 | 0 | OK |
| 1 | 0 | 0 (day 1) | OK |
| 2 | `hr·8.5·1·0.5` = 0.5 day | 0.5 day (day 2) | OK |
| 3 | `hr·8.5·2·0.5` = 1.0 day | 1.0 day (days 2+3) | OK |
| 4 | `hr·8.5·2·0.5 + hr·8.5·1` = 2.0 days | 2.0 days (50%+50%+100%) | OK |
| 10 | `1.0 + 7·hr·8.5` = 8.0 days | 8.0 days | OK |

The math is actually correct **numerically** for the tier structure. However:

- **Bug 1 — rate basis.** The law requires sick pay based on the **regular daily wage** of the employee (including all fixed supplements — including seniority, cost-of-living, etc.). The code uses `baseSalary / WORK_HRS` only, ignoring `transport`, `bonus` and any fixed additions. For monthly salaried employees with significant fixed supplements, the sick-day rate is understated.
- **Bug 2 — 8.5-hour day assumption.** The daily wage is computed as `hourlyRate × 8.5`. Israeli law defines daily wage based on the employee's actual contracted workday, which may be 8.0, 9.0, or something else. The hard-coded 8.5 is not legally accurate.
- **Bug 3 — no cap.** Even at 100% the number of days paid is unbounded. Once the 90-day cumulative cap is reached the employee should not be paid anymore by the employer (they move to ביטוח לאומי or private). The code has no such check.
- **Bug 4 — no doctor's certificate requirement.** The law requires אישור מחלה for days 2+. Not tracked.
- **Bug 5 — sickPay added on top of basePay.** Sick days should be paid *instead* of a work day, not *in addition to* it. But since `basePay` uses `daysWorked` (not `daysWorked + daysSick`), the sick day is not already included — so adding `sickPay` is the right direction. However, the magnitude differs (see §3.1 Bug: `hourlyRate×8.5` vs `(1/22)×monthly`), creating a small systematic under- or over-payment depending on the relationship between `WORK_HRS=186` and `22×8.5=187`.

**Gap severity: HIGH.** The ladder shape is right; the base, cap, and supporting data are wrong.

### 3.6 Family illness days (חוק דמי מחלה — מחלת בן זוג/הורה/ילד)

**Israeli law:**
- Spouse (בן/בת זוג): up to 6 days/year, drawn from the employee's own sick balance (חוק דמי מחלה — היעדרות בשל מחלת בן זוג, תשנ"ח-1998)
- Parent (הורה): up to 6 days/year (חוק דמי מחלה — היעדרות בשל מחלת הורה, תשנ"ד-1993)
- Child (ילד) under 16: up to 8 days/year (more for single parents or serious illness) (חוק דמי מחלה — היעדרות בשל מחלת ילד, תשנ"ג-1993)
- Special allowances for serious illness and disability.

**Implementation status: NOT IMPLEMENTED AT ALL.**

- The attendance `status` enum has only 6 values: `present, absent, sick, vacation, reserve, partial` (line 362). There is no `spouse_sick`, `parent_sick`, `child_sick`, `family_sick`.
- There is no field for family-relation context on a day, no annual family-sick balance, no separation from the personal sick balance.
- If an employee takes time off to care for a sick child, they must currently be marked either as `sick` (wrong — consumes their own future sick quota incorrectly), `vacation` (wrong — wrong leave type) or `absent` (wrong — unpaid).

**Gap severity: HIGH.**

### 3.7 Reserve duty tracking (מילואים)

**Israeli law:** reserve duty is paid by ביטוח לאומי and fully reimbursed to the employer. The employer pays the employee their regular salary during reserve, then files a claim (טופס 5116 / תביעה למילואים) and receives the money back from ביטוח לאומי. Reserve days do not consume vacation or sick balance.

**Implementation status: PAY-THROUGH ONLY — NO TRACKING, NO REIMBURSEMENT.**

- `status === "reserve"` is recognized (lines 35, 362).
- `reservePay = daysReserve * hourlyRate * 8.5` (line 51) is added to gross (line 55), so the employee gets paid.
- However:
  - No reserve-day balance / annual tracking.
  - No ביטוח לאומי reimbursement tracking. The money paid to the employee is never marked as "to be reclaimed from NI." In the `erCost` formula (line 64) it simply becomes employer cost — exactly like regular salary. This **misstates the true employer cost** and **loses an accounts-receivable entry against ביטוח לאומי**.
  - No field for the צו קריאה (call-up order), start/end dates of the תקופת שירות, או מספר תיק ביטוח לאומי — all required for the reimbursement claim.
  - No way to distinguish "short-term" vs "long-term" reserve (which have different tax and reimbursement mechanics).
  - Tax treatment: reserve pay from NI has its own tax code (§9 of פקודת מס הכנסה). The code applies regular bracket tax to it as if it were salary. This is wrong and overstates the deduction.

**Gap severity: HIGH.** Functional (employee gets paid) but financially incorrect for the employer's books.

### 3.8 Public holidays handling (ימי חג)

**Israeli law:** employees who complete ≥3 months are entitled to up to 9 paid holidays per year (ראש השנה ×2, יום כיפור, סוכות ×2, פסח ×2, יום העצמאות, שבועות). Specific rules apply to workers who are NOT in the majority religion, and to shift workers.

**Implementation status: NOT IMPLEMENTED AT ALL.**

- No calendar of Jewish holidays. Grep returns nothing.
- No `isHoliday(date)` function, no HebCal integration, no list of 2026 holiday dates.
- No special attendance status for "holiday" — the enum has no `holiday` or `חג` value.
- If a Saturday or Tuesday is in fact a public holiday:
  - Employee marked `absent` → docked from `basePay` (lines 47, 31) and no supplement — legally wrong, should be paid.
  - Employee marked `present` → paid as a regular day, but the law entitles 150% or 200% for working on a holiday — missed.
  - No tracking at all if the month contains a Jewish holiday but the attendance log simply omits that day.
- The 3-month eligibility threshold (אחרי 3 חודשי עבודה) would require `startDate` comparison — and `startDate` is captured but never read (see §3.1).

**Gap severity: CRITICAL.** Public-holiday pay is mandatory and this is a common source of wage claims.

---

## 4. Cross-cutting defects

| # | Defect | File:Line | Severity |
|---|---|---|---|
| D1 | `startDate` captured but never consumed — no tenure, no accrual, no eligibility | App.jsx:519 (form), App.jsx:27–80 (engine) | CRITICAL |
| D2 | No balance tables at all (vacation / sick / reserve / family-sick) | App.jsx:99 (KEYS) | CRITICAL |
| D3 | No year-boundary close / reset / carry-over | entire file | CRITICAL |
| D4 | No termination / resignation flow → no פידיון חופשה | App.jsx:327 | CRITICAL |
| D5 | `vacPay` uses `hourlyRate × 8.5` not `(1/22) × monthly` → drift vs basePay proration | App.jsx:50 | HIGH |
| D6 | Sick pay base excludes fixed supplements (transport, bonus) | App.jsx:49 | HIGH |
| D7 | Sick pay has no 90-day cap | App.jsx:49 | HIGH |
| D8 | Reserve pay not flagged as NI-reimbursable → wrong erCost | App.jsx:51, 64 | HIGH |
| D9 | Reserve day taxed as regular salary (wrong §9 treatment) | App.jsx:56 | MEDIUM |
| D10 | No holiday calendar, no holiday-pay premium | entire file | CRITICAL |
| D11 | No family-sick statuses (spouse/parent/child) | App.jsx:362 | HIGH |
| D12 | Attendance storage is event-stream only; no aggregation → O(n) per calc, will not scale | App.jsx:27–35 | MEDIUM |
| D13 | No auditability: a user can retroactively edit any past `attendance` row; no immutable ledger | App.jsx:169–176 | HIGH |
| D14 | `bulkAttendance` wipes today's records without confirmation — can destroy legitimate entries | App.jsx:213–219 | MEDIUM |
| D15 | `daysVacation` / `daysSick` counters are unbounded in the UI — no "days remaining" indicator | App.jsx:466 | MEDIUM |
| D16 | No separation between paid and unpaid absence (חל"ת vs חופשה רגילה) | App.jsx:362 | MEDIUM |

---

## 5. Specific correctness walk-throughs

### 5.1 Vacation pay double-count check

Given employee with `baseSalary = 10,000`, `daysWorked = 18`, `daysVacation = 4`, `WORK_DAYS = 22`, `WORK_HRS = 186`:
- `basePay = 18/22 × 10,000 = 8,181.82`
- `hourlyRate = 10,000/186 = 53.76`
- `vacPay = 4 × 53.76 × 8.5 = 1,827.96`
- `basePay + vacPay = 10,009.78`

Expected legal result: **10,000** exactly (a month with 4 vacation days and 18 work days is a full paid month).

The system overpays by **9.78** per month for this case. Over a 12-month period this is a ~117 ILS drift — not catastrophic, but systematic. The drift changes sign and magnitude with different `daysVacation` / `daysWorked` combinations and is a direct consequence of `WORK_HRS=186` vs `22×8.5=187`.

### 5.2 Sick-pay tier check at daysSick=5

- Expected: day 1 at 0, days 2–3 at 50%, days 4–5 at 100% ⇒ `0 + 2×0.5 + 2×1.0 = 3.0 daily-wage units`
- Code: `hourlyRate*8.5*2*0.5 + hourlyRate*8.5*(5-3) = hr·8.5·(1 + 2) = 3.0 daily-wage units` ✓

The math matches. Only the base and cap are wrong (see §3.5).

### 5.3 Reserve pay double-count check

Same issue as vacation: `basePay` is prorated down by not counting reserve days as worked, then `reservePay` is added on top at `hourlyRate × 8.5` — same 186-vs-187 drift.

### 5.4 Bulk attendance destructive path

```js
const bulkAttendance = async(status) => {
  const recs = employees.filter(e=>e.active!==false).map(e=>({...}));
  const filtered = attendance.filter(a=>!recs.some(r=>r.empId===a.empId && r.date===a.date));
  const next = [...filtered,...recs];
  ...
}
```
This deletes any existing record for today for each active employee and replaces with the new bulk status. If the user had already marked employee A as `sick` this morning and then clicks "כולם נוכחים" this afternoon, employee A's sick record is silently lost. No undo, no confirm dialog, no log entry identifying what was overwritten.

---

## 6. What IS implemented (the positive side)

To be fair to the code, it does have:

1. An attendance status enum that includes `sick`, `vacation`, `reserve` — the basic categorical vocabulary exists.
2. A working sick-pay tier formula that is numerically correct for the 0/50/100 ladder shape.
3. Reserve pay that at least reaches the employee (wage-protection law compliance at the minimum level).
4. A `startDate` field in the employee form (unused, but at least captured for future use).
5. An event log (`KEYS.log`, line 99) that records attendance changes with timestamp and actor-free string — usable as a weak audit trail.
6. A clean single function (`autoCalcEmployee`) to extend — the refactor surface is small.

---

## 7. Recommendations (priority-ordered)

### Must fix (legal exposure)
1. **Add balance persistence.** New storage key `KEYS.balances` with per-employee `{vacationUsed, vacationAccrued, sickUsed, sickAccrued, reserveUsed, familySickUsed, lastAccrualDate, carryOverFromPrev}`.
2. **Implement accrual engine.** Monthly cron (or on-login check): for each active employee, compare `today - lastAccrualDate`, add `1.5` to `sickAccrued` (capped at 90), add `getVacationRate(tenure)/12` to `vacationAccrued`. Tenure from `startDate`.
3. **Implement `getVacationRate(tenureYears)`** per §3 of חוק חופשה שנתית, returning 12/14/16/18/19/20/…/28.
4. **Enforce quotas.** Before marking an attendance row as `vacation` / `sick` / `family_sick`, check the balance; refuse or warn if insufficient.
5. **Termination flow.** Add "סיום העסקה" action that computes `פידיון חופשה = remainingVacation × dailyRate`, writes a final slip, and deactivates.
6. **Year-end close.** On January 1: move current-year unused vacation to `carryOverLast2Years[]`, drop entries older than 2 years. No action on sick (90-day is cumulative, not yearly).
7. **Public-holiday calendar.** Bundle a 2026 ISO list of Jewish holidays; in `autoCalcEmployee`, iterate month days, detect holidays, force-pay them as `isHoliday=true` whether or not an attendance row exists; if one exists and `status=present`, apply 150% premium.

### Should fix (correctness)
8. Add family-sick statuses to the enum: `spouse_sick`, `parent_sick`, `child_sick` with separate annual caps (6/6/8) and shared deduction from the personal sick balance per law.
9. Tag `reservePay` as `reimbursableFromNI` and exclude it from `erCost` (or at least track it as a receivable).
10. Replace `hourlyRate * 8.5` with `(1/workDaysInMonth) * monthlyBase` for vacation/sick/reserve day pay, OR fix `WORK_HRS` to `22 × 8.5 = 187` to eliminate the drift.
11. Include fixed supplements (`transport`, `bonus`, `seniority`) in the sick/vacation day rate base.
12. Add `doctorCertificateUrl` (or just boolean) to sick attendance rows for days ≥2.

### Nice to have (quality)
13. Monthly aggregate table so `autoCalcEmployee` doesn't re-scan all attendance rows every render.
14. Immutable ledger for attendance edits (append-only, with correction rows).
15. `confirm()` dialog on `bulkAttendance`.
16. UI display: "ימי חופשה נותרים", "ימי מחלה נותרים", "ימי מילואים ששולמו השנה".

---

## 8. Test coverage

There are no tests of any kind in the `payroll-autonomous` project. No `*.test.*`, no `__tests__/`, no `vitest`, no `jest` in `package.json` (lines 13–21 list only React + Vite).

Recommendations for minimal unit tests to add alongside the fixes above:
- `getVacationRate(0) === 12`, `getVacationRate(4) === 12`, `getVacationRate(5) === 14`, …, `getVacationRate(25) === 28`.
- `sickPay(0) === 0`, `sickPay(1) === 0`, `sickPay(2) === 0.5`, `sickPay(3) === 1.0`, `sickPay(4) === 2.0`.
- `accrualAfterMonth({sickAccrued: 89})` caps at 90.
- `vacationPlusBase(18 work, 4 vac)` equals monthly base exactly.
- `terminate(emp, {remainingVac: 14, dailyRate: 500})` generates final slip with `7000` for פידיון.
- `holidayCalc(2026-04-02)` (passover) returns `isHoliday: true`.

---

## 9. Overall verdict

**The `payroll-autonomous` project does not implement vacation & sick day tracking in any meaningful sense.** It has a flat event log of per-day attendance statuses and a numerically-almost-correct sick-pay tier formula. That is it. Every other leg of the Israeli legal framework — accrual, quotas, carry-over, cash-out, holidays, family-sick, reserve reimbursement — is entirely missing.

**Risk classification: CRITICAL — do not use in production for real Israeli employees.** An employer running payroll with this engine would be non-compliant with חוק חופשה שנתית, חוק דמי מחלה, and holiday-pay rules, and would face back-pay exposure in wage-protection claims.

The codebase is small (578 lines total) and cleanly organized, so the remediation cost is modest: an estimated 300–500 lines of additional code centered around a new `balances` persistence layer, an `accrual` engine invoked on month/year boundaries, a holiday calendar constant, and a termination flow. No architectural rewrite is required.

---

**File references:**
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\payroll-autonomous\src\App.jsx`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\payroll-autonomous\package.json`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\payroll-autonomous\src\main.jsx`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\payroll-autonomous\src\index.css`
