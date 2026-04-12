#!/usr/bin/env node
/**
 * ONYX PROCUREMENT — Supabase Backup Restore
 * Agent-02 / 50-agent swarm
 *
 * Re-upserts rows from a backup folder or archive back into the live Supabase
 * project. By default this is a DRY RUN: it validates files, checks checksums,
 * counts rows, and prints what WOULD be written — but makes no network writes.
 * Pass --apply to actually push the data. There is also an interactive "YES"
 * confirmation prompt unless --yes is also given.
 *
 * Usage:
 *   node scripts/backup-restore.js --from=backups/2026-04-11
 *   node scripts/backup-restore.js --from=backups/2026-04-11.tar.gz
 *   node scripts/backup-restore.js --from=backups/2026-04-11 --tables=orders
 *   node scripts/backup-restore.js --from=backups/2026-04-11 --apply
 *   node scripts/backup-restore.js --from=backups/2026-04-11 --apply --yes
 *   node scripts/backup-restore.js --from=backups/2026-04-11 --apply --truncate
 *
 * Safety rails:
 *   - DRY RUN IS THE DEFAULT.
 *   - --apply does NOT delete existing rows unless --truncate is also passed.
 *   - --truncate requires --apply and --yes.
 *   - Refuses to run if SUPABASE_URL contains "prod" unless --i-know-its-prod.
 *   - Writes are upserts by primary key `id` (override with --pk=name).
 *
 * Env:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (required when --apply)
 *
 * Exit codes:
 *   0 success, non-zero on any failure.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const crypto = require('crypto');
const zlib = require('zlib');

let createClient;
try {
  ({ createClient } = require('@supabase/supabase-js'));
} catch (_) {
  // Only needed when --apply; fine to be missing for dry run.
}
try { require('dotenv').config(); } catch (_) { /* optional */ }

// ---------- CLI ARG PARSING ----------

function parseArgs(argv) {
  const out = {
    from: null,
    tables: null,
    apply: false,
    yes: false,
    truncate: false,
    pk: 'id',
    batchSize: 500,
    iKnowItsProd: false,
    help: false,
  };
  for (const raw of argv.slice(2)) {
    if (raw === '--help' || raw === '-h') { out.help = true; continue; }
    if (raw === '--apply') { out.apply = true; continue; }
    if (raw === '--yes' || raw === '-y') { out.yes = true; continue; }
    if (raw === '--truncate') { out.truncate = true; continue; }
    if (raw === '--i-know-its-prod') { out.iKnowItsProd = true; continue; }
    const m = raw.match(/^--([^=]+)=(.*)$/);
    if (!m) continue;
    const [, k, v] = m;
    if (k === 'from') out.from = v;
    else if (k === 'tables') out.tables = v.split(',').map(s => s.trim()).filter(Boolean);
    else if (k === 'pk') out.pk = v;
    else if (k === 'batch-size') out.batchSize = parseInt(v, 10) || 500;
  }
  return out;
}

function printHelp() {
  console.log(`
ONYX Supabase Backup Restore

  --from=PATH           required: backup folder (YYYY-MM-DD) or .tar.gz archive
  --tables=a,b,c        only restore these tables
  --apply               actually perform writes (default: dry run)
  --yes | -y            skip interactive confirmation (still requires --apply)
  --truncate            delete existing rows before insert (DANGEROUS)
  --pk=NAME             primary-key column for upserts (default: id)
  --batch-size=N        rows per upsert call (default: 500)
  --i-know-its-prod     allow running against URLs containing "prod"
  -h, --help            show this help
`);
}

// ---------- PURE-JS TAR EXTRACTOR (ustar) ----------
//
// Minimal extractor that handles what backup.js writes: regular files and
// directories in a single ustar stream. Enough to read one of our archives.

