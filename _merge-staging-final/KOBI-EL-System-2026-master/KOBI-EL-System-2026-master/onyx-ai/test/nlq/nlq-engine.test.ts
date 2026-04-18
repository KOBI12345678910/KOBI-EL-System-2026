/**
 * ONYX AI — NLQ Engine Tests (Agent Y-151)
 * ------------------------------------------------------------
 * Deterministic, zero-dependency tests for the NLQ engine.
 * Uses only Node's built-in `node:test` runner — no mocha, no
 * jest, no chai.
 *
 * Run with:
 *   npx node --test --require ts-node/register test/nlq/nlq-engine.test.ts
 *
 * Test strategy:
 *   - `FIXED_NOW` pins the current date to 2026-04-11 (Saturday)
 *     so every time-range computation is reproducible regardless
 *     of when the suite runs.
 *   - Every test checks either the parsed QueryIntent shape or
 *     one of the pure helpers (`tokenize`, `parseHebrewNumber`,
 *     etc.).
 *   - No filesystem, no network, no timers.
 */

import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import {
  parseQuery,
  tokenize,
  normalizeText,
  stripHebrewPrefix,
  classifyIntent,
  extractTimeRange,
  extractTopN,
  parseHebrewNumber,
  detectLanguage,
} from '../../src/nlq/nlq-engine';

// 2026-04-11 is a Saturday (weekday 6). The ISO week containing
// this date starts on Monday 2026-04-06 and ends Sunday 2026-04-12.
const FIXED_NOW = new Date(Date.UTC(2026, 3, 11));

// ------------------------------------------------------------
// 1. Tokenizer & normalization
// ------------------------------------------------------------

test('normalizeText strips punctuation and final-form Hebrew letters', () => {
  const n = normalizeText('שלום, עולם!  TeStING.');
  assert.ok(n.includes('שלומ') || n.includes('שלום'));
  // Final mem must be converted to regular mem
  assert.equal(n.includes('ם'), false);
  assert.ok(n.includes('testing'));
});

test('stripHebrewPrefix removes inseparable prefixes but keeps short words', () => {
  assert.equal(stripHebrewPrefix('בחודש'), 'חודש');
  assert.equal(stripHebrewPrefix('לספק'), 'ספק');
  assert.equal(stripHebrewPrefix('מהמחסן'), 'המחסן'); // only first char stripped
  assert.equal(stripHebrewPrefix('ושבוע'), 'שבוע');
  // Short words (<3 chars) are NOT touched
  assert.equal(stripHebrewPrefix('של'), 'של');
  // Non-Hebrew pass through untouched
  assert.equal(stripHebrewPrefix('supplier'), 'supplier');
});

test('tokenize drops stopwords in Hebrew and English', () => {
  const tokens = tokenize('מה המגמה של ההזמנות השבוע');
  assert.ok(tokens.length >= 3);
  assert.equal(tokens.includes('של'), false);
  assert.ok(tokens.some((t) => t.includes('הזמנ') || t === 'הזמנות'));
});

test('tokenize handles mixed Hebrew/English input', () => {
  const tokens = tokenize('Top 5 הכי יקרים customer');
  assert.ok(tokens.includes('top'));
  assert.ok(tokens.includes('5'));
  assert.ok(tokens.includes('customer'));
});

// ------------------------------------------------------------
// 2. Hebrew number parser
// ------------------------------------------------------------

test('parseHebrewNumber handles digits and Hebrew words', () => {
  assert.equal(parseHebrewNumber('42'), 42);
  assert.equal(parseHebrewNumber('שלושה'), 3);
  assert.equal(parseHebrewNumber('חמישים'), 50);
  assert.equal(parseHebrewNumber('עשרה'), 10);
  assert.equal(parseHebrewNumber('אלף'), 1000);
  // Additive: "חמישים ושלושה" → 50 + 3 = 53
  assert.equal(parseHebrewNumber('חמישים ושלושה'), 53);
  // Unknown word → NaN
  assert.ok(Number.isNaN(parseHebrewNumber('כלום')));
});

// ------------------------------------------------------------
// 3. Language detection
// ------------------------------------------------------------

test('detectLanguage recognises he / en / mixed', () => {
  assert.equal(detectLanguage('שלום עולם'), 'he');
  assert.equal(detectLanguage('hello world'), 'en');
  assert.equal(detectLanguage('Top 5 הכי יקרים'), 'mixed');
});

// ------------------------------------------------------------
// 4. Intent classification — aggregate
// ------------------------------------------------------------

test('aggregate intent in Hebrew: "כמה הזמנות יש השנה"', () => {
  const q = parseQuery('כמה הזמנות יש השנה', { now: FIXED_NOW });
  assert.equal(q.intent, 'aggregate');
  assert.equal(q.entity, 'orders');
  assert.equal(q.aggregation, 'count');
  assert.ok(q.timeRange);
  assert.equal(q.timeRange!.start, '2026-01-01');
  assert.equal(q.timeRange!.end, '2026-12-31');
  assert.ok(q.confidence > 0.3);
});

