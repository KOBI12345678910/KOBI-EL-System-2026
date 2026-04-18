/* ════════════════════════════════════════════════════════════════════════
 * QA-06 — Smoke Test Agent
 * Static (non-executing) smoke test for all 4 ERP servers of
 * Techno-Kol Uzi / Kobi Elkayam Real Estate.
 *
 * Run:    node _qa-reports/smoke/qa-06-smoke.js
 * Output: human-readable PASS/FAIL matrix to stdout.
 *
 * Rules:
 *   - Never executes the servers (no `require` of actual entry files).
 *   - Never mutates/deletes anything.
 *   - Pure filesystem inspection + regex probing.
 * ════════════════════════════════════════════════════════════════════════ */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

// ── root = 2 levels up from this file (_qa-reports/smoke/…) ────────────
const ROOT = path.resolve(__dirname, '..', '..');

/* ── helpers ─────────────────────────────────────────────────────────── */
const exists  = (p) => { try { return fs.existsSync(p); } catch { return false; } };
const isFile  = (p) => { try { return fs.statSync(p).isFile(); } catch { return false; } };
const readSafe = (p) => { try { return fs.readFileSync(p, 'utf8'); } catch { return ''; } };
const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } };

function mark(ok, msg, detail) {
  const tag = ok === true  ? 'PASS'
            : ok === false ? 'FAIL'
            :                'WARN';
  const d = detail ? ` — ${detail}` : '';
  return { ok, line: `  [${tag}] ${msg}${d}` };
}

