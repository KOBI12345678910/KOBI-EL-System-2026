/**
 * onyx-cli help — bilingual help command.
 *
 *   help                 → top-level list of all groups
 *   help <group>         → detailed group help
 *   help <group> <sub>   → detailed sub-command help
 *
 * This module is a thin wrapper around ./help.js formatter — kept in
 * ./commands for symmetry with the other groups so it shows up in
 * `onyx-cli help` itself.
 */
'use strict';

const helpFmt = require('../help.js');

async function runHelp(ctx) {
  const [maybeGroup, maybeSub] = ctx.positional;
  if (!maybeGroup) {
    ctx.logger.info(helpFmt.topLevel({ version: ctx.version }));
    return 0;
  }
  if (!maybeSub) {
    ctx.logger.info(helpFmt.group(maybeGroup));
    return 0;
  }
  ctx.logger.info(helpFmt.command(maybeGroup, maybeSub));
  return 0;
}

module.exports = {
  name: 'help',
  description: {
    en: 'Show help for a command',
    he: 'הצג עזרה לפקודה',
  },
  subcommands: {
    default: {
      description: {
        en: 'Show the help index or detailed help for a command',
        he: 'הצג אינדקס עזרה או עזרה מפורטת לפקודה',
      },
      usage: 'help [command] [sub]',
      examples: ['onyx-cli help', 'onyx-cli help db', 'onyx-cli help db migrate'],
      handler: runHelp,
    },
  },
};
