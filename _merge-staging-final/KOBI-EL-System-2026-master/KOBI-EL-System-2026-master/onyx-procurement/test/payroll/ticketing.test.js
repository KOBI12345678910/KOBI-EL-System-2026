/**
 * Customer Support Ticketing — Unit Tests
 * Techno-Kol Uzi / Onyx Procurement — Agent X-21 (Swarm 3B)
 *
 * Run with:
 *   node --test test/payroll/ticketing.test.js
 *
 * Zero deps. Uses built-in node:test (Node >= 18).
 *
 * 30+ cases covering:
 *   - create / validate ticket
 *   - list with filters + pagination + sorting
 *   - status transitions + SLA pause/resume
 *   - assign + unassign
 *   - comments (internal / external + auto-resume)
 *   - tags add/remove + normalization
 *   - attachments (references only, never blobs)
 *   - SLA breach detection
 *   - stats roll-up
 *   - bulk operations
 *   - never-delete rule (archive only)
 *   - Hebrew label coverage
 *   - deterministic clock for reproducibility
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const {
  TicketingService,
  InMemoryTicketStore,
  STATUS,
  PRIORITY,
  SLA_RULES,
  PRIORITY_COLOURS,
  TICKET_LABELS_HE,
  normalizeTag,
  addMinutesISO,
} = require(path.resolve(__dirname, '..', '..', 'src', 'support', 'ticketing.js'));

/* ------------------------------------------------------------------ */
/*  Test helpers                                                       */
/* ------------------------------------------------------------------ */

function makeService(fixedClockMs = Date.parse('2026-04-11T10:00:00Z')) {
  let t = fixedClockMs;
  const clock = () => t;
  let seq = 0;
  const idGen = (prefix) => {
    seq += 1;
    return `${prefix}_${String(seq).padStart(4, '0')}`;
  };
  const svc = new TicketingService({ clock, idGen });
  svc.__advance = (ms) => { t += ms; };
  svc.__setTime = (newMs) => { t = newMs; };
  return svc;
}

function seed(svc, n = 3) {
  const created = [];
  created.push(svc.createTicket({
    client_id: 'cli_001',
    subject:   'שרת לא מגיב',
    description: 'מערכת ה-ERP מגיבה לאט מאוד',
    priority: PRIORITY.URGENT,
    category: 'infra',
    tags: ['erp', 'performance'],
  }));
  svc.__advance(60 * 1000);
  created.push(svc.createTicket({
    client_id: 'cli_002',
    subject:   'בעיה בהדפסת חשבונית',
    priority: PRIORITY.HIGH,
    category: 'billing',
  }));
  svc.__advance(60 * 1000);
  created.push(svc.createTicket({
    client_id: 'cli_003',
    subject:   'General question about payroll',
    priority: PRIORITY.LOW,
    category: 'payroll',
  }));
  return created.slice(0, n);
}

/* ================================================================== */
/*  1. Creation & validation                                           */
/* ================================================================== */

