/**
 * Code Coverage Collector — Zero-dependency V8 coverage for Node.js
 * Agent X-90 — Techno-Kol Uzi mega-ERP — written 2026-04-11
 *
 * Wraps Node's built-in V8 coverage (NODE_V8_COVERAGE env var + v8.takeCoverage)
 * to produce lcov / html / json / text / junit reports without any external
 * dependencies. Everything is implemented on top of node:v8, node:fs, node:path
 * and node:url.
 *
 * Public API — class `Coverage`:
 *   const cov = new Coverage();
 *   cov.start('./.coverage');      // sets NODE_V8_COVERAGE and begins collection
 *   // ... run code / tests ...
 *   cov.stop();                    // flushes in-process coverage to disk
 *   cov.collect();                 // reads + merges per-process JSON files
 *   cov.exclude(['node_modules/**', 'test/**']);
 *   cov.includeOnly(['src/**']);
 *   cov.sourceMap(file);           // apply TS source maps when present
 *   cov.report({format:'lcov', outPath:'./coverage.lcov'});
 *   cov.thresholds({lines:80, branches:70, functions:80, statements:80});
 *
 * NON-NEGOTIABLES
 *  - Zero external deps (only node: built-ins)
 *  - Hebrew + English labels on every user-visible title
 *  - Never deletes any existing file — always writes to its own outDir / outPath
 *  - Resolves V8 byte ranges → line numbers using the actual source text
 *  - Parses ScriptCoverage → FunctionCoverage → BlockCoverage (with ranges)
 */

'use strict';

const v8 = require('node:v8');
const fs = require('node:fs');
const path = require('node:path');
const url = require('node:url');

// ──────────────────────────────────────────────────────────────────────────
// glob → regexp (minimal: **, *, ?, trailing /, char classes)
// Zero-dep, Windows-safe.
// ──────────────────────────────────────────────────────────────────────────
function globToRegExp(glob) {
  if (typeof glob !== 'string' || glob.length === 0) {
    return /^$/;
  }
  // normalize separators so a/b/c matches against /a/b/c and a\b\c
  const g = glob.replace(/\\/g, '/');
  let re = '';
  let i = 0;
  while (i < g.length) {
    const c = g[i];
    if (c === '*') {
      if (g[i + 1] === '*') {
        // ** → anything including /
        re += '.*';
        i += 2;
        if (g[i] === '/') i += 1;
      } else {
        // * → anything except /
        re += '[^/]*';
        i += 1;
      }
    } else if (c === '?') {
      re += '[^/]';
      i += 1;
    } else if (c === '.') {
      re += '\\.';
      i += 1;
    } else if (c === '/') {
      re += '/';
      i += 1;
    } else if ('+^$()|{}[]'.includes(c)) {
      re += '\\' + c;
      i += 1;
    } else {
      re += c;
      i += 1;
    }
  }
  return new RegExp('^' + re + '$');
}

function toPosix(p) {
  if (!p) return '';
  return String(p).replace(/\\/g, '/');
}

function matchesAny(posixPath, globs) {
  if (!Array.isArray(globs) || globs.length === 0) return false;
  for (const g of globs) {
    const re = globToRegExp(g);
    if (re.test(posixPath)) return true;
    // also match suffix (so 'node_modules/**' matches '/abs/node_modules/x.js')
    const idx = posixPath.indexOf(g.replace(/\*\*?.*$/, '').replace(/\/$/, ''));
    if (idx !== -1 && re.test(posixPath.slice(idx))) return true;
  }
  return false;
}

// ──────────────────────────────────────────────────────────────────────────
// Source maps — very small inline-map parser so we can resolve .ts → .js
// Supports: embedded //# sourceMappingURL=data:application/json;base64,...
//           sidecar file.js.map referenced by //# sourceMappingURL=file.js.map
// Only the `sources` + `mappings` VLQ stream is decoded.
// ──────────────────────────────────────────────────────────────────────────
const VLQ_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function vlqDecode(str) {
  const out = [];
  let value = 0;
  let shift = 0;
  for (let i = 0; i < str.length; i += 1) {
    const ch = str[i];
    const idx = VLQ_CHARS.indexOf(ch);
    if (idx === -1) continue;
    const cont = (idx & 32) !== 0;
    const digit = idx & 31;
    value += digit << shift;
    if (cont) {
      shift += 5;
    } else {
      const negative = (value & 1) !== 0;
      value >>= 1;
      out.push(negative ? -value : value);
      value = 0;
      shift = 0;
    }
  }
  return out;
}

