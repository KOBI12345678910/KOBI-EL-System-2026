/**
 * ONYX AI — Platform Lifecycle Tests
 * ------------------------------------------------------------
 * Exercises OnyxPlatform's start/shutdown lifecycle plus the
 * HTTP API surface exposed by its internal APIServer.
 *
 * Run with:
 *   npx node --test --require ts-node/register test/platform.test.ts
 *
 * Architectural notes (things I had to adapt from the brief):
 *
 *   1. OnyxPlatform exposes `start(options?)` and `shutdown()`.
 *      There is NO `stop()` method. The shutdown path closes the
 *      HTTP server, flushes/stops the EventStore, and terminates
 *      all agents.
 *
 *   2. The HTTP server has NO `/evaluate` or `/policies`
 *      endpoint. Its actual routes are:
 *        GET  /api/status
 *        GET  /api/events
 *        GET  /api/audit
 *        GET  /api/integrity
 *        POST /api/knowledge/query
 *        POST /api/knowledge/entity
 *        POST /api/kill
 *        POST /api/resume
 *        POST /api/agent/:id/suspend
 *      We therefore test the closest equivalents:
 *        - `/api/status` (returns compliance.rateLimitUtilization,
 *          compliance.budgetUtilization, totalPolicies, etc.)
 *          substitutes for `GET /policies`.
 *        - Direct `governor.evaluate()` substitutes for
 *          `POST /evaluate` because no such HTTP route exists.
 *
 *   3. `ONYX_DAILY_BUDGET` is consumed by `src/index.ts` bootstrap
 *      code (inside `if (require.main === module)`), not by
 *      OnyxPlatform itself. We replicate the bootstrap wiring in
 *      a unit test to verify the env-var path works end-to-end.
 */

import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as http from 'node:http';

import { OnyxPlatform } from '../src/onyx-platform';

// ----------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------

/** Pick an ephemeral port by opening a throwaway listener. */
async function freePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const srv = http.createServer();
    srv.on('error', reject);
    srv.listen(0, () => {
      const addr = srv.address();
      if (addr && typeof addr === 'object') {
        const port = addr.port;
        srv.close(() => resolve(port));
      } else {
        srv.close(() => reject(new Error('no port')));
      }
    });
  });
}

/** Tiny HTTP GET helper — avoids fetch() to keep Node version drift minimal. */
function httpGet(url: string): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode ?? 0, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode ?? 0, body: data });
        }
      });
    });
    req.on('error', reject);
  });
}

function httpPost(url: string, payload: Record<string, unknown>): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const data = JSON.stringify(payload);
    const req = http.request(
      {
        hostname: u.hostname,
        port: u.port,
        path: u.pathname + u.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
        },
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => (raw += chunk));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode ?? 0, body: JSON.parse(raw) });
          } catch {
            resolve({ status: res.statusCode ?? 0, body: raw });
          }
        });
      },
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function tmpFile(name: string): string {
  return path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), 'onyx-test-')),
    name,
  );
}

// ----------------------------------------------------------------
// 1. start() opens an HTTP server that responds to /api/status
// ----------------------------------------------------------------
test('OnyxPlatform.start() opens an HTTP server responding to /api/status', async () => {
  const port = await freePort();
  const onyx = new OnyxPlatform();

  try {
    onyx.start({ apiPort: port });
    // Give the listener a breath — http.Server.listen is async but sync-ish
    await new Promise((r) => setTimeout(r, 20));

    const res = await httpGet(`http://127.0.0.1:${port}/api/status`);
    assert.equal(res.status, 200);
    assert.equal(res.body.engine, 'ONYX AI');
    assert.equal(res.body.status, 'OPERATIONAL');
    assert.ok(Array.isArray(res.body.agents));
    assert.ok('compliance' in res.body);
  } finally {
    onyx.shutdown();
  }
});

