# AG-X84 — PostgreSQL Migration Framework

**Agent:** AG-X84 Migrator Agent
**Module:** `onyx-procurement/src/db/migrator.js`
**Tests:** `onyx-procurement/test/db/migrator.test.js` (40 tests, all green)
**Date:** 2026-04-11
**Rule:** `לא מוחקים רק משדרגים ומגדלים` — *we do not delete, we only upgrade and grow*

---

## 1. Scope

A zero-dependency, in-process PostgreSQL migration framework for the Techno-Kol Uzi Mega-ERP. Purely additive to the existing codebase — no files removed, renamed, or replaced. Uses only Node built-ins (`fs`, `path`, `crypto`). Compatible with any `pg`-style client: `node-postgres` (`pg.Client` / `pg.Pool`), Supabase's postgres client, or a thin mock.

### Deliverables

| Path | Purpose |
|---|---|
| `onyx-procurement/src/db/migrator.js` | `Migrator` class + helpers |
| `onyx-procurement/test/db/migrator.test.js` | 40-test suite with in-memory mock pg client |
| `onyx-procurement/db/migrations/0001_init_extensions_and_core.sql` | extensions + enum types |
| `onyx-procurement/db/migrations/0002_suppliers_and_contacts.sql` | ספקים + אנשי קשר |
| `onyx-procurement/db/migrations/0003_purchase_orders.sql` | הזמנות רכש |
| `onyx-procurement/db/migrations/0004_invoices_and_payments.sql` | חשבוניות ותשלומים |
| `onyx-procurement/db/migrations/0005_audit_trail.sql` | יומן ביקורת |

---

## 2. Public API

```js
const { Migrator } = require('./src/db/migrator');

const m = new Migrator({
  client,                 // injected pg-style client (required)
  migrationsDir,          // default: <cwd>/db/migrations
  stateTable: '_migrations',
  logger: console.log,    // default: no-op
  allowDown: false,       // refuses down() unless true
  allowDestructive: false // refuses DROP/TRUNCATE/etc unless true
});

await m.up();             // apply all pending migrations
await m.down(1, { explicit: true }); // roll back the last N
await m.status();         // { applied, pending, modified, missing }
await m.verify();         // dry-run: parse every file, no DB writes
await m.checksum();       // detect file drift after apply
m.create('my migration'); // scaffold a new NNNN_slug.sql file
```

### `up()`

Runs every pending migration in ascending numeric order. Each migration is wrapped in its own `BEGIN / COMMIT` transaction; on any error the current migration is `ROLLBACK`ed and subsequent migrations are not attempted.

Before touching anything, `up()` calls `checksum({ strict: true })` so it refuses to run if an already-applied file has drifted. Rule: never rewrite history — add a forward migration instead.

### `down(count = 1, opts = {})`

**Refused by default.** Requires either `allowDown: true` on the constructor or `{ explicit: true }` as the second positional argument. Rolls back the last `count` applied migrations in reverse order, running the `rollback_sql` snapshot **from the `_migrations` table**, not from the current on-disk file — so renaming or editing a file after deployment cannot change what gets run in rollback.

### `status()`

Returns `{ stateTable, migrationsDir, applied, pending, modified, missing }`.

- `applied` — rows from `_migrations`, ordered.
- `pending` — files on disk not yet recorded in `_migrations`.
- `modified` — applied migrations whose on-disk file no longer matches the stored checksum.
- `missing` — applied migrations whose on-disk file has been removed.

### `verify()`

Dry-run sanity check. Parses every file, splits statements, classifies destructive ones. **Never sends payload SQL to the database.** Useful in CI and in `preflight` checks before deploy.

Returns `{ ok: boolean, results: [{ name, ok, error, statements, destructive, applied, checksum }] }`.

### `checksum(opts = {})`

Compares stored checksums in `_migrations` against on-disk file contents. Returns a report; with `{ strict: true }` throws if anything is `modified` or `missing`. Uses SHA-256 over the normalized (CRLF → LF) file contents so Windows/Linux produce the same hash.

### `create(name)`

Scaffolds a new file. The numeric prefix is `max(existing) + 1` zero-padded to 4 digits. The name is slugified to ASCII — Hebrew characters are stripped but the English words around them are kept, so `"רכש — purchase orders"` becomes `purchase_orders`. If no English characters remain (`"רכש"` alone), the slug falls back to `migration_<8-char-hash>`. Never overwrites an existing file.

---

## 3. Migration file format

