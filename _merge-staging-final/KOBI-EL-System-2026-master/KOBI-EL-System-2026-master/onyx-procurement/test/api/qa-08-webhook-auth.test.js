/**
 * QA-08 — Webhook + Auth Middleware test suite
 *
 * Endpoints / middleware covered:
 *   GET  /webhook/whatsapp   — Facebook Graph verification challenge
 *   POST /webhook/whatsapp   — HMAC-SHA256 verified webhook
 *   Auth middleware          — X-API-Key / Authorization: Bearer
 *
 * Author: QA-08 API Test Agent
 * Run:    node --test test/api/qa-08-webhook-auth.test.js
 */

'use strict';

const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const express = require('express');
const http = require('node:http');

const { makeMockSupabase, start, request, VALID_KEY } = require('./qa-08-helpers');

const WA_APP_SECRET = 'qa08-webhook-secret';
const WA_VERIFY_TOKEN = 'qa08-verify-token';

// Build a mini app that replicates webhook routes + auth middleware exactly
function buildAppWithWebhook(supabase) {
  const app = express();

  // Capture rawBody for HMAC (important — HMAC must match exact bytes)
  app.use(express.json({
    limit: '2mb',
    verify: (req, _res, buf) => { req.rawBody = buf; },
  }));

  // ═══ Auth middleware copy ═══
  const publicPaths = new Set(['/status', '/health']);
  app.use('/api/', (req, res, next) => {
    if (publicPaths.has(req.path)) { req.actor = 'public'; return next(); }
    const apiKey = req.headers['x-api-key']
      || (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!apiKey || apiKey !== VALID_KEY) {
      return res.status(401).json({ error: 'Unauthorized — missing or invalid X-API-Key header' });
    }
    req.actor = `api_key:${apiKey.slice(0, 6)}…`;
    next();
  });

  // ═══ Public demo routes ═══
  app.get('/api/status', (_req, res) => res.json({ status: 'ok' }));
  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
  app.get('/api/protected', (_req, res) => res.json({ actor: _req.actor }));

  // ═══ HMAC middleware ═══
  function verifyWhatsAppHmac(req, res, next) {
    const signature = req.headers['x-hub-signature-256'] || '';
    const expected = 'sha256=' + crypto
      .createHmac('sha256', WA_APP_SECRET)
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
  }

  // ═══ WhatsApp verify challenge ═══
  app.get('/webhook/whatsapp', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    if (mode === 'subscribe' && token === WA_VERIFY_TOKEN) {
      res.status(200).send(challenge);
    } else {
      res.sendStatus(403);
    }
  });

  // ═══ WhatsApp POST (HMAC guarded) ═══
  app.post('/webhook/whatsapp', verifyWhatsAppHmac, async (req, res) => {
    const body = req.body;
    const entry = body?.entry?.[0];
    const changes = entry?.changes?.[0];
    const messages = changes?.value?.messages;
    if (messages?.length) {
      for (const msg of messages) {
        await supabase.from('system_events').insert({
          type: 'whatsapp_incoming',
          severity: 'info',
          source: 'whatsapp',
          message: `incoming ${msg.from}`,
        });
      }
    }
    res.sendStatus(200);
  });

  app.use((err, req, res, _next) => {
    res.status(err.status || 500).json({ error: err.message });
  });

  return app;
}

function signBody(secret, bodyStr) {
  return 'sha256=' + crypto.createHmac('sha256', secret).update(bodyStr).digest('hex');
}

let server, baseUrl, supabase;
before(async () => {
  supabase = makeMockSupabase({ system_events: [] });
  const app = buildAppWithWebhook(supabase);
  const { baseUrl: url, close } = await start(app);
  server = { close };
  baseUrl = url;
});
after(async () => { await server.close(); });
beforeEach(() => {
  const fresh = makeMockSupabase({ system_events: [] });
  supabase.from = fresh.from;
  supabase._tables = fresh._tables;
});

// ══════════════════════════════════════════════════════════════════════
// Auth Middleware
// ══════════════════════════════════════════════════════════════════════
describe('Auth middleware', () => {
  test('1.1 rejects missing X-API-Key with 401', async () => {
    const res = await request(baseUrl, 'GET', '/api/protected', undefined, { apiKey: null });
    assert.equal(res.status, 401);
    assert.ok(/Unauthorized/.test(res.body.error));
  });

  test('1.2 accepts valid X-API-Key', async () => {
    const res = await request(baseUrl, 'GET', '/api/protected');
    assert.equal(res.status, 200);
    assert.match(res.body.actor, /^api_key:/);
  });

  test('1.3 accepts Authorization: Bearer <key>', async () => {
    const res = await request(baseUrl, 'GET', '/api/protected', undefined, {
      apiKey: null,
      headers: { 'Authorization': `Bearer ${VALID_KEY}` },
    });
    assert.equal(res.status, 200);
  });

  test('1.4 rejects bad key with 401', async () => {
    const res = await request(baseUrl, 'GET', '/api/protected', undefined, {
      apiKey: 'not-the-right-key',
    });
    assert.equal(res.status, 401);
  });

  test('1.5 allows public path /api/status without key', async () => {
    const res = await request(baseUrl, 'GET', '/api/status', undefined, { apiKey: null });
    assert.equal(res.status, 200);
  });

  test('1.6 allows public path /api/health without key', async () => {
    const res = await request(baseUrl, 'GET', '/api/health', undefined, { apiKey: null });
    assert.equal(res.status, 200);
  });

  test('1.7 empty Authorization header → 401', async () => {
    const res = await request(baseUrl, 'GET', '/api/protected', undefined, {
      apiKey: null,
      headers: { 'Authorization': '' },
    });
    assert.equal(res.status, 401);
  });

  test('1.8 Bearer with wrong token → 401', async () => {
    const res = await request(baseUrl, 'GET', '/api/protected', undefined, {
      apiKey: null,
      headers: { 'Authorization': 'Bearer bogus' },
    });
    assert.equal(res.status, 401);
  });

  test('1.9 case-insensitive Bearer prefix', async () => {
    const res = await request(baseUrl, 'GET', '/api/protected', undefined, {
      apiKey: null,
      headers: { 'Authorization': `bearer ${VALID_KEY}` },
    });
    assert.equal(res.status, 200);
  });

  test('1.10 no sensitive field leak in error response', async () => {
    const res = await request(baseUrl, 'GET', '/api/protected', undefined, { apiKey: null });
    assert.ok(!('password' in res.body));
    assert.ok(!('token' in res.body));
  });
});

