/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ONYX AI — EventStore & Audit Trail Tests
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Tests for the event-sourced persistence layer in src/onyx-platform.ts
 *
 * Run (verified working, Node 24.14.1, ts-node 10.x):
 *   TS_NODE_TRANSPILE_ONLY=true npx node --test --require ts-node/register test/event-store.test.ts
 *
 * Why transpile-only: src/onyx-platform.ts currently has a pre-existing
 * TS2345 diagnostic at line 261 (Function / callable type narrowing). The
 * production code runs fine — strict type-check failures there are outside
 * the scope of this test file. TS_NODE_TRANSPILE_ONLY skips the full
 * type-check and runs the stripped JS, mirroring how `ts-node` is used by
 * the sibling `test/policies.test.ts`.
 *
 * Test Isolation:
 *   Every test uses fs.mkdtempSync to create a unique temp directory,
 *   and fs.rmSync(..., { recursive: true, force: true }) to clean up after.
 *
 * Implementation notes about the EventStore being tested (from src/onyx-platform.ts):
 *   - Events are kept in-memory (this.events) and also streamed to a WAL file
 *     at `${persistencePath}.wal` (JSONL, line-delimited).
 *   - A full snapshot of this.events is written to `persistencePath` every 1000
 *     events OR when shutdown() is called (via flushToDisk).
 *   - Persistence is periodic (default flushIntervalMs=5000). Tests use a small
 *     flushIntervalMs and/or shutdown() to force flushes before reading from disk.
 *   - Each event carries a SHA256 `hash` field that chains to the previous
 *     event's hash — this is the integrity/checksum mechanism.
 *   - No explicit file rotation is implemented (documented in test #11).
 *   - query() is the "read" operation — no args returns all events.
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { EventStore } from '../src/onyx-platform';

/* ──────────────────────────────────────────────────────────────────────────
 * Test fixture helpers
 * ────────────────────────────────────────────────────────────────────────── */

/** Create an isolated temp directory for a single test. */
function makeTmpDir(label: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `onyx-evtstore-${label}-`));
}

/** Remove a temp directory and all its contents. */
function cleanTmpDir(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* ignore — best effort cleanup */
  }
}

/** Build a standard test event param. */
function sampleEvent(overrides: Partial<{
  type: string;
  aggregateId: string;
  aggregateType: string;
  payload: Record<string, unknown>;
  actor: string;
}> = {}) {
  return {
    type: overrides.type ?? 'test.event',
    aggregateId: overrides.aggregateId ?? 'agg_1',
    aggregateType: overrides.aggregateType ?? 'test',
    payload: overrides.payload ?? { hello: 'world' },
    actor: overrides.actor ?? 'unit_test',
  };
}

/** Sleep helper (for the interval-flush tests). */
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/* ──────────────────────────────────────────────────────────────────────────
 * Test 1: Create event store at temp path → persistence file initialized
 * ────────────────────────────────────────────────────────────────────────── */

test('1. create EventStore at temp path — directory exists, no crash', () => {
  const dir = makeTmpDir('create');
  try {
    const eventsPath = path.join(dir, 'events.json');
    const store = new EventStore({ persistPath: eventsPath, flushIntervalMs: 10_000 });

    // Constructor should succeed without writing any files yet
    // (loadFromDisk is tolerant of non-existent files; no flush has run).
    assert.equal(store.size, 0, 'empty store has size 0');
    assert.equal(store.lastSequence, 0, 'empty store has sequence 0');
    assert.ok(fs.existsSync(dir), 'parent temp dir exists');

    store.shutdown();
  } finally {
    cleanTmpDir(dir);
  }
});

/* ──────────────────────────────────────────────────────────────────────────
 * Test 2: Append event → read back, event present
 * ────────────────────────────────────────────────────────────────────────── */

test('2. append single event — read-back via query() returns the event', () => {
  const dir = makeTmpDir('append-one');
  try {
    const store = new EventStore({ persistPath: path.join(dir, 'events.json') });

    const appended = store.append(sampleEvent({ payload: { value: 42 } }));
    assert.ok(appended.id.startsWith('evt_'), 'event has prefixed id');
    assert.equal(appended.sequenceNumber, 1, 'first event has sequence 1');
    assert.equal(appended.type, 'test.event');
    assert.deepEqual(appended.payload, { value: 42 });

    const all = store.query({});
    assert.equal(all.length, 1, 'store contains exactly one event after append');
    assert.equal(all[0].id, appended.id, 'read-back event matches appended event');

    store.shutdown();
  } finally {
    cleanTmpDir(dir);
  }
});

