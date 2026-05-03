# AGENT-04 — Runtime Audit: payroll-autonomous

**Agent:** 04 — Terminal Runtime
**Date:** 2026-04-29
**Scope:** `payroll-autonomous/` static audit. NOT executed.
**Verdict:** YELLOW — frontend is a thin shell with NO local payroll math; all calculations delegated to `onyx-procurement` (port 3100). Critical findings around constants drift, port mismatch, and PDF/UI rounding inconsistencies. Tax math is structurally correct but every numeric constant is `ESTIMATED` per the constants doc — production-blocking until officially verified.

---

## 0. Executive summary

| Item | Status | Severity |
|------|--------|----------|
| `package.json` shape | OK | — |
| Main entry (`src/main.jsx`) | OK | — |
| Local tax/payslip calculation in service | **NONE FOUND** | INFO |
| Calculator under audit (delegated) | `onyx-procurement/src/payroll/wage-slip-calculator.js` | — |
| 2026 brackets vs ISRAELI_TAX_CONSTANTS_2026.md | MATCH (all 7 brackets) | OK |
| Bituach Leumi rates / threshold / max | MATCH | OK |
| Mas Briut (health) rates | MATCH | OK |
| Pension 6% / 6.5% / 8.33% | MATCH | OK |
| Study fund 2.5% / 7.5% / 15,712 cap | MATCH | OK |
| Net pay rounding | half-away-from-zero, 2 dp | OK |
| ILS symbol consistency | **MIXED** (`₪` literal in App.jsx, `'₪ '` in PDF) | LOW |
| Port mismatch | `vite.config.js` says **5174**; spec says **5173** | MED |
| Sick-pay simplification | **flat 50%** instead of statutory 0/50/100 ladder | HIGH |
| Allowance taxability | **ALL treated as taxable** — no שווי / exempt rules | HIGH |
| Income-tax annualisation | naive monthly × 12 — ignores YTD true-up | HIGH |
| Yisuf (high-earner 3% surtax) | folded into top bracket as `0.50`, not separately tracked | MED |
| Negative-net guard | **NONE** — `net_pay = gross − deductions` can go negative | MED |
| Duplicate slip guard | OK (`409` if existing not voided) | OK |
| Four-eyes approval | OK (`SELF_APPROVAL_DENIED`) | OK |
| Pension first-shekel rule | OK (`MIN_BASE_MONTHLY: 0`) | OK |
| Pension cap (`MAX_PENSIONABLE 28,750`) | matches doc ESTIMATED | OK |
| `study_fund_eligible` heuristic | based on `employee.study_fund_number` truthiness — fragile | MED |
| Hourly-vs-monthly branch | OK structurally; hourly `vacation_pay` uses `base_salary` directly (assumes hourly rate) — **silent bug if `base_salary` is monthly for non-monthly types** | HIGH |
| Allowance partial exemptions (meal/travel) | code comment admits "treat all as taxable" — non-compliant for נסיעות tax exemption | HIGH |
| YTD computation | sums prior slips; **no balancing adjustment** for true-up against annualised tax | MED |
| RBAC / IDOR | fixed via Agent-Y-QA12 (`PAYROLL_ADMIN_KEYS`, `denyIfNotOwnerOrAdmin`) | OK |
| Mass-assignment | allow-listed via `pick()` | OK |
| `process.env.NODE_ENV === 'development' && AUTH_MODE === 'disabled'` ⇒ admin | dev backdoor | LOW |

---

## 1. package.json + main entry

`payroll-autonomous/package.json`:
- `"name": "payroll-autonomous"`, `"type": "module"`, version `1.0.0`.
- Vite-only stack: `vite ^5.4.11`, `react 18.3.1`, `vite-plugin-pwa`, `tailwindcss v4`, `vitest`, `playwright`.
- **No backend dependency, no calculator dependency.** No `pdfkit`, no `decimal.js`, no `dinero.js`. The service is a pure SPA shell.
- Scripts: `dev`, `build`, `preview`, `start` (alias of `vite`), `test` (vitest), `test:e2e` (playwright).
- **Notable absence:** no test for the wage-slip math itself in this service — only Playwright E2E that mocks the API response. Math correctness is the responsibility of `onyx-procurement`.

`src/main.jsx`:
- Mounts `<App/>` under React.StrictMode.
- Installs a `window.storage` shim that maps Base44's async API onto `localStorage`. Synchronous-style key/value, returns `{key,value}`. Acceptable shim, but error swallowing in `get` returns `null` — the consumer cannot distinguish "missing" from "storage broken".

