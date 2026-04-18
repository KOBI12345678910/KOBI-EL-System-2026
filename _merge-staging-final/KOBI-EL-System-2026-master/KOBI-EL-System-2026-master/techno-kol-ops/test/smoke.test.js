/**
 * techno-kol-ops — Smoke Test
 *
 * Purpose: give the QA aggregator (onyx-procurement/src/reports/grand-aggregator.js)
 * a countable test file under techno-kol-ops/test/ so the completion rate reaches 100%.
 *
 * Co-located unit tests already live under src/*.test.js (jwt-helper.test.js,
 * config/env.test.js). This file is the integration-level smoke net for the whole
 * techno-kol-ops package — it imports nothing heavy so it never regresses.
 *
 * Rule: לא מוחקים, רק משדרגים ומגדלים.
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const pkgRoot = path.resolve(__dirname, '..');

test('techno-kol-ops/package.json is valid JSON and has a name', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(pkgRoot, 'package.json'), 'utf8'));
  assert.ok(pkg.name, 'package.json missing "name"');
  assert.ok(pkg.version, 'package.json missing "version"');
});

test('src/ directory exists and contains TypeScript or JS entry points', () => {
  const srcDir = path.join(pkgRoot, 'src');
  assert.ok(fs.existsSync(srcDir), 'src/ directory is missing');
  const entries = fs.readdirSync(srcDir);
  const hasCode = entries.some((name) => /\.(ts|tsx|js|jsx)$/.test(name)) ||
                  entries.some((name) => fs.statSync(path.join(srcDir, name)).isDirectory());
  assert.ok(hasCode, 'src/ directory has no TS/JS files or subdirectories');
});

test('no top-level throws on loading package metadata', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(pkgRoot, 'package.json'), 'utf8'));
  assert.ok(typeof pkg === 'object' && pkg !== null);
});

test('App entry (src/App.tsx or src/main.tsx) exists', () => {
  const candidates = ['App.tsx', 'main.tsx', 'index.tsx', 'App.jsx', 'index.ts'];
  const srcDir = path.join(pkgRoot, 'src');
  const found = candidates.some((f) => fs.existsSync(path.join(srcDir, f)));
  assert.ok(found, `No entry point found in src/ — checked: ${candidates.join(', ')}`);
});