describe('1. createTicket — happy path & validation', () => {
  test('1.1 creates a ticket with all defaults', () => {
    const svc = makeService();
    const t = svc.createTicket({
      client_id: 'cli_A',
      subject:   'דוגמה',
    });
    assert.ok(t.id);
    assert.equal(t.status, STATUS.OPEN);
    assert.equal(t.priority, PRIORITY.MED);
    assert.equal(t.category, 'general');
    assert.equal(t.archived, false);
    assert.equal(t.assignee, null);
    assert.ok(Array.isArray(t.comments));
    assert.ok(Array.isArray(t.history));
    assert.ok(Array.isArray(t.tags));
    assert.ok(t.sla_due && t.sla_due.response_due && t.sla_due.resolution_due);
  });

  test('1.2 throws on missing client_id', () => {
    const svc = makeService();
    assert.throws(
      () => svc.createTicket({ subject: 'x' }),
      /client_id required/,
    );
  });

  test('1.3 throws on missing subject', () => {
    const svc = makeService();
    assert.throws(
      () => svc.createTicket({ client_id: 'c' }),
      /subject required/,
    );
    assert.throws(
      () => svc.createTicket({ client_id: 'c', subject: '   ' }),
      /subject required/,
    );
  });

  test('1.4 throws on invalid priority', () => {
    const svc = makeService();
    assert.throws(
      () => svc.createTicket({ client_id: 'c', subject: 's', priority: 'wat' }),
      /invalid priority/,
    );
  });

  test('1.5 SLA deadlines computed from priority matrix', () => {
    const svc = makeService(Date.parse('2026-04-11T10:00:00Z'));
    const u = svc.createTicket({ client_id: 'c', subject: 's', priority: PRIORITY.URGENT });
    const expectedResponse   = addMinutesISO('2026-04-11T10:00:00.000Z', SLA_RULES.urgent.responseMin);
    const expectedResolution = addMinutesISO('2026-04-11T10:00:00.000Z', SLA_RULES.urgent.resolutionMin);
    assert.equal(u.sla_due.response_due,   expectedResponse);
    assert.equal(u.sla_due.resolution_due, expectedResolution);
  });

  test('1.6 tags are normalized + deduped on creation', () => {
    const svc = makeService();
    const t = svc.createTicket({
      client_id: 'c', subject: 's',
      tags: ['URGENT', 'urgent', 'Auth Issue', '  billing  ', ''],
    });
    assert.deepEqual(t.tags.sort(), ['auth-issue', 'billing', 'urgent']);
  });

  test('1.7 history contains a "created" event', () => {
    const svc = makeService();
    const t = svc.createTicket({ client_id: 'c', subject: 's' });
    assert.equal(t.history.length, 1);
    assert.equal(t.history[0].action, 'created');
  });

  test('1.8 attachments are stored as references only (no blobs)', () => {
    const svc = makeService();
    const t = svc.createTicket({
      client_id: 'c', subject: 's',
      attachments: [{ name: 'logs.txt', ref: 's3://bucket/logs.txt', mime: 'text/plain', size: 1024 }],
    });
    assert.equal(t.attachments.length, 1);
    assert.equal(t.attachments[0].name, 'logs.txt');
    assert.equal(t.attachments[0].ref, 's3://bucket/logs.txt');
    assert.equal(t.attachments[0].mime, 'text/plain');
    assert.ok(!('data' in t.attachments[0]));
    assert.ok(!('blob' in t.attachments[0]));
  });
});

/* ================================================================== */
/*  2. getTicket / listTickets                                         */
/* ================================================================== */

describe('2. getTicket & listTickets', () => {
  test('2.1 getTicket returns null on unknown id', () => {
    const svc = makeService();
    assert.equal(svc.getTicket('nope'), null);
    assert.equal(svc.getTicket(''),     null);
    assert.equal(svc.getTicket(null),   null);
  });

  test('2.2 listTickets returns paginated shape', () => {
    const svc = makeService();
    seed(svc);
    const out = svc.listTickets({ page: 1, limit: 2 });
    assert.equal(out.items.length, 2);
    assert.equal(out.total, 3);
    assert.equal(out.page, 1);
    assert.equal(out.limit, 2);
    assert.equal(out.pages, 2);
  });

  test('2.3 listTickets filters by status', () => {
    const svc = makeService();
    const [a, b] = seed(svc);
    svc.updateStatus(a.id, STATUS.IN_PROGRESS, 'u1');
    const out = svc.listTickets({ status: STATUS.IN_PROGRESS });
    assert.equal(out.total, 1);
    assert.equal(out.items[0].id, a.id);
  });

  test('2.4 listTickets filters by priority', () => {
    const svc = makeService();
    seed(svc);
    const high = svc.listTickets({ priority: PRIORITY.HIGH });
    assert.equal(high.total, 1);
    assert.equal(high.items[0].priority, 'high');
  });

  test('2.5 listTickets filters by client_id', () => {
    const svc = makeService();
    seed(svc);
    const out = svc.listTickets({ client_id: 'cli_002' });
    assert.equal(out.total, 1);
    assert.equal(out.items[0].client_id, 'cli_002');
  });

  test('2.6 listTickets free-text search on subject & description', () => {
    const svc = makeService();
    seed(svc);
    const byDesc = svc.listTickets({ search: 'ERP' });
    assert.equal(byDesc.total, 1);
    const byEnglish = svc.listTickets({ search: 'payroll' });
    assert.equal(byEnglish.total, 1);
  });

  test('2.7 listTickets filter by tag (normalized)', () => {
    const svc = makeService();
    seed(svc);
    const out = svc.listTickets({ tag: 'ERP' });
    assert.equal(out.total, 1);
  });

  test('2.8 listTickets sorts by priority rank', () => {
    const svc = makeService();
    seed(svc);
    const out = svc.listTickets({ sort: 'priority:desc' });
    assert.equal(out.items[0].priority, PRIORITY.URGENT);
    assert.equal(out.items[1].priority, PRIORITY.HIGH);
    assert.equal(out.items[2].priority, PRIORITY.LOW);
  });

  test('2.9 listTickets hides archived by default, shows when requested', () => {
    const svc = makeService();
    const [a] = seed(svc);
    svc.archive(a.id, 'admin');
    assert.equal(svc.listTickets({}).total, 2);
    assert.equal(svc.listTickets({ include_archived: true }).total, 3);
  });
});