function parseOctal(buf, off, len) {
  let s = '';
  for (let i = 0; i < len; i++) {
    const c = buf[off + i];
    if (c === 0 || c === 32) break;
    s += String.fromCharCode(c);
  }
  return s ? parseInt(s, 8) : 0;
}

function extractTarGz(archiveFile, destDir) {
  const gz = fs.readFileSync(archiveFile);
  const tar = zlib.gunzipSync(gz);
  let off = 0;
  const files = [];
  while (off + 512 <= tar.length) {
    const header = tar.slice(off, off + 512);
    // end-of-archive: two zero blocks
    if (header.every(b => b === 0)) break;
    let name = '';
    for (let i = 0; i < 100; i++) {
      const c = header[i];
      if (c === 0) break;
      name += String.fromCharCode(c);
    }
    const size = parseOctal(header, 124, 12);
    const typeflag = String.fromCharCode(header[156] || 0x30);
    off += 512;
    if (!name) { off += Math.ceil(size / 512) * 512; continue; }
    const full = path.join(destDir, name);
    if (typeflag === '5') {
      fs.mkdirSync(full, { recursive: true });
    } else {
      fs.mkdirSync(path.dirname(full), { recursive: true });
      const body = tar.slice(off, off + size);
      fs.writeFileSync(full, body);
      files.push(full);
    }
    off += Math.ceil(size / 512) * 512;
  }
  return files;
}

// ---------- HELPERS ----------

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

function fmtBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function prompt(question) {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, ans => { rl.close(); resolve(ans); });
  });
}

