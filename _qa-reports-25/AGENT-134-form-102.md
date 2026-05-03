# AGENT-134 — Form 102 (טופס 102) Bituach Leumi Monthly Audit

**Agent:** 134 — Tax Compliance
**Date:** 2026-04-29
**Scope:** Static audit of all Form 102 generators (income-tax + BL versions).
**Verdict:** YELLOW — math is correct against documented constants, but 3 production-blocking issues remain: BL agora rounding (Agent 04 carry-over), zero real submission transport (stub-only), no end-to-end reconciliation against issued payslips.

---

## 0. Executive summary

| Item | Status | Severity |
|---|---|---|
| Three independent Form 102 implementations exist | DUPLICATION | MED |
| Per-employee line items (BL exporter `bl/form-102-bl.js`) | OK — one detail row per employee | OK |
| Per-employee line items (Tax engine `tax/form-102.js`) | **AGGREGATE-ONLY** — collapses rows | HIGH |
| BL rounding (Agent 04 flag) | **NOT FIXED** — still half-away-from-zero, not floor-to-agora | HIGH |
| Constants threshold/ceiling/rates | MATCH (7,522 / 49,030 / 0.4-7% / 3.55-7.6% / 3.1-5%) | OK |
| Totals reconciliation (sections sum == grand total) | OK, tested | OK |
| Reconciliation vs `wage_slips` table | **NONE** — engine never reads issued slips from DB | HIGH |
| Controlling-shareholder treatment | **INCONSISTENT** between the two engines | HIGH |
| Foreign / visitor / youth / retiree status codes | OK (BL exporter only) | OK |
| Sectoral adjustments (kibbutz/security/agriculture) | OK (BL exporter only) | OK |
| Due date (15th of next month, year rollover) | OK, tested | OK |
| Electronic submission to btl.gov.il | **NOT IMPLEMENTED** — stub envelope, placeholder endpoint | HIGH |
| Digital signature / auth token | PLACEHOLDER strings | HIGH |
| Fixed-width BL file (H/D/T, 80/100/80, CRLF, UTF-8) | OK | OK |
| Agorot encoding in fixed-width file | OK (12-digit zero-padded) | OK |
| BL response parser (ACK/REJ/PARTIAL/JSON) | OK + tested | OK |
| Late-payment interest | OK (4%/365), tested | OK |
| Test coverage | 68 tests across 2 suites | OK |
| Empty payroll / negative gross / non-object rows | Handled with warnings | OK |

---

## 1. Files audited

| File | Lines | Role |
|---|---|---|
| `onyx-procurement/src/tax/form-102.js` | 869 | Income-tax-side aggregator (Agent Y-003) — sections, due date, stub XML |
| `onyx-procurement/src/tax-exports/form-102-xml.js` | 152 | XML serializer (Agent 70) — `Report102` root, schema-only |
| `onyx-procurement/src/bl/form-102-bl.js` | 758 | BL-side full pipeline (Agent Y-012) — per-employee, fixed-width, response parser, interest |
| `onyx-procurement/test/tax/form-102.test.js` | 410 | 27 tests on the tax engine |
| `onyx-procurement/test/bl/form-102-bl.test.js` | 596 | 41 tests on the BL exporter |
| `onyx-procurement/src/payroll/wage-slip-calculator.js` L217-236 | — | Source per-slip BL/Health calc (must match form-102 totals) |

**Three Form 102 surfaces** for one regulatory filing:
1. `tax/form-102.js` — aggregator + stub XML for רשות המסים
2. `tax-exports/form-102-xml.js` — alternative XML schema (`Report102`)
3. `bl/form-102-bl.js` — BL-portal-specific exporter with per-employee detail

These are not wired together. A consumer must pick the right one. **Risk:** the same period filed via different surfaces will produce different XML envelopes, and (because of finding §3 below) potentially different numeric totals if rows route through different rate tables.

---

## 2. Per-employee line items — verification

### 2.1 BL exporter (`src/bl/form-102-bl.js`) — PASS

`generate102BL` returns `report.employees: []` with ONE row per input employee, each containing:
- `id`, `tz`, `name`, `statusCode`, `sector`
- `grossWage`, `insurableBase` (clamped at ceiling), `lowBase`, `highBase`
- `employeeBL`, `employerBL`, `healthTax`
- `totalEmployee`, `totalBL`, `totalAll`

`buildPayrollFile` writes one `D` (detail) record per employee (line 527). Test `buildPayrollFile — header/detail/footer widths match spec` (L328) verifies 1 header + N details + 1 footer. **Correct.**

### 2.2 Tax engine (`src/tax/form-102.js`) — FAIL (aggregate only)

