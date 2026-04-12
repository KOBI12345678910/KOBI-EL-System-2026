/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  TOS Tracker — Unit tests
 * ═══════════════════════════════════════════════════════════════════════════
 *  Agent Y-141  |  Techno-Kol Uzi mega-ERP  |  2026-04-11
 *
 *  Run:    node --test test/privacy/tos-tracker.test.js
 *
 *  Coverage — 22 deterministic test cases exercising every public surface
 *  of TOSTracker + consumer-law conformance checks:
 *
 *     01 publishVersion — creates immutable, frozen record
 *     02 publishVersion — rejects duplicate versionId (append-only)
 *     03 publishVersion — requires bilingual content_he + content_en
 *     04 recordAcceptance — click method on current version
 *     05 recordAcceptance — signed method recorded with strongest evidentiary weight
 *     06 recordAcceptance — browse-wrap REJECTED for material version
 *     07 recordAcceptance — invalid method rejected
 *     08 recordAcceptance — unknown versionId rejected
 *     09 checkAcceptance — status=NEVER when user has no record
 *     10 checkAcceptance — status=CURRENT after accepting latest
 *     11 checkAcceptance — status=STALE after publishing a new version
 *     12 bulkRequireReacceptance — flips pre-existing acceptances to REREQUIRED
 *     13 bulkRequireReacceptance — requires written reason (חוק החוזים האחידים)
 *     14 lastAcceptedVersion — returns most recent acceptance versionId
 *     15 listNonAccepters — isolates users who haven't accepted the current
 *     16 diffVersions — detects added/removed lines in both languages
 *     17 generateAcceptanceUI — self-contained HTML with RTL dir + bilingual labels
 *     18 generateAcceptanceUI — HTML is XSS-safe (escapes injected change log)
 *     19 enforceGating — blocks gated action when user has stale acceptance
 *     20 enforceGating — allows non-gated action regardless of TOS status
 *     21 exportForDSR — bilingual DSR packet with full history
 *     22 verifyChain — SHA-256 audit chain integrity (and tamper detection)
 * ═══════════════════════════════════════════════════════════════════════════
 */

'use strict';

const test   = require('node:test');
const assert = require('node:assert/strict');

const {
  TOSTracker,
  ACCEPTANCE_METHODS,
  ACCEPTANCE_STATUS,
  RECORD_KIND,
  DEFAULT_GATED_ACTIONS,
} = require('../../src/privacy/tos-tracker.js');

// ───────────────────────────────────────────────────────────────────────────
//  Helpers
// ───────────────────────────────────────────────────────────────────────────

function freshTracker(overrides = {}) {
  return new TOSTracker(Object.assign({
    now: overrides.now || (() => new Date('2026-04-11T09:00:00Z')),
  }, overrides));
}

function baseV1() {
  return {
    versionId: 'v1.0',
    effectiveDate: '2026-01-01T00:00:00Z',
    content_he: 'תנאי שימוש — גרסה ראשונה.\nסעיף 1: כללי.\nסעיף 2: אחריות.',
    content_en: 'Terms of Service — first version.\nClause 1: General.\nClause 2: Liability.',
    changeLog: [
      { he: 'גרסה ראשונית', en: 'Initial version' },
    ],
    requiresReacceptance: false,
  };
}

function baseV2() {
  return {
    versionId: 'v2.0',
    effectiveDate: '2026-02-01T00:00:00Z',
    content_he: 'תנאי שימוש — גרסה שנייה.\nסעיף 1: כללי.\nסעיף 2: אחריות מורחבת.\nסעיף 3: פרטיות.',
    content_en: 'Terms of Service — second version.\nClause 1: General.\nClause 2: Extended liability.\nClause 3: Privacy.',
    changeLog: [
      { he: 'הוסף סעיף פרטיות', en: 'Privacy clause added' },
    ],
    requiresReacceptance: true,
  };
}

