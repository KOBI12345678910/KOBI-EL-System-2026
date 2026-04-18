#!/usr/bin/env node
/**
 * Auto-wire API routes v2: scans api-server/src/routes/*.ts for files not imported
 * in routes/index.ts and appends import+mount lines for each unmounted file.
 *
 * Idempotent: safe to re-run.
 * Detects patterns anywhere in the file (not just first 3000 chars).
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ROUTES_DIR = path.join(ROOT, 'api-server', 'src', 'routes');
const INDEX_FILE = path.join(ROUTES_DIR, 'index.ts');

if (!fs.existsSync(INDEX_FILE)) {
  console.error('routes/index.ts not found:', INDEX_FILE);
  process.exit(1);
}

const indexSrc = fs.readFileSync(INDEX_FILE, 'utf8');

// Currently-imported modules
const importRe = /import\s+(?:\w+|\{[^}]+\})\s+from\s+['"]\.\/([^'"]+)['"]/g;
const imported = new Set();
let m;
while ((m = importRe.exec(indexSrc)) !== null) {
  imported.add(m[1]);
}

// All top-level .ts files
const files = fs.readdirSync(ROUTES_DIR, { withFileTypes: true })
  .filter(e => e.isFile() && e.name.endsWith('.ts') && e.name !== 'index.ts')
  .map(e => e.name.replace(/\.ts$/, ''));

const unmounted = files.filter(f => !imported.has(f));

console.log(`Total route files:   ${files.length}`);
console.log(`Already imported:    ${imported.size}`);
console.log(`Unmounted (to add):  ${unmounted.length}`);

if (unmounted.length === 0) {
  console.log('All routes are already wired.');
  process.exit(0);
}

// Detect export pattern — scan WHOLE file
function detectExport(file) {
  const p = path.join(ROUTES_DIR, file + '.ts');
  let src;
  try { src = fs.readFileSync(p, 'utf8'); } catch { return 'missing'; }

  // Default export variants — most common for Express routers
  if (/\bexport\s+default\s+router\b/.test(src))          return 'default';
  if (/\bmodule\.exports\s*=\s*router\b/.test(src))       return 'default';
  if (/\bexport\s+default\s+\w+Router\b/.test(src))       return 'default';
  if (/\bexport\s+default\s+\w+\s*;?\s*$/m.test(src))     return 'default';
  // Named router export
  if (/\bexport\s+(const|let|var)\s+router\b/.test(src))  return 'named-router';
  // Register function
  if (/\bexport\s+(async\s+)?function\s+register\w*\s*\(/.test(src)) return 'register-fn';
  // Only utility exports (no default router) → standalone module, skip mounting
  if (/\bexport\s+(async\s+)?function\s+\w+/.test(src))   return 'utility';
  if (/\bexport\s+(const|let|var)\s+\w+/.test(src))       return 'utility';
  if (/\bexport\s+class\s+\w+/.test(src))                 return 'utility';

  return 'no-export';
}

function varName(f) {
  const c = f.replace(/[-_]([a-z0-9])/g, (_, ch) => ch.toUpperCase());
  return c.replace(/^[a-z]/, s => s.toLowerCase()) + 'Router';
}
function routePath(f) { return '/' + f.toLowerCase(); }

const newImports = [];
const newMounts = [];
const skipLog = [];

for (const f of unmounted) {
  const kind = detectExport(f);
  const v = varName(f);
  const r = routePath(f);

  if (kind === 'default') {
    newImports.push(`import ${v} from './${f}';`);
    newMounts.push(`router.use('${r}', ${v});`);
  } else if (kind === 'named-router') {
    newImports.push(`import { router as ${v} } from './${f}';`);
    newMounts.push(`router.use('${r}', ${v});`);
  } else if (kind === 'register-fn') {
    newImports.push(`import { register as ${v}Register } from './${f}';`);
    newMounts.push(`${v}Register(router);`);
  } else {
    // utility / no-export → do NOT mount. These are library modules.
    skipLog.push({ file: f, reason: kind });
  }
}

// Collision-guard: make sure no new route path collides with an existing mount
const existingPathRe = /router\.use\(\s*['"]([^'"]+)['"]/g;
const existingPaths = new Set();
let mm;
while ((mm = existingPathRe.exec(indexSrc)) !== null) existingPaths.add(mm[1]);

const safeMounts = [];
for (let i = 0; i < newMounts.length; i++) {
  const mt = newMounts[i];
  const match = mt.match(/router\.use\('([^']+)'/);
  if (match && existingPaths.has(match[1])) {
    // collision — mount under /api/v2/ to avoid overwrite
    const alt = mt.replace("router.use('/", "router.use('/api/v2/");
    safeMounts.push(alt);
  } else {
    safeMounts.push(mt);
  }
}

// Insert imports+mounts
const lines = indexSrc.split('\n');
let lastImportIdx = -1, lastMountIdx = -1;
for (let i = 0; i < lines.length; i++) {
  if (/^import\s/.test(lines[i])) lastImportIdx = i;
  if (/router\.use\(/.test(lines[i])) lastMountIdx = i;
}

const headerImport = [
  '',
  '// ==========================================================',
  '// AUTO-WIRED by scripts/auto-wire-routes.js — do not edit',
  `// Generated: ${new Date().toISOString()}`,
  `// Added: ${newImports.length} modules`,
  '// ==========================================================',
  ...newImports,
];
const headerMount = [
  '',
  '// AUTO-WIRED MOUNTS',
  ...safeMounts,
];

const afterImports = [
  ...lines.slice(0, lastImportIdx + 1),
  ...headerImport,
  ...lines.slice(lastImportIdx + 1),
];
const shiftedMountIdx = lastMountIdx + headerImport.length;
const final = [
  ...afterImports.slice(0, shiftedMountIdx + 1),
  ...headerMount,
  ...afterImports.slice(shiftedMountIdx + 1),
];

fs.writeFileSync(INDEX_FILE, final.join('\n'));

const logPath = path.join(ROOT, '_master-registry', 'auto-wire-routes.log.json');
fs.mkdirSync(path.dirname(logPath), { recursive: true });
fs.writeFileSync(logPath, JSON.stringify({
  at: new Date().toISOString(),
  total_route_files: files.length,
  already_imported: imported.size,
  unmounted_found: unmounted.length,
  wired: newImports.length,
  skipped: skipLog.length,
  skip_breakdown: skipLog.reduce((acc, s) => { acc[s.reason] = (acc[s.reason]||0)+1; return acc; }, {}),
  skip_log: skipLog,
}, null, 2));

console.log(`✅ Wired: ${newImports.length} · Skipped: ${skipLog.length}`);
console.log(`📋 Log: ${logPath}`);
