'use strict';

/**
 * Agent-Y121 — Bilingual Email Template Engine
 * ────────────────────────────────────────────
 * Run with:  node --test test/comms/email-templates.test.js
 *
 * Law: "לא מוחקים רק משדרגים ומגדלים" — the legacy surface is still
 * exported from src/comms/email-templates.js; these tests exercise the
 * NEW Y-121 surface that lives alongside it.
 *
 * Coverage (18+ tests):
 *   1.  defineTemplate / renderTemplate basics
 *   2.  XSS-safe variable substitution ({{…}})
 *   3.  Raw substitution ({{& …}})
 *   4.  rtlDetect — auto dir="rtl" for Hebrew
 *   5.  generatePlainText strips tags + entities
 *   6.  inlineCSS — tag / class / id selectors
 *   7.  Marketing compliance passes when §30א satisfied
 *   8.  Marketing compliance fails when §30א missing
 *   9.  Tracking pixel blocked in transactional
 *   10. Version upgrade preserves history (append-only)
 *   11. listTemplates filters by category
 *   12. validateTemplate warns on undeclared variables
 *   13. exportMJML emits <mjml> subset
 *   14. importTemplate from HTML string
 *   15. importTemplate from JSON string
 *   16. Marketing render auto-adds §30א footer + headers
 *   17. All five categories accepted
 *   18. Unknown category rejected
 *   19. Bilingual render (he/en)
 *   20. Accessibility warning for img without alt
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  EmailTemplatesY121,
  Y121_CATEGORIES,
  Y121_SPAM_LAW,
  y121SubstituteVars,
  y121HasHebrew,
  y121GeneratePlainText,
  y121InlineCSS,
} = require('../../src/comms/email-templates');

// Minimal fixture for a marketing template that IS compliant with §30א.
const marketingCompliant = {
  id: 'mkt-compliant',
  name_he: 'מבצע פסח',
  name_en: 'Passover Promo',
  subject_he: 'פרסומת: מבצע פסח שלנו',
  subject_en: 'Advertisement: Our Passover Promo',
  bodyHtml_he: [
    '<div><h1>מבצע פסח!</h1>',
    '<p>שלום {{customer.name}}, טכנו-קול עוזי מציגה מבצע פסח מיוחד.</p>',
    '<p>הכתובת שלנו: רחוב המלאכה 1, תל אביב</p>',
    '<p>להסרה מרשימת התפוצה לחצו <a href="https://techno-kol.local/unsubscribe">הסר</a> או השיבו "הסר".</p>',
    '</div>',
  ].join(''),
  bodyHtml_en: [
    '<div><h1>Passover Sale!</h1>',
    '<p>Hello {{customer.name}}, Techno-Kol Uzi presents our advertisement.</p>',
    '<p>Address: 1 HaMelacha St, Tel Aviv</p>',
    '<p>To unsubscribe click <a href="https://techno-kol.local/unsubscribe">UNSUBSCRIBE</a> or reply STOP.</p>',
    '</div>',
  ].join(''),
  variables: ['customer.name'],
  category: 'marketing',
};

// Marketing template that is NOT compliant — missing everything.
const marketingBroken = {
  id: 'mkt-broken',
  name_he: 'מבצע',
  name_en: 'Sale',
  subject_he: 'מבצע',
  subject_en: 'Sale',
  bodyHtml_he: '<h1>קנו עכשיו!</h1><p>מחיר נמוך.</p>',
  bodyHtml_en: '<h1>Buy now!</h1><p>Low price.</p>',
  variables: [],
  category: 'marketing',
};

const transactionalClean = {
  id: 'tx-clean',
  name_he: 'חשבונית',
  name_en: 'Invoice',
  subject_he: 'חשבונית #{{invoice.number}}',
  subject_en: 'Invoice #{{invoice.number}}',
  bodyHtml_he: '<p>שלום {{customer.name}}, חשבונית #{{invoice.number}} מוכנה.</p>',
  bodyHtml_en: '<p>Hello {{customer.name}}, invoice #{{invoice.number}} is ready.</p>',
  variables: ['customer.name', 'invoice.number'],
  category: 'transactional',
};

// ─────────────────────────────────────────────────────────────────────
// 1. define + render basics
// ─────────────────────────────────────────────────────────────────────
test('defineTemplate + renderTemplate returns bilingual parts', () => {
  const eng = new EmailTemplatesY121();
  eng.defineTemplate(transactionalClean);
  const out = eng.renderTemplate({
    templateId: 'tx-clean',
    lang: 'he',
    variables: { customer: { name: 'עוזי' }, invoice: { number: '2026-001' } },
  });
  assert.equal(out.subject, 'חשבונית #2026-001');
  assert.match(out.html, /שלום עוזי/);
  assert.match(out.html, /2026-001/);
  assert.ok(out.text.length > 0, 'plain-text alternative should be produced');
  assert.equal(out.headers['Content-Language'], 'he');
});

// ─────────────────────────────────────────────────────────────────────
// 2. XSS safety — script payloads must be escaped.
// ─────────────────────────────────────────────────────────────────────
test('substituteVars HTML-escapes values (XSS safe)', () => {
  const eng = new EmailTemplatesY121();
  const html = eng.substituteVars('<p>{{msg}}</p>', { msg: '<script>alert(1)</script>' });
  assert.equal(html, '<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>');
  // Sanity: quotes, ampersands, and angle brackets all escaped.
  const more = eng.substituteVars('<p>{{x}}</p>', { x: 'a"b&c<d>e\'f' });
  assert.ok(more.indexOf('<script') === -1);
  assert.ok(more.indexOf('&amp;') !== -1);
  assert.ok(more.indexOf('&quot;') !== -1);
});

// ─────────────────────────────────────────────────────────────────────
// 3. Raw substitution — triple-stache bypasses escaping.
// ─────────────────────────────────────────────────────────────────────
test('substituteVars {{& raw}} does NOT escape trusted HTML', () => {
  const eng = new EmailTemplatesY121();
  const html = eng.substituteVars('<p>{{& trusted}}</p>', { trusted: '<strong>VIP</strong>' });
  assert.equal(html, '<p><strong>VIP</strong></p>');
});

// ─────────────────────────────────────────────────────────────────────
// 4. rtlDetect
// ─────────────────────────────────────────────────────────────────────
test('rtlDetect returns true for Hebrew and false for Latin-only', () => {
  const eng = new EmailTemplatesY121();
  assert.equal(eng.rtlDetect('שלום עולם'), true);
  assert.equal(eng.rtlDetect('Hello world'), false);
  assert.equal(eng.rtlDetect('Hello שלום mixed'), true);
  assert.equal(eng.rtlDetect(''), false);
  assert.equal(eng.rtlDetect(null), false);
});

// ─────────────────────────────────────────────────────────────────────
// 5. RTL auto-wrap on render
// ─────────────────────────────────────────────────────────────────────
test('renderTemplate auto-wraps Hebrew output with dir="rtl"', () => {
  const eng = new EmailTemplatesY121();
  eng.defineTemplate(transactionalClean);
  const out = eng.renderTemplate({
    templateId: 'tx-clean',
    lang: 'he',
    variables: { customer: { name: 'דוד' }, invoice: { number: 'X1' } },
  });
  assert.match(out.html, /dir="rtl"/);
  assert.match(out.html, /lang="he"/);
});

// ─────────────────────────────────────────────────────────────────────
// 6. generatePlainText
// ─────────────────────────────────────────────────────────────────────
test('generatePlainText strips HTML and decodes entities', () => {
  const eng = new EmailTemplatesY121();
  const text = eng.generatePlainText('<p>Hello &amp; <strong>world</strong></p><br><p>Line 2</p><script>nope</script>');
  assert.equal(text.indexOf('<') , -1, 'no angle brackets remain');
  assert.ok(text.indexOf('Hello & world') !== -1);
  assert.ok(text.indexOf('Line 2') !== -1);
  assert.ok(text.indexOf('nope') === -1, 'script content removed');
});

// ─────────────────────────────────────────────────────────────────────
// 7. inlineCSS
// ─────────────────────────────────────────────────────────────────────
test('inlineCSS applies tag, class and id selectors', () => {
  const eng = new EmailTemplatesY121();
  const html = '<body><p class="lead">Hi</p><p id="cta">Go</p><p>Plain</p></body>';
  const out = eng.inlineCSS(html, {
    body: 'background:#fff',
    '.lead': 'font-size:18px',
    '#cta': 'color:red',
  });
  assert.match(out, /<body[^>]*style="[^"]*background:#fff/);
  assert.match(out, /<p[^>]*class="lead"[^>]*style="[^"]*font-size:18px/);
  assert.match(out, /<p[^>]*id="cta"[^>]*style="[^"]*color:red/);
});

// ─────────────────────────────────────────────────────────────────────
// 8. complianceCheck — passing case
// ─────────────────────────────────────────────────────────────────────
test('complianceCheck passes a compliant marketing template (§30א)', () => {
  const eng = new EmailTemplatesY121();
  const result = eng.complianceCheck(marketingCompliant, 'marketing');
  assert.equal(result.compliant, true, 'should be compliant: missing=' + result.missing.join(','));
  assert.ok(result.passed.indexOf('unsubscribe_link') !== -1);
  assert.ok(result.passed.indexOf('physical_address') !== -1);
  assert.ok(result.passed.indexOf('sender_identification') !== -1);
  assert.ok(result.passed.indexOf('opt_out_keyword') !== -1);
  assert.ok(result.passed.indexOf('advertising_marker') !== -1);
  assert.equal(result.law, Y121_SPAM_LAW.section);
});

// ─────────────────────────────────────────────────────────────────────
// 9. complianceCheck — failing case
// ─────────────────────────────────────────────────────────────────────
test('complianceCheck flags all missing §30א items on a broken template', () => {
  const eng = new EmailTemplatesY121();
  const result = eng.complianceCheck(marketingBroken, 'marketing');
  assert.equal(result.compliant, false);
  assert.ok(result.missing.length > 0);
  assert.ok(result.missing.indexOf('unsubscribe_link') !== -1);
  assert.ok(result.missing.indexOf('physical_address') !== -1);
  assert.ok(result.missing.indexOf('opt_out_keyword') !== -1);
});

// ─────────────────────────────────────────────────────────────────────
// 10. validateTemplate — tracking pixel forbidden in transactional
// ─────────────────────────────────────────────────────────────────────
test('validateTemplate rejects a tracking pixel in a transactional template', () => {
  const eng = new EmailTemplatesY121();
  const bad = {
    id: 'tx-bad',
    name_he: 'רע',
    name_en: 'Bad',
    subject_he: 'בדיקה',
    subject_en: 'Test',
    bodyHtml_he: '<p>היי</p><img src="https://x.example/open.gif" width="1" height="1" alt="">',
    bodyHtml_en: '<p>Hi</p><img src="https://x.example/open.gif" width="1" height="1" alt="">',
    variables: [],
    category: 'transactional',
  };
  const v = eng.validateTemplate(bad);
  assert.equal(v.valid, false);
  assert.ok(v.errors.some((e) => /tracking pixel/.test(e)));
});

// ─────────────────────────────────────────────────────────────────────
// 11. upgradeTemplate preserves history (append-only)
// ─────────────────────────────────────────────────────────────────────
test('upgradeTemplate keeps old versions in append-only history', () => {
  const eng = new EmailTemplatesY121();
  eng.defineTemplate({
    id: 'tx-v',
    name_he: 'גרסה',
    name_en: 'Version',
    subject_he: 'נושא 1',
    subject_en: 'Subject 1',
    bodyHtml_he: '<p>גרסה 1</p>',
    bodyHtml_en: '<p>Version 1</p>',
    variables: [],
    category: 'transactional',
  });
  eng.upgradeTemplate('tx-v', {
    subject_he: 'נושא 2',
    subject_en: 'Subject 2',
    bodyHtml_he: '<p>גרסה 2</p>',
    bodyHtml_en: '<p>Version 2</p>',
    variables: [],
    category: 'transactional',
  });
  const current = eng.renderTemplate({ templateId: 'tx-v', lang: 'he', variables: {} });
  assert.match(current.html, /גרסה 2/);
  const hist = eng.getHistory('tx-v');
  assert.equal(hist.length, 1, 'exactly one previous version is retained');
  assert.match(hist[0].snapshot.html, /גרסה 1/);
});

// ─────────────────────────────────────────────────────────────────────
// 12. listTemplates filters by category
// ─────────────────────────────────────────────────────────────────────
test('listTemplates filters by category', () => {
  const eng = new EmailTemplatesY121();
  eng.defineTemplate(transactionalClean);
  eng.defineTemplate(marketingCompliant);
  const mkt = eng.listTemplates({ category: 'marketing' });
  const tx = eng.listTemplates({ category: 'transactional' });
  assert.equal(mkt.length, 1);
  assert.equal(tx.length, 1);
  assert.equal(mkt[0].id, 'mkt-compliant');
  assert.equal(tx[0].id, 'tx-clean');
});

// ─────────────────────────────────────────────────────────────────────
// 13. validateTemplate warns on undeclared variables
// ─────────────────────────────────────────────────────────────────────
test('validateTemplate warns when body uses an undeclared variable', () => {
  const eng = new EmailTemplatesY121();
  const v = eng.validateTemplate({
    id: 'u1',
    subject_he: 'x',
    subject_en: 'x',
    bodyHtml_he: '<p>{{customer.name}} and {{other}}</p>',
    bodyHtml_en: '<p>{{customer.name}} and {{other}}</p>',
    variables: ['customer.name'],
    category: 'transactional',
  });
  assert.ok(v.warnings.some((w) => /other/.test(w)));
});

// ─────────────────────────────────────────────────────────────────────
// 14. exportMJML
// ─────────────────────────────────────────────────────────────────────
test('exportMJML emits an <mjml> subset with mj-body / mj-text', () => {
  const eng = new EmailTemplatesY121();
  eng.defineTemplate(transactionalClean);
  const mjml = eng.exportMJML('tx-clean');
  assert.match(mjml, /^<mjml>/);
  assert.match(mjml, /<mj-body>/);
  assert.match(mjml, /<mj-section>/);
  assert.match(mjml, /<mj-text>/);
  assert.match(mjml, /<\/mjml>$/);
});

// ─────────────────────────────────────────────────────────────────────
// 15. importTemplate — HTML string
// ─────────────────────────────────────────────────────────────────────
test('importTemplate accepts a raw HTML string', () => {
  const eng = new EmailTemplatesY121();
  const rec = eng.importTemplate('<div><h1>Welcome</h1><p>Hi</p></div>');
  assert.ok(rec.id.indexOf('imported-html-') === 0);
  const list = eng.listTemplates();
  assert.equal(list.length, 1);
});

// ─────────────────────────────────────────────────────────────────────
// 16. importTemplate — JSON string
// ─────────────────────────────────────────────────────────────────────
test('importTemplate accepts a JSON-encoded descriptor', () => {
  const eng = new EmailTemplatesY121();
  const json = JSON.stringify({
    id: 'json-tmpl',
    name_he: 'JSON',
    name_en: 'JSON',
    subject_he: 'נושא',
    subject_en: 'Subject',
    bodyHtml_he: '<p>גוף</p>',
    bodyHtml_en: '<p>Body</p>',
    variables: [],
    category: 'notification',
  });
  const rec = eng.importTemplate(json);
  assert.equal(rec.id, 'json-tmpl');
});

// ─────────────────────────────────────────────────────────────────────
// 17. Marketing render adds §30א footer + List-Unsubscribe header
// ─────────────────────────────────────────────────────────────────────
test('renderTemplate appends §30א footer and List-Unsubscribe headers for marketing', () => {
  const eng = new EmailTemplatesY121();
  eng.defineTemplate(marketingCompliant);
  const out = eng.renderTemplate({
    templateId: 'mkt-compliant',
    lang: 'he',
    variables: { customer: { name: 'עוזי' } },
    recipient: { id: 'u-42', email: 'u42@example.com' },
  });
  assert.match(out.html, /הסר/);
  assert.match(out.html, /פרסומת/);
  assert.ok(out.headers['List-Unsubscribe'], 'List-Unsubscribe header must be present');
  assert.equal(out.headers['List-Unsubscribe-Post'], 'List-Unsubscribe=One-Click');
});

// ─────────────────────────────────────────────────────────────────────
// 18. All five categories accepted
// ─────────────────────────────────────────────────────────────────────
test('all five Y121 categories are accepted by defineTemplate', () => {
  const eng = new EmailTemplatesY121();
  const expected = ['marketing', 'transactional', 'notification', 'onboarding', 'collection'];
  assert.deepEqual(Y121_CATEGORIES.slice().sort(), expected.slice().sort());
  for (const cat of expected) {
    eng.defineTemplate({
      id: 'cat-' + cat,
      name_he: cat,
      name_en: cat,
      subject_he: 'נושא ' + cat,
      subject_en: 'Subject ' + cat,
      bodyHtml_he: cat === 'marketing'
        ? '<p>פרסומת טכנו-קול, רחוב המלאכה 1, <a href="https://x/unsub">הסר</a></p>'
        : '<p>גוף</p>',
      bodyHtml_en: '<p>Body</p>',
      variables: [],
      category: cat,
    });
  }
  assert.equal(eng.listTemplates().length, 5);
});

// ─────────────────────────────────────────────────────────────────────
// 19. Unknown category rejected
// ─────────────────────────────────────────────────────────────────────
test('defineTemplate rejects unknown categories', () => {
  const eng = new EmailTemplatesY121();
  assert.throws(() => eng.defineTemplate({
    id: 'x',
    subject_he: 'x',
    subject_en: 'x',
    bodyHtml_he: '<p>x</p>',
    bodyHtml_en: '<p>x</p>',
    variables: [],
    category: 'not-a-real-category',
  }), /unknown category/);
});

// ─────────────────────────────────────────────────────────────────────
// 20. Bilingual render — he vs en
// ─────────────────────────────────────────────────────────────────────
test('renderTemplate produces distinct output for he and en', () => {
  const eng = new EmailTemplatesY121();
  eng.defineTemplate(transactionalClean);
  const he = eng.renderTemplate({
    templateId: 'tx-clean',
    lang: 'he',
    variables: { customer: { name: 'X' }, invoice: { number: '1' } },
  });
  const en = eng.renderTemplate({
    templateId: 'tx-clean',
    lang: 'en',
    variables: { customer: { name: 'X' }, invoice: { number: '1' } },
  });
  assert.notEqual(he.html, en.html);
  assert.match(he.subject, /חשבונית/);
  assert.match(en.subject, /Invoice/);
  assert.equal(he.headers['Content-Language'], 'he');
  assert.equal(en.headers['Content-Language'], 'en');
});
