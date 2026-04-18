/**
 * incident-runbook.test.js — Agent Y-180 — 2026-04-11
 *
 * 20 assertions covering the IncidentRunbook engine. Pure Node built-in
 * `assert` module — no Mocha, no Jest, zero dependencies. Runs with:
 *
 *   node test/devops/incident-runbook.test.js
 *
 * A minimal inline harness prints PASS/FAIL and exits non-zero on the
 * first failure so CI picks it up.
 */

'use strict';

const assert = require('assert');
const path = require('path');

const modulePath = path.join(
  __dirname,
  '..',
  '..',
  'src',
  'devops',
  'incident-runbook.js'
);
const {
  IncidentRunbook,
  SEVERITY,
  ESCALATION_CHAIN,
  INCIDENT_STATE,
  STEP_OUTCOME,
  TEMPLATES,
} = require(modulePath);

/* ------------------------------------------------------------------ *
 *  Tiny test harness                                                 *
 * ------------------------------------------------------------------ */

const tests = [];
function test(name, fn) {
  tests.push({ name: name, fn: fn });
}

function run() {
  let passed = 0;
  let failed = 0;
  for (const t of tests) {
    try {
      t.fn();
      console.log('  PASS  ' + t.name);
      passed += 1;
    } catch (err) {
      console.log('  FAIL  ' + t.name);
      console.log('        ' + err.message);
      failed += 1;
    }
  }
  console.log(
    '\n' + passed + ' passed, ' + failed + ' failed, ' + tests.length + ' total'
  );
  if (failed > 0) process.exit(1);
}

/* ------------------------------------------------------------------ *
 *  Fixtures                                                          *
 * ------------------------------------------------------------------ */

function makeClock(startMs) {
  let t = startMs;
  const clock = function () {
    return t;
  };
  clock.advance = function (ms) {
    t += ms;
  };
  clock.set = function (ms) {
    t = ms;
  };
  return clock;
}

function standardSteps() {
  return [
    {
      id: 'triage',
      title: { he: 'טריאז׳', en: 'Triage' },
      owner: 'on-call',
      timerMinutes: 5,
      actions: ['check dashboard', 'ack alert'],
      branches: { ok: 'verify', fail: 'rollback', escalate: 'escalate-lead' },
    },
    {
      id: 'verify',
      title: { he: 'בדיקה', en: 'Verify' },
      timerMinutes: 10,
      branches: { ok: 'mitigate', fail: 'rollback' },
    },
    {
      id: 'mitigate',
      title: { he: 'הפחתה', en: 'Mitigate' },
      branches: { ok: 'END' },
      terminal: false,
    },
    {
      id: 'rollback',
      title: { he: 'החזרה לאחור', en: 'Rollback' },
      branches: { ok: 'END', fail: 'escalate-lead' },
    },
    {
      id: 'escalate-lead',
      title: { he: 'הסלמה לראש צוות', en: 'Escalate to Lead' },
      branches: { ok: 'END' },
      terminal: true,
    },
  ];
}

const CLOCK_BASE = Date.UTC(2026, 3, 11, 9, 0, 0);

/* ------------------------------------------------------------------ *
 *  Tests                                                             *
 * ------------------------------------------------------------------ */

test('1. SEVERITY exposes SEV1..SEV4 with ascending response windows', () => {
  assert.strictEqual(SEVERITY.SEV1.responseMinutes, 5);
  assert.strictEqual(SEVERITY.SEV2.responseMinutes, 15);
  assert.strictEqual(SEVERITY.SEV3.responseMinutes, 60);
  assert.strictEqual(SEVERITY.SEV4.responseMinutes, 240);
  assert.ok(SEVERITY.SEV1.resolutionMinutes < SEVERITY.SEV4.resolutionMinutes);
});

test('2. SEVERITY labels and descriptions are bilingual he/en', () => {
  ['SEV1', 'SEV2', 'SEV3', 'SEV4'].forEach((s) => {
    assert.ok(SEVERITY[s].label.he && SEVERITY[s].label.en);
    assert.ok(SEVERITY[s].description.he && SEVERITY[s].description.en);
  });
});