test('aggregate intent in Hebrew: "מה סך החשבוניות"', () => {
  const q = parseQuery('מה סך החשבוניות', { now: FIXED_NOW });
  assert.equal(q.intent, 'aggregate');
  assert.equal(q.entity, 'invoices');
  assert.equal(q.aggregation, 'sum');
});

test('aggregate intent in Hebrew: "ממוצע התשלומים לספקים"', () => {
  const q = parseQuery('ממוצע התשלומים לספקים', { now: FIXED_NOW });
  assert.equal(q.intent, 'aggregate');
  assert.equal(q.aggregation, 'avg');
  // Either payments or suppliers is acceptable — payments is stronger
  assert.ok(q.entity === 'payments' || q.entity === 'suppliers');
});

test('aggregate intent in English: "how many invoices last month"', () => {
  const q = parseQuery('how many invoices last month', { now: FIXED_NOW });
  assert.equal(q.intent, 'aggregate');
  assert.equal(q.entity, 'invoices');
  assert.equal(q.aggregation, 'count');
  assert.ok(q.timeRange);
  assert.equal(q.timeRange!.start, '2026-03-01');
  assert.equal(q.timeRange!.end, '2026-03-31');
});

test('aggregate intent in English: "total sum of orders this year"', () => {
  const q = parseQuery('total sum of orders this year', { now: FIXED_NOW });
  assert.equal(q.intent, 'aggregate');
  assert.equal(q.entity, 'orders');
  assert.equal(q.aggregation, 'sum');
  assert.ok(q.timeRange);
  assert.equal(q.timeRange!.start, '2026-01-01');
});

// ------------------------------------------------------------
// 5. Time-range extraction
// ------------------------------------------------------------

test('time-range: "אתמול" resolves to 2026-04-10', () => {
  const q = parseQuery('הצג לי הזמנות אתמול', { now: FIXED_NOW });
  assert.ok(q.timeRange);
  assert.equal(q.timeRange!.start, '2026-04-10');
  assert.equal(q.timeRange!.end, '2026-04-10');
  assert.equal(q.timeRange!.label, 'yesterday');
});

test('time-range: "השבוע" picks the Mon-Sun containing the pinned date', () => {
  const q = parseQuery('כמה חשבוניות השבוע', { now: FIXED_NOW });
  assert.ok(q.timeRange);
  // Week containing Sat 2026-04-11 = Mon 2026-04-06 .. Sun 2026-04-12
  assert.equal(q.timeRange!.start, '2026-04-06');
  assert.equal(q.timeRange!.end, '2026-04-12');
});

test('time-range: "השנה שעברה" resolves to full year 2025', () => {
  const q = parseQuery('מה היה סך ההזמנות השנה שעברה', { now: FIXED_NOW });
  assert.ok(q.timeRange);
  assert.equal(q.timeRange!.start, '2025-01-01');
  assert.equal(q.timeRange!.end, '2025-12-31');
  assert.equal(q.timeRange!.label, '2025');
});

test('time-range: "Q1 2026" resolves to Jan 1 - Mar 31 2026', () => {
  const q = parseQuery('show me revenue for Q1 2026', { now: FIXED_NOW });
  assert.ok(q.timeRange);
  assert.equal(q.timeRange!.start, '2026-01-01');
  assert.equal(q.timeRange!.end, '2026-03-31');
  assert.equal(q.timeRange!.label, 'Q1 2026');
});

test('time-range: "יולי" resolves to full month of the current year', () => {
  const q = parseQuery('חשבוניות של יולי', { now: FIXED_NOW });
  assert.ok(q.timeRange);
  assert.equal(q.timeRange!.start, '2026-07-01');
  assert.equal(q.timeRange!.end, '2026-07-31');
});

test('time-range helper directly — extractTimeRange with bare year', () => {
  const tr = extractTimeRange('report for 2024', ['report', 'for', '2024'], FIXED_NOW);
  assert.ok(tr);
  assert.equal(tr!.start, '2024-01-01');
  assert.equal(tr!.end, '2024-12-31');
});

// ------------------------------------------------------------
// 6. Top-N ranking
// ------------------------------------------------------------

test('top-N Hebrew: "הספקים הכי יקרים" defaults to top-10', () => {
  const q = parseQuery('הספקים הכי יקרים', { now: FIXED_NOW });
  assert.equal(q.intent, 'top_n');
  assert.equal(q.entity, 'suppliers');
  assert.equal(q.topN, 10);
});

test('top-N English: "top 5 customers" returns N=5', () => {
  const q = parseQuery('top 5 customers by revenue', { now: FIXED_NOW });
  assert.equal(q.intent, 'top_n');
  assert.equal(q.entity, 'customers');
  assert.equal(q.topN, 5);
});

