'use strict';

/**
 * Input sanitization utilities — strips HTML and enforces sane limits.
 * Use on any user-supplied string fields before persisting to DB.
 */

/**
 * Strip HTML tags from a string input and trim whitespace.
 * Caps the result at 5000 characters to prevent payload bloat.
 * Non-string values are returned unchanged.
 *
 * @param {*} str
 * @returns {*}
 */
function sanitizeString(str) {
  if (typeof str !== 'string') return str;
  return str.replace(/<[^>]*>/g, '').trim().slice(0, 5000);
}

/**
 * Recursively sanitize all string values in an object or array.
 * Non-string leaf values (numbers, booleans, null) pass through unchanged.
 *
 * @param {*} obj
 * @returns {*}
 */
function sanitizeBody(obj) {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map(sanitizeBody);
  if (typeof obj === 'object') {
    const result = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = sanitizeBody(value);
    }
    return result;
  }
  if (typeof obj === 'string') return sanitizeString(obj);
  return obj;
}

module.exports = { sanitizeString, sanitizeBody };
