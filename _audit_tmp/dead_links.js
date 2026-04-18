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

const app = JSON.parse(fs.readFileSync('_audit_tmp/app_routes.json', 'utf8'));
const routes = new Set(app.routes);

const src = walk('erp-app/src');
// exclude App.tsx and route files themselves
const filtered = src.filter(f => !f.includes('App.tsx') && !f.includes('/routes/'));

// href="/...", navigate('/...'), to="/...", setLocation("/...")
const patterns = [
  /\bhref=\"(\/[A-Za-z0-9\-_\/]*)\"/g,
  /\bto=\"(\/[A-Za-z0-9\-_\/]*)\"/g,
  /\bnavigate\(\s*['"`](\/[A-Za-z0-9\-_\/]*)['"`]/g,
  /\bsetLocation\(\s*['"`](\/[A-Za-z0-9\-_\/]*)['"`]/g,
];

const linkCount = new Map();
const linkFiles = new Map();
for (const f of filtered) {
  const txt = fs.readFileSync(f, 'utf8');
  for (const re of patterns) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(txt)) !== null) {
      const p = m[1];
      if (p === '/' || !p || p.startsWith('//') || p.startsWith('/api')) continue;
      linkCount.set(p, (linkCount.get(p) || 0) + 1);
      if (!linkFiles.has(p)) linkFiles.set(p, new Set());
      linkFiles.get(p).add(f);
    }
  }
}

const dead = [];
for (const [p, c] of linkCount) {
  // check parametrized routes
  let covered = routes.has(p);
  if (!covered) {
    // try matching against app routes that have :param
    for (const r of routes) {
      if (r.includes(':')) {
        try {
          const re = new RegExp('^' + r.replace(/\*/g,'').replace(/:[A-Za-z_][A-Za-z0-9_]*/g, '[^/]+') + '$');
          if (re.test(p)) { covered = true; break; }
        } catch(e) {}
      }
    }
  }
  if (!covered) dead.push({ path: p, count: c, files: [...linkFiles.get(p)].slice(0, 3) });
}
dead.sort((a, b) => b.count - a.count);
console.log('unique links:', linkCount.size);
console.log('dead links:', dead.length);
console.log('top 30:');
dead.slice(0, 30).forEach(d => console.log(d.count + 'x', d.path));
fs.writeFileSync('_audit_tmp/dead_links.json', JSON.stringify(dead, null, 2));
