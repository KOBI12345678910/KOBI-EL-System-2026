/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AG-Y125 — call-recording.js test suite
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Zero-dependency tests: pure Node `assert`.
 *   run: `node test/comms/call-recording.test.js`
 *
 * Coverage:
 *   1. Consent enforcement — refuses missing / malformed consent (Israeli law)
 *   2. Consent acceptance — one-party and all-party happy path
 *   3. AES-256-GCM encryption round-trip (buffer and string)
 *   4. Tamper detection — auth tag mismatch fails decryption
 *   5. PII redaction — credit card (Luhn), CVV, Israeli ID, phone, email, IBAN
 *   6. PII redaction — respects invalid Luhn, doesn't over-match
 *   7. Action item extraction — Hebrew + English
 *   8. Sentiment trend (positive / neutral / negative)
 *   9. Keyword spotting (legal / complaint / competitor + custom)
 *  10. Summarization bilingual
 *  11. Diarization — explicit markers + fallback alternation
 *  12. Quality scoring — default + custom rubric
 *  13. Access log — auto-entries + manual logAccess
 *  14. Retention policy — never hard-deletes, approval required
 *  15. Legal export — chain of custody + hold flag
 *  16. Transcription pipeline (stub backend) — end-to-end
 *  17. Compliance check — flags missing pieces
 *  18. PII redaction via `piiRedaction({recordingId,...})` persists
 * ═══════════════════════════════════════════════════════════════════════════
 */

'use strict';

const assert = require('assert');
const crypto = require('node:crypto');

const {
  CallRecording,
  createMemoryStorage,
  validateConsent,
  redactPII,
  analyseSentiment,
  extractActions,
  summarizeBilingual,
  spotKeywords,
  diarizeTranscript,
  scoreQuality,
  encryptBuffer,
  decryptBuffer,
  luhnValid,
  israeliIdValid,
  checkCompliance,
  CONSENT_MODELS,
  RECORDING_STATUS,
  DEFAULT_ENCRYPTION,
} = require('../../src/comms/call-recording');

/* ───────────────────────── Tiny test harness ────────────────────────── */

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    const r = fn();
    if (r && typeof r.then === 'function') {
      return r.then(
        () => { passed++; process.stdout.write('.'); },
        (e) => { failed++; failures.push({ name, error: e }); process.stdout.write('F'); }
      );
    }
    passed++;
    process.stdout.write('.');
  } catch (e) {
    failed++;
    failures.push({ name, error: e });
    process.stdout.write('F');
  }
}

