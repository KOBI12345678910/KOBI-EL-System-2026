/**
 * Tests for src/dr/dr-runner.js — Agent-X95
 *
 * Run:
 *   node --test test/dr/dr-runner.test.js
 *
 * Coverage:
 *   - YAML playbook parsing (all 3 seed playbooks)
 *   - Playbook validation (missing fields, bad types)
 *   - runDrill dry-run does not execute
 *   - runFailover refuses without confirmFailover
 *   - runFailover with confirmFailover runs destructive steps
 *   - Step timeout enforcement
 *   - Compensating actions fire on failure (reverse order)
 *   - rollback() runs compensating actions
 *   - postMortem() produces bilingual markdown
 *   - Colour output is stripped cleanly
 *   - Rule enforcement: nothing is deleted, only reported
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { Readable, Writable } = require('node:stream');

const {
  DRRunner,
  parseYaml,
  validatePlaybook,
  strip,
  VALID_STEP_TYPES,
} = require('../../src/dr/dr-runner');

// ──────────────────────────────────────────────────────────────
//  Helpers
// ──────────────────────────────────────────────────────────────

const PLAYBOOK_DIR = path.resolve(__dirname, '..', '..', 'dr', 'playbooks');

function silentLogger() {
  const entries = [];
  return {
    entries,
    logger: {
      info: (m) => entries.push(['info', strip(String(m))]),
      warn: (m) => entries.push(['warn', strip(String(m))]),
      error: (m) => entries.push(['error', strip(String(m))]),
    },
  };
}

function makeRunner(overrides = {}) {
  const { logger } = silentLogger();
  return new DRRunner({
    logger,
    sleeper: () => Promise.resolve(),
    ...overrides,
  });
}

function writeTempPlaybook(body) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'drrunner-'));
  const p = path.join(dir, 'tmp.yaml');
  fs.writeFileSync(p, body, 'utf8');
  return p;
}

// ──────────────────────────────────────────────────────────────
//  YAML parser
// ──────────────────────────────────────────────────────────────

test('parseYaml: parses simple mapping with scalars', () => {
  const out = parseYaml([
    'id: demo',
    'name_en: "Hello"',
    'name_he: "שלום"',
    'rto_minutes: 30',
    'enabled: true',
    'ratio: 0.5',
  ].join('\n'));
  assert.equal(out.id, 'demo');
  assert.equal(out.name_en, 'Hello');
  assert.equal(out.name_he, 'שלום');
  assert.equal(out.rto_minutes, 30);
  assert.equal(out.enabled, true);
  assert.equal(out.ratio, 0.5);
});

test('parseYaml: ignores full-line and inline comments', () => {
  const out = parseYaml([
    '# a comment',
    'id: demo   # trailing',
    'name: "has # hash"',
  ].join('\n'));
  assert.equal(out.id, 'demo');
  assert.equal(out.name, 'has # hash');
});

test('parseYaml: rejects tabs', () => {
  assert.throws(() => parseYaml('id: demo\n\tname: bad'), /tab character/);
});

test('parseYaml: parses nested sequence of mappings', () => {
  const out = parseYaml([
    'id: demo',
    'steps:',
    '  - id: one',
    '    type: wait',
    '    seconds: 5',
    '  - id: two',
    '    type: http',
    '    url: "http://example.com"',
  ].join('\n'));
  assert.equal(out.steps.length, 2);
  assert.equal(out.steps[0].id, 'one');
  assert.equal(out.steps[0].seconds, 5);
  assert.equal(out.steps[1].url, 'http://example.com');
});

test('parseYaml: parses nested compensating block inside list item', () => {
  const out = parseYaml([
    'steps:',
    '  - id: step1',
    '    type: command',
    '    command: "true"',
    '    compensating:',
    '      type: command',
    '      command: "true --undo"',
  ].join('\n'));
  assert.equal(out.steps[0].compensating.type, 'command');
  assert.equal(out.steps[0].compensating.command, 'true --undo');
});

test('parseYaml: colons inside URLs do not split the key', () => {
  const out = parseYaml('url: "http://host:3100/a/b"');
  assert.equal(out.url, 'http://host:3100/a/b');
});

// ──────────────────────────────────────────────────────────────
//  Validation
// ──────────────────────────────────────────────────────────────

test('validatePlaybook: rejects missing id', () => {
  assert.throws(
    () => validatePlaybook({
      name_en: 'x', name_he: 'x', rto_minutes: 1, rpo_minutes: 0,
      steps: [{ id: 's', type: 'wait', description_en: 'e', description_he: 'h', seconds: 1 }],
    }),
    /missing 'id'/,
  );
});

test('validatePlaybook: rejects rto_minutes <= 0', () => {
  assert.throws(
    () => validatePlaybook({
      id: 'x', name_en: 'x', name_he: 'x', rto_minutes: 0, rpo_minutes: 0,
      steps: [{ id: 's', type: 'wait', description_en: 'e', description_he: 'h', seconds: 1 }],
    }),
    /rto_minutes/,
  );
});

test('validatePlaybook: rejects unknown step type', () => {
  assert.throws(
    () => validatePlaybook({
      id: 'x', name_en: 'x', name_he: 'x', rto_minutes: 1, rpo_minutes: 0,
      steps: [{ id: 's', type: 'launch', description_en: 'e', description_he: 'h' }],
    }),
    /invalid type/,
  );
});

test('validatePlaybook: rejects duplicate step ids', () => {
  assert.throws(
    () => validatePlaybook({
      id: 'x', name_en: 'x', name_he: 'x', rto_minutes: 1, rpo_minutes: 0,
      steps: [
        { id: 's', type: 'wait', seconds: 1, description_en: 'a', description_he: 'a' },
        { id: 's', type: 'wait', seconds: 1, description_en: 'b', description_he: 'b' },
      ],
    }),
    /duplicate step id/,
  );
});

test('VALID_STEP_TYPES contains exactly the 5 documented types', () => {
  assert.deepEqual(
    [...VALID_STEP_TYPES].sort(),
    ['command', 'http', 'manual', 'verify', 'wait'].sort(),
  );
});

// ──────────────────────────────────────────────────────────────
//  Seed playbooks load + validate
// ──────────────────────────────────────────────────────────────

test('loadPlaybookDir: loads and validates all 3 seed playbooks', () => {
  const r = makeRunner();
  const loaded = r.loadPlaybookDir(PLAYBOOK_DIR);
  assert.equal(loaded.length, 3);
  const ids = loaded.map((p) => p.id).sort();
  assert.deepEqual(ids, ['app-rollback', 'data-restore', 'db-primary-failover']);
  for (const pb of loaded) {
    assert.ok(pb.name_he);
    assert.ok(pb.name_en);
    assert.ok(pb.rto_minutes > 0);
    assert.ok(pb.steps.length > 0);
  }
});

test('listPlaybooks: returns metadata only', () => {
  const r = makeRunner();
  r.loadPlaybookDir(PLAYBOOK_DIR);
  const list = r.listPlaybooks();
  assert.equal(list.length, 3);
  for (const entry of list) {
    assert.ok(entry.id);
    assert.ok(entry.name_he);
    assert.ok(entry.name_en);
    assert.ok(entry.stepCount > 0);
  }
});

// ──────────────────────────────────────────────────────────────
//  Dry-run does not execute
// ──────────────────────────────────────────────────────────────

test('runDrill dry-run: never invokes commandRunner or httpClient', async () => {
  let cmdCalls = 0;
  let httpCalls = 0;
  const r = makeRunner({
    commandRunner: async () => { cmdCalls++; return { stdout: '', stderr: '', code: 0 }; },
    httpClient: async () => { httpCalls++; return { status: 200, body: 'ok' }; },
  });
  r.loadPlaybookDir(PLAYBOOK_DIR);

  const run = await r.runDrill('db-primary-failover', { dryRun: true });
  assert.equal(cmdCalls, 0, 'command runner must not be called in dry-run');
  assert.equal(httpCalls, 0, 'http client must not be called in dry-run');
  assert.equal(run.outcome, 'success');
  assert.ok(run.steps.length > 0);
  assert.ok(run.steps.every((s) => s.status === 'dry-run'));
});

test('runDrill dry-run: marks destructive steps visibly but does not skip', async () => {
  const r = makeRunner();
  r.loadPlaybookDir(PLAYBOOK_DIR);
  const run = await r.runDrill('db-primary-failover', { dryRun: true });
  const destructive = run.steps.filter((s) => /DESTRUCTIVE/.test(s.message || ''));
  assert.ok(destructive.length >= 1, 'at least one destructive step should be annotated');
});

// ──────────────────────────────────────────────────────────────
//  Failover refusal
// ──────────────────────────────────────────────────────────────

test('runFailover: refuses without confirmFailover', async () => {
  let cmdCalls = 0;
  const r = makeRunner({
    commandRunner: async () => { cmdCalls++; return { stdout: '', stderr: '', code: 0 }; },
  });
  r.loadPlaybookDir(PLAYBOOK_DIR);
  const run = await r.runFailover('db-primary-failover');
  assert.equal(run.outcome, 'refused');
  assert.match(run.reason, /confirmFailover/);
  assert.equal(cmdCalls, 0, 'no commands executed on refused run');
});

test('runFailover: refuses when confirmFailover is a truthy non-true value', async () => {
  const r = makeRunner();
  r.loadPlaybookDir(PLAYBOOK_DIR);
  // Anything that is not `true` must be rejected — no coercion shortcuts.
  const run = await r.runFailover('db-primary-failover', { confirmFailover: 'yes' });
  assert.equal(run.outcome, 'refused');
});

test('runFailover: executes destructive steps when confirmFailover:true', async () => {
  // Build a minimal playbook with one destructive command step.
  const body = [
    'id: mini',
    'name_en: "Mini"',
    'name_he: "מיני"',
    'rto_minutes: 1',
    'rpo_minutes: 0',
    'steps:',
    '  - id: step1',
    '    type: command',
    '    destructive: true',
    '    description_en: "destructive step"',
    '    description_he: "צעד הרסני"',
    '    command: "echo hi"',
    '    timeout_seconds: 5',
  ].join('\n');
  const file = writeTempPlaybook(body);
  let cmdCalls = 0;
  const r = makeRunner({
    commandRunner: async (cmd) => { cmdCalls++; return { stdout: 'hi\n', stderr: '', code: 0 }; },
  });
  r.loadPlaybook(file);
  const run = await r.runFailover('mini', { confirmFailover: true });
  assert.equal(run.outcome, 'success');
  assert.equal(cmdCalls, 1, 'command should have executed exactly once');
  assert.equal(run.steps[0].status, 'success');
});

// ──────────────────────────────────────────────────────────────
//  Timeout enforcement
// ──────────────────────────────────────────────────────────────

test('step timeout: a slow command step fails with timeout error', async () => {
  const body = [
    'id: slow',
    'name_en: "Slow"',
    'name_he: "איטי"',
    'rto_minutes: 1',
    'rpo_minutes: 0',
    'steps:',
    '  - id: slow-step',
    '    type: command',
    '    description_en: "slow command"',
    '    description_he: "פקודה איטית"',
    '    command: "sleep 1000"',
    '    timeout_seconds: 1',
  ].join('\n');
  const file = writeTempPlaybook(body);
  const r = makeRunner({
    // never resolves — forces the timeout path
    commandRunner: () => new Promise(() => {}),
  });
  r.loadPlaybook(file);
  const run = await r.runDrill('slow', { dryRun: false, allowCommand: true });
  assert.equal(run.outcome, 'compensated');
  const failed = run.steps.find((s) => s.status === 'failed');
  assert.ok(failed, 'one step must have failed');
  assert.match(failed.message, /timed out/);
});

// ──────────────────────────────────────────────────────────────
//  Compensating actions on failure (reverse order)
// ──────────────────────────────────────────────────────────────

test('compensating actions: fire in reverse order on failure', async () => {
  const body = [
    'id: comp',
    'name_en: "Comp"',
    'name_he: "קומפ"',
    'rto_minutes: 1',
    'rpo_minutes: 0',
    'steps:',
    '  - id: step1',
    '    type: command',
    '    description_en: "one"',
    '    description_he: "אחד"',
    '    command: "ok1"',
    '    compensating:',
    '      type: command',
    '      command: "undo1"',
    '  - id: step2',
    '    type: command',
    '    description_en: "two"',
    '    description_he: "שתיים"',
    '    command: "fail"',
    '    compensating:',
    '      type: command',
    '      command: "undo2"',
  ].join('\n');
  const file = writeTempPlaybook(body);
  const called = [];
  const r = makeRunner({
    commandRunner: async (cmd) => {
      called.push(cmd);
      if (cmd === 'fail') return { stdout: '', stderr: 'boom', code: 1 };
      return { stdout: '', stderr: '', code: 0 };
    },
  });
  r.loadPlaybook(file);
  const run = await r.runDrill('comp', { dryRun: false, allowCommand: true });
  assert.equal(run.outcome, 'compensated');
  // Execution order: ok1, fail, then compensating actions in REVERSE.
  // The failing step's compensating action MUST also run — a DR step may
  // have partially applied side-effects before erroring (e.g. a fence was
  // set but the promote timed out halfway). Safer to always roll it back.
  assert.deepEqual(called, ['ok1', 'fail', 'undo2', 'undo1']);
  const compEntries = run.steps.filter((s) => s.id.endsWith('.compensating'));
  assert.equal(compEntries.length, 2);
  for (const e of compEntries) {
    assert.equal(e.status, 'compensated');
  }
  // Order inside the run log: undo2 before undo1 (reverse of execution)
  assert.equal(compEntries[0].id, 'step2.compensating');
  assert.equal(compEntries[1].id, 'step1.compensating');
});

// ──────────────────────────────────────────────────────────────
//  rollback()
// ──────────────────────────────────────────────────────────────

test('rollback: runs all compensating actions in reverse order', async () => {
  const body = [
    'id: rb',
    'name_en: "RB"',
    'name_he: "ארבי"',
    'rto_minutes: 1',
    'rpo_minutes: 0',
    'steps:',
    '  - id: s1',
    '    type: command',
    '    description_en: "a"',
    '    description_he: "א"',
    '    command: "a"',
    '    compensating:',
    '      type: command',
    '      command: "undo-a"',
    '  - id: s2',
    '    type: command',
    '    description_en: "b"',
    '    description_he: "ב"',
    '    command: "b"',
    '    compensating:',
    '      type: command',
    '      command: "undo-b"',
  ].join('\n');
  const file = writeTempPlaybook(body);
  const called = [];
  const r = makeRunner({
    commandRunner: async (cmd) => { called.push(cmd); return { stdout: '', stderr: '', code: 0 }; },
  });
  r.loadPlaybook(file);
  const run = await r.rollback('rb', { allowCommand: true });
  assert.equal(run.mode, 'rollback');
  assert.equal(called.length, 2);
  // reverse order: undo-b then undo-a
  assert.deepEqual(called, ['undo-b', 'undo-a']);
  assert.equal(run.outcome, 'success');
});

test('rollback: warns but does not throw when playbook has no compensating actions', async () => {
  const body = [
    'id: nocomp',
    'name_en: "Nocomp"',
    'name_he: "ללא"',
    'rto_minutes: 1',
    'rpo_minutes: 0',
    'steps:',
    '  - id: s1',
    '    type: wait',
    '    description_en: "wait a"',
    '    description_he: "המתן א"',
    '    seconds: 0',
  ].join('\n');
  const file = writeTempPlaybook(body);
  const { logger, entries } = silentLogger();
  const r = new DRRunner({ logger, sleeper: () => Promise.resolve() });
  r.loadPlaybook(file);
  const run = await r.rollback('nocomp');
  assert.equal(run.outcome, 'success');
  assert.equal(run.steps.length, 0);
  assert.ok(entries.some(([lvl, m]) => lvl === 'warn' && /no compensating/.test(m)));
});

// ──────────────────────────────────────────────────────────────
//  postMortem
// ──────────────────────────────────────────────────────────────

test('postMortem: bilingual template, prefilled with run data', async () => {
  const r = makeRunner();
  r.loadPlaybookDir(PLAYBOOK_DIR);
  const run = await r.runDrill('db-primary-failover', { dryRun: true });
  const pm = r.postMortem(run.runId);
  assert.ok(typeof pm.markdown === 'string');
  assert.match(pm.markdown, /# DR Post-Mortem/);
  // bilingual headings
  assert.match(pm.markdown, /ציר זמן/);
  assert.match(pm.markdown, /Timeline/);
  assert.match(pm.markdown, /Root cause/);
  assert.match(pm.markdown, /סיבת שורש/);
  // pre-filled run id + playbook id
  assert.ok(pm.markdown.includes(run.runId));
  assert.ok(pm.markdown.includes('db-primary-failover'));
  // RTO / RPO targets
  assert.match(pm.markdown, /RTO target/);
  assert.match(pm.markdown, /RPO target/);
  // system rule present
  assert.match(pm.markdown, /לא מוחקים/);
});

test('postMortem: throws on unknown runId', () => {
  const r = makeRunner();
  assert.throws(() => r.postMortem('run_missing'), /unknown runId/);
});

// ──────────────────────────────────────────────────────────────
//  status()
// ──────────────────────────────────────────────────────────────

test('status: reports "never run" before first run', () => {
  const r = makeRunner();
  r.loadPlaybookDir(PLAYBOOK_DIR);
  const s = r.status('db-primary-failover');
  assert.equal(s.lastRun, null);
  assert.match(s.message_en, /Never run/);
  assert.match(s.message_he, /לא בוצע/);
});

test('status: reports RTO breach when duration > target', async () => {
  // Inject a fake clock that reports run duration >> rto_minutes.
  const body = [
    'id: tight',
    'name_en: "Tight"',
    'name_he: "הדוק"',
    'rto_minutes: 1',
    'rpo_minutes: 0',
    'steps:',
    '  - id: w',
    '    type: wait',
    '    seconds: 0',
    '    description_en: "wait"',
    '    description_he: "חכה"',
  ].join('\n');
  const file = writeTempPlaybook(body);
  let t = 1_000_000;
  const clock = {
    now: () => {
      const cur = t;
      // each call advances by 30 seconds → run takes ~minutes
      t += 30_000;
      return cur;
    },
  };
  const r = new DRRunner({
    logger: silentLogger().logger,
    sleeper: () => Promise.resolve(),
    now: clock.now,
  });
  r.loadPlaybook(file);
  const run = await r.runDrill('tight', { dryRun: false });
  const s = r.status('tight');
  assert.equal(s.outcome, 'success');
  assert.ok(s.rtoActualMinutes > 1, 'expected simulated runtime > 1 min');
  assert.equal(s.rtoBreached, true, 'rto breach must be reported');
});

// ──────────────────────────────────────────────────────────────
//  Manual step — operator confirm
// ──────────────────────────────────────────────────────────────

test('manual step: operator "y" continues', async () => {
  const body = [
    'id: man',
    'name_en: "Man"',
    'name_he: "ידני"',
    'rto_minutes: 1',
    'rpo_minutes: 0',
    'steps:',
    '  - id: m1',
    '    type: manual',
    '    description_en: "confirm"',
    '    description_he: "אשר"',
    '    timeout_seconds: 5',
  ].join('\n');
  const file = writeTempPlaybook(body);
  const input = Readable.from(['y\n']);
  const output = new Writable({ write(chunk, _enc, cb) { cb(); } });
  const r = new DRRunner({
    logger: silentLogger().logger,
    sleeper: () => Promise.resolve(),
    input,
    output,
  });
  r.loadPlaybook(file);
  const run = await r.runDrill('man', { dryRun: false });
  assert.equal(run.outcome, 'success');
  assert.equal(run.steps[0].status, 'success');
});

test('manual step: operator "n" fails the step', async () => {
  const body = [
    'id: man2',
    'name_en: "Man2"',
    'name_he: "ידני2"',
    'rto_minutes: 1',
    'rpo_minutes: 0',
    'steps:',
    '  - id: m1',
    '    type: manual',
    '    description_en: "confirm"',
    '    description_he: "אשר"',
    '    timeout_seconds: 5',
  ].join('\n');
  const file = writeTempPlaybook(body);
  const input = Readable.from(['n\n']);
  const output = new Writable({ write(chunk, _enc, cb) { cb(); } });
  const r = new DRRunner({
    logger: silentLogger().logger,
    sleeper: () => Promise.resolve(),
    input,
    output,
  });
  r.loadPlaybook(file);
  const run = await r.runDrill('man2', { dryRun: false });
  assert.equal(run.outcome, 'compensated');
});

// ──────────────────────────────────────────────────────────────
//  http step verification
// ──────────────────────────────────────────────────────────────

test('http step: fails when status mismatches', async () => {
  const body = [
    'id: httpfail',
    'name_en: "H"',
    'name_he: "ה"',
    'rto_minutes: 1',
    'rpo_minutes: 0',
    'steps:',
    '  - id: call',
    '    type: http',
    '    description_en: "GET /"',
    '    description_he: "קריאה"',
    '    url: "http://x.local/"',
    '    expectedStatus: 200',
  ].join('\n');
  const file = writeTempPlaybook(body);
  const r = makeRunner({
    httpClient: async () => ({ status: 500, body: 'err' }),
  });
  r.loadPlaybook(file);
  const run = await r.runDrill('httpfail', { dryRun: false });
  assert.equal(run.outcome, 'compensated');
  const failed = run.steps.find((s) => s.status === 'failed');
  assert.ok(failed);
  assert.match(failed.message, /expected status 200/);
});

test('http step: fails when body regex does not match', async () => {
  const body = [
    'id: bodyfail',
    'name_en: "B"',
    'name_he: "ב"',
    'rto_minutes: 1',
    'rpo_minutes: 0',
    'steps:',
    '  - id: call',
    '    type: http',
    '    description_en: "GET /"',
    '    description_he: "קריאה"',
    '    url: "http://x.local/"',
    '    expectedStatus: 200',
    '    expectedBodyRegex: "ok|healthy"',
  ].join('\n');
  const file = writeTempPlaybook(body);
  const r = makeRunner({
    httpClient: async () => ({ status: 200, body: 'nope' }),
  });
  r.loadPlaybook(file);
  const run = await r.runDrill('bodyfail', { dryRun: false });
  assert.equal(run.outcome, 'compensated');
});

// ──────────────────────────────────────────────────────────────
//  verify step
// ──────────────────────────────────────────────────────────────

test('verify step: uses injected verifier function', async () => {
  const body = [
    'id: v',
    'name_en: "V"',
    'name_he: "וי"',
    'rto_minutes: 1',
    'rpo_minutes: 0',
    'steps:',
    '  - id: check',
    '    type: verify',
    '    description_en: "check thing"',
    '    description_he: "בדוק"',
    '    verifier: my-check',
  ].join('\n');
  const file = writeTempPlaybook(body);
  let called = 0;
  const r = new DRRunner({
    logger: silentLogger().logger,
    verifiers: {
      'my-check': async ({ step }) => {
        called++;
        assert.equal(step.id, 'check');
        return { ok: true, message: 'all good' };
      },
    },
  });
  r.loadPlaybook(file);
  const run = await r.runDrill('v', { dryRun: false });
  assert.equal(called, 1);
  assert.equal(run.outcome, 'success');
  assert.equal(run.steps[0].status, 'success');
});

test('verify step: unknown verifier fails the step', async () => {
  const body = [
    'id: v2',
    'name_en: "V"',
    'name_he: "וי"',
    'rto_minutes: 1',
    'rpo_minutes: 0',
    'steps:',
    '  - id: check',
    '    type: verify',
    '    description_en: "c"',
    '    description_he: "ב"',
    '    verifier: does-not-exist',
  ].join('\n');
  const file = writeTempPlaybook(body);
  const r = makeRunner();
  r.loadPlaybook(file);
  const run = await r.runDrill('v2', { dryRun: false });
  assert.equal(run.outcome, 'compensated');
  const failed = run.steps.find((s) => s.status === 'failed');
  assert.match(failed.message, /unknown verifier/);
});

// ──────────────────────────────────────────────────────────────
//  Command guard
// ──────────────────────────────────────────────────────────────

test('command step: refuses to execute without allowCommand (in real runs)', async () => {
  const body = [
    'id: nc',
    'name_en: "NC"',
    'name_he: "ללא פקודה"',
    'rto_minutes: 1',
    'rpo_minutes: 0',
    'steps:',
    '  - id: c1',
    '    type: command',
    '    description_en: "x"',
    '    description_he: "פ"',
    '    command: "echo nope"',
  ].join('\n');
  const file = writeTempPlaybook(body);
  let cmdCalls = 0;
  const r = makeRunner({
    commandRunner: async () => { cmdCalls++; return { stdout: '', stderr: '', code: 0 }; },
  });
  r.loadPlaybook(file);
  const run = await r.runDrill('nc', { dryRun: false /* allowCommand defaults false */ });
  assert.equal(cmdCalls, 0);
  assert.equal(run.outcome, 'success');
  assert.equal(run.steps[0].status, 'skipped');
  assert.match(run.steps[0].message, /allowCommand/);
});

// ──────────────────────────────────────────────────────────────
//  Never-delete rule: source files and playbooks are not touched
// ──────────────────────────────────────────────────────────────

test('never-delete rule: running a playbook must not modify its source file', async () => {
  const pbPath = path.join(PLAYBOOK_DIR, 'db-primary-failover.yaml');
  const before = fs.readFileSync(pbPath, 'utf8');
  const r = makeRunner();
  r.loadPlaybook(pbPath);
  await r.runDrill('db-primary-failover', { dryRun: true });
  await r.runFailover('db-primary-failover'); // refused
  const after = fs.readFileSync(pbPath, 'utf8');
  assert.equal(after, before, 'playbook file must be byte-identical after runs');
});
