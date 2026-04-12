/**
 * Incident Management — Unit Tests
 * Techno-Kol Uzi / ONYX OPS — Agent X-61 (Swarm 3D)
 *
 * Run with:
 *   node --test test/payroll/incident-mgmt.test.js
 *
 * Zero deps. Uses built-in node:test (Node >= 18).
 *
 * 20+ cases covering:
 *   - Declaration + validation (severity, required fields)
 *   - Commander auto-assignment + round-robin + manual override
 *   - War-room spin-up stub (chat channel + invites)
 *   - Status updates + broadcasts (minutely cadence for SEV1)
 *   - Timeline capture (every action logged)
 *   - Contributing factors
 *   - Resolution + root cause
 *   - Postmortem generation (bilingual Hebrew + English)
 *   - Action items
 *   - listActive / listRecent / metrics (MTTR, MTTD, by severity)
 *   - Blameless culture wording presence
 *   - Never-delete rule (archive only)
 *   - Log-collector (X-54) integration
 *   - SLO (X-60) integration
 *   - Alert-manager (X-55) integration
 *   - Deterministic clock for reproducibility
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const im = require(path.resolve(
  __dirname, '..', '..', 'src', 'ops', 'incident-mgmt.js',
));
const {
  IncidentService,
  OnCallRoster,
  SEVERITY,
  STATUS,
  SEVERITY_RESPONSE_MIN,
  SEVERITY_BROADCAST_SEC,
  BLAMELESS_STATEMENT,
} = im;

// ─────────────────────────────────────────────────────────────────
// Test helpers
// ─────────────────────────────────────────────────────────────────

function makeService(extra = {}) {
  let t = Date.parse('2026-04-11T10:00:00Z');
  let seq = 0;
  const clock = () => t;
  const idGen = (prefix) => {
    seq += 1;
    return `${prefix}_${String(seq).padStart(4, '0')}`;
  };

  // Capture chat + notifier calls for introspection
  const chat = {
    channels: [],
    invites: [],
    createChannel: (opts) => {
      const id = `chan_${chat.channels.length + 1}`;
      chat.channels.push({ id, ...opts });
      return { channel_id: id };
    },
    invite: (channelId, user) => {
      chat.invites.push({ channelId, user });
    },
  };
  const notifier = {
    calls: [],
    broadcast: (payload) => { notifier.calls.push(payload); },
  };
  const sloService = {
    getImpact: (service) => ({ service, affected_users: 100, error_budget_burn_pct: 12.5 }),
  };
  const logCollector = {
    fetch: ({ since, until, service }) => ([
      { ts: since, source: 'nginx', message: 'upstream 502' },
      { ts: until, source: 'app',   message: `service=${service} restarted` },
    ]),
  };
  const alertManager = {
    acked: [],
    ack: (alertId) => { alertManager.acked.push(alertId); },
  };

  const svc = new IncidentService({
    clock,
    idGen,
    roster: new OnCallRoster(extra.commanders || ['alice@onyx', 'bob@onyx', 'carol@onyx']),
    chatProvider: chat,
    notifier,
    sloService,
    logCollector,
    alertManager,
    defaultStakeholders: extra.stakeholders || ['alerts@onyx', 'eng-leads@onyx'],
  });
  svc.__chat = chat;
  svc.__notifier = notifier;
  svc.__slo = sloService;
  svc.__logs = logCollector;
  svc.__alerts = alertManager;
  svc.__advance = (ms) => { t += ms; };
  svc.__now = () => t;
  return svc;
}

function basicDecl(svc, overrides = {}) {
  return svc.declareIncident({
    title: 'Payment gateway 500s',
    severity: SEVERITY.SEV1,
    description: 'All payment attempts are failing with 500s',
    reporter: 'alerts@onyx',
    service: 'payments',
    ...overrides,
  });
}

// ══════════════════════════════════════════════════════════════════
// 1. Declaration — happy path + validation
// ══════════════════════════════════════════════════════════════════

describe('1. declareIncident — happy path & validation', () => {
  test('1.1 declares incident with all required fields', () => {
    const svc = makeService();
    const id = basicDecl(svc);
    assert.ok(id && id.startsWith('INC_'));
    const inc = svc.get(id);
    assert.equal(inc.title, 'Payment gateway 500s');
    assert.equal(inc.severity, 'SEV1');
    assert.equal(inc.status, STATUS.DECLARED);
    assert.equal(inc.reporter, 'alerts@onyx');
    assert.equal(inc.archived, false);
    assert.equal(inc.declared_at, '2026-04-11T10:00:00.000Z');
    assert.ok(Array.isArray(inc.timeline));
    assert.ok(inc.timeline.length >= 1, 'timeline should have declaration entry');
  });

  test('1.2 throws on missing title', () => {
    const svc = makeService();
    assert.throws(
      () => svc.declareIncident({ severity: 'SEV1', reporter: 'x@y' }),
      /title required/,
    );
  });

  test('1.3 throws on missing reporter', () => {
    const svc = makeService();
    assert.throws(
      () => svc.declareIncident({ title: 't', severity: 'SEV1' }),
      /reporter required/,
    );
  });

  test('1.4 throws on invalid severity', () => {
    const svc = makeService();
    assert.throws(
      () => svc.declareIncident({ title: 't', severity: 'SEV9', reporter: 'r' }),
      /invalid severity/,
    );
  });

  test('1.5 accepts all four severities and computes response-due', () => {
    const svc = makeService();
    for (const sev of ['SEV1', 'SEV2', 'SEV3', 'SEV4']) {
      const id = svc.declareIncident({
        title: `t-${sev}`, severity: sev, reporter: 'r@x', description: '',
      });
      const inc = svc.get(id);
      const expectedMs = svc.__now() + SEVERITY_RESPONSE_MIN[sev] * 60000;
      assert.equal(
        Date.parse(inc.response_due), expectedMs,
        `response_due should be +${SEVERITY_RESPONSE_MIN[sev]}min for ${sev}`,
      );
      assert.equal(inc.response_target_min, SEVERITY_RESPONSE_MIN[sev]);
    }
  });

  test('1.6 SEV1 broadcast cadence is minutely (60 sec)', () => {
    const svc = makeService();
    const id = basicDecl(svc);
    const inc = svc.get(id);
    assert.equal(inc.broadcast_cadence_sec, 60);
    assert.equal(SEVERITY_BROADCAST_SEC.SEV1, 60);
  });
});

// ══════════════════════════════════════════════════════════════════
// 2. Commander auto-assign + roster + override
// ══════════════════════════════════════════════════════════════════

describe('2. commander assignment', () => {
  test('2.1 auto-assigns commander from on-call roster', () => {
    const svc = makeService();
    const id = basicDecl(svc);
    const inc = svc.get(id);
    assert.equal(inc.commander, 'alice@onyx');
  });

  test('2.2 round-robin across commanders', () => {
    const svc = makeService();
    const commanders = [];
    for (let i = 0; i < 5; i++) {
      const id = basicDecl(svc, { title: `t${i}` });
      commanders.push(svc.get(id).commander);
    }
    assert.deepEqual(commanders, [
      'alice@onyx', 'bob@onyx', 'carol@onyx', 'alice@onyx', 'bob@onyx',
    ]);
  });

  test('2.3 assignCommander manually overrides and logs', () => {
    const svc = makeService();
    const id = basicDecl(svc);
    svc.assignCommander(id, 'dave@onyx');
    const inc = svc.get(id);
    assert.equal(inc.commander, 'dave@onyx');
    const reassign = inc.timeline.find((t) => t.action === 'commander.reassigned');
    assert.ok(reassign, 'reassignment should be in timeline');
    assert.match(reassign.notes, /alice@onyx -> dave@onyx/);
  });

  test('2.4 assignCommander rejects empty userId', () => {
    const svc = makeService();
    const id = basicDecl(svc);
    assert.throws(() => svc.assignCommander(id, ''), /userId required/);
  });
});

// ══════════════════════════════════════════════════════════════════
// 3. War-room spin-up (stub)
// ══════════════════════════════════════════════════════════════════

describe('3. war-room spin-up', () => {
  test('3.1 creates chat channel and invites stakeholders + commander', () => {
    const svc = makeService();
    const id = basicDecl(svc);
    const inc = svc.get(id);
    assert.ok(inc.war_room);
    assert.ok(inc.war_room.channel_id);
    // stakeholders + commander should all be in war room
    assert.ok(inc.war_room.joined.includes('alerts@onyx'));
    assert.ok(inc.war_room.joined.includes('eng-leads@onyx'));
    assert.ok(inc.war_room.joined.includes('alice@onyx'));
    // chat provider received a createChannel call
    assert.equal(svc.__chat.channels.length, 1);
    assert.match(svc.__chat.channels[0].topic, /SEV1.*Payment gateway/);
  });

  test('3.2 chatProvider failure does NOT break declaration', () => {
    const svc = makeService();
    // Replace with a throwing provider
    svc.chatProvider = {
      createChannel: () => { throw new Error('chat down'); },
      invite: () => { throw new Error('chat down'); },
    };
    let id;
    assert.doesNotThrow(() => { id = basicDecl(svc); });
    const inc = svc.get(id);
    assert.ok(inc.war_room, 'war-room object still created despite chat failure');
  });
});

// ══════════════════════════════════════════════════════════════════
// 4. Status updates + broadcasts
// ══════════════════════════════════════════════════════════════════

describe('4. updateStatus — broadcasts + transitions', () => {
  test('4.1 updateStatus transitions + broadcast sent', () => {
    const svc = makeService();
    const id = basicDecl(svc);
    const before = svc.__notifier.calls.length;
    svc.__advance(30_000);
    svc.updateStatus(id, STATUS.INVESTIGATING, 'triaging payment logs');
    const inc = svc.get(id);
    assert.equal(inc.status, STATUS.INVESTIGATING);
    assert.ok(inc.acknowledged_at, 'acknowledged_at should be set on first transition to investigating');
    assert.equal(svc.__notifier.calls.length, before + 1);
    const last = svc.__notifier.calls[svc.__notifier.calls.length - 1];
    assert.match(last.message, /Investigating.*triaging/);
  });

  test('4.2 status_updates array captured in order', () => {
    const svc = makeService();
    const id = basicDecl(svc);
    svc.__advance(10_000); svc.updateStatus(id, STATUS.INVESTIGATING, 'a');
    svc.__advance(10_000); svc.updateStatus(id, STATUS.IDENTIFIED,    'b');
    svc.__advance(10_000); svc.updateStatus(id, STATUS.MITIGATING,    'c');
    const inc = svc.get(id);
    assert.equal(inc.status_updates.length, 3);
    assert.deepEqual(
      inc.status_updates.map((u) => u.status),
      [STATUS.INVESTIGATING, STATUS.IDENTIFIED, STATUS.MITIGATING],
    );
  });

  test('4.3 updateStatus rejects invalid status', () => {
    const svc = makeService();
    const id = basicDecl(svc);
    assert.throws(() => svc.updateStatus(id, 'nonsense', 'x'), /invalid status/);
  });

  test('4.4 tickBroadcasts re-broadcasts SEV1 after 60 sec', () => {
    const svc = makeService();
    const id = basicDecl(svc);
    svc.updateStatus(id, STATUS.INVESTIGATING, 'still working');
    const beforeTicks = svc.__notifier.calls.length;

    // < cadence: no new broadcast
    svc.__advance(30_000);
    svc.tickBroadcasts();
    assert.equal(svc.__notifier.calls.length, beforeTicks);

    // >= cadence: broadcast emitted
    svc.__advance(35_000);
    svc.tickBroadcasts();
    assert.ok(svc.__notifier.calls.length > beforeTicks, 'should re-broadcast after >= 60s');
  });
});

// ══════════════════════════════════════════════════════════════════
// 5. Timeline capture
// ══════════════════════════════════════════════════════════════════

describe('5. timeline capture', () => {
  test('5.1 addTimelineEntry appends with timestamp', () => {
    const svc = makeService();
    const id = basicDecl(svc);
    svc.__advance(5_000);
    svc.addTimelineEntry(id, {
      action: 'restarted.service',
      actor:  'opsbot',
      notes:  'payments container bounced',
    });
    const inc = svc.get(id);
    const restart = inc.timeline.find((t) => t.action === 'restarted.service');
    assert.ok(restart);
    assert.equal(restart.actor, 'opsbot');
    assert.equal(restart.ts, '2026-04-11T10:00:05.000Z');
  });

  test('5.2 every public operation adds a timeline entry', () => {
    const svc = makeService();
    const id = basicDecl(svc);
    const baselineLen = svc.get(id).timeline.length; // declaration + possibly alert ack
    svc.assignCommander(id, 'dave@onyx');
    svc.updateStatus(id, STATUS.INVESTIGATING, 'looking');
    svc.addContributingFactor(id, 'DNS flap');
    svc.addActionItem(id, { description: 'add DNS monitoring', owner: 'dave@onyx' });
    svc.resolveIncident(id, 'upstream DNS flap');
    const inc = svc.get(id);
    assert.ok(inc.timeline.length >= baselineLen + 5);
    const actions = inc.timeline.map((t) => t.action);
    assert.ok(actions.includes('commander.reassigned'));
    assert.ok(actions.includes('status.changed'));
    assert.ok(actions.includes('factor.added'));
    assert.ok(actions.includes('action_item.added'));
    assert.ok(actions.includes('incident.resolved'));
  });

  test('5.3 addTimelineEntry rejects missing action or actor', () => {
    const svc = makeService();
    const id = basicDecl(svc);
    assert.throws(() => svc.addTimelineEntry(id, { actor: 'x' }), /action required/);
    assert.throws(() => svc.addTimelineEntry(id, { action: 'x' }), /actor required/);
  });
});

// ══════════════════════════════════════════════════════════════════
// 6. Contributing factors
// ══════════════════════════════════════════════════════════════════

describe('6. contributing factors', () => {
  test('6.1 addContributingFactor appends + times timeline', () => {
    const svc = makeService();
    const id = basicDecl(svc);
    svc.addContributingFactor(id, 'cron job leaked connections');
    svc.addContributingFactor(id, 'retry storm amplified failures');
    const inc = svc.get(id);
    assert.deepEqual(inc.contributing_factors, [
      'cron job leaked connections',
      'retry storm amplified failures',
    ]);
  });
});

// ══════════════════════════════════════════════════════════════════
// 7. Resolution + root cause
// ══════════════════════════════════════════════════════════════════

describe('7. resolveIncident', () => {
  test('7.1 resolveIncident sets root cause + resolved_at', () => {
    const svc = makeService();
    const id = basicDecl(svc);
    svc.__advance(5 * 60_000);
    svc.resolveIncident(id, 'bad deploy rolled back');
    const inc = svc.get(id);
    assert.equal(inc.status, STATUS.RESOLVED);
    assert.equal(inc.root_cause, 'bad deploy rolled back');
    assert.equal(inc.resolved_at, '2026-04-11T10:05:00.000Z');
  });

  test('7.2 resolveIncident rejects empty root cause', () => {
    const svc = makeService();
    const id = basicDecl(svc);
    assert.throws(() => svc.resolveIncident(id, ''), /rootCause required/);
  });
});

// ══════════════════════════════════════════════════════════════════
// 8. Postmortem template generation
// ══════════════════════════════════════════════════════════════════

describe('8. generatePostmortem', () => {
  test('8.1 generates bilingual markdown with ALL required sections', () => {
    const svc = makeService();
    const id = basicDecl(svc);
    svc.__advance(60_000);
    svc.updateStatus(id, STATUS.INVESTIGATING, 'looking');
    svc.__advance(60_000);
    svc.addContributingFactor(id, 'retry storm');
    svc.__advance(60_000);
    svc.resolveIncident(id, 'upstream DNS flap');
    svc.__advance(60_000);
    svc.addActionItem(id, {
      description: 'add upstream DNS health probe',
      owner: 'alice@onyx',
      due: '2026-04-20',
    });
    svc.addWhatWentWell(id, 'on-call paged within SLO');
    svc.addWhatWentWrong(id, 'retry storm not capped');
    const md = svc.generatePostmortem(id);

    // All required sections
    assert.match(md, /# Postmortem — Payment gateway 500s/);
    assert.match(md, /Blameless statement \/ הצהרת אי-האשמה/);
    assert.match(md, /1\. Summary \/ תקציר/);
    assert.match(md, /2\. Impact \/ השפעה/);
    assert.match(md, /3\. Timeline \/ ציר זמן/);
    assert.match(md, /4\. Root cause analysis — 5 Whys \/ ניתוח שורש — 5 למה/);
    assert.match(md, /5\. Contributing factors \/ גורמים תורמים/);
    assert.match(md, /6\. What went well \/ מה הלך טוב/);
    assert.match(md, /7\. What went wrong \/ מה הלך לא טוב/);
    assert.match(md, /8\. Action items \/ פריטי פעולה/);

    // MTTR present and > 0
    assert.match(md, /\*\*MTTR:\*\* 3\.00 min/);
    // MTTD present (we updated to investigating after 60s)
    assert.match(md, /\*\*MTTD:\*\* 1\.00 min/);
    // Commander present
    assert.match(md, /Commander:\*\* alice@onyx/);
    // Timeline has at least the declaration
    assert.match(md, /incident\.declared/);
    // Action item table
    assert.match(md, /add upstream DNS health probe/);
    // Root cause populated
    assert.match(md, /upstream DNS flap/);
  });

  test('8.2 postmortem contains blameless culture wording in BOTH languages', () => {
    const svc = makeService();
    const id = basicDecl(svc);
    svc.resolveIncident(id, 'root');
    const md = svc.generatePostmortem(id);
    assert.ok(md.includes(BLAMELESS_STATEMENT.en),
      'must include English blameless statement');
    assert.ok(md.includes(BLAMELESS_STATEMENT.he),
      'must include Hebrew blameless statement');
    // No blame-loaded words in auto-generated text OUTSIDE the blameless statement.
    // Strip the canonical statement before regex-checking the remainder.
    const remainder = md
      .split(BLAMELESS_STATEMENT.en).join('')
      .split(BLAMELESS_STATEMENT.he).join('');
    assert.ok(!remainder.match(/\b(fault|negligence|stupid|idiot)\b/i),
      'blameless postmortem must not contain blame-loaded words');
  });

  test('8.3 postmortem works even before resolution (with MTTR —)', () => {
    const svc = makeService();
    const id = basicDecl(svc);
    const md = svc.generatePostmortem(id);
    assert.match(md, /\*\*MTTR:\*\* —/);
    const inc = svc.get(id);
    assert.equal(inc.status, STATUS.POSTMORTEM);
  });
});

// ══════════════════════════════════════════════════════════════════
// 9. Action items
// ══════════════════════════════════════════════════════════════════

describe('9. action items', () => {
  test('9.1 addActionItem stores fields + timeline', () => {
    const svc = makeService();
    const id = basicDecl(svc);
    const ai = svc.addActionItem(id, {
      description: 'write runbook',
      owner: 'bob@onyx',
      due: '2026-04-20',
    });
    assert.ok(ai.id && ai.id.startsWith('AI_'));
    assert.equal(ai.status, 'open');
    const inc = svc.get(id);
    assert.equal(inc.action_items.length, 1);
    assert.equal(inc.action_items[0].owner, 'bob@onyx');
  });

  test('9.2 addActionItem requires description + owner', () => {
    const svc = makeService();
    const id = basicDecl(svc);
    assert.throws(() => svc.addActionItem(id, { owner: 'x' }), /description required/);
    assert.throws(() => svc.addActionItem(id, { description: 'x' }), /owner required/);
  });
});

// ══════════════════════════════════════════════════════════════════
// 10. listActive / listRecent / metrics
// ══════════════════════════════════════════════════════════════════

describe('10. listing + metrics', () => {
  test('10.1 listActive excludes resolved and archived', () => {
    const svc = makeService();
    const a = basicDecl(svc, { title: 'a' });
    const b = basicDecl(svc, { title: 'b' });
    const c = basicDecl(svc, { title: 'c' });
    svc.resolveIncident(a, 'root');
    svc.archiveIncident(b);
    const active = svc.listActive();
    const ids = active.map((i) => i.id);
    assert.ok(!ids.includes(a));
    assert.ok(!ids.includes(b));
    assert.ok(ids.includes(c));
  });

  test('10.2 listRecent filters by since/until', () => {
    const svc = makeService();
    basicDecl(svc, { title: 'first' });
    svc.__advance(2 * 3600_000);
    const b = basicDecl(svc, { title: 'second' });
    const since = '2026-04-11T11:00:00.000Z';
    const list = svc.listRecent({ since });
    assert.equal(list.length, 1);
    assert.equal(list[0].id, b);
  });

  test('10.3 metrics compute MTTR, MTTD, and counts by severity', () => {
    const svc = makeService();
    const a = svc.declareIncident({
      title: 'a', severity: 'SEV1', reporter: 'r', description: '',
    });
    svc.__advance(60_000);
    svc.updateStatus(a, STATUS.INVESTIGATING, 'ack');
    svc.__advance(5 * 60_000);
    svc.resolveIncident(a, 'r1');

    const b = svc.declareIncident({
      title: 'b', severity: 'SEV2', reporter: 'r', description: '',
    });
    svc.__advance(30_000);
    svc.updateStatus(b, STATUS.INVESTIGATING, 'ack');
    svc.__advance(10 * 60_000);
    svc.resolveIncident(b, 'r2');

    svc.declareIncident({
      title: 'c', severity: 'SEV3', reporter: 'r', description: '',
    });

    const m = svc.metrics();
    assert.equal(m.count, 3);
    assert.equal(m.by_severity.SEV1, 1);
    assert.equal(m.by_severity.SEV2, 1);
    assert.equal(m.by_severity.SEV3, 1);
    assert.equal(m.by_severity.SEV4, 0);
    assert.equal(m.resolved, 2);
    assert.equal(m.acknowledged, 2);
    // SEV1: declared→investigating=1min, investigating→resolved=5min → MTTR=6min
    // SEV2: declared→investigating=0.5min, investigating→resolved=10min → MTTR=10.5min
    // mean MTTR = (6 + 10.5) / 2 = 8.25
    assert.equal(m.mttr_min, 8.25);
    // MTTD: SEV1=1min, SEV2=0.5min → mean = 0.75
    assert.equal(m.mttd_min, 0.75);
  });
});

// ══════════════════════════════════════════════════════════════════
// 11. Never delete — archive only
// ══════════════════════════════════════════════════════════════════

describe('11. never-delete rule', () => {
  test('11.1 archiveIncident marks archived + closes but keeps the record', () => {
    const svc = makeService();
    const id = basicDecl(svc);
    svc.archiveIncident(id);
    const inc = svc.get(id);
    assert.equal(inc.archived, true);
    assert.equal(inc.status, STATUS.CLOSED);
    assert.ok(inc.closed_at);
    // Still retrievable
    assert.ok(svc.get(id), 'archived incidents must NEVER be removed');
  });

  test('11.2 module does not export any delete/remove function', () => {
    for (const key of Object.keys(im)) {
      assert.ok(!/delete|remove/i.test(key),
        `incident-mgmt must not export ${key} — never-delete rule`);
    }
  });
});

// ══════════════════════════════════════════════════════════════════
// 12. Integrations (X-54 logs, X-55 alerts, X-60 SLO)
// ══════════════════════════════════════════════════════════════════

describe('12. integrations', () => {
  test('12.1 declareIncident acks originating alert (X-55)', () => {
    const svc = makeService();
    basicDecl(svc, { alert_id: 'alert_42' });
    assert.deepEqual(svc.__alerts.acked, ['alert_42']);
  });

  test('12.2 attachLogs pulls from log collector (X-54) into timeline', () => {
    const svc = makeService();
    const id = basicDecl(svc);
    const n = svc.attachLogs(id);
    assert.equal(n, 2);
    const inc = svc.get(id);
    const logEntries = inc.timeline.filter((t) => t.action === 'log.attached');
    assert.equal(logEntries.length, 2);
    assert.match(logEntries[0].notes, /upstream 502/);
  });

  test('12.3 SLO impact (X-60) captured on declaration', () => {
    const svc = makeService();
    const id = basicDecl(svc);
    const inc = svc.get(id);
    assert.ok(inc.slo_impact);
    assert.equal(inc.slo_impact.affected_users, 100);
    assert.equal(inc.slo_impact.error_budget_burn_pct, 12.5);
  });

  test('12.4 integration failures never break declaration or resolution', () => {
    const svc = makeService();
    svc.sloService    = { getImpact: () => { throw new Error('slo down');   } };
    svc.logCollector  = { fetch:     () => { throw new Error('logs down');  } };
    svc.alertManager  = { ack:       () => { throw new Error('alerts down');} };
    svc.notifier      = { broadcast: () => { throw new Error('notif down'); } };
    let id;
    assert.doesNotThrow(() => {
      id = basicDecl(svc, { alert_id: 'a1' });
    });
    assert.doesNotThrow(() => svc.attachLogs(id));
    assert.doesNotThrow(() => svc.resolveIncident(id, 'root'));
    assert.equal(svc.get(id).status, STATUS.RESOLVED);
  });
});

// ══════════════════════════════════════════════════════════════════
// 13. Module-level facade (default singleton)
// ══════════════════════════════════════════════════════════════════

describe('13. module-level facade', () => {
  test('13.1 declareIncident via exported facade works', () => {
    const id = im.declareIncident({
      title: 'facade test',
      severity: 'SEV3',
      reporter: 'facade@onyx',
      description: 'running via module facade',
    });
    assert.ok(id && id.startsWith('INC_'));
    const active = im.listActive();
    assert.ok(active.some((i) => i.id === id));
    im.archiveIncident(id);
  });
});
