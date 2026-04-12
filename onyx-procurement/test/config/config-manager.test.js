/**
 * Unit tests for ConfigManager — unified config loader
 * Agent X-97 — written 2026-04-11
 *
 * Run:   node --test onyx-procurement/test/config/config-manager.test.js
 *
 * Coverage:
 *   - Dot-notation get/set/has (incl. escaped dots)
 *   - Type coercion from strings (env vars & .env files)
 *   - YAML parser: scalars, maps, sequences, flow style, comments
 *   - .env parser: quoted, comments, export prefix
 *   - Source precedence: env < file < remote < inline (last wins)
 *   - Deep merge (non-destructive — "לא מוחקים רק משדרגים")
 *   - Schema validation: required, type, min/max, enum, pattern,
 *     minLength/maxLength, defaults, custom validator
 *   - Encryption round-trip with AES-256-GCM
 *   - Decryption tamper detection
 *   - Auto-decrypt via .get()
 *   - Audit dump with redaction (key heuristics + schema secret:true)
 *   - Diff: added / removed / changed
 *   - Hot-reload via fs.watch
 *   - Bilingual Hebrew/English error messages
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  ConfigManager,
  _internal,
} = require('../../src/config/config-manager.js');

const {
  splitKey,
  dotGet,
  dotSet,
  dotHas,
  flatten,
  deepMerge,
  coerce,
  coerceToType,
  parseEnvFile,
  parseYaml,
  validateSchema,
  encryptValue,
  decryptValue,
  isEncrypted,
  redactTree,
  looksLikeSecretKey,
  detectFormat,
} = _internal;

// ─────────────────────────────────────────────────────────────
//  tmp helpers
// ─────────────────────────────────────────────────────────────

function mkTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'cfgmgr-'));
}

function writeFile(dir, name, contents) {
  const p = path.join(dir, name);
  fs.writeFileSync(p, contents, 'utf8');
  return p;
}

const HEX_KEY_32 = 'a'.repeat(64); // 32 bytes in hex

// ─────────────────────────────────────────────────────────────
//  Section 1 — Dot notation
// ─────────────────────────────────────────────────────────────

test('01. splitKey handles plain dots and escaped dots', () => {
  assert.deepEqual(splitKey('a.b.c'), ['a', 'b', 'c']);
  assert.deepEqual(splitKey('a\\.b.c'), ['a.b', 'c']);
  assert.deepEqual(splitKey(''), []);
  assert.deepEqual(splitKey('single'), ['single']);
});

test('02. dotGet returns nested value', () => {
  const obj = { a: { b: { c: 42 } } };
  assert.equal(dotGet(obj, 'a.b.c'), 42);
  assert.equal(dotGet(obj, 'a.b'), obj.a.b);
  assert.equal(dotGet(obj, 'a.x'), undefined);
  assert.equal(dotGet(obj, 'a.x', 'fallback'), 'fallback');
});

test('03. dotSet creates nested structure', () => {
  const obj = {};
  dotSet(obj, 'server.http.port', 3100);
  assert.deepEqual(obj, { server: { http: { port: 3100 } } });
});

test('04. dotSet overwrites non-object intermediates', () => {
  const obj = { a: 'scalar' };
  dotSet(obj, 'a.b', 1);
  assert.deepEqual(obj, { a: { b: 1 } });
});

test('05. dotHas detects presence of explicit null', () => {
  const obj = { a: { b: null } };
  assert.equal(dotHas(obj, 'a.b'), true);
  assert.equal(dotHas(obj, 'a.c'), false);
});

test('06. flatten converts nested → dotted keys', () => {
  const obj = { a: { b: { c: 1, d: 2 } }, e: 3 };
  const flat = flatten(obj);
  assert.equal(flat['a.b.c'], 1);
  assert.equal(flat['a.b.d'], 2);
  assert.equal(flat['e'], 3);
});

// ─────────────────────────────────────────────────────────────
//  Section 2 — Type coercion
// ─────────────────────────────────────────────────────────────

test('07. coerce — booleans, numbers, null, JSON', () => {
  assert.equal(coerce('true'), true);
  assert.equal(coerce('false'), false);
  assert.equal(coerce('null'), null);
  assert.equal(coerce('42'), 42);
  assert.equal(coerce('-3.14'), -3.14);
  assert.deepEqual(coerce('[1,2,3]'), [1, 2, 3]);
  assert.deepEqual(coerce('{"a":1}'), { a: 1 });
  assert.equal(coerce('hello'), 'hello');
});

test('08. coerceToType — boolean strings like "1" / "yes"', () => {
  assert.equal(coerceToType('yes', 'boolean'), true);
  assert.equal(coerceToType('no', 'boolean'), false);
  assert.equal(coerceToType('1', 'boolean'), true);
  assert.equal(coerceToType('0', 'boolean'), false);
  assert.equal(coerceToType('on', 'boolean'), true);
  assert.equal(coerceToType('off', 'boolean'), false);
});

test('09. coerceToType — integer truncates floats', () => {
  assert.equal(coerceToType('3.7', 'integer'), 3);
  assert.equal(coerceToType(3.7, 'integer'), 3);
});

// ─────────────────────────────────────────────────────────────
//  Section 3 — .env parser
// ─────────────────────────────────────────────────────────────

test('10. parseEnvFile — plain KEY=value pairs', () => {
  const txt = 'PORT=3100\nHOST=localhost\n';
  assert.deepEqual(parseEnvFile(txt), { PORT: '3100', HOST: 'localhost' });
});

test('11. parseEnvFile — comments, export, and quotes', () => {
  const txt = [
    '# comment',
    'export FOO=bar',
    'QUOTED="has # hash"',
    "SINGLE='x'",
    'INLINE=keep # trailing',
  ].join('\n');
  const parsed = parseEnvFile(txt);
  assert.equal(parsed.FOO, 'bar');
  assert.equal(parsed.QUOTED, 'has # hash');
  assert.equal(parsed.SINGLE, 'x');
  assert.equal(parsed.INLINE, 'keep');
});

// ─────────────────────────────────────────────────────────────
//  Section 4 — YAML parser
// ─────────────────────────────────────────────────────────────

test('12. parseYaml — basic nested map', () => {
  const txt = `server:
  host: 0.0.0.0
  port: 3100
logging:
  level: info
`;
  assert.deepEqual(parseYaml(txt), {
    server: { host: '0.0.0.0', port: 3100 },
    logging: { level: 'info' },
  });
});

test('13. parseYaml — sequences of scalars', () => {
  const txt = `features:
  - billing
  - payroll
  - procurement
`;
  assert.deepEqual(parseYaml(txt), {
    features: ['billing', 'payroll', 'procurement'],
  });
});

test('14. parseYaml — flow-style map and array', () => {
  const txt = 'inline: {a: 1, b: 2}\narr: [1, 2, 3]\n';
  assert.deepEqual(parseYaml(txt), {
    inline: { a: 1, b: 2 },
    arr: [1, 2, 3],
  });
});

test('15. parseYaml — comments and blank lines', () => {
  const txt = `# top comment
server:    # inline comment
  port: 8080
  host: "has # hash"
`;
  const out = parseYaml(txt);
  assert.equal(out.server.port, 8080);
  assert.equal(out.server.host, 'has # hash');
});

test('16. parseYaml — booleans, null, quoted strings', () => {
  const txt = `debug: true
cache: false
name: ~
label: "hello"
other: 'raw'
`;
  const out = parseYaml(txt);
  assert.equal(out.debug, true);
  assert.equal(out.cache, false);
  assert.equal(out.name, null);
  assert.equal(out.label, 'hello');
  assert.equal(out.other, 'raw');
});

// ─────────────────────────────────────────────────────────────
//  Section 5 — Deep merge (non-destructive)
// ─────────────────────────────────────────────────────────────

test('17. deepMerge keeps prior keys that the new source does not touch', () => {
  const a = { db: { host: 'a', port: 5432 }, keep: true };
  const b = { db: { host: 'b' } };
  const out = deepMerge(a, b);
  assert.equal(out.db.host, 'b');
  assert.equal(out.db.port, 5432);
  assert.equal(out.keep, true);
});

test('18. deepMerge — arrays are replaced, not concatenated', () => {
  const a = { list: [1, 2, 3] };
  const b = { list: [9] };
  assert.deepEqual(deepMerge(a, b).list, [9]);
});

// ─────────────────────────────────────────────────────────────
//  Section 6 — Source precedence (env < file < remote < inline)
// ─────────────────────────────────────────────────────────────

test('19. ConfigManager — file overrides env', async () => {
  const dir = mkTmpDir();
  try {
    const yamlPath = writeFile(dir, 'cfg.yaml', 'server:\n  port: 4000\n');
    const cfg = new ConfigManager({ env: { MYAPP__SERVER__PORT: '9999' } });
    await cfg.load({
      sources: [
        { type: 'env', prefix: 'MYAPP__' },
        { type: 'file', path: yamlPath },
      ],
    });
    assert.equal(cfg.get('server.port'), 4000);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('20. ConfigManager — inline overrides file (last wins)', async () => {
  const dir = mkTmpDir();
  try {
    const yamlPath = writeFile(dir, 'cfg.yaml', 'server:\n  port: 4000\n  host: a\n');
    const cfg = new ConfigManager();
    await cfg.load({
      sources: [
        { type: 'file', path: yamlPath },
        { type: 'inline', data: { server: { port: 5000 } } },
      ],
    });
    assert.equal(cfg.get('server.port'), 5000);
    // host survives from the file — never deleted:
    assert.equal(cfg.get('server.host'), 'a');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('21. ConfigManager — three-source precedence env→file→inline', async () => {
  const dir = mkTmpDir();
  try {
    const envPath = writeFile(dir, '.env', 'APP__PORT=1111\nAPP__HOST=env-host\n');
    const yamlPath = writeFile(dir, 'cfg.yaml', 'port: 2222\nlog: file\n');
    const cfg = new ConfigManager();
    await cfg.load({
      sources: [
        { type: 'file', path: envPath, format: 'env' },
        { type: 'file', path: yamlPath },
        { type: 'inline', data: { port: 3333 } },
      ],
    });
    assert.equal(cfg.get('port'), 3333);
    assert.equal(cfg.get('log'), 'file');
    assert.equal(cfg.get('app.host'), 'env-host');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('22. ConfigManager — env source with prefix and __→. separator', async () => {
  const cfg = new ConfigManager({
    env: {
      MYAPP__DATABASE__HOST: 'localhost',
      MYAPP__DATABASE__PORT: '5432',
      MYAPP__FEATURES: '["a","b"]',
      UNRELATED: 'ignore',
    },
  });
  await cfg.load({ sources: [{ type: 'env', prefix: 'MYAPP__' }] });
  assert.equal(cfg.get('database.host'), 'localhost');
  assert.equal(cfg.get('database.port'), 5432);
  assert.deepEqual(cfg.get('features'), ['a', 'b']);
  assert.equal(cfg.get('unrelated'), undefined);
});

// ─────────────────────────────────────────────────────────────
//  Section 7 — Schema validation
// ─────────────────────────────────────────────────────────────

test('23. validateSchema — missing required key fails', () => {
  const data = { server: {} };
  const schema = { 'server.port': { type: 'number', required: true } };
  const res = validateSchema(data, schema);
  assert.equal(res.valid, false);
  assert.equal(res.errors[0].rule, 'required');
  assert.ok(res.errors[0].he.includes('חובה'));
  assert.ok(res.errors[0].en.includes('Missing required'));
});

test('24. validateSchema — type mismatch fails', () => {
  const data = { port: 'not-a-number-and-cannot-coerce' };
  const schema = { port: { type: 'number' } };
  const res = validateSchema(data, schema);
  assert.equal(res.valid, false);
  assert.equal(res.errors[0].rule, 'type');
});

test('25. validateSchema — coerces string "3100" to number', () => {
  const data = { port: '3100' };
  const schema = { port: { type: 'number' } };
  const res = validateSchema(data, schema);
  assert.equal(res.valid, true);
  assert.equal(res.data.port, 3100);
});

test('26. validateSchema — min/max numeric bounds', () => {
  const schema = { port: { type: 'number', min: 1, max: 65535 } };
  assert.equal(validateSchema({ port: 0 }, schema).valid, false);
  assert.equal(validateSchema({ port: 70000 }, schema).valid, false);
  assert.equal(validateSchema({ port: 3100 }, schema).valid, true);
});

test('27. validateSchema — enum rejects non-members', () => {
  const schema = { 'log.level': { type: 'string', enum: ['debug', 'info', 'warn', 'error'] } };
  assert.equal(validateSchema({ log: { level: 'trace' } }, schema).valid, false);
  assert.equal(validateSchema({ log: { level: 'info' } }, schema).valid, true);
});

test('28. validateSchema — regex pattern', () => {
  const schema = { slug: { type: 'string', pattern: '^[a-z0-9-]+$' } };
  assert.equal(validateSchema({ slug: 'hello-world' }, schema).valid, true);
  assert.equal(validateSchema({ slug: 'Hello World' }, schema).valid, false);
});

test('29. validateSchema — defaults fill missing keys', () => {
  const schema = { 'server.host': { type: 'string', default: '0.0.0.0' } };
  const res = validateSchema({}, schema);
  assert.equal(res.valid, true);
  assert.equal(res.data.server.host, '0.0.0.0');
});

test('30. validateSchema — minLength / maxLength', () => {
  const schema = { name: { type: 'string', minLength: 3, maxLength: 8 } };
  assert.equal(validateSchema({ name: 'ab' }, schema).valid, false);
  assert.equal(validateSchema({ name: 'verylongname' }, schema).valid, false);
  assert.equal(validateSchema({ name: 'kobi-el' }, schema).valid, true);
});

test('31. validateSchema — custom validator function', () => {
  const schema = {
    port: {
      type: 'number',
      validator: (v) => (v % 2 === 0 ? true : { ok: false, en: 'must be even', he: 'חייב להיות זוגי' }),
    },
  };
  assert.equal(validateSchema({ port: 3100 }, schema).valid, true);
  const bad = validateSchema({ port: 3101 }, schema);
  assert.equal(bad.valid, false);
  assert.ok(bad.errors[0].he.includes('זוגי'));
});

test('32. ConfigManager.load — throws on invalid config', async () => {
  const cfg = new ConfigManager();
  await assert.rejects(
    cfg.load({
      sources: [{ type: 'inline', data: {} }],
      schema: { 'db.password': { type: 'string', required: true } },
    }),
    (err) => err.code === 'CONFIG_VALIDATION'
  );
});

// ─────────────────────────────────────────────────────────────
//  Section 8 — Encryption round-trip (AES-256-GCM)
// ─────────────────────────────────────────────────────────────

test('33. encryptValue → decryptValue round-trip', () => {
  const plain = 'super-secret-db-password-2026';
  const ct = encryptValue(plain, HEX_KEY_32);
  assert.ok(ct.startsWith('enc:v1:'));
  assert.ok(isEncrypted(ct));
  assert.equal(decryptValue(ct, HEX_KEY_32), plain);
});

test('34. encryption — same plaintext → different ciphertext (random IV)', () => {
  const a = encryptValue('same', HEX_KEY_32);
  const b = encryptValue('same', HEX_KEY_32);
  assert.notEqual(a, b);
});

test('35. decryption — tamper detection via GCM auth tag', () => {
  const ct = encryptValue('hello', HEX_KEY_32);
  // Mangle the ciphertext body (last segment) by flipping a character
  const parts = ct.split(':');
  const tampered = parts.slice(0, 3).join(':') + ':' + parts[3] + ':' + parts[4].replace(/.$/, (c) =>
    c === 'A' ? 'B' : 'A');
  assert.throws(() => decryptValue(tampered, HEX_KEY_32), (err) => err.code === 'DECRYPT_FAIL');
});

test('36. decryption — malformed ciphertext reports clear error', () => {
  assert.throws(() => decryptValue('not-encrypted', HEX_KEY_32),
    (err) => err.code === 'DECRYPT_BAD_INPUT');
});

test('37. ConfigManager.encrypt / decrypt via instance methods', () => {
  const cfg = new ConfigManager({ env: { CONFIG_ENCRYPTION_KEY: HEX_KEY_32 } });
  const ct = cfg.encrypt('api-key-abc-123');
  assert.equal(cfg.decrypt(ct), 'api-key-abc-123');
});

test('38. ConfigManager.get auto-decrypts encrypted values', async () => {
  const cfg = new ConfigManager({ env: { CONFIG_ENCRYPTION_KEY: HEX_KEY_32 } });
  const ct = cfg.encrypt('db-password-2026');
  await cfg.load({ sources: [{ type: 'inline', data: { database: { password: ct } } }] });
  assert.equal(cfg.get('database.password'), 'db-password-2026');
  // Raw getter leaves ciphertext as-is
  assert.equal(cfg.getRaw('database.password'), ct);
});

// ─────────────────────────────────────────────────────────────
//  Section 9 — Audit dump / redaction
// ─────────────────────────────────────────────────────────────

test('39. looksLikeSecretKey heuristics', () => {
  assert.equal(looksLikeSecretKey('password'), true);
  assert.equal(looksLikeSecretKey('db.password'), true);
  assert.equal(looksLikeSecretKey('api_key'), true);
  assert.equal(looksLikeSecretKey('apiKey'), true);
  assert.equal(looksLikeSecretKey('auth.token'), true);
  assert.equal(looksLikeSecretKey('server.host'), false);
  assert.equal(looksLikeSecretKey('log.level'), false);
});

test('40. redactTree — masks secrets by key heuristic', () => {
  const tree = {
    server: { host: 'localhost', port: 3100 },
    db: { user: 'admin', password: 'hunter2-very-secret' },
    auth: { token: 'abcdef123456' },
  };
  const out = redactTree(tree, {}, '');
  assert.equal(out.server.host, 'localhost');
  assert.equal(out.db.user, 'admin');
  assert.notEqual(out.db.password, 'hunter2-very-secret');
  assert.ok(out.db.password.includes('***'));
  assert.ok(out.auth.token.includes('***'));
});

test('41. redactTree — respects schema secret:true flag', () => {
  const tree = { custom: { sneaky: 'plain-looking-but-secret' } };
  const schema = { 'custom.sneaky': { type: 'string', secret: true } };
  const out = redactTree(tree, schema, '');
  assert.notEqual(out.custom.sneaky, 'plain-looking-but-secret');
  assert.ok(out.custom.sneaky.includes('***'));
});

test('42. ConfigManager.dump — redactSecrets:true by default', async () => {
  const cfg = new ConfigManager();
  await cfg.load({
    sources: [{
      type: 'inline',
      data: { db: { password: 'secret123456' }, server: { port: 3100 } },
    }],
  });
  const dumped = cfg.dump();
  assert.notEqual(dumped.db.password, 'secret123456');
  assert.equal(dumped.server.port, 3100);
});

test('43. ConfigManager.dump — format:"flat" returns dotted map', async () => {
  const cfg = new ConfigManager();
  await cfg.load({
    sources: [{
      type: 'inline',
      data: { server: { port: 3100, host: 'a' } },
    }],
  });
  const flat = cfg.dump({ format: 'flat' });
  assert.equal(flat['server.port'], 3100);
  assert.equal(flat['server.host'], 'a');
});

test('44. ConfigManager.dump — format:"json" returns string', async () => {
  const cfg = new ConfigManager();
  await cfg.load({ sources: [{ type: 'inline', data: { x: 1 } }] });
  const j = cfg.dump({ format: 'json' });
  assert.equal(typeof j, 'string');
  assert.deepEqual(JSON.parse(j), { x: 1 });
});

// ─────────────────────────────────────────────────────────────
//  Section 10 — Diff
// ─────────────────────────────────────────────────────────────

test('45. diff — reports added, removed, changed', async () => {
  const cfg = new ConfigManager();
  await cfg.load({
    sources: [{ type: 'inline', data: { keep: 1, change: 'new', added: true } }],
  });
  const delta = cfg.diff({ keep: 1, change: 'old', removed: true });
  assert.equal(delta.added.length, 1);
  assert.equal(delta.added[0].key, 'added');
  assert.equal(delta.removed.length, 1);
  assert.equal(delta.removed[0].key, 'removed');
  assert.equal(delta.changed.length, 1);
  assert.equal(delta.changed[0].key, 'change');
  assert.equal(delta.changed[0].before, 'old');
  assert.equal(delta.changed[0].after, 'new');
});

test('46. diff — no change yields all-empty arrays', async () => {
  const cfg = new ConfigManager();
  await cfg.load({ sources: [{ type: 'inline', data: { a: 1 } }] });
  const delta = cfg.diff({ a: 1 });
  assert.deepEqual(delta, { added: [], removed: [], changed: [] });
});

test('47. diff — accepts another ConfigManager', async () => {
  const a = new ConfigManager();
  await a.load({ sources: [{ type: 'inline', data: { port: 3100 } }] });
  const b = new ConfigManager();
  await b.load({ sources: [{ type: 'inline', data: { port: 9000 } }] });
  const delta = a.diff(b);
  assert.equal(delta.changed[0].before, 9000);
  assert.equal(delta.changed[0].after, 3100);
});

// ─────────────────────────────────────────────────────────────
//  Section 11 — Hot reload
// ─────────────────────────────────────────────────────────────

test('48. watch — fs.watch triggers reload on file change', async (t) => {
  const dir = mkTmpDir();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const p = writeFile(dir, 'cfg.yaml', 'server:\n  port: 3000\n');
  const cfg = new ConfigManager({ debounceMs: 25 });
  await cfg.load({ sources: [{ type: 'file', path: p }] });
  assert.equal(cfg.get('server.port'), 3000);

  await new Promise((resolve, reject) => {
    const unwatch = cfg.watch((newData, meta) => {
      try {
        assert.equal(newData.server.port, 4000);
        assert.ok(meta.changed.some((c) => c.key === 'server.port'));
        unwatch();
        cfg.close();
        resolve();
      } catch (e) {
        unwatch();
        cfg.close();
        reject(e);
      }
    });
    // Give the watcher a tick to install
    setTimeout(() => {
      fs.writeFileSync(p, 'server:\n  port: 4000\n', 'utf8');
    }, 60);
    // Safety timeout
    setTimeout(() => {
      unwatch();
      cfg.close();
      reject(new Error('watch timeout'));
    }, 4000);
  });
});

test('49. unwatch — stops further notifications', async (t) => {
  const dir = mkTmpDir();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const p = writeFile(dir, 'cfg.yaml', 'a: 1\n');
  const cfg = new ConfigManager({ debounceMs: 20 });
  await cfg.load({ sources: [{ type: 'file', path: p }] });
  let calls = 0;
  const unwatch = cfg.watch(() => { calls++; });
  unwatch();
  fs.writeFileSync(p, 'a: 2\n', 'utf8');
  await new Promise((r) => setTimeout(r, 120));
  assert.equal(calls, 0);
  cfg.close();
});

// ─────────────────────────────────────────────────────────────
//  Section 12 — Bilingual errors
// ─────────────────────────────────────────────────────────────

test('50. Bilingual error object carries he + en + code', async () => {
  const cfg = new ConfigManager();
  try {
    await cfg.load({ sources: [{ type: 'file', path: '/nonexistent/path/cfg.yaml' }] });
    assert.fail('expected error');
  } catch (err) {
    assert.equal(err.code, 'FILE_NOT_FOUND');
    assert.ok(err.message_he && err.message_he.includes('לא נמצא'));
    assert.ok(err.message_en && err.message_en.includes('not found'));
  }
});

test('51. Bilingual error — unknown source type', async () => {
  const cfg = new ConfigManager();
  await assert.rejects(
    cfg.load({ sources: [{ type: 'telepathy' }] }),
    (err) => err.code === 'SOURCE_UNKNOWN' &&
      err.message_he.includes('לא מוכר') &&
      err.message_en.includes('Unknown source')
  );
});

// ─────────────────────────────────────────────────────────────
//  Section 13 — Format detection
// ─────────────────────────────────────────────────────────────

test('52. detectFormat — by extension', () => {
  assert.equal(detectFormat('cfg.yaml'), 'yaml');
  assert.equal(detectFormat('cfg.yml'), 'yaml');
  assert.equal(detectFormat('cfg.json'), 'json');
  assert.equal(detectFormat('.env'), 'env');
  assert.equal(detectFormat('cfg.txt'), null);
});

// ─────────────────────────────────────────────────────────────
//  Section 14 — End-to-end ERP-flavored scenario
// ─────────────────────────────────────────────────────────────

test('53. E2E — env+yaml+inline+schema+encryption, Techno-Kol style', async () => {
  const dir = mkTmpDir();
  try {
    writeFile(dir, 'default.yaml', `
server:
  port: 3100
  host: 0.0.0.0
database:
  host: localhost
  port: 5432
  user: onyx
features:
  - procurement
  - billing
  - payroll
logging:
  level: info
`);
    writeFile(dir, 'prod.json', JSON.stringify({
      server: { host: '10.0.0.42' },
      logging: { level: 'warn' },
    }));

    const cfg = new ConfigManager({
      env: {
        CONFIG_ENCRYPTION_KEY: HEX_KEY_32,
        ONYX__SERVER__PORT: '3200', // overridden by file below
      },
    });

    const ciphertext = encryptValue('db-secret-pw', HEX_KEY_32);

    await cfg.load({
      sources: [
        { type: 'env', prefix: 'ONYX__' },
        { type: 'file', path: path.join(dir, 'default.yaml') },
        { type: 'file', path: path.join(dir, 'prod.json') },
        { type: 'inline', data: { database: { password: ciphertext } } },
      ],
      schema: {
        'server.port':       { type: 'number', required: true, min: 1, max: 65535 },
        'server.host':       { type: 'string', required: true },
        'database.host':     { type: 'string', required: true },
        'database.port':     { type: 'number', required: true },
        'database.user':     { type: 'string', required: true },
        'database.password': { type: 'string', required: true, secret: true },
        'logging.level':     { type: 'string', enum: ['debug', 'info', 'warn', 'error'] },
      },
    });

    // YAML wins over env (later in sources list)
    assert.equal(cfg.get('server.port'), 3100);
    // JSON wins over YAML for server.host
    assert.equal(cfg.get('server.host'), '10.0.0.42');
    // YAML keys that JSON doesn't touch are preserved — non-destructive merge
    assert.equal(cfg.get('database.host'), 'localhost');
    assert.equal(cfg.get('database.port'), 5432);
    assert.deepEqual(cfg.get('features'), ['procurement', 'billing', 'payroll']);
    // JSON changed logging level
    assert.equal(cfg.get('logging.level'), 'warn');
    // password auto-decrypts
    assert.equal(cfg.get('database.password'), 'db-secret-pw');

    // Audit dump hides the decrypted password
    const audit = cfg.dump();
    assert.notEqual(audit.database.password, 'db-secret-pw');
    assert.ok(String(audit.database.password).includes('***'));
    // But benign fields are unchanged
    assert.equal(audit.server.port, 3100);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('54. set() and has() work post-load', async () => {
  const cfg = new ConfigManager();
  await cfg.load({ sources: [{ type: 'inline', data: { a: 1 } }] });
  assert.equal(cfg.has('a'), true);
  assert.equal(cfg.has('b'), false);
  cfg.set('b.c.d', 'deep');
  assert.equal(cfg.has('b.c.d'), true);
  assert.equal(cfg.get('b.c.d'), 'deep');
});

test('55. keys() lists all dotted leaves', async () => {
  const cfg = new ConfigManager();
  await cfg.load({
    sources: [{ type: 'inline', data: { server: { port: 3100, host: 'x' }, db: { u: 'a' } } }],
  });
  const keys = cfg.keys().sort();
  assert.deepEqual(keys, ['db.u', 'server.host', 'server.port']);
});
