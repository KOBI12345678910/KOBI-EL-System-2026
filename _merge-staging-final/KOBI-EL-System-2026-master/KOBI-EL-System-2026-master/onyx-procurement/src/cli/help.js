/**
 * onyx-cli — help formatter (bilingual Hebrew + English).
 *
 * Renders:
 *   • top-level help (list of all registered groups with one-liners)
 *   • group help     (`onyx-cli help db`)
 *   • command help   (`onyx-cli help db migrate`)
 *
 * Output uses ANSI colouring via ./ansi when attached to a TTY.
 */
'use strict';

const { paint } = require('./ansi.js');
const registry = require('./registry.js');

const BANNER = 'onyx-cli — Techno-Kol Uzi Mega-ERP admin CLI / כלי ניהול';
const RULE = '────────────────────────────────────────────────────────';

/** Lines for the top-level help listing. */
function topLevel(opts = {}) {
  const lines = [];
  lines.push(paint.bold(BANNER));
  lines.push(paint.gray(RULE));
  lines.push('');
  lines.push(paint.bold('USAGE / שימוש:'));
  lines.push('  onyx-cli <command> [sub-command] [args] [flags]');
  lines.push('  onyx-cli help [command]         # detailed help / עזרה מפורטת');
  lines.push('');
  lines.push(paint.bold('COMMANDS / פקודות:'));
  const names = registry.list();
  const width = Math.max(10, ...names.map((n) => n.length));
  for (const name of names) {
    const g = registry.get(name);
    const he = g.description && g.description.he ? g.description.he : '';
    const en = g.description && g.description.en ? g.description.en : '';
    lines.push(
      '  ' +
        paint.cyan(name.padEnd(width)) +
        '  ' +
        en +
        (he ? paint.gray('  ·  ' + he) : '')
    );
  }
  lines.push('');
  lines.push(paint.bold('GLOBAL FLAGS / דגלים גלובליים:'));
  lines.push('  -h, --help        Show help / הצג עזרה');
  lines.push('      --yes         Assume yes on confirmations / אשר אוטומטית');
  lines.push('      --config <f>  Override config file path / נתיב קובץ תצורה');
  lines.push('      --no-color    Disable ANSI colour / בטל צבעים');
  lines.push('');
  lines.push(paint.gray('Rule: לא מוחקים רק משדרגים ומגדלים.'));
  if (opts.version) lines.push(paint.gray(`version: ${opts.version}`));
  return lines.join('\n');
}

/** Lines for `help <group>`. */
function group(name) {
  const g = registry.get(name);
  if (!g) return `Unknown command: ${name}`;
  const lines = [];
  lines.push(paint.bold(`onyx-cli ${name}`));
  lines.push(paint.gray(RULE));
  if (g.description) {
    if (g.description.en) lines.push('  ' + g.description.en);
    if (g.description.he) lines.push('  ' + paint.gray(g.description.he));
  }
  lines.push('');
  lines.push(paint.bold('SUB-COMMANDS / פקודות משנה:'));
  const subs = Object.keys(g.subcommands).sort();
  const width = Math.max(8, ...subs.map((s) => s.length));
  for (const sub of subs) {
    const entry = g.subcommands[sub];
    const en = entry.description && entry.description.en ? entry.description.en : '';
    const he = entry.description && entry.description.he ? entry.description.he : '';
    lines.push(
      '  ' +
        paint.cyan((sub).padEnd(width)) +
        '  ' +
        en +
        (he ? paint.gray('  ·  ' + he) : '')
    );
  }
  lines.push('');
  lines.push(`Run "onyx-cli help ${name} <sub>" for details.`);
  return lines.join('\n');
}

/** Lines for `help <group> <sub>`. */
function command(groupName, subName) {
  const g = registry.get(groupName);
  if (!g) return `Unknown command: ${groupName}`;
  const entry = g.subcommands[subName];
  if (!entry) return `Unknown sub-command: ${groupName} ${subName}`;
  const lines = [];
  lines.push(paint.bold(`onyx-cli ${groupName} ${subName}`));
  lines.push(paint.gray(RULE));
  if (entry.description && entry.description.en) {
    lines.push('  ' + entry.description.en);
  }
  if (entry.description && entry.description.he) {
    lines.push('  ' + paint.gray(entry.description.he));
  }
  lines.push('');
  lines.push(paint.bold('USAGE / שימוש:'));
  lines.push('  onyx-cli ' + (entry.usage || `${groupName} ${subName}`));
  if (Array.isArray(entry.examples) && entry.examples.length) {
    lines.push('');
    lines.push(paint.bold('EXAMPLES / דוגמאות:'));
    for (const ex of entry.examples) lines.push('  ' + paint.gray('$ ') + ex);
  }
  if (entry.destructive) {
    lines.push('');
    lines.push(paint.yellow('⚠ destructive / פעולה הרסנית — confirmation required'));
  }
  return lines.join('\n');
}

module.exports = { topLevel, group, command, BANNER, RULE };
