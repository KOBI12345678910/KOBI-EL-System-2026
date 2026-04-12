/**
 * TECHNO-KOL OPS — Security Middleware Bundle
 * Agent-21 hardening pack (2026-04-11)
 *
 * Mirrors the security posture used in onyx-procurement/server.js:
 *   - helmet()              → standard security headers
 *   - express.json(5mb)     → bounded JSON body
 *   - cors(ALLOWED_ORIGINS) → origin allowlist from env
 *   - rateLimit for /api/   → per-IP throttle
 *   - requireAuth           → JWT Bearer token (falls back to X-API-Key)
 *   - validateEnv()         → fail-fast env validation
 *
 * Usage (CommonJS — loadable from both TS and JS):
 *
 *   // in src/index.ts, near the top (after dotenv.config()):
 *   const {
 *     validateEnv, helmetMw, jsonBodyMw, corsMw,
 *     apiRateLimit, requireAuth
 *   } = require('./middleware/security.js');
 *
 *   validateEnv();           // fail fast
 *   app.use(helmetMw);
 *   app.use(jsonBodyMw);
 *   app.use(corsMw);
 *   app.use('/api/', apiRateLimit);
 *   app.use('/api/', requireAuth);   // after mounting public /api/auth/login
 *
 * This file is .js (CommonJS) on purpose: it can be required from a running
 * TS server via tsx without any build step, and it can also be imported from
 * compiled dist/ at runtime without needing type re-compilation.
 *
 * DEPENDENCIES (add to package.json — see INSTRUCTIONS_TO_WIRE.md):
 *   npm install helmet express-rate-limit
 *
 * NOTHING IS DELETED. Existing auth.ts stays. This is an additive bundle.
 */

'use strict';

// ═══════════════════════════════════════════════════════════════
// 1. ENV VALIDATION — fail fast with clear error
// ═══════════════════════════════════════════════════════════════
const REQUIRED_ENV = ['JWT_SECRET', 'DATABASE_URL'];
const RECOMMENDED_ENV = ['ALLOWED_ORIGINS', 'NODE_ENV', 'APP_URL'];

function validateEnv() {
  const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
  if (missing.length) {
    console.error('');
    console.error('TECHNO-KOL OPS boot failed — missing required env vars:');
    missing.forEach((k) => console.error(`   - ${k}`));
    console.error('');
    console.error('   Copy .env.example -> .env and fill in real values.');
    console.error('');
    process.exit(1);
  }

  // Refuse the well-known default JWT secret in production
  const defaultSecrets = new Set([
    'techno_kol_secret_2026_palantir',
    'changeme',
    'secret',
    'development',
  ]);
  if (
    process.env.NODE_ENV === 'production' &&
    defaultSecrets.has(process.env.JWT_SECRET)
  ) {
    console.error(
      'TECHNO-KOL OPS refuses to boot: JWT_SECRET is set to a default/known value in production.'
    );
    console.error('   Generate one with:  openssl rand -hex 32');
    process.exit(1);
  }

  RECOMMENDED_ENV.forEach((k) => {
    if (!process.env[k]) {
      console.warn(`[security] recommended env var not set: ${k}`);
    }
  });
}

// ═══════════════════════════════════════════════════════════════
// 2. HELMET — standard security headers
// ═══════════════════════════════════════════════════════════════
let helmetMw;
try {
  const helmet = require('helmet');
  helmetMw = helmet({
    // RTL dashboard / dynamic content → CSP tuned permissively; tighten later.
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    crossOriginEmbedderPolicy: false,
  });
} catch (e) {
  console.warn(
    '[security] helmet not installed — run `npm install helmet`. Falling back to no-op.'
  );
  helmetMw = (_req, _res, next) => next();
}

// ═══════════════════════════════════════════════════════════════
// 3. JSON BODY — bounded to 5mb
// ═══════════════════════════════════════════════════════════════
const express = require('express');
const jsonBodyMw = express.json({
  limit: '5mb',
  // Capture raw body in case a future webhook route needs HMAC verification.
  verify: (req, _res, buf) => {
    req.rawBody = buf;
  },
});

// ═══════════════════════════════════════════════════════════════
// 4. CORS — origin allowlist from ALLOWED_ORIGINS
// ═══════════════════════════════════════════════════════════════
const cors = require('cors');
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