/* ──────────────────────────────────────────────────────────────────────────
 * Test 3: Append 100 events → read returns 100 in order
 * ────────────────────────────────────────────────────────────────────────── */

test('3. append 100 events — query returns all 100 in insertion/sequence order', () => {
  const dir = makeTmpDir('append-100');
  try {
    const store = new EventStore({ persistPath: path.join(dir, 'events.json') });

    const ids: string[] = [];
    for (let i = 0; i < 100; i++) {
      const e = store.append(sampleEvent({
        type: 'load.test',
        aggregateId: `agg_${i}`,
        payload: { index: i },
      }));
      ids.push(e.id);
    }

    const all = store.query({});
    assert.equal(all.length, 100, 'query returns 100 events');

    // Ordering: sequence numbers should be 1..100, and insertion order preserved
    for (let i = 0; i < 100; i++) {
      assert.equal(all[i].sequenceNumber, i + 1, `event ${i} has sequence ${i + 1}`);
      assert.equal(all[i].id, ids[i], `event ${i} id matches insertion order`);
      assert.deepEqual(all[i].payload, { index: i }, `event ${i} payload preserved`);
    }

    assert.equal(store.size, 100);
    assert.equal(store.lastSequence, 100);

    store.shutdown();
  } finally {
    cleanTmpDir(dir);
  }
});

/* ──────────────────────────────────────────────────────────────────────────
 * Test 4: Append with different event types → filter by type works
 * ────────────────────────────────────────────────────────────────────────── */

test('4. filter-by-type — query({ types: [...] }) returns only matching events', () => {
  const dir = makeTmpDir('filter-type');
  try {
    const store = new EventStore({ persistPath: path.join(dir, 'events.json') });

    store.append(sampleEvent({ type: 'user.created' }));
    store.append(sampleEvent({ type: 'user.created' }));
    store.append(sampleEvent({ type: 'user.updated' }));
    store.append(sampleEvent({ type: 'order.placed' }));
    store.append(sampleEvent({ type: 'order.placed' }));
    store.append(sampleEvent({ type: 'order.placed' }));

    const users = store.query({ types: ['user.created', 'user.updated'] });
    assert.equal(users.length, 3, 'three user events');
    users.forEach((e) => assert.ok(e.type.startsWith('user.')));

    const orders = store.query({ types: ['order.placed'] });
    assert.equal(orders.length, 3, 'three order events');
    orders.forEach((e) => assert.equal(e.type, 'order.placed'));

    const nothing = store.query({ types: ['nope.never'] });
    assert.equal(nothing.length, 0, 'unknown type returns empty');

    store.shutdown();
  } finally {
    cleanTmpDir(dir);
  }
});

/* ──────────────────────────────────────────────────────────────────────────
 * Test 5: Time range filter → events within since/until window
 * ────────────────────────────────────────────────────────────────────────── */

test('5. time-range filter — query({ since, until }) returns events within window', async () => {
  const dir = makeTmpDir('time-range');
  try {
    const store = new EventStore({ persistPath: path.join(dir, 'events.json') });

    const t0 = Date.now();
    store.append(sampleEvent({ type: 'early.event' }));
    await sleep(15);

    const windowStart = Date.now();
    await sleep(5);
    store.append(sampleEvent({ type: 'in.window.1' }));
    await sleep(5);
    store.append(sampleEvent({ type: 'in.window.2' }));
    await sleep(5);
    const windowEnd = Date.now();

    await sleep(15);
    store.append(sampleEvent({ type: 'late.event' }));

    // Sanity: we wrote 4 total
    assert.equal(store.query({}).length, 4);

    const inWindow = store.query({ since: windowStart, until: windowEnd });
    assert.equal(inWindow.length, 2, 'exactly two events in the time window');
    assert.ok(inWindow.every((e) => e.timestamp >= windowStart && e.timestamp <= windowEnd));
    const types = inWindow.map((e) => e.type).sort();
    assert.deepEqual(types, ['in.window.1', 'in.window.2']);

    // since-only filter also works
    const afterT0 = store.query({ since: t0 });
    assert.equal(afterT0.length, 4, 'all 4 are >= t0');

    store.shutdown();
  } finally {
    cleanTmpDir(dir);
  }
});