// ───────────────────────────────────────────────────────────────────────────
//  01 — publishVersion creates immutable record
// ───────────────────────────────────────────────────────────────────────────
test('01 publishVersion — creates immutable frozen record', () => {
  const t = freshTracker();
  const v = t.publishVersion(baseV1());

  assert.equal(v.versionId, 'v1.0');
  assert.equal(v.kind, RECORD_KIND.PUBLISH);
  assert.ok(v.payloadHash, 'payloadHash set');
  assert.ok(v.contentHash_he, 'Hebrew content hashed');
  assert.ok(v.contentHash_en, 'English content hashed');
  assert.equal(Object.isFrozen(v), true, 'record is frozen');

  // Attempt to mutate — should throw in strict mode
  assert.throws(() => { v.versionId = 'HACKED'; }, /Cannot assign to read only property|Cannot add property/);
  assert.equal(v.versionId, 'v1.0', 'version id unchanged after attempted mutation');
});

// ───────────────────────────────────────────────────────────────────────────
//  02 — publishVersion rejects duplicate id (append-only)
// ───────────────────────────────────────────────────────────────────────────
test('02 publishVersion — rejects duplicate versionId (append-only)', () => {
  const t = freshTracker();
  t.publishVersion(baseV1());
  assert.throws(
    () => t.publishVersion(baseV1()),
    /already exists — append-only/,
  );
});

// ───────────────────────────────────────────────────────────────────────────
//  03 — publishVersion requires bilingual content
// ───────────────────────────────────────────────────────────────────────────
test('03 publishVersion — requires bilingual content_he + content_en', () => {
  const t = freshTracker();
  assert.throws(
    () => t.publishVersion(Object.assign(baseV1(), { content_en: '' })),
    /bilingual content_he \+ content_en required/,
  );
  assert.throws(
    () => t.publishVersion(Object.assign(baseV1(), { content_he: '' })),
    /bilingual/,
  );
});

// ───────────────────────────────────────────────────────────────────────────
//  04 — recordAcceptance: click method
// ───────────────────────────────────────────────────────────────────────────
test('04 recordAcceptance — click method creates ACCEPT record', () => {
  const t = freshTracker();
  t.publishVersion(baseV1());
  const r = t.recordAcceptance({
    userId: 'user-001',
    versionId: 'v1.0',
    method: ACCEPTANCE_METHODS.CLICK,
    ip: '192.168.1.1',
    userAgent: 'Mozilla/5.0',
    timestamp: '2026-04-11T09:00:00Z',
  });
  assert.equal(r.kind, RECORD_KIND.ACCEPT);
  assert.equal(r.userId, 'user-001');
  assert.equal(r.method, 'click');
  assert.ok(r.userHash, 'userId hashed');
  assert.ok(r.ipHash, 'ip hashed for privacy');
  assert.equal(r.ip, '192.168.1.1', 'ip plaintext retained for audit');
  assert.ok(r.methodLabels.he.length > 0, 'Hebrew label present');
  assert.ok(r.methodLabels.en.length > 0, 'English label present');
});

// ───────────────────────────────────────────────────────────────────────────
//  05 — recordAcceptance: signed (strongest evidentiary weight)
// ───────────────────────────────────────────────────────────────────────────
test('05 recordAcceptance — signed method permitted for material version', () => {
  const t = freshTracker();
  t.publishVersion(Object.assign(baseV1(), { requiresReacceptance: true }));
  const r = t.recordAcceptance({
    userId: 'user-002',
    versionId: 'v1.0',
    method: ACCEPTANCE_METHODS.SIGNED,
    timestamp: '2026-04-11T09:00:00Z',
  });
  assert.equal(r.method, 'signed');
  assert.equal(r.methodLabels.en, 'Electronic signature');
});

// ───────────────────────────────────────────────────────────────────────────
//  06 — browse-wrap rejected for material versions
// ───────────────────────────────────────────────────────────────────────────
test('06 recordAcceptance — browse-wrap REJECTED for material version', () => {
  const t = freshTracker();
  t.publishVersion(Object.assign(baseV1(), { requiresReacceptance: true }));
  assert.throws(
    () => t.recordAcceptance({
      userId: 'user-003',
      versionId: 'v1.0',
      method: ACCEPTANCE_METHODS.BROWSE,
    }),
    /browse-wrap rejected for material version/,
  );
});

// ───────────────────────────────────────────────────────────────────────────
//  07 — invalid method rejected
// ───────────────────────────────────────────────────────────────────────────
test('07 recordAcceptance — invalid method rejected', () => {
  const t = freshTracker();
  t.publishVersion(baseV1());
  assert.throws(
    () => t.recordAcceptance({
      userId: 'user-004',
      versionId: 'v1.0',
      method: 'telepathy',
    }),
    /invalid method/,
  );
});

