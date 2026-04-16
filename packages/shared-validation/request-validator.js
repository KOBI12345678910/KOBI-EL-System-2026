'use strict';

/**
 * @module request-validator
 * @description Express middleware for request body validation.
 * Validates required fields, type checks, min/max, patterns, and enums.
 * Produces `req.validatedBody` with only allowlisted fields.
 *
 * @example
 *   const { validateRequest, createSchema } = require('shared-validation/request-validator');
 *
 *   const schema = createSchema({
 *     required: ['name', 'email'],
 *     optional: ['phone', 'notes'],
 *     fields: {
 *       name:  { type: 'string', minLength: 2, maxLength: 100 },
 *       email: { type: 'string', pattern: /^[^@]+@[^@]+\.[^@]+$/ },
 *       phone: { type: 'string', maxLength: 20 },
 *       notes: { type: 'string', maxLength: 2000 },
 *     },
 *   });
 *
 *   app.post('/api/customers', validateRequest(schema), handler);
 */

/* ================================================================== */
/*  Type checkers                                                      */
/* ================================================================== */

/** @private */
const TYPE_CHECKERS = {
  /**
   * @param {*} v
   * @returns {boolean}
   */
  string: (v) => typeof v === 'string',

  /**
   * @param {*} v
   * @returns {boolean}
   */
  number: (v) => typeof v === 'number' && !isNaN(v),

  /**
   * @param {*} v
   * @returns {boolean}
   */
  boolean: (v) => typeof v === 'boolean',

  /**
   * @param {*} v
   * @returns {boolean}
   */
  integer: (v) => Number.isInteger(v),

  /**
   * @param {*} v
   * @returns {boolean}
   */
  array: (v) => Array.isArray(v),

  /**
   * @param {*} v
   * @returns {boolean}
   */
  object: (v) => v !== null && typeof v === 'object' && !Array.isArray(v),

  /**
   * @param {*} v
   * @returns {boolean}
   */
  date: (v) => {
    if (v instanceof Date) return !isNaN(v.getTime());
    if (typeof v === 'string') return !isNaN(new Date(v).getTime());
    return false;
  },
};

/* ================================================================== */
/*  validateField — single field against its rules                     */
/* ================================================================== */

/**
 * Validates a single field value against a rule set.
 *
 * @param {string} field  - Field name (for error messages).
 * @param {*}      value  - The value to validate.
 * @param {Object} rules  - Validation rules.
 * @param {string}           [rules.type]       - Expected type (string, number, boolean, integer, array, object, date).
 * @param {number}           [rules.min]        - Min value (numbers) or min length (strings/arrays).
 * @param {number}           [rules.max]        - Max value (numbers) or max length (strings/arrays).
 * @param {number}           [rules.minLength]  - Min string length.
 * @param {number}           [rules.maxLength]  - Max string length.
 * @param {RegExp|string}    [rules.pattern]    - Regex the value must match (strings only).
 * @param {Array}            [rules.enum]       - Allowed values.
 * @param {Function}         [rules.custom]     - Custom validator `(value) => string|null` (null = ok).
 * @returns {{ field: string, message: string }[]}
 * @private
 */
function validateField(field, value, rules) {
  const errors = [];

  // Type check
  if (rules.type) {
    const checker = TYPE_CHECKERS[rules.type];
    if (checker && !checker(value)) {
      errors.push({ field, message: `${field} must be of type ${rules.type}` });
      return errors; // no point checking further
    }
  }

  // Min / max for numbers
  if (typeof value === 'number') {
    if (rules.min !== undefined && value < rules.min) {
      errors.push({ field, message: `${field} must be at least ${rules.min}` });
    }
    if (rules.max !== undefined && value > rules.max) {
      errors.push({ field, message: `${field} must be at most ${rules.max}` });
    }
  }

  // Length checks for strings
  if (typeof value === 'string') {
    const len = value.length;
    const minLen = rules.minLength !== undefined ? rules.minLength : rules.min;
    const maxLen = rules.maxLength !== undefined ? rules.maxLength : rules.max;

    if (minLen !== undefined && len < minLen) {
      errors.push({ field, message: `${field} must be at least ${minLen} characters` });
    }
    if (maxLen !== undefined && len > maxLen) {
      errors.push({ field, message: `${field} must be at most ${maxLen} characters` });
    }
  }

  // Length checks for arrays
  if (Array.isArray(value)) {
    if (rules.min !== undefined && value.length < rules.min) {
      errors.push({ field, message: `${field} must have at least ${rules.min} items` });
    }
    if (rules.max !== undefined && value.length > rules.max) {
      errors.push({ field, message: `${field} must have at most ${rules.max} items` });
    }
  }

  // Pattern (strings)
  if (rules.pattern && typeof value === 'string') {
    const regex = rules.pattern instanceof RegExp ? rules.pattern : new RegExp(rules.pattern);
    if (!regex.test(value)) {
      errors.push({ field, message: `${field} does not match the required pattern` });
    }
  }

  // Enum
  if (rules.enum && Array.isArray(rules.enum)) {
    if (!rules.enum.includes(value)) {
      errors.push({ field, message: `${field} must be one of: ${rules.enum.join(', ')}` });
    }
  }

  // Custom validator
  if (typeof rules.custom === 'function') {
    const result = rules.custom(value);
    if (result) {
      errors.push({ field, message: typeof result === 'string' ? result : `${field} failed custom validation` });
    }
  }

  return errors;
}

