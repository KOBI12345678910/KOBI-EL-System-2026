'use strict';

/**
 * @module shared-validation
 * @description Barrel export for the Techno-Kol Uzi ERP 2026
 * shared-validation package.
 *
 * Re-exports:
 *  - Field-level validators (Israeli ID, VAT, phone, IBAN, etc.).
 *  - Business-rule validators (quote totals, PO budget, invoice balance, etc.).
 *  - Express request validation middleware and schema builder.
 *  - Pre-built validation schemas for all 10 critical entities.
 */

const {
  validateIsraeliId,
  validateVatNumber,
  validateIsraeliPhone,
  validateIBAN,
  validateBankAccount,
  validatePostalCode,
  validateEmail,
  required,
  positiveNumber,
  validDate,
  inEnum,
  ISRAELI_BANKS,
} = require('./field-validators');

const {
  validateQuoteTotals,
  validatePOBudget,
  validateInvoiceBalance,
  validateAttendanceHours,
  validatePayrollEntry,
  validateDueDateAfterIssue,
} = require('./business-validators');

const {
  validateRequest,
  createSchema,
  validateField,
} = require('./request-validator');

const {
  customerCreateSchema,
  supplierCreateSchema,
  quoteCreateSchema,
  rfqCreateSchema,
  poCreateSchema,
  invoiceCreateSchema,
  paymentCreateSchema,
  employeeCreateSchema,
  attendanceCreateSchema,
  taskCreateSchema,
} = require('./schemas');

module.exports = {
  // Field validators
  validateIsraeliId,
  validateVatNumber,
  validateIsraeliPhone,
  validateIBAN,
  validateBankAccount,
  validatePostalCode,
  validateEmail,
  required,
  positiveNumber,
  validDate,
  inEnum,
  ISRAELI_BANKS,

  // Business validators
  validateQuoteTotals,
  validatePOBudget,
  validateInvoiceBalance,
  validateAttendanceHours,
  validatePayrollEntry,
  validateDueDateAfterIssue,

  // Request validation middleware
  validateRequest,
  createSchema,
  validateField,

  // Pre-built schemas
  customerCreateSchema,
  supplierCreateSchema,
  quoteCreateSchema,
  rfqCreateSchema,
  poCreateSchema,
  invoiceCreateSchema,
  paymentCreateSchema,
  employeeCreateSchema,
  attendanceCreateSchema,
  taskCreateSchema,
};
