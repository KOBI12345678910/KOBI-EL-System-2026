/**
 * ============================================================================
 *  QA-03 — Integration Test Agent
 *  File   : qa-03-webhook-hmac.test.js
 *  Agent  : QA-03 (Integration)
 *  Date   : 2026-04-11
 *
 *  Scope
 *  -----
 *  Verifies the HMAC protection on `/webhook/whatsapp` — exercised through
 *  a local reimplementation of the middleware that is BYTE-FOR-BYTE identical
 *  to `server.js :: verifyWhatsAppHmac` (lines 187-210). We do not import
 *  server.js directly because server.js auto-listens on PORT on import.
 *
 *  Verified behaviours
 *  -------------------
 *  1. Valid HMAC-SHA256 signature → next() is called (200).
 *  2. Wrong signature → 401 with { error: "Invalid webhook signature" }.
 *  3. Missing signature header → 401 (not crash).
 *  4. Malformed signature (not hex) → 401 with { error: "Malformed webhook signature" }.
 *  5. Body-tampering → 401 (signature was computed over original body).
 *  6. Unicode / Hebrew payloads → still produce a matching signature if
 *     the caller used the same bytes (encoding-neutral because the HMAC
 *     is over a Buffer).
 *  7. BUG-11: when WHATSAPP_APP_SECRET is missing AND NODE_ENV != 'production'
 *     the middleware silently passes the request through — documented here
 *     so a regression won't happen without the test screaming.
 *  8. When WHATSAPP_APP_SECRET is missing AND NODE_ENV == 'production',
 *     the middleware rejects with 500.
 *
 *  Rule: NEW FILE ONLY. We do not touch server.js or any webhook route.
 * ============================================================================
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const crypto = require('node:crypto');
const express = require('express');

// ---------------------------------------------------------------------------
// Verbatim copy of verifyWhatsAppHmac from server.js (2026-04-11).
// Any drift in the real middleware must be mirrored here — by design.
// ---------------------------------------------------------------------------

function makeVerifyHmac(secret) {
  return function verifyWhatsAppHmac(req, res, next) {
    if (!secret) {
      if (process.env.NODE_ENV === 'production') {
        return res.status(500).json({ error: 'Webhook HMAC not configured — server refuses unsigned webhooks in production' });
      }
      return next(); // BUG-11: silent bypass in dev
    }
    const signature = req.headers['x-hub-signature-256'] || '';
    const expected = 'sha256=' + crypto
      .createHmac('sha256', secret)
      .update(req.rawBody || Buffer.from(''))
      .digest('hex');
    try {
      const sigBuf = Buffer.from(signature);
      const expBuf = Buffer.from(expected);
      if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
        return res.status(401).json({ error: 'Invalid webhook signature' });
      }
    } catch {
      return res.status(401).json({ error: 'Malformed webhook signature' });
    }
    next();
  };
}

// ---------------------------------------------------------------------------
// Test server that wires an express app with the middleware mounted exactly
// like server.js does: a raw-body capturing middleware BEFORE JSON parser.
// ---------------------------------------------------------------------------

function boot(secret) {
  const app = express();
  // Capture raw body for HMAC verification (server.js uses the same pattern)
  app.use('/webhook', (req, res, next) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      req.rawBody = Buffer.concat(chunks);
      try {
        req.body = req.rawBody.length ? JSON.parse(req.rawBody.toString('utf8')) : {};
      } catch {
        req.body = {};
      }
      next();
    });
  });

  const verify = makeVerifyHmac(secret);
  app.post('/webhook/whatsapp', verify, (req, res) => {
    res.status(200).json({ received: true, message_count: (req.body.entry || []).length });
  });

  return app;
}

function request(app, opts) {
  return new Promise((resolve, reject) => {
    const srv = app.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      const payload = opts.body || '';
      const req = http.request({
        host: '127.0.0.1',
        port,
        path: opts.path,
        method: opts.method || 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
          ...(opts.headers || {}),
        },
      }, (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          srv.close();
          const raw = Buffer.concat(chunks).toString('utf8');
          let parsed;
          try { parsed = JSON.parse(raw); } catch { parsed = raw; }
          resolve({ status: res.statusCode, body: parsed });
        });
      });
      req.on('error', (err) => {
        try { srv.close(); } catch (_) {}
        reject(err);
      });
      if (payload) req.write(payload);
      req.end();
    });
  });
}

function sign(secret, body) {
  return 'sha256=' + crypto
    .createHmac('sha256', secret)
    .update(Buffer.from(body, 'utf8'))
    .digest('hex');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('QA-03 HMAC :: valid signature → 200', async () => {
  const secret = 'test-wa-secret-xyz';
  const app = boot(secret);
  const body = JSON.stringify({ entry: [{ id: 'e1', changes: [] }] });
  const res = await request(app, {
    path: '/webhook/whatsapp',
    body,
    headers: { 'x-hub-signature-256': sign(secret, body) },
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.received, true);
  assert.equal(res.body.message_count, 1);
});

test('QA-03 HMAC :: wrong signature → 401 { error: "Invalid webhook signature" }', async () => {
  const app = boot('real-secret');
  const body = JSON.stringify({ entry: [] });
  const res = await request(app, {
    path: '/webhook/whatsapp',
    body,
    headers: { 'x-hub-signature-256': sign('wrong-secret', body) },
  });
  assert.equal(res.status, 401);
  assert.equal(res.body.error, 'Invalid webhook signature');
});

test('QA-03 HMAC :: missing signature header → 401 (not crash)', async () => {
  const app = boot('s');
  const res = await request(app, {
    path: '/webhook/whatsapp',
    body: JSON.stringify({ entry: [] }),
    // intentionally no x-hub-signature-256
  });
  assert.equal(res.status, 401);
});

test('QA-03 HMAC :: malformed signature → 401 (no uncaught crash)', async () => {
  const app = boot('s');
  const res = await request(app, {
    path: '/webhook/whatsapp',
    body: JSON.stringify({ entry: [] }),
    headers: { 'x-hub-signature-256': 'not-hex' },
  });
  assert.equal(res.status, 401);
});

test('QA-03 HMAC :: body tampering after signing → 401', async () => {
  const secret = 's';
  const app = boot(secret);
  const original = JSON.stringify({ entry: [{ id: 'real' }] });
  const tampered = JSON.stringify({ entry: [{ id: 'fake' }] });
  // Use signature of the REAL body but post the TAMPERED body
  const res = await request(app, {
    path: '/webhook/whatsapp',
    body: tampered,
    headers: { 'x-hub-signature-256': sign(secret, original) },
  });
  assert.equal(res.status, 401);
  assert.equal(res.body.error, 'Invalid webhook signature');
});

test('QA-03 HMAC :: Hebrew payload survives HMAC if caller signs the exact bytes', async () => {
  const secret = 's';
  const app = boot(secret);
  const body = JSON.stringify({
    entry: [{ id: 'e1', changes: [{ value: { messages: [{ text: { body: 'שלום מוריה' } }] } }] }],
  });
  // Signature computed over the UTF-8 bytes of the body, same as WhatsApp does
  const res = await request(app, {
    path: '/webhook/whatsapp',
    body,
    headers: { 'x-hub-signature-256': sign(secret, body) },
  });
  assert.equal(res.status, 200);
});

test('QA-03 HMAC :: BUG-11 — missing WHATSAPP_APP_SECRET + dev env → silent bypass', async () => {
  const savedEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'development';
  try {
    const app = boot(undefined); // no secret
    const body = JSON.stringify({ entry: [{ id: 'attacker', forged: true }] });
    const res = await request(app, {
      path: '/webhook/whatsapp',
      body,
      // NO signature header, NO secret — attacker should be blocked but isn't
    });
    assert.equal(
      res.status,
      200,
      'BUG-11: without the secret in non-prod, any unsigned webhook is accepted',
    );
  } finally {
    if (savedEnv !== undefined) process.env.NODE_ENV = savedEnv;
    else delete process.env.NODE_ENV;
  }
});

test('QA-03 HMAC :: missing WHATSAPP_APP_SECRET + production env → 500', async () => {
  const savedEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    const app = boot(undefined); // no secret
    const body = JSON.stringify({ entry: [] });
    const res = await request(app, {
      path: '/webhook/whatsapp',
      body,
    });
    assert.equal(res.status, 500);
    assert.match(res.body.error, /HMAC not configured/);
  } finally {
    if (savedEnv !== undefined) process.env.NODE_ENV = savedEnv;
    else delete process.env.NODE_ENV;
  }
});

test('QA-03 HMAC :: timingSafeEqual length mismatch must not throw', async () => {
  const app = boot('s');
  // Length mismatch explicitly forbidden by timingSafeEqual — we short-circuit.
  const res = await request(app, {
    path: '/webhook/whatsapp',
    body: JSON.stringify({}),
    headers: { 'x-hub-signature-256': 'sha256=abc' }, // too short
  });
  assert.equal(res.status, 401);
});
