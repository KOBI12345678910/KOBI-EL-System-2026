#!/usr/bin/env node
/**
 * ONYX PROCUREMENT — Staged DB Restore
 * Agent 59 / backup-and-restore drill
 *
 * SAFETY CONTRACT
 * ---------------
 *   - NEVER runs TRUNCATE or DROP TABLE on production.
 *   - Default behaviour is to write into STAGING tables named
 *       restore_<table>_YYYYMMDD_HHMMSS
 *     which keeps production untouched.
 *   - To write into a production table you must pass ALL of:
 *       --confirm
 *       --i-know-what-im-doing
 *       --target=prod
 *     Even then, the script only UPSERTs — it does not delete existing rows.
 *   - Refuses to touch any table not in the CRITICAL_TABLES whitelist.
 *   - Every operation is written to logs/restore-audit.jsonl.
 *
 * USAGE
 *   # default: restore every whitelisted table into staging tables
 *   node scripts/backup/restore-db.js --from=backups/2026-04-11 --confirm --i-know-what-im-doing
 *
 *   # restore a subset to staging
 *   node scripts/backup/restore-db.js --from=backups/2026-04-11 --only=employers,employees --confirm --i-know-what-im-doing
 *
 *   # write directly into prod (upsert only, never truncate)
 *   node scripts/backup/restore-db.js --from=backups/2026-04-11 --target=prod --confirm --i-know-what-im-doing
 *
 * ENV
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * EXIT CODES
 *   0 success, non-zero on any failure.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');

try { require('dotenv').config(); } catch (_) { /* optional */ }

let createClient;
try { ({ createClient } = require('@supabase/supabase-js')); } catch (_) { /* handled at apply */ }

// Must match scripts/backup/backup-db.js
const CRITICAL_TABLES = Object.freeze([
  'employers', 'employees', 'timesheets', 'wage_slips',
  'suppliers', 'invoices', 'purchase_orders', 'payments',
  'vat_transactions', 'vat_exports',
  'annual_tax_reports',
  'bank_transactions', 'bank_matches',
  'audit_log',
]);

const FORBIDDEN_SQL = /(\btruncate\b|\bdrop\s+table\b|\bdelete\s+from\b)/i;

function parseArgs(argv) {
  const out = {
    from: null,
    only: null,
    target: 'staging', // staging | prod
    confirm: false,
    iKnowWhatImDoing: false,
    pk: 'id',
    batchSize: 500,
    stageSuffix: null,
    help: false,
  };
  for (const raw of argv.slice(2)) {
    if (raw === '--help' || raw === '-h') { out.help = true; continue; }
    if (raw === '--confirm') { out.confirm = true; continue; }
    if (raw === '--i-know-what-im-doing') { out.iKnowWhatImDoing = true; continue; }
    const m = raw.match(/^--([^=]+)=(.*)$/);
    if (!m) continue;
    const [, k, v] = m;
    if (k === 'from') out.from = v;
    else if (k === 'only') out.only = v.split(',').map(s => s.trim()).filter(Boolean);
    else if (k === 'target') out.target = v;
    else if (k === 'pk') out.pk = v;
    else if (k === 'batch-size') out.batchSize = parseInt(v, 10) || 500;
    else if (k === 'stage-suffix') out.stageSuffix = v;
  }
  return out;
}

function printHelp() {
  process.stdout.write([
    '',
    'ONYX restore-db.js — restore JSONL backup into staging (default) or prod',
    '',
    '  --from=PATH                 backup folder (YYYY-MM-DD)  [required]',
    '  --only=a,b,c                restore only these tables',
    '  --target=staging|prod       staging (default) or prod',
    '  --confirm                   explicit confirmation [required]',
    '  --i-know-what-im-doing      explicit guard flag   [required]',
    '  --pk=NAME                   primary-key column (default: id)',
    '  --batch-size=N              rows per upsert batch (default: 500)',
    '  --stage-suffix=SUFFIX       override staging table suffix',
    '',
    'Notes:',
    '  - Only tables in the whitelist can be restored.',
    '  - Staging mode writes to restore_<table>_<timestamp>.',
    '  - Prod mode upserts directly on the primary key. Nothing is deleted.',
    '',
  ].join('\n'));
}

function ensureDir(dir) { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); }

function sha256File(file) {
  const h = crypto.createHash('sha256');
  h.update(fs.readFileSync(file));
  return h.digest('hex');
}

function readJsonl(file) {
  const text = fs.readFileSync(file, 'utf8');
  const rows = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    rows.push(JSON.parse(line));
  }
  return rows;
}

function writeAuditLine(projectRoot, entry) {
  const logDir = path.join(projectRoot, 'logs');
  ensureDir(logDir);
  const logFile = path.join(logDir, 'restore-audit.jsonl');
  const line = JSON.stringify({ ts: new Date().toISOString(), host: os.hostname(), ...entry }) + '\n';
  fs.appendFileSync(logFile, line, 'utf8');
}

