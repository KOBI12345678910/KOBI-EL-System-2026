/**
 * Unit tests for RedactionTool — document PII redaction tool
 * Agent Y-118 — written 2026-04-11
 *
 * Run:   node --test test/docs/redaction.test.js
 *
 * Coverage (>=20 tests):
 *   01. isValidIsraeliTZ — checksum math on known values
 *   02. isValidLuhn — golden Visa/Amex/MasterCard PANs
 *   03. detectPII — Israeli TZ with checksum
 *   04. detectPII — invalid TZ checksum ignored
 *   05. detectPII — Israeli mobile phone 05X format
 *   06. detectPII — +972 international phone format
 *   07. detectPII — email address
 *   08. detectPII — credit card (Luhn-valid)
 *   09. detectPII — credit card (Luhn-invalid rejected)
 *   10. detectPII — IL IBAN
 *   11. detectPII — passport with Hebrew context
 *   12. detectPII — ת.ז. keyword
 *   13. detectPII — Hebrew dictionary name
 *   14. detectPII — Hebrew address triple
 *   15. redactText — BLOCK method length-preserving ████
 *   16. redactText — REPLACE method emits [REDACTED]
 *   17. redactText — HASH method emits HASH:: prefix
 *   18. redactText — TOKENIZE yields reversible vault tokens
 *   19. reverseRedaction — round-trips through TOKENIZE
 *   20. reverseRedaction — RBAC denies untrusted role
 *   21. redactWithRules — custom regex rule list
 *   22. createRedactionMap — captures divergent spans
 *   23. verifyNoPII — clean input returns safe:true
 *   24. verifyNoPII — dirty input lists leftover hits
 *   25. whitelistTerms — protects literal term from redaction
 *   26. visualDiff — highlights what changed
 *   27. batchRedact — processes multiple docs + logs per-docId
 *   28. exportRedactionLog — returns append-only audit trail
 *   29. classifyPIIType — groups hits by category + sorted types
 *   30. redactText — categories filter restricts the scope
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  RedactionTool,
  PII_CATEGORIES,
  REDACTION_METHODS,
  isValidIsraeliTZ,
  isValidLuhn,
  sha256Hex,
  blockString,
} = require('../../src/docs/redaction');

/* ---------- 01 ---------- */
test('01 isValidIsraeliTZ — known checksum values', () => {
  assert.equal(isValidIsraeliTZ('123456782'), true);
  assert.equal(isValidIsraeliTZ('987654324'), true);
  assert.equal(isValidIsraeliTZ('200000008'), true);
  assert.equal(isValidIsraeliTZ('111111118'), true);
  assert.equal(isValidIsraeliTZ('000000018'), true);
  assert.equal(isValidIsraeliTZ('123456789'), false);
  assert.equal(isValidIsraeliTZ('000000000'), true); // sums to 0
  assert.equal(isValidIsraeliTZ('abcdefghi'), false);
});

/* ---------- 02 ---------- */
test('02 isValidLuhn — standard PAN test vectors', () => {
  // Visa
  assert.equal(isValidLuhn('4111111111111111'), true);
  // MasterCard
  assert.equal(isValidLuhn('5500000000000004'), true);
  // Amex
  assert.equal(isValidLuhn('378282246310005'), true);
  // Stripe test card
  assert.equal(isValidLuhn('4242424242424242'), true);
  // Invalid
  assert.equal(isValidLuhn('4111111111111112'), false);
  assert.equal(isValidLuhn('1234567890123456'), false);
  // Too short / too long
  assert.equal(isValidLuhn('411111'), false);
  assert.equal(isValidLuhn('41111111111111111111'), false);
});

/* ---------- 03 ---------- */
test('03 detectPII — Israeli TZ (9 digits + checksum)', () => {
  const t = new RedactionTool();
  const hits = t.detectPII('הלקוח משה 123456782 ביקש חשבונית');
  const tzHits = hits.filter(h => h.category === 'tz');
  assert.equal(tzHits.length, 1);
  assert.equal(tzHits[0].extracted, '123456782');
});

