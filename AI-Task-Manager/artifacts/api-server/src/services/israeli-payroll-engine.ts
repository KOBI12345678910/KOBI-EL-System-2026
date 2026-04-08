export interface IsraeliTaxConfig {
  taxYear: number;
  creditPointValue: number;
  brackets: Array<{ upTo: number | null; rate: number }>;
  bituachLeumiEmployee: { lowerRate: number; upperRate: number; threshold: number; ceiling: number };
  bituachLeumiEmployer: { lowerRate: number; upperRate: number; threshold: number; ceiling: number };
  healthEmployee: { lowerRate: number; upperRate: number; threshold: number };
  pensionMinimumSalary: number;
  educationFundCeiling: number;
  convalescenceRatePerDay: number;
}

export const ISRAELI_TAX_CONFIG_2025: IsraeliTaxConfig = {
  taxYear: 2025,
  creditPointValue: 242,
  brackets: [
    { upTo: 7010, rate: 0.10 },
    { upTo: 10060, rate: 0.14 },
    { upTo: 16150, rate: 0.20 },
    { upTo: 21240, rate: 0.31 },
    { upTo: 44060, rate: 0.35 },
    { upTo: 57170, rate: 0.47 },
    { upTo: null, rate: 0.50 },
  ],
  bituachLeumiEmployee: {
    lowerRate: 0.004,
    upperRate: 0.07,
    threshold: 7522,
    ceiling: 49030,
  },
  bituachLeumiEmployer: {
    lowerRate: 0.037,
    upperRate: 0.123,
    threshold: 7522,
    ceiling: 49030,
  },
  healthEmployee: {
    lowerRate: 0.031,
    upperRate: 0.05,
    threshold: 7522,
  },
  pensionMinimumSalary: 7522,
  educationFundCeiling: 15712,
  convalescenceRatePerDay: 379,
};

export const ISRAELI_TAX_CONFIG_2026: IsraeliTaxConfig = {
  taxYear: 2026,
  creditPointValue: 247,
  brackets: [
    { upTo: 7190, rate: 0.10 },
    { upTo: 10320, rate: 0.14 },
    { upTo: 16560, rate: 0.20 },
    { upTo: 21790, rate: 0.31 },
    { upTo: 45210, rate: 0.35 },
    { upTo: 58680, rate: 0.47 },
    { upTo: null, rate: 0.50 },
  ],
  bituachLeumiEmployee: {
    lowerRate: 0.004,
    upperRate: 0.07,
    threshold: 7710,
    ceiling: 50270,
  },
  bituachLeumiEmployer: {
    lowerRate: 0.037,
    upperRate: 0.123,
    threshold: 7710,
    ceiling: 50270,
  },
  healthEmployee: {
    lowerRate: 0.031,
    upperRate: 0.05,
    threshold: 7710,
  },
  pensionMinimumSalary: 7710,
  educationFundCeiling: 16110,
  convalescenceRatePerDay: 389,
};

export function getTaxConfigForYear(year: number): IsraeliTaxConfig {
  if (year >= 2026) return ISRAELI_TAX_CONFIG_2026;
  return ISRAELI_TAX_CONFIG_2025;
}

export interface PayrollInputEmployee {
  id: number | string;
  name: string;
  department: string;
  jobTitle: string;
  baseSalary: number;
  overtimePay?: number;
  overtimeHours?: number;
  bonus?: number;
  commission?: number;
  travelAllowance?: number;
  allowances?: number;
  taxCreditPoints?: number;
  pensionEmployeePct?: number;
  pensionEmployerPct?: number;
  severancePct?: number;
  educationFundEmployeePct?: number;
  educationFundEmployerPct?: number;
  kerenHishtalmutEnabled?: boolean;
  hireDate?: string;
  seniorityyears?: number;
  convalescenceDays?: number;
  taxEmployeeStatus?: "resident" | "new_immigrant" | "single_parent" | "disabled";
}

export interface PayrollLineItem {
  lineType: string;
  description: string;
  amount: number;
  isDeduction: boolean;
  isEmployerCost: boolean;
}

export interface PayrollCalculationResult {
  employeeId: number | string;
  employeeName: string;
  department: string;
  jobTitle: string;
  period: string;

  baseSalary: number;
  overtimePay: number;
  overtimeHours: number;
  bonus: number;
  commission: number;
  travelAllowance: number;
  allowances: number;
  convalescencePay: number;
  grossSalary: number;

  incomeTax: number;
  taxCreditPointsValue: number;
  bituachLeumiEmployee: number;
  healthInsuranceEmployee: number;
  pensionEmployee: number;
  educationFundEmployee: number;
  totalEmployeeDeductions: number;

  netSalary: number;

  pensionEmployer: number;
  severanceContrib: number;
  bituachLeumiEmployer: number;
  educationFundEmployer: number;
  totalEmployerCost: number;
  totalCostToEmployer: number;

  lineItems: PayrollLineItem[];
}

