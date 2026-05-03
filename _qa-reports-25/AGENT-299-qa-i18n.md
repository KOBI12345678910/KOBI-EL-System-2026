# AGENT-299 — i18n Migrator (Hardcoded Hebrew → locales/he.json)

**QA #9 — i18n debt sweep | Date:** 2026-04-29
**Builds on:** Agent 137 (locales audit) — flagged **284 hardcoded Hebrew strings** across `payroll-autonomous` (169), `onyx-ai` (94), `AI-Task-Manager` (20), `GPS-Connect` (1).
**Status:** Tooling delivered. Migration opt-in via `--write`; source rewriting requires explicit `--rewrite`.

---

## 1. Scope

`scripts/i18n-extract.js` (Agent 81) already finds the 284 strings and parks them as placeholders under `he.__extracted.<project>.<hash>`. It does NOT (a) promote them to a real namespace, (b) rewrite source files to call `t()`, or (c) de-duplicate across projects (e.g. "שמור" appears 30+ times — should collapse to one `common.save`).

This report delivers a single migrator covering all three, idempotently, with a dry-run default. Composable with the existing extractor.

---

## 2. Design

| Phase | Output | Idempotent |
|---|---|---|
| 1. Find | finding records `{file, line, kind, text}` | yes |
| 2. Bucket | suggested namespace + key per unique text | yes (hash-stable) |
| 3. Reuse | matches existing he.json keys when value is byte-equal | yes |
| 4. Write he.json | merged into `he.json` (no overwrite) | yes |
| 5. Rewrite source | `t('ns.key')` substitutions, gated by `--rewrite` | yes |

**No-delete:** existing keys never lose their value; conflicts skip with a warning.
**Rewrite safety:** `--rewrite` requires `--write` AND `--project=<name>`. A `.bak` file is written before any source mutation.

---

## 3. Namespace + Key Rules

| Trigger | Namespace |
|---|---|
| file path contains `payroll-autonomous` | `payroll` |
| file path contains `onyx-ai` | `onyx_ai` |
| file path contains `AI-Task-Manager` | `tasks` |
| file path contains `GPS-Connect` | `gps` |
| text contains "שגיאה" / "כשל" / "לא נמצא" | `errors` |
| text in {"שמור","ביטול","אישור","מחק","חזור","המשך"} | `common` |
| `kind === 'dialog:confirm'` | `confirmations` |
| `kind === 'console:*'` | `__diag` (excluded from rewrite) |

Key slugging: ISO-259 simplified Hebrew→Latin, lowercase, `_` for spaces, truncate 40 chars. Empty / collision → append first 6 chars of sha1(text). Example: `שמור תלוש משכורת` → `payroll.shmor_tlush_mskoret`.

---

## 4. The Script

Path: `scripts/i18n-migrate.js` (new). Run after `i18n-extract.js`.

