/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Consent Management — Unit tests
 * ═══════════════════════════════════════════════════════════════════════════
 *  Agent Y-138  |  Techno-Kol Uzi mega-ERP  |  2026-04-11
 *
 *  Run:    node --test test/privacy/consent-mgmt.test.js
 *
 *  Coverage — 22 deterministic test cases exercising every public surface
 *  of ConsentManagement + תיקון 13 conformance checks:
 *
 *     01 recordConsent — click-wrap
 *     02 recordConsent — browse-wrap
 *     03 recordConsent — signed-document
 *     04 recordConsent — verbal-recorded
 *     05 recordConsent — opt-in-email
 *     06 recordConsent — rejects invalid method / basis / purpose
 *     07 withdrawConsent — original record preserved + new WITHDRAW record
 *     08 withdrawConsent — throws when there is no active consent
 *     09 checkConsent — point-in-time (before withdraw = true, after = false)
 *     10 consentHistory — append-only timeline order preserved
 *     11 bulkConsentUpdate — mass opt-out across subjects
 *     12 granularPurposeConsent — per-purpose breakdown (7 keys)
 *     13 minorConsent — age < 16 without parental ref → PENDING_PARENTAL
 *     14 minorConsent — age >= 16 → normal ACTIVE grant
 *     15 minorConsent — age < 16 WITH parental ref → grant activates
 *     16 lawfulBasisCheck — each of the 6 bases validated for some purpose
 *     17 lawfulBasisCheck — consent-only purpose rejects contract basis
 *     18 consentExpiry — stale consent beyond 24 months flagged
 *     19 auditTrail — immutable chain, verifyChain() returns valid
 *     20 auditTrail — tampering is detected (verifyChain invalid)
 *     21 exportSubjectConsents — DSR-ready bilingual packet
 *     22 records are deep-frozen / cannot be mutated in place
 * ═══════════════════════════════════════════════════════════════════════════
 */

'use strict';

const test   = require('node:test');
const assert = require('node:assert/strict');

const {
  ConsentManagement,
  PURPOSES,
  LAWFUL_BASES,
  COLLECTION_METHODS,
  CONSENT_STATUS,
  RECORD_KIND,
  MINOR_AGE_THRESHOLD,
} = require('../../src/privacy/consent-mgmt.js');

// ───────────────────────────────────────────────────────────────────────────
//  Helpers
// ───────────────────────────────────────────────────────────────────────────

function freshCM(overrides = {}) {
  return new ConsentManagement(Object.assign({
    now: overrides.now || (() => new Date('2026-04-11T09:00:00Z')),
  }, overrides));
}

function baseGrant(overrides = {}) {
  return Object.assign({
    subjectId: 'subj-001',
    purpose: PURPOSES.MARKETING,
    lawfulBasis: LAWFUL_BASES.CONSENT,
    scope: ['email', 'phone'],
    version: 'v1.0',
    method: COLLECTION_METHODS.CLICK_WRAP,
    consentText_he: 'אני מסכים לקבל דיוור שיווקי',
    consentText_en: 'I agree to receive marketing communications',
    collectedAt: '2026-01-01T10:00:00Z',
  }, overrides);
}

// ───────────────────────────────────────────────────────────────────────────
//  01 — recordConsent: click-wrap
// ───────────────────────────────────────────────────────────────────────────
test('01 recordConsent — click-wrap creates immutable ACTIVE record', () => {
  const cm = freshCM();
  const rec = cm.recordConsent(baseGrant());
  assert.equal(rec.kind, RECORD_KIND.GRANT);
  assert.equal(rec.method, COLLECTION_METHODS.CLICK_WRAP);
  assert.equal(rec.status, CONSENT_STATUS.ACTIVE);
  assert.ok(rec.payloadHash && rec.payloadHash.length === 64);
  assert.equal(rec.purposeLabels.he, 'שיווק ופרסום');
  assert.equal(rec.methodLabels.en, 'Click-wrap');
  assert.throws(() => { rec.status = 'tampered'; }, /read.?only|Cannot assign/);
});

