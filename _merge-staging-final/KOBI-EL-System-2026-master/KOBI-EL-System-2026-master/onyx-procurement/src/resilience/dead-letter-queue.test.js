/**
 * Unit tests for src/resilience/dead-letter-queue.js
 * Agent-79 — Resilience pack.
 *
 * Run:
 *   node --test src/resilience/dead-letter-queue.test.js
 *
 * Strategy:
 *   - Route the DLQ at a per-test tmpdir so the real `data/dlq` folder
 *     is never touched and suites are parallel-safe.
 *   - Build a tiny fake Express-like app to exercise the admin routes.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  DeadLetterQueue,
  createDeadLetterQueue,
  registerAdminRoutes,
} = require('./dead-letter-queue');

// ─── Helpers ──────────────────────────────────────────────────

function tmpRoot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'onyx-dlq-'));
  return dir;
}

/** Tiny Express-compatible stub: just enough for our route handlers. */
function makeFakeApp() {
  const routes = { get: [], post: [], delete: [] };
  const app = {
    get: (p, ...h) => routes.get.push({ path: p, handlers: h }),
    post: (p, ...h) => routes.post.push({ path: p, handlers: h }),
    delete: (p, ...h) => routes.delete.push({ path: p, handlers: h }),
  };

  async function invoke(method, pathTmpl, params = {}, body = null, query = {}) {
    const list = routes[method];
    const r = list.find((x) => x.path === pathTmpl);
    if (!r) throw new Error(`no route ${method} ${pathTmpl}`);
    const req = {
      method: method.toUpperCase(),
      params,
      body,
      query,
      headers: { 'x-actor': 'tester' },
      user: { email: 'tester@onyx' },
    };
    let statusCode = 200;
    const res = {
      statusCode,
      _body: null,
      status(c) { this.statusCode = c; return this; },
      json(obj) { this._body = obj; return this; },
    };
    // Chain all handlers; our routes here always have [auth?, handler].
    for (const h of r.handlers) {
      let nextCalled = false;
      // eslint-disable-next-line no-await-in-loop
      await h(req, res, () => { nextCalled = true; });
      if (!nextCalled && res._body !== null) break;
    }
    return res;
  }

  return { app, invoke };
}

// ───────────────────────────────────────────────────────────────
// DeadLetterQueue unit tests
// ───────────────────────────────────────────────────────────────

test('DLQ: validates queue name', () => {
  assert.throws(() => new DeadLetterQueue('bad name!', { root: tmpRoot() }));
  assert.throws(() => new DeadLetterQueue('', { root: tmpRoot() }));
});

test('DLQ: add stores entry with id + timestamps', () => {
  const q = new DeadLetterQueue('email', { root: tmpRoot() });
  const entry = q.add({
    operation: 'send-email',
    inputs: { to: 'a@b', subject: 'x' },
    error: new Error('SMTP 550'),
    attempts: 3,
  });
  assert.ok(entry.id && entry.id.length === 32);
  assert.equal(entry.operation, 'send-email');
  assert.equal(entry.attempts, 3);
  assert.equal(entry.error.message, 'SMTP 550');
  assert.ok(entry.enqueuedAt);
});

test('DLQ: list returns all active entries', () => {
  const q = new DeadLetterQueue('q1', { root: tmpRoot() });
  q.add({ operation: 'op-a', inputs: {}, error: new Error('a') });
  q.add({ operation: 'op-b', inputs: {}, error: new Error('b') });
  q.add({ operation: 'op-c', inputs: {}, error: new Error('c') });
  const rows = q.list();
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map((r) => r.operation), ['op-a', 'op-b', 'op-c']);
});

test('DLQ: get returns by id or null', () => {
  const q = new DeadLetterQueue('q2', { root: tmpRoot() });
  const e = q.add({ operation: 'o', inputs: {}, error: new Error('x') });
  assert.equal(q.get(e.id).operation, 'o');
  assert.equal(q.get('missing'), null);
});

test('DLQ: remove tombstones entry and writes audit log', () => {
  const root = tmpRoot();
  const q = new DeadLetterQueue('q3', { root });
  const e = q.add({ operation: 'o', inputs: {}, error: new Error('x') });
  assert.equal(q.remove(e.id, { actor: 'kobi', reason: 'false positive' }), true);
  assert.equal(q.list().length, 0);

  // Still accessible with includeDeleted=true
  const all = q.list({ includeDeleted: true });
  assert.equal(all.length, 1);
  assert.equal(all[0].deleted, true);

  // Audit log entry exists
  const auditRaw = fs.readFileSync(path.join(root, 'q3.audit.jsonl'), 'utf8').trim();
  const audit = JSON.parse(auditRaw);
  assert.equal(audit.action, 'remove');
  assert.equal(audit.actor, 'kobi');
  assert.equal(audit.reason, 'false positive');
});

test('DLQ: remove returns false for unknown id', () => {
  const q = new DeadLetterQueue('q4', { root: tmpRoot() });
  assert.equal(q.remove('nope'), false);
});

test('DLQ: replay executes runner and audits', async () => {
  const root = tmpRoot();
  const q = new DeadLetterQueue('q5', { root });
  const e = q.add({ operation: 'resend', inputs: { id: 1 }, error: new Error('x') });

  const runner = async (entry) => ({ ok: true, ran: entry.operation });
  const result = await q.replay(e.id, runner);
  assert.deepEqual(result, { ok: true, ran: 'resend' });

  const auditRaw = fs.readFileSync(path.join(root, 'q5.audit.jsonl'), 'utf8').trim();
  const audit = JSON.parse(auditRaw);
  assert.equal(audit.action, 'replay');
  assert.equal(audit.ok, true);
});

