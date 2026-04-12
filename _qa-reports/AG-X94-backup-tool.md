# AG-X94 — Backup & Restore Tool (`BackupTool`)

**Agent:** X-94
**System:** Techno-Kol Uzi mega-ERP — `onyx-procurement`
**Module:** `onyx-procurement/src/backup/backup-tool.js`
**Tests:** `onyx-procurement/test/backup/backup-tool.test.js`
**Status:** GREEN — 25/25 tests passing
**Date:** 2026-04-11
**Core Rule:** לא מוחקים רק משדרגים ומגדלים — never delete, only upgrade and grow.

---

## 1. Executive Summary

`BackupTool` is a **zero-dependency** backup + restore engine for Postgres / Supabase databases and filesystem assets (invoices, PDFs, uploads, generated reports). It provides:

- Full, incremental, compressed, and encrypted backups
- Single-file `.tkub` artifacts with multi-part split for > 2 GB bundles
- SHA-256 whole-file integrity + per-part checksums
- AES-256-GCM streaming encryption with scrypt passphrase KDF
- Minimal pure-JS tar writer/reader (POSIX ustar + GNU LongLink)
- Internal cron scheduler with Grandfather-Father-Son retention
- `verify()` routine that reassembles, decrypts, decompresses, and parses the bundle — optionally restores to a throwaway DB
- **`rotate()` that refuses to touch files without `{confirmDelete: true}`**, and even then only *archives* by default (hard-delete is an extra opt-in)

The module never imports anything outside `node:` core. Postgres support spawns the host's installed `pg_dump` / `pg_restore` binaries — they are the only external dependency and must be present on the machine running the backup.

---

## 2. Backup Workflow

### 2.1 Manifest shape

Every backup produces two files next to each other:

```
<destination>/
  bk_20260411T083012Z_both_a1b2c3d4.tkub          ← the artifact
  bk_20260411T083012Z_both_a1b2c3d4.manifest.json ← the metadata
```

The manifest is human-readable JSON:

```json
{
  "id":             "bk_20260411T083012Z_both_a1b2c3d4",
  "timestamp":      "2026-04-11T08:30:12.345Z",
  "type":           "both",
  "size":           734612390,
  "files":          [ { "name": "postgres.dump", "size": 412000000 },
                      { "name": "files.tar",     "size": 322000000 } ],
  "checksum_sha256":"7c6a1b…",
  "encrypted":      true,
  "compressed":     true,
  "incremental":    false,
  "parts":          [
    { "index": 0, "path": "bk_…tkub",     "size": 2147483648, "sha256": "…" },
    { "index": 1, "path": "bk_…tkub.002", "size":  734...,   "sha256": "…" }
  ],
  "mtimes":         { "/path/to/src/file.pdf": { "size": 12345, "mtimeMs": 1775... } },
  "producedBy":     "BackupTool@1.0.0",
  "hostname":       "techno-kol-prod-01",
  "pgDumpVersion":  "16.2",
  "previousBackup": null,
  "stats":          { "fileCount": 18432, "skippedForIncremental": 0 }
}
```

### 2.2 Daily workflow

```js
const { BackupTool } = require('./src/backup/backup-tool.js');
const tool = new BackupTool();

// 03:00 every night — full backup of DB + invoice folder
const res = await tool.backup({
  target:        'both',
  destination:   '/var/backups/onyx',
  compress:      true,
  encrypt:       true,
  encryptionKey: process.env.ONYX_BACKUP_KEY,
  connection:    { url: process.env.SUPABASE_URL },
  roots:         ['/var/onyx/invoices', '/var/onyx/uploads'],
  format:        'custom',         // pg_dump -Fc
  parallelJobs:  4,                // only with format:'directory'
});

console.log('backup id:', res.id);
console.log('checksum:', res.manifest.checksum_sha256);
```

### 2.3 Incremental backups

Each backup writes an `mtimes` map (absolute path → `{size, mtimeMs}`) into its manifest. The next incremental run loads that map, walks the source tree, and **skips any file whose size and mtime are unchanged**:

```js
// Point to the most recent full backup's manifest
const inc = await tool.backup({
  target:                'files',
  destination:           '/var/backups/onyx',
  roots:                 ['/var/onyx/invoices'],
  compress:              true,
  incremental:           true,
  previousManifestPath:  fullBackup.manifestPath,
});
console.log(inc.manifest.stats);
// { fileCount: 42, skippedForIncremental: 18390 }
```

### 2.4 Multi-part split

