#!/usr/bin/env node
/**
 * ONYX — validate-env-all
 * Runs scripts/validate-env.js across every sibling project that has both
 * a package.json and at least one of { server.js | src/*.js }.
 *
 * Projects detected automatically under the parent folder. You can also
 * pass an explicit list:
 *
 *   node scripts/validate-env-all.js
 *   node scripts/validate-env-all.js --strict
 *   node scripts/validate-env-all.js onyx-procurement onyx-ai AI-Task-Manager payroll-autonomous
 *
 * Exit codes:
 *   0 = every project passed
 *   1 = at least one project failed
 */

'use strict';

const fs        = require('fs');
const path      = require('path');
const { spawnSync } = require('child_process');

const argv = process.argv.slice(2);
const FLAGS = {
  strict : argv.includes('--strict'),
  fix    : argv.includes('--fix'),
  quiet  : argv.includes('--quiet'),
  json   : argv.includes('--json'),
};
const explicit = argv.filter(a => !a.startsWith('--'));

const THIS_PROJECT = path.resolve(__dirname, '..');           // onyx-procurement
const WORKSPACE_ROOT = path.resolve(THIS_PROJECT, '..');      // "המערכת 2026  KOBI EL"
const VALIDATOR = path.join(THIS_PROJECT, 'scripts', 'validate-env.js');

// ─────────────────────────────────────────────────────────────────────────────
function discoverProjects() {
  if (explicit.length) {
    return explicit.map(n => path.resolve(WORKSPACE_ROOT, n)).filter(p => fs.existsSync(p));
  }
  /** @type {string[]} */
  const out = [];
  let entries;
  try { entries = fs.readdirSync(WORKSPACE_ROOT, { withFileTypes: true }); }
  catch { return out; }

  for (const e of entries) {
    if (!e.isDirectory()) continue;
    if (e.name.startsWith('.') || e.name === 'node_modules' || e.name === '_qa-reports') continue;
    const dir = path.join(WORKSPACE_ROOT, e.name);
    const hasPkg = fs.existsSync(path.join(dir, 'package.json'));
    if (!hasPkg) continue;
    const hasServer = fs.existsSync(path.join(dir, 'server.js'));
    const hasSrc    = fs.existsSync(path.join(dir, 'src'));
    if (hasServer || hasSrc) out.push(dir);
  }
  return out;
}

function runValidator(projectDir) {
  const args = [VALIDATOR, '--project=' + projectDir];
  if (FLAGS.strict) args.push('--strict');
  if (FLAGS.fix)    args.push('--fix');
  if (FLAGS.quiet)  args.push('--quiet');
  if (FLAGS.json)   args.push('--json');
  const r = spawnSync(process.execPath, args, { stdio: 'inherit' });
  return r.status == null ? 2 : r.status;
}

// ─────────────────────────────────────────────────────────────────────────────
function main() {
  const projects = discoverProjects();
  if (!projects.length) {
    console.error('validate-env-all: no projects found under ' + WORKSPACE_ROOT);
    process.exit(2);
  }

  const bold = (s) => (process.stdout.isTTY ? '\x1b[1m' + s + '\x1b[0m' : s);
  const green = (s) => (process.stdout.isTTY ? '\x1b[32m' + s + '\x1b[0m' : s);
  const red   = (s) => (process.stdout.isTTY ? '\x1b[31m' + s + '\x1b[0m' : s);

  console.log(bold('\n╔═══════════════════════════════════════════════════╗'));
  console.log(bold('║  validate-env-all — running on ' + String(projects.length).padEnd(3) + ' projects       ║'));
  console.log(bold('╚═══════════════════════════════════════════════════╝'));

  /** @type {Array<{name:string, status:number}>} */
  const results = [];
  for (const p of projects) {
    const name = path.basename(p);
    const hasOwnValidator = fs.existsSync(path.join(p, 'scripts', 'validate-env.js')) &&
                            path.resolve(p) !== path.resolve(THIS_PROJECT);
    let status;
    if (hasOwnValidator) {
      // Use the project's own validator if it has one — stays local, respects per-project rules.
      const args = [path.join(p, 'scripts', 'validate-env.js')];
      if (FLAGS.strict) args.push('--strict');
      if (FLAGS.fix)    args.push('--fix');
      if (FLAGS.quiet)  args.push('--quiet');
      if (FLAGS.json)   args.push('--json');
      const r = spawnSync(process.execPath, args, { cwd: p, stdio: 'inherit' });
      status = r.status == null ? 2 : r.status;
    } else {
      status = runValidator(p);
    }
    results.push({ name, status });
  }

  console.log('\n' + bold('── aggregate summary ──'));
  let failed = 0;
  for (const r of results) {
    const tag = r.status === 0 ? green('PASS') : red('FAIL(' + r.status + ')');
    console.log('  ' + tag + '  ' + r.name);
    if (r.status !== 0) failed++;
  }
  console.log('');
  if (failed) {
    console.error(red(bold(`FAIL: ${failed}/${results.length} project(s) failed env validation.`)));
    process.exit(1);
  }
  console.log(green(bold(`PASS: all ${results.length} project(s) have valid env.`)));
  process.exit(0);
}

if (require.main === module) main();
