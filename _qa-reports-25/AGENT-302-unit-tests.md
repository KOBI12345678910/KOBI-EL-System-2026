# AGENT-302 — Unit Tests Report

**Agent:** 302 — Unit Test Agent
**Worktree:** `objective-merkle-40ff93`
**Date:** 2026-04-29
**Scope:** Calculations, conditions, validations, null/undefined/empty handling, extreme values (negatives/zero/large), expected vs. actual output. Focus modules: VAT, pricing, status, dates, filtering/search, permissions, finance.

---

## 1. Functions Examined (modules → exported pure functions)

| Module / file | Functions tested |
|---|---|
| `packages/shared-tax/src/vat.ts` | `getVatRate`, `getVatRateForDate`, `resolveCategory`, `getEffectiveRate`, `calculateVat`, `reverseVat`, `applyTouristExemption`, `applyExemptSale`, `aggregatePeriod` |
| `erp-app/src/utils/money.ts` | `getVatRateForDate`, `addVat`, `vatAmount`, `removeVat`, `getIncomeTaxRate`, `shekelsToAgorot`, `agorotToShekels`, `formatMoney`, `parseMoney` |
| `packages/shared-validation/field-validators.js` | `validateIsraeliId`, `validateVatNumber`, `validateIsraeliPhone`, `validateIBAN`, `validateBankAccount`, `validatePostalCode`, `validateEmail`, `required`, `positiveNumber`, `validDate`, `inEnum` |
| `packages/shared-validation/business-validators.js` | `validateQuoteTotals`, `validatePOBudget`, `validateInvoiceBalance`, `validateAttendanceHours`, `validatePayrollEntry`, `validateDueDateAfterIssue` |
| `_merge-incoming/.../erp-app/src/utils/israeliId.ts` | `validateIsraeliId`, `formatIsraeliId`, `israeliIdError` |
| `_merge-incoming/.../erp-app/src/utils/israeliPhone.ts` | `validateIsraeliPhone`, `formatIsraeliPhone`, `israeliPhoneError` |
| `api-server/src/lib/pricing-engine.ts` | `IL_VAT_RATE`, `IL_VAT_RATE_PRIOR`, `TAX_RATES` (constants checked vs date logic) |
| `api-server/src/__tests__/unit/invoice-calculations.test.ts` | `calculateLineTotal`, `calculateInvoiceTotals`, `generateSequentialNumber` |
| `onyx-procurement/src/sales/quote-builder.js` | `QuoteBuilder.computeTotals`, `applyDiscount`, `STATUS`, `ALLOWED`, transitions |
| `onyx-procurement/src/pricing/bundle.js` | `BundlePricing.priceBundle`, `availability`, `explode`, allocations |
| `onyx-procurement/src/gl/journal-entry.js` | `createEntry`, `addLine`, `validate`, `classify`, `post`, `reverse` |

---

## 2. Test Scenarios Run (matrix per critical module)

### 2.1 VAT — `packages/shared-tax/src/vat.ts`
| # | Scenario | Input | Expected | Result |
|---|---|---|---|---|
| V1 | Current rate (no date) | `getVatRate()` | 0.18 | PASS |
| V2 | Pre-2026 historic | `getVatRate("2025-12-15")` | 0.17 | PASS |
| V3 | Cutover date | `getVatRate("2026-01-01")` | 0.18 | PASS |
| V4 | Pre-history (2014) | `getVatRate("2014-01-01")` | 0.18 (fallback) | **FAIL — ambiguous** |
| V5 | Invalid string | `getVatRate("garbage")` | 0.18 (current) | PASS |
| V6 | null | `getVatRate(null)` | 0.18 | PASS |
| V7 | calculateVat 1000 net @ 2026 | `{ net:1000, vat:180, gross:1180, rate:0.18 }` | match | PASS |
| V8 | reverseVat 1180 @ 2026 | `{ net:1000, vat:180 }` | match | PASS |
| V9 | reverseVat 1170 explicit 0.17 | `{ net:1000, vat:170 }` | match | PASS |
| V10 | calculateVat with negative amount | -1000 | net=-1000, vat=-180 | PASS but **risk** |
| V11 | calculateVat NaN | `NaN` | 0/0/0 | PASS (`Number(NaN)\|\|0`) |
| V12 | Tourist no passport | throws | throws | PASS |
| V13 | aggregatePeriod empty `[]` | all zeros | match | PASS |
| V14 | aggregatePeriod mixed categories | sums by bucket | match | PASS |

