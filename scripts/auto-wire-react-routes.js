#!/usr/bin/env node
/**
 * Auto-wire React Router: reads menu migrations for every "leaf" route,
 * finds a matching page .tsx component, and adds <Route> + lazy-import
 * declarations to erp-app/src/App.tsx.
 *
 * Idempotent: only adds routes that don't already exist.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const APP_FILE = path.join(ROOT, 'erp-app', 'src', 'App.tsx');
const PAGES_DIR = path.join(ROOT, 'erp-app', 'src', 'pages');

if (!fs.existsSync(APP_FILE)) { console.error('App.tsx not found'); process.exit(1); }

const appSrc = fs.readFileSync(APP_FILE, 'utf8');

// 1. Existing route paths in App.tsx
const existingRoutes = new Set();
const routeRe = /<Route\s+path\s*=\s*['"]([^'"]+)['"]/g;
let m;
while ((m = routeRe.exec(appSrc)) !== null) existingRoutes.add(m[1]);
console.log(`Existing <Route> declarations: ${existingRoutes.size}`);

// 2. Collect all menu routes from every seed migration
const MIG_DIR = path.join(ROOT, 'supabase', 'migrations');
const menuFiles = fs.readdirSync(MIG_DIR)
  .filter(f => /app_menu|menu|merge|missing/i.test(f) && f.endsWith('.sql'));
const menuRoutes = new Set();
for (const f of menuFiles) {
  const src = fs.readFileSync(path.join(MIG_DIR, f), 'utf8');
  const rr = /'(\/[a-zA-Z0-9\-_\/]+)'/g;
  let mm;
  while ((mm = rr.exec(src)) !== null) {
    const r = mm[1];
    if (r.length > 1 && !/\s/.test(r)) menuRoutes.add(r);
  }
}
console.log(`Menu routes across seeds: ${menuRoutes.size}`);

// 3. Diff: routes needing a <Route>
const missing = [...menuRoutes].filter(r => !existingRoutes.has(r));
console.log(`Missing <Route> declarations: ${missing.length}`);

if (missing.length === 0) {
  console.log('Nothing to add.');
  process.exit(0);
}

// 4. Walk pages/ to build a path→component map
const pageMap = new Map(); // normalized name → relative import path
function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.isFile() && /\.tsx$/.test(e.name) && !/\.test\.|\.stories\./.test(e.name)) {
      const rel = path.relative(path.join(ROOT, 'erp-app', 'src'), p).replace(/\\/g, '/').replace(/\.tsx$/, '');
      const base = path.basename(p, '.tsx').toLowerCase();
      pageMap.set(base, rel);
      // Also index by folder/basename for slug matching
      const dirBase = path.basename(path.dirname(p)).toLowerCase();
      pageMap.set(dirBase + '/' + base, rel);
    }
  }
}
if (fs.existsSync(PAGES_DIR)) walk(PAGES_DIR);
console.log(`Indexed pages: ${pageMap.size}`);

// 5. For each missing route, guess a component
function componentNameFromRoute(route) {
  const segs = route.replace(/^\//, '').split('/').filter(Boolean);
  const last = segs[segs.length - 1] || 'home';
  // kebab → PascalCase
  return last.replace(/(^|[-_])(\w)/g, (_, __, c) => c.toUpperCase()) + 'Page';
}

function importPathForRoute(route) {
  const segs = route.replace(/^\//, '').split('/').filter(Boolean);
  const base = segs.join('-').toLowerCase();
  const last = segs[segs.length - 1] || '';

  if (pageMap.has(base)) return pageMap.get(base);
  if (pageMap.has(last)) return pageMap.get(last);
  // try to match nested folders
  for (const [key, val] of pageMap) {
    if (key.endsWith('/' + last) || key === last) return val;
  }
  return null;
}

const newImports = [];
const newRoutes = [];
const skipNoPage = [];
const usedNames = new Set();

for (const r of missing) {
  const imp = importPathForRoute(r);
  if (!imp) { skipNoPage.push(r); continue; }

  let name = componentNameFromRoute(r);
  // avoid duplicate variable names
  let v = name, i = 2;
  while (usedNames.has(v)) v = name + i++;
  usedNames.add(v);

  newImports.push(`const ${v} = lazy(() => import('./${imp}'));`);
  newRoutes.push(`        <Route path="${r}" element={<${v} />} />`);
}

console.log(`Will add ${newRoutes.length} <Route> decls · skipped ${skipNoPage.length} (no matching page)`);

if (newRoutes.length === 0) {
  fs.writeFileSync(path.join(ROOT, '_master-registry', 'auto-wire-react-routes.log.json'),
    JSON.stringify({ at: new Date().toISOString(), existing: existingRoutes.size, menu_routes: menuRoutes.size, missing: missing.length, added: 0, skipped_no_page: skipNoPage.length, skip_sample: skipNoPage.slice(0, 50) }, null, 2));
  console.log('No routes added — no matching pages found for any missing routes.');
  console.log('This is expected if pages are in AI-Task-Manager/ and not yet copied to erp-app/src/pages/.');
  process.exit(0);
}

// 6. Insert into App.tsx
// Ensure `lazy` is imported
let out = appSrc;
if (!/\blazy\b/.test(out.split('\n').filter(l => /from ['"]react['"]/.test(l)).join('\n'))) {
  out = out.replace(/(import\s+[^;]*?from\s+['"]react['"];?)/, (match) => {
    if (/\blazy\b/.test(match)) return match;
    return match.replace(/import\s+(\w+)?/, (m, name) => {
      if (m.includes('{')) return m.replace('{', '{ lazy, ');
      return `import ${name ? name + ', ' : ''}{ lazy }`;
    });
  });
}

// Find insertion point for imports — after last existing import
const olines = out.split('\n');
let lastImportIdx = -1;
for (let i = 0; i < olines.length; i++) if (/^import\s/.test(olines[i])) lastImportIdx = i;

// Find </Routes> or last <Route to insert before
let lastRouteIdx = -1;
for (let i = 0; i < olines.length; i++) if (/<Route\s/.test(olines[i])) lastRouteIdx = i;

const importBlock = [
  '',
  '// === AUTO-WIRED REACT ROUTES ===',
  `// Generated: ${new Date().toISOString()} · Added: ${newImports.length}`,
  ...newImports,
];
const routeBlock = [
  '        {/* === AUTO-WIRED ROUTES === */}',
  ...newRoutes,
];

const withImports = [
  ...olines.slice(0, lastImportIdx + 1),
  ...importBlock,
  ...olines.slice(lastImportIdx + 1),
];
const shiftedRouteIdx = lastRouteIdx + importBlock.length;
const final = [
  ...withImports.slice(0, shiftedRouteIdx + 1),
  ...routeBlock,
  ...withImports.slice(shiftedRouteIdx + 1),
];

fs.writeFileSync(APP_FILE, final.join('\n'));

fs.writeFileSync(path.join(ROOT, '_master-registry', 'auto-wire-react-routes.log.json'),
  JSON.stringify({
    at: new Date().toISOString(),
    existing: existingRoutes.size,
    menu_routes_total: menuRoutes.size,
    missing_total: missing.length,
    added: newRoutes.length,
    skipped_no_matching_page: skipNoPage.length,
    skip_sample: skipNoPage.slice(0, 100),
  }, null, 2));

console.log(`✅ Added ${newRoutes.length} <Route>. Skipped ${skipNoPage.length} (no matching page in erp-app/src/pages).`);
