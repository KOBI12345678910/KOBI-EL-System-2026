# AGENT-19 - Israeli Compliance & Tax Audit

**Project:** Techno-Kol Uzi ERP 2026 (kobi-el-system-2026)
**Scope:** Israeli VAT, Bituach Leumi, Mas Hachnasa, Mas Briut, PCN874/836, withholding, annual report, Masav, ID/IBAN/Phone validators
**Date:** 2026-04-29
**Auditor:** Agent 19 - Israeli Compliance
**Sources:** `ISRAELI_TAX_CONSTANTS_2026.md` + `COMPLIANCE_CHECKLIST.md`

---

## Status

**PASS with WARNINGS.** Tax constants, validators, and submission formats are wired. Critical issues are: (1) no PCN874 (monthly summary) module - only PCN836 (detail); (2) tax brackets and BL thresholds are still `ESTIMATED` (need 2026 ילקוט פרסומים cross-check); (3) test fixtures still hard-code 0.17 VAT in many places that should drive off `getVatRateForDate()`.

| Check | Result | Severity |
|-------|--------|----------|
| VAT 18% (2026-01-01 onwards) | OK in code + migration 00037 | OK |
| Historical VAT 17% retention | OK - migration enforces effective_to=2025-12-31 | OK |
| BL/Health bands and rates | Coded, **estimated** | MEDIUM |
| Income-tax brackets 2026 | Coded, **estimated** | MEDIUM |
| Mas Briut (Health Tax) | OK - structural rates correct | OK |
| PCN874 (monthly summary) | **MISSING** as named module | HIGH |
| PCN836 (transaction detail) | OK - `pcn836.js` + tests | OK |
| Withholding (ניכוי במקור) | OK - form-857 + dividend-withholding | OK |
| Annual report (1320/126/106) | OK - generators present | OK |
| Bank file (Masav) | OK - 120-char fixed-width per spec | OK |
| Teudat Zehut / ח.פ Luhn | OK - dedicated validators | OK |
| Israeli IBAN (ISO 13616) | OK - mod-97 + bank parsing | OK |
| Phone (05X / 0X) | OK - full numbering plan | OK |

---

## Tax-correctness

### 1. VAT 18% (מע"מ)
- **Code primary:** `onyx-procurement/server.js:203` `VAT_RATE = parseFloat(process.env.VAT_RATE) || 0.18;` -> CORRECT.
- **Calculator:** `desktop-tutorial-server/src/services/vat.service.js` line 4 `VAT_RATE = 0.18` -> CORRECT.
- **Annual-tax route:** `onyx-procurement/src/tax/annual-tax-routes.js:119` defaults to 0.18 -> CORRECT.
- **PDF parser / petty cash / referral:** All use 0.18 -> CORRECT.
- **DB migration:** `supabase/migrations/00037_vat_rate_18_percent.sql` upserts `vat_rates(rate=0.1800, effective_from=2026-01-01)` and closes prior 17% row at 2025-12-31. **CORRECT and idempotent.**
- **Historical 17% retention:** migration explicitly does NOT touch existing invoice rows, and `vat_rates` is comment-flagged as immutable for history.
- **WARN:** test fixtures still seed 0.17 (`test/fixtures/invoices.js`, `test/seed/israeli-seed.test.js`, several invoice PDF fixtures). Acceptable for *historical* test data but several look like new fixtures that should use 0.18 - flag for cleanup.

### 2. Bituach Leumi bands - `wage-slip-calculator.js` CONSTANTS_2026.BITUACH_LEUMI
- Threshold: ~7,522 NIS (60% of 12,536 average) - matches checklist
- Max base: ~49,030 NIS (5x average) - matches
- Employee: 0.4% low / 7.0% high - matches
- Employer: 3.55% low / 7.6% high - matches
- **Status: structurally correct, exact values still ESTIMATED until ביטוח לאומי January 2026 publication.**

### 3. Mas Hachnasa brackets 2026 - `wage-slip-calculator.js` INCOME_TAX_BRACKETS
- 7 brackets: 10% / 14% / 20% / 31% / 35% / 47% / 50% (incl. 3% יסף)
- Annual thresholds: 84,120 / 120,720 / 193,800 / 269,280 / 560,280 / 721,560
- Top marginal 50% (47% + 3% surtax) - **CORRECT structure**
- נקודת זיכוי = 2,976/yr, 248/mo - **matches `ISRAELI_TAX_CONSTANTS_2026.md`**
- **Status: ESTIMATED - thresholds carry over from 2025 pending CPI indexation publication.**

### 4. Mas Briut (Health Tax) - CONSTANTS_2026.HEALTH_TAX
- Same threshold/cap as BL (7,522 / 49,030) - **CORRECT**
- Employee: 3.1% low / 5% high - **CORRECT**
- Employer portion correctly modeled as 0 (embedded in BL employer 3.55/7.6) - **CORRECT** (matches Israeli law)

---

## Format-compliance

