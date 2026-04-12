/**
 * ONYX Distributed Tracer / מערכת מעקב מבוזר
 * ------------------------------------------
 * Zero-dependency, W3C Trace Context / OpenTelemetry compatible tracer
 * for ONYX Procurement + Techno-Kol Uzi (Swarm 3D mega-ERP).
 *
 * Bilingual (Hebrew/English). Zero external deps — node:crypto + node:async_hooks.
 *
 * Agent X-53 — Swarm 3D — 2026-04-11
 *
 * Features (תכונות):
 *   1.  Trace ID (128-bit, random hex)                 — מזהה מסלול 128 ביט
 *   2.  Span ID  (64-bit,  random hex)                 — מזהה מקטע 64 ביט
 *   3.  Parent-child span relationships                — יחסי אב–ילד בין מקטעים
 *   4.  Span attributes (key-value)                    — מאפייני מקטע
 *   5.  Span events (timestamped)                      — אירועים חתומי זמן
 *   6.  Span status (OK, ERROR with message)           — סטטוס מקטע
 *   7.  Span kind (INTERNAL, SERVER, CLIENT, PRODUCER, CONSUMER)
 *   8.  Context propagation via `traceparent`          — העברת קונטקסט W3C
 *   9.  Baggage header support                         — תמיכה בכותרת Baggage
 *   10. Sampling (head-based percentage + tail-based hook)
 *
 * Exports:
 *   - createTracer(serviceName, version, opts?) -> Tracer
 *   - tracer.startSpan(name, opts?) -> Span
 *   - tracer.withSpan(span, fn)     -> runs fn with span as current
 *   - getCurrentSpan()              -> active span or null
 *   - extractContext(headers)       -> parent context
 *   - injectContext(headers, ctx?)  -> adds traceparent + baggage
 *
 * Span API:
 *   - span.setAttribute(k, v)
 *   - span.addEvent(name, attrs?)
 *   - span.setStatus(status, message?)
 *   - span.recordException(err)
 *   - span.setKind(kind)
 *   - span.end()
 *
 * Exporters:
 *   - consoleExporter()  — JSON-lines to stdout
 *   - otlpHttpExporter(url, opts?) — POST stub to collector
 *   - pluggable sink    — registerExporter(exporter)
 *
 * Express middleware:
 *   - traceMiddleware(tracer)
 *   - wrapFetch(tracer, fetchFn)   — auto-instruments outbound fetch
 *   - wrapDbQuery(tracer, queryFn) — auto-instruments DB queries
 *
 * Seed instrumentation helpers:
 *   - instrumentWageSlip(tracer, generator)
 *   - instrumentPdfGeneration(tracer, generator)
 *   - instrumentDbQuery(tracer, queryFn, sqlStub)
 *
 * Sampling:
 *   - head-based percentage (env: OTEL_SAMPLE_RATE)
 *   - default: 10% in prod, 100% in dev
 *   - tail-based: registerTailSampler(fn) — called with finished span,
 *     can override export decision.
 */

'use strict';

const crypto = require('node:crypto');
const { AsyncLocalStorage } = require('node:async_hooks');

// ═══════════════════════════════════════════════════════════════
// CONSTANTS / קבועים
// ═══════════════════════════════════════════════════════════════

const TRACE_ID_BYTES = 16;   // 128-bit
const SPAN_ID_BYTES  = 8;    // 64-bit
const INVALID_TRACE_ID = '00000000000000000000000000000000';
const INVALID_SPAN_ID  = '0000000000000000';

// W3C flags: bit 0 = sampled
const FLAG_SAMPLED = 0x01;

// Span kinds (OTLP)
const SPAN_KIND = Object.freeze({
  INTERNAL: 'INTERNAL',
  SERVER:   'SERVER',
  CLIENT:   'CLIENT',
  PRODUCER: 'PRODUCER',
  CONSUMER: 'CONSUMER',
});

// Status codes (OTLP)
const SPAN_STATUS = Object.freeze({
  UNSET: 'UNSET',
  OK:    'OK',
  ERROR: 'ERROR',
});

// W3C traceparent regex: "00-<32hex>-<16hex>-<2hex>"
const TRACEPARENT_RE = /^([0-9a-f]{2})-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/i;