`vite.config.js`:
- `base: '/payroll/'` — matches the spec's "served at /payroll".
- `server.port: 5174` — **MISMATCH with CLAUDE.md spec which states port 5173**. Either the spec is wrong, or the dev server is wrong. Production builds are static so this is dev-only, but it will trip up the docs and any reverse proxy assuming 5173.
- PWA manifest: `lang: 'he', dir: 'rtl'`, dark theme color. OK.

---

## 2. Where is the payroll math?

There is **no payroll calculator inside `payroll-autonomous/src`**. Grep confirms zero occurrences of `wage-slip|bituach|tax|bracket` in any local source file beyond UI labels. All math is performed server-side by:

- `onyx-procurement/src/payroll/wage-slip-calculator.js` (519 lines) — computes the slip
- `onyx-procurement/src/payroll/payroll-routes.js` — Express routes wrapped by Supabase
- `onyx-procurement/src/payroll/pdf-generator.js` — pdfkit-based PDF (Hebrew bilingual)

The frontend issues `POST /api/payroll/wage-slips/compute` for a preview and `POST /api/payroll/wage-slips` for save. So this audit must verify the calculator, since the SPA relies on whatever number the API returns.

---

## 3. Israeli tax verification (calculator vs constants doc)

Cross-reference `wage-slip-calculator.js` `CONSTANTS_2026` ↔ `ISRAELI_TAX_CONSTANTS_2026.md`.

### 3.1 Income-tax brackets — all 7 match

| Up to (NIS/yr) | Rate | Calc | Doc | Status |
|---|---|---|---|---|
| 84,120 | 10% | OK | OK | ESTIMATED |
| 120,720 | 14% | OK | OK | ESTIMATED |
| 193,800 | 20% | OK | OK | ESTIMATED |
| 269,280 | 31% | OK | OK | ESTIMATED |
| 560,280 | 35% | OK | OK | ESTIMATED |
| 721,560 | 47% | OK | OK | ESTIMATED |
| ∞ | 50% | OK | OK | CONFIRMED structurally |

**Issue:** The calculator collapses 47% + 3% יסף into one 50% top bracket. That gives the right total tax but **kills any audit trail for the surtax**. Tax authority Form 126 wants the יסף broken out. Recommend separating into two brackets or carrying a side-channel field.

### 3.2 Tax credit point (נקודת זיכוי)

- Calc: `TAX_CREDIT_POINT_ANNUAL = 2976`, `TAX_CREDIT_POINT_MONTHLY = 248` — match doc.
- Drift risk: monthly is hard-coded as a separate constant rather than `annual / 12`. Fine arithmetically (2976/12 = 248 exact) but breaks if annual is bumped without updating monthly.
- Default `taxCreditPoints = 2.25` (resident male) used everywhere `employee.tax_credits` is null. **No special handling for women (2.75 default), children, single-parent extras, or olim**. The data model has a single `tax_credits` numeric field — caller must supply the correct figure.

### 3.3 Bituach Leumi — match

| Field | Calc | Doc |
|---|---|---|
| `MONTHLY_THRESHOLD` | 7,522 | ~7,522 ESTIMATED |
| `MONTHLY_MAX_BASE` | 49,030 | ~49,030 ESTIMATED |
| `EMPLOYEE_LOW_RATE` | 0.4% | 0.4% |
| `EMPLOYEE_HIGH_RATE` | 7.0% | 7.0% |
| `EMPLOYER_LOW_RATE` | 3.55% | 3.55% |
| `EMPLOYER_HIGH_RATE` | 7.6% | 7.6% |

`computeBituachLeumiAndHealth(monthlyTaxable)` correctly:
- caps at `MONTHLY_MAX_BASE` first
- splits at `MONTHLY_THRESHOLD`
- applies low and high rates

### 3.4 Mas Briut (Health Tax) — match

Employee 3.1% / 5.0%. **Employer health tax is set to 0** in code with the comment "embedded in bituach_leumi_employer in Israeli law" — that is correct (the 3.55% / 7.6% employer BL rates already include the health portion). 

### 3.5 Pension — match

Employee 6%, employer תגמולים 6.5%, פיצויים 8.33%. `MAX_PENSIONABLE 28,750`. First-shekel rule honoured (`MIN_BASE_MONTHLY: 0`).

### 3.6 Study Fund — match

Employee 2.5%, employer 7.5%, cap 15,712. **Eligibility:** `studyFundEligible = !!employee.study_fund_number`. Fragile — having an account number does not entail an active deduction. Recommend an explicit `study_fund_active` boolean.

### 3.7 Overtime multipliers — match (1.25 / 1.50 / 1.75 / 2.00)