test('3. ESCALATION_CHAIN is on-call → lead → director', () => {
  assert.strictEqual(ESCALATION_CHAIN.length, 3);
  assert.strictEqual(ESCALATION_CHAIN[0].role, 'on-call');
  assert.strictEqual(ESCALATION_CHAIN[1].role, 'lead');
  assert.strictEqual(ESCALATION_CHAIN[2].role, 'director');
  assert.ok(ESCALATION_CHAIN[0].label.he && ESCALATION_CHAIN[2].label.en);
});

test('4. defineRunbook stores steps and versions on redefinition', () => {
  const rb = new IncidentRunbook();
  const v1 = rb.defineRunbook('db-outage', standardSteps());
  assert.strictEqual(v1.version, 1);
  const v2 = rb.defineRunbook('db-outage', standardSteps());
  assert.strictEqual(v2.version, 2);
  // previous is preserved — never deleted
  assert.ok(v2.previous);
  assert.strictEqual(v2.previous.version, 1);
});

test('5. defineRunbook rejects empty or invalid input', () => {
  const rb = new IncidentRunbook();
  assert.throws(() => rb.defineRunbook('', standardSteps()));
  assert.throws(() => rb.defineRunbook('ok', []));
  assert.throws(() => rb.defineRunbook('ok', [{ /* missing id */ }]));
});

test('6. start() creates an incident with SLA windows derived from severity', () => {
  const clock = makeClock(CLOCK_BASE);
  const rb = new IncidentRunbook({ now: clock });
  rb.defineRunbook('db-outage', standardSteps());
  const id = rb.start({
    scenario: 'db-outage',
    severity: 'SEV1',
    title: { he: 'מסד נתונים נפל', en: 'DB is down' },
    reporter: 'alice',
  });
  const inc = rb.getIncident(id);
  assert.ok(id.startsWith('INC-'));
  assert.strictEqual(inc.severity, 'SEV1');
  assert.strictEqual(inc.state, INCIDENT_STATE.OPEN);
  assert.strictEqual(inc.respondBy - inc.openedAt, 5 * 60 * 1000);
  assert.strictEqual(inc.resolveBy - inc.openedAt, 240 * 60 * 1000);
  assert.strictEqual(inc.currentStepId, 'triage');
});

test('7. start() rejects unknown scenario and bad severity', () => {
  const rb = new IncidentRunbook();
  rb.defineRunbook('db-outage', standardSteps());
  assert.throws(() => rb.start({ scenario: 'nope', severity: 'SEV1' }));
  assert.throws(() =>
    rb.start({ scenario: 'db-outage', severity: 'NUKE' })
  );
});

test('8. advance() walks the decision tree via outcome branches', () => {
  const clock = makeClock(CLOCK_BASE);
  const rb = new IncidentRunbook({ now: clock });
  rb.defineRunbook('db-outage', standardSteps());
  const id = rb.start({ scenario: 'db-outage', severity: 'SEV2' });
  const step1 = rb.advance(id, 'triage', 'ok');
  assert.strictEqual(step1.next, 'verify');
  const step2 = rb.advance(id, 'verify', 'ok');
  assert.strictEqual(step2.next, 'mitigate');
  const step3 = rb.advance(id, 'mitigate', 'ok');
  assert.strictEqual(step3.next, 'END');
  assert.strictEqual(rb.getIncident(id).state, INCIDENT_STATE.MITIGATED);
  assert.strictEqual(rb.getIncident(id).history.length, 3);
});

test('9. advance() rejects out-of-order or unknown steps', () => {
  const rb = new IncidentRunbook();
  rb.defineRunbook('db-outage', standardSteps());
  const id = rb.start({ scenario: 'db-outage', severity: 'SEV3' });
  assert.throws(() => rb.advance(id, 'verify', 'ok')); // wrong step
  assert.throws(() => rb.advance('INC-404', 'triage', 'ok'));
});

test('10. advance() escalates automatically when response SLA is missed', () => {
  const clock = makeClock(CLOCK_BASE);
  const rb = new IncidentRunbook({ now: clock });
  rb.defineRunbook('db-outage', standardSteps());
  const id = rb.start({ scenario: 'db-outage', severity: 'SEV1' });
  clock.advance(6 * 60 * 1000); // 6 minutes — blows the 5-minute respond SLA
  rb.advance(id, 'triage', 'ok');
  const esc = rb.escalationStatus(id);
  assert.ok(esc.rung >= 2);
  assert.strictEqual(ESCALATION_CHAIN[esc.rung - 1].role, 'lead');
});

