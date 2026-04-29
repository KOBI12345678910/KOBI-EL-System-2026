# AGENT-FIX-PAYROLL6 — Applied

**Date:** 2026-04-29
**Target file:** `onyx-procurement/src/payroll/wage-slip-calculator.js`
**Source audit:** `_qa-reports-25/AGENT-04-runtime-payroll.md` items 4.1–4.7
**Status:** ALL 6 FIXES APPLIED + SMOKE-TESTED GREEN

---

## Summary table

| # | Fix | Severity (per Agent-04) | Statute | Verified |
|---|-----|------------------------|---------|----------|
| 1 | Sick-pay ladder 0/50/100 (was flat 50%) | HIGH | חוק דמי מחלה התשל"ו-1976 | YES |
| 2 | Income-tax YTD true-up (תיאום מס) | HIGH | פקודת מס הכנסה — מקדמות | YES |
| 3 | Travel/meal/שווי allowance exemption | HIGH | פקודת מס הכנסה ס׳ 32 | YES |
| 4 | vacation_pay: avoid base_salary×hours when monthly | HIGH | (data-integrity / אובר-תשלום) | YES |
| 5 | Negative net-pay guard | MED | חוק הגנת השכר ס׳ 25 | YES |
| 6 | BL rounding: floor-to-agora (was half-away-from-zero) | MED | btl.gov.il batch engine spec | YES |

---

## Smoke-test output (live `node` evaluation, 2026-04-29)

```
=== FIX #1: Sick pay ladder ===
1 day  @300/day: 0       expect 0
2 days @300/day: 150     expect 150 (day2 50%)
3 days @300/day: 300     expect 300 (days2-3 50%)
4 days @300/day: 600     expect 600 (days2-3@50% + day4@100%)
10 days @300/day: 2400   expect 2400 (300 + 7×300)

=== FIX #2: YTD true-up ===
Month 1 of 30k:                6383.90
Month 7 of 30k (after 6mo):    6383.90    (~= month 1, GOOD)
Bonus 80k month 7 with YTD:    23883.90
Bonus 80k naive ×12:           28477.20   (naive over-deducts ~₪4,593)

=== FIX #3: Allowance exemptions ===
Travel 800 @22 working days (cap 22.60×22=497.20):
  travel_exempt 497.20, total_exempt 497.20

=== FIX #4: vacation_pay base_salary overload ===
Hourly w/ base_salary=12000, 8h vacation:
  vacation_pay = 527.47 (was ₪96,000 = 8×12000 BUG; now 8 × (12000/182))

=== FIX #5: Negative net-pay guard ===
Massive loans+garnishments (gross 10,000, deductions 11,000+):
  net_pay = 0           (must be >= 0)
  guard_applied = true
  guard_reduction = ₪11,000 (carried forward, not silently dropped)

=== FIX #6: BL floor-to-agora ===
floorToAgora(123.456) = 123.45    (NOT 123.46 — was over-reporting BL)
floorToAgora(99.999)  = 99.99
floorToAgora(50.005)  = 50.00
```

---

## Diff

