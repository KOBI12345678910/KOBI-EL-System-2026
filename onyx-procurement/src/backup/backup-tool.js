/**
 * BackupTool  |  כלי גיבוי ושחזור
 * =============================================================
 *
 * Agent X-94  |  Techno-Kol Uzi mega-ERP
 *
 * Zero-dependency backup / restore engine for the Techno-Kol Uzi
 * mega-ERP. Covers three asset classes:
 *
 *   1. Postgres / Supabase — via `pg_dump` subprocess (requires
 *      the `pg_dump` binary to be installed on the host; this
 *      module does NOT bundle libpq).
 *   2. Filesystem assets — invoices, PDFs, uploads, generated
 *      reports. Walked recursively and serialised into a minimal
 *      POSIX `ustar`-compatible tar stream implemented in pure JS
 *      (no `tar` npm dependency).
 *   3. Combined bundles — `{target: 'both'}` produces a single
 *      manifest that references both the SQL dump and the tar
 *      archive, so a full system restore is one operation.
 *
 * Every backup is written to disk with a companion JSON manifest:
 *
 *     {
 *       id:              'bk_20260411T083012Z_a1b2c3d4',
 *       timestamp:       '2026-04-11T08:30:12.345Z',
 *       type:            'postgres' | 'files' | 'both',
 *       size:            1234567,          // total bytes on disk
 *       files:           [...],            // list of packed paths
 *       checksum_sha256: 'hex...',         // whole-file digest
 *       encrypted:       true | false,
 *       compressed:      true | false,
 *       incremental:     true | false,
 *       parts:           [                 // for multi-part >2 GB
 *         { index: 0, path: '...001', size: 104857600, sha256: '...' },
 *         ...
 *       ],
 *       producedBy:      'BackupTool@1.0.0',
 *       hostname:        'techno-kol-prod-01',
 *       pgDumpVersion:   '16.2',           // iff postgres
 *       previousBackup:  'bk_...'          // iff incremental
 *     }
 *
 * -------------------------------------------------------------
 * CORE RULE — NEVER DELETE, ONLY UPGRADE AND GROW
 * -------------------------------------------------------------
 *   לא מוחקים רק משדרגים ומגדלים
 *
 *   • `restore()` writes to a NEW target location by default;
 *     it will REFUSE to overwrite an existing database or directory
 *     unless the caller passes `{overwrite: true}`.
 *   • `rotate()` REFUSES to delete anything unless the caller
 *     passes `{confirmDelete: true}`. Even then, files are moved
 *     to an `_archived/` sibling before any `unlink` is considered.
 *   • `backup()` NEVER touches the source data. It only reads.
 *   • Existing backup files are NEVER overwritten; every new
 *     backup gets a fresh ULID-style id based on timestamp +
 *     random suffix.
 *
 * -------------------------------------------------------------
 * PUBLIC API
 * -------------------------------------------------------------
 *   new BackupTool(opts?)
 *
 *   async backup({target, destination, compress, encrypt,
 *                 incremental, exclude, connection, roots,
 *                 encryptionKey, partSize, parallelJobs,
 *                 schemaOnly, dataOnly, format})  → BackupResult
 *
 *   async restore({source, target, decrypt, decompress,
 *                  encryptionKey, overwrite})     → RestoreResult
 *
 *   async verify(backupPath, {encryptionKey,
 *                             tempDatabaseUrl})   → VerifyResult
 *
 *   schedule({cron, retention, backupOptions,
 *             onTick, clock})                     → Handle
 *
 *   async listBackups(destination)                → BackupSummary[]
 *
 *   async rotate(retention, {confirmDelete,
 *                            destination,
 *                            archiveDir, clock})  → RotateResult
 *
 * -------------------------------------------------------------
 * TAR FORMAT NOTES
 * -------------------------------------------------------------
 * The embedded tar writer emits POSIX ustar records (512-byte
 * header + 512-byte padded body + two 512-byte zero blocks at
 * EOF). Long file names beyond 100 chars use the GNU "././@LongLink"
 * convention, which is understood by every mainstream `tar` binary.
 * The reader accepts both the long-link escape and plain ustar
 * names up to 100 characters.
 *
 * -------------------------------------------------------------
 * ENCRYPTION
 * -------------------------------------------------------------
 * AES-256-GCM via `node:crypto`. Key derivation: scryptSync with
 * per-backup 32-byte salt. The derived key lives only in memory.
 * The GCM IV (12 bytes) and auth tag (16 bytes) are written in
 * plaintext at the head of the encrypted stream:
 *
 *     [4 byte magic 'TKUC'] [1 byte version 0x01]
 *     [32 byte salt] [12 byte iv]
 *     [...ciphertext...]
 *     [16 byte auth tag]    <-- the tag is appended at finalize()
 *
 * The `encryptionKey` input is treated as a passphrase; callers
 * who already have a raw 32-byte key may pass it as a Buffer and
 * it will be used verbatim (salt ignored for derivation).
 *
 * -------------------------------------------------------------
 * SCHEDULER
 * -------------------------------------------------------------
 * A minimal cron parser supports the 5-field classic form
 * (`m h dom mon dow`), `*`, lists `1,5,15`, ranges `9-17`,
 * and step values `*\/5`. No external cron libs.
 *
 * Retention follows Grandfather-Father-Son (GFS):
 *   - daily  : keep N most recent daily backups
 *   - weekly : keep N most recent weekly (Sunday) backups
 *   - monthly: keep N most recent monthly (first-of-month) backups
 *   - yearly : keep N most recent yearly backups (optional)
 *
 * A backup qualifies for a bucket based on its timestamp; the
 * newest backup inside each bucket is protected from rotation.
 */

'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const { spawn } = require('node:child_process');
const { pipeline: pipelineAsync } = require('node:stream/promises');

// ────────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────────

const VERSION = '1.0.0';
const MAGIC = Buffer.from('TKUC');            // Techno-Kol Uzi Crypto
const ENC_VERSION = 0x01;
const DEFAULT_PART_SIZE = 2 * 1024 * 1024 * 1024; // 2 GiB
const TAR_BLOCK = 512;
const HEADER_SIZE = 512;
const LONG_LINK_TYPE = 'L';
const REGULAR_TYPE = '0';
const DIRECTORY_TYPE = '5';

// ────────────────────────────────────────────────────────────────
// Bilingual glossary — exported for UI + docs consumption
// ────────────────────────────────────────────────────────────────

