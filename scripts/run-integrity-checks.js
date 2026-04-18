#!/usr/bin/env node
/**
 * Run integrity checks and produce INTEGRITY_REPORT.md
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, '_master-registry', 'INTEGRITY_REPORT.md');

const results = {};

function run(cmd, cwd, timeoutMs = 120000) {
  try {
    const output = execSync(cmd, { cwd, timeout: timeoutMs, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { ok: true, stdout: output, stderr: '' };
  } catch (e) {
    return { ok: false, stdout: (e.stdout||'').toString(), stderr: (e.stderr||e.message||'').toString(), code: e.status };
  }
}

console.log('\n=== D1: TypeScript checks (may take 2-5 min each) ===\n');
const services = ['api-server', 'erp-app', 'onyx-procurement', 'onyx-ai', 'techno-kol-ops', 'lib-client', 'vm-task-runner', 'packages/shared-validation'];
results.typescript = {};
for (const s of services) {
  const dir = path.join(ROOT, s);
  if (!fs.existsSync(dir)) { results.typescript[s] = { status: 'no-dir' }; continue; }
  if (!fs.existsSync(path.join(dir, 'tsconfig.json'))) {
    const pkgPath = path.join(dir, 'package.json');
    if (fs.existsSync(pkgPath)) {
      const entry = JSON.parse(fs.readFileSync(pkgPath,'utf8')).main || 'src/index.js';
      const entryPath = path.join(dir, entry);
      if (fs.existsSync(entryPath)) {
        const r = run(`node --check "${entry}"`, dir, 15000);
        results.typescript[s] = { status: r.ok ? 'node-check-ok' : 'node-check-fail', err: r.stderr.slice(0,500) };
      } else {
        results.typescript[s] = { status: 'no-tsconfig-no-entry' };
      }
    } else {
      results.typescript[s] = { status: 'no-tsconfig' };
    }
    continue;
  }
  console.log(`  tsc ${s} ...`);
  const r = run('npx --no-install tsc --noEmit 2>&1', dir, 300000);
  // Count error lines
  const errLines = (r.stdout + r.stderr).split('\n').filter(l => /error TS\d+/.test(l));
  results.typescript[s] = {
    status: r.ok ? 'pass' : 'errors',
    error_count: errLines.length,
    sample_errors: errLines.slice(0, 10),
  };
  console.log(`  ${s}: ${errLines.length} TS errors`);
}

console.log('\n=== D2: Menu ↔ Route integrity ===\n');
const APP_FILE = path.join(ROOT, 'erp-app', 'src', 'App.tsx');
const appSrc = fs.existsSync(APP_FILE) ? fs.readFileSync(APP_FILE, 'utf8') : '';
const routeSet = new Set();
const rr = /<Route\s+path\s*=\s*['"]([^'"]+)['"]/g;
let m;
while ((m = rr.exec(appSrc)) !== null) routeSet.add(m[1]);

const MIG_DIR = path.join(ROOT, 'supabase', 'migrations');
const menuFiles = fs.existsSync(MIG_DIR) ? fs.readdirSync(MIG_DIR).filter(f => /app_menu|menu|merge|missing/i.test(f) && f.endsWith('.sql')) : [];
const menuSet = new Set();
for (const f of menuFiles) {
  const src = fs.readFileSync(path.join(MIG_DIR, f), 'utf8');
  const mr = /'(\/[a-zA-Z0-9\-_\/]+)'/g;
  let mm;
  while ((mm = mr.exec(src)) !== null) {
    const r = mm[1];
    if (r.length > 1 && !/\s/.test(r)) menuSet.add(r);
  }
}
const menuNotInRoutes = [...menuSet].filter(r => !routeSet.has(r));
const routesNotInMenu = [...routeSet].filter(r => !menuSet.has(r));
results.menu_integrity = {
  total_routes: routeSet.size,
  total_menu: menuSet.size,
  menu_without_route: menuNotInRoutes.length,
  route_without_menu: routesNotInMenu.length,
  menu_without_route_sample: menuNotInRoutes.slice(0, 20),
  route_without_menu_sample: routesNotInMenu.slice(0, 20),
};
console.log(`  Routes: ${routeSet.size}, Menu: ${menuSet.size}`);
console.log(`  Menu without route: ${menuNotInRoutes.length}, Route without menu: ${routesNotInMenu.length}`);

console.log('\n=== D3: SQL migration quick-syntax ===\n');
const sqlFiles = fs.existsSync(MIG_DIR) ? fs.readdirSync(MIG_DIR).filter(f => f.endsWith('.sql')) : [];
const sqlIssues = [];
for (const f of sqlFiles) {
  const p = path.join(MIG_DIR, f);
  const src = fs.readFileSync(p, 'utf8');
  const openParens = (src.match(/\(/g) || []).length;
  const closeParens = (src.match(/\)/g) || []).length;
  if (openParens !== closeParens) sqlIssues.push({ file: f, open: openParens, close: closeParens });
}
results.sql_syntax = {
  files: sqlFiles.length,
  with_paren_mismatch: sqlIssues.length,
  sample: sqlIssues.slice(0, 10),
};
console.log(`  ${sqlFiles.length} SQL files · ${sqlIssues.length} with paren mismatch`);

console.log('\n=== D4: Broken imports scan ===\n');
function scanImports(dir, root, broken) {
  if (!fs.existsSync(dir)) return;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (['node_modules', '.git', 'dist', 'build', '.next'].includes(e.name)) continue;
      scanImports(p, root, broken);
    } else if (/\.(tsx?|jsx?)$/.test(e.name)) {
      const src = fs.readFileSync(p, 'utf8');
      const importRe = /import\s+(?:type\s+)?(?:[\w*{},\s]+\s+from\s+)?['"](\.\.?\/[^'"]+)['"]/g;
      let mm;
      while ((mm = importRe.exec(src)) !== null) {
        const raw = mm[1];
        const target = path.resolve(path.dirname(p), raw);
        // Try common extensions
        const candidates = [target, target + '.ts', target + '.tsx', target + '.js', target + '.jsx', path.join(target, 'index.ts'), path.join(target, 'index.tsx'), path.join(target, 'index.js')];
        if (!candidates.some(c => fs.existsSync(c))) {
          broken.push({ from: path.relative(root, p), import: raw });
          if (broken.length > 500) return; // cap
        }
      }
    }
  }
}
const broken = [];
scanImports(path.join(ROOT, 'erp-app', 'src'), ROOT, broken);
scanImports(path.join(ROOT, 'api-server', 'src'), ROOT, broken);
results.broken_imports = {
  total: broken.length,
  sample: broken.slice(0, 30),
};
console.log(`  Broken relative imports (across erp-app+api-server): ${broken.length}`);

// Write report
const md = [
  '# Integrity Report',
  `Generated: ${new Date().toISOString()}`,
  '',
  '## D1. TypeScript Compile Check',
  '',
  '| Service | Status | Error Count |',
  '|---|---|---|',
  ...Object.entries(results.typescript).map(([s, r]) => `| ${s} | ${r.status} | ${r.error_count ?? '—'} |`),
  '',
  '### Sample errors (first 10 per service with errors)',
  ...Object.entries(results.typescript).filter(([,r]) => r.sample_errors?.length).flatMap(([s, r]) => [
    `\n**${s}**`,
    '```',
    ...r.sample_errors,
    '```',
  ]),
  '',
  '## D2. Menu ↔ React Route Integrity',
  '',
  `- Total \`<Route>\` declarations in App.tsx: **${results.menu_integrity.total_routes}**`,
  `- Total unique menu routes (across all seeds): **${results.menu_integrity.total_menu}**`,
  `- Menu entries with no \`<Route>\`: **${results.menu_integrity.menu_without_route}**`,
  `- \`<Route>\` with no menu entry: **${results.menu_integrity.route_without_menu}**`,
  '',
  '### Sample — Menu without Route (20)',
  ...results.menu_integrity.menu_without_route_sample.map(r => `- \`${r}\``),
  '',
  '### Sample — Route without Menu (20)',
  ...results.menu_integrity.route_without_menu_sample.map(r => `- \`${r}\``),
  '',
  '## D3. SQL Migration Syntax',
  '',
  `- Total migration files: **${results.sql_syntax.files}**`,
  `- Files with paren mismatch: **${results.sql_syntax.with_paren_mismatch}**`,
  ...(results.sql_syntax.sample.length ? ['', '### Mismatches:', ...results.sql_syntax.sample.map(s => `- \`${s.file}\` — open=${s.open} close=${s.close}`)] : []),
  '',
  '## D4. Broken Relative Imports',
  '',
  `- Total broken imports (capped at 500): **${results.broken_imports.total}**`,
  '',
  '### Sample (30)',
  ...results.broken_imports.sample.map(b => `- \`${b.from}\` → \`${b.import}\``),
  '',
].join('\n');

fs.writeFileSync(OUT, md);
console.log(`\n📋 Report: ${OUT}`);

// Also dump JSON for machine consumption
fs.writeFileSync(OUT.replace('.md', '.json'), JSON.stringify(results, null, 2));
