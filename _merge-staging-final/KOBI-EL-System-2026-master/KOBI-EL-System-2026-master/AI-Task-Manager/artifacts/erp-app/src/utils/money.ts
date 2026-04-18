export const VAT_RATE = 0.17;

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

export function addVat(amount: number): number {
  return amount * (1 + VAT_RATE);
}

export function vatAmount(amount: number): number {
  return amount * VAT_RATE;
}

export function removeVat(amountWithVat: number): number {
  return amountWithVat / (1 + VAT_RATE);
}

export function parseMoney(value: string | number): number {
  if (typeof value === "number") return value;
  const cleaned = String(value).replace(/[₪,\s]/g, "");
  return parseFloat(cleaned) || 0;
}