`generate102` returns `result.sections: []` where each section is a category bucket (`incomeTax`, `bituachLeumiEmployee`, etc.) with summed `amount` + `count`. **No per-employee row survives the call.** The XML stub similarly emits only category totals. For controlling shareholders there's a separate roll-up section but still no per-employee detail.

**Impact:** if BL rejects a single TZ checksum (`importBLResponse` reports `E 123456789 E01 invalid tz checksum`), there is no employee-level audit trail in the tax-engine output to correlate the rejection back to a payroll row. The BL exporter handles this; the tax engine does not.

**Recommendation:** Either (a) make `tax/form-102.js` also emit `result.rows: []` mirroring the input, or (b) declare it the "summary" engine and route all per-employee filing through `bl/form-102-bl.js`.

---

## 3. BL rounding (Agent 04 carry-over) — NOT FIXED

Agent 04 (AGENT-04-runtime-payroll.md §6) flagged: *"the actual btl.gov.il rate engine rounds **down** to the nearest agora — calculator rounds half-away-from-zero. Will drift vs. actual tax-authority filings by 1 agora per line."*

**Status as of 2026-04-29:**

| Engine | Function | Code | Rounding |
|---|---|---|---|
| `wage-slip-calculator.js` | `round` | `Math.round(n * 100) / 100` | half-away-from-zero |
| `tax/form-102.js` L213 | `round2` | `Math.round((n + Number.EPSILON) * 100) / 100` | half-away-from-zero |
| `bl/form-102-bl.js` L145 | `round` | `Math.round(n * factor) / factor` | half-away-from-zero |

**None of the three engines floors to agora.** Agent 04's recommendation #6 ("Switch BL rounding to floor-to-agora to match tax-authority engine") is unimplemented.

**Worked example:** gross 7,523 NIS:
- Engine: `7522 * 0.004 + 1 * 0.07 = 30.088 + 0.07 = 30.158` → rounds to **30.16**
- BL portal expectation (floor): **30.15**

For 100 employees this is up to ₪1.00/month drift — small in absolute terms but causes batch rejection on strict-match validation, which is why Agent 04 marked it production-blocking.

**Compounding factor:** the wage-slip calculator (L225-227) already rounds each component before passing it on. If `form-102` aggregator receives `blEmployeePortion: 30.16` from the slip and trusts it (per `computeBituachLeumi` L262-269), the floor-vs-half rounding error is locked in upstream and cannot be fixed by the form-102 layer alone.