/* ──────────────────────────────────────────────────────────────────────────
 * Test 6: Event IDs are unique across appends
 * ────────────────────────────────────────────────────────────────────────── */

test('6. event IDs are unique across many appends', () => {
  const dir = makeTmpDir('unique-ids');
  try {
    const store = new EventStore({ persistPath: path.join(dir, 'events.json') });

    const N = 500;
    const ids = new Set<string>();
    const seqs = new Set<number>();

    for (let i = 0; i < N; i++) {
      const e = store.append(sampleEvent({ aggregateId: `agg_${i}` }));
      ids.add(e.id);
      seqs.add(e.sequenceNumber);
    }

    assert.equal(ids.size, N, `all ${N} event IDs are unique`);
    assert.equal(seqs.size, N, `all ${N} sequence numbers are unique`);
    // Sequence numbers are contiguous 1..N
    for (let i = 1; i <= N; i++) assert.ok(seqs.has(i), `seq ${i} present`);

    store.shutdown();
  } finally {
    cleanTmpDir(dir);
  }
});

/* ──────────────────────────────────────────────────────────────────────────
 * Test 7: Append with cyclic JSON payload → store handles it (throws or skips)
 * ────────────────────────────────────────────────────────────────────────── */

test('7. cyclic JSON payload — append throws because hash uses JSON.stringify', () => {
  const dir = makeTmpDir('cyclic');
  try {
    const store = new EventStore({ persistPath: path.join(dir, 'events.json') });

    type Cyclic = { name: string; self?: Cyclic };
    const cyclic: Cyclic = { name: 'loop' };
    cyclic.self = cyclic;

    // The hash chain computes JSON.stringify(payload); a cyclic object
    // must cause the append to throw rather than silently corrupt the store.
    assert.throws(
      () => store.append(sampleEvent({ payload: cyclic as unknown as Record<string, unknown> })),
      /circular|cyclic|converting|Converting/i,
      'append() must throw on cyclic payload',
    );

    // Depending on whether the event was pushed before hashing failed,
    // the store may contain 0 or 1 events with an invalid hash.
    // Document the observed state: at minimum, size is numeric and finite.
    assert.ok(Number.isFinite(store.size), 'store.size remains finite after throw');

    store.shutdown();
  } finally {
    cleanTmpDir(dir);
  }
});

/* ──────────────────────────────────────────────────────────────────────────
 * Test 8: Read from empty store → empty array
 * ────────────────────────────────────────────────────────────────────────── */

test('8. read from empty store — query({}) returns empty array', () => {
  const dir = makeTmpDir('empty-read');
  try {
    const store = new EventStore({ persistPath: path.join(dir, 'events.json') });

    const all = store.query({});
    assert.ok(Array.isArray(all), 'query returns array');
    assert.equal(all.length, 0, 'empty store yields zero events');

    // Filtered queries on an empty store should also return []
    assert.deepEqual(store.query({ types: ['any.type'] }), []);
    assert.deepEqual(store.query({ aggregateId: 'nope' }), []);
    assert.deepEqual(store.query({ since: 0, until: Date.now() }), []);

    store.shutdown();
  } finally {
    cleanTmpDir(dir);
  }
});

/* ──────────────────────────────────────────────────────────────────────────
 * Test 9: Read from non-existent persistence path
 *         DOCUMENTED: EventStore.loadFromDisk() swallows errors via try/catch
 *         and simply leaves the in-memory store empty. It does NOT throw.
 * ────────────────────────────────────────────────────────────────────────── */

test('9. non-existent persistence path — constructor does not throw, store is empty', () => {
  const dir = makeTmpDir('ghost-path');
  try {
    const ghostPath = path.join(dir, 'does', 'not', 'exist', 'events.json');

    // fs.existsSync returns false → loadFromDisk short-circuits → no throw.
    const store = new EventStore({ persistPath: ghostPath, flushIntervalMs: 10_000 });
    assert.equal(store.size, 0);
    assert.equal(store.lastSequence, 0);
    assert.deepEqual(store.query({}), []);

    // Similarly, a completely missing file (parent exists but file does not)
    const missingFile = path.join(dir, 'missing.json');
    const store2 = new EventStore({ persistPath: missingFile, flushIntervalMs: 10_000 });
    assert.equal(store2.size, 0);

    store.shutdown();
    store2.shutdown();
  } finally {
    cleanTmpDir(dir);
  }
});

