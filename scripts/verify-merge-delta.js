#!/usr/bin/env node
/**
 * Verify merge delta: hash every file in _merge-verification/ against the live
 * destination tree. Report any file whose content is NOT already present
 * (by hash) anywhere in the destination.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const VERIF_DIR = path.join(ROOT, '_merge-verification');

// 1. Build hash set of destination (skipping noise dirs)
const skipDirs = new Set(['node_modules', '.git', 'dist', 'build', '.next', '.cache', '_merge-verification', '_merge-staging', '_merge-staging-final', '_external-backups', '_github-backups', 'AI-Task-Manager.zip']);

function walk(dir, out) {
  if (!fs.existsSync(dir)) return;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (skipDirs.has(e.name)) continue;
      walk(p, out);
    } else if (e.isFile() && !e.name.endsWith('.zip') && !e.name.endsWith('.log')) {
      out.push(p);
    }
  }
}

console.log('Indexing destination file hashes (may take a minute)...');
const destFiles = [];
walk(ROOT, destFiles);
console.log(`  Destination: ${destFiles.length} files`);

const destHashes = new Set();
let indexed = 0;
for (const f of destFiles) {
  try {
    const stat = fs.statSync(f);
    if (stat.size > 50 * 1024 * 1024) continue; // skip >50MB
    const h = crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
    destHashes.add(h);
    indexed++;
  } catch {}
}
console.log(`  Indexed ${indexed} hashes`);

// 2. Walk verification tree
const verifyFiles = [];
walk(VERIF_DIR, verifyFiles);
console.log(`  Verification tree: ${verifyFiles.length} files`);

const delta = [];
const sameAsDest = [];
for (const f of verifyFiles) {
  try {
    const stat = fs.statSync(f);
    if (stat.size > 50 * 1024 * 1024) continue;
    const h = crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
    if (destHashes.has(h)) sameAsDest.push(f);
    else delta.push({ path: path.relative(VERIF_DIR, f).replace(/\\/g,'/'), hash: h.slice(0,12), size: stat.size });
  } catch {}
}

console.log(`\n=== DELTA REPORT ===`);
console.log(`Files in verification tree:     ${verifyFiles.length}`);
console.log(`Files ALREADY IN destination:   ${sameAsDest.length}`);
console.log(`Files NOT in destination (NEW): ${delta.length}`);

// Save report
const outPath = path.join(ROOT, '_master-registry', 'MERGE_DELTA_VERIFY.json');
fs.writeFileSync(outPath, JSON.stringify({
  at: new Date().toISOString(),
  verification_files: verifyFiles.length,
  already_in_destination: sameAsDest.length,
  new_files: delta.length,
  new_file_list: delta,
}, null, 2));

// If delta is small, dump the list
if (delta.length > 0 && delta.length <= 50) {
  console.log(`\nNew files:`);
  delta.forEach(d => console.log(`  ${d.path} (${d.size}b)`));
} else if (delta.length > 50) {
  console.log(`\nFirst 20 new files:`);
  delta.slice(0, 20).forEach(d => console.log(`  ${d.path} (${d.size}b)`));
  console.log(`... and ${delta.length - 20} more in ${outPath}`);
}

console.log(`\n📋 ${outPath}`);
