'use strict';

/**
 * @module schemas
 * @description Pre-built validation schemas for the 10 critical entities
 * of the Techno-Kol Uzi ERP 2026. Each schema is consumed by
 * {@link module:request-validator~validateRequest}.
 *
 * Schema contract:
 *  - `required`      — fields that must be present and non-empty.
 *  - `optional`      — fields that may be omitted.
 *  - `allowedFields` — superset of required + optional (auto-computed).
 *  - `fields`        — per-field rules (type, min, max, pattern, enum, custom).
 */

const { createSchema } = require('./request-validator');

/* ================================================================== */
/*  1. Customer                                                        */
/* ================================================================== */

/** @type {import('./request-validator').Schema} */
const customerCreateSchema = createSchema({
  required: ['name', 'email'],
  optional: [
    'contact_person', 'phone', 'mobile', 'fax',
    'address', 'city', 'postal_code', 'country',
    'vat_number', 'payment_terms', 'credit_limit',
    'category', 'notes', 'website',
  ],
  fields: {
    name:           { type: 'string', minLength: 2, maxLength: 200 },
    email:          { type: 'string', pattern: /^[^@\s]+@[^@\s]+\.[^@\s]+$/ },
    contact_person: { type: 'string', maxLength: 100 },
    phone:          { type: 'string', maxLength: 20 },
    mobile:         { type: 'string', maxLength: 20 },
    fax:            { type: 'string', maxLength: 20 },
    address:        { type: 'string', maxLength: 300 },
    city:           { type: 'string', maxLength: 100 },
    postal_code:    { type: 'string', maxLength: 10 },
    country:        { type: 'string', maxLength: 60 },
    vat_number:     { type: 'string', maxLength: 20 },
    payment_terms:  { type: 'integer', min: 0, max: 365 },
    credit_limit:   { type: 'number', min: 0 },
    category:       { type: 'string', enum: ['regular', 'vip', 'strategic', 'government'] },
    notes:          { type: 'string', maxLength: 2000 },
    website:        { type: 'string', maxLength: 300 },
  },
});

/* ================================================================== */
/*  2. Supplier                                                        */
/* ================================================================== */

/** @type {import('./request-validator').Schema} */
const supplierCreateSchema = createSchema({
  required: ['name', 'email'],
  optional: [
    'contact_person', 'phone', 'mobile', 'fax',
    'address', 'city', 'postal_code', 'country',
    'vat_number', 'payment_terms', 'bank_code', 'bank_branch', 'bank_account',
    'category', 'rating', 'notes', 'website',
  ],
  fields: {
    name:           { type: 'string', minLength: 2, maxLength: 200 },
    email:          { type: 'string', pattern: /^[^@\s]+@[^@\s]+\.[^@\s]+$/ },
    contact_person: { type: 'string', maxLength: 100 },
    phone:          { type: 'string', maxLength: 20 },
    mobile:         { type: 'string', maxLength: 20 },
    fax:            { type: 'string', maxLength: 20 },
    address:        { type: 'string', maxLength: 300 },
    city:           { type: 'string', maxLength: 100 },
    postal_code:    { type: 'string', maxLength: 10 },
    country:        { type: 'string', maxLength: 60 },
    vat_number:     { type: 'string', maxLength: 20 },
    payment_terms:  { type: 'integer', min: 0, max: 365 },
    bank_code:      { type: 'string', maxLength: 5 },
    bank_branch:    { type: 'string', maxLength: 10 },
    bank_account:   { type: 'string', maxLength: 20 },
    category:       { type: 'string', enum: ['materials', 'services', 'subcontractor', 'equipment'] },
    rating:         { type: 'integer', min: 1, max: 5 },
    notes:          { type: 'string', maxLength: 2000 },
    website:        { type: 'string', maxLength: 300 },
  },
});

/* ================================================================== */
/*  3. Quote                                                           */
/* ================================================================== */

/** @type {import('./request-validator').Schema} */
const quoteCreateSchema = createSchema({
  required: ['customer_id', 'issue_date', 'valid_until'],
  optional: [
    'project_id', 'subject', 'currency', 'vat_rate', 'discount',
    'subtotal', 'vat_total', 'grand_total',
    'payment_terms', 'notes', 'lines',
  ],
  fields: {
    customer_id:   { type: 'string', minLength: 1 },
    project_id:    { type: 'string' },
    subject:       { type: 'string', maxLength: 300 },
    issue_date:    { type: 'date' },
    valid_until:   { type: 'date' },
    currency:      { type: 'string', enum: ['ILS', 'USD', 'EUR', 'GBP'] },
    vat_rate:      { type: 'number', min: 0, max: 1 },
    discount:      { type: 'number', min: 0 },
    subtotal:      { type: 'number', min: 0 },
    vat_total:     { type: 'number', min: 0 },
    grand_total:   { type: 'number', min: 0 },
    payment_terms: { type: 'integer', min: 0, max: 365 },
    notes:         { type: 'string', maxLength: 2000 },
    lines:         { type: 'array', min: 1 },
  },
});