const corsMw = cors({
  origin: (origin, cb) => {
    // Allow same-origin / curl / server-to-server (no Origin header).
    if (!origin) return cb(null, true);
    if (ALLOWED_ORIGINS.length === 0) {
      // No allowlist configured → default-deny in production, allow in dev.
      if (process.env.NODE_ENV === 'production') {
        return cb(new Error('CORS: no ALLOWED_ORIGINS configured'), false);
      }
      return cb(null, true);
    }
    if (ALLOWED_ORIGINS.includes('*') || ALLOWED_ORIGINS.includes(origin)) {
      return cb(null, true);
    }
    return cb(new Error(`CORS: origin not allowed: ${origin}`), false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-API-Key',
    'X-Requested-With',
  ],
});

// ═══════════════════════════════════════════════════════════════
// 5. RATE LIMIT — per-IP throttle on /api/
// ═══════════════════════════════════════════════════════════════
let apiRateLimit;
let loginRateLimit;
try {
  const rateLimit = require('express-rate-limit');

  apiRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 min
    max: parseInt(process.env.RATE_LIMIT_API_MAX, 10) || 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests — rate limit exceeded (15 min window)' },
  });

  // Tighter limit on the login endpoint specifically — brute-force guard.
  loginRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: parseInt(process.env.RATE_LIMIT_LOGIN_MAX, 10) || 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many login attempts — try again in 15 minutes' },
  });
} catch (e) {
  console.warn(
    '[security] express-rate-limit not installed — run `npm install express-rate-limit`. Falling back to no-op.'
  );
  const noop = (_req, _res, next) => next();
  apiRateLimit = noop;
  loginRateLimit = noop;
}

// ═══════════════════════════════════════════════════════════════
// 6. REQUIRE AUTH — JWT Bearer (+ X-API-Key fallback)
// ═══════════════════════════════════════════════════════════════
const jwt = require('jsonwebtoken');

const API_KEYS = (process.env.API_KEYS || '')
  .split(',')
  .map((k) => k.trim())
  .filter(Boolean);

// Public endpoints that skip auth
const PUBLIC_API_PATHS = new Set([
  '/health',
  '/status',
  '/auth/login',
  '/auth/register',
]);

function requireAuth(req, res, next) {
  // Strip mount prefix ("/api") so PUBLIC_API_PATHS check is stable
  const sub = req.path.replace(/^\/api/, '') || req.path;
  if (PUBLIC_API_PATHS.has(sub)) {
    req.actor = 'public';
    return next();
  }

  // 1) JWT bearer
  const authHeader = req.headers.authorization || '';
  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = decoded;
      req.actor = `user:${decoded.username || decoded.id}`;
      return next();
    } catch (err) {
      return res
        .status(401)
        .json({ error: 'Invalid or expired token' });
    }
  }

  // 2) X-API-Key fallback (service-to-service)
  const apiKey = req.headers['x-api-key'];
  if (apiKey && API_KEYS.includes(apiKey)) {
    req.actor = `api_key:${apiKey.slice(0, 6)}...`;
    return next();
  }

  return res
    .status(401)
    .json({ error: 'Unauthorized — Bearer token or X-API-Key required' });
}

// ═══════════════════════════════════════════════════════════════
// 7. GLOBAL ERROR HANDLER — never leaks stack traces in prod
// ═══════════════════════════════════════════════════════════════
function errorHandler(err, req, res, _next) {
  // CORS error path
  if (err && /^CORS:/.test(String(err.message || ''))) {
    return res.status(403).json({ error: err.message });
  }
  const status = err.status || err.statusCode || 500;
  const body = {
    error: err.message || 'Internal Server Error',
  };
  if (process.env.NODE_ENV !== 'production' && err.stack) {
    body.stack = err.stack;
  }
  console.error(
    `[error] ${req.method} ${req.originalUrl} → ${status}: ${err.message}`
  );
  res.status(status).json(body);
}

// ═══════════════════════════════════════════════════════════════
// 8. GRACEFUL SHUTDOWN HELPER
// ═══════════════════════════════════════════════════════════════
function installGracefulShutdown(server, { pool } = {}) {
  let shuttingDown = false;
  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[shutdown] received ${signal}, draining...`);
    // Stop accepting new connections
    server.close(() => console.log('[shutdown] http server closed'));
    // Close PG pool
    if (pool && typeof pool.end === 'function') {
      try {
        await pool.end();
        console.log('[shutdown] pg pool drained');
      } catch (e) {
        console.warn('[shutdown] pg pool drain failed:', e.message);
      }
    }
    // Give in-flight WS / requests 10s to finish, then exit.
    setTimeout(() => process.exit(0), 10_000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('unhandledRejection', (reason) => {
    console.error('[unhandledRejection]', reason);
  });
  process.on('uncaughtException', (err) => {
    console.error('[uncaughtException]', err);
    shutdown('uncaughtException');
  });
}

// ═══════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════
module.exports = {
  validateEnv,
  helmetMw,
  jsonBodyMw,
  corsMw,
  apiRateLimit,
  loginRateLimit,
  requireAuth,
  errorHandler,
  installGracefulShutdown,
  ALLOWED_ORIGINS,
  PUBLIC_API_PATHS,
};
