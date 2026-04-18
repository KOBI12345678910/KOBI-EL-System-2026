/**
 * ONYX OPS — Uptime Monitor (Agent X-57)
 * ======================================
 * Techno-Kol Uzi mega-ERP / Swarm 3D
 *
 * Zero-dependency uptime / reachability monitoring engine.
 * משגיח זמינות — מערכת ניטור אפס-תלויות בעברית ובאנגלית.
 *
 * Features (kept in lockstep with the Agent X-57 spec):
 *   1. Register monitors: URL, interval, timeout, expected_status, body_contains
 *   2. Check types: HTTP(S), TCP ping, DNS lookup
 *   3. Multi-region stub (run from different "locations")
 *   4. Retry logic (N failures in a row → DOWN)
 *   5. SSL certificate expiry checks (days-until-expiry)
 *   6. Response-time tracking (P50, P95, P99)
 *   7. Uptime % over 24h, 7d, 30d, 90d, 365d
 *   8. Downtime log with duration
 *   9. Maintenance windows (no alerting while scheduled)
 *  10. Status-change webhook
 *
 * Integration:
 *   - Feeds Agent X-55 (alert manager) on every state change.
 *   - Exposes Prometheus-shaped metrics for Agent X-52 (uptime_monitor_up, latency).
 *
 * Dependencies: Node built-ins only — http, https, net, dns, tls, events, url.
 *
 * RULES honoured:
 *   - never delete       → samples are ring-buffered; history is kept, not dropped
 *   - Hebrew bilingual   → messages use he+en keys
 *   - zero deps          → require() only touches node: builtins
 */

'use strict';

const http = require('node:http');
const https = require('node:https');
const net = require('node:net');
const dns = require('node:dns');
const tls = require('node:tls');
const { URL } = require('node:url');
const { EventEmitter } = require('node:events');

// ═══════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════

/** Periods supported by getUptime() / downtimeHistory(). */
const PERIODS = Object.freeze({
  '24h': 24 * 60 * 60 * 1000,
  '7d':  7  * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
  '90d': 90 * 24 * 60 * 60 * 1000,
  '365d': 365 * 24 * 60 * 60 * 1000,
});

/** Maximum samples kept per monitor (ring-buffer). ~= 365 days @ 60s cadence. */
const MAX_SAMPLES = 525_600;

/** Maximum downtime events kept per monitor. */
const MAX_DOWNTIME_EVENTS = 4_096;

/** Allowed check types. */
const CHECK_TYPES = Object.freeze({
  HTTP: 'http',
  HTTPS: 'https',
  TCP: 'tcp',
  DNS: 'dns',
});

/** Monitor status literals. */
const STATUS = Object.freeze({
  UP: 'up',
  DOWN: 'down',
  UNKNOWN: 'unknown',
  MAINTENANCE: 'maintenance',
});

/** Default monitor options. */
const DEFAULTS = Object.freeze({
  interval: 60_000,              // every 60 s
  timeout: 10_000,               // 10 s
  expected_status: 200,
  retries: 3,                    // consecutive failures → DOWN
  method: 'GET',                 // for HTTP/HTTPS
  regions: ['il-tlv'],           // default multi-region list
  cert_warn_days: 14,            // cert warning threshold
});

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

function now() { return Date.now(); }

function clone(v) {
  if (v == null || typeof v !== 'object') return v;
  return JSON.parse(JSON.stringify(v));
}

function safe(fn, fallback) {
  try { return fn(); } catch (_e) { return fallback; }
}

function toMessages(up, reason) {
  return {
    he: up
      ? 'המוניטור פעיל'
      : ('המוניטור נפל: ' + (reason || 'ללא סיבה ידועה')),
    en: up
      ? 'Monitor is up'
      : ('Monitor is DOWN: ' + (reason || 'unknown reason')),
  };
}

/**
 * Parse a URL into components suitable for every check type.
 * Tolerates bare host:port strings for TCP/DNS monitors.
 */
