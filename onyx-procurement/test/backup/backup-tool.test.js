/**
 * BackupTool tests  |  בדיקות כלי הגיבוי
 * ========================================
 *
 * Agent X-94  |  Techno-Kol Uzi mega-ERP
 *
 * Uses only node:test + node:assert to stay in the zero-dep
 * philosophy of the rest of onyx-procurement. Run with:
 *
 *     node --test test/backup/backup-tool.test.js
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');

const {
  BackupTool,
  TarWriter,
  readTarBuffer,
  encryptBuffer,
  decryptBuffer,
  parseCron,
  cronMatches,
  classifyRetention,
  GLOSSARY,
} = require('../../src/backup/backup-tool.js');

// ────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────

async function makeTmpDir(label) {
  return await fsp.mkdtemp(path.join(os.tmpdir(), `tku-${label}-`));
}

async function writeTree(root, files) {
  for (const [rel, body] of Object.entries(files)) {
    const abs = path.join(root, rel);
    await fsp.mkdir(path.dirname(abs), { recursive: true });
    await fsp.writeFile(abs, body);
  }
}

function fakePgSpawn({ outputPath, payload, exitCode = 0 }) {
  return (bin, args) => {
    const fIdx = args.indexOf('-f');
    const outPath = fIdx >= 0 ? args[fIdx + 1] : outputPath;
    fs.writeFileSync(outPath, payload);
    const ee = new (require('node:events').EventEmitter)();
    ee.stderr = { on() {} };
    setImmediate(() => ee.emit('close', exitCode));
    return ee;
  };
}

// ────────────────────────────────────────────────────────────────
// 1. TAR writer round-trip
// ────────────────────────────────────────────────────────────────

test('TarWriter: round-trip of multiple files', async () => {
  const tmp = await makeTmpDir('tar-rt');
  const tarPath = path.join(tmp, 'out.tar');
  const stream = fs.createWriteStream(tarPath);
  const writer = new TarWriter(stream);
  await writer.addBuffer('hello.txt', Buffer.from('Shalom olam\n', 'utf8'));
  await writer.addBuffer('nested/dir/file.bin', Buffer.from([1, 2, 3, 4, 5]));
  await writer.addBuffer(
    'unicode-שם-קובץ.txt',
    Buffer.from('מסמך עברי', 'utf8'),
  );
  await writer.end();

  const buf = await fsp.readFile(tarPath);
  const entries = readTarBuffer(buf);

  assert.equal(entries.length, 3);
  assert.equal(entries[0].name, 'hello.txt');
  assert.equal(entries[0].body.toString('utf8'), 'Shalom olam\n');
  assert.equal(entries[1].name, 'nested/dir/file.bin');
  assert.deepEqual(Array.from(entries[1].body), [1, 2, 3, 4, 5]);
  assert.equal(entries[2].body.toString('utf8'), 'מסמך עברי');

  await fsp.rm(tmp, { recursive: true, force: true });
});

test('TarWriter: long file names use LongLink escape', async () => {
  const tmp = await makeTmpDir('tar-long');
  const tarPath = path.join(tmp, 'out.tar');
  const longName =
    'this/is/a/very/deeply/nested/path/that/exceeds/the/one-hundred-character/limit/for/standard/ustar/filenames/document-final-v2.pdf';
  assert.ok(longName.length > 100);

  const stream = fs.createWriteStream(tarPath);
  const writer = new TarWriter(stream);
  await writer.addBuffer(longName, Buffer.from('CONTENT'));
  await writer.end();

  const buf = await fsp.readFile(tarPath);
  const entries = readTarBuffer(buf);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].name, longName);
  assert.equal(entries[0].body.toString(), 'CONTENT');

  await fsp.rm(tmp, { recursive: true, force: true });
});

// ────────────────────────────────────────────────────────────────
// 2. Encryption round-trip
// ────────────────────────────────────────────────────────────────

test('encryptBuffer / decryptBuffer: round-trip with passphrase', () => {
  const plaintext = Buffer.from('The invoice total is 12,345.67 ILS', 'utf8');
  const blob = encryptBuffer(plaintext, 'correct horse battery staple');
  assert.notDeepEqual(blob, plaintext);
  const out = decryptBuffer(blob, 'correct horse battery staple');
  assert.deepEqual(out, plaintext);
});

test('encryptBuffer: magic bytes are TKUC', () => {
  const blob = encryptBuffer(Buffer.from('x'), 'pw');
  assert.equal(blob.slice(0, 4).toString('ascii'), 'TKUC');
  assert.equal(blob[4], 0x01); // version
});

test('decryptBuffer: wrong key throws', () => {
  const blob = encryptBuffer(Buffer.from('secret'), 'good-password');
  assert.throws(() => decryptBuffer(blob, 'bad-password'));
});

test('decryptBuffer: tampered ciphertext throws (GCM auth)', () => {
  const blob = encryptBuffer(Buffer.from('secret payload here'), 'pw');
  // Flip a byte somewhere in the middle
  blob[60] = blob[60] ^ 0xff;
  assert.throws(() => decryptBuffer(blob, 'pw'));
});

test('encryptBuffer: raw 32-byte key is used verbatim', () => {
  const key = crypto.randomBytes(32);
  const plaintext = Buffer.from('raw-key path');
  const blob = encryptBuffer(plaintext, key);
  const out = decryptBuffer(blob, key);
  assert.deepEqual(out, plaintext);
});

// ────────────────────────────────────────────────────────────────
// 3. Incremental detection (mtime + size)
// ────────────────────────────────────────────────────────────────

test('incremental detection: skips unchanged files, includes new/modified', async () => {
  const src = await makeTmpDir('inc-src');
  const dst = await makeTmpDir('inc-dst');

  await writeTree(src, {
    'a.txt': 'hello',
    'sub/b.txt': 'world',
    'sub/c.txt': 'stable',
  });

  const tool = new BackupTool({ logger: { warn() {}, error() {}, info() {} } });
  // First: full backup
  const full = await tool.backup({
    target: 'files',
    destination: dst,
    roots: [src],
    compress: false,
    encrypt: false,
  });
  assert.ok(full.manifest.stats.fileCount >= 3);
  assert.equal(full.manifest.stats.skippedForIncremental, 0);

  // Modify only a.txt, leave others untouched
  await new Promise((r) => setTimeout(r, 20));
  await fsp.writeFile(path.join(src, 'a.txt'), 'HELLO-CHANGED');
  // Add a brand-new file
  await fsp.writeFile(path.join(src, 'sub/d.txt'), 'new file');

  const inc = await tool.backup({
    target: 'files',
    destination: dst,
    roots: [src],
    compress: false,
    encrypt: false,
    incremental: true,
    previousManifestPath: full.manifestPath,
  });

  assert.equal(inc.manifest.incremental, true);
  // Two files (a.txt + new d.txt) should be included; the two
  // unchanged ones (b.txt, c.txt) should be skipped.
  assert.equal(inc.manifest.stats.fileCount, 2);
  assert.equal(inc.manifest.stats.skippedForIncremental, 2);

  await fsp.rm(src, { recursive: true, force: true });
  await fsp.rm(dst, { recursive: true, force: true });
});

// ────────────────────────────────────────────────────────────────
// 4. Retention rule logic (GFS)
// ────────────────────────────────────────────────────────────────

test('classifyRetention: GFS daily only', () => {
  // 10 daily backups, keep 7
  const backups = [];
  for (let i = 0; i < 10; i++) {
    const d = new Date('2026-04-11T12:00:00Z');
    d.setDate(d.getDate() - i);
    backups.push({ id: `bk_${i}`, timestamp: d.toISOString() });
  }
  const { keep, rotate } = classifyRetention(backups, { daily: 7, weekly: 0, monthly: 0, yearly: 0 });
  assert.equal(keep.size, 7);
  assert.equal(rotate.length, 3);
  // Oldest three rotate out
  assert.equal(rotate[0].id, 'bk_9');
  assert.equal(rotate[2].id, 'bk_7');
});

test('classifyRetention: weekly + monthly promote old backups', () => {
  // Produce 60 daily backups and verify older ones get promoted
  // to weekly/monthly buckets instead of rotating.
  const backups = [];
  const base = new Date('2026-04-11T12:00:00Z');
  for (let i = 0; i < 60; i++) {
    const d = new Date(base);
    d.setDate(d.getDate() - i);
    backups.push({ id: `bk_${i}`, timestamp: d.toISOString() });
  }
  const { keep, rotate } = classifyRetention(backups, {
    daily: 7,
    weekly: 4,
    monthly: 2,
    yearly: 0,
  });
  // 7 daily + up to 4 distinct weeks + up to 2 distinct months
  // (with overlap allowed). Total protected ≥ 7 and ≤ 13.
  assert.ok(keep.size >= 7);
  assert.ok(keep.size <= 13);
  assert.equal(keep.size + rotate.length, backups.length);
});

test('classifyRetention: empty input is safe', () => {
  const { keep, rotate } = classifyRetention([], { daily: 7 });
  assert.equal(keep.size, 0);
  assert.equal(rotate.length, 0);
});

// ────────────────────────────────────────────────────────────────
// 5. Rotate REFUSES without confirmDelete
// ────────────────────────────────────────────────────────────────

test('BackupTool.rotate: REFUSES without confirmDelete flag', async () => {
  const dst = await makeTmpDir('rotate-ref');
  const tool = new BackupTool({ logger: { warn() {}, error() {}, info() {} } });

  // Hand-craft 10 old manifests
  for (let i = 0; i < 10; i++) {
    const id = `bk_fake_${i}`;
    const d = new Date('2026-04-01T00:00:00Z');
    d.setDate(d.getDate() - i);
    const manifest = {
      id,
      timestamp: d.toISOString(),
      type: 'files',
      size: 128,
      files: [],
      checksum_sha256: 'x'.repeat(64),
      encrypted: false,
      compressed: false,
      incremental: false,
      parts: [{ index: 0, path: `${id}.tkub`, size: 128, sha256: 'y'.repeat(64) }],
    };
    await fsp.writeFile(path.join(dst, id + '.manifest.json'), JSON.stringify(manifest));
    await fsp.writeFile(path.join(dst, id + '.tkub'), Buffer.alloc(128, 0));
  }

  // Without confirmDelete → must refuse
  const res = await tool.rotate(
    { daily: 3, weekly: 0, monthly: 0 },
    { destination: dst },
  );
  assert.equal(res.refused, true);
  assert.equal(res.archived, 0);
  assert.equal(res.deleted, 0);
  assert.ok(res.rotated > 0);
  assert.ok(/confirmDelete/.test(res.reason));

  // All files still present
  const still = await fsp.readdir(dst);
  assert.ok(still.filter((f) => f.endsWith('.manifest.json')).length === 10);

  await fsp.rm(dst, { recursive: true, force: true });
});

test('BackupTool.rotate: archives (never hard-deletes by default) with confirmDelete', async () => {
  const dst = await makeTmpDir('rotate-arc');
  const tool = new BackupTool({ logger: { warn() {}, error() {}, info() {} } });

  for (let i = 0; i < 5; i++) {
    const id = `bk_arc_${i}`;
    const d = new Date('2026-04-05T00:00:00Z');
    d.setDate(d.getDate() - i);
    const manifest = {
      id,
      timestamp: d.toISOString(),
      type: 'files',
      size: 32,
      files: [],
      checksum_sha256: 'z'.repeat(64),
      parts: [{ index: 0, path: `${id}.tkub`, size: 32, sha256: 'w'.repeat(64) }],
    };
    await fsp.writeFile(path.join(dst, id + '.manifest.json'), JSON.stringify(manifest));
    await fsp.writeFile(path.join(dst, id + '.tkub'), Buffer.alloc(32, 0));
  }

  const res = await tool.rotate(
    { daily: 2, weekly: 0, monthly: 0 },
    { destination: dst, confirmDelete: true },
  );
  assert.equal(res.refused, false);
  assert.equal(res.archived, 3);
  assert.equal(res.deleted, 0); // hardDelete defaults to false
  // Archive directory exists
  const archived = await fsp.readdir(path.join(dst, '_archived'));
  assert.ok(archived.length >= 3);

  await fsp.rm(dst, { recursive: true, force: true });
});

// ────────────────────────────────────────────────────────────────
// 6. Cron parsing
// ────────────────────────────────────────────────────────────────

test('parseCron: 5-field basic', () => {
  const p = parseCron('0 3 * * *');
  assert.ok(p.minute.has(0));
  assert.ok(p.hour.has(3));
  assert.ok(!p.hour.has(4));
});

test('parseCron: ranges and steps', () => {
  const p = parseCron('*/15 9-17 * * 1-5');
  assert.ok(p.minute.has(0));
  assert.ok(p.minute.has(15));
  assert.ok(p.minute.has(30));
  assert.ok(p.minute.has(45));
  assert.ok(!p.minute.has(14));
  assert.ok(p.hour.has(9));
  assert.ok(p.hour.has(17));
  assert.ok(!p.hour.has(8));
  assert.ok(!p.hour.has(18));
  assert.ok(p.dow.has(1)); // Mon
  assert.ok(!p.dow.has(0)); // Sun
});