But `computeMonthlyGross` and `computeHourlyGross` ignore the `OVERTIME_RATES` constants and hard-code `1.25 / 1.50 / 1.75 / 2.00` inline. Constants-as-string-of-truth violation — change one without changing the other and the audit log lies.

### 3.8 Standard hours — `STANDARD_HOURS_PER_MONTH = 182` — match doc.

---

## 4. Payslip generation logic — issues

### 4.1 [HIGH] Income tax annualisation is naive

```js
function computeIncomeTaxMonthly(monthlyTaxable, taxCreditPoints = 2.25) {
  const annualTax = computeIncomeTaxAnnual(monthlyTaxable * 12, taxCreditPoints);
  return round(annualTax / 12);
}
```

This treats every month as if salary were constant year-round. Real Israeli payroll uses **תיאום מס** with cumulative YTD truing-up: `cumulative_tax_owed_to_date − cumulative_tax_already_withheld`. The calculator already loads `ytd_*` from prior slips but **never uses them in `computeIncomeTaxMonthly`** — they're only carried forward as totals. A bonus in month 12 is taxed at the top marginal rate of an annualised projection of just that month's gross, which is wrong.

Symptom: bonus months over-deduct by ~10–15%; sparse-income months under-deduct. End-of-year reconciliation (Form 106) will not balance.

### 4.2 [HIGH] Sick pay flattened to 50%

`computeMonthlyGross`:
```js
const sickPay = round(sick * hourlyRate * 0.50); // day 1 = 0, day 2-3 = 50%, day 4+ = 100% per law; simplified
```

Statutory ladder per חוק דמי מחלה: day 1 = 0%, days 2–3 = 50%, day 4+ = 100%. The code compresses this to a flat 50%. Flagged in the comment but not implemented. **Under-pays employees on long sick leaves.**

Hourly path is even worse:
```js
sickPay = round(toNum(timesheet.hours_sick) * toNum(employee.base_salary) * 0.5);
```
Multiplies by `base_salary` (the monthly figure on monthly employees!) instead of hourly rate when employment_type is hourly **with monthly base**. Latent crash if both pay-types share one column.

### 4.3 [HIGH] Allowances all treated as taxable

```js
// Some allowances are taxable, some not. Simplified: travel/meal partially exempt.
// Full rigor: apply שווי (value) rules per ruling. For now treat all as taxable.
const taxableBase = gross_pay;
```

Travel allowance (דמי נסיעה) up to ~₪22.60/day is exempt; meal allowance has שווי rules; clothing per role is exempt up to a ceiling; phone has a partial שווי. The code applies tax + BL + health on ALL of them. **Over-deducts employees** and over-reports BL employer contributions. Also non-compliant with פקודת מס הכנסה ס׳ 32.

### 4.4 [HIGH] Hourly vacation_pay multiplies by base_salary directly

```js
vacationPay = round(toNum(timesheet.hours_vacation) * toNum(employee.base_salary));
```

Only correct if `employee.base_salary` IS the hourly rate for hourly employees. If the data model overloads `base_salary` (and the form in `App.jsx` line 629 labels it "שכר בסיס" without distinguishing) a monthly employee misclassified as hourly would book vacation pay = `hours × monthly_salary` = catastrophic over-payment.

### 4.5 [MED] No negative net-pay guard

`net_pay = round(gross_pay - total_deductions)` can go negative when:
- garnishments or loans exceed disposable income
- bonuses pushed taxable annualised income through a higher bracket while gross stayed low

Per חוק הגנת השכר ס׳ 25, total deductions cannot exceed 25% of net wage (with exceptions for child-support and tax). Calculator does not enforce this. **Deduction-cap missing** is a compliance bug.

### 4.6 [MED] YTD passed in but ignored by tax math

`computeWageSlip` accepts `ytd` and writes back `ytd_gross, ytd_income_tax, ytd_bituach_leumi, ytd_pension`. But these are display-only running totals; the income-tax function does NOT use `ytd.ytd_income_tax` to true-up. So the YTD field is misleading: it looks like a cumulative balance but the computation is independent.

### 4.7 [LOW] Rounding consistency

`round(n, 2)` uses `Math.round(n * 100)/100` — banker-rounding-NOT, half-away-from-zero. Acceptable for ILS (no halves below אגורה), but applied inconsistently:
- intermediate `hourlyRate` rounded to 4 decimals in monthly path
- all line items rounded to 2 dp
- `total_deductions` re-rounds the sum of already-rounded items → drift up to a couple agorot
- `net_pay` re-rounds again → second drift

Recommend computing in agorot integers throughout, round only on display.

### 4.8 [LOW] Currency symbol mismatch

