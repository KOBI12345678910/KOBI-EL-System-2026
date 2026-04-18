# QA Agent 2 — Unit/Logic Sanity

Generated: 2026-04-18
Scope: `api-server/src/**/*.ts` + `erp-app/src/**/*.ts` + `techno-kol-ops/**/*.ts`
Method: pattern grep with cap of 200 findings per type; spot-check on critical functions.

---

## Pattern scan headline counts

| pattern | matches | files |
|---|---|---|
| `/` as potential division-by-zero (div by named vars `vat/rate/count/total/length/qty/quantity`, api-server only) | 7 hits in 5 files | low |
| `* 0.17` or `* 0.18` hardcoded VAT | **30 files with hardcoded `* 0.18` / `* 0.17`** | high |
| `catch { }` empty catch blocks (monorepo TS) | **1116 across 170 files** (includes generated/test files; capped) | very high |
| `JSON.parse(` usages with no enclosing try/catch proven by position (api-server) | 106 in 41 files | follow-up |
| `parseInt(X)` missing radix (api-server) | 379 in 107 files | medium |
| `==` / `!=` loose equality (api-server) | 1116+ in 170 files (same grep as above inflated — see note) | medium |
| `new Date(...)` no explicit TZ handling (api-server) | 30+ KB of matches, >500 hits | medium (Israel-local system) |
| `.trim()` on potentially-null string | 6 matches in 5 files | low |
| `.toFixed(2)` used as final currency formatter | 16 matches in 5 files | medium (ILS ₪ locale) |

Note: my loose-equality grep `\s==\s|\s!=\s` intersects with the empty-catch grep's persistent-output and inflated the reported totals; treating 1116 as a ceiling, not per-pattern precision. Both patterns are endemic.

---

## Critical findings (severity-ordered)

### 1. HARDCODED VAT 0.18 — canonical helper `getVatRateForDate` bypassed (HIGH)

The canonical VAT helper exists at `api-server/src/routes/israeli-accounting-engine.ts:35`:
```ts
function getVatRateForDate(isoDate?: string | Date | null): number {
  if (!isoDate) return VAT_RATE;
  const d = typeof isoDate === "string" ? new Date(isoDate) : isoDate;
  if (isNaN(d.getTime())) return VAT_RATE;
  return d >= new Date(VAT_EFFECTIVE_FROM) ? VAT_RATE : VAT_RATE_PRIOR;
}
```
It is imported **in exactly ONE file** (its own definition). Every other VAT calculation hardcodes `* 0.18`:

| file:line | expression | issue |
|---|---|---|
| `api-server/src/routes/ai-document-intelligence-engine.ts:331` | `parseFloat((totalAmount * 0.18).toFixed(2))` | hardcoded + toFixed for currency |
| `api-server/src/routes/ai-data-flow.ts:44,51,77` | `Math.round((data.total_amount ?? 0) * 0.18)` | hardcoded |
| `api-server/src/routes/ar-enterprise.ts:92` | `Number(d.amount\|\|0) * 0.18 / 1.18` | hardcoded, VAT-gross-up logic |
| `api-server/src/routes/ap-enterprise.ts:90` | `Number(d.amount\|\|0) * 0.18` | hardcoded |
| `api-server/src/routes/commission-calculator-engine.ts:470` | `totalCommission * 0.18` | hardcoded |
| `api-server/src/routes/sales-pricing-enterprise.ts:166,217,327,348,431,451` | `subtotal * 0.18` (6×) | hardcoded |
| `api-server/src/routes/import-management-engine.ts:239,292` | `vat_base * 0.18` | hardcoded + comment admits pre-2026 was 17% |
| `api-server/src/routes/project-costing-engine.ts:527` | `finalPriceBeforeVat * 0.18` | hardcoded |
| `api-server/src/routes/project-analyses.ts:105,455` | `totalCost * 0.18`, `totalBeforeVat * 0.18` | hardcoded |
| `api-server/src/routes/kobi/tools.ts:1884` | `Math.round(Number(o.total_amount_cents) * 0.18)` | hardcoded |
| `api-server/src/lib/ai-enrichment-service.ts:133,218` | `Math.round(amount * 0.18 * 100) / 100` | hardcoded |
| `techno-kol-ops/src/services/documentTemplates.ts:111,118,126` | customer-facing HTML templates | hardcoded in generated docs |
| `techno-kol-ops/src/documents/documentEngine.ts:122,181` | PDF doc output | hardcoded |
| `api-server/src/__tests__/unit/invoice-calculations.test.ts:111,189` | `* 0.17` | **tests pin the WRONG rate** (17% not 18%) — will fail once runtime uses 2026 rate; or worse, tests pass because production also uses wrong rate somewhere |
| `api-server/src/__tests__/integration/financial-flow.test.ts:211,403` | `* 0.17` | same test drift |