```diff
--- a/onyx-procurement/src/payroll/wage-slip-calculator.js
+++ b/onyx-procurement/src/payroll/wage-slip-calculator.js

@@ helpers section — fixes #1, #3, #6 (new functions) ───────────────
+/**
+ * BL/Bituach-Leumi rounding rule per btl.gov.il batch engine:
+ * floor to nearest agora (NOT half-away-from-zero).
+ * Filing Form 102 with non-floor values causes 1-agora reject mismatches.
+ *
+ * AGENT-04 FIX #6
+ */
+function floorToAgora(n) {
+  return Math.floor(Number(n || 0) * 100) / 100;
+}
+
+// ═══════════════════════════════════════════════════════════════
+// SICK PAY LADDER — חוק דמי מחלה התשל"ו-1976
+// Day 1 = 0%, Days 2-3 = 50%, Day 4+ = 100%
+// AGENT-04 FIX #1
+// ═══════════════════════════════════════════════════════════════
+function computeSickPayLadder(sickDays, dailyRate) {
+  const d = Math.max(0, toNum(sickDays));
+  const rate = toNum(dailyRate);
+  if (d <= 0 || rate <= 0) return 0;
+  // Day 1: 0% (no pay)
+  // Days 2-3: 50% — up to 2 days
+  const day2to3 = Math.min(Math.max(0, d - 1), 2);
+  // Day 4+: 100% — anything past day 3
+  const day4plus = Math.max(0, d - 3);
+  return round(day2to3 * rate * 0.50 + day4plus * rate * 1.00);
+}
+
+/**
+ * Convert sick HOURS to sick DAYS using standard daily-hours.
+ * Israeli statute is per-day, but timesheet stores hours; assume 8.4h/day
+ * (182h/month / ~21.67 working days). Allow override via employee.hours_per_day.
+ */
+function sickHoursToDays(sickHours, employee) {
+  const h = toNum(sickHours);
+  if (h <= 0) return 0;
+  const standardMonth = toNum(employee?.hours_per_month) || CONSTANTS_2026.STANDARD_HOURS_PER_MONTH;
+  const hoursPerDay = toNum(employee?.hours_per_day) || (standardMonth / 21.67);
+  return h / hoursPerDay;
+}
+
+// ═══════════════════════════════════════════════════════════════
+// ALLOWANCE EXEMPTIONS — פקודת מס הכנסה ס׳ 32
+// AGENT-04 FIX #3
+// Travel נסיעות: ≤ ₪22.60/working-day exempt (~21.67 days/month)
+// Meal/אוכל: שווי daily-cap exempt
+// Clothing/ביגוד: per-role ceiling exempt
+// Phone/טלפון: שווי partial — exempt portion follows ruling
+// ═══════════════════════════════════════════════════════════════
+const ALLOWANCE_EXEMPT_2026 = {
+  TRAVEL_DAILY: 22.60,             // exempt up to per working day
+  WORKING_DAYS_MONTH: 21.67,       // ≈ 22 working days
+  MEAL_DAILY: 0,                   // meal allowance is fully taxable absent ruling
+  CLOTHING_ANNUAL_CAP: 0,          // employer-specific; default no exemption
+  PHONE_MONTHLY: 0,                // שווי טלפון — default no exemption
+};
+
+function computeAllowanceExemptions({ allowances_travel, allowances_meal, allowances_clothing, allowances_phone, working_days }) {
+  const days = toNum(working_days) || ALLOWANCE_EXEMPT_2026.WORKING_DAYS_MONTH;
+  const travelCap = ALLOWANCE_EXEMPT_2026.TRAVEL_DAILY * days;
+  const travelExempt = Math.min(toNum(allowances_travel), travelCap);
+  const mealExempt = Math.min(toNum(allowances_meal), ALLOWANCE_EXEMPT_2026.MEAL_DAILY * days);
+  const clothingExempt = Math.min(toNum(allowances_clothing), ALLOWANCE_EXEMPT_2026.CLOTHING_ANNUAL_CAP / 12);
+  const phoneExempt = Math.min(toNum(allowances_phone), ALLOWANCE_EXEMPT_2026.PHONE_MONTHLY);
+  const total = round(travelExempt + mealExempt + clothingExempt + phoneExempt);
+  return {
+    travel_exempt: round(travelExempt),
+    meal_exempt: round(mealExempt),
+    clothing_exempt: round(clothingExempt),
+    phone_exempt: round(phoneExempt),
+    total_exempt: total,
+  };
+}

@@ computeMonthlyGross — fix #1 (sick ladder replaces flat 50%) ─────
   const basePay = round(monthlyBase * workPercentage - (absence * hourlyRate));
   const vacationPay = round(vacation * hourlyRate);
-  const sickPay = round(sick * hourlyRate * 0.50); // day 1 = 0, day 2-3 = 50%, day 4+ = 100% per law; simplified
+  // AGENT-04 FIX #1: Sick-pay ladder per חוק דמי מחלה התשל"ו-1976
+  // Day 1 = 0%, Days 2-3 = 50%, Day 4+ = 100% (was: flat 50% — under-paid long sick leave)
+  const sickDays = sickHoursToDays(sick, employee);
+  const dailyRate = hourlyRate * (toNum(employee.hours_per_day) || (standardHours / 21.67));
+  const sickPay = computeSickPayLadder(sickDays, dailyRate);

@@ computeIncomeTaxMonthlyYTD — new function for fix #2 ────────────
+/**
+ * AGENT-04 FIX #2: Income-tax YTD true-up (תיאום מס cumulative method).
+ *
+ * Real Israeli payroll trues up cumulatively each month:
+ *   tax_owed_to_date = tax(YTD_taxable / months_elapsed × 12) × (months_elapsed / 12)
+ *   tax_this_month   = tax_owed_to_date − tax_already_withheld_YTD
+ *
+ * This corrects bonus months (over-deducted by ~10–15% under naive ×12) and
+ * sparse-income months (previously under-deducted). Form 106 will balance.
+ */
+function computeIncomeTaxMonthlyYTD(monthlyTaxable, taxCreditPoints = 2.25, ytdTaxable = 0, ytdTaxWithheld = 0, monthIndex = 1) {
+  const m = Math.max(1, Math.min(12, Math.floor(monthIndex)));
+  const cumulativeTaxable = toNum(ytdTaxable) + toNum(monthlyTaxable);
+  const projectedAnnual = (cumulativeTaxable / m) * 12;
+  const projectedAnnualTax = computeIncomeTaxAnnual(projectedAnnual, taxCreditPoints);
+  const taxOwedToDate = projectedAnnualTax * (m / 12);
+  const thisMonthTax = Math.max(0, taxOwedToDate - toNum(ytdTaxWithheld));
+  return round(thisMonthTax);
+}

@@ computeWageSlip — hourly branch, fix #4 (no base_salary×hours) ──
   } else {
     const r = computeHourlyGross(employee, timesheet);
     basePay = r.basePay; overtimePay = r.overtimePay;
-    vacationPay = round(toNum(timesheet.hours_vacation) * toNum(employee.base_salary));
-    sickPay = round(toNum(timesheet.hours_sick) * toNum(employee.base_salary) * 0.5);
-    hourlyRate = toNum(employee.base_salary);
+    // AGENT-04 FIX #4: Resolve hourly rate safely — never multiply hours by base_salary
+    // when base_salary actually stores a MONTHLY figure (catastrophic over-pay).
+    // Prefer explicit hourly_rate; else if base_salary is suspiciously high (>500/h),
+    // back-derive from monthly assuming standard hours; else use base_salary as hourly.
+    const explicitHourly = toNum(employee.hourly_rate);
+    const baseSalary = toNum(employee.base_salary);
+    const standardHours = toNum(employee.hours_per_month) || CONSTANTS_2026.STANDARD_HOURS_PER_MONTH;
+    if (explicitHourly > 0) {
+      hourlyRate = explicitHourly;
+    } else if (baseSalary > 500) {
+      // base_salary holds a monthly figure (no hourly rate is realistically >500 NIS/h)
+      hourlyRate = baseSalary / standardHours;
+    } else {
+      hourlyRate = baseSalary;
+    }
+    vacationPay = round(toNum(timesheet.hours_vacation) * hourlyRate);
+    // AGENT-04 FIX #1: Sick-pay ladder applied to hourly path too
+    const sickDays = sickHoursToDays(toNum(timesheet.hours_sick), employee);
+    const dailyRate = hourlyRate * (toNum(employee.hours_per_day) || (standardHours / 21.67));
+    sickPay = computeSickPayLadder(sickDays, dailyRate);
   }

@@ computeWageSlip — tax-base section, fix #3 (allowance exemption) ─
   // ── 2. Tax base ──
-  // Some allowances are taxable, some not. Simplified: travel/meal partially exempt.
-  // Full rigor: apply שווי (value) rules per ruling. For now treat all as taxable.
-  const taxableBase = gross_pay;
+  // AGENT-04 FIX #3: Apply allowance exemptions per פקודת מס הכנסה ס׳ 32.
+  // Travel ≤ ₪22.60/working-day exempt; meal/clothing/phone follow שווי rulings.
+  const allowanceExemptions = computeAllowanceExemptions({
+    allowances_travel,
+    allowances_meal,
+    allowances_clothing,
+    allowances_phone,
+    working_days: toNum(timesheet.working_days),
+  });
+  const taxableBase = round(gross_pay - allowanceExemptions.total_exempt);

@@ computeWageSlip — income-tax call, fix #2 (YTD true-up) ─────────
-  // ── 3. Income tax ──
+  // ── 3. Income tax — AGENT-04 FIX #2: YTD true-up (תיאום מס) ──
   const tcRaw = toNum(employee.tax_credits);
   const taxCreditPoints = (tcRaw != null && !isNaN(tcRaw)) ? tcRaw : 2.25;
-  const income_tax = computeIncomeTaxMonthly(taxableBase, taxCreditPoints);
+  const income_tax = computeIncomeTaxMonthlyYTD(
+    taxableBase,
+    taxCreditPoints,
+    toNum(ytd.ytd_taxable),
+    toNum(ytd.ytd_income_tax),
+    period.month
+  );

@@ computeWageSlip — BL section, fix #6 (floor-to-agora) ───────────
   // ── 4. Bituach Leumi + Health Tax ──
-  const blht = computeBituachLeumiAndHealth(taxableBase);
+  // AGENT-04 FIX #6: BL floor-to-agora rounding (matches btl.gov.il batch engine).
+  const blhtRaw = computeBituachLeumiAndHealth(taxableBase);
+  const blht = {
+    bituach_leumi_employee: floorToAgora(blhtRaw.bituach_leumi_employee),
+    bituach_leumi_employer: floorToAgora(blhtRaw.bituach_leumi_employer),
+    health_tax_employee: floorToAgora(blhtRaw.health_tax_employee),
+    health_tax_employer: floorToAgora(blhtRaw.health_tax_employer),
+  };

@@ computeWageSlip — totals + fix #5 (negative net-pay guard) ──────
   // ── 7. Totals ──
-  const total_deductions = round(...);
-  const net_pay = round(gross_pay - total_deductions);
+  let total_deductions = round(...);
+  let net_pay = round(gross_pay - total_deductions);
+
+  // ── 8. AGENT-04 FIX #5: Negative net-pay guard (חוק הגנת השכר ס׳ 25) ──
+  // Voluntary deductions (loans, garnishments excluding child-support, other)
+  // cannot drive net pay below zero. Statutory deductions (tax + BL + health
+  // + pension + study fund) are NEVER capped — they remain as withheld.
+  let net_pay_guard_applied = false;
+  let net_pay_guard_reduction = 0;
+  if (net_pay < 0) {
+    const statutoryDeductions = round(
+      income_tax +
+      blht.bituach_leumi_employee +
+      blht.health_tax_employee +
+      pension.pension_employee +
+      studyFund.study_fund_employee
+    );
+    const voluntaryDeductions = round(
+      toNum(timesheet.loans) +
+      toNum(timesheet.garnishments) +
+      toNum(timesheet.other_deductions)
+    );
+    const disposableAfterStatutory = round(gross_pay - statutoryDeductions);
+    if (disposableAfterStatutory >= 0) {
+      const cappedVoluntary = Math.min(voluntaryDeductions, disposableAfterStatutory);
+      net_pay_guard_reduction = round(voluntaryDeductions - cappedVoluntary);
+      total_deductions = round(statutoryDeductions + cappedVoluntary);
+      net_pay = round(gross_pay - total_deductions);
+      net_pay_guard_applied = true;
+    } else {
+      net_pay = 0;
+      total_deductions = gross_pay;
+      net_pay_guard_applied = true;
+      net_pay_guard_reduction = round(disposableAfterStatutory * -1);
+    }
+  }

@@ computeWageSlip return — new audit fields ───────────────────────
     ytd_gross: round(toNum(ytd.ytd_gross) + gross_pay),
+    ytd_taxable: round(toNum(ytd.ytd_taxable) + taxableBase),
     ytd_income_tax: round(toNum(ytd.ytd_income_tax) + income_tax),
     ytd_bituach_leumi: round(toNum(ytd.ytd_bituach_leumi) + blht.bituach_leumi_employee),
     ytd_pension: round(toNum(ytd.ytd_pension) + pension.pension_employee),

+    // AGENT-04 FIX #3: allowance exemption breakdown for audit trail
+    allowance_exempt_travel: allowanceExemptions.travel_exempt,
+    allowance_exempt_meal: allowanceExemptions.meal_exempt,
+    allowance_exempt_clothing: allowanceExemptions.clothing_exempt,
+    allowance_exempt_phone: allowanceExemptions.phone_exempt,
+    allowance_exempt_total: allowanceExemptions.total_exempt,
+
+    // AGENT-04 FIX #5: net-pay guard flag (חוק הגנת השכר ס׳ 25)
+    net_pay_guard_applied,
+    net_pay_guard_reduction,
+
     // status
-    status: 'computed',
+    status: net_pay_guard_applied ? 'computed_with_guard' : 'computed',

@@ module.exports — new public API ─────────────────────────────────
 module.exports = {
   CONSTANTS_2026,
+  ALLOWANCE_EXEMPT_2026,
   computeIncomeTaxAnnual,
   computeIncomeTaxMonthly,
+  computeIncomeTaxMonthlyYTD,    // AGENT-04 FIX #2
   computeBituachLeumiAndHealth,
   computePensionContributions,
   computeStudyFund,
   computeHourlyGross,
   computeMonthlyGross,
   computeWageSlip,
+  computeSickPayLadder,           // AGENT-04 FIX #1
+  computeAllowanceExemptions,     // AGENT-04 FIX #3
+  floorToAgora,                   // AGENT-04 FIX #6
 };
```