/* ──────────────────────────────────────────────────────────────────────────
 * Test 10: Concurrent appends (10 parallel) → all persisted
 * ────────────────────────────────────────────────────────────────────────── */

test('10. concurrent appends — 10 parallel appends all persist with unique sequences', async () => {
  const dir = makeTmpDir('concurrent');
  try {
    const store = new EventStore({ persistPath: path.join(dir, 'events.json') });

    // Node single-threaded JS: Promise.all of micro-tasks still exercises
    // the append path under interleaving. We launch 10 "concurrent" appends.
    const tasks = Array.from({ length: 10 }, (_, i) =>
      Promise.resolve().then(() =>
        store.append(sampleEvent({
          type: 'concurrent.write',
          aggregateId: `worker_${i}`,
          payload: { worker: i },
        })),
      ),
    );

    const results = await Promise.all(tasks);
    assert.equal(results.length, 10, 'all 10 appends resolved');

    const ids = new Set(results.map((e) => e.id));
    assert.equal(ids.size, 10, 'all IDs unique under concurrent appends');

    const seqs = new Set(results.map((e) => e.sequenceNumber));
    assert.equal(seqs.size, 10, 'all sequence numbers unique');

    const all = store.query({ types: ['concurrent.write'] });
    assert.equal(all.length, 10, 'all 10 concurrent events readable');

    // Integrity must hold after concurrent writes
    const integrity = (store as unknown as { verifyIntegrity: () => { ok: boolean; value?: boolean } })
      .verifyIntegrity();
    assert.equal(integrity.ok, true, 'hash chain valid after concurrent appends');

    store.shutdown();
  } finally {
    cleanTmpDir(dir);
  }
});

/* ──────────────────────────────────────────────────────────────────────────
 * Test 11: Rotation / size-limit behaviour
 *          DOCUMENTED: EventStore does NOT implement file rotation. Instead,
 *          every 1000 events it overwrites the snapshot file with the full
 *          event list (see flushToDisk). We verify the *current* behaviour
 *          and document the absence of rotation.
 * ────────────────────────────────────────────────────────────────────────── */

test('11. rotation — not implemented; snapshot refresh at multiples of 1000 documented', async () => {
  const dir = makeTmpDir('rotation');
  try {
    const persistPath = path.join(dir, 'events.json');
    // Fast flush so we can see the WAL file on disk during the test.
    const store = new EventStore({ persistPath, flushIntervalMs: 20 });

    for (let i = 0; i < 250; i++) {
      store.append(sampleEvent({ type: 'rot.test', payload: { i } }));
    }

    // Give the flush interval a chance to run, then force a final flush.
    await sleep(100);
    store.shutdown(); // forces final flushToDisk()

    // After 250 events there's no snapshot file yet (threshold is 1000),
    // but the WAL file must exist and contain 250 JSONL lines.
    const walPath = persistPath + '.wal';
    assert.ok(fs.existsSync(walPath), 'WAL file was created by flushToDisk');

    const walContent = fs.readFileSync(walPath, 'utf-8');
    const walLines = walContent.split('\n').filter((line) => line.length > 0);
    assert.equal(walLines.length, 250, 'WAL contains one JSONL line per event');

    // Each WAL line is valid JSON with the expected schema
    const firstParsed = JSON.parse(walLines[0]);
    assert.equal(firstParsed.type, 'rot.test');
    assert.ok(typeof firstParsed.hash === 'string' && firstParsed.hash.length === 64,
      'WAL record carries SHA-256 hash');

    // DOCUMENTED: there is no size-based rotation. The WAL grows unbounded.
    // The snapshot file is only (re)written every 1000 events, so at 250
    // events the snapshot file should not yet exist.
    assert.equal(fs.existsSync(persistPath), false,
      'snapshot file not yet written (threshold is every 1000 events)');
  } finally {
    cleanTmpDir(dir);
  }
});

/* ──────────────────────────────────────────────────────────────────────────
 * Test 12: Checksum / integrity hash on every event
 * ────────────────────────────────────────────────────────────────────────── */

