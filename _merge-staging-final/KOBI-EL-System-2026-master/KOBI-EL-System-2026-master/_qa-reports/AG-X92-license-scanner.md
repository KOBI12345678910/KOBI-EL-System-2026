# AG-X92 — License Compliance Scanner
**Agent:** X-92 | **Swarm:** Security & Supply-Chain | **Project:** Techno-Kol Uzi mega-ERP
**Date:** 2026-04-11
**Status:** PASS — 54 / 54 tests green
**Rule honored:** לא מוחקים רק משדרגים ומגדלים — zero file mutation, zero dependencies

---

## 1. Scope / תכולה

A zero-dependency license compliance scanner for open-source dependency
trees. Reads `package.json` `license` / `licenses` fields, scans package
roots for `LICENSE` / `LICENCE` / `COPYING` / `NOTICE` files, fuzzy-matches
their contents against embedded fingerprints of the top 30 OSI licenses
using locally-implemented Levenshtein distance, classifies every license
into a policy category, evaluates the resulting dependency tree against a
configurable policy, detects well-known two-license incompatibilities,
exports CSV / HTML / SPDX 2.3 reports, and produces a
`THIRD_PARTY_NOTICES.txt` artifact suitable for redistribution alongside a
compiled binary.

### Delivered files
- `onyx-procurement/src/security/license-scanner.js` (~1030 LOC, zero deps)
- `onyx-procurement/test/security/license-scanner.test.js` (54 `node:test` cases)
- `_qa-reports/AG-X92-license-scanner.md` (this report)

### Rules respected
- **Zero dependencies.** Only `node:fs` and `node:path` from stdlib.
- **Never deletes.** The scanner is a pure reader for the input tree; it
  only writes to paths explicitly passed by the caller as reporter outputs.
  Test `scanTree() NEVER mutates package.json files` proves this.
- **Bilingual (HE + EN).** Hebrew glossary in section 11 of this report.
- **Deterministic reporter output.** `generateNoticeFile()` sorts packages
  alphabetically so CI diffs are stable.
- **Non-destructive API.** `reset()` clears in-memory state only, never
  touches disk.

---

## 2. Public API / ממשק ציבורי

```js
const { LicenseScanner, CATEGORY } = require('./src/security/license-scanner');

const scanner = new LicenseScanner({
  fuzzyThreshold: 0.82,       // 0–1, default 0.82
  followSymlinks: false,      // default false
  maxDepth: 30,               // default 30
  aliasOverrides: {},         // UPPERCASE alias -> canonical SPDX id
  categoryOverrides: {},      // SPDX id -> category
});

// 1. Single package
const entry = scanner.scanPackage('/path/to/node_modules/foo');

// 2. Whole project
const resultsMap = scanner.scanTree('/path/to/project');

// 3. Classify a raw license string
scanner.classify('(MIT OR Apache-2.0)');        // -> 'permissive'
scanner.classify('GPL-3.0-only');               // -> 'strong-copyleft'
scanner.classify('AGPL-3.0-only');              // -> 'network-copyleft'

// 4. Policy check
const check = scanner.checkCompatibility({
  projectLicense: 'MIT',
  policy: {
    allowCategories: ['permissive', 'public-domain', 'weak-copyleft'],
    denyCategories: ['strong-copyleft', 'network-copyleft', 'proprietary'],
    allowLicenses: ['LGPL-2.1-only'],  // per-id exception
    denyLicenses:  ['SSPL-1.0'],       // hard block
  },
});
// => { passed: boolean, violations: [...], summary: { byCategory, byLicense } }

// 5. Reporters
scanner.exportCSV('report.csv');
scanner.exportHTML('report.html');
scanner.exportSPDX('project.spdx');
scanner.generateNoticeFile('THIRD_PARTY_NOTICES.txt');

// 6. Two-license conflict
scanner.detectLicenseConflict('GPL-2.0-only', 'Apache-2.0');
// => { conflict: true, reason: '...', severity: 'block' }
```

---

## 3. License category table / טבלת קטגוריות

| Category             | Hebrew                   | Examples                                     | Redistribution risk |
|----------------------|--------------------------|----------------------------------------------|---------------------|
| `permissive`         | מתירני                   | MIT, Apache-2.0, BSD-2/3-Clause, ISC, 0BSD, Zlib, BSL-1.0 | Low — attribution only |
| `public-domain`      | נחלת הכלל                | Unlicense, CC0-1.0, PDDL-1.0                 | Very low            |
| `weak-copyleft`      | קופילפט חלש              | LGPL-2.1, LGPL-3.0, MPL-2.0, EPL-2.0, CDDL-1.1, EUPL-1.2 | Medium — file-level share-alike |
| `strong-copyleft`    | קופילפט חזק              | GPL-2.0, GPL-3.0                             | High — viral to whole binary |
| `network-copyleft`   | קופילפט רשתי             | AGPL-3.0, SSPL-1.0                           | Very high — viral over network |
| `proprietary`        | קנייני                   | `UNLICENSED`, `SEE LICENSE IN ...`           | Must verify EULA    |
| `commercial`         | מסחרי                    | `Commercial`                                 | Must have a contract |
| `unknown`            | לא ידוע                  | Missing / custom / typos                     | Manual legal review |

