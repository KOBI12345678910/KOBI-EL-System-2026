/**
 * mock-supabase.js — lightweight in-memory fake of @supabase/supabase-js
 *
 * Shared helper for Agent-15 test harness. Other agents (04, 05, 06, 07, 08,
 * 09, 11, 12, 13, 14) plug their *.test.js files into this. Deliberately
 * minimal: mimics the PostgREST-style fluent builder just enough to unit-test
 * code that expects a Supabase client. NOT a real database.
 *
 * Usage:
 *   const { makeMockSupabase } = require('./helpers/mock-supabase');
 *   const db = makeMockSupabase({ employees: [{ id: 1, name: 'Moshe' }] });
 *   const { data, error } = await db.from('employees').select('*').eq('id', 1).single();
 *   db._log // array of every call, for assertions
 */

'use strict';

function clone(v) {
  return v === undefined ? undefined : JSON.parse(JSON.stringify(v));
}

function pickColumns(row, cols) {
  if (!cols || cols === '*') return clone(row);
  const out = {};
  for (const raw of cols.split(',')) {
    const c = raw.trim();
    if (c && c in row) out[c] = row[c];
  }
  return out;
}

function matchRow(row, filters) {
  for (const f of filters) {
    const v = row[f.col];
    switch (f.op) {
      case 'eq':  if (v !== f.val) return false; break;
      case 'neq': if (v === f.val) return false; break;
      case 'gt':  if (!(v >  f.val)) return false; break;
      case 'gte': if (!(v >= f.val)) return false; break;
      case 'lt':  if (!(v <  f.val)) return false; break;
      case 'lte': if (!(v <= f.val)) return false; break;
      case 'in':  if (!f.val.includes(v)) return false; break;
      case 'is':  if (v !== f.val) return false; break;
      default: return false;
    }
  }
  return true;
}

function makeMockSupabase(seedData = {}, options = {}) {
  const tables = {};
  const serial = {};
  const constraints = options.constraints || {}; // { tableName: [[col1,col2], ...] }
  const log = [];

  // Seed
  for (const [name, rows] of Object.entries(seedData)) {
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

  function violatesUnique(name, candidate, ignoreRow = null) {
    const keys = constraints[name];
    if (!keys || !keys.length) return null;
    for (const composite of keys) {
      for (const row of tables[name]) {
        if (row === ignoreRow) continue;
        if (composite.every((c) => row[c] === candidate[c] && candidate[c] !== undefined)) {
          return { composite, conflict: row };
        }
      }
    }
    return null;
  }

  function from(table) {
    ensureTable(table);
    const state = {
      table,
      action: 'select',
      columns: '*',
      filters: [],
      orderBy: null,
      limitN: null,
      single: false,
      maybeSingle: false,
      payload: null,
      upsertConflict: null,
    };

    const builder = {
      select(cols = '*') { state.action = state.action === 'select' ? 'select' : state.action; state.columns = cols; return builder; },
      eq(col, val)  { state.filters.push({ op: 'eq',  col, val }); return builder; },
      neq(col, val) { state.filters.push({ op: 'neq', col, val }); return builder; },
      gt(col, val)  { state.filters.push({ op: 'gt',  col, val }); return builder; },
      gte(col, val) { state.filters.push({ op: 'gte', col, val }); return builder; },
      lt(col, val)  { state.filters.push({ op: 'lt',  col, val }); return builder; },
      lte(col, val) { state.filters.push({ op: 'lte', col, val }); return builder; },
      in(col, val)  { state.filters.push({ op: 'in',  col, val }); return builder; },
      is(col, val)  { state.filters.push({ op: 'is',  col, val }); return builder; },
      order(col, opts = {}) { state.orderBy = { col, asc: opts.ascending !== false }; return builder; },
      limit(n) { state.limitN = n; return builder; },
      single() { state.single = true; return builder; },
      maybeSingle() { state.maybeSingle = true; return builder; },
      insert(rows) { state.action = 'insert'; state.payload = Array.isArray(rows) ? rows : [rows]; return builder; },
      update(patch) { state.action = 'update'; state.payload = patch; return builder; },
      upsert(rows, opts = {}) {
        state.action = 'upsert';
        state.payload = Array.isArray(rows) ? rows : [rows];
        state.upsertConflict = opts.onConflict || null;
        return builder;
      },
      delete() { state.action = 'delete'; return builder; },
      then(resolve, reject) { return execute().then(resolve, reject); },
      catch(reject) { return execute().catch(reject); },
    };

    function execute() {
      log.push(clone({ table, action: state.action, filters: state.filters, columns: state.columns, payload: state.payload }));
      try {
        let data, error = null;
        const rows = tables[table];
        if (state.action === 'select') {
          let out = rows.filter((r) => matchRow(r, state.filters)).map(clone);
          if (state.orderBy) {
            const { col, asc } = state.orderBy;
            out.sort((a, b) => (a[col] > b[col] ? 1 : a[col] < b[col] ? -1 : 0) * (asc ? 1 : -1));
          }
          if (state.limitN != null) out = out.slice(0, state.limitN);
          out = out.map((r) => pickColumns(r, state.columns));
          data = out;
        } else if (state.action === 'insert') {
          const inserted = [];
          for (const r of state.payload) {
            const row = clone(r);
            if (row.id == null) row.id = nextId(table);
            const v = violatesUnique(table, row);
            if (v) throw new Error(`UNIQUE violation on ${table}(${v.composite.join(',')})`);
            rows.push(row);
            inserted.push(clone(row));
          }
          data = inserted;
        } else if (state.action === 'update') {
          const updated = [];
          for (const r of rows) {
            if (matchRow(r, state.filters)) {
              Object.assign(r, clone(state.payload));
              const v = violatesUnique(table, r, r);
              if (v) throw new Error(`UNIQUE violation on ${table}(${v.composite.join(',')})`);
              updated.push(clone(r));
            }
          }
          data = updated;
        } else if (state.action === 'upsert') {
          const merged = [];
          const conflictCols = state.upsertConflict ? state.upsertConflict.split(',').map((s) => s.trim()) : ['id'];
          for (const r of state.payload) {
            const incoming = clone(r);
            const existing = rows.find((x) => conflictCols.every((c) => x[c] === incoming[c] && incoming[c] !== undefined));
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
    _reset() { for (const k of Object.keys(tables)) delete tables[k]; for (const k of Object.keys(serial)) delete serial[k]; log.length = 0; },
    _snapshot(name) { return clone(tables[name] || []); },
  };
}

module.exports = { makeMockSupabase };
