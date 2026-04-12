/**
 * QA-15 — SCENARIO 4 — Dashboard Rush
 * ====================================
 *
 * SIMULATES: 1000 users opening the dashboard at 09:00 (morning start-of-day).
 *
 * WORKFLOW per iteration (single GET, as a real browser first-paint):
 *   1. GET /api/dashboard/summary           (if present)
 *      — with automatic fallback to:
 *   2. GET /api/status                      (the existing Onyx dashboard aggregator)
 *
 * CONFIGURATION:
 *   users        = 1000                (logical)
 *   concurrency  = 200                 (first 200 users arrive nearly simultaneously,
 *                                       the rest follow in the saturation window)
 *   duration     = 60_000 ms           (1 minute — simulates the morning spike)
 *
 * WHY THIS MATTERS:
 *   /api/status (and /api/dashboard/summary if implemented) performs N aggregate
 *   queries in parallel — purchase_requests.count, open_rfqs.count, pending_pos.count,
 *   savings_ytd, etc. Under 200 concurrent hits this exposes:
 *     • missing indexes on the aggregate rollups
 *     • repeated full-scan queries that should be memoised or materialised
 *     • middleware overhead (auth + rate-limit + helmet) starting to matter
 *
 * THRESHOLDS (tight — this is a read-only hot-path endpoint):
 *   p95_ms   <= 1500          (the master threshold)
 *   p99_ms   <= 3000
 *   err_rate <= 0.01
 *
 * ENDPOINT DISCOVERY:
 *   On the first iteration each worker probes /api/dashboard/summary. If the
 *   server returns 404 we remember it and fall back to /api/status. This keeps
 *   the scenario valid whether or not a dedicated dashboard endpoint has been
 *   added. The probe itself is recorded under its own tag so you can see which
 *   path was actually exercised.
 */

'use strict';

const lib = require('./qa-15-lib');

const scenarioName = 'dashboard-rush';

const THRESHOLDS = {
  p95_ms: 1500,
  p99_ms: 3000,
  err_rate: 0.01,
};

async function run(baseUrl, apiKey, opts = {}) {
  const duration = opts.duration || 60_000;
  const concurrency = opts.concurrency || 200;

  const stats = lib.createStats(scenarioName);
  const startedAt = new Date().toISOString();

  // Shared discovery flag — once ANY worker confirms /api/dashboard/summary is 404,
  // all workers switch to /api/status. Simple atomic read, no locking needed.
  let resolvedPath = null;
  let probed = false;

  async function resolveDashboardPath() {
    if (resolvedPath) return resolvedPath;
    if (probed) {
      // another worker is probing, just wait and re-read
      for (let i = 0; i < 50 && !resolvedPath; i++) await lib.sleep(10);
      if (resolvedPath) return resolvedPath;
    }
    probed = true;
    const probe = await lib.request(baseUrl, apiKey, {
      method: 'GET',
      path: '/api/dashboard/summary',
      expect: [200, 404],
    });
    stats.record(probe, { tag: 'probe' });
    resolvedPath = probe.status === 200 ? '/api/dashboard/summary' : '/api/status';
    return resolvedPath;
  }

  async function flow() {
    const path = await resolveDashboardPath();
    const r = await lib.request(baseUrl, apiKey, {
      method: 'GET',
      path,
    });
    stats.record(r, { tag: path === '/api/dashboard/summary' ? 'dashboard.summary' : 'status' });
  }

  await lib.runConcurrent({
    concurrency,
    duration,
    task: flow,
  });

  return lib.buildReport(scenarioName, stats.report({ thresholds: THRESHOLDS }), {
    started_at: startedAt,
    config: { duration, concurrency, users: 1000, resolvedPath },
  });
}

module.exports = { scenarioName, run, THRESHOLDS };
