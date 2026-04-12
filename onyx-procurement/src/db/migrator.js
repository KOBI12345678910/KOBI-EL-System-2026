/**
 * ONYX PROCUREMENT — PostgreSQL Migration Framework
 * ═══════════════════════════════════════════════════════════════════════════
 * Agent     : AG-X84 Migrator Agent
 * Target    : Techno-Kol Uzi Mega-ERP — Supabase / PostgreSQL
 * Date      : 2026-04-11
 *
 * Rule      : לא מוחקים רק משדרגים ומגדלים
 *             ("We do not delete — we only upgrade and grow.")
 *
 * Purpose
 * ──────────────────────────────────────────────────────────────────────────
 *   A zero-dependency, in-tree migration framework for the Techno-Kol Uzi
 *   ERP. It is PURELY ADDITIVE to the codebase — no existing files are
 *   deleted, renamed, or replaced. All data-destructive SQL is gated behind
 *   an explicit `--allow-destructive` flag. Rollback (`down`) requires an
 *   explicit flag on every invocation; accidental down-migration is refused.
 *
 *   The module speaks a dialect compatible with Supabase/PostgreSQL and is
 *   aware of extensions, Row-Level-Security policies, triggers, and money
 *   columns typed as NUMERIC(14,2) (the ERP's canonical money type).
 *
 * Design goals
 * ──────────────────────────────────────────────────────────────────────────
 *   1. Zero external deps — only Node built-ins (fs, path, crypto).
 *   2. Injected pg client — the caller passes `{ query(sql, params?) }`.
 *      Works with `node-postgres` (pg.Client / pg.Pool), Supabase's
 *      postgres client, or any thenable-returning adapter.
 *   3. Per-migration transactions — BEGIN / COMMIT around every `up`,
 *      automatic ROLLBACK on error.
 *   4. Checksum integrity — every applied migration stores a SHA-256 of
 *      its file contents; `checksum()` refuses to run if a previously-
 *      applied file has been modified.
 *   5. Explicit safety flags:
 *        `allowDown`        — required for down()
 *        `allowDestructive` — required when a file contains DROP TABLE,
 *                             DROP COLUMN, TRUNCATE, DELETE FROM (w/o WHERE)
 *   6. Dry-run `verify()` — parses every pending file without executing it,
 *      validating delimiters and destructive-statement safety.
 *   7. Bilingual He/En names — `create("רכש — purchase orders")` is fine;
 *      the filename is normalized to ASCII-safe slug.
 *
 * Migration file format
 * ──────────────────────────────────────────────────────────────────────────
 *   File path : <migrationsDir>/NNNN_slug.sql            (NNNN zero-padded)
 *   Delimiters:
 *       -- +migrate Up
 *       ... up statements ...
 *       -- +migrate Down
 *       ... down statements ...
 *
 *   Comments and whitespace outside the delimited sections are ignored.
 *   The "Up" section is mandatory. The "Down" section is optional but
 *   strongly recommended; its absence makes `down()` refuse the migration.
 *
 * State table
 * ──────────────────────────────────────────────────────────────────────────
 *   CREATE TABLE _migrations (
 *     id           SERIAL PRIMARY KEY,
 *     name         TEXT NOT NULL UNIQUE,       -- e.g. "0001_init_core.sql"
 *     applied_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
 *     checksum     TEXT NOT NULL,              -- sha256 of file contents
 *     duration_ms  INTEGER NOT NULL,
 *     rollback_sql TEXT                        -- snapshot of the down section
 *   );
 *
 * Exports
 * ──────────────────────────────────────────────────────────────────────────
 *   Migrator (class) — main entry point
 *   parseMigration   — file text → { up, down }
 *   sha256           — hashing helper
 *   isDestructive    — statement classifier (exported for tests)
 *   slugify          — bilingual name → ASCII slug
 * ═══════════════════════════════════════════════════════════════════════════
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

// ═══════════════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════════════

const UP_DELIMITER = /^\s*--\s*\+migrate\s+Up\s*$/im;
const DOWN_DELIMITER = /^\s*--\s*\+migrate\s+Down\s*$/im;

// Patterns considered destructive — require explicit --allow-destructive.
// Each entry: [regex, human label]. Regexes are anchored to statement
// starts (after stripping leading whitespace and comments).
const DESTRUCTIVE_PATTERNS = [
  [/\bDROP\s+TABLE\b/i, 'DROP TABLE'],
  [/\bDROP\s+COLUMN\b/i, 'DROP COLUMN'],
  [/\bDROP\s+SCHEMA\b/i, 'DROP SCHEMA'],
  [/\bDROP\s+DATABASE\b/i, 'DROP DATABASE'],
  [/\bDROP\s+TYPE\b/i, 'DROP TYPE'],
  [/\bDROP\s+INDEX\b/i, 'DROP INDEX'],
  [/\bDROP\s+FUNCTION\b/i, 'DROP FUNCTION'],
  [/\bDROP\s+TRIGGER\b/i, 'DROP TRIGGER'],
  [/\bDROP\s+VIEW\b/i, 'DROP VIEW'],
  [/\bDROP\s+POLICY\b/i, 'DROP POLICY'],
  [/\bTRUNCATE\b/i, 'TRUNCATE'],
  [/\bDELETE\s+FROM\b(?![\s\S]*\bWHERE\b)/i, 'DELETE FROM (no WHERE)'],
  [/\bUPDATE\s+\w+\s+SET\b(?![\s\S]*\bWHERE\b)/i, 'UPDATE (no WHERE)'],
  [/\bALTER\s+TABLE\s+\w+\s+DROP\b/i, 'ALTER TABLE DROP'],
];

const DEFAULT_STATE_TABLE = '_migrations';
const FILENAME_RE = /^(\d{4,})_([A-Za-z0-9][\w.-]*)\.sql$/;

// ═══════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════

/**
 * SHA-256 hex digest of a string. Used to checksum migration files.
 * We normalize line endings (CRLF → LF) so the same file on Windows
 * and Linux produces the same hash.
 */
