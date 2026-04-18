/**
 * ONYX OPS — Health Check / Readiness / Liveness / Startup
 * Agent X-56 — Techno-Kol Uzi (Swarm 3D) Mega ERP
 *
 * Kubernetes-style probes (zero external deps, Hebrew bilingual).
 *
 * Endpoints:
 *   GET /healthz/live     → is the process alive? (lightweight, always OK if responding)
 *   GET /healthz/ready    → can we serve traffic? (DB, deps, critical checks)
 *   GET /healthz/startup  → has one-time initialization completed?
 *   GET /healthz          → aggregate detailed report (for humans)
 *
 * Features:
 *   - Register arbitrary named checks with timeout / retry / cache / critical flag
 *   - setCriticalChecks() — mark the checks that must pass for "ready"
 *   - Built-in checks: process alive, memory, event-loop lag, disk free, env vars,
 *     config validity, cert expiry, queue depth, background jobs, DB ping, DB write,
 *     Supabase ping, external API ping
 *   - Periodic background refresh (so readiness never hammers deps on every probe)
 *   - Graceful shutdown: on SIGTERM flip ready=false, drain, exit cleanly
 *   - Express middlewares: livenessRoute / readinessRoute / startupRoute / detailedRoute
 *
 * Status taxonomy:
 *   'ok'    → check passed
 *   'warn'  → check failed but non-critical (readiness still green)
 *   'fail'  → check failed and critical (readiness goes red)
 *
 * Zero deps: fs, os, http, https, url, perf_hooks, child_process.
 *
 * Hebrew strings are bilingual in the summary report ("label / תווית") so the
 * same JSON can serve EN ops dashboards and HE human dashboards simultaneously.
 *
 * Run tests with:   node --test test/payroll/health-check.test.js
 */

'use strict';

const fs = require('fs');
const os = require('os');
const http = require('http');
const https = require('https');
const url = require('url');
const { performance } = require('perf_hooks');

// ═══════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════

const DEFAULT_CHECK_TIMEOUT_MS = 2000;
const DEFAULT_CACHE_MS = 5000;
const DEFAULT_RETRIES = 0;
const DEFAULT_REFRESH_MS = 15000;
const DEFAULT_SHUTDOWN_DRAIN_MS = 10000;

const MEMORY_MAX_PERCENT = 90;
const DISK_MIN_FREE_PERCENT = 10;
const EVENT_LOOP_LAG_MAX_MS = 100;

const STATUS_OK = 'ok';
const STATUS_WARN = 'warn';
const STATUS_FAIL = 'fail';
const STATUS_UNKNOWN = 'unknown';

// Hebrew / English bilingual status labels
const STATUS_LABELS = {
  ok:      { en: 'OK',       he: 'תקין' },
  warn:    { en: 'WARN',     he: 'אזהרה' },
  fail:    { en: 'FAIL',     he: 'כשל' },
  unknown: { en: 'UNKNOWN',  he: 'לא ידוע' },
};

// Category labels (EN / HE)
const CATEGORY_LABELS = {
  process:  { en: 'Process',          he: 'תהליך' },
  memory:   { en: 'Memory',           he: 'זיכרון' },
  cpu:      { en: 'CPU / Event Loop', he: 'מעבד / לולאת אירועים' },
  disk:     { en: 'Disk',             he: 'דיסק' },
  db:       { en: 'Database',         he: 'בסיס נתונים' },
  external: { en: 'External API',     he: 'API חיצוני' },
  config:   { en: 'Configuration',    he: 'קונפיגורציה' },
  cert:     { en: 'Certificates',     he: 'תעודות' },
  queue:    { en: 'Queue',            he: 'תור' },
  job:      { en: 'Background Jobs',  he: 'עבודות רקע' },
  custom:   { en: 'Custom',           he: 'מותאם אישית' },
};

// Aggregate precedence: fail > warn > ok > unknown
const STATUS_PRECEDENCE = {
  [STATUS_OK]: 0,
  [STATUS_UNKNOWN]: 1,
  [STATUS_WARN]: 2,
  [STATUS_FAIL]: 3,
};

// ═══════════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════════

function nowMs() {
  return Date.now();
}

function nowHr() {
  return performance.now();
}

function aggregate(statuses) {
  let worst = STATUS_OK;
  for (const s of statuses) {
    if ((STATUS_PRECEDENCE[s] || 0) > (STATUS_PRECEDENCE[worst] || 0)) {
      worst = s;
    }
  }
  return worst;
}