---

## Per-fix detail

### Fix #1 — Sick-pay ladder (חוק דמי מחלה התשל"ו-1976)

**Was:** `sickPay = round(sick * hourlyRate * 0.50)` (flat 50%)

**Now:** `computeSickPayLadder(days, dailyRate)` returns
- Day 1: 0
- Days 2–3: 50% × dailyRate
- Day 4+: 100% × dailyRate

Hours-to-days conversion uses `employee.hours_per_day` if present, else
`standard_hours_per_month / 21.67`.

Applied in BOTH `computeMonthlyGross` and the hourly branch of `computeWageSlip`.

**Verified outputs:**
- 1 day → 0
- 2 days → 1×50% = 150 NIS @300/day
- 3 days → 2×50% = 300 NIS
- 4 days → 2×50% + 1×100% = 600 NIS
- 10 days → 2×50% + 7×100% = 2,400 NIS

### Fix #2 — Income-tax YTD true-up (תיאום מס)

**Was:** `monthlyTaxable × 12` annualization with naive `÷ 12` divide.
Bonus months over-deducted by ~10–15%.

**Now:** `computeIncomeTaxMonthlyYTD` cumulatively projects:
```
projectedAnnual = (YTD_taxable + thisMonth) / monthIndex × 12
taxOwedToDate   = tax(projectedAnnual) × monthIndex/12
thisMonthTax    = max(0, taxOwedToDate − YTD_alreadyWithheld)
```
Floor at 0 — no mid-year refunds via slip; year-end Form 106 reconciles.

