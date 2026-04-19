// ============================================================
// B-D031: Israeli VAT multi-period rate
// 0.17 pre-2026-01-01, 0.18 from 2026-01-01
// ============================================================
const VAT_SWITCH_DATE = new Date("2026-01-01T00:00:00.000Z");
const VAT_RATE_PRE_2026 = 0.17;
const VAT_RATE_2026 = 0.18;

/**
 * Returns the Israeli VAT rate applicable for the given date.
 * Use this for anything historical (invoices, old reports).
 * For current new documents, pass `new Date()`.
 */
export function getVatRateForDate(date: Date | string | number | null | undefined): number {
  if (date === null || date === undefined) return VAT_RATE_2026;
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return VAT_RATE_2026;
  return d.getTime() >= VAT_SWITCH_DATE.getTime() ? VAT_RATE_2026 : VAT_RATE_PRE_2026;
}

/**
 * Current VAT rate (today). Prefer `getVatRateForDate(docDate)` over this constant
 * when handling historical or scheduled-future documents.
 */
export const VAT_RATE = getVatRateForDate(new Date());

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

export function shekelsToAgorot(shekels: number): number {
  return Math.round(shekels * 100);
}

export function agorotToShekels(agorot: number): number {
  return agorot / 100;
}

export function formatMoney(shekels: number): string {
  return new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(shekels);
}

export function formatMoneyFromAgorot(agorot: number): string {
  return formatMoney(agorotToShekels(agorot));
}

export function addVat(amount: number, date?: Date | string | number): number {
  const rate = date !== undefined ? getVatRateForDate(date) : VAT_RATE;
  return amount * (1 + rate);
}

export function vatAmount(amount: number, date?: Date | string | number): number {
  const rate = date !== undefined ? getVatRateForDate(date) : VAT_RATE;
  return amount * rate;
}

export function removeVat(amountWithVat: number, date?: Date | string | number): number {
  const rate = date !== undefined ? getVatRateForDate(date) : VAT_RATE;
  return amountWithVat / (1 + rate);
}

export function parseMoney(value: string | number): number {
  if (typeof value === "number") return value;
  const cleaned = String(value).replace(/[₪,\s]/g, "");
  return parseFloat(cleaned) || 0;
}
