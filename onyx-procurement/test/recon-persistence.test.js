/**
 * Unit tests for Bank Reconciliation Persistence Adapter
 * Agent 227 — engine state survives a process restart.
 *
 * Run: node --test test/recon-persistence.test.js
 *
 * The supabase client is replaced by an in-memory mock that mirrors
 * the four migration-008 tables and the reconciliation_matches
 * extension columns.  This test does not require a running DB —
 * it validates the upsert / hydrate contract of recon-persistence.js.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const engine = require('../src/bank/reconciliation');
const {
  hydrateSession,
  persistSession,
  persistGLEntries,
  persistMatch,
  persistAdjustment,
  persistAudit,
  persistAll,
  rememberId,
} = require('../src/bank/recon-persistence');

// ── Minimal in-memory supabase mock ────────────────────────────────────
function makeMockSupabase() {
  const tables = {
    reconciliation_sessions: [],
    reconciliation_gl_entries: [],
    reconciliation_matches: [],
    reconciliation_adjustments: [],
    reconciliation_audit: [],
    bank_transactions: [],
    bank_accounts: [{ id: 1, account_name: 'Test', bank_name: 'Test Bank' }],
  };

  function applyEq(rows, eqs) {
    return rows.filter(r => eqs.every(([k, v]) => String(r[k]) === String(v)));
  }

  function builder(table) {
    let where = [];
    let inFilter = null;
    let gte = null, lte = null;
    let order = null;
    let limit = null;
    let single = false;
    let maybeSingle = false;

    const api = {
      select() { return api; },
      eq(k, v) { where.push([k, v]); return api; },
      neq(k, v) { where.push(['__neq__' + k, v]); return api; },
      gte(k, v) { gte = [k, v]; return api; },
      lte(k, v) { lte = [k, v]; return api; },
      in(k, vs) { inFilter = [k, vs]; return api; },
      order() { return api; },
      limit(n) { limit = n; return api; },
      single() { single = true; return api; },
      maybeSingle() { maybeSingle = true; return api; },
      async then(resolve) {
        let rows = tables[table].slice();
        for (const [k, v] of where) {
          if (k.startsWith('__neq__')) {
            const real = k.slice('__neq__'.length);
            rows = rows.filter(r => String(r[real]) !== String(v));
          } else {
            rows = rows.filter(r => String(r[k]) === String(v));
          }
        }
        if (inFilter) rows = rows.filter(r => inFilter[1].includes(r[inFilter[0]]));
        if (gte) rows = rows.filter(r => r[gte[0]] >= gte[1]);
        if (lte) rows = rows.filter(r => r[lte[0]] <= lte[1]);
        if (limit) rows = rows.slice(0, limit);
        if (maybeSingle) return resolve({ data: rows[0] || null, error: null });
        if (single) {
          if (!rows.length) return resolve({ data: null, error: { message: 'no rows' } });
          return resolve({ data: rows[0], error: null });
        }
        return resolve({ data: rows, error: null });
      },
      async upsert(payload, opts) {
        const arr = Array.isArray(payload) ? payload : [payload];
        const onConflict = (opts && opts.onConflict ? opts.onConflict.split(',') : ['id']);
        for (const row of arr) {
          const idx = tables[table].findIndex(r =>
            onConflict.every(k => String(r[k]) === String(row[k])));
          if (idx >= 0) tables[table][idx] = { ...tables[table][idx], ...row };
          else tables[table].push({ ...row });
        }
        return { data: arr, error: null };
      },
      async insert(payload) {
        const arr = Array.isArray(payload) ? payload : [payload];
        for (const row of arr) tables[table].push({ ...row, id: row.id || tables[table].length + 1 });
        return { data: arr, error: null, select() { return api; } };
      },
      update(patch) {
        // Return a chainable thenable so `update(patch).eq(k,v)` works.
        const upd = {
          eq(k, v) { where.push([k, v]); return upd; },
          async then(resolve) {
            let rows = tables[table];
            for (const [k, v] of where) rows = rows.filter(r => String(r[k]) === String(v));
            for (const r of rows) Object.assign(r, patch);
            return resolve({ data: rows, error: null });
          },
        };
        return upd;
      },
    };
    return api;
  }

  return {
    _tables: tables,
    from(table) {
      if (!tables[table]) tables[table] = [];
      return builder(table);
    },
  };
}

// ── Tests ──────────────────────────────────────────────────────────────

test.beforeEach(() => engine.resetAll());

test('persistSession upserts session header keyed on id', async () => {
  const supabase = makeMockSupabase();
  const id = engine.startReconciliation('1', { from: '2026-04-01', to: '2026-04-30' });
  rememberId(id, id);

  await persistSession(supabase, id);
  assert.equal(supabase._tables.reconciliation_sessions.length, 1);
  assert.equal(supabase._tables.reconciliation_sessions[0].id, id);
  assert.equal(supabase._tables.reconciliation_sessions[0].status, 'draft');

  // Idempotency — second call must not duplicate
  await persistSession(supabase, id);
  assert.equal(supabase._tables.reconciliation_sessions.length, 1);
});

test('persistMatch is idempotent — re-running auto-match does not duplicate', async () => {
  const supabase = makeMockSupabase();
  const id = engine.startReconciliation('1', { from: '2026-04-01', to: '2026-04-30' });
  rememberId(id, id);
  engine.importStatement(id, [
    { id: 'btx-db-1', amount: 100, transaction_date: '2026-04-05', description: 'Acme', reference: 'INV-1' },
  ]);
  engine.loadGLEntries(id, [
    { id: 'inv-1', amount: 100, transaction_date: '2026-04-05', description: 'INV-1', counterparty_name: 'Acme' },
  ]);
  engine.runAutoMatch(id);
  await persistAll(supabase, id);

  const after1 = supabase._tables.reconciliation_matches.length;
  // Second persist — should not duplicate (upsert keyed on session_id, engine_id)
  await persistAll(supabase, id);
  const after2 = supabase._tables.reconciliation_matches.length;
  assert.equal(after1, after2);
  assert.ok(after1 >= 1);
});

test('persistAdjustment writes a row keyed on (session_id, engine_id)', async () => {
  const supabase = makeMockSupabase();
  const id = engine.startReconciliation('1', { from: '2026-04-01', to: '2026-04-30' });
  rememberId(id, id);
  const adj = engine.addAdjustment(id, { kind: 'BANK_FEE', amount: -25, date: '2026-04-15', description: 'fee' });
  await persistAdjustment(supabase, id, adj);
  assert.equal(supabase._tables.reconciliation_adjustments.length, 1);
  assert.equal(supabase._tables.reconciliation_adjustments[0].kind, 'BANK_FEE');

  // Idempotency
  await persistAdjustment(supabase, id, adj);
  assert.equal(supabase._tables.reconciliation_adjustments.length, 1);
});

test('persistAudit appends without duplicating when called twice', async () => {
  const supabase = makeMockSupabase();
  const id = engine.startReconciliation('1', { from: '2026-04-01', to: '2026-04-30' });
  rememberId(id, id);
  const snap = engine.getReconciliation(id);
  for (const e of snap.audit) await persistAudit(supabase, id, e);
  const n1 = supabase._tables.reconciliation_audit.length;
  for (const e of snap.audit) await persistAudit(supabase, id, e);
  const n2 = supabase._tables.reconciliation_audit.length;
  assert.equal(n1, n2);
  assert.ok(n1 >= 1);
});

test('hydrateSession rebuilds engine state from a "cold" DB', async () => {
  const supabase = makeMockSupabase();
  const id = engine.startReconciliation('1', { from: '2026-04-01', to: '2026-04-30' });
  rememberId(id, id);
  engine.loadGLEntries(id, [
    { id: 'inv-77', amount: 200, transaction_date: '2026-04-10', description: 'INV-77', counterparty_name: 'Beta' },
  ]);
  await persistAll(supabase, id);

  // Simulate a process restart — drop engine state but keep DB
  engine.resetAll();
  assert.equal(engine.listReconciliations().length, 0);

  // Hydrate the session and check it reappears with the same GL row
  const engineId = await hydrateSession(supabase, id);
  const snap = engine.getReconciliation(engineId);
  assert.equal(snap.gl_entries.length, 1);
  assert.equal(snap.gl_entries[0].id, 'inv-77');
});

test('persistMatch flips bank_transactions.reconciled when undone', async () => {
  const supabase = makeMockSupabase();
  // Seed a bank_transactions row so the FK update has a target
  supabase._tables.bank_transactions.push({ id: 42, reconciled: false });

  const id = engine.startReconciliation('1', { from: '2026-04-01', to: '2026-04-30' });
  rememberId(id, id);
  engine.importStatement(id, [
    { id: 'btx-db-42', amount: 50, transaction_date: '2026-04-12', description: 'X', reference: 'R-42' },
  ]);
  engine.loadGLEntries(id, [
    { id: 'inv-42', amount: 50, transaction_date: '2026-04-12', description: 'R-42', counterparty_name: 'Y' },
  ]);
  engine.runAutoMatch(id);
  const m = engine.getReconciliation(id).matches[0];
  await persistMatch(supabase, id, m);
  assert.equal(supabase._tables.bank_transactions[0].reconciled, true);

  engine.undoMatch(id, m.id);
  const m2 = engine.getReconciliation(id).matches.find(x => x.id === m.id);
  await persistMatch(supabase, id, m2);
  assert.equal(supabase._tables.bank_transactions[0].reconciled, false);
});
