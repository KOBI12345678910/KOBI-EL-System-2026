/**
 * ONYX Error Tracker — unit tests (node --test)
 *
 * Covers:
 *   - deduplication by message + top stack frame
 *   - PII scrubbing (password, token, api_key, credit_card, national_id, tax_file)
 *   - file rotation at threshold
 *   - Express middleware error capture
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const tracker = require('./error-tracker');

// ─── helpers ───────────────────────────────────────────────────

function freshTmpDir(name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `onyx-et-${name}-`));
  return dir;
}

function readEvents(dir, file = 'errors.jsonl') {
  const p = path.join(dir, file);
  if (!fs.existsSync(p)) return [];
  return fs.readFileSync(p, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

function initIn(dir, extra = {}) {
  tracker._resetForTests({ logDir: dir });
  tracker.init({
    dsn: 'fake://onyx',
    release: 'onyx@test',
    environment: 'test',
    maxBufferBytes: 1_000_000,
    logDir: dir,
    ...extra,
  });
}

// ─── tests ─────────────────────────────────────────────────────

test('captureException writes a JSONL event with required fields', () => {
  const dir = freshTmpDir('capture');
  initIn(dir);

  const err = new Error('boom');
  const res = tracker.captureException(err, {
    tags: { route: '/rfq' },
    request_id: 'req-1',
  });

  assert.equal(res.deduplicated, false);
  const events = readEvents(dir);
  assert.equal(events.length, 1);

  const ev = events[0];
  assert.ok(ev.timestamp);
  assert.equal(ev.level, 'error');
  assert.equal(ev.message, 'boom');
  assert.ok(ev.stack && ev.stack.includes('Error: boom'));
  assert.ok(ev.fingerprint && ev.fingerprint.length >= 8);
  assert.equal(ev.tags.route, '/rfq');
  assert.equal(ev.release, 'onyx@test');
  assert.equal(ev.environment, 'test');
  assert.equal(ev.request_id, 'req-1');
});

test('captureException deduplicates by message + top stack frame', () => {
  const dir = freshTmpDir('dedupe');
  initIn(dir);

  function throwHere() {
    return new Error('same-error');
  }

  const e1 = throwHere();
  const e2 = throwHere(); // same call site → same top frame
  const r1 = tracker.captureException(e1);
  const r2 = tracker.captureException(e2);
  const r3 = tracker.captureException(e1);

  assert.equal(r1.deduplicated, false);
  assert.equal(r2.deduplicated, true);
  assert.equal(r3.deduplicated, true);
  assert.equal(r1.fingerprint, r2.fingerprint);

  const events = readEvents(dir);
  assert.equal(events.length, 1, 'only one event should be persisted');
});

test('captureException does NOT dedupe errors with different top frames', () => {
  const dir = freshTmpDir('dedupe-diff');
  initIn(dir);

  function a() { return new Error('x'); }
  function b() { return new Error('x'); }

  tracker.captureException(a());
  tracker.captureException(b());

  const events = readEvents(dir);
  assert.equal(events.length, 2);
});

test('captureMessage writes an event with level + message', () => {
  const dir = freshTmpDir('msg');
  initIn(dir);
  const res = tracker.captureMessage('hello world', 'warning');
  assert.equal(res.deduplicated, false);
  const events = readEvents(dir);
  assert.equal(events.length, 1);
  assert.equal(events[0].level, 'warning');
  assert.equal(events[0].message, 'hello world');
});

test('PII scrubbing removes password/token/api_key/credit_card/national_id/tax_file recursively', () => {
  const dir = freshTmpDir('pii');
  initIn(dir);

  const ctx = {
    tags: {
      password: 'hunter2',
      TOKEN: 'abc',
      safe: 'ok',
    },
    contexts: {
      user_info: {
        name: 'Alice',
        api_key: 'sk_live_xxx',
        nested: {
          credit_card: '4111111111111111',
          national_id: '123456789',
          tax_file: '987654321',
        },
      },
    },
  };

  tracker.captureMessage('pii-check', 'info', ctx);
  const events = readEvents(dir);
  assert.equal(events.length, 1);
  const ev = events[0];

  assert.equal(ev.tags.safe, 'ok');
  assert.equal(ev.tags.password, '[REDACTED]');
  assert.equal(ev.tags.TOKEN, '[REDACTED]');
  assert.equal(ev.contexts.user_info.name, 'Alice');
  assert.equal(ev.contexts.user_info.api_key, '[REDACTED]');
  assert.equal(ev.contexts.user_info.nested.credit_card, '[REDACTED]');
  assert.equal(ev.contexts.user_info.nested.national_id, '[REDACTED]');
  assert.equal(ev.contexts.user_info.nested.tax_file, '[REDACTED]');
});

test('setUser persists only id (no email/ip) in captured events', () => {
  const dir = freshTmpDir('user');
  initIn(dir);

  tracker.runInScope({ tags: {}, contexts: {}, user: null }, () => {
    tracker.setUser({ id: 'u-1', email: 'a@b.com', ip: '1.2.3.4' });
    tracker.captureMessage('who', 'info');
  });

  const events = readEvents(dir);
  assert.equal(events.length, 1);
  assert.deepEqual(events[0].user, { id: 'u-1' });
});

test('rotation: file rotates to .1 when it exceeds threshold', () => {
  const dir = freshTmpDir('rotate');
  initIn(dir);

  // Pre-seed a file larger than ROTATE_AT_BYTES
  const file = path.join(dir, 'errors.jsonl');
  const bigLine = 'x'.repeat(1024);
  const big = Buffer.alloc(tracker._ROTATE_AT_BYTES + 1024, bigLine);
  fs.writeFileSync(file, big);

  // Next write must trigger rotation
  tracker.captureMessage('after-rotate', 'info');

  assert.ok(fs.existsSync(path.join(dir, 'errors.jsonl.1')), 'errors.jsonl.1 should exist');
  assert.ok(fs.existsSync(file), 'a new errors.jsonl should exist');

  const newSize = fs.statSync(file).size;
  assert.ok(newSize < tracker._ROTATE_AT_BYTES, 'new file should be small');
});

test('rotation keeps only last 5 (.1..5)', () => {
  const dir = freshTmpDir('rotate-keep');
  initIn(dir);

  const base = path.join(dir, 'errors.jsonl');
  // Create .1..5 as placeholders
  for (let i = 1; i <= 5; i++) {
    fs.writeFileSync(`${base}.${i}`, `old-${i}`);
  }
  // Main file exceeds threshold
  fs.writeFileSync(base, Buffer.alloc(tracker._ROTATE_AT_BYTES + 10, 'y'));

  tracker._forceRotate();

  // Oldest (.5) must be dropped; .1 is the newly-rotated main file
  assert.ok(fs.existsSync(`${base}.1`));
  assert.ok(fs.existsSync(`${base}.2`));
  assert.ok(fs.existsSync(`${base}.3`));
  assert.ok(fs.existsSync(`${base}.4`));
  assert.ok(fs.existsSync(`${base}.5`));
  assert.ok(!fs.existsSync(`${base}.6`), 'must not keep more than 5 rotations');
});

test('errorHandler middleware captures err and calls next(err)', () => {
  const dir = freshTmpDir('mw');
  initIn(dir);

  const mw = tracker.errorHandler();
  const err = new Error('middleware-err');
  const req = {
    method: 'POST',
    originalUrl: '/api/rfq',
    headers: { 'x-request-id': 'abc-123', 'user-agent': 'jest' },
  };
  const res = {};
  let nextArg = 'NOT_CALLED';
  mw(err, req, res, (e) => { nextArg = e; });

  assert.strictEqual(nextArg, err, 'next(err) must be called with the same error');

  const events = readEvents(dir);
  assert.equal(events.length, 1);
  const ev = events[0];
  assert.equal(ev.message, 'middleware-err');
  assert.equal(ev.request_id, 'abc-123');
  assert.equal(ev.tags.method, 'POST');
  assert.equal(ev.tags.path, '/api/rfq');
  assert.equal(ev.tags.status, 500);
  assert.equal(ev.contexts.http.ua, 'jest');
});

test('errorHandler never throws if write fails (safe-by-default)', () => {
  const dir = freshTmpDir('mw-safe');
  initIn(dir, { logDir: path.join(dir, 'does', 'not', 'exist') });

  // Force a bad log dir by removing perms is not portable; instead, point
  // logDir at an unwritable location AFTER init
  tracker._resetForTests({ logDir: '' }); // empty path → appendFileSync throws, tracker must swallow
  tracker.init({ logDir: '', environment: 'test' });

  const mw = tracker.errorHandler();
  assert.doesNotThrow(() => {
    mw(new Error('safe'), { method: 'GET', originalUrl: '/x', headers: {} }, {}, () => {});
  });
});

test('setTag / setContext merge into the event', () => {
  const dir = freshTmpDir('tag-ctx');
  initIn(dir);

  tracker.runInScope({ tags: {}, contexts: {}, user: null }, () => {
    tracker.setTag('component', 'rfq');
    tracker.setContext('runtime', { node: 'v20' });
    tracker.captureMessage('tagged', 'info');
  });

  const events = readEvents(dir);
  assert.equal(events.length, 1);
  assert.equal(events[0].tags.component, 'rfq');
  assert.deepEqual(events[0].contexts.runtime, { node: 'v20' });
});
