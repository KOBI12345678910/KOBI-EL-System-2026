#!/usr/bin/env node
/**
 * ONYX PROCUREMENT — Disaster Recovery Drill
 * Agent 59 / backup-and-restore drill
 *
 * PURPOSE
 * -------
 * End-to-end DR rehearsal that the team can run on a cadence without risking
 * production data. The drill does:
 *
 *   1. BACKUP            - invoke backup-db.js to dump whitelisted tables.
 *   2. VERIFY            - invoke backup-verify.js on the freshly produced set.
 *   3. RESTORE TO STAGE  - invoke restore-db.js with --target=staging, creating
 *                          restore_<table>_<timestamp> tables.
 *   4. COMPARE           - re-dump each staging table via Supabase and compare
 *                          row counts + SHA-256 against the original JSONL.
 *   5. REPORT            - write a JSON report to logs/drill-reports/.
 *
 * SAFETY CONTRACT
 * ---------------
 *   - Never truncates, drops or deletes anything in production schemas.
 *   - Never writes to production tables — only to restore_<table>_<ts>.
 *   - Requires BOTH --confirm AND --i-know-what-im-doing to perform writes.
 *   - With --dry-run, simulates steps 1-4 by running only backup + verify.
 *
 * USAGE
 *   node scripts/backup/drill.js --confirm --i-know-what-im-doing
 *   node scripts/backup/drill.js --dry-run
 *
 * ENV
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * EXIT CODES
 *   0 success
 *   2 usage / missing env
 *   5 drill failed any step
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const { spawnSync } = require('child_process');

try { require('dotenv').config(); } catch (_) { /* optional */ }

let createClient;
try { ({ createClient } = require('@supabase/supabase-js')); } catch (_) { /* optional for dry-run */ }

const CRITICAL_TABLES = Object.freeze([
  'employers', 'employees', 'timesheets', 'wage_slips',
  'suppliers', 'invoices', 'purchase_orders', 'payments',
  'vat_transactions', 'vat_exports',
  'annual_tax_reports',
  'bank_transactions', 'bank_matches',
  'audit_log',
]);

function parseArgs(argv) {
  const out = {
    confirm: false,
    iKnowWhatImDoing: false,
    dryRun: false,
    only: null,
    pageSize: 1000,
    help: false,
  };
  for (const raw of argv.slice(2)) {
    if (raw === '--help' || raw === '-h') { out.help = true; continue; }
    if (raw === '--confirm') { out.confirm = true; continue; }
    if (raw === '--i-know-what-im-doing') { out.iKnowWhatImDoing = true; continue; }
    if (raw === '--dry-run') { out.dryRun = true; continue; }
    const m = raw.match(/^--([^=]+)=(.*)$/);
    if (!m) continue;
    const [, k, v] = m;
    if (k === 'only') out.only = v.split(',').map(s => s.trim()).filter(Boolean);
    else if (k === 'page-size') out.pageSize = parseInt(v, 10) || 1000;
  }
  return out;
}

function printHelp() {
  process.stdout.write([
    '',
    'ONYX drill.js — full DR rehearsal (backup -> verify -> staged restore -> compare)',
    '',
    '  --confirm                explicit confirmation',
    '  --i-know-what-im-doing   explicit guard flag',
    '  --dry-run                run only backup + verify, no writes to DB',
    '  --only=a,b,c             limit drill to these tables',
    '  --page-size=N            page size for comparison reads (default 1000)',
    '',
  ].join('\n'));
}

function ensureDir(dir) { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); }

function ts() { return new Date().toISOString(); }

function todayStamp() {
  const d = new Date();
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function runNode(scriptPath, args) {
  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
  });
  return {
    status: result.status,
    stdout: (result.stdout || '').toString(),
    stderr: (result.stderr || '').toString(),
  };
}

function writeAuditLine(projectRoot, entry) {
  const logDir = path.join(projectRoot, 'logs');
  ensureDir(logDir);
  const logFile = path.join(logDir, 'drill-audit.jsonl');
  const line = JSON.stringify({ ts: ts(), host: os.hostname(), ...entry }) + '\n';
  fs.appendFileSync(logFile, line, 'utf8');
}

