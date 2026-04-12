/* ============================================================================
 * Techno-Kol ERP — sync-queue test suite
 * Agent X-19 / Swarm 3 / PWA Offline Support
 * ----------------------------------------------------------------------------
 * Covers:
 *   1.  queueRequest() persists an entry and returns an id
 *   2.  queueRequest() rejects invalid input
 *   3.  getQueueSize() counts only pending
 *   4.  getPending() sorts by timestamp ascending
 *   5.  processQueue() drains successfully on happy path
 *   6.  processQueue() retries on network error with exponential backoff
 *   7.  processQueue() stops on 4xx (non-retriable) and marks failed
 *   8.  processQueue() retries on 5xx / 429 / 408
 *   9.  clearProcessed() removes done + failed, keeps pending
 *   10. clearProcessed({includeFailed:false}) keeps failed
 *   11. backoffDelay() matches 500 * 2^n schedule capped at 30s
 *   12. multiple entries preserve FIFO order by timestamp
 *   13. processQueue() invokes onProgress callback per entry
 *   14. queueRequest() normalizes method to uppercase
 *   15. isOnline() returns boolean in fake environment
 *   16. installOnlineListeners is a no-op when window undefined
 *
 * This file uses a hand-rolled in-memory FakeIDB shim — zero deps.
 * Runs under plain Node (no test framework required). Can also be
 * adapted to Vitest / Jest via the standard `describe/it/expect` alias
 * layer at the top.
 * ========================================================================== */

'use strict';

/* ----------------------------------------------------------------------------
 * Hand-rolled fake IndexedDB (just enough for sync-queue.js)
 * -------------------------------------------------------------------------- */
function createFakeIDB() {
  const databases = new Map();

  function makeRequest() {
    const req = {
      result: undefined,
      error: null,
      onsuccess: null,
      onerror: null,
      onupgradeneeded: null,
      onblocked: null
    };
    return req;
  }

  function fireAsync(req, field, payload) {
    setTimeout(() => {
      if (typeof req[field] === 'function') req[field](payload);
    }, 0);
  }

  function makeStore(name, options) {
    const records = new Map(); // id -> value
    let nextId = 1;
    const indexes = new Map();
    return {
      name,
      keyPath: options.keyPath,
      autoIncrement: !!options.autoIncrement,
      records,
      indexes,
      createIndex(idxName, keyPath, idxOpts) {
        indexes.set(idxName, { keyPath, options: idxOpts || {} });
      },
      add(value) {
        const req = makeRequest();
        const id = nextId++;
        const stored = Object.assign({}, value, { [options.keyPath]: id });
        records.set(id, stored);
        req.result = id;
        fireAsync(req, 'onsuccess');
        return req;
      },
      put(value) {
        const req = makeRequest();
        const id = value[options.keyPath];
        records.set(id, Object.assign({}, value));
        req.result = id;
        fireAsync(req, 'onsuccess');
        return req;
      },
      get(id) {
        const req = makeRequest();
        req.result = records.has(id) ? Object.assign({}, records.get(id)) : undefined;
        fireAsync(req, 'onsuccess');
        return req;
      },
      delete(id) {
        const req = makeRequest();
        records.delete(id);
        req.result = undefined;
        fireAsync(req, 'onsuccess');
        return req;
      },
      getAll() {
        const req = makeRequest();
        req.result = Array.from(records.values()).map((v) => Object.assign({}, v));
        fireAsync(req, 'onsuccess');
        return req;
      },
      clear() {
        const req = makeRequest();
        records.clear();
        nextId = 1;
        req.result = undefined;
        fireAsync(req, 'onsuccess');
        return req;
      }
    };
  }

  function makeDB(name, version) {
    const stores = new Map();
    const db = {
      name,
      version,
      objectStoreNames: {
        contains: (n) => stores.has(n),
        _stores: stores
      },
      createObjectStore(storeName, options) {
        const s = makeStore(storeName, options || {});
        stores.set(storeName, s);
        return s;
      },
      transaction(storeName) {
        const store = stores.get(storeName);
        if (!store) throw new Error(`No store ${storeName}`);
        return {
          objectStore: () => store,
          oncomplete: null
        };
      },
      close() { /* noop */ }
    };
    return db;
  }

  const fakeIdb = {
    open(name, version) {
      const req = makeRequest();
      let db = databases.get(name);
      const isNew = !db;
      if (isNew || (db && db.version < version)) {
        db = makeDB(name, version);
        databases.set(name, db);
      }
      setTimeout(() => {
        if (isNew && typeof req.onupgradeneeded === 'function') {
          req.result = db;
          req.onupgradeneeded({ target: req });
        }
        req.result = db;
        if (typeof req.onsuccess === 'function') req.onsuccess({ target: req });
      }, 0);
      return req;
    },
    _reset() { databases.clear(); }
  };
  return fakeIdb;
}

