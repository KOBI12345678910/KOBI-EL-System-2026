/**
 * onyx-cli — tiny structured console logger.
 *
 * Wraps process.stdout / process.stderr with leveled output and colour.
 * Separate from the server-side pino logger — the CLI is short-lived
 * and we want plain human output by default.
 */
'use strict';

const { paint } = require('./ansi.js');

function create(stream) {
  const out = stream || process.stdout;
  const err = process.stderr;
  return {
    info:  (msg) => out.write(String(msg) + '\n'),
    ok:    (msg) => out.write(paint.green('✓ ') + String(msg) + '\n'),
    warn:  (msg) => err.write(paint.yellow('⚠ ') + String(msg) + '\n'),
    err:   (msg) => err.write(paint.red('✗ ') + String(msg) + '\n'),
    debug: (msg) => {
      if (process.env.ONYX_CLI_DEBUG) {
        err.write(paint.gray('[debug] ' + String(msg)) + '\n');
      }
    },
    raw:   (msg) => out.write(String(msg)),
    rawErr:(msg) => err.write(String(msg)),
  };
}

module.exports = { create };