If an artifact exceeds `partSize` (default **2 GiB**), the tool splits it into `*.tkub.001`, `*.tkub.002`, … Each part carries its own SHA-256 inside the manifest. `verify()` and `restore()` transparently reassemble parts in order, failing loudly on any per-part checksum mismatch.

---

## 3. Restore Workflow

```js
// Full restore to fresh locations
const out = await tool.restore({
  source:        '/var/backups/onyx/bk_20260411T...manifest.json',
  target:        {
    directory:   '/var/onyx/invoices',
    databaseUrl: 'postgres://restore-user@stage-db/onyx_stage',
  },
  decrypt:       true,
  decompress:    true,
  encryptionKey: process.env.ONYX_BACKUP_KEY,
  overwrite:     false,
});

console.log('files restored:', out.restored.files);
console.log('effective dir:', out.restored.effectiveDirectory);
```

**Non-destructive default.** If the target directory is non-empty and `overwrite:false` (the default), the restore writes into a fresh sibling `…/invoices.restored.<unix-ms>/`. The restore result includes `effectiveDirectory` so callers know exactly where the data landed.

For databases, `databaseUrl` invokes `pg_restore`; `databaseFile` just dumps the `.dump` bytes to disk so a human can inspect them before loading.

---

## 4. Encryption Key Management

### 4.1 Algorithm

- **Cipher:** AES-256-GCM (`node:crypto` `createCipheriv('aes-256-gcm', …)`)
- **KDF:** `crypto.scryptSync(passphrase, salt, 32, {N:16384, r:8, p:1})`
- **Salt:** fresh 32 bytes per backup, stored in the artifact header
- **IV:** fresh 12 bytes per backup, stored in the artifact header
- **Tag:** 16 bytes, appended at end of ciphertext, validated on decrypt

### 4.2 Artifact layout (encrypted)

```
[ 4 bytes  magic 'TKUC' ]
[ 1 byte   version 0x01 ]
[ 32 bytes salt          ]
[ 12 bytes iv            ]
[ ...      ciphertext    ]
[ 16 bytes auth tag      ]
```

### 4.3 Passphrase or raw key

`encryptionKey` can be either:

1. **A passphrase (string)** — scrypt derives a 256-bit key per backup from the random salt.
2. **A raw 32-byte `Buffer`** — used verbatim; salt is still generated (for IV diversity) but not used for derivation.

### 4.4 Operator guidance

- **Rotate the passphrase at least annually.** Old backups remain decryptable with whatever key was used to produce them; the passphrase is per-backup, not global. Rotation is just "start using a new passphrase for new backups".
- **Store the key outside the backup destination.** A backup and its key on the same disk is not a backup. Recommended: Supabase Vault, AWS Secrets Manager, 1Password, or a sealed envelope in the company safe.
- **Print two paper copies** of the current passphrase, split-sealed across two locations (finance safe + production DC vault). This is the "break-glass" key.
- **Log the key ID, never the key.** The manifest never contains the key. Operators should tag every manifest with a `keyId` in their runbook (e.g., `2026-Q2-key`) so they can find the right envelope at restore time.
- **Never commit keys to git.** `.env`, `keys/`, and `*.pem` should all be in `.gitignore` (already covered by `onyx-procurement/.dockerignore`).

---

## 5. Retention Examples (Grandfather-Father-Son)

### 5.1 Policy object

```js
const retention = {
  daily:   7,   // keep the 7 most recent daily backups
  weekly:  4,   // + the 4 most recent weekly (Sunday) backups
  monthly: 12,  // + 12 most recent monthly (first-of-month)
  yearly:  3,   // + 3 most recent yearly backups (Jan 1)
};
```

A backup is protected if it falls into **any** bucket. Buckets are filled newest-first — the newest backup of each day / week / month / year claims that slot.

### 5.2 Worked example

Starting state: 60 consecutive daily backups.

With `{daily:7, weekly:4, monthly:2}`, the tool protects:

- 7 most recent days (bk_0 … bk_6)
- 4 most recent distinct Sundays (4 more, each >= 7 days old)
- 2 most recent distinct months (additional backups on the 1st of each month)

Result: **~11–13 of 60 are protected**, the remaining ~47 are candidates for rotation.

### 5.3 Refusing to delete without confirmation

