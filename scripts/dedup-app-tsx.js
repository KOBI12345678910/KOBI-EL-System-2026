#!/usr/bin/env node
/**
 * Dedup lazy() and lazyPage() declarations in erp-app/src/App.tsx.
 *
 * Strategy:
 *   1. Scan for: `^const NAME = lazy(...)` and `^const NAME = lazyPage(...)`.
 *   2. Group by NAME.
 *   3. If duplicate NAME:
 *        - prefer the `lazyPage(...)` version over `lazy(...)` (wraps errors)
 *        - else prefer the LAST occurrence (assumed newer / more recent)
 *        - comment-out all other declarations with `// DEDUPED: ...`
 *   4. Do NOT rename usages — we're keeping the same NAME, just deleting
 *      redundant declarations.  Different-path duplicates: the kept one wins.
 *   5. Write file; report counts.
 */
const fs = require('fs');
const path = require('path');

const file = path.resolve(__dirname, '..', 'erp-app', 'src', 'App.tsx');
const src = fs.readFileSync(file, 'utf8');
const lines = src.split(/\r?\n/);

// Matches both `lazy(...)` and `lazyPage(...)` at top level of the file.
const declRe = /^const\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(lazy|lazyPage)\(\s*\(\s*\)\s*=>\s*import\(\s*['"]([^'"]+)['"]\s*\)\s*\)\s*;?\s*$/;

const byName = new Map(); // name -> [{ idx, line, kind, path }]
lines.forEach((ln, idx) => {
  const m = ln.match(declRe);
  if (m) {
    const entry = { idx, line: ln, kind: m[2], path: m[3] };
    if (!byName.has(m[1])) byName.set(m[1], []);
    byName.get(m[1]).push(entry);
  }
});

let totalDecls = 0;
byName.forEach(arr => { totalDecls += arr.length; });

let removedExact = 0;
let removedConflicting = 0;

const linesOut = lines.slice();
byName.forEach((arr, name) => {
  if (arr.length < 2) return;
  // pick winner: prefer lazyPage, else last
  let winnerIdx = 0;
  const lazyPageIdx = arr.findIndex(e => e.kind === 'lazyPage');
  if (lazyPageIdx !== -1) winnerIdx = lazyPageIdx;
  else winnerIdx = arr.length - 1;

  for (let i = 0; i < arr.length; i++) {
    if (i === winnerIdx) continue;
    const loser = arr[i];
    const reason = (loser.path === arr[winnerIdx].path)
      ? 'exact duplicate'
      : `path differs; kept ${arr[winnerIdx].kind} @L${arr[winnerIdx].idx + 1}`;
    linesOut[loser.idx] =
      `// DEDUPED [${name}] ${reason} — original: ${loser.line.trim()}`;
    if (loser.path === arr[winnerIdx].path) removedExact++;
    else removedConflicting++;
  }
});

fs.writeFileSync(file, linesOut.join('\n'));

const afterDecls = linesOut.filter(l => declRe.test(l)).length;

console.log(JSON.stringify({
  total_declarations_before: totalDecls,
  unique_names: byName.size,
  removed_exact_duplicates: removedExact,
  removed_conflicting_paths: removedConflicting,
  total_declarations_after: afterDecls,
  duplicate_names_count: [...byName.values()].filter(a => a.length > 1).length,
}, null, 2));
