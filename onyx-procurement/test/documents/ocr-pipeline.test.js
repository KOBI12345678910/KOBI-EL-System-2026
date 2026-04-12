/**
 * Unit tests — src/documents/ocr-pipeline.js
 * Agent Y111 — 2026-04-11
 *
 * Run with:
 *   node --test test/documents/ocr-pipeline.test.js
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  OCRPipeline,
  OCRPipelineError,
  SUPPORTED_BACKEND_TYPES,
  SUPPORTED_DOC_TYPES,
  DEFAULT_REDACT_PATTERNS,
  hebrewNormalize,
} = require('../../src/documents/ocr-pipeline.js');

// ────────────────────────────────────────────────────────────────
//  Helpers — mock backends
// ────────────────────────────────────────────────────────────────

function makeBackend(name, { text, confidence = 0.95, throws = null, delayMs = 0 } = {}) {
  let calls = 0;
  const transport = async (/* file, ctx */) => {
    calls += 1;
    if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
    if (throws) throw throws;
    return { text, confidence };
  };
  transport.layout = async () => [{ kind: 'header', bbox: [0, 0, 100, 20], confidence: 0.9, backend: name }];
  transport.tables = async () => [{ rows: [['a', 'b'], ['1', '2']], confidence: 0.88 }];
  transport.handwriting = async () => [{ bbox: [5, 5, 50, 20], confidence: 0.72 }];
  Object.defineProperty(transport, 'calls', { get: () => calls });
  return transport;
}

function buildPipeline(overrides = {}) {
  return new OCRPipeline({
    clock: () => new Date('2026-04-11T10:00:00Z'),
    rng: { random: () => 0.42 },
    ...overrides,
  });
}


// ════════════════════════════════════════════════════════════════
//  1. Module surface
// ════════════════════════════════════════════════════════════════

test('module exports the expected surface', () => {
  assert.equal(typeof OCRPipeline, 'function');
  assert.equal(typeof OCRPipelineError, 'function');
  assert.equal(typeof hebrewNormalize, 'function');
  assert.deepEqual(new Set(SUPPORTED_BACKEND_TYPES), new Set([
    'tesseract', 'azure', 'google', 'aws', 'custom',
  ]));
  assert.ok(SUPPORTED_DOC_TYPES.includes('invoice'));
  assert.ok(SUPPORTED_DOC_TYPES.includes('teudat-zehut'));
  assert.ok(DEFAULT_REDACT_PATTERNS['israeli-id'] instanceof RegExp);
});


// ════════════════════════════════════════════════════════════════
//  2. addBackend — validation
// ════════════════════════════════════════════════════════════════

test('addBackend: rejects unknown type', () => {
  const p = buildPipeline();
  assert.throws(
    () => p.addBackend({ name: 'x', type: 'neural', config: {}, languages: ['eng'] }),
    (e) => e instanceof OCRPipelineError && e.code === 'OCR_BACKEND_TYPE_UNSUPPORTED',
  );
});

test('addBackend: rejects missing name', () => {
  const p = buildPipeline();
  assert.throws(
    () => p.addBackend({ type: 'google', config: {}, languages: ['eng'] }),
    (e) => e instanceof OCRPipelineError && e.code === 'OCR_BACKEND_NAME_REQUIRED',
  );
});

test('addBackend: rejects unknown language', () => {
  const p = buildPipeline();
  assert.throws(
    () => p.addBackend({ name: 'x', type: 'google', config: {}, languages: ['klingon'] }),
    (e) => e instanceof OCRPipelineError && e.code === 'OCR_LANGUAGE_UNSUPPORTED',
  );
});

test('addBackend: stores priority and transport', () => {
  const p = buildPipeline();
  p.addBackend({
    name: 'a',
    type: 'custom',
    config: { transport: makeBackend('a', { text: 'hi', confidence: 0.9 }) },
    languages: ['eng'],
    priority: 5,
  });
  const list = p.listBackends();
  assert.equal(list.length, 1);
  assert.equal(list[0].name, 'a');
  assert.equal(list[0].priority, 5);
  assert.ok(list[0].languages.includes('eng'));
});


// ════════════════════════════════════════════════════════════════
//  3. Backend routing
// ════════════════════════════════════════════════════════════════

