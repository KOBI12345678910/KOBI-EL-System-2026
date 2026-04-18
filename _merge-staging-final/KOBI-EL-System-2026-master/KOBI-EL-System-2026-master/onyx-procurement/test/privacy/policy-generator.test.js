/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Privacy Policy Generator — Unit tests
 * ═══════════════════════════════════════════════════════════════════════════
 *  Agent Y-140  |  Techno-Kol Uzi mega-ERP  |  2026-04-11
 *
 *  Run:    node --test test/privacy/policy-generator.test.js
 *
 *  Coverage — 22 deterministic test cases:
 *
 *     01 requiredSections — returns 11 תיקון 13 mandatory keys
 *     02 generate — includes all 11 sections when given full input
 *     03 generate — bilingual body (HE + EN) for every section
 *     04 generate — DPO section explicit when hasDPO=true
 *     05 generate — DPO section present but opt-out when hasDPO=false
 *     06 generate — throws when companyName_he missing
 *     07 generate — throws on invalid tone
 *     08 validatePolicy — detects missing section in policyText
 *     09 validatePolicy — accepts well-formed markdown
 *     10 validatePolicy — accepts policy object
 *     11 versionPolicy — attaches ISO date + version, immutable
 *     12 versionPolicy — throws when version missing
 *     13 diffVersions — added/removed/changed detected
 *     14 generateChangeNotice — bilingual notice + affected count
 *     15 localizeSection — HE variant
 *     16 localizeSection — EN variant
 *     17 localizeSection — throws on unknown key / bad lang
 *     18 exportMarkdown — contains all 11 section titles
 *     19 exportHTML — RTL html + lang=he + every title
 *     20 exportPlainText — contains all 11 section titles + dividers
 *     21 readabilityScore — English returns numeric Flesch value
 *     22 readabilityScore — Hebrew returns numeric value + lang validation
 * ═══════════════════════════════════════════════════════════════════════════
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  PolicyGenerator,
  REQUIRED_SECTIONS,
  SECTION_TITLES,
  LAW_CITATIONS,
  LAWFUL_BASES,
  SUBJECT_RIGHTS_HE,
  SUBJECT_RIGHTS_EN,
} = require('../../src/privacy/policy-generator.js');

// ---------------------------------------------------------------------------
//  Fixtures
// ---------------------------------------------------------------------------

const FIXED_NOW = new Date('2026-04-11T10:00:00.000Z');

function mkGen() {
  return new PolicyGenerator({ now: FIXED_NOW });
}

const FULL_INPUT = Object.freeze({
  companyName_he: 'טכנו־קול עוזי בע"מ',
  companyName_en: 'Techno-Kol Uzi Ltd.',
  industry: 'construction',
  dataCategories: ['שם', 'דואר אלקטרוני', 'ת.ז', 'IP'],
  purposes: ['אספקת שירות', 'חיוב', 'דיוור שיווקי'],
  jurisdictions: ['IL', 'US', 'DE'],
  hasDPO: true,
  dpo: { name: 'עדי לוי', email: 'dpo@technokol.co.il' },
  tone: 'formal',
  contactEmail: 'privacy@technokol.co.il',
  address: 'רחוב הרצל 1, תל אביב',
  website: 'https://technokol.co.il',
  thirdParties: ['AWS ירושלים', 'רו"ח אבני', 'רשות המסים'],
});

// ---------------------------------------------------------------------------
//  01 requiredSections
// ---------------------------------------------------------------------------

test('01 requiredSections returns the 11 תיקון 13 mandatory keys', () => {
  const g = mkGen();
  const keys = g.requiredSections();
  assert.equal(keys.length, 11);
  assert.deepEqual(keys, [
    'who-we-are',
    'data-we-collect',
    'why-we-collect',
    'who-we-share-with',
    'data-subject-rights',
    'international-transfers',
    'data-security',
    'retention-and-deletion',
    'dpo-contact',
    'changes-to-policy',
    'contact-us',
  ]);
  // mutating the returned array must not corrupt the source of truth
  keys.pop();
  assert.equal(g.requiredSections().length, 11);
});

