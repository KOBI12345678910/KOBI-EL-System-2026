const fs = require('fs');
const path = require('path');

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, files);
    else if (/\.(tsx|ts)$/.test(e.name) && !e.name.endsWith('.d.ts')) files.push(full);
  }
  return files;
}

const pages = walk('erp-app/src/pages');
const all = walk('erp-app/src');
const importedSet = new Set();

// Match static imports AND dynamic imports
const staticRe = /from\s+['"]([^'"]+)['"]/g;
const dynRe = /import\(\s*['"]([^'"]+)['"]\s*\)/g;

for (const f of all) {
  const txt = fs.readFileSync(f, 'utf8');
  const fDir = path.dirname(f);
  for (const re of [staticRe, dynRe]) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(txt)) !== null) {
      let imp = m[1];
      let resolved = null;
      if (imp.startsWith('.')) resolved = path.resolve(fDir, imp);
      else if (imp.startsWith('@/')) resolved = path.resolve('erp-app/src', imp.slice(2));
      if (resolved) importedSet.add(resolved.replace(/\\/g, '/'));
    }
  }
}

const orphans = [];
for (const p of pages) {
  const abs = path.resolve(p).replace(/\\/g, '/');
  const noExt = abs.replace(/\.(tsx|ts)$/, '');
  const parent = noExt.replace(/\/index$/, '');
  if (!importedSet.has(noExt) && !importedSet.has(parent) && !importedSet.has(abs)) {
    orphans.push(p);
  }
}

console.log('page files:', pages.length);
console.log('orphan pages:', orphans.length);
const relOrphans = orphans.map(p => p.replace(/\\/g, '/').replace(process.cwd().replace(/\\/g, '/') + '/', ''));
console.log(relOrphans.slice(0, 40).join('\n'));
fs.writeFileSync('_audit_tmp/orphan_pages.json', JSON.stringify(relOrphans, null, 2));
