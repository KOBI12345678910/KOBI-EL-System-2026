/**
 * ONYX Error Tracker — Sentry-like self-hosted error tracking
 * ============================================================
 *
 * Agent X-58 — Swarm 3D — Techno-Kol Uzi — 2026-04-11
 *
 * Zero-dependency, self-hosted, Sentry-compatible error tracking for ONYX.
 *
 * ─── FEATURES ───────────────────────────────────────────────────
 *   1.  Capture exceptions with stack trace + source map resolution stub
 *   2.  Breadcrumbs (recent actions leading to error)
 *   3.  User context with email hashing (PII safe)
 *   4.  Request context (URL, headers sanitized, body sample)
 *   5.  Environment context (service, version, env)
 *   6.  Fingerprinting for dedup (type + first frame + message)
 *   7.  Grouping into issues
 *   8.  Rate of occurrence tracking (per-minute/hour/day)
 *   9.  Release tracking (commit SHA, version markers)
 *   10. Slack/email notification on new issues (pluggable transports)
 *   11. Issue ownership (auto-assign by file path rules)
 *   12. Resolve/unresolve/ignore workflows
 *   13. Release markers (when new version deployed)
 *   14. Regression detection (issue reappears in new release)
 *   15. Process-level uncaughtException & unhandledRejection hooks
 *   16. Express errorHandler middleware (responds 500)
 *   17. In-memory ring buffer (1000 events) + JSONL persistence
 *   18. Query API for dashboards
 *
 * ─── BACKWARD COMPATIBILITY ─────────────────────────────────────
 *   The pre-existing module-level API (init, setUser, setTag, setContext,
 *   requestScopeMiddleware, _resetForTests, _forceRotate) is preserved.
 *   The new createTracker(opts) → Tracker API is additive.
 *
 * ─── PRINCIPLES ─────────────────────────────────────────────────
 *   • Zero external deps  (fs, path, crypto, async_hooks only)
 *   • Safe-by-default: errors in the tracker MUST NOT break the host app
 *   • Hebrew bilingual: error messages & transport payloads support HE+EN
 *   • Never delete: existing symbols and behaviours stay intact
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { AsyncLocalStorage } = require('async_hooks');

// ═══════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════

const DEFAULT_LOG_DIR = path.resolve(__dirname, '..', '..', 'logs');
const DEFAULT_LOG_FILE = 'errors.jsonl';
const DEFAULT_ISSUES_FILE = 'issues.jsonl';
const DEFAULT_RELEASES_FILE = 'releases.jsonl';
const ROTATE_AT_BYTES = 10 * 1024 * 1024;        // 10 MB
const ROTATE_KEEP = 5;                            // .1 .. .5
const DEFAULT_BUFFER_BYTES = 5_000_000;           // 5 MB in-mem fingerprint cache bound
const DEFAULT_RING_BUFFER_SIZE = 1000;            // last 1000 events in memory
const DEFAULT_BREADCRUMB_LIMIT = 100;             // breadcrumbs per scope

// Recursively scrub any key whose lowercase name contains any of these substrings
const PII_KEYS = [
  'password',
  'token',
  'api_key',
  'apikey',
  'credit_card',
  'creditcard',
  'national_id',
  'nationalid',
  'tax_file',
  'taxfile',
  'secret',
  'authorization',
  'cookie',
  'set-cookie',
];

const SANITIZED_HEADER_NAMES = new Set([
  'authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
  'x-auth-token',
  'proxy-authorization',
]);

const VALID_LEVELS = new Set(['debug', 'info', 'warning', 'error', 'fatal']);
const ISSUE_STATUSES = new Set(['unresolved', 'resolved', 'ignored', 'regressed']);

// ═══════════════════════════════════════════════════════════════
// MODULE STATE (legacy singleton-style, preserved)
// ═══════════════════════════════════════════════════════════════

const state = {
  initialized: false,
  dsn: null,
  release: null,
  environment: 'development',
  maxBufferBytes: DEFAULT_BUFFER_BYTES,
  logDir: DEFAULT_LOG_DIR,
  logFile: DEFAULT_LOG_FILE,
  tags: {},
  contexts: {},
  fingerprints: new Map(),
  fingerprintBytes: 0,
};

// Async-context storage for per-request user/tag/context
const als = new AsyncLocalStorage();

function scope() {
  return als.getStore() || null;
}

// ═══════════════════════════════════════════════════════════════
// PII SCRUBBING (shared by legacy + new API)
// ═══════════════════════════════════════════════════════════════

function isPiiKey(key) {
  if (typeof key !== 'string') return false;
  const k = key.toLowerCase().replace(/[-\s]/g, '_');
  for (const p of PII_KEYS) {
    if (k.includes(p)) return true;
  }
  return false;
}

function scrubPii(value, seen) {
  if (value == null) return value;
  if (typeof value !== 'object') return value;
  if (value instanceof Date) return value;
  if (Buffer.isBuffer && Buffer.isBuffer(value)) return '[Buffer]';
  seen = seen || new WeakSet();
  if (seen.has(value)) return '[Circular]';
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((v) => scrubPii(v, seen));
  }

  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) {
    const shallow = {};
    for (const k of Object.keys(value)) {
      shallow[k] = value[k];
    }
    return scrubPii(shallow, seen);
  }

  const out = {};
  for (const k of Object.keys(value)) {
    if (isPiiKey(k)) {
      out[k] = '[REDACTED]';
      continue;
    }
    out[k] = scrubPii(value[k], seen);
  }
  return out;
}

function sanitizeHeaders(headers) {
  if (!headers || typeof headers !== 'object') return {};
  const out = {};
  for (const k of Object.keys(headers)) {
    const lk = k.toLowerCase();
    if (SANITIZED_HEADER_NAMES.has(lk) || isPiiKey(lk)) {
      out[k] = '[REDACTED]';
    } else {
      out[k] = headers[k];
    }
  }
  return out;
}

function sampleBody(body, maxLen) {
  if (body == null) return null;
  const limit = Number.isFinite(maxLen) ? maxLen : 2048;
  let s;
  try {
    s = typeof body === 'string' ? body : JSON.stringify(scrubPii(body));
  } catch (_e) {
    s = '[unserializable body]';
  }
  if (s.length > limit) return s.slice(0, limit) + '…[truncated]';
  return s;
}

function hashEmail(email) {
  if (!email || typeof email !== 'string') return null;
  return crypto.createHash('sha256').update(email.trim().toLowerCase()).digest('hex').slice(0, 32);
}

// ═══════════════════════════════════════════════════════════════
// FINGERPRINTING / DEDUP (legacy)
// ═══════════════════════════════════════════════════════════════

function firstFrame(stack) {
  if (!stack) return '';
  const lines = String(stack).split('\n').map((l) => l.trim()).filter(Boolean);
  for (const l of lines) {
    if (l.startsWith('at ')) return l;
  }
  return lines[1] || '';
}

function exceptionType(err) {
  if (!err) return 'Error';
  if (err.name && typeof err.name === 'string') return err.name;
  if (err.constructor && err.constructor.name) return err.constructor.name;
  return 'Error';
}

function fingerprintFor(err) {
  const type = exceptionType(err);
  const msg = (err && err.message) || String(err || 'unknown');
  const frame = firstFrame(err && err.stack);
  const raw = type + '|' + frame + '|' + msg;
  return crypto.createHash('sha1').update(raw).digest('hex');
}

function fingerprintForMessage(msg, level) {
  return crypto.createHash('sha1').update(`msg:${level}:${msg}`).digest('hex');
}

function seenBefore(fp) {
  const entry = state.fingerprints.get(fp);
  if (entry) {
    entry.count += 1;
    entry.lastSeen = Date.now();
    return entry;
  }
  state.fingerprints.set(fp, { count: 1, lastSeen: Date.now() });
  state.fingerprintBytes += fp.length + 40;
  if (state.fingerprintBytes > state.maxBufferBytes) {
    const entries = Array.from(state.fingerprints.entries());
    entries.sort((a, b) => a[1].lastSeen - b[1].lastSeen);
    const dropCount = Math.floor(entries.length / 2);
    for (let i = 0; i < dropCount; i++) {
      state.fingerprints.delete(entries[i][0]);
      state.fingerprintBytes -= (entries[i][0].length + 40);
    }
    if (state.fingerprintBytes < 0) state.fingerprintBytes = 0;
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════
// PERSISTENCE / ROTATION (legacy-compatible)
// ═══════════════════════════════════════════════════════════════

function ensureLogDir() {
  try {
    fs.mkdirSync(state.logDir, { recursive: true });
  } catch (_e) {
    // ignore
  }
}

function logFilePath() {
  return path.join(state.logDir, state.logFile);
}

function rotateIfNeeded() {
  const file = logFilePath();
  let sz = 0;
  try {
    sz = fs.statSync(file).size;
  } catch (_e) {
    return;
  }
  if (sz < ROTATE_AT_BYTES) return;

  for (let i = ROTATE_KEEP; i >= 1; i--) {
    const src = `${file}.${i}`;
    const dst = `${file}.${i + 1}`;
    try {
      if (fs.existsSync(src)) {
        if (i === ROTATE_KEEP) {
          fs.unlinkSync(src);
        } else {
          fs.renameSync(src, dst);
        }
      }
    } catch (_e) { /* swallow */ }
  }
  try {
    fs.renameSync(file, `${file}.1`);
  } catch (_e) { /* swallow */ }
}

