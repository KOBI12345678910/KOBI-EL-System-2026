#!/usr/bin/env node
/**
 * ONYX PROCUREMENT — Automated Supabase Backup
 * Agent-02 / 50-agent swarm
 *
 * Purpose:
 *   Read every table in the `public` schema via the Supabase service-role key,
 *   dump each to a JSONL file under backups/YYYY-MM-DD/tablename.jsonl,
 *   compute SHA-256 checksums, produce a manifest.json, then gzip the entire
 *   day's directory into backups/YYYY-MM-DD.tar.gz using pure Node (zlib).
 *
 * Usage:
 *   node scripts/backup.js
 *   node scripts/backup.js --tables=orders,suppliers
 *   node scripts/backup.js --output=/mnt/backups
 *   node scripts/backup.js --keep-days=14
 *   node scripts/backup.js --fast                   # skip huge tables
 *   node scripts/backup.js --fast --max-rows=50000  # override fast limit
 *
 * Env:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (required)
 *
 * Exit codes:
 *   0 success, non-zero on any failure.
 *
 * Runs on Windows and Linux. Uses only zlib + fs + path + crypto — no native
 * tar binary is needed. The output is a single .tar.gz whose tar stream is
 * written by a small pure-JS ustar encoder embedded below so the archive is
 * usable anywhere (Linux tar, Windows 7-Zip, WinRAR, macOS bsdtar, etc.).
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
const { pipeline } = require('stream');
const { createClient } = require('@supabase/supabase-js');

try { require('dotenv').config(); } catch (_) { /* dotenv optional */ }

// ---------- CLI ARG PARSING ----------

function parseArgs(argv) {
  const out = {
    tables: null,
    output: null,
    keepDays: 30,
    fast: false,
    maxRows: 100000, // default "fast" threshold
    help: false,
  };
  for (const raw of argv.slice(2)) {
    if (raw === '--help' || raw === '-h') { out.help = true; continue; }
    if (raw === '--fast') { out.fast = true; continue; }
    const m = raw.match(/^--([^=]+)=(.*)$/);
    if (!m) continue;
    const [, k, v] = m;
    if (k === 'tables') out.tables = v.split(',').map(s => s.trim()).filter(Boolean);
    else if (k === 'output') out.output = v;
    else if (k === 'keep-days') out.keepDays = parseInt(v, 10) || 30;
    else if (k === 'max-rows') out.maxRows = parseInt(v, 10) || 100000;
  }
  return out;
}

function printHelp() {
  console.log(`
ONYX Supabase Backup

  --tables=a,b,c      back up only these tables (default: every table in public)
  --output=PATH       override backup root (default: ./backups)
  --keep-days=30      prune day-folders and archives older than N days
  --fast              skip tables larger than --max-rows (default 100000)
  --max-rows=N        row threshold for --fast (default 100000)
  -h, --help          show this help
`);
}

// ---------- SUPABASE HELPERS ----------

async function listPublicTables(supabase) {
  // Preferred: call an RPC function "list_public_tables" returning text[] / setof text.
  // Many ONYX installs already expose pg_execute; we try a couple of fallbacks.
  // 1) Try information_schema via RPC (recommended)
  try {
    const { data, error } = await supabase.rpc('list_public_tables');
    if (!error && Array.isArray(data) && data.length) {
      return data.map(r => (typeof r === 'string' ? r : r.table_name || r.tablename)).filter(Boolean);
    }
  } catch (_) { /* fall through */ }

  // 2) Try PostgREST introspection against information_schema.tables (requires it to be exposed)
  try {
    const { data, error } = await supabase
      .from('information_schema.tables')
      .select('table_name')
      .eq('table_schema', 'public');
    if (!error && Array.isArray(data)) {
      return data.map(r => r.table_name);
    }
  } catch (_) { /* fall through */ }

  // 3) Last-resort env-driven override
  if (process.env.SUPABASE_BACKUP_TABLES) {
    return process.env.SUPABASE_BACKUP_TABLES.split(',').map(s => s.trim()).filter(Boolean);
  }

  throw new Error(
    'Cannot enumerate tables. Create RPC `list_public_tables()` returning ' +
    'SETOF text of public tables, or set SUPABASE_BACKUP_TABLES="t1,t2,..." in env.'
  );
}

async function countRows(supabase, table) {
  const { count, error } = await supabase.from(table).select('*', { count: 'exact', head: true });
  if (error) throw new Error(`count(${table}): ${error.message}`);
  return count || 0;
}

