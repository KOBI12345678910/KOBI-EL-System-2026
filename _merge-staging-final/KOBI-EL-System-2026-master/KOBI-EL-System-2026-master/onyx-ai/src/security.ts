/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  ONYX AI — Security Middleware
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Provides a minimal, dependency-free API-key gate that can be dropped
 *  into either the existing node:http-based `APIServer` or any Express-
 *  compatible app without touching framework internals.
 *
 *  Keys come from the environment variable ONYX_AI_API_KEYS as a comma-
 *  separated list. If the variable is unset or empty AND we are in
 *  development (NODE_ENV !== 'production'), the middleware bypasses the
 *  check to keep local DX frictionless. In production with no keys set
 *  the middleware CLOSES the gate (fail-closed).
 *
 *  Header:   X-API-Key: <one of the configured keys>
 *
 *  Exports:
 *    - loadApiKeys()          — parse env once, trimmed and de-duplicated
 *    - isApiKeyAuthorized()   — pure predicate, timing-safe compare
 *    - apiKeyMiddleware()     — Express-style (req, res, next) middleware
 *    - checkRawApiKey()       — adapter for the raw http.Server route
 *    - buildAuthFailureBody() — canonical error payload
 *
 *  No cleartext secrets are logged. Timing-safe comparison is used for the
 *  key match so that attackers cannot short-circuit the check via latency.
 *
 *  See INSTRUCTIONS_TO_WIRE.md for how to import this into src/index.ts
 *  without editing the existing bootstrap block.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import * as crypto from 'crypto';

// ─────────────────────────────────────────────────────────────────────────
// Structural types — avoids hard-depending on @types/express, while still
// being 100% compatible with Express 4.x / 5.x middlewares.
// ─────────────────────────────────────────────────────────────────────────

export interface ExpressLikeRequest {
  headers: Record<string, string | string[] | undefined>;
  method?: string;
  url?: string;
  // Allow ad-hoc attachment of auth metadata without coupling to Express.
  [k: string]: unknown;
}

export interface ExpressLikeResponse {
  status: (code: number) => ExpressLikeResponse;
  json: (body: unknown) => void;
  setHeader?: (name: string, value: string) => void;
}

export type ExpressLikeNext = (err?: unknown) => void;

export interface ApiKeyMiddlewareOptions {
  /** Explicit key list (overrides env). Useful for tests. */
  keys?: string[];
  /** Header name to read. Defaults to 'x-api-key'. */
  headerName?: string;
  /** Routes that must always be open (e.g., ['/health', '/ready']). */
  allowPaths?: string[];
  /** Force enable the gate even if no keys are configured. */
  requireEvenWithoutKeys?: boolean;
  /** Force bypass the gate. Overrides everything. Use for tests only. */
  disabled?: boolean;
  /** Custom logger; no PII/keys should ever be logged. */
  logger?: {
    warn: (msg: string, meta?: Record<string, unknown>) => void;
    info?: (msg: string, meta?: Record<string, unknown>) => void;
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Key parsing
// ─────────────────────────────────────────────────────────────────────────

/**
 * Load API keys from the ONYX_AI_API_KEYS env var (comma-separated).
 * Empty strings are discarded. Result is trimmed and de-duplicated.
 */
export function loadApiKeys(raw: string | undefined = process.env.ONYX_AI_API_KEYS): string[] {
  if (!raw) return [];
  const parts = raw
    .split(',')
    .map(s => s.trim())
    .filter(s => s.length > 0);
  return Array.from(new Set(parts));
}

/** True when NODE_ENV is not 'production'. */
function isDevEnvironment(): boolean {
  const env = (process.env.NODE_ENV || '').toLowerCase();
  return env !== 'production';
}

// ─────────────────────────────────────────────────────────────────────────
// Timing-safe string comparison
// ─────────────────────────────────────────────────────────────────────────

/** Constant-time string equality that won't leak length or position. */
export function timingSafeEqual(a: string, b: string): boolean {
  // We hash both sides to a fixed length so the comparison is length-stable
  // even if the caller somehow supplies a wildly different-sized key.
  const ha = crypto.createHash('sha256').update(a, 'utf8').digest();
  const hb = crypto.createHash('sha256').update(b, 'utf8').digest();
  if (ha.length !== hb.length) return false;
  try {
    return crypto.timingSafeEqual(ha, hb);
  } catch {
    return false;
  }
}

/**
 * Pure predicate — does the presented key match any configured key?
 * Always runs every comparison so timing is independent of position.
 */
export function isApiKeyAuthorized(presented: string | undefined | null, keys: string[]): boolean {
  if (!presented) return false;
  if (keys.length === 0) return false;
  let matched = false;
  for (const k of keys) {
    // DO NOT short-circuit: OR all results so every comparison runs.
    matched = timingSafeEqual(presented, k) || matched;
  }
  return matched;
}

// ─────────────────────────────────────────────────────────────────────────
// Header extraction
// ─────────────────────────────────────────────────────────────────────────

function extractHeader(
  headers: Record<string, string | string[] | undefined>,
  name: string,
): string | undefined {
  // Node lowercases header names on incoming requests; still normalize.
  const target = name.toLowerCase();
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() !== target) continue;
    if (Array.isArray(v)) return v[0];
    return v;
  }
  return undefined;
}

