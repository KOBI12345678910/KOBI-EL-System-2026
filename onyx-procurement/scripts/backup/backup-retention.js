#!/usr/bin/env node
/**
 * ONYX PROCUREMENT — Backup Retention Pruner
 * Agent 59 / backup-and-restore drill
 *
 * SAFETY CONTRACT
 * ---------------
 *   - TOUCHES ONLY THE BACKUPS DIRECTORY (default: <project>/backups).
 *   - Refuses if the target dir is not named 'backups', 'backup',
 *     'onyx-backups' or explicitly approved via --allow-root=NAME.
 *   - NEVER touches tables, database, production data.
 *   - Only removes entries whose names match the YYYY-MM-DD[.tar.gz] shape
 *     and whose parsed date is older than the retention window.
 *   - Dry-run is the default. Pass --i-know-what-im-doing to actually delete.
 *
 * USAGE
 *   node scripts/backup/backup-retention.js                          # dry run, 90 days
 *   node scripts/backup/backup-retention.js --i-know-what-im-doing   # apply
 *   node scripts/backup/backup-retention.js --retention-days=60 --i-know-what-im-doing
 *   node scripts/backup/backup-retention.js --root=D:/onyx-backups --allow-root=onyx-backups
 *
 * EXIT CODES
 *   0 success
 *   2 usage / guard failure
 *   3 IO error
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

// ---------------------------------------------------------------------------
// Allowed root directory names. This is a defense-in-depth guard so that
// someone can never type "--root=C:/production" and wipe the system.
// ---------------------------------------------------------------------------
const ALLOWED_ROOT_BASENAMES = new Set([
  'backups',
  'backup',
  'onyx-backups',
  'onyx-backup',
  'dr-backups',
]);

const DEFAULT_RETENTION_DAYS = 90;

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const out = {
    root: null,
    retentionDays: DEFAULT_RETENTION_DAYS,
    iKnowWhatImDoing: false,
    allowRoot: null,
    help: false,
  };
  for (const raw of argv.slice(2)) {
    if (raw === '--help' || raw === '-h') { out.help = true; continue; }
    if (raw === '--i-know-what-im-doing') { out.iKnowWhatImDoing = true; continue; }
    const m = raw.match(/^--([^=]+)=(.*)$/);
    if (!m) continue;
    const [, k, v] = m;
    if (k === 'root') out.root = v;
    else if (k === 'retention-days') out.retentionDays = Math.max(1, parseInt(v, 10) || DEFAULT_RETENTION_DAYS);
    else if (k === 'allow-root') out.allowRoot = v;
  }
  return out;
}

function printHelp() {
  process.stdout.write([
    '',
    'ONYX backup-retention.js — prune old backup folders and archives',
    '',
    '  --root=PATH                 backup root (default: <project>/backups)',
    '  --retention-days=N          keep last N days (default: ' + DEFAULT_RETENTION_DAYS + ')',
    '  --allow-root=NAME           register an additional allowed basename',
    '  --i-know-what-im-doing      actually delete (default: dry run)',
    '',
  ].join('\n'));
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
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

  const projectRoot = path.resolve(__dirname, '..', '..');
  const root = path.resolve(args.root || path.join(projectRoot, 'backups'));
  const rootBase = path.basename(root).toLowerCase();

  const allowed = new Set([...ALLOWED_ROOT_BASENAMES]);
  if (args.allowRoot) allowed.add(args.allowRoot.toLowerCase());
  if (!allowed.has(rootBase)) {
    console.error(`[retention] refusing to prune: root basename "${rootBase}" is not in allow-list.`);
    console.error(`[retention] allowed: ${[...allowed].join(', ')}  (extend via --allow-root=NAME)`);
    process.exit(2);
  }
  if (!fs.existsSync(root)) {
    console.log(`[retention] root not found, nothing to do: ${root}`);
    process.exit(0);
  }
  const rootStat = fs.statSync(root);
  if (!rootStat.isDirectory()) {
    console.error(`[retention] root is not a directory: ${root}`);
    process.exit(2);
  }

  const cutoffMs = Date.now() - args.retentionDays * 24 * 60 * 60 * 1000;
  const cutoffIso = new Date(cutoffMs).toISOString().slice(0, 10);

  const entries = fs.readdirSync(root, { withFileTypes: true });
  const candidates = [];
  const kept = [];
  for (const e of entries) {
    const name = e.name;
    const dayMatch = name.match(/^(\d{4}-\d{2}-\d{2})(\.tar\.gz)?$/);
    if (!dayMatch) continue;
    const day = dayMatch[1];
    const ts = Date.parse(day + 'T00:00:00Z');
    if (Number.isNaN(ts)) continue;
    const full = path.join(root, name);
    if (ts < cutoffMs) candidates.push({ name, full, day, kind: e.isDirectory() ? 'dir' : 'file' });
    else kept.push({ name, day });
  }

  candidates.sort((a, b) => a.day.localeCompare(b.day));

  console.log(`[retention] root=${root}`);
  console.log(`[retention] retention_days=${args.retentionDays}  cutoff=${cutoffIso}`);
  console.log(`[retention] kept=${kept.length}  to_prune=${candidates.length}`);
  for (const c of candidates) console.log(`  - ${c.kind}  ${c.name}`);

  if (!candidates.length) {
    writeAuditLine(projectRoot, { action: 'backup-retention', mode: 'noop', root, kept: kept.length });
    console.log('[retention] nothing to do.');
    process.exit(0);
  }

  if (!args.iKnowWhatImDoing) {
    console.log('[retention] DRY RUN — pass --i-know-what-im-doing to actually delete.');
    writeAuditLine(projectRoot, { action: 'backup-retention', mode: 'dry-run', to_prune: candidates.length, root });
    process.exit(0);
  }

  const removed = [];
  for (const c of candidates) {
    // Double check path is still inside root
    const rel = path.relative(root, c.full);
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      console.error(`[retention] REFUSE to touch ${c.full} — not inside root`);
      continue;
    }
    try {
      if (c.kind === 'dir') fs.rmSync(c.full, { recursive: true, force: true });
      else fs.rmSync(c.full, { force: true });
      removed.push(c.name);
    } catch (err) {
      console.error(`[retention] failed to remove ${c.full}: ${err.message}`);
    }
  }

  writeAuditLine(projectRoot, {
    action: 'backup-retention',
    mode: 'done',
    root,
    retention_days: args.retentionDays,
    removed_count: removed.length,
    kept_count: kept.length,
    removed,
  });
  console.log('[retention] SUMMARY ' + JSON.stringify({
    status: 'ok',
    root,
    retention_days: args.retentionDays,
    removed: removed.length,
    kept: kept.length,
  }));
  process.exit(0);
}

try { main(); }
catch (err) {
  console.error('[retention] fatal:', (err && err.stack) || err);
  process.exit(1);
}
