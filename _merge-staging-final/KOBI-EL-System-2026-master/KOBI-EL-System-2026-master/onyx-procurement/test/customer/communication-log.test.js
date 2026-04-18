/**
 * Unified Customer Communication Log — Unit Tests
 * ────────────────────────────────────────────────
 * Agent Y-096 — Techno-Kol Uzi mega-ERP 2026 / onyx-procurement
 *
 * Run with:   node --test test/customer/communication-log.test.js
 * Requires:   Node >= 18 (built-in `node:test` runner).
 *
 * Zero external deps. Covers the full public surface of CommunicationLog:
 *   - recording all 6 channels
 *   - append-only enforcement (no mutation, no delete)
 *   - timeline ordering & filters (date/channel/owner/direction)
 *   - countByChannel
 *   - responseTime math
 *   - lastTouch / silenceAlerts
 *   - search / taggedInteractions
 *   - attachDocument
 *   - sentimentTrend
 *   - loginAction audit
 *   - deduplicateThread (email threading)
 *   - bilingual labels / glossary
 *   - invalid input errors
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const {
  CommunicationLog,
  CHANNELS,
  DIRECTIONS,
  SENTIMENTS,
  CHANNEL_LABELS_HE,
  CHANNEL_LABELS_EN,
  DIRECTION_LABELS_HE,
  SENTIMENT_LABELS_HE,
  GLOSSARY_HE,
  __internal__,
} = require(
  path.resolve(__dirname, '..', '..', 'src', 'customer', 'communication-log.js')
);

/* ─── time fixtures ─────────────────────────────────────────────────── */
// Anchor everything to the current date (per immutable Y-096 context).
const REF = new Date('2026-04-11T09:00:00Z').getTime();
const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

function seed(log) {
  // Returns ids keyed by short label.
  const ids = {};
  ids.e1 = log.recordInteraction({
    customerId: 'C001',
    channel: 'email',
    direction: 'inbound',
    subject: 'בקשה להצעת מחיר לצביעת מבנה',
    content: 'שלום, מעוניינים בהצעת מחיר לצביעת מבנה משרדים',
    contactId: 'K001',
    ownerId: 'U-sales-01',
    timestamp: REF - 5 * DAY,
    tags: ['quote-request', 'urgent'],
    sentiment: 'neutral',
  });
  ids.e2 = log.recordInteraction({
    customerId: 'C001',
    channel: 'email',
    direction: 'outbound',
    subject: 'RE: בקשה להצעת מחיר לצביעת מבנה',
    content: 'שלום, מצורפת הצעת מחיר מס 2026-0412',
    contactId: 'K001',
    ownerId: 'U-sales-01',
    timestamp: REF - 5 * DAY + 2 * HOUR,
    tags: ['quote-sent'],
    sentiment: 'positive',
  });
  ids.s1 = log.recordInteraction({
    customerId: 'C001',
    channel: 'sms',
    direction: 'outbound',
    subject: 'תזכורת פגישה',
    content: 'תזכורת: פגישה מחר בשעה 10:00',
    ownerId: 'U-sales-01',
    timestamp: REF - 4 * DAY,
    tags: ['reminder'],
  });
  ids.c1 = log.recordInteraction({
    customerId: 'C001',
    channel: 'call',
    direction: 'inbound',
    subject: 'שיחת בירור סטטוס',
    content: 'הלקוח שאל על מועד תחילת העבודה',
    ownerId: 'U-pm-02',
    timestamp: REF - 3 * DAY,
    sentiment: 'neutral',
  });
  ids.c2 = log.recordInteraction({
    customerId: 'C001',
    channel: 'call',
    direction: 'outbound',
    subject: 'עדכון מועד',
    content: 'חזרנו ללקוח עם מועד מדויק',
    ownerId: 'U-pm-02',
    timestamp: REF - 3 * DAY + 30 * 60 * 1000,
    sentiment: 'positive',
  });
  ids.ip1 = log.recordInteraction({
    customerId: 'C001',
    channel: 'in-person',
    direction: 'outbound',
    subject: 'פגישה באתר',
    content: 'פגישת סקר באתר הלקוח — תל אביב',
    ownerId: 'U-pm-02',
    timestamp: REF - 2 * DAY,
    sentiment: 'positive',
    tags: ['site-visit'],
  });
  ids.ch1 = log.recordInteraction({
    customerId: 'C001',
    channel: 'chat',
    direction: 'inbound',
    subject: 'שאלה דחופה',
    content: 'האם אפשר להקדים את ההתקנה?',
    ownerId: 'U-sales-01',
    timestamp: REF - 1 * DAY,
    sentiment: 'negative',
    tags: ['urgent'],
  });
  ids.w1 = log.recordInteraction({
    customerId: 'C001',
    channel: 'whatsapp',
    direction: 'outbound',
    subject: 'אישור הגעה',
    content: 'בדרך אליכם עכשיו',
    ownerId: 'U-sales-01',
    timestamp: REF - 6 * HOUR,
  });
  return ids;
}

