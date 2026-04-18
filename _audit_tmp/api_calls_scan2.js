const fs = require('fs');
const path = require('path');

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, files);
    else if (/\.(tsx|ts|jsx|js)$/.test(e.name) && !e.name.endsWith('.d.ts')) files.push(full);
  }
  return files;
}

// Gather ALL mount prefixes from api-server (not just index.ts)
const apiFiles = walk('api-server/src');
const mountRe = /(?:router|app|apiRouter|\w+Router)\.use\s*\(\s*['"]([^'"]+)['"]/g;
const mounts = new Set();
// Also: router.get/post/put/delete/patch('/path', ...)
const methodRe = /(?:router|app|apiRouter|\w+Router)\.(?:get|post|put|delete|patch|all)\s*\(\s*['"]([^'"]+)['"]/g;
const methodPaths = new Set();
for (const f of apiFiles) {
  const txt = fs.readFileSync(f, 'utf8');
  let m;
  while ((m = mountRe.exec(txt)) !== null) mounts.add(m[1]);
  while ((m = methodRe.exec(txt)) !== null) methodPaths.add(m[1]);
}
console.log('mount prefixes:', mounts.size);
console.log('method paths:', methodPaths.size);

// Combine into matcher
const allPrefixes = [...mounts, ...methodPaths];

const srcFiles = walk('erp-app/src');
const callRe = /['"`](\/api\/[A-Za-z0-9\-_\/{}:.]+)['"`]/g;
const calls = new Map();
for (const f of srcFiles) {
  const txt = fs.readFileSync(f, 'utf8');
  let m;
  while ((m = callRe.exec(txt)) !== null) {
    calls.set(m[1], (calls.get(m[1]) || 0) + 1);
  }
}

const uncovered = [];
for (const [p, count] of calls) {
  const stripped = p.replace(/^\/api/, '');
  let covered = false;
  for (const mp of allPrefixes) {
    if (stripped === mp ||
        stripped.startsWith(mp + '/') ||
        stripped.startsWith(mp + '?') ||
        mp === stripped) { covered = true; break; }
    // handle ':param' in mp
    if (mp.includes(':')) {
      const re = new RegExp('^' + mp.replace(/:[A-Za-z_][A-Za-z0-9_]*/g, '[^/]+') + '($|/|\\?)');
      if (re.test(stripped)) { covered = true; break; }
    }
  }
  if (!covered) uncovered.push({ path: p, count });
}
uncovered.sort((a, b) => b.count - a.count);
console.log('unique /api paths:', calls.size);
console.log('uncovered:', uncovered.length);
console.log('top 30 uncovered:');
uncovered.slice(0, 30).forEach(u => console.log(u.count + 'x', u.path));
fs.writeFileSync('_audit_tmp/api_call_gaps.json', JSON.stringify(uncovered, null, 2));
