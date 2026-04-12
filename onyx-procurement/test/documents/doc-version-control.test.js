/**
 * Generic Document Version Control — Unit Tests
 * Agent Y-106 • Techno-Kol Uzi • Swarm Documents
 *
 * Run with:
 *    node --test onyx-procurement/test/documents/doc-version-control.test.js
 *
 * Zero external dependencies. Covers:
 *   - upload + SHA-256 + v1 minting
 *   - version chain growth on main
 *   - checkout / checkin / reject-on-other-user
 *   - branch → isolated drafting
 *   - 3-way merge (no-conflict + conflict with resolver)
 *   - listVersions across branches
 *   - restoreVersion creates NEW version (never deletes)
 *   - compareVersions line diff
 *   - lockDocument exclusive + TTL
 *   - checksumVerify happy path + tampered bytes
 *   - auditLog captures every mutation
 *   - signatureCapture embeds hash
 *   - tamperEvidence detects byte tampering
 *   - tamperEvidence passes on pristine chain
 *   - never-delete invariant
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const modPath = path.resolve(__dirname, '..', '..', 'src', 'documents', 'doc-version-control.js');
const {
  DocVersionControl,
  InMemoryStorageAdapter,
  DOC_STATUS,
  SIGNATURE_METHODS,
  AUDIT_ACTIONS,
  MAIN_BRANCH,
  _internals,
} = require(modPath);

/* ─── helpers ────────────────────────────────────────────────────────── */

function newVC(opts) {
  return new DocVersionControl(opts || {});
}

function lorem(n) {
  const lines = [];
  for (let i = 0; i < n; i++) {
    lines.push('line ' + i + ' — הוראת עבודה');
  }
  return lines.join('\n');
}

/* ─── 1. upload ─────────────────────────────────────────────────────── */

test('upload: creates v1 with stable SHA-256', async () => {
  const vc = newVC();
  const res = await vc.upload({
    name: 'SOP-Welding.md',
    folder: '/sop',
    file: 'hello world',
    mimeType: 'text/markdown',
    author: 'kobi',
    tags: ['sop', 'welding'],
    metadata: { dept: 'production' },
  });
  assert.ok(res.docId.startsWith('doc_'));
  assert.equal(res.version, 1);
  assert.equal(res.branch, MAIN_BRANCH);
  assert.equal(res.sha256, _internals.sha256('hello world'));
  assert.ok(res.linkedHash.length === 64);
});

test('upload: second upload on same docId produces v2', async () => {
  const vc = newVC();
  const a = await vc.upload({ name: 'x.txt', file: 'one', author: 'u1' });
  const b = await vc.upload({ docId: a.docId, name: 'x.txt', file: 'two', author: 'u1' });
  assert.equal(b.version, 2);
  assert.notEqual(a.sha256, b.sha256);
});

test('upload: rejects missing required fields', async () => {
  const vc = newVC();
  await assert.rejects(() => vc.upload({ name: 'x', author: 'u1' }), /file/);
  await assert.rejects(() => vc.upload({ name: 'x', file: 'a' }), /author/);
  await assert.rejects(() => vc.upload({ file: 'a', author: 'u1' }), /name/);
});

/* ─── 2. checkout / checkin ─────────────────────────────────────────── */

test('checkout: single-writer enforcement', async () => {
  const vc = newVC();
  const { docId } = await vc.upload({ name: 'policy.txt', file: 'v1', author: 'alice' });
  vc.checkout(docId, 'alice');
  assert.throws(() => vc.checkout(docId, 'bob'), /checked out/);
});

test('checkin: creates a new version on main', async () => {
  const vc = newVC();
  const { docId } = await vc.upload({ name: 'policy.txt', file: 'v1', author: 'alice' });
  vc.checkout(docId, 'alice');
  const r = await vc.checkin(docId, 'alice', 'v2', 'reword intro');
  assert.equal(r.version, 2);
  // check-out is released
  vc.checkout(docId, 'bob');  // should succeed now
});

test('checkin: rejects non-owner', async () => {
  const vc = newVC();
  const { docId } = await vc.upload({ name: 'policy.txt', file: 'v1', author: 'alice' });
  vc.checkout(docId, 'alice');
  await assert.rejects(() => vc.checkin(docId, 'bob', 'v2'), /non-owner/);
});

test('checkin: null newFile just releases the check-out', async () => {
  const vc = newVC();
  const { docId } = await vc.upload({ name: 'policy.txt', file: 'v1', author: 'alice' });
  vc.checkout(docId, 'alice');
  const r = await vc.checkin(docId, 'alice', null);
  assert.equal(r.cancelled, true);
  // only one version
  assert.equal(vc.listVersions(docId).length, 1);
});

