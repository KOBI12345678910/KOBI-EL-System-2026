/**
 * @module @techno-kol/shared-tax/vat
 * @description Single source of truth for Israeli VAT (מע"מ) calculations
 * across all four services (TECHNO_KOL_OPS, ONYX_PROCUREMENT,
 * PAYROLL_AUTONOMOUS, ONYX_AI). Replaces the scattered VAT_RATE constants
 * and per-service `calculateVAT` helpers found in:
 *   - api-server/src/routes/israeli-accounting-engine.ts (getVatRateForDate)
 *   - api-server/src/middleware/api-standards.ts          (calculateVAT)
 *   - api-server/src/constants.ts                         (VAT_RATE = 0.17 stale)
 *   - desktop-tutorial-server/src/services/vat.service.js
 *   - desktop-tutorial-client/src/components/ui/VATCalculator.jsx
 *   - onyx-procurement/src/vat/vat-routes.js              (period totals)
 *
 * Israeli VAT law:  חוק מס ערך מוסף, התשל"ו-1975
 * Effective rates (CONFIRMED in ISRAELI_TAX_CONSTANTS_2026.md §3):
 *   - 18% standard rate, effective from 2026-01-01
 *   - 17% standard rate, for invoices dated 2015-10-01 → 2025-12-31
 *   -  0% Eilat free-trade zone (חוק אזור סחר חופשי אילת)
 *   -  0% exports & unprocessed fruit/vegetables (סעיף 30 חוק מע"מ)
 *   -  0% qualifying tourist services (סעיף 30(א)(8))
 *   - exempt: financial services, residential rent, etc. (סעיף 31)
 */
export declare const VAT_RATE_CURRENT = 0.18;
export declare const VAT_RATE_PRIOR = 0.17;
export declare const VAT_EFFECTIVE_FROM = "2026-01-01";
/** Each entry covers `[from, to)`. Sorted ascending by `from`. */
export declare const VAT_RATE_HISTORY: ReadonlyArray<{
    from: string;
    to: string | null;
    rate: number;
    source: string;
}>;
export type VatCategory = "standard" | "eilat" | "export" | "tourist" | "fruit_vegetables" | "exempt" | "zero_rate";
export interface VatContext {
    /** Customer is non-resident tourist meeting סעיף 30(א)(8) conditions. */
    isTourist?: boolean;
    /** Goods/services delivered to or consumed in אילת free-trade zone. */
    eilatZone?: boolean;
    /** Export of goods/services outside Israel (proof required). */
    isExport?: boolean;
    /** Unprocessed fruit/vegetables. */
    isFruitVegetables?: boolean;
    /** Explicit exemption (financial services, residential rent, etc.). */
    isExempt?: boolean;
    /** Force a specific category (overrides flag-derived inference). */
    category?: VatCategory;
}
/**
 * Returns the VAT rate (as decimal, e.g. 0.18) effective on the given date.
 * Defaults to today's date if `date` is null/undefined/invalid.
 *
 * Historical invoices MUST be re-priced with their own date — never with
 * the current rate. PCN836 submissions for prior periods will fail
 * validation otherwise.
 *
 * @example
 *   getVatRate(new Date("2025-06-15")) // → 0.17
 *   getVatRate(new Date("2026-04-29")) // → 0.18
 *   getVatRate()                        // → 0.18 (current)
 */
export declare function getVatRate(date?: string | Date | null): number;
/** Backward-compat alias matching `israeli-accounting-engine.getVatRateForDate`. */
export declare const getVatRateForDate: typeof getVatRate;
/**
 * Resolves a `VatContext` to a concrete category. Explicit `category`
 * always wins; otherwise flags compose in priority order:
 *   exempt > eilat > export > tourist > fruit_vegetables > standard.
 */
export declare function resolveCategory(ctx?: VatContext): VatCategory;
/** Returns the effective rate for a given context + date. */
export declare function getEffectiveRate(date?: string | Date | null, ctx?: VatContext): number;
export interface VatBreakdown {
    net: number;
    vat: number;
    gross: number;
    rate: number;
    category: VatCategory;
    /** True if exempt (different PCN836 line; no input VAT recovery upstream). */
    isExempt: boolean;
    /** True if zero-rate (reported on zero-rate line, but invoice issued). */
    isZeroRate: boolean;
}
/**
 * Calculates VAT on a net amount.
 *
 * @param amount   Net amount excluding VAT (NIS).
 * @param rate     Optional explicit rate as decimal (0.18). If omitted,
 *                 derived from `date`/`context`.
 * @param opts     Date + exemption context. `opts.date` is REQUIRED for
 *                 historical invoices to retain their original rate.
 *
 * @example
 *   calculateVat(1000)                                 // 1000/180/1180 @ 18%
 *   calculateVat(1000, undefined, { date: "2025-12-01" }) // 17% rate
 *   calculateVat(1000, undefined, { isTourist: true }) // 1000/0/1000 @ 0%
 */
