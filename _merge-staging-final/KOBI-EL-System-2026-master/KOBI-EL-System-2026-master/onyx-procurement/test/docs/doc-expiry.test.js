/**
 * Unit tests for DocExpiry — document expiry alert engine
 * Agent Y-110 — written 2026-04-11
 *
 * Run: node --test test/docs/doc-expiry.test.js
 *
 * Coverage (>=18 tests):
 *   01. registerDocument happy path (all fields, bilingual labels)
 *   02. registerDocument rejects unknown docType
 *   03. registerDocument rejects expiryDate < issueDate
 *   04. registerDocument rejects duplicate docId
 *   05. listExpiring buckets: expired / critical / urgent / soon
 *   06. listExpiring respects window days
 *   07. alertExpiring default ladder 90/60/30/7/1 cascade
 *   08. alertExpiring custom ladder
 *   09. alertExpiring emits post-expiry alerts
 *   10. renewDocument creates new version, keeps prior version
 *   11. renewDocument refuses to shrink the expiry date
 *   12. renewDocument on unknown docId throws
 *   13. markExpired('archive') flips status, preserves versions
 *   14. markExpired('block') flips status
 *   15. markExpired unknown action throws
 *   16. bulkImport with mixed good/bad rows reports per-row results
 *   17. reportByDocType rollup: total/expired/expiring/valid
 *   18. history returns full lifecycle including renewals & events
 *   19. setAutoRenewPolicy stored + emits policy event; runAutoRenew triggers
 *   20. checkExpiredCritical returns only blocking+expired
 *   21. generateReminderEmail bilingual (he + en)
 *   22. every enum entry has he + en labels
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DocExpiry,
  DOC_TYPES,
  DOC_STATUS,
  EXPIRY_BUCKETS,
  EXPIRY_ACTIONS,
  EVENT_KINDS,
  DEFAULT_LEAD_DAYS,
} = require('../../src/docs/doc-expiry.js');

/* ─────────────────────────────────────────────────────────────────────────
 * Deterministic clock fixture — frozen at 2026-04-11T08:00:00Z, +1s per call
 * ───────────────────────────────────────────────────────────────────────── */
const BASE = Date.parse('2026-04-11T08:00:00.000Z');

function makeEngine(opts) {
  let t = (opts && opts.start) || BASE;
  return new DocExpiry({
    clock: () => {
      const iso = new Date(t).toISOString();
      t += 1000; // advance 1s per call so event ordering is stable
      return iso;
    },
  });
}

function isoOffsetDays(n) {
  return new Date(BASE + n * 86400000).toISOString();
}