/* ================================================================== */
/*  3. Status transitions & SLA pause / resume                         */
/* ================================================================== */

describe('3. Status transitions & SLA pause/resume', () => {
  test('3.1 rejects invalid status', () => {
    const svc = makeService();
    const t = svc.createTicket({ client_id: 'c', subject: 's' });
    assert.throws(() => svc.updateStatus(t.id, 'unknown', 'u1'), /invalid status/);
  });

  test('3.2 records status change in history', () => {
    const svc = makeService();
    const t = svc.createTicket({ client_id: 'c', subject: 's' });
    svc.updateStatus(t.id, STATUS.IN_PROGRESS, 'alice');
    const fresh = svc.getTicket(t.id);
    const statusEvents = fresh.history.filter((h) => h.action === 'status');
    assert.equal(statusEvents.length, 1);
    assert.equal(statusEvents[0].by, 'alice');
  });

  test('3.3 first transition out of open records first_response_at', () => {
    const svc = makeService();
    const t = svc.createTicket({ client_id: 'c', subject: 's' });
    assert.equal(t.sla_due.first_response_at, null);
    svc.updateStatus(t.id, STATUS.IN_PROGRESS, 'alice');
    const fresh = svc.getTicket(t.id);
    assert.ok(fresh.sla_due.first_response_at);
  });

  test('3.4 entering waiting pauses SLA, leaving resumes and extends deadlines', () => {
    const svc = makeService();
    const t = svc.createTicket({ client_id: 'c', subject: 's', priority: PRIORITY.HIGH });
    const originalResolution = t.sla_due.resolution_due;
    svc.updateStatus(t.id, STATUS.WAITING, 'bob');
    // Advance 2 hours while paused
    svc.__advance(2 * 60 * 60 * 1000);
    svc.updateStatus(t.id, STATUS.IN_PROGRESS, 'bob');
    const fresh = svc.getTicket(t.id);
    const newRes = new Date(fresh.sla_due.resolution_due).getTime();
    const oldRes = new Date(originalResolution).getTime();
    const delta = newRes - oldRes;
    assert.equal(delta, 2 * 60 * 60 * 1000);
    assert.ok(fresh.sla_due.paused_ms >= 2 * 60 * 60 * 1000);
    assert.equal(fresh.sla_due.paused_since, null);
  });

  test('3.5 transition to resolved stamps resolved_at', () => {
    const svc = makeService();
    const t = svc.createTicket({ client_id: 'c', subject: 's' });
    svc.updateStatus(t.id, STATUS.IN_PROGRESS, 'u');
    svc.__advance(60 * 60 * 1000);
    svc.updateStatus(t.id, STATUS.RESOLVED, 'u');
    const fresh = svc.getTicket(t.id);
    assert.ok(fresh.sla_due.resolved_at);
  });

  test('3.6 updateStatus returns null for unknown ticket', () => {
    const svc = makeService();
    assert.equal(svc.updateStatus('missing', STATUS.OPEN, 'u'), null);
  });
});

/* ================================================================== */
/*  4. Assignment                                                      */
/* ================================================================== */

describe('4. assign', () => {
  test('4.1 assign sets assignee and history event', () => {
    const svc = makeService();
    const t = svc.createTicket({ client_id: 'c', subject: 's' });
    const next = svc.assign(t.id, 'agent_dana', 'supervisor');
    assert.equal(next.assignee, 'agent_dana');
    const last = next.history[next.history.length - 1];
    assert.equal(last.action, 'assign');
    assert.equal(last.by, 'supervisor');
  });

  test('4.2 assign(null) unassigns', () => {
    const svc = makeService();
    const t = svc.createTicket({ client_id: 'c', subject: 's', assignee: 'agent_x' });
    const next = svc.assign(t.id, null, 'sup');
    assert.equal(next.assignee, null);
  });

  test('4.3 assign returns null for unknown id', () => {
    const svc = makeService();
    assert.equal(svc.assign('missing', 'a', 'u'), null);
  });
});

