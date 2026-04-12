#!/usr/bin/env node
/**
 * ============================================================================
 * ONYX Procurement — SMOKE TEST HARNESS
 * ----------------------------------------------------------------------------
 * Agent 50 — Zero-dependency happy-path smoke tests for a running API server.
 *
 * USAGE:
 *   BASE_URL=http://localhost:3100 API_KEY=xxx node scripts/smoke-test.js
 *   npm run smoke
 *
 * ENV:
 *   BASE_URL       — target server base URL (default: http://localhost:3100)
 *   API_KEY        — value sent via X-API-Key header (optional but recommended)
 *   SMOKE_TIMEOUT  — per-request timeout in ms (default: 5000)
 *   SMOKE_RETRIES  — retry count for failed endpoints (default: 3)
 *   SMOKE_DELAY    — delay between retries in ms (default: 500)
 *   SMOKE_QUIET    — "1" to suppress per-request logs (default: off)
 *
 * OUTPUT:
 *   - ANSI-colored pass/fail per check with timings
 *   - JSON summary written to  logs/smoke-results.json
 *   - Exit 0 if every check passed, Exit 1 if any check failed
 *
 * DEPENDENCIES:
 *   None. Uses only Node's native `http` / `https` / `fs` / `path` modules.
 *   Requires Node >= 18 (for URL + built-in timeouts).
 *
 * Rule: "לא מוחקים" — this harness is purely read/ping; it only creates
 * fixture rows via POST /api/suppliers (and PATCHes that same row). It never
 * issues DELETE requests against any endpoint.
 * ============================================================================
 */

'use strict';

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

// ─── CONFIG ──────────────────────────────────────────────────────────────────
const BASE_URL = process.env.BASE_URL || 'http://localhost:3100';
const API_KEY = process.env.API_KEY || '';
const TIMEOUT_MS = Number(process.env.SMOKE_TIMEOUT || 5000);
const RETRIES = Number(process.env.SMOKE_RETRIES || 3);
const RETRY_DELAY_MS = Number(process.env.SMOKE_DELAY || 500);
const QUIET = process.env.SMOKE_QUIET === '1';

// ─── ANSI COLORS ─────────────────────────────────────────────────────────────
const ANSI = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};
const NO_COLOR = process.env.NO_COLOR === '1' || !process.stdout.isTTY;
const c = (code, s) => (NO_COLOR ? s : code + s + ANSI.reset);
const green = (s) => c(ANSI.green, s);
const red = (s) => c(ANSI.red, s);
const yellow = (s) => c(ANSI.yellow, s);
const cyan = (s) => c(ANSI.cyan, s);
const gray = (s) => c(ANSI.gray, s);
const bold = (s) => c(ANSI.bold, s);
const CHECK = green('✓');
const CROSS = red('✗');