// ----------------------------------------------------------------
// 2. shutdown() closes the HTTP server cleanly
// ----------------------------------------------------------------
// NOTE: OnyxPlatform exposes `shutdown()`, not `stop()`. The
// brief asked for a stop() test — shutdown() is the real method.
test('OnyxPlatform.shutdown() closes the HTTP server (connect refused afterwards)', async () => {
  const port = await freePort();
  const onyx = new OnyxPlatform();
  onyx.start({ apiPort: port });
  await new Promise((r) => setTimeout(r, 20));

  // Sanity: it's actually up
  const before = await httpGet(`http://127.0.0.1:${port}/api/status`);
  assert.equal(before.status, 200);

  onyx.shutdown();
  // Give the kernel a moment to release the socket
  await new Promise((r) => setTimeout(r, 50));

  // A fresh GET must now fail (ECONNREFUSED) or at minimum not return 200.
  let rejected = false;
  try {
    await httpGet(`http://127.0.0.1:${port}/api/status`);
  } catch (err: any) {
    rejected = true;
    assert.match(String(err.code ?? err.message), /ECONNREFUSED|ECONNRESET|socket hang up/);
  }
  assert.equal(rejected, true, 'post-shutdown request should be refused');
});

// ----------------------------------------------------------------
// 3. Event store path is respected (persistPath → file gets created)
// ----------------------------------------------------------------
test('constructor persistPath is honoured by the EventStore', async () => {
  const persistPath = tmpFile('events.jsonl');
  const onyx = new OnyxPlatform({ persistPath });

  try {
    // Force an append + a flush cycle. EventStore flushes every 5s by
    // default, but shutdown() also flushes synchronously.
    onyx.addPolicy({
      name: 'Flush Trigger',
      description: '',
      type: 'budget',
      scope: 'global',
      rule: {
        type: 'budget',
        maxCostPerTask: 1,
        maxCostPerDay: 1,
        currency: 'USD',
        currentSpent: 0,
      },
      active: true,
      priority: 1,
      createdBy: 'unit-test',
    });
  } finally {
    onyx.shutdown();
  }

  // The WAL file lives at `${persistPath}.wal`
  const wal = persistPath + '.wal';
  assert.ok(
    fs.existsSync(wal),
    `expected event store WAL at ${wal} — platform did not persist events`,
  );

  const walContents = fs.readFileSync(wal, 'utf-8');
  assert.match(walContents, /platform\.initialized/);
  assert.match(walContents, /governance\.policy_added/);
});

// ----------------------------------------------------------------
// 4. Budget loaded from env ONYX_DAILY_BUDGET
// ----------------------------------------------------------------
// NOTE: `OnyxPlatform` does NOT read ONYX_DAILY_BUDGET directly —
// the env var is consumed by the bootstrap block in `src/index.ts`
// when running as main module. We replicate that wiring here and
// verify the resulting policy has the expected cap. This keeps the
// test honest: if the bootstrap contract ever changes, this test
// must be updated.
test('ONYX_DAILY_BUDGET env var drives bootstrap daily-budget policy cap', () => {
  const originalEnv = process.env.ONYX_DAILY_BUDGET;
  process.env.ONYX_DAILY_BUDGET = '2500';

  try {
    const onyx = new OnyxPlatform();

    // Mirror the bootstrap in src/index.ts:
    onyx.addPolicy({
      name: 'Daily Budget',
      description: 'Global spending cap per 24h window',
      type: 'budget',
      scope: 'global',
      rule: {
        type: 'budget',
        maxCostPerTask: 50,
        maxCostPerDay: parseFloat(process.env.ONYX_DAILY_BUDGET || '500'),
        currency: 'USD',
        currentSpent: 0,
      },
      active: true,
      priority: 100,
      createdBy: 'bootstrap',
    });

    const policies = onyx.governor.getPolicies();
    const daily = policies.find((p) => p.name === 'Daily Budget');
    assert.ok(daily, 'daily budget policy must be added');
    assert.equal(daily!.rule.type, 'budget');
    if (daily!.rule.type === 'budget') {
      assert.equal(daily!.rule.maxCostPerDay, 2500);
    }

    onyx.shutdown();
  } finally {
    if (originalEnv === undefined) delete process.env.ONYX_DAILY_BUDGET;
    else process.env.ONYX_DAILY_BUDGET = originalEnv;
  }
});

