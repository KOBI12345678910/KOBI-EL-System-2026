/**
 * test/documents/templates.test.js
 * ------------------------------------------------------------------
 * Unit tests for the document templates manager (Agent Y108).
 *
 * Run:
 *   node --test test/documents/templates.test.js
 * ------------------------------------------------------------------
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DocumentTemplates,
  tokenize,
  compile,
  htmlEscape,
  resolvePath,
  formatCurrency,
  formatDate,
  formatNumber,
  SEED_TEMPLATES,
} = require('../../src/documents/templates');

// ─────────────────────────────────────────────────────────────────────
// TOKENIZER
// ─────────────────────────────────────────────────────────────────────

test('tokenize: plain text produces one text token', () => {
  const toks = tokenize('hello world');
  assert.equal(toks.length, 1);
  assert.equal(toks[0].type, 'text');
  assert.equal(toks[0].value, 'hello world');
});

test('tokenize: variable interpolation', () => {
  const toks = tokenize('hello {{name}}!');
  assert.equal(toks.length, 3);
  assert.equal(toks[0].type, 'text');
  assert.equal(toks[1].type, 'var');
  assert.equal(toks[1].expr, 'name');
  assert.equal(toks[2].type, 'text');
});

test('tokenize: raw interpolation {{{expr}}}', () => {
  const toks = tokenize('{{{html}}}');
  assert.equal(toks.length, 1);
  assert.equal(toks[0].type, 'raw');
  assert.equal(toks[0].expr, 'html');
});

test('tokenize: block open/close', () => {
  const toks = tokenize('{{#if x}}yes{{/if}}');
  assert.equal(toks.length, 3);
  assert.equal(toks[0].type, 'block_open');
  assert.equal(toks[0].name, 'if');
  assert.equal(toks[0].args, 'x');
  assert.equal(toks[1].type, 'text');
  assert.equal(toks[2].type, 'block_close');
});

test('tokenize: else token', () => {
  const toks = tokenize('{{#if a}}A{{else}}B{{/if}}');
  const kinds = toks.map((t) => t.type);
  assert.deepEqual(kinds, ['block_open', 'text', 'else', 'text', 'block_close']);
});

test('tokenize: comments are preserved as comment token', () => {
  const toks = tokenize('{{! hidden }}visible');
  assert.equal(toks[0].type, 'comment');
  assert.equal(toks[1].type, 'text');
  assert.equal(toks[1].value, 'visible');
});

test('tokenize: unterminated tag throws', () => {
  assert.throws(() => tokenize('hello {{name'), /Unterminated/);
});

// ─────────────────────────────────────────────────────────────────────
// VARIABLE SUBSTITUTION
// ─────────────────────────────────────────────────────────────────────

test('render: simple variable substitution', () => {
  const dt = new DocumentTemplates({ seed: false });
  dt.registerTemplate({ id: 't1', content: 'Hello, {{name}}!', language: 'en' });
  const out = dt.render({ templateId: 't1', context: { name: 'World' } });
  assert.equal(out, 'Hello, World!');
});

test('render: missing variable renders as empty string', () => {
  const dt = new DocumentTemplates({ seed: false });
  dt.registerTemplate({ id: 't1', content: '[{{missing}}]', language: 'en' });
  const out = dt.render({ templateId: 't1', context: {} });
  assert.equal(out, '[]');
});

test('render: dot-path lookup into nested object', () => {
  const dt = new DocumentTemplates({ seed: false });
  dt.registerTemplate({ id: 't1', content: '{{user.address.city}}', language: 'en' });
  const out = dt.render({ templateId: 't1', context: { user: { address: { city: 'Tel Aviv' } } } });
  assert.equal(out, 'Tel Aviv');
});

test('render: variable with HTML escape disabled by default', () => {
  const dt = new DocumentTemplates({ seed: false });
  dt.registerTemplate({ id: 't1', content: '{{x}}', language: 'en' });
  const out = dt.render({ templateId: 't1', context: { x: '<b>bold</b>' } });
  assert.equal(out, '<b>bold</b>');
});

test('render: variable with HTML escape enabled', () => {
  const dt = new DocumentTemplates({ seed: false });
  dt.registerTemplate({ id: 't1', content: '{{x}}', language: 'en' });
  const out = dt.render({ templateId: 't1', context: { x: '<b>bold</b>' }, escape: true });
  assert.equal(out, '&lt;b&gt;bold&lt;/b&gt;');
});

test('render: triple-brace raw bypasses escaping', () => {
  const dt = new DocumentTemplates({ seed: false });
  dt.registerTemplate({ id: 't1', content: '{{{x}}}', language: 'en' });
  const out = dt.render({ templateId: 't1', context: { x: '<b>bold</b>' }, escape: true });
  assert.equal(out, '<b>bold</b>');
});

// ─────────────────────────────────────────────────────────────────────
// CONDITIONALS
// ─────────────────────────────────────────────────────────────────────

test('render: if/endif truthy', () => {
  const dt = new DocumentTemplates({ seed: false });
  dt.registerTemplate({ id: 't1', content: '{{#if show}}YES{{/if}}', language: 'en' });
  assert.equal(dt.render({ templateId: 't1', context: { show: true } }), 'YES');
  assert.equal(dt.render({ templateId: 't1', context: { show: false } }), '');
});

test('render: if/else branches', () => {
  const dt = new DocumentTemplates({ seed: false });
  dt.registerTemplate({ id: 't1', content: '{{#if a}}A{{else}}B{{/if}}', language: 'en' });
  assert.equal(dt.render({ templateId: 't1', context: { a: true } }), 'A');
  assert.equal(dt.render({ templateId: 't1', context: { a: false } }), 'B');
});

test('render: unless is inverse if', () => {
  const dt = new DocumentTemplates({ seed: false });
  dt.registerTemplate({ id: 't1', content: '{{#unless x}}empty{{/unless}}', language: 'en' });
  assert.equal(dt.render({ templateId: 't1', context: { x: false } }), 'empty');
  assert.equal(dt.render({ templateId: 't1', context: { x: true } }), '');
});

test('render: nested conditionals', () => {
  const dt = new DocumentTemplates({ seed: false });
  dt.registerTemplate({
    id: 't1',
    content: '{{#if a}}[{{#if b}}both{{else}}just-a{{/if}}]{{/if}}',
    language: 'en',
  });
  assert.equal(dt.render({ templateId: 't1', context: { a: true, b: true } }), '[both]');
  assert.equal(dt.render({ templateId: 't1', context: { a: true, b: false } }), '[just-a]');
  assert.equal(dt.render({ templateId: 't1', context: { a: false, b: true } }), '');
});

test('render: array counts as truthy only when non-empty', () => {
  const dt = new DocumentTemplates({ seed: false });
  dt.registerTemplate({ id: 't1', content: '{{#if xs}}have{{/if}}', language: 'en' });
  assert.equal(dt.render({ templateId: 't1', context: { xs: [1] } }), 'have');
  assert.equal(dt.render({ templateId: 't1', context: { xs: [] } }), '');
});

// ─────────────────────────────────────────────────────────────────────
// LOOPS
// ─────────────────────────────────────────────────────────────────────

test('render: each loop over array of primitives', () => {
  const dt = new DocumentTemplates({ seed: false });
  dt.registerTemplate({ id: 't1', content: '{{#each items}}[{{this}}]{{/each}}', language: 'en' });
  const out = dt.render({ templateId: 't1', context: { items: ['a', 'b', 'c'] } });
  assert.equal(out, '[a][b][c]');
});

test('render: each loop over array of objects with field access', () => {
  const dt = new DocumentTemplates({ seed: false });
  dt.registerTemplate({
    id: 't1',
    content: '{{#each users}}{{name}}={{age}},{{/each}}',
    language: 'en',
  });
  const out = dt.render({
    templateId: 't1',
    context: { users: [{ name: 'A', age: 1 }, { name: 'B', age: 2 }] },
  });
  assert.equal(out, 'A=1,B=2,');
});

test('render: each loop exposes @index, @first, @last', () => {
  const dt = new DocumentTemplates({ seed: false });
  dt.registerTemplate({
    id: 't1',
    content: '{{#each xs}}{{@index}}:{{this}}{{#if @last}}!{{/if}},{{/each}}',
    language: 'en',
  });
  const out = dt.render({ templateId: 't1', context: { xs: ['a', 'b', 'c'] } });
  assert.equal(out, '0:a,1:b,2:c!,');
});

test('render: each loop over empty array produces nothing', () => {
  const dt = new DocumentTemplates({ seed: false });
  dt.registerTemplate({ id: 't1', content: '{{#each xs}}x{{/each}}', language: 'en' });
  assert.equal(dt.render({ templateId: 't1', context: { xs: [] } }), '');
});

test('render: each loop parent scope lookup', () => {
  const dt = new DocumentTemplates({ seed: false });
  dt.registerTemplate({
    id: 't1',
    content: '{{#each items}}{{name}}@{{company}},{{/each}}',
    language: 'en',
  });
  const out = dt.render({
    templateId: 't1',
    context: { company: 'Acme', items: [{ name: 'X' }, { name: 'Y' }] },
  });
  assert.equal(out, 'X@Acme,Y@Acme,');
});

// ─────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────

test('helper: formatCurrency default ILS', () => {
  assert.equal(formatCurrency(1234.5, 'ILS'), '₪1,234.50');
  assert.equal(formatCurrency(0, 'ILS'), '₪0.00');
  assert.equal(formatCurrency(1000000, 'ILS'), '₪1,000,000.00');
});

test('helper: formatCurrency USD / EUR / custom', () => {
  assert.equal(formatCurrency(100, 'USD'), '$100.00');
  assert.equal(formatCurrency(100, 'EUR'), '€100.00');
  assert.equal(formatCurrency(100, 'GBP'), 'GBP 100.00');
});

test('helper: formatDate default dd/mm/yyyy', () => {
  assert.equal(formatDate('2026-04-11'), '11/04/2026');
});

test('helper: formatDate custom format', () => {
  assert.equal(formatDate('2026-04-11', 'yyyy-mm-dd'), '2026-04-11');
  assert.equal(formatDate('2026-04-11', 'dd.mm.yy'), '11.04.26');
});

test('helper: formatNumber with decimals', () => {
  assert.equal(formatNumber(1234.567, 2), '1,234.57');
  assert.equal(formatNumber(1234, 0), '1,234');
});

test('helper: upper/lower/trim', () => {
  const dt = new DocumentTemplates({ seed: false });
  dt.registerTemplate({
    id: 't1',
    content: '{{upper x}}|{{lower y}}|{{trim z}}',
    language: 'en',
  });
  const out = dt.render({
    templateId: 't1',
    context: { x: 'hi', y: 'WORLD', z: '  spaced  ' },
  });
  assert.equal(out, 'HI|world|spaced');
});

test('helper: comparison helpers in conditionals', () => {
  const dt = new DocumentTemplates({ seed: false });
  dt.registerTemplate({
    id: 't1',
    content: '{{#if eq status "paid"}}PAID{{else}}DUE{{/if}}',
    language: 'en',
  });
  assert.equal(dt.render({ templateId: 't1', context: { status: 'paid' } }), 'PAID');
  assert.equal(dt.render({ templateId: 't1', context: { status: 'open' } }), 'DUE');
});

test('helper: formatCurrency used inside template', () => {
  const dt = new DocumentTemplates({ seed: false });
  dt.registerTemplate({
    id: 't1',
    content: 'Total: {{formatCurrency amount "ILS"}}',
    language: 'en',
  });
  const out = dt.render({ templateId: 't1', context: { amount: 1500.5 } });
  assert.equal(out, 'Total: ₪1,500.50');
});

test('helper: default fills missing values', () => {
  const dt = new DocumentTemplates({ seed: false });
  dt.registerTemplate({
    id: 't1',
    content: '{{default note "N/A"}}',
    language: 'en',
  });
  assert.equal(dt.render({ templateId: 't1', context: {} }), 'N/A');
  assert.equal(dt.render({ templateId: 't1', context: { note: 'hello' } }), 'hello');
});

test('helper: custom helper via registerHelper', () => {
  const dt = new DocumentTemplates({ seed: false });
  dt.registerHelper('exclaim', (s) => String(s) + '!');
  dt.registerTemplate({ id: 't1', content: '{{exclaim x}}', language: 'en' });
  assert.equal(dt.render({ templateId: 't1', context: { x: 'wow' } }), 'wow!');
});

// ─────────────────────────────────────────────────────────────────────
// VALIDATION
// ─────────────────────────────────────────────────────────────────────

test('validate: reports missing required vars', () => {
  const dt = new DocumentTemplates({ seed: false });
  dt.registerTemplate({
    id: 't1',
    content: '{{a}} {{b}}',
    language: 'en',
    variables: [
      { name: 'a', type: 'string', required: true },
      { name: 'b', type: 'string', required: true },
    ],
  });
  const v = dt.validate({ templateId: 't1', context: { a: 'hi' } });
  assert.equal(v.valid, false);
  assert.deepEqual(v.missing, ['b']);
});

test('validate: accepts when all required present', () => {
  const dt = new DocumentTemplates({ seed: false });
  dt.registerTemplate({
    id: 't1',
    content: '{{a}}',
    language: 'en',
    variables: [{ name: 'a', type: 'string', required: true }],
  });
  const v = dt.validate({ templateId: 't1', context: { a: 'hi' } });
  assert.equal(v.valid, true);
  assert.deepEqual(v.missing, []);
});

test('validate: defaulted variable is not missing', () => {
  const dt = new DocumentTemplates({ seed: false });
  dt.registerTemplate({
    id: 't1',
    content: '{{a}}',
    language: 'en',
    variables: [{ name: 'a', type: 'string', required: true, default: 'X' }],
  });
  const v = dt.validate({ templateId: 't1', context: {} });
  assert.equal(v.valid, true);
});

test('validate: type mismatches surface as warnings', () => {
  const dt = new DocumentTemplates({ seed: false });
  dt.registerTemplate({
    id: 't1',
    content: '{{xs}}',
    language: 'en',
    variables: [{ name: 'xs', type: 'array', required: true }],
  });
  const v = dt.validate({ templateId: 't1', context: { xs: 'not-an-array' } });
  assert.equal(v.valid, true);
  assert.ok(v.warnings.length > 0);
});

test('render: throws when required variable missing', () => {
  const dt = new DocumentTemplates({ seed: false });
  dt.registerTemplate({
    id: 't1',
    content: '{{a}}',
    language: 'en',
    variables: [{ name: 'a', type: 'string', required: true }],
  });
  assert.throws(() => dt.render({ templateId: 't1', context: {} }), /Missing required/);
});

// ─────────────────────────────────────────────────────────────────────
// BILINGUAL
// ─────────────────────────────────────────────────────────────────────

test('renderBilingual: produces he and en sides', () => {
  const dt = new DocumentTemplates({ seed: false });
  dt.registerTemplate({
    id: 't1',
    content: { he: 'שלום {{name}}', en: 'Hello {{name}}' },
    language: 'bilingual',
  });
  const r = dt.renderBilingual({ templateId: 't1', context: { name: 'Kobi' } });
  assert.equal(r.he, 'שלום Kobi');
  assert.equal(r.en, 'Hello Kobi');
  assert.ok(r.combined.includes('שלום Kobi'));
  assert.ok(r.combined.includes('Hello Kobi'));
});

test('renderBilingual: custom separator', () => {
  const dt = new DocumentTemplates({ seed: false });
  dt.registerTemplate({
    id: 't1',
    content: { he: 'א', en: 'A' },
  });
  const r = dt.renderBilingual({ templateId: 't1', context: {}, separator: ' | ' });
  assert.equal(r.combined, 'א | A');
});

// ─────────────────────────────────────────────────────────────────────
// LANGUAGE FALLBACK
// ─────────────────────────────────────────────────────────────────────

test('languageFallback: returns he when en requested and missing', () => {
  const dt = new DocumentTemplates({ seed: false });
  dt.registerTemplate({ id: 't1', content: { he: 'שלום' } });
  const r = dt.languageFallback('t1', 'en');
  assert.equal(r.fallback, true);
  assert.equal(r.resolved, 'he');
});

test('languageFallback: returns en when he requested and missing', () => {
  const dt = new DocumentTemplates({ seed: false });
  dt.registerTemplate({ id: 't1', content: { en: 'Hello' } });
  const r = dt.languageFallback('t1', 'he');
  assert.equal(r.fallback, true);
  assert.equal(r.resolved, 'en');
});

test('languageFallback: returns requested when present', () => {
  const dt = new DocumentTemplates({ seed: false });
  dt.registerTemplate({ id: 't1', content: { he: 'שלום', en: 'Hi' } });
  const r = dt.languageFallback('t1', 'en');
  assert.equal(r.fallback, false);
  assert.equal(r.resolved, 'en');
});

// ─────────────────────────────────────────────────────────────────────
// VERSIONING
// ─────────────────────────────────────────────────────────────────────

test('versionTemplate: initial registration creates v1 with no history', () => {
  const dt = new DocumentTemplates({ seed: false });
  dt.registerTemplate({ id: 't1', content: 'v1', language: 'en' });
  const v = dt.versionTemplate('t1');
  assert.equal(v.current.version, 1);
  assert.equal(v.history.length, 0);
});

test('versionTemplate: re-registration snapshots prior version', () => {
  const dt = new DocumentTemplates({ seed: false });
  dt.registerTemplate({ id: 't1', content: 'v1', language: 'en' });
  dt.registerTemplate({ id: 't1', content: 'v2', language: 'en' });
  dt.registerTemplate({ id: 't1', content: 'v3', language: 'en' });
  const v = dt.versionTemplate('t1');
  assert.equal(v.current.version, 3);
  assert.equal(v.history.length, 2);
  assert.equal(v.history[0].version, 1);
  assert.equal(v.history[1].version, 2);
});

test('versionTemplate: never deletes — history preserved', () => {
  const dt = new DocumentTemplates({ seed: false });
  dt.registerTemplate({ id: 't1', content: 'initial text', language: 'en' });
  dt.registerTemplate({ id: 't1', content: 'updated text', language: 'en' });
  const v = dt.versionTemplate('t1');
  // The prior v1 content must still be reachable.
  assert.ok(JSON.stringify(v.history[0]).includes('initial text'));
});

// ─────────────────────────────────────────────────────────────────────
// DEPENDENCIES / PARTIALS
// ─────────────────────────────────────────────────────────────────────

test('registerPartial + render: includes partial', () => {
  const dt = new DocumentTemplates({ seed: false });
  dt.registerPartial('footer', 'FOOTER-{{year}}');
  dt.registerTemplate({
    id: 't1',
    content: 'hello\n{{> footer}}',
    language: 'en',
  });
  const out = dt.render({ templateId: 't1', context: { year: 2026 } });
  assert.equal(out, 'hello\nFOOTER-2026');
});

test('dependencies: reports templates that reference a partial name', () => {
  const dt = new DocumentTemplates({ seed: false });
  dt.registerTemplate({ id: 'a', content: '{{> shared}} X', language: 'en' });
  dt.registerTemplate({ id: 'b', content: 'Y {{> shared}}', language: 'en' });
  dt.registerTemplate({ id: 'c', content: 'Z', language: 'en' });
  const deps = dt.dependencies('shared');
  assert.equal(deps.count, 2);
  const ids = deps.dependents.map((d) => d.id).sort();
  assert.deepEqual(ids, ['a', 'b']);
});

// ─────────────────────────────────────────────────────────────────────
// TEST TEMPLATE (fixtures)
// ─────────────────────────────────────────────────────────────────────

test('testTemplate: fixture with expect_contains passes', () => {
  const dt = new DocumentTemplates({ seed: false });
  dt.registerTemplate({
    id: 't1',
    content: 'Hello {{name}}',
    language: 'en',
    variables: [{ name: 'name', type: 'string', required: true }],
  });
  const result = dt.testTemplate('t1', [
    { name: 'hi', context: { name: 'Kobi' }, expect_contains: 'Hello Kobi' },
  ]);
  assert.equal(result.passed, 1);
  assert.equal(result.failed, 0);
});

test('testTemplate: fixture with expect_contains fails when output differs', () => {
  const dt = new DocumentTemplates({ seed: false });
  dt.registerTemplate({
    id: 't1',
    content: 'Hello {{name}}',
    language: 'en',
    variables: [{ name: 'name', type: 'string', required: true }],
  });
  const result = dt.testTemplate('t1', [
    { name: 'hi', context: { name: 'Kobi' }, expect_contains: 'Shalom' },
  ]);
  assert.equal(result.passed, 0);
  assert.equal(result.failed, 1);
});

test('testTemplate: fixture expect_not_contains', () => {
  const dt = new DocumentTemplates({ seed: false });
  dt.registerTemplate({ id: 't1', content: 'Hello {{name}}', language: 'en', variables: [{ name: 'name', type: 'string', required: true }] });
  const ok = dt.testTemplate('t1', [{ context: { name: 'X' }, expect_not_contains: 'goodbye' }]);
  assert.equal(ok.failed, 0);
});

test('testTemplate: expect_valid:false confirms missing var caught', () => {
  const dt = new DocumentTemplates({ seed: false });
  dt.registerTemplate({
    id: 't1',
    content: '{{a}}',
    language: 'en',
    variables: [{ name: 'a', type: 'string', required: true }],
  });
  const result = dt.testTemplate('t1', [{ context: {}, expect_valid: false }]);
  assert.equal(result.passed, 1);
  assert.equal(result.failed, 0);
});

// ─────────────────────────────────────────────────────────────────────
// FORMAT CONVERSION STUBS
// ─────────────────────────────────────────────────────────────────────

test('renderFormats: txt passthrough', () => {
  const dt = new DocumentTemplates({ seed: false });
  dt.registerTemplate({ id: 't1', content: 'plain {{x}}', language: 'en' });
  const r = dt.renderFormats({ templateId: 't1', context: { x: 'text' }, format: 'txt' });
  assert.equal(r.format, 'txt');
  assert.equal(r.content, 'plain text');
  assert.equal(r.mime, 'text/plain');
});

test('renderFormats: md prepends title heading', () => {
  const dt = new DocumentTemplates({ seed: false });
  dt.registerTemplate({
    id: 't1',
    name_en: 'Title',
    content: 'body {{x}}',
    language: 'en',
  });
  const r = dt.renderFormats({ templateId: 't1', context: { x: 'ok' }, format: 'md', lang: 'en' });
  assert.equal(r.format, 'md');
  assert.ok(r.content.startsWith('# Title'));
  assert.ok(r.content.includes('body ok'));
});

test('renderFormats: html wraps in doctype with correct dir', () => {
  const dt = new DocumentTemplates({ seed: false });
  dt.registerTemplate({
    id: 't1',
    name_he: 'כותרת',
    content: { he: 'משתמש: {{user_input}}' },
  });
  // Variable contains unsafe chars — should be escaped in the HTML output.
  const r = dt.renderFormats({
    templateId: 't1',
    context: { user_input: '<script>alert(1)</script>' },
    format: 'html',
    lang: 'he',
  });
  assert.equal(r.format, 'html');
  assert.ok(r.content.includes('dir="rtl"'));
  assert.ok(r.content.includes('lang="he"'));
  // Interpolated user input must be escaped in the HTML body.
  assert.ok(r.content.includes('&lt;script&gt;'));
  assert.ok(!r.content.includes('<script>alert'));
});

test('renderFormats: pdf returns spec object', () => {
  const dt = new DocumentTemplates({ seed: false });
  dt.registerTemplate({ id: 't1', content: { he: 'אבג' } });
  const r = dt.renderFormats({ templateId: 't1', context: {}, format: 'pdf', lang: 'he' });
  assert.equal(r.format, 'pdf');
  assert.equal(r.pdf_spec.direction, 'rtl');
  assert.equal(r.pdf_spec.language, 'he');
  assert.equal(r.pdf_spec.body, 'אבג');
});

test('renderFormats: docx returns spec with paragraphs', () => {
  const dt = new DocumentTemplates({ seed: false });
  dt.registerTemplate({ id: 't1', content: { en: 'line1\nline2\nline3' } });
  const r = dt.renderFormats({ templateId: 't1', context: {}, format: 'docx', lang: 'en' });
  assert.equal(r.format, 'docx');
  assert.equal(r.docx_spec.paragraphs.length, 3);
  assert.equal(r.docx_spec.paragraphs[0], 'line1');
});

test('renderFormats: unknown format throws', () => {
  const dt = new DocumentTemplates({ seed: false });
  dt.registerTemplate({ id: 't1', content: 'x', language: 'en' });
  assert.throws(
    () => dt.renderFormats({ templateId: 't1', context: {}, format: 'xml' }),
    /Unsupported format/,
  );
});

// ─────────────────────────────────────────────────────────────────────
// APPROVAL WORKFLOW
// ─────────────────────────────────────────────────────────────────────

test('approvalWorkflow: propose sets pending state', () => {
  const dt = new DocumentTemplates({ seed: false });
  dt.registerTemplate({ id: 't1', content: 'x', category: 'legal' });
  const state = dt.approvalWorkflow({
    templateId: 't1',
    action: 'propose',
    approvers: ['legal', 'cfo'],
  });
  assert.equal(state.status, 'pending');
  assert.deepEqual(state.required_approvers, ['legal', 'cfo']);
});

test('approvalWorkflow: review marks approved when all approvers sign', () => {
  const dt = new DocumentTemplates({ seed: false });
  dt.registerTemplate({ id: 't1', content: 'x', category: 'legal' });
  dt.approvalWorkflow({ templateId: 't1', action: 'propose', approvers: ['a', 'b'] });
  dt.approvalWorkflow({ templateId: 't1', action: 'review', reviewer: 'a', decision: 'approve' });
  let state = dt.approvalWorkflow({ templateId: 't1' });
  assert.equal(state.status, 'pending');
  state = dt.approvalWorkflow({ templateId: 't1', action: 'review', reviewer: 'b', decision: 'approve' });
  assert.equal(state.status, 'approved');
});

test('approvalWorkflow: single rejection flips state to rejected', () => {
  const dt = new DocumentTemplates({ seed: false });
  dt.registerTemplate({ id: 't1', content: 'x', category: 'legal' });
  dt.approvalWorkflow({ templateId: 't1', action: 'propose', approvers: ['a', 'b'] });
  const state = dt.approvalWorkflow({ templateId: 't1', action: 'review', reviewer: 'a', decision: 'reject', note: 'unsafe' });
  assert.equal(state.status, 'rejected');
});

test('approvalWorkflow: duplicate review rejected', () => {
  const dt = new DocumentTemplates({ seed: false });
  dt.registerTemplate({ id: 't1', content: 'x', category: 'legal' });
  dt.approvalWorkflow({ templateId: 't1', action: 'propose', approvers: ['a'] });
  dt.approvalWorkflow({ templateId: 't1', action: 'review', reviewer: 'a', decision: 'approve' });
  assert.throws(
    () => dt.approvalWorkflow({ templateId: 't1', action: 'review', reviewer: 'a', decision: 'approve' }),
    /already reviewed/,
  );
});

test('approvalWorkflow: non-approver rejected', () => {
  const dt = new DocumentTemplates({ seed: false });
  dt.registerTemplate({ id: 't1', content: 'x', category: 'legal' });
  dt.approvalWorkflow({ templateId: 't1', action: 'propose', approvers: ['a'] });
  assert.throws(
    () => dt.approvalWorkflow({ templateId: 't1', action: 'review', reviewer: 'z', decision: 'approve' }),
    /not a required approver/,
  );
});

// ─────────────────────────────────────────────────────────────────────
// SEED TEMPLATES — all 11 compile & render smoke test
// ─────────────────────────────────────────────────────────────────────

test('seed: all 11 templates registered on default constructor', () => {
  const dt = new DocumentTemplates();
  const ids = dt.listTemplates().map((t) => t.id).sort();
  assert.deepEqual(ids, [
    'credit_memo',
    'invoice',
    'lease_agreement',
    'msa',
    'nda',
    'offer_letter',
    'purchase_order',
    'quote',
    'receipt',
    'sow',
    'termination_letter',
  ]);
});

test('seed: SEED_TEMPLATES export contains 11 entries', () => {
  assert.equal(SEED_TEMPLATES.length, 11);
});

test('seed: invoice renders in both languages', () => {
  const dt = new DocumentTemplates();
  const ctx = {
    invoice_number: 'INV-001',
    issue_date: '2026-04-11',
    supplier: { name: 'Acme', tax_id: '123456' },
    customer: { name: 'Buyer', tax_id: '789012' },
    items: [{ description: 'Widget', quantity: 2, unit_price: 100, total: 200 }],
    subtotal: 200,
    vat_rate: 18,
    vat_amount: 36,
    total_amount: 236,
  };
  const he = dt.render({ templateId: 'invoice', context: ctx, lang: 'he' });
  const en = dt.render({ templateId: 'invoice', context: ctx, lang: 'en' });
  assert.ok(he.includes('INV-001'));
  assert.ok(he.includes('₪236.00'));
  assert.ok(he.includes('חשבונית'));
  assert.ok(en.includes('TAX INVOICE'));
  assert.ok(en.includes('₪236.00'));
});

test('seed: receipt with conditional reference block', () => {
  const dt = new DocumentTemplates();
  const ctx = {
    receipt_number: 'R-001',
    issue_date: '2026-04-11',
    customer: { name: 'A', tax_id: '1' },
    description: 'services',
    payment_method: 'bank transfer',
    reference_number: 'REF-999',
    amount: 1000,
    company: { name: 'Co', tax_id: '123' },
  };
  const out = dt.render({ templateId: 'receipt', context: ctx, lang: 'he' });
  assert.ok(out.includes('REF-999'));
  // Without reference
  const out2 = dt.render({
    templateId: 'receipt',
    context: Object.assign({}, ctx, { reference_number: '' }),
    lang: 'he',
  });
  assert.ok(!out2.includes('אסמכתא'));
});

test('seed: sow renders milestone loop', () => {
  const dt = new DocumentTemplates();
  const ctx = {
    sow_number: 'SOW-1',
    sow_date: '2026-04-11',
    msa_reference: 'MSA-42',
    client: { name: 'Client' },
    vendor: { name: 'Vendor' },
    project: { name: 'Migration', description: 'Move everything' },
    milestones: [
      { name: 'Kickoff', due_date: '2026-05-01', amount: 10000 },
      { name: 'Delivery', due_date: '2026-09-01', amount: 40000 },
    ],
    total_cost: 50000,
    start_date: '2026-05-01',
    end_date: '2026-09-30',
  };
  const out = dt.render({ templateId: 'sow', context: ctx, lang: 'en' });
  assert.ok(out.includes('Kickoff'));
  assert.ok(out.includes('Delivery'));
  assert.ok(out.includes('₪50,000.00'));
});

test('seed: lease_agreement exercises optional utility/pet flags', () => {
  const dt = new DocumentTemplates();
  const base = {
    agreement_date: '2026-04-11',
    landlord: { name: 'Owner', id_number: '123', address: 'street 1' },
    tenant: { name: 'Renter', id_number: '456', address: 'street 2' },
    property: { address: 'property address' },
    lease_start: '2026-05-01',
    lease_end: '2027-04-30',
    monthly_rent: 5000,
    deposit: 10000,
  };
  const plain = dt.render({ templateId: 'lease_agreement', context: base, lang: 'en' });
  assert.ok(!plain.includes('electricity'));
  assert.ok(!plain.includes('Pets are allowed'));

  const withFlags = dt.render({
    templateId: 'lease_agreement',
    context: Object.assign({}, base, { includes_utilities: true, pet_allowed: true }),
    lang: 'en',
  });
  assert.ok(withFlags.includes('electricity'));
  assert.ok(withFlags.includes('Pets are allowed'));
});

// ─────────────────────────────────────────────────────────────────────
// LOW-LEVEL UTILS
// ─────────────────────────────────────────────────────────────────────

test('htmlEscape: escapes special characters', () => {
  assert.equal(htmlEscape('<a href="x&y">\'t\'</a>'), '&lt;a href=&quot;x&amp;y&quot;&gt;&#39;t&#39;&lt;/a&gt;');
});

test('htmlEscape: null/undefined → empty string', () => {
  assert.equal(htmlEscape(null), '');
  assert.equal(htmlEscape(undefined), '');
});

test('resolvePath: nested lookup with missing leaf returns undefined', () => {
  const ctx = { a: { b: 1 } };
  assert.equal(resolvePath(ctx, 'a.b'), 1);
  assert.equal(resolvePath(ctx, 'a.c'), undefined);
  assert.equal(resolvePath(ctx, 'x.y'), undefined);
});

test('compile: returns AST nodes', () => {
  const ast = compile('hi {{name}}');
  assert.ok(Array.isArray(ast));
  assert.equal(ast.length, 2);
  assert.equal(ast[0].type, 'text');
  assert.equal(ast[1].type, 'var');
});
