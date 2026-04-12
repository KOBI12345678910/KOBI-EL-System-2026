#!/usr/bin/env node
/**
 * ONYX PROCUREMENT — Migration verifier (read-only)
 * Wave 1.5 — B-14 companion
 *
 * Purpose: CI-friendly health check. Compares the on-disk
 * migration files against the schema_migrations table and
 * reports:
 *   - applied           (version present on disk AND in DB, checksum matches)
 *   - pending           (on disk but not in DB)
 *   - missing_on_disk   (in DB but no file — likely deleted file)
 *   - checksum_mismatch (in both, but SHA256 differs — drift)
 *   - unparseable       (files that don't match the naming convention)
 *
 * Exit codes:
 *   0 = healthy (no mismatches, no orphans). Pending allowed.
 *   1 = drift detected (checksum mismatch OR missing_on_disk)
 *   2 = config/connection error
 *
 * Flags:
 *   --json            structured JSON output (CI / dashboards)
 *   --strict-pending  also exit 1 if any migrations are pending
 *
 * Backend selection mirrors scripts/migrate.js:
 *   1. SUPABASE_DB_URL + `pg` library (preferred)
 *   2. Fallback to @supabase/supabase-js read query
 *
 * This script NEVER writes — safe to run against production.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
require('dotenv').config();

const args = process.argv.slice(2);
const JSON_OUT       = args.includes('--json');
const STRICT_PENDING = args.includes('--strict-pending');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'supabase', 'migrations');

function checksum(content) {
  return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
}

function parseMigrationFile(file) {
  const match = file.match(/^(\d{3,})[-_](.+)\.sql$/);
  if (!match) return null;
  if (match[2].endsWith('.down')) return null;
  return { version: match[1], name: match[2], file };
}

function log(msg) { if (!JSON_OUT) console.log(msg); }
function warn(msg) { if (!JSON_OUT) console.warn('WARN: ' + msg); }
function err(msg) { if (!JSON_OUT) console.error('ERROR: ' + msg); }

async function readAppliedViaPg(connectionString) {
  const { Client } = require('pg');
  const client = new Client({ connectionString });
  await client.connect();
  try {
    const res = await client.query(
      'SELECT version, name, applied_at, checksum, execution_ms, rolled_back FROM public.schema_migrations ORDER BY version'
    );
    return res.rows;
  } catch (e) {
    if (e.code === '42P01') return null; // table doesn't exist
    throw e;
  } finally {
    await client.end().catch(() => {});
  }
}

async function readAppliedViaSupabase(url, key) {
  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await supabase
    .from('schema_migrations')
    .select('version, name, applied_at, checksum, execution_ms, rolled_back');
  if (error) {
    if (error.code === '42P01') return null;
    throw new Error(error.message || JSON.stringify(error));
  }
  return data || [];
}

async function loadApplied() {
  if (process.env.SUPABASE_DB_URL) {
    try {
      require.resolve('pg');
      return { rows: await readAppliedViaPg(process.env.SUPABASE_DB_URL), backend: 'pg' };
    } catch (_) {
      warn('SUPABASE_DB_URL set but `pg` not installed — falling back to supabase-js');
    }
  }
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    err('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (or set SUPABASE_DB_URL and install `pg`)');
    if (JSON_OUT) {
      process.stdout.write(JSON.stringify({
        ok: false, exit_code: 2, error: 'missing_credentials',
      }, null, 2) + '\n');
    }
    process.exit(2);
  }
  return {
    rows: await readAppliedViaSupabase(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY),
    backend: 'supabase-rpc',
  };
}

async function main() {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    err('Migrations directory not found: ' + MIGRATIONS_DIR);
    if (JSON_OUT) {
      process.stdout.write(JSON.stringify({
        ok: false, exit_code: 2, error: 'no_migrations_dir',
      }, null, 2) + '\n');
    }
    process.exit(2);
  }

  const files = fs.readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql')).sort();

  const unparseable = [];
  const onDisk = [];
  for (const f of files) {
    const parsed = parseMigrationFile(f);
    if (!parsed) {
      if (!f.endsWith('.down.sql') && !f.endsWith('-down.sql') && !f.endsWith('_down.sql') && !f.endsWith('-rollback.sql')) {
        unparseable.push(f);
      }
      continue;
    }
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8');
    onDisk.push({ ...parsed, checksum: checksum(sql), bytes: sql.length });
  }

  let appliedResult;
  try {
    appliedResult = await loadApplied();
  } catch (e) {
    err('Failed to read schema_migrations: ' + e.message);
    if (JSON_OUT) {
      process.stdout.write(JSON.stringify({
        ok: false, exit_code: 2, error: 'db_read_failed', detail: e.message,
      }, null, 2) + '\n');
    }
    process.exit(2);
  }

  const appliedRows = appliedResult.rows;
  const bootstrapped = appliedRows !== null;
  const appliedMap = new Map((appliedRows || []).map(r => [r.version, r]));
  const diskMap = new Map(onDisk.map(m => [m.version, m]));

  const applied = [];
  const pending = [];
  const missing_on_disk = [];
  const checksum_mismatch = [];

  for (const m of onDisk) {
    const row = appliedMap.get(m.version);
    if (!row) {
      pending.push({ version: m.version, name: m.name, file: m.file, checksum: m.checksum });
      continue;
    }
    if (row.rolled_back) {
      pending.push({ version: m.version, name: m.name, file: m.file, checksum: m.checksum, previously_rolled_back: true });
      continue;
    }
    if (row.checksum && row.checksum !== m.checksum) {
      checksum_mismatch.push({
        version: m.version,
        name: m.name,
        file: m.file,
        disk_checksum: m.checksum,
        db_checksum: row.checksum,
        applied_at: row.applied_at,
      });
    } else {
      applied.push({
        version: m.version,
        name: m.name,
        file: m.file,
        checksum: m.checksum,
        applied_at: row.applied_at,
        execution_ms: row.execution_ms,
      });
    }
  }

  for (const row of appliedRows || []) {
    if (!diskMap.has(row.version)) {
      missing_on_disk.push({
        version: row.version,
        name: row.name,
        applied_at: row.applied_at,
        checksum: row.checksum,
      });
    }
  }

  const drifted = checksum_mismatch.length > 0 || missing_on_disk.length > 0;
  const strictFail = STRICT_PENDING && pending.length > 0;
  const exit_code = drifted ? 1 : (strictFail ? 1 : 0);

  if (JSON_OUT) {
    process.stdout.write(JSON.stringify({
      ok: exit_code === 0,
      exit_code,
      backend: appliedResult.backend,
      bootstrapped,
      counts: {
        on_disk: onDisk.length,
        applied: applied.length,
        pending: pending.length,
        missing_on_disk: missing_on_disk.length,
        checksum_mismatch: checksum_mismatch.length,
        unparseable: unparseable.length,
      },
      applied,
      pending,
      missing_on_disk,
      checksum_mismatch,
      unparseable,
    }, null, 2) + '\n');
    process.exit(exit_code);
  }

  log('');
  log('================================================');
  log('  ONYX PROCUREMENT  -  Migration Verifier');
  log('================================================');
  log('Backend: ' + appliedResult.backend);
  log('Bootstrapped: ' + (bootstrapped ? 'yes (schema_migrations exists)' : 'NO (schema_migrations missing)'));
  log('');
  log('On disk: ' + onDisk.length);
  log('Applied: ' + applied.length);
  log('Pending: ' + pending.length);
  log('Missing on disk: ' + missing_on_disk.length);
  log('Checksum mismatch: ' + checksum_mismatch.length);
  log('Unparseable files: ' + unparseable.length);
  log('');

  if (applied.length) {
    log('-- APPLIED --');
    for (const a of applied) log('  [x] ' + a.version + '  ' + a.name);
    log('');
  }
  if (pending.length) {
    log('-- PENDING --');
    for (const p of pending) log('  [ ] ' + p.version + '  ' + p.name + (p.previously_rolled_back ? '  (previously rolled back)' : ''));
    log('');
  }
  if (checksum_mismatch.length) {
    log('-- CHECKSUM MISMATCH (drift) --');
    for (const c of checksum_mismatch) {
      log('  !! ' + c.version + '  ' + c.name);
      log('     disk: ' + c.disk_checksum + '   db: ' + c.db_checksum);
    }
    log('');
  }
  if (missing_on_disk.length) {
    log('-- MISSING ON DISK (file deleted after apply) --');
    for (const m of missing_on_disk) log('  ?? ' + m.version + '  ' + m.name);
    log('');
  }
  if (unparseable.length) {
    log('-- UNPARSEABLE FILENAMES --');
    for (const u of unparseable) log('  ?? ' + u);
    log('');
  }

  if (exit_code === 0) {
    log('OK - migrations are consistent');
  } else if (drifted) {
    err('Drift detected - see report above');
  } else if (strictFail) {
    err('--strict-pending: pending migrations exist');
  }

  process.exit(exit_code);
}

main().catch(e => {
  err('Verifier crashed: ' + (e && e.stack || e));
  if (JSON_OUT) {
    process.stdout.write(JSON.stringify({
      ok: false, exit_code: 2, error: 'crashed', detail: String(e),
    }, null, 2) + '\n');
  }
  process.exit(2);
});