export function computeIncomeTax(
  grossMonthly: number,
  creditPoints: number,
  config: IsraeliTaxConfig
): { grossTax: number; creditValue: number; netTax: number } {
  const annualGross = grossMonthly * 12;
  let tax = 0;
  let prevAnnual = 0;

  for (const bracket of config.brackets) {
    const annualCeiling = bracket.upTo !== null ? bracket.upTo * 12 : Infinity;
    if (annualGross <= prevAnnual) break;
    const taxable = Math.min(annualGross, annualCeiling) - prevAnnual;
    tax += taxable * bracket.rate;
    prevAnnual = annualCeiling;
    if (bracket.upTo === null) break;
  }

  const monthlyGrossTax = tax / 12;
  const creditValue = creditPoints * config.creditPointValue;
  const monthlyNetTax = Math.max(0, monthlyGrossTax - creditValue);

  return {
    grossTax: Math.round(monthlyGrossTax),
    creditValue: Math.round(creditValue),
    netTax: Math.round(monthlyNetTax),
  };
}

export function computeBituachLeumi(
  grossMonthly: number,
  config: IsraeliTaxConfig
): { bituachLeumiEmployee: number; healthInsuranceEmployee: number; employeeAmount: number; employerAmount: number } {
  const bl = config.bituachLeumiEmployee;
  const blEmp = config.bituachLeumiEmployer;
  const h = config.healthEmployee;

  const cappedGross = Math.min(grossMonthly, bl.ceiling);

  let employeeNI = 0;
  if (cappedGross <= bl.threshold) {
    employeeNI = cappedGross * bl.lowerRate;
  } else {
    employeeNI = bl.threshold * bl.lowerRate + (cappedGross - bl.threshold) * bl.upperRate;
  }

  let employerNI = 0;
  if (cappedGross <= blEmp.threshold) {
    employerNI = cappedGross * blEmp.lowerRate;
  } else {
    employerNI = blEmp.threshold * blEmp.lowerRate + (cappedGross - blEmp.threshold) * blEmp.upperRate;
  }

  let healthEmp = 0;
  const healthCapped = Math.min(grossMonthly, bl.ceiling);
  if (healthCapped <= h.threshold) {
    healthEmp = healthCapped * h.lowerRate;
  } else {
    healthEmp = h.threshold * h.lowerRate + (healthCapped - h.threshold) * h.upperRate;
  }

  const bituachLeumiEmployee = Math.round(employeeNI);
  const healthInsuranceEmployee = Math.round(healthEmp);

  return {
    bituachLeumiEmployee,
    healthInsuranceEmployee,
    employeeAmount: bituachLeumiEmployee + healthInsuranceEmployee,
    employerAmount: Math.round(employerNI),
  };
}

export function computeConvalescencePay(
  seniorityYears: number,
  convalescenceDays: number,
  config: IsraeliTaxConfig
): number {
  let days = convalescenceDays;
  if (!days) {
    if (seniorityYears < 1) days = 0;
    else if (seniorityYears === 1) days = 5;
    else if (seniorityYears === 2) days = 6;
    else days = Math.min(10, 6 + (seniorityYears - 2));
  }
  return Math.round((days * config.convalescenceRatePerDay) / 12);
}

