#!/usr/bin/env node
/* Merge two source trees into destination with SHA-256 dedup, classification, and conflict stashing. */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DEST = 'C:/Users/kobi/Projects/techno-kol-uzi-2026';
const STAGE = path.join(DEST, '_merge-staging-final');
const CONFLICTS = path.join(STAGE, '_conflicts');
const REPORT_DIR = path.join(DEST, '_master-registry');
const DOCS_MERGED = path.join(DEST, 'docs', 'merged-final');

const SOURCES = [
  { name: 'technokoluzi-erp-main', root: path.join(STAGE, 'technokoluzi-erp-main', 'technokoluzi-erp-main') },
  { name: 'KOBI-EL-System-2026-master', root: path.join(STAGE, 'KOBI-EL-System-2026-master', 'KOBI-EL-System-2026-master') },
];

// Build-artifact directory names to skip
const SKIP_DIRS = new Set([
  'node_modules', '.next', 'dist', 'build', '.cache', '.pnpm-store', '.local',
  '.git', 'coverage', '.nyc_output', 'playwright-report', '.turbo', '.parcel-cache',
  '.vite', 'out', 'tmp',
]);

const SKIP_FILE_EXT = new Set(['.log', '.tmp', '.swp']);
const LOCKFILES = new Set(['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml']);

// Don't touch these destination files — parent conversation is managing them
const PROTECTED_DEST_FILES = new Set([
  'AUDIT_REAL.md',
  'build-master-registry-v2.js',
  'MERGE_REPORT.md',
  'VAT_18_UPDATE.md',
  'MISSING_MODELS_SCAN.md',
].map(f => path.join(DEST, f).replace(/\\/g,'/')));

const PROTECTED_MIGRATIONS = new Set([
  '00034_app_menu_complete.sql',
  '00035_app_menu_FULL.sql',
  '00036_remove_realestate_and_add_missing.sql',
  '00037_vat_rate_18_percent.sql',
  '00038_merged_sources_menu_additions.sql',
]);

function sha256(filePath) {
  const h = crypto.createHash('sha256');
  const buf = fs.readFileSync(filePath);
  h.update(buf);
  return h.digest('hex');
}

function* walk(dir) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
  catch { return; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      yield* walk(full);
    } else if (e.isFile()) {
      yield full;
    }
  }
}

function isBuildArtifact(relPath) {
  const parts = relPath.split(/[\\/]/);
  for (const p of parts) if (SKIP_DIRS.has(p)) return true;
  const base = path.basename(relPath);
  if (LOCKFILES.has(base)) return 'lockfile';
  const ext = path.extname(base).toLowerCase();
  if (SKIP_FILE_EXT.has(ext)) return true;
  // nested zips: skip
  if (ext === '.zip') return true;
  return false;
}

function ensureDir(d) { fs.mkdirSync(d, { recursive: true }); }

// ===== STEP 1: Build destination hash map =====
console.log('[1/5] Hashing destination files...');
const destHashByPath = new Map(); // relpath -> hash
const destHashSet = new Set();    // hashes (any path)
const destExistingPaths = new Set(); // set of relative paths under DEST
let destFiles = 0, destBytes = 0;
const destSkipDirs = new Set(['_merge-staging-final', '_merge-staging', '_external-backups', '_github-backups', '_qa-reports', 'node_modules', '.git']);

function* walkDest(dir) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
  catch { return; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      if (dir === DEST && destSkipDirs.has(e.name)) continue;
      yield* walkDest(full);
    } else if (e.isFile()) {
      yield full;
    }
  }
}

for (const f of walkDest(DEST)) {
  const rel = path.relative(DEST, f).replace(/\\/g, '/');
  destExistingPaths.add(rel);
  try {
    const st = fs.statSync(f);
    if (st.size > 50 * 1024 * 1024) { destFiles++; destBytes += st.size; continue; } // skip hashing >50MB
    const h = sha256(f);
    destHashByPath.set(rel, h);
    destHashSet.add(h);
    destFiles++; destBytes += st.size;
  } catch {}
}
console.log(`  destination: ${destFiles} files, ${(destBytes/1e6).toFixed(1)} MB, ${destHashSet.size} unique hashes`);

