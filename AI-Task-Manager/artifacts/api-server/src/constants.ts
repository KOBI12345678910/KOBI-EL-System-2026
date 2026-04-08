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
