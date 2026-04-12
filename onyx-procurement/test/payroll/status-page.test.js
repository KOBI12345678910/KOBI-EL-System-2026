/**
 * status-page — unit tests
 * ------------------------
 * Techno-Kol Uzi mega-ERP / Agent X-62 (Swarm 3D)
 *
 * Run:  node --test test/payroll/status-page.test.js
 *
 * 22 test cases covering:
 *   - component catalogue validation
 *   - setStatus / overallStatus
 *   - incident lifecycle (start / update / resolve)
 *   - component status propagation
 *   - uptime computation over 90-day windows
 *   - subscriptions (email + webhook)
 *   - RSS feed + JSON + HTML rendering
 *   - X-56 health ingestion bridge
 *   - Hebrew/English bilingual output
 *   - "never delete" invariant (history append-only)
 */

'use strict';

const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');

const SP = require(path.resolve(
  __dirname, '..', '..', 'src', 'ops', 'status-page.js',
));

const {
  createStatusPage,
  STATUS_LEVELS,
  STATUS_RANK,
  DEFAULT_COMPONENTS,
} = SP;

const MS_DAY = 24 * 60 * 60 * 1000;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function clockFactory(startMs) {
  let t = startMs;
  const fn = () => t;
  fn.advance = (ms) => { t += ms; };
  fn.set = (ms) => { t = ms; };
  return fn;
}