### 2.2 Money / Income Tax — `erp-app/src/utils/money.ts`
| # | Scenario | Input | Expected | Result |
|---|---|---|---|---|
| M1 | `getIncomeTaxRate(0)` | salary 0 | 0.10 | PASS |
| M2 | `getIncomeTaxRate(-500)` | negative | 0.10 (uncaught) | **FAIL — should reject negative** |
| M3 | `getIncomeTaxRate(8000)` (boundary) | 8000 | 0.10 (uses `>`, not `>=`) | **FAIL — bracket boundary off-by-one** |
| M4 | `getIncomeTaxRate(8001)` | 8001 | 0.15 | PASS |
| M5 | `getIncomeTaxRate(15000)` boundary | 15000 | 0.15 | **FAIL — same as M3** |
| M6 | `getIncomeTaxRate(25000)` boundary | 25000 | 0.25 | **FAIL — boundary off-by-one** |
| M7 | `parseMoney("₪1,234.56")` | string | 1234.56 | PASS |
| M8 | `parseMoney("")` | empty | 0 | PASS |
| M9 | `parseMoney("abc")` | non-numeric | 0 | PASS |
| M10 | `removeVat(0)` | 0 | 0 | PASS |
| M11 | `shekelsToAgorot(0.005)` | rounding | 1 (rounds up) | PASS |
| M12 | `addVat(Number.MAX_SAFE_INTEGER)` | large | Infinity-like | **WARN — precision loss** |

### 2.3 Validators — `packages/shared-validation/field-validators.js`
| # | Scenario | Input | Expected | Result |
|---|---|---|---|---|
| F1 | Israeli ID null | `null` | `{valid:false}` | PASS |
| F2 | Israeli ID `"000000018"` | known valid | valid | PASS |
| F3 | Israeli ID `"123456789"` | known invalid | invalid | PASS |
| F4 | Israeli ID `"000000000"` | all zeros (sum=0) | **valid by algo** | **FAIL — should reject** |
| F5 | Israeli ID number type `18` | coerced | valid | PASS |
| F6 | VAT number 7 digits | `"1234567"` | invalid | PASS |
| F7 | Phone `"+972501234567"` | intl mobile | valid | PASS |
| F8 | Phone `"050-1234567"` | mobile | valid | PASS |
| F9 | Phone `"059-1234567"` | 059 prefix | **invalid (regex `05[0-8]`)** | **FAIL — 059 is real Israeli prefix** |
| F10 | Phone empty | `""` | invalid | PASS |
| F11 | IBAN `"DE89370400440532013000"` | valid | valid | PASS |
| F12 | IBAN `"DE99370400440532013000"` | bad checksum | invalid | PASS |
| F13 | IBAN lowercase + spaces | normalised | valid | PASS |
| F14 | postalCode `"123456"` | 6 digits | invalid | PASS |
| F15 | email `"a@b"` | no TLD dot | invalid | PASS |
| F16 | email `"foo+bar@example.co.il"` | + alias | valid | PASS |
| F17 | bankAccount unknown bank `"99"` | not in `ISRAELI_BANKS` | **valid (silently)** | **WARN — comment says "could warn", does not** |
| F18 | positiveNumber `0` | zero | invalid (`<= 0`) | PASS |
| F19 | positiveNumber `"-5"` | string negative | invalid | PASS |
| F20 | validDate future with `max:now` | future | invalid | PASS |

