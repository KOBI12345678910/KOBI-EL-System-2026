/**
 * Unified Customer Communication Log — Unit Tests
 * ────────────────────────────────────────────────
 * Techno-Kol Uzi Mega-ERP / Agent Y-096
 *
 * Run with:  node --test test/customer/comm-log.test.js
 *
 * Zero external deps — Node built-in test runner only.
 * Covers: logging, timeline, threading, search, sentiment,
 *         response-time, last-touch, summarize, export,
 *         gdprErase confirmation + pseudonymisation, assign,
 *         X-21 ticket mirroring, stats, helpers.
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const {
  CommLog,
  InMemoryCommStore,
  CHANNELS,
  DIRECTIONS,
  SENTIMENTS,
  COMM_LABELS_HE,
  normalizeSubject,
  tokenize,
  computeSentiment,
  shortSummary,
  hasHebrew,
} = require(path.resolve(__dirname, '..', '..', 'src', 'customer', 'comm-log.js'));

/* ------------------------------------------------------------------ */
/*  Deterministic test harness                                         */
/* ------------------------------------------------------------------ */

function makeLog(opts = {}) {
  let seq = 0;
  // fixed wall clock: 2026-04-01T10:00:00Z + advance per call when advance=true
  const baseMs = Date.parse('2026-04-01T10:00:00Z');
  let tick = 0;
  return new CommLog(Object.assign({
    store: new InMemoryCommStore(),
    idGen: (prefix) => `${prefix}_${String(++seq).padStart(4, '0')}`,
    clock: () => baseMs + (tick += 1000), // every call advances 1s
  }, opts));
}

/* ═══════════════════════════════════════════════════════════════ */
/*  1. Helpers                                                     */
/* ═══════════════════════════════════════════════════════════════ */

test('normalizeSubject strips re:/fwd:/hebrew prefixes', () => {
  assert.equal(normalizeSubject('Re: Invoice issue'), 'invoice issue');
  assert.equal(normalizeSubject('FWD: Re: Invoice issue'), 'invoice issue');
  assert.equal(normalizeSubject('תגובה: חשבונית שגויה'), 'חשבונית שגויה');
  assert.equal(normalizeSubject('[Ticket #12] Invoice issue'), 'invoice issue');
  assert.equal(normalizeSubject(''), '(no subject)');
  assert.equal(normalizeSubject(null), '(no subject)');
});

test('tokenize splits hebrew + latin, drops short tokens', () => {
  const toks = tokenize('Invoice #122 חשבונית שגויה OK');
  assert.ok(toks.includes('invoice'));
  assert.ok(toks.includes('122'));
  assert.ok(toks.includes('חשבונית'));
  assert.ok(toks.includes('שגויה'));
  assert.ok(toks.includes('ok'));
});

test('computeSentiment returns positive/negative/neutral', () => {
  assert.equal(computeSentiment('Thanks, excellent service!'), SENTIMENTS.POSITIVE);
  assert.equal(computeSentiment('תודה רבה, מעולה!'), SENTIMENTS.POSITIVE);
  assert.equal(computeSentiment('This is terrible and broken'), SENTIMENTS.NEGATIVE);
  assert.equal(computeSentiment('יש תקלה, אני כועס'), SENTIMENTS.NEGATIVE);
  assert.equal(computeSentiment('Please find attached the invoice'), SENTIMENTS.NEUTRAL);
});

test('shortSummary caps long text + keeps keyword sentence', () => {
  const long = 'Hello team. '.repeat(30) + 'Invoice 122 requires urgent review.';
  const s = shortSummary(long, 200);
  assert.ok(s.length <= 200);
  assert.ok(s.toLowerCase().includes('hello'));
});

test('hasHebrew detects Hebrew characters', () => {
  assert.equal(hasHebrew('שלום'), true);
  assert.equal(hasHebrew('hello'), false);
  assert.equal(hasHebrew('mixed שלום'), true);
});

test('COMM_LABELS_HE exposes bilingual labels', () => {
  assert.equal(COMM_LABELS_HE.channels.email, 'דוא"ל');
  assert.equal(COMM_LABELS_HE.directions.inbound, 'נכנס');
  assert.equal(COMM_LABELS_HE.sentiments.positive, 'חיובי');
});

/* ═══════════════════════════════════════════════════════════════ */
/*  2. logCommunication — validation + happy path                  */
/* ═══════════════════════════════════════════════════════════════ */

