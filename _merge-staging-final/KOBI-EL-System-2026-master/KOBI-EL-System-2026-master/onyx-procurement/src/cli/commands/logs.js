/**
 * onyx-cli logs — tail / search the application log file.
 *
 *   logs tail [--lines N] [--file <path>]
 *   logs search <query> [--file <path>] [--limit N]
 *
 * We read the latest log file from config.logFile, falling back to
 * ./logs/onyx-procurement.log. Reads are streamed, not slurped, so
 * large log files don't blow up the CLI.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');

function resolveFile(ctx) {
  if (ctx.flags.file) return path.resolve(String(ctx.flags.file));
  if (ctx.config && ctx.config.logFile) return path.resolve(ctx.config.logFile);
  return path.resolve(process.cwd(), 'logs', 'onyx-procurement.log');
}

async function runTail(ctx) {
  const file = resolveFile(ctx);
  if (!fs.existsSync(file)) {
    ctx.logger.err(`log file not found: ${file}`);
    return 2;
  }
  const lines = Number(ctx.flags.lines || 50);
  // Read lines into a circular buffer so we only keep the last N.
  const buf = new Array(lines).fill(null);
  let idx = 0;
  let count = 0;
  await new Promise((resolve, reject) => {
    const rl = readline.createInterface({
      input: fs.createReadStream(file, { encoding: 'utf8' }),
    });
    rl.on('line', (line) => {
      buf[idx] = line;
      idx = (idx + 1) % lines;
      count += 1;
    });
    rl.on('close', resolve);
    rl.on('error', reject);
  });
  const ordered = [];
  if (count < lines) {
    for (let i = 0; i < count; i += 1) ordered.push(buf[i]);
  } else {
    for (let i = 0; i < lines; i += 1) ordered.push(buf[(idx + i) % lines]);
  }
  for (const line of ordered) ctx.logger.info(line);
  return 0;
}

async function runSearch(ctx) {
  const query = ctx.positional[0];
  if (!query) {
    ctx.logger.err('usage: onyx-cli logs search <query>');
    return 2;
  }
  const file = resolveFile(ctx);
  if (!fs.existsSync(file)) {
    ctx.logger.err(`log file not found: ${file}`);
    return 2;
  }
  const limit = Number(ctx.flags.limit || 200);
  let hits = 0;
  await new Promise((resolve, reject) => {
    const rl = readline.createInterface({
      input: fs.createReadStream(file, { encoding: 'utf8' }),
    });
    rl.on('line', (line) => {
      if (line.includes(query)) {
        if (hits < limit) ctx.logger.info(line);
        hits += 1;
      }
    });
    rl.on('close', resolve);
    rl.on('error', reject);
  });
  ctx.logger.info('');
  ctx.logger.ok(`${hits} matches / התאמות${hits > limit ? ` (showing ${limit})` : ''}`);
  return hits > 0 ? 0 : 1;
}

module.exports = {
  name: 'logs',
  description: {
    en: 'Log tail / search',
    he: 'צפייה וחיפוש בלוגים',
  },
  subcommands: {
    tail: {
      description: { en: 'Show the last N log lines', he: 'הצג את השורות האחרונות ביומן' },
      usage: 'logs tail [--lines N] [--file <path>]',
      examples: ['onyx-cli logs tail', 'onyx-cli logs tail --lines 200'],
      handler: runTail,
    },
    search: {
      description: { en: 'Search the log file', he: 'חיפוש ביומן' },
      usage: 'logs search <query> [--limit N] [--file <path>]',
      examples: ['onyx-cli logs search "VAT error"', 'onyx-cli logs search 404 --limit 50'],
      handler: runSearch,
    },
  },
  __internals: { resolveFile },
};