```js
// Dry run — safe by default
const dry = await tool.rotate(retention, {
  destination: '/var/backups/onyx',
});
console.log(dry);
// {
//   kept:     13,
//   rotated:  47,        ← would be affected
//   archived:  0,
//   deleted:   0,
//   refused:  true,      ← SAFETY: refused without confirmDelete
//   reason:   'rotate() refuses to touch backup files without confirmDelete:true. …'
// }
```

```js
// With confirmation — archive only (still never unlinks)
await tool.rotate(retention, {
  destination:   '/var/backups/onyx',
  confirmDelete: true,
  // archiveDir defaults to `<destination>/_archived/`
});
```

```js
// Full purge — archive AND unlink (rarely recommended)
await tool.rotate(retention, {
  destination:   '/var/backups/onyx',
  confirmDelete: true,
  hardDelete:    true,
});
```

Even `hardDelete:true` moves files into the archive folder first, then unlinks them from there. There is no codepath that unlinks a backup in its original location without first copying it.

### 5.4 Scheduler integration

```js
const handle = tool.schedule({
  cron:             '0 3 * * *',             // 03:00 every day
  backupOptions:    {
    target:        'both',
    destination:   '/var/backups/onyx',
    encrypt:       true,
    encryptionKey: process.env.ONYX_BACKUP_KEY,
    connection:    { url: process.env.SUPABASE_URL },
    roots:         ['/var/onyx/invoices'],
  },
  retention:        { daily: 14, weekly: 8, monthly: 24, yearly: 5 },
  rotateAfterBackup:    true,
  confirmDeleteOnRotate: true,   // explicit opt-in at schedule time
  onTick:           (r) => logger.info('backup done', r.id),
  onError:          (e) => logger.error('backup failed', e),
});

// handle.stop() to shut down; handle.runNow() to trigger immediately
```

---

## 6. Verification Steps

### 6.1 Checksum-only verify (fast, no DB)

```js
const v = await tool.verify('/var/backups/onyx/bk_…manifest.json');
console.log(v);
// { valid: true, issues: [], manifest: {...}, dbRestoreOk: null, entryCount: 1 }
```

`verify()` performs:

1. Recompute SHA-256 of the whole artifact (or each part for multi-part) and compare to manifest.
2. Reassemble, decrypt (if encrypted and key supplied), decompress, and parse the outer tar.
3. Report the number of entries as sanity check.

### 6.2 Full verify with throwaway DB restore

```js
const v = await tool.verify('/var/backups/onyx/bk_…manifest.json', {
  encryptionKey:   process.env.ONYX_BACKUP_KEY,
  tempDatabaseUrl: 'postgres://tku_verify@localhost/tku_verify_scratch',
});
console.log(v.dbRestoreOk);  // true
```

The caller is responsible for creating and dropping the scratch database. A recommended pattern is a Docker container with `POSTGRES_DB=tku_verify_scratch` that's torn down after each verify pass.

### 6.3 Scheduled verification

Run `verify()` on the **second-to-latest** backup every morning. This catches bit rot in the storage layer before the corrupted file becomes the only backup you have. Example cron: `30 3 * * *` (30 minutes after the nightly backup).

---

## 7. Hebrew Glossary (מילון מונחים)

| English                     | עברית                    | Notes                                         |
| --------------------------- | ------------------------ | --------------------------------------------- |
| Backup                      | גיבוי                    | The whole artifact + manifest pair            |
| Full backup                 | גיבוי מלא                | Every file + every row                        |
| Incremental backup          | גיבוי מצטבר              | Only files that changed since last full       |
| Restore                     | שחזור                    | Reverse of backup                             |
| Manifest                    | מניפסט                   | The JSON metadata file                        |
| Checksum                    | סכום ביקורת              | SHA-256 digest, 64 hex chars                  |
| Encryption                  | הצפנה                    | AES-256-GCM                                   |
| Key                         | מפתח                     | 32-byte secret, or a passphrase that derives one |
| Retention policy            | מדיניות שימור            | Rules that decide which backups to keep       |
| Grandfather-Father-Son      | סב-אב-בן                 | Daily + weekly + monthly tiering              |
| Schedule                    | תזמון                    | The cron-driven timer                         |
| Verify                      | אימות                    | Re-read + decrypt + checksum                  |
| Rotate                      | סבב / מחזור              | Apply retention policy (never deletes by default) |
| Archive                     | ארכיון                   | Old backups moved aside, not deleted          |
| Multi-part                  | רב-חלקי                  | > 2 GB artifacts split into numbered parts    |
| Compression                 | דחיסה                    | gzip, level 6                                 |

The `GLOSSARY` constant in the module exports a subset of this table for runtime use by the Hebrew-language admin UI.