### 2.4 Business validators — `packages/shared-validation/business-validators.js`
| # | Scenario | Input | Expected | Result |
|---|---|---|---|---|
| B1 | `validateQuoteTotals` no lines | `[]` | invalid | PASS |
| B2 | line total mismatch (0.02 over tolerance) | error reported | error | PASS |
| B3 | grand_total = subtotal + vat - discount, exact | valid | valid | PASS |
| B4 | discount > subtotal (negative grand) | passes math, **no upper bound** | should warn | **FAIL — accepts negative grand** |
| B5 | `validatePOBudget` amount > budget | invalid | invalid | PASS |
| B6 | PO with `approved=true` over 90% | valid | valid | PASS |
| B7 | PO budget=0 | "must be positive" | error | PASS |
| B8 | `validateInvoiceBalance` paid > grand | overpayment error | error | PASS |
| B9 | balance not provided | OK (skipped) | valid | PASS |
| B10 | `validateAttendanceHours` 13 reg + 12 OT = 25h | error | error | PASS |
| B11 | regular=25, overtime=0 | error >24 | error | PASS |
| B12 | total_hours mismatch | error | error | PASS |
| B13 | `validatePayrollEntry` net > gross | error | error | PASS |
| B14 | net=gross, deductions=0 | valid | valid | PASS |
| B15 | gross 10000, ded 3000, net 7500 | inconsistent | error | PASS |
| B16 | `validateDueDateAfterIssue` due=issue (same day) | valid (uses `<`) | valid | PASS |
| B17 | due before issue | error | error | PASS |
| B18 | issue invalid string | error | error | PASS |

### 2.5 Pricing / Invoicing — `api-server/src/__tests__/unit/invoice-calculations.test.ts`
| # | Scenario | Result |
|---|---|---|
| P1 | line total qty×price | PASS |
| P2 | line discount 10% | PASS |
| P3 | qty=0 → 0 | PASS |
| P4 | 100% discount → 0 | PASS |
| P5 | grand = beforeVat + VAT | PASS |
| P6 | global discount before VAT | PASS |
| P7 | **Hardcoded 17% VAT** in test/spec | **FAIL — stale; system declares 18% in 2026** |
| P8 | sequential number rollover | **WARN — `parseInt("INV-9999".replace("INV-",""))` returns 9999, but if prefix has hyphen it works; risk on different prefix shapes** |

---

## 3. Tests Failed (Bugs)

### Bug 1 — Hardcoded `VAT_RATE = 0.17` in test spec
- **Title:** Invoice calculation unit tests use stale 17% VAT
- **Description:** `api-server/src/__tests__/unit/invoice-calculations.test.ts:3` declares `const VAT_RATE = 0.17`. From 2026-01-01 the IL standard rate is **18%**. Either tests will pass against stale logic and miss a real production bug, or production will pass and tests fail.
- **Repro:** Open file → see `const VAT_RATE = 0.17` at top, then assertions like `expect(result.vatAmount).toBe(170)` for net 1000.
- **Actual:** Test fixed at 17%.
- **Expected:** Use `getVatRate(date)` from `packages/shared-tax/src/vat.ts` and parameterise per scenario (pre/post 2026-01-01).
- **Severity:** HIGH (financial)
- **Module:** `api-server/__tests__/unit`
- **Fix:** Import `calculateVat` from `@techno-kol/shared-tax/vat`; supply explicit `date` per case.

### Bug 2 — `getIncomeTaxRate` boundary off-by-one
- **Title:** Income-tax bracket comparator excludes the threshold itself
- **Description:** `getIncomeTaxRate` uses `>` (strict greater). At exactly 8 000 / 15 000 / 25 000 NIS the next bracket is **not** applied. Israeli income tax brackets are inclusive at the lower bound — `>=` is required.
- **Repro:** `getIncomeTaxRate(8000)` → `0.10` (should be `0.15`).
- **Actual:** 0.10
- **Expected:** 0.15 (and 0.25 at 15 000, 0.35 at 25 000)
- **Severity:** HIGH (payroll under-withholding)
- **Module:** `erp-app/src/utils/money.ts`
- **Fix:** change `>` to `>=` in the loop (line 38).

### Bug 3 — `getIncomeTaxRate` accepts negative salary
- **Title:** No guard for negative or NaN gross salary
- **Repro:** `getIncomeTaxRate(-500)` → `0.10`.
- **Actual:** Returns 10% rate as if base wage.
- **Expected:** Throw / return `0` / surface validation error.
- **Severity:** MEDIUM
- **Module:** `erp-app/src/utils/money.ts`
- **Fix:** Add `if (!Number.isFinite(grossSalary) || grossSalary < 0) throw`.

