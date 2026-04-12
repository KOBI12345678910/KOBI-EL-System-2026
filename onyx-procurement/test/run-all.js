/**
 * run-all.js — Agent-15 test aggregator.
 *
 * Discovers every *.test.js under test/ (recursive), runs them via
 * `node --test` as a single child process, parses the TAP stream,
 * and emits a JSON summary to stdout.
 *
 * Exit codes:
 *   0 — all tests passed
 *   1 — one or more test failures
 *   2 — runner error (no files found, spawn failure, etc.)
 *
 * Usage:
 *   node test/run-all.js
 *   node test/run-all.js --json > summary.json
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname);

function discoverTestFiles(dir) {
  const out = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === 'helpers' || e.name === 'fixtures') continue;
      out.push(...discoverTestFiles(full));
    } else if (e.isFile() && /\.test\.js$/.test(e.name)) {
      out.push(full);
    }
  }
  return out;
}

function parseTap(stream) {
  // Minimal TAP counter for Node's built-in reporter.
  const counts = { total: 0, pass: 0, fail: 0, skip: 0, todo: 0 };
  const failures = [];
  const lines = stream.split(/\r?\n/);
  let current = null;
  for (const raw of lines) {
    const line = raw.trimEnd();
    const m = line.match(/^(?:\s*)(ok|not ok)\s+(\d+)\s*-?\s*(.*)$/);
    if (m) {
      counts.total += 1;
      const status = m[1];
      const desc = m[3] || '';
      if (/\s*#\s*SKIP/i.test(desc)) counts.skip += 1;
      else if (/\s*#\s*TODO/i.test(desc)) counts.todo += 1;
      else if (status === 'ok') counts.pass += 1;
      else { counts.fail += 1; current = { desc, detail: [] }; failures.push(current); }
      continue;
    }
    if (current && /^\s{2,}/.test(raw)) current.detail.push(raw);
    else current = null;
  }
  return { counts, failures };
}

function runNodeTest(files) {
  return new Promise((resolve) => {
    const args = ['--test', ...files];
    const proc = spawn(process.execPath, args, { cwd: path.resolve(ROOT, '..'), env: process.env });
    let stdout = '', stderr = '';
    proc.stdout.on('data', (d) => { stdout += d.toString('utf8'); });
    proc.stderr.on('data', (d) => { stderr += d.toString('utf8'); });
    proc.on('error', (err) => resolve({ code: 2, stdout, stderr: stderr + '\n' + err.message }));
    proc.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

(async function main() {
  const t0 = Date.now();
  let files;
  try { files = discoverTestFiles(ROOT); }
  catch (e) {
    process.stdout.write(JSON.stringify({ ok: false, error: e.message }, null, 2) + '\n');
    process.exit(2);
  }
  if (!files.length) {
    process.stdout.write(JSON.stringify({ ok: false, error: 'no *.test.js files found', root: ROOT }, null, 2) + '\n');
    process.exit(2);
  }

  const rel = files.map((f) => path.relative(path.resolve(ROOT, '..'), f).replace(/\\/g, '/'));
  const { code, stdout, stderr } = await runNodeTest(files);
  const parsed = parseTap(stdout);

  const summary = {
    ok: code === 0 && parsed.counts.fail === 0,
    exitCode: code,
    durationMs: Date.now() - t0,
    root: ROOT.replace(/\\/g, '/'),
    discoveredFiles: rel,
    counts: parsed.counts,
    failures: parsed.failures.map((f) => ({ desc: f.desc, detail: f.detail.slice(0, 20) })),
  };

  if (process.argv.includes('--json')) {
    process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
  } else {
    process.stdout.write(stdout);
    if (stderr) process.stderr.write(stderr);
    process.stdout.write('\n' + JSON.stringify(summary, null, 2) + '\n');
  }

  process.exit(summary.ok ? 0 : 1);
})();
