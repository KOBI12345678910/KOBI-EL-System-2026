# AG-X90 — Code Coverage Collector
**Agent:** X-90 | **Project:** Techno-Kol Uzi mega-ERP
**Date:** 2026-04-11
**Status:** PASS — 19/19 tests green

---

## 1. Scope

A zero-dependency code-coverage collector built directly on top of Node's
built-in V8 coverage. No `c8`, no `nyc`, no `istanbul`, no external packages.
Everything is implemented with `node:v8`, `node:fs`, `node:path`, and
`node:url` only.

Delivered files
- `onyx-procurement/src/coverage/coverage.js` — the library
- `onyx-procurement/test/coverage/coverage.test.js` — 19 tests
- `_qa-reports/AG-X90-coverage.md` — this report

RULES respected
- Zero dependencies (only `node:*` built-ins)
- Bilingual UI titles on every report (Hebrew + English)
- Never deletes — the collector only writes into its own outDir / outPath
- Real code, real HTML, real LCOV, exercised end-to-end by the test suite

---

## 2. Public API

```js
const { Coverage } = require('./src/coverage/coverage');

const cov = new Coverage();

cov.start('./.coverage');              // sets NODE_V8_COVERAGE + v8.takeCoverage()
cov.exclude(['**/node_modules/**', '**/test/**']);
cov.includeOnly(['src/**']);           // whitelist (optional)
cov.sourceMap('./dist/module.js');     // load inline TS sourcemap if present

// ... run tests / application code ...

cov.stop();                            // v8.takeCoverage() + v8.stopCoverage()
cov.collect();                         // reads per-process JSON, merges

cov.report({ format: 'lcov',  outPath: './coverage/coverage.lcov' });
cov.report({ format: 'html',  outPath: './coverage/html' });
cov.report({ format: 'json',  outPath: './coverage/coverage.json' });
cov.report({ format: 'text' });        // returns the string
cov.report({ format: 'junit', outPath: './coverage/junit.xml' });

const check = cov.thresholds(
  { lines: 80, branches: 70, functions: 80, statements: 80 },
  { strict: true },                    // throw on failure (CI-friendly)
);
```

Result of `thresholds()`:
```js
{
  ok: boolean,
  failures: [
    {
      metric: 'lines'|'branches'|'functions'|'statements',
      required: number,
      actual: number,
      label_en: 'lines coverage below required threshold',
      label_he: 'כיסוי שורות מתחת לסף הנדרש',
    }
  ],
  totals: { lines: {...}, functions: {...}, branches: {...}, statements: {...} }
}
```

---

## 3. V8 coverage format — implementation notes

Node's V8 coverage is driven by two knobs:

1. **`NODE_V8_COVERAGE=<dir>` env var** — when set at process launch, V8
   writes a `coverage-<pid>-<ts>-<seq>.json` file into `<dir>` on every
   `v8.takeCoverage()` call and on process exit. One file per process.
2. **`v8.takeCoverage()` / `v8.stopCoverage()`** — flushes the
   in-process counters into the current `coverage-*.json` and stops
   collection, respectively.

### File shape
```json
{
  "result": [
    {
      "scriptId": "1",
      "url": "file:///abs/path/to/module.js",
      "functions": [
        {
          "functionName": "add",
          "isBlockCoverage": true,
          "ranges": [
            { "startOffset": 0, "endOffset": 120, "count": 3 },
            { "startOffset": 40, "endOffset": 55, "count": 0 }
          ]
        },
        ...
      ]
    }
  ]
}
```

### Range semantics (the critical bit)
V8 emits **ScriptCoverage → FunctionCoverage → BlockCoverage** where each
function's `ranges[0]` is the whole function body and subsequent ranges
are **strictly more specific** sub-blocks that **override** the parent
count for the bytes they cover. Our parser walks ranges in order and
applies them with an "override" rule (not max) so a zero-count branch
inside a hot function correctly shows as uncovered. This is exactly how
`c8` / Istanbul's V8-to-Istanbul converter handles it.

### Byte-offset → line resolution
V8 reports byte offsets into the source text. We build a line-offset
table in `O(n)` at load time and then resolve each offset with binary
search in `O(log n)`. Offsets land on the first line they touch; if a
sub-block spans multiple lines, the outer function range covers those
lines at the function count and the sub-block overrides them for its
own slice.