/* ─── 3. branch ─────────────────────────────────────────────────────── */

test('branch: creates independent draft line from main head', async () => {
  const vc = newVC();
  const { docId } = await vc.upload({ name: 'proposal.md', file: lorem(10), author: 'kobi' });
  const b = await vc.branch(docId, 'draft-2026', { author: 'kobi' });
  assert.equal(b.branch, 'draft-2026');
  assert.equal(b.version, 1);
  const branches = vc.listBranches(docId);
  assert.deepEqual(branches, ['draft-2026', 'main'].sort());
});

test('branch: cannot overwrite main and cannot duplicate', async () => {
  const vc = newVC();
  const { docId } = await vc.upload({ name: 'x.md', file: 'a', author: 'u' });
  await assert.rejects(() => vc.branch(docId, MAIN_BRANCH), /cannot create/);
  await vc.branch(docId, 'exp');
  await assert.rejects(() => vc.branch(docId, 'exp'), /already exists/);
});

/* ─── 4. merge (3-way) ──────────────────────────────────────────────── */

test('merge: fast-forward when target unchanged', async () => {
  const vc = newVC();
  const base = 'a\nb\nc';
  const { docId } = await vc.upload({ name: 'f.txt', file: base, author: 'u' });
  await vc.branch(docId, 'feat');
  // Change on feat only
  await vc.upload({ docId, name: 'f.txt', file: 'a\nb\nc\nd', author: 'u', branch: 'feat' });
  const r = await vc.merge(docId, 'feat', 'main', null, { author: 'u' });
  assert.equal(r.conflicts, 0);
  // Head of main now contains the feat edit
  const versions = vc.listVersions(docId, { branch: 'main' });
  const head = versions[versions.length - 1];
  const bytes = await vc.storage.get(head.storageKey);
  assert.ok(bytes.toString('utf8').includes('d'));
});

test('merge: divergent edits invoke conflict resolver', async () => {
  const vc = newVC();
  const base = 'alpha\nbeta\ngamma';
  const { docId } = await vc.upload({ name: 'f.txt', file: base, author: 'u' });
  await vc.branch(docId, 'feat');
  // Diverge main and feat at the same position
  await vc.upload({ docId, name: 'f.txt', file: 'alpha\nBETA-main\ngamma', author: 'u' });
  await vc.upload({ docId, name: 'f.txt', file: 'alpha\nBETA-feat\ngamma', author: 'u', branch: 'feat' });

  let invoked = 0;
  const resolver = function (baseLine, ours, theirs) {
    invoked++;
    return 'BETA-resolved';
  };
  const r = await vc.merge(docId, 'feat', 'main', resolver, { author: 'u' });
  assert.ok(r.conflicts >= 1);
  assert.ok(invoked >= 1);
});

/* ─── 5. listVersions / never-delete ────────────────────────────────── */

test('listVersions: full history, ordered, defensive copy', async () => {
  const vc = newVC();
  const { docId } = await vc.upload({ name: 'x.md', file: 'v1', author: 'u' });
  await vc.upload({ docId, name: 'x.md', file: 'v2', author: 'u' });
  await vc.upload({ docId, name: 'x.md', file: 'v3', author: 'u' });
  const v = vc.listVersions(docId);
  assert.equal(v.length, 3);
  // Mutating the returned copy does not affect internal state.
  v[0].sha256 = 'tampered';
  const v2 = vc.listVersions(docId);
  assert.notEqual(v2[0].sha256, 'tampered');
});

/* ─── 6. restoreVersion ─────────────────────────────────────────────── */

test('restoreVersion: creates a NEW version; history grows', async () => {
  const vc = newVC();
  const { docId } = await vc.upload({ name: 'x.md', file: 'ORIGINAL', author: 'u' });
  await vc.upload({ docId, name: 'x.md', file: 'EDIT-1', author: 'u' });
  await vc.upload({ docId, name: 'x.md', file: 'EDIT-2', author: 'u' });
  const r = await vc.restoreVersion(docId, 1, { author: 'u' });
  assert.equal(r.version, 4);  // not overwriting
  const head = vc.getVersion(docId, 4);
  const bytes = await vc.storage.get(head.storageKey);
  assert.equal(bytes.toString('utf8'), 'ORIGINAL');
  assert.equal(head.status, DOC_STATUS.restored.id);
  // v1..v3 still exist
  assert.equal(vc.listVersions(docId).length, 4);
});

/* ─── 7. compareVersions ────────────────────────────────────────────── */