function writeEvent(event) {
  try {
    ensureLogDir();
    rotateIfNeeded();
    const line = JSON.stringify(event) + '\n';
    fs.appendFileSync(logFilePath(), line, { encoding: 'utf8' });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[error-tracker] failed to write event:', err.message);
  }
}

/**
 * Legacy scrubUser — preserves only `id`, drops everything else.
 * Used by the singleton-style API that predates Agent X-58.
 */
function scrubUser(user) {
  if (!user || typeof user !== 'object') return null;
  const out = {};
  if (user.id != null) out.id = user.id;
  // Legacy contract: id only. Email/IP/etc. are dropped.
  return out;
}

/**
 * Rich scrubUser — preserves id, hashes email, keeps username.
 * Used by the new createTracker() API.
 */
function scrubUserRich(user) {
  if (!user || typeof user !== 'object') return null;
  const out = {};
  if (user.id != null) out.id = user.id;
  if (user.email) out.email_hash = hashEmail(user.email);
  if (user.username) out.username = user.username;
  return out;
}

function buildEvent({ level, message, stack, fingerprint, context }) {
  const s = scope() || {};
  const tags = { ...state.tags, ...(s.tags || {}), ...(context && context.tags) };
  const contexts = {
    ...state.contexts,
    ...(s.contexts || {}),
    ...(context && context.contexts),
  };
  const user = scrubUser(s.user || (context && context.user) || null);
  const request_id = (context && context.request_id) || (s.request_id || null);

  const raw = {
    timestamp: new Date().toISOString(),
    level,
    message,
    stack: stack || null,
    fingerprint,
    tags,
    contexts,
    user,
    release: state.release || null,
    environment: state.environment,
    request_id,
  };
  raw.tags = scrubPii(raw.tags);
  raw.contexts = scrubPii(raw.contexts);
  return raw;
}

