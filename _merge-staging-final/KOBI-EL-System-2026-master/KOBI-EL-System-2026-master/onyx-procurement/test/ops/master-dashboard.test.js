/**
 * ONYX OPS — Master Health Dashboard tests (Agent X-96)
 * ======================================================
 * Covers:
 *   - generateMasterDashboard returns a well-formed HTML document
 *   - KPI cards render with sample signals
 *   - SVG charts are valid and present in the output
 *   - Bilingual strings (Hebrew + English) appear throughout
 *   - Missing-source tolerance: every signal independently optional
 *   - dashboardJSON structure is stable
 *   - Express middleware: HTML + JSON paths, error tolerance
 *   - Auto-refresh meta tag present
 *   - Theme colors present in output
 *   - XSS escaping
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const md = require('../../src/ops/master-dashboard');

// ─── Fixtures ──────────────────────────────────────────────────────

function sampleSignals() {
  return {
    prom: {
      latency_p95_ms: [120, 140, 130, 150, 160, 155, 170, 180, 175, 190, 200, 185],
      error_rate: [0.01, 0.012, 0.009, 0.015, 0.02, 0.018, 0.03, 0.025, 0.02, 0.018, 0.016, 0.014],
      req_rate: [1000, 1100, 1050, 1200, 1150, 1300, 1250, 1350, 1400, 1380, 1420, 1450],
      ts: Array.from({ length: 12 }, (_, i) => Date.now() - (11 - i) * 60_000),
    },
    slo: { burnRate: 1.4, target: 0.999, current: 0.9985, window: '30d' },
    incidents: [
      { id: 'INC-001', title: 'Payment gateway latency', titleHe: 'השהייה בשער תשלומים', severity: 'SEV2', openedAt: Date.now() - 3_600_000, status: 'investigating' },
      { id: 'INC-002', title: 'Cache hit rate dropped', titleHe: 'ירידת יעילות מטמון', severity: 'SEV3', openedAt: Date.now() - 7_200_000, status: 'open' },
    ],
    errorBudget: { remaining_pct: 68.5, consumed_pct: 31.5, eta_exhaustion: Date.now() + 7 * 86_400_000 },
    alerts: [
      { id: 'a1', name: 'HighLatency', nameHe: 'השהייה גבוהה', severity: 'high', firedAt: Date.now() - 600_000, state: 'firing' },
      { id: 'a2', name: 'DiskPressure', nameHe: 'לחץ דיסק', severity: 'medium', firedAt: Date.now() - 1_800_000, state: 'firing' },
    ],
    errors: [
      { message: 'ECONNRESET at upstream', count: 42, lastSeen: Date.now() - 30_000, service: 'api-gateway' },
      { message: 'TypeError: cannot read property of undefined', count: 18, lastSeen: Date.now() - 60_000, service: 'billing' },
    ],
    deps: { critical: 0, high: 2, medium: 7, low: 12, totalPackages: 481 },
    resources: {
      cpu_pct: [45, 48, 52, 55, 58, 60, 62, 59, 57, 54, 52, 50],
      mem_pct: [62, 63, 64, 65, 66, 66, 67, 67, 68, 68, 69, 69],
      disk_pct: 73,
      load_avg: [1.2, 1.4, 1.6],
      ts: Array.from({ length: 12 }, (_, i) => Date.now() - (11 - i) * 60_000),
    },
    uptime: { overall_pct: 99.94, since: Date.now() - 30 * 86_400_000, per_service: { api: 99.98, web: 99.95, worker: 99.87 } },
    logs: { rate_per_min: [120, 130, 125, 140], ts: [], levels: { error: 15, warn: 42, info: 3480 } },
    canary: [
      { name: 'login-flow', nameHe: 'תהליך כניסה', status: 'ok', latencyMs: 820, lastRun: Date.now() - 60_000 },
      { name: 'checkout', nameHe: 'קופה', status: 'degraded', latencyMs: 2_400, lastRun: Date.now() - 120_000 },
    ],
    services: [
      { id: 'api-gateway', name: 'API Gateway', nameHe: 'שער API', status: 'operational', uptime_pct: 99.98, p95_ms: 145, error_rate: 0.002, owner: 'platform' },
      { id: 'billing', name: 'Billing', nameHe: 'חיוב', status: 'degraded', uptime_pct: 99.82, p95_ms: 480, error_rate: 0.028, owner: 'fintech' },
      { id: 'worker', name: 'Workers', nameHe: 'עובדים', status: 'operational', uptime_pct: 99.95, p95_ms: 90, error_rate: 0.001, owner: 'platform' },
    ],
  };
}

// ─── Basic HTML validity ───────────────────────────────────────────

test('generateMasterDashboard returns a well-formed HTML document', () => {
  const html = md.generateMasterDashboard(sampleSignals());
  assert.equal(typeof html, 'string');
  assert.ok(html.startsWith('<!doctype html>'), 'doctype present');
  assert.ok(html.includes('<html'), 'html tag present');
  assert.ok(html.includes('</html>'), 'html tag closed');
  assert.ok(html.includes('<head>'));
  assert.ok(html.includes('</head>'));
  assert.ok(html.includes('<body>'));
  assert.ok(html.includes('</body>'));
  // Structural tag balance: exactly one each of html/head/body (open & close)
  assert.equal((html.match(/<html\b/g) || []).length, 1, 'one <html>');
  assert.equal((html.match(/<\/html>/g) || []).length, 1, 'one </html>');
  assert.equal((html.match(/<head\b/g) || []).length, 1, 'one <head>');
  assert.equal((html.match(/<\/head>/g) || []).length, 1, 'one </head>');
  assert.equal((html.match(/<body\b/g) || []).length, 1, 'one <body>');
  assert.equal((html.match(/<\/body>/g) || []).length, 1, 'one </body>');
});

test('document includes auto-refresh meta tag (30s)', () => {
  const html = md.generateMasterDashboard(sampleSignals());
  assert.match(html, /<meta http-equiv="refresh" content="30"/);
});

test('document sets Hebrew RTL at root', () => {
  const html = md.generateMasterDashboard(sampleSignals());
  assert.match(html, /<html lang="he" dir="rtl">/);
});

// ─── KPI cards ─────────────────────────────────────────────────────

test('KPI cards render with sample signals', () => {
  const html = md.generateMasterDashboard(sampleSignals());
  // All four KPI labels should be present (bilingual)
  assert.ok(html.includes('זמינות'), 'uptime HE label present');
  assert.ok(html.includes('Uptime'), 'uptime EN label present');
  assert.ok(html.includes('SLO Burn'), 'SLO burn EN label present');
  assert.ok(html.includes('אירועים פעילים'), 'incidents HE label present');
  assert.ok(html.includes('Active Incidents'), 'incidents EN label present');
  assert.ok(html.includes('תקציב שגיאות'), 'error budget HE label present');
  assert.ok(html.includes('Error Budget'), 'error budget EN label present');
  // KPI values
  assert.ok(html.includes('99.94%'), 'uptime value rendered');
  assert.ok(html.includes('1.40×'), 'SLO burn value rendered');
  assert.ok(html.includes('68.5%'), 'error budget value rendered');
  // Count of kpi cards exactly 4
  const kpiMatches = html.match(/class="kpi"/g) || [];
  assert.equal(kpiMatches.length, 4, 'exactly four KPI cards');
});

test('KPI cards render gracefully with partial signals', () => {
  const html = md.generateMasterDashboard({ uptime: { overall_pct: 99.99 } });
  assert.ok(html.includes('99.99%'));
  assert.ok(html.includes('Uptime'));
  // Other KPIs should show em-dash placeholder rather than crashing
  assert.ok(html.includes('—'));
});

// ─── SVG validity ─────────────────────────────────────────────────

test('SVG charts are present and well-formed', () => {
  const html = md.generateMasterDashboard(sampleSignals());
  const svgOpens = (html.match(/<svg[^>]*>/g) || []).length;
  const svgCloses = (html.match(/<\/svg>/g) || []).length;
  assert.equal(svgOpens, svgCloses, 'svg tags balanced');
  assert.ok(svgOpens >= 3, 'at least 3 SVG charts (latency, errors, resources)');
  // Namespace declaration
  assert.ok(html.includes('xmlns="http://www.w3.org/2000/svg"'), 'SVG namespace declared');
  // viewBox attribute
  assert.match(html, /viewBox="0 0 \d+ \d+"/);
  // Polyline for line chart
  assert.ok(html.includes('<polyline'), 'polyline element present');
});

test('_svgLineChart handles empty / malformed series gracefully', () => {
  const empty = md._svgLineChart([], {});
  assert.ok(empty.startsWith('<svg'));
  assert.ok(empty.endsWith('</svg>'));
  assert.ok(empty.includes('No data') || empty.includes('אין נתונים'));

  const nullSeries = md._svgLineChart(null, {});
  assert.ok(nullSeries.includes('<svg'));

  const withJunk = md._svgLineChart([{ label: 'bad', color: '#f00', data: null }], {});
  assert.ok(withJunk.startsWith('<svg'));
});

test('_svgLineChart renders data points for valid input', () => {
  const svg = md._svgLineChart(
    [{ label: 'cpu', color: '#4a9eff', data: [10, 20, 30, 40, 50] }],
    { width: 400, height: 150, unit: '%' }
  );
  assert.ok(svg.includes('<polyline'));
  assert.ok(svg.includes('stroke="#4a9eff"'));
  assert.ok(svg.includes('cpu'));
});

// ─── Bilingual strings ────────────────────────────────────────────

test('bilingual Hebrew + English strings present throughout', () => {
  const html = md.generateMasterDashboard(sampleSignals());

  // Page-level titles
  assert.ok(html.includes('לוח בקרה ראשי'), 'Hebrew title');
  assert.ok(html.includes('Master Health Dashboard'), 'English title');

  // Section titles
  assert.ok(html.includes('שירותים'), 'Hebrew services');
  assert.ok(html.includes('Services'), 'English services');

  // Core rule
  assert.ok(html.includes('לא מוחקים רק משדרגים ומגדלים'), 'Hebrew rule present');

  // Chart titles
  assert.ok(html.includes('השהיית P95 (ms)'), 'Hebrew latency chart title');
  assert.ok(html.includes('Latency P95 (ms)'), 'English latency chart title');
  assert.ok(html.includes('קצב שגיאות'), 'Hebrew error rate title');
  assert.ok(html.includes('Error Rate') || html.includes('error %'), 'English error rate title');
  assert.ok(html.includes('ניצול משאבי מערכת'), 'Hebrew resources title');
  assert.ok(html.includes('Resource Usage'), 'English resources title');

  // Table headers
  assert.ok(html.includes('סטטוס'), 'Hebrew status header');
  assert.ok(html.includes('Status'), 'English status header');
});

test('bilingual Hebrew RTL span has dir isolation via CSS', () => {
  const html = md.generateMasterDashboard(sampleSignals());
  assert.ok(html.includes('class="he"'), 'he class used for Hebrew text');
  assert.ok(html.includes('class="en"'), 'en class used for English text');
  assert.ok(html.includes('direction:rtl'), 'RTL direction in CSS');
});

// ─── Missing-source tolerance ─────────────────────────────────────

test('generateMasterDashboard tolerates undefined / null input', () => {
  const h1 = md.generateMasterDashboard(undefined);
  assert.ok(h1.startsWith('<!doctype html>'));
  assert.ok(h1.includes('</html>'));
  const h2 = md.generateMasterDashboard(null);
  assert.ok(h2.startsWith('<!doctype html>'));
  const h3 = md.generateMasterDashboard({});
  assert.ok(h3.startsWith('<!doctype html>'));
});

test('each signal source can be missing independently', () => {
  const full = sampleSignals();
  const sourceKeys = Object.keys(full);
  for (const key of sourceKeys) {
    const partial = { ...full };
    delete partial[key];
    const html = md.generateMasterDashboard(partial);
    assert.ok(html.startsWith('<!doctype html>'), `omitting ${key} still yields HTML`);
    assert.ok(html.includes('</html>'), `omitting ${key} still closes HTML`);
  }
});

test('missing sources show "missing" indicator in source widget', () => {
  const html = md.generateMasterDashboard({});
  // The sources widget should list all sources and show them all as missing
  assert.ok(html.includes('X-51 Prometheus'));
  assert.ok(html.includes('X-60 SLO'));
  assert.ok(html.includes('X-61 Incidents'));
  assert.ok(html.includes('חסר'), 'Hebrew "missing" marker present');
  assert.ok(html.includes('missing'), 'English "missing" marker present');
});

test('present sources show "connected" indicator', () => {
  const html = md.generateMasterDashboard(sampleSignals());
  assert.ok(html.includes('מחובר'), 'Hebrew "connected" marker');
  assert.ok(html.includes('connected'), 'English "connected" marker');
});

test('malformed signal values do not throw', () => {
  assert.doesNotThrow(() => {
    md.generateMasterDashboard({
      prom: { latency_p95_ms: 'not-an-array', error_rate: null },
      slo: 'bad',
      incidents: 'not-a-list',
      resources: { cpu_pct: [NaN, Infinity, -Infinity] },
      services: [null, undefined, { id: 'x' }],
    });
  });
});

// ─── Services table ──────────────────────────────────────────────

test('service table renders rows for each service', () => {
  const html = md.generateMasterDashboard(sampleSignals());
  assert.ok(html.includes('api-gateway'));
  assert.ok(html.includes('billing'));
  assert.ok(html.includes('worker'));
  // Owner column
  assert.ok(html.includes('platform'));
  assert.ok(html.includes('fintech'));
  // Hebrew service names
  assert.ok(html.includes('שער API'));
  assert.ok(html.includes('חיוב'));
});

// ─── dashboardJSON ────────────────────────────────────────────────

test('dashboardJSON returns structured payload', () => {
  const json = md.dashboardJSON(sampleSignals());
  assert.equal(typeof json, 'object');
  assert.equal(json.agent, 'X-96');
  assert.equal(typeof json.version, 'string');
  assert.equal(typeof json.generatedAt, 'number');
  assert.ok(json.overall);
  assert.ok(json.kpi);
  assert.equal(json.kpi.uptime_pct, 99.94);
  assert.equal(json.kpi.slo_burn, 1.4);
  assert.equal(json.kpi.incidents_open, 2);
  assert.equal(json.kpi.error_budget_remaining_pct, 68.5);
  assert.equal(json.services.length, 3);
  assert.ok(json.sources_present.prom);
  assert.ok(json.sources_present.services);
});

test('dashboardJSON tolerates missing input', () => {
  const json = md.dashboardJSON(undefined);
  assert.equal(json.agent, 'X-96');
  assert.equal(json.kpi.uptime_pct, null);
  assert.equal(json.kpi.slo_burn, null);
  assert.equal(json.kpi.incidents_open, 0);
  assert.equal(json.services.length, 0);
});

// ─── Express middleware ──────────────────────────────────────────

function mockReqRes({ accept, query } = {}) {
  const req = {
    headers: { accept: accept || 'text/html' },
    query: query || {},
  };
  const state = { headers: {}, body: null, statusCode: 200 };
  const res = {
    setHeader(k, v) { state.headers[k.toLowerCase()] = v; },
    send(body) { state.body = body; return res; },
    json(payload) { state.body = payload; return res; },
    end(body) { state.body = body; return res; },
    status(code) { state.statusCode = code; return res; },
  };
  return { req, res, state };
}

test('middleware responds with HTML by default', async () => {
  const handler = md.middleware(() => sampleSignals());
  const { req, res, state } = mockReqRes();
  await handler(req, res, () => {});
  assert.equal(state.headers['content-type'], 'text/html; charset=utf-8');
  assert.equal(typeof state.body, 'string');
  assert.ok(state.body.startsWith('<!doctype html>'));
});

test('middleware responds with JSON when ?format=json', async () => {
  const handler = md.middleware(() => sampleSignals());
  const { req, res, state } = mockReqRes({ query: { format: 'json' } });
  await handler(req, res, () => {});
  assert.equal(state.headers['content-type'], 'application/json; charset=utf-8');
  assert.equal(typeof state.body, 'object');
  assert.equal(state.body.agent, 'X-96');
});

test('middleware responds with JSON when Accept header asks for it', async () => {
  const handler = md.middleware(() => sampleSignals());
  const { req, res, state } = mockReqRes({ accept: 'application/json' });
  await handler(req, res, () => {});
  assert.equal(state.headers['content-type'], 'application/json; charset=utf-8');
  assert.equal(state.body.agent, 'X-96');
});

test('middleware tolerates throwing signal provider', async () => {
  const handler = md.middleware(() => { throw new Error('boom'); });
  const { req, res, state } = mockReqRes();
  await handler(req, res, () => {});
  // Should still produce HTML (empty dashboard)
  assert.equal(typeof state.body, 'string');
  assert.ok(state.body.startsWith('<!doctype html>'));
});

test('middleware works with async signal provider', async () => {
  const handler = md.middleware(async () => sampleSignals());
  const { req, res, state } = mockReqRes();
  await handler(req, res, () => {});
  assert.ok(state.body.includes('99.94%'));
});

test('middleware works with no signal provider', async () => {
  const handler = md.middleware();
  const { req, res, state } = mockReqRes();
  await handler(req, res, () => {});
  assert.ok(state.body.startsWith('<!doctype html>'));
});

test('attach helper mounts middleware on express-like app', () => {
  const calls = [];
  const fakeApp = { use: (path, fn) => { calls.push({ path, fn }); } };
  const mounted = md.attach(fakeApp);
  assert.equal(mounted, '/ops/dashboard');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].path, '/ops/dashboard');
  assert.equal(typeof calls[0].fn, 'function');
});

test('attach is a no-op for falsy app', () => {
  assert.equal(md.attach(null), null);
  assert.equal(md.attach(undefined), null);
  assert.equal(md.attach({}), null);
});

// ─── Theme ────────────────────────────────────────────────────────

test('theme uses Palantir dark palette', () => {
  assert.equal(md.THEME.bg, '#0b0d10');
  assert.equal(md.THEME.panel, '#13171c');
  assert.equal(md.THEME.accent, '#4a9eff');
});

test('document embeds theme colors in CSS', () => {
  const html = md.generateMasterDashboard(sampleSignals());
  assert.ok(html.includes('#0b0d10'), 'bg color present');
  assert.ok(html.includes('#13171c'), 'panel color present');
  assert.ok(html.includes('#4a9eff'), 'accent color present');
});

// ─── Summary logic ───────────────────────────────────────────────

test('_computeSummary degrades on SEV1', () => {
  const s = md._computeSummary({
    incidents: [{ id: 'x', severity: 'SEV1', status: 'open' }],
  });
  assert.equal(s.level, 'outage');
  assert.equal(s.sev1Count, 1);
});

test('_computeSummary marks outage on very low uptime', () => {
  const s = md._computeSummary({ uptime: { overall_pct: 94 } });
  assert.equal(s.level, 'outage');
});

test('_computeSummary happy path is operational', () => {
  const s = md._computeSummary({
    uptime: { overall_pct: 99.99 },
    slo: { burnRate: 0.2 },
    errorBudget: { remaining_pct: 90 },
    incidents: [],
    services: [{ id: 'x', status: 'operational' }],
  });
  assert.equal(s.level, 'operational');
});

// ─── XSS escaping ────────────────────────────────────────────────

test('service names are HTML-escaped', () => {
  const html = md.generateMasterDashboard({
    services: [{
      id: '<script>alert(1)</script>',
      name: '"><img src=x onerror=alert(1)>',
      nameHe: '&<>"\'',
      status: 'operational',
    }],
  });
  // Raw script tag must never appear
  assert.ok(!html.includes('<script>alert(1)</script>'), 'script tag neutralized');
  // No raw <img tag injected
  assert.ok(!html.includes('<img src=x'), 'img tag neutralized');
  // Verify the input was escaped to entity form
  assert.ok(html.includes('&lt;script&gt;'), 'script escaped to entities');
  assert.ok(html.includes('&amp;'), 'ampersand escaped');
  assert.ok(html.includes('&quot;'), 'quote escaped');
  assert.ok(html.includes('&#39;'), 'apostrophe escaped');
});

test('_escapeHtml handles edge cases', () => {
  assert.equal(md._escapeHtml(null), '');
  assert.equal(md._escapeHtml(undefined), '');
  assert.equal(md._escapeHtml(0), '0');
  assert.equal(md._escapeHtml(false), 'false');
  assert.equal(md._escapeHtml('<&>"\''), '&lt;&amp;&gt;&quot;&#39;');
});