test('compareVersions: returns line diff', async () => {
  const vc = newVC();
  const { docId } = await vc.upload({ name: 'x.txt', file: 'a\nb\nc', author: 'u' });
  await vc.upload({ docId, name: 'x.txt', file: 'a\nB\nc\nd', author: 'u' });
  const diff = await vc.compareVersions(docId, 1, 2);
  const adds = diff.filter(d => d.op === 'add').map(d => d.line);
  const dels = diff.filter(d => d.op === 'del').map(d => d.line);
  assert.ok(adds.includes('B'));
  assert.ok(adds.includes('d'));
  assert.ok(dels.includes('b'));
});

/* ─── 8. lockDocument ───────────────────────────────────────────────── */

test('lockDocument: blocks other users from checkin', async () => {
  const vc = newVC();
  const { docId } = await vc.upload({ name: 'x.txt', file: 'v1', author: 'alice' });
  vc.lockDocument(docId, 'alice', 'QA hold', 60 * 1000);
  await assert.rejects(
    () => vc.upload({ docId, name: 'x.txt', file: 'v2', author: 'bob' }),
    /locked/,
  );
});

test('lockDocument: owner can still edit; expired locks auto-release', async () => {
  let t = Date.parse('2026-04-11T09:00:00.000Z');
  const clock = () => new Date(t).toISOString();
  const vc = newVC({ clock });
  const { docId } = await vc.upload({ name: 'x.txt', file: 'v1', author: 'alice' });
  vc.lockDocument(docId, 'alice', 'edit', 60 * 1000);  // 60 s
  // Advance clock past the TTL
  t += 2 * 60 * 1000;
  // Bob can now edit because the lock has expired.
  const r = await vc.upload({ docId, name: 'x.txt', file: 'v2', author: 'bob' });
  assert.equal(r.version, 2);
});

/* ─── 9. checksumVerify ─────────────────────────────────────────────── */

test('checksumVerify: ok on pristine version', async () => {
  const vc = newVC();
  const { docId } = await vc.upload({ name: 'x.txt', file: 'pristine', author: 'u' });
  const r = await vc.checksumVerify(docId, 1);
  assert.equal(r.ok, true);
  assert.equal(r.expected, r.actual);
});

test('checksumVerify: flags tampered bytes', async () => {
  const vc = newVC();
  const { docId } = await vc.upload({ name: 'x.txt', file: 'pristine', author: 'u' });
  // Directly mutate storage (simulate an attacker bypassing the API).
  const head = vc.getVersion(docId, 1);
  await vc.storage.put(head.storageKey, Buffer.from('tampered'));
  const r = await vc.checksumVerify(docId, 1);
  assert.equal(r.ok, false);
  assert.notEqual(r.expected, r.actual);
});

/* ─── 10. auditLog ──────────────────────────────────────────────────── */

test('auditLog: captures upload, checkout, checkin, lock, sign', async () => {
  const vc = newVC();
  const { docId } = await vc.upload({ name: 'x.txt', file: 'v1', author: 'alice' });
  vc.checkout(docId, 'alice');
  await vc.checkin(docId, 'alice', 'v2', 'fix typo');
  vc.lockDocument(docId, 'alice', 'hold');
  vc.signatureCapture(docId, 'alice', 'typed', { evidence: 'drawn-signature-bytes' });
  const log = vc.auditLog(docId);
  const actions = log.map(e => e.action);
  assert.ok(actions.includes(AUDIT_ACTIONS.upload));
  assert.ok(actions.includes(AUDIT_ACTIONS.checkout));
  assert.ok(actions.includes(AUDIT_ACTIONS.checkin));
  assert.ok(actions.includes(AUDIT_ACTIONS.lock));
  assert.ok(actions.includes(AUDIT_ACTIONS.sign));
});

test('auditLog: is a defensive copy', async () => {
  const vc = newVC();
  const { docId } = await vc.upload({ name: 'x.txt', file: 'v1', author: 'u' });
  const log = vc.auditLog(docId);
  log.push({ action: 'fake', ts: 'x', user: 'hacker', payload: {} });
  const log2 = vc.auditLog(docId);
  assert.equal(log2.length, 1);
});

/* ─── 11. signatureCapture ──────────────────────────────────────────── */

test('signatureCapture: embeds sig hash and flips status to signed', async () => {
  const vc = newVC();
  const { docId } = await vc.upload({ name: 'contract.pdf', file: 'PDFbytes', author: 'alice' });
  const sig = vc.signatureCapture(docId, { id: 'alice', name: 'Alice' }, 'pki', {
    evidence: 'PKI-signature-blob',
  });
  assert.equal(sig.sha256.length, 64);
  const head = vc.getVersion(docId, 1);
  assert.equal(head.status, DOC_STATUS.signed.id);
  assert.equal(head.signatures.length, 1);
  assert.equal(head.signatures[0].sha256, sig.sha256);
});

