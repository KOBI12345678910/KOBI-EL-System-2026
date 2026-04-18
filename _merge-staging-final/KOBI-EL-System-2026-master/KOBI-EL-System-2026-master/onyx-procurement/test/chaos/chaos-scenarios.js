'use strict';
/**
 * test/chaos/chaos-scenarios.js
 * ─────────────────────────────────────────────────────────────
 * Pre-baked chaos scenarios for onyx-procurement.
 *
 * Each scenario is a plain object so it can be serialised into
 * a run plan, logged, and diffed between runs.
 *
 *   {
 *     id:              'slow-db',
 *     title:           'Slow DB',
 *     description:     '…',
 *     steadyState:     { … },          // what "healthy" looks like
 *     faults:          [ ['name', opts], … ],
 *     durationSec:     60,
 *     abortConditions: { … },
 *     tags:            ['db','latency'],
 *   }
 *
 * The runner is intentionally kept out of this file: scenarios
 * describe *what* to do, `chaos-runner.js` knows *how*, and
 * `chaos-tests.js` wires both against the real app.
 *
 * Agent 55 — additive only. If you add a new scenario, append
 * it to `ALL_SCENARIOS`; do not rewrite existing entries.
 * ─────────────────────────────────────────────────────────────
 */

const path = require('node:path');

// Absolute path used by the disk-full scenario to whitelist only
// PDF writes (so unrelated tmp writes in the test harness don't
// collide with the experiment). Adjust if your PDF service
// writes elsewhere.
const PDF_OUTPUT_DIR = path.resolve(__dirname, '..', 'tmp-pdfs');
const PDF_ROUTES_DIR = path.resolve(__dirname, '..', 'tmp-pdfs-routes');

// ─────────────────────────────────────────────────────────────
// Scenario: Slow DB
// Goal: every DB query takes +2s. Verifies that routes still
// respect their own timeouts and surface 504 / 503 instead of
// hanging open file descriptors forever.
// ─────────────────────────────────────────────────────────────
const SLOW_DB = Object.freeze({
  id: 'slow-db',
  title: 'Slow DB',
  description: 'All DB queries take +2s. Verifies timeouts, bulkheads, retries.',
  steadyState: {
    // When healthy, /api/health must respond under 1s and p95
    // of a read-only route must stay under 3.5s (2s added +
    // 1.5s budget).
    healthMaxMs: 1000,
    readRouteP95MaxMs: 3500,
    errorRateMax: 0.02,
  },
  faults: [
    ['db-slow-query', { extraMs: 2000 }],   // target injected at runtime
  ],
  durationSec: 60,
  abortConditions: {
    errorRateAbove: 0.5,
    memoryMbAbove: 1500,
    processCrash: true,
  },
  tags: ['db', 'latency', 'timeout'],
});

// ─────────────────────────────────────────────────────────────
// Scenario: Flaky network
// Goal: 10% of HTTP responses are rewritten to 500. Verifies
// retries, error tracking, and that the server never exits.
// ─────────────────────────────────────────────────────────────
const FLAKY_NETWORK = Object.freeze({
  id: 'flaky-network',
  title: 'Flaky network',
  description: '10% of requests fail with 500. Exercises retries & error tracker.',
  steadyState: {
    errorRateMax: 0.15,       // 10% injected + 5% client-side budget
    healthMaxMs: 1500,
    processCrash: false,
  },
  faults: [
    ['error-injection', { rate: 0.10, status: 500, body: 'chaos: flaky network' }],
  ],
  durationSec: 45,
  abortConditions: {
    errorRateAbove: 0.75,
    processCrash: true,
  },
  tags: ['http', 'network', 'retry'],
});

