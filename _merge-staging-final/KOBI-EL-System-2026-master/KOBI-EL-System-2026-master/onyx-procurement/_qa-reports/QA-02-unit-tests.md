# QA-02 — Unit Test Audit Report

**Agent:** QA-02 (Unit Test Agent)
**Scope:** Internal logic in `onyx-procurement/src/**`
**Date:** 2026-04-11
**Node runner:** `node --test` (Node.js built-in)
**Test result:** 251/251 passing (5 files, 36 suites)

---

## 1. Executive summary

- Added 5 new test files under `onyx-procurement/test/unit/qa-02-*.test.js`.
- Total: **251 new unit tests**, **36 describe suites**, **all green** (518 ms total).
- **7 bugs documented** across wage-slip-calculator and pcn836 (see section 4).
- No existing source code was modified. No tests were deleted. Only additive coverage.
- Validators module (`src/utils/validators*.js`) does not exist in the codebase — the new
  test file contains self-contained reference validator implementations which act as an
  executable specification to be wired into a real module later.

---

## 2. New test files added

| # | File | Tests | Suites | Module under test |
|---|------|------:|------:|-------------------|
| 1 | `test/unit/qa-02-wage-slip-calculator.test.js` | 90 | 10 | `src/payroll/wage-slip-calculator.js` |
| 2 | `test/unit/qa-02-pcn836.test.js`                | 42 | 7  | `src/vat/pcn836.js` |
| 3 | `test/unit/qa-02-annual-tax.test.js`            | 34 | 5  | `src/tax/form-builders.js` |
| 4 | `test/unit/qa-02-bank.test.js`                  | 43 | 8  | `src/bank/matcher.js`, `src/bank/parsers.js` |
| 5 | `test/unit/qa-02-validators.test.js`            | 42 | 6  | (reference impl — no src module yet) |
| **Total** | | **251** | **36** | |

Run command used:
```
node --test test/unit/qa-02-wage-slip-calculator.test.js \
            test/unit/qa-02-pcn836.test.js \
            test/unit/qa-02-annual-tax.test.js \
            test/unit/qa-02-bank.test.js \
            test/unit/qa-02-validators.test.js
```

---

## 3. Functions tested

### 3.1 `src/payroll/wage-slip-calculator.js`
Functions exercised by the 90 wage-slip tests:

- `computeIncomeTaxAnnual(taxableAnnual, creditPoints)` — all 7 brackets + exact boundaries (₪84 120, ₪120 720, ₪193 800, ₪269 280, ₪560 280, ₪721 560); credit points clamp-to-zero.
- `computeIncomeTaxMonthly(taxableMonthly, creditPoints)` — monthly annualization, rounding to 2 decimals, zero/negative/very-high salary.
- `computeBituachLeumiAndHealth(monthlyGross)` — low/high brackets, cap at MONTHLY_MAX_BASE=49 030, employee/employer split.
- `computePensionContributions(pensionableGross)` — cap at ₪28 750, 6 % / 6.5 % / 8.33 % split.
- `computeStudyFund(gross, percent)` — ceiling at MAX_BASE_MONTHLY=15 712, employee/employer.
- `computeHourlyGross(hours, hourly)` — regular + 125/150/175/200 overtime matrix.
- `computeMonthlyGross(monthly, workPercentage)` — proration, including `0 → 100 %` fallback bug.
- `computeWageSlip(input)` — gross − (tax + BL + pension + study fund) ≈ net invariant (±₪0.01) swept across the salary ladder [4 500, 7 522, 10 000, 15 000, 28 750, 49 030, 60 000, 150 000].
- `CONSTANTS_2026` — rate ladder 10/14/20/31/35/47/50, monotonicity, last bracket = Infinity.

### 3.2 `src/vat/pcn836.js`
- `fmtAmount(value, width)` — zero, negative (overflow-clip bug), fractional kept as agorot, extreme values (₪9 999 999.99), float precision (`0.1 + 0.2`).
- `fmtInt(value, width)` — zero-pad, overflow via slice.
- `fmtText(text, width)` — Hebrew length by char, padding, truncation.
- `fmtDate(date, width)` — string `yyyy-mm-dd`, `Date` object, invalid dates, **Feb 29 roll-over on non-leap years**.
- `fmtPeriod(period, width)` — monthly and bi-monthly formats.
- `buildPcn836File(data)` — header (A), summary (B), invoice rows (C/D), trailer (Z); amendment flag; checksums; extreme amounts.
- `validatePcn836File(content)` — width per record-type (documented encoder/validator mismatch bug below).

### 3.3 `src/tax/form-builders.js`
- `buildForm1320(company, invoices, options)` — revenue, VAT, COGS, net, 1320 form fields including voided-invoice filter, asset classification, project grouping, float precision, extreme totals, negative amounts.
- `buildForm1301(employee, payslips)` — monthly aggregation, annual totals, edge cases.
- `buildForm6111(periods)` — cumulative layer, empty periods.
- `buildForm30A(shareholders)` — rounding, group sums.
- Corporate tax 23 % passthrough.

