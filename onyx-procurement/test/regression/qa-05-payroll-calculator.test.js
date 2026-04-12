/**
 * QA-05 — Regression Agent
 * Area: Payroll wage-slip calculator (legacy Wave 1.5 / B-08)
 *
 * Purpose:
 *   Lock in known-good numeric outputs from the 2026 Israeli payroll engine
 *   so that future changes to brackets, rates, or rounding cannot silently
 *   alter approved wage slips.
 *
 *   This file complements test/wage-slip-calculator.test.js, which validates
 *   invariants ("deductions sum", "net = gross - deductions"). The regression
 *   tests below pin EXACT snapshot values that QA-05 baselined on the current
 *   tip of master as of 2026-04-11. If any of these break, the change must be
 *   reviewed against _qa-reports/QA-05-baseline.json.
 *
 * Run:
 *   node --test test/regression/qa-05-payroll-calculator.test.js
 *
 * Do NOT auto-update the expected values. If a change is intentional, update
 * both this file AND _qa-reports/QA-05-baseline.json in the same commit, and
 * add a note to _qa-reports/QA-05-regression.md.
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const {
  CONSTANTS_2026,
  computeIncomeTaxAnnual,
  computeIncomeTaxMonthly,
  computeBituachLeumiAndHealth,
  computePensionContributions,
  computeStudyFund,
} = require(path.resolve(__dirname, '..', '..', 'src', 'payroll', 'wage-slip-calculator.js'));

// ─── Helpers ────────────────────────────────────────────────────────────

/** Tiny ±epsilon assertion — payroll rounds to 2 decimals but floats drift. */
function near(actual, expected, eps = 0.05) {
  assert.ok(
    Math.abs(actual - expected) <= eps,
    `expected ${expected} ± ${eps}, got ${actual} (delta ${actual - expected})`,
  );
}

// ─── 1. TAX BRACKETS — constants have not drifted ──────────────────────

test('QA-05 payroll.constants: 2026 brackets count is frozen at 7', () => {
  assert.equal(CONSTANTS_2026.INCOME_TAX_BRACKETS.length, 7);
});

test('QA-05 payroll.constants: first bracket 10% up to 84,120', () => {
  const b = CONSTANTS_2026.INCOME_TAX_BRACKETS[0];
  assert.equal(b.rate, 0.10);
  assert.equal(b.upTo, 84120);
});

test('QA-05 payroll.constants: top bracket is 50% (includes יסף)', () => {
  const b = CONSTANTS_2026.INCOME_TAX_BRACKETS[CONSTANTS_2026.INCOME_TAX_BRACKETS.length - 1];
  assert.equal(b.rate, 0.50);
  assert.equal(b.upTo, Infinity);
});

test('QA-05 payroll.constants: tax credit point monthly = ₪248', () => {
  assert.equal(CONSTANTS_2026.TAX_CREDIT_POINT_MONTHLY, 248);
  assert.equal(CONSTANTS_2026.TAX_CREDIT_POINT_ANNUAL, 2976);
});

// ─── 2. INCOME TAX — snapshot on known monthly incomes ─────────────────

test('QA-05 payroll.incomeTax: ₪10,000/mo × 2.25 credits → baseline ₪561.60', () => {
  near(computeIncomeTaxMonthly(10000, 2.25), 561.60);
});

test('QA-05 payroll.incomeTax: ₪20,000/mo × 2.25 credits → baseline ₪2,981.50', () => {
  near(computeIncomeTaxMonthly(20000, 2.25), 2981.50);
});

test('QA-05 payroll.incomeTax: ₪50,000/mo × 2.25 credits → baseline ₪13,781.10', () => {
  near(computeIncomeTaxMonthly(50000, 2.25), 13781.10, 0.1);
});

test('QA-05 payroll.incomeTax: annual ₪0 → ₪0 (floored)', () => {
  assert.equal(computeIncomeTaxAnnual(0, 2.25), 0);
});