/* ─── 1. Channel catalog present ───────────────────────────────────── */
test('exports 6 channels in canonical order', () => {
  assert.deepEqual(CHANNELS, [
    'email',
    'sms',
    'call',
    'in-person',
    'chat',
    'whatsapp',
  ]);
});

test('exports Hebrew + English labels for every channel', () => {
  for (const ch of CHANNELS) {
    assert.ok(CHANNEL_LABELS_HE[ch], `HE label missing for ${ch}`);
    assert.ok(CHANNEL_LABELS_EN[ch], `EN label missing for ${ch}`);
  }
  assert.equal(CHANNEL_LABELS_HE.email, 'דוא"ל');
  assert.equal(CHANNEL_LABELS_HE.whatsapp, 'ווטסאפ');
});

test('direction + sentiment enums are closed', () => {
  assert.deepEqual(DIRECTIONS, ['inbound', 'outbound']);
  assert.deepEqual(SENTIMENTS, ['positive', 'neutral', 'negative']);
  assert.equal(DIRECTION_LABELS_HE.inbound, 'נכנס');
  assert.equal(SENTIMENT_LABELS_HE.negative, 'שלילי');
});

/* ─── 2. Record all 6 channels ─────────────────────────────────────── */
test('recordInteraction — accepts all 6 channels', () => {
  const log = new CommunicationLog();
  for (const ch of CHANNELS) {
    const id = log.recordInteraction({
      customerId: 'C002',
      channel: ch,
      direction: 'inbound',
      subject: 'test ' + ch,
      content: 'body',
      timestamp: REF,
    });
    assert.match(id, /^itx_[0-9a-f]{16}$/);
  }
  assert.equal(log.size(), CHANNELS.length);
});

test('recordInteraction — rejects unknown channel', () => {
  const log = new CommunicationLog();
  assert.throws(
    () =>
      log.recordInteraction({
        customerId: 'C002',
        channel: 'fax',
        direction: 'inbound',
      }),
    /invalid channel/
  );
});

test('recordInteraction — rejects unknown direction', () => {
  const log = new CommunicationLog();
  assert.throws(
    () =>
      log.recordInteraction({
        customerId: 'C002',
        channel: 'email',
        direction: 'sideways',
      }),
    /invalid direction/
  );
});

test('recordInteraction — missing customerId throws', () => {
  const log = new CommunicationLog();
  assert.throws(
    () => log.recordInteraction({ channel: 'email', direction: 'inbound' }),
    /customerId required/
  );
});

/* ─── 3. Append-only enforcement ───────────────────────────────────── */
test('append-only — recorded rows are frozen', () => {
  const log = new CommunicationLog();
  log.recordInteraction({
    customerId: 'C003',
    channel: 'email',
    direction: 'inbound',
    subject: 'original',
    content: 'body',
    timestamp: REF,
  });
  const rows = log.exportAll();
  assert.equal(rows.length, 1);

  // exportAll returns defensive copies — mutating them must not affect
  // the internal ledger.
  rows[0].subject = 'hacked';
  rows[0].tags.push('bad');
  assert.equal(log.exportAll()[0].subject, 'original');
  assert.equal(log.exportAll()[0].tags.length, 0);
});

test('append-only — size only ever grows', () => {
  const log = new CommunicationLog();
  assert.equal(log.size(), 0);
  log.recordInteraction({
    customerId: 'C004',
    channel: 'sms',
    direction: 'outbound',
    timestamp: REF,
  });
  assert.equal(log.size(), 1);
  log.recordInteraction({
    customerId: 'C004',
    channel: 'sms',
    direction: 'outbound',
    timestamp: REF + 1000,
  });
  assert.equal(log.size(), 2);
  // No public delete/clear/mutate method exists:
  assert.equal(typeof log.deleteInteraction, 'undefined');
  assert.equal(typeof log.clear, 'undefined');
  assert.equal(typeof log.updateInteraction, 'undefined');
});