/* ================================================================== */
/*  4. RFQ (Request for Quotation)                                     */
/* ================================================================== */

/** @type {import('./request-validator').Schema} */
const rfqCreateSchema = createSchema({
  required: ['supplier_id', 'issue_date', 'response_deadline'],
  optional: [
    'project_id', 'subject', 'description', 'currency',
    'priority', 'notes', 'items',
  ],
  fields: {
    supplier_id:       { type: 'string', minLength: 1 },
    project_id:        { type: 'string' },
    subject:           { type: 'string', maxLength: 300 },
    description:       { type: 'string', maxLength: 5000 },
    issue_date:        { type: 'date' },
    response_deadline: { type: 'date' },
    currency:          { type: 'string', enum: ['ILS', 'USD', 'EUR', 'GBP'] },
    priority:          { type: 'string', enum: ['low', 'medium', 'high', 'urgent'] },
    notes:             { type: 'string', maxLength: 2000 },
    items:             { type: 'array', min: 1 },
  },
});

/* ================================================================== */
/*  5. Purchase Order (PO)                                             */
/* ================================================================== */

/** @type {import('./request-validator').Schema} */
const poCreateSchema = createSchema({
  required: ['supplier_id', 'issue_date'],
  optional: [
    'project_id', 'rfq_id', 'subject', 'currency', 'vat_rate',
    'discount', 'subtotal', 'vat_total', 'grand_total',
    'delivery_date', 'delivery_address', 'payment_terms',
    'notes', 'lines',
  ],
  fields: {
    supplier_id:      { type: 'string', minLength: 1 },
    project_id:       { type: 'string' },
    rfq_id:           { type: 'string' },
    subject:          { type: 'string', maxLength: 300 },
    issue_date:       { type: 'date' },
    currency:         { type: 'string', enum: ['ILS', 'USD', 'EUR', 'GBP'] },
    vat_rate:         { type: 'number', min: 0, max: 1 },
    discount:         { type: 'number', min: 0 },
    subtotal:         { type: 'number', min: 0 },
    vat_total:        { type: 'number', min: 0 },
    grand_total:      { type: 'number', min: 0 },
    delivery_date:    { type: 'date' },
    delivery_address: { type: 'string', maxLength: 500 },
    payment_terms:    { type: 'integer', min: 0, max: 365 },
    notes:            { type: 'string', maxLength: 2000 },
    lines:            { type: 'array', min: 1 },
  },
});

/* ================================================================== */
/*  6. Invoice                                                         */
/* ================================================================== */

/** @type {import('./request-validator').Schema} */
const invoiceCreateSchema = createSchema({
  required: ['customer_id', 'issue_date', 'due_date', 'grand_total'],
  optional: [
    'project_id', 'po_id', 'invoice_number', 'subject',
    'currency', 'vat_rate', 'subtotal', 'vat_total', 'discount',
    'paid_total', 'balance', 'payment_terms', 'notes', 'lines',
  ],
  fields: {
    customer_id:    { type: 'string', minLength: 1 },
    project_id:     { type: 'string' },
    po_id:          { type: 'string' },
    invoice_number: { type: 'string', maxLength: 50 },
    subject:        { type: 'string', maxLength: 300 },
    issue_date:     { type: 'date' },
    due_date:       { type: 'date' },
    currency:       { type: 'string', enum: ['ILS', 'USD', 'EUR', 'GBP'] },
    vat_rate:       { type: 'number', min: 0, max: 1 },
    subtotal:       { type: 'number', min: 0 },
    vat_total:      { type: 'number', min: 0 },
    grand_total:    { type: 'number', min: 0 },
    discount:       { type: 'number', min: 0 },
    paid_total:     { type: 'number', min: 0 },
    balance:        { type: 'number', min: 0 },
    payment_terms:  { type: 'integer', min: 0, max: 365 },
    notes:          { type: 'string', maxLength: 2000 },
    lines:          { type: 'array', min: 1 },
  },
});

/* ================================================================== */
/*  7. Payment                                                         */
/* ================================================================== */

/** @type {import('./request-validator').Schema} */
const paymentCreateSchema = createSchema({
  required: ['invoice_id', 'amount', 'payment_date', 'payment_method'],
  optional: [
    'customer_id', 'supplier_id', 'reference_number',
    'currency', 'bank_code', 'bank_branch', 'bank_account',
    'check_number', 'check_date', 'notes',
  ],
  fields: {
    invoice_id:       { type: 'string', minLength: 1 },
    customer_id:      { type: 'string' },
    supplier_id:      { type: 'string' },
    amount:           { type: 'number', min: 0.01 },
    payment_date:     { type: 'date' },
    payment_method:   { type: 'string', enum: ['bank_transfer', 'check', 'credit_card', 'cash', 'paypal', 'bit'] },
    reference_number: { type: 'string', maxLength: 50 },
    currency:         { type: 'string', enum: ['ILS', 'USD', 'EUR', 'GBP'] },
    bank_code:        { type: 'string', maxLength: 5 },
    bank_branch:      { type: 'string', maxLength: 10 },
    bank_account:     { type: 'string', maxLength: 20 },
    check_number:     { type: 'string', maxLength: 20 },
    check_date:       { type: 'date' },
    notes:            { type: 'string', maxLength: 2000 },
  },
});

