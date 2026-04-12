#!/usr/bin/env node
/**
 * ONYX PROCUREMENT — File Artifact Backup
 * Agent 59 / backup-and-restore drill
 *
 * SAFETY CONTRACT
 * ---------------
 *   - Read-only on production artifacts.
 *   - Copies files to backups/YYYY-MM-DD/files/<category>/... (never moves).
 *   - Originals are never touched.
 *   - Requires --i-know-what-im-doing.
 *
 * WHAT IT BACKS UP
 * ----------------
 *   1. PDF wage slips from wage slip storage (data/wage-slips, data/payslips, ./pdfs)
 *   2. PCN836 exports (data/pcn836, exports/pcn836)
 *   3. Generated reports (reports/, data/reports/, exports/reports/)
 *   4. VAT exports (exports/vat/)
 *   5. Annual tax reports (exports/annual-tax/)
 *
 * The script probes each candidate directory. Missing dirs are logged but not
 * fatal — different deployments store files in different places.
 *
 * USAGE
 *   node scripts/backup/backup-files.js --i-know-what-im-doing
 *   node scripts/backup/backup-files.js --i-know-what-im-doing --only=pdfs,pcn836
 *   node scripts/backup/backup-files.js --dry-run
 *
 * EXIT CODES
 *   0 success
 *   2 usage error
 *   5 copy failure
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');

// ---------------------------------------------------------------------------
// Category -> candidate source directories (relative to project root)
// ---------------------------------------------------------------------------
const CATEGORIES = Object.freeze({
  pdfs: {
    label: 'PDF wage slips',
    candidates: [
      'data/wage-slips',
      'data/payslips',
      'data/wage_slips',
      'pdfs',
      'storage/wage-slips',
    ],
    extensions: ['.pdf'],
  },
  pcn836: {
    label: 'PCN836 exports',
    candidates: [
      'data/pcn836',
      'exports/pcn836',
      'data/exports/pcn836',
      'storage/pcn836',
    ],
    extensions: ['.txt', '.dat', '.pcn', '.xml', '.csv'],
  },
  reports: {
    label: 'Generated reports',
    candidates: [
      'reports',
      'data/reports',
      'exports/reports',
      'storage/reports',
    ],
    extensions: ['.pdf', '.csv', '.xlsx', '.json', '.html'],
  },
  vat_exports: {
    label: 'VAT exports',
    candidates: [
      'exports/vat',
      'data/vat-exports',
      'storage/vat',
    ],
    extensions: ['.txt', '.csv', '.xml', '.json', '.pdf'],
  },
  annual_tax: {
    label: 'Annual tax reports',
    candidates: [
      'exports/annual-tax',
      'data/annual-tax',
      'storage/annual-tax',
    ],
    extensions: ['.pdf', '.csv', '.xml', '.json'],
  },
});

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const out = {
    only: null,
    output: null,
    iKnowWhatImDoing: false,
    dryRun: false,
    maxFileMb: 250,
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
    else if (k === 'max-file-mb') out.maxFileMb = parseInt(v, 10) || 250;
  }
  return out;
}

function printHelp() {
  process.stdout.write([
    '',
    'ONYX backup-files.js — back up artifact files (PDFs, exports, reports)',
    '',
    '  --i-know-what-im-doing   required guardrail flag',
    '  --dry-run                list what would be copied, no copy',
    '  --only=k1,k2             restrict to these categories',
    '  --output=PATH            root dir (default: <project>/backups)',
    '  --max-file-mb=N          skip individual files larger than N MB (default 250)',
    '',
    'Categories: ' + Object.keys(CATEGORIES).join(', '),
    '',
  ].join('\n'));
}

// ---------------------------------------------------------------------------
// Helpers
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

function walkFiles(rootDir, allowedExts) {
  const out = [];
  if (!fs.existsSync(rootDir)) return out;
  const stack = [rootDir];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
    catch (_) { continue; }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) stack.push(full);
      else if (e.isFile()) {
        if (!allowedExts || allowedExts.length === 0) { out.push(full); continue; }
        const ext = path.extname(e.name).toLowerCase();
        if (allowedExts.includes(ext)) out.push(full);
      }
    }
  }
  return out;
}

function copyFileWithHash(srcFile, dstFile) {
  ensureDir(path.dirname(dstFile));
  const data = fs.readFileSync(srcFile);
  fs.writeFileSync(dstFile, data);
  const sha = crypto.createHash('sha256').update(data).digest('hex');
  return { bytes: data.length, sha256: sha };
}

function writeAuditLine(projectRoot, entry) {
  const logDir = path.join(projectRoot, 'logs');
  ensureDir(logDir);
  const logFile = path.join(logDir, 'backup-audit.jsonl');
  const line = JSON.stringify({ ts: new Date().toISOString(), host: os.hostname(), ...entry }) + '\n';
  fs.appendFileSync(logFile, line, 'utf8');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
function main() {
  const args = parseArgs(process.argv);
  if (args.help) { printHelp(); process.exit(0); }
  if (!args.iKnowWhatImDoing && !args.dryRun) {
    console.error('[backup-files] refuses to run without --i-know-what-im-doing (or --dry-run)');
    process.exit(2);
  }

  const projectRoot = path.resolve(__dirname, '..', '..');
  const backupRoot = path.resolve(args.output || path.join(projectRoot, 'backups'));
  const stamp = todayStamp();
  const dayDir = path.join(backupRoot, stamp);
  const filesRoot = path.join(dayDir, 'files');

  const selectedKeys = args.only
    ? args.only.filter(k => Object.prototype.hasOwnProperty.call(CATEGORIES, k))
    : Object.keys(CATEGORIES);

  if (!selectedKeys.length) {
    console.error('[backup-files] no valid categories selected.');
    process.exit(2);
  }

  if (args.dryRun) console.log('[backup-files] DRY RUN');
  else { ensureDir(filesRoot); }

  const maxBytes = args.maxFileMb * 1024 * 1024;
  const report = { categories: [], totals: { files: 0, bytes: 0, skipped: 0 } };

  for (const key of selectedKeys) {
    const cat = CATEGORIES[key];
    const catReport = {
      key,
      label: cat.label,
      sources_tried: cat.candidates,
      sources_found: [],
      files_copied: 0,
      bytes_copied: 0,
      files_skipped: 0,
      entries: [],
    };

    for (const relCandidate of cat.candidates) {
      const srcDir = path.resolve(projectRoot, relCandidate);
      if (!fs.existsSync(srcDir)) continue;
      const stat = fs.statSync(srcDir);
      if (!stat.isDirectory()) continue;

      catReport.sources_found.push(relCandidate);
      const files = walkFiles(srcDir, cat.extensions);
      for (const file of files) {
        let fstat;
        try { fstat = fs.statSync(file); } catch (_) { continue; }
        if (fstat.size > maxBytes) {
          catReport.files_skipped += 1;
          report.totals.skipped += 1;
          console.log(`[backup-files] SKIP ${file}  size=${fmtBytes(fstat.size)} > max`);
          continue;
        }

        const rel = path.relative(srcDir, file);
        const dst = path.join(filesRoot, key, path.basename(srcDir), rel);

        if (args.dryRun) {
          catReport.files_copied += 1;
          catReport.bytes_copied += fstat.size;
          catReport.entries.push({ src: file, dst, bytes: fstat.size });
          continue;
        }

        try {
          const { bytes, sha256 } = copyFileWithHash(file, dst);
          catReport.files_copied += 1;
          catReport.bytes_copied += bytes;
          catReport.entries.push({ src: file, dst, bytes, sha256 });
        } catch (err) {
          console.error(`[backup-files] FAIL ${file}: ${err.message}`);
          writeAuditLine(projectRoot, { action: 'backup-files', mode: 'fail', file, error: err.message });
          process.exit(5);
        }
      }
    }

    console.log(`[backup-files] ${key}  copied=${catReport.files_copied}  size=${fmtBytes(catReport.bytes_copied)}  skipped=${catReport.files_skipped}  sources=${catReport.sources_found.length}`);
    report.categories.push(catReport);
    report.totals.files += catReport.files_copied;
    report.totals.bytes += catReport.bytes_copied;
  }

  if (!args.dryRun) {
    const manifestPath = path.join(filesRoot, 'files-manifest.json');
    fs.writeFileSync(manifestPath, JSON.stringify({
      version: 1,
      generator: 'onyx-procurement/scripts/backup/backup-files.js',
      date: stamp,
      created_at: new Date().toISOString(),
      totals: report.totals,
      totals_bytes_human: fmtBytes(report.totals.bytes),
      categories: report.categories,
    }, null, 2), 'utf8');
    console.log('[backup-files] manifest ' + manifestPath);
  }

  writeAuditLine(projectRoot, {
    action: 'backup-files',
    mode: args.dryRun ? 'dry-run' : 'done',
    totals: report.totals,
    categories: report.categories.map(c => ({ key: c.key, files: c.files_copied, bytes: c.bytes_copied })),
  });

  console.log('[backup-files] SUMMARY ' + JSON.stringify({
    status: 'ok',
    dryRun: args.dryRun,
    totals_files: report.totals.files,
    totals_bytes_human: fmtBytes(report.totals.bytes),
    totals_skipped: report.totals.skipped,
  }));
  process.exit(0);
}

try { main(); }
catch (err) {
  console.error('[backup-files] fatal:', (err && err.stack) || err);
  process.exit(1);
}