/* ================================================================== */
/*  5. Comments                                                        */
/* ================================================================== */

describe('5. addComment — internal, external, auto-resume', () => {
  test('5.1 rejects empty body', () => {
    const svc = makeService();
    const t = svc.createTicket({ client_id: 'c', subject: 's' });
    assert.throws(() => svc.addComment(t.id, { body: '' }), /comment body required/);
    assert.throws(() => svc.addComment(t.id, { body: '   ' }), /comment body required/);
  });

  test('5.2 rejects non-object comment', () => {
    const svc = makeService();
    const t = svc.createTicket({ client_id: 'c', subject: 's' });
    assert.throws(() => svc.addComment(t.id, null), /comment must be an object/);
    assert.throws(() => svc.addComment(t.id, 'just a string'), /comment must be an object/);
  });

  test('5.3 internal comments are marked and visible to history', () => {
    const svc = makeService();
    const t = svc.createTicket({ client_id: 'c', subject: 's' });
    const next = svc.addComment(
      t.id,
      { body: 'internal note only for team', author: 'agent_a' },
      true,
    );
    assert.equal(next.comments.length, 1);
    assert.equal(next.comments[0].internal, true);
    assert.match(next.history[next.history.length - 1].note, /\[internal\]/);
  });

  test('5.4 public comment from staff records first_response_at', () => {
    const svc = makeService();
    const t = svc.createTicket({ client_id: 'cli_A', subject: 's' });
    assert.equal(t.sla_due.first_response_at, null);
    const next = svc.addComment(t.id, { body: 'looking into it', author: 'agent_b' }, false);
    assert.ok(next.sla_due.first_response_at);
  });

  test('5.5 client follow-up does NOT set first_response_at', () => {
    const svc = makeService();
    const t = svc.createTicket({ client_id: 'cli_A', subject: 's' });
    const next = svc.addComment(t.id, { body: 'any update?', author: 'cli_A' }, false);
    assert.equal(next.sla_due.first_response_at, null);
  });

  test('5.6 client reply while waiting auto-resumes to in_progress', () => {
    const svc = makeService();
    const t = svc.createTicket({ client_id: 'cli_A', subject: 's', priority: PRIORITY.HIGH });
    svc.updateStatus(t.id, STATUS.WAITING, 'agent_a');
    svc.__advance(3 * 60 * 60 * 1000); // 3h pause
    const next = svc.addComment(t.id, { body: 'here are the logs', author: 'cli_A' }, false);
    assert.equal(next.status, STATUS.IN_PROGRESS);
    assert.equal(next.sla_due.paused_since, null);
    assert.ok(next.sla_due.paused_ms >= 3 * 60 * 60 * 1000);
  });

  test('5.7 staff public reply while waiting does NOT auto-resume', () => {
    const svc = makeService();
    const t = svc.createTicket({ client_id: 'cli_A', subject: 's' });
    svc.updateStatus(t.id, STATUS.WAITING, 'agent_a');
    const next = svc.addComment(t.id, { body: 'still waiting for info', author: 'agent_a' }, false);
    assert.equal(next.status, STATUS.WAITING);
  });

  test('5.8 comment returns null for unknown ticket id', () => {
    const svc = makeService();
    assert.equal(svc.addComment('missing', { body: 'x' }), null);
  });
});

/* ================================================================== */
/*  6. Tags                                                            */
/* ================================================================== */

describe('6. addTag / removeTag / normalizeTag', () => {
  test('6.1 normalizeTag lower-cases and hyphenates', () => {
    assert.equal(normalizeTag('  Billing Issue  '), 'billing-issue');
    assert.equal(normalizeTag('URGENT'), 'urgent');
    assert.equal(normalizeTag(null), '');
  });

  test('6.2 addTag dedups', () => {
    const svc = makeService();
    const t = svc.createTicket({ client_id: 'c', subject: 's' });
    svc.addTag(t.id, 'vip');
    svc.addTag(t.id, 'VIP');
    svc.addTag(t.id, 'vip');
    const fresh = svc.getTicket(t.id);
    assert.deepEqual(fresh.tags, ['vip']);
  });

  test('6.3 removeTag removes and records history', () => {
    const svc = makeService();
    const t = svc.createTicket({ client_id: 'c', subject: 's', tags: ['a', 'b'] });
    svc.removeTag(t.id, 'A');
    const fresh = svc.getTicket(t.id);
    assert.deepEqual(fresh.tags, ['b']);
    assert.ok(fresh.history.find((h) => h.action === 'tag_remove'));
  });

  test('6.4 addTag/removeTag return null for unknown id', () => {
    const svc = makeService();
    assert.equal(svc.addTag('missing', 'x', 'u'), null);
    assert.equal(svc.removeTag('missing', 'x', 'u'), null);
  });
});