/* ---------- 04 ---------- */
test('04 detectPII — invalid TZ checksum ignored', () => {
  const t = new RedactionTool();
  const hits = t.detectPII('מספר שגוי 123456789 לא אמור להתפס');
  const tzHits = hits.filter(h => h.category === 'tz');
  assert.equal(tzHits.length, 0);
});

/* ---------- 05 ---------- */
test('05 detectPII — Israeli mobile 05X-XXXXXXX format', () => {
  const t = new RedactionTool();
  const hits = t.detectPII('ניתן להשיג אותי ב 052-1234567');
  const phoneHits = hits.filter(h => h.category === 'phone');
  assert.equal(phoneHits.length, 1);
  assert.ok(phoneHits[0].match.includes('052'));
});

/* ---------- 06 ---------- */
test('06 detectPII — +972 international phone format', () => {
  const t = new RedactionTool();
  const hits = t.detectPII('Call me at +972-54-1234567 tomorrow');
  const phoneHits = hits.filter(h => h.category === 'phone');
  assert.equal(phoneHits.length, 1);
  assert.ok(phoneHits[0].match.includes('+972'));
});

/* ---------- 07 ---------- */
test('07 detectPII — email address', () => {
  const t = new RedactionTool();
  const hits = t.detectPII('Contact: kobi.el@technokol.example.co.il for details');
  const emailHits = hits.filter(h => h.category === 'email');
  assert.equal(emailHits.length, 1);
  assert.equal(emailHits[0].match, 'kobi.el@technokol.example.co.il');
});

/* ---------- 08 ---------- */
test('08 detectPII — credit card Luhn-valid', () => {
  const t = new RedactionTool();
  const hits = t.detectPII('PAN 4111 1111 1111 1111 was used');
  const ccHits = hits.filter(h => h.category === 'credit_card');
  assert.equal(ccHits.length, 1);
  assert.ok(ccHits[0].match.replace(/\D/g, '').length === 16);
});

/* ---------- 09 ---------- */
test('09 detectPII — invalid Luhn PAN rejected', () => {
  const t = new RedactionTool();
  const hits = t.detectPII('Fake card: 1234567890123456 should not match');
  const ccHits = hits.filter(h => h.category === 'credit_card');
  assert.equal(ccHits.length, 0);
});

/* ---------- 10 ---------- */
test('10 detectPII — IL IBAN', () => {
  const t = new RedactionTool();
  const hits = t.detectPII('Wire to IL620108000000099999999 please');
  const ibHits = hits.filter(h => h.category === 'iban_il');
  assert.equal(ibHits.length, 1);
});

/* ---------- 11 ---------- */
test('11 detectPII — passport with Hebrew context word', () => {
  const t = new RedactionTool();
  const hits = t.detectPII('דרכון 12345678 מונפק');
  const ppHits = hits.filter(h => h.category === 'passport');
  assert.equal(ppHits.length, 1);
});

/* ---------- 12 ---------- */
test('12 detectPII — ת.ז. keyword context', () => {
  const t = new RedactionTool();
  const hits = t.detectPII('ת.ז. 123456782 של הלקוח');
  // Either the id_keyword or tz match is acceptable — both cover PII.
  const either = hits.filter(h => h.category === 'id_keyword' || h.category === 'tz');
  assert.ok(either.length >= 1, 'expected at least one id_keyword or tz hit');
});

/* ---------- 13 ---------- */
test('13 detectPII — Hebrew dictionary name', () => {
  const t = new RedactionTool();
  const hits = t.detectPII('פגישה עם משה בשעה שבע');
  const nameHits = hits.filter(h => h.category === 'hebrew_name');
  assert.equal(nameHits.length, 1);
  assert.equal(nameHits[0].match, 'משה');
});

/* ---------- 14 ---------- */
test('14 detectPII — Hebrew address triple', () => {
  const t = new RedactionTool();
  const hits = t.detectPII('כתובת: רחוב הרצל 10 תל אביב');
  const addrHits = hits.filter(h => h.category === 'address');
  assert.ok(addrHits.length >= 1);
  assert.ok(addrHits[0].match.includes('הרצל'));
});

