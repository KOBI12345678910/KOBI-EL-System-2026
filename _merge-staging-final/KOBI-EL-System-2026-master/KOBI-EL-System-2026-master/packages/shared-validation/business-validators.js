'use strict';

/**
 * @module business-validators
 * @description Cross-field business rule validators for the Techno-Kol
 * Uzi ERP 2026. Each function returns
 * `{ valid: boolean, errors?: string[] }`.
 */

/* ================================================================== */
/*  Quote totals                                                       */
/* ================================================================== */

/**
 * Validates that a quote's totals match its line items.
 *
 * Checks:
 *  - `subtotal === sum of line totals`
 *  - `vat_total === subtotal * vat_rate` (within 0.01 tolerance)
 *  - `grand_total === subtotal + vat_total - discount`
 *
 * @param {{ subtotal?: number, vat_total?: number, vat_rate?: number, grand_total?: number, discount?: number }} quote
 * @param {{ quantity: number, unit_price: number, total?: number }[]} lines
 * @returns {{ valid: boolean, errors?: string[] }}
 */
function validateQuoteTotals(quote, lines) {
  const errors = [];
  const TOLERANCE = 0.01;

  if (!quote) {
    return { valid: false, errors: ['Quote object is required'] };
  }
  if (!Array.isArray(lines) || lines.length === 0) {
    return { valid: false, errors: ['Quote must have at least one line item'] };
  }

  // Compute expected subtotal from lines
  let expectedSubtotal = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const qty = Number(line.quantity) || 0;
    const price = Number(line.unit_price) || 0;
    const lineTotal = qty * price;

    if (line.total !== undefined && Math.abs(Number(line.total) - lineTotal) > TOLERANCE) {
      errors.push(`Line ${i + 1}: total (${line.total}) does not match quantity * unit_price (${lineTotal})`);
    }

    expectedSubtotal += lineTotal;
  }

  // Subtotal check
  const subtotal = Number(quote.subtotal) || 0;
  if (Math.abs(subtotal - expectedSubtotal) > TOLERANCE) {
    errors.push(`Subtotal (${subtotal}) does not match sum of line totals (${expectedSubtotal.toFixed(2)})`);
  }

  // VAT check
  const vatRate = Number(quote.vat_rate) || 0;
  const expectedVat = expectedSubtotal * vatRate;
  const vatTotal = Number(quote.vat_total) || 0;
  if (Math.abs(vatTotal - expectedVat) > TOLERANCE) {
    errors.push(`VAT total (${vatTotal}) does not match subtotal * vat_rate (${expectedVat.toFixed(2)})`);
  }

  // Grand total check
  const discount = Number(quote.discount) || 0;
  const expectedGrand = expectedSubtotal + expectedVat - discount;
  const grandTotal = Number(quote.grand_total) || 0;
  if (Math.abs(grandTotal - expectedGrand) > TOLERANCE) {
    errors.push(`Grand total (${grandTotal}) does not match subtotal + VAT - discount (${expectedGrand.toFixed(2)})`);
  }

  return errors.length ? { valid: false, errors } : { valid: true };
}

/* ================================================================== */
/*  PO budget threshold                                                */
/* ================================================================== */

/**
 * Validates that a Purchase Order does not exceed the project budget
 * threshold without approval.
 *
 * @param {{ amount: number, approved?: boolean }} po
 * @param {number} projectBudget        - Total project budget.
 * @param {number} [threshold=0.9]      - Fraction (0-1) above which approval is required.
 * @returns {{ valid: boolean, errors?: string[] }}
 */
function validatePOBudget(po, projectBudget, threshold = 0.9) {
  const errors = [];

  if (!po) {
    return { valid: false, errors: ['PO object is required'] };
  }

  const amount = Number(po.amount) || 0;
  const budget = Number(projectBudget) || 0;

  if (amount <= 0) {
    errors.push('PO amount must be positive');
  }

  if (budget <= 0) {
    errors.push('Project budget must be positive');
  }

  if (amount > 0 && budget > 0) {
    const ratio = amount / budget;
    if (ratio > threshold && !po.approved) {
      errors.push(
        `PO amount (${amount}) exceeds ${(threshold * 100).toFixed(0)}% ` +
        `of project budget (${budget}). Manager approval is required.`
      );
    }

    if (amount > budget) {
      errors.push(`PO amount (${amount}) exceeds project budget (${budget})`);
    }
  }

  return errors.length ? { valid: false, errors } : { valid: true };
}

/* ================================================================== */
/*  Invoice balance                                                    */
/* ================================================================== */

/**
 * Validates that an invoice's balance equals grand_total minus paid_total.
 *
 * @param {{ grand_total: number, paid_total?: number, balance?: number }} invoice
 * @returns {{ valid: boolean, errors?: string[] }}
 */
function validateInvoiceBalance(invoice) {
  const errors = [];
  const TOLERANCE = 0.01;

  if (!invoice) {
    return { valid: false, errors: ['Invoice object is required'] };
  }

  const grandTotal = Number(invoice.grand_total) || 0;
  const paidTotal = Number(invoice.paid_total) || 0;
  const expectedBalance = grandTotal - paidTotal;

  if (grandTotal <= 0) {
    errors.push('Invoice grand_total must be positive');
  }

  if (paidTotal < 0) {
    errors.push('Invoice paid_total cannot be negative');
  }

  if (paidTotal > grandTotal + TOLERANCE) {
    errors.push(`Overpayment detected: paid_total (${paidTotal}) exceeds grand_total (${grandTotal})`);
  }

  if (invoice.balance !== undefined) {
    const balance = Number(invoice.balance) || 0;
    if (Math.abs(balance - expectedBalance) > TOLERANCE) {
      errors.push(`Balance (${balance}) does not match grand_total - paid_total (${expectedBalance.toFixed(2)})`);
    }
  }

  return errors.length ? { valid: false, errors } : { valid: true };
}

