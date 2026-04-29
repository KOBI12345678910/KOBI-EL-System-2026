/**
 * @file api-server/src/constants.ts
 * @description Tax/finance constants used throughout api-server.
 *
 * VAT (מע"מ) is sourced from the single source of truth in
 * `@techno-kol/shared-tax/vat` (package `packages/shared-tax/src/vat.ts`,
 * Agent 271, 386 lines). Do NOT add new VAT literals here — they will drift
 * out of sync with PCN836 reporting and the historical rate table.
 *
 *  - For date-aware lookups (historical invoices) → `getVatRate(date)`
 *  - For full breakdowns (net/vat/gross with categories) → `calculateVat()`
 *  - For reverse calc (gross → net+vat) → `reverseVat()`
 *
 * The `VAT_RATE` constant below is preserved as a backward-compatible
 * alias: it dynamically resolves to today's rate via `getVatRate()`. Existing
 * importers (`routes/contractor-payment-decision.ts`,
 * `routes/quote-builder.ts`, `routes/israeli-business-integrations.ts`) keep
 * working without code changes; new code MUST call `getVatRate(invoiceDate)`
 * directly to honour the historical rate table.
 *
 * Israeli VAT law: חוק מס ערך מוסף, התשל"ו-1975
 *  - 18% standard rate, effective 2026-01-01
 *  - 17% standard rate, 2015-10-01 → 2025-12-31
 */
import {
  getVatRate,
  VAT_RATE_CURRENT,
  VAT_RATE_PRIOR,
  VAT_EFFECTIVE_FROM,
} from "@techno-kol/shared-tax/vat";

// Re-export the canonical helpers so callers can `import { getVatRate } from "../constants"`
// without reaching into the package directly.
export {
  getVatRate,
  VAT_RATE_CURRENT,
  VAT_RATE_PRIOR,
  VAT_EFFECTIVE_FROM,
};

/**
 * @deprecated Prefer `getVatRate(invoiceDate)` from `@techno-kol/shared-tax/vat`.
 *
 * Resolves to today's rate via the shared-tax history table. Replaces the
 * previous hard-coded `0.18` literal — the value is now sourced from the
 * single source of truth so a future rate change is a one-line append in
 * `packages/shared-tax/src/vat.ts` (`VAT_RATE_HISTORY`).
 */
export const VAT_RATE: number = getVatRate(new Date());

export const CORPORATE_TAX_RATE = 0.23;

export const INCOME_TAX_BRACKETS = [
  { threshold: 25000, rate: 0.35 },
  { threshold: 15000, rate: 0.25 },
  { threshold: 8000, rate: 0.15 },
  { threshold: 0, rate: 0.10 },
] as const;

export function getIncomeTaxRate(grossSalary: number): number {
  for (const bracket of INCOME_TAX_BRACKETS) {
    if (grossSalary > bracket.threshold) return bracket.rate;
  }
  return 0.10;
}

export const NATIONAL_INSURANCE_RATE = 0.0712;
export const HEALTH_INSURANCE_RATE = 0.031;
export const PENSION_EMPLOYEE_RATE = 0.06;
export const PENSION_EMPLOYER_RATE = 0.065;
export const SEVERANCE_RATE = 0.0833;

export const OVERHEAD_RATE = 0.15;
export const PROFIT_MARGIN_RATE = 0.25;

export const DISCOUNT_RATE_NPV = 0.08;

export const CARRYING_COST_RATE = 0.25;
