/**
 * ONYX AI — Data Quality Scorer Tests (Agent Y-163)
 * ---------------------------------------------------------------------
 * Exercises `src/quality/data-quality.ts` using only the Node built-in
 * test runner and strict assertions. No third-party deps.
 *
 * Run with:
 *   cd onyx-ai
 *   npx node --test --require ts-node/register test/quality/data-quality.test.ts
 *
 * 25+ tests, grouped by the subsystem they exercise:
 *
 *   DQ.1 Israeli ID validator           (checksum correctness)
 *   DQ.2 Israeli IBAN validator         (MOD-97 + bank registry)
 *   DQ.3 Israeli VAT/Osek validator
 *   DQ.4 Hebrew-only text predicate
 *   DQ.5 Israeli phone validator (+972)
 *   DQ.6 Email & ISO-8601 predicates
 *   DQ.7 Scorer dimensions (end-to-end)
 *   DQ.8 Grade ladder
 *   DQ.9 Bilingual output
 *   DQ.10 Freeze / never-delete guarantees
 */

import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import {
  DataQualityScorer,
  DEFAULT_WEIGHTS,
  DIMENSION_LABELS,
  GRADE_LADDER,
  ISRAELI_BANKS,
  isHebrewOnlyText,
  isValidEmail,
  isValidIsraeliId,
  isValidIsraeliIban,
  isValidIsraeliPhone,
  isValidIsraeliVat,
  isValidIso8601,
  validateIsraeliIban,
} from '../../src/quality/data-quality';
import type { DatasetSchema } from '../../src/quality/data-quality';

// ----------------------------------------------------------------------
// Known-good test vectors
// ----------------------------------------------------------------------

// Israeli IDs — computed by the spec algorithm.
//   "000000018"  → sum 8,   mod 10 = 8 → INVALID (used as a negative)
//   "000000019"  → sum 19,  mod 10 = 9 → INVALID
//   "000000026"  → sum 26,  mod 10 = 6 → INVALID
//   "000000027"  → sum 36,  mod 10 = 0 → VALID (computed by running algo)
// We stick to canonical public vectors instead:
const VALID_IDS = [
  '000000018'.padStart(9, '0'), // placeholder — replaced below
];
// Replace with hand-computed canonical ones:
VALID_IDS.length = 0;
VALID_IDS.push('000000018'); // expected VALID? recompute below in-test
// Actually: use algorithmic generation in the test itself so we are
// not at the mercy of hand-calculation typos.

// Israeli IBANs (AG-92 canonical vectors, MOD-97 valid):
const VALID_IL_IBANS = [
  'IL050108000000123456789', // Leumi (10)
  'IL580125353456789012345', // Mizrahi Tefahot (12) — per AG-92
  'IL190311230000456789012', // Hapoalim (31)
  'IL980541000000000012345', // Jerusalem (54)
];
// NB: These must pass MOD-97. The AG-92 test suite already asserts
// they do; any drift will be caught by DQ.2.valid-vectors below.

// Israeli VAT/Osek — known-good examples.
// Algorithm: digits weighted 1,2,1,2,...; sum mod 10 === 0.
// Known published Osek numbers used for documentation (fictitious
// but checksum-valid). We reuse what AG-94 ships:
//   "123456782" → sum must be 0 mod 10. We'll compute dynamically.

// ----------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------

function computeIsraeliIdChecksum(first8: string): string {
  // Returns the 9th digit that makes `first8 + digit` valid.
  let sum = 0;
  for (let i = 0; i < 8; i++) {
    let d = first8.charCodeAt(i) - 48;
    d *= (i % 2) + 1;
    if (d >= 10) d = Math.floor(d / 10) + (d % 10);
    sum += d;
  }
  return String((10 - (sum % 10)) % 10);
}

function makeIsraeliId(first8: string): string {
  return first8 + computeIsraeliIdChecksum(first8);
}

function computeIsraeliVatChecksum(first8: string): string {
  let sum = 0;
  for (let i = 0; i < 8; i++) {
    let d = first8.charCodeAt(i) - 48;
    const w = (i % 2) + 1;
    d *= w;
    if (d > 9) d -= 9;
    sum += d;
  }
  return String((10 - (sum % 10)) % 10);
}

