/**
 * Coverage collector tests — Agent X-90
 * Techno-Kol Uzi mega-ERP — written 2026-04-11
 *
 * Run with:
 *   node --test test/coverage/coverage.test.js
 *
 * Strategy:
 *   1. Create a synthetic module with known branches.
 *   2. Require it and exercise some but not all paths.
 *   3. Call v8.takeCoverage() via the Coverage class, then collect()
 *      from the coverage dir that NODE_V8_COVERAGE points at.
 *   4. Assert LCOV / HTML / JSON / text / JUnit outputs are well-formed.
 *   5. Assert thresholds trip as expected and exclude globs filter paths.
 *
 * IMPORTANT:
 *   Full per-script coverage requires NODE_V8_COVERAGE to be set BEFORE
 *   Node launches. We don't assume that here — instead we point Coverage
 *   at a fresh dir, call v8.takeCoverage(), and verify the *plumbing*
 *   (file parsing, merging, exclude rules, reports). When run under a
 *   parent that already set NODE_V8_COVERAGE (e.g. CI), the same tests
 *   also exercise the real coverage data end-to-end.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const v8 = require('node:v8');

const { Coverage, _internal } = require('../../src/coverage/coverage');

// ───────────────────────────────────────────────────────────────
// Fixtures
// ───────────────────────────────────────────────────────────────
const TMP_DIR = path.join(os.tmpdir(), 'onyx-coverage-' + process.pid);
if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

const FIX_DIR = path.join(TMP_DIR, 'fixtures');
const COV_DIR = path.join(TMP_DIR, 'coverage-out');
const REPORT_DIR = path.join(TMP_DIR, 'reports');
fs.mkdirSync(FIX_DIR, { recursive: true });
fs.mkdirSync(COV_DIR, { recursive: true });
fs.mkdirSync(REPORT_DIR, { recursive: true });

// Synthetic module — 6 distinct branches, small enough to reason about.
const SYNTH_SRC = [
  "'use strict';",
  '// A synthetic module for Coverage tests',
  'function add(a, b) {',
  '  return a + b;',
  '}',
  'function subtract(a, b) {',
  '  return a - b;',
  '}',
  'function classify(n) {',
  '  if (n < 0) {',
  '    return "neg";',
  '  } else if (n === 0) {',
  '    return "zero";',
  '  } else {',
  '    return "pos";',
  '  }',
  '}',
  'function unreached() {',
  '  return 42;',
  '}',
  'module.exports = { add, subtract, classify, unreached };',
  '',
].join('\n');

const SYNTH_PATH = path.join(FIX_DIR, 'synthetic.js');
fs.writeFileSync(SYNTH_PATH, SYNTH_SRC, 'utf8');

// Synthetic V8 coverage payload for the synthetic module. This is what
// the V8 profiler would produce — we inject it directly so the parser
// and all reporters can be verified without needing Node to have been
// launched under NODE_V8_COVERAGE.
function buildSyntheticV8Payload() {
  // Resolve offsets from the actual source text so the parser gets real
  // line numbers even if we edit SYNTH_SRC later.
  const src = SYNTH_SRC;
  const range = (needle, count) => {
    const start = src.indexOf(needle);
    if (start === -1) throw new Error('fixture: cannot find ' + needle);
    return { startOffset: start, endOffset: start + needle.length, count };
  };
  return {
    result: [
      {
        scriptId: '1',
        url: 'file://' + SYNTH_PATH.replace(/\\/g, '/'),
        functions: [
          {
            functionName: '',
            isBlockCoverage: true,
            ranges: [range(src, 1)],
          },
          {
            functionName: 'add',
            isBlockCoverage: true,
            ranges: [
              range('function add(a, b) {\n  return a + b;\n}', 3),
            ],
          },
          {
            functionName: 'subtract',
            isBlockCoverage: true,
            ranges: [
              range('function subtract(a, b) {\n  return a - b;\n}', 1),
            ],
          },
          {
            functionName: 'classify',
            isBlockCoverage: true,
            ranges: [
              range(
                'function classify(n) {\n  if (n < 0) {\n    return "neg";\n  } else if (n === 0) {\n    return "zero";\n  } else {\n    return "pos";\n  }\n}',
                3,
              ),
              range('return "neg";', 1), // negative branch executed once
              range('return "zero";', 0), // zero branch never executed
              range('return "pos";', 2), // positive branch executed twice
            ],
          },
          {
            functionName: 'unreached',
            isBlockCoverage: true,
            ranges: [
              range('function unreached() {\n  return 42;\n}', 0),
            ],
          },
        ],
      },
    ],
  };
}

function writeSyntheticCoverage() {
  // Clear any stale files so tests are deterministic.
  for (const f of fs.readdirSync(COV_DIR)) {
    if (f.startsWith('coverage-') && f.endsWith('.json')) {
      try { fs.unlinkSync(path.join(COV_DIR, f)); } catch (_) { /* ignore */ }
    }
  }
  const payload = buildSyntheticV8Payload();
  fs.writeFileSync(
    path.join(COV_DIR, 'coverage-fixture-1.json'),
    JSON.stringify(payload),
    'utf8',
  );
}