// ---------------------------------------------------------------------------
//  02 generate — all 11 sections
// ---------------------------------------------------------------------------

test('02 generate includes all 11 sections for full input', () => {
  const g = mkGen();
  const policy = g.generate(FULL_INPUT);
  assert.equal(policy.sections.length, 11);
  const present = policy.sections.map(s => s.key).sort();
  assert.deepEqual(present, REQUIRED_SECTIONS.slice().sort());
  assert.equal(policy.meta.companyName_he, 'טכנו־קול עוזי בע"מ');
  assert.equal(policy.meta.companyName_en, 'Techno-Kol Uzi Ltd.');
  assert.ok(policy.meta.lawBasis.includes('תיקון 13'));
});

// ---------------------------------------------------------------------------
//  03 generate — bilingual body for every section
// ---------------------------------------------------------------------------

test('03 generate produces bilingual HE+EN body for every section', () => {
  const g = mkGen();
  const policy = g.generate(FULL_INPUT);
  for (const s of policy.sections) {
    assert.ok(s.body.he && typeof s.body.he === 'string', `missing HE body for ${s.key}`);
    assert.ok(s.body.en && typeof s.body.en === 'string', `missing EN body for ${s.key}`);
    // At least one Hebrew letter in the HE body.
    assert.match(s.body.he, /[\u0590-\u05FF]/, `no Hebrew letters for ${s.key}`);
    // English body should contain ASCII letters.
    assert.match(s.body.en, /[A-Za-z]/, `no English letters for ${s.key}`);
    // Every section carries its statutory citation.
    assert.equal(s.citation, LAW_CITATIONS[s.key]);
  }
});

// ---------------------------------------------------------------------------
//  04 generate — DPO explicit when hasDPO=true
// ---------------------------------------------------------------------------

test('04 generate produces explicit DPO section when hasDPO=true', () => {
  const g = mkGen();
  const policy = g.generate(FULL_INPUT);
  const dpo = policy.sections.find(s => s.key === 'dpo-contact');
  assert.ok(dpo, 'dpo-contact section missing');
  assert.ok(dpo.body.he.includes('עדי לוי'), 'HE DPO name missing');
  assert.ok(dpo.body.he.includes('dpo@technokol.co.il'), 'HE DPO email missing');
  assert.ok(dpo.body.en.includes('עדי לוי') || dpo.body.en.includes('Adi') || dpo.body.en.includes('dpo@technokol.co.il'),
    'EN DPO contact info missing');
  assert.ok(dpo.citation.includes('17ב1'), 'DPO citation should reference §17B1');
});

// ---------------------------------------------------------------------------
//  05 generate — DPO section present (opt-out) when hasDPO=false
// ---------------------------------------------------------------------------

test('05 generate keeps DPO section present but explains opt-out when hasDPO=false', () => {
  const g = mkGen();
  const policy = g.generate({ ...FULL_INPUT, hasDPO: false, dpo: null });
  const dpo = policy.sections.find(s => s.key === 'dpo-contact');
  assert.ok(dpo, 'dpo-contact section still required even when no DPO');
  assert.ok(/אינה חייבת|17ב1/.test(dpo.body.he), 'opt-out language missing');
  assert.ok(/not.*required|Amendment 13/.test(dpo.body.en), 'EN opt-out language missing');
  // Eleven sections must still be present
  assert.equal(policy.sections.length, 11);
});

// ---------------------------------------------------------------------------
//  06 generate — throws on missing HE name
// ---------------------------------------------------------------------------

test('06 generate throws when companyName_he missing', () => {
  const g = mkGen();
  assert.throws(() => g.generate({ ...FULL_INPUT, companyName_he: '' }), /companyName_he/);
  assert.throws(() => g.generate(null), /opts required/);
});