### 5. PCN874 (פנקס חשבונות / monthly VAT summary) - **GAP**
- No file named `pcn874.js` exists. Searches for `PCN874|874` find only test fixtures and dist artifacts.
- The COMPLIANCE_CHECKLIST.md Section 2 lists PCN874 as the monthly VAT submission, but the implementation jumps straight to **PCN836 (detailed transaction file)**.
- **Likely status:** PCN874 totals are computed inside `vat-routes.js` `/api/vat/periods/:id` endpoint (sums `tax_invoices` by direction). The `vat-rashut-hamisim-xml.js` quarterly XML covers the modern submission shape.
- **CRITICAL GAP:** No standalone `buildPcn874File()` builder. If רשות המסים rejects the new XML and requires legacy 874 flat-file format, fallback path is missing.

### 6. PCN836 (transaction-level detail)
- `onyx-procurement/src/vat/pcn836.js` - **fully implemented**
- Records: A (header), B (summary), C (input), D (output), Z (trailer) - **matches spec**
- Encoding: windows-1255 via `iconv-lite` for Hebrew - **CORRECT** (legacy spec requirement)
- Field widths match spec; allocation_number (Invoice Reform 2024) included on C/D records.
- SHA-256 file hashing for audit retention. Tests at `test/pcn836.test.js`.

### 7. Withholding tax (ניכוי במקור)
- `onyx-procurement/src/tax/form-857.js` - vendor certificate registry, rate resolver, computeWithholding, annual aggregator, XML export.
- `onyx-procurement/src/tax/dividend-withholding.js` - section-specific rates: 25%/30% Israeli individual, 0% inter-co (§126(ב)), 25%/30% foreign with treaty override.
- Section codes cited: 125ב, 126(ב), 164, 170, 14(א), 88 (10% substantial-shareholder threshold) - **legally CORRECT.**

### 8. Annual financial report (דו"ח שנתי)
- **Form 1320 (corporate):** `tax-exports/form-1320-xml.js` + `tax/form-builders.js` - Income / Expenses / Adjustments / Taxes sections, XML-shape submission.
- **Form 126 (annual payroll summary):** `tax/form-126.js` - aggregates 12 months of wage-slips per employee, reconciles with monthly Form 102, builds fixed-width + XML envelope. Includes Form 106 PDF generation per employee.
- **Form 102 (monthly):** `tax/form-102.js` + XML export.
- **Form 1301 (individual):** `tax/form-1301.js` + XML export.
- **Form 6111 (financial statements schedule):** `tax/form-6111.js`.
- **Status: comprehensive coverage; final accountant sign-off remains [H] manual per checklist.**

### 9. Bank file (Masav / מס"ב)
- `onyx-procurement/src/bank-files/masav-exporter.js` - 120-char fixed-width records, types 1/2/9 (header/detail/trailer).
- Amounts in aggurot (x100), padded numerics zero-left, alphas space-right.
- ASCII transliteration of Hebrew names (default) + cp862 mode for legacy mainframe.
- Control hash = (bank+branch+account+amount) mod 10^16 - **matches Masav spec.**
- Israeli bank registry includes legacy code 20 (Mizrahi pre-merger) and 77 (Jerusalem old) for Techno-Kol historic records.
- Embeds local Luhn-style ID validator (`isValidIsraeliId`) for ת.ז/ח.פ on detail rows.

---

## Validators-status