// ───────────────────────────────────────────────────────────────────────────
//  02 — recordConsent: browse-wrap
// ───────────────────────────────────────────────────────────────────────────
test('02 recordConsent — browse-wrap method accepted', () => {
  const cm = freshCM();
  const rec = cm.recordConsent(baseGrant({
    subjectId: 'subj-002',
    method: COLLECTION_METHODS.BROWSE_WRAP,
    purpose: PURPOSES.ANALYTICS,
  }));
  assert.equal(rec.method, COLLECTION_METHODS.BROWSE_WRAP);
  assert.equal(rec.purpose, PURPOSES.ANALYTICS);
  assert.equal(rec.methodLabels.he, 'הסכמה על-ידי גלישה');
});

// ───────────────────────────────────────────────────────────────────────────
//  03 — recordConsent: signed-document
// ───────────────────────────────────────────────────────────────────────────
test('03 recordConsent — signed-document method accepted', () => {
  const cm = freshCM();
  const rec = cm.recordConsent(baseGrant({
    subjectId: 'subj-003',
    method: COLLECTION_METHODS.SIGNED_DOCUMENT,
    purpose: PURPOSES.THIRD_PARTY_SHARING,
  }));
  assert.equal(rec.method, COLLECTION_METHODS.SIGNED_DOCUMENT);
  assert.equal(rec.purposeLabels.en, 'Third-party sharing');
});

// ───────────────────────────────────────────────────────────────────────────
//  04 — recordConsent: verbal-recorded
// ───────────────────────────────────────────────────────────────────────────
test('04 recordConsent — verbal-recorded method accepted', () => {
  const cm = freshCM();
  const rec = cm.recordConsent(baseGrant({
    subjectId: 'subj-004',
    method: COLLECTION_METHODS.VERBAL_RECORDED,
    purpose: PURPOSES.PERSONALIZATION,
  }));
  assert.equal(rec.method, COLLECTION_METHODS.VERBAL_RECORDED);
  assert.equal(rec.methodLabels.he, 'הקלטת הסכמה בעל-פה');
});

// ───────────────────────────────────────────────────────────────────────────
//  05 — recordConsent: opt-in-email
// ───────────────────────────────────────────────────────────────────────────
test('05 recordConsent — opt-in-email method accepted', () => {
  const cm = freshCM();
  const rec = cm.recordConsent(baseGrant({
    subjectId: 'subj-005',
    method: COLLECTION_METHODS.OPT_IN_EMAIL,
  }));
  assert.equal(rec.method, COLLECTION_METHODS.OPT_IN_EMAIL);
  assert.equal(rec.methodLabels.en, 'Double opt-in email');
});

// ───────────────────────────────────────────────────────────────────────────
//  06 — recordConsent: validation rejects bad inputs
// ───────────────────────────────────────────────────────────────────────────
test('06 recordConsent — rejects invalid method / basis / purpose', () => {
  const cm = freshCM();
  assert.throws(() => cm.recordConsent(baseGrant({ method: 'telepathy' })), /invalid method/);
  assert.throws(() => cm.recordConsent(baseGrant({ lawfulBasis: 'gut-feeling' })), /invalid lawfulBasis/);
  assert.throws(() => cm.recordConsent(baseGrant({ purpose: 'mind-reading' })), /invalid purpose/);
  assert.throws(() => cm.recordConsent(baseGrant({ consentText_he: '' })), /bilingual/);
  assert.throws(() => cm.recordConsent(baseGrant({ subjectId: '' })), /subjectId/);
});