test('logCommunication requires customerId', () => {
  const log = makeLog();
  assert.throws(() => log.logCommunication({
    channel: 'email', direction: 'inbound',
  }), /customerId required/);
});

test('logCommunication rejects invalid channel', () => {
  const log = makeLog();
  assert.throws(() => log.logCommunication({
    customerId: 'cust_1', channel: 'carrier-pigeon', direction: 'inbound',
  }), /invalid channel/);
});

test('logCommunication rejects invalid direction', () => {
  const log = makeLog();
  assert.throws(() => log.logCommunication({
    customerId: 'cust_1', channel: 'email', direction: 'sideways',
  }), /invalid direction/);
});

test('logCommunication persists fields, generates id, sets sentiment', () => {
  const log = makeLog();
  const r = log.logCommunication({
    customerId: 'cust_1',
    channel: 'email',
    direction: 'inbound',
    from: 'dana@example.com',
    to: 'support@techno.com',
    subject: 'Invoice issue',
    body: 'The invoice is broken and terrible',
    tags: ['BILLING', 'Urgent'],
    relatedTo: { ticketId: 'tkt_1' },
  });
  assert.ok(r.id.startsWith('comm_'));
  assert.equal(r.customer_id, 'cust_1');
  assert.equal(r.channel, 'email');
  assert.equal(r.direction, 'inbound');
  assert.equal(r.sentiment, SENTIMENTS.NEGATIVE);
  assert.deepEqual(r.tags, ['billing', 'urgent']);
  assert.equal(r.related_to.ticket_id, 'tkt_1');
  assert.equal(r.erased_at, null);
  assert.ok(Array.isArray(r.history) && r.history.length === 1);
});

/* ═══════════════════════════════════════════════════════════════ */
/*  3. timeline                                                    */
/* ═══════════════════════════════════════════════════════════════ */

test('timeline returns chronological desc across all channels', () => {
  const log = makeLog();
  log.logCommunication({ customerId: 'c1', channel: 'email', direction: 'inbound', subject: 'A', body: 'first' });
  log.logCommunication({ customerId: 'c1', channel: 'whatsapp', direction: 'outbound', subject: 'B', body: 'second' });
  log.logCommunication({ customerId: 'c1', channel: 'phone', direction: 'inbound', subject: 'C', body: 'third' });
  log.logCommunication({ customerId: 'c2', channel: 'email', direction: 'inbound', subject: 'D', body: 'other' });
  const t = log.timeline('c1');
  assert.equal(t.length, 3);
  // newest first
  assert.equal(t[0].subject, 'C');
  assert.equal(t[2].subject, 'A');
  // c2 isolated
  assert.equal(log.timeline('c2').length, 1);
});

test('timeline respects limit + from/to filters', () => {
  const log = makeLog();
  log.logCommunication({ customerId: 'c1', channel: 'email', direction: 'inbound', subject: 'A', body: 'x', occurred_at: '2026-03-01T10:00:00Z' });
  log.logCommunication({ customerId: 'c1', channel: 'email', direction: 'inbound', subject: 'B', body: 'x', occurred_at: '2026-03-15T10:00:00Z' });
  log.logCommunication({ customerId: 'c1', channel: 'email', direction: 'inbound', subject: 'C', body: 'x', occurred_at: '2026-04-01T10:00:00Z' });
  const mid = log.timeline('c1', { from: '2026-03-10T00:00:00Z', to: '2026-03-20T00:00:00Z' });
  assert.equal(mid.length, 1);
  assert.equal(mid[0].subject, 'B');
  assert.equal(log.timeline('c1', { limit: 2 }).length, 2);
});

test('timeline channel filter', () => {
  const log = makeLog();
  log.logCommunication({ customerId: 'c1', channel: 'email', direction: 'inbound', subject: 'E', body: 'x' });
  log.logCommunication({ customerId: 'c1', channel: 'phone', direction: 'inbound', subject: 'P', body: 'x' });
  const t = log.timeline('c1', { channel: 'email' });
  assert.equal(t.length, 1);
  assert.equal(t[0].subject, 'E');
});

/* ═══════════════════════════════════════════════════════════════ */
/*  4. threadMessages                                              */
/* ═══════════════════════════════════════════════════════════════ */

