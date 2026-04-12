'use strict';
/**
 * test/chaos/chaos-report.js
 * ─────────────────────────────────────────────────────────────
 * Renders RunResult[] (from chaos-tests.js) into a
 * human-readable text report, a JSON payload, and a short
 * recommendations block derived from observed deviations.
 *
 * Pure module: no side effects unless `writeReport` is called
 * with a truthy `outDir`, in which case `./report-<ts>.txt` and
 * `./report-<ts>.json` are written next to the caller.
 *
 * Uses only Node built-ins.
 *
 * Report shape:
 *
 *   ═════════════════════════════════════════════
 *    onyx-procurement — chaos report
 *   ═════════════════════════════════════════════
 *    generated : 2026-04-11T…
 *    scenarios : 7
 *    resilient : 3
 *    degraded  : 2
 *    failed    : 1
 *    dry-run   : 1
 *   ─────────────────────────────────────────────
 *    [slow-db]            RESILIENT
 *       p95 = 2480 ms  err-rate = 0.012
 *       recommendations:
 *         - none
 *
 *    [flaky-network]      DEGRADED
 *       p95 = 1900 ms  err-rate = 0.13
 *       deviations:
 *         errorRateMax: expected <= 0.15, actual 0.13   [medium]
 *       recommendations:
 *         - Enable exponential backoff in …
 * ─────────────────────────────────────────────────────────────
 */

const fs = require('node:fs');
const path = require('node:path');

// ─────────────────────────────────────────────────────────────
// Recommendation table — per fault name and per rule
// ─────────────────────────────────────────────────────────────
const RECOMMENDATIONS = {
  faults: {
    'latency':         'Verify request-level timeouts are < client timeout. Add per-route deadlines and shed load instead of queueing.',
    'error-injection': 'Wire retries with exponential backoff + jitter; ensure error tracker increments per failed attempt; circuit-break after N consecutive failures.',
    'connection-drop': 'Confirm keep-alive is reset on drop; clients must retry idempotent requests. Avoid partial-write state on PDF routes.',
    'db-slow-query':   'Add a query timeout distinct from the request timeout. Use a bulkhead (dedicated pool) for slow reports so they cannot starve critical paths.',
    'disk-full':       'Surface ENOSPC as a 507 Insufficient Storage with a structured body. Never leak half-written tmp files — use rename-on-success pattern.',
    'memory-pressure': 'Stream large PDFs instead of buffering; cap request body sizes; lower in-memory cache TTLs under heap pressure.',
    'cpu-spike':       'Offload hot loops to worker threads; use `setImmediate` yields; consider an event-loop lag watchdog that triggers 503s when latency > budget.',
  },
  rules: {
    'errorRateMax':        'Error rate exceeded budget — enable a retry strategy and a circuit breaker (e.g. opossum-style) if not already present.',
    'p95MaxMs':            'Latency p95 exceeded budget — investigate queueing, add per-route deadlines, or shed load early.',
    'healthMaxMs':         'Health endpoint regressed — make /api/health a *liveness* check that does zero I/O.',
    'readRouteP95MaxMs':   'Read paths slowed beyond budget — add a read replica or a short-TTL cache in front of slow queries.',
    'memoryMbAbove':       'RSS exceeded threshold — audit retained references; explicitly null large buffers on response end.',
    'nonPdfErrorRateAbove':'Non-PDF routes degraded during a disk-full event — fault isolation is missing.',
    'inboundErrorRateAbove':'Inbound API regressed while outbound external was broken — add a bulkhead between webhook dispatcher and API handlers.',
  },
};

// ─────────────────────────────────────────────────────────────
// Formatter helpers
// ─────────────────────────────────────────────────────────────
function padLabel(s, w = 18) {
  const str = String(s);
  return str.length >= w ? str : str + ' '.repeat(w - str.length);
}
function pct(x) { return (x * 100).toFixed(1) + '%'; }
function ms(x)  { return Math.round(x) + ' ms'; }

// ─────────────────────────────────────────────────────────────
// Recommendation engine
// ─────────────────────────────────────────────────────────────
function recommendFor(run) {
  const recs = new Set();
  // One hint per fault touched.
  for (const f of (run.faults || [])) {
    const r = RECOMMENDATIONS.faults[f.name];
    if (r) recs.add(r);
  }
  // One hint per violated rule.
  for (const d of (run.deviations || [])) {
    const r = RECOMMENDATIONS.rules[d.rule];
    if (r) recs.add(r);
  }
  // Heuristic hints from log data.
  if (run.status === 'failed' && run.error?.message) {
    recs.add(`Investigate exception during run: ${run.error.message}`);
  }
  if (run.observations?.after && run.observations.after.rssDeltaMb > 200) {
    recs.add('Memory grew >200 MB during run — probable retention leak; take heap snapshot at begin/end.');
  }
  return Array.from(recs);
}

