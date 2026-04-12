/**
 * Unit tests for onyx-cli.
 *
 * Run with:
 *   node --test test/cli/onyx-cli.test.js
 *
 * We deliberately avoid spawning a subprocess — instead we exercise
 * the dispatcher directly with a captured logger, and mock handlers
 * by registering an in-memory command group. This keeps tests fast
 * and lets us assert exit codes without process boundaries.
 */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Readable, Writable } = require('node:stream');

const argparser = require('../../src/cli/argparser.js');
const registry  = require('../../src/cli/registry.js');
const dispatcher = require('../../src/cli/dispatcher.js');
const ansi = require('../../src/cli/ansi.js');
const help = require('../../src/cli/help.js');
const { confirm } = require('../../src/cli/prompt.js');

// ─── helpers ────────────────────────────────────────────────────────────────

function captureLogger() {
  const out = [];
  const err = [];
  const push = (buf) => (msg) => buf.push(String(msg));
  return {
    out,
    err,
    logger: {
      info:  push(out),
      ok:    push(out),
      warn:  push(err),
      err:   push(err),
      debug: push(err),
      raw:   push(out),
      rawErr: push(err),
    },
    combinedOut() { return out.join('\n'); },
    combinedErr() { return err.join('\n'); },
  };
}

function makeInput(lines) {
  return Readable.from((Array.isArray(lines) ? lines : [lines]).join('\n') + '\n');
}

function makeOutput() {
  const chunks = [];
  const w = new Writable({
    write(chunk, _enc, cb) {
      chunks.push(String(chunk));
      cb();
    },
  });
  w.chunks = chunks;
  return w;
}

// Load built-ins once so we can inspect the registry.
dispatcher.loadBuiltIns();

// ─── 1. arg parser ─────────────────────────────────────────────────────────

test('argparser: bare command', () => {
  const r = argparser.parse(['status']);
  assert.equal(r.group, 'status');
  assert.equal(r.sub, null);
  assert.deepEqual(r.positional, []);
  // flags uses a null-prototype object; just verify it has no own keys
  assert.equal(Object.keys(r.flags).length, 0);
});

test('argparser: group + sub + positional', () => {
  const r = argparser.parse(['db', 'restore', 'backup.sql']);
  assert.equal(r.group, 'db');
  assert.equal(r.sub, 'restore');
  assert.deepEqual(r.positional, ['backup.sql']);
});

test('argparser: long flag with space', () => {
  const r = argparser.parse(['db', 'backup', '--out', '/tmp/x.sql']);
  assert.equal(r.flags.out, '/tmp/x.sql');
});

test('argparser: long flag with equals', () => {
  const r = argparser.parse(['invoice', 'export', '2026-01', '2026-03', '--format=xlsx']);
  assert.equal(r.flags.format, 'xlsx');
  assert.deepEqual(r.positional, ['2026-01', '2026-03']);
});

test('argparser: boolean flag', () => {
  const r = argparser.parse(['db', 'restore', 'backup.sql', '--yes']);
  assert.equal(r.flags.yes, true);
});

test('argparser: -h maps to help', () => {
  const r = argparser.parse(['db', '-h']);
  assert.equal(r.flags.help, true);
});

test('argparser: -- passthrough', () => {
  const r = argparser.parse(['logs', 'search', '--', '--weird-query']);
  assert.deepEqual(r.positional, ['--weird-query']);
});

test('argparser: help command with two positionals', () => {
  const r = argparser.parse(['help', 'db', 'migrate']);
  assert.equal(r.group, 'help');
  // help is a SINGLE_WORD_GROUP so sub stays null; positionals carry the rest
  assert.equal(r.sub, null);
  assert.deepEqual(r.positional, ['db', 'migrate']);
});

// ─── 2. registry  ───────────────────────────────────────────────────────────

test('registry: all required groups are registered', () => {
  const names = registry.list();
  for (const needed of [
    'help', 'status', 'db', 'user', 'invoice',
    'payroll', 'vat', 'logs', 'cache', 'queue', 'webhook',
  ]) {
    assert.ok(names.includes(needed), `missing group: ${needed}`);
  }
});

