#!/usr/bin/env node
/**
 * i18n-extract.js — Agent 81
 *
 * Purpose:
 *   Scan the 4 target projects for hardcoded user-facing strings (Hebrew,
 *   English, Arabic, Russian) and emit:
 *     1. `locales/_extracted.json`  — machine-readable inventory of findings
 *     2. `locales/_extracted.md`    — human-readable report
 *     3. placeholder keys merged into each locale file (opt-in via --write)
 *
 * Heuristics it catches:
 *   - JSX text between >   < that isn't already a `{t(…)}` call
 *   - `throw new Error('…')` with literal text containing Hebrew / capital ASCII
 *   - Calls to alert() / confirm() / prompt() / window.alert() …
 *   - `console.{log,warn,error,info}('literal …')`
 *   - Literal strings assigned to `label`, `title`, `placeholder`, `message`
 *
 * IMPORTANT — this script is READ-ONLY by default.
 *   It NEVER modifies source code. It only writes under `locales/`.
 *
 * Rules:
 *   - No-delete policy: existing keys in locale files are never removed.
 *   - All new keys land under `__extracted.<project>.<hash>` so the human
 *     translator can review and promote them to a real namespace.
 *
 * Usage:
 *   node scripts/i18n-extract.js              # dry-run, prints summary
 *   node scripts/i18n-extract.js --write      # also merge placeholders into he.json
 *   node scripts/i18n-extract.js --project payroll-autonomous
 *   node scripts/i18n-extract.js --json       # JSON only, no Markdown
 *
 * Exit code: 0 always. This is an audit tool, not a gate. Use
 *   `i18n-validate.js` as the CI gate.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const ROOT = path.resolve(__dirname, '..');
const LOCALES_DIR = path.join(ROOT, 'locales');

const PROJECTS = [
  { name: 'payroll-autonomous', root: path.join(ROOT, 'payroll-autonomous') },
  { name: 'onyx-ai',            root: path.join(ROOT, 'onyx-ai') },
  { name: 'AI-Task-Manager',    root: path.join(ROOT, 'AI-Task-Manager') },
  { name: 'GPS-Connect',        root: path.join(ROOT, 'GPS-Connect') },
];

// File extensions we parse.
const EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);

// Directories to skip when walking.
const IGNORE_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', '.turbo',
  '.cache', 'coverage', 'out', '.vite', '.parcel-cache',
  'artifacts', 'generated', 'logs',
]);

// Pattern matching Hebrew, Arabic, Cyrillic letters (all user-facing non-ASCII
// scripts). Leading capital ASCII is caught by the JSX rule below.
const NON_ASCII_UI_RE = /[\u0590-\u05FF\u0600-\u06FF\u0400-\u04FF]/;

// Minimum length to consider a JSX text as user-facing (avoid matching "·").
const MIN_JSX_TEXT_LEN = 2;

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

const argv = process.argv.slice(2);
const FLAGS = {
  write: argv.includes('--write'),
  jsonOnly: argv.includes('--json'),
  projectFilter: null,
};
const pIdx = argv.indexOf('--project');
if (pIdx !== -1 && argv[pIdx + 1]) FLAGS.projectFilter = argv[pIdx + 1];

// ---------------------------------------------------------------------------
// Walking
// ---------------------------------------------------------------------------

function* walk(dir) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
  catch { return; }
  for (const e of entries) {
    if (e.name.startsWith('.')) continue;
    if (IGNORE_DIRS.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(full);
    else if (e.isFile() && EXTS.has(path.extname(e.name))) yield full;
  }
}

// ---------------------------------------------------------------------------
// Extractors
// ---------------------------------------------------------------------------

/**
 * JSX text content: matches `>Some text<` but skips anything containing `{`.
 * We trim and only keep strings with non-ASCII letters, so we don't drown in
 * English code.
 */
const JSX_TEXT_RE = />([^<>{}\n]{2,})</g;

