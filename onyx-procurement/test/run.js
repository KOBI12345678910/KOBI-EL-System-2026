#!/usr/bin/env node
/**
 * test/run.js
 * ----------------------------------------------------------------
 * Minimal test runner for the onyx-procurement repo.
 *
 * Discovers every *.test.js file inside the `test/` directory
 * (recursively) and invokes Node's built-in test runner (`node --test`).
 *
 * Usage:
 *     node test/run.js
 *     node test/run.js --only wage-slip   # pattern filter
 *
 * Requires: Node.js >= 18 (for node:test)
 * ----------------------------------------------------------------
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const TEST_DIR = __dirname;

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      walk(full, out);
    } else if (entry.isFile() && entry.name.endsWith('.test.js')) {
      out.push(full);
    }
  }
  return out;
}

function parseArgs(argv) {
  const args = { only: null };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--only' && argv[i + 1]) {
      args.only = argv[++i];
    }
  }
  return args;
}

function main() {
  const { only } = parseArgs(process.argv);
  const allFiles = walk(TEST_DIR).sort();
  const files = only
    ? allFiles.filter((f) => f.includes(only))
    : allFiles;

  if (files.length === 0) {
    console.error(
      `[test/run.js] No .test.js files found in ${TEST_DIR}` +
      (only ? ` matching "${only}"` : '')
    );
    process.exit(1);
  }

  console.log(`[test/run.js] Running ${files.length} test file(s) with node --test`);
  for (const f of files) console.log('  -', path.relative(process.cwd(), f));

  // Spawn `node --test <files>` so the built-in runner handles reporting.
  const child = spawn(process.execPath, ['--test', ...files], {
    stdio: 'inherit',
  });

  child.on('exit', (code, signal) => {
    if (signal) {
      console.error(`[test/run.js] node --test terminated by signal ${signal}`);
      process.exit(1);
    }
    process.exit(code ?? 1);
  });
}

main();