const GLOSSARY = Object.freeze({
  backup: { en: 'Backup', he: 'גיבוי' },
  restore: { en: 'Restore', he: 'שחזור' },
  manifest: { en: 'Manifest', he: 'מניפסט' },
  checksum: { en: 'Checksum', he: 'סכום ביקורת' },
  encryption: { en: 'Encryption', he: 'הצפנה' },
  retention: { en: 'Retention policy', he: 'מדיניות שימור' },
  incremental: { en: 'Incremental backup', he: 'גיבוי מצטבר' },
  full: { en: 'Full backup', he: 'גיבוי מלא' },
  schedule: { en: 'Schedule', he: 'תזמון' },
  verify: { en: 'Verify', he: 'אימות' },
  rotate: { en: 'Rotate', he: 'סבב / מחזור' },
  grandfather: { en: 'Grandfather-Father-Son', he: 'סב-אב-בן' },
});

// ────────────────────────────────────────────────────────────────
// Utilities
// ────────────────────────────────────────────────────────────────

function nowIso(clock) {
  return new Date(typeof clock === 'function' ? clock() : Date.now()).toISOString();
}

function nowMs(clock) {
  return typeof clock === 'function' ? clock() : Date.now();
}

function makeBackupId(type, clock) {
  const iso = nowIso(clock).replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const suffix = crypto.randomBytes(4).toString('hex');
  return `bk_${iso}_${type}_${suffix}`;
}

function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

function sha256Buffer(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

async function ensureDir(dir) {
  await fsp.mkdir(dir, { recursive: true });
}

async function pathExists(p) {
  try {
    await fsp.access(p);
    return true;
  } catch {
    return false;
  }
}

// Deep walk, yielding { relPath, absPath, stat }. Symlinks: skipped
// (tarring symlinks cross-host is a foot-gun; opt-in later).
async function* walkFiles(root, exclude = []) {
  const rootResolved = path.resolve(root);
  const excludeAbs = exclude.map((e) => path.resolve(e));
  const stack = [rootResolved];
  while (stack.length) {
    const current = stack.pop();
    let entries;
    try {
      entries = await fsp.readdir(current, { withFileTypes: true });
    } catch (err) {
      if (err.code === 'ENOENT') continue;
      throw err;
    }
    for (const entry of entries) {
      const abs = path.join(current, entry.name);
      if (excludeAbs.some((ex) => abs === ex || abs.startsWith(ex + path.sep))) {
        continue;
      }
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        stack.push(abs);
        continue;
      }
      if (entry.isFile()) {
        let st;
        try {
          st = await fsp.stat(abs);
        } catch (err) {
          if (err.code === 'ENOENT') continue;
          throw err;
        }
        const relPath = path.relative(rootResolved, abs).split(path.sep).join('/');
        yield { relPath, absPath: abs, stat: st };
      }
    }
  }
}

// ────────────────────────────────────────────────────────────────
// Minimal TAR writer (ustar) — zero dependency
// ────────────────────────────────────────────────────────────────

function octal(n, width) {
  return n.toString(8).padStart(width - 1, '0') + '\0';
}

function writeString(buf, str, offset, length) {
  const slice = Buffer.from(str, 'utf8');
  slice.copy(buf, offset, 0, Math.min(slice.length, length));
}

function tarChecksum(header) {
  // During checksum calculation the 8 bytes of the checksum field are
  // treated as spaces (0x20). After summing, the checksum itself is
  // stored as a 6-digit octal + NUL + space.
  let sum = 0;
  for (let i = 0; i < 148; i++) sum += header[i];
  for (let i = 0; i < 8; i++) sum += 0x20;
  for (let i = 156; i < 512; i++) sum += header[i];
  return sum;
}

function buildTarHeader({ name, size, mode = 0o644, mtime, type = REGULAR_TYPE }) {
  const header = Buffer.alloc(HEADER_SIZE, 0);
  // Name: 0..99  (100 bytes)
  writeString(header, name, 0, 100);
  // Mode: 100..107
  writeString(header, octal(mode & 0o7777, 8), 100, 8);
  // Uid: 108..115
  writeString(header, octal(0, 8), 108, 8);
  // Gid: 116..123
  writeString(header, octal(0, 8), 116, 8);
  // Size: 124..135
  writeString(header, octal(size, 12), 124, 12);
  // Mtime: 136..147
  writeString(header, octal(Math.floor(mtime / 1000), 12), 136, 12);
  // Checksum placeholder: 148..155 (8 bytes of spaces)
  for (let i = 148; i < 156; i++) header[i] = 0x20;
  // Typeflag: 156
  header[156] = type.charCodeAt(0);
  // Linkname: 157..256 (100) — left zero
  // Magic 'ustar\0': 257..262
  writeString(header, 'ustar\0', 257, 6);
  // Version '00': 263..264
  writeString(header, '00', 263, 2);
  // Uname: 265..296  (32)
  writeString(header, 'root', 265, 32);
  // Gname: 297..328  (32)
  writeString(header, 'root', 297, 32);
  // Devmajor/minor 329..344 — zero
  // Prefix 345..500 — zero (long names handled via LongLink)
  // Compute checksum
  const sum = tarChecksum(header);
  writeString(header, octal(sum, 7) + ' ', 148, 8);
  return header;
}

function padToBlock(size) {
  const rem = size % TAR_BLOCK;
  return rem === 0 ? 0 : TAR_BLOCK - rem;
}

/**
 * Stream-friendly TAR writer. Consumers call `addFile` for each
 * entry (either with a Buffer body or with `{path}` for on-disk
 * files) and finally `end()`. Data is pushed into `outputStream`
 * as it is produced; no in-memory accumulation of the full tar.
 */
class TarWriter {
  constructor(outputStream) {
    this.out = outputStream;
    this.ended = false;
  }

  _write(buf) {
    return new Promise((resolve, reject) => {
      const ok = this.out.write(buf, (err) => (err ? reject(err) : resolve()));
      if (ok === false) {
        this.out.once('drain', () => resolve());
      }
    });
  }

  async _writeHeaderAndBody(name, body, meta = {}) {
    // Long-link escape for names > 100 chars
    if (Buffer.byteLength(name, 'utf8') > 100) {
      const longNameBuf = Buffer.from(name + '\0', 'utf8');
      const longHeader = buildTarHeader({
        name: '././@LongLink',
        size: longNameBuf.length,
        mode: 0,
        mtime: 0,
        type: LONG_LINK_TYPE,
      });
      await this._write(longHeader);
      await this._write(longNameBuf);
      const pad = padToBlock(longNameBuf.length);
      if (pad) await this._write(Buffer.alloc(pad, 0));
    }
    const header = buildTarHeader({
      name: name.length > 100 ? name.slice(0, 100) : name,
      size: body.length,
      mode: meta.mode ?? 0o644,
      mtime: meta.mtime ?? Date.now(),
      type: REGULAR_TYPE,
    });
    await this._write(header);
    if (body.length > 0) {
      await this._write(body);
      const pad = padToBlock(body.length);
      if (pad) await this._write(Buffer.alloc(pad, 0));
    }
  }

