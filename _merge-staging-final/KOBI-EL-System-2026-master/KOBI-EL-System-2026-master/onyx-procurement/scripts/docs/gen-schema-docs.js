#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * ONYX — Database Schema Documentation Generator (Agent 60)
 * ===========================================================
 * Reads every `*.sql` file under `supabase/migrations/` and (if it
 * exists) `src/db/schema.sql`, parses `CREATE TABLE`, `CREATE INDEX`,
 * `CREATE VIEW`, `COMMENT ON TABLE`, `COMMENT ON COLUMN`, and inline
 * constraints with a regex-based scanner (no external parser), and
 * emits:
 *
 *   1) docs/DATABASE_SCHEMA.md   — human-readable Markdown with:
 *      - Table of tables (count, columns, module)
 *      - Per-table column lists + constraints + doc comments
 *      - Mermaid `erDiagram` of tables and foreign keys
 *      - Full FK list
 *      - Full index list
 *      - View list
 *
 *   2) docs/DATABASE_SCHEMA.json — structured JSON, machine-readable,
 *      so downstream tooling (linters, codegen, AI agents) can consume
 *      the schema directly.
 *
 * Extensions supported in SQL:
 *   - Standard column comments via `COMMENT ON COLUMN table.col IS '...'`
 *   - Inline Markdown-friendly hints via `-- @doc: free-text` placed on
 *     the line immediately preceding a column definition. Example:
 *
 *         -- @doc: Net pay after all deductions (מס הכנסה, ביטוח לאומי…)
 *         net_pay NUMERIC(14,2) NOT NULL,
 *
 * Rule (per Agent 60): this script CREATES. It never deletes existing
 * files outside `docs/DATABASE_SCHEMA.md` / `docs/DATABASE_SCHEMA.json`,
 * which it overwrites with freshly generated content on every run.
 *
 * Usage:
 *   node scripts/docs/gen-schema-docs.js
 *   npm run docs:schema
 */

'use strict';

const fs = require('fs');
const path = require('path');

// ─────────────────────────────────────────────────────────────
// Paths
// ─────────────────────────────────────────────────────────────
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const MIGRATIONS_DIR = path.join(PROJECT_ROOT, 'supabase', 'migrations');
const LEGACY_SCHEMA = path.join(PROJECT_ROOT, 'src', 'db', 'schema.sql');
const DOCS_DIR = path.join(PROJECT_ROOT, 'docs');
const OUT_MD = path.join(DOCS_DIR, 'DATABASE_SCHEMA.md');
const OUT_JSON = path.join(DOCS_DIR, 'DATABASE_SCHEMA.json');

// ─────────────────────────────────────────────────────────────
// File collection
// ─────────────────────────────────────────────────────────────
function collectSqlFiles() {
  const files = [];
  if (fs.existsSync(MIGRATIONS_DIR)) {
    const entries = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.toLowerCase().endsWith('.sql'))
      .sort(); // numeric-prefixed filenames sort correctly
    for (const f of entries) {
      files.push(path.join(MIGRATIONS_DIR, f));
    }
  }
  if (fs.existsSync(LEGACY_SCHEMA)) {
    files.push(LEGACY_SCHEMA);
  }
  return files;
}

// ─────────────────────────────────────────────────────────────
// SQL preprocessing
// ─────────────────────────────────────────────────────────────
/**
 * Strip `/* … *\/` block comments but KEEP `--` line comments —
 * we need them for `-- @doc:` hints and for `COMMENT ON` detection.
 */