function withTimeout(promise, ms, label) {
  return new Promise((resolve, reject) => {
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      reject(new Error(`timeout after ${ms}ms: ${label || 'check'}`));
    }, ms);
    Promise.resolve()
      .then(() => promise)
      .then(
        (v) => { if (done) return; done = true; clearTimeout(timer); resolve(v); },
        (e) => { if (done) return; done = true; clearTimeout(timer); reject(e); }
      );
  });
}

function safeToString(v) {
  if (v == null) return String(v);
  if (v instanceof Error) return v.message || String(v);
  if (typeof v === 'object') {
    try { return JSON.stringify(v); } catch (_e) { return '[unserializable]'; }
  }
  return String(v);
}

function bilingual(en, he) {
  return { en, he, text: `${en} / ${he}` };
}

// ═══════════════════════════════════════════════════════════════
// BUILT-IN CHECKS
// ═══════════════════════════════════════════════════════════════

/** Process alive — lightweight, always OK if we're responding. */
function checkProcess() {
  return {
    status: STATUS_OK,
    category: 'process',
    message: bilingual('process alive', 'תהליך פעיל'),
    details: {
      pid: process.pid,
      uptime_seconds: Math.floor(process.uptime()),
      node_version: process.version,
      platform: process.platform,
    },
  };
}

/** Memory usage — warn at 80%, fail at 90%. */
function checkMemory(maxPercent) {
  const limit = typeof maxPercent === 'number' ? maxPercent : MEMORY_MAX_PERCENT;
  const total = os.totalmem();
  const free = os.freemem();
  const used = total - free;
  const pct = total > 0 ? (used / total) * 100 : 0;

  let status = STATUS_OK;
  if (pct >= limit) status = STATUS_FAIL;
  else if (pct >= limit - 10) status = STATUS_WARN;

  const rss = (process.memoryUsage && process.memoryUsage().rss) || 0;

  return {
    status,
    category: 'memory',
    message: bilingual(
      `memory ${pct.toFixed(1)}% used`,
      `זיכרון ${pct.toFixed(1)}% בשימוש`
    ),
    details: {
      total_bytes: total,
      free_bytes: free,
      used_bytes: used,
      used_percent: Number(pct.toFixed(2)),
      rss_bytes: rss,
      limit_percent: limit,
    },
  };
}

/**
 * Event-loop lag — measured by setImmediate delta. Warn above max/2, fail above max.
 */
function checkEventLoopLag(maxMs) {
  const limit = typeof maxMs === 'number' ? maxMs : EVENT_LOOP_LAG_MAX_MS;
  return new Promise((resolve) => {
    const start = nowHr();
    setImmediate(() => {
      const lag = nowHr() - start;
      let status = STATUS_OK;
      if (lag >= limit) status = STATUS_FAIL;
      else if (lag >= limit / 2) status = STATUS_WARN;
      resolve({
        status,
        category: 'cpu',
        message: bilingual(
          `event-loop lag ${lag.toFixed(1)}ms`,
          `השהיית לולאת אירועים ${lag.toFixed(1)}ms`
        ),
        details: {
          lag_ms: Number(lag.toFixed(3)),
          limit_ms: limit,
        },
      });
    });
  });
}

/** Disk space — free percent must be > minFreePercent. */
function checkDiskSpace(pathToCheck, minFreePercent) {
  const target = pathToCheck || process.cwd();
  const limit = typeof minFreePercent === 'number' ? minFreePercent : DISK_MIN_FREE_PERCENT;

  return new Promise((resolve) => {
    // Use fs.statfs if available (node 18.15+); else fall back to an os-based estimate.
    if (typeof fs.statfs === 'function') {
      fs.statfs(target, (err, stats) => {
        if (err) {
          resolve({
            status: STATUS_WARN,
            category: 'disk',
            message: bilingual('disk check unavailable', 'בדיקת דיסק לא זמינה'),
            details: { error: err.message, path: target },
          });
          return;
        }
        const total = stats.blocks * stats.bsize;
        const free = stats.bavail * stats.bsize;
        const freePct = total > 0 ? (free / total) * 100 : 0;
        let status = STATUS_OK;
        if (freePct < limit) status = STATUS_FAIL;
        else if (freePct < limit * 2) status = STATUS_WARN;
        resolve({
          status,
          category: 'disk',
          message: bilingual(
            `disk ${freePct.toFixed(1)}% free`,
            `דיסק ${freePct.toFixed(1)}% פנוי`
          ),
          details: {
            path: target,
            total_bytes: total,
            free_bytes: free,
            free_percent: Number(freePct.toFixed(2)),
            limit_percent: limit,
          },
        });
      });
    } else {
      // Fallback: we cannot measure disk without statfs. Return UNKNOWN/WARN.
      resolve({
        status: STATUS_WARN,
        category: 'disk',
        message: bilingual(
          'disk check requires fs.statfs (node >= 18.15)',
          'בדיקת דיסק דורשת fs.statfs (node >= 18.15)'
        ),
        details: { path: target, fallback: true },
      });
    }
  });
}

