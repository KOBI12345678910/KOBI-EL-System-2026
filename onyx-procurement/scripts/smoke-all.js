#!/usr/bin/env node
/**
 * ============================================================================
 * ONYX Procurement — SMOKE TEST FAN-OUT (all projects, in parallel)
 * ----------------------------------------------------------------------------
 * Agent 50 — Runs `smoke-test.js` against the 4 main KOBI EL services in
 * parallel and aggregates their results.
 *
 * USAGE:
 *   node scripts/smoke-all.js
 *
 * ENV (per target — prefix with the project slug, upper-case):
 *   ONYX_BASE_URL, ONYX_API_KEY
 *   PAYROLL_BASE_URL, PAYROLL_API_KEY
 *   TECHNO_BASE_URL, TECHNO_API_KEY
 *   AI_BASE_URL, AI_API_KEY
 *   SMOKE_TIMEOUT, SMOKE_RETRIES, SMOKE_DELAY   (passed through to each child)
 *
 * BEHAVIOR:
 *   - Spawns 4 node child processes concurrently, each running smoke-test.js
 *     for its project. Each child writes its own logs/smoke-results.json.
 *   - Aggregates stdout and per-project exit codes.
 *   - Writes a combined summary to logs/smoke-all-results.json.
 *   - Exits 0 only if every child exited 0.
 *
 * DEPENDENCIES: Node `child_process` + `fs` + `path` — zero external deps.
 * Rule: "לא מוחקים" — this script never removes any file or record.
 * ============================================================================
 */

'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// ─── ANSI ────────────────────────────────────────────────────────────────────
const ANSI = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  gray: '\x1b[90m',
};
const NO_COLOR = process.env.NO_COLOR === '1' || !process.stdout.isTTY;
const c = (code, s) => (NO_COLOR ? s : code + s + ANSI.reset);
const green = (s) => c(ANSI.green, s);
const red = (s) => c(ANSI.red, s);
const cyan = (s) => c(ANSI.cyan, s);
const gray = (s) => c(ANSI.gray, s);
const bold = (s) => c(ANSI.bold, s);
const yellow = (s) => c(ANSI.yellow, s);
const magenta = (s) => c(ANSI.magenta, s);

// ─── ROOT RESOLUTION ─────────────────────────────────────────────────────────
// smoke-all.js lives at <WORKSPACE>/onyx-procurement/scripts/smoke-all.js
// The sibling projects share the workspace root (…/KOBI EL).
const SELF_PROJECT_DIR = path.resolve(__dirname, '..');
const WORKSPACE_ROOT = path.resolve(SELF_PROJECT_DIR, '..');

// ─── TARGETS ─────────────────────────────────────────────────────────────────
// Each target points at another project directory that may also have its own
// scripts/smoke-test.js. If a sibling doesn't have one yet, we fall back to
// running THIS onyx-procurement smoke-test.js but pointed at the sibling's
// BASE_URL — the happy-path endpoints are the shared tax/payroll/vat surface.
const TARGETS = [
  {
    slug: 'onyx-procurement',
    label: 'ONYX Procurement',
    dir: SELF_PROJECT_DIR,
    baseUrlEnv: 'ONYX_BASE_URL',
    apiKeyEnv: 'ONYX_API_KEY',
    defaultUrl: 'http://localhost:3100',
  },
  {
    slug: 'payroll-autonomous',
    label: 'Payroll Autonomous',
    dir: path.join(WORKSPACE_ROOT, 'payroll-autonomous'),
    baseUrlEnv: 'PAYROLL_BASE_URL',
    apiKeyEnv: 'PAYROLL_API_KEY',
    defaultUrl: 'http://localhost:3200',
  },
  {
    slug: 'techno-kol-ops',
    label: 'Techno-Kol OPS',
    dir: path.join(WORKSPACE_ROOT, 'techno-kol-ops'),
    baseUrlEnv: 'TECHNO_BASE_URL',
    apiKeyEnv: 'TECHNO_API_KEY',
    defaultUrl: 'http://localhost:3300',
  },
  {
    slug: 'onyx-ai',
    label: 'ONYX AI',
    dir: path.join(WORKSPACE_ROOT, 'onyx-ai'),
    baseUrlEnv: 'AI_BASE_URL',
    apiKeyEnv: 'AI_API_KEY',
    defaultUrl: 'http://localhost:3400',
  },
];

// ─── HARNESS PATH RESOLUTION ─────────────────────────────────────────────────
function resolveHarnessFor(target) {
  const own = path.join(target.dir, 'scripts', 'smoke-test.js');
  if (fs.existsSync(own)) return { file: own, cwd: target.dir };
  // Fall back to this project's harness, but run it inside the target's cwd
  // so its logs/smoke-results.json lands in the right place.
  const fallback = path.join(SELF_PROJECT_DIR, 'scripts', 'smoke-test.js');
  const cwd = fs.existsSync(target.dir) ? target.dir : SELF_PROJECT_DIR;
  return { file: fallback, cwd, fallback: true };
}