/* ================================================================== */
/*  Attendance hours                                                   */
/* ================================================================== */

/**
 * Validates attendance record hours are in a sensible range (0-24).
 *
 * @param {{ regular_hours?: number, overtime_hours?: number, total_hours?: number, date?: string }} attendance
 * @returns {{ valid: boolean, errors?: string[] }}
 */
function validateAttendanceHours(attendance) {
  const errors = [];
  const TOLERANCE = 0.01;

  if (!attendance) {
    return { valid: false, errors: ['Attendance object is required'] };
  }

  const regular = Number(attendance.regular_hours) || 0;
  const overtime = Number(attendance.overtime_hours) || 0;
  const total = Number(attendance.total_hours);

  if (regular < 0) {
    errors.push('Regular hours cannot be negative');
  }

  if (overtime < 0) {
    errors.push('Overtime hours cannot be negative');
  }

  if (regular + overtime > 24) {
    errors.push(`Total hours (${regular + overtime}) exceed 24 hours in a day`);
  }

  if (!isNaN(total)) {
    const expectedTotal = regular + overtime;
    if (Math.abs(total - expectedTotal) > TOLERANCE) {
      errors.push(`Total hours (${total}) does not match regular + overtime (${expectedTotal})`);
    }
  }

  // Date validation (if present)
  if (attendance.date) {
    const d = new Date(attendance.date);
    if (isNaN(d.getTime())) {
      errors.push('Attendance date is not a valid date');
    } else if (d > new Date()) {
      errors.push('Attendance date cannot be in the future');
    }
  }

  return errors.length ? { valid: false, errors } : { valid: true };
}

/* ================================================================== */
/*  Payroll entry                                                      */
/* ================================================================== */

/**
 * Validates a payroll entry: gross must be >= net, deductions must add up.
 *
 * @param {{ gross: number, net: number, deductions?: number, tax?: number, social_security?: number, pension?: number }} entry
 * @returns {{ valid: boolean, errors?: string[] }}
 */
function validatePayrollEntry(entry) {
  const errors = [];
  const TOLERANCE = 0.01;

  if (!entry) {
    return { valid: false, errors: ['Payroll entry is required'] };
  }

  const gross = Number(entry.gross) || 0;
  const net = Number(entry.net) || 0;

  if (gross <= 0) {
    errors.push('Gross salary must be positive');
  }

  if (net <= 0) {
    errors.push('Net salary must be positive');
  }

  if (gross < net - TOLERANCE) {
    errors.push(`Gross (${gross}) cannot be less than net (${net})`);
  }

  // Check that deductions add up
  const tax = Number(entry.tax) || 0;
  const socialSecurity = Number(entry.social_security) || 0;
  const pension = Number(entry.pension) || 0;
  const computedDeductions = tax + socialSecurity + pension;

  if (entry.deductions !== undefined) {
    const deductions = Number(entry.deductions) || 0;
    if (Math.abs(deductions - computedDeductions) > TOLERANCE) {
      errors.push(
        `Deductions total (${deductions}) does not match ` +
        `tax + social_security + pension (${computedDeductions.toFixed(2)})`
      );
    }
  }

  // Gross - deductions should equal net
  const expectedNet = gross - computedDeductions;
  if (Math.abs(net - expectedNet) > TOLERANCE && computedDeductions > 0) {
    errors.push(
      `Net (${net}) does not match gross - deductions (${expectedNet.toFixed(2)})`
    );
  }

  return errors.length ? { valid: false, errors } : { valid: true };
}

/* ================================================================== */
/*  Due date after issue date                                          */
/* ================================================================== */

/**
 * Validates that a due date comes after the issue date.
 *
 * @param {string|Date} issueDate
 * @param {string|Date} dueDate
 * @returns {{ valid: boolean, errors?: string[] }}
 */
function validateDueDateAfterIssue(issueDate, dueDate) {
  const errors = [];

  if (!issueDate) {
    errors.push('Issue date is required');
  }
  if (!dueDate) {
    errors.push('Due date is required');
  }

  if (issueDate && dueDate) {
    const issue = new Date(issueDate);
    const due = new Date(dueDate);

    if (isNaN(issue.getTime())) {
      errors.push('Issue date is not a valid date');
    }
    if (isNaN(due.getTime())) {
      errors.push('Due date is not a valid date');
    }

    if (!isNaN(issue.getTime()) && !isNaN(due.getTime())) {
      if (due < issue) {
        errors.push(`Due date (${due.toISOString().slice(0, 10)}) must be on or after issue date (${issue.toISOString().slice(0, 10)})`);
      }
    }
  }

  return errors.length ? { valid: false, errors } : { valid: true };
}

/* ================================================================== */
/*  Exports                                                            */
/* ================================================================== */

module.exports = {
  validateQuoteTotals,
  validatePOBudget,
  validateInvoiceBalance,
  validateAttendanceHours,
  validatePayrollEntry,
  validateDueDateAfterIssue,
};
