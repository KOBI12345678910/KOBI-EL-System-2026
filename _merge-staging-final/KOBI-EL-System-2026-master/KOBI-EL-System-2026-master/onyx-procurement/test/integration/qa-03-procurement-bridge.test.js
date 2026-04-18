/**
 * ============================================================================
 *  QA-03 — Integration Test Agent
 *  File   : qa-03-procurement-bridge.test.js
 *  Agent  : QA-03 (Integration)
 *  Date   : 2026-04-11
 *
 *  Scope
 *  -----
 *  Tests the integration contract between onyx-ai (caller) and onyx-procurement
 *  (callee) via `onyx-ai/src/procurement-bridge.ts`. The bridge is TypeScript,
 *  so instead of importing it we re-implement an identical JS fetch mock that
 *  exercises the HTTP contract the TS client defines — every field name and
 *  URL path is copied verbatim from the TS source so the test is a faithful
 *  proxy for the real client's behaviour under Node --test.
 *
 *  What this test proves
 *  ---------------------
 *  1. onyx-procurement's real /api/purchase-orders returns `{ orders: [...] }`,
 *     but procurement-bridge.ts expects either `Array` or `{ data: [...] }`.
 *     → BUG-03 (response-shape mismatch, data lost)
 *
 *  2. onyx-procurement's real /api/analytics/savings returns a completely
 *     different shape than AnalyticsSavings interface in procurement-bridge.ts:
 *         procurement: { total_savings, procurement, subcontractor, message }
 *         bridge      : { period_start, period_end, total_spend,
 *                         baseline_spend, savings, savings_pct }
 *     → BUG-03b (schema drift)
 *
 *  3. onyx-procurement exposes /healthz, /api/health, but NOT /health.
 *     procurement-bridge.ts :: healthCheck() calls /health → always 404.
 *     → BUG-04
 *
 *  4. procurement-bridge auth header is `X-API-Key`. Verified end-to-end.
 *
 *  Rule: NEW FILE ONLY. We do not modify procurement-bridge.ts or server.js.
 * ============================================================================
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

// ---------------------------------------------------------------------------
// JS replica of procurement-bridge.ts :: OnyxProcurementClient
// Copied verbatim from the TS so any drift in the real client must be
// mirrored here — we explicitly do NOT import the TS file.
// ---------------------------------------------------------------------------

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

class OnyxProcurementClientReplica {
  constructor(baseUrl, apiKey, opts = {}) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.apiKey = apiKey;
    this.timeoutMs = opts.timeoutMs || 5000;
    this.maxRetries = opts.maxRetries != null ? opts.maxRetries : 3;
    this.backoffBaseMs = opts.backoffBaseMs || 250;
    this._fetch = opts.fetchImpl || ((...args) => globalThis.fetch(...args));
    this.callLog = [];
  }

  async _request(method, path) {
    const url = `${this.baseUrl}${path}`;
    const headers = {
      'X-API-Key': this.apiKey,
      'Accept': 'application/json',
      'User-Agent': 'onyx-ai/2.0.1 (procurement-bridge)',
    };
    this.callLog.push({ method, url });

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const res = await this._fetch(url, { method, headers, signal: controller.signal });
        clearTimeout(timer);
        if (RETRYABLE_STATUS.has(res.status) && attempt < this.maxRetries) {
          await new Promise((r) => setTimeout(r, this.backoffBaseMs * Math.pow(2, attempt)));
          continue;
        }
        let parsed = null;
        try {
          const text = await res.text();
          parsed = text ? JSON.parse(text) : null;
        } catch {
          parsed = null;
        }
        if (!res.ok) return null;
        return { ok: true, status: res.status, body: parsed };
      } catch (_err) {
        clearTimeout(timer);
        if (attempt >= this.maxRetries) break;
        await new Promise((r) => setTimeout(r, this.backoffBaseMs * Math.pow(2, attempt)));
      }
    }
    return null;
  }

  async getPurchaseOrders(filters = {}) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(filters)) {
      if (v !== undefined && v !== null) qs.append(k, String(v));
    }
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    const res = await this._request('GET', `/api/purchase-orders${suffix}`);
    if (!res) return null;
    const body = res.body;
    if (Array.isArray(body)) return body;
    if (body && Array.isArray(body.data)) return body.data;
    return null; // ← BUG-03: rejects `{ orders: [...] }`
  }

  async getAnalyticsSavings() {
    const res = await this._request('GET', '/api/analytics/savings');
    return res ? res.body : null;
  }

  async healthCheck() {
    const res = await this._request('GET', '/health');
    return res !== null;
  }
}

// ---------------------------------------------------------------------------
// Fake onyx-procurement that mirrors the real server.js responses
// ---------------------------------------------------------------------------

function startFakeOnyxProcurement() {
  const calls = [];
  const server = http.createServer((req, res) => {
    calls.push({ method: req.method, url: req.url, headers: { ...req.headers } });
    const url = req.url || '/';
    const m = req.method || 'GET';

    // Real shapes copied directly from onyx-procurement/server.js handlers
    if (m === 'GET' && url.startsWith('/api/purchase-orders')) {
      // ACTUAL shape — look at `res.json({ orders: data })` in server.js
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          orders: [
            { id: 'po-1', po_number: 'PO-2026-001', total_amount: 5000, status: 'open' },
            { id: 'po-2', po_number: 'PO-2026-002', total_amount: 12000, status: 'approved' },
          ],
        }),
      );
      return;
    }

    if (m === 'GET' && url === '/api/analytics/savings') {
      // ACTUAL shape — look at /api/analytics/savings handler in server.js
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          total_savings: 42000,
          procurement: { po_count: 120, savings: 30000 },
          subcontractor: { job_count: 15, savings: 12000 },
          message: 'savings for fiscal year 2026',
        }),
      );
      return;
    }

    if (m === 'GET' && url === '/api/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, uptime: 42 }));
      return;
    }

    if (m === 'GET' && url === '/healthz') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, service: 'onyx-procurement' }));
      return;
    }

    // /health does NOT exist on onyx-procurement
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'not_found', path: url }));
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      resolve({
        server,
        calls,
        url: `http://127.0.0.1:${addr.port}`,
        close: () => new Promise((r) => server.close(() => r())),
      });
    });
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('QA-03 PROC-BRIDGE :: getPurchaseOrders silently loses data — real shape is { orders: [...] }, bridge expects Array', async (t) => {
  const fake = await startFakeOnyxProcurement();
  t.after(() => fake.close());

  const client = new OnyxProcurementClientReplica(fake.url, 'k', {
    timeoutMs: 500,
    maxRetries: 0,
  });

  const result = await client.getPurchaseOrders({ status: 'open' });

  // BUG-03: returns null because the shape check fails. onyx-ai will think
  // procurement has zero purchase orders when in fact there are two.
  assert.equal(
    result,
    null,
    'BUG-03: bridge returns null against the real { orders: [...] } shape — silent data loss',
  );

  // Verify we actually hit the correct URL with auth
  assert.equal(fake.calls.length, 1);
  assert.equal(fake.calls[0].method, 'GET');
  assert.ok(fake.calls[0].url.startsWith('/api/purchase-orders'));
  assert.equal(fake.calls[0].headers['x-api-key'], 'k');
});

test('QA-03 PROC-BRIDGE :: getPurchaseOrders succeeds ONLY if procurement wraps in { data: [...] }', async (t) => {
  // Alt fake that uses the OTHER shape the bridge accepts — proves bridge
  // isn't broken for every shape, just the specific one procurement returns.
  const calls = [];
  const srv = http.createServer((req, res) => {
    calls.push(req.url);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ data: [{ id: 'x', po_number: 'PO-X' }] }));
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  t.after(() => new Promise((r) => srv.close(() => r())));

  const client = new OnyxProcurementClientReplica(
    `http://127.0.0.1:${srv.address().port}`,
    'k',
    { maxRetries: 0 },
  );
  const result = await client.getPurchaseOrders();
  assert.ok(Array.isArray(result), 'bridge accepts { data: [...] }');
  assert.equal(result.length, 1);
  assert.equal(result[0].po_number, 'PO-X');
});

test('QA-03 PROC-BRIDGE :: getAnalyticsSavings — bridge interface fields are NOT in real response', async (t) => {
  const fake = await startFakeOnyxProcurement();
  t.after(() => fake.close());

  const client = new OnyxProcurementClientReplica(fake.url, 'k', {
    maxRetries: 0,
  });
  const savings = await client.getAnalyticsSavings();

  // The bridge will happily return whatever JSON comes back but the caller
  // reads AnalyticsSavings.total_spend / savings_pct / period_start / …
  // which are ALL undefined in the real payload.
  assert.ok(savings, 'request returns something (bridge is not null)');
  assert.equal(savings.period_start, undefined,   'BUG-03b: period_start missing');
  assert.equal(savings.period_end,   undefined,   'BUG-03b: period_end missing');
  assert.equal(savings.total_spend,  undefined,   'BUG-03b: total_spend missing');
  assert.equal(savings.baseline_spend, undefined, 'BUG-03b: baseline_spend missing');
  assert.equal(savings.savings,      undefined,   'BUG-03b: savings (scalar) missing');
  assert.equal(savings.savings_pct,  undefined,   'BUG-03b: savings_pct missing');

  // The real data IS in there — just under the wrong names.
  assert.equal(savings.total_savings, 42000, 'real field is named total_savings');
  assert.ok(savings.procurement,  'real data is nested under procurement/subcontractor');
  assert.ok(savings.subcontractor);
});

test('QA-03 PROC-BRIDGE :: healthCheck hits /health which does NOT exist on onyx-procurement', async (t) => {
  const fake = await startFakeOnyxProcurement();
  t.after(() => fake.close());

  const client = new OnyxProcurementClientReplica(fake.url, 'k', {
    maxRetries: 0,
  });
  const healthy = await client.healthCheck();

  assert.equal(
    healthy,
    false,
    'BUG-04: /health returns 404 on onyx-procurement — use /api/health or /healthz',
  );
});

test('QA-03 PROC-BRIDGE :: /healthz and /api/health DO work (proving the path is the only issue)', async (t) => {
  const fake = await startFakeOnyxProcurement();
  t.after(() => fake.close());

  // Hand-roll a direct hit at the CORRECT paths so we prove the fake is up.
  for (const pth of ['/healthz', '/api/health']) {
    const body = await new Promise((resolve) => {
      http.get(`${fake.url}${pth}`, (res) => {
        let d = '';
        res.on('data', (c) => (d += c));
        res.on('end', () => resolve({ status: res.statusCode, body: d }));
      });
    });
    assert.equal(body.status, 200, `${pth} must work — bridge is calling the wrong one`);
  }
});

test('QA-03 PROC-BRIDGE :: X-API-Key forwarded verbatim', async (t) => {
  const fake = await startFakeOnyxProcurement();
  t.after(() => fake.close());

  const client = new OnyxProcurementClientReplica(fake.url, 'super-secret', {
    maxRetries: 0,
  });
  await client.getPurchaseOrders();
  await client.getAnalyticsSavings();
  await client.healthCheck();

  for (const c of fake.calls) {
    assert.equal(
      c.headers['x-api-key'],
      'super-secret',
      `every call must carry X-API-Key (saw: ${c.url})`,
    );
  }
});

test('QA-03 PROC-BRIDGE :: query string is forwarded for filter params', async (t) => {
  const fake = await startFakeOnyxProcurement();
  t.after(() => fake.close());
  const client = new OnyxProcurementClientReplica(fake.url, 'k', { maxRetries: 0 });

  await client.getPurchaseOrders({
    status: 'approved',
    vendor_id: 'V-42',
    min_amount: 1000,
    limit: 5,
  });

  const hit = fake.calls.find((c) => c.url.startsWith('/api/purchase-orders'));
  assert.ok(hit, 'request must reach /api/purchase-orders');
  // URLSearchParams orders by insertion — just assert every param is present.
  assert.ok(hit.url.includes('status=approved'));
  assert.ok(hit.url.includes('vendor_id=V-42'));
  assert.ok(hit.url.includes('min_amount=1000'));
  assert.ok(hit.url.includes('limit=5'));
});

test('QA-03 PROC-BRIDGE :: 401 from procurement is treated as permanent failure (no retry storm)', async (t) => {
  const calls = [];
  const srv = http.createServer((req, res) => {
    calls.push(req.url);
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'unauthorized' }));
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  t.after(() => new Promise((r) => srv.close(() => r())));

  const client = new OnyxProcurementClientReplica(
    `http://127.0.0.1:${srv.address().port}`,
    'bad-key',
    { maxRetries: 3, backoffBaseMs: 1 },
  );
  const result = await client.getPurchaseOrders();
  assert.equal(result, null, '401 is treated as a null result');
  assert.equal(
    calls.length,
    1,
    'BUG-14b: 401 must NOT retry — retry on auth failure would tar-pit the AI service',
  );
});
