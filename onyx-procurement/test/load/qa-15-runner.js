#!/usr/bin/env node
/**
 * QA-15 — Load Test Runner
 * =========================
 *
 * Owner:    QA-15 (Load Agent)
 * Purpose:  Run all qa-15-*.js scenarios sequentially and print a combined
 *           Go/No-Go verdict at the end.
 *
 * USAGE
 * -----
 *   node test/load/qa-15-runner.js [options]
 *
 * OPTIONS (all env-var-backed so CI can override without flag-parsing):
 *   --base-url=<url>          (env: QA15_BASE_URL, default http://localhost:3000)
 *   --api-key=<key>           (env: QA15_API_KEY)
 *   --only=<name,name>        (run only these scenarios by name)
 *   --skip=<name,name>        (skip these scenarios by name)
 *   --quick                   (shrink every duration 10× — for smoke runs / CI)
 *   --json                    (emit final combined JSON on stdout AFTER human output)
 *   --help
 *
 * EXIT CODE
 * ---------
 *   0  → every scenario verdict = GO
 *   1  → at least one NO-GO
 *   2  → runner error (bad args, unreachable base url, etc.)
 *
 * WHY SEQUENTIAL AND NOT PARALLEL
 * -------------------------------
 *   Parallel scenarios would contaminate each other's latency measurements.
 *   Soak would run 30 minutes beside Spike, and you couldn't tell which
 *   scenario caused a database stall. Sequential runs give clean per-scenario
 *   reports; that matters more than wall-clock.
 *
 * PRE-FLIGHT
 * ----------
 *   The runner pings GET /healthz once before starting. If that fails (or the
 *   base url is wrong), we exit 2 immediately with a clear message instead of
 *   burning 40 minutes on timeouts.
 *
 * THIS FILE DOES NOT RUN BY ITSELF WHEN REQUIRED —
 *   It only auto-invokes main() when used as the entrypoint (require.main check).
 *   Importing it from another script exposes { run, SCENARIOS }.
 */

'use strict';

const lib = require('./qa-15-lib');

// Scenario registry. Order = execution order.
// Each entry: { name, module, enabledInQuick, quickDurationFactor? }
const SCENARIOS = [
  { name: 'payroll-day', module: require('./qa-15-payroll-day') },
  { name: 'vat-submission', module: require('./qa-15-vat-submission') },
  { name: 'bank-reconciliation', module: require('./qa-15-bank-reconciliation') },
  { name: 'dashboard-rush', module: require('./qa-15-dashboard-rush') },
  { name: 'mixed-workload', module: require('./qa-15-mixed-workload') },
  { name: 'spike-test', module: require('./qa-15-spike') },
  { name: 'soak-test', module: require('./qa-15-soak') },
];

function parseArgs(argv) {
  const args = {
    baseUrl: process.env.QA15_BASE_URL || 'http://localhost:3000',
    apiKey: process.env.QA15_API_KEY || '',
    only: null,
    skip: null,
    quick: false,
    json: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') {
      args.help = true;
    } else if (a.startsWith('--base-url=')) {
      args.baseUrl = a.slice('--base-url='.length);
    } else if (a.startsWith('--api-key=')) {
      args.apiKey = a.slice('--api-key='.length);
    } else if (a.startsWith('--only=')) {
      args.only = a.slice('--only='.length).split(',').map(s => s.trim()).filter(Boolean);
    } else if (a.startsWith('--skip=')) {
      args.skip = a.slice('--skip='.length).split(',').map(s => s.trim()).filter(Boolean);
    } else if (a === '--quick') {
      args.quick = true;
    } else if (a === '--json') {
      args.json = true;
    } else {
      console.error(`unknown arg: ${a}`);
      args.badArg = true;
    }
  }
  return args;
}

function printHelp() {
  console.log([
    'QA-15 — Load Test Runner',
    '',
    'Usage: node test/load/qa-15-runner.js [options]',
    '',
    'Options:',
    '  --base-url=<url>     (env: QA15_BASE_URL, default http://localhost:3000)',
    '  --api-key=<key>      (env: QA15_API_KEY)',
    '  --only=a,b,c         run only these scenarios by name',
    '  --skip=a,b,c         skip these scenarios',
    '  --quick              shrink every duration 10× (smoke run)',
    '  --json               emit combined JSON on stdout after the human report',
    '  --help',
    '',
    'Scenarios (run in order):',
    ...SCENARIOS.map(s => `  ${s.name}`),
  ].join('\n'));
}

async function preflight(baseUrl, apiKey) {
  console.log(`→ preflight: GET ${baseUrl}/healthz`);
  const r = await lib.request(baseUrl, apiKey, { method: 'GET', path: '/healthz' });
  if (!r.ok && r.status !== 200) {
    console.error(`✗ preflight failed: status=${r.status} error=${r.error}`);
    return false;
  }
  console.log(`  ok (${r.ms.toFixed(0)}ms)`);
  return true;
}

