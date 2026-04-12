/**
 * Unit tests for ESignature — electronic signature workflow engine
 * Agent Y-107 — written 2026-04-11
 *
 * Run:   node --test test/docs/esignature.test.js
 *
 * חוק חתימה אלקטרונית, התשס"א-2001 — 3 levels covered:
 *   electronic / advanced / qualified
 *
 * Coverage (>=20 tests):
 *   01. createEnvelope creates draft with correct metadata + hashed docs
 *   02. createEnvelope rejects missing title_he/title_en/documents/signers
 *   03. sendForSignature (parallel) notifies ALL signers
 *   04. sendForSignature (sequential) notifies only first signer
 *   05. signDocument (electronic) records typedName and completes envelope
 *   06. signDocument (advanced) validates publicKey + signedDigest
 *   07. signDocument (qualified) requires licensed CA certificate fields
 *   08. sequential signing enforces ordering — out-of-order throws
 *   09. sequential signing auto-notifies next signer after each signature
 *   10. parallel signing allows any order and completes when all sign
 *   11. verifySignature detects document tampering via docDigest mismatch
 *   12. verifySignature detects identity metadata mismatch (missing fields)
 *   13. verifySignature success path returns valid=true + identityVerified
 *   14. voidEnvelope flips status to voided but RETAINS signatures for audit
 *   15. voidEnvelope cannot void twice
 *   16. auditTrail hash chain integrity — every entry links via prev_hash
 *   17. auditTrail verification detects external mutation (tampered entry)
 *   18. timestamp produces RFC-3161 shaped payload with SHA-256 OID
 *   19. remindSigner returns bilingual (he + en) reminder body
 *   20. remindSigner refuses to remind a signer who already signed
 *   21. certificateOfCompletion includes all signers + IPs + law reference
 *   22. certificateOfCompletion works on a voided envelope (preserved record)
 *   23. rejectEnvelope flips status + records reason + retains signatures
 *   24. exportSigned bundles certificate, audit, and timestamps with checksum
 *   25. signature level weights are strictly ordered electronic<advanced<qualified
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  ESignature,
  SIGNATURE_LEVELS,
  ENVELOPE_STATUS,
  SIGNER_STATUS,
} = require('../../src/docs/esignature.js');

/* ─────────────────────────────────────────────────────────────────────────
 * Test fixtures
 * ───────────────────────────────────────────────────────────────────────── */

function makeEngine() {
  let t = Date.parse('2026-04-11T08:00:00.000Z');
  return new ESignature({
    clock: () => {
      const iso = new Date(t).toISOString();
      t += 60 * 1000; // 1 minute per step
      return iso;
    },
  });
}

function baseEnvelopeArgs(overrides) {
  return Object.assign({
    title_he: 'הסכם אספקת פלדה',
    title_en: 'Steel Supply Agreement',
    documents: [
      { docId: 'DOC-001', title_he: 'הסכם', title_en: 'Agreement', content: 'steel supply, 10 tons' },
    ],
    signers: [
      { userId: 'u_buyer', name_he: 'קובי קונה', name_en: 'Kobi Buyer', role: 'buyer', order: 1 },
      { userId: 'u_seller', name_he: 'יוסי מוכר', name_en: 'Yossi Seller', role: 'seller', order: 2 },
    ],
    sequential: false,
    message: 'נא לחתום',
    expiryDays: 14,
    createdBy: 'u_admin',
  }, overrides || {});
}