// Baggage key=value,key=value (RFC 9562 / W3C Baggage)
const BAGGAGE_KV_RE = /^([^=\s,;]+)=([^,;]*)$/;

// Default head sample rate
const DEFAULT_SAMPLE_RATE_PROD = 0.10;  // 10%
const DEFAULT_SAMPLE_RATE_DEV  = 1.00;  // 100%

// ═══════════════════════════════════════════════════════════════
// ASYNC CONTEXT / הקשר אסינכרוני
// ═══════════════════════════════════════════════════════════════

const als = new AsyncLocalStorage();

/**
 * Returns the currently-active span, or null if none is in scope.
 * מחזיר את המקטע הפעיל בהקשר האסינכרוני הנוכחי.
 */
function getCurrentSpan() {
  const store = als.getStore();
  return (store && store.span) || null;
}

// ═══════════════════════════════════════════════════════════════
// ID GENERATION / ייצור מזהים
// ═══════════════════════════════════════════════════════════════

/**
 * Generate a 128-bit random trace id as 32-char lowercase hex.
 * ייצור מזהה מסלול אקראי 128 ביט.
 */
function generateTraceId() {
  const buf = crypto.randomBytes(TRACE_ID_BYTES);
  const hex = buf.toString('hex');
  // Very rare but per spec the all-zero id is invalid
  if (hex === INVALID_TRACE_ID) return generateTraceId();
  return hex;
}

/**
 * Generate a 64-bit random span id as 16-char lowercase hex.
 * ייצור מזהה מקטע אקראי 64 ביט.
 */
function generateSpanId() {
  const buf = crypto.randomBytes(SPAN_ID_BYTES);
  const hex = buf.toString('hex');
  if (hex === INVALID_SPAN_ID) return generateSpanId();
  return hex;
}

// ═══════════════════════════════════════════════════════════════
// SAMPLING / דגימה
// ═══════════════════════════════════════════════════════════════

function defaultSampleRate() {
  const envRate = process.env.OTEL_SAMPLE_RATE;
  if (envRate != null && envRate !== '') {
    const n = Number(envRate);
    if (Number.isFinite(n) && n >= 0 && n <= 1) return n;
  }
  const env = (process.env.NODE_ENV || 'development').toLowerCase();
  if (env === 'production' || env === 'prod') return DEFAULT_SAMPLE_RATE_PROD;
  return DEFAULT_SAMPLE_RATE_DEV;
}

/**
 * Head-based sampler: decides whether to record+export a trace
 * at span-start. Percentage in [0..1].
 */
function headSample(rate) {
  if (rate <= 0) return false;
  if (rate >= 1) return true;
  // Use crypto for unbiased decision; first byte gives us 0..255
  const b = crypto.randomBytes(1)[0];
  return (b / 256) < rate;
}

// ═══════════════════════════════════════════════════════════════
// CONTEXT PROPAGATION — W3C / הפצת הקשר
// ═══════════════════════════════════════════════════════════════

/**
 * Parse a W3C traceparent header. Returns null if invalid.
 *   traceparent: 00-<traceId:32hex>-<parentSpanId:16hex>-<flags:2hex>
 */
function parseTraceparent(header) {
  if (typeof header !== 'string') return null;
  const m = TRACEPARENT_RE.exec(header.trim());
  if (!m) return null;
  const [, version, traceId, spanId, flagsHex] = m;
  if (version === 'ff') return null;                 // forbidden per spec
  if (traceId === INVALID_TRACE_ID) return null;
  if (spanId === INVALID_SPAN_ID) return null;
  const flags = parseInt(flagsHex, 16);
  return {
    version: version.toLowerCase(),
    traceId: traceId.toLowerCase(),
    spanId:  spanId.toLowerCase(),
    flags,
    sampled: (flags & FLAG_SAMPLED) === FLAG_SAMPLED,
  };
}

/**
 * Build a traceparent header value from a span context.
 */
function formatTraceparent(traceId, spanId, flags) {
  const f = (typeof flags === 'number' ? flags : 0) & 0xff;
  return `00-${traceId}-${spanId}-${f.toString(16).padStart(2, '0')}`;
}

/**
 * Parse a W3C Baggage header into a plain object.
 * baggage: key1=val1,key2=val2;metadata  (metadata after ';' is ignored)
 */
