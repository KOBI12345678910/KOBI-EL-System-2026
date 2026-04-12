/**
 * QA-05 — Regression Agent
 * Area: VAT Express routes (legacy Wave 1.5 / B-09)
 *
 * Purpose:
 *   Verifies that legacy /api/vat/* endpoints still return the same HTTP
 *   status codes and response shapes that the dashboard UI keys off.
 *
 *   Unlike test/vat-routes.test.js which mocks a real DB with fixtures,
 *   this file focuses SPECIFICALLY on the boundary contract:
 *     - 200 on valid GET
 *     - 201 on valid POST
 *     - 400 on malformed POST (missing required fields)
 *     - 404 on missing resource
 *     - Response JSON envelope keys ("periods", "period", "profile", etc.)
 *
 *   Run:
 *     node --test test/regression/qa-05-vat-routes.test.js
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');

const express = require('express');
const { registerVatRoutes } = require(path.resolve(__dirname, '..', '..', 'src', 'vat', 'vat-routes.js'));

// ─── Minimal fake supabase sufficient for VAT routes ───────────────────

function makeSupabase(tables) {
  let nextId = 5000;
  function from(table) {
    const state = { filters: [], orderBy: null, limitN: null, op: 'select', payload: null, neqFilters: [] };
    const rows = () => (tables[table] = tables[table] || []);

    function matchesAll(r) {
      if (!state.filters.every(({ col, val }) => r[col] == val)) return false;
      if (!state.neqFilters.every(({ col, val }) => r[col] != val)) return false;
      return true;
    }

    function runSelect() {
      let out = rows().filter(matchesAll).map((x) => ({ ...x }));
      if (state.orderBy) {
        const { col, asc } = state.orderBy;
        out.sort((a, b) => (a[col] > b[col] ? 1 : a[col] < b[col] ? -1 : 0) * (asc ? 1 : -1));
      }
      if (state.limitN != null) out = out.slice(0, state.limitN);
      return { data: out, error: null };
    }
    function runInsert() {
      const arr = Array.isArray(state.payload) ? state.payload : [state.payload];
      const inserted = arr.map((r) => {
        const copy = { ...r };
        if (copy.id == null) copy.id = nextId++;
        rows().push(copy);
        return copy;
      });
      return { data: inserted, error: null };
    }
    function runUpdate() {
      const matched = rows().filter(matchesAll);
      for (const r of matched) Object.assign(r, state.payload);
      return { data: matched, error: null };
    }
    function execute() {
      if (state.op === 'insert') return runInsert();
      if (state.op === 'update') return runUpdate();
      return runSelect();
    }

    const builder = {
      select() { return builder; },
      eq(col, val)  { state.filters.push({ col, val }); return builder; },
      neq(col, val) { state.neqFilters.push({ col, val }); return builder; },
      order(col, opts = {}) { state.orderBy = { col, asc: opts.ascending !== false }; return builder; },
      limit(n)      { state.limitN = n; return builder; },
      insert(row)   { state.op = 'insert'; state.payload = row; return builder; },
      update(p)     { state.op = 'update'; state.payload = p; return builder; },
      single() {
        const { data, error } = execute();
        if (error) return Promise.resolve({ data: null, error });
        if (!data || data.length === 0) {
          return Promise.resolve({ data: null, error: { message: 'no rows' } });
        }
        return Promise.resolve({ data: data[0], error: null });
      },
      maybeSingle() {
        const { data, error } = execute();
        if (error) return Promise.resolve({ data: null, error });
        return Promise.resolve({ data: data && data[0] ? data[0] : null, error: null });
      },
      then(onF, onR) {
        try { return Promise.resolve(execute()).then(onF, onR); }
        catch (e) { return Promise.reject(e).catch(onR); }
      },
    };
    return builder;
  }
  return { from };
}

function request(server, method, pathname, body) {
  return new Promise((resolve, reject) => {
    const { port } = server.address();
    const payload = body == null ? null : Buffer.from(JSON.stringify(body));
    const req = http.request({
      host: '127.0.0.1',
      port,
      method,
      path: pathname,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': payload ? payload.length : 0,
      },
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try { json = raw ? JSON.parse(raw) : null; } catch (_) { /* not json */ }
        resolve({ status: res.statusCode, body: json, raw });
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function startApp(tables = {}) {
  const supabase = makeSupabase(tables);
  const auditCalls = [];
  const audit = async (...args) => { auditCalls.push(args); };
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.actor = 'qa-05'; next(); });
  registerVatRoutes(app, { supabase, audit, requireAuth: (_req, _res, next) => next(), VAT_RATE: 0.17 });
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => resolve({ server, supabase, auditCalls }));
  });
}

function stopApp({ server }) {
  return new Promise((resolve) => server.close(resolve));
}

// ─── 1. GET /api/vat/profile — 200 with profile key ───────────────────

test('QA-05 vat.routes: GET /api/vat/profile returns 200 + {profile} envelope', async () => {
  const ctx = await startApp({
    company_tax_profile: [{
      id: 1,
      legal_name: 'טכנו כל עוזי',
      vat_file_number: '123456789',
      company_id: '514000000',
    }],
  });
  try {
    const r = await request(ctx.server, 'GET', '/api/vat/profile');
    assert.equal(r.status, 200);
    assert.ok(r.body && 'profile' in r.body, 'envelope must include "profile"');
    assert.equal(r.body.profile.vat_file_number, '123456789');
  } finally { await stopApp(ctx); }
});