// ---------------------------------------------------------------------------
//  07 generate — invalid tone
// ---------------------------------------------------------------------------

test('07 generate rejects invalid tone values', () => {
  const g = mkGen();
  assert.throws(() => g.generate({ ...FULL_INPUT, tone: 'funny' }), /tone/);
  // Both valid tones must succeed.
  assert.ok(g.generate({ ...FULL_INPUT, tone: 'plain' }));
  assert.ok(g.generate({ ...FULL_INPUT, tone: 'formal' }));
});

// ---------------------------------------------------------------------------
//  08 validatePolicy — detects missing section in free text
// ---------------------------------------------------------------------------

test('08 validatePolicy detects a missing section in a rendered string', () => {
  const g = mkGen();
  const policy = g.generate(FULL_INPUT);
  // Remove the "international-transfers" section entirely — its Hebrew title
  // ("העברה בינלאומית") is unique enough that stripping every occurrence
  // leaves a realistic tamper signature for the validator.
  const tampered = g.exportMarkdown(policy)
    .split('\n')
    .filter(line =>
      !line.includes(SECTION_TITLES['international-transfers'].he) &&
      !line.includes(SECTION_TITLES['international-transfers'].en))
    .join('\n')
    // Scrub any remaining body mentions that could false-positive the check.
    .replace(new RegExp(SECTION_TITLES['international-transfers'].he, 'g'), '')
    .replace(new RegExp(SECTION_TITLES['international-transfers'].en, 'g'), '');
  const result = g.validatePolicy(tampered);
  assert.equal(result.ok, false);
  assert.ok(result.missing.includes('international-transfers'));
  assert.equal(result.missing.length, 1);
});

// ---------------------------------------------------------------------------
//  09 validatePolicy — accepts full markdown
// ---------------------------------------------------------------------------

test('09 validatePolicy accepts a freshly-generated markdown policy', () => {
  const g = mkGen();
  const policy = g.generate(FULL_INPUT);
  const md = g.exportMarkdown(policy);
  const result = g.validatePolicy(md);
  assert.equal(result.ok, true);
  assert.deepEqual(result.missing, []);
});

// ---------------------------------------------------------------------------
//  10 validatePolicy — accepts policy object
// ---------------------------------------------------------------------------

test('10 validatePolicy accepts a policy object by section keys', () => {
  const g = mkGen();
  const policy = g.generate(FULL_INPUT);
  const result = g.validatePolicy(policy);
  assert.equal(result.ok, true);
  assert.deepEqual(result.missing, []);
  // Remove a section manually.
  const broken = { ...policy, sections: policy.sections.filter(s => s.key !== 'contact-us') };
  const r2 = g.validatePolicy(broken);
  assert.equal(r2.ok, false);
  assert.deepEqual(r2.missing, ['contact-us']);
});

// ---------------------------------------------------------------------------
//  11 versionPolicy — ISO + immutable
// ---------------------------------------------------------------------------

test('11 versionPolicy attaches version + ISO date and is frozen', () => {
  const g = mkGen();
  const policy = g.generate(FULL_INPUT);
  const v1 = g.versionPolicy(policy, { version: '1.0.0', effectiveDate: '2026-05-01' });
  assert.equal(v1.meta.version, '1.0.0');
  assert.equal(v1.meta.effectiveDate, '2026-05-01');
  assert.ok(v1.meta.publishedAt, 'publishedAt should exist');
  assert.ok(Object.isFrozen(v1), 'top-level should be frozen');
  assert.ok(Object.isFrozen(v1.meta), 'meta should be frozen');
  // Original policy must NOT be mutated (never-delete invariant).
  assert.equal(policy.meta.version, undefined);
});

// ---------------------------------------------------------------------------
//  12 versionPolicy — missing version
// ---------------------------------------------------------------------------