// ─── HTTP CLIENT (zero-dep) ──────────────────────────────────────────────────
function request(method, urlString, body, headers) {
  return new Promise((resolve, reject) => {
    let u;
    try {
      u = new URL(urlString);
    } catch (e) {
      reject(new Error(`invalid_url:${urlString}`));
      return;
    }
    const lib = u.protocol === 'https:' ? https : http;
    const payload = body != null ? Buffer.from(JSON.stringify(body)) : null;
    const hdrs = Object.assign(
      {
        Accept: 'application/json',
        'User-Agent': 'onyx-smoke-test/1.0',
      },
      headers || {}
    );
    if (API_KEY) hdrs['X-API-Key'] = API_KEY;
    if (payload) {
      hdrs['Content-Type'] = 'application/json';
      hdrs['Content-Length'] = String(payload.length);
    }

    const opts = {
      method,
      hostname: u.hostname,
      port: u.port || (u.protocol === 'https:' ? 443 : 80),
      path: u.pathname + u.search,
      headers: hdrs,
    };

    const req = lib.request(opts, (res) => {
      const chunks = [];
      res.on('data', (d) => chunks.push(d));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        let parsed = null;
        const ct = (res.headers['content-type'] || '').toLowerCase();
        if (raw && ct.includes('application/json')) {
          try { parsed = JSON.parse(raw); } catch (_) { parsed = null; }
        } else if (raw) {
          try { parsed = JSON.parse(raw); } catch (_) { parsed = raw; }
        }
        resolve({ status: res.statusCode, headers: res.headers, body: parsed, raw });
      });
    });

    req.on('error', (err) => reject(err));

    // Enforce timeout
    req.setTimeout(TIMEOUT_MS, () => {
      req.destroy(new Error(`timeout_${TIMEOUT_MS}ms`));
    });

    if (payload) req.write(payload);
    req.end();
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── TEST FRAMEWORK ──────────────────────────────────────────────────────────
const results = [];
const context = {}; // shared scratchpad between checks (e.g. created supplier id)

function nowMs() {
  return Number(process.hrtime.bigint() / 1000000n);
}

async function runCheck(name, fn) {
  const started = nowMs();
  let lastErr = null;
  let attempt = 0;
  for (attempt = 1; attempt <= RETRIES; attempt++) {
    try {
      const out = await fn();
      const duration = nowMs() - started;
      const row = {
        name,
        status: 'pass',
        attempt,
        duration_ms: duration,
        detail: (out && out.detail) || null,
      };
      results.push(row);
      if (!QUIET) {
        console.log(`  ${CHECK} ${name} ${gray(`(${duration}ms, try ${attempt}/${RETRIES})`)}`);
      }
      return row;
    } catch (err) {
      lastErr = err;
      if (attempt < RETRIES) {
        if (!QUIET) {
          console.log(
            `  ${yellow('…')} ${name} ${gray(`retry ${attempt}/${RETRIES} after ${RETRY_DELAY_MS}ms: ${err.message}`)}`
          );
        }
        await sleep(RETRY_DELAY_MS);
      }
    }
  }
  const duration = nowMs() - started;
  const row = {
    name,
    status: 'fail',
    attempt: attempt - 1,
    duration_ms: duration,
    error: (lastErr && lastErr.message) || 'unknown_error',
  };
  results.push(row);
  console.log(`  ${CROSS} ${name} ${gray(`(${duration}ms)`)} ${red(row.error)}`);
  return row;
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion_failed');
}

// ─── FIXTURES ────────────────────────────────────────────────────────────────
const SUPPLIER_FIXTURE = {
  name: `Smoke Test Supplier ${Date.now()}`,
  email: `smoke+${Date.now()}@example.test`,
  phone: '+972-50-0000000',
  category: 'hardware',
  tax_id: '000000000',
  payment_terms: 'net_30',
  notes: 'Created by smoke-test.js — safe to keep, never deleted.',
};

const WAGE_SLIP_FIXTURE = {
  employee_id: 'smoke-emp-0001',
  year: 2026,
  month: 3,
  base_salary: 12000,
  hours_worked: 186,
  overtime_hours: 0,
  bonuses: 0,
  tax_credits: 2.25,
  dependents: 0,
};

// ─── CHECKS ──────────────────────────────────────────────────────────────────
async function checkHealthz() {
  const res = await request('GET', `${BASE_URL}/healthz`);
  assert(res.status === 200, `expected 200, got ${res.status}`);
  assert(res.body && res.body.ok === true, 'expected {ok:true}');
  return { detail: { uptime: res.body.uptime } };
}

async function checkReadyz() {
  const res = await request('GET', `${BASE_URL}/readyz`);
  assert(res.status === 200, `expected 200, got ${res.status}`);
  return { detail: { ready: res.body && res.body.ready } };
}

async function checkListSuppliers() {
  const res = await request('GET', `${BASE_URL}/api/suppliers`);
  assert(res.status === 200, `expected 200, got ${res.status}`);
  const list = Array.isArray(res.body) ? res.body : res.body && res.body.data;
  assert(Array.isArray(list), 'expected array response body');
  return { detail: { count: list.length } };
}

async function checkCreateSupplier() {
  const res = await request('POST', `${BASE_URL}/api/suppliers`, SUPPLIER_FIXTURE);
  assert(res.status === 201 || res.status === 200, `expected 201, got ${res.status}`);
  const created = res.body && (res.body.data || res.body);
  const id = created && (created.id || created.supplier_id || created._id);
  assert(id, 'response missing {id}');
  context.supplierId = id;
  return { detail: { id } };
}

async function checkGetSupplier() {
  assert(context.supplierId, 'no supplier id in context (create step failed?)');
  const res = await request('GET', `${BASE_URL}/api/suppliers/${context.supplierId}`);
  assert(res.status === 200, `expected 200, got ${res.status}`);
  return { detail: { id: context.supplierId } };
}

async function checkPatchSupplier() {
  assert(context.supplierId, 'no supplier id in context');
  const res = await request('PATCH', `${BASE_URL}/api/suppliers/${context.supplierId}`, {
    notes: 'Patched by smoke-test.js',
  });
  assert(res.status === 200, `expected 200, got ${res.status}`);
  return { detail: { id: context.supplierId } };
}

async function checkListInvoices() {
  const res = await request('GET', `${BASE_URL}/api/invoices`);
  assert(res.status === 200, `expected 200, got ${res.status}`);
  return { detail: { content_type: res.headers['content-type'] } };
}

async function checkVatSummary() {
  const res = await request('GET', `${BASE_URL}/api/vat/summary?year=2026&month=3`);
  assert(res.status === 200, `expected 200, got ${res.status}`);
  return { detail: res.body || null };
}

async function checkPayrollCompute() {
  const res = await request(
    'POST',
    `${BASE_URL}/api/payroll/wage-slips/compute`,
    WAGE_SLIP_FIXTURE
  );
  assert(res.status === 200, `expected 200, got ${res.status}`);
  const body = res.body && (res.body.data || res.body);
  const net =
    body &&
    (body.net_pay != null
      ? Number(body.net_pay)
      : body.netPay != null
      ? Number(body.netPay)
      : body.net != null
      ? Number(body.net)
      : null);
  assert(net != null && !Number.isNaN(net), 'response missing net_pay');
  assert(net > 0, `expected net_pay > 0, got ${net}`);
  return { detail: { net_pay: net } };
}

async function checkBankTransactions() {
  const res = await request('GET', `${BASE_URL}/api/bank/transactions`);
  assert(res.status === 200, `expected 200, got ${res.status}`);
  return { detail: { content_type: res.headers['content-type'] } };
}

async function checkAnnualTaxSummary() {
  const res = await request('GET', `${BASE_URL}/api/annual-tax/summary?year=2025`);
  assert(res.status === 200, `expected 200, got ${res.status}`);
  return { detail: res.body || null };
}

// ─── MAIN ────────────────────────────────────────────────────────────────────
const CHECKS = [
  ['GET /healthz', checkHealthz],
  ['GET /readyz', checkReadyz],
  ['GET /api/suppliers', checkListSuppliers],
  ['POST /api/suppliers', checkCreateSupplier],
  ['GET /api/suppliers/:id', checkGetSupplier],
  ['PATCH /api/suppliers/:id', checkPatchSupplier],
  ['GET /api/invoices', checkListInvoices],
  ['GET /api/vat/summary', checkVatSummary],
  ['POST /api/payroll/wage-slips/compute', checkPayrollCompute],
  ['GET /api/bank/transactions', checkBankTransactions],
  ['GET /api/annual-tax/summary', checkAnnualTaxSummary],
];

function printHeader() {
  const hdr = `ONYX SMOKE TEST — ${BASE_URL}`;
  const line = '═'.repeat(Math.max(60, hdr.length + 4));
  console.log('');
  console.log(cyan(line));
  console.log(cyan('  ' + bold(hdr)));
  console.log(
    cyan(
      `  timeout=${TIMEOUT_MS}ms  retries=${RETRIES}  delay=${RETRY_DELAY_MS}ms  apiKey=${API_KEY ? 'yes' : 'no'}`
    )
  );
  console.log(cyan(line));
  console.log('');
}

function printSummary(startedAt) {
  const total = results.length;
  const passed = results.filter((r) => r.status === 'pass').length;
  const failed = total - passed;
  const totalMs = nowMs() - startedAt;
  console.log('');
  console.log(cyan('─'.repeat(60)));
  console.log(
    `${bold('Summary:')} ${green(passed + ' passed')}, ${
      failed ? red(failed + ' failed') : gray('0 failed')
    }, ${total} total  ${gray(`(${totalMs}ms)`)}`
  );
  console.log(cyan('─'.repeat(60)));
  console.log('');
}

function writeJsonSummary(startedAt) {
  const logsDir = path.resolve(__dirname, '..', 'logs');
  try {
    if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
  } catch (e) {
    console.warn(yellow('⚠  unable to create logs dir: ' + e.message));
    return null;
  }
  const outFile = path.join(logsDir, 'smoke-results.json');
  const summary = {
    project: 'onyx-procurement',
    base_url: BASE_URL,
    started_at: new Date(startedAt + (Date.now() - nowMs())).toISOString(),
    finished_at: new Date().toISOString(),
    duration_ms: nowMs() - startedAt,
    total: results.length,
    passed: results.filter((r) => r.status === 'pass').length,
    failed: results.filter((r) => r.status === 'fail').length,
    config: {
      timeout_ms: TIMEOUT_MS,
      retries: RETRIES,
      retry_delay_ms: RETRY_DELAY_MS,
      api_key_sent: Boolean(API_KEY),
    },
    results,
  };
  try {
    fs.writeFileSync(outFile, JSON.stringify(summary, null, 2), 'utf8');
    console.log(gray('  JSON summary → ' + outFile));
    console.log('');
  } catch (e) {
    console.warn(yellow('⚠  unable to write smoke-results.json: ' + e.message));
  }
  return summary;
}

async function main() {
  printHeader();
  const startedAt = nowMs();
  for (const [name, fn] of CHECKS) {
    // eslint-disable-next-line no-await-in-loop
    await runCheck(name, fn);
  }
  printSummary(startedAt);
  writeJsonSummary(startedAt);
  const failed = results.filter((r) => r.status === 'fail').length;
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(red('FATAL: ' + (err && err.stack ? err.stack : err)));
  process.exit(1);
});
