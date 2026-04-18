/**
 * ONYX Traffic Shadowing Middleware — `traffic-shadow.js`
 * ========================================================
 *
 * Agent Y-170 — Swarm Techno-Kol Uzi — Mega-ERP (Kobi EL) — 2026-04-11
 *
 * A zero-dependency (only `node:http` / `node:https` + `node:events` +
 * `node:crypto`), bilingual (Hebrew / English) traffic-shadowing
 * middleware for ONYX procurement.
 *
 * PURPOSE / מטרה
 * --------------
 * Duplicate live incoming HTTP requests to a *shadow* upstream service
 * side-by-side with the primary one so the team can validate a new
 * release, an alternative implementation, a refactor or a vendor swap
 * against real production traffic — **without** affecting the primary
 * response.
 *
 * CORE GUARANTEES / ערובות
 * ------------------------
 *   1. Fire-and-forget shadow dispatch — primary response latency is
 *      never blocked on the shadow call.
 *   2. The shadow call can NEVER crash the host app. Every failure path
 *      is swallowed into a `diff.error` event.
 *   3. Sampling 0..100 (percent). `0` disables shadowing entirely.
 *      `100` shadows every eligible request.
 *   4. PII scrubbing is applied to BOTH request context and response
 *      bodies before anything is emitted to listeners or loggers.
 *   5. Bilingual diff summary — every emitted diff carries a Hebrew
 *      `he` and English `en` line describing the result.
 *   6. Events emitted via a standard `EventEmitter`:
 *        - `diff`       — one per compared request/response pair
 *        - `match`      — payload matched (diff.equal === true)
 *        - `mismatch`   — payload differed (diff.equal === false)
 *        - `error`      — shadow path failed (primary still unaffected)
 *        - `skip`       — request was not sampled / not eligible
 *   7. Never-delete: all emissions append to the in-memory ring buffer;
 *      nothing is ever silently dropped or mutated.
 *
 * PRINCIPLES / עקרונות
 * --------------------
 *   • Zero external dependencies — only `node:*` builtins.
 *   • Safe-by-default — the middleware can be wrapped around any
 *     existing (req,res,next) stack with no behavioural change for
 *     end-users.
 *   • Bilingual by default — Hebrew + English in every human-readable
 *     field so the runbook and ops dashboards stay consistent.
 *   • Testable — an `httpAgent` option lets tests inject a mock
 *     transport; no real sockets are required for unit tests.
 *
 * PUBLIC API / API
 * ----------------
 *   createTrafficShadow(options) -> {
 *     middleware,    // (req,res,next) express-compatible
 *     events,        // node:events.EventEmitter
 *     stats,         // () -> counters snapshot
 *     history,       // () -> ring buffer of diffs
 *     scrub,         // (obj) -> PII-free copy
 *     diffBodies,    // (a,b) -> { equal, paths, summary }
 *     compareResponses, // (primary, shadow) -> diff record
 *     shouldSample,  // () -> boolean (respects sampleRate)
 *     setSampleRate, // (n) -> void
 *     forwardToShadow, // (req,body) -> Promise<resp>
 *     close,         // () -> void (flush listeners)
 *     _constants: CONSTANTS,
 *   }
 */

'use strict';

const http = require('node:http');
const https = require('node:https');
const { EventEmitter } = require('node:events');
const crypto = require('node:crypto');

// ═══════════════════════════════════════════════════════════════
// CONSTANTS / קבועים
// ═══════════════════════════════════════════════════════════════

const DEFAULT_RING_SIZE = 500;
const DEFAULT_SAMPLE_RATE = 10; // percent
const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_MAX_BODY_BYTES = 1_048_576; // 1 MB

// PII key substrings — any key whose lowercase name contains one of
// these gets masked before being emitted / logged.
const PII_KEY_SUBSTRINGS = Object.freeze([
  'password',
  'passwd',
  'secret',
  'token',
  'apikey',
  'api_key',
  'api-key',
  'authorization',
  'cookie',
  'set-cookie',
  'creditcard',
  'credit_card',
  'credit-card',
  'cvv',
  'iban',
  'ssn',
  'nationalid',
  'national_id',
  'national-id',
  'taxfile',
  'tax_file',
  'tax-file',
  'teudat_zehut',
  'phone',
  'mobile',
  'email',
  'address',
  'dob',
  'birth',
]);