/** Required env vars — all must be set and non-empty. */
function checkEnvVars(required) {
  const list = Array.isArray(required) ? required : [];
  const missing = list.filter((k) => {
    const v = process.env[k];
    return v === undefined || v === null || v === '';
  });
  const status = missing.length === 0 ? STATUS_OK : STATUS_FAIL;
  return {
    status,
    category: 'config',
    message: status === STATUS_OK
      ? bilingual('all env vars set', 'כל משתני הסביבה מוגדרים')
      : bilingual(
        `missing env vars: ${missing.join(', ')}`,
        `חסרים משתני סביבה: ${missing.join(', ')}`
      ),
    details: { required: list, missing, present: list.filter((k) => !missing.includes(k)) },
  };
}

/** Config validity — call the validator fn and capture its result. */
async function checkConfig(validator) {
  if (typeof validator !== 'function') {
    return {
      status: STATUS_OK,
      category: 'config',
      message: bilingual('no config validator', 'אין בודק קונפיגורציה'),
      details: {},
    };
  }
  try {
    const res = await validator();
    if (res === true || res === undefined || res === null) {
      return {
        status: STATUS_OK,
        category: 'config',
        message: bilingual('config valid', 'קונפיגורציה תקינה'),
        details: {},
      };
    }
    if (typeof res === 'object') {
      const ok = res.valid !== false && !res.error;
      return {
        status: ok ? STATUS_OK : STATUS_FAIL,
        category: 'config',
        message: ok
          ? bilingual('config valid', 'קונפיגורציה תקינה')
          : bilingual(`config invalid: ${safeToString(res.error || res)}`, `קונפיגורציה לא תקינה: ${safeToString(res.error || res)}`),
        details: res,
      };
    }
    return {
      status: STATUS_OK,
      category: 'config',
      message: bilingual('config ok', 'קונפיגורציה תקינה'),
      details: { result: safeToString(res) },
    };
  } catch (e) {
    return {
      status: STATUS_FAIL,
      category: 'config',
      message: bilingual(`config error: ${e.message}`, `שגיאת קונפיגורציה: ${e.message}`),
      details: { error: e.message },
    };
  }
}

/**
 * Certificate expiry — given an object { name, expiresAt }[] or a fn → same.
 * Warn if < 30 days. Fail if expired.
 */
async function checkCertificates(certs) {
  let list = [];
  try {
    list = typeof certs === 'function' ? await certs() : certs;
  } catch (e) {
    return {
      status: STATUS_FAIL,
      category: 'cert',
      message: bilingual(`cert check error: ${e.message}`, `שגיאת בדיקת תעודות: ${e.message}`),
      details: { error: e.message },
    };
  }
  if (!Array.isArray(list) || list.length === 0) {
    return {
      status: STATUS_OK,
      category: 'cert',
      message: bilingual('no certs tracked', 'אין תעודות במעקב'),
      details: { certs: [] },
    };
  }
  const now = nowMs();
  const details = [];
  let worst = STATUS_OK;
  for (const c of list) {
    const expiresAt = new Date(c.expiresAt).getTime();
    const daysLeft = Math.floor((expiresAt - now) / 86400000);
    let st = STATUS_OK;
    if (daysLeft < 0) st = STATUS_FAIL;
    else if (daysLeft < 30) st = STATUS_WARN;
    if ((STATUS_PRECEDENCE[st] || 0) > (STATUS_PRECEDENCE[worst] || 0)) worst = st;
    details.push({ name: c.name, expires_at: c.expiresAt, days_left: daysLeft, status: st });
  }
  return {
    status: worst,
    category: 'cert',
    message: bilingual(
      `tracking ${list.length} certificate(s)`,
      `מעקב אחר ${list.length} תעודות`
    ),
    details: { certs: details },
  };
}