// ─── RUNNER ──────────────────────────────────────────────────────────────────
function runOne(target) {
  return new Promise((resolve) => {
    const { file, cwd, fallback } = resolveHarnessFor(target);
    const env = Object.assign({}, process.env, {
      BASE_URL: process.env[target.baseUrlEnv] || target.defaultUrl,
      API_KEY: process.env[target.apiKeyEnv] || process.env.API_KEY || '',
      SMOKE_QUIET: '1',
      NO_COLOR: '1',
    });

    const startedAt = Date.now();
    const stdoutChunks = [];
    const stderrChunks = [];

    console.log(
      magenta(`▶ ${target.label.padEnd(22)}`) +
        gray(` url=${env.BASE_URL}  harness=${fallback ? 'fallback' : 'own'}  cwd=${cwd}`)
    );

    const child = spawn(process.execPath, [file], {
      cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    child.stdout.on('data', (d) => stdoutChunks.push(d));
    child.stderr.on('data', (d) => stderrChunks.push(d));

    child.on('error', (err) => {
      resolve({
        slug: target.slug,
        label: target.label,
        base_url: env.BASE_URL,
        exit_code: -1,
        duration_ms: Date.now() - startedAt,
        error: err.message,
        stdout: Buffer.concat(stdoutChunks).toString('utf8'),
        stderr: Buffer.concat(stderrChunks).toString('utf8'),
        fallback: Boolean(fallback),
      });
    });

    child.on('close', (code) => {
      resolve({
        slug: target.slug,
        label: target.label,
        base_url: env.BASE_URL,
        exit_code: code,
        duration_ms: Date.now() - startedAt,
        stdout: Buffer.concat(stdoutChunks).toString('utf8'),
        stderr: Buffer.concat(stderrChunks).toString('utf8'),
        fallback: Boolean(fallback),
      });
    });
  });
}

function extractSummary(result) {
  // Try to read the child's own smoke-results.json first (richest data).
  const candidates = [
    path.join(WORKSPACE_ROOT, result.slug, 'logs', 'smoke-results.json'),
    path.join(SELF_PROJECT_DIR, 'logs', 'smoke-results.json'),
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        const raw = fs.readFileSync(p, 'utf8');
        return JSON.parse(raw);
      }
    } catch (_) { /* ignore — fall through */ }
  }
  return null;
}

async function main() {
  const line = '═'.repeat(70);
  console.log('');
  console.log(cyan(line));
  console.log(cyan('  ' + bold('ONYX SMOKE-ALL — 4 projects in parallel')));
  console.log(cyan(line));
  console.log('');

  const startedAt = Date.now();
  const results = await Promise.all(TARGETS.map(runOne));
  const duration = Date.now() - startedAt;

  console.log('');
  console.log(cyan('─'.repeat(70)));
  console.log(bold('Per-project results:'));
  console.log(cyan('─'.repeat(70)));
  for (const r of results) {
    const ok = r.exit_code === 0;
    const mark = ok ? green('✓') : red('✗');
    const tag = ok ? green('PASS') : red('FAIL');
    console.log(
      `  ${mark} ${r.label.padEnd(22)} ${tag}  ${gray(
        `exit=${r.exit_code} duration=${r.duration_ms}ms${r.fallback ? ' [fallback]' : ''}`
      )}`
    );
    if (r.error) console.log('    ' + red('error: ' + r.error));
  }
  console.log('');

  // Aggregate summary file
  const logsDir = path.join(SELF_PROJECT_DIR, 'logs');
  try {
    if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
  } catch (_) { /* ignore */ }

  const aggregate = {
    started_at: new Date(startedAt).toISOString(),
    finished_at: new Date().toISOString(),
    duration_ms: duration,
    total_projects: results.length,
    passed_projects: results.filter((r) => r.exit_code === 0).length,
    failed_projects: results.filter((r) => r.exit_code !== 0).length,
    projects: results.map((r) => ({
      slug: r.slug,
      label: r.label,
      base_url: r.base_url,
      exit_code: r.exit_code,
      duration_ms: r.duration_ms,
      fallback: r.fallback,
      error: r.error || null,
      child_summary: extractSummary(r),
    })),
  };

  const outFile = path.join(logsDir, 'smoke-all-results.json');
  try {
    fs.writeFileSync(outFile, JSON.stringify(aggregate, null, 2), 'utf8');
    console.log(gray('  Aggregate JSON → ' + outFile));
  } catch (e) {
    console.log(yellow('⚠  unable to write smoke-all-results.json: ' + e.message));
  }

  const passed = aggregate.passed_projects;
  const failed = aggregate.failed_projects;
  console.log('');
  console.log(cyan('─'.repeat(70)));
  console.log(
    `${bold('Overall:')} ${green(passed + ' passed')}, ${failed ? red(failed + ' failed') : gray('0 failed')}, ${
      results.length
    } total  ${gray(`(${duration}ms)`)}`
  );
  console.log(cyan('─'.repeat(70)));
  console.log('');

  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(red('FATAL: ' + (err && err.stack ? err.stack : err)));
  process.exit(1);
});