function sign(eng, envelopeId, signerId, level) {
  if (level === 'electronic') {
    return eng.signDocument({
      envelopeId, signerId,
      signatureType: 'electronic',
      signatureData: { typedName: 'Kobi El' },
      ipAddress: '10.0.0.1', userAgent: 'test/1.0',
    });
  }
  if (level === 'advanced') {
    return eng.signDocument({
      envelopeId, signerId,
      signatureType: 'advanced',
      signatureData: {
        publicKey: 'pk_adv_' + signerId,
        signedDigest: 'digest_' + signerId,
        algorithm: 'RSA-SHA256',
      },
      ipAddress: '10.0.0.2', userAgent: 'test/2.0',
    });
  }
  if (level === 'qualified') {
    return eng.signDocument({
      envelopeId, signerId,
      signatureType: 'qualified',
      signatureData: {
        publicKey: 'pk_qual_' + signerId,
        signedDigest: 'qdigest_' + signerId,
        algorithm: 'RSA-SHA256',
        certificate: {
          serial: 'SN-' + signerId,
          issuer: 'CN=Comsign CA Israel, L=ישראל',
          subject: 'CN=' + signerId,
          validFrom: '2026-01-01T00:00:00.000Z',
          validTo:   '2027-01-01T00:00:00.000Z',
        },
      },
      ipAddress: '10.0.0.3', userAgent: 'test/3.0',
    });
  }
  throw new Error('unknown level: ' + level);
}

/* ─────────────────────────────────────────────────────────────────────────
 * 01. createEnvelope creates draft with correct metadata + hashed docs
 * ───────────────────────────────────────────────────────────────────────── */
test('01. createEnvelope creates draft with correct metadata + hashed docs', () => {
  const eng = makeEngine();
  const env = eng.createEnvelope(baseEnvelopeArgs());

  assert.equal(env.status, ENVELOPE_STATUS.draft.id);
  assert.equal(env.title_he, 'הסכם אספקת פלדה');
  assert.equal(env.title_en, 'Steel Supply Agreement');
  assert.equal(env.sequential, false);
  assert.equal(env.documents.length, 1);
  assert.match(env.documents[0].sha256, /^[a-f0-9]{64}$/);
  assert.ok(env.documents[0].size > 0);
  assert.equal(env.signers.length, 2);
  assert.ok(env.envelopeId.startsWith('ENV-'));
  assert.equal(env.expiryDays, 14);
  assert.ok(env.expiresAt > env.createdAt);
  assert.equal(env.auditLog.length, 1);
  assert.equal(env.auditLog[0].action, 'envelope_create');
});

/* ─────────────────────────────────────────────────────────────────────────
 * 02. createEnvelope rejects missing title/documents/signers
 * ───────────────────────────────────────────────────────────────────────── */
test('02. createEnvelope rejects missing required fields', () => {
  const eng = makeEngine();
  assert.throws(() => eng.createEnvelope({ title_he: '', title_en: 'x', documents: [{ docId: 'a' }], signers: [{ userId: 'u', role: 'r' }] }), /title_he/);
  assert.throws(() => eng.createEnvelope({ title_he: 'x', title_en: '', documents: [{ docId: 'a' }], signers: [{ userId: 'u', role: 'r' }] }), /title_en/);
  assert.throws(() => eng.createEnvelope({ title_he: 'x', title_en: 'x', documents: [], signers: [{ userId: 'u', role: 'r' }] }), /documents/);
  assert.throws(() => eng.createEnvelope({ title_he: 'x', title_en: 'x', documents: [{ docId: 'a' }], signers: [] }), /signers/);
  assert.throws(() => eng.createEnvelope({ title_he: 'x', title_en: 'x', documents: [{}], signers: [{ userId: 'u', role: 'r' }] }), /docId/);
  assert.throws(() => eng.createEnvelope({ title_he: 'x', title_en: 'x', documents: [{ docId: 'a' }], signers: [{ userId: 'u' }] }), /role/);
});

/* ─────────────────────────────────────────────────────────────────────────
 * 03. sendForSignature (parallel) notifies ALL signers
 * ───────────────────────────────────────────────────────────────────────── */
test('03. sendForSignature parallel notifies ALL signers', () => {
  const eng = makeEngine();
  const env = eng.createEnvelope(baseEnvelopeArgs({ sequential: false }));
  const r = eng.sendForSignature(env.envelopeId, 'u_admin');
  assert.equal(r.notified.length, 2);
  assert.equal(r.status, ENVELOPE_STATUS.in_progress.id);

  const fresh = eng.getEnvelope(env.envelopeId);
  assert.ok(fresh.signers.every(s => s.status === SIGNER_STATUS.notified.id));
  assert.ok(fresh.sentAt);
});

