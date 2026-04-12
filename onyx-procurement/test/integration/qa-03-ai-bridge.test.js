/**
 * ============================================================================
 *  QA-03 — Integration Test Agent
 *  File   : qa-03-ai-bridge.test.js
 *  Agent  : QA-03 (Integration)
 *  Date   : 2026-04-11
 *
 *  Scope
 *  -----
 *  Tests the integration contract between onyx-procurement (caller) and
 *  onyx-ai (callee) via `onyx-procurement/src/ai-bridge.js`.
 *
 *  Approach
 *  --------
 *  1. We spin up a FAKE onyx-ai HTTP server that mirrors the real endpoints
 *     exposed by `onyx-ai/src/index.ts :: APIServer.route(...)`:
 *         GET  /healthz
 *         GET  /livez
 *         GET  /readyz
 *         GET  /api/status
 *         GET  /api/events
 *         GET  /api/audit
 *         POST /api/knowledge/query
 *         POST /api/knowledge/entity
 *         POST /api/kill
 *         POST /api/resume
 *         POST /api/agent/:id/suspend
 *         GET  /api/integrity
 *     The fake returns 404 for any path not in this list — exactly what
 *     the real onyx-ai does.
 *
 *  2. We construct an OnyxAiClient pointed at our fake and exercise every
 *     method the bridge exposes: evaluatePolicy, recordEvent, getBudgetStatus,
 *     healthCheck. Each of these calls endpoints that ONYX-AI DOES NOT HAVE,
 *     proving the contract mismatch.
 *
 *  3. We assert that the bridge "fails open" (returns null / false) rather
 *     than throwing — this is good behaviour under failure but bad news
 *     operationally, because policy gates will silently auto-pass.
 *
 *  Rule: NEW FILES ONLY. We do not touch ai-bridge.js, onyx-ai/src/index.ts,
 *  or any existing test. We document the mismatch; we do not fix it.
 * ============================================================================
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');

// The System Under Test
const {
  OnyxAiClient,
  _resetDefaultClient,
} = require(path.join('..', '..', 'src', 'ai-bridge.js'));

// ---------------------------------------------------------------------------
// Fake onyx-ai — mirrors real routes from onyx-ai/src/index.ts :: APIServer
// ---------------------------------------------------------------------------

function startFakeOnyxAi() {
  const calls = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      calls.push({
        method: req.method,
        url: req.url,
        headers: { ...req.headers },
        body,
      });

      const url = req.url || '/';
      const m = req.method || 'GET';

      // Real onyx-ai routes (as of APIServer.route in onyx-ai/src/index.ts)
      const REAL_ROUTES = new Map([
        ['GET:/healthz',            () => ({ status: 200, body: { ok: true, service: 'onyx-ai' } })],
        ['GET:/livez',              () => ({ status: 200, body: { alive: true } })],
        ['GET:/readyz',             () => ({ status: 200, body: { ready: true } })],
        ['GET:/api/status',         () => ({ status: 200, body: { service: 'onyx-ai', state: 'running' } })],
        ['GET:/api/events',         () => ({ status: 200, body: { events: [], totalCount: 0 } })],
        ['GET:/api/audit',          () => ({ status: 200, body: { entries: [] } })],
        ['POST:/api/knowledge/query',  () => ({ status: 200, body: { results: [] } })],
        ['POST:/api/knowledge/entity', () => ({ status: 200, body: { ok: true } })],
        ['POST:/api/kill',          () => ({ status: 200, body: { killed: true } })],
        ['POST:/api/resume',        () => ({ status: 200, body: { resumed: true } })],
        ['GET:/api/integrity',      () => ({ status: 200, body: { integrity: 'ok' } })],
      ]);

      const key = `${m}:${url}`;
      const handler = REAL_ROUTES.get(key);
      if (handler) {
        const r = handler();
        res.writeHead(r.status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(r.body));
        return;
      }

      // Mirror the raw http server fall-through: 404 + JSON
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'not_found', path: url }));
    });
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      resolve({
        server,
        calls,
        url: `http://127.0.0.1:${addr.port}`,
        close: () =>
          new Promise((r) => server.close(() => r())),
      });
    });
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('QA-03 AI-BRIDGE :: contract mismatch — bridge calls endpoints onyx-ai does not expose', async (t) => {
  _resetDefaultClient();
  const fake = await startFakeOnyxAi();
  t.after(() => fake.close());

  const client = new OnyxAiClient(fake.url, 'test-key-123', {
    timeoutMs: 500,
    maxRetries: 0,      // don't retry 4xx — we want a single shot
    backoffBaseMs: 1,
  });

  // ─── evaluatePolicy → POST /evaluate — NOT in onyx-ai! ──────────────────
  const policyDecision = await client.evaluatePolicy({
    actor: 'procurement-worker',
    action: 'purchase',
    subject: { amount_ils: 1000, vendor_id: 'V-1' },
  });
  assert.equal(
    policyDecision,
    null,
    'BUG-01a: evaluatePolicy must return null when onyx-ai returns 404, NOT throw',
  );

  // ─── recordEvent → POST /events — NOT in onyx-ai! ───────────────────────
  const eventResult = await client.recordEvent({
    type: 'purchase_approved',
    actor: 'user-1',
    payload: { amount: 500 },
  });
  assert.equal(
    eventResult,
    false,
    'BUG-01b: recordEvent must return false when onyx-ai returns 404',
  );

  // ─── getBudgetStatus → GET /budget — NOT in onyx-ai! ────────────────────
  const budget = await client.getBudgetStatus();
  assert.equal(
    budget,
    null,
    'BUG-01c: getBudgetStatus must return null when onyx-ai returns 404',
  );

  // ─── healthCheck → GET /health — NOT in onyx-ai! (only /healthz/livez) ──
  const healthy = await client.healthCheck();
  assert.equal(
    healthy,
    false,
    'BUG-01d: healthCheck must return false — onyx-ai has /healthz not /health',
  );

  // Verify every bridge call hit a path that does NOT exist on onyx-ai.
  const paths = fake.calls.map((c) => `${c.method} ${c.url}`);
  assert.deepEqual(
    paths,
    [
      'POST /evaluate',
      'POST /events',
      'GET /budget',
      'GET /health',
    ],
    'BUG-01: ai-bridge is calling 4 endpoints that do not exist on onyx-ai',
  );
});

test('QA-03 AI-BRIDGE :: verifies the real onyx-ai endpoints DO respond 200', async (t) => {
  const fake = await startFakeOnyxAi();
  t.after(() => fake.close());

  // Prove that the fake IS actually up — call a real endpoint directly.
  const probe = await new Promise((resolve, reject) => {
    const req = http.get(`${fake.url}/healthz`, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', reject);
  });
  assert.equal(probe.status, 200, 'fake /healthz must return 200');
  const parsed = JSON.parse(probe.body);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.service, 'onyx-ai');
});

test('QA-03 AI-BRIDGE :: X-API-Key header is sent on every call (header auth works)', async (t) => {
  _resetDefaultClient();
  const fake = await startFakeOnyxAi();
  t.after(() => fake.close());

  const client = new OnyxAiClient(fake.url, 'secret-key-xyz', {
    timeoutMs: 500,
    maxRetries: 0,
    backoffBaseMs: 1,
  });

  await client.evaluatePolicy({ action: 'test' });
  await client.recordEvent({ type: 'test' });
  await client.getBudgetStatus();
  await client.healthCheck();

  // Auth header is at least being sent, so the only problem is the path.
  for (const call of fake.calls) {
    assert.equal(
      call.headers['x-api-key'],
      'secret-key-xyz',
      `call to ${call.url} must include the X-API-Key header`,
    );
  }
});

test('QA-03 AI-BRIDGE :: evaluatePolicy swallows 500 after exhausting retries (fail-open)', async (t) => {
  _resetDefaultClient();

  // Custom fake that always returns 500 for /evaluate
  let hits = 0;
  const srv = http.createServer((req, res) => {
    hits++;
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'internal' }));
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${srv.address().port}`;
  t.after(() => new Promise((r) => srv.close(() => r())));

  const client = new OnyxAiClient(url, 'k', {
    timeoutMs: 250,
    maxRetries: 2,
    backoffBaseMs: 1,
  });

  const decision = await client.evaluatePolicy({ action: 'x' });
  assert.equal(decision, null, 'evaluatePolicy must return null on persistent 500');
  assert.equal(
    hits >= 3,
    true,
    `bridge must retry at least maxRetries+1 times (saw ${hits})`,
  );
});

test('QA-03 AI-BRIDGE :: timeout path returns null without throwing', async (t) => {
  _resetDefaultClient();

  // Server that NEVER responds — forces AbortController timeout.
  const srv = http.createServer((req, res) => {
    // deliberately do not end the response
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${srv.address().port}`;
  t.after(() => new Promise((r) => srv.close(() => r())));

  const client = new OnyxAiClient(url, 'k', {
    timeoutMs: 80,      // fast abort
    maxRetries: 1,
    backoffBaseMs: 1,
  });

  const start = Date.now();
  const decision = await client.evaluatePolicy({ action: 'x' });
  const elapsed = Date.now() - start;

  assert.equal(decision, null, 'timeout must produce null, not throw');
  // 2 attempts * 80ms budget + backoff — we just assert "didn't hang forever"
  assert.ok(
    elapsed < 2000,
    `timeout path must return within 2s (was ${elapsed}ms)`,
  );
});

test('QA-03 AI-BRIDGE :: missing X-API-Key env var yields getDefaultClient() === null', async (t) => {
  _resetDefaultClient();
  const saved = process.env.ONYX_AI_API_KEY;
  delete process.env.ONYX_AI_API_KEY;

  const { getDefaultClient } = require(path.join('..', '..', 'src', 'ai-bridge.js'));
  const def = getDefaultClient();
  assert.equal(
    def,
    null,
    'BUG-06: when ONYX_AI_API_KEY is missing the default client must be null (fail-open)',
  );

  if (saved !== undefined) process.env.ONYX_AI_API_KEY = saved;
});
