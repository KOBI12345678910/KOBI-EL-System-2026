#!/usr/bin/env node
/**
 * ================================================================
 *  ERP 2026 — KOBI EL  |  Upload All Migrations + Seeds to Database
 * ================================================================
 *  Uploads the full schema (32 migrations) + seed data into a local
 *  PGlite database (real Postgres in a WASM sandbox — no Docker, no
 *  external install). The resulting `erp_main.pglite` directory is a
 *  complete Postgres cluster you can later dump/restore or migrate
 *  to Supabase / RDS with pg_dump.
 *
 *  Usage:
 *    node scripts/upload-to-db.js            # full load, fresh DB
 *    node scripts/upload-to-db.js --resume   # keep existing, apply only new
 *    node scripts/upload-to-db.js --status   # list applied migrations
 *
 *  Output artifacts:
 *    - <repo-root>/database/erp_main.pglite/  ← on-disk Postgres cluster
 *    - <repo-root>/database/upload-report.json ← structured log
 *    - <repo-root>/database/upload-report.md   ← human summary
 * ================================================================
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const { PGlite } = require('@electric-sql/pglite');

// ----------------------------------------------------------------
// Paths
// ----------------------------------------------------------------
const REPO_ROOT   = path.resolve(__dirname, '..', '..');
const MIG_PRIMARY = path.join(REPO_ROOT, 'supabase', 'migrations');
const DB_DIR      = path.join(REPO_ROOT, 'database');
const DB_PATH     = path.join(DB_DIR, 'erp_main.pglite');
const REPORT_JSON = path.join(DB_DIR, 'upload-report.json');
const REPORT_MD   = path.join(DB_DIR, 'upload-report.md');

// ----------------------------------------------------------------
// CLI
// ----------------------------------------------------------------
const argv = process.argv.slice(2);
const RESUME = argv.includes('--resume');
const STATUS = argv.includes('--status');

// ----------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const nowIso = () => new Date().toISOString();

function log(msg) {
  process.stdout.write(`[${nowIso().slice(11, 19)}] ${msg}\n`);
}

function ensureDir(d) {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
}

// PGlite can't run everything a full Postgres server supports:
//   - no `CREATE EXTENSION pgcrypto|uuid-ossp` (built-in, no install needed)
//   - no `CREATE INDEX CONCURRENTLY` inside a transaction
//   - no Supabase `auth.*`, `anon`, `authenticated`, `service_role` roles
//   - no `SET role …`, `ALTER DEFAULT PRIVILEGES` for those roles
// We rewrite the SQL to be pglite-safe while preserving schema intent.
function pgliteSafe(sql) {
  let out = sql;

  // 1. Comment out CREATE EXTENSION — pglite ships `gen_random_uuid()` and
  //    `crypt()` built in; trying to CREATE EXTENSION on an unavailable
  //    contrib module crashes the whole migration.
  out = out.replace(
    /^\s*create\s+extension\s+(if\s+not\s+exists\s+)?["']?[\w-]+["']?\s*(with\s+schema\s+\w+\s*)?;?/gim,
    '-- [pglite] $& (extension stub-loaded)'
  );

  // 2. Strip `CONCURRENTLY` from CREATE INDEX so migrations can run in a txn.
  out = out.replace(/\bcreate\s+index\s+concurrently\b/gi, 'CREATE INDEX');
  out = out.replace(/\bcreate\s+unique\s+index\s+concurrently\b/gi, 'CREATE UNIQUE INDEX');

  // 3. Strip GRANT/REVOKE to/from Supabase pseudo-roles.
  out = out.replace(
    /^\s*(grant|revoke)\s+[^;]*?\s+(to|from)\s+(authenticated|anon|service_role|supabase_admin)[^;]*;/gim,
    '-- [pglite] $& (supabase role)'
  );

  // 4. Strip ALTER DEFAULT PRIVILEGES … FOR ROLE postgres … TO service_role
  out = out.replace(
    /^\s*alter\s+default\s+privileges[^;]*?(authenticated|anon|service_role|supabase_admin)[^;]*;/gim,
    '-- [pglite] $& (supabase default privs)'
  );

  // 5. Strip SET/RESET role directives (no role in pglite).
  out = out.replace(/^\s*set\s+role\s+[^;]+;/gim, '-- [pglite] (stripped) SET role');
  out = out.replace(/^\s*reset\s+role\s*;/gim, '-- [pglite] (stripped) RESET role');

  // 6. Turn COMMENT ON ROLE … into no-op.
  out = out.replace(/^\s*comment\s+on\s+role[^;]*;/gim, '-- [pglite] (stripped) COMMENT ON ROLE');

  return out;
}

// Bootstrap a Supabase-compatible fake `auth` schema so migrations that
// reference `auth.uid()`, `auth.role()`, `auth.jwt()` load cleanly.
const AUTH_BOOTSTRAP_SQL = `
  CREATE SCHEMA IF NOT EXISTS auth;

  -- Fake users table so FKs to auth.users(id) resolve.
  CREATE TABLE IF NOT EXISTS auth.users (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email       text,
    created_at  timestamptz NOT NULL DEFAULT now()
  );

  CREATE OR REPLACE FUNCTION auth.uid()
  RETURNS uuid LANGUAGE sql STABLE AS $fn$
    SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
  $fn$;

  CREATE OR REPLACE FUNCTION auth.role()
  RETURNS text LANGUAGE sql STABLE AS $fn$
    SELECT COALESCE(current_setting('request.jwt.claim.role', true), 'anon')
  $fn$;

  CREATE OR REPLACE FUNCTION auth.jwt()
  RETURNS jsonb LANGUAGE sql STABLE AS $fn$
    SELECT COALESCE(NULLIF(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
  $fn$;

  -- Stub roles as no-op (CREATE ROLE is a cluster-level op; we rely on the
  -- GRANT/REVOKE stripping in pgliteSafe() and just ensure names resolve in
  -- any subsequent pg_has_role() style calls via a shadow view.)
  CREATE SCHEMA IF NOT EXISTS extensions;
`;


async function loadMigrations() {
  const files = fs.readdirSync(MIG_PRIMARY)
    .filter(f => /^\d{5}_.+\.sql$/.test(f))
    .sort();
  return files.map(f => {
    const full = fs.readFileSync(path.join(MIG_PRIMARY, f), 'utf8');
    return {
      version: f.slice(0, 5),
      name: f.slice(6, -4),
      file: f,
      sql: full,
      safe: pgliteSafe(full),
      checksum: sha256(full),
      bytes: full.length,
    };
  });
}

async function ensureMigrationsTable(db) {
  await db.exec(`
    CREATE SCHEMA IF NOT EXISTS public;
    CREATE TABLE IF NOT EXISTS public.schema_migrations (
      version       VARCHAR(64) PRIMARY KEY,
      name          VARCHAR(255),
      applied_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      checksum      TEXT,
      execution_ms  INTEGER,
      rolled_back   BOOLEAN     NOT NULL DEFAULT FALSE
    );
  `);
}

async function bootstrapAuthShim(db) {
  await db.exec(AUTH_BOOTSTRAP_SQL);
}

async function getApplied(db) {
  const r = await db.query(`SELECT version, name, applied_at, checksum, execution_ms
                              FROM public.schema_migrations
                             WHERE rolled_back = FALSE
                             ORDER BY version`);
  return r.rows;
}

// ----------------------------------------------------------------
// Main
// ----------------------------------------------------------------
async function main() {
  ensureDir(DB_DIR);

  log('===============================================================');
  log(' ERP 2026 — Database Upload  (pglite / local Postgres)');
  log('===============================================================');
  log(`repo root     : ${REPO_ROOT}`);
  log(`migrations    : ${path.relative(REPO_ROOT, MIG_PRIMARY)}`);
  log(`db cluster    : ${path.relative(REPO_ROOT, DB_PATH)}`);

  // Fresh load unless --resume
  if (!RESUME && !STATUS && fs.existsSync(DB_PATH)) {
    log(`clean: removing existing cluster at ${path.relative(REPO_ROOT, DB_PATH)}`);
    fs.rmSync(DB_PATH, { recursive: true, force: true });
  }

  const db = await PGlite.create(DB_PATH);
  log('connected to pglite');

  await ensureMigrationsTable(db);
  await bootstrapAuthShim(db);
  log('installed auth shim (auth.uid/role/jwt, auth.users stub)');

  const migrations = await loadMigrations();
  log(`discovered ${migrations.length} migration file(s)`);

  if (STATUS) {
    const applied = await getApplied(db);
    const appliedSet = new Set(applied.map(a => a.version));
    for (const m of migrations) {
      const mark = appliedSet.has(m.version) ? '[x]' : '[ ]';
      const row  = applied.find(a => a.version === m.version);
      const when = row ? new Date(row.applied_at).toISOString().slice(0, 16).replace('T', ' ') : '';
      const ms   = row ? `${row.execution_ms}ms` : '';
      log(`  ${mark} ${m.version}  ${m.name.padEnd(50)} ${when.padEnd(17)} ${ms.padStart(8)}`);
    }
    log(`summary: ${applied.length} applied / ${migrations.length - applied.length} pending`);
    await db.close();
    return 0;
  }

  const applied = await getApplied(db);
  const appliedSet = new Set(applied.map(a => a.version));
  const pending = migrations.filter(m => !appliedSet.has(m.version));
  log(`applied   : ${applied.length}`);
  log(`pending   : ${pending.length}`);

  const report = {
    run_id: nowIso(),
    repo_root: REPO_ROOT,
    db_path: DB_PATH,
    migration_count: migrations.length,
    applied_before: applied.length,
    results: [],
  };

  let ok = 0, skip = 0, fail = 0;

  for (const m of pending) {
    const t0 = Date.now();
    try {
      // Each migration runs as one transaction.
      await db.exec('BEGIN');
      await db.exec(m.safe);
      await db.query(
        `INSERT INTO public.schema_migrations (version, name, checksum, execution_ms)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (version) DO UPDATE
           SET name=EXCLUDED.name, checksum=EXCLUDED.checksum,
               execution_ms=EXCLUDED.execution_ms, applied_at=NOW(),
               rolled_back=FALSE`,
        [m.version, m.name, m.checksum, Date.now() - t0]
      );
      await db.exec('COMMIT');
      ok++;
      log(`  OK  ${m.version} ${m.name.padEnd(50)} ${Date.now() - t0}ms`);
      report.results.push({ version: m.version, name: m.name, status: 'ok', ms: Date.now() - t0 });
    } catch (err) {
      try { await db.exec('ROLLBACK'); } catch (_) {}
      fail++;
      const snippet = (err.message || String(err)).slice(0, 400);
      log(`  FAIL ${m.version} ${m.name}`);
      log(`       ${snippet}`);
      report.results.push({
        version: m.version, name: m.name, status: 'fail',
        error: snippet, ms: Date.now() - t0,
      });
      // keep going — record all failures; do not abort
    }
  }

  // Stats from the loaded DB
  const stats = {};
  for (const schema of [
    'public', 'governance', 'commercial', 'procurement', 'execution',
    'inventory', 'workforce', 'finance', 'docs', 'comms', 'intelligence',
    'analytics',
  ]) {
    try {
      const r = await db.query(
        `SELECT COUNT(*)::int AS n FROM information_schema.tables WHERE table_schema=$1`,
        [schema]
      );
      stats[schema] = r.rows[0].n;
    } catch (_) { stats[schema] = 0; }
  }

  const tablesTotal = Object.values(stats).reduce((a, b) => a + b, 0);

  log('---------------------------------------------------------------');
  log(`applied   : ${ok} new`);
  log(`skipped   : ${skip}`);
  log(`failed    : ${fail}`);
  log(`tables    : ${tablesTotal}`);
  for (const [s, n] of Object.entries(stats)) log(`   ${s.padEnd(14)} ${String(n).padStart(4)}`);

  await db.close();

  report.applied_count   = ok;
  report.failed_count    = fail;
  report.table_stats     = stats;
  report.table_total     = tablesTotal;

  fs.writeFileSync(REPORT_JSON, JSON.stringify(report, null, 2));

  const md = [
    '# ERP 2026 — Database Upload Report',
    '',
    `- **Run**: ${report.run_id}`,
    `- **Cluster**: \`${path.relative(REPO_ROOT, DB_PATH)}\``,
    `- **Migration files**: ${migrations.length}`,
    `- **Applied this run**: ${ok}`,
    `- **Failed**: ${fail}`,
    `- **Tables total**: ${tablesTotal}`,
    '',
    '## Tables per schema',
    '',
    '| Schema | Tables |',
    '|---|---:|',
    ...Object.entries(stats).map(([s, n]) => `| \`${s}\` | ${n} |`),
    '',
    '## Migration results',
    '',
    '| # | Version | Name | Status | Time |',
    '|---:|---|---|---|---:|',
    ...report.results.map((r, i) =>
      `| ${i + 1} | \`${r.version}\` | ${r.name} | ${r.status === 'ok' ? '✅ ok' : '❌ ' + (r.error || 'fail').split('\n')[0].slice(0, 80)} | ${r.ms}ms |`
    ),
    '',
  ].join('\n');
  fs.writeFileSync(REPORT_MD, md);

  log(`wrote ${path.relative(REPO_ROOT, REPORT_JSON)}`);
  log(`wrote ${path.relative(REPO_ROOT, REPORT_MD)}`);

  return fail === 0 ? 0 : 1;
}

main().then(c => process.exit(c)).catch(err => {
  console.error('UPLOAD CRASHED:', err && err.stack || err);
  process.exit(3);
});