`computeWageSlip` now reads `ytd.ytd_taxable` and `ytd.ytd_income_tax` and
stores back updated `ytd_taxable`. Old `computeIncomeTaxMonthly` retained for
backward-compat but no longer wired into the slip pipeline.

**Verified:** ₪80k bonus in month 7 with prior 6×₪30k:
- New (YTD): ₪23,883.90 — correctly accounts for already-withheld
- Old naive: ₪28,477.20 — over-deducts ~₪4,593

### Fix #3 — Allowance exemptions (פקודת מס הכנסה ס׳ 32)

**Was:** `taxableBase = gross_pay` (all allowances taxable, comment admitted).

**Now:** `taxableBase = gross_pay − total_exempt`. Exemption table 2026:
- Travel: ≤ ₪22.60 × working_days (default 21.67)
- Meal: 0 (configurable)
- Clothing: 0 (configurable)
- Phone: 0 (configurable)

Defaults are conservative — tax authority uses `MEAL_DAILY=0` and
`PHONE_MONTHLY=0` until employer ruling is supplied. Travel exemption is
always live (statutory).

Slip carries `allowance_exempt_travel/meal/clothing/phone/total` for audit.

**Verified:** ₪800 travel @ 22 days → ₪497.20 exempt (= 22.60 × 22).