function makeIsraeliVat(first8: string): string {
  return first8 + computeIsraeliVatChecksum(first8);
}

// ----------------------------------------------------------------------
// DQ.1  Israeli ID validator
// ----------------------------------------------------------------------

test('DQ.1.1 valid 9-digit Israeli ID passes', () => {
  const id = makeIsraeliId('12345678');
  assert.equal(id.length, 9);
  assert.equal(isValidIsraeliId(id), true);
});

test('DQ.1.2 short ID is left-padded then validated', () => {
  // A valid 9-digit where leading digit is 0 — caller passes 8 digits.
  const full = makeIsraeliId('00000001');
  // Strip the leading zeros — left-padding should reconstruct the same checksum.
  const trimmed = String(Number(full)); // e.g. "17"
  assert.equal(isValidIsraeliId(trimmed), true);
});

test('DQ.1.3 bad checksum rejected', () => {
  const id = makeIsraeliId('12345678');
  // Bump the last digit to force a bad checksum.
  const bad = id.slice(0, 8) + String((Number(id[8]) + 1) % 10);
  assert.equal(isValidIsraeliId(bad), false);
});

test('DQ.1.4 non-numeric / null / empty rejected', () => {
  assert.equal(isValidIsraeliId('abcdefghi'), false);
  assert.equal(isValidIsraeliId(null), false);
  assert.equal(isValidIsraeliId(undefined), false);
  assert.equal(isValidIsraeliId(''), false);
  assert.equal(isValidIsraeliId('   '), false);
  assert.equal(isValidIsraeliId('123-45-6789'), false);
  assert.equal(isValidIsraeliId('1234567890'), false); // too long
  assert.equal(isValidIsraeliId('000000000'), false); // trivial
});

// ----------------------------------------------------------------------
// DQ.2  Israeli IBAN validator
// ----------------------------------------------------------------------

test('DQ.2.1 all AG-92 canonical IL IBANs pass', () => {
  for (const iban of VALID_IL_IBANS) {
    const r = validateIsraeliIban(iban);
    assert.equal(r.valid, true, `expected ${iban} to pass MOD-97, got ${r.reason}`);
    assert.equal(r.knownBank, true, `expected bank for ${iban} to be in registry`);
  }
});

test('DQ.2.2 wrong length / bad format rejected', () => {
  assert.equal(isValidIsraeliIban('IL05010800000012345678'), false); // 22 chars
  assert.equal(isValidIsraeliIban('IL0501080000001234567890'), false); // 24 chars
  assert.equal(isValidIsraeliIban('XX050108000000123456789'), false); // wrong country
  assert.equal(isValidIsraeliIban('IL05!@#$%^&*()'), false);
  assert.equal(isValidIsraeliIban(12345), false);
  assert.equal(isValidIsraeliIban(null), false);
});

function computeIbanCheckDigits(country: string, bban: string): string {
  // ISO 13616: rearrange as BBAN + country + "00", letters → digits,
  // check = 98 - (numeric mod 97).
  const rearranged = bban + country + '00';
  let numeric = '';
  for (let i = 0; i < rearranged.length; i++) {
    const c = rearranged.charCodeAt(i);
    if (c >= 48 && c <= 57) numeric += rearranged[i];
    else numeric += String(c - 55);
  }
  let mod = 0;
  for (let i = 0; i < numeric.length; i += 7) {
    mod = Number(String(mod) + numeric.slice(i, i + 7)) % 97;
  }
  const check = 98 - mod;
  return String(check).padStart(2, '0');
}

