/**
 * onyx-cli — minimal ANSI colour helpers.
 *
 * Zero-dependency console colouring. Respects NO_COLOR / ONYX_NO_COLOR
 * and auto-disables when stdout is not a TTY so piping / tests stay clean.
 */
'use strict';

const CODES = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

function colorEnabled() {
  if (process.env.NO_COLOR || process.env.ONYX_NO_COLOR) return false;
  if (process.env.ONYX_FORCE_COLOR) return true;
  return Boolean(process.stdout && process.stdout.isTTY);
}

function wrap(code, text) {
  if (!colorEnabled()) return String(text);
  return `${code}${text}${CODES.reset}`;
}

const paint = {
  bold:    (t) => wrap(CODES.bold, t),
  dim:     (t) => wrap(CODES.dim, t),
  red:     (t) => wrap(CODES.red, t),
  green:   (t) => wrap(CODES.green, t),
  yellow:  (t) => wrap(CODES.yellow, t),
  blue:    (t) => wrap(CODES.blue, t),
  magenta: (t) => wrap(CODES.magenta, t),
  cyan:    (t) => wrap(CODES.cyan, t),
  gray:    (t) => wrap(CODES.gray, t),
};

/** Strip colour codes for tests / non-TTY consumers. */
function strip(text) {
  // eslint-disable-next-line no-control-regex
  return String(text).replace(/\x1b\[[0-9;]*m/g, '');
}

module.exports = { CODES, colorEnabled, paint, strip };