function parseBaggage(header) {
  const out = {};
  if (typeof header !== 'string' || !header.trim()) return out;
  const parts = header.split(',');
  for (const part of parts) {
    const raw = part.split(';')[0].trim();
    if (!raw) continue;
    const m = BAGGAGE_KV_RE.exec(raw);
    if (!m) continue;
    const k = decodeURIComponent(m[1].trim());
    const v = decodeURIComponent(m[2].trim());
    if (k) out[k] = v;
  }
  return out;
}

/**
 * Serialize a baggage object into a header value.
 */
function formatBaggage(obj) {
  if (!obj || typeof obj !== 'object') return '';
  const parts = [];
  for (const k of Object.keys(obj)) {
    if (k == null) continue;
    const v = obj[k];
    if (v == null) continue;
    parts.push(`${encodeURIComponent(String(k))}=${encodeURIComponent(String(v))}`);
  }
  return parts.join(',');
}

/**
 * Extract parent span context from inbound headers.
 * Returns { traceId, spanId, sampled, baggage } or null when no parent.
 */
function extractContext(headers) {
  if (!headers || typeof headers !== 'object') return null;
  // Case-insensitive lookup
  const lower = {};
  for (const k of Object.keys(headers)) {
    lower[String(k).toLowerCase()] = headers[k];
  }
  const tp = parseTraceparent(lower['traceparent']);
  if (!tp) return null;
  const baggage = parseBaggage(lower['baggage'] || '');
  return {
    traceId: tp.traceId,
    spanId:  tp.spanId,   // this becomes the PARENT span id for new spans
    flags:   tp.flags,
    sampled: tp.sampled,
    baggage,
  };
}

/**
 * Inject the current (or supplied) span context into a headers object.
 * Mutates and returns the headers.
 */
function injectContext(headers, ctx) {
  if (!headers || typeof headers !== 'object') headers = {};
  let traceId, spanId, flags, baggage;
  if (ctx && ctx.traceId) {
    traceId = ctx.traceId;
    spanId = ctx.spanId;
    flags  = (typeof ctx.flags === 'number') ? ctx.flags : (ctx.sampled ? FLAG_SAMPLED : 0);
    baggage = ctx.baggage;
  } else {
    const span = getCurrentSpan();
    if (!span) return headers;
    traceId = span.traceId;
    spanId  = span.spanId;
    flags   = span.sampled ? FLAG_SAMPLED : 0;
    baggage = span.baggage || {};
  }
  headers['traceparent'] = formatTraceparent(traceId, spanId, flags);
  if (baggage && Object.keys(baggage).length > 0) {
    headers['baggage'] = formatBaggage(baggage);
  }
  return headers;
}

// ═══════════════════════════════════════════════════════════════
// SPAN CLASS / מחלקת מקטע
// ═══════════════════════════════════════════════════════════════

/**
 * A single trace span. Instances are created by Tracer.startSpan and
 * finalized by Span#end(). Mutations after end() are silently ignored
 * so the tracer never breaks its host app.
 */
class Span {
  constructor({
    tracer, name, kind, traceId, spanId, parentSpanId,
    sampled, attributes, baggage, startTime,
  }) {
    this.tracer        = tracer;
    this.name          = String(name || 'span');
    this.kind          = kind || SPAN_KIND.INTERNAL;
    this.traceId       = traceId;
    this.spanId        = spanId;
    this.parentSpanId  = parentSpanId || null;
    this.sampled       = !!sampled;
    this.attributes    = Object.assign({}, attributes || {});
    this.baggage       = Object.assign({}, baggage || {});
    this.events        = [];
    this.status        = { code: SPAN_STATUS.UNSET, message: null };
    this.startTime     = startTime || Date.now();
    this.startHrTime   = process.hrtime.bigint();
    this.endTime       = null;
    this.durationMs    = null;
    this.ended         = false;
    // Service identity (copied from tracer for serialization)
    this.serviceName   = tracer.serviceName;
    this.serviceVersion = tracer.serviceVersion;
  }

  /**
   * Set a single attribute (key-value). Attribute values must be
   * primitive or an array of primitives per OTLP semantics.
   */
  setAttribute(key, value) {
    if (this.ended) return this;
    if (typeof key !== 'string' || !key) return this;
    this.attributes[key] = value;
    return this;
  }

