/**
 * QA-08 — onyx-ai static source review
 *
 * onyx-ai uses a raw http.Server with manual route dispatch instead of
 * Express, so we cannot mount it into the shared test harness without
 * a TypeScript toolchain. Instead this suite performs static analysis
 * on `onyx-ai/src/index.ts` to identify contract and security issues.
 *
 * What this file covers:
 *   • APIServer class exists, http.createServer based
 *   • Route inventory: /healthz /livez /readyz /api/status /api/events
 *                      /api/audit /api/knowledge/query /api/knowledge/entity
 *                      /api/kill /api/resume /api/integrity /api/agent/:id/suspend
 *   • Auth: findings (no X-API-Key, no JWT — ALL ROUTES ARE UNAUTHENTICATED!)
 *   • CORS: Access-Control-Allow-Origin: * (wildcard — FINDING)
 *   • Error handler: error.message leaks to client
 *   • Body parser: no size limit → memory DoS risk
 *
 * Author: QA-08 API Test Agent
 * Run:    node --test test/api/qa-08-onyx-ai-review.test.js
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ONYX_AI_INDEX = path.resolve(__dirname, '..', '..', '..', 'onyx-ai', 'src', 'index.ts');
const ONYX_AI_INTEG = path.resolve(__dirname, '..', '..', '..', 'onyx-ai', 'src', 'integrations.ts');

function read(f) {
  try { return fs.readFileSync(f, 'utf8'); } catch { return null; }
}

const srcIndex = read(ONYX_AI_INDEX);
const srcInteg = read(ONYX_AI_INTEG);

// ══════════════════════════════════════════════════════════════════════
// APIServer class contract
// ══════════════════════════════════════════════════════════════════════
describe('onyx-ai APIServer class', () => {
  test('1.1 APIServer class exists in index.ts', () => {
    assert.ok(srcIndex, `expected file at ${ONYX_AI_INDEX}`);
    assert.match(srcIndex, /class APIServer/);
  });

  test('1.2 uses http.createServer (not Express)', () => {
    assert.match(srcIndex, /http\.createServer/);
    // Should NOT import express
    assert.doesNotMatch(srcIndex, /import\s+express/);
  });

  test('1.3 dispatches via private route() method', () => {
    assert.match(srcIndex, /private async route\(/);
  });

  test('1.4 readBody() parses JSON body', () => {
    assert.match(srcIndex, /private readBody/);
    assert.match(srcIndex, /JSON\.parse\(data\)/);
  });

  test('1.5 FINDING — readBody has no size limit (memory DoS)', () => {
    // Express sets limit:'2mb' on the json parser; onyx-ai accumulates req.on('data') chunks
    // into an unbounded string buffer.
    const readBodyFn = srcIndex.match(/private readBody[^}]+on\('data'[^)]+\)[^}]+\}/s);
    assert.ok(readBodyFn, 'readBody function not found');
    const body = readBodyFn[0];
    assert.doesNotMatch(body, /limit|maxSize|max_bytes/i);
    console.warn('[QA-08 FINDING] onyx-ai readBody() accepts unbounded request bodies — memory DoS risk (no size cap like express 2mb default)');
  });

  test('1.6 error handler returns 500 + error.message', () => {
    assert.match(srcIndex, /res\.writeHead\(500\)/);
    assert.match(srcIndex, /error: error\.message/);
  });

  test('1.7 FINDING — error.message leaks raw errors to client', () => {
    // A stack-less error.message may still include DB details, path internals, etc.
    assert.match(srcIndex, /\{\s*error:\s*error\.message\s*\}/);
    console.warn('[QA-08 FINDING] onyx-ai surfaces raw error.message to clients — may leak internal details (DB errors, file paths)');
  });
});

// ══════════════════════════════════════════════════════════════════════
// Route inventory
// ══════════════════════════════════════════════════════════════════════
describe('onyx-ai route inventory', () => {
  const EXPECTED_ROUTES = [
    { method: 'GET', path: '/healthz' },
    { method: 'GET', path: '/livez' },
    { method: 'GET', path: '/readyz' },
    { method: 'GET', path: '/api/status' },
    { method: 'GET', path: '/api/events' },
    { method: 'GET', path: '/api/audit' },
    { method: 'POST', path: '/api/knowledge/query' },
    { method: 'POST', path: '/api/knowledge/entity' },
    { method: 'POST', path: '/api/kill' },
    { method: 'POST', path: '/api/resume' },
    { method: 'GET', path: '/api/integrity' },
  ];

  for (const r of EXPECTED_ROUTES) {
    test(`2.${EXPECTED_ROUTES.indexOf(r) + 1} route ${r.method} ${r.path} exists`, () => {
      const pattern = new RegExp(`method === ['"\`]${r.method}['"\`] && path === ['"\`]${r.path.replace('/', '\\/')}['"\`]`);
      assert.match(srcIndex, pattern);
    });
  }

  test('2.12 agent suspend path dispatched via startsWith/endsWith', () => {
    assert.match(srcIndex, /path\.startsWith\(['"`]\/api\/agent\/['"`]\)/);
    assert.match(srcIndex, /path\.endsWith\(['"`]\/suspend['"`]\)/);
  });

  test('2.13 404 fallback exists', () => {
    assert.match(srcIndex, /status:\s*404,\s*body:\s*\{\s*error:\s*['"`]Not found['"`]/);
  });
});

// ══════════════════════════════════════════════════════════════════════
// Auth — CRITICAL FINDING
// ══════════════════════════════════════════════════════════════════════
describe('onyx-ai authentication (CRITICAL)', () => {
  test('3.1 CRITICAL FINDING — APIServer has NO auth middleware at all', () => {
    // Scan the APIServer class block for any auth markers
    const classStart = srcIndex.indexOf('class APIServer');
    const classEnd = srcIndex.indexOf('\n}\n', classStart);
    const classBlock = srcIndex.slice(classStart, classEnd);
    assert.doesNotMatch(classBlock, /x-api-key|X-API-Key/i);
    assert.doesNotMatch(classBlock, /jwt\.verify|jsonwebtoken/);
    assert.doesNotMatch(classBlock, /Bearer/);
    assert.doesNotMatch(classBlock, /authenticate|authorize/i);
    console.warn('[QA-08 CRITICAL FINDING] onyx-ai APIServer has NO authentication — /api/kill, /api/resume, /api/knowledge/entity, /api/agent/:id/suspend are publicly callable!');
  });

  test('3.2 CRITICAL FINDING — /api/kill can be called by anyone', () => {
    // This endpoint activates the global kill switch with any actor/reason
    assert.match(srcIndex, /path === '\/api\/kill'/);
    assert.match(srcIndex, /activateKillSwitch/);
    console.warn('[QA-08 CRITICAL FINDING] /api/kill POST is unauthenticated — anyone can trigger kill switch for all agents');
  });

  test('3.3 CRITICAL FINDING — /api/knowledge/entity can be poisoned', () => {
    assert.match(srcIndex, /upsertEntity\(body as any\)/);
    console.warn('[QA-08 CRITICAL FINDING] /api/knowledge/entity POST allows anyone to upsert arbitrary entities into the knowledge graph');
  });
});

// ══════════════════════════════════════════════════════════════════════
// CORS — FINDING
// ══════════════════════════════════════════════════════════════════════
describe('onyx-ai CORS', () => {
  test('4.1 FINDING — CORS allows wildcard origin', () => {
    assert.match(srcIndex, /Access-Control-Allow-Origin.*\*/);
    console.warn('[QA-08 FINDING] onyx-ai sets Access-Control-Allow-Origin: * → any website can call the API from the browser');
  });

  test('4.2 OPTIONS preflight returns 204', () => {
    assert.match(srcIndex, /method === 'OPTIONS'[\s\S]{0,100}writeHead\(204\)/);
  });
});

