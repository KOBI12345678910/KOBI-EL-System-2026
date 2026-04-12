#!/usr/bin/env node
/**
 * ONYX PROCUREMENT — Backup Integrity Verifier
 * Agent 59 / backup-and-restore drill
 *
 * Read-only verifier for a backup day folder or archive. Ensures:
 *   1. manifest.json is present and parses.
 *   2. Each listed JSONL file exists.
 *   3. SHA-256 of every JSONL matches its manifest entry.
 *   4. Row counts in JSONL match the manifest entry (counted by '\n').
 *   5. manifest.json.sha256 sidecar, if present, matches the manifest.
 *   6. JSONL content parses line by line (optional deep check).
 *   7. All whitelisted critical tables are represented.
 *
 * This script makes NO NETWORK CALLS and NO FILESYSTEM MUTATIONS.
 * It is safe to run on production backups.
 *
 * USAGE
 *   node scripts/backup/backup-verify.js --from=backups/2026-04-11
 *   node scripts/backup/backup-verify.js --from=backups/2026-04-11 --deep
 *   node scripts/backup/backup-verify.js --from=backups/2026-04-11 --json
 *
 * EXIT CODES
 *   0 all checks passed
 *   2 usage / missing source
 *   3 integrity failure
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const CRITICAL_TABLES = Object.freeze([
  'employers', 'employees', 'timesheets', 'wage_slips',
  'suppliers', 'invoices', 'purchase_orders', 'payments',
  'vat_transactions', 'vat_exports',
  'annual_tax_reports',
  'bank_transactions', 'bank_matches',
  'audit_log',
]);

function parseArgs(argv) {
  const out = { from: null, deep: false, json: false, help: false };
  for (const raw of argv.slice(2)) {
    if (raw === '--help' || raw === '-h') { out.help = true; continue; }
    if (raw === '--deep') { out.deep = true; continue; }
    if (raw === '--json') { out.json = true; continue; }
    const m = raw.match(/^--([^=]+)=(.*)$/);
    if (!m) continue;
    const [, k, v] = m;
    if (k === 'from') out.from = v;
  }
  return out;
}

function printHelp() {
  process.stdout.write([
    '',
    'ONYX backup-verify.js — integrity check for a backup day folder',
    '',
    '  --from=PATH     backup day folder [required]',
    '  --deep          also parse every JSONL row as JSON',
    '  --json          emit machine-readable JSON report',
    '',
  ].join('\n'));
}

function sha256File(file) {
  const h = crypto.createHash('sha256');
  h.update(fs.readFileSync(file));
  return h.digest('hex');
}

function countJsonlRows(file, deep) {
  // Count lines (non-empty). If deep, parse each one.
  const text = fs.readFileSync(file, 'utf8');
  let rows = 0;
  let parseErrors = 0;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    rows += 1;
    if (deep) {
      try { JSON.parse(line); } catch (_) { parseErrors += 1; }
    }
  }
  return { rows, parseErrors };
}

function main() {
  const args = parseArgs(process.argv);
  if (args.help) { printHelp(); process.exit(0); }
  if (!args.from) {
    console.error('[verify] --from=PATH is required');
    process.exit(2);
  }
  const dayDir = path.resolve(args.from);
  if (!fs.existsSync(dayDir) || !fs.statSync(dayDir).isDirectory()) {
    console.error(`[verify] not a directory: ${dayDir}`);
    process.exit(2);
  }

  const manifestPath = path.join(dayDir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    console.error(`[verify] manifest.json missing at ${manifestPath}`);
    process.exit(3);
  }

  const report = {
    from: dayDir,
    manifest: manifestPath,
    manifest_ok: false,
    manifest_sha256_sidecar_ok: null,
    tables_checked: 0,
    tables_ok: 0,
    issues: [],
    per_table: [],
    whitelist_missing: [],
  };

  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    report.manifest_ok = true;
  } catch (err) {
    report.issues.push(`manifest.json parse: ${err.message}`);
  }

  if (!report.manifest_ok) {
    finish(report, args.json, 3);
    return;
  }

  // Optional sidecar
  const sidecar = manifestPath + '.sha256';
  if (fs.existsSync(sidecar)) {
    const want = fs.readFileSync(sidecar, 'utf8').split(/\s+/)[0];
    const got = crypto.createHash('sha256').update(fs.readFileSync(manifestPath)).digest('hex');
    report.manifest_sha256_sidecar_ok = (want === got);
    if (want !== got) report.issues.push('manifest.json.sha256 sidecar mismatch');
  }

  const tables = manifest.tables || [];
  report.tables_checked = tables.length;

  for (const t of tables) {
    const entry = { table: t.table, file: t.file, rows_expected: t.rows, sha256_expected: t.sha256 };
    try {
      const full = path.join(dayDir, t.file);
      if (!fs.existsSync(full)) {
        entry.ok = false;
        entry.error = 'file missing';
        report.issues.push(`${t.table}: file missing`);
        report.per_table.push(entry);
        continue;
      }
      const stat = fs.statSync(full);
      entry.size = stat.size;
      const sha = sha256File(full);
      entry.sha256_actual = sha;
      if (sha !== t.sha256) {
        entry.ok = false;
        entry.error = 'checksum mismatch';
        report.issues.push(`${t.table}: checksum mismatch`);
        report.per_table.push(entry);
        continue;
      }
      const { rows, parseErrors } = countJsonlRows(full, args.deep);
      entry.rows_actual = rows;
      entry.parse_errors = parseErrors;
      if (rows !== t.rows) {
        entry.ok = false;
        entry.error = `row count mismatch: expected ${t.rows} got ${rows}`;
        report.issues.push(`${t.table}: ${entry.error}`);
        report.per_table.push(entry);
        continue;
      }
      if (args.deep && parseErrors > 0) {
        entry.ok = false;
        entry.error = `${parseErrors} parse error(s)`;
        report.issues.push(`${t.table}: ${entry.error}`);
        report.per_table.push(entry);
        continue;
      }
      entry.ok = true;
      report.tables_ok += 1;
      report.per_table.push(entry);
    } catch (err) {
      entry.ok = false;
      entry.error = err.message;
      report.issues.push(`${t.table}: ${err.message}`);
      report.per_table.push(entry);
    }
  }

  const represented = new Set(tables.map(t => t.table));
  for (const w of CRITICAL_TABLES) {
    if (!represented.has(w)) report.whitelist_missing.push(w);
  }
  if (report.whitelist_missing.length) {
    report.issues.push(`whitelist tables missing from manifest: ${report.whitelist_missing.join(', ')}`);
  }

  const exitCode = report.issues.length ? 3 : 0;
  finish(report, args.json, exitCode);
}

function finish(report, json, code) {
  if (json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  } else {
    console.log(`[verify] from           ${report.from}`);
    console.log(`[verify] manifest_ok    ${report.manifest_ok}`);
    console.log(`[verify] tables_ok      ${report.tables_ok}/${report.tables_checked}`);
    if (report.whitelist_missing.length) {
      console.log(`[verify] whitelist_missing ${report.whitelist_missing.join(', ')}`);
    }
    for (const t of report.per_table) {
      if (t.ok) console.log(`  OK    ${t.table}  rows=${t.rows_actual}  size=${t.size}`);
      else     console.log(`  FAIL  ${t.table}  ${t.error || ''}`);
    }
    if (report.issues.length) {
      console.log('[verify] ISSUES:');
      for (const i of report.issues) console.log('  - ' + i);
    } else {
      console.log('[verify] all checks passed.');
    }
  }
  process.exit(code);
}

try { main(); }
catch (err) {
  console.error('[verify] fatal:', (err && err.stack) || err);
  process.exit(1);
}
