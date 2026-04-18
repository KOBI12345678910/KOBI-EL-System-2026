/**
 * Israeli Phone Validator — Unit Tests
 * Techno-Kol Uzi / Onyx Procurement — Agent 93
 *
 * Run with:
 *   node --test test/payroll/phone.test.js
 *
 * Zero deps. Uses built-in node:test (Node >= 18).
 *
 * Covers 40+ cases across:
 *   - every Israeli mobile prefix (050–059)
 *   - every landline area code (02, 03, 04, 07, 08, 09)
 *   - every accepted input format
 *   - toll-free 1-800 / 1-700
 *   - premium 1-900
 *   - emergency / special codes
 *   - negative cases & edge handling
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const {
  validateIsraeliPhone,
  parseIsraeliPhone,
  formatForDisplay,
  normalizeToNational,
  TYPES,
  MOBILE_PREFIXES,
  LANDLINE_AREA_CODES,
} = require(path.resolve(__dirname, '..', '..', 'src', 'validators', 'phone.js'));

// ──────────────────────────────────────────────────────────────────────
// 1. Format acceptance — same number, 6 wire formats
// ──────────────────────────────────────────────────────────────────────

describe('1. Accepted input formats', () => {
  const equivalents = [
    '050-1234567',
    '0501234567',
    '050 123 4567',
    '(050) 123-4567',
    '972-50-1234567',
    '+972501234567',
    '00972501234567',
    '+972 50 123 4567',
  ];

  for (const input of equivalents) {
    test(`accepts format "${input}"`, () => {
      const r = validateIsraeliPhone(input);
      assert.equal(r.valid, true, `expected valid for ${input}, reason=${r.reason}`);
      assert.equal(r.type, TYPES.MOBILE);
      assert.equal(r.national, '0501234567');
      assert.equal(r.e164, '+972501234567');
      assert.equal(r.display_local, '050-123-4567');
      assert.equal(r.display_international, '+972 50 123 4567');
    });
  }
});

// ──────────────────────────────────────────────────────────────────────
// 2. Mobile carrier detection — every 05X prefix
// ──────────────────────────────────────────────────────────────────────

describe('2. Mobile carriers — all 05X prefixes', () => {
  const table = [
    { prefix: '050', primary: 'Pelephone' },
    { prefix: '051', primary: 'Home Cellular' },
    { prefix: '052', primary: 'Cellcom' },
    { prefix: '053', primary: 'Hot Mobile' },
    { prefix: '054', primary: 'Partner' },
    { prefix: '055', primary: 'Hot Mobile' },
    { prefix: '056', primary: 'Palestinian Operator' },
    { prefix: '057', primary: 'MVNO' },
    { prefix: '058', primary: 'Golan Telecom' },
    { prefix: '059', primary: 'Jawwal' },
  ];

  for (const row of table) {
    test(`${row.prefix} → ${row.primary}`, () => {
      const r = validateIsraeliPhone(`${row.prefix}1234567`);
      assert.equal(r.valid, true);
      assert.equal(r.type, TYPES.MOBILE);
      assert.equal(r.carrier, row.primary);
      assert.ok(Array.isArray(r.carriers), 'carriers list expected');
      assert.ok(r.carriers.length >= 1);
      assert.equal(r.portable, true, 'all mobile numbers should be portable');
      assert.equal(r.e164, `+972${row.prefix.slice(1)}1234567`);
    });
  }

  test('052 reports both Cellcom and Pelephone as possible carriers', () => {
    const r = validateIsraeliPhone('052-9876543');
    assert.equal(r.valid, true);
    assert.deepEqual(r.carriers, ['Cellcom', 'Pelephone']);
  });

  test('058 reports Golan Telecom and Rami Levy', () => {
    const r = validateIsraeliPhone('058-1234567');
    assert.deepEqual(r.carriers, ['Golan Telecom', 'Rami Levy']);
  });
});

// ──────────────────────────────────────────────────────────────────────
// 3. Landline area codes — every region
// ──────────────────────────────────────────────────────────────────────

describe('3. Landline area codes', () => {
  const table = [
    { code: '02', region: 'Jerusalem',                   local: '02-123-4567' },
    { code: '03', region: 'Tel Aviv / Gush Dan',         local: '03-123-4567' },
    { code: '04', region: 'Haifa / North',               local: '04-123-4567' },
    { code: '08', region: 'Central South / Ashdod',      local: '08-123-4567' },
    { code: '09', region: 'Sharon',                      local: '09-123-4567' },
  ];

  for (const row of table) {
    test(`${row.code} → ${row.region}`, () => {
      const r = validateIsraeliPhone(`${row.code}-123-4567`);
      assert.equal(r.valid, true, `reason=${r.reason}`);
      assert.equal(r.type, TYPES.LANDLINE);
      assert.equal(r.region, row.region);
      assert.equal(r.display_local, row.local);
      assert.equal(r.e164, `+972${row.code.slice(1)}1234567`);
    });
  }

  test('Jerusalem landline in international form: +972 2 123 4567', () => {
    const r = validateIsraeliPhone('+97221234567');
    assert.equal(r.valid, true);
    assert.equal(r.type, TYPES.LANDLINE);
    assert.equal(r.region, 'Jerusalem');
    assert.equal(r.display_international, '+972 2 123 4567');
  });

  test('Historical 07 Beer Sheva tolerated', () => {
    const r = validateIsraeliPhone('07-123-4567');
    // 07 is classified as VOIP now unless prefix matches 07X VOIP table.
    // For bare "07" the classifier falls through to the landline branch
    // with area_code "07" (historical). Accept either classification as
    // long as it is non-unknown.
    assert.notEqual(r.type, TYPES.UNKNOWN);
  });
});

// ──────────────────────────────────────────────────────────────────────
// 4. Toll-free, shared-cost and premium
// ──────────────────────────────────────────────────────────────────────

describe('4. Service numbers (toll-free / premium)', () => {
  test('1-800-123-456 → toll_free', () => {
    const r = validateIsraeliPhone('1-800-123-456');
    assert.equal(r.valid, true);
    assert.equal(r.type, TYPES.TOLL_FREE);
  });

  test('1700123456 → toll_free / shared-cost', () => {
    const r = validateIsraeliPhone('1700123456');
    assert.equal(r.valid, true);
    assert.equal(r.type, TYPES.TOLL_FREE);
  });

  test('1-900-123-456 → premium', () => {
    const r = validateIsraeliPhone('1-900-123-456');
    assert.equal(r.valid, true);
    assert.equal(r.type, TYPES.PREMIUM);
  });

  test('1599123456 → shared-cost', () => {
    const r = validateIsraeliPhone('1599123456');
    assert.equal(r.valid, true);
    assert.equal(r.type, TYPES.TOLL_FREE);
  });
});

// ──────────────────────────────────────────────────────────────────────
// 5. Special / emergency codes
// ──────────────────────────────────────────────────────────────────────

describe('5. Emergency and special codes', () => {
  const table = [
    { code: '100', label: 'Police' },
    { code: '101', label: 'Magen David Adom' },
    { code: '102', label: 'Fire & Rescue' },
    { code: '103', label: 'Electric Company' },
    { code: '104', label: 'Home Front Command' },
    { code: '106', label: 'Municipality' },
  ];

  for (const row of table) {
    test(`${row.code} → ${row.label}`, () => {
      const r = validateIsraeliPhone(row.code);
      assert.equal(r.valid, true, `reason=${r.reason}`);
      assert.equal(r.type, TYPES.SPECIAL);
      assert.equal(r.label, row.label);
    });
  }
});

// ──────────────────────────────────────────────────────────────────────
// 6. Negative cases — invalid input
// ──────────────────────────────────────────────────────────────────────

describe('6. Invalid input rejected', () => {
  const invalids = [
    { label: 'empty',              input: '' },
    { label: 'null',               input: null },
    { label: 'undefined',          input: undefined },
    { label: 'whitespace only',    input: '   ' },
    { label: 'letters only',       input: 'hello' },
    { label: 'too short mobile',   input: '05012345' },     // 8 digits
    { label: 'too long mobile',    input: '050123456789' }, // 12 digits
    { label: 'too short landline', input: '0312345' },
    { label: 'bad prefix 06X',     input: '0612345678' },
    { label: 'random 11 digits',   input: '12345678901' },
    { label: 'US number',          input: '+14155552671' },
  ];

  for (const row of invalids) {
    test(`rejects ${row.label} (${JSON.stringify(row.input)})`, () => {
      const r = validateIsraeliPhone(row.input);
      assert.equal(r.valid, false, `unexpectedly valid: ${JSON.stringify(r)}`);
      assert.ok(typeof r.reason === 'string' && r.reason.length > 0, 'reason required');
    });
  }
});

// ──────────────────────────────────────────────────────────────────────
// 7. parseIsraeliPhone — structured output
// ──────────────────────────────────────────────────────────────────────

describe('7. parseIsraeliPhone() — structured output', () => {
  test('returns full breakdown for a valid mobile', () => {
    const p = parseIsraeliPhone('+972-54-123-4567');
    assert.equal(p.type, TYPES.MOBILE);
    assert.equal(p.prefix, '054');
    assert.equal(p.carrier, 'Partner');
    assert.equal(p.national, '0541234567');
    assert.equal(p.e164, '+972541234567');
    assert.equal(p.had_plus_prefix, true);
    assert.equal(p.country_code, '972');
  });

  test('returns structured output even for invalid input', () => {
    const p = parseIsraeliPhone('xyz');
    assert.equal(p.type, TYPES.UNKNOWN);
    assert.equal(p.national, '');
    assert.equal(p.prefix, null);
  });

  test('parses landline with area code and region', () => {
    const p = parseIsraeliPhone('03-555-1212');
    assert.equal(p.type, TYPES.LANDLINE);
    assert.equal(p.area_code, '03');
    assert.equal(p.region, 'Tel Aviv / Gush Dan');
    assert.equal(p.region_he, 'תל אביב / גוש דן');
  });
});

// ──────────────────────────────────────────────────────────────────────
// 8. formatForDisplay — formatting modes
// ──────────────────────────────────────────────────────────────────────

describe('8. formatForDisplay()', () => {
  test('default mode is local', () => {
    assert.equal(formatForDisplay('0501234567'), '050-123-4567');
  });

  test('international mode', () => {
    assert.equal(formatForDisplay('0501234567', 'international'), '+972 50 123 4567');
  });

  test('e164 mode', () => {
    assert.equal(formatForDisplay('050-123-4567', 'e164'), '+972501234567');
  });

  test('landline local', () => {
    assert.equal(formatForDisplay('021234567'), '02-123-4567');
  });

  test('landline international', () => {
    assert.equal(formatForDisplay('021234567', 'international'), '+972 2 123 4567');
  });

  test('returns empty string for invalid input', () => {
    assert.equal(formatForDisplay('invalid'), '');
    assert.equal(formatForDisplay(''), '');
    assert.equal(formatForDisplay(null), '');
  });

  test('round-trip: E.164 → local → E.164', () => {
    const e164 = '+972541234567';
    const local = formatForDisplay(e164, 'local');
    const back  = formatForDisplay(local, 'e164');
    assert.equal(back, e164);
  });
});

// ──────────────────────────────────────────────────────────────────────
// 9. Normalisation edge cases
// ──────────────────────────────────────────────────────────────────────

describe('9. normalizeToNational()', () => {
  test('strips 00 international prefix', () => {
    assert.equal(normalizeToNational('00972501234567'), '0501234567');
  });

  test('strips 011 international prefix', () => {
    assert.equal(normalizeToNational('011972501234567'), '0501234567');
  });

  test('strips + sign with 972', () => {
    assert.equal(normalizeToNational('+972501234567'), '0501234567');
  });

  test('preserves leading 0', () => {
    assert.equal(normalizeToNational('0501234567'), '0501234567');
  });

  test('handles parentheses and dashes', () => {
    assert.equal(normalizeToNational('(050) 123-4567'), '0501234567');
  });

  test('handles mixed whitespace', () => {
    assert.equal(normalizeToNational('  050\t123 4567  '), '0501234567');
  });
});

// ──────────────────────────────────────────────────────────────────────
// 10. Hebrew bilingual output
// ──────────────────────────────────────────────────────────────────────

describe('10. Hebrew labels', () => {
  test('mobile carrier has Hebrew name', () => {
    const r = validateIsraeliPhone('050-1234567');
    assert.ok(r.carrier_he && r.carrier_he.length > 0);
    assert.equal(r.carrier_he, 'פלאפון');
  });

  test('landline region has Hebrew name', () => {
    const r = validateIsraeliPhone('02-123-4567');
    assert.equal(r.region_he, 'ירושלים');
  });

  test('emergency code 101 has Hebrew label', () => {
    const r = validateIsraeliPhone('101');
    assert.equal(r.label_he, 'מגן דוד אדום');
  });
});

// ──────────────────────────────────────────────────────────────────────
// 11. Constants integrity
// ──────────────────────────────────────────────────────────────────────

describe('11. Exported constants', () => {
  test('TYPES frozen', () => {
    assert.ok(Object.isFrozen(TYPES));
  });

  test('all 05X mobile prefixes present', () => {
    for (let i = 0; i < 10; i++) {
      const p = '05' + i;
      assert.ok(MOBILE_PREFIXES[p], `missing prefix ${p}`);
    }
  });

  test('landline area codes present', () => {
    for (const code of ['02', '03', '04', '08', '09']) {
      assert.ok(LANDLINE_AREA_CODES[code], `missing area code ${code}`);
    }
  });
});

// ──────────────────────────────────────────────────────────────────────
// 12. VOIP
// ──────────────────────────────────────────────────────────────────────

describe('12. VOIP non-geographic', () => {
  test('077 is VOIP', () => {
    const r = validateIsraeliPhone('077-123-4567');
    assert.equal(r.valid, true);
    assert.equal(r.type, TYPES.VOIP);
  });

  test('072 is VOIP', () => {
    const r = validateIsraeliPhone('0721234567');
    assert.equal(r.valid, true);
    assert.equal(r.type, TYPES.VOIP);
  });
});