// ─────────────────────────────────────────────────────────────────────────
// Canonical error payload
// ─────────────────────────────────────────────────────────────────────────

export function buildAuthFailureBody(reason: 'missing' | 'invalid'): Record<string, unknown> {
  return {
    error: 'unauthorized',
    reason: reason === 'missing'
      ? 'X-API-Key header is required'
      : 'Invalid API key',
    timestamp: Date.now(),
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Express-style middleware factory
// ─────────────────────────────────────────────────────────────────────────

/**
 * apiKeyMiddleware(options?) returns an Express-compatible middleware
 * that rejects requests lacking a valid X-API-Key header.
 *
 * Behaviour matrix:
 *
 *   keys configured | NODE_ENV=prod | result
 *   ----------------+---------------+------------------------------
 *   yes             | any           | enforced
 *   no              | production    | enforced (fail-closed), 401
 *   no              | dev/test      | bypassed (with a single warn)
 *
 *   opts.disabled=true           → bypassed unconditionally
 *   opts.requireEvenWithoutKeys  → enforced regardless of env
 *   opts.allowPaths              → listed paths bypass the gate
 *
 * Attaches `req.authMode = 'api-key' | 'bypass'` so downstream handlers
 * can distinguish authenticated requests from dev bypass.
 */
export function apiKeyMiddleware(options: ApiKeyMiddlewareOptions = {}) {
  const headerName = (options.headerName || 'x-api-key').toLowerCase();
  const allowPaths = new Set((options.allowPaths || []).map(p => p.toLowerCase()));
  const logger = options.logger;
  const disabled = options.disabled === true;
  const explicitKeys = options.keys;

  // Resolve key list once at factory time. Consumers that want hot-reload
  // should rebuild the middleware on config change.
  const keys = explicitKeys !== undefined ? [...explicitKeys] : loadApiKeys();

  const devBypass = keys.length === 0 && isDevEnvironment() && !options.requireEvenWithoutKeys;
  if (devBypass && logger?.warn) {
    logger.warn('[onyx-ai:security] No ONYX_AI_API_KEYS configured — API key gate is BYPASSED (dev only).');
  }
  if (keys.length === 0 && !devBypass && !disabled && logger?.warn) {
    logger.warn('[onyx-ai:security] No ONYX_AI_API_KEYS configured in production — all requests will be rejected.');
  }

  return function apiKeyMiddlewareHandler(
    req: ExpressLikeRequest,
    res: ExpressLikeResponse,
    next: ExpressLikeNext,
  ): void {
    if (disabled) {
      (req as { authMode?: string }).authMode = 'disabled';
      next();
      return;
    }

    // Allow-list path bypass
    const url = typeof req.url === 'string' ? req.url : '';
    const pathOnly = url.split('?')[0].toLowerCase();
    if (allowPaths.has(pathOnly)) {
      (req as { authMode?: string }).authMode = 'allowlisted';
      next();
      return;
    }

    // Dev bypass when no keys are configured
    if (devBypass) {
      (req as { authMode?: string }).authMode = 'bypass';
      next();
      return;
    }

    const presented = extractHeader(req.headers, headerName);
    if (!presented) {
      res.status(401).json(buildAuthFailureBody('missing'));
      return;
    }

    if (!isApiKeyAuthorized(presented, keys)) {
      res.status(401).json(buildAuthFailureBody('invalid'));
      return;
    }

    (req as { authMode?: string }).authMode = 'api-key';
    next();
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Adapter for the raw node:http server inside src/index.ts
// ─────────────────────────────────────────────────────────────────────────

/**
 * checkRawApiKey — pure function for use inside the existing APIServer.
 *
 * Call this at the top of APIServer.route(...) (or inside the http
 * request handler just before routing). Returns `null` when the request
 * is allowed to proceed, or a `{ status, body }` pair that should be
 * written straight back to the client.
 *
 * Usage (suggested — see INSTRUCTIONS_TO_WIRE.md):
 *
 *   const denied = checkRawApiKey(req, { allowPaths: ['/health', '/ready'] });
 *   if (denied) {
 *     res.writeHead(denied.status);
 *     res.end(JSON.stringify(denied.body));
 *     return;
 *   }
 */
export function checkRawApiKey(
  req: { headers: Record<string, string | string[] | undefined>; url?: string },
  options: Omit<ApiKeyMiddlewareOptions, 'logger'> = {},
): { status: number; body: Record<string, unknown> } | null {
  const headerName = (options.headerName || 'x-api-key').toLowerCase();
  const allowPaths = new Set((options.allowPaths || []).map(p => p.toLowerCase()));

  if (options.disabled === true) return null;

  const url = typeof req.url === 'string' ? req.url : '';
  const pathOnly = url.split('?')[0].toLowerCase();
  if (allowPaths.has(pathOnly)) return null;

  const keys = options.keys !== undefined ? [...options.keys] : loadApiKeys();
  const devBypass = keys.length === 0 && isDevEnvironment() && !options.requireEvenWithoutKeys;
  if (devBypass) return null;

  const presented = extractHeader(req.headers, headerName);
  if (!presented) {
    return { status: 401, body: buildAuthFailureBody('missing') };
  }
  if (!isApiKeyAuthorized(presented, keys)) {
    return { status: 401, body: buildAuthFailureBody('invalid') };
  }
  return null;
}