// ─────────────────────────────────────────────────────────────
// Scenario: Disk full
// Goal: every PDF write fails with ENOSPC. Routes that generate
// PDFs must return a structured error, not 500, and must not
// leak temp files.
// ─────────────────────────────────────────────────────────────
const DISK_FULL = Object.freeze({
  id: 'disk-full',
  title: 'Disk full',
  description: 'PDF writes fail with ENOSPC. Non-PDF routes unaffected.',
  steadyState: {
    nonPdfErrorRateMax: 0.02,
    pdfRouteMustReturnErrorCode: true,
    tempFilesLeakMax: 0,
  },
  faults: [
    ['disk-full', {
      // Regex match so only tmp-pdf files error. Tests can
      // override this when stubbing different layouts.
      pathMatch: new RegExp(
        '(' +
          PDF_OUTPUT_DIR.replace(/[-[\]{}()*+?.,\\^$|#]/g, '\\$&') +
          '|' +
          PDF_ROUTES_DIR.replace(/[-[\]{}()*+?.,\\^$|#]/g, '\\$&') +
          '|\\.pdf$)',
      ),
    }],
  ],
  durationSec: 30,
  abortConditions: {
    processCrash: true,
    nonPdfErrorRateAbove: 0.25,
  },
  tags: ['fs', 'pdf', 'enospc'],
});

// ─────────────────────────────────────────────────────────────
// Scenario: Memory starved
// Goal: allocate ~500 MB to squeeze V8's heap. Verifies that
// the process enforces request-body caps, streams large PDFs
// instead of buffering, and shrinks caches under pressure.
// ─────────────────────────────────────────────────────────────
const MEMORY_STARVED = Object.freeze({
  id: 'memory-starved',
  title: 'Memory starved',
  description: 'Retain ~500 MB of buffers. V8 heap pressure on every route.',
  steadyState: {
    healthMaxMs: 2500,
    errorRateMax: 0.05,
    noOomOnGenerateReport: true,
  },
  faults: [
    ['memory-pressure', { sizeMB: 500, chunkMB: 16 }],
  ],
  durationSec: 60,
  abortConditions: {
    memoryMbAbove: 3500,
    processCrash: true,
  },
  tags: ['memory', 'heap', 'pressure'],
});

// ─────────────────────────────────────────────────────────────
// Scenario: Broken external
// Goal: webhook endpoints return 503. Verifies that the app
// queues / retries webhook deliveries and never loses work.
// Because we can't truly intercept outbound HTTP without
// hooks, we toggle `error-injection` on the app's own
// webhook test server (bind port passed at runtime).
// ─────────────────────────────────────────────────────────────
const BROKEN_EXTERNAL = Object.freeze({
  id: 'broken-external',
  title: 'Broken external',
  description: 'Webhook receivers return 503. Expects app to retry or queue.',
  steadyState: {
    outboundSuccessRateMin: 0.0,   // we know the external side is down
    inboundErrorRateMax: 0.05,     // main API must remain healthy
    retriesObserved: true,
  },
  faults: [
    ['error-injection', { rate: 1.0, status: 503, body: 'chaos: external down' }],
  ],
  durationSec: 60,
  abortConditions: {
    inboundErrorRateAbove: 0.3,
    processCrash: true,
  },
  tags: ['webhook', 'external', '503'],
});

// ─────────────────────────────────────────────────────────────
// Scenario: CPU starved  (bonus, not in the spec list but
// useful for sanity-checking event-loop starvation).
// ─────────────────────────────────────────────────────────────
const CPU_STARVED = Object.freeze({
  id: 'cpu-starved',
  title: 'CPU starved',
  description: 'Busy loop consumes 80% CPU on the main thread.',
  steadyState: {
    healthMaxMs: 3000,
    errorRateMax: 0.1,
  },
  faults: [
    ['cpu-spike', { durationMs: 30_000, dutyCycle: 0.8, sliceMs: 20 }],
  ],
  durationSec: 30,
  abortConditions: {
    processCrash: true,
    memoryMbAbove: 2500,
  },
  tags: ['cpu', 'event-loop'],
});

// ─────────────────────────────────────────────────────────────
// Scenario: Latency storm (bonus).
// Goal: every request gets +500..5000ms latency.
// ─────────────────────────────────────────────────────────────
const LATENCY_STORM = Object.freeze({
  id: 'latency-storm',
  title: 'Latency storm',
  description: 'Every HTTP request is delayed by 500–5000 ms.',
  steadyState: {
    p95MaxMs: 6500,
    errorRateMax: 0.05,
  },
  faults: [
    ['latency', { minMs: 500, maxMs: 5000, probability: 1.0 }],
  ],
  durationSec: 45,
  abortConditions: {
    processCrash: true,
    errorRateAbove: 0.4,
  },
  tags: ['http', 'latency'],
});

// ─────────────────────────────────────────────────────────────
// Public registry
// ─────────────────────────────────────────────────────────────
const ALL_SCENARIOS = Object.freeze([
  SLOW_DB,
  FLAKY_NETWORK,
  DISK_FULL,
  MEMORY_STARVED,
  BROKEN_EXTERNAL,
  CPU_STARVED,
  LATENCY_STORM,
]);

const BY_ID = Object.freeze(
  Object.fromEntries(ALL_SCENARIOS.map((s) => [s.id, s])),
);

function getScenario(id) {
  const s = BY_ID[id];
  if (!s) throw new Error(`unknown chaos scenario: ${id}`);
  return s;
}

/**
 * Filter scenarios by tag (AND semantics). Returns a
 * *copy* of the registry, never mutates the originals.
 */
function byTag(...tags) {
  if (tags.length === 0) return ALL_SCENARIOS.slice();
  return ALL_SCENARIOS.filter((s) => tags.every((t) => s.tags.includes(t)));
}

/**
 * Inject runtime context into a scenario (e.g. a real DB
 * target for the `db-slow-query` fault). Returns a new
 * scenario object; the original is never touched.
 */
function bindContext(scenario, ctx = {}) {
  const faults = scenario.faults.map(([name, opts]) => {
    if (name === 'db-slow-query' && ctx.dbTarget && !opts.target) {
      return [name, { ...opts, target: ctx.dbTarget, method: ctx.dbMethod || 'query' }];
    }
    return [name, { ...opts }];
  });
  return Object.freeze({ ...scenario, faults });
}

module.exports = {
  ALL_SCENARIOS,
  BY_ID,
  getScenario,
  byTag,
  bindContext,
  // individual exports for convenience / selective import
  SLOW_DB,
  FLAKY_NETWORK,
  DISK_FULL,
  MEMORY_STARVED,
  BROKEN_EXTERNAL,
  CPU_STARVED,
  LATENCY_STORM,
};

if (require.main === module) {
  console.log('[chaos-scenarios] registered scenarios:');
  for (const s of ALL_SCENARIOS) {
    console.log(
      `  ${s.id.padEnd(18)}  ${s.tags.join(',').padEnd(24)}  ${s.title}`,
    );
  }
}