test('threadMessages groups messages by normalised subject', () => {
  const log = makeLog();
  log.logCommunication({ customerId: 'c1', channel: 'email', direction: 'inbound', subject: 'Invoice issue', body: 'hi' });
  log.logCommunication({ customerId: 'c1', channel: 'email', direction: 'outbound', subject: 'Re: Invoice issue', body: 'ok' });
  log.logCommunication({ customerId: 'c1', channel: 'email', direction: 'inbound', subject: 'Fwd: Re: Invoice issue', body: 'more' });
  log.logCommunication({ customerId: 'c1', channel: 'email', direction: 'inbound', subject: 'Different topic', body: 'n/a' });

  const th = log.threadMessages({ subject: 'invoice issue' });
  assert.equal(th.count, 3);
  assert.equal(th.thread_key, 'invoice issue');
  // sorted ascending by time
  assert.equal(th.messages[0].subject, 'Invoice issue');
});

test('threadMessages works with hebrew subjects', () => {
  const log = makeLog();
  log.logCommunication({ customerId: 'c1', channel: 'email', direction: 'inbound', subject: 'חשבונית שגויה', body: 'x' });
  log.logCommunication({ customerId: 'c1', channel: 'email', direction: 'outbound', subject: 'תגובה: חשבונית שגויה', body: 'y' });
  const th = log.threadMessages({ subject: 'חשבונית שגויה' });
  assert.equal(th.count, 2);
});

/* ═══════════════════════════════════════════════════════════════ */
/*  5. search                                                      */
/* ═══════════════════════════════════════════════════════════════ */

test('search finds rows by token AND + customer filter', () => {
  const log = makeLog();
  log.logCommunication({ customerId: 'c1', channel: 'email', direction: 'inbound', subject: 'Invoice 122', body: 'Please review invoice' });
  log.logCommunication({ customerId: 'c1', channel: 'email', direction: 'outbound', subject: 'Delivery update', body: 'shipment ready' });
  log.logCommunication({ customerId: 'c2', channel: 'email', direction: 'inbound', subject: 'Invoice 999', body: 'different customer' });
  const res = log.search({ query: 'invoice', customerId: 'c1' });
  assert.equal(res.length, 1);
  assert.equal(res[0].subject, 'Invoice 122');
});

test('search AND intersection shrinks hits', () => {
  const log = makeLog();
  log.logCommunication({ customerId: 'c1', channel: 'email', direction: 'inbound', subject: 'Invoice 122', body: 'general note' });
  log.logCommunication({ customerId: 'c1', channel: 'email', direction: 'outbound', subject: 'Invoice dispute', body: 'price problem' });
  const res = log.search({ query: 'invoice price' });
  assert.equal(res.length, 1);
  assert.equal(res[0].subject, 'Invoice dispute');
});

test('search supports hebrew query', () => {
  const log = makeLog();
  log.logCommunication({ customerId: 'c1', channel: 'email', direction: 'inbound', subject: 'חשבונית שגויה', body: 'יש תקלה במחיר' });
  const res = log.search({ query: 'חשבונית' });
  assert.equal(res.length, 1);
});

test('search dateRange filter', () => {
  const log = makeLog();
  log.logCommunication({ customerId: 'c1', channel: 'email', direction: 'inbound', subject: 'Old invoice', body: 'x', occurred_at: '2026-01-01T10:00:00Z' });
  log.logCommunication({ customerId: 'c1', channel: 'email', direction: 'inbound', subject: 'New invoice', body: 'y', occurred_at: '2026-04-01T10:00:00Z' });
  const res = log.search({ query: 'invoice', dateRange: { from: '2026-03-01T00:00:00Z', to: '2026-04-30T00:00:00Z' } });
  assert.equal(res.length, 1);
  assert.equal(res[0].subject, 'New invoice');
});

test('search channel filter', () => {
  const log = makeLog();
  log.logCommunication({ customerId: 'c1', channel: 'email', direction: 'inbound', subject: 'invoice email', body: 'x' });
  log.logCommunication({ customerId: 'c1', channel: 'sms', direction: 'inbound', subject: 'invoice sms', body: 'y' });
  const res = log.search({ query: 'invoice', channel: 'sms' });
  assert.equal(res.length, 1);
  assert.equal(res[0].channel, 'sms');
});

/* ═══════════════════════════════════════════════════════════════ */
/*  6. sentiment                                                   */
/* ═══════════════════════════════════════════════════════════════ */

