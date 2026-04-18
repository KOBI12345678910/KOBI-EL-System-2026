#!/usr/bin/env node
/**
 * Concatenate all menu-wiring migrations into a single SQL payload.
 * Output written to a file so caller can paste into apply_migration.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const MIG_DIR = path.join(__dirname, '..', 'supabase', 'migrations');
const OUT = path.join(__dirname, '..', '_master-registry', 'all-menu-migrations.sql');

const FILES = [
  '00046_execution_menu_wiring.sql',
  '00048_procurement_menu_wiring.sql',
  '00050_inventory_menu_wiring.sql',
  '00052_finance_menu_wiring.sql',
  '00054_workforce_menu_wiring.sql',
  '00056_docs_menu_wiring.sql',
  '00058_intelligence_menu_wiring.sql',
  '00060_governance_menu_wiring.sql',
  '00062_analytics_menu_wiring.sql',
  '00064_orchestration_menu_wiring.sql',
  '00066_comms_menu_wiring.sql',
];

let out = '-- Concatenated menu wirings\n';
let totalBytes = 0;
for (const f of FILES) {
  const p = path.join(MIG_DIR, f);
  const content = fs.readFileSync(p, 'utf8');
  out += `\n-- ==== ${f} ====\n${content}\n`;
  totalBytes += content.length;
  console.log(`  ${f} (${content.length.toLocaleString()} bytes)`);
}

fs.writeFileSync(OUT, out);
console.log(`\n✅ Total ${totalBytes.toLocaleString()} bytes → ${OUT}`);
console.log(`Size: ${Math.round(out.length/1024)} KB`);