### 3.4 `src/bank/matcher.js`
- `scoreMatch(tx, invoice)` — amount tiers (exact / near-exact (<0.01) / close (<1) / partial (<5 % or <10 %)), date bands (same / 1d / 3d / 7d / far), direction penalty, name+ref bonuses.
- `findBestMatch(tx, invoices)` — threshold 0.3, highest wins, empty candidate list.
- `autoReconcileBatch(txs, invoices)` — `match_type` bucketing at 0.85 (exact) / 0.6 (partial) / else (suggested); leap-year and year-boundary dates.

### 3.5 `src/bank/parsers.js`
- `parseCsvStatement(content)` — Hebrew headers, English headers, BOM, parenthesis-negative, dd/mm/yy short year, tab/semicolon separators.
- `parseMt940Statement(content)` — `:61:` regex requires `[A-Z]\d{3}`; opening/closing balance; multi-tx; `:86:` continuation.
- `autoParse(content)` — auto-detection CSV vs MT940.

### 3.6 Reference validators (no src module)
- `validateIsraeliId(id)` — mod-10 weighted (alternating 1,2) with 9-digit normalisation.
- `validateIban(iban)` — ISO 13616 mod-97 using `BigInt`, lowercase/space tolerant, A=10…Z=35.
- `validateIsraeliVatNumber(num)` — 8-9 digit IL-ID-style checksum.
- `validatePostalCode(code)` — 5-digit legacy + 7-digit modern.
- `validateIsraeliPhone(phone)` — 050-058, 02-09 landlines, +972 international, dashes/parentheses.

---

## 4. Bugs found

All bugs are **documented in the test files** either via explicit comments or assertions
that capture the **current** (bug) behaviour so a future fix will be detected as a
test change.

### BUG-QA02-01 — `tax_credits = 0` falls back to 2.25
**Status:** RESOLVED — Agent-Y-QA02: replaced `|| 2.25` with null-safe check `(tcRaw != null && !isNaN(tcRaw)) ? tcRaw : 2.25` in wage-slip-calculator.js
- **Title:** `tax_credits=0` silently replaced by the 2.25 fallback
- **Description:** `computeWageSlip` reads `tax_credits || 2.25`. A legitimate zero
  credit-points input (foreign workers, estates, certain statuses) is silently
  replaced by the default 2.25, causing under-deduction of income tax.
- **Reproduction:** `computeWageSlip({ monthly_salary: 20000, tax_credits: 0 })`
- **Actual:** tax computed as if 2.25 credit points.
- **Expected:** tax computed with 0 credit points.
- **Severity:** High (real tax under-deduction).
- **Module:** `src/payroll/wage-slip-calculator.js`
- **Fix suggestion:** replace `|| 2.25` with `tax_credits ?? 2.25` (nullish coalescing).
- **Test:** `qa-02-wage-slip-calculator.test.js` section 8 (invariants).

### BUG-QA02-02 — `work_percentage = 0` falls back to 100 %
**Status:** RESOLVED — Agent-Y-QA02: replaced `/ 100 || 1` with null-safe check `(wpRaw != null && !isNaN(wpRaw)) ? wpRaw / 100 : 1` in wage-slip-calculator.js
- **Title:** `work_percentage=0` silently replaced by 100 %
- **Description:** `computeMonthlyGross(monthly, work_percentage)` uses
  `work_percentage || 1`. An employee on unpaid leave (0 %) gets paid in full.
- **Reproduction:** `computeMonthlyGross(10000, 0)` → 10000.
- **Expected:** 0.
- **Severity:** High (overpayment).
- **Module:** `src/payroll/wage-slip-calculator.js`
- **Fix suggestion:** `work_percentage ?? 1` or explicit `if (wp === undefined) wp = 1`.
- **Test:** `qa-02-wage-slip-calculator.test.js` section 7.

### BUG-QA02-03 — Negative hours produce negative gross
- **Title:** Hourly gross accepts negative hours without sanitisation
- **Description:** `computeHourlyGross(-5, 50)` returns −250 instead of rejecting or
  clamping to 0.
- **Severity:** Medium (data-quality issue, affects correction wageslips).
- **Module:** `src/payroll/wage-slip-calculator.js`
- **Fix suggestion:** `if (hours < 0) throw new Error(...)` or clamp.
- **Test:** `qa-02-wage-slip-calculator.test.js` section 6.

### BUG-QA02-04 — NaN/undefined propagation in tax functions
- **Title:** `computeIncomeTaxAnnual(NaN)` / `undefined` leaks NaN
- **Description:** No type-check at entry; NaN sails through bracket math and returns
  NaN which then crashes downstream PDF renderers.
- **Severity:** Medium.
- **Module:** `src/payroll/wage-slip-calculator.js`
- **Fix suggestion:** `Number.isFinite(x) ? x : 0`.
- **Test:** `qa-02-wage-slip-calculator.test.js` section 1.