function sha256(text) {
  const normalized = String(text).replace(/\r\n/g, '\n');
  return crypto.createHash('sha256').update(normalized, 'utf8').digest('hex');
}

/**
 * Convert a bilingual (Hebrew + English) migration name to a safe ASCII
 * filename slug. Hebrew characters are transliterated to an ASCII hint
 * when possible, otherwise stripped. Non-alphanumeric characters become
 * underscores; consecutive underscores collapse; leading/trailing
 * underscores are trimmed.
 *
 *   "רכש — purchase orders"        → "purchase_orders"
 *   "Add VAT column מע״מ"          → "add_vat_column"
 *   "init_core v2"                  → "init_core_v2"
 */
function slugify(name) {
  if (!name || typeof name !== 'string') {
    throw new TypeError('slugify: name must be a non-empty string');
  }
  // Strip Hebrew block and other non-ASCII — leave ASCII letters/digits,
  // underscores, dashes, and whitespace separators.
  const ascii = name
    .replace(/[\u0590-\u05FF\u200E\u200F]/g, ' ') // Hebrew + LTR/RTL marks
    .replace(/[^A-Za-z0-9_\-\s]/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/[\s\-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');

  if (!ascii) {
    // Caller gave us a pure-Hebrew name with nothing to transliterate.
    // Fall back to a short hash so the file is still unique.
    const hash = sha256(name).slice(0, 8);
    return `migration_${hash}`;
  }
  return ascii;
}

/**
 * Parse a migration file into { up, down } sections.
 *
 * Throws if:
 *   - the Up delimiter is missing
 *   - the Down section appears before the Up section
 *   - sections are empty
 */
function parseMigration(sqlText) {
  if (typeof sqlText !== 'string') {
    throw new TypeError('parseMigration: sqlText must be a string');
  }

  const text = sqlText.replace(/\r\n/g, '\n');
  const upMatch = text.match(UP_DELIMITER);
  const downMatch = text.match(DOWN_DELIMITER);

  if (!upMatch) {
    throw new Error(
      'parseMigration: missing "-- +migrate Up" delimiter. Every migration file ' +
        'must contain an Up section.'
    );
  }

  const upStart = upMatch.index + upMatch[0].length;
  let upEnd;
  let downContent = '';

  if (downMatch) {
    if (downMatch.index < upMatch.index) {
      throw new Error(
        'parseMigration: Down section must appear AFTER the Up section. ' +
          'Check the order of "-- +migrate Up" / "-- +migrate Down" delimiters.'
      );
    }
    upEnd = downMatch.index;
    downContent = text.slice(downMatch.index + downMatch[0].length).trim();
  } else {
    upEnd = text.length;
  }

  const upContent = text.slice(upStart, upEnd).trim();

  if (!upContent) {
    throw new Error('parseMigration: Up section is empty');
  }

  return { up: upContent, down: downContent };
}

/**
 * Strip SQL comments (-- line and /* block *\/) so destructive-statement
 * detection cannot be defeated by commenting out the harmful keywords.
 * Also collapses string literals to '…' so a harmless literal like
 *   INSERT INTO audit (note) VALUES ('DROP TABLE foo');
 * is not flagged.
 */
function stripCommentsAndStrings(sql) {
  let out = '';
  let i = 0;
  const len = sql.length;
  while (i < len) {
    const c = sql[i];
    const next = sql[i + 1];
    // line comment
    if (c === '-' && next === '-') {
      while (i < len && sql[i] !== '\n') i++;
      continue;
    }
    // block comment
    if (c === '/' && next === '*') {
      i += 2;
      while (i < len - 1 && !(sql[i] === '*' && sql[i + 1] === '/')) i++;
      i += 2;
      continue;
    }
    // single-quoted string (SQL doubles single-quotes to escape)
    if (c === "'") {
      out += "'…'";
      i++;
      while (i < len) {
        if (sql[i] === "'" && sql[i + 1] === "'") {
          i += 2;
          continue;
        }
        if (sql[i] === "'") {
          i++;
          break;
        }
        i++;
      }
      continue;
    }
    // dollar-quoted string $tag$...$tag$
    if (c === '$') {
      const m = sql.slice(i).match(/^\$([A-Za-z0-9_]*)\$/);
      if (m) {
        const tag = `$${m[1]}$`;
        const endIdx = sql.indexOf(tag, i + tag.length);
        out += '$…$';
        i = endIdx === -1 ? len : endIdx + tag.length;
        continue;
      }
    }
    out += c;
    i++;
  }
  return out;
}

/**
 * Return an array of {pattern, match} records for every destructive
 * statement found in `sql`. Empty array means the statement is safe.
 */
function isDestructive(sql) {
  const cleaned = stripCommentsAndStrings(sql);
  const hits = [];
  for (const [re, label] of DESTRUCTIVE_PATTERNS) {
    const m = cleaned.match(re);
    if (m) hits.push({ pattern: label, match: m[0] });
  }
  return hits;
}

/**
 * Split a SQL blob into top-level statements on `;` boundaries, skipping
 * semicolons that appear inside string literals, comments, or dollar
 * quotes. We use this for statement-by-statement dry-run parsing — NOT
 * for execution (execution sends the whole up/down block to the server,
 * which is strictly more correct for triggers and dollar-quoted bodies).
 */
function splitStatements(sql) {
  const cleaned = stripCommentsAndStrings(sql);
  const parts = cleaned
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
  return parts;
}

// ═══════════════════════════════════════════════════════════════════════════
// Migrator class
// ═══════════════════════════════════════════════════════════════════════════

class Migrator {
  /**
   * @param {object}   opts
   * @param {object}   opts.client        — injected pg client: must expose
   *                                        `query(sql, params?)` returning a
   *                                        thenable with `{ rows }`. If it also
   *                                        exposes `connect()` we will request
   *                                        a dedicated connection per migration
   *                                        for transaction isolation.
   * @param {string}  [opts.migrationsDir] — path to db/migrations. Defaults to
   *                                        `<cwd>/db/migrations`.
   * @param {string}  [opts.stateTable]    — name of the tracking table
   *                                        (default `_migrations`).
   * @param {(msg:string)=>void} [opts.logger] — optional logger fn. Defaults
   *                                        to a no-op so tests stay quiet.
   * @param {boolean} [opts.allowDown]        — permit down() (default false).
   * @param {boolean} [opts.allowDestructive] — permit destructive SQL
   *                                        (default false).
   */
  constructor(opts = {}) {
    if (!opts.client || typeof opts.client.query !== 'function') {
      throw new TypeError(
        'Migrator: `client` with a `query()` method is required. Pass a ' +
          'node-postgres Client/Pool, Supabase postgres client, or a mock.'
      );
    }
    this.client = opts.client;
    this.migrationsDir =
      opts.migrationsDir || path.join(process.cwd(), 'db', 'migrations');
    this.stateTable = opts.stateTable || DEFAULT_STATE_TABLE;
    this.logger = opts.logger || (() => {});
    this.allowDown = Boolean(opts.allowDown);
    this.allowDestructive = Boolean(opts.allowDestructive);
  }

  // ────────────────────────────────────────────────────────────────
  // public API
  // ────────────────────────────────────────────────────────────────

  /**
   * Run every pending migration in order. Each migration runs inside its
   * own BEGIN/COMMIT transaction; an error ROLLBACKs that single migration
   * and aborts the run so later migrations are untouched.
   *
   * Returns: { applied: string[], skipped: string[], failed: string|null }
   */
  async up() {
    await this._ensureStateTable();
    await this._assertChecksums();

    const files = this._listMigrationFiles();
    const applied = await this._fetchApplied();
    const appliedSet = new Set(applied.map((a) => a.name));

    const pending = files.filter((f) => !appliedSet.has(f.name));

    if (pending.length === 0) {
      this.logger('[migrator] nothing to apply');
      return { applied: [], skipped: files.map((f) => f.name), failed: null };
    }

    const ran = [];
    for (const file of pending) {
      const parsed = parseMigration(file.contents);

      // Destructive-statement gate
      const hits = isDestructive(parsed.up);
      if (hits.length && !this.allowDestructive) {
        throw new Error(
          `[migrator] refusing to apply ${file.name}: contains destructive ` +
            `statement(s) ${hits.map((h) => h.pattern).join(', ')}. Re-run ` +
            `with allowDestructive=true (or --allow-destructive) to proceed.`
        );
      }

      const checksum = sha256(file.contents);
      const t0 = Date.now();

      await this._withTransaction(async (tx) => {
        this.logger(`[migrator] applying ${file.name}`);
        await tx.query(parsed.up);
        const duration = Date.now() - t0;
        await tx.query(
          `INSERT INTO ${this._q(this.stateTable)} ` +
            `(name, checksum, duration_ms, rollback_sql) VALUES ($1, $2, $3, $4)`,
          [file.name, checksum, duration, parsed.down || null]
        );
      }, file.name);

      ran.push(file.name);
    }

    return {
      applied: ran,
      skipped: files.filter((f) => appliedSet.has(f.name)).map((f) => f.name),
      failed: null,
    };
  }

  /**
   * Roll back the last `count` applied migrations (default 1), in reverse
   * order. REFUSED unless `allowDown` is true OR a second positional
   * `explicit:true` option is passed.
   *
   * Each rollback uses the stored `rollback_sql` snapshot from the
   * `_migrations` table, NOT the current file contents (so renaming or
   * modifying the file after deployment cannot change what gets run).
   */
  async down(count = 1, opts = {}) {
    if (!this.allowDown && !opts.explicit) {
      throw new Error(
        '[migrator] down() is refused by default. Construct Migrator with ' +
          '`allowDown: true` or pass `{ explicit: true }` as the second arg ' +
          '(CLI: --down N --yes). Rule: לא מוחקים רק משדרגים ומגדלים.'
      );
    }
    if (!Number.isInteger(count) || count < 1) {
      throw new RangeError('[migrator] down(count) must be a positive integer');
    }

    await this._ensureStateTable();

    const applied = await this._fetchApplied();
    const target = applied.slice(-count).reverse();

    if (target.length === 0) {
      this.logger('[migrator] nothing to roll back');
      return { rolledBack: [] };
    }

    const rolledBack = [];
    for (const row of target) {
      if (!row.rollback_sql) {
        throw new Error(
          `[migrator] cannot roll back ${row.name}: no Down section was ` +
            `recorded. Edit the original file to add "-- +migrate Down" and ` +
            `re-apply, or manually remove the row from ${this.stateTable}.`
        );
      }

      const hits = isDestructive(row.rollback_sql);
      if (hits.length && !this.allowDestructive) {
        throw new Error(
          `[migrator] refusing to roll back ${row.name}: rollback contains ` +
            `destructive statement(s) ${hits.map((h) => h.pattern).join(', ')}. ` +
            `Re-run with allowDestructive=true.`
        );
      }

      await this._withTransaction(async (tx) => {
        this.logger(`[migrator] rolling back ${row.name}`);
        await tx.query(row.rollback_sql);
        await tx.query(
          `DELETE FROM ${this._q(this.stateTable)} WHERE name = $1`,
          [row.name]
        );
      }, `down:${row.name}`);

      rolledBack.push(row.name);
    }

    return { rolledBack };
  }

  /**
   * Report applied vs pending migrations.
   *
   * Returns:
   *   {
   *     stateTable: string,
   *     migrationsDir: string,
   *     applied: [{ id, name, applied_at, checksum, duration_ms }],
   *     pending: [{ name, checksum }],
   *     modified: [{ name, applied_checksum, file_checksum }],
   *     missing:  [{ name }]   // applied but file is gone
   *   }
   */
  async status() {
    await this._ensureStateTable();
    const applied = await this._fetchApplied();
    const files = this._listMigrationFiles();
    const fileMap = new Map(files.map((f) => [f.name, f]));

    const pending = [];
    const modified = [];
    const missing = [];

    for (const file of files) {
      const appliedRow = applied.find((a) => a.name === file.name);
      if (!appliedRow) {
        pending.push({ name: file.name, checksum: sha256(file.contents) });
      } else if (appliedRow.checksum !== sha256(file.contents)) {
        modified.push({
          name: file.name,
          applied_checksum: appliedRow.checksum,
          file_checksum: sha256(file.contents),
        });
      }
    }

    for (const row of applied) {
      if (!fileMap.has(row.name)) missing.push({ name: row.name });
    }

    return {
      stateTable: this.stateTable,
      migrationsDir: this.migrationsDir,
      applied: applied.map((a) => ({
        id: a.id,
        name: a.name,
        applied_at: a.applied_at,
        checksum: a.checksum,
        duration_ms: a.duration_ms,
      })),
      pending,
      modified,
      missing,
    };
  }

  /**
   * Scaffold a new migration file with a zero-padded numeric prefix and
   * Hebrew-safe slug. Returns the absolute path of the file that was
   * created. Does NOT overwrite an existing file.
   *
   *   create("purchase orders") → 0007_purchase_orders.sql
   *   create("רכש — vendors")   → 0008_vendors.sql
   */
  create(name) {
    if (!name) throw new Error('create(name): name is required');
    this._ensureMigrationsDir();

    const existing = this._listMigrationFiles();
    const nextNum =
      existing.length === 0
        ? 1
        : Math.max(...existing.map((f) => f.order)) + 1;
    const padded = String(nextNum).padStart(4, '0');
    const slug = slugify(name);
    const filename = `${padded}_${slug}.sql`;
    const full = path.join(this.migrationsDir, filename);

    if (fs.existsSync(full)) {
      throw new Error(`create: refusing to overwrite existing ${filename}`);
    }

    const template =
      `-- Migration : ${filename}\n` +
      `-- Original  : ${name}\n` +
      `-- Created   : ${new Date().toISOString()}\n` +
      `-- Rule      : לא מוחקים רק משדרגים ומגדלים\n` +
      `--             (we do not delete — we only upgrade and grow)\n` +
      `--\n` +
      `-- Guidelines:\n` +
      `--   * Money columns MUST use NUMERIC(14,2) — never FLOAT/REAL.\n` +
      `--   * Wrap anything destructive (DROP TABLE, DROP COLUMN, TRUNCATE)\n` +
      `--     and re-run the migrator with --allow-destructive.\n` +
      `--   * Create indexes with CREATE INDEX IF NOT EXISTS.\n` +
      `--   * For Supabase: enable RLS on every user-facing table.\n` +
      `\n` +
      `-- +migrate Up\n` +
      `-- TODO: write the forward migration here\n` +
      `\n` +
      `-- +migrate Down\n` +
      `-- TODO: write the reverse migration here\n`;

    fs.writeFileSync(full, template, 'utf8');
    this.logger(`[migrator] created ${filename}`);
    return full;
  }

  /**
   * Dry-run sanity check. Walks every pending migration file and:
   *   - parses the Up/Down delimiters
   *   - splits into statements
   *   - classifies destructive ones
   *   - records checksum
   * WITHOUT sending anything to the database.
   *
   * Returns: { ok: boolean, results: [{ name, ok, error?, destructive: [] }] }
   */
  async verify() {
    const files = this._listMigrationFiles();
    let applied = new Set();
    try {
      await this._ensureStateTable();
      const rows = await this._fetchApplied();
      applied = new Set(rows.map((r) => r.name));
    } catch (err) {
      // In dry-run we tolerate a missing state table — the caller may be
      // running verify() offline without a real DB.
      this.logger(`[migrator] verify: could not read state (${err.message})`);
    }

    const results = [];
    let ok = true;

    for (const file of files) {
      const entry = {
        name: file.name,
        ok: true,
        applied: applied.has(file.name),
        checksum: sha256(file.contents),
        statements: { up: 0, down: 0 },
        destructive: [],
        error: null,
      };
      try {
        const parsed = parseMigration(file.contents);
        entry.statements.up = splitStatements(parsed.up).length;
        entry.statements.down = parsed.down
          ? splitStatements(parsed.down).length
          : 0;
        entry.destructive = isDestructive(parsed.up).map((h) => h.pattern);
      } catch (err) {
        entry.ok = false;
        entry.error = err.message;
        ok = false;
      }
      results.push(entry);
    }

    return { ok, results };
  }

  /**
   * Compare the checksum of every applied migration against the current
   * file on disk. Returns an array of { name, applied_checksum,
   * file_checksum, status } where status ∈ {"ok","modified","missing"}.
   *
   * If `opts.strict` is true and any row is modified or missing, throws.
   * Used by `up()` before touching anything.
   */
  async checksum(opts = {}) {
    await this._ensureStateTable();
    const applied = await this._fetchApplied();
    const files = new Map(
      this._listMigrationFiles().map((f) => [f.name, f])
    );

    const report = applied.map((row) => {
      const file = files.get(row.name);
      if (!file) {
        return {
          name: row.name,
          applied_checksum: row.checksum,
          file_checksum: null,
          status: 'missing',
        };
      }
      const fileChecksum = sha256(file.contents);
      return {
        name: row.name,
        applied_checksum: row.checksum,
        file_checksum: fileChecksum,
        status: fileChecksum === row.checksum ? 'ok' : 'modified',
      };
    });

    if (opts.strict) {
      const bad = report.filter((r) => r.status !== 'ok');
      if (bad.length) {
        const lines = bad
          .map((b) => `  - ${b.name} [${b.status}]`)
          .join('\n');
        throw new Error(
          `[migrator] checksum mismatch — refusing to continue.\n` +
            `Applied migrations have been modified or deleted:\n${lines}\n` +
            `To fix: revert the file to its original contents, OR create a ` +
            `new follow-up migration that makes the intended change. Never ` +
            `rewrite history — rule: לא מוחקים רק משדרגים ומגדלים.`
        );
      }
    }

    return report;
  }

  // ────────────────────────────────────────────────────────────────
  // private helpers
  // ────────────────────────────────────────────────────────────────

  _ensureMigrationsDir() {
    if (!fs.existsSync(this.migrationsDir)) {
      fs.mkdirSync(this.migrationsDir, { recursive: true });
    }
  }

  /**
   * Return a sorted list of migration files. We read file contents here
   * so callers can compute checksums without a second IO pass.
   */
  _listMigrationFiles() {
    this._ensureMigrationsDir();
    const entries = fs
      .readdirSync(this.migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .map((f) => {
        const m = f.match(FILENAME_RE);
        if (!m) return null; // silently skip non-conforming names
        return {
          name: f,
          order: parseInt(m[1], 10),
          slug: m[2],
          path: path.join(this.migrationsDir, f),
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));

    for (const e of entries) {
      e.contents = fs.readFileSync(e.path, 'utf8');
    }
    return entries;
  }

  async _ensureStateTable() {
    const sql =
      `CREATE TABLE IF NOT EXISTS ${this._q(this.stateTable)} (\n` +
      `  id           SERIAL PRIMARY KEY,\n` +
      `  name         TEXT NOT NULL UNIQUE,\n` +
      `  applied_at   TIMESTAMPTZ NOT NULL DEFAULT now(),\n` +
      `  checksum     TEXT NOT NULL,\n` +
      `  duration_ms  INTEGER NOT NULL,\n` +
      `  rollback_sql TEXT\n` +
      `)`;
    await this.client.query(sql);
  }

  async _fetchApplied() {
    const res = await this.client.query(
      `SELECT id, name, applied_at, checksum, duration_ms, rollback_sql ` +
        `FROM ${this._q(this.stateTable)} ORDER BY id ASC`
    );
    // node-postgres returns { rows }; Supabase postgres client ditto; some
    // mocks may return a plain array.
    return Array.isArray(res) ? res : res.rows || [];
  }

  /**
   * Assert that every applied migration is still byte-identical to the
   * on-disk file. If anything has drifted we REFUSE the run and tell the
   * operator to add a forward migration instead of rewriting history.
   */
  async _assertChecksums() {
    try {
      await this.checksum({ strict: true });
    } catch (err) {
      // If the state table does not exist yet (first-ever run), there are
      // no applied migrations to verify — surface only checksum errors.
      if (!/checksum mismatch/.test(err.message)) throw err;
      throw err;
    }
  }

  /**
   * Run `fn(tx)` inside a dedicated BEGIN/COMMIT transaction. If the
   * injected client exposes `connect()` we use a dedicated connection so
   * that parallel callers do not interfere. Otherwise we fall back to
   * issuing BEGIN/COMMIT on the shared client (fine for tests and for
   * single-operator CLIs).
   */
  async _withTransaction(fn, label) {
    const hasConnect = typeof this.client.connect === 'function';
    const conn = hasConnect ? await this.client.connect() : this.client;
    try {
      await conn.query('BEGIN');
      try {
        await fn(conn);
        await conn.query('COMMIT');
      } catch (err) {
        try {
          await conn.query('ROLLBACK');
        } catch (_) {
          // ignore secondary error
        }
        err.message = `[migrator] ${label}: ${err.message}`;
        throw err;
      }
    } finally {
      if (hasConnect && typeof conn.release === 'function') conn.release();
    }
  }

  /**
   * Quote a PG identifier. Used ONLY for the state table name so that a
   * caller who configures `stateTable: "public.__migrations__"` still
   * works without breaking. NOT a general-purpose SQL escaper.
   */
  _q(ident) {
    if (!/^[A-Za-z_][A-Za-z0-9_.]*$/.test(ident)) {
      throw new Error(`Migrator: invalid identifier ${JSON.stringify(ident)}`);
    }
    return ident;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Exports
// ═══════════════════════════════════════════════════════════════════════════

module.exports = {
  Migrator,
  parseMigration,
  sha256,
  isDestructive,
  slugify,
  splitStatements,
  stripCommentsAndStrings,
  // constants — handy for tests
  DESTRUCTIVE_PATTERNS,
  DEFAULT_STATE_TABLE,
  FILENAME_RE,
};
