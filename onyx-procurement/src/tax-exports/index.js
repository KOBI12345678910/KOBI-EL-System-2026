/**
 * src/tax-exports/index.js — barrel export for Tax Authority XML formats.
 * Agent 70 — Tax Authority XML export formats (Wave 2026)
 *
 * All generators here live in PARALLEL to src/vat/pcn836.js (flat text,
 * Wave 1.5). Nothing in src/vat/ is touched.
 *
 * Every generator exposes:
 *   - generate(data)            → UTF-8 XML string (with BOM)
 *   - validate(data)            → Array<string> (empty if valid)
 *   - writeToFile(data, path)   → { path, bytes, sha256 }
 *   - FORM_CODE, ROOT_TAG
 */

'use strict';

const form1320 = require('./form-1320-xml');
const form857 = require('./form-857-xml');
const form126 = require('./form-126-xml');
const form1301 = require('./form-1301-xml');
const form102 = require('./form-102-xml');
const vatRashutHamisim = require('./vat-rashut-hamisim-xml');
const shv = require('./shv-xml');
const xmlCommon = require('./_xml-common');

// Static catalog of all supported forms.
const FORMS = Object.freeze({
  '1320': form1320,
  '857': form857,
  '126': form126,
  '1301': form1301,
  '102': form102,
  'VAT-Q': vatRashutHamisim,
  SHV: shv,
});

/**
 * Pick a generator by its FORM_CODE.
 * @param {string} code one of '1320', '857', '126', '1301', '102', 'VAT-Q', 'SHV'
 */
function getFormGenerator(code) {
  const gen = FORMS[code];
  if (!gen) {
    throw new Error(`tax-exports: unknown form code '${code}'. Known: ${Object.keys(FORMS).join(', ')}`);
  }
  return gen;
}

/** List all supported forms with their codes and root tags. */
function listForms() {
  return Object.values(FORMS).map(f => ({
    code: f.FORM_CODE,
    rootTag: f.ROOT_TAG,
  }));
}

module.exports = {
  // Individual generators
  form1320,
  form857,
  form126,
  form1301,
  form102,
  vatRashutHamisim,
  shv,
  // Shared helpers
  xmlCommon,
  // Catalog
  FORMS,
  getFormGenerator,
  listForms,
};
