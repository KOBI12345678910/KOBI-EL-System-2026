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

const srcFiles = walk('erp-app/src');
const mounts = JSON.parse(fs.readFileSync('_audit_tmp/api_mounts.json', 'utf8'));
// mounts are relative prefixes like '/ai-ops'; actual paths are '/api' + prefix
const mountSet = new Set(mounts.map(m => m));

// fetch/axios/apiClient calls - match '/api/xxx' patterns
const callRe = /['"`](\/api\/[A-Za-z0-9\-_\/{}:]+)['"`]/g;
const calls = new Map(); // path -> count
for (const f of srcFiles) {
  const txt = fs.readFileSync(f, 'utf8');
  let m;
  while ((m = callRe.exec(txt)) !== null) {
    const p = m[1];
    calls.set(p, (calls.get(p) || 0) + 1);
  }
}

console.log('unique /api paths:', calls.size);

// Check coverage: a call like /api/ai-ops/something matches mount '/ai-ops'
const uncovered = [];
for (const [p] of calls) {
  const stripped = p.replace(/^\/api/, '');
  // find any mount prefix that matches
  let covered = false;
  for (const mp of mounts) {
    if (stripped === mp || stripped.startsWith(mp + '/') || stripped.startsWith(mp + '?')) {
      covered = true; break;
    }
  }
  if (!covered) uncovered.push({ path: p, count: calls.get(p) });
}

// Sort by count descending
uncovered.sort((a, b) => b.count - a.count);
console.log('uncovered api paths:', uncovered.length);
console.log('top 30:');
uncovered.slice(0, 30).forEach(u => console.log(u.count + 'x', u.path));
fs.writeFileSync('_audit_tmp/api_call_gaps.json', JSON.stringify(uncovered, null, 2));
