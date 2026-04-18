/**
 * _xml-common.js — Shared XML helpers for Israel Tax Authority exports.
 * Agent 70 — Tax Authority XML export formats (Wave 2026)
 *
 * All generators under src/tax-exports/ use this helper to build UTF-8 XML
 * (with BOM) in the shape required by רשות המסים web-submission portal.
 *
 * This is PARALLEL to src/vat/pcn836.js (flat fixed-width). DO NOT TOUCH
 * pcn836.js — these generators live in a brand-new namespace.
 *
 * Spec references:
 *   - רשות המסים טופסי XML לדיווח ממוחשב
 *   - שע"מ (שרותי עיבוד ממוכנים) XML schema family
 *
 * Every generated file:
 *   • starts with a UTF-8 BOM (EF BB BF)
 *   • uses <?xml version="1.0" encoding="UTF-8"?> prolog
 *   • declares xmlns="http://www.taxes.gov.il/schema/<form>"
 *   • uses ISO dates (YYYY-MM-DD) and ISO datetimes where relevant
 *   • wraps the whole body inside a form-specific Root element
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ═══════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════

const UTF8_BOM = '\ufeff';
const XML_PROLOG = '<?xml version="1.0" encoding="UTF-8"?>';
const XMLNS_BASE = 'http://www.taxes.gov.il/schema';

// ═══════════════════════════════════════════════════════════════
// Escaping / formatting helpers
// ═══════════════════════════════════════════════════════════════

/** Escape a string for safe embedding inside an XML text node or attribute. */
function escapeXml(raw) {
  if (raw === null || raw === undefined) return '';
  const s = String(raw);
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Format a Date (or string) as ISO YYYY-MM-DD. Returns '' for falsy input. */
function isoDate(value) {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return '';
  const y = d.getFullYear().toString().padStart(4, '0');
  const m = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Format a Date/string as full ISO datetime (YYYY-MM-DDTHH:mm:ssZ). */
function isoDateTime(value) {
  const d = value ? (value instanceof Date ? value : new Date(value)) : new Date();
  if (isNaN(d.getTime())) return new Date().toISOString();
  return d.toISOString();
}

/** Format a period like YYYY-MM from a Date or from an explicit {year,month}. */
function isoPeriod(value) {
  if (!value) return '';
  if (typeof value === 'object' && value.year && value.month) {
    const y = String(value.year).padStart(4, '0');
    const m = String(value.month).padStart(2, '0');
    return `${y}-${m}`;
  }
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Format an amount as 2-decimal string. Returns '0.00' for falsy input. */
function amount(value) {
  const n = Number(value || 0);
  if (!isFinite(n)) return '0.00';
  return n.toFixed(2);
}

/** Format an integer (rounded). */
function integer(value) {
  return String(Math.round(Number(value || 0)));
}

// ═══════════════════════════════════════════════════════════════
// Element builders
// ═══════════════════════════════════════════════════════════════

/**
 * Build a leaf XML element with escaped text content.
 * el('Name', 'value') → '<Name>value</Name>'
 * el('Name', null)    → '<Name/>' (self-closing when empty & emptyAsNull)
 */
function el(tag, value, opts = {}) {
  if (value === null || value === undefined || value === '') {
    return opts.emptyAsNull === false ? `<${tag}></${tag}>` : `<${tag}/>`;
  }
  return `<${tag}>${escapeXml(value)}</${tag}>`;
}

/** Build a container element wrapping inner XML (already serialized). */
function wrap(tag, innerXml, attrs) {
  const a = attrs ? ' ' + serializeAttrs(attrs) : '';
  if (!innerXml) return `<${tag}${a}/>`;
  return `<${tag}${a}>${innerXml}</${tag}>`;
}

/** Serialize an object of attributes as key="value" string. */
function serializeAttrs(attrs) {
  return Object.entries(attrs)
    .filter(([, v]) => v !== null && v !== undefined && v !== '')
    .map(([k, v]) => `${k}="${escapeXml(v)}"`)
    .join(' ');
}

/**
 * Build an object of { Tag: value } into a flat <Tag>value</Tag> sequence.
 * Skips undefined values; keeps empty strings as self-closing elements.
 */
function fields(obj) {
  return Object.entries(obj)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => el(k, v))
    .join('');
}

// ═══════════════════════════════════════════════════════════════
// Document assembly
// ═══════════════════════════════════════════════════════════════

/**
 * Build a complete XML document.
 * @param {string} rootTag  e.g. 'Report1320'
 * @param {string} formCode e.g. '1320' (used to derive xmlns)
 * @param {string} innerXml serialized inner elements
 * @param {Object} [opts]
 * @param {boolean} [opts.bom=true]  prepend UTF-8 BOM
 * @param {string}  [opts.xmlns]     override xmlns
 */
function buildDocument(rootTag, formCode, innerXml, opts = {}) {
  const xmlns = opts.xmlns || `${XMLNS_BASE}/${formCode}`;
  const root = `<${rootTag} xmlns="${xmlns}" formCode="${escapeXml(formCode)}">${innerXml}</${rootTag}>`;
  const body = `${XML_PROLOG}\n${root}\n`;
  return opts.bom === false ? body : UTF8_BOM + body;
}

// ═══════════════════════════════════════════════════════════════
// Common validators
// ═══════════════════════════════════════════════════════════════

/** Validate an Israeli ח.פ / ת.ז (basic length check, not the full checksum). */
function isValidTaxId(id) {
  if (!id) return false;
  const s = String(id).trim();
  return /^\d{7,9}$/.test(s);
}

/** Common required-field validator. Returns an array of error strings. */
function requireFields(data, list, prefix = '') {
  const errors = [];
  if (!data || typeof data !== 'object') {
    errors.push(`${prefix || 'data'}: must be an object`);
    return errors;
  }
  for (const f of list) {
    const v = data[f];
    if (v === undefined || v === null || v === '') {
      errors.push(`${prefix}${f}: required`);
    }
  }
  return errors;
}

/** Validate tax ID if present. */
function validateTaxIdField(data, field, prefix = '') {
  if (!data) return [];
  if (data[field] && !isValidTaxId(data[field])) {
    return [`${prefix}${field}: invalid tax id (expected 7-9 digits)`];
  }
  return [];
}

// ═══════════════════════════════════════════════════════════════
// File writing helper
// ═══════════════════════════════════════════════════════════════

/**
 * Write an XML string to disk as UTF-8 bytes (BOM preserved if present).
 * Creates parent directories as needed.
 * @returns {{path:string, bytes:number, sha256:string}}
 */
function writeXmlFile(xmlString, outputPath) {
  if (!xmlString) throw new Error('writeXmlFile: empty xmlString');
  if (!outputPath) throw new Error('writeXmlFile: outputPath required');
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const buf = Buffer.from(xmlString, 'utf8');
  fs.writeFileSync(outputPath, buf);
  const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
  return { path: outputPath, bytes: buf.length, sha256 };
}

// ═══════════════════════════════════════════════════════════════
// Metadata builder — every form reuses this identity block.
// ═══════════════════════════════════════════════════════════════

/**
 * Build the standard <Meta> block that every form includes inside its root.
 * @param {Object} opts
 * @param {string} opts.formCode    e.g. '1320'
 * @param {string} opts.companyId   ח"פ / ת.ז
 * @param {string} [opts.companyName]
 * @param {string} [opts.periodStart] ISO date or YYYY-MM
 * @param {string} [opts.periodEnd]
 * @param {string} [opts.taxYear]
 * @param {string} [opts.submissionType] 'initial'|'amendment'
 * @param {Date}   [opts.submissionDate]
 */
function buildMetaBlock(opts) {
  const inner = fields({
    FormCode: opts.formCode,
    CompanyId: opts.companyId,
    CompanyName: opts.companyName,
    TaxYear: opts.taxYear,
    PeriodStart: opts.periodStart ? isoDate(opts.periodStart) : undefined,
    PeriodEnd: opts.periodEnd ? isoDate(opts.periodEnd) : undefined,
    SubmissionType: opts.submissionType || 'initial',
    SubmissionDate: isoDateTime(opts.submissionDate || new Date()),
    Generator: 'onyx-procurement/tax-exports',
    GeneratorVersion: '1.0.0',
  });
  return wrap('Meta', inner);
}

module.exports = {
  // constants
  UTF8_BOM,
  XML_PROLOG,
  XMLNS_BASE,
  // formatters
  escapeXml,
  isoDate,
  isoDateTime,
  isoPeriod,
  amount,
  integer,
  // builders
  el,
  wrap,
  fields,
  serializeAttrs,
  buildDocument,
  buildMetaBlock,
  // validators
  isValidTaxId,
  requireFields,
  validateTaxIdField,
  // file i/o
  writeXmlFile,
};