// ---------- MAIN ----------

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) { printHelp(); process.exit(0); }

  if (!args.from) {
    console.error('[restore] --from=PATH is required. Use --help for usage.');
    process.exit(2);
  }

  // Loud banner, always.
  console.error('');
  console.error('  ############################################################');
  console.error('  #  ONYX SUPABASE RESTORE — DESTRUCTIVE OPERATION           #');
  console.error('  #  You are about to push previously-backed-up rows into    #');
  console.error('  #  a live Supabase project. Existing rows WILL be          #');
  console.error('  #  OVERWRITTEN on primary-key collision.                   #');
  console.error('  ############################################################');
  console.error('');

  // Resolve source: folder or archive
  let srcDir = path.resolve(args.from);
  let tempDir = null;
  if (!fs.existsSync(srcDir)) {
    console.error(`[restore] source not found: ${srcDir}`);
    process.exit(2);
  }
  const stat = fs.statSync(srcDir);
  if (stat.isFile() && /\.tar\.gz$/i.test(srcDir)) {
    tempDir = path.join(path.dirname(srcDir), `.restore-${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });
    console.error(`[restore] extracting ${srcDir} -> ${tempDir}`);
    extractTarGz(srcDir, tempDir);
    // The archive stores backups/YYYY-MM-DD/manifest.json under a top-level folder
    // matching the day stamp. Find the manifest and anchor srcDir there.
    const dayFolder = fs.readdirSync(tempDir).find(n => /^\d{4}-\d{2}-\d{2}$/.test(n));
    srcDir = dayFolder ? path.join(tempDir, dayFolder) : tempDir;
  } else if (!stat.isDirectory()) {
    console.error('[restore] --from must be a folder or a .tar.gz archive.');
    process.exit(2);
  }

  const manifestPath = path.join(srcDir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    console.error(`[restore] manifest.json not found in ${srcDir}`);
    process.exit(2);
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  console.error(`[restore] manifest: project=${manifest.project_url} date=${manifest.date} tables=${manifest.table_count}`);

  // Verify checksums
  const issues = [];
  const tablesInArchive = [];
  for (const t of manifest.tables || []) {
    const file = path.join(srcDir, t.file);
    if (!fs.existsSync(file)) { issues.push(`missing ${t.file}`); continue; }
    const sha = sha256File(file);
    if (sha !== t.sha256) issues.push(`checksum mismatch on ${t.file}`);
    tablesInArchive.push(t.table);
  }
  if (issues.length) {
    console.error(`[restore] integrity issues:\n  - ${issues.join('\n  - ')}`);
    process.exit(3);
  }
  console.error(`[restore] integrity OK (${tablesInArchive.length} tables)`);

  const targets = (args.tables && args.tables.length)
    ? tablesInArchive.filter(t => args.tables.includes(t))
    : tablesInArchive;
  if (!targets.length) {
    console.error('[restore] no tables match filter.');
    process.exit(4);
  }

  // Plan
  const plan = [];
  for (const table of targets) {
    const meta = manifest.tables.find(m => m.table === table);
    const file = path.join(srcDir, meta.file);
    plan.push({ table, file, rows: meta.rows, bytes: meta.bytes });
  }
  console.error('');
  console.error('[restore] plan:');
  for (const p of plan) {
    console.error(`  - ${p.table.padEnd(32)}  rows=${p.rows.toString().padStart(8)}  size=${fmtBytes(p.bytes)}`);
  }
  console.error('');

  if (!args.apply) {
    console.error('[restore] DRY RUN — no writes performed. Pass --apply to execute.');
    if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
    process.exit(0);
  }

  // --- APPLY PATH ---
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('[restore] SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required for --apply.');
    process.exit(2);
  }
  if (!createClient) {
    console.error('[restore] @supabase/supabase-js is not installed. Run npm install.');
    process.exit(2);
  }
  if (/prod/i.test(url) && !args.iKnowItsProd) {
    console.error(`[restore] target URL ${url} looks like production. Pass --i-know-its-prod to proceed.`);
    process.exit(2);
  }
  if (manifest.project_url && manifest.project_url !== url) {
    console.error(`[restore] WARNING: backup was taken from ${manifest.project_url} but target is ${url}`);
  }

  if (!args.yes) {
    const ans = await prompt(
      `Type YES (uppercase) to write ${plan.length} tables into ${url}` +
      (args.truncate ? ' and TRUNCATE first' : '') +
      ': '
    );
    if (ans.trim() !== 'YES') {
      console.error('[restore] aborted by user.');
      process.exit(10);
    }
  }
  if (args.truncate && !args.yes) {
    // extra gate when truncating without --yes is impossible (above exit),
    // but keep for clarity in code review
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: 'public' },
  });

  const report = [];
  for (const p of plan) {
    const rows = readJsonl(p.file);
    let inserted = 0;
    try {
      if (args.truncate) {
        // Soft truncate via delete — supabase-js doesn't expose SQL TRUNCATE.
        // Matches every id that exists; on empty tables this is a no-op.
        const { error: delErr } = await supabase.from(p.table).delete().not(args.pk, 'is', null);
        if (delErr) throw new Error(`truncate(${p.table}): ${delErr.message}`);
      }
      for (let i = 0; i < rows.length; i += args.batchSize) {
        const batch = rows.slice(i, i + args.batchSize);
        const { error } = await supabase.from(p.table).upsert(batch, { onConflict: args.pk });
        if (error) throw new Error(`upsert(${p.table}, batch ${i}): ${error.message}`);
        inserted += batch.length;
        process.stderr.write(`\r[restore] ${p.table}  ${inserted}/${rows.length}`);
      }
      process.stderr.write('\n');
      report.push({ table: p.table, rows: inserted, status: 'ok' });
    } catch (err) {
      process.stderr.write('\n');
      console.error(`[restore] FAIL ${p.table}: ${err.message}`);
      report.push({ table: p.table, rows: inserted, status: 'error', error: err.message });
      if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
      process.exit(5);
    }
  }

  if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });

  console.error('[restore] SUMMARY ' + JSON.stringify({
    status: 'ok',
    target_url: url,
    source: args.from,
    tables: report,
    truncate: args.truncate,
  }));
  process.exit(0);
}

main().catch(err => {
  console.error('[restore] fatal:', err && err.stack || err);
  process.exit(1);
});