```sql
-- Migration : 0007_add_vat_column.sql
-- Original  : add VAT column מע״מ
-- Created   : 2026-04-11
-- Rule      : לא מוחקים רק משדרגים ומגדלים

-- +migrate Up
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS vat_rate_pct NUMERIC(5,2) NOT NULL DEFAULT 18.00;

CREATE INDEX IF NOT EXISTS idx_invoices_vat ON invoices (vat_rate_pct);

-- +migrate Down
ALTER TABLE invoices DROP COLUMN IF EXISTS vat_rate_pct;
```

### Rules

1. **Filename:** `NNNN_slug.sql` where `NNNN` is a zero-padded integer (4+ digits) and `slug` is `[A-Za-z0-9_.-]+`.
2. **Up section:** required. Must contain at least one non-comment line. Introduced by `-- +migrate Up` (case-insensitive).
3. **Down section:** optional but strongly recommended. Introduced by `-- +migrate Down` (case-insensitive) and must appear **after** the Up section.
4. **Money columns:** always `NUMERIC(14,2)`. Never `FLOAT`, `REAL`, `DOUBLE PRECISION`, or `NUMERIC` without precision. `14,2` supports values up to ±999,999,999,999.99 ILS with exact 2-decimal arithmetic.
5. **Indexes:** create with `IF NOT EXISTS`.
6. **Supabase:** enable RLS on every user-facing table; wrap policy creation in `DO $$ BEGIN ... EXCEPTION WHEN duplicate_object THEN NULL; END $$` so re-apply is idempotent.
7. **Destructive statements:** `DROP TABLE`, `DROP COLUMN`, `DROP SCHEMA`, `DROP DATABASE`, `DROP TYPE`, `DROP INDEX`, `DROP FUNCTION`, `DROP TRIGGER`, `DROP VIEW`, `DROP POLICY`, `TRUNCATE`, `DELETE FROM` without `WHERE`, `UPDATE ... SET` without `WHERE`, `ALTER TABLE ... DROP`. These require `allowDestructive: true` or `--allow-destructive`.

### Destructive-detection false-positive guards

The classifier pre-processes the SQL to strip:

- line comments (`-- …`)
- block comments (`/* … */`)
- single-quoted string literals (including `''` escape)
- dollar-quoted blocks (`$$ … $$`, `$tag$ … $tag$`)

So these are **not** flagged:

```sql
INSERT INTO audit_events (note) VALUES ('DROP TABLE tmp');  -- string literal
-- DROP TABLE tmp                                            -- comment
CREATE FUNCTION f() RETURNS void AS $$
  -- DROP TABLE inside a function body is not scanned
$$ LANGUAGE plpgsql;
```

---

## 4. State table (`_migrations`)

```sql
CREATE TABLE _migrations (
  id           SERIAL PRIMARY KEY,
  name         TEXT NOT NULL UNIQUE,       -- "0001_init_core.sql"
  applied_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  checksum     TEXT NOT NULL,              -- sha256 of normalized contents
  duration_ms  INTEGER NOT NULL,
  rollback_sql TEXT                        -- snapshot of the Down section
);
```

The rollback SQL is stored **at apply time**, so subsequent file edits cannot affect what runs in rollback. This is intentional: once a migration is in production, its Down behavior is frozen.

---

## 5. Safety flags

| Flag | Constructor | CLI (suggested) | Default | Gates |
|---|---|---|---|---|
| `allowDown` | `allowDown: true` | `--down N --yes` | false | `down()` itself |
| `allowDestructive` | `allowDestructive: true` | `--allow-destructive` | false | `DROP TABLE`, `DROP COLUMN`, `TRUNCATE`, `DELETE FROM` w/o `WHERE`, etc. |
| `explicit` | `down(N, { explicit: true })` | `--down N --yes` | false | alternative to `allowDown` |
| `strict` | `checksum({ strict: true })` | (automatic inside `up()`) | false | refuses on drift |

### Layered refusal

1. `up()` runs `checksum({ strict: true })` first → refuses if any applied file drifted.
2. For each pending file it checks destructive statements → refuses if present and `allowDestructive` is false.
3. `down()` refuses unless `allowDown` OR `explicit:true`.
4. `down()` also refuses if the stored `rollback_sql` contains destructive statements and `allowDestructive` is false.

Every refusal throws with a message that tells the operator how to unblock themselves — no silent behavior changes.

---

## 6. CLI usage

The package already exposes `npm run migrate` / `migrate:status` / `migrate:rollback` / `migrate:create` commands (see `onyx-procurement/package.json`). Those scripts live in `scripts/migrate.js` and `scripts/migrate-create.js` — they are untouched by this module. To plug the new `Migrator` into them, a caller passes the injected pg client:

