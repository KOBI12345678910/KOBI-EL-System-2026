/**
 * ONYX — Tiered Rate-Limiting Middleware
 * ═══════════════════════════════════════════════════════════════
 *
 * Pure in-memory sliding-window limiter — NO external deps.
 * Coexists with the existing express-rate-limit pools in server.js
 * (apiLimiter 300/15min, webhookLimiter 120/min) by layering a
 * finer-grained per-minute tier on top per (IP + API-key).
 *
 * Tiers:
 *   - readLimiter       100 req/min — cheap GETs, lookups, lists
 *   - writeLimiter       20 req/min — POST/PUT/PATCH/DELETE mutations
 *   - expensiveLimiter    5 req/min — exports, PCN836 gen, bulk PDF
 *
 * Key: `${ip}::${apiKey || 'anon'}`
 * Window: sliding 60-second window (drops old hits via timestamp filter)
 *
 * Headers set on every response (success AND 429):
 *   X-RateLimit-Limit      — tier cap
 *   X-RateLimit-Remaining  — hits left in current window
 *   X-RateLimit-Reset      — unix epoch seconds when oldest hit ages out
 *
 * 429 body:
 *   { error, retry_after_seconds, tier }
 *
 * Exempt paths (never limited): /healthz /livez /readyz /metrics
 *
 * NOTE: This module is PROCESS-LOCAL. Multi-instance deployments
 * should swap the `store` for Redis (same API: hits.push/filter).
 * Do not use for cryptographic rate limits or billing quotas.
 */

'use strict';

// ─── Tier configuration ──────────────────────────────────────────
const WINDOW_MS = 60 * 1000; // sliding 60s window for all tiers

const TIERS = Object.freeze({
  read:      { name: 'read',      max: 100 },
  write:     { name: 'write',     max: 20  },
  expensive: { name: 'expensive', max: 5   },
});

// ─── Exempt paths (health/metrics never counted) ─────────────────
const EXEMPT_PATHS = new Set(['/healthz', '/livez', '/readyz', '/metrics']);

// ─── In-memory sliding-window store ──────────────────────────────
// Shape: Map<tierName, Map<key, number[]>>  (array of hit timestamps, ms)
const store = new Map();
for (const tierName of Object.keys(TIERS)) store.set(tierName, new Map());

// Opportunistic GC — every WINDOW_MS * 5 prune empty-array entries
// to keep memory bounded on low-traffic tiers. Not a hard guarantee.
let _lastGc = Date.now();
function _maybeGc(now) {
  if (now - _lastGc < WINDOW_MS * 5) return;
  _lastGc = now;
  for (const tierMap of store.values()) {
    for (const [k, arr] of tierMap) {
      const pruned = arr.filter(ts => now - ts < WINDOW_MS);
      if (pruned.length === 0) tierMap.delete(k);
      else if (pruned.length !== arr.length) tierMap.set(k, pruned);
    }
  }
}

// ─── Key builder: (IP + X-API-Key) ───────────────────────────────
function _keyFor(req) {
  const ip =
    (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    req.ip ||
    (req.connection && req.connection.remoteAddress) ||
    'unknown';
  const apiKey =
    req.headers['x-api-key'] ||
    (req.headers.authorization || '').replace(/^Bearer\s+/i, '') ||
    'anon';
  // Only include a prefix of the key — full key is not needed to
  // namespace buckets and avoids accidental exposure in dumps/logs.
  const keyFp = apiKey === 'anon' ? 'anon' : apiKey.slice(0, 12);
  return `${ip}::${keyFp}`;
}

// ─── Core limiter factory ────────────────────────────────────────
function _makeLimiter(tier) {
  const { name, max } = tier;

  return function limiter(req, res, next) {
    // Skip exempt endpoints entirely (no counters, no headers).
    if (EXEMPT_PATHS.has(req.path)) return next();

    const now = Date.now();
    _maybeGc(now);

    const tierMap = store.get(name);
    const key = _keyFor(req);

    // Sliding-window prune: drop hits older than WINDOW_MS
    const prev = tierMap.get(key) || [];
    const windowStart = now - WINDOW_MS;
    const hits = prev.filter(ts => ts > windowStart);

    const remaining = Math.max(0, max - hits.length - 1);
    const oldestHit = hits.length ? hits[0] : now;
    const resetMs = oldestHit + WINDOW_MS;
    const resetSec = Math.ceil(resetMs / 1000);

    // Always emit rate headers — clients should see budget for success too.
    res.setHeader('X-RateLimit-Limit', String(max));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, remaining)));
    res.setHeader('X-RateLimit-Reset', String(resetSec));

    if (hits.length >= max) {
      const retryAfterSec = Math.max(1, Math.ceil((resetMs - now) / 1000));
      res.setHeader('Retry-After', String(retryAfterSec));
      return res.status(429).json({
        error: `Rate limit exceeded for ${name} tier (${max} req/min)`,
        retry_after_seconds: retryAfterSec,
        tier: name,
      });
    }

    hits.push(now);
    tierMap.set(key, hits);
    return next();
  };
}

// ─── Public limiters ─────────────────────────────────────────────
const readLimiter = _makeLimiter(TIERS.read);
const writeLimiter = _makeLimiter(TIERS.write);
const expensiveLimiter = _makeLimiter(TIERS.expensive);

// ─── Route → tier classifier ─────────────────────────────────────
// Used by operators to reason about which limiter applies where,
// and (optionally) by a wrapper that auto-selects at request time.
const EXPENSIVE_PATTERNS = [
  /\/export(\b|\/)/i,
  /\/exports?\//i,
  /\/pcn836(\b|\/)/i,
  /\/pcn-?836/i,
  /\/pdf\/bulk/i,
  /\/bulk[-_]?pdf/i,
  /\/reports?\/generate/i,
  /\/backup/i,
];

function tierForRoute(req) {
  const path = (req && (req.path || req.originalUrl || req.url)) || '';
  const method = String((req && req.method) || 'GET').toUpperCase();

  // Expensive always wins regardless of method (exports may be GET)
  for (const rx of EXPENSIVE_PATTERNS) {
    if (rx.test(path)) return 'expensive';
  }

  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    return 'read';
  }
  return 'write';
}

// ─── Test / ops helpers (non-production surface) ─────────────────
function _resetAll() {
  for (const tierMap of store.values()) tierMap.clear();
  _lastGc = Date.now();
}

function _snapshot() {
  const out = {};
  for (const [tierName, tierMap] of store) {
    out[tierName] = { buckets: tierMap.size };
  }
  return out;
}

module.exports = {
  readLimiter,
  writeLimiter,
  expensiveLimiter,
  tierForRoute,
  EXEMPT_PATHS,
  TIERS,
  WINDOW_MS,
  // internals exposed for tests only
  _resetAll,
  _snapshot,
};