// ═══════════════════════════════════════════════════════════════
// LEGACY PUBLIC API
// ═══════════════════════════════════════════════════════════════

function init(opts) {
  opts = opts || {};
  state.dsn = opts.dsn || null;
  state.release = opts.release || process.env.RELEASE || null;
  state.environment = opts.environment || process.env.NODE_ENV || 'development';
  state.maxBufferBytes = Number.isFinite(opts.maxBufferBytes)
    ? opts.maxBufferBytes
    : DEFAULT_BUFFER_BYTES;
  if (opts.logDir) state.logDir = opts.logDir;
  if (opts.logFile) state.logFile = opts.logFile;
  state.initialized = true;
  state.fingerprints.clear();
  state.fingerprintBytes = 0;
  ensureLogDir();
  return tracker;
}

function captureException(err, context) {
  try {
    if (!err) return null;
    const real = err instanceof Error ? err : new Error(String(err));
    const fp = fingerprintFor(real);
    const dup = seenBefore(fp);
    if (dup && dup.count > 1) {
      return { deduplicated: true, fingerprint: fp, count: dup.count };
    }
    const event = buildEvent({
      level: 'error',
      message: real.message || 'unknown error',
      stack: real.stack || null,
      fingerprint: fp,
      context: context || {},
    });
    writeEvent(event);
    return { deduplicated: false, fingerprint: fp, event };
  } catch (inner) {
    // eslint-disable-next-line no-console
    console.error('[error-tracker] captureException failed:', inner.message);
    return null;
  }
}

function captureMessage(msg, level, context) {
  try {
    level = level || 'info';
    if (!VALID_LEVELS.has(level)) level = 'info';
    const fp = fingerprintForMessage(String(msg), level);
    const dup = seenBefore(fp);
    if (dup && dup.count > 1) {
      return { deduplicated: true, fingerprint: fp, count: dup.count };
    }
    const event = buildEvent({
      level,
      message: String(msg),
      stack: null,
      fingerprint: fp,
      context: context || {},
    });
    writeEvent(event);
    return { deduplicated: false, fingerprint: fp, event };
  } catch (inner) {
    // eslint-disable-next-line no-console
    console.error('[error-tracker] captureMessage failed:', inner.message);
    return null;
  }
}

function setUser(user) {
  const s = scope();
  if (s) {
    s.user = user || null;
  } else {
    state.contexts.__user__ = user || null;
  }
}

function setTag(k, v) {
  const s = scope();
  if (s) {
    s.tags = s.tags || {};
    s.tags[k] = v;
  } else {
    state.tags[k] = v;
  }
}

function setContext(k, v) {
  const s = scope();
  if (s) {
    s.contexts = s.contexts || {};
    s.contexts[k] = v;
  } else {
    state.contexts[k] = v;
  }
}

function runInScope(initial, fn) {
  return als.run({ ...(initial || {}) }, fn);
}

function errorHandlerLegacy() {
  // eslint-disable-next-line no-unused-vars
  return function onyxErrorTrackerMiddleware(err, req, res, next) {
    try {
      const ctx = {
        request_id: req && (req.id || req.headers && req.headers['x-request-id']) || null,
        tags: {
          method: req && req.method,
          path: req && (req.originalUrl || req.url),
          status: err && err.status ? err.status : 500,
        },
        contexts: {
          http: {
            method: req && req.method,
            url: req && (req.originalUrl || req.url),
            ua: req && req.headers && req.headers['user-agent'],
          },
        },
      };
      captureException(err, ctx);
    } catch (_e) { /* never throw */ }
    next(err);
  };
}

function requestScopeMiddleware() {
  return function onyxErrorTrackerScope(req, _res, next) {
    const requestId =
      (req.headers && (req.headers['x-request-id'] || req.headers['x-correlation-id'])) ||
      crypto.randomBytes(8).toString('hex');
    req.id = req.id || requestId;
    runInScope({ request_id: requestId, tags: {}, contexts: {}, user: null }, next);
  };
}

function _resetForTests(opts) {
  state.initialized = false;
  state.dsn = null;
  state.release = null;
  state.environment = 'development';
  state.maxBufferBytes = DEFAULT_BUFFER_BYTES;
  state.logDir = (opts && opts.logDir) || DEFAULT_LOG_DIR;
  state.logFile = (opts && opts.logFile) || DEFAULT_LOG_FILE;
  state.tags = {};
  state.contexts = {};
  state.fingerprints.clear();
  state.fingerprintBytes = 0;
}