  /**
   * Set multiple attributes at once.
   */
  setAttributes(obj) {
    if (this.ended || !obj || typeof obj !== 'object') return this;
    for (const k of Object.keys(obj)) this.setAttribute(k, obj[k]);
    return this;
  }

  /**
   * Append a timestamped event within this span.
   *   span.addEvent('cache.miss', { key: 'invoice:42' })
   */
  addEvent(name, attrs) {
    if (this.ended) return this;
    if (!name) return this;
    this.events.push({
      name: String(name),
      time: Date.now(),
      attributes: attrs && typeof attrs === 'object' ? Object.assign({}, attrs) : {},
    });
    return this;
  }

  /**
   * Set the span status (OK, ERROR, UNSET).
   * For ERROR, an optional human-readable message is recorded.
   */
  setStatus(status, message) {
    if (this.ended) return this;
    if (!status) return this;
    const code = String(status).toUpperCase();
    if (!SPAN_STATUS[code]) return this;
    this.status = { code, message: message || null };
    return this;
  }

  /**
   * Record an exception as a span event and mark the span as ERROR.
   * Shape follows OTLP semantic conventions (exception.*).
   */
  recordException(err) {
    if (this.ended) return this;
    const e = err instanceof Error ? err : new Error(String(err));
    this.addEvent('exception', {
      'exception.type':    e.name || 'Error',
      'exception.message': e.message || String(err),
      'exception.stacktrace': e.stack || null,
    });
    // Per OTel: recordException does NOT automatically set status to ERROR.
    // Callers should call setStatus(ERROR) explicitly if desired. But for
    // ergonomics inside withSpan() we mark it so cancelled-ish spans surface.
    if (this.status.code === SPAN_STATUS.UNSET) {
      this.status = { code: SPAN_STATUS.ERROR, message: e.message || null };
    }
    return this;
  }

  /**
   * Change the span kind after creation (rare; useful for middlewares
   * that upgrade a generic span to SERVER).
   */
  setKind(kind) {
    if (this.ended) return this;
    if (SPAN_KIND[kind]) this.kind = kind;
    return this;
  }

  /**
   * Finalize the span — computes duration, hands it to the tracer pipeline,
   * and becomes immutable.
   */
  end(endTime) {
    if (this.ended) return this;
    this.ended = true;
    this.endTime = typeof endTime === 'number' ? endTime : Date.now();
    const endHr = process.hrtime.bigint();
    const ns = Number(endHr - this.startHrTime);
    this.durationMs = ns / 1e6;
    try {
      this.tracer._onSpanEnd(this);
    } catch (_e) { /* tracer must never throw */ }
    return this;
  }

  /**
   * Produce the OTLP-compatible JSON representation used by exporters.
   * This mirrors the shape of OpenTelemetry Protocol over JSON/HTTP.
   */
  toJSON() {
    return {
      name:          this.name,
      kind:          this.kind,
      traceId:       this.traceId,
      spanId:        this.spanId,
      parentSpanId:  this.parentSpanId,
      startTime:     new Date(this.startTime).toISOString(),
      endTime:       this.endTime != null ? new Date(this.endTime).toISOString() : null,
      durationMs:    this.durationMs,
      status:        this.status,
      attributes:    this.attributes,
      events:        this.events.map(e => ({
        name: e.name,
        time: new Date(e.time).toISOString(),
        attributes: e.attributes,
      })),
      resource: {
        'service.name':    this.serviceName,
        'service.version': this.serviceVersion,
      },
      sampled: this.sampled,
      baggage: this.baggage,
    };
  }
}

// ═══════════════════════════════════════════════════════════════
// TRACER CLASS / מחלקת Tracer
// ═══════════════════════════════════════════════════════════════

class Tracer {
  /**
   * @param {string} serviceName     e.g. 'onyx-procurement'
   * @param {string} version         e.g. '1.0.0'
   * @param {object} [opts]
   * @param {number} [opts.sampleRate]      head-based [0..1]
   * @param {Array}  [opts.exporters]       list of exporter objects
   * @param {Function}[opts.tailSampler]    fn(span) -> boolean
   */
  constructor(serviceName, version, opts) {
    opts = opts || {};
    this.serviceName    = String(serviceName || 'unknown-service');
    this.serviceVersion = String(version || '0.0.0');
    this.sampleRate = Number.isFinite(opts.sampleRate)
      ? opts.sampleRate
      : defaultSampleRate();
    this.exporters  = Array.isArray(opts.exporters) ? opts.exporters.slice() : [];
    this.tailSampler = typeof opts.tailSampler === 'function' ? opts.tailSampler : null;
    // Buffer of finished spans (exposed for tests)
    this.finished = [];
    this._bufferLimit = Number.isFinite(opts.bufferLimit) ? opts.bufferLimit : 10_000;
  }