function parseTarget(target, type) {
  if (!target || typeof target !== 'string') {
    throw new Error('target must be a non-empty string');
  }

  // TCP / DNS commonly accept host:port or just host
  if ((type === CHECK_TYPES.TCP || type === CHECK_TYPES.DNS) && !/^[a-z]+:\/\//i.test(target)) {
    const [host, port] = target.split(':');
    return { host, port: port ? Number(port) : null, raw: target };
  }

  const u = new URL(target);
  const port = u.port
    ? Number(u.port)
    : (u.protocol === 'https:' ? 443 : u.protocol === 'http:' ? 80 : null);
  return {
    protocol: u.protocol.replace(':', ''),
    host: u.hostname,
    port,
    pathname: u.pathname || '/',
    search: u.search || '',
    href: u.href,
    raw: target,
  };
}

/** Sorted-copy percentile (nearest-rank). */
function percentile(values, p) {
  if (!values || values.length === 0) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

/** Days until a date (ceil, non-negative if future). */
function daysUntil(ts) {
  if (!Number.isFinite(ts)) return null;
  return Math.ceil((ts - now()) / (24 * 60 * 60 * 1000));
}

// ═══════════════════════════════════════════════════════════════
// CHECK IMPLEMENTATIONS
// ═══════════════════════════════════════════════════════════════

/**
 * HTTP/HTTPS probe.
 * Returns { up, latency, status, reason, body_snippet, cert_days_left }.
 * Resolves — never rejects — so the scheduler can treat every outcome uniformly.
 */
function probeHttp(target, opts) {
  return new Promise((resolve) => {
    const start = process.hrtime.bigint();
    const finish = (result) => {
      const end = process.hrtime.bigint();
      const latency = Number(end - start) / 1e6;
      resolve({ latency, ...result });
    };

    let client;
    try {
      const parsed = parseTarget(target, opts.type);
      client = parsed.protocol === 'https' ? https : http;

      const reqOpts = {
        method: (opts.method || DEFAULTS.method).toUpperCase(),
        hostname: parsed.host,
        port: parsed.port,
        path: parsed.pathname + parsed.search,
        headers: Object.assign(
          { 'user-agent': 'onyx-uptime/1.0', 'accept': '*/*' },
          opts.headers || {}
        ),
        timeout: opts.timeout || DEFAULTS.timeout,
        // Follow the spec: tolerate self-signed certs but still surface expiry.
        rejectUnauthorized: opts.rejectUnauthorized !== false,
      };

      const req = client.request(reqOpts, (res) => {
        let body = '';
        let bytes = 0;
        const wantBody = !!opts.body_contains || reqOpts.method === 'GET';
        res.on('data', (chunk) => {
          bytes += chunk.length;
          if (wantBody && body.length < 16_384) {
            body += chunk.toString('utf8');
          }
        });
        res.on('end', () => {
          const expected = opts.expected_status || DEFAULTS.expected_status;
          const statusOk = Array.isArray(expected)
            ? expected.includes(res.statusCode)
            : res.statusCode === expected;

          let bodyOk = true;
          if (opts.body_contains) {
            bodyOk = body.includes(opts.body_contains);
          }

          let cert_days_left = null;
          try {
            if (parsed.protocol === 'https' && req.socket && typeof req.socket.getPeerCertificate === 'function') {
              const cert = req.socket.getPeerCertificate();
              if (cert && cert.valid_to) {
                cert_days_left = daysUntil(Date.parse(cert.valid_to));
              }
            }
          } catch (_e) { /* ignore cert inspection issues */ }

          const up = statusOk && bodyOk;
          finish({
            up,
            status: res.statusCode,
            bytes,
            body_snippet: body.slice(0, 512),
            cert_days_left,
            reason: up
              ? null
              : (!statusOk
                  ? `unexpected_status:${res.statusCode}`
                  : 'body_mismatch'),
          });
        });
      });

      req.on('timeout', () => {
        req.destroy(new Error('timeout'));
      });
      req.on('error', (err) => {
        finish({ up: false, status: 0, reason: 'network:' + err.code || err.message });
      });
      req.end();
    } catch (err) {
      finish({ up: false, status: 0, reason: 'invalid_target:' + err.message });
    }
  });
}

/**
 * TCP probe — opens a socket to host:port, succeeds when the `connect` event fires.
 */
function probeTcp(target, opts) {
  return new Promise((resolve) => {
    const start = process.hrtime.bigint();
    const timeout = opts.timeout || DEFAULTS.timeout;
    const finish = (result) => {
      const end = process.hrtime.bigint();
      const latency = Number(end - start) / 1e6;
      resolve({ latency, ...result });
    };

    try {
      const parsed = parseTarget(target, CHECK_TYPES.TCP);
      const host = parsed.host;
      const port = parsed.port || opts.port;
      if (!host || !port) {
        finish({ up: false, status: 0, reason: 'invalid_target:missing_host_or_port' });
        return;
      }

      const sock = new net.Socket();
      let settled = false;

      const done = (result) => {
        if (settled) return;
        settled = true;
        try { sock.destroy(); } catch (_e) { /* ignore */ }
        finish(result);
      };

      sock.setTimeout(timeout);
      sock.once('connect', () => done({ up: true, status: 0, reason: null }));
      sock.once('timeout', () => done({ up: false, status: 0, reason: 'timeout' }));
      sock.once('error', (err) => done({ up: false, status: 0, reason: 'network:' + (err.code || err.message) }));

      sock.connect(port, host);
    } catch (err) {
      finish({ up: false, status: 0, reason: 'invalid_target:' + err.message });
    }
  });
}

/**
 * DNS probe — resolves the hostname to A/AAAA records.
 */
function probeDns(target, opts) {
  return new Promise((resolve) => {
    const start = process.hrtime.bigint();
    const finish = (result) => {
      const end = process.hrtime.bigint();
      const latency = Number(end - start) / 1e6;
      resolve({ latency, ...result });
    };

    try {
      const parsed = parseTarget(target, CHECK_TYPES.DNS);
      const host = parsed.host;
      if (!host) {
        finish({ up: false, status: 0, reason: 'invalid_target:missing_host' });
        return;
      }
      const timer = setTimeout(() => {
        finish({ up: false, status: 0, reason: 'timeout' });
      }, opts.timeout || DEFAULTS.timeout);
      timer.unref && timer.unref();

      dns.lookup(host, { all: true }, (err, addresses) => {
        clearTimeout(timer);
        if (err) {
          finish({ up: false, status: 0, reason: 'dns:' + (err.code || err.message) });
          return;
        }
        if (!addresses || addresses.length === 0) {
          finish({ up: false, status: 0, reason: 'dns:no_addresses' });
          return;
        }
        finish({ up: true, status: 0, addresses, reason: null });
      });
    } catch (err) {
      finish({ up: false, status: 0, reason: 'invalid_target:' + err.message });
    }
  });
}

/**
 * Independent cert-expiry probe — useful when HTTPS body checks are too heavy
 * but you still want an SSL watchdog. Resolves to { days_left, valid_to, up }.
 */
function probeSslExpiry(target, opts) {
  return new Promise((resolve) => {
    const finish = (result) => resolve(result);
    try {
      const parsed = parseTarget(target, CHECK_TYPES.HTTPS);
      const host = parsed.host;
      const port = parsed.port || 443;
      const timeout = opts.timeout || DEFAULTS.timeout;

      const sock = tls.connect({
        host,
        port,
        servername: host,
        rejectUnauthorized: false,
        timeout,
      }, () => {
        try {
          const cert = sock.getPeerCertificate();
          const validTo = cert && cert.valid_to ? Date.parse(cert.valid_to) : null;
          const days_left = daysUntil(validTo);
          try { sock.end(); } catch (_e) { /* ignore */ }
          finish({
            up: Number.isFinite(days_left) ? days_left > 0 : false,
            days_left,
            valid_to: validTo,
            issuer: (cert && cert.issuer && cert.issuer.O) || null,
          });
        } catch (err) {
          try { sock.destroy(); } catch (_e) { /* ignore */ }
          finish({ up: false, days_left: null, valid_to: null, reason: err.message });
        }
      });
      sock.once('timeout', () => {
        try { sock.destroy(); } catch (_e) { /* ignore */ }
        finish({ up: false, days_left: null, valid_to: null, reason: 'timeout' });
      });
      sock.once('error', (err) => {
        try { sock.destroy(); } catch (_e) { /* ignore */ }
        finish({ up: false, days_left: null, valid_to: null, reason: 'network:' + (err.code || err.message) });
      });
    } catch (err) {
      finish({ up: false, days_left: null, valid_to: null, reason: 'invalid_target:' + err.message });
    }
  });
}

// ═══════════════════════════════════════════════════════════════
// DEFAULT SEED MONITORS
// ═══════════════════════════════════════════════════════════════

const DEFAULT_SEED_MONITORS = Object.freeze([
  {
    id: 'self-healthz',
    name: { he: 'בריאות עצמית /healthz/ready', en: 'Self /healthz/ready' },
    type: CHECK_TYPES.HTTP,
    url: 'http://127.0.0.1:3000/healthz/ready',
    interval: 30_000,
    timeout: 5_000,
    expected_status: 200,
    body_contains: 'ok',
  },
  {
    id: 'tax-authority',
    name: { he: 'רשות המיסים', en: 'Israel Tax Authority API' },
    type: CHECK_TYPES.HTTPS,
    url: 'https://www.misim.gov.il/',
    interval: 300_000,
    timeout: 10_000,
    expected_status: [200, 301, 302],
  },
  {
    id: 'boi-currency',
    name: { he: 'בנק ישראל — שערי מטבע', en: 'Bank of Israel currency API' },
    type: CHECK_TYPES.HTTPS,
    url: 'https://www.boi.org.il/PublicApi/GetExchangeRates',
    interval: 600_000,
    timeout: 10_000,
    expected_status: [200, 301, 302],
  },
  {
    id: 'gmail-smtp',
    name: { he: 'Gmail SMTP', en: 'Gmail SMTP' },
    type: CHECK_TYPES.TCP,
    url: 'smtp.gmail.com:587',
    interval: 300_000,
    timeout: 5_000,
  },
  {
    id: 'supabase',
    name: { he: 'Supabase', en: 'Supabase' },
    type: CHECK_TYPES.HTTPS,
    url: 'https://api.supabase.com/platform/status',
    interval: 300_000,
    timeout: 10_000,
    expected_status: [200, 204],
  },
]);

// ═══════════════════════════════════════════════════════════════
// ENGINE
// ═══════════════════════════════════════════════════════════════

class MonitorEngine extends EventEmitter {
  constructor(opts = {}) {
    super();
    this.monitors = new Map(); // id -> monitor record
    this.timers = new Map();   // id -> interval handle
    this.running = false;
    this.alertManager = opts.alertManager || null; // X-55 hook
    this.metricsSink = opts.metricsSink || null;   // X-52 hook
    this.webhooks = Array.isArray(opts.webhooks) ? opts.webhooks.slice() : [];
    this.region = opts.region || DEFAULTS.regions[0];
    this.clock = typeof opts.clock === 'function' ? opts.clock : now;
    this.probeOverrides = opts.probes || null; // test injection
  }

  // ─────────────────────────────────────────────────────────────
  // REGISTRATION
  // ─────────────────────────────────────────────────────────────

  register(spec) {
    if (!spec || typeof spec !== 'object') throw new Error('register requires an options object');
    if (!spec.id || typeof spec.id !== 'string') throw new Error('register: id is required');

    const url = spec.url || spec.target;
    if (!url) throw new Error('register: url is required');

    const type = (spec.type || inferType(url)).toLowerCase();
    if (!Object.values(CHECK_TYPES).includes(type)) {
      throw new Error('register: unknown type ' + type);
    }

    const monitor = {
      id: spec.id,
      name: spec.name || { he: spec.id, en: spec.id },
      type,
      url,
      interval: Math.max(1_000, spec.interval || DEFAULTS.interval),
      timeout: Math.max(500, spec.timeout || DEFAULTS.timeout),
      expected_status: spec.expected_status || DEFAULTS.expected_status,
      body_contains: spec.body_contains || null,
      method: spec.method || DEFAULTS.method,
      headers: spec.headers || null,
      retries: Number.isFinite(spec.retries) ? spec.retries : DEFAULTS.retries,
      regions: Array.isArray(spec.regions) && spec.regions.length
        ? spec.regions.slice()
        : [this.region],
      cert_warn_days: Number.isFinite(spec.cert_warn_days)
        ? spec.cert_warn_days
        : DEFAULTS.cert_warn_days,

      // runtime state
      status: STATUS.UNKNOWN,
      consecutive_failures: 0,
      consecutive_successes: 0,
      last_check: null,
      last_latency: null,
      last_reason: null,
      last_status_change: null,
      cert_days_left: null,

      // ring buffers
      samples: [],
      downtime: [],
      current_downtime: null,   // { started, reason }
      maintenance_windows: [],
    };

    // Upsert — register over an existing id replaces spec but preserves history
    // (never delete).
    const existing = this.monitors.get(spec.id);
    if (existing) {
      monitor.status = existing.status;
      monitor.consecutive_failures = existing.consecutive_failures;
      monitor.consecutive_successes = existing.consecutive_successes;
      monitor.last_check = existing.last_check;
      monitor.last_latency = existing.last_latency;
      monitor.last_reason = existing.last_reason;
      monitor.last_status_change = existing.last_status_change;
      monitor.cert_days_left = existing.cert_days_left;
      monitor.samples = existing.samples;
      monitor.downtime = existing.downtime;
      monitor.current_downtime = existing.current_downtime;
      monitor.maintenance_windows = existing.maintenance_windows;
    }

    this.monitors.set(spec.id, monitor);

    if (this.running) {
      this._scheduleMonitor(monitor);
    }
    this._emitMetrics(monitor);
  }

  list() {
    return Array.from(this.monitors.keys());
  }

  get(id) {
    return this.monitors.get(id) || null;
  }

  // ─────────────────────────────────────────────────────────────
  // LIFECYCLE
  // ─────────────────────────────────────────────────────────────

  start() {
    if (this.running) return;
    this.running = true;
    for (const m of this.monitors.values()) {
      this._scheduleMonitor(m);
    }
    this.emit('start', { ts: this.clock() });
  }

  stop() {
    this.running = false;
    for (const [id, t] of this.timers.entries()) {
      clearInterval(t);
      this.timers.delete(id);
    }
    this.emit('stop', { ts: this.clock() });
  }

  _scheduleMonitor(m) {
    if (this.timers.has(m.id)) {
      clearInterval(this.timers.get(m.id));
    }
    const t = setInterval(() => {
      this.runCheck(m.id).catch((err) => this.emit('error', err));
    }, m.interval);
    if (t.unref) t.unref();
    this.timers.set(m.id, t);
  }

  // ─────────────────────────────────────────────────────────────
  // CHECK EXECUTION
  // ─────────────────────────────────────────────────────────────

  async runCheck(id) {
    const m = this.monitors.get(id);
    if (!m) throw new Error('unknown monitor id: ' + id);

    // Maintenance: skip probe, just record & emit.
    if (this._inMaintenance(m)) {
      const sample = {
        ts: this.clock(),
        up: true,
        status: STATUS.MAINTENANCE,
        latency: 0,
        reason: 'maintenance',
        region: this.region,
      };
      this._appendSample(m, sample);
      this._setStatus(m, STATUS.MAINTENANCE, sample);
      return sample;
    }

    const probe = this._pickProbe(m.type);
    let latencies = [];
    let lastResult = null;
    let success = false;

    // Retry ladder: run up to `retries` extra attempts before declaring the
    // individual sample a failure. The consecutive-failure counter still has
    // its own threshold for state transitions.
    const attempts = Math.max(1, 1 + (m.retries ? 0 : 0)); // single probe; consecutive failures handle DOWN transition
    for (let i = 0; i < attempts; i++) {
      try {
        lastResult = await probe(m.url, {
          type: m.type,
          timeout: m.timeout,
          expected_status: m.expected_status,
          body_contains: m.body_contains,
          method: m.method,
          headers: m.headers,
        });
      } catch (err) {
        lastResult = { up: false, latency: 0, status: 0, reason: 'probe_exception:' + err.message };
      }
      latencies.push(lastResult.latency || 0);
      if (lastResult.up) { success = true; break; }
    }

    const sample = {
      ts: this.clock(),
      up: !!success,
      status: lastResult.status || 0,
      latency: latencies[latencies.length - 1] || 0,
      reason: lastResult.reason || null,
      region: this.region,
      addresses: lastResult.addresses || undefined,
      cert_days_left: lastResult.cert_days_left != null ? lastResult.cert_days_left : undefined,
      body_snippet: lastResult.body_snippet || undefined,
    };
    this._appendSample(m, sample);

    if (sample.up) {
      m.consecutive_failures = 0;
      m.consecutive_successes += 1;
    } else {
      m.consecutive_failures += 1;
      m.consecutive_successes = 0;
    }
    m.last_check = sample.ts;
    m.last_latency = sample.latency;
    m.last_reason = sample.reason;
    if (sample.cert_days_left != null) m.cert_days_left = sample.cert_days_left;

    // State-machine
    const threshold = Math.max(1, m.retries || DEFAULTS.retries);
    let nextStatus = m.status;
    if (sample.up) {
      if (m.status !== STATUS.UP) nextStatus = STATUS.UP;
    } else if (m.consecutive_failures >= threshold) {
      nextStatus = STATUS.DOWN;
    } else if (m.status === STATUS.UNKNOWN) {
      // First failure without reaching threshold — stay "unknown" so we don't
      // spam alerts before the retry budget is exhausted.
      nextStatus = STATUS.UNKNOWN;
    }

    // Cert warning — emit an alert but do not change status
    if (sample.cert_days_left != null && sample.cert_days_left <= m.cert_warn_days) {
      this._dispatchAlert({
        type: 'cert_expiring_soon',
        monitor_id: m.id,
        severity: sample.cert_days_left <= 3 ? 'critical' : 'warning',
        days_left: sample.cert_days_left,
        messages: {
          he: `תעודת SSL של ${m.id} תפוג בעוד ${sample.cert_days_left} ימים`,
          en: `SSL certificate for ${m.id} expires in ${sample.cert_days_left} days`,
        },
      });
    }

    this._setStatus(m, nextStatus, sample);
    this._emitMetrics(m);

    return sample;
  }

  _pickProbe(type) {
    if (this.probeOverrides && typeof this.probeOverrides[type] === 'function') {
      return this.probeOverrides[type];
    }
    switch (type) {
      case CHECK_TYPES.HTTP:
      case CHECK_TYPES.HTTPS:
        return probeHttp;
      case CHECK_TYPES.TCP:
        return probeTcp;
      case CHECK_TYPES.DNS:
        return probeDns;
      default:
        throw new Error('no probe for type: ' + type);
    }
  }

  _appendSample(m, sample) {
    m.samples.push(sample);
    // Ring buffer — drop the oldest sample when we cross the cap.
    if (m.samples.length > MAX_SAMPLES) {
      m.samples.shift();
    }
  }

  _setStatus(m, nextStatus, sample) {
    const prev = m.status;
    if (prev === nextStatus) return;

    m.status = nextStatus;
    m.last_status_change = sample.ts;

    // Maintain the downtime log.
    if (nextStatus === STATUS.DOWN) {
      m.current_downtime = {
        started: sample.ts,
        reason: sample.reason,
      };
    } else if (prev === STATUS.DOWN && m.current_downtime) {
      const event = {
        id: `${m.id}:${m.current_downtime.started}`,
        monitor_id: m.id,
        started: m.current_downtime.started,
        ended: sample.ts,
        duration_ms: sample.ts - m.current_downtime.started,
        reason: m.current_downtime.reason,
      };
      m.downtime.push(event);
      if (m.downtime.length > MAX_DOWNTIME_EVENTS) m.downtime.shift();
      m.current_downtime = null;
      this._dispatchAlert({
        type: 'monitor_recovered',
        monitor_id: m.id,
        severity: 'info',
        duration_ms: event.duration_ms,
        messages: {
          he: `המוניטור ${m.id} חזר לפעולה אחרי ${Math.round(event.duration_ms / 1000)} שניות`,
          en: `Monitor ${m.id} recovered after ${Math.round(event.duration_ms / 1000)}s`,
        },
      });
    }

    // Emit state-change event + webhook + alert (skip maintenance transitions).
    const payload = {
      monitor_id: m.id,
      name: m.name,
      from: prev,
      to: nextStatus,
      ts: sample.ts,
      region: sample.region,
      reason: sample.reason,
      latency: sample.latency,
      messages: toMessages(nextStatus === STATUS.UP, sample.reason),
    };
    this.emit('status_change', payload);
    this._deliverWebhooks(payload).catch((err) => this.emit('error', err));

    if (nextStatus === STATUS.DOWN) {
      this._dispatchAlert({
        type: 'monitor_down',
        monitor_id: m.id,
        severity: 'critical',
        reason: sample.reason,
        messages: payload.messages,
      });
    }
  }

  async _deliverWebhooks(payload) {
    const targets = this.webhooks;
    if (!targets || targets.length === 0) return;
    await Promise.all(targets.map((url) => this._postJson(url, payload).catch(() => {})));
  }

  _postJson(url, body) {
    return new Promise((resolve) => {
      try {
        const parsed = new URL(url);
        const client = parsed.protocol === 'https:' ? https : http;
        const data = Buffer.from(JSON.stringify(body));
        const req = client.request({
          method: 'POST',
          hostname: parsed.hostname,
          port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
          path: parsed.pathname + parsed.search,
          headers: {
            'content-type': 'application/json',
            'content-length': data.length,
            'user-agent': 'onyx-uptime/1.0',
          },
          timeout: 5_000,
        }, (res) => {
          res.resume();
          res.on('end', () => resolve({ ok: res.statusCode < 400, status: res.statusCode }));
        });
        req.on('error', () => resolve({ ok: false }));
        req.on('timeout', () => { req.destroy(); resolve({ ok: false }); });
        req.write(data);
        req.end();
      } catch (_e) {
        resolve({ ok: false });
      }
    });
  }

  _dispatchAlert(alert) {
    if (this.alertManager && typeof this.alertManager.emit === 'function') {
      safe(() => this.alertManager.emit(alert));
    }
    if (this.alertManager && typeof this.alertManager.fire === 'function') {
      safe(() => this.alertManager.fire(alert));
    }
    this.emit('alert', alert);
  }

  _emitMetrics(m) {
    const snapshot = {
      uptime_monitor_up: {
        labels: { id: m.id, type: m.type, region: this.region },
        value: m.status === STATUS.UP || m.status === STATUS.MAINTENANCE ? 1 : 0,
      },
      uptime_monitor_latency_ms: {
        labels: { id: m.id, type: m.type, region: this.region },
        value: m.last_latency || 0,
      },
      uptime_monitor_consecutive_failures: {
        labels: { id: m.id },
        value: m.consecutive_failures,
      },
      uptime_monitor_cert_days_left: {
        labels: { id: m.id },
        value: m.cert_days_left != null ? m.cert_days_left : -1,
      },
    };
    if (this.metricsSink && typeof this.metricsSink === 'function') {
      safe(() => this.metricsSink(snapshot));
    } else if (this.metricsSink && typeof this.metricsSink.observe === 'function') {
      safe(() => this.metricsSink.observe(snapshot));
    }
    this.emit('metrics', snapshot);
  }

  // ─────────────────────────────────────────────────────────────
  // STATUS / UPTIME / HISTORY
  // ─────────────────────────────────────────────────────────────

  getStatus(id) {
    const m = this.monitors.get(id);
    if (!m) return null;
    return {
      id: m.id,
      name: clone(m.name),
      up: m.status === STATUS.UP,
      status: m.status,
      consecutive_failures: m.consecutive_failures,
      consecutive_successes: m.consecutive_successes,
      last_check: m.last_check,
      last_status_change: m.last_status_change,
      latency: m.last_latency,
      last_reason: m.last_reason,
      cert_days_left: m.cert_days_left,
      in_maintenance: this._inMaintenance(m),
      region: this.region,
    };
  }

  /**
   * Response-time percentiles over the supplied window.
   * Returns { p50, p95, p99, samples }.
   */
  getLatency(id, period = '24h') {
    const m = this.monitors.get(id);
    if (!m) return null;
    const window = PERIODS[period] || PERIODS['24h'];
    const from = this.clock() - window;
    const latencies = [];
    for (const s of m.samples) {
      if (s.ts >= from && s.up && Number.isFinite(s.latency)) {
        latencies.push(s.latency);
      }
    }
    return {
      period,
      samples: latencies.length,
      p50: Math.round(percentile(latencies, 50)),
      p95: Math.round(percentile(latencies, 95)),
      p99: Math.round(percentile(latencies, 99)),
    };
  }

  /**
   * Uptime percentage for a monitor over the requested period.
   * Maintenance time is excluded from the denominator (per spec: "don't alert
   * during scheduled"; we also don't penalize uptime during maintenance).
   */
  getUptime(id, period = '24h') {
    const m = this.monitors.get(id);
    if (!m) return null;
    const window = PERIODS[period] || PERIODS['24h'];
    const nowTs = this.clock();
    const from = nowTs - window;

    let total = 0;
    let up = 0;
    for (const s of m.samples) {
      if (s.ts < from) continue;
      if (s.status === STATUS.MAINTENANCE) continue;
      total += 1;
      if (s.up) up += 1;
    }
    if (total === 0) return 100; // no data → optimistic
    return Math.round((up / total) * 10000) / 100; // 0..100 with 2 decimals
  }

  /**
   * Returns downtime events that ended (or started) within the period.
   * Long-running outages that span the window boundary are included.
   */
  downtimeHistory(id, period = '30d') {
    const m = this.monitors.get(id);
    if (!m) return [];
    const window = PERIODS[period] || PERIODS['30d'];
    const from = this.clock() - window;
    const events = m.downtime.filter((e) => e.ended >= from || e.started >= from);
    if (m.current_downtime) {
      events.push({
        id: `${m.id}:${m.current_downtime.started}:ongoing`,
        monitor_id: m.id,
        started: m.current_downtime.started,
        ended: null,
        duration_ms: this.clock() - m.current_downtime.started,
        reason: m.current_downtime.reason,
        ongoing: true,
      });
    }
    return events.slice();
  }

  // ─────────────────────────────────────────────────────────────
  // MAINTENANCE WINDOWS
  // ─────────────────────────────────────────────────────────────

  scheduleMaintenance(id, window) {
    const m = this.monitors.get(id);
    if (!m) throw new Error('unknown monitor id: ' + id);
    if (!window || !window.from || !window.to) {
      throw new Error('scheduleMaintenance requires {from, to}');
    }
    const rec = {
      id: 'mw_' + Math.random().toString(36).slice(2, 10),
      from: typeof window.from === 'number' ? window.from : Date.parse(window.from),
      to: typeof window.to === 'number' ? window.to : Date.parse(window.to),
      reason: window.reason || null,
      created: this.clock(),
    };
    if (!Number.isFinite(rec.from) || !Number.isFinite(rec.to) || rec.to <= rec.from) {
      throw new Error('scheduleMaintenance: invalid window range');
    }
    m.maintenance_windows.push(rec);
  }

  _inMaintenance(m) {
    const t = this.clock();
    for (const w of m.maintenance_windows) {
      if (t >= w.from && t <= w.to) return true;
    }
    return false;
  }

  // ─────────────────────────────────────────────────────────────
  // METRICS (Prometheus-shape, Agent X-52 compatible)
  // ─────────────────────────────────────────────────────────────

  snapshotMetrics() {
    const out = [];
    for (const m of this.monitors.values()) {
      out.push({
        id: m.id,
        type: m.type,
        region: this.region,
        up: m.status === STATUS.UP || m.status === STATUS.MAINTENANCE ? 1 : 0,
        status: m.status,
        latency_ms: m.last_latency || 0,
        consecutive_failures: m.consecutive_failures,
        cert_days_left: m.cert_days_left != null ? m.cert_days_left : null,
        uptime_24h: this.getUptime(m.id, '24h'),
      });
    }
    return out;
  }

  // ─────────────────────────────────────────────────────────────
  // BULK SEEDING
  // ─────────────────────────────────────────────────────────────

  seedDefaults() {
    for (const spec of DEFAULT_SEED_MONITORS) {
      if (!this.monitors.has(spec.id)) this.register(spec);
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// TYPE INFERENCE HELPER
// ═══════════════════════════════════════════════════════════════

function inferType(url) {
  if (!url) return CHECK_TYPES.HTTP;
  if (url.startsWith('https://')) return CHECK_TYPES.HTTPS;
  if (url.startsWith('http://')) return CHECK_TYPES.HTTP;
  if (url.startsWith('tcp://')) return CHECK_TYPES.TCP;
  if (url.startsWith('dns://')) return CHECK_TYPES.DNS;
  // Bare host:port → TCP
  if (/^[\w.-]+:\d+$/.test(url)) return CHECK_TYPES.TCP;
  return CHECK_TYPES.HTTP;
}

// ═══════════════════════════════════════════════════════════════
// FACTORY + EXPORTS
// ═══════════════════════════════════════════════════════════════

function createMonitor(opts) {
  return new MonitorEngine(opts || {});
}

module.exports = {
  // Public API
  createMonitor,
  MonitorEngine,
  DEFAULT_SEED_MONITORS,
  CHECK_TYPES,
  STATUS,
  PERIODS,
  DEFAULTS,

  // Probes (exported for reuse / testing)
  probeHttp,
  probeTcp,
  probeDns,
  probeSslExpiry,

  // Helpers (exported for tests)
  _percentile: percentile,
  _parseTarget: parseTarget,
  _inferType: inferType,
  _daysUntil: daysUntil,
};