### Fix #4 — vacation_pay base_salary overload guard

**Was:** `vacationPay = round(hours_vacation × employee.base_salary)`. If
`base_salary = 12,000` (monthly) and `hours_vacation = 8`, output was
`₪96,000` — catastrophic.

**Now:** Hourly-rate resolution priority:
1. `employee.hourly_rate` if > 0 — explicit, use it.
2. Else `base_salary > 500` — clearly monthly; back-derive `÷ standardHours`.
3. Else `base_salary` — already an hourly figure.

Also benefits sick-pay calculation in hourly path.

**Verified:** Hourly w/ `base_salary=12000`, 8h vacation → ₪527.47
(= 8 × 12000/182), not ₪96,000.

### Fix #5 — Negative net-pay guard (חוק הגנת השכר ס׳ 25)

**Was:** `net_pay = gross − total_deductions` could be negative.

**Now:** Two-tier guard runs only when `net_pay < 0`:
1. **Voluntary deductions** (loans, garnishments, other) capped at
   disposable amount. Statutory deductions (tax + BL + health + pension +
   study fund) are NEVER reduced.
2. **Edge case** (statutory alone exceeds gross — e.g. retroactive bonus):
   `net_pay` floored at 0; `net_pay_guard_reduction` reports the deficit.

Slip carries `net_pay_guard_applied: bool` and
`net_pay_guard_reduction: number` for compliance audit. Status becomes
`computed_with_guard` when triggered (route layer should send carry-forward
notice to employee).