test('registry: db has migrate, seed, backup, restore', () => {
  const g = registry.get('db');
  for (const s of ['migrate', 'seed', 'backup', 'restore']) {
    assert.ok(g.subcommands[s], `db missing sub: ${s}`);
  }
});

test('registry: duplicate register throws', () => {
  assert.throws(
    () => registry.register({ name: 'db', subcommands: {} }),
    /already registered/
  );
});

test('registry: extend cannot overwrite', () => {
  assert.throws(
    () => registry.extend('db', { migrate: { handler: () => 0 } }),
    /already exists/
  );
});

test('registry: extend appends new sub', () => {
  registry.extend('db', {
    'test-only-probe': {
      description: { en: 'probe', he: 'בדיקה' },
      usage: 'db test-only-probe',
      handler: () => 0,
    },
  });
  assert.ok(registry.get('db').subcommands['test-only-probe']);
});

// ─── 3. help output  ────────────────────────────────────────────────────────

test('help.topLevel includes bilingual banner + all groups', () => {
  const text = ansi.strip(help.topLevel());
  assert.match(text, /onyx-cli/);
  assert.match(text, /USAGE/);
  assert.match(text, /שימוש/);
  assert.match(text, /db/);
  assert.match(text, /payroll/);
  assert.match(text, /status/);
});

test('help.group returns Hebrew and English descriptions', () => {
  const text = ansi.strip(help.group('db'));
  assert.match(text, /db migrate|migrate/);
  assert.match(text, /מיגרציות|מיגרציה/);
});

test('help.command formats sub-command with examples', () => {
  const text = ansi.strip(help.command('db', 'backup'));
  assert.match(text, /USAGE/);
  assert.match(text, /backup/);
  assert.match(text, /--out/);
});

test('help.group unknown returns a safe error string', () => {
  assert.match(help.group('nope'), /Unknown/);
});

// ─── 4. ansi strip helper  ─────────────────────────────────────────────────

test('ansi.strip removes ANSI escape sequences', () => {
  const colored = '\x1b[31mhello\x1b[0m';
  assert.equal(ansi.strip(colored), 'hello');
});

// ─── 5. dispatcher with mock handlers  ─────────────────────────────────────

// Register a mock group purely for dispatch testing
registry.register({
  name: 'mock',
  description: { en: 'mock commands for tests', he: 'בדיקות' },
  subcommands: {
    ok: {
      description: { en: 'always 0', he: 'תמיד 0' },
      usage: 'mock ok',
      handler: () => 0,
    },
    fail: {
      description: { en: 'always 1', he: 'תמיד 1' },
      usage: 'mock fail',
      handler: () => 1,
    },
    echo: {
      description: { en: 'echo back', he: 'הד' },
      usage: 'mock echo <msg>',
      handler: (ctx) => {
        ctx.logger.info(`ECHO: ${ctx.positional[0] || ''}`);
        return 0;
      },
    },
    async: {
      description: { en: 'async handler', he: 'אסינכרוני' },
      usage: 'mock async',
      handler: async () => {
        await new Promise((r) => setTimeout(r, 1));
        return 0;
      },
    },
    boom: {
      description: { en: 'throws', he: 'זורק' },
      usage: 'mock boom',
      handler: () => {
        throw new Error('boom');
      },
    },
    confirmed: {
      description: { en: 'needs confirm', he: 'דרוש אישור' },
      usage: 'mock confirmed',
      destructive: true,
      handler: async (ctx) => {
        const ok = await confirm('Proceed?', {
          assumeYes: ctx.flags.yes,
          input: ctx.io && ctx.io.input,
          output: ctx.io && ctx.io.output,
        });
        return ok ? 0 : 1;
      },
    },
  },
});

test('dispatch: mock ok → exit 0', async () => {
  const cap = captureLogger();
  const code = await dispatcher.exec(['mock', 'ok'], { logger: cap.logger, config: {} });
  assert.equal(code, 0);
});

test('dispatch: mock fail → exit 1', async () => {
  const cap = captureLogger();
  const code = await dispatcher.exec(['mock', 'fail'], { logger: cap.logger, config: {} });
  assert.equal(code, 1);
});