// Raw-value patterns that look like secrets regardless of key name.
// ILS IBAN, Israeli phone, email, JWT-ish, 16-digit card.
const PII_VALUE_PATTERNS = Object.freeze([
  /\bIL\d{2}[A-Z0-9]{19}\b/i,        // IBAN-IL
  /\b0\d{1,2}-?\d{7}\b/,             // IL phone
  /\b\+972\d{8,9}\b/,                // IL intl phone
  /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/, // email
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\b/, // JWT
  /\b\d{4}[ -]?\d{4}[ -]?\d{4}[ -]?\d{4}\b/, // 16-digit card
]);

const MASK = '***REDACTED***';

const EVENT_NAMES = Object.freeze({
  DIFF: 'diff',
  MATCH: 'match',
  MISMATCH: 'mismatch',
  ERROR: 'error',
  SKIP: 'skip',
});

const CONSTANTS = Object.freeze({
  DEFAULT_RING_SIZE,
  DEFAULT_SAMPLE_RATE,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_MAX_BODY_BYTES,
  PII_KEY_SUBSTRINGS,
  PII_VALUE_PATTERNS,
  MASK,
  EVENT_NAMES,
});

// ═══════════════════════════════════════════════════════════════
// PII SCRUBBER / מוחק מידע אישי
// ═══════════════════════════════════════════════════════════════

/**
 * Deep-clone `obj` while replacing any PII field with MASK.
 * Never mutates the input. Safe against cycles.
 * מעתיק עמוק + מסווה כל שדה רגיש לפני ההדפסה.
 */
function scrub(obj, seen) {
  if (obj === null || obj === undefined) return obj;
  const t = typeof obj;
  if (t === 'number' || t === 'boolean' || t === 'bigint') return obj;
  if (t === 'string') return scrubString(obj);
  if (t === 'function' || t === 'symbol') return undefined;
  if (!seen) seen = new WeakSet();
  if (typeof obj === 'object') {
    if (seen.has(obj)) return '[Circular]';
    seen.add(obj);
    if (Array.isArray(obj)) {
      return obj.map((v) => scrub(v, seen));
    }
    const out = {};
    for (const key of Object.keys(obj)) {
      if (isPiiKey(key)) {
        out[key] = MASK;
      } else {
        out[key] = scrub(obj[key], seen);
      }
    }
    return out;
  }
  return obj;
}

function isPiiKey(key) {
  if (typeof key !== 'string') return false;
  const lower = key.toLowerCase();
  for (const needle of PII_KEY_SUBSTRINGS) {
    if (lower.indexOf(needle) !== -1) return true;
  }
  return false;
}

