/**
 * ONYX Queue Worker — unit tests (node --test)
 *
 * Covers:
 *   - handler registration + successful processing
 *   - per-job timeout triggers failure
 *   - error in handler fails the job + retries (respects maxAttempts)
 *   - concurrent processing up to concurrency N
 *   - unknown job type fails with clear error
 *   - graceful shutdown awaits in-flight jobs
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { Queue, openQueue, _resetForTests } = require('./queue');
const { Worker } = require('./worker');

function tmpDir(tag) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `onyx-w-${tag}-`));
}

function openWithWorker(name, dir, workerOpts = {}) {
  _resetForTests();
  const queue = openQueue(name, { dataDir: dir, visibilityMs: 5_000 });
  const w = new Worker(name, {
    pollMs: 5,
    jobTimeoutMs: 1_000,
    queueOpts: { dataDir: dir, visibilityMs: 5_000 },
    ...workerOpts,
  });
  // force worker to use same queue instance (openQueue caches by name+dataDir,
  // so this already happens — but be explicit for clarity)
  return { queue, worker: w };
}

function waitUntil(fn, timeoutMs = 2_000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      if (fn()) return resolve();
      if (Date.now() - start > timeoutMs) return reject(new Error('waitUntil timeout'));
      setTimeout(tick, 5);
    };
    tick();
  });
}

test('worker processes a job via registered handler', async () => {
  const dir = tmpDir('ok');
  const { queue, worker } = openWithWorker('tw1', dir);
  const seen = [];
  worker.register('demo', async (payload) => {
    seen.push(payload.n);
    return { done: true };
  });
  queue.add('demo', { n: 42 });
  worker.start();
  await waitUntil(() => queue.stats().completed === 1);
  await worker.stop();
  assert.deepEqual(seen, [42]);
  assert.equal(queue.stats().completed, 1);
  assert.equal(queue.stats().pending, 0);
});

test('per-job timeout fires and fails the job', async () => {
  const dir = tmpDir('timeout');
  const { queue, worker } = openWithWorker('tw2', dir, { jobTimeoutMs: 30 });
  worker.register('slow', async () => new Promise(() => {})); // never resolves
  queue.add('slow', {}, { maxAttempts: 1 });
  worker.start();
  await waitUntil(() => queue.stats().dead === 1, 3_000);
  await worker.stop();
  const failed = queue.list({ status: 'dead' });
  assert.equal(failed.length, 1);
  assert.match(failed[0].lastError || '', /timeout/);
});

test('thrown error retries up to maxAttempts then dead-letters', async () => {
  const dir = tmpDir('retry');
  const { queue, worker } = openWithWorker('tw3', dir);
  let calls = 0;
  worker.register('flaky', async () => {
    calls++;
    throw new Error('boom');
  });
  const j = queue.add('flaky', {}, { maxAttempts: 2 });
  worker.start();
  // 1st run fails -> re-queued with backoff (1s). We force the job runnable.
  await waitUntil(() => calls >= 1, 2_000);
  // Fast-forward runAt manually so 2nd attempt can be claimed immediately
  const rec = queue.get(j.id);
  rec.runAt = 0;
  queue.jobs.set(j.id, rec);
  await waitUntil(() => queue.stats().dead === 1, 3_000);
  await worker.stop();
  assert.ok(calls >= 2, `handler should be called at least twice, was ${calls}`);
  assert.equal(queue.stats().dead, 1);
});

test('concurrency N lets N jobs run in parallel', async () => {
  const dir = tmpDir('conc');
  const { queue, worker } = openWithWorker('tw4', dir, { concurrency: 3 });
  let inFlight = 0;
  let peak = 0;
  worker.register('sleep', async () => {
    inFlight++;
    peak = Math.max(peak, inFlight);
    await new Promise((r) => setTimeout(r, 50));
    inFlight--;
  });
  for (let i = 0; i < 6; i++) queue.add('sleep', { i });
  worker.start();
  await waitUntil(() => queue.stats().completed === 6, 3_000);
  await worker.stop();
  assert.ok(peak >= 2, `peak in-flight should be >= 2, was ${peak}`);
  assert.ok(peak <= 3, `peak in-flight must not exceed concurrency 3, was ${peak}`);
});

test('unknown job type fails with clear error', async () => {
  const dir = tmpDir('unknown');
  const { queue, worker } = openWithWorker('tw5', dir);
  queue.add('nosuch', {}, { maxAttempts: 1 });
  worker.start();
  await waitUntil(() => queue.stats().dead === 1, 2_000);
  await worker.stop();
  const dead = queue.list({ status: 'dead' });
  assert.equal(dead.length, 1);
  assert.match(dead[0].lastError || '', /no handler registered/);
});

test('graceful stop() awaits in-flight jobs', async () => {
  const dir = tmpDir('shutdown');
  const { queue, worker } = openWithWorker('tw6', dir, { jobTimeoutMs: 2_000 });
  let finished = false;
  worker.register('long', async () => {
    await new Promise((r) => setTimeout(r, 120));
    finished = true;
  });
  queue.add('long', {});
  worker.start();
  await waitUntil(() => worker.activeJobs.size === 1, 1_000);
  const stopPromise = worker.stop();
  await stopPromise;
  assert.equal(finished, true, 'in-flight job should complete before stop resolves');
  assert.equal(queue.stats().completed, 1);
});

test('job:completed event fires with elapsed + result', async () => {
  const dir = tmpDir('events');
  const { queue, worker } = openWithWorker('tw7', dir);
  worker.register('demo', async () => ({ ok: 1 }));
  const events = [];
  worker.on('job:completed', (e) => events.push(e));
  queue.add('demo', { n: 1 });
  worker.start();
  await waitUntil(() => events.length === 1, 1_500);
  await worker.stop();
  assert.equal(events[0].result.ok, 1);
  assert.ok(typeof events[0].elapsed === 'number');
});