  /**
   * Start a new span. Automatically parents to the current span if any,
   * or to the context passed in opts.parent.
   *
   * @param {string} name
   * @param {object} [opts]
   * @param {string} [opts.kind]
   * @param {object} [opts.attributes]
   * @param {object} [opts.parent]   — context from extractContext(headers)
   * @param {Span}   [opts.parentSpan]
   */
  startSpan(name, opts) {
    opts = opts || {};
    const parentSpan = opts.parentSpan || getCurrentSpan();
    const parentCtx  = opts.parent || null;

    let traceId, parentSpanId, sampled, baggage;
    if (parentSpan && !opts.newTrace) {
      traceId      = parentSpan.traceId;
      parentSpanId = parentSpan.spanId;
      sampled      = parentSpan.sampled;
      baggage      = Object.assign({}, parentSpan.baggage || {});
    } else if (parentCtx && parentCtx.traceId) {
      traceId      = parentCtx.traceId;
      parentSpanId = parentCtx.spanId;
      sampled      = !!parentCtx.sampled;
      baggage      = Object.assign({}, parentCtx.baggage || {});
    } else {
      traceId      = generateTraceId();
      parentSpanId = null;
      sampled      = headSample(this.sampleRate);
      baggage      = {};
    }

    const spanId = generateSpanId();
    const kind   = opts.kind && SPAN_KIND[opts.kind] ? opts.kind : SPAN_KIND.INTERNAL;

    const span = new Span({
      tracer:       this,
      name,
      kind,
      traceId,
      spanId,
      parentSpanId,
      sampled,
      attributes:   opts.attributes,
      baggage,
      startTime:    opts.startTime,
    });
    // Standard resource attributes
    span.setAttribute('service.name',    this.serviceName);
    span.setAttribute('service.version', this.serviceVersion);
    return span;
  }

  /**
   * Run `fn` with `span` installed as the active span for its async subtree.
   * If `fn` throws, exception is recorded and re-thrown (span is NOT ended —
   * callers still own end() so they may attach final attrs).
   *
   * Supports both sync and Promise-returning functions.
   */
  withSpan(span, fn) {
    if (!span || typeof fn !== 'function') {
      throw new TypeError('withSpan requires (span, fn)');
    }
    return als.run({ span }, () => {
      try {
        const result = fn(span);
        // If result is a thenable, attach a catch for recordException;
        // but re-throw so caller's own catch still runs.
        if (result && typeof result.then === 'function') {
          return result.then(
            (v) => v,
            (err) => {
              try { span.recordException(err); } catch (_e) {}
              throw err;
            }
          );
        }
        return result;
      } catch (err) {
        try { span.recordException(err); } catch (_e) {}
        throw err;
      }
    });
  }

  /**
   * Register an exporter (console, OTLP, custom sink).
   * Exporters receive an array of finished Span objects via `export(spans)`.
   */
  registerExporter(exporter) {
    if (!exporter || typeof exporter.export !== 'function') {
      throw new TypeError('Exporter must implement export(spans)');
    }
    this.exporters.push(exporter);
    return this;
  }

  /**
   * Register a tail-based sampler. Called with finished span; returning
   * `false` drops the span from export; `true` forces export.
   */
  registerTailSampler(fn) {
    if (typeof fn !== 'function') throw new TypeError('tailSampler must be a function');
    this.tailSampler = fn;
    return this;
  }

  /**
   * Flush finished-span buffer through all exporters.
   * Returns a promise that resolves when all exporters have completed.
   */
  async flush() {
    if (this.finished.length === 0) return;
    const batch = this.finished.splice(0, this.finished.length);
    const results = [];
    for (const ex of this.exporters) {
      try {
        const r = ex.export(batch);
        if (r && typeof r.then === 'function') results.push(r);
      } catch (_e) { /* never throw */ }
    }
    if (results.length > 0) await Promise.all(results);
  }

