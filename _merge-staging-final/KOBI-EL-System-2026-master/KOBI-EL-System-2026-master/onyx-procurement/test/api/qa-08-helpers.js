/**
 * QA-08 — API Test Shared Helpers
 *
 * Purpose:
 *   Reusable test harness for QA-08 API tests. Builds a minimal express app
 *   that matches onyx-procurement/server.js in the critical moving parts:
 *     • express.json body parser (2mb limit)
 *     • API-key auth middleware for /api/* with a public allow-list
 *     • Global error handler that rewrites 500s in production mode
 *     • In-memory mock Supabase with a preloaded schema
 *
 *   It deliberately does NOT pull in the real server.js because that file
 *   starts a real listener and requires env vars. Instead we rebuild the
 *   subset of middleware we need and wire individual route handlers.
 *
 *   Run via:  node --test test/api/qa-08-*.test.js
 *
 * Author: QA-08 API Test Agent
 */

'use strict';

const express = require('express');
const http = require('node:http');
const { makeMockSupabase } = require('../helpers/mock-supabase');

const VALID_KEY = 'qa08-valid-key-123456';

// ─────────────────────────────────────────────────────────────────────
// Auth middleware mirroring server.js lines 137-155
// ─────────────────────────────────────────────────────────────────────
function buildAuth({ keys = [VALID_KEY], mode = 'api_key' } = {}) {
  return function requireAuth(req, res, next) {
    if (mode === 'disabled') {
      req.actor = 'anonymous';
      return next();
    }
    const apiKey = req.headers['x-api-key']
      || (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!apiKey || !keys.includes(apiKey)) {
      return res.status(401).json({ error: 'Unauthorized — missing or invalid X-API-Key header' });
    }
    req.actor = `api_key:${apiKey.slice(0, 6)}…`;
    next();
  };
}

// ─────────────────────────────────────────────────────────────────────
// Build a tiny app with the auth middleware gating /api/*
// ─────────────────────────────────────────────────────────────────────
function buildApp({
  supabase,
  authMode = 'api_key',
  mountRoutes, // (app, { supabase, audit, actor, VAT_RATE })
  publicPaths = new Set(['/status', '/health']),
} = {}) {
  const app = express();

  // Size-limited JSON parser, crashing fast on malformed bodies
  app.use((req, res, next) => {
    express.json({ limit: '2mb' })(req, res, (err) => {
      if (err) {
        return res.status(400).json({ error: 'Malformed JSON body' });
      }
      next();
    });
  });

  const requireAuth = buildAuth({ mode: authMode });
  app.use('/api/', (req, res, next) => {
    if (publicPaths.has(req.path)) { req.actor = 'public'; return next(); }
    return requireAuth(req, res, next);
  });

  // audit spy
  const auditCalls = [];
  const audit = async (entityType, entityId, action, actor, detail, prev, next) => {
    auditCalls.push({ entityType, entityId, action, actor, detail, prev, next });
  };

  if (mountRoutes) {
    mountRoutes(app, { supabase, audit, VAT_RATE: 0.17 });
  }

  // Global error handler — production mode hides stacks
  app.use((err, req, res, _next) => {
    const isProd = process.env.NODE_ENV === 'production';
    res.status(err.status || 500).json({
      error: isProd ? 'Internal server error' : err.message,
      ...(isProd ? {} : { stack: err.stack?.split('\n').slice(0, 5) }),
    });
  });

  return { app, auditCalls };
}

// ─────────────────────────────────────────────────────────────────────
// Start an ephemeral HTTP server and return {baseUrl, close()}
// Close uses a short race against a 200 ms fallback so the test runner
// does not hang on idle keep-alive sockets.
// ─────────────────────────────────────────────────────────────────────
function start(app) {
  return new Promise((resolve) => {
    const srv = http.createServer(app);
    srv.keepAliveTimeout = 50;
    srv.unref();
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      resolve({
        baseUrl: `http://127.0.0.1:${port}`,
        close: () => new Promise((r) => {
          const t = setTimeout(() => { try { srv.closeAllConnections?.(); } catch {} r(); }, 200);
          srv.close(() => { clearTimeout(t); r(); });
          try { srv.closeAllConnections?.(); } catch {}
        }),
      });
    });
  });
}

// ─────────────────────────────────────────────────────────────────────
// Low-level HTTP request helper that can send raw strings (for malformed
// JSON tests) and wires X-API-Key by default.
// ─────────────────────────────────────────────────────────────────────
function request(baseUrl, method, path, body, { rawBody, headers = {}, apiKey = VALID_KEY } = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(baseUrl + path);
    const finalHeaders = {
      'Content-Type': 'application/json',
      ...(apiKey ? { 'X-API-Key': apiKey } : {}),
      ...headers,
    };

    let payload = null;
    if (rawBody !== undefined) {
      payload = typeof rawBody === 'string' ? Buffer.from(rawBody) : rawBody;
    } else if (body !== undefined) {
      payload = Buffer.from(JSON.stringify(body));
    }
    if (payload) finalHeaders['Content-Length'] = payload.length;

    const req = http.request({
      hostname: url.hostname,
      port: url.port,
      method,
      path: url.pathname + url.search,
      headers: finalHeaders,
    }, (res) => {
      let chunks = '';
      res.on('data', (c) => { chunks += c; });
      res.on('end', () => {
        let parsed = null;
        try { parsed = chunks ? JSON.parse(chunks) : null; } catch { parsed = chunks; }
        resolve({ status: res.statusCode, headers: res.headers, body: parsed });
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

// ─────────────────────────────────────────────────────────────────────
// Quick schema validator. Checks `obj` has the listed required keys and
// that none are undefined. Returns array of missing keys.
// ─────────────────────────────────────────────────────────────────────
function missingFields(obj, required) {
  if (obj == null || typeof obj !== 'object') return required.slice();
  return required.filter(k => !(k in obj) || obj[k] === undefined);
}

// Detect leaked secrets/sensitive fields in response bodies
const SENSITIVE_KEYS = ['password', 'password_hash', 'api_key', 'apiKey', 'token', 'jwt', 'secret', 'private_key'];
function findSensitiveLeaks(obj, path = '$') {
  const leaks = [];
  if (!obj || typeof obj !== 'object') return leaks;
  for (const [k, v] of Object.entries(obj)) {
    if (SENSITIVE_KEYS.includes(k)) leaks.push(`${path}.${k}`);
    if (v && typeof v === 'object') leaks.push(...findSensitiveLeaks(v, `${path}.${k}`));
  }
  return leaks;
}

// Detect raw stack traces leaking to the client (for 500 responses)
function hasStackLeak(body) {
  if (!body || typeof body !== 'object') return false;
  return 'stack' in body && Array.isArray(body.stack) && body.stack.length > 0;
}

// Common malicious payloads
const SQL_INJECTION_PAYLOADS = [
  "' OR '1'='1",
  "'; DROP TABLE users; --",
  "admin' --",
  "1; DELETE FROM suppliers",
];

const XSS_PAYLOADS = [
  '<script>alert(1)</script>',
  '"><img src=x onerror=alert(1)>',
  'javascript:alert(1)',
  '<svg/onload=confirm(1)>',
];

module.exports = {
  VALID_KEY,
  makeMockSupabase,
  buildApp,
  start,
  request,
  missingFields,
  findSensitiveLeaks,
  hasStackLeak,
  SQL_INJECTION_PAYLOADS,
  XSS_PAYLOADS,
};
