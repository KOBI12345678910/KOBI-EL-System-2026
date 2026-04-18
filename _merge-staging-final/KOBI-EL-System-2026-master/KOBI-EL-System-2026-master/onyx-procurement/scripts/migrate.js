#!/usr/bin/env node
/**
 * ONYX PROCUREMENT - Migration Runner (v3)
 * =========================================
 * Agent 49 upgrade. Rule: do not delete - only upgrade.
 *
 * Features:
 *   1. Reads `migrations/*.sql` in lexical order (001_xxx, 002_yyy, ...)
 *      - Primary:  <repo>/migrations/
 *      - Fallback: <repo>/supabase/migrations/  (legacy layout)
 *      - Override: MIGRATIONS_DIR env var
 *   2. Manages `public.schema_migrations (version, applied_at, checksum, ...)`
 *   3. SHA256 checksum per migration + drift detection
 *   4. Flags:
 *        --up            (default)     apply all pending migrations
 *        --down N        rollback the N most recently applied migrations
 *                        (requires `-- DOWN:` section in each migration)
 *        --status                      show what's applied / pending / drifted
 *        --dry-run                     plan only - do not execute
 *        --force                       ignore checksum mismatch (loud warning)
 *        --json                        machine-readable output (for CI)
 *   5. Transaction around every migration - full rollback on any failure
 *   6. Advisory lock via pg_advisory_lock() - prevents concurrent runs
 *   7. Per-run log file at logs/migrations/<UTC-timestamp>.log with timings
 *   8. Multi-statement .sql files are handled correctly (dollar-quote aware)
 *
 * Migration file format (single file, UP + DOWN sections):
 *
 *     -- UP
 *     CREATE TABLE foo (id SERIAL PRIMARY KEY);
 *
 *     -- DOWN
 *     DROP TABLE foo;
 *
 * Backends (auto-selected):
 *   1. Direct Postgres via the `pg` package - used when SUPABASE_DB_URL is set
 *      and `pg` is installed. Gives real transactions and true advisory locks.
 *   2. Fallback: @supabase/supabase-js RPC to `public.pg_execute(sql)`.
 *      Requires the `000-bootstrap-pg-execute.sql` migration to have run.
 *
 * Env vars:
 *   SUPABASE_DB_URL             postgres://... (preferred, gives real TX)
 *   SUPABASE_URL                https://xxx.supabase.co   (fallback)
 *   SUPABASE_SERVICE_ROLE_KEY   service role key          (fallback)
 *   MIGRATIONS_DIR              override the migrations directory path
 *   ONYX_MIGRATE_ADVISORY_LOCK  advisory lock key (bigint), default 7326491
 *
 * Exit codes:
 *   0  success / no-op
 *   1  migration failed / drift detected without --force
 *   2  bad CLI args / missing env / lock not acquired
 *   3  runner crashed
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

try { require('dotenv').config(); } catch (_) { /* optional */ }

// ------------------------------------------------------------------
//  CLI arg parsing
// ------------------------------------------------------------------

const rawArgs = process.argv.slice(2);

function takeFlag(name) {
  const i = rawArgs.indexOf(name);
  if (i === -1) return false;
  rawArgs.splice(i, 1);
  return true;
}

function takeValue(name) {
  const i = rawArgs.indexOf(name);
  if (i === -1) return null;
  const v = rawArgs[i + 1];
  if (!v || v.startsWith('--')) { rawArgs.splice(i, 1); return true; }
  rawArgs.splice(i, 2);
  return v;
}

const FLAG_HELP     = takeFlag('--help') || takeFlag('-h');
const FLAG_STATUS   = takeFlag('--status');
const FLAG_DRY_RUN  = takeFlag('--dry-run');
const FLAG_FORCE    = takeFlag('--force');
const FLAG_JSON     = takeFlag('--json');
const FLAG_UP       = takeFlag('--up');
const VALUE_DOWN    = takeValue('--down');
const FLAG_DOWN_BOOL = VALUE_DOWN === true;
const DOWN_N        = (typeof VALUE_DOWN === 'string') ? parseInt(VALUE_DOWN, 10)
                    : (FLAG_DOWN_BOOL ? 1 : 0);
const IS_DOWN       = DOWN_N > 0 || FLAG_DOWN_BOOL;

// Anything left unrecognised is a warning, not an error.
const UNKNOWN_ARGS  = rawArgs.slice();

// ------------------------------------------------------------------
//  Paths / constants
// ------------------------------------------------------------------

