#!/usr/bin/env node
/**
 * i18n-validate.js — Agent 81
 *
 * Hard CI gate for locale completeness.
 *
 * Checks, in this order:
 *   1. Every file `locales/*.json` is parseable JSON.
 *   2. Every key in `he.json` exists in `en.json`, `ar.json`, `ru.json`.
 *      (he is the source of truth. No key may be missing in any other locale.)
 *   3. Placeholders in values line up: if he has "{count}" then the same
 *      placeholder exists in en/ar/ru for that key.
 *   4. RTL markers: any value that contains LRE/RLE/PDF or embedded LTR
 *      runs inside an `_rtl` locale must have matching `\u200F` (RLM)
 *      markers on both sides of the LTR run (best-effort heuristic).
 *   5. Orphans: keys present in a locale but never referenced in the
 *      repo (basic grep over `t('key')`, `t("key")`, `i18n.t(…)`,
 *      `$t(…)` inside `.{ts,tsx,js,jsx,vue}` files). Orphans are
 *      reported as WARNINGS — they are never auto-deleted (no-delete
 *      policy).
 *   6. Missing: hardcoded Hebrew strings in code that don't have any
 *      matching value in `he.json`. This is a WARNING (the code may not
 *      yet be wired through `t()`), not an error.
 *
 * Exit code: 0 on pass, 1 on any failure.
 *
 * Usage:
 *   node scripts/i18n-validate.js               # full check
 *   node scripts/i18n-validate.js --strict      # orphans become errors
 *   node scripts/i18n-validate.js --format=json # machine-readable output
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const LOCALES_DIR = path.join(ROOT, 'locales');
const DEFAULT_LOCALE = 'he';
const REQUIRED_LOCALES = ['he', 'en', 'ar', 'ru'];

const PROJECTS = ['payroll-autonomous', 'onyx-ai', 'AI-Task-Manager', 'GPS-Connect'];

const IGNORE_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', '.turbo', '.cache',
  'coverage', 'out', '.vite', 'artifacts', 'generated', 'logs', 'locales',
]);
const EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.vue']);

const argv = process.argv.slice(2);
const STRICT = argv.includes('--strict');
const FORMAT = (() => {
  const f = argv.find(a => a.startsWith('--format='));
  return f ? f.split('=')[1] : 'text';
})();

// ---------------------------------------------------------------------------
// Key helpers
// ---------------------------------------------------------------------------

function flatten(obj, prefix = '', out = {}) {
  for (const [k, v] of Object.entries(obj || {})) {
    if (k.startsWith('__')) continue;                 // skip __meta / __extracted
    const key = prefix ? prefix + '.' + k : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, key, out);
    else out[key] = v;
  }
  return out;
}

function placeholdersOf(value) {
  if (typeof value !== 'string') return [];
  return Array.from(value.matchAll(/\{(\w+)\}/g)).map(m => m[1]).sort();
}

function arraysEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

// ---------------------------------------------------------------------------
// RTL / bidi heuristic
// ---------------------------------------------------------------------------

const RLM = '\u200F';
const LRM = '\u200E';
const NON_ASCII_RTL_RE = /[\u0590-\u05FF\u0600-\u06FF]/;

function hasLikelyBidiIssue(value) {
  if (typeof value !== 'string') return false;
  if (!NON_ASCII_RTL_RE.test(value)) return false;
  // Look for Latin ASCII run embedded inside RTL text without any
  // neighboring RLM — this is the classic "broken bidi" pattern.
  const LATIN_RUN = /[A-Za-z][A-Za-z0-9 _./\\-]{2,}/;
  const m = LATIN_RUN.exec(value);
  if (!m) return false;
  const before = value[m.index - 1];
  const after = value[m.index + m[0].length];
  if (before === RLM || after === RLM || before === LRM || after === LRM) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Code scanning (for orphans + missing)
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

// match t('key'), t("key"), i18n.t('key'), $t('key'), useT('key')
const T_CALL_RE = /(?:\b[it]18n\.t|\$t|\bt|\buseT|\btranslate)\(\s*(['"`])([\w.\-:]+)\1/g;

function collectReferencedKeys() {
  const referenced = new Set();
  for (const project of PROJECTS) {
    const root = path.join(ROOT, project);
    if (!fs.existsSync(root)) continue;
    for (const file of walk(root)) {
      let src;
      try { src = fs.readFileSync(file, 'utf8'); }
      catch { continue; }
      T_CALL_RE.lastIndex = 0;
      let m;
      while ((m = T_CALL_RE.exec(src)) !== null) referenced.add(m[2]);
    }
  }
  return referenced;
}

function collectHardcodedHebrewStrings() {
  // Returns a Set of trimmed Hebrew strings found in JSX / throw / alert.
  const set = new Set();
  const HE_RE = /[\u0590-\u05FF]/;
  for (const project of PROJECTS) {
    const root = path.join(ROOT, project);
    if (!fs.existsSync(root)) continue;
    for (const file of walk(root)) {
      let src;
      try { src = fs.readFileSync(file, 'utf8'); }
      catch { continue; }
      // JSX text >…<
      for (const m of src.matchAll(/>([^<>{}\n]{2,})</g)) {
        const t = m[1].trim();
        if (HE_RE.test(t)) set.add(t);
      }
      // quoted string literals containing Hebrew
      for (const m of src.matchAll(/(['"`])([^'"`\n]{2,}?)\1/g)) {
        const t = m[2].trim();
        if (HE_RE.test(t)) set.add(t);
      }
    }
  }
  return set;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function readLocale(name) {
  const file = path.join(LOCALES_DIR, name + '.json');
  if (!fs.existsSync(file)) return { ok: false, error: 'missing file ' + file };
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: 'parse error in ' + file + ': ' + e.message };
  }
}

function main() {
  const errors = [];
  const warnings = [];

  // (1) Load all locales.
  const locales = {};
  for (const l of REQUIRED_LOCALES) {
    const r = readLocale(l);
    if (!r.ok) { errors.push(r.error); continue; }
    locales[l] = r.data;
  }

  if (!locales[DEFAULT_LOCALE]) {
    errors.push('default locale ' + DEFAULT_LOCALE + ' missing — cannot continue');
    return report(errors, warnings);
  }

  const flat = {};
  for (const l of Object.keys(locales)) flat[l] = flatten(locales[l]);

  const heKeys = Object.keys(flat[DEFAULT_LOCALE]);

  // (2) Every he key must exist in other locales.
  for (const l of REQUIRED_LOCALES) {
    if (l === DEFAULT_LOCALE || !flat[l]) continue;
    const missing = heKeys.filter(k => !(k in flat[l]));
    for (const k of missing) {
      errors.push(`[missing-in-${l}] key ${k} exists in he.json but not in ${l}.json`);
    }
    // keys in l but not in he — this is a no-delete warning (do not remove
    // them; they may be locale-specific overrides).
    const extra = Object.keys(flat[l]).filter(k => !(k in flat[DEFAULT_LOCALE]));
    for (const k of extra) {
      warnings.push(`[extra-in-${l}] key ${k} exists in ${l}.json but not in he.json (keeping — no-delete policy)`);
    }
  }

  // (3) Placeholder parity.
  for (const k of heKeys) {
    const basePH = placeholdersOf(flat[DEFAULT_LOCALE][k]);
    for (const l of REQUIRED_LOCALES) {
      if (l === DEFAULT_LOCALE || !flat[l] || !(k in flat[l])) continue;
      const ph = placeholdersOf(flat[l][k]);
      if (!arraysEqual(basePH, ph)) {
        errors.push(`[placeholder-mismatch] ${l}.${k} has {${ph.join(',')}}, he has {${basePH.join(',')}}`);
      }
    }
  }

  // (4) Bidi check on he + ar locales.
  for (const l of ['he', 'ar']) {
    if (!flat[l]) continue;
    for (const [k, v] of Object.entries(flat[l])) {
      if (hasLikelyBidiIssue(v)) {
        warnings.push(`[bidi] ${l}.${k} has embedded Latin run without RLM marker: "${v}"`);
      }
    }
  }

  // (5) Orphans (keys in locale but never referenced via t()).
  const referenced = collectReferencedKeys();
  const orphanWhitelist = new Set([
    '__meta', // namespace prefix handled by flatten skipping
  ]);
  if (referenced.size > 0) {
    // We only flag namespaces the project actually uses — if NO t() calls
    // exist in the code yet (current state), orphan detection is silenced
    // to avoid spam.
    for (const k of heKeys) {
      if (orphanWhitelist.has(k.split('.')[0])) continue;
      if (!referenced.has(k)) {
        const msg = `[orphan] ${k} never referenced via t(...) — candidate for cleanup (not deleted)`;
        if (STRICT) errors.push(msg); else warnings.push(msg);
      }
    }
  } else {
    warnings.push('[orphans] no t() calls found in the 4 projects yet — skipping orphan detection');
  }

  // (6) Missing — hardcoded he strings in code that have no he.json value.
  const heValues = new Set(Object.values(flat[DEFAULT_LOCALE]).filter(v => typeof v === 'string'));
  const hardcoded = collectHardcodedHebrewStrings();
  let missingCount = 0;
  for (const s of hardcoded) {
    // ignore short punctuation-heavy strings
    if (s.length < 3) continue;
    if (/^[·\-–—.,()|/]+$/.test(s)) continue;
    if (heValues.has(s)) continue;
    missingCount++;
  }
  if (missingCount > 0) {
    warnings.push(`[missing-from-locale] ${missingCount} hardcoded Hebrew strings in code have no matching value in he.json — run scripts/i18n-extract.js --write to stub placeholders`);
  }

  return report(errors, warnings);
}

function report(errors, warnings) {
  if (FORMAT === 'json') {
    console.log(JSON.stringify({
      ok: errors.length === 0,
      errors,
      warnings,
    }, null, 2));
  } else {
    console.log('i18n-validate — ' + new Date().toISOString());
    console.log('');
    if (errors.length === 0) {
      console.log('  PASS — no errors');
    } else {
      console.log('  FAIL — ' + errors.length + ' error(s):');
      for (const e of errors) console.log('    ERR ' + e);
    }
    console.log('  ' + warnings.length + ' warning(s):');
    for (const w of warnings.slice(0, 50)) console.log('    WRN ' + w);
    if (warnings.length > 50) console.log('    … (+' + (warnings.length - 50) + ' more)');
  }
  process.exit(errors.length === 0 ? 0 : 1);
}

if (require.main === module) main();

module.exports = { flatten, placeholdersOf, hasLikelyBidiIssue };