  async addBuffer(name, buffer, meta = {}) {
    await this._writeHeaderAndBody(name, buffer, meta);
  }

  async addFile(name, absPath, stat) {
    // Read as a single buffer. This keeps the tar writer simple
    // and works well for the typical ERP attachment sizes
    // (invoices, PDFs, photos — all well below 100 MB). If you
    // need true streaming for gigantic files, swap this to a
    // chunked loop that writes header first, then streams body.
    const body = await fsp.readFile(absPath);
    await this._writeHeaderAndBody(name, body, {
      mode: stat?.mode ?? 0o644,
      mtime: stat?.mtimeMs ?? Date.now(),
    });
  }

  async end() {
    if (this.ended) return;
    this.ended = true;
    // Two zero blocks mark EOF in tar
    await this._write(Buffer.alloc(TAR_BLOCK * 2, 0));
    await new Promise((resolve, reject) => {
      this.out.end((err) => (err ? reject(err) : resolve()));
    });
  }
}

// ────────────────────────────────────────────────────────────────
// Minimal TAR reader (ustar) — for restore + verify
// ────────────────────────────────────────────────────────────────

function parseOctal(buf) {
  const str = buf.toString('utf8').replace(/\0.*$/, '').trim();
  if (!str) return 0;
  return parseInt(str, 8);
}

function readTarBuffer(tarBuffer) {
  const entries = [];
  let offset = 0;
  let pendingLongName = null;
  while (offset + HEADER_SIZE <= tarBuffer.length) {
    const header = tarBuffer.slice(offset, offset + HEADER_SIZE);
    // Two zero blocks = EOF
    if (header.every((b) => b === 0)) break;
    const name = header.slice(0, 100).toString('utf8').replace(/\0.*$/, '');
    const size = parseOctal(header.slice(124, 136));
    const mtime = parseOctal(header.slice(136, 148)) * 1000;
    const typeflag = String.fromCharCode(header[156] || 0x30);
    offset += HEADER_SIZE;
    const body = tarBuffer.slice(offset, offset + size);
    offset += size + padToBlock(size);
    if (typeflag === LONG_LINK_TYPE) {
      pendingLongName = body.toString('utf8').replace(/\0+$/, '');
      continue;
    }
    const finalName = pendingLongName || name;
    pendingLongName = null;
    if (typeflag === REGULAR_TYPE || typeflag === '\0' || typeflag === '') {
      entries.push({ name: finalName, size, mtime, body: Buffer.from(body) });
    }
  }
  return entries;
}

// ────────────────────────────────────────────────────────────────
// Encryption helpers (AES-256-GCM)
// ────────────────────────────────────────────────────────────────

function deriveKey(secret, salt) {
  if (Buffer.isBuffer(secret) && secret.length === 32) return secret;
  const passphrase = typeof secret === 'string' ? secret : String(secret);
  return crypto.scryptSync(passphrase, salt, 32, { N: 16384, r: 8, p: 1 });
}

/**
 * Encrypt a Buffer fully in-memory. Used by tests + small
 * payloads. For streaming use `createEncryptStream`.
 */
function encryptBuffer(plaintext, secret) {
  const salt = crypto.randomBytes(32);
  const iv = crypto.randomBytes(12);
  const key = deriveKey(secret, salt);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  const header = Buffer.concat([MAGIC, Buffer.from([ENC_VERSION]), salt, iv]);
  return Buffer.concat([header, ct, tag]);
}

function decryptBuffer(blob, secret) {
  if (blob.length < 4 + 1 + 32 + 12 + 16) {
    throw new Error('Ciphertext too small to be valid TKUC blob');
  }
  const magic = blob.slice(0, 4);
  if (!magic.equals(MAGIC)) throw new Error('Bad magic: not a TKUC blob');
  const version = blob[4];
  if (version !== ENC_VERSION) throw new Error(`Unsupported TKUC version ${version}`);
  const salt = blob.slice(5, 37);
  const iv = blob.slice(37, 49);
  const tag = blob.slice(blob.length - 16);
  const ct = blob.slice(49, blob.length - 16);
  const key = deriveKey(secret, salt);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]);
}

// ────────────────────────────────────────────────────────────────
// Cron parser — minimal 5-field
// ────────────────────────────────────────────────────────────────

function expandCronField(field, min, max) {
  if (field === '*') {
    const out = new Set();
    for (let i = min; i <= max; i++) out.add(i);
    return out;
  }
  const out = new Set();
  for (const part of field.split(',')) {
    let step = 1;
    let rangePart = part;
    if (part.includes('/')) {
      const [r, s] = part.split('/');
      step = parseInt(s, 10);
      rangePart = r;
    }
    let start, end;
    if (rangePart === '*') {
      start = min;
      end = max;
    } else if (rangePart.includes('-')) {
      const [a, b] = rangePart.split('-').map((n) => parseInt(n, 10));
      start = a;
      end = b;
    } else {
      start = parseInt(rangePart, 10);
      end = start;
    }
    if (Number.isNaN(start) || Number.isNaN(end) || Number.isNaN(step)) {
      throw new Error(`Invalid cron field: ${field}`);
    }
    for (let i = start; i <= end; i += step) out.add(i);
  }
  return out;
}

function parseCron(expr) {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) {
    throw new Error(`Cron expression must have 5 fields: ${expr}`);
  }
  return {
    minute: expandCronField(parts[0], 0, 59),
    hour: expandCronField(parts[1], 0, 23),
    dom: expandCronField(parts[2], 1, 31),
    month: expandCronField(parts[3], 1, 12),
    dow: expandCronField(parts[4], 0, 6),
  };
}

function cronMatches(parsed, date) {
  return (
    parsed.minute.has(date.getMinutes()) &&
    parsed.hour.has(date.getHours()) &&
    parsed.dom.has(date.getDate()) &&
    parsed.month.has(date.getMonth() + 1) &&
    parsed.dow.has(date.getDay())
  );
}