test('11. advance() escalates to director when resolution SLA is missed', () => {
  const clock = makeClock(CLOCK_BASE);
  const rb = new IncidentRunbook({ now: clock });
  rb.defineRunbook('db-outage', standardSteps());
  const id = rb.start({ scenario: 'db-outage', severity: 'SEV1' });
  clock.advance(250 * 60 * 1000); // >240m resolution SLA
  rb.advance(id, 'triage', 'ok');
  assert.strictEqual(rb.escalationStatus(id).role, 'director');
});

test('12. STEP_OUTCOME.ESCALATE bumps escalation chain manually', () => {
  const rb = new IncidentRunbook();
  rb.defineRunbook('db-outage', standardSteps());
  const id = rb.start({ scenario: 'db-outage', severity: 'SEV2' });
  assert.strictEqual(rb.escalationStatus(id).role, 'on-call');
  rb.advance(id, 'triage', STEP_OUTCOME.ESCALATE);
  assert.strictEqual(rb.escalationStatus(id).role, 'lead');
});

test('13. slaStatus reports remaining time and miss flags', () => {
  const clock = makeClock(CLOCK_BASE);
  const rb = new IncidentRunbook({ now: clock });
  rb.defineRunbook('db-outage', standardSteps());
  const id = rb.start({ scenario: 'db-outage', severity: 'SEV1' });
  const fresh = rb.slaStatus(id);
  assert.strictEqual(fresh.respondMissed, false);
  assert.ok(fresh.remainingRespondMs > 0);
  clock.advance(10 * 60 * 1000);
  const stale = rb.slaStatus(id);
  assert.strictEqual(stale.respondMissed, true);
  assert.strictEqual(stale.remainingRespondMs, 0);
});

test('14. renderSlack produces Hebrew and English with placeholders filled', () => {
  const clock = makeClock(CLOCK_BASE);
  const rb = new IncidentRunbook({ now: clock });
  rb.defineRunbook('db-outage', standardSteps());
  const id = rb.start({
    scenario: 'db-outage',
    severity: 'SEV1',
    title: { he: 'השבתה', en: 'Outage' },
    reporter: 'alice',
  });
  const he = rb.renderSlack(id, 'he');
  const en = rb.renderSlack(id, 'en');
  assert.ok(he.indexOf('אירוע SEV1') >= 0);
  assert.ok(he.indexOf('השבתה') >= 0);
  assert.ok(en.indexOf('Incident SEV1') >= 0);
  assert.ok(en.indexOf('Outage') >= 0);
  assert.ok(en.indexOf('${') === -1); // every placeholder filled
});

test('15. renderSlack rejects unknown locale', () => {
  const rb = new IncidentRunbook();
  rb.defineRunbook('db-outage', standardSteps());
  const id = rb.start({ scenario: 'db-outage', severity: 'SEV2' });
  assert.throws(() => rb.renderSlack(id, 'fr'));
});

test('16. renderStatusPage emits impact line in both locales', () => {
  const rb = new IncidentRunbook();
  rb.defineRunbook('db-outage', standardSteps());
  const id = rb.start({
    scenario: 'db-outage',
    severity: 'SEV2',
    title: { he: 'איטיות', en: 'Slowness' },
    impact: { he: 'חלק מהמשתמשים', en: 'Some users' },
  });
  const he = rb.renderStatusPage(id, 'he');
  const en = rb.renderStatusPage(id, 'en');
  assert.ok(he.indexOf('חלק מהמשתמשים') >= 0);
  assert.ok(en.indexOf('Some users') >= 0);
});