/** Queue depth — must be ≤ threshold. */
async function checkQueueDepth(getter, threshold) {
  const limit = typeof threshold === 'number' ? threshold : 1000;
  try {
    const depth = typeof getter === 'function' ? await getter() : 0;
    const n = Number(depth) || 0;
    let status = STATUS_OK;
    if (n >= limit) status = STATUS_FAIL;
    else if (n >= limit * 0.8) status = STATUS_WARN;
    return {
      status,
      category: 'queue',
      message: bilingual(
        `queue depth ${n}/${limit}`,
        `עומק תור ${n}/${limit}`
      ),
      details: { depth: n, threshold: limit },
    };
  } catch (e) {
    return {
      status: STATUS_FAIL,
      category: 'queue',
      message: bilingual(`queue check error: ${e.message}`, `שגיאת בדיקת תור: ${e.message}`),
      details: { error: e.message },
    };
  }
}

/** Background jobs — given a map of { name: { lastRunMs, maxStaleMs } } detect stuck jobs. */
async function checkBackgroundJobs(jobsGetter) {
  let jobs;
  try {
    jobs = typeof jobsGetter === 'function' ? await jobsGetter() : jobsGetter;
  } catch (e) {
    return {
      status: STATUS_FAIL,
      category: 'job',
      message: bilingual(`jobs check error: ${e.message}`, `שגיאת בדיקת עבודות: ${e.message}`),
      details: { error: e.message },
    };
  }
  if (!jobs || typeof jobs !== 'object') {
    return {
      status: STATUS_OK,
      category: 'job',
      message: bilingual('no background jobs', 'אין עבודות רקע'),
      details: {},
    };
  }
  const now = nowMs();
  const report = [];
  let worst = STATUS_OK;
  for (const name of Object.keys(jobs)) {
    const j = jobs[name] || {};
    const stale = now - (j.lastRunMs || 0);
    const maxStale = j.maxStaleMs || 600000;
    let st = STATUS_OK;
    if (j.stuck === true) st = STATUS_FAIL;
    else if (stale > maxStale) st = STATUS_FAIL;
    else if (stale > maxStale * 0.8) st = STATUS_WARN;
    if ((STATUS_PRECEDENCE[st] || 0) > (STATUS_PRECEDENCE[worst] || 0)) worst = st;
    report.push({ name, last_run_ms_ago: stale, max_stale_ms: maxStale, status: st });
  }
  return {
    status: worst,
    category: 'job',
    message: bilingual(
      `background jobs: ${report.length}`,
      `עבודות רקע: ${report.length}`
    ),
    details: { jobs: report },
  };
}

/** DB connection — call the user-supplied ping() fn. */
async function checkDbPing(pingFn) {
  if (typeof pingFn !== 'function') {
    return {
      status: STATUS_OK,
      category: 'db',
      message: bilingual('no DB ping configured', 'אין ping למסד נתונים'),
      details: {},
    };
  }
  const started = nowHr();
  try {
    const res = await pingFn();
    const latency = nowHr() - started;
    return {
      status: STATUS_OK,
      category: 'db',
      message: bilingual(
        `DB ping OK (${latency.toFixed(1)}ms)`,
        `ping למסד נתונים תקין (${latency.toFixed(1)}ms)`
      ),
      details: { latency_ms: Number(latency.toFixed(3)), result: res ? 'ok' : 'empty' },
    };
  } catch (e) {
    return {
      status: STATUS_FAIL,
      category: 'db',
      message: bilingual(`DB ping failed: ${e.message}`, `ping למסד נתונים נכשל: ${e.message}`),
      details: { error: e.message },
    };
  }
}