**Required fix:** introduce `floorAgora(n) = Math.floor(n * 100) / 100` and use it in BOTH the wage-slip calculator AND both form-102 engines. Agorot-integer pipeline (Agent 04 rec #11) would solve this structurally.

---

## 4. Totals match payslips — partial

The form-102 engines accept `rows` from the caller; they do **NOT** read `wage_slips` from the database. The expected pipeline:

```
wage-slip-calculator → wage_slips table → (caller queries) → form-102.generate102()
```

**Gap:** there is no module in this worktree that does `SELECT FROM wage_slips WHERE period_year=Y AND period_month=M` and feeds the result into `generate102`. A grep for `wage_slips` + `form-102` together returns zero matches. The integration is theoretical only.

**Per-row reconciliation:**
- If caller passes `blEmployeePortion` / `blEmployerPortion` / `healthPortion` (from already-issued slips), `computeBituachLeumi` and `computeHealth` trust them (L262-269 / L315-317). So a faithful caller WOULD produce totals matching the issued slips, modulo the rounding drift in §3.
- If caller passes only `grossWages`, the form-102 engine recomputes from scratch using its own `CONSTANTS_2026`. **Risk:** these constants are duplicated from `wage-slip-calculator.CONSTANTS_2026` and could drift independently. The comment at line 27 of `bl/form-102-bl.js` ("Values match … kept in sync") is a manual claim, not enforced.

**Recommendation:** Single source of truth. Have form-102 import the constants from a `payroll-constants` module and have wage-slip-calculator do the same. Today the file has `// kept in sync — single source of truth for rates` as a comment but the constants are physically duplicated.

---

## 5. Controlling-shareholder rate inconsistency — HIGH

Two engines disagree on what "בעל שליטה" means for the employer portion:

| Engine | Employer portion for CS at 10,000 NIS gross |
|---|---|
| `tax/form-102.js` (`computeBituachLeumi`, L277-285) | `10000 × 0.076 = 760` (flat 7.6%, no low-bracket split) |
| `bl/form-102-bl.js` (`computeEmployeeBL`, L269-271) | **`0`** — *"Controlling shareholder — no BL employer portion on self … they pay as self-employed"* |

These are semantically different statutory interpretations and they will produce different filings for the same payroll run.

**Reality check:** The Israeli law treatment is that בעל שליטה in a חברת מעטים pays BL on the self-employed track for own income, AND the company does NOT remit employer portion on the controlling shareholder's own salary. So `bl/form-102-bl.js` is **correct** and `tax/form-102.js` is **wrong** (or at least applies the wrong tax-authority-bucket interpretation).

**Fix:** Align both engines on the BL exporter's interpretation, or add a config flag `csTreatment: 'flat-rate' | 'self-employed'` and document why both exist.

---

## 6. Electronic submission — NOT IMPLEMENTED

`submitXML102(data)` (L796-843 of `tax/form-102.js`):
- Returns `{ xml, envelope, headers, endpoint, status: 'prepared' }`
- `endpoint: 'https://PLACEHOLDER.tax.gov.il/webservices/form102/submit'`
- `<DigitalSignature>PLACEHOLDER</DigitalSignature>` literally hard-coded
- `<AuthToken>PLACEHOLDER</AuthToken>` literally hard-coded
- Test `submitXML102: returns envelope with placeholder signature` (L311) asserts the placeholders are present — i.e. tests confirm nothing is sent

The function does not perform `fetch()`, `https.request()`, or any network I/O. The note in the function body explicitly says *"STUB envelope. Real format must be confirmed from רשות המסים online documentation."*

**No webservice integration to btl.gov.il exists.** The fixed-width file from `bl/form-102-bl.js` can be uploaded manually via the BL portal, but no automated MFT/SOAP/REST hand-off is wired.

**Required for production:**
1. Acquire שע"מ webservice credentials and SDK from רשות המסים.
2. Replace `<DigitalSignature>PLACEHOLDER</DigitalSignature>` with PKCS#7 signing over the payload (likely via `crypto.createSign` + employer's tax-file private key).
3. Replace `<AuthToken>PLACEHOLDER</AuthToken>` with OAuth2 / OTP flow per portal docs.
4. Replace `endpoint: 'https://PLACEHOLDER.tax.gov.il/...'` with real submission URL (env-configurable for test/prod).
5. Wire a transport (HTTPS POST with mutual TLS) and persist the response in `payroll_audit_log`.

---

## 7. Lower-severity findings

- **L1** — `aggregate` skips negative gross with warning (L398) but does not throw; production should fail-fast.
- **L2** — `dueDateFor` returns the literal 15th regardless of Shabbat/חג; "payment runner" delegation referenced at L460 does not exist.
- **L3** — `period.year` range inconsistent: 2000-2100 in `tax/form-102.js` L707 vs 1990-2100 in `tax-exports/form-102-xml.js` L131.
- **L4** — Fixed-width spec comment (L401-435) lacks חוזר ביטוח לאומי version reference; format has changed multiple times since 2018.
- **L5** — Sectoral multipliers (kibbutz 0.93, agriculture 0.85) hard-coded with no constants-doc cross-reference.
- **L6** — Interest rate of 0.04 frozen (L62); should be configurable since prime rate varies.

---

## 8. Required remediations (priority)

1. **[HIGH]** Implement `floorAgora` rounding in wage-slip-calculator + both form-102 engines. Resolves Agent 04 finding #6.
2. **[HIGH]** Add per-employee detail array to `tax/form-102.js` output, OR document that BL exporter is the authoritative per-row source.
3. **[HIGH]** Reconcile CS treatment between the two engines. Pick one; document.
4. **[HIGH]** Implement real `submitXML102` transport with signature + auth.
5. **[HIGH]** Add a reconciliation harness that loads `wage_slips` for a period and feeds into `form-102` engines, asserting sums match within ₪0.01.
6. **[MED]** De-duplicate `CONSTANTS_2026` across the three modules into a single shared module.
7. **[MED]** Add a `business-day-shifter` for due dates around Shabbat/חג.
8. **[LOW]** Add CHOZER/document version tag to the BL fixed-width spec comment.

---

## 9. Final verdict

**YELLOW.** Math is structurally correct and well-tested (68 tests across both suites). Per-employee detail flows correctly in the BL exporter. Totals reconcile within an engine. **But:** rounding still off-by-one-agora vs. BL portal expectation, electronic submission is a stub with placeholder credentials, and the controlling-shareholder rate disagreement between the two engines means the same payroll filed through both paths will produce different numbers. Cannot release for live monthly filing until items 1, 3, 4 above are resolved.

---

## 10. File references (absolute)

- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\src\tax\form-102.js`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\src\tax-exports\form-102-xml.js`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\src\bl\form-102-bl.js`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\test\tax\form-102.test.js`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\test\bl\form-102-bl.test.js`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\src\payroll\wage-slip-calculator.js` (L217-236 = source of slip-level BL math)
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\_qa-reports-25\AGENT-04-runtime-payroll.md` (carry-over context)