test('17. renderRegulatorNotice only runs when pdplBreach flag is set', () => {
  const rb = new IncidentRunbook();
  rb.defineRunbook('db-outage', standardSteps());
  const idNoBreach = rb.start({ scenario: 'db-outage', severity: 'SEV1' });
  assert.throws(() => rb.renderRegulatorNotice(idNoBreach, 'he'));

  const idBreach = rb.start({
    scenario: 'db-outage',
    severity: 'SEV1',
    title: { he: 'דליפת נתונים', en: 'Data leak' },
    pdplBreach: true,
    dataCategories: ['email', 'name'],
    affectedCount: 1234,
  });
  const noticeHe = rb.renderRegulatorNotice(idBreach, 'he');
  const noticeEn = rb.renderRegulatorNotice(idBreach, 'en');
  assert.ok(noticeHe.indexOf('חוק הגנת הפרטיות') >= 0);
  assert.ok(noticeHe.indexOf('תיקון 13') >= 0);
  assert.ok(noticeHe.indexOf('72') >= 0);
  assert.ok(noticeEn.indexOf('Amendment 13') >= 0);
  assert.ok(noticeEn.indexOf('72-hour') >= 0);
  assert.ok(noticeEn.indexOf('1234') >= 0);
});

test('18. renderDataSubjectNotice personalises the affected user message', () => {
  const rb = new IncidentRunbook();
  rb.defineRunbook('db-outage', standardSteps());
  const id = rb.start({
    scenario: 'db-outage',
    severity: 'SEV2',
    title: { he: 'דליפה', en: 'Leak' },
    pdplBreach: true,
    dataCategories: ['email'],
  });
  const he = rb.renderDataSubjectNotice(id, 'he', { name: 'יוסי כהן' });
  const en = rb.renderDataSubjectNotice(id, 'en', { name: 'John Doe' });
  assert.ok(he.indexOf('יוסי כהן') >= 0);
  assert.ok(he.indexOf('תיקון 13') >= 0);
  assert.ok(en.indexOf('John Doe') >= 0);
  assert.ok(en.indexOf('Amendment 13') >= 0);
});

test('19. renderPostmortem returns bilingual markdown and stores on incident', () => {
  const clock = makeClock(CLOCK_BASE);
  const rb = new IncidentRunbook({ now: clock });
  rb.defineRunbook('db-outage', standardSteps());
  const id = rb.start({
    scenario: 'db-outage',
    severity: 'SEV1',
    title: { he: 'השבתה', en: 'Outage' },
  });
  rb.advance(id, 'triage', 'ok');
  clock.advance(30 * 60 * 1000);
  rb.advance(id, 'verify', 'ok');
  rb.advance(id, 'mitigate', 'ok');
  rb.resolve(id, { he: 'נפתר', en: 'Fixed' });
  const pm = rb.renderPostmortem(id, {
    executiveSummary: 'DB failed over cleanly.',
    why1: 'Primary lost power',
    why2: 'UPS battery degraded',
    why3: 'Quarterly test skipped',
    why4: 'Owner OOO, no backup',
    why5: 'No coverage policy',
    actionItems: '- add UPS check to weekly cron',
  });
  assert.ok(pm.he.indexOf('# ניתוח אירוע') >= 0);
  assert.ok(pm.en.indexOf('# Postmortem') >= 0);
  assert.ok(pm.he.indexOf('UPS') >= 0);
  assert.ok(pm.en.indexOf('UPS') >= 0);
  assert.strictEqual(rb.getIncident(id).state, INCIDENT_STATE.POSTMORTEM);
});

test('20. audit log is append-only and records every lifecycle event', () => {
  const rb = new IncidentRunbook();
  rb.defineRunbook('db-outage', standardSteps());
  const id = rb.start({ scenario: 'db-outage', severity: 'SEV2' });
  rb.advance(id, 'triage', 'ok');
  rb.advance(id, 'verify', 'ok');
  rb.resolve(id);
  rb.close(id);
  const log = rb.auditLog();
  const events = log.map((e) => e.event);
  assert.ok(events.indexOf('runbook.defined') >= 0);
  assert.ok(events.indexOf('incident.started') >= 0);
  assert.ok(events.indexOf('incident.advanced') >= 0);
  assert.ok(events.indexOf('incident.resolved') >= 0);
  assert.ok(events.indexOf('incident.closed') >= 0);
  // snapshot is a copy, not the internal array
  log.push({ event: 'tamper' });
  assert.ok(rb.auditLog().map((e) => e.event).indexOf('tamper') === -1);
});

/* ------------------------------------------------------------------ */
run();
