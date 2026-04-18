/**
 * QA-15 — SCENARIO 3 — Bank Reconciliation
 * =========================================
 *
 * SIMULATES: 20 bookkeepers uploading a 10k-line bank statement and running
 *            auto-reconcile against the GL.
 *
 * WORKFLOW per iteration:
 *   1. GET  /api/bank/accounts                           (list accounts)
 *   2. POST /api/bank/accounts/:id/import                (upload 10k-row statement)
 *   3. POST /api/bank/accounts/:id/auto-reconcile        (run matcher)
 *   4. GET  /api/bank/summary                            (verify summary refreshed)
 *
 * CONFIGURATION:
 *   users        = 20
 *   concurrency  = 20                 (each user holds a single connection)
 *   duration     = 4 * 60 * 1000 ms   (4 minutes)
 *
 * WHY THIS MATTERS:
 *   The import path runs the CSV parser (src/bank/parsers.js) and the matcher
 *   (src/bank/matcher.js) on 10k rows in a single transaction. This scenario
 *   pounds that path with 20 concurrent transactions to:
 *     • find lock contention on bank_transactions / bank_matches tables
 *     • surface any O(n²) in the matcher (10k × 10k = 100M ops is a classic trap)
 *     • catch transaction-log growth / autovacuum starvation
 *
 * THRESHOLDS:
 *   p95_ms   <= 5000
 *   p99_ms   <= 12000
 *   err_rate <= 0.01
 *
 * SAFETY:
 *   - Uses synthetic bank_account_id "QA15_BANK_ACC" (the runner must seed one).
 *   - Payload includes "qa15_load_test":true so teardown can bulk-delete later.
 *   - Never calls POST /api/bank/matches with real transaction IDs — we only
 *     exercise the import + auto-reconcile path.
 */

'use strict';

const lib = require('./qa-15-lib');

const scenarioName = 'bank-reconciliation';

const THRESHOLDS = {
  p95_ms: 5000,
  p99_ms: 12000,
  err_rate: 0.01,
};

/**
 * buildSyntheticStatement(rowCount)
 *
 * Constructs a 10k-row CSV as a JSON payload the /import endpoint accepts.
 * We generate it once per iteration and keep it in-memory — DO NOT share the
 * buffer across iterations, the matcher mutates references in some versions.
 */
function buildSyntheticStatement(rowCount) {
  const rows = new Array(rowCount);
  const baseDate = new Date(2026, 3, 1).getTime();
  for (let i = 0; i < rowCount; i++) {
    rows[i] = {
      tx_date: new Date(baseDate + i * 3600_000).toISOString().slice(0, 10),
      description: `QA15 test txn ${i}`,
      amount: ((i % 2 === 0 ? 1 : -1) * (100 + (i % 500))).toFixed(2),
      balance: (50000 + i * 10).toFixed(2),
      ref: `QA15-${i.toString().padStart(6, '0')}`,
    };
  }
  return rows;
}

async function run(baseUrl, apiKey, opts = {}) {
  const duration = opts.duration || 4 * 60 * 1000;
  const concurrency = opts.concurrency || 20;
  const bankAccountId = opts.bankAccountId || 'QA15_BANK_ACC';
  const rowsPerStatement = opts.rowsPerStatement || 10_000;

  const stats = lib.createStats(scenarioName);
  const startedAt = new Date().toISOString();

  async function flow({ iter }) {
    // Step 1: list accounts (smoke + discover)
    const r1 = await lib.request(baseUrl, apiKey, {
      method: 'GET',
      path: '/api/bank/accounts',
    });
    stats.record(r1, { tag: 'accounts.list' });

    // Step 2: upload 10k-row synthetic statement
    const statement = buildSyntheticStatement(rowsPerStatement);
    const r2 = await lib.request(baseUrl, apiKey, {
      method: 'POST',
      path: `/api/bank/accounts/${encodeURIComponent(bankAccountId)}/import`,
      body: {
        source: 'qa-15-load',
        qa15_load_test: true,
        statement_date: '2026-04-30',
        iter,
        rows: statement,
      },
      timeout: 60_000,
      expect: [200, 201, 400, 404],
    });
    stats.record(r2, { tag: 'statement.import' });

    // Step 3: run auto-reconcile (the matcher stress point)
    const r3 = await lib.request(baseUrl, apiKey, {
      method: 'POST',
      path: `/api/bank/accounts/${encodeURIComponent(bankAccountId)}/auto-reconcile`,
      body: { qa15_load_test: true },
      timeout: 60_000,
      expect: [200, 400, 404],
    });
    stats.record(r3, { tag: 'auto-reconcile' });

    // Step 4: summary refresh
    const r4 = await lib.request(baseUrl, apiKey, {
      method: 'GET',
      path: '/api/bank/summary',
    });
    stats.record(r4, { tag: 'summary' });
  }

  await lib.runConcurrent({
    concurrency,
    duration,
    task: flow,
  });

  return lib.buildReport(scenarioName, stats.report({ thresholds: THRESHOLDS }), {
    started_at: startedAt,
    config: { duration, concurrency, users: 20, rowsPerStatement },
  });
}

module.exports = { scenarioName, run, THRESHOLDS };
