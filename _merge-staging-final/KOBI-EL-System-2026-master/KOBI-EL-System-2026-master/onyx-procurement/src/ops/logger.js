/**
 * ============================================================================
 * Techno-Kol / ONYX — Structured Logger (logger.js)
 * Agent X-51 — Swarm 3D
 * ----------------------------------------------------------------------------
 * Production-grade, ZERO-dependency structured logger for the Techno-Kol Uzi
 * mega-ERP.  Sits alongside the existing `onyx-procurement/src/logger.js`
 * (pino-based) without replacing it — this module is PURELY ADDITIVE and uses
 * only Node.js built-ins (`node:async_hooks`, `node:crypto`, `node:fs`,
 * `node:path`, `node:os`).
 *
 * Design goals
 *   - Never throw.  The logger MUST NOT break the caller under any
 *     circumstance (disk-full, EACCES, circular refs, non-UTF8 blobs).
 *   - Zero npm deps.  Works in air-gapped deployments (construction sites,
 *     field offices).  Survives supply-chain incidents.
 *   - Hebrew bilingual.  Messages and context fields may contain Hebrew;
 *     UTF-8 is preserved end-to-end.
 *   - Israeli compliance.  Redacts ת.ז (9-digit national ID), bank accounts,
 *     credit cards (Luhn-aware), emails, and phones before any write.
 *   - Correlation IDs.  Propagates `request_id` + `trace_id` via
 *     AsyncLocalStorage so every log line in a request is traceable.
 *   - Asia/Jerusalem time.  ISO-8601 with explicit +02:00 / +03:00 offset.
 *
 * Features
 *   1.  Log levels: trace / debug / info / warn / error / fatal
 *   2.  JSON-structured, newline-delimited (one event per line)
 *   3.  Correlation-ID propagation via AsyncLocalStorage
 *   4.  ISO-8601 timestamp in Asia/Jerusalem (DST-aware)
 *   5.  Automatic PII redaction
 *         - ת.ז (9 digits)      → "***-**-NNNN"
 *         - Bank account         → "***NNN"
 *         - Email local part     → "***@domain"
 *         - Phone                → "***-***-NNNN"
 *         - Credit card          → "****-****-****-NNNN" (Luhn-checked)
 *   6.  Hebrew / UTF-8 safety
 *   7.  Rotation stub with pluggable `onRotate` hook
 *   8.  Pluggable transports: console, file, HTTP (stub)
 *   9.  Sampling (log only N% of trace/debug in production)
 *   10. Structured context: service, env, version, host, user_id,
 *       request_id, trace_id
 *
 * Public API
 *   createLogger(opts)                  → logger
 *   logger.trace / debug / info / warn / error / fatal (msg, ctx?)
 *   logger.child(bindings)              → child logger
 *   logger.withRequest(req)             → request-scoped child
 *   logger.flush() / logger.close()     → drain buffers
 *   runWithContext(ctx, fn)             → async-local context
 *   getCurrentContext()                 → current ctx or null
 *   redactPii(obj)                      → recursive redaction
 *   requestLogger()                     → Express middleware (request/resp)
 *   correlationId()                     → Express middleware (x-request-id)
 *
 * Transports
 *   consoleTransport({ stream })        → writes to stdout / stderr
 *   fileTransport({ filePath, maxBytes, onRotate })
 *                                        → newline-delimited JSON file
 *   httpTransport({ url, batch, flushMs })
 *                                        → batched HTTP shipping (stub)
 * ============================================================================
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { AsyncLocalStorage } = require('node:async_hooks');

// ════════════════════════════════════════════════════════════════════════════
// 1. CONSTANTS
// ════════════════════════════════════════════════════════════════════════════

const LEVELS = Object.freeze({
  trace: 10,
  debug: 20,
  info:  30,
  warn:  40,
  error: 50,
  fatal: 60,
});

const LEVEL_NAMES = Object.freeze(Object.keys(LEVELS));

const DEFAULT_TZ = 'Asia/Jerusalem';

// PII KEYS (case/underscore/hyphen insensitive)
const PII_KEYS = Object.freeze([
  'password', 'pass', 'pwd',
  'token', 'access_token', 'refresh_token', 'id_token',
  'api_key', 'apikey', 'secret', 'client_secret',
  'authorization', 'cookie', 'set_cookie',
  'credit_card', 'creditcard', 'card_number', 'cardnumber', 'cvv', 'cvc', 'pan',
  'national_id', 'nationalid', 'teudat_zehut', 'tz', 'id_number',
  'bank_account', 'bankaccount', 'iban', 'swift',
  'ssn', 'passport',
  'email', 'phone', 'mobile', 'tel',
  'tax_file', 'taxfile',
]);

// Precompiled regexes (hoisted for perf)
const RE_ISRAELI_ID       = /(?<![0-9])(\d{9})(?![0-9])/g;
const RE_ISRAELI_PHONE    = /(?<![0-9])(\+?972[-\s]?|0)?(5\d|[23489])[-\s]?\d{3}[-\s]?\d{4}(?![0-9])/g;
const RE_EMAIL            = /([A-Za-z0-9._%+\-]+)@([A-Za-z0-9.\-]+\.[A-Za-z]{2,})/g;
const RE_CREDIT_CARD      = /(?<![0-9])((?:\d[ \-]?){13,19})(?![0-9])/g;
const RE_BANK_ACCOUNT     = /(?<![0-9])(\d{6,10})(?![0-9])/g; // fallback for bank_account-labelled
const RE_IBAN             = /\b([A-Z]{2}\d{2}[A-Z0-9]{11,30})\b/g;

// Max payload safety limits
const MAX_FIELD_BYTES     = 16 * 1024;       // 16 KB per field
const MAX_EVENT_BYTES     = 256 * 1024;      // 256 KB per event
const MAX_REDACT_DEPTH    = 12;

// ════════════════════════════════════════════════════════════════════════════
// 2. ASYNC CONTEXT
// ════════════════════════════════════════════════════════════════════════════

const als = new AsyncLocalStorage();

/** Runs `fn` inside a fresh async-local context. Nested calls inherit + merge. */
function runWithContext(ctx, fn) {
  const parent = als.getStore() || {};
  const merged = { ...parent, ...(ctx || {}) };
  return als.run(merged, fn);
}