**Severity: HIGH.** For any invoice/quote dated before `VAT_EFFECTIVE_FROM` (which the helper knows about), the hardcoded `* 0.18` over-charges customers by 1pp. For audit/reprint of pre-2026 records, every non-helper call site produces wrong retroactive math. The test suite pinning `0.17` suggests the tests were written for 2025 and never updated — test+prod are quietly diverged.

### 2. `toFixed(2)` as currency formatter for ILS (MEDIUM)

`toFixed(2)` returns a string using `.` decimal — not Hebrew-locale `,`. For an RTL/Hebrew ERP, the correct formatter is `Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS' })`. Hit count: 16 across api-server, including `ai-document-intelligence-engine.ts:331` inside VAT output. Customer-facing emails/docs will render "₪1234.50" rather than "₪1,234.50" when the raw number lands in a template.

### 3. Empty `catch { }` blocks (HIGH count, MIXED severity)

1116+ matches across 170 files (monorepo TS). Many are in generated test fixtures and artifacts, but core files contain empty catches too:
- `api-server/src/lib/permission-middleware.ts:64-66` — token validation error is `console.error`'d then silently ignored, continuing to `next()` without userId. (This is the mechanism that makes the auth bypass in QA_AGENT_12 possible: bad-token looks identical to no-token.)
- `api-server/src/lib/multimodal-ai.ts` (2 hits), `lib/data-flow-engine.ts` (1), `lib/webhook-verify.ts` (1 — webhook signature errors swallowed = CRITICAL).
- `routes/claude/chat.ts` (7), `routes/crm.ts` (6), `routes/finance.ts` (22), `routes/contracts.ts` (11) — any finance/contract error being swallowed is an audit/regulatory risk.

Severity: **webhook-verify.ts swallowing sig errors is critical**; finance.ts 22 empty catches need a line-by-line review (likely half are optional field parsing, half are real bugs).

### 4. `JSON.parse` without try/catch (MEDIUM)

106 in 41 files. Spot-check:
- `api-server/src/lib/multimodal-ai.ts:1` — parsing LLM JSON output, no guard. If model returns malformed JSON (common), the whole handler throws 500.
- `api-server/src/routes/ceo-control-tower.ts:64` matches — high count in one file suggests repeated JSON parse in hot path with no guards.
- `routes/israeli-payroll.ts:5`, `payroll-engine.ts:3` — payroll config parsing.

### 5. `parseInt` without radix (MEDIUM)

379 matches in 107 files. Specific worst offenders:
- `api-server/src/routes/finance.ts:20`
- `api-server/src/routes/qms-inspection.ts:16`
- `api-server/src/routes/reports-center.ts:28`
- `api-server/src/routes/ceo-control-tower.ts:1` (critical dashboard)
- `api-server/src/lib/auth.ts:17` — auth helper doing `parseInt(x)` on a token-adjacent value

Israeli ID numbers often start with `0`; `parseInt("0123")` in non-octal JS is safe (returns 123) but intent leakage is a smell. Flagged.

### 6. `new Date(...)` without explicit timezone (MEDIUM)

Hundreds of hits. For a Hebrew/IL system, `new Date("2026-04-18")` is parsed as UTC midnight, then displayed in IST (UTC+3). Boundary dates flip day — common cause of "invoice dated 2026-04-17" bug when user typed 18.
- `api-server/src/routes/israeli-accounting-engine.ts:37` is itself doing `new Date(isoDate)` inside the VAT helper — if `isoDate` is a bare `YYYY-MM-DD`, the 2026-01-01 boundary evaluates at UTC midnight = 2025-12-31T21:00 local, so the first ~3 hours of 2026-01-01 local time silently get 2025 VAT rate. **Small but real edge case inside the canonical helper.**