const REPO_ROOT          = path.join(__dirname, '..');
const ENV_MIGRATIONS_DIR = process.env.MIGRATIONS_DIR;
const PRIMARY_DIR        = path.join(REPO_ROOT, 'migrations');
const FALLBACK_DIR       = path.join(REPO_ROOT, 'supabase', 'migrations');

function resolveMigrationsDir() {
  if (ENV_MIGRATIONS_DIR) {
    const p = path.isAbsolute(ENV_MIGRATIONS_DIR)
      ? ENV_MIGRATIONS_DIR
      : path.join(REPO_ROOT, ENV_MIGRATIONS_DIR);
    return { dir: p, source: 'env' };
  }
  if (fs.existsSync(PRIMARY_DIR) && fs.readdirSync(PRIMARY_DIR).some(f => f.endsWith('.sql'))) {
    return { dir: PRIMARY_DIR, source: 'primary' };
  }
  if (fs.existsSync(FALLBACK_DIR)) {
    return { dir: FALLBACK_DIR, source: 'fallback' };
  }
  return { dir: PRIMARY_DIR, source: 'primary-empty' };
}

const ADVISORY_LOCK_KEY = BigInt(process.env.ONYX_MIGRATE_ADVISORY_LOCK || '7326491');

const LOG_DIR  = path.join(REPO_ROOT, 'logs', 'migrations');
const RUN_ID   = new Date().toISOString().replace(/[:.]/g, '-');
const LOG_FILE = path.join(LOG_DIR, `${RUN_ID}.log`);

// ------------------------------------------------------------------
//  Output helpers - human stdout + JSONL log file + optional --json
// ------------------------------------------------------------------

const events = [];
let logStream = null;

function ensureLogStream() {
  if (logStream) return logStream;
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    logStream = fs.createWriteStream(LOG_FILE, { flags: 'a' });
  } catch (err) {
    process.stderr.write(`WARN: could not open log file ${LOG_FILE}: ${err.message}\n`);
    logStream = { write() {}, end() {} };
  }
  return logStream;
}

function emit(type, payload = {}) {
  const evt = { ts: new Date().toISOString(), type, ...payload };
  events.push(evt);
  try { ensureLogStream().write(JSON.stringify(evt) + '\n'); } catch (_) {}

  if (FLAG_JSON) return; // buffered - flushed at exit

  switch (type) {
    case 'banner':
      console.log('');
      console.log('==================================================');
      console.log('   ONYX PROCUREMENT  -  Migration Runner v3');
      console.log('==================================================');
      console.log(`   run-id : ${RUN_ID}`);
      console.log(`   log    : ${path.relative(REPO_ROOT, LOG_FILE)}`);
      console.log('');
      break;
    case 'info':   console.log(payload.msg); break;
    case 'warn':   console.warn('WARN:  ' + payload.msg); break;
    case 'error':  console.error('ERROR: ' + payload.msg); break;
    case 'plan':
      console.log(`Plan (${payload.action}):`);
      if (payload.items.length === 0) console.log('  (none)');
      for (const m of payload.items) {
        const extra = m.note ? `  ${m.note}` : '';
        console.log(`  - ${m.version}  ${m.name}${extra}`);
      }
      console.log('');
      break;
    case 'apply-start':
      console.log(`>> ${payload.direction} ${payload.version}: ${payload.name}  [sha256:${payload.checksum}]`);
      break;
    case 'apply-ok':
      console.log(`   OK in ${payload.elapsed_ms}ms  (${payload.statements} statement(s))`);
      break;
    case 'apply-skip':
      console.log(`   SKIP: ${payload.reason}`);
      break;
    case 'apply-fail':
      console.error(`   FAIL: ${payload.error}`);
      if (payload.failing_statement) {
        const lines = payload.failing_statement.slice(0, 500).replace(/\n/g, '\n     | ');
        console.error(`   failing statement:\n     | ${lines}`);
      }
      break;
    case 'status-row': {
      const mark = payload.applied ? '[x]' : '[ ]';
      const when = payload.applied_at ? new Date(payload.applied_at).toISOString().slice(0, 16).replace('T', ' ') : '';
      const drift = payload.checksum_mismatch ? '  !! DRIFT' : '';
      const exec  = payload.execution_ms != null ? `${payload.execution_ms}ms` : '';
      console.log(`  ${mark} ${payload.version}  ${payload.name.padEnd(40)}  ${when.padEnd(17)} ${exec.padStart(8)}${drift}`);
      break;
    }
    case 'lock-acquired':
      console.log(`[lock] advisory lock ${payload.key} acquired`);
      break;
    case 'lock-released':
      console.log(`[lock] advisory lock ${payload.key} released`);
      break;
    case 'done':
      console.log('');
      console.log(payload.msg);
      console.log('');
      break;
    default: /* ignore */ break;
  }
}