/* ---------- 15 ---------- */
test('15 redactText — BLOCK method length-preserving ████', () => {
  const t = new RedactionTool();
  const email = 'admin@example.com';
  const res = t.redactText(`Email: ${email}`, { method: 'block' });
  assert.equal(res.method, 'block');
  assert.equal(res.count, 1);
  const expectedBlock = blockString(email.length);
  assert.equal(res.redactedText, `Email: ${expectedBlock}`);
});

/* ---------- 16 ---------- */
test('16 redactText — REPLACE method emits [REDACTED]', () => {
  const t = new RedactionTool();
  const res = t.redactText('Call +972-54-1234567 now', { method: 'replace' });
  assert.equal(res.method, 'replace');
  assert.ok(res.redactedText.includes('[REDACTED]'));
  assert.ok(!res.redactedText.includes('1234567'));
});

/* ---------- 17 ---------- */
test('17 redactText — HASH method emits HASH:: prefix', () => {
  const t = new RedactionTool();
  const email = 'secret@foo.com';
  const res = t.redactText(email, { method: 'hash' });
  const expectedPrefix = sha256Hex(email).slice(0, 10);
  assert.ok(res.redactedText.includes(`HASH::${expectedPrefix}`));
});

/* ---------- 18 ---------- */
test('18 redactText — TOKENIZE yields vault tokens', () => {
  const t = new RedactionTool();
  const res = t.redactText('Email me at alice@wonder.land', { method: 'tokenize' });
  assert.ok(res.vaultKey, 'tokenize must allocate a vaultKey');
  assert.match(res.redactedText, /\{\{TOK:[a-f0-9]{8}\}\}/);
  assert.equal(res.count, 1);
});

/* ---------- 19 ---------- */
test('19 reverseRedaction — round-trip through TOKENIZE', () => {
  const t = new RedactionTool();
  const original = 'Email me at alice@wonder.land today';
  const r1 = t.redactText(original, { method: 'tokenize' });
  const r2 = t.reverseRedaction(r1.redactedText, r1.vaultKey, { role: 'privacy_officer' });
  assert.equal(r2.restoredText, original);
  assert.equal(r2.tokensReplaced, 1);
});

/* ---------- 20 ---------- */
test('20 reverseRedaction — RBAC denies untrusted role', () => {
  const t = new RedactionTool();
  const r1 = t.redactText('Email alice@wonder.land', { method: 'tokenize' });
  assert.throws(
    () => t.reverseRedaction(r1.redactedText, r1.vaultKey, { role: 'analyst' }),
    /RBAC_DENIED/,
  );
});

/* ---------- 21 ---------- */
test('21 redactWithRules — custom regex rule list', () => {
  const t = new RedactionTool();
  const res = t.redactWithRules('Project name: OmegaX — classified', [
    { name: 'project-codename', pattern: /OmegaX/g, replacement: '[CODENAME]' },
  ]);
  assert.ok(res.redactedText.includes('[CODENAME]'));
  assert.equal(res.totalRuleHits, 1);
  assert.equal(res.rulesApplied[0].name, 'project-codename');
});

/* ---------- 22 ---------- */
test('22 createRedactionMap — captures divergent spans', () => {
  const t = new RedactionTool();
  const original = 'Hello alice@wonder.land, welcome.';
  const redacted = 'Hello [REDACTED], welcome.';
  const map = t.createRedactionMap(original, redacted);
  assert.ok(map.totalDivergences >= 1);
  assert.equal(map.entries[0].originalText, 'alice@wonder.land');
  assert.equal(map.entries[0].redactedText, '[REDACTED]');
});

/* ---------- 23 ---------- */
test('23 verifyNoPII — clean input returns safe:true', () => {
  const t = new RedactionTool();
  const res = t.verifyNoPII('This text has no sensitive data at all.');
  assert.equal(res.safe, true);
  assert.equal(res.hits.length, 0);
  assert.equal(res.he, 'נקי מ-PII');
});

/* ---------- 24 ---------- */
test('24 verifyNoPII — dirty input lists leftover hits', () => {
  const t = new RedactionTool();
  const res = t.verifyNoPII('Leaked email: bob@example.com');
  assert.equal(res.safe, false);
  assert.ok(res.hits.length >= 1);
  assert.equal(res.hits[0].category, 'email');
});