### Merging across processes
`collect()` scans every `coverage-*.json` in `outDir`, groups by `url`,
and for each function merges its ranges by `(startOffset, endOffset)`
summing counts. New ranges from a later process are appended. This
yields a single per-file picture even under test parallelism (workers,
`node --test --test-concurrency=N`, child_process).

### Source maps
`sourceMap(file)` loads an inline or sidecar `.map` file and applies
the mappings to resolve each generated (line, column) back to the
original (line, column). VLQ decoding is a small inline decoder — no
`source-map` package needed. When the original file exists on disk,
the report is re-keyed and rendered against the original source
(typically `.ts`).

---

## 4. Reporters

| format | output                                            | notes                                      |
|--------|---------------------------------------------------|--------------------------------------------|
| lcov   | `coverage.lcov`                                   | LCOV 1.x, compatible with Coveralls/Codecov|
| html   | directory with `index.html` + one page per file   | inline CSS, SVG bars, bilingual titles     |
| json   | Istanbul-ish JSON                                 | stable keys, sorted for diffability        |
| text   | stdout / returned string                          | fixed-width table, sorted by %             |
| junit  | `junit.xml`                                       | one `<testcase>` per file, fails < 50%     |

### HTML report details
- **Zero external deps** — all CSS inlined in a single `<style>` block
- **Per-file pages** — each file renders the full source with:
  - `.line.hit` — green left border on covered lines
  - `.line.miss` — red background on uncovered lines
  - Line numbers + hit counts in a sticky gutter
- **Index page**:
  - Summary cards for lines / functions / branches / statements
  - Sortable (by default, ascending by line %) summary table
  - **Mini SVG bar chart per file** — 120x10 SVG, color-coded:
    - green ≥ 80%, yellow ≥ 60%, red < 60%
  - Shared `longestCommonPath()` trims file paths for readability
- **Bilingual titles** — every page header shows:
  ```
  כיסוי קוד · Code Coverage
  ```
  and card labels are `Lines / שורות`, `Functions / פונקציות`,
  `Branches / ענפים`, `Statements / הצהרות`.
- **Dark theme** — slate/indigo palette, readable on HiDPI monitors
- **RTL-aware** — gutter flips alignment under `dir=rtl`
- **XSS-safe** — every source line is run through `htmlEscape()`

---

## 5. Thresholds

`cov.thresholds({lines, branches, functions, statements})` fails the
build if any metric is below the required percentage. With
`{strict: true}` it throws an `Error` whose `.coverage` property is the
full result, making it trivial to wire into CI:

```js
try {
  cov.thresholds({ lines: 80, branches: 70 }, { strict: true });
} catch (e) {
  console.error(e.message);
  console.error(JSON.stringify(e.coverage.failures, null, 2));
  process.exit(1);
}
```

---

## 6. Integration with `node --test`

The recommended CI pattern — V8 coverage must be enabled BEFORE Node
launches to get full per-script coverage, so we launch the runner with
the env var already set:

```bash
# POSIX
NODE_V8_COVERAGE=./.coverage node --test test/
node tools/report-coverage.js          # small script that uses Coverage
```

```powershell
# Windows PowerShell
$env:NODE_V8_COVERAGE = "./.coverage"
node --test test/
node tools/report-coverage.js
```

`tools/report-coverage.js` can be as small as:
```js
const { Coverage } = require('../onyx-procurement/src/coverage/coverage');
const cov = new Coverage();
cov.outDir = process.env.NODE_V8_COVERAGE;
cov.exclude(['**/node_modules/**', '**/test/**', '**/dist/**']);
const r = cov.collect();
cov.report({ format: 'lcov',  outPath: './coverage/coverage.lcov' });
cov.report({ format: 'html',  outPath: './coverage/html' });
cov.report({ format: 'junit', outPath: './coverage/junit.xml' });
console.log(cov.report({ format: 'text' }));
cov.thresholds({ lines: 80, branches: 70 }, { strict: true });
```

Note that `node --test --experimental-test-coverage` exists, but it
uses a different data path and is still marked experimental. The
Coverage class here uses the stable `NODE_V8_COVERAGE` pipeline and
works on every Node ≥ 18 without flags.

---

## 7. CI usage (GitHub Actions example)

```yaml
- name: Run tests with coverage
  env:
    NODE_V8_COVERAGE: ${{ github.workspace }}/.coverage
  run: |
    mkdir -p .coverage
    node --test onyx-procurement/test/
    node onyx-procurement/tools/report-coverage.js

- name: Upload HTML report
  uses: actions/upload-artifact@v4
  with:
    name: coverage-html
    path: coverage/html/

- name: Upload LCOV to Codecov
  uses: codecov/codecov-action@v4
  with:
    files: coverage/coverage.lcov
```