// ───────────────────────────────────────────────────────────────────────────
//  08 — unknown versionId rejected
// ───────────────────────────────────────────────────────────────────────────
test('08 recordAcceptance — unknown versionId rejected', () => {
  const t = freshTracker();
  t.publishVersion(baseV1());
  assert.throws(
    () => t.recordAcceptance({
      userId: 'user-005',
      versionId: 'v999',
      method: ACCEPTANCE_METHODS.CLICK,
    }),
    /unknown versionId/,
  );
});

// ───────────────────────────────────────────────────────────────────────────
//  09 — checkAcceptance: NEVER
// ───────────────────────────────────────────────────────────────────────────
test('09 checkAcceptance — status=NEVER when user has no record', () => {
  const t = freshTracker();
  t.publishVersion(baseV1());
  // Give the tracker a known user so there's a baseline
  t.recordAcceptance({
    userId: 'other-user',
    versionId: 'v1.0',
    method: ACCEPTANCE_METHODS.CLICK,
  });
  const check = t.checkAcceptance('ghost-user');
  assert.equal(check.status, ACCEPTANCE_STATUS.NEVER);
  assert.equal(check.reason, 'user-never-accepted');
  assert.equal(check.acceptedVersionId, null);
});

// ───────────────────────────────────────────────────────────────────────────
//  10 — checkAcceptance: CURRENT
// ───────────────────────────────────────────────────────────────────────────
test('10 checkAcceptance — status=CURRENT after accepting latest', () => {
  const t = freshTracker();
  t.publishVersion(baseV1());
  t.recordAcceptance({
    userId: 'user-006',
    versionId: 'v1.0',
    method: ACCEPTANCE_METHODS.CLICK,
    timestamp: '2026-04-11T09:00:00Z',
  });
  const check = t.checkAcceptance('user-006');
  assert.equal(check.status, ACCEPTANCE_STATUS.CURRENT);
  assert.equal(check.current, 'v1.0');
  assert.equal(check.acceptedVersionId, 'v1.0');
});

// ───────────────────────────────────────────────────────────────────────────
//  11 — checkAcceptance: STALE
// ───────────────────────────────────────────────────────────────────────────
test('11 checkAcceptance — status=STALE after publishing newer version', () => {
  const t = freshTracker();
  t.publishVersion(baseV1());
  t.recordAcceptance({
    userId: 'user-007',
    versionId: 'v1.0',
    method: ACCEPTANCE_METHODS.CLICK,
    timestamp: '2026-04-11T09:00:00Z',
  });
  t.publishVersion(baseV2());
  const check = t.checkAcceptance('user-007');
  assert.equal(check.status, ACCEPTANCE_STATUS.STALE);
  assert.equal(check.current, 'v2.0');
  assert.equal(check.acceptedVersionId, 'v1.0');
});

// ───────────────────────────────────────────────────────────────────────────
//  12 — bulkRequireReacceptance: flips users to REREQUIRED
// ───────────────────────────────────────────────────────────────────────────
test('12 bulkRequireReacceptance — flips pre-existing acceptances to REREQUIRED', () => {
  const t = freshTracker();
  t.publishVersion(baseV1());
  t.recordAcceptance({
    userId: 'user-008',
    versionId: 'v1.0',
    method: ACCEPTANCE_METHODS.CLICK,
    timestamp: '2026-02-15T09:00:00Z',
  });
  t.recordAcceptance({
    userId: 'user-009',
    versionId: 'v1.0',
    method: ACCEPTANCE_METHODS.CLICK,
    timestamp: '2026-04-20T09:00:00Z',
  });

  const result = t.bulkRequireReacceptance('v1.0', {
    effectiveDate: '2026-04-01T00:00:00Z',
    reason: 'Regulatory update: Amendment 13 clarifications',
  });

  assert.ok(result.affectedUsers.includes('user-008'), 'early acceptance flagged');
  assert.ok(!result.affectedUsers.includes('user-009'), 'late acceptance unaffected');
  assert.equal(result.affectedCount, 1);

  const check8 = t.checkAcceptance('user-008');
  assert.equal(check8.status, ACCEPTANCE_STATUS.REREQUIRED);
  const check9 = t.checkAcceptance('user-009');
  assert.equal(check9.status, ACCEPTANCE_STATUS.CURRENT);
});