test('cronMatches: exact timestamp', () => {
  const p = parseCron('30 2 11 4 *');
  // 11 April 2026 at 02:30
  const d = new Date('2026-04-11T02:30:00');
  assert.equal(cronMatches(p, d), true);
  const d2 = new Date('2026-04-11T02:31:00');
  assert.equal(cronMatches(p, d2), false);
});

// ────────────────────────────────────────────────────────────────
// 7. End-to-end: backup + restore round-trip
// ────────────────────────────────────────────────────────────────

test('backup + restore: files round-trip with compression', async () => {
  const src = await makeTmpDir('e2e-src');
  const dst = await makeTmpDir('e2e-dst');
  const rst = await makeTmpDir('e2e-rst');

  await writeTree(src, {
    'invoices/2026-001.pdf': 'PDF-BODY-1',
    'invoices/2026-002.pdf': 'PDF-BODY-2',
    'photos/site.jpg': Buffer.from([0xff, 0xd8, 0xff]),
  });

  const tool = new BackupTool({ logger: { warn() {}, error() {}, info() {} } });
  const bk = await tool.backup({
    target: 'files',
    destination: dst,
    roots: [src],
    compress: true,
    encrypt: false,
  });

  assert.ok(bk.id.startsWith('bk_'));
  assert.ok(await fsp.stat(bk.manifestPath));
  assert.ok(await fsp.stat(bk.artifactPath));
  assert.equal(bk.manifest.compressed, true);

  const restored = await tool.restore({
    source: bk.manifestPath,
    target: { directory: rst },
    decompress: true,
  });
  assert.ok(restored.restored.files >= 3);
  assert.ok(restored.restored.effectiveDirectory, 'effectiveDirectory should be set');

  const rootLabel = path.basename(src);
  const expected = path.join(
    restored.restored.effectiveDirectory,
    rootLabel,
    'invoices',
    '2026-001.pdf',
  );
  const buf = await fsp.readFile(expected);
  assert.equal(buf.toString('utf8'), 'PDF-BODY-1');

  await fsp.rm(src, { recursive: true, force: true });
  await fsp.rm(dst, { recursive: true, force: true });
  await fsp.rm(rst, { recursive: true, force: true });
});