/* ─────────────────────────────────────────────────────────────────────────
 * 04. sendForSignature (sequential) notifies only first signer
 * ───────────────────────────────────────────────────────────────────────── */
test('04. sendForSignature sequential notifies only first signer', () => {
  const eng = makeEngine();
  const env = eng.createEnvelope(baseEnvelopeArgs({ sequential: true }));
  const r = eng.sendForSignature(env.envelopeId);
  assert.equal(r.notified.length, 1);
  const fresh = eng.getEnvelope(env.envelopeId);
  assert.equal(fresh.signers[0].status, SIGNER_STATUS.notified.id);
  assert.equal(fresh.signers[1].status, SIGNER_STATUS.pending.id);
});

/* ─────────────────────────────────────────────────────────────────────────
 * 05. signDocument (electronic) records typedName + completes envelope
 * ───────────────────────────────────────────────────────────────────────── */
test('05. signDocument electronic records typedName and completes envelope', () => {
  const eng = makeEngine();
  const env = eng.createEnvelope(baseEnvelopeArgs({ sequential: false }));
  eng.sendForSignature(env.envelopeId);
  const signerIds = env.signers.map(s => s.signerId);

  const r1 = sign(eng, env.envelopeId, signerIds[0], 'electronic');
  assert.equal(r1.signature.level, 'electronic');
  assert.equal(r1.signature.data.typedName, 'Kobi El');
  assert.equal(r1.envelopeStatus, ENVELOPE_STATUS.in_progress.id);

  const r2 = sign(eng, env.envelopeId, signerIds[1], 'electronic');
  assert.equal(r2.envelopeStatus, ENVELOPE_STATUS.completed.id);

  const fresh = eng.getEnvelope(env.envelopeId);
  assert.equal(fresh.status, ENVELOPE_STATUS.completed.id);
  assert.ok(fresh.completedAt);
});

/* ─────────────────────────────────────────────────────────────────────────
 * 06. signDocument (advanced) validates publicKey + signedDigest
 * ───────────────────────────────────────────────────────────────────────── */
test('06. signDocument advanced validates publicKey and signedDigest', () => {
  const eng = makeEngine();
  const env = eng.createEnvelope(baseEnvelopeArgs({ sequential: false }));
  eng.sendForSignature(env.envelopeId);
  const ids = env.signers.map(s => s.signerId);

  assert.throws(() => eng.signDocument({
    envelopeId: env.envelopeId, signerId: ids[0],
    signatureType: 'advanced',
    signatureData: { publicKey: 'pk' }, // missing signedDigest
  }), /signedDigest/);

  const ok = sign(eng, env.envelopeId, ids[0], 'advanced');
  assert.equal(ok.signature.level, 'advanced');
  assert.equal(ok.signature.weight, 2);
  assert.ok(ok.signature.data.publicKey);
  assert.ok(ok.signature.data.signedDigest);
});

/* ─────────────────────────────────────────────────────────────────────────
 * 07. signDocument (qualified) requires licensed CA certificate fields
 * ───────────────────────────────────────────────────────────────────────── */
test('07. signDocument qualified requires licensed CA certificate fields', () => {
  const eng = makeEngine();
  const env = eng.createEnvelope(baseEnvelopeArgs({ sequential: false }));
  eng.sendForSignature(env.envelopeId);
  const ids = env.signers.map(s => s.signerId);

  assert.throws(() => eng.signDocument({
    envelopeId: env.envelopeId, signerId: ids[0],
    signatureType: 'qualified',
    signatureData: { publicKey: 'pk', signedDigest: 'd' }, // missing certificate
  }), /certificate/);

  assert.throws(() => eng.signDocument({
    envelopeId: env.envelopeId, signerId: ids[0],
    signatureType: 'qualified',
    signatureData: { publicKey: 'pk', signedDigest: 'd', certificate: { serial: 's' } }, // missing issuer/subject
  }), /issuer/);

  const ok = sign(eng, env.envelopeId, ids[0], 'qualified');
  assert.equal(ok.signature.level, 'qualified');
  assert.equal(ok.signature.weight, 3);
  assert.equal(ok.signature.law_ref, SIGNATURE_LEVELS.qualified.law_ref);
  assert.ok(ok.signature.data.certificate.serial);
  assert.ok(ok.signature.data.certificate.issuer);
});

