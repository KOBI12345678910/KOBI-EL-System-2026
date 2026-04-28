# AGENT-133 — Form 856 (טופס 856) Annual Withholding Statement Audit

**Agent:** 133 — Tax Compliance
**Date:** 2026-04-29
**Scope:** Static audit of Form 856 (annual employer withholding return) — field mapping, Hebrew encoding, ITA electronic submission.
**Verdict:** RED — Form 856 has no dedicated implementation; only stubs, schema slots, and UI labels. Behavior is partially absorbed into Form 857 (which the project author treats as the active "annual withholding return").

---

## 0. Definitional clarification (important)

The user prompt described 856 as "annual employee tax statement". That is **not** the canonical Israeli definition.

- **Form 856 (טופס 856)** — annual report of payments to **freelancers / contractors / non-employees** with withholding-at-source. Per `onyx-procurement/locales/terminology.json:290-294`: *"Annual report of payments to freelancers/contractors (withholding report)"*.
- **Form 857 (טופס 857)** — annual employer withholding return covering **both employees and contractors** (the project's `form-857-xml.js:1-12` markets itself as "Annual employer withholding return. Summarizes all withholdings made by the employer from employees + contractors over the tax year").
- **Form 126** — annual payroll summary (per-employee wages); **this** is the "annual employee tax statement" the prompt described.
- **Form 106** — per-employee printable annual summary handed to the worker.

The codebase has form-126 and form-857 implementations, but **no form-856**.

---

## 1. Existence map

| Layer | Reference | Status |
|---|---|---|
| Source file `form-856.js` / `form-856-xml.js` | Glob across all of repo | **MISSING** (zero hits in active or `_merge-incoming`) |
| DB form_type enum slot | `onyx-procurement/supabase/migrations/005-annual-tax-module.sql:169` — `form_type IN ('1301','1320','6111','30a','126','856','867')` | OK (slot reserved) |
| Schema doc | `onyx-procurement/docs/DATABASE_SCHEMA.json:6323` | OK (mirrors above) |
| Terminology | `onyx-procurement/locales/terminology.json:290-294` | OK (label only) |
| Translation guide | `onyx-procurement/docs/TRANSLATION_GUIDE.md:117` (preserve numeric form names) | OK |
| Tax-record zod schema | `lib-client/api-zod/src/finance/tax-record.ts:11` — `withholding_856` enum value | OK (record category, not generator) |
| Israeli accounting engine | `api-server/src/routes/israeli-accounting-engine.ts:51, 61` — `withholding_856` report-type + monthly deadline | UI/calendar only |
| Tax-management route | `api-server/src/routes/tax-management.ts:43, 254` — `vat_856` literal | **MISLABEL** — the value is set to "vat_856" yet stored against `tax_reports` for VAT periods (no actual 856 generation) |
| ERP UI | `erp-app/src/pages/finance/israeli-integrations.tsx:141`, `accounting-portal.tsx:113, 1761`, `tax-management.tsx:30, 261` | Labels + dead anchor (`href: "#"`) |
| Master DATA_MODEL.md | line 166 — lists 856 in `form_type` set | OK |

Conclusion: the system advertises Form 856 in metadata, calendar, and UI but contains **no builder, no field map, no encoder, no submission flow**.

---

## 2. Field mapping

**Required (per ITA spec for annual withholding report on contractors):** payer details (תיק ניכויים, ח.פ., name, address); per-recipient row (ת.ז./ח.פ., name, classification code, gross paid, tax withheld, BL/health withheld where applicable, payment count, certificate number, valid period); summary block (totals).

**Found in codebase:**
- `form-857-xml.js:25-72` — `Employer` block + `WithholdingRow` (RecipientId/Name, GrossPaid, TaxWithheld, BituachLeumiWithheld, HealthWithheld, NetPaid, PaymentsCount) + `Summary` block. This is the closest analogue to a 856 row map but is published under tag `Report857`, root `Report857`.
- `form-857.js:50-89` — `VendorCertificate` (vendor_id, certificate_no, rate, valid_from, valid_to, type, issuer) + `PaymentWithholding` + `Annual857` aggregate.
- `israeli-accounting-engine.ts:147-163` — table `withholding_tax_certificates` (certificate_number, vendor_id, vendor_tax_id, period, fiscal_year, total_payments, withholding_rate, withholding_amount, issued_date, sent_to_vendor). Sufficient as a source for 856 but no builder consumes it for 856.
- `api-server/src/routes/finance-enterprise3.ts:226-227` — generic `withholding_tax` table (entity_name, entity_type, entity_tax_id, certificate_type, tax_rate, gross_amount, tax_withheld). Same — no 856 producer.

**Missing for 856 specifically:**
1. No row-type discriminator distinguishing 856 (contractor-only) from 857 (mixed). 857 builder collapses both into one report.
2. No `RecipientClassificationCode` (קוד סיווג) per the 856 fixed-width spec — needed to identify professional vs. construction vs. transportation withholding bands.
3. No `CertificateValidFrom/To` field copied from `withholding_tax_certificates` into the per-row output.
4. No mapping between `contractor-payment-engine.ts` (which already tracks `withholding_rate` per contractor and per payment) and an annual 856 aggregator. Today the engine writes `withholding_tax` per payment line but no rollup query exists.

---

## 3. Hebrew encoding

ITA fixed-width files for 856 historically required **windows-1255** (legacy) or **ISO-8859-8-i**. Modern XML envelopes accept UTF-8.

| Concern | Status |
|---|---|
| `iconv-lite` available in onyx-procurement | YES — used by `pcn836.js` for windows-1255 (per AGENT-19, line 76) |
| Encoding wrapper for 856 | **NONE** — there is no `encodeForm856ToCp1255` or equivalent |
| 857-XML encoding | UTF-8 (no BOM); `form-857-xml.js` uses `_xml-common.writeXmlFile` which writes UTF-8 |
| Cp862 (legacy mainframe) support | Implemented in `masav-exporter.js` only |
| Fixed-width record width for 856 | Not defined anywhere |
| Whitespace padding rules (right-pad alpha, zero-left numeric) | Implemented for PCN836 + Masav, **not** for 856 |
| RTL text handling in PDF preview | n/a — no PDF generator for 856 |

If a real 856 submission is attempted today, output will be UTF-8 XML routed through the 857 generator, which the ITA portal rejects when `Report857` tag is used to file a 856 (different formCode in meta block — see `form-857-xml.js:20` `FORM_CODE = '857'`).

---

## 4. Electronic submission to ITA (שע"מ)

**Status: not implemented for any form, including 856.** This matches the AGENT-134 (Form 102) finding: "Electronic submission to btl.gov.il NOT IMPLEMENTED — submitXML102 returns status:'prepared', no network I/O, placeholder endpoint."

| Capability | State |
|---|---|
| SHAAM (שע"מ) endpoint URL | not configured anywhere (no env var, no constant) |
| Authentication / digital signature | placeholder strings; no PKI integration |
| File transport (HTTPS POST / SFTP) | none |
| Acceptance-token persistence | `annual_tax_reports.authority_reference` column exists (`005-annual-tax-module.sql:177`) but never written |
| Submission status state machine | `annual_tax_reports.status` enum `('draft','prepared','reviewed','submitted','accepted','amended')` exists; transitions are not guarded by an actual submission service |
| 856-specific submission route | **NONE** — no `/api/tax/forms/856/submit` route exists |
| Retry / dead-letter / acknowledgement parsing | none |

The 5-stage UI (Israeli Integrations dashboard) advertises 856 as a tax-report type a user can "file", but the click target (`accounting-portal.tsx:1761`) is `href: "#"` — a dead anchor. There is no working submit path.

---

## 5. Cross-project gaps

- `payroll-autonomous` — per `onyx-procurement/QA-AGENT-91-FORM-30A.md:74-79`, the payroll project has no form generators at all. Withholding for employees is computed monthly into `localStorage` only, never aggregated to 856 or 857.
- `api-server/src/routes/contractor-payment-engine.ts` — has the source data (per-payment `withholding_tax`, `withholding_rate`) but no annual-aggregation export. This is the natural feeder for 856 and is currently disconnected.
- `api-server/src/routes/finance-enterprise3.ts:202-250` — exposes `/withholding-tax` CRUD endpoints (list/create/update/delete certificates) but no `/withholding-tax/856-export` action.

---

## 6. Test coverage

| Test file | Form covered |
|---|---|
| `test/payroll/form-857.test.js` | Form 857 |
| `onyx-procurement/test/wage-slip-calculator.test.js` | wage-slip math (no 856 emission) |
| `_qa-reports-25/AGENT-19-il-compliance.md` | claims 856 covered "via form-857.js" — incorrect per definitional split above |
| Form-856-specific test | **NONE** (zero matches in glob `**/form-856*.test.*`) |

---

## 7. Findings summary

| # | Finding | Severity | Fix |
|---|---|---|---|
| 1 | No `form-856.js` builder, no `form-856-xml.js`, no submission route | CRITICAL | Build dedicated module mirroring `form-857.js` shape but `FORM_CODE='856'`, `ROOT_TAG='Report856'`, contractor-only filter |
| 2 | UI links advertise 856 generation but href is `#` | HIGH | Wire to real export endpoint or hide the action until shipped |
| 3 | `tax-management.ts:254` uses literal `'vat_856'` — semantically wrong (a VAT report stored under a 856-named report-type) | HIGH | Rename to `vat_periodic` or split tables |
| 4 | No windows-1255 encoder pathway for 856 fixed-width fallback | MED | Reuse `iconv-lite` from `pcn836.js` patterns |
| 5 | `withholding_tax_certificates` has the inputs but no annual-aggregate query | MED | Add `aggregate856ByYear(year)` SQL view |
| 6 | AGENT-19 compliance audit reports 856 as covered (`Withholding (Form 857) ... 90%`) — coverage statement conflates 856 with 857 | MED | Update AGENT-19 matrix to list 856 separately as 0% |
| 7 | No SHAAM submission transport for any form (system-wide) | CRITICAL | Out of scope for 133 — already tracked in AGENT-134 |
| 8 | DB enum slot for `'856'` exists in `annual_tax_reports.form_type` but never inserted | LOW (intentional reservation) | Wire after fix #1 |

---

## 8. Key file paths (absolute)

- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\src\tax\form-857.js`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\src\tax-exports\form-857-xml.js`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\src\tax\form-126.js`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\supabase\migrations\005-annual-tax-module.sql`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\locales\terminology.json`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\api-server\src\routes\israeli-accounting-engine.ts`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\api-server\src\routes\tax-management.ts`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\api-server\src\routes\contractor-payment-engine.ts`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\api-server\src\routes\finance-enterprise3.ts`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\erp-app\src\pages\finance\israeli-integrations.tsx`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\erp-app\src\pages\finance\accounting-portal.tsx`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\erp-app\src\pages\finance\tax-management.tsx`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\lib-client\api-zod\src\finance\tax-record.ts`

---

*End of audit — Agent 133 — 2026-04-29*