// ───────────────────────────────────────────────────────────────────────────
//  07 — withdrawConsent: original preserved, new WITHDRAW record linked
// ───────────────────────────────────────────────────────────────────────────
test('07 withdrawConsent — original record preserved, new WITHDRAW record links', () => {
  const cm = freshCM();
  const grant = cm.recordConsent(baseGrant());
  const wd = cm.withdrawConsent({
    subjectId: 'subj-001',
    purpose: PURPOSES.MARKETING,
    reason: 'no longer interested',
  });
  assert.equal(wd.kind, RECORD_KIND.WITHDRAW);
  assert.equal(wd.originalRecordId, grant.recordId);
  assert.equal(wd.status, CONSENT_STATUS.WITHDRAWN);

  // The ORIGINAL record must still exist verbatim
  const hist = cm.consentHistory('subj-001');
  assert.equal(hist.length, 2);
  const stillGrant = hist.find((r) => r.recordId === grant.recordId);
  assert.equal(stillGrant.status, CONSENT_STATUS.ACTIVE);
  assert.equal(stillGrant.kind, RECORD_KIND.GRANT);
  assert.equal(stillGrant.payloadHash, grant.payloadHash);
});

// ───────────────────────────────────────────────────────────────────────────
//  08 — withdrawConsent throws when nothing to withdraw
// ───────────────────────────────────────────────────────────────────────────
test('08 withdrawConsent — throws when no active consent exists', () => {
  const cm = freshCM();
  assert.throws(
    () => cm.withdrawConsent({ subjectId: 'ghost', purpose: PURPOSES.MARKETING }),
    /no active consent/,
  );
});

// ───────────────────────────────────────────────────────────────────────────
//  09 — checkConsent: point-in-time
// ───────────────────────────────────────────────────────────────────────────
test('09 checkConsent — point-in-time semantics', () => {
  const cm = freshCM();
  cm.recordConsent(baseGrant({ collectedAt: '2026-01-01T10:00:00Z' }));
  cm.withdrawConsent({
    subjectId: 'subj-001',
    purpose: PURPOSES.MARKETING,
    effectiveAt: '2026-02-15T10:00:00Z',
  });

  const before = cm.checkConsent('subj-001', PURPOSES.MARKETING, '2026-01-10T00:00:00Z');
  assert.equal(before.granted, true, 'before withdrawal → granted');

  const after = cm.checkConsent('subj-001', PURPOSES.MARKETING, '2026-03-01T00:00:00Z');
  assert.equal(after.granted, false, 'after withdrawal → not granted');
  assert.equal(after.reason, 'withdrawn');

  const unknown = cm.checkConsent('nobody', PURPOSES.MARKETING);
  assert.equal(unknown.granted, false);
  assert.equal(unknown.reason, 'no-consent-on-record');
});

// ───────────────────────────────────────────────────────────────────────────
//  10 — consentHistory: append-only order
// ───────────────────────────────────────────────────────────────────────────
test('10 consentHistory — preserves insertion order and is append-only', () => {
  const cm = freshCM();
  cm.recordConsent(baseGrant({ purpose: PURPOSES.MARKETING }));
  cm.recordConsent(baseGrant({ purpose: PURPOSES.ANALYTICS }));
  cm.withdrawConsent({ subjectId: 'subj-001', purpose: PURPOSES.MARKETING });

  const hist = cm.consentHistory('subj-001');
  assert.equal(hist.length, 3);
  assert.equal(hist[0].kind, RECORD_KIND.GRANT);
  assert.equal(hist[0].purpose, PURPOSES.MARKETING);
  assert.equal(hist[1].kind, RECORD_KIND.GRANT);
  assert.equal(hist[1].purpose, PURPOSES.ANALYTICS);
  assert.equal(hist[2].kind, RECORD_KIND.WITHDRAW);
});