test('DQ.2.3 IL IBAN with unknown bank code reported via accuracy dimension', () => {
  // IL IBAN is exactly 23 chars: country(2) + check(2) + BBAN(19),
  // where BBAN = bank(3) + branch(3) + account(13). Bank "070" is
  // NOT in the frozen ISRAELI_BANKS registry, so a MOD-97-valid
  // IBAN with that prefix should surface as an *accuracy* issue,
  // not a validity issue.
  const bban = '0707000001234567890'; // len 19, bank=070, branch=700
  const check = computeIbanCheckDigits('IL', bban);
  const iban = 'IL' + check + bban;
  assert.equal(iban.length, 23);
  const r = validateIsraeliIban(iban);
  assert.equal(r.valid, true, `computed IBAN ${iban} should pass MOD-97`);
  assert.equal(r.knownBank, false, 'bank code 70 should not be in registry');
});

// ----------------------------------------------------------------------
// DQ.3  Israeli VAT/Osek validator
// ----------------------------------------------------------------------

test('DQ.3.1 valid 9-digit Osek number passes', () => {
  const vat = makeIsraeliVat('12345678');
  assert.equal(vat.length, 9);
  assert.equal(isValidIsraeliVat(vat), true);
});

test('DQ.3.2 bad length / bad checksum rejected', () => {
  assert.equal(isValidIsraeliVat('12345678'), false); // 8 digits
  assert.equal(isValidIsraeliVat('1234567890'), false); // 10 digits
  assert.equal(isValidIsraeliVat('123456789'), false); // bad checksum
  assert.equal(isValidIsraeliVat('abcdefghi'), false);
  assert.equal(isValidIsraeliVat(null), false);
  assert.equal(isValidIsraeliVat('000000000'), false);
});

// ----------------------------------------------------------------------
// DQ.4  Hebrew-only text predicate
// ----------------------------------------------------------------------

test('DQ.4.1 pure Hebrew passes, Latin rejected', () => {
  assert.equal(isHebrewOnlyText('שלום עולם'), true);
  assert.equal(isHebrewOnlyText('כובי אל'), true);
  assert.equal(isHebrewOnlyText('שלום 2026'), true); // digits ok
  assert.equal(isHebrewOnlyText('אבג-דה'), true); // hyphen ok
  assert.equal(isHebrewOnlyText('Hello'), false); // no Hebrew
  assert.equal(isHebrewOnlyText('שלוםHello'), false); // mixed ⇒ fail
  assert.equal(isHebrewOnlyText(''), false);
  assert.equal(isHebrewOnlyText('12345'), false); // no Hebrew chars
  assert.equal(isHebrewOnlyText(null), false);
});

// ----------------------------------------------------------------------
// DQ.5  Israeli phone validator
// ----------------------------------------------------------------------

test('DQ.5.1 E.164 +972 mobile/landline forms pass', () => {
  assert.equal(isValidIsraeliPhone('+972501234567'), true); // mobile
  assert.equal(isValidIsraeliPhone('+972521234567'), true);
  assert.equal(isValidIsraeliPhone('+97221234567'), true); // Jerusalem landline
  assert.equal(isValidIsraeliPhone('+97231234567'), true); // TLV landline
  assert.equal(isValidIsraeliPhone('+972 50-123-4567'), true); // separators
});

test('DQ.5.2 local 0-prefixed form also accepted', () => {
  assert.equal(isValidIsraeliPhone('0501234567'), true);
  assert.equal(isValidIsraeliPhone('03-123-4567'), true);
  assert.equal(isValidIsraeliPhone('02 123 4567'), true);
});

test('DQ.5.3 unassigned trunk digits and garbage rejected', () => {
  assert.equal(isValidIsraeliPhone('+97260000000'), false); // trunk "6"
  assert.equal(isValidIsraeliPhone('+972061234567'), false); // trunk "0"
  assert.equal(isValidIsraeliPhone('972501234567'), false); // missing +
  assert.equal(isValidIsraeliPhone('+1234567890'), false); // not IL
  assert.equal(isValidIsraeliPhone('hello'), false);
  assert.equal(isValidIsraeliPhone(null), false);
});

// ----------------------------------------------------------------------
// DQ.6  Email & ISO-8601 predicates
// ----------------------------------------------------------------------

