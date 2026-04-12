/**
 * Test fixture factory — timesheets
 *
 * Consumed by wage-slip-calculator.js → computeWageSlip({ timesheet, ... }).
 * Fields read by the calculator:
 *   hours_regular, hours_overtime_125, hours_overtime_150,
 *   hours_overtime_175, hours_overtime_200,
 *   hours_absence, hours_vacation, hours_sick, hours_reserve,
 *   holiday_pay, bonuses, commissions,
 *   allowances_meal, allowances_travel, allowances_clothing, allowances_phone,
 *   other_earnings, loans, garnishments, other_deductions.
 *
 * Supports presets via { preset: 'monthly' | 'hourly' | 'with_overtime' | 'with_absence' }.
 */

'use strict';

const { money } = require('./suppliers');

/** Baseline empty timesheet — all numeric, all zero. */
function empty() {
  return {
    hours_regular: 0,
    hours_overtime_125: 0,
    hours_overtime_150: 0,
    hours_overtime_175: 0,
    hours_overtime_200: 0,
    hours_absence: 0,
    hours_vacation: 0,
    hours_sick: 0,
    hours_reserve: 0,
    holiday_pay: 0,
    bonuses: 0,
    commissions: 0,
    allowances_meal: 0,
    allowances_travel: 0,
    allowances_clothing: 0,
    allowances_phone: 0,
    other_earnings: 0,
    loans: 0,
    garnishments: 0,
    other_deductions: 0,
  };
}

const PRESETS = {
  // Full month, no overtime, no absences — a monthly-salaried employee
  // whose gross is just their base salary + standard allowances.
  monthly: () => ({
    ...empty(),
    hours_regular: 182,
    allowances_meal: money(400),
    allowances_travel: money(300),
  }),

  // Hourly worker who logged 160 regular hours.
  hourly: () => ({
    ...empty(),
    hours_regular: 160,
  }),

  // Monthly employee who also logged overtime at 125% and 150%.
  with_overtime: () => ({
    ...empty(),
    hours_regular: 182,
    hours_overtime_125: 8,
    hours_overtime_150: 4,
    hours_overtime_175: 0,
    hours_overtime_200: 0,
    allowances_meal: money(400),
    allowances_travel: money(300),
  }),

  // Employee who missed 16h unpaid + took 8h sick
  with_absence: () => ({
    ...empty(),
    hours_regular: 182,
    hours_absence: 16,
    hours_sick: 8,
    hours_vacation: 0,
    allowances_meal: money(400),
  }),
};

/**
 * Produce a plausible timesheet object.
 * @param {object} overrides — may include a `preset` key
 */
function makeTimesheet(overrides = {}) {
  const { preset, ...rest } = overrides;
  const base = preset && PRESETS[preset]
    ? PRESETS[preset]()
    : PRESETS.monthly();
  return { ...base, ...rest };
}

module.exports = { makeTimesheet };
