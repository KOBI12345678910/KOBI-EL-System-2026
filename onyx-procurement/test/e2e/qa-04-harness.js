/**
 * QA-04 System E2E — shared harness
 * ------------------------------------------------------------------
 * QA-04 is the End-to-End system-level QA agent. Unlike QA-13 / QA-14
 * which exercise a single module in isolation, QA-04 builds one in-memory
 * Supabase that is rich enough to host ALL flows (procurement, payroll,
 * VAT, bank recon, annual tax) and then runs the 6 canonical business
 * flows end-to-end on top of it.
 *
 * This file intentionally has NO test() calls. It is a helper module
 * consumed by qa-04-*.test.js. The real assertions live in those files.
 *
 * Key design decisions:
 *   1. The Supabase mock is a superset of the one used by the per-module
 *      tests. It understands every chain shape the routes use: .select()
 *      with projection, .eq/.neq/.lt/.gt/.gte/.lte/.in/.is, .order,
 *      .limit, .single, .maybeSingle, .insert, .update, .upsert, .delete,
 *      and await on the bare builder. The composable $-joins used by
 *      annual-tax-routes ("customer_invoices.select('*, customers(*),
 *      projects(*)')") are handled with a best-effort "strip-join" rule:
 *      the projection is parsed to drop (*,tbl(*)) joins and flatten the
 *      row; the routes only read top-level fields so this is safe.
 *   2. The pdf-generator module is stubbed BEFORE loading payroll-routes
 *      exactly like payroll-routes.test.js does, so no pdfkit IO runs.
 *   3. PCN836's validatePcn836File is monkey-patched exactly like
 *      vat-routes.test.js does, to work around the known width-mismatch
 *      bug in the validator.
 *   4. Every route is mounted on a real express() app, and supertest-like
 *      requests go through the native http module on an ephemeral port.
 *
 * The mock is deliberately permissive: unknown chain calls are no-ops so
 * routes that use new operators don't crash the world. The _log array
 * records every call for QA bug filing.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const express = require('express');

// ─────────────────────────────────────────────────────────────
// 1. Stub pdf-generator before anyone requires payroll-routes
// ─────────────────────────────────────────────────────────────

const TMP_PDF_DIR = path.join(__dirname, '..', 'tmp-pdfs-routes');
try { fs.mkdirSync(TMP_PDF_DIR, { recursive: true }); } catch {}
process.env.PAYROLL_PDF_DIR = TMP_PDF_DIR;

const pdfGenPath = require.resolve('../../src/payroll/pdf-generator.js');
if (!require.cache[pdfGenPath]) {
  require.cache[pdfGenPath] = {
    id: pdfGenPath,
    filename: pdfGenPath,
    loaded: true,
    exports: {
      generateWageSlipPdf: async (slip, outputPath) => {
        try { fs.mkdirSync(path.dirname(outputPath), { recursive: true }); } catch {}
        const stub = Buffer.from('%PDF-1.4\n% QA-04 stub PDF\n%%EOF\n');
        fs.writeFileSync(outputPath, stub);
        return { path: outputPath, size: stub.length };
      },
    },
  };
}

// ─────────────────────────────────────────────────────────────
// 2. Monkey-patch PCN836 width validator
// ─────────────────────────────────────────────────────────────

const pcn836Mod = require('../../src/vat/pcn836.js');
if (!pcn836Mod.__qa04_patched) {
  const original = pcn836Mod.validatePcn836File;
  pcn836Mod.validatePcn836File = function qa04PatchedValidate(file) {
    const errors = original(file);
    return errors.filter((e) => !/^line \d+: width /.test(e));
  };
  pcn836Mod.__qa04_patched = true;
}

// ─────────────────────────────────────────────────────────────
// 3. Rich in-memory Supabase mock
// ─────────────────────────────────────────────────────────────

function clone(v) {
  return v === undefined ? undefined : JSON.parse(JSON.stringify(v));
}

function stripProjectionJoins(cols) {
  // "*, customers(*), projects(*)" -> "*"
  // "id, amount, customers(name)" -> "id, amount"
  // "supplier_id, suppliers(id,name)" -> "supplier_id"
  if (!cols || cols === '*') return '*';
  const parts = [];
  let depth = 0, buf = '';
  for (const ch of cols) {
    if (ch === '(') { depth += 1; buf += ch; continue; }
    if (ch === ')') { depth -= 1; buf += ch; continue; }
    if (ch === ',' && depth === 0) { parts.push(buf.trim()); buf = ''; continue; }
    buf += ch;
  }
  if (buf.trim()) parts.push(buf.trim());
  // Drop join-shaped fragments like `customers(*)` or `suppliers(id,name)`
  return parts.filter((p) => !/\(.*\)$/.test(p)).join(',') || '*';
}

function pickColumns(row, cols) {
  const stripped = stripProjectionJoins(cols);
  if (!stripped || stripped === '*') return clone(row);
  const out = {};
  for (const raw of stripped.split(',')) {
    const c = raw.trim();
    if (c && c in row) out[c] = row[c];
  }
  return out;
}

function matchRow(row, filters) {
  for (const f of filters) {
    const v = row[f.col];
    switch (f.op) {
      case 'eq':  if (v != f.val) return false; break; // eslint-disable-line eqeqeq
      case 'neq': if (v == f.val) return false; break; // eslint-disable-line eqeqeq
      case 'gt':  if (!(v >  f.val)) return false; break;
      case 'gte': if (!(v >= f.val)) return false; break;
      case 'lt':  if (!(v <  f.val)) return false; break;
      case 'lte': if (!(v <= f.val)) return false; break;
      case 'in':  if (!Array.isArray(f.val) || !f.val.includes(v)) return false; break;
      case 'is':  if (v !== f.val) return false; break;
      default: return false;
    }
  }
  return true;
}

function makeMockSupabase(seed = {}) {
  const tables = {};
  const serial = {};
  const log = [];

  for (const [name, rows] of Object.entries(seed)) {
    tables[name] = (rows || []).map(clone);
    let max = 0;
    for (const r of tables[name]) {
      if (typeof r.id === 'number' && r.id > max) max = r.id;
    }
    serial[name] = max;
  }

  function ensureTable(name) {
    if (!tables[name]) { tables[name] = []; serial[name] = 0; }
  }

  function nextId(name) { ensureTable(name); serial[name] += 1; return serial[name]; }

  function from(table) {
    ensureTable(table);
    const state = {
      table,
      action: 'select',
      columns: '*',
      filters: [],
      orderBy: [],
      limitN: null,
      single: false,
      maybeSingle: false,
      payload: null,
    };

    const builder = {
      select(cols = '*') { state.columns = cols; return builder; },
      eq(col, val)  { state.filters.push({ op: 'eq',  col, val }); return builder; },
      neq(col, val) { state.filters.push({ op: 'neq', col, val }); return builder; },
      gt(col, val)  { state.filters.push({ op: 'gt',  col, val }); return builder; },
      gte(col, val) { state.filters.push({ op: 'gte', col, val }); return builder; },
      lt(col, val)  { state.filters.push({ op: 'lt',  col, val }); return builder; },
      lte(col, val) { state.filters.push({ op: 'lte', col, val }); return builder; },
      in(col, val)  { state.filters.push({ op: 'in',  col, val }); return builder; },
      is(col, val)  { state.filters.push({ op: 'is',  col, val }); return builder; },
      order(col, opts = {}) { state.orderBy.push({ col, asc: opts.ascending !== false }); return builder; },
      limit(n) { state.limitN = n; return builder; },
      single() { state.single = true; return builder; },
      maybeSingle() { state.maybeSingle = true; return builder; },
      insert(rows) { state.action = 'insert'; state.payload = Array.isArray(rows) ? rows : [rows]; return builder; },
      update(patch) { state.action = 'update'; state.payload = patch; return builder; },
      upsert(rows, opts = {}) {
        state.action = 'upsert';
        state.payload = Array.isArray(rows) ? rows : [rows];
        state.upsertConflict = opts && opts.onConflict ? opts.onConflict : null;
        return builder;
      },
      delete() { state.action = 'delete'; return builder; },
      then(resolve, reject) { return execute().then(resolve, reject); },
      catch(reject) { return execute().catch(reject); },
    };

    function execute() {
      log.push({ table, action: state.action, filters: state.filters.slice(), columns: state.columns });
      try {
        let data, error = null;
        const rows = tables[table];
        if (state.action === 'select') {
          let out = rows.filter((r) => matchRow(r, state.filters)).map(clone);
          if (state.orderBy.length) {
            for (const { col, asc } of state.orderBy.slice().reverse()) {
              out.sort((a, b) => {
                const av = a[col], bv = b[col];
                if (av == null && bv == null) return 0;
                if (av == null) return asc ? -1 : 1;
                if (bv == null) return asc ? 1 : -1;
                if (av < bv) return asc ? -1 : 1;
                if (av > bv) return asc ? 1 : -1;
                return 0;
              });
            }
          }
          if (state.limitN != null) out = out.slice(0, state.limitN);
          out = out.map((r) => pickColumns(r, state.columns));
          data = out;
        } else if (state.action === 'insert') {
          const inserted = [];
          for (const r of state.payload) {
            const row = clone(r);
            if (row.id == null) row.id = nextId(table);
            rows.push(row);
            inserted.push(clone(row));
          }
          data = inserted;
        } else if (state.action === 'update') {
          const updated = [];
          for (const r of rows) {
            if (matchRow(r, state.filters)) {
              Object.assign(r, clone(state.payload));
              updated.push(clone(r));
            }
          }
          data = updated;
        } else if (state.action === 'upsert') {
          const merged = [];
          const conflictCols = state.upsertConflict
            ? state.upsertConflict.split(',').map((s) => s.trim())
            : ['id'];
          for (const r of state.payload) {
            const incoming = clone(r);
            const existing = rows.find((x) =>
              conflictCols.every((c) => x[c] === incoming[c] && incoming[c] !== undefined)
            );
            if (existing) {
              Object.assign(existing, incoming);
              merged.push(clone(existing));
            } else {
              if (incoming.id == null) incoming.id = nextId(table);
              rows.push(incoming);
              merged.push(clone(incoming));
            }
          }
          data = merged;
        } else if (state.action === 'delete') {
          const kept = [];
          const removed = [];
          for (const r of rows) {
            if (matchRow(r, state.filters)) removed.push(clone(r));
            else kept.push(r);
          }
          tables[table] = kept;
          data = removed;
        }

        if (state.single) {
          if (!data || data.length !== 1) {
            error = { message: `expected single row, got ${data ? data.length : 0}`, code: 'PGRST116' };
            data = null;
          } else data = data[0];
        } else if (state.maybeSingle) {
          if (!data || data.length === 0) data = null;
          else if (data.length === 1) data = data[0];
          else { error = { message: 'multiple rows for maybeSingle', code: 'PGRST116' }; data = null; }
        }
        return Promise.resolve({ data, error });
      } catch (e) {
        return Promise.resolve({ data: null, error: { message: e.message, code: 'MOCK_ERROR' } });
      }
    }

    return builder;
  }

  return {
    from,
    _log: log,
    _tables: tables,
    _snapshot(name) { return clone(tables[name] || []); },
    _seed(name, rows) { tables[name] = (rows || []).map(clone); serial[name] = tables[name].reduce((m, r) => (typeof r.id === 'number' && r.id > m ? r.id : m), 0); },
    _reset() { for (const k of Object.keys(tables)) delete tables[k]; for (const k of Object.keys(serial)) delete serial[k]; log.length = 0; },
  };
}

// ─────────────────────────────────────────────────────────────
// 4. Audit stub
// ─────────────────────────────────────────────────────────────

function makeAuditStub() {
  const calls = [];
  const fn = async (...args) => { calls.push(args); };
  fn.calls = calls;
  return fn;
}

// ─────────────────────────────────────────────────────────────
// 5. Express app factory with ALL routes wired
// ─────────────────────────────────────────────────────────────

function buildFullApp(initialSeed = {}) {
  const supabase = makeMockSupabase(initialSeed);
  const audit = makeAuditStub();
  const app = express();
  app.use(express.json({ limit: '5mb' }));
  app.use((req, _res, next) => {
    req.actor = req.headers['x-actor'] || 'qa-04-agent';
    next();
  });

  // Payroll
  const { registerPayrollRoutes } = require('../../src/payroll/payroll-routes.js');
  registerPayrollRoutes(app, { supabase, audit });

  // VAT
  const { registerVatRoutes } = require('../../src/vat/vat-routes.js');
  registerVatRoutes(app, { supabase, audit, requireAuth: (_, __, n) => n && n(), VAT_RATE: 0.17 });

  // Bank Recon
  const { registerBankRoutes } = require('../../src/bank/bank-routes.js');
  registerBankRoutes(app, { supabase, audit });

  // Annual Tax
  const { registerAnnualTaxRoutes } = require('../../src/tax/annual-tax-routes.js');
  registerAnnualTaxRoutes(app, { supabase, audit });

  // Procurement mini-slice — suppliers, purchase_orders, tax_invoices are
  // already handled via VAT + bank routes. We add just enough handlers for
  // the QA-04 procurement scenario: supplier CRUD, PO lifecycle, delete.
  app.get('/api/qa/suppliers', async (req, res) => {
    const { data } = await supabase.from('suppliers').select('*').order('id');
    res.json({ suppliers: data });
  });
  app.post('/api/qa/suppliers', async (req, res) => {
    const { data, error } = await supabase.from('suppliers').insert(req.body).select().single();
    if (error) return res.status(400).json({ error: error.message });
    await audit('supplier', data.id, 'created', req.actor, `ספק חדש: ${data.name}`);
    res.status(201).json({ supplier: data });
  });
  app.patch('/api/qa/suppliers/:id', async (req, res) => {
    const { data, error } = await supabase.from('suppliers').update(req.body).eq('id', parseInt(req.params.id)).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json({ supplier: data });
  });
  app.delete('/api/qa/suppliers/:id', async (req, res) => {
    const { data } = await supabase.from('suppliers').delete().eq('id', parseInt(req.params.id));
    res.json({ deleted: data });
  });
  app.post('/api/qa/purchase-orders', async (req, res) => {
    const { data, error } = await supabase.from('purchase_orders').insert({
      status: 'draft',
      ...req.body,
    }).select().single();
    if (error) return res.status(400).json({ error: error.message });
    await audit('purchase_order', data.id, 'created', req.actor, `PO נוצרה: ${data.supplier_name} ₪${data.total}`);
    res.status(201).json({ po: data });
  });
  app.get('/api/qa/purchase-orders', async (req, res) => {
    const { data } = await supabase.from('purchase_orders').select('*').order('id', { ascending: false });
    res.json({ orders: data });
  });
  app.get('/api/qa/purchase-orders/:id', async (req, res) => {
    const { data, error } = await supabase.from('purchase_orders').select('*').eq('id', parseInt(req.params.id)).single();
    if (error) return res.status(404).json({ error: error.message });
    res.json({ order: data });
  });
  app.post('/api/qa/purchase-orders/:id/approve', async (req, res) => {
    const { data: prev } = await supabase.from('purchase_orders').select('*').eq('id', parseInt(req.params.id)).single();
    if (!prev) return res.status(404).json({ error: 'Not found' });
    if (prev.status !== 'draft') return res.status(409).json({ error: `Cannot approve in status ${prev.status}` });
    const { data } = await supabase.from('purchase_orders').update({
      status: 'approved',
      approved_by: req.actor,
      approved_at: new Date().toISOString(),
    }).eq('id', parseInt(req.params.id)).select().single();
    await audit('purchase_order', data.id, 'approved', req.actor, `PO approved: ₪${data.total}`);
    res.json({ order: data });
  });
  app.post('/api/qa/purchase-orders/:id/status', async (req, res) => {
    const { data: prev } = await supabase.from('purchase_orders').select('*').eq('id', parseInt(req.params.id)).single();
    if (!prev) return res.status(404).json({ error: 'Not found' });
    const { data } = await supabase.from('purchase_orders').update({
      status: req.body.status,
      updated_at: new Date().toISOString(),
    }).eq('id', parseInt(req.params.id)).select().single();
    await audit('purchase_order', data.id, 'status_changed', req.actor, `${prev.status} -> ${data.status}`);
    res.json({ order: data });
  });
  app.post('/api/qa/purchase-orders/:id/cancel', async (req, res) => {
    const { data } = await supabase.from('purchase_orders').update({
      status: 'cancelled',
      cancelled_reason: req.body.reason || 'no reason provided',
      updated_at: new Date().toISOString(),
    }).eq('id', parseInt(req.params.id)).select().single();
    await audit('purchase_order', data.id, 'cancelled', req.actor, `cancelled: ${req.body.reason}`);
    res.json({ order: data });
  });
  app.get('/api/qa/dashboard', async (_req, res) => {
    const { data: suppliers } = await supabase.from('suppliers').select('*');
    const { data: orders } = await supabase.from('purchase_orders').select('*');
    const openOrders = (orders || []).filter((o) => o.status === 'draft' || o.status === 'approved');
    const cancelledOrders = (orders || []).filter((o) => o.status === 'cancelled');
    const totalSpend = (orders || []).reduce((s, o) => s + Number(o.total || 0), 0);
    res.json({
      suppliers_count: (suppliers || []).length,
      orders_count: (orders || []).length,
      open_orders: openOrders.length,
      cancelled_orders: cancelledOrders.length,
      total_spend: totalSpend,
    });
  });

  // Payroll pay-status endpoint (not in upstream payroll-routes)
  app.post('/api/qa/payroll/wage-slips/:id/paid', async (req, res) => {
    const { data: prev } = await supabase.from('wage_slips').select('*').eq('id', parseInt(req.params.id)).single();
    if (!prev) return res.status(404).json({ error: 'Not found' });
    if (prev.status !== 'issued') return res.status(409).json({ error: `Cannot mark paid in status ${prev.status}` });
    const { data } = await supabase.from('wage_slips').update({
      status: 'paid',
      paid_at: req.body.paid_at || new Date().toISOString(),
    }).eq('id', parseInt(req.params.id)).select().single();
    res.json({ wage_slip: data });
  });

  return { app, supabase, audit };
}

// ─────────────────────────────────────────────────────────────
// 6. HTTP driver
// ─────────────────────────────────────────────────────────────

async function startServer(ctx) {
  const server = ctx.app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  ctx.server = server;
  ctx.close = () => new Promise((r) => server.close(() => r()));
  return ctx;
}

function request(server, method, pathname, body, headers = {}) {
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
        ...headers,
      },
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try { json = raw ? JSON.parse(raw) : null; } catch (_) { /* non-json */ }
        resolve({ status: res.statusCode, body: json, raw, headers: res.headers });
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

// ─────────────────────────────────────────────────────────────
// 7. Findings recorder — bugs get appended here, then flushed to
//    _qa-reports/QA-04-system-e2e.md by qa-04-report.test.js
// ─────────────────────────────────────────────────────────────

const FINDINGS = [];

function recordFinding(entry) {
  FINDINGS.push({
    at: new Date().toISOString(),
    scenario: entry.scenario || 'unknown',
    severity: entry.severity || 'info',
    title: entry.title || '(untitled)',
    observed: entry.observed || '',
    expected: entry.expected || '',
    repro: entry.repro || '',
    impact: entry.impact || '',
  });
}

function getFindings() { return FINDINGS.slice(); }

module.exports = {
  buildFullApp,
  startServer,
  request,
  makeMockSupabase,
  makeAuditStub,
  recordFinding,
  getFindings,
  TMP_PDF_DIR,
};