test('backup + restore: encrypted files round-trip', async () => {
  const src = await makeTmpDir('enc-src');
  const dst = await makeTmpDir('enc-dst');
  const rst = await makeTmpDir('enc-rst');

  await writeTree(src, {
    'secret.txt': 'CLASSIFIED: אסור לפרסם',
  });

  const tool = new BackupTool({ logger: { warn() {}, error() {}, info() {} } });
  const bk = await tool.backup({
    target: 'files',
    destination: dst,
    roots: [src],
    compress: true,
    encrypt: true,
    encryptionKey: 'my-top-secret-passphrase-42',
  });

  assert.equal(bk.manifest.encrypted, true);

  // Peek at raw artifact: it should start with TKUC magic
  const raw = await fsp.readFile(bk.artifactPath);
  assert.equal(raw.slice(0, 4).toString('ascii'), 'TKUC');

  // Wrong key → restore throws
  await assert.rejects(() =>
    tool.restore({
      source: bk.manifestPath,
      target: { directory: rst },
      decrypt: true,
      decompress: true,
      encryptionKey: 'wrong',
    }),
  );

  // Correct key → round-trips
  const restored = await tool.restore({
    source: bk.manifestPath,
    target: { directory: rst },
    decrypt: true,
    decompress: true,
    encryptionKey: 'my-top-secret-passphrase-42',
  });
  assert.ok(restored.restored.files >= 1);
  assert.ok(restored.restored.effectiveDirectory);

  // Walk the effective directory to find the restored file
  let found = null;
  const walk = async (dir) => {
    const entries = await fsp.readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) await walk(abs);
      else if (e.name === 'secret.txt') {
        const buf = await fsp.readFile(abs);
        if (buf.toString('utf8') === 'CLASSIFIED: אסור לפרסם') found = abs;
      }
    }
  };
  await walk(restored.restored.effectiveDirectory);
  assert.ok(found, 'expected to find restored secret.txt');

  await fsp.rm(src, { recursive: true, force: true });
  await fsp.rm(dst, { recursive: true, force: true });
  await fsp.rm(rst, { recursive: true, force: true });
});

