/**
 * Whistleblower Portal — Unit Tests
 * Agent Y-143 / Swarm Compliance / Techno-Kol Uzi Mega-ERP 2026
 *
 * Run with:
 *   node --test onyx-procurement/test/compliance/whistleblower.test.js
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const {
  WhistleblowerPortal,
  CATEGORIES,
  REPORT_STATUS,
  FINDINGS,
  EXTERNAL_TARGETS,
  EVENT_TYPES,
  ROLES,
} = require('../../src/compliance/whistleblower.js');

// ─── helpers ───────────────────────────────────────────────────────────
const FIXED_NOW = '2026-04-11T09:00:00.000Z';
const clockAt = (iso) => () => new Date(iso);

// Use a deterministic master key so tests are reproducible.
const TEST_KEY = crypto.createHash('sha256').update('test-key-2026').digest();

function makePortal(nowIso = FIXED_NOW) {
  return new WhistleblowerPortal({
    now: clockAt(nowIso),
    masterKey: TEST_KEY,
    salt: 'test-salt-abcdef',
  });
}

function seedReport(portal, overrides = {}) {
  return portal.submitReport({
    category: overrides.category || CATEGORIES.FRAUD,
    description:
      overrides.description ||
      'חשד להונאה: חשבוניות כפולות מספק בחשבון 512. ' +
        'Suspicious double invoicing from vendor in account 512.',
    evidence:
      overrides.evidence !== undefined
        ? overrides.evidence
        : [
            { type: 'file', filename: 'invoice-a.pdf', sha256: 'abc123' },
            { type: 'note', text: 'amount NIS 15,000 paid twice' },
          ],
    anonymous: overrides.anonymous === undefined ? true : overrides.anonymous,
    contactMethod: overrides.contactMethod,
    preferredContact: overrides.preferredContact,
    accusedDept: overrides.accusedDept || 'procurement',
    accusedParty: overrides.accusedParty,
    language: overrides.language || 'he',
  });
}

// ───────────────────────────────────────────────────────────────────────

describe('WhistleblowerPortal — submission & tokens', () => {
  test('1) submitReport creates report with encrypted description and opaque token', () => {
    const portal = makePortal();
    const { reportId, reporterToken, caseNumber } = seedReport(portal);
    assert.match(reportId, /^WB-/);
    assert.match(caseNumber, /^WB-2026-\d{4}$/);
    assert.equal(typeof reporterToken, 'string');
    // 32 bytes -> 64 hex chars
    assert.equal(reporterToken.length, 64);
    // description is never stored in plaintext anywhere in the report
    const internal = portal._reports.get(reportId);
    assert.ok(internal.encryptedDescription.ct);
    assert.ok(internal.encryptedDescription.iv);
    assert.ok(internal.encryptedDescription.tag);
    assert.equal(internal.encryptedDescription.algo, 'aes-256-gcm');
  });

  test('2) submitReport rejects invalid category', () => {
    const portal = makePortal();
    assert.throws(
      () =>
        portal.submitReport({
          category: 'mystery',
          description: 'x',
          anonymous: true,
        }),
      /invalid category/
    );
  });

  test('3) submitReport rejects missing anonymous flag', () => {
    const portal = makePortal();
    assert.throws(
      () =>
        portal.submitReport({
          category: CATEGORIES.SAFETY,
          description: 'missing helmet enforcement',
        }),
      /anonymous flag/
    );
  });

  test('4) anonymous submission stores no contact info anywhere', () => {
    const portal = makePortal();
    const { reportId } = seedReport(portal, {
      anonymous: true,
      contactMethod: 'email',
      preferredContact: 'leaker@example.com',
    });
    const internal = portal._reports.get(reportId);
    // Portal MUST NOT store contact info for anonymous reports, encrypted
    // or otherwise — the anonymity invariant forbids even ciphertext.
    assert.equal(internal.encryptedContact, null);
    assert.equal(internal.anonymous, true);
  });

  test('5) identified submission stores contact info encrypted', () => {
    const portal = makePortal();
    const { reportId } = seedReport(portal, {
      anonymous: false,
      contactMethod: 'email',
      preferredContact: 'mysecret@company.co.il',
    });
    const internal = portal._reports.get(reportId);
    assert.equal(internal.anonymous, false);
    assert.ok(internal.encryptedContact);
    assert.equal(internal.encryptedContact.algo, 'aes-256-gcm');
    // And the literal contact must not appear in the ciphertext or in
    // any other field as plaintext (quick smoke check over JSON):
    const dump = JSON.stringify(internal);
    assert.equal(dump.includes('mysecret@company.co.il'), false);
  });

  test('6) anonymousToken returns 64-char hex and unique tokens', () => {
    const portal = makePortal();
    const t1 = portal.anonymousToken();
    const t2 = portal.anonymousToken();
    assert.equal(t1.length, 64);
    assert.match(t1, /^[0-9a-f]{64}$/);
    assert.notEqual(t1, t2);
  });
});

describe('WhistleblowerPortal — conflict-of-interest', () => {
  test('7) assignInvestigator blocks investigator from accused department', () => {
    const portal = makePortal();
    const { reportId } = seedReport(portal, { accusedDept: 'procurement' });
    assert.throws(
      () =>
        portal.assignInvestigator({
          reportId,
          investigator: {
            id: 'inv-01',
            name: 'חוקר ראשון',
            department: 'procurement',
          },
        }),
      /conflict of interest/
    );
    // A CONFLICT_BLOCKED event must appear in the audit log.
    const conflicts = portal.auditLog({ type: EVENT_TYPES.CONFLICT_BLOCKED });
    assert.equal(conflicts.length, 1);
    assert.equal(conflicts[0].payload.reportId, reportId);
  });

  test('8) assignInvestigator succeeds for independent investigator', () => {
    const portal = makePortal();
    const { reportId } = seedReport(portal, { accusedDept: 'procurement' });
    const assn = portal.assignInvestigator({
      reportId,
      investigator: {
        id: 'inv-02',
        name: 'Internal Audit',
        department: 'internal_audit',
      },
    });
    assert.equal(assn.investigatorId, 'inv-02');
    assert.equal(
      portal._reports.get(reportId).status,
      REPORT_STATUS.ASSIGNED
    );
    const assigned = portal.auditLog({ type: EVENT_TYPES.REPORT_ASSIGNED });
    assert.equal(assigned.length, 1);
  });
});

describe('WhistleblowerPortal — secure messaging', () => {
  test('9) secureMessaging stores ciphertext, decrypts for investigator', () => {
    const portal = makePortal();
    const { reportId } = seedReport(portal);
    portal.assignInvestigator({
      reportId,
      investigator: { id: 'inv-02', department: 'internal_audit' },
    });
    const msg = portal.secureMessaging({
      reportId,
      from: ROLES.INVESTIGATOR,
      to: ROLES.REPORTER,
      message: 'נשמח לפרטים נוספים על מספר החשבונית השני.',
      encrypt: true,
    });
    assert.equal(msg.encrypted, true);
    assert.ok(msg.encryptedContent.ct);
    assert.equal(msg.plaintext, null);
    // Decrypted view for investigator must return the original string
    const visible = portal.readMessages(reportId, { role: ROLES.INVESTIGATOR });
    assert.equal(visible.length, 1);
    assert.equal(
      visible[0].content,
      'נשמח לפרטים נוספים על מספר החשבונית השני.'
    );
  });

  test('10) reporter only sees messages addressed to them', () => {
    const portal = makePortal();
    const { reportId } = seedReport(portal);
    portal.assignInvestigator({
      reportId,
      investigator: { id: 'inv-02', department: 'internal_audit' },
    });
    portal.secureMessaging({
      reportId,
      from: ROLES.INVESTIGATOR,
      to: ROLES.REPORTER,
      message: 'Question for you',
    });
    portal.secureMessaging({
      reportId,
      from: ROLES.INVESTIGATOR,
      to: 'legal-ops',
      message: 'Internal only',
    });
    const reporterView = portal.readMessages(reportId, {
      role: ROLES.REPORTER,
    });
    assert.equal(reporterView.length, 1);
    assert.equal(reporterView[0].content, 'Question for you');
  });
});

describe('WhistleblowerPortal — retaliation protection', () => {
  test('11) retaliationProtection flags the case for the token holder', () => {
    const portal = makePortal();
    const { reporterToken, reportId } = seedReport(portal);
    const flag = portal.retaliationProtection(reporterToken);
    assert.equal(flag.active, true);
    assert.equal(flag.reportId, reportId);
    assert.equal(portal._reports.get(reportId).retaliationFlagged, true);
    const flagged = portal.auditLog({
      type: EVENT_TYPES.RETALIATION_FLAGGED,
    });
    assert.equal(flagged.length, 1);
  });

  test('12) reportAdverseAction auto-escalates when flagged', () => {
    const portal = makePortal();
    const { reporterToken } = seedReport(portal);
    portal.retaliationProtection(reporterToken);
    const entry = portal.reportAdverseAction({
      reporterToken,
      action: {
        type: 'demotion',
        description: 'downgraded to junior role after filing report',
        occurredAt: '2026-04-10T10:00:00.000Z',
      },
    });
    assert.equal(entry.autoEscalated, true);
    const escalated = portal.auditLog({
      type: EVENT_TYPES.RETALIATION_ESCALATED,
    });
    assert.equal(escalated.length, 1);
    assert.equal(escalated[0].payload.autoEscalated, true);
    assert.equal(escalated[0].payload.actionType, 'demotion');
  });

  test('13) unknown token cannot trigger retaliation protection', () => {
    const portal = makePortal();
    assert.throws(
      () => portal.retaliationProtection('deadbeef'.repeat(8)),
      /unknown reporter token/
    );
  });
});

describe('WhistleblowerPortal — status updates & reporter view', () => {
  test('14) statusUpdate appends to history and reporterStatus reflects it', () => {
    const portal = makePortal();
    const { reporterToken, reportId } = seedReport(portal);
    portal.assignInvestigator({
      reportId,
      investigator: { id: 'inv-02', department: 'internal_audit' },
    });
    portal.statusUpdate({
      reportId,
      status: REPORT_STATUS.INVESTIGATING,
      publicNotes: 'בבדיקת חשבוניות הספק',
    });
    const view = portal.reporterStatus(reporterToken);
    assert.equal(view.status, REPORT_STATUS.INVESTIGATING);
    assert.ok(view.history.length >= 2);
    // Reporter view must never leak PII-bearing encrypted blobs.
    assert.equal(view.encryptedDescription, undefined);
    assert.equal(view.encryptedContact, undefined);
  });

  test('15) invalid status value is rejected', () => {
    const portal = makePortal();
    const { reportId } = seedReport(portal);
    assert.throws(
      () => portal.statusUpdate({ reportId, status: 'maybe' }),
      /invalid status/
    );
  });
});

describe('WhistleblowerPortal — investigator notes (append-only)', () => {
  test('16) investigatorNotes requires assigned investigator and is append-only', () => {
    const portal = makePortal();
    const { reportId } = seedReport(portal);
    // not assigned yet
    assert.throws(
      () =>
        portal.investigatorNotes({
          reportId,
          note: 'first note',
          investigatorId: 'inv-02',
        }),
      /not assigned/
    );
    portal.assignInvestigator({
      reportId,
      investigator: { id: 'inv-02', department: 'internal_audit' },
    });
    portal.investigatorNotes({
      reportId,
      investigatorId: 'inv-02',
      note: 'first note',
    });
    portal.investigatorNotes({
      reportId,
      investigatorId: 'inv-02',
      note: 'second note',
    });
    const notes = portal.getInvestigatorNotes(reportId, 'inv-02');
    assert.equal(notes.length, 2);
    assert.equal(notes[0].note, 'first note');
    assert.equal(notes[1].note, 'second note');
    // Append-only: notes array is not exposed as mutable, and the note
    // records are frozen.
    assert.throws(() => {
      portal._notes.get(reportId)[0].note = 'tampered';
    });
  });

  test('17) notes are encrypted at rest and unauthorised investigator cannot read', () => {
    const portal = makePortal();
    const { reportId } = seedReport(portal);
    portal.assignInvestigator({
      reportId,
      investigator: { id: 'inv-02', department: 'internal_audit' },
    });
    portal.investigatorNotes({
      reportId,
      investigatorId: 'inv-02',
      note: 'confidential lead — vendor X kickback suspected',
    });
    const raw = portal._notes.get(reportId)[0];
    assert.ok(raw.encrypted.ct);
    assert.equal(raw.encrypted.algo, 'aes-256-gcm');
    const dump = JSON.stringify(raw);
    assert.equal(dump.includes('kickback'), false);
    // Wrong investigator is denied
    assert.throws(
      () => portal.getInvestigatorNotes(reportId, 'inv-99'),
      /not authorised/
    );
  });
});

describe('WhistleblowerPortal — close & external escalation', () => {
  test('18) closeReport requires a valid finding and updates public status', () => {
    const portal = makePortal();
    const { reporterToken, reportId } = seedReport(portal);
    assert.throws(
      () =>
        portal.closeReport({
          reportId,
          finding: 'maybe',
          actions: [],
        }),
      /invalid finding/
    );
    portal.closeReport({
      reportId,
      finding: FINDINGS.SUBSTANTIATED,
      actions: ['terminated vendor contract', 'recovered NIS 30,000'],
    });
    const r = portal._reports.get(reportId);
    assert.equal(r.closed, true);
    assert.equal(r.finding, FINDINGS.SUBSTANTIATED);
    const view = portal.reporterStatus(reporterToken);
    assert.equal(view.status, REPORT_STATUS.CLOSED);
    assert.equal(view.closed, true);
    assert.equal(view.finding, FINDINGS.SUBSTANTIATED);
  });

  test('19) externalEscalation appends record and emits audit event', () => {
    const portal = makePortal();
    const { reportId } = seedReport(portal);
    const entry = portal.externalEscalation(
      reportId,
      EXTERNAL_TARGETS.OMBUDSMAN
    );
    assert.equal(entry.target, EXTERNAL_TARGETS.OMBUDSMAN);
    assert.equal(portal._reports.get(reportId).status, REPORT_STATUS.ESCALATED);
    assert.equal(portal._reports.get(reportId).externalEscalations.length, 1);
    const events = portal.auditLog({
      type: EVENT_TYPES.ESCALATED_EXTERNAL,
    });
    assert.equal(events.length, 1);
    assert.equal(events[0].payload.target, EXTERNAL_TARGETS.OMBUDSMAN);
    // Invalid target is refused
    assert.throws(
      () => portal.externalEscalation(reportId, 'martians'),
      /invalid external target/
    );
  });
});

describe('WhistleblowerPortal — integrity & statutory', () => {
  test('20) hash-chain integrity: verifyChain + integrityCheck detect tampering', () => {
    const portal = makePortal();
    const { reportId } = seedReport(portal);
    portal.assignInvestigator({
      reportId,
      investigator: { id: 'inv-02', department: 'internal_audit' },
    });
    portal.statusUpdate({
      reportId,
      status: REPORT_STATUS.INVESTIGATING,
      publicNotes: 'בעבודה',
    });
    // Clean state
    assert.equal(portal.verifyChain().valid, true);
    const chk = portal.integrityCheck(reportId);
    assert.equal(chk.valid, true);
    assert.ok(chk.events >= 3);

    // Tamper with the middle event's payload (using defineProperty to
    // bypass the outer Object.freeze that protects the event wrapper).
    const target = portal._events[1];
    Object.defineProperty(target.payload, 'investigatorId', {
      value: 'MALLORY',
      writable: true,
      configurable: true,
    });
    const after = portal.verifyChain();
    assert.equal(after.valid, false);
    assert.ok(after.brokenAt > 0);
  });

  test('21) statutoryReport returns bilingual aggregates with no identities', () => {
    const portal = makePortal();
    seedReport(portal, { category: CATEGORIES.FRAUD });
    const { reportId: r2 } = seedReport(portal, {
      category: CATEGORIES.SAFETY,
      anonymous: false,
      contactMethod: 'portal',
      preferredContact: 'user-123',
    });
    const { reporterToken: t3, reportId: r3 } = seedReport(portal, {
      category: CATEGORIES.HARASSMENT,
    });
    portal.retaliationProtection(t3);
    portal.externalEscalation(r2, EXTERNAL_TARGETS.STATE_COMPTROLLER);
    portal.assignInvestigator({
      reportId: r3,
      investigator: { id: 'inv-02', department: 'internal_audit' },
    });
    portal.closeReport({
      reportId: r3,
      finding: FINDINGS.UNSUBSTANTIATED,
      actions: [],
    });

    const report = portal.statutoryReport({
      from: '2026-01-01T00:00:00.000Z',
      to: '2026-12-31T23:59:59.999Z',
    });
    assert.equal(report.counts.total, 3);
    assert.equal(report.counts.byCategory.fraud, 1);
    assert.equal(report.counts.byCategory.safety, 1);
    assert.equal(report.counts.byCategory.harassment, 1);
    assert.equal(report.counts.anonymousCount, 2);
    assert.equal(report.counts.identifiedCount, 1);
    assert.equal(report.counts.retaliationFlags, 1);
    assert.equal(report.counts.externalEscalations, 1);
    assert.equal(report.counts.byFinding.unsubstantiated, 1);

    // Legal basis must be present in HE and EN
    assert.match(report.legalBasis.he, /תשנ"ז-1997/);
    assert.match(report.legalBasis.en, /5757-1997/);

    // No identities — dump the whole report and scan for the one
    // identified preferredContact we seeded.
    const dump = JSON.stringify(report);
    assert.equal(dump.includes('user-123'), false);
  });

  test('22) token-based status lookup returns only public fields', () => {
    const portal = makePortal();
    const { reporterToken } = seedReport(portal, {
      anonymous: false,
      contactMethod: 'email',
      preferredContact: 'hidden@example.com',
    });
    const view = portal.reporterStatus(reporterToken);
    const dump = JSON.stringify(view);
    assert.equal(dump.includes('hidden@example.com'), false);
    assert.equal(dump.includes('encryptedDescription'), false);
    assert.equal(dump.includes('encryptedContact'), false);
    assert.equal(view.status, REPORT_STATUS.SUBMITTED);
  });

  test('23) token is unlinkable — reverse lookup from tokenHash is not possible', () => {
    const portal = makePortal();
    const { reporterToken, reportId } = seedReport(portal);
    const tokenHash = portal._hashToken(reporterToken);
    // Audit log must not carry tokenHash or tokens of any kind
    const events = portal.auditLog();
    for (const ev of events) {
      const payload = ev.payload || {};
      assert.equal(payload.tokenHash, undefined);
      assert.equal(payload.reporterToken, undefined);
    }
    // Internal token index resolves, but this is intentionally one-way:
    // tokenHash -> reportId. No stored token -> reporter identity lookup
    // is possible because anonymous submissions never saved identity in
    // the first place.
    assert.equal(portal._tokenIndex.get(tokenHash), reportId);
  });

  test('24) "never delete" invariant — released/closed reports remain readable', () => {
    const portal = makePortal();
    const { reportId } = seedReport(portal);
    portal.assignInvestigator({
      reportId,
      investigator: { id: 'inv-02', department: 'internal_audit' },
    });
    portal.closeReport({
      reportId,
      finding: FINDINGS.INCONCLUSIVE,
      actions: [],
    });
    // Cannot close twice
    assert.throws(
      () =>
        portal.closeReport({
          reportId,
          finding: FINDINGS.INCONCLUSIVE,
          actions: [],
        }),
      /already closed/
    );
    // Historical status entries preserved
    const history = portal._statusHistory.get(reportId);
    assert.ok(history.length >= 2);
    // Report still exists — never deleted
    assert.ok(portal._reports.has(reportId));
    // Audit events cumulative
    const closed = portal.auditLog({ type: EVENT_TYPES.REPORT_CLOSED });
    assert.equal(closed.length, 1);
  });

  test('25) AES-256-GCM authentication catches ciphertext tampering', () => {
    const portal = makePortal();
    const { reportId } = seedReport(portal);
    const blob = portal._reports.get(reportId).encryptedDescription;
    // Flip one byte of ciphertext
    const bad = {
      ...blob,
      ct:
        blob.ct.slice(0, -2) +
        (blob.ct.slice(-2) === 'ff' ? '00' : 'ff'),
    };
    assert.throws(
      () => portal._decrypt(bad),
      /Unsupported state|auth|bad decrypt/i
    );
  });
});