/* ================================================================== */
/*  7. SLA breach scanner                                              */
/* ================================================================== */

describe('7. getSlaBreach', () => {
  test('7.1 detects breached resolution deadline', () => {
    const svc = makeService();
    const t = svc.createTicket({ client_id: 'c', subject: 's', priority: PRIORITY.URGENT });
    svc.__advance(SLA_RULES.urgent.resolutionMin * 60 * 1000 + 60_000); // past 8h + 1min
    const breached = svc.getSlaBreach();
    assert.equal(breached.length, 1);
    assert.equal(breached[0].id, t.id);
    assert.equal(breached[0].missed.resolution, true);
  });

  test('7.2 detects breached response deadline even if resolution not due', () => {
    const svc = makeService();
    const t = svc.createTicket({ client_id: 'c', subject: 's', priority: PRIORITY.HIGH });
    svc.__advance(SLA_RULES.high.responseMin * 60 * 1000 + 60_000);
    const breached = svc.getSlaBreach();
    assert.equal(breached.length, 1);
    assert.equal(breached[0].id, t.id);
    assert.equal(breached[0].missed.response, true);
  });

  test('7.3 waiting tickets are NOT counted as breached', () => {
    const svc = makeService();
    const t = svc.createTicket({ client_id: 'c', subject: 's', priority: PRIORITY.URGENT });
    svc.updateStatus(t.id, STATUS.WAITING, 'u');
    svc.__advance(SLA_RULES.urgent.resolutionMin * 60 * 1000 + 60_000);
    const breached = svc.getSlaBreach();
    assert.equal(breached.length, 0);
  });

  test('7.4 closed tickets are excluded from breach scan', () => {
    const svc = makeService();
    const t = svc.createTicket({ client_id: 'c', subject: 's', priority: PRIORITY.URGENT });
    svc.updateStatus(t.id, STATUS.CLOSED, 'u');
    svc.__advance(SLA_RULES.urgent.resolutionMin * 60 * 1000 + 60_000);
    assert.equal(svc.getSlaBreach().length, 0);
  });

  test('7.5 breach results sorted urgent-first', () => {
    const svc = makeService();
    const low  = svc.createTicket({ client_id: 'c1', subject: 'low',  priority: PRIORITY.LOW });
    const urg  = svc.createTicket({ client_id: 'c2', subject: 'urg',  priority: PRIORITY.URGENT });
    svc.__advance(SLA_RULES.low.resolutionMin * 60 * 1000 + 60_000);
    const breached = svc.getSlaBreach();
    assert.equal(breached[0].id, urg.id);
    assert.equal(breached[1].id, low.id);
  });
});

/* ================================================================== */
/*  8. Stats                                                           */
/* ================================================================== */

describe('8. stats', () => {
  test('8.1 stats returns expected shape', () => {
    const svc = makeService();
    seed(svc);
    const s = svc.stats();
    assert.equal(s.total, 3);
    assert.ok(s.by_status);
    assert.ok(s.by_priority);
    assert.equal(typeof s.avg_resolution_hours, 'number');
    assert.equal(typeof s.sla_breach_count, 'number');
  });

  test('8.2 by_status/by_priority counts are accurate', () => {
    const svc = makeService();
    const [a, b] = seed(svc);
    svc.updateStatus(a.id, STATUS.IN_PROGRESS, 'u');
    svc.updateStatus(b.id, STATUS.RESOLVED, 'u');
    const s = svc.stats();
    assert.equal(s.by_status.in_progress, 1);
    assert.equal(s.by_status.resolved, 1);
    assert.equal(s.by_status.open, 1);
    assert.equal(s.by_priority.urgent, 1);
    assert.equal(s.by_priority.high, 1);
    assert.equal(s.by_priority.low, 1);
  });

  test('8.3 avg_resolution_hours excludes paused time', () => {
    const svc = makeService();
    const t = svc.createTicket({ client_id: 'c', subject: 's', priority: PRIORITY.HIGH });
    svc.updateStatus(t.id, STATUS.IN_PROGRESS, 'u');
    svc.updateStatus(t.id, STATUS.WAITING, 'u');
    svc.__advance(5 * 60 * 60 * 1000); // 5h pause
    svc.updateStatus(t.id, STATUS.IN_PROGRESS, 'u');
    svc.__advance(1 * 60 * 60 * 1000); // 1h active
    svc.updateStatus(t.id, STATUS.RESOLVED, 'u');
    const s = svc.stats();
    // total wall = ~6h but paused_ms should remove ~5h → ~1h
    assert.ok(s.avg_resolution_hours >= 0.9 && s.avg_resolution_hours <= 1.3,
      `expected ~1h avg, got ${s.avg_resolution_hours}`);
  });
});