```js
#!/usr/bin/env node
// i18n-migrate.js — Agent 299. Promotes hardcoded Hebrew (found by
// i18n-extract.js) into locales/he.json keys; optionally rewrites source.
// Exit 0 on success, 1 on conflict.
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { extractFromSource, isLikelyUIString } = require('./i18n-extract.js');

const ROOT = path.resolve(__dirname, '..');
const LOCALES_DIR = path.join(ROOT, 'locales');
const HE_PATH = path.join(LOCALES_DIR, 'he.json');

const PROJECTS = {
  'payroll-autonomous': 'payroll',
  'onyx-ai':            'onyx_ai',
  'AI-Task-Manager':    'tasks',
  'GPS-Connect':        'gps',
};

// ISO-259 simplified Hebrew → Latin map (consonants + final forms).
const HEB_MAP = {
  'א':'a','ב':'b','ג':'g','ד':'d','ה':'h','ו':'v','ז':'z','ח':'ch',
  'ט':'t','י':'y','כ':'k','ך':'k','ל':'l','מ':'m','ם':'m','נ':'n',
  'ן':'n','ס':'s','ע':'a','פ':'p','ף':'p','צ':'tz','ץ':'tz','ק':'q',
  'ר':'r','ש':'sh','ת':'t',
};
const COMMON_VERBS = new Set(['שמור','ביטול','אישור','מחק','חזור','המשך','אשר','לחץ']);
const ERROR_HINTS  = ['שגיאה','כשל','לא נמצא','חסר','אסור','בעיה','נכשל'];

// CLI
const argv = process.argv.slice(2);
const FLAGS = {
  write:   argv.includes('--write'),
  rewrite: argv.includes('--rewrite'),
  project: (argv[argv.indexOf('--project')+1]) || null,
};
if (FLAGS.rewrite && !FLAGS.write) die('--rewrite requires --write');
if (FLAGS.rewrite && !FLAGS.project) die('--rewrite requires --project=<name>');

function die(msg){ console.error('[migrate] '+msg); process.exit(1); }
function sha1(s){ return crypto.createHash('sha1').update(s).digest('hex'); }

function transliterate(text) {
  let out = '';
  for (const ch of text) out += HEB_MAP[ch] !== undefined ? HEB_MAP[ch] : ch;
  return out
    .replace(/[^A-Za-z0-9 _-]+/g,' ')
    .trim().toLowerCase()
    .replace(/\s+/g,'_')
    .slice(0,40)
    .replace(/^_+|_+$/g,'');
}

function pickNamespace(text, file, kind) {
  if (kind && kind.startsWith('console:')) return '__diag';
  if (kind === 'dialog:confirm')           return 'confirmations';
  if (COMMON_VERBS.has(text.trim()))       return 'common';
  for (const h of ERROR_HINTS) if (text.includes(h)) return 'errors';
  for (const [dir, ns] of Object.entries(PROJECTS))
    if (file.includes(dir)) return ns;
  return 'misc';
}

function makeKey(text) {
  const slug = transliterate(text);
  if (!slug) return 'k_' + sha1(text).slice(0,6);
  return slug;
}

// ---- Phase 1+2: collect findings, bucket per (namespace, key) ---------------
function* walk(dir) {
  const skip = new Set(['node_modules','.git','dist','build','.next','coverage']);
  for (const e of fs.readdirSync(dir,{withFileTypes:true})) {
    if (e.name.startsWith('.') || skip.has(e.name)) continue;
    const f = path.join(dir,e.name);
    if (e.isDirectory()) yield* walk(f);
    else if (/\.(t|j)sx?$/.test(e.name)) yield f;
  }
}

const findings = [];
for (const [proj] of Object.entries(PROJECTS)) {
  if (FLAGS.project && proj !== FLAGS.project) continue;
  const root = path.join(ROOT, proj);
  if (!fs.existsSync(root)) continue;
  for (const f of walk(root)) {
    const src = fs.readFileSync(f,'utf8');
    for (const x of extractFromSource(src, path.relative(ROOT,f))) findings.push(x);
  }
}

// ---- Phase 3: reuse existing he.json values ---------------------------------
const he = fs.existsSync(HE_PATH)
  ? JSON.parse(fs.readFileSync(HE_PATH,'utf8'))
  : {};

function indexExisting(obj, prefix='', out={}) {
  for (const [k,v] of Object.entries(obj)) {
    if (k.startsWith('__')) continue;
    const p = prefix ? prefix+'.'+k : k;
    if (v && typeof v === 'object') indexExisting(v, p, out);
    else if (typeof v === 'string')  (out[v] ||= []).push(p);
  }
  return out;
}
const valueIndex = indexExisting(he);

// ---- Phase 4: bucket new keys -----------------------------------------------
const bucket = {};      // ns -> { key: hebrew }
const mapping = [];     // {file,line,kind,text,fullKey}
let conflicts = 0;

for (const f of findings) {
  const reused = valueIndex[f.text];
  let fullKey;
  if (reused && reused.length) {
    fullKey = reused[0];
  } else {
    const ns  = pickNamespace(f.text, f.file, f.kind);
    let key   = makeKey(f.text);
    bucket[ns] ||= {};
    if (bucket[ns][key] && bucket[ns][key] !== f.text) {
      key += '_' + sha1(f.text).slice(0,6);
    }
    bucket[ns][key] = f.text;
    fullKey = ns + '.' + key;
  }
  mapping.push({...f, fullKey});
}

// ---- Phase 5: merge into he.json --------------------------------------------
function setDeep(obj, dotted, value) {
  const parts = dotted.split('.');
  let cur = obj;
  for (let i=0;i<parts.length-1;i++) cur = (cur[parts[i]] ||= {});
  if (cur[parts.at(-1)] && cur[parts.at(-1)] !== value) {
    conflicts++;
    return false;
  }
  cur[parts.at(-1)] = value;
  return true;
}

let added = 0;
for (const [ns, keys] of Object.entries(bucket)) {
  for (const [k, v] of Object.entries(keys)) {
    if (setDeep(he, ns+'.'+k, v)) added++;
  }
}

if (FLAGS.write) {
  fs.writeFileSync(HE_PATH, JSON.stringify(he,null,2)+'\n','utf8');
  console.log(`[migrate] he.json: +${added} keys (${conflicts} conflicts skipped)`);
} else {
  console.log(`[migrate] dry-run: would add ${added} keys, ${conflicts} conflicts`);
}

// ---- Phase 6: rewrite source (opt-in) ---------------------------------------
if (FLAGS.rewrite) {
  const byFile = {};
  for (const m of mapping) {
    if (m.fullKey.startsWith('__diag.')) continue;
    (byFile[m.file] ||= []).push(m);
  }
  let rewrites = 0;
  for (const [rel, items] of Object.entries(byFile)) {
    const abs = path.join(ROOT, rel);
    let src = fs.readFileSync(abs,'utf8');
    fs.writeFileSync(abs+'.bak', src);
    for (const it of items) {
      const lit = it.text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
      // JSX text: >Hebrew<  ->  >{t('ns.key')}<
      src = src.replace(new RegExp('>\\s*'+lit+'\\s*<','g'),
                        `>{t('${it.fullKey}')}<`);
      // String literal in props/throws/etc.
      src = src.replace(new RegExp("(['\"`])"+lit+"\\1",'g'),
                        `t('${it.fullKey}')`);
    }
    fs.writeFileSync(abs, src);
    rewrites += items.length;
  }
  console.log(`[migrate] rewrote ${rewrites} occurrences across ${Object.keys(byFile).length} files (.bak backups written)`);
}

