# QA-07 — Sanity Agent Report

**Agent:** QA-07 (Sanity)
**System:** ERP — Techno-Kol Uzi (`onyx-procurement`)
**Scope:** Phase-2 fixes sanity check
**Report date:** 2026-04-11
**Working directory:** `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\onyx-procurement`

---

## Summary Dashboard

| #   | Area                          | Syntax | Tests              | TODO/FIXME | Fix resolved? | New regressions? |
| --- | ----------------------------- | ------ | ------------------ | ---------- | ------------- | ---------------- |
| 1   | B-08 Payroll Wage Slip        | OK     | 61/61 pass         | none       | YES           | none detected    |
| 2   | Bank Reconciliation (B-11)    | OK     | 56/56 pass         | none       | YES           | none detected    |
| 3   | VAT PCN836 (B-09)             | OK     | 45/45 pass         | none       | YES           | 1 latent (SANITY-01) |
| 4   | Annual Tax 1320 (B-10)        | OK     | 34/34 pass         | none       | YES           | none detected    |
| 5   | Security middleware           | OK     | n/a (integrated)   | 2 (non-blocking, server.js 124/126) | YES | none detected |
| 6   | Migrations (004-007)          | OK     | n/a                | none       | YES           | none detected    |

**Total test execution:** `node --test test/*.test.js` → **196 pass / 0 fail / 0 skipped / 196 total** (duration ~985 ms)

---

## 1. B-08 — Payroll / Wage Slip Calculator

### Files inspected
- `src/payroll/wage-slip-calculator.js` (449 lines)
- `src/payroll/pdf-generator.js` (254 lines)
- `src/payroll/payroll-routes.js` (369 lines)

### What was checked
1. **Main functions exported?**
   - `computeWageSlip`, `computeHourlyGross`, `computeMonthlyGross`, `computeIncomeTaxAnnual`, `computeIncomeTaxMonthly`, `computeBituachLeumiAndHealth`, `computePensionContributions`, `computeStudyFund`, `CONSTANTS_2026` — all exported (lines 438-448). OK.
   - `generateWageSlipPdf` — exported from pdf-generator.js (line 252). OK.
   - `registerPayrollRoutes` — exported from payroll-routes.js (line 369). OK.
2. **No residual TODO/FIXME** — Grep: no matches. OK.
3. **Syntax** — `node -c` on all three files: OK.
4. **Tests exist and pass** — `test/wage-slip-calculator.test.js`, `test/pdf-generator.test.js`, `test/payroll-routes.test.js`. 61/61 pass.
5. **Sum invariant (net = gross − deductions ± 0.02)** — verified by test `8.7` and reproduced manually:
   ```
   gross_pay:           16,030.22   (monthly ₪15,000 + 10h × 125% OT)
   total_deductions:     4,402.90
   net_pay:             11,627.32
   11,627.32 + 4,402.90 = 16,030.22 ✓
   ```
