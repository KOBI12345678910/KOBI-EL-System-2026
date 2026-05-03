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

// ───────── Rate table (date-keyed, do NOT mutate historical rates) ─────────

export const VAT_RATE_CURRENT = 0.18; // 18% — effective 2026-01-01
export const VAT_RATE_PRIOR = 0.17; // 17% — 2015-10-01 → 2025-12-31
export const VAT_EFFECTIVE_FROM = "2026-01-01";

/** Each entry covers `[from, to)`. Sorted ascending by `from`. */
export const VAT_RATE_HISTORY: ReadonlyArray<{
  from: string;
  to: string | null;
  rate: number;
  source: string;
}> = Object.freeze([
  { from: "2015-10-01", to: "2025-12-31", rate: 0.17, source: "תיקון תקנות מע\"מ 2015" },
  { from: "2026-01-01", to: null, rate: 0.18, source: "תיקון תקנות מע\"מ 2026" },
]);

// ───────── Exemption / zero-rate categories ─────────

export type VatCategory =
  | "standard" // 18% (or historical rate)
  | "eilat" // 0% — אזור סחר חופשי אילת
  | "export" // 0% — סעיף 30
  | "tourist" // 0% — סעיף 30(א)(8) — qualifying tourist services
  | "fruit_vegetables" // 0% — unprocessed produce
  | "exempt" // exempt (no input VAT recoverable) — סעיף 31
  | "zero_rate"; // generic 0% catch-all

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

// ───────── Rounding helper (2-decimal banker-safe rounding) ─────────

const ROUND_FACTOR = 100;
function round2(n: number): number {
  // Math.round on (n*100) — intentionally not banker's rounding to match
  // the behaviour Israeli tax authorities expect on PCN836 line items.
  return Math.round(n * ROUND_FACTOR) / ROUND_FACTOR;
}

// ───────── Core: rate lookup ─────────

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
export function getVatRate(date?: string | Date | null): number {
  if (date === undefined || date === null) return VAT_RATE_CURRENT;
  const d = typeof date === "string" ? new Date(date) : date;
  if (!(d instanceof Date) || isNaN(d.getTime())) return VAT_RATE_CURRENT;

  // Walk history table newest→oldest so the most recent matching row wins.
  for (let i = VAT_RATE_HISTORY.length - 1; i >= 0; i--) {
    const row = VAT_RATE_HISTORY[i];
    const from = new Date(row.from);
    const to = row.to ? new Date(row.to + "T23:59:59.999Z") : null;
    if (d >= from && (to === null || d <= to)) return row.rate;
  }
  return VAT_RATE_CURRENT;
}

/** Backward-compat alias matching `israeli-accounting-engine.getVatRateForDate`. */
export const getVatRateForDate = getVatRate;

// ───────── Category resolution ─────────

/**
 * Resolves a `VatContext` to a concrete category. Explicit `category`
 * always wins; otherwise flags compose in priority order:
 *   exempt > eilat > export > tourist > fruit_vegetables > standard.
 */
export function resolveCategory(ctx: VatContext = {}): VatCategory {
  if (ctx.category) return ctx.category;
  if (ctx.isExempt) return "exempt";
  if (ctx.eilatZone) return "eilat";
  if (ctx.isExport) return "export";
  if (ctx.isTourist) return "tourist";
  if (ctx.isFruitVegetables) return "fruit_vegetables";
  return "standard";
}

/** Returns the effective rate for a given context + date. */
export function getEffectiveRate(
  date?: string | Date | null,
  ctx: VatContext = {}
): number {
  const cat = resolveCategory(ctx);
  if (cat === "standard") return getVatRate(date);
  // All non-standard categories are 0% (exempt also returns 0 here, but
  // callers must check `isExempt` separately because exempt sales are
  // reported on a different PCN836 line and block input-VAT recovery).
  return 0;
}

// ───────── Calculation: forward (net → vat / gross) ─────────

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
export function calculateVat(
  amount: number,
  rate?: number,
  opts: VatContext & { date?: string | Date | null } = {}
): VatBreakdown {
  const net = round2(Number(amount) || 0);
  const category = resolveCategory(opts);
  const isExempt = category === "exempt";
  const isZeroRate = category !== "standard" && !isExempt;

  const effectiveRate =
    typeof rate === "number"
      ? rate
      : category === "standard"
        ? getVatRate(opts.date)
        : 0;

  const vat = round2(net * effectiveRate);
  const gross = round2(net + vat);

  return { net, vat, gross, rate: effectiveRate, category, isExempt, isZeroRate };
}