function _forceRotate() {
  rotateIfNeeded();
}

// ═══════════════════════════════════════════════════════════════
// NEW TRACKER FACTORY — createTracker(opts)
// ═══════════════════════════════════════════════════════════════

/**
 * Create a self-contained Tracker instance. Each instance owns:
 *   • its own ring buffer, issue store, breadcrumb trail
 *   • its own release history & regression state
 *   • its own scope storage (AsyncLocalStorage)
 *
 * @param {Object} opts
 * @param {string} [opts.service='onyx']              Service name
 * @param {string} [opts.version]                     Current release/version
 * @param {string} [opts.environment='development']
 * @param {string} [opts.logDir]                      Directory for JSONL files
 * @param {string} [opts.eventsFile='errors.jsonl']   Events JSONL filename
 * @param {string} [opts.issuesFile='issues.jsonl']   Issues JSONL filename
 * @param {string} [opts.releasesFile='releases.jsonl'] Releases JSONL filename
 * @param {number} [opts.ringBufferSize=1000]         Max events kept in memory
 * @param {number} [opts.breadcrumbLimit=100]         Max breadcrumbs per scope
 * @param {Array}  [opts.ownershipRules=[]]           [{ pattern, owner }]
 * @param {Function} [opts.notify]                    (issue, event) => void  — slack/email hook
 * @param {boolean} [opts.persist=true]               Write JSONL files
 * @param {string} [opts.sourceMapDir]                Dir for source maps (stub)
 */