/* ─────────────────────────────────────────────────────────────────────────
 * 08. sequential signing enforces ordering — out-of-order throws
 * ───────────────────────────────────────────────────────────────────────── */
test('08. sequential signing enforces ordering — out-of-order throws', () => {
  const eng = makeEngine();
  const env = eng.createEnvelope(baseEnvelopeArgs({ sequential: true }));
  eng.sendForSignature(env.envelopeId);
  const ids = env.signers.map(s => s.signerId);

  // Second signer tries first — must throw.
  assert.throws(() => sign(eng, env.envelopeId, ids[1], 'electronic'), /out-of-order/);

  // First signer succeeds.
  sign(eng, env.envelopeId, ids[0], 'electronic');
  // Now second can sign.
  const r = sign(eng, env.envelopeId, ids[1], 'electronic');
  assert.equal(r.envelopeStatus, ENVELOPE_STATUS.completed.id);
});

/* ─────────────────────────────────────────────────────────────────────────
 * 09. sequential signing auto-notifies next signer after each signature
 * ───────────────────────────────────────────────────────────────────────── */
test('09. sequential signing auto-notifies next signer', () => {
  const eng = makeEngine();
  const env = eng.createEnvelope(baseEnvelopeArgs({
    sequential: true,
    signers: [
      { userId: 'a', role: 'r1', order: 1 },
      { userId: 'b', role: 'r2', order: 2 },
      { userId: 'c', role: 'r3', order: 3 },
    ],
  }));
  eng.sendForSignature(env.envelopeId);
  const ids = env.signers.map(s => s.signerId);

  let fresh = eng.getEnvelope(env.envelopeId);
  assert.equal(fresh.signers[0].status, SIGNER_STATUS.notified.id);
  assert.equal(fresh.signers[1].status, SIGNER_STATUS.pending.id);
  assert.equal(fresh.signers[2].status, SIGNER_STATUS.pending.id);

  sign(eng, env.envelopeId, ids[0], 'electronic');
  fresh = eng.getEnvelope(env.envelopeId);
  assert.equal(fresh.signers[1].status, SIGNER_STATUS.notified.id);
  assert.equal(fresh.signers[2].status, SIGNER_STATUS.pending.id);

  sign(eng, env.envelopeId, ids[1], 'electronic');
  fresh = eng.getEnvelope(env.envelopeId);
  assert.equal(fresh.signers[2].status, SIGNER_STATUS.notified.id);

  sign(eng, env.envelopeId, ids[2], 'electronic');
  fresh = eng.getEnvelope(env.envelopeId);
  assert.equal(fresh.status, ENVELOPE_STATUS.completed.id);
});

/* ─────────────────────────────────────────────────────────────────────────
 * 10. parallel signing allows any order and completes when all sign
 * ───────────────────────────────────────────────────────────────────────── */
test('10. parallel signing allows any order and completes when all sign', () => {
  const eng = makeEngine();
  const env = eng.createEnvelope(baseEnvelopeArgs({ sequential: false }));
  eng.sendForSignature(env.envelopeId);
  const ids = env.signers.map(s => s.signerId);

  // Reverse order — still OK in parallel.
  sign(eng, env.envelopeId, ids[1], 'advanced');
  const r = sign(eng, env.envelopeId, ids[0], 'advanced');
  assert.equal(r.envelopeStatus, ENVELOPE_STATUS.completed.id);
});

/* ─────────────────────────────────────────────────────────────────────────
 * 11. verifySignature detects document tampering
 * ───────────────────────────────────────────────────────────────────────── */
