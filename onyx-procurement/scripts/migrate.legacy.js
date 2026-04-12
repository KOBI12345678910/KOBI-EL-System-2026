#!/usr/bin/env node
/**
 * ONYX PROCUREMENT - Migration runner (LEGACY v1)
 * ================================================
 *
 * PRESERVED for historical reference. This is the original Wave 1.5 / B-14
 * migration runner. It has been superseded by `scripts/migrate.js` (v3),
 * which adds:
 *   - `--up` / `--down N` / `--status` / `--dry-run` / `--force` flags
 *   - Postgres advisory lock (prevents parallel runs)
 *   - Per-migration transaction with automatic rollback on failure
 *   - SHA256 checksum with drift detection
 *   - `-- UP` / `-- DOWN` section format (single-file rollback)
 *   - Execution log to `logs/migrations/<timestamp>.log`
 *   - `migrations/*.sql` directory (top-level) with fallback to
 *     `supabase/migrations/*.sql`
 *
 * This file is kept so that older runbooks / CI scripts that still
 * reference `migrate.legacy.js` continue to work without surprises.
 *
 * DO NOT DELETE.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const MIGRATIONS_DIR = path.join(__dirname, '..', 'supabase', 'migrations');

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const STATUS_ONLY = args.includes('--status');

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  console.error('   Service role required to execute DDL (CREATE TABLE, ALTER TABLE).');
  process.exit(1);
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

function parseMigrationFile(file) {
  const match = file.match(/^(\d{3,})[-_](.+)\.sql$/);
  if (!match) return null;
  return { version: match[1], name: match[2], file };
}

function checksum(content) {
  return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
}

async function getAppliedMigrations() {
  const { data, error } = await supabase.from('schema_migrations').select('version, name, applied_at, checksum');
  if (error && error.code === '42P01') return [];
  if (error) throw new Error(`schema_migrations query failed: ${error.message}`);
  return data || [];
}

async function executeSql(sql) {
  const { error } = await supabase.rpc('pg_execute', { sql });
  if (error) throw new Error(error.message);
}

async function main() {
  console.log('');
  console.log('ONYX PROCUREMENT - Migration Runner (LEGACY v1)');
  console.log('');

  if (!fs.existsSync(MIGRATIONS_DIR)) {
    console.error(`Migrations directory not found: ${MIGRATIONS_DIR}`);
    process.exit(1);
  }

  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort();

  const migrations = files.map(parseMigrationFile).filter(Boolean);
  console.log(`Found ${migrations.length} migration files`);

  let applied = [];
  try {
    applied = await getAppliedMigrations();
  } catch (err) {
    console.error(`Could not query schema_migrations: ${err.message}`);
    console.error('   Will attempt to bootstrap tracking table from first migration.');
  }
  const appliedSet = new Set(applied.map(m => m.version));

  if (STATUS_ONLY) {
    console.log('');
    console.log('Status:');
    for (const m of migrations) {
      const mark = appliedSet.has(m.version) ? '[x]' : '[ ]';
      const row = applied.find(a => a.version === m.version);
      const when = row && row.applied_at ? new Date(row.applied_at).toISOString().slice(0, 10) : '';
      console.log(`  ${mark} ${m.version}  ${m.name.padEnd(45)}  ${when}`);
    }
    console.log('');
    process.exit(0);
  }

  const pending = migrations.filter(m => !appliedSet.has(m.version));
  if (pending.length === 0) {
    console.log('No pending migrations - database is up to date');
    process.exit(0);
  }

  console.log(`${pending.length} pending migration(s):`);
  pending.forEach(m => console.log(`   - ${m.version}: ${m.name}`));
  console.log('');

  for (const m of pending) {
    const filePath = path.join(MIGRATIONS_DIR, m.file);
    const sql = fs.readFileSync(filePath, 'utf8');
    const cs = checksum(sql);

    console.log(`>> Applying ${m.version}: ${m.name}  [checksum: ${cs}]`);

    if (DRY_RUN) {
      console.log(`   (dry-run - not executing)`);
      console.log(`   SQL length: ${sql.length} bytes`);
      continue;
    }

    const start = Date.now();
    try {
      await executeSql(sql);
      const elapsed = Date.now() - start;
      console.log(`   OK in ${elapsed}ms`);
    } catch (err) {
      console.error(`   FAILED: ${err.message}`);
      console.error(`   Review ${m.file} and retry. Aborting migration run.`);
      process.exit(1);
    }
  }

  console.log('');
  console.log('All migrations applied successfully');
  console.log('');
}

main().catch(err => {
  console.error('Migration runner crashed:', err);
  process.exit(1);
});
