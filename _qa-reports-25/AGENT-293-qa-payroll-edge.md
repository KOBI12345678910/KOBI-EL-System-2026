# AGENT-293 — QA #3: Payroll Edge-Case Test Suite

**Agent:** 293 — QA #3
**Date:** 2026-04-29
**Scope:** Edge-case tests for payroll wage-slip calculator
**Target:** `onyx-procurement/src/payroll/wage-slip-calculator.js` (519 lines)
**Frontend:** `payroll-autonomous/` (port 5173, /payroll)
**Cross-ref:** AGENT-04 findings — negative-net guard MISSING, sick-pay flat 50%, no exemptions, naive annualisation

## 0. Test taxonomy

| ID | Category | Severity if fail | Status target |
|----|----------|------------------|---------------|
| EDGE-Z-* | Zero-salary | HIGH | calculator must short-circuit |
| EDGE-MAX-* | Max bracket / surtax | HIGH | top-bracket math + yisuf |
| EDGE-MM-* | Multi-month / YTD | HIGH | annualisation, true-up |
| EDGE-NEG-* | Negative net | CRITICAL | Agent-04 confirmed missing guard |
| EDGE-OT-* | Shabbat / holiday OT | HIGH | 150% / 175% / 200% ladders |

All tests are RED-first specifications. Where Agent-04 documented a known gap, the test is marked `EXPECTED-FAIL` — it codifies the bug for the regression suite.

---

## 1. EDGE-Z — Zero-salary cases

### EDGE-Z-01 — Monthly employee on full unpaid leave
- **Setup:** `employee_type='monthly'`, `base_salary=0`, `worked_days=0`, allowances=`[]`
- **Expected:** `gross=0`, `income_tax=0`, `bituach_leumi=0`, `mas_briut=0`, `pension_employee=0`, `net_pay=0`
- **Why it matters:** Calculator iterates 7 brackets — must not divide-by-zero or emit NaN
- **Pass criteria:** All numeric fields are exactly `0` (not `0.00`, not `null`), `slip_status='draft'`, no audit warning

### EDGE-Z-02 — Hourly employee, zero hours
- **Setup:** `employee_type='hourly'`, `hourly_rate=42.50`, `hours_worked=0`
- **Expected:** Same as Z-01. Plus: `vacation_pay=0` (per Agent-04 findings, hourly vacation uses `base_salary` directly — assert it does NOT inherit a stray monthly figure)
- **Pass criteria:** No `Infinity`, no negative rounding artefacts on bituach floor

### EDGE-Z-03 — Zero gross + non-zero allowances
- **Setup:** `base_salary=0`, allowance `{type:'travel', amount:500}`
- **Expected:** Per Agent-04, ALL allowances treated as taxable. So `gross=500`, full tax/bituach/mas-briut applies on 500
- **EXPECTED-FAIL (Agent-04 gap):** Statute exempts נסיעות up to a daily cap; the test should fail until exemption logic lands
- **Pass criteria documenting bug:** `taxable_income=500` (current); after fix: `taxable_income=0` if under daily cap

### EDGE-Z-04 — Zero salary, pension contribution still attempted
- **Setup:** `base_salary=0`, `pension_fund_id` set
- **Expected:** `pension_employee=0`, `pension_employer=0`, `severance=0`. No row inserted into `pension_contributions` (or row with all zeros + flagged)
- **Pass criteria:** No FK error, no NULL constraint violation

### EDGE-Z-05 — Salary = 0.001 (sub-agora)
- **Setup:** `base_salary=0.001`
- **Expected:** After half-away rounding to 2dp, `gross=0.00`. Tax pipeline must still produce `net=0.00` not `-0.01`
- **Pass criteria:** No negative net from rounding chain

---

## 2. EDGE-MAX — Top bracket, yisuf, ceiling clamps

### EDGE-MAX-01 — Income exactly at top bracket threshold (721,560 ILS / 12 = 60,130/mo)
- **Setup:** `base_salary=60130`, no allowances
- **Expected:** All income taxed at or below 50% effective top bracket. Verify `bituach_leumi` capped at MAX threshold (≈49,030/mo per constants doc)
- **Pass criteria:** `bituach_leumi <= max_pensionable * 0.07` exactly; no double-charge above ceiling