test('DQ.6.1 email predicate sanity', () => {
  assert.equal(isValidEmail('kobi@example.co.il'), true);
  assert.equal(isValidEmail('kobi+onyx@example.com'), true);
  assert.equal(isValidEmail('no-at-sign'), false);
  assert.equal(isValidEmail('two@@at'), false);
  assert.equal(isValidEmail(''), false);
  assert.equal(isValidEmail(null), false);
});

test('DQ.6.2 ISO-8601 predicate accepts date and timestamp forms', () => {
  assert.equal(isValidIso8601('2026-04-11'), true);
  assert.equal(isValidIso8601('2026-04-11T10:00:00Z'), true);
  assert.equal(isValidIso8601('2026-04-11T10:00:00.123+03:00'), true);
  assert.equal(isValidIso8601(new Date()), true);
  assert.equal(isValidIso8601('11/04/2026'), false);
  assert.equal(isValidIso8601('not a date'), false);
  assert.equal(isValidIso8601(null), false);
});

// ----------------------------------------------------------------------
// DQ.7  Scorer — end-to-end dimension coverage
// ----------------------------------------------------------------------

function makeSchema(): DatasetSchema {
  return {
    name: 'Employees',
    name_he: 'עובדים',
    fields: [
      { name: 'id', type: 'israeli_id', required: true, unique: true },
      { name: 'name_he', type: 'hebrew_text', required: true },
      { name: 'email', type: 'email', required: true },
      { name: 'phone', type: 'phone_il' },
      { name: 'iban', type: 'iban_il', required: true },
      { name: 'vat', type: 'vat_il' },
      {
        name: 'role',
        type: 'string',
        required: true,
        enum: ['engineer', 'manager', 'accountant'] as const,
      },
      { name: 'salary', type: 'number', min: 5000, max: 100000 },
      { name: 'updated', type: 'date', freshnessDays: 30 },
    ],
    consistency: [
      {
        id: 'start-before-end',
        check: (r) => {
          const s = r['start_date'];
          const e = r['end_date'];
          if (typeof s !== 'string' || typeof e !== 'string') return true;
          return new Date(s).getTime() <= new Date(e).getTime();
        },
        message: 'start_date must be ≤ end_date',
        message_he: 'תאריך התחלה חייב להיות ≤ תאריך סיום',
      },
    ],
  };
}

test('DQ.7.1 clean dataset scores 100 / grade A', () => {
  const schema = makeSchema();
  const goodId1 = makeIsraeliId('11111111');
  const goodId2 = makeIsraeliId('22222222');
  const goodVat = makeIsraeliVat('87654321');
  const now = new Date('2026-04-11T12:00:00Z');
  const rows = [
    {
      id: goodId1,
      name_he: 'דנה כהן',
      email: 'dana@example.co.il',
      phone: '+972501234567',
      iban: VALID_IL_IBANS[0],
      vat: goodVat,
      role: 'engineer',
      salary: 25000,
      updated: '2026-04-01',
      start_date: '2020-01-01',
      end_date: '2026-04-11',
    },
    {
      id: goodId2,
      name_he: 'משה לוי',
      email: 'moshe@example.co.il',
      phone: '+97231234567',
      iban: VALID_IL_IBANS[1],
      vat: goodVat,
      role: 'manager',
      salary: 40000,
      updated: '2026-04-05',
      start_date: '2019-06-01',
      end_date: '2025-12-31',
    },
  ];
  const scorer = new DataQualityScorer({ now });
  const report = scorer.scoreDataset(rows, schema);
  assert.equal(report.rowCount, 2);
  assert.equal(report.fieldCount, 9);
  assert.equal(report.overallScore, 100);
  assert.equal(report.grade, 'A');
  assert.equal(report.issues.length, 0);
  assert.equal(report.dimensions.completeness.score, 100);
  assert.equal(report.dimensions.validity.score, 100);
});