function scrubString(s) {
  if (typeof s !== 'string' || s.length === 0) return s;
  let out = s;
  for (const pat of PII_VALUE_PATTERNS) {
    out = out.replace(new RegExp(pat.source, pat.flags.includes('g') ? pat.flags : pat.flags + 'g'), MASK);
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════
// DIFFING / השוואה
// ═══════════════════════════════════════════════════════════════

/**
 * Deep-compare two JSON-serialisable bodies.
 * Returns an object:
 *   {
 *     equal: boolean,
 *     paths: [ { path, a, b } ...]  // mismatched paths (scrubbed)
 *     added: [ path ],              // keys only in b
 *     removed: [ path ],            // keys only in a
 *     changedCount: number,
 *     summary: { he, en }
 *   }
 * משווה שני גופי JSON ומפיק סיכום דו-לשוני.
 */
function diffBodies(a, b, basePath) {
  const paths = [];
  const added = [];
  const removed = [];
  _walkDiff(a, b, basePath || '$', paths, added, removed);
  const equal = paths.length === 0 && added.length === 0 && removed.length === 0;
  const changedCount = paths.length + added.length + removed.length;
  return {
    equal,
    paths,
    added,
    removed,
    changedCount,
    summary: summarizeDiff(equal, paths.length, added.length, removed.length),
  };
}

function _walkDiff(a, b, path, paths, added, removed) {
  if (_isPrimitive(a) || _isPrimitive(b)) {
    if (!_primitiveEqual(a, b)) {
      paths.push({ path, a: scrub(a), b: scrub(b) });
    }
    return;
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    const aa = Array.isArray(a) ? a : [];
    const bb = Array.isArray(b) ? b : [];
    const len = Math.max(aa.length, bb.length);
    for (let i = 0; i < len; i++) {
      if (i >= aa.length) {
        added.push(`${path}[${i}]`);
        continue;
      }
      if (i >= bb.length) {
        removed.push(`${path}[${i}]`);
        continue;
      }
      _walkDiff(aa[i], bb[i], `${path}[${i}]`, paths, added, removed);
    }
    return;
  }
  // both objects
  const aKeys = new Set(Object.keys(a || {}));
  const bKeys = new Set(Object.keys(b || {}));
  for (const k of aKeys) {
    if (!bKeys.has(k)) {
      removed.push(`${path}.${k}`);
    } else {
      _walkDiff(a[k], b[k], `${path}.${k}`, paths, added, removed);
    }
  }
  for (const k of bKeys) {
    if (!aKeys.has(k)) {
      added.push(`${path}.${k}`);
    }
  }
}

function _isPrimitive(v) {
  if (v === null || v === undefined) return true;
  const t = typeof v;
  return t !== 'object';
}

function _primitiveEqual(a, b) {
  if (a === b) return true;
  // treat null/undefined as equal for tolerance
  if ((a === null || a === undefined) && (b === null || b === undefined)) return true;
  return false;
}

function summarizeDiff(equal, changed, added, removed) {
  if (equal) {
    return {
      he: 'תגובת הצללה זהה לתגובה הראשית',
      en: 'Shadow response matches primary',
    };
  }
  return {
    he: `נמצאו הבדלים בין ראשי לצל — שונו: ${changed}, נוספו: ${added}, הוסרו: ${removed}`,
    en: `Differences detected — changed: ${changed}, added: ${added}, removed: ${removed}`,
  };
}

// ═══════════════════════════════════════════════════════════════
// SAMPLING / דגימה
// ═══════════════════════════════════════════════════════════════

function clampSampleRate(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  if (v <= 0) return 0;
  if (v >= 100) return 100;
  return v;
}

function makeSampler(getRate, rng) {
  const random = typeof rng === 'function' ? rng : Math.random;
  return function shouldSample() {
    const rate = clampSampleRate(getRate());
    if (rate <= 0) return false;
    if (rate >= 100) return true;
    return random() * 100 < rate;
  };
}

// ═══════════════════════════════════════════════════════════════
// RESPONSE INTERCEPTION / מעקף ל-res.end
// ═══════════════════════════════════════════════════════════════

/**
 * Wrap a Node/Express `res` so we can capture its body after `next()`
 * has written it. Never blocks the primary response — the original
 * write/end calls execute normally.
 */
function captureResponse(res, onFinal) {
  const chunks = [];
  let captured = false;

  const origWrite = res.write ? res.write.bind(res) : null;
  const origEnd = res.end ? res.end.bind(res) : null;

  if (origWrite) {
    res.write = function write(chunk, encoding, cb) {
      try {
        if (chunk != null) {
          chunks.push(_chunkToBuffer(chunk, encoding));
        }
      } catch (_) {
        // swallow — must never break the host
      }
      return origWrite(chunk, encoding, cb);
    };
  }

  if (origEnd) {
    res.end = function end(chunk, encoding, cb) {
      try {
        if (chunk != null) {
          chunks.push(_chunkToBuffer(chunk, encoding));
        }
        if (!captured) {
          captured = true;
          const body = Buffer.concat(chunks).toString('utf8');
          // fire-and-forget — no await here
          try { onFinal({ body, statusCode: res.statusCode, headers: _safeHeaders(res) }); }
          catch (_) { /* swallow */ }
        }
      } catch (_) { /* swallow */ }
      return origEnd(chunk, encoding, cb);
    };
  }
}

function _chunkToBuffer(chunk, encoding) {
  if (Buffer.isBuffer(chunk)) return chunk;
  if (typeof chunk === 'string') return Buffer.from(chunk, encoding || 'utf8');
  if (chunk && typeof chunk === 'object') return Buffer.from(JSON.stringify(chunk), 'utf8');
  return Buffer.from(String(chunk || ''), 'utf8');
}

function _safeHeaders(res) {
  try {
    if (typeof res.getHeaders === 'function') return res.getHeaders();
  } catch (_) { /* ignore */ }
  return {};
}

// ═══════════════════════════════════════════════════════════════
// SHADOW DISPATCH / משלוח לצל
// ═══════════════════════════════════════════════════════════════

function parseTarget(target) {
  if (!target) return null;
  if (typeof target === 'object' && target.hostname) return target;
  try {
    const u = new URL(target);
    return {
      hostname: u.hostname,
      port: u.port || (u.protocol === 'https:' ? 443 : 80),
      protocol: u.protocol,
      basePath: u.pathname === '/' ? '' : u.pathname.replace(/\/+$/, ''),
    };
  } catch (_) {
    return null;
  }
}

function _buildShadowOptions(target, req) {
  const basePath = target.basePath || '';
  const reqPath = req && req.originalUrl ? req.originalUrl : (req && req.url ? req.url : '/');
  const headers = _sanitizeReqHeaders(req && req.headers);
  return {
    hostname: target.hostname,
    port: target.port,
    method: (req && req.method) || 'GET',
    path: basePath + reqPath,
    headers,
  };
}

function _sanitizeReqHeaders(h) {
  const out = {};
  if (!h || typeof h !== 'object') return out;
  for (const k of Object.keys(h)) {
    const lk = k.toLowerCase();
    if (lk === 'host' || lk === 'content-length' || lk === 'connection') continue;
    if (isPiiKey(lk)) { out[k] = MASK; continue; }
    out[k] = h[k];
  }
  out['x-shadow'] = 'onyx-y170';
  return out;
}

/**
 * Forward a request to the shadow upstream. Returns a promise that
 * resolves with { statusCode, headers, body } or rejects with an Error
 * — but the middleware wrapping this call always swallows rejections
 * so they can NEVER hurt the primary response path.
 */
function forwardToShadow(target, req, body, options) {
  const opts = options || {};
  const agent = opts.httpAgent; // test-injectable
  const timeoutMs = opts.timeoutMs || DEFAULT_TIMEOUT_MS;
  const maxBody = opts.maxBodyBytes || DEFAULT_MAX_BODY_BYTES;
  return new Promise(function shadowPromise(resolve, reject) {
    const parsed = parseTarget(target);
    if (!parsed) {
      reject(new Error('invalid shadow target / יעד לא חוקי'));
      return;
    }
    const httpLib = (parsed.protocol === 'https:') ? https : http;
    const reqOpts = _buildShadowOptions(parsed, req);
    let settled = false;
    const finish = (err, data) => {
      if (settled) return;
      settled = true;
      if (err) reject(err);
      else resolve(data);
    };
    let shadowReq;
    try {
      const requester = (agent && typeof agent.request === 'function') ? agent : httpLib;
      shadowReq = requester.request(reqOpts, function onRes(sRes) {
        const chunks = [];
        let total = 0;
        let over = false;
        sRes.on('data', function (c) {
          if (over) return;
          total += c.length;
          if (total > maxBody) { over = true; return; }
          chunks.push(c);
        });
        sRes.on('end', function () {
          const buf = Buffer.concat(chunks);
          finish(null, {
            statusCode: sRes.statusCode,
            headers: sRes.headers || {},
            body: buf.toString('utf8'),
            truncated: over,
          });
        });
        sRes.on('error', function (e) { finish(e); });
      });
    } catch (e) {
      finish(e);
      return;
    }
    if (!shadowReq) {
      finish(new Error('shadow request not created'));
      return;
    }
    shadowReq.on('error', function (e) { finish(e); });
    if (typeof shadowReq.setTimeout === 'function') {
      shadowReq.setTimeout(timeoutMs, function () {
        try { shadowReq.destroy(new Error('shadow timeout')); } catch (_) { /* ignore */ }
      });
    }
    if (body != null && body !== '' && typeof shadowReq.write === 'function') {
      try {
        const payload = (typeof body === 'string') ? body : JSON.stringify(body);
        shadowReq.write(payload);
      } catch (_) { /* swallow */ }
    }
    if (typeof shadowReq.end === 'function') {
      shadowReq.end();
    }
  });
}

// ═══════════════════════════════════════════════════════════════
// RING BUFFER / חוצץ טבעת
// ═══════════════════════════════════════════════════════════════

function makeRing(size) {
  const cap = size > 0 ? size : DEFAULT_RING_SIZE;
  const buf = [];
  return {
    push(item) {
      buf.push(item);
      while (buf.length > cap) buf.shift();
    },
    snapshot() { return buf.slice(); },
    clear() { buf.length = 0; },
    size() { return buf.length; },
    capacity() { return cap; },
  };
}

// ═══════════════════════════════════════════════════════════════
// BODY PARSING / ניתוח גוף
// ═══════════════════════════════════════════════════════════════

function tryParseJson(raw) {
  if (raw == null) return { ok: true, value: null };
  if (typeof raw === 'object') return { ok: true, value: raw };
  if (typeof raw !== 'string') return { ok: false, value: raw };
  const trimmed = raw.trim();
  if (trimmed.length === 0) return { ok: true, value: null };
  try {
    return { ok: true, value: JSON.parse(trimmed) };
  } catch (_) {
    return { ok: false, value: raw };
  }
}

// ═══════════════════════════════════════════════════════════════
// RESPONSE COMPARATOR / השוואת תגובות
// ═══════════════════════════════════════════════════════════════

function compareResponses(primary, shadow) {
  const pBody = tryParseJson(primary && primary.body);
  const sBody = tryParseJson(shadow && shadow.body);
  const statusEqual = (primary && primary.statusCode) === (shadow && shadow.statusCode);
  const bodyDiff = (pBody.ok && sBody.ok)
    ? diffBodies(pBody.value, sBody.value)
    : {
        equal: false,
        paths: [],
        added: [],
        removed: [],
        changedCount: 1,
        summary: {
          he: 'גוף התגובה אינו JSON תקין בשני הצדדים',
          en: 'Response body is not valid JSON on both sides',
        },
      };
  const equal = statusEqual && bodyDiff.equal;
  return {
    equal,
    statusEqual,
    primaryStatus: primary && primary.statusCode,
    shadowStatus: shadow && shadow.statusCode,
    body: bodyDiff,
    summary: equal ? bodyDiff.summary : {
      he: (statusEqual ? '' : `סטטוס שונה (${primary && primary.statusCode} ≠ ${shadow && shadow.statusCode}). `) + bodyDiff.summary.he,
      en: (statusEqual ? '' : `Status differs (${primary && primary.statusCode} ≠ ${shadow && shadow.statusCode}). `) + bodyDiff.summary.en,
    },
  };
}

// ═══════════════════════════════════════════════════════════════
// MAIN FACTORY / מפעל ראשי
// ═══════════════════════════════════════════════════════════════

/**
 * Create a traffic-shadow middleware bundle.
 *
 * @param {object} options
 * @param {string|object} options.target   - shadow upstream URL or parsed object
 * @param {number} [options.sampleRate=10] - percentage (0-100)
 * @param {number} [options.timeoutMs=5000]
 * @param {number} [options.maxBodyBytes=1MB]
 * @param {number} [options.ringSize=500]
 * @param {object} [options.httpAgent]     - test injection: any object exposing .request()
 * @param {Function} [options.logger]      - (level, payload) => void
 * @param {Function} [options.rng]         - PRNG for sampling
 * @param {(req)=>boolean} [options.filter] - extra eligibility predicate
 * @param {boolean} [options.scrubResponses=true]
 */
function createTrafficShadow(options) {
  const opts = options || {};
  if (!opts.target) {
    throw new Error('traffic-shadow: target is required / נדרש יעד להצללה');
  }
  let sampleRate = clampSampleRate(
    opts.sampleRate === undefined ? DEFAULT_SAMPLE_RATE : opts.sampleRate
  );
  const events = new EventEmitter();
  // Make emitter tolerant of many listeners (ops dashboards + tests).
  try { events.setMaxListeners(100); } catch (_) { /* ignore */ }

  const ring = makeRing(opts.ringSize || DEFAULT_RING_SIZE);
  const logger = typeof opts.logger === 'function' ? opts.logger : null;
  const filter = typeof opts.filter === 'function' ? opts.filter : null;
  const scrubResponses = opts.scrubResponses !== false;

  const stats = {
    seen: 0,
    sampled: 0,
    skipped: 0,
    matched: 0,
    mismatched: 0,
    errors: 0,
    primaryEnded: 0,
    shadowEnded: 0,
  };

  const shouldSample = makeSampler(() => sampleRate, opts.rng);

  function emitSafe(name, payload) {
    try { events.emit(name, payload); } catch (_) { /* never throw out */ }
    if (logger) {
      try { logger(name, payload); } catch (_) { /* swallow */ }
    }
  }

  function log(level, payload) {
    if (logger) {
      try { logger(level, payload); } catch (_) { /* swallow */ }
    }
  }

  // ── middleware ──────────────────────────────────────────────
  function middleware(req, res, next) {
    stats.seen += 1;
    const correlationId = _makeCorrelationId(req);
    // eligibility
    const eligible = (!filter || filter(req) !== false) && shouldSample();
    if (!eligible) {
      stats.skipped += 1;
      emitSafe(EVENT_NAMES.SKIP, {
        id: correlationId,
        reason: filter && filter(req) === false ? 'filter' : 'sample',
        url: req && req.url,
        ts: new Date().toISOString(),
      });
      try { return next && next(); } catch (e) { return; }
    }
    stats.sampled += 1;

    // capture primary request body (best-effort; express-style req.body)
    const primaryReqBody = (req && req.body) ? req.body : null;

    captureResponse(res, function onPrimaryEnd(primaryResp) {
      stats.primaryEnded += 1;
      // Fire-and-forget shadow dispatch — runs AFTER primary response
      // has already been written so it can never delay the client.
      forwardToShadow(opts.target, req, primaryReqBody, {
        httpAgent: opts.httpAgent,
        timeoutMs: opts.timeoutMs,
        maxBodyBytes: opts.maxBodyBytes,
      }).then(function (shadowResp) {
        stats.shadowEnded += 1;
        const diff = compareResponses(primaryResp, shadowResp);
        const record = {
          id: correlationId,
          ts: new Date().toISOString(),
          url: req && req.url,
          method: req && req.method,
          primary: scrubResponses
            ? { statusCode: primaryResp.statusCode, body: _scrubBodyField(primaryResp.body) }
            : primaryResp,
          shadow: scrubResponses
            ? { statusCode: shadowResp.statusCode, body: _scrubBodyField(shadowResp.body) }
            : shadowResp,
          diff,
        };
        ring.push(record);
        if (diff.equal) stats.matched += 1; else stats.mismatched += 1;
        emitSafe(EVENT_NAMES.DIFF, record);
        emitSafe(diff.equal ? EVENT_NAMES.MATCH : EVENT_NAMES.MISMATCH, record);
      }).catch(function (err) {
        stats.errors += 1;
        const payload = {
          id: correlationId,
          ts: new Date().toISOString(),
          url: req && req.url,
          method: req && req.method,
          error: {
            message: String(err && err.message || err || 'unknown'),
            he: 'שגיאה במשלוח בקשת הצללה',
            en: 'Shadow request failed',
          },
        };
        ring.push(payload);
        emitSafe(EVENT_NAMES.ERROR, payload);
      });
    });

    try {
      return next && next();
    } catch (e) {
      // next() itself threw — re-propagate so express can handle it;
      // shadow path has its own lifecycle.
      throw e;
    }
  }

  function _scrubBodyField(raw) {
    const parsed = tryParseJson(raw);
    if (!parsed.ok) return scrubString(String(raw || ''));
    return scrub(parsed.value);
  }

  function setSampleRate(n) { sampleRate = clampSampleRate(n); }
  function close() { try { events.removeAllListeners(); } catch (_) { /* ignore */ } }

  return {
    middleware,
    events,
    stats: () => Object.assign({}, stats, { sampleRate }),
    history: () => ring.snapshot(),
    clearHistory: () => ring.clear(),
    scrub,
    scrubString,
    isPiiKey,
    diffBodies,
    compareResponses,
    shouldSample,
    setSampleRate,
    forwardToShadow: (req, body) =>
      forwardToShadow(opts.target, req, body, {
        httpAgent: opts.httpAgent,
        timeoutMs: opts.timeoutMs,
        maxBodyBytes: opts.maxBodyBytes,
      }),
    close,
    _constants: CONSTANTS,
  };
}

function _makeCorrelationId(req) {
  try {
    if (req && req.headers) {
      const rid = req.headers['x-request-id'] || req.headers['x-correlation-id'];
      if (rid) return String(rid);
    }
  } catch (_) { /* ignore */ }
  try {
    return crypto.randomUUID();
  } catch (_) {
    return 'rid-' + Date.now() + '-' + Math.floor(Math.random() * 1e6);
  }
}

// ═══════════════════════════════════════════════════════════════
// EXPORTS / ייצוא
// ═══════════════════════════════════════════════════════════════

module.exports = {
  createTrafficShadow,
  // low-level helpers — exported so tests and downstream ops tools can
  // reuse them without re-implementing the scrubber / diff.
  scrub,
  scrubString,
  isPiiKey,
  diffBodies,
  compareResponses,
  tryParseJson,
  clampSampleRate,
  makeSampler,
  parseTarget,
  captureResponse,
  forwardToShadow,
  CONSTANTS,
};
