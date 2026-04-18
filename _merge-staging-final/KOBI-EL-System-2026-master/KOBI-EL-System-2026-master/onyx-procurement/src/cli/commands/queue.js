/**
 * onyx-cli queue — background-job queue operations.
 *
 *   queue list            — list pending jobs
 *   queue retry <id>      — requeue a failed job
 *   queue purge           — archive the current queue snapshot (destructive)
 *
 * The CLI reads / writes a JSON snapshot at config.queueFile or
 * ./data/queue.json. Real job engines can override by injecting a
 * custom adapter through ctx.config.queueAdapter in future.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { confirm } = require('../prompt.js');

function queueFile(ctx) {
  if (ctx.flags.file) return path.resolve(String(ctx.flags.file));
  if (ctx.config && ctx.config.queueFile) return path.resolve(ctx.config.queueFile);
  return path.resolve(process.cwd(), 'data', 'queue.json');
}

function readQueue(file) {
  if (!fs.existsSync(file)) return { jobs: [] };
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return { jobs: [] };
  }
}

async function runList(ctx) {
  const file = queueFile(ctx);
  const q = readQueue(file);
  ctx.logger.info(`queue file: ${file}`);
  if (!Array.isArray(q.jobs) || q.jobs.length === 0) {
    ctx.logger.info('  (no jobs / אין עבודות)');
    return 0;
  }
  for (const job of q.jobs) {
    const id = job.id || '?';
    const status = job.status || 'pending';
    const name = job.name || '(unknown)';
    ctx.logger.info(`  ${id.padEnd(10)} ${status.padEnd(9)} ${name}`);
  }
  ctx.logger.info('');
  ctx.logger.ok(`${q.jobs.length} jobs / עבודות`);
  return 0;
}

async function runRetry(ctx) {
  const id = ctx.positional[0];
  if (!id) {
    ctx.logger.err('usage: onyx-cli queue retry <id>');
    return 2;
  }
  const file = queueFile(ctx);
  const q = readQueue(file);
  const job = (q.jobs || []).find((j) => String(j.id) === String(id));
  if (!job) {
    ctx.logger.err(`job not found: ${id}`);
    return 2;
  }
  job.status = 'pending';
  job.retries = (job.retries || 0) + 1;
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(q, null, 2));
    ctx.logger.ok(`job requeued / עבודה הוחזרה לתור: ${id} (retry=${job.retries})`);
    return 0;
  } catch (err) {
    ctx.logger.err(`write failed: ${err.message}`);
    return 1;
  }
}

async function runPurge(ctx) {
  const file = queueFile(ctx);
  if (!fs.existsSync(file)) {
    ctx.logger.warn(`queue file does not exist: ${file}`);
    return 0;
  }
  const ok = await confirm(
    `Purge queue snapshot at "${file}"? / לרוקן את תור העבודות?`,
    { assumeYes: ctx.flags.yes, input: ctx.io && ctx.io.input, output: ctx.io && ctx.io.output }
  );
  if (!ok) {
    ctx.logger.warn('cancelled / בוטל');
    return 1;
  }
  // Archive instead of deleting — upgrade-not-delete rule.
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const archive = `${file}.purged-${stamp}`;
  try {
    fs.renameSync(file, archive);
    fs.writeFileSync(file, JSON.stringify({ jobs: [] }, null, 2));
    ctx.logger.ok(`queue purged / תור נוקה`);
    ctx.logger.info(`  archived → ${archive}`);
    return 0;
  } catch (err) {
    ctx.logger.err(`purge failed: ${err.message}`);
    return 1;
  }
}

module.exports = {
  name: 'queue',
  description: {
    en: 'Background queue (list, retry, purge)',
    he: 'תור עבודות רקע (הצגה, הרצה חוזרת, ניקוי)',
  },
  subcommands: {
    list: {
      description: { en: 'List queued jobs', he: 'הצגת עבודות בתור' },
      usage: 'queue list',
      examples: ['onyx-cli queue list'],
      handler: runList,
    },
    retry: {
      description: { en: 'Requeue a failed job', he: 'החזרת עבודה לתור' },
      usage: 'queue retry <id>',
      examples: ['onyx-cli queue retry 42'],
      handler: runRetry,
    },
    purge: {
      description: { en: 'Archive the queue snapshot and start fresh', he: 'ארכוב המצב הנוכחי וניקוי התור' },
      usage: 'queue purge',
      examples: ['onyx-cli queue purge', 'onyx-cli queue purge --yes'],
      destructive: true,
      handler: runPurge,
    },
  },
  __internals: { queueFile, readQueue },
};