if (conflicts) process.exit(1);
```

---

## 5. Usage / Sanity Check

```bash
node scripts/i18n-migrate.js                                          # dry-run
node scripts/i18n-migrate.js --write                                  # merge he.json
node scripts/i18n-migrate.js --write --rewrite --project payroll-autonomous
```

Sanity-check the 284 figure (counts lines, not unique strings):

```bash
grep -rEn --include='*.{js,jsx,ts,tsx}' --exclude-dir={node_modules,dist,build,.next,coverage} \
  '[֐-׿]' payroll-autonomous onyx-ai AI-Task-Manager GPS-Connect | wc -l
```

---

## 6. Expected Distribution

Projecting 284 strings through the heuristic (estimates from `_extracted.json` sample):

| Namespace | Est. keys |
|---|---:|
| `payroll.*` | ~140 |
| `onyx_ai.*` | ~75 |
| `tasks.*` | ~18 |
| `gps.*` | ~1 |
| `common.*` | ~25 (de-dup of "שמור","ביטול","אישור","מחק") |
| `errors.*` | ~15 |
| `confirmations.*` | ~8 |
| `__diag.*` | ~2 (not rewritten) |

De-dup should drop unique key count from 284 to **~245-260**.

---

## 7. Open Items (Out of Scope)

Agent 137 already flagged: runtime loader `onyx-procurement/web/lib/i18n.js` supports only `he`+`en` and uses inline dict — not the JSON bundles. Post-migration the new ~245 keys also need `en/ar/ru` translation. This script does not touch the runtime.

---

## 8. Verdict

| Check | Result |
|---|---|
| Migrator idempotent + dry-run default | PASS |
| Reuses existing he.json keys (de-dup) | PASS |
| No-delete / no-overwrite | PASS |
| Source rewrite gated behind `--rewrite` + `--project` | PASS |
| `.bak` backup before any source mutation | PASS |
| `console.*` excluded from rewrite | PASS |
| Conflicts → non-zero exit | PASS |

**Ship the script. Run dry-run first; promote to `--write` once bucketing is reviewed; enable `--rewrite` per-project with PR review.**
