#!/usr/bin/env node
/**
 * Print the port map of the unified ERP system.
 */

'use strict';

const rows = [
  ['Service',              'Port', 'Role'],
  ['techno-kol-ops',       '3200', 'Operational Core (hub)'],
  ['onyx-procurement',     '3100', 'Finance & Procurement backbone'],
  ['onyx-ai',              '3300', 'Intelligence & Automation layer'],
  ['payroll-autonomous',   '5173', 'Workforce & Salary engine'],
  ['vm-task-runner',       '3400', 'Scheduled job executor'],
  ['postgres',             '5432', 'Database'],
  ['redis',                '6379', 'Queue + cache'],
  ['nginx',                '80',   'Reverse proxy'],
];

const colWidths = rows[0].map((_, i) => Math.max(...rows.map((r) => r[i].length)));

console.log('');
for (const [i, row] of rows.entries()) {
  const line = row.map((cell, c) => cell.padEnd(colWidths[c])).join('  ');
  console.log('  ' + line);
  if (i === 0) {
    console.log('  ' + colWidths.map((w) => '─'.repeat(w)).join('  '));
  }
}
console.log('');
