/**
 * Test fixture factory — suppliers
 * Matches `suppliers` schema in 001-supabase-schema.sql.
 *
 * Also hosts the shared deterministic PRNG + Israeli helpers
 * that the other fixture files import via `./suppliers`.
 *
 * Pure JS, zero deps.
 */

'use strict';

// ═══════════════════════════════════════════════════════════════
// DETERMINISTIC PRNG  (mulberry32)
// ═══════════════════════════════════════════════════════════════

let _state = 0x6b6f6269 >>> 0; // default seed — "kobi" in hex

/** Set the seed so test data is reproducible. */
function seed(n) {
  _state = (Number(n) >>> 0) || 1;
}

/** 32-bit mulberry32, returns [0,1). */
function rand() {
  _state = (_state + 0x6D2B79F5) >>> 0;
  let t = _state;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Integer in [min, max] inclusive. */
function randInt(min, max) {
  return Math.floor(rand() * (max - min + 1)) + min;
}

/** Pick one element from an array. */
function pick(arr) {
  return arr[Math.floor(rand() * arr.length)];
}

/** Round to 2 decimals, return as Number (not string). */
function money(n) {
  return Math.round(Number(n) * 100) / 100;
}

// ═══════════════════════════════════════════════════════════════
// ISRAELI ID (ת.ז) — official Luhn-style checksum
// ═══════════════════════════════════════════════════════════════

/**
 * Compute the single check digit for an 8-digit ת.ז prefix.
 * Algorithm per Israeli Ministry of Interior:
 *   For each of the first 8 digits, multiply by 1 if index is even
 *   (0,2,4,6) and 2 if odd (1,3,5,7). If product > 9, subtract 9.
 *   Sum all products. Check digit = (10 - (sum % 10)) % 10.
 */
function israeliIdCheckDigit(prefix8) {
  const digits = String(prefix8).padStart(8, '0').slice(0, 8).split('').map(Number);
  let sum = 0;
  for (let i = 0; i < 8; i++) {
    let x = digits[i] * ((i % 2) + 1);
    if (x > 9) x -= 9;
    sum += x;
  }
  return (10 - (sum % 10)) % 10;
}

/**
 * Generate a full 9-digit Israeli ת.ז (including check digit)
 * that passes the official Luhn-style checksum.
 */
function generateIsraeliId() {
  // keep first digit non-zero for realism
  const prefix = String(randInt(10000000, 99999999));
  return prefix + String(israeliIdCheckDigit(prefix));
}

/** Validate an Israeli ת.ז. Exposed for tests. */
function isValidIsraeliId(id) {
  const s = String(id || '').trim();
  if (!/^\d{9}$/.test(s)) return false;
  return israeliIdCheckDigit(s.slice(0, 8)) === Number(s[9 - 1]);
}

/**
 * Generate a 9-digit company id (ח.פ). We emit Luhn-valid digits
 * too so tests that share the check-digit helper pass on company ids.
 */
function generateCompanyId() {
  const prefix = String(randInt(51000000, 52999999)); // 5xx-range Ltd.
  return prefix + String(israeliIdCheckDigit(prefix));
}

// ═══════════════════════════════════════════════════════════════
// SAMPLE DATA POOLS (Hebrew + Latin names for realism)
// ═══════════════════════════════════════════════════════════════

const SUPPLIER_NAMES = [
  'אלקטרה בע"מ',
  'חומרי בניין הדר',
  'טכנולוגיות אור',
  'מתכות הצפון',
  'ציוד משרדי רמי',
  'Kobi Electric Supplies',
  'MegaSteel Industries',
  'NorthPipe Trading',
];

const CITIES = ['תל אביב', 'ירושלים', 'חיפה', 'באר שבע', 'רמת גן', 'פתח תקווה'];

const PAYMENT_TERMS = ['שוטף + 30', 'שוטף + 60', 'שוטף + 45', 'מזומן'];

const CONTACT_FIRST = ['רון', 'דנה', 'אבי', 'שירן', 'Yossi', 'Maya'];
const CONTACT_LAST = ['כהן', 'לוי', 'פרץ', 'אזולאי', 'Mizrahi', 'Katz'];

// ═══════════════════════════════════════════════════════════════
// FACTORY
// ═══════════════════════════════════════════════════════════════

let _supplierSeq = 0;

/**
 * Produce a plausible `suppliers` row.
 * @param {object} overrides
 * @returns {object}
 */
function makeSupplier(overrides = {}) {
  _supplierSeq += 1;
  const id = overrides.id || `sup-${String(_supplierSeq).padStart(4, '0')}`;
  const name = pick(SUPPLIER_NAMES);
  const contact = `${pick(CONTACT_FIRST)} ${pick(CONTACT_LAST)}`;
  const phone = `05${randInt(0, 9)}-${randInt(1000000, 9999999)}`;
  const city = pick(CITIES);
  const tz = generateIsraeliId();
  const companyId = generateCompanyId();

  return {
    id,
    name,
    contact_person: contact,
    phone,
    email: `contact${_supplierSeq}@${name.replace(/\s+/g, '').toLowerCase().replace(/[^a-z]/g, '') || 'supplier'}.co.il`,
    whatsapp: phone,
    address: `רחוב הרצל ${randInt(1, 200)}, ${city}`,
    country: 'ישראל',
    preferred_channel: 'whatsapp',
    default_payment_terms: pick(PAYMENT_TERMS),
    avg_delivery_days: randInt(2, 14),
    distance_km: money(randInt(1, 500)),
    rating: randInt(6, 10),
    delivery_reliability: randInt(5, 10),
    quality_score: randInt(5, 10),
    overall_score: randInt(60, 95),
    total_orders: randInt(0, 400),
    total_spent: money(randInt(0, 500000)),
    avg_response_time_hours: money(randInt(1, 48)),
    on_time_delivery_rate: money(randInt(70, 100)),
    total_negotiated_savings: money(randInt(0, 50000)),
    last_order_date: new Date().toISOString(),
    risk_score: randInt(0, 60),
    active: true,
    notes: '',
    tags: [],
    // non-schema fields used by payment/PO factories
    national_id: tz,
    company_id: companyId,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

module.exports = {
  // factory
  makeSupplier,
  // shared helpers re-used by the other fixture files
  seed,
  rand,
  randInt,
  pick,
  money,
  generateIsraeliId,
  isValidIsraeliId,
  israeliIdCheckDigit,
  generateCompanyId,
};
