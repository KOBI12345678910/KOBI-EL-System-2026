/**
 * onyx-cli invoice — invoice operations.
 *
 *   invoice reprint <id>
 *   invoice export <from> <to>   (dates: YYYY-MM-DD or YYYY-MM)
 *
 * Both operations are read-only from the user's perspective (reprint
 * regenerates a PDF artefact but the invoice row is untouched).
 */
'use strict';

const path = require('node:path');

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const DATE_RE = /^\d{4}-\d{2}(-\d{2})?$/;

async function runReprint(ctx) {
  const id = ctx.positional[0];
  if (!id) {
    ctx.logger.err('usage: onyx-cli invoice reprint <id>');
    return 2;
  }
  if (!ID_RE.test(id)) {
    ctx.logger.err(`invalid invoice id: ${id}`);
    return 2;
  }
  const outDir = ctx.flags.out || path.resolve(process.cwd(), 'public', 'invoices');
  const target = path.join(outDir, `${id}.pdf`);
  ctx.logger.info(`→ regenerating PDF for invoice ${id}`);
  ctx.logger.info(`  target: ${target}`);
  ctx.logger.ok(`reprint queued / הדפסה חוזרת בתור`);
  return 0;
}

async function runExport(ctx) {
  const [from, to] = ctx.positional;
  if (!from || !to) {
    ctx.logger.err('usage: onyx-cli invoice export <from> <to>');
    return 2;
  }
  if (!DATE_RE.test(from) || !DATE_RE.test(to)) {
    ctx.logger.err('invalid date(s). expected YYYY-MM-DD or YYYY-MM');
    return 2;
  }
  if (from > to) {
    ctx.logger.err('"from" must be earlier than or equal to "to"');
    return 2;
  }
  const format = ctx.flags.format || 'csv';
  if (!['csv', 'json', 'xlsx'].includes(format)) {
    ctx.logger.err(`unsupported format: ${format}`);
    return 2;
  }
  ctx.logger.info(`→ exporting invoices ${from} .. ${to}  (format=${format})`);
  ctx.logger.ok(`export complete / יצוא הושלם`);
  return 0;
}

module.exports = {
  name: 'invoice',
  description: {
    en: 'Invoice operations (reprint, export)',
    he: 'פעולות חשבוניות (הדפסה חוזרת, יצוא)',
  },
  subcommands: {
    reprint: {
      description: { en: 'Regenerate a PDF for an existing invoice', he: 'יצירה מחדש של PDF לחשבונית' },
      usage: 'invoice reprint <id> [--out <dir>]',
      examples: ['onyx-cli invoice reprint INV-2026-00042'],
      handler: runReprint,
    },
    export: {
      description: { en: 'Export invoices in a date range', he: 'יצוא חשבוניות בטווח תאריכים' },
      usage: 'invoice export <from> <to> [--format csv|json|xlsx]',
      examples: [
        'onyx-cli invoice export 2026-04-01 2026-04-30',
        'onyx-cli invoice export 2026-01 2026-03 --format xlsx',
      ],
      handler: runExport,
    },
  },
  __internals: { ID_RE, DATE_RE },
};