| File | Symbol | Source |
|---|---|---|
| `payroll-autonomous/src/App.jsx` | `'₪ '` literal escape | `fmtMoney` line 102 |
| `onyx-procurement/src/payroll/pdf-generator.js` | `'₪ '` literal | `formatMoney` line 34 |

Both render identically (U+20AA NEW SHEQEL SIGN), but mixing literal and escape complicates grep-based audits and translation. Pick one.

Both pass `'he-IL'` to `toLocaleString` with `minimumFractionDigits: 2, maximumFractionDigits: 2` — produces `₪ 12,345.00`. Note the LRM/RLM marks Node injects in `he-IL` locale on some runtimes — this can corrupt CSV exports going through `exportToCSV` (in `src/utils/export.ts` — separate audit).

---

## 5. DB models (employee / payslip / timesheet)

No SQL DDL files exist for the payroll domain in this worktree (`onyx-procurement/migrations/` only contains `999_add_perf_indexes.sql`). DDL is implied from:

- `payroll-routes.js` Supabase calls (`from('employers')`, `from('employees')`, `from('wage_slips')`, `from('employee_balances')`, `from('payroll_audit_log')`)
- `EMPLOYEE_FIELDS` allowlist (line 173 of routes)
- `EMPLOYER_FIELDS` allowlist (line 152)
- `BALANCE_FIELDS` allowlist (line 506)
- The slip object built in `computeWageSlip` (~50 fields incl. frozen snapshot of employee/employer)

### Inferred schema

`employees`:
- id, employer_id, first_name, last_name, full_name, id_number, employee_number, email, phone, address, birth_date, start_date, end_date, department, position
- base_salary (numeric, overloaded for hourly+monthly), hourly_rate, pay_type, work_percentage, hours_per_month, tax_credits
- bank_code, bank_branch, bank_account, is_active

`employers`:
- id, legal_name, trade_name, company_id, vat_number, address, phone, email, contact_name, employer_number, bituach_leumi_number, tax_deduction_file, reporting_frequency, active

`wage_slips`:
- id, employee_id, employer_id, period_year, period_month, period_label, pay_date
- frozen snapshot fields (employee_name, employee_national_id, employer_legal_name, employer_company_id, employer_tax_file, position, department)
- 8× hours_*, 11× earnings, 8× deductions, employer contributions, balances, YTD totals
- status enum: `computed | draft | approved | issued | voided` (inferred from state checks)
- prepared_by, approved_by, approved_at, pdf_path, pdf_generated_at, notes, updated_at, amendment_of (per index migration)

`employee_balances`:
- employee_id, snapshot_date, vacation_days_balance, sick_days_balance, study_fund_balance, severance_balance

`payroll_audit_log`:
- event_type, wage_slip_id, employee_id, actor, details, before_state, after_state

### Schema concerns

- **No timesheet table** — timesheet is sent in the request body, calculated, then the per-month line items are denormalised onto the slip row. There is no per-day breakdown for audit. If a sick day was wrongly classified, you cannot reconstruct it after issuance.
- **No `study_fund_active` column** — eligibility derived from `study_fund_number` presence. Fragile.
- **`base_salary` is one column for monthly+hourly+daily+freelance** — see 4.4. Should be split (`monthly_salary`, `hourly_rate`, `daily_rate`) or have a discriminator.
- **No `tax_file_employer` JSON snapshot version**. If the employer changes its tax file, old issued slips' frozen `employer_tax_file` is fine but **regenerated PDFs** (line 454 of routes auto-regenerates if `pdf_path` missing) would re-read from the slip row, which is fine; but if the slip itself is amended, the snapshot is overwritten.
- **`amendment_of FK`** exists (per index migration line 347) but the routes do not appear to use it for amendments — only `void` is wired (line 473). Amendment workflow is dead.

---

## 6. Currency handling (ILS) and rounding

| Concern | Status |
|---|---|
| Single currency assumption | ILS hard-coded everywhere (`'he-IL'`, `₪`, `₪`). No multi-currency. |
| Decimal precision | `Number` (IEEE-754 double) throughout. Vulnerable to floating-point drift on long sums. |
| Rounding rule | `Math.round(x * 100) / 100` — half-away-from-zero, 2 dp. |
| Agorot vs shekel | All values in shekels with 2 dp. No integer-agorot pipeline. |
| BL rounding | The actual btl.gov.il rate engine rounds **down** to the nearest agora — calculator rounds half-away-from-zero. Will drift vs. actual tax-authority filings by 1 agora per line. |
| Pension rounding | Insurance providers expect 2 dp half-away-from-zero — matches calculator. |