// ───────────────────────────────────────────────────────────────────────────
//  11 — bulkConsentUpdate: mass opt-out
// ───────────────────────────────────────────────────────────────────────────
test('11 bulkConsentUpdate — mass opt-out across subjects', () => {
  const cm = freshCM();
  ['a', 'b', 'c'].forEach((id) => {
    cm.recordConsent(baseGrant({ subjectId: id, purpose: PURPOSES.MARKETING }));
    cm.recordConsent(baseGrant({ subjectId: id, purpose: PURPOSES.ANALYTICS }));
  });

  const results = cm.bulkConsentUpdate({
    subjectIds: ['a', 'b', 'c'],
    purposeChanges: [
      { purpose: PURPOSES.MARKETING, action: 'withdraw', reason: 'campaign ended' },
    ],
  });
  assert.equal(results.length, 3);
  assert.ok(results.every((r) => r.ok), 'all withdrawals should succeed');

  const checkA = cm.checkConsent('a', PURPOSES.MARKETING);
  const checkAnalytics = cm.checkConsent('a', PURPOSES.ANALYTICS);
  assert.equal(checkA.granted, false);
  assert.equal(checkAnalytics.granted, true, 'analytics untouched');
});

// ───────────────────────────────────────────────────────────────────────────
//  12 — granularPurposeConsent: 7 purposes
// ───────────────────────────────────────────────────────────────────────────
test('12 granularPurposeConsent — per-purpose breakdown with 7 purposes', () => {
  const cm = freshCM();
  cm.recordConsent(baseGrant({ purpose: PURPOSES.MARKETING }));
  cm.recordConsent(baseGrant({
    purpose: PURPOSES.ESSENTIAL,
    lawfulBasis: LAWFUL_BASES.CONTRACT,
  }));

  const g = cm.granularPurposeConsent('subj-001');
  const keys = Object.keys(g).sort();
  assert.equal(keys.length, 7);
  assert.ok(keys.includes(PURPOSES.MARKETING));
  assert.ok(keys.includes(PURPOSES.ANALYTICS));
  assert.ok(keys.includes(PURPOSES.PERSONALIZATION));
  assert.ok(keys.includes(PURPOSES.ESSENTIAL));
  assert.ok(keys.includes(PURPOSES.THIRD_PARTY_SHARING));
  assert.ok(keys.includes(PURPOSES.PROFILING));
  assert.ok(keys.includes(PURPOSES.AUTOMATED_DECISION));
  assert.equal(g[PURPOSES.MARKETING].granted, true);
  assert.equal(g[PURPOSES.ESSENTIAL].granted, true);
  assert.equal(g[PURPOSES.PROFILING].granted, false);
});

// ───────────────────────────────────────────────────────────────────────────
//  13 — minorConsent: < 16 no parental ref → PENDING_PARENTAL
// ───────────────────────────────────────────────────────────────────────────
test('13 minorConsent — subject under 16 without parental ref blocks consent', () => {
  const cm = freshCM();
  const m = cm.minorConsent({ subjectId: 'teen', age: 14 });
  assert.equal(m.requiresParental, true);
  assert.equal(m.blocked, true);
  assert.equal(m.threshold, MINOR_AGE_THRESHOLD);
  assert.match(m.citation, /תיקון 13/);

  const rec = cm.recordConsent(baseGrant({ subjectId: 'teen', purpose: PURPOSES.MARKETING }));
  assert.equal(rec.status, CONSENT_STATUS.PENDING_PARENTAL);
  assert.equal(rec.minor, true);

  const check = cm.checkConsent('teen', PURPOSES.MARKETING);
  assert.equal(check.granted, false);
  assert.equal(check.reason, 'pending-parental-consent');
});

// ───────────────────────────────────────────────────────────────────────────
//  14 — minorConsent: >= 16 → normal ACTIVE grant
// ───────────────────────────────────────────────────────────────────────────
test('14 minorConsent — age >= 16 produces normal ACTIVE consent', () => {
  const cm = freshCM();
  cm.minorConsent({ subjectId: 'adult', age: 17 });
  const rec = cm.recordConsent(baseGrant({ subjectId: 'adult' }));
  assert.equal(rec.status, CONSENT_STATUS.ACTIVE);
  assert.equal(rec.minor, false);
});

