/**
 * onyx-cli — config loader.
 *
 * Resolution order:
 *   1. Explicit path argument to load().
 *   2. process.env.ONYX_CONFIG  (absolute or relative to cwd).
 *   3. ./config/onyx-cli.json   (relative to cwd).
 *
 * Failure to read a file is *not* fatal — CLI operators can invoke
 * commands from anywhere. Missing file ⇒ returns an empty object so
 * handlers can merge in defaults. Malformed JSON throws a clear error.
 *
 * Config shape (all optional):
 *   {
 *     "apiBase":   "http://localhost:3100",
 *     "logFile":   "./logs/onyx-procurement.log",
 *     "database":  { "host": "...", "name": "..." },
 *     "features":  { "legacyImport": true }
 *   }
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_REL_PATH = path.join('config', 'onyx-cli.json');

function resolvePath(explicit) {
  if (explicit) return path.resolve(explicit);
  if (process.env.ONYX_CONFIG) return path.resolve(process.env.ONYX_CONFIG);
  return path.resolve(process.cwd(), DEFAULT_REL_PATH);
}

function load(explicit) {
  const file = resolvePath(explicit);
  let raw = null;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      return { __file: file, __loaded: false };
    }
    throw err;
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    const msg = `onyx-cli: failed to parse config ${file}: ${err.message}`;
    const wrapped = new Error(msg);
    wrapped.cause = err;
    throw wrapped;
  }
  parsed.__file = file;
  parsed.__loaded = true;
  return parsed;
}

module.exports = { load, resolvePath, DEFAULT_REL_PATH };