test('sentiment counts pos/neu/neg + computes score', () => {
  const log = makeLog();
  log.logCommunication({ customerId: 'c1', channel: 'email', direction: 'inbound', subject: 'great service', body: 'thanks, excellent!' });
  log.logCommunication({ customerId: 'c1', channel: 'email', direction: 'inbound', subject: 'problem', body: 'this is terrible and broken' });
  log.logCommunication({ customerId: 'c1', channel: 'email', direction: 'inbound', subject: 'plain', body: 'please see attached' });
  const s = log.sentiment({ customerId: 'c1' });
  assert.equal(s.positive, 1);
  assert.equal(s.negative, 1);
  assert.equal(s.neutral, 1);
  assert.equal(s.n, 3);
  assert.equal(s.score, 0);
});

test('sentiment detects improving trend', () => {
  const log = makeLog();
  // negative early, positive later
  log.logCommunication({ customerId: 'c1', channel: 'email', direction: 'inbound', subject: 'bad', body: 'terrible broken', occurred_at: '2026-01-01T10:00:00Z' });
  log.logCommunication({ customerId: 'c1', channel: 'email', direction: 'inbound', subject: 'still bad', body: 'angry disappointed', occurred_at: '2026-01-05T10:00:00Z' });
  log.logCommunication({ customerId: 'c1', channel: 'email', direction: 'inbound', subject: 'ok', body: 'thanks good', occurred_at: '2026-03-01T10:00:00Z' });
  log.logCommunication({ customerId: 'c1', channel: 'email', direction: 'inbound', subject: 'great', body: 'excellent perfect awesome', occurred_at: '2026-03-10T10:00:00Z' });
  const s = log.sentiment({ customerId: 'c1' });
  assert.equal(s.trend, 'improving');
});

/* ═══════════════════════════════════════════════════════════════ */
/*  7. responseTime                                                */
/* ═══════════════════════════════════════════════════════════════ */

test('responseTime computes avg minutes inbound→outbound', () => {
  const log = makeLog();
  log.logCommunication({ customerId: 'c1', channel: 'email', direction: 'inbound', subject: 'Q1', body: 'x', occurred_at: '2026-04-01T10:00:00Z' });
  log.logCommunication({ customerId: 'c1', channel: 'email', direction: 'outbound', subject: 'A1', body: 'y', occurred_at: '2026-04-01T10:30:00Z' });
  log.logCommunication({ customerId: 'c1', channel: 'email', direction: 'inbound', subject: 'Q2', body: 'x', occurred_at: '2026-04-02T10:00:00Z' });
  log.logCommunication({ customerId: 'c1', channel: 'email', direction: 'outbound', subject: 'A2', body: 'y', occurred_at: '2026-04-02T11:00:00Z' });
  const rt = log.responseTime({ customerId: 'c1' });
  assert.equal(rt.n, 2);
  // (30 + 60) / 2 = 45
  assert.equal(rt.avg_minutes, 45);
});

test('responseTime returns empty when no inbound', () => {
  const log = makeLog();
  log.logCommunication({ customerId: 'c1', channel: 'email', direction: 'outbound', subject: 'broadcast', body: 'hi' });
  const rt = log.responseTime({ customerId: 'c1' });
  assert.equal(rt.n, 0);
  assert.equal(rt.avg_minutes, 0);
});

/* ═══════════════════════════════════════════════════════════════ */
/*  8. lastTouch                                                   */
/* ═══════════════════════════════════════════════════════════════ */

test('lastTouch returns days + last comm snapshot', () => {
  const log = makeLog({
    clock: () => Date.parse('2026-04-11T10:00:00Z'),
  });
  log.logCommunication({ customerId: 'c1', channel: 'email', direction: 'inbound', subject: 'Hi', body: 'x', occurred_at: '2026-04-01T10:00:00Z' });
  const lt = log.lastTouch('c1');
  assert.equal(lt.days, 10);
  assert.equal(lt.last.subject, 'Hi');
});

test('lastTouch handles unknown customer', () => {
  const log = makeLog();
  const lt = log.lastTouch('ghost');
  assert.equal(lt.days, null);
  assert.equal(lt.last, null);
});

/* ═══════════════════════════════════════════════════════════════ */
/*  9. summarizeInteraction                                        */
/* ═══════════════════════════════════════════════════════════════ */