test('11. verifySignature detects document tampering', () => {
  const eng = makeEngine();
  const env = eng.createEnvelope(baseEnvelopeArgs({ sequential: false }));
  eng.sendForSignature(env.envelopeId);
  const ids = env.signers.map(s => s.signerId);
  sign(eng, env.envelopeId, ids[0], 'advanced');

  // Simulate tamper: mutate the stored doc hash in the live record.
  const raw = eng.envelopes.get(env.envelopeId);
  raw.documents[0].sha256 = 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';

  const r = eng.verifySignature(env.envelopeId, ids[0]);
  assert.equal(r.valid, false);
  assert.equal(r.integrity, false);
  assert.ok(r.reasons.some(x => /document digest mismatch/.test(x)));
});

/* ─────────────────────────────────────────────────────────────────────────
 * 12. verifySignature detects identity metadata mismatch
 * ───────────────────────────────────────────────────────────────────────── */
test('12. verifySignature detects identity metadata mismatch', () => {
  const eng = makeEngine();
  const env = eng.createEnvelope(baseEnvelopeArgs({ sequential: false }));
  eng.sendForSignature(env.envelopeId);
  const ids = env.signers.map(s => s.signerId);
  sign(eng, env.envelopeId, ids[0], 'qualified');

  // Tamper with the signature packet by blanking certificate serial.
  const raw = eng.envelopes.get(env.envelopeId);
  const signer = raw.signers.find(s => s.signerId === ids[0]);
  // We have to replace the frozen signature packet with a mutated copy.
  const mutated = Object.assign({}, signer.signature, {
    data: Object.assign({}, signer.signature.data, {
      certificate: Object.assign({}, signer.signature.data.certificate, { serial: '' }),
    }),
  });
  // Simulate an attacker who lost the serial but kept the evidenceHash.
  signer.signature = mutated;
  // Replace signer in array (required since original was frozen).
  raw.signers = raw.signers.map(s => s.signerId === ids[0] ? signer : s);

  const r = eng.verifySignature(env.envelopeId, ids[0]);
  assert.equal(r.valid, false);
  // Either identity fails OR evidence-hash fails; both indicate tamper.
  assert.ok(r.reasons.length > 0);
});

/* ─────────────────────────────────────────────────────────────────────────
 * 13. verifySignature success path
 * ───────────────────────────────────────────────────────────────────────── */
test('13. verifySignature success path returns valid=true', () => {
  const eng = makeEngine();
  const env = eng.createEnvelope(baseEnvelopeArgs({ sequential: false }));
  eng.sendForSignature(env.envelopeId);
  const ids = env.signers.map(s => s.signerId);

  sign(eng, env.envelopeId, ids[0], 'electronic');
  sign(eng, env.envelopeId, ids[1], 'qualified');

  const r1 = eng.verifySignature(env.envelopeId, ids[0]);
  assert.equal(r1.valid, true);
  assert.equal(r1.integrity, true);
  assert.equal(r1.identityVerified, true);
  assert.equal(r1.levelMet, 'electronic');

  const r2 = eng.verifySignature(env.envelopeId, ids[1]);
  assert.equal(r2.valid, true);
  assert.equal(r2.levelMet, 'qualified');
});

/* ─────────────────────────────────────────────────────────────────────────
 * 14. voidEnvelope retains signatures
 * ───────────────────────────────────────────────────────────────────────── */
test('14. voidEnvelope retains signatures for audit', () => {
  const eng = makeEngine();
  const env = eng.createEnvelope(baseEnvelopeArgs({ sequential: false }));
  eng.sendForSignature(env.envelopeId);
  const ids = env.signers.map(s => s.signerId);
  sign(eng, env.envelopeId, ids[0], 'advanced'); // one of two signs

  const r = eng.voidEnvelope(env.envelopeId, 'supplier changed name', 'u_admin');
  assert.equal(r.status, ENVELOPE_STATUS.voided.id);
  assert.equal(r.preservedSignatures.length, 1);

  const fresh = eng.getEnvelope(env.envelopeId);
  assert.equal(fresh.status, ENVELOPE_STATUS.voided.id);
  // The actual signer record still has its signature packet.
  const originalSigner = fresh.signers.find(s => s.signerId === ids[0]);
  assert.ok(originalSigner.signature);
  assert.equal(originalSigner.signature.level, 'advanced');
  assert.equal(fresh.voidReason, 'supplier changed name');
});