/* ─── 4. Timeline ordering + filters ───────────────────────────────── */
test('getTimeline — returns in chronological order', () => {
  const log = new CommunicationLog({ now: () => REF });
  seed(log);
  const tl = log.getTimeline('C001');
  assert.equal(tl.length, 8);
  for (let i = 1; i < tl.length; i++) {
    assert.ok(
      tl[i].timestamp >= tl[i - 1].timestamp,
      'timeline is not sorted asc'
    );
  }
});

test('getTimeline — filters by channel', () => {
  const log = new CommunicationLog({ now: () => REF });
  seed(log);
  const emails = log.getTimeline('C001', { channels: ['email'] });
  assert.equal(emails.length, 2);
  for (const row of emails) assert.equal(row.channel, 'email');
});

test('getTimeline — filters by owner + direction', () => {
  const log = new CommunicationLog({ now: () => REF });
  seed(log);
  const out = log.getTimeline('C001', {
    owners: ['U-pm-02'],
    directions: ['outbound'],
  });
  assert.ok(out.length >= 2);
  for (const row of out) {
    assert.equal(row.ownerId, 'U-pm-02');
    assert.equal(row.direction, 'outbound');
  }
});

test('getTimeline — filters by dateRange', () => {
  const log = new CommunicationLog({ now: () => REF });
  seed(log);
  const recent = log.getTimeline('C001', {
    dateRange: { from: REF - 2 * DAY, to: REF },
  });
  for (const r of recent) {
    assert.ok(r.timestamp >= REF - 2 * DAY);
    assert.ok(r.timestamp <= REF);
  }
  assert.ok(recent.length >= 1);
  assert.ok(recent.length < 8);
});

/* ─── 5. countByChannel ────────────────────────────────────────────── */
test('countByChannel — returns counts per channel', () => {
  const log = new CommunicationLog({ now: () => REF });
  seed(log);
  const counts = log.countByChannel('C001', 'all');
  assert.equal(counts.email, 2);
  assert.equal(counts.sms, 1);
  assert.equal(counts.call, 2);
  assert.equal(counts['in-person'], 1);
  assert.equal(counts.chat, 1);
  assert.equal(counts.whatsapp, 1);
});

test('countByChannel — honours period days window', () => {
  const log = new CommunicationLog({ now: () => REF });
  seed(log);
  const last2 = log.countByChannel('C001', { days: 2 });
  // Only chat (1 day ago) + whatsapp (6 hours ago) + in-person (2 days ago)
  const total = Object.values(last2).reduce((a, b) => a + b, 0);
  assert.ok(total >= 2 && total <= 3, 'expected 2-3 events in last 2d, got ' + total);
});

/* ─── 6. Response time ─────────────────────────────────────────────── */
test('responseTime — averages inbound->outbound gaps', () => {
  const log = new CommunicationLog({ now: () => REF });
  seed(log);
  const rt = log.responseTime({ customerId: 'C001', maxGapHours: 48 });
  // Inbounds: e1 (reply 2h later), c1 (reply 30min later), ch1 (no reply
  //           within 48h because whatsapp w1 is outbound ~18h later).
  assert.equal(rt.sample, 3);
  assert.equal(rt.responded, 3);
  assert.equal(rt.unanswered, 0);
  assert.ok(rt.avgHours > 0 && rt.avgHours < 48);
});

test('responseTime — counts unanswered when gap exceeds maxGapHours', () => {
  const log = new CommunicationLog({ now: () => REF });
  log.recordInteraction({
    customerId: 'C010',
    channel: 'email',
    direction: 'inbound',
    subject: 'help',
    timestamp: REF - 10 * DAY,
  });
  // Reply is 25h later — with a 24h cutoff it is UNanswered.
  log.recordInteraction({
    customerId: 'C010',
    channel: 'email',
    direction: 'outbound',
    subject: 're: help',
    timestamp: REF - 10 * DAY + 25 * HOUR,
  });
  const rt = log.responseTime({ customerId: 'C010', maxGapHours: 24 });
  assert.equal(rt.unanswered, 1);
  assert.equal(rt.responded, 0);
  assert.equal(rt.avgMs, null);
});