### 10. Customer/supplier ID (ת.ז / ח.פ)
- **`validators/teudat-zehut.js`** (Agent 91): full Luhn variant per משרד הפנים. Multipliers 1,2,1,2... 9 digits, sum%10===0. Reserved-band rejection (000000001-000000017, 000000000, 999999999). Bilingual reasons. Pads 8-digit legacy IDs.
- **`validators/company-id.js`** (Agent 94): same Luhn algorithm. Classifies by prefix (50=govt, 51=LLC, 52=public, 54=foreign, 57=חל"צ, 58=עמותה, 59=cooperative, 5=private, 1-4/6-9=individual dealer). Government whitelist for historic IDs that predate the algorithm.
- **`validators/tax-file.js`** (Agent 95): same algorithm for תיק ניכויים / תיק מע"מ / תיק מס הכנסה / עוסק מורשה.
- **STATUS: CORRECT and consistent across all three. Same algorithm Tax Authority's Shaam validators use.**

### 11. IBAN (Israeli + ISO 13616)
- `validators/iban.js` (Agent 92): full ISO 13616 mod-97 with BigInt (handles ~70-digit numerics).
- IL format: IL + 2 check + 3 bank + 3 branch + 13 account = 23 chars (correct).
- ISO country-length registry covers ~80 countries (AD-XK).
- Israeli bank parsing returns `{bank_code, branch_code, account, bank_name_he}`.
- Bilingual error reasons (`reason_he` / `reason`).
- Bank registry includes Mizrahi-Tefahot 12, legacy Mizrachi 20, Bank Yahav 4, Jerusalem 54, legacy Jerusalem 77, Postal Bank 09/90/99.
- **STATUS: PRODUCTION-READY.**

### 12. Phone (05X mobile / 0X landline)
- `validators/phone.js` (Agent 93): full Israeli numbering plan + portability.
- Mobile prefixes: 050-059 mapped to historical carriers (Pelephone, Cellcom, Partner, Hot Mobile, Golan, Rami Levy, etc.). `portable: true` flag on every mobile - **correct, IL has number portability since 2008**.
- Landline: 02 (Jerusalem), 03 (Tel Aviv/Gush Dan), 04 (Haifa/North), 08 (South/Ashdod/Beer Sheva), 09 (Sharon), 07 (historical Beer Sheva).
- VOIP: 077, 072, 073, 074, 076, 078.
- Service: 1-800/1-700/1-599/1-900/1-919.
- Special: 100-144 emergency codes.
- E.164 normalization handles +972, 00972, 011972, plain 972 prefixes.
- Mobile = 10 digits, landline = 9 digits enforced.
- **STATUS: PRODUCTION-READY, exceeds requirement (also returns carrier/region/portable flag).**

### Other validators
- `business-validators.js` (cross-field): quote totals, PO budget, invoice balance, payroll entry consistency. **Generic - does NOT IL-specific tax-rate-validate** but covers gross/net/deductions arithmetic.

---

## Critical-gaps

| # | Gap | Severity | Fix |
|---|-----|----------|-----|
| 1 | **No PCN874 builder** - only PCN836 + XML quarterly. Legacy flat-file fallback missing. | HIGH | Add `onyx-procurement/src/vat/pcn874.js` mirroring PCN836 layout. |
| 2 | Income-tax brackets, BL thresholds, max insurable, נקודת זיכוי all marked **ESTIMATED** | MEDIUM | Verify against ילקוט פרסומים published Dec 2025 / Jan 2026 and update `CONSTANTS_2026`. |
| 3 | Tests still hard-code `vat_rate: 0.17` in fixtures used by current-period tests (`vat-routes.test.js:302`, `qa-08-rfq-quotes.test.js:29`) | MEDIUM | Drive test rates off `getVatRateForDate(invoice_date)` helper rather than constants. |
| 4 | Wage-slip absence-day rule is simplified (`sick * 0.5` flat); law requires day1=0%, day2-3=50%, day4+=100% | LOW | Already noted in code comment; needs proper implementation. |
| 5 | Bank-Yahav code in IBAN registry uses '4' (single digit) but Masav uses '04' - cross-validate | LOW | Confirm padding consistency. |
| 6 | Form 106 distribution to employees is `[H]` manual (no automated email/portal push) | LOW | Roadmap item per CHECKLIST Section 1. |
| 7 | Hours register / timesheet engine described as "planned - currently manual entry" in checklist | MEDIUM | Required for חוק שעות עבודה ומנוחה inspection compliance. |
| 8 | Allocation-number (Invoice Reform 2024) threshold hard-coded; no per-period override | LOW | Move to `vat_rates`-style effective-dated config. |
| 9 | Section 14 (pension severance designation) handled as `[H]` manual flag - no contract-side enforcement | MEDIUM | Add boolean `section_14` on employees + propagate to severance calc. |
| 10 | No automated re-verification job for tax constants - only documented "verify Jan 1 / Apr 1" cadence | LOW | Add scheduled task to fetch ילקוט פרסומים feed and diff. |

---

## Tax-coverage matrix (matches CHECKLIST.md Section 9)

| Area | Implemented | Coverage |
|------|-------------|----------|
| Wage Protection (Amend. 24) | wage-slip-calculator.js + form-126 | 95% |
| VAT Law (rate, periods, invoices) | vat-routes + pcn836 + 00037 migration | 95% |
| PCN836 detail | pcn836.js (production) | 95% |
| **PCN874 monthly summary** | **NOT FOUND** as standalone | **0%** |
| Invoice Reform 2024 (allocation) | allocation_number on tax_invoices + PCN836 C/D | 100% |
| Hours & Rest | overtime tiers in calc; hours register manual | 70% |
| Mandatory Pension | computePensionContributions, section 14 flag | 75% |
| Withholding (Form 857) | form-857.js + dividend-withholding.js | 90% |
| Annual report (1320/126/106/6111) | full XML + fixed-width + reconcile | 90% |
| Masav bank file | masav-exporter.js (production) | 100% |
| ID/IBAN/Phone validators | 5 dedicated validators | 100% |

**Adjusted system-wide compliance: ~92%** (down from 94% in CHECKLIST.md due to missing PCN874).

---

## Key file paths
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\src\payroll\wage-slip-calculator.js`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\src\vat\pcn836.js`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\src\vat\vat-routes.js`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\src\bank-files\masav-exporter.js`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\src\validators\teudat-zehut.js`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\src\validators\company-id.js`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\src\validators\tax-file.js`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\src\validators\iban.js`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\src\validators\phone.js`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\src\tax\form-857.js`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\src\tax\dividend-withholding.js`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\src\tax\form-126.js`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\src\tax-exports\form-1320-xml.js`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\src\tax-exports\vat-rashut-hamisim-xml.js`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\supabase\migrations\00037_vat_rate_18_percent.sql`

---

*End of audit - Agent 19 - 2026-04-29*