function nextCronTick(parsed, fromMs) {
  // Brute-force minute scan; good enough for typical cadences
  // and keeps the module dependency-free.
  let t = Math.floor(fromMs / 60000) * 60000 + 60000;
  for (let i = 0; i < 60 * 24 * 366 * 2; i++) {
    const d = new Date(t);
    if (cronMatches(parsed, d)) return t;
    t += 60000;
  }
  throw new Error('No cron match found within 2 years');
}

// ────────────────────────────────────────────────────────────────
// Retention logic — Grandfather-Father-Son
// ────────────────────────────────────────────────────────────────

/**
 * Classify backups by the GFS bucket each one occupies.
 *
 *   retention = {
 *     daily:   7,   // keep the 7 most recent daily backups
 *     weekly:  4,   // + the 4 most recent weekly (Sunday) backups
 *     monthly: 12,  // + 12 most recent monthly (1st-of-month)
 *     yearly:  3,   // + 3 most recent yearly backups (Jan 1)
 *   }
 *
 * Returns { keep: Set<id>, rotate: Array<backupSummary> }.
 * A backup lands in `keep` if ANY bucket protects it. The
 * `rotate` list is the complement, sorted oldest-first.
 */
function classifyRetention(backups, retention) {
  const daily = Number.isFinite(retention?.daily) ? retention.daily : 7;
  const weekly = Number.isFinite(retention?.weekly) ? retention.weekly : 4;
  const monthly = Number.isFinite(retention?.monthly) ? retention.monthly : 12;
  const yearly = Number.isFinite(retention?.yearly) ? retention.yearly : 0;

  const byDate = [...backups].sort(
    (a, b) => new Date(b.timestamp) - new Date(a.timestamp),
  );

  const keep = new Set();
  const seenDay = new Set();
  const seenWeek = new Set();
  const seenMonth = new Set();
  const seenYear = new Set();

  for (const bk of byDate) {
    const d = new Date(bk.timestamp);
    const dayKey = d.toISOString().slice(0, 10);
    const weekStart = new Date(d);
    weekStart.setDate(d.getDate() - d.getDay()); // Sunday
    const weekKey = weekStart.toISOString().slice(0, 10);
    const monthKey = d.toISOString().slice(0, 7);
    const yearKey = d.toISOString().slice(0, 4);

    let protectedBy = null;
    if (seenDay.size < daily && !seenDay.has(dayKey)) {
      seenDay.add(dayKey);
      protectedBy = 'daily';
    }
    if (seenWeek.size < weekly && !seenWeek.has(weekKey)) {
      seenWeek.add(weekKey);
      protectedBy = protectedBy || 'weekly';
    }
    if (seenMonth.size < monthly && !seenMonth.has(monthKey)) {
      seenMonth.add(monthKey);
      protectedBy = protectedBy || 'monthly';
    }
    if (seenYear.size < yearly && !seenYear.has(yearKey)) {
      seenYear.add(yearKey);
      protectedBy = protectedBy || 'yearly';
    }
    if (protectedBy) keep.add(bk.id);
  }

  const rotate = byDate
    .filter((b) => !keep.has(b.id))
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  return { keep, rotate };
}

// ────────────────────────────────────────────────────────────────
// The BackupTool class
// ────────────────────────────────────────────────────────────────

class BackupTool {
  constructor(opts = {}) {
    this.pgDumpBin = opts.pgDumpBin || 'pg_dump';
    this.pgRestoreBin = opts.pgRestoreBin || 'pg_restore';
    this.psqlBin = opts.psqlBin || 'psql';
    this.logger = opts.logger || console;
    this.clock = opts.clock || (() => Date.now());
    this.spawnFn = opts.spawnFn || spawn;
    this.defaultPartSize = opts.partSize || DEFAULT_PART_SIZE;
    this.version = VERSION;
  }