/* ================================================================== */
/*  validateRequest — Express middleware                                */
/* ================================================================== */

/**
 * Express middleware that validates `req.body` against a schema.
 *
 * On failure responds with `422 Unprocessable Entity`:
 * ```json
 * {
 *   "success": false,
 *   "error": {
 *     "code": "VALIDATION_ERROR",
 *     "field_errors": [{ "field": "name", "message": "name is required" }]
 *   }
 * }
 * ```
 *
 * On success:
 *  - `req.validatedBody` contains only allowlisted fields.
 *  - Calls `next()`.
 *
 * @param {Object} schema
 * @param {string[]}                    [schema.required]      - Fields that must be present and non-empty.
 * @param {string[]}                    [schema.optional]      - Optional fields (informational).
 * @param {string[]}                    [schema.allowedFields] - Allowlist — only these keys survive into `req.validatedBody`.
 * @param {Record<string, Object>}      [schema.fields]        - Per-field validation rules (see {@link validateField}).
 * @returns {import('express').RequestHandler}
 */
function validateRequest(schema) {
  return (req, res, next) => {
    const errors = [];
    const body = req.body || {};

    // ----- Required fields -----
    if (Array.isArray(schema.required)) {
      for (const field of schema.required) {
        const val = body[field];
        if (val === undefined || val === null || val === '') {
          errors.push({ field, message: `${field} is required` });
        }
      }
    }

    // ----- Per-field rules -----
    if (schema.fields && typeof schema.fields === 'object') {
      for (const [field, rules] of Object.entries(schema.fields)) {
        if (body[field] !== undefined && body[field] !== null && body[field] !== '') {
          const fieldErrors = validateField(field, body[field], rules);
          errors.push(...fieldErrors);
        }
      }
    }

    // ----- Return errors -----
    if (errors.length) {
      return res.status(422).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          field_errors: errors,
        },
      });
    }

    // ----- Allowlist -----
    if (schema.allowedFields && Array.isArray(schema.allowedFields)) {
      req.validatedBody = {};
      for (const f of schema.allowedFields) {
        if (f in body) {
          req.validatedBody[f] = body[f];
        }
      }
    } else {
      // If no allowlist, copy everything but strip __proto__ etc.
      req.validatedBody = Object.assign({}, body);
    }

    next();
  };
}

/* ================================================================== */
/*  createSchema — builder helper                                      */
/* ================================================================== */

/**
 * Helper to build a validation schema with sensible defaults.
 *
 * @param {Object}   opts
 * @param {string[]} [opts.required]       - Required field names.
 * @param {string[]} [opts.optional]       - Optional field names.
 * @param {Record<string, Object>} [opts.fields] - Per-field rules.
 * @param {string[]} [opts.allowedFields]  - Explicit allowlist. If omitted,
 *        automatically set to `[...required, ...optional]`.
 * @returns {{ required: string[], optional: string[], allowedFields: string[], fields: Record<string, Object> }}
 */
function createSchema({ required = [], optional = [], fields = {}, allowedFields } = {}) {
  return {
    required,
    optional,
    fields,
    allowedFields: allowedFields || [...required, ...optional],
  };
}

/* ================================================================== */
/*  Exports                                                            */
/* ================================================================== */

module.exports = {
  validateRequest,
  createSchema,
  validateField,
};