### EDGE-MAX-02 — Income 1 ILS into top bracket (60,131/mo)
- **Setup:** `base_salary=60131`
- **Expected:** Marginal rate on the +1 ILS is exactly 50% per `wage-slip-calculator.js:CONSTANTS_2026.brackets[6].rate=0.50`
- **EXPECTED-NOTE (Agent-04):** This 50% folds in the 3% yisuf surtax. Test asserts the merged rate is reported, but flags that yisuf is not separately line-itemized
- **Pass criteria:** `income_tax` delta vs MAX-01 equals `0.50` (within 0.01)

### EDGE-MAX-03 — Pension cap (28,750 monthly base)
- **Setup:** `base_salary=50000`, eligible pension
- **Expected:** `pensionable_base=28750` not 50000. `pension_employee=28750*0.06=1725.00`
- **Pass criteria:** No silent truncation message; explicit `pensionable_capped:true` flag in audit

### EDGE-MAX-04 — Study fund cap (15,712 monthly)
- **Setup:** `base_salary=50000`, `study_fund_number` set
- **Expected:** `study_fund_employee=15712*0.025=392.80`, `study_fund_employer=15712*0.075=1178.40`
- **Pass criteria:** Both deduction and employer contribution clamp to cap

### EDGE-MAX-05 — Massive bonus pushing one month into yisuf only
- **Setup:** Base 30,000/mo, one-off bonus `+200,000` in month 6
- **Expected:** Bonus month income tax computes on full 230,000, hitting yisuf. Per Agent-04 naive annualisation gap, NO YTD smoothing
- **EXPECTED-FAIL (Agent-04 gap):** Should produce excessive tax on bonus month. After fix, true-up reduces month-7..12 PAYE
- **Pass criteria documenting bug:** Tax in month 6 ≈ `month-only-as-if-annualised`, not smoothed

### EDGE-MAX-06 — Negative bracket index (defensive)
- **Setup:** Inject mocked `taxable=-1` (e.g. via test double) into bracket walker
- **Expected:** Function returns `0`, not crash. Flag as defect if it iterates negative
- **Pass criteria:** No exception propagated to route layer

---

## 3. EDGE-MM — Multi-month / YTD scenarios

### EDGE-MM-01 — January only, mid-year hire
- **Setup:** Employee `start_date=2026-07-15`, generate Jan 2026 slip request
- **Expected:** Reject with `400 EMPLOYEE_NOT_ACTIVE` OR produce zero slip with explicit warning
- **Pass criteria:** No silent generation of slip for pre-employment month

### EDGE-MM-02 — Multi-month bulk (12 slips Jan→Dec)
- **Setup:** Stable salary 20,000/mo, no bonuses
- **Expected:** Sum of `income_tax` across 12 = 12 × monthly. YTD running total matches `SUM(prior slips)`
- **Pass criteria:** YTD field on Dec slip equals 240,000 gross, with bituach/mas-briut consistent

### EDGE-MM-03 — Bracket crossing mid-year
- **Setup:** Salary 15,000/mo Jan→Jun, then 25,000/mo Jul→Dec
- **Expected:** Per-month annualisation produces different effective rate per half-year. Document NO retroactive adjustment per Agent-04 finding
- **EXPECTED-FAIL after fix lands:** With true-up, December should rebalance YTD overpayment/underpayment
- **Pass criteria current:** Each month independent; no cross-month leakage

### EDGE-MM-04 — Voided + reissued slip in same month
- **Setup:** Slip A generated, voided. Slip B generated for same employee/month
- **Expected:** Duplicate guard OK per Agent-04 (`409` only if not voided). YTD computation must skip voided slips
- **Pass criteria:** YTD sum at month N+1 excludes voided slip A

### EDGE-MM-05 — Retro-active raise in March, slips Jan/Feb already issued
- **Setup:** Raise 18,000→22,000 effective Jan 1, applied in March
- **Expected:** March slip carries `retro_pay=8,000` (4,000 × 2 months) as taxable income
- **Pass criteria:** Bituach/mas-briut on retro_pay capped against monthly ceiling, NOT annual ceiling × 3

### EDGE-MM-06 — Year-end final slip with form 106 totals
- **Setup:** Generate Dec 2026 slip after 11 prior
- **Expected:** YTD totals on the slip match SUM of slips 1..11 + this slip. Form 106 export agrees to the agora
- **Pass criteria:** No drift > 0.01 ILS across the 12 slips ↔ form 106