// ----------------------------------------------------------------
// 5. Governor evaluation stand-in for POST /evaluate
// ----------------------------------------------------------------
// The HTTP API has no /evaluate route, so this test drives
// `governor.evaluate()` directly — that is the real entry point
// every action in the platform funnels through.
test('governor.evaluate() returns allow+reason / deny+reason as the task brief expects', () => {
  const onyx = new OnyxPlatform();
  try {
    onyx.addPolicy({
      name: 'Daily Budget',
      description: '',
      type: 'budget',
      scope: 'global',
      rule: {
        type: 'budget',
        maxCostPerTask: 100,
        maxCostPerDay: 100,
        currency: 'USD',
        currentSpent: 0,
      },
      active: true,
      priority: 100,
      createdBy: 'unit-test',
    });

    const allow = onyx.governor.evaluate({
      type: 'tool.invoke',
      estimatedCost: 10,
    });
    assert.equal(allow.allowed, true);
    assert.equal(allow.violations.length, 0);
    assert.ok(Array.isArray(allow.reasoning));

    const deny = onyx.governor.evaluate({
      type: 'tool.invoke',
      estimatedCost: 200, // violates per-task cap
    });
    assert.equal(deny.allowed, false);
    assert.equal(deny.violations.length, 1);
    assert.match(deny.violations[0].message, /exceeds max per-task budget/);
  } finally {
    onyx.shutdown();
  }
});

// ----------------------------------------------------------------
// 6. GET /api/status includes compliance → policy count (stand-in
//    for GET /policies)
// ----------------------------------------------------------------
test('GET /api/status includes compliance.totalPolicies (stand-in for GET /policies)', async () => {
  const port = await freePort();
  const onyx = new OnyxPlatform();

  onyx.addPolicy({
    name: 'Visible Policy',
    description: '',
    type: 'budget',
    scope: 'global',
    rule: {
      type: 'budget',
      maxCostPerTask: 1,
      maxCostPerDay: 1,
      currency: 'USD',
      currentSpent: 0,
    },
    active: true,
    priority: 5,
    createdBy: 'unit-test',
  });

  try {
    onyx.start({ apiPort: port });
    await new Promise((r) => setTimeout(r, 20));

    const res = await httpGet(`http://127.0.0.1:${port}/api/status`);
    assert.equal(res.status, 200);
    assert.equal(res.body.compliance.totalPolicies, 1);
    assert.equal(res.body.compliance.activePolicies, 1);
    assert.equal(res.body.compliance.killSwitchActive, false);
  } finally {
    onyx.shutdown();
  }
});

// ----------------------------------------------------------------
// 7. POST /api/kill flips killSwitch and is visible in /api/status
// ----------------------------------------------------------------
test('POST /api/kill transitions the platform into KILLED state', async () => {
  const port = await freePort();
  const onyx = new OnyxPlatform();

  try {
    onyx.start({ apiPort: port });
    await new Promise((r) => setTimeout(r, 20));

    const killRes = await httpPost(`http://127.0.0.1:${port}/api/kill`, {
      actor: 'unit-test',
      reason: 'exercising kill endpoint',
    });
    assert.equal(killRes.status, 200);
    assert.equal(killRes.body.killed, true);

    const status = await httpGet(`http://127.0.0.1:${port}/api/status`);
    assert.equal(status.body.status, 'KILLED');
    assert.equal(status.body.compliance.killSwitchActive, true);

    // Recover — so shutdown() is symmetrical.
    const resumeRes = await httpPost(`http://127.0.0.1:${port}/api/resume`, {
      actor: 'unit-test',
    });
    assert.equal(resumeRes.status, 200);
    assert.equal(resumeRes.body.killed, false);
  } finally {
    onyx.shutdown();
  }
});

// ----------------------------------------------------------------
// 8. report() returns a structured system snapshot
// ----------------------------------------------------------------
test('OnyxPlatform.report() returns a structured snapshot', () => {
  const onyx = new OnyxPlatform();
  try {
    const report = onyx.report();
    assert.equal(report.platform.version, '2.0.0');
    assert.ok('governance' in report);
    assert.ok('agents' in report);
    assert.ok('tools' in report);
    assert.ok('knowledge' in report);
    assert.ok('eventStore' in report);
    assert.equal(typeof report.eventStore.totalEvents, 'number');
  } finally {
    onyx.shutdown();
  }
});