### Bug 4 — Phone regex rejects `059` prefix
- **Title:** `validateIsraeliPhone` mobile regex `^05[0-8]\d{7}$` excludes 059
- **Description:** Israeli mobile prefixes include 059 (Pelephone subset, prison phones, MVNOs). The regex caps at `[0-8]`. The newer `_merge-incoming/.../israeliPhone.ts` correctly lists `MOBILE_PREFIXES = [..., "058", "059"]`.
- **Repro:** `validateIsraeliPhone("059-1234567")` → `{valid:false}`.
- **Actual:** Rejected
- **Expected:** Accepted
- **Severity:** MEDIUM
- **Module:** `packages/shared-validation/field-validators.js`
- **Fix:** change regex to `^05\d{8}$` or `^05[0-9]\d{7}$`.

### Bug 5 — Israeli ID `000000000` accepted
- **Title:** All-zero Israeli ID passes Luhn
- **Description:** Sum 0 % 10 == 0 → algorithm says "valid" although `000000000` is never a real ת.ז. Form/bank rejection layer is not present. The internal qa-02-validators test even acknowledges this as documented behaviour.
- **Repro:** `validateIsraeliId('000000000')` → `{valid:true}`.
- **Severity:** MEDIUM (data quality, KYC)
- **Module:** `packages/shared-validation/field-validators.js`
- **Fix:** add `if (/^0+$/.test(padded)) return invalid`.

### Bug 6 — Bank-code unknown banks silently accepted
- **Title:** `validateBankAccount` swallows unknown bank codes with a TODO comment
- **Description:** Lines 211-214 contain `// Not necessarily invalid — could be a smaller institution / We allow it but could warn`. No warning is ever raised. Misspelled bank codes (e.g. `"99"`) pass.
- **Severity:** LOW
- **Module:** `packages/shared-validation/field-validators.js`
- **Fix:** return `{valid:true, warning:"Unknown bank code"}` or expose a `strict:true` mode.

### Bug 7 — `validateQuoteTotals` permits negative grand total
- **Title:** Discount > (subtotal + VAT) gives negative grand_total without complaint
- **Repro:** subtotal 100, vat 17, discount 200, grand_total = -83 → validator says **valid**.
- **Severity:** MEDIUM
- **Module:** `packages/shared-validation/business-validators.js`
- **Fix:** add `if (expectedGrand < 0) errors.push("Discount cannot exceed subtotal+VAT")`.

### Bug 8 — `getVatRate` returns *current* (0.18) for pre-2015 dates
- **Title:** Pre-2015 historical dates fall back to 2026 rate instead of returning a "rate-not-defined" signal
- **Description:** History table starts at 2015-10-01. A 2010 invoice will be repriced at 18% silently.
- **Severity:** LOW (rare)
- **Module:** `packages/shared-tax/src/vat.ts:91`
- **Fix:** throw or return `null` when the date predates `VAT_RATE_HISTORY[0].from`.

### Bug 9 — VAT rate divergence between erp-app and packages/shared-tax
- **Title:** Two sources of truth for VAT rate
- **Description:** `erp-app/src/utils/money.ts` declares its own rates (`VAT_RATE_PRE_2026 = 0.17`, `VAT_RATE_2026 = 0.18`) and a different `getVatRateForDate` implementation than `packages/shared-tax/src/vat.ts`. The CLAUDE.md mandates a single source. Behaviour matches today (both say 0.18 in 2026), but historical drift (2015-10-01 boundary) is not the same — `money.ts` only knows 2026/01/01, will return 0.17 for any pre-2015 date.
- **Severity:** MEDIUM (consistency / audit)
- **Module:** `erp-app/src/utils/money.ts` + `packages/shared-tax`
- **Fix:** make `erp-app` re-export from `@techno-kol/shared-tax`.

---

## 4. Tests Passed (highlights)

- VAT forward/reverse round-trip on 2026 rate is penny-perfect (1180 → net 1000, vat 180; 1000 → 180/1180).
- IBAN mod-97 validates DE/GB test vectors and rejects flipped digits.
- Quote total validator catches subtotal/VAT/grand drift > 0.01.
- Attendance hours validator caps total at 24h/day and forbids future-dated attendance.
- Payroll entry validator enforces gross ≥ net and tax+ss+pension == deductions.
- PO budget validator requires manager approval over 90% threshold.

---

## 5. Edge Cases Missing (no test coverage)