/**
 * Literal strings inside `throw new Error('…')` / `throw new Error("…")`.
 */
const THROW_RE = /throw\s+new\s+Error\(\s*(['"`])([^'"`]*)\1/g;

/**
 * alert / confirm / prompt with a literal first arg.
 */
const ALERT_RE = /\b(?:window\.)?(alert|confirm|prompt)\(\s*(['"`])([^'"`]*)\2/g;

/**
 * console.log/warn/error/info('literal…')
 */
const CONSOLE_RE = /console\.(log|warn|error|info)\(\s*(['"`])([^'"`]*)\2/g;

/**
 * Object/prop literal: label: 'text'  title: "text"  placeholder: `text`
 */
const LABEL_PROP_RE = /\b(label|title|placeholder|message|header|subtitle|tooltip)\s*:\s*(['"`])([^'"`]*)\2/g;

function isLikelyUIString(s) {
  const trimmed = s.trim();
  if (trimmed.length < MIN_JSX_TEXT_LEN) return false;
  if (/^[\s\d.,·\-–—:;()]+$/.test(trimmed)) return false;          // only punctuation/digits
  if (NON_ASCII_UI_RE.test(trimmed)) return true;                   // Hebrew/Arabic/Cyrillic
  // ASCII heuristic: two+ alphabetic chars AND starts with capital letter.
  if (/^[A-Z][A-Za-z ,'\u2019.?!]{2,}$/.test(trimmed)) return true;
  return false;
}

function extractFromSource(source, file) {
  const findings = [];

  const pushIfUI = (kind, text, absIndex) => {
    if (!isLikelyUIString(text)) return;
    const line = source.slice(0, absIndex).split('\n').length;
    findings.push({
      file, line, kind, text: text.trim(),
    });
  };

  let m;

  JSX_TEXT_RE.lastIndex = 0;
  while ((m = JSX_TEXT_RE.exec(source)) !== null) {
    pushIfUI('jsx', m[1], m.index + 1);
  }

  THROW_RE.lastIndex = 0;
  while ((m = THROW_RE.exec(source)) !== null) {
    pushIfUI('throw', m[2], m.index);
  }

  ALERT_RE.lastIndex = 0;
  while ((m = ALERT_RE.exec(source)) !== null) {
    pushIfUI('dialog:' + m[1], m[3], m.index);
  }

  CONSOLE_RE.lastIndex = 0;
  while ((m = CONSOLE_RE.exec(source)) !== null) {
    pushIfUI('console:' + m[1], m[3], m.index);
  }

  LABEL_PROP_RE.lastIndex = 0;
  while ((m = LABEL_PROP_RE.exec(source)) !== null) {
    pushIfUI('prop:' + m[1], m[3], m.index);
  }

  return findings;
}

// ---------------------------------------------------------------------------
// Scan
// ---------------------------------------------------------------------------

function scanProject(project) {
  const out = [];
  for (const file of walk(project.root)) {
    let src;
    try { src = fs.readFileSync(file, 'utf8'); }
    catch { continue; }
    for (const f of extractFromSource(src, path.relative(ROOT, file))) {
      out.push(f);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Key generation
// ---------------------------------------------------------------------------

function shortHash(s) {
  return crypto.createHash('sha1').update(s).digest('hex').slice(0, 8);
}

function suggestKey(text) {
  // turn "שמור תלוש" → "hash_<8>" because we don't auto-transliterate Hebrew.
  return shortHash(text);
}

// ---------------------------------------------------------------------------
// Merge placeholder keys into he.json (only when --write is set)
// ---------------------------------------------------------------------------

function mergePlaceholders(allFindings) {
  const hePath = path.join(LOCALES_DIR, 'he.json');
  if (!fs.existsSync(hePath)) {
    console.warn('[extract] he.json missing — skipping merge');
    return { merged: 0 };
  }
  const he = JSON.parse(fs.readFileSync(hePath, 'utf8'));
  he.__extracted = he.__extracted || {};

  let merged = 0;
  for (const { project, findings } of allFindings) {
    he.__extracted[project] = he.__extracted[project] || {};
    const bucket = he.__extracted[project];
    const seen = new Set(Object.values(bucket));
    for (const f of findings) {
      if (seen.has(f.text)) continue;
      const key = suggestKey(f.text);
      if (!bucket[key]) {
        bucket[key] = f.text;
        merged++;
      }
    }
  }

  fs.writeFileSync(hePath, JSON.stringify(he, null, 2) + '\n');
  return { merged };
}

// ---------------------------------------------------------------------------
// Writers
// ---------------------------------------------------------------------------

function writeReports(allFindings) {
  fs.mkdirSync(LOCALES_DIR, { recursive: true });
  const jsonPath = path.join(LOCALES_DIR, '_extracted.json');
  const mdPath   = path.join(LOCALES_DIR, '_extracted.md');

  const payload = {
    generatedAt: new Date().toISOString(),
    projects: allFindings,
    totals: {
      files: new Set(allFindings.flatMap(p => p.findings.map(f => f.file))).size,
      strings: allFindings.reduce((n, p) => n + p.findings.length, 0),
    },
  };
  fs.writeFileSync(jsonPath, JSON.stringify(payload, null, 2) + '\n');

  if (!FLAGS.jsonOnly) {
    const lines = [];
    lines.push('# i18n extraction report');
    lines.push('');
    lines.push('Generated: ' + payload.generatedAt);
    lines.push('');
    lines.push('| Project | Strings | Files |');
    lines.push('|---|---:|---:|');
    for (const p of allFindings) {
      const files = new Set(p.findings.map(f => f.file)).size;
      lines.push(`| ${p.project} | ${p.findings.length} | ${files} |`);
    }
    lines.push('');
    for (const p of allFindings) {
      if (!p.findings.length) continue;
      lines.push(`## ${p.project}`);
      lines.push('');
      lines.push('| Kind | File | Line | Text |');
      lines.push('|---|---|---:|---|');
      for (const f of p.findings.slice(0, 500)) {
        const safe = f.text.replace(/\|/g, '\\|');
        lines.push(`| ${f.kind} | ${f.file} | ${f.line} | ${safe} |`);
      }
      if (p.findings.length > 500) {
        lines.push(`_(truncated — ${p.findings.length - 500} more)_`);
      }
      lines.push('');
    }
    fs.writeFileSync(mdPath, lines.join('\n'));
  }

  return { jsonPath, mdPath };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const allFindings = [];
  for (const p of PROJECTS) {
    if (FLAGS.projectFilter && p.name !== FLAGS.projectFilter) continue;
    if (!fs.existsSync(p.root)) {
      allFindings.push({ project: p.name, findings: [], missing: true });
      continue;
    }
    const findings = scanProject(p);
    allFindings.push({ project: p.name, findings });
  }

  const { jsonPath, mdPath } = writeReports(allFindings);

  console.log('[extract] wrote ' + path.relative(ROOT, jsonPath));
  if (!FLAGS.jsonOnly) console.log('[extract] wrote ' + path.relative(ROOT, mdPath));

  for (const p of allFindings) {
    const files = new Set(p.findings.map(f => f.file)).size;
    const flag = p.missing ? ' (missing)' : '';
    console.log('  ' + p.project.padEnd(22) + p.findings.length.toString().padStart(5) + ' strings  ' + files + ' files' + flag);
  }

  if (FLAGS.write) {
    const { merged } = mergePlaceholders(allFindings);
    console.log('[extract] merged ' + merged + ' placeholder keys into he.json');
  } else {
    console.log('[extract] dry-run — re-run with --write to merge placeholder keys into he.json');
  }
}

if (require.main === module) main();

module.exports = { extractFromSource, isLikelyUIString, suggestKey };