/** DB write capability — call writeProbeFn() and expect a truthy response. */
async function checkDbWrite(writeProbeFn) {
  if (typeof writeProbeFn !== 'function') {
    return {
      status: STATUS_OK,
      category: 'db',
      message: bilingual('no DB write probe configured', 'אין בדיקת כתיבה למסד נתונים'),
      details: {},
    };
  }
  const started = nowHr();
  try {
    const res = await writeProbeFn();
    const latency = nowHr() - started;
    if (res === false) {
      return {
        status: STATUS_FAIL,
        category: 'db',
        message: bilingual('DB write probe returned false', 'בדיקת כתיבה למסד נתונים החזירה false'),
        details: { latency_ms: Number(latency.toFixed(3)) },
      };
    }
    return {
      status: STATUS_OK,
      category: 'db',
      message: bilingual(
        `DB write OK (${latency.toFixed(1)}ms)`,
        `כתיבה למסד נתונים תקינה (${latency.toFixed(1)}ms)`
      ),
      details: { latency_ms: Number(latency.toFixed(3)) },
    };
  } catch (e) {
    return {
      status: STATUS_FAIL,
      category: 'db',
      message: bilingual(`DB write failed: ${e.message}`, `כתיבה למסד נתונים נכשלה: ${e.message}`),
      details: { error: e.message },
    };
  }
}

/**
 * External HTTP(S) endpoint — issue a GET and expect 2xx/3xx within timeout.
 * Category is configurable so we can tag it external / db / queue.
 */
function checkHttpEndpoint(endpointUrl, opts) {
  const options = opts || {};
  const timeout = options.timeout || 2000;
  const category = options.category || 'external';
  const label = options.label || endpointUrl;
  const expectStatus = options.expectStatus;

  return new Promise((resolve) => {
    let parsed;
    try {
      parsed = new url.URL(endpointUrl);
    } catch (e) {
      resolve({
        status: STATUS_FAIL,
        category,
        message: bilingual(`invalid URL: ${endpointUrl}`, `URL לא תקין: ${endpointUrl}`),
        details: { error: e.message, url: endpointUrl },
      });
      return;
    }
    const lib = parsed.protocol === 'https:' ? https : http;
    const started = nowHr();
    const req = lib.request(
      {
        method: options.method || 'GET',
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
        path: parsed.pathname + parsed.search,
        timeout,
        headers: options.headers || {},
      },
      (res) => {
        // Drain the response so the socket can be released.
        res.on('data', () => {});
        res.on('end', () => {
          const latency = nowHr() - started;
          const sc = res.statusCode || 0;
          let ok;
          if (Array.isArray(expectStatus)) ok = expectStatus.includes(sc);
          else if (typeof expectStatus === 'number') ok = sc === expectStatus;
          else ok = sc >= 200 && sc < 400;
          resolve({
            status: ok ? STATUS_OK : STATUS_FAIL,
            category,
            message: ok
              ? bilingual(`${label} OK (${sc}, ${latency.toFixed(1)}ms)`, `${label} תקין (${sc}, ${latency.toFixed(1)}ms)`)
              : bilingual(`${label} HTTP ${sc}`, `${label} HTTP ${sc}`),
            details: { url: endpointUrl, status_code: sc, latency_ms: Number(latency.toFixed(3)) },
          });
        });
      }
    );
    req.on('timeout', () => {
      req.destroy(new Error('timeout'));
    });
    req.on('error', (e) => {
      const latency = nowHr() - started;
      resolve({
        status: STATUS_FAIL,
        category,
        message: bilingual(`${label} error: ${e.message}`, `${label} שגיאה: ${e.message}`),
        details: { url: endpointUrl, error: e.message, latency_ms: Number(latency.toFixed(3)) },
      });
    });
    req.end();
  });
}

// ═══════════════════════════════════════════════════════════════
// HEALTH CHECKER CLASS
// ═══════════════════════════════════════════════════════════════

class HealthChecker {
  constructor(opts) {
    const options = opts || {};
    this.serviceName = options.serviceName || 'onyx-procurement';
    this.version = options.version || process.env.SERVICE_VERSION || 'dev';
    this.environment = options.environment || process.env.NODE_ENV || 'development';
    this.startedAt = nowMs();
    this.startupComplete = false;
    this.shuttingDown = false;

    // name -> { fn, timeout, cacheMs, retries, critical, lastResult, lastTs, category, tags, inflight }
    this.checks = new Map();
    this.criticalNames = new Set();
    this.refreshHandle = null;

    // In-flight HTTP requests (for graceful drain)
    this.inflightRequests = 0;

    // Logger — optional hook
    this.logger = options.logger || null;
  }