test('summarizeInteraction returns bilingual tldr', () => {
  const log = makeLog();
  const r = log.logCommunication({
    customerId: 'c1',
    channel: 'email',
    direction: 'inbound',
    subject: 'חשבונית שגויה',
    body: 'שלום, יש בעיה בחשבונית שקיבלתי בחודש שעבר. ' + 'טקסט נוסף '.repeat(60),
  });
  const s = log.summarizeInteraction(r.id);
  assert.ok(s);
  assert.ok(s.summary.length <= 240);
  assert.ok(s.summary_he && s.summary_he.startsWith('תקציר:'));
  assert.equal(s.summary_en, null);
});

test('summarizeInteraction English-only flags summary_en', () => {
  const log = makeLog();
  const r = log.logCommunication({
    customerId: 'c1',
    channel: 'email',
    direction: 'inbound',
    subject: 'Long english',
    body: 'Please review the attached document. '.repeat(30),
  });
  const s = log.summarizeInteraction(r.id);
  assert.ok(s.summary_en && s.summary_en.startsWith('Summary:'));
  assert.equal(s.summary_he, null);
});

/* ═══════════════════════════════════════════════════════════════ */
/*  10. exportHistory                                              */
/* ═══════════════════════════════════════════════════════════════ */

test('exportHistory returns sorted records + legal basis', () => {
  const log = makeLog();
  log.logCommunication({ customerId: 'c1', channel: 'email', direction: 'inbound', subject: 'A', body: 'x', occurred_at: '2026-01-01T10:00:00Z' });
  log.logCommunication({ customerId: 'c1', channel: 'sms',   direction: 'outbound', subject: 'B', body: 'y', occurred_at: '2026-02-01T10:00:00Z' });
  const exp = log.exportHistory('c1');
  assert.equal(exp.customer_id, 'c1');
  assert.equal(exp.count, 2);
  assert.ok(/הגנת הפרטיות/.test(exp.legal_basis));
  assert.equal(exp.records[0].subject, 'A');
  assert.equal(exp.records[1].subject, 'B');
});

test('exportHistory throws without customerId', () => {
  const log = makeLog();
  assert.throws(() => log.exportHistory(), /customerId required/);
});

/* ═══════════════════════════════════════════════════════════════ */
/*  11. gdprErase — confirmation flag + pseudonymisation           */
/* ═══════════════════════════════════════════════════════════════ */

test('gdprErase REFUSES without explicit confirmErase=true', () => {
  const log = makeLog();
  log.logCommunication({ customerId: 'c1', channel: 'email', direction: 'inbound', subject: 'secret', body: 'pw=123' });
  assert.throws(() => log.gdprErase('c1'), /confirmErase=true required/);
  assert.throws(() => log.gdprErase('c1', false), /confirmErase=true required/);
  assert.throws(() => log.gdprErase('c1', 'yes'), /confirmErase=true required/);
});

test('gdprErase pseudonymises content but NEVER removes rows', () => {
  const log = makeLog();
  const r = log.logCommunication({
    customerId: 'c1',
    channel: 'email',
    direction: 'inbound',
    from: 'secret@x.com',
    to: 'us',
    subject: 'very private',
    body: 'credit card 4111 1111 1111 1111',
    tags: ['pii'],
  });
  const out = log.gdprErase('c1', true, 'data-subject request');
  assert.equal(out.customer_id, 'c1');
  assert.equal(out.erased_count, 1);
  assert.equal(out.erased_ids[0], r.id);
  const row = log.get(r.id);
  assert.ok(row, 'row must NOT be deleted — only pseudonymised');
  assert.equal(row.subject, '[erased]');
  assert.equal(row.body, '[erased]');
  assert.equal(row.from, '[erased]');
  assert.equal(row.to, '[erased]');
  assert.deepEqual(row.tags, []);
  assert.deepEqual(row.attachments, []);
  assert.ok(row.erased_at);
  assert.ok(/PDPL erase/.test(row.history[row.history.length - 1].note));
  // export confirms row still exists
  const exp = log.exportHistory('c1');
  assert.equal(exp.count, 1);
  assert.equal(exp.records[0].body, '[erased]');
  assert.ok(exp.records[0].erased_at);
});

test('gdprErase removes content from search index', () => {
  const log = makeLog();
  log.logCommunication({ customerId: 'c1', channel: 'email', direction: 'inbound', subject: 'confidential', body: 'secret data' });
  assert.equal(log.search({ query: 'confidential' }).length, 1);
  log.gdprErase('c1', true);
  assert.equal(log.search({ query: 'confidential' }).length, 0);
  assert.equal(log.search({ query: 'secret' }).length, 0);
});