  /**
   * Retrieve & clear the buffer synchronously (used by tests).
   */
  drain() {
    const out = this.finished.slice();
    this.finished.length = 0;
    return out;
  }

  // Internal: called by Span#end()
  _onSpanEnd(span) {
    // Tail-based sampling: if provided, it can override head decision
    let shouldExport = span.sampled;
    if (this.tailSampler) {
      try {
        const decision = this.tailSampler(span);
        if (decision === true)  shouldExport = true;
        if (decision === false) shouldExport = false;
      } catch (_e) { /* ignore */ }
    }
    if (!shouldExport) return;
    this.finished.push(span);
    if (this.finished.length > this._bufferLimit) {
      // Drop oldest half
      this.finished.splice(0, Math.floor(this._bufferLimit / 2));
    }
    // Dispatch synchronously to exporters that want immediate delivery
    for (const ex of this.exporters) {
      if (ex && ex.immediate === true && typeof ex.export === 'function') {
        try { ex.export([span]); } catch (_e) { /* ignore */ }
      }
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// FACTORY / פונקציית יצירה
// ═══════════════════════════════════════════════════════════════

/**
 * Create a new Tracer for the given service.
 * @returns {Tracer}
 */
function createTracer(serviceName, version, opts) {
  return new Tracer(serviceName, version, opts);
}

// ═══════════════════════════════════════════════════════════════
// EXPORTERS / מייצאים
// ═══════════════════════════════════════════════════════════════

/**
 * Console exporter — writes JSON-lines to the supplied stream (stdout by default).
 */
function consoleExporter(opts) {
  opts = opts || {};
  const stream = opts.stream || process.stdout;
  const immediate = opts.immediate !== false;
  return {
    immediate,
    export(spans) {
      for (const s of spans) {
        try {
          stream.write(JSON.stringify(s.toJSON()) + '\n');
        } catch (_e) { /* swallow */ }
      }
    },
  };
}

/**
 * OTLP HTTP exporter stub — POSTs JSON to the collector endpoint.
 * Uses built-in http/https; NO external deps. Failures are swallowed.
 */
function otlpHttpExporter(url, opts) {
  opts = opts || {};
  const timeoutMs = Number.isFinite(opts.timeoutMs) ? opts.timeoutMs : 5000;
  const headers  = Object.assign({ 'content-type': 'application/json' }, opts.headers || {});
  return {
    immediate: false,
    endpoint: url,
    export(spans) {
      return new Promise((resolve) => {
        try {
          const payload = JSON.stringify({
            resourceSpans: spans.map(s => s.toJSON()),
          });
          const parsed = new URL(url);
          const lib = parsed.protocol === 'https:' ? require('node:https') : require('node:http');
          const req = lib.request({
            method: 'POST',
            hostname: parsed.hostname,
            port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
            path: parsed.pathname + (parsed.search || ''),
            headers: Object.assign({ 'content-length': Buffer.byteLength(payload) }, headers),
            timeout: timeoutMs,
          }, (res) => {
            // Drain
            res.on('data', () => {});
            res.on('end', () => resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode }));
          });
          req.on('error', () => resolve({ ok: false, error: 'network' }));
          req.on('timeout', () => { try { req.destroy(); } catch (_e) {} resolve({ ok: false, error: 'timeout' }); });
          req.write(payload);
          req.end();
        } catch (_e) {
          resolve({ ok: false, error: 'exception' });
        }
      });
    },
  };
}

// ═══════════════════════════════════════════════════════════════
// MIDDLEWARES & AUTO-INSTRUMENTATION / ביניים וצימוד אוטומטי
// ═══════════════════════════════════════════════════════════════

/**
 * Express-style middleware. Extracts parent context from headers,
 * creates a SERVER span, runs the rest of the stack inside that span,
 * and ends it when the response finishes.
 */
function traceMiddleware(tracer, opts) {
  opts = opts || {};
  return function onyxTraceMiddleware(req, res, next) {
    try {
      const parent = extractContext(req.headers || {});
      const span = tracer.startSpan(
        `${req.method} ${req.route && req.route.path || req.path || req.url || '/'}`,
        {
          kind: SPAN_KIND.SERVER,
          parent,
          attributes: {
            'http.method':     req.method,
            'http.target':     req.originalUrl || req.url,
            'http.user_agent': (req.headers && req.headers['user-agent']) || null,
            'http.host':       (req.headers && req.headers['host']) || null,
            'net.peer.ip':     req.ip || (req.socket && req.socket.remoteAddress) || null,
          },
        }
      );

      const finish = () => {
        try {
          span.setAttribute('http.status_code', res.statusCode);
          if (res.statusCode >= 500) {
            span.setStatus(SPAN_STATUS.ERROR, `HTTP ${res.statusCode}`);
          } else {
            span.setStatus(SPAN_STATUS.OK);
          }
          span.end();
        } catch (_e) { /* swallow */ }
      };
      res.on('finish', finish);
      res.on('close',  finish);

      // Propagate to outbound code via response header (so clients see it)
      try {
        res.setHeader('traceparent', formatTraceparent(
          span.traceId, span.spanId, span.sampled ? FLAG_SAMPLED : 0
        ));
      } catch (_e) { /* headers may already be sent */ }

      tracer.withSpan(span, () => next());
    } catch (err) {
      try { next(err); } catch (_e) {}
    }
  };
}

/**
 * Wrap a fetch-like function so every outbound call produces a CLIENT span
 * and automatically injects W3C traceparent/baggage into the request headers.
 *
 *   const fetchT = wrapFetch(tracer, fetch);
 *   await fetchT('https://api.example/x');
 */
function wrapFetch(tracer, fetchFn) {
  if (typeof fetchFn !== 'function') {
    throw new TypeError('wrapFetch requires a fetch-like function');
  }
  return async function tracedFetch(input, init) {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    const method = (init && init.method) || (input && input.method) || 'GET';
    const span = tracer.startSpan(`HTTP ${method}`, {
      kind: SPAN_KIND.CLIENT,
      attributes: {
        'http.method': method,
        'http.url':    url,
      },
    });
    const headers = Object.assign({}, (init && init.headers) || {});
    injectContext(headers, {
      traceId: span.traceId,
      spanId:  span.spanId,
      sampled: span.sampled,
      baggage: span.baggage,
    });
    const newInit = Object.assign({}, init || {}, { headers });
    try {
      const res = await tracer.withSpan(span, () => fetchFn(input, newInit));
      try {
        const status = (res && res.status) || 0;
        span.setAttribute('http.status_code', status);
        if (status >= 400) span.setStatus(SPAN_STATUS.ERROR, `HTTP ${status}`);
        else span.setStatus(SPAN_STATUS.OK);
      } catch (_e) {}
      return res;
    } catch (err) {
      span.recordException(err);
      span.setStatus(SPAN_STATUS.ERROR, err && err.message);
      throw err;
    } finally {
      try { span.end(); } catch (_e) {}
    }
  };
}

/**
 * Wrap a generic async DB query function so each call becomes a CLIENT span.
 *
 *   const runT = wrapDbQuery(tracer, run);
 *   await runT('SELECT * FROM invoices WHERE id = ?', [42]);
 */
function wrapDbQuery(tracer, queryFn, opts) {
  opts = opts || {};
  const system = opts.system || 'sql';
  if (typeof queryFn !== 'function') {
    throw new TypeError('wrapDbQuery requires an async query function');
  }
  return async function tracedQuery(sql, params) {
    const span = tracer.startSpan('db.query', {
      kind: SPAN_KIND.CLIENT,
      attributes: {
        'db.system':     system,
        'db.statement':  typeof sql === 'string' ? sql : '[non-string]',
        'db.params.count': Array.isArray(params) ? params.length : 0,
      },
    });
    try {
      const result = await tracer.withSpan(span, () => queryFn(sql, params));
      span.setStatus(SPAN_STATUS.OK);
      if (result && typeof result === 'object' && 'rowCount' in result) {
        span.setAttribute('db.rows_affected', result.rowCount);
      }
      return result;
    } catch (err) {
      span.recordException(err);
      span.setStatus(SPAN_STATUS.ERROR, err && err.message);
      throw err;
    } finally {
      try { span.end(); } catch (_e) {}
    }
  };
}

// ═══════════════════════════════════════════════════════════════
// SEED INSTRUMENTATION / צימוד זרעים
// ═══════════════════════════════════════════════════════════════

/**
 * Instrument a wage-slip generator so each slip produced gets its own span.
 *
 *   const genT = instrumentWageSlip(tracer, generateWageSlip);
 *   const slip = await genT(employee, period);
 */
function instrumentWageSlip(tracer, generator) {
  if (typeof generator !== 'function') {
    throw new TypeError('instrumentWageSlip requires the generator fn');
  }
  return async function tracedWageSlip(employee, period, ...rest) {
    const span = tracer.startSpan('payroll.wage_slip.generate', {
      kind: SPAN_KIND.INTERNAL,
      attributes: {
        'payroll.employee_id': employee && employee.id != null ? String(employee.id) : null,
        'payroll.period.start': period && period.start ? String(period.start) : null,
        'payroll.period.end':   period && period.end   ? String(period.end)   : null,
        'service.component': 'payroll',
      },
    });
    try {
      const slip = await tracer.withSpan(span, () => generator(employee, period, ...rest));
      if (slip && typeof slip === 'object') {
        if (slip.gross != null) span.setAttribute('payroll.gross', Number(slip.gross));
        if (slip.net   != null) span.setAttribute('payroll.net',   Number(slip.net));
      }
      span.setStatus(SPAN_STATUS.OK);
      return slip;
    } catch (err) {
      span.recordException(err);
      span.setStatus(SPAN_STATUS.ERROR, err && err.message);
      throw err;
    } finally {
      try { span.end(); } catch (_e) {}
    }
  };
}

/**
 * Instrument a PDF generator so each document creates a span.
 */
function instrumentPdfGeneration(tracer, generator) {
  if (typeof generator !== 'function') {
    throw new TypeError('instrumentPdfGeneration requires the generator fn');
  }
  return async function tracedPdfGen(doc, opts, ...rest) {
    const span = tracer.startSpan('pdf.generate', {
      kind: SPAN_KIND.INTERNAL,
      attributes: {
        'pdf.kind':     (doc && doc.kind) || 'unknown',
        'pdf.id':       (doc && doc.id) != null ? String(doc.id) : null,
        'service.component': 'pdf',
      },
    });
    try {
      const result = await tracer.withSpan(span, () => generator(doc, opts, ...rest));
      if (result && result.bytes && typeof result.bytes.length === 'number') {
        span.setAttribute('pdf.size_bytes', result.bytes.length);
      }
      span.setStatus(SPAN_STATUS.OK);
      return result;
    } catch (err) {
      span.recordException(err);
      span.setStatus(SPAN_STATUS.ERROR, err && err.message);
      throw err;
    } finally {
      try { span.end(); } catch (_e) {}
    }
  };
}

/**
 * Wrap a DB query (stub-friendly) and attach a one-line SQL summary.
 * Use for seed instrumentation where you know the SQL at call-site.
 */
function instrumentDbQuery(tracer, queryFn, sqlStub) {
  if (typeof queryFn !== 'function') {
    throw new TypeError('instrumentDbQuery requires an async query function');
  }
  const wrapped = wrapDbQuery(tracer, queryFn);
  return async function tracedSeedQuery(params) {
    return wrapped(sqlStub, params);
  };
}

// ═══════════════════════════════════════════════════════════════
// EXPORTS / ייצואים
// ═══════════════════════════════════════════════════════════════

module.exports = {
  // Factory
  createTracer,

  // Classes (exported for `instanceof` checks and direct construction in tests)
  Tracer,
  Span,

  // Context API
  getCurrentSpan,
  extractContext,
  injectContext,

  // Propagation helpers (also useful outside the tracer)
  parseTraceparent,
  formatTraceparent,
  parseBaggage,
  formatBaggage,

  // ID helpers
  generateTraceId,
  generateSpanId,

  // Sampling
  headSample,
  defaultSampleRate,

  // Exporters
  consoleExporter,
  otlpHttpExporter,

  // Middlewares / auto-instrumentation
  traceMiddleware,
  wrapFetch,
  wrapDbQuery,

  // Seed instrumentation
  instrumentWageSlip,
  instrumentPdfGeneration,
  instrumentDbQuery,

  // Constants
  SPAN_KIND,
  SPAN_STATUS,
  FLAG_SAMPLED,
  INVALID_TRACE_ID,
  INVALID_SPAN_ID,
};
