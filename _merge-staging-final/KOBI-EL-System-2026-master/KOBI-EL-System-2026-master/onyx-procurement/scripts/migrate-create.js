#!/usr/bin/env node
/**
 * ONYX PROCUREMENT - Migration scaffold generator
 * ================================================
 * Agent 49. Generates a new migration file in `migrations/` with the
 * next sequential version number and a `-- UP` / `-- DOWN` skeleton.
 *
 * Usage:
 *   node scripts/migrate-create.js <snake_case_name>
 *   node scripts/migrate-create.js add_employee_index
 *   node scripts/migrate-create.js --help
 *
 * Flags:
 *   --dir <path>    override the target directory (default: migrations/)
 *   --empty         emit an empty skeleton (no example CREATE/DROP)
 *   --help, -h      show this help
 *
 * Behavior:
 *   - Scans existing files matching /^(\d{3,})[-_]/ and picks next version.
 *   - First migration in an empty directory starts at 001.
 *   - Name is slugified to snake_case lowercase, with non-alnum -> `_`.
 *   - Never overwrites an existing file.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const REPO_ROOT   = path.join(__dirname, '..');
const DEFAULT_DIR = path.join(REPO_ROOT, 'migrations');

// ---------- CLI parsing ----------
const argv = process.argv.slice(2);

function takeFlag(name) {
  const i = argv.indexOf(name);
  if (i === -1) return false;
  argv.splice(i, 1);
  return true;
}
function takeValue(name) {
  const i = argv.indexOf(name);
  if (i === -1) return null;
  const v = argv[i + 1];
  argv.splice(i, v ? 2 : 1);
  return v || null;
}

const HELP    = takeFlag('--help') || takeFlag('-h');
const EMPTY   = takeFlag('--empty');
const DIR_OPT = takeValue('--dir');
const POSITIONAL = argv.filter(a => !a.startsWith('--'));

if (HELP || POSITIONAL.length === 0) {
  const txt = `
ONYX PROCUREMENT - Migration scaffold generator

Usage:
  node scripts/migrate-create.js <snake_case_name> [flags]
  node scripts/migrate-create.js add_employee_index
  node scripts/migrate-create.js "Add VAT tracking column"

Flags:
  --dir <path>   override the target directory (default: migrations/)
  --empty        emit an empty UP/DOWN skeleton (no example SQL)
  --help, -h     show this help

Output:
  Creates  <dir>/<NNN>_<slug>.sql  with a -- UP / -- DOWN template.
`;
  process.stdout.write(txt + '\n');
  process.exit(POSITIONAL.length === 0 && !HELP ? 2 : 0);
}

// ---------- Resolve target dir ----------
const targetDir = DIR_OPT
  ? (path.isAbsolute(DIR_OPT) ? DIR_OPT : path.join(REPO_ROOT, DIR_OPT))
  : DEFAULT_DIR;

try {
  fs.mkdirSync(targetDir, { recursive: true });
} catch (err) {
  process.stderr.write(`ERROR: cannot create ${targetDir}: ${err.message}\n`);
  process.exit(1);
}

// ---------- Slugify name ----------
function slugify(raw) {
  return String(raw)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80) || 'migration';
}
const nameInput = POSITIONAL.join(' ');
const slug      = slugify(nameInput);

// ---------- Pick next version number ----------
function nextVersion(dir) {
  let max = 0;
  if (!fs.existsSync(dir)) return '001';
  for (const f of fs.readdirSync(dir)) {
    const m = f.match(/^(\d{3,})[-_]/);
    if (m) {
      const n = parseInt(m[1], 10);
      if (!Number.isNaN(n) && n > max) max = n;
    }
  }
  return String(max + 1).padStart(3, '0');
}
const version  = nextVersion(targetDir);
const filename = `${version}_${slug}.sql`;
const fullPath = path.join(targetDir, filename);

if (fs.existsSync(fullPath)) {
  process.stderr.write(`ERROR: ${fullPath} already exists - refusing to overwrite.\n`);
  process.exit(1);
}

// ---------- Template ----------
const now = new Date().toISOString();

const exampleUp = EMPTY ? `-- Write your schema changes here.\n` : `-- Example:
-- CREATE TABLE IF NOT EXISTS example (
--   id          SERIAL PRIMARY KEY,
--   name        TEXT         NOT NULL,
--   created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
-- );
--
-- CREATE INDEX IF NOT EXISTS idx_example_name ON example (name);
`;

const exampleDown = EMPTY ? `-- Write the inverse of UP here.\n` : `-- Example (inverse of UP, in reverse order):
-- DROP INDEX IF EXISTS idx_example_name;
-- DROP TABLE IF EXISTS example;
`;

const template = `-- =====================================================================
-- Migration : ${version}  ${slug}
-- Created   : ${now}
-- Author    : (fill in)
-- Ticket    : (fill in)
--
-- Description
-- -----------
-- Briefly explain WHAT this migration changes and WHY.
-- Call out any data migrations, long-running statements, or locks.
--
-- Safety checklist (see migrations/README.md)
--   [ ] Idempotent (uses IF NOT EXISTS / IF EXISTS where possible)
--   [ ] Backwards compatible with the currently-deployed app code
--   [ ] No destructive change to data without prior backup
--   [ ] DOWN section correctly undoes UP
--   [ ] Tested locally with  npm run migrate:status  and  npm run migrate
-- =====================================================================

-- UP
${exampleUp}

-- DOWN
${exampleDown}
`;

fs.writeFileSync(fullPath, template, 'utf8');

const rel = path.relative(REPO_ROOT, fullPath).replace(/\\\\/g, '/').replace(/\\/g, '/');
process.stdout.write(`created ${rel}\n`);
process.stdout.write(`  version : ${version}\n`);
process.stdout.write(`  name    : ${slug}\n`);
process.stdout.write(`  next    : fill in -- UP and -- DOWN, then \`npm run migrate\`\n`);