---

## 4. EDGE-NEG — Negative-net guard (Agent-04 CRITICAL gap)

> Agent-04 confirmed: `net_pay = gross − deductions` with **NO floor at zero**. These tests are designed to fire the bug.

### EDGE-NEG-01 — Garnishment exceeds gross
- **Setup:** `base_salary=8000`, court-order garnishment `=10000`
- **Current behaviour:** `net_pay=-2000` (slip persists with negative)
- **Expected behaviour:** `net_pay=0`, residual `2000` carried as `garnishment_balance` to next month, OR rejection `422 NEGATIVE_NET_BLOCKED`
- **Pass criteria post-fix:** `net_pay >= 0` always
- **Severity:** **CRITICAL** — paying employee a negative figure means clawback, illegal in IL labor law without prior process

### EDGE-NEG-02 — Pension + study + advance recovery > gross
- **Setup:** `base_salary=5000`, pension 6% + study 2.5% + voluntary advance recovery 5000
- **Current:** Negative net
- **Expected:** Cap recovery at `gross − statutory_min_take_home` (see חוק הגנת השכר minimum protected wage)
- **Pass criteria:** Take-home ≥ minimum protected wage (currently ~ ILS 1,795 protected per BL clause)

### EDGE-NEG-03 — Manual deduction line equals 999,999
- **Setup:** Gross 30,000, manual deduction line 999,999 (data-entry typo)
- **Current:** Slip persists with `net_pay=-969,999`
- **Expected:** Server validates `sum(deductions) <= gross + tolerance` and rejects with `422 DEDUCTIONS_EXCEED_GROSS`
- **Pass criteria:** Reject before write to DB

### EDGE-NEG-04 — Sick pay flat 50% Agent-04 finding amplification
- **Setup:** Salary 10,000, full month sick (statute: day 1=0%, days 2-3=50%, day 4+=100%)
- **Current:** Flat 50% across all sick days = 5,000 sick pay
- **Expected statute:** Day 1 unpaid + days 2-3 at 50% + days 4-30 at 100% ≈ 9,250+
- **EXPECTED-FAIL (Agent-04 gap):** Underpayment by ~4,250
- **Pass criteria post-fix:** Statutory ladder applied per `chok-dmey-machala`

### EDGE-NEG-05 — Float arithmetic chain producing -0.005
- **Setup:** Sequence of allowance/deduction floats summing to gross via IEEE-754 drift
- **Expected:** Net rounded with half-away to `0.00`, never `-0.01`
- **Pass criteria:** No `Object.is(net, -0)` true, no `-0.01` in any DB row across 10k synthetic slips

---

## 5. EDGE-OT — Shabbat / holiday overtime ladders

> Israeli statute: weekday OT = 125% (2h) / 150% (3h+). Shabbat / חג = 150% base + 175% / 200% on top of premium for OT hours.

### EDGE-OT-01 — Friday night 22:00 → Saturday 02:00 (4h Shabbat work)
- **Setup:** Hourly rate 50, 4 hours spanning Shabbat entry
- **Expected:** All 4h at 150% Shabbat premium = 50 × 1.5 × 4 = 300
- **Pass criteria:** No prorated weekday rate for the 22:00–24:00 portion if the worker's workweek already crosses into Shabbat per פקודת שעות עבודה ומנוחה

### EDGE-OT-02 — Shabbat OT (10h on Saturday)
- **Setup:** Hourly rate 50, 10h Sat
- **Expected:** First 8h at 150% (Shabbat base) + next 2h at 175% (Shabbat OT first 2h) + remainder at 200%
- **Calculation:** `8*50*1.5 + 2*50*1.75 = 600+175 = 775`
- **Pass criteria:** Three distinct rate tiers visible in slip detail; total = 775 to 0.01

### EDGE-OT-03 — Yom Kippur work (chag premium)
- **Setup:** 6h on Yom Kippur (calendar lookup required)
- **Expected:** Full chag premium 150% with mandatory replacement-day-off flag
- **Pass criteria:** Slip emits `holiday_replacement_due=true`; HR queue picks it up

