/**
 * ONYX — Idempotency-Key Middleware
 * ═══════════════════════════════════════════════════════════════
 *
 * Standard "Idempotency-Key" pattern (popularized by Stripe): clients
 * send a unique key on mutating requests. Our server caches the
 * finished response for 24h keyed by `(method, path, key)` and returns
 * it verbatim on duplicates so the underlying handler never runs twice
 * for the same submission.
 *
 * Why?
 *   - Retries from flaky networks / webhook replays / double-clicks
 *     should not create duplicate payments / invoices / POs.
 *
 * Contract:
 *   - Client sends header:   Idempotency-Key: <unique-string>
 *   - Server caches the final response (status + headers subset + body)
 *     after the handler completes successfully (2xx) OR predictably
 *     (4xx). 5xx is NOT cached so callers can retry after a real crash.
 *   - On duplicate:
 *       • same body hash         → cached response replayed (cache hit)
 *       • different body hash    → 409 Conflict (key reused with diff payload)
 *   - In-flight dedup: if the same key is still processing, the second
 *     request short-circuits with 425 Too Early.
 *
 * Scope:
 *   - Only applies to non-GET/HEAD/OPTIONS methods by default.
 *   - Only applies when the header is present (opt-in per request).
 *   - Storage is in-memory Map; single-process only. For multi-instance
 *     deployments, swap `store` for Redis using the same get/set API.
 *
 * Zero dependencies — uses Node built-ins (`crypto`) only.
 */

'use strict';

const crypto = require('crypto');

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const DEFAULT_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const MAX_KEY_LENGTH = 255;

// ─── In-memory store ────────────────────────────────────────────
// Key shape: `${method}:${path}:${idempotencyKey}`
// Value shape:
//   { status: 'pending'|'done', bodyHash, createdAt, expiresAt,
//     response?: { status, headers, body, contentType } }
const store = new Map();

function _now() { return Date.now(); }

function _hash(s) {
  return crypto.createHash('sha256').update(s).digest('hex');
}

function _bodyHash(req) {
  // Prefer raw parsed body if available. Fall back to empty.
  const b = req && req.body !== undefined ? req.body : null;
  if (b == null) return _hash('');
  if (typeof b === 'string') return _hash(b);
  if (Buffer.isBuffer(b)) return _hash(b.toString('utf8'));
  try {
    return _hash(JSON.stringify(b));
  } catch (_err) {
    return _hash(String(b));
  }
}

function _buildKey(method, path, idKey) {
  return `${method}:${path}:${idKey}`;
}

function _pruneExpired(now = _now()) {
  for (const [k, v] of store) {
    if (v.expiresAt && v.expiresAt <= now) store.delete(k);
  }
}

// ─── Public: sweep expired entries (callable from ops task) ──────
function sweep() { _pruneExpired(); return store.size; }

function clear() { store.clear(); }

function size() { return store.size; }

/**
 * idempotencyMiddleware — Express middleware factory.
 *
 * @param {Object} [opts]
 * @param {number} [opts.ttlMs=86400000]  cache lifetime (default 24h)
 * @param {Set|string[]} [opts.methods]   methods to apply to
 * @param {boolean} [opts.required=false] 400 when header missing on mutating verbs
 * @param {Function} [opts.onHit]         (req, cached) => void observability hook
 * @returns {Function} Express middleware
 */
