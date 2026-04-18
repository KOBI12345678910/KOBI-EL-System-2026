/**
 * QA-15 — SCENARIO 2 — VAT Submission (PCN836)
 * =============================================
 *
 * SIMULATES: 100 users generating PCN836 reports concurrently at VAT deadline.
 *
 * WORKFLOW per iteration:
 *   1. GET  /api/vat/periods                             (list existing periods)
 *   2. GET  /api/vat/periods/:id                         (open a period)
 *   3. GET  /api/vat/periods/:id/pcn836                  (THE heavy call — ~50MB CSV)
 *
 * CONFIGURATION:
 *   users        = 100
 *   concurrency  = 100                (matches users 1:1 — realistic deadline spike)
 *   duration     = 3 * 60 * 1000 ms   (3 minutes)
 *
 * WHY THIS MATTERS:
 *   PCN836 is the heaviest single endpoint in Onyx — it reads every VAT-relevant
 *   line item for the period, formats to the Tax Authority fixed-width CSV, and
 *   streams ~50MB back. Under 100 parallel requests this hits:
 *     • DB connection pool contention (src/vat/pcn836.js reads many tables)
 *     • response streaming backpressure
 *     • memory — if any of the builders buffer in RAM we will OOM here, not later
 *
 * THRESHOLDS (PCN836 is expensive — relaxed from the default):
 *   p95_ms   <= 8000       (8s — this IS the heavy one)
 *   p99_ms   <= 20000
 *   err_rate <= 0.02       (2% — we tolerate a little more because of pool contention)
 *
 * SAFETY:
 *   - Read-only calls. Never submits (POST /periods/:id/submit is EXCLUDED on purpose).
 *   - Never closes a period (POST /periods/:id/close is EXCLUDED on purpose).
 *   - 60s per-request timeout because PCN836 legitimately takes longer than 30s on cold cache.
 */

'use strict';

const lib = require('./qa-15-lib');

const scenarioName = 'vat-submission';

const THRESHOLDS = {
  p95_ms: 8000,
  p99_ms: 20000,
  err_rate: 0.02,
};

async function run(baseUrl, apiKey, opts = {}) {
  const duration = opts.duration || 3 * 60 * 1000;
  const concurrency = opts.concurrency || 100;
  const periodIdPool = (opts.periodIds && opts.periodIds.length)
    ? opts.periodIds
    : ['QA15_VAT_PERIOD_1', 'QA15_VAT_PERIOD_2'];

  const stats = lib.createStats(scenarioName);
  const startedAt = new Date().toISOString();

  async function flow({ iter }) {
    const periodId = periodIdPool[iter % periodIdPool.length];

    // Step 1: list periods (warm cache / establishes baseline)
    const r1 = await lib.request(baseUrl, apiKey, {
      method: 'GET',
      path: '/api/vat/periods?limit=12',
    });
    stats.record(r1, { tag: 'periods.list' });

    // Step 2: open the period detail (touches invoices + line_items)
    const r2 = await lib.request(baseUrl, apiKey, {
      method: 'GET',
      path: `/api/vat/periods/${encodeURIComponent(periodId)}`,
      timeout: 45_000,
      expect: [200, 404],
    });
    stats.record(r2, { tag: 'period.read' });

    // Step 3: THE heavy one — full PCN836 generation
    const r3 = await lib.request(baseUrl, apiKey, {
      method: 'GET',
      path: `/api/vat/periods/${encodeURIComponent(periodId)}/pcn836`,
      timeout: 60_000,
      expect: [200, 404],
    });
    stats.record(r3, { tag: 'pcn836.generate' });
  }

  await lib.runConcurrent({
    concurrency,
    duration,
    task: flow,
  });

  return lib.buildReport(scenarioName, stats.report({ thresholds: THRESHOLDS }), {
    started_at: startedAt,
    config: { duration, concurrency, users: 100 },
  });
}

module.exports = { scenarioName, run, THRESHOLDS };