/* ----------------------------------------------------------------------------
 * Tiny assertion + harness (no deps)
 * -------------------------------------------------------------------------- */
const results = [];
let currentName = '';

function assertEq(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error(`${msg || 'assertEq'}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}
function assertDeep(actual, expected, msg) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${msg || 'assertDeep'}: ${a} !== ${e}`);
}
function assertTrue(cond, msg) {
  if (!cond) throw new Error(msg || 'assertTrue failed');
}
function assertThrows(fn, msg) {
  let threw = false;
  try { fn(); } catch (_) { threw = true; }
  if (!threw) throw new Error(msg || 'expected throw');
}
async function assertRejects(promise, msg) {
  let rejected = false;
  try { await promise; } catch (_) { rejected = true; }
  if (!rejected) throw new Error(msg || 'expected rejection');
}

async function test(name, fn) {
  currentName = name;
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`  ok  - ${name}`);
  } catch (err) {
    results.push({ name, ok: false, error: err.message });
    console.log(`  FAIL- ${name}\n        ${err.message}`);
  }
}

/* ----------------------------------------------------------------------------
 * Test runner
 * -------------------------------------------------------------------------- */
async function run() {
  const fakeIdb = createFakeIDB();

  // dynamic import of the SUT with fake IDB
  const modUrl = new URL('../../payroll-autonomous/src/offline/sync-queue.js', import.meta.url);
  const mod = await import(modUrl.href);
  const {
    queueRequest, getPending, getQueueSize, processQueue,
    clearProcessed, clearAll, backoffDelay, isOnline,
    installOnlineListeners, STATUS
  } = mod;

  const opts = { idbFactory: fakeIdb };
  const noSleep = { sleep: () => Promise.resolve() };

  console.log('sync-queue.test.js — Techno-Kol ERP offline queue');
  console.log('----------------------------------------------------');

  await test('01 queueRequest persists entry and returns numeric id', async () => {
    fakeIdb._reset();
    const id = await queueRequest({
      url: '/api/invoices',
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ total: 1200 })
    }, opts);
    assertEq(typeof id, 'number', 'id should be number');
    assertTrue(id > 0, 'id should be positive');
    const size = await getQueueSize(opts);
    assertEq(size, 1, 'queue size should be 1');
  });

  await test('02 queueRequest rejects invalid input', async () => {
    fakeIdb._reset();
    await assertRejects(queueRequest(null, opts), 'null payload');
    await assertRejects(queueRequest({}, opts), 'missing url');
    await assertRejects(queueRequest({ url: '/a' }, opts), 'missing method');
  });

  await test('03 getQueueSize counts only pending', async () => {
    fakeIdb._reset();
    await queueRequest({ url: '/a', method: 'POST' }, opts);
    await queueRequest({ url: '/b', method: 'POST' }, opts);
    await queueRequest({ url: '/c', method: 'POST' }, opts);
    let size = await getQueueSize(opts);
    assertEq(size, 3, 'initial size');

    // mark one done via processQueue with always-ok fetch
    const fetchFn = async () => ({ ok: true, status: 200 });
    await processQueue(Object.assign({}, opts, noSleep, { fetchFn }));
    size = await getQueueSize(opts);
    assertEq(size, 0, 'all drained → pending=0');
  });

  await test('04 getPending sorts by timestamp ascending', async () => {
    fakeIdb._reset();
    await queueRequest({ url: '/z', method: 'POST', timestamp: 3000 }, opts);
    await queueRequest({ url: '/a', method: 'POST', timestamp: 1000 }, opts);
    await queueRequest({ url: '/m', method: 'POST', timestamp: 2000 }, opts);
    const pending = await getPending(opts);
    assertEq(pending.length, 3);
    assertDeep(pending.map((e) => e.url), ['/a', '/m', '/z'], 'sorted by ts');
  });

  await test('05 processQueue happy path drains all entries', async () => {
    fakeIdb._reset();
    await queueRequest({ url: '/api/x', method: 'POST', body: '{}' }, opts);
    await queueRequest({ url: '/api/y', method: 'PUT', body: '{}' }, opts);
    const calls = [];
    const fetchFn = async (url, init) => {
      calls.push({ url, method: init.method, body: init.body });
      return { ok: true, status: 200 };
    };
    const summary = await processQueue(Object.assign({}, opts, noSleep, { fetchFn }));
    assertEq(summary.ok, 2, 'ok count');
    assertEq(summary.fail, 0, 'fail count');
    assertEq(calls.length, 2, 'fetch called twice');
    assertEq(calls[0].method, 'POST');
    assertEq(calls[1].method, 'PUT');
  });

  await test('06 processQueue retries on network error with backoff', async () => {
    fakeIdb._reset();
    await queueRequest({ url: '/api/flaky', method: 'POST', body: '{}' }, opts);
    let attempts = 0;
    const fetchFn = async () => {
      attempts++;
      if (attempts < 3) throw new Error('ECONNRESET');
      return { ok: true, status: 200 };
    };
    const summary = await processQueue(Object.assign({}, opts, noSleep, {
      fetchFn, maxAttempts: 5
    }));
    assertEq(attempts, 3, 'retried twice then succeeded');
    assertEq(summary.ok, 1);
    assertEq(summary.fail, 0);
  });

  await test('07 processQueue stops on 4xx (non-retriable)', async () => {
    fakeIdb._reset();
    await queueRequest({ url: '/api/forbidden', method: 'DELETE' }, opts);
    let attempts = 0;
    const fetchFn = async () => {
      attempts++;
      return { ok: false, status: 403 };
    };
    const summary = await processQueue(Object.assign({}, opts, noSleep, {
      fetchFn, maxAttempts: 5
    }));
    assertEq(attempts, 1, 'should not retry on 403');
    assertEq(summary.ok, 0);
    assertEq(summary.fail, 1);
  });

  await test('08 processQueue retries on 5xx / 408 / 429', async () => {
    fakeIdb._reset();
    await queueRequest({ url: '/api/overloaded', method: 'POST' }, opts);
    const statuses = [503, 429, 200];
    let i = 0;
    const fetchFn = async () => {
      const s = statuses[i++];
      return { ok: s < 400, status: s };
    };
    const summary = await processQueue(Object.assign({}, opts, noSleep, {
      fetchFn, maxAttempts: 5
    }));
    assertEq(summary.ok, 1, '503→429→200 eventually ok');
    assertEq(i, 3, 'three attempts made');
  });

  await test('09 clearProcessed removes done + failed, keeps pending', async () => {
    fakeIdb._reset();
    await queueRequest({ url: '/api/a', method: 'POST' }, opts); // will succeed
    await queueRequest({ url: '/api/b', method: 'POST' }, opts); // will 403
    await queueRequest({ url: '/api/c', method: 'POST' }, opts); // will remain pending by not being processed
    let call = 0;
    const fetchFn = async (url) => {
      call++;
      if (url === '/api/a') return { ok: true, status: 200 };
      if (url === '/api/b') return { ok: false, status: 403 };
      return { ok: true, status: 200 };
    };
    // process first two entries only by queueing new one AFTER
    await processQueue(Object.assign({}, opts, noSleep, { fetchFn }));
    // new pending entry added after processing
    await queueRequest({ url: '/api/d', method: 'POST' }, opts);
    const removed = await clearProcessed(opts);
    assertTrue(removed >= 2, `expected at least 2 removed, got ${removed}`);
    const remaining = await getQueueSize(opts);
    assertEq(remaining, 1, 'only /api/d pending remains');
  });

  await test('10 clearProcessed({includeFailed:false}) preserves failed', async () => {
    fakeIdb._reset();
    await queueRequest({ url: '/api/ok', method: 'POST' }, opts);
    await queueRequest({ url: '/api/bad', method: 'POST' }, opts);
    const fetchFn = async (url) => ({ ok: url === '/api/ok', status: url === '/api/ok' ? 200 : 403 });
    await processQueue(Object.assign({}, opts, noSleep, { fetchFn }));
    const removed = await clearProcessed(Object.assign({}, opts, { includeFailed: false }));
    assertEq(removed, 1, 'only done removed');
  });

  await test('11 backoffDelay matches 500 * 2^n capped at 30s', () => {
    assertEq(backoffDelay(0), 500);
    assertEq(backoffDelay(1), 1000);
    assertEq(backoffDelay(2), 2000);
    assertEq(backoffDelay(3), 4000);
    assertEq(backoffDelay(4), 8000);
    assertEq(backoffDelay(5), 16000);
    assertEq(backoffDelay(6), 30000, 'cap kicks in at n=6 (32000→30000)');
    assertEq(backoffDelay(10), 30000, 'still capped');
    assertEq(backoffDelay(-1), 500, 'negative attempt clamps to 0');
  });

  await test('12 multiple entries preserve FIFO by timestamp', async () => {
    fakeIdb._reset();
    const ids = [];
    ids.push(await queueRequest({ url: '/1', method: 'POST', timestamp: 100 }, opts));
    ids.push(await queueRequest({ url: '/2', method: 'POST', timestamp: 200 }, opts));
    ids.push(await queueRequest({ url: '/3', method: 'POST', timestamp: 300 }, opts));
    const order = [];
    const fetchFn = async (url) => { order.push(url); return { ok: true, status: 200 }; };
    await processQueue(Object.assign({}, opts, noSleep, { fetchFn }));
    assertDeep(order, ['/1', '/2', '/3'], 'FIFO preserved');
  });

  await test('13 processQueue invokes onProgress per entry', async () => {
    fakeIdb._reset();
    await queueRequest({ url: '/p1', method: 'POST' }, opts);
    await queueRequest({ url: '/p2', method: 'POST' }, opts);
    const events = [];
    const fetchFn = async () => ({ ok: true, status: 200 });
    await processQueue(Object.assign({}, opts, noSleep, {
      fetchFn,
      onProgress: (e) => events.push({ processed: e.processed, ok: e.ok })
    }));
    assertEq(events.length, 2);
    assertEq(events[0].processed, 1);
    assertEq(events[1].processed, 2);
    assertTrue(events[0].ok && events[1].ok);
  });

  await test('14 queueRequest normalizes method to uppercase', async () => {
    fakeIdb._reset();
    await queueRequest({ url: '/api/x', method: 'post' }, opts);
    const pending = await getPending(opts);
    assertEq(pending[0].method, 'POST', 'method normalized');
  });

  await test('15 isOnline returns boolean in fake environment', () => {
    const result = isOnline();
    assertEq(typeof result, 'boolean');
  });

  await test('16 installOnlineListeners no-ops when window undefined', () => {
    const fn = installOnlineListeners(() => {}, () => {});
    assertEq(typeof fn, 'function', 'returns unsubscribe function');
    fn(); // should not throw
  });

  /* -------- summary -------- */
  const passed = results.filter((r) => r.ok).length;
  const failed = results.length - passed;
  console.log('----------------------------------------------------');
  console.log(`Total: ${results.length}  Passed: ${passed}  Failed: ${failed}`);
  if (failed > 0) {
    console.log('FAILED TESTS:');
    for (const r of results) if (!r.ok) console.log(`  - ${r.name}: ${r.error}`);
    if (typeof process !== 'undefined') process.exitCode = 1;
  }
}

/* ----------------------------------------------------------------------------
 * Entry point
 * -------------------------------------------------------------------------- */
run().catch((err) => {
  console.error('RUNNER ERROR:', err);
  if (typeof process !== 'undefined') process.exit(2);
});

export { run, createFakeIDB };