// ───────── Calculation: reverse (gross → net / vat) ─────────

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
export function reverseVat(
  grossAmount: number,
  rate?: number,
  opts: VatContext & { date?: string | Date | null } = {}
): VatBreakdown {
  const gross = round2(Number(grossAmount) || 0);
  const category = resolveCategory(opts);
  const isExempt = category === "exempt";
  const isZeroRate = category !== "standard" && !isExempt;

  const effectiveRate =
    typeof rate === "number"
      ? rate
      : category === "standard"
        ? getVatRate(opts.date)
        : 0;

  // Zero-rate or exempt: gross == net.
  if (effectiveRate === 0) {
    return {
      net: gross,
      vat: 0,
      gross,
      rate: 0,
      category,
      isExempt,
      isZeroRate,
    };
  }

  const net = round2(gross / (1 + effectiveRate));
  const vat = round2(gross - net); // preserves penny-perfect addition
  return { net, vat, gross, rate: effectiveRate, category, isExempt, isZeroRate };
}

// ───────── Tourist exemption (סעיף 30(א)(8)) ─────────

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

export function applyTouristExemption(input: TouristExemptionInput): VatBreakdown & {
  passportNumber: string;
  passportCountry: string;
  evidence: string;
} {
  if (!input.passportNumber || !input.passportCountry) {
    throw new Error(
      "applyTouristExemption: passportNumber + passportCountry required (סעיף 30(א)(8))"
    );
  }
  const ctx: VatContext = { isTourist: true };
  const breakdown =
    input.amountKind === "gross"
      ? reverseVat(input.amount, 0, { ...ctx, date: input.invoiceDate })
      : calculateVat(input.amount, 0, { ...ctx, date: input.invoiceDate });

  return {
    ...breakdown,
    passportNumber: input.passportNumber,
    passportCountry: input.passportCountry,
    evidence: `tourist exemption: passport ${input.passportCountry}-${input.passportNumber}, service ${
      input.serviceDate instanceof Date ? input.serviceDate.toISOString() : input.serviceDate
    }`,
  };
}

// ───────── Exempt sales handling (סעיף 31) ─────────

/**
 * Exempt sale per סעיף 31 (financial services, residential rent, certain
 * education/health). Distinct from zero-rate: the seller cannot recover
 * input VAT on related purchases, and the sale appears on a different
 * PCN836 line than zero-rate sales.
 */
export function applyExemptSale(
  amount: number,
  reason: string,
  amountKind: "net" | "gross" = "net"
): VatBreakdown & { reason: string } {
  if (!reason) {
    throw new Error("applyExemptSale: reason required (must cite סעיף 31 sub-clause)");
  }
  const ctx: VatContext = { isExempt: true };
  const breakdown =
    amountKind === "gross" ? reverseVat(amount, 0, ctx) : calculateVat(amount, 0, ctx);
  return { ...breakdown, reason };
}

// ───────── Aggregation helper for VAT period totals ─────────

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
export function aggregatePeriod(lines: VatLine[]): VatPeriodTotals {
  const totals: VatPeriodTotals = {
    taxableSales: 0,
    zeroRateSales: 0,
    exemptSales: 0,
    vatOnSales: 0,
  };
  for (const line of lines) {
    const net = Number(line.net) || 0;
    const vat = Number(line.vat) || 0;
    const isExempt =
      line.isExempt === true ||
      line.category === "exempt";
    const isZeroRate =
      !isExempt &&
      (line.isZeroRate === true ||
        line.category === "eilat" ||
        line.category === "export" ||
        line.category === "tourist" ||
        line.category === "fruit_vegetables" ||
        line.category === "zero_rate");
    if (isExempt) totals.exemptSales += net;
    else if (isZeroRate) totals.zeroRateSales += net;
    else totals.taxableSales += net;
    totals.vatOnSales += vat;
  }
  totals.taxableSales = round2(totals.taxableSales);
  totals.zeroRateSales = round2(totals.zeroRateSales);
  totals.exemptSales = round2(totals.exemptSales);
  totals.vatOnSales = round2(totals.vatOnSales);
  return totals;
}

// ───────── Default export bundle ─────────

export default {
  VAT_RATE_CURRENT,
  VAT_RATE_PRIOR,
  VAT_EFFECTIVE_FROM,
  VAT_RATE_HISTORY,
  getVatRate,
  getVatRateForDate,
  resolveCategory,
  getEffectiveRate,
  calculateVat,
  reverseVat,
  applyTouristExemption,
  applyExemptSale,
  aggregatePeriod,
};
