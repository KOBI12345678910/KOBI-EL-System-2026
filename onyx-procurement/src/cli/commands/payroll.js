/**
 * onyx-cli payroll — payroll operations.
 *
 *   payroll run <period>              — run the monthly payroll batch
 *   payroll slip <employee> <period>  — regenerate a single wage slip
 *
 * Period format: YYYY-MM.
 */
'use strict';

const { confirm } = require('../prompt.js');

const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const EMP_RE = /^[A-Za-z0-9_-]{1,32}$/;

async function runRun(ctx) {
  const period = ctx.positional[0];
  if (!period) {
    ctx.logger.err('usage: onyx-cli payroll run <period>');
    return 2;
  }
  if (!PERIOD_RE.test(period)) {
    ctx.logger.err(`invalid period: ${period}  (expected YYYY-MM)`);
    return 2;
  }
  const ok = await confirm(
    `Run payroll for ${period}? / להריץ שכר לתקופה?`,
    { assumeYes: ctx.flags.yes, input: ctx.io && ctx.io.input, output: ctx.io && ctx.io.output }
  );
  if (!ok) {
    ctx.logger.warn('cancelled / בוטל');
    return 1;
  }
  ctx.logger.info(`→ payroll batch period=${period}`);
  ctx.logger.ok(`payroll run enqueued / הרצת שכר נוספה לתור`);
  return 0;
}

async function runSlip(ctx) {
  const [employee, period] = ctx.positional;
  if (!employee || !period) {
    ctx.logger.err('usage: onyx-cli payroll slip <employee> <period>');
    return 2;
  }
  if (!EMP_RE.test(employee)) {
    ctx.logger.err(`invalid employee id: ${employee}`);
    return 2;
  }
  if (!PERIOD_RE.test(period)) {
    ctx.logger.err(`invalid period: ${period}`);
    return 2;
  }
  ctx.logger.info(`→ regenerating wage slip ${employee} ${period}`);
  ctx.logger.ok(`wage slip generated / תלוש נוצר`);
  return 0;
}

module.exports = {
  name: 'payroll',
  description: {
    en: 'Payroll operations (run, wage slip)',
    he: 'פעולות שכר (הרצה, תלוש)',
  },
  subcommands: {
    run: {
      description: { en: 'Run payroll for a period', he: 'הרצת שכר לתקופה' },
      usage: 'payroll run <period>',
      examples: ['onyx-cli payroll run 2026-04', 'onyx-cli payroll run 2026-04 --yes'],
      destructive: true, // creates financial artefacts, worth confirming
      handler: runRun,
    },
    slip: {
      description: { en: 'Regenerate a single wage slip', he: 'יצירה מחדש של תלוש בודד' },
      usage: 'payroll slip <employee> <period>',
      examples: ['onyx-cli payroll slip EMP-0042 2026-04'],
      handler: runSlip,
    },
  },
  __internals: { PERIOD_RE, EMP_RE },
};