// ===== STEP 2: Classify every source file =====
console.log('[2/5] Classifying source files...');
const actions = []; // {source, src, relInSource, destRel, classification, hash, size}
const stats = { NEW: 0, EXISTS_SAME: 0, EXISTS_DIFF: 0, BUILD_ARTIFACT: 0, LOCKFILE: 0, NESTED_ZIP: 0, TOTAL: 0 };

// Map source-relative paths to destination-relative paths.
// For both sources, preserve the structure the same way because both sources already
// contain the monorepo layout (AI-Task-Manager/, GPS-Connect/, onyx-procurement/, etc.).
// For technokoluzi-erp-main, its top-level (package.json, artifacts/, lib/) maps into
// AI-Task-Manager/ because the destination already has that content under AI-Task-Manager.
function mapToDest(sourceName, relInSource) {
  if (sourceName === 'technokoluzi-erp-main') {
    // Put technokoluzi-erp-main content under AI-Task-Manager/ (that's where destination keeps it)
    // except top-level config files that would collide; preserve them under the package folder.
    return 'AI-Task-Manager/' + relInSource;
  }
  // KOBI-EL-System-2026-master: inner dir was already stripped; contents are monorepo root
  return relInSource;
}

for (const src of SOURCES) {
  if (!fs.existsSync(src.root)) { console.log(`  MISSING: ${src.root}`); continue; }
  for (const f of walk(src.root)) {
    stats.TOTAL++;
    const rel = path.relative(src.root, f).replace(/\\/g, '/');
    const ba = isBuildArtifact(rel);
    if (ba === 'lockfile') {
      // Keep if destination has no lockfile in same dir
      const destRel = mapToDest(src.name, rel);
      const destFile = path.join(DEST, destRel).replace(/\\/g, '/');
      if (!fs.existsSync(destFile) && !destExistingPaths.has(destRel)) {
        // destination lacks it — include
        const st = fs.statSync(f);
        let h = null;
        try { if (st.size < 50*1024*1024) h = sha256(f); } catch {}
        actions.push({source: src.name, src: f, destRel, classification: 'NEW_LOCKFILE', hash: h, size: st.size});
        stats.NEW++;
        continue;
      }
      stats.LOCKFILE++;
      continue;
    }
    if (ba === true) {
      const ext = path.extname(rel).toLowerCase();
      if (ext === '.zip') stats.NESTED_ZIP++;
      else stats.BUILD_ARTIFACT++;
      continue;
    }
    const destRel = mapToDest(src.name, rel);
    const destFile = path.join(DEST, destRel).replace(/\\/g, '/');

    // Protected files — never overwrite
    if (PROTECTED_DEST_FILES.has(destFile)) {
      stats.EXISTS_DIFF++;
      actions.push({source: src.name, src: f, destRel, classification: 'CONFLICT_PROTECTED', hash: null, size: fs.statSync(f).size});
      continue;
    }
    if (destRel.startsWith('supabase/migrations/') && PROTECTED_MIGRATIONS.has(path.basename(destRel))) {
      stats.EXISTS_DIFF++;
      actions.push({source: src.name, src: f, destRel, classification: 'CONFLICT_PROTECTED_MIGRATION', hash: null, size: fs.statSync(f).size});
      continue;
    }

    // Compute hash
    let st;
    try { st = fs.statSync(f); } catch { continue; }
    let h = null;
    try { if (st.size < 50*1024*1024) h = sha256(f); } catch {}

    if (destExistingPaths.has(destRel)) {
      const destH = destHashByPath.get(destRel);
      if (destH && h && destH === h) {
        stats.EXISTS_SAME++;
        continue;
      }
      // different content at same path
      stats.EXISTS_DIFF++;
      actions.push({source: src.name, src: f, destRel, classification: 'CONFLICT', hash: h, size: st.size});
      continue;
    }
    // Not at same path — check if any file with same hash exists elsewhere in dest
    if (h && destHashSet.has(h)) {
      stats.EXISTS_SAME++; // same content already exists somewhere in destination
      continue;
    }
    // Truly new
    actions.push({source: src.name, src: f, destRel, classification: 'NEW', hash: h, size: st.size});
    stats.NEW++;
  }
}
console.log(`  ${JSON.stringify(stats)}`);