function flushAndExit(code) {
  if (FLAG_JSON) {
    process.stdout.write(JSON.stringify({
      runner: 'onyx-migrate-v3',
      run_id: RUN_ID,
      exit_code: code,
      events,
    }, null, 2) + '\n');
  }
  try { if (logStream && logStream.end) logStream.end(); } catch (_) {}
  process.exit(code);
}

// ------------------------------------------------------------------
//  Help
// ------------------------------------------------------------------

function printHelp() {
  const txt = `
ONYX PROCUREMENT - Migration Runner v3

Usage:
  node scripts/migrate.js [flags]

Flags:
  --up               Apply pending migrations (default)
  --down N           Roll back the N most recent migrations
  --status           Show migration state
  --dry-run          Plan only - do not execute
  --force            Ignore checksum drift (loud warning is printed)
  --json             Structured JSON output (for CI)
  --help, -h         Show this help

Env vars:
  SUPABASE_DB_URL             postgres://...  (preferred, gives true TX)
  SUPABASE_URL                https://...     (fallback via RPC)
  SUPABASE_SERVICE_ROLE_KEY   service key     (fallback via RPC)
  MIGRATIONS_DIR              override migrations directory
  ONYX_MIGRATE_ADVISORY_LOCK  advisory lock key (default 7326491)

Migration file format (single file, UP + DOWN sections):

    -- UP
    CREATE TABLE foo (id SERIAL PRIMARY KEY);

    -- DOWN
    DROP TABLE foo;
`;
  process.stdout.write(txt + '\n');
}

// ------------------------------------------------------------------
//  Migration file discovery + parsing
// ------------------------------------------------------------------

function parseFileName(file) {
  // Matches: 001_name.sql | 001-name.sql | 20240101_name.sql | 003-name.down.sql (excluded)
  const m = file.match(/^(\d{3,})[-_](.+)\.sql$/);
  if (!m) return null;
  if (m[2].endsWith('.down') || m[2].endsWith('-down') || m[2].endsWith('_down')) return null;
  return { version: m[1], name: m[2], file };
}

