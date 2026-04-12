/**
 * AG-X84 — Migrator Tests
 * ═══════════════════════════════════════════════════════════════════════════
 * Runs with:  node --test test/db/migrator.test.js
 *
 * Coverage
 * ──────────────────────────────────────────────────────────────────────────
 *   1. parseMigration   — delimiter handling, error cases
 *   2. slugify          — ASCII-safe from bilingual names
 *   3. isDestructive    — detection + comment/string false-positive guards
 *   4. Migrator.create  — scaffold with correct numbering
 *   5. Migrator.verify  — dry-run, ordering, destructive flagging
 *   6. Migrator.up      — transaction per migration, ordering
 *   7. Migrator.up      — rollback on error leaves DB untouched
 *   8. Migrator.up      — destructive refusal without flag
 *   9. Migrator.status  — applied vs pending report
 *  10. Migrator.checksum — modification detection, strict refusal
 *  11. Migrator.down    — refuses without allowDown
 *  12. Migrator.down    — rolls back last N in reverse order
 * ═══════════════════════════════════════════════════════════════════════════
 */

'use strict';

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  Migrator,
  parseMigration,
  sha256,
  isDestructive,
  slugify,
  splitStatements,
} = require('../../src/db/migrator');

// ═══════════════════════════════════════════════════════════════════════════
// In-memory mock pg client
// ═══════════════════════════════════════════════════════════════════════════
//
// Supports enough of the node-postgres `Client` API to exercise Migrator:
//   - query(sql, params)       → returns { rows }
//   - BEGIN / COMMIT / ROLLBACK — tracks savepoints
//   - connect()                — returns this (no pooling)
//
// State
// -----
//   state.tables               — Map<tableName, rows[]>
//   state.log                  — every SQL sent, in order (for assertions)
//   state.failOn               — optional regex; matching query throws
//
// The mock understands just enough SQL to satisfy the Migrator:
//   * CREATE TABLE IF NOT EXISTS _migrations (...)
//   * INSERT INTO _migrations (...)
//   * DELETE FROM _migrations WHERE name = $1
//   * SELECT ... FROM _migrations ORDER BY id ASC
//
// For migration payload SQL (CREATE TABLE suppliers, etc.) the mock records
// the text in `log` but performs no schema simulation — that is the job of
// integration tests against a real Postgres instance. The unit tests here
// are about the migrator's orchestration, not SQL semantics.
// ═══════════════════════════════════════════════════════════════════════════

function createMockClient({ failOn = null } = {}) {
  const state = {
    migrations: [], // rows of _migrations
    nextId: 1,
    log: [],
    txDepth: 0,
    rollbacks: 0,
    commits: 0,
    failOn, // RegExp or null
  };

  async function query(sql, params = []) {
    state.log.push({ sql: sql.trim(), params });

    if (state.failOn && state.failOn.test(sql)) {
      const err = new Error(`mock: failOn matched — ${sql.slice(0, 60)}`);
      throw err;
    }

    const norm = sql.trim().toUpperCase();

    if (norm.startsWith('BEGIN')) {
      state.txDepth++;
      return { rows: [] };
    }
    if (norm.startsWith('COMMIT')) {
      state.txDepth--;
      state.commits++;
      return { rows: [] };
    }
    if (norm.startsWith('ROLLBACK')) {
      state.txDepth--;
      state.rollbacks++;
      // rollback a single migration insert if it happened inside this tx
      return { rows: [] };
    }

    // CREATE TABLE IF NOT EXISTS _migrations → no-op (mock tracks in-mem)
    if (/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+_migrations/i.test(sql)) {
      return { rows: [] };
    }

    // INSERT INTO _migrations (...)
    if (/INSERT\s+INTO\s+_migrations/i.test(sql)) {
      const [name, checksum, duration, rollback] = params;
      const row = {
        id: state.nextId++,
        name,
        applied_at: new Date().toISOString(),
        checksum,
        duration_ms: duration,
        rollback_sql: rollback,
      };
      // Emulate PG uniqueness on `name`: subsequent inserts with same name
      // should throw (we do not actually persist anywhere in a tx-aware way
      // because our tests never exercise the duplicate path).
      state.migrations.push(row);
      return { rows: [row] };
    }

    // DELETE FROM _migrations WHERE name = $1
    if (/DELETE\s+FROM\s+_migrations\s+WHERE\s+name/i.test(sql)) {
      const [name] = params;
      const idx = state.migrations.findIndex((m) => m.name === name);
      if (idx >= 0) state.migrations.splice(idx, 1);
      return { rows: [] };
    }

    // SELECT ... FROM _migrations ORDER BY id ASC
    if (/FROM\s+_migrations/i.test(sql) && norm.startsWith('SELECT')) {
      return { rows: state.migrations.slice().sort((a, b) => a.id - b.id) };
    }

    // Everything else is a migration payload statement; just record it.
    return { rows: [] };
  }

  const client = {
    _state: state,
    query,
    // no connect() → Migrator falls back to shared-client BEGIN/COMMIT
  };
  return client;
}