/* ================================================================== */
/*  8. Employee                                                        */
/* ================================================================== */

/** @type {import('./request-validator').Schema} */
const employeeCreateSchema = createSchema({
  required: ['first_name', 'last_name', 'israeli_id', 'email', 'start_date'],
  optional: [
    'phone', 'mobile', 'address', 'city', 'postal_code',
    'department', 'position', 'manager_id',
    'bank_code', 'bank_branch', 'bank_account',
    'salary_type', 'base_salary', 'hourly_rate',
    'employment_type', 'tax_bracket', 'notes',
  ],
  fields: {
    first_name:      { type: 'string', minLength: 2, maxLength: 50 },
    last_name:       { type: 'string', minLength: 2, maxLength: 50 },
    israeli_id:      { type: 'string', minLength: 1, maxLength: 9 },
    email:           { type: 'string', pattern: /^[^@\s]+@[^@\s]+\.[^@\s]+$/ },
    start_date:      { type: 'date' },
    phone:           { type: 'string', maxLength: 20 },
    mobile:          { type: 'string', maxLength: 20 },
    address:         { type: 'string', maxLength: 300 },
    city:            { type: 'string', maxLength: 100 },
    postal_code:     { type: 'string', maxLength: 10 },
    department:      { type: 'string', maxLength: 100 },
    position:        { type: 'string', maxLength: 100 },
    manager_id:      { type: 'string' },
    bank_code:       { type: 'string', maxLength: 5 },
    bank_branch:     { type: 'string', maxLength: 10 },
    bank_account:    { type: 'string', maxLength: 20 },
    salary_type:     { type: 'string', enum: ['monthly', 'hourly', 'daily'] },
    base_salary:     { type: 'number', min: 0 },
    hourly_rate:     { type: 'number', min: 0 },
    employment_type: { type: 'string', enum: ['full_time', 'part_time', 'contractor', 'temporary'] },
    tax_bracket:     { type: 'number', min: 0, max: 100 },
    notes:           { type: 'string', maxLength: 2000 },
  },
});

/* ================================================================== */
/*  9. Attendance                                                      */
/* ================================================================== */

/** @type {import('./request-validator').Schema} */
const attendanceCreateSchema = createSchema({
  required: ['employee_id', 'date'],
  optional: [
    'clock_in', 'clock_out', 'regular_hours', 'overtime_hours',
    'total_hours', 'status', 'type', 'notes',
  ],
  fields: {
    employee_id:    { type: 'string', minLength: 1 },
    date:           { type: 'date' },
    clock_in:       { type: 'string', pattern: /^\d{2}:\d{2}(:\d{2})?$/ },
    clock_out:      { type: 'string', pattern: /^\d{2}:\d{2}(:\d{2})?$/ },
    regular_hours:  { type: 'number', min: 0, max: 24 },
    overtime_hours: { type: 'number', min: 0, max: 24 },
    total_hours:    { type: 'number', min: 0, max: 24 },
    status:         { type: 'string', enum: ['pending', 'approved', 'rejected'] },
    type:           { type: 'string', enum: ['regular', 'sick', 'vacation', 'holiday', 'military', 'unpaid'] },
    notes:          { type: 'string', maxLength: 500 },
  },
});

/* ================================================================== */
/*  10. Task                                                           */
/* ================================================================== */

/** @type {import('./request-validator').Schema} */
const taskCreateSchema = createSchema({
  required: ['title'],
  optional: [
    'description', 'project_id', 'workorder_id', 'assigned_to',
    'priority', 'due_date', 'estimated_hours',
    'category', 'tags', 'notes',
  ],
  fields: {
    title:           { type: 'string', minLength: 2, maxLength: 200 },
    description:     { type: 'string', maxLength: 5000 },
    project_id:      { type: 'string' },
    workorder_id:    { type: 'string' },
    assigned_to:     { type: 'string' },
    priority:        { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
    due_date:        { type: 'date' },
    estimated_hours: { type: 'number', min: 0, max: 10000 },
    category:        { type: 'string', enum: ['development', 'design', 'testing', 'documentation', 'maintenance', 'support', 'other'] },
    tags:            { type: 'array' },
    notes:           { type: 'string', maxLength: 2000 },
  },
});

/* ================================================================== */
/*  Exports                                                            */
/* ================================================================== */

module.exports = {
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
