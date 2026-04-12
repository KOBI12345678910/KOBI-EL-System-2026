# ONYX — Documentation Generators (`scripts/docs/`)

Self-contained, dependency-free Node scripts that turn source artifacts
(SQL migrations, OpenAPI, code comments, …) into versioned Markdown /
JSON documentation under `docs/`.

> **Rule (Agent 60):** these scripts never delete user files. They only
> overwrite their own generated outputs. Re-running them is always
> idempotent and safe.

---

## gen-schema-docs.js

Builds the database schema reference from every `*.sql` file under
`supabase/migrations/` (and, if present, `src/db/schema.sql`).

### What it produces

| Output | Purpose |
|--------|---------|
| `docs/DATABASE_SCHEMA.md`   | Human-readable reference with tables, columns, FKs, indexes, views, and a Mermaid ERD. |
| `docs/DATABASE_SCHEMA.json` | Machine-readable structured schema (consumed by tooling, linters, AI agents). |

### What it parses

- `CREATE TABLE [IF NOT EXISTS] …` (inline `PRIMARY KEY`, `REFERENCES`,
  `UNIQUE`, `CHECK`, `NOT NULL`, `DEFAULT`, `GENERATED ALWAYS AS …`).
- Table-level constraints: `PRIMARY KEY (…)`, `FOREIGN KEY (…) REFERENCES …`,
  `UNIQUE (…)`, `CHECK (…)`, `CONSTRAINT name …`.
- `CREATE [UNIQUE] INDEX [IF NOT EXISTS] …`, including partial `WHERE` clauses.
- `CREATE [OR REPLACE] VIEW … AS …;`
- `COMMENT ON TABLE …` and `COMMENT ON COLUMN …`.
- Inline `-- @doc: …` hints (see below).

It uses a regex-based scanner — **not** a full SQL parser. It understands
string literals, nested parentheses, and block comments. Dialect-specific
PL/pgSQL function bodies and `DO $$ … $$` blocks are skipped (they do not
contain table definitions).

### `-- @doc:` hints

You can attach a short, human-authored description to any column by placing
a single-line comment **on the line immediately before** the column:

```sql
CREATE TABLE wage_slips (
  id SERIAL PRIMARY KEY,

  -- @doc: Net pay after all deductions (מס הכנסה, ביטוח לאומי, …)
  net_pay NUMERIC(14,2) NOT NULL,
  ...
);
```

The hint will appear in the `Description` column of the Markdown table
and the `doc` field of the JSON payload. If a `COMMENT ON COLUMN` exists
for the same column it takes precedence; otherwise the inline hint is used.

### Running it

```bash
# via npm script
npm run docs:schema

# or directly
node scripts/docs/gen-schema-docs.js
```

Output:

```
[gen-schema-docs] Parsing 8 SQL file(s)…
[gen-schema-docs] Wrote docs/DATABASE_SCHEMA.md
[gen-schema-docs] Wrote docs/DATABASE_SCHEMA.json
[gen-schema-docs] Summary: 32 tables, 4 views, 45 indexes, 21 FKs.
```

### CI integration

Add the generator to your pre-commit or CI pipeline so that the committed
`docs/DATABASE_SCHEMA.md` is always in sync with `supabase/migrations/`:

```yaml
- name: Regenerate schema docs
  run: npm run docs:schema
- name: Check docs are up-to-date
  run: git diff --exit-code docs/DATABASE_SCHEMA.md docs/DATABASE_SCHEMA.json
```

---

## Adding new generators

Put each new generator in `scripts/docs/gen-<topic>.js`, wire it into
`package.json` under `scripts` with the key `docs:<topic>`, and document
it in this README. Every generator should:

1. Be runnable as `node scripts/docs/<file>.js` with no arguments.
2. Write only to `docs/` (create the directory if needed).
3. Be idempotent: re-running without source changes must produce an
   identical output byte-for-byte.
4. Depend only on the Node standard library (no `npm install`).
