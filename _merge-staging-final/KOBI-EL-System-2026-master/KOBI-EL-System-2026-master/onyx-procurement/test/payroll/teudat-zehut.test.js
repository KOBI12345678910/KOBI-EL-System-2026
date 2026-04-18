/**
 * Teudat Zehut (ת.ז) Validator — Unit Tests
 * Agent 91 — Techno-Kol Uzi ERP / Payroll validators
 *
 * Run with:   node --test test/payroll/teudat-zehut.test.js
 *
 * Requires Node >= 18 for the built-in `node:test` runner.
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const {
  validateTeudatZehut,
  formatTeudatZehut,
  generateValidTeudatZehut,
  normalizeTeudatZehut,
  computeChecksum,
  TZ_LENGTH,
} = require(path.resolve(__dirname, '..', '..', 'src', 'validators', 'teudat-zehut.js'));

// ─────────────────────────────────────────────────────────────
// Known-valid IDs (verified against the official Interior
// Ministry algorithm)
// ─────────────────────────────────────────────────────────────
const KNOWN_VALID = [
  '000000018', // canonical smallest-valid fixture
  '123456782',
  '111111118',
  '222222226',
  '999999998',
  '010000008', // 8-digit legacy form → '10000008'
  '010000016',
  '010000024',
];

// ─────────────────────────────────────────────────────────────
// Known-invalid IDs (all fail the check digit)
// ─────────────────────────────────────────────────────────────
const KNOWN_INVALID = [
  '123456789', // sum = 47
  '000000019', // sum = 11
  '111111111', // sum = 12
  '123456780', // sum = 38
  '987654321', // fails check digit
];

// ═══════════════════════════════════════════════════════════════
// 1. Core algorithm — computeChecksum
// ═══════════════════════════════════════════════════════════════

test('computeChecksum: 000000018 → 10 (divisible by 10)', () => {
  assert.equal(computeChecksum('000000018'), 10);
});

test('computeChecksum: 123456782 → 40 (divisible by 10)', () => {
  assert.equal(computeChecksum('123456782'), 40);
});

test('computeChecksum: 123456789 → 47 (invalid)', () => {
  assert.equal(computeChecksum('123456789'), 47);
});

test('computeChecksum: all nines 999999998 → 80', () => {
  assert.equal(computeChecksum('999999998'), 80);
});

test('computeChecksum is deterministic for same input', () => {
  const a = computeChecksum('123456782');
  const b = computeChecksum('123456782');
  assert.equal(a, b);
});

// ═══════════════════════════════════════════════════════════════
// 2. validateTeudatZehut — known valid
// ═══════════════════════════════════════════════════════════════

for (const id of KNOWN_VALID) {
  test(`validateTeudatZehut: ${id} is valid`, () => {
    const res = validateTeudatZehut(id);
    assert.equal(res.valid, true, `expected ${id} to be valid: ${res.reason}`);
    assert.equal(res.normalized, id);
    assert.equal(res.reason, undefined);
  });
}

// ═══════════════════════════════════════════════════════════════
// 3. validateTeudatZehut — known invalid
// ═══════════════════════════════════════════════════════════════

for (const id of KNOWN_INVALID) {
  test(`validateTeudatZehut: ${id} is invalid (check digit)`, () => {
    const res = validateTeudatZehut(id);
    assert.equal(res.valid, false);
    assert.ok(res.reason && res.reason.length > 0, 'reason should be set');
    assert.equal(res.normalized, id);
  });
}

// ═══════════════════════════════════════════════════════════════
// 4. Input normalisation — leading zeros, padding
// ═══════════════════════════════════════════════════════════════

test('normalize: pads 8-digit legacy ID with leading zero', () => {
  const res = validateTeudatZehut('10000008');
  assert.equal(res.valid, true);
  assert.equal(res.normalized, '010000008');
});

test('normalize: pads 7-digit ID with two leading zeros', () => {
  // 7-digit numeric value: 1000001 → pad → '001000001' (invalid checksum, but normalisation should work)
  const norm = normalizeTeudatZehut('1000001');
  assert.equal(norm.ok, true);
  assert.equal(norm.normalized, '001000001');
});

test('normalize: numeric input 123456782 (number type)', () => {
  const res = validateTeudatZehut(123456782);
  assert.equal(res.valid, true);
  assert.equal(res.normalized, '123456782');
});

test('normalize: tiny numeric input 18 is rejected (too short, typo-guard)', () => {
  // 2 digits is too ambiguous — we reject rather than silently pad.
  // To use the canonical 000000018 fixture, callers must pass a string.
  const res = validateTeudatZehut(18);
  assert.equal(res.valid, false);
  assert.match(res.reason, /קצרה|short/);
});

test('normalize: canonical 000000018 fixture as string', () => {
  const res = validateTeudatZehut('000000018');
  assert.equal(res.valid, true);
  assert.equal(res.normalized, '000000018');
});

test('normalize: strips excessive leading zeros from 10+ digits', () => {
  const res = validateTeudatZehut('0123456782');
  assert.equal(res.valid, true);
  assert.equal(res.normalized, '123456782');
});

// ═══════════════════════════════════════════════════════════════
// 5. Input normalisation — spaces, dashes, punctuation
// ═══════════════════════════════════════════════════════════════

test('normalize: accepts dashed format 123-45-6782', () => {
  const res = validateTeudatZehut('123-45-6782');
  assert.equal(res.valid, true);
  assert.equal(res.normalized, '123456782');
});

test('normalize: accepts space-separated 123 45 6782', () => {
  const res = validateTeudatZehut('123 45 6782');
  assert.equal(res.valid, true);
  assert.equal(res.normalized, '123456782');
});

test('normalize: trims leading/trailing whitespace', () => {
  const res = validateTeudatZehut('  123456782  ');
  assert.equal(res.valid, true);
  assert.equal(res.normalized, '123456782');
});

test('normalize: accepts dotted format 123.45.6782', () => {
  const res = validateTeudatZehut('123.45.6782');
  assert.equal(res.valid, true);
  assert.equal(res.normalized, '123456782');
});

test('normalize: accepts slash format 123/45/6782', () => {
  const res = validateTeudatZehut('123/45/6782');
  assert.equal(res.valid, true);
  assert.equal(res.normalized, '123456782');
});

// ═══════════════════════════════════════════════════════════════
// 6. Edge cases — empty / null / unsupported types
// ═══════════════════════════════════════════════════════════════

test('edge: null input → invalid with reason', () => {
  const res = validateTeudatZehut(null);
  assert.equal(res.valid, false);
  assert.match(res.reason, /ריקה|empty/);
  assert.equal(res.normalized, '');
});

test('edge: undefined input → invalid with reason', () => {
  const res = validateTeudatZehut(undefined);
  assert.equal(res.valid, false);
  assert.match(res.reason, /ריקה|empty/);
});

test('edge: empty string → invalid with reason', () => {
  const res = validateTeudatZehut('');
  assert.equal(res.valid, false);
  assert.match(res.reason, /ריקה|empty/);
});

test('edge: whitespace only → invalid with reason', () => {
  const res = validateTeudatZehut('   ');
  assert.equal(res.valid, false);
  assert.match(res.reason, /ריקה|empty/);
});

test('edge: non-numeric characters → invalid with reason', () => {
  const res = validateTeudatZehut('12345A782');
  assert.equal(res.valid, false);
  assert.match(res.reason, /ספרות|digits/);
});

test('edge: unicode / emoji → invalid with reason', () => {
  const res = validateTeudatZehut('1234567😀');
  assert.equal(res.valid, false);
  assert.match(res.reason, /ספרות|digits/);
});

test('edge: object input → invalid with reason', () => {
  const res = validateTeudatZehut({});
  assert.equal(res.valid, false);
  assert.match(res.reason, /סוג קלט|unsupported/);
});

test('edge: boolean input → invalid with reason', () => {
  const res = validateTeudatZehut(true);
  assert.equal(res.valid, false);
  assert.match(res.reason, /סוג קלט|unsupported/);
});

test('edge: NaN → invalid with reason', () => {
  const res = validateTeudatZehut(NaN);
  assert.equal(res.valid, false);
  assert.match(res.reason, /חיובי|positive/);
});

test('edge: negative number → invalid with reason', () => {
  const res = validateTeudatZehut(-123456782);
  assert.equal(res.valid, false);
  assert.match(res.reason, /חיובי|positive/);
});

test('edge: too short (3 digits) → invalid with reason', () => {
  const res = validateTeudatZehut('123');
  assert.equal(res.valid, false);
  assert.match(res.reason, /קצרה|short/);
});

test('edge: too long (11 digits) → invalid with reason', () => {
  const res = validateTeudatZehut('12345678901');
  assert.equal(res.valid, false);
  assert.match(res.reason, /ארוכה|long/);
});

// ═══════════════════════════════════════════════════════════════
// 7. Reserved / impossible IDs
// ═══════════════════════════════════════════════════════════════

test('reserved: 000000000 (all zeros) → invalid', () => {
  const res = validateTeudatZehut('000000000');
  assert.equal(res.valid, false);
  assert.match(res.reason, /שמורה|reserved/);
});

test('reserved: 999999999 (all nines) → invalid', () => {
  const res = validateTeudatZehut('999999999');
  assert.equal(res.valid, false);
  assert.match(res.reason, /שמורה|reserved/);
});

test('reserved: 000000007 (hard-reserved band 1-17) → invalid', () => {
  const res = validateTeudatZehut('000000007');
  assert.equal(res.valid, false);
  assert.match(res.reason, /שמור|reserved|band/);
});

test('reserved: 000000017 (top of hard-reserved band) → invalid', () => {
  const res = validateTeudatZehut('000000017');
  assert.equal(res.valid, false);
  assert.match(res.reason, /שמור|reserved|band/);
});

test('reserved: 000000018 is NOT reserved (canonical valid)', () => {
  const res = validateTeudatZehut('000000018');
  assert.equal(res.valid, true);
});

// ═══════════════════════════════════════════════════════════════
// 8. formatTeudatZehut — display format
// ═══════════════════════════════════════════════════════════════

test('format: 123456782 → 123-45-6782', () => {
  assert.equal(formatTeudatZehut('123456782'), '123-45-6782');
});

test('format: pads 8-digit 10000008 → 010-00-0008', () => {
  assert.equal(formatTeudatZehut('10000008'), '010-00-0008');
});

test('format: strips existing dashes then reformats', () => {
  assert.equal(formatTeudatZehut('123-45-6782'), '123-45-6782');
});

test('format: handles numeric input', () => {
  assert.equal(formatTeudatZehut(123456782), '123-45-6782');
});

test('format: null/undefined → empty string', () => {
  assert.equal(formatTeudatZehut(null), '');
  assert.equal(formatTeudatZehut(undefined), '');
});

test('format: keeps cleaned digits even when invalid length', () => {
  // Too short to normalize → returns stripped raw
  const out = formatTeudatZehut('12');
  assert.equal(out, '12');
});

// ═══════════════════════════════════════════════════════════════
// 9. generateValidTeudatZehut — for testing
// ═══════════════════════════════════════════════════════════════

test('generate: produces a 9-digit ID', () => {
  const id = generateValidTeudatZehut();
  assert.equal(typeof id, 'string');
  assert.equal(id.length, TZ_LENGTH);
  assert.match(id, /^\d{9}$/);
});

test('generate: produces a valid ID (passes validator)', () => {
  for (let i = 0; i < 50; i++) {
    const id = generateValidTeudatZehut();
    const res = validateTeudatZehut(id);
    assert.equal(res.valid, true, `generated invalid: ${id} — ${res.reason}`);
  }
});

test('generate: with injected deterministic RNG is reproducible', () => {
  let seed = 12345;
  const rng = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  const a = generateValidTeudatZehut({ rng });

  seed = 12345;
  const rng2 = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  const b = generateValidTeudatZehut({ rng: rng2 });

  assert.equal(a, b);
});

test('generate: never produces a reserved ID', () => {
  for (let i = 0; i < 200; i++) {
    const id = generateValidTeudatZehut();
    assert.notEqual(id, '000000000');
    assert.notEqual(id, '999999999');
    const tail = parseInt(id.slice(7), 10);
    if (id.startsWith('0000000')) {
      assert.ok(tail === 0 || tail >= 18, `generated reserved-band ID: ${id}`);
    }
  }
});

// ═══════════════════════════════════════════════════════════════
// 10. Round-trip: validate → format → validate
// ═══════════════════════════════════════════════════════════════

test('round-trip: format then validate keeps validity', () => {
  for (const id of KNOWN_VALID) {
    const formatted = formatTeudatZehut(id);
    const res = validateTeudatZehut(formatted);
    assert.equal(res.valid, true, `round-trip failed for ${id} → ${formatted}`);
    assert.equal(res.normalized, id);
  }
});

test('round-trip: generate → validate → format → validate', () => {
  for (let i = 0; i < 20; i++) {
    const id = generateValidTeudatZehut();
    const formatted = formatTeudatZehut(id);
    const res = validateTeudatZehut(formatted);
    assert.equal(res.valid, true);
    assert.equal(res.normalized, id);
  }
});

// ═══════════════════════════════════════════════════════════════
// 11. Bilingual error messages
// ═══════════════════════════════════════════════════════════════

test('bilingual: error messages contain Hebrew', () => {
  const res = validateTeudatZehut('abc');
  assert.equal(res.valid, false);
  // Check for Hebrew characters (Unicode block 0x0590..0x05FF)
  const hasHebrew = /[\u0590-\u05FF]/.test(res.reason);
  assert.ok(hasHebrew, `expected Hebrew in reason: ${res.reason}`);
});

test('bilingual: error messages contain English', () => {
  const res = validateTeudatZehut('abc');
  assert.equal(res.valid, false);
  // At minimum, contain a Latin word ("digits", "reserved", "empty", etc.)
  const hasLatin = /[A-Za-z]{3,}/.test(res.reason);
  assert.ok(hasLatin, `expected English in reason: ${res.reason}`);
});

// ═══════════════════════════════════════════════════════════════
// 12. Structural guarantees
// ═══════════════════════════════════════════════════════════════

test('structure: return shape always has valid+normalized', () => {
  const cases = ['123456782', 'invalid', '', null, 18, '000000007'];
  for (const c of cases) {
    const res = validateTeudatZehut(c);
    assert.ok('valid' in res);
    assert.ok('normalized' in res);
    assert.equal(typeof res.valid, 'boolean');
    assert.equal(typeof res.normalized, 'string');
  }
});

test('structure: valid result has no reason field', () => {
  const res = validateTeudatZehut('123456782');
  assert.equal(res.reason, undefined);
});

test('structure: invalid result always has reason field', () => {
  const res = validateTeudatZehut('123456789');
  assert.equal(typeof res.reason, 'string');
  assert.ok(res.reason.length > 0);
});

test('structure: TZ_LENGTH constant is 9', () => {
  assert.equal(TZ_LENGTH, 9);
});