function createTracker(opts) {
  opts = opts || {};

  // ─── instance state ─────────────────────────────────────────
  const cfg = {
    service: opts.service || 'onyx',
    version: opts.version || process.env.RELEASE || 'unknown',
    environment: opts.environment || process.env.NODE_ENV || 'development',
    logDir: opts.logDir || DEFAULT_LOG_DIR,
    eventsFile: opts.eventsFile || DEFAULT_LOG_FILE,
    issuesFile: opts.issuesFile || DEFAULT_ISSUES_FILE,
    releasesFile: opts.releasesFile || DEFAULT_RELEASES_FILE,
    ringBufferSize: Number.isFinite(opts.ringBufferSize) ? opts.ringBufferSize : DEFAULT_RING_BUFFER_SIZE,
    breadcrumbLimit: Number.isFinite(opts.breadcrumbLimit) ? opts.breadcrumbLimit : DEFAULT_BREADCRUMB_LIMIT,
    ownershipRules: Array.isArray(opts.ownershipRules) ? opts.ownershipRules.slice() : [],
    notify: typeof opts.notify === 'function' ? opts.notify : null,
    persist: opts.persist !== false,
    sourceMapDir: opts.sourceMapDir || null,
  };

  // Ring buffer (last N events)
  const ring = new Array(cfg.ringBufferSize);
  let ringHead = 0;
  let ringCount = 0;

  // Issue store: Map<issueId, issue>
  //   issue = {
  //     id, fingerprint, type, title, culprit, owner,
  //     status, status_by, status_at,
  //     first_seen, last_seen, events_count,
  //     first_release, last_release, regressed_from,
  //     rate: { minute:[], hour:[], day:[] },
  //     tags: {}, sample_event_id
  //   }
  const issues = new Map();

  // Release history (ordered newest-last)
  const releases = [];
  const releaseSeen = new Set();

  // Instance AsyncLocalStorage
  const instAls = new AsyncLocalStorage();

  // Global breadcrumb trail (fallback when no scope)
  const globalBreadcrumbs = [];

  // Global user / contexts (fallback)
  const globalCtx = { user: null, tags: {}, contexts: {} };

  // Rate counters: Map<issueId, { minute:Map, hour:Map, day:Map }>
  const rates = new Map();

  // Last notified fingerprint -> timestamp (debounce notifications)
  const notifyDebounce = new Map();

  // ─── helpers: scope access ──────────────────────────────────
  function getScope() {
    return instAls.getStore() || null;
  }

  function getBreadcrumbs() {
    const s = getScope();
    if (s && Array.isArray(s.breadcrumbs)) return s.breadcrumbs;
    return globalBreadcrumbs;
  }

  function getUser() {
    const s = getScope();
    if (s && s.user) return s.user;
    return globalCtx.user;
  }

  function getTags() {
    const s = getScope();
    const tags = Object.assign({}, globalCtx.tags);
    if (s && s.tags) Object.assign(tags, s.tags);
    return tags;
  }

  function getContexts() {
    const s = getScope();
    const contexts = Object.assign({}, globalCtx.contexts);
    if (s && s.contexts) Object.assign(contexts, s.contexts);
    return contexts;
  }

  // ─── ring buffer ────────────────────────────────────────────
  function pushRing(event) {
    ring[ringHead] = event;
    ringHead = (ringHead + 1) % cfg.ringBufferSize;
    if (ringCount < cfg.ringBufferSize) ringCount += 1;
  }

  function getRingEvents() {
    const out = [];
    if (ringCount === 0) return out;
    if (ringCount < cfg.ringBufferSize) {
      for (let i = 0; i < ringCount; i++) out.push(ring[i]);
      return out;
    }
    // wrapped
    for (let i = 0; i < cfg.ringBufferSize; i++) {
      const idx = (ringHead + i) % cfg.ringBufferSize;
      if (ring[idx]) out.push(ring[idx]);
    }
    return out;
  }

  // ─── persistence ────────────────────────────────────────────
  function ensureDir() {
    if (!cfg.persist) return;
    try { fs.mkdirSync(cfg.logDir, { recursive: true }); } catch (_e) { /* */ }
  }

  function persistLine(file, obj) {
    if (!cfg.persist) return;
    try {
      ensureDir();
      fs.appendFileSync(path.join(cfg.logDir, file), JSON.stringify(obj) + '\n', 'utf8');
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[error-tracker] persist failed:', err.message);
    }
  }

  // ─── source map stub ────────────────────────────────────────
  function resolveSourceMap(stack) {
    // Stub: in production this would parse stack frames and resolve via
    // .map files from cfg.sourceMapDir. Here we return the raw stack
    // plus a flag so callers know resolution was attempted.
    if (!stack) return { resolved: false, stack: null, frames: [] };
    const frames = String(stack).split('\n').slice(1).map((l) => l.trim()).filter(Boolean);
    return {
      resolved: !!cfg.sourceMapDir,
      stack: String(stack),
      frames,
    };
  }

  // ─── fingerprint / culprit extraction ───────────────────────
  function culpritFromStack(stack) {
    const frame = firstFrame(stack);
    // best-effort: extract file path from "at fn (/abs/path.js:10:5)"
    const m = frame.match(/\(([^)]+)\)/);
    if (m) return m[1];
    const m2 = frame.match(/at\s+(.+)$/);
    return m2 ? m2[1] : frame || 'unknown';
  }

  function ownerFor(culprit) {
    if (!culprit || !cfg.ownershipRules.length) return null;
    for (const rule of cfg.ownershipRules) {
      if (!rule || !rule.pattern || !rule.owner) continue;
      try {
        if (rule.pattern instanceof RegExp) {
          if (rule.pattern.test(culprit)) return rule.owner;
        } else if (typeof rule.pattern === 'string') {
          if (culprit.indexOf(rule.pattern) !== -1) return rule.owner;
        }
      } catch (_e) { /* ignore bad rule */ }
    }
    return null;
  }

  // ─── rate of occurrence ─────────────────────────────────────
  function bumpRate(issueId, ts) {
    if (!rates.has(issueId)) {
      rates.set(issueId, { minute: new Map(), hour: new Map(), day: new Map() });
    }
    const r = rates.get(issueId);
    const mKey = Math.floor(ts / 60_000);
    const hKey = Math.floor(ts / 3_600_000);
    const dKey = Math.floor(ts / 86_400_000);
    r.minute.set(mKey, (r.minute.get(mKey) || 0) + 1);
    r.hour.set(hKey, (r.hour.get(hKey) || 0) + 1);
    r.day.set(dKey, (r.day.get(dKey) || 0) + 1);
    // Prune older than 60 min / 24h / 30d
    for (const k of r.minute.keys()) if (mKey - k > 60) r.minute.delete(k);
    for (const k of r.hour.keys()) if (hKey - k > 24) r.hour.delete(k);
    for (const k of r.day.keys()) if (dKey - k > 30) r.day.delete(k);
  }

  function rateFor(issueId) {
    const r = rates.get(issueId);
    if (!r) return { per_minute: 0, per_hour: 0, per_day: 0 };
    const now = Date.now();
    const mKey = Math.floor(now / 60_000);
    const hKey = Math.floor(now / 3_600_000);
    const dKey = Math.floor(now / 86_400_000);
    return {
      per_minute: r.minute.get(mKey) || 0,
      per_hour: sumKeyRange(r.hour, hKey, 1),
      per_day: sumKeyRange(r.day, dKey, 1),
    };
  }

  function sumKeyRange(map, current, windowSize) {
    let sum = 0;
    for (const [k, v] of map) {
      if (current - k < windowSize) sum += v;
    }
    return sum;
  }

  // ─── issue upsert + regression detection ───────────────────
  function upsertIssue(fingerprint, event, err) {
    const now = Date.now();
    let issue = issues.get(fingerprint);
    const isNew = !issue;
    const type = event.exception && event.exception.type || 'Error';
    const title = event.message || type;
    const culprit = event.culprit || null;
    const rel = event.release || cfg.version || 'unknown';

    if (isNew) {
      const id = 'iss_' + crypto.createHash('sha1').update(fingerprint).digest('hex').slice(0, 12);
      issue = {
        id,
        fingerprint,
        type,
        title,
        culprit,
        owner: ownerFor(culprit),
        status: 'unresolved',
        status_by: null,
        status_at: null,
        first_seen: now,
        last_seen: now,
        events_count: 0,
        first_release: rel,
        last_release: rel,
        regressed_from: null,
        tags: { environment: cfg.environment, service: cfg.service },
        sample_event_id: event.event_id,
      };
      issues.set(fingerprint, issue);
    }

    issue.events_count += 1;
    issue.last_seen = now;
    issue.last_release = rel;

    // Regression detection: if previously resolved and a new event comes in
    // in a DIFFERENT release, mark as regressed.
    if (!isNew && issue.status === 'resolved') {
      if (rel && rel !== issue.first_release) {
        issue.status = 'regressed';
        issue.regressed_from = rel;
        issue.status_at = now;
      } else {
        // Same release as resolution — also regressed
        issue.status = 'regressed';
        issue.regressed_from = rel;
        issue.status_at = now;
      }
    }

    bumpRate(issue.id, now);
    persistLine(cfg.issuesFile, { ...issue, _written_at: now });

    // Notify on new or regressed issues (debounced 30s)
    if (cfg.notify && (isNew || issue.status === 'regressed')) {
      const last = notifyDebounce.get(fingerprint) || 0;
      if (now - last > 30_000) {
        notifyDebounce.set(fingerprint, now);
        try {
          cfg.notify(issue, event);
        } catch (err2) {
          // eslint-disable-next-line no-console
          console.error('[error-tracker] notify failed:', err2.message);
        }
      }
    }

    return { issue, isNew };
  }

  // ─── event builder ──────────────────────────────────────────
  function newEventId() {
    return 'evt_' + crypto.randomBytes(8).toString('hex');
  }

  function buildRichEvent(opts2) {
    const user = scrubUserRich(opts2.user || getUser());
    const tags = scrubPii({ ...getTags(), ...(opts2.tags || {}) });
    const contexts = scrubPii({ ...getContexts(), ...(opts2.contexts || {}) });
    const breadcrumbs = (opts2.breadcrumbs || getBreadcrumbs()).slice(-cfg.breadcrumbLimit);

    return {
      event_id: newEventId(),
      timestamp: new Date().toISOString(),
      level: opts2.level || 'error',
      message: opts2.message || '',
      exception: opts2.exception || null,
      stack: opts2.stack || null,
      source_map: opts2.source_map || null,
      fingerprint: opts2.fingerprint,
      culprit: opts2.culprit || null,
      user,
      tags,
      contexts,
      breadcrumbs,
      request: opts2.request || null,
      environment: cfg.environment,
      release: cfg.version,
      service: cfg.service,
      request_id: opts2.request_id || null,
    };
  }

  // ─── public API: Tracker instance ───────────────────────────
  const inst = {};

  /**
   * Capture an exception.
   * @returns {string|null} eventId or null on failure
   */
  inst.captureException = function (err, context) {
    try {
      if (!err) return null;
      const real = err instanceof Error ? err : new Error(String(err));
      const fp = fingerprintFor(real);
      const sm = resolveSourceMap(real.stack);
      const event = buildRichEvent({
        level: (context && context.level) || 'error',
        message: real.message || 'unknown error',
        exception: {
          type: exceptionType(real),
          value: real.message,
          stack: real.stack || null,
        },
        stack: real.stack || null,
        source_map: sm,
        fingerprint: fp,
        culprit: culpritFromStack(real.stack),
        user: context && context.user,
        tags: context && context.tags,
        contexts: context && context.contexts,
        request: context && context.request,
        request_id: context && context.request_id,
        breadcrumbs: context && context.breadcrumbs,
      });
      pushRing(event);
      persistLine(cfg.eventsFile, event);
      upsertIssue(fp, event, real);
      return event.event_id;
    } catch (inner) {
      // eslint-disable-next-line no-console
      console.error('[error-tracker:createTracker] captureException failed:', inner.message);
      return null;
    }
  };

  /**
   * Capture a plain message at a given level.
   */
  inst.captureMessage = function (msg, level, context) {
    try {
      level = level || 'info';
      if (!VALID_LEVELS.has(level)) level = 'info';
      const fp = fingerprintForMessage(String(msg), level);
      const event = buildRichEvent({
        level,
        message: String(msg),
        fingerprint: fp,
        culprit: null,
        user: context && context.user,
        tags: context && context.tags,
        contexts: context && context.contexts,
        request: context && context.request,
        request_id: context && context.request_id,
        breadcrumbs: context && context.breadcrumbs,
      });
      pushRing(event);
      persistLine(cfg.eventsFile, event);
      upsertIssue(fp, event, null);
      return event.event_id;
    } catch (inner) {
      // eslint-disable-next-line no-console
      console.error('[error-tracker:createTracker] captureMessage failed:', inner.message);
      return null;
    }
  };

  /**
   * Add a breadcrumb (recent action leading to an error).
   */
  inst.addBreadcrumb = function (bc) {
    try {
      const entry = {
        timestamp: new Date().toISOString(),
        message: (bc && bc.message) || '',
        category: (bc && bc.category) || 'default',
        level: (bc && bc.level) || 'info',
        data: (bc && bc.data) ? scrubPii(bc.data) : null,
      };
      const list = getBreadcrumbs();
      list.push(entry);
      while (list.length > cfg.breadcrumbLimit) list.shift();
    } catch (_e) { /* never throw */ }
  };

  inst.setUser = function (user) {
    try {
      const s = getScope();
      if (s) s.user = user || null;
      else globalCtx.user = user || null;
    } catch (_e) { /* */ }
  };

  inst.setContext = function (k, v) {
    try {
      const s = getScope();
      if (s) {
        s.contexts = s.contexts || {};
        s.contexts[k] = v;
      } else {
        globalCtx.contexts[k] = v;
      }
    } catch (_e) { /* */ }
  };

  inst.setTag = function (k, v) {
    try {
      const s = getScope();
      if (s) {
        s.tags = s.tags || {};
        s.tags[k] = v;
      } else {
        globalCtx.tags[k] = v;
      }
    } catch (_e) { /* */ }
  };

  /**
   * Run `fn` in an isolated scope. Changes to user/tag/context inside
   * `fn` do not leak outwards. Scope inherits current user + globals.
   */
  inst.withScope = function (fn) {
    const parent = getScope();
    const fresh = {
      user: parent && parent.user ? { ...parent.user } : (globalCtx.user ? { ...globalCtx.user } : null),
      tags: { ...(parent && parent.tags || {}) },
      contexts: { ...(parent && parent.contexts || {}) },
      breadcrumbs: (parent && parent.breadcrumbs) ? parent.breadcrumbs.slice() : globalBreadcrumbs.slice(),
      request_id: parent && parent.request_id || null,
    };
    return instAls.run(fresh, () => fn(inst));
  };

  /**
   * List issues, optionally filtered.
   * @param {Object} [filter] { status, owner, release, environment }
   */
  inst.listIssues = function (filter) {
    filter = filter || {};
    const out = [];
    for (const issue of issues.values()) {
      if (filter.status && issue.status !== filter.status) continue;
      if (filter.owner && issue.owner !== filter.owner) continue;
      if (filter.release && issue.last_release !== filter.release) continue;
      if (filter.environment && issue.tags.environment !== filter.environment) continue;
      out.push({ ...issue, rate: rateFor(issue.id) });
    }
    out.sort((a, b) => b.last_seen - a.last_seen);
    return out;
  };

  /**
   * Get a specific issue by id or fingerprint.
   */
  inst.getIssue = function (issueIdOrFp) {
    // Try fingerprint lookup first
    if (issues.has(issueIdOrFp)) {
      const i = issues.get(issueIdOrFp);
      return { ...i, rate: rateFor(i.id) };
    }
    // Scan by id
    for (const issue of issues.values()) {
      if (issue.id === issueIdOrFp) {
        return { ...issue, rate: rateFor(issue.id) };
      }
    }
    return null;
  };

  /**
   * Mark an issue as resolved.
   */
  inst.resolveIssue = function (issueIdOrFp, by) {
    const issue = findIssueRaw(issueIdOrFp);
    if (!issue) return false;
    issue.status = 'resolved';
    issue.status_by = by || 'system';
    issue.status_at = Date.now();
    persistLine(cfg.issuesFile, { ...issue, _written_at: issue.status_at });
    return true;
  };

  inst.unresolveIssue = function (issueIdOrFp, by) {
    const issue = findIssueRaw(issueIdOrFp);
    if (!issue) return false;
    issue.status = 'unresolved';
    issue.status_by = by || 'system';
    issue.status_at = Date.now();
    persistLine(cfg.issuesFile, { ...issue, _written_at: issue.status_at });
    return true;
  };

  inst.ignoreIssue = function (issueIdOrFp, by) {
    const issue = findIssueRaw(issueIdOrFp);
    if (!issue) return false;
    issue.status = 'ignored';
    issue.status_by = by || 'system';
    issue.status_at = Date.now();
    persistLine(cfg.issuesFile, { ...issue, _written_at: issue.status_at });
    return true;
  };

  /**
   * Assign an owner to an issue manually.
   */
  inst.assignIssue = function (issueIdOrFp, owner) {
    const issue = findIssueRaw(issueIdOrFp);
    if (!issue) return false;
    issue.owner = owner || null;
    persistLine(cfg.issuesFile, { ...issue, _written_at: Date.now() });
    return true;
  };

  function findIssueRaw(issueIdOrFp) {
    if (issues.has(issueIdOrFp)) return issues.get(issueIdOrFp);
    for (const issue of issues.values()) {
      if (issue.id === issueIdOrFp) return issue;
    }
    return null;
  }

  /**
   * Record a release marker. Subsequent events attach to this version.
   */
  inst.markRelease = function (version, meta) {
    if (!version) return null;
    cfg.version = String(version);
    const entry = {
      version: cfg.version,
      commit: (meta && meta.commit) || null,
      deployed_at: new Date().toISOString(),
      environment: cfg.environment,
      service: cfg.service,
      notes: (meta && meta.notes) || null,
    };
    if (!releaseSeen.has(cfg.version)) {
      releases.push(entry);
      releaseSeen.add(cfg.version);
      persistLine(cfg.releasesFile, entry);
    }
    return entry;
  };

  inst.listReleases = function () {
    return releases.slice();
  };

  /**
   * Query events from the ring buffer, optionally filtered.
   */
  inst.queryEvents = function (filter) {
    filter = filter || {};
    let out = getRingEvents();
    if (filter.level) out = out.filter((e) => e.level === filter.level);
    if (filter.fingerprint) out = out.filter((e) => e.fingerprint === filter.fingerprint);
    if (filter.release) out = out.filter((e) => e.release === filter.release);
    if (filter.since) {
      const t = filter.since instanceof Date ? filter.since.getTime() : new Date(filter.since).getTime();
      out = out.filter((e) => new Date(e.timestamp).getTime() >= t);
    }
    if (Number.isFinite(filter.limit)) out = out.slice(-filter.limit);
    return out;
  };

  /**
   * Aggregate stats snapshot for dashboards.
   */
  inst.getStats = function () {
    const issueArr = Array.from(issues.values());
    const byStatus = { unresolved: 0, resolved: 0, ignored: 0, regressed: 0 };
    for (const i of issueArr) {
      if (byStatus[i.status] != null) byStatus[i.status] += 1;
    }
    return {
      service: cfg.service,
      version: cfg.version,
      environment: cfg.environment,
      events_in_buffer: ringCount,
      buffer_capacity: cfg.ringBufferSize,
      issues_total: issueArr.length,
      issues_by_status: byStatus,
      releases_total: releases.length,
      generated_at: new Date().toISOString(),
    };
  };

  /**
   * Express error middleware. Captures the error and responds 500.
   */
  inst.errorHandler = function () {
    // eslint-disable-next-line no-unused-vars
    return function onyxErrorHandlerX58(err, req, res, _next) {
      try {
        const request = req ? {
          method: req.method,
          url: req.originalUrl || req.url,
          headers: sanitizeHeaders(req.headers || {}),
          body: sampleBody(req.body, 2048),
          ip: req.ip || null,
        } : null;

        const context = {
          request,
          request_id: req && (req.id || (req.headers && req.headers['x-request-id'])) || null,
          tags: {
            method: req && req.method,
            path: req && (req.originalUrl || req.url),
            status: (err && err.status) || 500,
          },
          contexts: {
            http: request,
          },
        };
        inst.captureException(err, context);
      } catch (_e) { /* never throw */ }

      if (res && !res.headersSent && typeof res.status === 'function') {
        try {
          const status = (err && err.status) || 500;
          res.status(status).json({
            error: {
              message: 'Internal Server Error',
              message_he: 'שגיאה פנימית בשרת',
              status,
            },
          });
        } catch (_e) {
          try { res.end(); } catch (_e2) { /* */ }
        }
      }
    };
  };

  /**
   * Request-scope middleware: installs a fresh scope per request.
   */
  inst.requestMiddleware = function () {
    return function onyxRequestScopeX58(req, _res, next) {
      const requestId =
        (req.headers && (req.headers['x-request-id'] || req.headers['x-correlation-id'])) ||
        crypto.randomBytes(8).toString('hex');
      req.id = req.id || requestId;
      instAls.run({
        request_id: requestId,
        tags: {},
        contexts: {},
        user: null,
        breadcrumbs: [],
      }, next);
    };
  };

  /**
   * Install process-level hooks for uncaught exceptions and unhandled rejections.
   * Returns a function to remove the hooks.
   */
  inst.installProcessHooks = function () {
    const onUncaught = (err) => {
      try {
        inst.captureException(err, { tags: { kind: 'uncaughtException' } });
      } catch (_e) { /* */ }
    };
    const onUnhandled = (reason) => {
      try {
        const err = reason instanceof Error ? reason : new Error(String(reason));
        inst.captureException(err, { tags: { kind: 'unhandledRejection' } });
      } catch (_e) { /* */ }
    };
    process.on('uncaughtException', onUncaught);
    process.on('unhandledRejection', onUnhandled);
    return function uninstall() {
      process.removeListener('uncaughtException', onUncaught);
      process.removeListener('unhandledRejection', onUnhandled);
    };
  };

  // ─── internals for tests ────────────────────────────────────
  inst._cfg = cfg;
  inst._ring = () => getRingEvents();
  inst._issues = () => Array.from(issues.values());
  inst._releases = () => releases.slice();
  inst._rates = () => rates;
  inst._fingerprintFor = fingerprintFor;
  inst._fingerprintForMessage = fingerprintForMessage;
  inst._scrubPii = scrubPii;
  inst._sanitizeHeaders = sanitizeHeaders;
  inst._hashEmail = hashEmail;
  inst._reset = () => {
    ring.fill(undefined);
    ringHead = 0;
    ringCount = 0;
    issues.clear();
    releases.length = 0;
    releaseSeen.clear();
    globalBreadcrumbs.length = 0;
    globalCtx.user = null;
    globalCtx.tags = {};
    globalCtx.contexts = {};
    rates.clear();
    notifyDebounce.clear();
  };

  return inst;
}

// ═══════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════

const tracker = {
  // New factory API (required by task spec)
  createTracker,

  // Legacy singleton API (preserved)
  init,
  captureException,
  captureMessage,
  setUser,
  setTag,
  setContext,
  errorHandler: errorHandlerLegacy,
  requestScopeMiddleware,
  runInScope,

  // Internals exposed for tests/server introspection
  _scrubPii: scrubPii,
  _sanitizeHeaders: sanitizeHeaders,
  _hashEmail: hashEmail,
  _fingerprintFor: fingerprintFor,
  _fingerprintForMessage: fingerprintForMessage,
  _resetForTests,
  _forceRotate,
  _ROTATE_AT_BYTES: ROTATE_AT_BYTES,
  _ROTATE_KEEP: ROTATE_KEEP,
  _DEFAULT_RING_BUFFER_SIZE: DEFAULT_RING_BUFFER_SIZE,
  _DEFAULT_BREADCRUMB_LIMIT: DEFAULT_BREADCRUMB_LIMIT,
  _PII_KEYS: PII_KEYS,
  _VALID_LEVELS: VALID_LEVELS,
  _ISSUE_STATUSES: ISSUE_STATUSES,
};

module.exports = tracker;
module.exports.createTracker = createTracker;