// ───────────────────────────────────────────────────────────────────────────
//  15 — minorConsent: < 16 WITH parental ref → grant activates
// ───────────────────────────────────────────────────────────────────────────
test('15 minorConsent — under 16 WITH parental ref produces ACTIVE consent', () => {
  const cm = freshCM();
  const m = cm.minorConsent({
    subjectId: 'kid',
    age: 12,
    parentalConsentRef: 'parent-signed-doc-#88',
  });
  assert.equal(m.ok, true);
  assert.equal(m.blocked, false);

  const rec = cm.recordConsent(baseGrant({ subjectId: 'kid' }));
  assert.equal(rec.status, CONSENT_STATUS.ACTIVE);
  assert.equal(rec.minor, true);
  assert.equal(rec.parentalConsentRef, 'parent-signed-doc-#88');
});

// ───────────────────────────────────────────────────────────────────────────
//  16 — lawfulBasisCheck: each of the 6 bases
// ───────────────────────────────────────────────────────────────────────────
test('16 lawfulBasisCheck — validates all 6 lawful bases for ESSENTIAL purpose', () => {
  const cm = freshCM();
  // ESSENTIAL accepts every basis → one test per basis
  for (const basis of Object.values(LAWFUL_BASES)) {
    const res = cm.lawfulBasisCheck(PURPOSES.ESSENTIAL, basis);
    assert.equal(res.basis, basis);
    assert.ok(res.labels.he && res.labels.en);
  }
  // Read-only variant (no proposedBasis)
  const info = cm.lawfulBasisCheck(PURPOSES.MARKETING);
  assert.ok(Array.isArray(info.allowed));
  assert.ok(info.allowed.includes(LAWFUL_BASES.CONSENT));
});

// ───────────────────────────────────────────────────────────────────────────
//  17 — lawfulBasisCheck: consent-only purpose rejects contract basis
// ───────────────────────────────────────────────────────────────────────────
test('17 lawfulBasisCheck — marketing rejects contract basis', () => {
  const cm = freshCM();
  assert.throws(
    () => cm.lawfulBasisCheck(PURPOSES.MARKETING, LAWFUL_BASES.CONTRACT),
    /not acceptable/,
  );
  // profiling/automated-decision carve-out: legal-obligation allowed
  const ok = cm.lawfulBasisCheck(PURPOSES.PROFILING, LAWFUL_BASES.LEGAL_OBLIGATION);
  assert.equal(ok.basis, LAWFUL_BASES.LEGAL_OBLIGATION);
});

// ───────────────────────────────────────────────────────────────────────────
//  18 — consentExpiry: stale consent beyond 24 months flagged
// ───────────────────────────────────────────────────────────────────────────
test('18 consentExpiry — 24-month re-consent cycle flags stale grants', () => {
  // "now" clock is 2026-04-11 — grant at 2023-01-01 is ~39 months old.
  const cm = freshCM();
  cm.recordConsent(baseGrant({
    subjectId: 'old',
    purpose: PURPOSES.MARKETING,
    collectedAt: '2023-01-01T00:00:00Z',
  }));
  // Also add an ESSENTIAL grant — it should NOT expire
  cm.recordConsent(baseGrant({
    subjectId: 'old',
    purpose: PURPOSES.ESSENTIAL,
    lawfulBasis: LAWFUL_BASES.CONTRACT,
    collectedAt: '2023-01-01T00:00:00Z',
  }));

  const flagged = cm.consentExpiry(24);
  assert.equal(flagged.length, 1);
  assert.equal(flagged[0].purpose, PURPOSES.MARKETING);
  assert.equal(flagged[0].kind, RECORD_KIND.EXPIRE);

  // check reflects expiry
  const chk = cm.checkConsent('old', PURPOSES.MARKETING);
  assert.equal(chk.granted, false);
  assert.equal(chk.reason, 'expired');

  // Essential still granted
  const ess = cm.checkConsent('old', PURPOSES.ESSENTIAL);
  assert.equal(ess.granted, true);
});

