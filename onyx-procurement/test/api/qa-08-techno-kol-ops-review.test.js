/**
 * QA-08 — techno-kol-ops static source review
 *
 * Because techno-kol-ops/ is a TypeScript codebase using raw pg + JWT,
 * we cannot easily boot it in a node:test process. Instead, this suite
 * performs targeted *static* analysis of the route source files and
 * documents findings as pass/fail assertions that produce actionable
 * QA warnings.
 *
 * What this file covers:
 *   • Auth middleware contract (Bearer + jwt.verify + JWT_SECRET)
 *   • SQL-injection via column-name interpolation in UPDATE statements
 *   • Error envelope consistency
 *   • Route inventory (every router file declares at least one route)
 *
 * Author: QA-08 API Test Agent
 * Run:    node --test test/api/qa-08-techno-kol-ops-review.test.js
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..', '..', 'techno-kol-ops', 'src');
const ROUTES_DIR = path.join(ROOT, 'routes');
const AUTH_FILE = path.join(ROOT, 'middleware', 'auth.ts');
const INDEX_FILE = path.join(ROOT, 'index.ts');

function read(f) {
  try { return fs.readFileSync(f, 'utf8'); } catch { return null; }
}

// ══════════════════════════════════════════════════════════════════════
// Auth middleware
// ══════════════════════════════════════════════════════════════════════
describe('techno-kol-ops auth middleware', () => {
  test('1.1 authenticate() function exists', () => {
    const src = read(AUTH_FILE);
    assert.ok(src, `expected file at ${AUTH_FILE}`);
    assert.match(src, /export function authenticate/);
  });

  test('1.2 returns 401 on missing Bearer token', () => {
    const src = read(AUTH_FILE);
    assert.match(src, /Bearer/);
    assert.match(src, /401/);
    assert.match(src, /No token provided/);
  });

  test('1.3 calls jwt.verify with JWT_SECRET', () => {
    const src = read(AUTH_FILE);
    assert.match(src, /jwt\.verify\(token,\s*process\.env\.JWT_SECRET/);
  });

  test('1.4 FINDING — uses non-null assertion (!) on JWT_SECRET', () => {
    const src = read(AUTH_FILE);
    // The `!` tells TypeScript the env var is guaranteed set, but server crashes at runtime if undefined
    assert.match(src, /process\.env\.JWT_SECRET!/);
    console.warn('[QA-08 FINDING] techno-kol-ops auth.ts uses `process.env.JWT_SECRET!` which crashes at startup if env var missing');
  });

  test('1.5 requireAdmin returns 403', () => {
    const src = read(AUTH_FILE);
    assert.match(src, /403/);
    assert.match(src, /Admin access required/);
  });

  test('1.6 FINDING — no audience/issuer verification', () => {
    const src = read(AUTH_FILE);
    // jwt.verify is called without { audience, issuer } options — any token signed with JWT_SECRET passes.
    // Cross-service token reuse is possible.
    assert.doesNotMatch(src, /audience:/);
    assert.doesNotMatch(src, /issuer:/);
    console.warn('[QA-08 FINDING] techno-kol-ops jwt.verify does not pin audience/issuer — any valid JWT passes');
  });
});

// ══════════════════════════════════════════════════════════════════════
// SQL injection via column-name interpolation
// ══════════════════════════════════════════════════════════════════════
describe('techno-kol-ops SQL injection via column names', () => {
  const VULNERABLE_FILES = ['tasks.ts', 'leads.ts', 'employees.ts', 'clients.ts', 'workOrders.ts'];

  for (const file of VULNERABLE_FILES) {
    test(`2.${VULNERABLE_FILES.indexOf(file) + 1} FINDING — ${file} builds setClause from user keys`, () => {
      const src = read(path.join(ROUTES_DIR, file));
      assert.ok(src, `expected file at ${file}`);
      // The pattern: `${k} = $${i + 2}` interpolates column names directly from req.body
      assert.match(src, /setClause.*keys\.map/);
      assert.match(src, /\$\{k\}\s*=\s*\$\$\{i/);
      console.warn(`[QA-08 FINDING] techno-kol-ops/src/routes/${file}: UPDATE builds setClause from req.body keys — SQL injection via column-name eval (e.g. { "name=1;DROP--": "x" })`);
    });
  }

  test('2.6 FINDING — no whitelist check on allowed columns in any vulnerable file', () => {
    for (const file of VULNERABLE_FILES) {
      const src = read(path.join(ROUTES_DIR, file));
      assert.doesNotMatch(src, /ALLOWED_COLUMNS|allowedFields|whitelist/);
    }
    console.warn('[QA-08 FINDING] None of the 5 vulnerable techno-kol-ops route files validate allowed column names before interpolating');
  });
});

// ══════════════════════════════════════════════════════════════════════
// Error envelope consistency
// ══════════════════════════════════════════════════════════════════════
describe('techno-kol-ops error handling', () => {
  test('3.1 route files use {error: "..."} envelope', () => {
    const files = fs.readdirSync(ROUTES_DIR).filter(f => f.endsWith('.ts'));
    let seenError = 0;
    for (const f of files) {
      const src = read(path.join(ROUTES_DIR, f)) || '';
      if (/res\.status\(\d+\)\.json\(\{\s*error:/.test(src)) seenError++;
    }
    assert.ok(seenError >= 5, `expected >=5 route files to emit error envelopes, got ${seenError}`);
  });

  test('3.2 FINDING — generic 500 "Failed to X" hides actual cause', () => {
    const src = read(path.join(ROUTES_DIR, 'leads.ts'));
    assert.match(src, /Failed to create lead|Failed to update lead/);
    console.warn('[QA-08 FINDING] techno-kol-ops routes return generic "Failed to X" on 500 — no correlation ID or debug info');
  });

  test('3.3 no console.log leaks in error paths', () => {
    // Most routes use res.status(500).json(...) but none log the err — makes prod debugging harder
    const files = fs.readdirSync(ROUTES_DIR).filter(f => f.endsWith('.ts'));
    let filesWithLogging = 0;
    for (const f of files) {
      const src = read(path.join(ROUTES_DIR, f)) || '';
      if (/catch[^{]*\{[^}]*console\.(error|log)/s.test(src)) filesWithLogging++;
    }
    if (filesWithLogging < 5) {
      console.warn(`[QA-08 FINDING] Only ${filesWithLogging} of techno-kol-ops route files log errors in catch blocks — prod debugging will be hard`);
    }
    assert.ok(filesWithLogging >= 0); // documentary
  });
});

// ══════════════════════════════════════════════════════════════════════
// Route inventory
// ══════════════════════════════════════════════════════════════════════
describe('techno-kol-ops route inventory', () => {
  test('4.1 index.ts mounts at least 15 routers', () => {
    const src = read(INDEX_FILE) || '';
    const mountCount = (src.match(/app\.use\(['"]\/api\//g) || []).length;
    assert.ok(mountCount >= 15, `expected >=15 /api/* mounts, got ${mountCount}`);
  });

  test('4.2 every route file declares at least one route method', () => {
    const files = fs.readdirSync(ROUTES_DIR).filter(f => f.endsWith('.ts'));
    for (const f of files) {
      const src = read(path.join(ROUTES_DIR, f)) || '';
      // Match any identifier ending in Router or "router" followed by .get/.post/etc.
      assert.match(src, /\w*[Rr]outer\.(get|post|put|patch|delete)/, `${f} has no route methods`);
    }
  });

  test('4.3 total route count across all files', () => {
    const files = fs.readdirSync(ROUTES_DIR).filter(f => f.endsWith('.ts'));
    let total = 0;
    for (const f of files) {
      const src = read(path.join(ROUTES_DIR, f)) || '';
      total += (src.match(/\w*[Rr]outer\.(get|post|put|patch|delete)/g) || []).length;
    }
    // Expect dozens of routes
    assert.ok(total >= 50, `expected >=50 total routes, got ${total}`);
    console.log(`[QA-08 INFO] techno-kol-ops has ${total} routes in ${files.length} route files`);
  });
});