// ───────────────────────────────────────────────────────────────────────────
//  13 — bulkRequireReacceptance requires written reason
// ───────────────────────────────────────────────────────────────────────────
test('13 bulkRequireReacceptance — requires written reason (חוק החוזים האחידים)', () => {
  const t = freshTracker();
  t.publishVersion(baseV1());
  assert.throws(
    () => t.bulkRequireReacceptance('v1.0', { effectiveDate: '2026-04-01' }),
    /written reason is required/,
  );
  assert.throws(
    () => t.bulkRequireReacceptance('unknown-id', {
      effectiveDate: '2026-04-01',
      reason: 'whatever',
    }),
    /unknown versionId/,
  );
});

// ───────────────────────────────────────────────────────────────────────────
//  14 — lastAcceptedVersion returns most recent id
// ───────────────────────────────────────────────────────────────────────────
test('14 lastAcceptedVersion — returns most recent acceptance versionId', () => {
  const t = freshTracker();
  t.publishVersion(baseV1());
  t.publishVersion(baseV2());
  // NOTE v2 is material; signed method required
  t.recordAcceptance({
    userId: 'user-010',
    versionId: 'v1.0',
    method: ACCEPTANCE_METHODS.CLICK,
    timestamp: '2026-02-01T09:00:00Z',
  });
  assert.equal(t.lastAcceptedVersion('user-010'), 'v1.0');

  t.recordAcceptance({
    userId: 'user-010',
    versionId: 'v2.0',
    method: ACCEPTANCE_METHODS.SIGNED,
    timestamp: '2026-03-15T09:00:00Z',
  });
  assert.equal(t.lastAcceptedVersion('user-010'), 'v2.0');
  assert.equal(t.lastAcceptedVersion('nobody'), null);
});

// ───────────────────────────────────────────────────────────────────────────
//  15 — listNonAccepters isolates users who haven't accepted current
// ───────────────────────────────────────────────────────────────────────────
test('15 listNonAccepters — isolates users who have not accepted the current version', () => {
  const t = freshTracker();
  t.publishVersion(baseV1());
  t.publishVersion(baseV2());

  t.recordAcceptance({
    userId: 'alice',
    versionId: 'v1.0',
    method: ACCEPTANCE_METHODS.CLICK,
    timestamp: '2026-01-15T09:00:00Z',
  });
  t.recordAcceptance({
    userId: 'bob',
    versionId: 'v2.0',
    method: ACCEPTANCE_METHODS.SIGNED,
    timestamp: '2026-02-05T09:00:00Z',
  });
  t.recordAcceptance({
    userId: 'carol',
    versionId: 'v1.0',
    method: ACCEPTANCE_METHODS.CLICK,
    timestamp: '2026-01-20T09:00:00Z',
  });

  const laggards = t.listNonAccepters('v2.0');
  assert.deepEqual(laggards.sort(), ['alice', 'carol']);
});

// ───────────────────────────────────────────────────────────────────────────
//  16 — diffVersions detects added/removed lines in both languages
// ───────────────────────────────────────────────────────────────────────────
test('16 diffVersions — detects added/removed lines in both languages', () => {
  const t = freshTracker();
  t.publishVersion(baseV1());
  t.publishVersion(baseV2());

  const diff = t.diffVersions('v1.0', 'v2.0');
  assert.equal(diff.from, 'v1.0');
  assert.equal(diff.to, 'v2.0');
  assert.equal(diff.identical, false);
  assert.ok(diff.he.added > 0, 'Hebrew additions detected');
  assert.ok(diff.en.added > 0, 'English additions detected');
  // added "סעיף 3: פרטיות" -> at least one add op
  const hasHePrivacyClause = diff.he.ops.some(
    (o) => o.op === 'add' && /פרטיות/.test(o.text),
  );
  assert.equal(hasHePrivacyClause, true, 'Hebrew privacy clause flagged as added');

  assert.throws(
    () => t.diffVersions('v1.0', 'v999'),
    /unknown versionId/,
  );
});