  // ─── Registration ────────────────────────────────────────────
  registerCheck(name, fn, opts) {
    if (typeof name !== 'string' || !name) {
      throw new Error('registerCheck: name must be a non-empty string');
    }
    if (typeof fn !== 'function') {
      throw new Error(`registerCheck(${name}): fn must be a function`);
    }
    const options = opts || {};
    this.checks.set(name, {
      name,
      fn,
      timeout: typeof options.timeout === 'number' ? options.timeout : DEFAULT_CHECK_TIMEOUT_MS,
      cacheMs: typeof options.cacheMs === 'number' ? options.cacheMs : DEFAULT_CACHE_MS,
      retries: typeof options.retries === 'number' ? options.retries : DEFAULT_RETRIES,
      critical: options.critical === true,
      category: options.category || 'custom',
      tags: options.tags || {},
      lastResult: null,
      lastTs: 0,
      inflight: null,
    });
    if (options.critical === true) this.criticalNames.add(name);
  }

  unregisterCheck(name) {
    this.checks.delete(name);
    this.criticalNames.delete(name);
  }

  setCriticalChecks(names) {
    if (!Array.isArray(names)) throw new Error('setCriticalChecks: expected array of names');
    this.criticalNames = new Set(names);
    for (const name of names) {
      const c = this.checks.get(name);
      if (c) c.critical = true;
    }
  }

  listChecks() {
    return Array.from(this.checks.keys());
  }

  // ─── Execution ───────────────────────────────────────────────
  async runCheck(name, opts) {
    const options = opts || {};
    const check = this.checks.get(name);
    if (!check) {
      return {
        name,
        status: STATUS_UNKNOWN,
        category: 'custom',
        message: bilingual(`unknown check: ${name}`, `בדיקה לא ידועה: ${name}`),
        details: {},
        duration_ms: 0,
        cached: false,
      };
    }

    // Cache hit?
    const age = nowMs() - check.lastTs;
    if (!options.force && check.lastResult && age < check.cacheMs) {
      return Object.assign({}, check.lastResult, { cached: true });
    }

    // If an identical call is already in flight, share it (request coalescing).
    if (check.inflight) return check.inflight;

    const run = this._executeWithRetries(check);
    check.inflight = run;
    try {
      const result = await run;
      check.lastResult = result;
      check.lastTs = nowMs();
      return result;
    } finally {
      check.inflight = null;
    }
  }

  async _executeWithRetries(check) {
    const started = nowHr();
    const attempts = check.retries + 1;
    let lastError;
    for (let i = 0; i < attempts; i++) {
      try {
        const res = await withTimeout(check.fn(), check.timeout, check.name);
        return this._normalize(check, res, started);
      } catch (e) {
        lastError = e;
      }
    }
    return this._normalize(
      check,
      {
        status: STATUS_FAIL,
        message: bilingual(
          `${check.name} failed: ${lastError ? lastError.message : 'unknown'}`,
          `${check.name} נכשל: ${lastError ? lastError.message : 'לא ידוע'}`
        ),
        details: { error: lastError ? lastError.message : 'unknown', attempts },
      },
      started
    );
  }

  _normalize(check, res, started) {
    const duration = nowHr() - started;
    const raw = res || {};
    let status = raw.status;
    if (status === true) status = STATUS_OK;
    else if (status === false) status = STATUS_FAIL;
    if (![STATUS_OK, STATUS_WARN, STATUS_FAIL, STATUS_UNKNOWN].includes(status)) {
      status = STATUS_UNKNOWN;
    }
    const message = raw.message || bilingual(check.name, check.name);
    return {
      name: check.name,
      status,
      category: raw.category || check.category || 'custom',
      critical: !!check.critical,
      message: typeof message === 'string' ? bilingual(message, message) : message,
      details: raw.details || {},
      duration_ms: Number(duration.toFixed(3)),
      cached: false,
      checked_at: new Date().toISOString(),
      tags: check.tags,
    };
  }

  async runAll(opts) {
    const names = Array.from(this.checks.keys());
    const results = await Promise.all(names.map((n) => this.runCheck(n, opts)));
    return results;
  }