```js
// scripts/migrate.js (suggested — no edits made)
const { Client } = require('pg');
const { Migrator } = require('../src/db/migrator');
const path = require('node:path');

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const m = new Migrator({
      client,
      migrationsDir: path.join(__dirname, '..', 'db', 'migrations'),
      logger: (msg) => console.log(msg),
      allowDown: process.argv.includes('--yes'),
      allowDestructive: process.argv.includes('--allow-destructive'),
    });

    if (process.argv.includes('--status')) {
      const s = await m.status();
      console.log(JSON.stringify(s, null, 2));
      return;
    }
    if (process.argv.includes('--verify')) {
      const { ok, results } = await m.verify();
      console.log(JSON.stringify(results, null, 2));
      process.exitCode = ok ? 0 : 1;
      return;
    }
    if (process.argv.includes('--down')) {
      const idx = process.argv.indexOf('--down');
      const n = parseInt(process.argv[idx + 1], 10) || 1;
      const { rolledBack } = await m.down(n);
      console.log(`Rolled back: ${rolledBack.join(', ')}`);
      return;
    }
    const { applied, skipped } = await m.up();
    console.log(`Applied: ${applied.length}, skipped: ${skipped.length}`);
  } finally {
    await client.end();
  }
}
main().catch((e) => { console.error(e.message); process.exit(1); });
```

```bash
# Typical operator flow
npm run migrate                              # apply pending
npm run migrate:status                       # applied / pending / modified
node scripts/migrate.js --verify             # dry-run
node scripts/migrate.js --down 1 --yes       # roll back 1 (requires --yes)
node scripts/migrate.js --allow-destructive  # permit DROP/TRUNCATE
```

The module itself never parses `process.argv` — it is a library. The safety flags come in through the constructor so test harnesses and CI scripts can opt in or out explicitly.

---

## 7. Supabase-specific notes

### 7.1 Extensions

Seed migration `0001_init_extensions_and_core.sql` enables:

| Extension | Purpose |
|---|---|
| `pgcrypto` | `gen_random_uuid()`, `crypt()` |
| `uuid-ossp` | legacy `uuid_generate_v4()` |
| `pg_trgm` | trigram fuzzy search (e.g. supplier name) |
| `citext` | case-insensitive email columns |
| `unaccent` | Hebrew / Latin accent-insensitive search |

Extensions are **never dropped** on rollback — other schemas may rely on them.

### 7.2 RLS policies

Every user-facing seed table (`suppliers`, `supplier_contacts`, `purchase_orders`, `purchase_order_lines`, `invoices`, `payments`, `audit_events`) is created with RLS enabled and a baseline `SELECT` policy for authenticated Supabase users:

```sql
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY suppliers_read_auth ON suppliers
    FOR SELECT USING (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
```

Writes remain restricted to the `service_role` key (Supabase default). Application-level RBAC (the existing `src/auth` module) tightens this further per role.

### 7.3 Triggers

Seed migration `0002_suppliers_and_contacts.sql` installs a generic `touch_updated_at()` trigger function that every subsequent migration reuses. It is intentionally **not** dropped on rollback, so rolling back table 0002 does not break tables 0003/0004 that also installed `BEFORE UPDATE` triggers calling this function.

### 7.4 Money columns

All money is `NUMERIC(14,2)` — no `FLOAT`, no `REAL`. Precision ±999,999,999,999.99 (≈1 trillion ILS) with exact 2-decimal arithmetic, matches the `amount` shape already used in `server.js` and the legacy JSON seed data.

### 7.5 Supabase postgres client

The module expects `client.query(sql, params?)` returning `{ rows }`. This matches:

- `node-postgres` `Client` / `Pool`
- `postgres` (`porsager/postgres`) via a trivial adapter
- Supabase's internal `SupabaseDbClient` (GraphQL path not used here)

If the client also exposes `connect()` the Migrator will request a dedicated connection per migration for proper transaction isolation; otherwise it uses `BEGIN/COMMIT` on the shared client (fine for CLI use with a single `Client` instance).

---

## 8. Test coverage

Run with:

```bash
node --test test/db/migrator.test.js
```

**40 tests across 11 suites — all green.**