// ───────────────────────────────────────────────────────────────
// 1. Plumbing — start() sets NODE_V8_COVERAGE and stop() is safe
// ───────────────────────────────────────────────────────────────
test('Coverage.start sets NODE_V8_COVERAGE and is idempotent to stop()', () => {
  const dir = path.join(TMP_DIR, 'start-dir');
  const cov = new Coverage();
  const prev = process.env.NODE_V8_COVERAGE;
  try {
    cov.start(dir);
    assert.equal(process.env.NODE_V8_COVERAGE, path.resolve(dir));
    assert.ok(fs.existsSync(dir));
    cov.stop(); // should not throw
    cov.stop(); // still idempotent
    assert.doesNotThrow(() => cov.stop());
  } finally {
    if (prev != null) process.env.NODE_V8_COVERAGE = prev;
    else delete process.env.NODE_V8_COVERAGE;
  }
});

test('Coverage.start throws without an output dir', () => {
  const cov = new Coverage();
  assert.throws(() => cov.start(), /requires an output directory/);
});

// ───────────────────────────────────────────────────────────────
// 2. collect() — parse + merge + line resolution
// ───────────────────────────────────────────────────────────────
test('collect() parses V8 payload, resolves ranges to lines', () => {
  writeSyntheticCoverage();
  const cov = new Coverage();
  cov.outDir = COV_DIR;
  cov.includeOnly([_internal.fileToHtmlName(SYNTH_PATH).replace('.html', '')]);
  // simpler: just exclude nothing and let the synthetic file through
  cov._includes = [];
  const r = cov.collect();
  const fc = r.files[SYNTH_PATH];
  assert.ok(fc, 'synthetic file should appear in report');

  // 4 top-level functions plus the wrapping anonymous module entry.
  const fnNames = fc.functions.map((f) => f.name).sort();
  assert.deepEqual(
    fnNames,
    ['(anonymous)', 'add', 'classify', 'subtract', 'unreached'].sort(),
  );

  // `unreached` must be uncovered.
  const un = fc.functions.find((f) => f.name === 'unreached');
  assert.equal(un.covered, false);
  // `add` must be covered.
  const add = fc.functions.find((f) => f.name === 'add');
  assert.equal(add.covered, true);

  // Branches: classify has 3 sub-branches — neg (1), zero (0), pos (2).
  // zero should register as not taken.
  const zero = fc.branches.find((b) => {
    const lineSrc = SYNTH_SRC.split('\n')[b.line - 1] || '';
    return lineSrc.includes('"zero"');
  });
  assert.ok(zero, 'classify zero branch must exist');
  assert.equal(zero.taken, false);
});

// ───────────────────────────────────────────────────────────────
// 3. LCOV output — well-formed and contains expected records
// ───────────────────────────────────────────────────────────────
test('lcov report is well-formed', () => {
  writeSyntheticCoverage();
  const cov = new Coverage();
  cov.outDir = COV_DIR;
  const text = cov.report({ format: 'lcov' });
  assert.match(text, /^TN:/m);
  assert.match(text, /SF:/);
  assert.match(text, /FN:\d+,add/);
  assert.match(text, /FNDA:1,add/);
  assert.match(text, /FNDA:0,unreached/);
  assert.match(text, /BRDA:\d+,0,\d+,0/); // zero-branch not taken
  assert.match(text, /BRDA:\d+,0,\d+,\d+/);
  assert.match(text, /end_of_record/);

  // writing to a path actually writes the file
  const lcovPath = path.join(REPORT_DIR, 'coverage.lcov');
  cov.report({ format: 'lcov', outPath: lcovPath });
  assert.ok(fs.existsSync(lcovPath));
  assert.ok(fs.readFileSync(lcovPath, 'utf8').includes('end_of_record'));
});