function sha256Buffer(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

async function dumpStagingJsonl(supabase, destTable, pageSize) {
  // Re-read rows from staging into a deterministic JSONL buffer.
  // We sort keys so equal rows produce equal bytes.
  const rows = [];
  let from = 0;
  while (true) {
    const to = from + pageSize - 1;
    const { data, error } = await supabase.from(destTable).select('*').range(from, to);
    if (error) throw new Error(`read(${destTable}): ${error.message}`);
    if (!data || data.length === 0) break;
    for (const r of data) rows.push(r);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  // Sort by string of row.id if present, otherwise by JSON.stringify
  rows.sort((a, b) => {
    const ai = a && a.id !== undefined ? String(a.id) : JSON.stringify(a);
    const bi = b && b.id !== undefined ? String(b.id) : JSON.stringify(b);
    if (ai < bi) return -1;
    if (ai > bi) return 1;
    return 0;
  });
  const lines = rows.map(r => JSON.stringify(sortKeys(r)));
  return { count: rows.length, buffer: Buffer.from(lines.join('\n') + (lines.length ? '\n' : ''), 'utf8') };
}

function sortKeys(obj) {
  if (Array.isArray(obj)) return obj.map(sortKeys);
  if (obj && typeof obj === 'object') {
    const out = {};
    for (const k of Object.keys(obj).sort()) out[k] = sortKeys(obj[k]);
    return out;
  }
  return obj;
}

function readJsonlAsCanonicalBuffer(file) {
  const text = fs.readFileSync(file, 'utf8');
  const rows = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    rows.push(JSON.parse(line));
  }
  rows.sort((a, b) => {
    const ai = a && a.id !== undefined ? String(a.id) : JSON.stringify(a);
    const bi = b && b.id !== undefined ? String(b.id) : JSON.stringify(b);
    if (ai < bi) return -1;
    if (ai > bi) return 1;
    return 0;
  });
  const lines = rows.map(r => JSON.stringify(sortKeys(r)));
  return { count: rows.length, buffer: Buffer.from(lines.join('\n') + (lines.length ? '\n' : ''), 'utf8') };
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) { printHelp(); process.exit(0); }
  if (!args.dryRun && (!args.confirm || !args.iKnowWhatImDoing)) {
    console.error('[drill] refuses to run without --confirm AND --i-know-what-im-doing (or --dry-run)');
    process.exit(2);
  }

  const projectRoot = path.resolve(__dirname, '..', '..');
  const scriptsDir = __dirname;
  const backupScript = path.join(scriptsDir, 'backup-db.js');
  const verifyScript = path.join(scriptsDir, 'backup-verify.js');
  const restoreScript = path.join(scriptsDir, 'restore-db.js');

  const stamp = todayStamp();
  const runId = `drill_${stamp}_${Date.now()}`;
  const drillReportsDir = path.join(projectRoot, 'logs', 'drill-reports');
  ensureDir(drillReportsDir);
  const reportPath = path.join(drillReportsDir, `${runId}.json`);

  const report = {
    run_id: runId,
    started_at: ts(),
    ended_at: null,
    dry_run: args.dryRun,
    status: 'pending',
    steps: [],
    table_comparisons: [],
    summary: {},
  };

  writeAuditLine(projectRoot, { action: 'drill', mode: 'start', run_id: runId, dry_run: args.dryRun });

  // ---------- STEP 1: backup ----------
  console.log('[drill] STEP 1: backup-db.js');
  const backupArgs = ['--i-know-what-im-doing'];
  if (args.only) backupArgs.push(`--only=${args.only.join(',')}`);
  const backupRun = runNode(backupScript, backupArgs);
  report.steps.push({
    step: 'backup',
    exit: backupRun.status,
    stdout_tail: backupRun.stdout.split('\n').slice(-5).join('\n'),
    stderr_tail: backupRun.stderr.split('\n').slice(-5).join('\n'),
  });
  if (backupRun.status !== 0) {
    console.error('[drill] backup step failed');
    return finish(projectRoot, reportPath, report, 5);
  }
  const dayDir = path.join(projectRoot, 'backups', stamp);
  console.log(`[drill] backup complete  dayDir=${dayDir}`);

  // ---------- STEP 2: verify ----------
  console.log('[drill] STEP 2: backup-verify.js --deep');
  const verifyRun = runNode(verifyScript, [`--from=${dayDir}`, '--deep']);
  report.steps.push({
    step: 'verify',
    exit: verifyRun.status,
    stdout_tail: verifyRun.stdout.split('\n').slice(-20).join('\n'),
    stderr_tail: verifyRun.stderr.split('\n').slice(-5).join('\n'),
  });
  if (verifyRun.status !== 0) {
    console.error('[drill] verify step failed');
    return finish(projectRoot, reportPath, report, 5);
  }

  if (args.dryRun) {
    console.log('[drill] DRY RUN — skipping restore + compare steps');
    report.status = 'ok-dry-run';
    return finish(projectRoot, reportPath, report, 0);
  }

  // ---------- STEP 3: restore to staging ----------
  console.log('[drill] STEP 3: restore-db.js --target=staging');
  const restoreArgs = [
    `--from=${dayDir}`,
    '--target=staging',
    '--confirm',
    '--i-know-what-im-doing',
    `--stage-suffix=${runId}`,
  ];
  if (args.only) restoreArgs.push(`--only=${args.only.join(',')}`);
  const restoreRun = runNode(restoreScript, restoreArgs);
  report.steps.push({
    step: 'restore-staging',
    exit: restoreRun.status,
    stdout_tail: restoreRun.stdout.split('\n').slice(-10).join('\n'),
    stderr_tail: restoreRun.stderr.split('\n').slice(-10).join('\n'),
  });
  if (restoreRun.status !== 0) {
    console.error('[drill] restore step failed');
    return finish(projectRoot, reportPath, report, 5);
  }

  // ---------- STEP 4: compare ----------
  console.log('[drill] STEP 4: compare staging vs JSONL');
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || !createClient) {
    console.warn('[drill] cannot compare — missing Supabase credentials or SDK. Recording as partial.');
    report.status = 'ok-partial';
    return finish(projectRoot, reportPath, report, 0);
  }
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: 'public' },
  });

  const manifest = JSON.parse(fs.readFileSync(path.join(dayDir, 'manifest.json'), 'utf8'));
  const tablesToCompare = (args.only && args.only.length)
    ? (manifest.tables || []).filter(t => args.only.includes(t.table))
    : (manifest.tables || []);

  const stageSuffix = runId;
  let mismatches = 0;
  for (const t of tablesToCompare) {
    const destTable = `restore_${t.table}_${stageSuffix}`;
    const src = readJsonlAsCanonicalBuffer(path.join(dayDir, t.file));
    const srcSha = sha256Buffer(src.buffer);

    try {
      const dst = await dumpStagingJsonl(supabase, destTable, args.pageSize);
      const dstSha = sha256Buffer(dst.buffer);
      const ok = (src.count === dst.count) && (srcSha === dstSha);
      if (!ok) mismatches += 1;
      report.table_comparisons.push({
        table: t.table,
        staging_table: destTable,
        source_rows: src.count,
        staging_rows: dst.count,
        source_sha256: srcSha,
        staging_sha256: dstSha,
        equal: ok,
      });
      console.log(`[drill] cmp  ${t.table}  src=${src.count}  stg=${dst.count}  ${ok ? 'OK' : 'MISMATCH'}`);
    } catch (err) {
      mismatches += 1;
      report.table_comparisons.push({
        table: t.table,
        staging_table: destTable,
        source_rows: src.count,
        error: err.message,
        equal: false,
      });
      console.error(`[drill] cmp FAIL ${t.table}: ${err.message}`);
    }
  }

  report.summary = {
    tables_compared: tablesToCompare.length,
    mismatches,
  };
  report.status = mismatches === 0 ? 'ok' : 'mismatch';

  return finish(projectRoot, reportPath, report, mismatches === 0 ? 0 : 5);
}

function finish(projectRoot, reportPath, report, code) {
  report.ended_at = ts();
  if (!report.status || report.status === 'pending') report.status = code === 0 ? 'ok' : 'fail';
  try { fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8'); } catch (_) { /* ignore */ }
  writeAuditLine(projectRoot, {
    action: 'drill',
    mode: 'done',
    run_id: report.run_id,
    status: report.status,
    report_path: reportPath,
    mismatches: report.summary ? report.summary.mismatches : null,
  });
  console.log('[drill] SUMMARY ' + JSON.stringify({
    status: report.status,
    report_path: reportPath,
    steps: report.steps.map(s => ({ step: s.step, exit: s.exit })),
    mismatches: report.summary ? report.summary.mismatches : null,
  }));
  process.exit(code);
}

main().catch(err => {
  console.error('[drill] fatal:', (err && err.stack) || err);
  process.exit(1);
});