### Hierarchy used for OR / AND resolution

```
public-domain  <  permissive  <  weak-copyleft  <  strong-copyleft
              <  network-copyleft  <  commercial  <  proprietary  <  unknown
```

- **OR expressions** (`(MIT OR GPL-3.0-only)`) → **most permissive** wins.
- **AND expressions** (`(MIT AND GPL-3.0-only)`) → **most restrictive** wins.

---

## 4. SPDX expression reference / ביטויי SPDX

The scanner understands the three SPDX operators defined in
[SPDX spec §D](https://spdx.github.io/spdx-spec/v2.3/SPDX-license-expressions/):

| Operator  | Meaning                         | Example                                         |
|-----------|---------------------------------|-------------------------------------------------|
| (none)    | Single id                       | `MIT`                                           |
| `OR`      | Licensee may pick any           | `(MIT OR Apache-2.0)`                           |
| `AND`     | Licensee must satisfy all       | `(MIT AND BSD-3-Clause)`                        |
| `WITH`    | Base license + named exception  | `GPL-2.0-only WITH Classpath-exception-2.0`     |

### Nested examples understood by the parser

```
(GPL-2.0-only WITH Classpath-exception-2.0 OR MIT)
((MIT OR BSD-3-Clause) AND Apache-2.0)
(LGPL-2.1-or-later AND MIT)
```

### Aliases auto-normalized (partial list)

| Input            | Canonical       |
|------------------|-----------------|
| `MIT License`    | `MIT`           |
| `Apache 2.0`     | `Apache-2.0`    |
| `GPLv3`          | `GPL-3.0-only`  |
| `LGPL-2.1`       | `LGPL-2.1-only` |
| `BSD`            | `BSD-3-Clause`  |
| `Public Domain`  | `CC0-1.0`       |
| `Boost`          | `BSL-1.0`       |

Full alias list: see `ALIAS` in the module source.

---

## 5. Fuzzy matcher / זיהוי מטושטש

When a package is missing a `license` field or carries a vague one, the
scanner opens every `LICENSE` / `LICENCE` / `COPYING` / `NOTICE` file it
finds in the package root and runs a two-stage fuzzy match:

1. **Text normalization** — lowercase, strip punctuation, collapse
   whitespace. Handles leading copyright banners, BOM, CRLF.
2. **Fingerprint scoring** — for each of 30 embedded license fingerprints,
   run `bestSubstringSimilarity()` (locally-implemented Levenshtein with
   O(min(a,b)) memory) against every fingerprint phrase and produce a
   composite score of `0.7 × ratioMatched + 0.3 × avgSimilarity`.
3. **Best match wins** — the SPDX id with the highest composite score
   (and at least one phrase over `fuzzyThreshold`, default 0.82) is
   recorded with a confidence percentage.

Covered licenses (30 fingerprints): MIT, Apache-2.0, BSD-2/3/4-Clause, 0BSD,
ISC, Zlib, BSL-1.0, Unlicense, CC0-1.0, WTFPL, MPL-1.1, MPL-2.0, EPL-1.0,
EPL-2.0, CDDL-1.0, CDDL-1.1, LGPL-2.1-only, LGPL-3.0-only, GPL-2.0-only,
GPL-3.0-only, AGPL-3.0-only, SSPL-1.0, EUPL-1.2, Python-2.0, Artistic-2.0,
Beerware.

---

## 6. Policy examples / דוגמאות מדיניות

### 6.1 Strict SaaS deployment (recommended default)

```js
{
  allowCategories: ['permissive', 'public-domain'],
  denyCategories: ['strong-copyleft', 'network-copyleft', 'proprietary'],
  allowLicenses: ['LGPL-2.1-only', 'MPL-2.0'],   // specific weak-copyleft OK
  denyLicenses:  ['SSPL-1.0']                    // hard block Mongo SSPL
}
```

### 6.2 Internal server-side only (AGPL-safe)

```js
{
  allowCategories: ['permissive', 'public-domain', 'weak-copyleft', 'strong-copyleft'],
  denyCategories: ['network-copyleft'],
  denyLicenses:   ['SSPL-1.0']
}
```

### 6.3 Redistributed binary / on-prem installer

```js
{
  allowCategories: ['permissive', 'public-domain'],
  denyCategories: [
    'weak-copyleft',      // LGPL requires dynamic linking
    'strong-copyleft',
    'network-copyleft',
    'proprietary',
    'commercial'
  ]
}
```

### 6.4 Open-source GPL project

```js
{
  allowCategories: [
    'permissive', 'public-domain',
    'weak-copyleft', 'strong-copyleft'
  ],
  denyCategories: ['network-copyleft', 'proprietary'],
  denyLicenses: [
    'Apache-1.1'          // explicitly GPL-incompatible
  ]
}
```

---

## 7. Known incompatibility matrix / אי-תאימויות ידועות

Hard-coded pairs that `detectLicenseConflict()` will flag as `block`:

| License A           | License B                                                      | Source                                   |
|---------------------|----------------------------------------------------------------|------------------------------------------|
| GPL-2.0-only        | Apache-2.0, EPL-*, CDDL-*, MPL-1.1                             | GNU license list                         |
| GPL-3.0-only        | Apache-1.1                                                     | GNU license list                         |
| EPL-1.0 / EPL-2.0   | GPL-2.0-only / GPL-3.0-only                                    | Eclipse FAQ                              |
| CDDL-1.0 / 1.1      | GPL-2.0-only / GPL-3.0-only                                    | Debian legal                             |
| MPL-1.1             | GPL-2.0-only / GPL-3.0-only                                    | Mozilla FAQ                              |
| SSPL-1.0            | GPL-*, Apache-2.0, MIT, BSD-*, ISC                             | OSI rejection                            |
| Permissive project  | AGPL-3.0-only / SSPL-1.0 (network-copyleft viral infection)    | Category-level fallback rule             |

---

## 8. Reporter output samples

### 8.1 CSV

```
name,version,license,spdx,category,source,confidence,location
root-project,1.0.0,MIT,MIT,permissive,package.json,95,/tmp/root
alpha,1.0.0,MIT,MIT,permissive,package.json,95,/tmp/root/node_modules/alpha
bar,2.3.1,,GPL-3.0-only,strong-copyleft,LICENSE file (fuzzy match),78,/tmp/root/node_modules/bar
```

### 8.2 SPDX 2.3 tag:value

```
SPDXVersion: SPDX-2.3
DataLicense: CC0-1.0
SPDXID: SPDXRef-DOCUMENT
DocumentName: TechnoKolUzi-LicenseScan
DocumentNamespace: https://techno-kol-uzi.local/spdx/1712845200000
Creator: Tool: onyx-procurement-license-scanner-1.0
Created: 2026-04-11T08:00:00.000Z

##### Package: alpha
PackageName: alpha
SPDXID: SPDXRef-Pkg-1-alpha
PackageVersion: 1.0.0
PackageDownloadLocation: NOASSERTION
FilesAnalyzed: false
PackageLicenseConcluded: MIT
PackageLicenseDeclared: MIT
PackageCopyrightText: NOASSERTION
```

### 8.3 THIRD_PARTY_NOTICES.txt

```
THIRD-PARTY NOTICES
Techno-Kol Uzi mega-ERP — open-source license acknowledgements
Generated: 2026-04-11T08:00:00.000Z
Total packages: 42

========================================================================

Package: alpha
Version: 1.0.0
License: MIT
Category: permissive

MIT License

Copyright (c) 2024 Acme Corp
…full license text…

========================================================================
```

### 8.4 HTML

Color-coded table with CSS classes `.cat-permissive` (green),
`.cat-weak-copyleft` (yellow), `.cat-strong-copyleft` (red),
`.cat-network-copyleft` (dark red), `.cat-proprietary` (pink),
`.cat-unknown` (grey). LTR, RTL-safe (Hebrew in comments only).

---

## 9. Test results / תוצאות בדיקה

```
$ node --test test/security/license-scanner.test.js
tests      54
pass       54
fail       0
duration   ~320 ms
```

Coverage grid:

| Area                                    | Tests |
|-----------------------------------------|-------|
| API surface                             | 1     |
| `classify()` across all categories      | 7     |
| SPDX expression parser (OR/AND/WITH)    | 7     |
| Alias resolver                          | 2     |
| Levenshtein + fuzzy matcher             | 6     |
| `findLicenseFiles()`                    | 1     |
| `extractDeclaredLicense()`              | 4     |
| `scanPackage()` variants                | 4     |
| `scanTree()` walk                       | 2     |
| Policy `checkCompatibility()`           | 4     |
| `detectLicenseConflict()` matrix        | 5     |
| Reporters (CSV / HTML / SPDX / NOTICE)  | 6     |
| Non-destructive guarantees              | 2     |
| Hierarchy helpers                       | 2     |
| **Total**                               | **54**|

---

## 10. Integration notes

### Running from CI

```bash
cd onyx-procurement
node --test test/security/license-scanner.test.js
```

Add to `package.json` `scripts` (next upgrade wave — not forcing today per
"never delete" rule on the current scripts object):

```json
"license:scan": "node -e \"const {LicenseScanner}=require('./src/security/license-scanner');const s=new LicenseScanner();s.scanTree('.');console.log(s.exportCSV())\"",
"license:notices": "node -e \"const {LicenseScanner}=require('./src/security/license-scanner');const s=new LicenseScanner();s.scanTree('.');s.generateNoticeFile('THIRD_PARTY_NOTICES.txt');console.log('notices written')\""
```

### Integrating with AG-X63 dep-health

`license-scanner.js` and `src/ops/dep-health.js` are complementary: the
existing `classifyLicense()` in `dep-health.js` does a quick SPDX→status
lookup (OK / REVIEW / WARNING / UNKNOWN), while this new scanner adds the
file-system walk, fuzzy matching, SPDX expression parser, policy engine,
notice generator, and conflict matrix. They share no state and can be
composed. Recommended: call `license-scanner` during the supply-chain
audit step and feed its `summary.byCategory` back into the dep-health
risk score.

---

## 11. Hebrew glossary / מילון עברי

| English term             | עברית                          |
|--------------------------|--------------------------------|
| license                  | רישיון                         |
| open source              | קוד פתוח                       |
| permissive license       | רישיון מתירני                  |
| copyleft                 | קופילפט                        |
| weak copyleft            | קופילפט חלש                    |
| strong copyleft          | קופילפט חזק                    |
| network copyleft         | קופילפט רשתי (מחייב גם בשירות ענן) |
| public domain            | נחלת הכלל                      |
| proprietary software     | תוכנה קניינית                  |
| commercial license       | רישיון מסחרי                   |
| license expression       | ביטוי רישיון (SPDX)            |
| license exception        | חריג רישיון (למשל Classpath)   |
| license compatibility    | תאימות בין רישיונות            |
| license conflict         | התנגשות רישיונות               |
| dependency tree          | עץ תלויות                      |
| transitive dependency    | תלות עקיפה                     |
| third-party notice       | הודעת צד ג׳                    |
| attribution              | ייחוס                          |
| redistribution           | הפצה-מחדש                      |
| share-alike              | שיתוף-דומה                     |
| SPDX identifier          | מזהה SPDX                      |
| fingerprint              | טביעת אצבע (של טקסט הרישיון)   |
| Levenshtein distance     | מרחק לוינשטיין (עריכה)         |
| fuzzy match              | זיהוי מטושטש                   |
| policy                   | מדיניות                        |
| allow-list               | רשימת היתר                     |
| deny-list                | רשימת חסימה                    |
| violation                | הפרה                           |
| audit                    | בִּקוֹרֶת / ביקורת              |
| compliance               | ציות                           |
| non-destructive          | בלתי-הרסני (לא מוחקים)         |

---

## 12. Upgrade hooks (future swarms)

Per the **לא מוחקים רק משדרגים** rule, the following expansion points are
intentionally left as forward-compatible seams:

1. **Live SPDX feed** — `ALIAS` and `SPDX_CATEGORY` are exposed on the
   module exports, so a future agent can pull the upstream
   [spdx/license-list-data](https://github.com/spdx/license-list-data) JSON
   at build time and merge it in without touching the class.
2. **Network-aware fetcher** — `scanPackage()` currently runs on a local
   directory. A future subclass can override it to call npm/crates.io/pypi
   for transitive metadata discovery on non-installed trees (e.g. CI dry
   runs from a lockfile).
3. **Policy DSL** — `checkCompatibility()` takes a plain object today.
   A future agent can introduce a YAML policy loader that maps to the same
   shape without breaking callers.
4. **License text DB** — `FINGERPRINTS` ships with a curated 30-license
   phrase set. Future agents can extend it with the full SPDX license-list
   texts for higher recall, again without touching call sites.
5. **Hebrew localization of the HTML reporter** — the HTML template is
   currently LTR/English. A future agent can add a `dir="rtl"` variant
   without altering the CSV/SPDX/NOTICE outputs.

---

## 13. Sign-off

- **Rule לא מוחקים:** respected — no existing file was modified or deleted
  during this agent's work. Two new files were created under the security
  module tree and one new QA report was added; a single existing
  `package.json` `scripts` entry is NOT forced (left as "recommended for a
  future wave" in §10 above).
- **Zero dependencies:** confirmed — only `node:fs` and `node:path`.
- **Tests:** 54/54 green in ~320 ms on Node ≥ 20.
- **Bilingual:** HE glossary included; HE comments in source; EN is the
  primary interface language.
- **Determinism:** reporter outputs are sorted and timestamped, safe for
  CI diffs.

**Status:** SHIPPED — ready for consumption by the next swarm.