function stripBlockComments(sql) {
  return sql.replace(/\/\*[\s\S]*?\*\//g, '');
}

/**
 * Split a CREATE TABLE body on commas at paren-depth 0. Handles
 * nested parentheses (e.g. `CHECK (a IN ('x','y'))`) and string
 * literals so we don't break on commas inside them.
 */
function splitTableBody(body) {
  const parts = [];
  let depth = 0;
  let buf = '';
  let inString = false;
  let stringChar = null;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (inString) {
      buf += ch;
      if (ch === stringChar) {
        // Handle '' escape
        if (body[i + 1] === stringChar) {
          buf += body[i + 1];
          i++;
        } else {
          inString = false;
          stringChar = null;
        }
      }
      continue;
    }
    if (ch === "'" || ch === '"') {
      inString = true;
      stringChar = ch;
      buf += ch;
      continue;
    }
    if (ch === '(') {
      depth++;
      buf += ch;
      continue;
    }
    if (ch === ')') {
      depth--;
      buf += ch;
      continue;
    }
    if (ch === ',' && depth === 0) {
      parts.push(buf.trim());
      buf = '';
      continue;
    }
    buf += ch;
  }
  if (buf.trim()) parts.push(buf.trim());
  return parts;
}

/**
 * Find the matching close paren for an open paren at index `start`
 * inside `source`. Respects nesting and string literals.
 */