test('12 versionPolicy throws when version missing', () => {
  const g = mkGen();
  const policy = g.generate(FULL_INPUT);
  assert.throws(() => g.versionPolicy(policy, {}), /version required/);
  assert.throws(() => g.versionPolicy(null, { version: '1' }), /policy required/);
});

// ---------------------------------------------------------------------------
//  13 diffVersions — added/removed/changed
// ---------------------------------------------------------------------------

test('13 diffVersions highlights added / removed / changed sections', () => {
  const g = mkGen();
  const base = g.generate(FULL_INPUT);
  const v1 = g.versionPolicy(base, { version: '1.0.0', effectiveDate: '2026-01-01' });

  // v2 has a different set of purposes + add a fake section + remove contact-us.
  const v2raw = g.generate({ ...FULL_INPUT, purposes: ['dramatically different purpose'] });
  const clonedSections = v2raw.sections
    .filter(s => s.key !== 'contact-us')
    .concat([{ key: 'cookies', title: { he: 'עוגיות', en: 'Cookies' }, body: { he: 'x', en: 'x' }, citation: 'n/a' }]);
  const v2 = g.versionPolicy({ ...v2raw, sections: clonedSections }, { version: '1.1.0', effectiveDate: '2026-02-01' });

  const diff = g.diffVersions(v1, v2);
  assert.ok(diff.added.includes('cookies'));
  assert.ok(diff.removed.includes('contact-us'));
  assert.ok(diff.changed.includes('why-we-collect'), 'why-we-collect should be detected as changed');
  assert.equal(diff.from, '1.0.0');
  assert.equal(diff.to, '1.1.0');
});

// ---------------------------------------------------------------------------
//  14 generateChangeNotice — bilingual
// ---------------------------------------------------------------------------

test('14 generateChangeNotice produces bilingual notice referencing Amendment 13', () => {
  const g = mkGen();
  const base = g.generate(FULL_INPUT);
  const v1 = g.versionPolicy(base, { version: '1.0.0', effectiveDate: '2026-01-01' });
  const v2raw = g.generate({ ...FULL_INPUT, purposes: ['new fancy purpose'] });
  const v2 = g.versionPolicy(v2raw, { version: '1.1.0', effectiveDate: '2026-02-01' });

  const notice = g.generateChangeNotice(v1, v2, ['s1', 's2', 's3']);
  assert.equal(notice.affectedCount, 3);
  assert.equal(notice.effectiveDate, '2026-02-01');
  assert.ok(notice.he.includes('תיקון 13'), 'HE notice must cite Amendment 13');
  assert.ok(notice.en.includes('Amendment 13'), 'EN notice must cite Amendment 13');
  assert.ok(notice.he.includes('עודכנה'), 'HE must list updated sections');
  assert.ok(notice.en.includes('Updated'), 'EN must list updated sections');
});

// ---------------------------------------------------------------------------
//  15 localizeSection — Hebrew
// ---------------------------------------------------------------------------

test('15 localizeSection returns Hebrew title + citation', () => {
  const g = mkGen();
  const loc = g.localizeSection('data-subject-rights', 'he');
  assert.equal(loc.title, 'זכויות נושא המידע');
  assert.match(loc.citation, /סעיפים 13.*14א/);
});

// ---------------------------------------------------------------------------
//  16 localizeSection — English
// ---------------------------------------------------------------------------

test('16 localizeSection returns English title for every required key', () => {
  const g = mkGen();
  for (const key of REQUIRED_SECTIONS) {
    const loc = g.localizeSection(key, 'en');
    assert.equal(loc.title, SECTION_TITLES[key].en);
    assert.equal(loc.citation, LAW_CITATIONS[key]);
  }
});

// ---------------------------------------------------------------------------
//  17 localizeSection — invalid input
// ---------------------------------------------------------------------------

test('17 localizeSection throws on unknown key or bad lang', () => {
  const g = mkGen();
  assert.throws(() => g.localizeSection('nope', 'he'), /unknown section/);
  assert.throws(() => g.localizeSection('who-we-are', 'fr'), /lang/);
});