test('QA-05 payroll.incomeTax: annual ₪100,000 × 2.25 credits → baseline ₪3,939.20', () => {
  near(computeIncomeTaxAnnual(100000, 2.25), 3939.20, 0.1);
});

test('QA-05 payroll.incomeTax: annual ₪500,000 × 2.25 credits → baseline ₪125,606.80', () => {
  near(computeIncomeTaxAnnual(500000, 2.25), 125606.80, 0.5);
});

test('QA-05 payroll.incomeTax: credit floor never goes negative', () => {
  // ₪5,000/mo × 20 credits should be well under credit value
  assert.ok(computeIncomeTaxMonthly(5000, 20) >= 0);
});

// ─── 3. BITUACH LEUMI + HEALTH — two-tier threshold + cap ──────────────

test('QA-05 payroll.blht: ₪10,000/mo → baseline employee/employer split', () => {
  const r = computeBituachLeumiAndHealth(10000);
  near(r.bituach_leumi_employee, 203.55);
  near(r.bituach_leumi_employer, 455.36);
  near(r.health_tax_employee, 357.08);
  assert.equal(r.health_tax_employer, 0, 'health employer must stay at 0 (bundled into BL)');
});

test('QA-05 payroll.blht: ₪5,000/mo (under ₪7,522 threshold) uses low rates only', () => {
  const r = computeBituachLeumiAndHealth(5000);
  near(r.bituach_leumi_employee, 20.00);    // 5000 × 0.004
  near(r.bituach_leumi_employer, 177.50);   // 5000 × 0.0355
  near(r.health_tax_employee, 155.00);      // 5000 × 0.031
});

test('QA-05 payroll.blht: ₪60,000/mo caps at max base ₪49,030 → baseline', () => {
  const r = computeBituachLeumiAndHealth(60000);
  near(r.bituach_leumi_employee, 2935.65);
  near(r.bituach_leumi_employer, 3421.64);
  near(r.health_tax_employee, 2308.58);
});

test('QA-05 payroll.blht: negative input → all zeros (defensive)', () => {
  const r = computeBituachLeumiAndHealth(-1000);
  assert.equal(r.bituach_leumi_employee, 0);
  assert.equal(r.bituach_leumi_employer, 0);
  assert.equal(r.health_tax_employee, 0);
});

// ─── 4. PENSION + SEVERANCE ────────────────────────────────────────────

test('QA-05 payroll.pension: ₪10,000/mo → 6% / 6.5% / 8.33%', () => {
  const r = computePensionContributions(10000);
  near(r.pension_employee, 600);
  near(r.pension_employer, 650);
  near(r.severance_employer, 833);
});

test('QA-05 payroll.pension: ₪30,000/mo caps at pensionable ₪28,750', () => {
  const r = computePensionContributions(30000);
  near(r.pension_employee, 1725);    // 28750 × 0.06
  near(r.pension_employer, 1868.75); // 28750 × 0.065
  near(r.severance_employer, 2394.88, 0.1);
});

// ─── 5. STUDY FUND — eligibility gating ────────────────────────────────

test('QA-05 payroll.studyFund: eligible ₪10,000 → 2.5% / 7.5%', () => {
  const r = computeStudyFund(10000, true);
  near(r.study_fund_employee, 250);
  near(r.study_fund_employer, 750);
});

test('QA-05 payroll.studyFund: ineligible → zeros even if taxable', () => {
  const r = computeStudyFund(10000, false);
  assert.equal(r.study_fund_employee, 0);
  assert.equal(r.study_fund_employer, 0);
});

test('QA-05 payroll.studyFund: ₪20,000 caps at ₪15,712', () => {
  const r = computeStudyFund(20000, true);
  near(r.study_fund_employee, 15712 * 0.025);
  near(r.study_fund_employer, 15712 * 0.075);
});