function findMatchingParen(source, start) {
  let depth = 0;
  let inString = false;
  let stringChar = null;
  for (let i = start; i < source.length; i++) {
    const ch = source[i];
    if (inString) {
      if (ch === stringChar) {
        if (source[i + 1] === stringChar) {
          i++;
        } else {
          inString = false;
          stringChar = null;
        }
      }
      continue;
    }
    if (ch === "'" || ch === '"') {
      inString = true;
      stringChar = ch;
      continue;
    }
    if (ch === '(') depth++;
    else if (ch === ')') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

// ─────────────────────────────────────────────────────────────
// Column / constraint parsing
// ─────────────────────────────────────────────────────────────
const RESERVED_CONSTRAINT_PREFIXES = [
  'primary key',
  'foreign key',
  'unique',
  'check',
  'constraint',
  'exclude',
];

function isConstraintPart(part) {
  const lower = part.trim().toLowerCase();
  return RESERVED_CONSTRAINT_PREFIXES.some((p) => lower.startsWith(p));
}

/**
 * Parse a single column definition such as:
 *   `name TEXT NOT NULL DEFAULT 'x' REFERENCES other(id) ON DELETE CASCADE`
 */
function parseColumn(part, docHint) {
  // Strip trailing line comment if any (e.g. `-- comment`)
  let raw = part.replace(/--[^\n]*$/gm, '').trim();
  // Split on first whitespace for name
  const m = raw.match(/^"?([a-zA-Z_][a-zA-Z0-9_]*)"?\s+([\s\S]+)$/);
  if (!m) return null;
  const name = m[1];
  const rest = m[2].trim();

  // Extract type — everything up to first constraint keyword
  // Type can be e.g. `NUMERIC(14,2)`, `TEXT[]`, `UUID`, `INTEGER`
  // We grab the type greedily up to first keyword like NOT, NULL,
  // DEFAULT, REFERENCES, CHECK, UNIQUE, PRIMARY, COLLATE, GENERATED
  const stopWords =
    /\b(NOT\s+NULL|NULL|DEFAULT|REFERENCES|CHECK|UNIQUE|PRIMARY\s+KEY|COLLATE|GENERATED|CONSTRAINT|ON\s+UPDATE|ON\s+DELETE)\b/i;
  let type = rest;
  let tail = '';
  const stopIdx = rest.search(stopWords);
  if (stopIdx >= 0) {
    type = rest.slice(0, stopIdx).trim();
    tail = rest.slice(stopIdx).trim();
  }
  // Type may have trailing brackets (e.g. TEXT[]) — preserve
  type = type.replace(/\s+/g, ' ').trim();

  const notNull = /\bNOT\s+NULL\b/i.test(tail);
  const primaryKey = /\bPRIMARY\s+KEY\b/i.test(tail);
  const unique = /\bUNIQUE\b/i.test(tail);

  let defaultValue = null;
  const defMatch = tail.match(/\bDEFAULT\s+([^,]+?)(?=\s+(NOT\s+NULL|REFERENCES|CHECK|UNIQUE|PRIMARY|COLLATE|GENERATED|CONSTRAINT|ON\s+UPDATE|ON\s+DELETE)\b|$)/i);
  if (defMatch) defaultValue = defMatch[1].trim();

  let references = null;
  const refMatch = tail.match(
    /\bREFERENCES\s+"?([a-zA-Z_][a-zA-Z0-9_]*)"?\s*\(\s*"?([a-zA-Z_][a-zA-Z0-9_]*)"?\s*\)(?:\s+ON\s+DELETE\s+([A-Z\s]+?))?(?:\s+ON\s+UPDATE\s+([A-Z\s]+?))?(?=\s|,|$)/i,
  );
  if (refMatch) {
    references = {
      table: refMatch[1],
      column: refMatch[2],
      onDelete: refMatch[3] ? refMatch[3].trim() : null,
      onUpdate: refMatch[4] ? refMatch[4].trim() : null,
    };
  }

  let check = null;
  const checkMatch = tail.match(/\bCHECK\s*\(([\s\S]+?)\)(?=\s|,|$)/i);
  if (checkMatch) check = checkMatch[1].trim();

  let generated = null;
  const genMatch = tail.match(/\bGENERATED\s+ALWAYS\s+AS\s*\(([\s\S]+?)\)\s*(STORED|VIRTUAL)?/i);
  if (genMatch) generated = { expression: genMatch[1].trim(), storage: genMatch[2] || null };

  return {
    name,
    type,
    notNull,
    primaryKey,
    unique,
    default: defaultValue,
    references,
    check,
    generated,
    doc: docHint || null,
  };
}

/**
 * Parse a table-level constraint such as:
 *   `PRIMARY KEY (a, b)`
 *   `FOREIGN KEY (a) REFERENCES other(id)`
 *   `UNIQUE (a, b)`
 *   `CHECK (expr)`
 *   `CONSTRAINT name UNIQUE (a)`
 */
function parseTableConstraint(part) {
  let raw = part.trim();
  let name = null;
  const nameMatch = raw.match(/^CONSTRAINT\s+"?([a-zA-Z_][a-zA-Z0-9_]*)"?\s+([\s\S]+)$/i);
  if (nameMatch) {
    name = nameMatch[1];
    raw = nameMatch[2].trim();
  }

  if (/^PRIMARY\s+KEY\s*\(/i.test(raw)) {
    const cols = raw.match(/\(([^)]+)\)/);
    return {
      kind: 'primary_key',
      name,
      columns: cols ? cols[1].split(',').map((s) => s.trim().replace(/"/g, '')) : [],
    };
  }
  if (/^FOREIGN\s+KEY\s*\(/i.test(raw)) {
    const cols = raw.match(/\(([^)]+)\)/);
    const ref = raw.match(
      /REFERENCES\s+"?([a-zA-Z_][a-zA-Z0-9_]*)"?\s*\(([^)]+)\)(?:\s+ON\s+DELETE\s+([A-Z\s]+?))?(?:\s+ON\s+UPDATE\s+([A-Z\s]+?))?\s*$/i,
    );
    return {
      kind: 'foreign_key',
      name,
      columns: cols ? cols[1].split(',').map((s) => s.trim().replace(/"/g, '')) : [],
      references: ref
        ? {
            table: ref[1],
            columns: ref[2].split(',').map((s) => s.trim().replace(/"/g, '')),
            onDelete: ref[3] ? ref[3].trim() : null,
            onUpdate: ref[4] ? ref[4].trim() : null,
          }
        : null,
    };
  }
  if (/^UNIQUE\s*\(/i.test(raw)) {
    const cols = raw.match(/\(([^)]+)\)/);
    return {
      kind: 'unique',
      name,
      columns: cols ? cols[1].split(',').map((s) => s.trim().replace(/"/g, '')) : [],
    };
  }
  if (/^CHECK\s*\(/i.test(raw)) {
    const expr = raw.match(/^CHECK\s*\(([\s\S]+)\)\s*$/i);
    return {
      kind: 'check',
      name,
      expression: expr ? expr[1].trim() : raw,
    };
  }
  return null;
}

/**
 * Parse a full CREATE TABLE block starting at index `openIdx`
 * (position of the `(` after the table name).
 */
function parseCreateTable(sql, tableName, openIdx, sourceFile) {
  const closeIdx = findMatchingParen(sql, openIdx);
  if (closeIdx < 0) return null;
  const rawBody = sql.slice(openIdx + 1, closeIdx);

  // Walk the raw body line-by-line so we can:
  //   1. extract `-- @doc:` hints for the NEXT column
  //   2. strip every other `--` line comment before splitting
  //      (inline comments can contain commas/apostrophes that would
  //       otherwise confuse the splitter)
  //   3. attach each `@doc:` hint to the column definition that
  //      immediately follows it, keyed by the column's first token.
  const rawLines = rawBody.split(/\r?\n/);
  const cleanLines = [];
  const hintByFirstToken = {};
  let pendingHint = null;
  for (const origLine of rawLines) {
    const hintMatch = origLine.match(/^\s*--\s*@doc:\s*(.+?)\s*$/);
    if (hintMatch) {
      pendingHint = hintMatch[1];
      cleanLines.push(''); // drop the hint line from the split body
      continue;
    }
    // Remove any trailing `-- …` inline comment from the line but keep
    // code before it. We also need to ignore `--` that appears inside a
    // string literal. Track literal state across the line.
    let stripped = '';
    let inString = false;
    let stringChar = null;
    for (let i = 0; i < origLine.length; i++) {
      const ch = origLine[i];
      const nxt = origLine[i + 1];
      if (inString) {
        stripped += ch;
        if (ch === stringChar) {
          if (nxt === stringChar) {
            stripped += nxt;
            i++;
          } else {
            inString = false;
            stringChar = null;
          }
        }
        continue;
      }
      if (ch === "'" || ch === '"') {
        inString = true;
        stringChar = ch;
        stripped += ch;
        continue;
      }
      if (ch === '-' && nxt === '-') {
        break; // rest of line is a comment
      }
      stripped += ch;
    }
    cleanLines.push(stripped);
    // If this line has real code (not blank), attach the pending hint
    // to the first identifier on the line.
    const codeOnly = stripped.trim();
    if (codeOnly && pendingHint) {
      const firstTok = codeOnly.split(/\s+/)[0].replace(/[",]/g, '');
      if (firstTok && /^[a-zA-Z_]/.test(firstTok)) {
        hintByFirstToken[firstTok.toLowerCase()] = pendingHint;
      }
      pendingHint = null;
    } else if (!codeOnly) {
      // keep pendingHint for the next real line
    }
  }
  const body = cleanLines.join('\n');

  const parts = splitTableBody(body);
  const columns = [];
  const constraints = [];

  for (const rawPart of parts) {
    const part = rawPart.trim();
    if (!part) continue;
    const firstTok = part.split(/\s+/)[0].replace(/[",]/g, '').toLowerCase();
    const hint = hintByFirstToken[firstTok] || null;
    if (isConstraintPart(part)) {
      const c = parseTableConstraint(part);
      if (c) constraints.push(c);
    } else {
      const col = parseColumn(part, hint);
      if (col) columns.push(col);
    }
  }

  return {
    name: tableName,
    sourceFile: path.basename(sourceFile),
    columns,
    constraints,
    indexes: [], // filled later
    comment: null, // filled later from COMMENT ON
    columnComments: {}, // filled later
  };
}

// ─────────────────────────────────────────────────────────────
// Top-level extraction over all SQL files
// ─────────────────────────────────────────────────────────────
function extractSchema(files) {
  const tables = {}; // name -> table record
  const indexes = []; // global flat list
  const views = []; // { name, sourceFile, definition }
  const tableComments = {}; // name -> string
  const columnComments = {}; // `${table}.${col}` -> string

  for (const file of files) {
    const rawSql = fs.readFileSync(file, 'utf8');
    const sql = stripBlockComments(rawSql);

    // CREATE TABLE [IF NOT EXISTS] name (
    const tableRe =
      /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?"?([a-zA-Z_][a-zA-Z0-9_]*)"?\s*\(/gi;
    let m;
    while ((m = tableRe.exec(sql)) !== null) {
      const tableName = m[1];
      const openIdx = m.index + m[0].length - 1; // index of the `(`
      const table = parseCreateTable(sql, tableName, openIdx, file);
      if (!table) continue;
      // If table already exists (re-run of migration), merge columns
      if (tables[tableName]) {
        const existing = tables[tableName];
        const existingNames = new Set(existing.columns.map((c) => c.name));
        for (const c of table.columns) {
          if (!existingNames.has(c.name)) existing.columns.push(c);
        }
        existing.constraints.push(...table.constraints);
      } else {
        tables[tableName] = table;
      }
      tableRe.lastIndex = openIdx; // restart scan after the opener
    }

    // CREATE [UNIQUE] INDEX [IF NOT EXISTS] name ON table (...)
    const indexRe =
      /CREATE\s+(UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?"?([a-zA-Z_][a-zA-Z0-9_]*)"?\s+ON\s+"?([a-zA-Z_][a-zA-Z0-9_]*)"?\s*\(([^)]+)\)([^;]*);?/gi;
    let im;
    while ((im = indexRe.exec(sql)) !== null) {
      const rec = {
        name: im[2],
        table: im[3],
        columns: im[4].split(',').map((s) => s.trim()),
        unique: Boolean(im[1]),
        where: null,
        sourceFile: path.basename(file),
      };
      const whereMatch = im[5] && im[5].match(/\bWHERE\b\s+([^;]+)/i);
      if (whereMatch) rec.where = whereMatch[1].trim();
      indexes.push(rec);
    }

    // CREATE OR REPLACE VIEW name AS ... ;
    const viewRe =
      /CREATE\s+(?:OR\s+REPLACE\s+)?VIEW\s+(?:IF\s+NOT\s+EXISTS\s+)?"?([a-zA-Z_][a-zA-Z0-9_]*)"?\s+AS\s+([\s\S]+?);/gi;
    let vm;
    while ((vm = viewRe.exec(sql)) !== null) {
      views.push({
        name: vm[1],
        definition: vm[2].trim(),
        sourceFile: path.basename(file),
      });
    }

    // COMMENT ON TABLE name IS '…'
    const tblCmtRe =
      /COMMENT\s+ON\s+TABLE\s+"?([a-zA-Z_][a-zA-Z0-9_]*)"?\s+IS\s+'((?:''|[^'])*)'/gi;
    let cm;
    while ((cm = tblCmtRe.exec(sql)) !== null) {
      tableComments[cm[1]] = cm[2].replace(/''/g, "'");
    }

    // COMMENT ON COLUMN table.col IS '…'
    const colCmtRe =
      /COMMENT\s+ON\s+COLUMN\s+"?([a-zA-Z_][a-zA-Z0-9_]*)"?\."?([a-zA-Z_][a-zA-Z0-9_]*)"?\s+IS\s+'((?:''|[^'])*)'/gi;
    let ccm;
    while ((ccm = colCmtRe.exec(sql)) !== null) {
      columnComments[`${ccm[1]}.${ccm[2]}`] = ccm[3].replace(/''/g, "'");
    }
  }

  // Attach comments & indexes to tables
  for (const [name, text] of Object.entries(tableComments)) {
    if (tables[name]) tables[name].comment = text;
  }
  for (const [key, text] of Object.entries(columnComments)) {
    const [t, c] = key.split('.');
    if (tables[t]) {
      tables[t].columnComments[c] = text;
      const col = tables[t].columns.find((x) => x.name === c);
      if (col && !col.doc) col.doc = text;
    }
  }
  for (const idx of indexes) {
    if (tables[idx.table]) tables[idx.table].indexes.push(idx);
  }

  return {
    generatedAt: new Date().toISOString(),
    sourceFiles: files.map((f) => path.relative(PROJECT_ROOT, f).replace(/\\/g, '/')),
    tables,
    indexes,
    views,
  };
}

// ─────────────────────────────────────────────────────────────
// Foreign-key derivation (from both inline and table-level)
// ─────────────────────────────────────────────────────────────
function collectForeignKeys(schema) {
  const fks = [];
  for (const table of Object.values(schema.tables)) {
    for (const col of table.columns) {
      if (col.references) {
        fks.push({
          fromTable: table.name,
          fromColumn: col.name,
          toTable: col.references.table,
          toColumn: col.references.column,
          onDelete: col.references.onDelete,
          onUpdate: col.references.onUpdate,
          kind: 'inline',
        });
      }
    }
    for (const c of table.constraints) {
      if (c.kind === 'foreign_key' && c.references) {
        fks.push({
          fromTable: table.name,
          fromColumn: c.columns.join(','),
          toTable: c.references.table,
          toColumn: c.references.columns.join(','),
          onDelete: c.references.onDelete,
          onUpdate: c.references.onUpdate,
          kind: 'table',
          name: c.name,
        });
      }
    }
  }
  return fks;
}

// ─────────────────────────────────────────────────────────────
// Mermaid ERD rendering
// ─────────────────────────────────────────────────────────────
function mermaidTypeFor(col) {
  const t = (col.type || '').toUpperCase();
  if (/INT|SERIAL|BIGSERIAL/.test(t)) return 'int';
  if (/NUMERIC|DECIMAL|FLOAT|DOUBLE|REAL/.test(t)) return 'number';
  if (/BOOL/.test(t)) return 'boolean';
  if (/JSON/.test(t)) return 'json';
  if (/DATE|TIME/.test(t)) return 'datetime';
  if (/UUID/.test(t)) return 'uuid';
  if (/TEXT|CHAR|VARCHAR/.test(t)) return 'string';
  return 'string';
}

function sanitizeMermaidName(name) {
  // Mermaid ER diagram identifiers must be word-chars; we uppercase for style.
  return String(name).replace(/[^a-zA-Z0-9_]/g, '_').toUpperCase();
}

function renderMermaidErd(schema, fks) {
  const lines = ['erDiagram'];
  // Relationships first
  const seen = new Set();
  for (const fk of fks) {
    const from = sanitizeMermaidName(fk.fromTable);
    const to = sanitizeMermaidName(fk.toTable);
    const key = `${from}__${to}__${fk.fromColumn}`;
    if (seen.has(key)) continue;
    seen.add(key);
    lines.push(`  ${to} ||--o{ ${from} : "${fk.fromColumn}"`);
  }
  // Entity blocks
  for (const table of Object.values(schema.tables)) {
    const m = sanitizeMermaidName(table.name);
    lines.push(`  ${m} {`);
    // Limit to first 12 columns to keep diagram readable
    const cols = table.columns.slice(0, 12);
    for (const col of cols) {
      const type = mermaidTypeFor(col);
      const flag = col.primaryKey
        ? 'PK'
        : col.references
          ? 'FK'
          : col.unique
            ? 'UK'
            : '';
      const nameSafe = col.name.replace(/[^a-zA-Z0-9_]/g, '_');
      lines.push(`    ${type} ${nameSafe}${flag ? ' ' + flag : ''}`);
    }
    if (table.columns.length > cols.length) {
      lines.push(`    string _more_${table.columns.length - cols.length}_fields`);
    }
    lines.push('  }');
  }
  return lines.join('\n');
}

// ─────────────────────────────────────────────────────────────
// Markdown rendering
// ─────────────────────────────────────────────────────────────
function escPipe(s) {
  return String(s == null ? '' : s).replace(/\|/g, '\\|').replace(/\n+/g, ' ');
}

function renderMarkdown(schema, fks, mermaid) {
  const tableNames = Object.keys(schema.tables).sort();
  const out = [];
  out.push('# ONYX — Database Schema Reference');
  out.push('');
  out.push('> Auto-generated by `scripts/docs/gen-schema-docs.js`.');
  out.push('> Do not edit by hand — run `npm run docs:schema` after any migration change.');
  out.push('');
  out.push(`- **Generated:** ${schema.generatedAt}`);
  out.push(`- **Source files:** ${schema.sourceFiles.length}`);
  out.push(`- **Tables:** ${tableNames.length}`);
  out.push(`- **Views:** ${schema.views.length}`);
  out.push(`- **Indexes:** ${schema.indexes.length}`);
  out.push(`- **Foreign keys:** ${fks.length}`);
  out.push('');
  out.push('## Source Files');
  out.push('');
  for (const f of schema.sourceFiles) out.push(`- \`${f}\``);
  out.push('');

  // ── Table of tables ───────────────────────────────────────
  out.push('## Tables Overview');
  out.push('');
  out.push('| # | Table | Columns | Indexes | Module | Description |');
  out.push('|---|-------|---------|---------|--------|-------------|');
  tableNames.forEach((name, i) => {
    const t = schema.tables[name];
    const mod = (t.sourceFile || '').replace(/\.sql$/, '');
    out.push(
      `| ${i + 1} | [\`${name}\`](#${name}) | ${t.columns.length} | ${t.indexes.length} | ${mod} | ${escPipe(t.comment || '')} |`,
    );
  });
  out.push('');

  // ── ERD ───────────────────────────────────────────────────
  out.push('## Entity-Relationship Diagram (Mermaid)');
  out.push('');
  out.push('```mermaid');
  out.push(mermaid);
  out.push('```');
  out.push('');

  // ── Per-table detail ──────────────────────────────────────
  out.push('## Tables (detailed)');
  out.push('');
  for (const name of tableNames) {
    const t = schema.tables[name];
    out.push(`### \`${name}\``);
    out.push('');
    if (t.comment) {
      out.push(`> ${t.comment}`);
      out.push('');
    }
    out.push(`_Source: \`${t.sourceFile}\`_`);
    out.push('');
    out.push('| Column | Type | Null | Default | Key | References | Description |');
    out.push('|--------|------|------|---------|-----|------------|-------------|');
    for (const col of t.columns) {
      const nullable = col.notNull ? 'NO' : 'YES';
      const key = col.primaryKey
        ? 'PK'
        : col.unique
          ? 'UQ'
          : col.references
            ? 'FK'
            : '';
      const ref = col.references
        ? `\`${col.references.table}(${col.references.column})\`${col.references.onDelete ? ' ON DELETE ' + col.references.onDelete : ''}`
        : '';
      out.push(
        `| \`${col.name}\` | \`${escPipe(col.type)}\` | ${nullable} | ${escPipe(col.default || '')} | ${key} | ${escPipe(ref)} | ${escPipe(col.doc || '')} |`,
      );
    }
    out.push('');
    // Constraints
    const tableConstraints = t.constraints.filter((c) => c.kind !== 'foreign_key');
    if (tableConstraints.length) {
      out.push('**Table-level constraints**');
      out.push('');
      for (const c of tableConstraints) {
        if (c.kind === 'primary_key') {
          out.push(`- **PRIMARY KEY**${c.name ? ' (`' + c.name + '`)' : ''}: \`(${c.columns.join(', ')})\``);
        } else if (c.kind === 'unique') {
          out.push(`- **UNIQUE**${c.name ? ' (`' + c.name + '`)' : ''}: \`(${c.columns.join(', ')})\``);
        } else if (c.kind === 'check') {
          out.push(`- **CHECK**${c.name ? ' (`' + c.name + '`)' : ''}: \`${c.expression}\``);
        }
      }
      out.push('');
    }
    // Indexes
    if (t.indexes.length) {
      out.push('**Indexes**');
      out.push('');
      for (const idx of t.indexes) {
        out.push(
          `- \`${idx.name}\`${idx.unique ? ' _(unique)_' : ''} on \`(${idx.columns.join(', ')})\`${idx.where ? ' WHERE ' + idx.where : ''}`,
        );
      }
      out.push('');
    }
  }

  // ── Foreign-key master list ───────────────────────────────
  out.push('## Foreign Keys (all)');
  out.push('');
  if (fks.length === 0) {
    out.push('_None detected._');
  } else {
    out.push('| From | Column | → | To | Column | ON DELETE | ON UPDATE |');
    out.push('|------|--------|---|-----|--------|-----------|-----------|');
    for (const fk of fks) {
      out.push(
        `| \`${fk.fromTable}\` | \`${fk.fromColumn}\` | → | \`${fk.toTable}\` | \`${fk.toColumn}\` | ${fk.onDelete || ''} | ${fk.onUpdate || ''} |`,
      );
    }
  }
  out.push('');

  // ── Index master list ─────────────────────────────────────
  out.push('## Indexes (all)');
  out.push('');
  if (schema.indexes.length === 0) {
    out.push('_None detected._');
  } else {
    out.push('| Name | Table | Columns | Unique | Where | Source |');
    out.push('|------|-------|---------|--------|-------|--------|');
    for (const idx of schema.indexes) {
      out.push(
        `| \`${idx.name}\` | \`${idx.table}\` | \`${idx.columns.join(', ')}\` | ${idx.unique ? 'yes' : 'no'} | ${escPipe(idx.where || '')} | \`${idx.sourceFile}\` |`,
      );
    }
  }
  out.push('');

  // ── Views ─────────────────────────────────────────────────
  out.push('## Views');
  out.push('');
  if (schema.views.length === 0) {
    out.push('_None detected._');
  } else {
    for (const v of schema.views) {
      out.push(`### \`${v.name}\``);
      out.push('');
      out.push(`_Source: \`${v.sourceFile}\`_`);
      out.push('');
      out.push('```sql');
      out.push(v.definition);
      out.push('```');
      out.push('');
    }
  }
  out.push('');
  out.push('---');
  out.push('');
  out.push(
    '_Run `npm run docs:schema` after editing any `supabase/migrations/*.sql` file to refresh this document._',
  );
  out.push('');

  return out.join('\n');
}

// ─────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────
function main() {
  const files = collectSqlFiles();
  if (files.length === 0) {
    console.error('[gen-schema-docs] No SQL files found. Looked in:');
    console.error('  -', MIGRATIONS_DIR);
    console.error('  -', LEGACY_SCHEMA);
    process.exit(1);
  }

  console.log(`[gen-schema-docs] Parsing ${files.length} SQL file(s)…`);
  const schema = extractSchema(files);
  const fks = collectForeignKeys(schema);
  const mermaid = renderMermaidErd(schema, fks);
  const md = renderMarkdown(schema, fks, mermaid);

  // Persist JSON payload — includes derived FK list for downstream use
  const jsonPayload = {
    generatedAt: schema.generatedAt,
    sourceFiles: schema.sourceFiles,
    tables: schema.tables,
    indexes: schema.indexes,
    views: schema.views,
    foreignKeys: fks,
  };

  if (!fs.existsSync(DOCS_DIR)) fs.mkdirSync(DOCS_DIR, { recursive: true });
  fs.writeFileSync(OUT_MD, md, 'utf8');
  fs.writeFileSync(OUT_JSON, JSON.stringify(jsonPayload, null, 2), 'utf8');

  console.log(`[gen-schema-docs] Wrote ${path.relative(PROJECT_ROOT, OUT_MD)}`);
  console.log(`[gen-schema-docs] Wrote ${path.relative(PROJECT_ROOT, OUT_JSON)}`);
  console.log(
    `[gen-schema-docs] Summary: ${Object.keys(schema.tables).length} tables, ${schema.views.length} views, ${schema.indexes.length} indexes, ${fks.length} FKs.`,
  );
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    console.error('[gen-schema-docs] Failed:', err && err.stack ? err.stack : err);
    process.exit(1);
  }
}

module.exports = {
  collectSqlFiles,
  stripBlockComments,
  splitTableBody,
  findMatchingParen,
  parseColumn,
  parseTableConstraint,
  parseCreateTable,
  extractSchema,
  collectForeignKeys,
  renderMermaidErd,
  renderMarkdown,
};
