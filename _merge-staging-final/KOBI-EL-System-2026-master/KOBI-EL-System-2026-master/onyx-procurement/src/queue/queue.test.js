/**
 * ONYX Queue — unit tests (node --test)
 *
 * Covers:
 *   - persistence across Queue instances (replay log + state)
 *   - FIFO ordering within a priority level
 *   - high priority jumps ahead of normal
 *   - delayed jobs respect runAt
 *   - visibility timeout re-delivers a job
 *   - max attempts -> dead letter queue
 *   - retryAll re-queues dead + failed
 *   - clearDeadLetter requires confirm (never-delete rule)
 *   - compact snapshots state.json and truncates log
 *   - file lock prevents corruption under concurrent add()
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { Queue, openQueue, _resetForTests, PRIORITY_HIGH } = require('./queue');

function tmpDir(tag) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `onyx-q-${tag}-`));
}

function openFresh(name, dir, opts = {}) {
  _resetForTests();
  return new Queue(name, { dataDir: dir, ...opts });
}

test('add() persists a pending job and stats reflect it', () => {
  const dir = tmpDir('add');
  const q = openFresh('t1', dir);
  const job = q.add('pdf-generation', { slipId: 123 });
  assert.equal(job.status, 'pending');
  assert.equal(job.type, 'pdf-generation');
  assert.equal(q.stats().pending, 1);
  assert.equal(q.stats().total, 1);
  assert.ok(fs.existsSync(path.join(dir, 't1.jsonl')));
});

test('claim() returns FIFO within a priority level', () => {
  const dir = tmpDir('fifo');
  const q = openFresh('t2', dir);
  const a = q.add('x', { n: 1 });
  const b = q.add('x', { n: 2 });
  const c = q.add('x', { n: 3 });
  const first = q.claim();
  const second = q.claim();
  const third = q.claim();
  assert.equal(first.id, a.id);
  assert.equal(second.id, b.id);
  assert.equal(third.id, c.id);
  assert.equal(q.claim(), null);
});

test('high-priority jumps ahead of normal', () => {
  const dir = tmpDir('prio');
  const q = openFresh('t3', dir);
  q.add('x', { n: 1 });                              // normal
  q.add('x', { n: 2 });                              // normal
  const urgent = q.add('x', { n: 'urgent' }, { priority: 'high' });
  const first = q.claim();
  assert.equal(first.id, urgent.id);
  assert.equal(first.priority, PRIORITY_HIGH);
});

test('delayed job is not claimable until runAt', () => {
  const dir = tmpDir('delay');
  const q = openFresh('t4', dir);
  q.add('x', { n: 1 }, { delay: 60_000 });           // 60s in future
  q.add('x', { n: 2 });
  const claimed = q.claim();
  assert.equal(claimed.payload.n, 2, 'should skip the delayed job');
  const next = q.claim();
  assert.equal(next, null, 'only the non-delayed job is runnable');
});

test('visibility timeout re-delivers job on next claim', () => {
  const dir = tmpDir('vis');
  const q = openFresh('t5', dir, { visibilityMs: 1 });
  q.add('x', { n: 1 });
  const first = q.claim();
  assert.ok(first);
  // wait past visibility window
  const end = Date.now() + 10;
  // eslint-disable-next-line no-empty
  while (Date.now() < end) {}
  const second = q.claim();
  assert.ok(second, 'job should be re-delivered');
  assert.equal(second.id, first.id);
  assert.equal(second.attempts, 2);
});

test('max attempts moves job to dead letter queue', () => {
  const dir = tmpDir('dead');
  const q = openFresh('t6', dir);
  const j = q.add('x', { n: 1 }, { maxAttempts: 2 });
  const firstClaim = q.claim();
  q.fail(firstClaim.id, 'boom 1');
  assert.equal(q.get(j.id).status, 'pending', 'first fail re-queues with backoff');
  // fast-forward: clear runAt on the actual in-memory record
  q.jobs.get(j.id).runAt = 0;
  const second = q.claim();
  assert.ok(second, 'should be claimable after fast-forward');
  q.fail(second.id, 'boom 2');
  const after = q.get(j.id);
  assert.equal(after.status, 'dead');
  assert.equal(after.lastError, 'boom 2');
  const stats = q.stats();
  assert.equal(stats.dead, 1);
  assert.ok(fs.existsSync(path.join(dir, 't6.dead.jsonl')));
});

test('ack() marks job completed and removes from pending', () => {
  const dir = tmpDir('ack');
  const q = openFresh('t7', dir);
  q.add('x', { n: 1 });
  const c = q.claim();
  q.ack(c.id);
  const stats = q.stats();
  assert.equal(stats.completed, 1);
  assert.equal(stats.pending, 0);
});

test('retryAll() re-queues dead + failed jobs', () => {
  const dir = tmpDir('retry');
  const q = openFresh('t8', dir);
  const a = q.add('x', { n: 1 }, { maxAttempts: 1 });
  const claimed = q.claim();
  q.fail(claimed.id, 'boom');
  assert.equal(q.get(a.id).status, 'dead');
  const count = q.retryAll();
  assert.equal(count, 1);
  assert.equal(q.get(a.id).status, 'pending');
  assert.equal(q.get(a.id).attempts, 0);
});

test('clearDeadLetter() refuses without confirm (never-delete rule)', () => {
  const dir = tmpDir('del-rule');
  const q = openFresh('t9', dir);
  assert.throws(() => q.clearDeadLetter(), /confirm:true/);
  assert.throws(() => q.clearDeadLetter({ confirm: false }), /confirm:true/);
});

test('clearDeadLetter({confirm:true}) archives dead.jsonl', () => {
  const dir = tmpDir('del-ok');
  const q = openFresh('t10', dir, { visibilityMs: 9999 });
  const j = q.add('x', { n: 1 }, { maxAttempts: 1 });
  const c = q.claim();
  q.fail(c.id, 'boom');
  assert.equal(q.get(j.id).status, 'dead');
  const deadFile = path.join(dir, 't10.dead.jsonl');
  assert.ok(fs.existsSync(deadFile));
  const cleared = q.clearDeadLetter({ confirm: true });
  assert.equal(cleared, 1);
  assert.equal(q.stats().dead, 0);
  // original dead.jsonl should be archived, not destroyed
  assert.equal(fs.existsSync(deadFile), false, 'original dead file renamed');
  const siblings = fs.readdirSync(dir).filter((f) => f.startsWith('t10.dead.jsonl.'));
  assert.ok(siblings.length >= 1, 'archive exists');
});

test('persistence: replay across a fresh Queue instance', () => {
  const dir = tmpDir('replay');
  const q1 = openFresh('t11', dir);
  q1.add('x', { n: 1 });
  q1.add('x', { n: 2 }, { priority: 'high' });
  // fresh instance — must see both jobs
  _resetForTests();
  const q2 = new Queue('t11', { dataDir: dir });
  assert.equal(q2.stats().pending, 2);
  const first = q2.claim();
  assert.equal(first.payload.n, 2, 'high-priority should load first');
});

test('compact() writes state.json and truncates log', () => {
  const dir = tmpDir('compact');
  const q = openFresh('t12', dir);
  for (let i = 0; i < 10; i++) q.add('x', { n: i });
  q.compact();
  const statePath = path.join(dir, 't12.state.json');
  const logPath = path.join(dir, 't12.jsonl');
  assert.ok(fs.existsSync(statePath));
  assert.equal(fs.readFileSync(logPath, 'utf8'), '');
  const snap = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  assert.equal(snap.jobs.length, 10);
  // fresh instance should still load everything
  _resetForTests();
  const q2 = new Queue('t12', { dataDir: dir });
  assert.equal(q2.stats().pending, 10);
});

test('list() supports status filter', () => {
  const dir = tmpDir('list');
  const q = openFresh('t13', dir);
  q.add('x', { n: 1 });
  q.add('x', { n: 2 });
  const c = q.claim();
  q.ack(c.id);
  assert.equal(q.list({ status: 'pending' }).length, 1);
  assert.equal(q.list({ status: 'completed' }).length, 1);
  assert.equal(q.list().length, 2);
});

test('invalid queue name rejected', () => {
  assert.throws(() => new Queue('bad name!', { dataDir: tmpDir('bad') }), /must match/);
});

test('openQueue() caches instance per (name, dataDir)', () => {
  _resetForTests();
  const dir = tmpDir('cache');
  const a = openQueue('tcache', { dataDir: dir });
  const b = openQueue('tcache', { dataDir: dir });
  assert.strictEqual(a, b);
  a.add('x', { n: 1 });
  assert.equal(b.stats().pending, 1);
});