// ───────────────────────────────────────────────────────────────────────────
//  19 — auditTrail: verifyChain returns valid
// ───────────────────────────────────────────────────────────────────────────
test('19 auditTrail — verifyChain returns valid on untouched ledger', () => {
  const cm = freshCM();
  cm.minorConsent({ subjectId: 'kid', age: 15, parentalConsentRef: 'ref-1' });
  cm.recordConsent(baseGrant({ subjectId: 'kid' }));
  cm.withdrawConsent({ subjectId: 'kid', purpose: PURPOSES.MARKETING });

  const trail = cm.auditTrail('kid');
  assert.ok(trail.length >= 3);
  for (const ev of trail) {
    assert.ok(ev.hash && ev.hash.length === 64);
    assert.ok(ev.prevHash && ev.prevHash.length === 64);
  }
  const result = cm.verifyChain();
  assert.equal(result.valid, true);
});

// ───────────────────────────────────────────────────────────────────────────
//  20 — auditTrail: tampering is detected
// ───────────────────────────────────────────────────────────────────────────
test('20 auditTrail — tampering breaks chain verification', () => {
  const cm = freshCM();
  cm.recordConsent(baseGrant());
  cm.recordConsent(baseGrant({ purpose: PURPOSES.ANALYTICS }));
  cm.withdrawConsent({ subjectId: 'subj-001', purpose: PURPOSES.MARKETING });

  // Before tamper → valid
  assert.equal(cm.verifyChain().valid, true);

  // Force-mutate an audit event's hash (the audit array is public via
  // the internal `_audit` field). Even though entries are frozen, we
  // can replace a frozen object with a doctored plain object at the
  // same slot to simulate tampering.
  const doctored = Object.assign({}, cm._audit[1], { hash: 'f'.repeat(64) });
  cm._audit[1] = doctored;

  const result = cm.verifyChain();
  assert.equal(result.valid, false);
  assert.ok(result.brokenAt >= 1);
});

// ───────────────────────────────────────────────────────────────────────────
//  21 — exportSubjectConsents: DSR-ready packet
// ───────────────────────────────────────────────────────────────────────────
test('21 exportSubjectConsents — DSR-ready bilingual packet', () => {
  const cm = freshCM();
  cm.recordConsent(baseGrant());
  cm.recordConsent(baseGrant({ purpose: PURPOSES.ANALYTICS }));
  cm.withdrawConsent({ subjectId: 'subj-001', purpose: PURPOSES.MARKETING });

  const pkt = cm.exportSubjectConsents('subj-001');
  assert.equal(pkt.subjectId, 'subj-001');
  assert.equal(pkt.counts.grants, 2);
  assert.equal(pkt.counts.withdrawals, 1);
  assert.equal(pkt.counts.total, 3);
  assert.ok(pkt.titleLabels.he.includes('ייצוא הסכמות'));
  assert.ok(pkt.titleLabels.en.includes('Consent export'));
  assert.ok(pkt.citations.some((c) => /תיקון 13/.test(c)));
  assert.equal(Object.keys(pkt.granular).length, 7);
  assert.throws(() => { pkt.counts.total = 999; }, /read.?only|Cannot assign/);
});

// ───────────────────────────────────────────────────────────────────────────
//  22 — immutability: records cannot be mutated in place
// ───────────────────────────────────────────────────────────────────────────
test('22 records are deep-frozen and cannot be mutated', () => {
  const cm = freshCM();
  const rec = cm.recordConsent(baseGrant());
  assert.ok(Object.isFrozen(rec));
  assert.ok(Object.isFrozen(rec.purposeLabels));
  assert.ok(Object.isFrozen(rec.scope));
  assert.throws(() => { rec.scope.push('evil'); }, /read.?only|Cannot add|object is not extensible/);
  // Re-read history — still intact
  const hist = cm.consentHistory('subj-001');
  assert.equal(hist[0].scope.length, 2);
});