function idempotencyMiddleware(opts = {}) {
  const ttlMs = opts.ttlMs || DEFAULT_TTL_MS;
  const methods = opts.methods instanceof Set
    ? opts.methods
    : new Set((opts.methods || [...DEFAULT_METHODS]).map((m) => m.toUpperCase()));
  const required = !!opts.required;
  const onHit = typeof opts.onHit === 'function' ? opts.onHit : () => {};

  return function idempotency(req, res, next) {
    const method = (req.method || 'GET').toUpperCase();
    if (!methods.has(method)) return next();

    const rawKey = req.headers['idempotency-key'] || req.headers['Idempotency-Key'];
    if (!rawKey) {
      if (required) {
        return res.status(400).json({
          error: `Idempotency-Key header required on ${method} ${req.path}`,
        });
      }
      return next();
    }
    const idKey = String(rawKey).trim();
    if (!idKey || idKey.length > MAX_KEY_LENGTH) {
      return res.status(400).json({
        error: `Idempotency-Key must be 1..${MAX_KEY_LENGTH} chars`,
      });
    }

    const now = _now();
    _pruneExpired(now);

    const cacheKey = _buildKey(method, req.path || req.url, idKey);
    const existing = store.get(cacheKey);
    const bodyHash = _bodyHash(req);

    // ─── In-flight dedup ───────────────────────────────────
    if (existing && existing.status === 'pending') {
      if (existing.bodyHash !== bodyHash) {
        return res.status(409).json({
          error: 'Idempotency-Key reused with a different request body',
        });
      }
      return res.status(425).json({
        error: 'Too Early: original request still processing',
        retryAfter: 1,
      });
    }

    // ─── Cache hit ─────────────────────────────────────────
    if (existing && existing.status === 'done') {
      if (existing.bodyHash !== bodyHash) {
        return res.status(409).json({
          error: 'Idempotency-Key reused with a different request body',
        });
      }
      try { onHit(req, existing); } catch (_e) { /* hook must not throw */ }
      const { response } = existing;
      res.setHeader('Idempotent-Replay', 'true');
      if (response.contentType) res.setHeader('Content-Type', response.contentType);
      if (response.headers) {
        for (const [h, v] of Object.entries(response.headers)) {
          try { res.setHeader(h, v); } catch (_e) {}
        }
      }
      res.status(response.status);
      if (response.body == null) return res.end();
      if (typeof response.body === 'string' || Buffer.isBuffer(response.body)) {
        return res.end(response.body);
      }
      return res.json(response.body);
    }

    // ─── First time seeing this key: mark pending, wrap res.end/json ─
    store.set(cacheKey, {
      status: 'pending',
      bodyHash,
      createdAt: now,
      expiresAt: now + ttlMs,
    });

    const capture = { headers: {}, body: null, contentType: null, status: 200 };
    const origJson = res.json.bind(res);
    const origSend = res.send ? res.send.bind(res) : null;
    const origEnd = res.end.bind(res);
    const origStatus = res.status.bind(res);
    const origSetHeader = res.setHeader.bind(res);

    res.status = function patchedStatus(code) {
      capture.status = code;
      return origStatus(code);
    };
    res.setHeader = function patchedSetHeader(name, value) {
      // Record a small allowlist of headers worth replaying.
      const lower = String(name).toLowerCase();
      if (['content-type', 'location', 'etag', 'cache-control'].includes(lower)) {
        capture.headers[name] = value;
        if (lower === 'content-type') capture.contentType = value;
      }
      return origSetHeader(name, value);
    };
    res.json = function patchedJson(body) {
      capture.body = body;
      capture.contentType = capture.contentType || 'application/json; charset=utf-8';
      return origJson(body);
    };
    if (origSend) {
      res.send = function patchedSend(body) {
        capture.body = body;
        return origSend(body);
      };
    }
    res.end = function patchedEnd(chunk, encoding, cb) {
      try {
        const statusCode = res.statusCode || capture.status || 200;
        // Only cache 2xx and 4xx responses; 5xx should be retryable.
        const shouldCache = (statusCode >= 200 && statusCode < 300) ||
                            (statusCode >= 400 && statusCode < 500);
        if (shouldCache) {
          store.set(cacheKey, {
            status: 'done',
            bodyHash,
            createdAt: now,
            expiresAt: now + ttlMs,
            response: {
              status: statusCode,
              headers: capture.headers,
              body: capture.body != null ? capture.body : chunk || null,
              contentType: capture.contentType,
            },
          });
        } else {
          // 5xx → drop the pending marker so retries go through.
          store.delete(cacheKey);
        }
      } catch (_err) {
        store.delete(cacheKey);
      }
      return origEnd(chunk, encoding, cb);
    };

    return next();
  };
}

module.exports = {
  idempotencyMiddleware,
  sweep,
  clear,
  size,
  DEFAULT_TTL_MS,
  DEFAULT_METHODS,
  // test-only
  _store: store,
};