/* ─────────────────────────────────────────────────────────────────────────
 * 15. voidEnvelope cannot void twice
 * ───────────────────────────────────────────────────────────────────────── */
test('15. voidEnvelope cannot void twice', () => {
  const eng = makeEngine();
  const env = eng.createEnvelope(baseEnvelopeArgs());
  eng.sendForSignature(env.envelopeId);
  eng.voidEnvelope(env.envelopeId, 'reason1');
  assert.throws(() => eng.voidEnvelope(env.envelopeId, 'reason2'), /already voided/);
});

/* ─────────────────────────────────────────────────────────────────────────
 * 16. auditTrail hash chain integrity
 * ───────────────────────────────────────────────────────────────────────── */
test('16. auditTrail hash chain integrity — every entry links via prev_hash', () => {
  const eng = makeEngine();
  const env = eng.createEnvelope(baseEnvelopeArgs({ sequential: false }));
  eng.sendForSignature(env.envelopeId);
  const ids = env.signers.map(s => s.signerId);
  sign(eng, env.envelopeId, ids[0], 'electronic');
  sign(eng, env.envelopeId, ids[1], 'advanced');

  const trail = eng.auditTrail(env.envelopeId);
  assert.ok(trail.length >= 6);
  assert.equal(trail.verification.valid, true);

  // First entry prev_hash is the zero sentinel.
  assert.equal(trail.entries[0].prev_hash, '0'.repeat(64));

  // Each subsequent entry's prev_hash equals the previous entry's this_hash.
  for (let i = 1; i < trail.entries.length; i++) {
    assert.equal(trail.entries[i].prev_hash, trail.entries[i - 1].this_hash);
  }
});

/* ─────────────────────────────────────────────────────────────────────────
 * 17. auditTrail verification detects tamper
 * ───────────────────────────────────────────────────────────────────────── */
test('17. auditTrail verification detects external mutation', () => {
  const eng = makeEngine();
  const env = eng.createEnvelope(baseEnvelopeArgs({ sequential: false }));
  eng.sendForSignature(env.envelopeId);
  const ids = env.signers.map(s => s.signerId);
  sign(eng, env.envelopeId, ids[0], 'electronic');

  // Corrupt the raw log in place.
  const raw = eng.envelopes.get(env.envelopeId);
  // Swap the second entry with a mutated copy (entries are frozen, so replace).
  const mutated = Object.assign({}, raw.auditLog[1], { actor: 'EVIL_HACKER' });
  raw.auditLog[1] = mutated;

  const trail = eng.auditTrail(env.envelopeId);
  assert.equal(trail.verification.valid, false);
  assert.ok(trail.verification.brokenAt !== null);
});

/* ─────────────────────────────────────────────────────────────────────────
 * 18. timestamp RFC-3161 payload
 * ───────────────────────────────────────────────────────────────────────── */
test('18. timestamp produces RFC-3161 shaped payload with SHA-256 OID', () => {
  const eng = makeEngine();
  const env = eng.createEnvelope(baseEnvelopeArgs());
  const ts = eng.timestamp(env.envelopeId);

  assert.equal(ts.rfc, 3161);
  assert.equal(ts.TimeStampReq.version, 1);
  assert.equal(ts.TimeStampReq.messageImprint.hashAlgorithm.algorithm, '2.16.840.1.101.3.4.2.1');
  assert.equal(ts.TimeStampReq.messageImprint.hashAlgorithm.algorithm_name, 'sha256');
  assert.match(ts.TimeStampReq.messageImprint.hashedMessage, /^[a-f0-9]{64}$/);
  assert.match(ts.TimeStampReq.nonce, /^0x[a-f0-9]+$/);
  assert.equal(ts.TimeStampReq.certReq, true);
  assert.ok(ts._notice_he.length > 0);
  assert.ok(ts._notice_en.length > 0);

  // Recorded on the envelope.
  const fresh = eng.getEnvelope(env.envelopeId);
  assert.equal(fresh.timestamps.length, 1);
});

