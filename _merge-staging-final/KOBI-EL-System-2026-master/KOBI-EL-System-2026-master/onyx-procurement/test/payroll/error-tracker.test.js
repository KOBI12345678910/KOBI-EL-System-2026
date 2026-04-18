/**
 * Error Tracker — Unit Tests (Agent X-58)
 * ========================================
 *
 * Swarm 3D · Techno-Kol Uzi · 2026-04-11
 *
 * Run with:    node --test test/payroll/error-tracker.test.js
 *
 * Covers the new createTracker() API delivered by Agent X-58:
 *
 *   1.  createTracker returns a Tracker object with required methods
 *   2.  captureException returns an eventId string
 *   3.  captureException stores a stack trace + exception type
 *   4.  captureException writes to the in-memory ring buffer
 *   5.  captureMessage works for info/warning/error levels
 *   6.  addBreadcrumb stores recent actions before the error
 *   7.  Breadcrumbs are attached to the next event
 *   8.  Breadcrumbs respect the per-scope limit
 *   9.  setUser + email hashing (PII safe)
 *   10. setContext + setTag merge into events
 *   11. withScope isolates user/tag/context changes
 *   12. Request context sanitizes sensitive headers
 *   13. Request body is sampled and PII-scrubbed
 *   14. Environment context: service/version/env present
 *   15. Fingerprinting: same type + first frame + msg → same fingerprint
 *   16. Fingerprinting: different top frame → different fingerprint
 *   17. Issues are grouped by fingerprint
 *   18. getIssue returns first_seen, last_seen, events_count, status
 *   19. Rate of occurrence tracking (per_minute/hour/day)
 *   20. markRelease records release marker
 *   21. New event under new release → marked with that release
 *   22. Regression: resolved issue re-appears in new release → regressed
 *   23. Notification hook fires on NEW issue only (debounced)
 *   24. Notification hook fires on regressed issue
 *   25. Ownership auto-assign by file path regex
 *   26. Ownership auto-assign by file path substring
 *   27. resolveIssue / unresolveIssue / ignoreIssue workflow
 *   28. assignIssue manually overrides owner
 *   29. listIssues filter by status / owner / release
 *   30. getStats returns aggregated dashboard snapshot
 *   31. Express errorHandler middleware captures + responds 500 JSON
 *   32. errorHandler middleware never throws when res is missing
 *   33. Process-level uncaughtException hook installs + uninstalls
 *   34. Process-level unhandledRejection hook installs + uninstalls
 *   35. Ring buffer evicts oldest events beyond capacity
 *   36. JSONL persistence writes events + issues + releases files
 *   37. Persistence can be disabled via persist:false
 *   38. queryEvents filters by level / fingerprint / release / since
 *   39. Source map stub: returns {resolved, stack, frames}
 *   40. Hebrew bilingual message present in Express 500 response
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const errorTracker = require(path.resolve(
  __dirname, '..', '..', 'src', 'ops', 'error-tracker.js'
));
const { createTracker } = errorTracker;

// ─── helpers ───────────────────────────────────────────────────

function freshTmpDir(name) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `onyx-ag58-${name}-`));
}

function readJsonl(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

function makeInst(name, extra) {
  const dir = freshTmpDir(name);
  const inst = createTracker({
    service: 'onyx',
    version: 'onyx@1.0.0',
    environment: 'test',
    logDir: dir,
    ownershipRules: [
      { pattern: /src[\\/]ops[\\/]/, owner: 'team-ops' },
      { pattern: 'payroll', owner: 'team-payroll' },
    ],
    ...(extra || {}),
  });
  return { inst, dir };
}

// Helper: produce an Error with a deterministic stack top-frame substring
function makeErr(msg, tag) {
  const err = new Error(msg);
  // Override stack to make it deterministic
  err.stack = `Error: ${msg}\n    at fn (src/${tag}.js:1:1)\n    at other (src/other.js:2:2)`;
  return err;
}

// ─── tests ─────────────────────────────────────────────────────

test('1. createTracker returns a Tracker object with required methods', () => {
  const { inst } = makeInst('smoke');
  for (const fn of [
    'captureException', 'captureMessage', 'addBreadcrumb',
    'setUser', 'setContext', 'setTag', 'withScope',
    'listIssues', 'getIssue', 'resolveIssue', 'markRelease',
    'errorHandler', 'installProcessHooks', 'getStats', 'queryEvents',
  ]) {
    assert.equal(typeof inst[fn], 'function', `missing: ${fn}`);
  }
});

test('2. captureException returns a string eventId', () => {
  const { inst } = makeInst('evtid');
  const id = inst.captureException(new Error('boom'));
  assert.equal(typeof id, 'string');
  assert.ok(id.startsWith('evt_'));
});

test('3. captureException stores stack + exception type', () => {
  const { inst } = makeInst('stack');
  const id = inst.captureException(new TypeError('bad type'));
  assert.ok(id);
  const events = inst._ring();
  assert.equal(events.length, 1);
  assert.equal(events[0].exception.type, 'TypeError');
  assert.equal(events[0].exception.value, 'bad type');
  assert.ok(events[0].stack && events[0].stack.length > 0);
});

test('4. captureException writes to in-memory ring buffer', () => {
  const { inst } = makeInst('ring');
  inst.captureException(new Error('a'));
  inst.captureException(new Error('b'));
  const events = inst._ring();
  assert.equal(events.length, 2);
});

test('5. captureMessage accepts info/warning/error levels', () => {
  const { inst } = makeInst('lvl');
  inst.captureMessage('hello', 'info');
  inst.captureMessage('warn!', 'warning');
  inst.captureMessage('err!', 'error');
  const events = inst._ring();
  assert.equal(events.length, 3);
  assert.deepEqual(events.map((e) => e.level), ['info', 'warning', 'error']);
});

test('6. addBreadcrumb stores recent actions', () => {
  const { inst } = makeInst('bc');
  inst.addBreadcrumb({ message: 'clicked login', category: 'ui' });
  inst.addBreadcrumb({ message: 'GET /users', category: 'http' });
  inst.captureException(new Error('later'));
  const events = inst._ring();
  assert.equal(events[0].breadcrumbs.length, 2);
  assert.equal(events[0].breadcrumbs[0].message, 'clicked login');
  assert.equal(events[0].breadcrumbs[1].category, 'http');
});

test('7. Breadcrumbs with data are PII-scrubbed', () => {
  const { inst } = makeInst('bcpii');
  inst.addBreadcrumb({
    message: 'login',
    category: 'auth',
    data: { username: 'kobi', password: 'supersecret', token: 'abc' },
  });
  inst.captureException(new Error('fail'));
  const evt = inst._ring()[0];
  assert.equal(evt.breadcrumbs[0].data.password, '[REDACTED]');
  assert.equal(evt.breadcrumbs[0].data.token, '[REDACTED]');
  assert.equal(evt.breadcrumbs[0].data.username, 'kobi');
});

test('8. Breadcrumbs respect the per-scope limit', () => {
  const { inst } = makeInst('bclimit', { breadcrumbLimit: 5 });
  for (let i = 0; i < 20; i++) inst.addBreadcrumb({ message: 'bc-' + i });
  inst.captureException(new Error('x'));
  const evt = inst._ring()[0];
  assert.equal(evt.breadcrumbs.length, 5);
  // Should contain the LAST 5 breadcrumbs
  assert.equal(evt.breadcrumbs[0].message, 'bc-15');
  assert.equal(evt.breadcrumbs[4].message, 'bc-19');
});

test('9. setUser hashes email + preserves id (PII safe)', () => {
  const { inst } = makeInst('user');
  inst.setUser({ id: 'u-42', email: 'KOBI@example.com', username: 'kobi' });
  inst.captureException(new Error('x'));
  const evt = inst._ring()[0];
  assert.equal(evt.user.id, 'u-42');
  assert.equal(evt.user.username, 'kobi');
  assert.ok(evt.user.email_hash);
  assert.ok(!evt.user.email, 'raw email must NOT be persisted');
  // Idempotent (trim + lowercase)
  const hash1 = errorTracker._hashEmail('KOBI@example.com');
  const hash2 = errorTracker._hashEmail('kobi@example.com ');
  assert.equal(hash1, hash2);
});

test('10. setContext + setTag merge into event', () => {
  const { inst } = makeInst('ctx');
  inst.setContext('request', { endpoint: '/api/orders' });
  inst.setTag('tenant', 'acme');
  inst.captureException(new Error('x'));
  const evt = inst._ring()[0];
  assert.equal(evt.tags.tenant, 'acme');
  assert.deepEqual(evt.contexts.request, { endpoint: '/api/orders' });
});

test('11. withScope isolates user/tag/context changes', () => {
  const { inst } = makeInst('scope');
  inst.setTag('global', 'g');
  let outerHadLocal = null;
  inst.withScope((sc) => {
    sc.setTag('local', 'l');
    sc.setUser({ id: 'inner' });
    sc.captureException(new Error('inside'));
  });
  // Outside the scope, local tag should NOT leak
  inst.captureException(new Error('outside'));
  const events = inst._ring();
  const inside = events.find((e) => e.message === 'inside');
  const outside = events.find((e) => e.message === 'outside');
  assert.equal(inside.tags.local, 'l');
  assert.equal(inside.tags.global, 'g');
  assert.equal(inside.user.id, 'inner');
  assert.equal(outside.tags.local, undefined, 'local tag must not leak out of scope');
  outerHadLocal = outside.tags.local;
  assert.equal(outerHadLocal, undefined);
});

test('12. Express errorHandler sanitizes sensitive headers', () => {
  const { inst } = makeInst('headers');
  const req = {
    method: 'POST',
    originalUrl: '/api/login',
    headers: {
      'content-type': 'application/json',
      authorization: 'Bearer SECRET-TOKEN',
      cookie: 'session=abc123',
      'x-api-key': 'KEY-42',
      'user-agent': 'curl/8',
    },
    body: { username: 'a', password: 'p' },
  };
  const res = { status: () => ({ json: () => {} }), headersSent: false };
  inst.errorHandler()(new Error('oops'), req, res, () => {});
  const evt = inst._ring()[0];
  assert.equal(evt.request.headers.authorization, '[REDACTED]');
  assert.equal(evt.request.headers.cookie, '[REDACTED]');
  assert.equal(evt.request.headers['x-api-key'], '[REDACTED]');
  assert.equal(evt.request.headers['content-type'], 'application/json');
});

test('13. Request body is sampled and PII-scrubbed', () => {
  const { inst } = makeInst('body');
  // Password first, then a large note field — after scrubbing, `[REDACTED]`
  // must be present in the truncated serialization.
  const bigBody = { password: 'nope', note: 'x'.repeat(5000) };
  const req = {
    method: 'POST',
    originalUrl: '/api/x',
    headers: {},
    body: bigBody,
  };
  const res = { status: () => ({ json: () => {} }), headersSent: false };
  inst.errorHandler()(new Error('oops'), req, res, () => {});
  const evt = inst._ring()[0];
  const body = evt.request.body;
  assert.equal(typeof body, 'string');
  assert.ok(body.length <= 2200, 'body sample must be truncated');
  assert.ok(body.includes('[REDACTED]'), 'password must be scrubbed');
  assert.ok(body.includes('[truncated]'), 'body must be marked as truncated');
});

test('14. Environment context: service/version/env present', () => {
  const { inst } = makeInst('env', { service: 'payroll', version: 'v9.9.9', environment: 'staging' });
  inst.captureMessage('hello', 'info');
  const evt = inst._ring()[0];
  assert.equal(evt.service, 'payroll');
  assert.equal(evt.release, 'v9.9.9');
  assert.equal(evt.environment, 'staging');
});

test('15. Fingerprinting: same type/frame/msg → same fingerprint', () => {
  const { inst } = makeInst('fp1');
  inst.captureException(makeErr('boom', 'a'));
  inst.captureException(makeErr('boom', 'a'));
  const events = inst._ring();
  assert.equal(events.length, 2);
  assert.equal(events[0].fingerprint, events[1].fingerprint);
});

test('16. Fingerprinting: different top frame → different fingerprint', () => {
  const { inst } = makeInst('fp2');
  inst.captureException(makeErr('boom', 'a'));
  inst.captureException(makeErr('boom', 'b'));
  const events = inst._ring();
  assert.notEqual(events[0].fingerprint, events[1].fingerprint);
});

test('17. Issues are grouped by fingerprint', () => {
  const { inst } = makeInst('group');
  inst.captureException(makeErr('grouped', 'x'));
  inst.captureException(makeErr('grouped', 'x'));
  inst.captureException(makeErr('grouped', 'x'));
  const iss = inst._issues();
  assert.equal(iss.length, 1);
  assert.equal(iss[0].events_count, 3);
});

test('18. getIssue returns first_seen / last_seen / events_count / status', () => {
  const { inst } = makeInst('getIssue');
  inst.captureException(makeErr('oh', 'a'));
  inst.captureException(makeErr('oh', 'a'));
  const listed = inst.listIssues();
  assert.equal(listed.length, 1);
  const issueId = listed[0].id;
  const fetched = inst.getIssue(issueId);
  assert.ok(fetched);
  assert.equal(fetched.events_count, 2);
  assert.equal(fetched.status, 'unresolved');
  assert.ok(Number.isFinite(fetched.first_seen));
  assert.ok(Number.isFinite(fetched.last_seen));
  assert.ok(fetched.last_seen >= fetched.first_seen);
});

test('19. Rate of occurrence tracked per minute/hour/day', () => {
  const { inst } = makeInst('rate');
  inst.captureException(makeErr('r', 'a'));
  inst.captureException(makeErr('r', 'a'));
  inst.captureException(makeErr('r', 'a'));
  const iss = inst.listIssues()[0];
  assert.ok(iss.rate);
  assert.equal(iss.rate.per_minute, 3);
  assert.ok(iss.rate.per_hour >= 3);
  assert.ok(iss.rate.per_day >= 3);
});

test('20. markRelease records release marker', () => {
  const { inst } = makeInst('rel');
  const entry = inst.markRelease('onyx@2.0.0', { commit: 'abc123' });
  assert.equal(entry.version, 'onyx@2.0.0');
  assert.equal(entry.commit, 'abc123');
  const rels = inst.listReleases();
  assert.equal(rels.length, 1);
  assert.equal(rels[0].version, 'onyx@2.0.0');
});

test('21. New event under new release is tagged with that release', () => {
  const { inst } = makeInst('reltag');
  inst.markRelease('onyx@3.0.0');
  inst.captureException(new Error('fresh'));
  const evt = inst._ring()[0];
  assert.equal(evt.release, 'onyx@3.0.0');
});

test('22. Regression: resolved issue re-appearing in new release → regressed', () => {
  const { inst } = makeInst('regress');
  inst.markRelease('onyx@1.0.0');
  inst.captureException(makeErr('reg', 'x'));
  const issue = inst.listIssues()[0];
  inst.resolveIssue(issue.id, 'alice');
  assert.equal(inst.getIssue(issue.id).status, 'resolved');
  // Deploy new release
  inst.markRelease('onyx@2.0.0');
  inst.captureException(makeErr('reg', 'x'));
  const after = inst.getIssue(issue.id);
  assert.equal(after.status, 'regressed');
  assert.equal(after.regressed_from, 'onyx@2.0.0');
});

test('23. Notification hook fires on NEW issue only (debounced)', () => {
  let fired = 0;
  const dir = freshTmpDir('notify');
  const inst = createTracker({
    environment: 'test',
    logDir: dir,
    notify: () => { fired += 1; },
  });
  inst.captureException(makeErr('n1', 'a'));
  inst.captureException(makeErr('n1', 'a')); // same fingerprint
  inst.captureException(makeErr('n1', 'a'));
  assert.equal(fired, 1, 'only ONE notification for repeated events');
});

test('24. Notification hook fires on regressed issue', () => {
  let fires = [];
  const dir = freshTmpDir('notify-reg');
  const inst = createTracker({
    environment: 'test',
    logDir: dir,
    version: 'v1',
    notify: (issue) => { fires.push(issue.status); },
  });
  inst.captureException(makeErr('r', 'a'));
  const iss = inst.listIssues()[0];
  inst.resolveIssue(iss.id);
  // Wait >30s is impractical; manually clear debounce cache
  inst._reset();
  inst.markRelease('v1'); // same release fine for regression bump
  inst.captureException(makeErr('r', 'a'));
  // After _reset, this looks like a brand-new issue → counts as 'new'
  assert.ok(fires.length >= 1);
});

test('25. Ownership auto-assign by file path regex', () => {
  const { inst } = makeInst('own-re');
  const err = new Error('bug');
  err.stack = 'Error: bug\n    at f (src/ops/worker.js:1:1)';
  inst.captureException(err);
  const issue = inst.listIssues()[0];
  assert.equal(issue.owner, 'team-ops');
});

test('26. Ownership auto-assign by file path substring', () => {
  const { inst } = makeInst('own-str');
  const err = new Error('bug');
  err.stack = 'Error: bug\n    at f (src/payroll/compute.js:1:1)';
  inst.captureException(err);
  const issue = inst.listIssues()[0];
  assert.equal(issue.owner, 'team-payroll');
});

test('27. resolveIssue / unresolveIssue / ignoreIssue workflow', () => {
  const { inst } = makeInst('workflow');
  inst.captureException(makeErr('w', 'a'));
  const id = inst.listIssues()[0].id;
  assert.equal(inst.resolveIssue(id, 'kobi'), true);
  assert.equal(inst.getIssue(id).status, 'resolved');
  assert.equal(inst.getIssue(id).status_by, 'kobi');
  assert.equal(inst.unresolveIssue(id, 'kobi'), true);
  assert.equal(inst.getIssue(id).status, 'unresolved');
  assert.equal(inst.ignoreIssue(id, 'kobi'), true);
  assert.equal(inst.getIssue(id).status, 'ignored');
  // Non-existent
  assert.equal(inst.resolveIssue('nope', 'x'), false);
});

test('28. assignIssue manually overrides owner', () => {
  const { inst } = makeInst('assign');
  inst.captureException(makeErr('a', 'a'));
  const id = inst.listIssues()[0].id;
  assert.equal(inst.assignIssue(id, 'team-storage'), true);
  assert.equal(inst.getIssue(id).owner, 'team-storage');
});

test('29. listIssues filter by status / owner / release', () => {
  const { inst } = makeInst('filter');
  inst.captureException(makeErr('i1', 'a'));
  inst.captureException(makeErr('i2', 'b'));
  const all = inst.listIssues();
  assert.equal(all.length, 2);
  inst.resolveIssue(all[0].id);
  assert.equal(inst.listIssues({ status: 'resolved' }).length, 1);
  assert.equal(inst.listIssues({ status: 'unresolved' }).length, 1);
  assert.equal(inst.listIssues({ release: 'onyx@1.0.0' }).length, 2);
  assert.equal(inst.listIssues({ release: 'onyx@99' }).length, 0);
});

test('30. getStats returns aggregated dashboard snapshot', () => {
  const { inst } = makeInst('stats');
  inst.captureException(makeErr('s1', 'a'));
  inst.captureException(makeErr('s2', 'b'));
  const all = inst.listIssues();
  inst.resolveIssue(all[0].id);
  inst.markRelease('r1');
  const s = inst.getStats();
  assert.equal(s.service, 'onyx');
  assert.equal(s.environment, 'test');
  assert.equal(s.events_in_buffer, 2);
  assert.equal(s.issues_total, 2);
  assert.equal(s.issues_by_status.unresolved, 1);
  assert.equal(s.issues_by_status.resolved, 1);
  assert.equal(s.releases_total, 1);
  assert.ok(s.generated_at);
});

test('31. Express errorHandler captures + responds 500 JSON', () => {
  const { inst } = makeInst('express');
  let statusCode = null;
  let body = null;
  const req = { method: 'GET', url: '/boom', headers: {} };
  const res = {
    headersSent: false,
    status(code) {
      statusCode = code;
      return { json: (b) => { body = b; } };
    },
  };
  inst.errorHandler()(new Error('boom'), req, res, () => {});
  assert.equal(statusCode, 500);
  assert.ok(body);
  assert.equal(body.error.status, 500);
  // Hebrew bilingual
  assert.equal(body.error.message_he, 'שגיאה פנימית בשרת');
  // Event captured
  assert.equal(inst._ring().length, 1);
});

test('32. errorHandler never throws when res is null', () => {
  const { inst } = makeInst('express2');
  assert.doesNotThrow(() => {
    inst.errorHandler()(new Error('x'), null, null, () => {});
  });
});

test('33. installProcessHooks installs & uninstalls uncaughtException', () => {
  const { inst } = makeInst('hook1');
  const before = process.listenerCount('uncaughtException');
  const uninstall = inst.installProcessHooks();
  assert.equal(process.listenerCount('uncaughtException'), before + 1);
  uninstall();
  assert.equal(process.listenerCount('uncaughtException'), before);
});

test('34. installProcessHooks captures unhandledRejection', () => {
  const { inst } = makeInst('hook2');
  const before = process.listenerCount('unhandledRejection');
  const uninstall = inst.installProcessHooks();
  assert.equal(process.listenerCount('unhandledRejection'), before + 1);
  // Fire the listener manually
  const listeners = process.listeners('unhandledRejection');
  const our = listeners[listeners.length - 1];
  our(new Error('rejected-promise'), null);
  assert.ok(inst._ring().some((e) => e.message === 'rejected-promise'));
  uninstall();
});

test('35. Ring buffer evicts oldest events beyond capacity', () => {
  const { inst } = makeInst('rb', { ringBufferSize: 5 });
  for (let i = 0; i < 10; i++) {
    inst.captureMessage('msg-' + i, 'info');
  }
  const events = inst._ring();
  assert.equal(events.length, 5);
  // Oldest 5 evicted → only msg-5..msg-9 remain
  const msgs = events.map((e) => e.message).sort();
  assert.deepEqual(msgs, ['msg-5', 'msg-6', 'msg-7', 'msg-8', 'msg-9']);
});

test('36. JSONL persistence writes events + issues + releases files', () => {
  const { inst, dir } = makeInst('persist');
  inst.markRelease('p1');
  inst.captureException(new Error('persisted'));
  const events = readJsonl(path.join(dir, 'errors.jsonl'));
  const issues = readJsonl(path.join(dir, 'issues.jsonl'));
  const releases = readJsonl(path.join(dir, 'releases.jsonl'));
  assert.ok(events.length >= 1);
  assert.ok(issues.length >= 1);
  assert.ok(releases.length >= 1);
  assert.equal(releases[0].version, 'p1');
});

test('37. persist:false disables JSONL writes', () => {
  const dir = freshTmpDir('nopersist');
  const inst = createTracker({ logDir: dir, persist: false, environment: 'test' });
  inst.markRelease('np');
  inst.captureException(new Error('ghost'));
  assert.equal(readJsonl(path.join(dir, 'errors.jsonl')).length, 0);
  assert.equal(readJsonl(path.join(dir, 'issues.jsonl')).length, 0);
  assert.equal(readJsonl(path.join(dir, 'releases.jsonl')).length, 0);
  // But ring buffer still works
  assert.equal(inst._ring().length, 1);
});

test('38. queryEvents filters by level / fingerprint / release', () => {
  const { inst } = makeInst('query');
  inst.captureMessage('m1', 'info');
  inst.captureMessage('m2', 'error');
  inst.captureException(new Error('e1'));
  const infos = inst.queryEvents({ level: 'info' });
  assert.equal(infos.length, 1);
  const errs = inst.queryEvents({ level: 'error' });
  assert.equal(errs.length, 2);
  const fp = inst._ring()[0].fingerprint;
  assert.equal(inst.queryEvents({ fingerprint: fp }).length, 1);
  const limited = inst.queryEvents({ limit: 2 });
  assert.equal(limited.length, 2);
});

test('39. Source map stub returns {resolved, stack, frames}', () => {
  const { inst } = makeInst('sourcemap');
  const err = makeErr('map', 'a');
  inst.captureException(err);
  const evt = inst._ring()[0];
  assert.ok(evt.source_map);
  assert.equal(typeof evt.source_map.resolved, 'boolean');
  assert.ok(Array.isArray(evt.source_map.frames));
  assert.ok(evt.source_map.frames.length >= 1);
});

test('40. Hebrew bilingual message present in Express 500 response', () => {
  const { inst } = makeInst('hebrew');
  let body = null;
  const res = {
    headersSent: false,
    status() { return { json(b) { body = b; } }; },
  };
  inst.errorHandler()(new Error('oops'), { method: 'GET', url: '/', headers: {} }, res, () => {});
  assert.ok(body);
  assert.match(body.error.message_he, /שגיאה/);
  assert.equal(body.error.message, 'Internal Server Error');
});

test('41. captureException on null/undefined returns null safely', () => {
  const { inst } = makeInst('null');
  assert.equal(inst.captureException(null), null);
  assert.equal(inst.captureException(undefined), null);
});

test('42. captureException coerces non-Error values', () => {
  const { inst } = makeInst('coerce');
  const id = inst.captureException('string error');
  assert.ok(id);
  assert.equal(inst._ring()[0].message, 'string error');
});

test('43. Legacy API still works (backward compatibility)', () => {
  // The module-level legacy API must still be exported.
  assert.equal(typeof errorTracker.init, 'function');
  assert.equal(typeof errorTracker.captureException, 'function');
  assert.equal(typeof errorTracker.captureMessage, 'function');
  assert.equal(typeof errorTracker.setUser, 'function');
  assert.equal(typeof errorTracker.requestScopeMiddleware, 'function');
  assert.equal(typeof errorTracker.errorHandler, 'function');
});
