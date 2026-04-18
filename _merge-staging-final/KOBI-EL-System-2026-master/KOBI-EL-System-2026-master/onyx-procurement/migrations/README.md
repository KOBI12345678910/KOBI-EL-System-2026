# ONYX Procurement - Migrations

Top-level home for all schema migrations run by `scripts/migrate.js` (v3).

This directory is read in **strict lexicographic order** by the runner.
The legacy location `supabase/migrations/` is still supported as a
fallback (the runner auto-detects), and existing files there must not be
edited or renamed - rule: **we do not delete, we only upgrade.**

---

## Quick start

```bash
# Create a new migration scaffold (auto-picks the next version number)
node scripts/migrate-create.js add_employee_index

# See what's applied / pending / drifted
npm run migrate:status

# Dry-run before the real thing
node scripts/migrate.js --dry-run

# Apply all pending migrations
npm run migrate

# Roll back the last migration
npm run migrate:rollback          # alias for  node scripts/migrate.js --down 1

# Roll back the last 3 migrations
node scripts/migrate.js --down 3

# Ignore checksum drift (use with extreme care)
node scripts/migrate.js --force
```

---

## File naming

```
<version>_<snake_case_name>.sql
```

Rules:

- `<version>` is a zero-padded number with at least 3 digits. Start at `001`.
- `<version>` must be unique and strictly increasing. Never reuse a number.
- `<snake_case_name>` is lowercase, `[a-z0-9_]`, max 80 chars.
- Both `001_add_foo.sql` and `001-add-foo.sql` are accepted (dash or underscore).
- Examples:
  - `001_supabase_schema.sql`
  - `002_seed_data_extended.sql`
  - `014_add_employee_index.sql`

Anything that does not match this pattern is skipped with a warning.

---

## File format

Each migration is a **single file** that contains both the forward (`-- UP`)
and the inverse (`-- DOWN`) SQL:

```sql
-- =====================================================================
-- Migration : 014  add_employee_index
-- Created   : 2026-04-11T09:15:00.000Z
-- Author    : Kobi
-- Ticket    : ONX-482
--
-- Description
-- -----------
-- Adds a covering index on employees(tenant_id, status) to speed up the
-- payroll "active employees per tenant" lookup, which currently does a
-- seq scan in prod.
-- =====================================================================

-- UP
CREATE INDEX IF NOT EXISTS idx_employees_tenant_status
    ON employees (tenant_id, status);

-- DOWN
DROP INDEX IF EXISTS idx_employees_tenant_status;
```

The markers are **case-insensitive** and tolerant of trailing punctuation:
`-- UP`, `-- up:`, `-- UP `, `--   DOWN` all work.

If a file has no markers at all, the runner treats the entire file as the
UP script (legacy compatibility) and `--down` will refuse to roll it back.

### Multiple statements

A single migration may contain any number of statements, including
`DO $$ ... $$` blocks. The runner is dollar-quote aware when it splits
statements for error reporting, and it submits the whole UP (or DOWN)
script inside a single transaction.

### Functions / triggers / views

Prefer `CREATE OR REPLACE` so re-running with `--force` is safe, and
write the `DOWN` section to `DROP ... IF EXISTS`.

---

## The `schema_migrations` table

The runner manages this table itself (created on first run):

| column         | type          | notes                                 |
|----------------|---------------|---------------------------------------|
| `version`      | `VARCHAR(64)` | primary key                           |
| `name`         | `VARCHAR(255)`| slug from the filename                |
| `applied_at`   | `TIMESTAMPTZ` | last apply / rollback timestamp       |
| `checksum`     | `TEXT`        | SHA-256 of the UP section             |
| `execution_ms` | `INTEGER`     | wall-clock duration of the UP apply   |
| `rolled_back`  | `BOOLEAN`     | TRUE after `--down` soft-removes it   |

A rolled-back migration stays in the table with `rolled_back = TRUE`, so
history is never lost - it will simply show as pending on the next
`--up` run.

---

## Locking

The runner acquires a Postgres **advisory lock** (`pg_advisory_lock`)
before applying anything, and releases it on exit. This prevents two
CI jobs or two operators from stepping on each other.

- Backend `pg` (direct `SUPABASE_DB_URL`) uses a true session advisory lock.
- Backend `supabase-rpc` falls back to a sentinel row in
  `public._onyx_migrate_lock` (best-effort, same guarantees in practice).