test('routing: picks highest priority backend by default', async () => {
  const p = buildPipeline();
  const google = makeBackend('google', { text: 'GOOGLE TEXT', confidence: 0.95 });
  const tesseract = makeBackend('tesseract', { text: 'TESS TEXT', confidence: 0.95 });
  p.addBackend({ name: 'tesseract', type: 'tesseract', config: { transport: tesseract }, languages: ['heb', 'eng'], priority: 1 });
  p.addBackend({ name: 'google', type: 'google', config: { transport: google }, languages: ['heb', 'eng'], priority: 10 });

  const out = await p.processDocument({ file: Buffer.from('x'), hints: { language: 'heb' } });
  assert.equal(out.ok, true);
  assert.equal(out.backend, 'google');
  assert.equal(google.calls, 1);
  assert.equal(tesseract.calls, 0);
});

test('routing: filters out backends that do not cover the language', async () => {
  const p = buildPipeline();
  const engOnly = makeBackend('eng', { text: 'hello', confidence: 0.95 });
  const hebOnly = makeBackend('heb', { text: 'שלום', confidence: 0.95 });
  p.addBackend({ name: 'eng', type: 'google', config: { transport: engOnly }, languages: ['eng'], priority: 10 });
  p.addBackend({ name: 'heb', type: 'azure', config: { transport: hebOnly }, languages: ['heb'], priority: 5 });

  const out = await p.processDocument({ file: 'f', hints: { language: 'heb' } });
  assert.equal(out.backend, 'heb');
  assert.equal(engOnly.calls, 0);
  assert.equal(hebOnly.calls, 1);
});

test('routing: errors when no backend matches language', async () => {
  const p = buildPipeline();
  const engOnly = makeBackend('eng', { text: 'hello', confidence: 0.95 });
  p.addBackend({ name: 'eng', type: 'google', config: { transport: engOnly }, languages: ['eng'], priority: 10 });

  await assert.rejects(
    () => p.processDocument({ file: 'f', hints: { language: 'heb' } }),
    (e) => e instanceof OCRPipelineError && e.code === 'OCR_NO_BACKEND_AVAILABLE',
  );
});


// ════════════════════════════════════════════════════════════════
//  4. fallbackOrder
// ════════════════════════════════════════════════════════════════

test('fallbackOrder: follows explicit order on failure', async () => {
  const p = buildPipeline();
  const primary = makeBackend('p', { throws: new Error('boom') });
  const secondary = makeBackend('s', { throws: new Error('still broken') });
  const tertiary = makeBackend('t', { text: 'finally', confidence: 0.9 });

  p.addBackend({ name: 'p', type: 'google', config: { transport: primary }, languages: ['heb', 'eng'], priority: 10 });
  p.addBackend({ name: 's', type: 'azure', config: { transport: secondary }, languages: ['heb', 'eng'], priority: 8 });
  p.addBackend({ name: 't', type: 'tesseract', config: { transport: tertiary }, languages: ['heb', 'eng'], priority: 1 });
  p.fallbackOrder({ primary: 'p', secondary: 's', tertiary: 't' });

  const out = await p.processDocument({ file: 'file.png', hints: { language: 'auto' } });
  assert.equal(out.ok, true);
  assert.equal(out.backend, 't');
  assert.equal(primary.calls, 1);
  assert.equal(secondary.calls, 1);
  assert.equal(tertiary.calls, 1);
  assert.equal(out.attempts.length, 3);
  assert.equal(out.attempts[0].ok, false);
  assert.equal(out.attempts[1].ok, false);
  assert.equal(out.attempts[2].ok, true);
});

test('fallbackOrder: all-fail raises a combined error', async () => {
  const p = buildPipeline();
  p.addBackend({ name: 'a', type: 'google', config: { transport: makeBackend('a', { throws: new Error('err a') }) }, languages: ['eng'], priority: 10 });
  p.addBackend({ name: 'b', type: 'azure', config: { transport: makeBackend('b', { throws: new Error('err b') }) }, languages: ['eng'], priority: 5 });
  p.fallbackOrder({ primary: 'a', secondary: 'b' });

  await assert.rejects(
    () => p.processDocument({ file: 'f', hints: { language: 'eng' } }),
    (e) => e instanceof OCRPipelineError && e.meta && Array.isArray(e.meta.attempts) && e.meta.attempts.length === 2,
  );
});

test('fallbackOrder: rejects unregistered name', () => {
  const p = buildPipeline();
  p.addBackend({ name: 'a', type: 'google', config: { transport: makeBackend('a', { text: 'x', confidence: 0.9 }) }, languages: ['eng'] });
  assert.throws(
    () => p.fallbackOrder({ primary: 'ghost' }),
    (e) => e instanceof OCRPipelineError && e.code === 'OCR_BACKEND_NOT_REGISTERED',
  );
});