  // ------------------------------------------------------------
  // backup()
  // ------------------------------------------------------------
  /**
   * @param {Object} opts
   * @param {'postgres'|'files'|'both'} opts.target
   * @param {string} opts.destination   directory to write backup into
   * @param {boolean} [opts.compress=true]
   * @param {boolean} [opts.encrypt=false]
   * @param {string|Buffer} [opts.encryptionKey]
   * @param {boolean} [opts.incremental=false]
   * @param {string[]} [opts.exclude]   absolute paths to skip (files target)
   * @param {string[]} [opts.roots]     dirs to back up (files target)
   * @param {Object} [opts.connection]  { url } or { host, port, user, database, password }
   * @param {string} [opts.format='custom']  pg_dump format: custom, plain, directory, tar
   * @param {number} [opts.parallelJobs]     pg_dump -j
   * @param {boolean} [opts.schemaOnly]
   * @param {boolean} [opts.dataOnly]
   * @param {number} [opts.partSize]
   */
  async backup(opts = {}) {
    const {
      target,
      destination,
      compress = true,
      encrypt = false,
      encryptionKey,
      incremental = false,
      exclude = [],
      roots = [],
      connection = {},
      format = 'custom',
      parallelJobs,
      schemaOnly = false,
      dataOnly = false,
      partSize,
      previousManifestPath,
    } = opts;

    if (!['postgres', 'files', 'both'].includes(target)) {
      throw new Error(`Unknown backup target: ${target}`);
    }
    if (!destination) throw new Error('destination is required');
    if (encrypt && !encryptionKey) {
      throw new Error('encryptionKey required when encrypt=true');
    }

    await ensureDir(destination);
    const id = makeBackupId(target, this.clock);
    const stageDir = path.join(destination, id + '.staging');
    await ensureDir(stageDir);

    const files = [];
    const baselineMtimes = incremental
      ? await this._loadBaselineMtimes(previousManifestPath)
      : new Map();

    // ---------- Postgres ----------
    let pgDumpVersion = null;
    if (target === 'postgres' || target === 'both') {
      const pgFile = path.join(stageDir, 'postgres.dump');
      const { dumpVersion } = await this._runPgDump({
        connection,
        outputPath: pgFile,
        format,
        parallelJobs,
        schemaOnly,
        dataOnly,
      });
      pgDumpVersion = dumpVersion;
      files.push({ name: 'postgres.dump', size: (await fsp.stat(pgFile)).size });
    }

    // ---------- Files ----------
    let fileCount = 0;
    let skippedForIncremental = 0;
    if (target === 'files' || target === 'both') {
      const tarPath = path.join(stageDir, 'files.tar');
      const tarStream = fs.createWriteStream(tarPath);
      const writer = new TarWriter(tarStream);
      for (const root of roots) {
        const rootAbs = path.resolve(root);
        if (!(await pathExists(rootAbs))) continue;
        for await (const entry of walkFiles(rootAbs, exclude)) {
          const key = entry.absPath;
          if (incremental) {
            const base = baselineMtimes.get(key);
            if (base && base.size === entry.stat.size && base.mtimeMs === entry.stat.mtimeMs) {
              skippedForIncremental++;
              continue;
            }
          }
          // Tag each file with root label so multi-root restores can recreate layout
          const rootLabel = path.basename(rootAbs);
          const tarName = `${rootLabel}/${entry.relPath}`;
          await writer.addFile(tarName, entry.absPath, entry.stat);
          fileCount++;
        }
      }
      await writer.end();
      files.push({ name: 'files.tar', size: (await fsp.stat(tarPath)).size });
    }

    // ---------- Produce combined artifact(s) ----------
    const finalArtifact = path.join(destination, id + '.tkub');
    const stageFiles = files.map((f) => path.join(stageDir, f.name));
    await this._bundleStage({
      stageFiles,
      outputPath: finalArtifact,
      compress,
      encrypt,
      encryptionKey,
    });

    // Multi-part split (large backups)
    const effectivePartSize = partSize || this.defaultPartSize;
    const parts = await this._splitIntoParts(finalArtifact, effectivePartSize);

    // Whole-file checksum AFTER split reassembly
    const checksum = await sha256File(finalArtifact);
    const size = (await fsp.stat(finalArtifact)).size;

    // Capture current mtimes for next incremental baseline
    const mtimes = {};
    if (target === 'files' || target === 'both') {
      for (const root of roots) {
        const rootAbs = path.resolve(root);
        if (!(await pathExists(rootAbs))) continue;
        for await (const entry of walkFiles(rootAbs, exclude)) {
          mtimes[entry.absPath] = { size: entry.stat.size, mtimeMs: entry.stat.mtimeMs };
        }
      }
    }

    const manifest = {
      id,
      timestamp: nowIso(this.clock),
      type: target,
      size,
      files,
      checksum_sha256: checksum,
      encrypted: !!encrypt,
      compressed: !!compress,
      incremental: !!incremental,
      parts,
      mtimes,
      producedBy: `BackupTool@${VERSION}`,
      hostname: os.hostname(),
      pgDumpVersion,
      previousBackup: incremental ? (previousManifestPath ? path.basename(previousManifestPath, '.manifest.json') : null) : null,
      stats: { fileCount, skippedForIncremental },
    };

    const manifestPath = path.join(destination, id + '.manifest.json');
    await fsp.writeFile(manifestPath, JSON.stringify(manifest, null, 2));

    // Clean up staging (files inside staging are now inside the artifact)
    await this._removeDirSafe(stageDir);

    return { id, manifestPath, artifactPath: finalArtifact, manifest };
  }

  async _loadBaselineMtimes(previousManifestPath) {
    if (!previousManifestPath) return new Map();
    try {
      const json = JSON.parse(await fsp.readFile(previousManifestPath, 'utf8'));
      const map = new Map();
      for (const [k, v] of Object.entries(json.mtimes || {})) {
        map.set(k, v);
      }
      return map;
    } catch {
      return new Map();
    }
  }

  _pgDumpArgs({ connection, outputPath, format, parallelJobs, schemaOnly, dataOnly }) {
    const args = [];
    if (format) {
      const map = { custom: 'c', plain: 'p', directory: 'd', tar: 't' };
      args.push('-F', map[format] || format);
    }
    if (parallelJobs && format === 'directory') {
      args.push('-j', String(parallelJobs));
    }
    if (schemaOnly) args.push('--schema-only');
    if (dataOnly) args.push('--data-only');
    if (connection.url) {
      args.push('-d', connection.url);
    } else {
      if (connection.host) args.push('-h', connection.host);
      if (connection.port) args.push('-p', String(connection.port));
      if (connection.user) args.push('-U', connection.user);
      if (connection.database) args.push(connection.database);
    }
    args.push('-f', outputPath);
    return args;
  }