/* ─── 7. lastTouch / silence ───────────────────────────────────────── */
test('lastTouch — returns most recent + days-ago', () => {
  const log = new CommunicationLog({ now: () => REF });
  seed(log);
  const lt = log.lastTouch('C001');
  assert.ok(lt);
  assert.equal(lt.daysAgo, 0); // whatsapp 6h ago → 0 days ago (floor)
  assert.equal(lt.interaction.channel, 'whatsapp');
});

test('silenceAlerts — surfaces long-silent customers', () => {
  const log = new CommunicationLog({ now: () => REF });
  log.recordInteraction({
    customerId: 'C-silent',
    channel: 'email',
    direction: 'outbound',
    timestamp: REF - 120 * DAY,
  });
  log.recordInteraction({
    customerId: 'C-fresh',
    channel: 'email',
    direction: 'outbound',
    timestamp: REF - 10 * DAY,
  });
  const alerts = log.silenceAlerts(90);
  const ids = alerts.map((a) => a.customerId);
  assert.ok(ids.includes('C-silent'));
  assert.ok(!ids.includes('C-fresh'));
  assert.ok(alerts[0].daysSilent >= 90);
});

/* ─── 8. Search ────────────────────────────────────────────────────── */
test('search — case-insensitive, Hebrew + English', () => {
  const log = new CommunicationLog({ now: () => REF });
  seed(log);
  const hits = log.search('צביעת');
  assert.ok(hits.length >= 2);
  for (const h of hits) {
    assert.ok(
      /צביעת/.test(h.subject) || /צביעת/.test(h.content),
      'hit missing search term'
    );
  }
});

test('search — narrows by channel + customerId', () => {
  const log = new CommunicationLog({ now: () => REF });
  seed(log);
  const hits = log.search('הצעת', { channel: 'email', customerId: 'C001' });
  assert.ok(hits.length >= 1);
  for (const h of hits) assert.equal(h.channel, 'email');
});

test('search — empty query returns nothing', () => {
  const log = new CommunicationLog({ now: () => REF });
  seed(log);
  assert.deepEqual(log.search(''), []);
});

/* ─── 9. Tagged interactions ───────────────────────────────────────── */
test('taggedInteractions — retrieves all rows with a given tag', () => {
  const log = new CommunicationLog({ now: () => REF });
  seed(log);
  const urgent = log.taggedInteractions('urgent');
  assert.equal(urgent.length, 2); // e1 + ch1
  const subjects = urgent.map((u) => u.subject);
  assert.ok(subjects.some((s) => /בקשה להצעת מחיר/.test(s)));
  assert.ok(subjects.some((s) => /שאלה דחופה/.test(s)));
});

/* ─── 10. Attach document ──────────────────────────────────────────── */
test('attachDocument — stores docRef without mutating the interaction', () => {
  const log = new CommunicationLog({ now: () => REF });
  const id = log.recordInteraction({
    customerId: 'C005',
    channel: 'email',
    direction: 'outbound',
    subject: 'חוזה',
    content: 'מצ"ב טיוטה',
    timestamp: REF,
  });
  const r = log.attachDocument({ interactionId: id, docId: 'DOC-2026-001' });
  assert.equal(r.interactionId, id);
  assert.deepEqual(r.docRefs, ['DOC-2026-001']);
  // Original row is untouched:
  const original = log.exportAll().find((x) => x.id === id);
  assert.deepEqual(original.docRefs, []);
  // But getTimeline merges in the doc refs at read time:
  const tl = log.getTimeline('C005');
  assert.deepEqual(tl[0].docRefs, ['DOC-2026-001']);
});

test('attachDocument — rejects unknown interactionId', () => {
  const log = new CommunicationLog();
  assert.throws(
    () => log.attachDocument({ interactionId: 'itx_zzz', docId: 'DOC1' }),
    /unknown interactionId/
  );
});

/* ─── 11. Sentiment trend ──────────────────────────────────────────── */
test('sentimentTrend — returns scored time-series + rolling avg', () => {
  const log = new CommunicationLog({ now: () => REF });
  seed(log);
  const trend = log.sentimentTrend('C001', 'all');
  assert.ok(trend.points.length >= 4);
  assert.ok(trend.rollingAvg != null);
  // Seed has 3 positive, 2 neutral, 1 negative among scored rows → avg > 0
  assert.ok(trend.rollingAvg > 0);
});