**Production-blocking finding:** the BL rounding rule is wrong. Filing Form 102 with the calculator's value can produce a 1–2 agora mismatch per month per employee, which the BL system rejects in batch.

---

## 7. Concrete remediations (priority order)

1. [HIGH] Fix sick-pay ladder per חוק דמי מחלה (0/50/100). Add unit tests with day-1, day-2-3, day-4+ scenarios.
2. [HIGH] Implement YTD true-up in `computeIncomeTaxMonthly` — use cumulative `ytd_income_tax` minus already-withheld.
3. [HIGH] Apply שווי rules to allowances — at least travel exemption ≤22.60 NIS/day and meal allowance.
4. [HIGH] Split `employees.base_salary` into `monthly_salary` and `hourly_rate`. Reject hourly rows with monthly-shaped base_salary.
5. [MED] Add deduction-cap guard per ס׳ 25 חוק הגנת השכר and a non-negative `net_pay` invariant.
6. [MED] Switch BL rounding to floor-to-agora to match tax-authority engine.
7. [MED] Track יסף 3% as a separate ledger item rather than collapsing into the 50% top bracket. Required for Form 126 / 106.
8. [MED] Replace `study_fund_eligible = !!employee.study_fund_number` with `employee.study_fund_active` boolean.
9. [LOW] Pin `vite.config.js` port to **5173** (or correct the spec). Currently 5174.
10. [LOW] Stop hard-coding overtime multipliers inline — pull from `OVERTIME_RATES`.
11. [LOW] Move all monetary math into integer agorot. Round only at display boundary.
12. [LOW] Standardise on `'₪'` everywhere or `'₪'` everywhere. Add an ESLint rule.
13. [LOW] Lock `process.env.NODE_ENV === 'development' && AUTH_MODE === 'disabled'` admin bypass behind a build-time flag, never read at runtime in non-dev images.
14. [INFO] Add a vitest unit suite IN `payroll-autonomous` that runs the same fixtures end-to-end against the API contract, so the SPA can guard against backend regressions.

---

## 8. What I did NOT verify (out of scope)

- The actual numeric values in the `ESTIMATED` constants vs. the official 2026 publications (those gazettes had not been issued at constants-doc creation time per `ISRAELI_TAX_CONSTANTS_2026.md`). Per the doc, **all bracket thresholds, BL thresholds, pension cap, and study-fund cap MUST be re-verified on Jan 1 2026**. As of audit date 2026-04-29 these may now be obsolete by 4 months — separate task.
- Form 102 / Form 126 / Form 106 generation (not present in the audited files).
- Bituach Leumi export to btl.gov.il batch format.
- Pension-provider integration (`makelet`).
- The `pension_employer = base × 0.065` does NOT add `severance_employer` (8.33%) into the employer pension total — both are returned separately, which is correct, but the PDF lists them as two lines under "הפרשות מעסיק" — verify this matches the issuer's format expectation.

---

## 9. File references (absolute)

- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\payroll-autonomous\package.json`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\payroll-autonomous\src\main.jsx`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\payroll-autonomous\src\App.jsx` (`fmtMoney` L102; wage-slip API calls L467, L476, L1205–1207, L1219, L1223; employee form defaults L573)
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\payroll-autonomous\vite.config.js` (port 5174 mismatch)
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\src\payroll\wage-slip-calculator.js` (CONSTANTS_2026 L25–90; tax math L180–206; BL+health L217–236; pension L242–250; study fund L252–262; main computeWageSlip L276–438)
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\src\payroll\payroll-routes.js`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\src\payroll\pdf-generator.js` (`formatMoney` L32; deductions section L160–164)
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\src\payroll\CONSTANTS_VERIFICATION.md`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\ISRAELI_TAX_CONSTANTS_2026.md`

---

## 10. Final verdict

`payroll-autonomous` itself is structurally clean — it is a Vite SPA with correct PWA manifest, RTL+Hebrew, dark theme, and a thin API client. It is **incapable of producing a wrong payslip on its own** because it produces nothing on its own; it renders whatever the API returns.

The dependency target (`onyx-procurement` payroll module) is structurally correct against the doc, but carries six material correctness bugs (sick-pay ladder, YTD true-up, allowance taxability, hourly base_salary overload, deduction-cap, BL rounding) and one constants-drift risk (every bracket and threshold marked ESTIMATED, due for January re-verification that may have lapsed by 4 months).

**Recommendation:** YELLOW — do not run production payroll runs through this stack until items 1–6 above are resolved AND the constants are re-verified against the January 2026 ילקוט פרסומים publication. Frontend itself is GREEN modulo the port mismatch.