/* ─────────────────────────────────────────────────────────────────────────
 * 19. remindSigner bilingual
 * ───────────────────────────────────────────────────────────────────────── */
test('19. remindSigner returns bilingual reminder', () => {
  const eng = makeEngine();
  const env = eng.createEnvelope(baseEnvelopeArgs({ sequential: false }));
  eng.sendForSignature(env.envelopeId);
  const ids = env.signers.map(s => s.signerId);

  const r = eng.remindSigner(env.envelopeId, ids[0]);
  assert.match(r.subject_he, /תזכורת/);
  assert.match(r.subject_en, /Reminder/);
  assert.match(r.body_he, /שלום/);
  assert.match(r.body_en, /Hello/);
  assert.ok(r.daysLeft >= 0);
});

/* ─────────────────────────────────────────────────────────────────────────
 * 20. remindSigner refuses signed signer
 * ───────────────────────────────────────────────────────────────────────── */
test('20. remindSigner refuses signer who already signed', () => {
  const eng = makeEngine();
  const env = eng.createEnvelope(baseEnvelopeArgs({ sequential: false }));
  eng.sendForSignature(env.envelopeId);
  const ids = env.signers.map(s => s.signerId);
  sign(eng, env.envelopeId, ids[0], 'electronic');
  assert.throws(() => eng.remindSigner(env.envelopeId, ids[0]), /already signed/);
});

/* ─────────────────────────────────────────────────────────────────────────
 * 21. certificateOfCompletion bilingual + law reference
 * ───────────────────────────────────────────────────────────────────────── */
test('21. certificateOfCompletion includes all signers + IPs + law reference', () => {
  const eng = makeEngine();
  const env = eng.createEnvelope(baseEnvelopeArgs({ sequential: false }));
  eng.sendForSignature(env.envelopeId);
  const ids = env.signers.map(s => s.signerId);
  sign(eng, env.envelopeId, ids[0], 'electronic');
  sign(eng, env.envelopeId, ids[1], 'qualified');

  const cert = eng.certificateOfCompletion(env.envelopeId);
  assert.ok(cert.certificateId.startsWith('COC-'));
  assert.equal(cert.envelopeId, env.envelopeId);
  assert.equal(cert.status_id, ENVELOPE_STATUS.completed.id);
  assert.equal(cert.signers.length, 2);
  assert.equal(cert.signers[0].level, 'electronic');
  assert.equal(cert.signers[1].level, 'qualified');
  assert.ok(cert.signers[0].ipAddress.length > 0);
  assert.match(cert.law_reference_he, /חוק חתימה אלקטרונית/);
  assert.match(cert.law_reference_en, /Electronic Signature Law/);
  assert.equal(cert.auditChain.valid, true);
  assert.equal(cert.title_label.he, 'תעודת השלמת חתימות');
  assert.equal(cert.title_label.en, 'Certificate of Completion');
});

/* ─────────────────────────────────────────────────────────────────────────
 * 22. certificateOfCompletion on voided envelope
 * ───────────────────────────────────────────────────────────────────────── */
test('22. certificateOfCompletion works on voided envelope (preserved record)', () => {
  const eng = makeEngine();
  const env = eng.createEnvelope(baseEnvelopeArgs({ sequential: false }));
  eng.sendForSignature(env.envelopeId);
  const ids = env.signers.map(s => s.signerId);
  sign(eng, env.envelopeId, ids[0], 'advanced');
  eng.voidEnvelope(env.envelopeId, 'contract superseded');

  const cert = eng.certificateOfCompletion(env.envelopeId);
  assert.equal(cert.status_id, ENVELOPE_STATUS.voided.id);
  // Preserved signature must still appear.
  const firstSigner = cert.signers.find(s => s.signerId === ids[0]);
  assert.equal(firstSigner.level, 'advanced');
  assert.ok(firstSigner.evidenceHash);
});

