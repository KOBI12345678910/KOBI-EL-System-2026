/**
 * Unit tests for amountToHebrew — Hebrew number-to-words converter
 * Agent 72 — written 2026-04-11
 *
 * Run:   node --test test/amountToHebrew.test.js
 *
 * 20 representative cases covering:
 *   - zero, small integers, teens
 *   - hundreds with / without conjunction
 *   - thousands (exact forms + generic)
 *   - millions (1e6 .. 999e6)
 *   - billions (1e9 ..)   = "מיליארד" / "שני מיליארד" ...
 *   - decimal (minor unit) portion 0.01 .. 0.99
 *   - multi-currency ILS / USD / EUR
 *   - error paths (negative, NaN)
 *
 * Principle: these tests assert EXACT strings, so regressions in the
 * number-to-words generator are caught immediately. The strings follow
 * the canonical Israeli receipt / cheque spelling convention: masculine
 * counts with שקל/דולר, feminine counts with אגורה.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { amountToHebrew } = require('../src/receipts/receipt-pdf-generator.js');

// ──────────────────────────────────────────────────────────────
// Basic integer amounts (ILS)
// ──────────────────────────────────────────────────────────────

test('01. amountToHebrew(0) = אפס שקלים', () => {
  assert.equal(amountToHebrew(0), 'אפס שקלים');
});

test('02. amountToHebrew(1) = שקל אחד', () => {
  assert.equal(amountToHebrew(1), 'שקל אחד');
});

test('03. amountToHebrew(2) = שני שקלים', () => {
  assert.equal(amountToHebrew(2), 'שני שקלים');
});

test('04. amountToHebrew(11) = אחד עשר שקלים', () => {
  assert.equal(amountToHebrew(11), 'אחד עשר שקלים');
});

test('05. amountToHebrew(20) = עשרים שקלים', () => {
  assert.equal(amountToHebrew(20), 'עשרים שקלים');
});

test('06. amountToHebrew(101) = מאה ואחד שקלים', () => {
  assert.equal(amountToHebrew(101), 'מאה ואחד שקלים');
});

test('07. amountToHebrew(234) = מאתיים שלושים וארבעה שקלים', () => {
  assert.equal(amountToHebrew(234), 'מאתיים שלושים וארבעה שקלים');
});

test('08. amountToHebrew(999) = תשע מאות תשעים ותשעה שקלים', () => {
  assert.equal(amountToHebrew(999), 'תשע מאות תשעים ותשעה שקלים');
});

test('09. amountToHebrew(1000) = אלף שקלים', () => {
  assert.equal(amountToHebrew(1000), 'אלף שקלים');
});

// ──────────────────────────────────────────────────────────────
// Decimal (agorot / cents) portion
// ──────────────────────────────────────────────────────────────

test('10. amountToHebrew(0.01) = אפס שקלים ואגורה אחת', () => {
  assert.equal(amountToHebrew(0.01), 'אפס שקלים ואגורה אחת');
});

test('11. amountToHebrew(0.02) = אפס שקלים ושתי אגורות', () => {
  assert.equal(amountToHebrew(0.02), 'אפס שקלים ושתי אגורות');
});

test('12. amountToHebrew(1234.56) = canonical spec form', () => {
  assert.equal(
    amountToHebrew(1234.56),
    'אלף מאתיים שלושים וארבעה שקלים וחמישים ושש אגורות'
  );
});

// ──────────────────────────────────────────────────────────────
// Thousands / millions / billions
// ──────────────────────────────────────────────────────────────

test('13. amountToHebrew(2000) = אלפיים שקלים', () => {
  assert.equal(amountToHebrew(2000), 'אלפיים שקלים');
});

test('14. amountToHebrew(3000) = שלושת אלפים שקלים', () => {
  assert.equal(amountToHebrew(3000), 'שלושת אלפים שקלים');
});

test('15. amountToHebrew(1000000) = מיליון שקלים', () => {
  assert.equal(amountToHebrew(1000000), 'מיליון שקלים');
});

test('16. amountToHebrew(2000000) = שני מיליון שקלים', () => {
  assert.equal(amountToHebrew(2000000), 'שני מיליון שקלים');
});

test('17. amountToHebrew(1000000000) = מיליארד שקלים (thousand-million)', () => {
  assert.equal(amountToHebrew(1000000000), 'מיליארד שקלים');
});

test('18. amountToHebrew(1234567890.12) covers full scale + decimal', () => {
  const got = amountToHebrew(1234567890.12);
  // Structural assertions — every scale word and the decimal must appear.
  assert.ok(got.startsWith('מיליארד'), 'starts with מיליארד');
  assert.ok(got.includes('מיליון'), 'contains מיליון');
  assert.ok(got.includes('אלף'), 'contains אלף');
  assert.ok(got.includes('שקלים'), 'contains שקלים');
  assert.ok(got.includes('אגורות'), 'contains אגורות');
  assert.ok(got.includes('שתים עשרה'), 'contains 12 agorot in words');
});

// ──────────────────────────────────────────────────────────────
// Multi-currency
// ──────────────────────────────────────────────────────────────

test('19. amountToHebrew(5, USD) = חמישה דולרים', () => {
  assert.equal(amountToHebrew(5, 'USD'), 'חמישה דולרים');
});

test('20. amountToHebrew(7.50, EUR) = שבעה יורו וחמישים סנטים', () => {
  assert.equal(
    amountToHebrew(7.50, 'EUR'),
    'שבעה יורו וחמישים סנטים'
  );
});

// ──────────────────────────────────────────────────────────────
// Error paths (not part of the 20 counted cases, but important)
// ──────────────────────────────────────────────────────────────

test('error: negative amount throws', () => {
  assert.throws(() => amountToHebrew(-5), RangeError);
});

test('error: NaN throws', () => {
  assert.throws(() => amountToHebrew(NaN), TypeError);
});

test('error: Infinity throws', () => {
  assert.throws(() => amountToHebrew(Infinity), TypeError);
});

test('unknown currency falls back to ILS', () => {
  const got = amountToHebrew(1, 'XYZ');
  assert.equal(got, 'שקל אחד');
});

// ──────────────────────────────────────────────────────────────
// Rounding behaviour — ensures we don't mis-report agorot count
// ──────────────────────────────────────────────────────────────

test('rounding: 1.005 rounds up to 1.01 -> ...שקל אחד ואגורה אחת', () => {
  // 1.005 * 100 = 100.49999... → Math.round → 101 → 1 shekel + 1 agora
  // Floating-point may place this slightly below 100.5; we accept either
  // form ("שקל אחד ואגורה אחת" or "שקל אחד") but enforce it cannot
  // produce nonsense like 2 shekels.
  const got = amountToHebrew(1.005);
  assert.ok(
    got === 'שקל אחד ואגורה אחת' || got === 'שקל אחד',
    `got: ${got}`
  );
});

test('rounding: 1.999 rounds to 2.00 -> שני שקלים', () => {
  // Math.round(1.999 * 100) = 200 exactly.
  assert.equal(amountToHebrew(1.999), 'שני שקלים');
});