// ===== STEP 3: Execute merge actions =====
console.log('[3/5] Executing merge...');
let merged = 0, conflictsCopied = 0;
const newMigrations = [];
const newEdgeFunctions = [];
const newRoutes = [];
const newPages = [];
const newFilesByTopDir = {};

for (const a of actions) {
  if (a.classification === 'NEW' || a.classification === 'NEW_LOCKFILE') {
    const destFull = path.join(DEST, a.destRel);
    ensureDir(path.dirname(destFull));
    // Defensive: if file suddenly exists, skip
    if (fs.existsSync(destFull)) continue;
    fs.copyFileSync(a.src, destFull);
    merged++;
    const topDir = a.destRel.split('/')[0];
    newFilesByTopDir[topDir] = (newFilesByTopDir[topDir] || 0) + 1;

    if (a.destRel.startsWith('supabase/migrations/') && a.destRel.endsWith('.sql')) newMigrations.push(a.destRel);
    if (/^supabase\/functions\/[^/]+\/index\.(ts|js)$/.test(a.destRel)) {
      const fn = a.destRel.split('/')[2];
      if (!newEdgeFunctions.includes(fn)) newEdgeFunctions.push(fn);
    }
  } else if (a.classification === 'CONFLICT' || a.classification === 'CONFLICT_PROTECTED' || a.classification === 'CONFLICT_PROTECTED_MIGRATION') {
    const stash = path.join(CONFLICTS, a.source, a.destRel);
    ensureDir(path.dirname(stash));
    try {
      fs.copyFileSync(a.src, stash);
      conflictsCopied++;
    } catch (e) { /* ignore path-too-long */ }
  }
}
console.log(`  merged=${merged} conflicts=${conflictsCopied}`);

// ===== STEP 4: Also stash top-level md docs from both sources under docs/merged-final/ =====
console.log('[4/5] Copying top-level md docs to docs/merged-final/...');
let mdCopied = 0;
for (const src of SOURCES) {
  if (!fs.existsSync(src.root)) continue;
  const entries = fs.readdirSync(src.root, { withFileTypes: true });
  const targetDir = path.join(DOCS_MERGED, src.name);
  ensureDir(targetDir);
  for (const e of entries) {
    if (e.isFile() && e.name.toLowerCase().endsWith('.md')) {
      const srcF = path.join(src.root, e.name);
      const dstF = path.join(targetDir, e.name);
      if (!fs.existsSync(dstF)) {
        try { fs.copyFileSync(srcF, dstF); mdCopied++; } catch {}
      }
    }
  }
}
console.log(`  md docs copied: ${mdCopied}`);

// ===== STEP 5: Write action manifest for report =====
console.log('[5/5] Writing action manifest...');
ensureDir(REPORT_DIR);
const manifest = {
  stats,
  merged,
  conflictsCopied,
  mdCopied,
  destBefore: { files: destFiles, bytes: destBytes },
  newMigrations,
  newEdgeFunctions,
  newFilesByTopDir,
  actions_summary: {
    NEW: actions.filter(a => a.classification === 'NEW').length,
    NEW_LOCKFILE: actions.filter(a => a.classification === 'NEW_LOCKFILE').length,
    CONFLICT: actions.filter(a => a.classification === 'CONFLICT').length,
    CONFLICT_PROTECTED: actions.filter(a => a.classification === 'CONFLICT_PROTECTED').length,
    CONFLICT_PROTECTED_MIGRATION: actions.filter(a => a.classification === 'CONFLICT_PROTECTED_MIGRATION').length,
  },
};
fs.writeFileSync(path.join(REPORT_DIR, 'final_merge_manifest.json'), JSON.stringify(manifest, null, 2));
fs.writeFileSync(path.join(REPORT_DIR, 'final_merge_actions.jsonl'),
  actions.map(a => JSON.stringify({source:a.source, destRel:a.destRel, classification:a.classification, size:a.size})).join('\n'));
console.log('DONE.');
