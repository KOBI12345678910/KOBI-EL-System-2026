/**
 * Unit tests — Voice Call Log
 * Agent Y-124 — Mega-ERP Techno-Kol Uzi (Kobi EL)
 *
 * Run: node --test onyx-procurement/test/comms/call-log.test.js
 *
 * House rule: לא מוחקים — רק משדרגים ומגדלים.
 * Zero external deps.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  CallLog,
  DIRECTIONS,
  PBX_PROVIDERS,
  DEFAULT_DISPOSITIONS,
  DISPOSITION_CATEGORIES,
  LAWFUL_BASES,
  FOLLOWUP_STATUSES,
  QUEUE_PRIORITIES,
  DISCLOSURE_NOTICE_HE,
} = require('../../src/comms/call-log');

// ─────────────────────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────────────────────

function makeClock(initialIso) {
  let now = Date.parse(initialIso);
  const fn = () => now;
  fn.advance = (ms) => { now += ms; };
  fn.advanceMinutes = (m) => { now += m * 60_000; };
  fn.advanceHours = (h) => { now += h * 3_600_000; };
  fn.set = (iso) => { now = Date.parse(iso); };
  return fn;
}

function makeLog(overrides = {}) {
  const clock = overrides.clock || makeClock('2026-04-11T09:00:00Z');
  return {
    clock,
    log: new CallLog({
      clock,
      pbx: overrides.pbx,
      legal: overrides.legal,
      dispositions: overrides.dispositions,
    }),
  };
}

function recordBasic(log, overrides = {}) {
  return log.recordCall({
    callId: 'call-1',
    from: '+972-50-111-2222',
    to: '+972-3-999-8888',
    direction: 'inbound',
    startTime: '2026-04-11T09:00:00Z',
    duration: 180,
    outcome: 'successful',
    agent: 'agent:uzi',
    customer: { id: 'cust-42', name: 'לקוח VIP' },
    notes: 'דובר על הזמנה חדשה לבטון',
    tags: ['sales', 'concrete'],
    ...overrides,
  });
}

// ─────────────────────────────────────────────────────────────
//  CONSTANTS
// ─────────────────────────────────────────────────────────────

test('CONSTANTS — enums cover the required domain values', () => {
  assert.deepEqual(DIRECTIONS.slice(), ['inbound', 'outbound']);
  assert.deepEqual(PBX_PROVIDERS.slice(), ['3cx', 'asterisk', 'mitel', 'cloud-pbx']);
  assert.ok(DEFAULT_DISPOSITIONS.length >= 5, 'at least 5 seeded codes');
  const codes = DEFAULT_DISPOSITIONS.map((d) => d.code);
  for (const must of ['no-answer', 'successful', 'callback', 'quote-sent', 'deal-won']) {
    assert.ok(codes.includes(must), `missing required code ${must}`);
  }
  assert.ok(DISPOSITION_CATEGORIES.includes('business'));
  assert.ok(LAWFUL_BASES.includes('one-party-consent'));
  assert.ok(LAWFUL_BASES.includes('informed-consent'));
  assert.ok(DISCLOSURE_NOTICE_HE.includes('מוקלטת'));
});

// ─────────────────────────────────────────────────────────────
//  recordCall
// ─────────────────────────────────────────────────────────────

test('recordCall — creates a logged call with Hebrew labels', () => {
  const { log } = makeLog();
  const call = recordBasic(log);
  assert.equal(call.callId, 'call-1');
  assert.equal(call.direction, 'inbound');
  assert.equal(call.directionHe, 'שיחה נכנסת');
  assert.equal(call.outcome, 'successful');
  assert.equal(call.outcomeLabelHe, 'שיחה מוצלחת');
  assert.equal(call.customerId, 'cust-42');
  assert.equal(call.customerName, 'לקוח VIP');
  assert.equal(call.duration, 180);
  assert.ok(call.endTime, 'endTime is derived from start + duration');
  assert.equal(call.status, 'logged');
  assert.equal(call.history[0].event, 'created');
});

test('recordCall — validates required fields', () => {
  const { log } = makeLog();
  assert.throws(() => log.recordCall({}), /callId is required/);
  assert.throws(
    () => log.recordCall({ callId: 'x', from: 'a', to: 'b', direction: 'weird', startTime: 0 }),
    /direction must be one of/
  );
  assert.throws(
    () => log.recordCall({ callId: 'x', from: 'a', to: 'b', direction: 'inbound' }),
    /startTime is required/
  );
});

test('recordCall — rejects unknown outcome codes', () => {
  const { log } = makeLog();
  assert.throws(
    () => log.recordCall({
      callId: 'call-x', from: 'a', to: 'b', direction: 'inbound',
      startTime: '2026-04-11T09:00:00Z', outcome: 'does-not-exist',
    }),
    /not a known active disposition/
  );
});

test('recordCall — derives duration from start+end', () => {
  const { log } = makeLog();
  const c = log.recordCall({
    callId: 'c2', from: 'a', to: 'b', direction: 'outbound',
    startTime: '2026-04-11T09:00:00Z', endTime: '2026-04-11T09:05:00Z',
    outcome: 'successful', agent: 'u',
  });
  assert.equal(c.duration, 300);
});

test('recordCall — supersedes prior version (never deletes)', () => {
  const { log } = makeLog();
  recordBasic(log, { notes: 'v1' });
  // Re-emit the same callId with new content
  recordBasic(log, { notes: 'v2' });
  const all = log.allCalls({ includeSuperseded: true });
  assert.equal(all.length, 2, 'both versions kept');
  const supers = all.filter((c) => c.status === 'superseded');
  const live = all.filter((c) => c.status === 'logged');
  assert.equal(supers.length, 1);
  assert.equal(live.length, 1);
  assert.equal(live[0].notes, 'v2');
  // Active view excludes superseded
  assert.equal(log.allCalls().length, 1);
});

// ─────────────────────────────────────────────────────────────
//  Linking
// ─────────────────────────────────────────────────────────────

test('linkToCustomer / linkToOpportunity / linkToTicket — append history', () => {
  const { log } = makeLog();
  recordBasic(log, { customer: null });
  log.linkToCustomer({ callId: 'call-1', customerId: 'cust-99' });
  log.linkToOpportunity({ callId: 'call-1', oppId: 'opp-7' });
  log.linkToTicket({ callId: 'call-1', ticketId: 'tic-12' });
  const c = log.getCall('call-1');
  assert.equal(c.customerId, 'cust-99');
  assert.equal(c.opportunityId, 'opp-7');
  assert.equal(c.ticketId, 'tic-12');
  const events = c.history.map((h) => h.event);
  assert.ok(events.includes('link.customer'));
  assert.ok(events.includes('link.opportunity'));
  assert.ok(events.includes('link.ticket'));
});

test('linking — unknown callId throws', () => {
  const { log } = makeLog();
  assert.throws(
    () => log.linkToCustomer({ callId: 'no-such', customerId: 'c1' }),
    /not found/
  );
});

// ─────────────────────────────────────────────────────────────
//  Disposition taxonomy (configurable)
// ─────────────────────────────────────────────────────────────

test('dispositionCodes — includes the required seed codes (with Hebrew)', () => {
  const { log } = makeLog();
  const codes = log.dispositionCodes.reduce((m, d) => { m[d.code] = d; return m; }, {});
  assert.equal(codes['no-answer'].labelHe, 'לא ענה');
  assert.equal(codes['successful'].labelHe, 'שיחה מוצלחת');
  assert.equal(codes['callback'].labelHe, 'בקשה לחזור');
  assert.equal(codes['quote-sent'].labelHe, 'הצעה נשלחה');
  assert.equal(codes['deal-won'].labelHe, 'סגירת עסקה');
});

test('addDisposition — upsert a custom code, never deletes the prior one', () => {
  const { log } = makeLog();
  log.addDisposition({
    code: 'escalated-legal',
    labelHe: 'הועבר למחלקה משפטית',
    labelEn: 'Escalated to legal',
    category: 'connected',
    terminal: false,
  });
  assert.ok(log.dispositionCodes.find((d) => d.code === 'escalated-legal'));

  // Supersede
  log.addDisposition({
    code: 'escalated-legal',
    labelHe: 'הועבר ליועץ המשפטי',
    labelEn: 'Escalated to counsel',
    category: 'connected',
    terminal: false,
  });
  const d = log.dispositionCodes.find((x) => x.code === 'escalated-legal');
  assert.equal(d.labelHe, 'הועבר ליועץ המשפטי');
});

test('deactivateDisposition — sets active=false but keeps the record', () => {
  const { log } = makeLog();
  const d = log.deactivateDisposition('wrong-number');
  assert.equal(d.active, false);
  // Still present in the taxonomy
  assert.ok(log.dispositionCodes.find((x) => x.code === 'wrong-number'));
  // New calls cannot pick it
  assert.throws(
    () => log.recordCall({
      callId: 'c3', from: 'a', to: 'b', direction: 'inbound',
      startTime: '2026-04-11T09:00:00Z', outcome: 'wrong-number',
    }),
    /not a known active disposition/
  );
});

// ─────────────────────────────────────────────────────────────
//  callSummary — aggregation
// ─────────────────────────────────────────────────────────────

test('callSummary — volume / avg duration / answer rate', () => {
  const { log } = makeLog();
  // 4 calls: 2 successful (answered), 1 no-answer, 1 voicemail
  log.recordCall({
    callId: 'a', from: '1', to: '2', direction: 'inbound',
    startTime: '2026-04-11T09:00:00Z', duration: 120, outcome: 'successful',
    agent: 'uzi',
  });
  log.recordCall({
    callId: 'b', from: '1', to: '2', direction: 'outbound',
    startTime: '2026-04-11T10:00:00Z', duration: 240, outcome: 'successful',
    agent: 'uzi',
  });
  log.recordCall({
    callId: 'c', from: '1', to: '2', direction: 'outbound',
    startTime: '2026-04-11T11:00:00Z', duration: 0, outcome: 'no-answer',
    agent: 'uzi',
  });
  log.recordCall({
    callId: 'd', from: '1', to: '2', direction: 'inbound',
    startTime: '2026-04-11T12:00:00Z', duration: 5, outcome: 'voicemail',
    agent: 'dana',
  });

  const all = log.callSummary();
  assert.equal(all.volume, 4);
  assert.equal(all.inbound, 2);
  assert.equal(all.outbound, 2);
  assert.equal(all.answered, 2);
  assert.equal(all.unanswered, 2);
  assert.equal(all.answerRate, 0.5);
  assert.equal(all.answerRatePct, 50);
  // Average duration only counts calls with duration > 0 (120, 240, 5) → 121.67
  assert.ok(all.avgDuration > 120 && all.avgDuration < 130);
  // Category aggregation
  assert.equal(all.byCategory.connected + all.byCategory.business, 2);
  assert.equal(all.byCategory.unconnected, 2);

  // Filtered by agent
  const uzi = log.callSummary({ agent: 'uzi' });
  assert.equal(uzi.volume, 3);
  assert.equal(uzi.answered, 2);
  assert.equal(uzi.byAgent.uzi.total, 3);
  assert.ok(Math.abs(uzi.byAgent.uzi.answerRate - 2 / 3) < 1e-9);

  // Filtered by period
  const window = log.callSummary({
    period: { from: '2026-04-11T10:30:00Z', to: '2026-04-11T11:30:00Z' },
  });
  assert.equal(window.volume, 1);
  assert.equal(window.byOutcome['no-answer'], 1);
});

// ─────────────────────────────────────────────────────────────
//  Follow-up tasks
// ─────────────────────────────────────────────────────────────

test('followUpTasks — auto-created and linked to call', () => {
  const { log } = makeLog();
  recordBasic(log);
  const t = log.followUpTasks({
    callId: 'call-1',
    dueDate: '2026-04-14T09:00:00Z',
    description: 'לשלוח הצעת מחיר לטיוטה',
    assignee: 'agent:uzi',
  });
  assert.ok(t.id.startsWith('fu-'));
  assert.equal(t.status, 'open');
  assert.equal(t.statusHe, 'פתוח');
  assert.equal(t.assignee, 'agent:uzi');
  assert.equal(t.callId, 'call-1');

  const open = log.listFollowUps({ status: 'open' });
  assert.equal(open.length, 1);

  // Status progression — history is appended
  log.updateFollowUpStatus({ id: t.id, status: 'in-progress', by: 'uzi' });
  log.updateFollowUpStatus({ id: t.id, status: 'done', by: 'uzi' });
  const done = log.listFollowUps({ status: 'done' });
  assert.equal(done.length, 1);
  assert.equal(done[0].history.length, 3); // created + 2 status
});

test('followUpTasks — rejects unknown statuses', () => {
  const { log } = makeLog();
  recordBasic(log);
  const t = log.followUpTasks({
    callId: 'call-1', dueDate: '2026-04-14T09:00:00Z', description: 'x',
  });
  assert.throws(
    () => log.updateFollowUpStatus({ id: t.id, status: 'chaos' }),
    /status must be one of/
  );
});

test('followUpTasks — validates required fields', () => {
  const { log } = makeLog();
  recordBasic(log);
  assert.throws(
    () => log.followUpTasks({ callId: 'call-1', description: 'x' }),
    /dueDate is required/
  );
});

// ─────────────────────────────────────────────────────────────
//  Missed-call handling + callback queue
// ─────────────────────────────────────────────────────────────

test('missedCallHandling — enqueues with priority (explicit call)', () => {
  const { log } = makeLog();
  log.recordCall({
    callId: 'missed-1', from: '1', to: '2', direction: 'inbound',
    startTime: '2026-04-11T09:00:00Z', duration: 0, outcome: null,
  });
  const q = log.missedCallHandling({
    callId: 'missed-1', callback: { priority: 'high', reason: 'ivr-abandon' },
  });
  assert.equal(q.status, 'queued');
  assert.equal(q.priority, 'high');
  assert.equal(q.reason, 'ivr-abandon');
  assert.equal(q.attempts, 0);
});

test('missedCallHandling — auto-triggers for inbound no-answer/busy/voicemail', () => {
  const { log } = makeLog();
  log.recordCall({
    callId: 'auto-1', from: '1', to: '2', direction: 'inbound',
    startTime: '2026-04-11T09:00:00Z', outcome: 'no-answer',
  });
  log.recordCall({
    callId: 'auto-2', from: '1', to: '2', direction: 'inbound',
    startTime: '2026-04-11T09:10:00Z', outcome: 'busy',
  });
  log.recordCall({
    callId: 'auto-3', from: '1', to: '2', direction: 'inbound',
    startTime: '2026-04-11T09:20:00Z', outcome: 'voicemail',
  });
  const q = log.callBackQueue();
  assert.equal(q.length, 3);
  for (const item of q) {
    assert.equal(item.priority, 'high'); // default for missed-inbound auto
  }
});

test('callBackQueue — ordered by priority then enqueue time', () => {
  const { log, clock } = makeLog();
  // Three "missed" inbound calls, three distinct priorities, out of order
  log.recordCall({
    callId: 'mc-normal', from: '1', to: '2', direction: 'inbound',
    startTime: '2026-04-11T09:00:00Z', outcome: null,
  });
  log.missedCallHandling({ callId: 'mc-normal', callback: { priority: 'normal' } });

  clock.advanceMinutes(1);
  log.recordCall({
    callId: 'mc-vip', from: '1', to: '2', direction: 'inbound',
    startTime: '2026-04-11T09:01:00Z', outcome: null,
  });
  log.missedCallHandling({ callId: 'mc-vip', callback: { priority: 'vip' } });

  clock.advanceMinutes(1);
  log.recordCall({
    callId: 'mc-low', from: '1', to: '2', direction: 'inbound',
    startTime: '2026-04-11T09:02:00Z', outcome: null,
  });
  log.missedCallHandling({ callId: 'mc-low', callback: { priority: 'low' } });

  const q = log.callBackQueue();
  assert.deepEqual(
    q.map((x) => x.priority),
    ['vip', 'normal', 'low'],
  );

  // Filter by priority
  const vipOnly = log.callBackQueue({ priority: 'vip' });
  assert.equal(vipOnly.length, 1);
  assert.equal(vipOnly[0].callId, 'mc-vip');
});

test('updateQueueItem — progresses through lifecycle, keeps history', () => {
  const { log } = makeLog();
  log.recordCall({
    callId: 'q1', from: '1', to: '2', direction: 'inbound',
    startTime: '2026-04-11T09:00:00Z', outcome: null,
  });
  const q = log.missedCallHandling({ callId: 'q1', callback: { priority: 'normal' } });

  log.updateQueueItem({ id: q.id, status: 'in-progress', by: 'uzi' });
  log.updateQueueItem({ id: q.id, status: 'completed', by: 'uzi' });

  const remaining = log.callBackQueue();
  assert.equal(remaining.length, 0, 'completed items leave the queue view');
});

// ─────────────────────────────────────────────────────────────
//  PBX integration
// ─────────────────────────────────────────────────────────────

test('pbxIntegration — registers a known provider, mockable', () => {
  const { log } = makeLog();
  const info = log.pbxIntegration({ provider: 'asterisk' });
  assert.equal(info.provider, 'asterisk');
  assert.ok(info.methods.includes('dial'));
  assert.ok(info.methods.includes('listen'));
});

test('pbxIntegration — rejects unknown providers', () => {
  const { log } = makeLog();
  assert.throws(() => log.pbxIntegration({ provider: 'skype' }), /provider must be one of/);
});

test('dialOutbound — uses the mock adapter and records a call', () => {
  const { log } = makeLog();
  log.pbxIntegration({ provider: '3cx' });
  const res = log.dialOutbound({
    from: '+972-3-999-8888', to: '+972-54-555-1111',
    agent: 'uzi', customer: { id: 'cust-42', name: 'לקוח' },
  });
  assert.ok(res.pbx.callId, 'PBX returned a call id');
  assert.ok(res.call.callId);
  assert.equal(res.call.direction, 'outbound');
  assert.equal(res.call.agent, 'uzi');
});

test('pbxIntegration — injected adapter overrides the mock', () => {
  const { log } = makeLog();
  const hits = [];
  log.pbxIntegration({
    provider: 'cloud-pbx',
    adapter: {
      dial: (args) => { hits.push(['dial', args]); return { callId: 'cloud-xyz' }; },
    },
  });
  const res = log.dialOutbound({ from: '1', to: '2' });
  assert.equal(res.pbx.callId, 'cloud-xyz');
  assert.equal(hits.length, 1);
});

// ─────────────────────────────────────────────────────────────
//  Routing rules
// ─────────────────────────────────────────────────────────────

test('callRoutingRules — VIP customer routes to a specific agent', () => {
  const { log } = makeLog();
  log.callRoutingRules({
    customerId: 'cust-vip',
    rules: [
      { match: { hour: [9, 18] }, action: { route: 'agent:uzi' } },
      { action: { route: 'group:after-hours' } },
    ],
  });
  const dayTime = log.resolveRouting({ customerId: 'cust-vip', context: { hour: 11 } });
  assert.equal(dayTime.route, 'agent:uzi');
  const night = log.resolveRouting({ customerId: 'cust-vip', context: { hour: 22 } });
  assert.equal(night.route, 'group:after-hours');
});

test('callRoutingRules — supersedes prior rule-set (never deletes)', () => {
  const { log } = makeLog();
  log.callRoutingRules({
    customerId: 'cust-1',
    rules: [{ action: { route: 'agent:a' } }],
  });
  log.callRoutingRules({
    customerId: 'cust-1',
    rules: [{ action: { route: 'agent:b' } }],
  });
  // Latest active wins
  const { route } = log.resolveRouting({ customerId: 'cust-1', context: {} });
  assert.equal(route, 'agent:b');
  // Event log keeps both
  const evts = log.eventLog({ event: 'routing.upsert' });
  assert.equal(evts.length, 2);
});

// ─────────────────────────────────────────────────────────────
//  Silent listen (Israeli legal gate)
// ─────────────────────────────────────────────────────────────

test('silentListen — rejected without lawfulBasis when disclosure required', () => {
  const { log } = makeLog();
  recordBasic(log);
  assert.throws(
    () => log.silentListen({ callId: 'call-1', supervisor: 'sup:dana' }),
    /lawfulBasis/
  );
});

test('silentListen — accepted with employment-contract basis', () => {
  const { log } = makeLog();
  log.pbxIntegration({ provider: 'asterisk' });
  recordBasic(log);
  const s = log.silentListen({
    callId: 'call-1',
    supervisor: 'sup:dana',
    lawfulBasis: 'employment-contract',
  });
  assert.equal(s.lawfulBasis, 'employment-contract');
  assert.ok(s.lawfulBasisHe.includes('עובד'));
  assert.equal(s.active, true);
  // end session
  const ended = log.endSilentListen({ id: s.id });
  assert.equal(ended.active, false);
  assert.ok(ended.endedAt);
});

test('silentListen — disclosure notice is set on the session', () => {
  const { log } = makeLog();
  recordBasic(log);
  const s = log.silentListen({
    callId: 'call-1',
    supervisor: 'sup:dana',
    lawfulBasis: 'informed-consent',
  });
  assert.ok(s.disclosureNoticeHe.includes('מוקלטת'));
});

test('silentListen — rejects unknown lawfulBasis', () => {
  const { log } = makeLog();
  recordBasic(log);
  assert.throws(
    () => log.silentListen({
      callId: 'call-1', supervisor: 'sup:dana', lawfulBasis: 'vibes-only',
    }),
    /lawfulBasis/
  );
});

// ─────────────────────────────────────────────────────────────
//  Recording linkage (Y-125 bridge)
// ─────────────────────────────────────────────────────────────

test('recordingLinkage — attaches a URL with retention + lawful basis', () => {
  const { log } = makeLog();
  recordBasic(log);
  const rec = log.recordingLinkage({
    callId: 'call-1',
    recordingUrl: 's3://recordings/call-1.wav',
    retentionDays: 365,
    lawfulBasis: 'one-party-consent',
    disclosed: true,
    checksum: 'sha256:abc',
  });
  assert.equal(rec.url, 's3://recordings/call-1.wav');
  assert.equal(rec.retentionDays, 365);
  assert.equal(rec.lawfulBasis, 'one-party-consent');
  assert.equal(rec.legalOk, true);
  assert.equal(rec.disclosed, true);
  assert.ok(rec.noticeHe);
});

test('recordingLinkage — supersession keeps history, does not delete', () => {
  const { log } = makeLog();
  recordBasic(log);
  log.recordingLinkage({
    callId: 'call-1', recordingUrl: 's3://v1.wav', lawfulBasis: 'one-party-consent',
  });
  log.recordingLinkage({
    callId: 'call-1', recordingUrl: 's3://v2.wav', lawfulBasis: 'one-party-consent',
  });
  const c = log.getCall('call-1');
  assert.equal(c.recording.url, 's3://v2.wav');
  const ev = c.history.map((h) => h.event);
  assert.ok(ev.includes('recording.superseded'));
  assert.ok(ev.filter((x) => x === 'recording.linked').length === 2);
});

// ─────────────────────────────────────────────────────────────
//  Search
// ─────────────────────────────────────────────────────────────

test('searchCalls — text / agent / customer / date range', () => {
  const { log } = makeLog();
  log.recordCall({
    callId: 's1', from: '1', to: '2', direction: 'inbound',
    startTime: '2026-04-11T09:00:00Z', outcome: 'successful', agent: 'uzi',
    customer: { id: 'cust-1', name: 'אחד' }, notes: 'דובר על מלט', tags: ['cement'],
  });
  log.recordCall({
    callId: 's2', from: '1', to: '2', direction: 'outbound',
    startTime: '2026-04-12T09:00:00Z', outcome: 'quote-sent', agent: 'dana',
    customer: { id: 'cust-2', name: 'שתיים' }, notes: 'שלחנו הצעה לברזל',
  });
  log.recordCall({
    callId: 's3', from: '1', to: '2', direction: 'inbound',
    startTime: '2026-04-13T09:00:00Z', outcome: 'no-answer', agent: 'uzi',
    customer: { id: 'cust-1', name: 'אחד' }, notes: 'לא ענה',
  });

  // Text search (Hebrew substring)
  const byText = log.searchCalls({ text: 'מלט' });
  assert.equal(byText.length, 1);
  assert.equal(byText[0].callId, 's1');

  // Agent filter
  const byAgent = log.searchCalls({ agent: 'uzi' });
  assert.equal(byAgent.length, 2);

  // Customer filter
  const byCust = log.searchCalls({ customer: 'cust-1' });
  assert.equal(byCust.length, 2);

  // Date range
  const byDate = log.searchCalls({
    dateRange: { from: '2026-04-12T00:00:00Z', to: '2026-04-12T23:59:59Z' },
  });
  assert.equal(byDate.length, 1);
  assert.equal(byDate[0].callId, 's2');

  // Case-insensitive english tag
  const byTag = log.searchCalls({ text: 'CEMENT' });
  assert.equal(byTag.length, 1);
  assert.equal(byTag[0].callId, 's1');
});

test('searchCalls — excludes superseded by default', () => {
  const { log } = makeLog();
  recordBasic(log, { notes: 'version 1' });
  recordBasic(log, { notes: 'version 2' });
  const active = log.searchCalls({});
  assert.equal(active.length, 1);
  assert.equal(active[0].notes, 'version 2');
  const all = log.searchCalls({ includeSuperseded: true });
  assert.equal(all.length, 2);
});

// ─────────────────────────────────────────────────────────────
//  Disposition aggregation via callSummary — the contract asked for this
// ─────────────────────────────────────────────────────────────

test('callSummary — disposition aggregation matches the raw counts', () => {
  const { log } = makeLog();
  const outcomes = [
    'successful', 'successful', 'successful',
    'no-answer', 'no-answer',
    'quote-sent', 'deal-won',
    'voicemail',
  ];
  outcomes.forEach((o, i) => {
    log.recordCall({
      callId: `agg-${i}`,
      from: '1', to: '2',
      direction: i % 2 === 0 ? 'inbound' : 'outbound',
      startTime: `2026-04-11T${String(9 + i).padStart(2, '0')}:00:00Z`,
      duration: o === 'no-answer' ? 0 : 60 + i * 10,
      outcome: o,
      agent: 'uzi',
    });
  });
  const s = log.callSummary();
  assert.equal(s.volume, 8);
  assert.equal(s.byOutcome['successful'], 3);
  assert.equal(s.byOutcome['no-answer'], 2);
  assert.equal(s.byOutcome['quote-sent'], 1);
  assert.equal(s.byOutcome['deal-won'], 1);
  assert.equal(s.byOutcome['voicemail'], 1);
  // connected = successful (3) + quote-sent? no — quote-sent is "business"
  // business = quote-sent + deal-won = 2
  // unconnected = no-answer + voicemail = 3
  assert.equal(s.byCategory.business, 2);
  assert.equal(s.byCategory.unconnected, 3);
  assert.equal(s.byCategory.connected, 3);
});

// ─────────────────────────────────────────────────────────────
//  House rule — nothing is ever deleted
// ─────────────────────────────────────────────────────────────

test('house rule — nothing is ever deleted', () => {
  const { log } = makeLog();
  // Do a bit of everything
  log.pbxIntegration({ provider: '3cx' });
  recordBasic(log);
  log.linkToCustomer({ callId: 'call-1', customerId: 'cust-2' });
  log.followUpTasks({
    callId: 'call-1', dueDate: '2026-04-12T09:00:00Z',
    description: 'call back', assignee: 'uzi',
  });
  log.missedCallHandling({ callId: 'call-1', callback: { priority: 'normal' } });
  log.callRoutingRules({
    customerId: 'cust-2',
    rules: [{ action: { route: 'agent:uzi' } }],
  });
  log.recordingLinkage({
    callId: 'call-1', recordingUrl: 's3://v1.wav', lawfulBasis: 'one-party-consent',
  });
  log.silentListen({
    callId: 'call-1', supervisor: 'sup:dana', lawfulBasis: 'employment-contract',
  });
  // Re-emit (should supersede, not delete)
  recordBasic(log, { notes: 'v2' });
  // Update status on things that already got created
  const fu = log.listFollowUps()[0];
  log.updateFollowUpStatus({ id: fu.id, status: 'done' });

  // Grow everything once more
  log.callRoutingRules({
    customerId: 'cust-2',
    rules: [{ action: { route: 'agent:other' } }],
  });
  log.addDisposition({
    code: 'escalated-legal', labelHe: 'הועבר ליועץ המשפטי',
    labelEn: 'Escalated to counsel', category: 'connected',
  });
  log.deactivateDisposition('wrong-number');

  const sizes = log.storeSizes();
  assert.ok(sizes.calls >= 2, 'calls are appended, not replaced');
  assert.ok(sizes.followUps >= 1);
  assert.ok(sizes.queue >= 1);
  assert.ok(sizes.routingRules >= 2, 'both rule-sets kept');
  assert.ok(sizes.monitorSessions >= 1);
  assert.ok(sizes.events > 5);

  // Event log is append-only
  const events = log.eventLog();
  assert.ok(events.length >= 10);
  // Strictly non-decreasing timestamps
  for (let i = 1; i < events.length; i++) {
    assert.ok(events[i].at >= events[i - 1].at);
  }

  // The source file must not contain destructive operations on its own stores
  const fs = require('node:fs');
  const path = require('node:path');
  const src = fs.readFileSync(
    path.join(__dirname, '..', '..', 'src', 'comms', 'call-log.js'),
    'utf8',
  );
  // Allow delete/splice inside comments and error strings, but not on store arrays
  const banned = [
    /this\._calls\s*\.\s*(splice|pop|shift)\b/,
    /this\._followUps\s*\.\s*(splice|pop|shift)\b/,
    /this\._queue\s*\.\s*(splice|pop|shift)\b/,
    /this\._routingRules\s*\.\s*(splice|pop|shift)\b/,
    /this\._events\s*\.\s*(splice|pop|shift)\b/,
    /this\._monitorSessions\s*\.\s*(splice|pop|shift)\b/,
  ];
  for (const re of banned) {
    assert.ok(!re.test(src), `banned mutation matched: ${re}`);
  }
});