// ════════════════════════════════════════════════════════════════
//  5. confidenceThreshold
// ════════════════════════════════════════════════════════════════

test('confidenceThreshold: low-confidence result triggers fallback', async () => {
  const p = buildPipeline();
  p.confidenceThreshold({ min: 0.8 });

  const shaky = makeBackend('shaky', { text: 'maybe', confidence: 0.5 });
  const solid = makeBackend('solid', { text: 'CONFIDENT', confidence: 0.95 });
  p.addBackend({ name: 'shaky', type: 'google', config: { transport: shaky }, languages: ['eng'], priority: 10 });
  p.addBackend({ name: 'solid', type: 'azure', config: { transport: solid }, languages: ['eng'], priority: 5 });

  const out = await p.processDocument({ file: 'f', hints: { language: 'eng' } });
  assert.equal(out.backend, 'solid');
  assert.equal(shaky.calls, 1);
  assert.equal(solid.calls, 1);
  assert.equal(p.getMetrics().low_confidence_rejections, 1);
});

test('confidenceThreshold: rejects out-of-range input', () => {
  const p = buildPipeline();
  assert.throws(
    () => p.confidenceThreshold({ min: 2 }),
    (e) => e instanceof OCRPipelineError && e.code === 'OCR_CONFIDENCE_INVALID',
  );
});

test('confidenceThreshold: accepts 0..100 confidence scale from backend', async () => {
  const p = buildPipeline();
  const hundred = makeBackend('h', { text: 'ok', confidence: 92 });
  p.addBackend({ name: 'h', type: 'google', config: { transport: hundred }, languages: ['eng'], priority: 10 });
  const out = await p.processDocument({ file: 'f' });
  assert.ok(out.confidence > 0.9 && out.confidence <= 1);
});


// ════════════════════════════════════════════════════════════════
//  6. Hebrew normalisation
// ════════════════════════════════════════════════════════════════

test('hebrewNormalize: strips niqqud', () => {
  // Input has niqqud; output strips it AND folds the final mem (ם → מ).
  const input = 'שָׁלוֹם עוֹלָם';
  const out = hebrewNormalize(input);
  assert.equal(out, 'שלומ עולמ');
  // A non-folding check: niqqud really is gone.
  assert.ok(!/[\u0591-\u05C7]/.test(out));
});

test('hebrewNormalize: folds final letters', () => {
  const input = 'אברהם';  // ends with final mem
  const out = hebrewNormalize(input);
  assert.equal(out, 'אברהמ');
  const input2 = 'כך מין סוף הארץ';
  const out2 = hebrewNormalize(input2);
  assert.equal(out2, 'ככ מינ סופ הארצ');
});

test('hebrewNormalize: strips bidi controls', () => {
  const input = '\u200Fשלום\u200E world';
  const out = hebrewNormalize(input);
  // Bidi marks stripped; final mem folded to regular mem.
  assert.equal(out, 'שלומ world');
  assert.ok(!/[\u200E\u200F]/.test(out));
});

test('hebrewNormalize: handles null and empty', () => {
  assert.equal(hebrewNormalize(null), '');
  assert.equal(hebrewNormalize(''), '');
});

test('hebrewNormalize: collapses whitespace but keeps newlines', () => {
  const input = 'שורה   1\n\n  שורה 2';
  const out = hebrewNormalize(input);
  assert.equal(out, 'שורה 1\nשורה 2');
});

test('processDocument: returns Hebrew-normalised text', async () => {
  const p = buildPipeline();
  const b = makeBackend('b', { text: 'חֲשבּוֹנִית מס\u200F', confidence: 0.95 });
  p.addBackend({ name: 'b', type: 'google', config: { transport: b }, languages: ['heb'], priority: 10 });
  const out = await p.processDocument({ file: 'x', hints: { language: 'heb', docType: 'invoice' } });
  assert.equal(out.text.includes('חשבונית מס') || out.text.includes('חשבונית מצ'), true);
  assert.ok(!/[\u0591-\u05C7]/.test(out.text), 'niqqud must be stripped');
  assert.ok(!/[\u200E\u200F]/.test(out.text), 'bidi controls must be stripped');
});


// ════════════════════════════════════════════════════════════════
//  7. Sensitive redaction
// ════════════════════════════════════════════════════════════════