function buildStageSuffix(custom) {
  if (custom) return custom.replace(/[^a-z0-9_]/gi, '_').toLowerCase();
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}_${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`;
}

async function upsertBatches(supabase, table, rows, pk, batchSize) {
  let inserted = 0;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const { error } = await supabase.from(table).upsert(batch, { onConflict: pk });
    if (error) throw new Error(`upsert(${table}, batch ${i}): ${error.message}`);
    inserted += batch.length;
  }
  return inserted;
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) { printHelp(); process.exit(0); }

  const projectRoot = path.resolve(__dirname, '..', '..');

  if (!args.from) {
    console.error('[restore-db] --from=PATH is required.');
    process.exit(2);
  }
  if (!args.confirm || !args.iKnowWhatImDoing) {
    console.error('[restore-db] refuses to run without --confirm AND --i-know-what-im-doing');
    process.exit(2);
  }
  if (args.target !== 'staging' && args.target !== 'prod') {
    console.error('[restore-db] --target must be staging or prod');
    process.exit(2);
  }

  const srcDir = path.resolve(args.from);
  if (!fs.existsSync(srcDir) || !fs.statSync(srcDir).isDirectory()) {
    console.error(`[restore-db] source folder not found: ${srcDir}`);
    process.exit(2);
  }
  const manifestPath = path.join(srcDir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    console.error(`[restore-db] manifest.json missing under ${srcDir}`);
    process.exit(2);
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  console.log(`[restore-db] manifest date=${manifest.date} tables=${manifest.table_count} project=${manifest.project_url || 'unknown'}`);

  // Validate integrity before touching anything
  const issues = [];
  for (const t of manifest.tables || []) {
    if (!CRITICAL_TABLES.includes(t.table)) {
      issues.push(`table ${t.table} not in whitelist`);
      continue;
    }
    const file = path.join(srcDir, t.file);
    if (!fs.existsSync(file)) { issues.push(`missing ${t.file}`); continue; }
    const sha = sha256File(file);
    if (sha !== t.sha256) issues.push(`checksum mismatch on ${t.file}`);
  }
  if (issues.length) {
    console.error('[restore-db] integrity issues:');
    for (const i of issues) console.error('  - ' + i);
    process.exit(3);
  }

  let selected = (args.only && args.only.length)
    ? (manifest.tables || []).filter(t => args.only.includes(t.table))
    : (manifest.tables || []);
  if (args.only) {
    const unknown = args.only.filter(t => !CRITICAL_TABLES.includes(t));
    if (unknown.length) {
      console.error(`[restore-db] tables not in whitelist: ${unknown.join(', ')}`);
      process.exit(2);
    }
  }
  if (!selected.length) {
    console.error('[restore-db] no tables matched filter.');
    process.exit(4);
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('[restore-db] SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
    process.exit(2);
  }
  if (!createClient) {
    console.error('[restore-db] @supabase/supabase-js is not installed.');
    process.exit(2);
  }

  // Sanity: the script never constructs SQL strings, but log a warning if
  // any env var contains a forbidden operation name (belt-and-braces).
  for (const [k, v] of Object.entries(process.env)) {
    if (typeof v === 'string' && FORBIDDEN_SQL.test(v)) {
      console.warn(`[restore-db] WARNING env ${k} contains forbidden SQL token — ignoring.`);
    }
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: 'public' },
  });

  const stageSuffix = buildStageSuffix(args.stageSuffix);
  const runStarted = new Date().toISOString();
  writeAuditLine(projectRoot, {
    action: 'restore-db',
    mode: 'start',
    target: args.target,
    url,
    from: srcDir,
    tables: selected.map(t => t.table),
    stage_suffix: args.target === 'staging' ? stageSuffix : null,
  });

  const report = [];
  for (const t of selected) {
    const file = path.join(srcDir, t.file);
    const rows = readJsonl(file);
    const destTable = args.target === 'prod' ? t.table : `restore_${t.table}_${stageSuffix}`;

    console.log(`[restore-db] ${t.table}  ->  ${destTable}  rows=${rows.length}`);
    try {
      const inserted = await upsertBatches(supabase, destTable, rows, args.pk, args.batchSize);
      report.push({ source: t.table, dest: destTable, rows_planned: rows.length, rows_written: inserted, status: 'ok' });
      writeAuditLine(projectRoot, {
        action: 'restore-db',
        mode: 'table-ok',
        source: t.table,
        dest: destTable,
        rows_written: inserted,
      });
    } catch (err) {
      console.error(`[restore-db] FAIL ${t.table}: ${err.message}`);
      report.push({ source: t.table, dest: destTable, rows_planned: rows.length, rows_written: 0, status: 'error', error: err.message });
      writeAuditLine(projectRoot, {
        action: 'restore-db',
        mode: 'table-fail',
        source: t.table,
        dest: destTable,
        error: err.message,
      });
      process.exit(5);
    }
  }

  writeAuditLine(projectRoot, {
    action: 'restore-db',
    mode: 'done',
    target: args.target,
    started_at: runStarted,
    ended_at: new Date().toISOString(),
    stage_suffix: args.target === 'staging' ? stageSuffix : null,
    report,
  });

  console.log('[restore-db] SUMMARY ' + JSON.stringify({
    status: 'ok',
    target: args.target,
    stage_suffix: args.target === 'staging' ? stageSuffix : null,
    tables: report,
  }));
  process.exit(0);
}

main().catch(err => {
  console.error('[restore-db] fatal:', (err && err.stack) || err);
  process.exit(1);
});