export function calculateIsraeliPayroll(
  employee: PayrollInputEmployee,
  period: string,
  config: IsraeliTaxConfig = ISRAELI_TAX_CONFIG_2025
): PayrollCalculationResult {
  const pensionEmployeePct = (employee.pensionEmployeePct ?? 6) / 100;
  const pensionEmployerPct = (employee.pensionEmployerPct ?? 6.5) / 100;
  const severancePct = (employee.severancePct ?? 8.33) / 100;
  const educationFundEmployeePct = (employee.educationFundEmployeePct ?? 2.5) / 100;
  const educationFundEmployerPct = (employee.educationFundEmployerPct ?? 7.5) / 100;
  const kerenEnabled = employee.kerenHishtalmutEnabled ?? true;
  let taxCreditPoints = employee.taxCreditPoints ?? 2.25;
  const status = employee.taxEmployeeStatus;
  if (status === "new_immigrant") taxCreditPoints = Math.max(taxCreditPoints, 3.0);
  else if (status === "single_parent") taxCreditPoints = Math.max(taxCreditPoints, 3.5);
  else if (status === "disabled") taxCreditPoints = Math.max(taxCreditPoints, 3.5);

  const baseSalary = Math.round(employee.baseSalary || 0);
  const overtimePay = Math.round(employee.overtimePay || 0);
  const overtimeHours = employee.overtimeHours || 0;
  const bonus = Math.round(employee.bonus || 0);
  const commission = Math.round(employee.commission || 0);
  const travelAllowance = Math.round(employee.travelAllowance || 0);
  const allowances = Math.round(employee.allowances || 0);

  const hireDate = employee.hireDate ? new Date(employee.hireDate) : null;
  const [periodYear, periodMonth] = period.split("-").map(Number);
  const periodEndDate = new Date(periodYear, periodMonth, 0);
  const seniorityYears = hireDate
    ? Math.floor((periodEndDate.getTime() - hireDate.getTime()) / (365.25 * 24 * 3600 * 1000))
    : (employee.seniorityyears ?? 0);

  const convalescencePay = computeConvalescencePay(seniorityYears, employee.convalescenceDays ?? 0, config);

  const grossSalary = baseSalary + overtimePay + bonus + commission + travelAllowance + allowances + convalescencePay;

  const { netTax: incomeTax, creditValue: taxCreditPointsValue } = computeIncomeTax(grossSalary, taxCreditPoints, config);

  const { bituachLeumiEmployee: bituachLeumi, healthInsuranceEmployee, employerAmount: bituachLeumiEmp } = computeBituachLeumi(grossSalary, config);

  const pensionBase = Math.min(grossSalary, baseSalary);
  const pensionEmployee = Math.round(pensionBase * pensionEmployeePct);
  const pensionEmployer = Math.round(pensionBase * pensionEmployerPct);
  const severanceContrib = Math.round(pensionBase * severancePct);

  const educationFundBase = Math.min(baseSalary, config.educationFundCeiling);
  const educationFundEmployee = kerenEnabled ? Math.round(educationFundBase * educationFundEmployeePct) : 0;
  const educationFundEmployer = kerenEnabled ? Math.round(educationFundBase * educationFundEmployerPct) : 0;

  const totalEmployeeDeductions = incomeTax + bituachLeumi + healthInsuranceEmployee + pensionEmployee + educationFundEmployee;
  const netSalary = grossSalary - totalEmployeeDeductions;

  const totalEmployerCost = bituachLeumiEmp + pensionEmployer + severanceContrib + educationFundEmployer;
  const totalCostToEmployer = grossSalary + totalEmployerCost;

  const lineItems: PayrollLineItem[] = [
    { lineType: "base_salary", description: "שכר בסיס", amount: baseSalary, isDeduction: false, isEmployerCost: false },
  ];
  if (overtimePay > 0) lineItems.push({ lineType: "overtime", description: `שעות נוספות (${overtimeHours})`, amount: overtimePay, isDeduction: false, isEmployerCost: false });
  if (bonus > 0) lineItems.push({ lineType: "bonus", description: "בונוס", amount: bonus, isDeduction: false, isEmployerCost: false });
  if (commission > 0) lineItems.push({ lineType: "commission", description: "עמלות", amount: commission, isDeduction: false, isEmployerCost: false });
  if (travelAllowance > 0) lineItems.push({ lineType: "travel", description: "קצובת נסיעות", amount: travelAllowance, isDeduction: false, isEmployerCost: false });
  if (allowances > 0) lineItems.push({ lineType: "allowance", description: "תוספות", amount: allowances, isDeduction: false, isEmployerCost: false });
  if (convalescencePay > 0) lineItems.push({ lineType: "convalescence", description: "דמי הבראה", amount: convalescencePay, isDeduction: false, isEmployerCost: false });

  lineItems.push({ lineType: "income_tax", description: "מס הכנסה", amount: incomeTax, isDeduction: true, isEmployerCost: false });
  lineItems.push({ lineType: "bituach_leumi_employee", description: "ביטוח לאומי (עובד)", amount: bituachLeumi, isDeduction: true, isEmployerCost: false });
  lineItems.push({ lineType: "health_insurance_employee", description: "דמי ביטוח בריאות ממלכתי (עובד)", amount: healthInsuranceEmployee, isDeduction: true, isEmployerCost: false });
  lineItems.push({ lineType: "pension_employee", description: "פנסיה (עובד 6%)", amount: pensionEmployee, isDeduction: true, isEmployerCost: false });
  if (educationFundEmployee > 0) lineItems.push({ lineType: "education_fund_employee", description: "קרן השתלמות (עובד 2.5%)", amount: educationFundEmployee, isDeduction: true, isEmployerCost: false });

  lineItems.push({ lineType: "bituach_leumi_employer", description: "ביטוח לאומי (מעסיק)", amount: bituachLeumiEmp, isDeduction: false, isEmployerCost: true });
  lineItems.push({ lineType: "pension_employer", description: "פנסיה (מעסיק 6.5%)", amount: pensionEmployer, isDeduction: false, isEmployerCost: true });
  lineItems.push({ lineType: "severance", description: "פיצויים (8.33%)", amount: severanceContrib, isDeduction: false, isEmployerCost: true });
  if (educationFundEmployer > 0) lineItems.push({ lineType: "education_fund_employer", description: "קרן השתלמות (מעסיק 7.5%)", amount: educationFundEmployer, isDeduction: false, isEmployerCost: true });

  return {
    employeeId: employee.id,
    employeeName: employee.name,
    department: employee.department,
    jobTitle: employee.jobTitle,
    period,
    baseSalary,
    overtimePay,
    overtimeHours,
    bonus,
    commission,
    travelAllowance,
    allowances,
    convalescencePay,
    grossSalary,
    incomeTax,
    taxCreditPointsValue,
    bituachLeumiEmployee: bituachLeumi,
    healthInsuranceEmployee,
    pensionEmployee,
    educationFundEmployee,
    totalEmployeeDeductions,
    netSalary,
    pensionEmployer,
    severanceContrib,
    bituachLeumiEmployer: bituachLeumiEmp,
    educationFundEmployer,
    totalEmployerCost,
    totalCostToEmployer,
    lineItems,
  };
}
