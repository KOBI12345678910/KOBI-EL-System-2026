/**
 * @techno-kol/shared-tax — VAT smoke test
 *
 * Verifies the compiled `dist/vat.js` exposes the public surface and that
 * Israeli VAT rate logic returns 0.18 for 2026 dates and 0.17 for 2025 dates.
 *
 * Runs via `node --test`. No vitest dependency added — keeps the package
 * lightweight (it currently only ships TS source + compiled JS).
 *
 * Rule: לא מוחקים, רק משדרגים ומגדלים.
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const distVatPath = path.resolve(__dirname, '..', 'dist', 'vat.js');

test('dist/vat.js exists (package is built)', () => {
  assert.ok(
    fs.existsSync(distVatPath),
    `Expected compiled output at ${distVatPath}. Run "npm run build" first.`,
  );
});

test('getVatRate returns 0.18 for current date (2026 era)', () => {
  if (!fs.existsSync(distVatPath)) return; // skip if not built
  const vat = require(distVatPath);
  assert.equal(vat.getVatRate(new Date('2026-04-29')), 0.18);
});

test('getVatRate returns 0.17 for a 2025 invoice date', () => {
  if (!fs.existsSync(distVatPath)) return;
  const vat = require(distVatPath);
  assert.equal(vat.getVatRate(new Date('2025-06-15')), 0.17);
});

test('calculateVat(1000) at 2026 rate yields 180 VAT / 1180 gross', () => {
  if (!fs.existsSync(distVatPath)) return;
  const vat = require(distVatPath);
  const b = vat.calculateVat(1000, undefined, { date: new Date('2026-04-29') });
  assert.equal(b.net, 1000);
  assert.equal(b.vat, 180);
  assert.equal(b.gross, 1180);
  assert.equal(b.rate, 0.18);
  assert.equal(b.category, 'standard');
});

test('reverseVat(1180) at 2026 rate yields net=1000 / vat=180', () => {
  if (!fs.existsSync(distVatPath)) return;
  const vat = require(distVatPath);
  const b = vat.reverseVat(1180, undefined, { date: new Date('2026-04-29') });
  assert.equal(b.net, 1000);
  assert.equal(b.vat, 180);
  assert.equal(b.gross, 1180);
});

test('VAT_RATE_CURRENT constant is 0.18', () => {
  if (!fs.existsSync(distVatPath)) return;
  const vat = require(distVatPath);
  assert.equal(vat.VAT_RATE_CURRENT, 0.18);
});