// ══════════════════════════════════════════════════════════════════════
// GET /webhook/whatsapp — verification challenge
// ══════════════════════════════════════════════════════════════════════
describe('GET /webhook/whatsapp', () => {
  test('2.1 valid challenge returns 200 + challenge', async () => {
    const res = await request(
      baseUrl,
      'GET',
      `/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=${WA_VERIFY_TOKEN}&hub.challenge=foo123`,
      undefined,
      { apiKey: null }
    );
    assert.equal(res.status, 200);
    assert.equal(res.body, 'foo123');
  });

  test('2.2 wrong verify token → 403', async () => {
    const res = await request(
      baseUrl,
      'GET',
      `/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=foo`,
      undefined,
      { apiKey: null }
    );
    assert.equal(res.status, 403);
  });

  test('2.3 missing mode → 403', async () => {
    const res = await request(
      baseUrl,
      'GET',
      `/webhook/whatsapp?hub.verify_token=${WA_VERIFY_TOKEN}&hub.challenge=foo`,
      undefined,
      { apiKey: null }
    );
    assert.equal(res.status, 403);
  });

  test('2.4 SQL injection in challenge echoed safely', async () => {
    const challenge = encodeURIComponent("' OR 1=1");
    const res = await request(
      baseUrl,
      'GET',
      `/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=${WA_VERIFY_TOKEN}&hub.challenge=${challenge}`,
      undefined,
      { apiKey: null }
    );
    assert.equal(res.status, 200);
    assert.equal(res.body, "' OR 1=1");
  });

  test('2.5 no auth required (public path)', async () => {
    // Public because path doesn't start with /api/
    const res = await request(
      baseUrl,
      'GET',
      `/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=${WA_VERIFY_TOKEN}&hub.challenge=x`,
      undefined,
      { apiKey: null }
    );
    assert.notEqual(res.status, 401);
  });
});

// ══════════════════════════════════════════════════════════════════════
// POST /webhook/whatsapp — HMAC guarded
// ══════════════════════════════════════════════════════════════════════
describe('POST /webhook/whatsapp (HMAC)', () => {
  function postSigned(body, signature) {
    const bodyStr = JSON.stringify(body);
    return request(baseUrl, 'POST', '/webhook/whatsapp', body, {
      apiKey: null,
      headers: { 'X-Hub-Signature-256': signature || signBody(WA_APP_SECRET, bodyStr) },
    });
  }

  test('3.1 valid signature → 200', async () => {
    const body = { entry: [{ changes: [{ value: { messages: [{ from: '+972', text: { body: 'hi' }, type: 'text', id: 'm1', timestamp: '1' }] } }] }] };
    const res = await postSigned(body);
    assert.equal(res.status, 200);
    assert.equal(supabase._tables.system_events.length, 1);
  });

  test('3.2 missing signature → 401', async () => {
    const body = { entry: [] };
    const res = await request(baseUrl, 'POST', '/webhook/whatsapp', body, {
      apiKey: null,
    });
    assert.equal(res.status, 401);
  });

  test('3.3 wrong signature → 401', async () => {
    const body = { entry: [] };
    const res = await postSigned(body, 'sha256=deadbeef');
    assert.equal(res.status, 401);
  });

  test('3.4 tampered body → 401', async () => {
    const body = { entry: [{ changes: [] }] };
    const signature = signBody(WA_APP_SECRET, JSON.stringify(body));
    // Send different body, same signature
    const res = await request(baseUrl, 'POST', '/webhook/whatsapp', { entry: [{ EVIL: true }] }, {
      apiKey: null,
      headers: { 'X-Hub-Signature-256': signature },
    });
    assert.equal(res.status, 401);
  });

  test('3.5 empty body with correct signature → 200', async () => {
    const body = {};
    const res = await postSigned(body);
    assert.equal(res.status, 200);
  });

  test('3.6 wrong-secret signature → 401', async () => {
    const body = { entry: [] };
    const signature = signBody('wrong-secret', JSON.stringify(body));
    const res = await request(baseUrl, 'POST', '/webhook/whatsapp', body, {
      apiKey: null,
      headers: { 'X-Hub-Signature-256': signature },
    });
    assert.equal(res.status, 401);
  });

  test('3.7 inserts event record on valid webhook', async () => {
    const body = { entry: [{ changes: [{ value: { messages: [
      { from: '+1', text: { body: 'a' }, type: 'text', id: 'ma', timestamp: '1' },
      { from: '+2', text: { body: 'b' }, type: 'text', id: 'mb', timestamp: '2' },
    ] } }] }] };
    await postSigned(body);
    assert.equal(supabase._tables.system_events.length, 2);
  });
});
