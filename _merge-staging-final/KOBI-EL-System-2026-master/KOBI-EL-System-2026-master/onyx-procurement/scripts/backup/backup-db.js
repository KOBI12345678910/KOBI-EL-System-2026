#!/usr/bin/env node
/**
 * ONYX PROCUREMENT — Targeted DB Backup (JSONL)
 * Agent 59 / backup-and-restore drill
 *
 * SAFETY CONTRACT
 * ---------------
 *   - This script is READ-ONLY against production.
 *   - It never executes TRUNCATE, DROP, UPDATE, DELETE.
 *   - All writes go to local filesystem under backups/YYYY-MM-DD/.
 *   - Requires --i-know-what-im-doing to run (guardrail for CI muscle memory).
 *   - Every run is logged to logs/backup-audit.jsonl.
 *
 * WHAT IT DOES
 * ------------
 *   Exports the ONYX critical-path tables to JSONL:
 *     employers, employees, timesheets, wage_slips
 *     suppliers, invoices, purchase_orders, payments
 *     vat_transactions, vat_exports
 *     annual_tax_reports
 *     bank_transactions, bank_matches
 *     audit_log
 *   Each JSONL file is accompanied by:
 *     - <table>.jsonl.sha256     (SHA-256 of the JSONL)
 *     - <table>.meta.json        (row count, byte size, duration, checksum)
 *   At the end, a manifest.json is written with the whole run.
 *
 * USAGE
 *   node scripts/backup/backup-db.js --i-know-what-im-doing
 *   node scripts/backup/backup-db.js --i-know-what-im-doing --only=employers,employees
 *   node scripts/backup/backup-db.js --i-know-what-im-doing --output=D:/onyx-backups
 *   node scripts/backup/backup-db.js --i-know-what-im-doing --page-size=2000
 *   node scripts/backup/backup-db.js --dry-run
 *
 * ENV
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * EXIT CODES
 *   0 success
 *   2 usage / missing env
 *   3 table enumeration / IO error
 *   5 export failure
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');

try { require('dotenv').config(); } catch (_) { /* optional */ }

let createClient;
try { ({ createClient } = require('@supabase/supabase-js')); } catch (_) { /* optional for dry-run */ }

// ---------------------------------------------------------------------------
// Canonical list of critical tables for ONYX procurement + payroll.
// Keep this list stable. New tables must be added here deliberately so the
// scope of "backed up" is always reviewed by a human.
// ---------------------------------------------------------------------------
const CRITICAL_TABLES = Object.freeze([
  // Payroll core
  'employers',
  'employees',
  'timesheets',
  'wage_slips',
  // Procurement core
  'suppliers',
  'invoices',
  'purchase_orders',
  'payments',
  // VAT
  'vat_transactions',
  'vat_exports',
  // Income tax
  'annual_tax_reports',
  // Bank reconciliation
  'bank_transactions',
  'bank_matches',
  // Audit
  'audit_log',
]);

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const out = {
    only: null,
    output: null,
    pageSize: 1000,
    iKnowWhatImDoing: false,
    dryRun: false,
    help: false,
  };
  for (const raw of argv.slice(2)) {
    if (raw === '--help' || raw === '-h') { out.help = true; continue; }
    if (raw === '--i-know-what-im-doing') { out.iKnowWhatImDoing = true; continue; }
    if (raw === '--dry-run') { out.dryRun = true; continue; }
    const m = raw.match(/^--([^=]+)=(.*)$/);
    if (!m) continue;
    const [, k, v] = m;
    if (k === 'only') out.only = v.split(',').map(s => s.trim()).filter(Boolean);
    else if (k === 'output') out.output = v;
    else if (k === 'page-size') out.pageSize = Math.max(100, parseInt(v, 10) || 1000);
  }
  return out;
}

function printHelp() {
  process.stdout.write([
    '',
    'ONYX backup-db.js — export critical tables to JSONL',
    '',
    '  --i-know-what-im-doing     required guardrail flag to actually run',
    '  --dry-run                  list tables + planned file paths, no network',
    '  --only=a,b,c               back up only these tables (must be in whitelist)',
    '  --output=PATH              root dir (default: <project>/backups)',
    '  --page-size=N              rows per supabase select (default 1000)',
    '  -h, --help                 this help',
    '',
    'Whitelisted tables:',
    '  ' + CRITICAL_TABLES.join(', '),
    '',
  ].join('\n'));
}