// ═══════════════════════════════════════════════════════════════════════════
// Test workspace — each test uses a fresh temp dir
// ═══════════════════════════════════════════════════════════════════════════

function freshWorkspace() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'migrator-test-'));
  const migrationsDir = path.join(dir, 'db', 'migrations');
  fs.mkdirSync(migrationsDir, { recursive: true });
  return { root: dir, migrationsDir };
}

function writeMigration(dir, filename, body) {
  fs.writeFileSync(path.join(dir, filename), body, 'utf8');
}

function validMigration(upBody, downBody) {
  return (
    `-- test migration\n` +
    `-- +migrate Up\n${upBody}\n` +
    `-- +migrate Down\n${downBody}\n`
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. parseMigration
// ═══════════════════════════════════════════════════════════════════════════

describe('parseMigration', () => {
  test('extracts up and down sections', () => {
    const txt = validMigration('CREATE TABLE a (id int);', 'DROP TABLE a;');
    const { up, down } = parseMigration(txt);
    assert.match(up, /CREATE TABLE a/);
    assert.match(down, /DROP TABLE a/);
  });

  test('tolerates missing down section', () => {
    const txt = `-- +migrate Up\nCREATE TABLE a (id int);\n`;
    const { up, down } = parseMigration(txt);
    assert.match(up, /CREATE TABLE a/);
    assert.equal(down, '');
  });

  test('throws when up delimiter is missing', () => {
    assert.throws(() => parseMigration('SELECT 1;'), /missing.*migrate Up/);
  });

  test('throws when down appears before up', () => {
    const txt = `-- +migrate Down\nfoo;\n-- +migrate Up\nbar;\n`;
    assert.throws(() => parseMigration(txt), /Down section must appear AFTER/);
  });

  test('throws when up is empty', () => {
    const txt = `-- +migrate Up\n\n-- +migrate Down\nfoo;\n`;
    assert.throws(() => parseMigration(txt), /Up section is empty/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. slugify
// ═══════════════════════════════════════════════════════════════════════════

describe('slugify', () => {
  test('lowercases and underscores ASCII names', () => {
    assert.equal(slugify('Purchase Orders v2'), 'purchase_orders_v2');
  });

  test('strips Hebrew characters but keeps English', () => {
    assert.equal(slugify('רכש — purchase orders'), 'purchase_orders');
  });

  test('falls back to hash for pure-Hebrew names', () => {
    const s = slugify('רכש');
    assert.match(s, /^migration_[a-f0-9]{8}$/);
  });

  test('collapses consecutive separators', () => {
    assert.equal(slugify('add   vat  column'), 'add_vat_column');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. isDestructive
// ═══════════════════════════════════════════════════════════════════════════

describe('isDestructive', () => {
  test('flags DROP TABLE', () => {
    const hits = isDestructive('DROP TABLE suppliers;');
    assert.ok(hits.some((h) => h.pattern === 'DROP TABLE'));
  });

  test('flags DROP COLUMN inside ALTER TABLE', () => {
    const hits = isDestructive('ALTER TABLE foo DROP COLUMN bar;');
    assert.ok(hits.length >= 1);
  });

  test('flags TRUNCATE', () => {
    const hits = isDestructive('TRUNCATE payments;');
    assert.ok(hits.some((h) => h.pattern === 'TRUNCATE'));
  });

  test('flags DELETE without WHERE', () => {
    const hits = isDestructive('DELETE FROM audit_events;');
    assert.ok(hits.some((h) => h.pattern === 'DELETE FROM (no WHERE)'));
  });

  test('does NOT flag DELETE WITH WHERE', () => {
    const hits = isDestructive("DELETE FROM audit_events WHERE id = 1;");
    assert.deepEqual(hits, []);
  });

  test('ignores destructive keywords inside string literals', () => {
    const sql = "INSERT INTO notes (body) VALUES ('DROP TABLE tmp');";
    assert.deepEqual(isDestructive(sql), []);
  });

  test('ignores destructive keywords inside line comments', () => {
    const sql = '-- DROP TABLE tmp\nSELECT 1;';
    assert.deepEqual(isDestructive(sql), []);
  });

  test('does NOT flag CREATE TABLE', () => {
    const sql = 'CREATE TABLE suppliers (id uuid primary key);';
    assert.deepEqual(isDestructive(sql), []);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. Migrator.create
// ═══════════════════════════════════════════════════════════════════════════

describe('Migrator.create', () => {
  test('scaffolds a zero-padded file with up+down sections', () => {
    const { migrationsDir } = freshWorkspace();
    const client = createMockClient();
    const m = new Migrator({ client, migrationsDir });

    const full = m.create('initial schema');
    assert.ok(fs.existsSync(full));
    assert.match(path.basename(full), /^0001_initial_schema\.sql$/);

    const body = fs.readFileSync(full, 'utf8');
    assert.match(body, /\+migrate Up/);
    assert.match(body, /\+migrate Down/);
    assert.match(body, /לא מוחקים רק משדרגים/);
  });

  test('increments numeric prefix across existing files', () => {
    const { migrationsDir } = freshWorkspace();
    writeMigration(migrationsDir, '0001_alpha.sql', validMigration('a;', 'b;'));
    writeMigration(migrationsDir, '0002_beta.sql', validMigration('a;', 'b;'));

    const client = createMockClient();
    const m = new Migrator({ client, migrationsDir });
    const full = m.create('gamma bilingual רכש');
    assert.match(path.basename(full), /^0003_gamma_bilingual\.sql$/);
  });

  test('refuses to overwrite an existing file', () => {
    const { migrationsDir } = freshWorkspace();
    const client = createMockClient();
    const m = new Migrator({ client, migrationsDir });

    // Pre-plant the exact filename create() will want to use so it collides.
    // create() scans existing files and computes the next prefix, so we must
    // plant the file that create() would emit (0001_manual.sql for the
    // first call) — that way it sees order=1, picks next=0002... so
    // instead we plant nothing and pre-write 0001_manual.sql directly:
    const preplanted = path.join(migrationsDir, '0001_manual.sql');
    fs.writeFileSync(preplanted, 'existing');
    // Now create() will look at existing files, see prefix 1, pick next=2 →
    // 0002_manual.sql. That's a different filename, so no collision. To
    // force a real collision we need the would-be target to already exist.
    // After the first create() is written, manually re-stage by removing
    // the entry from the listing via another prefix number. Easiest:
    // write a file at the NEXT prefix slot too:
    const next = path.join(migrationsDir, '0002_manual.sql');
    fs.writeFileSync(next, 'also existing');
    // Now create('manual') would pick 0003 which doesn't collide.
    // Instead we assert that direct existsSync logic is used: write
    // 0003_manual.sql too.
    const third = path.join(migrationsDir, '0003_manual.sql');
    fs.writeFileSync(third, 'collision target');
    // The next create call should pick prefix 4 since max existing is 3 —
    // so still no collision. Conclusion: to test the overwrite guard,
    // bypass the numbering by setting up a fake _listMigrationFiles:
    const originalList = m._listMigrationFiles.bind(m);
    m._listMigrationFiles = () => []; // pretend the dir is empty
    assert.throws(
      () => m.create('manual'),
      /refusing to overwrite/
    );
    m._listMigrationFiles = originalList;
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. Migrator.verify — dry-run
// ═══════════════════════════════════════════════════════════════════════════

describe('Migrator.verify', () => {
  test('reports ok=true for a well-formed migration', async () => {
    const { migrationsDir } = freshWorkspace();
    writeMigration(
      migrationsDir,
      '0001_init.sql',
      validMigration('CREATE TABLE a (id int);', 'DROP TABLE a;')
    );
    const client = createMockClient();
    const m = new Migrator({ client, migrationsDir });
    const { ok, results } = await m.verify();
    assert.equal(ok, true);
    assert.equal(results.length, 1);
    assert.equal(results[0].ok, true);
    assert.equal(results[0].statements.up, 1);
    // verify() classifies the Up section only; a DROP TABLE in the Down
    // section is fine because rollback requires its own flag.
    assert.deepEqual(results[0].destructive, []);
  });

  test('flags destructive statements in the Up section', async () => {
    const { migrationsDir } = freshWorkspace();
    writeMigration(
      migrationsDir,
      '0001_evil.sql',
      validMigration('DROP TABLE a;', 'CREATE TABLE a (id int);')
    );
    const client = createMockClient();
    const m = new Migrator({ client, migrationsDir });
    const { results } = await m.verify();
    assert.deepEqual(results[0].destructive, ['DROP TABLE']);
  });

  test('reports ok=false when a file is missing delimiters', async () => {
    const { migrationsDir } = freshWorkspace();
    writeMigration(migrationsDir, '0001_broken.sql', 'SELECT 1;');
    const client = createMockClient();
    const m = new Migrator({ client, migrationsDir });
    const { ok, results } = await m.verify();
    assert.equal(ok, false);
    assert.match(results[0].error, /missing.*migrate Up/);
  });

  test('does not execute SQL against the injected client', async () => {
    const { migrationsDir } = freshWorkspace();
    writeMigration(
      migrationsDir,
      '0001_init.sql',
      validMigration('CREATE TABLE a (id int);', '')
    );
    const client = createMockClient();
    const m = new Migrator({ client, migrationsDir });
    await m.verify();
    const payloadQueries = client._state.log.filter((q) =>
      /CREATE TABLE a/.test(q.sql)
    );
    assert.equal(payloadQueries.length, 0, 'verify must not execute payload SQL');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. Migrator.up — ordering + transactions
// ═══════════════════════════════════════════════════════════════════════════

describe('Migrator.up', () => {
  test('runs pending migrations in numeric order inside a tx each', async () => {
    const { migrationsDir } = freshWorkspace();
    writeMigration(
      migrationsDir,
      '0002_second.sql',
      validMigration('CREATE TABLE t2 (id int);', 'DROP TABLE t2;')
    );
    writeMigration(
      migrationsDir,
      '0001_first.sql',
      validMigration('CREATE TABLE t1 (id int);', 'DROP TABLE t1;')
    );

    const client = createMockClient();
    const m = new Migrator({ client, migrationsDir });
    const res = await m.up();

    assert.deepEqual(res.applied, ['0001_first.sql', '0002_second.sql']);
    // Each should be wrapped in BEGIN/COMMIT
    assert.equal(client._state.commits, 2);
    assert.equal(client._state.rollbacks, 0);

    // Check SQL ordering: BEGIN before CREATE TABLE t1 before COMMIT
    const log = client._state.log.map((l) => l.sql);
    const i1 = log.findIndex((s) => /CREATE TABLE t1/.test(s));
    const i2 = log.findIndex((s) => /CREATE TABLE t2/.test(s));
    assert.ok(i1 !== -1 && i2 !== -1 && i1 < i2);
  });

  test('skips already-applied migrations on second run', async () => {
    const { migrationsDir } = freshWorkspace();
    writeMigration(
      migrationsDir,
      '0001_first.sql',
      validMigration('CREATE TABLE t1 (id int);', 'DROP TABLE t1;')
    );
    const client = createMockClient();
    const m = new Migrator({ client, migrationsDir });
    await m.up();
    const res2 = await m.up();
    assert.deepEqual(res2.applied, []);
    assert.ok(res2.skipped.includes('0001_first.sql'));
  });

  test('rolls back transaction on payload error and leaves state clean', async () => {
    const { migrationsDir } = freshWorkspace();
    writeMigration(
      migrationsDir,
      '0001_first.sql',
      validMigration('CREATE TABLE good (id int);', 'DROP TABLE good;')
    );
    writeMigration(
      migrationsDir,
      '0002_bad.sql',
      validMigration('CREATE TABLE will_fail (id int);', 'DROP TABLE will_fail;')
    );

    const client = createMockClient({ failOn: /will_fail/ });
    const m = new Migrator({ client, migrationsDir });

    await assert.rejects(() => m.up(), /will_fail/);

    assert.equal(client._state.rollbacks, 1);
    assert.equal(client._state.commits, 1); // only the good one committed
    // Only the first migration should be in the _migrations table
    assert.equal(client._state.migrations.length, 1);
    assert.equal(client._state.migrations[0].name, '0001_first.sql');
  });

  test('refuses destructive migrations without allowDestructive flag', async () => {
    const { migrationsDir } = freshWorkspace();
    writeMigration(
      migrationsDir,
      '0001_destroy.sql',
      validMigration('DROP TABLE suppliers;', 'CREATE TABLE suppliers (id int);')
    );
    const client = createMockClient();
    const m = new Migrator({ client, migrationsDir });
    await assert.rejects(() => m.up(), /destructive/i);
    assert.equal(client._state.migrations.length, 0);
  });

  test('runs destructive migrations WHEN allowDestructive=true', async () => {
    const { migrationsDir } = freshWorkspace();
    writeMigration(
      migrationsDir,
      '0001_destroy.sql',
      validMigration('DROP TABLE suppliers;', 'SELECT 1;')
    );
    const client = createMockClient();
    const m = new Migrator({
      client,
      migrationsDir,
      allowDestructive: true,
    });
    const res = await m.up();
    assert.deepEqual(res.applied, ['0001_destroy.sql']);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 7. Migrator.status
// ═══════════════════════════════════════════════════════════════════════════

describe('Migrator.status', () => {
  test('reports applied + pending', async () => {
    const { migrationsDir } = freshWorkspace();
    writeMigration(
      migrationsDir,
      '0001_first.sql',
      validMigration('CREATE TABLE t1 (id int);', 'DROP TABLE t1;')
    );
    writeMigration(
      migrationsDir,
      '0002_second.sql',
      validMigration('CREATE TABLE t2 (id int);', 'DROP TABLE t2;')
    );
    const client = createMockClient();
    const m = new Migrator({ client, migrationsDir });
    await m.up(); // apply both

    // Simulate operator rolling back the second row manually
    client._state.migrations.pop();

    writeMigration(
      migrationsDir,
      '0003_third.sql',
      validMigration('CREATE TABLE t3 (id int);', 'DROP TABLE t3;')
    );
    const s = await m.status();
    assert.equal(s.applied.length, 1);
    assert.equal(s.applied[0].name, '0001_first.sql');
    const pendingNames = s.pending.map((p) => p.name).sort();
    assert.deepEqual(pendingNames, ['0002_second.sql', '0003_third.sql']);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 8. Migrator.checksum — detects post-apply edits
// ═══════════════════════════════════════════════════════════════════════════

describe('Migrator.checksum', () => {
  test('reports modified files without throwing in non-strict mode', async () => {
    const { migrationsDir } = freshWorkspace();
    const originalBody = validMigration('CREATE TABLE t1 (id int);', 'DROP TABLE t1;');
    writeMigration(migrationsDir, '0001_first.sql', originalBody);

    const client = createMockClient();
    const m = new Migrator({ client, migrationsDir });
    await m.up();

    // Modify the file after applying
    const editedBody = originalBody.replace('id int', 'id bigint');
    fs.writeFileSync(path.join(migrationsDir, '0001_first.sql'), editedBody);

    const report = await m.checksum();
    assert.equal(report.length, 1);
    assert.equal(report[0].status, 'modified');
    assert.notEqual(report[0].applied_checksum, report[0].file_checksum);
  });

  test('strict mode throws on modification', async () => {
    const { migrationsDir } = freshWorkspace();
    writeMigration(
      migrationsDir,
      '0001_first.sql',
      validMigration('CREATE TABLE t1 (id int);', 'DROP TABLE t1;')
    );
    const client = createMockClient();
    const m = new Migrator({ client, migrationsDir });
    await m.up();

    fs.writeFileSync(
      path.join(migrationsDir, '0001_first.sql'),
      validMigration('CREATE TABLE t1 (id bigint);', 'DROP TABLE t1;')
    );

    await assert.rejects(
      () => m.checksum({ strict: true }),
      /checksum mismatch/
    );
  });

  test('up() refuses to run if a previously-applied file was modified', async () => {
    const { migrationsDir } = freshWorkspace();
    writeMigration(
      migrationsDir,
      '0001_first.sql',
      validMigration('CREATE TABLE t1 (id int);', 'DROP TABLE t1;')
    );
    const client = createMockClient();
    const m = new Migrator({ client, migrationsDir });
    await m.up();

    // tamper + add a new pending migration
    fs.writeFileSync(
      path.join(migrationsDir, '0001_first.sql'),
      validMigration('CREATE TABLE t1_TAMPERED (id int);', 'DROP TABLE t1_TAMPERED;')
    );
    writeMigration(
      migrationsDir,
      '0002_second.sql',
      validMigration('CREATE TABLE t2 (id int);', 'DROP TABLE t2;')
    );

    await assert.rejects(() => m.up(), /checksum mismatch/);
    // No new rows should have been inserted
    assert.equal(client._state.migrations.length, 1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 9. Migrator.down — explicit flag required
// ═══════════════════════════════════════════════════════════════════════════

describe('Migrator.down', () => {
  test('refuses without allowDown or explicit flag', async () => {
    const { migrationsDir } = freshWorkspace();
    writeMigration(
      migrationsDir,
      '0001_first.sql',
      validMigration('CREATE TABLE t1 (id int);', 'SELECT 1;') // safe down
    );
    const client = createMockClient();
    const m = new Migrator({ client, migrationsDir });
    await m.up();

    await assert.rejects(() => m.down(1), /refused by default/);
  });

  test('rolls back the last N migrations in reverse order', async () => {
    const { migrationsDir } = freshWorkspace();
    writeMigration(
      migrationsDir,
      '0001_first.sql',
      validMigration('CREATE TABLE t1 (id int);', "SELECT 'down1';")
    );
    writeMigration(
      migrationsDir,
      '0002_second.sql',
      validMigration('CREATE TABLE t2 (id int);', "SELECT 'down2';")
    );
    const client = createMockClient({});
    const m = new Migrator({ client, migrationsDir, allowDown: true });
    await m.up();
    assert.equal(client._state.migrations.length, 2);

    const { rolledBack } = await m.down(2);
    assert.deepEqual(rolledBack, ['0002_second.sql', '0001_first.sql']);
    assert.equal(client._state.migrations.length, 0);

    // Both rollback SQL statements must have been sent
    const log = client._state.log.map((l) => l.sql);
    const i2 = log.findIndex((s) => /down2/.test(s));
    const i1 = log.findIndex((s) => /down1/.test(s));
    assert.ok(i2 !== -1 && i1 !== -1 && i2 < i1, 'down2 must run before down1');
  });

  test('refuses destructive rollback without allowDestructive', async () => {
    const { migrationsDir } = freshWorkspace();
    writeMigration(
      migrationsDir,
      '0001_first.sql',
      validMigration('CREATE TABLE t1 (id int);', 'DROP TABLE t1;')
    );
    const client = createMockClient();
    const m = new Migrator({ client, migrationsDir, allowDown: true });
    await m.up();

    await assert.rejects(() => m.down(1), /destructive/);
    // Migration row should still be present
    assert.equal(client._state.migrations.length, 1);
  });

  test('runs destructive rollback when allowDestructive=true', async () => {
    const { migrationsDir } = freshWorkspace();
    writeMigration(
      migrationsDir,
      '0001_first.sql',
      validMigration('CREATE TABLE t1 (id int);', 'DROP TABLE t1;')
    );
    const client = createMockClient();
    const m = new Migrator({
      client,
      migrationsDir,
      allowDown: true,
      allowDestructive: true,
    });
    await m.up();
    const { rolledBack } = await m.down(1);
    assert.deepEqual(rolledBack, ['0001_first.sql']);
    assert.equal(client._state.migrations.length, 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 10. splitStatements sanity
// ═══════════════════════════════════════════════════════════════════════════

describe('splitStatements', () => {
  test('splits on semicolons outside strings/comments', () => {
    const sql = `
      -- header
      CREATE TABLE a (id int);
      INSERT INTO a VALUES (1);
      /* block comment with ; */
    `;
    const parts = splitStatements(sql);
    assert.equal(parts.length, 2);
  });

  test('preserves dollar-quoted function bodies as a single unit', () => {
    const sql = `
      CREATE FUNCTION f() RETURNS int AS $$
        BEGIN RETURN 1; END;
      $$ LANGUAGE plpgsql;
    `;
    const parts = splitStatements(sql);
    assert.equal(parts.length, 1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 11. Integration-ish: verify the real seed migrations
// ═══════════════════════════════════════════════════════════════════════════

describe('seed migrations (onyx-procurement/db/migrations)', () => {
  const seedDir = path.join(__dirname, '..', '..', 'db', 'migrations');
  test('all seed files parse and are non-destructive on up', async () => {
    if (!fs.existsSync(seedDir)) {
      // running outside the repo — skip
      return;
    }
    const client = createMockClient();
    const m = new Migrator({ client, migrationsDir: seedDir });
    const { ok, results } = await m.verify();
    for (const r of results) {
      assert.equal(r.ok, true, `${r.name}: ${r.error || 'ok'}`);
    }
    assert.equal(ok, true);
  });
});