/** Returns the current context or `null` if outside a bound scope. */
function getCurrentContext() {
  return als.getStore() || null;
}

// ════════════════════════════════════════════════════════════════════════════
// 3. TIME (Asia/Jerusalem ISO-8601)
// ════════════════════════════════════════════════════════════════════════════

/**
 * Formats `date` as an ISO-8601 string in the specified IANA timezone,
 * producing an explicit numeric offset (`+02:00` / `+03:00`) rather than
 * a `Z` suffix.  Falls back to UTC if the timezone is unavailable.
 * DST-aware because it defers to Intl.DateTimeFormat.
 */
function formatIsoWithTz(date, tz) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    date = new Date();
  }
  const timeZone = tz || DEFAULT_TZ;
  try {
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false,
    });
    const parts = {};
    for (const p of dtf.formatToParts(date)) {
      if (p.type !== 'literal') parts[p.type] = p.value;
    }
    // Intl may return "24" for midnight — normalize.
    if (parts.hour === '24') parts.hour = '00';

    // Milliseconds
    const ms = String(date.getUTCMilliseconds()).padStart(3, '0');

    // Compute offset for this moment in this zone.
    const asUtc = Date.UTC(
      Number(parts.year), Number(parts.month) - 1, Number(parts.day),
      Number(parts.hour), Number(parts.minute), Number(parts.second),
    );
    const offsetMin = Math.round((asUtc - date.getTime()) / 60000);
    const sign = offsetMin >= 0 ? '+' : '-';
    const absMin = Math.abs(offsetMin);
    const oh = String(Math.floor(absMin / 60)).padStart(2, '0');
    const om = String(absMin % 60).padStart(2, '0');

    return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}.${ms}${sign}${oh}:${om}`;
  } catch (_e) {
    return date.toISOString();
  }
}

// ════════════════════════════════════════════════════════════════════════════
// 4. PII REDACTION
// ════════════════════════════════════════════════════════════════════════════

/** Normalizes a key for PII-key lookup. */
function normKey(k) {
  return String(k).toLowerCase().replace(/[-\s]+/g, '_');
}

/** Strict key match (used by isPiiKey). */
function isPiiKey(key) {
  if (typeof key !== 'string') return false;
  const k = normKey(key);
  for (const p of PII_KEYS) if (k === p || k.includes(p)) return true;
  return false;
}

/** Luhn check for credit card numbers — returns true if valid. */
function luhnValid(digits) {
  if (!digits || digits.length < 12 || digits.length > 19) return false;
  let sum = 0, alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = digits.charCodeAt(i) - 48;
    if (n < 0 || n > 9) return false;
    if (alt) { n *= 2; if (n > 9) n -= 9; }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

/** "123456789" → "***-**-6789" (Israeli ת.ז style) */
function maskIsraeliId(nineDigit) {
  if (!/^\d{9}$/.test(nineDigit)) return '***-**-****';
  return '***-**-' + nineDigit.slice(-4);
}

/** "0501234567" → "***-***-4567" */
function maskPhone(raw) {
  const digits = String(raw).replace(/\D+/g, '');
  const tail = digits.slice(-4).padStart(4, '*');
  return '***-***-' + tail;
}

/** "user@example.com" → "***@example.com" */
function maskEmail(raw) {
  const s = String(raw);
  const at = s.indexOf('@');
  if (at < 0) return '***';
  return '***' + s.slice(at);
}

/** "4111111111111111" → "****-****-****-1111" (assumed already Luhn-checked) */
function maskCreditCard(raw) {
  const digits = String(raw).replace(/\D+/g, '');
  const tail = digits.slice(-4).padStart(4, '*');
  return '****-****-****-' + tail;
}

/** "1234567890" → "***890" */
function maskBankAccount(raw) {
  const digits = String(raw).replace(/\D+/g, '');
  const tail = digits.slice(-3);
  return '***' + (tail || '***');
}

/** Applies the full regex-based redaction suite to a single string. */
function redactString(s) {
  if (typeof s !== 'string' || !s) return s;
  // Truncate oversized strings before regex (perf).
  let str = s.length > MAX_FIELD_BYTES ? s.slice(0, MAX_FIELD_BYTES) + '…' : s;

  // 1. Credit cards (Luhn-aware) — BEFORE Israeli-ID so 9-digit prefixes
  //    of long card numbers are not mistaken for national IDs.
  str = str.replace(RE_CREDIT_CARD, (m) => {
    const digits = m.replace(/\D+/g, '');
    if (digits.length < 13 || digits.length > 19) return m;
    if (!luhnValid(digits)) return m;
    return maskCreditCard(digits);
  });

  // 2. Israeli IDs (9 consecutive digits, not adjacent to more digits)
  str = str.replace(RE_ISRAELI_ID, (m) => maskIsraeliId(m));

  // 3. Phones (Israeli formats)
  str = str.replace(RE_ISRAELI_PHONE, (m) => {
    // Preserve non-phone garbage like "972" alone
    const digits = m.replace(/\D+/g, '');
    if (digits.length < 9) return m;
    return maskPhone(digits);
  });

  // 4. Emails
  str = str.replace(RE_EMAIL, (_m, _local, domain) => `***@${domain}`);

  // 5. IBANs (rough heuristic)
  str = str.replace(RE_IBAN, (m) => '***' + m.slice(-4));

  return str;
}

/**
 * Recursively redacts PII from an object/array graph.  Handles cycles,
 * caps depth at MAX_REDACT_DEPTH, and special-cases known PII key names
 * for field-level masking (credit card, phone, email, bank account).
 */
function redactPii(value, _seen, _depth) {
  const seen = _seen || new WeakSet();
  const depth = _depth || 0;

  if (value == null) return value;
  if (depth > MAX_REDACT_DEPTH) return '[MaxDepth]';

  const t = typeof value;
  if (t === 'string') return redactString(value);
  if (t === 'number' || t === 'boolean' || t === 'bigint') return value;
  if (t === 'function' || t === 'symbol') return `[${t}]`;
  if (t !== 'object') return value;

  // Objects / built-ins
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactString(value.message || ''),
      stack: value.stack ? redactString(String(value.stack)) : undefined,
      code: value.code,
    };
  }
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer && Buffer.isBuffer(value)) {
    return `[Buffer ${value.length}b]`;
  }
  if (seen.has(value)) return '[Circular]';
  seen.add(value);

  if (Array.isArray(value)) {
    const out = new Array(value.length);
    for (let i = 0; i < value.length; i++) {
      out[i] = redactPii(value[i], seen, depth + 1);
    }
    return out;
  }

  // Plain-ish object
  const out = {};
  const keys = Object.keys(value);
  for (const k of keys) {
    const nk = normKey(k);
    const raw = value[k];

    // Hard PII key → field-level mask (preserves last digits, never logs value).
    if (isPiiKey(k)) {
      if (nk.includes('email')) {
        out[k] = typeof raw === 'string' ? maskEmail(raw) : '[REDACTED]';
      } else if (nk.includes('phone') || nk.includes('mobile') || nk === 'tel') {
        out[k] = raw != null ? maskPhone(raw) : '[REDACTED]';
      } else if (
        nk.includes('credit_card') || nk.includes('card_number') ||
        nk === 'cardnumber' || nk === 'pan'
      ) {
        out[k] = raw != null ? maskCreditCard(raw) : '[REDACTED]';
      } else if (
        nk.includes('bank_account') || nk === 'bankaccount' ||
        nk === 'iban' || nk === 'account' || nk === 'account_number'
      ) {
        out[k] = raw != null ? maskBankAccount(raw) : '[REDACTED]';
      } else if (
        nk.includes('national_id') || nk === 'nationalid' ||
        nk === 'tz' || nk === 'teudat_zehut' || nk === 'id_number'
      ) {
        out[k] = raw != null ? maskIsraeliId(String(raw).replace(/\D+/g, '').padStart(9, '0').slice(-9)) : '[REDACTED]';
      } else {
        out[k] = '[REDACTED]';
      }
      continue;
    }

    out[k] = redactPii(raw, seen, depth + 1);
  }
  return out;
}

// ════════════════════════════════════════════════════════════════════════════
// 5. SAFE JSON SERIALIZATION
// ════════════════════════════════════════════════════════════════════════════

/** JSON.stringify wrapper that tolerates cycles, BigInt, and oversized blobs. */
function safeStringify(obj) {
  const seen = new WeakSet();
  let out;
  try {
    out = JSON.stringify(obj, function replacer(_key, v) {
      if (v == null) return v;
      if (typeof v === 'bigint') return v.toString() + 'n';
      if (typeof v === 'function') return '[function]';
      if (typeof v === 'symbol') return '[symbol]';
      if (v instanceof Error) {
        return { name: v.name, message: v.message, stack: v.stack, code: v.code };
      }
      if (typeof v === 'object') {
        if (seen.has(v)) return '[Circular]';
        seen.add(v);
      }
      return v;
    });
  } catch (e) {
    out = JSON.stringify({ __serialize_error__: String(e && e.message || e) });
  }
  if (out && out.length > MAX_EVENT_BYTES) {
    out = JSON.stringify({ __truncated__: true, size: out.length, head: out.slice(0, MAX_EVENT_BYTES) });
  }
  return out;
}

// ════════════════════════════════════════════════════════════════════════════
// 6. TRANSPORTS
// ════════════════════════════════════════════════════════════════════════════

/**
 * Console transport — writes to stdout (or stderr for warn+).
 * Safe: never throws.  Respects opts.stream override for tests.
 */
function consoleTransport(opts) {
  opts = opts || {};
  const outStream = opts.stream || process.stdout;
  const errStream = opts.errStream || process.stderr;
  return {
    name: 'console',
    write(line, event) {
      try {
        const stream = (event && LEVELS[event.level] >= LEVELS.warn)
          ? errStream : outStream;
        stream.write(line + '\n');
      } catch (_e) { /* never throw */ }
    },
    flush() { /* no-op */ },
    close() { /* no-op */ },
  };
}

/**
 * File transport — newline-delimited JSON, bounded by maxBytes with a
 * rotation hook.  Writes are BUFFERED and flushed on a timer, on buffer
 * size, and on process exit.
 */
function fileTransport(opts) {
  opts = opts || {};
  const filePath = opts.filePath;
  if (!filePath) throw new Error('fileTransport: filePath is required');
  const maxBytes = Number.isFinite(opts.maxBytes) ? opts.maxBytes : 10 * 1024 * 1024;
  const flushMs = Number.isFinite(opts.flushMs) ? opts.flushMs : 250;
  const bufferBytes = Number.isFinite(opts.bufferBytes) ? opts.bufferBytes : 64 * 1024;
  const onRotate = typeof opts.onRotate === 'function' ? opts.onRotate : null;

  // Ensure directory exists (best effort).
  try { fs.mkdirSync(path.dirname(filePath), { recursive: true }); } catch (_e) {}

  let buffer = [];
  let bufferSize = 0;
  let timer = null;
  let closed = false;

  function currentSize() {
    try { return fs.statSync(filePath).size; } catch (_e) { return 0; }
  }

  function rotate() {
    try {
      // Simple strategy: rename file → file.<ts>.  Hand off to hook.
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      const rotated = `${filePath}.${ts}`;
      if (fs.existsSync(filePath)) {
        fs.renameSync(filePath, rotated);
        if (onRotate) {
          try { onRotate({ original: filePath, rotated, size: currentSize() }); } catch (_e) {}
        }
      }
    } catch (_e) { /* swallow — rotation is best-effort */ }
  }

  function flushNow() {
    if (buffer.length === 0) return;
    const chunk = buffer.join('');
    buffer = [];
    bufferSize = 0;
    try {
      fs.appendFileSync(filePath, chunk, { encoding: 'utf8' });
      if (currentSize() >= maxBytes) rotate();
    } catch (_e) { /* swallow */ }
  }

  function scheduleFlush() {
    if (timer || closed) return;
    timer = setTimeout(() => { timer = null; flushNow(); }, flushMs);
    if (timer.unref) timer.unref();
  }

  // Non-blocking flush on exit — best effort.
  const onExit = () => { try { flushNow(); } catch (_e) {} };
  process.once('exit', onExit);
  process.once('SIGINT', onExit);
  process.once('SIGTERM', onExit);

  return {
    name: 'file',
    write(line /* , event */) {
      if (closed) return;
      try {
        const str = line + '\n';
        buffer.push(str);
        bufferSize += Buffer.byteLength(str, 'utf8');
        if (bufferSize >= bufferBytes) flushNow();
        else scheduleFlush();
      } catch (_e) { /* swallow */ }
    },
    flush: flushNow,
    close() {
      closed = true;
      if (timer) { clearTimeout(timer); timer = null; }
      flushNow();
    },
  };
}

/**
 * HTTP shipping transport (STUB).
 * Batches events and ships them via a user-provided fetch-like function.
 * If no `fetch` is provided, events are held in memory only — suitable for
 * dev/tests.  In production wire `fetch: globalThis.fetch` or similar.
 */
function httpTransport(opts) {
  opts = opts || {};
  const url = opts.url || null;
  const batch = Number.isFinite(opts.batch) ? opts.batch : 100;
  const flushMs = Number.isFinite(opts.flushMs) ? opts.flushMs : 2000;
  const fetchFn = typeof opts.fetch === 'function' ? opts.fetch : null;

  let queue = [];
  let timer = null;
  let closed = false;
  let inflight = 0;

  async function shipBatch() {
    if (!fetchFn || !url || queue.length === 0 || closed) return;
    const send = queue;
    queue = [];
    inflight++;
    try {
      await fetchFn(url, {
        method: 'POST',
        headers: { 'content-type': 'application/x-ndjson' },
        body: send.join('\n'),
      });
    } catch (_e) {
      // Best-effort — in production you might re-queue or drop oldest.
    } finally { inflight--; }
  }

  function scheduleFlush() {
    if (timer || closed) return;
    timer = setTimeout(() => { timer = null; shipBatch(); }, flushMs);
    if (timer.unref) timer.unref();
  }

  return {
    name: 'http',
    write(line /* , event */) {
      if (closed) return;
      queue.push(line);
      if (queue.length >= batch) shipBatch();
      else scheduleFlush();
    },
    flush() { return shipBatch(); },
    close() {
      closed = true;
      if (timer) { clearTimeout(timer); timer = null; }
      // Drop any remaining queue — they weren't persisted by this transport.
      queue = [];
    },
    _inspect() { return { queued: queue.length, inflight }; },
  };
}

// ════════════════════════════════════════════════════════════════════════════
// 7. CORE LOGGER
// ════════════════════════════════════════════════════════════════════════════

/**
 * createLogger(opts) → logger
 *
 * Options:
 *   level          min level to emit ('trace'..'fatal', default 'info')
 *   bindings       static ctx merged into every event (service, env, version…)
 *   transports     [] of transports (default: [consoleTransport()])
 *   timezone       IANA tz (default 'Asia/Jerusalem')
 *   sample         { trace: 0..1, debug: 0..1 } sampling ratio
 *   redact         true to redact PII (default true)
 *   hostname       override os.hostname()
 *   now            () → Date override for tests
 *   random         () → [0,1) override for tests
 *   onError        (err) → void — called if all transports error
 */
function createLogger(opts) {
  opts = opts || {};

  const level = (opts.level && LEVELS[opts.level] != null) ? opts.level : 'info';
  const levelNum = LEVELS[level];
  const bindings = { ...(opts.bindings || {}) };
  const timezone = opts.timezone || DEFAULT_TZ;
  const sample = opts.sample || {};
  const redactOn = opts.redact !== false;
  const hostname = opts.hostname || os.hostname();
  const now = typeof opts.now === 'function' ? opts.now : (() => new Date());
  const rand = typeof opts.random === 'function' ? opts.random : Math.random;
  const onError = typeof opts.onError === 'function' ? opts.onError : null;
  const transports = Array.isArray(opts.transports) && opts.transports.length
    ? opts.transports.slice()
    : [consoleTransport()];

  // Base context — filled in lazily per event.
  const baseCtx = Object.freeze({
    service:  bindings.service  || 'techno-kol-ops',
    env:      bindings.env      || process.env.NODE_ENV || 'development',
    version:  bindings.version  || process.env.APP_VERSION || null,
    host:     hostname,
  });

  function shouldSample(lvlName) {
    if (lvlName !== 'trace' && lvlName !== 'debug') return true;
    const ratio = sample[lvlName];
    if (!Number.isFinite(ratio)) return true;
    if (ratio >= 1) return true;
    if (ratio <= 0) return false;
    return rand() < ratio;
  }

  function buildEvent(lvlName, msg, ctx) {
    // Lazy evaluation: if ctx is a function, call it (for expensive fields).
    let extra = ctx;
    if (typeof ctx === 'function') {
      try { extra = ctx(); } catch (_e) { extra = { __ctx_error__: String(_e && _e.message) }; }
    }
    const storeCtx = getCurrentContext() || {};
    const evt = {
      timestamp:  formatIsoWithTz(now(), timezone),
      level:      lvlName,
      msg:        typeof msg === 'string' ? msg : safeStringify(msg),
      ...baseCtx,
      ...bindings,
      ...storeCtx,
      ...(extra && typeof extra === 'object' ? extra : (extra != null ? { data: extra } : {})),
    };
    // Ensure correlation IDs surface even if only in the async store.
    if (storeCtx.request_id && !evt.request_id) evt.request_id = storeCtx.request_id;
    if (storeCtx.trace_id   && !evt.trace_id)   evt.trace_id   = storeCtx.trace_id;
    if (storeCtx.user_id    && !evt.user_id)    evt.user_id    = storeCtx.user_id;

    return redactOn ? redactPii(evt) : evt;
  }

  function emit(lvlName, msg, ctx) {
    const lvlNum = LEVELS[lvlName];
    if (lvlNum == null) return;
    if (lvlNum < levelNum) return;
    if (!shouldSample(lvlName)) return;

    let event, line;
    try {
      event = buildEvent(lvlName, msg, ctx);
      line = safeStringify(event);
    } catch (_e) {
      line = safeStringify({
        timestamp: formatIsoWithTz(now(), timezone),
        level: lvlName,
        msg: '[logger.buildEvent failed]',
        error: String(_e && _e.message),
      });
      event = { level: lvlName };
    }

    let errorCount = 0;
    for (const t of transports) {
      try { t.write(line, event); }
      catch (_e) { errorCount++; }
    }
    if (errorCount === transports.length && onError) {
      try { onError(new Error('all transports failed')); } catch (_e) {}
    }
  }

  function flush() {
    for (const t of transports) {
      try { if (t.flush) t.flush(); } catch (_e) {}
    }
  }

  function close() {
    for (const t of transports) {
      try { if (t.close) t.close(); } catch (_e) {}
    }
  }

  const logger = {
    level,
    bindings,
    timezone,
    transports,
    trace: (m, c) => emit('trace', m, c),
    debug: (m, c) => emit('debug', m, c),
    info:  (m, c) => emit('info',  m, c),
    warn:  (m, c) => emit('warn',  m, c),
    error: (m, c) => emit('error', m, c),
    fatal: (m, c) => emit('fatal', m, c),
    child(extraBindings) {
      const merged = { ...bindings, ...(extraBindings || {}) };
      return createLogger({
        level, bindings: merged, transports, timezone,
        sample, redact: redactOn, hostname, now, random: rand, onError,
      });
    },
    withRequest(req) {
      const b = {};
      if (req && req.id) b.request_id = req.id;
      if (req && req.headers) {
        const hid = req.headers['x-request-id'] || req.headers['x-correlation-id'];
        if (hid && !b.request_id) b.request_id = String(hid);
        const tid = req.headers['x-trace-id'];
        if (tid) b.trace_id = String(tid);
      }
      if (req && req.user && req.user.id) b.user_id = req.user.id;
      if (req && req.method) b.method = req.method;
      if (req && (req.originalUrl || req.url)) b.url = req.originalUrl || req.url;
      return this.child(b);
    },
    flush,
    close,
    _emit: emit,          // internal hook for tests
    _buildEvent: buildEvent, // internal hook for tests
  };

  return logger;
}

// ════════════════════════════════════════════════════════════════════════════
// 8. EXPRESS MIDDLEWARE
// ════════════════════════════════════════════════════════════════════════════

/**
 * correlationId() — mints/propagates x-request-id + opens an async scope.
 * Reads `x-request-id` / `x-correlation-id` / `x-trace-id` from headers,
 * generates a new one if absent, echoes it on the response, and binds it
 * into AsyncLocalStorage so every log line in the request is correlated.
 */
function correlationId(opts) {
  opts = opts || {};
  const headerName = opts.header || 'x-request-id';
  return function onyxCorrelationId(req, res, next) {
    try {
      const incoming =
        (req.headers && (req.headers[headerName] || req.headers['x-correlation-id'])) || null;
      const rid = (typeof incoming === 'string' && incoming.length > 0)
        ? incoming
        : crypto.randomBytes(8).toString('hex');
      req.id = rid;
      const trace = req.headers && req.headers['x-trace-id'];
      try { res.setHeader(headerName, rid); } catch (_e) {}
      runWithContext(
        { request_id: rid, trace_id: trace || undefined },
        () => next()
      );
    } catch (_e) {
      next();
    }
  };
}

/**
 * requestLogger(logger, opts) — logs request start + response finish with
 * timing.  Assumes `correlationId()` is already in place, but works on its
 * own as a best-effort fallback.
 */
function requestLogger(logger, opts) {
  opts = opts || {};
  const skipPaths = new Set(opts.skipPaths || ['/metrics', '/healthz', '/favicon.ico']);
  return function onyxRequestLogger(req, res, next) {
    const url = req.originalUrl || req.url || '';
    const path = url.split('?')[0];
    if (skipPaths.has(path)) return next();

    const start = process.hrtime.bigint();
    const childLog = logger.withRequest ? logger.withRequest(req) : logger;

    try {
      childLog.info('request.start', {
        method: req.method,
        url: url,
        ip: req.ip || (req.socket && req.socket.remoteAddress) || null,
        ua: req.headers && req.headers['user-agent'] || null,
      });
    } catch (_e) {}

    res.on('finish', () => {
      try {
        const dur = Number(process.hrtime.bigint() - start) / 1e6;
        const status = res.statusCode;
        const lvl = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info';
        childLog[lvl]('request.end', {
          method: req.method,
          url: url,
          status,
          duration_ms: Math.round(dur * 100) / 100,
        });
      } catch (_e) {}
    });

    (req).log = childLog;
    next();
  };
}

// ════════════════════════════════════════════════════════════════════════════
// 9. EXPORTS
// ════════════════════════════════════════════════════════════════════════════

module.exports = {
  // Factory + context
  createLogger,
  runWithContext,
  getCurrentContext,

  // Redaction
  redactPii,

  // Transports
  consoleTransport,
  fileTransport,
  httpTransport,

  // Middleware
  requestLogger,
  correlationId,

  // Constants (for callers + tests)
  LEVELS,
  LEVEL_NAMES,
  DEFAULT_TZ,
  PII_KEYS,

  // Internals (for tests)
  _internal: {
    formatIsoWithTz,
    luhnValid,
    maskIsraeliId,
    maskPhone,
    maskEmail,
    maskCreditCard,
    maskBankAccount,
    redactString,
    safeStringify,
    MAX_FIELD_BYTES,
    MAX_EVENT_BYTES,
  },
};