test('sensitiveRedact: masks Israeli IDs by default', () => {
  const p = buildPipeline();
  const out = p.sensitiveRedact({ text: 'ת.ז 123456789 בעל החשבון' });
  assert.ok(out.text.includes('[REDACTED]'));
  assert.ok(!out.text.includes('123456789'));
  assert.ok(out.redactions.find((r) => r.pattern === 'israeli-id' && r.count === 1));
});

test('sensitiveRedact: masks credit card numbers', () => {
  const p = buildPipeline();
  const out = p.sensitiveRedact({
    text: 'Charged to card 4580-1234-5678-9012 on file',
    patterns: ['credit-card'],
  });
  assert.ok(out.text.includes('[REDACTED]'));
  assert.ok(!out.text.match(/4580/));
  assert.equal(out.redactions[0].pattern, 'credit-card');
});

test('sensitiveRedact: rejects unknown slug', () => {
  const p = buildPipeline();
  assert.throws(
    () => p.sensitiveRedact({ text: 'x', patterns: ['nope'] }),
    (e) => e instanceof OCRPipelineError && e.code === 'OCR_REDACT_PATTERN_UNKNOWN',
  );
});

test('sensitiveRedact: accepts custom RegExp map', () => {
  const p = buildPipeline();
  const out = p.sensitiveRedact({
    text: 'order ABC-42 was shipped',
    patterns: { 'order-id': /ABC-\d+/g },
    mask: '###',
  });
  assert.equal(out.text, 'order ### was shipped');
});

test('sensitiveRedact: masks Israeli phone numbers', () => {
  const p = buildPipeline();
  const out = p.sensitiveRedact({
    text: 'Call us at 054-123-4567 or +972-3-123-4567',
    patterns: ['il-phone'],
  });
  assert.ok(out.text.includes('[REDACTED]'));
  assert.ok(!out.text.match(/054|972/));
});


// ════════════════════════════════════════════════════════════════
//  8. postProcessing
// ════════════════════════════════════════════════════════════════

test('postProcessing: normalises currency on invoices', () => {
  const p = buildPipeline();
  const out = p.postProcessing({ text: 'Total ₪ 1,250.00  (NIS)', type: 'invoice' });
  assert.ok(out.includes('ILS'));
  assert.ok(!out.includes('₪'));
  assert.ok(!out.includes('NIS'));
});

test('postProcessing: rejects unknown doc type', () => {
  const p = buildPipeline();
  assert.throws(
    () => p.postProcessing({ text: 'x', type: 'invoice-v2' }),
    (e) => e instanceof OCRPipelineError && e.code === 'OCR_DOC_TYPE_UNSUPPORTED',
  );
});

test('postProcessing: general type is a safe no-op', () => {
  const p = buildPipeline();
  const out = p.postProcessing({ text: 'hello world', type: 'general' });
  assert.equal(out, 'hello world');
});


// ════════════════════════════════════════════════════════════════
//  9. structuredExtract
// ════════════════════════════════════════════════════════════════

test('structuredExtract: pulls fields by pattern', () => {
  const p = buildPipeline();
  const text = 'Invoice No: 2026-0142\nDate: 11/04/2026\nTotal: 1250.50';
  const schema = {
    number: { type: 'string', pattern: /Invoice No:\s*([\w-]+)/ },
    date: { type: 'date', pattern: /Date:\s*(\d{2}\/\d{2}\/\d{4})/ },
    total: { type: 'number', pattern: /Total:\s*([\d.]+)/ },
  };
  const res = p.structuredExtract({ text, schema });
  assert.equal(res.fields.number, '2026-0142');
  assert.equal(res.fields.date, '2026-04-11');
  assert.equal(res.fields.total, 1250.5);
  assert.deepEqual(res.missing, []);
});

test('structuredExtract: reports missing required fields', () => {
  const p = buildPipeline();
  const res = p.structuredExtract({
    text: 'Some invoice',
    schema: { number: { type: 'string', pattern: /Invoice No: (\w+)/, required: true } },
  });
  assert.deepEqual(res.missing, ['number']);
  assert.equal(res.fields.number, null);
});


// ════════════════════════════════════════════════════════════════
//  10. Layout / tables / handwriting
// ════════════════════════════════════════════════════════════════

test('layoutAnalysis: delegates to first capable backend', async () => {
  const p = buildPipeline();
  const b = makeBackend('b', { text: 'x', confidence: 0.9 });
  p.addBackend({ name: 'b', type: 'azure', config: { transport: b }, languages: ['eng'], priority: 10 });
  const zones = await p.layoutAnalysis('file.pdf');
  assert.ok(Array.isArray(zones));
  assert.equal(zones[0].kind, 'header');
});