  // ─── Probes ──────────────────────────────────────────────────
  /** Liveness — lightweight. Returns OK unless process is shutting down. */
  liveness() {
    if (this.shuttingDown) {
      return {
        status: STATUS_FAIL,
        reason: 'shutting_down',
        label: bilingual('shutting down', 'מערכת בכיבוי'),
        timestamp: new Date().toISOString(),
      };
    }
    return {
      status: STATUS_OK,
      reason: 'alive',
      label: bilingual('alive', 'חי'),
      pid: process.pid,
      uptime_seconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }

  /** Readiness — runs critical checks (others may run if includeAll=true). */
  async readiness(opts) {
    const options = opts || {};
    if (this.shuttingDown) {
      return {
        status: STATUS_FAIL,
        reason: 'shutting_down',
        label: bilingual('shutting down', 'מערכת בכיבוי'),
        checks: [],
        timestamp: new Date().toISOString(),
      };
    }
    const names = options.includeAll
      ? Array.from(this.checks.keys())
      : Array.from(this.criticalNames);
    const results = await Promise.all(names.map((n) => this.runCheck(n, options)));
    // Readiness cares only about critical failures. Warn = still ready.
    const criticalFails = results.filter(
      (r) => r.critical !== false && r.status === STATUS_FAIL
    );
    const status = criticalFails.length === 0 ? STATUS_OK : STATUS_FAIL;
    return {
      status,
      reason: criticalFails.length === 0 ? 'ready' : 'critical_checks_failed',
      label: status === STATUS_OK
        ? bilingual('ready', 'מוכן')
        : bilingual('not ready', 'לא מוכן'),
      checks: results,
      critical_count: results.length,
      failed_count: criticalFails.length,
      timestamp: new Date().toISOString(),
    };
  }

  /** Startup — has the one-time init completed? */
  startup() {
    return {
      status: this.startupComplete ? STATUS_OK : STATUS_FAIL,
      reason: this.startupComplete ? 'started' : 'initializing',
      label: this.startupComplete
        ? bilingual('startup complete', 'אתחול הושלם')
        : bilingual('initializing', 'באתחול'),
      startup_complete: this.startupComplete,
      uptime_seconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }

  markStartupComplete() {
    this.startupComplete = true;
  }

  /** Detailed aggregate report. */
  async detailed(opts) {
    const options = opts || {};
    const results = await this.runAll(options);
    const statuses = results.map((r) => r.status);
    const overall = aggregate(statuses);

    const summary = {
      ok: 0, warn: 0, fail: 0, unknown: 0,
    };
    for (const r of results) summary[r.status] = (summary[r.status] || 0) + 1;

    return {
      service: this.serviceName,
      version: this.version,
      environment: this.environment,
      overall_status: overall,
      overall_label: STATUS_LABELS[overall] || STATUS_LABELS[STATUS_UNKNOWN],
      liveness: this.liveness(),
      startup: this.startup(),
      summary,
      checks: results,
      categories: this._groupByCategory(results),
      shutting_down: this.shuttingDown,
      timestamp: new Date().toISOString(),
      uptime_seconds: Math.floor(process.uptime()),
    };
  }

  _groupByCategory(results) {
    const groups = {};
    for (const r of results) {
      const cat = r.category || 'custom';
      if (!groups[cat]) {
        groups[cat] = {
          label: CATEGORY_LABELS[cat] || { en: cat, he: cat },
          status: STATUS_OK,
          checks: [],
        };
      }
      groups[cat].checks.push(r);
      groups[cat].status = aggregate([groups[cat].status, r.status]);
    }
    return groups;
  }

  // ─── Background refresh ──────────────────────────────────────
  startHealthRefresh(intervalMs) {
    if (this.refreshHandle) this.stopHealthRefresh();
    const ms = intervalMs || DEFAULT_REFRESH_MS;
    const tick = () => {
      if (this.shuttingDown) return;
      this.runAll({ force: true }).catch((e) => {
        if (this.logger && typeof this.logger.error === 'function') {
          this.logger.error('health-refresh error', e);
        }
      });
    };
    this.refreshHandle = setInterval(tick, ms);
    if (typeof this.refreshHandle.unref === 'function') this.refreshHandle.unref();
    // Kick an initial refresh asynchronously so first readiness probe is warm.
    Promise.resolve().then(tick);
  }

  stopHealthRefresh() {
    if (this.refreshHandle) {
      clearInterval(this.refreshHandle);
      this.refreshHandle = null;
    }
  }

  // ─── Express middlewares ─────────────────────────────────────
  livenessRoute() {
    return (req, res) => {
      const body = this.liveness();
      const code = body.status === STATUS_OK ? 200 : 503;
      _writeJson(res, code, body);
    };
  }

  readinessRoute() {
    return async (req, res) => {
      try {
        const body = await this.readiness();
        const code = body.status === STATUS_OK ? 200 : 503;
        _writeJson(res, code, body);
      } catch (e) {
        _writeJson(res, 500, { status: STATUS_FAIL, error: e.message });
      }
    };
  }

  startupRoute() {
    return (req, res) => {
      const body = this.startup();
      const code = body.status === STATUS_OK ? 200 : 503;
      _writeJson(res, code, body);
    };
  }

  detailedRoute() {
    return async (req, res) => {
      try {
        const body = await this.detailed();
        const code = body.overall_status === STATUS_FAIL ? 503 : 200;
        _writeJson(res, code, body);
      } catch (e) {
        _writeJson(res, 500, { status: STATUS_FAIL, error: e.message });
      }
    };
  }

  /** Convenience — register all four routes on an Express app. */
  mountRoutes(app, prefix) {
    if (!app || typeof app.get !== 'function') {
      throw new Error('mountRoutes: expected an Express-like app with .get()');
    }
    const p = prefix || '/healthz';
    app.get(`${p}/live`, this.livenessRoute());
    app.get(`${p}/ready`, this.readinessRoute());
    app.get(`${p}/startup`, this.startupRoute());
    app.get(p, this.detailedRoute());
  }

  // ─── Graceful shutdown ───────────────────────────────────────
  trackInflight() {
    return (req, res, next) => {
      this.inflightRequests++;
      res.on('finish', () => { this.inflightRequests = Math.max(0, this.inflightRequests - 1); });
      res.on('close', () => { this.inflightRequests = Math.max(0, this.inflightRequests - 1); });
      if (typeof next === 'function') next();
    };
  }

  /**
   * Begin graceful shutdown. Sets ready=false immediately so the LB drains us,
   * waits up to drainMs for in-flight requests to finish, then calls
   * closers sequentially, then resolves.
   */
  async beginShutdown(opts) {
    const options = opts || {};
    const drainMs = typeof options.drainMs === 'number' ? options.drainMs : DEFAULT_SHUTDOWN_DRAIN_MS;
    const closers = Array.isArray(options.closers) ? options.closers : [];
    this.shuttingDown = true;
    this.stopHealthRefresh();

    const start = nowMs();
    while (this.inflightRequests > 0 && nowMs() - start < drainMs) {
      await new Promise((r) => setTimeout(r, 50));
    }
    for (const close of closers) {
      try { await close(); } catch (e) {
        if (this.logger && typeof this.logger.error === 'function') {
          this.logger.error('shutdown closer error', e);
        }
      }
    }
    return { drained_in_ms: nowMs() - start, remaining_inflight: this.inflightRequests };
  }

  installSignalHandlers(opts) {
    const options = opts || {};
    const exitFn = options.exitFn || ((code) => process.exit(code));
    const handler = async (sig) => {
      if (this.shuttingDown) return;
      if (this.logger && typeof this.logger.info === 'function') {
        this.logger.info(`received ${sig}, starting graceful shutdown`);
      }
      await this.beginShutdown(options);
      exitFn(0);
    };
    process.on('SIGTERM', () => handler('SIGTERM'));
    process.on('SIGINT', () => handler('SIGINT'));
  }
}

function _writeJson(res, code, body) {
  // Works with Express (res.status().json()) or raw http (res.writeHead().end()).
  if (typeof res.status === 'function' && typeof res.json === 'function') {
    res.status(code).json(body);
    return;
  }
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

// ═══════════════════════════════════════════════════════════════
// FACTORY
// ═══════════════════════════════════════════════════════════════

function createHealthChecker(opts) {
  return new HealthChecker(opts || {});
}

// ═══════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════

module.exports = {
  createHealthChecker,
  HealthChecker,
  // Built-in check factories
  checkProcess,
  checkMemory,
  checkEventLoopLag,
  checkDiskSpace,
  checkEnvVars,
  checkConfig,
  checkCertificates,
  checkQueueDepth,
  checkBackgroundJobs,
  checkDbPing,
  checkDbWrite,
  checkHttpEndpoint,
  // Constants
  STATUS_OK,
  STATUS_WARN,
  STATUS_FAIL,
  STATUS_UNKNOWN,
  STATUS_LABELS,
  CATEGORY_LABELS,
  // Utilities (exported for tests)
  _aggregate: aggregate,
  _withTimeout: withTimeout,
  _bilingual: bilingual,
};