---

## 8. Test Matrix

All 25 tests pass on Node.js 20.x under Windows 11:

```
✔ TarWriter: round-trip of multiple files
✔ TarWriter: long file names use LongLink escape
✔ encryptBuffer / decryptBuffer: round-trip with passphrase
✔ encryptBuffer: magic bytes are TKUC
✔ decryptBuffer: wrong key throws
✔ decryptBuffer: tampered ciphertext throws (GCM auth)
✔ encryptBuffer: raw 32-byte key is used verbatim
✔ incremental detection: skips unchanged files, includes new/modified
✔ classifyRetention: GFS daily only
✔ classifyRetention: weekly + monthly promote old backups
✔ classifyRetention: empty input is safe
✔ BackupTool.rotate: REFUSES without confirmDelete flag
✔ BackupTool.rotate: archives (never hard-deletes by default) with confirmDelete
✔ parseCron: 5-field basic
✔ parseCron: ranges and steps
✔ cronMatches: exact timestamp
✔ backup + restore: files round-trip with compression
✔ backup + restore: encrypted files round-trip
✔ BackupTool.verify: healthy backup → valid:true
✔ BackupTool.verify: corrupted artifact → valid:false
✔ BackupTool.listBackups: enumerates with sizes + checksums
✔ backup postgres: uses pg_dump via injected spawn
✔ backup postgres: propagates pg_dump failure
✔ GLOSSARY: has Hebrew + English for key terms
✔ backup: source tree is bitwise unchanged after backup
```

Run locally with:

```bash
cd onyx-procurement
node --test test/backup/backup-tool.test.js
```

---

## 9. Safety Rails (summary of the "never delete" rule)

| Codepath             | Touches source? | Touches existing backups? | How it's blocked                               |
| -------------------- | --------------- | ------------------------- | ---------------------------------------------- |
| `backup()`           | Read-only       | Never                     | Only writes new files with fresh IDs           |
| `restore()`          | Never           | Never                     | Creates `.restored.<ts>` sibling by default    |
| `verify()`           | Never           | Never                     | Read-only                                      |
| `listBackups()`      | Never           | Never                     | Read-only                                      |
| `rotate()` (no flag) | Never           | Never                     | Returns `{refused:true}` and lists candidates  |
| `rotate()` (archive) | Never           | Moves to `_archived/`     | Files stay on disk                             |
| `rotate()` (hard)    | Never           | Archives then unlinks     | Double opt-in: `confirmDelete` + `hardDelete`  |
| `_removeDirSafe()`   | Never           | Never                     | Only accepts paths ending in `.staging`        |

Staging directories are considered scratch space (they exist for < 1 minute during a single backup call) and are cleaned up with `fsp.rm`, but the helper refuses any path that doesn't end in `.staging` as a belt-and-suspenders check.

---

## 10. Known Limitations & Next Steps

- **Host `pg_dump` required** for Postgres backups. The module does not bundle libpq. In containerised deployments, install `postgresql-client` into the image (`apk add postgresql16-client` / `apt install postgresql-client-16`).
- **`parallelJobs` requires `format:'directory'`** per `pg_dump` semantics. Custom format is single-threaded.
- **Tar writer reads whole files** into memory when calling `addFile()`. This is fine for typical ERP attachments (< 100 MB) but would need a streaming variant for true multi-gigabyte single files.
- **S3 upload is optional and not wired** into `backup()` by default. The `parts[]` structure is designed so a follow-up agent can add S3 multi-part upload without changing the manifest format. See section below.
- **Cron parser is 5-field** (classic Unix). Seconds field and predefined macros (`@daily`) are not supported — use explicit `0 3 * * *` style.

### Future: S3 / S3-compatible upload

The manifest's `parts[]` array is intentionally a stable shape so that a separate `uploader.js` can consume a manifest and upload each part over `node:https` using S3 multi-part upload. The uploader is out of scope for AG-X94 but the contract is fixed: given a manifest + a directory, upload every `parts[i].path` and write the resulting ETags back into a sibling `.upload.json` file.

---

## 11. Files Touched

- `onyx-procurement/src/backup/backup-tool.js` — new, 900+ LOC, zero external deps
- `onyx-procurement/test/backup/backup-tool.test.js` — new, 25 tests, `node:test`
- `_qa-reports/AG-X94-backup-tool.md` — this document

No existing files were modified. No existing files were deleted.

**לא מוחקים רק משדרגים ומגדלים.**