Override the lock key with `ONYX_MIGRATE_ADVISORY_LOCK=<bigint>` if you
need to run two completely separate migration streams on the same DB.

---

## Checksum drift

Every applied migration records a SHA-256 of its UP section. If the file
on disk later differs from what was applied, the runner refuses to
proceed with a loud warning:

```
WARN: CHECKSUM DRIFT: 005 annual_tax_module  (db=... disk=...)
ERROR: checksum drift detected on 1 migration(s). Re-run with --force to ignore.
```

**The correct fix is almost always to add a NEW migration that amends
the previous one**, not to edit an old file. Use `--force` only when you
have verified the change is cosmetic (e.g. whitespace, a typo in a
comment) and the database state is already correct.

---

## Logs

Every run appends a JSONL log file at:

```
logs/migrations/<UTC-timestamp>.log
```

Each line is one structured event (`banner`, `apply-start`, `apply-ok`,
`apply-fail`, `lock-acquired`, ...). This is the source of truth when
you need to prove to audit "migration 007 was applied on 2026-04-11 at
14:32 UTC and took 184ms."

Pass `--json` to also print the full event stream to stdout (nice for
CI dashboards).

---

## Best practices

1. **Every migration must be idempotent.** Use `IF NOT EXISTS`,
   `IF EXISTS`, `CREATE OR REPLACE`. Running the same migration twice
   on a clean DB must succeed.
2. **Never edit an applied migration.** Once a migration has shipped to
   any environment (staging included), it is frozen. Amendments ship as
   a new migration.
3. **Every UP must have a matching DOWN** unless the change is truly
   irreversible (and in that case, document it in the header comment).
4. **Small and focused.** One migration = one logical change. It's much
   easier to roll back a bad `ALTER TABLE` if it's alone in its file.
5. **Backwards compatible.** The app code running *before* you deploy
   must still work *after* the migration has run. Typical pattern:
   - migration adds a new nullable column
   - app deploy starts writing to it
   - follow-up migration backfills and adds NOT NULL
6. **No DDL inside transactions that also do huge DML.** Split.
7. **Avoid long-running locks on hot tables in production.** Prefer
   `CREATE INDEX CONCURRENTLY` (which must live in its own migration
   without a surrounding transaction - in that rare case, set a comment
   at the top of the file noting it and ensure the DOWN uses
   `DROP INDEX CONCURRENTLY` too).
8. **Test `--down` locally.** A DOWN section that does not actually
   undo the UP is worse than no DOWN at all.
9. **Never commit secrets** to migration SQL. Use env-driven seed scripts
   instead (`scripts/seed-data.js`).
10. **When in doubt, add a new migration.** Storage is cheap; surprises
    in prod are not.

---

## Troubleshooting

**"advisory lock is held by another session"** - another migration job
is already running, or a previous run died without releasing. Check
`pg_stat_activity`; worst case, restart the DB connection holding the
lock.

**"checksum drift detected"** - someone edited an already-applied
migration file. Read the diff, decide whether to write a corrective
new migration (usually yes) or to `--force` past it.

**"no -- DOWN: section found"** - you tried to `--down` a migration
that shipped without a rollback block. Write a one-off rollback SQL
manually, then edit `schema_migrations` to mark the row
`rolled_back = TRUE` if appropriate.

**"relation schema_migrations does not exist"** - the very first run on
a fresh DB. The runner bootstraps the table automatically before the
advisory lock; if you see this, check that your DB user has `CREATE`
privileges on `public`.

**"SUPABASE_DB_URL is set but `pg` package is not installed"** - install
`pg` (`npm i pg`) to get real transactions and real advisory locks, or
unset `SUPABASE_DB_URL` to use the supabase-js RPC fallback.

---

## Related scripts

- `scripts/migrate.js`           - the runner (v3 - current)
- `scripts/migrate-create.js`    - scaffold generator (this README's companion)
- `scripts/migrate.legacy.js`    - preserved v1 runner (do not delete)
- `scripts/migrate-verify.js`    - read-only CI health check
- `scripts/migrate.js.new`       - historical v2 work-in-progress (do not delete)

Rule of the house: **we upgrade, we don't delete.**