// ---------------------------------------------------------------------------
//  18 exportMarkdown — every title present
// ---------------------------------------------------------------------------

test('18 exportMarkdown contains every required section heading', () => {
  const g = mkGen();
  const policy = g.generate(FULL_INPUT);
  const v = g.versionPolicy(policy, { version: '1.0.0', effectiveDate: '2026-04-11' });
  const md = g.exportMarkdown(v);
  for (const key of REQUIRED_SECTIONS) {
    const t = SECTION_TITLES[key];
    assert.ok(md.includes(t.he), `markdown missing HE title for ${key}`);
    assert.ok(md.includes(t.en), `markdown missing EN title for ${key}`);
  }
  assert.ok(md.includes('1.0.0'));
  assert.ok(md.includes('2026-04-11'));
});

// ---------------------------------------------------------------------------
//  19 exportHTML — RTL + lang=he + all titles
// ---------------------------------------------------------------------------

test('19 exportHTML emits RTL html with lang=he and every title', () => {
  const g = mkGen();
  const policy = g.generate(FULL_INPUT);
  const html = g.exportHTML(policy);
  assert.match(html, /<html lang="he" dir="rtl">/);
  assert.match(html, /<meta charset="utf-8">/);
  for (const key of REQUIRED_SECTIONS) {
    const t = SECTION_TITLES[key];
    assert.ok(html.includes(t.he), `HTML missing HE title for ${key}`);
    assert.ok(html.includes(t.en), `HTML missing EN title for ${key}`);
  }
  // Sanity: the style block must carry the RTL class.
  assert.match(html, /direction:ltr/);
});

// ---------------------------------------------------------------------------
//  20 exportPlainText
// ---------------------------------------------------------------------------

test('20 exportPlainText includes every numbered section and dividers', () => {
  const g = mkGen();
  const policy = g.generate(FULL_INPUT);
  const txt = g.exportPlainText(policy);
  for (let i = 1; i <= 11; i += 1) {
    assert.ok(txt.includes(`${i}. `), `plain text missing entry ${i}`);
  }
  for (const key of REQUIRED_SECTIONS) {
    assert.ok(txt.includes(SECTION_TITLES[key].he));
    assert.ok(txt.includes(SECTION_TITLES[key].en));
  }
  assert.ok(txt.includes('='.repeat(64)));
});

// ---------------------------------------------------------------------------
//  21 readabilityScore — English
// ---------------------------------------------------------------------------

test('21 readabilityScore returns a numeric Flesch value for English text', () => {
  const g = mkGen();
  const easy = 'The cat sat on the mat. The dog ran. It was fun.';
  const hard = 'Notwithstanding the indefatigable bureaucratic entrenchment of pseudodemocratic institutional frameworks, administrative reconfigurations remain epistemologically intractable.';
  const sEasy = g.readabilityScore(easy, 'en');
  const sHard = g.readabilityScore(hard, 'en');
  assert.ok(Number.isFinite(sEasy));
  assert.ok(Number.isFinite(sHard));
  assert.ok(sEasy >= 0 && sEasy <= 100);
  assert.ok(sEasy > sHard, `easy (${sEasy}) should score higher than hard (${sHard})`);
  assert.equal(g.readabilityScore('', 'en'), 0);
});

// ---------------------------------------------------------------------------
//  22 readabilityScore — Hebrew
// ---------------------------------------------------------------------------

test('22 readabilityScore handles Hebrew and validates lang', () => {
  const g = mkGen();
  const he = 'אנחנו אוספים מידע בסיסי בלבד. הזכויות שלך שמורות. הכל שקוף.';
  const score = g.readabilityScore(he, 'he');
  assert.ok(Number.isFinite(score));
  assert.ok(score >= 0 && score <= 100);
  assert.throws(() => g.readabilityScore('x', 'de'), /lang/);
});