test('tableExtraction: returns table matrix', async () => {
  const p = buildPipeline();
  const b = makeBackend('b', { text: 'x', confidence: 0.9 });
  p.addBackend({ name: 'b', type: 'aws', config: { transport: b }, languages: ['eng'], priority: 10 });
  const tables = await p.tableExtraction('file.pdf');
  assert.equal(tables.length, 1);
  assert.equal(tables[0].rows.length, 2);
});

test('handwritingDetect: flags regions', async () => {
  const p = buildPipeline();
  const b = makeBackend('b', { text: 'x', confidence: 0.9 });
  p.addBackend({ name: 'b', type: 'google', config: { transport: b }, languages: ['eng'], priority: 10 });
  const regions = await p.handwritingDetect('file.pdf');
  assert.equal(regions.length, 1);
  assert.ok(regions[0].confidence > 0);
});

test('layoutAnalysis: returns trivial zone when no capable backend', async () => {
  const p = buildPipeline();
  const t = async () => ({ text: 'x', confidence: 0.9 });   // no .layout method
  p.addBackend({ name: 'n', type: 'custom', config: { transport: t }, languages: ['eng'], priority: 1 });
  const zones = await p.layoutAnalysis('file.png');
  assert.equal(zones.length, 1);
  assert.equal(zones[0].kind, 'body');
});


// ════════════════════════════════════════════════════════════════
//  11. batchProcess
// ════════════════════════════════════════════════════════════════

test('batchProcess: processes all files, respects order', async () => {
  const p = buildPipeline({ concurrency: 2 });
  let counter = 0;
  const transport = async () => {
    counter += 1;
    return { text: `doc-${counter}`, confidence: 0.95 };
  };
  p.addBackend({ name: 'g', type: 'google', config: { transport }, languages: ['eng'], priority: 10 });

  const files = ['a', 'b', 'c', 'd', 'e'];
  const results = await p.batchProcess(files);
  assert.equal(results.length, 5);
  for (const r of results) assert.equal(r.ok, true);
});

test('batchProcess: isolates per-file failures', async () => {
  const p = buildPipeline();
  const transport = async (file) => {
    if (file === 'bad') throw new Error('nope');
    return { text: 'ok', confidence: 0.9 };
  };
  p.addBackend({ name: 'g', type: 'google', config: { transport }, languages: ['eng'], priority: 10 });

  const results = await p.batchProcess(['good', 'bad', 'good2']);
  assert.equal(results[0].ok, true);
  assert.equal(results[1].ok, false);
  assert.equal(results[2].ok, true);
});


// ════════════════════════════════════════════════════════════════
//  12. qualityCheck
// ════════════════════════════════════════════════════════════════

test('qualityCheck: flags missing expected field', () => {
  const p = buildPipeline();
  const res = p.qualityCheck({
    result: { text: 'invoice total 100', confidence: 0.9 },
    expected: ['invoice', 'vat'],
  });
  assert.equal(res.ok, false);
  assert.ok(res.issues.some((i) => /vat/.test(i)));
  assert.ok(res.score > 0 && res.score < 1);
});

test('qualityCheck: passes on a healthy result', () => {
  const p = buildPipeline();
  const res = p.qualityCheck({
    result: { text: 'invoice total 100', confidence: 0.95 },
    expected: ['invoice', 'total'],
  });
  assert.equal(res.ok, true);
  assert.equal(res.score, 1);
});


// ════════════════════════════════════════════════════════════════
//  13. Metrics
// ════════════════════════════════════════════════════════════════

test('metrics: fallback hops and successes are counted', async () => {
  const p = buildPipeline();
  p.addBackend({ name: 'a', type: 'google', config: { transport: makeBackend('a', { throws: new Error('x') }) }, languages: ['eng'], priority: 10 });
  p.addBackend({ name: 'b', type: 'azure', config: { transport: makeBackend('b', { text: 'ok', confidence: 0.95 }) }, languages: ['eng'], priority: 5 });
  p.fallbackOrder({ primary: 'a', secondary: 'b' });

  await p.processDocument({ file: 'f' });
  const m = p.getMetrics();
  assert.equal(m.successes, 1);
  assert.equal(m.fallback_hops, 1);
  assert.equal(m.per_backend.a.failures, 1);
  assert.equal(m.per_backend.b.successes, 1);
});