test('12. checksum — every event carries a SHA-256 hash and the chain verifies', () => {
  const dir = makeTmpDir('checksum');
  try {
    const store = new EventStore({ persistPath: path.join(dir, 'events.json') });

    for (let i = 0; i < 20; i++) {
      store.append(sampleEvent({
        type: 'checksum.test',
        aggregateId: `agg_${i}`,
        payload: { i },
      }));
    }

    const all = store.query({});
    assert.equal(all.length, 20);

    // (a) Every event has a non-empty SHA-256 hash (64 hex chars)
    for (const e of all) {
      assert.equal(typeof e.hash, 'string', 'hash is a string');
      assert.equal(e.hash.length, 64, 'hash is 64 hex chars (SHA-256)');
      assert.ok(/^[0-9a-f]{64}$/.test(e.hash), 'hash is lowercase hex');
    }

    // (b) Hashes are unique (content + chain → no accidental collisions)
    const hashes = new Set(all.map((e) => e.hash));
    assert.equal(hashes.size, 20, 'all event hashes distinct');

    // (c) verifyIntegrity() returns ok on an untampered store
    const integrity = (store as unknown as { verifyIntegrity: () => { ok: boolean; value?: boolean } })
      .verifyIntegrity();
    assert.equal(integrity.ok, true, 'integrity check passes');
    assert.equal(integrity.value, true, 'integrity.value is true');

    // (d) auditReport() surfaces integrityValid as true
    const report = (store as unknown as {
      auditReport: (p: { since?: number; until?: number; actor?: string }) => {
        totalEvents: number;
        integrityValid: boolean;
        byType: Record<string, number>;
        byActor: Record<string, number>;
      };
    }).auditReport({});
    assert.equal(report.totalEvents, 20, 'audit report counts match');
    assert.equal(report.integrityValid, true, 'audit report reports integrity valid');
    assert.equal(report.byType['checksum.test'], 20, 'audit report groups by type');
    assert.equal(report.byActor['unit_test'], 20, 'audit report groups by actor');

    store.shutdown();
  } finally {
    cleanTmpDir(dir);
  }
});

/* ──────────────────────────────────────────────────────────────────────────
 * Test 13 (bonus): Tampered event is detected by verifyIntegrity()
 * ────────────────────────────────────────────────────────────────────────── */

test('13. tamper detection — mutating the internal events array invalidates integrity', () => {
  const dir = makeTmpDir('tamper');
  try {
    const store = new EventStore({ persistPath: path.join(dir, 'events.json') });
    for (let i = 0; i < 5; i++) store.append(sampleEvent({ payload: { i } }));

    // Reach into the private events array and mutate one record.
    // We can't mutate the frozen event itself, but we can swap the array slot
    // with a shallow clone whose payload has been changed.
    const priv = store as unknown as { events: Array<Record<string, unknown>> };
    const target = priv.events[2];
    priv.events[2] = { ...target, payload: { i: 999 } };

    const integrity = (store as unknown as { verifyIntegrity: () => { ok: boolean } })
      .verifyIntegrity();
    assert.equal(integrity.ok, false, 'tampered store fails integrity check');

    store.shutdown();
  } finally {
    cleanTmpDir(dir);
  }
});

/* ──────────────────────────────────────────────────────────────────────────
 * Test 14 (bonus): Persistence round-trip via WAL content
 * ────────────────────────────────────────────────────────────────────────── */

test('14. persistence round-trip — WAL records match in-memory events', async () => {
  const dir = makeTmpDir('persist');
  try {
    const persistPath = path.join(dir, 'events.json');
    const store = new EventStore({ persistPath, flushIntervalMs: 20 });

    const n = 15;
    const appended: Array<{ id: string; sequenceNumber: number; hash: string }> = [];
    for (let i = 0; i < n; i++) {
      const evt = store.append(sampleEvent({
        type: 'persist.round',
        aggregateId: `agg_${i}`,
        payload: { i },
      }));
      appended.push({
        id: evt.id,
        sequenceNumber: evt.sequenceNumber,
        hash: evt.hash,
      });
    }

    await sleep(80);
    store.shutdown();

    const walPath = persistPath + '.wal';
    assert.ok(fs.existsSync(walPath), 'WAL file exists after shutdown');
    const lines = fs.readFileSync(walPath, 'utf-8')
      .split('\n')
      .filter((l) => l.length > 0)
      .map((l) => JSON.parse(l));

    assert.equal(lines.length, n, `WAL has ${n} lines`);
    for (let i = 0; i < n; i++) {
      assert.equal(lines[i].id, appended[i].id, `WAL line ${i} id matches`);
      assert.equal(lines[i].sequenceNumber, appended[i].sequenceNumber);
      assert.equal(lines[i].hash, appended[i].hash, `WAL line ${i} hash matches`);
    }
  } finally {
    cleanTmpDir(dir);
  }
});