async function dumpTable(supabase, table, outPath, pageSize = 1000) {
  // Stream rows in pages to a JSONL file. Returns { rows, bytes, sha256 }.
  const fd = fs.openSync(outPath, 'w');
  const hash = crypto.createHash('sha256');
  let rows = 0;
  let bytes = 0;
  let from = 0;

  try {
    // eslint-disable-next-line no-constant-condition
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

// ---------- PURE-JS TAR (ustar) ENCODER ----------
//
// Writes files into a Writable stream using classic ustar format. Only regular
// files and directories are supported, which is all we need. The archive is
// then piped through gzip. This keeps the dependency set to Node core only.

function padOctal(num, size) {
  const s = num.toString(8);
  if (s.length >= size) return s.slice(-size).padStart(size, '0');
  return s.padStart(size - 1, '0') + '\0';
}

function padString(str, size) {
  const buf = Buffer.alloc(size, 0);
  buf.write(str.slice(0, size), 'utf8');
  return buf;
}

function tarHeader({ name, size, mode = 0o644, mtime = Math.floor(Date.now() / 1000), type = '0' }) {
  const header = Buffer.alloc(512, 0);
  padString(name, 100).copy(header, 0);
  Buffer.from(padOctal(mode, 8), 'utf8').copy(header, 100);
  Buffer.from(padOctal(0, 8), 'utf8').copy(header, 108);   // uid
  Buffer.from(padOctal(0, 8), 'utf8').copy(header, 116);   // gid
  Buffer.from(padOctal(size, 12), 'utf8').copy(header, 124);
  Buffer.from(padOctal(mtime, 12), 'utf8').copy(header, 136);
  // checksum placeholder — 8 spaces
  Buffer.from('        ', 'utf8').copy(header, 148);
  header[156] = type.charCodeAt(0);
  padString('ustar', 6).copy(header, 257);
  header.write('00', 263, 2, 'utf8');
  // compute checksum
  let sum = 0;
  for (let i = 0; i < 512; i++) sum += header[i];
  Buffer.from(padOctal(sum, 8), 'utf8').copy(header, 148);
  return header;
}

function writeTarGz(srcDir, outFile) {
  return new Promise((resolve, reject) => {
    const gzip = zlib.createGzip({ level: 9 });
    const out = fs.createWriteStream(outFile);
    let errored = false;

    gzip.on('error', err => { errored = true; reject(err); });
    out.on('error', err => { errored = true; reject(err); });
    out.on('finish', () => { if (!errored) resolve(); });

    pipeline(gzip, out, err => { if (err && !errored) { errored = true; reject(err); } });

    const baseName = path.basename(srcDir);

    function walk(dir, prefix) {
      const entries = fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
      for (const e of entries) {
        const full = path.join(dir, e.name);
        const entryName = prefix ? `${prefix}/${e.name}` : e.name;
        if (e.isDirectory()) {
          gzip.write(tarHeader({ name: entryName + '/', size: 0, type: '5', mode: 0o755 }));
          walk(full, entryName);
        } else if (e.isFile()) {
          const stat = fs.statSync(full);
          gzip.write(tarHeader({
            name: entryName,
            size: stat.size,
            mtime: Math.floor(stat.mtimeMs / 1000),
          }));
          const content = fs.readFileSync(full);
          gzip.write(content);
          const pad = (512 - (content.length % 512)) % 512;
          if (pad) gzip.write(Buffer.alloc(pad, 0));
        }
      }
    }

    try {
      // top-level directory entry
      gzip.write(tarHeader({ name: baseName + '/', size: 0, type: '5', mode: 0o755 }));
      walk(srcDir, baseName);
      // two 512-byte zero blocks mark end of archive
      gzip.write(Buffer.alloc(1024, 0));
      gzip.end();
    } catch (err) {
      errored = true;
      reject(err);
    }
  });
}

// ---------- FS HELPERS ----------

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

function pruneOldBackups(rootDir, keepDays) {
  if (!fs.existsSync(rootDir)) return { removedDirs: 0, removedArchives: 0 };
  const cutoff = Date.now() - keepDays * 24 * 60 * 60 * 1000;
  let removedDirs = 0;
  let removedArchives = 0;
  const entries = fs.readdirSync(rootDir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(rootDir, e.name);
    // Only consider YYYY-MM-DD folders and YYYY-MM-DD.tar.gz files
    const dayMatch = e.name.match(/^(\d{4}-\d{2}-\d{2})(\.tar\.gz)?$/);
    if (!dayMatch) continue;
    const dayDate = Date.parse(dayMatch[1] + 'T00:00:00Z');
    if (Number.isNaN(dayDate)) continue;
    if (dayDate >= cutoff) continue;
    try {
      if (e.isDirectory()) {
        fs.rmSync(full, { recursive: true, force: true });
        removedDirs += 1;
      } else {
        fs.rmSync(full, { force: true });
        removedArchives += 1;
      }
    } catch (err) {
      console.warn(`[prune] could not remove ${full}: ${err.message}`);
    }
  }
  return { removedDirs, removedArchives };
}

// ---------- MAIN ----------

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) { printHelp(); process.exit(0); }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error('[backup] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
    process.exit(2);
  }

  const projectRoot = path.resolve(__dirname, '..');
  const backupRoot = path.resolve(args.output || path.join(projectRoot, 'backups'));
  ensureDir(backupRoot);

  const stamp = todayStamp();
  const dayDir = path.join(backupRoot, stamp);
  ensureDir(dayDir);

  const startedAt = new Date().toISOString();
  const startMs = Date.now();
  console.log(`[backup] start=${startedAt} url=${SUPABASE_URL} out=${dayDir}`);

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: 'public' },
  });

  // 1. Enumerate tables
  let tables;
  try {
    tables = args.tables && args.tables.length
      ? args.tables
      : await listPublicTables(supabase);
  } catch (err) {
    console.error(`[backup] cannot list tables: ${err.message}`);
    process.exit(3);
  }
  if (!tables.length) {
    console.error('[backup] no tables to back up.');
    process.exit(4);
  }
  console.log(`[backup] tables=${tables.length} (${tables.join(', ')})`);

  // 2. Dump each table
  const results = [];
  const skipped = [];
  let totalRows = 0;
  let totalBytes = 0;

  for (const table of tables) {
    try {
      const count = await countRows(supabase, table);
      if (args.fast && count > args.maxRows) {
        skipped.push({ table, rows: count, reason: `fast-mode over ${args.maxRows}` });
        console.log(`[backup] SKIP ${table} (${count} rows > ${args.maxRows})`);
        continue;
      }
      const outPath = path.join(dayDir, `${table}.jsonl`);
      const t0 = Date.now();
      const { rows, bytes, sha256 } = await dumpTable(supabase, table, outPath);
      const ms = Date.now() - t0;
      results.push({ table, rows, bytes, sha256, file: `${table}.jsonl`, ms });
      totalRows += rows;
      totalBytes += bytes;
      console.log(`[backup] OK  ${table}  rows=${rows}  size=${fmtBytes(bytes)}  ${ms}ms`);
    } catch (err) {
      console.error(`[backup] FAIL ${table}: ${err.message}`);
      process.exit(5);
    }
  }

  // 3. Manifest
  const endedAt = new Date().toISOString();
  const durationMs = Date.now() - startMs;
  const manifest = {
    version: 1,
    generator: 'onyx-procurement/scripts/backup.js',
    project_url: SUPABASE_URL,
    schema: 'public',
    date: stamp,
    started_at: startedAt,
    ended_at: endedAt,
    duration_ms: durationMs,
    table_count: results.length,
    total_rows: totalRows,
    total_bytes: totalBytes,
    fast_mode: args.fast,
    tables: results,
    skipped,
  };
  const manifestPath = path.join(dayDir, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
  // include the manifest itself in its own checksum sidecar
  const manifestSha = crypto.createHash('sha256').update(fs.readFileSync(manifestPath)).digest('hex');
  fs.writeFileSync(manifestPath + '.sha256', manifestSha + '  manifest.json\n', 'utf8');

  // 4. Gzip the whole day folder
  const archivePath = path.join(backupRoot, `${stamp}.tar.gz`);
  try {
    await writeTarGz(dayDir, archivePath);
  } catch (err) {
    console.error(`[backup] archive failed: ${err.message}`);
    process.exit(6);
  }
  const archiveSize = fs.statSync(archivePath).size;

  // 5. Retention
  const pruned = pruneOldBackups(backupRoot, args.keepDays);

  // 6. Summary
  const summary = {
    status: 'ok',
    project_url: SUPABASE_URL,
    started_at: startedAt,
    ended_at: endedAt,
    duration_ms: durationMs,
    day: stamp,
    day_folder: dayDir,
    archive: archivePath,
    archive_size: archiveSize,
    archive_size_human: fmtBytes(archiveSize),
    manifest: manifestPath,
    manifest_sha256: manifestSha,
    tables_backed_up: results.length,
    tables_skipped: skipped.length,
    total_rows: totalRows,
    total_bytes: totalBytes,
    total_bytes_human: fmtBytes(totalBytes),
    retention_keep_days: args.keepDays,
    pruned_day_dirs: pruned.removedDirs,
    pruned_archives: pruned.removedArchives,
  };
  console.log('[backup] SUMMARY ' + JSON.stringify(summary));
  process.exit(0);
}

main().catch(err => {
  console.error('[backup] fatal:', err && err.stack || err);
  process.exit(1);
});
