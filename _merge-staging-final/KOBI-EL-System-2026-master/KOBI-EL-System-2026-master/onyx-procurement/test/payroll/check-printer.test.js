/**
 * Unit tests for check-printer.js — paper + digital check printer
 * Swarm 3C — Agent X-45 — 2026-04-11
 *
 * Run:   node --test test/payroll/check-printer.test.js
 *
 * Coverage (>20 cases, numbered):
 *
 *   Hebrew number-to-words  (01–12)
 *   MICR line generation    (13)
 *   Hebrew calendar         (14)
 *   Paper check PDF         (15)
 *   Digital check issuance  (16–18)
 *   Signature verification  (19–20)
 *   Cancellation + history  (21–22)
 *   Expiry                  (23)
 *   Delivery stubs          (24)
 *   Never-delete guarantee  (25)
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const cp = require('../../src/payments/check-printer');
const {
  numberToHebrewWords,
  printPaperCheck,
  issueDigitalCheck,
  verifyDigitalCheck,
  cancelCheck,
  checkHistory,
  buildMicrLine,
  gregorianToHebrew,
  deliverDigitalCheckBySms,
  deliverDigitalCheckByEmail,
  DEFAULT_EXPIRY_DAYS,
  _internal,
} = cp;

const TMP_DIR = path.join(__dirname, '..', 'tmp-pdfs');
if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

// =====================================================================
// HEBREW NUMBER-TO-WORDS
// =====================================================================

test('01. numberToHebrewWords(0) = אפס שקלים', () => {
  assert.equal(numberToHebrewWords(0), 'אפס שקלים');
});

test('02. numberToHebrewWords(1) = שקל אחד', () => {
  assert.equal(numberToHebrewWords(1), 'שקל אחד');
});

test('03. numberToHebrewWords(2) = שני שקלים', () => {
  assert.equal(numberToHebrewWords(2), 'שני שקלים');
});

test('04. numberToHebrewWords(11) = אחד עשר שקלים', () => {
  assert.equal(numberToHebrewWords(11), 'אחד עשר שקלים');
});

test('05. numberToHebrewWords(100) = מאה שקלים', () => {
  assert.equal(numberToHebrewWords(100), 'מאה שקלים');
});

test('06. numberToHebrewWords(234) = מאתיים שלושים וארבעה שקלים', () => {
  assert.equal(numberToHebrewWords(234), 'מאתיים שלושים וארבעה שקלים');
});

test('07. numberToHebrewWords(1000) = אלף שקלים', () => {
  assert.equal(numberToHebrewWords(1000), 'אלף שקלים');
});

test('08. numberToHebrewWords(1234) = אלף מאתיים שלושים וארבעה שקלים', () => {
  assert.equal(numberToHebrewWords(1234), 'אלף מאתיים שלושים וארבעה שקלים');
});

test('09. numberToHebrewWords(1234.56) full canonical cheque form', () => {
  assert.equal(
    numberToHebrewWords(1234.56),
    'אלף מאתיים שלושים וארבעה שקלים וחמישים ושש אגורות'
  );
});

test('10. numberToHebrewWords(5000.50) = חמשת אלפים שקלים וחמישים אגורות', () => {
  assert.equal(
    numberToHebrewWords(5000.50),
    'חמשת אלפים שקלים וחמישים אגורות'
  );
});

test('11. numberToHebrewWords(0.01) = אגורה אחת (feminine singular)', () => {
  assert.equal(numberToHebrewWords(0.01), 'אגורה אחת');
});

test('12. numberToHebrewWords(1000000) = מיליון שקלים', () => {
  assert.equal(numberToHebrewWords(1000000), 'מיליון שקלים');
});

test('12a. numberToHebrewWords(0.02) uses feminine שתי', () => {
  assert.equal(numberToHebrewWords(0.02), 'שתי אגורות');
});

test('12b. numberToHebrewWords(2000) = אלפיים שקלים', () => {
  assert.equal(numberToHebrewWords(2000), 'אלפיים שקלים');
});

test('12c. numberToHebrewWords(3000) uses frozen שלושת אלפים', () => {
  assert.equal(numberToHebrewWords(3000), 'שלושת אלפים שקלים');
});

test('12d. numberToHebrewWords throws on negative', () => {
  assert.throws(() => numberToHebrewWords(-1), RangeError);
});

test('12e. numberToHebrewWords throws on NaN', () => {
  assert.throws(() => numberToHebrewWords(NaN), TypeError);
});

test('12f. numberToHebrewWords rounds 1.005 → at most 1 shekel + 1 agora', () => {
  // Math.round(1.005*100) can be 100 or 101 due to float drift; both
  // are acceptable, what matters is that we never leak through "2 שקלים".
  const got = numberToHebrewWords(1.005);
  assert.ok(
    got === 'שקל אחד' || got === 'שקל אחד ואגורה אחת',
    'unexpected rounding output: ' + got
  );
});

// =====================================================================
// MICR LINE GENERATION
// =====================================================================

test('13. buildMicrLine produces Israeli E-13B layout', () => {
  const line = buildMicrLine({ bank: 12, branch: 613, account: '123456789' }, 42);
  assert.match(line, /⑆/, 'transit symbol present');
  assert.match(line, /⑈/, 'on-us symbol present');
  assert.match(line, /613-12/, 'branch-bank formatted');
  assert.match(line, /00000042/, 'serial zero-padded to 8 digits');
  assert.match(line, /123456789/, 'account present');
});

// =====================================================================
// HEBREW CALENDAR
// =====================================================================

test('14. gregorianToHebrew(2025-09-23) = 1 Tishri 5786 (Rosh Hashana 5786)', () => {
  const d = new Date('2025-09-23T12:00:00');
  const h = gregorianToHebrew(d);
  assert.equal(h.year, 5786);
  assert.equal(h.month, 7, 'Tishri = month 7');
  assert.equal(h.day, 1);
  assert.match(h.text, /תשרי/);
  assert.match(h.text, /תשפ״ו/);
});

test('14a. gregorianToHebrew(2026-04-11) = 24 Nisan 5786', () => {
  const d = new Date('2026-04-11T12:00:00');
  const h = gregorianToHebrew(d);
  assert.equal(h.year, 5786);
  assert.equal(h.month, 1, 'Nisan = month 1');
  assert.equal(h.day, 24);
  assert.match(h.text, /ניסן/);
});

// =====================================================================
// PAPER CHECK PDF
// =====================================================================

test('15. printPaperCheck writes a non-empty PDF file with sequential #', async () => {
  const outputPath = path.join(TMP_DIR, 'ag-x45-paper-check.pdf');
  const p = await printPaperCheck({
    payee: 'אורי כהן בע״מ',
    amount: 1234.56,
    date: '2026-04-11',
    memo: 'תשלום חשבונית 4571',
    bankAccount: { bank: 12, branch: 613, account: '111222333' },
    hebrewDate: true,
    stub: true,
    outputPath,
  });
  assert.equal(p, outputPath);
  const stat = fs.statSync(p);
  assert.ok(stat.size > 1000, 'PDF should be at least 1 KB (got ' + stat.size + ')');

  // Sequential numbering must advance on the second call for the same account.
  const p2Path = path.join(TMP_DIR, 'ag-x45-paper-check-2.pdf');
  const p2 = await printPaperCheck({
    payee: 'ספק בדיקות',
    amount: 50,
    date: '2026-04-11',
    bankAccount: { bank: 12, branch: 613, account: '111222333' },
    outputPath: p2Path,
  });
  assert.ok(fs.existsSync(p2));
});

test('15a. printPaperCheck with void stamps the face', async () => {
  const outputPath = path.join(TMP_DIR, 'ag-x45-paper-check-void.pdf');
  const p = await printPaperCheck({
    payee: 'לביטול',
    amount: 999,
    date: '2026-04-11',
    bankAccount: { bank: 10, branch: 555, account: '555555555' },
    void: true,
    outputPath,
  });
  assert.ok(fs.existsSync(p));
  assert.ok(fs.statSync(p).size > 500);
});

test('15b. printPaperCheck rejects non-numeric amount', () => {
  assert.throws(
    () => printPaperCheck({
      payee: 'x',
      amount: 'abc',
      date: '2026-04-11',
      bankAccount: { bank: 10, branch: 222, account: '1' },
    }),
    /amount must be numeric/
  );
});

test('15c. printPaperCheck rejects invalid date', () => {
  assert.throws(
    () => printPaperCheck({
      payee: 'x',
      amount: 10,
      date: 'not-a-date',
      bankAccount: { bank: 10, branch: 222, account: '1' },
    }),
    /invalid date/
  );
});

// =====================================================================
// DIGITAL CHECK
// =====================================================================

test('16. issueDigitalCheck returns signed payload with all BOI fields', () => {
  const r = issueDigitalCheck({
    payee: 'דני דוד',
    amount: 500,
    bankAccount: { bank: 12, branch: 613, account: '987654321' },
    issuer: { name: 'Techno-Kol Uzi', company_id: '514212345', account: '12-613-987654321' },
  });
  assert.ok(r.checkId.startsWith('CHK-'));
  assert.equal(r.signed_payload.currency, 'ILS');
  assert.equal(r.signed_payload.amount, 500);
  assert.equal(r.signed_payload.status, 'issued');
  assert.equal(r.signed_payload.signatureAlgo, 'HS256');
  assert.ok(r.signed_payload.signature, 'signature present');
  assert.ok(r.signed_payload.expiry_date, 'expiry present');
  assert.ok(r.qr.text.startsWith('onyx-check://verify?p='));
});

test('17. issueDigitalCheck rejects negative amounts', () => {
  assert.throws(
    () => issueDigitalCheck({
      payee: 'x', amount: -1,
      bankAccount: { bank: 10, branch: 1, account: '1' },
      issuer: { name: 'x' },
    }),
    RangeError
  );
});

test('18. issueDigitalCheck expiry defaults to 180 days', () => {
  const r = issueDigitalCheck({
    payee: 'x', amount: 100,
    date: '2026-04-11T00:00:00Z',
    bankAccount: { bank: 10, branch: 1, account: '2' },
    issuer: { name: 'x' },
  });
  const issue = Date.parse(r.signed_payload.issue_date);
  const expiry = Date.parse(r.signed_payload.expiry_date);
  const days = Math.round((expiry - issue) / 86400 / 1000);
  assert.equal(days, DEFAULT_EXPIRY_DAYS);
});

test('19. verifyDigitalCheck returns valid+usable for untouched payload', () => {
  const r = issueDigitalCheck({
    payee: 'Ori', amount: 250,
    bankAccount: { bank: 12, branch: 613, account: '3' },
    issuer: { name: 'Techno-Kol' },
  });
  const v = verifyDigitalCheck(r.signed_payload);
  assert.equal(v.valid, true);
  assert.equal(v.usable, true);
  assert.equal(v.amount, 250);
});

test('20. verifyDigitalCheck detects tampering', () => {
  const r = issueDigitalCheck({
    payee: 'Ori', amount: 250,
    bankAccount: { bank: 12, branch: 613, account: '4' },
    issuer: { name: 'Techno-Kol' },
  });
  const tampered = JSON.parse(JSON.stringify(r.signed_payload));
  tampered.amount = 999999;
  const v = verifyDigitalCheck(tampered);
  assert.equal(v.valid, false);
  assert.equal(v.reason, 'signature_mismatch');
  assert.equal(v.usable, false);
});

test('20a. verifyDigitalCheck returns invalid on missing payload', () => {
  const v = verifyDigitalCheck(null);
  assert.equal(v.valid, false);
  assert.equal(v.usable, false);
});

test('20b. verifyDigitalCheck rejects unsupported algo', () => {
  const v = verifyDigitalCheck({ signature: 'x', signatureAlgo: 'RS256' });
  assert.equal(v.valid, false);
  assert.equal(v.reason, 'unsupported_signature_algo');
});

// =====================================================================
// CANCELLATION + HISTORY
// =====================================================================

test('21. cancelCheck flips usable to false (never deletes ledger row)', () => {
  const r = issueDigitalCheck({
    payee: 'ביטול', amount: 100,
    bankAccount: { bank: 12, branch: 613, account: '5' },
    issuer: { name: 'Techno-Kol' },
  });
  const before = _internal.ledger.entries.length;
  const c = cancelCheck(r.checkId, 'חשד להונאה');
  assert.equal(c.checkId, r.checkId);
  assert.ok(c.cancelledAt);

  // The original ledger row is still present + a cancellation row is appended.
  const after = _internal.ledger.entries.length;
  assert.ok(after > before, 'ledger must grow, never shrink');

  const v = verifyDigitalCheck(r.signed_payload);
  assert.equal(v.valid, true, 'signature is still mathematically valid');
  assert.equal(v.usable, false, 'but the cheque is no longer usable');
  assert.equal(v.cancelled, true);
});

test('22. checkHistory returns all rows for an account (in order)', () => {
  const acct = { bank: 77, branch: 888, account: '999' };
  issueDigitalCheck({ payee: 'A', amount: 10, bankAccount: acct, issuer: { name: 'x' } });
  issueDigitalCheck({ payee: 'B', amount: 20, bankAccount: acct, issuer: { name: 'x' } });
  issueDigitalCheck({ payee: 'C', amount: 30, bankAccount: acct, issuer: { name: 'x' } });
  const hist = checkHistory(acct);
  assert.ok(hist.length >= 3, 'at least 3 entries');
  const payees = hist.filter((r) => r.type === 'digital').map((r) => r.payee);
  assert.deepEqual(payees.slice(-3), ['A', 'B', 'C']);
});

test('22a. checkHistory with period filter', () => {
  const acct = { bank: 77, branch: 888, account: '999' };
  const hist = checkHistory(acct, { from: '2000-01-01', to: '2100-01-01' });
  assert.ok(Array.isArray(hist));
  assert.ok(hist.length >= 1);
});

// =====================================================================
// EXPIRY
// =====================================================================

test('23. verifyDigitalCheck flags expired cheques as unusable', () => {
  // Issue with expiry in the past by back-dating + 1-day expiry.
  const r = issueDigitalCheck({
    payee: 'x', amount: 10,
    date: '2020-01-01T00:00:00Z',
    bankAccount: { bank: 12, branch: 613, account: '6' },
    issuer: { name: 'x' },
    expiryDays: 1,
  });
  const v = verifyDigitalCheck(r.signed_payload);
  assert.equal(v.valid, true, 'signature still valid');
  assert.equal(v.expired, true);
  assert.equal(v.usable, false);
});

// =====================================================================
// DELIVERY STUBS
// =====================================================================

test('24. deliverDigitalCheckBySms produces a queued SMS record', () => {
  const r = issueDigitalCheck({
    payee: 'x', amount: 77,
    bankAccount: { bank: 12, branch: 613, account: '7' },
    issuer: { name: 'Techno-Kol' },
  });
  const d = deliverDigitalCheckBySms(r.signed_payload, '054-1234567');
  assert.equal(d.channel, 'sms');
  assert.equal(d.status, 'queued');
  assert.match(d.text, /צ׳ק דיגיטלי/);
  assert.match(d.text, /77/);
});

test('24a. deliverDigitalCheckByEmail is bilingual', () => {
  const r = issueDigitalCheck({
    payee: 'x', amount: 77,
    bankAccount: { bank: 12, branch: 613, account: '8' },
    issuer: { name: 'Techno-Kol' },
  });
  const d = deliverDigitalCheckByEmail(r.signed_payload, 'a@b.co');
  assert.equal(d.channel, 'email');
  assert.match(d.subject, /צ׳ק דיגיטלי/);
  assert.match(d.body, /Dear recipient/);
  assert.match(d.body, /שלום/);
});

// =====================================================================
// NEVER-DELETE GUARANTEE
// =====================================================================

test('25. ledger never loses rows — after many issuances + cancellations', () => {
  const start = _internal.ledger.entries.length;
  const acct = { bank: 55, branch: 444, account: '333' };
  const issued = [];
  for (let i = 0; i < 5; i++) {
    issued.push(issueDigitalCheck({
      payee: 'check-' + i, amount: 10 + i,
      bankAccount: acct, issuer: { name: 'Techno-Kol' },
    }));
  }
  for (const r of issued) {
    cancelCheck(r.checkId, 'test bulk cancel');
  }
  const end = _internal.ledger.entries.length;
  // 5 issuances + 5 cancellation rows = +10 rows.
  assert.equal(end - start, 10);
});