export declare function calculateVat(amount: number, rate?: number, opts?: VatContext & {
    date?: string | Date | null;
}): VatBreakdown;
/**
 * Reverses VAT from a gross (VAT-inclusive) amount.
 *
 * @param grossAmount Total amount including VAT (NIS).
 * @param rate        Optional explicit rate. Defaults to current rate.
 * @param opts        Date + exemption context.
 *
 * @example
 *   reverseVat(1180)                  // → { net: 1000, vat: 180, gross: 1180 }
 *   reverseVat(1170, 0.17)            // → { net: 1000, vat: 170, gross: 1170 }
 *   reverseVat(1000, undefined, { isTourist: true })
 *                                     // → { net: 1000, vat: 0, gross: 1000 }
 */
export declare function reverseVat(grossAmount: number, rate?: number, opts?: VatContext & {
    date?: string | Date | null;
}): VatBreakdown;
/**
 * Tourist VAT exemption per סעיף 30(א)(8) of חוק מע"מ. Applies a 0% rate
 * to qualifying services (hotel accommodation, car rental for tourists,
 * tour-operator services) when ALL conditions are met:
 *
 *  1. Customer holds a valid foreign passport / B-2 visa.
 *  2. Service is consumed within the eligible 60-day window.
 *  3. Vendor records passport number + visa stamp on the invoice.
 *
 * This helper validates the inputs and returns a zero-rated breakdown.
 * It does NOT verify the passport — callers must persist the proof
 * documents and reference them in the tax_invoices row.
 */
export interface TouristExemptionInput {
    amount: number;
    /** Net amount (default) or gross — toggles forward/reverse calculation. */
    amountKind?: "net" | "gross";
    passportNumber: string;
    passportCountry: string;
    visaType?: string;
    serviceDate: string | Date;
    /** Optional override; defaults to `serviceDate`. */
    invoiceDate?: string | Date;
}
export declare function applyTouristExemption(input: TouristExemptionInput): VatBreakdown & {
    passportNumber: string;
    passportCountry: string;
    evidence: string;
};
/**
 * Exempt sale per סעיף 31 (financial services, residential rent, certain
 * education/health). Distinct from zero-rate: the seller cannot recover
 * input VAT on related purchases, and the sale appears on a different
 * PCN836 line than zero-rate sales.
 */
export declare function applyExemptSale(amount: number, reason: string, amountKind?: "net" | "gross"): VatBreakdown & {
    reason: string;
};
export interface VatLine {
    net: number;
    vat: number;
    category?: VatCategory;
    isExempt?: boolean;
    isZeroRate?: boolean;
}
export interface VatPeriodTotals {
    taxableSales: number;
    zeroRateSales: number;
    exemptSales: number;
    vatOnSales: number;
}
/**
 * Aggregates per-line totals into the four PCN836 buckets used by
 * `onyx-procurement/src/vat/vat-routes.js`. Mirrors that logic so the
 * route can switch to this helper without behaviour change.
 */
export declare function aggregatePeriod(lines: VatLine[]): VatPeriodTotals;
declare const _default: {
    VAT_RATE_CURRENT: number;
    VAT_RATE_PRIOR: number;
    VAT_EFFECTIVE_FROM: string;
    VAT_RATE_HISTORY: readonly {
        from: string;
        to: string | null;
        rate: number;
        source: string;
    }[];
    getVatRate: typeof getVatRate;
    getVatRateForDate: typeof getVatRate;
    resolveCategory: typeof resolveCategory;
    getEffectiveRate: typeof getEffectiveRate;
    calculateVat: typeof calculateVat;
    reverseVat: typeof reverseVat;
    applyTouristExemption: typeof applyTouristExemption;
    applyExemptSale: typeof applyExemptSale;
    aggregatePeriod: typeof aggregatePeriod;
};
export default _default;
//# sourceMappingURL=vat.d.ts.map