function sampleContract(overrides) {
  return Object.assign(
    {
      docType: 'contract',
      title_he: 'חוזה אספקת פלדה',
      title_en: 'Steel supply contract',
      issueDate:  isoOffsetDays(-365),
      expiryDate: isoOffsetDays(60),
      owner: 'legal@tko',
    },
    overrides || {}
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * 01. registerDocument happy path
 * ───────────────────────────────────────────────────────────────────────── */
test('01. registerDocument creates v1 with bilingual labels', () => {
  const e = makeEngine();
  const r = e.registerDocument(sampleContract());

  assert.match(r.docId, /^DOC-[A-F0-9]{12}$/);
  assert.equal(r.docType, 'contract');
  assert.equal(r.docTypeLabel.he, 'חוזה');
  assert.equal(r.docTypeLabel.en, 'Contract');
  assert.equal(r.currentVersion, 1);
  assert.equal(r.versionsCount, 1);
  assert.equal(r.status.id, 'valid');
  assert.equal(r.status.he, 'בתוקף');
  assert.equal(r.owner, 'legal@tko');
});

/* ─────────────────────────────────────────────────────────────────────────
 * 02. unknown docType rejected
 * ───────────────────────────────────────────────────────────────────────── */
test('02. registerDocument rejects unknown docType', () => {
  const e = makeEngine();
  assert.throws(
    () => e.registerDocument(sampleContract({ docType: 'bogus' })),
    /unknown docType/
  );
});

/* ─────────────────────────────────────────────────────────────────────────
 * 03. expiry before issue rejected
 * ───────────────────────────────────────────────────────────────────────── */
test('03. registerDocument rejects expiryDate < issueDate', () => {
  const e = makeEngine();
  assert.throws(
    () => e.registerDocument(sampleContract({
      issueDate: isoOffsetDays(10),
      expiryDate: isoOffsetDays(5),
    })),
    /expiryDate must be on or after/
  );
});

/* ─────────────────────────────────────────────────────────────────────────
 * 04. duplicate docId rejected
 * ───────────────────────────────────────────────────────────────────────── */
test('04. registerDocument rejects duplicate docId (use renewDocument)', () => {
  const e = makeEngine();
  const r = e.registerDocument(sampleContract({ docId: 'DOC-FIXED-001' }));
  assert.equal(r.docId, 'DOC-FIXED-001');
  assert.throws(
    () => e.registerDocument(sampleContract({ docId: 'DOC-FIXED-001' })),
    /already registered/
  );
});

/* ─────────────────────────────────────────────────────────────────────────
 * 05. listExpiring buckets are correctly filled
 * ───────────────────────────────────────────────────────────────────────── */
test('05. listExpiring buckets: expired / critical / urgent / soon', () => {
  const e = makeEngine();
  // expired: 3 days ago
  e.registerDocument(sampleContract({
    title_he: 'פג',  title_en: 'Expired',  expiryDate: isoOffsetDays(-3),
  }));
  // critical: 2 days out
  e.registerDocument(sampleContract({
    title_he: 'קרי', title_en: 'Critical', expiryDate: isoOffsetDays(2),
  }));
  // urgent: 15 days out
  e.registerDocument(sampleContract({
    title_he: 'דחו', title_en: 'Urgent',   expiryDate: isoOffsetDays(15),
  }));
  // soon: 60 days out
  e.registerDocument(sampleContract({
    title_he: 'בקר', title_en: 'Soon',     expiryDate: isoOffsetDays(60),
  }));
  // beyond window: 200 days out — excluded
  e.registerDocument(sampleContract({
    title_he: 'רחו', title_en: 'Far',      expiryDate: isoOffsetDays(200),
  }));

  const res = e.listExpiring({ days: 90, now: new Date(BASE) });
  assert.equal(res.buckets.expired.length,  1);
  assert.equal(res.buckets.critical.length, 1);
  assert.equal(res.buckets.urgent.length,   1);
  assert.equal(res.buckets.soon.length,     1);
  assert.equal(res.total, 4);
  // Bilingual labels surfaced on the response
  assert.equal(res.labels.expired.he,  EXPIRY_BUCKETS.expired.he);
  assert.equal(res.labels.critical.en, EXPIRY_BUCKETS.critical.en);
});

/* ─────────────────────────────────────────────────────────────────────────
 * 06. listExpiring window filters out far-future docs
 * ───────────────────────────────────────────────────────────────────────── */
test('06. listExpiring respects the days window', () => {
  const e = makeEngine();
  e.registerDocument(sampleContract({ expiryDate: isoOffsetDays(20)  }));
  e.registerDocument(sampleContract({ expiryDate: isoOffsetDays(100) }));
  const narrow = e.listExpiring({ days: 30, now: new Date(BASE) });
  assert.equal(narrow.total, 1);
  const wide = e.listExpiring({ days: 120, now: new Date(BASE) });
  assert.equal(wide.total, 2);
});

/* ─────────────────────────────────────────────────────────────────────────
 * 07. alertExpiring default ladder
 * ───────────────────────────────────────────────────────────────────────── */
test('07. alertExpiring default 90/60/30/7/1 cascade', () => {
  const e = makeEngine();
  // Should match T-90 (exactly 85 days < 90)
  e.registerDocument(sampleContract({ expiryDate: isoOffsetDays(85) }));
  // Should match T-60
  e.registerDocument(sampleContract({ expiryDate: isoOffsetDays(55) }));
  // Should match T-30
  e.registerDocument(sampleContract({ expiryDate: isoOffsetDays(25) }));
  // Should match T-7
  e.registerDocument(sampleContract({ expiryDate: isoOffsetDays(5) }));
  // Should match T-1
  e.registerDocument(sampleContract({ expiryDate: isoOffsetDays(0) }));
  // Outside cascade: 200 days out
  e.registerDocument(sampleContract({ expiryDate: isoOffsetDays(200) }));

  const res = e.alertExpiring({ now: new Date(BASE) });
  assert.equal(res.count, 5);
  assert.deepEqual(res.leadDays, [90, 60, 30, 7, 1]);
  const tags = res.alerts.map((a) => a.leadTag);
  assert.ok(tags.includes('T-90'));
  assert.ok(tags.includes('T-60'));
  assert.ok(tags.includes('T-30'));
  assert.ok(tags.includes('T-7'));
  assert.ok(tags.includes('T-1'));
});

/* ─────────────────────────────────────────────────────────────────────────
 * 08. custom lead day ladder
 * ───────────────────────────────────────────────────────────────────────── */
test('08. alertExpiring honours caller-supplied leadDays', () => {
  const e = makeEngine();
  e.registerDocument(sampleContract({ expiryDate: isoOffsetDays(14) }));
  const res = e.alertExpiring({ leadDays: [30, 14, 3], now: new Date(BASE) });
  assert.equal(res.count, 1);
  assert.equal(res.alerts[0].leadTag, 'T-14');
  assert.deepEqual(res.leadDays, [30, 14, 3]);
});

/* ─────────────────────────────────────────────────────────────────────────
 * 09. post-expiry alerts
 * ───────────────────────────────────────────────────────────────────────── */
test('09. alertExpiring emits post-expiry alerts for past-due docs', () => {
  const e = makeEngine();
  e.registerDocument(sampleContract({ expiryDate: isoOffsetDays(-4) }));
  const res = e.alertExpiring({ now: new Date(BASE) });
  assert.equal(res.count, 1);
  assert.equal(res.alerts[0].leadTag, 'post-expiry');
  assert.equal(res.alerts[0].daysUntilExpiry, -4);
  assert.match(res.alerts[0].messages.he, /פג תוקף/);
  assert.match(res.alerts[0].messages.en, /expired/);
});

/* ─────────────────────────────────────────────────────────────────────────
 * 10. renewDocument appends a new version
 * ───────────────────────────────────────────────────────────────────────── */
test('10. renewDocument creates v2 and keeps v1 immutable', () => {
  const e = makeEngine();
  const r = e.registerDocument(sampleContract({ expiryDate: isoOffsetDays(30) }));
  const renewed = e.renewDocument({
    docId: r.docId,
    newIssueDate:  isoOffsetDays(30),
    newExpiryDate: isoOffsetDays(395),
    renewedBy: 'ronen.legal',
    referenceNo: 'RN-2026-001',
  });
  assert.equal(renewed.currentVersion, 2);
  assert.equal(renewed.versionsCount, 2);
  const h = e.history(r.docId);
  assert.equal(h.versions.length, 2);
  assert.equal(h.versions[0].version, 1);
  assert.equal(h.versions[1].version, 2);
  assert.equal(h.versions[1].parentVersion, 1);
  assert.equal(h.versions[1].renewedBy, 'ronen.legal');
  assert.equal(h.versions[1].referenceNo, 'RN-2026-001');
  // Original version untouched
  assert.equal(h.versions[0].expiryDate, isoOffsetDays(30));
});

/* ─────────────────────────────────────────────────────────────────────────
 * 11. renewDocument refuses to shrink coverage
 * ───────────────────────────────────────────────────────────────────────── */
test('11. renewDocument refuses to shrink the expiry date', () => {
  const e = makeEngine();
  const r = e.registerDocument(sampleContract({ expiryDate: isoOffsetDays(100) }));
  assert.throws(
    () => e.renewDocument({
      docId: r.docId,
      newIssueDate:  isoOffsetDays(5),
      newExpiryDate: isoOffsetDays(80),
      renewedBy: 'bad.actor',
    }),
    /must extend coverage/
  );
});

/* ─────────────────────────────────────────────────────────────────────────
 * 12. renewDocument on unknown docId
 * ───────────────────────────────────────────────────────────────────────── */
test('12. renewDocument on unknown docId throws', () => {
  const e = makeEngine();
  assert.throws(
    () => e.renewDocument({
      docId: 'DOC-DOES-NOT-EXIST',
      newExpiryDate: isoOffsetDays(180),
      renewedBy: 'x',
    }),
    /unknown docId/
  );
});

/* ─────────────────────────────────────────────────────────────────────────
 * 13. markExpired('archive') preserves versions
 * ───────────────────────────────────────────────────────────────────────── */
test('13. markExpired archive — never deletes versions', () => {
  const e = makeEngine();
  const r = e.registerDocument(sampleContract({ expiryDate: isoOffsetDays(-1) }));
  const after = e.markExpired(r.docId, 'archive');
  assert.equal(after.status.id, 'archived');
  const h = e.history(r.docId);
  assert.equal(h.versions.length, 1, 'versions preserved');
  assert.ok(h.events.some((ev) => ev.kind === 'expired'));
});

/* ─────────────────────────────────────────────────────────────────────────
 * 14. markExpired('block')
 * ───────────────────────────────────────────────────────────────────────── */
test('14. markExpired block flips status to blocked', () => {
  const e = makeEngine();
  const r = e.registerDocument(sampleContract({
    docType: 'insurance',
    title_he: 'ביטוח חובה', title_en: 'Mandatory insurance',
    expiryDate: isoOffsetDays(-1),
  }));
  const after = e.markExpired(r.docId, 'block');
  assert.equal(after.status.id, 'blocked');
  assert.equal(after.status.he, DOC_STATUS.blocked.he);
});

/* ─────────────────────────────────────────────────────────────────────────
 * 15. markExpired unknown action throws
 * ───────────────────────────────────────────────────────────────────────── */
test('15. markExpired unknown action throws', () => {
  const e = makeEngine();
  const r = e.registerDocument(sampleContract({ expiryDate: isoOffsetDays(-1) }));
  assert.throws(() => e.markExpired(r.docId, 'shred'), /unknown expiry action/);
});

/* ─────────────────────────────────────────────────────────────────────────
 * 16. bulkImport mixed outcomes
 * ───────────────────────────────────────────────────────────────────────── */
test('16. bulkImport reports per-row success/failure', () => {
  const e = makeEngine();
  const batch = [
    sampleContract({ title_he: 'א', title_en: 'A', expiryDate: isoOffsetDays(30) }),
    sampleContract({ title_he: 'ב', title_en: 'B', expiryDate: isoOffsetDays(60) }),
    // Malformed — unknown docType
    sampleContract({ docType: 'bogus' }),
    // Malformed — missing title_en
    { docType: 'contract', title_he: 'ג', issueDate: isoOffsetDays(-10), expiryDate: isoOffsetDays(10), owner: 'x' },
  ];
  const res = e.bulkImport(batch);
  assert.equal(res.total, 4);
  assert.equal(res.ok, 2);
  assert.equal(res.fail, 2);
  assert.equal(res.results[0].ok, true);
  assert.equal(res.results[2].ok, false);
  assert.match(res.results[2].error, /unknown docType/);
  assert.match(res.results[3].error, /title_en/);
});

/* ─────────────────────────────────────────────────────────────────────────
 * 17. reportByDocType rollup
 * ───────────────────────────────────────────────────────────────────────── */
test('17. reportByDocType rolls up totals per doc type', () => {
  const e = makeEngine();
  e.registerDocument(sampleContract({ docType: 'license', title_he: 'רישיון 1', title_en: 'L1', expiryDate: isoOffsetDays(-5) }));
  e.registerDocument(sampleContract({ docType: 'license', title_he: 'רישיון 2', title_en: 'L2', expiryDate: isoOffsetDays(40) }));
  e.registerDocument(sampleContract({ docType: 'license', title_he: 'רישיון 3', title_en: 'L3', expiryDate: isoOffsetDays(400) }));
  e.registerDocument(sampleContract({ docType: 'contract', title_he: 'חוזה', title_en: 'C', expiryDate: isoOffsetDays(40) }));

  const r = e.reportByDocType('license');
  assert.equal(r.total, 3);
  assert.equal(r.expired, 1);
  assert.equal(r.expiringSoon, 1);
  assert.equal(r.valid, 1);
  assert.equal(r.docTypeLabel.he, 'רישיון עסק');
  assert.equal(r.items.length, 3);
});

/* ─────────────────────────────────────────────────────────────────────────
 * 18. history — full lifecycle
 * ───────────────────────────────────────────────────────────────────────── */
test('18. history returns versions + events, immutable to callers', () => {
  const e = makeEngine();
  const r = e.registerDocument(sampleContract({ expiryDate: isoOffsetDays(30) }));
  e.renewDocument({
    docId: r.docId,
    newIssueDate:  isoOffsetDays(30),
    newExpiryDate: isoOffsetDays(400),
    renewedBy: 'owner@tko',
  });
  e.alertExpiring({ now: new Date(BASE + 500 * 86400000) });

  const h = e.history(r.docId);
  assert.equal(h.versions.length, 2);
  const kinds = h.events.map((ev) => ev.kind);
  assert.ok(kinds.includes('registered'));
  assert.ok(kinds.includes('renewed'));

  // Mutating the returned copy must not poison the store.
  h.events.push({ kind: 'malicious' });
  const h2 = e.history(r.docId);
  assert.ok(!h2.events.some((ev) => ev.kind === 'malicious'));
});

/* ─────────────────────────────────────────────────────────────────────────
 * 19. setAutoRenewPolicy + runAutoRenew
 * ───────────────────────────────────────────────────────────────────────── */
test('19. auto-renew policy triggers a new version when lead is reached', () => {
  const e = makeEngine();
  e.registerDocument(sampleContract({
    docType: 'insurance',
    title_he: 'ביטוח צמ"ה', title_en: 'Heavy equipment insurance',
    expiryDate: isoOffsetDays(20),
  }));
  const policy = e.setAutoRenewPolicy('insurance', {
    enabled: true,
    leadDays: 30,
    autoRenewBy: 'renewals-bot@tko',
    extendByDays: 365,
  });
  assert.equal(policy.enabled, true);
  assert.equal(policy.autoRenewBy, 'renewals-bot@tko');

  const run = e.runAutoRenew({ now: new Date(BASE) });
  assert.equal(run.count, 1);
  assert.equal(run.triggered[0].currentVersion, 2);

  // History captures the auto-renew event
  const h = e.history(run.triggered[0].docId);
  const autoEvents = h.events.filter((ev) => ev.kind === 'auto_renew_trigger');
  assert.equal(autoEvents.length, 1);
  const policyEvents = h.events.filter((ev) => ev.kind === 'auto_renew_policy');
  assert.ok(policyEvents.length >= 1);
});

/* ─────────────────────────────────────────────────────────────────────────
 * 20. checkExpiredCritical — blocking-only filter
 * ───────────────────────────────────────────────────────────────────────── */
test('20. checkExpiredCritical returns only expired blocking docs', () => {
  const e = makeEngine();
  // Blocking + expired — MUST surface
  e.registerDocument(sampleContract({
    docType: 'license', title_he: 'רישיון עסק', title_en: 'BL',
    expiryDate: isoOffsetDays(-10),
  }));
  e.registerDocument(sampleContract({
    docType: 'insurance', title_he: 'ביטוח חובה', title_en: 'Ins',
    expiryDate: isoOffsetDays(-2),
  }));
  // Non-blocking + expired — MUST NOT surface
  e.registerDocument(sampleContract({
    docType: 'contract', title_he: 'חוזה ישן', title_en: 'Old',
    expiryDate: isoOffsetDays(-30),
  }));
  // Blocking + valid — MUST NOT surface
  e.registerDocument(sampleContract({
    docType: 'lease', title_he: 'שכירות', title_en: 'Lease',
    expiryDate: isoOffsetDays(200),
  }));

  const hit = e.checkExpiredCritical(new Date(BASE));
  assert.equal(hit.count, 2);
  const types = hit.hits.map((h) => h.docType).sort();
  assert.deepEqual(types, ['insurance', 'license']);
  assert.equal(hit.hits[0].severity, 'BLOCKING');
});

/* ─────────────────────────────────────────────────────────────────────────
 * 21. generateReminderEmail bilingual
 * ───────────────────────────────────────────────────────────────────────── */
test('21. generateReminderEmail produces bilingual payload', () => {
  const e = makeEngine();
  const r = e.registerDocument(sampleContract({
    docType: 'certification',
    title_he: 'תעודת ריתוך',
    title_en: 'Welding certification',
    expiryDate: isoOffsetDays(5),
  }));

  const he = e.generateReminderEmail(r.docId, 'he');
  assert.equal(he.language, 'he');
  assert.equal(he.direction, 'rtl');
  assert.match(he.subject, /תזכורת קריטית/);
  assert.match(he.body, /תעודת ריתוך/);
  // Counterpart always present regardless of requested language.
  assert.equal(he.he.direction, 'rtl');
  assert.equal(he.en.direction, 'ltr');
  assert.match(he.en.subject, /Welding certification/);

  const en = e.generateReminderEmail(r.docId, 'en');
  assert.equal(en.language, 'en');
  assert.equal(en.direction, 'ltr');
  assert.match(en.subject, /CRITICAL reminder/);
});

/* ─────────────────────────────────────────────────────────────────────────
 * 22. bilingual enum sanity
 * ───────────────────────────────────────────────────────────────────────── */
test('22. every enum entry has he + en labels', () => {
  for (const v of Object.values(DOC_TYPES))      { assert.ok(v.he); assert.ok(v.en); }
  for (const v of Object.values(DOC_STATUS))     { assert.ok(v.he); assert.ok(v.en); }
  for (const v of Object.values(EXPIRY_BUCKETS)) { assert.ok(v.he); assert.ok(v.en); }
  for (const v of Object.values(EXPIRY_ACTIONS)) { assert.ok(v.he); assert.ok(v.en); }
  for (const v of Object.values(EVENT_KINDS))    { assert.ok(v.he); assert.ok(v.en); }
  assert.deepEqual(DEFAULT_LEAD_DAYS.slice(), [90, 60, 30, 7, 1]);
});

/* ─────────────────────────────────────────────────────────────────────────
 * 23. all 11 doc types accepted
 * ───────────────────────────────────────────────────────────────────────── */
test('23. registerDocument accepts all 11 documented doc types', () => {
  const e = makeEngine();
  const types = [
    'contract', 'license', 'insurance', 'certification', 'lease',
    'permit', 'warranty', 'nda', 'gdpr-dpa', 'employment-agreement',
    'vehicle-registration',
  ];
  for (const t of types) {
    const r = e.registerDocument(sampleContract({
      docType: t,
      title_he: 'כותרת ' + t,
      title_en: 'Title ' + t,
    }));
    assert.equal(r.docType, t);
    assert.ok(DOC_TYPES[t].he);
    assert.ok(DOC_TYPES[t].en);
  }
  assert.equal(e.listAll().length, types.length);
});