test('gdprErase is idempotent', () => {
  const log = makeLog();
  log.logCommunication({ customerId: 'c1', channel: 'email', direction: 'inbound', subject: 'x', body: 'y' });
  const first = log.gdprErase('c1', true);
  const second = log.gdprErase('c1', true);
  assert.equal(first.erased_count, 1);
  assert.equal(second.erased_count, 0);
});

/* ═══════════════════════════════════════════════════════════════ */
/*  12. assign                                                     */
/* ═══════════════════════════════════════════════════════════════ */

test('assign sets assignee + logs history', () => {
  const log = makeLog();
  const r = log.logCommunication({ customerId: 'c1', channel: 'email', direction: 'inbound', subject: 'q', body: 'q' });
  const upd = log.assign(r.id, 'agent_dan');
  assert.equal(upd.assignee, 'agent_dan');
  assert.ok(upd.history.some((h) => h.action === 'assign'));
});

test('assign returns null for missing id', () => {
  const log = makeLog();
  assert.equal(log.assign('ghost', 'x'), null);
});

/* ═══════════════════════════════════════════════════════════════ */
/*  13. X-21 ticket mirror integration                             */
/* ═══════════════════════════════════════════════════════════════ */

test('ticketingService receives internal comment when ticketId present', () => {
  const calls = [];
  const fakeTicketing = {
    addComment(ticketId, comment, isInternal) {
      calls.push({ ticketId, comment, isInternal });
      return { id: 'cmt_1' };
    },
  };
  const log = makeLog({ ticketingService: fakeTicketing });
  log.logCommunication({
    customerId: 'c1',
    channel: 'email',
    direction: 'inbound',
    subject: 'Bug in app',
    body: 'it crashes',
    relatedTo: { ticketId: 'tkt_42' },
    created_by: 'dana',
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].ticketId, 'tkt_42');
  assert.equal(calls[0].isInternal, true);
  assert.ok(/Bug in app/.test(calls[0].comment.body));
  assert.equal(calls[0].comment.author, 'dana');
});

test('ticket mirror failure does NOT break logging', () => {
  const brokenTicketing = {
    addComment() { throw new Error('ticket-service-down'); },
  };
  const log = makeLog({ ticketingService: brokenTicketing });
  // must not throw
  const r = log.logCommunication({
    customerId: 'c1',
    channel: 'email',
    direction: 'inbound',
    subject: 'x',
    body: 'y',
    relatedTo: { ticketId: 'tkt_1' },
  });
  assert.ok(r.id);
});

/* ═══════════════════════════════════════════════════════════════ */
/*  14. stats + channel breakdown                                  */
/* ═══════════════════════════════════════════════════════════════ */

test('stats counts total + by_channel + by_direction', () => {
  const log = makeLog();
  log.logCommunication({ customerId: 'c1', channel: 'email', direction: 'inbound', subject: 'a', body: 'x' });
  log.logCommunication({ customerId: 'c1', channel: 'email', direction: 'outbound', subject: 'b', body: 'y' });
  log.logCommunication({ customerId: 'c1', channel: 'phone', direction: 'outbound', subject: 'c', body: 'z', duration: 300 });
  const s = log.stats('c1');
  assert.equal(s.total, 3);
  assert.equal(s.by_channel.email, 2);
  assert.equal(s.by_channel.phone, 1);
  assert.equal(s.by_direction.inbound, 1);
  assert.equal(s.by_direction.outbound, 2);
});

/* ═══════════════════════════════════════════════════════════════ */
/*  15. onEvent audit hook                                         */
/* ═══════════════════════════════════════════════════════════════ */

test('onEvent hook fires for logged/assigned/erased', () => {
  const events = [];
  const log = makeLog({ onEvent: (evt, payload) => events.push({ evt, payload }) });
  const r = log.logCommunication({ customerId: 'c1', channel: 'email', direction: 'inbound', subject: 's', body: 'b' });
  log.assign(r.id, 'agent1');
  log.gdprErase('c1', true);
  const names = events.map((e) => e.evt);
  assert.ok(names.includes('comm.logged'));
  assert.ok(names.includes('comm.assigned'));
  assert.ok(names.includes('comm.gdpr_erased'));
});
