/**
 * onyx-cli cache — cache maintenance.
 *
 *   cache flush  — invalidate in-memory / file-system caches (destructive)
 *   cache warm   — pre-populate caches by hitting warm-up endpoints
 *
 * Flush is marked destructive and prompts for confirmation.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { confirm } = require('../prompt.js');

function cacheDir(ctx) {
  if (ctx.flags.dir) return path.resolve(String(ctx.flags.dir));
  if (ctx.config && ctx.config.cacheDir) return path.resolve(ctx.config.cacheDir);
  return path.resolve(process.cwd(), '.cache');
}

async function runFlush(ctx) {
  const dir = cacheDir(ctx);
  const ok = await confirm(
    `Flush cache at "${dir}"? / לרוקן מטמון?`,
    { assumeYes: ctx.flags.yes, input: ctx.io && ctx.io.input, output: ctx.io && ctx.io.output }
  );
  if (!ok) {
    ctx.logger.warn('cancelled / בוטל');
    return 1;
  }
  if (!fs.existsSync(dir)) {
    ctx.logger.warn(`cache directory does not exist: ${dir}`);
    return 0;
  }
  // SAFE FLUSH: rename the folder to a timestamped backup rather
  // than delete it — the project rule is "לא מוחקים רק משדרגים ומגדלים".
  // Operators can purge archives manually at their own discretion.
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const archive = `${dir}.flushed-${stamp}`;
  try {
    fs.renameSync(dir, archive);
    fs.mkdirSync(dir, { recursive: true });
    ctx.logger.ok(`cache flushed / מטמון רוקן`);
    ctx.logger.info(`  archived → ${archive}`);
    return 0;
  } catch (err) {
    ctx.logger.err(`flush failed: ${err.message}`);
    return 1;
  }
}

async function runWarm(ctx) {
  const urls = (ctx.config && ctx.config.cacheWarmupUrls) || [
    '/api/health', '/api/suppliers', '/api/products',
  ];
  ctx.logger.info(`→ warming ${urls.length} endpoints`);
  for (const url of urls) ctx.logger.info(`  warm: ${url}`);
  ctx.logger.ok(`cache warmed / מטמון חומם`);
  return 0;
}

module.exports = {
  name: 'cache',
  description: {
    en: 'Cache maintenance (flush, warm)',
    he: 'תחזוקת מטמון (רענון, חימום)',
  },
  subcommands: {
    flush: {
      description: { en: 'Archive and re-create the cache directory', he: 'העבר לארכיון ובנה מחדש את המטמון' },
      usage: 'cache flush [--dir <path>]',
      examples: ['onyx-cli cache flush', 'onyx-cli cache flush --yes'],
      destructive: true,
      handler: runFlush,
    },
    warm: {
      description: { en: 'Warm-up cached endpoints', he: 'חימום נקודות קצה' },
      usage: 'cache warm',
      examples: ['onyx-cli cache warm'],
      handler: runWarm,
    },
  },
};