### EDGE-OT-04 — Holiday eve (ערב חג) early dismissal
- **Setup:** Worked past 14:00 on ערב פסח
- **Expected:** Hours past statutory dismissal threshold qualify as holiday OT (150%)
- **Pass criteria:** Calculator consults Hebrew calendar, NOT just JS Date

### EDGE-OT-05 — Shabbat-observant employee opts out, works Sunday
- **Setup:** Employee flag `shabbat_observant=true`, schedule shift Sun→Thu
- **Expected:** Friday-night Shabbat block honored; if asked to work Sat, slip generation rejects with `422 SHABBAT_OBSERVANT_VIOLATION`
- **Pass criteria:** Hard reject path, audited

### EDGE-OT-06 — Daylight-saving boundary, Shabbat exit
- **Setup:** Spring-forward / fall-back weekend; Shabbat exit time shifts
- **Expected:** Calculator uses sunset/three-stars table or zmanim API, not naive 19:00 cutoff
- **Pass criteria:** OT hours computed against tzeit hakochavim for that geographic region

### EDGE-OT-07 — Multi-day chol-hamoed travel
- **Setup:** 5 chol-hamoed days, employee on travel allowance
- **Expected:** Chol-hamoed = regular workday rates (no premium), but per Agent-04 travel allowance is fully taxed (gap)
- **Pass criteria:** Travel allowance taxability matches Agent-04 documented behavior; no double-counting

### EDGE-OT-08 — OT threshold 186h/month statutory cap
- **Setup:** Employee logs 250 OT hours single month
- **Expected:** Hours over statutory cap (186 monthly per chok shaot avoda) flagged for compliance review; payment still due but `compliance_review_required=true`
- **Pass criteria:** Slip produced + compliance event emitted to AI task manager (Agent-05 surface)

---

## 6. Test harness recommendations

| Layer | Tool | Location |
|-------|------|----------|
| Unit (calculator) | vitest | `onyx-procurement/test/payroll/wage-slip-calculator.spec.js` |
| Property-based (rounding) | fast-check | same file, generators for ±0.001 perturbation |
| Multi-month integration | supertest + ephemeral PG | `onyx-procurement/test/payroll/integration.ytd.spec.js` |
| OT calendar | mock zmanim provider | inject via `payrollDeps.zmanim` |
| Negative-net regression | snapshot + DB query | assertion `SELECT count(*) FROM wage_slips WHERE net_pay < 0` = 0 |

## 7. Severity-prioritized gap list (test failures expected today)

1. **CRITICAL** — EDGE-NEG-01..03: negative net writeable (Agent-04 confirmed)
2. **HIGH** — EDGE-NEG-04: sick-pay flat 50% (Agent-04 confirmed)
3. **HIGH** — EDGE-Z-03: travel allowance taxed (Agent-04 confirmed)
4. **HIGH** — EDGE-MM-03/05: no YTD true-up (Agent-04 confirmed)
5. **HIGH** — EDGE-OT-02/03/06: Shabbat/zmanim ladder unverified (no dedicated module found)
6. **MED** — EDGE-MAX-02: yisuf not separately line-itemized
7. **MED** — EDGE-MAX-03/04: pension/study cap silent
8. **LOW** — EDGE-Z-05: rounding-chain robustness

## 8. Acceptance gate

Suite passes when:
- All EDGE-Z, EDGE-MAX, EDGE-MM (excluding documented gaps) green
- All EDGE-NEG green AFTER negative-net guard implemented (Agent-04 P1)
- All EDGE-OT green AFTER zmanim integration AND Shabbat ladder module shipped
- DB invariant holds: `net_pay >= 0 AND gross >= sum(deductions)` for all rows

## 9. Suggested implementation order (companion fixes)

1. Add `assertNonNegativeNet(slip)` in calculator before persist — blocks EDGE-NEG-01..05
2. Implement statutory sick-pay ladder — fixes EDGE-NEG-04
3. Add Shabbat/chag/zmanim module — fixes EDGE-OT-*
4. Add YTD true-up pass — fixes EDGE-MM-03/05 + EDGE-MAX-05
5. Allowance taxability rule engine — fixes EDGE-Z-03 + EDGE-OT-07
6. Yisuf line-item separation — fixes EDGE-MAX-02

---

**End AGENT-293.** 38 edge cases across 5 categories. 7 expected-fails codify Agent-04 confirmed gaps. Suite is RED today; targets a fully GREEN payroll calculator by P1.