test('extractTopN helper handles digit prefix', () => {
  const n = extractTopN('10 הכי גדולים', ['10', 'הכי', 'גדולים']);
  assert.equal(n, 10);
});

// ------------------------------------------------------------
// 7. Comparison intent
// ------------------------------------------------------------

test('comparison intent: "השווה בין יולי לאוגוסט"', () => {
  const q = parseQuery('השווה בין יולי לאוגוסט', { now: FIXED_NOW });
  assert.equal(q.intent, 'compare');
  assert.ok(q.confidence > 0.3);
});

test('comparison intent: "compare Q1 vs Q2"', () => {
  const q = parseQuery('compare revenue Q1 vs Q2', { now: FIXED_NOW });
  assert.equal(q.intent, 'compare');
});

// ------------------------------------------------------------
// 8. Trend intent
// ------------------------------------------------------------

test('trend intent: "מה המגמה של המכירות"', () => {
  const q = parseQuery('מה המגמה של המכירות', { now: FIXED_NOW });
  assert.equal(q.intent, 'trend');
});

test('trend intent: "inventory trend over time"', () => {
  const q = parseQuery('inventory trend over time', { now: FIXED_NOW });
  assert.equal(q.intent, 'trend');
  assert.equal(q.entity, 'inventory');
});

// ------------------------------------------------------------
// 9. Party filter extraction
// ------------------------------------------------------------

test('party filter: "supplier acme" is captured', () => {
  const q = parseQuery('show invoices from supplier acme this year', { now: FIXED_NOW });
  assert.equal(q.entity, 'invoices');
  const supplierFilter = q.filters.parties.find((p) => p.role === 'supplier');
  assert.ok(supplierFilter);
  assert.equal(supplierFilter!.name, 'acme');
});

test('party filter: Hebrew "ספק חשמלאי" is captured', () => {
  const q = parseQuery('הזמנות מספק חשמלאי', { now: FIXED_NOW });
  assert.equal(q.entity, 'orders');
  const found = q.filters.parties.find((p) => p.role === 'supplier');
  assert.ok(found);
});

// ------------------------------------------------------------
// 10. Numeric filter extraction
// ------------------------------------------------------------

test('numeric filter: "מעל 1000" becomes amount > 1000', () => {
  const q = parseQuery('הזמנות מעל 1000 שקל', { now: FIXED_NOW });
  assert.ok(q.filters.numeric.length >= 1);
  const f = q.filters.numeric[0];
  assert.equal(f.op, '>');
  assert.equal(f.value, 1000);
});

test('numeric filter: "above 500" in English', () => {
  const q = parseQuery('invoices above 500', { now: FIXED_NOW });
  assert.ok(q.filters.numeric.length >= 1);
  const f = q.filters.numeric[0];
  assert.equal(f.op, '>');
  assert.equal(f.value, 500);
});

// ------------------------------------------------------------
// 11. Entity classification edge cases
// ------------------------------------------------------------

test('entity classification: inventory', () => {
  const q = parseQuery('כמה פריטים במלאי', { now: FIXED_NOW });
  assert.equal(q.entity, 'inventory');
  assert.equal(q.aggregation, 'count');
});

test('entity classification: employees', () => {
  const q = parseQuery('total payroll this month', { now: FIXED_NOW });
  assert.equal(q.entity, 'employees');
  assert.equal(q.aggregation, 'sum');
});

// ------------------------------------------------------------
// 12. Confidence and unknown handling
// ------------------------------------------------------------

test('unknown query has low confidence and unknown entity', () => {
  const q = parseQuery('??? ??? ???', { now: FIXED_NOW });
  assert.equal(q.intent, 'unknown');
  assert.equal(q.entity, 'unknown');
  assert.ok(q.confidence < 0.2);
});

test('deterministic output: same input produces structurally equal result', () => {
  const a = parseQuery('כמה הזמנות השבוע', { now: FIXED_NOW });
  const b = parseQuery('כמה הזמנות השבוע', { now: FIXED_NOW });
  assert.deepEqual(
    {
      intent: a.intent,
      entity: a.entity,
      aggregation: a.aggregation,
      timeRange: a.timeRange,
      topN: a.topN,
    },
    {
      intent: b.intent,
      entity: b.entity,
      aggregation: b.aggregation,
      timeRange: b.timeRange,
      topN: b.topN,
    },
  );
});

// ------------------------------------------------------------
// 13. Classifier direct access
// ------------------------------------------------------------

test('classifyIntent returns scores for every intent kind', () => {
  const tokens = tokenize('כמה הזמנות היום');
  const normalized = normalizeText('כמה הזמנות היום');
  const c = classifyIntent(normalized, tokens);
  assert.ok(c.scores.aggregate > 0);
  assert.ok('trend' in c.scores);
  assert.ok('top_n' in c.scores);
});