test('DQ.7.2 dirty dataset surfaces each dimension', () => {
  const schema = makeSchema();
  const goodId = makeIsraeliId('11111111');
  const goodVat = makeIsraeliVat('87654321');
  const now = new Date('2026-04-11T12:00:00Z');
  const rows = [
    // Row 0: completely clean baseline
    {
      id: goodId,
      name_he: 'טובה טוב',
      email: 'tova@example.co.il',
      phone: '+972501234567',
      iban: VALID_IL_IBANS[0],
      vat: goodVat,
      role: 'engineer',
      salary: 12000,
      updated: '2026-04-10',
      start_date: '2020-01-01',
      end_date: '2026-04-11',
    },
    // Row 1: missing required (completeness), bad phone (validity),
    //        stale updated (timeliness), bad role enum (accuracy),
    //        DUPLICATE id (uniqueness), Latin in name_he (validity),
    //        salary below min (validity), consistency violation.
    {
      id: goodId, // duplicate ⇒ uniqueness hit
      name_he: 'Hello', // Latin ⇒ hebrew_text validity hit
      email: '', // empty required ⇒ completeness hit
      phone: '1234', // validity hit
      iban: VALID_IL_IBANS[2],
      vat: goodVat,
      role: 'ceo', // not in enum ⇒ accuracy hit
      salary: 500, // below min ⇒ validity hit
      updated: '2020-01-01', // stale ⇒ timeliness hit
      start_date: '2025-01-01',
      end_date: '2020-01-01', // consistency hit
    },
  ];
  const scorer = new DataQualityScorer({ now });
  const report = scorer.scoreDataset(rows, schema);

  // At least one hit in every tracked dimension.
  assert.ok(report.dimensions.completeness.failed >= 1, 'completeness');
  assert.ok(report.dimensions.uniqueness.failed >= 1, 'uniqueness');
  assert.ok(report.dimensions.validity.failed >= 1, 'validity');
  assert.ok(report.dimensions.consistency.failed >= 1, 'consistency');
  assert.ok(report.dimensions.timeliness.failed >= 1, 'timeliness');
  assert.ok(report.dimensions.accuracy.failed >= 1, 'accuracy');

  // Issues are bilingual & carry stable codes.
  const codes = new Set(report.issues.map((i) => i.code));
  assert.ok(codes.has('missing_required'));
  assert.ok(codes.has('duplicate_value'));
  assert.ok(codes.has('not_in_enum'));
  assert.ok([...codes].some((c) => c.startsWith('consistency:')));
  assert.ok([...codes].some((c) => c === 'stale_record' || c === 'timeliness_unparseable'));

  // Every issue carries both languages
  for (const iss of report.issues) {
    assert.equal(typeof iss.message, 'string');
    assert.equal(typeof iss.message_he, 'string');
    assert.ok(iss.message.length > 0);
    assert.ok(iss.message_he.length > 0);
  }

  // Overall should no longer be 100 / A
  assert.ok(report.overallScore < 100);
  assert.notEqual(report.grade, 'A');
});

test('DQ.7.3 empty rows ⇒ every dimension defaults to 100', () => {
  const scorer = new DataQualityScorer();
  const report = scorer.scoreDataset([], { fields: [{ name: 'id', type: 'string' }] });
  assert.equal(report.rowCount, 0);
  assert.equal(report.overallScore, 100);
  assert.equal(report.grade, 'A');
});

test('DQ.7.4 maxIssues cap truncates and reports the truncation', () => {
  // 20 rows all missing the same required field → 20 completeness issues
  const scorer = new DataQualityScorer({ maxIssues: 5 });
  const rows = Array.from({ length: 20 }, () => ({}));
  const report = scorer.scoreDataset(rows, {
    fields: [{ name: 'email', type: 'email', required: true }],
  });
  assert.equal(report.issues.length, 5);
  assert.equal(report.issuesTruncated, 15);
  // Dimension counts should reflect ALL rows, not the cap.
  assert.equal(report.dimensions.completeness.checked, 20);
  assert.equal(report.dimensions.completeness.failed, 20);
});

// ----------------------------------------------------------------------
// DQ.8  Grade ladder
// ----------------------------------------------------------------------