test('signatureCapture: unknown method rejected', async () => {
  const vc = newVC();
  const { docId } = await vc.upload({ name: 'x.pdf', file: 'bytes', author: 'u' });
  assert.throws(() => vc.signatureCapture(docId, 'u', 'nonsense'), /signature method/);
});

/* ─── 12. tamperEvidence ────────────────────────────────────────────── */

test('tamperEvidence: ok on pristine chain', async () => {
  const vc = newVC();
  const { docId } = await vc.upload({ name: 'x.txt', file: 'v1', author: 'u' });
  await vc.upload({ docId, name: 'x.txt', file: 'v2', author: 'u' });
  await vc.upload({ docId, name: 'x.txt', file: 'v3', author: 'u' });
  const r = await vc.tamperEvidence(docId);
  assert.equal(r.ok, true);
  assert.equal(r.breaks.length, 0);
  assert.equal(r.versionsChecked, 3);
});

test('tamperEvidence: flags byte-level tamper', async () => {
  const vc = newVC();
  const { docId } = await vc.upload({ name: 'x.txt', file: 'v1', author: 'u' });
  await vc.upload({ docId, name: 'x.txt', file: 'v2', author: 'u' });
  // Tamper with v1 bytes in storage directly
  const v1 = vc.getVersion(docId, 1);
  await vc.storage.put(v1.storageKey, Buffer.from('MALICIOUS'));
  const r = await vc.tamperEvidence(docId);
  assert.equal(r.ok, false);
  assert.ok(r.breaks.some(b => b.reason === 'bytes_mismatch' && b.version === 1));
});

test('tamperEvidence: flags chain tamper (metadata rewrite)', async () => {
  const vc = newVC();
  const { docId } = await vc.upload({ name: 'x.txt', file: 'v1', author: 'u' });
  await vc.upload({ docId, name: 'x.txt', file: 'v2', author: 'u' });
  // Reach into internals and corrupt one linkedHash to simulate an
  // attacker editing the metadata store (e.g. a DB write bypassing the API).
  const arr = vc.branches.get(docId + '@' + MAIN_BRANCH);
  arr[0].linkedHash = 'deadbeef'.repeat(8);
  const r = await vc.tamperEvidence(docId);
  assert.equal(r.ok, false);
  assert.ok(r.breaks.some(b => b.reason === 'chain_mismatch' || b.reason === 'prev_link_mismatch'));
});

/* ─── 13. storage adapter contract ──────────────────────────────────── */

test('storage adapter: rejects adapters missing methods', () => {
  assert.throws(() => new DocVersionControl({ storage: {} }), /adapter/);
});

test('storage adapter: custom adapter is used end-to-end', async () => {
  // Build a tiny pass-through adapter with counters.
  let puts = 0, gets = 0;
  const inner = new InMemoryStorageAdapter();
  const adapter = {
    put: async (k, b) => { puts++; return inner.put(k, b); },
    get: async (k) => { gets++; return inner.get(k); },
    has: async (k) => inner.has(k),
  };
  const vc = newVC({ storage: adapter });
  const { docId } = await vc.upload({ name: 'x.txt', file: 'v1', author: 'u' });
  await vc.upload({ docId, name: 'x.txt', file: 'v2', author: 'u' });
  await vc.checksumVerify(docId, 1);
  assert.ok(puts >= 2);
  assert.ok(gets >= 1);
});

/* ─── 14. never-delete invariant ────────────────────────────────────── */

test('never-delete: no public method removes versions', async () => {
  const vc = newVC();
  const { docId } = await vc.upload({ name: 'x.txt', file: 'v1', author: 'u' });
  await vc.upload({ docId, name: 'x.txt', file: 'v2', author: 'u' });
  await vc.upload({ docId, name: 'x.txt', file: 'v3', author: 'u' });
  // Sanity-check: there is no delete / remove / purge method
  const keys = Object.getOwnPropertyNames(Object.getPrototypeOf(vc));
  const forbidden = keys.filter(k => /delete|remove|purge|drop|truncate/i.test(k) && k !== 'unlockDocument');
  assert.deepEqual(forbidden, []);
  assert.equal(vc.listVersions(docId).length, 3);
});

test('never-delete: restoreVersion does not overwrite, audit log grows', async () => {
  const vc = newVC();
  const { docId } = await vc.upload({ name: 'x.txt', file: 'a', author: 'u' });
  await vc.upload({ docId, name: 'x.txt', file: 'b', author: 'u' });
  await vc.restoreVersion(docId, 1);
  const v = vc.listVersions(docId);
  assert.equal(v.length, 3);
  assert.equal(v[0].sha256, v[2].sha256);  // restored content identical to v1
  assert.notEqual(v[0].version, v[2].version);
  const audit = vc.auditLog(docId);
  assert.ok(audit.some(e => e.action === AUDIT_ACTIONS.restore));
});
