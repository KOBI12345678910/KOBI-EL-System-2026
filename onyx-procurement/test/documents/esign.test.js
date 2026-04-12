/**
 * test/documents/esign.test.js
 * ─────────────────────────────────────────────────────────────────────
 * Tests for ESignWorkflow (src/documents/esign.js).
 *
 * Covers:
 *   - envelope creation (inputs, validation, digest)
 *   - send + sequential signing flow
 *   - recordSignature (ip/ua/type payloads, HMAC binding)
 *   - decline path (terminal, append-only)
 *   - void path (only before completion, idempotent)
 *   - seal / tamper-evident hash / verifySeal
 *   - audit certificate structure (fields, compliance block, signer block)
 *   - compliance level assessment (Simple / Advanced / Qualified)
 *   - reminders scheduling
 *   - timestampToken (mockable TSA)
 *
 * Run:
 *   node --test test/documents/esign.test.js
 *
 * Agent Y-107 — Techno-Kol Uzi Mega-ERP — 2026-04-11
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  ESignWorkflow,
  ENVELOPE_STATUS,
  SIGNER_STATUS,
  SIGNER_ROLE,
  AUTH_METHOD,
  SIGNATURE_TYPE,
  COMPLIANCE_LEVEL,
  AUDIT_EVENT,
  registerTSA,
  registerQualifiedCA,
  sha256,
} = require('../../src/documents/esign');

// ─────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────

function mkDocs(n = 1) {
  const docs = [];
  for (let i = 1; i <= n; i++) {
    docs.push({
      id: `doc_${i}`,
      name: `Contract_${i}.pdf`,
      mime: 'application/pdf',
      content: `This is the text of contract #${i}. חוזה עבודה לדוגמה.`,
    });
  }
  return docs;
}

function mkSigners(spec) {
  return spec.map((s, i) => ({
    id: s.id || `sgn_${i + 1}`,
    name: s.name || `Signer ${i + 1}`,
    email: s.email || `signer${i + 1}@example.com`,
    phone: s.phone || '+972-50-0000000',
    order: s.order != null ? s.order : i + 1,
    role: s.role || SIGNER_ROLE.SIGNER,
    authRequired: s.authRequired || AUTH_METHOD.EMAIL,
  }));
}

function mkBasicEnvelope(wf, overrides = {}) {
  return wf.createEnvelope({
    documents: mkDocs(1),
    signers: mkSigners([
      { name: 'Uzi Tehno-Kol', email: 'uzi@techno-kol.co.il' },
      { name: 'Kobi EL',       email: 'kobi@techno-kol.co.il' },
    ]),
    subject_he: 'חוזה עבודה — טכנו-קול עוזי',
    subject_en: 'Employment contract — Techno-Kol Uzi',
    messageBody: 'Please review and sign the attached contract.',
    expiryDays: 14,
    createdBy: 'admin_001',
    ...overrides,
  });
}

function mkSigPayload(over = {}) {
  return {
    type: SIGNATURE_TYPE.TYPED,
    data: 'Uzi Tehno-Kol',
    ip: '10.0.0.42',
    userAgent: 'Mozilla/5.0 Test',
    geoCoords: { lat: 32.0853, lng: 34.7818 },
    timestamp: '2026-04-11T09:00:00.000Z',
    ...over,
  };
}

// ─────────────────────────────────────────────────────────────────────
// createEnvelope
// ─────────────────────────────────────────────────────────────────────

test('createEnvelope: creates envelope with prepared status and digest', () => {
  const wf = new ESignWorkflow();
  const env = mkBasicEnvelope(wf);
  assert.ok(env.envelopeId.startsWith('env_'));
  assert.equal(env.status, ENVELOPE_STATUS.PREPARED);
  assert.equal(env.documents.length, 1);
  assert.equal(env.signers.length, 2);
  assert.ok(env.envelopeDigest && env.envelopeDigest.length === 64);
  assert.ok(env.expiresAt);
  assert.ok(env.createdAt);
  assert.equal(env.createdBy, 'admin_001');
  assert.equal(env.status, 'prepared');
  // audit trail has envelope_created
  assert.ok(env.audit_trail.some(e => e.event === AUDIT_EVENT.ENVELOPE_CREATED));
});

test('createEnvelope: rejects missing documents', () => {
  const wf = new ESignWorkflow();
  assert.throws(() => wf.createEnvelope({
    documents: [],
    signers: mkSigners([{}]),
    subject_he: 's', subject_en: 's',
  }), /at least one document/);
});

test('createEnvelope: rejects missing signers', () => {
  const wf = new ESignWorkflow();
  assert.throws(() => wf.createEnvelope({
    documents: mkDocs(1),
    signers: [],
    subject_he: 's', subject_en: 's',
  }), /at least one signer/);
});

test('createEnvelope: rejects missing subject_he / subject_en', () => {
  const wf = new ESignWorkflow();
  assert.throws(() => wf.createEnvelope({
    documents: mkDocs(1),
    signers: mkSigners([{}]),
    subject_he: '',
    subject_en: 'Only English',
  }), /subject_he/);
  assert.throws(() => wf.createEnvelope({
    documents: mkDocs(1),
    signers: mkSigners([{}]),
    subject_he: 'רק עברית',
    subject_en: '',
  }), /subject_en/);
});

test('createEnvelope: rejects unknown role / auth method', () => {
  const wf = new ESignWorkflow();
  assert.throws(() => wf.createEnvelope({
    documents: mkDocs(1),
    signers: [{ id: 's1', name: 'X', email: 'x@y.com', role: 'approver' }],
    subject_he: 'ת', subject_en: 's',
  }), /invalid role/);
  assert.throws(() => wf.createEnvelope({
    documents: mkDocs(1),
    signers: [{ id: 's1', name: 'X', email: 'x@y.com', authRequired: 'face-id' }],
    subject_he: 'ת', subject_en: 's',
  }), /invalid authRequired/);
});

test('createEnvelope: envelopeDigest differs when document changes', () => {
  const wf = new ESignWorkflow();
  const a = mkBasicEnvelope(wf);
  const b = wf.createEnvelope({
    documents: [{ ...mkDocs(1)[0], content: 'DIFFERENT TEXT' }],
    signers: mkSigners([{ name: 'U' }, { name: 'K' }]),
    subject_he: 'חוזה עבודה — טכנו-קול עוזי',
    subject_en: 'Employment contract — Techno-Kol Uzi',
  });
  assert.notEqual(a.envelopeDigest, b.envelopeDigest);
});

test('createEnvelope: sorts signers by order', () => {
  const wf = new ESignWorkflow();
  const env = wf.createEnvelope({
    documents: mkDocs(1),
    signers: [
      { id: 's3', name: 'Gimel', email: 'g@x.com', order: 3 },
      { id: 's1', name: 'Alef', email: 'a@x.com', order: 1 },
      { id: 's2', name: 'Beth', email: 'b@x.com', order: 2 },
    ],
    subject_he: 'ת', subject_en: 's',
  });
  assert.deepEqual(env.signers.map(s => s.id), ['s1', 's2', 's3']);
});

// ─────────────────────────────────────────────────────────────────────
// sendEnvelope + sequential flow
// ─────────────────────────────────────────────────────────────────────

test('sendEnvelope: moves envelope out_for_signature and notifies first signer', () => {
  const wf = new ESignWorkflow();
  const env = mkBasicEnvelope(wf);
  const r = wf.sendEnvelope(env.envelopeId);
  assert.equal(r.ok, true);
  assert.equal(r.status, ENVELOPE_STATUS.OUT_FOR_SIGNATURE);
  assert.ok(r.firstSigner);
  assert.ok(r.link.startsWith('/esign/envelope/'));

  const live = wf.getEnvelope(env.envelopeId);
  assert.equal(live.status, ENVELOPE_STATUS.OUT_FOR_SIGNATURE);
  assert.equal(live.signers[0].status, SIGNER_STATUS.NOTIFIED);
  assert.ok(live.signers[0].magicLinkToken);
  assert.ok(live.sentAt);
});

test('sendEnvelope: returns NOT_FOUND for unknown id', () => {
  const wf = new ESignWorkflow();
  const r = wf.sendEnvelope('env_does_not_exist');
  assert.equal(r.ok, false);
  assert.equal(r.reason.code, 'NOT_FOUND');
});

test('recordSignature: signs first signer, advances to second', () => {
  const wf = new ESignWorkflow();
  const env = mkBasicEnvelope(wf);
  wf.sendEnvelope(env.envelopeId);

  const r = wf.recordSignature({
    envelopeId: env.envelopeId,
    signerId: env.signers[0].id,
    signaturePayload: mkSigPayload(),
    authEvidence: { method: 'email', verified: true },
  });
  assert.equal(r.ok, true);
  assert.equal(r.status, ENVELOPE_STATUS.PARTIAL);
  assert.equal(r.nextSigner, env.signers[1].id);

  const live = wf.getEnvelope(env.envelopeId);
  assert.equal(live.signers[0].status, SIGNER_STATUS.SIGNED);
  assert.ok(live.signers[0].signature);
  assert.equal(live.signers[0].signature.type, SIGNATURE_TYPE.TYPED);
  assert.ok(live.signers[0].signature.sig_hmac);
  assert.equal(live.signers[0].signature.ip, '10.0.0.42');
});

test('recordSignature: enforces sequential order', () => {
  const wf = new ESignWorkflow();
  const env = mkBasicEnvelope(wf);
  wf.sendEnvelope(env.envelopeId);

  // try to sign the second signer first
  const r = wf.recordSignature({
    envelopeId: env.envelopeId,
    signerId: env.signers[1].id,
    signaturePayload: mkSigPayload({ data: 'Kobi EL' }),
  });
  assert.equal(r.ok, false);
  assert.equal(r.reason.code, 'OUT_OF_ORDER');
});

test('recordSignature: completes envelope after all signers sign', () => {
  const wf = new ESignWorkflow();
  const env = mkBasicEnvelope(wf);
  wf.sendEnvelope(env.envelopeId);

  wf.recordSignature({
    envelopeId: env.envelopeId,
    signerId: env.signers[0].id,
    signaturePayload: mkSigPayload({ data: 'Uzi' }),
  });
  const r2 = wf.recordSignature({
    envelopeId: env.envelopeId,
    signerId: env.signers[1].id,
    signaturePayload: mkSigPayload({ data: 'Kobi' }),
  });
  assert.equal(r2.ok, true);
  assert.equal(r2.status, ENVELOPE_STATUS.COMPLETED);
  assert.equal(r2.nextSigner, null);

  const live = wf.getEnvelope(env.envelopeId);
  assert.equal(live.status, ENVELOPE_STATUS.COMPLETED);
  assert.ok(live.completedAt);
});

test('recordSignature: rejects unknown signer', () => {
  const wf = new ESignWorkflow();
  const env = mkBasicEnvelope(wf);
  wf.sendEnvelope(env.envelopeId);
  const r = wf.recordSignature({
    envelopeId: env.envelopeId,
    signerId: 'nope',
    signaturePayload: mkSigPayload(),
  });
  assert.equal(r.ok, false);
  assert.equal(r.reason.code, 'SIGNER_NOT_FOUND');
});

test('recordSignature: rejects invalid signature type', () => {
  const wf = new ESignWorkflow();
  const env = mkBasicEnvelope(wf);
  wf.sendEnvelope(env.envelopeId);
  const r = wf.recordSignature({
    envelopeId: env.envelopeId,
    signerId: env.signers[0].id,
    signaturePayload: { type: 'scribbled', data: 'x', ip: '1.1.1.1', userAgent: 'ua', timestamp: 'x' },
  });
  assert.equal(r.ok, false);
  assert.equal(r.reason.code, 'BAD_TYPE');
});

test('recordSignature: click type needs no data', () => {
  const wf = new ESignWorkflow();
  const env = mkBasicEnvelope(wf);
  wf.sendEnvelope(env.envelopeId);
  const r = wf.recordSignature({
    envelopeId: env.envelopeId,
    signerId: env.signers[0].id,
    signaturePayload: { type: SIGNATURE_TYPE.CLICK, ip: '1.1.1.1', userAgent: 'ua', timestamp: '2026-04-11' },
  });
  assert.equal(r.ok, true);
});

// ─────────────────────────────────────────────────────────────────────
// notifyNext
// ─────────────────────────────────────────────────────────────────────

test('notifyNext: advances to next pending signer after one signs', () => {
  const wf = new ESignWorkflow();
  const env = mkBasicEnvelope(wf);
  wf.sendEnvelope(env.envelopeId);
  wf.recordSignature({
    envelopeId: env.envelopeId,
    signerId: env.signers[0].id,
    signaturePayload: mkSigPayload(),
  });
  const r = wf.notifyNext(env.envelopeId);
  assert.equal(r.ok, true);
  assert.equal(r.signerId, env.signers[1].id);
  assert.ok(r.link);
});

test('notifyNext: returns done when all signers finished', () => {
  const wf = new ESignWorkflow();
  const env = mkBasicEnvelope(wf);
  wf.sendEnvelope(env.envelopeId);
  wf.recordSignature({ envelopeId: env.envelopeId, signerId: env.signers[0].id, signaturePayload: mkSigPayload() });
  wf.recordSignature({ envelopeId: env.envelopeId, signerId: env.signers[1].id, signaturePayload: mkSigPayload() });
  const r = wf.notifyNext(env.envelopeId);
  assert.equal(r.ok, true);
  assert.equal(r.signerId, null);
  assert.equal(r.status, ENVELOPE_STATUS.COMPLETED);
});

// ─────────────────────────────────────────────────────────────────────
// completeEnvelope + verifySeal
// ─────────────────────────────────────────────────────────────────────

test('completeEnvelope: seals with tamper-evident hash', () => {
  const wf = new ESignWorkflow();
  const env = mkBasicEnvelope(wf);
  wf.sendEnvelope(env.envelopeId);
  wf.recordSignature({ envelopeId: env.envelopeId, signerId: env.signers[0].id, signaturePayload: mkSigPayload() });
  wf.recordSignature({ envelopeId: env.envelopeId, signerId: env.signers[1].id, signaturePayload: mkSigPayload() });

  const r = wf.completeEnvelope(env.envelopeId);
  assert.equal(r.ok, true);
  assert.ok(r.sealHash && r.sealHash.length === 64);
  assert.equal(r.status, ENVELOPE_STATUS.SEALED);
  assert.ok(r.sealedAt);

  const v = wf.verifySeal(env.envelopeId);
  assert.equal(v.valid, true);
  assert.equal(v.stored, r.sealHash);
});

test('completeEnvelope: refuses to seal not-completed envelope', () => {
  const wf = new ESignWorkflow();
  const env = mkBasicEnvelope(wf);
  wf.sendEnvelope(env.envelopeId);
  const r = wf.completeEnvelope(env.envelopeId);
  assert.equal(r.ok, false);
  assert.equal(r.reason.code, 'NOT_COMPLETED');
});

test('verifySeal: detects tamper when stored hash is mutated', () => {
  const wf = new ESignWorkflow();
  const env = mkBasicEnvelope(wf);
  wf.sendEnvelope(env.envelopeId);
  wf.recordSignature({ envelopeId: env.envelopeId, signerId: env.signers[0].id, signaturePayload: mkSigPayload() });
  wf.recordSignature({ envelopeId: env.envelopeId, signerId: env.signers[1].id, signaturePayload: mkSigPayload() });
  wf.completeEnvelope(env.envelopeId);

  // Mutate internal state to simulate tampering. `_envelopes` is not
  // a public API, so this is reaching under the hood intentionally.
  const internal = wf._envelopes.get(env.envelopeId);
  internal.sealHash = 'deadbeef'.padEnd(64, '0');
  const v = wf.verifySeal(env.envelopeId);
  assert.equal(v.valid, false);
});

// ─────────────────────────────────────────────────────────────────────
// auditCertificate
// ─────────────────────────────────────────────────────────────────────

test('auditCertificate: contains all legally material fields', () => {
  const wf = new ESignWorkflow();
  const env = mkBasicEnvelope(wf);
  wf.sendEnvelope(env.envelopeId);
  wf.recordSignature({
    envelopeId: env.envelopeId,
    signerId: env.signers[0].id,
    signaturePayload: mkSigPayload(),
    authEvidence: { method: 'email', verified: true },
  });
  wf.recordSignature({
    envelopeId: env.envelopeId,
    signerId: env.signers[1].id,
    signaturePayload: mkSigPayload({ data: 'Kobi' }),
    authEvidence: { method: 'email', verified: true },
  });
  wf.completeEnvelope(env.envelopeId);
  const cert = wf.auditCertificate(env.envelopeId);

  // Top-level structure
  assert.equal(cert.certificate_type, 'ESign Certificate of Completion');
  assert.match(cert.certificate_type_he, /תעודת/);
  assert.ok(cert.certificate_id.startsWith('cert_'));
  assert.ok(cert.issued_at);

  // Envelope block
  assert.equal(cert.envelope.id, env.envelopeId);
  assert.equal(cert.envelope.status, ENVELOPE_STATUS.SEALED);
  assert.ok(cert.envelope.seal_hash);
  assert.ok(cert.envelope.envelope_digest);
  assert.match(cert.envelope.subject_he, /חוזה עבודה/);

  // Compliance block
  assert.ok(Object.values(COMPLIANCE_LEVEL).includes(cert.compliance.level));
  assert.match(cert.compliance.law_reference, /חתימה אלקטרונית/);
  assert.ok(cert.compliance.level_he);
  assert.ok(cert.compliance.level_en);

  // Documents block
  assert.ok(Array.isArray(cert.documents));
  assert.equal(cert.documents.length, 1);
  assert.equal(cert.documents[0].hash_algorithm, 'SHA-256');

  // Signers block
  assert.equal(cert.signers.length, 2);
  for (const s of cert.signers) {
    assert.ok(s.id && s.name && s.email);
    assert.ok(s.signature);
    assert.equal(s.status, SIGNER_STATUS.SIGNED);
    assert.ok(s.signature.sig_hmac);
    assert.ok(s.signature.envelope_digest);
  }

  // Audit trail + tamper evidence
  assert.ok(Array.isArray(cert.audit_trail));
  assert.ok(cert.audit_trail.length > 0);
  assert.equal(cert.tamper_evidence.hash_algorithm, 'SHA-256');
  assert.equal(cert.tamper_evidence.hmac_algorithm, 'HMAC-SHA-256');

  // Bilingual notes
  assert.ok(cert.notes_he.length >= 1);
  assert.ok(cert.notes_en.length >= 1);
});

test('auditCertificate: issuing cert appends audit event', () => {
  const wf = new ESignWorkflow();
  const env = mkBasicEnvelope(wf);
  wf.sendEnvelope(env.envelopeId);
  wf.recordSignature({ envelopeId: env.envelopeId, signerId: env.signers[0].id, signaturePayload: mkSigPayload() });
  wf.recordSignature({ envelopeId: env.envelopeId, signerId: env.signers[1].id, signaturePayload: mkSigPayload() });
  wf.completeEnvelope(env.envelopeId);
  wf.auditCertificate(env.envelopeId);
  const live = wf.getEnvelope(env.envelopeId);
  assert.ok(live.audit_trail.some(e => e.event === AUDIT_EVENT.AUDIT_CERT_ISSUED));
});

// ─────────────────────────────────────────────────────────────────────
// declineSignature
// ─────────────────────────────────────────────────────────────────────

test('declineSignature: terminal, sets envelope status declined', () => {
  const wf = new ESignWorkflow();
  const env = mkBasicEnvelope(wf);
  wf.sendEnvelope(env.envelopeId);
  const r = wf.declineSignature(env.envelopeId, env.signers[0].id, 'Not authorised');
  assert.equal(r.ok, true);
  assert.equal(r.status, ENVELOPE_STATUS.DECLINED);

  const live = wf.getEnvelope(env.envelopeId);
  assert.equal(live.signers[0].status, SIGNER_STATUS.DECLINED);
  assert.equal(live.signers[0].declineReason, 'Not authorised');
  assert.ok(live.audit_trail.some(e => e.event === AUDIT_EVENT.SIGNATURE_DECLINED));
});

test('declineSignature: cannot sign after decline', () => {
  const wf = new ESignWorkflow();
  const env = mkBasicEnvelope(wf);
  wf.sendEnvelope(env.envelopeId);
  wf.declineSignature(env.envelopeId, env.signers[0].id, 'nope');
  const r = wf.recordSignature({
    envelopeId: env.envelopeId,
    signerId: env.signers[0].id,
    signaturePayload: mkSigPayload(),
  });
  assert.equal(r.ok, false);
  // Envelope is already in DECLINED state => BAD_STATE / DECLINED
  assert.ok(['DECLINED', 'BAD_STATE', 'ALREADY_DECLINED'].includes(r.reason.code));
});

// ─────────────────────────────────────────────────────────────────────
// voidEnvelope
// ─────────────────────────────────────────────────────────────────────

test('voidEnvelope: voids before completion and blocks further signatures', () => {
  const wf = new ESignWorkflow();
  const env = mkBasicEnvelope(wf);
  wf.sendEnvelope(env.envelopeId);
  const v = wf.voidEnvelope({
    envelopeId: env.envelopeId,
    reason: 'Replaced by new contract',
    initiator: 'admin_001',
  });
  assert.equal(v.ok, true);

  const live = wf.getEnvelope(env.envelopeId);
  assert.equal(live.status, ENVELOPE_STATUS.VOIDED);
  assert.equal(live.voidReason, 'Replaced by new contract');
  assert.equal(live.voidInitiator, 'admin_001');

  // cannot sign a voided envelope
  const r = wf.recordSignature({
    envelopeId: env.envelopeId,
    signerId: env.signers[0].id,
    signaturePayload: mkSigPayload(),
  });
  assert.equal(r.ok, false);
  assert.equal(r.reason.code, 'VOIDED');
});

test('voidEnvelope: refuses to void completed envelope', () => {
  const wf = new ESignWorkflow();
  const env = mkBasicEnvelope(wf);
  wf.sendEnvelope(env.envelopeId);
  wf.recordSignature({ envelopeId: env.envelopeId, signerId: env.signers[0].id, signaturePayload: mkSigPayload() });
  wf.recordSignature({ envelopeId: env.envelopeId, signerId: env.signers[1].id, signaturePayload: mkSigPayload() });
  wf.completeEnvelope(env.envelopeId);
  const v = wf.voidEnvelope({ envelopeId: env.envelopeId, reason: 'oops', initiator: 'x' });
  assert.equal(v.ok, false);
  assert.equal(v.reason.code, 'ALREADY_DONE');
});

test('voidEnvelope: idempotent — second void returns alreadyVoided', () => {
  const wf = new ESignWorkflow();
  const env = mkBasicEnvelope(wf);
  wf.sendEnvelope(env.envelopeId);
  wf.voidEnvelope({ envelopeId: env.envelopeId, reason: 'r', initiator: 'i' });
  const v2 = wf.voidEnvelope({ envelopeId: env.envelopeId, reason: 'r', initiator: 'i' });
  assert.equal(v2.ok, true);
  assert.equal(v2.alreadyVoided, true);
});

// ─────────────────────────────────────────────────────────────────────
// reminderSchedule
// ─────────────────────────────────────────────────────────────────────

test('reminderSchedule: schedules reminders and appends audit', () => {
  const wf = new ESignWorkflow();
  const env = mkBasicEnvelope(wf);
  wf.sendEnvelope(env.envelopeId);
  const r = wf.reminderSchedule({
    envelopeId: env.envelopeId,
    offsets: [24, 72, 168],
  });
  assert.equal(r.ok, true);
  assert.equal(r.reminders.length, 3);
  for (const rem of r.reminders) {
    assert.ok(rem.id.startsWith('rem_'));
    assert.ok(rem.due_at);
    assert.equal(rem.sent, false);
  }
  const live = wf.getEnvelope(env.envelopeId);
  assert.equal(live.reminders.length, 3);
  assert.ok(live.audit_trail.some(e => e.event === AUDIT_EVENT.REMINDER_SCHEDULED));
});

// ─────────────────────────────────────────────────────────────────────
// complianceLevel
// ─────────────────────────────────────────────────────────────────────

test('complianceLevel: Simple when email-only auth', () => {
  const wf = new ESignWorkflow();
  const env = mkBasicEnvelope(wf);
  wf.sendEnvelope(env.envelopeId);
  wf.recordSignature({ envelopeId: env.envelopeId, signerId: env.signers[0].id, signaturePayload: mkSigPayload() });
  wf.recordSignature({ envelopeId: env.envelopeId, signerId: env.signers[1].id, signaturePayload: mkSigPayload() });
  const c = wf.complianceLevel(env.envelopeId);
  assert.equal(c.level, COMPLIANCE_LEVEL.SIMPLE);
  assert.match(c.level_he, /רגילה/);
});

test('complianceLevel: Advanced when all signers used strong auth', () => {
  const wf = new ESignWorkflow();
  const env = wf.createEnvelope({
    documents: mkDocs(1),
    signers: [
      { id: 's1', name: 'Uzi', email: 'u@x', authRequired: AUTH_METHOD.SMS_OTP },
      { id: 's2', name: 'Kobi', email: 'k@x', authRequired: AUTH_METHOD.ID_VERIFY },
    ],
    subject_he: 'ח', subject_en: 'c',
  });
  wf.sendEnvelope(env.envelopeId);
  wf.recordSignature({
    envelopeId: env.envelopeId,
    signerId: 's1',
    signaturePayload: mkSigPayload({ data: 'Uzi' }),
    authEvidence: { otp: 'verified' },
  });
  wf.recordSignature({
    envelopeId: env.envelopeId,
    signerId: 's2',
    signaturePayload: mkSigPayload({ data: 'Kobi' }),
    authEvidence: { id_check: 'verified' },
  });
  const c = wf.complianceLevel(env.envelopeId);
  assert.equal(c.level, COMPLIANCE_LEVEL.ADVANCED);
});

test('complianceLevel: Qualified when smart-card + CA bridge registered', () => {
  const wf = new ESignWorkflow();
  registerQualifiedCA({ issue: () => ({ ok: true, serial: 'X' }) });
  const env = wf.createEnvelope({
    documents: mkDocs(1),
    signers: [
      { id: 's1', name: 'Uzi', email: 'u@x', authRequired: AUTH_METHOD.SMART_CARD },
      { id: 's2', name: 'Kobi', email: 'k@x', authRequired: AUTH_METHOD.SMART_CARD },
    ],
    subject_he: 'ח', subject_en: 'c',
  });
  wf.sendEnvelope(env.envelopeId);
  wf.recordSignature({
    envelopeId: env.envelopeId,
    signerId: 's1',
    signaturePayload: mkSigPayload({ data: 'Uzi' }),
    authEvidence: { qualified: true, cert_serial: 'A' },
  });
  wf.recordSignature({
    envelopeId: env.envelopeId,
    signerId: 's2',
    signaturePayload: mkSigPayload({ data: 'Kobi' }),
    authEvidence: { qualified: true, cert_serial: 'B' },
  });
  const c = wf.complianceLevel(env.envelopeId);
  assert.equal(c.level, COMPLIANCE_LEVEL.QUALIFIED);
  // Reset — the CA registry is a module-level singleton.
  registerQualifiedCA(null);
});

// ─────────────────────────────────────────────────────────────────────
// timestampToken (mockable TSA)
// ─────────────────────────────────────────────────────────────────────

test('timestampToken: uses registered TSA and requires sealed envelope', () => {
  const wf = new ESignWorkflow();
  const env = mkBasicEnvelope(wf);
  wf.sendEnvelope(env.envelopeId);
  wf.recordSignature({ envelopeId: env.envelopeId, signerId: env.signers[0].id, signaturePayload: mkSigPayload() });
  wf.recordSignature({ envelopeId: env.envelopeId, signerId: env.signers[1].id, signaturePayload: mkSigPayload() });

  // Before seal — should refuse
  const preSeal = wf.timestampToken(env.envelopeId);
  assert.equal(preSeal.ok, false);
  assert.equal(preSeal.reason.code, 'NOT_SEALED');

  wf.completeEnvelope(env.envelopeId);

  let calledWith = null;
  registerTSA((digest) => {
    calledWith = digest;
    return {
      rfc: 'RFC 3161',
      tsa: 'mock://tsa',
      issued_at: '2026-04-11T10:00:00.000Z',
      tokenId: 'tsa_mock_xx',
      token: sha256('mock|' + digest),
      mocked: true,
    };
  });

  const tok = wf.timestampToken(env.envelopeId);
  assert.equal(tok.rfc, 'RFC 3161');
  assert.equal(tok.tsa, 'mock://tsa');
  assert.ok(tok.token);
  assert.ok(calledWith && calledWith.length === 64);

  const live = wf.getEnvelope(env.envelopeId);
  assert.equal(live.status, ENVELOPE_STATUS.SEALED_TIMESTAMPED);
  assert.ok(live.tsaToken);
  assert.ok(live.audit_trail.some(e => e.event === AUDIT_EVENT.TSA_TIMESTAMP));

  // Reset TSA registry
  registerTSA(null);
});

// ─────────────────────────────────────────────────────────────────────
// Tamper-hash assertion — every seal must include the envelope digest
// ─────────────────────────────────────────────────────────────────────

test('seal hash is sensitive to any signer modification (tamper check)', () => {
  const wf = new ESignWorkflow();
  const env = mkBasicEnvelope(wf);
  wf.sendEnvelope(env.envelopeId);
  wf.recordSignature({ envelopeId: env.envelopeId, signerId: env.signers[0].id, signaturePayload: mkSigPayload() });
  wf.recordSignature({ envelopeId: env.envelopeId, signerId: env.signers[1].id, signaturePayload: mkSigPayload() });
  const seal1 = wf.completeEnvelope(env.envelopeId).sealHash;

  // Take the already-sealed envelope and mutate a signer's email.
  // verifySeal must now fail to verify.
  const internal = wf._envelopes.get(env.envelopeId);
  internal.signers[0].email = 'attacker@evil.com';

  const v = wf.verifySeal(env.envelopeId);
  assert.equal(v.valid, false);
  assert.equal(v.stored, seal1);
  assert.notEqual(v.recomputed, seal1);
});

// ─────────────────────────────────────────────────────────────────────
// Never delete — requests list keeps declined + voided entries visible
// ─────────────────────────────────────────────────────────────────────

test('never delete rule: declined and voided envelopes remain in listEnvelopes()', () => {
  const wf = new ESignWorkflow();
  const envA = mkBasicEnvelope(wf);
  wf.sendEnvelope(envA.envelopeId);
  wf.declineSignature(envA.envelopeId, envA.signers[0].id, 'test');

  const envB = mkBasicEnvelope(wf);
  wf.sendEnvelope(envB.envelopeId);
  wf.voidEnvelope({ envelopeId: envB.envelopeId, reason: 'test', initiator: 'admin' });

  const all = wf.listEnvelopes();
  assert.equal(all.length, 2);
  const byId = Object.fromEntries(all.map(e => [e.envelopeId, e]));
  assert.equal(byId[envA.envelopeId].status, ENVELOPE_STATUS.DECLINED);
  assert.equal(byId[envB.envelopeId].status, ENVELOPE_STATUS.VOIDED);
});