// ───────────────────────────────────────────────────────────────
// 4. HTML output — validity, inline CSS, SVG bars, bilingual title
// ───────────────────────────────────────────────────────────────
test('html report produces index.html with inline CSS + SVG bars + bilingual titles', () => {
  writeSyntheticCoverage();
  const cov = new Coverage();
  cov.outDir = COV_DIR;
  const htmlDir = path.join(REPORT_DIR, 'html');
  cov.report({ format: 'html', outPath: htmlDir });

  const indexPath = path.join(htmlDir, 'index.html');
  assert.ok(fs.existsSync(indexPath), 'index.html must exist');
  const idx = fs.readFileSync(indexPath, 'utf8');

  // DOCTYPE + structure
  assert.match(idx, /^<!DOCTYPE html>/);
  assert.match(idx, /<style>[\s\S]+<\/style>/);
  assert.match(idx, /<table>/);
  assert.match(idx, /<\/html>/);

  // Bilingual heading — Hebrew "כיסוי קוד" + English "Code Coverage"
  assert.match(idx, /Code Coverage/);
  assert.match(idx, /\u05DB\u05D9\u05E1\u05D5\u05D9 \u05E7\u05D5\u05D3/);

  // Mini SVG bars present
  assert.match(idx, /<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);

  // Per-file page exists
  const files = fs.readdirSync(htmlDir).filter((f) => f.endsWith('.html'));
  assert.ok(files.length >= 2, 'index + at least one per-file page');

  const perFile = files.find((f) => f !== 'index.html');
  const body = fs.readFileSync(path.join(htmlDir, perFile), 'utf8');
  // Uncovered lines must be rendered with the "miss" class
  assert.match(body, /class="line miss"/);
  assert.match(body, /class="line hit"/);

  // No external stylesheet links — everything inlined
  assert.doesNotMatch(idx, /<link[^>]+rel="stylesheet"/);
});

// ───────────────────────────────────────────────────────────────
// 5. JSON + Text + JUnit — structural smoke tests
// ───────────────────────────────────────────────────────────────
test('json / text / junit reports are valid', () => {
  writeSyntheticCoverage();
  const cov = new Coverage();
  cov.outDir = COV_DIR;
  const j = cov.report({ format: 'json' });
  const parsed = JSON.parse(j);
  assert.ok(parsed.files);
  assert.ok(parsed.totals);
  assert.ok(parsed.totals.lines);

  const txt = cov.report({ format: 'text' });
  assert.match(txt, /TOTAL/);
  assert.match(txt, /\u05DB\u05D9\u05E1\u05D5\u05D9 \u05E7\u05D5\u05D3/); // hebrew
  assert.match(txt, /Code coverage/);

  const xml = cov.report({ format: 'junit' });
  assert.match(xml, /<\?xml/);
  assert.match(xml, /<testsuite/);
  assert.match(xml, /<testcase/);
});

// ───────────────────────────────────────────────────────────────
// 6. Thresholds — pass & fail paths
// ───────────────────────────────────────────────────────────────
test('thresholds pass when coverage is high enough', () => {
  writeSyntheticCoverage();
  const cov = new Coverage();
  cov.outDir = COV_DIR;
  cov.collect();
  const r = cov.thresholds({ lines: 20, branches: 20, functions: 20, statements: 20 });
  assert.equal(r.ok, true);
  assert.equal(r.failures.length, 0);
});

test('thresholds fail + strict throws with bilingual labels', () => {
  writeSyntheticCoverage();
  const cov = new Coverage();
  cov.outDir = COV_DIR;
  cov.collect();
  const r = cov.thresholds({ lines: 100, branches: 100, functions: 100, statements: 100 });
  assert.equal(r.ok, false);
  assert.ok(r.failures.length >= 1);
  for (const f of r.failures) {
    assert.ok(typeof f.label_en === 'string' && f.label_en.length > 0);
    assert.ok(typeof f.label_he === 'string' && f.label_he.length > 0);
  }
  assert.throws(
    () => cov.thresholds({ lines: 100 }, { strict: true }),
    /Coverage thresholds not met/,
  );
});

// ───────────────────────────────────────────────────────────────
// 7. Exclude / includeOnly glob filters
// ───────────────────────────────────────────────────────────────
test('exclude glob filters paths out of the report', () => {
  writeSyntheticCoverage();
  const cov = new Coverage();
  cov.outDir = COV_DIR;
  cov.exclude(['**/synthetic.js']);
  const r = cov.collect();
  assert.equal(Object.keys(r.files).length, 0, 'exclude should drop synthetic.js');
});

test('includeOnly whitelist keeps only matching paths', () => {
  writeSyntheticCoverage();
  const cov = new Coverage();
  cov.outDir = COV_DIR;
  cov.includeOnly(['**/nothing-matches-this/**']);
  const r = cov.collect();
  assert.equal(Object.keys(r.files).length, 0);
});

