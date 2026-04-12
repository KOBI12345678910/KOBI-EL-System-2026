/**
 * QA-15 — SCENARIO 6 — Spike Test
 * ================================
 *
 * SIMULATES: A sudden 50× traffic surge and observes recovery.
 *
 * THREE PHASES:
 *   1. BASELINE  —  10 req/s  for 60s
 *   2. SPIKE     — 500 req/s  for 30s
 *   3. RECOVERY  —  10 req/s  for 60s
 *
 * Each phase is recorded in its OWN stats bucket so you can see:
 *   • baseline p95 (what "healthy" looks like)
 *   • spike p95 (tail latency during the event)
 *   • recovery p95 (did the server come back? did a queue drain cleanly?)
 *
 * TARGET ENDPOINTS:
 *   GET /api/status   (80% of traffic)
 *   GET /api/healthz  (20% of traffic — cheap, lets us see if the event loop stalls)
 *
 * WHY THIS MATTERS:
 *   Spikes expose: rate-limiter false-positives, connection-pool exhaustion,
 *   WAL growth surprise, autoscaling reaction time, and any place where the
 *   server enters a bad state it can't recover from without a restart.
 *
 * THRESHOLDS (per-phase, applied separately):
 *   baseline  : p95 <= 1500   err <= 0.01
 *   spike     : p95 <= 5000   err <= 0.10   (10% — spikes ARE painful)
 *   recovery  : p95 <= 1500   err <= 0.01   (MUST return to healthy)
 *
 * PASS CRITERION:
 *   - baseline_pass AND recovery_pass (spike alone cannot fail the test)
 *   - The whole point is "graceful degradation + clean recovery".
 *   - If recovery fails you have a NO-GO regardless of what spike did.
 */

'use strict';

const lib = require('./qa-15-lib');

const scenarioName = 'spike-test';

const THRESHOLDS = {
  baseline: { p95_ms: 1500, p99_ms: 3000, err_rate: 0.01 },
  spike:    { p95_ms: 5000, p99_ms: 15000, err_rate: 0.10 },
  recovery: { p95_ms: 1500, p99_ms: 3000, err_rate: 0.01 },
};

async function run(baseUrl, apiKey, opts = {}) {
  const baselineRps = opts.baselineRps || 10;
  const baselineMs = opts.baselineMs || 60_000;
  const spikeRps = opts.spikeRps || 500;
  const spikeMs = opts.spikeMs || 30_000;
  const recoveryRps = opts.recoveryRps || 10;
  const recoveryMs = opts.recoveryMs || 60_000;

  const startedAt = new Date().toISOString();

  const baselineStats = lib.createStats('spike:baseline');
  const spikeStats = lib.createStats('spike:spike');
  const recoveryStats = lib.createStats('spike:recovery');

  function buildTask(stats) {
    return async function task({ iter }) {
      // 80/20 weighted pick
      const useHealth = (iter % 5) === 0;
      const r = await lib.request(baseUrl, apiKey, {
        method: 'GET',
        path: useHealth ? '/healthz' : '/api/status',
      });
      stats.record(r, { tag: useHealth ? 'healthz' : 'status' });
    };
  }

  // Phase 1 — baseline
  await lib.runRateLimited({ rps: baselineRps, duration: baselineMs, task: buildTask(baselineStats) });

  // Phase 2 — SPIKE
  await lib.runRateLimited({ rps: spikeRps, duration: spikeMs, task: buildTask(spikeStats) });

  // Phase 3 — recovery
  await lib.runRateLimited({ rps: recoveryRps, duration: recoveryMs, task: buildTask(recoveryStats) });

  const baseline = baselineStats.report({ thresholds: THRESHOLDS.baseline });
  const spike = spikeStats.report({ thresholds: THRESHOLDS.spike });
  const recovery = recoveryStats.report({ thresholds: THRESHOLDS.recovery });

  // The composite pass rule: baseline pass AND recovery pass.
  const pass = baseline.pass && recovery.pass;

  return {
    scenario: scenarioName,
    agent: 'QA-15',
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    config: {
      baseline: { rps: baselineRps, duration: baselineMs },
      spike: { rps: spikeRps, duration: spikeMs },
      recovery: { rps: recoveryRps, duration: recoveryMs },
    },
    stats: {
      phases: { baseline, spike, recovery },
      thresholds: THRESHOLDS,
      pass,
      verdict: pass ? 'GO' : 'NO-GO',
      // Aggregate a flat shape for the runner’s cross-scenario summary.
      totalCalls: baseline.totalCalls + spike.totalCalls + recovery.totalCalls,
      totalErrors: baseline.totalErrors + spike.totalErrors + recovery.totalErrors,
      errRate: (baseline.totalErrors + spike.totalErrors + recovery.totalErrors) /
               Math.max(1, baseline.totalCalls + spike.totalCalls + recovery.totalCalls),
      rps: 0, // not meaningful for a phased test
      elapsedS: baseline.elapsedS + spike.elapsedS + recovery.elapsedS,
      totalBytes: baseline.totalBytes + spike.totalBytes + recovery.totalBytes,
      latency: {
        min: Math.min(baseline.latency.min, spike.latency.min, recovery.latency.min),
        mean: (baseline.latency.mean + spike.latency.mean + recovery.latency.mean) / 3,
        p50: Math.max(baseline.latency.p50, spike.latency.p50, recovery.latency.p50),
        p95: Math.max(baseline.latency.p95, spike.latency.p95, recovery.latency.p95),
        p99: Math.max(baseline.latency.p99, spike.latency.p99, recovery.latency.p99),
        max: Math.max(baseline.latency.max, spike.latency.max, recovery.latency.max),
      },
      errorBuckets: Object.assign({}, baseline.errorBuckets, spike.errorBuckets, recovery.errorBuckets),
      byTag: {},
    },
  };
}

module.exports = { scenarioName, run, THRESHOLDS };