test('QA-05 vat.routes: GET /api/vat/profile returns 200 even with empty table', async () => {
  const ctx = await startApp({ company_tax_profile: [] });
  try {
    const r = await request(ctx.server, 'GET', '/api/vat/profile');
    assert.equal(r.status, 200, 'empty profile should still return 200');
    assert.equal(r.body.profile, null);
  } finally { await stopApp(ctx); }
});

// ─── 2. GET /api/vat/periods — 200 + sorted list ──────────────────────

test('QA-05 vat.routes: GET /api/vat/periods returns 200 + {periods[]} sorted desc', async () => {
  const ctx = await startApp({
    vat_periods: [
      { id: 1, period_label: '2026-01', period_start: '2026-01-01', period_end: '2026-01-31', status: 'submitted' },
      { id: 2, period_label: '2026-02', period_start: '2026-02-01', period_end: '2026-02-28', status: 'submitted' },
      { id: 3, period_label: '2026-03', period_start: '2026-03-01', period_end: '2026-03-31', status: 'open' },
    ],
  });
  try {
    const r = await request(ctx.server, 'GET', '/api/vat/periods');
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(r.body.periods));
    assert.equal(r.body.periods.length, 3);
    // Sorted descending by period_start → 2026-03 first
    assert.equal(r.body.periods[0].period_label, '2026-03');
    assert.equal(r.body.periods[2].period_label, '2026-01');
  } finally { await stopApp(ctx); }
});

// ─── 3. POST /api/vat/periods — 400 without required fields ───────────

test('QA-05 vat.routes: POST /api/vat/periods returns 400 when period_start missing', async () => {
  const ctx = await startApp({ vat_periods: [] });
  try {
    const r = await request(ctx.server, 'POST', '/api/vat/periods', { period_end: '2026-04-30' });
    assert.equal(r.status, 400);
    assert.ok(r.body && typeof r.body.error === 'string', 'error envelope expected');
    assert.ok(/period_start/.test(r.body.error));
  } finally { await stopApp(ctx); }
});

test('QA-05 vat.routes: POST /api/vat/periods returns 400 when period_end missing', async () => {
  const ctx = await startApp({ vat_periods: [] });
  try {
    const r = await request(ctx.server, 'POST', '/api/vat/periods', { period_start: '2026-04-01' });
    assert.equal(r.status, 400);
    assert.ok(/period_end/.test(r.body.error));
  } finally { await stopApp(ctx); }
});

test('QA-05 vat.routes: POST /api/vat/periods returns 201 on valid payload', async () => {
  const ctx = await startApp({ vat_periods: [] });
  try {
    const r = await request(ctx.server, 'POST', '/api/vat/periods', {
      period_start: '2026-04-01',
      period_end: '2026-04-30',
    });
    assert.equal(r.status, 201);
    assert.ok(r.body.period, 'envelope must include "period"');
    assert.equal(r.body.period.status, 'open');
    assert.equal(r.body.period.period_label, '2026-04', 'auto-labelled from period_start');
    assert.ok(ctx.auditCalls.length >= 1, 'audit log invocation expected');
  } finally { await stopApp(ctx); }
});

// ─── 4. GET /api/vat/periods/:id computed totals shape ────────────────

test('QA-05 vat.routes: GET /api/vat/periods/:id returns {period, computed, counts}', async () => {
  const ctx = await startApp({
    vat_periods: [{ id: 7, period_label: '2026-04', period_start: '2026-04-01', period_end: '2026-04-30', status: 'open' }],
    tax_invoices: [
      { id: 100, vat_period_id: 7, direction: 'output', status: 'issued', net_amount: 10000, vat_amount: 1700, is_asset: false, is_zero_rate: false, is_exempt: false },
      { id: 101, vat_period_id: 7, direction: 'input',  status: 'issued', net_amount: 5000,  vat_amount: 850,  is_asset: false, is_zero_rate: false, is_exempt: false },
    ],
  });
  try {
    const r = await request(ctx.server, 'GET', '/api/vat/periods/7');
    assert.equal(r.status, 200);
    assert.ok(r.body.period, 'period key');
    assert.ok(r.body.computed, 'computed key');
    assert.ok(r.body.counts, 'counts key');
    // Baseline computed values
    assert.equal(r.body.computed.taxable_sales, 10000);
    assert.equal(r.body.computed.vat_on_sales, 1700);
    assert.equal(r.body.computed.taxable_purchases, 5000);
    assert.equal(r.body.computed.vat_on_purchases, 850);
    assert.equal(r.body.computed.net_vat_payable, 850, 'vat_on_sales - vat_on_purchases - vat_on_assets');
    assert.equal(r.body.computed.is_refund, false);
  } finally { await stopApp(ctx); }
});

test('QA-05 vat.routes: GET /api/vat/periods/:id returns 404 on missing id', async () => {
  const ctx = await startApp({ vat_periods: [] });
  try {
    const r = await request(ctx.server, 'GET', '/api/vat/periods/9999');
    assert.equal(r.status, 404);
    assert.ok(/not found/i.test(r.body.error));
  } finally { await stopApp(ctx); }
});
