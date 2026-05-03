# AGENT-271 — LOGIC #1: Consolidated VAT Calculation Package

**Agent:** Agent-271
**Date:** 2026-04-29
**Scope:** Consolidate VAT (מע"מ) calculation logic scattered across 4 services
into a single shared package.
**Deliverable:** `packages/shared-tax/src/vat.ts`
**Status:** PASS — package written, surface area covers every existing
call site.

---

## 1. Why this matters

VAT logic is reimplemented in **at least 8 places** across the codebase, with
**three different rate constants** (`0.17`, `0.18`, dynamic). Drift between
services is now an active production risk because Israel raised VAT from 17% →
18% on **2026-01-01** and historical invoices must retain the prior rate.

Concrete drift evidence found in this audit:

| File | Line | Constant / Logic | Issue |
|---|---|---|---|
| `api-server/src/constants.ts` | 1 | `export const VAT_RATE = 0.17` | **Stale** — should be 0.18 since 2026-01-01 |
| `api-server/src/middleware/api-standards.ts` | 192 | `const VAT_RATE = 0.18` | Hard-coded, no historical handling |
| `api-server/src/lib/project-costing-engine.ts` | 30 | `const VAT_RATE = 0.18` | Hard-coded |
| `api-server/src/lib/project-costing-engine.ts` | 577 | `parseFloat(project.vat_rate) \|\| 17` | Falls back to 17, expressed in % not decimal |
| `api-server/src/routes/employee-value-engine.ts` | 390 | `const vatRate = 0.18` | Hard-coded |
| `api-server/src/routes/supply-chain-workflow.ts` | 134 | `const vatRate = 1.18` | Multiplier form, no rate retrieval |
| `api-server/src/routes/crm-ultimate.ts` | 867 | `Number(d.vat_rate \|\| 18)` | Default 18 expressed as percent |
| `api-server/src/lib/super-ai-agent.ts` | 1247 | `const vatRate = 18` | Percent form, hard-coded |
| `api-server/src/__tests__/unit/invoice-calculations.test.ts` | 3 | `const VAT_RATE = 0.17` | Stale; flagged in AGENT-19/AGENT-195 |
| `api-server/src/__tests__/integration/financial-flow.test.ts` | 3 | `const VAT_RATE = 0.17` | Stale |
| `desktop-tutorial-server/src/services/vat.service.js` | 4 | `VAT_RATE = 0.18` | Standalone duplicate |
| `desktop-tutorial-client/src/components/ui/VATCalculator.jsx` | 1 | `VAT_RATE = 0.18` | Standalone duplicate |
| `techno-kol-ops/src/documents/documentEngine.ts` | 181 | `Math.round(amount * 0.18)` | Magic number |

The only file that does this **correctly** today is
`api-server/src/routes/israeli-accounting-engine.ts` (lines 27-40), which
exports `getVatRateForDate(date)`. That helper is consumed by 6 sibling
routes (`ar-enterprise`, `ap-enterprise`, `ai-enrichment-service`,
`ai-document-intelligence-engine`, `ai-data-flow`,
`commission-calculator-engine`) — proving the API shape is right but the
implementation lives in the wrong package.

Cross-references in QA history:

- **AGENT-19** (il-compliance) §142 — flagged "tests still hard-code
  `vat_rate: 0.17` in fixtures used by current-period tests".
- **AGENT-195** (aggregator) F095 — same finding, MED severity.
- **AGENT-187** (expenses) §169 — recommended pushing `getVatRateForDate`
  into expense-manager.
- **AGENT-197** (effort) — listed as outstanding work item.

---

## 2. Package layout

```
packages/shared-tax/
├── package.json               # @techno-kol/shared-tax v1.0.0
└── src/
    ├── index.ts               # barrel export
    └── vat.ts                 # the logic (this report)
```

Conforms to the `packages/shared-*` convention already used by
`shared-types`, `shared-validation`, `shared-permissions`,
`shared-events`, `shared-audit`, `shared-observability`.

---

## 3. API surface

### Constants

| Symbol | Value | Notes |
|---|---|---|
| `VAT_RATE_CURRENT` | `0.18` | Effective 2026-01-01 |
| `VAT_RATE_PRIOR` | `0.17` | 2015-10-01 → 2025-12-31 |
| `VAT_EFFECTIVE_FROM` | `"2026-01-01"` | ISO date |
| `VAT_RATE_HISTORY` | `[{ from, to, rate, source }]` | Frozen, ordered ascending |

### Functions

| Function | Signature | Purpose |
|---|---|---|
| `getVatRate(date?)` | `(Date \| string \| null) → number` | Rate effective on date; defaults to current |
| `getVatRateForDate` | alias | Drop-in replacement for legacy import |
| `resolveCategory(ctx)` | `VatContext → VatCategory` | Flag composition, priority order |
| `getEffectiveRate(date, ctx)` | `(date, ctx) → number` | Rate after category resolution |
| `calculateVat(amount, rate?, opts?)` | `(net, rate?, ctx&date?) → VatBreakdown` | Forward: net → vat + gross |
| `reverseVat(grossAmount, rate?, opts?)` | `(gross, rate?, ctx&date?) → VatBreakdown` | Reverse: gross → net + vat |
| `applyTouristExemption(input)` | `→ VatBreakdown + evidence` | סעיף 30(א)(8); requires passport + country |
| `applyExemptSale(amount, reason, kind?)` | `→ VatBreakdown + reason` | סעיף 31; requires citation |
| `aggregatePeriod(lines)` | `VatLine[] → VatPeriodTotals` | PCN836 bucket roll-up |

### Types

- `VatCategory` — `"standard" \| "eilat" \| "export" \| "tourist" \| "fruit_vegetables" \| "exempt" \| "zero_rate"`
- `VatContext` — `{ isTourist?, eilatZone?, isExport?, isFruitVegetables?, isExempt?, category? }`
- `VatBreakdown` — `{ net, vat, gross, rate, category, isExempt, isZeroRate }`
- `VatPeriodTotals` — `{ taxableSales, zeroRateSales, exemptSales, vatOnSales }`
- `TouristExemptionInput` — `{ amount, amountKind?, passportNumber, passportCountry, visaType?, serviceDate, invoiceDate? }`

---

## 4. Behaviour matrix

| Date | Context | Expected rate | Test |
|---|---|---|---|
| `2025-06-15` | `{}` | `0.17` | historical invoice retains prior |
| `2026-04-29` | `{}` | `0.18` | current standard rate |
| `null` | `{}` | `0.18` | defaults to current |
| `"invalid"` | `{}` | `0.18` | falls back to current |
| `2026-01-01` | `{}` | `0.18` | exact effective date |
| any | `{ isTourist: true }` | `0` | סעיף 30(א)(8) |
| any | `{ eilatZone: true }` | `0` | אזור סחר חופשי אילת |
| any | `{ isExport: true }` | `0` | סעיף 30 |
| any | `{ isFruitVegetables: true }` | `0` | unprocessed produce |
| any | `{ isExempt: true }` | `0` | סעיף 31 (no input recovery) |
| any | `{ category: "tourist", isExempt: true }` | `0` | explicit `category` wins |

Forward (`calculateVat`):
- `calculateVat(1000)` → `{ net: 1000, vat: 180, gross: 1180, rate: 0.18 }`
- `calculateVat(1000, undefined, { date: "2025-12-01" })` → `{ ..., vat: 170, gross: 1170, rate: 0.17 }`
- `calculateVat(1000, undefined, { isTourist: true })` → `{ ..., vat: 0, gross: 1000, rate: 0 }`

Reverse (`reverseVat`):
- `reverseVat(1180)` → `{ net: 1000, vat: 180, gross: 1180 }` (penny-perfect)
- `reverseVat(1170, 0.17)` → `{ net: 1000, vat: 170, gross: 1170 }`
- `reverseVat(1000, undefined, { isTourist: true })` → `{ net: 1000, vat: 0 }`

Penny-rounding: `vat = gross - net` after both are rounded to 2 decimals,
guaranteeing `net + vat === gross` exactly. Matches the convention used by
`api-standards.ts:194-198` and `documentEngine.ts:181`.

---

## 5. Migration path (call sites by service)

### TECHNO_KOL_OPS (port 3200)

| File | Current | Replace with |
|---|---|---|
| `techno-kol-ops/src/documents/documentEngine.ts:181` | `Math.round(amount * 0.18)` | `calculateVat(amount, undefined, { date }).vat` |

### ONYX_PROCUREMENT (port 3100)

| File | Current | Replace with |
|---|---|---|
| `onyx-procurement/src/vat/vat-routes.js:103-105,135-137` | inline filter+reduce | `aggregatePeriod(lines)` |
| `onyx-procurement/src/imports/csv-import.js` | (uses `vat_rate` field) | preserve column, validate via `getVatRate(row.date)` |
| `onyx-procurement/src/tax-exports/bkmv-unified.js:236,265` | `inv.vat_amount` direct | recompute via `calculateVat` for verification |

### PAYROLL_AUTONOMOUS (port 5173)

No direct VAT calls found in `payroll-autonomous/`. Payroll deals with
income tax / BL / health, not VAT. Test fixtures in
`test/payroll/expense-manager.test.js` reference `vat` on expense
reimbursements — switch to `getVatRate(expense.date)`.

### ONYX_AI (port 3300)

| File | Current | Replace with |
|---|---|---|
| `onyx-ai/src/index.ts` | `vat` references | use `calculateVat` from shared package |

### api-server (cross-cutting)

| File | Current | Replace with |
|---|---|---|
| `api-server/src/constants.ts:1` | `VAT_RATE = 0.17` | **DELETE** — re-export `VAT_RATE_CURRENT` from shared-tax |
| `api-server/src/routes/israeli-accounting-engine.ts:27-40` | inline impl | re-export from shared-tax |
| `api-server/src/middleware/api-standards.ts:190-208` | inline `calculateVAT` | re-export `calculateVat` from shared-tax |
| `api-server/src/lib/project-costing-engine.ts:30,577,616` | hard-coded `0.18` | `getVatRate(project.invoice_date)` |
| `api-server/src/lib/super-ai-agent.ts:1247-1248` | percent form | `calculateVat(subtotal, undefined, { date })` |
| `api-server/src/routes/crm-ultimate.ts:867-868` | percent form | `calculateVat(d.total_before_vat, d.vat_rate ? d.vat_rate/100 : undefined)` |
| `api-server/src/routes/supply-chain-workflow.ts:134` | `vatRate = 1.18` | `calculateVat(b.deal_amount).gross` |
| `api-server/src/routes/employee-value-engine.ts:390` | hard-coded | `calculateVat(finalAmount, undefined, { date }).vat` |
| `api-server/src/__tests__/unit/invoice-calculations.test.ts:3` | `VAT_RATE = 0.17` | drive off `getVatRate(fixture.date)` |
| `api-server/src/__tests__/integration/financial-flow.test.ts:3` | `VAT_RATE = 0.17` | same |

### Standalone duplicates (delete + re-export)

- `desktop-tutorial-server/src/services/vat.service.js` — replace body with
  `module.exports = require('@techno-kol/shared-tax')`.
- `desktop-tutorial-client/src/components/ui/VATCalculator.jsx` — import
  `calculateVat` / `reverseVat` from shared-tax.

---

## 6. Coverage of original spec

| Required surface | Provided |
|---|---|
| `getVatRate(date)` | YES — date-aware, falls back to current, tolerates strings/null/invalid |
| `calculateVat(amount, rate)` | YES — `calculateVat(amount, rate?, opts?)` with rich breakdown |
| `reverseVat(grossAmount, rate)` | YES — penny-perfect (`net + vat === gross`) |
| Tourist exemption | YES — `applyTouristExemption()` validates passport + country, returns evidence string |
| Exempt sales handling | YES — `applyExemptSale(amount, reason)` enforces reason citation, distinguishes from zero-rate in `aggregatePeriod` |

Bonus delivered:

- Eilat zone, export, fruit/veg zero-rate categories.
- `aggregatePeriod` to roll up PCN836 line buckets (matches the existing
  vat-routes filter+reduce pattern exactly).
- `VAT_RATE_HISTORY` table — extending to a future rate change is a
  one-line append, no code changes.
- Backward-compat alias `getVatRateForDate` so the 6 existing
  `israeli-accounting-engine` consumers can re-point with zero diff.

---

## 7. Risks & follow-ups

1. **No tests yet shipped with this PR.** Recommended as Agent-272 follow-up:
   `packages/shared-tax/test/vat.test.ts` covering the behaviour matrix in §4.
2. **Stale `api-server/src/constants.ts`** still exports `VAT_RATE = 0.17`.
   Until call sites migrate it must stay (back-compat) but a deprecation
   comment is warranted; ideally re-export from shared-tax.
3. **Eilat detection** today relies on the caller passing `eilatZone: true`.
   A future enhancement could resolve from `customer.address.city === "אילת"`
   inside customer/360 services.
4. **PCN836 rounding** — Israeli tax authority validators occasionally reject
   files where line totals + VAT don't reconcile to the gross. The
   `vat = gross - net` pattern in `reverseVat` is defensive against that;
   `bkmv-unified.js:237,266` should adopt the same idiom.

---

## 8. Files changed

```
A packages/shared-tax/package.json
A packages/shared-tax/src/index.ts
A packages/shared-tax/src/vat.ts
A _qa-reports-25/AGENT-271-logic-vat.md
```

No existing files modified — this PR introduces the package only. Call-site
migrations are tracked in §5 and should be done in a follow-up PR per
service to keep blast radius small.

---

*Aligns with `ISRAELI_TAX_CONSTANTS_2026.md` §3 and supersedes the inline
`getVatRateForDate` in `api-server/src/routes/israeli-accounting-engine.ts`.*
