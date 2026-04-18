/**
 * onyx-cli db — database operations.
 *
 * migrate  | seed | backup | restore <file>
 *
 * Each sub-command shells out to an existing scripts/*.js file if
 * available; if not, it logs a clear error and returns exit 2. We
 * never delete data — restore prompts for confirmation and respects
 * --yes.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { confirm } = require('../prompt.js');

const SCRIPTS = {
  migrate: 'scripts/migrate.js',
  seed:    'scripts/seed-data.js',
  backup:  'scripts/backup.js',
  restore: 'scripts/backup-restore.js',
};

function runScript(rel, args, logger) {
  const abs = path.resolve(process.cwd(), rel);
  if (!fs.existsSync(abs)) {
    logger.err(`script not found: ${rel} (expected under scripts/)`);
    return 2;
  }
  logger.info(`→ node ${rel} ${args.join(' ')}`);
  const r = spawnSync(process.execPath, [abs, ...args], {
    stdio: 'inherit',
    env: process.env,
  });
  return r.status == null ? 1 : r.status;
}

async function runMigrate(ctx) {
  return runScript(SCRIPTS.migrate, ctx.flags.status ? ['--status'] : [], ctx.logger);
}

async function runSeed(ctx) {
  return runScript(SCRIPTS.seed, [], ctx.logger);
}

async function runBackup(ctx) {
  const out = ctx.flags.out ? ['--out', String(ctx.flags.out)] : [];
  return runScript(SCRIPTS.backup, out, ctx.logger);
}

async function runRestore(ctx) {
  const file = ctx.positional[0];
  if (!file) {
    ctx.logger.err('usage: onyx-cli db restore <file>');
    return 2;
  }
  if (!fs.existsSync(file)) {
    ctx.logger.err(`backup file not found: ${file}`);
    return 2;
  }
  const ok = await confirm(
    `Restore database from "${file}"? This will OVERWRITE current data / ישכתב את הנתונים הנוכחיים.`,
    { assumeYes: ctx.flags.yes, input: ctx.io && ctx.io.input, output: ctx.io && ctx.io.output }
  );
  if (!ok) {
    ctx.logger.warn('cancelled / בוטל');
    return 1;
  }
  return runScript(SCRIPTS.restore, [file], ctx.logger);
}

module.exports = {
  name: 'db',
  description: {
    en: 'Database operations (migrate, seed, backup, restore)',
    he: 'פעולות מסד נתונים (מיגרציה, סידינג, גיבוי, שחזור)',
  },
  subcommands: {
    migrate: {
      description: { en: 'Apply pending database migrations', he: 'הרצת מיגרציות חסרות' },
      usage: 'db migrate [--status]',
      examples: ['onyx-cli db migrate', 'onyx-cli db migrate --status'],
      handler: runMigrate,
    },
    seed: {
      description: { en: 'Seed demo / reference data', he: 'טעינת נתוני דמו / ייחוס' },
      usage: 'db seed',
      examples: ['onyx-cli db seed'],
      handler: runSeed,
    },
    backup: {
      description: { en: 'Create a database backup file', he: 'יצירת קובץ גיבוי' },
      usage: 'db backup [--out <path>]',
      examples: ['onyx-cli db backup', 'onyx-cli db backup --out ./backups/2026-04.sql'],
      handler: runBackup,
    },
    restore: {
      description: { en: 'Restore database from a backup file', he: 'שחזור מסד נתונים מקובץ גיבוי' },
      usage: 'db restore <file>',
      examples: ['onyx-cli db restore ./backups/2026-04.sql', 'onyx-cli db restore backup.sql --yes'],
      destructive: true,
      handler: runRestore,
    },
  },
};