/* ── check framework for Node server ─────────────────────────────────── */
function checkNodeServer(label, projDir, opts = {}) {
  const rows = [];
  const abs  = path.join(ROOT, projDir);

  // 1. package.json present & has main / scripts.start / scripts.dev
  const pkgPath = path.join(abs, 'package.json');
  const pkg     = readJson(pkgPath);
  let entryRel  = null;
  if (!pkg) {
    rows.push(mark(false, '1. package.json present + main/start/dev',
              `cannot read ${pkgPath}`));
  } else {
    const hasStart = !!(pkg.scripts && pkg.scripts.start);
    const hasDev   = !!(pkg.scripts && pkg.scripts.dev);
    const hasMain  = !!pkg.main;
    const ok       = hasStart || hasDev || hasMain;
    const detail   = [
      hasMain  ? `main=${pkg.main}`      : 'no main',
      hasStart ? `start=${pkg.scripts.start}` : 'no start',
      hasDev   ? `dev=${pkg.scripts.dev}`     : 'no dev'
    ].join(' | ');
    rows.push(mark(ok, '1. package.json present + main/start/dev', detail));

    // derive entry file from main / start / opts.entryHint
    entryRel =
      pkg.main ||
      (hasStart && extractEntryFromScript(pkg.scripts.start)) ||
      (hasDev   && extractEntryFromScript(pkg.scripts.dev))   ||
      opts.entryHint ||
      null;
  }

  // 2. entry file exists
  const entryAbs = entryRel ? path.join(abs, entryRel) : null;
  if (!entryAbs) {
    rows.push(mark(false, '2. entry file exists', 'no entry derivable'));
  } else {
    rows.push(mark(isFile(entryAbs), '2. entry file exists', entryRel));
  }

  // 3. entry file has no obvious syntax error
  //    - for .js/.cjs/.mjs: run `node --check` (authoritative)
  //    - for .ts/.tsx    : regex-balance as a best-effort probe (can't run without tsc)
  let entrySrc = '';
  if (entryAbs && isFile(entryAbs)) {
    entrySrc = readSafe(entryAbs);
    const ext = path.extname(entryAbs).toLowerCase();
    if (ext === '.js' || ext === '.cjs' || ext === '.mjs') {
      const r = spawnSync(process.execPath, ['--check', entryAbs], { encoding: 'utf8' });
      if (r.status === 0) {
        rows.push(mark(true, '3. entry file has no obvious syntax error',
                  'node --check OK'));
      } else {
        const err = (r.stderr || r.stdout || '').split('\n').slice(0, 2).join(' | ');
        rows.push(mark(false, '3. entry file has no obvious syntax error', err));
      }
    } else {
      // TypeScript: use regex balance (node --check does not understand .ts)
      const stripped = stripCommentsAndStrings(entrySrc);
      const balanced = isBracketBalanced(stripped);
      const hasJsKw  = /\b(const|let|var|function|class|import|require|export)\b/.test(entrySrc);
      rows.push(mark(balanced && hasJsKw,
                     '3. entry file has no obvious syntax error',
                     balanced ? 'TS: brackets balanced (static probe)'
                              : 'TS: brackets unbalanced — suspicious'));
    }
  } else {
    rows.push(mark(false, '3. entry file has no obvious syntax error',
              'entry missing'));
  }

  // 4. required modules resolve (./ or ../ only — skip node_modules)
  if (!entrySrc) {
    rows.push(mark(false, '4. all local require/import targets exist',
              'no entry source'));
  } else {
    const reqs = extractLocalImports(entrySrc);
    const missing = [];
    for (const r of reqs) {
      if (!resolveLocalTarget(path.dirname(entryAbs), r)) missing.push(r);
    }
    const ok = missing.length === 0;
    rows.push(mark(ok, '4. all local require/import targets exist',
              ok ? `${reqs.length} resolved`
                 : `${missing.length}/${reqs.length} missing: ${missing.slice(0,4).join(', ')}${missing.length>4?'…':''}`));
  }

  // 5. health endpoint present (search entry + src directory)
  const healthRx = /\/(healthz|livez|readyz|health)\b/;
  let healthOk = healthRx.test(entrySrc);
  let healthSrc = 'entry';
  if (!healthOk) {
    const files = walkSource(abs, 120);
    for (const f of files) {
      if (healthRx.test(readSafe(f))) {
        healthOk = true;
        healthSrc = path.relative(abs, f).replace(/\\/g, '/');
        break;
      }
    }
  }
  rows.push(mark(healthOk, '5. health endpoint /healthz|/livez|/readyz|/health',
            healthOk ? `found in ${healthSrc}` : 'not found'));

  // 6. route wiring (app.use(... or router.(get|post|…))
  const wireRx = /(app\.use\s*\(|router\.(get|post|put|patch|delete|use)\s*\()/;
  let wireOk   = wireRx.test(entrySrc);
  let wireSrc  = 'entry';
  if (!wireOk) {
    const files = walkSource(abs, 120);
    for (const f of files) {
      if (wireRx.test(readSafe(f))) {
        wireOk = true;
        wireSrc = path.relative(abs, f).replace(/\\/g, '/');
        break;
      }
    }
  }
  rows.push(mark(wireOk, '6. route wiring (app.use / router.*)',
            wireOk ? `found in ${wireSrc}` : 'not found'));

  // 7. supabase / db connection hint
  const dbRx = /(createClient\s*\(|from\s+['"]@supabase\/supabase-js['"]|require\s*\(\s*['"]@supabase\/supabase-js['"]\s*\)|new\s+Pool\s*\(|from\s+['"]pg['"]|require\s*\(\s*['"]pg['"]\s*\))/;
  let dbOk  = dbRx.test(entrySrc);
  let dbSrc = 'entry';
  if (!dbOk) {
    const files = walkSource(abs, 120);
    for (const f of files) {
      if (dbRx.test(readSafe(f))) {
        dbOk = true;
        dbSrc = path.relative(abs, f).replace(/\\/g, '/');
        break;
      }
    }
  }
  rows.push(mark(dbOk, '7. supabase / db connection present',
            dbOk ? `found in ${dbSrc}` : 'not found'));

  // 8. no console.log with secrets (password|token|key|secret)
  // Evaluate across source tree, not just entry.
  const secretRx = /console\.log\s*\([^)]*(password|token|api[_-]?key|secret)[^)]*\)/i;
  let leakHits = [];
  const scanFiles = walkSource(abs, 300);
  for (const f of scanFiles) {
    if (secretRx.test(readSafe(f))) {
      leakHits.push(path.relative(abs, f).replace(/\\/g, '/'));
      if (leakHits.length >= 5) break;
    }
  }
  rows.push(mark(leakHits.length === 0,
            '8. no console.log with secrets',
            leakHits.length === 0 ? 'clean'
                                  : `${leakHits.length}+ hits — first: ${leakHits[0]}`));

  // 9. .env.example present OR documented in README / docs
  const envExample = path.join(abs, '.env.example');
  const envFile    = path.join(abs, '.env');
  const readme     = path.join(abs, 'README.md');
  const envInReadme = exists(readme) &&
                      /\.env(\.example)?|ENV VAR|environment variable|SUPABASE_|DATABASE_URL/i
                        .test(readSafe(readme));
  const ok9 = exists(envExample) || exists(envFile) || envInReadme;
  const detail9 = exists(envExample) ? '.env.example'
                : exists(envFile)    ? '.env present'
                : envInReadme        ? 'documented in README'
                :                      'none found';
  rows.push(mark(ok9, '9. .env.example / .env / documented', detail9));

  return { label, projDir, rows };
}

/* ── check framework for Vite React client ───────────────────────────── */
function checkVite(label, projDir) {
  const rows = [];
  const abs  = path.join(ROOT, projDir);

  // V1. vite.config.js exists
  const vc  = path.join(abs, 'vite.config.js');
  const vcT = path.join(abs, 'vite.config.ts');
  rows.push(mark(exists(vc) || exists(vcT), 'V1. vite.config.(js|ts)',
            exists(vc) ? 'vite.config.js' :
            exists(vcT) ? 'vite.config.ts' : 'missing'));

  // V2. src/App.jsx exists + valid imports
  const app = path.join(abs, 'src', 'App.jsx');
  const appTsx = path.join(abs, 'src', 'App.tsx');
  const chosen = exists(app) ? app : exists(appTsx) ? appTsx : null;
  if (!chosen) {
    rows.push(mark(false, 'V2. src/App.jsx exists + valid imports',
              'App.(jsx|tsx) missing'));
  } else {
    const src = readSafe(chosen);
    const reqs = extractLocalImports(src);
    const missing = [];
    for (const r of reqs) {
      if (!resolveLocalTarget(path.dirname(chosen), r)) missing.push(r);
    }
    const bareImports = /from\s+['"][^.\/][^'"]+['"]/.test(src);
    const ok = missing.length === 0;
    rows.push(mark(ok, 'V2. src/App exists + valid local imports',
              ok ? `${reqs.length} local imports ok${bareImports ? ', bare pkgs present' : ''}`
                 : `missing ${missing.length}: ${missing.slice(0,4).join(', ')}`));
  }

  // V3. index.html exists
  const idx = path.join(abs, 'index.html');
  rows.push(mark(exists(idx), 'V3. index.html present', exists(idx) ? 'ok' : 'missing'));

  // V4. package.json has dev / build / preview
  const pkg = readJson(path.join(abs, 'package.json'));
  if (!pkg) {
    rows.push(mark(false, 'V4. package.json has dev/build/preview',
              'package.json unreadable'));
  } else {
    const s = pkg.scripts || {};
    const haveDev     = !!s.dev;
    const haveBuild   = !!s.build;
    const havePreview = !!s.preview;
    const ok = haveDev && haveBuild && havePreview;
    rows.push(mark(ok, 'V4. package.json has dev/build/preview',
              `dev=${haveDev?'y':'n'} build=${haveBuild?'y':'n'} preview=${havePreview?'y':'n'}`));
  }

  return { label, projDir, rows };
}

/* ── shared parsing helpers ──────────────────────────────────────────── */
function extractEntryFromScript(s) {
  if (!s) return null;
  // match last token that looks like a file path
  const m = s.match(/([\w\-./]+\.(?:js|mjs|cjs|ts|tsx))/);
  return m ? m[1] : null;
}

function stripCommentsAndStrings(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')           // /* ... */
    .replace(/\/\/[^\n]*/g, '')                 // // ...
    .replace(/`(?:\\[\s\S]|\$\{[^}]*\}|[^`\\])*`/g, '``')
    .replace(/'(?:\\.|[^'\\])*'/g, "''")
    .replace(/"(?:\\.|[^"\\])*"/g, '""');
}

function isBracketBalanced(src) {
  let c = 0, p = 0, b = 0;
  for (const ch of src) {
    if (ch === '{') c++;
    else if (ch === '}') c--;
    else if (ch === '(') p++;
    else if (ch === ')') p--;
    else if (ch === '[') b++;
    else if (ch === ']') b--;
    if (c < 0 || p < 0 || b < 0) return false;
  }
  return c === 0 && p === 0 && b === 0;
}

function extractLocalImports(src) {
  const out = new Set();
  const clean = stripCommentsAndStrings(src)
                  // bring back the paths we killed (re-scan raw src for paths instead)
                  ;
  // scan raw src for import / require statements
  const re1 = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  const re2 = /import\s+(?:[^'"]*?from\s+)?['"]([^'"]+)['"]/g;
  const re3 = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  let m;
  while ((m = re1.exec(src)))  if (m[1].startsWith('.') || m[1].startsWith('/')) out.add(m[1]);
  while ((m = re2.exec(src)))  if (m[1].startsWith('.') || m[1].startsWith('/')) out.add(m[1]);
  while ((m = re3.exec(src)))  if (m[1].startsWith('.') || m[1].startsWith('/')) out.add(m[1]);
  return [...out];
}

function resolveLocalTarget(baseDir, spec) {
  const exts = ['', '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.json'];
  const candidates = [];
  const abs = path.resolve(baseDir, spec);
  for (const e of exts) candidates.push(abs + e);
  for (const e of ['.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx']) {
    candidates.push(path.join(abs, 'index' + e));
  }
  for (const c of candidates) {
    if (isFile(c)) return c;
  }
  return null;
}

function walkSource(dir, limit = 200) {
  const out = [];
  const skip = new Set(['node_modules', '.git', 'dist', 'build', 'coverage',
                        '.next', '.turbo', 'paradigm-data', 'nexus-data',
                        'uploads', 'attached_assets']);
  const exts = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx']);
  (function recur(d) {
    if (out.length >= limit) return;
    let entries = [];
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (out.length >= limit) return;
      if (skip.has(e.name)) continue;
      const full = path.join(d, e.name);
      if (e.isDirectory()) recur(full);
      else if (e.isFile() && exts.has(path.extname(e.name))) out.push(full);
    }
  })(dir);
  return out;
}

/* ── reporter ────────────────────────────────────────────────────────── */
function printReport(results, viteResult) {
  const log = console.log;
  log('');
  log('════════════════════════════════════════════════════════════════════');
  log(' QA-06 — Smoke Test Agent  (static, non-executing)');
  log(` Root: ${ROOT}`);
  log(` Time: ${new Date().toISOString()}`);
  log('════════════════════════════════════════════════════════════════════');

  const summary = [];
  for (const r of results) {
    log('');
    log(`── ${r.label}  (${r.projDir})`);
    let pass = 0, fail = 0;
    for (const row of r.rows) {
      log(row.line);
      if (row.ok === true)  pass++;
      if (row.ok === false) fail++;
    }
    const verdict = fail === 0 ? 'GO'
                  : fail <= 2  ? 'GO-WITH-WARNINGS'
                  :              'NO-GO';
    log(`  ──► ${pass} PASS / ${fail} FAIL   verdict: ${verdict}`);
    summary.push({ label: r.label, projDir: r.projDir, pass, fail, verdict });
  }

  // Vite client
  if (viteResult) {
    log('');
    log(`── ${viteResult.label}  (${viteResult.projDir})  [Vite client]`);
    let pass = 0, fail = 0;
    for (const row of viteResult.rows) {
      log(row.line);
      if (row.ok === true)  pass++;
      if (row.ok === false) fail++;
    }
    const verdict = fail === 0 ? 'GO'
                  : fail <= 1  ? 'GO-WITH-WARNINGS'
                  :              'NO-GO';
    log(`  ──► ${pass} PASS / ${fail} FAIL   verdict: ${verdict}`);
    summary.push({ ...viteResult, pass, fail, verdict });
  }

  // Matrix
  log('');
  log('════════════════════════════════════════════════════════════════════');
  log(' SUMMARY');
  log('════════════════════════════════════════════════════════════════════');
  for (const s of summary) {
    log(` ${s.label.padEnd(26)}  ${String(s.pass).padStart(2)} PASS  ${String(s.fail).padStart(2)} FAIL   ${s.verdict}`);
  }

  const anyNoGo = summary.some(s => s.verdict === 'NO-GO');
  const allGo   = summary.every(s => s.verdict === 'GO');
  log('');
  log(` OVERALL: ${anyNoGo ? 'NO-GO — at least one project blocked'
                           : allGo ? 'GO — all projects smoke-clean'
                                   : 'GO-WITH-WARNINGS — minor issues'}`);
  log('════════════════════════════════════════════════════════════════════');
  log('');
}

/* ── main ────────────────────────────────────────────────────────────── */
function main() {
  const servers = [
    checkNodeServer('techno-kol-ops',  'techno-kol-ops',  { entryHint: 'src/index.ts' }),
    checkNodeServer('nexus_engine',    'nexus_engine',    { entryHint: 'nexus-engine.js' }),
    checkNodeServer('paradigm_engine', 'paradigm_engine', { entryHint: 'paradigm-engine.js' }),
    checkNodeServer('onyx-procurement','onyx-procurement',{ entryHint: 'server.js' }),
  ];
  const vite = checkVite('payroll-autonomous', 'payroll-autonomous');
  printReport(servers, vite);
}

try {
  main();
} catch (e) {
  console.error('QA-06 smoke test crashed:', e && e.stack || e);
  process.exit(1);
}