/**
 * scaleOpts(opts, quick) — halves the duration factor when --quick.
 * Applied to every scenario the same way so we don't have to special-case each.
 */
function scaleOpts(opts, quick) {
  if (!quick) return opts;
  const out = {};
  for (const [k, v] of Object.entries(opts || {})) {
    if (k === 'duration' || k === 'baselineMs' || k === 'spikeMs' || k === 'recoveryMs') {
      out[k] = Math.max(5_000, Math.floor(v / 10));
    } else {
      out[k] = v;
    }
  }
  return out;
}

async function runAll(parsedArgs) {
  const started = Date.now();
  const results = [];
  let anyFailed = false;

  const names = SCENARIOS
    .map(s => s.name)
    .filter(n => !parsedArgs.only || parsedArgs.only.includes(n))
    .filter(n => !parsedArgs.skip || !parsedArgs.skip.includes(n));

  for (const name of names) {
    const entry = SCENARIOS.find(s => s.name === name);
    const banner = '█'.repeat(72);
    console.log('');
    console.log(banner);
    console.log(`RUNNING: ${name}`);
    console.log(banner);
    const t0 = Date.now();
    let report;
    try {
      const baseOpts = parsedArgs.quick ? scaleOpts({
        duration: 30_000,
        baselineMs: 15_000,
        spikeMs: 10_000,
        recoveryMs: 15_000,
      }, true) : {};
      report = await entry.module.run(parsedArgs.baseUrl, parsedArgs.apiKey, baseOpts);
    } catch (e) {
      report = {
        scenario: name,
        agent: 'QA-15',
        error: `runner-caught: ${e && e.message}`,
        stats: { pass: false, verdict: 'NO-GO', totalCalls: 0, totalErrors: 0, errRate: 1, rps: 0, elapsedS: 0, totalBytes: 0, latency: { min: 0, mean: 0, p50: 0, p95: 0, p99: 0, max: 0 }, errorBuckets: {}, byTag: {}, thresholds: {} },
      };
    }
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(lib.formatReport(report));
    console.log(`(scenario ${name} ran ${elapsed}s)`);
    results.push(report);
    if (report.stats && report.stats.verdict === 'NO-GO') anyFailed = true;
  }

  // ═══ CROSS-SCENARIO SUMMARY ═══
  const bar = '═'.repeat(72);
  console.log('');
  console.log(bar);
  console.log('QA-15 — COMBINED LOAD TEST SUMMARY');
  console.log(bar);
  console.log(`Run started:   ${new Date(started).toISOString()}`);
  console.log(`Run finished:  ${new Date().toISOString()}`);
  console.log(`Base URL:      ${parsedArgs.baseUrl}`);
  console.log(`Quick mode:    ${parsedArgs.quick ? 'yes' : 'no'}`);
  console.log(`Scenarios:     ${results.length}`);
  console.log('');
  const col = (s, n) => (s + ' '.repeat(n)).slice(0, n);
  console.log(col('SCENARIO', 24) + col('VERDICT', 10) + col('CALLS', 10) + col('ERR%', 10) + col('p95 ms', 10) + col('p99 ms', 10));
  console.log('-'.repeat(74));
  for (const r of results) {
    const s = r.stats || {};
    console.log(
      col(r.scenario, 24) +
      col(s.verdict || '—', 10) +
      col(String(s.totalCalls || 0), 10) +
      col(((s.errRate || 0) * 100).toFixed(2) + '%', 10) +
      col((s.latency && s.latency.p95 || 0).toFixed(0), 10) +
      col((s.latency && s.latency.p99 || 0).toFixed(0), 10)
    );
  }
  console.log('-'.repeat(74));
  const overall = anyFailed ? 'NO-GO' : 'GO';
  console.log(`\nOVERALL: ${overall}`);
  console.log(bar);

  if (parsedArgs.json) {
    console.log('\n--- JSON ---');
    console.log(JSON.stringify({
      agent: 'QA-15',
      baseUrl: parsedArgs.baseUrl,
      quick: parsedArgs.quick,
      overall,
      results,
    }, null, 2));
  }

  return anyFailed ? 1 : 0;
}

async function main() {
  const parsed = parseArgs(process.argv);
  if (parsed.help) { printHelp(); return 0; }
  if (parsed.badArg) { printHelp(); return 2; }

  const ok = await preflight(parsed.baseUrl, parsed.apiKey);
  if (!ok) {
    console.error('');
    console.error('Aborting. Start the onyx server and/or fix --base-url / --api-key.');
    return 2;
  }
  return runAll(parsed);
}

if (require.main === module) {
  main().then(
    (code) => process.exit(code || 0),
    (err) => { console.error('runner crashed:', err); process.exit(2); }
  );
}

module.exports = { runAll, SCENARIOS, parseArgs };
