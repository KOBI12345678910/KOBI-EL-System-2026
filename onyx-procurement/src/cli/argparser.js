/**
 * onyx-cli — minimal zero-dep argument parser.
 *
 * Input:  array of raw argv strings (already sliced past node + script).
 * Output: { group, sub, positional, flags, raw }
 *
 *   onyx-cli db backup --out /tmp/x.sql --force
 *     → { group: 'db', sub: 'backup',
 *         positional: [],
 *         flags: { out: '/tmp/x.sql', force: true },
 *         raw: [...] }
 *
 *   onyx-cli help db migrate
 *     → { group: 'help', sub: null,
 *         positional: ['db', 'migrate'], flags: {}, raw: [...] }
 *
 * Rules:
 *   • First non-flag token is the group, second is the sub-command.
 *     (For single-word commands like `status`, sub is null.)
 *   • --flag=value and --flag value are both accepted.
 *   • --bool becomes true. -h / --help always map to flags.help = true.
 *   • -- ends flag parsing; everything after is positional.
 *   • Unknown flags are kept as-is (handlers decide validity).
 */
'use strict';

const SINGLE_WORD_GROUPS = new Set(['help', 'status']);

function parse(argv) {
  const raw = Array.isArray(argv) ? argv.slice() : [];
  const tokens = raw.slice();
  const positional = [];
  const flags = Object.create(null);

  let passthrough = false;
  while (tokens.length) {
    const tok = tokens.shift();
    if (passthrough) {
      positional.push(tok);
      continue;
    }
    if (tok === '--') {
      passthrough = true;
      continue;
    }
    if (tok === '-h' || tok === '--help') {
      flags.help = true;
      continue;
    }
    if (tok.startsWith('--')) {
      const body = tok.slice(2);
      const eq = body.indexOf('=');
      if (eq !== -1) {
        flags[body.slice(0, eq)] = body.slice(eq + 1);
        continue;
      }
      // peek at next token
      const next = tokens[0];
      if (next === undefined || next.startsWith('-')) {
        flags[body] = true;
      } else {
        flags[body] = tokens.shift();
      }
      continue;
    }
    if (tok.startsWith('-') && tok.length > 1) {
      // short flags: -v, -f ; collapse to boolean true
      flags[tok.slice(1)] = true;
      continue;
    }
    positional.push(tok);
  }

  let group = null;
  let sub = null;
  if (positional.length) {
    group = positional.shift();
    if (!SINGLE_WORD_GROUPS.has(group) && positional.length) {
      sub = positional.shift();
    }
  }
  return { group, sub, positional, flags, raw };
}

module.exports = { parse, SINGLE_WORD_GROUPS };