test('dispatch: mock echo prints positional', async () => {
  const cap = captureLogger();
  const code = await dispatcher.exec(['mock', 'echo', 'hi'], { logger: cap.logger, config: {} });
  assert.equal(code, 0);
  assert.match(cap.combinedOut(), /ECHO: hi/);
});

test('dispatch: async handler awaited', async () => {
  const cap = captureLogger();
  const code = await dispatcher.exec(['mock', 'async'], { logger: cap.logger, config: {} });
  assert.equal(code, 0);
});

test('dispatch: throwing handler → exit 3', async () => {
  const cap = captureLogger();
  const code = await dispatcher.exec(['mock', 'boom'], { logger: cap.logger, config: {} });
  assert.equal(code, 3);
  assert.match(cap.combinedErr(), /boom/);
});

test('dispatch: unknown group → usage (exit 2)', async () => {
  const cap = captureLogger();
  const code = await dispatcher.exec(['nope'], { logger: cap.logger, config: {} });
  assert.equal(code, 2);
  assert.match(cap.combinedErr(), /unknown command/);
});

test('dispatch: unknown sub → usage (exit 2)', async () => {
  const cap = captureLogger();
  const code = await dispatcher.exec(['mock', 'nope'], { logger: cap.logger, config: {} });
  assert.equal(code, 2);
  assert.match(cap.combinedErr(), /unknown sub-command/);
});

test('dispatch: missing sub on multi-word group shows help (exit 2)', async () => {
  const cap = captureLogger();
  const code = await dispatcher.exec(['mock'], { logger: cap.logger, config: {} });
  assert.equal(code, 2);
});

test('dispatch: status single-word command dispatches default', async () => {
  const cap = captureLogger();
  const code = await dispatcher.exec(['status'], { logger: cap.logger, config: { __loaded: true, logsDir: process.cwd() } });
  // status returns 0 or 1 depending on host filesystem — just assert it's an int in {0,1}
  assert.ok(code === 0 || code === 1, `expected 0 or 1, got ${code}`);
});

test('dispatch: --help on a group renders group help', async () => {
  const cap = captureLogger();
  const code = await dispatcher.exec(['db', '--help'], { logger: cap.logger, config: {} });
  assert.equal(code, 0);
  assert.match(cap.combinedOut(), /migrate|backup/);
});

test('dispatch: --help on a sub renders sub-command help', async () => {
  const cap = captureLogger();
  const code = await dispatcher.exec(['db', 'backup', '--help'], { logger: cap.logger, config: {} });
  assert.equal(code, 0);
  assert.match(cap.combinedOut(), /USAGE/);
});

test('dispatch: top-level help on empty argv', async () => {
  const cap = captureLogger();
  const code = await dispatcher.exec([], { logger: cap.logger, config: {} });
  assert.equal(code, 0);
  assert.match(cap.combinedOut(), /onyx-cli/);
});

// ─── 6. confirmation prompt  ───────────────────────────────────────────────

test('prompt: "y" resolves true', async () => {
  const ok = await confirm('Proceed?', {
    input: makeInput(['y']),
    output: makeOutput(),
  });
  assert.equal(ok, true);
});

test('prompt: "yes" resolves true', async () => {
  const ok = await confirm('Proceed?', {
    input: makeInput(['yes']),
    output: makeOutput(),
  });
  assert.equal(ok, true);
});

test('prompt: "כן" resolves true', async () => {
  const ok = await confirm('Proceed?', {
    input: makeInput(['כן']),
    output: makeOutput(),
  });
  assert.equal(ok, true);
});

test('prompt: "n" resolves false', async () => {
  const ok = await confirm('Proceed?', {
    input: makeInput(['n']),
    output: makeOutput(),
  });
  assert.equal(ok, false);
});

test('prompt: empty resolves false (default N)', async () => {
  const ok = await confirm('Proceed?', {
    input: makeInput(['']),
    output: makeOutput(),
  });
  assert.equal(ok, false);
});

test('prompt: assumeYes skips stdin', async () => {
  const ok = await confirm('Proceed?', { assumeYes: true });
  assert.equal(ok, true);
});

