#!/usr/bin/env node
/**
 * Reconcile the 5 registry JSON files to canonical schema names.
 * CANONICAL MAP:
 *   crm|sales          -> commercial
 *   projects|production|installation|engineering -> execution
 *   hr_workforce       -> workforce
 *   ai_automation      -> intelligence
 *   documents          -> docs
 */
const fs = require('fs');
const path = require('path');

const MAP = {
  crm: 'commercial',
  sales: 'commercial',
  projects: 'execution',
  production: 'execution',
  installation: 'execution',
  engineering: 'execution',
  hr_workforce: 'workforce',
  ai_automation: 'intelligence',
  documents: 'docs',
};

const REGISTRY = path.join(__dirname, '..', '_master-registry');
const report = [];

function remap(val) {
  if (typeof val !== 'string') return val;
  // Match patterns like "crm.leads" or "hr_workforce.employees"
  return val.replace(/([a-z_]+)\./g, (full, schema) => {
    if (MAP[schema]) {
      report.push({ from: schema, to: MAP[schema], context: full });
      return MAP[schema] + '.';
    }
    return full;
  });
}

function walk(obj, remapKey) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map((x) => walk(x, remapKey));
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (remapKey(k)) {
      if (typeof v === 'string') out[k] = remap(v);
      else if (Array.isArray(v)) out[k] = v.map((x) => (typeof x === 'string' ? remap(x) : walk(x, remapKey)));
      else out[k] = walk(v, remapKey);
    } else {
      out[k] = walk(v, remapKey);
    }
  }
  return out;
}

function processFile(filename, keyPredicate) {
  const p = path.join(REGISTRY, filename);
  const before = fs.readFileSync(p, 'utf8');
  const data = JSON.parse(before);
  const out = walk(data, keyPredicate);
  const after = JSON.stringify(out, null, 2);
  if (after !== before) {
    fs.writeFileSync(p, after);
    console.log(`  wrote ${filename}`);
  } else {
    console.log(`  unchanged ${filename}`);
  }
}

// 1) models_registry.json
console.log('Processing models_registry.json...');
const modelsPath = path.join(REGISTRY, 'models_registry.json');
const modelsBefore = fs.readFileSync(modelsPath, 'utf8');
const models = JSON.parse(modelsBefore);
let modelsChanges = 0;
for (const m of models) {
  if (m.domain && MAP[m.domain]) {
    m.canonical_mapping = m.canonical_mapping || { original_domain: m.domain, canonical_domain: MAP[m.domain] };
    m.domain = MAP[m.domain];
    modelsChanges++;
  }
  if (m.subdomain && MAP[m.subdomain]) m.subdomain = MAP[m.subdomain];
  if (m.database && m.database.table_name && typeof m.database.table_name === 'string') {
    const [schema, rest] = m.database.table_name.split('.');
    if (MAP[schema]) {
      if (!m.canonical_mapping) m.canonical_mapping = {};
      m.canonical_mapping.original_table = m.database.table_name;
      m.database.table_name = `${MAP[schema]}.${rest}`;
      m.canonical_mapping.canonical_table = m.database.table_name;
      modelsChanges++;
    }
  }
  if (m.source_of_truth && m.source_of_truth.business_meaning) {
    m.source_of_truth.business_meaning = remap(m.source_of_truth.business_meaning);
  }
}
fs.writeFileSync(modelsPath, JSON.stringify(models, null, 2));
console.log(`  rewrote ${modelsChanges} model fields`);

// 2) source_of_truth_registry.json
console.log('Processing source_of_truth_registry.json...');
const sotPath = path.join(REGISTRY, 'source_of_truth_registry.json');
const sot = JSON.parse(fs.readFileSync(sotPath, 'utf8'));
let sotChanges = 0;
for (const [meaning, entry] of Object.entries(sot.controlled_business_meanings || {})) {
  if (entry.primary_source) {
    const newVal = remap(entry.primary_source);
    if (newVal !== entry.primary_source) { entry.primary_source = newVal; sotChanges++; }
  }
  if (Array.isArray(entry.derived)) {
    entry.derived = entry.derived.map((d) => {
      const r = remap(d);
      if (r !== d) sotChanges++;
      return r;
    });
  }
}
fs.writeFileSync(sotPath, JSON.stringify(sot, null, 2));
console.log(`  rewrote ${sotChanges} sot entries`);

// 3) dashboards_registry.json
console.log('Processing dashboards_registry.json...');
const dashPath = path.join(REGISTRY, 'dashboards_registry.json');
const dashes = JSON.parse(fs.readFileSync(dashPath, 'utf8'));
let dashChanges = 0;
for (const d of dashes) {
  if (d.domain && MAP[d.domain]) { d.domain = MAP[d.domain]; dashChanges++; }
  if (Array.isArray(d.sources)) {
    d.sources = d.sources.map((s) => {
      const r = remap(s);
      if (r !== s) dashChanges++;
      return r;
    });
  }
}
fs.writeFileSync(dashPath, JSON.stringify(dashes, null, 2));
console.log(`  rewrote ${dashChanges} dashboard entries`);

// 4) reports_registry.json
console.log('Processing reports_registry.json...');
const repPath = path.join(REGISTRY, 'reports_registry.json');
const reports = JSON.parse(fs.readFileSync(repPath, 'utf8'));
let repChanges = 0;
for (const r of reports) {
  if (r.domain && MAP[r.domain]) { r.domain = MAP[r.domain]; repChanges++; }
  if (Array.isArray(r.sources)) {
    r.sources = r.sources.map((s) => {
      const n = remap(s);
      if (n !== s) repChanges++;
      return n;
    });
  }
}
fs.writeFileSync(repPath, JSON.stringify(reports, null, 2));
console.log(`  rewrote ${repChanges} report entries`);

// 5) automations_registry.json
console.log('Processing automations_registry.json...');
const autoPath = path.join(REGISTRY, 'automations_registry.json');
const autos = JSON.parse(fs.readFileSync(autoPath, 'utf8'));
let autoChanges = 0;
for (const a of autos) {
  if (a.trigger) {
    const n = remap(a.trigger);
    if (n !== a.trigger) { a.trigger = n; autoChanges++; }
  }
  if (Array.isArray(a.side_effects)) {
    a.side_effects = a.side_effects.map((s) => {
      const n = remap(s);
      if (n !== s) autoChanges++;
      return n;
    });
  }
}
fs.writeFileSync(autoPath, JSON.stringify(autos, null, 2));
console.log(`  rewrote ${autoChanges} automation entries`);

// Write the BUILD_CHANGELOG append
const changelog = path.join(REGISTRY, 'BUILD_CHANGELOG.md');
const entry = `\n## 2026-04-18 — Schema Reconciliation (Chapter 3)\n\nCanonical schema map applied:\n- crm, sales -> commercial\n- projects, production, installation, engineering -> execution\n- hr_workforce -> workforce\n- ai_automation -> intelligence\n- documents -> docs\n\nFiles rewritten:\n- models_registry.json: ${modelsChanges} field rewrites\n- source_of_truth_registry.json: ${sotChanges} entry rewrites\n- dashboards_registry.json: ${dashChanges} entry rewrites\n- reports_registry.json: ${repChanges} entry rewrites\n- automations_registry.json: ${autoChanges} entry rewrites\n\nTotal replacements: ${modelsChanges + sotChanges + dashChanges + repChanges + autoChanges}\n`;
fs.appendFileSync(changelog, entry);

console.log('\nDONE');
console.log(`Total: ${modelsChanges + sotChanges + dashChanges + repChanges + autoChanges} replacements across 5 files`);