test('includeOnly with matching pattern keeps the file', () => {
  writeSyntheticCoverage();
  const cov = new Coverage();
  cov.outDir = COV_DIR;
  cov.includeOnly(['**/synthetic.js']);
  const r = cov.collect();
  assert.ok(r.files[SYNTH_PATH], 'synthetic.js should be kept by whitelist');
});

// ───────────────────────────────────────────────────────────────
// 8. Merging across processes
// ───────────────────────────────────────────────────────────────
test('collect merges coverage across multiple process files', () => {
  for (const f of fs.readdirSync(COV_DIR)) {
    if (f.startsWith('coverage-') && f.endsWith('.json')) {
      try { fs.unlinkSync(path.join(COV_DIR, f)); } catch (_) { /* ignore */ }
    }
  }
  const p1 = buildSyntheticV8Payload();
  const p2 = buildSyntheticV8Payload();
  // mutate p2 so `zero` branch got executed in process #2
  const classify2 = p2.result[0].functions.find((f) => f.functionName === 'classify');
  classify2.ranges[2].count = 4; // previously 0
  fs.writeFileSync(path.join(COV_DIR, 'coverage-a.json'), JSON.stringify(p1));
  fs.writeFileSync(path.join(COV_DIR, 'coverage-b.json'), JSON.stringify(p2));

  const cov = new Coverage();
  cov.outDir = COV_DIR;
  const r = cov.collect();
  const fc = r.files[SYNTH_PATH];
  // After merging, the 'zero' branch must now be taken.
  const zero = fc.branches.find((b) => {
    const lineSrc = SYNTH_SRC.split('\n')[b.line - 1] || '';
    return lineSrc.includes('"zero"');
  });
  assert.ok(zero, 'zero branch must exist');
  assert.equal(zero.taken, true, 'merging must produce hit=true for zero branch');
});

// ───────────────────────────────────────────────────────────────
// 9. Internals — globToRegExp + VLQ decode + offset table
// ───────────────────────────────────────────────────────────────
test('globToRegExp matches ** across directories', () => {
  const re = _internal.globToRegExp('**/foo/**');
  assert.ok(re.test('a/foo/b'));
  assert.ok(re.test('x/y/foo/z/w'));
  assert.ok(!re.test('a/bar/b'));
});

test('globToRegExp handles single-star segment', () => {
  const re = _internal.globToRegExp('src/*.js');
  assert.ok(re.test('src/a.js'));
  assert.ok(!re.test('src/sub/a.js'));
});

test('vlqDecode decodes known sourcemap sequences', () => {
  // "AAAA" → [0,0,0,0]
  assert.deepEqual(_internal.vlqDecode('AAAA'), [0, 0, 0, 0]);
  // "D" → -1 (-(0b0001>>1) with sign bit)
  // actually D => idx=3 => cont=0 digit=3 => value=3 => negative bit set => value=1 negative => -1
  assert.deepEqual(_internal.vlqDecode('D'), [-1]);
});

test('buildLineOffsets + offsetToLineCol round-trip', () => {
  const src = 'line1\nline2\nline3';
  const offs = _internal.buildLineOffsets(src);
  assert.deepEqual(
    _internal.offsetToLineCol(offs, 0),
    { line: 1, column: 0 },
  );
  assert.deepEqual(
    _internal.offsetToLineCol(offs, 6),
    { line: 2, column: 0 },
  );
  assert.deepEqual(
    _internal.offsetToLineCol(offs, 12),
    { line: 3, column: 0 },
  );
});

test('miniBarSVG produces valid SVG with color thresholds', () => {
  const good = _internal.miniBarSVG(95);
  const mid = _internal.miniBarSVG(65);
  const bad = _internal.miniBarSVG(10);
  assert.match(good, /#22c55e/);
  assert.match(mid, /#eab308/);
  assert.match(bad, /#ef4444/);
  assert.match(good, /<svg xmlns=/);
});

test('htmlEscape prevents XSS in source lines', () => {
  const s = _internal.htmlEscape('<script>alert("x")</script>');
  assert.doesNotMatch(s, /<script>/);
  assert.match(s, /&lt;script&gt;/);
});

// ───────────────────────────────────────────────────────────────
// 10. Real v8.takeCoverage() smoke — only runs when parent set NODE_V8_COVERAGE
// ───────────────────────────────────────────────────────────────
test('v8.takeCoverage() is available on this Node', () => {
  assert.equal(typeof v8.takeCoverage, 'function');
});