// ────────────────────────────────────────────────────────────────
// 8. verify()
// ────────────────────────────────────────────────────────────────

test('BackupTool.verify: healthy backup → valid:true', async () => {
  const src = await makeTmpDir('vrf-src');
  const dst = await makeTmpDir('vrf-dst');
  await writeTree(src, { 'a.txt': 'one', 'b.txt': 'two' });
  const tool = new BackupTool({ logger: { warn() {}, error() {}, info() {} } });
  const bk = await tool.backup({
    target: 'files',
    destination: dst,
    roots: [src],
    compress: true,
    encrypt: false,
  });
  const v = await tool.verify(bk.manifestPath);
  assert.equal(v.valid, true, `issues: ${v.issues.join(', ')}`);
  assert.equal(v.issues.length, 0);
  assert.ok(v.entryCount >= 1);

  await fsp.rm(src, { recursive: true, force: true });
  await fsp.rm(dst, { recursive: true, force: true });
});

test('BackupTool.verify: corrupted artifact → valid:false', async () => {
  const src = await makeTmpDir('vrf2-src');
  const dst = await makeTmpDir('vrf2-dst');
  await writeTree(src, { 'x.txt': 'payload' });
  const tool = new BackupTool({ logger: { warn() {}, error() {}, info() {} } });
  const bk = await tool.backup({
    target: 'files',
    destination: dst,
    roots: [src],
    compress: false,
    encrypt: false,
  });

  // Corrupt a byte
  const raw = await fsp.readFile(bk.artifactPath);
  raw[raw.length - 20] = raw[raw.length - 20] ^ 0xff;
  await fsp.writeFile(bk.artifactPath, raw);

  const v = await tool.verify(bk.manifestPath);
  assert.equal(v.valid, false);
  assert.ok(v.issues.length > 0);

  await fsp.rm(src, { recursive: true, force: true });
  await fsp.rm(dst, { recursive: true, force: true });
});

