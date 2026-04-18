/**
 * Legal Hold Enforcer — Unit Tests
 * Agent Y-150 / Swarm Compliance / Techno-Kol Uzi Mega-ERP 2026
 *
 * Run with:
 *   node --test onyx-procurement/test/compliance/legal-hold.test.js
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const {
  LegalHoldEnforcer,
  HOLD_STATUS,
  HOLD_SOURCES,
  EVENT_TYPES,
} = require('../../src/compliance/legal-hold.js');

// ─── helpers ───────────────────────────────────────────────────────────
const FIXED_NOW = '2026-04-11T09:00:00.000Z';
const clockAt = (iso) => () => new Date(iso);

function makeEnforcer(nowIso = FIXED_NOW) {
  return new LegalHoldEnforcer({ now: clockAt(nowIso) });
}

function seedHold(enf, overrides = {}) {
  return enf.createHold(
    overrides.caseId || 'CASE-2026-017',
    overrides.scope || {
      userIds: ['alice'],
      projectIds: ['PROJ-RAMOT'],
      types: ['invoice'],
      dateRange: { from: '2026-01-01', to: '2026-12-31' },
    },
    overrides.custodians || ['alice'],
    overrides.keywords || ['שוחד', 'bribe'],
    overrides.opts || {
      title: 'Ramot Procurement Investigation',
      titleHe: 'חקירת רכש רמות',
      source: HOLD_SOURCES.STAY_ORDER,
      court: 'בית משפט השלום ת"א',
      issuedBy: 'עו"ד דוד לוי',
    }
  );
}

// ───────────────────────────────────────────────────────────────────────

describe('LegalHoldEnforcer — create / list / status', () => {
  test('1) createHold stores an active hold with full scope', () => {
    const enf = makeEnforcer();
    const hold = seedHold(enf);
    assert.equal(hold.caseId, 'CASE-2026-017');
    assert.equal(hold.status, HOLD_STATUS.ACTIVE);
    assert.equal(hold.source, HOLD_SOURCES.STAY_ORDER);
    assert.deepEqual(hold.custodians, ['alice']);
    // keywords are deduped/merged:
    assert.ok(hold.keywords.includes('שוחד'));
    assert.ok(hold.keywords.includes('bribe'));
    assert.equal(hold.overridesRetention, true);
    assert.equal(hold.titleHe, 'חקירת רכש רמות');
  });

  test('2) createHold refuses duplicate caseId', () => {
    const enf = makeEnforcer();
    seedHold(enf);
    assert.throws(() => seedHold(enf), /already exists/);
  });

  test('3) listHolds filters by activeOnly, source, custodian', () => {
    const enf = makeEnforcer();
    seedHold(enf, { caseId: 'CASE-A' });
    seedHold(enf, {
      caseId: 'CASE-B',
      custodians: ['bob'],
      opts: { source: HOLD_SOURCES.SEARCH_WARRANT, title: 'B' },
    });
    enf.releaseHold('CASE-A', 'investigation closed', 'legal-ops');

    const active = enf.listHolds({ activeOnly: true });
    assert.equal(active.length, 1);
    assert.equal(active[0].caseId, 'CASE-B');

    const warrants = enf.listHolds({ source: HOLD_SOURCES.SEARCH_WARRANT });
    assert.equal(warrants.length, 1);

    const bobHolds = enf.listHolds({ custodian: 'bob' });
    assert.equal(bobHolds.length, 1);
    assert.equal(bobHolds[0].caseId, 'CASE-B');
  });
});

describe('LegalHoldEnforcer — isLocked / scope rules', () => {
  test('4) isLocked returns true for a record inside scope (user+project+type+date+keyword)', () => {
    const enf = makeEnforcer();
    seedHold(enf);
    const locked = enf.isLocked('INV-001', {
      userId: 'alice',
      projectId: 'PROJ-RAMOT',
      type: 'invoice',
      createdAt: '2026-03-15',
      subject: 'תשלום חשוד — שוחד לקבלן',
    });
    assert.equal(locked, true);
  });

  test('5) isLocked returns false when any scope dimension misses', () => {
    const enf = makeEnforcer();
    seedHold(enf);
    // wrong project
    assert.equal(
      enf.isLocked('INV-002', {
        userId: 'alice',
        projectId: 'PROJ-OTHER',
        type: 'invoice',
        createdAt: '2026-03-15',
        subject: 'שוחד',
      }),
      false
    );
    // wrong type
    assert.equal(
      enf.isLocked('INV-003', {
        userId: 'alice',
        projectId: 'PROJ-RAMOT',
        type: 'email',
        createdAt: '2026-03-15',
        subject: 'שוחד',
      }),
      false
    );
    // out-of-range date
    assert.equal(
      enf.isLocked('INV-004', {
        userId: 'alice',
        projectId: 'PROJ-RAMOT',
        type: 'invoice',
        createdAt: '2020-01-01',
        subject: 'שוחד',
      }),
      false
    );
    // missing keyword
    assert.equal(
      enf.isLocked('INV-005', {
        userId: 'alice',
        projectId: 'PROJ-RAMOT',
        type: 'invoice',
        createdAt: '2026-03-15',
        subject: 'routine stationery order',
      }),
      false
    );
  });

  test('6) isLocked honours explicit recordIds (highest precedence)', () => {
    const enf = makeEnforcer();
    enf.createHold(
      'CASE-PIN',
      { recordIds: ['DOC-42'] },
      [],
      [],
      { title: 'Pinned evidence' }
    );
    assert.equal(enf.isLocked('DOC-42', { type: 'anything' }), true);
    assert.equal(enf.isLocked('DOC-43', { type: 'anything' }), false);
  });

  test('7) released holds do NOT lock records any more', () => {
    const enf = makeEnforcer();
    seedHold(enf);
    const ctx = {
      userId: 'alice',
      projectId: 'PROJ-RAMOT',
      type: 'invoice',
      createdAt: '2026-03-15',
      subject: 'bribe ledger entry',
    };
    assert.equal(enf.isLocked('INV-10', ctx), true);
    enf.releaseHold('CASE-2026-017', 'investigation cleared', 'legal-ops');
    assert.equal(enf.isLocked('INV-10', ctx), false);
  });
});

describe('LegalHoldEnforcer — release + never-delete invariant', () => {
  test('8) releaseHold requires justification + approver and never removes the row', () => {
    const enf = makeEnforcer();
    seedHold(enf);

    assert.throws(
      () => enf.releaseHold('CASE-2026-017', '', 'legal-ops'),
      /justification/
    );
    assert.throws(
      () => enf.releaseHold('CASE-2026-017', 'closed', ''),
      /approver/
    );

    const rel = enf.releaseHold('CASE-2026-017', 'closed', 'legal-ops');
    assert.equal(rel.status, HOLD_STATUS.RELEASED);
    assert.equal(rel.releaseJustification, 'closed');
    assert.equal(rel.releasedBy, 'legal-ops');

    // the row is STILL there (never hard-deleted)
    const all = enf.listHolds();
    assert.equal(all.length, 1);
    assert.equal(all[0].caseId, 'CASE-2026-017');
    assert.equal(all[0].status, HOLD_STATUS.RELEASED);

    // double-release forbidden
    assert.throws(
      () => enf.releaseHold('CASE-2026-017', 'again', 'legal-ops'),
      /already released/
    );
  });

  test('9) legal hold overrides retention expiry', () => {
    const enf = makeEnforcer();
    seedHold(enf);
    // even if the record is flagged retentionExpired, hold still applies
    const ctx = {
      userId: 'alice',
      projectId: 'PROJ-RAMOT',
      type: 'invoice',
      createdAt: '2026-03-15',
      subject: 'שוחד',
      retentionExpired: true, // retention says "dispose"
    };
    assert.equal(enf.isLocked('INV-EXP', ctx), true);
    // the matching hold should assert overridesRetention
    const matches = enf.matchingHolds('INV-EXP', ctx);
    assert.equal(matches.length, 1);
    assert.equal(matches[0].overridesRetention, true);
  });
});

describe('LegalHoldEnforcer — custodian notice (bilingual)', () => {
  test('10) custodianNotice produces Hebrew + English letter with stay-order heading', () => {
    const enf = makeEnforcer();
    seedHold(enf);
    const notice = enf.custodianNotice('CASE-2026-017', 'alice');
    assert.deepEqual(notice.languages, ['he', 'en']);
    assert.equal(notice.direction.he, 'rtl');
    assert.equal(notice.direction.en, 'ltr');
    assert.match(notice.hebrew, /צו עיכוב/);
    assert.match(notice.hebrew, /הודעת עיכוב משפטי/);
    assert.match(notice.hebrew, /אל: alice/);
    assert.match(notice.english, /Stay Order/);
    assert.match(notice.english, /To: alice/);
    // combined text includes both
    assert.ok(notice.combined.length > notice.english.length);
    // emitting a notice records an event
    const events = enf.auditLog({ type: EVENT_TYPES.NOTICE_ISSUED });
    assert.equal(events.length, 1);
    assert.equal(events[0].payload.custodianId, 'alice');
  });
});

describe('LegalHoldEnforcer — collection export & manifest', () => {
  test('11) collectionExport returns manifest with per-item + manifest SHA256', () => {
    const enf = makeEnforcer();
    seedHold(enf);
    const records = [
      { id: 'INV-001', type: 'invoice', createdAt: '2026-02-01', amount: 9999 },
      { id: 'INV-002', type: 'invoice', createdAt: '2026-02-15', amount: 12345 },
    ];
    const manifest = enf.collectionExport('CASE-2026-017', records);
    assert.equal(manifest.itemCount, 2);
    assert.equal(manifest.items.length, 2);
    for (const item of manifest.items) {
      assert.match(item.sha256, /^[a-f0-9]{64}$/);
      assert.ok(item.size > 0);
    }
    assert.match(manifest.sha256, /^[a-f0-9]{64}$/);

    // export event logged
    const events = enf.auditLog({ type: EVENT_TYPES.COLLECTION_EXPORTED });
    assert.equal(events.length, 1);
    assert.equal(events[0].payload.itemCount, 2);
    assert.equal(events[0].payload.manifestSha256, manifest.sha256);
  });
});

describe('LegalHoldEnforcer — override alert + audit chain', () => {
  test('12) overrideAlert is blocked=true when a hold applies and recorded in the log', () => {
    const enf = makeEnforcer();
    seedHold(enf);
    const alert = enf.overrideAlert('INV-001', 'mallory', 'delete', {
      userId: 'alice',
      projectId: 'PROJ-RAMOT',
      type: 'invoice',
      createdAt: '2026-03-15',
      subject: 'שוחד evidence',
    });
    assert.equal(alert.blocked, true);
    assert.deepEqual(alert.matchingCaseIds, ['CASE-2026-017']);
    const logged = enf.auditLog({ type: EVENT_TYPES.OVERRIDE_ATTEMPT });
    assert.equal(logged.length, 1);
    assert.equal(logged[0].payload.actor, 'mallory');
  });

  test('13) audit log is append-only with a valid hash chain', () => {
    const enf = makeEnforcer();
    seedHold(enf);
    enf.custodianNotice('CASE-2026-017', 'alice');
    enf.collectionExport('CASE-2026-017', [{ id: 'X', type: 'invoice' }]);
    enf.overrideAlert('INV-Z', 'eve', 'modify', {
      userId: 'alice',
      projectId: 'PROJ-RAMOT',
      type: 'invoice',
      createdAt: '2026-03-15',
      subject: 'שוחד',
    });
    enf.releaseHold('CASE-2026-017', 'done', 'legal-ops');

    const log = enf.auditLog();
    assert.ok(log.length >= 5);
    // sequence numbers are 1..N, monotone
    for (let i = 0; i < log.length; i++) {
      assert.equal(log[i].seq, i + 1);
    }
    // chain verification
    const result = enf.verifyChain();
    assert.equal(result.valid, true);
    assert.equal(result.brokenAt, null);

    // tampering detection: mutate a past event's payload
    log[1].payload.custodianId = 'TAMPERED';
    const tampered = enf.verifyChain();
    assert.equal(tampered.valid, false);
    assert.ok(tampered.brokenAt >= 2);
  });
});

describe('LegalHoldEnforcer — court report + events (loose coupling)', () => {
  test('14) reportForCourt returns bilingual Israeli+English report with chain summary', () => {
    const enf = makeEnforcer();
    seedHold(enf);
    enf.custodianNotice('CASE-2026-017', 'alice');
    enf.collectionExport('CASE-2026-017', [{ id: 'INV-001', type: 'invoice' }]);
    enf.overrideAlert('INV-001', 'mallory', 'delete', {
      userId: 'alice',
      projectId: 'PROJ-RAMOT',
      type: 'invoice',
      createdAt: '2026-03-15',
      subject: 'שוחד',
    });

    const report = enf.reportForCourt('CASE-2026-017');
    assert.deepEqual(report.languages, ['he', 'en']);
    assert.equal(report.direction.he, 'rtl');
    assert.match(report.hebrew, /דו"ח עיכוב משפטי/);
    assert.match(report.hebrew, /בית משפט השלום ת"א/);
    assert.match(report.hebrew, /שרשרת ראיות/);
    assert.match(report.english, /Legal Hold Report/);
    assert.match(report.english, /Chain of custody/);
    assert.equal(report.summary.chainIntegrity, true);
    assert.equal(report.summary.noticesIssued, 1);
    assert.equal(report.summary.collectionExports, 1);
    assert.equal(report.summary.blockedAttempts, 1);
    assert.match(report.sha256, /^[a-f0-9]{64}$/);
  });

  test('15) enforcer emits events for loose coupling with Y-106 / Y-149', () => {
    const enf = makeEnforcer();
    const seen = [];
    enf.on(EVENT_TYPES.HOLD_CREATED, (e) => seen.push(['created', e.payload.caseId]));
    enf.on(EVENT_TYPES.HOLD_RELEASED, (e) =>
      seen.push(['released', e.payload.caseId])
    );
    enf.on('*', () => seen.push(['star']));

    seedHold(enf);
    enf.releaseHold('CASE-2026-017', 'closed', 'legal-ops');

    const created = seen.filter((s) => s[0] === 'created');
    const released = seen.filter((s) => s[0] === 'released');
    const star = seen.filter((s) => s[0] === 'star');
    assert.equal(created.length, 1);
    assert.equal(released.length, 1);
    assert.ok(star.length >= 2);
  });
});