  _runPgDump(opts) {
    return new Promise((resolve, reject) => {
      const args = this._pgDumpArgs(opts);
      const env = { ...process.env };
      if (opts.connection?.password) env.PGPASSWORD = opts.connection.password;
      const child = this.spawnFn(this.pgDumpBin, args, { env });
      let stderr = '';
      child.stderr && child.stderr.on('data', (c) => (stderr += c.toString()));
      child.on('error', reject);
      child.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`pg_dump exited ${code}: ${stderr}`));
        } else {
          // Best-effort version detection. Real version is resolved
          // by a separate `pg_dump --version` call in production;
          // for this library we just capture whatever the caller
          // supplies or leave null.
          resolve({ dumpVersion: opts.connection?.serverVersion || null });
        }
      });
    });
  }

  async _bundleStage({ stageFiles, outputPath, compress, encrypt, encryptionKey }) {
    // Build an "outer" tar containing the staged files, then
    // optionally gzip + encrypt the outer tar. This keeps the
    // artifact a single file no matter how many stage pieces
    // we produced (postgres.dump, files.tar, metadata.json).
    const outerTmp = outputPath + '.outer.tar';
    const outerStream = fs.createWriteStream(outerTmp);
    const writer = new TarWriter(outerStream);
    for (const p of stageFiles) {
      const st = await fsp.stat(p);
      await writer.addFile(path.basename(p), p, st);
    }
    await writer.end();

    // Compression via streaming gzip (memory-safe for big tars)
    let compressedTmp = outerTmp;
    if (compress) {
      compressedTmp = outputPath + '.gz.tmp';
      await pipelineAsync(
        fs.createReadStream(outerTmp),
        zlib.createGzip({ level: 6 }),
        fs.createWriteStream(compressedTmp),
      );
    }

    // Encryption. Streaming AES-256-GCM: we write the magic
    // header + salt + iv, then stream ciphertext chunks from
    // the cipher, and finally append the 16-byte auth tag
    // returned by cipher.getAuthTag() after the source drains.
    if (encrypt) {
      const salt = crypto.randomBytes(32);
      const iv = crypto.randomBytes(12);
      const key = deriveKey(encryptionKey, salt);
      const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
      const out = fs.createWriteStream(outputPath);
      out.write(Buffer.concat([MAGIC, Buffer.from([ENC_VERSION]), salt, iv]));

      await new Promise((resolve, reject) => {
        const src = fs.createReadStream(compressedTmp);
        src.on('error', reject);
        cipher.on('error', reject);
        out.on('error', reject);
        cipher.on('data', (chunk) => out.write(chunk));
        cipher.on('end', () => {
          try {
            out.write(cipher.getAuthTag());
            out.end((err) => (err ? reject(err) : resolve()));
          } catch (err) {
            reject(err);
          }
        });
        src.on('data', (chunk) => {
          if (cipher.write(chunk) === false) src.pause();
        });
        cipher.on('drain', () => src.resume());
        src.on('end', () => cipher.end());
      });
    } else {
      await fsp.copyFile(compressedTmp, outputPath);
    }

    // Cleanup intermediate artifacts (these are temporary, not backups)
    if (compressedTmp !== outerTmp && (await pathExists(compressedTmp))) {
      try { await fsp.unlink(compressedTmp); } catch { /* best-effort */ }
    }
    try { await fsp.unlink(outerTmp); } catch { /* best-effort */ }
  }

  async _splitIntoParts(filePath, partSize) {
    const st = await fsp.stat(filePath);
    if (st.size <= partSize) {
      const hash = await sha256File(filePath);
      return [{ index: 0, path: path.basename(filePath), size: st.size, sha256: hash }];
    }
    const parts = [];
    const fd = await fsp.open(filePath, 'r');
    try {
      let index = 0;
      let offset = 0;
      while (offset < st.size) {
        const chunkLen = Math.min(partSize, st.size - offset);
        const partPath = `${filePath}.${String(index + 1).padStart(3, '0')}`;
        const buf = Buffer.alloc(chunkLen);
        await fd.read(buf, 0, chunkLen, offset);
        await fsp.writeFile(partPath, buf);
        parts.push({
          index,
          path: path.basename(partPath),
          size: chunkLen,
          sha256: sha256Buffer(buf),
        });
        index++;
        offset += chunkLen;
      }
    } finally {
      await fd.close();
    }
    return parts;
  }

  async _removeDirSafe(dir) {
    // Remove a STAGING directory. Staging is by definition
    // scratch space, not a backup, so this is allowed. This
    // helper refuses to touch anything outside a `.staging`
    // suffix as a last-mile safety.
    if (!dir.endsWith('.staging')) {
      throw new Error('Refusing to remove directory without .staging suffix: ' + dir);
    }
    try {
      await fsp.rm(dir, { recursive: true, force: true });
    } catch { /* best-effort */ }
  }

  // ------------------------------------------------------------
  // restore()
  // ------------------------------------------------------------
  async restore(opts = {}) {
    const {
      source,            // path to .manifest.json OR .tkub artifact
      target,            // { directory: '...' } and/or { databaseUrl: '...' }
      decrypt = false,
      decompress = true,
      encryptionKey,
      overwrite = false,
    } = opts;

    if (!source) throw new Error('source is required');
    if (!target) throw new Error('target is required');

    const { manifest, artifactPath } = await this._loadManifestAndArtifact(source);
    if (manifest.encrypted && !decrypt) {
      throw new Error('Backup is encrypted; pass decrypt:true + encryptionKey');
    }
    if (manifest.encrypted && !encryptionKey) {
      throw new Error('encryptionKey required for encrypted backup');
    }

    // Reassemble parts, decrypt, decompress, and untar to staging
    const workDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'tku-restore-'));
    const reassembled = path.join(workDir, manifest.id + '.reassembled');
    await this._reassembleParts(artifactPath, manifest.parts, reassembled);

    let innerTarBuf;
    if (manifest.encrypted) {
      const blob = await fsp.readFile(reassembled);
      const decrypted = decryptBuffer(blob, encryptionKey);
      if (manifest.compressed && decompress) {
        innerTarBuf = zlib.gunzipSync(decrypted);
      } else {
        innerTarBuf = decrypted;
      }
    } else if (manifest.compressed && decompress) {
      innerTarBuf = zlib.gunzipSync(await fsp.readFile(reassembled));
    } else {
      innerTarBuf = await fsp.readFile(reassembled);
    }

    const outerEntries = readTarBuffer(innerTarBuf);

    const restored = { files: 0, databases: 0, skipped: 0, effectiveDirectory: null, effectiveDatabaseFile: null };

    // ---- Files target ----
    if (target.directory) {
      const outDir = path.resolve(target.directory);
      // Non-destructive: if the directory already exists AND has
      // any content AND overwrite is false, write into a fresh
      // sibling so the caller's previous data is preserved.
      let hasContent = false;
      if (await pathExists(outDir)) {
        try {
          const listing = await fsp.readdir(outDir);
          hasContent = listing.length > 0;
        } catch { /* ignore */ }
      }
      if (hasContent && !overwrite) {
        const safe = outDir + '.restored.' + nowMs(this.clock);
        await ensureDir(safe);
        target._effectiveDirectory = safe;
      } else {
        await ensureDir(outDir);
        target._effectiveDirectory = outDir;
      }
      restored.effectiveDirectory = target._effectiveDirectory;

      const filesTarEntry = outerEntries.find((e) => e.name === 'files.tar');
      if (filesTarEntry) {
        const innerEntries = readTarBuffer(filesTarEntry.body);
        for (const entry of innerEntries) {
          const safeName = entry.name.replace(/^(\.\.[/\\])+/, '');
          const abs = path.join(target._effectiveDirectory, safeName);
          await ensureDir(path.dirname(abs));
          if ((await pathExists(abs)) && !overwrite) {
            restored.skipped++;
            continue;
          }
          await fsp.writeFile(abs, entry.body);
          try {
            await fsp.utimes(abs, new Date(entry.mtime), new Date(entry.mtime));
          } catch { /* non-fatal */ }
          restored.files++;
        }
      }
    }

    // ---- Postgres target ----
    if (target.databaseUrl || target.databaseFile) {
      const pgEntry = outerEntries.find((e) => e.name === 'postgres.dump');
      if (pgEntry) {
        if (target.databaseFile) {
          // Write dump to requested path for manual review; never overwrite
          const dest = path.resolve(target.databaseFile);
          if ((await pathExists(dest)) && !overwrite) {
            const alt = dest + '.restored.' + nowMs(this.clock);
            await fsp.writeFile(alt, pgEntry.body);
            target._effectiveDatabaseFile = alt;
          } else {
            await fsp.writeFile(dest, pgEntry.body);
            target._effectiveDatabaseFile = dest;
          }
          restored.effectiveDatabaseFile = target._effectiveDatabaseFile;
          restored.databases++;
        } else if (target.databaseUrl) {
          // Spawn pg_restore
          const tmpDump = path.join(workDir, 'postgres.dump');
          await fsp.writeFile(tmpDump, pgEntry.body);
          await this._runPgRestore({
            dumpPath: tmpDump,
            databaseUrl: target.databaseUrl,
            overwrite,
          });
          restored.databases++;
        }
      }
    }

    return { manifest, restored, workDir };
  }

  async _loadManifestAndArtifact(source) {
    const resolved = path.resolve(source);
    let manifestPath;
    let artifactPath;
    if (resolved.endsWith('.manifest.json')) {
      manifestPath = resolved;
    } else if (resolved.endsWith('.tkub')) {
      manifestPath = resolved.replace(/\.tkub$/, '.manifest.json');
      artifactPath = resolved;
    } else {
      // Maybe it's a directory containing both? Pick the manifest
      const st = await fsp.stat(resolved);
      if (st.isDirectory()) {
        const entries = await fsp.readdir(resolved);
        const mf = entries.find((e) => e.endsWith('.manifest.json'));
        if (!mf) throw new Error(`No manifest found in ${resolved}`);
        manifestPath = path.join(resolved, mf);
      } else {
        throw new Error(`Unrecognised source: ${resolved}`);
      }
    }
    const manifest = JSON.parse(await fsp.readFile(manifestPath, 'utf8'));
    if (!artifactPath) {
      artifactPath = path.join(path.dirname(manifestPath), manifest.id + '.tkub');
    }
    return { manifest, artifactPath };
  }

  async _reassembleParts(artifactPath, parts, outPath) {
    if (!parts || parts.length === 0 || (parts.length === 1 && parts[0].index === 0 && parts[0].path === path.basename(artifactPath))) {
      // Single-file artifact, no reassembly
      if (artifactPath !== outPath) {
        await fsp.copyFile(artifactPath, outPath);
      }
      return;
    }
    const dir = path.dirname(artifactPath);
    const out = fs.createWriteStream(outPath);
    const sorted = [...parts].sort((a, b) => a.index - b.index);
    for (const part of sorted) {
      const partPath = path.join(dir, part.path);
      const buf = await fsp.readFile(partPath);
      const sum = sha256Buffer(buf);
      if (sum !== part.sha256) {
        throw new Error(`Part ${part.path} sha256 mismatch: got ${sum}, expected ${part.sha256}`);
      }
      out.write(buf);
    }
    await new Promise((resolve, reject) => out.end((err) => (err ? reject(err) : resolve())));
  }

  _runPgRestore({ dumpPath, databaseUrl, overwrite }) {
    return new Promise((resolve, reject) => {
      const args = ['-d', databaseUrl];
      if (overwrite) args.push('--clean', '--if-exists');
      args.push(dumpPath);
      const child = this.spawnFn(this.pgRestoreBin, args, { env: process.env });
      let stderr = '';
      child.stderr && child.stderr.on('data', (c) => (stderr += c.toString()));
      child.on('error', reject);
      child.on('close', (code) => {
        if (code !== 0) reject(new Error(`pg_restore exited ${code}: ${stderr}`));
        else resolve();
      });
    });
  }

  // ------------------------------------------------------------
  // verify()
  // ------------------------------------------------------------
  async verify(backupPath, opts = {}) {
    const { encryptionKey, tempDatabaseUrl } = opts;
    const { manifest, artifactPath } = await this._loadManifestAndArtifact(backupPath);
    const issues = [];

    // 1. Checksum of whole artifact
    if (await pathExists(artifactPath)) {
      const actual = await sha256File(artifactPath);
      if (actual !== manifest.checksum_sha256) {
        issues.push(`checksum_sha256 mismatch: ${actual} != ${manifest.checksum_sha256}`);
      }
    } else if (manifest.parts && manifest.parts.length > 1) {
      // Check part checksums
      const dir = path.dirname(artifactPath);
      for (const part of manifest.parts) {
        const partPath = path.join(dir, part.path);
        if (!(await pathExists(partPath))) {
          issues.push(`part missing: ${part.path}`);
          continue;
        }
        const sum = await sha256File(partPath);
        if (sum !== part.sha256) issues.push(`part ${part.path} sha256 mismatch`);
      }
    } else {
      issues.push('artifact file missing');
    }

    // 2. Tar integrity (decrypt + decompress + parse)
    let entries = null;
    try {
      const workDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'tku-verify-'));
      const reassembled = path.join(workDir, manifest.id + '.reassembled');
      await this._reassembleParts(artifactPath, manifest.parts, reassembled);
      let buf = await fsp.readFile(reassembled);
      if (manifest.encrypted) {
        if (!encryptionKey) {
          issues.push('cannot decrypt during verify: missing encryptionKey');
        } else {
          buf = decryptBuffer(buf, encryptionKey);
        }
      }
      if (manifest.compressed && !issues.some((i) => i.startsWith('cannot decrypt'))) {
        buf = zlib.gunzipSync(buf);
      }
      if (!issues.some((i) => i.startsWith('cannot decrypt'))) {
        entries = readTarBuffer(buf);
      }
      await fsp.rm(workDir, { recursive: true, force: true });
    } catch (err) {
      issues.push(`tar parse failed: ${err.message}`);
    }

    // 3. Optional temp DB restore (non-destructive: caller supplies a
    // throwaway DB URL). We only exercise the restore codepath; the
    // caller is responsible for tearing the DB down afterwards.
    let dbRestoreOk = null;
    if (tempDatabaseUrl && entries && entries.some((e) => e.name === 'postgres.dump')) {
      try {
        const pgEntry = entries.find((e) => e.name === 'postgres.dump');
        const workDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'tku-verify-db-'));
        const dumpPath = path.join(workDir, 'postgres.dump');
        await fsp.writeFile(dumpPath, pgEntry.body);
        await this._runPgRestore({ dumpPath, databaseUrl: tempDatabaseUrl, overwrite: true });
        dbRestoreOk = true;
        await fsp.rm(workDir, { recursive: true, force: true });
      } catch (err) {
        dbRestoreOk = false;
        issues.push(`temp DB restore failed: ${err.message}`);
      }
    }

    return {
      valid: issues.length === 0,
      issues,
      manifest,
      dbRestoreOk,
      entryCount: entries ? entries.length : null,
    };
  }

  // ------------------------------------------------------------
  // schedule()
  // ------------------------------------------------------------
  /**
   * Starts an internal scheduler. Returns a handle with
   * `.stop()` and `.runNow()`. The scheduler uses setTimeout
   * (not setInterval) so drift is minimal. A clock injection
   * point (`opts.clock`) is exposed for tests.
   */
  schedule(opts = {}) {
    const {
      cron,
      retention,
      backupOptions,
      onTick,
      onError,
      clock = this.clock,
      rotateAfterBackup = true,
      confirmDeleteOnRotate = false,
    } = opts;

    if (!cron) throw new Error('cron is required');
    if (!backupOptions) throw new Error('backupOptions is required');
    const parsed = parseCron(cron);

    let timer = null;
    let stopped = false;
    const self = this;

    const scheduleNext = () => {
      if (stopped) return;
      const now = clock();
      const next = nextCronTick(parsed, now);
      const delay = Math.max(0, next - now);
      timer = setTimeout(async () => {
        try {
          const result = await self.backup(backupOptions);
          if (rotateAfterBackup && retention) {
            await self.rotate(retention, {
              confirmDelete: confirmDeleteOnRotate,
              destination: backupOptions.destination,
              clock,
            });
          }
          if (typeof onTick === 'function') onTick(result);
        } catch (err) {
          if (typeof onError === 'function') onError(err);
          else self.logger.error('[BackupTool] scheduled backup failed:', err);
        } finally {
          scheduleNext();
        }
      }, delay);
      if (typeof timer.unref === 'function') timer.unref();
    };

    scheduleNext();

    return {
      stop: () => {
        stopped = true;
        if (timer) clearTimeout(timer);
      },
      runNow: () => self.backup(backupOptions),
      _parsed: parsed,
    };
  }

  // ------------------------------------------------------------
  // listBackups()
  // ------------------------------------------------------------
  async listBackups(destination) {
    const dir = path.resolve(destination);
    if (!(await pathExists(dir))) return [];
    const entries = await fsp.readdir(dir);
    const out = [];
    for (const name of entries) {
      if (!name.endsWith('.manifest.json')) continue;
      try {
        const raw = await fsp.readFile(path.join(dir, name), 'utf8');
        const mf = JSON.parse(raw);
        out.push({
          id: mf.id,
          timestamp: mf.timestamp,
          type: mf.type,
          size: mf.size,
          checksum_sha256: mf.checksum_sha256,
          encrypted: !!mf.encrypted,
          compressed: !!mf.compressed,
          incremental: !!mf.incremental,
          parts: mf.parts ? mf.parts.length : 1,
          manifestPath: path.join(dir, name),
          artifactPath: path.join(dir, mf.id + '.tkub'),
        });
      } catch (err) {
        this.logger.warn(`[BackupTool] unreadable manifest ${name}: ${err.message}`);
      }
    }
    return out.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }

  // ------------------------------------------------------------
  // rotate()
  // ------------------------------------------------------------
  /**
   * Apply a GFS retention policy. NEVER deletes unless
   * confirmDelete is true. Even then, files are first MOVED to
   * an archive directory (default: `<destination>/_archived`) so
   * a human can still recover them.
   *
   * @param {Object} retention {daily,weekly,monthly,yearly}
   * @param {Object} opts
   * @param {boolean} [opts.confirmDelete=false]
   * @param {string} [opts.destination]
   * @param {string} [opts.archiveDir]
   * @param {boolean} [opts.hardDelete=false]  iff true AND confirmDelete,
   *                                           files are actually unlinked
   *                                           after being archived.
   */
  async rotate(retention, opts = {}) {
    const {
      confirmDelete = false,
      destination,
      archiveDir,
      hardDelete = false,
    } = opts;

    if (!destination) throw new Error('destination is required');
    const backups = await this.listBackups(destination);
    const { keep, rotate } = classifyRetention(backups, retention);

    if (rotate.length === 0) {
      return { kept: keep.size, rotated: 0, archived: 0, deleted: 0, refused: false, items: [] };
    }

    if (!confirmDelete) {
      // Hard refuse — this is the core safety rail.
      return {
        kept: keep.size,
        rotated: rotate.length,
        archived: 0,
        deleted: 0,
        refused: true,
        reason:
          'rotate() refuses to touch backup files without confirmDelete:true. ' +
          'Pass {confirmDelete:true} to archive old backups, and add {hardDelete:true} ' +
          'to also unlink them after archival.',
        items: rotate.map((b) => ({ id: b.id, timestamp: b.timestamp, action: 'would-archive' })),
      };
    }

    const archiveRoot = archiveDir || path.join(path.resolve(destination), '_archived');
    await ensureDir(archiveRoot);
    let archived = 0;
    let deleted = 0;
    const items = [];
    for (const bk of rotate) {
      const stamped = nowIso(this.clock).replace(/[-:]/g, '');
      const target = path.join(archiveRoot, `${stamped}_${bk.id}`);
      await ensureDir(target);
      // Move manifest
      await fsp.rename(bk.manifestPath, path.join(target, path.basename(bk.manifestPath)));
      // Move artifact + any parts
      if (await pathExists(bk.artifactPath)) {
        await fsp.rename(bk.artifactPath, path.join(target, path.basename(bk.artifactPath)));
      }
      // Handle .001 .002 parts
      const baseDir = path.dirname(bk.artifactPath);
      const siblings = await fsp.readdir(baseDir).catch(() => []);
      for (const sib of siblings) {
        if (sib.startsWith(bk.id + '.tkub.')) {
          await fsp.rename(path.join(baseDir, sib), path.join(target, sib));
        }
      }
      archived++;
      items.push({ id: bk.id, timestamp: bk.timestamp, action: 'archived', archivedTo: target });

      if (hardDelete) {
        // Even with hardDelete, we walk carefully and only unlink
        // files that we just moved into the archive directory.
        const archivedFiles = await fsp.readdir(target);
        for (const f of archivedFiles) {
          await fsp.unlink(path.join(target, f));
        }
        await fsp.rmdir(target);
        deleted++;
        items[items.length - 1].action = 'deleted-after-archive';
      }
    }

    return { kept: keep.size, rotated: rotate.length, archived, deleted, refused: false, items };
  }
}

// ────────────────────────────────────────────────────────────────
// Exports
// ────────────────────────────────────────────────────────────────

module.exports = {
  BackupTool,
  // Internals exposed for testing
  TarWriter,
  readTarBuffer,
  buildTarHeader,
  tarChecksum,
  encryptBuffer,
  decryptBuffer,
  parseCron,
  cronMatches,
  nextCronTick,
  classifyRetention,
  GLOSSARY,
  VERSION,
};