function findLegacyDownFile(dir, version, name) {
  const candidates = [
    `${version}-${name}.down.sql`,
    `${version}_${name}.down.sql`,
    `${version}-${name}-down.sql`,
    `${version}_${name}_down.sql`,
    `${version}-rollback.sql`,
    `${version}_rollback.sql`,
  ];
  for (const c of candidates) {
    const p = path.join(dir, c);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

/**
 * Split a single migration file into UP/DOWN sections.
 * Supports markers:  `-- UP` / `-- DOWN`  (case-insensitive, trailing `:` optional)
 * If no markers are found, the whole file is treated as UP (legacy behavior).
 */
function splitUpDown(sql) {
  // Remove a leading shebang if any (rare but possible)
  const lines = sql.split(/\r?\n/);
  const upIdx = lines.findIndex(l => /^\s*--\s*UP\b[:\s]?/i.test(l));
  const dnIdx = lines.findIndex(l => /^\s*--\s*DOWN\b[:\s]?/i.test(l));

  if (upIdx === -1 && dnIdx === -1) {
    return { up: sql, down: null, hasMarkers: false };
  }
  if (upIdx === -1 && dnIdx !== -1) {
    // File has only DOWN - unusual, treat UP as empty
    return { up: '', down: lines.slice(dnIdx + 1).join('\n'), hasMarkers: true };
  }
  if (upIdx !== -1 && dnIdx === -1) {
    return { up: lines.slice(upIdx + 1).join('\n'), down: null, hasMarkers: true };
  }
  if (upIdx < dnIdx) {
    return {
      up:   lines.slice(upIdx + 1, dnIdx).join('\n'),
      down: lines.slice(dnIdx + 1).join('\n'),
      hasMarkers: true,
    };
  }
  // DOWN before UP
  return {
    up:   lines.slice(upIdx + 1).join('\n'),
    down: lines.slice(dnIdx + 1, upIdx).join('\n'),
    hasMarkers: true,
  };
}

function sha256(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Naive but dollar-quote-aware SQL statement splitter.
 * Good enough for DDL + simple DML. We submit the whole script in one
 * transaction, so splitting is only used for reporting and error location.
 */
function splitStatements(sql) {
  const out = [];
  let buf = '';
  let inDollar = false;
  let dollarTag = '';
  let inLineComment = false;
  let inBlockComment = false;
  let inSingleQuote = false;
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    const next = sql[i + 1];
    if (inLineComment) {
      buf += ch;
      if (ch === '\n') inLineComment = false;
      continue;
    }
    if (inBlockComment) {
      buf += ch;
      if (ch === '*' && next === '/') { buf += '/'; i++; inBlockComment = false; }
      continue;
    }
    if (inSingleQuote) {
      buf += ch;
      if (ch === '\'' && next !== '\'') inSingleQuote = false;
      else if (ch === '\'' && next === '\'') { buf += '\''; i++; }
      continue;
    }
    if (inDollar) {
      if (ch === '$' && sql.slice(i, i + dollarTag.length) === dollarTag) {
        buf += dollarTag; i += dollarTag.length - 1; inDollar = false; dollarTag = '';
        continue;
      }
      buf += ch;
      continue;
    }
    if (ch === '-' && next === '-') { inLineComment = true; buf += ch; continue; }
    if (ch === '/' && next === '*') { inBlockComment = true; buf += ch; continue; }
    if (ch === '\'') { inSingleQuote = true; buf += ch; continue; }
    if (ch === '$') {
      const m = sql.slice(i).match(/^\$([A-Za-z0-9_]*)\$/);
      if (m) { inDollar = true; dollarTag = m[0]; buf += dollarTag; i += dollarTag.length - 1; continue; }
    }
    if (ch === ';') { buf += ';'; const t = buf.trim(); if (t && t !== ';') out.push(t); buf = ''; continue; }
    buf += ch;
  }
  const tail = buf.trim();
  if (tail) out.push(tail);
  return out;
}

function locateFailingStatement(err, sql) {
  if (err && err.position) {
    const pos = parseInt(err.position, 10);
    if (!Number.isNaN(pos)) {
      const stmts = splitStatements(sql);
      let acc = 0;
      for (const s of stmts) {
        const idx = sql.indexOf(s, acc);
        if (idx === -1) continue;
        if (pos >= idx && pos <= idx + s.length) return s;
        acc = idx + s.length;
      }
    }
  }
  const stmts = splitStatements(sql);
  return stmts[0] || null;
}

// ------------------------------------------------------------------
//  Backend abstraction - PgBackend (real) or SupabaseBackend (RPC)
// ------------------------------------------------------------------

const CREATE_SCHEMA_MIGRATIONS_SQL = `
CREATE TABLE IF NOT EXISTS public.schema_migrations (
  version       VARCHAR(64)  PRIMARY KEY,
  name          VARCHAR(255),
  applied_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  checksum      TEXT,
  execution_ms  INTEGER,
  rolled_back   BOOLEAN      NOT NULL DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS idx_schema_migrations_applied_at
  ON public.schema_migrations (applied_at DESC);
`;

class PgBackend {
  constructor(connectionString) {
    const { Client } = require('pg');
    this.client = new Client({ connectionString });
    this.name = 'pg';
    this.supportsRealTx = true;
    this.supportsRealLock = true;
  }
  async connect() { await this.client.connect(); }
  async close()   { await this.client.end().catch(() => {}); }

  async ensureMigrationsTable() {
    await this.client.query(CREATE_SCHEMA_MIGRATIONS_SQL);
  }

  async acquireLock(key) {
    // Try non-blocking first so we can report cleanly if someone else holds it.
    const res = await this.client.query('SELECT pg_try_advisory_lock($1::bigint) AS ok', [String(key)]);
    if (!res.rows[0].ok) throw new Error(`advisory lock ${key} is held by another session`);
  }
  async releaseLock(key) {
    await this.client.query('SELECT pg_advisory_unlock($1::bigint)', [String(key)]).catch(() => {});
  }

  async getApplied() {
    try {
      const res = await this.client.query(
        `SELECT version, name, applied_at, checksum, execution_ms, rolled_back
           FROM public.schema_migrations
          WHERE rolled_back = FALSE
          ORDER BY version`
      );
      return res.rows;
    } catch (err) {
      if (err.code === '42P01') return [];
      throw err;
    }
  }

  async runInTransaction(sql, recordFn) {
    await this.client.query('BEGIN');
    try {
      await this.client.query(sql);
      if (recordFn) await recordFn(this.client);
      await this.client.query('COMMIT');
    } catch (err) {
      await this.client.query('ROLLBACK').catch(() => {});
      throw err;
    }
  }

  recordUpFragment() {
    return async (client, { version, name, checksum, execution_ms }) => {
      await client.query(
        `INSERT INTO public.schema_migrations (version, name, checksum, execution_ms)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (version) DO UPDATE
           SET name         = EXCLUDED.name,
               checksum     = EXCLUDED.checksum,
               execution_ms = EXCLUDED.execution_ms,
               applied_at   = NOW(),
               rolled_back  = FALSE`,
        [version, name, checksum, execution_ms]
      );
    };
  }

  recordDownFragment() {
    return async (client, { version }) => {
      // Soft-delete: mark as rolled back so we still see the history.
      await client.query(
        `UPDATE public.schema_migrations
            SET rolled_back = TRUE,
                applied_at  = NOW()
          WHERE version = $1`,
        [version]
      );
    };
  }
}

class SupabaseBackend {
  constructor(url, key) {
    const { createClient } = require('@supabase/supabase-js');
    this.supabase = createClient(url, key, { auth: { persistSession: false } });
    this.name = 'supabase-rpc';
    this.supportsRealTx = false;   // pg_execute runs each call autocommit
    this.supportsRealLock = false; // cross-connection lock not possible here
  }
  async connect() { /* no-op */ }
  async close()   { /* no-op */ }

  async executeRaw(sql) {
    const { error } = await this.supabase.rpc('pg_execute', { sql });
    if (error) {
      const e = new Error(error.message || JSON.stringify(error));
      e.code = error.code; e.hint = error.hint; e.details = error.details;
      throw e;
    }
  }

  async ensureMigrationsTable() {
    await this.executeRaw(CREATE_SCHEMA_MIGRATIONS_SQL);
  }

  async acquireLock(key) {
    // Best-effort: we store a sentinel row. Not a real advisory lock.
    const esc = (s) => String(s).replace(/'/g, "''");
    const sql = `
      CREATE TABLE IF NOT EXISTS public._onyx_migrate_lock (
        key BIGINT PRIMARY KEY,
        acquired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        holder TEXT
      );
      INSERT INTO public._onyx_migrate_lock (key, holder)
      VALUES (${esc(String(key))}, 'pid:${process.pid}@${esc(RUN_ID)}')
      ON CONFLICT (key) DO NOTHING;
    `;
    await this.executeRaw(sql);
    // Can't verify who owns it reliably without a read, but supabase-js
    // can read the row:
    const { data } = await this.supabase.from('_onyx_migrate_lock').select('key, holder').eq('key', String(key));
    const row = (data || [])[0];
    if (row && row.holder && !row.holder.includes(`pid:${process.pid}`)) {
      // Someone else's sentinel - not strictly proof of a concurrent run,
      // but safer to bail out than corrupt state.
      throw new Error(`migration lock row already held by ${row.holder}`);
    }
  }
  async releaseLock(key) {
    await this.executeRaw(`DELETE FROM public._onyx_migrate_lock WHERE key = ${String(BigInt(key))};`).catch(() => {});
  }

  async getApplied() {
    const { data, error } = await this.supabase
      .from('schema_migrations')
      .select('version, name, applied_at, checksum, execution_ms, rolled_back')
      .order('version', { ascending: true });
    if (error && error.code === '42P01') return [];
    if (error) throw new Error('schema_migrations query failed: ' + error.message);
    return (data || []).filter(r => r.rolled_back !== true);
  }

  async runInTransaction(sql, recordFnPair) {
    // Wrap client-provided SQL in BEGIN/COMMIT. pg_execute runs the whole
    // block in its own session, so BEGIN ... COMMIT works for DDL too.
    // If recordFnPair is provided, we append the bookkeeping SQL inside
    // the same BEGIN/COMMIT so it's atomic with the migration.
    const bookkeeping = (recordFnPair && recordFnPair.sql) || '';
    const full = `BEGIN;\n${sql}\n${bookkeeping}\nCOMMIT;`;
    try {
      await this.executeRaw(full);
    } catch (err) {
      // Try a best-effort rollback (in case supabase didn't roll back)
      await this.executeRaw('ROLLBACK;').catch(() => {});
      throw err;
    }
  }

  recordUpFragment() {
    return ({ version, name, checksum, execution_ms }) => {
      const esc = (s) => String(s).replace(/'/g, "''");
      return {
        sql: `
          INSERT INTO public.schema_migrations (version, name, checksum, execution_ms)
          VALUES ('${esc(version)}', '${esc(name)}', '${esc(checksum)}', ${parseInt(execution_ms, 10) || 0})
          ON CONFLICT (version) DO UPDATE
            SET name         = EXCLUDED.name,
                checksum     = EXCLUDED.checksum,
                execution_ms = EXCLUDED.execution_ms,
                applied_at   = NOW(),
                rolled_back  = FALSE;
        `
      };
    };
  }
  recordDownFragment() {
    return ({ version }) => {
      const esc = (s) => String(s).replace(/'/g, "''");
      return {
        sql: `
          UPDATE public.schema_migrations
             SET rolled_back = TRUE,
                 applied_at  = NOW()
           WHERE version = '${esc(version)}';
        `
      };
    };
  }
}

function pickBackend() {
  if (process.env.SUPABASE_DB_URL) {
    try {
      require.resolve('pg');
      return new PgBackend(process.env.SUPABASE_DB_URL);
    } catch (_) {
      emit('warn', { msg: 'SUPABASE_DB_URL is set but `pg` package is not installed - falling back to supabase-js RPC' });
    }
  }
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    emit('error', { msg: 'Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (or set SUPABASE_DB_URL and install `pg`)' });
    flushAndExit(2);
  }
  return new SupabaseBackend(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
}

// ------------------------------------------------------------------
//  Apply a single UP migration
// ------------------------------------------------------------------

async function applyUp(backend, migration) {
  const { version, name } = migration;
  const cs = sha256(migration.upSql);
  const stmts = splitStatements(migration.upSql);

  emit('apply-start', {
    direction: 'APPLY',
    version, name, checksum: cs,
  });

  if (FLAG_DRY_RUN) {
    emit('info', { msg: `(dry-run) ${migration.upSql.length} bytes, ${stmts.length} statement(s)` });
    return;
  }

  const t0 = Date.now();
  try {
    if (backend instanceof PgBackend) {
      await backend.runInTransaction(migration.upSql, async (client) => {
        const rec = backend.recordUpFragment();
        await rec(client, { version, name, checksum: cs, execution_ms: Date.now() - t0 });
      });
    } else {
      const rec = backend.recordUpFragment();
      const frag = rec({ version, name, checksum: cs, execution_ms: 0 }); // ms recomputed below
      // We need execution_ms inside the fragment; supabase path records 0
      // first and updates after, which is simplest.
      await backend.runInTransaction(migration.upSql, frag);
      const elapsed = Date.now() - t0;
      const esc = (s) => String(s).replace(/'/g, "''");
      await backend.executeRaw(
        `UPDATE public.schema_migrations SET execution_ms = ${elapsed} WHERE version = '${esc(version)}';`
      );
    }
    const elapsed = Date.now() - t0;
    emit('apply-ok', { version, elapsed_ms: elapsed, statements: stmts.length });
  } catch (err) {
    emit('apply-fail', {
      version,
      error: err.message,
      code: err.code,
      hint: err.hint,
      failing_statement: locateFailingStatement(err, migration.upSql),
    });
    throw err;
  }
}

// ------------------------------------------------------------------
//  Apply a single DOWN migration
// ------------------------------------------------------------------

async function applyDown(backend, migration) {
  const { version, name } = migration;

  if (!migration.downSql) {
    // Try legacy sibling file as a last resort
    const legacy = findLegacyDownFile(migration.dir, version, name);
    if (legacy) {
      migration.downSql = fs.readFileSync(legacy, 'utf8');
      emit('info', { msg: `Using legacy sibling rollback file: ${path.basename(legacy)}` });
    }
  }

  if (!migration.downSql) {
    emit('apply-fail', {
      version, name,
      error: `no -- DOWN: section found in ${migration.file} and no legacy rollback sibling exists`,
    });
    throw new Error(`missing DOWN section for ${version}`);
  }

  const cs = sha256(migration.downSql);
  const stmts = splitStatements(migration.downSql);

  emit('apply-start', { direction: 'ROLLBACK', version, name, checksum: cs });

  if (FLAG_DRY_RUN) {
    emit('info', { msg: `(dry-run) ${migration.downSql.length} bytes, ${stmts.length} statement(s)` });
    return;
  }

  const t0 = Date.now();
  try {
    if (backend instanceof PgBackend) {
      await backend.runInTransaction(migration.downSql, async (client) => {
        const rec = backend.recordDownFragment();
        await rec(client, { version });
      });
    } else {
      const rec = backend.recordDownFragment();
      const frag = rec({ version });
      await backend.runInTransaction(migration.downSql, frag);
    }
    emit('apply-ok', { version, elapsed_ms: Date.now() - t0, statements: stmts.length });
  } catch (err) {
    emit('apply-fail', {
      version,
      error: err.message,
      code: err.code,
      failing_statement: locateFailingStatement(err, migration.downSql),
    });
    throw err;
  }
}

// ------------------------------------------------------------------
//  Main
// ------------------------------------------------------------------

async function main() {
  if (FLAG_HELP) { printHelp(); return flushAndExit(0); }

  emit('banner');

  if (UNKNOWN_ARGS.length) {
    emit('warn', { msg: `Unknown arguments ignored: ${UNKNOWN_ARGS.join(' ')}` });
  }
  if (FLAG_UP && IS_DOWN) {
    emit('error', { msg: '--up and --down are mutually exclusive' });
    return flushAndExit(2);
  }

  // ----------------------------------------------------------------
  //  Discover migrations
  // ----------------------------------------------------------------

  const { dir: migrationsDir, source: dirSource } = resolveMigrationsDir();
  if (!fs.existsSync(migrationsDir)) {
    emit('error', { msg: `Migrations directory not found: ${migrationsDir}` });
    return flushAndExit(2);
  }
  emit('info', { msg: `migrations dir: ${path.relative(REPO_ROOT, migrationsDir)} (${dirSource})` });

  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  const migrations = [];
  for (const f of files) {
    const parsed = parseFileName(f);
    if (!parsed) { emit('warn', { msg: `ignoring unparseable file: ${f}` }); continue; }
    const fullSql = fs.readFileSync(path.join(migrationsDir, f), 'utf8');
    const split = splitUpDown(fullSql);
    migrations.push({
      ...parsed,
      dir: migrationsDir,
      rawSql: fullSql,
      upSql: split.up,
      downSql: split.down,
      hasMarkers: split.hasMarkers,
      fullChecksum: sha256(fullSql),
      upChecksum: sha256(split.up || ''),
    });
  }
  emit('info', { msg: `found ${migrations.length} migration file(s)` });

  // ----------------------------------------------------------------
  //  Backend + connect
  // ----------------------------------------------------------------

  const backend = pickBackend();
  emit('info', { msg: `backend: ${backend.name}  real-tx:${backend.supportsRealTx}  real-lock:${backend.supportsRealLock}` });

  try { await backend.connect(); }
  catch (err) { emit('error', { msg: `backend connect failed: ${err.message}` }); return flushAndExit(2); }

  // ----------------------------------------------------------------
  //  Advisory lock
  // ----------------------------------------------------------------
  let lockAcquired = false;
  try {
    if (!FLAG_DRY_RUN && !FLAG_STATUS) {
      // Ensure the tracking table exists BEFORE we take the lock in the
      // supabase path (supabase acquireLock uses a helper table).
      try { await backend.ensureMigrationsTable(); }
      catch (err) { emit('warn', { msg: `ensureMigrationsTable: ${err.message}` }); }

      await backend.acquireLock(ADVISORY_LOCK_KEY);
      lockAcquired = true;
      emit('lock-acquired', { key: String(ADVISORY_LOCK_KEY) });
    }
  } catch (err) {
    emit('error', { msg: `could not acquire advisory lock: ${err.message}` });
    await backend.close();
    return flushAndExit(2);
  }

  // ----------------------------------------------------------------
  //  Load applied set
  // ----------------------------------------------------------------
  let applied = [];
  try {
    applied = await backend.getApplied();
  } catch (err) {
    emit('warn', { msg: `could not read schema_migrations: ${err.message} - assuming empty` });
  }
  const appliedMap = new Map(applied.map(m => [m.version, m]));

  // ----------------------------------------------------------------
  //  --status
  // ----------------------------------------------------------------
  if (FLAG_STATUS) {
    let drift = false;
    let pending = 0;
    const diskVersions = new Set(migrations.map(m => m.version));
    for (const m of migrations) {
      const row = appliedMap.get(m.version);
      let mismatch = false;
      if (row && row.checksum) {
        mismatch = (m.upChecksum !== row.checksum && m.fullChecksum !== row.checksum);
      }
      if (mismatch) drift = true;
      if (!row) pending++;
      emit('status-row', {
        version: m.version,
        name: m.name,
        applied: !!row,
        applied_at: row ? row.applied_at : null,
        execution_ms: row ? row.execution_ms : null,
        checksum_mismatch: mismatch,
      });
    }
    // Report DB rows whose files are missing
    for (const row of applied) {
      if (!diskVersions.has(row.version)) {
        emit('warn', { msg: `missing on disk: version ${row.version} (${row.name}) is recorded in DB but no file exists` });
        drift = true;
      }
    }
    emit('info', { msg: `summary: ${applied.length} applied, ${pending} pending${drift ? ', DRIFT DETECTED' : ''}` });

    if (lockAcquired) { await backend.releaseLock(ADVISORY_LOCK_KEY); emit('lock-released', { key: String(ADVISORY_LOCK_KEY) }); }
    await backend.close();
    return flushAndExit(drift && !FLAG_FORCE ? 1 : 0);
  }

  // ----------------------------------------------------------------
  //  --down N
  // ----------------------------------------------------------------
  if (IS_DOWN) {
    const appliedVersions = [...appliedMap.keys()].sort();
    const n = Math.max(1, DOWN_N || 1);
    const toRollback = appliedVersions.slice(-n).reverse();

    if (toRollback.length === 0) {
      emit('info', { msg: 'nothing to roll back' });
      if (lockAcquired) { await backend.releaseLock(ADVISORY_LOCK_KEY); emit('lock-released', { key: String(ADVISORY_LOCK_KEY) }); }
      await backend.close();
      return flushAndExit(0);
    }

    const planItems = toRollback.map(v => {
      const m = migrations.find(x => x.version === v);
      const note = m ? (m.downSql ? '(DOWN section found)' : '(NO DOWN SECTION - will try legacy file)') : '(NO FILE)';
      return { version: v, name: m ? m.name : '(unknown)', note };
    });
    emit('plan', { action: 'rollback', items: planItems });

    for (const v of toRollback) {
      const m = migrations.find(x => x.version === v);
      if (!m) {
        emit('error', { msg: `cannot roll back ${v}: no file on disk` });
        if (lockAcquired) { await backend.releaseLock(ADVISORY_LOCK_KEY); emit('lock-released', { key: String(ADVISORY_LOCK_KEY) }); }
        await backend.close();
        return flushAndExit(1);
      }
      try {
        await applyDown(backend, m);
      } catch (err) {
        emit('error', { msg: `rollback aborted at ${v}: ${err.message}` });
        if (lockAcquired) { await backend.releaseLock(ADVISORY_LOCK_KEY); emit('lock-released', { key: String(ADVISORY_LOCK_KEY) }); }
        await backend.close();
        return flushAndExit(1);
      }
    }
    emit('done', { msg: `rolled back ${toRollback.length} migration(s)` });
    if (lockAcquired) { await backend.releaseLock(ADVISORY_LOCK_KEY); emit('lock-released', { key: String(ADVISORY_LOCK_KEY) }); }
    await backend.close();
    return flushAndExit(0);
  }

  // ----------------------------------------------------------------
  //  --up (default): drift check + apply pending
  // ----------------------------------------------------------------

  // 1. Drift check on already-applied migrations
  const drifted = [];
  for (const m of migrations) {
    const row = appliedMap.get(m.version);
    if (!row || !row.checksum) continue;
    if (m.upChecksum !== row.checksum && m.fullChecksum !== row.checksum) {
      drifted.push({ version: m.version, name: m.name, db: row.checksum, disk: m.upChecksum });
    }
  }
  if (drifted.length > 0) {
    for (const d of drifted) {
      emit('warn', { msg: `CHECKSUM DRIFT: ${d.version} ${d.name}  (db=${d.db.slice(0, 16)} disk=${d.disk.slice(0, 16)})` });
    }
    if (!FLAG_FORCE) {
      emit('error', { msg: `checksum drift detected on ${drifted.length} migration(s). Re-run with --force to ignore.` });
      if (lockAcquired) { await backend.releaseLock(ADVISORY_LOCK_KEY); emit('lock-released', { key: String(ADVISORY_LOCK_KEY) }); }
      await backend.close();
      return flushAndExit(1);
    }
    emit('warn', { msg: '--force active: proceeding despite drift' });
  }

  // 2. Build pending list
  const pending = migrations.filter(m => !appliedMap.has(m.version));
  if (pending.length === 0) {
    emit('info', { msg: 'no pending migrations - database is up to date' });
    if (lockAcquired) { await backend.releaseLock(ADVISORY_LOCK_KEY); emit('lock-released', { key: String(ADVISORY_LOCK_KEY) }); }
    await backend.close();
    return flushAndExit(0);
  }
  emit('plan', {
    action: 'apply',
    items: pending.map(m => ({ version: m.version, name: m.name, note: m.hasMarkers ? '' : '(no -- UP/DOWN markers)' })),
  });

  // 3. Apply each
  let okCount = 0;
  for (const m of pending) {
    try {
      await applyUp(backend, m);
      okCount++;
    } catch (err) {
      emit('error', { msg: `migration run aborted at ${m.version}: ${err.message}` });
      if (lockAcquired) { await backend.releaseLock(ADVISORY_LOCK_KEY); emit('lock-released', { key: String(ADVISORY_LOCK_KEY) }); }
      await backend.close();
      return flushAndExit(1);
    }
  }

  emit('done', { msg: `applied ${okCount} migration(s) successfully` });
  if (lockAcquired) { await backend.releaseLock(ADVISORY_LOCK_KEY); emit('lock-released', { key: String(ADVISORY_LOCK_KEY) }); }
  await backend.close();
  return flushAndExit(0);
}

main().catch(err => {
  emit('error', { msg: `runner crashed: ${err && err.stack || err}` });
  flushAndExit(3);
});