function makePage(opts) {
  return createStatusPage(undefined, opts);
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Catalogue / component validation
// ─────────────────────────────────────────────────────────────────────────────

test('1. createStatusPage uses default 10-component catalogue', () => {
  const page = makePage();
  const comps = page.listComponents();
  assert.equal(comps.length, 10);
  const ids = comps.map((c) => c.id).sort();
  assert.deepEqual(ids.sort(), [
    'background-jobs', 'bank', 'core-api', 'database', 'email',
    'search', 'sms', 'storage', 'tax-export', 'web-app',
  ].sort());
  // default status must be operational
  for (const c of comps) assert.equal(c.status, 'operational');
});

test('2. createStatusPage rejects duplicate component ids', () => {
  assert.throws(
    () => createStatusPage([{ id: 'a' }, { id: 'a' }]),
    /duplicate component/i,
  );
});

test('3. createStatusPage rejects components without id', () => {
  assert.throws(
    () => createStatusPage([{ name: 'No id' }]),
    /requires an "id"/i,
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. setStatus / overallStatus
// ─────────────────────────────────────────────────────────────────────────────

test('4. setStatus updates a component and overall reflects worst-of', () => {
  const page = makePage();
  assert.equal(page.overallStatus().level, 'operational');
  page.setStatus('email', 'degraded', 'SMTP latency');
  const overall = page.overallStatus();
  assert.equal(overall.level, 'degraded');
  assert.equal(typeof overall.labelHe, 'string');
  assert.ok(overall.labelHe.length > 0);
});

test('5. setStatus rejects invalid status', () => {
  const page = makePage();
  assert.throws(
    () => page.setStatus('email', 'whatever'),
    /invalid status/i,
  );
});

test('6. setStatus rejects unknown component', () => {
  const page = makePage();
  assert.throws(
    () => page.setStatus('not-a-real-component', 'degraded'),
    /unknown component/i,
  );
});

test('7. overallStatus picks worst across components (major_outage dominates)', () => {
  const page = makePage();
  page.setStatus('email', 'degraded');
  page.setStatus('bank', 'partial_outage');
  page.setStatus('database', 'major_outage');
  assert.equal(page.overallStatus().level, 'major_outage');
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Incident lifecycle
// ─────────────────────────────────────────────────────────────────────────────

test('8. startIncident propagates impact to components', () => {
  const page = makePage();
  const id = page.startIncident({
    title: 'Database replication lag',
    titleHe: 'השהייה בשכפול מסד הנתונים',
    componentIds: ['database'],
    impact: 'partial_outage',
  });
  assert.ok(id.startsWith('inc-'));
  assert.equal(page.getComponent('database').status, 'partial_outage');
  assert.equal(page.overallStatus().level, 'partial_outage');
  const active = page.listActiveIncidents();
  assert.equal(active.length, 1);
  assert.equal(active[0].status, 'investigating');
});

test('9. updateIncident appends update & can escalate impact', () => {
  const page = makePage();
  const id = page.startIncident({
    title: 'Email delivery degraded',
    componentIds: ['email'],
    impact: 'degraded',
  });
  page.updateIncident(id, {
    status: 'identified',
    impact: 'partial_outage',
    message: 'Identified SMTP provider issue',
    messageHe: 'זוהתה תקלת ספק SMTP',
  });
  const inc = page.getIncident(id);
  assert.equal(inc.status, 'identified');
  assert.equal(inc.impact, 'partial_outage');
  assert.equal(inc.updates.length, 1);
  assert.equal(page.getComponent('email').status, 'partial_outage');
});

test('10. resolveIncident restores component to operational if no other incidents', () => {
  const page = makePage();
  const id = page.startIncident({
    title: 'SMS delivery failing',
    componentIds: ['sms'],
    impact: 'major_outage',
  });
  assert.equal(page.getComponent('sms').status, 'major_outage');
  page.resolveIncident(id);
  const inc = page.getIncident(id);
  assert.equal(inc.status, 'resolved');
  assert.ok(inc.resolvedAt);
  assert.equal(page.getComponent('sms').status, 'operational');
  assert.equal(page.listActiveIncidents().length, 0);
});

test('11. resolveIncident is idempotent and never deletes', () => {
  const page = makePage();
  const id = page.startIncident({
    title: 'Search reindexing',
    componentIds: ['search'],
    impact: 'degraded',
  });
  page.resolveIncident(id);
  const before = JSON.stringify(page.getIncident(id));
  page.resolveIncident(id); // second call must be a no-op
  const after = JSON.stringify(page.getIncident(id));
  assert.equal(before, after);
  // still exists in history
  assert.ok(page.getIncident(id));
  assert.equal(page.listIncidents({}).length, 1);
});

test('12. resolveIncident does NOT clear component with another active incident', () => {
  const page = makePage();
  const inc1 = page.startIncident({
    title: 'Core API 5xx',
    componentIds: ['core-api'],
    impact: 'partial_outage',
  });
  const inc2 = page.startIncident({
    title: 'Core API slow db',
    componentIds: ['core-api'],
    impact: 'major_outage',
  });
  // inc2 escalated core-api to major_outage
  assert.equal(page.getComponent('core-api').status, 'major_outage');
  page.resolveIncident(inc1);
  // still major_outage because inc2 is still active
  assert.equal(page.getComponent('core-api').status, 'major_outage');
  page.resolveIncident(inc2);
  assert.equal(page.getComponent('core-api').status, 'operational');
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Uptime
// ─────────────────────────────────────────────────────────────────────────────

test('13. uptime for a component with no downtime is 100%', () => {
  const page = makePage();
  const up = page.uptime('web-app', 90);
  assert.equal(up, 100);
});

test('14. uptime drops proportionally when component goes partial_outage', () => {
  // Inject clock so history intervals are deterministic
  const clock = clockFactory(Date.parse('2026-01-01T00:00:00Z'));
  const page = makePage({ now: clock });
  // 5 day baseline operational
  clock.advance(5 * MS_DAY);
  page.setStatus('bank', 'partial_outage', 'Outage');
  // 1 day of outage
  clock.advance(1 * MS_DAY);
  page.setStatus('bank', 'operational', 'Recovered');
  // 4 more days of operational
  clock.advance(4 * MS_DAY);
  const up = page.uptime('bank', 10);
  // 1 day down out of 10 day window == 90% uptime
  assert.ok(Math.abs(up - 90) < 0.01, `expected ~90% got ${up}`);
});

test('15. degraded status does NOT count against uptime', () => {
  const clock = clockFactory(Date.parse('2026-01-01T00:00:00Z'));
  const page = makePage({ now: clock });
  clock.advance(5 * MS_DAY);
  page.setStatus('email', 'degraded');
  clock.advance(2 * MS_DAY);
  page.setStatus('email', 'operational');
  clock.advance(3 * MS_DAY);
  const up = page.uptime('email', 10);
  assert.equal(up, 100);
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Subscriptions
// ─────────────────────────────────────────────────────────────────────────────

test('16. subscribe accepts email and webhook, rejects garbage', () => {
  const page = makePage();
  const e = page.subscribe('ops@technokol.co.il');
  const w = page.subscribe('https://hooks.example.com/status');
  assert.ok(e.startsWith('sub-'));
  assert.ok(w.startsWith('sub-'));
  const list = page.listSubscriptions();
  const channels = list.map((s) => s.channel).sort();
  assert.deepEqual(channels, ['email', 'webhook']);
  assert.throws(() => page.subscribe('not-an-email-or-url'), /email or http/);
  assert.throws(() => page.subscribe(''), /email or webhook/i);
});

test('17. unsubscribe marks subscription inactive (never hard deletes)', () => {
  const page = makePage();
  const id = page.subscribe('ops@technokol.co.il');
  assert.equal(page.unsubscribe(id), true);
  assert.equal(page.unsubscribe('sub-nope'), false);
  const list = page.listSubscriptions();
  assert.equal(list.length, 1);
  assert.equal(list[0].active, false);
  assert.ok(list[0].cancelledAt);
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. Rendering — HTML / JSON / RSS
// ─────────────────────────────────────────────────────────────────────────────

test('18. render() Hebrew emits RTL direction and Hebrew overall label', () => {
  const page = makePage();
  const html = page.render({ lang: 'he' });
  assert.match(html, /dir="rtl"/);
  assert.match(html, /lang="he"/);
  assert.match(html, /כל המערכות תקינות/);
  assert.match(html, /meta http-equiv="refresh" content="60"/);
  assert.match(html, /feed\.xml/);
});

test('19. render() English emits LTR with English labels & meta refresh 60s', () => {
  const page = makePage();
  const html = page.render({ lang: 'en' });
  assert.match(html, /dir="ltr"/);
  assert.match(html, /lang="en"/);
  assert.match(html, /All systems operational/);
  assert.match(html, /content="60"/);
});

test('20. renderJson returns components + incidents + overall snapshot', () => {
  const page = makePage();
  page.startIncident({
    title: 'Storage degraded',
    componentIds: ['storage'],
    impact: 'degraded',
    message: 'Investigating latency',
  });
  const json = page.renderJson();
  assert.equal(json.components.length, 10);
  assert.equal(json.overall.level, 'degraded');
  assert.equal(json.activeIncidents.length, 1);
  // uptime keys present on every component
  for (const c of json.components) {
    assert.ok(typeof c.uptime90d === 'number');
    assert.ok(c.uptime90d >= 0 && c.uptime90d <= 100);
  }
  // JSON must round-trip
  assert.doesNotThrow(() => JSON.parse(JSON.stringify(json)));
});

test('21. feed() returns valid RSS 2.0 XML with incident items', () => {
  const page = makePage();
  page.startIncident({
    title: 'Tax export failure',
    titleHe: 'כשל בשידור למס הכנסה',
    componentIds: ['tax-export'],
    impact: 'major_outage',
    message: 'Retrying',
    messageHe: 'בניסיון חוזר',
  });
  const he = page.feed({ lang: 'he' });
  assert.match(he, /<\?xml version="1\.0"/);
  assert.match(he, /<rss version="2\.0">/);
  assert.match(he, /<language>he<\/language>/);
  assert.match(he, /כשל בשידור למס הכנסה/);
  const en = page.feed({ lang: 'en' });
  assert.match(en, /<language>en<\/language>/);
  assert.match(en, /Tax export failure/);
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. X-56 Health ingestion bridge
// ─────────────────────────────────────────────────────────────────────────────

test('22. ingestHealth accepts multiple X-56 shapes and maps them correctly', () => {
  const page = makePage();
  assert.equal(page.ingestHealth('database', 'pass'), 'operational');
  assert.equal(page.ingestHealth('email', { status: 'warn' }), 'degraded');
  assert.equal(page.ingestHealth('sms', { healthy: false }), 'major_outage');
  assert.equal(page.ingestHealth('search', { level: 'maintenance' }), 'maintenance');
  // Unknown shape returns null (no update)
  const before = page.getComponent('bank').status;
  assert.equal(page.ingestHealth('bank', { foo: 'bar' }), null);
  assert.equal(page.getComponent('bank').status, before);
  // Active incident with worse impact is not overridden by a pass
  page.startIncident({
    title: 'Core API outage',
    componentIds: ['core-api'],
    impact: 'major_outage',
  });
  page.ingestHealth('core-api', 'pass');
  assert.equal(page.getComponent('core-api').status, 'major_outage');
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. Never delete invariant + writeStatic
// ─────────────────────────────────────────────────────────────────────────────

test('23. incident history is append-only (listIncidents includes resolved)', () => {
  const page = makePage();
  const ids = [];
  for (let i = 0; i < 5; i++) {
    ids.push(page.startIncident({
      title: `Test ${i}`,
      componentIds: ['search'],
      impact: 'degraded',
    }));
  }
  for (const id of ids) page.resolveIncident(id);
  const all = page.listIncidents({});
  assert.equal(all.length, 5);
  // All are still accessible via getIncident
  for (const id of ids) {
    const inc = page.getIncident(id);
    assert.ok(inc);
    assert.equal(inc.status, 'resolved');
  }
  assert.equal(page.listActiveIncidents().length, 0);
});

test('24. writeStatic produces index.html, status.json, feed.xml in target dir', () => {
  const page = makePage();
  page.setStatus('sms', 'degraded', 'SMS provider slow');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'status-page-'));
  try {
    const out = page.writeStatic(dir);
    assert.ok(fs.existsSync(out.htmlPath));
    assert.ok(fs.existsSync(out.jsonPath));
    assert.ok(fs.existsSync(out.feedPath));
    const html = fs.readFileSync(out.htmlPath, 'utf8');
    assert.match(html, /dir="rtl"/);
    const json = JSON.parse(fs.readFileSync(out.jsonPath, 'utf8'));
    assert.equal(json.components.length, 10);
    const xml = fs.readFileSync(out.feedPath, 'utf8');
    assert.match(xml, /<rss/);
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) { /* cleanup */ }
  }
});

test('25. STATUS_RANK orders levels correctly (ops < maint < deg < partial < major)', () => {
  assert.ok(STATUS_RANK.operational < STATUS_RANK.maintenance);
  assert.ok(STATUS_RANK.maintenance < STATUS_RANK.degraded);
  assert.ok(STATUS_RANK.degraded < STATUS_RANK.partial_outage);
  assert.ok(STATUS_RANK.partial_outage < STATUS_RANK.major_outage);
});

test('26. _worstOf helper picks the highest rank, ignores unknowns', () => {
  assert.equal(SP._worstOf(['operational', 'degraded', 'major_outage']), 'major_outage');
  assert.equal(SP._worstOf(['operational']), 'operational');
  assert.equal(SP._worstOf(['unknown-foo', 'degraded']), 'degraded');
  assert.equal(SP._worstOf([]), 'operational');
});

test('27. _escapeHtml neutralizes HTML injection attempts', () => {
  const esc = SP._escapeHtml('<script>alert("x")</script>');
  assert.ok(!esc.includes('<script'));
  assert.match(esc, /&lt;script/);
  assert.match(esc, /&quot;/);
});