/* ---------- 25 ---------- */
test('25 whitelistTerms — protects literal term from redaction', () => {
  const t = new RedactionTool();
  t.whitelistTerms(['support@technokol.co.il']);
  const res = t.redactText('Email support@technokol.co.il for help', { method: 'replace' });
  assert.ok(res.redactedText.includes('support@technokol.co.il'));
  assert.equal(res.count, 0);
});

/* ---------- 26 ---------- */
test('26 visualDiff — highlights what changed', () => {
  const t = new RedactionTool();
  const original = 'Contact: alice@wonder.land';
  const redacted = 'Contact: [REDACTED]';
  const diff = t.visualDiff(original, redacted);
  assert.ok(diff.totalDivergences >= 1);
  assert.ok(diff.highlightedOriginal.includes('\u27EA'));
  assert.ok(diff.highlightedRedacted.includes('\u27E6'));
});

/* ---------- 27 ---------- */
test('27 batchRedact — processes multiple docs + logs per docId', () => {
  const t = new RedactionTool();
  const docs = [
    { id: 'DOC-A', text: 'Email a@b.com', method: 'replace' },
    { id: 'DOC-B', text: 'Phone 052-1234567', method: 'block' },
    { id: 'DOC-C', text: 'Clean text, nothing sensitive', method: 'replace' },
  ];
  const out = t.batchRedact(docs);
  assert.equal(out.total, 3);
  assert.equal(out.succeeded, 3);
  assert.equal(out.failed, 0);
  // logging per-doc
  assert.equal(t.exportRedactionLog('DOC-A').total, 1);
  assert.equal(t.exportRedactionLog('DOC-B').total, 1);
});

/* ---------- 28 ---------- */
test('28 exportRedactionLog — append-only audit trail', () => {
  const t = new RedactionTool({ actor: { id: 'user:42', role: 'privacy_officer', he: 'קצין פרטיות', en: 'Privacy officer' } });
  t.redactText('Email a@b.com', { method: 'replace', docId: 'DOC-X' });
  t.redactText('Phone 052-1234567', { method: 'block', docId: 'DOC-X' });
  const log = t.exportRedactionLog('DOC-X');
  assert.equal(log.total, 2);
  assert.equal(log.entries[0].actor.role, 'privacy_officer');
  assert.ok(log.entries[0].ts);
  assert.ok(log.entries[1].ts);
});

/* ---------- 29 ---------- */
test('29 classifyPIIType — groups hits + sorted types', () => {
  const t = new RedactionTool();
  const info = t.classifyPIIType(
    'Alice a@b.com calls +972-54-1234567 with TZ 123456782 and card 4111 1111 1111 1111',
  );
  assert.ok(info.total >= 4);
  assert.ok(info.types.includes('email'));
  assert.ok(info.types.includes('phone'));
  assert.ok(info.types.includes('tz'));
  assert.ok(info.types.includes('credit_card'));
  // types array must be sorted
  const copy = info.types.slice().sort();
  assert.deepEqual(info.types, copy);
});

/* ---------- 30 ---------- */
test('30 redactText — categories filter restricts the scope', () => {
  const t = new RedactionTool();
  const text = 'Email a@b.com and phone 052-1234567';
  const res = t.redactText(text, { method: 'replace', categories: ['email'] });
  // email gone, phone intact
  assert.ok(!res.redactedText.includes('a@b.com'));
  assert.ok(res.redactedText.includes('052-1234567'));
  assert.equal(res.count, 1);
});

/* ---------- 31 ---------- */
test('31 constants — bilingual labels present', () => {
  assert.equal(PII_CATEGORIES.tz.he, 'תעודת זהות');
  assert.equal(PII_CATEGORIES.email.en, 'Email address');
  assert.equal(REDACTION_METHODS.TOKENIZE.he, 'טוקניזציה');
  assert.equal(REDACTION_METHODS.BLOCK.en, 'Block (████)');
});

/* ---------- 32 ---------- */
test('32 redactText — rejects unknown method', () => {
  const t = new RedactionTool();
  assert.throws(() => t.redactText('x', { method: 'obliterate' }), /METHOD_INVALID/);
});
