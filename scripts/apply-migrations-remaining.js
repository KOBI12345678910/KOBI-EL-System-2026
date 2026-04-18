#!/usr/bin/env node
/**
 * Reads all remaining migrations and writes them to a JSON payload
 * that can be applied one-by-one via Supabase MCP.
 * Outputs list of {name, sql} pairs.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const MIG_DIR = path.join(__dirname, '..', 'supabase', 'migrations');
const OUT = path.join(__dirname, '..', '_master-registry', 'migrations_payload.json');

// Migrations to apply (00043 already done)
const TARGETS = [
  { file: '00044_commercial_menu_wiring.sql',        name: 'commercial_menu_wiring' },
  { file: '00045_execution_domain_complete.sql',     name: 'execution_domain_complete' },
  { file: '00046_execution_menu_wiring.sql',         name: 'execution_menu_wiring' },
  { file: '00047_procurement_domain_complete.sql',   name: 'procurement_domain_complete' },
  { file: '00048_procurement_menu_wiring.sql',       name: 'procurement_menu_wiring' },
  { file: '00049_inventory_domain_complete.sql',     name: 'inventory_domain_complete' },
  { file: '00050_inventory_menu_wiring.sql',         name: 'inventory_menu_wiring' },
  { file: '00051_finance_domain_complete.sql',       name: 'finance_domain_complete' },
  { file: '00052_finance_menu_wiring.sql',           name: 'finance_menu_wiring' },
  { file: '00053_workforce_domain_complete.sql',     name: 'workforce_domain_complete' },
  { file: '00054_workforce_menu_wiring.sql',         name: 'workforce_menu_wiring' },
  { file: '00055_docs_domain_complete.sql',          name: 'docs_domain_complete' },
  { file: '00056_docs_menu_wiring.sql',              name: 'docs_menu_wiring' },
  { file: '00057_intelligence_domain_complete.sql',  name: 'intelligence_domain_complete' },
  { file: '00058_intelligence_menu_wiring.sql',      name: 'intelligence_menu_wiring' },
  { file: '00059_governance_domain_complete.sql',    name: 'governance_domain_complete' },
  { file: '00060_governance_menu_wiring.sql',        name: 'governance_menu_wiring' },
  { file: '00061_analytics_domain_complete.sql',     name: 'analytics_domain_complete' },
  { file: '00062_analytics_menu_wiring.sql',         name: 'analytics_menu_wiring' },
  { file: '00063_orchestration_domain_complete.sql', name: 'orchestration_domain_complete' },
  { file: '00064_orchestration_menu_wiring.sql',     name: 'orchestration_menu_wiring' },
  { file: '00065_comms_domain_complete.sql',         name: 'comms_domain_complete' },
  { file: '00066_comms_menu_wiring.sql',             name: 'comms_menu_wiring' },
];

const payload = [];
for (const t of TARGETS) {
  const p = path.join(MIG_DIR, t.file);
  if (!fs.existsSync(p)) {
    console.log(`MISSING: ${t.file}`);
    continue;
  }
  const sql = fs.readFileSync(p, 'utf8');
  payload.push({ name: t.name, file: t.file, sql_length: sql.length });
}

fs.writeFileSync(OUT, JSON.stringify(payload, null, 2));
console.log(`✅ ${payload.length} migrations catalogued`);
console.log(`Total SQL bytes: ${payload.reduce((s, m) => s + m.sql_length, 0).toLocaleString()}`);
console.log(`Output: ${OUT}`);

// Also print small summary
for (const m of payload) {
  console.log(`  ${m.file} — ${m.sql_length.toLocaleString()} bytes`);
}
