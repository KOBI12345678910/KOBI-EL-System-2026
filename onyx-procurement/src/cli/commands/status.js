/**
 * onyx-cli status — system health check.
 *
 * Walks a small list of synthetic checks (config load, queue worker
 * presence, log directory writable) and prints PASS / FAIL summary.
 * Returns exit code 0 on all-pass, 1 on any failure.
 *
 * The real implementations are expected to plug in via
 * ctx.config.healthChecks in future; for now we do lightweight
 * filesystem + env probing so the CLI is useful even without a
 * running server.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { paint } = require('../ansi.js');

const EXIT = { OK: 0, FAIL: 1 };

async function run(ctx) {
  const { logger, config } = ctx;
  const checks = [];

  // 1) config loaded?
  checks.push({
    name: 'config file',
    he: 'קובץ תצורה',
    ok: Boolean(config && (config.__loaded || Object.keys(config).length > 2)),
    detail: config && config.__file ? config.__file : '(none)',
  });

  // 2) Node runtime
  checks.push({
    name: 'node runtime',
    he: 'סביבת Node',
    ok: process.versions && Number(process.versions.node.split('.')[0]) >= 18,
    detail: process.versions ? process.versions.node : 'unknown',
  });

  // 3) logs directory writable
  const logsDir = (config && config.logsDir) || path.resolve(process.cwd(), 'logs');
  let logsOk = false;
  let logsDetail = logsDir;
  try {
    if (fs.existsSync(logsDir)) {
      fs.accessSync(logsDir, fs.constants.W_OK);
      logsOk = true;
    } else {
      logsDetail += ' (missing)';
    }
  } catch (err) {
    logsDetail += ' (' + err.code + ')';
  }
  checks.push({ name: 'logs dir', he: 'תיקיית לוגים', ok: logsOk, detail: logsDetail });

  // 4) queue script present (best-effort)
  const queueScript = path.resolve(process.cwd(), 'scripts', 'queue-worker.js');
  checks.push({
    name: 'queue worker',
    he: 'תהליך תור',
    ok: fs.existsSync(queueScript),
    detail: queueScript,
  });

  let failed = 0;
  logger.info(paint.bold('onyx-cli status / בדיקת מערכת'));
  for (const c of checks) {
    const tag = c.ok ? paint.green('PASS') : paint.red('FAIL');
    logger.info(`  [${tag}] ${c.name.padEnd(14)} ${paint.gray(c.he)}  ${paint.dim(c.detail)}`);
    if (!c.ok) failed += 1;
  }
  logger.info('');
  if (failed === 0) {
    logger.ok(`All ${checks.length} checks passed / כל הבדיקות עברו`);
    return EXIT.OK;
  }
  logger.err(`${failed} / ${checks.length} checks failed`);
  return EXIT.FAIL;
}

module.exports = {
  name: 'status',
  description: {
    en: 'System health check',
    he: 'בדיקת תקינות מערכת',
  },
  subcommands: {
    // single-word command: the sub is synthetic "default"
    default: {
      description: {
        en: 'Run the full health-check suite',
        he: 'הרץ את בדיקת התקינות המלאה',
      },
      usage: 'status',
      examples: ['onyx-cli status', 'onyx-cli status --config ./config/onyx-cli.json'],
      handler: run,
    },
  },
};