| Area | Tests |
|---|---|
| `parseMigration` | delimiter present / absent, Down-before-Up, empty Up |
| `slugify` | ASCII, bilingual stripping, pure-Hebrew hash fallback, separator collapse |
| `isDestructive` | `DROP TABLE`, `DROP COLUMN`, `TRUNCATE`, `DELETE FROM` (with/without `WHERE`), string literal false-positive, comment false-positive, safe `CREATE TABLE` |
| `splitStatements` | semicolon splitting, dollar-quoted function body integrity |
| `Migrator.create` | numeric prefix increment, Hebrew slug, overwrite refusal |
| `Migrator.verify` | well-formed ok, delimiter error, destructive detection in Up, no DB writes |
| `Migrator.up` | ordering, skip-already-applied, rollback-on-error leaves state clean, destructive refusal, destructive-with-flag acceptance |
| `Migrator.status` | applied + pending report |
| `Migrator.checksum` | report-only vs strict mode, up() refuses on drift |
| `Migrator.down` | refuses without flag, reverse order, destructive refusal, destructive-with-flag |
| Seed migrations | real files under `db/migrations/` all parse and have non-destructive Up sections |

The test file uses an in-memory mock pg client (~120 LoC, inline) that understands just enough SQL (`BEGIN/COMMIT/ROLLBACK`, `CREATE TABLE IF NOT EXISTS _migrations`, `INSERT/DELETE/SELECT _migrations`) to exercise the Migrator. Payload SQL is recorded but not simulated — that is the integration-test layer's job.

---

## 9. Hebrew glossary — מילון עברית-אנגלית

| עברית | English | Context |
|---|---|---|
| מיגרציה | migration | schema change step |
| שדרוג | upgrade | forward migration |
| גדילה | growth | additive migration |
| התגלגלות לאחור | rollback | `down()` |
| סכום ביקורת | checksum | SHA-256 of migration file |
| רשומת מצב | state row | a row in `_migrations` |
| טרנזקציה | transaction | `BEGIN/COMMIT` |
| ריצה יבשה | dry run | `verify()` |
| הרסני | destructive | `DROP`/`TRUNCATE`/etc. |
| הגנת מחיקה | delete guard | `--allow-destructive` flag |
| סכמה | schema | PostgreSQL schema |
| טבלה | table | `CREATE TABLE` |
| אינדקס | index | `CREATE INDEX` |
| טריגר | trigger | PL/pgSQL trigger |
| מדיניות | policy | RLS policy |
| שורה | row | database row |
| עמודה | column | database column |
| מפתח ראשי | primary key | `PRIMARY KEY` |
| מפתח זר | foreign key | `FOREIGN KEY` |
| אילוץ ייחודי | unique constraint | `UNIQUE` |
| אילוץ בדיקה | check constraint | `CHECK` |
| ספק | supplier | `suppliers` table |
| איש קשר | contact | `supplier_contacts` |
| הזמנת רכש | purchase order | `purchase_orders` |
| חשבונית | invoice | `invoices` |
| תשלום | payment | `payments` |
| יומן ביקורת | audit trail | `audit_events` |
| מטבע | currency | `currency_code` enum |
| מע״מ | VAT | 18% IL standard rate 2026 |
| עוסק מורשה | authorized dealer | `vat_id` column |
| יחידת מידה | unit | `unit` column |
| סוג מסמך | document status | `doc_status` enum |

---

## 10. What this intentionally does NOT do

Per the rule `לא מוחקים רק משדרגים ומגדלים`, this framework deliberately omits:

1. **Auto-squash / auto-rebase.** Once a migration is in `_migrations`, it is frozen. History is append-only.
2. **File deletion.** `create()` never overwrites; nothing else touches the filesystem.
3. **Down-by-default.** Every `down()` invocation requires an explicit flag per call.
4. **Silent destructive writes.** `DROP`, `TRUNCATE`, and naked `DELETE/UPDATE` all require a separate second flag.
5. **Cross-migration dependency graphs.** Ordering is strictly numeric-prefix — if you need a logical dependency, bundle it into the same file.
6. **Data migrations vs schema migrations split.** A migration is a migration; if you need to back-fill data, include it in the Up section inside the same transaction so it rolls back atomically on error.

---

## 11. References

- Source: `onyx-procurement/src/db/migrator.js`
- Tests: `onyx-procurement/test/db/migrator.test.js`
- Seed SQL: `onyx-procurement/db/migrations/0001_init_extensions_and_core.sql` through `0005_audit_trail.sql`
- Existing related observability module: `onyx-procurement/src/db/query-analyzer.js` (Agent-57)
- Existing package scripts: `onyx-procurement/package.json` → `migrate`, `migrate:status`, `migrate:rollback`, `migrate:create`