test('dispatch: destructive command cancelled → exit 1', async () => {
  const cap = captureLogger();
  const code = await dispatcher.exec(['mock', 'confirmed'], {
    logger: cap.logger,
    config: {},
    io: { input: makeInput(['n']), output: makeOutput() },
  });
  assert.equal(code, 1);
});

test('dispatch: destructive command confirmed → exit 0', async () => {
  const cap = captureLogger();
  const code = await dispatcher.exec(['mock', 'confirmed'], {
    logger: cap.logger,
    config: {},
    io: { input: makeInput(['y']), output: makeOutput() },
  });
  assert.equal(code, 0);
});

test('dispatch: destructive command --yes skips prompt', async () => {
  const cap = captureLogger();
  const code = await dispatcher.exec(['mock', 'confirmed', '--yes'], {
    logger: cap.logger,
    config: {},
  });
  assert.equal(code, 0);
});

// ─── 7. validation error exit codes on real commands  ─────────────────────

test('dispatch: user create with missing email → exit 2', async () => {
  const cap = captureLogger();
  const code = await dispatcher.exec(['user', 'create'], { logger: cap.logger, config: {} });
  assert.equal(code, 2);
});

test('dispatch: user create with invalid email → exit 2', async () => {
  const cap = captureLogger();
  const code = await dispatcher.exec(['user', 'create', 'not-an-email'], { logger: cap.logger, config: {} });
  assert.equal(code, 2);
});

test('dispatch: user create with valid email → exit 0', async () => {
  const cap = captureLogger();
  const code = await dispatcher.exec(['user', 'create', 'yossi@tku.co.il'], { logger: cap.logger, config: {} });
  assert.equal(code, 0);
});

test('dispatch: invoice export invalid dates → exit 2', async () => {
  const cap = captureLogger();
  const code = await dispatcher.exec(['invoice', 'export', 'xxx', 'yyy'], { logger: cap.logger, config: {} });
  assert.equal(code, 2);
});

test('dispatch: invoice export valid dates → exit 0', async () => {
  const cap = captureLogger();
  const code = await dispatcher.exec(['invoice', 'export', '2026-01-01', '2026-01-31'], { logger: cap.logger, config: {} });
  assert.equal(code, 0);
});

test('dispatch: vat generate invalid period → exit 2', async () => {
  const cap = captureLogger();
  const code = await dispatcher.exec(['vat', 'generate', 'not-a-period'], { logger: cap.logger, config: {} });
  assert.equal(code, 2);
});

test('dispatch: vat generate valid period → exit 0', async () => {
  const cap = captureLogger();
  const code = await dispatcher.exec(['vat', 'generate', '2026-04'], { logger: cap.logger, config: {} });
  assert.equal(code, 0);
});

test('dispatch: payroll slip valid args → exit 0', async () => {
  const cap = captureLogger();
  const code = await dispatcher.exec(['payroll', 'slip', 'EMP-42', '2026-04'], { logger: cap.logger, config: {} });
  assert.equal(code, 0);
});

test('dispatch: webhook test invalid url → exit 2', async () => {
  const cap = captureLogger();
  const code = await dispatcher.exec(['webhook', 'test', 'notaurl'], { logger: cap.logger, config: {} });
  assert.equal(code, 2);
});

test('dispatch: help command prints top-level', async () => {
  const cap = captureLogger();
  const code = await dispatcher.exec(['help'], { logger: cap.logger, config: {} });
  assert.equal(code, 0);
  assert.match(cap.combinedOut(), /onyx-cli/);
});

test('dispatch: help db prints group help', async () => {
  const cap = captureLogger();
  const code = await dispatcher.exec(['help', 'db'], { logger: cap.logger, config: {} });
  assert.equal(code, 0);
  assert.match(cap.combinedOut(), /migrate/);
});

test('dispatch: help db migrate prints sub help', async () => {
  const cap = captureLogger();
  const code = await dispatcher.exec(['help', 'db', 'migrate'], { logger: cap.logger, config: {} });
  assert.equal(code, 0);
  assert.match(cap.combinedOut(), /USAGE/);
});