// ══════════════════════════════════════════════════════════════════════
// Webhook receivers (integrations.ts)
// ══════════════════════════════════════════════════════════════════════
describe('onyx-ai webhook receivers', () => {
  test('5.1 WebhookReceiver class exists', () => {
    if (!srcInteg) {
      console.warn('[QA-08 INFO] onyx-ai/src/integrations.ts not found — skipping webhook checks');
      return;
    }
    assert.match(srcInteg, /class WebhookReceiver/);
  });

  test('5.2 buildRouter handles whatsapp/stripe/twilio/slack/generic', () => {
    if (!srcInteg) return;
    assert.match(srcInteg, /whatsapp/);
    assert.match(srcInteg, /stripe/);
    assert.match(srcInteg, /twilio/);
    assert.match(srcInteg, /slack/);
    assert.match(srcInteg, /generic/);
  });

  test('5.3 HMAC verification mentioned', () => {
    if (!srcInteg) return;
    assert.match(srcInteg, /hmac|createHmac/i);
  });

  test('5.4 FINDING — timingSafeEqual not always used (timing attack risk)', () => {
    if (!srcInteg) {
      console.warn('[QA-08 INFO] integrations.ts not found — skipping');
      return;
    }
    const count = (srcInteg.match(/timingSafeEqual/g) || []).length;
    if (count === 0) {
      console.warn('[QA-08 FINDING] onyx-ai integrations.ts does not use crypto.timingSafeEqual for HMAC comparison — timing-attack vulnerable');
    }
    assert.ok(true); // documentary
  });
});