// ───────────────────────────────────────────────────────────────────────────
//  17 — generateAcceptanceUI: self-contained HTML with RTL + bilingual
// ───────────────────────────────────────────────────────────────────────────
test('17 generateAcceptanceUI — self-contained HTML with RTL dir + bilingual labels', () => {
  const t = freshTracker();
  t.publishVersion(baseV1());
  t.publishVersion(baseV2());

  const html = t.generateAcceptanceUI({
    versionId: 'v2.0',
    lang: 'both',
    showDiff: true,
  });

  assert.match(html, /<!DOCTYPE html>/);
  // Hebrew RTL somewhere in the document
  assert.match(html, /dir="rtl"/);
  // Both language buttons present
  assert.match(html, /אני מסכים/);
  assert.match(html, /I accept and agree/);
  // Version id shown
  assert.match(html, /v2\.0/);
  // Self-contained: inline <style>
  assert.match(html, /<style>/);
  // Legal footer citation
  assert.match(html, /חוק הגנת הצרכן|Consumer Protection Law/);
  // Diff section rendered since showDiff=true
  assert.match(html, /diff-block/);
  // Change log item appears
  assert.match(html, /פרטיות/);

  assert.throws(
    () => t.generateAcceptanceUI({ versionId: 'v999' }),
    /unknown versionId/,
  );
  assert.throws(
    () => t.generateAcceptanceUI({ versionId: 'v2.0', lang: 'martian' }),
    /invalid lang/,
  );
});

// ───────────────────────────────────────────────────────────────────────────
//  18 — generateAcceptanceUI is XSS-safe
// ───────────────────────────────────────────────────────────────────────────
test('18 generateAcceptanceUI — HTML is XSS-safe (escapes injected change log)', () => {
  const t = freshTracker();
  t.publishVersion({
    versionId: 'v-xss',
    effectiveDate: '2026-04-11',
    content_he: 'תוכן עם <script>alert(1)</script>',
    content_en: 'Content with <script>alert(1)</script>',
    changeLog: [
      { he: '<img src=x onerror=alert(2)>', en: '"><iframe/onload=alert(3)>' },
    ],
  });
  const html = t.generateAcceptanceUI({ versionId: 'v-xss', lang: 'both' });

  // Dangerous substrings MUST NOT appear verbatim
  assert.equal(html.includes('<script>alert(1)</script>'), false);
  assert.equal(html.includes('<img src=x onerror=alert(2)>'), false);
  assert.equal(html.includes('<iframe/onload=alert(3)>'), false);

  // Escaped forms MUST appear
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;&#47;script&gt;/);
  assert.match(html, /&lt;img src=x onerror=alert\(2\)&gt;/);
});

// ───────────────────────────────────────────────────────────────────────────
//  19 — enforceGating blocks gated action when user is stale
// ───────────────────────────────────────────────────────────────────────────
test('19 enforceGating — blocks gated action when user has stale acceptance', () => {
  const t = freshTracker();
  t.publishVersion(baseV1());
  t.recordAcceptance({
    userId: 'user-011',
    versionId: 'v1.0',
    method: ACCEPTANCE_METHODS.CLICK,
    timestamp: '2026-04-11T09:00:00Z',
  });

  // While still on v1 — checkout is allowed
  const g1 = t.enforceGating({ userId: 'user-011', action: 'checkout' });
  assert.equal(g1.allowed, true);
  assert.equal(g1.reason, 'tos-accepted');

  // Publish a new material version — user becomes STALE
  t.publishVersion(baseV2());
  const g2 = t.enforceGating({ userId: 'user-011', action: 'checkout' });
  assert.equal(g2.allowed, false);
  assert.equal(g2.status, ACCEPTANCE_STATUS.STALE);
  assert.equal(g2.currentRequired, 'v2.0');
  assert.ok(g2.labels.he.length > 0, 'Hebrew explanation present');
  assert.ok(g2.labels.en.length > 0, 'English explanation present');
  assert.ok(g2.citation.includes('החוזים האחידים'), 'cites Standard Contracts Law');

  assert.throws(() => t.enforceGating({ action: 'x' }), /userId required/);
  assert.throws(() => t.enforceGating({ userId: 'a' }), /action required/);
});