function parseSourceMap(raw) {
  try {
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

function readInlineSourceMap(generatedFile) {
  try {
    const src = fs.readFileSync(generatedFile, 'utf8');
    const m = src.match(/\/\/[#@]\s*sourceMappingURL=(.+)\s*$/m);
    if (!m) return null;
    const u = m[1].trim();
    if (u.startsWith('data:')) {
      const comma = u.indexOf(',');
      if (comma === -1) return null;
      const header = u.slice(0, comma);
      const payload = u.slice(comma + 1);
      if (header.includes('base64')) {
        return parseSourceMap(Buffer.from(payload, 'base64').toString('utf8'));
      }
      return parseSourceMap(decodeURIComponent(payload));
    }
    const mapPath = path.resolve(path.dirname(generatedFile), u);
    if (!fs.existsSync(mapPath)) return null;
    return parseSourceMap(fs.readFileSync(mapPath, 'utf8'));
  } catch (_) {
    return null;
  }
}

/**
 * Given a source map and a (generatedLine, generatedColumn), return
 * { source, origLine, origColumn } or null.
 * generatedLine/origLine are 1-based on the outside, 0-based internally.
 */
function resolveWithMap(map, genLine1, genCol0) {
  if (!map || typeof map.mappings !== 'string') return null;
  const sources = Array.isArray(map.sources) ? map.sources : [];
  const lines = map.mappings.split(';');
  const targetLine = genLine1 - 1;
  if (targetLine < 0 || targetLine >= lines.length) return null;

  // Rebuild state up to this line
  let sourceIndex = 0;
  let origLine = 0;
  let origCol = 0;
  for (let L = 0; L <= targetLine; L += 1) {
    let genCol = 0;
    const segs = lines[L].split(',');
    let best = null;
    for (const seg of segs) {
      if (!seg) continue;
      const fields = vlqDecode(seg);
      genCol += fields[0] || 0;
      if (fields.length >= 4) {
        sourceIndex += fields[1];
        origLine += fields[2];
        origCol += fields[3];
      }
      if (L === targetLine) {
        if (genCol <= genCol0) {
          best = {
            source: sources[sourceIndex] || null,
            origLine: origLine + 1,
            origColumn: origCol,
          };
        } else if (best) {
          break;
        }
      }
    }
    if (L === targetLine && best) return best;
  }
  return null;
}

// ──────────────────────────────────────────────────────────────────────────
// Line-offset table — converts byte offsets into (line, column) in O(log n)
// ──────────────────────────────────────────────────────────────────────────
function buildLineOffsets(src) {
  const offsets = [0];
  for (let i = 0; i < src.length; i += 1) {
    if (src.charCodeAt(i) === 10 /* \n */) offsets.push(i + 1);
  }
  return offsets;
}

function offsetToLineCol(offsets, off) {
  // binary search for largest offset <= off
  let lo = 0;
  let hi = offsets.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (offsets[mid] <= off) lo = mid;
    else hi = mid - 1;
  }
  return { line: lo + 1, column: off - offsets[lo] };
}

function countLines(src) {
  if (!src) return 0;
  let n = 1;
  for (let i = 0; i < src.length; i += 1) {
    if (src.charCodeAt(i) === 10) n += 1;
  }
  return n;
}

// ──────────────────────────────────────────────────────────────────────────
// HTML helpers — hand-rolled escape + mini SVG bars
// ──────────────────────────────────────────────────────────────────────────
function htmlEscape(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function miniBarSVG(pct, width, height) {
  const W = width || 120;
  const H = height || 10;
  const clamped = Math.max(0, Math.min(100, pct));
  const fill = clamped >= 80 ? '#22c55e' : clamped >= 60 ? '#eab308' : '#ef4444';
  const w = (clamped / 100) * W;
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '" role="img" aria-label="coverage ' + clamped.toFixed(1) + '%">' +
    '<rect width="' + W + '" height="' + H + '" fill="#e5e7eb" rx="2" />' +
    '<rect width="' + w.toFixed(2) + '" height="' + H + '" fill="' + fill + '" rx="2" />' +
    '</svg>'
  );
}

// ──────────────────────────────────────────────────────────────────────────
// The Coverage class
// ──────────────────────────────────────────────────────────────────────────
class Coverage {
  constructor() {
    this.outDir = null;
    this._excludes = ['**/node_modules/**'];
    this._includes = [];
    this._sourceMaps = new Map(); // absPath → parsed map
    this._collected = null;       // merged result from collect()
    this._started = false;
  }

  /**
   * Start collecting coverage. Sets NODE_V8_COVERAGE and kicks off collection.
   * Note: for full cross-process coverage, NODE_V8_COVERAGE must be set
   * BEFORE Node launches. This method sets it on `process.env` so any
   * subprocess we spawn after this call will inherit it.
   */
  start(outDir) {
    if (!outDir) throw new Error('Coverage.start(outDir) requires an output directory');
    const abs = path.resolve(outDir);
    if (!fs.existsSync(abs)) fs.mkdirSync(abs, { recursive: true });
    this.outDir = abs;
    process.env.NODE_V8_COVERAGE = abs;
    // Begin in-process coverage — works even when NODE_V8_COVERAGE wasn't
    // set at startup, but the per-file granularity is slightly lower.
    try {
      v8.takeCoverage();
    } catch (_) { /* v8.takeCoverage only works when coverage is on; ignore */ }
    this._started = true;
    return this;
  }

  /**
   * Flush the currently-collected counters to disk. Safe to call multiple
   * times. After Node exits, an additional final file will be written
   * automatically by V8 (that's how NODE_V8_COVERAGE works).
   */
  stop() {
    try {
      v8.takeCoverage();
    } catch (_) { /* ignore — not fatal */ }
    try {
      if (typeof v8.stopCoverage === 'function') v8.stopCoverage();
    } catch (_) { /* ignore */ }
    this._started = false;
    return this;
  }

  /** Add exclude globs (merged with existing). */
  exclude(globs) {
    const arr = Array.isArray(globs) ? globs : [globs];
    for (const g of arr) if (typeof g === 'string' && g) this._excludes.push(g);
    return this;
  }

  /** Whitelist — if non-empty, only matching paths are reported. */
  includeOnly(globs) {
    const arr = Array.isArray(globs) ? globs : [globs];
    for (const g of arr) if (typeof g === 'string' && g) this._includes.push(g);
    return this;
  }

  /** Pre-load a source map for a file (or auto-discover via inline URL). */
  sourceMap(file) {
    if (!file) return this;
    const abs = path.resolve(file);
    const map = readInlineSourceMap(abs);
    if (map) this._sourceMaps.set(abs, map);
    return this;
  }

  /**
   * Read every coverage-*.json file out of outDir and merge them across
   * processes. Returns a per-file summary:
   *   { files: { absPath: FileCoverage }, totals: Totals }
   */
  collect() {
    if (!this.outDir) throw new Error('Coverage.collect() called before start()');
    const files = fs.existsSync(this.outDir) ? fs.readdirSync(this.outDir) : [];
    /** merged per-script: url → { ranges: BlockCoverage[] } */
    const merged = new Map();
    for (const entry of files) {
      if (!entry.startsWith('coverage-') || !entry.endsWith('.json')) continue;
      const full = path.join(this.outDir, entry);
      let raw;
      try {
        raw = JSON.parse(fs.readFileSync(full, 'utf8'));
      } catch (_) { continue; }
      const scripts = Array.isArray(raw && raw.result) ? raw.result : [];
      for (const sc of scripts) {
        if (!sc || !sc.url) continue;
        if (!merged.has(sc.url)) {
          merged.set(sc.url, { url: sc.url, functions: [] });
        }
        const cur = merged.get(sc.url);
        if (Array.isArray(sc.functions)) {
          // Merge counts — for identical ranges, sum; for new ranges, append.
          for (const fn of sc.functions) {
            const existing = cur.functions.find(
              (f) => f.functionName === fn.functionName &&
                     f.isBlockCoverage === fn.isBlockCoverage &&
                     sameRange(f.ranges && f.ranges[0], fn.ranges && fn.ranges[0])
            );
            if (existing) {
              for (let i = 0; i < fn.ranges.length; i += 1) {
                const er = existing.ranges[i];
                const nr = fn.ranges[i];
                if (er && nr && er.startOffset === nr.startOffset && er.endOffset === nr.endOffset) {
                  er.count = (er.count || 0) + (nr.count || 0);
                } else if (nr) {
                  existing.ranges.push({ ...nr });
                }
              }
            } else {
              cur.functions.push(JSON.parse(JSON.stringify(fn)));
            }
          }
        }
      }
    }

    // Resolve each file, compute per-line/per-branch/per-fn metrics.
    const fileReport = {};
    for (const [scriptUrl, script] of merged) {
      const absPath = this._urlToFile(scriptUrl);
      if (!absPath) continue;
      if (!this._shouldInclude(absPath)) continue;
      let src;
      try {
        src = fs.readFileSync(absPath, 'utf8');
      } catch (_) { continue; }

      // apply source map if the file is a generated .js next to a .ts
      let effectivePath = absPath;
      let effectiveSrc = src;
      if (!this._sourceMaps.has(absPath)) {
        const m = readInlineSourceMap(absPath);
        if (m) this._sourceMaps.set(absPath, m);
      }
      const map = this._sourceMaps.get(absPath);
      if (map && Array.isArray(map.sources) && map.sources.length) {
        const origRel = map.sources[0];
        const origAbs = path.resolve(path.dirname(absPath), origRel);
        if (fs.existsSync(origAbs)) {
          try {
            effectiveSrc = fs.readFileSync(origAbs, 'utf8');
            effectivePath = origAbs;
          } catch (_) { /* keep generated */ }
        }
      }

      const fc = this._computeFileCoverage(effectivePath, effectiveSrc, script, map);
      if (fc) fileReport[effectivePath] = fc;
    }

    const totals = summariseTotals(fileReport);
    this._collected = { files: fileReport, totals };
    return this._collected;
  }

  _urlToFile(u) {
    if (!u) return null;
    if (u.startsWith('file://')) {
      try { return url.fileURLToPath(u); } catch (_) { return null; }
    }
    if (path.isAbsolute(u)) return u;
    // node:internal, node_modules with no protocol — skip
    return null;
  }

  _shouldInclude(absPath) {
    const posix = toPosix(absPath);
    if (this._includes.length > 0) {
      if (!matchesAny(posix, this._includes)) return false;
    }
    if (matchesAny(posix, this._excludes)) return false;
    return true;
  }

  _computeFileCoverage(absPath, src, script, map) {
    const offsets = buildLineOffsets(src);
    const totalLines = countLines(src);

    // Build line hit map — for each line, track the minimum block count that
    // covers any part of it. A line is "covered" iff at least one byte of it
    // sits inside a range with count > 0.
    const lineHits = new Array(totalLines + 1).fill(null); // null = unknown
    const branches = []; // {line, taken: bool}[]
    const functions = []; // {name, line, covered: bool}[]

    // V8 range semantics: the first range of each function is the whole
    // function body; subsequent ranges are sub-blocks that OVERRIDE the
    // parent count for the bytes they cover. So for line resolution we
    // must apply ranges from outermost to innermost with an
    // "override by most-specific" rule, not max().
    for (const fn of script.functions || []) {
      const topRange = fn.ranges && fn.ranges[0];
      if (!topRange) continue;
      const fnStart = offsetToLineCol(offsets, topRange.startOffset);
      // Map to original if source map available
      let fnLine = fnStart.line;
      if (map) {
        const resolved = resolveWithMap(map, fnStart.line, fnStart.column);
        if (resolved) fnLine = resolved.origLine;
      }
      functions.push({
        name: fn.functionName || '(anonymous)',
        line: fnLine,
        covered: (topRange.count || 0) > 0,
      });

      // Walk ranges in order. Later ranges are strictly more specific
      // (V8 emits them in descending-size order per function), so we
      // override line hits for any line fully inside a later range.
      for (let i = 0; i < fn.ranges.length; i += 1) {
        const r = fn.ranges[i];
        overrideLineRange(lineHits, offsets, r.startOffset, r.endOffset, r.count || 0);
      }

      if (fn.isBlockCoverage && fn.ranges.length > 1) {
        for (let i = 1; i < fn.ranges.length; i += 1) {
          const r = fn.ranges[i];
          const s = offsetToLineCol(offsets, r.startOffset);
          let bLine = s.line;
          if (map) {
            const resolved = resolveWithMap(map, s.line, s.column);
            if (resolved) bLine = resolved.origLine;
          }
          branches.push({ line: bLine, taken: (r.count || 0) > 0 });
        }
      }
    }

    // Derive per-line coverage ignoring blank / comment-only lines.
    const lines = new Map();
    const srcLines = src.split(/\r?\n/);
    for (let i = 0; i < srcLines.length; i += 1) {
      const raw = srcLines[i];
      const trimmed = raw.trim();
      if (!trimmed) continue;
      if (trimmed.startsWith('//')) continue;
      if (trimmed.startsWith('/*') && trimmed.endsWith('*/')) continue;
      if (trimmed === '*/' || trimmed.startsWith('*')) continue;
      const lineNum = i + 1;
      const hit = lineHits[lineNum];
      // If no counter, treat as unexecuted (hit=0) — V8 only reports
      // ranges that were instrumented, so untouched lines show as 0.
      lines.set(lineNum, { hits: hit == null ? 0 : hit, src: raw });
    }

    const linesTotal = lines.size;
    let linesCovered = 0;
    for (const entry of lines.values()) if (entry.hits > 0) linesCovered += 1;

    const fnTotal = functions.length;
    const fnCovered = functions.filter((f) => f.covered).length;
    const brTotal = branches.length;
    const brCovered = branches.filter((b) => b.taken).length;

    return {
      path: absPath,
      src,
      lines,
      functions,
      branches,
      totals: {
        lines: { total: linesTotal, covered: linesCovered, pct: pct(linesCovered, linesTotal) },
        functions: { total: fnTotal, covered: fnCovered, pct: pct(fnCovered, fnTotal) },
        branches: { total: brTotal, covered: brCovered, pct: pct(brCovered, brTotal) },
        statements: { total: linesTotal, covered: linesCovered, pct: pct(linesCovered, linesTotal) },
      },
    };
  }

  /**
   * Produce a report in one of: 'lcov' | 'html' | 'json' | 'text' | 'junit'
   */
  report({ format, outPath } = {}) {
    if (!this._collected) this.collect();
    const r = this._collected;
    let content;
    switch (format) {
      case 'lcov':
        content = this._reportLcov(r);
        break;
      case 'html':
        content = this._reportHtml(r, outPath);
        break;
      case 'json':
        content = this._reportJson(r);
        break;
      case 'text':
        content = this._reportText(r);
        break;
      case 'junit':
        content = this._reportJunit(r);
        break;
      default:
        throw new Error('Coverage.report: unknown format ' + format);
    }
    if (outPath && format !== 'html') {
      fs.mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true });
      fs.writeFileSync(outPath, content, 'utf8');
    }
    return content;
  }

  _reportLcov(r) {
    const lines = [];
    for (const [file, fc] of Object.entries(r.files)) {
      lines.push('TN:');
      lines.push('SF:' + file);
      // Functions
      for (const fn of fc.functions) {
        lines.push('FN:' + fn.line + ',' + fn.name);
      }
      for (const fn of fc.functions) {
        lines.push('FNDA:' + (fn.covered ? 1 : 0) + ',' + fn.name);
      }
      lines.push('FNF:' + fc.functions.length);
      lines.push('FNH:' + fc.functions.filter((f) => f.covered).length);
      // Branches
      let brIdx = 0;
      for (const b of fc.branches) {
        lines.push('BRDA:' + b.line + ',0,' + (brIdx++) + ',' + (b.taken ? 1 : 0));
      }
      lines.push('BRF:' + fc.branches.length);
      lines.push('BRH:' + fc.branches.filter((b) => b.taken).length);
      // Lines
      for (const [ln, info] of fc.lines) {
        lines.push('DA:' + ln + ',' + info.hits);
      }
      lines.push('LF:' + fc.totals.lines.total);
      lines.push('LH:' + fc.totals.lines.covered);
      lines.push('end_of_record');
    }
    return lines.join('\n') + '\n';
  }

  _reportJson(r) {
    // Istanbul-ish JSON (compact, deterministic ordering)
    const out = {};
    const fileKeys = Object.keys(r.files).sort();
    for (const k of fileKeys) {
      const fc = r.files[k];
      const lineMap = {};
      for (const [ln, info] of [...fc.lines.entries()].sort((a, b) => a[0] - b[0])) {
        lineMap[ln] = info.hits;
      }
      out[k] = {
        path: k,
        statementMap: lineMap,
        fnMap: fc.functions.reduce((acc, fn, i) => {
          acc[i] = { name: fn.name, line: fn.line, covered: fn.covered };
          return acc;
        }, {}),
        branchMap: fc.branches.reduce((acc, br, i) => {
          acc[i] = { line: br.line, taken: br.taken };
          return acc;
        }, {}),
        summary: fc.totals,
      };
    }
    return JSON.stringify({ files: out, totals: r.totals }, null, 2);
  }

  _reportText(r) {
    const out = [];
    out.push('כיסוי קוד / Code coverage summary');
    out.push('-'.repeat(80));
    const header = pad('File', 42) + pad('% Lines', 10) + pad('% Fns', 9) + pad('% Brs', 9) + pad('Uncov', 10);
    out.push(header);
    out.push('-'.repeat(80));
    const files = Object.entries(r.files).sort((a, b) => a[1].totals.lines.pct - b[1].totals.lines.pct);
    for (const [file, fc] of files) {
      const rel = path.basename(file);
      const uncovered = [];
      for (const [ln, info] of fc.lines) if (info.hits === 0) uncovered.push(ln);
      out.push(
        pad(rel, 42) +
        pad(fc.totals.lines.pct.toFixed(1), 10) +
        pad(fc.totals.functions.pct.toFixed(1), 9) +
        pad(fc.totals.branches.pct.toFixed(1), 9) +
        pad(uncovered.slice(0, 4).join(',') + (uncovered.length > 4 ? '…' : ''), 10),
      );
    }
    out.push('-'.repeat(80));
    out.push(
      pad('TOTAL', 42) +
      pad(r.totals.lines.pct.toFixed(1), 10) +
      pad(r.totals.functions.pct.toFixed(1), 9) +
      pad(r.totals.branches.pct.toFixed(1), 9),
    );
    return out.join('\n') + '\n';
  }

  _reportJunit(r) {
    // One <testcase> per file, failing when line coverage < 50%.
    const escapedNow = new Date().toISOString();
    const cases = [];
    const totalTests = Object.keys(r.files).length;
    let failures = 0;
    for (const [file, fc] of Object.entries(r.files)) {
      const pct = fc.totals.lines.pct;
      const name = htmlEscape(path.basename(file));
      if (pct < 50) {
        failures += 1;
        cases.push(
          '    <testcase classname="coverage" name="' + name + '" time="0">' +
          '<failure message="line coverage ' + pct.toFixed(1) + '% below threshold">' +
          'File: ' + htmlEscape(file) + '\nLines: ' + fc.totals.lines.covered + '/' + fc.totals.lines.total +
          '</failure></testcase>',
        );
      } else {
        cases.push('    <testcase classname="coverage" name="' + name + '" time="0"/>');
      }
    }
    return (
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<testsuite name="code-coverage" tests="' + totalTests + '" failures="' + failures + '" timestamp="' + escapedNow + '">\n' +
      cases.join('\n') + '\n' +
      '</testsuite>\n'
    );
  }

  _reportHtml(r, outPath) {
    // Always emits a directory. outPath is the directory; index.html + one
    // HTML per file go inside. Returns the directory path it wrote to.
    const dir = outPath ? path.resolve(outPath) : path.join(this.outDir || process.cwd(), 'html');
    fs.mkdirSync(dir, { recursive: true });

    const STYLE = [
      'body{font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Arial,sans-serif;',
      'background:#0b1220;color:#e5e7eb;margin:0;padding:24px;}',
      'h1{font-size:22px;margin:0 0 4px;}h2{font-size:16px;color:#94a3b8;margin:0 0 16px;}',
      'table{width:100%;border-collapse:collapse;background:#111827;border-radius:8px;overflow:hidden;}',
      'th,td{padding:8px 12px;text-align:left;border-bottom:1px solid #1f2937;font-size:13px;}',
      'th{background:#1f2937;cursor:default;color:#cbd5e1;}',
      'tr:hover td{background:#1e293b;}',
      'a{color:#60a5fa;text-decoration:none;}a:hover{text-decoration:underline;}',
      '.pct-good{color:#22c55e;}.pct-mid{color:#eab308;}.pct-bad{color:#ef4444;}',
      '.source{background:#0f172a;border-radius:8px;padding:0;overflow:auto;}',
      '.source pre{margin:0;padding:0;}',
      '.source .line{display:flex;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px;line-height:1.4;}',
      '.source .ln{flex:0 0 60px;text-align:right;padding:0 8px;color:#475569;user-select:none;}',
      '.source .hits{flex:0 0 60px;text-align:right;padding:0 8px;color:#94a3b8;user-select:none;}',
      '.source .code{flex:1;padding:0 8px;white-space:pre;color:#e5e7eb;}',
      '.source .miss{background:#3f1d1d;}',
      '.source .miss .ln,.source .miss .hits{background:#7f1d1d;color:#fecaca;}',
      '.source .hit{background:#0c2316;}',
      '.summary-bar{display:flex;gap:16px;margin-bottom:16px;flex-wrap:wrap;}',
      '.card{background:#111827;padding:12px 16px;border-radius:8px;min-width:140px;}',
      '.card .label{font-size:11px;color:#94a3b8;text-transform:uppercase;}',
      '.card .value{font-size:22px;font-weight:600;margin-top:4px;}',
      '[dir=rtl] .source .ln, [dir=rtl] .source .hits{text-align:left;}',
      'footer{margin-top:24px;color:#64748b;font-size:11px;text-align:center;}',
    ].join('');

    // index.html
    const sorted = Object.entries(r.files).sort(
      (a, b) => a[1].totals.lines.pct - b[1].totals.lines.pct,
    );
    let rows = '';
    const commonRoot = longestCommonPath(Object.keys(r.files));
    for (const [file, fc] of sorted) {
      const relDisplay = commonRoot ? file.slice(commonRoot.length).replace(/^[/\\]/, '') : path.basename(file);
      const fnHtml = fileToHtmlName(file);
      const pLines = fc.totals.lines.pct;
      const pFns = fc.totals.functions.pct;
      const pBrs = fc.totals.branches.pct;
      rows += '<tr>' +
        '<td><a href="' + htmlEscape(fnHtml) + '">' + htmlEscape(relDisplay) + '</a></td>' +
        '<td>' + miniBarSVG(pLines) + ' <span class="' + cls(pLines) + '">' + pLines.toFixed(1) + '%</span></td>' +
        '<td>' + fc.totals.lines.covered + '/' + fc.totals.lines.total + '</td>' +
        '<td><span class="' + cls(pFns) + '">' + pFns.toFixed(1) + '%</span></td>' +
        '<td><span class="' + cls(pBrs) + '">' + pBrs.toFixed(1) + '%</span></td>' +
        '</tr>';
    }

    const indexHtml =
      '<!DOCTYPE html><html lang="en" dir="ltr"><head><meta charset="utf-8"/>' +
      '<title>Code Coverage — כיסוי קוד</title><style>' + STYLE + '</style></head><body>' +
      '<h1>\u05DB\u05D9\u05E1\u05D5\u05D9 \u05E7\u05D5\u05D3 \u00b7 Code Coverage</h1>' +
      '<h2>Techno-Kol Uzi mega-ERP \u00b7 Agent X-90</h2>' +
      '<div class="summary-bar">' +
      card('Lines / \u05E9\u05D5\u05E8\u05D5\u05EA', r.totals.lines.pct.toFixed(1) + '%', cls(r.totals.lines.pct)) +
      card('Functions / \u05E4\u05D5\u05E0\u05E7\u05E6\u05D9\u05D5\u05EA', r.totals.functions.pct.toFixed(1) + '%', cls(r.totals.functions.pct)) +
      card('Branches / \u05E2\u05E0\u05E4\u05D9\u05DD', r.totals.branches.pct.toFixed(1) + '%', cls(r.totals.branches.pct)) +
      card('Statements / \u05D4\u05E6\u05D4\u05E8\u05D5\u05EA', r.totals.statements.pct.toFixed(1) + '%', cls(r.totals.statements.pct)) +
      '</div>' +
      '<table><thead><tr><th>File / \u05E7\u05D5\u05D1\u05E5</th><th>Lines</th><th>Covered/Total</th><th>Fns</th><th>Brs</th></tr></thead><tbody>' +
      rows + '</tbody></table>' +
      '<footer>Generated ' + new Date().toISOString() + ' \u00b7 zero-dep V8 coverage</footer>' +
      '</body></html>';
    fs.writeFileSync(path.join(dir, 'index.html'), indexHtml, 'utf8');

    // per-file pages
    for (const [file, fc] of Object.entries(r.files)) {
      const htmlName = fileToHtmlName(file);
      const srcLines = fc.src.split(/\r?\n/);
      let body = '';
      for (let i = 0; i < srcLines.length; i += 1) {
        const ln = i + 1;
        const info = fc.lines.get(ln);
        let cls2 = '';
        let hits = '';
        if (info) {
          cls2 = info.hits > 0 ? 'hit' : 'miss';
          hits = String(info.hits);
        }
        body +=
          '<div class="line ' + cls2 + '">' +
          '<span class="ln">' + ln + '</span>' +
          '<span class="hits">' + hits + '</span>' +
          '<span class="code">' + htmlEscape(srcLines[i]) + '</span>' +
          '</div>';
      }
      const page =
        '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/>' +
        '<title>' + htmlEscape(path.basename(file)) + ' — Coverage</title><style>' + STYLE + '</style></head><body>' +
        '<h1>' + htmlEscape(file) + '</h1>' +
        '<h2>\u05DB\u05D9\u05E1\u05D5\u05D9 \u05E7\u05D5\u05D3 \u00b7 Code Coverage \u00b7 <a href="index.html">\u21A9 back</a></h2>' +
        '<div class="summary-bar">' +
        card('Lines', fc.totals.lines.pct.toFixed(1) + '%', cls(fc.totals.lines.pct)) +
        card('Functions', fc.totals.functions.pct.toFixed(1) + '%', cls(fc.totals.functions.pct)) +
        card('Branches', fc.totals.branches.pct.toFixed(1) + '%', cls(fc.totals.branches.pct)) +
        '</div>' +
        '<div class="source"><pre>' + body + '</pre></div>' +
        '</body></html>';
      fs.writeFileSync(path.join(dir, htmlName), page, 'utf8');
    }
    return dir;
  }

  /**
   * Enforce minimum thresholds. Returns { ok, failures }.
   * Throws if ok === false and opts.strict is true.
   */
  thresholds(config, opts) {
    if (!this._collected) this.collect();
    const cfg = config || {};
    const t = this._collected.totals;
    const failures = [];
    for (const key of ['lines', 'branches', 'functions', 'statements']) {
      if (cfg[key] != null && t[key].pct < cfg[key]) {
        failures.push({
          metric: key,
          required: cfg[key],
          actual: t[key].pct,
          label_en: key + ' coverage below required threshold',
          label_he: 'כיסוי ' + heLabel(key) + ' מתחת לסף הנדרש',
        });
      }
    }
    const result = { ok: failures.length === 0, failures, totals: t };
    if (!result.ok && opts && opts.strict) {
      const msg = failures.map((f) => f.metric + ':' + f.actual.toFixed(1) + '<' + f.required).join(', ');
      const err = new Error('Coverage thresholds not met: ' + msg);
      err.coverage = result;
      throw err;
    }
    return result;
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────
function pct(covered, total) {
  if (!total) return 100;
  return (covered / total) * 100;
}
function pad(s, n) {
  const str = String(s);
  if (str.length >= n) return str.slice(0, n - 1) + ' ';
  return str + ' '.repeat(n - str.length);
}
function cls(p) {
  if (p >= 80) return 'pct-good';
  if (p >= 60) return 'pct-mid';
  return 'pct-bad';
}
function card(label, value, klass) {
  return '<div class="card"><div class="label">' + label + '</div><div class="value ' + klass + '">' + value + '</div></div>';
}
function heLabel(key) {
  return ({
    lines: 'שורות',
    branches: 'ענפים',
    functions: 'פונקציות',
    statements: 'הצהרות',
  })[key] || key;
}
function sameRange(a, b) {
  if (!a || !b) return false;
  return a.startOffset === b.startOffset && a.endOffset === b.endOffset;
}
function markLineRange(lineHits, offsets, start, end, count) {
  const s = offsetToLineCol(offsets, start).line;
  const e = offsetToLineCol(offsets, Math.max(start, end - 1)).line;
  for (let L = s; L <= e; L += 1) {
    const cur = lineHits[L];
    if (cur == null) lineHits[L] = count;
    else if (count > cur) lineHits[L] = count; // pick max — any hit counts
  }
}
// Like markLineRange but unconditionally overrides, used to apply
// progressively-more-specific V8 BlockCoverage ranges.
function overrideLineRange(lineHits, offsets, start, end, count) {
  const s = offsetToLineCol(offsets, start).line;
  const e = offsetToLineCol(offsets, Math.max(start, end - 1)).line;
  for (let L = s; L <= e; L += 1) {
    lineHits[L] = count;
  }
}
function summariseTotals(fileReport) {
  const t = {
    lines: { total: 0, covered: 0, pct: 100 },
    functions: { total: 0, covered: 0, pct: 100 },
    branches: { total: 0, covered: 0, pct: 100 },
    statements: { total: 0, covered: 0, pct: 100 },
  };
  for (const fc of Object.values(fileReport)) {
    for (const k of ['lines', 'functions', 'branches', 'statements']) {
      t[k].total += fc.totals[k].total;
      t[k].covered += fc.totals[k].covered;
    }
  }
  for (const k of ['lines', 'functions', 'branches', 'statements']) {
    t[k].pct = pct(t[k].covered, t[k].total);
  }
  return t;
}
function fileToHtmlName(file) {
  return (
    toPosix(file)
      .replace(/[^a-zA-Z0-9.-]+/g, '_')
      .replace(/^_+/, '')
      .slice(-120) + '.html'
  );
}
function longestCommonPath(paths) {
  if (!paths.length) return '';
  const parts = paths.map((p) => toPosix(p).split('/'));
  const first = parts[0];
  let i = 0;
  while (i < first.length) {
    const seg = first[i];
    if (!parts.every((p) => p[i] === seg)) break;
    i += 1;
  }
  return parts[0].slice(0, i).join('/');
}

module.exports = { Coverage };
module.exports.Coverage = Coverage;
module.exports._internal = {
  globToRegExp,
  vlqDecode,
  buildLineOffsets,
  offsetToLineCol,
  miniBarSVG,
  htmlEscape,
  longestCommonPath,
  fileToHtmlName,
};