// ────────────────────────────────────────────────────────────────
// 9. listBackups()
// ────────────────────────────────────────────────────────────────

test('BackupTool.listBackups: enumerates with sizes + checksums', async () => {
  const src = await makeTmpDir('ls-src');
  const dst = await makeTmpDir('ls-dst');
  await writeTree(src, { 'a.txt': 'A', 'b.txt': 'B' });
  const tool = new BackupTool({ logger: { warn() {}, error() {}, info() {} } });
  await tool.backup({ target: 'files', destination: dst, roots: [src], compress: false });
  await new Promise((r) => setTimeout(r, 15));
  await tool.backup({ target: 'files', destination: dst, roots: [src], compress: true });

  const list = await tool.listBackups(dst);
  assert.equal(list.length, 2);
  for (const b of list) {
    assert.ok(b.id);
    assert.ok(b.timestamp);
    assert.equal(b.type, 'files');
    assert.ok(b.size > 0);
    assert.ok(b.checksum_sha256.length === 64);
  }
  // Newest first
  assert.ok(new Date(list[0].timestamp) >= new Date(list[1].timestamp));

  await fsp.rm(src, { recursive: true, force: true });
  await fsp.rm(dst, { recursive: true, force: true });
});

// ────────────────────────────────────────────────────────────────
// 10. Postgres path via fake spawn
// ────────────────────────────────────────────────────────────────

