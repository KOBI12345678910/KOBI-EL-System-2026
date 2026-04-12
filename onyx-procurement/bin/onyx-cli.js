#!/usr/bin/env node
/**
 * onyx-cli — admin CLI for the Techno-Kol Uzi Mega-ERP.
 *
 * Zero external dependencies (core node only). See
 * `src/cli/dispatcher.js` and `src/cli/commands/*.js` for the
 * command implementations. This entry file is intentionally thin
 * so that future command groups can be added without touching it.
 *
 * Rule: לא מוחקים רק משדרגים ומגדלים.
 *
 * Usage:
 *   onyx-cli <command> [sub] [args] [flags]
 *   onyx-cli help [command]
 */
'use strict';

const path = require('node:path');

// Resolve dispatcher via absolute path so the bin works whether it's
// invoked via `node bin/onyx-cli.js`, `./bin/onyx-cli.js`, or npx.
const dispatcher = require(path.join(__dirname, '..', 'src', 'cli', 'dispatcher.js'));

let version = '1.1.0';
try {
  // best-effort version discovery; failure is non-fatal
  const pkg = require(path.join(__dirname, '..', 'package.json'));
  if (pkg && pkg.version) version = pkg.version;
} catch (_err) {
  /* ignore */
}

// --version short-circuit
const rawArgs = process.argv.slice(2);
if (rawArgs.includes('--version') || rawArgs.includes('-v')) {
  process.stdout.write(`onyx-cli ${version}\n`);
  process.exit(0);
}

dispatcher
  .exec(rawArgs, { version })
  .then((code) => {
    process.exit(Number.isInteger(code) ? code : 0);
  })
  .catch((err) => {
    process.stderr.write(`onyx-cli: fatal: ${err.message}\n`);
    if (process.env.ONYX_CLI_DEBUG) {
      process.stderr.write(String(err.stack || err) + '\n');
    }
    process.exit(3);
  });