6. **2026 tax constants** — brackets, בטל"ח, מס בריאות, pension all match CONSTANTS_VERIFICATION.md.
7. **10-section PDF compliance** (חוק הגנת השכר תיקון 24):
   - § 1 Employer identity — line 88
   - § 2 Employee identity — line 95
   - § 3 Period — line 77
   - § 4 Hours breakdown — line 107 (Regular / 125% / 150% / 175% / 200% / Absence / Vacation / Sick / Reserve)
   - § 5 Earnings breakdown — line 127 (base, OT, vacation-pay, sick-pay, holiday, bonuses, commissions, meal/travel/clothing/phone allowances, other)
   - § 6 Deductions breakdown — line 158 (income-tax, בטל"ח, מס בריאות, pension, study fund, loans, garnishments, other)
   - § 7 Net pay (framed box) — line 178
   - § 8 Balances (vacation / sick / study fund / severance) — line 198 (conditional — only if any balance present)
   - § 9 Employer contributions — line 188
   - § 10 Year-to-Date — line 214 (conditional — only if ytd_gross present)

### Fix status
**RESOLVED.** Original B-08 complaint (incomplete wage slip, no PDF, no persistence, no approval workflow) is fully addressed by:
- Canonical calculator with 2026 constants (bracketed income tax, two-tier BL/Health, 6/6.5/8.33% pension, study fund)
- Full Express CRUD + compute/approve/issue/pdf/email/void workflow with state guards
- PDF generator with all 10 law sections
- Audit trail via `payroll_audit_log` (verified by test)
- YTD accumulation across prior-month slips (test 8.11 + route test)
- `wage-slip already exists` duplicate guard (409) verified by test

### New regressions
**None detected.**

---

## 2. B-11 — Bank Reconciliation

### Files inspected
- `src/bank/matcher.js` (141 lines)
- `src/bank/parsers.js` (258 lines)
- `src/bank/bank-routes.js` (202 lines)

### What was checked
1. **Exports:** `scoreMatch`, `findBestMatch`, `autoReconcileBatch` (matcher); `parseCsvStatement`, `parseMt940Statement`, `autoParse` (parsers); `registerBankRoutes` (routes). OK.
2. **No TODO/FIXME.**
3. **Syntax:** `node -c` OK on all three.
4. **Tests:** 56/56 pass — `bank-matcher.test.js`, `bank-parsers.test.js`, `bank-routes.test.js`.
5. **Tolerance rule (₪0.01) — LIVE regression check:**
   ```
   diff < 0.01  → criteria.amount = "exact"   (+0.60 to score)
   ratio < 0.001 → "near-exact"               (+0.55)
   ratio < 0.01  → "close"                    (+0.40)
   ratio < 0.05  → "partial"                  (+0.20)
   > 5%          → rejected
   ```
   Reproduced: ₪1000 exact → confidence 0.95; ₪1000 vs ₪1000.005 → 0.80 exact; ₪1000 vs ₪1000.02 → 0.75 near-exact. **Threshold is honored.**
6. **Direction guard** (type=customer_payment but bank.amount<0 → −0.30 penalty) — present lines 65-73.
7. **CSV parser supports Hebrew column hints** (תאריך / סכום / חובה / זכות / יתרה / אסמכתא) — lines 20-29.
8. **MT940 auto-detection** — parsers line 248 `:20:` / `:25:` detection.

### Fix status
**RESOLVED.** Original B-11 complaint (no bank import, no auto-match, no discrepancy tracking) is addressed.
- CSV + MT940 parsers with Israeli bank hints and fuzzy column match
- Confidence-scored matcher with amount + date + name + reference + direction checks
- Auto-reconcile generates suggestions (does NOT auto-commit — caller approves)
- Routes expose accounts CRUD, statement import, manual matches, summary view, discrepancies

### New regressions
**None detected.**

---

## 3. B-09 — VAT / PCN836

### Files inspected
- `src/vat/pcn836.js` (245 lines)
- `src/vat/vat-routes.js`

### What was checked
1. **Exports:** `buildPcn836File`, `validatePcn836File`, `fmtAmount`, `fmtInt`, `fmtText`, `fmtDate`, `fmtPeriod`. OK.
2. **No TODO/FIXME.**
3. **Syntax:** OK.
4. **Tests:** 45/45 pass — `pcn836.test.js`, `vat-routes.test.js`.
5. **PCN836 structure:**
   - A header: `record-type(1) + vatFile(9) + period(6) + freq(1) + date(8) + type(1) + name(50) + pad(16)` = 92 chars
   - B summary: 113 chars
   - C/D invoice: 76 chars
   - Z trailer: 60 chars
   - Body checksum: SHA-256 of lines joined by CRLF
   - File uses CRLF line endings — correct for רשות המסים submission format
6. **Full regression test (realistic file):**
   ```
   header (A) → width 92
   summary (B) → width 113
   input C → width 76
   output D → width 76
   trailer Z → width 60
   filename: PCN836_123456789_202603.TXT  ✓
   ```
7. **23% ratio — not applicable (PCN836 is VAT, not corporate tax).** 17% VAT via `VAT_RATE` env var OK (server.js:138).

### Fix status
**RESOLVED** for the primary B-09 defect (no PCN836 encoder, no submission flow). Encoder works, tests pass, filename convention matches spec.

### New regressions / latent issues
**SANITY-01 (latent, medium severity)** — see Bug List.

---

## 4. B-10 — Annual Tax / Form 1320

### Files inspected
- `src/tax/form-builders.js` (257 lines)
- `src/tax/annual-tax-routes.js` (283 lines)

### What was checked
1. **Exports:** `buildForm1320`, `buildForm1301`, `buildForm6111`, `buildForm30A` (form-builders); `registerAnnualTaxRoutes` (annual-tax-routes). OK.
2. **No TODO/FIXME.**
3. **Syntax:** OK.
4. **Tests:** 34/34 pass — `form-builders.test.js`, `annual-tax-routes.test.js`.
5. **23% corporate tax rate — REGRESSION CHECK:**
   ```js
   // annual-tax-routes.js:217-218
   corporate_tax: Math.round(fy.net_profit_before_tax * 0.23),
   profit_after_tax: fy.net_profit_before_tax - Math.round(fy.net_profit_before_tax * 0.23),
   ```
   Live test with profit_before_tax = ₪1,000,000:
   ```
   corporate_tax → 230,000 (expected: 230,000) ✓
   profit_after_tax → 770,000 (expected: 770,000) ✓
   revenue/cogs/gross-profit flow through form correctly ✓
   ```
6. **Form 1320 structure** includes Sections 1-7: company ID, revenue, COGS, operating expenses, profit calc, assets, metadata. Project-level breakdown via `revenueByProject` (groupSum).
7. **Fiscal year compute endpoint** (`/api/fiscal-years/:year/compute`) loads customer invoices + tax invoices, computes revenue/COGS/gross-profit, upserts into `fiscal_years` table.
8. **Form-generation endpoint** (`POST /api/annual-tax/:year/forms/:type/generate`) requires:
   - `company_tax_profile` row (returns 412 if missing)
   - `fiscal_years` row (returns 412 with hint to compute first)
   Supports 1320 / 1301 / 6111 / 30a.

### Fix status
**RESOLVED.** Original B-10 complaint (no annual return flow, no corporate tax calc) is addressed. Note: **the 23% rate is the correct Israeli corporate tax rate for 2026** (per רשות המסים).

### New regressions
**None detected.**

---

## 5. Security Middleware (Helmet, Rate-Limit, HMAC)

### Files inspected
- `server.js` (lines 60-200)
- `src/middleware/rate-limits.js` (189 lines)
- `src/middleware/README.md` (present)

### What was checked
1. **Helmet** — `app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: {policy: 'cross-origin'} }))` (server.js:70). CSP intentionally disabled for RTL dashboard inline styles; CORP relaxed for cross-origin fetches. Documented intent. OK.
2. **Rate-limit (two layers):**
   - **Outer** (express-rate-limit): `apiLimiter` = 300 req / 15 min on `/api/`; `webhookLimiter` = 120 req / min on `/webhook/`. Headers: `standardHeaders:true`. OK.
   - **Inner** (custom `src/middleware/rate-limits.js`): sliding 60s window tiered `read` (100/min) / `write` (20/min) / `expensive` (5/min). Per-IP + per-API-key bucketing, opportunistic GC, emits `X-RateLimit-*` headers, `Retry-After` on 429. Only `readLimiter` is mounted globally; `writeLimiter` / `expensiveLimiter` are imported but not wired per-route yet.
3. **HMAC webhook verification** — `verifyWhatsAppHmac` (server.js:173-196):
   - Validates `X-Hub-Signature-256` header
   - Uses `crypto.createHmac('sha256', WA_APP_SECRET)` against captured raw body
   - **Timing-safe compare** via `crypto.timingSafeEqual`
   - **Production guard:** returns 500 if `WHATSAPP_APP_SECRET` unset AND `NODE_ENV=production` — prevents accidental unsigned webhooks in prod
   - Logs warn but continues in dev mode — acceptable
4. **API key auth** (`requireAuth`) on `/api/` routes — rejects 401 for missing/invalid `X-API-Key` or `Authorization: Bearer …`, exempts `/api/status` and `/api/health`.
5. **Raw body capture** in `express.json({ verify })` (line 89) — required for HMAC to work correctly. OK.
6. **Syntax:** `node -c` OK on server.js and rate-limits.js.

### Fix status
**RESOLVED.** All three security controls are wired and active:
- Helmet shields headers
- Two-layer rate-limit provides both window-based and sliding-window protection
- HMAC uses timing-safe compare and production refuses unsigned webhooks

### Open items (non-blocking)
- Two `TODO(per-route)` comments in `server.js:124` and `:126` — `writeLimiter` and `expensiveLimiter` are imported but not yet attached to specific mutation / export routes. **This is NOT a regression** — existing outer `apiLimiter` still covers these; the inner limiters are an additional layer waiting for per-route wiring. Filed as **SANITY-02 (informational)**.

---

## 6. Migrations (supabase/migrations/)

### Files inspected
- `000-bootstrap-pg-execute.sql` (102 lines) — BEGIN/COMMIT ✓
- `001-supabase-schema.sql` (562 lines) — no BEGIN/COMMIT (Phase-1, out of scope)
- `002-seed-data-extended.sql` (320 lines) — no BEGIN/COMMIT (Phase-1, out of scope)
- `003-migration-tracking-and-precision.sql` (176 lines) — BEGIN/COMMIT ✓
- `004-vat-module.sql` (198 lines) — BEGIN/COMMIT ✓ + schema_migrations upsert
- `005-annual-tax-module.sql` (213 lines) — BEGIN/COMMIT ✓ + schema_migrations upsert
- `006-bank-reconciliation.sql` (161 lines) — BEGIN/COMMIT ✓ + schema_migrations upsert
- `007-payroll-wage-slip.sql` (232 lines) — BEGIN/COMMIT ✓ + schema_migrations upsert

### What was checked
1. **Transactional wrapping** — all Phase-2 (004-007) migrations wrapped in `BEGIN; ... COMMIT;`. OK.
2. **Tracking** — each Phase-2 migration ends with an upsert to `schema_migrations (version, name, checksum, notes)`, with `ON CONFLICT DO UPDATE` so re-running is safe.
3. **Idempotency** — all tables use `CREATE TABLE IF NOT EXISTS`; indexes use `CREATE INDEX IF NOT EXISTS`. Safe to re-run.
4. **No TODO/FIXME.**
5. **007-payroll-wage-slip.sql** header comments document the 10-section law requirement — matches what pdf-generator.js implements.

### Fix status
**RESOLVED.** Phase-2 migrations are transactional, idempotent, tracked, and compliant with the migration-safety conventions introduced in migration 003.

### New regressions
**None detected.** The lack of BEGIN/COMMIT on 001/002 is a **Phase-1 artifact** — those files are instructed to run via Supabase SQL Editor, which wraps statements in implicit transactions. Out of scope for this sanity check.

---

## Cross-cutting checks

### Whole test-suite smoke
```
$ node --test test/*.test.js
ℹ tests 196
ℹ suites 24
ℹ pass 196
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 985
```

### Repo-wide TODO/FIXME in Phase-2 scope
- `src/payroll/**` — none
- `src/bank/**` — none
- `src/vat/**` — none
- `src/tax/**` — none
- `src/middleware/**` — none
- `supabase/migrations/**` — none
- `server.js` — 2 `TODO(per-route)` comments about optional rate-limit tier wiring (non-blocking)

---

# Sanity Failures / Bug List

## SANITY-01 — `validatePcn836File` reports false-positive width errors on every real file

**Status:** RESOLVED — Agent-Y-QA02: validator now uses per-record-type `RECORD_WIDTHS = {A:92, B:113, C:76, D:76, Z:60}` map instead of comparing all lines to line 0. Real files pass validation.

| Field             | Value                                                            |
| ----------------- | ---------------------------------------------------------------- |
| **Bug ID**        | QA-07 / SANITY-01                                                |
| **Severity**      | Medium (latent — does not break submission flow, but validator is unusable for pre-flight checks) |
| **Area**          | B-09 VAT / PCN836                                                |
| **File**          | `src/vat/pcn836.js` lines 215-233                                |
| **Function**      | `validatePcn836File`                                             |
| **Reproduction**  | Build any PCN836 file (e.g. via `buildPcn836File(...)`) and call `validatePcn836File(file)`. |
| **Expected**      | No structural errors on a well-formed file.                      |
| **Actual**        | Returns 4+ width errors: `'line 1: width 113, expected 92'`, `'line 2: width 76, expected 92'`, etc. |
| **Root cause**    | The validator assumes ALL records in a PCN836 file must be the same width, but the spec defines DIFFERENT fixed widths per record type: A=92, B=113, C/D=76, Z=60. The test `'real built file has no structural errors'` acknowledges this by filtering out width errors before asserting. |
| **Evidence**      | `test/pcn836.test.js:409-431` explicitly filters out `widthErrors`. Direct repro: widths observed `[92, 113, 76, 76, 60]`. |
| **Impact**        | Pre-submission validation (route `POST /api/vat/periods/:id/submit`) cannot be relied upon to reject malformed files — it will reject every valid file. Currently mitigated only by tests filtering the errors manually. |
| **Suggested fix** | Width check should be per-record-type, not cross-line: validate `A` records are width 92, `B` width 113, `C`/`D` width 76, `Z` width 60. |
| **Regression?**   | Latent (not introduced by the fix, but not addressed either).    |
| **Blocks Go?**    | **No** — submission flow works; test suite passes; encoder output is correct bytes-on-disk. But do NOT ship this validator as production pre-flight. |

---

## SANITY-02 — `writeLimiter` / `expensiveLimiter` imported but not wired per-route

| Field             | Value                                                          |
| ----------------- | -------------------------------------------------------------- |
| **Bug ID**        | QA-07 / SANITY-02                                              |
| **Severity**      | Informational (defense-in-depth gap, non-blocking)              |
| **Area**          | Security middleware / Rate-limit                                |
| **File**          | `server.js` lines 118-127                                       |
| **Reproduction**  | Grep `writeLimiter\\|expensiveLimiter` in server.js — both imported, only `readLimiter` is mounted globally. |
| **Expected**      | Per the README and inline TODO, `writeLimiter` attached to `app.post/put/patch/delete` handlers and `expensiveLimiter` attached to `/api/export`, `/api/vat/periods/:id/submit` (PCN836 gen), `/api/payroll/wage-slips/:id/pdf`, `/api/reports/**`, `/api/backup/**`. |
| **Actual**        | Both limiters imported with `eslint-disable-line no-unused-vars` and left unwired. Outer `apiLimiter` (300/15min) still applies — so limits exist but are coarser than designed. |
| **Impact**        | Defense-in-depth is partially implemented. Not a vulnerability — outer limiter still protects, and the inner `readLimiter` caps GETs per minute. But expensive endpoints (PDF, PCN836) are currently under the same 300/15min cap as cheap GETs. |
| **Suggested fix** | Attach per-route (see TODOs at server.js:124 and :126). Pattern: `app.post('/api/payroll/wage-slips/:id/pdf', expensiveLimiter, handler)`. |
| **Regression?**   | No — this is a pre-existing incomplete wiring, not introduced by Phase-2. |
| **Blocks Go?**    | **No** — outer apiLimiter covers the gap. Logged for future hardening. |

---

# Go / No-Go Decision

## Summary of evidence
| Area                         | Tests    | Fix verified | Regressions |
| ---------------------------- | -------- | ------------ | ----------- |
| Payroll Wage Slip (B-08)     | 61/61 ✓  | YES          | none        |
| Bank Reconciliation (B-11)   | 56/56 ✓  | YES          | none        |
| VAT PCN836 (B-09)            | 45/45 ✓  | YES          | 1 latent (validator only) |
| Annual Tax 1320 (B-10)       | 34/34 ✓  | YES          | none        |
| Security middleware          | (smoke)  | YES          | none        |
| Migrations (004-007)         | (static) | YES          | none        |
| **Aggregate**                | **196/196 ✓** | **All Phase-2 fixes confirmed resolved** | **2 non-blocking items filed** |

## Critical regressions detected
**NONE.** All Phase-2 fixes are verified:
- Wage slip calculator produces law-compliant output with 10 PDF sections and correct 2026 tax constants
- Bank reconciler honors the ₪0.01 tolerance rule exactly as specified
- PCN836 encoder produces correctly structured fixed-width files with proper CRLF, checksum, and filename
- Annual tax flow applies the 23% corporate tax rate on profit_before_tax
- Security layer (helmet + 2-layer rate-limit + HMAC-SHA256 with timing-safe compare + production unsigned-webhook guard) is wired and active
- All Phase-2 migrations are transactional, idempotent, and tracked

## Non-blocking issues filed
- **SANITY-01** — `validatePcn836File` has a width-check bug (medium severity, latent, does not affect file generation or submission — only affects the optional pre-flight validator). Do NOT ship this validator as prod pre-flight until fixed.
- **SANITY-02** — `writeLimiter` / `expensiveLimiter` imported but not attached per-route (informational, outer limiter covers). Wiring deferred per existing TODOs.

## Decision

# **GO** — Phase-2 fixes are verified resolved. No critical regressions detected. 2 non-blocking items filed for future iterations.

**Conditions:**
1. SANITY-01 should be tracked and fixed before the PCN836 validator is used as a production pre-submission gate (it currently is NOT — the `submit` endpoint builds and ships the file directly).
2. SANITY-02 should be picked up during the next security hardening sprint.

---

_QA-07 Sanity Agent — end of report._
_Report generated: 2026-04-11_