// ---------------------------------------------------------------------------
// FS helpers
// ---------------------------------------------------------------------------
function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function todayStamp() {
  const d = new Date();
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function fmtBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function writeAuditLine(projectRoot, entry) {
  const logDir = path.join(projectRoot, 'logs');
  ensureDir(logDir);
  const logFile = path.join(logDir, 'backup-audit.jsonl');
  const line = JSON.stringify({ ts: new Date().toISOString(), host: os.hostname(), ...entry }) + '\n';
  fs.appendFileSync(logFile, line, 'utf8');
}

// ---------------------------------------------------------------------------
// Supabase helpers (READ ONLY)
// ---------------------------------------------------------------------------
async function countRows(supabase, table) {
  const { count, error } = await supabase.from(table).select('*', { count: 'exact', head: true });
  if (error) throw new Error(`count(${table}): ${error.message}`);
  return count || 0;
}

async function dumpTable(supabase, table, outPath, pageSize) {
  // SELECT only. Never delete/update. Pages via range() to avoid memory blow-up.
  const fd = fs.openSync(outPath, 'w');
  const hash = crypto.createHash('sha256');
  let rows = 0;
  let bytes = 0;
  let from = 0;

  try {
    while (true) {
      const to = from + pageSize - 1;
      const { data, error } = await supabase.from(table).select('*').range(from, to);
      if (error) throw new Error(`select(${table}, ${from}-${to}): ${error.message}`);
      if (!data || data.length === 0) break;
      for (const row of data) {
        const line = JSON.stringify(row) + '\n';
        const buf = Buffer.from(line, 'utf8');
        fs.writeSync(fd, buf);
        hash.update(buf);
        bytes += buf.length;
        rows += 1;
      }
      if (data.length < pageSize) break;
      from += pageSize;
    }
  } finally {
    fs.closeSync(fd);
  }

  return { rows, bytes, sha256: hash.digest('hex') };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const args = parseArgs(process.argv);
  if (args.help) { printHelp(); process.exit(0); }

  const projectRoot = path.resolve(__dirname, '..', '..');

  if (!args.iKnowWhatImDoing && !args.dryRun) {
    console.error('[backup-db] refuses to run without --i-know-what-im-doing (or --dry-run)');
    process.exit(2);
  }

  // Resolve tables against whitelist
  let tables = args.only || CRITICAL_TABLES.slice();
  const unknown = tables.filter(t => !CRITICAL_TABLES.includes(t));
  if (unknown.length) {
    console.error(`[backup-db] tables not in whitelist: ${unknown.join(', ')}`);
    console.error('[backup-db] edit CRITICAL_TABLES in scripts/backup/backup-db.js to extend.');
    process.exit(2);
  }

  const backupRoot = path.resolve(args.output || path.join(projectRoot, 'backups'));
  const stamp = todayStamp();
  const dayDir = path.join(backupRoot, stamp);

  if (args.dryRun) {
    console.log('[backup-db] DRY RUN');
    console.log(`[backup-db] backupRoot = ${backupRoot}`);
    console.log(`[backup-db] dayDir     = ${dayDir}`);
    console.log(`[backup-db] tables     = ${tables.length}`);
    for (const t of tables) console.log(`  - ${t}  ->  ${path.join(dayDir, t + '.jsonl')}`);
    writeAuditLine(projectRoot, { action: 'backup-db', mode: 'dry-run', tables, dayDir });
    process.exit(0);
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('[backup-db] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY required');
    process.exit(2);
  }
  if (!createClient) {
    console.error('[backup-db] @supabase/supabase-js is not installed. Run npm install.');
    process.exit(2);
  }

  ensureDir(backupRoot);
  ensureDir(dayDir);

  const startedAt = new Date().toISOString();
  const t0 = Date.now();
  console.log(`[backup-db] start=${startedAt}  url=${url}  out=${dayDir}`);
  writeAuditLine(projectRoot, { action: 'backup-db', mode: 'start', url, tables, dayDir });

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: 'public' },
  });

  const results = [];
  let totalRows = 0;
  let totalBytes = 0;

  for (const table of tables) {
    try {
      let counted = null;
      try { counted = await countRows(supabase, table); } catch (_) { counted = null; }

      const outPath = path.join(dayDir, `${table}.jsonl`);
      const ts = Date.now();
      const { rows, bytes, sha256 } = await dumpTable(supabase, table, outPath, args.pageSize);
      const ms = Date.now() - ts;

      // Sidecar checksum file
      fs.writeFileSync(outPath + '.sha256', sha256 + '  ' + table + '.jsonl\n', 'utf8');
      // Per-table meta
      const meta = {
        table,
        file: `${table}.jsonl`,
        rows,
        rows_from_count: counted,
        bytes,
        bytes_human: fmtBytes(bytes),
        sha256,
        duration_ms: ms,
        exported_at: new Date().toISOString(),
      };
      fs.writeFileSync(path.join(dayDir, `${table}.meta.json`), JSON.stringify(meta, null, 2), 'utf8');

      results.push(meta);
      totalRows += rows;
      totalBytes += bytes;
      console.log(`[backup-db] OK  ${table}  rows=${rows}  size=${fmtBytes(bytes)}  ${ms}ms`);
    } catch (err) {
      console.error(`[backup-db] FAIL ${table}: ${err.message}`);
      writeAuditLine(projectRoot, { action: 'backup-db', mode: 'fail', table, error: err.message });
      process.exit(5);
    }
  }

  const endedAt = new Date().toISOString();
  const manifest = {
    version: 1,
    generator: 'onyx-procurement/scripts/backup/backup-db.js',
    project_url: url,
    schema: 'public',
    date: stamp,
    started_at: startedAt,
    ended_at: endedAt,
    duration_ms: Date.now() - t0,
    table_count: results.length,
    total_rows: totalRows,
    total_bytes: totalBytes,
    total_bytes_human: fmtBytes(totalBytes),
    tables: results,
    whitelist: CRITICAL_TABLES,
  };
  const manifestPath = path.join(dayDir, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
  const manifestSha = crypto.createHash('sha256').update(fs.readFileSync(manifestPath)).digest('hex');
  fs.writeFileSync(manifestPath + '.sha256', manifestSha + '  manifest.json\n', 'utf8');

  writeAuditLine(projectRoot, {
    action: 'backup-db',
    mode: 'done',
    tables_backed_up: results.length,
    total_rows: totalRows,
    total_bytes: totalBytes,
    manifest_sha256: manifestSha,
    dayDir,
  });

  console.log('[backup-db] SUMMARY ' + JSON.stringify({
    status: 'ok',
    dayDir,
    tables_backed_up: results.length,
    total_rows: totalRows,
    total_bytes_human: fmtBytes(totalBytes),
    manifest_sha256: manifestSha,
  }));
  process.exit(0);
}

main().catch(err => {
  console.error('[backup-db] fatal:', (err && err.stack) || err);
  process.exit(1);
});
