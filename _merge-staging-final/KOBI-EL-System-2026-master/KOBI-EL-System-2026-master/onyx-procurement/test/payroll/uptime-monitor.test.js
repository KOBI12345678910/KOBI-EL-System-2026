/**
 * Uptime Monitor — Unit Tests (Agent X-57)
 * Techno-Kol Uzi mega-ERP / Swarm 3D
 *
 * Run with:  node --test test/payroll/uptime-monitor.test.js
 *
 * 15+ test cases — zero external deps. Uses node:test + node:assert + a real
 * http.Server + net.Server so the full check pipeline (probe → sample →
 * state machine → downtime log → metrics → alerts) is exercised end-to-end.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const net = require('node:net');
const path = require('node:path');

const {
  createMonitor,
  MonitorEngine,
  CHECK_TYPES,
  STATUS,
  DEFAULT_SEED_MONITORS,
  probeHttp,
  probeTcp,
  probeDns,
  _percentile,
  _parseTarget,
  _inferType,
} = require(path.resolve(__dirname, '..', '..', 'src', 'ops', 'uptime-monitor.js'));

// ─────────────────────────────────────────────────────────────
// Test helpers
// ─────────────────────────────────────────────────────────────

function startHttpOk(body = 'ok', status = 200) {
  return new Promise((resolve) => {
    const server = http.createServer((_req, res) => {
      res.writeHead(status, { 'content-type': 'text/plain' });
      res.end(body);
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

function startHttpFlaky() {
  let count = 0;
  const server = http.createServer((_req, res) => {
    count++;
    // First two calls fail with 500, third succeeds.
    if (count <= 2) {
      res.writeHead(500);
      res.end('boom');
    } else {
      res.writeHead(200);
      res.end('ok');
    }
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

function startTcp() {
  return new Promise((resolve) => {
    const server = net.createServer((sock) => { sock.end(); });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

function closeSrv(srv) {
  return new Promise((resolve) => {
    if (!srv) return resolve();
    srv.close(() => resolve());
  });
}

function addr(srv) {
  const a = srv.address();
  return `http://127.0.0.1:${a.port}`;
}

// Fixed-clock engine — deterministic uptime %
function fixedClockEngine(opts = {}) {
  let t = opts.start || 1_700_000_000_000;
  const engine = createMonitor({
    clock: () => t,
    ...opts,
  });
  engine.tick = (ms) => { t += ms; return t; };
  engine.setTime = (v) => { t = v; };
  return engine;
}

// ─────────────────────────────────────────────────────────────
// 1. Registration
// ─────────────────────────────────────────────────────────────

test('register adds a monitor with defaults', () => {
  const e = createMonitor();
  e.register({ id: 'ex', url: 'https://example.com/' });
  const m = e.get('ex');
  assert.ok(m);
  assert.equal(m.type, CHECK_TYPES.HTTPS);
  assert.equal(m.interval >= 1000, true);
  assert.equal(m.status, STATUS.UNKNOWN);
  assert.deepEqual(e.list(), ['ex']);
});

// ─────────────────────────────────────────────────────────────
// 2. register() validates inputs
// ─────────────────────────────────────────────────────────────

test('register rejects missing id / url / unknown type', () => {
  const e = createMonitor();
  assert.throws(() => e.register({}), /id is required/);
  assert.throws(() => e.register({ id: 'x' }), /url is required/);
  assert.throws(() => e.register({ id: 'x', url: 'http://x', type: 'bogus' }), /unknown type/);
});

// ─────────────────────────────────────────────────────────────
// 3. HTTP check succeeds → UP
// ─────────────────────────────────────────────────────────────

test('HTTP probe: UP when server returns expected status', async () => {
  const srv = await startHttpOk('ok-onyx');
  try {
    const e = createMonitor();
    e.register({
      id: 'srv',
      url: addr(srv),
      type: CHECK_TYPES.HTTP,
      interval: 60_000,
      timeout: 2_000,
      expected_status: 200,
      body_contains: 'onyx',
      retries: 1,
    });
    const sample = await e.runCheck('srv');
    assert.equal(sample.up, true);
    assert.equal(sample.status, 200);
    const st = e.getStatus('srv');
    assert.equal(st.status, STATUS.UP);
    assert.equal(st.consecutive_failures, 0);
  } finally {
    await closeSrv(srv);
  }
});

// ─────────────────────────────────────────────────────────────
// 4. HTTP check — wrong body → DOWN
// ─────────────────────────────────────────────────────────────

test('HTTP probe: DOWN when body_contains does not match', async () => {
  const srv = await startHttpOk('hello-world');
  try {
    const e = createMonitor();
    e.register({
      id: 'srv',
      url: addr(srv),
      type: CHECK_TYPES.HTTP,
      body_contains: 'MISSING',
      retries: 1,
    });
    const sample = await e.runCheck('srv');
    assert.equal(sample.up, false);
    assert.match(String(sample.reason), /body_mismatch/);
  } finally {
    await closeSrv(srv);
  }
});

// ─────────────────────────────────────────────────────────────
// 5. HTTP check — wrong status → DOWN with reason
// ─────────────────────────────────────────────────────────────

test('HTTP probe: DOWN when status is unexpected', async () => {
  const srv = await startHttpOk('x', 503);
  try {
    const e = createMonitor();
    e.register({ id: 's', url: addr(srv), retries: 1 });
    const sample = await e.runCheck('s');
    assert.equal(sample.up, false);
    assert.match(String(sample.reason), /unexpected_status:503/);
  } finally {
    await closeSrv(srv);
  }
});

// ─────────────────────────────────────────────────────────────
// 6. expected_status can be an array
// ─────────────────────────────────────────────────────────────

test('HTTP probe: expected_status accepts an array', async () => {
  const srv = await startHttpOk('x', 302);
  try {
    const e = createMonitor();
    e.register({
      id: 's',
      url: addr(srv),
      expected_status: [200, 301, 302],
      retries: 1,
    });
    const sample = await e.runCheck('s');
    assert.equal(sample.up, true);
    assert.equal(sample.status, 302);
  } finally {
    await closeSrv(srv);
  }
});

// ─────────────────────────────────────────────────────────────
// 7. TCP probe — UP against a real socket
// ─────────────────────────────────────────────────────────────

test('TCP probe: UP against a live listener', async () => {
  const srv = await startTcp();
  try {
    const port = srv.address().port;
    const e = createMonitor();
    e.register({
      id: 'tcp',
      url: `127.0.0.1:${port}`,
      type: CHECK_TYPES.TCP,
      timeout: 2_000,
      retries: 1,
    });
    const sample = await e.runCheck('tcp');
    assert.equal(sample.up, true);
  } finally {
    await closeSrv(srv);
  }
});

// ─────────────────────────────────────────────────────────────
// 8. TCP probe — DOWN against a closed port
// ─────────────────────────────────────────────────────────────

test('TCP probe: DOWN against a closed port', async () => {
  const e = createMonitor();
  e.register({
    id: 'dead',
    url: '127.0.0.1:1',   // almost certainly closed
    type: CHECK_TYPES.TCP,
    timeout: 1_000,
    retries: 1,
  });
  const sample = await e.runCheck('dead');
  assert.equal(sample.up, false);
  assert.ok(String(sample.reason).startsWith('network:') || String(sample.reason) === 'timeout');
});

// ─────────────────────────────────────────────────────────────
// 9. DNS probe — UP for localhost
// ─────────────────────────────────────────────────────────────

test('DNS probe: resolves localhost', async () => {
  const e = createMonitor();
  e.register({
    id: 'dns',
    url: 'localhost',
    type: CHECK_TYPES.DNS,
    timeout: 3_000,
    retries: 1,
  });
  const sample = await e.runCheck('dns');
  assert.equal(sample.up, true);
  assert.ok(Array.isArray(sample.addresses));
  assert.ok(sample.addresses.length > 0);
});

// ─────────────────────────────────────────────────────────────
// 10. Retry logic — N consecutive failures → DOWN, recovery emits alert
// ─────────────────────────────────────────────────────────────

test('retry logic: DOWN after N consecutive failures and recovery alert on UP', async () => {
  const e = createMonitor();
  // Injected probes for deterministic failures
  let calls = 0;
  e.probeOverrides = {
    http: async () => {
      calls++;
      if (calls <= 3) return { up: false, latency: 1, status: 500, reason: 'unexpected_status:500' };
      return { up: true, latency: 2, status: 200, reason: null };
    },
  };
  e.register({ id: 'm', url: 'http://x/', type: CHECK_TYPES.HTTP, retries: 3 });

  const alerts = [];
  e.on('alert', (a) => alerts.push(a));

  await e.runCheck('m'); // 1st failure
  assert.equal(e.getStatus('m').status, STATUS.UNKNOWN);
  await e.runCheck('m'); // 2nd failure
  assert.equal(e.getStatus('m').status, STATUS.UNKNOWN);
  await e.runCheck('m'); // 3rd failure → DOWN
  assert.equal(e.getStatus('m').status, STATUS.DOWN);
  assert.equal(alerts.some((a) => a.type === 'monitor_down'), true);

  await e.runCheck('m'); // recovery
  assert.equal(e.getStatus('m').status, STATUS.UP);
  assert.equal(alerts.some((a) => a.type === 'monitor_recovered'), true);
});

// ─────────────────────────────────────────────────────────────
// 11. Downtime log is built when monitor recovers
// ─────────────────────────────────────────────────────────────

test('downtime log captures duration once monitor recovers', async () => {
  const e = fixedClockEngine();
  e.probeOverrides = {
    http: async () => (e._mockUp
      ? { up: true, latency: 5, status: 200 }
      : { up: false, latency: 1, status: 500, reason: 'fail' }),
  };
  e.register({ id: 'm', url: 'http://x/', type: CHECK_TYPES.HTTP, retries: 2 });

  e._mockUp = false;
  await e.runCheck('m');          // F
  e.tick(60_000);
  await e.runCheck('m');          // F → DOWN
  const downStart = e.get('m').current_downtime.started;
  assert.ok(downStart);

  e.tick(120_000);
  e._mockUp = true;
  await e.runCheck('m');          // recovery

  const hist = e.downtimeHistory('m', '24h');
  assert.equal(hist.length, 1);
  assert.equal(hist[0].duration_ms, 120_000);
  assert.equal(hist[0].monitor_id, 'm');
});

// ─────────────────────────────────────────────────────────────
// 12. Uptime percentage calculation over 24h
// ─────────────────────────────────────────────────────────────

test('getUptime computes uptime % from in-window samples', async () => {
  const e = fixedClockEngine();
  const m = {
    id: 'u',
    url: 'http://x/',
    type: CHECK_TYPES.HTTP,
    retries: 1,
  };
  e.register(m);
  // inject samples directly
  const rec = e.get('u');
  const t = e.clock();
  for (let i = 0; i < 10; i++) {
    rec.samples.push({ ts: t - i * 1000, up: i % 2 === 0, latency: 10, status: 200 });
  }
  assert.equal(e.getUptime('u', '24h'), 50);
});

// ─────────────────────────────────────────────────────────────
// 13. Latency percentiles P50/P95/P99
// ─────────────────────────────────────────────────────────────

test('getLatency returns percentiles and pure percentile helper works', () => {
  const e = fixedClockEngine();
  e.register({ id: 'l', url: 'http://x/', type: CHECK_TYPES.HTTP });
  const rec = e.get('l');
  const t = e.clock();
  for (let i = 1; i <= 100; i++) {
    rec.samples.push({ ts: t - i * 1000, up: true, latency: i, status: 200 });
  }
  const lat = e.getLatency('l', '24h');
  assert.equal(lat.samples, 100);
  assert.equal(lat.p50, 50);
  assert.equal(lat.p95, 95);
  assert.equal(lat.p99, 99);
  assert.equal(_percentile([1, 2, 3, 4, 5], 50), 3);
});

// ─────────────────────────────────────────────────────────────
// 14. Maintenance windows suppress downtime scoring and alerts
// ─────────────────────────────────────────────────────────────

test('maintenance windows suppress probing and keep uptime clean', async () => {
  const e = fixedClockEngine();
  const alerts = [];
  e.on('alert', (a) => alerts.push(a));
  e.probeOverrides = {
    http: async () => ({ up: false, latency: 1, status: 0, reason: 'down' }),
  };
  e.register({ id: 'm', url: 'http://x/', type: CHECK_TYPES.HTTP, retries: 1 });

  const t = e.clock();
  e.scheduleMaintenance('m', { from: t - 1000, to: t + 60_000, reason: 'deploy' });

  const sample = await e.runCheck('m');
  assert.equal(sample.status, STATUS.MAINTENANCE);
  assert.equal(e.getStatus('m').in_maintenance, true);
  // should NOT have emitted a monitor_down alert while in maintenance
  assert.equal(alerts.some((a) => a.type === 'monitor_down'), false);
  // Maintenance samples are excluded from uptime denominator
  assert.equal(e.getUptime('m', '24h'), 100);
});

// ─────────────────────────────────────────────────────────────
// 15. Status-change webhook is invoked on transition
// ─────────────────────────────────────────────────────────────

test('status_change event fires on DOWN and recovery transitions', async () => {
  const events = [];
  const e = createMonitor();
  e.on('status_change', (p) => events.push(p));
  e.probeOverrides = {
    http: async () => (e._up ? { up: true, latency: 1, status: 200 } : { up: false, latency: 1, status: 0, reason: 'x' }),
  };
  e.register({ id: 'w', url: 'http://x/', type: CHECK_TYPES.HTTP, retries: 1 });

  e._up = false;
  await e.runCheck('w'); // → DOWN
  e._up = true;
  await e.runCheck('w'); // → UP

  const froms = events.map((ev) => ev.from + '->' + ev.to);
  assert.ok(froms.includes('unknown->down'));
  assert.ok(froms.includes('down->up'));
  for (const ev of events) {
    assert.ok(ev.messages.he && ev.messages.en, 'bilingual messages required');
  }
});

// ─────────────────────────────────────────────────────────────
// 16. Metrics snapshot is Prometheus-shaped
// ─────────────────────────────────────────────────────────────

test('metrics snapshot exposes uptime_monitor_up + latency labels', async () => {
  const e = createMonitor({ region: 'il-tlv' });
  e.probeOverrides = {
    http: async () => ({ up: true, latency: 42, status: 200 }),
  };
  e.register({ id: 'z', url: 'http://x/', type: CHECK_TYPES.HTTP });
  const metricsSink = [];
  e.metricsSink = (snap) => metricsSink.push(snap);
  await e.runCheck('z');
  assert.ok(metricsSink.length > 0);
  const last = metricsSink[metricsSink.length - 1];
  assert.equal(last.uptime_monitor_up.value, 1);
  assert.equal(last.uptime_monitor_latency_ms.value, 42);
  assert.equal(last.uptime_monitor_up.labels.region, 'il-tlv');

  const snap = e.snapshotMetrics();
  assert.equal(snap[0].id, 'z');
  assert.equal(snap[0].up, 1);
});

// ─────────────────────────────────────────────────────────────
// 17. Cert expiring soon emits a warning without flipping status
// ─────────────────────────────────────────────────────────────

test('cert_days_left ≤ warn threshold emits cert_expiring_soon alert', async () => {
  const alerts = [];
  const e = createMonitor();
  e.on('alert', (a) => alerts.push(a));
  e.probeOverrides = {
    https: async () => ({ up: true, latency: 1, status: 200, cert_days_left: 3 }),
  };
  e.register({
    id: 'c',
    url: 'https://x/',
    type: CHECK_TYPES.HTTPS,
    cert_warn_days: 7,
    retries: 1,
  });
  await e.runCheck('c');
  const certAlert = alerts.find((a) => a.type === 'cert_expiring_soon');
  assert.ok(certAlert);
  assert.equal(certAlert.days_left, 3);
  assert.equal(certAlert.severity, 'critical');
  assert.equal(e.getStatus('c').status, STATUS.UP); // status unchanged
});

// ─────────────────────────────────────────────────────────────
// 18. Alert manager hook is invoked
// ─────────────────────────────────────────────────────────────

test('alertManager.emit/fire hooks fire on status change', async () => {
  const fired = [];
  const am = { emit: (a) => fired.push(['emit', a]), fire: (a) => fired.push(['fire', a]) };
  const e = createMonitor({ alertManager: am });
  e.probeOverrides = {
    http: async () => ({ up: false, latency: 1, status: 500, reason: 'bad' }),
  };
  e.register({ id: 'a', url: 'http://x/', type: CHECK_TYPES.HTTP, retries: 1 });
  await e.runCheck('a');
  const downAlerts = fired.filter(([_, a]) => a.type === 'monitor_down');
  assert.ok(downAlerts.length >= 1);
  // both emit and fire are invoked
  assert.ok(downAlerts.some(([k]) => k === 'emit'));
  assert.ok(downAlerts.some(([k]) => k === 'fire'));
});

// ─────────────────────────────────────────────────────────────
// 19. Multi-region stub — each engine tags its region label
// ─────────────────────────────────────────────────────────────

test('multi-region stub: two engines produce distinct region labels', async () => {
  const tlv = createMonitor({ region: 'il-tlv' });
  const fra = createMonitor({ region: 'eu-fra' });
  const make = async (engine) => {
    engine.probeOverrides = { http: async () => ({ up: true, latency: 1, status: 200 }) };
    engine.register({ id: 'm', url: 'http://x/', type: CHECK_TYPES.HTTP });
    return engine.runCheck('m');
  };
  const [a, b] = await Promise.all([make(tlv), make(fra)]);
  assert.equal(a.region, 'il-tlv');
  assert.equal(b.region, 'eu-fra');
  const snap1 = tlv.snapshotMetrics();
  const snap2 = fra.snapshotMetrics();
  assert.equal(snap1[0].region, 'il-tlv');
  assert.equal(snap2[0].region, 'eu-fra');
});

// ─────────────────────────────────────────────────────────────
// 20. Default seed monitors cover all required targets
// ─────────────────────────────────────────────────────────────

test('default seed monitors include the mandatory set', () => {
  const ids = DEFAULT_SEED_MONITORS.map((m) => m.id);
  for (const must of ['self-healthz', 'tax-authority', 'boi-currency', 'gmail-smtp', 'supabase']) {
    assert.ok(ids.includes(must), 'missing seed: ' + must);
  }
  const e = createMonitor();
  e.seedDefaults();
  assert.equal(e.list().length, DEFAULT_SEED_MONITORS.length);
});

// ─────────────────────────────────────────────────────────────
// 21. scheduleMaintenance validates the window range
// ─────────────────────────────────────────────────────────────

test('scheduleMaintenance rejects invalid ranges', () => {
  const e = createMonitor();
  e.register({ id: 'x', url: 'http://x/' });
  assert.throws(() => e.scheduleMaintenance('x', null), /{from, to}/);
  assert.throws(() => e.scheduleMaintenance('x', { from: 100, to: 50 }), /invalid window/);
  assert.throws(() => e.scheduleMaintenance('unknown', { from: 1, to: 2 }), /unknown monitor/);

  const t = Date.now();
  e.scheduleMaintenance('x', { from: t, to: t + 60_000, reason: 'upgrade' });
  assert.equal(e.get('x').maintenance_windows.length, 1);
});

// ─────────────────────────────────────────────────────────────
// 22. Helpers: parseTarget, inferType, full HTTP round-trip via real server
// ─────────────────────────────────────────────────────────────

test('helpers: parseTarget + inferType + real HTTP round-trip', async () => {
  // parseTarget
  const p1 = _parseTarget('https://example.com:8443/p?q=1', CHECK_TYPES.HTTPS);
  assert.equal(p1.host, 'example.com');
  assert.equal(p1.port, 8443);
  assert.equal(p1.pathname, '/p');

  const p2 = _parseTarget('smtp.gmail.com:587', CHECK_TYPES.TCP);
  assert.equal(p2.host, 'smtp.gmail.com');
  assert.equal(p2.port, 587);

  // inferType
  assert.equal(_inferType('https://a'), CHECK_TYPES.HTTPS);
  assert.equal(_inferType('http://a'), CHECK_TYPES.HTTP);
  assert.equal(_inferType('host:25'), CHECK_TYPES.TCP);
  assert.equal(_inferType(undefined), CHECK_TYPES.HTTP);

  // real HTTP round-trip via the exported probeHttp helper
  const srv = await startHttpOk('onyx-ok');
  try {
    const res = await probeHttp(addr(srv), {
      type: CHECK_TYPES.HTTP,
      timeout: 2_000,
      expected_status: 200,
      body_contains: 'onyx',
    });
    assert.equal(res.up, true);
    assert.equal(res.status, 200);
    assert.ok(res.latency >= 0);
  } finally {
    await closeSrv(srv);
  }
});

// ─────────────────────────────────────────────────────────────
// 23. start() / stop() schedule + unschedule timers safely
// ─────────────────────────────────────────────────────────────

test('start/stop manage timers without crashing', () => {
  const e = createMonitor();
  e.register({ id: 'a', url: 'http://127.0.0.1:1/', interval: 1000, retries: 1 });
  e.start();
  assert.equal(e.running, true);
  assert.equal(e.timers.size, 1);
  e.stop();
  assert.equal(e.running, false);
  assert.equal(e.timers.size, 0);
});
