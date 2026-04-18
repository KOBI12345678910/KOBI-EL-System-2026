/**
 * onyx-cli — command dispatcher.
 *
 * Loads all built-in command modules, registers them, parses argv,
 * and invokes the matching handler. Exposes an `exec()` function
 * used by both bin/onyx-cli.js and the test suite so tests never
 * need to spawn a subprocess.
 *
 * Exit codes (contract, stable):
 *   0   success
 *   1   runtime failure (cancelled confirm, failed op)
 *   2   usage / argument error (bad flag, missing arg, unknown cmd)
 *   3   unexpected exception (logged + stack trace when DEBUG set)
 */
'use strict';

const registry = require('./registry.js');
const argparser = require('./argparser.js');
const configLoader = require('./config.js');
const { create: createLogger } = require('./logger.js');
const helpFmt = require('./help.js');

const EXIT = { OK: 0, FAIL: 1, USAGE: 2, EXCEPTION: 3 };

let builtInsLoaded = false;

/**
 * Load the built-in command modules once. Subsequent calls are cheap.
 * External modules can still call registry.register() to extend.
 */
function loadBuiltIns() {
  if (builtInsLoaded) return;
  const modules = [
    require('./commands/help.js'),
    require('./commands/status.js'),
    require('./commands/db.js'),
    require('./commands/user.js'),
    require('./commands/invoice.js'),
    require('./commands/payroll.js'),
    require('./commands/vat.js'),
    require('./commands/logs.js'),
    require('./commands/cache.js'),
    require('./commands/queue.js'),
    require('./commands/webhook.js'),
  ];
  for (const mod of modules) {
    if (!registry.get(mod.name)) registry.register(mod);
  }
  builtInsLoaded = true;
}

/**
 * Execute a CLI invocation.
 *
 * @param {string[]} argv     — raw args, already sliced (no node, no script)
 * @param {object}   [opts]
 * @param {object}   [opts.logger]   — override logger (tests)
 * @param {object}   [opts.config]   — pre-loaded config (tests)
 * @param {object}   [opts.io]       — { input, output } streams for prompts
 * @param {string}   [opts.version]
 * @returns {Promise<number>} exit code
 */
async function exec(argv, opts = {}) {
  loadBuiltIns();
  const parsed = argparser.parse(argv);
  const logger = opts.logger || createLogger();

  // --help / help command on nothing → top-level help
  if ((!parsed.group || parsed.group === 'help') && parsed.flags.help) {
    logger.info(helpFmt.topLevel({ version: opts.version }));
    return EXIT.OK;
  }
  if (!parsed.group) {
    logger.info(helpFmt.topLevel({ version: opts.version }));
    return EXIT.OK;
  }

  let config = opts.config;
  if (!config) {
    try {
      config = configLoader.load(parsed.flags.config);
    } catch (err) {
      logger.err(err.message);
      return EXIT.EXCEPTION;
    }
  }

  // Resolve the group.
  const group = registry.get(parsed.group);
  if (!group) {
    logger.err(`unknown command: ${parsed.group}`);
    logger.info('run "onyx-cli help" for the list of commands');
    return EXIT.USAGE;
  }

  // Help inside a known group.
  if (parsed.flags.help) {
    if (parsed.sub) {
      logger.info(helpFmt.command(parsed.group, parsed.sub));
    } else {
      logger.info(helpFmt.group(parsed.group));
    }
    return EXIT.OK;
  }

  // Pick the sub-command.
  let sub;
  if (argparser.SINGLE_WORD_GROUPS.has(parsed.group)) {
    sub = group.subcommands.default;
  } else if (!parsed.sub) {
    logger.info(helpFmt.group(parsed.group));
    return EXIT.USAGE;
  } else {
    sub = group.subcommands[parsed.sub];
  }

  if (!sub) {
    logger.err(`unknown sub-command: ${parsed.group} ${parsed.sub || ''}`.trim());
    logger.info(helpFmt.group(parsed.group));
    return EXIT.USAGE;
  }

  // Dispatch.
  const ctx = {
    group: parsed.group,
    sub: parsed.sub,
    positional: parsed.positional,
    flags: parsed.flags,
    logger,
    config: config || {},
    io: opts.io || null,
    version: opts.version,
  };
  try {
    const code = await sub.handler(ctx);
    const numeric = Number.isInteger(code) ? code : 0;
    return numeric;
  } catch (err) {
    logger.err(`unexpected error: ${err.message}`);
    if (process.env.ONYX_CLI_DEBUG) {
      logger.rawErr(String(err.stack || err) + '\n');
    }
    return EXIT.EXCEPTION;
  }
}

module.exports = { exec, loadBuiltIns, EXIT, registry };
