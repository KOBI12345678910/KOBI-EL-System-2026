#!/usr/bin/env node
/**
 * Merge the 718 truly-new files from _merge-verification into destination.
 * Source paths are like 'artifacts/erp-app/src/pages/...' → dest 'AI-Task-Manager/artifacts/...'
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const VERIF_ROOT = path.join(ROOT, '_merge-verification');
const data = JSON.parse(fs.readFileSync(path.join(ROOT, '_master-registry', 'truly_new_files.json'), 'utf8'));

let copied = 0, skipped = 0;
const copiedList = [];
const skipReasons = [];

for (const relPath of data.list) {
  // Find the actual file in _merge-verification/ — it's under technokoluzi/ or kobi-el/
  let sourcePath = null;
  const candidates = [
    path.join(VERIF_ROOT, 'technokoluzi', 'technokoluzi-erp-main', relPath),
    path.join(VERIF_ROOT, 'kobi-el', 'KOBI-EL-System-2026-master', relPath),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) { sourcePath = c; break; }
  }
  if (!sourcePath) { skipped++; skipReasons.push({ path: relPath, reason: 'source-not-found' }); continue; }

  // Determine destination
  let destPath;
  if (relPath.startsWith('artifacts/')) {
    // artifact files go under AI-Task-Manager/artifacts/
    destPath = path.join(ROOT, 'AI-Task-Manager', relPath);
  } else if (relPath.startsWith('lib/')) {
    destPath = path.join(ROOT, 'AI-Task-Manager', relPath);
  } else if (relPath.includes('/')) {
    // Other nested files — put them under AI-Task-Manager/ too to preserve structure
    destPath = path.join(ROOT, 'AI-Task-Manager', relPath);
  } else {
    // Top-level config files (.replit, pnpm-lock.yaml) — skip to avoid polluting root
    skipped++;
    skipReasons.push({ path: relPath, reason: 'root-config-skipped' });
    continue;
  }

  // Skip if dest already exists (shouldn't, but safety)
  if (fs.existsSync(destPath)) { skipped++; skipReasons.push({ path: relPath, reason: 'dest-exists' }); continue; }

  // Copy
  try {
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    fs.copyFileSync(sourcePath, destPath);
    copied++;
    copiedList.push(relPath);
  } catch (e) {
    skipped++;
    skipReasons.push({ path: relPath, reason: 'copy-error', err: e.message });
  }
}

console.log(`Copied:  ${copied}`);
console.log(`Skipped: ${skipped}`);

// Breakdown
const skipBy = {};
skipReasons.forEach(s => { skipBy[s.reason] = (skipBy[s.reason]||0)+1; });
console.log('Skip breakdown:', skipBy);

fs.writeFileSync(path.join(ROOT, '_master-registry', 'merge-truly-new.log.json'), JSON.stringify({
  at: new Date().toISOString(),
  copied,
  skipped,
  skip_breakdown: skipBy,
  copied_list: copiedList.slice(0, 200),
  skip_sample: skipReasons.slice(0, 100),
}, null, 2));

console.log(`✅ Merged ${copied} new files into AI-Task-Manager/`);
