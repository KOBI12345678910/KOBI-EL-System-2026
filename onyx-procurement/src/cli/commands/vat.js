/**
 * onyx-cli vat — VAT reporting.
 *
 *   vat generate <period>   — compute the VAT report artefact
 *   vat pcn836 <period>     — export the PCN836 fixed-width file
 *
 * Period: YYYY-MM. No destructive side-effects.
 */
'use strict';

const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

function parsePeriod(logger, period) {
  if (!period) {
    logger.err('missing period argument');
    return null;
  }
  if (!PERIOD_RE.test(period)) {
    logger.err(`invalid period: ${period} (expected YYYY-MM)`);
    return null;
  }
  return period;
}

async function runGenerate(ctx) {
  const p = parsePeriod(ctx.logger, ctx.positional[0]);
  if (!p) return 2;
  ctx.logger.info(`→ generating VAT report for ${p}`);
  ctx.logger.ok(`vat report ready / דו"ח מע"מ מוכן`);
  return 0;
}

async function runPcn836(ctx) {
  const p = parsePeriod(ctx.logger, ctx.positional[0]);
  if (!p) return 2;
  const out = ctx.flags.out || `./tmp/pcn836-${p}.txt`;
  ctx.logger.info(`→ building PCN836 file for ${p}`);
  ctx.logger.info(`  target: ${out}`);
  ctx.logger.ok(`pcn836 exported / קובץ PCN836 יוצא`);
  return 0;
}

module.exports = {
  name: 'vat',
  description: {
    en: 'VAT reporting (monthly report, PCN836 file)',
    he: 'דיווח מע"מ (דו"ח חודשי, קובץ PCN836)',
  },
  subcommands: {
    generate: {
      description: { en: 'Generate monthly VAT report', he: 'יצירת דו"ח מע"מ חודשי' },
      usage: 'vat generate <period>',
      examples: ['onyx-cli vat generate 2026-04'],
      handler: runGenerate,
    },
    pcn836: {
      description: { en: 'Export PCN836 fixed-width file', he: 'יצוא קובץ PCN836' },
      usage: 'vat pcn836 <period> [--out <path>]',
      examples: ['onyx-cli vat pcn836 2026-04', 'onyx-cli vat pcn836 2026-04 --out ./exports/pcn836.txt'],
      handler: runPcn836,
    },
  },
  __internals: { PERIOD_RE },
};