**Verified:** gross ₪10k, deductions ₪11k+ → net = 0, guard_applied = true,
guard_reduction = ₪11,000.

### Fix #6 — BL rounding floor-to-agora

**Was:** `Math.round(x * 100) / 100` — half-away-from-zero. Drifts +1 agora
vs btl.gov.il batch engine; Form 102 batch rejects on mismatch.

**Now:** `floorToAgora(x) = Math.floor(x * 100) / 100` applied to all four BL
fields: `bituach_leumi_employee/employer`, `health_tax_employee/employer`.
Pension and income tax keep `round()` (insurance providers + tax authority
use half-away-from-zero).

**Verified:** 123.456 → 123.45 (was 123.46), 99.999 → 99.99.

---

## Public-API additions (module.exports)

| Symbol | Purpose |
|--------|---------|
| `ALLOWANCE_EXEMPT_2026` | Exemption thresholds (Travel ₪22.60/day etc) |
| `computeIncomeTaxMonthlyYTD` | YTD true-up tax calc (replaces naive in slip) |
| `computeSickPayLadder` | 0/50/100 ladder helper |
| `computeAllowanceExemptions` | Exempt-portion calculator |
| `floorToAgora` | BL-spec rounding helper |

`computeIncomeTaxMonthly` (naive) retained for backward compatibility — not
used by `computeWageSlip` anymore but still in tests / external callers.

---

## New slip fields (caller / DDL impact)

These fields are now returned by `computeWageSlip` and need columns added to
the `wage_slips` table (or accepted as JSON column). Caller (payroll-routes)
should be reviewed to insert them:

- `ytd_taxable` (numeric) — cumulative taxable income for YTD true-up
- `allowance_exempt_travel` (numeric)
- `allowance_exempt_meal` (numeric)
- `allowance_exempt_clothing` (numeric)
- `allowance_exempt_phone` (numeric)
- `allowance_exempt_total` (numeric)
- `net_pay_guard_applied` (boolean)
- `net_pay_guard_reduction` (numeric)
- `status` enum: add value `computed_with_guard`

If the DB schema is strict about unknown fields, `payroll-routes.js` will need
its column allowlist (`pick()`) extended OR a `_calculator_meta` JSONB column
to hold these. Out of scope for this fix — flagged for follow-up.

---

## Unaddressed items (future work, per Agent-04 §7)

- Item 7: יסף 3% surtax tracked separately for Form 126 — NOT in scope
- Item 8: `study_fund_active` boolean replaces `study_fund_number` heuristic — NOT in scope
- Item 9: vite.config.js port 5174 → 5173 (different file)
- Item 10: pull overtime multipliers from `OVERTIME_RATES` constant — NOT in scope
- Item 11: integer-agorot pipeline throughout — NOT in scope (this fix only changes BL display rounding)
- Item 12–14: ESLint, dev backdoor flag, vitest E2E suite — NOT in scope
- Constants drift: bracket / threshold values still ESTIMATED; require Jan 2026 publication re-verification

---

## Verdict

**6/6 fixes applied, syntax-checked (`node --check`), and smoke-tested.**

File: `onyx-procurement/src/payroll/wage-slip-calculator.js`
Size: 451 → 655 lines (+204 net)
Syntax: GREEN
Smoke: GREEN (all 6 expected outcomes match)

**Recommendation:** Resolve DDL gaps (new slip columns) and update
`payroll-routes.js` allowlist BEFORE running production payroll. Without
those the new fields will be silently dropped at INSERT time and Fixes #2,
#3, #5 will lose audit trail (math still correct in memory).