test('DQ.8.1 grade ladder maps scores as expected', () => {
  const cases: { score: number; expected: 'A' | 'B' | 'C' | 'D' | 'F' }[] = [
    { score: 100, expected: 'A' },
    { score: 90, expected: 'A' },
    { score: 89.99, expected: 'B' },
    { score: 80, expected: 'B' },
    { score: 75, expected: 'C' },
    { score: 65, expected: 'D' },
    { score: 59, expected: 'F' },
    { score: 0, expected: 'F' },
  ];
  for (const c of cases) {
    // Simulate a dataset whose only dimension is completeness at
    // `score` %. Build it from failing vs passing row counts.
    // Use 100 rows; failing = 100 - score.
    const total = 100;
    const rows: { e: string | undefined }[] = [];
    const failing = total - c.score;
    for (let i = 0; i < failing; i++) rows.push({ e: undefined });
    for (let i = 0; i < c.score; i++) rows.push({ e: 'ok@example.com' });
    const scorer = new DataQualityScorer({
      weights: {
        completeness: 1,
        uniqueness: 0,
        validity: 0,
        consistency: 0,
        timeliness: 0,
        accuracy: 0,
      },
    });
    const report = scorer.scoreDataset(rows, {
      fields: [{ name: 'e', type: 'email', required: true }],
    });
    assert.equal(
      report.grade,
      c.expected,
      `score=${c.score} → got ${report.grade} expected ${c.expected}`,
    );
  }
});

// ----------------------------------------------------------------------
// DQ.9  Bilingual output
// ----------------------------------------------------------------------

test('DQ.9.1 summary arrays are bilingual & parallel', () => {
  const scorer = new DataQualityScorer();
  const report = scorer.scoreDataset([], { fields: [] });
  assert.equal(report.summary.length, 6);
  assert.equal(report.summary_he.length, 6);
  // Hebrew summary must contain at least one Hebrew code-point per line.
  for (const line of report.summary_he) {
    assert.match(line, /[\u0590-\u05FF]/);
  }
  // English summary lines must not contain Hebrew.
  for (const line of report.summary) {
    assert.doesNotMatch(line, /[\u0590-\u05FF]/);
  }
});

test('DQ.9.2 dataset name is passed through in both languages', () => {
  const scorer = new DataQualityScorer();
  const report = scorer.scoreDataset([], {
    name: 'Customers',
    name_he: 'לקוחות',
    fields: [],
  });
  assert.equal(report.datasetName, 'Customers');
  assert.equal(report.datasetName_he, 'לקוחות');
});

// ----------------------------------------------------------------------
// DQ.10  Never-delete / freeze guarantees
// ----------------------------------------------------------------------

test('DQ.10.1 exported tables are frozen', () => {
  assert.ok(Object.isFrozen(DEFAULT_WEIGHTS));
  assert.ok(Object.isFrozen(DIMENSION_LABELS));
  assert.ok(Object.isFrozen(GRADE_LADDER));
  assert.ok(Object.isFrozen(ISRAELI_BANKS));
  // Nested freezes
  assert.ok(Object.isFrozen(DIMENSION_LABELS.completeness));
  assert.ok(Object.isFrozen(ISRAELI_BANKS['10']));
});

test('DQ.10.2 strict-mode delete on frozen table throws', () => {
  'use strict';
  assert.throws(() => {
    delete (DEFAULT_WEIGHTS as Record<string, number>).validity;
  });
  assert.throws(() => {
    delete (ISRAELI_BANKS as Record<string, unknown>)['10'];
  });
  // Confirm the entries still exist post-attempt.
  assert.equal(typeof DEFAULT_WEIGHTS.validity, 'number');
  assert.ok(ISRAELI_BANKS['10']);
});

test('DQ.10.3 custom weights are normalised but defaults unchanged', () => {
  const before = DEFAULT_WEIGHTS.validity;
  const scorer = new DataQualityScorer({
    weights: { validity: 10, completeness: 0, uniqueness: 0, consistency: 0, timeliness: 0, accuracy: 0 },
  });
  // Scorer should still produce a valid report — weights normalise to sum=1.
  const report = scorer.scoreDataset([], { fields: [] });
  assert.equal(report.overallScore, 100);
  // And the frozen default is untouched.
  assert.equal(DEFAULT_WEIGHTS.validity, before);
});