test('DLQ: replay rejects missing id with 404', async () => {
  const q = new DeadLetterQueue('q6', { root: tmpRoot() });
  await assert.rejects(
    q.replay('nope', async () => 1),
    (err) => err.status === 404,
  );
});

test('DLQ: replay rejects deleted entry with 410', async () => {
  const q = new DeadLetterQueue('q7', { root: tmpRoot() });
  const e = q.add({ operation: 'o', inputs: {}, error: new Error('x') });
  q.remove(e.id, { actor: 'x' });
  await assert.rejects(
    q.replay(e.id, async () => 1),
    (err) => err.status === 410,
  );
});

test('DLQ: tolerates corrupted lines in jsonl', () => {
  const root = tmpRoot();
  const q = new DeadLetterQueue('q8', { root });
  q.add({ operation: 'good', inputs: {}, error: new Error('x') });
  fs.appendFileSync(path.join(root, 'q8.jsonl'), 'not-json-at-all\n');
  const e2 = q.add({ operation: 'good-again', inputs: {}, error: new Error('y') });
  const rows = q.list();
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((r) => r.operation), ['good', 'good-again']);
  assert.equal(rows[1].id, e2.id);
});

test('DLQ: createDeadLetterQueue returns singleton per (root, name)', () => {
  const root = tmpRoot();
  const a = createDeadLetterQueue('singleton', { root });
  const b = createDeadLetterQueue('singleton', { root });
  assert.equal(a, b);
});

// ───────────────────────────────────────────────────────────────
// Admin routes
// ───────────────────────────────────────────────────────────────

test('Admin route: GET /api/admin/dlq/:queue returns entries', async () => {
  const root = tmpRoot();
  const q = createDeadLetterQueue('admin1', { root });
  q.add({ operation: 'o1', inputs: { a: 1 }, error: new Error('e1') });
  q.add({ operation: 'o2', inputs: { a: 2 }, error: new Error('e2') });

  const { app, invoke } = makeFakeApp();
  registerAdminRoutes(app, {
    getQueue: (name) => createDeadLetterQueue(name, { root }),
  });
  const res = await invoke('get', '/api/admin/dlq/:queue', { queue: 'admin1' });
  assert.equal(res.statusCode, 200);
  assert.equal(res._body.count, 2);
  assert.equal(res._body.entries.length, 2);
});

test('Admin route: DELETE tombstones and audits', async () => {
  const root = tmpRoot();
  const q = createDeadLetterQueue('admin2', { root });
  const e = q.add({ operation: 'o', inputs: {}, error: new Error('x') });

  const { app, invoke } = makeFakeApp();
  registerAdminRoutes(app, {
    getQueue: (name) => createDeadLetterQueue(name, { root }),
  });
  const res = await invoke('delete', '/api/admin/dlq/:queue/:id', {
    queue: 'admin2', id: e.id,
  }, { reason: 'cleanup' });
  assert.equal(res.statusCode, 200);
  assert.equal(res._body.ok, true);
  // Gone from active list
  assert.equal(q.list().length, 0);
});

test('Admin route: DELETE unknown id returns 404', async () => {
  const root = tmpRoot();
  createDeadLetterQueue('admin3', { root });
  const { app, invoke } = makeFakeApp();
  registerAdminRoutes(app, {
    getQueue: (name) => createDeadLetterQueue(name, { root }),
  });
  const res = await invoke('delete', '/api/admin/dlq/:queue/:id', {
    queue: 'admin3', id: 'not-real',
  });
  assert.equal(res.statusCode, 404);
});

test('Admin route: POST replay runs the configured runner', async () => {
  const root = tmpRoot();
  const q = createDeadLetterQueue('admin4', { root });
  const e = q.add({ operation: 'resend-email', inputs: { to: 'a' }, error: new Error('x') });

  let ranWith = null;
  const { app, invoke } = makeFakeApp();
  registerAdminRoutes(app, {
    getQueue: (name) => createDeadLetterQueue(name, { root }),
    replayRunner: async (entry) => { ranWith = entry; return 'sent'; },
  });
  const res = await invoke('post', '/api/admin/dlq/:queue/replay/:id', {
    queue: 'admin4', id: e.id,
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res._body.ok, true);
  assert.equal(res._body.result, 'sent');
  assert.equal(ranWith.operation, 'resend-email');
});

test('Admin route: POST replay returns 501 when runner missing', async () => {
  const root = tmpRoot();
  const q = createDeadLetterQueue('admin5', { root });
  const e = q.add({ operation: 'o', inputs: {}, error: new Error('x') });

  const { app, invoke } = makeFakeApp();
  registerAdminRoutes(app, {
    getQueue: (name) => createDeadLetterQueue(name, { root }),
  });
  const res = await invoke('post', '/api/admin/dlq/:queue/replay/:id', {
    queue: 'admin5', id: e.id,
  });
  assert.equal(res.statusCode, 501);
});

test('Admin routes: auth middleware is invoked', async () => {
  const root = tmpRoot();
  createDeadLetterQueue('admin6', { root });
  let authCalls = 0;

  const { app, invoke } = makeFakeApp();
  registerAdminRoutes(app, {
    getQueue: (name) => createDeadLetterQueue(name, { root }),
    auth: (_req, _res, next) => { authCalls += 1; next(); },
  });
  await invoke('get', '/api/admin/dlq/:queue', { queue: 'admin6' });
  assert.equal(authCalls, 1);
});