/* ─────────────────────────────────────────────────────────────────────────
 * 23. rejectEnvelope flips status + retains signatures
 * ───────────────────────────────────────────────────────────────────────── */
test('23. rejectEnvelope flips status + records reason + retains signatures', () => {
  const eng = makeEngine();
  const env = eng.createEnvelope(baseEnvelopeArgs({
    sequential: false,
    signers: [
      { userId: 'a', role: 'buyer' },
      { userId: 'b', role: 'seller' },
      { userId: 'c', role: 'witness' },
    ],
  }));
  eng.sendForSignature(env.envelopeId);
  const ids = env.signers.map(s => s.signerId);

  sign(eng, env.envelopeId, ids[0], 'electronic');
  const r = eng.rejectEnvelope(env.envelopeId, ids[1], 'price too high');
  assert.equal(r.status, ENVELOPE_STATUS.rejected.id);
  assert.equal(r.rejectionReason, 'price too high');
  assert.equal(r.preservedSignatures.length, 1);

  const fresh = eng.getEnvelope(env.envelopeId);
  assert.equal(fresh.status, ENVELOPE_STATUS.rejected.id);
  assert.equal(fresh.signers.find(s => s.signerId === ids[0]).signature.level, 'electronic');
  assert.equal(fresh.signers.find(s => s.signerId === ids[1]).status, SIGNER_STATUS.declined.id);
});

/* ─────────────────────────────────────────────────────────────────────────
 * 24. exportSigned bundles everything with checksum
 * ───────────────────────────────────────────────────────────────────────── */
test('24. exportSigned bundles certificate, audit, and timestamps with checksum', () => {
  const eng = makeEngine();
  const env = eng.createEnvelope(baseEnvelopeArgs({ sequential: false }));
  eng.sendForSignature(env.envelopeId);
  const ids = env.signers.map(s => s.signerId);
  sign(eng, env.envelopeId, ids[0], 'electronic');
  sign(eng, env.envelopeId, ids[1], 'qualified');
  eng.timestamp(env.envelopeId);

  const bundle = eng.exportSigned(env.envelopeId);
  assert.equal(bundle.version, 1);
  assert.ok(bundle.envelope.envelopeId);
  assert.equal(bundle.envelope.signers.length, 2);
  assert.equal(bundle.envelope.timestamps.length, 1);
  assert.ok(bundle.certificate);
  assert.ok(bundle.auditLog.length >= 6);
  assert.match(bundle.bundleChecksum, /^[a-f0-9]{64}$/);
  assert.equal(bundle.auditChainVerification.valid, true);
  assert.equal(bundle.law_reference.he, 'חוק חתימה אלקטרונית, התשס"א-2001');
  assert.equal(bundle.label.en, 'Signed archival bundle');
});

/* ─────────────────────────────────────────────────────────────────────────
 * 25. signature level weights strictly ordered
 * ───────────────────────────────────────────────────────────────────────── */
test('25. signature level weights strictly ordered electronic<advanced<qualified', () => {
  assert.ok(SIGNATURE_LEVELS.electronic.weight < SIGNATURE_LEVELS.advanced.weight);
  assert.ok(SIGNATURE_LEVELS.advanced.weight < SIGNATURE_LEVELS.qualified.weight);
  assert.equal(SIGNATURE_LEVELS.electronic.he, 'חתימה אלקטרונית');
  assert.equal(SIGNATURE_LEVELS.advanced.he, 'חתימה אלקטרונית מאובטחת');
  assert.equal(SIGNATURE_LEVELS.qualified.he, 'חתימה אלקטרונית מאושרת');
  assert.match(SIGNATURE_LEVELS.qualified.law_ref, /חוק חתימה אלקטרונית/);
});