/* ─── 12. Owner audit ──────────────────────────────────────────────── */
test('loginAction — counts interactions per owner in period', () => {
  const log = new CommunicationLog({ now: () => REF });
  seed(log);
  const a = log.loginAction('U-sales-01', 'all');
  assert.equal(a.ownerId, 'U-sales-01');
  assert.equal(a.count, 5); // e1 + e2 + s1 + ch1 + w1
  assert.equal(a.byDirection.inbound, 2);
  assert.equal(a.byDirection.outbound, 3);
  assert.equal(a.byChannel.email, 2);
  assert.equal(a.byChannel.sms, 1);
  assert.equal(a.byChannel.chat, 1);
  assert.equal(a.byChannel.whatsapp, 1);
});

/* ─── 13. Email thread dedup ───────────────────────────────────────── */
test('deduplicateThread — groups RE:/FW:/תגובה: into one email thread', () => {
  const log = new CommunicationLog({ now: () => REF });
  const base = REF - 30 * DAY;
  const interactions = [
    {
      id: 'x1',
      channel: 'email',
      subject: 'הצעת מחיר לפרויקט',
      timestamp: base,
    },
    {
      id: 'x2',
      channel: 'email',
      subject: 'RE: הצעת מחיר לפרויקט',
      timestamp: base + 1 * DAY,
    },
    {
      id: 'x3',
      channel: 'email',
      subject: 'Re: RE: הצעת מחיר לפרויקט',
      timestamp: base + 3 * DAY,
    },
    {
      id: 'x4',
      channel: 'email',
      subject: 'Fwd: תגובה: הצעת מחיר לפרויקט',
      timestamp: base + 5 * DAY,
    },
    {
      id: 'x5',
      channel: 'email',
      subject: 'פרויקט חדש אחר',
      timestamp: base + 6 * DAY,
    },
  ];
  const threads = log.deduplicateThread(interactions);
  // Two threads — the 4 replies about the quote + the 1 new-topic email.
  assert.equal(threads.length, 2);
  const main = threads.find((t) => t.count === 4);
  assert.ok(main);
  assert.equal(main.channel, 'email');
  assert.deepEqual(main.interactionIds, ['x1', 'x2', 'x3', 'x4']);
});

test('deduplicateThread — splits reactivations older than 30 days', () => {
  const log = new CommunicationLog({ now: () => REF });
  const base = REF - 180 * DAY;
  const interactions = [
    { id: 'a', channel: 'email', subject: 'שאלה', timestamp: base },
    {
      id: 'b',
      channel: 'email',
      subject: 'Re: שאלה',
      timestamp: base + 2 * DAY,
    },
    {
      id: 'c',
      channel: 'email',
      subject: 'Re: שאלה',
      timestamp: base + 120 * DAY, // dormant revival
    },
  ];
  const threads = log.deduplicateThread(interactions);
  assert.equal(threads.length, 2);
  assert.equal(threads[0].count, 2);
  assert.equal(threads[1].count, 1);
});

test('deduplicateThread — non-email channels stay as solo threads', () => {
  const log = new CommunicationLog();
  const threads = log.deduplicateThread([
    { id: 'p', channel: 'whatsapp', subject: 'היי', timestamp: REF },
    { id: 'q', channel: 'whatsapp', subject: 'היי', timestamp: REF + 100 },
  ]);
  // whatsapp is NOT threaded — each message stands alone
  assert.equal(threads.length, 2);
});

/* ─── 14. Glossary sanity ──────────────────────────────────────────── */
test('glossary — core Hebrew terms present', () => {
  assert.equal(GLOSSARY_HE.interaction, 'אינטראקציה');
  assert.equal(GLOSSARY_HE.timeline, 'ציר זמן');
  assert.equal(GLOSSARY_HE.appendOnly, 'צבירה בלבד — אסור למחוק');
});

/* ─── 15. Internal helper correctness ──────────────────────────────── */
test('normalizeSubjectForThread strips prefixes (HE + EN)', () => {
  const f = __internal__._normalizeSubjectForThread;
  assert.equal(f('Re: FW: תגובה: הצעת מחיר'), 'הצעת מחיר');
  assert.equal(f('Fwd: Re: Hello'), 'hello');
  assert.equal(f('   hello   world  '), 'hello world');
});
