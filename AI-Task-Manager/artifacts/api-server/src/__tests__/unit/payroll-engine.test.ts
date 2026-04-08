import { describe, it, expect } from "vitest";
import {
  computeIncomeTax,
  computeBituachLeumi,
  computeConvalescencePay,
  calculateIsraeliPayroll,
  ISRAELI_TAX_CONFIG_2025,
  ISRAELI_TAX_CONFIG_2026,
  getTaxConfigForYear,
} from "../../services/israeli-payroll-engine";
import type { PayrollInputEmployee } from "../../services/israeli-payroll-engine";

describe("Israeli Payroll Engine - Unit Tests", () => {
  describe("getTaxConfigForYear", () => {
    it("returns 2025 config for year 2025", () => {
      expect(getTaxConfigForYear(2025).taxYear).toBe(2025);
    });

    it("returns 2026 config for year 2026", () => {
      expect(getTaxConfigForYear(2026).taxYear).toBe(2026);
    });

    it("returns 2026 config for years above 2026", () => {
      expect(getTaxConfigForYear(2030).taxYear).toBe(2026);
    });
  });

  describe("computeIncomeTax", () => {
    const config = ISRAELI_TAX_CONFIG_2025;

    it("applies zero tax for very low income below first bracket", () => {
      const result = computeIncomeTax(1000, 2.25, config);
      expect(result.netTax).toBe(0);
    });

    it("applies 10% bracket for income up to 7010 NIS", () => {
      const result = computeIncomeTax(5000, 0, config);
      expect(result.grossTax).toBeGreaterThan(0);
      expect(result.netTax).toBeGreaterThanOrEqual(0);
    });

    it("calculates credit points correctly and reduces tax", () => {
      const noCredit = computeIncomeTax(10000, 0, config);
      const withCredit = computeIncomeTax(10000, 2.25, config);
      expect(withCredit.netTax).toBeLessThan(noCredit.grossTax);
      expect(withCredit.creditValue).toBe(Math.round(2.25 * config.creditPointValue));
    });

    it("credit points value matches config creditPointValue", () => {
      const result = computeIncomeTax(20000, 3, config);
      expect(result.creditValue).toBe(3 * config.creditPointValue);
    });

    it("net tax cannot go below zero with large credit", () => {
      const result = computeIncomeTax(500, 10, config);
      expect(result.netTax).toBe(0);
    });

    it("calculates progressive tax across multiple brackets", () => {
      const result = computeIncomeTax(50000, 0, config);
      expect(result.grossTax).toBeGreaterThan(0);
      const singleRate = Math.round((50000 * 12 * 0.35) / 12);
      expect(result.grossTax).toBeLessThan(singleRate);
    });

    it("applies highest bracket (50%) for very high income", () => {
      const result = computeIncomeTax(100000, 0, config);
      expect(result.grossTax).toBeGreaterThan(0);
    });

    it("returns rounded integers", () => {
      const result = computeIncomeTax(15000, 2.25, config);
      expect(Number.isInteger(result.grossTax)).toBe(true);
      expect(Number.isInteger(result.netTax)).toBe(true);
      expect(Number.isInteger(result.creditValue)).toBe(true);
    });
  });

  describe("computeBituachLeumi", () => {
    const config = ISRAELI_TAX_CONFIG_2025;

    it("applies lower rate below threshold (7522 NIS)", () => {
      const gross = 5000;
      const result = computeBituachLeumi(gross, config);
      expect(result.bituachLeumiEmployee).toBe(Math.round(gross * config.bituachLeumiEmployee.lowerRate));
    });

    it("applies tiered rate above threshold", () => {
      const gross = 10000;
      const result = computeBituachLeumi(gross, config);
      const expected = Math.round(
        config.bituachLeumiEmployee.threshold * config.bituachLeumiEmployee.lowerRate +
        (gross - config.bituachLeumiEmployee.threshold) * config.bituachLeumiEmployee.upperRate
      );
      expect(result.bituachLeumiEmployee).toBe(expected);
    });

    it("caps contribution at ceiling (49030 NIS)", () => {
      const resultAtCeiling = computeBituachLeumi(49030, config);
      const resultAbove = computeBituachLeumi(60000, config);
      expect(resultAbove.bituachLeumiEmployee).toBe(resultAtCeiling.bituachLeumiEmployee);
    });

    it("includes health insurance employee amount", () => {
      const result = computeBituachLeumi(10000, config);
      expect(result.healthInsuranceEmployee).toBeGreaterThan(0);
    });

    it("total employeeAmount equals NI + health", () => {
      const result = computeBituachLeumi(10000, config);
      expect(result.employeeAmount).toBe(result.bituachLeumiEmployee + result.healthInsuranceEmployee);
    });

    it("employer NI is higher rate than employee NI", () => {
      const result = computeBituachLeumi(15000, config);
      expect(result.employerAmount).toBeGreaterThan(result.bituachLeumiEmployee);
    });

    it("returns rounded integers", () => {
      const result = computeBituachLeumi(12345, config);
      expect(Number.isInteger(result.bituachLeumiEmployee)).toBe(true);
      expect(Number.isInteger(result.healthInsuranceEmployee)).toBe(true);
      expect(Number.isInteger(result.employerAmount)).toBe(true);
    });
  });

  describe("computeConvalescencePay", () => {
    const config = ISRAELI_TAX_CONFIG_2025;

    it("returns 0 for less than 1 year seniority", () => {
      expect(computeConvalescencePay(0, 0, config)).toBe(0);
    });

    it("returns 5 days pay for 1 year seniority", () => {
      const expected = Math.round((5 * config.convalescenceRatePerDay) / 12);
      expect(computeConvalescencePay(1, 0, config)).toBe(expected);
    });

    it("returns 6 days pay for 2 years seniority", () => {
      const expected = Math.round((6 * config.convalescenceRatePerDay) / 12);
      expect(computeConvalescencePay(2, 0, config)).toBe(expected);
    });

    it("increments by 1 day per year from year 3 onwards", () => {
      const year3 = computeConvalescencePay(3, 0, config);
      const expected3 = Math.round((7 * config.convalescenceRatePerDay) / 12);
      expect(year3).toBe(expected3);
    });

    it("caps at 10 days for 10+ years seniority", () => {
      const year10 = computeConvalescencePay(10, 0, config);
      const year15 = computeConvalescencePay(15, 0, config);
      const maxExpected = Math.round((10 * config.convalescenceRatePerDay) / 12);
      expect(year10).toBe(maxExpected);
      expect(year15).toBe(maxExpected);
    });

    it("uses explicit convalescenceDays when provided", () => {
      const explicit = computeConvalescencePay(5, 8, config);
      const expected = Math.round((8 * config.convalescenceRatePerDay) / 12);
      expect(explicit).toBe(expected);
    });

    it("uses 2026 config rate correctly", () => {
      const config2026 = ISRAELI_TAX_CONFIG_2026;
      const result = computeConvalescencePay(1, 0, config2026);
      const expected = Math.round((5 * config2026.convalescenceRatePerDay) / 12);
      expect(result).toBe(expected);
    });
  });

  describe("calculateIsraeliPayroll - comprehensive", () => {
    const baseEmployee: PayrollInputEmployee = {
      id: 1,
      name: "Test Employee",
      department: "Engineering",
      jobTitle: "Developer",
      baseSalary: 15000,
      taxCreditPoints: 2.25,
    };

    it("calculates gross salary as sum of all income components", () => {
      const emp: PayrollInputEmployee = {
        ...baseEmployee,
        baseSalary: 10000,
        bonus: 1000,
        commission: 500,
        travelAllowance: 300,
        allowances: 200,
      };
      const result = calculateIsraeliPayroll(emp, "2025-01", ISRAELI_TAX_CONFIG_2025);
      expect(result.grossSalary).toBe(10000 + 1000 + 500 + 300 + 200 + result.convalescencePay);
    });

    it("net salary = gross - total deductions", () => {
      const result = calculateIsraeliPayroll(baseEmployee, "2025-01", ISRAELI_TAX_CONFIG_2025);
      expect(result.netSalary).toBe(result.grossSalary - result.totalEmployeeDeductions);
    });

    it("total deductions sum correctly", () => {
      const result = calculateIsraeliPayroll(baseEmployee, "2025-01", ISRAELI_TAX_CONFIG_2025);
      const expected = result.incomeTax + result.bituachLeumiEmployee + result.healthInsuranceEmployee +
        result.pensionEmployee + result.educationFundEmployee;
      expect(result.totalEmployeeDeductions).toBe(expected);
    });

    it("total cost to employer = gross + employer costs", () => {
      const result = calculateIsraeliPayroll(baseEmployee, "2025-01", ISRAELI_TAX_CONFIG_2025);
      expect(result.totalCostToEmployer).toBe(result.grossSalary + result.totalEmployerCost);
    });

    it("pension employee defaults to 6%", () => {
      const result = calculateIsraeliPayroll(baseEmployee, "2025-01", ISRAELI_TAX_CONFIG_2025);
      const pensionBase = Math.min(result.grossSalary, result.baseSalary);
      expect(result.pensionEmployee).toBe(Math.round(pensionBase * 0.06));
    });

    it("pension employer defaults to 6.5%", () => {
      const result = calculateIsraeliPayroll(baseEmployee, "2025-01", ISRAELI_TAX_CONFIG_2025);
      const pensionBase = Math.min(result.grossSalary, result.baseSalary);
      expect(result.pensionEmployer).toBe(Math.round(pensionBase * 0.065));
    });

    it("severance contribution defaults to 8.33%", () => {
      const result = calculateIsraeliPayroll(baseEmployee, "2025-01", ISRAELI_TAX_CONFIG_2025);
      const pensionBase = Math.min(result.grossSalary, result.baseSalary);
      expect(result.severanceContrib).toBe(Math.round(pensionBase * 0.0833));
    });

    it("education fund enabled by default", () => {
      const result = calculateIsraeliPayroll(baseEmployee, "2025-01", ISRAELI_TAX_CONFIG_2025);
      expect(result.educationFundEmployee).toBeGreaterThan(0);
      expect(result.educationFundEmployer).toBeGreaterThan(0);
    });

    it("education fund disabled when kerenHishtalmutEnabled is false", () => {
      const emp = { ...baseEmployee, kerenHishtalmutEnabled: false };
      const result = calculateIsraeliPayroll(emp, "2025-01", ISRAELI_TAX_CONFIG_2025);
      expect(result.educationFundEmployee).toBe(0);
      expect(result.educationFundEmployer).toBe(0);
    });

    it("new_immigrant gets minimum 3.0 credit points", () => {
      const emp = { ...baseEmployee, taxCreditPoints: 1.0, taxEmployeeStatus: "new_immigrant" as const };
      const result = calculateIsraeliPayroll(emp, "2025-01", ISRAELI_TAX_CONFIG_2025);
      const compareResult = calculateIsraeliPayroll({ ...baseEmployee, taxCreditPoints: 3.0 }, "2025-01", ISRAELI_TAX_CONFIG_2025);
      expect(result.incomeTax).toBe(compareResult.incomeTax);
    });

    it("single_parent gets minimum 3.5 credit points", () => {
      const emp = { ...baseEmployee, taxCreditPoints: 1.0, taxEmployeeStatus: "single_parent" as const };
      const result = calculateIsraeliPayroll(emp, "2025-01", ISRAELI_TAX_CONFIG_2025);
      const compareResult = calculateIsraeliPayroll({ ...baseEmployee, taxCreditPoints: 3.5 }, "2025-01", ISRAELI_TAX_CONFIG_2025);
      expect(result.incomeTax).toBe(compareResult.incomeTax);
    });

    it("overtimePay included in gross salary", () => {
      const emp: PayrollInputEmployee = { ...baseEmployee, overtimePay: 2000, overtimeHours: 20 };
      const result = calculateIsraeliPayroll(emp, "2025-01", ISRAELI_TAX_CONFIG_2025);
      expect(result.overtimePay).toBe(2000);
      expect(result.overtimeHours).toBe(20);
      expect(result.grossSalary).toBeGreaterThan(result.baseSalary);
    });

    it("seniority calculated from hireDate and period", () => {
      const emp: PayrollInputEmployee = { ...baseEmployee, hireDate: "2020-01-01" };
      const result = calculateIsraeliPayroll(emp, "2025-01", ISRAELI_TAX_CONFIG_2025);
      expect(result.convalescencePay).toBeGreaterThan(0);
    });

    it("line items include all income and deduction types", () => {
      const emp: PayrollInputEmployee = {
        ...baseEmployee,
        bonus: 500,
        commission: 300,
        travelAllowance: 200,
        allowances: 100,
        overtimePay: 1000,
        overtimeHours: 10,
        seniorityyears: 3,
      };
      const result = calculateIsraeliPayroll(emp, "2025-01", ISRAELI_TAX_CONFIG_2025);
      const types = result.lineItems.map(li => li.lineType);
      expect(types).toContain("base_salary");
      expect(types).toContain("bonus");
      expect(types).toContain("commission");
      expect(types).toContain("travel");
      expect(types).toContain("allowance");
      expect(types).toContain("overtime");
      expect(types).toContain("income_tax");
      expect(types).toContain("bituach_leumi_employee");
      expect(types).toContain("pension_employee");
    });

    it("period stored in result", () => {
      const result = calculateIsraeliPayroll(baseEmployee, "2025-06", ISRAELI_TAX_CONFIG_2025);
      expect(result.period).toBe("2025-06");
    });

    it("custom pension percentages override defaults", () => {
      const emp: PayrollInputEmployee = {
        ...baseEmployee,
        pensionEmployeePct: 7,
        pensionEmployerPct: 7.5,
      };
      const result = calculateIsraeliPayroll(emp, "2025-01", ISRAELI_TAX_CONFIG_2025);
      const pensionBase = Math.min(result.grossSalary, result.baseSalary);
      expect(result.pensionEmployee).toBe(Math.round(pensionBase * 0.07));
      expect(result.pensionEmployer).toBe(Math.round(pensionBase * 0.075));
    });
  });

  describe("overtime calculations (Israeli labor law)", () => {
    it("overtime pay is included in gross salary and taxed", () => {
      const withOvertime: PayrollInputEmployee = {
        id: 2,
        name: "Overtime Employee",
        department: "Production",
        jobTitle: "Worker",
        baseSalary: 8000,
        overtimePay: 2000,
        overtimeHours: 25,
      };
      const without: PayrollInputEmployee = {
        ...withOvertime,
        overtimePay: 0,
        overtimeHours: 0,
      };
      const resultWith = calculateIsraeliPayroll(withOvertime, "2025-01", ISRAELI_TAX_CONFIG_2025);
      const resultWithout = calculateIsraeliPayroll(without, "2025-01", ISRAELI_TAX_CONFIG_2025);
      expect(resultWith.grossSalary).toBeGreaterThan(resultWithout.grossSalary);
      expect(resultWith.incomeTax).toBeGreaterThanOrEqual(resultWithout.incomeTax);
    });
  });
});