// ─────────────────────────────────────────────────────────────
// Text renderer
// ─────────────────────────────────────────────────────────────
function renderText(runs) {
  const lines = [];
  const counts = { resilient: 0, degraded: 0, failed: 0, 'dry-run': 0, unknown: 0 };
  for (const r of runs) counts[r.status] = (counts[r.status] || 0) + 1;

  lines.push('═════════════════════════════════════════════');
  lines.push(' onyx-procurement — chaos report');
  lines.push('═════════════════════════════════════════════');
  lines.push(` generated : ${new Date().toISOString()}`);
  lines.push(` scenarios : ${runs.length}`);
  lines.push(` resilient : ${counts.resilient || 0}`);
  lines.push(` degraded  : ${counts.degraded || 0}`);
  lines.push(` failed    : ${counts.failed || 0}`);
  if (counts['dry-run']) lines.push(` dry-run   : ${counts['dry-run']}`);
  lines.push('─────────────────────────────────────────────');

  for (const r of runs) {
    lines.push('');
    lines.push(` [${padLabel(r.id, 16)}] ${r.status.toUpperCase()}`);
    if (r.underChaos && !r.underChaos.skipped) {
      lines.push(
        `    p95 = ${ms(r.underChaos.p95Ms)}   err-rate = ${pct(r.underChaos.errorRate)}   n = ${r.underChaos.total}`,
      );
    } else if (r.underChaos?.skipped) {
      lines.push(`    (${r.underChaos.skipped})`);
    }
    if (r.observations?.after) {
      const o = r.observations.after;
      lines.push(
        `    rss = ${o.rssMb.toFixed(1)} MB (Δ ${o.rssDeltaMb >= 0 ? '+' : ''}${o.rssDeltaMb.toFixed(1)} MB)  heap = ${o.heapMb.toFixed(1)} MB`,
      );
    }
    if (r.deviations && r.deviations.length) {
      lines.push('    deviations:');
      for (const d of r.deviations) {
        lines.push(`      ${d.rule}: expected <= ${d.expected}, actual ${typeof d.actual === 'number' ? d.actual.toFixed(2) : d.actual}   [${d.severity}]`);
      }
    }
    const recs = recommendFor(r);
    lines.push('    recommendations:');
    if (recs.length === 0) {
      lines.push('      - none');
    } else {
      for (const rec of recs) lines.push(`      - ${rec}`);
    }
    if (r.error) {
      lines.push(`    error: ${r.error.message}`);
    }
  }

  lines.push('');
  lines.push('─────────────────────────────────────────────');
  lines.push(' end of report');
  lines.push('─────────────────────────────────────────────');
  return lines.join('\n');
}

// ─────────────────────────────────────────────────────────────
// JSON payload
// ─────────────────────────────────────────────────────────────
function renderJson(runs) {
  return {
    generatedAt: new Date().toISOString(),
    totals: runs.reduce((acc, r) => {
      acc[r.status] = (acc[r.status] || 0) + 1;
      acc.total = (acc.total || 0) + 1;
      return acc;
    }, {}),
    runs: runs.map((r) => ({
      id: r.id,
      title: r.title,
      status: r.status,
      faults: r.faults,
      underChaos: r.underChaos,
      steadyAfter: r.steadyAfter,
      observations: r.observations,
      deviations: r.deviations,
      recommendations: recommendFor(r),
      error: r.error,
      dryRun: r.dryRun,
      durationMs: r.durationMs,
      logEntries: r.log?.length || 0,
    })),
  };
}

// ─────────────────────────────────────────────────────────────
// Public writer
// ─────────────────────────────────────────────────────────────
function writeReport(runs, { outDir } = {}) {
  const text = renderText(runs);
  const json = renderJson(runs);
  let files = null;
  if (outDir) {
    fs.mkdirSync(outDir, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const base = path.join(outDir, `report-${ts}`);
    fs.writeFileSync(base + '.txt', text);
    fs.writeFileSync(base + '.json', JSON.stringify(json, null, 2));
    files = { text: base + '.txt', json: base + '.json' };
  }
  return { text, json, files };
}

module.exports = {
  renderText,
  renderJson,
  writeReport,
  recommendFor,
  RECOMMENDATIONS,
};

if (require.main === module) {
  // Self-demo: produce a report from synthetic RunResults.
  const demoRuns = [
    {
      id: 'slow-db', title: 'Slow DB', status: 'resilient',
      faults: [{ name: 'db-slow-query', opts: { extraMs: 2000 } }],
      underChaos: { total: 25, errors: 0, errorRate: 0, p50Ms: 1200, p95Ms: 2400, p99Ms: 2900 },
      steadyAfter: {}, deviations: [],
      observations: { after: { rssMb: 180, heapMb: 90, rssDeltaMb: 12 } },
      log: [], dryRun: false, durationMs: 62_000,
    },
    {
      id: 'flaky-network', title: 'Flaky network', status: 'degraded',
      faults: [{ name: 'error-injection', opts: { rate: 0.1 } }],
      underChaos: { total: 50, errors: 12, errorRate: 0.24, p50Ms: 200, p95Ms: 1100, p99Ms: 1800 },
      steadyAfter: {},
      deviations: [{ rule: 'errorRateMax', expected: 0.15, actual: 0.24, severity: 'medium' }],
      observations: { after: { rssMb: 210, heapMb: 110, rssDeltaMb: 25 } },
      log: [], dryRun: false, durationMs: 45_000,
    },
  ];
  console.log(renderText(demoRuns));
}