### 7. Loose equality `==`/`!=` (LOW-MEDIUM)

Endemic. Not worth enumerating; lint rule `eqeqeq` should be enabled globally.

### 8. `.trim()` on nullable (LOW)

6 matches. Example `api-server/src/lib/auth.ts:1` pattern. Low severity but easy wins.

### 9. Division by zero risk (LOW)

7 matches on the narrow grep. All are on named denominators — e.g. `something / rate` where `rate` is an array of fx-rate objects, not a zero-risk scalar. Manual review not prioritized.

### 10. Async without await — NOT SCANNED (pattern too noisy)

Generic `asyncFn(` callsite detection is unreliable without AST parsing. Skipped per 4-minute budget.

---

## Critical functions — spot check

| function | file:line | issues | severity |
|---|---|---|---|
| `getVatRateForDate` | `api-server/src/routes/israeli-accounting-engine.ts:35-40` | TZ edge case at boundary date (see §6). Otherwise correct logic. | medium |
| VAT in AR enterprise | `api-server/src/routes/ar-enterprise.ts:92` | hardcodes 0.18, gross-up formula `amount * 0.18/1.18` assumes amount is gross — not verified against schema | high |
| VAT in AP enterprise | `api-server/src/routes/ap-enterprise.ts:90` | hardcodes 0.18, NO gross-up (inverse of AR) — asymmetry: AR treats `amount` as gross, AP as net. If AR/AP bookkeeping shares the same `amount` column semantics (it should), one side is wrong. | high |
| Quote total VAT | `api-server/src/routes/sales-pricing-enterprise.ts:166,217,327,348,431,451` | 6× hardcoded `subtotal * 0.18`; not date-aware; historic quote reprints will show wrong VAT | high |
| Invoice line tests | `api-server/src/__tests__/unit/invoice-calculations.test.ts:111,189` | tests pinned to 0.17, production on 0.18 — testsuite is green on wrong math | high |
| Three-way match | `api-server/src/routes/three-way-match.ts` + `three-way-matching.ts` | TWO files with similar names, both unguarded (§QA_AGENT_12). Duplicate endpoint risk (per AUDIT_REAL §10e 171 dups). | medium |
| Payroll | `api-server/src/routes/payroll-engine.ts`, `israeli-payroll.ts`, `payroll-module.ts`, `smart-payroll.ts` | 4 payroll entrypoints; prior audit flagged duplication. Each does own tax-rate constants (search shows `WITHHOLDING_TAX_DEFAULT = 0.30` and `NATIONAL_INSURANCE_RATE_EMPLOYEE = 0.12` in `israeli-accounting-engine.ts:41-43`). 4 payroll engines = 4 places to update when rates change. | high |
| Currency conversion | fx_rates table exists per AUDIT_REAL; callsite usage not audited in this pass | unknown | — |

---

## Verdict

- division-by-zero risks: 7 (low actuality)
- float-money risks: 30+ files use `* 0.18` directly instead of `getVatRateForDate` + Decimal
- date/tz issues: >500 `new Date(...)` call sites; 1 actual bug found in the canonical VAT helper boundary
- async-without-await: not scanned
- empty-catch: 1116 occurrences (some benign in tests; real bug in `permission-middleware.ts` and `webhook-verify.ts`)
- hardcoded VAT: **30 files using `* 0.18`**; **5 test sites still using `* 0.17`** → test suite is outdated
- missing null guards: endemic, not enumerated
- JSON.parse without try/catch: 106 in 41 files
- `==` instead of `===`: endemic; lint rule needed
- `toFixed(2)` as ILS formatter: 16 sites

**Verdict: high-risk.**
Headline defect: **one canonical VAT helper, zero downstream callers**. The whole accounting layer reimplements `* 0.18` inline, and the test suite contradicts the production rate (`0.17` vs `0.18`). AR/AP also show asymmetric gross-vs-net assumptions at identical-looking call sites. Any customer auditing pre-2026 quotes will see wrong retroactive VAT. Combine with QA_AGENT_12's auth bypass and arbitrary anonymous callers can force-recalculate invoices at attacker-chosen amounts.