---

## 8. Test coverage of the collector itself

```
tests      19
passed     19
failed      0
duration  ~122ms
```

Run:
```bash
node --test onyx-procurement/test/coverage/coverage.test.js
```

Cases by area:

| Area                                                | Count |
|-----------------------------------------------------|-------|
| Plumbing (`start`/`stop`, env var, validation)      |   2   |
| V8 payload parsing + range → line resolution        |   1   |
| LCOV report structure                               |   1   |
| HTML report — inline CSS, SVG bars, bilingual, miss |   1   |
| JSON / text / JUnit structural checks               |   1   |
| Thresholds — pass + fail (strict throw)             |   2   |
| Exclude / includeOnly glob filters                  |   3   |
| Cross-process coverage merging                      |   1   |
| Internals — glob, VLQ, offsets, SVG, XSS escape     |   6   |
| `v8.takeCoverage()` availability smoke              |   1   |
| **Total**                                           | **19**|

### Highlights verified by the suite
- An uncovered branch inside an otherwise-hot function still shows
  `hit=0` (override semantics, not max-merge).
- An uncovered function (`unreached`) produces both `FNDA:0` in LCOV
  and `.line.miss` highlighting in HTML.
- Merging two `coverage-*.json` files where process B exercised a
  branch that A didn't causes the merged report to show that branch
  as taken.
- The index page sorts files ascending by line % (worst first).
- Threshold failures carry both `label_en` and `label_he`.
- Path traversal / XSS through source lines is neutralized by
  `htmlEscape()` (verified with `<script>alert("x")</script>` input).

---

## 9. Defensive behavior

- `start()` without an outDir → throws `TypeError`
- `start()` on a dir that doesn't exist → created with `recursive: true`
- `stop()` called twice → idempotent, never throws (V8 stop-twice is
  caught and ignored)
- `collect()` with no coverage files → returns empty `files{}` with
  100% on empty totals (divide-by-zero returns 100)
- Broken JSON file in `outDir` → skipped, never throws
- Source with no `\n` → line offsets degrade gracefully
- Inline sourcemap not present → resolution falls back to generated
  file (no error)
- Windows paths (`C:\Users\...`) and POSIX paths both handled — glob
  matcher normalizes to forward slashes before testing
- `report({format: 'unknown'})` → throws with the offending format
  name in the message

---

## 10. Hebrew glossary / מילון עברי

| English                 | Hebrew                  | Transliteration      |
|-------------------------|-------------------------|----------------------|
| Code coverage           | כיסוי קוד                | kisui kod            |
| Line                    | שורה                    | shura                |
| Lines                   | שורות                   | shurot               |
| Branch                  | ענף                     | anaf                 |
| Branches                | ענפים                   | anafim               |
| Function                | פונקציה                 | funktzya             |
| Functions               | פונקציות                | funktziot            |
| Statement               | הצהרה                   | hatz'hara            |
| Statements              | הצהרות                  | hatz'harot           |
| Threshold               | סף                      | saf                  |
| Uncovered               | לא מכוסה                 | lo mechuseh          |
| Covered                 | מכוסה                   | mechuseh             |
| Report                  | דוח                     | doch                 |
| File                    | קובץ                    | kovetz               |
| Source                  | מקור                    | makor                |
| Build failed (threshold)| הבנייה נכשלה (סף)        | habniya nichshela    |
| Summary                 | סיכום                   | sikkum               |
| Passed                  | עבר                     | avar                 |
| Failed                  | נכשל                    | nichshal             |

---

## 11. Rule compliance

- **לא מוחקים, רק משדרגים ומגדלים** — the collector writes to its own
  `outDir` / `outPath` and never unlinks anything outside that. No
  existing files in the repo were modified or removed in the course
  of this change; this report and the two new files are all additive.
- **Zero deps** — `grep -E "^(const|import)" coverage.js | grep -v "node:"`
  returns nothing.
- **Bilingual UX** — every user-visible title has Hebrew and English.
- **Real tests, real outputs** — HTML, LCOV, JSON, JUnit and text
  reports are all generated and parsed back in the test suite; the
  HTML assertions include checks for `.line.miss`, SVG presence, and
  the bilingual Hebrew heading.
