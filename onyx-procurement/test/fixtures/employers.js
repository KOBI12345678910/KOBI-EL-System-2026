/**
 * Test fixture factory — employers
 * Matches `employers` schema in 007-payroll-wage-slip.sql.
 *
 * Shape consumed by wage-slip-calculator.js → it reads:
 *   employer.id, employer.legal_name, employer.company_id, employer.tax_file_number
 * and writes a snapshot onto each wage slip as:
 *   employer_legal_name, employer_company_id, employer_tax_file.
 */

'use strict';

const {
  randInt,
  pick,
  generateCompanyId,
} = require('./suppliers');

const EMPLOYER_LEGAL_NAMES = [
  'Onyx Construction Ltd',
  'קובי אלקטריק בע"מ',
  'BlueSky Holdings Ltd',
  'מכלול הנדסה אזרחית בע"מ',
  'Techno-Kol Operations Ltd',
];

const TRADING_NAMES = [
  'Onyx',
  'KobiEl',
  'BlueSky',
  'Machlol',
  'Techno-Kol',
];

const CITIES = ['תל אביב', 'ירושלים', 'חיפה', 'רמת גן'];

let _employerSeq = 0;

/**
 * Produce a plausible `employers` row.
 * Defaults are tuned so that wage-slip-calculator.js snapshot fields
 *   employer_legal_name / employer_company_id / employer_tax_file
 * are all populated correctly.
 */
function makeEmployer(overrides = {}) {
  _employerSeq += 1;
  const idx = (_employerSeq - 1) % EMPLOYER_LEGAL_NAMES.length;
  const companyId = generateCompanyId();
  const taxFile = String(randInt(900000000, 999999999)); // 9-digit תיק ניכויים
  const vatFile = String(randInt(500000000, 599999999));

  return {
    id: overrides.id || _employerSeq,
    legal_name: EMPLOYER_LEGAL_NAMES[idx],
    trading_name: TRADING_NAMES[idx],
    company_id: companyId,
    tax_file_number: taxFile,
    vat_file_number: vatFile,
    bituach_leumi_number: String(randInt(100000000, 999999999)),
    address: `רחוב ריבל ${randInt(1, 120)}`,
    city: pick(CITIES),
    phone: `03-${randInt(1000000, 9999999)}`,
    is_active: true,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

module.exports = { makeEmployer };