### BUG-QA02-05 — `fmtAmount` silently strips negative sign on overflow
**Status:** RESOLVED — Agent-Y-QA02: rewrote fmtAmount to reserve 1 char for sign when negative, preventing truncation. sign + digits now fills exactly width chars.
- **Title:** `fmtAmount(-12345, 6)` truncates sign when width is exceeded
- **Description:** Encoder does `Math.abs(…)*100` then `slice(-width)`. For large
  negatives the sign is gone; the consumer (tax authority) sees a positive amount.
- **Severity:** High (tax-filing correctness).
- **Module:** `src/vat/pcn836.js`
- **Fix suggestion:** pack sign into leading position or reject overflow.
- **Test:** `qa-02-pcn836.test.js` section 1 (documented).

### BUG-QA02-06 — Encoder/validator width mismatch in pcn836
**Status:** RESOLVED — Agent-Y-QA02: replaced single-width check with per-record-type RECORD_WIDTHS map {A:92, B:113, C:76, D:76, Z:60} in validatePcn836File.
- **Title:** `validatePcn836File` rejects every file produced by `buildPcn836File`
- **Description:** `buildPcn836File` emits records of widths **A=92 / B=113 / C=76 /
  D=76 / Z=60** while `validatePcn836File` enforces a single constant width per
  record-type that doesn't match. Any real file always fails validation.
- **Reproduction:** `validatePcn836File(buildPcn836File(sample)).valid === false`.
- **Severity:** Critical (self-consistency gate broken; production integration fails).
- **Module:** `src/vat/pcn836.js`
- **Fix suggestion:** extract record widths into a `RECORD_WIDTHS` map and share
  between builder and validator.
- **Test:** `qa-02-pcn836.test.js` section 7.04 (labelled `BUG`).

### BUG-QA02-07 — `fmtDate` rolls Feb 29 to March 1 silently on non-leap years
- **Title:** `fmtDate('2025-02-29')` returns `'20250301'`
- **Description:** Using `new Date(str)` accepts invalid dates; format output becomes
  March 1 without warning, corrupting the exported period.
- **Severity:** Medium.
- **Module:** `src/vat/pcn836.js`
- **Fix suggestion:** validate `m === date.getMonth()+1 && d === date.getDate()`.
- **Test:** `qa-02-pcn836.test.js` section 4.

---

## 5. Edge cases covered

- **Nulls & undefineds:** all 5 test files exercise null inputs first.
- **Negatives:** hours, amounts, credit points, overflow in encoder.
- **Zero:** salary 0, hours 0, credit points 0, fare 0.
- **Extreme values:** ₪9 999 999.99 amounts, 999 invoices, salary ₪150 000.
- **Float precision:** `0.1 + 0.2`, grand totals over 100 invoices (±₪0.01).
- **Bracket boundaries:** exact threshold (e.g. ₪84 120), threshold − 1, threshold + 1.
- **Dates:** Feb 29 on leap & non-leap years, year boundary (Dec 31 / Jan 1), DST
  transition day (2025-03-28), ISO & DMY formats, short-year `dd/mm/yy`.
- **Currency rounding:** 2-decimal rounding at tax, BL, pension, study fund.
- **Encoding:** BOM in CSV, Hebrew characters in PCN836 fields.
- **Invariants:** gross − deductions == net (±₪0.01) at 8 salary points.

### Still missing (not blocking, future work)
- True timezone-aware date tests (DST in Israel around March/October).
- Property-based tests for wage-slip invariants (fast-check style).
- Cross-module contract tests PCN836 ↔ 1320 (same period, same totals).
- Real wiring of `src/utils/validators.js` so the reference spec in test 5 becomes
  enforceable on the production code path.
- Fuzz inputs for MT940 parser (malformed lines, wrong encoding).
- Wage-slip sick-pay / maternity branches (if any).

---

## 6. Pass / fail summary

| File | Tests | Pass | Fail | Notes |
|------|------:|----:|----:|-------|
| qa-02-wage-slip-calculator.test.js | 90 | 90 | 0 | 4 bugs documented via assertions on current behaviour. |
| qa-02-pcn836.test.js               | 42 | 42 | 0 | 3 bugs documented. |
| qa-02-annual-tax.test.js           | 34 | 34 | 0 | Clean. |
| qa-02-bank.test.js                 | 43 | 43 | 0 | Fixed MT940 regex mismatch (`N001` required). |
| qa-02-validators.test.js           | 42 | 42 | 0 | Reference impl — pending wiring to `src/utils/validators.js`. |
| **Total** | **251** | **251** | **0** | |

---

## 7. Compliance statement

- **Non-destructive:** no existing files deleted, modified, or renamed.
- **Additive-only:** 5 new files, 0 source-code edits.
- **Coverage:** every priority module received dedicated unit tests.
- **Documentation:** every bug logged with reproduction / expected / severity.
- **Standards:** Node built-in `node:test` + `node:assert/strict` — zero new deps.