// ───────────────────────────────────────────────────────────────────────────
//  20 — enforceGating allows non-gated action regardless of TOS status
// ───────────────────────────────────────────────────────────────────────────
test('20 enforceGating — non-gated action allowed regardless of TOS status', () => {
  const t = freshTracker();
  t.publishVersion(baseV1());
  // ghost user — never accepted anything
  const g = t.enforceGating({ userId: 'ghost', action: 'read-public-blog' });
  assert.equal(g.allowed, true);
  assert.equal(g.reason, 'action-not-gated');

  // registerGatedAction flips it
  t.registerGatedAction('read-public-blog');
  const g2 = t.enforceGating({ userId: 'ghost', action: 'read-public-blog' });
  assert.equal(g2.allowed, false);
  assert.equal(g2.status, ACCEPTANCE_STATUS.NEVER);
  assert.ok(DEFAULT_GATED_ACTIONS.includes('checkout'), 'defaults include checkout');
});

// ───────────────────────────────────────────────────────────────────────────
//  21 — exportForDSR: bilingual DSR packet with full history
// ───────────────────────────────────────────────────────────────────────────
test('21 exportForDSR — bilingual DSR packet with full history', () => {
  const t = freshTracker();
  t.publishVersion(baseV1());
  t.publishVersion(baseV2());

  t.recordAcceptance({
    userId: 'user-012',
    versionId: 'v1.0',
    method: ACCEPTANCE_METHODS.CLICK,
    ip: '10.0.0.1',
    userAgent: 'Firefox/123',
    timestamp: '2026-01-15T09:00:00Z',
  });
  t.recordAcceptance({
    userId: 'user-012',
    versionId: 'v2.0',
    method: ACCEPTANCE_METHODS.SIGNED,
    ip: '10.0.0.1',
    userAgent: 'Firefox/124',
    timestamp: '2026-02-15T09:00:00Z',
  });

  const pkt = t.exportForDSR('user-012');
  assert.equal(pkt.subjectId, 'user-012');
  assert.ok(pkt.subjectHash);
  assert.ok(pkt.titleLabels.he.length > 0);
  assert.ok(pkt.titleLabels.en.length > 0);
  assert.equal(pkt.counts.total, 2);
  assert.equal(pkt.counts.uniqueVersions, 2);
  assert.equal(pkt.acceptances.length, 2);
  assert.equal(pkt.currentRequired.versionId, 'v2.0');
  assert.equal(pkt.status.status, ACCEPTANCE_STATUS.CURRENT);
  // IP should NOT appear plaintext in the DSR packet — only ipHash
  const json = JSON.stringify(pkt);
  assert.equal(json.includes('10.0.0.1'), false, 'IP not leaked in DSR export');
  assert.match(json, /"ipHash":"[a-f0-9]{64}"/);
  assert.equal(Object.isFrozen(pkt), true, 'DSR packet is frozen');

  assert.throws(() => t.exportForDSR(), /userId required/);
});

// ───────────────────────────────────────────────────────────────────────────
//  22 — verifyChain: SHA-256 audit chain integrity + tamper detection
// ───────────────────────────────────────────────────────────────────────────
test('22 verifyChain — SHA-256 audit chain integrity + tamper detection', () => {
  const t = freshTracker();
  t.publishVersion(baseV1());
  t.recordAcceptance({
    userId: 'user-013',
    versionId: 'v1.0',
    method: ACCEPTANCE_METHODS.CLICK,
  });
  t.publishVersion(baseV2());
  t.bulkRequireReacceptance('v2.0', {
    effectiveDate: '2026-04-01',
    reason: 'Material privacy clause update',
  });

  const result = t.verifyChain();
  assert.equal(result.valid, true);
  assert.equal(result.brokenAt, -1);

  // Tamper: replace a mid-chain audit event — use a fresh tracker so we
  // don't corrupt earlier tests. verifyChain() should detect the break.
  const tamper = freshTracker();
  tamper.publishVersion(baseV1());
  tamper.recordAcceptance({
    userId: 'tamper-user',
    versionId: 'v1.0',
    method: ACCEPTANCE_METHODS.CLICK,
  });
  tamper.publishVersion(baseV2());

  // Replace audit[1] with a forged event (has to bypass frozen-array)
  // Simulate an attacker who swaps out the array element entirely.
  const audit = tamper._audit;
  audit[1] = Object.freeze({
    seq: 2,
    at: new Date().toISOString(),
    event: 'record_acceptance',
    recordId: 'FORGED',
    payloadHash: 'deadbeef'.repeat(8),
    prevHash: audit[1].prevHash,
    hash: 'cafebabe'.repeat(8),
  });
  const after = tamper.verifyChain();
  assert.equal(after.valid, false);
  assert.equal(after.brokenAt, 1);
});