test('backup postgres: uses pg_dump via injected spawn', async () => {
  const dst = await makeTmpDir('pg-dst');
  const tool = new BackupTool({
    logger: { warn() {}, error() {}, info() {} },
    spawnFn: fakePgSpawn({ payload: 'FAKE-PGDUMP-PAYLOAD', exitCode: 0 }),
  });
  const bk = await tool.backup({
    target: 'postgres',
    destination: dst,
    connection: { url: 'postgres://fake@localhost/db' },
    compress: true,
    encrypt: false,
  });
  assert.equal(bk.manifest.type, 'postgres');
  assert.ok(bk.manifest.files.find((f) => f.name === 'postgres.dump'));

  // Verify round-trip decompresses and contains the dump
  const v = await tool.verify(bk.manifestPath);
  assert.equal(v.valid, true, v.issues.join(', '));

  await fsp.rm(dst, { recursive: true, force: true });
});

test('backup postgres: propagates pg_dump failure', async () => {
  const dst = await makeTmpDir('pg-fail');
  const tool = new BackupTool({
    logger: { warn() {}, error() {}, info() {} },
    spawnFn: () => {
      const ee = new (require('node:events').EventEmitter)();
      ee.stderr = {
        on(ev, cb) {
          if (ev === 'data') setImmediate(() => cb('boom: role does not exist'));
        },
      };
      setImmediate(() => ee.emit('close', 1));
      return ee;
    },
  });
  await assert.rejects(
    () =>
      tool.backup({
        target: 'postgres',
        destination: dst,
        connection: { url: 'postgres://bad/db' },
      }),
    /pg_dump exited/,
  );
  await fsp.rm(dst, { recursive: true, force: true });
});

// ────────────────────────────────────────────────────────────────
// 11. Glossary export
// ────────────────────────────────────────────────────────────────

test('GLOSSARY: has Hebrew + English for key terms', () => {
  assert.ok(GLOSSARY.backup.he === 'גיבוי');
  assert.ok(GLOSSARY.restore.he === 'שחזור');
  assert.ok(GLOSSARY.encryption.he === 'הצפנה');
  assert.ok(GLOSSARY.retention.he === 'מדיניות שימור');
  assert.ok(GLOSSARY.grandfather.he === 'סב-אב-בן');
});

// ────────────────────────────────────────────────────────────────
// 12. Safety: backup never mutates source
// ────────────────────────────────────────────────────────────────

test('backup: source tree is bitwise unchanged after backup', async () => {
  const src = await makeTmpDir('safe-src');
  const dst = await makeTmpDir('safe-dst');
  const payload1 = 'original-a';
  const payload2 = 'original-b';
  await fsp.writeFile(path.join(src, 'a.txt'), payload1);
  await fsp.writeFile(path.join(src, 'b.txt'), payload2);
  const before = {
    a: crypto.createHash('sha256').update(await fsp.readFile(path.join(src, 'a.txt'))).digest('hex'),
    b: crypto.createHash('sha256').update(await fsp.readFile(path.join(src, 'b.txt'))).digest('hex'),
  };
  const tool = new BackupTool({ logger: { warn() {}, error() {}, info() {} } });
  await tool.backup({
    target: 'files',
    destination: dst,
    roots: [src],
    compress: true,
    encrypt: true,
    encryptionKey: 'k',
  });
  const after = {
    a: crypto.createHash('sha256').update(await fsp.readFile(path.join(src, 'a.txt'))).digest('hex'),
    b: crypto.createHash('sha256').update(await fsp.readFile(path.join(src, 'b.txt'))).digest('hex'),
  };
  assert.deepEqual(before, after);

  await fsp.rm(src, { recursive: true, force: true });
  await fsp.rm(dst, { recursive: true, force: true });
});