async function runAll() {

  /* ═══════════════════ 1. Consent enforcement ═══════════════════ */

  test('validateConsent — missing consent model is refused', () => {
    const r = validateConsent({});
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.reason, 'consent_model_required');
  });

  test('validateConsent — unknown consent string is refused', () => {
    const r = validateConsent({ consent: 'no-party', consentedBy: 'u1', lawfulBasis: 'qa' });
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.reason, 'consent_model_required');
  });

  test('validateConsent — missing consentedBy is refused', () => {
    const r = validateConsent({ consent: 'one-party', lawfulBasis: 'qa' });
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.reason, 'consented_by_user_required');
  });

  test('validateConsent — missing lawfulBasis is refused', () => {
    const r = validateConsent({ consent: 'one-party', consentedBy: 'u1' });
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.reason, 'lawful_basis_required');
  });

  test('validateConsent — all-party without participants is refused', () => {
    const r = validateConsent({
      consent: 'all-party', consentedBy: 'u1', lawfulBasis: 'qa',
    });
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.reason, 'all_party_requires_participants');
  });

  test('validateConsent — all-party with one unconsented participant is refused', () => {
    const r = validateConsent({
      consent: 'all-party', consentedBy: 'u1', lawfulBasis: 'qa',
      participants: [{ id: 'p1', consented: true }, { id: 'p2', consented: false }],
    });
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.reason, 'all_party_missing_consent');
    assert.strictEqual(r.participant, 'p2');
  });

  test('validateConsent — happy path one-party', () => {
    const r = validateConsent({
      consent: 'one-party', consentedBy: 'agent-42', lawfulBasis: 'QA review',
    });
    assert.strictEqual(r.ok, true);
  });

  test('validateConsent — happy path all-party', () => {
    const r = validateConsent({
      consent: 'all-party', consentedBy: 'agent-42', lawfulBasis: 'QA review',
      participants: [
        { id: 'p1', consented: true },
        { id: 'p2', consented: true },
      ],
    });
    assert.strictEqual(r.ok, true);
  });

  test('record — refuses without consent (Israeli law safety)', () => {
    const cr = new CallRecording();
    const r = cr.record({ callId: 'call-1' });
    assert.strictEqual(r.status, 'refused');
    assert.strictEqual(r.reason, 'consent_model_required');
    // No record created.
    assert.strictEqual(cr.listRecordings().length, 0);
  });

  test('record — refuses with empty lawfulBasis', () => {
    const cr = new CallRecording();
    const r = cr.record({
      callId: 'call-1', consent: 'one-party', consentedBy: 'u1', lawfulBasis: '   ',
    });
    assert.strictEqual(r.status, 'refused');
  });

  test('record — accepts legitimate one-party request', () => {
    const cr = new CallRecording();
    const r = cr.record({
      callId: 'call-42',
      consent: 'one-party',
      consentedBy: 'agent-007',
      lawfulBasis: 'customer service recording per policy',
    });
    assert.strictEqual(r.status, RECORDING_STATUS.RECORDING);
    assert.ok(r.id && r.id.startsWith('rec_'));
    assert.ok(r.storageKey);
    assert.strictEqual(r.encryption.algorithm, DEFAULT_ENCRYPTION);
    const rec = cr.getRecording(r.id);
    assert.ok(rec);
    assert.strictEqual(rec.consent, 'one-party');
    assert.strictEqual(rec.accessLog.length, 1);
    assert.strictEqual(rec.accessLog[0].action, 'record_start');
  });

  /* ═══════════════════ 2. Encryption round-trip ═══════════════════ */

  test('encryptBuffer / decryptBuffer — round-trip', () => {
    const text = 'sensitive call content שלום לקוח יקר';
    const env = encryptBuffer(text, 'key-1');
    assert.strictEqual(env.algorithm, 'aes-256-gcm');
    assert.strictEqual(env.keyId, 'key-1');
    assert.ok(env.iv && env.tag && env.ciphertext);
    const back = decryptBuffer(env);
    assert.strictEqual(back.toString('utf8'), text);
  });

  test('encryptRecording — Buffer input round-trip', () => {
    const cr = new CallRecording();
    const buf = Buffer.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const env = cr.encryptRecording({ file: buf, keyId: 'key-buf' });
    const back = cr.decryptRecording(env);
    assert.deepStrictEqual(Array.from(back), Array.from(buf));
  });

  test('encryptRecording — string input round-trip', () => {
    const cr = new CallRecording();
    const env = cr.encryptRecording({ file: 'hello world', keyId: 'k' });
    const back = cr.decryptRecording(env);
    assert.strictEqual(back.toString('utf8'), 'hello world');
  });

  test('decryptBuffer — tampered auth tag fails', () => {
    const env = encryptBuffer('secret', 'k');
    const bad = Object.assign({}, env, { tag: Buffer.alloc(16).toString('base64') });
    assert.throws(() => decryptBuffer(bad), /auth|decrypt|unsupported/i);
  });

  test('decryptBuffer — wrong key fails', () => {
    const env = encryptBuffer('secret', 'k1');
    assert.throws(
      () => decryptBuffer(Object.assign({}, env, { keyId: 'k2' })),
      /auth|decrypt|unsupported/i
    );
  });

  /* ═══════════════════ 3. PII redaction ═══════════════════ */

  test('luhnValid — canonical test numbers', () => {
    assert.strictEqual(luhnValid('4532015112830366'), true);   // Visa test
    assert.strictEqual(luhnValid('4111111111111111'), true);   // Visa test
    assert.strictEqual(luhnValid('1234567890123456'), false);
  });

  test('israeliIdValid — known-valid', () => {
    assert.strictEqual(israeliIdValid('000000018'), true);
    assert.strictEqual(israeliIdValid('123456782'), true);
    assert.strictEqual(israeliIdValid('123456789'), false);
  });

  test('redactPII — credit card with spaces', () => {
    const { safe, redactions } = redactPII('Card: 4532 0151 1283 0366 exp 12/27');
    assert.ok(safe.includes('[REDACTED_CC]'));
    assert.ok(!/4532/.test(safe));
    assert.ok(redactions.some(r => r.type === 'credit_card'));
  });

  test('redactPII — invalid Luhn is NOT redacted as CC', () => {
    const { safe, redactions } = redactPII('order number 1234567890123456 tracking');
    assert.ok(!/\[REDACTED_CC\]/.test(safe));
    assert.ok(!redactions.some(r => r.type === 'credit_card'));
  });

  test('redactPII — CVV labelled', () => {
    const { safe, redactions } = redactPII('CVV: 123');
    assert.ok(safe.includes('[REDACTED_CVV]'));
    assert.ok(redactions.some(r => r.type === 'cvv'));
  });

  test('redactPII — Hebrew CVV label', () => {
    const { safe, redactions } = redactPII('קוד אבטחה 456');
    assert.ok(safe.includes('[REDACTED_CVV]'));
    assert.ok(redactions.some(r => r.type === 'cvv'));
  });

  test('redactPII — Israeli ID check-digit', () => {
    const { safe, redactions } = redactPII('תעודת זהות 000000018');
    assert.ok(safe.includes('[REDACTED_ID]'));
    assert.ok(redactions.some(r => r.type === 'israeli_id'));
  });

  test('redactPII — phone numbers', () => {
    const { safe, redactions } = redactPII('Call me at 050-123-4567');
    assert.ok(safe.includes('[REDACTED_PHONE]'));
    assert.ok(redactions.some(r => r.type === 'phone'));
  });

  test('redactPII — email addresses', () => {
    const { safe, redactions } = redactPII('Reach me at a@example.com');
    assert.ok(safe.includes('[REDACTED_EMAIL]'));
    assert.ok(redactions.some(r => r.type === 'email'));
  });

  test('redactPII — IBAN', () => {
    const { safe, redactions } = redactPII('wire to IL620108000000099999999');
    assert.ok(safe.includes('[REDACTED_IBAN]'));
    assert.ok(redactions.some(r => r.type === 'iban'));
  });

  test('redactPII — leaves benign text untouched', () => {
    const { safe, redactions } = redactPII('The meeting is at 3pm and all good');
    assert.strictEqual(safe, 'The meeting is at 3pm and all good');
    assert.strictEqual(redactions.length, 0);
  });

  test('piiRedaction — on recording persists status + transcript', () => {
    const cr = new CallRecording();
    const r = cr.record({
      callId: 'c1', consent: 'one-party', consentedBy: 'u1', lawfulBasis: 'qa',
    });
    const fakeTranscript = { text: 'CVV: 321 and card 4111 1111 1111 1111 thank you' };
    cr.storage.updateRecord(r.id, { transcript: fakeTranscript });
    const red = cr.piiRedaction({ transcript: fakeTranscript, recordingId: r.id });
    assert.ok(red.redactions.length >= 2);
    const rec = cr.getRecording(r.id);
    assert.strictEqual(rec.piiRedacted, true);
    assert.strictEqual(rec.status, RECORDING_STATUS.REDACTED);
    assert.ok(!/4111/.test(rec.transcript.text));
  });

  /* ═══════════════════ 4. Action item extraction ═══════════════════ */

  test('extractActions — English action verbs', () => {
    const t = 'I will send you the quote tomorrow. The weather is nice.';
    const r = extractActions(t);
    assert.ok(r.count >= 1);
    assert.ok(r.items.some(i => /send/i.test(i.text)));
  });

  test('extractActions — Hebrew action verbs', () => {
    const t = 'אשלח לך את ההצעה מחר. זה יום יפה.';
    const r = extractActions(t);
    assert.ok(r.count >= 1);
    assert.ok(r.items.some(i => /אשלח/.test(i.text)));
  });

  test('extractActionItems — mixed language', () => {
    const cr = new CallRecording();
    const t = 'I will call you back. אבדוק את זה ואחזור אליך. It is sunny today.';
    const r = cr.extractActionItems({ transcript: t });
    assert.ok(r.count >= 2);
  });

  /* ═══════════════════ 5. Sentiment ═══════════════════ */

  test('analyseSentiment — positive text', () => {
    const r = analyseSentiment('This is excellent. Thank you so much. I am very happy.');
    assert.strictEqual(r.label, 'positive');
    assert.ok(r.avg > 0);
  });

  test('analyseSentiment — negative text', () => {
    const r = analyseSentiment('This is awful. I am angry. Terrible service.');
    assert.strictEqual(r.label, 'negative');
    assert.ok(r.avg < 0);
  });

  test('analyseSentiment — Hebrew positive', () => {
    const r = analyseSentiment('תודה רבה. זה מעולה. מאוד מרוצה.');
    assert.strictEqual(r.label, 'positive');
  });

  test('analyseSentiment — neutral', () => {
    const r = analyseSentiment('The meeting is tomorrow at three.');
    assert.strictEqual(r.label, 'neutral');
  });

  /* ═══════════════════ 6. Keyword spotting ═══════════════════ */

  test('spotKeywords — legal terms', () => {
    const r = spotKeywords('We may need to consult an attorney about the contract.');
    assert.ok(r.hits.some(h => h.category === 'legal'));
  });

  test('spotKeywords — Hebrew legal term', () => {
    const r = spotKeywords('נעביר את זה לעורך דין בשביל חוזה חדש');
    assert.ok(r.hits.some(h => h.category === 'legal'));
  });

  test('spotKeywords — complaint terms', () => {
    const r = spotKeywords('I want a refund, this is broken');
    assert.ok(r.hits.some(h => h.category === 'complaint'));
  });

  test('spotKeywords — custom keyword list', () => {
    const r = spotKeywords('mention of widget3000 here', ['widget3000']);
    assert.strictEqual(r.count, 1);
    assert.strictEqual(r.hits[0].keyword, 'widget3000');
  });

  /* ═══════════════════ 7. Summarization + diarize + quality ═══════════ */

  test('summarizeBilingual — returns bullets and bilingual fields', () => {
    const t = 'Hello customer. We will discuss the invoice. Thank you for calling.';
    const s = summarizeBilingual(t);
    assert.ok(s.bullets.length >= 1);
    assert.ok(typeof s.en === 'string');
    assert.ok(typeof s.he === 'string');
  });

  test('diarizeTranscript — explicit speaker markers', () => {
    const t = 'Speaker A: Hello\nSpeaker B: Hi there\nSpeaker A: How are you';
    const d = diarizeTranscript(t);
    assert.deepStrictEqual(d.speakers.sort(), ['A', 'B']);
    assert.ok(d.confidence >= 0.8);
  });

  test('diarizeTranscript — fallback alternation', () => {
    const t = 'Hello there. How are you today. I am fine thanks.';
    const d = diarizeTranscript(t);
    assert.ok(d.speakers.length >= 1);
  });

  test('scoreQuality — default rubric', () => {
    const t = 'Hello, thank you for calling. Can you verify your id? We solved the issue. I will follow up by email. Thank you, goodbye.';
    const s = scoreQuality(t);
    assert.ok(s.score > 0);
    assert.ok(['A','B','C','D','F'].includes(s.grade));
    assert.ok(s.breakdown.greeting.passed);
    assert.ok(s.breakdown.closing.passed);
  });

  test('scoreQuality — custom rubric', () => {
    const s = scoreQuality('urgent critical issue', {
      urgency: { weight: 100, keywords: ['urgent','critical'] },
    });
    assert.strictEqual(s.score, 100);
    assert.strictEqual(s.grade, 'A');
  });

  /* ═══════════════════ 8. Access log + retention ═══════════════════ */

  test('accessLog — manual logAccess appends', () => {
    const cr = new CallRecording();
    const r = cr.record({
      callId: 'c1', consent: 'one-party', consentedBy: 'u1', lawfulBasis: 'qa',
    });
    cr.logAccess({
      recordingId: r.id, userId: 'manager-9', action: 'listen', reason: 'QA review',
    });
    cr.logAccess({
      recordingId: r.id, userId: 'manager-9', action: 'listen', reason: 'second pass',
    });
    const log = cr.accessLog({ recordingId: r.id });
    assert.strictEqual(log.count, 3);           // 1 start + 2 listens
    assert.strictEqual(log.entries[1].userId, 'manager-9');
    assert.strictEqual(log.entries[1].action, 'listen');
  });

  test('accessLog — logAccess requires userId', () => {
    const cr = new CallRecording();
    const r = cr.record({
      callId: 'c1', consent: 'one-party', consentedBy: 'u1', lawfulBasis: 'qa',
    });
    assert.throws(() => cr.logAccess({ recordingId: r.id }), /userId/);
  });

  test('retentionPolicy — sets approval flag and never deletes', () => {
    const cr = new CallRecording();
    const r = cr.record({
      callId: 'c1', consent: 'one-party', consentedBy: 'u1', lawfulBasis: 'qa',
    });
    const ret = cr.retentionPolicy({
      recordingId: r.id, retentionDays: 30, disposalRequiresApproval: true,
    });
    assert.strictEqual(ret.retentionDays, 30);
    assert.strictEqual(ret.disposalRequiresApproval, true);
    // Record still exists (never hard-deleted).
    assert.ok(cr.getRecording(r.id));
  });

  test('retentionPolicy — requiresApproval defaults true', () => {
    const cr = new CallRecording();
    const r = cr.record({
      callId: 'c1', consent: 'one-party', consentedBy: 'u1', lawfulBasis: 'qa',
    });
    const ret = cr.retentionPolicy({ recordingId: r.id, retentionDays: 90 });
    assert.strictEqual(ret.disposalRequiresApproval, true);
  });

  /* ═══════════════════ 9. Legal export ═══════════════════ */

  test('exportForLegal — builds chain of custody + legalHold', () => {
    const cr = new CallRecording();
    const r = cr.record({
      callId: 'c1', consent: 'one-party', consentedBy: 'u1', lawfulBasis: 'qa',
    });
    const exp = cr.exportForLegal({
      recordingId: r.id,
      authorizedBy: 'legal-dept-head',
      reason: 'court subpoena #2026-4711',
    });
    assert.ok(exp.exportId.startsWith('legal_'));
    assert.strictEqual(exp.recordingId, r.id);
    assert.strictEqual(exp.legalHold, true);
    assert.strictEqual(exp.chainOfCustody.length, 1);
    assert.strictEqual(exp.chainOfCustody[0].by, 'legal-dept-head');
    const rec = cr.getRecording(r.id);
    assert.strictEqual(rec.retention.legalHold, true);
  });

  test('exportForLegal — requires reason', () => {
    const cr = new CallRecording();
    const r = cr.record({
      callId: 'c1', consent: 'one-party', consentedBy: 'u1', lawfulBasis: 'qa',
    });
    assert.throws(
      () => cr.exportForLegal({ recordingId: r.id, authorizedBy: 'legal' }),
      /reason/
    );
  });

  /* ═══════════════════ 10. Transcription pipeline (stub) ═══════════════ */

  await (async () => {
    test('transcribe — stub backend reflects mockText', async () => {
      const cr = new CallRecording();
      const r = cr.record({
        callId: 'c1', consent: 'one-party', consentedBy: 'u1', lawfulBasis: 'qa',
        mockText: 'Hello. How are you today. I will send the quote.',
        language: 'en',
      });
      const tr = await cr.transcribe({ recordingId: r.id, language: 'en' });
      assert.ok(tr.text.includes('Hello'));
      assert.ok(tr.segments.length >= 2);
      assert.strictEqual(tr.backend, 'stub');
      const rec = cr.getRecording(r.id);
      assert.strictEqual(rec.status, RECORDING_STATUS.TRANSCRIBED);
    });

    test('transcribe — custom backend can be registered', async () => {
      const cr = new CallRecording();
      cr.registerBackend('whisper', async () => ({
        text: 'mocked whisper output',
        segments: [{ start: 0, end: 1, text: 'mocked whisper output', speaker: 'A' }],
        language: 'en',
        backend: 'whisper',
        duration: 1,
      }));
      const r = cr.record({
        callId: 'c1', consent: 'one-party', consentedBy: 'u1', lawfulBasis: 'qa',
      });
      const tr = await cr.transcribe({ recordingId: r.id, backend: 'whisper' });
      assert.strictEqual(tr.backend, 'whisper');
      assert.strictEqual(tr.text, 'mocked whisper output');
    });
  })();

  /* ═══════════════════ 11. Compliance check ═══════════════════ */

  test('complianceCheck — a clean record passes most gates', () => {
    const cr = new CallRecording();
    const r = cr.record({
      callId: 'c1', consent: 'one-party', consentedBy: 'u1', lawfulBasis: 'qa',
    });
    cr.retentionPolicy({ recordingId: r.id, retentionDays: 30 });
    // Mark PII redacted
    cr.storage.updateRecord(r.id, { piiRedacted: true });
    const chk = cr.complianceCheck({ recordingId: r.id });
    // access log has at least one entry, retention set, consent present.
    // Only remaining issue could be MISSING_CONSENT / ENCRYPTION which we
    // already satisfy; so expect zero critical issues.
    const crit = chk.issues.filter(i => i.severity === 'critical');
    assert.strictEqual(crit.length, 0);
  });

  test('complianceCheck — flags missing consent', () => {
    const chk = checkCompliance({
      id: 'x',
      consent: null,
      encryption: { algorithm: DEFAULT_ENCRYPTION },
      retention: { retentionDays: 30 },
      accessLog: [{ userId: 'u', action: 'x', at: '2026-01-01' }],
    });
    assert.strictEqual(chk.ok, false);
    assert.ok(chk.issues.some(i => i.code === 'MISSING_CONSENT'));
  });

  test('complianceCheck — flags weak encryption', () => {
    const chk = checkCompliance({
      id: 'x',
      consent: 'one-party',
      consentedBy: 'u',
      lawfulBasis: 'qa',
      encryption: { algorithm: 'DES' },
      retention: { retentionDays: 10 },
      accessLog: [{ userId: 'u', action: 'x' }],
    });
    assert.ok(chk.issues.some(i => i.code === 'WEAK_ENCRYPTION'));
  });

  test('complianceCheck — null record handled gracefully', () => {
    const chk = checkCompliance(null);
    assert.strictEqual(chk.ok, false);
    assert.ok(chk.issues.some(i => i.code === 'NOT_FOUND'));
  });

  /* ═══════════════════ 12. Rule-1 guard ═══════════════════ */

  test('rule-1 — no method deletes a record', () => {
    const cr = new CallRecording();
    const r = cr.record({
      callId: 'c1', consent: 'one-party', consentedBy: 'u1', lawfulBasis: 'qa',
    });
    cr.retentionPolicy({ recordingId: r.id, retentionDays: 1 });
    cr.exportForLegal({ recordingId: r.id, authorizedBy: 'legal', reason: 'hold' });
    // record still present
    assert.ok(cr.getRecording(r.id));
    assert.strictEqual(cr.listRecordings().length, 1);
  });

  /* ───────────────────────── summary ───────────────────────── */

  process.stdout.write('\n');
  if (failed > 0) {
    console.log(`\n${failed} test(s) failed out of ${passed + failed}:\n`);
    for (const f of failures) {
      console.log(`  X ${f.name}`);
      console.log(`    ${f.error && f.error.stack ? f.error.stack.split('\n').slice(0,3).join('\n    ') : f.error}`);
    }
    process.exitCode = 1;
  } else {
    console.log(`\nOK  ${passed} tests passed, 0 failed.`);
  }
}

runAll().catch(e => {
  console.error('test runner crashed:', e);
  process.exitCode = 1;
});
