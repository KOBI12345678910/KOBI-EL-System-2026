/**
 * QA-15 — SCENARIO 5 — Mixed Workload
 * ====================================
 *
 * SIMULATES: A realistic production mix — 70% reads, 20% writes, 10% expensive.
 *
 * WORKFLOW per iteration: pick one bucket by weighted random, fire one request.
 *
 *   READS (70%, weight 7):
 *     GET /api/status
 *     GET /api/suppliers?limit=20
 *     GET /api/purchase-orders?limit=20
 *     GET /api/rfqs?limit=20
 *     GET /api/audit?limit=50
 *     GET /api/vat/periods?limit=12
 *     GET /api/payroll/wage-slips?limit=20
 *     GET /api/bank/summary
 *
 *   WRITES (20%, weight 2):
 *     POST /api/suppliers   (synthetic, qa15_load_test=true)
 *     POST /api/bank/matches (no-op: zero-length match_ids)
 *
 *   EXPENSIVE (10%, weight 1):
 *     GET /api/analytics/savings
 *     GET /api/analytics/spend-by-supplier
 *     GET /api/analytics/spend-by-category
 *     GET /api/vat/periods/:id/pcn836    (on the test period)
 *
 * CONFIGURATION:
 *   concurrency  = 100
 *   duration     = 3 * 60 * 1000 ms   (3 minutes)
 *
 * WHY THIS MATTERS:
 *   Single-endpoint benchmarks lie. A real system sees reads + writes + heavy
 *   reports interleaved. This is the closest proxy we have to the production
 *   request mix and is the scenario to trust for the "does it hold up on a
 *   normal Tuesday" question.
 *
 * THRESHOLDS:
 *   p95_ms   <= 1500
 *   p99_ms   <= 3500
 *   err_rate <= 0.01
 */

'use strict';

const lib = require('./qa-15-lib');

const scenarioName = 'mixed-workload';

const THRESHOLDS = {
  p95_ms: 1500,
  p99_ms: 3500,
  err_rate: 0.01,
};

// Build an expanded bucket list by weight so a simple random pick gives the ratio.
// 7 reads + 2 writes + 1 expensive = 10 buckets.
function buildOperationPlan(periodIdForPcn) {
  const reads = [
    { tag: 'read.status', method: 'GET', path: '/api/status' },
    { tag: 'read.suppliers', method: 'GET', path: '/api/suppliers?limit=20' },
    { tag: 'read.purchase-orders', method: 'GET', path: '/api/purchase-orders?limit=20' },
    { tag: 'read.rfqs', method: 'GET', path: '/api/rfqs?limit=20' },
    { tag: 'read.audit', method: 'GET', path: '/api/audit?limit=50' },
    { tag: 'read.vat.periods', method: 'GET', path: '/api/vat/periods?limit=12' },
    { tag: 'read.wage-slips', method: 'GET', path: '/api/payroll/wage-slips?limit=20' },
    { tag: 'read.bank.summary', method: 'GET', path: '/api/bank/summary' },
  ];

  const writes = [
    {
      tag: 'write.supplier',
      method: 'POST',
      path: '/api/suppliers',
      body: () => ({
        name: `QA15-Supplier-${lib.rid('sup')}`,
        category: 'qa-15-load-test',
        qa15_load_test: true,
      }),
      expect: [200, 201, 400, 409],
    },
    {
      tag: 'write.bank.match',
      method: 'POST',
      path: '/api/bank/matches',
      body: () => ({
        transaction_ids: [],
        gl_entry_ids: [],
        qa15_load_test: true,
        dry_run: true,
      }),
      expect: [200, 201, 400, 404],
    },
  ];

  const expensive = [
    { tag: 'exp.analytics.savings', method: 'GET', path: '/api/analytics/savings', timeout: 45_000 },
    { tag: 'exp.analytics.spend-supplier', method: 'GET', path: '/api/analytics/spend-by-supplier', timeout: 45_000 },
    { tag: 'exp.analytics.spend-category', method: 'GET', path: '/api/analytics/spend-by-category', timeout: 45_000 },
    {
      tag: 'exp.vat.pcn836',
      method: 'GET',
      path: `/api/vat/periods/${encodeURIComponent(periodIdForPcn)}/pcn836`,
      timeout: 60_000,
      expect: [200, 404],
    },
  ];

  // Ratio: 70% / 20% / 10% → replicate buckets accordingly.
  // Total slots = 100. 70 read slots, 20 write slots, 10 expensive slots.
  const plan = [];
  for (let i = 0; i < 70; i++) plan.push(reads[i % reads.length]);
  for (let i = 0; i < 20; i++) plan.push(writes[i % writes.length]);
  for (let i = 0; i < 10; i++) plan.push(expensive[i % expensive.length]);
  return plan;
}

async function run(baseUrl, apiKey, opts = {}) {
  const duration = opts.duration || 3 * 60 * 1000;
  const concurrency = opts.concurrency || 100;
  const periodIdForPcn = opts.periodId || 'QA15_VAT_PERIOD_1';

  const plan = buildOperationPlan(periodIdForPcn);
  const stats = lib.createStats(scenarioName);
  const startedAt = new Date().toISOString();

  async function flow({ iter }) {
    // Pseudo-random pick using iter so the mix is reproducible across runs.
    const op = plan[(iter * 37 + lib.randomInt(0, plan.length - 1)) % plan.length];
    const body = typeof op.body === 'function' ? op.body() : op.body;

    const r = await lib.request(baseUrl, apiKey, {
      method: op.method,
      path: op.path,
      body,
      timeout: op.timeout,
      expect: op.expect,
    });
    stats.record(r, { tag: op.tag });
  }

  await lib.runConcurrent({
    concurrency,
    duration,
    task: flow,
  });

  return lib.buildReport(scenarioName, stats.report({ thresholds: THRESHOLDS }), {
    started_at: startedAt,
    config: { duration, concurrency, mix: '70/20/10' },
  });
}

module.exports = { scenarioName, run, THRESHOLDS };
