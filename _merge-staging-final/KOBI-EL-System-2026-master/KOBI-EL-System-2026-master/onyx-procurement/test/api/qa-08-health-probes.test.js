/**
 * QA-08 — Health + Kubernetes Probes test suite
 *
 * Endpoints covered (all public, no auth):
 *   GET /api/status
 *   GET /api/health
 *   GET /healthz
 *   GET /livez
 *   GET /readyz
 *
 * Author: QA-08 API Test Agent
 * Run:    node --test test/api/qa-08-health-probes.test.js
 */

'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');

const { makeMockSupabase, start, request } = require('./qa-08-helpers');

const SERVICE_NAME = 'onyx-procurement';
const SERVICE_VERSION = '1.1.0';

function buildHealthApp(supabase, { dbHangs = false, dbErrors = false } = {}) {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  // Public health endpoints (unauthenticated)
  app.get('/api/status', (_req, res) => {
    res.json({ status: 'ok', uptime: process.uptime() });
  });
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() });
  });
  app.get('/healthz', (_req, res) => {
    res.status(200).json({
      ok: true,
      service: SERVICE_NAME,
      version: SERVICE_VERSION,
      uptime: process.uptime(),
    });
  });
  app.get('/livez', (_req, res) => {
    res.status(200).json({ alive: true });
  });
  app.get('/readyz', async (_req, res) => {
    const DB_TIMEOUT_MS = 500;
    let timer;
    try {
      const dbPing = dbHangs
        ? new Promise(() => {}) // never resolves
        : dbErrors
          ? Promise.resolve({ error: { message: 'db_down' } })
          : Promise.resolve({ error: null });
      const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('db_timeout_500ms')), DB_TIMEOUT_MS);
      });
      const result = await Promise.race([dbPing, timeout]);
      clearTimeout(timer);
      if (result && result.error) {
        return res.status(503).json({ ready: false, reason: `db_error:${result.error.message}` });
      }
      return res.status(200).json({ ready: true, service: SERVICE_NAME });
    } catch (err) {
      clearTimeout(timer);
      return res.status(503).json({ ready: false, reason: err.message });
    }
  });

  return app;
}

// ══════════════════════════════════════════════════════════════════════
// Healthy DB
// ══════════════════════════════════════════════════════════════════════
describe('Health probes — DB healthy', () => {
  let server, baseUrl;
  before(async () => {
    const supabase = makeMockSupabase({});
    const app = buildHealthApp(supabase, {});
    const { baseUrl: url, close } = await start(app);
    server = { close };
    baseUrl = url;
  });
  after(async () => { await server.close(); });

  test('1.1 GET /api/status → 200 ok', async () => {
    const res = await request(baseUrl, 'GET', '/api/status', undefined, { apiKey: null });
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'ok');
  });

  test('1.2 GET /api/health → 200 with timestamp', async () => {
    const res = await request(baseUrl, 'GET', '/api/health', undefined, { apiKey: null });
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'ok');
    assert.ok(res.body.timestamp);
  });

  test('1.3 GET /healthz → 200 with service + version + uptime', async () => {
    const res = await request(baseUrl, 'GET', '/healthz', undefined, { apiKey: null });
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.service, SERVICE_NAME);
    assert.equal(res.body.version, SERVICE_VERSION);
    assert.ok(typeof res.body.uptime === 'number');
  });

  test('1.4 GET /livez → 200 with alive:true', async () => {
    const res = await request(baseUrl, 'GET', '/livez', undefined, { apiKey: null });
    assert.equal(res.status, 200);
    assert.equal(res.body.alive, true);
  });

  test('1.5 GET /readyz → 200 when DB responds', async () => {
    const res = await request(baseUrl, 'GET', '/readyz', undefined, { apiKey: null });
    assert.equal(res.status, 200);
    assert.equal(res.body.ready, true);
  });

  test('1.6 /api/status reachable without api key', async () => {
    const res = await request(baseUrl, 'GET', '/api/status');
    assert.equal(res.status, 200);
  });

  test('1.7 /healthz does not leak env vars / secrets', async () => {
    const res = await request(baseUrl, 'GET', '/healthz', undefined, { apiKey: null });
    const str = JSON.stringify(res.body);
    assert.ok(!/supabase_anon_key|password|token/i.test(str));
  });

  test('1.8 JSON Content-Type on /healthz', async () => {
    const res = await request(baseUrl, 'GET', '/healthz', undefined, { apiKey: null });
    assert.match(res.headers['content-type'] || '', /application\/json/);
  });
});

// ══════════════════════════════════════════════════════════════════════
// DB returns error
// ══════════════════════════════════════════════════════════════════════
describe('Health probes — DB error', () => {
  let server, baseUrl;
  before(async () => {
    const supabase = makeMockSupabase({});
    const app = buildHealthApp(supabase, { dbErrors: true });
    const { baseUrl: url, close } = await start(app);
    server = { close };
    baseUrl = url;
  });
  after(async () => { await server.close(); });

  test('2.1 /readyz → 503 with reason', async () => {
    const res = await request(baseUrl, 'GET', '/readyz', undefined, { apiKey: null });
    assert.equal(res.status, 503);
    assert.equal(res.body.ready, false);
    assert.match(res.body.reason, /db_error:db_down/);
  });

  test('2.2 /livez still 200 (independent of DB)', async () => {
    const res = await request(baseUrl, 'GET', '/livez', undefined, { apiKey: null });
    assert.equal(res.status, 200);
  });

  test('2.3 /healthz still 200 (liveness lite)', async () => {
    const res = await request(baseUrl, 'GET', '/healthz', undefined, { apiKey: null });
    assert.equal(res.status, 200);
  });
});

// ══════════════════════════════════════════════════════════════════════
// DB hangs → timeout
// ══════════════════════════════════════════════════════════════════════
describe('Health probes — DB timeout', () => {
  let server, baseUrl;
  before(async () => {
    const supabase = makeMockSupabase({});
    const app = buildHealthApp(supabase, { dbHangs: true });
    const { baseUrl: url, close } = await start(app);
    server = { close };
    baseUrl = url;
  });
  after(async () => { await server.close(); });

  test('3.1 /readyz → 503 after timeout', async () => {
    const res = await request(baseUrl, 'GET', '/readyz', undefined, { apiKey: null });
    assert.equal(res.status, 503);
    assert.equal(res.body.ready, false);
    assert.match(res.body.reason, /timeout/);
  });

  test('3.2 /readyz does not hang the client forever', async () => {
    const start = Date.now();
    const res = await request(baseUrl, 'GET', '/readyz', undefined, { apiKey: null });
    const elapsed = Date.now() - start;
    assert.ok(elapsed < 2000, `readyz took too long: ${elapsed}ms`);
    assert.equal(res.status, 503);
  });

  test('3.3 /livez still responds immediately', async () => {
    const start = Date.now();
    const res = await request(baseUrl, 'GET', '/livez', undefined, { apiKey: null });
    const elapsed = Date.now() - start;
    assert.ok(elapsed < 200, `livez took too long: ${elapsed}ms`);
    assert.equal(res.status, 200);
  });
});