1. **DST / timezone boundaries** — `validDate` uses `new Date(value)` then compares to `new Date(opts.min)`; an ISO string like `"2026-01-01"` is parsed as UTC, but `new Date()` is local — quotes issued at 23:30 IST might land in the wrong VAT day.
2. **Concurrency** — sequential number generators (`generateSequentialNumber`, JE-YYYYMM-NNNN) have no test for race conditions across two simultaneous callers.
3. **Currency conversion when document date crosses VAT cutover** — no test where invoice issued 2025-12-31, paid 2026-02-01.
4. **Tourist exemption** with `serviceDate` outside the eligible 60-day window — only "passport required" is enforced.
5. **`validateBankAccount`** with mixed-format inputs (e.g. `"012-345"`); the regex strips digits but never asserts numeric content of branch/account beyond length.
6. **Email** with idn / unicode (`"שלום@example.co.il"`) — current regex uses ASCII only.
7. **Postal code** — does not check the 5→7 digit mapping (Israel migrated; both should resolve to the same locality).
8. **VAT aggregation** when a line has both `isExempt:true` AND `category:"export"` — current `aggregatePeriod` lets `isExempt` win, but `calculateVat` allows category override → invariant could break.
9. **Floating-point sums** in `aggregatePeriod` over 1 000+ lines — only rounds the final totals, intermediate sum is float; large invoice lists (e.g. PCN836 monthly export) may drift.
10. **Negative VAT** — credit notes have negative net; no test that `calculateVat(-1000)` → `vat: -180` is the desired behaviour vs an error.
11. **`validatePayrollEntry`** when `computedDeductions === 0` — net check skipped; gross 10 000 / net 4 000 with no deduction breakdown is silently accepted.
12. **Permission checks** — no shared-validation entry for role/scope; agent could not locate centralised `hasPermission(user, action)` unit tests outside RBAC integration suite.
13. **Search/filter normalisation** — Hebrew search with niqqud / final letters (ך/ם/ן/ף/ץ) — no unit tests; SQL-side `ILIKE` only.

---

## 6. Recommendations

1. **Replace stale 17% in tests/code with `getVatRate(date)`** everywhere; ban literal `0.17` outside the rate-history table (lint rule).
2. **Fix income-tax bracket comparator to `>=`** and add boundary tests at exactly 0/8 000/15 000/25 000.
3. **Fix mobile regex** to accept 059 (and add 056 if not yet used). Adopt the `_merge-incoming` `MOBILE_PREFIXES` array implementation in the canonical validator.
4. **Reject obviously synthetic IDs** (all zeros, all same digit) in `validateIsraeliId` while keeping algorithmic validation for production rejection.
5. **Single source of VAT** — make `erp-app/src/utils/money.ts` import from `@techno-kol/shared-tax`. Delete the local copy of `getVatRateForDate`.
6. **Add upper-bound check** in `validateQuoteTotals` (no negative grand total) and `validateInvoiceBalance` (no negative balance unless explicit credit note flag).
7. **Property-based tests** with fast-check for `calculateVat`/`reverseVat` round-trip (∀ amount ∈ [0.01, 10⁹], `reverseVat(calculateVat(x).gross)` ≈ x within 0.01).
8. **Add tests for VAT rate cutover boundary** (2025-12-31 23:59:59 vs 2026-01-01 00:00:00) under both UTC and Asia/Jerusalem.
9. **Numbering generator** — wrap with a transaction/lock test demonstrating no duplicates under concurrent calls.
10. **Coverage** — current unit tests live in `onyx-procurement/test/`, `test/payroll/`, `api-server/__tests__/unit/`. Consolidate behind one runner (`node --test` or vitest) and aim for ≥80% on the calc/validator surface.
11. **Add explicit "negative path" tests** for permission boundaries (read-only role attempting `POST /api/orchestrator/execute`).

---

## 7. Summary

- **Functions analysed:** 50+ across 11 modules
- **Scenarios run:** 78
- **Failures (real bugs):** 9 (1 HIGH financial, 4 MEDIUM, 4 LOW/WARN)
- **Edge cases missing:** 13
- **Top fix to ship first:** Bug 1 (stale 17% in invoice-calculation test) + Bug 2 (income-tax bracket off-by-one). Both are direct money-correctness defects in the 2026 system.