/* ================================================================== */
/*  9. Bulk ops, archive, never-delete                                 */
/* ================================================================== */

describe('9. Bulk ops & archive (never-delete rule)', () => {
  test('9.1 bulkAssign assigns many tickets at once', () => {
    const svc = makeService();
    const ids = seed(svc).map((t) => t.id);
    const out = svc.bulkAssign(ids, 'agent_z', 'admin');
    assert.equal(out.length, 3);
    for (const t of out) assert.equal(t.assignee, 'agent_z');
  });

  test('9.2 bulkUpdateStatus transitions many at once', () => {
    const svc = makeService();
    const ids = seed(svc).map((t) => t.id);
    const out = svc.bulkUpdateStatus(ids, STATUS.CLOSED, 'admin');
    assert.equal(out.length, 3);
    for (const t of out) assert.equal(t.status, STATUS.CLOSED);
  });

  test('9.3 archive does NOT delete, only flags', () => {
    const svc = makeService();
    const [a] = seed(svc);
    svc.archive(a.id, 'admin');
    // Hidden from default list
    assert.equal(svc.listTickets({ client_id: 'cli_001' }).total, 0);
    // Still retrievable directly
    assert.ok(svc.getTicket(a.id));
    assert.equal(svc.getTicket(a.id).archived, true);
    // Store size is preserved — data never destroyed
    const store = svc.store;
    assert.equal(store instanceof InMemoryTicketStore ? store.size() : true, 3);
  });

  test('9.4 unarchive restores visibility', () => {
    const svc = makeService();
    const [a] = seed(svc);
    svc.archive(a.id, 'admin');
    svc.unarchive(a.id, 'admin');
    assert.equal(svc.getTicket(a.id).archived, false);
    assert.equal(svc.listTickets({ client_id: 'cli_001' }).total, 1);
  });
});

/* ================================================================== */
/*  10. Hebrew labels & colour tokens                                  */
/* ================================================================== */

describe('10. i18n & theme tokens', () => {
  test('10.1 Hebrew labels cover every status', () => {
    for (const s of ['open', 'in_progress', 'waiting', 'resolved', 'closed']) {
      assert.ok(TICKET_LABELS_HE.status[s], `missing HE label for status ${s}`);
    }
  });

  test('10.2 Hebrew labels cover every priority', () => {
    for (const p of ['urgent', 'high', 'med', 'low']) {
      assert.ok(TICKET_LABELS_HE.priority[p], `missing HE label for priority ${p}`);
    }
  });

  test('10.3 Priority colour tokens exported for every level', () => {
    for (const p of ['urgent', 'high', 'med', 'low']) {
      assert.match(PRIORITY_COLOURS[p], /^#[0-9a-f]{6}$/i);
    }
  });
});

/* ================================================================== */
/*  11. Event bus                                                      */
/* ================================================================== */

describe('11. onEvent audit bus', () => {
  test('11.1 emits events for create / status / assign / comment / tag', () => {
    const events = [];
    const svc = new TicketingService({
      clock:  () => Date.parse('2026-04-11T10:00:00Z'),
      idGen:  ((n = 0) => () => `id_${++n}`)(),
      onEvent: (evt, payload) => events.push({ evt, payload }),
    });
    const t = svc.createTicket({ client_id: 'c', subject: 's' });
    svc.assign(t.id, 'a', 'u');
    svc.addComment(t.id, { body: 'hi', author: 'a' }, false);
    svc.updateStatus(t.id, STATUS.RESOLVED, 'u');
    svc.addTag(t.id, 'wontfix', 'u');

    const names = events.map((e) => e.evt);
    assert.ok(names.includes('ticket.created'));
    assert.ok(names.includes('ticket.assigned'));
    assert.ok(names.includes('ticket.comment_added'));
    assert.ok(names.includes('ticket.status_changed'));
    assert.ok(names.includes('ticket.tag_added'));
  });
});
